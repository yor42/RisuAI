import localforage from "localforage"
import { tabPresenceLockAcquired, acquireExclusiveStorageMigrationLock, recordStorageEpoch } from "../globalApi.svelte"
import { isNodeServer } from "src/ts/platform"
import { NodeStorage } from "./nodeStorage"
import { OpfsStorage } from "./opfsStorage"
import { alertStore } from "../alert"
import type { StorageTabLocks } from "./storageTabLocks"

/**
 * A boot copy that could not finish one way or another: `bootstrap.ts`
 * shows a notice for this reason once, after `setDatabase()` has picked the
 * boot language, then continues. `detail` (the failing error's own message)
 * is only ever set for `reason: 'error'`.
 */
export type OpfsSwitchNotice = {
    reason: 'quota' | 'error' | 'interrupted' | 'unsupported'
    detail?: string
}

/**
 * True for a `DOMException` named `QuotaExceededError`, or carrying either
 * legacy numeric quota code (22 in most browsers, 1014 in older Firefox).
 * This module's only dependency on `globalApi.svelte.ts` is its storage tab
 * locks bindings (`tabPresenceLockAcquired`, `acquireExclusiveStorageMigrationLock`,
 * `recordStorageEpoch`), so this check stays local rather than sharing that
 * module's copy of it.
 */
function isQuotaExceededError(error: unknown): boolean {
    return error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || (error as { code?: number }).code === 22 || (error as { code?: number }).code === 1014)
}

export class AutoStorage{
    /** Set once, in `Init()`, from a stale RisuAccount-sync profile's leftover `localStorage` flag. Boot (`loadData()` in `bootstrap.ts`) reads this to decide whether to show the stale-profile notice; `Init()` itself never acts on it. */
    staleAccountProfile:boolean = false

    /**
     * Set by `Init()` on every path where the OPFS boot copy could not put
     * this session on OPFS one way or another -- a quota or other
     * error mid-copy, the completion marker's own write failing, this tab
     * losing the race to become the migrator with nobody finishing either,
     * or Web Locks being entirely unsupported. `bootstrap.ts` reads and
     * shows this once; `Init()` posts and clears its own progress alert
     * during a copy, but never posts this notice itself, and always
     * releases every lock it took before returning.
     */
    opfsSwitchNotice: OpfsSwitchNotice | null = null

    realStorage:LocalForage|NodeStorage|OpfsStorage

    /**
     * The lock instance this AutoStorage was built against, or `undefined`
     * to default to production's single global instance (see
     * `storageTabLocks.ts`'s single-instance rule) -- read lazily, inside
     * `Init()`, never captured at construction time, since `forageStorage`
     * is constructed at module-evaluation time in `globalApi.svelte.ts`,
     * before that module's own `tabPresenceLockAcquired`/
     * `acquireExclusiveStorageMigrationLock`/`recordStorageEpoch` bindings
     * exist yet.
     */
    private readonly injectedLocks?: StorageTabLocks

    /**
     * The single in-flight Init() run, so a second caller in this tab never
     * starts a second copy. A decision-state read failure rejects this
     * promise and it is never replaced, so that rejection is kept for the
     * life of the page and nothing here retries the boot.
     */
    private initPromise: Promise<void> | null = null

    constructor(locks?: StorageTabLocks) {
        this.injectedLocks = locks
    }

    async setItem(key:string, value:Uint8Array):Promise<void> {
        await this.Init()
        await this.realStorage.setItem(key, value)
    }
    async getItem(key:string):Promise<Buffer> {
        await this.Init()
        return await this.realStorage.getItem(key)

    }
    async keys():Promise<string[]>{
        await this.Init()
        return await this.realStorage.keys()

    }
    async removeItem(key:string){
        await this.Init()
        return await this.realStorage.removeItem(key)
    }

    async Init(): Promise<void> {
        if(this.realStorage){
            return
        }
        if(!this.initPromise){
            this.initPromise = this.runInit()
        }
        return this.initPromise
    }

    /**
     * Runs the backend decision, then, on every path that settles it (never
     * on a rejection -- see `decideBackend()`'s decision-state read
     * failure), takes a fresh storage-epoch reading. A page whose `Init()`
     * rejected therefore keeps no reading of its own.
     */
    private async runInit(): Promise<void> {
        await this.decideBackend()
        ;(this.injectedLocks?.recordStorageEpoch ?? recordStorageEpoch)?.()
    }

    private async decideBackend(): Promise<void> {
        // Waits for this tab's own shared cross-tab presence lock to actually
        // be granted first — while `enableOpfs()`/`disableOpfs()` hold the same
        // lock exclusively (see storageTabLocks.ts), a new tab must not start
        // reading/writing any backend at all, since the switch could still be
        // copying data out from under it or the active backend could change out
        // from under it mid-init. It also means a tab that opens mid-boot-copy
        // (below) waits here until the migrator releases, then reads the
        // already-settled outcome directly with no copy of its own. Read lazily
        // off the injected instance or the production default -- never
        // captured at construction time, since `forageStorage` is constructed
        // at module-evaluation time in `globalApi.svelte.ts`, before that
        // module's own exports of these two are initialized yet.
        await (this.injectedLocks?.tabPresenceLockAcquired ?? tabPresenceLockAcquired)
        // A returning RisuAccount-sync profile leaves this flag set. Detection
        // only records it for boot to act on later; it never changes which
        // backend this platform lands on, and never touches the flag itself.
        this.staleAccountProfile = localStorage.getItem('accountst') === 'able'
        if(isNodeServer){
            console.log("using node storage")
            this.realStorage = new NodeStorage()
            return
        }
        if(window.navigator?.storage?.getDirectory &&
                FileSystemFileHandle?.prototype?.createWritable &&
                localStorage.getItem('opfs_flag!') === "able"){
            console.log("using opfs storage")

            const forage = localforage.createInstance({
                name: "risuai"
            })

            // Decision-state reads: never caught below. A failure here must
            // stay a loud boot failure and never fall back to a stale
            // pre-migration LocalForage copy of an already-migrated profile.
            const existingDb = await forage.getItem("database/database.bin")
            const migratedMarker = await forage.getItem("migrated")

            if((!existingDb) || migratedMarker){
                this.realStorage = new OpfsStorage()
                return
            }

            // A copy is needed: one migrator at a time, via the exclusive lock
            // (read lazily off the injected instance or the production
            // default, same reasoning as the shared presence lock above).
            const acquireExclusive = this.injectedLocks?.acquireExclusiveStorageMigrationLock ?? acquireExclusiveStorageMigrationLock
            const release = await acquireExclusive()

            if(!release){
                // Telling a genuinely unsupported browser apart from a lost race
                // needs to know whether a lock manager exists at all. Checked
                // directly here, against the real global `navigator`, rather
                // than through an injected instance's own `locksSupported` --
                // an injected instance, as tests use to simulate real Web Locks
                // queueing, is never treated as unsupported here, regardless of
                // what it reports. This only ever matters when opfs_flag! was
                // set outside the app, since enableOpfs() itself already
                // refuses without navigator.locks.
                const unsupported = !this.injectedLocks && (typeof navigator === 'undefined' || !navigator.locks)
                if(unsupported){
                    localStorage.removeItem('opfs_flag!')
                    this.opfsSwitchNotice = { reason: 'unsupported' }
                    this.realStorage = forage
                    return
                }
                // Not granted (another tab held or holds the lock). By the time
                // this resolved, this tab's own shared presence hold has
                // already been restored internally, so the flag and the marker
                // can be re-read safely now: if the exclusive holder
                // finished, this blocked on its exclusive hold releasing, which
                // only happens after it wrote the marker.
                const migratedNow = await forage.getItem("migrated")
                if(migratedNow){
                    this.realStorage = new OpfsStorage()
                    return
                }
                if(localStorage.getItem('opfs_flag!') !== "able"){
                    this.realStorage = forage
                    return
                }
                // Flag still set, marker still unset, and this tab could not
                // become the migrator: another tab was open, or a switch was
                // interrupted -- never keep the flag set for the next boot to
                // retry blindly.
                localStorage.removeItem('opfs_flag!')
                this.opfsSwitchNotice = { reason: 'interrupted' }
                this.realStorage = forage
                return
            }

            try {
                // Another tab may have already finished while this one was
                // queued for the exclusive lock -- re-check before copying
                // again over a completed migration.
                const migratedNow = await forage.getItem("migrated")
                if(migratedNow){
                    this.realStorage = new OpfsStorage()
                    return
                }
                // The flag itself may have been cleared by another tab (a
                // failed copy, or a disableOpfs()) while this tab was queued
                // for the exclusive lock. A tab copies only while both the
                // flag is still set and the marker is still unset, as read
                // just now under this same exclusive hold -- otherwise it
                // settles on LocalForage without copying, so it never ends up
                // on OPFS behind a cleared flag while another tab holds a
                // stale LocalForage view of the same session.
                if(localStorage.getItem('opfs_flag!') !== "able"){
                    this.realStorage = forage
                    return
                }
                await this.copyLocalForageIntoOpfs(forage)
            } finally {
                await release()
            }
            return
        }
        console.log("using forage storage")
        this.realStorage = localforage.createInstance({
            name: "risuai"
        })
    }

    /**
     * Copies every LocalForage value into a fresh OpfsStorage, skipping null
     * and undefined values -- a junk key `disableOpfs()` copied back
     * earlier from a foreign OPFS file stays harmless rather than reaching a
     * real write. Runs only while the caller holds the exclusive
     * storage-migration lock. On any failure -- including the completion
     * marker's own write -- every OPFS key this call wrote (including the
     * one being written when it threw) is removed on a best-effort basis,
     * the flag is cleared, a notice reason is recorded, and this instance
     * lands on the given LocalForage instance instead; the failure never
     * rejects Init().
     */
    private async copyLocalForageIntoOpfs(forage: LocalForage): Promise<void> {
        const opfs = new OpfsStorage()
        const writtenKeys: string[] = []
        try {
            const keys = await forage.keys()
            let i = 0
            for(const key of keys){
                const value = await forage.getItem<Uint8Array>(key)
                if(value === null || value === undefined){
                    i += 1
                    continue
                }
                alertStore.set({
                    type: "wait",
                    msg: `Migrating your data...(${i}/${keys.length})`
                })
                // Tracked before the write itself: getFileHandle(..., {create:
                // true}) has already created the (possibly still-empty) file
                // by the time a write can throw, so a mid-write failure must
                // still remove this key on cleanup.
                writtenKeys.push(key)
                await opfs.setItem(key, value)
                i += 1
            }
            // Completion is recorded only after every key has copied; a
            // marker write failure here is handled identically to a copy
            // failure.
            await forage.setItem("migrated", true)
            this.realStorage = opfs
        } catch (error) {
            for(const key of writtenKeys){
                try {
                    await opfs.removeItem(key)
                } catch (removeError) {
                    console.error("failed to remove a partially migrated OPFS key", key, removeError)
                }
            }
            localStorage.removeItem('opfs_flag!')
            this.opfsSwitchNotice = isQuotaExceededError(error)
                ? { reason: 'quota' }
                : { reason: 'error', detail: error instanceof Error ? error.message : String(error) }
            this.realStorage = forage
        } finally {
            alertStore.set({
                type: "none",
                msg: ""
            })
        }
    }

    listItem = this.keys
}
