/**
 * FIX 2 -- `saveDbKei` (src/ts/kei/backup.ts) read `db.account.kei` with no
 * guard for `account` itself being undefined/missing. Every save from a tab
 * with no `account` on the database threw a TypeError that the surrounding
 * try/catch swallowed into a `console.error('KEI auto-backup failed:', e)`
 * log, even though there was never an account to back up in the first
 * place.
 *
 * RED-first: this test, run against the unmodified `saveDbKei`, fails
 * because `db.account.kei` throws when `db.account` is `undefined`. The
 * catch block then unconditionally calls `console.error(...)`, which the
 * "no account -> no error log" assertion below rejects, and the fetch never
 * happens (asserted to still hold once fixed).
 *
 * Every static import of `backup.ts` other than `src/lang`-independent
 * modules is mocked so the module loads without touching real storage,
 * network, or Svelte state; `getDatabase` is the one seam this test drives
 * directly per case.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

const getDatabaseMock = vi.hoisted(() => vi.fn())
const setDatabaseMock = vi.hoisted(() => vi.fn())
const fetchMock = vi.hoisted(() => vi.fn())
const keiServerURLMock = vi.hoisted(() => vi.fn(() => 'https://kei.example.test'))

vi.mock(import('../storage/database.svelte'), () => ({
    getDatabase: getDatabaseMock,
    setDatabase: setDatabaseMock,
}) as unknown as typeof import('../storage/database.svelte'))

vi.mock(import('../globalApi.svelte'), () => ({
    requiresFullEncoderReload: { state: false },
}) as unknown as typeof import('../globalApi.svelte'))

vi.mock(import('../alert'), () => ({
    alertNormal: vi.fn(),
    alertSelect: vi.fn(),
}) as unknown as typeof import('../alert'))

vi.mock(import('./kei'), () => ({
    keiServerURL: keiServerURLMock,
}) as unknown as typeof import('./kei'))

import { saveDbKei } from './backup'

describe('saveDbKei', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock)
        fetchMock.mockReset()
        getDatabaseMock.mockReset()
        setDatabaseMock.mockReset()
        vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
    })

    test('account undefined: does not throw, does not log, and never calls fetch', async () => {
        getDatabaseMock.mockReturnValue({ account: undefined })

        await expect(saveDbKei()).resolves.toBeUndefined()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(console.error).not.toHaveBeenCalled()
    })

    test('account present but kei disabled: no fetch, no log', async () => {
        getDatabaseMock.mockReturnValue({ account: { kei: false, token: 'tok' } })

        await saveDbKei()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(console.error).not.toHaveBeenCalled()
    })

    test('account.kei enabled: still calls the backup endpoint (unchanged path)', async () => {
        fetchMock.mockResolvedValue({ status: 200 })
        getDatabaseMock.mockReturnValue({ account: { kei: true, token: 'tok' } })

        await saveDbKei()

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(
            'https://kei.example.test/autobackup/save',
            expect.objectContaining({ method: 'POST' }),
        )
        expect(console.error).not.toHaveBeenCalled()
    })
})
