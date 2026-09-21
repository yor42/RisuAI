/**
 * Rune primitives for module-partition-bench.harness.ts.
 *
 * Lives in a `.svelte.ts` file (required — `$state`/`$state.snapshot` are
 * compiler macros only recognized in `.svelte`/`.svelte.ts`/`.svelte.js`
 * files) so the actual bench spec (a plain `.harness.ts`) can import and
 * call these as normal functions — the same split already used by
 * svelte-proxy-bench.svelte.ts / svelte-proxy-bench.harness.ts and
 * track-module-deps-bench.svelte.ts / track-module-deps-bench.harness.ts in
 * this same directory.
 *
 * Same deliberate deviation as those two siblings, carried forward
 * unchanged: this wraps the fixture in our OWN module-level
 * `$state({db: ...})` container, not the real `DBState` wired into
 * stores.svelte.ts's actual effect graph (importing that graph throws at
 * module-evaluation time before the store can be populated — see
 * svelte-proxy-bench.svelte.ts's header for the specific errors). The
 * reactive primitive itself ($state's deep proxy, $state.snapshot's
 * unwrap) is mechanically identical either way; what's synthetic is only
 * which effects would consume the read and when they'd fire. So this
 * benchmark carries the SAME "raw cost only, real figure is this or
 * higher" caveat as the existing snapshot benchmarks.
 */

/** Mirrors makeProxiedDbState in the sibling benches — same $state() rune, same deep-proxying. */
export function makeProxiedDbState<T extends Record<string, unknown>>(database: T) {
    const state = $state({ db: database as any })
    return state
}

/** BASELINE (current production code): dbChangeEffects.svelte.ts:33-38's `$state.snapshot(DBState.db.modules)` over the WHOLE array. */
export function snapshotWholeModulesArray(state: { db: any }): unknown {
    return $state.snapshot(state.db.modules)
}

/** PARTITION steady-state cost: one child `$effect` deep-reading (snapshotting) ONE module element. */
export function snapshotOneModule(state: { db: any }, index: number): unknown {
    return $state.snapshot(state.db.modules[index])
}

/**
 * PARTITION array-SHAPE-change cost: every per-element child `$effect` fires once,
 * each doing its own `$state.snapshot(modules[i])`. This is one full pass over all
 * elements, timed as a single operation per sample (matching how the whole-array
 * baseline is timed as a single operation per sample) so the two are directly
 * comparable as "cost of one shape-change event" vs "cost of one keystroke".
 */
export function snapshotAllModulesIndividually(state: { db: any }): unknown[] {
    const modules = state.db.modules as unknown[]
    const out: unknown[] = new Array(modules.length)
    for (let i = 0; i < modules.length; i++) {
        out[i] = $state.snapshot(modules[i])
    }
    return out
}
