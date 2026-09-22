/**
 * P1 follow-up (coordinator request after the M3 report): checks the
 * premise that M3's "+550 MB retained heap" finding was measured against a
 * baseline (TODAY-LIKE, character[0] only) that never forces the other 999
 * characters' proxies to materialize -- but the REAL APP may already force
 * that materialization independently of which `dbChangeEffects` design is
 * chosen, via `saveDb()`'s ONE-TIME boot call:
 *
 *   src/ts/globalApi.svelte.ts:743 (also :935, an explicit re-init path):
 *     let encoder = new RisuSaveEncoder()
 *     await encoder.init(getDatabase(), { compression: forageStorage.isAccount })
 *
 *   src/ts/storage/database.svelte.ts:732-737 -- `getDatabase()` with no
 *   `{snapshot:true}` option (which is how saveDb() calls it) returns
 *   `DBState.db` DIRECTLY -- the LIVE reactive proxy, not a snapshot.
 *
 *   src/ts/storage/risuSave.ts:250-258 (`RisuSaveEncoder.init`):
 *     for (const character of data.characters) {
 *         this.blocks[character.chaId] = await this.encodeBlock({
 *             data: JSON.stringify(character), ...
 *         })
 *     }
 *   -- `JSON.stringify` walks every own-enumerable property of `character`
 *   recursively (via the Proxy's `ownKeys`/`getOwnPropertyDescriptor`/`get`
 *   traps), for EVERY character, unconditionally, once per `saveDb()` call.
 *   `saveDb()` itself is called exactly once per session (see its own
 *   definition, `globalApi.svelte.ts:708+`) to set up the encoder before the
 *   autosave loop begins -- this is a BOOT-TIME cost, not a per-effect one.
 *
 * (a) DOES PROXY ACCESS OUTSIDE ANY EFFECT CREATE AND RETAIN SOURCES/CHILD
 *     PROXIES? Verified against the installed svelte 5.55.1 source,
 *     `node_modules/svelte/src/internal/client/proxy.js`:
 *       - `get(target, prop, receiver)` (:165-199): if no source exists yet
 *         for `prop`, one is created UNCONDITIONALLY -- `with_parent(() => {
 *         var p = proxy(exists ? target[prop] : UNINITIALIZED); var s =
 *         source(p, stack); ... }); sources.set(prop, s)` (:178-190). This
 *         branch has NO guard on `active_effect`/`active_reaction` -- it
 *         runs on every first read of a property, effect or no effect. For
 *         an object/array-valued property, `proxy(target[prop])` (:180)
 *         creates a WHOLE NEW nested Proxy (with its own `sources` Map),
 *         which is then cached forever in the parent's `sources` Map (only
 *         `deleteProperty` ever removes an entry).
 *       - The part that DOES depend on there being an active reaction is
 *         the actual dependency SUBSCRIPTION, which lives in
 *         `runtime.js`'s `get(signal)` (:523+): `if (active_reaction !==
 *         null && !untracking) { ... (active_reaction.deps ??=
 *         []).push(signal); signal.reactions = [active_reaction] ... }`
 *         (:530-563) -- skipped entirely when there is no active reaction.
 *       - CONCLUSION FROM SOURCE: reading a property outside any effect
 *         DOES create and permanently retain the Source + any nested child
 *         Proxy (same memory shape as reading it inside an effect), but
 *         does NOT register a dependency link -- no effect will be notified
 *         of a LATER change to that property, if it was only ever read
 *         outside an effect.
 *     This file verifies BOTH halves of that empirically (test 1 below),
 *     not just by reading source.
 *
 * (b) DOES THE REAL APP TRAVERSE ALL CHARACTERS THROUGH THE PROXY AT BOOT
 *     OR SAVE? Confirmed by direct reading (cited above): YES, at boot,
 *     unconditionally, via `saveDb()` -> `encoder.init(getDatabase())` ->
 *     `JSON.stringify(character)` for every character in `data.characters`,
 *     over the LIVE proxy. After boot, `saveDb()`'s ongoing debounced saves
 *     go through `encoder.set()` instead (`risuSave.ts:271+`), which only
 *     `JSON.stringify`s characters whose `chaId` is in `toSave.character`
 *     (the dirty-tracked ones) -- so the FULL walk is a one-time boot cost,
 *     not a recurring one. Two other traversal sites were checked and are
 *     SHALLOW, not full deep reads (do not change this file's conclusion,
 *     noted for completeness): `coldstorageData.ts`'s
 *     `listColdDataKeysFromDb`/`getColdStorageAffectedCharacters`
 *     (:221-350) iterate every character but only touch
 *     `character.coldstorage`, `character.coldStoragedChats`, and each
 *     chat's FIRST message's `.data` -- not lorebook/customscript/other
 *     messages. `getCurrentCharacter()`
 *     (`database.svelte.ts:738-743`) reads only the SELECTED character
 *     (same one `dbChangeEffects` already tracks). The character LIST UI
 *     was not independently traced in this follow-up (UNMEASURED) but is
 *     expected to read only display fields (name/image), not full chat
 *     history, per this project's existing "thumbnail" optimization
 *     (`41977ac0 feat(avatars): serve small thumbnails to the character
 *     lists`, per this repo's recent commit log) -- not verified here,
 *     flagged as UNMEASURED rather than assumed.
 *
 * (c) RE-MEASURE M3's retained heap against a baseline that has ALREADY
 *     been fully read through the proxy the way `encoder.init` really does
 *     it (a `JSON.stringify(character)` loop over every character, OUTSIDE
 *     any `$effect`) -- isolating what M3's per-character EFFECTS add on
 *     top of what today's app already pays at boot regardless of which
 *     `dbChangeEffects` design is chosen. Plus the reverse sanity check:
 *     TODAY-LIKE (char[0]-only effect) WITH that same full boot walk, vs
 *     plain (no `$state` at all).
 *
 *     METHODOLOGY CORRECTION (recorded here because the first version of
 *     this test was wrong and its numbers were discarded, not silently
 *     replaced): an earlier draft ran all six scenarios as `const`
 *     declarations inside ONE `test()` function body. Every scenario's
 *     `clone`/`state`/`tracker` stayed in LEXICAL SCOPE for the rest of the
 *     function even after that scenario's own measurement was done and its
 *     effect torn down -- `global.gc()` cannot collect an object a `const`
 *     still refers to, so every scenario after the first was measured
 *     against a "before" heap that still included every EARLIER scenario's
 *     retained clone. That draft produced a nonsensical NEGATIVE delta for
 *     the plain-data baseline (a large deferred GC coincidentally landed
 *     inside that window) and is why this file no longer trusts
 *     same-function sequential `const`s for heap deltas. Each scenario
 *     below is now its OWN function (`measure*`) that returns only a number
 *     -- once such a function returns, nothing in this file still
 *     references its clone/state/tracker, so the NEXT scenario's `gc()`
 *     actually reclaims it. This is the same reason `M3`'s original
 *     heap numbers in this report were re-measured below rather than
 *     trusted as-is (see the M3-COLD row, which reproduces that original
 *     scenario under the corrected methodology for direct comparison).
 *
 * Fixture: 1000 characters / ~148k messages (M3's "extreme" point, where
 * the +550 MB finding was largest) via `buildManyCharactersFixture`, same
 * seed convention as the other harnesses.
 *
 * Run:
 *   NODE_OPTIONS=--expose-gc npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/dbchange-proxy-baseline-bench.svelte.harness.ts --reporter=verbose
 */
import { flushSync } from 'svelte'
import { describe, test, expect } from 'vitest'
import { buildManyCharactersFixture } from './character-scaling-fixture'

function flush(): void {
    flushSync()
}

type Tracker = Set<string>

/** Local copy of M3's TODAY-LIKE prototype (only characters[0] deep-read) -- duplicated here, not imported, to keep this file self-contained. */
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

/** Local copy of M3's VARIANT B prototype (every character deep-read via one child effect each). */
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

/**
 * Mirrors `RisuSaveEncoder.init`'s actual traversal
 * (`risuSave.ts:250-258`): `JSON.stringify(character)` for every character,
 * over the LIVE proxy, called OUTSIDE any `$effect`/`$effect.root` -- same
 * as the real `saveDb()` boot call, which is a plain (non-reactive) async
 * function. The encode/compress/base64 steps are omitted (irrelevant to
 * proxy materialization); only the `JSON.stringify` walk is reproduced.
 */
function simulateBootEncoderInitWalk(characters: Record<string, any>[]): void {
    for (const character of characters) {
        JSON.stringify(character)
    }
}

function gcAvailable(): boolean {
    return typeof (global as any).gc === 'function'
}

const FIXTURE = { characterCount: 1000, totalMessages: 150000, label: '1000 chars / ~148k msgs (M3 extreme point)' }

describe('P1(a) — empirical: out-of-effect proxy read retains data but creates NO dependency link', () => {
    test('JSON.stringify over the live proxy, outside any effect, does not notify an unrelated effect', () => {
        const { characters: rawCharacters } = buildManyCharactersFixture({
            characterCount: FIXTURE.characterCount,
            totalMessages: FIXTURE.totalMessages,
            seedOffset: 7001,
        })
        const clone = structuredClone(rawCharacters)
        const state = $state({ characters: clone })
        const tracker: Tracker = new Set()
        const cleanup = registerTodayLikeSelectionOnlyEffect(state, tracker)
        flush() // boot run: tracks characters[0] only
        expect([...tracker]).toEqual([clone[0].chaId])
        tracker.clear()

        // Boot-like full walk over EVERY character, outside any effect -- exactly
        // what encoder.init(getDatabase()) does today, unconditionally, at boot.
        simulateBootEncoderInitWalk(state.characters as Record<string, any>[])

        // Mutate a character the today-like effect never reads (index 5, NOT selected).
        const untrackedIdx = 5
        ;(state.characters[untrackedIdx] as any).desc = 'edited via out-of-effect-read character'
        flush()

        console.log(
            `\n=== P1(a): tracker after mutating an out-of-effect-read (but never effect-subscribed) character = ${JSON.stringify([...tracker])} (expect []) ===\n`,
        )
        // The JSON.stringify walk materialized character[5]'s proxies/sources, but
        // registered no subscription for today's char[0]-only effect -- so this
        // mutation must NOT appear in the tracker.
        expect([...tracker]).toEqual([])

        // Sanity: the SAME effect still correctly tracks character[0] (the thing it's actually subscribed to).
        ;(state.characters[0] as any).desc = 'edited selected character'
        flush()
        expect([...tracker]).toEqual([clone[0].chaId])

        cleanup()
    }, 60000)
})

describe('P1(c) — retained heap: M3 vs a baseline that already mirrors the real boot walk (corrected methodology, scenario-isolated)', () => {
    test(`retained heap comparison @ ${FIXTURE.label}`, () => {
        if (!gcAvailable()) {
            console.log('\n=== P1(c): UNMEASURED -- global.gc unavailable. Re-run with NODE_OPTIONS=--expose-gc. ===\n')
            expect(true).toBe(true)
            return
        }
        const gc = (global as any).gc as () => void
        const { characters: rawCharacters, stats } = buildManyCharactersFixture({
            characterCount: FIXTURE.characterCount,
            totalMessages: FIXTURE.totalMessages,
            seedOffset: 7002,
        })

        // Every scenario is its OWN function returning only a number. Once it
        // returns, nothing in the enclosing test still references its
        // clone/state/tracker, so the NEXT scenario's gc() actually reclaims it.
        // See the file header's "METHODOLOGY CORRECTION" note.

        function measurePlain(): number {
            gc()
            const before = process.memoryUsage().heapUsed
            const plainClone = structuredClone(rawCharacters)
            gc()
            const after = process.memoryUsage().heapUsed
            void plainClone
            return after - before
        }

        function measureTodayAlone(): number {
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

        function measureRealAppLike(): number {
            gc()
            const before = process.memoryUsage().heapUsed
            const clone = structuredClone(rawCharacters)
            const state = $state({ characters: clone })
            simulateBootEncoderInitWalk(state.characters as Record<string, any>[])
            const tracker: Tracker = new Set()
            const cleanup = registerTodayLikeSelectionOnlyEffect(state, tracker)
            flush()
            gc()
            const after = process.memoryUsage().heapUsed
            cleanup()
            return after - before
        }

        function measureProxyReadOnly(): number {
            gc()
            const before = process.memoryUsage().heapUsed
            const clone = structuredClone(rawCharacters)
            const state = $state({ characters: clone })
            simulateBootEncoderInitWalk(state.characters as Record<string, any>[])
            gc()
            const after = process.memoryUsage().heapUsed
            return after - before
        }

        function measureM3OnRealBoot(): number {
            gc()
            const before = process.memoryUsage().heapUsed
            const clone = structuredClone(rawCharacters)
            const state = $state({ characters: clone })
            simulateBootEncoderInitWalk(state.characters as Record<string, any>[])
            const tracker: Tracker = new Set()
            const runLog = { childRuns: 0 }
            const cleanup = registerPerCharacterEffect(state, tracker, runLog)
            flush()
            gc()
            const after = process.memoryUsage().heapUsed
            cleanup()
            return after - before
        }

        function measureM3Cold(): number {
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

        // WARM-UP, DISCARDED: empirically (see this test's own first run,
        // archived in chore01-item2-measure.md's P1 appendix), the VERY FIRST
        // gc()-delta measurement taken in a freshly-started test can itself be
        // anomalous (a large negative delta was observed once), apparently
        // because a deferred/incremental GC cycle from fixture construction
        // and prior JIT warm-up settles during that first explicit gc() call,
        // making that "before" reading unrepresentatively low. One discarded
        // measurePlain() call absorbs that settling before any number here is
        // trusted -- the same "discard warmup samples" principle every timing
        // bench in this directory already applies, just also needed for heap
        // deltas, which this file's first draft did not anticipate.
        measurePlain()

        // Run twice each, in alternating order, to sanity-check stability
        // against GC nondeterminism -- a single sample per scenario was what
        // produced the earlier draft's nonsensical negative number, so this
        // version does not trust a single sample either.
        const plainRuns = [measurePlain(), measurePlain()]
        const todayAloneRuns = [measureTodayAlone(), measureTodayAlone()]
        const realAppLikeRuns = [measureRealAppLike(), measureRealAppLike()]
        const proxyReadOnlyRuns = [measureProxyReadOnly(), measureProxyReadOnly()]
        const m3OnRealBootRuns = [measureM3OnRealBoot(), measureM3OnRealBoot()]
        const m3ColdRuns = [measureM3Cold(), measureM3Cold()]

        function avgMB(runs: number[]): number {
            return (runs.reduce((a, b) => a + b, 0) / runs.length) / 1024 / 1024
        }
        function fmtRunsMB(runs: number[]): string {
            return runs.map((r) => (r / 1024 / 1024).toFixed(1)).join(', ')
        }

        const plainMB = avgMB(plainRuns)
        const todayAloneMB = avgMB(todayAloneRuns)
        const realAppLikeMB = avgMB(realAppLikeRuns)
        const proxyReadOnlyMB = avgMB(proxyReadOnlyRuns)
        const m3OnRealBootMB = avgMB(m3OnRealBootRuns)
        const m3ColdMB = avgMB(m3ColdRuns)

        const lines: string[] = [
            '',
            `=== P1(c) retained heap @ ${FIXTURE.label} (actual stats: ${JSON.stringify(stats)}) — CORRECTED methodology, 2 runs/scenario ===`,
            `  0. plain data (no reactivity):                          avg=${plainMB.toFixed(2)} MB  [runs: ${fmtRunsMB(plainRuns)}]`,
            `  1. TODAY-LIKE alone (char[0] effect, no boot walk):     avg=${todayAloneMB.toFixed(2)} MB  [runs: ${fmtRunsMB(todayAloneRuns)}]`,
            `  2. REAL-APP-LIKE (boot walk + today's char[0] effect):  avg=${realAppLikeMB.toFixed(2)} MB  [runs: ${fmtRunsMB(realAppLikeRuns)}]`,
            `     -> vs plain (row 0): +${(realAppLikeMB - plainMB).toFixed(2)} MB`,
            `     -> vs TODAY-LIKE alone (row 1), i.e. the boot walk's OWN cost, independent of dbChangeEffects' design: +${(realAppLikeMB - todayAloneMB).toFixed(2)} MB`,
            `  3. PROXY-READ-ONLY (boot walk, ZERO effects):           avg=${proxyReadOnlyMB.toFixed(2)} MB  [runs: ${fmtRunsMB(proxyReadOnlyRuns)}]`,
            `  4. M3 VARIANT B on top of the REAL boot walk:           avg=${m3OnRealBootMB.toFixed(2)} MB  [runs: ${fmtRunsMB(m3OnRealBootRuns)}]`,
            `     -> M3's OWN marginal addition over boot-walk-alone (row 3): +${(m3OnRealBootMB - proxyReadOnlyMB).toFixed(2)} MB (dependency links + effect-node objects only -- proxy/source materialization is already paid by row 3)`,
            `     -> M3's OWN marginal addition over what today's real app already pays (row 2): +${(m3OnRealBootMB - realAppLikeMB).toFixed(2)} MB`,
            `  5. M3 VARIANT B, COLD (no prior boot walk):             avg=${m3ColdMB.toFixed(2)} MB  [runs: ${fmtRunsMB(m3ColdRuns)}]`,
            `     -> vs plain (row 0), i.e. the ORIGINAL M3-report-style number under the CORRECTED methodology: +${(m3ColdMB - plainMB).toFixed(2)} MB`,
            '',
            `  SUMMARY (MB): plain=${plainMB.toFixed(0)}  today-alone=${todayAloneMB.toFixed(0)}  boot-walk-alone(3)=${proxyReadOnlyMB.toFixed(0)}  ` +
                `real-app-like(2)=${realAppLikeMB.toFixed(0)}  M3-cold(5)=${m3ColdMB.toFixed(0)}  M3-on-real-boot(4)=${m3OnRealBootMB.toFixed(0)}`,
            '=== end ===',
            '',
        ]
        console.log(lines.join('\n'))
        expect(true).toBe(true)
    }, 240000)
})
