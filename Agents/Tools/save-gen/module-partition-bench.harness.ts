/**
 * Partition-vs-status-quo decision measurement for the module-editor
 * keystroke cost (see Agents/Tools/README.md's reference measurements and
 * Stage A results for the baseline this extends).
 *
 * THE QUESTION: dbChangeEffects.svelte.ts:33-38 snapshots the WHOLE
 * `modules` array on a single leaf write. The proposed "partition" fix
 * replaces that with an outer `$effect` over array shape plus one child
 * `$effect` PER ELEMENT that deep-reads only its own module. Steady-state,
 * a keystroke then re-runs ONE child effect (one module's snapshot), not
 * all 52. This harness measures whether that one-module cost is cheap
 * enough (~1-5ms) to land the partition inside the 16.7ms frame budget, or
 * whether it is itself too expensive (~10ms+) for partitioning alone to
 * solve the problem — and separately, what the partition's cost is when
 * the array SHAPE changes (import/delete/replace), which re-runs every
 * child effect and sums to something that should be compared back against
 * the single whole-array walk it replaces.
 *
 * Four measured conditions, all against the SAME seed-1337 module-heavy
 * fixture (52 modules / 7.27MB) buildTierDatabase() already produces,
 * unmodified — no new fixture generation:
 *   1. snapshotWholeModulesArray  — the CURRENT baseline. Must reproduce
 *      ~29.18ms production / ~33.9ms dev per Stage A's numbers, or
 *      something has drifted and the rest of this file's numbers are not
 *      trustworthy (checked with a loud console assertion, not a hard
 *      `expect` — a few percent of run-to-run machine noise is expected
 *      and should not fail the suite, but an order-of-magnitude drift
 *      should be impossible to miss in the output).
 *   2. snapshotOneModule(largest) — worst-case realistic partition
 *      steady-state cost: the module being edited is likely one of the
 *      big ones.
 *   3. snapshotOneModule(median)  — typical-case partition steady-state
 *      cost.
 *   4. snapshotAllModulesIndividually — the partition's array-SHAPE-change
 *      cost: one pass, one $state.snapshot() call per module, all 52,
 *      timed as a single operation per sample (directly comparable to
 *      condition 1, which is also one operation per sample).
 *
 * Methodology mirrors svelte-proxy-bench.harness.ts / track-module-deps-
 * bench.harness.ts exactly: 3 discarded warmup + 15 measured, median +
 * floor (min) reported. Conditions 1, 2 and 4 are NOT batched — a single
 * call is already well above timer resolution for all three (whole-array
 * ~29ms, largest module ~4-5ms per an exploratory probe, and a 52-call
 * pass is necessarily >= the largest single module's cost). Condition 3
 * (median module) IS batched, MEDIAN_BATCH_SIZE calls per timed sample,
 * because an exploratory probe put a single median-module call at
 * ~0.2-0.3ms — close enough to performance.now() resolution that an
 * unbatched number would not be defensible, mirroring
 * track-module-deps-bench.harness.ts's rationale for batching
 * trackModuleUpdateDeps().
 *
 * Run this file three times as three independent PROCESSES (not three
 * loops in one process) per condition (dev / production), exactly as the
 * README's reference measurements and Stage A did, then take the median of
 * the three per-run medians as the headline figure and the min of the
 * three per-run mins as the floor. Production is forced with
 * `NODE_ENV=production` in front of the command — a `resolve.conditions`
 * override does NOT work, because Vite injects its own
 * `development`/`production` condition ahead of custom ones based on
 * NODE_ENV. See Agents/Tools/README.md.
 *
 *   NODE_ENV=production npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/module-partition-bench.harness.ts --reporter=verbose
 *
 * Same standalone-container caveat as every other bench in this directory:
 * this runs against our own `$state({db:...})` container, not the real
 * DBState wired into the effect graph. Raw snapshot cost only; the real
 * per-effect-run figure is this or higher, never lower.
 *
 * This file does not propose or apply any application-code change. It only
 * measures.
 */
import { describe, test, expect } from 'vitest'
import { buildTierDatabase, SEED } from './build'
import {
    makeProxiedDbState,
    snapshotAllModulesIndividually,
    snapshotOneModule,
    snapshotWholeModulesArray,
} from './module-partition-bench.svelte'

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15
const MEDIAN_BATCH_SIZE = 500 // see file header: a single median-module snapshot is close to timer resolution.

/** Same shape/semantics as the sibling benches' timeit(), plus an optional per-sample batch divisor. */
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

/** Reference median (production) from Stage A / README, used only for a loud drift check — not a hard gate. */
const REFERENCE_WHOLE_ARRAY_PRODUCTION_MS = 29.18
const DRIFT_WARN_RATIO = 1.5 // more than 50% off from the reference is "loud", not machine noise.

describe('Partition-vs-status-quo module-snapshot cost — module-heavy tier, same fixture', () => {
    test('measures whole-array baseline, single-module (largest/median), and all-modules-individually', () => {
        const { database, stats } = buildTierDatabase('module-heavy')
        const modules = database.modules as Record<string, unknown>[]

        // --- Module size distribution (item 5): largest / median / smallest, and what dominates the big ones. ---
        const sizeInfo = modules.map((m, i) => {
            const bytes = new TextEncoder().encode(JSON.stringify(m)).byteLength
            const cjsBytes = typeof m.cjs === 'string' ? new TextEncoder().encode(m.cjs).byteLength : 0
            const lorebookArr = Array.isArray(m.lorebook) ? (m.lorebook as unknown[]) : []
            const lorebookBytes = new TextEncoder().encode(JSON.stringify(lorebookArr)).byteLength
            return { index: i, name: String(m.name), bytes, cjsBytes, lorebookBytes, lorebookCount: lorebookArr.length }
        })
        const byBytes = [...sizeInfo].sort((a, b) => a.bytes - b.bytes)
        const smallest = byBytes[0]
        const largest = byBytes[byBytes.length - 1]
        const medianEntry = byBytes[Math.floor(byBytes.length / 2)]
        const totalModuleBytes = sizeInfo.reduce((a, s) => a + s.bytes, 0)

        const state = makeProxiedDbState(database)

        // --- Condition 1: baseline, whole array (dbChangeEffects.svelte.ts:33-38's actual call). ---
        const wholeArray = timeit(() => snapshotWholeModulesArray(state))

        // --- Condition 2: partition steady-state, worst realistic case (largest module). ---
        const largestModule = timeit(() => snapshotOneModule(state, largest.index))

        // --- Condition 3: partition steady-state, typical case (median module). Batched — see header. ---
        const medianModule = timeit(() => snapshotOneModule(state, medianEntry.index), MEDIAN_BATCH_SIZE)

        // --- Condition 4: partition array-shape-change cost, one pass over all 52 elements. ---
        const allIndividually = timeit(() => snapshotAllModulesIndividually(state))

        const nodeEnv = process.env.NODE_ENV ?? '(unset)'
        const isProduction = nodeEnv === 'production'

        // Loud (non-fatal) drift check against the published reference, production only.
        if (isProduction) {
            const ratio = wholeArray.medianMs / REFERENCE_WHOLE_ARRAY_PRODUCTION_MS
            if (ratio > DRIFT_WARN_RATIO || ratio < 1 / DRIFT_WARN_RATIO) {
                console.warn(
                    `\n!!! DRIFT WARNING: whole-array production median ${wholeArray.medianMs.toFixed(3)}ms is ` +
                        `${ratio.toFixed(2)}x the README/Stage A reference of ${REFERENCE_WHOLE_ARRAY_PRODUCTION_MS}ms. ` +
                        `Something has changed since that measurement was taken — treat the rest of this run's ` +
                        `numbers as UNTRUSTWORTHY until this is explained.\n`,
                )
            }
        }

        // NOTE on this formula, corrected from an earlier draft that double-counted:
        // Stage A (see README) already replaced the OTHER whole-array snapshot call site
        // (stores.svelte.ts) with trackModuleUpdateDeps(), measured there at ~0.03ms
        // production -- negligible next to either term below. dbChangeEffects.svelte.ts:33-38
        // is the ONLY surviving whole-array snapshot call site today, so condition 1's median
        // (wholeArray) IS the current per-keystroke cost, not half of it, and is not added a
        // second time when computing the partitioned AFTER figure.
        const perKeystrokeBefore = wholeArray.medianMs // current code: dbChangeEffects is the only surviving whole-array call site (Stage A already fixed the other one)
        const perKeystrokeAfterPartitionLargest = largestModule.medianMs // partition replaces dbChangeEffects' whole-array read with a one-module read
        const perKeystrokeAfterPartitionMedian = medianModule.medianMs
        const shapeChangeVsBaselineRatio = allIndividually.medianMs / wholeArray.medianMs

        console.log(
            [
                '',
                '=== module-partition-bench: partition-vs-status-quo decision measurement (module-heavy tier) ===',
                `seed=${SEED} moduleCount=${stats.moduleCount} totalModuleBytes=${totalModuleBytes} ` +
                    `warmup=${WARMUP_ITERATIONS} measuredIterations=${MEASURED_ITERATIONS} medianBatchSize=${MEDIAN_BATCH_SIZE} NODE_ENV=${nodeEnv}`,
                '',
                '--- module size distribution ---',
                `  smallest: index=${smallest.index} name="${smallest.name}" bytes=${smallest.bytes} cjsBytes=${smallest.cjsBytes} lorebookBytes=${smallest.lorebookBytes} lorebookCount=${smallest.lorebookCount}`,
                `  median:   index=${medianEntry.index} name="${medianEntry.name}" bytes=${medianEntry.bytes} cjsBytes=${medianEntry.cjsBytes} lorebookBytes=${medianEntry.lorebookBytes} lorebookCount=${medianEntry.lorebookCount}`,
                `  largest:  index=${largest.index} name="${largest.name}" bytes=${largest.bytes} cjsBytes=${largest.cjsBytes} lorebookBytes=${largest.lorebookBytes} lorebookCount=${largest.lorebookCount}`,
                `  largest module's bytes are ${((largest.cjsBytes / largest.bytes) * 100).toFixed(0)}% cjs, ${((largest.lorebookBytes / largest.bytes) * 100).toFixed(0)}% lorebook`,
                '',
                '--- timings ---',
                `  1. whole-array snapshot (BASELINE, current code):        min=${wholeArray.minMs.toFixed(3)}ms median=${wholeArray.medianMs.toFixed(3)}ms  (unbatched)`,
                `  2. one-module snapshot, LARGEST:                          min=${largestModule.minMs.toFixed(3)}ms median=${largestModule.medianMs.toFixed(3)}ms  (unbatched)`,
                `  3. one-module snapshot, MEDIAN:                           min=${medianModule.minMs.toFixed(3)}ms median=${medianModule.medianMs.toFixed(3)}ms  (batch=${MEDIAN_BATCH_SIZE}, per-call)`,
                `  4. all-modules-individually, ONE PASS (shape-change cost): min=${allIndividually.minMs.toFixed(3)}ms median=${allIndividually.medianMs.toFixed(3)}ms  (unbatched, sum of 52 calls)`,
                '',
                '--- derived per-keystroke figures (dbChangeEffects.svelte.ts is the only surviving whole-array call site post-Stage-A; the other call sites trackModuleUpdateDeps() cost is ~0.03ms and omitted as negligible) ---',
                `  BEFORE (status quo, current code -- whole-array snapshot):   ${perKeystrokeBefore.toFixed(3)}ms`,
                `  AFTER partition, editing the LARGEST module:                 ${perKeystrokeAfterPartitionLargest.toFixed(3)}ms`,
                `  AFTER partition, editing a MEDIAN-sized module:              ${perKeystrokeAfterPartitionMedian.toFixed(3)}ms`,
                `  -> largest-module case vs ${FRAME_BUDGET_MS.toFixed(1)}ms frame budget: ` +
                    `${perKeystrokeAfterPartitionLargest > FRAME_BUDGET_MS ? 'STILL OVER budget' : 'within budget'} ` +
                    `(${((perKeystrokeAfterPartitionLargest / FRAME_BUDGET_MS) * 100).toFixed(0)}% of budget)`,
                `  -> median-module case vs ${FRAME_BUDGET_MS.toFixed(1)}ms frame budget: ` +
                    `${perKeystrokeAfterPartitionMedian > FRAME_BUDGET_MS ? 'STILL OVER budget' : 'within budget'} ` +
                    `(${((perKeystrokeAfterPartitionMedian / FRAME_BUDGET_MS) * 100).toFixed(0)}% of budget)`,
                '',
                `  shape-change cost (condition 4) vs single whole-array walk (condition 1): ${shapeChangeVsBaselineRatio.toFixed(2)}x`,
                '=== end ===',
                '',
            ].join('\n'),
        )

        // Sanity, not a perf gate: every call must actually traverse what it claims to.
        expect((snapshotWholeModulesArray(state) as unknown[]).length).toBe(modules.length)
        expect(snapshotOneModule(state, largest.index)).toBeTruthy()
        expect(snapshotOneModule(state, medianEntry.index)).toBeTruthy()
        expect((snapshotAllModulesIndividually(state) as unknown[]).length).toBe(modules.length)
    })
})
