/**
 * Rune primitives for the trackModuleUpdateDeps() AFTER-side benchmark.
 *
 * Lives in a `.svelte.ts` file (required — `$state`/`$state.snapshot` are
 * compiler macros only recognized in `.svelte`/`.svelte.ts`/`.svelte.js`
 * files) so the actual bench spec (`track-module-deps-bench.harness.ts`, a
 * plain `.ts`) can import and call these as normal functions, exactly
 * mirroring the split already used by svelte-proxy-bench.svelte.ts /
 * svelte-proxy-bench.harness.ts in this same directory.
 *
 * Same deliberate deviation as svelte-proxy-bench.svelte.ts, carried
 * forward unchanged: this wraps the fixture in our OWN module-level
 * `$state({db: ...})` container, not the real `DBState` wired into
 * stores.svelte.ts's actual effect graph (importing that graph throws at
 * module-evaluation time before the store can be populated — see that
 * file's header for the specific errors). The reactive primitive itself
 * ($state's deep proxy, $state.snapshot's unwrap) is mechanically
 * identical either way; what's synthetic is only which effects would
 * consume the read and when they'd fire. So this benchmark case carries
 * the SAME "raw cost only, real figure is this or higher" caveat as the
 * existing snapshot benchmark.
 *
 * trackModuleUpdateDeps() itself (src/ts/process/moduleUpdateDeps.ts) is
 * imported directly from src/ — its only import is `import type { RisuModule }
 * from "./modules"`, which is erased at compile time (type-only import), so
 * pulling it in does NOT drag in modules.ts's runtime graph (globalApi.svelte,
 * stores.svelte, Tauri plugins, wasm). This is the same property
 * src/ts/process/tests/moduleUpdateDeps.svelte.test.ts relies on.
 */
import { trackModuleUpdateDeps } from 'src/ts/process/moduleUpdateDeps'
import type { RisuModule } from 'src/ts/process/modules'

/**
 * Fills in the three fields trackModuleUpdateDeps() reads besides `id`
 * (namespace, hideIcon, backgroundEmbedding) that the save-gen fixture
 * builder (build.ts's makeModule()) never sets, so every read lands on a
 * REAL, present value rather than `undefined`. Per the sibling unit test's
 * own rationale (moduleUpdateDeps.svelte.test.ts's makeModule() comment):
 * an absent property and a present one are not necessarily read the same
 * way through a $state proxy, so that ambiguity should not sit under a
 * timing result. Mutates and returns the SAME array (and objects) build.ts
 * produced — it does not change module count, lorebook/regex/trigger/asset
 * counts, or cjs size, so moduleBytes accounting stays representative of
 * the same fixture the existing snapshot benchmark measures.
 */
export function enrichModulesForTracking(modules: Record<string, unknown>[]): Record<string, unknown>[] {
    for (let i = 0; i < modules.length; i++) {
        const m = modules[i]
        if (!m) continue
        m.namespace = `namespace-${i}`
        m.hideIcon = i % 2 === 0
        m.backgroundEmbedding = `bg-${i}`
    }
    return modules
}

/** Mirrors makeProxiedDbState in svelte-proxy-bench.svelte.ts — same $state() rune, same deep-proxying. */
export function makeProxiedDbState<T extends Record<string, unknown>>(database: T) {
    const state = $state({ db: database as any })
    return state
}

/** The AFTER-side call under test: mirrors src/ts/stores.svelte.ts's `trackModuleUpdateDeps(DBState?.db?.modules)`. */
export function runTrackModuleUpdateDeps(state: { db: any }): void {
    trackModuleUpdateDeps(state.db.modules as RisuModule[] | undefined | null)
}

/** The BEFORE-side call under test, measured fresh in this session (not copied from the README). */
export function snapshotModules(state: { db: any }): unknown {
    return $state.snapshot(state.db.modules)
}
