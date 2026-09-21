// @vitest-environment happy-dom

/**
 * Regression tests for plan AV-1 (`Agents/Reports/12-charlist-avatar-plan.md`
 * section 2): each listed character's avatar should be resolved (a call to
 * `getFileSrc` through `getCharImage`) ONCE, not re-resolved on every
 * re-render of an unrelated part of the list.
 *
 * This file mounts the REAL `GridCatalog.svelte` (and therefore the REAL
 * `MobileCharacters.svelte` and `BarIcon.svelte`) with Svelte's `mount()`
 * into happy-dom, drives it exactly like a user would (click the real
 * layout buttons, type into the real search input, mutate `DBState.db`
 * directly the way the rest of the app does), and counts calls to a spy
 * standing in for `getFileSrc` -- the same pattern as
 * `Agents/Tools/save-gen/charlist-avatar-count.svelte.harness.ts`, scaled
 * down to a suite-friendly N and reusing one mount per layout (see the plan's
 * "Gate requirement (MAJOR)" in section 2.3: fresh N=1000 mounts per
 * scenario caused a heap OOM in that harness; N here is 60 non-trashed + 5
 * trashed, one mount per layout, reused across every scenario for that
 * layout).
 *
 * MOCKED, AND WHY (kept in this ONE file, per the harness's own
 * "harnesses that mock the app's rune modules: keep them in ONE file"
 * convention):
 *   - `localforage` -- IndexedDB backend; inert stub, never exercised here.
 *   - `src/ts/globalApi.svelte` -- `getFileSrc` is replaced with a COUNTING
 *     SPY (records every `loc` argument, resolves on the same microtask
 *     tick). Every other export is an inert no-op stub; none is called by
 *     these scenarios.
 *   - `src/ts/storage/database.svelte` -- `getDatabase()` returns the same
 *     `DBState.db` the tests set directly (Sidebar.svelte's own `$effect`
 *     calls it unconditionally via `getCharacterIndexObject()`; see the
 *     inline comment at that mock for detail). `presetTemplate` is a small
 *     stub, as in the harness.
 *   - `src/ts/platform` -- forces the plain-HTTP branch (`isTauri: false`).
 *   - `@tauri-apps/plugin-fs` -- stubbed; not exercised when `isTauri` is
 *     false.
 *   - `src/ts/stores.svelte` -- replaced with a thin, genuinely reactive
 *     (`$state`-backed) stand-in exposing every store this import graph
 *     reads, identical in shape to the harness's own mock.
 *   - `src/ts/characters` -- a PARTIAL mock: every export is the REAL one
 *     (via `importOriginal`), except `changeChar`, which is replaced with a
 *     plain `vi.fn()` spy so click-target tests can assert which index was
 *     passed, without the real `changeChar` mutating the fixture characters
 *     via `characterFormatUpdate` (default-field backfill) as a side effect
 *     of a click assertion that only cares about the index. `getCharImage`
 *     is untouched and real, per the task brief.
 *
 * NOT mocked: `src/ts/characters`'s `getCharImage` (real), `src/lang`,
 * `src/ts/util.ts`, `GridCatalog.svelte`, `MobileCharacters.svelte`,
 * `BarIcon.svelte`, `TextInput.svelte`, `Button.svelte`, the lucide icon
 * components, and everything `characters.ts` drags in transitively (this is
 * the same ~13-17s one-time Vite transform cost the harness documents; only
 * the first test below pays it).
 *
 * RED BEFORE GREEN: every assertion below is written against the AFTER
 * state described in the plan's section 2.5 table. Comments say what
 * currently happens only where it differs from what is asserted; comments
 * never say "will pass once fixed" -- they describe the assertion in the
 * present tense, since that is what a future, already-fixed reader of this
 * file needs it to mean.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest'
import type { Database } from '../../ts/storage/database.svelte'
import type { RisuEnvironmentLabel } from '../../ts/platform'

//#region module mocks (kept in this one file -- see header)

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

// The counting spy IS the measurement instrument, same pattern as the
// harness. vi.mock factories are hoisted above ordinary top-level
// const/let, so the spy must live in vi.hoisted() to be visible to the
// factory below at the time it runs.
const { getFileSrcSpy, changeCharSpy } = vi.hoisted(() => ({
    getFileSrcSpy: vi.fn(async (loc: string) => `data:mock-image;loc=${loc}`),
    changeCharSpy: vi.fn(),
}))

vi.mock(
    import('src/ts/globalApi.svelte'),
    () =>
        ({
            forageStorage: {
                isAccount: false,
                keys: vi.fn(async () => []),
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => {}),
            },
            getFileSrc: getFileSrcSpy,
            checkCharOrder: vi.fn(),
            requiresFullEncoderReload: { state: false },
            AppendableBuffer: class {},
            VirtualWriter: class {},
            LocalWriter: class {},
            BlankWriter: class {},
            downloadFile: vi.fn(),
            openURL: vi.fn(),
            loadAsset: vi.fn(),
            saveAsset: vi.fn(),
            readImage: vi.fn(),
            globalFetch: vi.fn(),
            aiWatermarkingLawApplies: vi.fn(() => false),
            changeChatTo: vi.fn(),
            hubURL: '',
            usingSw: false,
            // AlertComp.svelte's own direct needs (its selectChar branch
            // never calls these, but the named imports must resolve).
            getFetchLogs: vi.fn(() => []),
            getFetchData: vi.fn(() => ({})),
            aiLawApplies: vi.fn(() => false),
        }) as unknown as typeof import('src/ts/globalApi.svelte'),
)

// `getDatabase()` returns the same `DBState.db` the tests set directly --
// unlike GridCatalog/MobileCharacters, which never call it, Sidebar.svelte's
// own `$effect` (`:83-130`) calls `getCharacterIndexObject()`
// (`src/ts/util.ts:278-287`), which calls `getDatabase()` unconditionally.
// A version that throws (as some other harnesses in this repo use, since
// their components never reach this call) makes every Sidebar mount throw
// inside that effect. The dynamic import inside the factory resolves to the
// ALREADY-mocked `stores.svelte` below (vi.mock intercepts by resolved
// module id, regardless of who imports it or when).
vi.mock(import('src/ts/storage/database.svelte'), async () => {
    const { DBState } = await import('../../ts/stores.svelte')
    return {
        getDatabase: vi.fn((options?: { snapshot?: boolean }) => DBState.db),
        // AlertComp.svelte imports this too; not called on the selectChar
        // branch, but the named import must resolve.
        getCurrentCharacter: vi.fn(() => DBState.db.characters?.[0]),
        presetTemplate: { name: 'test-preset' },
    } as unknown as typeof import('src/ts/storage/database.svelte')
})

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
    isIOS: () => false,
    // AlertComp.svelte's script body calls these eagerly at mount
    // (`osLabel`/`risuEnvironment` initializers).
    getDetailedOSLabel: vi.fn(async () => 'test-os'),
    getFallbackOSLabel: vi.fn(() => 'test-os'),
    getRisuEnvironmentLabel: vi.fn((): RisuEnvironmentLabel => 'web'),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    remove: vi.fn(),
    readDir: vi.fn(async () => []),
    BaseDirectory: { AppData: 0 },
}))

// Thin, genuinely-reactive ($state-backed) stand-in for the app's whole
// store module -- same pattern and same reason as the harness's mock.
vi.mock(import('../../ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
        MobileGUIStack: writable([]),
        CharEmotion: writable(new Map()),
        OpenRealmStore: writable({ isOpen: false }),
        MobileSearch: writable(''),
        alertStore: writable({ type: 'none', msg: '' }),
        selIdState: { state: -1 },
        SettingsMenuIndex: writable(0),
        ShowRealmFrameStore: writable(false),
        settingsOpen: writable(false),
        // Sidebar.svelte's own direct needs, plus its statically-imported
        // (but not necessarily instantiated) children CharConfig.svelte,
        // SideChatList.svelte and QuickSettingsGUI.svelte -- ES imports are
        // eager, so their module bodies run at import time even when the
        // component they render behind a runtime `{#if}` is never mounted.
        botMakerMode: writable(false),
        DynamicGUI: writable(false),
        sideBarClosing: writable(false),
        sideBarStore: writable({ tab: 0 }),
        PlaygroundStore: writable({ open: false }),
        QuickSettings: writable([]),
        additionalHamburgerMenu: writable([]),
        CharConfigSubMenu: writable(0),
        MobileGUI: writable(false),
        hypaV3ModalOpen: writable(false),
        ReloadGUIPointer: writable(0),
        bookmarkListOpen: writable(false),
        // AlertComp.svelte's own direct need.
        alertGenerationInfoStore: writable(null),
    } as unknown as typeof import('../../ts/stores.svelte')
})

// Partial mock: everything real except `changeChar`, replaced with a bare
// spy (see header for why the real `changeChar` cannot run against the
// `database.svelte` mock above). `getCharImage` and everything else stays
// the genuine implementation.
vi.mock(import('../../ts/characters'), async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        changeChar: changeCharSpy,
    }
})

//#endregion

//#region AV-2 IntersectionObserver fake (see comment below)

/**
 * AV-2 (`Agents/Reports/14-av2-lazy-avatar-plan.md`, section 3.1) now gates
 * each avatar's resolution on `nearViewport`'s use of `IntersectionObserver`,
 * and happy-dom's own `IntersectionObserver` never invokes its callback at
 * all (`observe()` is a no-op there), so without a fake every avatar here
 * would stay permanently unresolved and every assertion below would read 0
 * lookups no matter what actually changed. Per the plan's v8 ("AV-1's tests
 * must still pass with the fake reporting all visible"), this fake reports
 * every observed target immediately, permanently visible -- the same
 * "everything resolves" behaviour these tests measured before AV-2 existed
 * -- so this file keeps measuring AV-1's per-change re-lookup behaviour, not
 * AV-2's visibility gating (that is `charlistAvatarLazy.svelte.test.ts`'s
 * job).
 *
 * SYNCHRONOUS, ON PURPOSE: `nearViewport.svelte.ts` (`use:nearViewport`'s
 * setup) reads nothing about *when* its `IntersectionObserver` callback
 * fires -- it only registers a per-target callback and calls `observe()`;
 * there is no code path anywhere in it, or in this file's `settle()` helper,
 * that depends on the callback arriving asynchronously. An EARLIER version
 * of this fake deferred its callback via `queueMicrotask`, matching the real
 * spec's always-async delivery -- but that extra hop raced `settle()`'s own
 * "stop once two consecutive checks agree" convergence loop: `settle()`
 * could observe two stable-looking ticks and return BEFORE the deferred
 * microtask had even run, letting that call land after the NEXT test's own
 * `getFileSrcSpy.mockClear()`, misattributing it (confirmed empirically: the
 * suite was measurably flaky with the deferred version, and merely adding
 * unrelated `console.log` calls -- extra synchronous work shifting
 * microtask timing -- was enough to flip failures to passes on an unchanged
 * assertion). Firing synchronously inside `observe()` removes that hop
 * entirely: `onChange(true)` runs in the same tick as the mount/update that
 * called `observe()`, exactly like AV-1's pre-AV-2 behaviour (avatars
 * started resolving synchronously at render time, no observer indirection
 * at all), which is precisely the behaviour these tests were written to
 * measure. Installed before any component ever mounts (module-level, not
 * inside a hook), per `nearViewport.svelte.ts`'s own test-seam doc comment.
 */
class AllVisibleIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null
    readonly rootMargin: string = ''
    readonly thresholds: ReadonlyArray<number> = []
    #callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
        this.#callback = callback
    }

    observe(target: Element): void {
        this.#callback([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this)
    }

    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
        return []
    }
}

vi.stubGlobal('IntersectionObserver', AllVisibleIntersectionObserver)

//#endregion

import { DBState, alertStore } from '../../ts/stores.svelte'
import { language } from '../../lang'
import GridCatalog from './GridCatalog.svelte'
import Sidebar from '../SideBars/Sidebar.svelte'
import AlertComp from './AlertComp.svelte'

//#region fixture helpers

type CharacterFixture = Database['characters'][number]

const NON_TRASHED = 60
const TRASHED = 5
// Every 10th non-trashed character (i % 10 === 0) carries a `~` marker --
// exactly 6 of 60, a precise and reproducible "~10% of the currently-shown
// list" narrowing target. Every name contains "Character", so a single 'C'
// keystroke matches every non-trashed character.
const MARKED_INDICES = [0, 10, 20, 30, 40, 50]

function buildDb(nonTrashed: number, trashed: number): Database {
    const characters: CharacterFixture[] = []
    for (let i = 0; i < nonTrashed; i++) {
        const marked = i % 10 === 0
        characters.push({
            chaId: `char-${i}`,
            name: `Character ${i}${marked ? '~' : ''}`,
            type: 'character',
            image: `assets/${i}.png`,
            creatorNotes: '',
            chatPage: 0,
            // Unique per character, so MobileCharacters's primary sort key
            // (interaction, descending) never ties -- renaming a character
            // never changes its sort position, regardless of the new name.
            lastInteraction: i,
            chats: [{ id: `char-${i}-chat-0`, message: [], note: '', name: '', localLore: [] }],
            trashTime: undefined,
        } as unknown as CharacterFixture)
    }
    for (let j = 0; j < trashed; j++) {
        characters.push({
            chaId: `trashed-${j}`,
            name: `Character Trash ${j}`,
            type: 'character',
            image: `assets/trashed-${j}.png`,
            creatorNotes: '',
            chatPage: 0,
            lastInteraction: 0,
            chats: [{ id: `trashed-${j}-chat-0`, message: [], note: '', name: '', localLore: [] }],
            trashTime: 1_700_000_000_000 + j,
        } as unknown as CharacterFixture)
    }
    return {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characterOrder: characters.map((c) => c.chaId),
        characters,
        hideAllImages: false,
    } as unknown as Database
}

const SIDEBAR_N = 25

/**
 * A separate, smaller, all-non-trashed fixture for Sidebar.svelte: the
 * sidebar's own `$effect` (`Sidebar.svelte:83-130`) walks
 * `DBState.db.characterOrder` directly (a flat list of plain `chaId`
 * strings here -- no folders), independent of `formatChars`/`sortChar`'s
 * trash filtering, so mixing in trashed characters would only complicate
 * the expected call count for no reason relevant to AV-1.
 */
function buildSidebarDb(n: number): Database {
    const characters: CharacterFixture[] = []
    for (let i = 0; i < n; i++) {
        characters.push({
            chaId: `sb-char-${i}`,
            name: `Sidebar Character ${i}`,
            type: 'character',
            image: `assets/sb-${i}.png`,
            creatorNotes: '',
            chatPage: 0,
            lastInteraction: i,
            chats: [{ id: `sb-char-${i}-chat-0`, message: [], note: '', name: '', localLore: [] }],
            trashTime: undefined,
        } as unknown as CharacterFixture)
    }
    return {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characterOrder: characters.map((c) => c.chaId),
        characters,
        hideAllImages: false,
    } as unknown as Database
}

function countAvatarEls(root: HTMLElement): number {
    return root.querySelectorAll('[style*="background: url("]').length
}

function avatarButtons(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll('button.ico'))
}

function resolvedAvatarButtons(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll('button.ico[style]'))
}

function clickLayoutButton(root: HTMLElement, layout: 0 | 1 | 2 | 3): void {
    const label =
        (layout === 0 ? language.grid : layout === 1 ? language.list : layout === 2 ? language.trash : language.simple).trim()
    const btn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)
    if (!btn) {
        throw new Error(`layout button not found for label "${label}"`)
    }
    btn.click()
}

function setSearchValue(root: HTMLElement, value: string): void {
    const input = root.querySelector('input[type="text"]') as HTMLInputElement | null
    if (!input) {
        throw new Error('search input not found')
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Repeatedly flushes the REAL Svelte runtime this component tree is
 * compiled against, then awaits a pair of microtask ticks, until neither
 * the getFileSrc call count nor the number of resolved-avatar DOM nodes
 * changes between two consecutive iterations. Bounded at 50 iterations as a
 * safety cap (same as the harness); never observed to need more than a
 * handful in practice since the mocked getFileSrc resolves in one
 * microtask.
 */
async function settle(root: HTMLElement): Promise<void> {
    let lastCalls = -1
    let lastAvatars = -1
    for (let i = 0; i < 50; i++) {
        flushSync()
        await Promise.resolve()
        await Promise.resolve()
        const calls = getFileSrcSpy.mock.calls.length
        const avatars = countAvatarEls(root)
        if (calls === lastCalls && avatars === lastAvatars) {
            break
        }
        lastCalls = calls
        lastAvatars = avatars
    }
    flushSync()
}

function mountGridCatalog(): { target: HTMLElement; app: Record<string, unknown> } {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(GridCatalog, { target, props: {} }) as unknown as Record<string, unknown>
    return { target, app }
}

function mountSidebar(): { target: HTMLElement; app: Record<string, unknown> } {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(Sidebar, { target, props: {} }) as unknown as Record<string, unknown>
    return { target, app }
}

function mountAlertComp(): { target: HTMLElement; app: Record<string, unknown> } {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(AlertComp, { target, props: {} }) as unknown as Record<string, unknown>
    return { target, app }
}

async function teardown(target: HTMLElement, app: Record<string, unknown>): Promise<void> {
    await unmount(app as never)
    target.remove()
}

//#endregion

describe.sequential('grid layout: avatar lookups (AV-1 regression, GridCatalog.svelte)', () => {
    let target: HTMLElement
    let app: Record<string, unknown>

    beforeAll(async () => {
        DBState.db = buildDb(NON_TRASHED, TRASHED)
        getFileSrcSpy.mockClear()
        // Generous effective timeout: this first mount in the file pays the
        // one-time ~13-17s Vite transform cost for characters.ts's whole
        // transitive import graph (see header / harness header for why that
        // is a one-time cost, not a per-test cost).
        const mounted = mountGridCatalog()
        target = mounted.target
        app = mounted.app
        await settle(target) // settle the default (simple) layout, uncounted
        getFileSrcSpy.mockClear()
        clickLayoutButton(target, 0)
        await settle(target)
        getFileSrcSpy.mockClear() // grid's own first render, uncounted by the tests below
    }, 120_000)

    afterAll(async () => {
        await teardown(target, app)
    })

    test('a search keystroke that still matches every character resolves no avatar again', async () => {
        setSearchValue(target, 'C')
        await settle(target)
        // Unfixed: formatChars builds fresh per-item objects on every call,
        // so every listed character's avatar re-resolves even though the
        // visible set is unchanged (observed: 60, i.e. NON_TRASHED).
        expect(getFileSrcSpy.mock.calls.length).toBe(0)
    })

    test('a search keystroke that narrows to ~10% resolves no avatar again', async () => {
        setSearchValue(target, '') // back to the full list, uncounted
        await settle(target)
        getFileSrcSpy.mockClear()
        setSearchValue(target, '~')
        await settle(target)
        // Unfixed: narrowing still rebuilds fresh objects for the
        // now-visible subset (observed: 6, i.e. MARKED_INDICES.length).
        expect(getFileSrcSpy.mock.calls.length).toBe(0)
        setSearchValue(target, '') // restore the full list for later tests
        await settle(target)
    })

    test("clicking a row after narrowing search calls changeChar with that row's own db.characters index (preserved behaviour, passes before and after)", async () => {
        setSearchValue(target, '~')
        await settle(target)
        const buttons = resolvedAvatarButtons(target)
        expect(buttons.length).toBe(MARKED_INDICES.length)
        changeCharSpy.mockClear()
        const k = 2 // third visible row -> original db.characters index 20
        buttons[k].click()
        flushSync()
        expect(changeCharSpy).toHaveBeenCalledWith(MARKED_INDICES[k])
        setSearchValue(target, '') // restore the full list for later tests
        await settle(target)
    })

    test("changing one character's avatar resolves exactly that character, with its new path", async () => {
        getFileSrcSpy.mockClear()
        const idx = 31
        const newPath = 'assets/mutated-grid.png'
        DBState.db.characters[idx].image = newPath
        await settle(target)
        // Unfixed: every listed character re-resolves (observed: 60), not
        // just the one that changed.
        expect(getFileSrcSpy.mock.calls.length).toBe(1)
        expect(getFileSrcSpy.mock.calls[0][0]).toBe(newPath)
    })

    test('toggling hideAllImages hides every avatar behind the placeholder, then re-resolves every avatar on the way back (preserved behaviour, passes before and after -- getCharImage reads hideAllImages as a genuine dependency, independent of the AV-1 equality boundary)', async () => {
        getFileSrcSpy.mockClear()
        DBState.db.hideAllImages = true
        await settle(target)
        expect(getFileSrcSpy.mock.calls.length).toBe(0)
        expect(countAvatarEls(target)).toBe(0)
        for (const btn of avatarButtons(target)) {
            // getCharImage returns '' for css type while hideAllImages is
            // true, so no button carries a background-url style.
            expect(btn.getAttribute('style') ?? '').not.toContain('background: url(')
        }

        getFileSrcSpy.mockClear()
        DBState.db.hideAllImages = false
        await settle(target)
        expect(getFileSrcSpy.mock.calls.length).toBe(NON_TRASHED)
        expect(countAvatarEls(target)).toBe(NON_TRASHED)
    })

    test('deleting an earlier character leaves every remaining tile showing its own avatar, not a stale one (preserved behaviour, passes before and after -- Svelte always passes the item at each position the correct, freshly-read image even in an unkeyed each; AV-1 re-keys for click/DOM-identity reasons, not to fix this)', async () => {
        const deleteAt = 3 // before most other non-trashed characters
        DBState.db.characters.splice(deleteAt, 1)
        await settle(target)
        const expectedImages = DBState.db.characters.filter((c) => !c.trashTime).map((c) => c.image)
        const buttons = resolvedAvatarButtons(target)
        expect(buttons.length).toBe(expectedImages.length)
        buttons.forEach((btn, i) => {
            expect(btn.getAttribute('style')).toContain(`loc=${expectedImages[i]}`)
        })
    })
})

describe.sequential('list layout: avatar lookups (AV-1 regression, GridCatalog.svelte)', () => {
    let target: HTMLElement
    let app: Record<string, unknown>

    beforeAll(async () => {
        DBState.db = buildDb(NON_TRASHED, TRASHED)
        getFileSrcSpy.mockClear()
        const mounted = mountGridCatalog()
        target = mounted.target
        app = mounted.app
        await settle(target)
        getFileSrcSpy.mockClear()
        clickLayoutButton(target, 1)
        await settle(target)
        getFileSrcSpy.mockClear() // list's own first render, uncounted by the tests below
    })

    afterAll(async () => {
        await teardown(target, app)
    })

    test('a search keystroke that still matches every character resolves no avatar again', async () => {
        setSearchValue(target, 'C')
        await settle(target)
        expect(getFileSrcSpy.mock.calls.length).toBe(0)
    })

    test('a search keystroke that narrows to ~10% resolves no avatar again', async () => {
        setSearchValue(target, '')
        await settle(target)
        getFileSrcSpy.mockClear()
        setSearchValue(target, '~')
        await settle(target)
        expect(getFileSrcSpy.mock.calls.length).toBe(0)
        setSearchValue(target, '')
        await settle(target)
    })

    test("clicking a row after narrowing search calls changeChar with that row's own db.characters index (preserved behaviour, passes before and after)", async () => {
        setSearchValue(target, '~')
        await settle(target)
        const buttons = resolvedAvatarButtons(target)
        expect(buttons.length).toBe(MARKED_INDICES.length)
        changeCharSpy.mockClear()
        const k = 4 // fifth visible row -> original db.characters index 40
        buttons[k].click()
        flushSync()
        expect(changeCharSpy).toHaveBeenCalledWith(MARKED_INDICES[k])
        setSearchValue(target, '')
        await settle(target)
    })

    test("changing one character's avatar resolves exactly that character, with its new path", async () => {
        getFileSrcSpy.mockClear()
        const idx = 32
        const newPath = 'assets/mutated-list.png'
        DBState.db.characters[idx].image = newPath
        await settle(target)
        expect(getFileSrcSpy.mock.calls.length).toBe(1)
        expect(getFileSrcSpy.mock.calls[0][0]).toBe(newPath)
    })

    test('deleting an earlier character leaves every remaining tile showing its own avatar, not a stale one (preserved behaviour, passes before and after)', async () => {
        const deleteAt = 4
        DBState.db.characters.splice(deleteAt, 1)
        await settle(target)
        const expectedImages = DBState.db.characters.filter((c) => !c.trashTime).map((c) => c.image)
        const buttons = resolvedAvatarButtons(target)
        expect(buttons.length).toBe(expectedImages.length)
        buttons.forEach((btn, i) => {
            expect(btn.getAttribute('style')).toContain(`loc=${expectedImages[i]}`)
        })
    })
})

describe.sequential('simple layout: avatar lookups (AV-1 regression, MobileCharacters.svelte)', () => {
    let target: HTMLElement
    let app: Record<string, unknown>

    beforeAll(async () => {
        DBState.db = buildDb(NON_TRASHED, TRASHED)
        getFileSrcSpy.mockClear()
        const mounted = mountGridCatalog() // GridCatalog defaults to selected=3 (simple)
        target = mounted.target
        app = mounted.app
        await settle(target)
    })

    afterAll(async () => {
        await teardown(target, app)
    })

    test('renaming one character resolves no avatar again (the rename does not move its row: sort is primarily by lastInteraction, which is unique per character in this fixture and untouched by a rename)', async () => {
        getFileSrcSpy.mockClear()
        const idx = 33
        DBState.db.characters[idx].name = 'Renamed Character Unique Name'
        await settle(target)
        // Unfixed: sortChar builds fresh per-item objects on every call, so
        // renaming any one character re-resolves every listed character
        // (observed: 60, i.e. NON_TRASHED).
        expect(getFileSrcSpy.mock.calls.length).toBe(0)
    })

    test("changing one character's avatar resolves exactly that character, with its new path", async () => {
        getFileSrcSpy.mockClear()
        const idx = 34
        const newPath = 'assets/mutated-simple.png'
        DBState.db.characters[idx].image = newPath
        await settle(target)
        expect(getFileSrcSpy.mock.calls.length).toBe(1)
        expect(getFileSrcSpy.mock.calls[0][0]).toBe(newPath)
    })
})

describe.sequential('Sidebar: avatar lookups (AV-1 regression, Sidebar.svelte)', () => {
    let target: HTMLElement
    let app: Record<string, unknown>

    beforeAll(async () => {
        DBState.db = buildSidebarDb(SIDEBAR_N)
        getFileSrcSpy.mockClear()
        const mounted = mountSidebar()
        target = mounted.target
        app = mounted.app
        await settle(target)
        getFileSrcSpy.mockClear() // initial mount, uncounted by the tests below
    })

    afterAll(async () => {
        await teardown(target, app)
    })

    test('renaming one character resolves no avatar again', async () => {
        getFileSrcSpy.mockClear()
        DBState.db.characters[10].name = 'Renamed Sidebar Character'
        await settle(target)
        // Unfixed: Sidebar's own `$effect` rebuilds `newCharImages` with
        // fresh per-item objects whenever any name changes, and
        // `isEqual(charImages, newCharImages)` is false (the name differs),
        // so the whole `charImages` array is reassigned and every listed
        // character's avatar re-resolves (observed: 25, i.e. SIDEBAR_N).
        expect(getFileSrcSpy.mock.calls.length).toBe(0)
    })

    test("changing one character's avatar resolves exactly that character, with its new path", async () => {
        getFileSrcSpy.mockClear()
        const newPath = 'assets/mutated-sidebar.png'
        DBState.db.characters[12].image = newPath
        await settle(target)
        // Unfixed: same mechanism as the rename case above (observed: 25).
        expect(getFileSrcSpy.mock.calls.length).toBe(1)
        expect(getFileSrcSpy.mock.calls[0][0]).toBe(newPath)
    })
})

describe('AlertComp selectChar dialog: avatar lookups (observation only, per plan 2.2 -- "change it only if it churns")', () => {
    test('renaming one character while the selectChar dialog is open -- OBSERVATION, not a red/green regression assertion', async () => {
        DBState.db = buildSidebarDb(SIDEBAR_N)
        alertStore.set({ type: 'selectChar', msg: '' } as never)
        getFileSrcSpy.mockClear()
        const { target, app } = mountAlertComp()
        await settle(target)
        getFileSrcSpy.mockClear() // initial mount, uncounted

        DBState.db.characters[10].name = 'Renamed Sidebar Character'
        await settle(target)

        // AlertComp's selectChar branch (`AlertComp.svelte:385-388`) iterates
        // `DBState.db.characters` directly -- the live database proxies,
        // whose identity is stable across a rename, unlike formatChars/
        // sortChar/Sidebar's own freshly-built per-item objects. Observed on
        // this run: 0 lookups on rename, i.e. no churn. Per the plan
        // (section 2.2), AlertComp is changed only if it churns; this
        // component does not, so no source change is proposed for it here.
        expect(getFileSrcSpy.mock.calls.length).toBe(0)

        await teardown(target, app)
        alertStore.set({ type: 'none', msg: '' } as never)
    })
})
