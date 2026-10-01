/**
 * The "Archive characters at startup" entry of the advanced settings
 * (`adv.coldstorage` in `src/ts/setting/advancedSettingsData.ts`): turning the
 * setting off forgets the device memo of the boot archive pass, so turning it
 * on again tries the skipped characters and a too-large save once more.
 *
 * The memo module is loaded inside each test that needs it, so a test that
 * does not need it is not affected by it. Tests titled `guard:` assert
 * behaviour that must not change; they pass with and without the memo. The
 * other asserts behaviour only the memo clearing has.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('src/ts/platform'))

import { advancedSettingsItems } from 'src/ts/setting/advancedSettingsData'

type MemoModule = typeof import('src/ts/storage/bootArchiveMemo')

async function memoModule(): Promise<MemoModule> {
    const path = '/src/ts/storage/bootArchiveMemo'
    return await import(/* @vite-ignore */ path) as MemoModule
}

interface ArchiveEntry {
    getValue(db: Record<string, unknown>): boolean
    setValue(db: Record<string, unknown>, value: boolean): void
}

function archiveEntry(): ArchiveEntry {
    const entry = advancedSettingsItems.find((item) => item.id === 'adv.coldstorage')
    if (!entry) {
        throw new Error('the archive entry is missing from the advanced settings')
    }
    return entry as unknown as ArchiveEntry
}

beforeEach(() => {
    localStorage.clear()
})

describe('adv.coldstorage', () => {
    test('guard: reads on unless the setting is false, and writes the value it is given', () => {
        const entry = archiveEntry()
        const db: Record<string, unknown> = {}

        expect(entry.getValue(db)).toBe(true)
        entry.setValue(db, false)
        expect(db.archiveCharacters).toBe(false)
        expect(entry.getValue(db)).toBe(false)
        entry.setValue(db, true)
        expect(db.archiveCharacters).toBe(true)
        expect(entry.getValue(db)).toBe(true)
    })

    test('turning the setting off forgets the skipped characters and the too-large save', async () => {
        const memo = await memoModule()
        memo.rememberSkipped(['a', 'b'])
        memo.rememberTooLarge()
        expect(memo.readArchiveMemo().skipped.size).toBe(2)

        archiveEntry().setValue({}, false)

        expect(memo.readArchiveMemo().skipped.size).toBe(0)
        expect(memo.readArchiveMemo().tooLarge).toBe(false)
    })

    test('guard: turning the setting off where the memo is already clear does not throw and writes nothing', async () => {
        await memoModule()

        expect(() => archiveEntry().setValue({}, false)).not.toThrow()

        expect(localStorage.length).toBe(0)
    })

    test('guard: turning the setting on writes no memo', async () => {
        await memoModule()

        archiveEntry().setValue({}, true)

        expect(localStorage.length).toBe(0)
    })
})
