/**
 * Rune primitives for module-effect-overhead-bench.harness.ts (addendum item
 * 3). Unlike every other bench in this directory, this one measures REAL
 * `$effect`/`$effect.root` scheduling cost, not just raw `$state.snapshot()`
 * calls -- because the question ("does per-effect scheduling/teardown
 * overhead erase the partition's advantage at higher module counts?") is
 * specifically about the Svelte effect graph, not the snapshot primitive in
 * isolation.
 *
 * The `$effect.root()` + `flushSync()` pattern mirrors the ALREADY-EXISTING
 * precedent in this exact repo: src/ts/storage/tests/dbChangeEffects.svelte.test.ts
 * uses the identical pattern (`cleanup = $effect.root(() => {...}); flushSync()`)
 * under this same vitest/happy-dom setup to test the REAL
 * registerDbChangeEffects() function. That file is the existence proof this
 * pattern works headlessly in this repo's test environment; this bench
 * reuses it for a synthetic, isolated N-child-effect scenario instead of the
 * app's real effect registration function, for the same reason every other
 * bench here uses a standalone `$state` container instead of the real
 * DBState (see svelte-proxy-bench.svelte.ts's header) -- avoiding the rest
 * of the app's import graph.
 */
import { flushSync } from 'svelte'

export function makeProxiedDbState<T extends Record<string, unknown>>(database: T) {
    const state = $state({ db: database as any })
    return state
}

/** Per-child-effect run counters, one slot per module index. */
export function makeRunCounters(n: number): number[] {
    return new Array(n).fill(0)
}

/**
 * TODAY'S baseline, expressed as a real $effect: ONE effect deep-reads the
 * whole modules array via $state.snapshot(), mirroring
 * dbChangeEffects.svelte.ts:33-38 exactly (just without the tracker/
 * markChanged side effects, which are irrelevant to the scheduling-cost
 * question). Returns the $effect.root cleanup function.
 */
export function registerSingleWholeArrayEffect(state: { db: any }, runCounter: { count: number }): () => void {
    return $effect.root(() => {
        $effect(() => {
            $state.snapshot(state.db.modules)
            runCounter.count++
        })
    })
}

/**
 * THE PARTITION's steady-state shape: N child $effects, each deep-reading
 * (snapshotting) only its own module element. Returns the $effect.root
 * cleanup function (tearing this down destroys all N child effects at
 * once, exactly like tearing down an outer #each-driven effect scope would).
 */
export function registerPerElementChildEffects(state: { db: any }, runCounters: number[]): () => void {
    return $effect.root(() => {
        const modules = state.db.modules as unknown[]
        for (let i = 0; i < modules.length; i++) {
            const idx = i
            $effect(() => {
                $state.snapshot(state.db.modules[idx])
                runCounters[idx] = (runCounters[idx] ?? 0) + 1
            })
        }
    })
}

/** Mutates a single leaf field on one module element (a "keystroke"). */
export function mutateOneModuleLeaf(state: { db: any }, index: number, value: string): void {
    state.db.modules[index].description = value
}

/** Forces Svelte's effect scheduler to run synchronously, as the existing dbChangeEffects test does. */
export function flush(): void {
    flushSync()
}

/** Reassigns the whole modules array reference (an import/delete/replace-style shape change). */
export function replaceModulesArray(state: { db: any }, newModules: unknown[]): void {
    state.db.modules = newModules as any
}
