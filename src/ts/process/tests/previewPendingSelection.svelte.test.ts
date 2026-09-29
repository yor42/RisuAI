/**
 * A prompt-preview result that waits behind another alert is dropped when the
 * selected character or its selected chat changes, including a change away
 * and back before that alert closes.
 *
 * Runs the REAL `runPreview` (`../previewRunner`) and the REAL
 * `watchSelectedChat` (`../previewSelectionWatch.svelte`) over a `$state`
 * database and a real `writable` for `selectedCharID`, with the REAL
 * `src/ts/alert.ts` over a real `writable` standing in for `alertStore`. Only
 * `sendChat` is a stand-in (`../index.svelte`): it puts a start trigger's alert
 * in the store and writes its body into the call's own `previewResult`. That
 * says nothing about what the real send does. The selected chat is
 * `chatPage` on the selected character, so a chat switch is a write to the
 * `$state` database, as in the app.
 *
 * Tests whose title starts with `guard:` pass with or without the fix: they
 * pin behaviour that must be preserved.
 */
import { flushSync } from 'svelte'
import { get, writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Chat, Database, character } from 'src/ts/storage/database.svelte'
import type { SendChatArg } from 'src/ts/process/index.svelte'
import type { alertData } from 'src/ts/alert'

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

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        alertStore: writable({ type: 'none', msg: '' }),
        selectedCharID: writable(-1),
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/storage/database.svelte'), async () => {
    const { DBState: liveDBState } = await import('src/ts/stores.svelte')
    return {
        getDatabase: vi.fn(() => liveDBState.db),
    } as unknown as typeof import('src/ts/storage/database.svelte')
})

vi.mock(import('src/ts/process/index.svelte'), () => ({
    doingChat: writable(false),
    sendChat: vi.fn(),
}) as unknown as typeof import('src/ts/process/index.svelte'))

//#endregion

import { runPreview, renderPromptResult } from 'src/ts/process/previewRunner'
import { watchSelectedChat } from 'src/ts/process/previewSelectionWatch.svelte'
import { alertClear, alertNormal } from 'src/ts/alert'
import { alertStore, DBState, selectedCharID } from 'src/ts/stores.svelte'
import { sendChat } from 'src/ts/process/index.svelte'

//#region fixtures

const NONE: alertData = { type: 'none', msg: '' }
const stopRecording: Array<() => void> = []
const REQUEST_BODY = JSON.stringify({ url: 'https://api.example.com/v1/chat', body: { model: 'test-model' }, headers: {} })

function chatOf(id: string): Chat {
    return { id, note: '', name: '', localLore: [], fmIndex: -1, message: [] } as unknown as Chat
}

function characterOf(chaId: string, chatIds: string[]): character {
    return { chaId, name: chaId, type: 'character', chatPage: 0, chats: chatIds.map(chatOf) } as unknown as character
}

function installCharacters(): void {
    DBState.db = {
        characters: [characterOf('char-a', ['a-1', 'a-2']), characterOf('char-b', ['b-1'])],
    } as unknown as Database
    selectedCharID.set(0)
}

function shown(): alertData {
    return get(alertStore) as alertData
}

/** Every markdown alert the store holds from now on. */
function recordMarkdown(): () => alertData[] {
    const seen: alertData[] = []
    stopRecording.push(alertStore.subscribe((value) => { seen.push(value as alertData) }))
    return () => seen.filter((value) => value.type === 'markdown')
}

/** A preview whose result waits behind a start trigger's alert. */
async function previewBehindAlert(): Promise<void> {
    vi.mocked(sendChat).mockImplementationOnce(async (_index?: number, arg: SendChatArg = {}) => {
        alertNormal('The start trigger says hi')
        arg.previewResult!.body = REQUEST_BODY
        return true
    })
    await runPreview({ previewPrompt: true }, renderPromptResult)
    expect(shown().type, 'the alert the result waits behind').toBe('normal')
    flushSync()
}

beforeEach(() => {
    vi.mocked(sendChat).mockReset()
    installCharacters()
    alertStore.set(NONE)
})

afterEach(() => {
    while (stopRecording.length > 0) {
        stopRecording.pop()!()
    }
    alertStore.set(NONE)
    selectedCharID.set(-1)
})

//#endregion

describe('a result waiting behind another alert, when the selected chat changes', () => {
    test('a switch to another chat of the selected character drops the result', async () => {
        await previewBehindAlert()
        const markdown = recordMarkdown()

        DBState.db.characters[0].chatPage = 1
        flushSync()
        alertClear()

        expect(markdown(), 'previews shown').toEqual([])
    })

    test('a switch to another chat and back, in separate ticks, drops the result', async () => {
        await previewBehindAlert()
        const markdown = recordMarkdown()

        DBState.db.characters[0].chatPage = 1
        flushSync()
        DBState.db.characters[0].chatPage = 0
        flushSync()
        alertClear()

        expect(markdown(), 'previews shown').toEqual([])
    })

    test('a different chat put in the selected chat\'s place drops the result', async () => {
        await previewBehindAlert()
        const markdown = recordMarkdown()

        DBState.db.characters[0].chats[0] = chatOf('a-replacement')
        flushSync()
        alertClear()

        expect(markdown(), 'previews shown').toEqual([])
    })

    test('a different character put in the selected slot drops the result', async () => {
        await previewBehindAlert()
        const markdown = recordMarkdown()

        DBState.db.characters[0] = characterOf('char-c', ['c-1'])
        flushSync()
        alertClear()

        expect(markdown(), 'previews shown').toEqual([])
    })

    test('a switch to another character drops the result', async () => {
        await previewBehindAlert()
        const markdown = recordMarkdown()

        selectedCharID.set(1)
        flushSync()
        alertClear()

        expect(markdown(), 'previews shown').toEqual([])
    })

    test('a switch to another character and back before the alert closes drops the result', async () => {
        await previewBehindAlert()
        const markdown = recordMarkdown()

        selectedCharID.set(1)
        flushSync()
        selectedCharID.set(0)
        flushSync()
        alertClear()

        expect(markdown(), 'previews shown').toEqual([])
    })

    test('a message added to the selected chat, and a rename of it, do not drop the result', async () => {
        await previewBehindAlert()

        DBState.db.characters[0].chats[0].message.push({ role: 'user', data: 'hello', time: 1 } as never)
        DBState.db.characters[0].chats[0].name = 'renamed'
        DBState.db.characters[0].name = 'Renamed character'
        flushSync()
        alertClear()

        expect(shown().type).toBe('markdown')
        expect(shown().msg).toContain('test-model')
    })

    test('a change to a chat that is not the selected one does not drop the result', async () => {
        await previewBehindAlert()

        DBState.db.characters[0].chats[1].name = 'the other chat, renamed'
        DBState.db.characters[1].chats[0].name = 'another character\'s chat, renamed'
        flushSync()
        alertClear()

        expect(shown().type).toBe('markdown')
    })

    test('a change after the result was shown does nothing', async () => {
        await previewBehindAlert()
        alertClear()
        expect(shown().type).toBe('markdown')

        DBState.db.characters[0].chatPage = 1
        selectedCharID.set(1)
        flushSync()

        expect(shown().type).toBe('markdown')
    })
})

describe('watchSelectedChat', () => {
    test('it reports a change of character, a change of chat, and a change of the chat\'s identity, once each', () => {
        const changes = vi.fn()
        const stop = watchSelectedChat(changes)
        flushSync()

        selectedCharID.set(1)
        flushSync()
        expect(changes).toHaveBeenCalledTimes(1)

        selectedCharID.set(0)
        flushSync()
        expect(changes).toHaveBeenCalledTimes(2)

        DBState.db.characters[0].chatPage = 1
        flushSync()
        expect(changes).toHaveBeenCalledTimes(3)

        DBState.db.characters[0].chats[1] = chatOf('a-replacement')
        flushSync()
        expect(changes).toHaveBeenCalledTimes(4)

        stop()
    })

    test('it reports nothing for the selection it starts with, or for changes that leave the selection alone', () => {
        const changes = vi.fn()
        const stop = watchSelectedChat(changes)
        flushSync()

        selectedCharID.set(0)
        DBState.db.characters[0].chats[0].message.push({ role: 'user', data: 'hello', time: 1 } as never)
        DBState.db.characters[1].chatPage = 0
        flushSync()

        expect(changes).not.toHaveBeenCalled()
        stop()
    })

    test('after the stop function is called it reports nothing, and calling it again is harmless', () => {
        const changes = vi.fn()
        const stop = watchSelectedChat(changes)
        flushSync()

        stop()
        stop()
        selectedCharID.set(1)
        DBState.db.characters[0].chatPage = 1
        flushSync()

        expect(changes).not.toHaveBeenCalled()
    })

    test('a watcher started with no character selected reports the first selection', () => {
        selectedCharID.set(-1)
        const changes = vi.fn()
        const stop = watchSelectedChat(changes)
        flushSync()

        selectedCharID.set(0)
        flushSync()

        expect(changes).toHaveBeenCalledTimes(1)
        stop()
    })
})
