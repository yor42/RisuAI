/**
 * M3 — WHOLE-DATABASE PARTITION prototype (measurement request item M3).
 *
 * Unlike M2 (which keeps the current selection-scoped mechanism and only
 * reduces its cost), this design would ALSO fix CHORE-01 generally: instead
 * of only ever deep-reading `DBState.db.characters[selIdState]`, an outer
 * effect watches `db.characters`' shape/identity and creates ONE CHILD
 * EFFECT PER CHARACTER (deep-reading that character), so every character is
 * tracked, not just the selected one. A second variant additionally splits
 * each character's OWN child into grandchildren, one per chat.
 *
 * THIS IS A PROTOTYPE, NOT THE REAL EFFECT — lives entirely in this file,
 * never imported into/from src/. Uses `character-scaling-fixture.ts`'s
 * `buildManyCharactersFixture` only. No `stores.svelte` mocking needed (own
 * standalone `$state()` container, same reasoning as M2's file header).
 *
 * FIXTURE POINTS: the task asks for "500 and 1000 characters, ~20k and
 * ~150k total messages". Running the full 2x2 cross product at this scale
 * (structuredClone + $state-wrap + full-materialization boot, twice per
 * point for two variants, plus a plain-heap baseline) is expensive enough
 * that only the diagonal is run here: (500 chars, ~20k msgs) as the
 * "typical heavy" point and (1000 chars, ~150k msgs) as the "extreme"
 * point — matching this project's own recorded real-world sizing (500+
 * maintainer characters, 1000+ extreme users, per
 * project-real-character-counts memory). Documented, not hidden; a
 * (1000, ~20k) or (500, ~150k) cross-point was NOT run and is UNMEASURED.
 *
 * MEASURED:
 *  (a) First-run ("boot") time: $state-wrap the raw fixture, register the
 *      effect, run ONE `flushSync()` — the cost of materializing every
 *      character's reactive proxies and every child/grandchild effect for
 *      the first time.
 *  (b) Retained heap after that first run, isolated from the plain JSON
 *      data's own size: `structuredClone()` a fresh plain-object copy of
 *      the fixture, force GC, record `heapUsed` (this is the "plain data"
 *      baseline, still resident as an unproxied plain object) -- THEN
 *      `$state()`-wrap that exact object, register the effect, flush, force
 *      GC again, record `heapUsed`. The delta isolates reactive overhead
 *      (proxies + effect nodes + Svelte's internal dependency-link
 *      structures) from the data's own bytes, matching Investigation-
 *      Ledger row 14's method. Compared against the SAME measurement using
 *      TODAY's selection-only read (only character[0] deep-read) as the
 *      "before" baseline for this design's incremental retained cost.
 *      GC method: `global.gc()`, requires `NODE_OPTIONS=--expose-gc`
 *      (confirmed to propagate into vitest's worker-thread pool in this
 *      repo -- see M1's file header). If unavailable, this block reports
 *      UNMEASURED with that instruction.
 *
 *      METHODOLOGY CORRECTION (found during a coordinator-requested
 *      follow-up, `dbchange-proxy-baseline-bench.svelte.harness.ts` — see
 *      that file's header for the full account): the FIRST version of this
 *      block ran plain/today/variant-B/variant-C sequentially as `const`s
 *      inside one shared `else { }` block. Every scenario's
 *      `clone`/`state`/`tracker` stayed in scope for the REST of that block
 *      even after its own measurement, so `global.gc()` could never
 *      reclaim an earlier scenario's clone before the next scenario's
 *      "before" reading — every number after the first was measured
 *      against a heap that still silently included every prior scenario's
 *      retained data. The numbers below are the CORRECTED re-measurement:
 *      each scenario is its own function that returns only a byte delta,
 *      so nothing survives past that function's return, and each scenario
 *      is run TWICE for stability. The original (uncorrected) numbers were
 *      published once, in this project's `chore01-item2-measure.md`, and
 *      are superseded there by an appended correction — they should not be
 *      relied on independently of that correction.
 *  (c) Per-change flush time for M1-style writes (field, lorebook,
 *      token-append) applied to one of the larger ("big") characters, for
 *      BOTH variants.
 *  (d) Write to a NON-selected (in fact, there is no "selected" concept in
 *      this design -- every character is watched) SMALL character:
 *      confirms exactly that character's chaId is marked dirty and no
 *      other character's child effect fires -- the isolation property that
 *      would fix CHORE-01 generally.
 *
 * Run:
 *   NODE_OPTIONS=--expose-gc npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/dbchange-whole-db-partition-bench.svelte.harness.ts --reporter=verbose
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

type Tracker = Set<string>

/** VARIANT B: outer shape effect + one child effect per character, deep-reading the WHOLE character (including chats). */
function registerPerCharacterEffect(state: { characters: Record<string, any>[] }, tracker: Tracker, runLog: { childRuns: number }): () => void {
    return $effect.root(() => {
        $effect(() => {
            const chars = state.characters
            const len = chars.length
            for (let i = 0; i < len; i++) {
                const c = chars[i]
                if (!c) continue
                $effect(() => {
                    $state.snapshot(c)
                    tracker.add(c.chaId)
                    runLog.childRuns++
                })
            }
        })
    })
}

/** VARIANT C: outer -> per-character child (own fields only) -> per-chat grandchild (deep-reads that chat). */
function registerPerCharacterPerChatEffect(
    state: { characters: Record<string, any>[] },
    tracker: Tracker,
    runLog: { childRuns: number; grandchildRuns: number },
): () => void {
    return $effect.root(() => {
        $effect(() => {
            const chars = state.characters
            const len = chars.length
            for (let i = 0; i < len; i++) {
                const c = chars[i]
                if (!c) continue
                $effect(() => {
                    for (const key in c) {
                        if (key !== 'chats') $state.snapshot(c[key])
                    }
                    tracker.add(c.chaId)
                    runLog.childRuns++
                    const chats = c.chats as Record<string, any>[]
                    for (let j = 0; j < chats.length; j++) {
                        const chat = chats[j]
                        $effect(() => {
                            $state.snapshot(chat)
                            tracker.add(c.chaId)
                            runLog.grandchildRuns++
                        })
                    }
                })
            }
        })
    })
}

/** APPROXIMATION OF TODAY'S BEHAVIOUR, for the heap-retention "before" comparison: deep-reads ONLY characters[0]. */
function registerTodayLikeSelectionOnlyEffect(state: { characters: Record<string, any>[] }, tracker: Tracker): () => void {
    return $effect.root(() => {
        $effect(() => {
            const sel = state.characters[0]
            if (!sel) return
            for (const key in sel) {
                if (key !== 'chats') $state.snapshot(sel[key])
            }
            $state.snapshot(sel.chats)
            tracker.add(sel.chaId)
        })
    })
}

interface FixturePoint { characterCount: number; totalMessages: number; label: string }
const FIXTURE_POINTS: FixturePoint[] = [
    { characterCount: 500, totalMessages: 20000, label: '500 chars / ~20k msgs' },
    { characterCount: 1000, totalMessages: 150000, label: '1000 chars / ~150k msgs' },
]

function gcAvailable(): boolean {
    return typeof (global as any).gc === 'function'
}

describe('M3 — whole-database partition prototype: boot cost + retained heap', () => {
    for (const point of FIXTURE_POINTS) {
        test(`boot + retained heap @ ${point.label}`, () => {
            const { characters: rawCharacters, stats } = buildManyCharactersFixture({
                characterCount: point.characterCount,
                totalMessages: point.totalMessages,
                seedOffset: point.characterCount,
            })

            const lines: string[] = ['', `=== M3 ${point.label} (actual stats: ${JSON.stringify(stats)}) ===`]

            // --- (a) boot time, both variants (already function/block-scoped correctly) ---
            {
                const cloneB = structuredClone(rawCharacters)
                const stateB = $state({ characters: cloneB })
                const trackerB: Tracker = new Set()
                const runLogB = { childRuns: 0 }
                const t0 = performance.now()
                const cleanupB = registerPerCharacterEffect(stateB, trackerB, runLogB)
                flush()
                const bootB = performance.now() - t0
                lines.push(`  boot (variant B, per-character): ${bootB.toFixed(2)}ms, childRuns=${runLogB.childRuns}, trackerSize=${trackerB.size}`)
                cleanupB()
            }
            {
                const cloneC = structuredClone(rawCharacters)
                const stateC = $state({ characters: cloneC })
                const trackerC: Tracker = new Set()
                const runLogC = { childRuns: 0, grandchildRuns: 0 }
                const t0 = performance.now()
                const cleanupC = registerPerCharacterPerChatEffect(stateC, trackerC, runLogC)
                flush()
                const bootC = performance.now() - t0
                lines.push(
                    `  boot (variant C, per-character+per-chat): ${bootC.toFixed(2)}ms, childRuns=${runLogC.childRuns}, grandchildRuns=${runLogC.grandchildRuns}, trackerSize=${trackerC.size}`,
                )
                cleanupC()
            }

            // --- (b) retained heap: plain-data baseline vs today-like vs variant B vs variant C ---
            // CORRECTED methodology: each scenario is its own function, returning only a
            // number, so nothing outlives it for the next scenario's gc() to fail to
            // collect. See the file header's "METHODOLOGY CORRECTION" note. Each
            // scenario is run twice for stability.
            if (!gcAvailable()) {
                lines.push('  retained heap: UNMEASURED -- global.gc unavailable. Re-run with NODE_OPTIONS=--expose-gc.')
            } else {
                const gc = (global as any).gc as () => void

                function measurePlain(): number {
                    gc()
                    const before = process.memoryUsage().heapUsed
                    const plainClone = structuredClone(rawCharacters)
                    gc()
                    const after = process.memoryUsage().heapUsed
                    void plainClone
                    return after - before
                }
                function measureTodayLike(): number {
                    gc()
                    const before = process.memoryUsage().heapUsed
                    const clone = structuredClone(rawCharacters)
                    const state = $state({ characters: clone })
                    const tracker: Tracker = new Set()
                    const cleanup = registerTodayLikeSelectionOnlyEffect(state, tracker)
                    flush()
                    gc()
                    const after = process.memoryUsage().heapUsed
                    cleanup()
                    return after - before
                }
                function measureVariantB(): number {
                    gc()
                    const before = process.memoryUsage().heapUsed
                    const clone = structuredClone(rawCharacters)
                    const state = $state({ characters: clone })
                    const tracker: Tracker = new Set()
                    const runLog = { childRuns: 0 }
                    const cleanup = registerPerCharacterEffect(state, tracker, runLog)
                    flush()
                    gc()
                    const after = process.memoryUsage().heapUsed
                    cleanup()
                    return after - before
                }
                function measureVariantC(): { bytes: number; grandchildRuns: number } {
                    gc()
                    const before = process.memoryUsage().heapUsed
                    const clone = structuredClone(rawCharacters)
                    const state = $state({ characters: clone })
                    const tracker: Tracker = new Set()
                    const runLog = { childRuns: 0, grandchildRuns: 0 }
                    const cleanup = registerPerCharacterPerChatEffect(state, tracker, runLog)
                    flush()
                    gc()
                    const after = process.memoryUsage().heapUsed
                    const grandchildRuns = runLog.grandchildRuns
                    cleanup()
                    return { bytes: after - before, grandchildRuns }
                }

                function avgMB(runs: number[]): number {
                    return runs.reduce((a, b) => a + b, 0) / runs.length / 1024 / 1024
                }
                function fmtRunsMB(runs: number[]): string {
                    return runs.map((r) => (r / 1024 / 1024).toFixed(1)).join(', ')
                }

                const plainRuns = [measurePlain(), measurePlain()]
                const todayRuns = [measureTodayLike(), measureTodayLike()]
                const variantBRuns = [measureVariantB(), measureVariantB()]
                const variantCResult1 = measureVariantC()
                const variantCResult2 = measureVariantC()
                const variantCRuns = [variantCResult1.bytes, variantCResult2.bytes]

                const plainMB = avgMB(plainRuns)
                const todayMB = avgMB(todayRuns)
                const variantBMB = avgMB(variantBRuns)
                const variantCMB = avgMB(variantCRuns)

                lines.push(`  [CORRECTED, 2 runs/scenario] plain-data heap:                avg=${plainMB.toFixed(2)} MB  [runs: ${fmtRunsMB(plainRuns)}]`)
                lines.push(`  [CORRECTED] retained heap, TODAY-LIKE (char[0] only):        avg=${todayMB.toFixed(2)} MB  [runs: ${fmtRunsMB(todayRuns)}]  (-> +${(todayMB - plainMB).toFixed(2)} MB over plain)`)
                lines.push(`  [CORRECTED] retained heap, VARIANT B (ALL chars, per-char):  avg=${variantBMB.toFixed(2)} MB  [runs: ${fmtRunsMB(variantBRuns)}]  (-> +${(variantBMB - plainMB).toFixed(2)} MB over plain)`)
                lines.push(`  [CORRECTED] retained heap, VARIANT C (ALL chars, per-chat):  avg=${variantCMB.toFixed(2)} MB  [runs: ${fmtRunsMB(variantCRuns)}]  (-> +${(variantCMB - plainMB).toFixed(2)} MB over plain)`)
                lines.push(`    -> extra effect-node count vs variant B (grandchildren): ${variantCResult1.grandchildRuns} additional per-chat effects`)
                lines.push(`    -> VARIANT B/C's OWN marginal addition over TODAY-LIKE (i.e. specifically attributable to watching every character, not just the selected one): +${(variantBMB - todayMB).toFixed(2)} MB (B) / +${(variantCMB - todayMB).toFixed(2)} MB (C)`)
            }

            console.log(lines.join('\n') + '\n=== end ===\n')
            expect(true).toBe(true)
        }, 240000)
    }
})

describe('M3 — per-change flush cost on a multi-character DB (500 chars / ~20k msgs point)', () => {
    test('field / lorebook / token-append writes to a BIG character, both variants', () => {
        const { characters: rawCharacters } = buildManyCharactersFixture({ characterCount: 500, totalMessages: 20000, seedOffset: 500 })
        const bigIdx = 0 // 'big-0', first of the big characters
        expect((rawCharacters[bigIdx] as any).chaId).toBe('big-0')

        const WARMUP = 3
        const MEASURED = 10

        for (const [variantName, register] of [
            ['B (per-character)', registerPerCharacterEffect],
            ['C (per-character+per-chat)', registerPerCharacterPerChatEffect],
        ] as const) {
            const clone = structuredClone(rawCharacters)
            const state = $state({ characters: clone })
            const tracker: Tracker = new Set()
            const runLog = { childRuns: 0, grandchildRuns: 0 }
            const cleanup = (register as any)(state, tracker, runLog)
            flush()

            const bigChat = (state.characters[bigIdx] as any).chats
            const lastChatIdx = bigChat.length - 1
            const lastMsgIdx = bigChat[lastChatIdx].message.length - 1

            const writers: Record<string, () => void> = {
                'field-desc': () => {
                    ;(state.characters[bigIdx] as any).desc = 'edited desc'
                },
                'field-lorebook': () => {
                    ;(state.characters[bigIdx] as any).globalLore[0].content = 'edited lore'
                },
                'token-append': () => {
                    bigChat[lastChatIdx].message[lastMsgIdx].data += ' tok'
                },
            }

            const lines: string[] = ['', `=== M3 per-change flush, variant ${variantName} (big character, ~big-0's own message count) ===`]
            for (const [name, fn] of Object.entries(writers)) {
                for (let i = 0; i < WARMUP; i++) {
                    fn()
                    flush()
                }
                const samples: number[] = []
                for (let i = 0; i < MEASURED; i++) {
                    const start = performance.now()
                    fn()
                    flush()
                    samples.push(performance.now() - start)
                }
                lines.push(`  ${name}: min=${Math.min(...samples).toFixed(3)}ms median=${median(samples).toFixed(3)}ms max=${Math.max(...samples).toFixed(3)}ms`)
            }
            cleanup()
            console.log(lines.join('\n') + '\n=== end ===\n')
        }
        expect(true).toBe(true)
    }, 60000)
})

describe('M3(d) — write to a NON-selected (small) character: confirms only its chaId is marked, CHORE-01 fix property', () => {
    test('mutating a small character marks only that chaId, no others', () => {
        const { characters: rawCharacters } = buildManyCharactersFixture({ characterCount: 500, totalMessages: 20000, seedOffset: 501 })
        const clone = structuredClone(rawCharacters)
        const state = $state({ characters: clone })
        const tracker: Tracker = new Set()
        const runLog = { childRuns: 0 }
        const cleanup = registerPerCharacterEffect(state, tracker, runLog)
        flush()
        tracker.clear() // discard the boot-time full population

        const targetIdx = clone.findIndex((c) => (c as any).chaId === 'small-3')
        expect(targetIdx).toBeGreaterThan(-1)
        ;(state.characters[targetIdx] as any).desc = 'a targeted edit to a non-selected character'
        flush()

        console.log(
            `\n=== M3(d) non-selected-character write: tracker after edit = ${JSON.stringify([...tracker])} (expect exactly ["small-3"]) ===\n`,
        )
        expect([...tracker]).toEqual(['small-3'])
        cleanup()
    }, 60000)
})
