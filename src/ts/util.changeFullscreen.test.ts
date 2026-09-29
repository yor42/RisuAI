// @vitest-environment node

/**
 * The Fullscreen display setting drives a native window, so it exists only under
 * Tauri: `changeFullscreen` is a no-op that resolves when there is no window, and
 * the `display.fullScreen` item is hidden outside Tauri. The persisted
 * `db.fullScreen` field is untouched by either rule.
 *
 * Drives the real `changeFullscreen` of `./util` and the real
 * `displayOtherSettingsItems` over a mocked platform, database and webview window.
 * `appWindow` is computed when `./util` loads, so each case loads fresh modules.
 *
 * Tests whose title starts with `guard:` pass with or without the change: they
 * pin behaviour that must be preserved.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { writable } from 'svelte/store'
import type { SettingContext } from './setting/types'

const env = vi.hoisted(() => ({
    isTauri: false,
    db: { fullScreen: false } as { fullScreen: boolean },
    appWindow: {
        isFullscreen: vi.fn(async () => false),
        setFullscreen: vi.fn(async (_full: boolean) => {}),
    },
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    readFile: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
    basename: vi.fn(async (p: string) => p.split('/').pop()),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: vi.fn(() => env.appWindow),
}))

vi.mock('src/lib/UI/PopupList.svelte', () => ({
    default: class {},
}))

vi.mock(import('./platform'), () => ({
    get isTauri() { return env.isTauri },
    isNodeServer: false,
    isIOS: () => false,
}) as unknown as typeof import('./platform'))

vi.mock(import('./characters'), () => ({
    createBlankChar: vi.fn(),
    getCharImage: vi.fn(),
}) as unknown as typeof import('./characters'))

vi.mock(import('./stores.svelte'), () => ({
    DBState: { db: env.db },
    selectedCharID: writable(-1),
    CustomGUISettingMenuStore: writable(null),
}) as unknown as typeof import('./stores.svelte'))

vi.mock(import('./storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => env.db),
}) as unknown as typeof import('./storage/database.svelte'))

vi.mock('./gui/animation', () => ({ updateAnimationSpeed: vi.fn() }))
vi.mock('./gui/guisize', () => ({ guiSizeText: vi.fn(), updateGuisize: vi.fn() }))
vi.mock('./gui/colorscheme', () => ({ updateTextThemeAndCSS: vi.fn() }))

const ctx = { db: env.db } as unknown as SettingContext

async function load(tauri: boolean) {
    env.isTauri = tauri
    vi.resetModules()
    const util = await import('./util')
    const data = await import('./setting/displaySettingsData.svelte')
    const { checkCondition } = await import('./setting/utils')
    const item = data.displayOtherSettingsItems.find(i => i.id === 'display.fullScreen')
    if (!item) throw new Error('display.fullScreen item is missing')
    return { util, item, visible: () => checkCondition(item, ctx) }
}

beforeEach(() => {
    env.appWindow.isFullscreen.mockReset().mockResolvedValue(false)
    env.appWindow.setFullscreen.mockReset().mockResolvedValue(undefined)
})

describe('outside Tauri there is no window to drive', () => {
    test.each([true, false])('changeFullscreen resolves without touching a window when db.fullScreen is %s', async (flag) => {
        const { util } = await load(false)
        env.db.fullScreen = flag
        await expect(util.changeFullscreen()).resolves.toBeUndefined()
        expect(env.appWindow.setFullscreen).not.toHaveBeenCalled()
    })

    test('the Fullscreen setting is hidden', async () => {
        const { visible } = await load(false)
        expect(visible()).toBe(false)
    })
})

describe('guard: under Tauri the window is driven', () => {
    test('guard: the Fullscreen setting is shown', async () => {
        const { visible } = await load(true)
        expect(visible()).toBe(true)
    })

    test('guard: changeFullscreen enters fullscreen when db.fullScreen is set and the window is not fullscreen', async () => {
        const { util } = await load(true)
        env.db.fullScreen = true
        env.appWindow.isFullscreen.mockResolvedValue(false)
        await util.changeFullscreen()
        expect(env.appWindow.setFullscreen).toHaveBeenCalledExactlyOnceWith(true)
    })

    test('guard: changeFullscreen leaves fullscreen when db.fullScreen is cleared and the window is fullscreen', async () => {
        const { util } = await load(true)
        env.db.fullScreen = false
        env.appWindow.isFullscreen.mockResolvedValue(true)
        await util.changeFullscreen()
        expect(env.appWindow.setFullscreen).toHaveBeenCalledExactlyOnceWith(false)
    })
})
