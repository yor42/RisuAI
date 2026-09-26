/**
 * I6, I16 and I17 (Agents/Reports/28-risuaccount-removal-plan.md).
 * Drives the REAL `loadData()` from `src/ts/bootstrap.ts`, non-Tauri branch.
 * The lone Tauri-branch scenario lives in
 * `bootstrap.tauriStaleAccountPin.test.ts` (see that file's header for why it
 * is separate).
 *
 * `risuSave.ts` (`decodeRisuSave`, `encodeRisuSaveLegacy`, `RisuSaveEncoder`)
 * and `process/chatIds.ts` are real, since the corrupt-database-fallback
 * scenario needs genuine encode/decode and boot's own `assignIds()`
 * delegates to the latter. `alert.ts` is real too (a thin wrapper), so this
 * file can inspect the shared `alertStore` (from the mocked `stores.svelte`
 * below) as the observable effect of `alertToast`/`alertConfirm`/etc.,
 * instead of spying on the functions themselves.
 *
 * Everything else `bootstrap.ts` imports is mocked: `globalApi.svelte` (far
 * too heavy to load for real; `forageStorage` becomes a fully controllable
 * stand-in, not `AutoStorage` -- `storage/autoStorage.staleAccount.test.ts`
 * covers `Init()`'s real detection logic), `storage/database.svelte`,
 * `platform`, `util`, `reloadGuard`, `update`, `stores.svelte`,
 * `plugins/plugins.svelte`, `drive/drive`, `characterCards`, `gui/*`,
 * `observer.svelte`, `characters`, `hotkey`, `process/modules`,
 * `process/coldstorage.svelte`, `storage/assetIntegrity`,
 * `storage/remoteSaveCleanup`, `storage/assetSweep`, `media/avatarThumb`,
 * `model/modellist`, and every `@tauri-apps/*` package `bootstrap.ts`
 * touches.
 *
 * `bootstrap.ts` reads `isTauri` once, at its own module top level, to build
 * `appWindow`, and `loadData()` no-ops once `loadedStore` is already `true` --
 * so every test here uses `vi.resetModules()` and a fresh dynamic
 * `import('./bootstrap')`, giving each test its own `appWindow` (built with
 * `platformState.isTauri` already false) and its own fresh `loadedStore`.
 * `setDatabase`/`getDatabase` are HOISTED spies (`setDatabaseMock`,
 * `getDatabaseMock`) referenced directly by the `database.svelte` mock
 * factory, not recreated per factory invocation, so every dynamically
 * re-imported module instance shares the exact same spy identity: a call
 * from ANY re-imported instance lands on the one spy this file asserts
 * against, regardless of how many times the factory itself reruns.
 *
 * `forageStorage.staleAccountProfile` is set directly on the mock rather than
 * driven through a real `Init()` call -- `storage/autoStorage.staleAccount.test.ts`
 * covers `Init()`'s own detection logic in isolation. `STALE_ACCOUNT_NOTICE_ACK`
 * is imported directly from the real, unmocked `alert.ts`, so this file's ack
 * writes always match whatever value the notice's own OK button would write.
 *
 * The mocked `stores.svelte` module (including its `alertStore`) is created
 * once and survives every `vi.resetModules()` in this file, since only real
 * (unmocked) modules are actually reloaded. A test whose own
 * `alertStaleAccountNotice()` promise is still unresolved when it ends leaves
 * a live subscription on that same shared `alertStore`, which would otherwise
 * react to a *later* test's own writes. The `afterEach` below settles any
 * such leftover subscription with the real acknowledgement value so it
 * unsubscribes before the next test runs.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { writable, get } from 'svelte/store'
import { STALE_ACCOUNT_NOTICE_ACK } from './alert'
import type { AssetVerifyResult } from './storage/assetIntegrity'

//#region hoisted mutable config, shared by every dynamically-imported module instance

const platformState = vi.hoisted(() => ({ isTauri: false, isNodeServer: false }))

const dbState = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
    // Assigned once `baseDb()` is declared below (still well before any test
    // runs, since this is only ever CALLED from inside the mocked
    // setDatabase() below, never at module-evaluation time).
    baseline: () => ({}) as Record<string, unknown>,
}))

const forageState = vi.hoisted(() => ({
    staleAccountProfile: false,
    /** key -> bytes, or a thrower for a corrupt read */
    items: new Map<string, Uint8Array | (() => Uint8Array)>(),
}))

const getDbBackupsMock = vi.hoisted(() => vi.fn(async (): Promise<number[]> => []))
const buildAssetKeepSetMock = vi.hoisted(() => vi.fn(async () => ({ uncleanable: new Set<string>(), complete: true })))
const getUncleanablesSyncMock = vi.hoisted(() => vi.fn((): string[] => []))
const verifyAssetCacheEntryMock = vi.hoisted(() => vi.fn(async (_path: string): Promise<AssetVerifyResult> => ({ status: 'ok' })))
const checkDriverInitMock = vi.hoisted(() => vi.fn(async () => false))
const characterURLImportMock = vi.hoisted(() => vi.fn())
const handlePendingRealmLinkMock = vi.hoisted(() => vi.fn(async () => { }))
const loadPluginsMock = vi.hoisted(() => vi.fn(async () => { }))
const makeColdDataMock = vi.hoisted(() => vi.fn(async () => { }))
const saveDbMock = vi.hoisted(() => vi.fn(async () => { }))
const moduleUpdateMock = vi.hoisted(() => vi.fn(async () => { }))
const markAppInitiatedReloadMock = vi.hoisted(() => vi.fn())
const setDatabaseMock = vi.hoisted(() => vi.fn((_data: Record<string, unknown>): void => { }))
const getDatabaseMock = vi.hoisted(() => vi.fn(() => ({}) as Record<string, unknown>))

//#endregion

//#region module mocks

/** Every instance `localforage.createInstance()` has ever handed back, by the name it was created with -- so a test can assert none of them was ever cleared or dropped, and none was ever named `risuaiAccountCached`. */
const localforageInstances = vi.hoisted(() => [] as Array<{ name: string, clear: () => Promise<void>, dropInstance: () => Promise<void> }>)
const localforageDropInstanceMock = vi.hoisted(() => vi.fn(async () => { }))

vi.mock('localforage', () => ({
    default: {
        createInstance: vi.fn((opts: { name: string }) => {
            const clear = vi.fn(async () => { })
            const dropInstance = vi.fn(async () => { })
            localforageInstances.push({ name: opts?.name, clear, dropInstance })
            return {
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => { }),
                removeItem: vi.fn(async () => { }),
                keys: vi.fn(async () => []),
                clear,
                dropInstance,
            }
        }),
        dropInstance: localforageDropInstanceMock,
    },
}))

vi.mock(import('src/ts/platform'), () => ({
    get isTauri() { return platformState.isTauri },
    get isNodeServer() { return platformState.isNodeServer },
    isIOS: () => false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock(import('src/ts/util'), () => ({
    changeFullscreen: vi.fn(async () => { }),
    checkNullish: (v: unknown) => v === null || v === undefined,
    sleep: vi.fn(async () => { }),
    sleepForever: vi.fn(async () => { }),
    getKeypairStore: vi.fn(async () => null),
    saveKeypairStore: vi.fn(async () => { }),
    base64url: (b: Uint8Array) => Buffer.from(b).toString('base64url'),
    asBuffer: (v: Uint8Array) => Buffer.from(v),
}) as unknown as typeof import('src/ts/util'))

vi.mock(import('src/ts/reloadGuard'), () => ({
    markAppInitiatedReload: markAppInitiatedReloadMock,
    isAppInitiatedReload: vi.fn(() => false),
}) as unknown as typeof import('src/ts/reloadGuard'))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: getDatabaseMock,
    // Merges onto a fixture-shaped base rather than replacing outright: the
    // real setDatabase() fills in missing fields the same way (`checkNullish`
    // defaults), and `loadData()`'s own nullish-storage branch installs a
    // bare `encodeRisuSaveLegacy({})` -- an empty object -- which would
    // otherwise make checkNewFormat() (bootstrap.ts's own function, real and
    // unmocked here) throw on `db.characters.map(...)` before ever reaching
    // this file's own assertions.
    setDatabase: setDatabaseMock,
    defaultSdDataFunc: vi.fn(() => ({})),
    presetTemplate: { name: 'test-preset' },
}) as unknown as typeof import('src/ts/storage/database.svelte'))

vi.mock(import('src/ts/update'), () => ({
    checkRisuUpdate: vi.fn(async () => { }),
}) as unknown as typeof import('src/ts/update'))

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: { db: {} },
    LoadingStatusState: { text: '' },
    MobileGUI: writable(false),
    botMakerMode: writable(false),
    selectedCharID: writable(-1),
    loadedStore: writable(false),
    alertStore: writable({ type: 'none', msg: 'n' }),
}) as unknown as typeof import('src/ts/stores.svelte'))

vi.mock(import('src/ts/plugins/plugins.svelte'), () => ({
    loadPlugins: loadPluginsMock,
}) as unknown as typeof import('src/ts/plugins/plugins.svelte'))

vi.mock(import('src/ts/drive/drive'), () => ({
    checkDriverInit: checkDriverInitMock,
}) as unknown as typeof import('src/ts/drive/drive'))

vi.mock(import('src/ts/characterCards'), () => ({
    characterURLImport: characterURLImportMock,
    handlePendingRealmLink: handlePendingRealmLinkMock,
    hubURL: 'https://realm.risuai.net',
}) as unknown as typeof import('src/ts/characterCards'))

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
    moduleUpdate: moduleUpdateMock,
}) as unknown as typeof import('src/ts/process/modules'))

vi.mock(import('src/ts/process/coldstorage.svelte'), () => ({
    makeColdData: makeColdDataMock,
}) as unknown as typeof import('src/ts/process/coldstorage.svelte'))

vi.mock(import('src/ts/storage/assetIntegrity'), () => ({
    verifyAssetCacheEntry: verifyAssetCacheEntryMock,
}) as unknown as typeof import('src/ts/storage/assetIntegrity'))

vi.mock(import('src/ts/storage/remoteSaveCleanup'), () => ({
    getRemoteSaveCleanupAction: vi.fn(() => 'create-meta'),
    getRemoteSavePayloadName: vi.fn(() => null),
}) as unknown as typeof import('src/ts/storage/remoteSaveCleanup'))

vi.mock(import('src/ts/storage/assetSweep'), () => ({
    sweepTauriAssets: vi.fn(async () => { }),
    sweepForageAssetKey: vi.fn(async () => { }),
}) as unknown as typeof import('src/ts/storage/assetSweep'))

vi.mock(import('src/ts/media/avatarThumb'), () => ({
    startAvatarThumbSweep: vi.fn(async () => { }),
}) as unknown as typeof import('src/ts/media/avatarThumb'))

vi.mock(import('src/ts/model/modellist'), () => ({
    registerModelDynamic: vi.fn(),
}) as unknown as typeof import('src/ts/model/modellist'))

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: vi.fn((p: string) => p),
}))

vi.mock('@tauri-apps/api/path', () => ({
    appDataDir: vi.fn(async () => '/appdata'),
    join: vi.fn(async (...p: string[]) => p.join('/')),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: vi.fn(() => ({
        maximize: vi.fn(async () => { }),
    })),
}))

const fsStore = new Map<string, Uint8Array>()

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppData: 0 },
    exists: vi.fn(async (path: string) => fsStore.has(path)),
    mkdir: vi.fn(async () => { }),
    readFile: vi.fn(async (path: string) => {
        if (!fsStore.has(path)) {
            throw new Error(`ENOENT (mock): ${path}`)
        }
        return fsStore.get(path)!
    }),
    writeFile: vi.fn(async (path: string, data: Uint8Array) => { fsStore.set(path, data) }),
    readDir: vi.fn(async () => []),
    remove: vi.fn(async (path: string) => { fsStore.delete(path) }),
}))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    forageStorage: {
        get staleAccountProfile() { return forageState.staleAccountProfile },
        set staleAccountProfile(v: boolean) { forageState.staleAccountProfile = v },
        Init: vi.fn(async () => { }),
        getItem: vi.fn(async (key: string) => {
            const entry = forageState.items.get(key)
            if (entry === undefined) {
                return null
            }
            return typeof entry === 'function' ? entry() : entry
        }),
        setItem: vi.fn(async () => { }),
        keys: vi.fn(async (): Promise<string[]> => []),
        removeItem: vi.fn(async () => { }),
    },
    saveDb: saveDbMock,
    getDbBackups: getDbBackupsMock,
    buildAssetKeepSet: buildAssetKeepSetMock,
    getBasename: (p: string) => p.split('/').pop(),
    setUsingSw: vi.fn(),
    checkCharOrder: vi.fn(),
    getUncleanables: vi.fn(async () => []),
    getUncleanablesSync: getUncleanablesSyncMock,
    AppendableBuffer: class {
        chunks: Uint8Array[] = []
        append(chunk: Uint8Array) { this.chunks.push(chunk) }
        get buffer() { return new Uint8Array() }
    },
    requiresFullEncoderReload: { state: false },
    fetchNative: vi.fn(async () => new Response(null, { status: 404 })),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

//#endregion

// Real and stable across every reset below (a pure, dependency-light module
// this file never mocks), so it is safe to bind once, unlike `bootstrap.ts`
// itself.
const { encodeRisuSaveLegacy, RisuSaveEncoder } = await import('src/ts/storage/risuSave')

// Both modules below are mocked, so (like `stores.svelte`'s `alertStore`)
// importing them once here gives the exact same object every dynamically
// re-imported `bootstrap.ts` instance sees for the rest of the file.
const { forageStorage: sharedForageStorage } = await import('src/ts/globalApi.svelte') as unknown as {
    forageStorage: {
        setItem: ReturnType<typeof vi.fn>
        removeItem: ReturnType<typeof vi.fn>
        getItem: ReturnType<typeof vi.fn>
    }
}
const { alertStore: sharedAlertStore } = await import('src/ts/stores.svelte') as unknown as {
    alertStore: ReturnType<typeof writable<{ type: string, msg: string }>>
}

/** No localforage instance is ever cleared or dropped, and none is ever named `risuaiAccountCached`. */
function assertLocalforageUntouched() {
    expect(localforageDropInstanceMock).not.toHaveBeenCalled()
    for (const { name, clear, dropInstance } of localforageInstances) {
        expect(name).not.toBe('risuaiAccountCached')
        expect(clear).not.toHaveBeenCalled()
        expect(dropInstance).not.toHaveBeenCalled()
    }
}

/** Base database fixture: enough fields for `checkNewFormat()` to run without throwing, and no format-migration branch to trigger. */
function baseDb(): Record<string, unknown> {
    return {
        formatversion: 999,
        characters: [],
        modules: [],
        personas: [],
        characterOrder: [],
        mainPrompt: 'fixture-main-prompt',
        loreBookToken: 8000,
        hotkeys: [],
        botPresets: [],
        coldstorage: false,
        checkCorruption: false,
        botSettingAtStart: false,
        betaMobileGUI: false,
        didFirstSetup: false,
        heightMode: 'auto',
    }
}
dbState.baseline = baseDb

function setDatabaseBinBytes(bytes: Uint8Array | (() => Uint8Array)) {
    forageState.items.set('database/database.bin', bytes)
}

function setBackupBytes(id: number, bytes: Uint8Array | (() => Uint8Array)) {
    forageState.items.set(`database/dbbackup-${id}.bin`, bytes)
}

/**
 * Reliably-corrupt bytes for `decodeRisuSave`: a genuine `RisuSaveEncoder`
 * buffer (the format `saveDb()` actually writes) whose format-version byte
 * (right after the 8-byte "RISUSAVE" prefix) is set to an unrecognized value,
 * which `decodeRisuSave` explicitly rejects outright -- proven in
 * `src/ts/storage/tests/risuSave.test.ts`. A short arbitrary byte array is
 * NOT reliable here: `decodeRisuSave`'s own fallback chain can decode
 * unrelated garbage as some unrelated value without ever throwing, silently
 * short-circuiting this file's whole backup-fallback scenario before it ever
 * reaches the loop under test.
 */
async function corruptDbBytes(): Promise<Uint8Array> {
    const encoder = new RisuSaveEncoder()
    await encoder.init(baseDb() as unknown as Parameters<InstanceType<typeof RisuSaveEncoder>['init']>[0], { compression: false })
    const encoded = new Uint8Array(encoder.encode()!)
    encoded[8] = 2 // neither a recognized v1 (0) nor v2 (1) format-version byte
    return encoded
}

/** Imports a fresh `loadData` and the matching `stores.svelte` pair, after `vi.resetModules()`. */
async function freshLoadData() {
    const { loadData } = await import('src/ts/bootstrap')
    const { alertStore, loadedStore } = await import('src/ts/stores.svelte') as unknown as {
        alertStore: ReturnType<typeof writable<{ type: string, msg: string }>>
        loadedStore: ReturnType<typeof writable<boolean>>
    }
    // Force-reset rather than trust the dynamic re-import alone: this file's
    // heavy real (unmocked) module graph has been observed, empirically, to
    // sometimes hand back an ALREADY-true loadedStore from an earlier test
    // even right after `vi.resetModules()` -- loadData() itself no-ops
    // entirely once loadedStore is true, which would silently turn every
    // later assertion in this file into a false pass or a misleading
    // failure. Explicit here rather than relying on the reset alone.
    loadedStore.set(false)
    alertStore.set({ type: 'none', msg: 'n' })
    return { loadData, alertStore, loadedStore }
}

beforeEach(() => {
    localStorage.clear()
    fsStore.clear()
    forageState.staleAccountProfile = false
    forageState.items.clear()
    sharedForageStorage.setItem.mockClear()
    sharedForageStorage.removeItem.mockClear()
    sharedForageStorage.getItem.mockClear()
    localforageInstances.length = 0
    localforageDropInstanceMock.mockClear()
    dbState.current = baseDb()
    platformState.isTauri = false
    platformState.isNodeServer = false
    getDbBackupsMock.mockReset().mockResolvedValue([])
    buildAssetKeepSetMock.mockReset().mockResolvedValue({ uncleanable: new Set(), complete: true })
    getUncleanablesSyncMock.mockReset().mockReturnValue([])
    verifyAssetCacheEntryMock.mockReset().mockResolvedValue({ status: 'ok' })
    checkDriverInitMock.mockReset().mockResolvedValue(false)
    characterURLImportMock.mockReset()
    loadPluginsMock.mockReset().mockResolvedValue(undefined)
    makeColdDataMock.mockReset().mockResolvedValue(undefined)
    saveDbMock.mockReset().mockResolvedValue(undefined)
    moduleUpdateMock.mockReset().mockResolvedValue(undefined)
    markAppInitiatedReloadMock.mockReset()
    setDatabaseMock.mockClear()
    setDatabaseMock.mockImplementation((data: Record<string, unknown>) => { dbState.current = { ...dbState.baseline(), ...data } })
    getDatabaseMock.mockClear()
    getDatabaseMock.mockImplementation(() => dbState.current)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    vi.stubGlobal('open', vi.fn())
    vi.spyOn(window.location, 'reload').mockImplementation(() => { })
    vi.resetModules()
})

afterEach(() => {
    // Settle any notice this test posted but never acknowledged: its
    // subscription is still live on the shared, mock-persisted `alertStore`
    // (see the header) and would otherwise react to a later test's writes.
    sharedAlertStore.set({ type: 'none', msg: STALE_ACCOUNT_NOTICE_ACK })
})

/** Configures `forageState` so `loadData()`'s non-Tauri database read reaches the named install branch, with `db` as the eventually-installed database. */
async function armInstallBranch(branch: 'decode' | 'nullish' | 'backup-fallback', db: Record<string, unknown>) {
    if (branch === 'decode') {
        setDatabaseBinBytes(encodeRisuSaveLegacy(db))
    } else if (branch === 'nullish') {
        // forageState.items has no entry for the key at all -> getItem resolves null -> checkNullish branch.
    } else {
        setDatabaseBinBytes(await corruptDbBytes())
        getDbBackupsMock.mockResolvedValue([100])
        setBackupBytes(100, encodeRisuSaveLegacy(db))
    }
}

describe('loadData(): a stale account-sync profile does not boot silently (I6)', () => {
    const branches: Array<'decode' | 'nullish' | 'backup-fallback'> = ['decode', 'nullish', 'backup-fallback']

    for (const branch of branches) {
        test(`install branch "${branch}": boot stops at the notice, and the account-sync keys stay while it is up`, async () => {
            localStorage.setItem('accountst', 'able')
            localStorage.setItem('dosync', 'sync')
            localStorage.setItem('fallbackRisuToken', JSON.stringify({ token: 'stale' }))
            forageState.staleAccountProfile = true
            await armInstallBranch(branch, baseDb())

            const { loadData, alertStore, loadedStore } = await freshLoadData()
            const seenAlertTypes: string[] = []
            const unsubscribe = alertStore.subscribe((v) => seenAlertTypes.push(v.type))

            await loadData()
            unsubscribe()

            // I6 requires boot to post this type and stop before
            // checkDriverInit, leaving loadedStore false, until the notice is
            // acknowledged.
            expect(seenAlertTypes).toContain('staleAccountNotice')
            expect(get(loadedStore)).toBe(false)
            expect(checkDriverInitMock).not.toHaveBeenCalled()

            // The keys must survive while the notice is up: removing them
            // early would lose the notice's own record of a stale profile if
            // the app closes before the user ever acknowledges it.
            expect(localStorage.getItem('accountst')).toBe('able')
            expect(localStorage.getItem('dosync')).toBe('sync')
            expect(localStorage.getItem('fallbackRisuToken')).not.toBeNull()

            // Nothing reaches into the storage backend while the notice is
            // pending: no forage removal at all, and (the nullish branch's
            // own pre-install empty-database write aside) no forage write
            // either.
            expect(sharedForageStorage.removeItem).not.toHaveBeenCalled()
            expect(sharedForageStorage.setItem).toHaveBeenCalledTimes(branch === 'nullish' ? 1 : 0)
            assertLocalforageUntouched()
        })
    }

    for (const branch of branches) {
        test(`install branch "${branch}": an error alert, Escape's toast, and Enter's "yes" each re-post the notice instead of resolving it`, async () => {
            localStorage.setItem('accountst', 'able')
            localStorage.setItem('dosync', 'sync')
            localStorage.setItem('fallbackRisuToken', JSON.stringify({ token: 'stale' }))
            forageState.staleAccountProfile = true
            await armInstallBranch(branch, baseDb())

            const { loadData, alertStore, loadedStore } = await freshLoadData()

            await loadData()

            // Simulates a foreign alert, then hotkey.ts's real Escape write
            // (`alertToast('Alert Closed')`) and Enter write
            // (`{type:'none', msg:'yes'}`) verbatim, checking each in turn:
            // only the notice's own OK may resolve it, so every other write
            // must be followed by the notice reappearing.
            alertStore.set({ type: 'error', msg: 'unrelated error' })
            expect(get(alertStore).type).toBe('staleAccountNotice')

            alertStore.set({ type: 'toast', msg: 'Alert Closed' })
            expect(get(alertStore).type).toBe('staleAccountNotice')

            alertStore.set({ type: 'none', msg: 'yes' })
            expect(get(alertStore).type).toBe('staleAccountNotice')

            expect(get(loadedStore)).toBe(false)
        })
    }

    for (const branch of branches) {
        test(`install branch "${branch}": acknowledging the notice removes only the three account-sync keys, reloads, and boot never reaches the steps after the notice`, async () => {
            localStorage.setItem('accountst', 'able')
            localStorage.setItem('dosync', 'sync')
            localStorage.setItem('fallbackRisuToken', JSON.stringify({ token: 'stale' }))
            // Unrelated keys: acknowledgement must leave them alone.
            localStorage.setItem('opfs_flag!', 'able')
            localStorage.setItem('unrelated-key', 'unrelated-value')
            forageState.staleAccountProfile = true
            await armInstallBranch(branch, baseDb())

            const { loadData, alertStore, loadedStore } = await freshLoadData()

            await loadData()

            // While the notice is up, before acknowledgement, the three keys
            // must still be present.
            expect(localStorage.getItem('accountst')).toBe('able')
            expect(localStorage.getItem('dosync')).toBe('sync')
            expect(localStorage.getItem('fallbackRisuToken')).not.toBeNull()

            alertStore.set({ type: 'none', msg: STALE_ACCOUNT_NOTICE_ACK })

            // Acknowledging the notice must remove the three keys and request a
            // reload -- whether that happens inside the same synchronous store
            // write or only after a later microtask (e.g. a `.then()` on the
            // notice's own promise) is not the invariant, so flush first.
            await vi.waitFor(() => {
                expect(localStorage.getItem('accountst')).toBeNull()
            })

            // Every later boot step must be gated behind that acknowledgement --
            // none of them may have run before it, in this page life.
            expect(localStorage.getItem('dosync')).toBeNull()
            expect(localStorage.getItem('fallbackRisuToken')).toBeNull()
            expect(markAppInitiatedReloadMock).toHaveBeenCalled()
            expect(window.location.reload).toHaveBeenCalled()
            expect(checkDriverInitMock).not.toHaveBeenCalled()
            expect(characterURLImportMock).not.toHaveBeenCalled()
            expect(loadPluginsMock).not.toHaveBeenCalled()
            expect(makeColdDataMock).not.toHaveBeenCalled()
            expect(get(loadedStore)).toBe(false)
            expect(saveDbMock).not.toHaveBeenCalled()

            // Only the three account-sync keys go: an unrelated setting and
            // an arbitrary unrelated key both survive the acknowledgement.
            expect(localStorage.getItem('opfs_flag!')).toBe('able')
            expect(localStorage.getItem('unrelated-key')).toBe('unrelated-value')

            // The "never touched" half of the invariant holds through to
            // acknowledgement too, not just while the notice was pending.
            expect(sharedForageStorage.removeItem).not.toHaveBeenCalled()
            expect(sharedForageStorage.setItem).toHaveBeenCalledTimes(branch === 'nullish' ? 1 : 0)
            assertLocalforageUntouched()
        })
    }
})

describe('loadData(): dosync/fallbackRisuToken without accountst are removed silently, with no notice', () => {
    test('dosync=sync and a fallbackRisuToken, no accountst', async () => {
        localStorage.setItem('dosync', 'sync')
        localStorage.setItem('fallbackRisuToken', JSON.stringify({ token: 'leftover' }))
        forageState.staleAccountProfile = false
        await armInstallBranch('decode', baseDb())

        const { loadData, alertStore, loadedStore } = await freshLoadData()
        const seenAlertTypes: string[] = []
        const unsubscribe = alertStore.subscribe((v) => seenAlertTypes.push(v.type))

        await loadData()
        unsubscribe()

        // loadData() must itself remove dosync/fallbackRisuToken silently
        // when accountst is absent, without posting a notice, and continue.
        expect(localStorage.getItem('dosync')).toBeNull()
        expect(localStorage.getItem('fallbackRisuToken')).toBeNull()
        expect(seenAlertTypes).not.toContain('staleAccountNotice')
        expect(get(loadedStore)).toBe(true)
    })
})

describe('loadData(): pin', () => {
    test('a non-Tauri profile with no account-sync flags boots unchanged to loadedStore.set(true), no notice', async () => {
        await armInstallBranch('decode', baseDb())

        const { loadData, alertStore, loadedStore } = await freshLoadData()
        const seenAlertTypes: string[] = []
        const unsubscribe = alertStore.subscribe((v) => seenAlertTypes.push(v.type))

        await loadData()
        unsubscribe()

        expect(seenAlertTypes).not.toContain('staleAccountNotice')
        expect(get(loadedStore)).toBe(true)
    })
})

describe('loadData(): the web corrupt-database fallback installs the newest backup that decodes (I16)', () => {
    test('newest backup corrupt, second-newest and third-newest both decode: the first install is the second-newest, and the third-newest is never installed', async () => {
        setDatabaseBinBytes(await corruptDbBytes())
        getDbBackupsMock.mockResolvedValue([300, 200, 100]) // newest first, matching getDbBackups' real b-a sort
        setBackupBytes(300, await corruptDbBytes())
        const secondNewest = { ...baseDb(), mainPrompt: 'second-newest-content' }
        const thirdNewest = { ...baseDb(), mainPrompt: 'third-newest-content' }
        setBackupBytes(200, encodeRisuSaveLegacy(secondNewest))
        setBackupBytes(100, encodeRisuSaveLegacy(thirdNewest))

        const { loadData } = await freshLoadData()

        await loadData()

        const installedMainPrompts = setDatabaseMock.mock.calls.map(
            (c) => (c[0] as { mainPrompt?: string })?.mainPrompt
        )

        // I16: the fallback must install the newest backup that decodes (200,
        // the second-newest overall, since the newest backup, 300, is
        // corrupt), and never fall back further to an older one -- whatever
        // else re-saves the installed database afterward (checkNewFormat()
        // does, unconditionally), no setDatabase call may ever carry the
        // third-newest backup's content, and the first call's argument must
        // be the second-newest backup's content.
        expect(installedMainPrompts[0]).toBe('second-newest-content')
        expect(installedMainPrompts).not.toContain('third-newest-content')
        expect((dbState.current as { mainPrompt?: string }).mainPrompt).toBe('second-newest-content')
    })
})

describe('cleanChunks(): the checkCorruption integrity sample runs even when cold storage is on (I17)', () => {
    test('a mismatched in-use asset toasts, driven unawaited through loadData()', async () => {
        const db = baseDb()
        db.coldstorage = true
        db.checkCorruption = true
        await armInstallBranch('decode', db)
        getUncleanablesSyncMock.mockReturnValue(['corrupt-asset.png'])
        verifyAssetCacheEntryMock.mockImplementation(async (path: string): Promise<AssetVerifyResult> => {
            if (path === 'assets/corrupt-asset.png') {
                return { status: 'mismatch', expectedHash: 'expected-hash', actualHash: 'actual-hash' }
            }
            return { status: 'ok' }
        })

        const { loadData, alertStore } = await freshLoadData()

        await loadData()
        // cleanChunks() runs unawaited after loadedStore.set(true); flush its
        // own internal await chain (getUncleanablesSync, then
        // verifyAssetCacheEntry, then alertToast) without adding any export
        // to bootstrap.ts.
        await vi.waitFor(() => {
            expect(verifyAssetCacheEntryMock).toHaveBeenCalled()
        }, { timeout: 200, interval: 5 })

        // I17: the integrity sample must run and this toast must fire even
        // with cold storage on, since the sample itself never reads cold
        // storage. A cold-storage-on early return that skips the sample
        // entirely, before ever calling getUncleanablesSync or
        // verifyAssetCacheEntry, would leave a mismatch unsampled and this
        // toast never fired.
        expect(get(alertStore).type).toBe('toast')
        expect(get(alertStore).msg).toContain('corrupt-asset.png')
    })

    for (const coldstorage of [true, false]) {
        test(`checkCorruption off, cold storage ${coldstorage}: the integrity sample does not run`, async () => {
            const db = baseDb()
            db.coldstorage = coldstorage
            db.checkCorruption = false
            await armInstallBranch('decode', db)
            getUncleanablesSyncMock.mockReturnValue(['corrupt-asset.png'])
            verifyAssetCacheEntryMock.mockResolvedValue({ status: 'mismatch', expectedHash: 'expected-hash', actualHash: 'actual-hash' })

            const { loadData } = await freshLoadData()

            await loadData()
            // cleanChunks() runs unawaited; give its own microtask chain a
            // moment to run before asserting that nothing behind the
            // checkCorruption gate ever ran.
            await new Promise((resolve) => setTimeout(resolve, 20))

            // The sample is gated on db.checkCorruption alone: off means
            // neither of the sample's own two calls ever happens, regardless
            // of cold storage.
            expect(getUncleanablesSyncMock).not.toHaveBeenCalled()
            expect(verifyAssetCacheEntryMock).not.toHaveBeenCalled()
        })
    }
})
