// @vitest-environment happy-dom

/**
 * Wiring test for the `{@html sanitizeHubHtml(hubAdditionalHTML)}` sink in
 * `MainMenu.svelte` (Stage 1 of the home-screen rework; see
 * `Agents/Live-State.md`, "Current work: the home-screen rework"). Both
 * `src/ts/hubHtml.test.ts` and `src/ts/triggerEffectDisplay.test.ts` cover
 * the sanitizer and the formatter as pure functions in isolation -- neither
 * proves the `.svelte` sink actually calls them. This file mounts the REAL
 * `MainMenu.svelte` against the REAL `src/ts/hubHtml.ts` (not mocked) and
 * drives it with a hostile `hubAdditionalHTML` payload, so a disconnected
 * sink (the call removed, or replaced with a no-op) fails this test even
 * though it would still pass every unit test on `hubHtml.ts` alone.
 *
 * `src/ts/characterCards` is mocked for two reasons named in the brief: it
 * is a `.ts` file (not `.svelte.ts`), so `hubAdditionalHTML` is a plain,
 * non-reactive module binding that can only be controlled by mocking its
 * defining module, and the real `getRisuHub` performs a network fetch this
 * test must not make. `./Realm/RealmMain.svelte` (mounted only once
 * `$OpenRealmStore` is true, which this file never sets) and
 * `./Realm/RealmHubIcon.svelte` (rendered per hub character, not itself
 * part of the sink under test) are stubbed to trivial components, following
 * the `ChatBody.svelte`/`PartialEditController.svelte` precedent in
 * `Chat.messageEditor.svelte.test.ts` -- stubbing them keeps this file from
 * also having to mock `src/ts/alert` and `src/ts/util`, which neither
 * component's own logic is under test here.
 */

import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, test, vi } from 'vitest'

//#region module mocks

const hubState = vi.hoisted(() => ({ html: '', charas: [] as unknown[] }))

vi.mock(import('src/ts/characterCards'), () => ({
    get hubAdditionalHTML() {
        return hubState.html
    },
    getRisuHub: vi.fn(async () => hubState.charas),
}) as unknown as typeof import('src/ts/characterCards'))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    getVersionString: vi.fn(() => 'test-version'),
    openURL: vi.fn(),
}) as unknown as typeof import('src/ts/globalApi.svelte'))

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: { hideRealm: false, realmDirectOpen: false } as unknown as Record<string, unknown> })
    return {
        DBState: state,
        OpenRealmStore: writable(false),
        RealmInitialOpenChar: writable(null),
    } as unknown as typeof import('src/ts/stores.svelte')
})

// Stubbed out entirely -- not rendered ($OpenRealmStore stays false in every
// test here) and not itself under test (see file header).
vi.mock('./Realm/RealmMain.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))
// Stubbed out entirely -- rendered per hub character once `charas.length >
// 0`, but its own markup is not the sink under test.
vi.mock('./Realm/RealmHubIcon.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))

//#endregion

import MainMenu from './MainMenu.svelte'

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

function mountMainMenu() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    const instance = mount(MainMenu, { target, props: {} })
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
    hubState.html = ''
    hubState.charas = []
    vi.clearAllMocks()
})

describe('MainMenu.svelte realm preview: the hubAdditionalHTML sink is wired to sanitizeHubHtml', () => {
    test('a hostile hubAdditionalHTML payload is sanitized before it reaches the DOM', async () => {
        hubState.html = '<img src=x onerror="alert(1)"><p>safe text</p>'
        // At least one hub character is required: the sink sits inside
        // `{#if charas.length > 0}` in MainMenu.svelte.
        hubState.charas = [{ id: 'chara-1' }]

        const target = mountMainMenu()
        // Let the `{#await getRisuHub(...) then charas}` block resolve.
        await Promise.resolve()
        await Promise.resolve()
        flushSync()

        expect(target.innerHTML).not.toContain('onerror')
        expect(target.innerHTML).not.toContain('<img')
        expect(target.innerHTML).toContain('<p>safe text</p>')
    })
})
