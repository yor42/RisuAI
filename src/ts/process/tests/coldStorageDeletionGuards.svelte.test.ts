/**
 * CHORE-07 stage 7a step 2 -- "stop deleting" tests.
 * Agents/Reports/13-chore07-cold-read-failure-plan.md §2, especially §2.2b
 * and §2.4.
 *
 * "RED" in a test name/comment is a HISTORICAL label: it records that, at
 * the time it was written, the test was confirmed FAILING against the
 * then-current (pre-fix) source, for the DATA-LOSS reason stated in its
 * comment (an asset or a cold-storage blob was actually deleted), not
 * because of a mistake in this file's own setup. It is not a live claim
 * about this file's exit code -- every test in this file passes with the
 * stage 7a fix applied; see STATUS below for where the recorded failures
 * are archived. "CHAR" means
 * the test passes both before and after the fix that turned the RED tests
 * GREEN -- a regression pin, not itself evidence that the fix changed
 * anything. a10b is also CHAR, though its own history is against a
 * different, unshipped baseline; see its own comment.
 *
 * STATUS: the stage 7a step 3 fix has landed
 * (`resolveUncleanableChars`/`buildAssetKeepSet` in globalApi.svelte.ts,
 * `collectColdCharacterKeysOrAbort` in coldstorage.svelte.ts). a1-a4, a7,
 * a11 and a11b were confirmed RED against the pre-fix source. The exact
 * failures are recorded in `Agents/Investigation-Ledger.md` row 32 (not
 * this file's git history: this file is committed together with the fix,
 * so that history would never contain a failing run), and copied here
 * briefly, in the style of
 * `src/ts/process/tests/moduleUpdateDeps.svelte.test.ts:20-22`: run against
 * the pre-fix source, exit 1, 7 failed / 4 passed / 1 skipped --
 * `expected false to be true` on `tauriFsHas('assets/emotion-happy.png')`
 * (a1; a2/a3/a4 the same shape, on `forageAssetStore.has(...)` for a2),
 * `expected [] to include 'a7-main-key'` (a7), `expected [
 * 'a11-cold-char-key' ] to include 'a11-chat-key'` (a11), and `expected []
 * to include 'a11b-orphan-key'` (a11b). They are GREEN now -- that
 * red-before-green sequence, not their current source text, is what makes
 * them evidence, matching the convention in
 * `src/ts/process/tests/moduleUpdateDeps.svelte.test.ts`. Their "RED"
 * labels are kept as that historical record, not a claim about today's
 * exit code.
 *
 * a10b is CHAR, not RED: it passes on HEAD. The same ledger row also
 * records its one failing run, against an unshipped round-1 draft of the
 * fix (ledger row 29, REJECTed) that wrapped the account-branch read in a
 * try/catch it shouldn't have: exit 1, 1 failed / 14 passed / 1 skipped --
 * `promise resolved "[ 'main-image.png' ]" instead of rejecting`. See its
 * own comment for detail. a12/a13/a14 are new CHAR coverage for the fix,
 * added by the same post-gate review.
 *
 * This file drives the REAL seams, not a replica:
 *   - `buildAssetKeepSet(db)` and `getUncleanables(db)`, `getBasename` from
 *     `src/ts/globalApi.svelte.ts` (real, unmocked).
 *   - `sweepTauriAssets` / `sweepForageAssetKey` from
 *     `src/ts/storage/assetSweep.ts` (real, unmocked, dependency-free).
 *   - `getColdStorageItem` / `setColdStorageItem` / `preLoadChat` /
 *     `cleanColdStorage` / `listColdStorageItems` /
 *     `collectColdStorageBackupPayloads` from
 *     `src/ts/process/coldstorage.svelte.ts` (real, unmocked).
 * Every other module reachable from those three is mocked below. Only the
 * STORAGE BACKEND underneath `getColdStorageItem` is faked (Tauri
 * `@tauri-apps/plugin-fs`, an OPFS `navigator.storage` stand-in, and a
 * controllable `fetchProtectedResource` mock for the account branch) --
 * `getColdStorageItem` itself is never mocked directly, so a read failure
 * has to go through its own real try/catch-swallows-errors path (or, for
 * the account branch, its real absence of one), exactly as it does in
 * production.
 *
 * Mock sets are reused, one-for-one, from the two harnesses this plan
 * cites: `Agents/Tools/save-gen/asset-gc-cold-read-repro.svelte.harness.ts`
 * (the asset-sweep group, a1/a3/a4/a5/a10/a10b) and
 * `Agents/Tools/save-gen/cold-storage-orphan-repro.svelte.harness.ts` (the
 * cold-storage-cleanup group, a7/a8/a9/a11/a11b/a12/a13/a14). Per
 * Agents/Tools/README.md's "keep every rune-touching mock in ONE file",
 * both harnesses' mocks live together here. `fetchProtectedResourceMock` is
 * new (post-gate review item 1/4): a10b and a14 flip `forageStorage.isAccount`
 * to `true` for one test each and arm a single rejection with
 * `.mockRejectedValueOnce`, then reset `isAccount` back to `false` in a
 * `finally` so no other test observes it.
 *
 * PLATFORM TOGGLE: unlike either harness (each fixes `isTauri` for its
 * whole file), this file needs BOTH the Tauri backend (a1/a3/a4/a5/a10/a10b)
 * and the OPFS backend (a7/a8/a9/a11/a11b/a12/a13/a14) in the same run.
 * `src/ts/platform` is mocked with a GETTER backed by a `vi.hoisted` mutable
 * flag (`platformState.isTauri`), so `getColdStorageItem`'s live `isTauri`
 * read (it re-reads the imported binding on every call, it does not cache
 * it) observes whichever value each test sets before running. Verified in
 * isolation before writing this file: a throwaway two-test scratch file
 * confirmed a consumer module that imports `isTauri` once at its own
 * top-level, then reads it inside a function body, does see a
 * `platformState.isTauri` mutation made after that import -- both tests
 * passed. The scratch file was deleted; this comment is the record of
 * that check. a10b/a14 test the ACCOUNT branch instead, which is checked
 * before the isTauri/isNodeServer/OPFS branches in `getColdStorageItem`, so
 * `platformState.isTauri`'s value is irrelevant for those two.
 *
 * a2's cold read still goes through the Tauri backend (platformState.isTauri
 * stays true) even though it exercises the WEB deletion path
 * (`sweepForageAssetKey`). That is deliberate, not a shortcut: the plan's
 * "same on the web branch" is about which of the two independent deletion
 * FUNCTIONS is under test (`sweepTauriAssets` vs `sweepForageAssetKey`),
 * not about which storage backend produced the incomplete keep-set --
 * neither sweep function's own behaviour depends on that. a7/a8/a9/a11/a11b/
 * a12/a13 DO need the real OPFS backend, because `cleanColdStorage` /
 * `preLoadChat` read `DBState.db` directly (no injected `db` seam exists
 * for them yet), so this file switches `platformState.isTauri` to `false`
 * for that whole group.
 */
import { describe, test, expect, vi } from 'vitest'
import { writable } from 'svelte/store'
import type { Database } from '../../storage/database.svelte'

//#region module mocks -- one-for-one copy of both harnesses' mock sets,
// merged. See file header for why each group is mocked vs. left real.

const platformState = vi.hoisted(() => ({ isTauri: true }))

// A controllable stand-in for fetchProtectedResource, used by a10b/a14 to
// simulate the account branch's fetchProtectedResource/decompress/JSON.parse
// throwing (the account branch of `getColdStorageItem` has no try/catch
// around any of those). Defaults to a 404 (matching both harnesses'
// default), and tests that need a throw use `.mockRejectedValueOnce(...)`,
// which self-consumes after one call and falls back to this default again.
const fetchProtectedResourceMock = vi.hoisted(() => vi.fn(async () => ({ status: 404 }) as unknown as Response))

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
    get isTauri() { return platformState.isTauri },
    isNodeServer: false,
    isIOS: () => false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => {
        throw new Error('no live database in tests')
    }),
    setDatabase: vi.fn(),
    presetTemplate: { name: 'test-preset' },
    defaultSdDataFunc: vi.fn(() => ({})),
    appVer: 'test',
    appSubVer: 'test',
    getCurrentCharacter: vi.fn(),
}) as unknown as typeof import('src/ts/storage/database.svelte'))

// Constructed directly in the factory (no cross-file dynamic import) --
// splitting this across files reproduces the documented "split vi.mock
// factory" trap.
vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
        selIdState: { state: -1 },
        alertStore: writable({ type: 'none', msg: '' }),
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
    } as unknown as typeof import('../../stores.svelte')
})

vi.mock(import('src/ts/alert'), () => ({
    alertClear: vi.fn(),
    alertConfirm: vi.fn(async () => true),
    alertError: vi.fn(),
    alertWait: vi.fn(),
    alertMd: vi.fn(),
    alertNormal: vi.fn(),
    alertSelect: vi.fn(),
    alertTOS: vi.fn(async () => true),
    alertToast: vi.fn(),
    alertInput: vi.fn(),
    alertLogin: vi.fn(),
    alertNormalWait: vi.fn(),
    alertAddCharacter: vi.fn(),
    alertStore: writable({ type: 'none', msg: '' }),
    waitAlert: vi.fn(async () => {}),
}))

// Reachable whenever forageStorage.isAccount is true (a10b/a14 flip it on
// for one test each; every other test leaves it at AutoStorage's mocked
// default of false, so this mock is otherwise never called).
vi.mock(import('src/ts/sionyw'), () => ({
    fetchProtectedResource: fetchProtectedResourceMock,
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
    parseMarkdownSafe: vi.fn((s: string) => s),
}) as unknown as typeof import('src/ts/parser/parser.svelte'))

vi.mock(import('src/ts/characterCards'), () => ({
    characterURLImport: vi.fn(),
    hubURL: 'https://example.invalid',
    importCharacter: vi.fn(),
}) as unknown as typeof import('src/ts/characterCards'))

vi.mock(import('src/ts/drive/accounter'), () => ({
    loadRisuAccountData: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/drive/accounter'))

vi.mock(import('src/ts/storage/dbChangeEffects.svelte'), () => ({
    registerDbChangeEffects: vi.fn(),
}) as unknown as typeof import('src/ts/storage/dbChangeEffects.svelte'))

vi.mock(import('src/ts/storage/autoStorage'), () => ({
    AutoStorage: class {
        isAccount = false
        realStorage: unknown = undefined
    },
}) as unknown as typeof import('src/ts/storage/autoStorage'))

vi.mock(import('src/ts/gui/animation'), () => ({
    updateAnimationSpeed: vi.fn(),
}) as unknown as typeof import('src/ts/gui/animation'))

vi.mock(import('src/ts/gui/colorscheme'), () => ({
    updateColorScheme: vi.fn(),
    updateTextThemeAndCSS: vi.fn(),
}) as unknown as typeof import('src/ts/gui/colorscheme'))

vi.mock(import('src/ts/kei/backup'), () => ({
    autoServerBackup: vi.fn(async () => {}),
    saveDbKei: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/kei/backup'))

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

vi.mock(import('src/ts/storage/accountStorage'), () => ({
    AccountSyncConflictError: class extends Error {},
}) as unknown as typeof import('src/ts/storage/accountStorage'))

//#endregion

//#region Tauri fs backend mock (asset files under assets/, cold blobs under
// coldstorage/<key>.json) -- copied from asset-gc-cold-read-repro.

type FsEntry = { name: string; isDirectory: boolean }

const fsStore = new Map<string, Uint8Array>()
const throwOnceReadPaths = new Set<string>()

function normalizePath(path: string): string {
    return path.replace(/^\.\//, '').replace(/\\/g, '/')
}

function armTransientTauriReadFailure(coldKey: string): void {
    throwOnceReadPaths.add(normalizePath('./coldstorage/' + coldKey + '.json'))
}

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppData: 0 },
    readDir: vi.fn(async (dir: string) => {
        const prefix = normalizePath(dir).replace(/\/$/, '') + '/'
        const names = new Set<string>()
        for (const key of fsStore.keys()) {
            if (key.startsWith(prefix)) {
                const rest = key.slice(prefix.length)
                if (!rest.includes('/')) {
                    names.add(rest)
                }
            }
        }
        const entries: FsEntry[] = Array.from(names).map((name) => ({ name, isDirectory: false }))
        return entries
    }),
    readFile: vi.fn(async (path: string) => {
        const p = normalizePath(path)
        if (throwOnceReadPaths.has(p)) {
            throwOnceReadPaths.delete(p)
            throw new Error(`simulated transient Tauri fs read failure for ${p}`)
        }
        if (!fsStore.has(p)) {
            throw new Error(`ENOENT (mock): ${p}`)
        }
        return fsStore.get(p)!
    }),
    writeFile: vi.fn(async (path: string, data: Uint8Array) => {
        fsStore.set(normalizePath(path), data)
    }),
    remove: vi.fn(async (path: string) => {
        const p = normalizePath(path)
        if (!fsStore.has(p)) {
            throw new Error(`ENOENT (mock, remove): ${p}`)
        }
        fsStore.delete(p)
    }),
    exists: vi.fn(async (path: string) => fsStore.has(normalizePath(path))),
    mkdir: vi.fn(async () => {}),
}))

function seedTauriAssets(): void {
    fsStore.set('assets/main-image.png', new TextEncoder().encode('main-image-bytes'))
    fsStore.set('assets/emotion-happy.png', new TextEncoder().encode('emotion-happy-bytes'))
    fsStore.set('assets/emotion-sad.png', new TextEncoder().encode('emotion-sad-bytes'))
    fsStore.set('assets/additional-bg.png', new TextEncoder().encode('additional-bg-bytes'))
}

function resetTauriFs(): void {
    fsStore.clear()
    throwOnceReadPaths.clear()
    seedTauriAssets()
}

function tauriFsHas(path: string): boolean {
    return fsStore.has(normalizePath(path))
}

//#endregion

//#region OPFS backend mock (navigator.storage) -- copied from
// cold-storage-orphan-repro.

const opfsStore = new Map<string, Uint8Array>()
const throwOnceFilenames = new Set<string>()

function opfsFilename(key: string): string {
    return 'coldstorage_' + key + '.json'
}

function armTransientOpfsFailure(key: string): void {
    throwOnceFilenames.add(opfsFilename(key))
}

class MockNotFoundError extends Error {
    name = 'NotFoundError'
}

const mockDirectoryHandle = {
    async getFileHandle(name: string, opts?: { create?: boolean }) {
        if (throwOnceFilenames.has(name)) {
            throwOnceFilenames.delete(name)
            throw new Error(`simulated transient OPFS read failure for ${name}`)
        }
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
            throw new MockNotFoundError(`not found: ${name}`)
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
    async removeEntry(name: string) {
        if (!opfsStore.has(name)) {
            throw new MockNotFoundError(`not found: ${name}`)
        }
        opfsStore.delete(name)
    },
    entries() {
        const iter = opfsStore.keys()
        return {
            [Symbol.asyncIterator]() {
                return {
                    async next() {
                        const r = iter.next()
                        if (r.done) {
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
    value: {
        getDirectory: async () => mockDirectoryHandle,
    },
})

function resetOpfs(): void {
    opfsStore.clear()
    throwOnceFilenames.clear()
}

//#endregion

import { getUncleanables, buildAssetKeepSet, getBasename, forageStorage } from '../../globalApi.svelte'
import {
    getColdStorageItem,
    setColdStorageItem,
    preLoadChat,
    cleanColdStorage,
    listColdStorageItems,
    collectColdStorageBackupPayloads,
    coldStorageHeader,
} from '../coldstorage.svelte'
import { sweepTauriAssets, sweepForageAssetKey } from '../../storage/assetSweep'
import { readDir, remove, BaseDirectory } from '@tauri-apps/plugin-fs'
import { DBState } from '../../stores.svelte'

//#region shared fixture helpers

type CharacterFixture = Database['characters'][number]

function makeFullCharacter(chaId: string): CharacterFixture {
    return {
        chaId,
        name: 'Full Character',
        type: 'character',
        chatPage: 0,
        image: 'assets/main-image.png',
        emotionImages: [
            ['happy', 'assets/emotion-happy.png'],
            ['sad', 'assets/emotion-sad.png'],
        ],
        additionalAssets: [
            ['bg', 'assets/additional-bg.png', ''],
        ],
        chats: [],
    } as unknown as CharacterFixture
}

/** The cold-storage stub `makeColdDataForCharacter` writes in place of a
 * character -- keeps only `image`, not emotionImages/additionalAssets. */
function makeColdStub(chaId: string, coldKey: string): CharacterFixture {
    return {
        chaId,
        name: 'Full Character',
        type: 'character',
        chatPage: 0,
        image: 'assets/main-image.png',
        coldstorage: coldKey,
        chats: [{
            message: [{ time: Date.now(), data: '', role: 'char' }],
            note: '',
            name: '',
            localLore: [],
        }],
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
        characterOrder: characters.map((c) => c.chaId),
        characters,
        coldstorage: false,
    } as unknown as Database
}

function makeColdChat(id: string, coldKey: string) {
    return {
        id,
        message: [{ time: 1_690_000_000_000, data: coldStorageHeader + coldKey, role: 'char' }],
        note: '',
        name: '',
        localLore: [],
    }
}

function makeErrorTextChat(id: string, coldKey: string) {
    return {
        id,
        message: [{ time: 1, data: `[Cold storage data could not be loaded. Key: ${coldKey}]`, role: 'char' }],
        note: '',
        name: '',
        localLore: [],
    }
}

//#endregion

describe('CHORE-07 stage 7a: boot-time asset sweep must skip on an incomplete cold read', () => {
    test('a1 RED: Tauri sweep must not delete assets when the cold read is a transient failure', async () => {
        platformState.isTauri = true
        resetTauriFs()
        const coldKey = 'a1-cold-key'
        const chaId = 'a1-char'
        const writeOk = await setColdStorageItem(coldKey, { character: makeFullCharacter(chaId) })
        expect(writeOk).toBe(true)
        const db = makeDb([makeColdStub(chaId, coldKey)])

        armTransientTauriReadFailure(coldKey)

        // Drive the REAL wiring exactly the way cleanChunks does
        // (bootstrap.ts:582-589): buildAssetKeepSet, then spread its result
        // into sweepTauriAssets.
        const keepSet = await buildAssetKeepSet(db)
        await sweepTauriAssets({
            ...keepSet,
            listAssets: () => readDir('assets', { baseDir: BaseDirectory.AppData }),
            removeAsset: (relativePath) => remove(relativePath, { baseDir: BaseDirectory.AppData }),
            getBasename,
        })

        // Before the fix: `buildAssetKeepSet` already existed (the pure
        // refactor added that seam first, with no behaviour change), but had
        // no completeness tracking yet, so one transient cold-read failure
        // left the stub (no emotionImages/additionalAssets) as the only view
        // of this character, and the sweep had no signal to skip -- it
        // wrongly deleted these still-in-use asset files.
        expect(tauriFsHas('assets/emotion-happy.png')).toBe(true)
        expect(tauriFsHas('assets/emotion-sad.png')).toBe(true)
        expect(tauriFsHas('assets/additional-bg.png')).toBe(true)
    })

    test('a2 RED: the web/forage sweep must not delete assets when the cold read is a transient failure', async () => {
        platformState.isTauri = true // see file header: the cold-read backend here is orthogonal to which deletion path is under test
        resetTauriFs()
        const forageAssetStore = new Map<string, Uint8Array>([
            ['assets/main-image.png', new TextEncoder().encode('x')],
            ['assets/emotion-happy.png', new TextEncoder().encode('x')],
            ['assets/emotion-sad.png', new TextEncoder().encode('x')],
            ['assets/additional-bg.png', new TextEncoder().encode('x')],
        ])
        const coldKey = 'a2-cold-key'
        const chaId = 'a2-char'
        await setColdStorageItem(coldKey, { character: makeFullCharacter(chaId) })
        const db = makeDb([makeColdStub(chaId, coldKey)])

        armTransientTauriReadFailure(coldKey)

        const keepSet = await buildAssetKeepSet(db)
        // Matches bootstrap.ts's web/Node loop (:653-660): one
        // sweepForageAssetKey call per 'assets/'-prefixed key.
        for (const key of Array.from(forageAssetStore.keys())) {
            await sweepForageAssetKey(key, {
                ...keepSet,
                removeAsset: async (k) => { forageAssetStore.delete(k) },
                getBasename,
            })
        }

        // RED: same failure, same wrong outcome, on the OTHER deletion path.
        expect(forageAssetStore.has('assets/emotion-happy.png')).toBe(true)
        expect(forageAssetStore.has('assets/emotion-sad.png')).toBe(true)
        expect(forageAssetStore.has('assets/additional-bg.png')).toBe(true)
    })

    test('a3 RED: the sweep must not delete assets when the cold blob was never written', async () => {
        platformState.isTauri = true
        resetTauriFs()
        const coldKey = 'a3-cold-key-never-written'
        const chaId = 'a3-char'
        // Deliberately never call setColdStorageItem for this key.
        const db = makeDb([makeColdStub(chaId, coldKey)])

        const keepSet = await buildAssetKeepSet(db)
        await sweepTauriAssets({
            ...keepSet,
            listAssets: () => readDir('assets', { baseDir: BaseDirectory.AppData }),
            removeAsset: (relativePath) => remove(relativePath, { baseDir: BaseDirectory.AppData }),
            getBasename,
        })

        // RED: a genuinely missing blob is indistinguishable from a transient
        // failure at this layer -- same wrongly-deleted outcome.
        expect(tauriFsHas('assets/emotion-happy.png')).toBe(true)
        expect(tauriFsHas('assets/emotion-sad.png')).toBe(true)
        expect(tauriFsHas('assets/additional-bg.png')).toBe(true)
    })

    test("a4 RED: the sweep must not delete assets when the blob's character.chaId does not match", async () => {
        platformState.isTauri = true
        resetTauriFs()
        const coldKey = 'a4-cold-key'
        const chaId = 'a4-char'
        // The blob is readable, but for a DIFFERENT character -- the exact
        // check this fails is the chaId check in `resolveUncleanableChars`.
        await setColdStorageItem(coldKey, { character: makeFullCharacter('a4-someone-else') })
        const db = makeDb([makeColdStub(chaId, coldKey)])

        const keepSet = await buildAssetKeepSet(db)
        await sweepTauriAssets({
            ...keepSet,
            listAssets: () => readDir('assets', { baseDir: BaseDirectory.AppData }),
            removeAsset: (relativePath) => remove(relativePath, { baseDir: BaseDirectory.AppData }),
            getBasename,
        })

        // RED: a chaId mismatch is treated the same as "coldData?.character"
        // being falsy -- the stub's view is kept, and its emotion/additional
        // assets are wrongly deleted.
        expect(tauriFsHas('assets/emotion-happy.png')).toBe(true)
        expect(tauriFsHas('assets/emotion-sad.png')).toBe(true)
        expect(tauriFsHas('assets/additional-bg.png')).toBe(true)
    })

    test('a5 CHAR: a healthy cold read still deletes exactly the unreferenced assets', async () => {
        platformState.isTauri = true
        resetTauriFs()
        fsStore.set('assets/truly-orphaned.png', new TextEncoder().encode('orphan-bytes'))
        const coldKey = 'a5-cold-key'
        const chaId = 'a5-char'
        await setColdStorageItem(coldKey, { character: makeFullCharacter(chaId) })
        const db = makeDb([makeColdStub(chaId, coldKey)])

        const keepSet = await buildAssetKeepSet(db)
        await sweepTauriAssets({
            ...keepSet,
            listAssets: () => readDir('assets', { baseDir: BaseDirectory.AppData }),
            removeAsset: (relativePath) => remove(relativePath, { baseDir: BaseDirectory.AppData }),
            getBasename,
        })

        // CHAR: unchanged before and after the fix -- a fully successful cold
        // read protects every referenced asset and deletes only the orphan.
        expect(tauriFsHas('assets/main-image.png')).toBe(true)
        expect(tauriFsHas('assets/emotion-happy.png')).toBe(true)
        expect(tauriFsHas('assets/emotion-sad.png')).toBe(true)
        expect(tauriFsHas('assets/additional-bg.png')).toBe(true)
        expect(tauriFsHas('assets/truly-orphaned.png')).toBe(false)
    })

    // a6 (CHAR, "remotes/ cleanup still runs when the asset sweep is
    // skipped") is SKIPPED: the remotes/ loop lives inline inside
    // bootstrap.ts's non-exported cleanChunks (bootstrap.ts:592-643) and has
    // no extracted seam (unlike the two asset-deletion loops, which
    // src/ts/storage/assetSweep.ts already isolates). Reaching it for a test
    // would mean importing bootstrap.ts itself, which pulls in its own large,
    // separately-mocked import graph (loadPlugins, checkDriverInit,
    // characterURLImport, drive/accounter, kei/backup, model/modellist,
    // registerModelDynamic, etc.) well beyond this file's scope. Per the
    // task's instruction, this is reported rather than faked.
    test.skip('a6 SKIPPED: remotes/ cleanup coverage requires bootstrap.ts, out of scope for this seam-only file', () => {})

    test("a10 CHAR: plain getUncleanables(db) keeps its output for drive.ts unchanged", async () => {
        platformState.isTauri = true
        resetTauriFs()
        const coldKey = 'a10-cold-key'
        const chaId = 'a10-char'
        await setColdStorageItem(coldKey, { character: makeFullCharacter(chaId) })
        const db = makeDb([makeColdStub(chaId, coldKey)])

        // drive.ts:312 calls getUncleanables(db) directly (the UNCHECKED
        // form) and expects a flat basename array -- stage 7a's new
        // buildAssetKeepSet() must not change this existing function's
        // healthy-path output.
        const uncleanableList = await getUncleanables(db)

        expect(new Set(uncleanableList)).toEqual(new Set([
            'main-image.png',
            'emotion-happy.png',
            'emotion-sad.png',
            'additional-bg.png',
        ]))
    })

    test('a10b CHAR: getUncleanables(db) must not swallow an account-branch cold read failure', async () => {
        // getColdStorageItem's account branch has no try/catch around
        // fetchProtectedResource/decompress/JSON.parse, unlike its
        // Node/Tauri/OPFS siblings -- a throw there is meant to propagate.
        // drive.ts:312's loadDrive calls
        // getUncleanables(db) unguarded and relies on that rejection to
        // abort a restore loudly instead of silently treating a broken
        // account read as "nothing to protect".
        //
        // Vitest does not clear mock call history between tests by default
        // in this repo (no clearMocks/restoreMocks in vitest.config.ts), so
        // fetchProtectedResourceMock's own call log is reset here even
        // though this test doesn't assert a count itself -- a14 does, and a
        // leftover call from this test was observed to leak into it and
        // break that count when the whole file ran together.
        fetchProtectedResourceMock.mockClear()
        forageStorage.isAccount = true
        try {
            const chaId = 'a10b-char'
            const coldKey = 'a10b-cold-key'
            const db = makeDb([makeColdStub(chaId, coldKey)])

            fetchProtectedResourceMock.mockRejectedValueOnce(new Error('simulated account cold-storage fetch failure'))

            // CHAR: an intermediate, unshipped draft of this fix wrapped
            // this read in a try/catch -- structurally like the
            // try/catch-wrapped, completeness-tracking branch
            // `resolveUncleanableChars` takes, in the fixed code, only for
            // `buildAssetKeepSet` -- so on that draft this promise resolved
            // instead of rejecting (ledger row 32: `promise resolved
            // "[ 'main-image.png' ]" instead of rejecting`). `getUncleanables`
            // itself never takes that branch: in the fixed code it calls
            // `resolveUncleanableChars` with the plain, unwrapped read (no
            // try/catch of its own), so this read propagates the throw,
            // matching drive.ts:312's expectation. HEAD's original
            // `getUncleanables` (before `resolveUncleanableChars` existed at
            // all) also just awaited this read with no try/catch of its own,
            // which is why this test passes both on HEAD and with the fix
            // applied.
            await expect(getUncleanables(db)).rejects.toThrow('simulated account cold-storage fetch failure')
        } finally {
            forageStorage.isAccount = false
        }
    })
})

describe('CHORE-07 stage 7a: manual cold-storage cleanup must not delete recoverable blobs', () => {
    test('a7 RED: cleanColdStorage must keep a blob referenced only by an error-text message[0], with later messages too', async () => {
        platformState.isTauri = false
        resetOpfs()

        const MAIN_KEY = 'a7-main-key'
        const coldPayload = {
            message: [{ time: 1000, data: 'archived message', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        }
        const writeOk = await setColdStorageItem(MAIN_KEY, coldPayload)
        expect(writeOk).toBe(true)

        DBState.db = makeDb([{
            chaId: 'a7-char',
            name: 'A7 Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('a7-chat-0', MAIN_KEY)],
        } as unknown as CharacterFixture])

        // The REAL preLoadChat corrupts the pointer on a transient read
        // failure -- the error write in `preLoadChat`.
        armTransientOpfsFailure(MAIN_KEY)
        await preLoadChat(0, 0)
        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        expect(chat.message[0].data).toBe(`[Cold storage data could not be loaded. Key: ${MAIN_KEY}]`)

        // The user kept chatting after the error -- push further messages, as
        // §2.2b requires this fixture to cover.
        chat.message.push({ data: 'a later message the user sent after the error' } as never)
        chat.message.push({ data: 'and one more' } as never)

        // Note: §2.2b's SUSPECTED-harmless claim about sendChat's
        // risuChatParser(v.data, {runVar:true}) leaving this error text
        // unchanged (index.svelte.ts:144-149) is NOT exercised here --
        // parser.svelte.ts is mocked wholesale in this file (it transitively
        // hits the stores.svelte $effect.root trap), so testing the real
        // parser would need a separate, differently-mocked file.

        // Sanity: the blob is still physically present at cleanup time --
        // the earlier failure was transient, not real loss.
        const beforeItems = (await listColdStorageItems()).items
        expect(beforeItems).toContain(MAIN_KEY)

        await cleanColdStorage()

        const afterItems = (await listColdStorageItems()).items
        const afterRead = await getColdStorageItem(MAIN_KEY)
        // Before the fix: listColdDataKeysFromDb only recognized a
        // coldStorageHeader-prefixed message[0], which the error text
        // destroyed, so this still-recoverable blob was deleted as "unused".
        expect(afterItems).toContain(MAIN_KEY)
        expect(afterRead).not.toBeNull()
    })

    test("a11 RED: cleanColdStorage must not delete a chat's key when it is referenced only inside a cold-stored character's own blob", async () => {
        platformState.isTauri = false
        resetOpfs()

        const CHAT_KEY = 'a11-chat-key'
        const chatWriteOk = await setColdStorageItem(CHAT_KEY, {
            message: [{ time: 1, data: 'archived', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })
        expect(chatWriteOk).toBe(true)

        // The character's full data (as cold-stored) already contains a chat
        // whose pointer was corrupted to the error text BEFORE the character
        // itself went cold -- the `coldStoragedChats` scan in
        // `makeColdDataForCharacter` only captures chats whose message[0]
        // STILL starts with coldStorageHeader at the moment of cold-storing,
        // so this key is silently dropped from the stub's coldStoragedChats
        // (F1 gap, ledger 26).
        const CHAR_CHA_ID = 'a11-char'
        const COLD_CHAR_KEY = 'a11-cold-char-key'
        await setColdStorageItem(COLD_CHAR_KEY, {
            character: {
                type: 'character',
                chaId: CHAR_CHA_ID,
                name: 'A11 Character',
                chatPage: 0,
                chats: [makeErrorTextChat('a11-inner-chat-0', CHAT_KEY)],
            },
        })

        // The stub actually left in DBState.db, matching
        // makeColdDataForCharacter's real output shape.
        DBState.db = makeDb([{
            chaId: CHAR_CHA_ID,
            name: 'A11 Character',
            type: 'character',
            chatPage: 0,
            coldstorage: COLD_CHAR_KEY,
            coldStoragedChats: [],
            chats: [{
                message: [{ time: Date.now(), data: '', role: 'char' }],
                note: '',
                name: '',
                localLore: [],
            }],
        } as unknown as CharacterFixture])

        const beforeItems = (await listColdStorageItems()).items
        expect(beforeItems).toContain(CHAT_KEY)

        await cleanColdStorage()

        const afterItems = (await listColdStorageItems()).items
        const afterRead = await getColdStorageItem(CHAT_KEY)
        // Before the fix: cleanColdStorage never read a cold CHARACTER's own
        // blob looking for such chats, so this key looked unused and was
        // deleted.
        expect(afterItems).toContain(CHAT_KEY)
        expect(afterRead).not.toBeNull()

        // Sanity, not the RED claim: the character's own cold blob has always
        // been correctly protected via character.coldstorage, unaffected by
        // this fix.
        expect(afterItems).toContain(COLD_CHAR_KEY)
    })

    test("a11b RED: cleanColdStorage must abort entirely, deleting nothing, when a cold character's own blob cannot be read", async () => {
        platformState.isTauri = false
        resetOpfs()

        // Genuinely unreferenced anywhere in DBState.db -- under the fix's
        // normal rules this WOULD be a legitimate delete, except the abort
        // rule below must block the whole run.
        const ORPHAN_KEY = 'a11b-orphan-key'
        await setColdStorageItem(ORPHAN_KEY, { message: [{ time: 1, data: 'unrelated leftover data', role: 'user' }] })

        // Never written -- the cold character's blob is simply gone.
        const BROKEN_CHAR_KEY = 'a11b-broken-char-key'
        DBState.db = makeDb([{
            chaId: 'a11b-char',
            name: 'Broken Cold Character',
            type: 'character',
            chatPage: 0,
            coldstorage: BROKEN_CHAR_KEY,
            coldStoragedChats: [],
            chats: [{
                message: [{ time: Date.now(), data: '', role: 'char' }],
                note: '',
                name: '',
                localLore: [],
            }],
        } as unknown as CharacterFixture])

        const beforeItems = (await listColdStorageItems()).items
        expect(beforeItems).toContain(ORPHAN_KEY)

        await cleanColdStorage()

        const afterItems = (await listColdStorageItems()).items
        // Before the fix: cleanColdStorage never attempted to read cold
        // characters' own blobs at all, so it had no abort trigger -- it just
        // deleted ORPHAN_KEY as ordinarily unused, even though the broken
        // cold character meant the "used" view was incomplete.
        expect(afterItems).toContain(ORPHAN_KEY)
    })

    test("a12 CHAR: cleanColdStorage aborts, deleting nothing, when a cold character blob's chaId does not match", async () => {
        platformState.isTauri = false
        resetOpfs()

        // Genuinely unreferenced anywhere in DBState.db -- would be a
        // legitimate delete under the normal rules, except the abort below
        // must block the whole run, the same as a11b's missing-blob case.
        const ORPHAN_KEY = 'a12-orphan-key'
        await setColdStorageItem(ORPHAN_KEY, { message: [{ time: 1, data: 'unrelated leftover data', role: 'user' }] })

        // The blob is readable, but for a DIFFERENT character -- this fails
        // the chaId check in `collectColdCharacterKeysOrAbort`, exactly the
        // way it fails resolveUncleanableChars's own check (a4).
        const MISMATCHED_CHAR_KEY = 'a12-mismatched-char-key'
        await setColdStorageItem(MISMATCHED_CHAR_KEY, {
            character: {
                type: 'character',
                chaId: 'a12-someone-else',
                name: 'Mismatched Character',
                chatPage: 0,
                chats: [],
            },
        })

        DBState.db = makeDb([{
            chaId: 'a12-char',
            name: 'Mismatched Cold Character',
            type: 'character',
            chatPage: 0,
            coldstorage: MISMATCHED_CHAR_KEY,
            coldStoragedChats: [],
            chats: [{
                message: [{ time: Date.now(), data: '', role: 'char' }],
                note: '',
                name: '',
                localLore: [],
            }],
        } as unknown as CharacterFixture])

        const beforeItems = (await listColdStorageItems()).items
        expect(beforeItems).toContain(ORPHAN_KEY)
        expect(beforeItems).toContain(MISMATCHED_CHAR_KEY)

        await cleanColdStorage()

        const afterItems = (await listColdStorageItems()).items
        // CHAR: collectColdCharacterKeysOrAbort treats a chaId mismatch the
        // same as an unreadable blob -- abort the whole cleanup, so even the
        // unrelated genuinely-orphaned key survives this run.
        expect(afterItems).toContain(ORPHAN_KEY)
        expect(afterItems).toContain(MISMATCHED_CHAR_KEY)
    })

    test("a13 CHAR: cleanColdStorage keeps a cold character's own still-pointer-formatted chat key even when the stub has no coldStoragedChats", async () => {
        platformState.isTauri = false
        resetOpfs()

        const POINTER_CHAT_KEY = 'a13-pointer-chat-key'
        await setColdStorageItem(POINTER_CHAT_KEY, {
            message: [{ time: 1, data: 'archived', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })

        // The cold character's own blob has a chat whose message[0] is
        // STILL a live coldStorageHeader pointer (never corrupted) -- the
        // pointer-key branch of `collectColdCharacterKeysOrAbort`, not the
        // error-text branch a11 exercises.
        const CHAR_CHA_ID = 'a13-char'
        const COLD_CHAR_KEY = 'a13-cold-char-key'
        await setColdStorageItem(COLD_CHAR_KEY, {
            character: {
                type: 'character',
                chaId: CHAR_CHA_ID,
                name: 'A13 Character',
                chatPage: 0,
                chats: [makeColdChat('a13-inner-chat-0', POINTER_CHAT_KEY)],
            },
        })

        // The stub predates coldStoragedChats entirely (the F1 plan's
        // "backstop stubs written between 52aee0d1 and c4783544" case) --
        // the field is omitted, not just an empty array, so
        // listColdDataKeysFromDb's own `character.coldStoragedChats ?? []`
        // has nothing to read either.
        DBState.db = makeDb([{
            chaId: CHAR_CHA_ID,
            name: 'A13 Character',
            type: 'character',
            chatPage: 0,
            coldstorage: COLD_CHAR_KEY,
            chats: [{
                message: [{ time: Date.now(), data: '', role: 'char' }],
                note: '',
                name: '',
                localLore: [],
            }],
        } as unknown as CharacterFixture])

        await cleanColdStorage()

        const afterItems = (await listColdStorageItems()).items
        // CHAR: collectColdCharacterKeysOrAbort's pointer-key branch reads
        // POINTER_CHAT_KEY straight from the cold character's own blob, so
        // it survives even with no coldStoragedChats to consult.
        //
        // Reasoned, not verified by editing source (out of scope for this
        // file): deleting the pointer-key branch of
        // `collectColdCharacterKeysOrAbort` would leave only the error-text
        // branch (matchColdStorageLoadErrorKey) in that function.
        // POINTER_CHAT_KEY's message
        // data starts with coldStorageHeader, not the error-text template,
        // so matchColdStorageLoadErrorKey would return null for it and it
        // would never be added to coldCharacterKeys.keys. Nothing else in
        // cleanColdStorage's actualUsedKeys union would supply it either:
        // listColdDataKeysFromDb only reads the STUB's own
        // coldstorage/coldStoragedChats/chats (none of which mention this
        // key here), and listRecoverableErrorKeysFromDb only matches the
        // error-text template. So without that branch, POINTER_CHAT_KEY
        // would be absent from actualUsedKeys, `unusedKeys` would include
        // it, and this assertion would fail -- the branch is load-bearing
        // for this test.
        expect(afterItems).toContain(POINTER_CHAT_KEY)
    })

    test("a14 CHAR: cleanColdStorage aborts via the collector's catch when the account branch throws reading a cold character's blob", async () => {
        // See a10b's note: fetchProtectedResourceMock's call log is not
        // auto-cleared between tests, and this test asserts an exact count.
        fetchProtectedResourceMock.mockClear()
        forageStorage.isAccount = true
        try {
            const BROKEN_CHAR_KEY = 'a14-broken-char-key'
            DBState.db = makeDb([{
                chaId: 'a14-char',
                name: 'Account Cold Character',
                type: 'character',
                chatPage: 0,
                coldstorage: BROKEN_CHAR_KEY,
                coldStoragedChats: [],
                chats: [{
                    message: [{ time: Date.now(), data: '', role: 'char' }],
                    note: '',
                    name: '',
                    localLore: [],
                }],
            } as unknown as CharacterFixture])

            fetchProtectedResourceMock.mockRejectedValueOnce(new Error('simulated account cold-storage fetch failure'))

            await cleanColdStorage()

            // CHAR: collectColdCharacterKeysOrAbort's own try/catch turns
            // this throw into an abort BEFORE cleanColdStorage ever lists or
            // removes anything --
            // fetchProtectedResource is called exactly once, for the cold
            // character's own read, and never again for '@list-keys' or a
            // remove POST (cleanColdStorage returns right after the abort
            // check, before listColdStorageItems() is ever called).
            expect(fetchProtectedResourceMock).toHaveBeenCalledTimes(1)
            const [, options] = fetchProtectedResourceMock.mock.calls[0] as unknown as [string, { headers?: Record<string, string> }]
            expect(options?.headers?.['x-risu-key']).toBe(BROKEN_CHAR_KEY)
        } finally {
            forageStorage.isAccount = false
        }
    })

    test('a8 CHAR: a near-miss error-text string is not treated as a recoverable pointer', async () => {
        platformState.isTauri = false
        resetOpfs()

        const NEAR_MISS_KEY = 'a8-near-miss-key'
        await setColdStorageItem(NEAR_MISS_KEY, { message: [{ time: 1, data: 'unrelated leftover', role: 'user' }] })

        DBState.db = makeDb([{
            chaId: 'a8-char',
            name: 'A8 Character',
            type: 'character',
            chatPage: 0,
            chats: [{
                message: [{
                    time: 1,
                    // Extra text around an otherwise-exact match -- a near
                    // miss, not the anchored template.
                    data: `note: [Cold storage data could not be loaded. Key: ${NEAR_MISS_KEY}] (seen by support)`,
                    role: 'char',
                }],
                note: '',
                name: '',
                localLore: [],
            }],
        } as unknown as CharacterFixture])

        await cleanColdStorage()

        const afterItems = (await listColdStorageItems()).items
        // CHAR: a prefixed/suffixed near-miss is plain chat text, not a
        // recognized pointer, both before and after the fix -- its blob
        // stays ordinarily unused and gets cleaned up.
        expect(afterItems).not.toContain(NEAR_MISS_KEY)
    })

    test('a9 CHAR: collectColdStorageBackupPayloads ignores error-text keys, unaffected by stage 7a', async () => {
        platformState.isTauri = false
        resetOpfs()

        const REAL_KEY = 'a9-real-key'
        await setColdStorageItem(REAL_KEY, { message: [{ time: 1, data: 'kept', role: 'user' }] })
        const ERROR_KEY = 'a9-error-key'
        await setColdStorageItem(ERROR_KEY, { message: [{ time: 1, data: 'would be recoverable, but never a backup target', role: 'user' }] })

        const db = makeDb([{
            chaId: 'a9-char',
            name: 'A9 Character',
            type: 'character',
            chatPage: 0,
            chats: [
                makeColdChat('a9-chat-0', REAL_KEY),
                makeErrorTextChat('a9-chat-1', ERROR_KEY),
            ],
        } as unknown as CharacterFixture])

        const { payloads, missingKeys, invalidKeys } = await collectColdStorageBackupPayloads(db)
        const allSeenKeys = new Set([...payloads.map((p) => p.key), ...missingKeys, ...invalidKeys])

        // CHAR: ERROR_KEY is never derived from an error-text message[0], so
        // it never enters listColdDataKeys and never reaches the backup
        // collector -- unaffected by stage 7a, which deliberately leaves
        // backups untouched.
        expect(allSeenKeys.has(ERROR_KEY)).toBe(false)
        expect(allSeenKeys.has(REAL_KEY)).toBe(true)
    })
})
