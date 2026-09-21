/**
 * AFTER-side benchmark for the stores.svelte.ts module-editor-keystroke
 * effect narrowing: measures `trackModuleUpdateDeps()`
 * (src/ts/process/moduleUpdateDeps.ts) over the SAME module-heavy fixture
 * svelte-proxy-bench.harness.ts already uses for the BEFORE side
 * (`$state.snapshot(modules)`), so the two numbers are legitimately
 * comparable rather than measured under different conditions.
 *
 * Reuses buildTierDatabase('module-heavy') from ./build.ts unmodified — no
 * new fixture generation, per the task's explicit instruction that
 * identical input is the whole point. The only fixture mutation here is
 * enrichModulesForTracking(), which fills in the three fields build.ts's
 * makeModule() never sets (namespace, hideIcon, backgroundEmbedding) so
 * every field trackModuleUpdateDeps() reads lands on a real value, not
 * `undefined` — see track-module-deps-bench.svelte.ts's header for why.
 * This does not change module count or the heavy fields (lorebook, regex,
 * trigger, assets, cjs) that make module-heavy "heavy" in the first place.
 *
 * Methodology mirrors svelte-proxy-bench.harness.ts exactly: 3 discarded
 * warmup + 15 measured, median + floor (min) reported. Run this file three
 * times as three independent PROCESSES (not three loops in one process) —
 * once per condition (dev / production) — as the README's reference
 * measurements did, then take the median of the three per-run medians as
 * the headline figure, floor alongside as the min of the three per-run
 * mins. See Agents/Tools/README.md's "Reference measurements" section for
 * the exact commands and the dev/production forcing mechanism (NODE_ENV).
 *
 * `trackModuleUpdateDeps()` reads only 4 primitive fields per module via an
 * indexed loop, so a single call over 52 modules may be fast enough that
 * per-call performance.now() deltas become noisy or floor-clamped. To
 * guard against reporting a number that resolution, not the code, produced,
 * each measured sample here is itself a BATCH of TRACK_BATCH_SIZE calls,
 * timed once and divided by the batch size — never a single raw call.
 * (`$state.snapshot()` is NOT batched: it is slow enough on its own,
 * ~29-34ms/call per the README, that a single call per sample is already
 * well above timer resolution, and batching 15 x N calls at that cost would
 * make the run needlessly slow without improving precision.)
 *
 * Same caveat as svelte-proxy-bench.harness.ts, carried forward unchanged:
 * this runs against a standalone `$state({db:...})` container, not the
 * real DBState wired into the effect graph. Raw primitive cost only; see
 * track-module-deps-bench.svelte.ts's header for why.
 */
import { describe, test, expect } from 'vitest'
import { buildTierDatabase, SEED } from './build'
import { enrichModulesForTracking, makeProxiedDbState, runTrackModuleUpdateDeps, snapshotModules } from './track-module-deps-bench.svelte'

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15
const TRACK_BATCH_SIZE = 500 // trackModuleUpdateDeps() calls per timed sample; see file header.

/** Same shape/semantics as svelte-proxy-bench.harness.ts's timeit(), plus an optional per-sample batch divisor. */
function timeit(fn: () => unknown, batch = 1): { minMs: number; medianMs: number; samples: number[] } {
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
        for (let b = 0; b < batch; b++) fn()
    }
    const samples: number[] = []
    for (let i = 0; i < MEASURED_ITERATIONS; i++) {
        const start = performance.now()
        for (let b = 0; b < batch; b++) fn()
        samples.push((performance.now() - start) / batch)
    }
    return { minMs: Math.min(...samples), medianMs: median(samples), samples }
}

const FRAME_BUDGET_MS = 1000 / 60 // 16.7ms

describe('trackModuleUpdateDeps() vs $state.snapshot(modules) — module-heavy tier, same fixture, same process', () => {
    test('measures AFTER (trackModuleUpdateDeps) and BEFORE (snapshot) over the identical module-heavy fixture', () => {
        const { database, stats } = buildTierDatabase('module-heavy')
        const modules = database.modules as Record<string, unknown>[]
        enrichModulesForTracking(modules)

        const moduleBytes = new TextEncoder().encode(JSON.stringify(modules)).byteLength

        const state = makeProxiedDbState(database)

        // BEFORE, measured fresh in THIS session (not copied from the README).
        const before = timeit(() => snapshotModules(state))
        // AFTER, batched per the file header's rationale.
        const after = timeit(() => runTrackModuleUpdateDeps(state), TRACK_BATCH_SIZE)

        const oldPerKeystroke = 2 * before.medianMs // two snapshot(modules) call sites, pre-change
        const newPerKeystroke = before.medianMs + after.medianMs // dbChangeEffects.svelte.ts:34's snapshot is untouched; only ONE of the two calls became trackModuleUpdateDeps()
        const speedupRatio = oldPerKeystroke / newPerKeystroke
        const savedMs = oldPerKeystroke - newPerKeystroke

        const nodeEnv = process.env.NODE_ENV ?? '(unset)'
        const summaryHeader =
            `seed=${SEED} moduleCount=${stats.moduleCount} moduleBytes=${moduleBytes} ` +
            `warmup=${WARMUP_ITERATIONS} measuredIterations=${MEASURED_ITERATIONS} trackBatchSize=${TRACK_BATCH_SIZE} NODE_ENV=${nodeEnv}`

        console.log(
            [
                '',
                '=== trackModuleUpdateDeps() AFTER-side benchmark (module-heavy tier) ===',
                summaryHeader,
                `  snapshot(modules)        BEFORE: min=${before.minMs.toFixed(3)}ms median=${before.medianMs.toFixed(3)}ms (measured fresh this run)`,
                `  trackModuleUpdateDeps()  AFTER:  min=${after.minMs.toFixed(3)}ms median=${after.medianMs.toFixed(3)}ms (per-call, batch-divided)`,
                `  per-keystroke OLD (snapshot + snapshot):              ${oldPerKeystroke.toFixed(3)}ms`,
                `  per-keystroke NEW (snapshot + trackModuleUpdateDeps): ${newPerKeystroke.toFixed(3)}ms` +
                    `  [dbChangeEffects.svelte.ts:34's snapshot is untouched -- only ONE of the two calls changed]`,
                `  speedup ratio: ${speedupRatio.toFixed(2)}x   saved: ${savedMs.toFixed(3)}ms/keystroke`,
                `  vs ${FRAME_BUDGET_MS.toFixed(1)}ms frame budget -> new per-keystroke is ` +
                    `${newPerKeystroke > FRAME_BUDGET_MS ? 'STILL OVER budget' : 'within budget'} ` +
                    `(${((newPerKeystroke / FRAME_BUDGET_MS) * 100).toFixed(0)}% of budget)`,
                '=== end ===',
                '',
            ].join('\n'),
        )

        // Sanity, not a perf gate: both calls must actually traverse the whole array.
        expect((snapshotModules(state) as unknown[]).length).toBe(modules.length)
        expect(() => runTrackModuleUpdateDeps(state)).not.toThrow()
    })
})
