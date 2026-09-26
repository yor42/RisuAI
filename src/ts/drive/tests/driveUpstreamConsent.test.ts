// @vitest-environment happy-dom

/**
 * Contract tests for the upstream-services agreement gate on Google Drive's
 * entry points, `checkDriver` and `checkDriverInit` (`src/ts/drive/drive.ts`,
 * MC-086, MC-087 #3). `checkDriver` is behind a user's own click, so it asks
 * first: on decline it neither navigates nor opens anything. `checkDriverInit`
 * runs from boot with no user action, so it never asks; without acceptance it
 * strips `code`/`state` from the URL and returns without a request, and an
 * unrecognized `state` gets the same treatment even with acceptance, since the
 * token exchange must never run for a state this app does not recognize.
 *
 * `window.location` is replaced by a plain, writable object for this file:
 * `checkDriver('save'|'load')` assigns `location.href` directly, and a real
 * `Location` would attempt actual navigation under happy-dom. `history` stays
 * real; its `replaceState` is spied and stubbed to a no-op so it never has to
 * satisfy a same-origin check against a location this file does not control.
 */

import { get, writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

//#region module mocks -- everything drive.ts imports directly, other than
// type-only imports, which do nothing observable at import time.

vi.mock(import('../../platform'), () => ({
    isTauri: false,
}) as unknown as typeof import('../../platform'))

const alertErrorMock = vi.hoisted(() => vi.fn())
const alertInputMock = vi.hoisted(() => vi.fn(async () => ''))
const openURLMock = vi.hoisted(() => vi.fn())

vi.mock(import('../../alert'), () => ({
    alertError: alertErrorMock,
    alertInput: alertInputMock,
    alertNormal: vi.fn(),
    alertSelect: vi.fn(async () => '0'),
    alertStore: { set: vi.fn() },
}) as unknown as typeof import('../../alert'))

/** The real `upstreamAgreement.ts` imports `alertStore` from `stores.svelte`,
 * not from `alert.ts`, so this mock must exist too or the real module loads
 * and its unrelated `$effect` blocks throw. */
vi.mock(import('../../stores.svelte'), () => ({
    alertStore: writable({ type: 'none', msg: '' }),
}) as unknown as typeof import('../../stores.svelte'))

vi.mock(import('../../storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => ({} as unknown as Record<string, unknown>)),
}) as unknown as typeof import('../../storage/database.svelte'))

vi.mock(import('../../globalApi.svelte'), () => ({
    dbWriteLock: { acquire: vi.fn(async () => vi.fn()) },
    forageStorage: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
        keys: vi.fn(async () => [] as string[]),
    },
    getUncleanables: vi.fn(async () => [] as string[]),
    openURL: openURLMock,
}) as unknown as typeof import('../../globalApi.svelte'))

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppData: 0 },
    exists: vi.fn(async () => false),
    readFile: vi.fn(async () => new Uint8Array()),
    readDir: vi.fn(async () => []),
    writeFile: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
    relaunch: vi.fn(),
}))

vi.mock(import('../../util'), () => ({
    sleep: vi.fn(async () => {}),
}) as unknown as typeof import('../../util'))

vi.mock(import('../../characterCards'), () => ({
    hubURL: 'https://hub.test',
}) as unknown as typeof import('../../characterCards'))

vi.mock(import('../../storage/risuSave'), () => ({
    decodeRisuSave: vi.fn(async () => ({} as unknown)),
    encodeRisuSaveLegacy: vi.fn(() => new Uint8Array()),
}) as unknown as typeof import('../../storage/risuSave'))

vi.mock(import('../../process/coldstorage.svelte'), () => ({
    collectColdStorageBackupPayloads: vi.fn(async () => ({ payloads: [], missingKeys: [], invalidKeys: [] })),
    confirmIncompleteColdStorageOperation: vi.fn(async () => true),
    getColdStorageBackupName: vi.fn((k: string) => k),
    isColdStorageBackupData: vi.fn(() => false),
    listColdDataKeys: vi.fn(async () => [] as string[]),
    setColdStorageItem: vi.fn(async () => true),
}) as unknown as typeof import('../../process/coldstorage.svelte'))

//#endregion

import { checkDriver, checkDriverInit } from '../drive'
import { alertStore } from '../../stores.svelte'
import {
    UPSTREAM_AGREEMENT_DECLINE,
    UPSTREAM_AGREEMENT_KEY,
    resetUpstreamAgreementForTests,
} from '../../upstreamAgreement'

/** Bounded, real-time poll: a hanging or never-posted prompt must fail with a
 * message naming what was expected, not hang the file or pass by accident. */
async function waitFor(predicate: () => boolean, description: string): Promise<void> {
    const deadline = Date.now() + 300
    while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error(`timed out waiting for ${description}`)
}

function errorResponse(status: number, body: string): Response {
    return {
        status,
        text: vi.fn(async () => body),
    } as unknown as Response
}

function tokenResponse(accessToken: string): Response {
    return {
        status: 200,
        json: vi.fn(async () => ({ access_token: accessToken, expires_in: 3600 })),
    } as unknown as Response
}

let fakeLocation: { href: string; search: string }

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('VITE_RISU_LEGAL_CONFIGURED', 'TRUE')
    fakeLocation = { href: 'https://example.test/app', search: '' }
    // A plain object, not the real Location: assigning `.href` must not
    // attempt real navigation, and `.search` is set directly per test.
    Object.defineProperty(window, 'location', {
        value: fakeLocation,
        writable: true,
        configurable: true,
    })
    alertStore.set({ type: 'none', msg: '' })
    localStorage.removeItem(UPSTREAM_AGREEMENT_KEY)
    resetUpstreamAgreementForTests()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    localStorage.clear()
    resetUpstreamAgreementForTests()
})

describe('checkDriver, without acceptance', () => {
    test('save: does not navigate', async () => {
        const startHref = fakeLocation.href

        const pending = checkDriver('save')
        expect(fakeLocation.href).toBe(startHref)

        await waitFor(() => get(alertStore).type === 'tos', 'checkDriver to post the agreement prompt')
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
        await pending

        expect(fakeLocation.href).toBe(startHref)
        expect(fetch).not.toHaveBeenCalled()
    })

    test('load: does not navigate', async () => {
        const startHref = fakeLocation.href

        const pending = checkDriver('load')
        expect(fakeLocation.href).toBe(startHref)

        await waitFor(() => get(alertStore).type === 'tos', 'checkDriver to post the agreement prompt')
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
        await pending

        expect(fakeLocation.href).toBe(startHref)
        expect(fetch).not.toHaveBeenCalled()
    })

    test('savetauri: does not open a window, call openURL, or fetch', async () => {
        const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        alertInputMock.mockRejectedValueOnce(new Error('no answer expected before acceptance'))

        const pending = checkDriver('savetauri')
        expect(windowOpenSpy).not.toHaveBeenCalled()
        expect(openURLMock).not.toHaveBeenCalled()

        await waitFor(() => get(alertStore).type === 'tos', 'checkDriver to post the agreement prompt')
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
        await pending

        expect(windowOpenSpy).not.toHaveBeenCalled()
        expect(openURLMock).not.toHaveBeenCalled()
        expect(fetch).not.toHaveBeenCalled()
    })

    test('loadtauri: does not open a window, call openURL, or fetch', async () => {
        const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        alertInputMock.mockRejectedValueOnce(new Error('no answer expected before acceptance'))

        const pending = checkDriver('loadtauri')
        expect(windowOpenSpy).not.toHaveBeenCalled()
        expect(openURLMock).not.toHaveBeenCalled()

        await waitFor(() => get(alertStore).type === 'tos', 'checkDriver to post the agreement prompt')
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
        await pending

        expect(windowOpenSpy).not.toHaveBeenCalled()
        expect(openURLMock).not.toHaveBeenCalled()
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe('checkDriverInit', () => {
    test('without acceptance: strips code and state, makes no request, and returns false', async () => {
        fakeLocation.href = 'https://example.test/?code=abc&state=save'
        fakeLocation.search = '?code=abc&state=save'
        vi.mocked(fetch).mockResolvedValue(errorResponse(500, 'server error'))
        const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

        const result = await checkDriverInit()

        expect(result).toBe(false)
        expect(fetch).not.toHaveBeenCalled()
        expect(replaceStateSpy).toHaveBeenCalled()
        const strippedHref = String(replaceStateSpy.mock.calls[0]?.[2])
        const strippedUrl = new URL(strippedHref, fakeLocation.href)
        expect(strippedUrl.searchParams.has('code')).toBe(false)
        expect(strippedUrl.searchParams.has('state')).toBe(false)
    })

    test('with acceptance and an unrecognized state: strips code and state, makes no request', async () => {
        localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
        resetUpstreamAgreementForTests()
        fakeLocation.href = 'https://example.test/?code=abc&state=mystery'
        fakeLocation.search = '?code=abc&state=mystery'
        vi.mocked(fetch).mockResolvedValue(errorResponse(500, 'server error'))
        const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

        const result = await checkDriverInit()

        expect(result).toBe(false)
        expect(fetch).not.toHaveBeenCalled()
        expect(replaceStateSpy).toHaveBeenCalled()
        const strippedHref = String(replaceStateSpy.mock.calls[0]?.[2])
        const strippedUrl = new URL(strippedHref, fakeLocation.href)
        expect(strippedUrl.searchParams.has('code')).toBe(false)
        expect(strippedUrl.searchParams.has('state')).toBe(false)
    })

    test('a state with no code: strips state, makes no request, and returns false', async () => {
        localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
        resetUpstreamAgreementForTests()
        fakeLocation.href = 'https://example.test/?state=save'
        fakeLocation.search = '?state=save'
        const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

        const result = await checkDriverInit()

        expect(result).toBe(false)
        expect(fetch).not.toHaveBeenCalled()
        expect(replaceStateSpy).toHaveBeenCalled()
        const strippedHref = String(replaceStateSpy.mock.calls[0]?.[2])
        const strippedUrl = new URL(strippedHref, fakeLocation.href)
        expect(strippedUrl.searchParams.has('state')).toBe(false)
    })

    test('with acceptance and a known state: the existing flow still makes its request', async () => {
        localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
        resetUpstreamAgreementForTests()
        fakeLocation.href = 'https://example.test/?code=abc&state=savetauri'
        fakeLocation.search = '?code=abc&state=savetauri'
        vi.mocked(fetch).mockResolvedValue(tokenResponse('tok'))

        await checkDriverInit()

        expect(fetch).toHaveBeenCalledTimes(1)
        const [url] = vi.mocked(fetch).mock.calls[0]
        expect(String(url)).toContain('code=abc')
    })
})
