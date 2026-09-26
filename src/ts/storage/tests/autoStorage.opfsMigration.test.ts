// @vitest-environment happy-dom

/**
 * CHORE-39 (Agents/Reports/30-chore39-opfs-migration-plan.md, MC-089,
 * MC-092): the OPFS boot copy in `AutoStorage.Init()` must not lock a user
 * out of their data, must never leave a partial copy readable as the
 * database, must run under exactly one migrator across tabs, and must
 * survive a cold-storage junk file in the OPFS root (O1-O5, O8-O9; plan
 * section 2). These tests drive the real, unmocked `AutoStorage` and
 * `OpfsStorage` against fakes for OPFS, LocalForage and Web Locks.
 *
 * Real, unmocked: `AutoStorage`, `OpfsStorage`, `createStorageTabLocks`
 * (`../storageTabLocks`) -- driven by a fake `LockManager` that grants
 * strictly in queue order and honours `AbortSignal`, matching the real
 * `navigator.locks` contract the lock seam depends on.
 * Mocked: `localforage` (a by-name registry of fake instances, so multiple
 * `createInstance({name:'risuai'})` calls share one store, as real
 * LocalForage does), `src/ts/platform` (`isNodeServer: false`, the only
 * export `AutoStorage`'s module graph reads), `src/ts/globalApi.svelte`
 * (just `tabPresenceLockAcquired`, since every test passes its own
 * `StorageTabLocks` instance to the `AutoStorage` constructor instead of
 * relying on the module default), `src/ts/alert` (a spyable `alertStore.set`
 * plus the leaves `NodeStorage`'s module graph imports but never calls
 * here), `src/ts/util` (the leaves `NodeStorage`/`OpfsStorage` import but
 * never call in any scenario here, `asBuffer` kept as the real identity
 * function so a `null` value reaches the fake OPFS write exactly as the
 * unmocked code would pass it).
 *
 * Global stubs: `navigator.storage` (`getDirectory` resolves to one shared
 * `FakeOpfsDirectory` per test, so every `new OpfsStorage()` instance a test
 * or `AutoStorage.Init()` creates reads/writes the same simulated origin
 * storage) and `FileSystemFileHandle` (a truthy `prototype.createWritable`,
 * which is all `Init()`'s feature check reads).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createStorageTabLocks, STORAGE_TAB_LOCK_NAME, type StorageTabLocks, type StorageTabWriteLock } from '../storageTabLocks'

//#region module mocks

const alertStoreSetMock = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/alert'), () => ({
    alertStore: { set: alertStoreSetMock },
    alertError: vi.fn(),
    alertInput: vi.fn(),
    waitAlert: vi.fn(async () => { }),
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('src/ts/platform'), () => ({
    isNodeServer: false,
}) as unknown as typeof import('src/ts/platform'))

/** Only ever reached by a default `new AutoStorage()` with no injected locks -- every other test in this file injects its own `StorageTabLocks` and never touches this binding. */
const acquireExclusiveStorageMigrationLockMock = vi.hoisted(() => vi.fn(async (): Promise<(() => Promise<void>) | null> => null))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    tabPresenceLockAcquired: Promise.resolve(),
    acquireExclusiveStorageMigrationLock: acquireExclusiveStorageMigrationLockMock,
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/util'), () => ({
    sleep: vi.fn(async () => { }),
    base64url: (b: Uint8Array) => Buffer.from(b).toString('base64url'),
    getKeypairStore: vi.fn(async () => null),
    saveKeypairStore: vi.fn(async () => { }),
    // Real asBuffer is the identity function (both its branches just return
    // the argument, differently cast) -- kept faithful so a `null` value
    // reaches the fake OPFS stream's write() exactly as production would.
    asBuffer: (v: unknown) => v,
}) as unknown as typeof import('src/ts/util'))

const localForage = vi.hoisted(() => {
    class FakeLocalForageInstance {
        store = new Map<string, unknown>()
        /** Set by a test to make the next setItem() for this key throw once, then clear itself -- models a single write failure (e.g. the "migrated" marker write). */
        pendingFailure: { key: string; error: unknown } | null = null
        async getItem(key: string) {
            return this.store.has(key) ? this.store.get(key) : null
        }
        async setItem(key: string, value: unknown) {
            if (this.pendingFailure && this.pendingFailure.key === key) {
                const { error } = this.pendingFailure
                this.pendingFailure = null
                throw error
            }
            this.store.set(key, value)
            return value
        }
        async removeItem(key: string) {
            this.store.delete(key)
        }
        async keys() {
            return [...this.store.keys()]
        }
    }
    const registry = new Map<string, InstanceType<typeof FakeLocalForageInstance>>()
    function createInstance(opts: { name: string }) {
        if (!registry.has(opts.name)) {
            registry.set(opts.name, new FakeLocalForageInstance())
        }
        return registry.get(opts.name)
    }
    return { FakeLocalForageInstance, registry, createInstance }
})

vi.mock('localforage', () => ({
    default: { createInstance: localForage.createInstance },
}))

//#endregion

import { AutoStorage } from '../autoStorage'
import { OpfsStorage } from '../opfsStorage'

//#region fakes: OPFS directory

/** A minimal `FileSystemDirectoryHandle` fake backing the real, unmocked `OpfsStorage`. */
class FakeOpfsDirectory {
    files = new Map<string, Uint8Array>()
    /** Counts every write() attempt (successful or not), so a test can tell "wrote once" from "wrote twice" regardless of the final file map, which dedups by name. */
    writeAttempts = 0
    /** Counts every write() call given a null or undefined value -- the copy loop's null/undefined skip must keep this at zero. */
    nullWriteAttempts = 0
    /** Adds an artificial delay (ms, subject to fake timers) before each write() settles, so a test can make a copy loop's duration controllable. */
    writeDelayMs = 0
    private writeFailures = new Map<string, unknown>()

    /** Fails the next write() to this OPFS file name once, then stops failing. */
    failNextWrite(fileName: string, error: unknown) {
        this.writeFailures.set(fileName, error)
    }

    async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!this.files.has(name)) {
            if (!options?.create) {
                throw new DOMException('A requested file or directory could not be found.', 'NotFoundError')
            }
            // Real getFileHandle(..., {create:true}) makes an empty file immediately, before any write() happens.
            this.files.set(name, new Uint8Array())
        }
        const dir = this
        return {
            async createWritable() {
                return {
                    async write(data: unknown) {
                        dir.writeAttempts += 1
                        if (dir.writeDelayMs > 0) {
                            await new Promise((resolve) => setTimeout(resolve, dir.writeDelayMs))
                        }
                        if (data === null || data === undefined) {
                            dir.nullWriteAttempts += 1
                            // A real WritableStream rejects a write() call given neither a
                            // BufferSource nor a WriteParams dictionary with `null`/`undefined`.
                            throw new TypeError("Failed to execute 'write' on 'FileSystemWritableFileStream': the provided value is not a valid write parameter.")
                        }
                        const failure = dir.writeFailures.get(name)
                        if (failure !== undefined) {
                            dir.writeFailures.delete(name)
                            throw failure
                        }
                        dir.files.set(name, data as Uint8Array)
                    },
                    async close() { },
                }
            },
            async getFile() {
                const data = dir.files.get(name) ?? new Uint8Array()
                return { async arrayBuffer() { return data.buffer } }
            },
        }
    }

    async removeEntry(name: string) {
        if (!this.files.has(name)) {
            throw new DOMException('A requested file or directory could not be found.', 'NotFoundError')
        }
        this.files.delete(name)
    }

    async *values() {
        for (const name of [...this.files.keys()]) {
            yield { name } as FileSystemHandle
        }
    }

    /** Adds a file under a raw name that never round-trips through hex decode/encode, as cold storage's `coldstorage_<key>.json` files in the OPFS root do. */
    seedForeignFile(name: string, data: Uint8Array = new Uint8Array()) {
        this.files.set(name, data)
    }
}

function hex(key: string): string {
    return Buffer.from(key, 'utf-8').toString('hex')
}

function quotaExceededError(): DOMException {
    return new DOMException('The quota has been exceeded.', 'QuotaExceededError')
}

function stubOpfsGlobals(directory: FakeOpfsDirectory) {
    Object.defineProperty(window.navigator, 'storage', {
        value: {
            getDirectory: async () => directory,
            estimate: async () => ({ usage: 0, quota: 1_000_000_000 }),
        },
        configurable: true,
    })
        ; (globalThis as unknown as { FileSystemFileHandle: { prototype: { createWritable: () => unknown } } }).FileSystemFileHandle = {
            prototype: { createWritable: () => undefined },
        }
}

//#endregion

//#region fakes: Web Locks

type LockMode = 'shared' | 'exclusive'
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
class FakeLockManagerCore {
    private held: { tabId: string, mode: LockMode }[] = []
    private queue: FakeLockRequest[] = []

    request(tabId: string, _name: string, options: { mode?: LockMode, signal?: AbortSignal }, callback: (lock: { name: string, mode: LockMode }) => Promise<unknown>): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const req: FakeLockRequest = { tabId, mode: options.mode ?? 'exclusive', callback, resolve, reject }
            if (options.signal) {
                options.signal.addEventListener('abort', () => {
                    const i = this.queue.indexOf(req)
                    if (i >= 0) {
                        this.queue.splice(i, 1)
                        reject(new DOMException('The request was aborted.', 'AbortError'))
                        this.pump()
                    }
                })
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
class FakeTabLockManagerView {
    constructor(private core: FakeLockManagerCore, private tabId: string) { }
    request(name: string, options: { mode?: LockMode, signal?: AbortSignal }, callback: (lock: unknown) => Promise<unknown>) {
        return this.core.request(this.tabId, name, options, callback)
    }
}

/** Matches `StorageTabWriteLock`; one instance per simulated tab, mirroring production's per-page `dbWriteLock`. */
class FakeAsyncMutex implements StorageTabWriteLock {
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

interface SimulatedTab {
    tabId: string
    locks: StorageTabLocks
    close: () => void
}

function makeSimulatedTab(core: FakeLockManagerCore, tabId: string): SimulatedTab {
    const view = new FakeTabLockManagerView(core, tabId)
    const locks = createStorageTabLocks(view as unknown as LockManager, new FakeAsyncMutex())
    return { tabId, locks, close: () => core.closeTab(tabId) }
}

//#endregion

let opfsDir: FakeOpfsDirectory

beforeEach(() => {
    localStorage.clear()
    localForage.registry.clear()
    alertStoreSetMock.mockClear()
    acquireExclusiveStorageMigrationLockMock.mockReset().mockResolvedValue(null)
    opfsDir = new FakeOpfsDirectory()
    stubOpfsGlobals(opfsDir)
})

/** Sets the flag and seeds the LocalForage `risuai` instance with a database key plus any extra keys, as a profile due to migrate would have. */
function seedMigratableProfile(keys: string[]) {
    localStorage.setItem('opfs_flag!', 'able')
    const forage = localForage.createInstance({ name: 'risuai' })!
    for (const key of keys) {
        void forage.setItem(key, new TextEncoder().encode(`value-${key}`))
    }
    return forage
}

/** Runs Init(), swallowing a throw so a test can inspect post-state regardless of whether Init() rejects or resolves. */
async function runInit(instance: AutoStorage): Promise<unknown> {
    try {
        await instance.Init()
        return null
    } catch (error) {
        return error
    }
}

describe('O1 -- no lockout when the boot copy cannot complete', () => {
    test('regression reproducer: a QuotaExceededError partway through the copy still boots this session on LocalForage with the original data intact, and clears the flag', async () => {
        const keys = ['database/database.bin', 'k2', 'k3']
        const forage = seedMigratableProfile(keys)
        opfsDir.failNextWrite(hex('k2'), quotaExceededError())
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        const thrown = await runInit(instance)

        expect(thrown).toBeNull()
        expect(instance.realStorage).toBe(forage)
        expect(await forage.getItem('database/database.bin')).not.toBeNull()
        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(instance.opfsSwitchNotice).toEqual({ reason: 'quota' })
    })

    test('regression reproducer: a non-quota error partway through the copy still boots this session on LocalForage and clears the flag', async () => {
        const keys = ['database/database.bin', 'k2', 'k3']
        const forage = seedMigratableProfile(keys)
        opfsDir.failNextWrite(hex('k2'), new Error('disk write failed'))
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        const thrown = await runInit(instance)

        expect(thrown).toBeNull()
        expect(instance.realStorage).toBe(forage)
        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(instance.opfsSwitchNotice).toEqual({ reason: 'error', detail: 'disk write failed' })
    })

    test('regression reproducer: the progress alert does not stay on screen after a failed copy', async () => {
        const keys = ['database/database.bin', 'k2']
        seedMigratableProfile(keys)
        opfsDir.failNextWrite(hex('k2'), quotaExceededError())
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        await runInit(instance)

        const lastCall = alertStoreSetMock.mock.calls.at(-1)?.[0] as { type?: string } | undefined
        expect(lastCall?.type).toBe('none')
    })

    test('guard: a decision-state read failure still rejects Init() and never selects LocalForage over an already-migrated OPFS profile', async () => {
        // Already migrated: flag able, migrated true. A read failure here must
        // stay a loud boot failure (O1's scope carve-out), never silently fall
        // back to a stale pre-migration LocalForage copy.
        localStorage.setItem('opfs_flag!', 'able')
        const forage = localForage.createInstance({ name: 'risuai' })!
        await forage.setItem('database/database.bin', new TextEncoder().encode('db'))
        const readError = new Error('IndexedDB read failed')
        const realGetItem = forage.getItem.bind(forage)
        forage.getItem = async (key: string) => {
            if (key === 'migrated') throw readError
            return realGetItem(key)
        }
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        await expect(instance.Init()).rejects.toBe(readError)
    })
})

describe('O2 -- completion is recorded, or the switch does not happen', () => {
    test('regression reproducer: the "migrated" marker write failing after a complete copy recovers via O1, and the next boot does not re-copy', async () => {
        const keys = ['database/database.bin', 'k2']
        const forage = seedMigratableProfile(keys)
        forage.pendingFailure = { key: 'migrated', error: new Error('marker write failed') }
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        const thrown = await runInit(instance)
        expect(thrown).toBeNull()
        expect(instance.realStorage).toBe(forage)
        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(instance.opfsSwitchNotice).toEqual({ reason: 'error', detail: 'marker write failed' })

        const writesBeforeSecondBoot = opfsDir.writeAttempts
        const tab2 = makeSimulatedTab(new FakeLockManagerCore(), 'A2')
        const instance2 = new AutoStorage(tab2.locks)
        await instance2.Init()

        expect(instance2.realStorage).toBe(forage)
        expect(opfsDir.writeAttempts).toBe(writesBeforeSecondBoot)
    })
})

describe('O3 -- a partial copy is never read as the database (kept)', () => {
    test('guard: setting the flag again by hand with "migrated" unset restarts the copy rather than reading OPFS directly', async () => {
        const keys = ['database/database.bin']
        const forage = seedMigratableProfile(keys)
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)
        await instance.Init()
        expect(instance.realStorage).toBeInstanceOf(OpfsStorage)

        // A hand-set flag with the marker removed must restart the copy, not
        // read the now-current OPFS copy directly.
        await forage.removeItem('migrated')
        const writesBefore = opfsDir.writeAttempts
        const tab2 = makeSimulatedTab(new FakeLockManagerCore(), 'B')
        const instance2 = new AutoStorage(tab2.locks)
        await instance2.Init()

        expect(instance2.realStorage).toBeInstanceOf(OpfsStorage)
        expect(opfsDir.writeAttempts).toBeGreaterThan(writesBefore)
    })
})

describe('O4 -- a failed copy gives back the space it took', () => {
    test('regression reproducer: OPFS holds none of this run\'s keys after a failure, including the key being written when it threw', async () => {
        const keys = ['database/database.bin', 'k2', 'k3']
        seedMigratableProfile(keys)
        opfsDir.failNextWrite(hex('k3'), quotaExceededError())
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        await runInit(instance)

        expect(opfsDir.files.has(hex('database/database.bin'))).toBe(false)
        expect(opfsDir.files.has(hex('k2'))).toBe(false)
        // key k3's empty file: getFileHandle(..., {create:true}) already made it before write() threw.
        expect(opfsDir.files.has(hex('k3'))).toBe(false)
    })

    test('guard: a key present in OPFS before the run and not rewritten by it is untouched', async () => {
        const preexistingKey = 'leftover-key'
        opfsDir.files.set(hex(preexistingKey), new TextEncoder().encode('old-data'))
        const keys = ['database/database.bin', 'k2']
        seedMigratableProfile(keys)
        opfsDir.failNextWrite(hex('k2'), quotaExceededError())
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        await runInit(instance)

        expect(opfsDir.files.has(hex(preexistingKey))).toBe(true)
    })
})

describe('O5 -- one migrator, and every tab decides its backend from state read under its own lock', () => {
    test('regression reproducer: two tabs booting at once: exactly one copies', async () => {
        const keys = ['database/database.bin', 'k2', 'k3']
        seedMigratableProfile(keys)
        const core = new FakeLockManagerCore()
        const tabA = makeSimulatedTab(core, 'A')
        const tabB = makeSimulatedTab(core, 'B')
        const exclusiveSpyA = vi.spyOn(tabA.locks, 'acquireExclusiveStorageMigrationLock')
        const exclusiveSpyB = vi.spyOn(tabB.locks, 'acquireExclusiveStorageMigrationLock')
        const instanceA = new AutoStorage(tabA.locks)
        const instanceB = new AutoStorage(tabB.locks)

        await Promise.all([instanceA.Init(), instanceB.Init()])

        // Exactly one migrator writes each key once; writeAttempts counts every
        // attempt regardless of the final (deduplicated-by-name) file map.
        expect(opfsDir.writeAttempts).toBe(keys.length)
        expect(exclusiveSpyA).toHaveBeenCalled()
        expect(exclusiveSpyB).toHaveBeenCalled()
    })

    describe('timing scenarios (fake timers control the copy duration against the lock timeout)', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })
        afterEach(() => {
            vi.useRealTimers()
        })

        /** Advances the fake clock in steps until `promise` settles, or `maxSteps` is exhausted. */
        async function driveUntilSettled(promise: Promise<unknown>, stepMs = 250, maxSteps = 100): Promise<void> {
            let settled = false
            promise.then(() => { settled = true }, () => { settled = true })
            for (let i = 0; i < maxSteps && !settled; i++) {
                await vi.advanceTimersByTimeAsync(stepMs)
            }
        }

        test('regression reproducer: a copy longer than the exclusive-lock timeout still leaves the loser on OPFS, having never written during the copy', async () => {
            const keys = ['database/database.bin', 'k2', 'k3']
            seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 3000 // 3 keys * 3000ms > the 5000ms default exclusive-lock timeout
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const tabB = makeSimulatedTab(core, 'B')
            const instanceA = new AutoStorage(tabA.locks)
            const instanceB = new AutoStorage(tabB.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(100)
            const initB = instanceB.Init()
            await driveUntilSettled(Promise.all([initA, initB]))

            expect(opfsDir.writeAttempts).toBe(keys.length)
            expect(instanceB.realStorage).toBeInstanceOf(OpfsStorage)
        }, 10000)

        test('regression reproducer: a copy shorter than the exclusive-lock timeout lets the loser see the completed marker and skip its own copy', async () => {
            const keys = ['database/database.bin', 'k2']
            seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 200 // 2 keys * 200ms << the 5000ms default exclusive-lock timeout
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const tabB = makeSimulatedTab(core, 'B')
            const instanceA = new AutoStorage(tabA.locks)
            const instanceB = new AutoStorage(tabB.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(50)
            const initB = instanceB.Init()
            await driveUntilSettled(Promise.all([initA, initB]))

            expect(opfsDir.writeAttempts).toBe(keys.length)
            expect(instanceB.realStorage).toBeInstanceOf(OpfsStorage)
        }, 10000)

        test('regression reproducer: a non-quota error partway through the migrator\'s copy leaves a tab still queued for the exclusive lock on LocalForage without copying', async () => {
            const keys = ['database/database.bin', 'k2', 'k3']
            const forage = seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 200 // slow enough for B to queue behind A before A's failure releases the lock
            opfsDir.failNextWrite(hex('k2'), new Error('disk write failed'))
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const tabB = makeSimulatedTab(core, 'B')
            const instanceA = new AutoStorage(tabA.locks)
            const instanceB = new AutoStorage(tabB.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(50) // A has been granted the exclusive lock and started copying
            const initB = instanceB.Init() // queues behind A for the same lock, well inside its own 5000ms timeout
            await driveUntilSettled(Promise.all([initA, initB]))

            expect(instanceB.realStorage).toBe(forage)
            expect(await forage.getItem('migrated')).toBeNull()
            expect(localStorage.getItem('opfs_flag!')).toBeNull()
            // A wrote database.bin then failed attempting k2; a queued B must
            // settle on LocalForage instead of copying again over that failure.
            expect(opfsDir.writeAttempts).toBe(2)
        }, 10000)

        test('regression reproducer: the migrator\'s own "migrated" marker write failing leaves a tab still queued for the exclusive lock on LocalForage without copying', async () => {
            const keys = ['database/database.bin', 'k2']
            const forage = seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 200
            forage.pendingFailure = { key: 'migrated', error: new Error('marker write failed') }
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const tabB = makeSimulatedTab(core, 'B')
            const instanceA = new AutoStorage(tabA.locks)
            const instanceB = new AutoStorage(tabB.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(50)
            const initB = instanceB.Init()
            await driveUntilSettled(Promise.all([initA, initB]))

            expect(instanceB.realStorage).toBe(forage)
            expect(await forage.getItem('migrated')).toBeNull()
            expect(localStorage.getItem('opfs_flag!')).toBeNull()
            // A copied both keys then failed writing the marker; a queued B
            // must settle on LocalForage instead of copying again over that
            // failure.
            expect(opfsDir.writeAttempts).toBe(2)
        }, 10000)

        test('regression reproducer: the migrating tab closed after the waiting tab\'s exclusive request already timed out clears the flag and lands on LocalForage', async () => {
            const keys = ['database/database.bin', 'k2', 'k3', 'k4']
            const forage = seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 3000 // long enough that B's default 5000ms exclusive request times out before A would finish
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const tabB = makeSimulatedTab(core, 'B')
            const instanceA = new AutoStorage(tabA.locks)
            const instanceB = new AutoStorage(tabB.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(100)
            const initB = instanceB.Init()
            await vi.advanceTimersByTimeAsync(7000) // past B's 5000ms timeout, before A's ~12s copy finishes
            tabA.close()
            initA.catch(() => { })
            await driveUntilSettled(initB)

            expect(instanceB.realStorage).not.toBeInstanceOf(OpfsStorage)
            expect(localStorage.getItem('opfs_flag!')).toBeNull()
            expect(instanceB.opfsSwitchNotice).toEqual({ reason: 'interrupted' })
            void forage
        }, 10000)

        test('compatibility guard: the migrating tab closing while the waiting tab\'s exclusive request is still queued lets it become the migrator and finish on OPFS', async () => {
            const keys = ['database/database.bin', 'k2', 'k3', 'k4']
            seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 3000
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const tabB = makeSimulatedTab(core, 'B')
            const exclusiveSpyB = vi.spyOn(tabB.locks, 'acquireExclusiveStorageMigrationLock')
            const instanceA = new AutoStorage(tabA.locks)
            const instanceB = new AutoStorage(tabB.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(100)
            const initB = instanceB.Init()
            await vi.advanceTimersByTimeAsync(2000) // still well within B's 5000ms timeout
            tabA.close()
            initA.catch(() => { })
            await driveUntilSettled(initB)

            // The instanceOf check alone does not distinguish real exclusive-lock
            // serialization from both tabs independently finishing on OPFS with
            // no coordination at all -- the assertion that matters is that B
            // actually went through the exclusive lock and was granted it once
            // A's closure freed the queue.
            expect(exclusiveSpyB).toHaveBeenCalled()
            expect(await exclusiveSpyB.mock.results.at(-1)?.value).not.toBeNull()
            expect(instanceB.realStorage).toBeInstanceOf(OpfsStorage)
        }, 10000)

        test('compatibility guard: a fresh tab booting after the migrating tab closed mid-copy copies and finishes on OPFS', async () => {
            const keys = ['database/database.bin', 'k2']
            seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 3000
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const instanceA = new AutoStorage(tabA.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(1000)
            tabA.close()
            initA.catch(() => { })

            const tabC = makeSimulatedTab(core, 'C')
            const exclusiveSpyC = vi.spyOn(tabC.locks, 'acquireExclusiveStorageMigrationLock')
            const instanceC = new AutoStorage(tabC.locks)
            const initC = instanceC.Init()
            await driveUntilSettled(initC)

            // Same reasoning as the queued case above: the instanceOf check
            // alone does not distinguish C going through the exclusive lock
            // from C independently copying and landing on OPFS regardless of
            // any lock.
            expect(exclusiveSpyC).toHaveBeenCalled()
            expect(await exclusiveSpyC.mock.results.at(-1)?.value).not.toBeNull()
            expect(instanceC.realStorage).toBeInstanceOf(OpfsStorage)
        }, 10000)

        test('regression reproducer: a tab opened mid-copy waits for the migrator, then boots on OPFS without copying itself', async () => {
            const keys = ['database/database.bin', 'k2', 'k3']
            seedMigratableProfile(keys)
            opfsDir.writeDelayMs = 500
            const core = new FakeLockManagerCore()
            const tabA = makeSimulatedTab(core, 'A')
            const instanceA = new AutoStorage(tabA.locks)

            const initA = instanceA.Init()
            await vi.advanceTimersByTimeAsync(200) // A is mid-copy, exclusive lock held

            const tabC = makeSimulatedTab(core, 'C')
            const instanceC = new AutoStorage(tabC.locks)
            const initC = instanceC.Init()
            await driveUntilSettled(Promise.all([initA, initC]))

            expect(opfsDir.writeAttempts).toBe(keys.length)
            expect(instanceC.realStorage).toBeInstanceOf(OpfsStorage)
        }, 10000)
    })
})

describe('O8 -- a cold-storage or otherwise-junk OPFS entry never breaks or is copied into a real write', () => {
    test('regression reproducer: enabling, disabling, and enabling again around a cold-storage file end on OPFS with the data intact and migrated set, and the copy never calls write(null)', async () => {
        const keys = ['database/database.bin', 'k2']
        const forage = seedMigratableProfile(keys)
        // Cold storage writes its own files directly into the same OPFS root,
        // independent of the opfs_flag! switch -- present for the whole
        // enable/disable/enable round trip below.
        opfsDir.seedForeignFile('coldstorage_deadbeef.json', new TextEncoder().encode('{}'))

        // enable: first migration, LocalForage -> OPFS.
        const tabA = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instanceA = new AutoStorage(tabA.locks)
        await instanceA.Init()
        expect(instanceA.realStorage).toBeInstanceOf(OpfsStorage)
        expect(await forage.getItem('migrated')).toBe(true)

        // disable: mirrors disableOpfs()'s own copy-back loop (opfs.keys()
        // already excludes the foreign cold-storage file, so it is never
        // treated as a key here). A key whose value comes back null (as a
        // junk key disableOpfs() copied back from a foreign OPFS file could
        // leave behind) models the precondition the copy's null/undefined
        // skip exists to handle.
        const opfsForDisable = new OpfsStorage()
        const target = forage // createInstance({name:'risuai'}) dedups to the same instance, as production's real registry does
        for (const key of await opfsForDisable.keys()) {
            await target.setItem(key, await opfsForDisable.getItem(key))
        }
        await target.setItem('leftover-null-key', null)
        await target.removeItem('migrated')
        localStorage.removeItem('opfs_flag!')

        // enable again.
        localStorage.setItem('opfs_flag!', 'able')
        const tabB = makeSimulatedTab(new FakeLockManagerCore(), 'B')
        const instanceB = new AutoStorage(tabB.locks)
        await instanceB.Init()

        expect(instanceB.realStorage).toBeInstanceOf(OpfsStorage)
        expect(await forage.getItem('migrated')).toBe(true)
        expect(await (instanceB.realStorage as OpfsStorage).getItem('database/database.bin')).not.toBeNull()
        expect(await (instanceB.realStorage as OpfsStorage).getItem('k2')).not.toBeNull()
        expect(opfsDir.files.has('coldstorage_deadbeef.json')).toBe(true)
        expect(opfsDir.nullWriteAttempts).toBe(0)
    })
})

describe('a default AutoStorage with no injected locks falls back to the production lock functions', () => {
    test('regression reproducer: Web Locks unsupported (no navigator.locks, and the production exclusive-lock function refusing) clears the flag, boots on LocalForage, and posts the unsupported reason', async () => {
        const keys = ['database/database.bin']
        const forage = seedMigratableProfile(keys)
        Object.defineProperty(window.navigator, 'locks', {
            value: undefined,
            configurable: true,
        })
        // autoStorage.ts resolves this binding lazily inside Init(), off the
        // same mocked src/ts/globalApi.svelte module every other test in
        // this file bypasses by injecting its own StorageTabLocks -- only a
        // default AutoStorage (no constructor argument) ever reaches it.
        acquireExclusiveStorageMigrationLockMock.mockResolvedValueOnce(null)
        const instance = new AutoStorage()

        await instance.Init()

        expect(instance.realStorage).toBe(forage)
        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(instance.opfsSwitchNotice).toEqual({ reason: 'unsupported' })
    })
})

describe('O9 -- unchanged behaviour', () => {
    test('guard: an already-migrated profile boots on OPFS with no copy', async () => {
        localStorage.setItem('opfs_flag!', 'able')
        const forage = localForage.createInstance({ name: 'risuai' })!
        await forage.setItem('database/database.bin', new TextEncoder().encode('db'))
        await forage.setItem('migrated', true)
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        await instance.Init()

        expect(instance.realStorage).toBeInstanceOf(OpfsStorage)
        expect(opfsDir.writeAttempts).toBe(0)
        expect(localStorage.getItem('opfs_flag!')).toBe('able')
    })

    test('guard: an already-migrated profile boots on OPFS with no copy even without navigator.locks', async () => {
        localStorage.setItem('opfs_flag!', 'able')
        const forage = localForage.createInstance({ name: 'risuai' })!
        await forage.setItem('database/database.bin', new TextEncoder().encode('db'))
        await forage.setItem('migrated', true)
        const locks = createStorageTabLocks(undefined, new FakeAsyncMutex())
        const instance = new AutoStorage(locks)

        await instance.Init()

        expect(instance.realStorage).toBeInstanceOf(OpfsStorage)
        expect(opfsDir.writeAttempts).toBe(0)
        expect(localStorage.getItem('opfs_flag!')).toBe('able')
    })

    test('guard: no database in LocalForage boots on OPFS with no copy', async () => {
        localStorage.setItem('opfs_flag!', 'able')
        const tab = makeSimulatedTab(new FakeLockManagerCore(), 'A')
        const instance = new AutoStorage(tab.locks)

        await instance.Init()

        expect(instance.realStorage).toBeInstanceOf(OpfsStorage)
        expect(opfsDir.writeAttempts).toBe(0)
    })
})
