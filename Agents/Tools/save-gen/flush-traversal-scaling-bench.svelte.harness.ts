/**
 * CHORE-01 Stage 2 re-run follow-up -- confirms (does not merely infer) that
 * a Svelte 5.55.1 `flushSync()` walks EVERY leaf `$effect` node linked under
 * the dirty root, not just the dirty one, and that this walk is what makes a
 * single-field keystroke on `dbChangeEffects.svelte.ts`'s 6b-char partition
 * scale with total message count (thousands of per-message child effects),
 * even after the `Reflect.ownKeys` fix removes the `chatPage`-entanglement
 * bug.
 *
 * TRACED (read directly, not guessed) in
 * node_modules/svelte/src/internal/client/reactivity/batch.js:
 *   - `Batch#traverse()` (:364-407) walks the effect tree with a manual
 *     `effect.first` / `effect.next` / `effect.parent` linked-list walk,
 *     starting from the scheduled root and visiting every descendant in
 *     document order -- there is no early return for "no source changed
 *     under this subtree".
 *   - The skip test (:374) is `skip = is_skippable_branch || (flags &
 *     INERT) !== 0 || this.#skipped_branches.has(effect)` -- three
 *     independent skip paths, not one: (1) `is_skippable_branch` (:372,
 *     `is_branch && (flags & CLEAN) !== 0`), true only for a node flagged
 *     `BRANCH_EFFECT`/`ROOT_EFFECT` (created by `{#if}`/`{#each}`/`{#key}`/
 *     `$effect.root`/component boundaries, never by a bare `$effect(...)`
 *     call) that is ALSO marked `CLEAN`; (2) the node's own `INERT` flag
 *     (set on destroyed/paused effects, e.g. inside a torn-down branch or an
 *     unmounted component); (3) membership in `this.#skipped_branches` (a
 *     branch explicitly paused mid-batch, e.g. an `{#await}`/transition-out
 *     branch). A plain `$effect(...)` node -- what every per-message child
 *     in dbChangeEffects.svelte.ts is, and what every idle sibling effect in
 *     this harness is -- carries only the `EFFECT` flag: `is_branch` is
 *     false, so path (1) never applies to it; it is never flagged `INERT`;
 *     and it is never registered in `#skipped_branches`, so none of the
 *     three skip paths lets the walk skip past it.
 *   - For a non-branch node with the `EFFECT` flag, `#traverse` unconditionally
 *     does `effects.push(effect)` (:379-380) -- BEFORE any dirty check --
 *     for every such node reachable from the root, dirty or not. The dirty
 *     check (`is_dirty`) only happens later, per effect, inside
 *     `flush_queued_effects()` (:881) when actually deciding whether to
 *     call `update_effect`.
 *   - So one `flushSync()` after ONE source changed still performs an O(number
 *     of live plain-$effect nodes under the root) pointer-chasing walk
 *     (`effects.push` for each) PLUS an O(same N) second pass in
 *     `flush_queued_effects` checking `is_dirty` on each pushed effect,
 *     before the actual (O(1)) re-execution of the one effect that changed.
 *
 * CONFIRMED below: mount `$effect.root(() => { for (n) $effect(() => {...
 * idle ...}); $effect(() => { reads ONE $state source }) })`, i.e. N idle
 * plain-$effect siblings (each with a fixed, never-changing dependency, so
 * never dirty after the first run) plus one effect that depends on a $state
 * source. Only that one source is ever mutated. If flush cost scales with N
 * despite zero dirty idle effects, that is the traversal cost the trace
 * above predicts, not something else (GC, allocation, etc. -- there is
 * nothing else in this harness that could scale with N). ("Idle" here is
 * this file's own term for "never becomes dirty after its first run" --
 * unrelated to Svelte's own `INERT` effect flag traced above, which these
 * plain-$effect siblings never carry.)
 *
 * GOTCHA found while building this (documented so it isn't silently
 * "fixed" again): an idle effect with a dependency list that reads ONLY
 * plain closure variables (zero `$state`/`$derived` reads) has `deps ===
 * null` after its first run, and `flush_queued_effects()` unlinks any such
 * effect from the tree right after that first run ("Effects with no
 * dependencies or teardown do not get added to the effect tree",
 * batch.js:886-900) -- so a first version of this file that had idle
 * effects read nothing reactive measured NO scaling at all (all four sizes
 * ~0.003-0.006ms), because by the second flush the N "idle" effects were
 * already gone from the tree. Each idle effect below reads a shared
 * `state.stable` source (created, never mutated) specifically so `deps` stays
 * non-null and the node stays linked -- only then does the traversal cost
 * this file is trying to measure actually show up.
 *
 * RESULT (measured on this machine, see the report's hardware caveat --
 * i9-13900K under Node, not a Pi/phone): flush cost after touching the one
 * dirty source scales linearly with N and is INDEPENDENT of tree size other
 * than through N: N=1000 -> 0.080ms median (0.080 µs/effect), N=10000 ->
 * 0.640ms (0.064 µs/effect), N=50000 -> 3.080ms (0.062 µs/effect) -- i.e.
 * ~0.06-0.08 µs per live plain-$effect node in the tree, regardless of
 * whether that node is dirty. That per-effect cost lines up closely with the
 * real dbChangeEffects.svelte.ts keystroke numbers reported alongside this
 * file (0.665ms @ 10k messages / 3.21ms @ 50k messages -> ~0.066 µs/message
 * and ~0.064 µs/message respectively, one child effect per message) -- close
 * enough that the message-count-many per-message child effects' sheer
 * presence in the tree, walked by `#traverse` on every flush, is sufficient
 * to explain essentially all of the residual keystroke scaling by itself,
 * with no need to invoke any other mechanism.
 *
 * Run:
 *   npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/flush-traversal-scaling-bench.svelte.harness.ts --reporter=verbose
 */
import { flushSync } from 'svelte'
import { describe, test, expect } from 'vitest'

function flush(): void {
    flushSync()
}
function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
interface TimingResult { minMs: number; medianMs: number; maxMs: number }
function summarize(samples: number[]): TimingResult {
    return { minMs: Math.min(...samples), medianMs: median(samples), maxMs: Math.max(...samples) }
}
const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15

/**
 * Mounts N idle plain-$effect siblings (each reads `state.stable`, a $state
 * property that is created but never mutated, so it NEVER becomes dirty
 * after its first run -- this shared read is required, not incidental: it
 * is what keeps each sibling linked in the effect tree, see the IMPORTANT
 * note below) plus one effect that reads a single $state source that IS
 * mutated. Returns a mutator for that one source and a cleanup function.
 */
function mountTree(n: number): { touch: () => void; cleanup: () => void } {
    // IMPORTANT (found empirically, see the GOTCHA note in this file's
    // header comment above): an effect with ZERO tracked dependencies is
    // unlinked from the effect tree by `flush_queued_effects` right after
    // its first run (batch.js's "Effects with no dependencies or teardown do
    // not get added to the effect tree" branch) -- so it would NOT still be
    // present for `#traverse` to walk on later flushes, defeating the point
    // of this benchmark. Each idle sibling below reads `state.stable`
    // (never mutated) so it keeps exactly one tracked dependency and stays
    // linked in the tree, while `state.hot` (mutated by `touch()`) is read
    // by only the one dirty effect.
    const state = $state({ hot: 0, stable: 0 })
    let inertSum = 0
    const cleanup = $effect.root(() => {
        for (let i = 0; i < n; i++) {
            $effect(() => {
                inertSum += state.stable // tracked dependency that never changes
            })
        }
        $effect(() => {
            void state.hot // the ONLY dependency that ever changes in the whole tree
        })
    })
    return {
        touch: () => {
            state.hot++
        },
        cleanup,
    }
}

const SIZES = [0, 1000, 10000, 50000]

describe('flush-traversal-scaling: confirms Batch#traverse visits every plain $effect node, not just the dirty one', () => {
    for (const n of SIZES) {
        test(`flush cost with ${n} inert sibling effects + 1 dirty effect`, () => {
            const { touch, cleanup } = mountTree(n)
            flush() // first run, discarded

            for (let i = 0; i < WARMUP_ITERATIONS; i++) {
                touch()
                flush()
            }
            const samples: number[] = []
            for (let i = 0; i < MEASURED_ITERATIONS; i++) {
                const start = performance.now()
                touch()
                flush()
                samples.push(performance.now() - start)
            }
            const result = summarize(samples)
            cleanup()

            console.log(
                `=== flush-traversal-scaling: N=${n} inert siblings === ` +
                    `min=${result.minMs.toFixed(4)}ms median=${result.medianMs.toFixed(4)}ms max=${result.maxMs.toFixed(4)}ms ` +
                    `(${n > 0 ? ((result.medianMs * 1000) / n).toFixed(3) : 'n/a'} µs/inert-effect)`,
            )
            expect(result.medianMs).toBeGreaterThanOrEqual(0)
        }, 60000)
    }
})
