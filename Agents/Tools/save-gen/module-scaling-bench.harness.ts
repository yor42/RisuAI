/**
 * Addendum measurement, items 1 and 2 from the coordinator's follow-up (see
 * the report in the parent task's final message):
 *
 *   1. ASSET-HEAVY module shape. Real user modules can bundle 10,000+ image
 *      references to bypass RisuRealm's 150MB upload limit. Per source
 *      (saveAsset(), src/ts/globalApi.svelte.ts:324-335, returns a hash id;
 *      ModuleMenu.svelte:264 pushes [name, id, extension] into
 *      RisuModule.assets?: [string,string,string][], modules.ts:30), such a
 *      module is ~10,000 short-string TUPLES, not inline bytes -- similar
 *      total size to module-partition-bench.harness.ts's largest fixture
 *      module (1.65MB, 85% one cjs string) but a completely different
 *      STRUCTURE (~10,001 nested arrays vs a handful of giant strings).
 *      Measures $state.snapshot() of a single such module at 1,000, 5,000
 *      and 10,000 asset entries, to see whether cost tracks structure/node
 *      count (as suspected) rather than bytes.
 *
 *   2. MODULE-COUNT SCALING. Does the whole-array snapshot cost (condition 1
 *      of module-partition-bench.harness.ts) grow linearly with module
 *      count? Measured at the canonical seed-1337 module-heavy tier (52
 *      modules) and at a deterministic 104-module duplicate (see
 *      module-scaling-fixture.ts's header for exactly why duplication, not
 *      a second independently-built fixture, was used -- build.ts has no
 *      parameter to request an exact module count).
 *
 * Methodology mirrors module-partition-bench.harness.ts and the other
 * sibling benches: 3 discarded warmup + 15 measured, median + floor
 * reported. Batching is decided PER CONDITION based on an exploratory
 * check (documented per-condition below) rather than applied uniformly,
 * matching track-module-deps-bench.harness.ts's precedent of only batching
 * when a single call is close to timer resolution.
 *
 * Run (production forced with NODE_ENV in front, per README):
 *   NODE_ENV=production npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/module-scaling-bench.harness.ts --reporter=verbose
 *
 * Same standalone-container caveat as every other bench here: raw
 * $state.snapshot() cost only, not wired into the real DBState effect graph.
 *
 * Does not propose or apply any application-code change. Measurement only.
 */
import { describe, test, expect } from 'vitest'
import { buildTierDatabase, SEED } from './build'
import { buildAssetHeavyModule, duplicateModules } from './module-scaling-fixture'
import { makeProxiedDbState, snapshotOneModule, snapshotWholeModulesArray } from './module-scaling-bench.svelte'

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15

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

const FRAME_BUDGET_MS = 1000 / 60

describe('Addendum item 1: asset-heavy module shape vs bytes-equivalent cjs-heavy module', () => {
    const ASSET_COUNTS = [1000, 5000, 10000]

    test('measures $state.snapshot() of a single asset-heavy module at 1k/5k/10k entries', () => {
        const results: Record<number, { minMs: number; medianMs: number; bytes: number }> = {}

        for (const count of ASSET_COUNTS) {
            const mod = buildAssetHeavyModule(count)
            const bytes = new TextEncoder().encode(JSON.stringify(mod)).byteLength
            const state = makeProxiedDbState({ modules: [mod] })

            // Unbatched: an exploratory check (see report) found even 1,000 entries
            // land well above timer resolution once $state's deep proxy walks
            // ~1,000 nested 3-element arrays, so batching is not needed here --
            // unlike track-module-deps-bench.harness.ts's sub-millisecond case.
            const timing = timeit(() => snapshotOneModule(state, 0))
            results[count] = { minMs: timing.minMs, medianMs: timing.medianMs, bytes }

            expect((snapshotOneModule(state, 0) as any).assets.length).toBe(count)
        }

        const nodeEnv = process.env.NODE_ENV ?? '(unset)'
        console.log(
            [
                '',
                '=== addendum item 1: asset-heavy module shape (module-scaling-bench) ===',
                `seed=${SEED} warmup=${WARMUP_ITERATIONS} measuredIterations=${MEASURED_ITERATIONS} NODE_ENV=${nodeEnv}`,
                ...ASSET_COUNTS.map((count) => {
                    const r = results[count]
                    const overBudget = r.medianMs > FRAME_BUDGET_MS
                    return (
                        `  assets=${count} bytes=${r.bytes} (${(r.bytes / 1024 / 1024).toFixed(2)}MB): ` +
                        `min=${r.minMs.toFixed(3)}ms median=${r.medianMs.toFixed(3)}ms vs ${FRAME_BUDGET_MS.toFixed(1)}ms budget -> ` +
                        `${overBudget ? 'EXCEEDS budget on its own' : `${((r.medianMs / FRAME_BUDGET_MS) * 100).toFixed(0)}% of budget`}`
                    )
                }),
                `  for comparison, module-partition-bench.harness.ts's largest fixture module (1.65MB, 85% cjs) measured ~4.0-4.7ms.`,
                '=== end ===',
                '',
            ].join('\n'),
        )
    })
})

describe('Addendum item 2: whole-array snapshot cost vs module count (52 vs 104, duplicate-based)', () => {
    test('measures $state.snapshot(modules) at 52 and 104 modules', () => {
        const { database: db52, stats } = buildTierDatabase('module-heavy')
        const modules52 = db52.modules as Record<string, unknown>[]
        const modules104 = duplicateModules(modules52, 2)

        const bytes52 = new TextEncoder().encode(JSON.stringify(modules52)).byteLength
        const bytes104 = new TextEncoder().encode(JSON.stringify(modules104)).byteLength

        const state52 = makeProxiedDbState({ modules: modules52 })
        const state104 = makeProxiedDbState({ modules: modules104 })

        const timing52 = timeit(() => snapshotWholeModulesArray(state52))
        const timing104 = timeit(() => snapshotWholeModulesArray(state104))

        const scalingRatio = timing104.medianMs / timing52.medianMs

        const nodeEnv = process.env.NODE_ENV ?? '(unset)'
        console.log(
            [
                '',
                '=== addendum item 2: module-count scaling (module-scaling-bench) ===',
                `seed=${SEED} moduleCount52=${stats.moduleCount} warmup=${WARMUP_ITERATIONS} measuredIterations=${MEASURED_ITERATIONS} NODE_ENV=${nodeEnv}`,
                `  NOTE: the 104-module point is the same 52 modules duplicated ` +
                    `(structuredClone'd second copy, see module-scaling-fixture.ts) -- ` +
                    `NOT a second independently-built fixture. build.ts has no parameter ` +
                    `to request an exact heavy module count.`,
                `  52 modules:  bytes=${bytes52} min=${timing52.minMs.toFixed(3)}ms median=${timing52.medianMs.toFixed(3)}ms`,
                `  104 modules: bytes=${bytes104} min=${timing104.minMs.toFixed(3)}ms median=${timing104.medianMs.toFixed(3)}ms`,
                `  scaling ratio (104/52), medians: ${scalingRatio.toFixed(3)}x  ` +
                    `(byte ratio was ${(bytes104 / bytes52).toFixed(3)}x -- if the two ratios are close, cost tracks bytes/count roughly linearly)`,
                '=== end ===',
                '',
            ].join('\n'),
        )

        expect((snapshotWholeModulesArray(state52) as unknown[]).length).toBe(52)
        expect((snapshotWholeModulesArray(state104) as unknown[]).length).toBe(104)
    }, 15000)
})
