/**
 * CHORE-07 -- `readPluginStorageValue`/`writePluginStorageValue`
 * (`src/ts/plugins/apiV3/pluginColdStorage.ts`), the dependency-injected
 * core of the v3 plugin API's `pluginStorage.getItem`/`setItem`.
 *
 * No mocking is needed: both functions take every external dependency
 * (`getLiveDb`, `readColdStorageItemFn`, `setColdStorageItemFn`,
 * `newColdId`) as a plain parameter.
 */
import { describe, test, expect, vi } from 'vitest'
import { readPluginStorageValue, writePluginStorageValue, type PluginColdStorageDb } from '../../plugins/apiV3/pluginColdStorage'
import type { ColdStorageReadResult } from '../coldstorage.svelte'

describe('CHORE-07: readPluginStorageValue', () => {
    test('no mapping for the key resolves null without calling the reader', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        const reader = vi.fn()
        const result = await readPluginStorageValue(db, 'missing-key', reader)
        expect(result).toBeNull()
        expect(reader).not.toHaveBeenCalled()
    })

    test('an "ok" read returns the value', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-1' } } }
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'ok', value: { a: 1 } }))
        const result = await readPluginStorageValue(db, 'k', reader)
        expect(result).toEqual({ a: 1 })
        expect(reader).toHaveBeenCalledWith('cold-id-1')
    })

    test('an "ok" read of a stored null still returns null (not distinguished from missing)', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-null' } } }
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'ok', value: null }))
        const result = await readPluginStorageValue(db, 'k', reader)
        expect(result).toBeNull()
    })

    test('a "missing" read resolves null', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-2' } } }
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({ status: 'missing' }))
        const result = await readPluginStorageValue(db, 'k', reader)
        expect(result).toBeNull()
    })

    test('an "error" read rejects, and the message does not contain the value', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'cold-id-3' } } }
        const secretValue = 'super-secret-plugin-value-should-never-appear-in-error'
        const reader = vi.fn(async (): Promise<ColdStorageReadResult> => ({
            status: 'error',
            error: new Error(secretValue),
        }))

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

describe('CHORE-07: writePluginStorageValue', () => {
    test('a failed write rejects', async () => {
        const db: PluginColdStorageDb = {}
        const writer = vi.fn(async () => false)
        await expect(
            writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'new-id')
        ).rejects.toThrow(/k/)
    })

    test('a failed first write leaves no mapping', async () => {
        const db: PluginColdStorageDb = {}
        const writer = vi.fn(async () => false)
        await expect(
            writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'new-id')
        ).rejects.toThrow()
        expect(db.pluginCustomStorage?._coldplugin?.k).toBeUndefined()
    })

    test('a failure with an existing mapping keeps the mapping', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'existing-id' } } }
        const writer = vi.fn(async () => false)
        await expect(
            writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'unused-new-id')
        ).rejects.toThrow()
        expect(db.pluginCustomStorage?._coldplugin?.k).toBe('existing-id')
    })

    test('setItem(undefined) stores null instead of undefined', async () => {
        const db: PluginColdStorageDb = {}
        const writer = vi.fn(async () => true)
        await writePluginStorageValue(db, () => db, 'k', undefined, writer, () => 'new-id')
        expect(writer).toHaveBeenCalledWith('new-id', null)
    })

    test('a mapping recorded after a clear during the write goes into the live object', async () => {
        const originalDb: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        // Simulates `_clearPluginStorage` replacing `_coldplugin` with a
        // brand-new object while the write below is in flight -- `getLiveDb`
        // returns a database whose `_coldplugin` is a DIFFERENT object
        // reference than the one `writePluginStorageValue` read at the top
        // of its call.
        const liveDb: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        const writer = vi.fn(async () => true)

        await writePluginStorageValue(originalDb, () => liveDb, 'k', 'v', writer, () => 'new-id')

        expect(liveDb.pluginCustomStorage?._coldplugin?.k).toBe('new-id')
        expect(originalDb.pluginCustomStorage?._coldplugin?.k).toBeUndefined()
    })

    test('a brand-new key is written into the same object when there was no clear', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: {} } }
        const writer = vi.fn(async () => true)
        await writePluginStorageValue(db, () => db, 'k', 'v', writer, () => 'new-id')
        expect(db.pluginCustomStorage?._coldplugin?.k).toBe('new-id')
    })

    test('an existing key reuses its coldId and never calls newColdId', async () => {
        const db: PluginColdStorageDb = { pluginCustomStorage: { _coldplugin: { k: 'existing-id' } } }
        const writer = vi.fn(async () => true)
        const newColdId = vi.fn(() => 'should-not-be-used')
        await writePluginStorageValue(db, () => db, 'k', 'v', writer, newColdId)
        expect(writer).toHaveBeenCalledWith('existing-id', 'v')
        expect(newColdId).not.toHaveBeenCalled()
        expect(db.pluginCustomStorage?._coldplugin?.k).toBe('existing-id')
    })

    test('a stray empty-string mapping is treated as falsy, not reused as a coldId', async () => {
        // An empty-string mapping (which should never legitimately exist,
        // but is still a valid object value) must not be used as a
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
