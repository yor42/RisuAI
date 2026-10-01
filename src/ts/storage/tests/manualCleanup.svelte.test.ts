// @vitest-environment happy-dom

/**
 * The manual cold-storage clean-up (`cleanColdStorage`) is one exclusive,
 * strictly-read pass (Agents/Reports/49-memory-stage-1-plan.md, D11).
 *
 * A unit is deleted only when it was present in this page's load-time listing
 * AND in the listing taken when the run starts AND nothing reads it: not live
 * memory, not the committed main file freshly read from storage, not any
 * retained snapshot, and not a blob reached from any of them. An asset is
 * deleted only when it was present at load and at the start and nothing reads
 * it: live memory (read again just before each batch), the characters inside
 * the blobs the trees point at, and the characters stored in full in the
 * committed main file. A retained snapshot's own characters do not keep an
 * asset.
 * The run holds the storage exclusively, refuses while anything else is
 * writing or the main file moved, aborts on anything it cannot read, deletes in
 * bounded batches and reports every failure.
 *
 * The real `cleanColdStorage`, `globalApi.svelte.ts`, `RisuSaveEncoder`,
 * `NodeStorage`, `storageTabLocks` and `chatOrigin` are driven; only platform
 * boundaries are replaced: the `isTauri`/`isNodeServer` flags, an OPFS
 * directory, a `forageStorage` key/value store, the Tauri file system, the Web
 * Locks manager, `fetch` for the Node server, and the alert functions. A mocked
 * success here is not evidence of native backend behaviour.
 *
 * Each test builds its own module graph (`vi.resetModules()`), because
 * `globalApi.svelte.ts` reads `navigator.locks` once when it is evaluated.
 * Tests titled `guard:` pass with or without the behaviour they name and pin
 * what must be preserved; every other test is a regression reproducer.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { writable } from 'svelte/store'
import type { Database } from 'src/ts/storage/database.svelte'
import { FakeLockManagerCore, FakeTabLockManagerView, makeSimulatedTab } from './fakeWebLocks'
import { BLOCK, FakeNodeServer, composeSave, corruptBlockPayload, type SavePart } from './manualCleanupHarness'

//#region shared platform state

type AlertRecord = { type: string, msg: string }

const h = vi.hoisted(() => {
    const subscribers = new Set<(value: AlertRecord) => void>()
    const hub = {
        current: { type: 'none', msg: '' } as AlertRecord,
        history: [] as AlertRecord[],
        confirmAnswer: true,
        set(value: AlertRecord) {
            hub.current = value
            hub.history.push(value)
            subscribers.forEach((fn) => fn(value))
        },
        update(fn: (value: AlertRecord) => AlertRecord) {
            hub.set(fn(hub.current))
        },
        subscribe(fn: (value: AlertRecord) => void) {
            subscribers.add(fn)
            fn(hub.current)
            return () => { subscribers.delete(fn) }
        },
        reset() {
            hub.current = { type: 'none', msg: '' }
            hub.history = []
            hub.confirmAnswer = true
            subscribers.clear()
        },
    }
    return {
        platform: { isTauri: false, isNodeServer: false },
        hub,
        /** The key/value store behind `forageStorage` on the web build. */
        forage: new Map<string, Uint8Array>(),
        forageHooks: {
            onGetItem: undefined as undefined | ((key: string) => void),
            onRemove: undefined as undefined | ((key: string) => void),
            afterRemove: undefined as undefined | ((key: string) => void),
        },
        forageFail: new Set<string>(),
        /** The OPFS root directory: cold-storage units on the web build. */
        opfs: new Map<string, Uint8Array>(),
        opfsHooks: {
            afterEntries: undefined as undefined | (() => void),
            onRemove: undefined as undefined | ((name: string) => void),
            afterRemove: undefined as undefined | ((name: string) => void),
        },
        opfsFail: new Set<string>(),
        opfsLog: { reads: [] as string[], removed: [] as string[], inFlight: 0, peakInFlight: 0 },
        /** The Tauri app-data directory. */
        fs: new Map<string, Uint8Array>(),
        fsFail: new Set<string>(),
        /** Reads or removals of a path that reject with `message`; `removeFile` also takes the file out first. */
        fsReadError: new Map<string, { message: string, removeFile: boolean }>(),
        fsRemoveError: new Map<string, { message: string, removeFile: boolean }>(),
        /** Paths `exists()` reports as absent whatever the store holds. */
        fsHidden: new Set<string>(),
        /** The persistent block cache behind `risuSaveCache`. */
        risuCache: new Map<string, unknown>(),
        keyPair: undefined as undefined | CryptoKeyPair,
        dbHolder: { state: undefined as undefined | { db: unknown } },
    }
})

//#endregion

//#region module mocks

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async (key: string) => h.risuCache.get(key) ?? null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock(import('src/ts/platform'), () => ({
    get isTauri() { return h.platform.isTauri },
    get isNodeServer() { return h.platform.isNodeServer },
    isIOS: () => false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => {
        if (!h.dbHolder.state) {
            throw new Error('no live database in tests')
        }
        return h.dbHolder.state.db
    }),
    setDatabase: vi.fn(),
    presetTemplate: { name: 'test-preset' },
    defaultSdDataFunc: vi.fn(() => ({})),
    appVer: 'test',
    appSubVer: 'test',
    getCurrentCharacter: vi.fn(),
}) as unknown as typeof import('src/ts/storage/database.svelte'))

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    h.dbHolder.state = state
    return {
        DBState: state,
        selectedCharID: writable(-1),
        selIdState: { state: -1 },
        alertStore: h.hub,
        MobileGUI: writable(false),
        botMakerMode: writable(false),
        loadedStore: writable(false),
        LoadingStatusState: { text: '' },
        ReloadGUIPointer: writable(0),
        bodyIntercepterStore: writable(null),
        savingStoppedReason: writable(null),
        CharEmotion: writable({}),
        MobileGUIStack: writable([]),
        OpenRealmStore: writable(false),
        frozenSaveKeysStore: writable([]),
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/process/index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('src/ts/process/index.svelte'))

vi.mock(import('src/ts/alert'), () => ({
    alertClear: vi.fn(() => { h.hub.set({ type: 'none', msg: '' }) }),
    alertConfirm: vi.fn(async (_msg: string) => h.hub.confirmAnswer),
    alertError: vi.fn((msg: string) => { h.hub.set({ type: 'error', msg: String(msg) }) }),
    alertWait: vi.fn((msg: string) => {
        const data = { type: 'wait', msg }
        h.hub.set(data)
        return data
    }),
    alertMd: vi.fn((msg: string) => { h.hub.set({ type: 'markdown', msg }) }),
    alertNormal: vi.fn((msg: string) => { h.hub.set({ type: 'normal', msg }) }),
    alertSelect: vi.fn(),
    alertToast: vi.fn((msg: string) => { h.hub.set({ type: 'toast', msg }) }),
    alertInput: vi.fn(),
    alertNormalWait: vi.fn(),
    alertAddCharacter: vi.fn(),
    alertStore: h.hub,
    waitAlert: vi.fn(async () => {}),
    doingAlert: vi.fn(() => false),
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('src/ts/util'), () => ({
    changeFullscreen: vi.fn(),
    checkNullish: vi.fn((v: unknown) => v === null || v === undefined),
    sleep: vi.fn(async () => {}),
    sleepForever: vi.fn(async () => {}),
    base64url: (source: Uint8Array | ArrayBuffer) => Buffer.from(source as Uint8Array).toString('base64url'),
    getKeypairStore: vi.fn(async () => {
        h.keyPair ??= await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
        return h.keyPair
    }),
    saveKeypairStore: vi.fn(async () => {}),
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

vi.mock(import('src/ts/update'), () => ({
    checkRisuUpdate: vi.fn(async () => {}),
}))

vi.mock(import('src/ts/plugins/plugins.svelte'), () => ({
    loadPlugins: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/plugins/plugins.svelte'))

vi.mock(import('src/ts/parser/parser.svelte'), () => ({
    hasher: vi.fn((s: string) => s),
    parseMarkdownSafe: vi.fn((s: string) => s),
}) as unknown as typeof import('src/ts/parser/parser.svelte'))

vi.mock(import('src/ts/characterCards'), () => ({
    characterURLImport: vi.fn(),
    hubURL: 'https://example.invalid',
    importCharacter: vi.fn(),
}) as unknown as typeof import('src/ts/characterCards'))

vi.mock(import('src/ts/storage/dbChangeEffects.svelte'), () => ({
    registerDbChangeEffects: vi.fn(),
}) as unknown as typeof import('src/ts/storage/dbChangeEffects.svelte'))

vi.mock(import('src/ts/storage/autoStorage'), () => ({
    AutoStorage: class {
        realStorage: {
            getItem(key: string): Promise<Uint8Array | null>
            setItem(key: string, value: Uint8Array): Promise<void>
            keys(): Promise<string[]>
            removeItem(key: string | string[]): Promise<void>
        } | undefined = undefined

        async getItem(key: string) {
            if (this.realStorage) {
                return await this.realStorage.getItem(key)
            }
            h.forageHooks.onGetItem?.(key)
            return h.forage.get(key) ?? null
        }

        async setItem(key: string, value: Uint8Array) {
            if (this.realStorage) {
                return await this.realStorage.setItem(key, value)
            }
            h.forage.set(key, value)
        }

        async keys() {
            if (this.realStorage) {
                return await this.realStorage.keys()
            }
            return Array.from(h.forage.keys())
        }

        async removeItem(key: string) {
            if (this.realStorage) {
                return await this.realStorage.removeItem(key)
            }
            h.forageHooks.onRemove?.(key)
            if (h.forageFail.has(key)) {
                throw new Error(`simulated storage removal failure for ${key}`)
            }
            h.forage.delete(key)
            h.forageHooks.afterRemove?.(key)
        }
    },
}) as unknown as typeof import('src/ts/storage/autoStorage'))

vi.mock(import('src/ts/gui/animation'), () => ({
    updateAnimationSpeed: vi.fn(),
}) as unknown as typeof import('src/ts/gui/animation'))

vi.mock(import('src/ts/gui/colorscheme'), () => ({
    updateColorScheme: vi.fn(),
    updateTextThemeAndCSS: vi.fn(),
}) as unknown as typeof import('src/ts/gui/colorscheme'))

vi.mock('@tauri-apps/plugin-dialog', () => ({
    save: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(async () => vi.fn()),
}))

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

vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: vi.fn(async () => new Response(null, { status: 404 })),
}))

vi.mock(import('src/ts/process/modules'), () => ({
    moduleUpdate: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/process/modules'))

function normalizeFsPath(path: string): string {
    return path.replace(/^\.\//, '').replace(/\\/g, '/')
}

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppData: 0 },
    readDir: vi.fn(async (dir: string) => {
        const prefix = normalizeFsPath(dir).replace(/\/$/, '') + '/'
        const names = new Set<string>()
        for (const key of h.fs.keys()) {
            if (key.startsWith(prefix)) {
                const rest = key.slice(prefix.length)
                if (!rest.includes('/')) {
                    names.add(rest)
                }
            }
        }
        return Array.from(names).map((name) => ({ name, isDirectory: false }))
    }),
    readFile: vi.fn(async (path: string) => {
        const p = normalizeFsPath(path)
        const injected = h.fsReadError.get(p)
        if (injected) {
            if (injected.removeFile) {
                h.fs.delete(p)
            }
            throw new Error(injected.message)
        }
        const bytes = h.fs.get(p)
        if (!bytes) {
            throw new Error(`No such file (os error 2): ${p}`)
        }
        return bytes
    }),
    writeFile: vi.fn(async (path: string, data: Uint8Array) => {
        h.fs.set(normalizeFsPath(path), data)
    }),
    remove: vi.fn(async (path: string) => {
        const p = normalizeFsPath(path)
        const injected = h.fsRemoveError.get(p)
        if (injected) {
            if (injected.removeFile) {
                h.fs.delete(p)
            }
            throw new Error(injected.message)
        }
        if (h.fsFail.has(p)) {
            throw new Error(`simulated file removal failure for ${p}`)
        }
        if (!h.fs.has(p)) {
            throw new Error(`No such file (os error 2): ${p}`)
        }
        h.fs.delete(p)
    }),
    exists: vi.fn(async (path: string) => !h.fsHidden.has(normalizeFsPath(path)) && h.fs.has(normalizeFsPath(path))),
    mkdir: vi.fn(async () => {}),
}))

//#endregion

//#region OPFS directory stand-in (cold-storage units on the web build)

class FakeNotFoundError extends Error {
    name = 'NotFoundError'
}

function opfsName(key: string): string {
    return 'coldstorage_' + key + '.json'
}

const opfsDirectory = {
    async getFileHandle(name: string, opts?: { create?: boolean }) {
        if (opts?.create) {
            return {
                async createWritable() {
                    return {
                        async write(data: Uint8Array) {
                            h.opfs.set(name, data)
                        },
                        async close() {},
                    }
                },
            }
        }
        h.opfsLog.reads.push(name)
        h.opfsLog.inFlight++
        h.opfsLog.peakInFlight = Math.max(h.opfsLog.peakInFlight, h.opfsLog.inFlight)
        if (!h.opfs.has(name)) {
            h.opfsLog.inFlight--
            throw new FakeNotFoundError(`not found: ${name}`)
        }
        return {
            async getFile() {
                return {
                    async arrayBuffer() {
                        await Promise.resolve()
                        await Promise.resolve()
                        h.opfsLog.inFlight--
                        const bytes = h.opfs.get(name)!
                        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
                    },
                }
            },
        }
    },
    async removeEntry(name: string) {
        h.opfsLog.removed.push(name)
        h.opfsHooks.onRemove?.(name)
        if (h.opfsFail.has(name)) {
            throw new Error(`simulated OPFS removal failure for ${name}`)
        }
        if (!h.opfs.has(name)) {
            throw new FakeNotFoundError(`not found: ${name}`)
        }
        h.opfs.delete(name)
        h.opfsHooks.afterRemove?.(name)
    },
    entries() {
        const iter = Array.from(h.opfs.keys())[Symbol.iterator]()
        return {
            [Symbol.asyncIterator]() {
                return {
                    async next() {
                        const r = iter.next()
                        if (r.done) {
                            h.opfsHooks.afterEntries?.()
                            return { done: true as const, value: undefined }
                        }
                        return { done: false as const, value: [r.value, {}] as [string, unknown] }
                    },
                }
            },
        }
    },
}

Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: { getDirectory: async () => opfsDirectory },
})

//#endregion

//#region per-test world

type Character = Database['characters'][number]

interface Ctx {
    cold: typeof import('src/ts/process/coldstorage.svelte')
    listing: typeof import('src/ts/storage/loadTimeListing')
    mainRec: typeof import('src/ts/storage/mainFileRecord')
    stores: typeof import('src/ts/stores.svelte')
    globalApi: typeof import('src/ts/globalApi.svelte')
    chatOrigin: typeof import('src/ts/process/chatOrigin')
    generation: typeof import('src/ts/process/generationOwnership.svelte')
    risuSave: typeof import('src/ts/storage/risuSave')
    nodeMod: typeof import('src/ts/storage/nodeStorage')
    alert: typeof import('src/ts/alert')
}

type Platform = 'web' | 'tauri' | 'node'

let ctx: Ctx
let core: FakeLockManagerCore
let server: FakeNodeServer
let platform: Platform = 'web'
const realFetch = globalThis.fetch

function resetWorld(): void {
    h.hub.reset()
    h.forage.clear()
    h.forageHooks.onGetItem = undefined
    h.forageHooks.onRemove = undefined
    h.forageHooks.afterRemove = undefined
    h.forageFail.clear()
    h.opfs.clear()
    h.opfsHooks.afterEntries = undefined
    h.opfsHooks.onRemove = undefined
    h.opfsHooks.afterRemove = undefined
    h.opfsFail.clear()
    h.opfsLog.reads = []
    h.opfsLog.removed = []
    h.opfsLog.inFlight = 0
    h.opfsLog.peakInFlight = 0
    h.fs.clear()
    h.fsFail.clear()
    h.fsReadError.clear()
    h.fsRemoveError.clear()
    h.fsHidden.clear()
    h.risuCache.clear()
}

/**
 * Boots a fresh module graph on `platform`. `locks: 'none'` models a browser
 * without Web Locks; otherwise this tab ('A') owns a shared fake lock manager
 * that a second simulated tab can join.
 */
async function setup(options: { platform?: Platform, locks?: 'single' | 'none' } = {}): Promise<Ctx> {
    resetWorld()
    platform = options.platform ?? 'web'
    h.platform.isTauri = platform === 'tauri'
    h.platform.isNodeServer = platform === 'node'
    core = new FakeLockManagerCore()
    server = new FakeNodeServer()
    vi.resetModules()
    Object.defineProperty(window.navigator, 'locks', {
        value: options.locks === 'none' ? undefined : new FakeTabLockManagerView(core, 'A'),
        configurable: true,
    })
    ctx = {
        globalApi: await import('src/ts/globalApi.svelte'),
        cold: await import('src/ts/process/coldstorage.svelte'),
        listing: await import('src/ts/storage/loadTimeListing'),
        mainRec: await import('src/ts/storage/mainFileRecord'),
        stores: await import('src/ts/stores.svelte'),
        chatOrigin: await import('src/ts/process/chatOrigin'),
        generation: await import('src/ts/process/generationOwnership.svelte'),
        risuSave: await import('src/ts/storage/risuSave'),
        nodeMod: await import('src/ts/storage/nodeStorage'),
        alert: await import('src/ts/alert'),
    }
    vi.clearAllMocks()
    ctx.listing.resetLoadTimeListingForTests()
    ctx.mainRec.resetMainFileRecordForTests()
    ctx.stores.frozenSaveKeysStore.set([])
    ctx.stores.savingStoppedReason.set(null)
    if (platform === 'node') {
        vi.stubGlobal('fetch', server.fetch)
        ctx.globalApi.forageStorage.realStorage = new ctx.nodeMod.NodeStorage()
    } else if (platform === 'tauri') {
        vi.stubGlobal('fetch', async (input: string | URL | Request) => {
            const bytes = h.fs.get(String(input).replace(/^\/?appdata\//, '').replace(/^\.\//, ''))
            return bytes ? new Response(bytes.slice(), { status: 200 }) : new Response(null, { status: 404 })
        })
    }
    return ctx
}

afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = realFetch
})

//#endregion

//#region fixtures

const COLD_HEADER = 'COLDSTORAGE'

function coldChat(id: string, key: string) {
    return { id, message: [{ time: 1, data: COLD_HEADER + key, role: 'char' }], note: '', name: '', localLore: [] }
}

function errorTextChat(id: string, key: string) {
    return { id, message: [{ time: 1, data: `[Cold storage data could not be loaded. Key: ${key}]`, role: 'char' }], note: '', name: '', localLore: [] }
}

function fullCharacter(chaId: string, name: string, extra: Record<string, unknown> = {}): Character {
    return { chaId, name, type: 'character', chatPage: 0, chats: [], ...extra } as unknown as Character
}

function stubCharacter(chaId: string, name: string, blobKey: string): Character {
    return {
        chaId,
        name,
        type: 'character',
        chatPage: 0,
        coldstorage: blobKey,
        coldStoragedChats: [],
        chats: [{ message: [{ time: 1, data: '', role: 'char' }], note: '', name: '', localLore: [] }],
    } as unknown as Character
}

function makeDb(characters: Character[], extra: Record<string, unknown> = {}): Database {
    return {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characterOrder: characters.map((c) => c.chaId),
        characters,
        coldstorage: false,
        ...extra,
    } as unknown as Database
}

function setLive(db: Database): void {
    ctx.stores.DBState.db = db
}

const CHAT_VALUE = {
    message: [{ time: 1, data: 'archived', role: 'user' }],
    hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
    hypaV3Data: { summaries: [] },
    scriptstate: {},
    localLore: [],
}

/** A unit whose content is never decoded: only its presence matters. */
function seedUnit(key: string): void {
    const bytes = new Uint8Array([1, 2, 3])
    if (platform === 'node') {
        server.seed('coldstorage/' + key, bytes)
    } else if (platform === 'tauri') {
        h.fs.set('coldstorage/' + key + '.json', bytes)
    } else {
        h.opfs.set(opfsName(key), bytes)
    }
}

/** A unit written through the real writer, so that it decodes. */
async function putUnit(key: string, value: unknown = CHAT_VALUE): Promise<void> {
    expect(await ctx.cold.setColdStorageItem(key, value)).toBe(true)
}

async function putBlob(blobKey: string, character: Character): Promise<void> {
    await putUnit(blobKey, { character })
}

async function units(): Promise<string[]> {
    return (await ctx.cold.listColdStorageItems()).items
}

function assetKeys(): string[] {
    const keys = platform === 'node' ? Array.from(server.files.keys()) : Array.from(h.forage.keys())
    return keys.filter((k) => k.startsWith('assets/'))
}

function seedAsset(name: string): void {
    if (platform === 'node') {
        server.seed('assets/' + name, new Uint8Array([9, 9]))
    } else {
        h.forage.set('assets/' + name, new Uint8Array([9, 9]))
    }
}

async function encodeTree(db: Database): Promise<Uint8Array> {
    const encoder = new ctx.risuSave.RisuSaveEncoder()
    await encoder.init(db, {})
    return new Uint8Array(encoder.encode()!)
}

function storeMain(bytes: Uint8Array): void {
    if (platform === 'node') {
        server.seed('database/database.bin', bytes)
    } else if (platform === 'tauri') {
        h.fs.set('database/database.bin', bytes)
    } else {
        h.forage.set('database/database.bin', bytes)
    }
}

function snapshotKey(n: number): string {
    return `database/dbbackup-${n}.bin`
}

function storeSnapshot(n: number, bytes: Uint8Array): void {
    if (platform === 'node') {
        server.seed(snapshotKey(n), bytes)
    } else if (platform === 'tauri') {
        h.fs.set(snapshotKey(n), bytes)
    } else {
        h.forage.set(snapshotKey(n), bytes)
    }
}

/**
 * The state of a page that has just booted: the committed main file is in
 * storage, this tab has read it (and, on Node, holds its revision), and the
 * load-time listing has been taken. `main` is a tree to encode as the
 * committed file, or the exact bytes to commit; it defaults to the live tree.
 */
async function prime(main?: Database | Uint8Array, options: { listing?: boolean, record?: boolean } = {}): Promise<Uint8Array> {
    const bytes = main instanceof Uint8Array ? main : await encodeTree(main ?? ctx.stores.DBState.db)
    storeMain(bytes)
    if (platform === 'node') {
        await ctx.globalApi.forageStorage.getItem('database/database.bin')
    }
    if (options.record !== false) {
        ctx.mainRec.noteMainFileBytes(bytes.slice())
    }
    if (options.listing !== false) {
        await ctx.listing.recordLoadTimeListing()
    }
    return bytes
}

async function run(): Promise<void> {
    await ctx.cold.cleanColdStorage()
}

function errorMessages(): string[] {
    return vi.mocked(ctx.alert.alertError).mock.calls.map((call) => String(call[0]))
}

const NOTICE_TYPES = new Set(['error', 'normal', 'markdown', 'toast', 'wait2'])

/** Every non-wait message shown during the run, in order. */
function shownNotices(): string[] {
    return h.hub.history.filter((a) => NOTICE_TYPES.has(a.type)).map((a) => a.msg)
}

async function expectUntouched(keys: string[]): Promise<void> {
    expect(await units()).toEqual(expect.arrayContaining(keys))
}

//#endregion

//#region hand-composed save files

function rootPart(db: Database, directory?: string[]): SavePart {
    const root: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(db)) {
        if (key !== 'characters' && key !== 'botPresets' && key !== 'modules') {
            root[key] = value
        }
    }
    if (directory) {
        root.__directory = directory
    }
    return { name: 'root', type: BLOCK.ROOT, data: JSON.stringify(root) }
}

function characterPart(character: Character): SavePart {
    return { name: character.chaId, type: BLOCK.CHARACTER_WITH_CHAT, data: JSON.stringify(character) }
}

const CONFIG_PART: SavePart = { name: 'config', type: BLOCK.CONFIG, data: JSON.stringify({ version: 1 }) }

function scaffoldParts(db: Database, directory?: string[]): SavePart[] {
    return [
        rootPart(db, directory),
        { name: 'preset', type: BLOCK.BOTPRESET, data: JSON.stringify(db.botPresets) },
        { name: 'modules', type: BLOCK.MODULES, data: JSON.stringify(db.modules) },
        { name: 'loadouts', type: BLOCK.LOADOUTS, data: JSON.stringify(db.loadouts) },
        { name: 'plugins', type: BLOCK.PLUGINS, data: JSON.stringify(db.plugins) },
        { name: 'pluginStorage', type: BLOCK.PLUGIN_STORAGE, data: JSON.stringify(db.pluginCustomStorage) },
    ]
}

async function composeIntact(characters: Character[]): Promise<Uint8Array> {
    const db = makeDb([])
    const composed = await composeSave(new ctx.risuSave.RisuSaveEncoder(), [
        ...scaffoldParts(db),
        ...characters.map(characterPart),
        CONFIG_PART,
    ])
    return composed.bytes
}

const REMOTE_HASH = '00aa11bb22cc33dd'

function remoteFileKey(name: string): string {
    return `remotes/${name}.${REMOTE_HASH}.bin`
}

function remotePointerPart(name: string): SavePart {
    return {
        name,
        type: BLOCK.REMOTE,
        data: JSON.stringify({ v: 2, type: BLOCK.CHARACTER_WITH_CHAT, name, hash: REMOTE_HASH }),
    }
}

const DEFECTS = [
    'a missing remote file',
    'a checksum-corrupt block',
    'a block that fails to parse',
    'a directory entry absent from the file',
] as const
type Defect = typeof DEFECTS[number]

/** A save file with exactly one defect that the default decoder silently absorbs. */
async function defectiveSave(defect: Defect): Promise<Uint8Array> {
    const db = makeDb([])
    const encoder = new ctx.risuSave.RisuSaveEncoder()
    const victim = fullCharacter('victim-cha', 'Victim', { chats: [coldChat('victim-chat', 'defect-referenced-unit')] })
    switch (defect) {
        case 'a missing remote file':
            return (await composeSave(encoder, [...scaffoldParts(db), remotePointerPart('remote-cha'), CONFIG_PART])).bytes
        case 'a checksum-corrupt block': {
            const composed = await composeSave(encoder, [...scaffoldParts(db), characterPart(victim), CONFIG_PART])
            return corruptBlockPayload(composed, 'victim-cha')
        }
        case 'a block that fails to parse':
            return (await composeSave(encoder, [
                ...scaffoldParts(db),
                { name: 'broken-cha', type: BLOCK.CHARACTER_WITH_CHAT, data: '{"chaId": "broken-cha", "chats": [' },
                CONFIG_PART,
            ])).bytes
        case 'a directory entry absent from the file':
            h.risuCache.set('risuSaveBlock_ghost-cha', {
                type: BLOCK.CHARACTER_WITH_CHAT,
                name: 'ghost-cha',
                data: JSON.stringify(fullCharacter('ghost-cha', 'Ghost', { chats: [coldChat('ghost-chat', 'defect-referenced-unit')] })),
            })
            return (await composeSave(encoder, [...scaffoldParts(db, ['ghost-cha']), CONFIG_PART])).bytes
    }
}

//#endregion

describe('fixtures', () => {
    test('guard: a hand-composed intact save decodes to its characters', async () => {
        await setup()
        const bytes = await composeIntact([fullCharacter('fixture-cha', 'Fixture')])
        const decoded = await ctx.risuSave.decodeRisuSave(bytes)
        expect(decoded.characters.map((c) => c.chaId)).toEqual(['fixture-cha'])
    })

    test('guard: an encoded tree decodes with its stub and its plugin storage', async () => {
        await setup()
        const bytes = await encodeTree(makeDb([stubCharacter('stub-cha', 'Stubby', 'some-blob')], { pluginCustomStorage: { _coldplugin: { key: 'plugin-unit' } } }))
        const decoded = await ctx.risuSave.decodeRisuSave(bytes)
        expect(decoded.characters.map((c) => c.coldstorage)).toEqual(['some-blob'])
        expect(decoded.pluginCustomStorage).toEqual({ _coldplugin: { key: 'plugin-unit' } })
    })

    test('guard: a remote block whose file exists decodes to the remote character', async () => {
        await setup()
        h.forage.set(remoteFileKey('remote-cha'), new TextEncoder().encode(JSON.stringify(
            fullCharacter('remote-cha', 'Remote', { chats: [coldChat('remote-chat', 'remote-block-unit')] }),
        )))
        const composed = await composeSave(new ctx.risuSave.RisuSaveEncoder(), [
            ...scaffoldParts(makeDb([])), remotePointerPart('remote-cha'), CONFIG_PART,
        ])
        const decoded = await ctx.risuSave.decodeRisuSave(composed.bytes)
        expect(decoded.characters.map((c) => c.chaId)).toEqual(['remote-cha'])
    })

    test.each([...DEFECTS])('guard: the default decoder absorbs %s without raising', async (defect) => {
        await setup()
        const bytes = await defectiveSave(defect)
        const decoded = await ctx.risuSave.decodeRisuSave(bytes)
        const ids = (decoded.characters ?? []).map((c) => c.chaId)
        if (defect === 'a directory entry absent from the file') {
            expect(ids).toContain('ghost-cha')
        } else {
            expect(ids).not.toContain('victim-cha')
            expect(ids).not.toContain('remote-cha')
            expect(ids).not.toContain('broken-cha')
        }
    })
})

describe('units: what the clean-up keeps', () => {
    test('keeps a unit referenced only by the committed main file and deletes an unreferenced unit', async () => {
        await setup()
        await putUnit('main-only-unit')
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime(makeDb([fullCharacter('char-a', 'Alice', { chats: [coldChat('chat-1', 'main-only-unit')] })]))

        await run()

        const after = await units()
        expect(after).toContain('main-only-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('keeps a unit referenced only by the oldest retained snapshot', async () => {
        await setup()
        await putUnit('oldest-only-unit')
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([fullCharacter('char-a', 'Alice', { chats: [coldChat('chat-1', 'oldest-only-unit')] })])))
        storeSnapshot(17000000002, await encodeTree(makeDb([])))
        storeSnapshot(17000000003, await encodeTree(makeDb([])))

        await run()

        const after = await units()
        expect(after).toContain('oldest-only-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('keeps a unit referenced only by a character stored as a remote block in the committed main', async () => {
        await setup()
        await putUnit('remote-block-unit')
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        h.forage.set(remoteFileKey('remote-cha'), new TextEncoder().encode(JSON.stringify(
            fullCharacter('remote-cha', 'Remote', { chats: [coldChat('remote-chat', 'remote-block-unit')] }),
        )))
        const composed = await composeSave(new ctx.risuSave.RisuSaveEncoder(), [
            ...scaffoldParts(makeDb([])), remotePointerPart('remote-cha'), CONFIG_PART,
        ])
        await prime(composed.bytes)

        await run()

        const after = await units()
        expect(after).toContain('remote-block-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('keeps a legacy error-text key referenced only by the committed main file', async () => {
        await setup()
        await putUnit('error-text-unit')
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime(makeDb([fullCharacter('char-a', 'Alice', { chats: [errorTextChat('chat-1', 'error-text-unit')] })]))

        await run()

        const after = await units()
        expect(after).toContain('error-text-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test.each([
        ['a pointer', (key: string) => coldChat('inner-chat', key)],
        ['a legacy error text', (key: string) => errorTextChat('inner-chat', key)],
    ])('keeps a chat unit referenced only by %s inside a blob whose stub exists only in the committed main file', async (_label, makeInnerChat) => {
        await setup()
        await putUnit('inner-unit')
        await putBlob('main-stub-blob', fullCharacter('stub-cha', 'Stubby', { chats: [makeInnerChat('inner-unit')] }))
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime(makeDb([stubCharacter('stub-cha', 'Stubby', 'main-stub-blob')]))

        await run()

        const after = await units()
        expect(after).toContain('main-stub-blob')
        expect(after).toContain('inner-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('keeps a chat unit referenced only inside a blob whose stub exists only in a snapshot', async () => {
        await setup()
        await putUnit('inner-unit')
        await putBlob('snapshot-stub-blob', fullCharacter('stub-cha', 'Stubby', { chats: [coldChat('inner-chat', 'inner-unit')] }))
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([stubCharacter('stub-cha', 'Stubby', 'snapshot-stub-blob')])))

        await run()

        const after = await units()
        expect(after).toContain('snapshot-stub-blob')
        expect(after).toContain('inner-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('keeps a _coldplugin unit referenced only by a snapshot plugin storage', async () => {
        await setup()
        await putUnit('plugin-unit', { some: 'plugin value' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([], { pluginCustomStorage: { _coldplugin: { 'plugin-key': 'plugin-unit' } } })))

        await run()

        const after = await units()
        expect(after).toContain('plugin-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('guard: keeps a _coldplugin unit referenced by live memory', async () => {
        await setup()
        await putUnit('live-plugin-unit', { some: 'plugin value' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([], { pluginCustomStorage: { _coldplugin: { 'plugin-key': 'live-plugin-unit' } } }))
        await prime()

        await run()

        const after = await units()
        expect(after).toContain('live-plugin-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('reads each distinct blob exactly once and never two at a time', async () => {
        await setup()
        const cha = (n: number) => `blob-cha-${n}`
        const blob = (n: number) => `shared-blob-${n}`
        for (const n of [1, 2, 3]) {
            await putBlob(blob(n), fullCharacter(cha(n), `Blobby ${n}`))
        }
        // blob 1 is reached from the live tree, the committed main file and all three snapshots;
        // blob 2 only from the live tree; blob 3 only from the second snapshot.
        setLive(makeDb([stubCharacter(cha(1), 'Blobby 1', blob(1)), stubCharacter(cha(2), 'Blobby 2', blob(2))]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([stubCharacter(cha(1), 'Blobby 1', blob(1))])))
        storeSnapshot(17000000002, await encodeTree(makeDb([stubCharacter(cha(1), 'Blobby 1', blob(1)), stubCharacter(cha(3), 'Blobby 3', blob(3))])))
        storeSnapshot(17000000003, await encodeTree(makeDb([stubCharacter(cha(1), 'Blobby 1', blob(1))])))
        h.opfsLog.reads = []
        h.opfsLog.peakInFlight = 0

        await run()

        const readsOf = (n: number) => h.opfsLog.reads.filter((name) => name === opfsName(blob(n))).length
        expect([readsOf(1), readsOf(2), readsOf(3)]).toEqual([1, 1, 1])
        expect(h.opfsLog.peakInFlight).toBeLessThanOrEqual(1)
    })

    test('guard: does not prune the retained snapshots while listing them', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        const snapshotNumbers = Array.from({ length: 22 }, (_, i) => 17000000001 + i)
        const emptyTree = await encodeTree(makeDb([]))
        for (const n of snapshotNumbers) {
            storeSnapshot(n, emptyTree)
        }

        await run()

        for (const n of snapshotNumbers) {
            expect(h.forage.has(snapshotKey(n))).toBe(true)
        }
    })
})

describe('a profile that never used plugin storage', () => {
    test('REPRODUCER: proceeds when the committed main file and a snapshot hold an empty plugin storage block', async () => {
        await setup()
        await putUnit('main-only-unit')
        await putUnit('snapshot-only-unit')
        seedUnit('unreferenced-unit')
        seedAsset('orphan.png')
        setLive(makeDb([]))
        await prime(makeDb(
            [fullCharacter('char-a', 'Alice', { chats: [coldChat('chat-1', 'main-only-unit')] })],
            { pluginCustomStorage: undefined },
        ))
        storeSnapshot(17000000001, await encodeTree(makeDb(
            [fullCharacter('char-b', 'Bob', { chats: [coldChat('chat-2', 'snapshot-only-unit')] })],
            { pluginCustomStorage: undefined },
        )))

        await run()

        const after = await units()
        expect(after).toContain('main-only-unit')
        expect(after).toContain('snapshot-only-unit')
        expect(after).not.toContain('unreferenced-unit')
        expect(assetKeys()).not.toContain('assets/orphan.png')
        expect(errorMessages()).toEqual([])
    })

    test('REPRODUCER: keeps a _coldplugin unit referenced only by a snapshot when another snapshot has an empty plugin storage block', async () => {
        await setup()
        await putUnit('plugin-unit', { some: 'plugin value' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([], { pluginCustomStorage: undefined })))
        storeSnapshot(17000000002, await encodeTree(makeDb([], { pluginCustomStorage: { _coldplugin: { 'plugin-key': 'plugin-unit' } } })))

        await run()

        const after = await units()
        expect(after).toContain('plugin-unit')
        expect(after).not.toContain('unreferenced-unit')
    })

    test('guard: aborts and deletes nothing when a snapshot plugin storage block holds content that is not valid JSON', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        seedAsset('orphan.png')
        setLive(makeDb([]))
        await prime()
        const parts = scaffoldParts(makeDb([])).map((part) =>
            part.name === 'pluginStorage' ? { ...part, data: '{"_coldplugin"' } : part,
        )
        const damaged = await composeSave(new ctx.risuSave.RisuSaveEncoder(), [...parts, CONFIG_PART])
        storeSnapshot(17000000001, damaged.bytes)

        await run()

        await expectUntouched(['unreferenced-unit'])
        expect(assetKeys()).toContain('assets/orphan.png')
        expect(errorMessages().length).toBeGreaterThan(0)
    })
})

describe('units: the load-time listing bounds what may be deleted', () => {
    test('keeps a unit written after the load-time listing and deletes one that was present at load', async () => {
        await setup()
        seedUnit('present-at-load')
        setLive(makeDb([]))
        await prime()
        seedUnit('written-after-load')

        await run()

        const after = await units()
        expect(after).toContain('written-after-load')
        expect(after).not.toContain('present-at-load')
    })

    test('deletes nothing when no load-time listing was recorded', async () => {
        await setup()
        seedUnit('present-at-load')
        setLive(makeDb([]))
        await prime(undefined, { listing: false })

        await run()

        expect(await units()).toContain('present-at-load')
    })

    test('guard: keeps a unit written while the run is in progress', async () => {
        await setup()
        seedUnit('present-at-load')
        setLive(makeDb([]))
        await prime()
        h.opfsHooks.afterEntries = () => {
            h.opfsHooks.afterEntries = undefined
            seedUnit('written-during-run')
        }

        await run()

        const after = await units()
        expect(after).toContain('written-during-run')
        expect(after).not.toContain('present-at-load')
    })
})

describe('strict reads: the run aborts and deletes nothing', () => {
    const PLACES = ['the committed main file', 'a retained snapshot'] as const

    for (const place of PLACES) {
        test.each([...DEFECTS])(`when ${place} has %s`, async (defect) => {
            await setup()
            seedUnit('unreferenced-unit')
            await putUnit('defect-referenced-unit')
            setLive(makeDb([]))
            const defective = await defectiveSave(defect)
            if (place === 'the committed main file') {
                await prime(defective)
            } else {
                await prime(makeDb([]))
                storeSnapshot(17000000001, defective)
            }

            await run()

            await expectUntouched(['unreferenced-unit', 'defect-referenced-unit'])
            expect(errorMessages().length).toBeGreaterThan(0)
        })
    }

    test('skips a snapshot that vanishes between listing and reading and still honours the others', async () => {
        await setup()
        await putUnit('surviving-snapshot-unit')
        await putUnit('vanishing-snapshot-unit')
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([fullCharacter('char-a', 'Alice', { chats: [coldChat('chat-1', 'surviving-snapshot-unit')] })])))
        storeSnapshot(17000000002, await encodeTree(makeDb([fullCharacter('char-b', 'Bob', { chats: [coldChat('chat-2', 'vanishing-snapshot-unit')] })])))
        h.forageHooks.onGetItem = (key) => {
            if (key.startsWith('database/dbbackup-')) {
                h.forage.delete(snapshotKey(17000000002))
            }
        }

        await run()

        const after = await units()
        expect(after).toContain('surviving-snapshot-unit')
        expect(after).not.toContain('unreferenced-unit')
        expect(errorMessages()).toEqual([])
    })
})

describe('Tauri: a failed read or removal counts as missing only when the file is really gone', () => {
    test('skips a snapshot whose read fails with os error 2 and which no longer exists, and still honours the others', async () => {
        await setup({ platform: 'tauri' })
        await putUnit('surviving-snapshot-unit')
        await putUnit('vanishing-snapshot-unit')
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([fullCharacter('char-a', 'Alice', { chats: [coldChat('chat-1', 'surviving-snapshot-unit')] })])))
        storeSnapshot(17000000002, await encodeTree(makeDb([fullCharacter('char-b', 'Bob', { chats: [coldChat('chat-2', 'vanishing-snapshot-unit')] })])))
        h.fsReadError.set(snapshotKey(17000000002), {
            message: `The system cannot find the file specified. (os error 2)`,
            removeFile: true,
        })

        await run()

        const after = await units()
        expect(after).toContain('surviving-snapshot-unit')
        expect(after).not.toContain('unreferenced-unit')
        expect(errorMessages()).toEqual([])
    })

    test('aborts and deletes nothing when a snapshot read fails with another error, even though the file is reported absent', async () => {
        await setup({ platform: 'tauri' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17000000001, await encodeTree(makeDb([])))
        h.fsReadError.set(snapshotKey(17000000001), { message: 'Access is denied. (os error 5)', removeFile: false })
        h.fsHidden.add(snapshotKey(17000000001))

        await run()

        expect(await units()).toContain('unreferenced-unit')
        expect(errorMessages().length).toBeGreaterThan(0)
    })

    test('counts a removal failure unless it is os error 2 on a file that no longer exists', async () => {
        await setup({ platform: 'tauri' })
        const keys = ['gone', 'denied-absent', 'os2-present', 'generic', 'plain-1', 'plain-2', 'plain-3', 'plain-4']
        keys.forEach(seedUnit)
        setLive(makeDb([]))
        await prime()
        const unitPath = (key: string) => `coldstorage/${key}.json`
        // Already deleted by someone else: os error 2 and absent -> not a failure.
        h.fsRemoveError.set(unitPath('gone'), { message: 'The system cannot find the file specified. (os error 2)', removeFile: true })
        // Another error code is a failure even when exists() reports the file absent.
        h.fsRemoveError.set(unitPath('denied-absent'), { message: 'Access is denied. (os error 5)', removeFile: false })
        h.fsHidden.add(unitPath('denied-absent'))
        // os error 2 while the file is still there is a failure.
        h.fsRemoveError.set(unitPath('os2-present'), { message: 'No such file or directory (os error 2)', removeFile: false })
        // An error with no code is a failure.
        h.fsFail.add(unitPath('generic'))

        await run()

        expect((await units()).sort()).toEqual(['denied-absent', 'generic', 'os2-present'])
        const shown = errorMessages().join('\n')
        expect(shown).toMatch(/\b3\b/)
        expect(shown).not.toMatch(/\b4\b/)
    })
})

describe('unreadable blobs stop the run with a notice that names the character and the source', () => {
    const BLOB_FAILURES = [
        ['is missing', async (_blobKey: string) => {}],
        ['cannot be decoded', async (blobKey: string) => { h.opfs.set(opfsName(blobKey), new Uint8Array([1, 2, 3, 4])) }],
        ['belongs to a different character', async (blobKey: string) => { await putBlob(blobKey, fullCharacter('someone-else', 'Someone Else')) }],
    ] as const

    test.each(BLOB_FAILURES)('aborts naming the character and the snapshot file when a blob referenced only by a snapshot %s', async (_label, breakBlob) => {
        await setup()
        seedUnit('unreferenced-unit')
        await breakBlob('snapshot-only-blob')
        setLive(makeDb([]))
        await prime()
        storeSnapshot(17654321, await encodeTree(makeDb([stubCharacter('zelda-cha', 'Zelda', 'snapshot-only-blob')])))

        await run()

        expect(await units()).toContain('unreferenced-unit')
        const messages = errorMessages()
        expect(messages.some((m) => m.includes('Zelda') && m.includes('dbbackup-17654321.bin'))).toBe(true)
    })

    test.each(BLOB_FAILURES)('aborts naming the character when a blob referenced only by the committed main file %s', async (_label, breakBlob) => {
        await setup()
        seedUnit('unreferenced-unit')
        await breakBlob('main-only-blob')
        setLive(makeDb([]))
        await prime(makeDb([stubCharacter('link-cha', 'Link', 'main-only-blob')]))

        await run()

        expect(await units()).toContain('unreferenced-unit')
        expect(errorMessages().some((m) => m.includes('Link'))).toBe(true)
    })
})

describe('a blob that cannot be read because the page has no storage stops the run like any other unreadable blob', () => {
    test.each([
        ['navigator.storage is removed', undefined],
        ['navigator.storage has no getDirectory', {}],
    ])('guard: aborts naming the character and deletes nothing when %s after the load-time listing was taken', async (_label, storage) => {
        await setup()
        seedUnit('unreferenced-unit')
        await putBlob('main-only-blob', fullCharacter('link-cha', 'Link'))
        setLive(makeDb([]))
        await prime(makeDb([stubCharacter('link-cha', 'Link', 'main-only-blob')]))
        const original = Object.getOwnPropertyDescriptor(navigator, 'storage')
        Object.defineProperty(navigator, 'storage', { configurable: true, value: storage })

        try {
            await run()
        } finally {
            if (original) {
                Object.defineProperty(navigator, 'storage', original)
            }
        }

        expect(await units()).toEqual(expect.arrayContaining(['unreferenced-unit', 'main-only-blob']))
        expect(errorMessages().some((m) => m.includes('Link'))).toBe(true)
        expect(h.opfsLog.removed).toEqual([])
    })
})

describe('the main file must be what this tab last read or committed', () => {
    test.each([
        ['differs in one byte', 'aaaa', 'bbbb'],
        ['differs in length', 'aaaa', 'bbbbbbbb'],
    ])('refuses and deletes nothing when the stored main file %s from this tab\'s record', async (_label, recordedPrompt, storedPrompt) => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([], { mainPrompt: recordedPrompt }))
        const recorded = await encodeTree(makeDb([], { mainPrompt: recordedPrompt }))
        storeMain(await encodeTree(makeDb([], { mainPrompt: storedPrompt })))
        ctx.mainRec.noteMainFileBytes(recorded)
        await ctx.listing.recordLoadTimeListing()

        await run()

        expect(await units()).toContain('unreferenced-unit')
        expect(errorMessages().length).toBeGreaterThan(0)
    })

    test('refuses and deletes nothing when this tab has no record of the main file', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime(undefined, { record: false })

        await run()

        expect(await units()).toContain('unreferenced-unit')
        expect(errorMessages().length).toBeGreaterThan(0)
    })

    test('guard: proceeds when the stored main file equals a separate copy of the recorded bytes', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()

        await run()

        expect(await units()).not.toContain('unreferenced-unit')
        expect(errorMessages()).toEqual([])
    })
})

describe('exclusivity', () => {
    test('refuses and deletes nothing while another tab of this browser is open', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        const otherTab = makeSimulatedTab(core, 'B')
        await otherTab.locks.tabPresenceLockAcquired

        vi.useFakeTimers()
        const running = run()
        await vi.advanceTimersByTimeAsync(15000)
        await running
        vi.useRealTimers()

        expect(await units()).toContain('unreferenced-unit')
        expect(errorMessages().length).toBeGreaterThan(0)
    })

    test('holds the exclusive storage lock, parking this tab\'s saves, until the run ends', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        let saveAcquired = false
        let saveAcquiredAtFirstRemoval: boolean | undefined
        let parkedSave: Promise<void> = Promise.resolve()
        h.opfsHooks.afterEntries = () => {
            h.opfsHooks.afterEntries = undefined
            parkedSave = ctx.globalApi.dbWriteLock.acquire().then((release) => {
                saveAcquired = true
                release()
            })
        }
        h.opfsHooks.onRemove = () => {
            saveAcquiredAtFirstRemoval ??= saveAcquired
        }

        await run()
        await parkedSave

        expect(saveAcquiredAtFirstRemoval).toBe(false)
        expect(saveAcquired).toBe(true)
    })

    test('guard: releases the write lock and the tab presence after a run that aborts', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime(makeDb([stubCharacter('lost-cha', 'Lost', 'missing-blob')]))

        await run()

        const settle = <T>(promise: Promise<T>) => Promise.race([
            promise.then(() => 'released'),
            new Promise<string>((resolve) => setTimeout(() => resolve('still held'), 300)),
        ])
        expect(await settle(ctx.globalApi.dbWriteLock.acquire())).toBe('released')
        expect(await settle(makeSimulatedTab(core, 'C').locks.tabPresenceLockAcquired)).toBe('released')
    })

    test('asks an extra confirmation without Web Locks and deletes nothing when it is declined', async () => {
        await setup({ locks: 'none' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        h.hub.confirmAnswer = false

        await run()

        expect(vi.mocked(ctx.alert.alertConfirm)).toHaveBeenCalled()
        expect(await units()).toContain('unreferenced-unit')
    })

    test('asks an extra confirmation without Web Locks and proceeds when it is accepted', async () => {
        await setup({ locks: 'none' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()

        await run()

        expect(vi.mocked(ctx.alert.alertConfirm)).toHaveBeenCalled()
        expect(await units()).not.toContain('unreferenced-unit')
    })

    test('asks a confirmation on a Node server and deletes nothing when it is declined', async () => {
        await setup({ platform: 'node' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        h.hub.confirmAnswer = false

        await run()

        expect(vi.mocked(ctx.alert.alertConfirm)).toHaveBeenCalled()
        expect(await units()).toContain('unreferenced-unit')
    })

    test('guard: on Tauri another open tab does not stop the run', async () => {
        await setup({ platform: 'tauri' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        const otherTab = makeSimulatedTab(core, 'B')
        await otherTab.locks.tabPresenceLockAcquired

        await run()

        expect(await units()).not.toContain('unreferenced-unit')
    })
})

describe('busy: the run refuses while anything else is working', () => {
    test.each([
        ['work is in progress', () => { ctx.chatOrigin.registerWork({ chaId: 'busy-cha', chatId: 'busy-chat' }) }],
        ['the composer window is open', () => { ctx.generation.setComposerWindow(true) }],
        ['saving has been stopped', () => { ctx.stores.savingStoppedReason.set('stay') }],
    ])('refuses and deletes nothing while %s', async (_label, makeBusy) => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        makeBusy()

        await run()

        expect(await units()).toContain('unreferenced-unit')
        expect(errorMessages().length).toBeGreaterThan(0)
    })

    test('deletes nothing when work starts after the run began but before the first deletion', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        h.opfsHooks.afterEntries = () => {
            h.opfsHooks.afterEntries = undefined
            ctx.chatOrigin.registerWork({ chaId: 'busy-cha', chatId: 'busy-chat' })
        }

        await run()

        expect(await units()).toContain('unreferenced-unit')
    })

    test('guard: deletes nothing when a chaId becomes frozen after the run began but before the first deletion', async () => {
        await setup()
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        h.opfsHooks.afterEntries = () => {
            h.opfsHooks.afterEntries = undefined
            ctx.stores.frozenSaveKeysStore.set([{ chaId: 'dup-id', names: ['A', 'B'] }])
        }

        await run()

        expect(await units()).toContain('unreferenced-unit')
    })
})

describe('Node server: bounded batches, reported failures, revisions', () => {
    const NODE_UNIT_COUNT = 500

    function seedManyNodeUnits(count: number): string[] {
        const keys = Array.from({ length: count }, () => crypto.randomUUID())
        for (const key of keys) {
            seedUnit(key)
        }
        return keys
    }

    test('deletes 500 unused units in requests whose file-path header stays under 16384 bytes', async () => {
        await setup({ platform: 'node' })
        seedManyNodeUnits(NODE_UNIT_COUNT)
        setLive(makeDb([]))
        await prime()

        await run()

        const removeRequests = server.requestsTo('/api/remove')
        const longestHeader = Math.max(0, ...removeRequests.map((r) => (r.headers['file-path'] ?? '').length))
        expect(longestHeader).toBeLessThanOrEqual(12288)
        expect(removeRequests.length).toBeGreaterThanOrEqual(2)
        expect(server.keysWithPrefix('coldstorage/')).toEqual([])
    })

    test('deletes unused assets with long keys in requests whose file-path header stays within 12288 bytes', async () => {
        await setup({ platform: 'node' })
        const hex64 = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
        for (let i = 0; i < 300; i++) {
            seedAsset(`${hex64()}.png`)
        }
        setLive(makeDb([]))
        await prime()

        await run()

        const removeRequests = server.requestsTo('/api/remove')
        const longestHeader = Math.max(0, ...removeRequests.map((r) => (r.headers['file-path'] ?? '').length))
        expect(longestHeader).toBeLessThanOrEqual(12288)
        expect(assetKeys()).toEqual([])
        expect(removeRequests.length).toBeGreaterThanOrEqual(2)
    })

    test.each([409, 431, 500])('ends with a notice counting the units when the server answers %i to a delete', async (status) => {
        await setup({ platform: 'node' })
        seedManyNodeUnits(7)
        setLive(makeDb([]))
        await prime()
        server.removeOverride = () => new Response(JSON.stringify({ success: false, error: 'rejected' }), { status })

        await run()

        expect(server.keysWithPrefix('coldstorage/').length).toBe(7)
        expect(errorMessages().some((m) => /\b7\b/.test(m))).toBe(true)
        expect(vi.mocked(ctx.alert.alertNormal)).not.toHaveBeenCalled()
    })

    test('shows the wait indicator during every delete request even when a toast was raised in between', async () => {
        await setup({ platform: 'node' })
        seedManyNodeUnits(250)
        setLive(makeDb([]))
        await prime()
        const seenDuringDelete: string[] = []
        server.beforeRequest = (path) => {
            if (path === '/api/remove') {
                seenDuringDelete.push(h.hub.current.type)
            }
        }
        server.afterRequest = () => {
            h.hub.set({ type: 'toast', msg: 'Failed to save data, retrying' })
        }

        await run()

        expect(new Set(seenDuringDelete)).toEqual(new Set(['wait']))
        expect(seenDuringDelete.length).toBeGreaterThanOrEqual(2)
    })

    test('guard: the next main-file save after a run that read the main file still carries the earlier revision, so a peer save is a conflict', async () => {
        await setup({ platform: 'node' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        const committed = await prime()
        expect(server.revisionOf('database/database.bin')).toBe(1)
        server.peerWrite('database/database.bin', committed)

        await run()

        expect(await units()).not.toContain('unreferenced-unit')
        const next = await encodeTree(makeDb([], { mainPrompt: 'edited after the clean-up' }))
        await expect(ctx.globalApi.forageStorage.setItem('database/database.bin', next)).rejects.toBeInstanceOf(ctx.nodeMod.NodeStorageConflictError)
        const lastWrite = server.requestsTo('/api/write').at(-1)
        expect(lastWrite?.headers['if-match-revision']).toBe('1')
    })

    test('guard: the next main-file save after a refused run still carries the earlier revision, so a peer save is a conflict', async () => {
        await setup({ platform: 'node' })
        seedUnit('unreferenced-unit')
        setLive(makeDb([]))
        await prime()
        server.peerWrite('database/database.bin', await encodeTree(makeDb([], { mainPrompt: 'saved by another device' })))

        await run()

        const next = await encodeTree(makeDb([], { mainPrompt: 'edited after the clean-up' }))
        await expect(ctx.globalApi.forageStorage.setItem('database/database.bin', next)).rejects.toBeInstanceOf(ctx.nodeMod.NodeStorageConflictError)
        expect(server.requestsTo('/api/write').at(-1)?.headers['if-match-revision']).toBe('1')
    })
})

describe('failed deletes and the completion notice on the other backends', () => {
    test('ends with a notice counting the units that could not be removed from OPFS', async () => {
        await setup()
        const keys = ['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7']
        keys.forEach(seedUnit)
        setLive(makeDb([]))
        await prime()
        for (const key of ['unit-2', 'unit-4', 'unit-6']) {
            h.opfsFail.add(opfsName(key))
        }

        await run()

        expect((await units()).sort()).toEqual(['unit-2', 'unit-4', 'unit-6'])
        expect(errorMessages().some((m) => /\b3\b/.test(m))).toBe(true)
        expect(vi.mocked(ctx.alert.alertNormal)).not.toHaveBeenCalled()
    })

    test('ends with a notice counting the units that could not be removed on Tauri', async () => {
        await setup({ platform: 'tauri' })
        for (const key of ['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6']) {
            seedUnit(key)
        }
        setLive(makeDb([]))
        await prime()
        h.fsFail.add('coldstorage/unit-2.json')
        h.fsFail.add('coldstorage/unit-5.json')

        await run()

        expect((await units()).sort()).toEqual(['unit-2', 'unit-5'])
        expect(errorMessages().some((m) => /\b2\b/.test(m))).toBe(true)
        expect(vi.mocked(ctx.alert.alertNormal)).not.toHaveBeenCalled()
    })

    test('ends with a completion notice and no error when everything was deleted', async () => {
        await setup()
        ;['unit-1', 'unit-2', 'unit-3'].forEach(seedUnit)
        setLive(makeDb([]))
        await prime()

        await run()

        expect(await units()).toEqual([])
        expect(errorMessages()).toEqual([])
        expect(shownNotices().length).toBeGreaterThan(0)
        expect(h.hub.current.type).not.toBe('wait')
    })

    test('guard: shows the wait indicator during every OPFS removal even when a toast was raised in between', async () => {
        await setup()
        ;['unit-1', 'unit-2', 'unit-3'].forEach(seedUnit)
        setLive(makeDb([]))
        await prime()
        const seenDuringDelete: string[] = []
        h.opfsHooks.onRemove = () => {
            seenDuringDelete.push(h.hub.current.type)
        }
        h.opfsHooks.afterRemove = () => {
            h.hub.set({ type: 'toast', msg: 'Failed to save data, retrying' })
        }

        await run()

        expect(seenDuringDelete).toEqual(['wait', 'wait', 'wait'])
    })
})

describe('a run that stops partway', () => {
    test.each([
        ['work starts', () => { ctx.chatOrigin.registerWork({ chaId: 'busy-cha', chatId: 'busy-chat' }) }],
        ['saving is stopped', () => { ctx.stores.savingStoppedReason.set('stay') }],
        ['a chaId becomes frozen', () => { ctx.stores.frozenSaveKeysStore.set([{ chaId: 'dup-id', names: ['A', 'B'] }]) }],
    ])('states how many items were deleted, and not that nothing was, when %s after the first deletions', async (_label, interrupt) => {
        await setup()
        const total = 250
        for (let i = 0; i < total; i++) {
            seedUnit(`unit-${i}`)
        }
        setLive(makeDb([]))
        await prime()
        let removed = 0
        h.opfsHooks.afterRemove = () => {
            removed++
            if (removed === 100) {
                interrupt()
            }
        }

        await run()

        const deleted = total - (await units()).length
        expect(deleted).toBeGreaterThan(0)
        expect(deleted).toBeLessThan(total)
        const shown = errorMessages().join('\n')
        expect(shown).toMatch(new RegExp(`\\b${deleted}\\b`))
        expect(shown).not.toMatch(/not started|was skipped|nothing was deleted/i)
        expect(vi.mocked(ctx.alert.alertNormal)).not.toHaveBeenCalled()
    })
})

describe('assets', () => {
    test('deletes an unreferenced asset present at load and keeps every asset a live source references', async () => {
        await setup()
        seedAsset('orphan.png')
        for (const name of ['character.png', 'emotion.png', 'extra.png', 'background.png', 'user-icon.png', 'module-asset.png', 'module-icon.png', 'persona-icon.png']) {
            seedAsset(name)
        }
        h.forage.set('remotes/some-remote.bin', new Uint8Array([7]))
        setLive(makeDb([
            fullCharacter('asset-cha', 'Assets', {
                image: 'assets/character.png',
                emotionImages: [['happy', 'assets/emotion.png']],
                additionalAssets: [['bg', 'assets/extra.png', '']],
            }),
        ], {
            customBackground: 'assets/background.png',
            userIcon: 'assets/user-icon.png',
            modules: [{ id: 'm1', name: 'Module', assets: [['a', 'assets/module-asset.png', '']], icon: 'assets/module-icon.png' }],
            personas: [{ name: 'Persona', icon: 'assets/persona-icon.png' }],
        }))
        await prime()

        await run()

        expect(assetKeys()).toEqual(expect.arrayContaining([
            'assets/character.png', 'assets/emotion.png', 'assets/extra.png', 'assets/background.png',
            'assets/user-icon.png', 'assets/module-asset.png', 'assets/module-icon.png', 'assets/persona-icon.png',
        ]))
        expect(assetKeys()).not.toContain('assets/orphan.png')
        expect(h.forage.has('database/database.bin')).toBe(true)
        expect(h.forage.has('remotes/some-remote.bin')).toBe(true)
    })

    test('keeps an asset referenced only inside a blob', async () => {
        await setup()
        seedAsset('orphan.png')
        seedAsset('blob-only.png')
        await putBlob('asset-blob', fullCharacter('blobby-cha', 'Blobby', { additionalAssets: [['bg', 'assets/blob-only.png', '']] }))
        setLive(makeDb([stubCharacter('blobby-cha', 'Blobby', 'asset-blob')]))
        await prime()

        await run()

        expect(assetKeys()).not.toContain('assets/orphan.png')
        expect(assetKeys()).toContain('assets/blob-only.png')
    })

    test('keeps an asset referenced only by a full character in the committed main file', async () => {
        await setup()
        seedAsset('orphan.png')
        seedAsset('committed-avatar.png')
        seedAsset('live-avatar.png')
        setLive(makeDb([fullCharacter('avatar-cha', 'Avatar', { image: 'assets/live-avatar.png' })]))
        await prime(makeDb([fullCharacter('avatar-cha', 'Avatar', { image: 'assets/committed-avatar.png' })]))

        await run()

        expect(assetKeys()).not.toContain('assets/orphan.png')
        expect(assetKeys()).toContain('assets/committed-avatar.png')
        expect(assetKeys()).toContain('assets/live-avatar.png')
    })

    test('keeps an asset written after the load-time listing', async () => {
        await setup()
        seedAsset('present-at-load.png')
        setLive(makeDb([]))
        await prime()
        seedAsset('written-after-load.png')

        await run()

        expect(assetKeys()).not.toContain('assets/present-at-load.png')
        expect(assetKeys()).toContain('assets/written-after-load.png')
    })

    test('keeps an asset that a loaded character starts referencing after the keep-set was computed and before its deletion', async () => {
        await setup()
        for (let i = 0; i < 250; i++) {
            seedAsset(`filler-${String(i).padStart(3, '0')}.png`)
        }
        seedAsset('late-reference.png')
        setLive(makeDb([fullCharacter('late-cha', 'Late')]))
        await prime()
        h.forageHooks.onRemove = (key) => {
            if (key.startsWith('assets/')) {
                h.forageHooks.onRemove = undefined
                ctx.stores.DBState.db.characters[0].image = 'assets/late-reference.png'
            }
        }

        await run()

        expect(assetKeys()).not.toContain('assets/filler-000.png')
        expect(assetKeys()).toContain('assets/late-reference.png')
    })

    test('guard: deletes no asset when no load-time listing was recorded', async () => {
        await setup()
        seedAsset('present-at-load.png')
        setLive(makeDb([]))
        await prime(undefined, { listing: false })

        await run()

        expect(assetKeys()).toContain('assets/present-at-load.png')
    })
})
