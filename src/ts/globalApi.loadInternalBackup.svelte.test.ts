/**
 * Report 17 ("CHORE-01 + Phase 2 item 2") Stage 1, Gate 2 (opus-reviewer,
 * REJECT) should-fix item: "Backup-load wiring is untested" --
 * `loadInternalBackup()` (this file) had no test asserting
 * `requiresFullEncoderReload.state` actually gets set after a backup load,
 * despite its call site carrying a comment claiming exactly that (plan
 * §3.3, "the other three call sites already do this").
 *
 * Drives the REAL, unmocked `loadInternalBackup()` in `src/ts/globalApi.svelte.ts`,
 * with all I/O (the `AutoStorage`-backed `forageStorage`, `alertSelect`) mocked.
 * The module-mock set below is copied, unchanged, from
 * `src/ts/globalApi.saveSequence.svelte.test.ts` (the existing precedent for
 * loading this same huge module for real), since `loadInternalBackup()`'s own
 * dependency graph is a subset of `prepareSaveIteration()`'s.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { writable } from 'svelte/store'

//#region module mocks -- copied unchanged from globalApi.saveSequence.svelte.test.ts

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
    isIOS: () => false,
}) as unknown as typeof import('src/ts/platform'))

// Populated synchronously, inside the mock, at the moment `setDatabase` is
// called -- recording it after the fact could not tell a repair that ran
// before this call from one that ran after it, since both leave the same
// final state once the whole load finishes.
const setDatabaseCallState = vi.hoisted(() => ({ idsCompleteAtCall: [] as boolean[] }))

function allIdsFilled(db: { characters?: { chaId?: string, chats?: { id?: string }[] }[] } | undefined): boolean {
    return (db?.characters ?? []).every((c) => !!c?.chaId && (c?.chats ?? []).every((ch) => !!ch?.id))
}

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => {
        throw new Error('no live database in tests')
    }),
    setDatabase: vi.fn((db: unknown) => {
        setDatabaseCallState.idsCompleteAtCall.push(allIdsFilled(db as never))
    }),
    presetTemplate: { name: 'test-preset' },
    defaultSdDataFunc: vi.fn(() => ({})),
    appVer: 'test',
    appSubVer: 'test',
    getCurrentCharacter: vi.fn(),
}) as unknown as typeof import('src/ts/storage/database.svelte'))

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Record<string, unknown> })
    return {
        DBState: state,
        selectedCharID: writable(-1),
        selIdState: { selId: -1 },
        alertStore: writable({ type: 'none', msg: '' }),
        MobileGUI: writable(false),
        botMakerMode: writable(false),
        loadedStore: writable(false),
        LoadingStatusState: { text: '' },
        ReloadGUIPointer: writable(0),
        bodyIntercepterStore: writable(null),
        savingStoppedReason: writable(null),
    } as unknown as typeof import('src/ts/stores.svelte')
})

// Overridden below (mutable, per-test) via alertSelectImpl.
const alertSelectImpl = vi.hoisted(() => ({ fn: vi.fn(async (..._args: unknown[]) => '0') }))

vi.mock(import('src/ts/alert'), () => ({
    alertClear: vi.fn(),
    alertConfirm: vi.fn(async () => true),
    alertError: vi.fn(),
    alertWait: vi.fn(),
    alertMd: vi.fn(),
    alertNormal: vi.fn(),
    alertSelect: (...args: unknown[]) => alertSelectImpl.fn(...args),
    alertTOS: vi.fn(async () => true),
    alertToast: vi.fn(),
    alertInput: vi.fn(),
    alertNormalWait: vi.fn(),
    alertAddCharacter: vi.fn(),
    alertStore: writable({ type: 'none', msg: '' }),
    waitAlert: vi.fn(async () => {}),
}))

vi.mock(import('src/ts/util'), () => ({
    changeFullscreen: vi.fn(),
    checkNullish: vi.fn((v: unknown) => v === null || v === undefined),
    sleep: vi.fn(async () => {}),
    sleepForever: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/util'))

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: vi.fn((p: string) => p),
    invoke: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/api/path', () => ({
    appDataDir: vi.fn(async () => '/appdata'),
    join: vi.fn(async (...p: string[]) => p.join('/')),
    basename: vi.fn(async (p: string) => p.split('/').pop()),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
    open: vi.fn(async () => {}),
}))

vi.mock('streamsaver', () => ({
    default: {},
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: vi.fn(() => ({
        listen: vi.fn(),
        setTitle: vi.fn(),
    })),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppData: 0, Download: 1 },
    writeFile: vi.fn(async () => {}),
    readFile: vi.fn(async () => new Uint8Array()),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(async () => {}),
    readDir: vi.fn(async () => []),
    remove: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: vi.fn(async () => new Response(null, { status: 404 })),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
    save: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(async () => vi.fn()),
}))

vi.mock(import('src/ts/update'), () => ({
    checkRisuUpdate: vi.fn(async () => {}),
}))

vi.mock(import('src/ts/plugins/plugins.svelte'), () => ({
    loadPlugins: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/plugins/plugins.svelte'))

vi.mock(import('src/ts/drive/drive'), () => ({
    checkDriverInit: vi.fn(async () => {}),
    syncDrive: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/drive/drive'))

vi.mock(import('src/ts/parser/parser.svelte'), () => ({
    hasher: vi.fn((s: string) => s),
}) as unknown as typeof import('src/ts/parser/parser.svelte'))

vi.mock(import('src/ts/characterCards'), () => ({
    characterURLImport: vi.fn(),
    hubURL: 'https://example.invalid',
}) as unknown as typeof import('src/ts/characterCards'))

vi.mock(import('src/ts/storage/dbChangeEffects.svelte'), () => ({
    registerDbChangeEffects: vi.fn(),
}) as unknown as typeof import('src/ts/storage/dbChangeEffects.svelte'))

// Stateful, in-memory AutoStorage stand-in (unlike globalApi.saveSequence.svelte.test.ts's
// always-empty one) -- this test needs `keys()`/`getItem()` to actually see a
// backup entry `loadInternalBackup()` itself wrote via `forageStorage`.
const forageMemStore = vi.hoisted(() => new Map<string, unknown>())

vi.mock(import('src/ts/storage/autoStorage'), () => ({
    AutoStorage: class {
        getItem = vi.fn(async (key: string) => forageMemStore.get(key) ?? null)
        setItem = vi.fn(async (key: string, value: unknown) => { forageMemStore.set(key, value) })
        keys = vi.fn(async () => Array.from(forageMemStore.keys()))
        removeItem = vi.fn(async (key: string) => { forageMemStore.delete(key) })
    },
}) as unknown as typeof import('src/ts/storage/autoStorage'))

vi.mock(import('src/ts/gui/animation'), () => ({
    updateAnimationSpeed: vi.fn(),
}) as unknown as typeof import('src/ts/gui/animation'))

vi.mock(import('src/ts/gui/colorscheme'), () => ({
    updateColorScheme: vi.fn(),
    updateTextThemeAndCSS: vi.fn(),
}) as unknown as typeof import('src/ts/gui/colorscheme'))

vi.mock(import('src/ts/observer.svelte'), () => ({
    startObserveDom: vi.fn(),
}) as unknown as typeof import('src/ts/observer.svelte'))

vi.mock(import('src/ts/gui/guisize'), () => ({
    updateGuisize: vi.fn(),
}) as unknown as typeof import('src/ts/gui/guisize'))

vi.mock(import('src/ts/characters'), () => ({
    updateLorebooks: vi.fn((v: unknown) => v),
}) as unknown as typeof import('src/ts/characters'))

vi.mock(import('src/ts/hotkey'), () => ({
    initMobileGesture: vi.fn(),
}) as unknown as typeof import('src/ts/hotkey'))

vi.mock(import('src/ts/process/modules'), () => ({
    moduleUpdate: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/process/modules'))

vi.mock(import('src/ts/process/coldstorage.svelte'), () => ({
    getColdStorageItem: vi.fn(),
    makeColdData: vi.fn(),
}) as unknown as typeof import('src/ts/process/coldstorage.svelte'))

//#endregion

import { loadInternalBackup, requiresFullEncoderReload } from 'src/ts/globalApi.svelte'
import { setDatabase } from 'src/ts/storage/database.svelte'
import { RisuSaveEncoder } from 'src/ts/storage/risuSave'
import type { Database } from 'src/ts/storage/database.svelte'

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

function buildDb(characters: CharacterFixture[]): Database {
    return {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters,
    } as unknown as Database
}

beforeEach(() => {
    forageMemStore.clear()
    requiresFullEncoderReload.state = false
    alertSelectImpl.fn = vi.fn(async () => '1') // selects internalBackups[0] (index 0 -> option 1, "Cancel" is option 0)
    vi.mocked(setDatabase).mockClear()
    setDatabaseCallState.idsCompleteAtCall.length = 0
})

describe('loadInternalBackup — Report 17 Stage 1 Gate 2 should-fix: backup-load wiring untested', () => {
    test('a real backup load through the REAL loadInternalBackup() sets requiresFullEncoderReload.state', async () => {
        const backupDb = buildDb([makeCharacter('char-A', 'A from backup')])
        const encoder = new RisuSaveEncoder()
        await encoder.init(backupDb, { compression: false, skipRemoteSavingOnCharacters: false })
        const encoded = new Uint8Array(encoder.encode()!)

        // loadInternalBackup() lists keys containing 'dbbackup-' -- write directly
        // into the same in-memory store `forageStorage` (the AutoStorage mock
        // above) reads/writes, exactly as the real backup-creation path would
        // have via `forageStorage.setItem`.
        forageMemStore.set('dbbackup-1700000000', encoded)

        expect(requiresFullEncoderReload.state).toBe(false)

        await loadInternalBackup()

        expect(setDatabase).toHaveBeenCalledTimes(1)
        // THE ASSERTION UNDER TEST -- red-proven by temporarily disabling the
        // single `requiresFullEncoderReload.state = true` line in
        // globalApi.svelte.ts's loadInternalBackup() and confirming this fails,
        // then restoring the file byte-identical (see the Stage 1 gate-2 QA
        // report for the diff-restore transcript).
        expect(requiresFullEncoderReload.state).toBe(true)
    })
})

/**
 * After a real backup load, every chat in the installed database has an id,
 * and none is duplicated database-wide (chaIds and chat ids together),
 * matching what boot's `assignIds` (`src/ts/bootstrap.ts`) would leave the
 * database in. `setDatabase` is mocked (see the module mocks above), so this
 * reads the decoded backup object off its mock call -- the same object
 * reference the real `setDatabase` would install onto `DBState.db`.
 */
describe('loadInternalBackup — installed database has no missing or duplicate chat ids', () => {
    test('a backup whose chats lack ids ends up with every chat id filled and none duplicated', async () => {
        const charA = makeCharacter('char-A', 'A from backup')
        // Simulate a pre-existing chat that was saved without an id.
        delete (charA.chats[0] as unknown as { id?: string }).id
        const charB = makeCharacter('char-B', 'B from backup')
        const backupDb = buildDb([charA, charB])
        const encoder = new RisuSaveEncoder()
        await encoder.init(backupDb, { compression: false, skipRemoteSavingOnCharacters: false })
        const encoded = new Uint8Array(encoder.encode()!)
        forageMemStore.set('dbbackup-1700000000', encoded)

        await loadInternalBackup()

        expect(setDatabase).toHaveBeenCalledTimes(1)
        const installed = vi.mocked(setDatabase).mock.calls[0][0] as Database
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
    })

    // Coverage, not proof: an implementation that never repaired anything
    // would also resolve without throwing and still set the reload flag, so
    // passing here does not by itself prove the repair runs on a backup
    // whose character has no chats -- only that nothing in this path throws
    // on it.
    test('a backup holding a character with no chats does not throw, and still sets requiresFullEncoderReload.state', async () => {
        const charNoChats = {
            chaId: 'char-no-chats',
            name: 'No Chats',
            type: 'character',
            chatPage: 0,
        } as unknown as CharacterFixture
        delete (charNoChats as unknown as { chats?: unknown }).chats
        const backupDb = buildDb([charNoChats])
        const encoder = new RisuSaveEncoder()
        await encoder.init(backupDb, { compression: false, skipRemoteSavingOnCharacters: false })
        const encoded = new Uint8Array(encoder.encode()!)
        forageMemStore.set('dbbackup-1700000000', encoded)

        await expect(loadInternalBackup()).resolves.not.toThrow()

        expect(requiresFullEncoderReload.state).toBe(true)
    })

    test('setDatabase is called only after every id in the backup is already filled', async () => {
        const charA = makeCharacter('char-A', 'A from backup')
        delete (charA.chats[0] as unknown as { id?: string }).id
        const backupDb = buildDb([charA])
        const encoder = new RisuSaveEncoder()
        await encoder.init(backupDb, { compression: false, skipRemoteSavingOnCharacters: false })
        const encoded = new Uint8Array(encoder.encode()!)
        forageMemStore.set('dbbackup-1700000000', encoded)

        await loadInternalBackup()

        expect(setDatabaseCallState.idsCompleteAtCall).toEqual([true])
    })

    test('a backup holding a duplicate chat id within one character ends up with neither chat sharing it', async () => {
        const charA = makeCharacter('char-A', 'A from backup')
        // The save file holds one block per chaId, so a backup in the block
        // format these tests encode can never carry two characters sharing
        // one chaId -- only a duplicate chat id within one character
        // survives the encode/decode round trip intact, which is what
        // exercises the repair here.
        charA.chats.push({ ...charA.chats[0] })
        const backupDb = buildDb([charA])
        const encoder = new RisuSaveEncoder()
        await encoder.init(backupDb, { compression: false, skipRemoteSavingOnCharacters: false })
        const encoded = new Uint8Array(encoder.encode()!)
        forageMemStore.set('dbbackup-1700000000', encoded)

        await loadInternalBackup()

        const installed = vi.mocked(setDatabase).mock.calls[0][0] as Database
        const chatIds = (installed.characters[0] as CharacterFixture).chats.map((c) => c.id)
        expect(new Set(chatIds).size).toBe(chatIds.length)
    })
})
