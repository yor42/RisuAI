// @vitest-environment happy-dom

/**
 * Both chat literals in `characterCards.ts` (the old-format Tavern card
 * conversion in `convertOffSpecCards`, and the CCv2/v3 import in
 * `importCharacterCardSpec`) give the chat an id before any `changeChar`.
 * Neither builder function is
 * exported, so this drives the exported entry point, `importCharacterProcess`,
 * with a `.json` file for each format -- the same public seam
 * `importCharacter()` itself calls.
 *
 * Mock scaffold copied from `characterCards.hub.test.ts` (the existing
 * precedent for loading this real, heavy module), with `getDatabase` and
 * `DBState` pointed at the same shared fixture object so the pushed
 * character can be read back.
 */

import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach } from 'vitest'

//#region module mocks -- copied from characterCards.hub.test.ts

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock(import('src/ts/alert'), () => ({
    alertCardExport: vi.fn(),
    alertConfirm: vi.fn(async () => true),
    alertError: vi.fn(),
    alertInput: vi.fn(async () => ''),
    alertMd: vi.fn(),
    alertNormal: vi.fn(),
    alertStore: writable({ type: 'none', msg: '' }),
    alertWait: vi.fn(),
}) as unknown as typeof import('src/ts/alert'))

const testDb = vi.hoisted(() => ({ db: { characters: [] as unknown[] } as unknown as Record<string, unknown> }))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    defaultSdDataFunc: vi.fn(() => ({})),
    setDatabase: vi.fn(),
    importPreset: vi.fn(),
    setCurrentCharacter: vi.fn(),
    getCurrentCharacter: vi.fn(),
    getDatabase: vi.fn(() => testDb.db),
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

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: testDb,
    SettingsMenuIndex: writable(0),
    ShowRealmFrameStore: writable(false),
    selectedCharID: writable(-1),
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
}))

vi.mock('@tauri-apps/plugin-deep-link', () => ({
    onOpenUrl: vi.fn(async () => vi.fn()),
}))

//#endregion

import { changeChar } from 'src/ts/characters'
import { importCharacterProcess } from 'src/ts/characterCards'

type FixtureCharacter = { chats: { id?: string, [k: string]: unknown }[], [k: string]: unknown }

function jsonFile(name: string, obj: unknown) {
    return { name, data: new TextEncoder().encode(JSON.stringify(obj)) }
}

beforeEach(() => {
    testDb.db = { characters: [] as unknown[] } as unknown as Record<string, unknown>
    vi.mocked(changeChar).mockClear()
})

describe('characterCards.ts -- the chat literal has an id before any changeChar', () => {
    test('the old-format Tavern card conversion (convertOffSpecCards) gives the first chat an id', async () => {
        const oldFormatCard = {
            name: 'Old Format Character',
            description: 'An old-format Tavern card',
            first_mes: 'Hello there',
        }

        await importCharacterProcess(jsonFile('old-format.json', oldFormatCard))

        const characters = (testDb.db.characters as FixtureCharacter[])
        expect(characters).toHaveLength(1)
        expect(characters[0].chats[0].id).toBeTruthy()
        expect(changeChar).not.toHaveBeenCalled()
    })

    test('the CCv2/v3 import (importCharacterCardSpec) gives the first chat an id', async () => {
        const ccv2Card = {
            spec: 'chara_card_v2',
            data: {
                name: 'CCv2 Character',
                first_mes: 'Hi from CCv2',
                description: 'A CCv2 card',
                personality: '',
                scenario: '',
                mes_example: '',
                creator_notes: '',
                system_prompt: '',
                post_history_instructions: '',
                alternate_greetings: [],
                character_version: '',
                creator: '',
                tags: [],
                // `extensions.risuai` must be present (even empty), not
                // absent -- the real `structuredClone` tolerates `undefined`,
                // but this suite's global `safeStructuredClone` stub
                // (`vitest.setup.ts`) round-trips through `JSON.stringify`,
                // which cannot serialise `undefined`.
                extensions: { risuai: {} },
            },
        }

        await importCharacterProcess(jsonFile('ccv2.json', ccv2Card))

        const characters = (testDb.db.characters as FixtureCharacter[])
        expect(characters).toHaveLength(1)
        expect(characters[0].chats[0].id).toBeTruthy()
        expect(changeChar).not.toHaveBeenCalled()
    })
})
