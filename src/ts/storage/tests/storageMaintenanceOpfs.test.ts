// @vitest-environment happy-dom

/**
 * `enableOpfs`/`disableOpfs` (`src/ts/storage/storageMaintenance.ts`,
 * MC-088, I15) gate the OPFS storage-backend switch behind a confirm and an
 * exclusive cross-tab migration lock, so a live second tab can never lose a
 * write mid-migration.
 *
 * This is a pin: it drives the real, already-implemented `enableOpfs`/
 * `disableOpfs`, including the disable-side failure case where the target's
 * own `setItem` rejects mid-migration, holding their lock/flag/reload
 * behaviour against a regression rather than a still-open code path.
 *
 * Every dependency is mocked so these tests assert WHICH function ran
 * (`alertConfirm`/`alertError`, the lock, `localStorage`, the target
 * instance's `setItem`/`removeItem`) and the side effects, never any
 * English wording -- the moved panel's strings are localised (I15).
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'

const alertConfirmMock = vi.hoisted(() => vi.fn(async () => true))
const alertErrorMock = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/alert'), () => ({
    alertConfirm: alertConfirmMock,
    alertError: alertErrorMock,
    alertMd: vi.fn(),
    alertNormal: vi.fn(),
    alertStore: { set: vi.fn() },
}) as unknown as typeof import('src/ts/alert'))

const opfsKeysMock = vi.hoisted(() => vi.fn(async () => [] as string[]))
const opfsGetItemMock = vi.hoisted(() => vi.fn(async (key: string) => new Uint8Array()))

vi.mock(import('src/ts/storage/opfsStorage'), () => ({
    OpfsStorage: class {
        keys() { return opfsKeysMock() }
        getItem(key: string) { return opfsGetItemMock(key) }
    },
}) as unknown as typeof import('src/ts/storage/opfsStorage'))

const acquireLockMock = vi.hoisted(() => vi.fn(async () => vi.fn(async () => {})))
// A mutable slot standing in for the shared production `forageStorage`
// singleton's `realStorage` field -- O7 needs `disableOpfs()` to read which
// backend this tab is actually on, not just the `opfs_flag!` flag.
const forageStorageMock = vi.hoisted(() => ({ realStorage: null as unknown }))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    acquireExclusiveStorageMigrationLock: acquireLockMock,
    getUncleanablesSync: vi.fn(() => []),
    forageStorage: forageStorageMock,
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/storage/assetIntegrity'), () => ({
    scanAssetCacheIntegrity: vi.fn(),
    evictAssetCacheEntries: vi.fn(),
}) as unknown as typeof import('src/ts/storage/assetIntegrity'))

const markAppInitiatedReloadMock = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/reloadGuard'), () => ({
    markAppInitiatedReload: markAppInitiatedReloadMock,
}) as unknown as typeof import('src/ts/reloadGuard'))

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: { db: {} as unknown as Record<string, unknown> },
}) as unknown as typeof import('src/ts/stores.svelte'))

const targetSetItemMock = vi.hoisted(() => vi.fn(async (_key: string, _value: unknown) => {}))
const targetRemoveItemMock = vi.hoisted(() => vi.fn(async (_key: string) => {}))

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            setItem: targetSetItemMock,
            removeItem: targetRemoveItemMock,
        }),
    },
}))

import { enableOpfs, disableOpfs } from 'src/ts/storage/storageMaintenance'
import { OpfsStorage } from 'src/ts/storage/opfsStorage'

let reloadSpy: ReturnType<typeof vi.fn>

function stubStorageEstimate(usage: number, quota: number) {
    Object.defineProperty(window.navigator, 'storage', {
        value: { estimate: async () => ({ usage, quota }) },
        configurable: true,
    })
}

beforeEach(() => {
    alertConfirmMock.mockReset()
    alertConfirmMock.mockResolvedValue(true)
    alertErrorMock.mockClear()
    acquireLockMock.mockReset()
    acquireLockMock.mockResolvedValue(vi.fn(async () => {}))
    opfsKeysMock.mockReset()
    opfsKeysMock.mockResolvedValue([])
    opfsGetItemMock.mockReset()
    opfsGetItemMock.mockImplementation(async () => new Uint8Array())
    targetSetItemMock.mockReset()
    targetSetItemMock.mockResolvedValue(undefined)
    targetRemoveItemMock.mockReset()
    targetRemoveItemMock.mockResolvedValue(undefined)
    markAppInitiatedReloadMock.mockClear()
    forageStorageMock.realStorage = null
    localStorage.clear()
    reloadSpy = vi.fn()
    // happy-dom's location.reload is not implemented; stub it directly.
    Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadSpy },
        writable: true,
    })
    // Ample space by default; O6's tests override this per scenario.
    stubStorageEstimate(0, 1_000_000_000)
})

describe('enableOpfs()', () => {
    test('a declined confirm writes no flag and takes no lock', async () => {
        alertConfirmMock.mockResolvedValue(false)

        await enableOpfs()

        expect(acquireLockMock).not.toHaveBeenCalled()
        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(reloadSpy).not.toHaveBeenCalled()
    })

    test('a refused lock writes nothing and shows an error', async () => {
        alertConfirmMock.mockResolvedValue(true)
        acquireLockMock.mockResolvedValue(null)

        await enableOpfs()

        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(alertErrorMock).toHaveBeenCalled()
        expect(reloadSpy).not.toHaveBeenCalled()
    })

    test('accepted and locked: sets the flag and reloads', async () => {
        alertConfirmMock.mockResolvedValue(true)

        await enableOpfs()

        expect(localStorage.getItem('opfs_flag!')).toBe('able')
        expect(markAppInitiatedReloadMock).toHaveBeenCalled()
        expect(reloadSpy).toHaveBeenCalled()
    })
})

describe('disableOpfs()', () => {
    test('copies every key, removes "migrated", then clears the flag and reloads', async () => {
        localStorage.setItem('opfs_flag!', 'able')
        opfsKeysMock.mockResolvedValue(['a', 'b'])
        opfsGetItemMock.mockImplementation(async (key: string) => new TextEncoder().encode(`value-${key}`))
        const callOrder: string[] = []
        targetSetItemMock.mockImplementation(async (key: string) => { callOrder.push(`set:${key}`) })
        targetRemoveItemMock.mockImplementation(async (key: string) => { callOrder.push(`remove:${key}`) })

        await disableOpfs()

        expect(targetSetItemMock).toHaveBeenCalledTimes(2)
        expect(targetSetItemMock).toHaveBeenCalledWith('a', expect.anything())
        expect(targetSetItemMock).toHaveBeenCalledWith('b', expect.anything())
        expect(targetRemoveItemMock).toHaveBeenCalledWith('migrated')
        // "migrated" is removed only after every key has been copied.
        expect(callOrder.indexOf('remove:migrated')).toBe(callOrder.length - 1)
        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(markAppInitiatedReloadMock).toHaveBeenCalled()
        expect(reloadSpy).toHaveBeenCalled()
    })

    test('a declined confirm writes nothing and takes no lock', async () => {
        alertConfirmMock.mockResolvedValue(false)

        await disableOpfs()

        expect(acquireLockMock).not.toHaveBeenCalled()
        expect(targetSetItemMock).not.toHaveBeenCalled()
        expect(reloadSpy).not.toHaveBeenCalled()
    })

    test('a refused lock writes nothing and shows an error', async () => {
        acquireLockMock.mockResolvedValue(null)

        await disableOpfs()

        expect(targetSetItemMock).not.toHaveBeenCalled()
        expect(alertErrorMock).toHaveBeenCalled()
        expect(reloadSpy).not.toHaveBeenCalled()
    })

    test('disable failure: target.setItem rejects on the second key -- the flag stays, "migrated" is not removed, the lock is released exactly once, an error is shown, and there is no reload', async () => {
        localStorage.setItem('opfs_flag!', 'able')
        opfsKeysMock.mockResolvedValue(['a', 'b'])
        const releaseLockMock = vi.fn(async () => {})
        acquireLockMock.mockResolvedValue(releaseLockMock)
        targetSetItemMock
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('write failed on second key'))

        await disableOpfs()

        expect(localStorage.getItem('opfs_flag!')).toBe('able')
        expect(targetRemoveItemMock).not.toHaveBeenCalledWith('migrated')
        expect(releaseLockMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalled()
        expect(reloadSpy).not.toHaveBeenCalled()
    })
})

describe('enableOpfs() -- O6: space is checked before the lock', () => {
    test('guard: ample free space shows no extra prompt beyond the main confirm', async () => {
        stubStorageEstimate(10, 1_000_000_000) // usage=10, quota huge: free far exceeds usage
        alertConfirmMock.mockReset()
        alertConfirmMock.mockResolvedValue(true)

        await enableOpfs()

        expect(alertConfirmMock).toHaveBeenCalledTimes(1)
        expect(localStorage.getItem('opfs_flag!')).toBe('able')
    })

    test('regression reproducer: tight free space shows a second confirm before the lock, and declining it leaves the flag unset and takes no lock', async () => {
        stubStorageEstimate(600, 700) // free (100) well below usage (600) -- the copy may need about as much again
        alertConfirmMock.mockReset()
        alertConfirmMock.mockResolvedValueOnce(true) // the main "enable OPFS?" confirm
        alertConfirmMock.mockResolvedValueOnce(false) // the space-warning confirm

        await enableOpfs()

        expect(alertConfirmMock).toHaveBeenCalledTimes(2)
        expect(acquireLockMock).not.toHaveBeenCalled()
        expect(localStorage.getItem('opfs_flag!')).toBeNull()
        expect(reloadSpy).not.toHaveBeenCalled()
    })
})

describe('disableOpfs() -- O7: refuses unless this tab is actually on OPFS', () => {
    test('regression reproducer: a tab on LocalForage with the flag set by hand never runs the disable action, and never takes the lock', async () => {
        localStorage.setItem('opfs_flag!', 'able')
        // A LocalForage-shaped backend, not an OpfsStorage instance -- the flag
        // being 'able' here models the divergent state O7's refusal must catch.
        forageStorageMock.realStorage = { getItem: vi.fn(), setItem: vi.fn(), keys: vi.fn(), removeItem: vi.fn() }

        await disableOpfs()

        expect(acquireLockMock).not.toHaveBeenCalled()
        expect(targetSetItemMock).not.toHaveBeenCalled()
        expect(localStorage.getItem('opfs_flag!')).toBe('able')
        expect(reloadSpy).not.toHaveBeenCalled()
    })

    test('compatibility guard: a tab actually on OPFS still runs the disable action', async () => {
        localStorage.setItem('opfs_flag!', 'able')
        forageStorageMock.realStorage = new OpfsStorage()

        await disableOpfs()

        expect(acquireLockMock).toHaveBeenCalled()
    })
})
