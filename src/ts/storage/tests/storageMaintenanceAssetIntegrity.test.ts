// @vitest-environment happy-dom

/**
 * `verifyAssetIntegrity` (`src/ts/storage/storageMaintenance.ts`, MC-088,
 * I15) scans cached assets against their own content hash and offers to
 * evict any cached asset whose content does not match its name.
 *
 * This is a pin: it drives the real, already-implemented
 * `verifyAssetIntegrity`, holding its scan/error/confirm/evict behaviour
 * against a regression rather than a still-open code path.
 *
 * Every dependency is mocked so these tests assert WHICH function ran
 * (`alertNormal`/`alertError`/`alertMd`/`alertConfirm`, `alertStore`'s
 * sequence of states) and the side effects (`evictAssetCacheEntries`'s
 * arguments), never any English wording -- the moved panel's strings are
 * localised (I15).
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'

const alertConfirmMock = vi.hoisted(() => vi.fn(async () => true))
const alertErrorMock = vi.hoisted(() => vi.fn())
const alertNormalMock = vi.hoisted(() => vi.fn())
const alertMdMock = vi.hoisted(() => vi.fn())
const alertStoreSetMock = vi.hoisted(() => vi.fn())
// A single ordered log both `alertStore.set` and `alertError` push to, so a
// test can tell whether the 'wait' state was cleared BEFORE the error was
// reported, and that nothing further overwrites `alertStore` afterward.
const callOrder = vi.hoisted(() => [] as string[])

vi.mock(import('src/ts/alert'), () => ({
    alertConfirm: alertConfirmMock,
    alertError: alertErrorMock,
    alertMd: alertMdMock,
    alertNormal: alertNormalMock,
    alertStore: { set: alertStoreSetMock },
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('src/ts/storage/opfsStorage'), () => ({
    OpfsStorage: class {},
}) as unknown as typeof import('src/ts/storage/opfsStorage'))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    acquireExclusiveStorageMigrationLock: vi.fn(async () => vi.fn(async () => {})),
    getUncleanablesSync: vi.fn(() => ['asset-a', 'asset-b']),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

const scanAssetCacheIntegrityMock = vi.hoisted(() => vi.fn())
const evictAssetCacheEntriesMock = vi.hoisted(() => vi.fn(async () => 0))

vi.mock(import('src/ts/storage/assetIntegrity'), () => ({
    scanAssetCacheIntegrity: scanAssetCacheIntegrityMock,
    evictAssetCacheEntries: evictAssetCacheEntriesMock,
}) as unknown as typeof import('src/ts/storage/assetIntegrity'))

vi.mock(import('src/ts/reloadGuard'), () => ({
    markAppInitiatedReload: vi.fn(),
}) as unknown as typeof import('src/ts/reloadGuard'))

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: { db: {} as unknown as Record<string, unknown> },
}) as unknown as typeof import('src/ts/stores.svelte'))

vi.mock('localforage', () => ({
    default: { createInstance: () => ({ setItem: vi.fn(), removeItem: vi.fn() }) },
}))

import { verifyAssetIntegrity } from 'src/ts/storage/storageMaintenance'

function makeSummary(overrides: Partial<{
    checked: number
    mismatches: { basename: string, expectedHash: string, actualHash: string }[]
    notCached: number
    notContentAddressed: number
    unsupported: boolean
}> = {}) {
    return {
        checked: 2,
        mismatches: [],
        notCached: 0,
        notContentAddressed: 0,
        unsupported: false,
        ...overrides,
    }
}

beforeEach(() => {
    alertConfirmMock.mockReset()
    alertConfirmMock.mockResolvedValue(true)
    alertErrorMock.mockReset()
    alertErrorMock.mockImplementation(() => { callOrder.push('alertError') })
    alertNormalMock.mockClear()
    alertMdMock.mockClear()
    alertStoreSetMock.mockReset()
    alertStoreSetMock.mockImplementation((v: { type: string }) => { callOrder.push(`alertStore:${v.type}`) })
    scanAssetCacheIntegrityMock.mockReset()
    evictAssetCacheEntriesMock.mockReset()
    evictAssetCacheEntriesMock.mockResolvedValue(0)
    callOrder.length = 0
})

describe('verifyAssetIntegrity()', () => {
    test('the scan rejecting: the error is shown after the wait state clears, and nothing overwrites it afterward', async () => {
        scanAssetCacheIntegrityMock.mockRejectedValue(new Error('scan failed'))

        await verifyAssetIntegrity()

        expect(alertErrorMock).toHaveBeenCalled()
        const alertStoreIndices = callOrder
            .map((entry, index) => (entry.startsWith('alertStore:') ? index : -1))
            .filter((index) => index >= 0)
        const lastAlertStoreIndex = alertStoreIndices[alertStoreIndices.length - 1]
        const noneIndex = callOrder.indexOf('alertStore:none')
        const errorIndex = callOrder.indexOf('alertError')
        expect(noneIndex).toBeGreaterThanOrEqual(0)
        expect(errorIndex).toBeGreaterThan(noneIndex)
        // The 'none' clear is the LAST alertStore write -- nothing re-arms
        // the blocking 'wait' state (or any other state) after it.
        expect(lastAlertStoreIndex).toBe(noneIndex)
    })

    test('unsupported: an error is shown', async () => {
        scanAssetCacheIntegrityMock.mockResolvedValue(makeSummary({ unsupported: true }))

        await verifyAssetIntegrity()

        expect(alertErrorMock).toHaveBeenCalled()
        expect(evictAssetCacheEntriesMock).not.toHaveBeenCalled()
    })

    test('mismatches found, confirm declined: no eviction', async () => {
        scanAssetCacheIntegrityMock.mockResolvedValue(makeSummary({
            mismatches: [{ basename: 'bad-asset', expectedHash: 'x', actualHash: 'y' }],
        }))
        alertConfirmMock.mockResolvedValue(false)

        await verifyAssetIntegrity()

        expect(alertConfirmMock).toHaveBeenCalled()
        expect(evictAssetCacheEntriesMock).not.toHaveBeenCalled()
    })

    test('mismatches found, confirm accepted: evicts exactly the mismatched basenames', async () => {
        scanAssetCacheIntegrityMock.mockResolvedValue(makeSummary({
            mismatches: [
                { basename: 'bad-asset-1', expectedHash: 'x1', actualHash: 'y1' },
                { basename: 'bad-asset-2', expectedHash: 'x2', actualHash: 'y2' },
            ],
        }))
        alertConfirmMock.mockResolvedValue(true)

        await verifyAssetIntegrity()

        expect(evictAssetCacheEntriesMock).toHaveBeenCalledWith(['bad-asset-1', 'bad-asset-2'])
    })

    test('no targets to check: reports through alertNormal without scanning', async () => {
        const { getUncleanablesSync } = await import('src/ts/globalApi.svelte')
        vi.mocked(getUncleanablesSync).mockReturnValueOnce([])

        await verifyAssetIntegrity()

        expect(alertNormalMock).toHaveBeenCalled()
        expect(scanAssetCacheIntegrityMock).not.toHaveBeenCalled()
    })
})
