// @vitest-environment happy-dom

/**
 * Deleting a chat message through the trash button of the REAL `Chat.svelte`
 * (and, for one guard, the REAL `BookmarkList.svelte`, which hosts `Chat` with
 * a live `idx`).
 *
 * Invariants pinned here:
 *  - the target is fixed at the click: the owning character, its chat and the
 *    message itself, never whatever is selected or sits at `idx` when the
 *    answer arrives;
 *  - a removal whose target is gone removes nothing, and never the last
 *    message in its place;
 *  - one answer removes at most one flow's target: two pending flows on one
 *    message remove one message;
 *  - the removal is saved for the character that owns the chat, selected or
 *    not;
 *  - the "this message and everything after it" question offers three explicit
 *    choices, in the order [remove only this message, cancel, remove this
 *    message and every message after it]; Cancel and any unexpected answer
 *    remove nothing.
 *
 * Both prompts are deferred promises the test resolves by hand, so a test
 * changes the database between the click and the answer. The prompt wording is
 * never asserted: the question and each choice are checked by language key, in
 * order, and each answer by the removal it makes.
 *
 * Test kinds: the tests titled "guard:" pass with or without the fix and pin
 * behaviour that must be preserved. The tests that go through the first
 * "Remove this message?" confirm only (`askRemoval` on, `instantRemove` off)
 * are regression reproducers: they fail on the previous code by removing the
 * wrong message or touching the wrong chat. The tests in "removing the clicked
 * message and every message after it" and in the three-choice describe
 * exercise the `alertSelect` question itself; they are not reproducers, since
 * on code that asks a second confirm instead they fail only because no
 * `alertSelect` was asked. The behavioural defect of that second confirm
 * (answering No truncates at a stale index) is shown only by a variant of
 * those tests that answers the second confirm instead.
 *
 * The selection is modelled directly: `selIdState.selId` and the
 * `selectedCharID` store are both set, as the archived-character restore does
 * when it finishes after the old chat was already clickable.
 */

import { flushSync, mount, unmount } from 'svelte'
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

interface PendingConfirm {
    message: string
    resolve: (answer: boolean) => void
}

interface PendingSelect {
    choices: string[]
    question: string | undefined
    resolve: (answer: string) => void
}

const prompts = vi.hoisted(() => ({
    confirms: [] as PendingConfirm[],
    selects: [] as PendingSelect[],
}))

vi.mock(import('src/ts/alert'), () => ({
    alertClear: vi.fn(),
    alertConfirm: vi.fn((message: string) => new Promise<boolean>((resolve) => {
        prompts.confirms.push({ message, resolve })
    })),
    alertSelect: vi.fn((choices: string[], question?: string) => new Promise<string>((resolve) => {
        prompts.selects.push({ choices, question, resolve })
    })),
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

// Neither is exercised by the delete flow.
vi.mock('./ChatBody.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))
vi.mock('./PartialEditController.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))

//#endregion

import { DBState, selIdState, selectedCharID } from 'src/ts/stores.svelte'
import {
    installCharacterSaveMarks,
    resetCharacterSaveMarksForTest,
} from 'src/ts/storage/characterSaveMarks'
import type { toSaveType } from 'src/ts/storage/risuSave'
import { language } from 'src/lang'
import Chat from './Chat.svelte'
import BookmarkList from '../Others/BookmarkList.svelte'

//#region fixtures

interface FixtureMessage {
    role: string
    data: string
    chatId: string
}

interface FixtureChat {
    id: string
    message: FixtureMessage[]
    bookmarks: string[]
    bookmarkNames: Record<string, string>
}

interface FixtureCharacter {
    chaId: string
    type: string
    ttsMode: string
    chatPage: number
    chats: FixtureChat[]
}

function makeMessages(prefix: string, count: number): FixtureMessage[] {
    return Array.from({ length: count }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'char',
        data: `${prefix}${i + 1}`,
        chatId: `id-${prefix}${i + 1}`,
    }))
}

function makeChat(id: string, message: FixtureMessage[], overrides: Partial<FixtureChat> = {}): FixtureChat {
    return { id, message, bookmarks: [], bookmarkNames: {}, ...overrides }
}

function makeCharacter(chaId: string, chats: FixtureChat[]): FixtureCharacter {
    return { chaId, type: 'character', ttsMode: 'none', chatPage: 0, chats }
}

function baseDb(overrides: Record<string, unknown> = {}) {
    return {
        askRemoval: true,
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
        enableBookmark: true,
        createFolderOnBranch: false,
        iconsize: 100,
        memoryLimitThickness: 2,
        theme: 'default',
        guiHTML: '',
        roundIcons: false,
        ...overrides,
    }
}

/** The live (reactive) chat of the character at `charIndex`, read back through the database. */
function liveChat(charIndex = 0, chatIndex = 0): FixtureChat {
    return (DBState.db.characters as unknown as FixtureCharacter[])[charIndex].chats[chatIndex]
}

function dataOf(chat: FixtureChat): string[] {
    return chat.message.map((m) => m.data)
}

/** Installs the database: character `char-a` (selected) with five messages m1..m5, and optionally a second character `char-b` with b1..b5. */
function setupDb(options: { second?: boolean, db?: Record<string, unknown> } = {}): void {
    DBState.db = baseDb(options.db) as never
    const characters = [makeCharacter('char-a', [makeChat('chat-a', makeMessages('m', 5))])]
    if (options.second) {
        characters.push(makeCharacter('char-b', [makeChat('chat-b', makeMessages('b', 5))]))
    }
    DBState.db.characters = characters as never
    selIdState.selId = 0
}

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

function mountChat(idx: number, message: string): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    mountedInstances.push(mount(Chat, { target, props: { idx, message, isLastMemory: false } }))
    flushSync()
    return target
}

function mountBookmarks(): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    mountedInstances.push(mount(BookmarkList, { target, props: {} }))
    flushSync()
    return target
}

function trashOf(root: HTMLElement): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>('.button-icon-remove')
    expect(button, 'the trash button').not.toBeNull()
    return button!
}

/** Lets every promise continuation that is ready run, then flushes the DOM. */
async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 10))
    flushSync()
}

/** Clicks the trash of the message at `idx` and waits until the click has been handled. */
async function clickTrash(root: HTMLElement): Promise<void> {
    trashOf(root).click()
    await settle()
}

/** Answers the first confirm ("Remove this message?") and lets the removal run. */
async function answerFirstConfirm(answer: boolean): Promise<void> {
    expect(prompts.confirms.length, 'confirms asked').toBeGreaterThan(0)
    prompts.confirms.shift()!.resolve(answer)
    await settle()
}

/** What the user can choose on the question about the messages after the clicked one. */
type QuestionChoice = 'one' | 'fromHere' | 'cancel' | 'empty'

const QUESTION_ANSWER: Record<QuestionChoice, string> = {
    one: '0',
    cancel: '1',
    fromHere: '2',
    empty: '',
}

/** Asserts the question about the messages after the clicked one is up, answers it, and lets the removal run. */
async function answerQuestion(choice: QuestionChoice): Promise<void> {
    expect(prompts.selects.length, 'questions asked about the messages after the clicked one').toBe(1)
    prompts.selects.shift()!.resolve(QUESTION_ANSWER[choice])
    await settle()
}

/** Asserts the question about the messages after the clicked one is up, without answering it. */
async function expectQuestionUp(): Promise<void> {
    expect(prompts.selects.length, 'questions asked about the messages after the clicked one').toBe(1)
}

let tracker: toSaveType

beforeEach(() => {
    window.innerWidth = 1024
    selectedCharID.set(0)
    prompts.confirms.length = 0
    prompts.selects.length = 0
    resetCharacterSaveMarksForTest()
    tracker = { character: [], chat: [], botPreset: false, modules: false, loadouts: false, plugins: false, pluginCustomStorage: false }
    installCharacterSaveMarks({ tracker, schedule: vi.fn() })
})

afterEach(async () => {
    for (const instance of mountedInstances.splice(0)) {
        await unmount(instance as never).catch(() => {})
    }
    mountedTargets.splice(0).forEach((t) => t.remove())
    document.body.replaceChildren()
    resetCharacterSaveMarksForTest()
    vi.clearAllMocks()
})

//#endregion

describe('removing one message after the first confirm', () => {
    test('guard: removes exactly the clicked message when nothing changes during the confirm', async () => {
        setupDb()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await answerFirstConfirm(true)

        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm4', 'm5'])
    })

    test('guard: declining the confirm removes nothing', async () => {
        setupDb()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await answerFirstConfirm(false)

        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    })

    test('removes the message that was clicked, not the one now at its old index, when an earlier message is removed during the confirm', async () => {
        setupDb()
        const chat = liveChat()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        chat.message.splice(0, 1)
        await answerFirstConfirm(true)

        expect(dataOf(chat)).toEqual(['m2', 'm4', 'm5'])
    })

    test('removes the message that was clicked when a message is inserted above it during the confirm', async () => {
        setupDb()
        const chat = liveChat()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        chat.message.splice(0, 0, { role: 'user', data: 'inserted', chatId: 'id-inserted' })
        await answerFirstConfirm(true)

        expect(dataOf(chat)).toEqual(['inserted', 'm1', 'm2', 'm4', 'm5'])
    })

    test('removes exactly one message when two confirms are pending on the same message and both are answered yes', async () => {
        setupDb()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await clickTrash(root)
        expect(prompts.confirms.length, 'confirms asked').toBe(2)
        await answerFirstConfirm(true)
        await answerFirstConfirm(true)

        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm4', 'm5'])
    })

    test('removes nothing and keeps the last message when the clicked message was removed by something else during the confirm', async () => {
        setupDb()
        const chat = liveChat()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        chat.message.splice(2, 1)
        await answerFirstConfirm(true)

        expect(dataOf(chat)).toEqual(['m1', 'm2', 'm4', 'm5'])
    })

    test('guard: removes nothing when the last message was clicked and removed by something else during the confirm', async () => {
        setupDb()
        const chat = liveChat()
        const root = mountChat(4, 'm5')

        await clickTrash(root)
        chat.message.splice(4, 1)
        await answerFirstConfirm(true)

        expect(dataOf(chat)).toEqual(['m1', 'm2', 'm3', 'm4'])
    })

    test('asks nothing and removes nothing when there is no message at the clicked index', async () => {
        setupDb()
        const root = mountChat(7, 'ghost')

        await clickTrash(root)

        expect(prompts.confirms.length, 'confirms asked').toBe(0)
        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    })
})

describe('removing a message when the selection moves during the confirm', () => {
    function switchSelectionToSecondCharacter(): void {
        selIdState.selId = 1
        selectedCharID.set(1)
    }

    test('the chat the message was clicked in loses it', async () => {
        setupDb({ second: true })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        switchSelectionToSecondCharacter()
        await answerFirstConfirm(true)

        expect(dataOf(liveChat(0))).toEqual(['m1', 'm2', 'm4', 'm5'])
    })

    test('the newly selected chat is left untouched', async () => {
        setupDb({ second: true })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        switchSelectionToSecondCharacter()
        await answerFirstConfirm(true)

        expect(dataOf(liveChat(1))).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
    })

    test('the character that owns the chat is marked for save, and the selected one is not', async () => {
        setupDb({ second: true })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        switchSelectionToSecondCharacter()
        await answerFirstConfirm(true)

        expect(tracker.character).toEqual(['char-a'])
    })

    test('a message removed while the chat page of the same character moves lands in the chat it was clicked in', async () => {
        setupDb()
        const character = (DBState.db.characters as unknown as FixtureCharacter[])[0]
        character.chats.push(makeChat('chat-a2', makeMessages('n', 5)))
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        character.chatPage = 1
        await answerFirstConfirm(true)

        expect(dataOf(character.chats[0])).toEqual(['m1', 'm2', 'm4', 'm5'])
        expect(dataOf(character.chats[1])).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
    })

    test('removes nothing, and marks nothing for save, when the chat was removed from its character during the confirm', async () => {
        setupDb()
        const character = (DBState.db.characters as unknown as FixtureCharacter[])[0]
        character.chats.push(makeChat('chat-a2', makeMessages('n', 5)))
        const detached = liveChat()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        character.chats.splice(0, 1)
        await answerFirstConfirm(true)

        expect(dataOf(detached), 'the removed chat').toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
        expect(dataOf(character.chats[0]), 'the chat that took its place').toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
        expect(tracker.character).toEqual([])
    })

    test('removes nothing when the owning character was deleted during the confirm', async () => {
        setupDb({ second: true })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        const characters = DBState.db.characters as unknown as FixtureCharacter[]
        characters.splice(0, 1)
        selIdState.selId = 0
        selectedCharID.set(0)
        await answerFirstConfirm(true)

        expect(dataOf(liveChat(0)), 'the remaining character\'s chat').toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
        expect(tracker.character).toEqual([])
    })
})

describe('removing the clicked message and every message after it', () => {
    test('removes the clicked message and everything after it, and keeps the earlier messages', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await answerQuestion('fromHere')

        expect(dataOf(liveChat())).toEqual(['m1', 'm2'])
    })

    test('truncates at the clicked message, not at its old index, when an earlier message is removed during the question', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const chat = liveChat()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        chat.message.splice(0, 1)
        await answerQuestion('fromHere')

        expect(dataOf(chat)).toEqual(['m2'])
    })

    test('removes nothing and keeps the last message when the clicked message was removed by something else during the question', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const chat = liveChat()
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        chat.message.splice(2, 1)
        await answerQuestion('fromHere')

        expect(dataOf(chat)).toEqual(['m1', 'm2', 'm4', 'm5'])
    })

    test('truncates the chat the message was clicked in, and marks its character for save, when the selection moves during the question', async () => {
        setupDb({ second: true, db: { askRemoval: false, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        selIdState.selId = 1
        selectedCharID.set(1)
        await answerQuestion('fromHere')

        expect(dataOf(liveChat(0))).toEqual(['m1', 'm2'])
        expect(dataOf(liveChat(1))).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
        expect(tracker.character).toEqual(['char-a'])
    })

    test('the question is asked after the first confirm is answered yes, and declining the first confirm asks nothing more', async () => {
        setupDb({ db: { askRemoval: true, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await answerFirstConfirm(false)
        expect(prompts.selects.length, 'questions asked after a declined confirm').toBe(0)

        await clickTrash(root)
        await answerFirstConfirm(true)
        await expectQuestionUp()
    })
})

describe('the question about the messages after the clicked one', () => {
    test('offers the choices only this message, cancel, this message and every message after it, in that order, none containing the select delimiter', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)

        expect(prompts.selects.length, 'questions asked').toBe(1)
        const { choices, question } = prompts.selects[0]
        // Compared by language key, so a reworded string never breaks this and a swapped label always does:
        // the answers '0', '1' and '2' below mean exactly these choices in this order.
        expect(choices).toEqual([
            language.removeOnlyThisMessage,
            language.cancel,
            language.removeThisAndFollowingMessages,
        ])
        expect(question).toBe(language.removeMessageQuestion)
        for (const choice of choices) {
            expect(choice).not.toContain('||')
        }
        expect(new Set(choices).size, 'distinct choices').toBe(3)
    })

    test('the first choice removes only the clicked message', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await answerQuestion('one')

        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm4', 'm5'])
    })

    test('the second choice, cancel, removes nothing', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await answerQuestion('cancel')

        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    })

    test('an empty answer removes nothing', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        await answerQuestion('empty')

        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    })

    test('an unexpected answer removes nothing', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: true } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)
        expect(prompts.selects.length, 'questions asked').toBe(1)
        prompts.selects.shift()!.resolve('7')
        await settle()

        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    })

    test('guard: a plain trash click with both settings off removes the message without asking anything', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: false } })
        const root = mountChat(2, 'm3')

        await clickTrash(root)

        expect(prompts.confirms.length, 'confirms asked').toBe(0)
        expect(prompts.selects.length, 'questions asked').toBe(0)
        expect(dataOf(liveChat())).toEqual(['m1', 'm2', 'm4', 'm5'])
    })
})

describe('a bookmark row hosting the message', () => {
    test('guard: deleting through a bookmark row removes the message the row shows after an earlier message was removed', async () => {
        setupDb({ db: { askRemoval: false, instantRemove: false } })
        const chat = liveChat()
        chat.bookmarks = ['id-m3']
        const root = mountBookmarks()
        const header = root.querySelector<HTMLElement>('.border.border-darkborderc.rounded-lg [role="button"]')
        expect(header, 'the bookmark row header').not.toBeNull()
        header!.click()
        flushSync()

        chat.message.splice(0, 1)
        flushSync()
        await settle()
        await clickTrash(root)

        expect(dataOf(chat)).toEqual(['m2', 'm4', 'm5'])
    })
})
