// @vitest-environment happy-dom

/**
 * `verifyAssetIntegrity` (`src/ts/storage/storageMaintenance.ts`) with archived
 * characters: a placeholder (the "stub") in `DBState.db.characters` keeps only
 * its `image` among the asset references; its emotion images, additional
 * assets and `ccAssets` live in a cold-storage unit.
 *
 * Invariants exercised here:
 * - Every asset an archived character's unit references is among the targets
 *   scanned, together with everything the character list yields without
 *   units, each path once.
 * - A unit that cannot be read does not abort the check: the scan still runs
 *   for everything else, and the report names the character as not checked,
 *   also when no target remains at all.
 * - Units are read one at a time, as copies: the stub stays a stub and nothing
 *   is marked for save. A progress state is shown while units are read and is
 *   never left up when the check returns.
 * - With no stubs the targets are the ones `getUncleanablesSync` yields for the
 *   database.
 *
 * `getUncleanablesSync` is replaced by a fake that honours its `chars` option
 * and collects the same asset fields from whatever characters it is given.
 * Every cold-storage read goes through the mocked `readColdStorageItem`.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const readColdStorageItemMock = vi.hoisted(() => vi.fn())
const alertNormalMock = vi.hoisted(() => vi.fn())
const alertErrorMock = vi.hoisted(() => vi.fn())
const alertMdMock = vi.hoisted(() => vi.fn())
const alertConfirmMock = vi.hoisted(() => vi.fn(async () => true))
const alertStoreSetMock = vi.hoisted(() => vi.fn())
const markCharacterForSaveMock = vi.hoisted(() => vi.fn())
const scanAssetCacheIntegrityMock = vi.hoisted(() => vi.fn())

interface FakeCharacter {
    type?: string
    image?: string
    emotionImages?: Array<[string, string]>
    additionalAssets?: Array<[string, string, string]>
    ccAssets?: Array<{ uri: string }>
}

interface FakeDb {
    customBackground?: string
    characters: FakeCharacter[]
}

vi.mock(import('src/ts/alert'), () => ({
    alertConfirm: alertConfirmMock,
    alertError: alertErrorMock,
    alertMd: alertMdMock,
    alertNormal: alertNormalMock,
    alertToast: vi.fn(),
    alertWait: vi.fn(),
    alertStore: { set: alertStoreSetMock },
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('src/ts/storage/opfsStorage'), () => ({
    OpfsStorage: class {},
}) as unknown as typeof import('src/ts/storage/opfsStorage'))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    acquireExclusiveStorageMigrationLock: vi.fn(async () => vi.fn(async () => {})),
    getUncleanablesSync: vi.fn((db: FakeDb, options?: { chars: FakeCharacter[] }) => {
        const found = new Set<string>()
        const add = (path: string | undefined) => { if (path) { found.add(path) } }
        add(db.customBackground)
        for (const cha of options?.chars ?? db.characters) {
            add(cha.image)
            for (const emotion of cha.emotionImages ?? []) { add(emotion[1]) }
            for (const asset of cha.additionalAssets ?? []) { add(asset[1]) }
            if (cha.type !== 'group') {
                for (const asset of cha.ccAssets ?? []) { add(asset.uri) }
            }
        }
        return Array.from(found)
    }),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/storage/assetIntegrity'), () => ({
    scanAssetCacheIntegrity: scanAssetCacheIntegrityMock,
    evictAssetCacheEntries: vi.fn(async () => 0),
}) as unknown as typeof import('src/ts/storage/assetIntegrity'))

vi.mock(import('src/ts/reloadGuard'), () => ({
    markAppInitiatedReload: vi.fn(),
}) as unknown as typeof import('src/ts/reloadGuard'))

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: { db: {} as unknown as Record<string, unknown> },
}) as unknown as typeof import('src/ts/stores.svelte'))

vi.mock(import('src/ts/process/coldstorage.svelte'), () => ({
    readColdStorageItem: readColdStorageItemMock,
}) as unknown as typeof import('src/ts/process/coldstorage.svelte'))

vi.mock(import('src/ts/storage/characterSaveMarks'), () => ({
    markCharacterForSave: markCharacterForSaveMock,
}) as unknown as typeof import('src/ts/storage/characterSaveMarks'))

vi.mock('localforage', () => ({
    default: { createInstance: () => ({ setItem: vi.fn(), removeItem: vi.fn() }) },
}))

import { verifyAssetIntegrity } from 'src/ts/storage/storageMaintenance'
import { getUncleanablesSync } from 'src/ts/globalApi.svelte'
import { buildColdStub } from 'src/ts/process/coldCharacter'
import { DBState } from 'src/ts/stores.svelte'

//#region fixtures and helpers

type AnyCharacter = FakeCharacter & Record<string, unknown>

function fullCharacter(chaId: string, name: string, extra: FakeCharacter = {}): AnyCharacter {
    return { type: 'character', chaId, name, image: '', chats: [], chatPage: 0, creatorNotes: '', ...extra }
}

function stubOf(source: AnyCharacter, key: string): AnyCharacter {
    return buildColdStub(source as never, key, []) as unknown as AnyCharacter
}

function ok(character: AnyCharacter) {
    return { status: 'ok', value: { character } }
}

function installDb(characters: AnyCharacter[], extra: Partial<FakeDb> = {}): void {
    DBState.db = { characters, ...extra } as never
}

function summary(checked: number) {
    return { checked, mismatches: [], notCached: 0, notContentAddressed: 0, unsupported: false }
}

function scannedTargets(): string[] {
    expect(scanAssetCacheIntegrityMock).toHaveBeenCalledTimes(1)
    return scanAssetCacheIntegrityMock.mock.calls[0][0] as string[]
}

/** The text of every report or notice the user would have been shown, whichever alert function showed it. */
function shownTexts(): string[] {
    return [alertNormalMock, alertMdMock, alertErrorMock].flatMap((fn) => fn.mock.calls.map((args) => String(args[0])))
}

function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

let alertState: { type: string } | null = null

beforeEach(() => {
    for (const fn of [readColdStorageItemMock, alertNormalMock, alertErrorMock, alertMdMock, alertStoreSetMock, markCharacterForSaveMock, scanAssetCacheIntegrityMock]) {
        fn.mockReset()
    }
    alertState = null
    alertStoreSetMock.mockImplementation((value: { type: string }) => { alertState = value })
    scanAssetCacheIntegrityMock.mockImplementation(async (targets: string[]) => summary(targets.length))
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

//#endregion

describe('verifyAssetIntegrity with archived characters', () => {
    test('the assets an archived character\'s unit references are scanned with everything the list yields, each path once', async () => {
        const unitB = fullCharacter('b', 'Bella', {
            image: 'b-avatar.png',
            emotionImages: [['happy', 'b-emotion.png']],
            additionalAssets: [['pic', 'b-additional.png', 'png']],
            ccAssets: [{ uri: 'b-cc.png' }, { uri: 'a-avatar.png' }],
        })
        installDb([fullCharacter('a', 'Anna', { image: 'a-avatar.png' }), stubOf(unitB, 'unit-b')], { customBackground: 'background.png' })
        readColdStorageItemMock.mockResolvedValue(ok(unitB))
        const yieldedToday = (getUncleanablesSync as unknown as (db: unknown) => string[])(DBState.db)

        await verifyAssetIntegrity()

        const targets = scannedTargets()
        expect(targets).toEqual(expect.arrayContaining(yieldedToday))
        expect(targets).toEqual(expect.arrayContaining(['b-emotion.png', 'b-additional.png', 'b-cc.png', 'b-avatar.png', 'a-avatar.png', 'background.png']))
        expect(new Set(targets).size).toBe(targets.length)
    })

    test('an unreadable unit does not stop the scan of everything else, and the report names the character as not checked', async () => {
        const unitC = fullCharacter('c', 'Cora', { emotionImages: [['sad', 'c-emotion.png']] })
        installDb([fullCharacter('a', 'Anna', { image: 'a-avatar.png' }), stubOf(unitC, 'unit-c')])
        readColdStorageItemMock.mockResolvedValue({ status: 'error', error: new Error('disk unavailable') })

        await verifyAssetIntegrity()

        expect(scannedTargets()).toEqual(['a-avatar.png'])
        expect(shownTexts().some((text) => text.includes('Cora'))).toBe(true)
    })

    test('a missing unit is named as not checked in the report as well', async () => {
        const unitC = fullCharacter('c', 'Cora', { emotionImages: [['sad', 'c-emotion.png']] })
        installDb([fullCharacter('a', 'Anna', { image: 'a-avatar.png' }), stubOf(unitC, 'unit-c')])
        readColdStorageItemMock.mockResolvedValue({ status: 'missing' })

        await verifyAssetIntegrity()

        expect(scannedTargets()).toEqual(['a-avatar.png'])
        expect(shownTexts().some((text) => text.includes('Cora'))).toBe(true)
    })

    test('an unreadable unit is named even when no target remains to scan', async () => {
        const unitC = fullCharacter('c', 'Cora', { emotionImages: [['sad', 'c-emotion.png']] })
        installDb([fullCharacter('a', 'Anna'), stubOf(unitC, 'unit-c')])
        readColdStorageItemMock.mockResolvedValue({ status: 'error', error: new Error('disk unavailable') })

        await verifyAssetIntegrity()

        expect(scanAssetCacheIntegrityMock).not.toHaveBeenCalled()
        expect(shownTexts().some((text) => text.includes('Cora'))).toBe(true)
    })

    test('units are read one at a time as copies, the stubs stay archived, nothing is marked for save, and the progress state is never left up', async () => {
        const unitB = fullCharacter('b', 'Bella', { emotionImages: [['happy', 'b-emotion.png']] })
        const unitD = fullCharacter('d', 'Dora', { emotionImages: [['calm', 'd-emotion.png']] })
        const stubB = stubOf(unitB, 'unit-b')
        const stubD = stubOf(unitD, 'unit-d')
        installDb([stubB, fullCharacter('a', 'Anna', { image: 'a-avatar.png' }), stubD])
        let inFlight = 0
        let maxInFlight = 0
        const stateWhileReading: Array<string | undefined> = []
        readColdStorageItemMock.mockImplementation(async (key: string) => {
            inFlight++
            maxInFlight = Math.max(maxInFlight, inFlight)
            stateWhileReading.push(alertState?.type)
            await tick()
            inFlight--
            return ok(key === 'unit-b' ? unitB : unitD)
        })

        await verifyAssetIntegrity()

        expect(readColdStorageItemMock).toHaveBeenCalledTimes(2)
        expect(maxInFlight).toBe(1)
        expect(stateWhileReading).toEqual(['wait', 'wait'])
        expect(alertState?.type).not.toBe('wait')
        expect(DBState.db.characters[0]).toBe(stubB)
        expect(DBState.db.characters[2]).toBe(stubD)
        expect(stubB.coldstorage).toBe('unit-b')
        expect(stubD.coldstorage).toBe('unit-d')
        expect(markCharacterForSaveMock).not.toHaveBeenCalled()
        expect(scannedTargets()).toEqual(expect.arrayContaining(['b-emotion.png', 'd-emotion.png', 'a-avatar.png']))
    })

    test('guard: with no archived characters the scan targets are exactly what getUncleanablesSync yields for the database', async () => {
        installDb([
            fullCharacter('a', 'Anna', { image: 'a-avatar.png', emotionImages: [['happy', 'a-emotion.png']] }),
            fullCharacter('b', 'Bella', { ccAssets: [{ uri: 'b-cc.png' }] }),
        ], { customBackground: 'background.png' })
        const yieldedToday = (getUncleanablesSync as unknown as (db: unknown) => string[])(DBState.db)

        await verifyAssetIntegrity()

        expect(scannedTargets()).toEqual(yieldedToday)
        expect(readColdStorageItemMock).not.toHaveBeenCalled()
    })
})
