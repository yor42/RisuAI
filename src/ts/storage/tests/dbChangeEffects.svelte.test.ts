import { flushSync } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Database } from '../database.svelte'
import { registerDbChangeEffects } from '../dbChangeEffects.svelte'
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
