/**
 * Headless measurement harness: the REAL cost of `$state.snapshot()` over
 * live Svelte 5 reactive proxies, for the two suspected effects:
 *   - src/ts/globalApi.svelte.ts:620-625 AND src/ts/stores.svelte.ts:195-204
 *     — both snapshot `DBState.db.modules` (paid TWICE per module-editor
 *     keystroke).
 *   - src/ts/globalApi.svelte.ts:658-667 — snapshots the active character's
 *     chats on every streaming chunk.
 *
 * WHY HEADLESS: bootstrap.ts:230-234,309-316 hard-depends on a service
 * worker (`/sw/init`) and reload-loops if registration fails; a browser
 * pane that can't register service workers can never get RisuAI's own UI
 * far enough to measure this interactively. This harness reproduces the
 * exact same primitive (`$state.snapshot()` over a `$state`-deep-proxied
 * object tree) without needing the app to boot at all — see
 * svelte-proxy-bench.svelte.ts's file header for the specific, documented
 * deviation (own `$state` container instead of the app's real `DBState`)
 * and the concrete failure that justified it.
 *
 * Lives inside the repo, under Agents/Tools/save-gen/; only ever run
 * against ../vitest.harness.config.ts. `pnpm test` never discovers this
 * file because its `*.harness.ts` suffix doesn't match vitest's default
 * `*.spec.ts`/`*.test.ts` include glob.
 */
import { describe, test, expect } from 'vitest'
import { buildTierDatabase, generateProse, mulberry32, SEED, type TierName } from './build'
import { makeProxiedDbState, snapshotModules, snapshotActiveChats, makeProxiedValue, snapshotValue } from './svelte-proxy-bench.svelte'

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const WARMUP_ITERATIONS = 3
const MEASURED_ITERATIONS = 15

/** Runs `fn()` WARMUP_ITERATIONS times (discarded) then MEASURED_ITERATIONS times, timed. Returns {minMs, medianMs}. */
function timeit(fn: () => unknown): { minMs: number; medianMs: number; samples: number[] } {
    for (let i = 0; i < WARMUP_ITERATIONS; i++) fn()
    const samples: number[] = []
    for (let i = 0; i < MEASURED_ITERATIONS; i++) {
        const start = performance.now()
        fn()
        samples.push(performance.now() - start)
    }
    return { minMs: Math.min(...samples), medianMs: median(samples), samples }
}

const TIERS: TierName[] = ['light', 'chat-heavy', 'module-heavy', 'both-heavy']

const FRAME_BUDGET_MS = 1000 / 60 // 16.7ms

describe('Svelte 5 $state.snapshot() proxy-cost benchmark (headless)', () => {
    const results: Record<
        string,
        {
            modulesProxyMs: { min: number; median: number }
            modulesFloorMs: { min: number; median: number }
            chatsProxyMs: { min: number; median: number }
            chatsFloorMs: { min: number; median: number }
            moduleCount: number
            moduleBytes: number
            activeMessages: number
        }
    > = {}

    for (const tier of TIERS) {
        test(`measures proxy snapshot cost for tier: ${tier}`, () => {
            const { database, stats } = buildTierDatabase(tier)
            const modules = database.modules as Record<string, unknown>[]
            const characters = database.characters as Record<string, unknown>[]
            const activeIndex = 0
            const activeChats = (characters[activeIndex] as any).chats

            // --- Plain-object floor, recomputed HERE (same process/run) on the
            // still-unproxied fixture, so the ratio below is apples-to-apples
            // rather than compared against a number from an earlier run. ---
            const modulesFloor = timeit(() => structuredClone(modules))
            const chatsFloor = timeit(() => structuredClone(activeChats))

            // --- Now wrap the SAME fixture in a $state container (see
            // svelte-proxy-bench.svelte.ts for exactly what this does and does
            // not reproduce from the real app) and measure the real proxy cost. ---
            const state = makeProxiedDbState(database)
            const modulesProxy = timeit(() => snapshotModules(state))
            const chatsProxy = timeit(() => snapshotActiveChats(state, activeIndex))

            const moduleBytes = new TextEncoder().encode(JSON.stringify(modules)).byteLength

            results[tier] = {
                modulesProxyMs: { min: modulesProxy.minMs, median: modulesProxy.medianMs },
                modulesFloorMs: { min: modulesFloor.minMs, median: modulesFloor.medianMs },
                chatsProxyMs: { min: chatsProxy.minMs, median: chatsProxy.medianMs },
                chatsFloorMs: { min: chatsFloor.minMs, median: chatsFloor.medianMs },
                moduleCount: stats.moduleCount,
                moduleBytes,
                activeMessages: stats.activeCharacterMessages,
            }

            // Sanity: the proxied snapshot must reproduce the same shape/size as the plain original.
            expect((snapshotModules(state) as unknown[]).length).toBe(modules.length)
            expect((snapshotActiveChats(state, activeIndex) as unknown[]).length).toBe(activeChats.length)
        })
    }

    test('reports summary table + per-keystroke figure + honesty caveats', () => {
        // This runs after the four measurement tests above (vitest runs tests
        // within a describe block in declaration order by default).
        expect(Object.keys(results).length).toBe(TIERS.length)

        console.log('\n=== $state.snapshot() proxy-cost benchmark summary ===')
        console.log(`seed=${SEED} warmup=${WARMUP_ITERATIONS} measuredIterations=${MEASURED_ITERATIONS} (medians reported, first/warmup samples discarded)`)
        for (const tier of TIERS) {
            const r = results[tier]
            const modulesRatio = r.modulesProxyMs.median / Math.max(r.modulesFloorMs.median, 0.001)
            const chatsRatio = r.chatsProxyMs.median / Math.max(r.chatsFloorMs.median, 0.001)
            const perKeystrokeMs = 2 * r.modulesProxyMs.median // two snapshot call sites per keystroke
            console.log(
                `[${tier}] moduleCount=${r.moduleCount} moduleBytes=${r.moduleBytes} activeMessages=${r.activeMessages}\n` +
                    `  modules:  proxy min=${r.modulesProxyMs.min.toFixed(3)}ms median=${r.modulesProxyMs.median.toFixed(3)}ms` +
                    `  | floor(structuredClone) min=${r.modulesFloorMs.min.toFixed(3)}ms median=${r.modulesFloorMs.median.toFixed(3)}ms` +
                    `  | ratio(proxy/floor)=${modulesRatio.toFixed(1)}x\n` +
                    `  chats:    proxy min=${r.chatsProxyMs.min.toFixed(3)}ms median=${r.chatsProxyMs.median.toFixed(3)}ms` +
                    `  | floor(structuredClone) min=${r.chatsFloorMs.min.toFixed(3)}ms median=${r.chatsFloorMs.median.toFixed(3)}ms` +
                    `  | ratio(proxy/floor)=${chatsRatio.toFixed(1)}x\n` +
                    `  per-keystroke (2x modules snapshot): ${perKeystrokeMs.toFixed(3)}ms vs ${FRAME_BUDGET_MS.toFixed(1)}ms frame budget` +
                    `  -> ${perKeystrokeMs > FRAME_BUDGET_MS ? 'EXCEEDS budget alone' : `${((perKeystrokeMs / FRAME_BUDGET_MS) * 100).toFixed(0)}% of budget alone`}`,
            )
        }
        console.log('=== end summary ===\n')
    })

    // --- Cheap, targeted scaling probe: does snapshot cost track total BYTES
    // or ENTRY COUNT? Two arrays with ~equal total string content, wildly
    // different element counts. ---
    test('scaling probe: snapshot cost vs entry count at ~fixed total bytes', () => {
        const rng = mulberry32(SEED + 999)
        const TARGET_TOTAL_BYTES = 400_000

        function makeEntries(count: number, contentLenEach: number) {
            return Array.from({ length: count }, (_, i) => ({
                key: `k${i}`,
                secondkey: '',
                insertorder: i,
                comment: `entry ${i}`,
                content: generateProse(rng, contentLenEach, contentLenEach + 20),
                mode: 'normal' as const,
                alwaysActive: false,
                selective: false,
            }))
        }

        const manyEntries = makeEntries(4000, Math.round(TARGET_TOTAL_BYTES / 4000)) // 4000 small entries
        const fewEntries = makeEntries(4, Math.round(TARGET_TOTAL_BYTES / 4)) // 4 huge entries

        const manyBytes = new TextEncoder().encode(JSON.stringify(manyEntries)).byteLength
        const fewBytes = new TextEncoder().encode(JSON.stringify(fewEntries)).byteLength

        const manyState = makeProxiedValue(manyEntries)
        const fewState = makeProxiedValue(fewEntries)

        const manyTiming = timeit(() => snapshotValue(manyState))
        const fewTiming = timeit(() => snapshotValue(fewState))

        console.log(
            `\n=== scaling probe: count vs bytes ===\n` +
                `manyEntries: count=${manyEntries.length} bytes=${manyBytes} snapshot median=${manyTiming.medianMs.toFixed(3)}ms min=${manyTiming.minMs.toFixed(3)}ms\n` +
                `fewEntries:  count=${fewEntries.length} bytes=${fewBytes} snapshot median=${fewTiming.medianMs.toFixed(3)}ms min=${fewTiming.minMs.toFixed(3)}ms\n` +
                `bytes ratio (many/few) = ${(manyBytes / fewBytes).toFixed(2)}x  |  time ratio (many/few) = ${(manyTiming.medianMs / Math.max(fewTiming.medianMs, 0.001)).toFixed(1)}x\n` +
                `-> if time ratio >> bytes ratio, cost tracks ENTRY COUNT, not payload size (a fix should bound array length); ` +
                `if time ratio ~= bytes ratio, cost tracks payload size instead.\n` +
                `=== end scaling probe ===\n`,
        )

        // Not a strict pass/fail gate on the ratio itself (that's the finding to
        // report, not a regression threshold) — just confirm both snapshots are
        // structurally intact.
        expect((snapshotValue(manyState) as unknown[]).length).toBe(manyEntries.length)
        expect((snapshotValue(fewState) as unknown[]).length).toBe(fewEntries.length)
    })
})
