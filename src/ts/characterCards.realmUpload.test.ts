// @vitest-environment happy-dom

/**
 * `openRealmUpload(target)` (`src/ts/characterCards.ts`) is the single
 * opener for the Realm upload frame (MC-080, MC-087 #4). For a character
 * that already has a `realmId`, uploading again creates a NEW Realm listing,
 * since editing an existing listing in-app is not supported, so it must show
 * a confirm naming that before ever touching `ShowRealmFrameStore`. Declining
 * must leave the store untouched. A character with no `realmId`, and every
 * preset target, upload without asking.
 *
 * `exportChar`'s realm option is the one production call site already
 * exercised by an existing user action (I7): it must route through
 * `openRealmUpload` rather than writing `ShowRealmFrameStore` on its own, so
 * every scenario below that goes through `exportChar` holds it to the same
 * confirm-before-store-write invariant as a direct call.
 *
 * The module-mock set below is copied, unchanged in shape, from
 * `characterCards.hub.test.ts` (the existing precedent for loading the real
 * `characterCards.ts`), with `alertConfirm`, `getDatabase`, `ShowRealmFrameStore`
 * and `selectedCharID` replaced by controllable fakes this file needs.
 */

import { get, writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

//#region module mocks -- everything characterCards.ts imports directly,
// other than svelte/store, uuid, src/lang and type-only imports, none of
// which do anything observable at import time.

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('src/ts/platform'))

const alertConfirmMock = vi.hoisted(() => vi.fn(async () => true))
const alertCardExportMock = vi.hoisted(() => vi.fn(async () => ({ type: '', type2: '' })))

vi.mock(import('src/ts/alert'), () => ({
    alertCardExport: alertCardExportMock,
    alertConfirm: alertConfirmMock,
    alertError: vi.fn(),
    alertInput: vi.fn(async () => ''),
    alertMd: vi.fn(),
    alertNormal: vi.fn(),
    alertStore: writable({ type: 'none', msg: '' }),
    alertWait: vi.fn(),
}) as unknown as typeof import('src/ts/alert'))

const testDb = vi.hoisted(() => ({ characters: [] as unknown[] } as Record<string, unknown>))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    defaultSdDataFunc: vi.fn(() => ({})),
    setDatabase: vi.fn(),
    importPreset: vi.fn(),
    setCurrentCharacter: vi.fn(),
    getCurrentCharacter: vi.fn(),
    getDatabase: vi.fn(() => testDb),
    setDatabaseLite: vi.fn(),
    appVer: 'test',
}) as unknown as typeof import('src/ts/storage/database.svelte'))

vi.mock(import('src/ts/util'), () => ({
    checkNullish: vi.fn((v: unknown) => v === null || v === undefined),
    decryptBuffer: vi.fn(async (d: unknown) => d),
    isKnownUri: vi.fn(() => false),
    selectFileByDom: vi.fn(async () => null),
    sleep: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/util'))

vi.mock(import('src/ts/characters'), () => ({
    changeChar: vi.fn(async () => {}),
    characterFormatUpdate: vi.fn((c: unknown) => c),
}) as unknown as typeof import('src/ts/characters'))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    AppendableBuffer: class {},
    BlankWriter: class {},
    LocalWriter: class {},
    VirtualWriter: class {},
    checkCharOrder: vi.fn(),
    downloadFile: vi.fn(async () => {}),
    forageStorage: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) },
    loadAsset: vi.fn(async () => new Uint8Array()),
    openURL: vi.fn(),
    readImage: vi.fn(async (d: unknown) => d),
    saveAsset: vi.fn(async () => ''),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/media'), () => ({
    compressImage: vi.fn(async (d: unknown) => d),
    getImageType: vi.fn(() => 'png'),
}) as unknown as typeof import('src/ts/media'))

const showRealmFrameStore = vi.hoisted(() => {
    let value = ''
    const subs = new Set<(v: string) => void>()
    return {
        subscribe(fn: (v: string) => void) {
            fn(value)
            subs.add(fn)
            return () => subs.delete(fn)
        },
        set(v: string) {
            value = v
            subs.forEach((fn) => fn(value))
        },
    }
})
const selectedCharID = vi.hoisted(() => {
    let value = -1
    const subs = new Set<(v: number) => void>()
    return {
        subscribe(fn: (v: number) => void) {
            fn(value)
            subs.add(fn)
            return () => subs.delete(fn)
        },
        set(v: number) {
            value = v
            subs.forEach((fn) => fn(value))
        },
    }
})

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: testDb,
    SettingsMenuIndex: writable(0),
    ShowRealmFrameStore: showRealmFrameStore,
    alertStore: writable({ type: 'none', msg: '' }),
    selectedCharID,
    settingsOpen: writable(false),
}) as unknown as typeof import('src/ts/stores.svelte'))

vi.mock(import('src/ts/parser/parser.svelte'), () => ({
    hasher: vi.fn((s: string) => s),
}) as unknown as typeof import('src/ts/parser/parser.svelte'))

vi.mock(import('src/ts/process/files/inlays'), () => ({
    reencodeImage: vi.fn(async (d: unknown) => d),
}) as unknown as typeof import('src/ts/process/files/inlays'))

vi.mock(import('src/ts/pngChunk'), () => ({
    PngChunk: class {},
}) as unknown as typeof import('src/ts/pngChunk'))

vi.mock(import('src/ts/process/processzip'), () => ({
    CharXImporter: class {},
    CharXWriter: class {},
}) as unknown as typeof import('src/ts/process/processzip'))

vi.mock(import('src/ts/process/modules'), () => ({
    exportModuleLegacy: vi.fn(),
    readModule: vi.fn(),
}) as unknown as typeof import('src/ts/process/modules'))

vi.mock('@tauri-apps/plugin-fs', () => ({
    readFile: vi.fn(async () => new Uint8Array()),
    writeFile: vi.fn(async () => {}),
    BaseDirectory: { AppData: 0 },
}))

vi.mock('@tauri-apps/plugin-deep-link', () => ({
    onOpenUrl: vi.fn(async () => vi.fn()),
}))

//#endregion

import { exportChar, hubURL, openRealmUpload } from 'src/ts/characterCards'
import { language } from 'src/lang'
import { alertStore } from 'src/ts/stores.svelte'
import {
    UPSTREAM_AGREEMENT_ACCEPT,
    UPSTREAM_AGREEMENT_DECLINE,
    UPSTREAM_AGREEMENT_KEY,
    resetUpstreamAgreementForTests,
} from 'src/ts/upstreamAgreement'

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

function makeCharacter(realmId: string) {
    return {
        type: 'character' as const,
        name: 'Realm Test Character',
        image: 'some-image-id',
        realmId,
        chats: [],
    }
}

function installCharacter(realmId: string, index = 0): void {
    testDb.characters = [makeCharacter(realmId)]
    selectedCharID.set(index)
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('VITE_RISU_LEGAL_CONFIGURED', 'TRUE')
    alertConfirmMock.mockReset()
    alertConfirmMock.mockResolvedValue(true)
    alertCardExportMock.mockReset()
    alertCardExportMock.mockResolvedValue({ type: 'realm', type2: '' })
    showRealmFrameStore.set('')
    alertStore.set({ type: 'none', msg: '' })
    // Every case above the decline-focused describes below exercises
    // openRealmUpload/exportChar on the far side of the consent gate.
    localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
    resetUpstreamAgreementForTests()
    void hubURL // referenced so the real module's top-level export is exercised
})

afterEach(() => {
    // Not vi.unstubAllGlobals(): that would also remove vitest.setup.ts's
    // safeStructuredClone stub, which exportChar needs on every test after
    // the first. beforeEach's own vi.stubGlobal('fetch', ...) call already
    // gives every test a fresh fetch mock.
    vi.unstubAllEnvs()
    localStorage.clear()
    resetUpstreamAgreementForTests()
})

describe('exportChar\'s realm option, for a character that already has a realmId', () => {
    test('asks for confirmation before ever touching ShowRealmFrameStore, and Cancel leaves it untouched', async () => {
        installCharacter('existing-realm-id')
        alertConfirmMock.mockResolvedValue(false)

        await exportChar(0)

        expect(alertConfirmMock).toHaveBeenCalledWith(language.realmNewListingConfirm)
        expect(get(showRealmFrameStore)).toBe('')
    })

    test('the store is still empty while the confirm is pending, and only becomes "character" once accepted', async () => {
        installCharacter('existing-realm-id')
        let resolveConfirm: (v: boolean) => void = () => {}
        alertConfirmMock.mockImplementation(() => new Promise<boolean>((resolve) => { resolveConfirm = resolve }))

        const pending = exportChar(0)
        // Let `alertCardExport()` (already resolved) and any synchronous
        // continuation up to the confirm settle, without resolving the
        // confirm itself yet.
        await Promise.resolve()
        await Promise.resolve()
        expect(get(showRealmFrameStore)).toBe('')

        resolveConfirm(true)
        await pending

        expect(get(showRealmFrameStore)).toBe('character')
    })

    test('accepting the confirm uploads (sets the store to "character")', async () => {
        installCharacter('existing-realm-id')
        alertConfirmMock.mockResolvedValue(true)

        await exportChar(0)

        expect(get(showRealmFrameStore)).toBe('character')
    })
})

describe('exportChar\'s realm option, for a character with no realmId', () => {
    test('uploads without ever asking for confirmation', async () => {
        installCharacter('')
        alertConfirmMock.mockResolvedValue(false)

        await exportChar(0)

        expect(alertConfirmMock).not.toHaveBeenCalled()
        expect(get(showRealmFrameStore)).toBe('character')
    })
})

describe('openRealmUpload(target), driven directly, for the selected character with a realmId', () => {
    test('asks for confirmation before ever touching ShowRealmFrameStore, and Cancel leaves it untouched', async () => {
        installCharacter('existing-realm-id')
        alertConfirmMock.mockResolvedValue(false)

        await openRealmUpload('character')

        expect(alertConfirmMock).toHaveBeenCalledWith(language.realmNewListingConfirm)
        expect(get(showRealmFrameStore)).toBe('')
    })

    test('the store is still empty while the confirm is pending, and only becomes "character" once accepted', async () => {
        installCharacter('existing-realm-id')
        let resolveConfirm: (v: boolean) => void = () => {}
        alertConfirmMock.mockImplementation(() => new Promise<boolean>((resolve) => { resolveConfirm = resolve }))

        const pending = openRealmUpload('character')
        await Promise.resolve()
        await Promise.resolve()
        expect(get(showRealmFrameStore)).toBe('')

        resolveConfirm(true)
        await pending

        expect(get(showRealmFrameStore)).toBe('character')
    })
})

describe('openRealmUpload(target), driven directly, with no confirm expected', () => {
    test('the selected character has no realmId: uploads without asking', async () => {
        installCharacter('')
        alertConfirmMock.mockResolvedValue(false)

        await openRealmUpload('character')

        expect(alertConfirmMock).not.toHaveBeenCalled()
        expect(get(showRealmFrameStore)).toBe('character')
    })

    test('a preset target: uploads without asking, even when the selected character has a realmId', async () => {
        installCharacter('existing-realm-id')
        alertConfirmMock.mockResolvedValue(false)

        await openRealmUpload('preset:0')

        expect(alertConfirmMock).not.toHaveBeenCalled()
        expect(get(showRealmFrameStore)).toBe('preset:0')
    })
})

describe("openRealmUpload('preset:0'), without acceptance of the upstream agreement", () => {
    test('leaves ShowRealmFrameStore empty, including while the agreement prompt is pending', async () => {
        localStorage.removeItem(UPSTREAM_AGREEMENT_KEY)
        resetUpstreamAgreementForTests()

        const pending = openRealmUpload('preset:0')
        expect(get(showRealmFrameStore)).toBe('')

        await waitFor(() => get(alertStore).type === 'tos', 'openRealmUpload to post the agreement prompt')
        expect(get(showRealmFrameStore)).toBe('')
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })

        await pending
        expect(get(showRealmFrameStore)).toBe('')
    })
})

describe("exportChar's realm option, without acceptance of the upstream agreement", () => {
    test('leaves ShowRealmFrameStore empty for a character with no realmId', async () => {
        installCharacter('')
        localStorage.removeItem(UPSTREAM_AGREEMENT_KEY)
        resetUpstreamAgreementForTests()

        const pending = exportChar(0)
        expect(get(showRealmFrameStore)).toBe('')

        await waitFor(() => get(alertStore).type === 'tos', 'exportChar to post the agreement prompt')
        expect(get(showRealmFrameStore)).toBe('')
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
        await pending

        expect(get(showRealmFrameStore)).toBe('')
    })
})

describe('order: the agreement prompt precedes the new-listing confirm', () => {
    test('for a character with a realmId, the agreement is answered before the confirm is shown; the store stays empty while either is pending, and accepting both writes it', async () => {
        installCharacter('existing-realm-id')
        localStorage.removeItem(UPSTREAM_AGREEMENT_KEY)
        resetUpstreamAgreementForTests()
        let resolveConfirm: (v: boolean) => void = () => {}
        alertConfirmMock.mockImplementation(() => new Promise<boolean>((resolve) => { resolveConfirm = resolve }))

        const pending = openRealmUpload('character')
        await Promise.resolve()
        await Promise.resolve()

        // The agreement prompt must be live before the new-listing confirm is
        // ever shown, so a user who has not agreed cannot reach it.
        expect(get(alertStore).type).toBe('tos')
        expect(alertConfirmMock).not.toHaveBeenCalled()
        expect(get(showRealmFrameStore)).toBe('')

        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
        await waitFor(() => alertConfirmMock.mock.calls.length > 0, 'the new-listing confirm to be shown')
        expect(get(showRealmFrameStore)).toBe('')

        resolveConfirm(true)
        await pending

        expect(get(showRealmFrameStore)).toBe('character')
    })
})
