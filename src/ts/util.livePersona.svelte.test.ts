// @vitest-environment node

/**
 * A chat bound to the currently selected persona reads that persona as it is
 * being edited: the name, icon and prompt the persona helpers return for it are
 * the editing buffer's (`db.username`, `db.userIcon`, `db.personaPrompt`), not
 * the copy saved in `db.personas`, which is only refreshed when the selected
 * persona changes. A chat bound to any other persona reads that persona's saved
 * entry, and a chat bound to none reads the buffer.
 *
 * Drives the real `getUserName`, `getUserIcon`, `getPersonaPrompt` and
 * `checkPersonaBinded` of `./util` over a mocked database.
 *
 * Tests whose title starts with `guard:` pass with or without the change:
 * they pin behaviour that must be preserved. The tests at the end exercise the
 * shared rule (`livePersona`) directly.
 */
import { describe, test, expect, vi, beforeAll } from 'vitest'
import { writable } from 'svelte/store'
import type { Chat, Database, RisuPersona } from './storage/database.svelte'

vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    readFile: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
    basename: vi.fn(async (p: string) => p.split('/').pop()),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: vi.fn(() => ({ listen: vi.fn(), setTitle: vi.fn() })),
}))

vi.mock('src/lib/UI/PopupList.svelte', () => ({
    default: class {},
}))

vi.mock(import('./platform'), () => ({
    isTauri: false,
    isNodeServer: false,
    isIOS: () => false,
}) as unknown as typeof import('./platform'))

vi.mock(import('./characters'), () => ({
    createBlankChar: vi.fn(),
    getCharImage: vi.fn(),
}) as unknown as typeof import('./characters'))

vi.mock(import('./stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as unknown as typeof import('./stores.svelte')
})

vi.mock(import('./storage/database.svelte'), async () => {
    const stores = await import('./stores.svelte')
    const state = stores.DBState as unknown as { db: Database }
    return {
        getDatabase: vi.fn(() => state.db),
    } as unknown as typeof import('./storage/database.svelte')
})

let DBState: { db: Database }
let util: typeof import('./util')

beforeAll(async () => {
    DBState = (await import('./stores.svelte')).DBState as unknown as { db: Database }
    util = await import('./util')
})

const SELECTED_ENTRY: RisuPersona = {
    id: 'p-S', name: 'SavedName', personaPrompt: 'SAVED-PROMPT', icon: 'saved.png', note: 'saved note',
    largePortrait: true, embeddedModule: { id: 'mod-S', name: 'mod-S' } as RisuPersona['embeddedModule'],
}
const OTHER_ENTRY: RisuPersona = { id: 'p-O', name: 'OtherName', personaPrompt: 'OTHER-PROMPT', icon: 'other.png', note: '' }

/** The selected persona is `SELECTED_ENTRY`, whose buffer has been edited to `EditedName`, `edited.png` and `EDITED-PROMPT`. */
function editedBuffer(overrides: Record<string, unknown> = {}): void {
    DBState.db = {
        personas: [{ ...SELECTED_ENTRY }, { ...OTHER_ENTRY }], selectedPersona: 0,
        username: 'EditedName', userIcon: 'edited.png', personaPrompt: 'EDITED-PROMPT', userNote: 'edited note',
        characters: [], ...overrides,
    } as unknown as Database
}

function chatBoundTo(persona: string | undefined): Chat {
    return { id: 'chat-1', message: [], bindedPersona: persona } as unknown as Chat
}

describe('a chat bound to the selected persona reads the buffer being edited', () => {
    test('getUserName returns the buffer\'s name, not the saved entry\'s', () => {
        editedBuffer()
        expect(util.getUserName(chatBoundTo('p-S'))).toBe('EditedName')
    })

    test('getUserIcon returns the buffer\'s icon, not the saved entry\'s', () => {
        editedBuffer()
        expect(util.getUserIcon(chatBoundTo('p-S'))).toBe('edited.png')
    })

    test('getPersonaPrompt returns the buffer\'s prompt, not the saved entry\'s', () => {
        editedBuffer()
        expect(util.getPersonaPrompt(chatBoundTo('p-S'))).toBe('EDITED-PROMPT')
    })

    test('getPersonaPrompt returns an empty prompt once the buffer\'s prompt is cleared', () => {
        editedBuffer({ personaPrompt: '' })
        expect(util.getPersonaPrompt(chatBoundTo('p-S'))).toBe('')
    })

})

describe('guard: the other bindings keep their readings', () => {
    test('guard: a buffer field that is undefined falls back to the saved entry\'s', () => {
        editedBuffer({ userIcon: undefined })
        expect(util.getUserIcon(chatBoundTo('p-S'))).toBe('saved.png')
    })

    test('guard: a chat bound to another persona reads that persona\'s saved entry', () => {
        editedBuffer()
        const chat = chatBoundTo('p-O')
        expect([util.getUserName(chat), util.getUserIcon(chat), util.getPersonaPrompt(chat)]).toEqual(['OtherName', 'other.png', 'OTHER-PROMPT'])
    })

    test('guard: a chat bound to no persona reads the buffer', () => {
        editedBuffer()
        const chat = chatBoundTo(undefined)
        expect([util.getUserName(chat), util.getUserIcon(chat), util.getPersonaPrompt(chat)]).toEqual(['EditedName', 'edited.png', 'EDITED-PROMPT'])
    })

    test('guard: a chat bound to a deleted persona reads the buffer', () => {
        editedBuffer()
        const chat = chatBoundTo('p-gone')
        expect([util.getUserName(chat), util.getUserIcon(chat), util.getPersonaPrompt(chat)]).toEqual(['EditedName', 'edited.png', 'EDITED-PROMPT'])
    })

    test('guard: with the selected index out of range a chat bound to the persona reads its saved entry', () => {
        editedBuffer({ selectedPersona: 7 })
        const chat = chatBoundTo('p-S')
        expect([util.getUserName(chat), util.getUserIcon(chat), util.getPersonaPrompt(chat)]).toEqual(['SavedName', 'saved.png', 'SAVED-PROMPT'])
    })

    test('guard: a target chat that did not resolve (null) reads the global persona, never a bound one', () => {
        editedBuffer()
        expect([util.getUserName(null), util.getUserIcon(null), util.getPersonaPrompt(null)]).toEqual(['EditedName', 'edited.png', 'EDITED-PROMPT'])
    })

    test('guard: the saved entry checkPersonaBinded finds keeps its id, embedded module and portrait flag', () => {
        editedBuffer()
        const found = util.checkPersonaBinded(chatBoundTo('p-S'))
        expect(found?.id).toBe('p-S')
        expect(found?.embeddedModule?.id).toBe('mod-S')
        expect(found?.largePortrait).toBe(true)
    })
})

//#region the shared live-persona rule

// `livePersona` is the rule the persona helpers apply and
// `DefaultChatScreen.svelte` calls in place of its own persona lookup.
describe('the shared live-persona rule', () => {
    test('for the persona at the selected index the rule returns the buffer\'s name, icon, prompt and note, each falling back to the entry\'s when the buffer field is undefined', () => {
        editedBuffer()
        expect(util.livePersona(DBState.db.personas[0])).toMatchObject({
            name: 'EditedName', icon: 'edited.png', personaPrompt: 'EDITED-PROMPT', note: 'edited note',
        })

        editedBuffer({ username: undefined, userIcon: undefined, personaPrompt: undefined, userNote: undefined })
        expect(util.livePersona(DBState.db.personas[0])).toMatchObject({
            name: 'SavedName', icon: 'saved.png', personaPrompt: 'SAVED-PROMPT', note: 'saved note',
        })
    })

    test('the rule recognises the selected persona by id as well as by identity', () => {
        editedBuffer()
        const copy = { ...DBState.db.personas[0] }
        expect(util.livePersona(copy)?.name).toBe('EditedName')
    })

    test('the rule keeps the entry\'s id, embedded module and portrait flag', () => {
        editedBuffer()
        const live = util.livePersona(DBState.db.personas[0])
        expect(live?.id).toBe('p-S')
        expect(live?.embeddedModule?.id).toBe('mod-S')
        expect(live?.largePortrait).toBe(true)
    })

    test('the rule returns the saved entry itself for any persona that is not the selected one, and when the selected index is out of range', () => {
        editedBuffer()
        expect(util.livePersona(DBState.db.personas[1])).toBe(DBState.db.personas[1])

        editedBuffer({ selectedPersona: 7 })
        expect(util.livePersona(DBState.db.personas[0])).toBe(DBState.db.personas[0])
    })

    test('the rule returns nothing for no persona', () => {
        editedBuffer()
        expect(util.livePersona(undefined)).toBeNull()
        expect(util.livePersona(null)).toBeNull()
    })

    test('livePersona applied to a lookup by id gives the name and icon of the buffer and the portrait flag of the entry', () => {
        editedBuffer()
        const shown = util.livePersona(DBState.db.personas.find((p) => p.id === 'p-S'))
        expect(shown).not.toBeNull()
        expect([shown?.name, shown?.icon, shown?.largePortrait]).toEqual(['EditedName', 'edited.png', true])
    })

    test('an emptied buffer name is kept as empty, not replaced by the value of the entry', () => {
        editedBuffer({ username: '' })
        expect(util.getUserName(chatBoundTo('p-S'))).toBe('')
        expect(util.livePersona(DBState.db.personas[0])?.name).toBe('')
    })

    test('an emptied buffer icon is kept as empty, not replaced by the value of the entry', () => {
        editedBuffer({ userIcon: '' })
        expect(util.getUserIcon(chatBoundTo('p-S'))).toBe('')
        expect(util.livePersona(DBState.db.personas[0])?.icon).toBe('')
    })

    test('an emptied buffer note is kept as empty, not replaced by the value of the entry', () => {
        editedBuffer({ userNote: '' })
        expect(util.livePersona(DBState.db.personas[0])?.note).toBe('')
    })
})

//#endregion
