/**
 * Bringing a cold-storage character back into memory by its `chaId`.
 *
 * `restoreColdCharacterByChaId` (`../coldMemberRestore`) resolves true when
 * the character holding the id is warm afterwards, and false when the
 * restore failed. It finds the character's slot by `chaId` again after the
 * cold read's await, never by an index captured before it, so a character
 * inserted or deleted during the read cannot turn into a spurious failure or
 * a write into another character's slot.
 *
 * The cold read (`getColdStorageItem`) is mocked: a test controls what it
 * returns, and what happens to `DBState.db.characters` while it is pending.
 * The character-format step (`../../characters`) is mocked too, so this file
 * only exercises which slot is installed and when the answer is true.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, character } from '../../storage/database.svelte'

const getColdStorageItemMock = vi.hoisted(() => vi.fn())

vi.mock(import('../../stores.svelte'), () => {
    const state = { db: {} as unknown as Database }
    return {
        DBState: state,
        selectedCharID: writable(-1),
        CharEmotion: writable({}),
    } as unknown as typeof import('../../stores.svelte')
})

vi.mock(import('../coldstorage.svelte'), () => ({
    getColdStorageItem: getColdStorageItemMock,
}) as unknown as typeof import('../coldstorage.svelte'))

vi.mock(import('../../characters'), () => ({
    characterFormatUpdate: vi.fn(),
}) as unknown as typeof import('../../characters'))

import { restoreColdCharacterByChaId } from '../coldMemberRestore'
import { DBState } from '../../stores.svelte'

type CharacterFixture = Database['characters'][number]

function warmCharacter(chaId: string, description = `${chaId} description`): CharacterFixture {
    return {
        chaId,
        name: chaId,
        type: 'character',
        chatPage: 0,
        desc: description,
        chats: [{ id: `${chaId}-chat`, message: [{ role: 'user', data: 'Hi', time: 1 }], note: '', name: '', localLore: [] }],
    } as unknown as CharacterFixture
}

function coldPlaceholder(chaId: string, key = `cold-key-${chaId}`): CharacterFixture {
    return {
        type: 'character',
        name: chaId,
        chaId,
        chats: [{ id: `${chaId}-placeholder-chat`, message: [{ time: 1, data: '', role: 'char' }], note: '', name: '', localLore: [] }],
        chatPage: 0,
        firstMsgIndex: 0,
        coldstorage: key,
        coldStoragedChats: [],
    } as unknown as CharacterFixture
}

function installDb(characters: CharacterFixture[]): void {
    DBState.db = { characters } as unknown as Database
}

function holderOf(chaId: string): CharacterFixture | undefined {
    return DBState.db.characters.find((c) => c.chaId === chaId)
}

beforeEach(() => {
    getColdStorageItemMock.mockReset()
})

describe('restoreColdCharacterByChaId', () => {
    test('installs the restored character in the slot that holds the chaId, read with the placeholder\'s key', async () => {
        installDb([warmCharacter('before'), coldPlaceholder('member'), warmCharacter('after')])
        getColdStorageItemMock.mockResolvedValueOnce({ character: warmCharacter('member', 'restored description') })

        const restored = await restoreColdCharacterByChaId('member')

        expect(restored).toBe(true)
        expect(getColdStorageItemMock).toHaveBeenCalledTimes(1)
        expect(getColdStorageItemMock).toHaveBeenCalledWith('cold-key-member')
        expect(DBState.db.characters.map((c) => c.chaId)).toEqual(['before', 'member', 'after'])
        expect((holderOf('member') as unknown as character).coldstorage).toBeUndefined()
        expect((holderOf('member') as unknown as character).desc).toBe('restored description')
    })

    test('a character inserted before the member during the cold read does not move the install onto another slot', async () => {
        installDb([warmCharacter('before'), coldPlaceholder('member'), warmCharacter('after')])
        getColdStorageItemMock.mockImplementationOnce(async () => {
            DBState.db.characters.unshift(warmCharacter('inserted'))
            return { character: warmCharacter('member', 'restored description') }
        })

        const restored = await restoreColdCharacterByChaId('member')

        expect(restored).toBe(true)
        expect(DBState.db.characters.map((c) => c.chaId)).toEqual(['inserted', 'before', 'member', 'after'])
        expect((holderOf('member') as unknown as character).desc).toBe('restored description')
        expect((holderOf('member') as unknown as character).coldstorage).toBeUndefined()
        expect((holderOf('before') as unknown as character).desc).toBe('before description')
        expect((holderOf('inserted') as unknown as character).desc).toBe('inserted description')
    })

    test('a character deleted before the member during the cold read does not stop the install', async () => {
        installDb([warmCharacter('before'), coldPlaceholder('member'), warmCharacter('after')])
        getColdStorageItemMock.mockImplementationOnce(async () => {
            DBState.db.characters.splice(0, 1)
            return { character: warmCharacter('member', 'restored description') }
        })

        const restored = await restoreColdCharacterByChaId('member')

        expect(restored).toBe(true)
        expect(DBState.db.characters.map((c) => c.chaId)).toEqual(['member', 'after'])
        expect((holderOf('member') as unknown as character).desc).toBe('restored description')
        expect((holderOf('after') as unknown as character).desc).toBe('after description')
    })

    test('an item whose character has another chaId resolves false and leaves the placeholder in place', async () => {
        installDb([warmCharacter('before'), coldPlaceholder('member')])
        getColdStorageItemMock.mockResolvedValueOnce({ character: warmCharacter('someone-else') })

        const restored = await restoreColdCharacterByChaId('member')

        expect(restored).toBe(false)
        expect(DBState.db.characters.map((c) => c.chaId)).toEqual(['before', 'member'])
        expect((holderOf('member') as unknown as character).coldstorage).toBe('cold-key-member')
    })

    test.each([
        ['no item', null],
        ['an item without a character', {}],
    ] as const)('%s resolves false and leaves the placeholder in place', async (_label, item) => {
        installDb([warmCharacter('before'), coldPlaceholder('member')])
        getColdStorageItemMock.mockResolvedValueOnce(item)

        const restored = await restoreColdCharacterByChaId('member')

        expect(restored).toBe(false)
        expect(DBState.db.characters.map((c) => c.chaId)).toEqual(['before', 'member'])
        expect((holderOf('member') as unknown as character).coldstorage).toBe('cold-key-member')
    })

    test('a character that is already warm resolves true without a read', async () => {
        installDb([warmCharacter('before'), warmCharacter('member', 'already warm')])

        const restored = await restoreColdCharacterByChaId('member')

        expect(restored).toBe(true)
        expect(getColdStorageItemMock).not.toHaveBeenCalled()
        expect((holderOf('member') as unknown as character).desc).toBe('already warm')
    })
})
