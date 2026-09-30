/**
 * The boot-time archive pass (`makeColdData` in `../coldstorage.svelte`) and an
 * enabled V2.1 plugin.
 *
 * A V2.1 plugin's code reads and writes the live database directly, so while an
 * enabled V2.1 plugin exists the pass archives no character. Chats are archived
 * as usual. V2.0 and V3 plugins and a disabled V2.1 plugin do not stop it.
 *
 * The REAL `coldstorage.svelte.ts` runs here on its Node-server storage branch,
 * backed by an in-memory map standing in for the server's storage; `fflate`
 * compression is real. Everything else it imports is mocked. This says nothing
 * about the OPFS or Tauri write paths, which are not exercised.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, character } from '../../storage/database.svelte'
import { coldStorageHeader } from '../coldstorageData'

const unitStore = vi.hoisted(() => new Map<string, Uint8Array>())

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

import { makeColdData } from '../coldstorage.svelte'
import { DBState } from '../../stores.svelte'

//#region fixtures

const DAY = 24 * 3_600_000

function idleCharacter(chaId: string): character {
    return {
        type: 'character',
        name: `${chaId} name`,
        chaId,
        chatPage: 0,
        firstMsgIndex: 0,
        creatorNotes: '',
        desc: `${chaId} description`,
        lastInteraction: Date.now() - 30 * DAY,
        chats: [{
            id: `${chaId}-chat`,
            name: 'Chat 1',
            note: '',
            localLore: [],
            message: [0, 1, 2, 3, 4].map((i) => ({ role: 'user', data: `message ${i}`, time: Date.now() - 30 * DAY + i })),
        }],
    } as unknown as character
}

interface PluginFixture {
    name: string
    version: 2 | '2.1' | '3.0'
    enabled: boolean
}

function installDb(characters: character[], plugins: PluginFixture[]): void {
    DBState.db = { coldstorage: true, characters, plugins, pluginCustomStorage: {} } as unknown as Database
}

function slot(index: number): character {
    return DBState.db.characters[index] as unknown as character
}

beforeEach(() => {
    unitStore.clear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

//#endregion

describe('makeColdData -- archiving characters while a V2.1 plugin is enabled', () => {
    test('an enabled V2.1 plugin stops a character idle for thirty days from being archived as a character: it stays full in the list', async () => {
        installDb([idleCharacter('idle')], [{ name: 'legacy', version: '2.1', enabled: true }])

        await makeColdData()

        expect(slot(0).coldstorage).toBeUndefined()
        expect(slot(0).desc).toBe('idle description')
        expect(slot(0).chats).toHaveLength(1)
    })

    test('guard: without any plugin a character idle for thirty days becomes a stub', async () => {
        installDb([idleCharacter('idle')], [])

        await makeColdData()

        expect(slot(0).coldstorage).toBeTruthy()
        expect(slot(0).chaId).toBe('idle')
    })

    test('guard: an enabled V2.0 plugin, an enabled V3 plugin and a disabled V2.1 plugin do not stop a character from being archived', async () => {
        installDb([idleCharacter('idle')], [
            { name: 'removed-v2', version: 2, enabled: true },
            { name: 'modern', version: '3.0', enabled: true },
            { name: 'legacy-off', version: '2.1', enabled: false },
        ])

        await makeColdData()

        expect(slot(0).coldstorage).toBeTruthy()
    })

    test('guard: an enabled V2.1 plugin does not stop an idle chat of a recently used character from being archived', async () => {
        const recent = idleCharacter('recent')
        recent.lastInteraction = Date.now()
        installDb([recent], [{ name: 'legacy', version: '2.1', enabled: true }])

        await makeColdData()

        expect(slot(0).coldstorage).toBeUndefined()
        expect(slot(0).chats[0].message).toHaveLength(1)
        expect(slot(0).chats[0].message[0].data.startsWith(coldStorageHeader)).toBe(true)
    })
})
