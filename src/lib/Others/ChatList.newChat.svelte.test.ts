// @vitest-environment happy-dom

/**
 * Clicking New Chat in a mounted `ChatList.svelte` gives the new chat an id
 * and opens index 0.
 *
 * Mounts the REAL `ChatList.svelte` and the REAL `src/ts/characters.ts`
 * (so the click goes through the actual `createNewChat` call site, not a
 * stand-in). Every other module `characters.ts` transitively pulls in is
 * mocked, following the precedent in `characters.saveMarks.svelte.test.ts`
 * and the mount-test precedent in `Chat.messageEditor.svelte.test.ts`.
 * `changeChatTo` is a spy so the opened index can be asserted directly.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Database, character } from 'src/ts/storage/database.svelte'

//#region module mocks

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
        ReloadGUIPointer: writable(0),
        CharEmotion: writable({}),
        MobileGUIStack: writable([]),
        OpenRealmStore: writable(null),
    } as unknown as typeof import('src/ts/stores.svelte')
})

const changeChatToSpy = vi.hoisted(() => vi.fn())

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    AppendableBuffer: class {},
    changeChatTo: changeChatToSpy,
    checkCharOrder: vi.fn(),
    downloadFile: vi.fn(),
    getFileSrc: vi.fn(),
    requiresFullEncoderReload: { state: false },
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

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => (globalThis as unknown as { __testDBState: Database }).__testDBState),
    setDatabase: vi.fn(),
    presetTemplate: { name: 'test-preset' },
    saveImage: vi.fn(),
    defaultSdDataFunc: vi.fn(() => ({})),
    getCharacterByIndex: vi.fn(),
    setCharacterByIndex: vi.fn(),
}) as unknown as typeof import('src/ts/storage/database.svelte'))

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

import { DBState, selectedCharID } from 'src/ts/stores.svelte'
import ChatList from './ChatList.svelte'

//#region fixture helpers

function makeCharacter(chats: character['chats']): character {
    return {
        type: 'character',
        name: 'Solo',
        chats,
        chatPage: 0,
        chaId: 'solo-1',
    } as unknown as character
}

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

function mountChatList(props: Record<string, unknown> = {}) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    const instance = mount(ChatList, { target, props })
    mountedInstances.push(instance)
    flushSync()
    return { target, instance }
}

//#endregion

afterEach(async () => {
    const instances = mountedInstances.splice(0)
    for (const instance of instances) {
        await unmount(instance as never).catch(() => {})
    }
    mountedTargets.splice(0).forEach((t) => t.remove())
    document.body.replaceChildren()
    changeChatToSpy.mockClear()
    memberFixtures.clear()
})

describe('ChatList.svelte New Chat button', () => {
    test('clicking New Chat gives the new chat an id and opens index 0', () => {
        const chat = { id: 'existing-1', message: [], note: '', name: 'Chat 1', localLore: [] } as unknown as character['chats'][number]
        DBState.db.characters = [makeCharacter([chat])] as never
        selectedCharID.set(0)

        const { target } = mountChatList()

        // The New Chat ("+") button is the first button inside the
        // `.mt-2.items-center` toolbar row, distinct from the per-chat rows
        // rendered above it by the `{#each}`.
        const newChatButton = target.querySelector<HTMLButtonElement>('.mt-2.items-center button')!
        newChatButton.click()
        flushSync()

        const cha = DBState.db.characters[0] as character
        expect(cha.chats[0].id).toBeTruthy()
        expect(changeChatToSpy).toHaveBeenCalledWith(0)
    })

    test('a group New Chat puts every member\'s greeting into the new chat opened at index 0', () => {
        memberFixtures.set('member-1', { firstMessage: 'Hello from member 1' })
        const existingChat = { id: 'existing-1', message: [], note: '', name: 'Chat 1', localLore: [] } as unknown as character['chats'][number]
        DBState.db.characters = [{
            type: 'group',
            name: 'Group',
            firstMessage: '',
            chats: [existingChat],
            chatFolders: [],
            chatPage: 0,
            viewScreen: 'none',
            globalLore: [],
            characters: ['member-1'],
            autoMode: false,
            useCharacterLore: true,
            emotionImages: [],
            customscript: [],
            chaId: 'group-1',
            firstMsgIndex: -1,
            characterTalks: [],
            characterActive: [],
            realmId: '',
        }] as never
        selectedCharID.set(0)

        const { target } = mountChatList()

        const newChatButton = target.querySelector<HTMLButtonElement>('.mt-2.items-center button')!
        newChatButton.click()
        flushSync()

        const cha = DBState.db.characters[0] as unknown as { chats: { id?: string, message: unknown[] }[] }
        expect(cha.chats[0].message).toEqual([
            { saying: 'member-1', role: 'char', data: 'Hello from member 1' },
        ])
        expect(changeChatToSpy).toHaveBeenCalledWith(0)
    })
})
