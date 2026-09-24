/**
 * Specifies the origin module's `commitCharacter` and `commitChat`: each
 * only replaces a slot whose identity matches the clone.
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
import { commitCharacter, commitChat } from '../chatOrigin'
import { installCharacterSaveMarks, resetCharacterSaveMarksForTest } from '../../storage/characterSaveMarks'
import type { toSaveType } from '../../storage/risuSave'

type CharacterFixture = Database['characters'][number]

function makeChat(id: string | undefined, extra: Partial<Chat> = {}): Chat {
    return { id, message: [], note: '', name: '', localLore: [], ...extra } as Chat
}

function makeCharacter(chaId: string | undefined, chats: Chat[], extra: Record<string, unknown> = {}): CharacterFixture {
    return {
        chaId, name: 'Character', type: 'character', chatPage: 0, chats,
        firstMessage: '', desc: '', notes: '', chatFolders: [], viewScreen: 'none',
        bias: [], emotionImages: [], globalLore: [],
        ...extra,
    } as unknown as CharacterFixture
}

function makeGroup(chaId: string, chats: Chat[], memberChaIds: string[]): CharacterFixture {
    return {
        chaId, type: 'group', image: '', firstMessage: '', chats, chatFolders: [], chatPage: 0,
        name: 'Group', viewScreen: 'multiple', characters: memberChaIds, characterTalks: [], characterActive: [],
        globalLore: [], autoMode: false, useCharacterLore: false, emotionImages: [], customscript: [],
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
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('commitCharacter only replaces a slot whose chaId matches the clone', () => {
    test("a member's clone sent to the owner slot is refused, and the group is unchanged", () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
        ])
        const origin = { chaId: 'group-1', chatId: 'chat-1', memberChaId: 'member-a' }
        const before = DBState.db.characters[0]
        const memberClone = makeCharacter('member-a', [makeChat('member-a-chat')], { name: 'clone' })

        expect(commitCharacter(origin, 'owner', memberClone)).toBe(false)
        expect(DBState.db.characters[0]).toBe(before)
    })

    test("the owner's own clone replaces the owner and marks it", () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })
        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        const clone = makeCharacter('char-a', [makeChat('chat-a')], { name: 'Replaced' })

        expect(commitCharacter(origin, 'owner', clone)).toBe(true)
        expect((DBState.db.characters[0] as unknown as { name: string }).name).toBe('Replaced')
        expect(tracker.character).toContain('char-a')
    })

    test("the member's own clone replaces the member and marks it", () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
        ])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })
        const origin = { chaId: 'group-1', chatId: 'chat-1', memberChaId: 'member-a' }
        const clone = makeCharacter('member-a', [makeChat('member-a-chat')], { name: 'Replaced member' })

        expect(commitCharacter(origin, 'member', clone)).toBe(true)
        expect((DBState.db.characters[1] as unknown as { name: string }).name).toBe('Replaced member')
        expect(tracker.character).toContain('member-a')
    })

    test("a mismatched clone sent to the member slot is refused, and the member is unchanged", () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
        ])
        const origin = { chaId: 'group-1', chatId: 'chat-1', memberChaId: 'member-a' }
        const before = DBState.db.characters[1]
        const mismatchedClone = makeCharacter('someone-else', [makeChat('member-a-chat')])

        expect(commitCharacter(origin, 'member', mismatchedClone)).toBe(false)
        expect(DBState.db.characters[1]).toBe(before)
    })
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('commitChat only replaces a chat whose id matches the clone', () => {
    test('a clone with a different id is refused', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        const before = (DBState.db.characters[0] as unknown as { chats: Chat[] }).chats[0]

        expect(commitChat(origin, makeChat('different-id'))).toBe(false)
        expect((DBState.db.characters[0] as unknown as { chats: Chat[] }).chats[0]).toBe(before)
    })

    test('a clone with a matching id replaces the chat and marks the owner', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })
        const origin = { chaId: 'char-a', chatId: 'chat-a' }

        expect(commitChat(origin, makeChat('chat-a', { note: 'replaced' }))).toBe(true)
        expect((DBState.db.characters[0] as unknown as { chats: Chat[] }).chats[0].note).toBe('replaced')
        expect(tracker.character).toContain('char-a')
    })

    test('a gone origin refuses the commit', () => {
        installDb([makeCharacter('char-a', [])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }

        expect(commitChat(origin, makeChat('chat-a'))).toBe(false)
    })

    test('an ambiguous origin refuses the commit', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a'), makeChat('chat-a')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }

        expect(commitChat(origin, makeChat('chat-a', { note: 'x' }))).toBe(false)
    })
})
