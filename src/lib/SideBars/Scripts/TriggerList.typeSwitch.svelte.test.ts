// @vitest-environment happy-dom

/**
 * `TriggerList.svelte`'s trigger-type switch buttons (V1, V2, Lua) replace the list
 * the user was looking at when the warning was shown, and only while that list is
 * still bound and still of the warned type.
 *
 * Mounts the REAL `TriggerList.svelte`, bound the way `CharConfig.svelte` binds it: a
 * getter and setter that resolve the selected character's triggers at every use. The
 * editors behind the switch (V1 list, V2 list, text area) are stubbed; the alert confirm
 * is a mock the test holds open and answers. Titles beginning "guard:" pin behaviour
 * that must be preserved before and after the change; every other test is a regression
 * reproducer for the behaviour it names.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Database, triggerscript } from 'src/ts/storage/database.svelte'

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
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    openURL: vi.fn(),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/characterCards'), () => ({
    hubURL: 'https://hub.invalid',
}) as unknown as typeof import('src/ts/characterCards'))

vi.mock('src/lib/SideBars/Scripts/TriggerV2List.svelte', () => ({ default: () => {} }))
vi.mock('src/lib/SideBars/Scripts/TriggerV1List.svelte', () => ({ default: () => {} }))
vi.mock('src/lib/UI/GUI/TextAreaInput.svelte', () => ({ default: () => {} }))

//#endregion

import { DBState } from 'src/ts/stores.svelte'
import TriggerList from './TriggerList.svelte'

//#region helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function settle(): Promise<void> {
    await sleep(20)
    flushSync()
}

const selection = $state({ index: 0 })

type Kind = 'v1' | 'v2' | 'lua'

function v1(comment: string): triggerscript {
    return { comment, type: 'start', conditions: [], effect: [] } as triggerscript
}

function v2(comment: string): triggerscript[] {
    return [
        { comment, type: 'manual', conditions: [], effect: [{ type: 'v2Header', code: '', indent: 0 }] },
        { comment: 'Event', type: 'manual', conditions: [], effect: [] },
    ] as triggerscript[]
}

function lua(code: string): triggerscript[] {
    return [{ comment: '', type: 'start', conditions: [], effect: [{ type: 'triggerlua', code }] }] as triggerscript[]
}

function listOf(kind: Kind, tag: string): triggerscript[] {
    return kind === 'v1' ? [v1(tag)] : kind === 'v2' ? v2(tag) : lua(tag)
}

function installDb(lists: triggerscript[][]): void {
    selection.index = 0
    DBState.db = {
        showDeprecatedTriggerV1: true,
        characters: lists.map((triggerscript, i) => ({
            chaId: 'c' + i, name: 'c' + i, type: 'character', chatPage: 0, chats: [], triggerscript,
        })),
    } as unknown as Database
}

/** The character that owns the trigger list; groups are not part of these scenarios. */
const owner = (c: number) => DBState.db.characters[c] as unknown as { triggerscript: triggerscript[] }
const listAt = (c = 0) => owner(c).triggerscript
const kindOf = (list: triggerscript[]): Kind => {
    const t = list?.[0]?.effect?.[0]?.type
    return t === 'v2Header' ? 'v2' : t === 'triggerlua' ? 'lua' : 'v1'
}

interface Mounted { target: HTMLElement, app: Record<string, unknown> }
let mounted: Mounted[] = []

function mountList(): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const props = {
        get value() { return DBState.db.characters[selection.index] ? owner(selection.index).triggerscript : undefined },
        set value(next: triggerscript[]) {
            if (DBState.db.characters[selection.index]) owner(selection.index).triggerscript = next
        },
    }
    const app = mount(TriggerList, { target, props }) as unknown as Record<string, unknown>
    mounted.push({ target, app })
    flushSync()
    return target
}

function switchButton(target: HTMLElement, kind: Kind): HTMLButtonElement {
    const label = kind === 'v1' ? 'V1' : kind === 'v2' ? 'V2' : 'Lua'
    const button = Array.from(target.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)
    if (!button) throw new Error('switch button not found: ' + label)
    return button as HTMLButtonElement
}

async function clickSwitch(target: HTMLElement, kind: Kind): Promise<void> {
    switchButton(target, kind).click()
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

//#endregion

/** Each button, the kind it switches to, and a kind of list that makes it ask first. */
const switches: Array<{ to: Kind, from: Kind }> = [
    { to: 'v1', from: 'v2' },
    { to: 'v2', from: 'v1' },
    { to: 'lua', from: 'v1' },
]

describe.each(switches.map((s) => [s.to, s.from] as const))('the %s button on a %s list', (to, from) => {
    test('guard: a confirmed switch replaces the list with one of the new type', async () => {
        installDb([listOf(from, 'own')])
        const target = mountList()
        await clickSwitch(target, to)
        expect(confirms.pending.length).toBe(1)
        await answer(true)
        expect(kindOf(listAt())).toBe(to)
    })

    test('guard: refusing the warning leaves the list as it was', async () => {
        installDb([listOf(from, 'own')])
        const target = mountList()
        await clickSwitch(target, to)
        await answer(false)
        expect(kindOf(listAt())).toBe(from)
        expect(listAt()[0].comment).toBe('own')
    })

    test('a selection that moves to another character with the same trigger type during the warning leaves that character\'s triggers untouched', async () => {
        installDb([listOf(from, 'first'), listOf(from, 'second')])
        const target = mountList()
        await clickSwitch(target, to)
        selection.index = 1
        flushSync()
        await answer(true)
        expect(kindOf(listAt(1))).toBe(from)
        expect(listAt(1)[0].comment).toBe('second')
        expect(listAt(0)[0].comment).toBe('first')
    })

    test('a list that is replaced by another list of the same type during the warning is left as it is', async () => {
        installDb([listOf(from, 'first')])
        const target = mountList()
        await clickSwitch(target, to)
        owner(0).triggerscript = listOf(from, 'replacement')
        flushSync()
        await answer(true)
        expect(kindOf(listAt())).toBe(from)
        expect(listAt()[0].comment).toBe('replacement')
    })
})

describe('two pending switches on the same list', () => {
    test('the second one does not overwrite edits made after the first was applied', async () => {
        installDb([listOf('v1', 'own')])
        const target = mountList()
        await clickSwitch(target, 'v2')
        await clickSwitch(target, 'v2')
        expect(confirms.pending.length).toBe(2)
        await answer(true)
        expect(kindOf(listAt())).toBe('v2')
        listAt().push({ comment: 'added after the switch', type: 'manual', conditions: [], effect: [] } as triggerscript)
        flushSync()
        await answer(true)
        expect(listAt().map((t) => t.comment)).toContain('added after the switch')
    })
})

describe.each(switches.map((s) => [s.to, s.from] as const))('the %s button on a %s list whose type changes in place during the warning', (to, from) => {
    test('leaves the list as it is when the same list now holds another trigger type', async () => {
        installDb([listOf(from, 'own')])
        const bound = listAt()
        const target = mountList()
        await clickSwitch(target, to)
        // The first effect's type changes in place; the list object itself stays the bound list.
        const changedTo = from === 'v1' ? (to === 'v2' ? 'triggerlua' : 'v2Header') : 'triggerlua'
        bound[0].effect = [{ type: changedTo, code: '', indent: 0 }] as never
        flushSync()
        await answer(true)
        expect(listAt()).toBe(bound)
        expect(listAt().length).toBe(bound.length)
        expect(listAt()[0].effect[0].type).toBe(changedTo)
    })
})