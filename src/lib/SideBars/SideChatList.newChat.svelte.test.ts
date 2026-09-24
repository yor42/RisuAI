// @vitest-environment happy-dom

/**
 * Clicking `SideChatList.svelte`'s group New Chat button lands every
 * member's greeting in the new chat, and leaves every other chat's message
 * unchanged.
 *
 * Mounts the REAL `SideChatList.svelte` and the REAL `src/ts/characters.ts`
 * (so the click goes through the actual `createNewChat` call site).
 * `sortablejs` is mocked (its real DOM wiring is irrelevant to the New Chat
 * button and not exercised here); `./Toggles.svelte` is stubbed to a trivial
 * component, following the `ChatBody.svelte`/`PartialEditController.svelte`
 * precedent in `Chat.messageEditor.svelte.test.ts` -- it renders
 * unconditionally in `SideChatList.svelte`'s template but pulls in an
 * unrelated dependency tree (module toggles, chat variables) that has
 * nothing to do with New Chat. Every other module `characters.ts`
 * transitively pulls in is mocked, following the precedent in
 * `characters.saveMarks.svelte.test.ts`.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Database, character, groupChat } from 'src/ts/storage/database.svelte'

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

const FakeSortable = vi.hoisted(() => {
    class FakeSortableInstance {
        destroy() {}
    }
    class Sortable {
        static create() {
            return new FakeSortableInstance()
        }
        destroy() {}
    }
    return Sortable
})

vi.mock('sortablejs/modular/sortable.core.esm.js', () => ({
    default: FakeSortable,
}))

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
        ReloadGUIPointer: writable(0),
        bookmarkListOpen: writable(false),
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
    createChatCopyName: vi.fn((name: string) => `${name} Copy`),
    reorderChatsKeepingCurrent: vi.fn(),
    forageStorage: {
        keys: vi.fn(async () => []),
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
    },
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/alert'), () => ({
    alertAddCharacter: vi.fn(),
    alertChatOptions: vi.fn(async () => -1),
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
    sleep: vi.fn(async () => {}),
    sortableOptions: { delay: 300, delayOnTouchOnly: true, filter: '.no-sort', onMove: () => true },
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

vi.mock(import('src/ts/sync/multiuser'), () => ({
    createMultiuserRoom: vi.fn(),
}) as unknown as typeof import('src/ts/sync/multiuser'))

// Stubbed out entirely -- renders unconditionally but pulls in an unrelated
// dependency tree (module toggles, chat variables) that New Chat never
// touches (see file header).
vi.mock('./Toggles.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))

//#endregion

import { DBState, selectedCharID } from 'src/ts/stores.svelte'
import SideChatList from './SideChatList.svelte'

//#region fixture helpers

function makeGroup(chats: groupChat['chats'], members: string[]): groupChat {
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

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

function mountSideChatList(props: { chara: character | groupChat }) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    const instance = mount(SideChatList, { target, props })
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

describe('SideChatList.svelte New Chat button', () => {
    test('a group New Chat puts every member\'s greeting into the new chat, and leaves other chats unchanged', () => {
        memberFixtures.set('member-1', { firstMessage: 'Hello from member 1' })
        const existingChat = { id: 'existing-1', message: [{ role: 'user', data: 'existing' }], note: '', name: 'Chat 1', localLore: [] } as unknown as groupChat['chats'][number]
        const existingMessageBefore = structuredClone(existingChat.message)
        const chara = makeGroup([existingChat], ['member-1'])
        DBState.db.characters = [chara] as never
        selectedCharID.set(0)

        const { target } = mountSideChatList({ chara })

        const newChatButton = target.querySelector<HTMLButtonElement>('button')!
        newChatButton.click()
        flushSync()

        expect(chara.chats[0].message).toEqual([
            { saying: 'member-1', role: 'char', data: 'Hello from member 1' },
        ])
        const survivingChat = chara.chats.find((c) => c.id === 'existing-1')!
        expect(survivingChat.message).toEqual(existingMessageBefore)
    })
})
