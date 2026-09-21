/**
 * Rune primitives for module-scaling-bench.harness.ts. Same split rationale
 * as every other `.svelte.ts`/`.harness.ts` pair in this directory: `$state`/
 * `$state.snapshot` are compiler macros only recognized in `.svelte.ts`
 * files. Same standalone-`$state({db:...})`-container caveat as the other
 * benches: raw snapshot cost only, not wired into the real DBState effect
 * graph.
 */

export function makeProxiedDbState<T extends Record<string, unknown>>(database: T) {
    const state = $state({ db: database as any })
    return state
}

/** Snapshots ONE module (used for the asset-heavy single-module measurement). */
export function snapshotOneModule(state: { db: any }, index: number): unknown {
    return $state.snapshot(state.db.modules[index])
}

/** Snapshots the WHOLE modules array (used for the module-count scaling measurement). */
export function snapshotWholeModulesArray(state: { db: any }): unknown {
    return $state.snapshot(state.db.modules)
}
