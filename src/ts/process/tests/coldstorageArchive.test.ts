/**
 * The boot-time archive pass (`makeColdData` in `../coldstorage.svelte`)
 * writing archived-character placeholders (stubs).
 *
 * A character idle for ten days is written into a cold-storage unit and
 * replaced in the list by a stub. The stub is built by `buildColdStub`
 * (`../coldCharacter`): it keeps a group a group, carries the fields the lists
 * read, and the pass never archives a character that is in the trash.
 *
 * The REAL `coldstorage.svelte.ts` runs here on its Node-server storage
 * branch, backed by an in-memory map standing in for the server's storage;
 * `fflate` compression is real. Everything else it imports is mocked. This
 * says nothing about the OPFS or Tauri write paths, which are not exercised.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, character, groupChat } from '../../storage/database.svelte'

const unitStore = vi.hoisted(() => new Map<string, Uint8Array>())
const afterUnitWrite = vi.hoisted(() => ({ run: undefined as (() => void) | undefined }))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    readDir: vi.fn(async () => []),
    BaseDirectory: { AppData: 0 },
}))

vi.mock(import('../../platform'), () => ({
    isTauri: false,
    isNodeServer: true,
}) as unknown as typeof import('../../platform'))

vi.mock(import('../../globalApi.svelte'), () => ({
    forageStorage: {
        realStorage: {
            setItem: async (key: string, value: Uint8Array) => {
                unitStore.set(key, value)
                afterUnitWrite.run?.()
            },
            getItem: async (key: string) => unitStore.get(key) ?? null,
            keys: async () => Array.from(unitStore.keys()),
        },
    },
    requiresFullEncoderReload: { state: false },
}) as unknown as typeof import('../../globalApi.svelte'))

vi.mock(import('../../stores.svelte'), () => ({
    DBState: { db: {} as unknown as Database },
    selectedCharID: writable(-1),
}) as unknown as typeof import('../../stores.svelte'))

vi.mock(import('../../alert'), () => ({
    alertClear: vi.fn(),
    alertConfirm: vi.fn(async () => true),
    alertError: vi.fn(),
    alertWait: vi.fn(),
}) as unknown as typeof import('../../alert'))

vi.mock(import('../index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('../index.svelte'))

import { makeColdData, readColdStorageItem } from '../coldstorage.svelte'
import { listColdDataKeysFromDb } from '../coldstorageData'
import { coldStubChatCount } from '../coldCharacter'
import { DBState } from '../../stores.svelte'

//#region fixtures

const DAY = 24 * 3_600_000

function makeChats(count: number): character['chats'] {
    const chats: character['chats'] = []
    for (let i = 0; i < count; i++) {
        chats.push({
            id: `chat-${i}`,
            name: `Chat ${i}`,
            note: '',
            localLore: [],
            message: [{ role: 'user', data: `message ${i}`, time: 1 + i }],
        } as unknown as character['chats'][number])
    }
    return chats
}

function idleCharacter(chaId: string, extra: Record<string, unknown> = {}): character {
    return {
        type: 'character',
        name: `${chaId} name`,
        image: `${chaId}.png`,
        chaId,
        chatPage: 0,
        firstMsgIndex: 0,
        creatorNotes: `${chaId} notes`,
        desc: `${chaId} description`,
        lastInteraction: Date.now() - 30 * DAY,
        chats: makeChats(3),
        ...extra,
    } as unknown as character
}

function idleGroup(chaId: string, extra: Record<string, unknown> = {}): groupChat {
    return {
        type: 'group',
        name: `${chaId} name`,
        image: '',
        chaId,
        chatPage: 0,
        firstMsgIndex: -1,
        lastInteraction: Date.now() - 30 * DAY,
        characters: ['member-1', 'member-2'],
        chats: makeChats(2),
        ...extra,
    } as unknown as groupChat
}

function installDb(characters: (character | groupChat)[]): void {
    DBState.db = { coldstorage: true, characters, pluginCustomStorage: {} } as unknown as Database
}

function slot(index: number): character {
    return DBState.db.characters[index] as unknown as character
}

let consoleLogSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    unitStore.clear()
    afterUnitWrite.run = undefined
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
    consoleLogSpy.mockRestore()
})

//#endregion

describe('makeColdData -- archiving characters', () => {
    test('guard: a character idle for ten days becomes a stub whose unit holds the full character', async () => {
        installDb([idleCharacter('idle')])

        await makeColdData()

        const stub = slot(0)
        expect(stub.coldstorage).toBeTruthy()
        const unit = await readColdStorageItem(stub.coldstorage as string)
        expect(unit.status).toBe('ok')
        const stored = (unit as { status: 'ok', value: { character: character } }).value.character
        expect(stored.chaId).toBe('idle')
        expect(stored.desc).toBe('idle description')
        expect(stored.chats).toHaveLength(3)
        expect(listColdDataKeysFromDb(DBState.db)).toEqual([stub.coldstorage])
    })

    test('the stub carries the character\'s lastInteraction, description, image, name and chat count', async () => {
        const source = idleCharacter('idle', { chats: makeChats(3) })
        const lastInteraction = source.lastInteraction
        installDb([source])

        await makeColdData()

        const stub = slot(0)
        expect(stub.coldstorage).toBeTruthy()
        expect(stub.type).toBe('character')
        expect(stub.name).toBe('idle name')
        expect(stub.image).toBe('idle.png')
        expect(stub.chaId).toBe('idle')
        expect(stub.lastInteraction).toBe(lastInteraction)
        expect(stub.creatorNotes).toBe('idle notes')
        expect(coldStubChatCount(stub)).toBe(3)
    })

    test('a group idle for ten days becomes a group stub with its member list', async () => {
        installDb([idleGroup('idle-group')])

        await makeColdData()

        const stub = slot(0) as unknown as groupChat
        expect(stub.coldstorage).toBeTruthy()
        expect(stub.type).toBe('group')
        expect(stub.characters).toEqual(['member-1', 'member-2'])
        expect(stub.chaId).toBe('idle-group')
    })

    test('a trashed character idle for ten days stays in memory and no unit is written for it', async () => {
        const trashed = idleCharacter('trashed', { trashTime: Date.now() - DAY })
        installDb([trashed])

        await makeColdData()

        expect(slot(0).coldstorage).toBeUndefined()
        expect(slot(0).desc).toBe('trashed description')
        expect(slot(0).trashTime).toBeTruthy()
        expect(unitStore.size).toBe(0)
    })

    test('a trashed group idle for ten days stays in memory', async () => {
        installDb([idleGroup('trashed-group', { trashTime: Date.now() - DAY })])

        await makeColdData()

        expect(slot(0).coldstorage).toBeUndefined()
        expect(slot(0).type).toBe('group')
        expect(unitStore.size).toBe(0)
    })

    test('guard: a character interacted with recently stays in memory', async () => {
        installDb([idleCharacter('recent', { lastInteraction: Date.now() - DAY })])

        await makeColdData()

        expect(slot(0).coldstorage).toBeUndefined()
        expect(unitStore.size).toBe(0)
    })

    test('guard: a stub is not archived again', async () => {
        installDb([idleCharacter('idle')])
        await makeColdData()
        const firstKey = slot(0).coldstorage
        const unitsAfterFirstPass = unitStore.size

        await makeColdData()

        expect(slot(0).coldstorage).toBe(firstKey)
        expect(unitStore.size).toBe(unitsAfterFirstPass)
    })

    // Pins that the stub is built from the character read back out of the unit,
    // not from the live object: a live change made after the unit's bytes were
    // written must not show up in the stub.
    test('guard: a change to the live character while its unit write is pending does not reach the stub', async () => {
        installDb([idleCharacter('idle', { chats: makeChats(3) })])
        afterUnitWrite.run = () => {
            slot(0).name = 'renamed after the write'
            slot(0).creatorNotes = 'notes changed after the write'
            slot(0).chats.push(...makeChats(4))
        }

        await makeColdData()

        const stub = slot(0)
        expect(stub.coldstorage).toBeTruthy()
        expect(stub.name).toBe('idle name')
        expect(stub.creatorNotes).toBe('idle notes')
        expect(coldStubChatCount(stub)).toBe(3)
    })

    test('a group without a member list still gets a group stub and the archive pass completes', async () => {
        const group = idleGroup('broken-group')
        delete (group as { characters?: string[] }).characters
        installDb([group, idleCharacter('idle')])

        await expect(makeColdData()).resolves.toBeUndefined()

        expect(slot(0).type).toBe('group')
        expect(slot(0).coldstorage).toBeTruthy()
        expect(slot(1).coldstorage).toBeTruthy()
    })

    test.each([
        ['a number', 42],
        ['an object', { en: 'not a string' }],
    ])('the archive pass completes and archives the others when a character\'s creatorNotes is %s', async (_label, notes) => {
        installDb([idleCharacter('odd-notes', { creatorNotes: notes }), idleCharacter('idle')])

        await expect(makeColdData()).resolves.toBeUndefined()

        expect(slot(0).coldstorage).toBeTruthy()
        expect(typeof slot(0).creatorNotes).toBe('string')
        expect(slot(1).coldstorage).toBeTruthy()
    })

    test('guard: the archive pass archives a character whose creatorNotes is undefined with an empty description', async () => {
        installDb([idleCharacter('no-notes', { creatorNotes: undefined })])

        await expect(makeColdData()).resolves.toBeUndefined()

        expect(slot(0).coldstorage).toBeTruthy()
        expect(slot(0).creatorNotes ?? '').toBe('')
    })

    test('guard: the untouched characters in the list keep their place around an archived one', async () => {
        installDb([
            idleCharacter('recent-a', { lastInteraction: Date.now() - DAY }),
            idleCharacter('idle'),
            idleCharacter('recent-b', { lastInteraction: Date.now() - DAY }),
        ])

        await makeColdData()

        expect(DBState.db.characters.map((c) => c.chaId)).toEqual(['recent-a', 'idle', 'recent-b'])
        expect(slot(0).coldstorage).toBeUndefined()
        expect(slot(1).coldstorage).toBeTruthy()
        expect(slot(2).coldstorage).toBeUndefined()
    })
})
