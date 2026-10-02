// @vitest-environment happy-dom

/**
 * `SideChatList.svelte`'s chat-folder delete button removes the folder the user aimed at,
 * and releases only the chats that were in that folder, however the folder list changes
 * while its confirmation is open.
 *
 * Mounts the REAL `SideChatList.svelte` over a real `$state` character. The chat functions
 * of `src/ts/characters.ts`, the toggles panel and the drag library are stubs; the alert
 * confirm is a mock the test holds open and answers. Titles beginning "guard:" pin
 * behaviour that must be preserved before and after the change; every other test is a
 * regression reproducer for the behaviour it names.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Database, character } from 'src/ts/storage/database.svelte'

//#region module mocks

const confirms = vi.hoisted(() => {
    const pending: Array<{ message: string, settle: (answer: boolean) => void }> = []
    return {
        pending,
        ask: (message: string) => new Promise<boolean>((settle) => { pending.push({ message, settle }) }),
    }
})

vi.mock(import('src/ts/alert'), () => {
    const stub: Record<string, unknown> = {
        alertConfirm: confirms.ask,
        alertStore: writable({ type: 'none', msg: '' }),
    }
    return new Proxy(stub, {
        get: (t, k) => (k in t ? t[k as string] : k === 'then' ? undefined : vi.fn()),
        has: () => true,
    }) as unknown as typeof import('src/ts/alert')
})

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(0),
        ReloadGUIPointer: writable(0),
        bookmarkListOpen: writable(false),
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/characters'), () => ({
    exportChat: vi.fn(),
    importChat: vi.fn(),
    exportAllChats: vi.fn(),
    createNewChat: vi.fn(),
    removeChatConfirmed: vi.fn(async () => false),
}) as unknown as typeof import('src/ts/characters'))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    changeChatTo: vi.fn(),
    createChatCopyName: vi.fn((name: string) => `${name} Copy`),
    reorderChatsKeepingCurrent: vi.fn(),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/util'), () => ({
    sleep: vi.fn(async () => {}),
    sortableOptions: { delay: 300, delayOnTouchOnly: true, filter: '.no-sort', onMove: () => true },
}) as unknown as typeof import('src/ts/util'))

vi.mock('sortablejs/modular/sortable.core.esm.js', () => {
    class Sortable {
        static create() { return new Sortable() }
        destroy() {}
    }
    return { default: Sortable }
})

vi.mock('./Toggles.svelte', () => ({ default: () => {} }))

//#endregion

import { DBState } from 'src/ts/stores.svelte'
import SideChatList from './SideChatList.svelte'

//#region helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function settle(): Promise<void> {
    await sleep(20)
    flushSync()
}

interface FolderFixture { id: string, name: string }
interface ChatFixture { name: string, folder: string | null }

function makeCharacter(folders: FolderFixture[], chats: ChatFixture[]): character {
    const chara = $state({
        type: 'character', chaId: 'c0', name: 'c0', chatPage: 0,
        chatFolders: folders.map((f) => ({ id: f.id, name: f.name, folded: false })),
        chats: chats.map((c, i) => ({ id: 'chat-' + i, name: c.name, message: [], note: '', localLore: [], folderId: c.folder })),
    })
    return chara as unknown as character
}

const folderNames = (c: character) => c.chatFolders.map((f) => f.name)
const folderOf = (c: character) => Object.fromEntries(c.chats.map((chat) => [chat.name, chat.folderId ?? null]))

interface Mounted { target: HTMLElement, app: Record<string, unknown> }
let mounted: Mounted[] = []

function mountList(chara: character): HTMLElement {
    DBState.db = { characters: [], personas: [], selectedPersona: 0 } as unknown as Database
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(SideChatList, { target, props: { chara } }) as unknown as Record<string, unknown>
    mounted.push({ target, app })
    flushSync()
    return target
}

/** The delete control of the folder header titled `title`: the last control in its header. */
async function clickDeleteFolder(target: HTMLElement, title: string): Promise<void> {
    const span = Array.from(target.querySelectorAll('button > span')).find((s) => s.textContent?.trim() === title)
    if (!span) throw new Error('folder not found: ' + title)
    const controls = Array.from(span.closest('button')!.querySelectorAll('[role=button]')) as HTMLElement[]
    controls[controls.length - 1].click()
    await settle()
}

async function answer(value: boolean): Promise<void> {
    const next = confirms.pending.shift()
    if (!next) throw new Error('no confirmation is open')
    next.settle(value)
    await settle()
}

beforeEach(() => {
    confirms.pending.length = 0
})

afterEach(async () => {
    for (const m of mounted) {
        await unmount(m.app as never)
        m.target.remove()
    }
    mounted = []
})

const folders = () => [{ id: 'f0', name: 'F0' }, { id: 'f1', name: 'F1' }, { id: 'f2', name: 'F2' }, { id: 'f3', name: 'F3' }]
const chats = () => [
    { name: 'in0', folder: 'f0' }, { name: 'in1a', folder: 'f1' }, { name: 'in1b', folder: 'f1' },
    { name: 'in2', folder: 'f2' }, { name: 'loose', folder: null },
]

//#endregion

describe('a chat folder delete', () => {
    test('guard: with nothing else changing, the confirmed folder is removed, its chats are released and no other chat changes', async () => {
        const chara = makeCharacter(folders(), chats())
        const target = mountList(chara)
        await clickDeleteFolder(target, 'F1')
        await answer(true)
        expect(folderNames(chara)).toEqual(['F0', 'F2', 'F3'])
        expect(folderOf(chara)).toEqual({ in0: 'f0', in1a: null, in1b: null, in2: 'f2', loose: null })
    })

    test('guard: refusing the confirmation removes nothing', async () => {
        const chara = makeCharacter(folders(), chats())
        const target = mountList(chara)
        await clickDeleteFolder(target, 'F1')
        await answer(false)
        expect(folderNames(chara)).toEqual(['F0', 'F1', 'F2', 'F3'])
        expect(folderOf(chara).in1a).toBe('f1')
    })

    test('a folder inserted above it while the confirmation is open does not change which folder is removed or whose chats are released', async () => {
        const chara = makeCharacter(folders(), chats())
        const target = mountList(chara)
        await clickDeleteFolder(target, 'F2')
        chara.chatFolders.unshift({ id: 'fnew', name: 'new', folded: false } as never)
        flushSync()
        await answer(true)
        expect(folderNames(chara)).toEqual(['new', 'F0', 'F1', 'F3'])
        expect(folderOf(chara)).toEqual({ in0: 'f0', in1a: 'f1', in1b: 'f1', in2: null, loose: null })
    })

    test('a folder removed above it while the confirmation is open does not change which folder is removed or whose chats are released', async () => {
        const chara = makeCharacter(folders(), chats())
        const target = mountList(chara)
        await clickDeleteFolder(target, 'F2')
        chara.chatFolders.splice(0, 1)
        flushSync()
        await answer(true)
        expect(folderNames(chara)).toEqual(['F1', 'F3'])
        expect(folderOf(chara)).toEqual({ in0: 'f0', in1a: 'f1', in1b: 'f1', in2: null, loose: null })
    })

    test('two pending deletes of the same folder remove it once', async () => {
        const chara = makeCharacter(folders(), chats())
        const target = mountList(chara)
        await clickDeleteFolder(target, 'F1')
        await clickDeleteFolder(target, 'F1')
        expect(confirms.pending.length).toBe(2)
        await answer(true)
        await answer(true)
        expect(folderNames(chara)).toEqual(['F0', 'F2', 'F3'])
        expect(folderOf(chara).in2).toBe('f2')
    })

    test('a folder removed by something else while its confirmation is open leaves every other folder and chat in place', async () => {
        const chara = makeCharacter(folders(), chats())
        const target = mountList(chara)
        await clickDeleteFolder(target, 'F1')
        chara.chatFolders.splice(1, 1)
        flushSync()
        await answer(true)
        expect(folderNames(chara)).toEqual(['F0', 'F2', 'F3'])
        expect(folderOf(chara).in2).toBe('f2')
    })
})
