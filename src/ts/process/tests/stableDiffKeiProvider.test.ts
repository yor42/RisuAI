// @vitest-environment happy-dom

/**
 * `sdProvider === 'kei'` names a removed image provider (MC-080). Upstream
 * data can still carry it, so both entry points must fail loudly instead of
 * reaching a network call: `stableDiff()` before `requestChatData`, and
 * `generateAIImage()` before `globalFetch`.
 *
 * Drives the REAL `src/ts/process/stableDiff.ts`. Every module it imports
 * directly is mocked below (`storage/database.svelte`, `process/request/request`,
 * `alert`, `globalApi.svelte`, `stores.svelte`, `process/processzip`), each
 * reduced to only the export `stableDiff.ts` itself reads. `svelte/store`,
 * `src/lang` and `lodash/random` are real: none of them touch the network or
 * carry a heavy import graph.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { writable } from 'svelte/store'

//#region module mocks -- every direct import of stableDiff.ts, reduced to
// only the export it reads from each.

const alertErrorMock = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/alert'), () => ({
    alertError: alertErrorMock,
}) as unknown as typeof import('src/ts/alert'))

const testDb = vi.hoisted(() => ({} as Record<string, unknown>))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => testDb),
}) as unknown as typeof import('src/ts/storage/database.svelte'))

const globalFetchMock = vi.hoisted(() => vi.fn())
const fetchNativeMock = vi.hoisted(() => vi.fn())
const readImageMock = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    fetchNative: fetchNativeMock,
    globalFetch: globalFetchMock,
    readImage: readImageMock,
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/stores.svelte'), () => ({
    CharEmotion: writable({}),
}) as unknown as typeof import('src/ts/stores.svelte'))

const processZipMock = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/process/processzip'), () => ({
    processZip: processZipMock,
}) as unknown as typeof import('src/ts/process/processzip'))

const requestChatDataMock = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/process/request/request'), () => ({
    requestChatData: requestChatDataMock,
}) as unknown as typeof import('src/ts/process/request/request'))

//#endregion

import { stableDiff, generateAIImage } from 'src/ts/process/stableDiff'
import { language } from 'src/lang'
import type { character } from 'src/ts/storage/database.svelte'

function makeCharacter(): character {
    return {
        chaId: 'kei-char',
        name: 'Kei Test Character',
        newGenData: {
            prompt: 'a picture of {{slot}}',
            negative: 'blurry',
            instructions: 'draw the scene',
            emotionInstructions: '',
        },
    } as unknown as character
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    for (const key of Object.keys(testDb)) {
        delete testDb[key]
    }
    testDb.sdProvider = 'kei'
    alertErrorMock.mockClear()
    requestChatDataMock.mockReset()
    globalFetchMock.mockReset()
    fetchNativeMock.mockReset()
    processZipMock.mockReset()
    localStorage.clear()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('stableDiff() with sdProvider "kei"', () => {
    test('never calls requestChatData for the removed provider', async () => {
        requestChatDataMock.mockResolvedValue({ type: 'fail', result: 'should not be reached' })

        await stableDiff(makeCharacter(), 'chat text')

        expect(requestChatDataMock).not.toHaveBeenCalled()
    })

    test('shows the unsupported-provider message and returns false, without ever reaching generateAIImage\'s network call', async () => {
        requestChatDataMock.mockResolvedValue({ type: 'fail', result: 'should not be reached' })

        const result = await stableDiff(makeCharacter(), 'chat text')

        expect(result).toBe(false)
        expect(alertErrorMock).toHaveBeenCalledWith(language.keiImageProviderUnavailable)
        expect(globalFetchMock).not.toHaveBeenCalled()
    })
})

describe('generateAIImage() with sdProvider "kei"', () => {
    test('never calls globalFetch for the removed provider', async () => {
        globalFetchMock.mockResolvedValue({ ok: false, data: { message: 'should not be reached' } })

        await generateAIImage('a prompt', makeCharacter(), 'neg', '')

        expect(globalFetchMock).not.toHaveBeenCalled()
    })

    test('shows the unsupported-provider message and returns false', async () => {
        globalFetchMock.mockResolvedValue({ ok: false, data: { message: 'should not be reached' } })

        const result = await generateAIImage('a prompt', makeCharacter(), 'neg', '')

        expect(result).toBe(false)
        expect(alertErrorMock).toHaveBeenCalledWith(language.keiImageProviderUnavailable)
    })
})
