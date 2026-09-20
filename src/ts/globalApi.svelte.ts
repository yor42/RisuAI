import {
    writeFile,
    BaseDirectory,
    readFile,
    exists,
    mkdir,
    readDir,
    remove
} from "@tauri-apps/plugin-fs"
import { changeFullscreen, checkNullish, sleep, sleepForever } from "./util"
import { markAppInitiatedReload } from "./reloadGuard"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { v4 as uuidv4, v4 } from 'uuid';
import { appDataDir, join } from "@tauri-apps/api/path";
import { get } from "svelte/store";
import { open } from '@tauri-apps/plugin-shell'
import streamSaver from 'streamsaver';
import { setDatabase, type Database, defaultSdDataFunc, getDatabase, appVer, getCurrentCharacter, type character, type groupChat, appSubVer } from "./storage/database.svelte";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { checkRisuUpdate } from "./update";
import { MobileGUI, botMakerMode, selectedCharID, loadedStore, DBState, LoadingStatusState, selIdState, ReloadGUIPointer, bodyIntercepterStore } from "./stores.svelte";
import { loadPlugins } from "./plugins/plugins.svelte";
import { alertConfirm, alertError, alertMd, alertNormal, alertSelect, alertTOS, alertToast, waitAlert } from "./alert";
import { checkDriverInit, syncDrive } from "./drive/drive";
import { hasher } from "./parser/parser.svelte";
import { characterURLImport, hubURL } from "./characterCards";
import { defaultJailbreak, defaultMainPrompt, oldJailbreak, oldMainPrompt } from "./storage/defaultPrompts";
import { loadRisuAccountData } from "./drive/accounter";
import { decodeRisuSave, encodeRisuSaveLegacy, RisuSaveEncoder, type toSaveType } from "./storage/risuSave";
import { AutoStorage } from "./storage/autoStorage";
import { updateAnimationSpeed } from "./gui/animation";
import { updateColorScheme, updateTextThemeAndCSS } from "./gui/colorscheme";
import { autoServerBackup, saveDbKei } from "./kei/backup";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from '@tauri-apps/api/event'
import { language } from "src/lang";
import { startObserveDom } from "./observer.svelte";
import { updateGuisize } from "./gui/guisize";
import { updateLorebooks } from "./characters";
import { initMobileGesture } from "./hotkey";
import { fetch as TauriHTTPFetch } from '@tauri-apps/plugin-http';
import { moduleUpdate } from "./process/modules";
import type { AccountStorage } from "./storage/accountStorage";
import { getColdStorageItem, makeColdData } from "./process/coldstorage.svelte";
import { isTauri, isNodeServer } from "./platform";
import { isLocalNetworkUrl } from "./network/localNetwork";
import { decodeProxyJobWsChunk, formatProxyStreamErrorMessage, parseProxyJobWsEvent } from "./network/proxyJobWs";
import { getNodeServerProxyAuth, NodeStorageConflictError } from "./storage/nodeStorage";
import { AccountSyncConflictError } from "./storage/accountStorage";
import { getMultiTabAction, isRevisionAwareBackend, nextAutoReloadHistory, resolvePromptChoice, resolveRevisionAwarePromptChoice, readAutoReloadHistory, writeAutoReloadHistory, shouldRetainOtherTabSavedSignal, type AutoReloadHistory } from "./storage/multiTabReload";
import { hasLocalDrafts } from "./localDrafts";

export const forageStorage = new AutoStorage()

const appWindow = isTauri ? getCurrentWebviewWindow() : null

interface fetchLog {
    body: string
    header: string
    response: string
    success: boolean,
    date: string
    url: string
    responseType?: string
    chatId?: string
    status?: number
}

let fetchLog: fetchLog[] = []

export async function downloadFile(name: string, dat: Uint8Array | ArrayBuffer | string) {
    if (typeof (dat) === 'string') {
        dat = Buffer.from(dat, 'utf-8')
    }
    const data = new Uint8Array(dat)
    const downloadURL = (data: string, fileName: string) => {
        const a = document.createElement('a')
        a.href = data
        a.download = fileName
        document.body.appendChild(a)
        a.style.display = 'none'
        a.click()
        a.remove()
    }

    if (isTauri) {
        await writeFile(name, data, { baseDir: BaseDirectory.Download })
    }
    else {
        const blob = new Blob([data], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)

        downloadURL(url, name)

        setTimeout(() => {
            URL.revokeObjectURL(url)
        }, 10000)


    }
}

type FileCacheEntry = {
    status: 'loading' | 'done' | 'missing'
    data?: Uint8Array
    // Set only while status === 'loading'. All callers that find an in-flight entry
    // await this SAME promise object directly rather than polling the Map — polling
    // is what let a concurrent waiter observe a stale/evicted entry after the
    // producer finished. Awaiting the promise sidesteps the Map entirely for the
    // result itself; the Map is only touched afterward, for caching/eviction.
    promise?: Promise<FileCacheEntry>
}

// Bounded LRU cache, keyed by asset location. On the non-Tauri/non-service-worker
// path this holds the full raw bytes of every asset resolved via getFileSrc, which
// used to accumulate forever for the life of the session — capped here to keep
// long sessions from holding an unbounded amount of decoded asset data in memory.
const FILE_CACHE_MAX_ENTRIES = 200
const fileCache = new Map<string, FileCacheEntry>()

function touchFileCache(loc: string, entry: FileCacheEntry) {
    // Map iteration order is insertion order; delete-then-set moves this key to the
    // end, which doubles as a cheap recency marker for the LRU eviction below.
    fileCache.delete(loc)
    fileCache.set(loc, entry)
    if (fileCache.size <= FILE_CACHE_MAX_ENTRIES) {
        return
    }
    // Walk oldest-to-newest and evict the oldest entries that aren't still
    // in-flight. A single slow/stuck load must not block eviction of everything
    // behind it, so this scans past 'loading' entries instead of stopping at the
    // first one.
    for (const [key, candidate] of fileCache) {
        if (fileCache.size <= FILE_CACHE_MAX_ENTRIES) {
            break
        }
        if (candidate.status === 'loading') {
            continue
        }
        fileCache.delete(key)
    }
    // If every remaining entry is still 'loading' (e.g. many stalled requests at
    // once), the pass above evicts nothing and the cache would otherwise grow
    // without bound. Fall back to evicting the oldest in-flight entries too — this
    // is safe because every caller already awaits its entry's `promise` directly
    // (see getFileSrc), not a Map lookup, so removing the Map slot doesn't affect
    // anyone already waiting on it. It only means a brand-new caller for that same
    // key won't find this attempt and will start a fresh one instead of joining
    // it — which is exactly why the completion side below only ever commits a
    // result back into the Map if its own entry is still the one present, so an
    // orphaned old attempt can never clobber a newer retry.
    for (const key of fileCache.keys()) {
        if (fileCache.size <= FILE_CACHE_MAX_ENTRIES) {
            break
        }
        fileCache.delete(key)
    }
}

let pathCache: { [key: string]: string } = {}
let checkedPaths: string[] = []

/**
 * Gets the source URL of a file.
 *
 * @param {string} loc - The location of the file.
 * @returns {Promise<string>} - A promise that resolves to the source URL of the file.
 */
export async function getFileSrc(loc: string) {
    if (isTauri) {
        if (loc.startsWith('assets')) {
            if (appDataDirPath === '') {
                appDataDirPath = await appDataDir();
            }
            const cached = pathCache[loc]
            if (cached) {
                return convertFileSrc(cached)
            }
            else {
                const joined = await join(appDataDirPath, loc)
                pathCache[loc] = joined
                return convertFileSrc(joined)
            }
        }
        return convertFileSrc(loc)
    }
    if (forageStorage.isAccount && loc.startsWith('assets')) {
        return hubURL + `/rs/` + loc
    }
    try {
        if (usingSw) {
            const encoded = Buffer.from(loc, 'utf-8').toString('hex')
            const existing = fileCache.get(loc)

            // Retry (start a fresh resolution) for: no entry yet, or an earlier attempt
            // that settled 'missing' (a transient local-storage miss that may now have
            // resolved). An in-flight 'loading' entry is awaited directly below instead
            // of retried. A settled 'done' entry needs nothing further.
            const shouldStart = !existing || existing.status === 'missing'

            if (shouldStart) {
                const loadingEntry: FileCacheEntry = { status: 'loading' }
                const promise = (async (): Promise<FileCacheEntry> => {
                    try {
                        const hasCache: boolean = (await (await fetch("/sw/check/" + encoded)).json()).able
                        if (hasCache) {
                            return { status: 'done' }
                        }
                        const f: Uint8Array = await forageStorage.getItem(loc) as unknown as Uint8Array
                        if (f && f.byteLength > 0) {
                            await fetch("/sw/register/" + encoded, {
                                method: "POST",
                                body: f as any
                            })
                            await sleep(10)
                            return { status: 'done' }
                        }
                        // No local copy to register yet — don't memoize this as resolved,
                        // so a later call for the same asset (once it exists locally) can
                        // retry instead of being stuck with a permanently-blank image.
                        return { status: 'missing' }
                    } catch (error) {
                        return { status: 'missing' }
                    }
                })()
                loadingEntry.promise = promise
                touchFileCache(loc, loadingEntry)
                const resolved = await promise
                // Only commit if this attempt's entry is still the one in the cache —
                // it may have been evicted (see touchFileCache) and superseded by a
                // newer retry for the same key while this was in flight.
                if (fileCache.get(loc) === loadingEntry) {
                    touchFileCache(loc, resolved)
                }
            }
            else if (existing.status === 'loading' && existing.promise) {
                await existing.promise
            }
            return "/sw/img/" + encoded
        }
        else {
            const existing = fileCache.get(loc)
            let resolved: FileCacheEntry

            if (!existing) {
                const loadingEntry: FileCacheEntry = { status: 'loading' }
                const promise = (async (): Promise<FileCacheEntry> => {
                    const f: Uint8Array = await forageStorage.getItem(loc) as unknown as Uint8Array
                    return { status: 'done', data: f }
                })()
                loadingEntry.promise = promise
                touchFileCache(loc, loadingEntry)
                try {
                    resolved = await promise
                    // Only commit if this attempt's entry is still the one in the
                    // cache — it may have been evicted and superseded by a newer
                    // retry for the same key while this was in flight.
                    if (fileCache.get(loc) === loadingEntry) {
                        touchFileCache(loc, resolved)
                    }
                } catch (error) {
                    // Don't leave this entry stuck at 'loading' forever for other
                    // callers — remove it (if it's still the current one) so a future
                    // call can retry — then let the failure propagate to this caller
                    // exactly as it would have without any caching (caught by the
                    // function-level catch below).
                    if (fileCache.get(loc) === loadingEntry) {
                        fileCache.delete(loc)
                    }
                    throw error
                }
            }
            else if (existing.status === 'loading' && existing.promise) {
                // Await the SAME promise the original caller is waiting on, rather
                // than re-reading the Map — the entry could otherwise be evicted (or
                // its promise could reject) between this check and a later read.
                resolved = await existing.promise
            }
            else {
                // Bump recency on a cache hit without changing its contents.
                touchFileCache(loc, existing)
                resolved = existing
            }
            return `data:image/png;base64,${Buffer.from(resolved?.data ?? new Uint8Array()).toString('base64')}`
        }
    } catch (error) {
        console.error(error)
        return ''
    }
}

let appDataDirPath = ''

/**
 * Reads an image file and returns its data.
 * 
 * @param {string} data - The path to the image file.
 * @returns {Promise<Uint8Array>} - A promise that resolves to the data of the image file.
 */
export async function readImage(data: string) {
    if (isTauri) {
        if (data.startsWith('assets')) {
            if (appDataDirPath === '') {
                appDataDirPath = await appDataDir();
            }
            return await readFile(await join(appDataDirPath, data))
        }
        return await readFile(data)
    }
    else {
        return (await forageStorage.getItem(data) as unknown as Uint8Array)
    }
}

/**
 * Saves an asset file with the given data, custom ID, and file name.
 * 
 * @param {Uint8Array} data - The data of the asset file.
 * @param {string} [customId=''] - The custom ID for the asset file.
 * @param {string} [fileName=''] - The name of the asset file.
 * @returns {Promise<string>} - A promise that resolves to the path of the saved asset file.
 */
export async function saveAsset(data: Uint8Array, customId: string = '', fileName: string = '') {
    let id = ''
    if (customId !== '') {
        id = customId
    }
    else {
        try {
            id = await hasher(data)
        } catch (error) {
            id = uuidv4()
        }
    }
    let fileExtension: string = 'png'
    if (fileName && fileName.split('.').length > 0) {
        fileExtension = fileName.split('.').pop()
    }
    if (isTauri) {
        await writeFile(`assets/${id}.${fileExtension}`, data, {
            baseDir: BaseDirectory.AppData
        });
        return `assets/${id}.${fileExtension}`
    }
    else {
        let form = `assets/${id}.${fileExtension}`
        const replacer = await forageStorage.setItem(form, data)
        if (replacer) {
            return replacer
        }
        return form
    }
}

/**
 * Loads an asset file with the given ID.
 * 
 * @param {string} id - The ID of the asset file to load.
 * @returns {Promise<Uint8Array>} - A promise that resolves to the data of the loaded asset file.
 */
export async function loadAsset(id: string) {
    if (isTauri) {
        return await readFile(id, { baseDir: BaseDirectory.AppData })
    }
    else {
        return await forageStorage.getItem(id) as unknown as Uint8Array
    }
}

let lastSave = ''
let lastBackupWriteTime = 0
// Every autosave writes the full database again anyway; writing a full extra
// numbered backup copy on every single cycle too (autosave debounces at
// 500ms) accelerates quota exhaustion on web for little added safety-net
// value over a much lower write rate. This only throttles how often a NEW
// backup snapshot is taken — the primary database.bin write is unaffected.
const DB_BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000
export let saving = $state({
    state: false
})

function isQuotaExceededError(error: unknown): boolean {
    return error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || (error as any).code === 22 || (error as any).code === 1014)
}

/**
 * Saves the current state of the database.
 * 
 * @returns {Promise<void>} - A promise that resolves when the database has been saved.
 */
export let requiresFullEncoderReload = $state({
    state: false
})
/**
 * A minimal async mutex serializing writes to the shared `database/database.bin`
 * key between saveDb()'s autosave loop and any other direct writer (currently
 * loadDrive()'s backup/sync restore). A boolean "is someone else writing"
 * flag checked once before encoding is NOT sufficient — the flag can flip
 * true after the check but before the write actually lands, letting a stale
 * autosave clobber a just-completed restore. Acquiring this lock actually
 * blocks a second acquirer until the first releases, so ordering is always
 * correct regardless of the exact interleaving. Not releasing after a
 * successful acquire (as loadDrive() deliberately does not, for its restore
 * write) permanently blocks every later acquirer — the desired behavior once
 * a restore has committed and a reload/relaunch is imminent: nothing from
 * this now-stale JS context should ever write this key again.
 */
class AsyncMutex {
    private queue: Promise<void> = Promise.resolve()
    async acquire(): Promise<() => void> {
        let release: () => void
        const willRelease = new Promise<void>((resolve) => { release = resolve })
        const previous = this.queue
        this.queue = this.queue.then(() => willRelease)
        await previous
        return release
    }
}
export const dbWriteLock = new AsyncMutex()

/**
 * Real cross-tab mutual exclusion for the storage-backend migration below,
 * built on the browser's Web Locks API (navigator.locks) rather than a
 * ping-and-wait heartbeat — a timeout-based liveness check can never be a
 * genuine guarantee (a backgrounded/suspended tab may simply not get to run
 * its event loop in time, and nothing stops a brand new tab from opening in
 * the gap between "checked, looked clear" and "migration actually finished").
 *
 * Every tab acquires this lock in SHARED mode for its entire lifetime — the
 * request's callback holds it open via a promise that only resolves on tab
 * unload/release, so the lock's continued existence itself is what
 * "announces this tab is alive" (no heartbeat, no timeout to miss). A
 * migration acquires the SAME lock in EXCLUSIVE mode; the browser guarantees
 * that request cannot be granted while any shared holder exists, and holding
 * it through the whole migration (not just a point-in-time check) also
 * blocks any NEW tab's shared acquisition from succeeding until the
 * migration finishes and releases — closing both the "suspended peer missed
 * the ping" and "new tab opened mid-copy" gaps a heartbeat approach cannot.
 */
const STORAGE_TAB_LOCK_NAME = 'risu-storage-tab-presence'

// Release function for THIS tab's own shared presence hold, or null while
// none is currently held (e.g. mid-migration-attempt — see
// acquireExclusiveStorageMigrationLock below).
let releaseOwnSharedPresenceLock: (() => void) | null = null

function acquireOwnSharedPresenceLock(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
        return Promise.resolve()
    }
    return new Promise<void>((resolveAcquired) => {
        navigator.locks.request(STORAGE_TAB_LOCK_NAME, { mode: 'shared' }, () => {
            return new Promise<void>((resolveHeld) => {
                // Deliberately not resolved here — this callback (and therefore the
                // shared lock) stays held until releaseOwnSharedPresenceLock() is
                // called, which normally only happens right before requesting the
                // exclusive lock below (never on ordinary tab lifetime — the lock is
                // released implicitly when the tab/document goes away).
                releaseOwnSharedPresenceLock = () => {
                    releaseOwnSharedPresenceLock = null
                    resolveHeld()
                }
                resolveAcquired()
            })
        }).catch(() => resolveAcquired())
    })
}

/** Resolves once this tab's own shared presence lock has actually been granted. */
export const tabPresenceLockAcquired: Promise<void> = acquireOwnSharedPresenceLock()

/**
 * Attempts to acquire the same lock in EXCLUSIVE mode, for a storage-backend
 * migration. Resolves to a release function once granted (call it when the
 * migration — including the reload that should immediately follow — is
 * fully done), or `null` if it couldn't be granted within `timeoutMs`
 * (meaning at least one other tab is currently alive) or Web Locks isn't
 * supported in this browser at all. Internally also acquires `dbWriteLock` —
 * callers must NOT separately acquire it themselves.
 *
 * Ordering here is load-bearing, worked out over several rounds of review:
 *
 * 1. `dbWriteLock` is acquired FIRST, before this tab even attempts the
 *    cross-tab exclusive lock. A tab that has only QUEUED for the exclusive
 *    lock (not yet been granted it) is otherwise still a fully active writer
 *    for however long it waits — if a DIFFERENT tab wins that race and starts
 *    migrating, the still-queued tab's autosave loop could write the old
 *    backend concurrently with that migration, silently losing data. Every
 *    tab that even attempts a migration must stop writing immediately, win or
 *    lose the race for the exclusive lock.
 * 2. The exclusive request is queued (the `navigator.locks.request()` call
 *    made) BEFORE releasing this tab's own shared presence hold, not after —
 *    releasing first would leave a window where this tab holds no shared lock
 *    AND has no exclusive request queued yet (invisible to the lock
 *    entirely), during which a concurrent attempt from another tab could slip
 *    in unaccounted-for. Queuing first means this request's position
 *    correctly reflects every other tab's shared hold that exists at the
 *    moment it's queued.
 * 3. Web Locks aren't reentrant and have no shared→exclusive upgrade, so this
 *    tab's own permanent shared hold must be released at all — otherwise step
 *    2's request would deadlock against itself even with zero other tabs
 *    open.
 */
export async function acquireExclusiveStorageMigrationLock(timeoutMs = 5000): Promise<(() => Promise<void>) | null> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
        return null
    }

    const releaseWriteLock = await dbWriteLock.acquire()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const exclusiveRequest = new Promise<() => void>((resolveOuter, rejectOuter) => {
        navigator.locks.request(STORAGE_TAB_LOCK_NAME, { mode: 'exclusive', signal: controller.signal }, () => {
            return new Promise<void>((resolveHeld) => {
                resolveOuter(() => resolveHeld())
            })
        }).catch(rejectOuter)
    })
    // Queued above; only now release our own shared hold — see doc comment.
    releaseOwnSharedPresenceLock?.()

    let granted: (() => void) | null = null
    try {
        granted = await exclusiveRequest
    } catch (error) {
        granted = null
    } finally {
        clearTimeout(timer)
    }

    if (!granted) {
        // Didn't get it (another tab is alive, or the wait timed out) — resume
        // correctly announcing this tab as present, THEN let it write again.
        await acquireOwnSharedPresenceLock()
        releaseWriteLock()
        return null
    }
    return async () => {
        granted()
        // Only meaningful if the caller is recovering from a failed migration
        // without reloading (see disableOpfs()'s catch path) — on the success
        // path the tab reloads immediately after, making this moot (dbWriteLock
        // stays held until then, same as loadDrive()'s restore write).
        await acquireOwnSharedPresenceLock()
        releaseWriteLock()
    }
}

export async function saveDb() {
    let changed = false
    syncDrive()
    let otherTabSaved = false
    let dirtySinceLastSave = false
    let lastPromptAt: number | null = null
    const multiTabStorage = (() => {
        try { return window.sessionStorage } catch { return null }
    })()
    let autoReloadHistory: AutoReloadHistory = readAutoReloadHistory(multiTabStorage)
    const sessionID = v4()
    let channel: BroadcastChannel
    if (window.BroadcastChannel) {
        channel = new BroadcastChannel('risu-db')
    }
    if (channel) {
        channel.onmessage = (ev) => {
            if (ev.data === sessionID) {
                return
            }
            otherTabSaved = true
        }
    }

    const changeTracker: toSaveType = {
        character: [],
        chat: [],
        botPreset: false,
        modules: false,
        loadouts: false,
        plugins: false,
        pluginCustomStorage: false
    }

    let encoder = new RisuSaveEncoder()
    await encoder.init(getDatabase(), {
        compression: forageStorage.isAccount
    })

    $effect.root(() => {

        let selIdState = $state(0)

        const debounceTime = 500; // 500 milliseconds
        let saveTimeout: ReturnType<typeof setTimeout> | null = null;

        selectedCharID.subscribe((v) => {
            selIdState = v
        })

        function saveTimeoutExecute(markDirty = true) {
            if (markDirty) {
                dirtySinceLastSave = true
            }
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            saveTimeout = setTimeout(() => {
                changed = true;
            }, debounceTime);
        }

        let ranOnce = false
        $effect(() => {
            DBState.db.botPresetsId
            DBState.db.botPresets.length
            changeTracker.botPreset = true
            saveTimeoutExecute(ranOnce)
            ranOnce = true
        })
        let ranOnce2 = false
        $effect(() => {
            $state.snapshot(DBState.db.modules)
            changeTracker.modules = true
            saveTimeoutExecute(ranOnce2)
            ranOnce2 = true
        })
        let ranOnce3 = false
        $effect(() => {
            $state.snapshot(DBState.db.loadouts)
            changeTracker.loadouts = true
            saveTimeoutExecute(ranOnce3)
            ranOnce3 = true
        })
        let ranOnce4 = false
        $effect(() => {
            $state.snapshot(DBState.db.plugins)
            changeTracker.plugins = true
            saveTimeoutExecute(ranOnce4)
            ranOnce4 = true
        })
        let ranOnce5 = false
        $effect(() => {
            $state.snapshot(DBState.db.pluginCustomStorage)
            changeTracker.pluginCustomStorage = true
            saveTimeoutExecute(ranOnce5)
            ranOnce5 = true
        })
        let ranOnce6 = false
        $effect(() => {
            for (const key in DBState.db) {
                if (
                    key !== 'characters' && key !== 'botPresets' && key !== 'modules' &&
                    key !== 'loadouts' && key !== 'plugins' && key !== 'pluginCustomStorage'
                ) {
                    $state.snapshot(DBState.db[key])
                }
            }
            if (DBState?.db?.characters?.[selIdState]) {
                for (const key in DBState.db.characters[selIdState]) {
                    if (key !== 'chats') {
                        $state.snapshot(DBState.db.characters[selIdState][key])
                    }
                }
                $state.snapshot(DBState.db.characters[selIdState].chats)
                if (changeTracker.character[0] !== DBState.db.characters[selIdState]?.chaId) {
                    changeTracker.character.unshift(DBState.db.characters[selIdState]?.chaId)
                }
                if (
                    changeTracker.chat[0]?.[0] !== DBState.db.characters[selIdState]?.chaId ||
                    changeTracker.chat[0]?.[1] !== DBState.db.characters[selIdState]?.chats[DBState.db.characters[selIdState]?.chatPage].id
                ) {
                    changeTracker.chat.unshift([DBState.db.characters[selIdState]?.chaId, DBState.db.characters[selIdState]?.chats[DBState.db.characters[selIdState]?.chatPage].id])
                }
            }
            saveTimeoutExecute(ranOnce6)
            ranOnce6 = true
        })
    })

    // Merges a snapshot of changeTracker back into the live tracker, without discarding
    // whatever the live tracker has accumulated since the snapshot was taken (e.g. from
    // edits made while a write was in flight). Used whenever a save attempt captured
    // `toSave` but didn't end up persisting it, so nothing pending gets silently dropped.
    function mergeUnsavedChanges(toSave: toSaveType) {
        for (const chaId of toSave.character) {
            if (!changeTracker.character.includes(chaId)) {
                changeTracker.character.push(chaId)
            }
        }
        for (const pair of toSave.chat) {
            if (!changeTracker.chat.some(([c, ch]) => c === pair[0] && ch === pair[1])) {
                changeTracker.chat.push(pair)
            }
        }
        changeTracker.botPreset ||= toSave.botPreset
        changeTracker.modules ||= toSave.modules
        changeTracker.loadouts ||= toSave.loadouts
        changeTracker.plugins ||= toSave.plugins
        changeTracker.pluginCustomStorage ||= toSave.pluginCustomStorage
    }

    let savetrys = 0
    let lastDbData = new Uint8Array(0)
    let quotaWarningShown = false
    // Shown once per ongoing conflict episode, not once per retry — a
    // NodeStorageConflictError keeps recurring every attempt until the user
    // reloads (see the catch block below), so without this the toast would
    // otherwise repeat every ~1s forever. Reset back to false on a
    // successful write, so a LATER, separate conflict episode still alerts.
    let conflictAlertShown = false
    // Consecutive post-commit ancillary failures (backup write -- writeFile on
    // Tauri, forageStorage.setItem elsewhere -- and getDbBackups's pruning
    // removeItem) across separate save attempts. Deliberately NOT `savetrys`:
    // that counter also gates the pre-commit retry/re-commit path (see the
    // catch block below), and folding post-commit failures into it would let a
    // run of post-commit failures masquerade as an active pre-commit retry
    // storm, or vice versa. Reset to 0 only when a full iteration completes
    // without error, so a persistently broken backup write or pruning step
    // still eventually escalates instead of degrading silently forever --
    // mirroring what the old unified `savetrys` counter did before
    // `primaryCommitted` split this catch into pre-/post-commit halves.
    // (saveDbKei(), also called in this section, wraps its whole body in its
    // own try/catch and only ever console.errors -- it never throws, so it
    // cannot contribute to this streak.)
    let postCommitFailStreak = 0
    const POST_COMMIT_ESCALATE_THRESHOLD = 5
    // Logs a post-commit ancillary failure and, once per consecutive-failure
    // streak (not once per iteration), escalates it to the user via
    // alertError. Only ever called from the `primaryCommitted` branches below
    // -- pre-commit failures keep using the existing `savetrys`-based
    // classification, unchanged.
    function notePostCommitAncillaryFailure(error: unknown) {
        postCommitFailStreak += 1
        console.error(error)
        if (postCommitFailStreak === POST_COMMIT_ESCALATE_THRESHOLD) {
            alertError(error instanceof Error ? error : String(error))
        }
    }
    await sleep(1000)
    while (true) {
        if (otherTabSaved) {
            // Consumed, never latched: a later foreign save is always re-evaluated.
            // A message arriving while the modal below is awaited simply sets this
            // again and is handled on the next iteration.
            otherTabSaved = false
            const now = Date.now()
            const hasLocalDraft = hasLocalDrafts()
            const action = getMultiTabAction({
                dirty: dirtySinceLastSave,
                now,
                history: autoReloadHistory,
                lastPromptAt,
                hasLocalDraft
            })
            if (shouldRetainOtherTabSavedSignal({ action, dirty: dirtySinceLastSave, hasLocalDraft })) {
                // A local draft is blocking this reload/prompt while the tab is
                // otherwise clean. There may be no further peer broadcast before the
                // user commits that draft, so keep this signal alive instead of
                // leaving it consumed -- otherwise the `if (otherTabSaved)` guard
                // above would simply be skipped once the tab does go dirty, and the
                // loop would write straight past the conflict prompt below.
                otherTabSaved = true
            }
            if (action === 'auto-reload') {
                autoReloadHistory = nextAutoReloadHistory(autoReloadHistory, now)
                // Only reload if we could actually record that we did. The burst cap
                // lives in sessionStorage, so when storage is unavailable every fresh
                // page would read an empty history and reload again on the next peer
                // save — an unbounded reload loop. Staying put instead is lossless
                // here, because this branch is only reached when the tab is clean.
                if (writeAutoReloadHistory(multiTabStorage, autoReloadHistory)) {
                    markAppInitiatedReload()
                    location.reload()
                    await sleepForever()
                }
            }
            if (action === 'prompt') {
                lastPromptAt = now
                saving.state = false
                if (isRevisionAwareBackend({ isNodeServer, isAccountSync: forageStorage.isAccount })) {
                    // On the self-hosted Node server and account sync, this tab's
                    // known revision is now stale precisely because the other tab's
                    // save just landed -- and that revision is deliberately never
                    // refreshed from a 409 (see nodeStorage.ts). So a "save mine"
                    // option here is not a real choice: it would 409 pre-commit on
                    // every single retry. Only offer what can actually happen --
                    // reload to pick up the current server data, or stay and park this
                    // tab (it stops trying to save, and those edits stay unsaved until
                    // it reloads).
                    const choice = resolveRevisionAwarePromptChoice(await alertSelect(
                        [language.otherTabSavedConflictReload, language.otherTabSavedConflictStay],
                        language.otherTabSavedConflictTitle
                    ))
                    if (choice === 'reload') {
                        markAppInitiatedReload()
                        location.reload()
                        await sleepForever()
                    }
                    // choice === 'stay': there is no save-mine path on this backend, so
                    // falling through to the normal save loop would immediately retry with
                    // the now-stale `if-match-revision`, 409 pre-commit, and surface a
                    // second, differently-worded conflict alert before parking anyway (see
                    // the pre-commit NodeStorageConflictError handling below). Instead, park
                    // this tab right here, quietly: stop attempting to save and never
                    // re-prompt on this page load. The user's edits stay on screen, untouched
                    // and unsaved, until they reload -- exactly what "stay" told them.
                    // (`saving.state` is already `false` from above this if-block.)
                    await sleepForever()
                } else {
                    const choice = resolvePromptChoice(await alertSelect(
                        [language.otherTabSavedSaveMine, language.otherTabSavedDiscardMine],
                        language.otherTabSavedTitle
                    ))
                    if (choice === 'reload') {
                        markAppInitiatedReload()
                        location.reload()
                        await sleepForever()
                    }
                    if (choice === 'flush') {
                        // "Save mine": once this write lands, this tab's data IS the
                        // newest committed state -- reloading would just re-read its
                        // own write and gain nothing, while a reload here is exactly
                        // what used to destroy edits landing during the write window
                        // (this used to be the `finalFlushPending` reload, now removed).
                        // Just let the normal save loop pick this up and stay put.
                        changed = true
                    }
                }
            }
        }
        if (!changed) {
            await sleep(500)
            continue
        }

        saving.state = true
        changed = false
        // Declared outside the try block (and left null until actually assigned) so the
        // catch handler can safely check whether a snapshot was taken this iteration
        // before attempting to merge it back — an error thrown before that assignment
        // (e.g. during encoder re-init) must not itself throw inside the catch.
        let toSave: toSaveType | null = null
        let primaryCommitted = false
        try {

            if (requiresFullEncoderReload.state) {
                encoder = new RisuSaveEncoder()
                await encoder.init(getDatabase(), {
                    compression: forageStorage.isAccount,
                    skipRemoteSavingOnCharacters: false
                })
                requiresFullEncoderReload.state = false
            }

            toSave = safeStructuredClone(changeTracker)
            dirtySinceLastSave = false
            // Trim/reset the live tracker right away, so edits made by effects while this
            // write is in flight accumulate fresh (rather than being clobbered by a naive
            // post-write reset that doesn't know about them). If this attempt doesn't end
            // up persisting `toSave` — because it bails out below or the write throws —
            // mergeUnsavedChanges folds it back in without discarding anything newer.
            changeTracker.character = changeTracker.character.length === 0 ? [] : [changeTracker.character[0]]
            changeTracker.chat = changeTracker.chat.length === 0 ? [] : [changeTracker.chat[0]]
            changeTracker.botPreset = false
            changeTracker.modules = false
            changeTracker.loadouts = false
            changeTracker.plugins = false
            changeTracker.pluginCustomStorage = false

            let db = getDatabase()
            if (!db.characters) {
                mergeUnsavedChanges(toSave)
                await sleep(1000)
                continue
            }

            await encoder.set(db, toSave)
            const encoded = encoder.encode()
            if (!encoded) {
                mergeUnsavedChanges(toSave)
                await sleep(1000)
                continue
            }
            const dbData = new Uint8Array(encoded)
            // Best-effort, non-blocking heads-up before storage actually fills up —
            // browser storage has no other quota signal until a write starts failing.
            if (!isTauri && !quotaWarningShown && navigator.storage?.estimate) {
                try {
                    const { quota, usage } = await navigator.storage.estimate()
                    if (quota && (quota - (usage ?? 0)) < dbData.byteLength * 2) {
                        quotaWarningShown = true
                        alertToast('Your browser storage is running low — saves may start failing soon. Consider freeing up space (delete old chats/characters or old backups).')
                    }
                } catch (error) {
                    // estimate() is best-effort only; a failure here must not block saving.
                }
            }
            const shouldWriteBackup = (Date.now() - lastBackupWriteTime) > DB_BACKUP_MIN_INTERVAL_MS
            // Acquired before the write and held through it (not just checked-then-acted
            // on) so a concurrent direct writer to this same key (loadDrive()'s restore)
            // can never interleave with this write — see AsyncMutex/dbWriteLock above.
            const releaseWriteLock = await dbWriteLock.acquire()
            try {
                if (isTauri) {
                    await writeFile('database/database.bin', dbData, { baseDir: BaseDirectory.AppData });
                }
                else {
                    await forageStorage.setItem('database/database.bin', dbData)
                }
            } finally {
                releaseWriteLock()
            }
            // The primary database write has landed. Everything after this point
            // (backup write, getDbBackups) is best-effort and must never be
            // able to resurrect and re-commit this payload — see the catch below.
            // saveDbKei() also runs later in this section, but it never throws
            // (see the postCommitFailStreak comment above), so it cannot be a
            // source of the failures this flag guards against.
            primaryCommitted = true
            if (channel) {
                try {
                    channel.postMessage(sessionID)
                } catch (error) {
                    // A failed notification must never fail a save that succeeded.
                    console.error(error)
                }
            }
            if (isTauri) {
                if (shouldWriteBackup) {
                    await writeFile(`database/dbbackup-${(Date.now() / 100).toFixed()}.bin`, dbData, { baseDir: BaseDirectory.AppData });
                    lastBackupWriteTime = Date.now()
                }
            }
            else {
                if (!forageStorage.isAccount && shouldWriteBackup) {
                    await forageStorage.setItem(`database/dbbackup-${(Date.now() / 100).toFixed()}.bin`, dbData)
                    lastBackupWriteTime = Date.now()
                }
                if (forageStorage.isAccount) {
                    await sleep(3000)
                }
            }
            if (!forageStorage.isAccount) {
                await getDbBackups()
            }

            savetrys = 0
            conflictAlertShown = false
            await saveDbKei()
            // A full iteration -- primary write, backup write, and getDbBackups
            // (the steps above that can actually throw), plus saveDbKei (which
            // never throws) -- completed without error, so this is a genuinely
            // clean cycle: reset the consecutive post-commit failure streak.
            postCommitFailStreak = 0
            await sleep(500)
        } catch (error) {
            // `primaryCommitted` splits this catch into two independent concerns that
            // used to be conflated: (1) whether it's safe to retry — restore the
            // tracker, mark `changed`, and loop back to re-encode/re-write — and (2)
            // how to classify and report the error to the user. Only (1) depends on
            // `primaryCommitted`: retrying after the primary write already landed
            // would re-commit an already-committed payload and could overwrite a peer
            // tab that has since flushed its own state in response to our broadcast —
            // the race this flag exists to prevent. But the error itself is exactly as
            // real either way — a quota or conflict failure in a backup write or in
            // getDbBackups() (its pruning removeItem) is just as actionable to the
            // user as one in the primary write — so classification always runs below,
            // regardless of `primaryCommitted`. This can't turn into a toast-spam loop: the
            // conflict branches already gate on `conflictAlertShown` (a one-shot until
            // the next successful write), and since `changed` is never set on the
            // post-commit path, there is no tight retry loop for the quota/generic
            // branches to spam from either — classification only runs again here when
            // a genuinely new edit triggers another save attempt.
            if (!primaryCommitted) {
                savetrys += 1
                // The write failed after the tracker was already trimmed above, so fold
                // `toSave` back in — merged with whatever's accumulated since — instead of
                // losing it. `toSave` is only set once the snapshot line above has actually
                // run; an error before that (e.g. during encoder re-init) has nothing to
                // merge, since the live tracker was never touched this iteration.
                if (toSave) {
                    mergeUnsavedChanges(toSave)
                    dirtySinceLastSave = true
                }
                changed = true
            } else {
                // Primary write already succeeded and was already broadcast; only
                // ancillary best-effort work (backup writes, getDbBackups, saveDbKei)
                // failed. Do NOT restore the tracker or set `changed` — see the
                // reasoning above.
                savetrys = 0
            }
            if (error instanceof NodeStorageConflictError) {
                // This device's local data is out of date with the self-hosted
                // Node server — another writer has saved this key since this
                // device last read it. Deliberately not treated as a transient
                // failure worth blindly retrying: encoding and writing the same
                // (still-stale) local state again would just resend the same
                // if-match-revision the server already rejected once, and it will
                // keep rejecting it every subsequent attempt too — that's the
                // correct, expected behavior (protecting the other writer's
                // newer data), not a bug to route around. The only real
                // resolution today is reloading (picking up the server's current
                // data fresh), which this alert says explicitly, since silently
                // "queuing" the failed edit and reloading would discard it — see
                // Agents/Reports/06-conflict-resolution-design-feasibility.md.
                //
                // That reasoning only holds pre-commit. If `primaryCommitted` is
                // true, this device's write already landed and was already
                // broadcast to other tabs — the conflict happened on ancillary
                // best-effort work instead (e.g. two tabs pruning the same oldest
                // backup once getDbBackups() finds more than the cap, which calls
                // through to NodeStorage.removeItem() and can 409). There is no
                // stale local write to protect here, so claiming the save failed
                // and parking the tab would be wrong — it would reintroduce "one
                // bad ancillary event permanently disables saving" for a save that
                // actually succeeded.
                if (primaryCommitted) {
                    if (!conflictAlertShown) {
                        conflictAlertShown = true
                        alertToast('Your latest changes were saved. A background backup step could not complete because of a conflict on the self-hosted server; this does not affect your saved data.')
                    }
                    notePostCommitAncillaryFailure(error)
                    await sleep(500)
                } else {
                    if (!conflictAlertShown) {
                        conflictAlertShown = true
                        alertToast('Your local data conflicts with a newer version on the self-hosted server — your latest changes could not be saved. Reload the app to get the current data (unsynced local changes will be lost).')
                    }
                    console.error(error)
                    // Actually stop retrying, not just stop re-alerting: a short
                    // sleep-then-loop here would re-encode and resend the exact
                    // same rejected state on every iteration forever (Codex
                    // review caught this — the comment above already claimed
                    // this wasn't "blindly retrying," but the code did exactly
                    // that). Reload is the only real resolution today, so park
                    // this loop indefinitely instead. Deliberately `sleepForever()`,
                    // not `sleep(hugeNumber)` — a first attempt at this used
                    // `sleep(100000000)` on the mistaken assumption it meant
                    // "forever" (copying accountStorage.ts's reloadSession
                    // handling, which has the same bug), but that's milliseconds,
                    // so it only blocks for ~27.8 hours before silently resuming
                    // and resending the known-stale write. `sleepForever()` never
                    // resolves at all, so only a reload (which discards this
                    // pending await along with all other JS state) can end it.
                    saving.state = false
                    await sleepForever()
                }
            }
            else if (error instanceof AccountSyncConflictError) {
                // Same reasoning as the NodeStorageConflictError branch above,
                // for the account-sync backend: whether the hub actually
                // enforces this today is unverified, but if it does, blindly
                // retrying the same stale write is wrong for the same reason.
                // Same `primaryCommitted` split as above too: a conflict on
                // ancillary work after this device's write already landed is
                // not a lost save.
                if (primaryCommitted) {
                    if (!conflictAlertShown) {
                        conflictAlertShown = true
                        alertToast('Your latest changes were saved. A background sync step could not complete because of a conflict on your account; this does not affect your saved data.')
                    }
                    notePostCommitAncillaryFailure(error)
                    await sleep(500)
                } else {
                    if (!conflictAlertShown) {
                        conflictAlertShown = true
                        alertToast('Your local data conflicts with a newer version on your account — your latest changes could not be saved. Reload the app to get the current data (unsynced local changes will be lost).')
                    }
                    console.error(error)
                    saving.state = false
                    await sleepForever()
                }
            }
            else if (isQuotaExceededError(error)) {
                // A distinct, actionable message instead of the generic retry path —
                // "retrying" is misleading here, since retrying the exact same write
                // won't succeed until the user actually frees up space.
                alertToast('Your browser storage is full — free up space (delete old chats, characters, or backups) and try again. Your latest edits could not be saved.')
                // Post-commit, `changed` was deliberately left false above, so there is
                // nothing queued to retry — just yield back to the idle poll at the top
                // of the loop instead of the longer pre-commit retry backoff.
                if (primaryCommitted) {
                    notePostCommitAncillaryFailure(error)
                } else {
                    console.error(error)
                }
                await sleep(primaryCommitted ? 500 : 5000)
            }
            else {
                if (primaryCommitted) {
                    // Ancillary failure with nothing more specific to classify.
                    // notePostCommitAncillaryFailure logs it and escalates via
                    // alertError once this becomes a persistent streak, instead of
                    // degrading silently forever. Nothing is queued to retry (see
                    // above), so this deliberately skips the "retrying…" toast
                    // below, which would be misleading — no retry is actually
                    // happening.
                    notePostCommitAncillaryFailure(error)
                    await sleep(500)
                } else {
                    if (savetrys === 1) {
                        alertToast('Failed to save data, retrying…')
                    }
                    if (savetrys > 4) {
                        alertError(error)
                    }
                    else {
                        console.error(error)
                    }
                    await sleep(1000)
                }
            }
        }

        saving.state = false
    }
}

/**
 * Retrieves the database backups.
 * 
 * @returns {Promise<number[]>} - A promise that resolves to an array of backup timestamps.
 */
export async function getDbBackups() {
    let db = getDatabase()
    if (db?.account?.useSync && !isTauri && !isNodeServer) {
        return []
    }
    if (isTauri) {
        const keys = await readDir('database', { baseDir: BaseDirectory.AppData })
        let backups: number[] = []
        for (const key of keys) {
            if (key.name.startsWith("dbbackup-")) {
                let da = key.name.substring(9)
                da = da.substring(0, da.length - 4)
                backups.push(parseInt(da))
            }
        }
        backups.sort((a, b) => b - a)
        while (backups.length > 20) {
            const last = backups.pop()
            await remove(`database/dbbackup-${last}.bin`, { baseDir: BaseDirectory.AppData })
        }
        return backups
    }
    else {
        const keys = await forageStorage.keys()

        const backups = keys
            .filter(key => key.startsWith('database/dbbackup-'))
            .map(key => parseInt(key.slice(18, -4)))
            .sort((a, b) => b - a);

        while (backups.length > 20) {
            const last = backups.pop()
            await forageStorage.removeItem(`database/dbbackup-${last}.bin`)
        }
        return backups
    }
}

let usingSw = false

export function setUsingSw(value: boolean) {
    usingSw = value
}

/**
 * Retrieves fetch data for a given chat ID.
 * 
 * @param {string} id - The chat ID to search for in the fetch log.
 * @returns {fetchLog | null} - The fetch log entry if found, otherwise null.
 */
export function getFetchData(id: string) {
    for (const log of fetchLog) {
        if (log.chatId === id) {
            return log;
        }
    }
    return null;
}

const knownHostes = ["localhost", "127.0.0.1", "0.0.0.0"];
const webLocalNetworkBlockedMessage = "웹에서는 사설망 직접 호출 불가. Tauri 또는 LAN Node self-host 사용";
const defaultProxyJobHeartbeatSec = 15;

function getProxy2Url() {
    return !isTauri && !isNodeServer ? `${hubURL}/proxy2` : `/proxy2`;
}

function getProxyStreamJobBaseUrl() {
    return isNodeServer ? '' : `${hubURL}`;
}

function buildTimeoutSignal(originalSignal?: AbortSignal, timeoutMs?: number) {
    if (!timeoutMs || timeoutMs <= 0) {
        return {
            signal: originalSignal,
            cleanup: () => { /* no-op */ }
        };
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (originalSignal) {
        if (originalSignal.aborted) {
            controller.abort();
        }
        else {
            originalSignal.addEventListener('abort', onAbort, { once: true });
        }
    }

    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeoutId);
            originalSignal?.removeEventListener('abort', onAbort);
        }
    };
}

/**
 * Interface representing the arguments for the global fetch function.
 * 
 * @interface GlobalFetchArgs
 * @property {boolean} [plainFetchForce] - Whether to force plain fetch.
 * @property {any} [body] - The body of the request.
 * @property {{ [key: string]: string }} [headers] - The headers of the request.
 * @property {boolean} [rawResponse] - Whether to return the raw response.
 * @property {'POST' | 'GET'} [method] - The HTTP method to use.
 * @property {AbortSignal} [abortSignal] - The abort signal to cancel the request.
 * @property {boolean} [useRisuToken] - Whether to use the Risu token.
 * @property {string} [chatId] - The chat ID associated with the request.
 */
export interface GlobalFetchArgs {
    plainFetchForce?: boolean;
    plainFetchDeforce?: boolean;
    body?: any;
    headers?: { [key: string]: string };
    rawResponse?: boolean;
    method?: 'POST' | 'GET';
    abortSignal?: AbortSignal;
    useRisuToken?: boolean;
    chatId?: string;
    interceptor?: string;
    requestTimeoutMs?: number;
    networkRoute?: 'auto' | 'local_network';
}

/**
 * Interface representing the result of the global fetch function.
 * 
 * @interface GlobalFetchResult
 * @property {boolean} ok - Whether the request was successful.
 * @property {any} data - The data returned from the request.
 * @property {{ [key: string]: string }} headers - The headers returned from the request.
 */
interface GlobalFetchResult {
    ok: boolean;
    data: any;
    headers: { [key: string]: string };
    status: number;
}

/**
 * Adds a fetch log entry.
 * 
 * @param {Object} arg - The arguments for the fetch log entry.
 * @param {any} arg.body - The body of the request.
 * @param {{ [key: string]: string }} [arg.headers] - The headers of the request.
 * @param {any} arg.response - The response from the request.
 * @param {boolean} arg.success - Whether the request was successful.
 * @param {string} arg.url - The URL of the request.
 * @param {string} [arg.resType] - The response type.
 * @param {string} [arg.chatId] - The chat ID associated with the request.
 * @returns {number} - The index of the added fetch log entry.
 */
export function addFetchLog(arg: {
    body: any,
    headers?: { [key: string]: string },
    response: any,
    success: boolean,
    url: string,
    resType?: string,
    chatId?: string,
    status?: number
}): number {
    fetchLog.unshift({
        body: typeof (arg.body) === 'string' ? arg.body : JSON.stringify(arg.body, null, 2),
        header: JSON.stringify(arg.headers ?? {}, null, 2),
        response: typeof (arg.response) === 'string' ? arg.response : JSON.stringify(arg.response, null, 2),
        responseType: arg.resType ?? 'json',
        success: arg.success,
        date: (new Date()).toLocaleTimeString(),
        url: arg.url,
        chatId: arg.chatId,
        status: arg.status
    });
    return 0;
}

/**
 * Performs a global fetch request.
 * 
 * @param {string} url - The URL to fetch.
 * @param {GlobalFetchArgs} [arg={}] - The arguments for the fetch request.
 * @returns {Promise<GlobalFetchResult>} - The result of the fetch request.
 */
export async function globalFetch(url: string, arg: GlobalFetchArgs = {}): Promise<GlobalFetchResult> {
    try {
        const db = getDatabase();
        if (arg.abortSignal?.aborted) { return { ok: false, data: 'aborted', headers: {}, status: 400 }; }

        const urlHost = new URL(url).hostname
        const useLocalNetworkRoute = arg.networkRoute === 'local_network' && isLocalNetworkUrl(url)
        const forcePlainFetch = ((knownHostes.includes(urlHost) && !isTauri) || db.usePlainFetch || arg.plainFetchForce) && !arg.plainFetchDeforce && !useLocalNetworkRoute

        if (useLocalNetworkRoute && !isTauri && !isNodeServer) {
            return { ok: false, headers: {}, status: 400, data: webLocalNetworkBlockedMessage };
        }

        if (knownHostes.includes(urlHost) && !isTauri && !isNodeServer) {
            return { ok: false, headers: {}, status: 400, data: 'You are trying local request on web version. This is not allowed due to browser security policy. Use the desktop version instead, or use a tunneling service like ngrok and set the CORS to allow all.' };
        }

        if(arg.interceptor){
            for (const interceptor of bodyIntercepterStore) {
                try {
                    arg.body = await interceptor.callback(arg.body, arg.interceptor) || arg.body
                }
                catch (e) {
                    console.error(e)
                }
            }
        }

        const timeoutSignal = buildTimeoutSignal(arg.abortSignal, arg.requestTimeoutMs)
        const requestArg = timeoutSignal.signal === arg.abortSignal
            ? arg
            : { ...arg, abortSignal: timeoutSignal.signal }

        try {
            if (useLocalNetworkRoute) {
                if (isTauri) {
                    return await fetchWithTauri(url, requestArg);
                }
                return await fetchWithProxy(url, requestArg);
            }
            if (forcePlainFetch) {
                return await fetchWithPlainFetch(url, requestArg);
            }
            //userScriptFetch is provided by userscript
            if (window.userScriptFetch) {
                return await fetchWithUSFetch(url, requestArg);
            }
            if (isTauri) {
                return await fetchWithTauri(url, requestArg);
            }
            return await fetchWithProxy(url, requestArg);
        } finally {
            timeoutSignal.cleanup();
        }

    } catch (error) {
        console.error(error);
        return { ok: false, data: `${error}`, headers: {}, status: 400 };
    }
}

/**
 * Adds a fetch log entry in the global fetch log.
 * 
 * @param {any} response - The response data.
 * @param {boolean} success - Indicates if the fetch was successful.
 * @param {string} url - The URL of the fetch request.
 * @param {GlobalFetchArgs} arg - The arguments for the fetch request.
 */
function addFetchLogInGlobalFetch(response: any, success: boolean, url: string, arg: GlobalFetchArgs, status?: number) {
    try {
        fetchLog.unshift({
            body: JSON.stringify(arg.body, null, 2),
            header: JSON.stringify(arg.headers ?? {}, null, 2),
            response: JSON.stringify(response, null, 2),
            success: success,
            date: (new Date()).toLocaleTimeString(),
            url: url,
            chatId: arg.chatId,
            status: status
        })
    }
    catch {
        fetchLog.unshift({
            body: JSON.stringify(arg.body, null, 2),
            header: JSON.stringify(arg.headers ?? {}, null, 2),
            response: `${response}`,
            success: success,
            date: (new Date()).toLocaleTimeString(),
            url: url,
            chatId: arg.chatId,
            status: status
        })
    }

    if (fetchLog.length > 20) {
        fetchLog.pop()
    }
}

/**
 * Performs a fetch request using plain fetch.
 * 
 * @param {string} url - The URL to fetch.
 * @param {GlobalFetchArgs} arg - The arguments for the fetch request.
 * @returns {Promise<GlobalFetchResult>} - The result of the fetch request.
 */
async function fetchWithPlainFetch(url: string, arg: GlobalFetchArgs): Promise<GlobalFetchResult> {
    try {
        const headers = { 'Content-Type': 'application/json', ...arg.headers };
        const response = await fetch(new URL(url), { body: JSON.stringify(arg.body), headers, method: arg.method ?? "POST", signal: arg.abortSignal });
        const data = arg.rawResponse ? new Uint8Array(await response.arrayBuffer()) : await response.json();
        const ok = response.ok && response.status >= 200 && response.status < 300;
        addFetchLogInGlobalFetch(data, ok, url, arg, response.status);
        return { ok, data, headers: Object.fromEntries(response.headers), status: response.status };
    } catch (error) {
        return { ok: false, data: `${error}`, headers: {}, status: 400 };
    }
}

/**
 * Performs a fetch request using userscript provided fetch.
 * 
 * @param {string} url - The URL to fetch.
 * @param {GlobalFetchArgs} arg - The arguments for the fetch request.
 * @returns {Promise<GlobalFetchResult>} - The result of the fetch request.
 */
async function fetchWithUSFetch(url: string, arg: GlobalFetchArgs): Promise<GlobalFetchResult> {
    try {
        const headers = { 'Content-Type': 'application/json', ...arg.headers };
        const response = await userScriptFetch(url, { body: JSON.stringify(arg.body), headers, method: arg.method ?? "POST", signal: arg.abortSignal });
        const data = arg.rawResponse ? new Uint8Array(await response.arrayBuffer()) : await response.json();
        const ok = response.ok && response.status >= 200 && response.status < 300;
        addFetchLogInGlobalFetch(data, ok, url, arg, response.status);
        return { ok, data, headers: Object.fromEntries(response.headers), status: response.status };
    } catch (error) {
        return { ok: false, data: `${error}`, headers: {}, status: 400 };
    }
}

/**
 * Performs a fetch request using Tauri.
 * 
 * @param {string} url - The URL to fetch.
 * @param {GlobalFetchArgs} arg - The arguments for the fetch request.
 * @returns {Promise<GlobalFetchResult>} - The result of the fetch request.
 */
async function fetchWithTauri(url: string, arg: GlobalFetchArgs): Promise<GlobalFetchResult> {
    try {
        const headers = { 'Content-Type': 'application/json', ...arg.headers };
        const response = await TauriHTTPFetch(new URL(url), { body: JSON.stringify(arg.body), headers, method: arg.method ?? "POST", signal: arg.abortSignal });
        const data = arg.rawResponse ? new Uint8Array(await response.arrayBuffer()) : await response.json();
        const ok = response.status >= 200 && response.status < 300;
        addFetchLogInGlobalFetch(data, ok, url, arg, response.status);
        return { ok, data, headers: Object.fromEntries(response.headers), status: response.status };
    } catch (error) {
        return { ok: false, data: `${error}`, headers: {}, status: 400 };
    }
}

/**
 * Performs a fetch request using a proxy.
 * 
 * @param {string} url - The URL to fetch.
 * @param {GlobalFetchArgs} arg - The arguments for the fetch request.
 * @returns {Promise<GlobalFetchResult>} - The result of the fetch request.
 */
async function fetchWithProxy(url: string, arg: GlobalFetchArgs): Promise<GlobalFetchResult> {
    try {
        const furl = getProxy2Url();
        arg.headers ??= {};
        arg.headers["Content-Type"] ??= arg.body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json";
        const nodeProxyAuth = isNodeServer ? await getNodeServerProxyAuth() : null;
        const headers = {
            "risu-header": encodeURIComponent(JSON.stringify(arg.headers)),
            "risu-url": encodeURIComponent(url),
            "Content-Type": arg.body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json",
            ...(arg.useRisuToken && { "x-risu-tk": "use" }),
            ...(arg.requestTimeoutMs && { "risu-timeout-ms": Math.max(1, Math.floor(arg.requestTimeoutMs)).toString() }),
            ...(nodeProxyAuth && { "risu-auth": nodeProxyAuth }),
            ...(DBState?.db?.requestLocation && { "risu-location": DBState.db.requestLocation }),
        };

        const body = arg.body instanceof URLSearchParams ? arg.body.toString() : JSON.stringify(arg.body);

        const response = await fetch(furl, { body, headers, method: arg.method ?? "POST", signal: arg.abortSignal });
        const isSuccess = response.ok && response.status >= 200 && response.status < 300;

        if (arg.rawResponse) {
            const data = new Uint8Array(await response.arrayBuffer());
            addFetchLogInGlobalFetch("Uint8Array Response", isSuccess, url, arg, response.status);
            return { ok: isSuccess, data, headers: Object.fromEntries(response.headers), status: response.status };
        }

        const text = await response.text();
        try {
            const data = JSON.parse(text);
            addFetchLogInGlobalFetch(data, isSuccess, url, arg, response.status);
            return { ok: isSuccess, data, headers: Object.fromEntries(response.headers), status: response.status };
        } catch (error) {
            const errorMsg = text.startsWith('<!DOCTYPE') ? "Responded HTML. Is your URL, API key, and password correct?" : text;
            addFetchLogInGlobalFetch(text, false, url, arg, response.status);
            return { ok: false, data: errorMsg, headers: Object.fromEntries(response.headers), status: response.status };
        }
    } catch (error) {
        return { ok: false, data: `${error}`, headers: {}, status: 400 };
    }
}

/**
 * Regular expression to match backslashes.
 * 
 * @constant {RegExp}
 */
const re = /\\/g;

/**
 * Gets the basename of a given path.
 * 
 * @param {string} data - The path to get the basename from.
 * @returns {string} - The basename of the path.
 */
export function getBasename(data: string) {
    const splited = data.replace(re, '/').split('/');
    const lasts = splited[splited.length - 1];
    return lasts;
}

export async function getUncleanables(db: Database, uptype: 'basename' | 'pure' = 'basename') {
    let chars: (character|groupChat)[] = []
    if (db.characters) {
        for(let cha of db.characters){
            if(cha?.coldstorage){
                const coldData = await getColdStorageItem(cha.coldstorage!)
                if(coldData?.character && coldData.character.chaId === cha.chaId){
                    cha = coldData.character
                }
            }
            chars.push(cha)
        }
    }

    return getUncleanablesSync(db, uptype, { chars });
}

/**
 * Retrieves uncleanable resources from the database.
 * 
 * @param {Database} db - The database to retrieve uncleanable resources from.
 * @param {'basename'|'pure'} [uptype='basename'] - The type of uncleanable resources to retrieve.
 * @returns {Promise<string[]>} - An array of uncleanable resources.
 */
export function getUncleanablesSync(db: Database, uptype: 'basename' | 'pure' = 'basename', options?:{
    chars: (character|groupChat)[],
}) {
    const uncleanable = new Set<string>();

    /**
     * Adds a resource to the uncleanable list if it is not already included.
     * 
     * @param {string} data - The resource to add.
     */
    function addUncleanable(data: string) {
        if (!data) {
            return;
        }
        if (data === '') {
            return;
        }
        const bn = uptype === 'basename' ? getBasename(data) : data;
        uncleanable.add(bn);
    }

    addUncleanable(db.customBackground);
    addUncleanable(db.userIcon);
    // These are asset-path fields (populated by saveAsset()), not the adjacent
    // base64 fields — see Agents/Roadmap.md Phase 1, item 1. NAIImgConfig's
    // `reference_image_multiple` is deliberately not included here: nothing
    // currently populates it via saveAsset(), so it holds no asset reference
    // to protect.
    addUncleanable(db.NAIImgConfig?.image);
    addUncleanable(db.NAIImgConfig?.character_image);
    addUncleanable(db.wavespeedImage?.reference_image);
    const chars = options?.chars ?? db.characters

    for (let cha of chars) {
        if (cha.image) {
            addUncleanable(cha.image);
        }
        if (cha.emotionImages) {
            for (const em of cha.emotionImages) {
                addUncleanable(em[1]);
            }
        }
        // additionalAssets/vits are declared on BOTH `character` and `groupChat`
        // (the latter's fields are unused by any current write path — see
        // Agents/Roadmap.md Phase 0.5 — but are still real fields on the type), so
        // they're protected here unconditionally rather than being skipped for
        // groups: if anything ever does populate them on a group chat, the boot-time
        // GC sweep below must not delete the referenced asset out from under it.
        if (cha.additionalAssets) {
            for (const em of cha.additionalAssets) {
                addUncleanable(em[1]);
            }
        }
        if (cha.vits) {
            const keys = Object.keys(cha.vits.files);
            for (const key of keys) {
                const vit = cha.vits.files[key];
                addUncleanable(vit);
            }
        }
        // TTS reads this asset back directly with no fallback (src/ts/process/tts.ts),
        // so its deletion is real functional data loss, not just a stale preview.
        // Present on both `character` and `groupChat` (the latter typed `any`, same
        // "lazy hack for typechecking" category as vits/additionalAssets above), so
        // protected unconditionally for the same reason those are.
        addUncleanable(cha.gptSoVitsConfig?.ref_audio_data?.assetId);
        if (cha.type !== 'group') {
            if (cha.ccAssets) {
                for (const asset of cha.ccAssets) {
                    addUncleanable(asset.uri);
                }
            }
        }
    }

    if (db.modules) {
        for (const module of db.modules) {
            const assets = module.assets
            if (assets) {
                for (const asset of assets) {
                    addUncleanable(asset[1])
                }
            }
            if(module.icon){
                addUncleanable(module.icon)
            }
        }
    }

    if (db.personas) {
        db.personas.map((v) => {
            addUncleanable(v.icon);

            if(v.embeddedModule){
                const assets = v.embeddedModule.assets
                if (assets) {
                    for (const asset of assets) {
                        addUncleanable(asset[1])
                    }
                }
                if(v.embeddedModule.icon){
                    addUncleanable(v.embeddedModule.icon)
                }
            }
        });
    }

    if (db.characterOrder) {
        db.characterOrder.forEach((item) => {
            if (typeof item === 'object' && 'imgFile' in item) {
                addUncleanable(item.imgFile);
            }
        })
    }
    return Array.from(uncleanable);
}


/**
 * Replaces database resources with the provided replacer object.
 * 
 * @param {Database} db - The database object containing resources to be replaced.
 * @param {{[key: string]: string}} replacer - An object mapping original resource keys to their replacements.
 * @returns {Database} - The updated database object with replaced resources.
 */
export function replaceDbResources(db: Database, replacer: { [key: string]: string }): Database {
    /**
     * Replaces a given data string with its corresponding value from the replacer object.
     * 
     * @param {string} data - The data string to be replaced.
     * @returns {string} - The replaced data string or the original data if no replacement is found.
     */
    function replaceData(data: string): string {
        if (!data) {
            return data;
        }
        return replacer[data] ?? data;
    }

    db.customBackground = replaceData(db.customBackground);
    db.userIcon = replaceData(db.userIcon);

    for (const cha of db.characters) {
        if (cha.image) {
            cha.image = replaceData(cha.image);
        }
        if (cha.emotionImages) {
            for (let i = 0; i < cha.emotionImages.length; i++) {
                cha.emotionImages[i][1] = replaceData(cha.emotionImages[i][1]);
            }
        }
        if (cha.type !== 'group') {
            if (cha.additionalAssets) {
                for (let i = 0; i < cha.additionalAssets.length; i++) {
                    cha.additionalAssets[i][1] = replaceData(cha.additionalAssets[i][1]);
                }
            }
        }
    }
    return db;
}

/**
 * Checks and updates the character order in the database.
 * Ensures that all characters are properly ordered and removes any invalid entries.
 */
export function checkCharOrder() {
    DBState.db.characterOrder = DBState.db.characterOrder ?? []
    const ordered = new Set<string>()
    for (let i = 0; i < DBState.db.characterOrder.length; i++) {
        const folder = DBState.db.characterOrder[i]
        if (typeof (folder) !== 'string' && folder) {
            for (const f of folder.data) {
                ordered.add(f)
            }
        }
        if (typeof (folder) === 'string') {
            ordered.add(folder)
        }
    }

    const charIdSet = new Set<string>()

    for (let i = 0; i < DBState.db.characters.length; i++) {
        const char = DBState.db.characters[i]
        const charId = char.chaId
        if (!char.trashTime) {
            charIdSet.add(charId)
        }
        if (!ordered.has(charId)) {
            if (charId !== '§temp' && charId !== '§playground' && !char.trashTime) {
                DBState.db.characterOrder.push(charId)
            }
        }
    }


    for (let i = 0; i < DBState.db.characterOrder.length; i++) {
        const data = DBState.db.characterOrder[i]
        if (typeof (data) !== 'string') {
            if (!data) {
                DBState.db.characterOrder.splice(i, 1)
                i--;
                continue
            }
            if (data.data.length === 0) {
                DBState.db.characterOrder.splice(i, 1)
                i--;
                continue
            }
            for (let i2 = 0; i2 < data.data.length; i2++) {
                const data2 = data.data[i2]
                if (!charIdSet.has(data2)) {
                    data.data.splice(i2, 1)
                    i2--;
                }
            }
            DBState.db.characterOrder[i] = data
        }
        else {
            if (!charIdSet.has(data)) {
                DBState.db.characterOrder.splice(i, 1)
                i--;
            }
        }
    }
}

/**
 * Retrieves the request log as a formatted string.
 * 
 * @returns {string} The formatted request log.
 */
export function getRequestLog() {
    let logString = ''
    const b = '\n\`\`\`json\n'
    const bend = '\n\`\`\`\n'

    for (const log of fetchLog) {
        logString += `## ${log.date}\n\n* Request URL\n\n${b}${log.url}${bend}\n\n* Request Body\n\n${b}${log.body}${bend}\n\n* Request Header\n\n${b}${log.header}${bend}\n\n`
            + `* Response Body\n\n${b}${log.response}${bend}\n\n* Response Success\n\n${b}${log.success}${bend}\n\n`
    }
    return logString
}

/**
 * Retrieves the fetch logs array.
 *
 * @returns {fetchLog[]} The fetch logs array.
 */
export function getFetchLogs() {
    return fetchLog
}

/**
 * Opens a URL in the appropriate environment.
 * 
 * @param {string} url - The URL to open.
 */
export function openURL(url: string) {
    if (isTauri) {
        open(url)
    }
    else {
        window.open(url, "_blank")
    }
}

/**
 * Converts FormData to a URL-encoded string.
 * 
 * @param {FormData} formData - The FormData to convert.
 * @returns {string} The URL-encoded string.
 */
function formDataToString(formData: FormData): string {
    const params: string[] = [];

    for (const [name, value] of formData.entries()) {
        params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value.toString())}`);
    }

    return params.join('&');
}

/**
 * A writer class for Tauri environment.
 */
export class TauriWriter {
    path: string
    firstWrite: boolean = true

    /**
     * Creates an instance of TauriWriter.
     * 
     * @param {string} path - The file path to write to.
     */
    constructor(path: string) {
        this.path = path
    }

    /**
     * Writes data to the file.
     * 
     * @param {Uint8Array} data - The data to write.
     */
    async write(data: Uint8Array) {
        await writeFile(this.path, data, {
            append: !this.firstWrite
        })
        this.firstWrite = false
    }

    /**
     * Closes the writer. (No operation for TauriWriter)
     */
    async close() {
        // do nothing
    }
}


/**
 * Class representing a local writer.
 */
export class LocalWriter {
    writer: WritableStreamDefaultWriter | TauriWriter

    /**
     * Initializes the writer.
     * 
     * @param {string} [name='Binary'] - The name of the file.
     * @param {string[]} [ext=['bin']] - The file extensions.
     * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating success.
     */
    async init(name = 'Binary', ext = ['bin']): Promise<boolean> {
        if (isTauri) {
            const filePath = await save({
                filters: [{
                    name: name,
                    extensions: ext
                }]
            });
            if (!filePath) {
                return false
            }
            this.writer = new TauriWriter(filePath)
            return true
        }
        const writableStream = streamSaver.createWriteStream(name + '.' + ext[0])
        this.writer = writableStream.getWriter()
        return true
    }

    /**
     * Writes backup data to the file.
     * 
     * @param {string} name - The name of the backup.
     * @param {Uint8Array} data - The data to write.
     */
    async writeBackup(name: string, data: Uint8Array): Promise<void> {
        const encodedName = new TextEncoder().encode(getBasename(name))
        const nameLength = new Uint32Array([encodedName.byteLength])
        await this.writer.write(new Uint8Array(nameLength.buffer))
        await this.writer.write(encodedName)
        const dataLength = new Uint32Array([data.byteLength])
        await this.writer.write(new Uint8Array(dataLength.buffer))
        await this.writer.write(data)
    }

    /**
     * Writes data to the file.
     * 
     * @param {Uint8Array} data - The data to write.
     */
    async write(data: Uint8Array): Promise<void> {
        await this.writer.write(data)
    }

    /**
     * Closes the writer.
     */
    async close(): Promise<void> {
        await this.writer.close()
    }
}

/**
 * Class representing a virtual writer.
 */
export class VirtualWriter {
    buf = new AppendableBuffer()

    /**
     * Writes data to the buffer.
     * 
     * @param {Uint8Array} data - The data to write.
     */
    write(data: Uint8Array): void {
        this.buf.append(data)
    }

    /**
     * Closes the writer. (No operation for VirtualWriter)
     */
    close(): void {
        // do nothing
    }
}

/**
 * Index for fetch operations.
 * @type {number}
 */
let fetchIndex = 0

/**
 * Stores native fetch data.
 * @type {{ [key: string]: StreamedFetchChunk[] }}
 */
let nativeFetchData: { [key: string]: StreamedFetchChunk[] } = {}

/**
 * Interface representing a streamed fetch chunk data.
 * @interface
 */
interface StreamedFetchChunkData {
    type: 'chunk',
    body: string,
    id: string
}

/**
 * Interface representing a streamed fetch header data.
 * @interface
 */
interface StreamedFetchHeaderData {
    type: 'headers',
    body: { [key: string]: string },
    id: string,
    status: number
}

/**
 * Interface representing a streamed fetch end data.
 * @interface
 */
interface StreamedFetchEndData {
    type: 'end',
    id: string
}

/**
 * Type representing a streamed fetch chunk.
 * @typedef {StreamedFetchChunkData | StreamedFetchHeaderData | StreamedFetchEndData} StreamedFetchChunk
 */
type StreamedFetchChunk = StreamedFetchChunkData | StreamedFetchHeaderData | StreamedFetchEndData

/**
 * Interface representing a streamed fetch plugin.
 * @interface
 */
interface StreamedFetchPlugin {
    /**
     * Performs a streamed fetch operation.
     * @param {Object} options - The options for the fetch operation.
     * @param {string} options.id - The ID of the fetch operation.
     * @param {string} options.url - The URL to fetch.
     * @param {string} options.body - The body of the fetch request.
     * @param {{ [key: string]: string }} options.headers - The headers of the fetch request.
     * @returns {Promise<{ error: string, success: boolean }>} - The result of the fetch operation.
     */
    streamedFetch(options: { id: string, url: string, body: string, headers: { [key: string]: string } }): Promise<{ "error": string, "success": boolean }>;

    /**
     * Adds a listener for the specified event.
     * @param {string} eventName - The name of the event.
     * @param {(data: StreamedFetchChunk) => void} listenerFunc - The function to call when the event is triggered.
     */
    addListener(eventName: 'streamed_fetch', listenerFunc: (data: StreamedFetchChunk) => void): void;
}

/**
 * Indicates whether streamed fetch listening is active.
 * @type {boolean}
 */
let streamedFetchListening = false

/**
 * The streamed fetch plugin instance.
 * @type {StreamedFetchPlugin | undefined}
 */
let capStreamedFetch: StreamedFetchPlugin | undefined

if (isTauri) {
    listen('streamed_fetch', (event) => {
        try {
            const parsed = JSON.parse(event.payload as string)
            const id = parsed.id
            nativeFetchData[id]?.push(parsed)
        } catch (error) {
            console.error(error)
        }
    }).then((v) => {
        streamedFetchListening = true
    })
}

/**
 * A class to manage a buffer that can be appended to and deappended from.
 */
export class AppendableBuffer {
    deapended: number = 0
    #buffer: Uint8Array
    #byteLength: number = 0

    /**
     * Creates an instance of AppendableBuffer.
     */
    constructor() {
        this.#buffer = new Uint8Array(128)
    }

    get buffer(): Uint8Array {
        return this.#buffer.slice(0, this.#byteLength)
    }

    /**
     * Appends data to the buffer.
     * @param {Uint8Array} data - The data to append.
     */
    append(data: Uint8Array) {
        // New way (faster)
        const requiredLength = this.#byteLength + data.length
        if (this.#buffer.byteLength < requiredLength) {
            let newLength = this.#buffer.byteLength * 2
            while (newLength < requiredLength) {
                newLength *= 2
            }
            const newBuffer = new Uint8Array(newLength)
            newBuffer.set(this.#buffer)
            this.#buffer = newBuffer
        }
        this.#buffer.set(data, this.#byteLength)
        this.#byteLength += data.length
    }

    /**
     * Deappends a specified length from the buffer.
     * @param {number} length - The length to deappend.
     */
    deappend(length: number) {
        this.#buffer = this.#buffer.slice(length)
        this.deapended += length
        this.#byteLength -= length
    }

    /**
     * Slices the buffer from start to end.
     * @param {number} start - The start index.
     * @param {number} end - The end index.
     * @returns {Uint8Array} - The sliced buffer.
     */
    slice(start: number, end: number) {
        return this.buffer.slice(start - this.deapended, end - this.deapended)
    }

    /**
     * Gets the total length of the buffer including deappended length.
     * @returns {number} - The total length.
     */
    length() {
        return this.#byteLength + this.deapended
    }

    /**
     * Clears the buffer.
     */
    clear() {
        this.#buffer = new Uint8Array(128)
        this.#byteLength = 0
        this.deapended = 0
    }
}

/**
 * Pipes the fetch log to a readable stream.
 * @param {number} fetchLogIndex - The index of the fetch log.
 * @param {ReadableStream<Uint8Array>} readableStream - The readable stream to pipe.
 * @returns {ReadableStream<Uint8Array>} - The new readable stream.
 */
const pipeFetchLog = (fetchLogIndex: number, readableStream: ReadableStream<Uint8Array>) => {
    
    const splited = readableStream.tee();
    
    (async () => {
        const text = await (new Response(splited[0])).text()
        fetchLog[fetchLogIndex].response = text
    })()
    
    return splited[1]
}

async function fetchViaProxyJobWs(url: string, arg: {
    body: Uint8Array,
    headers?: { [key: string]: string },
    method: "POST" | "GET" | "PUT" | "DELETE",
    signal?: AbortSignal,
    requestTimeoutMs?: number,
    chatId?: string,
    fetchLogIndex?: number | null
}): Promise<Response> {
    const auth = await getNodeServerProxyAuth();

    const requestSignal = arg.signal;
    const baseUrl = getProxyStreamJobBaseUrl();

    let jobId = '';
    const createRes = await fetch(`${baseUrl}/proxy-stream-jobs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'risu-auth': auth
        },
        body: JSON.stringify({
            url,
            method: arg.method,
            headers: arg.headers ?? {},
            bodyBase64: Buffer.from(arg.body).toString('base64'),
            timeoutMs: arg.requestTimeoutMs,
            heartbeatSec: defaultProxyJobHeartbeatSec
        }),
        signal: requestSignal
    });

    if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Proxy stream job creation failed: ${createRes.status} ${errText}`);
    }

    const created = await createRes.json() as { jobId?: string };
    if (!created.jobId) {
        throw new Error('Proxy stream job creation returned no jobId');
    }
    jobId = created.jobId;

    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${location.host}/proxy-stream-jobs/${encodeURIComponent(jobId)}/ws?risu-auth=${encodeURIComponent(auth)}`;

    let headersReady = false;
    let status = 200;
    let responseHeaders: HeadersInit = { 'content-type': 'text/event-stream' };
    let settled = false;
    let resolveHeaders: () => void = () => {};
    const waitHeaders = new Promise<void>((resolve) => {
        resolveHeaders = resolve;
    });
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const encoder = new TextEncoder();

    const ws = new WebSocket(wsUrl);
    const readable = new ReadableStream<Uint8Array>({
        start(controller) {
            streamController = controller;
        },
        cancel() {
            try {
                ws.close();
            } catch {
                // no-op
            }
        }
    });
    const pipedReadable = arg.fetchLogIndex != null ? pipeFetchLog(arg.fetchLogIndex, readable) : readable;

    const ensureHeadersReady = () => {
        if (!headersReady) {
            headersReady = true;
            resolveHeaders();
        }
    };

    const closeAndEnd = () => {
        if (settled) {
            return;
        }
        settled = true;
        if (streamController) {
            try {
                streamController.close();
            } catch {
                // no-op
            }
        }
        try {
            ws.close();
        } catch {
            // no-op
        }
    };

    ws.onmessage = (event) => {
        const parsed = parseProxyJobWsEvent(typeof event.data === 'string' ? event.data : '');
        if (!parsed || !streamController) {
            return;
        }
        switch (parsed.type) {
            case 'job_accepted':
            case 'ping':
                return;
            case 'upstream_headers':
                status = parsed.status;
                responseHeaders = parsed.headers ?? {};
                ensureHeadersReady();
                return;
            case 'chunk':
                ensureHeadersReady();
                streamController.enqueue(decodeProxyJobWsChunk(parsed.dataBase64));
                return;
            case 'error': {
                status = parsed.status ?? 502;
                responseHeaders = { 'content-type': 'text/plain; charset=utf-8' };
                ensureHeadersReady();
                const msg = formatProxyStreamErrorMessage(parsed.status, parsed.message);
                streamController.enqueue(encoder.encode(msg));
                closeAndEnd();
                return;
            }
            case 'done':
                ensureHeadersReady();
                closeAndEnd();
                return;
        }
    };

    ws.onerror = () => {
        if (!streamController) {
            return;
        }
        status = 502;
        responseHeaders = { 'content-type': 'text/plain; charset=utf-8' };
        ensureHeadersReady();
        streamController.enqueue(encoder.encode('Proxy WebSocket stream error'));
        closeAndEnd();
    };

    ws.onclose = () => {
        if (!headersReady) {
            status = 502;
            responseHeaders = { 'content-type': 'text/plain; charset=utf-8' };
            ensureHeadersReady();
        }
        closeAndEnd();
    };

    const abortHandler = () => {
        status = 499;
        responseHeaders = { 'content-type': 'text/plain; charset=utf-8' };
        ensureHeadersReady();
        if (streamController && !settled) {
            streamController.enqueue(encoder.encode('Aborted'));
        }
        void fetch(`${baseUrl}/proxy-stream-jobs/${encodeURIComponent(jobId)}`, {
            method: 'DELETE',
            headers: {
                'risu-auth': auth
            }
        }).catch(() => {});
        closeAndEnd();
    };
    if (requestSignal?.aborted) {
        abortHandler();
    }
    else {
        requestSignal?.addEventListener('abort', abortHandler, { once: true });
    }

    await waitHeaders;
    requestSignal?.removeEventListener('abort', abortHandler);
    return new Response(pipedReadable, {
        status,
        headers: new Headers(responseHeaders)
    });
}

/**
 * Fetches data from a given URL using native fetch or through a proxy.
 * @param {string} url - The URL to fetch data from.
 * @param {Object} arg - The arguments for the fetch request.
 * @param {string} arg.body - The body of the request.
 * @param {Object} [arg.headers] - The headers of the request.
 * @param {string} [arg.method="POST"] - The HTTP method of the request.
 * @param {AbortSignal} [arg.signal] - The signal to abort the request.
 * @param {boolean} [arg.useRisuTk] - Whether to use Risu token.
 * @param {string} [arg.chatId] - The chat ID associated with the request.
 * @returns {Promise<Object>} - A promise that resolves to an object containing the response body, headers, and status.
 * @returns {ReadableStream<Uint8Array>} body - The response body as a readable stream.
 * @returns {Headers} headers - The response headers.
 * @returns {number} status - The response status code.
 * @throws {Error} - Throws an error if the request is aborted or if there is an error in the response.
 */
export async function fetchNative(url: string, arg: {
    body?: string | Uint8Array | ArrayBuffer,
    headers?: { [key: string]: string },
    method?: "POST" | "GET" | "PUT" | "DELETE",
    signal?: AbortSignal,
    useRisuTk?: boolean,
    chatId?: string
    interceptor?: string
    logFetch?: boolean
    requestTimeoutMs?: number
    networkRoute?: 'auto' | 'local_network'
}): Promise<Response> {

    const useInterceptor = !!arg.interceptor
    console.log(arg.body, 'body')
    if (arg.body === undefined && (arg.method === 'POST' || arg.method === 'PUT')) {
        throw new Error('Body is required for POST and PUT requests')
    }

    arg.method = arg.method ?? 'POST'

    let headers = arg.headers ?? {}
    let realBody: Uint8Array

    if (arg.method === 'GET' || arg.method === 'DELETE') {
        realBody = undefined
    }
    else if (typeof arg.body === 'string') {
        let body: string = arg.body
        if(useInterceptor) {
            for (const interceptor of bodyIntercepterStore) {
                try {
                    body = await interceptor.callback(body, arg.interceptor) || body
                }
                catch (e) {
                    console.error(e)
                }
            }
        }
        realBody = new TextEncoder().encode(body)
    }
    else if (arg.body instanceof Uint8Array) {
        realBody = arg.body
    }
    else if (arg.body instanceof ArrayBuffer) {
        realBody = new Uint8Array(arg.body)
    }
    else {
        throw new Error('Invalid body type')
    }

    const db = getDatabase()
    const useLocalNetworkRoute = arg.networkRoute === 'local_network' && isLocalNetworkUrl(url)
    if (useLocalNetworkRoute && !isTauri && !isNodeServer) {
        throw new Error(webLocalNetworkBlockedMessage)
    }
    let throughProxy = (!isTauri) && (!isNodeServer) && (!db.usePlainFetch)
    if (useLocalNetworkRoute) {
        if (isNodeServer) {
            throughProxy = true
        }
        else if (isTauri) {
            throughProxy = false
        }
    }
    const timeoutSignal = buildTimeoutSignal(arg.signal, arg.requestTimeoutMs)
    const requestSignal = timeoutSignal.signal
    const shouldLogFetch = arg.logFetch ?? true
    let fetchLogIndex: number | null = null
    if (shouldLogFetch) {
        fetchLogIndex = addFetchLog({
            body: new TextDecoder().decode(realBody),
            headers: arg.headers,
            response: 'Streamed Fetch',
            success: true,
            url: url,
            resType: 'stream',
            chatId: arg.chatId,
        })
    }
    try {
        if (window.userScriptFetch && !throughProxy) {
            return await window.userScriptFetch(url, {
            body: realBody as any,
            headers: headers,
            method: arg.method,
            signal: requestSignal
        })
        }
        else if (isTauri) {
        fetchIndex++
        if (requestSignal && requestSignal.aborted) {
            throw new Error('aborted')
        }
        if (fetchIndex >= 100000) {
            fetchIndex = 0
        }
        let fetchId = fetchIndex.toString().padStart(5, '0')
        nativeFetchData[fetchId] = []
        let resolved = false

        let error = ''
        while (!streamedFetchListening) {
            await sleep(100)
        }
        if (isTauri) {
            invoke('streamed_fetch', {
                id: fetchId,
                url: url,
                headers: JSON.stringify(headers),
                body: realBody ? Buffer.from(realBody).toString('base64') : '',
                method: arg.method,
                timeout_secs: arg.requestTimeoutMs ? Math.max(1, Math.ceil(arg.requestTimeoutMs / 1000)) : undefined
            }).then((res) => {
                try {
                    const parsedRes = JSON.parse(res as string)
                    if (!parsedRes.success) {
                        error = parsedRes.body
                        resolved = true
                    }
                } catch (e) {
                    // Error properties (message/name/stack) are non-enumerable, so
                    // JSON.stringify(e) returns "{}" and discards the real cause.
                    error = e instanceof Error
                        ? (e.message || e.name || 'streamed_fetch parse failed')
                        : String(e)
                    resolved = true
                }
            })
        }
        else if (capStreamedFetch) {
            capStreamedFetch.streamedFetch({
                id: fetchId,
                url: url,
                headers: headers,
                body: realBody ? Buffer.from(realBody).toString('base64') : '',
            }).then((res) => {
                if (!res.success) {
                    error = res.error
                    resolved = true
                }
            })
        }

        let resHeaders: { [key: string]: string } = null
        let status = 400

        const tauriReadableStream = new ReadableStream<Uint8Array>({
            async start(controller) {
                while (!resolved || nativeFetchData[fetchId].length > 0) {
                    if (nativeFetchData[fetchId].length > 0) {
                        const data = nativeFetchData[fetchId].shift()
                        if (data.type === 'chunk') {
                            const chunk = Buffer.from(data.body, 'base64')
                            controller.enqueue(chunk as unknown as Uint8Array)
                        }
                        if (data.type === 'headers') {
                            resHeaders = data.body
                            status = data.status
                        }
                        if (data.type === 'end') {
                            resolved = true
                        }
                    }
                    await sleep(10)
                }
                controller.close()
            }
        })

        let readableStream = tauriReadableStream
        if (shouldLogFetch && fetchLogIndex !== null) {
            readableStream = pipeFetchLog(fetchLogIndex, tauriReadableStream)
        }

        while (resHeaders === null && !resolved) {
            await sleep(10)
        }

        if (resHeaders === null) {
            resHeaders = {}
        }

        if (error !== '') {
            throw new Error(error)
        }

        return new Response(readableStream, {
            headers: new Headers(resHeaders),
            status: status
        })


    }
    else if (throughProxy) {
        const useProxyJobWs = isNodeServer
            && arg.interceptor === 'openai_streaming'
            && arg.method === 'POST'
            && useLocalNetworkRoute;
        const nodeProxyAuth = isNodeServer ? await getNodeServerProxyAuth() : null;

        if (useProxyJobWs) {
            try {
                return await fetchViaProxyJobWs(url, {
                    body: realBody,
                    headers,
                    method: arg.method,
                    signal: requestSignal,
                    requestTimeoutMs: arg.requestTimeoutMs,
                    chatId: arg.chatId,
                    fetchLogIndex
                });
            } catch (wsErr) {
                console.warn('[ProxyJobWS] fallback to /proxy2 due to error:', wsErr);
            }
        }

        const r = await fetch(getProxy2Url(), {
            body: realBody as any,
            headers: arg.useRisuTk ? {
                "risu-header": encodeURIComponent(JSON.stringify(headers)),
                "risu-url": encodeURIComponent(url),
                "Content-Type": "application/json",
                "x-risu-tk": "use",
                ...(arg.requestTimeoutMs && { "risu-timeout-ms": Math.max(1, Math.floor(arg.requestTimeoutMs)).toString() }),
                ...(nodeProxyAuth ? { "risu-auth": nodeProxyAuth } : {}),
                ...(DBState?.db?.requestLocation && { "risu-location": DBState.db.requestLocation }),
            } : {
                "risu-header": encodeURIComponent(JSON.stringify(headers)),
                "risu-url": encodeURIComponent(url),
                "Content-Type": "application/json",
                ...(arg.requestTimeoutMs && { "risu-timeout-ms": Math.max(1, Math.floor(arg.requestTimeoutMs)).toString() }),
                ...(nodeProxyAuth ? { "risu-auth": nodeProxyAuth } : {}),
                ...(DBState?.db?.requestLocation && { "risu-location": DBState.db.requestLocation }),
            },
            method: arg.method,
            signal: requestSignal
        })

        return new Response(r.body, {
            headers: r.headers,
            status: r.status
        })
    }
    else {
        return await fetch(url, {
            body: realBody as any,
            headers: headers,
            method: arg.method,
            signal: requestSignal,
        })
    }
    } finally {
        timeoutSignal.cleanup()
    }
}

/**
 * Converts a ReadableStream of Uint8Array to a text string.
 * 
 * @param {ReadableStream<Uint8Array>} stream - The readable stream to convert.
 * @returns {Promise<string>} A promise that resolves to the text content of the stream.
 */
export function textifyReadableStream(stream: ReadableStream<Uint8Array>) {
    return new Response(stream).text()
}

/**
 * Toggles the fullscreen mode of the document.
 * If the document is currently in fullscreen mode, it exits fullscreen.
 * If the document is not in fullscreen mode, it requests fullscreen with navigation UI hidden.
 */
export function toggleFullscreen() {
    const fullscreenElement = document.fullscreenElement
    fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({
        navigationUI: "hide"
    })
}

/**
 * Removes non-Latin characters from a string, replaces multiple spaces with a single space, and trims the string.
 * 
 * @param {string} data - The input string to be processed.
 * @returns {string} The processed string with non-Latin characters removed, multiple spaces replaced by a single space, and trimmed.
 */
export function trimNonLatin(data: string) {
    return data.replace(/[^\x00-\x7F]/g, "")
        .replace(/ +/g, ' ')
        .trim()
}

/**
 * A class that provides a blank writer implementation.
 * 
 * This class is used to provide a no-op implementation of a writer, making it compatible with other writer interfaces.
 */
export class BlankWriter {
    constructor() {
    }

    /**
     * Initializes the writer.
     * 
     * This method does nothing and is provided for compatibility with other writer interfaces.
     */
    async init() {
        //do nothing, just to make compatible with other writer
    }

    /**
     * Writes data to the writer.
     * 
     * This method does nothing and is provided for compatibility with other writer interfaces.
     * 
     * @param {string} key - The key associated with the data.
     * @param {Uint8Array|string} data - The data to be written.
     */
    async write(key: string, data: Uint8Array | string) {
        //do nothing, just to make compatible with other writer
    }

    /**
     * Ends the writing process.
     * 
     * This method does nothing and is provided for compatibility with other writer interfaces.
     */
    async end() {
        //do nothing, just to make compatible with other writer
    }
}

export async function loadInternalBackup() {

    const keys = isTauri ? (await readDir('database', { baseDir: BaseDirectory.AppData })).map((v) => {
        return v.name
    }) : (await forageStorage.keys())
    let internalBackups: string[] = []
    for (const key of keys) {
        if (key.includes('dbbackup-')) {
            internalBackups.push(key)
        }
    }

    const selectOptions = [
        'Cancel',
        ...(internalBackups.map((a) => {
            return (new Date(parseInt(a.replace('database/dbbackup-', '').replace('dbbackup-', '')) * 100)).toLocaleString()
        }))
    ]

    const alertResult = parseInt(
        await alertSelect(selectOptions)
    ) - 1

    if (alertResult === -1) {
        return
    }

    const selectedBackup = internalBackups[alertResult]

    const data = isTauri ? (
        await readFile('database/' + selectedBackup, { baseDir: BaseDirectory.AppData })
    ) : (await forageStorage.getItem(selectedBackup))

    setDatabase(
        await decodeRisuSave(Buffer.from(data) as unknown as Uint8Array)
    )

    alertNormal('Loaded backup')



}

/**
 * A debugging class for performance measurement.
*/

export class PerformanceDebugger {
    kv: { [key: string]: number[] } = {}
    startTime: number
    endTime: number

    /**
     * Starts the timing measurement.
    */
    start() {
        this.startTime = performance.now()
    }

    /**
     * Ends the timing measurement and records the time difference.
     * 
     * @param {string} key - The key to associate with the recorded time.
    */
    endAndRecord(key: string) {
        this.endTime = performance.now()
        if (!this.kv[key]) {
            this.kv[key] = []
        }
        this.kv[key].push(this.endTime - this.startTime)
    }

    /**
     * Ends the timing measurement, records the time difference, and starts a new timing measurement.
     * 
     * @param {string} key - The key to associate with the recorded time.
    */
    endAndRecordAndStart(key: string) {
        this.endAndRecord(key)
        this.start()
    }

    /**
     * Logs the average time for each key to the console.
    */
    log() {
        let table: { [key: string]: number } = {}

        for (const key in this.kv) {
            table[key] = this.kv[key].reduce((a, b) => a + b, 0) / this.kv[key].length
        }


        console.table(table)
    }

    combine(other: PerformanceDebugger) {
        for (const key in other.kv) {
            if (!this.kv[key]) {
                this.kv[key] = []
            }
            this.kv[key].push(...other.kv[key])
        }
    }
}

export function getLanguageCodes() {
    let languageCodes: {
        code: string
        name: string
    }[] = []

    for (let i = 0x41; i <= 0x5A; i++) {
        for (let j = 0x41; j <= 0x5A; j++) {
            languageCodes.push({
                code: String.fromCharCode(i) + String.fromCharCode(j),
                name: ''
            })
        }
    }

    languageCodes = languageCodes.map(v => {
        return {
            code: v.code.toLocaleLowerCase(),
            name: new Intl.DisplayNames([
                DBState.db.language === 'cn' ? 'zh' : DBState.db.language
            ], {
                type: 'language',
                fallback: 'none'
            }).of(v.code)
        }
    }).filter((a) => {
        return a.name
    }).sort((a, b) => a.name.localeCompare(b.name))

    return languageCodes
}

export function getVersionString(): string {
    let versionString = appVer
    if(appSubVer) {
        versionString += '-' + appSubVer
    }
    if (import.meta.env.VITE_RISU_NIGHTLY_BUILD === 'TRUE') {
        versionString = 'Nightly Build ' + import.meta.env.VITE_RISU_BUILD_TIME
    }
    if (window.location.hostname === 'stable.risuai.xyz') {
        versionString += ' (Stable)';
    }
    return versionString
}

export function toGetter<T extends object>(
    getterFn: () => T,
    args?: {
        //blocks this.children from being accessed
        restrictChildren:string[]
    }
): T {

    const dummyTarget = () => { };

    return new Proxy(dummyTarget, {
        get(target, prop, receiver) {

            const realInstance = getterFn();
            
            if (args?.restrictChildren && args.restrictChildren.includes(prop as string)) {
                throw new Error(`Access to property '${String(prop)}' is restricted`);
            }

            if (realInstance === null || realInstance === undefined) {
                return (realInstance as any)[prop];
            }

            const value = Reflect.get(realInstance as object, prop);

            if (typeof value === 'function') {
                return value.bind(realInstance);
            }

            return value;
        },

        set(target, prop, value, receiver) {

            if(args?.restrictChildren && args.restrictChildren.includes(prop as string)) {
                throw new Error(`Access to property '${String(prop)}' is restricted`);
            }
            const realInstance = getterFn();
            return Reflect.set(realInstance as object, prop, value, receiver);
        },

        has(target, prop) {
            const realInstance = getterFn();
            return Reflect.has(realInstance as object, prop);
        },

        ownKeys(target) {
            const realInstance = getterFn();
            return Reflect.ownKeys(realInstance as object);
        },

        construct(target, argArray, newTarget) {
            const realInstance = getterFn() as any;
            return new realInstance(...argArray);
        },

        deleteProperty(target, prop) {
            const realInstance = getterFn();
            return Reflect.deleteProperty(realInstance as object, prop);
        },

        getPrototypeOf() {
            const realInstance = getterFn();
            return Reflect.getPrototypeOf(realInstance as object);
        }
    }) as unknown as T;
}

const countriesWithAiLaw = new Set<string>([

    // EU
    // AI Act
    // https://artificialintelligenceact.eu/
    
    "AT",
    "BE",
    "BG",
    "HR",
    "CY",
    "CZ",
    "DK",
    "EE",
    "FI",
    "FR",
    "DE",
    "EL",
    "GR",
    "HU",
    "IE",
    "IT",
    "LV",
    "LT",
    "LU",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SK",
    "SI",
    "ES",
    "SE",

    //China 
    //Measures for Labeling of AI-Generated Synthetic Content
    // 关于印发《人工智能生成合成内容标识办法》的通知 
    // https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm
    "CN",

    //Although CN Law doesn't apply, just in case
    "HK",
    "MO",

    //TW isn't under mainland china jurisdiction
    //de facto, de jure in TW law, unlike HK and MO,
    //So we don't include it for now
    //"TW", 

    // Republic of Korea
    // AI Basic Act
    // 인공지능 발전과 신뢰 기반 조성 등에 관한 기본법
    // https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5%20%EB%B0%9C%EC%A0%84%EA%B3%BC%20%EC%8B%A0%EB%A2%B0%20%EA%B8%B0%EB%B0%98%20%EC%A1%B0%EC%84%B1%20%EB%93%B1%EC%97%90%20%EA%B4%80%ED%95%9C%20%EA%B8%B0%EB%B3%B8%EB%B2%95/(20676,20250121)
    "KR",

    // Vietnam
    // Digital Tech Law
    // Luật Công nghệ số
    "VN",

])

export function aiLawApplies(): boolean {

    //TODO: implement actual logic
    //lets now assume it always applies
    //so we don't have legal issues later

    return true
}

export function aiWatermarkingLawApplies(): boolean {

    //TODO: implement actual logic
    //lets now assume it is false for now,
    //becuase very few countries have it for now
    return false
}

export const chatFoldedState = $state<{
    data: null| {
        targetCharacterId: string,
        targetChatId: string,
        targetMessageId: string,
    }
}>({
    data: null
})

//Since its exported, we cannot use $derived here
export let chatFoldedStateMessageIndex = $state({
    index: -1
})

$effect.root(() => {
    $effect(() => {
        if(!chatFoldedState.data){
            return
        }
        const char = DBState.db.characters[selIdState.selId]
        const chat = char.chats[char.chatPage]
        if(chatFoldedState.data.targetCharacterId !== char.chaId){
            chatFoldedState.data = null
        }
        if(chatFoldedState.data.targetChatId !== chat.id){
            chatFoldedState.data = null
        }
    })

    $effect(() => {
        if(chatFoldedState.data === null){
            chatFoldedStateMessageIndex.index = -1
            return
        }
        const char = DBState.db.characters[selIdState.selId]
        const chat = char.chats[char.chatPage]
        const messageIndex = chat.message.findIndex((v) => {
            return chatFoldedState.data?.targetMessageId === v.chatId
        })
        if(messageIndex === -1){
            console.warn('Target message for folding id' + chatFoldedState.data?.targetMessageId + ' not found')
            chatFoldedStateMessageIndex.index = -1
            return
        }
        chatFoldedStateMessageIndex.index = messageIndex
    })
})

export function foldChatToMessage(targetMessageIdOrIndex: string | number) {
    let targetMessageId = ''
    if (typeof targetMessageIdOrIndex === 'number') {
        const char = getCurrentCharacter()
        const chat = char.chats[char.chatPage]
        const message = chat.message[targetMessageIdOrIndex]
        targetMessageId = message.chatId
    }
    else{
        targetMessageId = targetMessageIdOrIndex
    }
    const char = getCurrentCharacter()
    const chat = char.chats[char.chatPage]
    chatFoldedState.data = {
        targetCharacterId: char.chaId,
        targetChatId: chat.id,
        targetMessageId: targetMessageId,
    }
}

export function changeChatTo(IdOrIndex: string | number) {
    let index = -1
    if (typeof IdOrIndex === 'number') {
        index = IdOrIndex
    }

    if (typeof IdOrIndex === 'string') {
        const currentCharacter = getCurrentCharacter()
        index = currentCharacter.chats.findIndex((v) => {
            return v.id === IdOrIndex
        })
    }

    if(index === -1){
        return
    }

    DBState.db.characters[selIdState.selId].chatPage = index
    ReloadGUIPointer.set(Math.random())
}

export function createChatCopyName(originalName: string,type:'Copy'|'Branch'): string {
    let name = originalName.replaceAll(/\(((Copy|Branch)( \d+)?)\)$/g, '').trim()
    let copyIndex = 1
    let newName = `${name} (${type})`
    const char = getCurrentCharacter()
    while (char.chats.find((v) => v.name === newName)) {
        copyIndex++
        newName = `${name} (${type} ${copyIndex})`
    }
    return newName
}
