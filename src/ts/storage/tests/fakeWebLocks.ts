/**
 * A fake `navigator.locks`-shaped Web Locks manager, and the small
 * per-simulated-tab harness built on top of it, shared by every suite that
 * drives the real, unmocked `createStorageTabLocks()` (`../storageTabLocks`)
 * against multiple simulated tabs of one browser origin.
 */
import { createStorageTabLocks, STORAGE_TAB_LOCK_NAME, type StorageTabLocks, type StorageTabWriteLock } from '../storageTabLocks'

export type LockMode = 'shared' | 'exclusive'

interface FakeLockRequest {
    tabId: string
    mode: LockMode
    callback: (lock: { name: string, mode: LockMode }) => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
}

/**
 * One shared Web Locks core simulating a single browser origin: grants
 * strictly in queue order (a shared request waits behind a queued exclusive
 * one), honours `AbortSignal`, and can drop a closed tab's held and queued
 * requests -- the three properties `storageTabLocks.ts`'s ordering
 * guarantees depend on, none of which a shared in-process mutex would
 * reproduce (that would serialise the simulated tabs directly, not through
 * the lock).
 */
export class FakeLockManagerCore {
    private held: { tabId: string, mode: LockMode }[] = []
    private queue: FakeLockRequest[] = []

    request(tabId: string, _name: string, options: { mode?: LockMode, signal?: AbortSignal }, callback: (lock: { name: string, mode: LockMode }) => Promise<unknown>): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const req: FakeLockRequest = { tabId, mode: options.mode ?? 'exclusive', callback, resolve, reject }
            const drop = (reason: unknown) => {
                const i = this.queue.indexOf(req)
                if (i >= 0) {
                    this.queue.splice(i, 1)
                    reject(reason)
                    this.pump()
                }
            }
            if (options.signal) {
                options.signal.addEventListener('abort', () => drop(new DOMException('The request was aborted.', 'AbortError')))
            }
            this.queue.push(req)
            this.pump()
        })
    }

    /** Drops this tab's queued requests and held lock, exactly as a closed browsing context releases its Web Locks. */
    closeTab(tabId: string) {
        this.queue = this.queue.filter((r) => r.tabId !== tabId)
        this.held = this.held.filter((h) => h.tabId !== tabId)
        this.pump()
    }

    private grantable(req: FakeLockRequest): boolean {
        if (this.queue[0] !== req) return false
        if (req.mode === 'exclusive') return this.held.length === 0
        return !this.held.some((h) => h.mode === 'exclusive')
    }

    private pump() {
        while (this.queue.length && this.grantable(this.queue[0])) {
            const req = this.queue.shift() as FakeLockRequest
            const lock = { tabId: req.tabId, mode: req.mode }
            this.held.push(lock)
            Promise.resolve()
                .then(() => req.callback({ name: STORAGE_TAB_LOCK_NAME, mode: req.mode }))
                .then((value) => {
                    const i = this.held.indexOf(lock)
                    if (i >= 0) this.held.splice(i, 1)
                    req.resolve(value)
                    this.pump()
                })
        }
    }
}

/** One simulated tab's view onto the shared core -- the real per-tab `navigator.locks` object has no tab-id parameter, so each simulated tab gets its own view that tags every request with its own id instead. */
export class FakeTabLockManagerView {
    constructor(private core: FakeLockManagerCore, private tabId: string) { }
    request(name: string, options: { mode?: LockMode, signal?: AbortSignal }, callback: (lock: unknown) => Promise<unknown>) {
        return this.core.request(this.tabId, name, options, callback)
    }
}

/** Matches `StorageTabWriteLock`; one instance per simulated tab, mirroring production's per-page `dbWriteLock`. */
export class FakeAsyncMutex implements StorageTabWriteLock {
    private queue: Promise<void> = Promise.resolve()
    async acquire(): Promise<() => void> {
        let release!: () => void
        const willRelease = new Promise<void>((resolve) => { release = resolve })
        const previous = this.queue
        this.queue = this.queue.then(() => willRelease)
        await previous
        return release
    }
}

export interface SimulatedTab {
    tabId: string
    locks: StorageTabLocks
    close: () => void
}

/** Options accepted by `makeSimulatedTab()`. */
export interface SimulatedTabOptions {
    /** Passed straight through to `createStorageTabLocks()` -- injectable so a test can observe whether this simulated tab ever requested a reload, without it actually navigating. Defaults to the real browser primitive, matching `createStorageTabLocks()`'s own default. */
    reload?: () => void
}

export function makeSimulatedTab(core: FakeLockManagerCore, tabId: string, options: SimulatedTabOptions = {}): SimulatedTab {
    const view = new FakeTabLockManagerView(core, tabId)
    const locks = createStorageTabLocks(view as unknown as LockManager, new FakeAsyncMutex(), { reload: options.reload })
    return { tabId, locks, close: () => core.closeTab(tabId) }
}
