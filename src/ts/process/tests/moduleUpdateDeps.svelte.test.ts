import { flushSync } from 'svelte'
import { afterEach, describe, expect, test } from 'vitest'
import type { RisuModule } from '../modules'
import { trackModuleUpdateDeps } from '../moduleUpdateDeps'

// Tests for trackModuleUpdateDeps() (src/ts/process/moduleUpdateDeps.ts).
//
// Written per Agents/Reports/09-stage-a-module-effect-narrowing-plan.md.
//
// trackModuleUpdateDeps() must depend on exactly `id`, `namespace`,
// `hideIcon` and `backgroundEmbedding` on each module: mutating any other
// field must NOT re-run a $effect that depends on it. The 11 tests below
// each assert that non-dependency for one other field.
//
// Tests marked "coverage" pin behaviour that must hold regardless of which
// fields are consumed (the four consumed fields themselves, and
// array-shape changes) -- present-tense guards, not evidence about which
// fields are narrowed.
//
// Unlike src/ts/storage/tests/dbChangeEffects.svelte.test.ts, no vi.mock is
// used here at all. moduleUpdateDeps.ts's only import is
// `import type { RisuModule } from "./modules"`, which is erased at
// compile time, so the module under test has zero runtime dependencies.
// This file only imports `type RisuModule` too, for the same reason.
//
// HideIconStore / moduleBackgroundEmbedding end-to-end parity is
// deliberately NOT covered here. It requires the real modules.ts /
// stores.svelte.ts graph and belongs to a manual smoke check, not to this
// leaf-module unit test.

//#region fixtures

// Indexed-access types keep this file's only type dependency on RisuModule
// itself, rather than reaching into storage/database.svelte.ts or
// process/triggers.ts for the nested field types.
type LoreBookEntry = NonNullable<RisuModule['lorebook']>[number]
type CustomScriptEntry = NonNullable<RisuModule['regex']>[number]
type TriggerEntry = NonNullable<RisuModule['trigger']>[number]
type AssetEntry = NonNullable<RisuModule['assets']>[number]

// Every field of RisuModule (its type definition in modules.ts) is given a
// real, present value -- none left undefined: an absent property and a
// present one are not necessarily read the same way through a $state proxy,
// and that ambiguity must not sit under the result.
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
// reassignment -- mirroring how the real effect in stores.svelte.ts reads
// `DBState?.db?.modules`.
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

describe('trackModuleUpdateDeps — narrowing: a field moduleUpdate() does not read does not re-run the effect', () => {
    test('mutating modules[0].name does NOT re-run the effect', () => {
        const modules = $state([makeModule('a'), makeModule('b')])
        trackEffect(() => modules)
        const before = runCount

        modules[0].name = 'renamed'
        flushSync()

        expect(runCount).toBe(before)
    })
})

describe('trackModuleUpdateDeps — field-list pin: fields outside the consumed four do not re-run the effect', () => {
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

describe('trackModuleUpdateDeps — field-list pin: the four consumed fields re-run the effect (compatibility guard)', () => {
    // These four fields are exactly what trackModuleUpdateDeps reads, so
    // changing any of them must re-run the effect. A whole-module deep read
    // would pass these too, so they are not proof of narrowing -- only the
    // two describe blocks above are. Run for both index 0 and index 1 so
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

describe('trackModuleUpdateDeps — array-shape changes re-run the effect (compatibility guard)', () => {
    // Length-changing operations are caught by trackModuleUpdateDeps's own
    // loop bound, and whole-array replacement is caught by the property read
    // of the array itself (here, `box.modules`) rather than by anything
    // inside trackModuleUpdateDeps. A whole-module deep read would pass these
    // too, so they are coverage, not proof of narrowing.

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

describe('trackModuleUpdateDeps — degenerate inputs (compatibility guard)', () => {
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

// Deliberately NOT tested here (covered by a manual smoke check instead):
// end-to-end parity of HideIconStore and
// moduleBackgroundEmbedding when hideIcon/backgroundEmbedding change on a
// module reached through the real modules.ts / stores.svelte.ts graph.
