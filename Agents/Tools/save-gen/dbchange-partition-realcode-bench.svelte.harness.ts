/**
 * Report 17 Stage 2 (§4.3 "Cost") re-run of the M1 harness against the REAL
 * post-partition `registerDbChangeEffects()` (dbChangeEffects.svelte.ts,
 * effect 6 now split into 6a + 6b's front/char/field/chats/chat/message
 * pieces). `dbchange-cost-bench.svelte.harness.ts` in this directory already
 * drives the real function and covers field-desc/field-lorebook/token-append
 * at all 5 M1 fixture points -- re-running it unmodified against the current
 * source already answers "keystroke" and "streamed token" at 10k/50k. This
 * file adds the two writers that harness does NOT have:
 *   - "message-push": push a brand-new message object onto the ACTIVE chat's
 *     `message` array (plan §4.1's accepted cost -- recreates every message
 *     child of that one chat).
 *   - "chatPage-switch": toggle `character.chatPage` between two chat
 *     indices on the SAME character (the mutation §4.1 claims is cheap
 *     because 6b-front is split out from 6b-char).
 * Only at the two ledger-row-62 conditions requested (10k and 50k messages,
 * 10 chats), not the full 5-point M1 grid, to keep this file focused.
 *
 * Also measures retained heap immediately after mount (register + first
 * flush) at the same two conditions, forced-GC method (see
 * dbchange-cost-bench.svelte.harness.ts's header for the same technique and
 * its caveats -- approximate, not a scientific allocation trace).
 *
 * IMPORTANT CAVEAT recorded for the report, not just this file: a field-only
 * write (`character.desc`) and a token-append, measured with
 * dbchange-cost-bench.svelte.harness.ts against the CURRENT partitioned
 * source, scale with TOTAL MESSAGE COUNT even though only one field or one
 * message actually changed (0.69ms @ 10k messages, 3.38-3.46ms @ 50k,
 * roughly linear in message count) -- far below the OLD merged-effect M1
 * numbers (74ms/385ms) but well above the plan's M2 prototype estimate
 * (~0.002ms field, 0.02-0.6ms token, measured with a smaller STANDALONE
 * `$effect.root`, not through the full mounted tree). This suggests a
 * residual per-flush cost proportional to the number of per-message child
 * effects mounted for the character (thousands, one per message), separate
 * from the chatPage-entanglement bug found in the rebuild-count test suite.
 * Traced to Svelte's flush walking every live effect; see
 * `flush-traversal-scaling-bench.svelte.harness.ts` in this directory for
 * confirmation, not papered over by only reporting the median.
 *
 * Same mocking pattern as dbchange-cost-bench.svelte.harness.ts (see that
 * file's header for why the mock factories and every rune call must live in
 * this one `.svelte.harness.ts` file).
 *
 * Run:
 *   NODE_OPTIONS=--expose-gc npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/dbchange-partition-realcode-bench.svelte.harness.ts --reporter=verbose
 *
 * Read-only w.r.t. src/ -- drives the real module, does not modify it.
 */
import { flushSync } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi } from 'vitest'
import type { Database } from '../../../src/ts/storage/database.svelte'
import type { toSaveType } from '../../../src/ts/storage/risuSave'
import { buildSelectedCharacterFixture } from './character-scaling-fixture'

//#region module mocks (identical pattern to dbchange-cost-bench.svelte.harness.ts)

const store = new Map<string, unknown>()

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: unknown) => {
                store.set(key, value)
            }),
            removeItem: vi.fn(async (key: string) => {
                store.delete(key)
            }),
        }),
    },
}))

vi.mock(
    import('src/ts/globalApi.svelte'),
    () =>
        ({
            forageStorage: {
                keys: vi.fn(async () => []),
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => {}),
            },
        }) as unknown as typeof import('src/ts/globalApi.svelte'),
)

vi.mock(
    import('src/ts/storage/database.svelte'),
    () =>
        ({
            getDatabase: vi.fn(() => {
                throw new Error('no live database in tests')
            }),
            presetTemplate: { name: 'test-preset' },
        }) as unknown as typeof import('src/ts/storage/database.svelte'),
)

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

vi.mock(import('../../../src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as typeof import('../../../src/ts/stores.svelte')
})

//#endregion

import { DBState, selectedCharID } from '../../../src/ts/stores.svelte'
import { registerDbChangeEffects } from '../../../src/ts/storage/dbChangeEffects.svelte'

//#region helpers

function makeTracker(): toSaveType {
    return { character: [], chat: [], botPreset: false, modules: false, loadouts: false, plugins: false, pluginCustomStorage: false }
}

function installDb(character: Record<string, unknown>): void {
    DBState.db = {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characterOrder: [character.chaId as string],
        characters: [character],
    } as unknown as Database
}

function flush(): void {
    flushSync()
}

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15

interface TimingResult { minMs: number; medianMs: number; maxMs: number }
function summarize(samples: number[]): TimingResult {
    return { minMs: Math.min(...samples), medianMs: median(samples), maxMs: Math.max(...samples) }
}

//#endregion

interface Condition { totalMessages: number; chatCount: number; label: string }
const CONDITIONS: Condition[] = [
    { totalMessages: 10000, chatCount: 10, label: '10k msgs / 10 chats' },
    { totalMessages: 50000, chatCount: 10, label: '50k msgs / 10 chats' },
]

describe('Report 17 §4.3 — message-push and chatPage-switch cost, real registerDbChangeEffects', () => {
    for (const cond of CONDITIONS) {
        test(`message-push and chatPage-switch @ ${cond.label}`, () => {
            const { character, lastChatIndex } = buildSelectedCharacterFixture({
                chaId: 'selected',
                totalMessages: cond.totalMessages,
                chatCount: cond.chatCount,
            })
            // Active chat = the last chat (largest index), matching the other
            // harnesses' "streamed token into last chat" convention.
            ;(character as any).chatPage = lastChatIndex
            const otherChatIndex = 0 // toggle target for chatPage-switch, always != lastChatIndex when chatCount > 1
            installDb(character)
            const tracker = makeTracker()
            const markChanged = vi.fn()
            selectedCharID.set(0)
            const cleanup = $effect.root(() => {
                registerDbChangeEffects({ tracker, markChanged })
            })
            flush() // first run, discarded

            let counter = 0
            let toggle = true

            const writers: Record<string, () => void> = {
                'message-push (active chat)': () => {
                    const chats = (DBState.db.characters[0] as any).chats
                    chats[lastChatIndex].message.push({
                        role: 'char',
                        data: `pushed message ${counter++}`,
                        time: Date.now(),
                    })
                },
                'chatPage-switch': () => {
                    ;(DBState.db.characters[0] as any).chatPage = toggle ? otherChatIndex : lastChatIndex
                    toggle = !toggle
                },
            }

            const results: Record<string, TimingResult> = {}
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
                results[name] = summarize(samples)
            }

            cleanup()

            console.log(
                [
                    '',
                    `=== Report17-partition-realcode: ${cond.label} (warmup=${WARMUP_ITERATIONS} measured=${MEASURED_ITERATIONS}) ===`,
                    `  message-push (active chat) write -> flush: min=${results['message-push (active chat)'].minMs.toFixed(3)}ms median=${results['message-push (active chat)'].medianMs.toFixed(3)}ms max=${results['message-push (active chat)'].maxMs.toFixed(3)}ms`,
                    `  chatPage-switch             write -> flush: min=${results['chatPage-switch'].minMs.toFixed(3)}ms median=${results['chatPage-switch'].medianMs.toFixed(3)}ms max=${results['chatPage-switch'].maxMs.toFixed(3)}ms`,
                    '=== end ===',
                    '',
                ].join('\n'),
            )

            expect(results['message-push (active chat)'].medianMs).toBeGreaterThan(0)
        }, 60000)
    }
})

describe('CHORE-01 fix verification — keystroke cost immediately after a chatPage switch (the case the ownKeys/for-in bug broke)', () => {
    for (const cond of CONDITIONS) {
        test(`keystroke after chatPage-switch @ ${cond.label}`, () => {
            const { character, lastChatIndex } = buildSelectedCharacterFixture({
                chaId: 'selected',
                totalMessages: cond.totalMessages,
                chatCount: cond.chatCount,
            })
            ;(character as any).chatPage = lastChatIndex
            const otherChatIndex = 0
            installDb(character)
            const tracker = makeTracker()
            const markChanged = vi.fn()
            selectedCharID.set(0)
            const cleanup = $effect.root(() => {
                registerDbChangeEffects({ tracker, markChanged })
            })
            flush() // first run, discarded

            let counter = 0
            let toggle = true

            function switchChatPage(): void {
                ;(DBState.db.characters[0] as any).chatPage = toggle ? otherChatIndex : lastChatIndex
                toggle = !toggle
            }
            function keystroke(): void {
                ;(DBState.db.characters[0] as any).desc = `edited description ${counter++}`
            }

            // Warmup: switch (untimed) then keystroke (untimed).
            for (let i = 0; i < WARMUP_ITERATIONS; i++) {
                switchChatPage()
                flush()
                keystroke()
                flush()
            }

            // Measured: the switch + its flush are UNTIMED (they are their own
            // cost, already measured above as "chatPage-switch"); only the
            // keystroke write that follows the switch, and its flush, is
            // timed -- this isolates exactly the case the `for...in`
            // char-outer-effect bug broke (a chatPage change left `chatPage`
            // subscribed as a value dependency of the char outer effect, so
            // every subsequent keystroke re-ran and rebuilt the whole
            // field/chats/chat/message subtree, not just the one field that
            // changed).
            const samples: number[] = []
            for (let i = 0; i < MEASURED_ITERATIONS; i++) {
                switchChatPage()
                flush() // untimed: settle the switch itself first
                const start = performance.now()
                keystroke()
                flush()
                samples.push(performance.now() - start)
            }
            const result = summarize(samples)

            cleanup()

            console.log(
                [
                    '',
                    `=== keystroke-after-chatPage-switch: ${cond.label} (warmup=${WARMUP_ITERATIONS} measured=${MEASURED_ITERATIONS}) ===`,
                    `  keystroke (desc) immediately after chatPage-switch -> flush: min=${result.minMs.toFixed(3)}ms median=${result.medianMs.toFixed(3)}ms max=${result.maxMs.toFixed(3)}ms`,
                    '=== end ===',
                    '',
                ].join('\n'),
            )

            expect(result.medianMs).toBeGreaterThan(0)
        }, 60000)
    }
})

describe('Report 17 §4.3 — retained heap immediately after mount (real registerDbChangeEffects)', () => {
    test('heapUsed delta after register + first flush, at 10k and 50k messages', () => {
        const gcAvailable = typeof (global as any).gc === 'function'
        if (!gcAvailable) {
            console.log(
                '\n=== heap-after-mount: UNMEASURED — global.gc is not available. ' +
                    'Re-run with NODE_OPTIONS=--expose-gc to enable this block. ===\n',
            )
            expect(true).toBe(true)
            return
        }
        const gc = (global as any).gc as () => void
        const lines: string[] = ['', '=== heap-after-mount (approximate, forced-GC delta) ===']
        for (const cond of CONDITIONS) {
            const { character } = buildSelectedCharacterFixture({
                chaId: 'selected',
                totalMessages: cond.totalMessages,
                chatCount: cond.chatCount,
            })
            gc()
            const before = process.memoryUsage().heapUsed
            installDb(character)
            const tracker = makeTracker()
            const markChanged = vi.fn()
            selectedCharID.set(0)
            const cleanup = $effect.root(() => {
                registerDbChangeEffects({ tracker, markChanged })
            })
            flush()
            gc()
            const after = process.memoryUsage().heapUsed
            lines.push(`  ${cond.label}: heapUsed delta after mount = ${((after - before) / 1024 / 1024).toFixed(2)} MB`)
            cleanup()
            selectedCharID.set(-1)
        }
        lines.push('=== end ===', '')
        console.log(lines.join('\n'))
        expect(true).toBe(true)
    }, 60000)
})
