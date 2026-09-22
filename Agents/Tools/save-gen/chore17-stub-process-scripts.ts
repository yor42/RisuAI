/**
 * CHORE-17 follow-up harness stub for `src/ts/process/scripts.ts`,
 * scoped to `stores.svelte.ts`'s own import of it.
 *
 * `stores.svelte.ts` imports only `resetScriptCache`, called from a
 * `ReloadGUIPointer.subscribe(...)` callback this harness never triggers
 * (nothing here publishes to `ReloadGUIPointer`). The real `scripts.ts`
 * itself reaches `src/ts/plugins/plugins.svelte.ts` (which in turn pulls in
 * the V3 plugin sandbox, `apiV3/transpiler`, `pluginSafety`, etc.) --
 * exactly the wide plugin-loading subsystem this harness's earlier
 * `chore17-entry.svelte.ts` already documented avoiding, for the same
 * reason.
 */
export function resetScriptCache(): void {}

export async function processScriptFull(): Promise<unknown> { return undefined }
