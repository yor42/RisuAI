// @vitest-environment happy-dom

/**
 * Red-before-green tests for plan AV-2 (`Agents/Reports/14-av2-lazy-avatar-plan.md`,
 * sections 3 and 5/5.1): avatars should resolve only near the viewport, using a
 * shared, injectable `IntersectionObserver`, instead of every listed avatar
 * resolving unconditionally at mount (AV-1's fixed behaviour, `64777a34`).
 *
 * NEW FILE vs. EXTENDING `charlistAvatarLookups.svelte.test.ts` (AV-1's file):
 * this file COPIES that file's mock setup and fixture-building helpers rather
 * than extending it in place, because:
 *   (a) the instructions for this task say to put v1-v10 in a new file, and
 *   (b) this file needs one more piece of global test infrastructure the AV-1
 *       file has no reason to carry -- a controllable fake
 *       `globalThis.IntersectionObserver` (installed for the whole file) and an
 *       injected `<style>` stylesheet (see below) -- keeping that out of the
 *       AV-1 regression file keeps that file's mocks exactly as narrow as its
 *       own header already documents.
 * Copying is the smaller, safer diff: the AV-1 file is a passing regression
 * suite for a different, already-shipped stage, and it must keep passing
 * unmodified (v8 in the plan's table is exactly "AV-1's 16 still pass",
 * verified by running that file, not by importing anything from it here).
 *
 * MOCKED, same reasons as `charlistAvatarLookups.svelte.test.ts`'s header
 * (`localforage`, `src/ts/globalApi.svelte`'s `getFileSrc` as a counting spy,
 * `src/ts/storage/database.svelte`'s `getDatabase`, `src/ts/platform` forced to
 * the plain-HTTP branch, `@tauri-apps/plugin-fs`, a reactive `stores.svelte`
 * stand-in, and a partial `src/ts/characters` mock with only `changeChar`
 * replaced). `getCharImage` is real. See that file for the full rationale;
 * it is not repeated line-by-line here.
 *
 * THE FAKE INTERSECTION OBSERVER (plan section 3.1 "test seam"): AV-2's design
 * reads `globalThis.IntersectionObserver` at use time, specifically so tests can
 * `vi.stubGlobal` a controllable fake and fire hand-built entries -- no
 * source-text guards, and this file never imports the not-yet-existing
 * `src/ts/gui/nearViewport.svelte.ts`. `FakeIntersectionObserver` below records
 * every constructed instance (with its `root`/`rootMargin` options), every
 * target it is asked to `observe`, and whether `disconnect` was called. Tests
 * drive it only through `fire(...)`, which mirrors a real observer: it only
 * reports the subset of a given batch of entries that instance itself is
 * observing.
 *
 * COMPUTED-STYLE SEAM (per the Orchestrator's note on this task): the plan's
 * root-selection rule (section 3.1) is "the nearest ancestor whose COMPUTED
 * overflow-y is auto or scroll". The app expresses that only via the Tailwind
 * utility classes `overflow-y-auto` (and, elsewhere in the app,
 * `overflow-y-scroll`), and no Tailwind CSS is loaded in happy-dom, so without
 * help `getComputedStyle` would report `visible` for every element and every
 * root would fall back to `null` -- v5 would then pass trivially and prove
 * nothing. This file injects a plain `<style>` element mapping those two
 * classes to the real CSS property before any component mounts, and the very
 * first test below is a one-off sanity check, run against a throwaway element,
 * that happy-dom's `getComputedStyle` actually honours it. That check was run
 * standalone first (outside this suite) and passed; it stays in the suite as a
 * live guard, so if a happy-dom upgrade ever stops honouring stylesheet rules,
 * v5 fails for an obvious, diagnosable reason instead of silently passing for
 * the wrong one.
 *
 * RED BEFORE GREEN, AND WHY EACH ONE FAILS TODAY: every assertion below is
 * written against the AFTER state in the plan's section 5 table. Two distinct
 * "today" failure modes show up, and each test's own comment says which one
 * applies:
 *   - Most v1/v2/v6/v10 assertions fail because today EVERY avatar resolves
 *     unconditionally at mount, with no visibility gating of any kind -- the
 *     bug this stage fixes.
 *   - v3, v5 and v9 fail for a shallower reason, stated honestly in each test:
 *     today NOTHING ever constructs `new IntersectionObserver(...)` at all, so
 *     `FakeIntersectionObserver.instances` stays empty throughout. Each of
 *     those tests asserts, as an explicit precondition, that at least one
 *     instance (of the right band) exists; that precondition itself is what
 *     fails today. This is acceptable per the task brief, but it means these
 *     three are weaker regression proof than v1/v2/v6/v10 until the feature
 *     exists: a test harness bug that made the fake wholly inert would produce
 *     the same failure. v4 and v7 are CHAR (already true today, must keep
 *     being true after).
 *
 * N is kept deliberately small everywhere (max 8 characters per fixture),
 * following AV-1 test's own OOM caution (a fresh N=1000 mount caused a heap
 * OOM in the harness this pattern is based on).
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Database } from '../../ts/storage/database.svelte'
import type { RisuEnvironmentLabel } from '../../ts/platform'

//#region module mocks (copied from charlistAvatarLookups.svelte.test.ts -- see header)

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

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
            getFetchLogs: vi.fn(() => []),
            getFetchData: vi.fn(() => ({})),
            aiLawApplies: vi.fn(() => false),
        }) as unknown as typeof import('src/ts/globalApi.svelte'),
)

vi.mock(import('src/ts/storage/database.svelte'), async () => {
    const { DBState } = await import('../../ts/stores.svelte')
    return {
        getDatabase: vi.fn((options?: { snapshot?: boolean }) => DBState.db),
        getCurrentCharacter: vi.fn(() => DBState.db.characters?.[0]),
        presetTemplate: { name: 'test-preset' },
    } as unknown as typeof import('src/ts/storage/database.svelte')
})

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
    isIOS: () => false,
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
        alertGenerationInfoStore: writable(null),
    } as unknown as typeof import('../../ts/stores.svelte')
})

vi.mock(import('../../ts/characters'), async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        changeChar: changeCharSpy,
    }
})

//#endregion

import { DBState, alertStore } from '../../ts/stores.svelte'
import { language } from '../../lang'
import GridCatalog from './GridCatalog.svelte'
import Sidebar from '../SideBars/Sidebar.svelte'
import AlertComp from './AlertComp.svelte'

//#region fake IntersectionObserver (plan section 3.1 "test seam")

type FakeEntry = { target: Element; isIntersecting: boolean }

class FakeIntersectionObserver implements Pick<IntersectionObserver, 'observe' | 'unobserve' | 'disconnect' | 'takeRecords'> {
    static instances: FakeIntersectionObserver[] = []

    readonly root: Element | Document | null
    readonly rootMargin: string
    readonly thresholds: ReadonlyArray<number>
    readonly callback: IntersectionObserverCallback
    readonly observed = new Set<Element>()
    disconnected = false

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.callback = callback
        this.root = (options?.root as Element | Document | null) ?? null
        this.rootMargin = options?.rootMargin ?? '0px'
        const t = options?.threshold
        this.thresholds = t === undefined ? [0] : Array.isArray(t) ? t : [t]
        FakeIntersectionObserver.instances.push(this)
    }

    observe(target: Element): void {
        this.observed.add(target)
    }

    unobserve(target: Element): void {
        this.observed.delete(target)
    }

    disconnect(): void {
        this.disconnected = true
        this.observed.clear()
    }

    takeRecords(): IntersectionObserverEntry[] {
        return []
    }

    /**
     * Fires only the subset of `entries` this particular instance is actually
     * observing -- mirroring a real IntersectionObserver, whose callback only
     * ever reports its own targets, never another observer's.
     */
    fire(entries: FakeEntry[]): void {
        const observing = entries.filter((e) => this.observed.has(e.target))
        if (observing.length === 0) {
            return
        }
        const records = observing.map(
            (e) =>
                ({
                    target: e.target,
                    isIntersecting: e.isIntersecting,
                    intersectionRatio: e.isIntersecting ? 1 : 0,
                    boundingClientRect: {} as DOMRectReadOnly,
                    intersectionRect: {} as DOMRectReadOnly,
                    rootBounds: null,
                    time: 0,
                }) as IntersectionObserverEntry,
        )
        this.callback(records, this as unknown as IntersectionObserver)
    }
}

/**
 * v11's fake (plan post-gate defect 1): a constructor that always throws,
 * simulating a broken/unsupported `IntersectionObserver` implementation.
 * `nearViewport.svelte.ts`'s `new IO(...)` call (~:111) has no try/catch
 * around it, so this exercises whatever actually happens today -- there is
 * no documented "caught and treated as fail-open" behaviour to assert
 * against a mock; the fake's job here is only to make the constructor throw.
 */
class ThrowingIntersectionObserver {
    constructor() {
        throw new Error('v11 fake: IntersectionObserver constructor always throws')
    }
}

const NEAR_MARGIN = '100% 0px'
const FAR_MARGIN = '300% 0px'

/**
 * v11c's fake (AV-2 re-gate coverage gap): a constructor that HALF-succeeds --
 * it returns a working instance for the near band (`rootMargin: '100% 0px'`)
 * and only throws for the far band (`rootMargin: '300% 0px'`). `v11`'s own
 * fake above ALWAYS throws, so it only ever exercises `nearViewport.svelte.ts`'s
 * FIRST construction (`getOrCreateEntry(root, NEAR_MARGIN, IO)`, ~:258)
 * throwing; it never reaches the SECOND construction
 * (`getOrCreateEntry(root, FAR_MARGIN, IO)`, ~:259) at all, so a real bug
 * where the first construction succeeds -- one live observer already
 * created and registered -- and only the SECOND one throws was never
 * actually exercised.
 *
 * Which band is made to throw is deliberate, not arbitrary: reading
 * `nearViewport.svelte.ts`'s `nearViewport` function confirms it constructs
 * the near entry FIRST and the far entry SECOND (in that literal order,
 * ~:258-259), so making the FAR band the one that throws here puts the
 * throw on the SECOND construction in the real call order -- exactly the
 * half-succeeded state this test needs. Had that source instead constructed
 * far before near, this fake's throwing band would need to flip to near, to
 * keep the throw on the second one actually attempted.
 */
class HalfThrowingIntersectionObserver implements Pick<IntersectionObserver, 'observe' | 'unobserve' | 'disconnect' | 'takeRecords'> {
    static nearInstances: HalfThrowingIntersectionObserver[] = []

    readonly rootMargin: string
    readonly observed = new Set<Element>()
    disconnected = false

    constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.rootMargin = options?.rootMargin ?? '0px'
        if (this.rootMargin === FAR_MARGIN) {
            throw new Error('v11c fake: IntersectionObserver constructor throws for the far band only')
        }
        HalfThrowingIntersectionObserver.nearInstances.push(this)
    }

    observe(target: Element): void {
        this.observed.add(target)
    }

    unobserve(target: Element): void {
        this.observed.delete(target)
    }

    disconnect(): void {
        this.disconnected = true
        this.observed.clear()
    }

    takeRecords(): IntersectionObserverEntry[] {
        return []
    }
}

function instancesByMargin(margin: string): FakeIntersectionObserver[] {
    return FakeIntersectionObserver.instances.filter((i) => i.rootMargin === margin)
}

/**
 * Every target any of `instances` is observing, deduplicated and sorted into
 * DOM (document) order -- so "the first k" and "item j" can be identified
 * purely from what the fake itself recorded, never from assumptions about
 * which element the not-yet-written implementation chooses as its target.
 */
function orderedTargets(instances: FakeIntersectionObserver[]): Element[] {
    const set = new Set<Element>()
    for (const inst of instances) {
        for (const el of inst.observed) {
            set.add(el)
        }
    }
    return Array.from(set).sort((a, b) => {
        const pos = a.compareDocumentPosition(b)
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return 0
    })
}

function fireOn(instances: FakeIntersectionObserver[], entries: FakeEntry[]): void {
    for (const inst of instances) {
        inst.fire(entries)
    }
}

//#endregion

//#region computed-overflow stylesheet (see header's "COMPUTED-STYLE SEAM")

function injectOverflowStylesheet(): void {
    if (document.getElementById('av2-test-overflow-styles')) {
        return
    }
    const style = document.createElement('style')
    style.id = 'av2-test-overflow-styles'
    style.textContent = '.overflow-y-auto{overflow-y:auto} .overflow-y-scroll{overflow-y:scroll}'
    document.head.appendChild(style)
}
injectOverflowStylesheet()

//#endregion

//#region fixture helpers (same shapes as charlistAvatarLookups.svelte.test.ts, smaller N)

type CharacterFixture = Database['characters'][number]

const V_N = 8
const V_TRASHED = 3
const V_K = 3

function buildDb(nonTrashed: number, trashed: number): Database {
    const characters: CharacterFixture[] = []
    for (let i = 0; i < nonTrashed; i++) {
        characters.push({
            chaId: `char-${i}`,
            name: `Character ${i}`,
            type: 'character',
            image: `assets/${i}.png`,
            creatorNotes: '',
            chatPage: 0,
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

/**
 * v12's Sidebar fixture: `topN` top-level normal characters plus one folder
 * (`folder-1`) holding `folderN` members. Mirrors `buildSidebarDb` in every
 * other respect.
 */
function buildSidebarFolderDb(topN: number, folderN: number): Database {
    const topChars: CharacterFixture[] = []
    for (let i = 0; i < topN; i++) {
        topChars.push({
            chaId: `sb-top-${i}`,
            name: `Sidebar Top ${i}`,
            type: 'character',
            image: `assets/sb-top-${i}.png`,
            creatorNotes: '',
            chatPage: 0,
            lastInteraction: i,
            chats: [{ id: `sb-top-${i}-chat-0`, message: [], note: '', name: '', localLore: [] }],
            trashTime: undefined,
        } as unknown as CharacterFixture)
    }
    const memberChars: CharacterFixture[] = []
    for (let j = 0; j < folderN; j++) {
        memberChars.push({
            chaId: `sb-mem-${j}`,
            name: `Sidebar Member ${j}`,
            type: 'character',
            image: `assets/sb-mem-${j}.png`,
            creatorNotes: '',
            chatPage: 0,
            lastInteraction: j,
            chats: [{ id: `sb-mem-${j}-chat-0`, message: [], note: '', name: '', localLore: [] }],
            trashTime: undefined,
        } as unknown as CharacterFixture)
    }
    const characters = [...topChars, ...memberChars]
    const folderOrder = {
        id: 'folder-1',
        name: 'Folder 1',
        color: '',
        data: memberChars.map((c) => c.chaId),
    }
    return {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characterOrder: [...topChars.map((c) => c.chaId), folderOrder],
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

/** Same bounded settle loop as charlistAvatarLookups.svelte.test.ts (see that file's header for why). */
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

beforeAll(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterAll(() => {
    vi.unstubAllGlobals()
})

beforeEach(() => {
    FakeIntersectionObserver.instances.length = 0
})

describe('test-infrastructure sanity check (not one of v1-v10)', () => {
    test('happy-dom getComputedStyle honours the injected overflow-y stylesheet rule', () => {
        const div = document.createElement('div')
        div.className = 'overflow-y-auto'
        document.body.appendChild(div)
        try {
            expect(getComputedStyle(div).overflowY).toBe('auto')
        } finally {
            div.remove()
        }
    })
})

describe('v1: only the fake-reported-intersecting items resolve, per layout', () => {
    test('RED: grid layout (GridCatalog.svelte, selected=0)', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 0)
        await settle(target)
        getFileSrcSpy.mockClear() // initial mount + layout switch, uncounted

        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)

        // RED: today every avatar resolves unconditionally at mount, with no
        // gating on intersection at all -- so by the time we clear the spy and
        // fire "only the first k are intersecting", every avatar has ALREADY
        // resolved, the fired entries are inert (nothing left to trigger), and
        // this observes 0 new calls, not V_K (3).
        expect(getFileSrcSpy.mock.calls.length).toBe(V_K)

        await teardown(target, app)
    })

    test('RED: list layout (GridCatalog.svelte, selected=1)', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 1)
        await settle(target)
        getFileSrcSpy.mockClear()

        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)

        // RED: same reason as the grid case above -- 0 new calls, not V_K (3).
        expect(getFileSrcSpy.mock.calls.length).toBe(V_K)

        await teardown(target, app)
    })

    test('RED: trash layout (GridCatalog.svelte, selected=2)', async () => {
        const k = Math.min(V_K, V_TRASHED)
        DBState.db = buildDb(V_N, V_TRASHED)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 2)
        await settle(target)
        getFileSrcSpy.mockClear()

        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.slice(0, k).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)

        // RED: today every trashed avatar shown in this tab also resolves
        // unconditionally before we ever fire anything, so this observes 0 new
        // calls, not k (2).
        expect(getFileSrcSpy.mock.calls.length).toBe(k)

        await teardown(target, app)
    })

    test('RED: simple layout (MobileCharacters.svelte, GridCatalog default selected=3)', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog() // defaults to selected=3 (simple)
        await settle(target)
        getFileSrcSpy.mockClear()

        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)

        // RED: same reason as the grid case above -- 0 new calls, not V_K (3).
        expect(getFileSrcSpy.mock.calls.length).toBe(V_K)

        await teardown(target, app)
    })

    test('RED: Sidebar (Sidebar.svelte)', async () => {
        DBState.db = buildSidebarDb(V_N)
        getFileSrcSpy.mockClear()
        const { target, app } = mountSidebar()
        await settle(target)
        getFileSrcSpy.mockClear()

        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)

        // RED: same reason as the grid case above -- Sidebar's own
        // `{@const avatarSrc = ... getCharImage(imgPath, "plain") ...}`
        // (Sidebar.svelte:594, :606, :732) resolves every listed character's
        // avatar unconditionally today, with no visibility gating -- 0 new
        // calls, not V_K (3).
        expect(getFileSrcSpy.mock.calls.length).toBe(V_K)

        await teardown(target, app)
    })

    test('RED: AlertComp selectChar dialog (AlertComp.svelte:385-388)', async () => {
        DBState.db = buildSidebarDb(V_N)
        alertStore.set({ type: 'selectChar', msg: '' } as never)
        getFileSrcSpy.mockClear()
        const { target, app } = mountAlertComp()
        await settle(target)
        getFileSrcSpy.mockClear()

        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)

        // RED: same reason as the grid case above -- this is the "adjacent O(N)
        // site" the plan folds into AV-2 (section 1, "Adjacent O(N) site").
        // 0 new calls, not V_K (3).
        expect(getFileSrcSpy.mock.calls.length).toBe(V_K)

        await teardown(target, app)
        alertStore.set({ type: 'none', msg: '' } as never)
    })
})

describe('v2: firing a single intersecting entry for item j resolves only j', () => {
    test('RED: grid layout -- item j renders its own loc= path', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 0)
        await settle(target)

        // RED: today nothing is gated on visibility, so every item is already
        // resolved right after mount -- there is nothing left "not yet visible"
        // to single out with a fired entry.
        expect(resolvedAvatarButtons(target).length).toBe(0)

        const j = 2
        const itemTarget = orderedTargets(instancesByMargin(NEAR_MARGIN))[j]
        if (itemTarget) {
            fireOn(instancesByMargin(NEAR_MARGIN), [{ target: itemTarget, isIntersecting: true }])
            await settle(target)
        }

        const resolved = resolvedAvatarButtons(target)
        expect(resolved.length).toBe(1)
        expect(resolved[0].getAttribute('style')).toContain(`loc=${DBState.db.characters[j].image}`)

        await teardown(target, app)
    })

    test('RED: Sidebar -- item j renders its loc= path as the <img> src', async () => {
        DBState.db = buildSidebarDb(V_N)
        getFileSrcSpy.mockClear()
        const { target, app } = mountSidebar()
        await settle(target)

        // RED: same reason as the grid case above.
        expect(target.querySelectorAll('img.sidebar-avatar').length).toBe(0)

        const j = 3
        const itemTarget = orderedTargets(instancesByMargin(NEAR_MARGIN))[j]
        if (itemTarget) {
            fireOn(instancesByMargin(NEAR_MARGIN), [{ target: itemTarget, isIntersecting: true }])
            await settle(target)
        }

        const imgs = Array.from(target.querySelectorAll('img.sidebar-avatar')) as HTMLImageElement[]
        expect(imgs.length).toBe(1)
        expect(imgs[0].getAttribute('src')).toBe(`data:mock-image;loc=${DBState.db.characters[j].image}`)

        await teardown(target, app)
    })
})

describe('v3: release -- leaving the far band shows the placeholder again; re-entry resolves again', () => {
    test('RED (new): grid layout, near band (100% 0px) resolves, far band (300% 0px) releases', async () => {
        DBState.db = buildDb(5, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 0)
        await settle(target)

        const j = 1
        const itemTarget = orderedTargets(FakeIntersectionObserver.instances)[j]

        if (itemTarget) {
            fireOn(instancesByMargin(NEAR_MARGIN), [{ target: itemTarget, isIntersecting: true }])
            await settle(target)
        }
        // Holds today too (everything is already resolved at mount, near-band
        // firing or not), so this line alone would not be RED.
        expect(avatarButtons(target)[j].getAttribute('style') ?? '').toContain('background: url(')

        if (itemTarget) {
            fireOn(instancesByMargin(FAR_MARGIN), [{ target: itemTarget, isIntersecting: false }])
            await settle(target)
        }
        // RED (new): today there is no far-band ('300% 0px') observer at all --
        // FakeIntersectionObserver.instances never contains one, because nothing
        // in the source calls `new IntersectionObserver(...)` yet. So `itemTarget`
        // is `undefined`, nothing is fired, and the avatar -- already resolved
        // since mount -- never returns to the placeholder. This fails simply
        // because the release feature does not exist yet, not because a real
        // release picked the wrong band.
        expect(avatarButtons(target)[j].getAttribute('style') ?? '').not.toContain('background: url(')

        const callsBeforeReentry = getFileSrcSpy.mock.calls.length
        if (itemTarget) {
            fireOn(instancesByMargin(NEAR_MARGIN), [{ target: itemTarget, isIntersecting: true }])
            await settle(target)
        }
        expect(avatarButtons(target)[j].getAttribute('style') ?? '').toContain('background: url(')
        // Re-entry re-runs the base64 encode on plain HTTP (plan section 3.3):
        // no string cache survives a release, so getFileSrc is called again.
        expect(getFileSrcSpy.mock.calls.length).toBeGreaterThan(callsBeforeReentry)

        await teardown(target, app)
    })
})

describe('v4: no IntersectionObserver global means every avatar still resolves (fail open)', () => {
    test('CHAR: grid layout resolves all N with the global absent', async () => {
        vi.stubGlobal('IntersectionObserver', undefined)
        try {
            DBState.db = buildDb(V_N, 0)
            getFileSrcSpy.mockClear()
            const { target, app } = mountGridCatalog()
            await settle(target) // default (simple) layout's own resolution, uncounted
            getFileSrcSpy.mockClear()
            clickLayoutButton(target, 0)
            await settle(target)

            expect(resolvedAvatarButtons(target).length).toBe(V_N)
            expect(getFileSrcSpy.mock.calls.length).toBe(V_N)

            await teardown(target, app)
        } finally {
            vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
        }
    })
})

describe('v5 (new): nested MobileCharacters-inside-GridCatalog root selection', () => {
    test('RED (new): the chosen root for MobileCharacters items is its own overflow-y-auto container, not GridCatalog\'s outer one', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog() // defaults to selected=3 (simple, nested)
        await settle(target)

        const scrollBoxes = Array.from(target.querySelectorAll('.overflow-y-auto')) as HTMLElement[]
        // GridCatalog's own outer scroll box (GridCatalog.svelte:57) is the first
        // in document order; MobileCharacters' own nested one (:73) is the second.
        expect(scrollBoxes.length).toBeGreaterThanOrEqual(2)
        const gridOuter = scrollBoxes[0]
        const mobileCharsRoot = scrollBoxes[1]
        expect(gridOuter).not.toBe(mobileCharsRoot)
        expect(gridOuter.contains(mobileCharsRoot)).toBe(true)

        const nearInNested = instancesByMargin(NEAR_MARGIN).filter((inst) =>
            Array.from(inst.observed).some((el) => mobileCharsRoot.contains(el)),
        )
        // RED (new): today nothing ever calls `new IntersectionObserver(...)`, so
        // there is no near-band instance at all for MobileCharacters' items. This
        // fails simply because the feature does not exist yet, not because a real
        // root-selection picked the wrong element.
        expect(nearInNested.length).toBeGreaterThan(0)
        for (const inst of nearInNested) {
            // The specific expected root: MobileCharacters' own container, not
            // "some ancestor" and not GridCatalog's outer one.
            expect(inst.root).toBe(mobileCharsRoot)
        }

        await teardown(target, app)
    })
})

describe('v6: hideAllImages toggled while items are off-screen', () => {
    test('RED/CHAR: becoming visible while hideAllImages is true shows the placeholder; toggling back resolves with the fresh value', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 0)
        await settle(target)

        // RED: today there is no off-screen state at all -- everything already
        // resolved at mount, so there is nothing left "not yet visible" for
        // hideAllImages to interact with.
        expect(resolvedAvatarButtons(target).length).toBe(0)

        DBState.db.hideAllImages = true
        await settle(target)

        const j = 0
        const itemTarget = orderedTargets(instancesByMargin(NEAR_MARGIN))[j]
        if (itemTarget) {
            fireOn(instancesByMargin(NEAR_MARGIN), [{ target: itemTarget, isIntersecting: true }])
            await settle(target)
        }
        // CHAR (preserved behaviour): getCharImage returns '' for css type while
        // hideAllImages is true, regardless of visibility, so a newly-visible item
        // still shows no background-url style.
        expect(avatarButtons(target)[j].getAttribute('style') ?? '').not.toContain('background: url(')

        DBState.db.hideAllImages = false
        await settle(target)
        expect(avatarButtons(target)[j].getAttribute('style') ?? '').toContain('background: url(')
        expect(getFileSrcSpy.mock.calls.some((c) => c[0] === DBState.db.characters[j].image)).toBe(true)

        await teardown(target, app)
    })
})

describe('v7: Sidebar data-char-id and DOM order', () => {
    test('CHAR: every item carries data-char-id, in characterOrder\'s order, independent of resolution', async () => {
        DBState.db = buildSidebarDb(V_N)
        getFileSrcSpy.mockClear()
        const { target, app } = mountSidebar()
        await settle(target)

        const idEls = Array.from(target.querySelectorAll('[data-char-id]'))
        expect(idEls.length).toBe(V_N)
        idEls.forEach((el, i) => {
            expect(el.getAttribute('data-char-id')).toBe(DBState.db.characters[i].chaId)
        })

        await teardown(target, app)
    })
})

describe('v9 (new): observer registry lifecycle across repeated mount/unmount and dialog open/close', () => {
    test('RED (new): every observer created across three grid mounts and three selectChar opens gets disconnect, holding no targets afterward', async () => {
        for (let i = 0; i < 3; i++) {
            DBState.db = buildDb(4, 0)
            const { target, app } = mountGridCatalog()
            await settle(target)
            await teardown(target, app)
        }

        DBState.db = buildSidebarDb(4)
        const { target: alertTarget, app: alertApp } = mountAlertComp()
        await settle(alertTarget)
        for (let i = 0; i < 3; i++) {
            alertStore.set({ type: 'selectChar', msg: '' } as never)
            await settle(alertTarget)
            alertStore.set({ type: 'none', msg: '' } as never)
            await settle(alertTarget)
        }
        await teardown(alertTarget, alertApp)

        // RED (new): today nothing ever calls `new IntersectionObserver(...)`, so
        // `FakeIntersectionObserver.instances` is empty here. This fails simply
        // because the feature (and its registry) does not exist yet, not because
        // of a disconnect/leak bug in a real registry. Tested through the fake's
        // own records, since the real registry (a WeakMap, per the plan) is
        // private and cannot be imported or inspected directly.
        expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(0)

        for (const inst of FakeIntersectionObserver.instances) {
            expect(inst.disconnected).toBe(true)
            expect(inst.observed.size).toBe(0)
        }
    })
})

describe('v10: not-yet-visible Sidebar items render the no-src placeholder', () => {
    test('CHAR/RED: sized and classed like the resolved state, without having started the async lookup', async () => {
        DBState.db = buildSidebarDb(V_N)
        getFileSrcSpy.mockClear()
        const { target, app } = mountSidebar()
        await settle(target)

        // CHAR: SidebarAvatar's pending-await placeholder and its no-src placeholder
        // (SidebarAvatar.svelte ~:92-98 and ~:111-119) share the same size and
        // classes as the eventually-resolved <img> -- this holds regardless of
        // which of the two placeholder branches is live, so it is true today.
        const placeholder = target.querySelector('[data-char-id] .sidebar-avatar') as HTMLElement | null
        expect(placeholder).toBeTruthy()
        expect(placeholder!.style.width).toBe('56px')
        expect(placeholder!.style.height).toBe('56px')
        expect(placeholder!.classList.contains('sidebar-avatar')).toBe(true)
        expect(placeholder!.classList.contains('rounded-md')).toBe(true)

        // RED: today Sidebar's own `{@const avatarSrc = imgPath ? getCharImage(imgPath, "plain") : ...}`
        // (Sidebar.svelte:594, also :606 and :732 for folder items) calls
        // getCharImage() for every item unconditionally at mount, so the async
        // lookup for item 0 has already started (and, against this mock,
        // already resolved) well before any intersection entry could be fired
        // -- there is no "not-yet-visible, lookup-not-yet-started" state to
        // observe. A fixed AV-2 defers the lookup itself (not just the DOM it
        // feeds), landing in SidebarAvatar's literal no-src branch (`src`
        // itself undefined) rather than its pending-await branch.
        expect(getFileSrcSpy.mock.calls.some((c) => c[0] === DBState.db.characters[0].image)).toBe(false)

        await teardown(target, app)
    })
})

//#region v11/v12: AV-2 post-implementation-gate defects (plan section 5's
// table is already green; `nearViewport.svelte.ts` and its four call sites
// already exist, per `Agents/Reports/14-av2-lazy-avatar-plan.md`). These two
// defects were found in AV-2's post-gate, not in the plan's own table.
//#endregion

describe('v11: a throwing IntersectionObserver constructor must fail open', () => {
    // Today: `nearViewport.svelte.ts`'s `new IO(...)` call (~:111) has no
    // try/catch. `nearViewport(node, options)` itself calls `getOrCreateEntry`
    // (which does `new IO(...)`) synchronously, inline in the action's setup --
    // i.e. inline in the effect Svelte runs to mount that `{#each}` item. There
    // is no error boundary anywhere in `GridCatalog`/`MobileCharacters`/
    // `Sidebar`/`AlertComp`, so whatever Svelte does with an uncaught error
    // thrown from inside a template effect is exactly what these tests
    // observe -- not a documented, already-correct "caught and treated as
    // fail-open" behaviour.

    // Both tests below obtain a valid, already-mounted `app` handle BEFORE the
    // throwing fake ever runs (an empty character list, or Sidebar's
    // `menuSideBar` gate, means the initial mount drives zero `nearViewport`
    // calls). Only a SUBSEQUENT, later reactive update introduces the items
    // whose `use:nearViewport` first calls the throwing constructor -- this is
    // deliberate, not just a way to get a handle: it is the reviewer's exact
    // "action throwing during a LATER reactive mount" scenario, not the
    // initial one. It also means `app` is always valid for cleanup in
    // `finally`, regardless of whether the reactive update throws -- an
    // uncaught error from a `use:` action escapes Svelte's own root boundary
    // uncleaned (confirmed below; see also this suite's own header run log),
    // and without this guaranteed cleanup, the earlier version of these two
    // tests left a still-reactive, half-mounted component behind that kept
    // reacting to later tests' `DBState.db` reassignments and corrupted
    // unrelated v12 tests' `orderedTargets(...)` counts (observed directly:
    // v12a's own precondition, itself unchanged from v1's passing pattern,
    // failed with 0 instead of 3 only when run after these two -- and passed
    // when run alone).

    test('RED: grid layout still resolves every avatar when the constructor throws on a later, reactive mount', async () => {
        DBState.db = buildDb(0, 0) // no characters yet: initial mount drives zero nearViewport calls
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        vi.stubGlobal('IntersectionObserver', ThrowingIntersectionObserver)
        try {
            // A LATER reactive update populates the Simple tab's `{#each}`; each
            // item's `use:nearViewport` now calls the throwing constructor for
            // the first time.
            DBState.db = buildDb(V_N, 0)
            await settle(target)
            clickLayoutButton(target, 0)
            await settle(target)

            // RED: per the plan's own fail-open invariant (section 3.1, section 4:
            // "Fail open everywhere ... an observer error [means] the avatar
            // resolves as it does today"), every avatar should still resolve even
            // though the observer is unusable.
            expect(resolvedAvatarButtons(target).length).toBe(V_N)
            expect(avatarButtons(target).length).toBe(V_N)
        } finally {
            vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
            await unmount(app as never).catch(() => {})
            target.remove()
        }
    })

    test('RED: Sidebar still renders every item with data-char-id when the constructor throws on a later, reactive mount', async () => {
        // Sidebar's own top-level `{#if DBState.db.menuSideBar}` gate (Sidebar.svelte:405)
        // lets us mount with the item list ABSENT (no `nearViewport` call fires at
        // all, since that branch has no items), then flip `menuSideBar` to false
        // afterward -- a genuine reactive mount of the item-bearing branch on an
        // already-mounted component, matching the reviewer's "action throwing
        // during a later reactive mount" scenario without a wrapper component
        // (this file may only add cases to itself, not a new .svelte harness).
        DBState.db = buildSidebarDb(V_N)
        DBState.db.menuSideBar = true
        getFileSrcSpy.mockClear()
        const { target, app } = mountSidebar()
        await settle(target)
        vi.stubGlobal('IntersectionObserver', ThrowingIntersectionObserver)
        try {
            DBState.db.menuSideBar = false
            await settle(target)

            // RED: same fail-open invariant as the grid case above.
            const idEls = Array.from(target.querySelectorAll('[data-char-id]'))
            expect(idEls.length).toBe(V_N)
        } finally {
            vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
            await unmount(app as never).catch(() => {})
            target.remove()
        }
    })
})

describe('v11c: a HALF-throwing constructor (near succeeds, far throws) must still fail open', () => {
    // AV-2 re-gate coverage gap: see `HalfThrowingIntersectionObserver`'s own
    // doc comment above for why this fake exists and why the far band is the
    // one made to throw (it is the SECOND construction in
    // `nearViewport.svelte.ts`'s real call order, confirmed by reading that
    // file).
    //
    // This is CHAR, not RED: the try/catch already wrapping BOTH
    // `getOrCreateEntry` calls (`nearViewport.svelte.ts` ~:256-283) fails
    // open and cleans up regardless of which of the two constructions
    // throws, so this should already pass against today's source -- the gap
    // being closed here is in test coverage, not in the source.
    //
    // Same later-reactive-mount and unmount-in-finally shape as v11 above
    // (see that describe block's own long comment for the full rationale):
    // an empty character list drives zero `nearViewport` calls at initial
    // mount, so `app` is a valid, already-mounted handle before the
    // half-throwing fake is ever installed, and cleanup always runs in
    // `finally` -- a half-mounted, still-reactive component here can never
    // leak into later tests.
    function currentAlertType(): string {
        let type = ''
        const unsubscribe = alertStore.subscribe((value) => {
            type = (value as { type: string }).type
        })
        unsubscribe()
        return type
    }

    test('CHAR: every avatar resolves, the created near instance is torn down empty, console.warn fires without an alert, and unmount does not throw', async () => {
        DBState.db = buildDb(0, 0) // no characters yet: initial mount drives zero nearViewport calls
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const alertBefore = currentAlertType()
        HalfThrowingIntersectionObserver.nearInstances.length = 0
        vi.stubGlobal('IntersectionObserver', HalfThrowingIntersectionObserver)

        let unmountError: unknown
        try {
            // A LATER reactive update populates the grid's `{#each}`; each
            // item's `use:nearViewport` now calls the half-succeeding
            // constructor for the first time.
            DBState.db = buildDb(V_N, 0)
            await settle(target)
            clickLayoutButton(target, 0)
            await settle(target)

            // Fail open: every avatar still resolves, exactly like v11's
            // always-throwing case, even though the near construction itself
            // succeeded before the far one threw.
            expect(resolvedAvatarButtons(target).length).toBe(V_N)
            expect(avatarButtons(target).length).toBe(V_N)

            // Precondition: at least one near instance was actually created
            // (otherwise the teardown assertions below would vacuously pass).
            expect(HalfThrowingIntersectionObserver.nearInstances.length).toBeGreaterThan(0)
            // Every near instance that WAS created gets torn down by the
            // catch block's `removeTarget(root, NEAR_MARGIN, node)`
            // (`nearViewport.svelte.ts` ~:280): the far construction throws
            // before that near entry's own `targets.set`/`observe` calls
            // ever run, so its target map is already empty when
            // `removeTarget` runs, and it disconnects immediately, holding
            // no targets.
            for (const inst of HalfThrowingIntersectionObserver.nearInstances) {
                expect(inst.disconnected).toBe(true)
                expect(inst.observed.size).toBe(0)
            }

            // The catch block's own fail-open warning fired, and nothing
            // routed this into the app's own alert UI.
            expect(warnSpy).toHaveBeenCalled()
            expect(currentAlertType()).toBe(alertBefore)
        } finally {
            vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
            try {
                await unmount(app as never)
            } catch (error) {
                unmountError = error
            } finally {
                target.remove()
                warnSpy.mockRestore()
            }
        }

        expect(unmountError).toBeUndefined()
    })
})

describe('v12: entries must leave the visible set when items unmount', () => {
    test('RED (new): switching tabs away and back requires a fresh near entry per remounted item', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 0)
        await settle(target)
        getFileSrcSpy.mockClear()

        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)
        // Sanity precondition: firing the first k resolves exactly k (same as v1).
        expect(resolvedAvatarButtons(target).length).toBe(V_K)

        // Switch away, then back -- no new entries fired for either hop.
        clickLayoutButton(target, 1)
        await settle(target)
        clickLayoutButton(target, 0)
        await settle(target)

        // RED: `GridCatalog.svelte`'s `visibleIndices` is one `SvelteSet` shared
        // by grid/list/trash (declared once at the component's top level, per its
        // own comment), and `nearViewport`'s `destroy()` only calls `removeTarget`
        // -- it never calls `onChange(false)`. So the indices fired above are
        // never removed from `visibleIndices` when their old DOM nodes are
        // destroyed on the tab switch. The freshly remounted grid items for those
        // same indices read `isVisible = visibleIndices.has(char.index)` as
        // already `true`, and resolve immediately -- with NO fresh near entry
        // fired for their new nodes. Today this is `V_K` (3), not `0`.
        expect(resolvedAvatarButtons(target).length).toBe(0)

        // Firing a fresh near entry for the same indices' new nodes resolves them
        // again, same as v1/v2.
        const targetsAfter = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targetsAfter.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)
        expect(resolvedAvatarButtons(target).length).toBe(V_K)

        await teardown(target, app)
    })

    test('RED (new): narrowing then restoring the search requires a fresh near entry for the restored items', async () => {
        DBState.db = buildDb(V_N, 0)
        getFileSrcSpy.mockClear()
        const { target, app } = mountGridCatalog()
        await settle(target)
        clickLayoutButton(target, 0)
        await settle(target)
        getFileSrcSpy.mockClear()

        // Fire near for everything -- all V_N resolve.
        const targets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targets.map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)
        expect(resolvedAvatarButtons(target).length).toBe(V_N)

        // Narrow the search so only "Character 0" (index 0) survives; the rest
        // unmount.
        const searchInput = target.querySelector('input') as HTMLInputElement
        searchInput.value = 'Character 0'
        searchInput.dispatchEvent(new Event('input'))
        await settle(target)
        expect(avatarButtons(target).length).toBe(1)

        // Restore the search -- indices 1..V_N-1 remount as fresh DOM nodes.
        searchInput.value = ''
        searchInput.dispatchEvent(new Event('input'))
        await settle(target)

        // RED: index 0's node was never unmounted, so it stays correctly
        // resolved. Indices 1..V_N-1 are fresh nodes, but `visibleIndices` still
        // holds their stale entries from the "fire near for everything" step
        // above (nothing ever removed them on unmount, same bug as the tab-switch
        // case), so they resolve immediately too. Today this is `V_N` (8), not
        // `1` -- the restored items need their own fresh near entry, which
        // nothing here has fired yet.
        expect(resolvedAvatarButtons(target).length).toBe(1)

        // Firing a fresh near entry for the restored items resolves them.
        const targetsAfterRestore = orderedTargets(instancesByMargin(NEAR_MARGIN))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            targetsAfterRestore.map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)
        expect(resolvedAvatarButtons(target).length).toBe(V_N)

        await teardown(target, app)
    })

    describe('v12b: ordering hazard on grid -> list', () => {
        test('CHAR: a list item resolves once its own near entry fires after switching from grid, even without ever firing in grid mode', async () => {
            // This guards against a fix for the above RED cases landing as
            // "call onChange(false) on destroy" in a way where the OLD grid
            // item's destroy-time removal runs after the NEW list item's
            // add -- which would incorrectly strip the just-added index back out
            // of `visibleIndices` and leave the freshly-fired list item stuck on
            // the placeholder. Never firing anything in grid mode first isolates
            // this from the v12a stale-entry bug above: there is nothing stale to
            // fall back on here, so if this ever regresses to "does not resolve",
            // it is this ordering hazard, not v12a's bug.
            DBState.db = buildDb(V_N, 0)
            getFileSrcSpy.mockClear()
            const { target, app } = mountGridCatalog()
            await settle(target)
            clickLayoutButton(target, 0)
            await settle(target)
            // Deliberately fire nothing in grid mode.
            clickLayoutButton(target, 1)
            await settle(target)
            getFileSrcSpy.mockClear()

            const listTargets = orderedTargets(instancesByMargin(NEAR_MARGIN))
            fireOn(
                instancesByMargin(NEAR_MARGIN),
                listTargets.slice(0, V_K).map((t) => ({ target: t, isIntersecting: true })),
            )
            await settle(target)

            // Holds today: `nearViewport`'s `destroy()` never calls `onChange` at
            // all yet, so there is no destroy-time removal to race against the
            // new item's add in the first place. This is CHAR now (a fix must
            // keep it true), not RED.
            expect(resolvedAvatarButtons(target).length).toBe(V_K)

            await teardown(target, app)
        })

        test('CHAR: no IntersectionObserver global -- grid to list tab switch still resolves every list avatar (fail-open)', async () => {
            vi.stubGlobal('IntersectionObserver', undefined)
            try {
                DBState.db = buildDb(V_N, 0)
                getFileSrcSpy.mockClear()
                const { target, app } = mountGridCatalog()
                await settle(target)
                clickLayoutButton(target, 0)
                await settle(target)
                clickLayoutButton(target, 1)
                await settle(target)

                // CHAR: fail-open calls `onChange(true)` unconditionally at every
                // mount, tab switch or not (v4 covers the single-layout case; this
                // is the grid -> list hop specifically, called out by name in the
                // task brief as v12b's fail-open variant).
                expect(resolvedAvatarButtons(target).length).toBe(V_N)
                expect(getFileSrcSpy.mock.calls.length).toBeGreaterThanOrEqual(V_N)

                await teardown(target, app)
            } finally {
                vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
            }
        })
    })

    test('RED (new): Sidebar folder members need a fresh near entry after close/reopen; top-level items stay resolved', async () => {
        DBState.db = buildSidebarFolderDb(2, 3)
        getFileSrcSpy.mockClear()
        const { target, app } = mountSidebar()
        await settle(target)
        getFileSrcSpy.mockClear()

        // Resolve the top-level items via their own near entries. There are
        // three top-level `use:nearViewport` targets here, not two: Sidebar's
        // outer wrapping div (:584) is used for BOTH `normal` characters and the
        // folder header itself (:589-591 route the folder's own visibility into
        // `visibleFolderIds`), so the folder row is a near-margin target too,
        // alongside the 2 top-level characters.
        const topTargets = orderedTargets(instancesByMargin(NEAR_MARGIN))
        expect(topTargets.length).toBe(3)
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            topTargets.map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)
        expect((Array.from(target.querySelectorAll('img.sidebar-avatar')) as HTMLImageElement[]).length).toBe(2)

        // Open the folder. The folder's own toggle avatar is the one
        // `span.avatar` with no `data-char-id` (normal items and folder members
        // both get one; only the folder header itself does not, per
        // `Sidebar.svelte`'s `SidebarAvatar` calls).
        const folderAvatar = Array.from(target.querySelectorAll('span.avatar')).find(
            (el) => !el.hasAttribute('data-char-id'),
        ) as HTMLElement | undefined
        if (!folderAvatar) {
            throw new Error('folder toggle avatar not found')
        }
        folderAvatar.click()
        await settle(target)

        const memberTargets = orderedTargets(instancesByMargin(NEAR_MARGIN)).filter((t) => !topTargets.includes(t))
        expect(memberTargets.length).toBe(3)
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            memberTargets.map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)
        expect((Array.from(target.querySelectorAll('img.sidebar-avatar')) as HTMLImageElement[]).length).toBe(5)

        // Close, then reopen the folder. No new entries fired for the reopened
        // members.
        folderAvatar.click()
        await settle(target)
        folderAvatar.click()
        await settle(target)

        // RED: today `visibleCharIndices` (shared by top-level items and folder
        // members, per `Sidebar.svelte`'s own comment) never has the members'
        // indices removed when the folder closes and their DOM nodes are
        // destroyed -- `nearViewport`'s `destroy()` never calls `onChange`.
        // Reopening remounts fresh member nodes that read those same stale
        // indices as already visible, and they resolve with no fresh near entry
        // fired. Today this is 5 (2 top-level + 3 stale members), not 2.
        expect((Array.from(target.querySelectorAll('img.sidebar-avatar')) as HTMLImageElement[]).length).toBe(2)

        // Firing a fresh near entry for the reopened members resolves them
        // again; the top-level items, never unmounted, are untouched throughout.
        const reopenTargets = orderedTargets(instancesByMargin(NEAR_MARGIN)).filter((t) => !topTargets.includes(t))
        fireOn(
            instancesByMargin(NEAR_MARGIN),
            reopenTargets.map((t) => ({ target: t, isIntersecting: true })),
        )
        await settle(target)
        expect((Array.from(target.querySelectorAll('img.sidebar-avatar')) as HTMLImageElement[]).length).toBe(5)

        await teardown(target, app)
    })
})
