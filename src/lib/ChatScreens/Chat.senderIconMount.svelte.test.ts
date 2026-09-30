// @vitest-environment happy-dom

/**
 * Tests for when `Chat.svelte`'s sender icon starts awaiting its `img` prop.
 *
 * An `{#await}` block retains the batch it was created in for as long as it
 * lives. Created in the batch that mounts the message, it would keep that
 * batch's previous-value map (for example the previous chat's message array)
 * reachable until the message is destroyed. The `senderIcon` snippet therefore
 * renders a placeholder icon while mounting and only creates the `{#await}`
 * block from a microtask queued in `onMount`.
 *
 * The regression reproducer is the first test: it observes `img.then` being
 * called (which is what creating the `{#await}` block does) and asserts that
 * this does not happen in the mounting batch. The `guard:` tests pin behaviour
 * that must hold with or without the deferral: the placeholder is present
 * synchronously, unmounting before the deferral runs is safe, and the latest
 * `img` wins when the prop is swapped before the deferral runs.
 *
 * This mounts the REAL `Chat.svelte`. Everything it transitively pulls in that
 * is heavy, has side effects, or is irrelevant to the sender icon (globalApi,
 * storage/database, the parser, the translator, process/* machinery, TTS, the
 * model list, util's Tauri-backed file pickers, `characters.ts`) is mocked,
 * following `Chat.messageEditor.svelte.test.ts`. `ChatBody.svelte` and
 * `PartialEditController.svelte` are stubbed to trivial components.
 */

import { flushSync, mount, tick, unmount, type ComponentProps } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

//#region module mocks

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Record<string, unknown> })
    const selId = $state({ selId: 0 })
    return {
        DBState: state,
        selIdState: selId,
        selectedCharID: writable(-1),
        ReloadGUIPointer: writable(0),
        ReloadChatPointer: writable({} as Record<number, number>),
        CurrentTriggerIdStore: writable(null),
        popupStore: { children: null, mouseX: 0, mouseY: 0, openId: 0 },
        HideIconStore: writable(false),
        createSimpleCharacter: vi.fn(() => null),
        bookmarkListOpen: writable(false),
        ScrollToMessageStore: { value: -1 },
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    aiLawApplies: vi.fn(() => false),
    changeChatTo: vi.fn(),
    foldChatToMessage: vi.fn(),
    getFileSrc: vi.fn(async () => ''),
    createChatCopyName: vi.fn((name: string) => `${name} Branch`),
    downloadFile: vi.fn(),
    fetchNative: vi.fn(),
    readImage: vi.fn(),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getCurrentCharacter: vi.fn(() => null),
    getCurrentChat: vi.fn(() => null),
    setCurrentChat: vi.fn(),
    getDatabase: vi.fn(() => {
        throw new Error('no live database in tests')
    }),
    setDatabase: vi.fn(),
}) as unknown as typeof import('src/ts/storage/database.svelte'))

vi.mock(import('src/ts/alert'), () => ({
    alertClear: vi.fn(),
    alertConfirm: vi.fn(async () => true),
    alertNormal: vi.fn(),
    alertWait: vi.fn(),
    alertInput: vi.fn(async () => ''),
    alertRequestData: vi.fn(),
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('src/ts/parser/parser.svelte'), () => ({
    ParseMarkdown: vi.fn(async (text: string) => text),
}) as unknown as typeof import('src/ts/parser/parser.svelte'))

vi.mock(import('src/ts/translator/translator'), () => ({
    getLLMCache: vi.fn(async () => null),
    setLLMCache: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/translator/translator'))

vi.mock(import('src/ts/process/scriptings'), () => ({
    runLuaButtonTrigger: vi.fn(async () => null),
}) as unknown as typeof import('src/ts/process/scriptings'))

vi.mock(import('src/ts/process/scripts'), () => ({
    risuChatParser: vi.fn((text: string) => text ?? ''),
}) as unknown as typeof import('src/ts/process/scripts'))

vi.mock(import('src/ts/process/triggers'), () => ({
    runTrigger: vi.fn(async () => null),
}) as unknown as typeof import('src/ts/process/triggers'))

vi.mock(import('src/ts/process/tts'), () => ({
    sayTTS: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/process/tts'))

vi.mock(import('src/ts/gui/colorscheme'), () => ({
    ColorSchemeTypeStore: writable('dark'),
}) as unknown as typeof import('src/ts/gui/colorscheme'))

vi.mock(import('src/ts/model/modellist'), () => ({
    getModelInfo: vi.fn(() => ({ shortName: 'test-model' })),
}) as unknown as typeof import('src/ts/model/modellist'))

vi.mock(import('src/ts/util'), () => ({
    capitalize: vi.fn((s: string) => s),
    getUserIcon: vi.fn(() => ''),
    getUserName: vi.fn(() => 'User'),
    sleep: vi.fn(async () => {}),
    findCharacterbyId: vi.fn(() => null),
}) as unknown as typeof import('src/ts/util'))

vi.mock(import('src/ts/characters'), () => ({
    getCharImage: vi.fn(() => ''),
}) as unknown as typeof import('src/ts/characters'))

// Stubbed out entirely -- neither is exercised by the sender icon.
vi.mock('./ChatBody.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))
vi.mock('./PartialEditController.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))

//#endregion

import { DBState, selIdState, selectedCharID } from 'src/ts/stores.svelte'
import Chat from './Chat.svelte'

//#region fixture helpers

function baseDb() {
    return {
        askRemoval: false,
        instantRemove: false,
        translatorType: 'none',
        translateBeforeHTMLFormatting: false,
        legacyTranslation: false,
        requestInfoInsideChat: false,
        clickToEdit: false,
        zoomsize: 100,
        lineHeight: 1.25,
        enableBlockPartialEdit: false,
        enableDragPartialEdit: false,
        useChatCopy: false,
        translator: '',
        swipe: false,
        showFirstMessagePages: false,
        enableBookmark: false,
        createFolderOnBranch: false,
        iconsize: 100,
        memoryLimitThickness: 2,
        theme: 'default',
        guiHTML: '',
        roundIcons: false,
    }
}

function setupDb() {
    DBState.db = baseDb() as never
    const chat = {
        id: 'chat-1',
        message: [{ role: 'char', data: 'hello', chatId: 'c1' }],
        bookmarks: [] as string[],
        bookmarkNames: {} as Record<string, string>,
    }
    DBState.db.characters = [{
        chaId: 'char-1',
        type: 'character',
        ttsMode: 'none',
        chatPage: 0,
        chats: [chat],
    }] as never
    selIdState.selId = 0
}

// A thenable whose `then` is observable. The `{#await}` block subscribes to
// its value by calling `then`, so the call count shows when it was created. It
// is typed as a `Promise<string>` because that is what the `img` prop accepts;
// only `then` is ever used.
function spyThenable(value: string) {
    const inner = Promise.resolve(value)
    const then = vi.fn((onFulfilled: (v: string) => unknown, onRejected?: (e: unknown) => unknown) =>
        inner.then(onFulfilled, onRejected))
    return { thenable: { then } as unknown as Promise<string>, then }
}

function deferred() {
    let resolve!: (v: string) => void
    const promise = new Promise<string>((r) => { resolve = r })
    return { promise, resolve }
}

// Lets a queued microtask, and the promise callbacks it triggers, run to
// completion, then flushes the resulting DOM update.
async function settle() {
    for (let i = 0; i < 6; i++) await Promise.resolve()
    await tick()
}

function iconStyles(target: HTMLElement) {
    return Array.from(target.querySelectorAll('.bg-textcolor2')).map((e) => e.getAttribute('style') ?? '')
}

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

const chatProps = { idx: 0, message: 'hello', isLastMemory: false }

// `props` is passed to `mount` as-is (not spread) so a getter on it stays live.
function mountChat(props: ComponentProps<typeof Chat>) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    const instance = mount(Chat, { target, props })
    mountedInstances.push(instance)
    flushSync()
    return { target, instance }
}

afterEach(async () => {
    const instances = mountedInstances.splice(0)
    for (const instance of instances) {
        await unmount(instance as never).catch(() => {})
    }
    mountedTargets.splice(0).forEach((t) => t.remove())
    document.body.replaceChildren()
    vi.clearAllMocks()
})

beforeEach(() => {
    window.innerWidth = 1024
    selectedCharID.set(0)
    setupDb()
})

//#endregion

describe('Chat.svelte sender icon: when the await on img starts', () => {
    test("does not create the sender icon's await block in the batch that mounts the message", async () => {
        const { thenable, then } = spyThenable('background: url("a");')

        const { target } = mountChat({ ...chatProps, img: thenable })

        // Mounting is complete but the await block has not subscribed to `img`.
        expect(then).toHaveBeenCalledTimes(0)

        // A few microtask hops later the deferred block exists and shows the
        // resolved style.
        await settle()

        expect(then).toHaveBeenCalled()
        expect(iconStyles(target)).toEqual([expect.stringContaining('background: url("a");')])
    })

    test('guard: the placeholder icon is present synchronously after mount', () => {
        const { promise } = deferred()

        const { target } = mountChat({ ...chatProps, img: promise })

        const styles = iconStyles(target)
        expect(styles).toHaveLength(1)
        expect(styles[0]).toContain('height: 3.5rem')
    })

    test('guard: unmounting before the deferred microtask runs does not throw', async () => {
        const { thenable } = spyThenable('color: red;')
        const { target, instance } = mountChat({ ...chatProps, img: thenable })
        mountedInstances.splice(mountedInstances.indexOf(instance), 1)

        await expect(unmount(instance as never)).resolves.not.toThrow()
        await expect(settle()).resolves.toBeUndefined()

        expect(target.querySelector('.bg-textcolor2')).toBeNull()
    })

    test('guard: the latest img wins when it is swapped before the deferred microtask runs', async () => {
        const a1 = deferred()
        const b = deferred()
        const a2 = deferred()
        const props = $state({ img: a1.promise })

        const { target } = mountChat({
            ...chatProps,
            get img() {
                return props.img
            },
        })

        // Swap twice within the mounting turn, before the icon microtask.
        props.img = b.promise
        flushSync()
        props.img = a2.promise
        flushSync()
        await settle()

        a1.resolve('color: red;')
        await settle()
        expect(iconStyles(target)).toEqual([expect.not.stringContaining('color:')])

        b.resolve('color: green;')
        await settle()
        expect(iconStyles(target)).toEqual([expect.not.stringContaining('color:')])

        a2.resolve('color: blue;')
        await settle()
        expect(iconStyles(target)).toEqual([expect.stringContaining('color: blue;')])
    })
})
