// @vitest-environment happy-dom

/**
 * `SettingsLegalLinks.svelte` is the footer of the settings menu: two plain
 * links to this fork's own Terms of Service and Privacy Policy, opened with the
 * app's `openURL` and with no acceptance step. The upstream agreement popup
 * has its own links and is covered by `AlertComp.tos.svelte.test.ts`.
 *
 * MOCKED: `src/ts/globalApi.svelte` (only `openURL`, as a spy; the real module
 * pulls in the whole app). `src/lang` and `src/ts/forkLegalLinks` are real.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'

const { openUrlSpy } = vi.hoisted(() => ({ openUrlSpy: vi.fn() }))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    openURL: openUrlSpy,
}) as unknown as typeof import('src/ts/globalApi.svelte'))

import { language } from 'src/lang'
import { FORK_PRIVACY_POLICY_URL, FORK_TERMS_OF_SERVICE_URL } from 'src/ts/forkLegalLinks'
import SettingsLegalLinks from './SettingsLegalLinks.svelte'

const mounted: { app: Record<string, unknown>; target: HTMLElement }[] = []

function mountLinks(): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(SettingsLegalLinks, { target })
    mounted.push({ app, target })
    flushSync()
    return target
}

afterEach(async () => {
    for (const { app, target } of mounted.splice(0)) {
        await unmount(app)
        target.remove()
    }
    vi.clearAllMocks()
})

describe('fork legal links', () => {
    test('the constants point at the fork documents on the default branch', () => {
        expect(FORK_TERMS_OF_SERVICE_URL).toBe('https://github.com/yor42/RisuTanium/blob/HEAD/docs/Terms-of-Services.md')
        expect(FORK_PRIVACY_POLICY_URL).toBe('https://github.com/yor42/RisuTanium/blob/HEAD/docs/Privacy-Policy.md')
    })
})

describe('SettingsLegalLinks.svelte', () => {
    test('renders two labelled buttons, Terms of Service first, with no other controls', () => {
        const target = mountLinks()
        const buttons = Array.from(target.querySelectorAll('button'))

        expect(buttons.map((b) => b.textContent)).toEqual([language.forkTermsOfService, language.forkPrivacyPolicy])
        expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true)
        expect(target.querySelector('nav')?.getAttribute('aria-label')).toBe(language.forkLegalLinksLabel)
    })

    test('each button opens its own document through openURL and does nothing else', () => {
        const target = mountLinks()
        const [terms, privacy] = Array.from(target.querySelectorAll('button'))

        terms.click()
        expect(openUrlSpy).toHaveBeenCalledTimes(1)
        expect(openUrlSpy).toHaveBeenLastCalledWith(FORK_TERMS_OF_SERVICE_URL)

        privacy.click()
        expect(openUrlSpy).toHaveBeenCalledTimes(2)
        expect(openUrlSpy).toHaveBeenLastCalledWith(FORK_PRIVACY_POLICY_URL)
    })
})
