// @vitest-environment happy-dom

/**
 * `PluginSettings.svelte`'s remove button removes the plugin the user aimed at, and only
 * that plugin, however the plugin list changes while its confirmation is open; the provider
 * selection is cleared only when the removed plugin was the selected provider.
 *
 * Mounts the REAL `PluginSettings.svelte` over a real `$state` database. The plugin runtime
 * (`plugins.svelte.ts`) is a stub that records `loadPlugins`; the alert confirm is a mock the
 * test holds open and answers. Titles beginning "guard:" pin behaviour that must be preserved
 * before and after the change; every other test is a regression reproducer for the behaviour
 * it names.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Database } from 'src/ts/storage/database.svelte'
import type { RisuPlugin } from 'src/ts/plugins/plugins.svelte'

//#region module mocks

const confirms = vi.hoisted(() => {
    const pending: Array<{ message: string, settle: (answer: boolean) => void }> = []
    return {
        pending,
        ask: (message: string) => new Promise<boolean>((settle) => { pending.push({ message, settle }) }),
    }
})

const loadPluginsMock = vi.hoisted(() => vi.fn())

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
        hotReloading: [] as string[],
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/plugins/plugins.svelte'), () => ({
    checkPluginUpdate: vi.fn(async () => undefined),
    createBlankPlugin: vi.fn(),
    importPlugin: vi.fn(),
    loadPlugins: loadPluginsMock,
    togglePluginEnabled: vi.fn(),
    updatePlugin: vi.fn(),
}) as unknown as typeof import('src/ts/plugins/plugins.svelte'))

vi.mock(import('src/ts/plugins/apiV3/developMode'), () => ({
    hotReloadPluginFiles: vi.fn(),
}) as unknown as typeof import('src/ts/plugins/apiV3/developMode'))

vi.mock('src/lib/UI/GUI/TextAreaInput.svelte', () => ({ default: () => {} }))

//#endregion

import { DBState } from 'src/ts/stores.svelte'
import PluginSettings from './PluginSettings.svelte'

//#region helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function settle(): Promise<void> {
    await sleep(20)
    flushSync()
}

function plugin(name: string): RisuPlugin {
    return {
        name, displayName: name, script: '', version: '3.0', arguments: {}, realArg: {},
        customLink: [], argMeta: {}, enabled: true,
    } as unknown as RisuPlugin
}

function installDb(pluginNames: string[], provider = ''): void {
    DBState.db = {
        plugins: pluginNames.map(plugin),
        currentPluginProvider: provider,
    } as unknown as Database
}

const names = () => DBState.db.plugins.map((p) => p.name)

interface Mounted { target: HTMLElement, app: Record<string, unknown> }
let mounted: Mounted[] = []

function mountPlugins(): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(PluginSettings, { target, props: {} }) as unknown as Record<string, unknown>
    mounted.push({ target, app })
    flushSync()
    return target
}

/** The remove (trash) button of the row whose plugin is shown as `title`. */
async function clickRemove(target: HTMLElement, title: string): Promise<void> {
    const span = Array.from(target.querySelectorAll('div.font-bold span')).find((s) => s.textContent?.trim() === title)
    if (!span) throw new Error('row not found: ' + title)
    const buttons = Array.from(span.closest('div.flex.gap-2')!.querySelectorAll('button')) as HTMLButtonElement[]
    buttons[buttons.length - 1].click()
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
    loadPluginsMock.mockClear()
})

afterEach(async () => {
    for (const m of mounted) {
        await unmount(m.app as never)
        m.target.remove()
    }
    mounted = []
})

//#endregion

describe('a plugin remove', () => {
    test('guard: with nothing else changing, the confirmed plugin is removed, no other, and the plugins are reloaded', async () => {
        installDb(['A', 'B', 'C', 'D'])
        const target = mountPlugins()
        await clickRemove(target, 'B')
        await answer(true)
        expect(names()).toEqual(['A', 'C', 'D'])
        expect(loadPluginsMock).toHaveBeenCalled()
    })

    test('guard: removing the selected provider plugin clears the provider', async () => {
        installDb(['A', 'B', 'C'], 'B')
        const target = mountPlugins()
        await clickRemove(target, 'B')
        await answer(true)
        expect(DBState.db.currentPluginProvider).toBe('')
    })

    test('guard: removing another plugin keeps the selected provider', async () => {
        installDb(['A', 'B', 'C'], 'C')
        const target = mountPlugins()
        await clickRemove(target, 'B')
        await answer(true)
        expect(DBState.db.currentPluginProvider).toBe('C')
    })

    test('guard: refusing the confirmation removes nothing', async () => {
        installDb(['A', 'B', 'C'], 'B')
        const target = mountPlugins()
        await clickRemove(target, 'B')
        await answer(false)
        expect(names()).toEqual(['A', 'B', 'C'])
        expect(DBState.db.currentPluginProvider).toBe('B')
    })

    test('a plugin inserted above it while the confirmation is open does not change which plugin is removed', async () => {
        installDb(['A', 'B', 'C', 'D'])
        const target = mountPlugins()
        await clickRemove(target, 'C')
        DBState.db.plugins.unshift(plugin('new'))
        flushSync()
        await answer(true)
        expect(names()).toEqual(['new', 'A', 'B', 'D'])
    })

    test('a plugin inserted above the selected provider while the confirmation is open still clears the provider', async () => {
        installDb(['A', 'B', 'C'], 'C')
        const target = mountPlugins()
        await clickRemove(target, 'C')
        DBState.db.plugins.unshift(plugin('new'))
        flushSync()
        await answer(true)
        expect(names()).toEqual(['new', 'A', 'B'])
        expect(DBState.db.currentPluginProvider).toBe('')
    })

    test('a plugin removed above it while the confirmation is open does not change which plugin is removed', async () => {
        installDb(['A', 'B', 'C', 'D'])
        const target = mountPlugins()
        await clickRemove(target, 'C')
        DBState.db.plugins.splice(0, 1)
        flushSync()
        await answer(true)
        expect(names()).toEqual(['B', 'D'])
    })

    test('two pending removes of the same plugin remove it once', async () => {
        installDb(['A', 'B', 'C', 'D'])
        const target = mountPlugins()
        await clickRemove(target, 'B')
        await clickRemove(target, 'B')
        expect(confirms.pending.length).toBe(2)
        await answer(true)
        await answer(true)
        expect(names()).toEqual(['A', 'C', 'D'])
    })

    test('a plugin removed by something else while its confirmation is open leaves every other plugin and the provider alone', async () => {
        installDb(['A', 'B', 'C', 'D'], 'B')
        const target = mountPlugins()
        await clickRemove(target, 'B')
        DBState.db.plugins.splice(1, 1)
        flushSync()
        await answer(true)
        expect(names()).toEqual(['A', 'C', 'D'])
        expect(DBState.db.currentPluginProvider).toBe('B')
    })
})
