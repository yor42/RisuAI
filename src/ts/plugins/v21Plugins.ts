import type { RisuPlugin } from "./plugins.svelte"

/**
 * Whether an enabled V2.1 plugin exists in `plugins`. Only a plugin of version
 * `'2.1'` runs code that reads and writes `DBState.db` directly (a version `2`
 * plugin is never run), so it is the only one that needs every character in
 * memory.
 *
 * This module imports nothing at run time, so the boot archive pass and
 * `loadPlugins` in `plugins.svelte.ts` can share the predicate without a
 * load-time cycle.
 */
export function hasEnabledV21Plugin(plugins: readonly Pick<RisuPlugin, 'enabled' | 'version'>[] | undefined): boolean {
    return Array.isArray(plugins) && plugins.some((plugin) => plugin?.enabled && plugin.version === '2.1')
}
