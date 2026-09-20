// A plain module-scope registry of in-progress, uncommitted, component-local
// drafts (text the user has started editing but not yet committed into
// `DBState.db`). Deliberately NOT a rune and NOT derived from `DBState`: this
// value is read from `saveDb()`'s plain `while (true)` loop body in
// globalApi.svelte.ts, which sits outside the `$effect.root(...)` block that
// drives the save loop's dirty tracking. Making this reactive would re-enter
// that effect graph for no benefit -- a plain `Set` read has no such effect.
//
// Keys are expected to be generated per component instance (e.g. `v4()` from
// the `uuid` package -- NOT `crypto.randomUUID()`, which is spec'd
// `[SecureContext]` and is `undefined` on a non-secure origin, including
// plain-HTTP LAN self-hosting, a supported deployment for this project),
// never derived from an index or id. A derived key
// like `chat-edit-${idx}` would collide across a remount at the same index:
// instance A registers, B mounts and registers the same key, A's teardown
// deletes it, and B's still-live draft is silently left unprotected.
const localDraftKeys = new Set<string>()

export function registerDraft(key: string): void {
    localDraftKeys.add(key)
}

export function unregisterDraft(key: string): void {
    // Deleting a key that was never registered (or already removed) is a
    // no-op on a Set -- safe by construction, no guard needed.
    localDraftKeys.delete(key)
}

export function hasLocalDrafts(): boolean {
    return localDraftKeys.size > 0
}
