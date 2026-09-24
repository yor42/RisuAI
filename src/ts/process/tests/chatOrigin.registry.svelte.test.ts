/**
 * Specifies the origin module's in-flight registry: a registration counts
 * for its owner
 * and, for a group, for its member too, and `end()` is idempotent.
 */
import { describe, test, expect, vi } from 'vitest'
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
import { beginWork, isWriting } from '../chatOrigin'

type CharacterFixture = Database['characters'][number]

function makeChat(id: string | undefined): Chat {
    return { id, message: [], note: '', name: '', localLore: [] } as Chat
}

function makeCharacter(chaId: string, chats: Chat[]): CharacterFixture {
    return {
        chaId, name: 'Character', type: 'character', chatPage: 0, chats,
        firstMessage: '', desc: '', notes: '', chatFolders: [], viewScreen: 'none',
        bias: [], emotionImages: [], globalLore: [],
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

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('the in-flight registry is counted, and end() is idempotent', () => {
    test('isWriting is true for the chat and the character while registered, and false after end', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]
        const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0])!

        expect(isWriting({ chaId: 'char-a' })).toBe(true)
        expect(isWriting({ chaId: 'char-a', chatId: 'chat-a' })).toBe(true)

        handle.end()

        expect(isWriting({ chaId: 'char-a' })).toBe(false)
        expect(isWriting({ chaId: 'char-a', chatId: 'chat-a' })).toBe(false)
    })

    test('calling end twice is harmless', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]
        const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0])!

        handle.end()
        expect(() => handle.end()).not.toThrow()
        expect(isWriting({ chaId: 'char-a' })).toBe(false)
    })

    test('two registrations need two ends', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]
        const chat = (owner as unknown as { chats: Chat[] }).chats[0]
        const handle1 = beginWork(owner, chat)!
        const handle2 = beginWork(owner, chat)!

        handle1.end()
        expect(isWriting({ chaId: 'char-a' })).toBe(true)

        handle2.end()
        expect(isWriting({ chaId: 'char-a' })).toBe(false)
    })

    test('a group registration counts for both the owner and the member', () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
        ])
        const owner = DBState.db.characters[0]
        const member = DBState.db.characters[1]
        const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0], member)!

        expect(isWriting({ chaId: 'group-1' })).toBe(true)
        expect(isWriting({ chaId: 'member-a' })).toBe(true)

        handle.end()

        expect(isWriting({ chaId: 'group-1' })).toBe(false)
        expect(isWriting({ chaId: 'member-a' })).toBe(false)
    })
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('a registration ended in a finally leaves nothing registered, even if the work throws', () => {
    test('work that throws, with end() in a finally, leaves nothing registered', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]

        expect(() => {
            const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0])!
            try {
                throw new Error('boom')
            } finally {
                handle.end()
            }
        }).toThrow('boom')

        expect(isWriting({ chaId: 'char-a' })).toBe(false)
    })
})
