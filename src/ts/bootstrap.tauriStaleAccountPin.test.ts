/**
 * I6 (Agents/Reports/28-risuaccount-removal-plan.md): a Tauri boot never
 * reads or removes `accountst`, `dosync` or `fallbackRisuToken` -- a pin,
 * expected to PASS already, since the code that reads and removes those keys
 * (`AutoStorage.Init()`'s detection, and `loadData()`'s own non-Tauri-branch
 * cleanup in `src/ts/bootstrap.ts`) is never reached from the Tauri branch of
 * `loadData()` at all.
 *
 * Split out from `bootstrap.staleAccountProfile.svelte.test.ts` (which covers
 * every non-Tauri scenario) because `bootstrap.ts` reads `isTauri` once, at
 * its own module top level, to build `appWindow` (`isTauri ?
 * getCurrentWebviewWindow() : null`). Exercising the Tauri branch needs a
 * module instance imported with `isTauri` already `true` at that moment.
 * This file keeps a single, fixed `isTauri: true` from the start, with no
 * `vi.resetModules()`, and exactly one test.
 *
 * Mocked/real split mirrors the sibling file's: `risuSave.ts` and
 * `process/chatIds.ts` are real; everything else `bootstrap.ts` imports is
 * mocked, including the Tauri-specific `@tauri-apps/plugin-fs` calls this
 * branch makes that the sibling file's mock never exercises
 * (`exists`/`mkdir`/`writeFile`/`readFile`) and `@tauri-apps/api/path`'s
 * `appDataDir`/`join` plus a `fetch` stub for the one URL this branch reads
 * the database through (`convertFileSrc` is a pass-through mock here, so the
 * "asset URL" IS the joined file path).
 */
import { test, expect, vi } from 'vitest'
import { writable, get } from 'svelte/store'

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => { }),
            removeItem: vi.fn(async () => { }),
            keys: vi.fn(async () => []),
        }),
    },
}))

vi.mock(import('src/ts/platform'), () => ({
    isTauri: true,
    isNodeServer: false,
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
    markAppInitiatedReload: vi.fn(),
    isAppInitiatedReload: vi.fn(() => false),
}) as unknown as typeof import('src/ts/reloadGuard'))

const dbState = { current: {} as Record<string, unknown> }

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => dbState.current),
    setDatabase: vi.fn((data: Record<string, unknown>) => { dbState.current = data }),
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
    loadPlugins: vi.fn(async () => { }),
}) as unknown as typeof import('src/ts/plugins/plugins.svelte'))

vi.mock(import('src/ts/drive/drive'), () => ({
    checkDriverInit: vi.fn(async () => false),
}) as unknown as typeof import('src/ts/drive/drive'))

vi.mock(import('src/ts/characterCards'), () => ({
    characterURLImport: vi.fn(),
    handlePendingRealmLink: vi.fn(async () => { }),
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
    moduleUpdate: vi.fn(async () => { }),
}) as unknown as typeof import('src/ts/process/modules'))

vi.mock(import('src/ts/process/coldstorage.svelte'), () => ({
    makeColdData: vi.fn(async () => { }),
}) as unknown as typeof import('src/ts/process/coldstorage.svelte'))

vi.mock(import('src/ts/storage/assetIntegrity'), () => ({
    verifyAssetCacheEntry: vi.fn(async () => ({ status: 'ok' as const, expectedHash: '', actualHash: '' })),
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
        staleAccountProfile: false,
        Init: vi.fn(async () => { }),
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => { }),
        keys: vi.fn(async (): Promise<string[]> => []),
        removeItem: vi.fn(async () => { }),
    },
    saveDb: vi.fn(async () => { }),
    getDbBackups: vi.fn(async (): Promise<number[]> => []),
    buildAssetKeepSet: vi.fn(async () => ({ uncleanable: new Set<string>(), complete: true })),
    getBasename: (p: string) => p.split('/').pop(),
    setUsingSw: vi.fn(),
    checkCharOrder: vi.fn(),
    getUncleanables: vi.fn(async () => []),
    getUncleanablesSync: vi.fn((): string[] => []),
    AppendableBuffer: class {
        chunks: Uint8Array[] = []
        append(chunk: Uint8Array) { this.chunks.push(chunk) }
        get buffer() { return new Uint8Array() }
    },
    requiresFullEncoderReload: { state: false },
    fetchNative: vi.fn(async () => new Response(null, { status: 404 })),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

const { encodeRisuSaveLegacy } = await import('src/ts/storage/risuSave')
const { loadData } = await import('src/ts/bootstrap')
const { loadedStore } = await import('src/ts/stores.svelte') as unknown as {
    loadedStore: ReturnType<typeof writable<boolean>>
}

test('a Tauri boot never reads or removes accountst, dosync or fallbackRisuToken', async () => {
    localStorage.clear()
    localStorage.setItem('accountst', 'able')
    localStorage.setItem('dosync', 'sync')
    localStorage.setItem('fallbackRisuToken', JSON.stringify({ token: 'x' }))
    fsStore.set('', new Uint8Array()) // exists('', ...) -> true, skips the mkdir branches
    fsStore.set('database', new Uint8Array())
    fsStore.set('assets', new Uint8Array())
    const dbBytes = encodeRisuSaveLegacy({
        formatversion: 999,
        characters: [],
        modules: [],
        personas: [],
        characterOrder: [],
        mainPrompt: 'tauri-fixture',
        loreBookToken: 8000,
    })
    fsStore.set('database/database.bin', dbBytes)
    // loadData()'s Tauri branch fetches the db through convertFileSrc's
    // (pass-through, mocked) URL rather than through readFile.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url === '/appdata/database/database.bin') {
            return new Response(dbBytes)
        }
        return new Response(null, { status: 404 })
    }))
    vi.stubGlobal('open', vi.fn())

    loadedStore.set(false)

    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

    await loadData()

    // The title's "never reads" half: none of the three keys is ever read,
    // not just left unremoved.
    const readKeys = getItemSpy.mock.calls.map((call) => call[0])
    expect(readKeys).not.toContain('accountst')
    expect(readKeys).not.toContain('dosync')
    expect(readKeys).not.toContain('fallbackRisuToken')
    getItemSpy.mockRestore()

    expect(localStorage.getItem('accountst')).toBe('able')
    expect(localStorage.getItem('dosync')).toBe('sync')
    expect(localStorage.getItem('fallbackRisuToken')).not.toBeNull()
    expect(get(loadedStore)).toBe(true)
})
