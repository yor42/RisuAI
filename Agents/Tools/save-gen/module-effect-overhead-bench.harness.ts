/**
 * Addendum measurement, item 3 from the coordinator's follow-up: does
 * `$effect` scheduling/teardown overhead erase the partition's advantage as
 * module count grows? The raw `$state.snapshot()` numbers in
 * module-partition-bench.harness.ts say nothing about the cost of
 * maintaining N per-element child `$effect`s instead of 1 -- this file
 * measures exactly that, using REAL `$effect.root()` + `flushSync()`, the
 * same pattern already proven to work headlessly in this repo by
 * src/ts/storage/tests/dbChangeEffects.svelte.test.ts (see
 * module-effect-overhead-bench.svelte.ts's header for the precedent).
 *
 * Two conditions, at N=52 and N=104 (the 104 point reuses
 * module-scaling-fixture.ts's duplicate-based approach, same caveat as
 * module-scaling-bench.harness.ts: it is the seed-1337 52-module array
 * duplicated, not a second independently-built fixture):
 *
 *   (a) STEADY STATE -- one leaf mutation ("one keystroke"). Compares the
 *       cost of ONE child effect re-running (the partition) against the
 *       cost of the ONE existing whole-array effect re-running (today).
 *       Also verifies, as a correctness sanity check and not just a timing
 *       one, that mutating one module's leaf field dirties EXACTLY that
 *       module's child effect and none of the other N-1 -- the whole
 *       premise of the partition depends on this actually being true under
 *       Svelte's real effect graph, not assumed.
 *
 *   (b) SHAPE CHANGE -- tears down and recreates all N child effects
 *       (partition) vs a single existing effect simply re-running against a
 *       newly-assigned array reference (today, no teardown/recreate
 *       machinery needed for a single non-indexed effect). This is the
 *       comparison the coordinator specifically asked for: "compare (b)
 *       against today's single whole-array effect re-run."
 *
 * Methodology: 3 discarded warmup + 15 measured, median + floor. Not
 * batched -- every condition here involves at least one $state.snapshot()
 * of a real-sized module plus Svelte scheduler work, comfortably above
 * timer resolution (confirmed by the sibling module-partition-bench and
 * module-scaling-bench numbers, all >= ~0.2ms even at their cheapest).
 *
 * Run:
 *   NODE_ENV=production npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/module-effect-overhead-bench.harness.ts --reporter=verbose
 *
 * Same standalone-container caveat as every other bench here: this is a
 * synthetic N-child-effect scenario built to isolate the scheduling
 * question, not the app's real registerDbChangeEffects()/stores.svelte.ts
 * effect graph. Does not propose or apply any application-code change.
 */
import { describe, test, expect } from 'vitest'
import { buildTierDatabase, SEED } from './build'
import { duplicateModules } from './module-scaling-fixture'
import {
    flush,
    makeProxiedDbState,
    makeRunCounters,
    mutateOneModuleLeaf,
    registerPerElementChildEffects,
    registerSingleWholeArrayEffect,
    replaceModulesArray,
} from './module-effect-overhead-bench.svelte'

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15

function timeit(fn: () => void): { minMs: number; medianMs: number } {
    for (let i = 0; i < WARMUP_ITERATIONS; i++) fn()
    const samples: number[] = []
    for (let i = 0; i < MEASURED_ITERATIONS; i++) {
        const start = performance.now()
        fn()
        samples.push(performance.now() - start)
    }
    return { minMs: Math.min(...samples), medianMs: median(samples) }
}

const FRAME_BUDGET_MS = 1000 / 60

function buildModuleList(count52Multiplier: 1 | 2): Record<string, unknown>[] {
    const { database } = buildTierDatabase('module-heavy')
    const modules52 = database.modules as Record<string, unknown>[]
    return count52Multiplier === 1 ? modules52 : duplicateModules(modules52, 2)
}

const MODULE_COUNTS: (1 | 2)[] = [1, 2] // multiplier: 1 -> 52 modules, 2 -> 104 modules

describe('Addendum item 3a: steady-state single-mutation cost — N child effects vs 1 whole-array effect', () => {
    for (const multiplier of MODULE_COUNTS) {
        test(`measures one-leaf-mutation cost at N=${multiplier * 52} modules`, () => {
            const modules = buildModuleList(multiplier)
            const n = modules.length
            const leafIdx = Math.floor(n / 2)

            // --- Partition side: N child effects. ---
            const statePartition = makeProxiedDbState({ modules: [...modules] })
            let runCounters = makeRunCounters(n)
            let cleanupPartition = registerPerElementChildEffects(statePartition, runCounters)
            flush() // initial mount, discarded
            expect(runCounters.every((c) => c === 1)).toBe(true) // sanity: every child effect ran exactly once on mount
            runCounters.fill(0)

            let counter = 0
            const partitionTiming = timeit(() => {
                mutateOneModuleLeaf(statePartition, leafIdx, `edit-${counter++}`)
                flush()
            })
            const totalCalls = WARMUP_ITERATIONS + MEASURED_ITERATIONS
            // CORRECTNESS CHECK, not just a timing one: exactly the target child effect
            // fired on every mutation, and NO other child effect fired at all.
            const isolationHolds = runCounters[leafIdx] === totalCalls && runCounters.every((c, i) => i === leafIdx || c === 0)
            cleanupPartition()

            // --- Single-effect side: today's one whole-array effect. ---
            const stateSingle = makeProxiedDbState({ modules: [...modules] })
            const singleCounter = { count: 0 }
            const cleanupSingle = registerSingleWholeArrayEffect(stateSingle, singleCounter)
            flush() // initial mount, discarded
            singleCounter.count = 0

            let counter2 = 0
            const singleTiming = timeit(() => {
                mutateOneModuleLeaf(stateSingle, leafIdx, `edit-${counter2++}`)
                flush()
            })
            const singleFiredEveryTime = singleCounter.count === totalCalls
            cleanupSingle()

            const nodeEnv = process.env.NODE_ENV ?? '(unset)'
            console.log(
                [
                    '',
                    `=== addendum item 3a: steady-state, N=${n} modules (NODE_ENV=${nodeEnv}) ===`,
                    `  seed=${SEED} leafIdx=${leafIdx} warmup=${WARMUP_ITERATIONS} measuredIterations=${MEASURED_ITERATIONS}`,
                    `  isolation check (partition dirties ONLY the mutated module's child effect): ${isolationHolds ? 'HOLDS' : 'FAILED -- see below'}`,
                    `  single-effect fired every mutation (expected, whole-array read): ${singleFiredEveryTime ? 'yes' : 'NO -- unexpected'}`,
                    `  partition (1 of ${n} child effects reruns): min=${partitionTiming.minMs.toFixed(3)}ms median=${partitionTiming.medianMs.toFixed(3)}ms`,
                    `  single whole-array effect reruns:            min=${singleTiming.minMs.toFixed(3)}ms median=${singleTiming.medianMs.toFixed(3)}ms`,
                    `  vs ${FRAME_BUDGET_MS.toFixed(1)}ms frame budget -> partition: ${((partitionTiming.medianMs / FRAME_BUDGET_MS) * 100).toFixed(0)}%  |  single: ${((singleTiming.medianMs / FRAME_BUDGET_MS) * 100).toFixed(0)}%`,
                    '=== end ===',
                    '',
                ].join('\n'),
            )

            expect(isolationHolds).toBe(true)
            expect(singleFiredEveryTime).toBe(true)
        })
    }
})

describe('Addendum item 3b: array-shape-change cost — teardown+recreate N effects vs 1 effect re-running', () => {
    for (const multiplier of MODULE_COUNTS) {
        test(`measures shape-change cost at N=${multiplier * 52} modules`, () => {
            const listA = buildModuleList(multiplier)
            const listB = structuredClone(listA) // distinct object graph, same size -- a genuine new array reference each ping-pong step
            const n = listA.length

            // --- Single-effect side: today's behaviour. No teardown/recreate needed --
            // the one existing effect just reruns because the array reference it reads changed. ---
            const stateSingle = makeProxiedDbState({ modules: listA })
            const singleCounter = { count: 0 }
            const cleanupSingle = registerSingleWholeArrayEffect(stateSingle, singleCounter)
            flush() // initial mount, discarded
            singleCounter.count = 0

            let toggleSingle = true
            const singleShapeTiming = timeit(() => {
                replaceModulesArray(stateSingle, toggleSingle ? listB : listA)
                toggleSingle = !toggleSingle
                flush()
            })
            const totalCalls = WARMUP_ITERATIONS + MEASURED_ITERATIONS
            const singleFiredEveryTime = singleCounter.count === totalCalls
            cleanupSingle()

            // --- Partition side: EVERY sample tears down all N old child effects and
            // creates N new ones for the newly-assigned array, then mounts them. ---
            const statePartition = makeProxiedDbState({ modules: listA })
            const runCounters = makeRunCounters(n)
            let cleanupPartition = registerPerElementChildEffects(statePartition, runCounters)
            flush() // initial mount, discarded

            let toggleShape = true
            const partitionShapeTiming = timeit(() => {
                cleanupPartition() // tear down N old child effects
                const target = toggleShape ? listB : listA
                toggleShape = !toggleShape
                replaceModulesArray(statePartition, target)
                runCounters.fill(0)
                cleanupPartition = registerPerElementChildEffects(statePartition, runCounters) // create N new child effects
                flush() // mount + run each new child effect once
            })
            cleanupPartition() // final teardown, hygiene

            const ratio = partitionShapeTiming.medianMs / singleShapeTiming.medianMs

            const nodeEnv = process.env.NODE_ENV ?? '(unset)'
            console.log(
                [
                    '',
                    `=== addendum item 3b: shape-change, N=${n} modules (NODE_ENV=${nodeEnv}) ===`,
                    `  seed=${SEED} warmup=${WARMUP_ITERATIONS} measuredIterations=${MEASURED_ITERATIONS}`,
                    `  single-effect fired every reassignment (expected): ${singleFiredEveryTime ? 'yes' : 'NO -- unexpected'}`,
                    `  single whole-array effect, just reruns:                  min=${singleShapeTiming.minMs.toFixed(3)}ms median=${singleShapeTiming.medianMs.toFixed(3)}ms`,
                    `  partition, teardown ${n} + recreate ${n} + mount ${n}:      min=${partitionShapeTiming.minMs.toFixed(3)}ms median=${partitionShapeTiming.medianMs.toFixed(3)}ms`,
                    `  ratio (partition shape-change / single-effect shape-change): ${ratio.toFixed(2)}x`,
                    `  vs ${FRAME_BUDGET_MS.toFixed(1)}ms frame budget -> partition shape-change is ` +
                        `${partitionShapeTiming.medianMs > FRAME_BUDGET_MS ? 'STILL OVER budget' : 'within budget'} ` +
                        `(${((partitionShapeTiming.medianMs / FRAME_BUDGET_MS) * 100).toFixed(0)}%)`,
                    '=== end ===',
                    '',
                ].join('\n'),
            )

            expect(singleFiredEveryTime).toBe(true)
        }, 15000)
    }
})
