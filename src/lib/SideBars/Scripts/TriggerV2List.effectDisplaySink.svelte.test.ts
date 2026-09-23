// @vitest-environment happy-dom

/**
 * Wiring test for the `{@html formatEffectDisplay(effect, effectSupportContext())}`
 * sink in `TriggerV2List.svelte` (Stage 1b of the home-screen rework; see
 * `Agents/Live-State.md`, "Current work: the home-screen rework"). This is
 * the sink Stage 1b was written to close, and the one the gate found had a
 * SECOND, easier route into the same `{@html}` -- the raw `type` string
 * fallback -- left open after the first fix. `src/ts/triggerEffectDisplay.test.ts`
 * covers `formatEffectDisplay` and `escapeHtml` as pure functions in
 * isolation; neither proves the `.svelte` sink actually calls the escaping
 * composition rather than, say, an inline unescaped template. This file
 * mounts the REAL `TriggerV2List.svelte` against the REAL
 * `src/ts/triggerEffectDisplay.ts` (not mocked) and drives it with a hostile
 * effect value, so a disconnected sink fails here even though it would
 * still pass every unit test on `triggerEffectDisplay.ts` alone.
 *
 * `src/ts/process/triggers` is mocked because it is the module
 * `triggerEffectDisplay.test.ts` documents as re-exporting the app's entire
 * dependency graph (`database.svelte`, Tauri plugins, `stores.svelte`'s
 * module effects) and crashing on a TDZ error when imported for real from a
 * plain test -- this file hits the exact same import through
 * `TriggerV2List.svelte`'s own `formatEffectDisplay`/`formatEffectLabel`
 * import, so the same mock (matching `triggerEffectDisplay.test.ts`'s own)
 * is required here too. `src/ts/stores.svelte` is mocked because
 * `TriggerV2List.svelte` reads `DBState.db.showDeprecatedTriggerV2` inside
 * an `$effect` that runs on mount.
 *
 * The editor panel that carries this sink -- and therefore the sink itself
 * -- sits behind `{#if selectedIndex > 0}`; the component mounts showing
 * only a single "Edit" button until that button is clicked (which the real
 * component wires to set `selectedIndex = 1`). The panel is also wrapped in
 * a `<Portal>` (`src/lib/UI/GUI/Portal.svelte`), which mounts its children
 * into `document.body` rather than the component's own mount target, so
 * this file asserts against `document.body.innerHTML` after the click,
 * not the original mount target's.
 */

import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vitest'

//#region module mocks

// Matches `src/ts/triggerEffectDisplay.test.ts`'s own mock of this module
// exactly (see that file's header comment for why the real module cannot be
// imported from a test). The two lists are deliberately NOT copied from the
// real module, for the same reason given there: the sink-wiring behaviour
// under test here does not depend on today's list contents.
vi.mock(import('src/ts/process/triggers'), () => ({
    displayAllowList: ['v2GetDisplayState', 'v2SetDisplayState'],
    requestAllowList: ['v2GetRequestState'],
}) as unknown as typeof import('src/ts/process/triggers'))

vi.mock(import('src/ts/stores.svelte'), () => {
    // `Help.svelte`/`TextAreaInput.svelte` (both rendered inside the editor
    // panel this file opens) reach `src/ts/parser/parser.svelte.ts` through
    // their own real imports below, which runs a top-level `$effect.root`
    // reading `selIdState.selId` and `DBState.db.characters` at module load.
    // Supplied here only so that module load does not throw.
    const state = $state({ db: {} as unknown as Record<string, unknown> })
    const selId = $state({ selId: 0 })
    return {
        DBState: state,
        selIdState: selId,
    } as unknown as typeof import('src/ts/stores.svelte')
})

// `Help.svelte` (rendered inside the editor panel this file opens) imports
// `src/ts/alert`, whose own import graph reaches `storage/database.svelte`
// and the rest of the app's boot-time dependencies. Mocked for the same
// reason `src/ts/process/triggers` is mocked above: importing it for real
// from a plain test crashes.
vi.mock(import('src/ts/alert'), () => ({
    alertMd: vi.fn(),
}) as unknown as typeof import('src/ts/alert'))

// `TextAreaInput.svelte` (also rendered inside the editor panel) imports
// `src/ts/util` directly, which itself imports Tauri plugins and
// `storage/database.svelte`. Mocked for the same reason.
vi.mock(import('src/ts/util'), () => ({
    sleep: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/util'))

//#endregion

import TriggerV2List from './TriggerV2List.svelte'
import type { triggerscript } from 'src/ts/process/triggers'

const HOSTILE = '<img src=x onerror=alert(1)>'

const mountedTargets: HTMLElement[] = []
const mountedInstances: unknown[] = []

function mountList(value: triggerscript[]) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mountedTargets.push(target)
    const instance = mount(TriggerV2List, { target, props: { value } })
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

describe('TriggerV2List.svelte effect list: the formatEffectDisplay sink is wired to its escaping', () => {
    test('a hostile v2Comment value is escaped before it reaches the DOM', () => {
        const value: triggerscript[] = [
            { comment: 'header', type: 'manual', conditions: [], effect: [] },
            {
                comment: 'test trigger',
                type: 'manual',
                conditions: [],
                effect: [{ type: 'v2Comment', value: HOSTILE, indent: 0 } as never],
            },
        ]
        const target = mountList(value)

        // Open the editor: the panel carrying the sink sits behind
        // `{#if selectedIndex > 0}`, and only the "Edit" button is rendered
        // until it is clicked.
        const editButton = target.querySelector<HTMLButtonElement>('button')
        expect(editButton).not.toBeNull()
        editButton!.click()
        flushSync()

        // The editor panel renders through <Portal>, into document.body,
        // not into this component's own mount target.
        expect(document.body.innerHTML).not.toContain('<img')
        expect(document.body.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })
})
