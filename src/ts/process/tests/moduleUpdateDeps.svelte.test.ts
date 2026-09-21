import { flushSync } from 'svelte'
import { afterEach, describe, expect, test } from 'vitest'
import type { RisuModule } from '../modules'
import { trackModuleUpdateDeps } from '../moduleUpdateDeps'

// Tests for trackModuleUpdateDeps() (src/ts/process/moduleUpdateDeps.ts).
//
// Written per Agents/Reports/09-stage-a-module-effect-narrowing-plan.md,
// sections 4, 5, 5.5, against the STEP 1 source, which had a deliberately
// over-broad body -- `JSON.stringify(modules)` -- deep-reading every
// enumerable field of every module, matching the dependency set of the
// $state.snapshot(...) deep-read it replaced. The narrowed body committed
// alongside these tests reads only `id`, `namespace`, `hideIcon` and
// `backgroundEmbedding`.
//
// The 11 tests below, labelled "verified failing before the narrowing",
// are the proof that the narrowing is real: they assert that mutating a
// non-consumed field does NOT re-run a $effect that depends on
// trackModuleUpdateDeps(). They were run against the pre-narrowing
// JSON.stringify body and confirmed RED there -- `AssertionError: expected
// 2 to be 1` on every one of them, because JSON.stringify touches every
// field and so registers a dependency on all of them. Only after that RED
// run was confirmed was the body narrowed to the four fields above, which
// turned all 11 GREEN. That red-before-green sequence, not the current
// source text, is what makes them evidence rather than decoration.
//
// Tests marked "coverage" pass both before and after the narrowing and are
// kept only to guard against regressions in the parts of behaviour that
// were never meant to change (the four consumed fields, and array-shape
// changes). They are not evidence that the narrowing happened.
//
// Unlike src/ts/storage/tests/dbChangeEffects.svelte.test.ts, no vi.mock is
// used here at all. moduleUpdateDeps.ts's only import is
// `import type { RisuModule } from "./modules"`, which is erased at
// compile time, so the module under test has zero runtime dependencies.
// This file only imports `type RisuModule` too, for the same reason.
//
// Plan item 5.4 (HideIconStore / moduleBackgroundEmbedding end-to-end
// parity) is deliberately NOT covered here. It requires the real
// modules.ts / stores.svelte.ts graph and belongs to the manual smoke
// check described in plan section 5.6, not to this leaf-module unit test.

//#region fixtures

// Indexed-access types keep this file's only type dependency on RisuModule
// itself, rather than reaching into storage/database.svelte.ts or
// process/triggers.ts for the nested field types.
type LoreBookEntry = NonNullable<RisuModule['lorebook']>[number]
type CustomScriptEntry = NonNullable<RisuModule['regex']>[number]
type TriggerEntry = NonNullable<RisuModule['trigger']>[number]
type AssetEntry = NonNullable<RisuModule['assets']>[number]

// Every field of RisuModule (modules.ts:19-35) is given a real, present
// value -- none left undefined -- per the plan's instruction: an absent
// property and a present one are not necessarily read the same way
// through a $state proxy, and that ambiguity should not sit under the
// result.
function makeModule(seed: string): RisuModule {
    const lorebookEntry: LoreBookEntry = {
        key: `key-${seed}`,
        secondkey: `secondkey-${seed}`,
        insertorder: 100,
        comment: `lorebook-comment-${seed}`,
        content: `lorebook-content-${seed}`,
        mode: 'normal',
        alwaysActive: false,
        selective: true,
    }
    const regexEntry: CustomScriptEntry = {
        comment: `regex-comment-${seed}`,
        in: '/foo/',
        out: 'bar',
        type: 'editinput',
        flag: 'g',
        ableFlag: true,
    }
    const triggerEntry: TriggerEntry = {
        comment: `trigger-comment-${seed}`,
        type: 'manual',
        conditions: [],
        effect: [],
    }
    const assetEntry: AssetEntry = ['asset-name', 'asset-path', 'asset-ext']

    return {
        name: `Module ${seed}`,
        description: `Description for module ${seed}`,
        lorebook: [lorebookEntry],
        regex: [regexEntry],
        cjs: `console.log('cjs-${seed}')`,
        trigger: [triggerEntry],
        id: `module-id-${seed}`,
        lowLevelAccess: false,
        hideIcon: false,
        backgroundEmbedding: `bg-${seed}`,
        assets: [assetEntry],
        namespace: `namespace-${seed}`,
        customModuleToggle: `toggle-${seed}`,
        mcp: { url: `https://example.com/mcp/${seed}` },
        icon: `icon-${seed}.png`,
    }
}

//#endregion

//#region effect harness

let runCount = 0
let cleanup: (() => void) | undefined

afterEach(() => {
    cleanup?.()
    cleanup = undefined
})

// `read` is a closure, not a bare array reference, so that tests can
// exercise a *property* read (e.g. `box.modules`) and observe whole-array
// reassignment -- mirroring how the real effect reads
// `DBState?.db?.modules` at src/ts/stores.svelte.ts:197.
function trackEffect(read: () => RisuModule[] | undefined | null) {
    runCount = 0
    cleanup = $effect.root(() => {
        $effect(() => {
            trackModuleUpdateDeps(read())
            runCount++
        })
    })
    flushSync()
}

//#endregion

describe('trackModuleUpdateDeps — 5.1 narrowing proof (verified failing before the narrowing)', () => {
    test('mutating modules[0].name does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].name = 'renamed'
        flushSync()

        expect(runCount).toBe(before)
    })
})

describe('trackModuleUpdateDeps — 5.2-negative field-list pin (verified failing before the narrowing)', () => {
    test('mutating modules[0].description does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].description = 'changed description'
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].lorebook does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].lorebook = [{
            key: 'key-replaced', secondkey: '', insertorder: 0, comment: '',
            content: 'replaced', mode: 'normal', alwaysActive: false, selective: false,
        }]
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].regex does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].regex = [{ comment: 'replaced', in: '/x/', out: 'y', type: 'editinput' }]
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].trigger does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].trigger = [{ comment: 'replaced', type: 'manual', conditions: [], effect: [] }]
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].assets does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].assets = [['replaced-name', 'replaced-path', 'replaced-ext']]
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].cjs does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].cjs = "console.log('replaced')"
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].lowLevelAccess does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].lowLevelAccess = !modules[0].lowLevelAccess
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].customModuleToggle does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].customModuleToggle = 'replaced-toggle'
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].mcp does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].mcp = { url: 'https://example.com/replaced' }
        flushSync()

        expect(runCount).toBe(before)
    })

    test('mutating modules[0].icon does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].icon = 'replaced-icon.png'
        flushSync()

        expect(runCount).toBe(before)
    })
})

describe('trackModuleUpdateDeps — 5.2-positive field-list pin (coverage: passes before AND after step 3)', () => {
    // These four fields are exactly what step 3's narrowed body reads, so
    // they must keep re-running the effect both before (JSON.stringify
    // reads everything, including these) and after (the narrowed body
    // reads exactly these). A passing result here is expected either way
    // and is NOT proof that narrowing happened -- only the 5.1 /
    // 5.2-negative tests above are. Run for both index 0 and index 1 so
    // the assertion isn't accidentally satisfied by only ever touching the
    // first element of the array.

    test('mutating modules[0].id re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].id = 'module-id-a-changed'
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('mutating modules[0].namespace re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].namespace = 'namespace-a-changed'
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('mutating modules[0].hideIcon re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].hideIcon = !modules[0].hideIcon
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('mutating modules[0].backgroundEmbedding re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].backgroundEmbedding = 'bg-a-changed'
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('mutating modules[1].id re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[1].id = 'module-id-b-changed'
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('mutating modules[1].namespace re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[1].namespace = 'namespace-b-changed'
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('mutating modules[1].hideIcon re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[1].hideIcon = !modules[1].hideIcon
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('mutating modules[1].backgroundEmbedding re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[1].backgroundEmbedding = 'bg-b-changed'
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })
})

describe('trackModuleUpdateDeps — 5.3 array-shape parity (coverage: passes before AND after step 3)', () => {
    // Covered by I3 in the plan: length-changing operations are caught by
    // the narrowed body's own loop bound, and whole-array replacement is
    // caught by the property read of the array itself (here, `box.modules`)
    // rather than by anything inside trackModuleUpdateDeps. These pass
    // today against JSON.stringify too, so they are coverage, not proof.

    test('push re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules.push(makeModule('c'))
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('splice re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b'), makeModule('c')])
        trackEffect(() => modules)
        const before = runCount

        modules.splice(1, 1)
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('in-place reorder (index swap) re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        const tmp = modules[0]
        modules[0] = modules[1]
        modules[1] = tmp
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    // Matters specifically because Stage B (a separate, later change) will
    // do exactly this -- replace one array element with a draft copy.
    test('single-element replacement (arr[0] = {...}) re-runs the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0] = makeModule('replaced')
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })

    test('whole-array replacement re-runs the effect', () => {
        const box = $state({ modules: [makeModule('a'), makeModule('b')] })
        trackEffect(() => box.modules)
        const before = runCount

        box.modules = [makeModule('c')]
        flushSync()

        expect(runCount).toBeGreaterThan(before)
    })
})

describe('trackModuleUpdateDeps — degenerate inputs (coverage: passes before AND after step 3)', () => {
    test('trackModuleUpdateDeps(undefined) returns without throwing', () => {
        expect(() => trackModuleUpdateDeps(undefined)).not.toThrow()
    })

    test('trackModuleUpdateDeps(null) returns without throwing', () => {
        expect(() => trackModuleUpdateDeps(null)).not.toThrow()
    })

    test('an array containing a null element does not throw', () => {
        const modules = $state([makeModule('a'), null as unknown as RisuModule])
        expect(() => trackModuleUpdateDeps(modules)).not.toThrow()
    })
})

// Deliberately NOT tested here (plan 5.4, deferred to the manual smoke
// check in plan 5.6): end-to-end parity of HideIconStore and
// moduleBackgroundEmbedding when hideIcon/backgroundEmbedding change on a
// module reached through the real modules.ts / stores.svelte.ts graph.
