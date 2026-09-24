/**
 * Specifies the origin module's `beginWork`: it fills a missing id on the
 * live object it is given.
 *
 * Only `../../stores.svelte` is replaced, with a real `$state` DBState, so
 * `beginWork` reads and writes through the same kind of live reactive proxy
 * production code does (see `src/ts/storage/tests/dbChangeEffects.svelte.test.ts`
 * and `src/ts/plugins/tests/pluginSetDatabaseSaveMarks.svelte.test.ts` for the
 * same pattern). `characterSaveMarks.ts` is left real so a mark is observed
 * through its own tracker, not asserted by a spy on an internal call.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, Chat } from '../../storage/database.svelte'

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as unknown as typeof import('../../stores.svelte')
})

import { DBState } from '../../stores.svelte'
import { installCharacterSaveMarks, resetCharacterSaveMarksForTest } from '../../storage/characterSaveMarks'
import type { toSaveType } from '../../storage/risuSave'
import { beginWork } from '../chatOrigin'

type CharacterFixture = Database['characters'][number]

function makeChat(id: string | undefined, extra: Partial<Chat> = {}): Chat {
    return { id, message: [], note: '', name: '', localLore: [], ...extra } as Chat
}

function makeCharacter(chaId: string | undefined, chats: Chat[]): CharacterFixture {
    return {
        chaId, name: 'Character', type: 'character', chatPage: 0, chats,
        firstMessage: '', desc: '', notes: '', chatFolders: [], viewScreen: 'none',
        bias: [], emotionImages: [], globalLore: [],
    } as unknown as CharacterFixture
}

function installDb(characters: CharacterFixture[]): void {
    DBState.db = {
        formatversion: 5, botPresetsId: 0, botPresets: [], modules: [], loadouts: [], plugins: [],
        pluginCustomStorage: {}, characterOrder: characters.map((c) => (c as { chaId: string }).chaId),
        characters,
    } as unknown as Database
}

function makeTracker(): toSaveType {
    return { character: [], chat: [], botPreset: false, modules: false, loadouts: false, plugins: false, pluginCustomStorage: false }
}

afterEach(() => {
    resetCharacterSaveMarksForTest()
    vi.restoreAllMocks()
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('beginWork fills a missing id on the live object it is given', () => {
    test('fills a missing chat id on a live chat and marks the owning character', () => {
        installDb([makeCharacter('char-a', [makeChat(undefined)])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })

        const owner = DBState.db.characters[0]
        const chat = (owner as unknown as { chats: Chat[] }).chats[0]
        expect(chat.id).toBeFalsy()

        const handle = beginWork(owner, chat)

        expect(handle).not.toBeNull()
        expect(chat.id).toBeTruthy()
        expect(handle!.origin.chaId).toBe('char-a')
        expect(handle!.origin.chatId).toBe(chat.id)
        expect(tracker.character).toContain('char-a')

        handle!.end()
    })

    test('fills a missing chaId on a live character and marks it', () => {
        installDb([makeCharacter(undefined, [makeChat('chat-a')])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })

        const owner = DBState.db.characters[0] as unknown as { chaId: string; chats: Chat[] }
        expect(owner.chaId).toBeFalsy()

        const handle = beginWork(owner as unknown as CharacterFixture, owner.chats[0])

        expect(handle).not.toBeNull()
        expect(owner.chaId).toBeTruthy()
        expect(handle!.origin.chaId).toBe(owner.chaId)
        expect(tracker.character).toContain(owner.chaId)

        handle!.end()
    })

    test('a chat that already has an id is left unchanged', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-existing')])])
        const owner = DBState.db.characters[0]
        const chat = (owner as unknown as { chats: Chat[] }).chats[0]

        const handle = beginWork(owner, chat)

        expect(handle).not.toBeNull()
        expect(chat.id).toBe('chat-existing')
        expect(handle!.origin.chatId).toBe('chat-existing')

        handle!.end()
    })

    test('returns null, warns, and writes nothing for a pre-insertion chat object never inserted into the live data', () => {
        installDb([makeCharacter('char-a', [])])
        const owner = DBState.db.characters[0]
        const preInsertionChat = makeChat(undefined)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const handle = beginWork(owner, preInsertionChat)

        expect(handle).toBeNull()
        expect(warn).toHaveBeenCalled()
        expect(preInsertionChat.id).toBeFalsy()
    })

    test('returns null, warns, and writes nothing for a clone of an id-less chat that is already in the live data', () => {
        installDb([makeCharacter('char-a', [makeChat(undefined)])])
        const owner = DBState.db.characters[0]
        const liveChat = (owner as unknown as { chats: Chat[] }).chats[0]
        const clone = { ...liveChat }
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const handle = beginWork(owner, clone)

        expect(handle).toBeNull()
        expect(warn).toHaveBeenCalled()
        // The live chat itself, not just the clone, is left untouched.
        expect(liveChat.id).toBeFalsy()
    })

    // A clone owner carries the live character's own chaId, so a check that
    // only looks at "does this object already have a chaId" cannot tell it
    // apart from the live character it was cloned from -- the owner must
    // also be found by identity among DBState.db.characters, the same way a
    // clone chat already is above.
    test('returns null, warns, and fills nothing when the owner is a clone that already carries the live chaId', () => {
        installDb([makeCharacter('char-a', [makeChat(undefined)])])
        const liveOwner = DBState.db.characters[0]
        const liveChat = (liveOwner as unknown as { chats: Chat[] }).chats[0]
        const cloneOwner = $state.snapshot(liveOwner) as unknown as CharacterFixture
        const cloneChat = (cloneOwner as unknown as { chats: Chat[] }).chats[0]
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const handle = beginWork(cloneOwner, cloneChat)

        expect(handle).toBeNull()
        expect(warn).toHaveBeenCalled()
        // Neither the clone nor the live chat is filled.
        expect(cloneChat.id).toBeFalsy()
        expect(liveChat.id).toBeFalsy()
    })

    test('leaves the owner without a chaId when it also refuses a clone chat', () => {
        installDb([makeCharacter(undefined, [makeChat('chat-a')])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })
        const owner = DBState.db.characters[0] as unknown as { chaId: string; chats: Chat[] }
        const liveChat = owner.chats[0]
        const clone = { ...liveChat, id: undefined }
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const handle = beginWork(owner as unknown as CharacterFixture, clone)

        expect(handle).toBeNull()
        expect(warn).toHaveBeenCalled()
        expect(owner.chaId).toBeFalsy()
        expect(tracker.character).toEqual([])
    })

    // Every object with a missing id must be checked for findability before
    // any fill runs: an unfindable member refuses the whole call, so the
    // owner and chat -- both fillable here -- must be left exactly as
    // unfilled and unmarked as if the member had been checked first.
    test('an unfindable member refuses the call before the owner or chat is ever filled', () => {
        installDb([makeCharacter(undefined, [makeChat(undefined)])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })
        const owner = DBState.db.characters[0] as unknown as { chaId: string; chats: Chat[] }
        const liveChat = owner.chats[0]
        // A clone of a live, id-less character: never itself inserted into
        // DBState.db.characters, so it cannot be found there by identity.
        const memberClone = makeCharacter(undefined, [makeChat('member-chat')])
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const handle = beginWork(owner as unknown as CharacterFixture, liveChat, memberClone)

        expect(handle).toBeNull()
        expect(warn).toHaveBeenCalled()
        expect(owner.chaId).toBeFalsy()
        expect(liveChat.id).toBeFalsy()
        expect(tracker.character).toEqual([])
    })
})
