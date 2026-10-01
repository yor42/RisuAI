/**
 * The device memo of the boot archive pass (`src/ts/storage/bootArchiveMemo.ts`):
 * which characters the pass skipped and whether the Node server refused the
 * commit as too large, kept in `localStorage` so the next boot reads it before
 * the database is installed.
 *
 * `localStorage` is the happy-dom one, or a stand-in that throws; nothing here
 * says anything about a browser's storage quota or about private browsing
 * modes. A test titled `guard:` asserts behaviour that must not change; it
 * passes with and without the stub-enrichment count. The others assert
 * behaviour only the memo module has.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    clearArchiveMemo,
    clearStubEnrichStrikes,
    readArchiveMemo,
    readArchiveStrikes,
    readStubEnrichStrikes,
    recordArchiveStart,
    recordStubEnrichStart,
    rememberSkipped,
    rememberTooLarge,
} from 'src/ts/storage/bootArchiveMemo'

beforeEach(() => {
    localStorage.clear()
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** A storage whose every access throws, as a blocked or full `localStorage` does. */
function throwingStorage(): Storage {
    const fail = (): never => { throw new Error('storage blocked') }
    return {
        get length(): number { return fail() },
        key: fail,
        getItem: fail,
        setItem: fail,
        removeItem: fail,
        clear: fail,
    } as unknown as Storage
}

describe('the device memo of the boot archive pass', () => {
    test('is empty on a device that has never written it', () => {
        const memo = readArchiveMemo()

        expect(memo.skipped.size).toBe(0)
        expect(memo.tooLarge).toBe(false)
    })

    test('remembers skipped characters across calls without forgetting the earlier ones', () => {
        rememberSkipped(['a', 'b'])
        rememberSkipped(['c'])

        expect([...readArchiveMemo().skipped].sort()).toEqual(['a', 'b', 'c'])
        expect(readArchiveMemo().tooLarge).toBe(false)
    })

    test('remembers a chaId that collides with an Object.prototype name, and no other', () => {
        const odd = ['constructor', 'toString', 'hasOwnProperty', ' spaced id ', '한글 id']

        rememberSkipped(odd)

        const memo = readArchiveMemo()
        expect([...memo.skipped].sort()).toEqual([...odd].sort())
        expect(memo.skipped.has('valueOf')).toBe(false)
    })

    test('remembers that the Node server refused the commit, apart from the skipped characters', () => {
        rememberTooLarge()

        expect(readArchiveMemo().tooLarge).toBe(true)
        expect(readArchiveMemo().skipped.size).toBe(0)
    })

    test('clearing forgets both memos and leaves other storage keys alone', () => {
        localStorage.setItem('unrelated-key', 'kept')
        rememberSkipped(['a', 'b'])
        rememberTooLarge()

        clearArchiveMemo()

        const memo = readArchiveMemo()
        expect(memo.skipped.size).toBe(0)
        expect(memo.tooLarge).toBe(false)
        expect(localStorage.getItem('unrelated-key')).toBe('kept')
    })

    test('reads as an empty memo when localStorage throws', () => {
        rememberSkipped(['a'])
        rememberTooLarge()
        vi.stubGlobal('localStorage', throwingStorage())

        const memo = readArchiveMemo()

        expect(memo.skipped.size).toBe(0)
        expect(memo.tooLarge).toBe(false)
    })

    test('ignores a write that throws, whichever operation it is', () => {
        vi.stubGlobal('localStorage', throwingStorage())

        expect(() => rememberSkipped(['a'])).not.toThrow()
        expect(() => rememberTooLarge()).not.toThrow()
        expect(() => clearArchiveMemo()).not.toThrow()
    })
})

describe('the stub-enrichment count of a profile with archiving off', () => {
    const KEY = 'stubEnrichStrikes'

    /** A storage that answers reads from `values` and silently drops every write, as one that does not persist would. */
    function forgetfulStorage(values: Record<string, string> = {}): Storage {
        return {
            get length(): number { return Object.keys(values).length },
            key: () => null,
            getItem: (key: string) => values[key] ?? null,
            setItem: () => { },
            removeItem: () => { },
            clear: () => { },
        } as unknown as Storage
    }

    test('is none on a device that has never written it', () => {
        expect(readStubEnrichStrikes()).toBe('none')
    })

    test.each([
        ['0', 'none'],
        ['1', 'one'],
        ['2', 'paused'],
        ['7', 'paused'],
    ] as const)('reads a stored %s as %s', (stored, state) => {
        localStorage.setItem(KEY, stored)

        expect(readStubEnrichStrikes()).toBe(state)
    })

    test.each(['abc', '1.5', '-1', '', 'two'])('reads a stored value that is not a whole number (%j) as paused, the same as a count of two', (stored) => {
        localStorage.setItem(KEY, stored)

        expect(readStubEnrichStrikes()).toBe('paused')
    })

    test('reads as unreadable when localStorage throws', () => {
        vi.stubGlobal('localStorage', throwingStorage())

        expect(readStubEnrichStrikes()).toBe('unreadable')
    })

    test('a start record takes none to one and one to two, and answers true each time', () => {
        expect(recordStubEnrichStart()).toBe(true)
        expect(localStorage.getItem(KEY)).toBe('1')
        expect(readStubEnrichStrikes()).toBe('one')

        expect(recordStubEnrichStart()).toBe(true)
        expect(localStorage.getItem(KEY)).toBe('2')
        expect(readStubEnrichStrikes()).toBe('paused')
    })

    test.each(['2', '3', 'abc'])('a start record over a paused count (%j) answers false and writes nothing', (stored) => {
        localStorage.setItem(KEY, stored)

        expect(recordStubEnrichStart()).toBe(false)

        expect(localStorage.getItem(KEY)).toBe(stored)
    })

    test('a start record answers false, without throwing, when localStorage throws', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { })
        vi.stubGlobal('localStorage', throwingStorage())

        expect(recordStubEnrichStart()).toBe(false)
    })

    test('a start record answers false when the new count does not read back', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { })
        vi.stubGlobal('localStorage', forgetfulStorage())

        expect(recordStubEnrichStart()).toBe(false)
    })

    test('a start record uses its own key and leaves the archive strike count alone', () => {
        recordStubEnrichStart()
        recordStubEnrichStart()

        expect(localStorage.getItem('archivePassStrikes')).toBeNull()
        expect(readArchiveStrikes()).toBe('none')
        recordArchiveStart()
        expect(localStorage.getItem(KEY)).toBe('2')
    })

    test('clearing removes the key, never writes zero, and leaves other keys alone', () => {
        localStorage.setItem(KEY, '1')
        localStorage.setItem('archivePassStrikes', '1')
        localStorage.setItem('unrelated-key', 'kept')

        clearStubEnrichStrikes()

        expect(localStorage.getItem(KEY)).toBeNull()
        expect(readStubEnrichStrikes()).toBe('none')
        expect(localStorage.getItem('archivePassStrikes')).toBe('1')
        expect(localStorage.getItem('unrelated-key')).toBe('kept')
    })

    test('clearing where no count is stored writes nothing', () => {
        clearStubEnrichStrikes()

        expect(localStorage.length).toBe(0)
    })

    test('clearing ignores a storage that throws', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { })
        vi.stubGlobal('localStorage', throwingStorage())

        expect(() => clearStubEnrichStrikes()).not.toThrow()
    })

    test('guard: clearing the archive memo leaves the count alone, because an archive-off boot clears the archive memo on every boot', () => {
        localStorage.setItem(KEY, '2')
        localStorage.setItem('archivePassStrikes', '2')
        localStorage.setItem('archivePassPausedTold', '1')
        rememberTooLarge()

        clearArchiveMemo()

        expect(localStorage.getItem('archivePassStrikes')).toBeNull()
        expect(localStorage.getItem('archivePassPausedTold')).toBeNull()
        expect(readArchiveMemo().tooLarge).toBe(false)
        expect(localStorage.getItem(KEY)).toBe('2')
    })
})
