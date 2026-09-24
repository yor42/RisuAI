/**
 * Specifies the origin module's `writeAt` and `resolveOrigin`: resolution.
 *
 * Drives a real `$state` DBState, following the pattern in
 * `src/ts/storage/tests/dbChangeEffects.svelte.test.ts`: resolution reads the
 * live reactive tree by id, on every call, with no cached index.
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

import { DBState, selectedCharID } from '../../stores.svelte'
import { writeAt, resolveOrigin } from '../chatOrigin'

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

function installDb(characters: CharacterFixture[]): void {
    DBState.db = {
        formatversion: 5, botPresetsId: 0, botPresets: [], modules: [], loadouts: [], plugins: [],
        pluginCustomStorage: {}, characterOrder: characters.map((c) => (c as { chaId: string }).chaId),
        characters,
    } as unknown as Database
}

afterEach(() => {
    selectedCharID.set(-1)
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('resolution follows the live data by id, not by a cached index', () => {
    test('after an unshift on the owner, the origin resolves to the same chat at its new index', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a-0'), makeChat('chat-a-1')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a-1' }
        expect(resolveOrigin(origin)?.chatIndex).toBe(1)

        ;(DBState.db.characters[0] as unknown as { chats: Chat[] }).chats.unshift(makeChat('chat-new'))

        const after = resolveOrigin(origin)
        expect(after?.chatIndex).toBe(2)
        expect(after?.chat.id).toBe('chat-a-1')
    })

    test('after a permanent delete at a lower index, the origin resolves to the same character at its new index', () => {
        installDb([
            makeCharacter('char-a', [makeChat('chat-a-0')]),
            makeCharacter('char-b', [makeChat('chat-b-0')]),
            makeCharacter('char-c', [makeChat('chat-c-0')]),
        ])
        const origin = { chaId: 'char-c', chatId: 'chat-c-0' }
        expect(resolveOrigin(origin)?.ownerIndex).toBe(2)

        DBState.db.characters.splice(0, 1)

        const after = resolveOrigin(origin)
        expect(after?.ownerIndex).toBe(1)
        expect((after?.owner as unknown as { chaId: string }).chaId).toBe('char-c')
    })

    test('fn sees the replacement chat object when the chat is replaced by a clone with the same id', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        const replacement = makeChat('chat-a', { note: 'replaced' })
        ;(DBState.db.characters[0] as unknown as { chats: Chat[] }).chats[0] = replacement

        let seenNote: string | undefined
        expect(writeAt(origin, (ctx) => { seenNote = ctx.chat.note })).toBe(true)
        expect(seenNote).toBe('replaced')
    })

    test('fn sees the replacement character object when the owner is replaced at the same index by a clone with the same chaId', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        const replacement = makeCharacter('char-a', [makeChat('chat-a')], { name: 'Replaced' })
        DBState.db.characters[0] = replacement

        let seenName: string | undefined
        expect(writeAt(origin, (ctx) => { seenName = (ctx.owner as unknown as { name: string }).name })).toBe(true)
        expect(seenName).toBe('Replaced')
    })

    test('resolves correctly after the whole characters array is reassigned to a fresh array of the same elements', () => {
        installDb([
            makeCharacter('char-a', [makeChat('chat-a')]),
            makeCharacter('char-b', [makeChat('chat-b')]),
        ])
        const origin = { chaId: 'char-b', chatId: 'chat-b' }
        const original = DBState.db.characters
        DBState.db.characters = [...original]

        const ctx = resolveOrigin(origin)
        expect(ctx?.ownerIndex).toBe(1)
        expect((ctx?.owner as unknown as { chaId: string }).chaId).toBe('char-b')
    })

    test('resolves correctly after a character is moved away from its index and back (return-to-origin)', () => {
        installDb([
            makeCharacter('char-a', [makeChat('chat-a')]),
            makeCharacter('char-b', [makeChat('chat-b')]),
            makeCharacter('char-c', [makeChat('chat-c')]),
        ])
        const origin = { chaId: 'char-b', chatId: 'chat-b' }
        expect(resolveOrigin(origin)?.ownerIndex).toBe(1)

        const chars = DBState.db.characters
        const moved = chars[1]
        DBState.db.characters = [chars[0], chars[2], moved]
        expect(resolveOrigin(origin)?.ownerIndex).toBe(2)

        const chars2 = DBState.db.characters
        DBState.db.characters = [chars2[0], chars2[2], chars2[1]]
        const back = resolveOrigin(origin)
        expect(back?.ownerIndex).toBe(1)
        expect((back?.owner as unknown as { chaId: string }).chaId).toBe('char-b')
    })

    test('a resolution that already succeeded still detects a duplicate introduced afterward at the same holder', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        expect(resolveOrigin(origin)?.ownerIndex).toBe(0)

        // A second holder of the same chaId appears without moving the first,
        // so an index cached from the resolution above would still validate
        // against it and miss the new ambiguity.
        DBState.db.characters.push(makeCharacter('char-a', [makeChat('chat-a')]))

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const after = resolveOrigin(origin)
        warn.mockRestore()
        expect(after).toBeNull()
    })
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('an origin is gone when its owner or chat cannot be found', () => {
    test('the owner is permanently deleted: writeAt returns false and fn does not run', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        DBState.db.characters.splice(0, 1)

        const fn = vi.fn()
        expect(writeAt(origin, fn)).toBe(false)
        expect(fn).not.toHaveBeenCalled()
    })

    test('the chat is deleted: writeAt returns false and fn does not run', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        ;(DBState.db.characters[0] as unknown as { chats: Chat[] }).chats.splice(0, 1)

        const fn = vi.fn()
        expect(writeAt(origin, fn)).toBe(false)
        expect(fn).not.toHaveBeenCalled()
    })

    test('a trashed character still resolves', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')], { trashTime: Date.now() })])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }

        const fn = vi.fn()
        expect(writeAt(origin, fn)).toBe(true)
        expect(fn).toHaveBeenCalledTimes(1)
    })
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('a cold-storage placeholder owner is gone', () => {
    test('writeAt returns false and fn does not run when the owner is a cold-storage placeholder', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')], { coldstorage: 'true' })])
        const origin = { chaId: 'char-a', chatId: 'chat-a' }

        const fn = vi.fn()
        expect(writeAt(origin, fn)).toBe(false)
        expect(fn).not.toHaveBeenCalled()
    })
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('resolution never reads the selection', () => {
    test('selectedCharID and chatPage set to unrelated values, including -1, do not change the result', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a-0'), makeChat('chat-a-1')], { chatPage: 5 })])
        const origin = { chaId: 'char-a', chatId: 'chat-a-1' }

        selectedCharID.set(-1)
        const fn = vi.fn()
        expect(writeAt(origin, fn)).toBe(true)
        expect(fn).toHaveBeenCalledTimes(1)
        expect((fn.mock.calls[0][0] as { chatIndex: number }).chatIndex).toBe(1)

        selectedCharID.set(999)
        ;(DBState.db.characters[0] as unknown as { chatPage: number }).chatPage = -1
        const fn2 = vi.fn()
        expect(writeAt(origin, fn2)).toBe(true)
        expect(fn2).toHaveBeenCalledTimes(1)
        expect((fn2.mock.calls[0][0] as { chatIndex: number }).chatIndex).toBe(1)
    })
})
