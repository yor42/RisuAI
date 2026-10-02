// @vitest-environment happy-dom

/**
 * `lorepreset.svelte`'s delete button removes the lorebook preset the user aimed at,
 * and only that preset, however the list changes while its confirmation is open; the
 * last remaining preset is never removed.
 *
 * Mounts the REAL `lorepreset.svelte` over a real `$state` database. The alert confirm
 * is a mock the test holds open and answers. Titles beginning "guard:" pin behaviour
 * that must be preserved before and after the change; every other test is a regression
 * reproducer for the behaviour it names.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Database } from 'src/ts/storage/database.svelte'

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

//#endregion

import { DBState } from 'src/ts/stores.svelte'
import LorePreset from './lorepreset.svelte'

//#region helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function settle(): Promise<void> {
    await sleep(20)
    flushSync()
}

function installDb(names: string[], page = 0): void {
    DBState.db = {
        loreBook: names.map((name) => ({ name, data: [] })),
        loreBookPage: page,
    } as unknown as Database
}

const names = () => DBState.db.loreBook.map((l) => l.name)

interface Mounted { target: HTMLElement, app: Record<string, unknown> }
let mounted: Mounted[] = []

function mountPresets(): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(LorePreset, { target, props: { close: vi.fn() } }) as unknown as Record<string, unknown>
    mounted.push({ target, app })
    flushSync()
    return target
}

/** The trash control of the row whose title is `title`. */
function trash(target: HTMLElement, title: string): HTMLElement {
    const span = Array.from(target.querySelectorAll('span')).find((s) => s.textContent?.trim() === title)
    if (!span) throw new Error('row not found: ' + title)
    const controls = Array.from(span.closest('button')!.querySelectorAll('[role=button]')) as HTMLElement[]
    return controls[controls.length - 1]
}

async function clickTrash(target: HTMLElement, title: string): Promise<void> {
    trash(target, title).click()
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

describe('a lorebook preset delete', () => {
    test('guard: with nothing else changing, the confirmed preset is removed, no other, and the first preset is selected', async () => {
        installDb(['L0', 'L1', 'L2', 'L3'], 2)
        const target = mountPresets()
        await clickTrash(target, 'L1')
        await answer(true)
        expect(names()).toEqual(['L0', 'L2', 'L3'])
        expect(DBState.db.loreBookPage).toBe(0)
    })

    test('guard: deleting the selected preset removes it and selects the first', async () => {
        installDb(['L0', 'L1', 'L2'], 1)
        const target = mountPresets()
        await clickTrash(target, 'L1')
        await answer(true)
        expect(names()).toEqual(['L0', 'L2'])
        expect(DBState.db.loreBookPage).toBe(0)
    })

    test('guard: refusing the confirmation removes nothing', async () => {
        installDb(['L0', 'L1', 'L2'])
        const target = mountPresets()
        await clickTrash(target, 'L1')
        await answer(false)
        expect(names()).toEqual(['L0', 'L1', 'L2'])
    })

    test('guard: the only preset has no confirmation and is kept', async () => {
        installDb(['L0'])
        const target = mountPresets()
        await clickTrash(target, 'L0')
        expect(confirms.pending.length).toBe(0)
        expect(names()).toEqual(['L0'])
    })

    test('a preset inserted above it while the confirmation is open does not change which preset is removed', async () => {
        installDb(['L0', 'L1', 'L2', 'L3'])
        const target = mountPresets()
        await clickTrash(target, 'L2')
        DBState.db.loreBook.unshift({ name: 'new', data: [] })
        flushSync()
        await answer(true)
        expect(names()).toEqual(['new', 'L0', 'L1', 'L3'])
    })

    test('a preset removed above it while the confirmation is open does not change which preset is removed', async () => {
        installDb(['L0', 'L1', 'L2', 'L3'])
        const target = mountPresets()
        await clickTrash(target, 'L2')
        DBState.db.loreBook.splice(0, 1)
        flushSync()
        await answer(true)
        expect(names()).toEqual(['L1', 'L3'])
    })

    test('two pending deletes of the same preset remove it once', async () => {
        installDb(['L0', 'L1', 'L2', 'L3'])
        const target = mountPresets()
        await clickTrash(target, 'L1')
        await clickTrash(target, 'L1')
        expect(confirms.pending.length).toBe(2)
        await answer(true)
        await answer(true)
        expect(names()).toEqual(['L0', 'L2', 'L3'])
    })

    test('a preset removed by something else while its confirmation is open leaves every other preset in place', async () => {
        installDb(['L0', 'L1', 'L2', 'L3'])
        const target = mountPresets()
        await clickTrash(target, 'L1')
        DBState.db.loreBook.splice(1, 1)
        flushSync()
        await answer(true)
        expect(names()).toEqual(['L0', 'L2', 'L3'])
    })

    test('a delete whose confirmation outlives all but its own preset keeps that last preset', async () => {
        installDb(['L0', 'L1'])
        const target = mountPresets()
        await clickTrash(target, 'L0')
        DBState.db.loreBook.splice(1, 1)
        flushSync()
        await answer(true)
        expect(names()).toEqual(['L0'])
    })
})
