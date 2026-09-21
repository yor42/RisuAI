import type { RisuModule } from "./modules"

/**
 * Registers the reactive dependencies moduleUpdate() consumes, and nothing else.
 *
 * Replaces a `$state.snapshot(DBState.db.modules)` deep-read in stores.svelte.ts
 * which deep-cloned the whole modules array on every keystroke -- ~29ms in a
 * production build, against a 16.7ms frame budget -- purely to register
 * dependencies, then discarded the clone.
 *
 * Only four fields reach moduleUpdate(): `id` and `namespace` select and
 * deduplicate modules in getModuleByIds() (modules.ts:374-394) and build the
 * `lastModuleIds` reload key (modules.ts:557); `hideIcon` feeds HideIconStore
 * (modules.ts:566) and `backgroundEmbedding` feeds moduleBackgroundEmbedding
 * (modules.ts:569). Narrowing to those four means edits to a module's name,
 * lorebook, regex, triggers or assets no longer re-run that effect. If
 * moduleUpdate() ever starts reading a fifth field, add it here too, or edits
 * to it will silently stop updating the GUI.
 *
 * This does NOT gate persistence. The save-side deep read is a separate effect
 * at dbChangeEffects.svelte.ts:34, which is intentionally left broad: it sets
 * tracker.modules, and a mutation missed there is never written to disk at all.
 *
 * Lives in its own leaf module, imported only for its type, so that
 * tests/moduleUpdateDeps.svelte.test.ts can import it without pulling in
 * modules.ts's runtime graph (Tauri plugins, wasm, and a circular edge back
 * through stores.svelte.ts).
 */
export function trackModuleUpdateDeps(modules: RisuModule[] | undefined | null) {
    if (!modules) return
    const len = modules.length
    for (let i = 0; i < len; i++) {
        const m = modules[i]
        if (!m) continue
        void m.id
        void m.namespace
        void m.hideIcon
        void m.backgroundEmbedding
    }
}
