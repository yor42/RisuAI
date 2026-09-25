/**
 * The cold-storage placeholder chat built by `makeColdDataForCharacter` (not
 * exported) has an id, driven through the exported `makeColdData`. Coverage:
 * the placeholder's `chaId` equals the original character's `chaId`.
 *
 * Drives the REAL `src/ts/process/coldstorage.svelte.ts` (`makeColdData`,
 * `setColdStorageItem`, `getColdStorageItem`, real and unmocked). The mock
 * scaffold (platform, stores.svelte, alert, index.svelte, the OPFS
 * `navigator.storage` backend) is a trimmed, one-for-one copy of
 * `coldStorageDeletionGuards.svelte.test.ts`'s OPFS group -- this file needs
 * only the identity of the placeholder chat, not the deletion-guard
 * machinery that file exercises.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, character } from '../../storage/database.svelte'

//#region module mocks -- trimmed one-for-one copy of
// coldStorageDeletionGuards.svelte.test.ts's OPFS-backend group

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
    isIOS: () => false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => {
        throw new Error('no live database in tests')
    }),
    setDatabase: vi.fn(),
}) as unknown as typeof import('src/ts/storage/database.svelte'))

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as unknown as typeof import('../../stores.svelte')
})

vi.mock(import('../index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('../index.svelte'))

vi.mock(import('src/ts/alert'), () => ({
    alertClear: vi.fn(),
    alertConfirm: vi.fn(async () => true),
    alertError: vi.fn(),
    alertWait: vi.fn(),
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('../../globalApi.svelte'), () => ({
    forageStorage: { realStorage: undefined },
    requiresFullEncoderReload: { state: false },
}) as unknown as typeof import('../../globalApi.svelte'))

//#endregion

//#region OPFS backend mock (navigator.storage) -- copied from
// coldStorageDeletionGuards.svelte.test.ts

const opfsStore = new Map<string, Uint8Array>()

const mockDirectoryHandle = {
    async getFileHandle(name: string, opts?: { create?: boolean }) {
        if (opts?.create) {
            return {
                async createWritable() {
                    return {
                        async write(data: Uint8Array) {
                            opfsStore.set(name, data)
                        },
                        async close() {},
                    }
                },
            }
        }
        if (!opfsStore.has(name)) {
            const err = new Error(`not found: ${name}`)
            err.name = 'NotFoundError'
            throw err
        }
        return {
            async getFile() {
                const bytes = opfsStore.get(name)!
                return {
                    async arrayBuffer() {
                        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
                    },
                }
            },
        }
    },
}

Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: {
        getDirectory: async () => mockDirectoryHandle,
    },
})

//#endregion

import { DBState } from '../../stores.svelte'
import { makeColdData } from '../coldstorage.svelte'

type CharacterFixture = Database['characters'][number]

function makeFullCharacter(chaId: string, lastInteraction: number): CharacterFixture {
    return {
        chaId,
        name: 'Full Character',
        type: 'character',
        chatPage: 0,
        lastInteraction,
        chats: [{ id: 'original-chat-0', message: [], note: '', name: 'Chat 1', localLore: [] }],
    } as unknown as CharacterFixture
}

function makeDb(characters: CharacterFixture[]): Database {
    return {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters,
        coldstorage: true,
    } as unknown as Database
}

beforeEach(() => {
    opfsStore.clear()
})

describe('makeColdData -- the cold-storage placeholder chat\'s identity', () => {
    test('the cold-storage placeholder chat has an id', async () => {
        const chaId = 'cold-char-1'
        // Well past makeColdData's 10-day threshold, so this character is
        // moved to cold storage.
        const longAgo = Date.now() - 1000 * 60 * 60 * 24 * 365
        DBState.db = makeDb([makeFullCharacter(chaId, longAgo)])

        await makeColdData()

        const placeholder = DBState.db.characters[0] as unknown as character
        expect(placeholder.coldstorage).toBeTruthy()
        expect(placeholder.chats[0].id).toBeTruthy()
    })

    // Coverage, not proof: the placeholder's chaId already matches the
    // original character's chaId -- this pins that identity so a future
    // change to the placeholder literal cannot silently break it.
    test('the placeholder\'s chaId equals the original character\'s chaId', async () => {
        const chaId = 'cold-char-2'
        const longAgo = Date.now() - 1000 * 60 * 60 * 24 * 365
        DBState.db = makeDb([makeFullCharacter(chaId, longAgo)])

        await makeColdData()

        const placeholder = DBState.db.characters[0] as unknown as character
        expect(placeholder.chaId).toBe(chaId)
    })
})
