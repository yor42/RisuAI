// @vitest-environment happy-dom

/**
 * Regression coverage for `Communities.svelte`'s Discord button (`MC-054`):
 * this file's own invite was found stale (`JzP8tB9ZK8`, a different invite
 * than the one `MainMenu.svelte`'s Discord card already opens) and was
 * corrected to match. Two invites to the same server in source is exactly
 * what `MC-054` exists to prevent, so this test pins the corrected invite
 * against regressing back to the stale one.
 *
 * `src/ts/globalApi.svelte` is mocked so `openURL` can be asserted on
 * without ever calling `window.open` or the Tauri `open` plugin.
 */

import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    openURL: vi.fn(),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

import Communities from './Communities.svelte'
import { openURL } from 'src/ts/globalApi.svelte'

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

function mountCommunities() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    const instance = mount(Communities, { target, props: {} })
    mountedInstances.push(instance)
    flushSync()
    return target
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

describe('Communities.svelte: the Discord button opens the current, non-stale invite', () => {
    test('clicking it calls openURL with exactly https://discord.gg/Exy3NrqkGm', () => {
        const target = mountCommunities()
        const buttons = Array.from(target.querySelectorAll('button')) as HTMLButtonElement[]
        const discordButton = buttons.find((b) => b.textContent?.trim() === 'Discord')
        if (!discordButton) {
            throw new Error('no Discord button found')
        }

        discordButton.click()
        flushSync()

        expect(openURL).toHaveBeenCalledWith('https://discord.gg/Exy3NrqkGm')
        expect(openURL).not.toHaveBeenCalledWith('https://discord.gg/JzP8tB9ZK8')
    })
})
