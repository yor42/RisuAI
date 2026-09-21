/**
 * Svelte 5 rune primitives for the proxy-cost benchmark. Lives in a
 * `.svelte.ts` file (required — `$state`/`$state.snapshot` are compiler
 * macros only recognized in `.svelte`/`.svelte.ts`/`.svelte.js` files) so the
 * actual bench spec (a plain `.spec.ts`) can import and call these as normal
 * functions.
 *
 * IMPORTANT — deviation from the app's real store, done deliberately and
 * documented here (per task instruction to "say so" if this fallback is
 * used): this does NOT import the real `DBState`/`selIdState` from
 * src/ts/stores.svelte.ts, nor call the real `setDatabase()` from
 * src/ts/storage/database.svelte.ts. An empirical probe (kept out of the
 * final suite) showed that merely importing database.svelte.ts transitively
 * imports stores.svelte.ts and src/ts/parser/parser.svelte.ts, BOTH of which
 * register module-level `$effect.root(...)` blocks that fire immediately on
 * import (Svelte's "universal reactivity" runs at module-evaluation time,
 * not lazily) against a still-empty/uninitialized `DBState.db` — this threw
 * uncaught exceptions (`Cannot read properties of undefined (reading
 * 'selId')` from parser.svelte.ts:479, and a circular-import TDZ error
 * `Cannot access '__vite_ssr_import_17__' before initialization` from
 * modules.ts's `moduleUpdate()` chain called out of stores.svelte.ts:203)
 * before we ever got a chance to populate the store. Making the real import
 * graph safe would require mocking out those other unrelated effects too,
 * which is exactly the "too much unrelated machinery" the task anticipated.
 *
 * What this measures INSTEAD: our own module-level `$state({db: ...})`
 * container — mechanically IDENTICAL reactivity primitive to
 * `stores.svelte.ts`'s `DBState` (same `$state()` rune, same deep-proxying
 * of plain objects/arrays, same `$state.snapshot()` unwrap implementation —
 * there is only one such implementation in the Svelte runtime, it isn't
 * specialized per call site), just not wired into the app's actual effect
 * graph. So the *snapshot cost itself* is the real number; what's
 * synthetic is only which effects would consume it and when they'd fire.
 */

export function makeProxiedDbState<T extends Record<string, unknown>>(database: T) {
    // Deep-proxied by $state, exactly as `export const DBState = $state({db: {} as any as Database})`
    // is in src/ts/stores.svelte.ts:105-107.
    const state = $state({ db: database as any })
    return state
}

/** Mirrors src/ts/globalApi.svelte.ts:621 and src/ts/stores.svelte.ts:196 (the module-editor snapshot, paid twice per keystroke). */
export function snapshotModules(state: { db: any }): unknown {
    return $state.snapshot(state.db.modules)
}

/** Mirrors src/ts/globalApi.svelte.ts:663 (the active character's chats, deep-cloned on every streaming chunk). */
export function snapshotActiveChats(state: { db: any }, activeIndex: number): unknown {
    return $state.snapshot(state.db.characters[activeIndex].chats)
}

/** Generic single-value proxied-state + snapshot helper, used by the count-vs-bytes scaling probe. */
export function makeProxiedValue<T>(value: T) {
    const state = $state({ value: value as any })
    return state
}

export function snapshotValue(state: { value: any }): unknown {
    return $state.snapshot(state.value)
}
