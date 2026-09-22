/**
 * M2 — SELECTION-SCOPED PARTITION prototype (measurement request item M2).
 *
 * "Item 2 only" scope: keeps the CURRENT selection-scoped mechanism (only
 * the selected character's data is ever tracked -- CHORE-01 is NOT fixed by
 * this design, only its cost is reduced) but splits the selected
 * character's deep read into:
 *   - one child $effect PER NON-'chats' FIELD (mirrors the modules
 *     partition's per-element pattern, applied to a character's own fields
 *     instead of an array's elements),
 *   - one child $effect PER CHAT (deep-reads that whole chat),
 *   - VARIANT B additionally splits the ACTIVE chat (character.chatPage)
 *     into one grandchild $effect PER MESSAGE, so a streamed-token append
 *     into the active chat only re-runs ONE message's snapshot instead of
 *     that whole chat's.
 *
 * THIS IS A PROTOTYPE, NOT THE REAL EFFECT. It lives entirely in this file
 * (`registerSelectionPartitionEffect` below), clearly labelled, and is
 * never imported into or from src/. It reuses the real
 * `character-scaling-fixture.ts` fixture builders only.
 *
 * No `stores.svelte` mocking needed here (unlike M1's harness) -- this
 * builds its own standalone `$state()` container, exactly like
 * module-effect-overhead-bench.svelte.ts's approach, since the prototype
 * effect is not `registerDbChangeEffects` itself.
 *
 * MEASURED:
 *  (1) Steady-state flush cost for M1's three writes (field-desc,
 *      field-lorebook, token-append into the ACTIVE chat's last message),
 *      at the same 5 fixture points as M1, for BOTH variants (per-chat only
 *      vs per-chat+per-message-for-active-chat).
 *  (2) One-time cost of SWITCHING SELECTION (tearing down all children of
 *      the previously-selected character and creating all children of the
 *      newly-selected one) at 10k/50k total messages, toggling between two
 *      same-shaped characters.
 *  (3) [P2, coordinator follow-up] Retained heap of the per-message-active
 *      variant vs per-chat-only, at a 10k- and 50k-message active chat.
 *
 * Methodology: 3 warmup + 15 measured, median/min/max (see M1's file header
 * for why "max" is reported instead of a fabricated interpolated p95 at
 * n=15). Heap measurements (3) use the scenario-isolation + discarded-
 * warmup-sample fix documented in `dbchange-proxy-baseline-bench.svelte.harness.ts`'s
 * header (each scenario is its own function returning only a number; one
 * discarded warm-up measurement before the first trusted sample).
 *
 * Run:
 *   NODE_OPTIONS=--expose-gc npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/dbchange-selection-partition-bench.svelte.harness.ts --reporter=verbose
 */
import { flushSync } from 'svelte'
import { describe, test, expect } from 'vitest'
import { buildSelectedCharacterFixture } from './character-scaling-fixture'

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

type Variant = 'per-field-per-chat' | 'per-field-per-chat-per-message-active'

/**
 * PROTOTYPE. Outer effect reads `state.selId` and the selected character's
 * identity (shape/selection-change dependency). Field children and chat
 * children are recreated whenever the outer re-runs (selection switch).
 * `runLog` records every child effect run for isolation checks.
 */
function registerSelectionPartitionEffect(
    state: { db: { characters: Record<string, any>[] }; selId: number },
    variant: Variant,
    runLog: { fieldRuns: number; chatRuns: number; messageRuns: number; outerRuns: number },
): () => void {
    return $effect.root(() => {
        $effect(() => {
            const sel = state.db.characters[state.selId]
            runLog.outerRuns++
            if (!sel) return
            // Field children: one per non-'chats' key.
            for (const key in sel) {
                if (key === 'chats') continue
                $effect(() => {
                    $state.snapshot(sel[key])
                    runLog.fieldRuns++
                })
            }
            // Chat children.
            const chats = sel.chats as Record<string, any>[]
            const activeIdx = sel.chatPage ?? chats.length - 1
            for (let i = 0; i < chats.length; i++) {
                const isActive = i === activeIdx
                if (variant === 'per-field-per-chat-per-message-active' && isActive) {
                    $effect(() => {
                        const chat = chats[i]
                        // Chat-level shallow fields, still deep-read (small: note/name/localLore/id).
                        $state.snapshot(chat.note)
                        $state.snapshot(chat.name)
                        $state.snapshot(chat.localLore)
                        $state.snapshot(chat.id)
                        $state.snapshot(chat.lastDate)
                        runLog.chatRuns++
                        const msgs = chat.message as unknown[]
                        for (let m = 0; m < msgs.length; m++) {
                            $effect(() => {
                                $state.snapshot(msgs[m])
                                runLog.messageRuns++
                            })
                        }
                    })
                } else {
                    $effect(() => {
                        $state.snapshot(chats[i])
                        runLog.chatRuns++
                    })
                }
            }
        })
    })
}

function makeRunLog() {
    return { fieldRuns: 0, chatRuns: 0, messageRuns: 0, outerRuns: 0 }
}

interface Condition { totalMessages: number; chatCount: number; label: string }
const CONDITIONS: Condition[] = [
    { totalMessages: 1000, chatCount: 10, label: '1k msgs / 10 chats' },
    { totalMessages: 10000, chatCount: 1, label: '10k msgs / 1 chat' },
    { totalMessages: 10000, chatCount: 10, label: '10k msgs / 10 chats' },
    { totalMessages: 10000, chatCount: 50, label: '10k msgs / 50 chats' },
    { totalMessages: 50000, chatCount: 10, label: '50k msgs / 10 chats' },
]
const VARIANTS: Variant[] = ['per-field-per-chat', 'per-field-per-chat-per-message-active']

describe('M2 — selection-scoped partition prototype: steady-state flush cost', () => {
    for (const cond of CONDITIONS) {
        for (const variant of VARIANTS) {
            test(`${variant} @ ${cond.label}`, () => {
                const { character, lastChatIndex, lastMessageIndex } = buildSelectedCharacterFixture({
                    chaId: 'selected',
                    totalMessages: cond.totalMessages,
                    chatCount: cond.chatCount,
                })
                ;(character as any).chatPage = lastChatIndex // active chat = last chat, matches the "streamed token into last message" write
                const state = $state({ db: { characters: [character] }, selId: 0 })
                const runLog = makeRunLog()
                const cleanup = registerSelectionPartitionEffect(state, variant, runLog)
                flush() // mount, discarded

                const writers: Record<string, () => void> = {
                    'field-desc': () => {
                        state.db.characters[0].desc = 'edited desc'
                    },
                    'field-lorebook': () => {
                        state.db.characters[0].globalLore[0].content = 'edited lore'
                    },
                    'token-append (active chat, last msg)': () => {
                        const chats = state.db.characters[0].chats
                        chats[lastChatIndex].message[lastMessageIndex].data += ' tok'
                    },
                }

                const lines: string[] = ['', `=== M2 ${variant} @ ${cond.label} ===`]
                for (const [name, fn] of Object.entries(writers)) {
                    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
                        fn()
                        flush()
                    }
                    const samples: number[] = []
                    for (let i = 0; i < MEASURED_ITERATIONS; i++) {
                        const start = performance.now()
                        fn()
                        flush()
                        samples.push(performance.now() - start)
                    }
                    const r = summarize(samples)
                    lines.push(`  ${name}: min=${r.minMs.toFixed(3)}ms median=${r.medianMs.toFixed(3)}ms max=${r.maxMs.toFixed(3)}ms`)
                }
                cleanup()
                lines.push('=== end ===', '')
                console.log(lines.join('\n'))
                expect(true).toBe(true)
            }, 30000)
        }
    }
})

describe('M2 — one-time selection-switch cost (teardown + recreate all children)', () => {
    for (const totalMessages of [10000, 50000]) {
        test(`switch cost @ ${totalMessages} msgs (10 chats each, per-field-per-chat variant)`, () => {
            const a = buildSelectedCharacterFixture({ chaId: 'char-A', totalMessages, chatCount: 10, seedOffset: 1 }).character
            const b = buildSelectedCharacterFixture({ chaId: 'char-B', totalMessages, chatCount: 10, seedOffset: 2 }).character
            const state = $state({ db: { characters: [a, b] }, selId: 0 })
            const runLog = makeRunLog()
            const cleanup = registerSelectionPartitionEffect(state, 'per-field-per-chat', runLog)
            flush()

            let toggle = true
            for (let i = 0; i < WARMUP_ITERATIONS; i++) {
                state.selId = toggle ? 1 : 0
                toggle = !toggle
                flush()
            }
            const samples: number[] = []
            for (let i = 0; i < MEASURED_ITERATIONS; i++) {
                const start = performance.now()
                state.selId = toggle ? 1 : 0
                toggle = !toggle
                flush()
                samples.push(performance.now() - start)
            }
            cleanup()
            const r = summarize(samples)
            console.log(
                [
                    '',
                    `=== M2 selection-switch cost @ ${totalMessages} msgs ===`,
                    `  min=${r.minMs.toFixed(3)}ms median=${r.medianMs.toFixed(3)}ms max=${r.maxMs.toFixed(3)}ms`,
                    '  (tears down ~1 outer + N field children + M chat children of the OLD selection,',
                    '   creates the same set for the NEW selection, deep-reading every field and chat once each)',
                    '=== end ===',
                    '',
                ].join('\n'),
            )
            expect(true).toBe(true)
        }, 30000)
    }
})

describe('P2 — M2 memory: retained heap, per-message-active vs per-chat-only', () => {
    for (const totalMessages of [10000, 50000]) {
        test(`retained heap @ ${totalMessages}-message active chat (chatCount=1)`, () => {
            if (typeof (global as any).gc !== 'function') {
                console.log('\n=== P2: UNMEASURED -- global.gc unavailable. Re-run with NODE_OPTIONS=--expose-gc. ===\n')
                expect(true).toBe(true)
                return
            }
            const gc = (global as any).gc as () => void
            const { character: rawCharacter } = buildSelectedCharacterFixture({
                chaId: 'selected',
                totalMessages,
                chatCount: 1, // the whole chat IS the active chat
                seedOffset: 8000 + totalMessages,
            })
            ;(rawCharacter as any).chatPage = 0

            function measurePlain(): number {
                gc()
                const before = process.memoryUsage().heapUsed
                const plainClone = structuredClone(rawCharacter)
                gc()
                const after = process.memoryUsage().heapUsed
                void plainClone
                return after - before
            }
            function measurePerChatOnly(): number {
                gc()
                const before = process.memoryUsage().heapUsed
                const clone = structuredClone(rawCharacter)
                const state = $state({ db: { characters: [clone] }, selId: 0 })
                const runLog = makeRunLog()
                const cleanup = registerSelectionPartitionEffect(state, 'per-field-per-chat', runLog)
                flush()
                gc()
                const after = process.memoryUsage().heapUsed
                cleanup()
                return after - before
            }
            function measurePerMessageActive(): { bytes: number; messageRuns: number } {
                gc()
                const before = process.memoryUsage().heapUsed
                const clone = structuredClone(rawCharacter)
                const state = $state({ db: { characters: [clone] }, selId: 0 })
                const runLog = makeRunLog()
                const cleanup = registerSelectionPartitionEffect(state, 'per-field-per-chat-per-message-active', runLog)
                flush()
                gc()
                const after = process.memoryUsage().heapUsed
                const messageRuns = runLog.messageRuns
                cleanup()
                return { bytes: after - before, messageRuns }
            }

            // Discarded warm-up -- a first-measurement GC-settling anomaly was
            // observed empirically in the P1 follow-up (see that file's header);
            // apply the same fix here rather than trust an un-warmed-up first sample.
            measurePlain()

            function avgMB(runs: number[]): number {
                return runs.reduce((a, b) => a + b, 0) / runs.length / 1024 / 1024
            }
            function fmtMB(runs: number[]): string {
                return runs.map((r) => (r / 1024 / 1024).toFixed(1)).join(', ')
            }

            const plainRuns = [measurePlain(), measurePlain()]
            const perChatRuns = [measurePerChatOnly(), measurePerChatOnly()]
            const r1 = measurePerMessageActive()
            const r2 = measurePerMessageActive()
            const perMsgRuns = [r1.bytes, r2.bytes]

            const plainMB = avgMB(plainRuns)
            const perChatMB = avgMB(perChatRuns)
            const perMsgMB = avgMB(perMsgRuns)

            console.log(
                [
                    '',
                    `=== P2 retained heap @ ${totalMessages}-message active chat ===`,
                    `  plain data (no reactivity):                    avg=${plainMB.toFixed(2)} MB  [runs: ${fmtMB(plainRuns)}]`,
                    `  per-chat-only (1 child effect for the chat):   avg=${perChatMB.toFixed(2)} MB  [runs: ${fmtMB(perChatRuns)}]  (-> +${(perChatMB - plainMB).toFixed(2)} MB over plain)`,
                    `  per-message-active (${r1.messageRuns} grandchild effects): avg=${perMsgMB.toFixed(2)} MB  [runs: ${fmtMB(perMsgRuns)}]  (-> +${(perMsgMB - plainMB).toFixed(2)} MB over plain)`,
                    `  per-message-active's OWN marginal addition over per-chat-only: +${(perMsgMB - perChatMB).toFixed(2)} MB for ${r1.messageRuns} extra effect-node objects (~${(((perMsgMB - perChatMB) * 1024 * 1024) / r1.messageRuns).toFixed(0)} bytes/message-effect)`,
                    '=== end ===',
                    '',
                ].join('\n'),
            )
            expect(true).toBe(true)
        }, 60000)
    }
})
