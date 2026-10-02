// @vitest-environment happy-dom

/**
 * `TranslatorPresetSettings.svelte`'s delete button removes the translator preset the user
 * aimed at, and only that preset, however the list changes while its confirmation is open;
 * the last remaining preset is never removed, and the first preset is selected afterwards.
 *
 * Mounts the REAL `TranslatorPresetSettings.svelte` over the real preset normalizer in
 * `src/ts/translator/presets.ts` and a real `$state` database. The alert confirm is a mock
 * the test holds open and answers. Titles beginning "guard:" pin behaviour that must be
 * preserved before and after the change; every other test is a regression reproducer for
 * the behaviour it names.
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

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    downloadFile: vi.fn(),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/util'), () => ({
    selectSingleFile: vi.fn(),
    encryptBuffer: vi.fn(),
    decryptBuffer: vi.fn(),
}) as unknown as typeof import('src/ts/util'))

vi.mock('src/ts/rpack/rpack_js.js', () => ({
    encodeRPack: vi.fn(),
    decodeRPack: vi.fn(),
}))

vi.mock('src/lib/UI/GUI/TextAreaInput.svelte', () => ({ default: () => {} }))

//#endregion

import { DBState } from 'src/ts/stores.svelte'
import TranslatorPresetSettings from './TranslatorPresetSettings.svelte'

//#region helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function settle(): Promise<void> {
    await sleep(20)
    flushSync()
}

function preset(name: string) {
    return { name, prompt: 'prompt-' + name, maxResponse: 500 }
}

function installDb(presetNames: string[], selected: number): void {
    DBState.db = {
        translatorPresets: presetNames.map(preset),
        translatorPresetId: selected,
        translatorPrompt: 'prompt-' + presetNames[selected],
        translatorMaxResponse: 500,
    } as unknown as Database
}

const names = () => DBState.db.translatorPresets.map((p) => p.name)

interface Mounted { target: HTMLElement, app: Record<string, unknown> }
let mounted: Mounted[] = []

function mountPresets(): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(TranslatorPresetSettings, { target, props: {} }) as unknown as Record<string, unknown>
    mounted.push({ target, app })
    flushSync()
    return target
}

/** The toolbar buttons are, in order: add, rename, delete, export, import. */
async function clickDelete(target: HTMLElement): Promise<void> {
    const toolbar = target.querySelector('div.flex.items-center.mb-4')!
    ;(toolbar.querySelectorAll('button')[2] as HTMLButtonElement).click()
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

describe('a translator preset delete', () => {
    test('guard: the selected preset is removed, no other, and the first preset is selected', async () => {
        installDb(['A', 'B', 'C'], 1)
        const target = mountPresets()
        await clickDelete(target)
        expect(confirms.pending.length).toBe(1)
        await answer(true)
        expect(names()).toEqual(['A', 'C'])
        expect(DBState.db.translatorPresetId).toBe(0)
        expect(DBState.db.translatorPrompt).toBe('prompt-A')
    })

    test('guard: the surviving presets keep their contents', async () => {
        installDb(['A', 'B', 'C'], 1)
        const target = mountPresets()
        await clickDelete(target)
        await answer(true)
        expect(DBState.db.translatorPresets).toEqual([preset('A'), preset('C')])
    })

    test('guard: refusing the confirmation removes nothing', async () => {
        installDb(['A', 'B', 'C'], 1)
        const target = mountPresets()
        await clickDelete(target)
        await answer(false)
        expect(names()).toEqual(['A', 'B', 'C'])
        expect(DBState.db.translatorPresetId).toBe(1)
    })

    test('guard: the only preset has no confirmation and is kept', async () => {
        installDb(['A'], 0)
        const target = mountPresets()
        await clickDelete(target)
        expect(confirms.pending.length).toBe(0)
        expect(names()).toEqual(['A'])
    })

    test('a preset inserted above the selected one while the confirmation is open does not change which preset is removed', async () => {
        installDb(['A', 'B', 'C'], 1)
        const target = mountPresets()
        await clickDelete(target)
        DBState.db.translatorPresets.unshift(preset('new'))
        flushSync()
        await answer(true)
        expect(names()).toEqual(['new', 'A', 'C'])
    })

    test('two pending deletes of the selected preset remove it once', async () => {
        installDb(['A', 'B', 'C'], 1)
        const target = mountPresets()
        await clickDelete(target)
        await clickDelete(target)
        expect(confirms.pending.length).toBe(2)
        await answer(true)
        await answer(true)
        expect(names()).toEqual(['A', 'C'])
    })

    test('a preset removed by something else while its confirmation is open leaves every other preset in place', async () => {
        installDb(['A', 'B', 'C'], 1)
        const target = mountPresets()
        await clickDelete(target)
        DBState.db.translatorPresets.splice(1, 1)
        flushSync()
        await answer(true)
        expect(names()).toEqual(['A', 'C'])
    })

    test('a delete whose confirmation outlives all but its own preset keeps that last preset', async () => {
        installDb(['A', 'B'], 0)
        const target = mountPresets()
        await clickDelete(target)
        DBState.db.translatorPresets.splice(1, 1)
        flushSync()
        await answer(true)
        expect(names()).toEqual(['A'])
    })
})
