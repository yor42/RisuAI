/**
 * `loadPlugins` (`plugins.svelte.ts`) and archived characters ("stubs":
 * placeholders whose full data lives in a cold-storage unit).
 *
 * A V2.1 plugin's code reads and writes the live database directly, so it must
 * never see a stub. Before any enabled V2.1 plugin's code runs, every stub in
 * `DBState.db.characters` is restored from its unit, on every call of
 * `loadPlugins` (boot, the plugin toggle, a plugin calling `loadPlugins`):
 * - one unit at a time, so only one archived character is in flight beyond
 *   those already installed;
 * - a restored character keeps the `lastInteraction` its unit holds;
 * - a stub whose unit cannot be used stays a stub, the plugin still runs, and
 *   the user gets one notice naming exactly those characters;
 * - nothing is restored, and nothing is shown, when no enabled V2.1 plugin
 *   exists (V2.0 and V3 plugins and disabled V2.1 plugins do not trigger it)
 *   or when no stub is left.
 *
 * Drives the REAL `loadPlugins` / `loadV2Plugin` (the plugin script really
 * runs), `coldRestoreAll.ts`, `coldCharacter.ts` and
 * `coldCharacterRestore.ts`. The cold-storage read is a mock
 * (`readColdStorageItem`); it says nothing about the native backends. The V3
 * plugin loader is a mock.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, character } from '../../storage/database.svelte'
import type { RisuPlugin } from '../plugins.svelte'

//#region module mocks

const readColdStorageItemMock = vi.hoisted(() => vi.fn())
const loadV3PluginsMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}))
/** Every text shown to the user, except progress notices. */
const notices = vi.hoisted(() => ({ texts: [] as string[], progress: [] as string[] }))

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

vi.mock(import('../../platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('../../platform'))

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        hotReloading: writable(false),
        pluginAlertModalStore: writable(null),
        selectedCharID: writable(-1),
        CharEmotion: writable({}),
        MobileGUIStack: writable([]),
        OpenRealmStore: writable(null),
    } as unknown as typeof import('../../stores.svelte')
})

vi.mock(import('../../storage/database.svelte'), async () => {
    const { DBState: liveDBState } = await import('../../stores.svelte')
    return {
        getCurrentCharacter: vi.fn(),
        getDatabase: vi.fn(() => liveDBState.db),
        setDatabase: vi.fn((db: Database) => { liveDBState.db = db }),
        setDatabaseLite: vi.fn(),
        presetTemplate: { name: 'test-preset' },
        saveImage: vi.fn(),
        defaultSdDataFunc: vi.fn(() => ({})),
        getCharacterByIndex: vi.fn((index: number) => liveDBState.db.characters?.[index]),
        setCharacterByIndex: vi.fn((index: number, char: unknown) => {
            liveDBState.db.characters[index] = char as never
        }),
    } as unknown as typeof import('../../storage/database.svelte')
})

vi.mock(import('../../alert'), () => {
    const show = (msg: string | Error) => { notices.texts.push(msg instanceof Error ? msg.message : String(msg)) }
    return {
        alertConfirm: vi.fn(async () => true),
        alertPluginConfirm: vi.fn(async () => true),
        alertError: vi.fn(show),
        alertErrorWait: vi.fn(async (msg: string) => { show(msg) }),
        alertNormal: vi.fn(show),
        alertNormalWait: vi.fn(async (msg: string) => { show(msg) }),
        alertMd: vi.fn(show),
        alertToast: vi.fn(show),
        alertWait: vi.fn((msg: string) => { notices.progress.push(String(msg)); return {} }),
        alertClear: vi.fn(),
        waitAlert: vi.fn(async () => {}),
        alertAddCharacter: vi.fn(),
        alertSelect: vi.fn(),
        alertStore: writable({ type: 'none', msg: '' }),
    } as unknown as typeof import('../../alert')
})

vi.mock(import('../../util'), () => ({
    selectSingleFile: vi.fn(),
    selectMultipleFile: vi.fn(),
    sleep: vi.fn(async () => {}),
    checkNullish: vi.fn((v: unknown) => v === null || v === undefined),
    findCharacterbyId: vi.fn(),
    findCharacterIndexbyId: vi.fn(() => -1),
    getUserName: vi.fn(() => 'User'),
}) as unknown as typeof import('../../util'))

vi.mock(import('../../globalApi.svelte'), () => ({
    AppendableBuffer: class {},
    changeChatTo: vi.fn(),
    checkCharOrder: vi.fn(),
    downloadFile: vi.fn(),
    fetchNative: vi.fn(),
    getFileSrc: vi.fn(),
    globalFetch: vi.fn(),
    readImage: vi.fn(),
    requiresFullEncoderReload: { state: false },
    saveAsset: vi.fn(),
    toGetter: vi.fn((obj: unknown) => obj),
    forageStorage: {
        keys: vi.fn(async () => []),
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
    },
    isPlainHttpFileSrc: vi.fn(() => false),
}) as unknown as typeof import('../../globalApi.svelte'))

vi.mock(import('../pluginSafety'), () => ({
    checkCodeSafety: vi.fn(async (code: string) => ({ modifiedCode: code })),
}) as unknown as typeof import('../pluginSafety'))

vi.mock(import('../pluginSafeClass'), () => ({
    SafeDocument: class {},
    SafeIdbFactory: class {},
    SafeLocalStorage: class {
        getItem = vi.fn()
        setItem = vi.fn()
        removeItem = vi.fn()
        clear = vi.fn()
        key = vi.fn()
        keys = vi.fn()
    },
}) as unknown as typeof import('../pluginSafeClass'))

vi.mock(import('../apiV3/v3.svelte'), () => ({
    loadV3Plugins: loadV3PluginsMock,
}) as unknown as typeof import('../apiV3/v3.svelte'))

vi.mock(import('../apiV3/transpiler'), () => ({
    pluginCodeTranspiler: vi.fn((code: string) => code),
}) as unknown as typeof import('../apiV3/transpiler'))

vi.mock(import('../../process/coldstorage.svelte'), () => ({
    readColdStorageItem: readColdStorageItemMock,
    setColdStorageItem: vi.fn(),
}) as unknown as typeof import('../../process/coldstorage.svelte'))

vi.mock(import('../../media'), () => ({
    getImageType: vi.fn(),
}) as unknown as typeof import('../../media'))

vi.mock(import('../../media/avatarThumb'), () => ({
    getAvatarThumbSrc: vi.fn(),
    isThumbEligible: vi.fn(() => false),
}) as unknown as typeof import('../../media/avatarThumb'))

vi.mock(import('../../process/inlayScreen'), () => ({
    updateInlayScreen: vi.fn((cha: unknown) => cha),
}) as unknown as typeof import('../../process/inlayScreen'))

vi.mock(import('../../parser/parser.svelte'), () => ({
    parseMarkdownSafe: vi.fn(),
    hasher: vi.fn((s: string) => s),
}) as unknown as typeof import('../../parser/parser.svelte'))

vi.mock(import('../../translator/translator'), () => ({
    translateHTML: vi.fn(),
}) as unknown as typeof import('../../translator/translator'))

vi.mock(import('../../process/index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('../../process/index.svelte'))

vi.mock(import('../../characterCards'), () => ({
    importCharacter: vi.fn(),
}) as unknown as typeof import('../../characterCards'))

vi.mock(import('../../pngChunk'), () => ({
    PngChunk: class {},
}) as unknown as typeof import('../../pngChunk'))

//#endregion

import { loadPlugins } from '../plugins.svelte'
import { DBState } from '../../stores.svelte'
import { buildColdStub } from '../../process/coldCharacter'

//#region fixtures

type CharacterFixture = Database['characters'][number]
type ColdCharacter = character & { coldstorage?: string }

interface Seen {
    chaId: string
    cold: boolean
}

const seenBy = globalThis as unknown as { __v21Seen?: Seen[], __v21Runs?: number }

function fullCharacter(chaId: string, name = `${chaId} name`): character {
    return {
        type: 'character',
        name,
        chaId,
        chatPage: 0,
        firstMsgIndex: 0,
        creatorNotes: '',
        lastInteraction: 5000,
        desc: `${chaId} description`,
        globalLore: [],
        newGenData: true,
        chats: [{ id: `${chaId}-chat`, message: [{ role: 'user', data: 'Hi', time: 1 }], note: '', name: 'Chat 1', localLore: [] }],
    } as unknown as character
}

function stubOf(chaId: string, name = `${chaId} name`): CharacterFixture {
    return buildColdStub(fullCharacter(chaId, name), `unit-${chaId}`, []) as unknown as CharacterFixture
}

const units = new Map<string, unknown>()

/** Gives the stub's unit its full character. A stub without one has a missing unit. */
function putUnit(chaId: string, name = `${chaId} name`): void {
    units.set(`unit-${chaId}`, fullCharacter(chaId, name))
}

let inFlight = 0
let maxInFlight = 0

function installUnitReader(): void {
    readColdStorageItemMock.mockImplementation(async (key: string) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        try {
            await new Promise((resolve) => setTimeout(resolve, 0))
            const stored = units.get(key)
            return stored ? { status: 'ok', value: { character: structuredClone(stored) } } : { status: 'missing' }
        } finally {
            inFlight--
        }
    })
}

const RECORDING_SCRIPT = `
globalThis.__v21Runs = (globalThis.__v21Runs || 0) + 1
globalThis.__v21Seen = Risuai.getDatabase().characters.map((c) => ({ chaId: c.chaId, cold: !!c.coldstorage }))
`

function plugin(name: string, version: RisuPlugin['version'], enabled = true, script = RECORDING_SCRIPT): RisuPlugin {
    return { name, script, version, enabled, arguments: {}, realArg: {}, customLink: [], argMeta: {} }
}

function installDb(characters: CharacterFixture[], plugins: RisuPlugin[]): void {
    DBState.db = {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins,
        pluginCustomStorage: {},
        characterOrder: characters.map((c) => c.chaId),
        characters,
    } as unknown as Database
}

function liveOf(chaId: string): ColdCharacter {
    return DBState.db.characters.find((c: CharacterFixture) => c.chaId === chaId) as unknown as ColdCharacter
}

function anyNotice(): boolean {
    return notices.texts.length > 0 || notices.progress.length > 0
}

beforeEach(() => {
    units.clear()
    notices.texts.length = 0
    notices.progress.length = 0
    readColdStorageItemMock.mockReset()
    loadV3PluginsMock.mockClear()
    inFlight = 0
    maxInFlight = 0
    installUnitReader()
    delete seenBy.__v21Seen
    delete seenBy.__v21Runs
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

//#endregion

describe('loadPlugins with an enabled V2.1 plugin restores every archived character first', () => {
    test('the plugin sees no stub, every stub is full afterwards and each keeps its unit\'s lastInteraction, one unit read at a time', async () => {
        putUnit('beta')
        putUnit('gamma')
        installDb([fullCharacter('alpha') as unknown as CharacterFixture, stubOf('beta'), stubOf('gamma')], [plugin('legacy', '2.1')])

        await loadPlugins()

        expect(seenBy.__v21Runs).toBe(1)
        expect(seenBy.__v21Seen).toEqual([
            { chaId: 'alpha', cold: false },
            { chaId: 'beta', cold: false },
            { chaId: 'gamma', cold: false },
        ])
        expect(DBState.db.characters.filter((c: CharacterFixture) => (c as unknown as ColdCharacter).coldstorage)).toHaveLength(0)
        expect(liveOf('beta').desc).toBe('beta description')
        expect(liveOf('gamma').desc).toBe('gamma description')
        expect(liveOf('beta').lastInteraction).toBe(5000)
        expect(liveOf('gamma').lastInteraction).toBe(5000)
        expect(readColdStorageItemMock).toHaveBeenCalledTimes(2)
        expect(maxInFlight).toBe(1)
    })

    test('a stub whose unit is missing stays, the plugin still runs, and one notice names that character and no other', async () => {
        putUnit('beta', 'Beta Hero')
        putUnit('delta', 'Delta Hero')
        installDb([fullCharacter('alpha', 'Alpha Hero') as unknown as CharacterFixture, stubOf('beta', 'Beta Hero'), stubOf('gamma', 'Lost Soul'), stubOf('delta', 'Delta Hero')], [plugin('legacy', '2.1')])

        await loadPlugins()

        expect(seenBy.__v21Runs).toBe(1)
        expect(liveOf('gamma').coldstorage).toBe('unit-gamma')
        expect(liveOf('beta').coldstorage).toBeUndefined()
        expect(liveOf('delta').coldstorage).toBeUndefined()
        expect(notices.texts).toHaveLength(1)
        expect(notices.texts[0]).toContain('Lost Soul')
        expect(notices.texts[0]).not.toContain('Beta Hero')
        expect(notices.texts[0]).not.toContain('Delta Hero')
        expect(notices.texts[0]).not.toContain('Alpha Hero')
    })

    test('one notice names every character whose unit could not be restored', async () => {
        putUnit('beta')
        installDb([stubOf('alpha', 'Lost Alpha'), stubOf('beta', 'Beta Hero'), stubOf('gamma', 'Lost Gamma')], [plugin('legacy', '2.1')])

        await loadPlugins()

        expect(seenBy.__v21Runs).toBe(1)
        expect(notices.texts).toHaveLength(1)
        expect(notices.texts[0]).toContain('Lost Alpha')
        expect(notices.texts[0]).toContain('Lost Gamma')
        expect(notices.texts[0]).not.toContain('Beta Hero')
    })

    test('a later loadPlugins call restores a stub that appeared since, before the plugin runs again', async () => {
        installDb([fullCharacter('alpha') as unknown as CharacterFixture], [plugin('legacy', '2.1')])
        await loadPlugins()
        expect(seenBy.__v21Runs).toBe(1)
        putUnit('beta')
        DBState.db.characters.push(stubOf('beta'))

        await loadPlugins()

        expect(seenBy.__v21Runs).toBe(2)
        expect(seenBy.__v21Seen).toEqual([
            { chaId: 'alpha', cold: false },
            { chaId: 'beta', cold: false },
        ])
        expect(liveOf('beta').desc).toBe('beta description')
    })

    test('guard: with no stub in the list a V2.1 plugin runs, nothing is read from cold storage and nothing is shown, on every call', async () => {
        installDb([fullCharacter('alpha') as unknown as CharacterFixture], [plugin('legacy', '2.1')])

        await loadPlugins()
        await loadPlugins()

        expect(seenBy.__v21Runs).toBe(2)
        expect(readColdStorageItemMock).not.toHaveBeenCalled()
        expect(anyNotice()).toBe(false)
    })
})

describe('loadPlugins without an enabled V2.1 plugin leaves archived characters alone', () => {
    test('guard: an enabled V2.0 plugin and an enabled V3 plugin restore nothing and show nothing', async () => {
        putUnit('beta')
        installDb([fullCharacter('alpha') as unknown as CharacterFixture, stubOf('beta')], [plugin('removed-v2', 2), plugin('modern', '3.0', true, '')])

        await loadPlugins()

        expect(readColdStorageItemMock).not.toHaveBeenCalled()
        expect(liveOf('beta').coldstorage).toBe('unit-beta')
        expect(anyNotice()).toBe(false)
        expect(loadV3PluginsMock).toHaveBeenCalledTimes(1)
    })

    test('guard: a disabled V2.1 plugin restores nothing and does not run', async () => {
        putUnit('beta')
        installDb([fullCharacter('alpha') as unknown as CharacterFixture, stubOf('beta')], [plugin('legacy', '2.1', false)])

        await loadPlugins()

        expect(readColdStorageItemMock).not.toHaveBeenCalled()
        expect(liveOf('beta').coldstorage).toBe('unit-beta')
        expect(seenBy.__v21Runs).toBeUndefined()
        expect(anyNotice()).toBe(false)
    })
})
