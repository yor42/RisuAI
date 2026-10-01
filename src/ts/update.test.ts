/**
 * The desktop updater is off until the fork has its own release endpoint and
 * signing key. `checkRisuUpdate()` must return before any plugin call, process
 * relaunch or network request, whatever the updater plugin would answer.
 *
 * The updater plugin, the process plugin, the alert surface and the language
 * table are mocked; this exercises the real `update.ts` only. Native updater
 * behaviour (the Rust plugin and `tauri.conf.json`) is covered by
 * `updaterConfig.test.ts` at the config level, not here.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const updater = vi.hoisted(() => ({
    check: vi.fn(),
    downloadAndInstall: vi.fn(async () => {}),
    relaunch: vi.fn(async () => {}),
    alertConfirm: vi.fn(async () => true),
    alertSelect: vi.fn(async () => '0'),
    alertWait: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
    check: updater.check,
}))

vi.mock('@tauri-apps/plugin-process', () => ({
    relaunch: updater.relaunch,
}))

vi.mock('./alert', () => ({
    alertConfirm: updater.alertConfirm,
    alertSelect: updater.alertSelect,
    alertWait: updater.alertWait,
}))

vi.mock('../lang', () => ({
    language: new Proxy({}, { get: (_target, key) => `lang:${String(key)}` }),
}))

describe('checkRisuUpdate while the updater is disabled', () => {
    const fetchSpy = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        // An offered update, so any code path that reaches the plugin would go on to install it.
        updater.check.mockResolvedValue({ version: '9999.0.0', downloadAndInstall: updater.downloadAndInstall })
        vi.stubGlobal('fetch', fetchSpy)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    test('never checks, downloads, installs, relaunches or fetches', async () => {
        const { checkRisuUpdate } = await import('./update')

        await checkRisuUpdate()

        expect(updater.check).not.toHaveBeenCalled()
        expect(updater.downloadAndInstall).not.toHaveBeenCalled()
        expect(updater.relaunch).not.toHaveBeenCalled()
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    test('never prompts the user about an update', async () => {
        const { checkRisuUpdate } = await import('./update')

        await checkRisuUpdate()

        expect(updater.alertConfirm).not.toHaveBeenCalled()
        expect(updater.alertSelect).not.toHaveBeenCalled()
        expect(updater.alertWait).not.toHaveBeenCalled()
    })
})
