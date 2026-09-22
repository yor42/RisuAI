/**
 * CHORE-17 follow-up harness stub for `src/ts/process/modules.ts`,
 * scoped to `stores.svelte.ts`'s own import of it.
 *
 * `stores.svelte.ts` imports only `moduleUpdate`, called inside its
 * top-level `$effect.root`'s child effect (real, kept -- this is part of
 * the app's actual baseline reactive graph the follow-up measurement runs
 * against). The real `modules.ts` itself reaches `globalApi.svelte`,
 * `characterCards.ts`, `interchangeability.ts`, `media.ts`, `rpack_js`, and
 * `../alert` -- an unrelated module-editor subsystem this harness's fixture
 * never touches (this fixture's `modules: []`).
 */
export function moduleUpdate(): void {}

export function getModuleAssets(): unknown[] { return [] }
export function getModuleLorebooks(): unknown[] { return [] }
export function getModules(): unknown[] { return [] }
export function getModuleRegexScripts(): unknown[] { return [] }
