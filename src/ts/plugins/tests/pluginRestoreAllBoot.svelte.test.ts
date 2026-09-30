/**
 * The boot order `loadPlugins` then `makeColdData` (`bootstrap.ts`) with an
 * enabled V2.1 plugin, root cold storage on, and an archived character
 * ("stub") whose unit is missing.
 *
 * `loadPlugins` leaves that stub in the list and tells the user which
 * characters are still archived, because the V2.1 plugin then sees a
 * placeholder. The alert is a single slot that any later notice, progress text
 * or clear replaces, so the notice must not be replaced before the user has
 * dismissed it, even when `makeColdData` shows its chat-archive progress and
 * clears it afterwards.
 *
 * The alert module is a model of that single slot as `AlertComp.svelte`
 * presents it: a user who presses OK 20 ms after a notice of type 'error',
 * 'normal' or 'markdown' appears, and no on-screen control for a 'wait2'
 * (`alertErrorWait`) or 'wait' (`alertWait`) alert; only Escape closes those. It records every notice
 * that was replaced while still on screen. A boot that does not finish fails
 * with the alert that is on screen. `loadPlugins`, `loadV2Plugin`, `coldRestoreAll.ts`,
 * `coldCharacterRestore.ts` and `makeColdData` (on its Node-server storage
 * branch, backed by an in-memory map) are real; the V3 plugin loader is a
 * mock. This says nothing about the OPFS or Tauri storage paths.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, character } from '../../storage/database.svelte'
import type { RisuPlugin } from '../plugins.svelte'

//#region module mocks

const unitStore = vi.hoisted(() => new Map<string, Uint8Array>())

/**
 * The alert store as one slot, as `AlertComp.svelte` presents it. A notice of
 * type 'error', 'normal' or 'markdown' has an OK button, and a simulated user
 * presses it 20 ms after the notice appears. A 'wait2' notice (`alertErrorWait`)
 * and a 'wait' notice (`alertWait`) have no control the user can press, so
 * nothing ever dismisses them but a later alert call.
 */
const alertModel = vi.hoisted(() => {
    type Kind = 'none' | 'error' | 'normal' | 'markdown' | 'wait' | 'wait2'
    const model = {
        slot: { kind: 'none' as Kind, msg: '', id: 0 },
        nextId: 0,
        /** Every notice (any type but 'wait') that was shown. */
        shown: [] as string[],
        /** Notices replaced or cleared while still on screen, before the user dismissed them. */
        overwritten: [] as string[],
        waiters: [] as (() => void)[],
        reset() {
            model.slot = { kind: 'none', msg: '', id: 0 }
            model.shown.length = 0
            model.overwritten.length = 0
            model.waiters.length = 0
        },
        release() {
            const waiters = model.waiters.splice(0)
            for (const resolve of waiters) {
                resolve()
            }
        },
        dismiss(id: number) {
            if (model.slot.id === id) {
                model.slot = { kind: 'none', msg: '', id: 0 }
                model.release()
            }
        },
        put(kind: Exclude<Kind, 'none'>, msg: string) {
            if (model.slot.kind !== 'none' && model.slot.kind !== 'wait') {
                model.overwritten.push(model.slot.msg)
            }
            const id = ++model.nextId
            model.slot = { kind, msg, id }
            if (kind !== 'wait') {
                model.shown.push(msg)
            }
            if (kind === 'error' || kind === 'normal' || kind === 'markdown') {
                setTimeout(() => model.dismiss(id), 20)
            }
        },
        clear() {
            if (model.slot.kind !== 'none' && model.slot.kind !== 'wait') {
                model.overwritten.push(model.slot.msg)
            }
            model.slot = { kind: 'none', msg: '', id: 0 }
            model.release()
        },
        wait(): Promise<void> {
            if (model.slot.kind === 'none') {
                return Promise.resolve()
            }
            return new Promise<void>((resolve) => { model.waiters.push(resolve) })
        },
    }
    return model
})
const loadV3PluginsMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}))

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

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        hotReloading: writable(false),
        pluginAlertModalStore: writable(null),
        selectedCharID: writable(-1),
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
    } as unknown as typeof import('../../storage/database.svelte')
})

vi.mock(import('../../alert'), () => ({
    alertConfirm: vi.fn(async () => true),
    alertPluginConfirm: vi.fn(async () => true),
    alertError: vi.fn((msg: string | Error) => { alertModel.put('error', msg instanceof Error ? msg.message : String(msg)) }),
    alertErrorWait: vi.fn(async (msg: string) => {
        alertModel.put('wait2', msg)
        await alertModel.wait()
    }),
    alertNormal: vi.fn((msg: string) => { alertModel.put('normal', msg) }),
    alertNormalWait: vi.fn(async (msg: string) => {
        alertModel.put('normal', msg)
        await alertModel.wait()
    }),
    alertMd: vi.fn((msg: string) => { alertModel.put('markdown', msg) }),
    alertToast: vi.fn(),
    alertWait: vi.fn((msg: string) => { alertModel.put('wait', msg); return {} }),
    alertClear: vi.fn(() => { alertModel.clear() }),
    waitAlert: vi.fn(() => alertModel.wait()),
}) as unknown as typeof import('../../alert'))

vi.mock(import('../../util'), () => ({
    selectSingleFile: vi.fn(),
    sleep: vi.fn(async () => {}),
}) as unknown as typeof import('../../util'))

vi.mock(import('../../globalApi.svelte'), () => ({
    fetchNative: vi.fn(),
    globalFetch: vi.fn(),
    readImage: vi.fn(),
    saveAsset: vi.fn(),
    toGetter: vi.fn((obj: unknown) => obj),
    requiresFullEncoderReload: { state: false },
    forageStorage: {
        realStorage: {
            setItem: async (key: string, value: Uint8Array) => { unitStore.set(key, value) },
            getItem: async (key: string) => unitStore.get(key) ?? null,
            keys: async () => Array.from(unitStore.keys()),
        },
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

vi.mock(import('../../process/index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('../../process/index.svelte'))

//#endregion

import { loadPlugins } from '../plugins.svelte'
import { makeColdData } from '../../process/coldstorage.svelte'
import { coldStorageHeader } from '../../process/coldstorageData'
import { buildColdStub } from '../../process/coldCharacter'
import { DBState } from '../../stores.svelte'

//#region fixtures

type CharacterFixture = Database['characters'][number]
type ColdCharacter = character & { coldstorage?: string }

const DAY = 24 * 3_600_000
const seenBy = globalThis as unknown as {
    __v21Runs?: number
    __v21ScreenAtRun?: string
    __alertScreen?: () => string
}

/** A character used just now whose chat has been idle for thirty days. */
function recentCharacterWithIdleChat(chaId: string): CharacterFixture {
    const idleSince = Date.now() - 30 * DAY
    return {
        type: 'character',
        name: `${chaId} name`,
        chaId,
        chatPage: 0,
        firstMsgIndex: 0,
        creatorNotes: '',
        desc: `${chaId} description`,
        lastInteraction: Date.now(),
        chats: [{
            id: `${chaId}-chat`,
            name: 'Chat 1',
            note: '',
            localLore: [],
            message: [0, 1, 2, 3, 4].map((i) => ({ role: 'user', data: `message ${i}`, time: idleSince + i })),
        }],
    } as unknown as CharacterFixture
}

/** An archived character whose unit does not exist. */
function stubWithMissingUnit(chaId: string, name: string): CharacterFixture {
    const source = { type: 'character', name, chaId, chatPage: 0, chats: [], lastInteraction: 5000 } as unknown as character
    return buildColdStub(source, `unit-${chaId}`, []) as unknown as CharacterFixture
}

const V21_PLUGIN: RisuPlugin = {
    name: 'legacy',
    script: `
globalThis.__v21Runs = (globalThis.__v21Runs || 0) + 1
globalThis.__v21ScreenAtRun = globalThis.__alertScreen()
`,
    version: '2.1',
    enabled: true,
    arguments: {},
    realArg: {},
    customLink: [],
    argMeta: {},
}

/** Fails with what is on screen when `work` has not finished, instead of letting the test time out silently. */
async function finishesWithin(work: Promise<unknown>, ms = 1000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'hung'>((resolve) => { timer = setTimeout(() => resolve('hung'), ms) })
    const result = await Promise.race([work.then(() => 'done' as const), timeout])
    clearTimeout(timer)
    expect(result, `boot did not finish: the alert on screen is of type "${alertModel.slot.kind}" (${alertModel.slot.msg}), which the user cannot dismiss`).toBe('done')
}

beforeEach(() => {
    unitStore.clear()
    alertModel.reset()
    loadV3PluginsMock.mockClear()
    delete seenBy.__v21Runs
    delete seenBy.__v21ScreenAtRun
    seenBy.__alertScreen = () => alertModel.slot.kind
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

//#endregion

describe('loadPlugins followed by makeColdData at boot', () => {
    test('the notice naming a character whose unit is missing is not replaced before the user dismisses it', async () => {
        DBState.db = {
            coldstorage: true,
            characters: [recentCharacterWithIdleChat('alpha'), stubWithMissingUnit('gamma', 'Lost Soul')],
            plugins: [V21_PLUGIN],
            pluginCustomStorage: {},
        } as unknown as Database

        await finishesWithin((async () => {
            await loadPlugins()
            await makeColdData()
        })())

        const notices = alertModel.shown.filter((text) => text.includes('Lost Soul'))
        expect(notices).toHaveLength(1)
        expect(alertModel.overwritten.filter((text) => text.includes('Lost Soul'))).toEqual([])
        expect((DBState.db.characters[1] as unknown as ColdCharacter).coldstorage).toBe('unit-gamma')
        expect(seenBy.__v21Runs).toBe(1)
        expect(seenBy.__v21ScreenAtRun).toBe('none')
        // makeColdData did run its chat pass, which shows progress and clears it.
        expect(DBState.db.characters[0].chats[0].message[0].data.startsWith(coldStorageHeader)).toBe(true)
    })
})
