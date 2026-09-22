/**
 * M1 — TODAY'S COST of dbChangeEffects.svelte.ts's effect 6
 * (:93-122, "Selection-scoped partition" measurement request, item M1).
 *
 * Drives the REAL `registerDbChangeEffects()` against a mocked-but-genuinely-
 * reactive `DBState`/`selectedCharID` (exact mocking pattern as
 * trash-restore-repro.svelte.harness.ts and
 * src/ts/storage/tests/dbChangeEffects.svelte.test.ts — see those files'
 * headers for why the mock factory and every rune call must live in this one
 * `.svelte.harness.ts` file, not split across a `.svelte.ts` sibling).
 *
 * WHAT IS MEASURED, per (totalMessages, chatCount) fixture point:
 *   (a) "keystroke-like" write to `character.desc` (one non-chat field).
 *   (b) "keystroke-like" write to one lorebook entry's `content`
 *       (`character.globalLore[0].content`).
 *   (c) "streamed-token-like" write: append text to the LAST message's
 *       `data` in the LAST chat.
 * For each, one full `flushSync()` cycle is timed (mutate -> flush), which
 * re-runs effect 6's ENTIRE body — the field loop over every non-`chats` key
 * PLUS `$state.snapshot(character.chats)` — regardless of which single field
 * changed, because it is one `$effect` with one dependency-triggered
 * re-execution. This is why (a)/(b)/(c) are expected to cost about the same
 * per fixture point: whichever field changes, the whole body re-runs.
 *
 * WHICH PART DOMINATES (field loop vs chats snapshot): the whole-body flush
 * time alone cannot separate this (both parts always run together). A
 * second block below measures each part IN ISOLATION as a raw
 * `$state.snapshot()` call on a standalone `$state()` container (same
 * decomposition technique as module-partition-bench.svelte.ts — no mocking
 * needed here, since it never touches `stores.svelte`), then cross-checks
 * fieldsOnly + chatsOnly against the real end-to-end flush time as a sanity
 * check.
 *
 * FIXTURE POINTS: rather than the full 3x3 cross product of
 * {1000,10000,50000} total messages x {1,10,50} chats (27 conditions x 3
 * write types x 18 flushes = too slow to run at the repo's standard 15
 * measured samples), each axis is varied while holding the other at a
 * representative value: chatCount=10 fixed while totalMessages varies over
 * {1000,10000,50000}, and totalMessages=10000 fixed while chatCount varies
 * over {1,10,50} (the 10000/10 point is shared, so 5 distinct conditions,
 * not 6). This still answers "does it scale with message count" and "does
 * it scale with chat count" separately, at the repo's standard rigor
 * (3 warmup + 15 measured, median + min/max reported).
 *
 * HEAP ALLOCATION PER FLUSH: `$state.snapshot()` deep-clones its argument
 * and (in effect 6) discards the result immediately — nothing retains it.
 * There is no built-in Node allocation counter for "bytes allocated even if
 * immediately garbage" short of `--trace-gc`/heap-profiler instrumentation,
 * which this harness does not add. Instead: force a major GC
 * (`global.gc()`, requires `NODE_OPTIONS=--expose-gc` — verified to
 * propagate into vitest's worker-thread pool in this repo), record
 * `process.memoryUsage().heapUsed`, run ONE flush synchronously (no GC
 * in between), record `heapUsed` again immediately. The delta is a
 * reasonable proxy for that flush's peak transient allocation (V8 does not
 * run a synchronous major GC mid-script for one flush-sized allocation at
 * these fixture sizes, confirmed by the deltas actually appearing instead of
 * reading ~0), but it is NOT a scientific allocation trace — it can include
 * allocator overhead/fragmentation and any GC that Node's runtime decided to
 * run for unrelated reasons. Labelled as an approximation, not exact.
 * If `global.gc` is unavailable, this block is skipped and reported as
 * UNMEASURED with the flag needed to enable it.
 *
 * Run:
 *   NODE_OPTIONS=--expose-gc npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/dbchange-cost-bench.svelte.harness.ts --reporter=verbose
 *
 * Read-only w.r.t. src/ — drives the real module, does not modify it.
 */
import { flushSync } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi } from 'vitest'
import type { Database } from '../../../src/ts/storage/database.svelte'
import type { toSaveType } from '../../../src/ts/storage/risuSave'
import { buildSelectedCharacterFixture } from './character-scaling-fixture'

//#region module mocks (identical pattern to trash-restore-repro.svelte.harness.ts)

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

interface TimingResult { minMs: number; medianMs: number; maxMs: number; samples: number[] }

/** p95-proxy note: with n=15 the 95th percentile is effectively the max of the tail; report BOTH median and max, not a fabricated interpolated p95. */
function summarize(samples: number[]): TimingResult {
    return { minMs: Math.min(...samples), medianMs: median(samples), maxMs: Math.max(...samples), samples }
}

//#endregion

type WriteKind = 'field-desc' | 'field-lorebook' | 'token-append'

interface Condition { totalMessages: number; chatCount: number; label: string }

const CONDITIONS: Condition[] = [
    { totalMessages: 1000, chatCount: 10, label: '1k msgs / 10 chats' },
    { totalMessages: 10000, chatCount: 1, label: '10k msgs / 1 chat' },
    { totalMessages: 10000, chatCount: 10, label: '10k msgs / 10 chats' },
    { totalMessages: 10000, chatCount: 50, label: '10k msgs / 50 chats' },
    { totalMessages: 50000, chatCount: 10, label: '50k msgs / 10 chats' },
]

describe('M1 — dbChangeEffects.svelte.ts effect 6: today\'s per-flush cost driving the REAL effect', () => {
    for (const cond of CONDITIONS) {
        test(`flush cost @ ${cond.label}`, () => {
            const { character, lastChatIndex, lastMessageIndex } = buildSelectedCharacterFixture({
                chaId: 'selected',
                totalMessages: cond.totalMessages,
                chatCount: cond.chatCount,
            })
            installDb(character)
            const tracker = makeTracker()
            const markChanged = vi.fn()
            selectedCharID.set(0)
            const cleanup = $effect.root(() => {
                registerDbChangeEffects({ tracker, markChanged })
            })
            flush() // first run, discarded per the contract (markChanged(false))

            const results: Record<WriteKind, TimingResult> = {} as any
            let counter = 0

            const writers: Record<WriteKind, () => void> = {
                'field-desc': () => {
                    ;(DBState.db.characters[0] as any).desc = `edited description ${counter++}`
                },
                'field-lorebook': () => {
                    ;(DBState.db.characters[0] as any).globalLore[0].content = `edited lore content ${counter++}`
                },
                'token-append': () => {
                    const chats = (DBState.db.characters[0] as any).chats
                    chats[lastChatIndex].message[lastMessageIndex].data += ` token-${counter++}`
                },
            }

            for (const kind of Object.keys(writers) as WriteKind[]) {
                const fn = writers[kind]
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
                results[kind] = summarize(samples)
            }

            cleanup()

            console.log(
                [
                    '',
                    `=== M1 dbchange-cost-bench: ${cond.label} (warmup=${WARMUP_ITERATIONS} measured=${MEASURED_ITERATIONS}) ===`,
                    `  field-desc      write -> flush: min=${results['field-desc'].minMs.toFixed(3)}ms median=${results['field-desc'].medianMs.toFixed(3)}ms max(p95-proxy,n=15)=${results['field-desc'].maxMs.toFixed(3)}ms`,
                    `  field-lorebook  write -> flush: min=${results['field-lorebook'].minMs.toFixed(3)}ms median=${results['field-lorebook'].medianMs.toFixed(3)}ms max(p95-proxy,n=15)=${results['field-lorebook'].maxMs.toFixed(3)}ms`,
                    `  token-append    write -> flush: min=${results['token-append'].minMs.toFixed(3)}ms median=${results['token-append'].medianMs.toFixed(3)}ms max(p95-proxy,n=15)=${results['token-append'].maxMs.toFixed(3)}ms`,
                    '=== end ===',
                    '',
                ].join('\n'),
            )

            expect(results['field-desc'].medianMs).toBeGreaterThan(0)
        }, 60000)
    }
})

describe('M1 — decomposition: field-loop cost vs chats-snapshot cost, isolated', () => {
    for (const cond of CONDITIONS) {
        test(`decompose @ ${cond.label}`, () => {
            const { character } = buildSelectedCharacterFixture({
                chaId: 'selected',
                totalMessages: cond.totalMessages,
                chatCount: cond.chatCount,
            })
            // Standalone $state container -- NOT the mocked DBState -- same
            // technique as module-partition-bench.svelte.ts. No vi.mock
            // involvement, so no risk of the cross-file-mock-factory hazard
            // documented in trash-restore-repro's header (this block doesn't
            // touch stores.svelte at all).
            const state = $state({ char: character as any })

            function snapshotFieldsOnly(): void {
                for (const key in state.char) {
                    if (key !== 'chats') {
                        $state.snapshot((state.char as any)[key])
                    }
                }
            }
            function snapshotChatsOnly(): void {
                $state.snapshot((state.char as any).chats)
            }

            function timeit(fn: () => void): TimingResult {
                for (let i = 0; i < WARMUP_ITERATIONS; i++) fn()
                const samples: number[] = []
                for (let i = 0; i < MEASURED_ITERATIONS; i++) {
                    const start = performance.now()
                    fn()
                    samples.push(performance.now() - start)
                }
                return summarize(samples)
            }

            const fieldsOnly = timeit(snapshotFieldsOnly)
            const chatsOnly = timeit(snapshotChatsOnly)
            const sumMedian = fieldsOnly.medianMs + chatsOnly.medianMs
            const chatsSharePct = (chatsOnly.medianMs / sumMedian) * 100

            console.log(
                [
                    '',
                    `=== M1 decomposition: ${cond.label} ===`,
                    `  field-loop-only (all non-chats keys): min=${fieldsOnly.minMs.toFixed(3)}ms median=${fieldsOnly.medianMs.toFixed(3)}ms`,
                    `  chats-snapshot-only:                  min=${chatsOnly.minMs.toFixed(3)}ms median=${chatsOnly.medianMs.toFixed(3)}ms`,
                    `  sum (should ~= real end-to-end flush cost above): ${sumMedian.toFixed(3)}ms, chats share=${chatsSharePct.toFixed(1)}%`,
                    `  per-message chats-snapshot cost: ${((chatsOnly.medianMs * 1000) / cond.totalMessages).toFixed(2)} µs/message`,
                    '=== end ===',
                    '',
                ].join('\n'),
            )

            expect(chatsOnly.medianMs).toBeGreaterThanOrEqual(0)
        }, 60000)
    }
})

describe('M1 — heap allocation per flush (approximate, see file header for method)', () => {
    test('heapUsed delta immediately after one flush, forced-GC baseline, two representative conditions', () => {
        const gcAvailable = typeof (global as any).gc === 'function'
        if (!gcAvailable) {
            console.log(
                '\n=== M1 heap allocation: UNMEASURED — global.gc is not available. ' +
                    'Re-run with NODE_OPTIONS=--expose-gc to enable this block. ===\n',
            )
            expect(true).toBe(true)
            return
        }
        const gc = (global as any).gc as () => void
        const HEAP_SAMPLE_ITERATIONS = 10
        const reps: Condition[] = [
            { totalMessages: 10000, chatCount: 10, label: '10k msgs / 10 chats' },
            { totalMessages: 50000, chatCount: 10, label: '50k msgs / 10 chats' },
        ]
        const lines: string[] = ['', '=== M1 heap allocation per flush (approximate) ===']
        for (const cond of reps) {
            const { character, lastChatIndex, lastMessageIndex } = buildSelectedCharacterFixture({
                chaId: 'selected',
                totalMessages: cond.totalMessages,
                chatCount: cond.chatCount,
            })
            installDb(character)
            const tracker = makeTracker()
            const markChanged = vi.fn()
            selectedCharID.set(0)
            const cleanup = $effect.root(() => {
                registerDbChangeEffects({ tracker, markChanged })
            })
            flush()

            const deltasBytes: number[] = []
            let counter = 0
            for (let i = 0; i < HEAP_SAMPLE_ITERATIONS; i++) {
                gc()
                const before = process.memoryUsage().heapUsed
                const chats = (DBState.db.characters[0] as any).chats
                chats[lastChatIndex].message[lastMessageIndex].data += ` token-${counter++}`
                flush()
                const after = process.memoryUsage().heapUsed
                deltasBytes.push(after - before)
            }
            cleanup()
            const medDelta = median(deltasBytes)
            lines.push(
                `  ${cond.label}: median heapUsed delta = ${(medDelta / 1024).toFixed(1)} KiB/flush ` +
                    `(n=${HEAP_SAMPLE_ITERATIONS}, samples KiB=[${deltasBytes.map((d) => (d / 1024).toFixed(0)).join(', ')}])`,
            )
        }
        lines.push('=== end ===', '')
        console.log(lines.join('\n'))
        expect(true).toBe(true)
    }, 60000)
})
