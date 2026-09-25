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

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    acquireExclusiveStorageMigrationLock: acquireLockMock,
    getUncleanablesSync: vi.fn(() => []),
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

let reloadSpy: ReturnType<typeof vi.fn>

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
    localStorage.clear()
    reloadSpy = vi.fn()
    // happy-dom's location.reload is not implemented; stub it directly.
    Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadSpy },
        writable: true,
    })
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
