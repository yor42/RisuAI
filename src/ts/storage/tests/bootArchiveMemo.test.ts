/**
 * The device memo of the boot archive pass (`src/ts/storage/bootArchiveMemo.ts`):
 * which characters the pass skipped and whether the Node server refused the
 * commit as too large, kept in `localStorage` so the next boot reads it before
 * the database is installed.
 *
 * `localStorage` is the happy-dom one, or a stand-in that throws; nothing here
 * says anything about a browser's storage quota or about private browsing
 * modes. Every test here asserts behaviour only the memo module has.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    clearArchiveMemo,
    readArchiveMemo,
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
