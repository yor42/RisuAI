/**
 * The Kei restore (`autoServerBackup`'s restore branch,
 * `src/ts/kei/backup.ts`), given a backup whose chats lack ids, leaves every
 * chat with an id afterwards, none of them duplicated database-wide (chaIds
 * and chat ids together), matching what boot's `assignIds`
 * (`src/ts/bootstrap.ts`) would leave the database in. Plus: a backup
 * holding a character with no `chats` does not throw, and still sets
 * `requiresFullEncoderReload.state`.
 *
 * Every static import of `backup.ts` other than `src/lang`-independent
 * modules is mocked, following the precedent in `backup.test.ts` (same
 * source file, `saveDbKei`'s own test). `setDatabase` is mocked, so this
 * reads the decoded backup object off its mock call -- the same object
 * reference the real `setDatabase` would install onto `DBState.db`.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Database } from '../storage/database.svelte'

const getDatabaseMock = vi.hoisted(() => vi.fn())
const setDatabaseMock = vi.hoisted(() => vi.fn())
const fetchMock = vi.hoisted(() => vi.fn())
const alertSelectMock = vi.hoisted(() => vi.fn())
const alertNormalMock = vi.hoisted(() => vi.fn())
const keiServerURLMock = vi.hoisted(() => vi.fn(() => 'https://kei.example.test'))
const requiresFullEncoderReloadMock = vi.hoisted(() => ({ state: false }))

vi.mock(import('../storage/database.svelte'), () => ({
    getDatabase: getDatabaseMock,
    setDatabase: setDatabaseMock,
}) as unknown as typeof import('../storage/database.svelte'))

vi.mock(import('../globalApi.svelte'), () => ({
    requiresFullEncoderReload: requiresFullEncoderReloadMock,
}) as unknown as typeof import('../globalApi.svelte'))

vi.mock(import('../alert'), () => ({
    alertNormal: alertNormalMock,
    alertSelect: alertSelectMock,
}) as unknown as typeof import('../alert'))

vi.mock(import('./kei'), () => ({
    keiServerURL: keiServerURLMock,
}) as unknown as typeof import('./kei'))

import { autoServerBackup } from './backup'

type CharacterFixture = Database['characters'][number]

function makeCharacter(chaId: string, name: string): CharacterFixture {
    return {
        chaId,
        name,
        type: 'character',
        chatPage: 0,
        chats: [{ id: `${chaId}-chat-0`, message: [], note: '', name: '', localLore: [] }],
    } as unknown as CharacterFixture
}

/** A JSON `Response` stand-in good enough for `autoServerBackup`'s own handling. */
function jsonResponse(status: number, body: unknown) {
    return { status, text: async () => JSON.stringify(body), json: async () => body }
}

// Populated synchronously, inside the mock, at the moment `setDatabase` is
// called -- recording it after the fact could not tell a repair that ran
// before this call from one that ran after it, since both leave the same
// final state once the whole restore finishes.
const idsCompleteAtCall: boolean[] = []

function allIdsFilled(db: { characters?: { chaId?: string, chats?: { id?: string }[] }[] } | undefined): boolean {
    return (db?.characters ?? []).every((c) => !!c?.chaId && (c?.chats ?? []).every((ch) => !!ch?.id))
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    getDatabaseMock.mockReset()
    setDatabaseMock.mockReset()
    alertSelectMock.mockReset()
    alertNormalMock.mockReset()
    requiresFullEncoderReloadMock.state = false
    getDatabaseMock.mockReturnValue({ account: { token: 'tok' } })
    idsCompleteAtCall.length = 0
    setDatabaseMock.mockImplementation((db: unknown) => {
        idsCompleteAtCall.push(allIdsFilled(db as never))
    })
})

describe('autoServerBackup restore -- installed database has no missing or duplicate chat ids', () => {
    test('a restored backup whose chats lack ids ends up with every chat id filled and none duplicated', async () => {
        const charA = makeCharacter('char-A', 'A from kei backup')
        delete (charA.chats[0] as unknown as { id?: string }).id
        const charB = makeCharacter('char-B', 'B from kei backup')
        const backupDb = { characters: [charA, charB] } as unknown as Database

        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith('/autobackup/list')) {
                return jsonResponse(200, { activated: false, backups: [['My Backup', 'backup-key-1']] })
            }
            if (url.endsWith('/autobackup/restore')) {
                return jsonResponse(200, backupDb)
            }
            throw new Error(`unexpected fetch call: ${url}`)
        })
        // First selection picks "My Backup" (menu index 0); the restore
        // branch loops back to the menu afterwards (it never breaks on
        // success), so the second call must pick "Cancel" (menu index 3 for
        // a 1-backup list: [backup, Next, Previous, Cancel]) to terminate it.
        let call = 0
        alertSelectMock.mockImplementation(async () => {
            call += 1
            return call === 1 ? '0' : '3'
        })

        await autoServerBackup()

        expect(setDatabaseMock).toHaveBeenCalledTimes(1)
        const installed = setDatabaseMock.mock.calls[0][0] as Database
        const allIds: string[] = []
        for (const cha of installed.characters as CharacterFixture[]) {
            expect(cha.chaId).toBeTruthy()
            allIds.push(cha.chaId)
            for (const chat of cha.chats ?? []) {
                expect(chat.id).toBeTruthy()
                allIds.push(chat.id)
            }
        }
        expect(new Set(allIds).size).toBe(allIds.length)
        expect(requiresFullEncoderReloadMock.state).toBe(true)
    })

    // Coverage, not proof: requiresFullEncoderReload.state is set
    // unconditionally after the repair call, whether or not that repair does
    // anything at all with a chats-less character, so passing here does not
    // by itself prove the repair tolerates one -- only that nothing in this
    // path throws on it.
    test('a restored backup holding a character with no chats does not throw, and still sets requiresFullEncoderReload.state', async () => {
        const charNoChats = { chaId: 'char-no-chats', name: 'No Chats', type: 'character', chatPage: 0 } as unknown as CharacterFixture
        delete (charNoChats as unknown as { chats?: unknown }).chats
        const backupDb = { characters: [charNoChats] } as unknown as Database

        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith('/autobackup/list')) {
                return jsonResponse(200, { activated: false, backups: [['My Backup', 'backup-key-1']] })
            }
            if (url.endsWith('/autobackup/restore')) {
                return jsonResponse(200, backupDb)
            }
            throw new Error(`unexpected fetch call: ${url}`)
        })
        let call = 0
        alertSelectMock.mockImplementation(async () => {
            call += 1
            return call === 1 ? '0' : '3'
        })

        await expect(autoServerBackup()).resolves.not.toThrow()

        expect(requiresFullEncoderReloadMock.state).toBe(true)
    })

    test('setDatabase is called only after every id in the restored backup is already filled', async () => {
        const charA = makeCharacter('char-A', 'A from kei backup')
        delete (charA.chats[0] as unknown as { id?: string }).id
        const backupDb = { characters: [charA] } as unknown as Database

        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith('/autobackup/list')) {
                return jsonResponse(200, { activated: false, backups: [['My Backup', 'backup-key-1']] })
            }
            if (url.endsWith('/autobackup/restore')) {
                return jsonResponse(200, backupDb)
            }
            throw new Error(`unexpected fetch call: ${url}`)
        })
        let call = 0
        alertSelectMock.mockImplementation(async () => {
            call += 1
            return call === 1 ? '0' : '3'
        })

        await autoServerBackup()

        expect(idsCompleteAtCall).toEqual([true])
    })

    test('a restored backup holding a duplicate chat id within one character ends up with neither chat sharing it', async () => {
        const charA = makeCharacter('char-A', 'A from kei backup')
        charA.chats.push({ ...charA.chats[0] })
        const backupDb = { characters: [charA] } as unknown as Database

        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith('/autobackup/list')) {
                return jsonResponse(200, { activated: false, backups: [['My Backup', 'backup-key-1']] })
            }
            if (url.endsWith('/autobackup/restore')) {
                return jsonResponse(200, backupDb)
            }
            throw new Error(`unexpected fetch call: ${url}`)
        })
        let call = 0
        alertSelectMock.mockImplementation(async () => {
            call += 1
            return call === 1 ? '0' : '3'
        })

        await autoServerBackup()

        const installed = setDatabaseMock.mock.calls[0][0] as Database
        const chatIds = (installed.characters[0] as CharacterFixture).chats.map((c) => c.id)
        expect(new Set(chatIds).size).toBe(chatIds.length)
    })

    // Unlike a backup in the block format, this restore reads JSON straight
    // off res.json() and never goes through the save file's
    // one-block-per-chaId encoding, so a duplicate chaId reaches the repair
    // here intact rather than being collapsed to a single character
    // beforehand.
    test('a restored backup holding a duplicate chaId ends up with neither character missing or sharing it', async () => {
        const charA = makeCharacter('dup-id', 'A from kei backup')
        const charB = makeCharacter('dup-id', 'B from kei backup')
        const backupDb = { characters: [charA, charB] } as unknown as Database

        fetchMock.mockImplementation(async (url: string) => {
            if (url.endsWith('/autobackup/list')) {
                return jsonResponse(200, { activated: false, backups: [['My Backup', 'backup-key-1']] })
            }
            if (url.endsWith('/autobackup/restore')) {
                return jsonResponse(200, backupDb)
            }
            throw new Error(`unexpected fetch call: ${url}`)
        })
        let call = 0
        alertSelectMock.mockImplementation(async () => {
            call += 1
            return call === 1 ? '0' : '3'
        })

        await autoServerBackup()

        const installed = setDatabaseMock.mock.calls[0][0] as Database
        expect(installed.characters.length).toBe(2)
        const chaIds = (installed.characters as CharacterFixture[]).map((c) => c.chaId)
        expect(new Set(chaIds).size).toBe(2)
    })
})
