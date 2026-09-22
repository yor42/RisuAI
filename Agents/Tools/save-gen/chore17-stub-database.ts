/**
 * CHORE-17 browser harness stub for `src/ts/storage/database.svelte.ts`.
 *
 * risuSave.ts imports only `getDatabase` and `presetTemplate` (plus the
 * `Database` type) from this module. `getDatabase` is used exactly once, in
 * `disableRemoteSaving()`, which already wraps the call in try/catch and
 * returns `true` (remote saving disabled) if it throws — this is the exact
 * same "no live database in tests" convention the Node harness
 * (`chore01-plugin-setdatabase-save-bench.svelte.harness.ts`) uses for its
 * own `database.svelte` mock. `presetTemplate` is only read by
 * `RisuSaveDecoder`, which this harness never exercises (it only measures
 * `RisuSaveEncoder`), so a plain placeholder object is enough to satisfy the
 * import.
 *
 * Stubbed (not real) because `database.svelte.ts` is a very large module with
 * its own broad import graph — pulling it in for real would require the same
 * scale of mocking the Node harness needed for `globalApi.svelte.ts`, for a
 * module whose only two exports used here are both dead code on the
 * `RisuSaveEncoder.set()` path this harness measures (see reply for the
 * full stub list).
 */
export type Database = any

export function getDatabase(): never {
    throw new Error('chore17 harness: no live database — matches disableRemoteSaving()\'s catch-all, which returns true (remote disabled) on any throw')
}

export const presetTemplate = { name: 'chore17-harness-stub-preset' }
