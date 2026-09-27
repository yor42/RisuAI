/**
 * Real cross-tab mutual exclusion for a storage-backend switch initiated from
 * Settings (`enableOpfs()`/`disableOpfs()`), built on the browser's Web Locks
 * API (`navigator.locks`) rather than a ping-and-wait heartbeat — a
 * timeout-based liveness check can never be a genuine guarantee (a
 * backgrounded/suspended tab may simply not get to run its event loop in
 * time, and nothing stops a brand new tab from opening in the gap between
 * "checked, looked clear" and "the switch actually finished").
 *
 * Every tab acquires this lock in SHARED mode for its entire lifetime — the
 * request's callback holds it open via a promise that only resolves on tab
 * unload/release, so the lock's continued existence itself is what
 * "announces this tab is alive" (no heartbeat, no timeout to miss).
 * `acquireExclusiveStorageMigrationLock()` acquires the SAME lock in
 * EXCLUSIVE mode; the browser guarantees that request cannot be granted
 * while any shared holder exists, and holding it for the whole switch (not
 * just a point-in-time check) also blocks any NEW tab's shared acquisition
 * from succeeding until the switch finishes and releases — closing both the
 * "suspended peer missed the ping" and "new tab opened mid-switch" gaps a
 * heartbeat approach cannot.
 *
 * This exclusion also covers the boot copy in `AutoStorage.Init()`, which
 * takes the same exclusive lock around its own copy so that a second tab
 * opening mid-copy waits for it and then reads the already-settled outcome
 * instead of racing a copy of its own.
 */

/** The name of the Web Lock shared by every tab's presence hold and by an exclusive storage-backend switch. */
export const STORAGE_TAB_LOCK_NAME = 'risu-storage-tab-presence'

/** The minimal shape `createStorageTabLocks()` needs from a write mutex, matching `AsyncMutex` in `globalApi.svelte.ts`. */
export interface StorageTabWriteLock {
    acquire(): Promise<() => void>
}

/** One per-tab instance of the storage tab locks: the acquired shared-presence promise and the exclusive-acquire function. */
export interface StorageTabLocks {
    /** Resolves once this tab's own shared presence lock has actually been granted. */
    tabPresenceLockAcquired: Promise<void>
    /**
     * Attempts to acquire the same lock in EXCLUSIVE mode, for a storage-backend
     * migration. Resolves to a release function once granted, or
     * `null` if it couldn't be granted within `timeoutMs`
     * (meaning at least one other tab is currently alive) or Web Locks isn't
     * supported in this browser at all. Internally also acquires the write
     * lock passed to `createStorageTabLocks()` — callers must NOT separately
     * acquire it themselves. A caller that reloads right after its migration
     * may leave the lock unreleased; one that carries on in this page (a
     * failed `disableOpfs()`, the boot copy in `AutoStorage.Init()`) must
     * call the release function once its migration is fully done.
     *
     * Ordering here is load-bearing:
     *
     * 1. The write lock is acquired FIRST, before this tab even attempts the
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
    acquireExclusiveStorageMigrationLock(timeoutMs?: number): Promise<(() => Promise<void>) | null>
}

/**
 * Builds one `StorageTabLocks` instance against the given lock manager (or
 * `undefined` when Web Locks isn't supported in this browser at all) and
 * write mutex. Production (`globalApi.svelte.ts`) builds exactly one instance
 * per page, passing `navigator.locks` and the same `dbWriteLock` object that
 * `saveDb()` and `LoadLocalBackup()`'s restore write take — a second production instance would let
 * an autosave land in the new backend after `disableOpfs()`/`enableOpfs()`
 * already read it, and would give the tab a second shared hold that blocks
 * its own exclusive request. Tests build one instance per simulated tab
 * against a fake lock manager instead.
 */
export function createStorageTabLocks(locks: LockManager | undefined, writeLock: StorageTabWriteLock): StorageTabLocks {
    // Release function for THIS tab's own shared presence hold, or null while
    // none is currently held (e.g. mid-migration-attempt — see
    // acquireExclusiveStorageMigrationLock below).
    let releaseOwnSharedPresenceLock: (() => void) | null = null

    function acquireOwnSharedPresenceLock(): Promise<void> {
        if (!locks) {
            return Promise.resolve()
        }
        return new Promise<void>((resolveAcquired) => {
            locks.request(STORAGE_TAB_LOCK_NAME, { mode: 'shared' }, () => {
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
    const tabPresenceLockAcquired: Promise<void> = acquireOwnSharedPresenceLock()

    async function acquireExclusiveStorageMigrationLock(timeoutMs = 5000): Promise<(() => Promise<void>) | null> {
        if (!locks) {
            return null
        }

        const releaseWriteLock = await writeLock.acquire()

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const exclusiveRequest = new Promise<() => void>((resolveOuter, rejectOuter) => {
            locks.request(STORAGE_TAB_LOCK_NAME, { mode: 'exclusive', signal: controller.signal }, () => {
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
            // Restores this tab's shared presence hold and gives back the write
            // lock. It matters for disableOpfs()'s failure path and for the boot
            // copy in AutoStorage.Init(), whose success path never reloads: its
            // release() is what lets saveDb() write again instead of stalling
            // on dbWriteLock.
            await acquireOwnSharedPresenceLock()
            releaseWriteLock()
        }
    }

    return {
        tabPresenceLockAcquired,
        acquireExclusiveStorageMigrationLock,
    }
}
