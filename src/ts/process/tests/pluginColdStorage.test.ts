/**
 * CHORE-07 stage 7c-1 -- `readPluginStorageValue`/`writePluginStorageValue`
 * (`src/ts/plugins/apiV3/pluginColdStorage.ts`), the dependency-injected
 * core of the v3 plugin API's `pluginStorage.getItem`/`setItem`.
 * Agents/Reports/13-chore07-cold-read-failure-plan.md §5.2 item 2, §5.5.
 *
 * These two functions are new in this stage. On pre-7c-1 (92b9bba7),
 * `_getPluginStorage`/`_setPluginStorage` in `v3.svelte.ts` called
 * `getColdStorageItem`/`setColdStorageItem` directly, inline, with no
 * three-way result, no failure classification, and no re-read-after-await
 * for the mapping -- there was nothing here to import at all, so every RED
 * case below is RED for the same structural reason as
 * `coldStorageDeletionGuards.svelte.test.ts`'s `isColdChat` group: the
 * import itself does not resolve on pre-7c-1, so calling either function
 * throws `TypeError: readPluginStorageValue is not a function` (or the
 * `writePluginStorageValue` equivalent) rather than failing a behavioural
 * assertion. That import error is this file's red-before-green evidence,
 * confirmed by running this file against pre-7c-1 `v3.svelte.ts`/pre-7c-1
 * (this file did not exist there at all) before `pluginColdStorage.ts` was
 * added. Two cases below ("no mapping" and a "missing" read) are labelled
 * CHAR instead, even though the import itself still fails pre-7c-1: the
 * BEHAVIOUR they assert (resolving `null`) is unchanged from the old inline
 * code, so once the extraction lands they are regression guards, not
 * evidence of a stage-7c-1 behaviour change.
 *
 * No mocking is needed: both functions take every external dependency
 * (`getLiveDb`, `readColdStorageItemFn`, `setColdStorageItemFn`,
 * `newColdId`) as a plain parameter.
 */
import { describe, test, expect, vi } from 'vitest'
import { readPluginStorageValue, writePluginStorageValue, type PluginColdStorageDb } from '../../plugins/apiV3/pluginColdStorage'
import type { ColdStorageReadResult } from '../coldstorage.svelte'

describe('CHORE-07 stage 7c-1: readPluginStorageValue', () => {
    test('CHAR: no mapping for the key resolves null without calling the reader', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        const reader = vi.fn()
        const result = await readPluginStorageValue(db, 'missing-key', reader)
        expect(result).toBeNull()
        expect(reader).not.toHaveBeenCalled()
    })

    test('CHAR: an "ok" read returns the value', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-1' } } }
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'ok', value: { a: 1 } }))
        const result = await readPluginStorageValue(db, 'k', reader)
        expect(result).toEqual({ a: 1 })
        expect(reader).toHaveBeenCalledWith('cold-id-1')
    })

    test('CHAR: an "ok" read of a stored null still returns null (not distinguished from missing)', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-null' } } }
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'ok', value: null }))
        const result = await readPluginStorageValue(db, 'k', reader)
        expect(result).toBeNull()
    })

    test('CHAR: a "missing" read resolves null', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-2' } } }
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'missing' }))
        const result = await readPluginStorageValue(db, 'k', reader)
        // CHAR, not RED: pre-7c-1 `_getPluginStorage` called
        // `getColdStorageItem` directly, which collapsed EVERY failure
        // (missing or otherwise) to `null` too -- this specific outcome is
        // unchanged by 7c-1, only how it's reached is new. (The import
        // itself still fails on pre-7c-1, since `readPluginStorageValue`
        // didn't exist there -- see the file header -- but the BEHAVIOUR
        // this asserts is a regression guard, not a stage-7c-1 change.)
        expect(result).toBeNull()
    })

    test('RED: an "error" read rejects, and the message does not contain the value', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-3' } } }
        const secretValue = 'super-secret-plugin-value-should-never-appear-in-error'
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({
            status: 'error',
            error: new Error(secretValue),
        }))

        // RED: on pre-7c-1, `getColdStorageItem` swallowed every read
        // failure and returned `null`/threw nothing distinguishable -- this
        // function did not exist at all, so the RED evidence is the import
        // failure described in the file header, not this specific
        // assertion's pre-7c-1 result.
        await expect(readPluginStorageValue(db, 'k', reader)).rejects.toThrow(/k/)
        try {
            await readPluginStorageValue(db, 'k', reader)
            expect.unreachable('expected readPluginStorageValue to throw')
        } catch (thrown) {
            const message = (thrown as Error).message
            expect(message).not.toContain(secretValue)
        }
    })
})

describe('CHORE-07 stage 7c-1: writePluginStorageValue', () => {
    test('RED: a failed write rejects', async () => {
        const db: PluginColdStorageDb = {}
        const writer = vi.fn(async () => false)
        await expect(
            writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'new-id')
        ).rejects.toThrow(/k/)
    })

    test('RED: a failed first write leaves no mapping', async () => {
        const db: PluginColdStorageDb = {}
        const writer = vi.fn(async () => false)
        await expect(
            writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'new-id')
        ).rejects.toThrow()
        expect(db.pluginCustomStorage?._coldplugin?.k).toBeUndefined()
    })

    test('CHAR: a failure with an existing mapping keeps the mapping', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'existing-id' } } }
        const writer = vi.fn(async () => false)
        await expect(
            writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'unused-new-id')
        ).rejects.toThrow()
        expect(db.pluginCustomStorage?._coldplugin?.k).toBe('existing-id')
    })

    test('CHAR: setItem(undefined) stores null instead of undefined', async () => {
        const db: PluginColdStorageDb = {}
        const writer = vi.fn(async () => true)
        await writePluginStorageValue(db, () => db, 'k', undefined, writer, () => 'new-id')
        expect(writer).toHaveBeenCalledWith('new-id', null)
    })

    test('RED: a mapping recorded after a clear during the write goes into the live object', async () => {
        const originalDb: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        // Simulates `_clearPluginStorage` replacing `_coldplugin` with a
        // brand-new object while the write below is in flight -- `getLiveDb`
        // returns a database whose `_coldplugin` is a DIFFERENT object
        // reference than the one `writePluginStorageValue` read at the top
        // of its call.
        const liveDb: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        const writer = vi.fn(async () => true)

        await writePluginStorageValue(originalDb, () => liveDb, 'k', 'v', writer, () => 'new-id')

        // RED: on pre-7c-1, the mapping was written synchronously into the
        // object captured BEFORE the write, so a same-tick clear would be
        // silently undone; this function did not exist at all pre-7c-1 (see
        // file header for why this is RED).
        expect(liveDb.pluginCustomStorage?._coldplugin?.k).toBe('new-id')
        expect(originalDb.pluginCustomStorage?._coldplugin?.k).toBeUndefined()
    })

    test('CHAR: a brand-new key is written into the same object when there was no clear', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        const writer = vi.fn(async () => true)
        await writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'new-id')
        expect(db.pluginCustomStorage?._coldplugin?.k).toBe('new-id')
    })

    test('CHAR: an existing key reuses its coldId and never calls newColdId', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'existing-id' } } }
        const writer = vi.fn(async () => true)
        const newColdId = vi.fn(() => 'should-not-be-used')
        await writePluginStorageValue(db, () => db, 'k', 'v', writer, newColdId)
        expect(writer).toHaveBeenCalledWith('existing-id', 'v')
        expect(newColdId).not.toHaveBeenCalled()
        expect(db.pluginCustomStorage?._coldplugin?.k).toBe('existing-id')
    })

    test('CHAR: a stray empty-string mapping is treated as falsy, not reused as a coldId', async () => {
        // Matches pre-7c-1 `_setPluginStorage`'s `if(!coldId)` check -- an
        // empty-string mapping (which should never legitimately exist, but
        // is still a valid object value) must not be used as a
        // cold-storage key; a fresh id is generated instead.
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: '' } } }
        const writer = vi.fn(async () => true)
        const newColdId = vi.fn(() => 'fresh-id')
        await writePluginStorageValue(db, () => db, 'k', 'v', writer, newColdId)
        expect(newColdId).toHaveBeenCalledTimes(1)
        expect(writer).toHaveBeenCalledWith('fresh-id', 'v')
        expect(db.pluginCustomStorage?._coldplugin?.k).toBe('fresh-id')
    })
})
