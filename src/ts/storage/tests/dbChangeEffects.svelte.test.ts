import { flushSync } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Database } from '../database.svelte'
import { registerDbChangeEffects } from '../dbChangeEffects.svelte'
import type { DbChangeEffectOptions } from '../dbChangeEffects.svelte'
import type { RisuModule } from '../../process/modules'
import type { toSaveType } from '../risuSave'

// Regression tests for a bug that WAS present in registerDbChangeEffects()
// (src/ts/storage/dbChangeEffects.svelte.ts): the first $effect tracked
// `botPresets` SHALLOWLY (only `botPresetsId` and `botPresets.length`), while
// its five siblings deep-read via `$state.snapshot(...)`. Any in-place
// mutation of a preset object that changed neither the id nor the array
// length was never flagged dirty, so `saveDb()` skipped re-encoding the
// preset block; the change was never written to disk rather than merely
// written late, so it was absent after a reload.
//
// The fix is the `$state.snapshot(DBState.db.botPresets)` deep-read in that
// first effect. Of the eight tests below, the five that exercise in-place
// preset mutations (rename, element-write self-reassign, same-id reselect,
// image, nested promptTemplate) were written and verified to FAIL against
// the pre-fix source (shallow `DBState.db.botPresetsId` / `.length` reads
// only); they now pass against the fixed source and guard against the bug
// resurfacing. The other three tests -- whole-array reorder, the first-run
// markChanged(false) check, and the effect-6 character/chat coverage -- are
// coverage for behaviour that already passed before the fix, as noted in
// their own comments below.

//#region module mocks

// dbChangeEffects.svelte.ts only reaches into DBState/selectedCharID from
// stores.svelte, but that module also re-exports (transitively, via
// process/modules and globalApi.svelte) the full app dependency graph —
// Tauri plugins, AI providers, drive sync, etc. Replace it with a minimal
// stand-in, matching the mocking pattern in
// src/ts/parser/tests/chatVar.svelte.test.ts and
// src/ts/process/mcp/risuaccess/tests/modules.test.ts.
//
// Unlike those two files, the object here has to be genuinely reactive
// (built with $state) rather than a plain object literal, because the code
// under test is a set of $effects that must actually re-run on mutation.
vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as typeof import('../../stores.svelte')
})

//#endregion

import { DBState, selectedCharID } from '../../stores.svelte'

function makePromptItem(text: string) {
    return { type: 'plain', type2: 'main', text, role: 'user' }
}

function makePreset(name: string) {
    return {
        name,
        mainPrompt: '',
        jailbreak: '',
        globalNote: '',
        temperature: 1,
        maxContext: 4096,
        maxResponse: 500,
        frequencyPenalty: 0,
        PresensePenalty: 0,
        formatingOrder: [],
        promptPreprocess: false,
        bias: [],
        ooba: {},
        ainconfig: {},
        image: '',
        promptTemplate: [makePromptItem('a'), makePromptItem('b'), makePromptItem('c')],
    }
}

function installDb() {
    DBState.db = {
        botPresetsId: 0,
        botPresets: [makePreset('Preset 0'), makePreset('Preset 1')],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters: [],
    } as unknown as Database
}

function makeTracker(): toSaveType {
    return {
        character: [],
        chat: [],
        botPreset: false,
        modules: false,
        loadouts: false,
        plugins: false,
        pluginCustomStorage: false,
    }
}

let cleanup: (() => void) | undefined

afterEach(() => {
    cleanup?.()
    cleanup = undefined
    selectedCharID.set(-1)
})

describe('registerDbChangeEffects — botPreset shallow-tracking bug (fixed)', () => {

    test('renaming a preset in place dirties botPreset', () => {
        installDb()
        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.botPreset = false
        markChanged.mockClear()

        // botPresetsId and botPresets.length are both unchanged by this mutation.
        DBState.db.botPresets[1].name = 'renamed'
        flushSync()

        expect(tracker.botPreset).toBe(true)
        expect(markChanged).toHaveBeenCalledWith(true)
    })

    // THE IMPORTANT ONE. This models saveCurrentPreset() at
    // src/ts/storage/database.svelte.ts:2134 and :2136, which does an
    // element write followed by a self-assignment of the same array
    // reference:
    //
    //   db.botPresets[db.botPresetsId] = savedPreset   // element write, :2134
    //   db.botPresets = pres                           // same reference; notifies nothing, :2136
    //
    // Real call sites of that exact shape: downloadPreset()
    // (database.svelte.ts:2293-2296, via saveCurrentPreset()), and
    // changeToPreset() whenever the target id equals the current id (see the
    // dedicated same-id test below for that path in full, including the
    // no-op `botPresetsId` assignment).
    test('saveCurrentPreset-style element write + self-reassignment dirties botPreset', () => {
        installDb()
        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.botPreset = false
        markChanged.mockClear()

        const pres = DBState.db.botPresets
        const newPresetObject = { ...pres[DBState.db.botPresetsId], mainPrompt: 'edited prompt', temperature: 2 }
        pres[DBState.db.botPresetsId] = { ...newPresetObject }
        DBState.db.botPresets = pres
        flushSync()

        expect(tracker.botPreset).toBe(true)
        expect(markChanged).toHaveBeenCalledWith(true)
    })

    // Models re-selecting the ALREADY-active preset: changeToPreset(id) with
    // id === db.botPresetsId, reached from a preset hotkey
    // (src/ts/hotkey.ts:186-216, e.g. ctrl+1 while already on preset 0) or
    // from clicking the already-selected row in
    // src/lib/Setting/botpreset.svelte:140. changeToPreset() always runs
    // saveCurrentPreset() first (the element write + self-assign above), then
    // does `db.botPresetsId = id`. Svelte skips no-op assignments via
    // Object.is equality, so that last assignment notifies nothing when id is
    // unchanged -- it is not what dirties botPreset here; the deep snapshot
    // of the mutated array is.
    test('re-selecting the already-active preset (element write + self-assign + no-op id) still dirties botPreset', () => {
        installDb()
        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.botPreset = false
        markChanged.mockClear()

        const currentId = DBState.db.botPresetsId
        const pres = DBState.db.botPresets
        pres[currentId] = { ...pres[currentId], mainPrompt: 'edited before reselecting same preset' }
        DBState.db.botPresets = pres
        DBState.db.botPresetsId = currentId // no-op: same value, Svelte does not notify
        flushSync()

        expect(tracker.botPreset).toBe(true)
        expect(markChanged).toHaveBeenCalledWith(true)
    })

    test('setting a preset image in place dirties botPreset', () => {
        installDb()
        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.botPreset = false

        DBState.db.botPresets[0].image = 'data:image/jpeg;base64,/9j/4AAQ...'
        flushSync()

        expect(tracker.botPreset).toBe(true)
    })

    // Guards that the fix snapshots deeply, not just one level down (i.e.
    // not e.g. only `$state.snapshot(DBState.db.botPresets[i])` for each
    // preset without recursing further).
    test('editing a nested promptTemplate entry dirties botPreset', () => {
        installDb()
        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.botPreset = false

        ;(DBState.db.botPresets[0].promptTemplate[2] as { text: string }).text = 'changed'
        flushSync()

        expect(tracker.botPreset).toBe(true)
    })

    // Coverage only — NOT a regression test for the bug. movePreset()
    // (src/lib/Setting/botpreset.svelte:32-48) builds a brand-new plain
    // array and assigns it wholesale, which changes db.botPresets' identity.
    // That IS observed by the shallow effect (it re-reads `.length` off a
    // new array reference), so this test passes today. Do not mistake this
    // passing as evidence the shallow-tracking bug is fixed — it only shows
    // that the one call site which happens to reassign the whole array is
    // unaffected by it.
    test('reordering via whole-array reassignment already dirties botPreset (passes today)', () => {
        installDb()
        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.botPreset = false

        const original = DBState.db.botPresets
        const reordered = [original[1], original[0]]
        DBState.db.botPresets = reordered
        flushSync()

        expect(tracker.botPreset).toBe(true)
    })

    // Passes today and must keep passing: on the very first flush, every
    // effect's markChanged call must report `false` (not dirty), since
    // there is nothing to save yet.
    test('first run reports markChanged(false) for every effect', () => {
        installDb()
        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        expect(markChanged).toHaveBeenCalledTimes(6)
        for (const call of markChanged.mock.calls) {
            expect(call[0]).toBe(false)
        }
    })

    // Effect 6 (the generic per-key loop plus character/chat tracking) was
    // moved by the refactor in registerDbChangeEffects() and had no
    // behavioural coverage: installDb() sets `characters: []` and
    // selectedCharID defaults to -1, so `DBState?.db?.characters?.[selIdState]`
    // is never truthy in the tests above. Cover the populated-character path
    // directly.
    test('effect 6 populates tracker.character and tracker.chat for the active character', () => {
        installDb()
        DBState.db.characters = [
            {
                chaId: 'char-0',
                chatPage: 0,
                chats: [{ id: 'chat-0', message: [], note: '', name: '', localLore: [] }],
            },
        ] as unknown as Database['characters']
        selectedCharID.set(0)

        const tracker = makeTracker()
        const markChanged = vi.fn()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        expect(tracker.character[0]).toBe('char-0')
        expect(tracker.chat[0]).toEqual(['char-0', 'chat-0'])
    })
})

// Tests below are for Agents/Reports/11-stage-b-module-effect-partition-plan.md
// section 5: the equivalence suite (step 1) for the partition of the
// modules effect (originally a single effect at
// dbChangeEffects.svelte.ts:33-38 in commit afcb4e09) into an outer
// shape-effect plus one child effect per element, and the single
// red-before-green proof test (step 2). Written against that pre-change
// source; the partition has since landed at dbChangeEffects.svelte.ts:54-70.
// The step 1 tests below pass both before and after the partition by
// design, since they pin the mutation closure the refactor had to preserve
// exactly. The step 2 test failed against the pre-change source; see its
// own comment for the recorded failure.

//#region modules fixtures (Stage B, section 5)

// RisuModule's shape lives in src/ts/process/modules.ts, with nested
// loreBook/customscript/triggerscript types in database.svelte.ts and
// process/triggers.ts. Every field is given a real, present value, mirroring
// src/ts/process/tests/moduleUpdateDeps.svelte.test.ts's makeModule(), so
// that "field absent" is never an accidental variable in these tests.
type LoreBookEntry = NonNullable<RisuModule['lorebook']>[number]
type CustomScriptEntry = NonNullable<RisuModule['regex']>[number]
type TriggerEntry = NonNullable<RisuModule['trigger']>[number]
type AssetEntry = NonNullable<RisuModule['assets']>[number]

function makeModule(seed: string): RisuModule {
    const lorebookEntry: LoreBookEntry = {
        key: `key-${seed}`,
        secondkey: `secondkey-${seed}`,
        insertorder: 100,
        comment: `lorebook-comment-${seed}`,
        content: `lorebook-content-${seed}`,
        mode: 'normal',
        alwaysActive: false,
        selective: true,
    }
    const regexEntry: CustomScriptEntry = {
        comment: `regex-comment-${seed}`,
        in: '/foo/',
        out: 'bar',
        type: 'editinput',
    }
    const triggerEntry: TriggerEntry = {
        comment: `trigger-comment-${seed}`,
        type: 'manual',
        conditions: [],
        effect: [],
    }
    const assetEntry: AssetEntry = [`asset-name-${seed}`, `asset-path-${seed}`, `asset-ext-${seed}`]

    return {
        name: `Module ${seed}`,
        description: `Description for module ${seed}`,
        lorebook: [lorebookEntry],
        regex: [regexEntry],
        trigger: [triggerEntry],
        id: `module-id-${seed}`,
        assets: [assetEntry],
    }
}

// installDb() (above) sets `modules: []`, which is required for the
// existing count-based first-run test to keep passing (see the CRITICAL
// CONSTRAINT note in plan section 5 / gate finding F-3). Populate modules
// separately, after installDb(), rather than changing its default.
function installDbWithModules(modules: RisuModule[]) {
    installDb()
    DBState.db.modules = modules
}

function freshTrackerAndMarker() {
    const tracker = makeTracker()
    const markChanged = vi.fn()
    return { tracker, markChanged }
}

//#endregion

describe('registerDbChangeEffects — modules partition equivalence suite (Stage B plan section 5, step 1)', () => {

    // CRITICAL CONSTRAINT (plan section 5 / gate finding F-3): none of the
    // tests below assert a markChanged call COUNT, because with N modules
    // populated, the first flush calls markChanged 6+N times: the outer
    // modules effect plus its N children replace the single former modules
    // effect, so the 6 top-level effects become (6-1)+1+N = 6+N. (Separately,
    // a modules *shape-change* flush -- push/splice/whole-array replacement
    // -- calls markChanged N+1 times just for the modules effects: the outer
    // plus every recreated child.) Only tracker.modules and, where first-run
    // semantics matter, the markDirty ARGUMENT of every call are asserted.

    test('leaf write on modules[k].name marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules[1].name = 'renamed'
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('nested leaf write on modules[k].lorebook[i].content marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules[0].lorebook[0].content = 'changed content'
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('nested leaf write on modules[k].regex[i].out marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules[0].regex[0].out = 'changed-out'
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('nested leaf write on modules[k].trigger[i].comment marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules[0].trigger[0].comment = 'changed-trigger-comment'
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('nested leaf write on modules[k].assets[i][0] marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules[0].assets[0][0] = 'changed-asset-name'
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('element replacement modules[k] = {...} marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules[1] = { ...DBState.db.modules[1], name: 'replaced' }
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('push marks dirty', () => {
        installDbWithModules([makeModule('a')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules.push(makeModule('b'))
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('splice marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b'), makeModule('c')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules.splice(1, 1)
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('unshift marks dirty', () => {
        installDbWithModules([makeModule('a')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules.unshift(makeModule('z'))
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('in-place reorder (index swap) marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        const modules = DBState.db.modules
        const first = modules[0]
        const second = modules[1]
        modules[0] = second
        modules[1] = first
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    // The real call-site pair at ModuleSettings.svelte:133-134:
    //   DBState.db.modules.splice(index, 1)
    //   DBState.db.modules = DBState.db.modules
    // Assert that this pair marks dirty. Per plan gate finding F-5, do NOT
    // invert this into "self-assign alone does not mark" -- a negative
    // assertion there would enshrine under-marking as a spec.
    test('ModuleSettings.svelte splice + self-assign pair marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b'), makeModule('c')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules.splice(1, 1)
        DBState.db.modules = DBState.db.modules
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('whole-array reassignment marks dirty', () => {
        installDbWithModules([makeModule('a')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules = [makeModule('x'), makeModule('y')]
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    // F8: first run must not mark dirty. Verified against the running
    // source that this is NOT the same claim as "tracker.modules stays
    // false on the first run" -- it does not: `opts.tracker.modules = true`
    // is set unconditionally on every run, including the first, per plan
    // section 4.1 ("independent of any ranOnce flag"). The actual first-run
    // guard is that every markChanged() call's argument is false on this
    // first flush; markChanged(false) never means "mark clean" (plan 4.1
    // point 2), so tracker.modules legitimately starting `true` after mount
    // is not a contradiction of F8. The existing
    // 'first run reports markChanged(false) for every effect' test above
    // covers the same argument contract with installDb()'s empty modules
    // array (and asserts a call COUNT, which only survives because there
    // are zero modules -- see the CRITICAL CONSTRAINT note); this is the
    // same contract with modules actually populated, asserted without a
    // call count.
    test('first run sets tracker.modules unconditionally, but every markChanged call still receives false (F8, plan 4.1)', () => {
        installDbWithModules([makeModule('a'), makeModule('b'), makeModule('c')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        expect(tracker.modules).toBe(true)
        expect(markChanged.mock.calls.every((call) => call[0] === false)).toBe(true)
    })

    test('mutating a module that is NOT the most recently touched one still marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b'), makeModule('c')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        // Touch module 2 first (making it the "most recently touched"
        // module), then clear and mutate module 0 instead.
        DBState.db.modules[2].name = 'touched-last'
        flushSync()
        tracker.modules = false

        DBState.db.modules[0].name = 'touched-earlier-module'
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('empty modules array does not throw, and a subsequent push marks dirty', () => {
        installDbWithModules([])
        const { tracker, markChanged } = freshTrackerAndMarker()

        expect(() => {
            cleanup = $effect.root(() => {
                registerDbChangeEffects({ tracker, markChanged })
            })
            flushSync()
        }).not.toThrow()

        // tracker.modules is set unconditionally on every run, including
        // the first (plan section 4.1), so it is already true here; reset
        // it before the push so the assertion below is meaningful.
        tracker.modules = false

        DBState.db.modules.push(makeModule('a'))
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    // "Hole/undefined entry": an explicit `undefined` element (a present
    // own property whose value is undefined), not a true sparse-array hole
    // -- but a genuine hole (e.g. `[a, , c]` assigned into a $state array)
    // behaves identically here: proxy.js:178's `!exists` path still creates
    // an UNINITIALIZED source that gets subscribed. This exercises the same
    // defensive case: registration must not throw, and a leaf write on a
    // REAL neighbouring entry must still mark dirty.
    test('modules array containing an undefined entry does not throw, and a leaf write on a present entry still marks dirty', () => {
        installDbWithModules([makeModule('a'), undefined as unknown as RisuModule, makeModule('c')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        expect(() => {
            cleanup = $effect.root(() => {
                registerDbChangeEffects({ tracker, markChanged })
            })
            flushSync()
        }).not.toThrow()
        tracker.modules = false

        DBState.db.modules[2].name = 'renamed-c'
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    test('db.modules.length = 0 truncation marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        tracker.modules = false

        DBState.db.modules.length = 0
        flushSync()

        expect(tracker.modules).toBe(true)
    })

    // LOAD-BEARING (plan gate finding F-4). Under the partition
    // (dbChangeEffects.svelte.ts:54-70), a shape change tears down and
    // recreates every child effect. A leaf mutation to a PRE-EXISTING module
    // (present before the shape change) must still mark dirty afterwards --
    // this is the exact mechanic the whole design depends on, and no
    // existing test or benchmark in this repo exercises a $effect created
    // inside a re-running $effect. This is now the real assertion of that
    // mechanic; against the pre-change single effect (afcb4e09), it would
    // have trivially passed instead, since that effect deep-read everything
    // regardless of prior shape changes.
    test('post-shape-change leaf mutation on a pre-existing module still marks dirty', () => {
        installDbWithModules([makeModule('a'), makeModule('b')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        // Shape change: push a third module.
        DBState.db.modules.push(makeModule('c'))
        flushSync()
        expect(tracker.modules).toBe(true)
        tracker.modules = false

        // Leaf mutation on a PRE-EXISTING module (index 0, present before
        // the push) must still mark dirty after teardown/recreation of the
        // per-element child effects.
        DBState.db.modules[0].name = 'renamed-after-shape-change'
        flushSync()

        expect(tracker.modules).toBe(true)
    })
})

describe('registerDbChangeEffects — modules partition red-before-green proof (Stage B plan section 5, step 2)', () => {

    // RED-BEFORE-GREEN PROOF TEST -- this FAILED against the pre-change
    // src/ts/storage/dbChangeEffects.svelte.ts (afcb4e09). The single
    // `$effect(() => { $state.snapshot(DBState.db.modules) ... })`
    // (dbChangeEffects.svelte.ts:33-38 in afcb4e09) deep-read the WHOLE
    // modules array on every flush, so a leaf write in module k re-read
    // every other module too. It passes now that effect is partitioned
    // into an outer shape-effect plus one child effect per element
    // (dbChangeEffects.svelte.ts:54-70), because a leaf write to module k
    // only re-runs module k's own child effect.
    //
    // Observability: DbChangeEffectOptions exposes only `tracker` and
    // `markChanged` -- counting child-effect runs is not observable through
    // it, and adding a production hook for this would itself be the kind of
    // scaffolding the plan forbids (section 5, gate finding F-7). Instead
    // this defines an ACCESSOR property (a getter, not a data property) on
    // a fixture module. Verified against Svelte source:
    // node_modules/svelte/src/internal/client/proxy.js:178 skips creating a
    // reactive source for a property when it exists but its descriptor has
    // no `writable` (true for a getter-only accessor), so :198 falls
    // through to `Reflect.get(target, prop, receiver)`, invoking the getter
    // directly and untracked, on every single deep read that reaches it.
    // node_modules/svelte/src/internal/shared/clone.js:83-105 -- the plain-
    // object branch of `$state.snapshot()`'s recursive clone -- walks
    // `Object.keys(value)` and reads `value[key]` for each, so it reaches
    // and fires the getter.
    test('a leaf write in module k does not deep-read module j', () => {
        let jHits = 0
        const modJ = makeModule('j')
        Object.defineProperty(modJ, 'probe', {
            get() {
                jHits++
                return 'x'
            },
            enumerable: true,
        })
        const modK = makeModule('k')

        installDbWithModules([modK, modJ])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()
        // The first run legitimately deep-reads everything (there is
        // nothing to narrow against yet, and F8 requires it not mark dirty
        // either way); only hits AFTER this point are evidence of
        // unnecessary re-reading of module j.
        jHits = 0

        DBState.db.modules[0].name = 'k-renamed'
        flushSync()

        expect(jHits).toBe(0)
    })
})

// Tests below are for Agents/Reports/17-chore01-item2-plan.md Stage 1 §3.2
// (S7): the identity tracker -- a SEPARATE $effect inside
// registerDbChangeEffects that only reacts to a character being REPLACED
// (element or whole-array), never to an in-place field edit, and marks the
// replaced element's chaId into opts.tracker via the shared appendIfAbsent
// rule. These tests drive the REAL registerDbChangeEffects() (unmodified
// from the suites above) with a populated `characters` array and, where
// relevant, the new `seed` option.

describe('registerDbChangeEffects — identity tracker (Report 17 Stage 1 §3.2, S7)', () => {

    function makeChar(chaId: string, name: string): Record<string, unknown> {
        return { chaId, name, type: 'character', chatPage: 0, chats: [] }
    }

    function installDbWithCharacters(characters: Record<string, unknown>[]) {
        installDb()
        DBState.db.characters = characters as unknown as Database['characters']
    }

    test('seeded first run marks nothing, even though the seed is otherwise empty of tracking state', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        // Capture the exact live proxies BEFORE registering the effect, so the
        // seed matches identity with what the effect will read on its first run.
        const seed = [DBState.db.characters[0], DBState.db.characters[1]]
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged, seed })
        })
        flushSync()

        expect(tracker.character).toEqual([])
    })

    test('an element replaced after seeding but before the first run IS marked (boot-window race, plan gate finding 3)', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        // Seed captures the ORIGINAL proxies (as if RisuSaveEncoder.init had
        // already encoded them)...
        const seed = [DBState.db.characters[0], DBState.db.characters[1]]
        // ...but before the identity effect's first run, char-A's element is
        // replaced (e.g. a plugin or backup load raced the encoder.init window).
        DBState.db.characters[0] = makeChar('char-A', 'A-replaced-during-init') as unknown as Database['characters'][number]

        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged, seed })
        })
        flushSync()

        expect(tracker.character).toEqual(['char-A'])
    })

    test('without a seed, the first run only fills the seen set and marks nothing (keeps the existing markChanged(6) count test valid)', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        const { tracker, markChanged } = freshTrackerAndMarker()

        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        expect(tracker.character).toEqual([])
    })

    test('splice (element removal) marks nothing: surviving elements keep their identity', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B'), makeChar('char-C', 'C')])
        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        DBState.db.characters.splice(1, 1) // removes char-B; char-A and char-C keep their proxies
        flushSync()

        expect(tracker.character).toEqual([])
    })

    test('reorder (swap) marks nothing: only existing proxies move', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        const chars = DBState.db.characters
        const first = chars[0]
        const second = chars[1]
        chars[0] = second
        chars[1] = first
        flushSync()

        expect(tracker.character).toEqual([])
    })

    test('element replacement marks exactly that chaId', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        DBState.db.characters[1] = makeChar('char-B', 'B-replaced') as unknown as Database['characters'][number]
        flushSync()

        expect(tracker.character).toEqual(['char-B'])
    })

    test('whole-array replacement marks all new elements', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        DBState.db.characters = [
            makeChar('char-X', 'X'),
            makeChar('char-Y', 'Y'),
            makeChar('char-Z', 'Z'),
        ] as unknown as Database['characters']
        flushSync()

        expect(tracker.character).toEqual(expect.arrayContaining(['char-X', 'char-Y', 'char-Z']))
        expect(tracker.character).toHaveLength(3)
    })

    test('in-place field write marks nothing: the identity effect never reads element properties', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        ;(DBState.db.characters[0] as unknown as { name: string }).name = 'renamed-in-place'
        flushSync()

        expect(tracker.character).toEqual([])
    })

    test('falsy chaId on a replaced element is skipped (not appended), without throwing', () => {
        installDbWithCharacters([makeChar('char-A', 'A')])
        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        DBState.db.characters[0] = { chaId: '', name: 'no-id', type: 'character', chatPage: 0, chats: [] } as unknown as Database['characters'][number]

        expect(() => flushSync()).not.toThrow()
        expect(tracker.character).toEqual([])
    })

    // Svelte-facts premise (gate 1, verified against 5.55.1): reading
    // chars[i] returns the SAME child proxy on every read (stable per
    // underlying object), and a self-assignment of the same array reference
    // notifies nothing -- so it must not mark anything either.
    test('same-proxy premise: re-reading the same array/elements and self-assigning the array marks nothing', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        const firstRead = DBState.db.characters[0]
        const secondRead = DBState.db.characters[0]
        expect(firstRead).toBe(secondRead) // same proxy identity on repeated reads

        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        DBState.db.characters = DBState.db.characters // self-assignment, same reference
        flushSync()

        expect(tracker.character).toEqual([])
    })

    test('does not go through the module-global installed characterSaveMarks tracker (F7): marks land only in opts.tracker', async () => {
        const { installCharacterSaveMarks, resetCharacterSaveMarksForTest } = await import('../characterSaveMarks')
        const globalTracker = makeTracker()
        const globalSchedule = vi.fn()
        installCharacterSaveMarks({ tracker: globalTracker, schedule: globalSchedule })

        installDbWithCharacters([makeChar('char-A', 'A')])
        const { tracker, markChanged } = freshTrackerAndMarker()
        cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged })
        })
        flushSync()

        DBState.db.characters[0] = makeChar('char-A', 'A-replaced') as unknown as Database['characters'][number]
        flushSync()

        expect(tracker.character).toEqual(['char-A'])
        // The module-global tracker (a different, "installed" one) must be
        // completely untouched by this effect.
        expect(globalTracker.character).toEqual([])
        expect(globalSchedule).not.toHaveBeenCalled()

        resetCharacterSaveMarksForTest()
    })

    // Report 17 Stage 1, second Gate 2 REJECT, item C: `opts.seed` is a
    // strong Iterable (in production, a Set of every boot-time character)
    // used only to seed the identity tracker's WeakSet below. The effect
    // closures above all capture `opts` itself (they read opts.tracker and
    // call opts.markChanged), so as long as `opts.seed` stays populated on
    // that same object, every character it references stays strongly
    // reachable for as long as the effects live -- i.e. forever, in
    // production. The fix is for registerDbChangeEffects to release it
    // (`opts.seed = undefined`) once the WeakSet has been built from it.
    //
    // A real reachability proof (WeakRef + global.gc()) is not included here:
    // it requires vitest to run with `--expose-gc`, which this project's
    // normal `pnpm test` / `vitest run` invocation does not enable (verified
    // against Agents/Tools/save-gen/*-bench.svelte.harness.ts, whose own
    // comments call out that same NODE_OPTIONS=--expose-gc requirement for
    // their retained-heap measurements). Asserting `opts.seed === undefined`
    // directly is the reachability proof available in the normal suite.
    test('registering releases the seed: opts.seed is undefined afterward, while the seeded behaviour still holds (Report 17 Stage 1 second Gate 2 REJECT, item C)', () => {
        installDbWithCharacters([makeChar('char-A', 'A'), makeChar('char-B', 'B')])
        const seed = [DBState.db.characters[0], DBState.db.characters[1]]
        const opts: DbChangeEffectOptions = { tracker: makeTracker(), markChanged: vi.fn(), seed }

        cleanup = $effect.root(() => {
            registerDbChangeEffects(opts)
        })
        flushSync()

        // Seeded behaviour still holds: a seeded element is not marked on the
        // first run (same guarantee as the "seeded first run marks nothing"
        // test above), proving the WeakSet built from the seed is intact even
        // though `opts.seed` itself has been released.
        expect(opts.tracker.character).toEqual([])
        expect(opts.seed).toBeUndefined()
    })
})
