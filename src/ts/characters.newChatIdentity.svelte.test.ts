/**
 * `createNewChat` (the New Chat handler shared by `ChatList.svelte` and
 * `SideChatList.svelte`, in `src/ts/characters.ts`), `createNewGroup` and
 * `createBlankChar` each give the chat they create an id. `changeChar`
 * restoring a cold-storage character reaches the same guarantee through
 * `characterFormatUpdate`'s own per-chat fill.
 *
 * This file drives the REAL `src/ts/characters.ts`. Every other module it
 * imports is mocked below, following the precedent in
 * `characters.saveMarks.svelte.test.ts` (same source file, same import set).
 */
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Database, character, groupChat, Chat } from './storage/database.svelte'

//#region module mocks -- copied from characters.saveMarks.svelte.test.ts

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
        CharEmotion: writable({}),
        MobileGUIStack: writable([]),
        OpenRealmStore: writable(null),
    } as unknown as typeof import('src/ts/stores.svelte')
})

const requiresFullEncoderReloadMock = vi.hoisted(() => ({ state: false }))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    AppendableBuffer: class {},
    changeChatTo: vi.fn(),
    checkCharOrder: vi.fn(),
    downloadFile: vi.fn(),
    getFileSrc: vi.fn(),
    requiresFullEncoderReload: requiresFullEncoderReloadMock,
    forageStorage: {
        keys: vi.fn(async () => []),
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
    },
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/alert'), () => ({
    alertAddCharacter: vi.fn(),
    alertConfirm: vi.fn(async () => true),
    alertError: vi.fn(),
    alertNormal: vi.fn(),
    alertSelect: vi.fn(),
    alertStore: writable({ type: 'none', msg: '' }),
    alertWait: vi.fn(),
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('src/ts/storage/database.svelte'), async () => {
    // Dynamic import of an already-mocked module resolves to that same mock
    // (Vitest hoists vi.mock factories before this one runs), so
    // getCharacterByIndex/setCharacterByIndex below read and write the same
    // live DBState.db the rest of this file drives characters.ts through.
    const { DBState: liveDBState } = await import('src/ts/stores.svelte')
    return {
        getDatabase: vi.fn(() => liveDBState.db),
        setDatabase: vi.fn((db: Database) => { liveDBState.db = db }),
        presetTemplate: { name: 'test-preset' },
        saveImage: vi.fn(),
        defaultSdDataFunc: vi.fn(() => ({})),
        getCharacterByIndex: vi.fn((index: number) => liveDBState.db.characters?.[index]),
        setCharacterByIndex: vi.fn((index: number, char: unknown) => {
            liveDBState.db.characters[index] = char as never
        }),
    } as unknown as typeof import('src/ts/storage/database.svelte')
})

const memberFixtures = vi.hoisted(() => new Map<string, { firstMessage: string }>())

vi.mock(import('src/ts/util'), () => ({
    checkNullish: vi.fn((v: unknown) => v === null || v === undefined),
    findCharacterbyId: vi.fn((id: string) => memberFixtures.get(id)),
    findCharacterIndexbyId: vi.fn(() => -1),
    getUserName: vi.fn(() => 'User'),
    selectMultipleFile: vi.fn(),
    selectSingleFile: vi.fn(),
}) as unknown as typeof import('src/ts/util'))

vi.mock(import('src/ts/media'), () => ({
    getImageType: vi.fn(),
}) as unknown as typeof import('src/ts/media'))

vi.mock(import('src/ts/process/inlayScreen'), () => ({
    updateInlayScreen: vi.fn(),
}) as unknown as typeof import('src/ts/process/inlayScreen'))

vi.mock(import('src/ts/parser/parser.svelte'), () => ({
    parseMarkdownSafe: vi.fn(),
    hasher: vi.fn((s: string) => s),
}) as unknown as typeof import('src/ts/parser/parser.svelte'))

vi.mock(import('src/ts/translator/translator'), () => ({
    translateHTML: vi.fn(),
}) as unknown as typeof import('src/ts/translator/translator'))

vi.mock(import('src/ts/process/index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('src/ts/process/index.svelte'))

vi.mock(import('src/ts/characterCards'), () => ({
    importCharacter: vi.fn(),
}) as unknown as typeof import('src/ts/characterCards'))

vi.mock(import('src/ts/pngChunk'), () => ({
    PngChunk: class {},
}) as unknown as typeof import('src/ts/pngChunk'))

vi.mock(import('src/ts/process/coldstorage.svelte'), () => ({
    getColdStorageItem: vi.fn(),
    makeColdData: vi.fn(),
}) as unknown as typeof import('src/ts/process/coldstorage.svelte'))

vi.mock(import('src/ts/media/avatarThumb'), () => ({
    getAvatarThumbSrc: vi.fn(),
    isThumbEligible: vi.fn(() => false),
}) as unknown as typeof import('src/ts/media/avatarThumb'))

vi.mock(import('src/ts/storage/characterSaveMarks'), () => ({
    markCharacterForSave: vi.fn(),
}) as unknown as typeof import('src/ts/storage/characterSaveMarks'))

//#endregion

import { DBState } from 'src/ts/stores.svelte'
import { createNewChat, createNewGroup, createBlankChar, changeChar } from './characters'
import { getColdStorageItem } from 'src/ts/process/coldstorage.svelte'

//#region fixture helpers

function makeChat(id: string | undefined, name: string, message: Chat['message'] = []): Chat {
    return { id, message, note: '', name, localLore: [] } as unknown as Chat
}

function makeGroup(chats: Chat[], members: string[]): groupChat {
    return {
        type: 'group',
        name: 'Test Group',
        firstMessage: '',
        chats,
        chatFolders: [],
        chatPage: 0,
        viewScreen: 'none',
        globalLore: [],
        characters: members,
        autoMode: false,
        useCharacterLore: true,
        emotionImages: [],
        customscript: [],
        chaId: 'group-1',
        firstMsgIndex: -1,
        characterTalks: [],
        characterActive: [],
        realmId: '',
    } as unknown as groupChat
}

function makeSoloCharacter(chats: Chat[]): character {
    return {
        type: 'character',
        name: 'Solo',
        chats,
        chatPage: 0,
        chaId: 'solo-1',
    } as unknown as character
}

/**
 * Calls `createNewChat` exactly the way both New Chat buttons call it. Kept
 * as the one call site in this file so a future signature change only needs
 * updating here.
 */
function callCreateNewChat(cha: character | groupChat): number {
    return createNewChat(cha)
}

//#endregion

beforeEach(() => {
    memberFixtures.clear()
})

describe('createNewChat -- New Chat gives the new chat an id', () => {
    test('the new chat gets an id', () => {
        const cha = makeSoloCharacter([makeChat('existing-1', 'Chat 1')])

        callCreateNewChat(cha)

        expect(cha.chats[0].id).toBeTruthy()
    })
})

describe('createNewChat -- group New Chat', () => {
    test('every group member\'s greeting lands in the new chat at index 0', () => {
        memberFixtures.set('member-1', { firstMessage: 'Hello from member 1' })
        memberFixtures.set('member-2', { firstMessage: 'Hello from member 2' })
        const chatA = makeChat('chat-a', 'Chat A', [{ role: 'user', data: 'existing A' } as unknown as Chat['message'][number]])
        const chatB = makeChat('chat-b', 'Chat B', [{ role: 'user', data: 'existing B' } as unknown as Chat['message'][number]])
        const group = makeGroup([chatA, chatB], ['member-1', 'member-2'])

        callCreateNewChat(group)

        expect(group.chats[0].message).toEqual([
            { saying: 'member-1', role: 'char', data: 'Hello from member 1' },
            { saying: 'member-2', role: 'char', data: 'Hello from member 2' },
        ])
    })

    test('every other chat\'s message is unchanged', () => {
        memberFixtures.set('member-1', { firstMessage: 'Hello from member 1' })
        const chatA = makeChat('chat-a', 'Chat A', [{ role: 'user', data: 'existing A' } as unknown as Chat['message'][number]])
        const chatB = makeChat('chat-b', 'Chat B', [{ role: 'user', data: 'existing B' } as unknown as Chat['message'][number]])
        const chatAMessageBefore = structuredClone(chatA.message)
        const chatBMessageBefore = structuredClone(chatB.message)
        const group = makeGroup([chatA, chatB], ['member-1'])

        callCreateNewChat(group)

        const survivingChatA = group.chats.find((c) => c.id === 'chat-a')!
        const survivingChatB = group.chats.find((c) => c.id === 'chat-b')!
        expect(survivingChatA.message).toEqual(chatAMessageBefore)
        expect(survivingChatB.message).toEqual(chatBMessageBefore)
    })

    test('the returned index opens the new chat (index 0)', () => {
        memberFixtures.set('member-1', { firstMessage: 'Hello from member 1' })
        const chatA = makeChat('chat-a', 'Chat A')
        const group = makeGroup([chatA], ['member-1'])

        const openIndex = callCreateNewChat(group)

        expect(openIndex).toBe(0)
    })
})

describe('createNewChat -- group New Chat with a single member', () => {
    test('every group member\'s greeting lands in the new chat at index 0', () => {
        memberFixtures.set('member-1', { firstMessage: 'Hello from member 1' })
        const chatA = makeChat('chat-a', 'Chat A', [{ role: 'user', data: 'existing A' } as unknown as Chat['message'][number]])
        const group = makeGroup([chatA], ['member-1'])

        callCreateNewChat(group)

        expect(group.chats[0].message).toEqual([
            { saying: 'member-1', role: 'char', data: 'Hello from member 1' },
        ])
    })

    test('every other chat\'s message is unchanged', () => {
        memberFixtures.set('member-1', { firstMessage: 'Hello from member 1' })
        const chatA = makeChat('chat-a', 'Chat A', [{ role: 'user', data: 'existing A' } as unknown as Chat['message'][number]])
        const chatAMessageBefore = structuredClone(chatA.message)
        const group = makeGroup([chatA], ['member-1'])

        callCreateNewChat(group)

        const survivingChatA = group.chats.find((c) => c.id === 'chat-a')!
        expect(survivingChatA.message).toEqual(chatAMessageBefore)
    })
})

describe('createNewGroup and createBlankChar -- the first chat has an id', () => {
    test('createNewGroup\'s first chat has an id', () => {
        DBState.db = { characters: [] } as unknown as Database

        const idx = createNewGroup()

        expect(DBState.db.characters[idx].chats[0].id).toBeTruthy()
    })

    test('createBlankChar\'s first chat has an id', () => {
        const cha = createBlankChar()

        expect(cha.chats[0].id).toBeTruthy()
    })
})

// Coverage, not proof: characterFormatUpdate fills every missing chat id on
// the character changeChar hands it, separately from the plugin install
// fills, so this test cannot tell whether those fills exist; it pins that a
// cold-storage restore reaches characterFormatUpdate's fill.
describe('changeChar restoring a cold-storage character -- every chat gets an id', () => {
    test('a restored blob whose chats have no ids ends up with every chat id filled and none duplicated', async () => {
        DBState.db = {
            characters: [{
                chaId: 'cold-char-1',
                name: 'Cold Character',
                type: 'character',
                coldstorage: 'cold-key-1',
                chatPage: 0,
                chats: [],
            }],
        } as unknown as Database

        vi.mocked(getColdStorageItem).mockResolvedValue({
            character: {
                chaId: 'cold-char-1',
                name: 'Cold Character',
                type: 'character',
                chatPage: 0,
                globalLore: [],
                // Skips characterFormatUpdate's updateInlayScreen call, which
                // is mocked here to a bare vi.fn() (it is exercised for real
                // in updateInlayScreen's own tests, not this one).
                newGenData: true,
                chats: [
                    { message: [], note: '', name: 'Chat 1', localLore: [] },
                    { message: [], note: '', name: 'Chat 2', localLore: [] },
                ],
            },
        } as never)

        await changeChar(0)

        const restored = DBState.db.characters[0] as unknown as character
        expect(restored.coldstorage).toBeFalsy()
        for (const chat of restored.chats) {
            expect(chat.id).toBeTruthy()
        }
        expect(new Set(restored.chats.map((c) => c.id)).size).toBe(restored.chats.length)
    })
})
