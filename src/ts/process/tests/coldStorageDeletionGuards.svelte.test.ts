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
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
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

// CHORE-07 stage 7c-2: `retryLegacyColdChatLoad` (coldstorage.svelte.ts)
// reads the real `doingChat` store from `index.svelte.ts` for its busy
// check. `index.svelte.ts` itself pulls in a huge, separately-mocked import
// graph (tokenizer, scripts, request/request, memory/*, etc.) that this
// file has no reason to load for real -- it never drives `sendChat` here
// (`sendChatColdGuard.svelte.test.ts` does that) -- so the whole module is
// replaced with just the one export this file's tests control directly.
vi.mock(import('../index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('../index.svelte'))

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

// Used only by the CHORE-07 stage 7c-1 `classifyOpfsColdRead` group, far
// below -- declared here (module scope) alongside `MockNotFoundError` to
// avoid Svelte's "nested class" perf warning.
class FakeTypeMismatchError extends Error {
    name = 'TypeMismatchError'
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
    readColdStorageItem,
    classifyTauriColdRead,
    classifyOpfsColdRead,
    classifyNodeColdRead,
    classifyAccountColdRead,
    decodeColdStorageBytes,
    retryLegacyColdChatLoad,
    makeColdDataForChat,
    makeColdData,
} from '../coldstorage.svelte'
import { isColdChat, formatColdStorageLoadError, mergeRetriedColdChatSideFields } from '../coldstorageData'
import type { RetryLegacyColdChatSideFields } from '../coldstorageData'
import { doingChat } from '../index.svelte'
import { sweepTauriAssets, sweepForageAssetKey } from '../../storage/assetSweep'
import { readDir, remove, BaseDirectory, readFile as tauriReadFile, exists as tauriExists } from '@tauri-apps/plugin-fs'
import { DBState, selectedCharID } from '../../stores.svelte'
import { compress as fflateCompress } from 'fflate'
import type { ColdStorageReadResult } from '../coldstorage.svelte'

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

/** A single-character db holding exactly one chat, for the
 * `retryLegacyColdChatLoad` group below. */
function makeRetryDb(chaId: string, chat: unknown): Database {
    return makeDb([{
        chaId,
        name: 'Retry Character',
        type: 'character',
        chatPage: 0,
        chats: [chat],
    } as unknown as CharacterFixture])
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
    test('a7 / C3 CHAR: cleanColdStorage must keep a blob referenced only by an error-text message[0], with later messages too', async () => {
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

        // A chat that already holds the pre-7b error text -- this is the
        // shape a chat is left in on an install that hit a failed cold read
        // before CHORE-07 stage 7b shipped. Built directly with
        // `formatColdStorageLoadError` rather than by driving the real
        // `preLoadChat` under a simulated failure: as of stage 7b,
        // `preLoadChat` no longer writes this text on a failed read (see the
        // R1-R5 group below), so it can no longer produce this fixture
        // itself. The old version of this test's assertion that
        // `preLoadChat` wrote this exact text is now covered by R1 (which
        // asserts the opposite -- stage 7b leaves the pointer untouched).
        DBState.db = makeDb([{
            chaId: 'a7-char',
            name: 'A7 Character',
            type: 'character',
            chatPage: 0,
            chats: [makeErrorTextChat('a7-chat-0', MAIN_KEY)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }

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

/**
 * CHORE-07 stage 7b -- "preLoadChat must never destroy data on a failed or
 * unusable read, and must never reject". Agents/Reports/13-chore07-cold-read-failure-plan.md
 * §3.
 *
 * R1-R5 are RED-first against pre-7b (65c90d7f): `preLoadChat` had no return
 * value there (always resolved `undefined`) and, on a falsy/invalid read,
 * overwrote `chat.message` with `formatColdStorageLoadError(key)` --
 * exactly the destructive behaviour this group exists to remove. Their
 * failing output against the pre-fix source is recorded in this round's
 * handoff, not in this file's git history (this file is committed together
 * with the fix). C1/C2 are CHARACTERISATION: they assert only the
 * message/side-field restore behaviour that was already correct on pre-7b
 * (65c90d7f) and must stay correct after the fix, so they deliberately do
 * NOT assert on `preLoadChat`'s return value (that value did not exist yet
 * on pre-7b (65c90d7f)).
 * a7 above was re-fixtured into a C3-equivalent CHAR test for the same
 * reason -- see its own comment.
 */
describe('CHORE-07 stage 7b: preLoadChat must not reject and must not mutate a chat on a failed/invalid read', () => {
    // CHORE-07 stage 7c-1 added a character-switch race check to
    // `preLoadChat` (plan §5.2 item 4): after the read, it now also requires
    // that `get(selectedCharID)` still points at a character whose `chaId`
    // matches the character being loaded, else it returns 'none' with no
    // mutation. Every fixture in this describe block loads character index
    // 0 and expects the pre-existing (pointer-only) race check to be the
    // only thing gating the mutation, so `selectedCharID` must be pointed at
    // that same character here for those assertions to still hold.
    beforeEach(() => {
        selectedCharID.set(0)
    })
    afterEach(() => {
        selectedCharID.set(-1)
    })

    test('R1 RED: a transient OPFS read failure leaves the chat untouched and resolves "error"', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'r1-cold-key'
        await setColdStorageItem(coldKey, {
            message: [{ time: 1, data: 'archived', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })

        DBState.db = makeDb([{
            chaId: 'r1-char',
            name: 'R1 Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('r1-chat-0', coldKey)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as {
            message: { data: string }[]
            hypaV2Data?: unknown
            hypaV3Data?: unknown
            scriptstate?: unknown
            localLore?: unknown
            lastDate?: number
        }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))
        const hypaV2Before = chat.hypaV2Data
        const hypaV3Before = chat.hypaV3Data
        const scriptstateBefore = chat.scriptstate
        const localLoreBefore = chat.localLore
        const lastDateBefore = chat.lastDate

        armTransientOpfsFailure(coldKey)
        const result = await preLoadChat(0, 0)

        // RED: on pre-7b (65c90d7f) this resolves `undefined` (no return
        // value at all) and has already overwritten `chat.message` with the
        // error text by the time this assertion runs.
        expect(result).toBe('error')
        expect(chat.message).toEqual(messageBefore)
        expect(chat.hypaV2Data).toBe(hypaV2Before)
        expect(chat.hypaV3Data).toBe(hypaV3Before)
        expect(chat.scriptstate).toBe(scriptstateBefore)
        expect(chat.localLore).toBe(localLoreBefore)
        expect(chat.lastDate).toBe(lastDateBefore)
    })

    test('R2a RED: a blob shaped {message: string} resolves "error" with no mutation', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'r2a-string-message-key'
        await setColdStorageItem(coldKey, { message: 'not-an-array' })

        DBState.db = makeDb([{
            chaId: 'r2a-char',
            name: 'R2a Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('r2a-chat-0', coldKey)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        const result = await preLoadChat(0, 0)

        expect(result).toBe('error')
        expect(chat.message).toEqual(messageBefore)
    })

    test('R2b RED: a blob shaped {character: {...}} (no message array) resolves "error" with no mutation', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'r2b-character-only-key'
        await setColdStorageItem(coldKey, {
            character: { chaId: 'r2b-someone', name: 'r2b', type: 'character', chatPage: 0, chats: [] },
        })

        DBState.db = makeDb([{
            chaId: 'r2b-char',
            name: 'R2b Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('r2b-chat-0', coldKey)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        const result = await preLoadChat(0, 0)

        expect(result).toBe('error')
        expect(chat.message).toEqual(messageBefore)
    })

    test('R3 RED: an account-branch fetch throw resolves "error" instead of rejecting, with no mutation', async () => {
        platformState.isTauri = false
        resetOpfs()
        fetchProtectedResourceMock.mockClear()
        forageStorage.isAccount = true
        try {
            const coldKey = 'r3-cold-key'
            DBState.db = makeDb([{
                chaId: 'r3-char',
                name: 'R3 Character',
                type: 'character',
                chatPage: 0,
                chats: [makeColdChat('r3-chat-0', coldKey)],
            } as unknown as CharacterFixture])

            const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
            const messageBefore = JSON.parse(JSON.stringify(chat.message))

            fetchProtectedResourceMock.mockRejectedValueOnce(new Error('simulated account cold-storage fetch failure'))

            // RED: on pre-7b (65c90d7f), getColdStorageItem's account branch
            // has no try/catch of its own, so this throw propagated straight
            // out of preLoadChat as a rejection instead of resolving "error".
            const result = await preLoadChat(0, 0)

            expect(result).toBe('error')
            expect(chat.message).toEqual(messageBefore)
        } finally {
            forageStorage.isAccount = false
        }
    })

    test('R4 RED: a pointer replaced during the read is left as the newer value, resolving "none"', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'r4-cold-key'
        await setColdStorageItem(coldKey, {
            message: [{ time: 1, data: 'archived', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })

        DBState.db = makeDb([{
            chaId: 'r4-char',
            name: 'R4 Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('r4-chat-0', coldKey)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { time: number, data: string, role: string }[] }

        const resultPromise = preLoadChat(0, 0)
        // Synchronously, before any microtask from the read runs, the chat
        // pointer was replaced -- e.g. the user switched away and a new
        // chat/message took over message[0].
        chat.message = [{ time: 999, data: 'a brand new user message', role: 'user' }]

        const result = await resultPromise

        // RED: on pre-7b (65c90d7f) this branch does not exist -- the real
        // read (once it resolves) unconditionally overwrites `chat.message`
        // again, clobbering the replacement.
        expect(result).toBe('none')
        expect(chat.message).toEqual([{ time: 999, data: 'a brand new user message', role: 'user' }])
    })

    test('R5 RED: a message pushed during the read is preserved after the restored messages', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'r5-cold-key'
        await setColdStorageItem(coldKey, {
            message: [{ time: 1, data: 'archived', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })

        DBState.db = makeDb([{
            chaId: 'r5-char',
            name: 'R5 Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('r5-chat-0', coldKey)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { time: number, data: string, role: string }[] }

        const resultPromise = preLoadChat(0, 0)
        // Synchronously, before the read settles, the user (or a
        // trigger/plugin) appended a message into this still-pointer chat.
        chat.message.push({ time: 2, data: 'sent while still loading', role: 'user' })

        const result = await resultPromise

        // RED: on pre-7b (65c90d7f), the restored array replaces
        // `chat.message` wholesale with no `.slice(1)` tail, so the pushed
        // message is silently lost.
        expect(result).toBe('ok')
        expect(chat.message).toEqual([
            { time: 1, data: 'archived', role: 'user' },
            { time: 2, data: 'sent while still loading', role: 'user' },
        ])
    })

    test('C1 CHAR: a legacy array cold blob restores messages only, leaving side fields untouched', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'c1-cold-key'
        const legacyMessages = [{ time: 1, data: 'legacy restored message', role: 'user' }]
        await setColdStorageItem(coldKey, legacyMessages)

        DBState.db = makeDb([{
            chaId: 'c1-char',
            name: 'C1 Character',
            type: 'character',
            chatPage: 0,
            chats: [{
                ...makeColdChat('c1-chat-0', coldKey),
                hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            }],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as {
            message: unknown[]
            hypaV2Data: unknown
            lastDate?: number
        }
        const hypaV2Before = chat.hypaV2Data

        await preLoadChat(0, 0)

        // CHAR: unchanged before and after the fix -- a legacy array blob
        // has always replaced only `chat.message` (plus `lastDate`), never
        // touching hypaV2Data/hypaV3Data/scriptstate/localLore.
        expect(chat.message).toEqual(legacyMessages)
        expect(chat.hypaV2Data).toBe(hypaV2Before)
        expect(typeof chat.lastDate).toBe('number')
    })

    test('C2 CHAR: an object cold blob restores messages and every side field', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'c2-cold-key'
        const payload = {
            message: [{ time: 1, data: 'restored', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 5 },
            hypaV3Data: { summaries: ['s'] },
            scriptstate: { flag: true },
            localLore: [{ key: 'k', value: 'v' }],
        }
        await setColdStorageItem(coldKey, payload)

        DBState.db = makeDb([{
            chaId: 'c2-char',
            name: 'C2 Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('c2-chat-0', coldKey)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as {
            message: unknown[]
            hypaV2Data: unknown
            hypaV3Data: unknown
            scriptstate: unknown
            localLore: unknown
            lastDate?: number
        }

        await preLoadChat(0, 0)

        // CHAR: unchanged before and after the fix -- an object blob has
        // always restored messages plus every side field.
        expect(chat.message).toEqual(payload.message)
        expect(chat.hypaV2Data).toEqual(payload.hypaV2Data)
        expect(chat.hypaV3Data).toEqual(payload.hypaV3Data)
        expect(chat.scriptstate).toEqual(payload.scriptstate)
        expect(chat.localLore).toEqual(payload.localLore)
        expect(typeof chat.lastDate).toBe('number')
    })
})

/**
 * CHORE-07 stage 7b -- `isColdChat` is a brand-new, pure helper
 * (`coldstorageData.ts`). It did not exist on pre-7b (65c90d7f) at all, so
 * these cases are RED for the structural reason the task's protocol allows
 * citing instead of a run-time assertion failure: on pre-7b (65c90d7f),
 * `import { isColdChat } from '../coldstorageData'` resolves to `undefined`
 * (no such export), so calling it throws `TypeError: isColdChat is not a
 * function` rather than failing a behavioural assertion. That import error
 * is this group's red-before-green evidence.
 */
describe('CHORE-07 stage 7b: isColdChat', () => {
    test('RED: true for a chat whose first message is a live cold-storage pointer', () => {
        const chat = makeColdChat('ic-1', 'ic-key')
        expect(isColdChat(chat as never)).toBe(true)
    })

    test('RED: false for a chat with ordinary text', () => {
        expect(isColdChat({ message: [{ data: 'hello', role: 'user' }] } as never)).toBe(false)
    })

    test('RED: false for a chat holding the (pre-7b) error text', () => {
        expect(isColdChat({ message: [{ data: formatColdStorageLoadError('ic-key'), role: 'char' }] } as never)).toBe(false)
    })

    test('RED: false for an empty or missing chat', () => {
        expect(isColdChat(undefined)).toBe(false)
        expect(isColdChat(null)).toBe(false)
        expect(isColdChat({ message: [] } as never)).toBe(false)
    })
})

/**
 * CHORE-07 stage 7c-1 -- `readColdStorageItem`'s per-backend classification
 * seams (`classifyTauriColdRead`/`classifyOpfsColdRead`/
 * `classifyNodeColdRead`/`classifyAccountColdRead`), plan §5.2 item 1, §5.5.
 * These are brand-new, pure, dependency-injected functions -- none of them
 * existed on pre-7c-1 (92b9bba7), so every case below is RED for the same
 * structural reason as the `isColdChat` group above: on pre-7c-1, importing
 * any of these names from `../coldstorage.svelte` resolves to `undefined`
 * (no such export), so calling one throws `TypeError: classifyTauriColdRead
 * is not a function` (etc.) rather than failing a behavioural assertion.
 * That import error is this group's red-before-green evidence. No platform
 * mocking is needed for these -- every dependency is a plain injected
 * function.
 */
describe('CHORE-07 stage 7c-1: classifyTauriColdRead', () => {
    test('RED: "(os error 2)" with exists() false is missing', async () => {
        const readFileFn = vi.fn(async () => { throw new Error('reading file failed: (os error 2)') })
        const existsFn = vi.fn(async () => false)
        const result = await classifyTauriColdRead('./coldstorage/x.json', readFileFn, existsFn)
        expect(result).toEqual({ status: 'missing' })
        expect(existsFn).toHaveBeenCalledTimes(1)
    })

    test('RED: "(os error 2)" with exists() true is error, not missing', async () => {
        const readError = new Error('reading file failed: (os error 2)')
        const readFileFn = vi.fn(async () => { throw readError })
        const existsFn = vi.fn(async () => true)
        const result = await classifyTauriColdRead('./coldstorage/x.json', readFileFn, existsFn)
        expect(result.status).toBe('error')
        expect((result as { error: unknown }).error).toBe(readError)
    })

    test('RED: an exists() throw is error, not missing', async () => {
        const readFileFn = vi.fn(async () => { throw new Error('reading file failed: (os error 2)') })
        const existsError = new Error('simulated Tauri fs scope violation')
        const existsFn = vi.fn(async () => { throw existsError })
        const result = await classifyTauriColdRead('./coldstorage/x.json', readFileFn, existsFn)
        expect(result.status).toBe('error')
        expect((result as { error: unknown }).error).toBe(existsError)
    })

    test('RED: "(os error 3)" is error, and never calls exists()', async () => {
        const readFileFn = vi.fn(async () => { throw new Error('reading file failed: (os error 3)') })
        const existsFn = vi.fn(async () => false)
        const result = await classifyTauriColdRead('./coldstorage/x.json', readFileFn, existsFn)
        expect(result.status).toBe('error')
        expect(existsFn).not.toHaveBeenCalled()
    })
})

describe('CHORE-07 stage 7c-1: classifyOpfsColdRead', () => {
    test('RED: a NotFoundError from getFileHandle() is missing', async () => {
        const getDirectoryFn = vi.fn(async () => ({
            getFileHandle: vi.fn(async () => { throw new MockNotFoundError('not found') }),
        }))
        const result = await classifyOpfsColdRead(getDirectoryFn as never, 'coldstorage_x.json')
        expect(result).toEqual({ status: 'missing' })
    })

    test('RED: a TypeMismatchError from getFileHandle() is error, not missing', async () => {
        const getDirectoryFn = vi.fn(async () => ({
            getFileHandle: vi.fn(async () => { throw new FakeTypeMismatchError('type mismatch') }),
        }))
        const result = await classifyOpfsColdRead(getDirectoryFn as never, 'coldstorage_x.json')
        expect(result.status).toBe('error')
    })

    test('RED: a NotFoundError from getDirectory() is error, not missing', async () => {
        // A NotFoundError here is about OPFS's root directory, not about
        // `filename` -- it must never be conflated with "this file doesn't
        // exist". Distinguishing the two error sites is the whole point of
        // this seam having a separate try/catch around `getDirectoryFn()`.
        const getDirectoryFn = vi.fn(async () => { throw new MockNotFoundError('directory not found') })
        const result = await classifyOpfsColdRead(getDirectoryFn as never, 'coldstorage_x.json')
        expect(result.status).toBe('error')
        expect(getDirectoryFn).toHaveBeenCalledTimes(1)
    })
})

describe('CHORE-07 stage 7c-1: classifyNodeColdRead', () => {
    test('RED: a null getItem is missing', async () => {
        const getItemFn = vi.fn(async () => null)
        const result = await classifyNodeColdRead(getItemFn, 'coldstorage/x')
        expect(result).toEqual({ status: 'missing' })
    })

    test('RED: a throw is error', async () => {
        const thrown = new Error('simulated Node getItem failure')
        const getItemFn = vi.fn(async () => { throw thrown })
        const result = await classifyNodeColdRead(getItemFn, 'coldstorage/x')
        expect(result.status).toBe('error')
        expect((result as { error: unknown }).error).toBe(thrown)
    })
})

describe('CHORE-07 stage 7c-1: classifyAccountColdRead', () => {
    test('RED: a network throw plus a local ok is ok', async () => {
        const fetchHub = vi.fn(async (): Promise<{ status: number, arrayBuffer: () => Promise<ArrayBuffer> }> => {
            throw new Error('simulated network failure')
        })
        const readLocal = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'ok', value: { restored: true } }))
        const result = await classifyAccountColdRead(fetchHub, readLocal)
        expect(result).toEqual({ status: 'ok', value: { restored: true } })
    })

    test('RED: a network throw plus a local missing is error, never missing', async () => {
        const fetchHub = vi.fn(async (): Promise<{ status: number, arrayBuffer: () => Promise<ArrayBuffer> }> => {
            throw new Error('simulated network failure')
        })
        const readLocal = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'missing' }))
        const result = await classifyAccountColdRead(fetchHub, readLocal)
        expect(result.status).toBe('error')
    })

    test('RED: 401, 500 and 204 plus a local missing are all error, never missing', async () => {
        for (const status of [401, 500, 204]) {
            const fetchHub = vi.fn(async () => ({ status, arrayBuffer: async () => new ArrayBuffer(0) }))
            const readLocal = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'missing' }))
            const result = await classifyAccountColdRead(fetchHub, readLocal)
            expect(result.status).toBe('error')
        }
    })

    test('RED: a 200 with a corrupt body is error, with no local fallback attempted', async () => {
        const fetchHub = vi.fn(async () => ({
            status: 200,
            arrayBuffer: async () => new TextEncoder().encode('not compressed, not JSON').buffer,
        }))
        const readLocal = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'ok', value: 'should-not-be-used' }))
        const result = await classifyAccountColdRead(fetchHub, readLocal)
        expect(result.status).toBe('error')
        expect(readLocal).not.toHaveBeenCalled()
    })
})

describe('CHORE-07 stage 7c-1: decodeColdStorageBytes', () => {
    test('RED: corrupt compressed bytes reject', async () => {
        await expect(decodeColdStorageBytes(new Uint8Array([1, 2, 3, 4]))).rejects.toBeTruthy()
    })

    test('RED: validly-compressed but corrupt JSON rejects', async () => {
        const badJsonBytes = await new Promise<Uint8Array>((resolve, reject) => {
            fflateCompress(new TextEncoder().encode('{not valid json'), (err, result) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(result)
            })
        })
        await expect(decodeColdStorageBytes(badJsonBytes)).rejects.toBeTruthy()
    })
})

/**
 * CHORE-07 stage 7c-1 -- `readColdStorageItem` end to end, real OPFS
 * backend (same mock as the `preLoadChat`/a7-a14 groups above). RED for the
 * same structural (missing export) reason as the classify-function group
 * above.
 */
describe('CHORE-07 stage 7c-1: readColdStorageItem (OPFS backend)', () => {
    test('RED: a stored null value is ok, not missing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const key = 'reader-7c1-null-key'
        const writeOk = await setColdStorageItem(key, null)
        expect(writeOk).toBe(true)

        const result = await readColdStorageItem(key)
        expect(result).toEqual({ status: 'ok', value: null })
    })

    test('RED: a {character} blob is ok', async () => {
        platformState.isTauri = false
        resetOpfs()

        const key = 'reader-7c1-character-key'
        const payload = { character: { chaId: 'reader-7c1-char', name: 'Reader', type: 'character', chatPage: 0, chats: [] } }
        await setColdStorageItem(key, payload)

        const result = await readColdStorageItem(key)
        expect(result).toEqual({ status: 'ok', value: payload })
    })

    test('RED: a never-stored key is missing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const result = await readColdStorageItem('reader-7c1-never-stored-key')
        expect(result).toEqual({ status: 'missing' })
    })
})

/**
 * CHORE-07 stage 7c-1 -- `preLoadChat`'s `'missing'` result and the
 * character-switch race fix, plan §5.2 item 4, §5.5.
 */
describe('CHORE-07 stage 7c-1: preLoadChat missing result and the character-switch race', () => {
    beforeEach(() => {
        selectedCharID.set(0)
    })
    afterEach(() => {
        selectedCharID.set(-1)
    })

    test('RED: a positively missing blob resolves "missing" and mutates nothing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'missing-7c1-key' // deliberately never written
        DBState.db = makeDb([{
            chaId: 'missing-7c1-char',
            name: 'Missing 7c1 Character',
            type: 'character',
            chatPage: 0,
            chats: [makeColdChat('missing-7c1-chat-0', coldKey)],
        } as unknown as CharacterFixture])

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        const result = await preLoadChat(0, 0)

        // RED: `'missing'` is not a `PreLoadChatResult` on pre-7c-1
        // (92b9bba7) -- that source resolves `'error'` for this same
        // never-written-key case, since it cannot distinguish "positively
        // missing" from any other unusable read.
        expect(result).toBe('missing')
        expect(chat.message).toEqual(messageBefore)
    })

    test('RED: switching the selected character during the read resolves "none" and mutates nothing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'race-7c1-key'
        await setColdStorageItem(coldKey, {
            message: [{ time: 1, data: 'archived', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })

        DBState.db = makeDb([
            {
                chaId: 'race-7c1-char-0',
                name: 'Race 7c1 Character 0',
                type: 'character',
                chatPage: 0,
                chats: [makeColdChat('race-7c1-chat-0', coldKey)],
            },
            {
                chaId: 'race-7c1-char-1',
                name: 'Race 7c1 Character 1',
                type: 'character',
                chatPage: 0,
                chats: [{ message: [{ time: 1, data: 'unrelated', role: 'user' }], note: '', name: '', localLore: [] }],
            },
        ] as unknown as CharacterFixture[])

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { time: number, data: string, role: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        selectedCharID.set(0)
        const resultPromise = preLoadChat(0, 0)
        // Synchronously, before the read settles, the user switches to a
        // DIFFERENT CHARACTER entirely (not just a different chat on the
        // same character) -- character index 0 is no longer selected.
        selectedCharID.set(1)

        const result = await resultPromise

        // RED: this character-switch-by-chaId check does not exist at all
        // on pre-7c-1 (92b9bba7) -- that source only re-checks the pointer
        // string, which is untouched here, so it proceeds to restore into
        // character 0's chat regardless of which character is selected,
        // resolving 'ok' and mutating `chat.message` instead of leaving it
        // alone.
        expect(result).toBe('none')
        expect(chat.message).toEqual(messageBefore)
    })
})

/**
 * CHORE-07 stage 7c-2 -- `mergeRetriedColdChatSideFields` (`coldstorageData.ts`),
 * a brand-new, pure, dependency-free function. Plan §5.3 item 2, §5.5. RED
 * for the same structural (missing export) reason as the 7c-1 groups above:
 * on pre-7c-2 source, importing it resolves to `undefined`, so calling it
 * throws `TypeError: mergeRetriedColdChatSideFields is not a function`.
 */
describe('CHORE-07 stage 7c-2: mergeRetriedColdChatSideFields (pure)', () => {
    test('RED: hypaV3 takes the blob wholesale when live has no summaries, even with a live modalSettings set', () => {
        const live = {
            hypaV3Data: { summaries: [], modalSettings: { displayMode: 'all', displayRangeFrom: 0, displayRangeTo: 0, displayRecentCount: 0, displayImportant: false, displaySelected: false } },
        } as unknown as RetryLegacyColdChatSideFields
        const blob = {
            hypaV3Data: { summaries: [{ text: 'blob summary', chatMemos: ['b1'], isImportant: false }] },
        } as unknown as RetryLegacyColdChatSideFields

        const result = mergeRetriedColdChatSideFields(live, blob, undefined)

        // Semantic emptiness is judged on summaries.length alone -- a live
        // modalSettings does not stop the wholesale replacement.
        expect((result.hypaV3Data as { summaries: unknown[] }).summaries).toEqual(blob.hypaV3Data.summaries)
    })

    test('RED: hypaV3 concatenates blob before live, unions categories by id, and strips the dropped memo from a live summary', () => {
        const live = {
            hypaV3Data: {
                summaries: [
                    { text: 'live1', chatMemos: ['keep-1', 'dropped-memo'], isImportant: false },
                    { text: 'live2', chatMemos: ['keep-2'], isImportant: true },
                ],
                categories: [{ id: 'catB', name: 'Live Cat' }],
            },
        } as unknown as RetryLegacyColdChatSideFields
        const blob = {
            hypaV3Data: {
                summaries: [{ text: 'blob1', chatMemos: ['b1'], isImportant: false }],
                categories: [{ id: 'catA', name: 'Blob Cat' }],
            },
        } as unknown as RetryLegacyColdChatSideFields

        const result = mergeRetriedColdChatSideFields(live, blob, 'dropped-memo')
        const hypaV3Data = result.hypaV3Data as { summaries: { text: string, chatMemos: string[] }[], categories: { id: string }[] }

        expect(hypaV3Data.summaries).toEqual([
            { text: 'blob1', chatMemos: ['b1'], isImportant: false },
            { text: 'live1', chatMemos: ['keep-1'], isImportant: false },
            { text: 'live2', chatMemos: ['keep-2'], isImportant: true },
        ])
        expect(hypaV3Data.categories).toEqual([{ id: 'catA', name: 'Blob Cat' }, { id: 'catB', name: 'Live Cat' }])
    })

    test('RED (post-gate finding 3): hypaV3 drops a live summary entirely when stripping the dropped memo leaves it with no memos', () => {
        const live = {
            hypaV3Data: {
                summaries: [
                    // This summary's ONLY memo is the one being dropped --
                    // stripping it would leave `chatMemos: []`, and
                    // hypav3.ts's startIdx computation reads
                    // `[...lastSummary.chatMemos].at(-1)`, which is
                    // `undefined` for an empty list if this summary ends up
                    // last. It must be removed outright instead.
                    { text: 'live1-emptied-by-strip', chatMemos: ['dropped-memo'], isImportant: false },
                    { text: 'live2', chatMemos: ['keep-2'], isImportant: true },
                ],
            },
        } as unknown as RetryLegacyColdChatSideFields
        const blob = {
            hypaV3Data: { summaries: [{ text: 'blob1', chatMemos: ['b1'], isImportant: false }] },
        } as unknown as RetryLegacyColdChatSideFields

        const result = mergeRetriedColdChatSideFields(live, blob, 'dropped-memo')
        const hypaV3Data = result.hypaV3Data as { summaries: { text: string, chatMemos: string[] }[] }

        expect(hypaV3Data.summaries).toEqual([
            { text: 'blob1', chatMemos: ['b1'], isImportant: false },
            { text: 'live2', chatMemos: ['keep-2'], isImportant: true },
        ])
    })

    test('RED: hypaV2 takes the blob wholesale when it has mainChunks', () => {
        const live = { hypaV2Data: { chunks: [], mainChunks: [{ id: 1, text: 'live', chatMemos: [], lastChatMemo: '' }], lastMainChunkID: 1 } } as unknown as RetryLegacyColdChatSideFields
        const blob = { hypaV2Data: { chunks: [], mainChunks: [{ id: 5, text: 'blob', chatMemos: [], lastChatMemo: '' }], lastMainChunkID: 5 } } as unknown as RetryLegacyColdChatSideFields

        const result = mergeRetriedColdChatSideFields(live, blob, undefined)

        expect(result.hypaV2Data).toBe(blob.hypaV2Data)
    })

    // Not RED: confirmed against a temporary live-passthrough stub of this
    // function (`return {...live}`, the exact stub plan §5.3's "extract
    // seams first" step calls for) that this one assertion already holds --
    // a trivial passthrough coincidentally satisfies "blob has no
    // mainChunks, keep live" for hypaV2 specifically. Kept as regression
    // coverage of the real merge function, not RED evidence.
    test('CHAR: hypaV2 keeps live untouched when the blob has no mainChunks', () => {
        const live = { hypaV2Data: { chunks: [], mainChunks: [{ id: 2, text: 'live', chatMemos: [], lastChatMemo: '' }], lastMainChunkID: 2 } } as unknown as RetryLegacyColdChatSideFields
        const blob = { hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 } } as unknown as RetryLegacyColdChatSideFields

        const result = mergeRetriedColdChatSideFields(live, blob, undefined)

        expect(result.hypaV2Data).toBe(live.hypaV2Data)
    })

    test('RED: localLore concatenates blob then live, and scriptstate lets live win on a shallow merge', () => {
        const live = { localLore: [{ key: 'l', value: 'live-value' }], scriptstate: { b: 99, c: 3 } } as unknown as RetryLegacyColdChatSideFields
        const blob = { localLore: [{ key: 'b', value: 'blob-value' }], scriptstate: { a: 1, b: 2 } } as unknown as RetryLegacyColdChatSideFields

        const result = mergeRetriedColdChatSideFields(live, blob, undefined)

        expect(result.localLore).toEqual([{ key: 'b', value: 'blob-value' }, { key: 'l', value: 'live-value' }])
        expect(result.scriptstate).toEqual({ a: 1, b: 99, c: 3 })
    })
})

/**
 * CHORE-07 stage 7c-2 -- `makeColdDataForChat` (F4, plan §5.3 "scope" item
 * 1): a chat holding the pre-7b error text must not be made cold again,
 * which would bury the original recoverable key inside a brand-new blob.
 * `makeColdDataForChat` did exist before (module-private); it is exported
 * here purely as an extracted seam so this file can call it directly.
 */
describe('CHORE-07 stage 7c-2: makeColdDataForChat must not re-cold-store an error-text chat (F4)', () => {
    test('RED: an old, long error-text chat is not made cold again', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'f4-cold-key'
        const errorChat = makeErrorTextChat('f4-chat-0', coldKey)
        errorChat.message.push({ time: 2, data: 'a', role: 'user' } as never)
        errorChat.message.push({ time: 3, data: 'b', role: 'char' } as never)
        errorChat.message.push({ time: 4, data: 'c', role: 'user' } as never)

        DBState.db = makeDb([{
            chaId: 'f4-char',
            name: 'F4 Character',
            type: 'character',
            chatPage: 0,
            chats: [errorChat],
        } as unknown as CharacterFixture])

        // RED: on pre-7c-2 source, `makeColdDataForChat` only skips a chat
        // whose message[0] starts with `coldStorageHeader` -- the error text
        // does not, so this old (every message time is far in the past),
        // 4-message chat was wrongly made cold again, burying `coldKey`
        // inside a brand-new blob.
        const madeCold = await makeColdDataForChat(0, 0, Date.now())

        expect(madeCold).toBe(false)
        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        expect(chat.message[0].data).toBe(`[Cold storage data could not be loaded. Key: ${coldKey}]`)
    })

    test('Added by the gate, CHAR: an ordinary old chat is still made cold', async () => {
        platformState.isTauri = false
        resetOpfs()

        const chat = {
            message: [
                { time: 1, data: 'a', role: 'user' },
                { time: 2, data: 'b', role: 'char' },
                { time: 3, data: 'c', role: 'user' },
                { time: 4, data: 'd', role: 'char' },
            ],
            note: '', name: '', localLore: [],
        }
        DBState.db = makeDb([{
            chaId: 'f4-ordinary-char',
            name: 'F4 Ordinary Character',
            type: 'character',
            chatPage: 0,
            chats: [chat],
        } as unknown as CharacterFixture])

        const madeCold = await makeColdDataForChat(0, 0, Date.now())

        // CHAR: unaffected by the F4 fix -- an ordinary old chat (not
        // holding the error text) is still cold-stored exactly as before.
        expect(madeCold).toBe(true)
        const storedChat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        expect(storedChat.message[0].data.startsWith(coldStorageHeader)).toBe(true)
    })

    test('Guard F4, RED: makeColdData() as a whole must not bury the error text, with the character kept hot so makeColdDataForCharacter does not run first', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'f4-pipeline-cold-key'
        const errorChat = makeErrorTextChat('f4-pipeline-chat-0', coldKey)
        errorChat.message.push({ time: 2, data: 'a', role: 'user' } as never)
        errorChat.message.push({ time: 3, data: 'b', role: 'char' } as never)
        errorChat.message.push({ time: 4, data: 'c', role: 'user' } as never)

        const db = makeDb([{
            chaId: 'f4-pipeline-char',
            name: 'F4 Pipeline Character',
            type: 'character',
            chatPage: 0,
            // Kept HOT (a recent lastInteraction) on purpose (gate 7): without
            // this, whole-character cold storage (makeColdDataForCharacter)
            // would run first and replace this character with a pointer-only
            // stub before makeColdDataForChat ever saw this chat, which would
            // make this test pass for the wrong reason.
            lastInteraction: Date.now(),
            chats: [errorChat],
        } as unknown as CharacterFixture])
        db.coldstorage = true // makeColdData() early-returns unless this is set
        DBState.db = db

        await makeColdData()

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        expect(chat.message[0].data).toBe(`[Cold storage data could not be loaded. Key: ${coldKey}]`)
    })
})

/**
 * CHORE-07 stage 7c-2 -- `retryLegacyColdChatLoad` (`coldstorage.svelte.ts`),
 * plan §5.3 item 2, §5.5. A brand-new, exported function -- every case below
 * is RED for the same structural (missing export) reason as the 7c-1 groups
 * above, EXCEPT where a case is explicitly marked CHAR/Guard because the
 * behaviour it pins (e.g. "not an error-text chat" or "a near-miss string")
 * has no pre-7c-2 equivalent to regress from; it is new coverage, not a
 * fix to an existing wrong behaviour.
 */
describe('CHORE-07 stage 7c-2: retryLegacyColdChatLoad', () => {
    beforeEach(() => {
        selectedCharID.set(0)
        doingChat.set(false)
    })
    afterEach(() => {
        selectedCharID.set(-1)
        doingChat.set(false)
    })

    test('RL1 RED: ok with an object blob gives the restored messages followed by the tail, and empty live side fields take the blob\'s', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl1-cold-key'
        const blobPayload = {
            message: [{ time: 1, data: 'restored message', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [{ id: 1, text: 'chunk', chatMemos: ['m1'], lastChatMemo: 'm1' }], lastMainChunkID: 1 },
            hypaV3Data: { summaries: [{ text: 'blob summary', chatMemos: ['b1'], isImportant: false }] },
            scriptstate: { flag: 'blob' },
            localLore: [{ key: 'blob-lore', value: 'v' }],
        }
        await setColdStorageItem(coldKey, blobPayload)

        const errorChat = {
            ...makeErrorTextChat('rl1-chat-0', coldKey),
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
        }
        errorChat.message.push({ time: 2, data: 'sent after the error', role: 'user' } as never)
        DBState.db = makeRetryDb('rl1-char', errorChat)

        const result = await retryLegacyColdChatLoad(0, 0)

        const chat = DBState.db.characters[0].chats[0] as unknown as {
            message: { time: number, data: string, role: string }[]
            hypaV2Data: unknown
            hypaV3Data: { summaries: unknown[] }
            scriptstate: unknown
            localLore: unknown
            lastDate?: number
        }
        expect(result).toBe('ok')
        expect(chat.message).toEqual([
            { time: 1, data: 'restored message', role: 'user' },
            { time: 2, data: 'sent after the error', role: 'user' },
        ])
        expect(chat.hypaV2Data).toEqual(blobPayload.hypaV2Data)
        expect(chat.hypaV3Data.summaries).toEqual(blobPayload.hypaV3Data.summaries)
        expect(chat.scriptstate).toEqual(blobPayload.scriptstate)
        expect(chat.localLore).toEqual(blobPayload.localLore)
        expect(typeof chat.lastDate).toBe('number')
    })

    test('RL2 RED: ok keeps non-empty live side fields when the blob\'s are the cold-storage reset state', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl2-cold-key'
        await setColdStorageItem(coldKey, {
            message: [{ time: 1, data: 'restored message', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })

        const liveHypaV2 = { chunks: [], mainChunks: [{ id: 9, text: 'live chunk', chatMemos: ['x'], lastChatMemo: 'x' }], lastMainChunkID: 9 }
        const liveHypaV3 = { summaries: [{ text: 'live summary', chatMemos: ['live-memo'], isImportant: false }] }
        const liveScriptstate = { flag: 'live' }
        const liveLocalLore = [{ key: 'live-lore', value: 'v' }]

        const errorChat = {
            ...makeErrorTextChat('rl2-chat-0', coldKey),
            hypaV2Data: liveHypaV2,
            hypaV3Data: liveHypaV3,
            scriptstate: liveScriptstate,
            localLore: liveLocalLore,
        }
        DBState.db = makeRetryDb('rl2-char', errorChat)
        // Captured through the reactive DBState proxy, NOT the plain
        // `liveHypaV2` object above -- Svelte 5's $state proxy wraps every
        // nested plain object it's given, so DBState.db's own view of this
        // field is a different (though deep-equal) reference from the bare
        // object literal. A reference-identity assertion below must compare
        // proxy-to-proxy, matching this file's C1/C2 convention.
        const hypaV2Ref = (DBState.db.characters[0].chats[0] as unknown as { hypaV2Data: unknown }).hypaV2Data

        const result = await retryLegacyColdChatLoad(0, 0)
        const chat = DBState.db.characters[0].chats[0] as unknown as {
            hypaV2Data: unknown
            hypaV3Data: { summaries: unknown[] }
            scriptstate: unknown
            localLore: unknown
        }

        expect(result).toBe('ok')
        // hypaV2 has no non-empty mainChunks in the blob, so the merge keeps
        // the live value BY REFERENCE (no spread) -- unlike hypaV3Data/
        // scriptstate/localLore below, which the merge always rebuilds into
        // a new object/array regardless of path, so those are asserted by
        // value (toEqual), not identity.
        expect(chat.hypaV2Data).toBe(hypaV2Ref)
        expect(chat.hypaV3Data.summaries).toEqual(liveHypaV3.summaries)
        expect(chat.scriptstate).toEqual(liveScriptstate)
        expect(chat.localLore).toEqual(liveLocalLore)
    })

    test('RL3 RED: ok with a legacy array blob restores messages only, leaving every live side field untouched', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl3-cold-key'
        const legacyMessages = [{ time: 1, data: 'legacy restored message', role: 'user' }]
        await setColdStorageItem(coldKey, legacyMessages)

        const liveHypaV2 = { chunks: [], mainChunks: [{ id: 3, text: 'x', chatMemos: [], lastChatMemo: '' }], lastMainChunkID: 3 }
        const liveScriptstate = { untouched: true }
        const liveLocalLore = [{ key: 'k', value: 'v' }]
        const errorChat = {
            ...makeErrorTextChat('rl3-chat-0', coldKey),
            hypaV2Data: liveHypaV2,
            scriptstate: liveScriptstate,
            localLore: liveLocalLore,
        }
        errorChat.message.push({ time: 2, data: 'after error', role: 'user' } as never)
        DBState.db = makeRetryDb('rl3-char', errorChat)
        // See RL2's comment: captured through the reactive proxy, not the
        // bare objects above, so the "untouched" identity checks below
        // compare proxy-to-proxy.
        const chatBefore = DBState.db.characters[0].chats[0] as unknown as { hypaV2Data: unknown, scriptstate: unknown, localLore: unknown }
        const hypaV2Ref = chatBefore.hypaV2Data
        const scriptstateRef = chatBefore.scriptstate
        const localLoreRef = chatBefore.localLore

        const result = await retryLegacyColdChatLoad(0, 0)
        const chat = DBState.db.characters[0].chats[0] as unknown as {
            message: unknown[]
            hypaV2Data: unknown
            scriptstate: unknown
            localLore: unknown
        }

        expect(result).toBe('ok')
        expect(chat.message).toEqual([...legacyMessages, { time: 2, data: 'after error', role: 'user' }])
        expect(chat.hypaV2Data).toBe(hypaV2Ref)
        expect(chat.scriptstate).toBe(scriptstateRef)
        expect(chat.localLore).toBe(localLoreRef)
    })

    test('RL4 RED: a positively missing blob resolves "missing" and mutates nothing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl4-missing-key' // deliberately never written
        const errorChat = makeErrorTextChat('rl4-chat-0', coldKey)
        DBState.db = makeRetryDb('rl4-char', errorChat)
        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        const result = await retryLegacyColdChatLoad(0, 0)

        expect(result).toBe('missing')
        expect(chat.message).toEqual(messageBefore)
    })

    test('RL5 RED: an ambiguous read failure resolves "error" and mutates nothing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl5-error-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        armTransientOpfsFailure(coldKey)
        const errorChat = makeErrorTextChat('rl5-chat-0', coldKey)
        DBState.db = makeRetryDb('rl5-char', errorChat)
        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        const result = await retryLegacyColdChatLoad(0, 0)

        expect(result).toBe('error')
        expect(chat.message).toEqual(messageBefore)
    })

    test('RL6 RED: "busy" when doingChat is already set before the read starts', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl6-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        const errorChat = makeErrorTextChat('rl6-chat-0', coldKey)
        DBState.db = makeRetryDb('rl6-char', errorChat)

        doingChat.set(true)
        const result = await retryLegacyColdChatLoad(0, 0)

        expect(result).toBe('busy')
    })

    test('RL7 RED: "busy" when the chat\'s own isStreaming is set before the read starts', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl7-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        const errorChat = { ...makeErrorTextChat('rl7-chat-0', coldKey), isStreaming: true }
        DBState.db = makeRetryDb('rl7-char', errorChat)

        const result = await retryLegacyColdChatLoad(0, 0)

        expect(result).toBe('busy')
    })

    test('RL8 Added by the gate, RED: "busy" when doingChat turns true during the read', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl8-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        const errorChat = makeErrorTextChat('rl8-chat-0', coldKey)
        DBState.db = makeRetryDb('rl8-char', errorChat)

        const resultPromise = retryLegacyColdChatLoad(0, 0)
        // Synchronously, before the read settles, a send starts.
        doingChat.set(true)
        const result = await resultPromise

        expect(result).toBe('busy')
    })

    // Not RED: confirmed against a temporary `return 'none'` stub of
    // retryLegacyColdChatLoad (the exact stub plan §5.3's "extract seams
    // first" step calls for) that any assertion of `result === 'none'`
    // trivially holds against that stub -- it cannot fail. Kept as coverage
    // of the real race check, not RED evidence.
    test('RL9 Guard: switching the selected character during the read resolves "none" and mutates nothing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl9-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        const errorChat = makeErrorTextChat('rl9-chat-0', coldKey)
        DBState.db = makeDb([
            {
                chaId: 'rl9-char-0',
                name: 'RL9 Character 0',
                type: 'character',
                chatPage: 0,
                chats: [errorChat],
            },
            {
                chaId: 'rl9-char-1',
                name: 'RL9 Character 1',
                type: 'character',
                chatPage: 0,
                chats: [{ message: [{ time: 1, data: 'unrelated', role: 'user' }], note: '', name: '', localLore: [] }],
            },
        ] as unknown as CharacterFixture[])
        selectedCharID.set(0)

        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        const resultPromise = retryLegacyColdChatLoad(0, 0)
        // Synchronously, before the read settles, the user switches to a
        // DIFFERENT CHARACTER entirely.
        selectedCharID.set(1)
        const result = await resultPromise

        expect(result).toBe('none')
        expect(chat.message).toEqual(messageBefore)
    })

    // Not RED, for the same reason as RL9 above -- a `result === 'none'`
    // assertion cannot fail against the `return 'none'` stub.
    test('RL10 Guard: message[0] changing during the read (a double retry) resolves "none" and mutates nothing further', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl10-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        const errorChat = makeErrorTextChat('rl10-chat-0', coldKey)
        DBState.db = makeRetryDb('rl10-char', errorChat)
        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { time: number, data: string, role: string }[] }

        const resultPromise = retryLegacyColdChatLoad(0, 0)
        // Synchronously, before the read settles, a concurrent retry (or
        // anything else) already restored this chat.
        chat.message = [{ time: 999, data: 'restored by a concurrent retry', role: 'user' }]
        const result = await resultPromise

        expect(result).toBe('none')
        expect(chat.message).toEqual([{ time: 999, data: 'restored by a concurrent retry', role: 'user' }])
    })

    test('RL11 RED: an ok read with a shape this function does not recognize resolves "error" and mutates nothing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl11-bad-shape-key'
        await setColdStorageItem(coldKey, { message: 'not-an-array' })
        const errorChat = makeErrorTextChat('rl11-chat-0', coldKey)
        DBState.db = makeRetryDb('rl11-char', errorChat)
        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chat.message))

        const result = await retryLegacyColdChatLoad(0, 0)

        expect(result).toBe('error')
        expect(chat.message).toEqual(messageBefore)
    })

    test('RL12 Guard: a chat with ordinary text resolves "none"', async () => {
        platformState.isTauri = false
        resetOpfs()

        const errorChat = { message: [{ time: 1, data: 'ordinary text', role: 'char' }], note: '', name: '', localLore: [] }
        DBState.db = makeRetryDb('rl12-char', errorChat)

        const result = await retryLegacyColdChatLoad(0, 0)

        expect(result).toBe('none')
    })

    test('RL13 Guard: a near-miss error-text string resolves "none"', async () => {
        platformState.isTauri = false
        resetOpfs()

        const errorChat = {
            message: [{
                time: 1,
                data: 'note: [Cold storage data could not be loaded. Key: rl13-key] (seen by support)',
                role: 'char',
            }],
            note: '', name: '', localLore: [],
        }
        DBState.db = makeRetryDb('rl13-char', errorChat)

        const result = await retryLegacyColdChatLoad(0, 0)

        expect(result).toBe('none')
    })

    // Not RED, for the same reason as RL9 above.
    test('RL14 Added by the gate: a chat reordered to a different index during the read resolves "none" and mutates nothing', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl14-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        const errorChat = makeErrorTextChat('rl14-chat-0', coldKey)
        const otherChat = { message: [{ time: 1, data: 'unrelated', role: 'user' }], note: '', name: '', localLore: [] }
        DBState.db = makeRetryDb('rl14-char', errorChat)
        // Read through the reactive DBState proxy, not the raw `errorChat`
        // object built above -- Svelte 5's $state proxy wraps every nested
        // plain object it's given, so a write made through the proxy (or
        // the ABSENCE of one) would never be observable on the bare object
        // that was only used to construct the initial value. This assertion
        // must go through DBState.db, or it can never fail either way.
        const messageBefore = JSON.parse(JSON.stringify(
            (DBState.db.characters[0].chats[0] as unknown as { message: unknown[] }).message
        ))

        const resultPromise = retryLegacyColdChatLoad(0, 0)
        // Synchronously, before the read settles, a new chat is inserted at
        // index 0 -- the captured chat object is still IN the array, just no
        // longer at chatIndex 0 (it's now at index 1).
        ;(DBState.db.characters[0].chats as unknown[]).unshift(otherChat)
        const result = await resultPromise

        expect(result).toBe('none')
        expect((DBState.db.characters[0].chats[1] as unknown as { message: unknown[] }).message).toEqual(messageBefore)
    })

    // Not RED, for the same reason as RL9 above.
    test('RL15 Added by the gate: the character being replaced (same chaId, a new chats array) during the read resolves "none"', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl15-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'x', role: 'user' }] })
        const errorChat = makeErrorTextChat('rl15-chat-0', coldKey)
        DBState.db = makeRetryDb('rl15-char', errorChat)

        const resultPromise = retryLegacyColdChatLoad(0, 0)
        // Synchronously, before the read settles, a plugin replaces the
        // whole character object (same chaId, a brand-new chats array) --
        // e.g. via setCharacterToIndex (plan §5.4, accepted limit note).
        DBState.db.characters[0] = {
            chaId: 'rl15-char',
            name: 'Replaced',
            type: 'character',
            chatPage: 0,
            chats: [{ message: [{ time: 1, data: 'replacement', role: 'user' }], note: '', name: '', localLore: [] }],
        } as unknown as CharacterFixture
        const result = await resultPromise

        expect(result).toBe('none')
    })

    test('RL16 Added by the gate: the tail is kept by identity, chatId included', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl16-cold-key'
        await setColdStorageItem(coldKey, { message: [{ time: 1, data: 'restored', role: 'user' }] })
        const errorChat = makeErrorTextChat('rl16-chat-0', coldKey)
        DBState.db = makeRetryDb('rl16-char', errorChat)
        const chat = DBState.db.characters[0].chats[0] as unknown as {
            message: { time: number, data: string, role: string, chatId?: string }[]
        }

        const resultPromise = retryLegacyColdChatLoad(0, 0)
        const pushedMessage = { time: 2, data: 'sent while retrying', role: 'user', chatId: 'rl16-memo' }
        // Synchronously, before the read settles, a message is sent.
        chat.message.push(pushedMessage)
        // Captured through the reactive array itself, not `pushedMessage`
        // (see RL2/RL3's comment) -- pushing a plain object into a $state
        // array wraps it, so this is the reference retryLegacyColdChatLoad's
        // own `.slice(1)` must preserve.
        const pushedRef = chat.message[chat.message.length - 1]
        const result = await resultPromise

        expect(result).toBe('ok')
        expect(chat.message[chat.message.length - 1]).toBe(pushedRef)
        expect(chat.message[chat.message.length - 1].chatId).toBe('rl16-memo')
    })

    test('RL17 Added by the gate: the error message\'s chatId is stripped from a live summary\'s chatMemos during retry', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl17-cold-key'
        await setColdStorageItem(coldKey, {
            message: [{ time: 1, data: 'restored', role: 'user' }],
            hypaV2Data: { chunks: [], mainChunks: [], lastMainChunkID: 0 },
            hypaV3Data: { summaries: [] },
            scriptstate: {},
            localLore: [],
        })

        const baseChat = makeErrorTextChat('rl17-chat-0', coldKey)
        const errorChat = {
            ...baseChat,
            message: [{ ...baseChat.message[0], chatId: 'rl17-error-memo' }],
            hypaV3Data: {
                summaries: [
                    { text: 'live summary', chatMemos: ['rl17-error-memo', 'rl17-other-memo'], isImportant: false },
                ],
            },
        }
        DBState.db = makeRetryDb('rl17-char', errorChat)

        const result = await retryLegacyColdChatLoad(0, 0)
        const chat = DBState.db.characters[0].chats[0] as unknown as {
            hypaV3Data: { summaries: { chatMemos: string[] }[] }
        }

        expect(result).toBe('ok')
        expect(chat.hypaV3Data.summaries[0].chatMemos).toEqual(['rl17-other-memo'])
    })

    test('RL18 Added by the gate, RED (post-gate finding 1): a malformed side field in the blob resolves "error" and leaves the chat completely untouched', async () => {
        platformState.isTauri = false
        resetOpfs()

        const coldKey = 'rl18-malformed-key'
        await setColdStorageItem(coldKey, {
            message: [{ time: 1, data: 'restored', role: 'user' }],
            // Passes the shape check (the blob still has a message array),
            // but `localLore` is truthy and non-iterable -- spreading it
            // inside the merge (`[...blob.localLore, ...]`) throws.
            localLore: 5,
        })
        const errorChat = makeErrorTextChat('rl18-chat-0', coldKey)
        DBState.db = makeRetryDb('rl18-char', errorChat)
        const chatBefore = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        const messageBefore = JSON.parse(JSON.stringify(chatBefore.message))

        const result = await retryLegacyColdChatLoad(0, 0)

        // RED (post-gate): before the fix, `chat.message` was assigned
        // BEFORE the merge ran, so a throw from the merge left the chat
        // half-mutated (message replaced, side fields not) instead of
        // leaving it completely untouched, and the throw itself propagated
        // out of retryLegacyColdChatLoad as a rejection instead of
        // resolving 'error'.
        expect(result).toBe('error')
        const chat = DBState.db.characters[0].chats[0] as unknown as { message: { data: string }[] }
        expect(chat.message).toEqual(messageBefore)
        expect(chat.message[0].data).toBe(`[Cold storage data could not be loaded. Key: ${coldKey}]`)
    })
})
