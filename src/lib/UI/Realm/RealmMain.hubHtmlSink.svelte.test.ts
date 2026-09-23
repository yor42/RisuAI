// @vitest-environment happy-dom

/**
 * Wiring test for the `{@html sanitizeHubHtml(hubAdditionalHTML)}` sink in
 * `RealmMain.svelte` (Stage 1 of the home-screen rework; see
 * `Agents/Live-State.md`, "Current work: the home-screen rework"). Compare
 * `MainMenu.hubHtmlSink.svelte.test.ts`, the sibling test for the other of
 * the two `hubAdditionalHTML` sinks. `src/ts/hubHtml.test.ts` already covers
 * `sanitizeHubHtml` as a pure function; this file mounts the REAL
 * `RealmMain.svelte` against the REAL `src/ts/hubHtml.ts` (not mocked) and
 * drives it with a hostile `hubAdditionalHTML` payload, so a disconnected
 * sink fails here even though it would still pass every unit test on
 * `hubHtml.ts` alone.
 *
 * Unlike `MainMenu.svelte`'s copy, this sink sits at template top level,
 * outside the `{#key charas}` block, so it renders unconditionally as soon
 * as the component mounts -- no `getRisuHub` resolution has to be awaited
 * first. `getRisuHub` is still mocked (to resolve to `[]`) so the real
 * network fetch never fires and `./RealmHubIcon.svelte` never has to
 * render.
 *
 * `./RealmHubIcon.svelte` and `./RealmPopUp.svelte` are stubbed to trivial
 * components, following the `ChatBody.svelte`/`PartialEditController.svelte`
 * precedent in `Chat.messageEditor.svelte.test.ts`: neither is exercised by
 * the sink under test (the icon list stays empty; `openedData` stays
 * `null`, so the popup never renders), and stubbing both keeps this file
 * from also having to mock `src/ts/util` and the rest of `RealmPopUp.svelte`'s
 * own dependency graph.
 */

import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, test, vi } from 'vitest'

//#region module mocks

const hubState = vi.hoisted(() => ({ html: '' }))

vi.mock(import('src/ts/characterCards'), () => ({
    get hubAdditionalHTML() {
        return hubState.html
    },
    getRisuHub: vi.fn(async () => []),
    downloadRisuHub: vi.fn(),
}) as unknown as typeof import('src/ts/characterCards'))

vi.mock(import('src/ts/alert'), () => ({
    alertInput: vi.fn(async () => ''),
}) as unknown as typeof import('src/ts/alert'))

vi.mock(import('src/ts/stores.svelte'), () => {
    // `RealmMain.svelte` imports the REAL `src/ts/hubHtml.ts` (see file
    // header), which imports the REAL `src/ts/globalApi.svelte` for
    // `openURL`. That module's own import graph reaches
    // `src/ts/parser/parser.svelte.ts`, which runs a top-level `$effect.root`
    // reading `selIdState.selId` and `DBState.db.characters` at module load.
    // `selectedCharID` is imported there too, though not read at load time.
    // These three are supplied here only so that module load does not
    // throw; none of them is otherwise exercised by this file's test.
    const state = $state({ db: {} as unknown as Record<string, unknown> })
    const selId = $state({ selId: 0 })
    return {
        DBState: state,
        selIdState: selId,
        selectedCharID: writable(-1),
        MobileGUI: writable(false),
        RealmInitialOpenChar: writable(null),
    } as unknown as typeof import('src/ts/stores.svelte')
})

// Stubbed out entirely -- not rendered (charas stays empty, openedData stays
// null) and not itself under test (see file header).
vi.mock('./RealmHubIcon.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))
vi.mock('./RealmPopUp.svelte', () => ({
    default: (_target: unknown) => ({ destroy: () => {} }),
}))

//#endregion

import RealmMain from './RealmMain.svelte'

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

function mountRealmMain() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    const instance = mount(RealmMain, { target, props: {} })
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
    vi.clearAllMocks()
})

describe('RealmMain.svelte: the hubAdditionalHTML sink is wired to sanitizeHubHtml', () => {
    test('a hostile hubAdditionalHTML payload is sanitized before it reaches the DOM', () => {
        hubState.html = '<img src=x onerror="alert(1)"><p>safe text</p>'

        const target = mountRealmMain()

        expect(target.innerHTML).not.toContain('onerror')
        expect(target.innerHTML).not.toContain('<img')
        expect(target.innerHTML).toContain('<p>safe text</p>')
    })
})
