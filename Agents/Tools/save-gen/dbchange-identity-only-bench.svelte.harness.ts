/**
 * M4 — CHEAP IDENTITY-ONLY VARIANT (measurement request item M4).
 *
 * A single outer effect that reads ONLY `db.characters.length` and each
 * element's IDENTITY (`chars[i]`, never any of that element's own
 * properties) -- no deep read at all, no per-character child effects. This
 * would give only PARTIAL CHORE-01 coverage: it can detect that an element
 * REFERENCE changed (replacement or whole-array reassignment), but cannot
 * detect an in-place mutation of an existing character object, because it
 * never subscribed to any of that object's own reactive sources.
 *
 * THIS IS A PROTOTYPE, NOT THE REAL EFFECT -- lives entirely in this file.
 * No `stores.svelte` mocking needed (standalone `$state()` container).
 *
 * MEASURED, at 1000 characters (~20k messages total, same
 * `buildManyCharactersFixture` fixture as M3's "typical heavy" point, for
 * comparability):
 *   (a) boot time (register + first flush).
 *   (b) per-change cost for: element replacement (`characters[i] = char`),
 *       whole-array replacement (`characters = newArray`), and an in-place
 *       field write (`characters[i].trashTime = undefined`).
 *   (c) WHICH of those three writes the effect actually re-runs for
 *       (catches) vs not (misses) -- verified empirically via a run
 *       counter, not assumed from source reading alone.
 *
 * Run:
 *   npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/dbchange-identity-only-bench.svelte.harness.ts --reporter=verbose
 */
import { flushSync } from 'svelte'
import { describe, test, expect } from 'vitest'
import { buildManyCharactersFixture } from './character-scaling-fixture'

function flush(): void {
    flushSync()
}
function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** PROTOTYPE: reads db.characters.length + every element's identity, nothing deeper. */
function registerIdentityOnlyEffect(state: { characters: Record<string, any>[] }, runLog: { runs: number }): () => void {
    return $effect.root(() => {
        $effect(() => {
            const chars = state.characters
            const len = chars.length
            for (let i = 0; i < len; i++) {
                const _c = chars[i] // identity read only -- no property of _c is ever touched
                void _c
            }
            runLog.runs++
        })
    })
}

describe('M4 — identity-only variant: boot cost, per-change cost, catches/misses', () => {
    test('1000 characters, ~20k messages', () => {
        const { characters: rawCharacters, stats } = buildManyCharactersFixture({ characterCount: 1000, totalMessages: 20000, seedOffset: 900 })
        const clone = structuredClone(rawCharacters)
        const state = $state({ characters: clone })
        const runLog = { runs: 0 }

        const t0 = performance.now()
        const cleanup = registerIdentityOnlyEffect(state, runLog)
        flush()
        const bootMs = performance.now() - t0
        expect(runLog.runs).toBe(1)

        const WARMUP = 3
        const MEASURED = 15

        function timeAndCatch(mutate: () => void): { minMs: number; medianMs: number; maxMs: number; caughtEveryTime: boolean } {
            for (let i = 0; i < WARMUP; i++) {
                mutate()
                flush()
            }
            const samples: number[] = []
            let caught = 0
            const totalTrials = WARMUP + MEASURED
            runLog.runs = 0
            for (let i = 0; i < MEASURED; i++) {
                const before = runLog.runs
                const start = performance.now()
                mutate()
                flush()
                samples.push(performance.now() - start)
                if (runLog.runs > before) caught++
            }
            return { minMs: Math.min(...samples), medianMs: median(samples), maxMs: Math.max(...samples), caughtEveryTime: caught === MEASURED }
        }

        // (1) Element replacement: characters[i] = newChar. EXPECTED: caught (new identity at index i).
        let replaceCounter = 0
        const elementReplacement = timeAndCatch(() => {
            const idx = 5
            state.characters[idx] = { ...structuredClone(rawCharacters[idx]), _replaceMarker: replaceCounter++ } as any
        })

        // (2) Whole-array replacement: characters = [...same, mutated]. EXPECTED: caught (outer reads `chars` itself via .length + iteration each run, and the array reference changes).
        let wholeArrayCounter = 0
        const wholeArrayReplacement = timeAndCatch(() => {
            const newArr = [...state.characters]
            newArr[wholeArrayCounter % newArr.length] = { ...(newArr[wholeArrayCounter % newArr.length] as any), _tag: wholeArrayCounter }
            wholeArrayCounter++
            state.characters = newArr as any
        })

        // (3) In-place field write on an EXISTING element: characters[i].trashTime = undefined. EXPECTED: missed (no subscription to that field).
        const inPlaceFieldWrite = timeAndCatch(() => {
            ;(state.characters[7] as any).trashTime = Date.now()
        })

        console.log(
            [
                '',
                `=== M4 identity-only variant (fixture stats: ${JSON.stringify(stats)}) ===`,
                `  boot: ${bootMs.toFixed(3)}ms (single pass over ${stats.characterCount} identities, no deep read)`,
                `  (1) element replacement (characters[i] = newChar):        min=${elementReplacement.minMs.toFixed(3)}ms median=${elementReplacement.medianMs.toFixed(3)}ms max=${elementReplacement.maxMs.toFixed(3)}ms  caught every time: ${elementReplacement.caughtEveryTime}`,
                `  (2) whole-array replacement (characters = newArray):      min=${wholeArrayReplacement.minMs.toFixed(3)}ms median=${wholeArrayReplacement.medianMs.toFixed(3)}ms max=${wholeArrayReplacement.maxMs.toFixed(3)}ms  caught every time: ${wholeArrayReplacement.caughtEveryTime}`,
                `  (3) in-place field write (characters[i].trashTime = x):   min=${inPlaceFieldWrite.minMs.toFixed(3)}ms median=${inPlaceFieldWrite.medianMs.toFixed(3)}ms max=${inPlaceFieldWrite.maxMs.toFixed(3)}ms  caught every time: ${inPlaceFieldWrite.caughtEveryTime} (EXPECTED false -- this is the coverage gap)`,
                '=== end ===',
                '',
            ].join('\n'),
        )

        expect(elementReplacement.caughtEveryTime).toBe(true)
        expect(wholeArrayReplacement.caughtEveryTime).toBe(true)
        expect(inPlaceFieldWrite.caughtEveryTime).toBe(false) // pins the coverage gap empirically, not just by source reading

        cleanup()
    }, 60000)
})
