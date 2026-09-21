import type { ColdStorageReadResult } from "src/ts/process/coldstorage.svelte"

/**
 * The slice of the database `_getPluginStorage`/`_setPluginStorage` touch.
 * Deliberately loose (not `Database` itself) so these functions can be unit
 * tested with a bare object instead of a full database fixture.
 */
export type PluginColdStorageDb = {
    pluginCustomStorage?: {
        _coldplugin?: Record<string, string>
        [key: string]: unknown
    }
}

/**
 * Dependency-injected core of the v3 plugin API's `pluginStorage.getItem`
 * (CHORE-07 stage 7c-1, plan `Agents/Reports/13-chore07-cold-read-failure-plan.md`
 * §5.2 item 2). Factored out of `v3.svelte.ts`'s `_getPluginStorage` purely
 * so it is unit-testable without mocking that module's entire dependency
 * graph (DOMPurify, the TTS hooks, the MCP bridge, and so on) --
 * `_getPluginStorage` itself is a thin wrapper supplying the real
 * `getDatabase()` and `readColdStorageItem`.
 *
 * - no mapping for `key` -> `null` (unchanged from before 7c-1);
 * - `ok` -> the value, `?? null` (unchanged: a plugin can store `null`
 *   itself, and this keeps collapsing that to `null` on the way out, same
 *   as before);
 * - `missing` -> `null`;
 * - `error` -> throws an `Error` naming `key`, but never the (possibly
 *   unreadable, or simply absent) value.
 */
export async function readPluginStorageValue(
    db: PluginColdStorageDb,
    key: string,
    readColdStorageItemFn: (coldId: string) => Promise<ColdStorageReadResult>,
): Promise<unknown> {
    const coldId = db.pluginCustomStorage?._coldplugin?.[key]
    if (!coldId) {
        return null
    }
    const result = await readColdStorageItemFn(coldId)
    if (result.status === 'missing') {
        return null
    }
    if (result.status === 'error') {
        throw new Error(`Failed to read plugin storage for key: ${key}`)
    }
    return result.value ?? null
}

/**
 * Dependency-injected core of `pluginStorage.setItem` (plan §5.2 item 2).
 *
 * - `value === undefined` is stored as `null` instead. `JSON.stringify`
 *   returns `undefined` (not a string) for `undefined`, and passing that to
 *   `TextEncoder.encode` hits its default parameter, encoding the empty
 *   string -- fflate still wraps that into a small but non-empty compressed
 *   blob, so the write itself would "succeed". The failure shows up only on
 *   the way back out: decompressing yields an empty string, and
 *   `JSON.parse('')` throws, so the blob would read back as `'error'`
 *   forever (a decode failure). Storing `null` instead avoids writing that
 *   unreadable blob at all, and `readPluginStorageValue` already turns a
 *   stored `null` back into `null` for plugins, so this is not an
 *   observable change for them.
 * - a failed write (`setColdStorageItemFn` resolving `false`) throws, and
 *   leaves `db`'s mapping untouched -- an existing mapping is left alone,
 *   and a brand-new key never gets one.
 * - a brand-new key's mapping is written only after the write succeeds, and
 *   into whatever `pluginCustomStorage._coldplugin` object `getLiveDb()`
 *   returns AT THAT POINT, not the one read from `db` at the top of this
 *   call -- `_clearPluginStorage` may have replaced `_coldplugin` with a
 *   fresh object while the write was in flight, and writing into the
 *   object captured before the `await` would silently undo that clear.
 */
export async function writePluginStorageValue(
    db: PluginColdStorageDb,
    getLiveDb: () => PluginColdStorageDb,
    key: string,
    value: unknown,
    setColdStorageItemFn: (coldId: string, value: unknown) => Promise<boolean>,
    newColdId: () => string,
): Promise<void> {
    db.pluginCustomStorage ??= {}
    db.pluginCustomStorage._coldplugin ??= {}
    // Falsy, not nullish: matches the pre-7c-1 `_setPluginStorage`'s
    // `if(!coldId)` check, so a stray empty-string mapping is treated the
    // same as no mapping (a fresh id is generated) rather than being reused
    // as a cold-storage key.
    const existingColdId = db.pluginCustomStorage._coldplugin[key]
    const coldId = existingColdId || newColdId()

    const writeSuccess = await setColdStorageItemFn(coldId, value === undefined ? null : value)

    if (!writeSuccess) {
        throw new Error(`Failed to write plugin storage for key: ${key}`)
    }

    if (!existingColdId) {
        const liveDb = getLiveDb()
        liveDb.pluginCustomStorage ??= {}
        liveDb.pluginCustomStorage._coldplugin ??= {}
        liveDb.pluginCustomStorage._coldplugin[key] = coldId
    }
}
