/**
 * The strike record of the boot archive pass's crash-loop breaker
 * (`src/ts/storage/bootArchiveMemo.ts`): a count in `localStorage` that the
 * pass writes before it starts work and resets when it succeeds, and a record
 * that the user was told archiving is paused. Unlike the notice memo, which
 * fails open, the count fails closed: a count that cannot be read, a start
 * record that cannot be written and a stored value that is not a count all
 * stop the pass rather than let a crash loop run unbounded.
 *
 * `localStorage` is the happy-dom one, a stand-in that throws on every access,
 * or a Map-backed stand-in with some methods replaced. Nothing here says anything
 * about a browser's storage quota, its flush timing across a process kill or
 * private browsing modes.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    clearArchiveMemo,
    readArchiveMemo,
    readArchiveStrikes,
    recordArchiveStart,
    rememberPausedTold,
    rememberSkipped,
    rememberTooLarge,
    resetArchiveStrikes,
} from 'src/ts/storage/bootArchiveMemo'

const STRIKES_KEY = 'archivePassStrikes'
const TOLD_KEY = 'archivePassPausedTold'

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

/** A `Map`-backed storage holding `initial`, with some of its methods replaced. */
function storageWith(
    initial: Record<string, string>,
    overrides: { getItem?: (key: string) => string | null, setItem?: (key: string, value: string) => void, removeItem?: (key: string) => void } = {},
): { storage: Storage, data: Map<string, string> } {
    const data = new Map<string, string>(Object.entries(initial))
    const storage = {
        get length(): number { return data.size },
        key: (index: number) => [...data.keys()][index] ?? null,
        getItem: overrides.getItem ?? ((key: string) => data.get(key) ?? null),
        setItem: overrides.setItem ?? ((key: string, value: string) => { data.set(key, value) }),
        removeItem: overrides.removeItem ?? ((key: string) => { data.delete(key) }),
        clear: () => data.clear(),
    } as unknown as Storage
    return { storage, data }
}

describe('the strike count of the boot archive pass', () => {
    test('reads as none on a device that has never written it', () => {
        expect(readArchiveStrikes()).toBe('none')
    })

    test.each([
        ['0', 'none'],
        ['1', 'one'],
        ['2', 'paused'],
        ['3', 'paused'],
        ['12', 'paused'],
    ] as const)('a stored count of %s reads as %s', (stored, expected) => {
        localStorage.setItem(STRIKES_KEY, stored)

        expect(readArchiveStrikes()).toBe(expected)
    })

    test.each(['x', 'abc', '-1', '1.5', '', ' ', ' 1', '1 ', 'NaN', 'Infinity', '1e3', '0x1', '[]', '{"a":1}', 'null', 'true'])('a stored value of %j is not a count and reads as paused', (stored) => {
        localStorage.setItem(STRIKES_KEY, stored)

        expect(readArchiveStrikes()).toBe('paused')
    })

    test('reads as unreadable, not as none, when localStorage throws', () => {
        localStorage.setItem(STRIKES_KEY, '1')
        vi.stubGlobal('localStorage', throwingStorage())

        expect(readArchiveStrikes()).toBe('unreadable')
    })

    test('reads as unreadable when only the read throws', () => {
        vi.stubGlobal('localStorage', storageWith({ [STRIKES_KEY]: '1' }, { getItem: () => { throw new Error('storage blocked') } }).storage)

        expect(readArchiveStrikes()).toBe('unreadable')
    })

    test('answers at once, so a caller that cannot wait can read it', () => {
        expect(typeof readArchiveStrikes()).toBe('string')
    })
})

describe('the start record of the boot archive pass', () => {
    test('takes a clean device to one strike and one strike to two, and says it was written', () => {
        expect(recordArchiveStart()).toBe(true)
        expect(readArchiveStrikes()).toBe('one')
        expect(localStorage.getItem(STRIKES_KEY)).toBe('1')

        expect(recordArchiveStart()).toBe(true)
        expect(readArchiveStrikes()).toBe('paused')
        expect(localStorage.getItem(STRIKES_KEY)).toBe('2')
    })

    test('takes a stored zero to one', () => {
        localStorage.setItem(STRIKES_KEY, '0')

        expect(recordArchiveStart()).toBe(true)
        expect(localStorage.getItem(STRIKES_KEY)).toBe('1')
    })

    test.each(['2', '3', 'x', '-1', '1.5', ''])('a stored value of %j is paused: nothing is written and it says so', (stored) => {
        localStorage.setItem(STRIKES_KEY, stored)

        expect(recordArchiveStart()).toBe(false)
        expect(localStorage.getItem(STRIKES_KEY)).toBe(stored)
    })

    test('says it was not written, and does not throw, when localStorage throws', () => {
        vi.stubGlobal('localStorage', throwingStorage())

        expect(() => recordArchiveStart()).not.toThrow()
        expect(recordArchiveStart()).toBe(false)
    })

    test('says it was not written, and does not throw, when only the write throws', () => {
        const { storage, data } = storageWith({}, { setItem: () => { throw new Error('quota exceeded') } })
        vi.stubGlobal('localStorage', storage)

        expect(() => recordArchiveStart()).not.toThrow()
        expect(recordArchiveStart()).toBe(false)
        expect(data.size).toBe(0)
    })

    test('says it was not written when the write is dropped without an error', () => {
        const { storage, data } = storageWith({}, { setItem: () => { } })
        vi.stubGlobal('localStorage', storage)

        expect(recordArchiveStart()).toBe(false)
        expect(readArchiveStrikes()).toBe('none')
        expect(data.size).toBe(0)
    })

    test('says it was not written, and writes nothing, when the stored count cannot be read first', () => {
        const { storage, data } = storageWith({ [STRIKES_KEY]: '1' }, { getItem: () => { throw new Error('storage blocked') } })
        vi.stubGlobal('localStorage', storage)

        expect(recordArchiveStart()).toBe(false)
        expect(data.get(STRIKES_KEY)).toBe('1')
    })

    test('writes only keys of the archive pass prefix and nothing about a character', () => {
        localStorage.setItem('unrelated-key', 'kept')

        recordArchiveStart()
        rememberPausedTold()

        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            keys.push(localStorage.key(i) as string)
        }
        expect(keys.filter((key) => key !== 'unrelated-key').every((key) => key.startsWith('archivePass'))).toBe(true)
        expect(localStorage.getItem('unrelated-key')).toBe('kept')
    })
})

describe('the success reset of the boot archive pass', () => {
    test.each(['1', '2', '0', 'x'])('takes a stored %j to none', (stored) => {
        localStorage.setItem(STRIKES_KEY, stored)

        resetArchiveStrikes()

        expect(readArchiveStrikes()).toBe('none')
    })

    test('leaves other storage keys and the told record alone', () => {
        localStorage.setItem('unrelated-key', 'kept')
        localStorage.setItem(STRIKES_KEY, '1')
        rememberPausedTold()

        resetArchiveStrikes()

        expect(localStorage.getItem('unrelated-key')).toBe('kept')
        expect(readArchiveMemo().pausedTold).toBe(true)
    })

    test('is logged and ignored when localStorage throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
        const error = vi.spyOn(console, 'error').mockImplementation(() => { })
        vi.stubGlobal('localStorage', throwingStorage())

        expect(() => resetArchiveStrikes()).not.toThrow()
        expect(warn.mock.calls.length + error.mock.calls.length).toBeGreaterThanOrEqual(1)
    })
})

describe('the told record of the boot archive pass', () => {
    test('is not set on a device that has never written it', () => {
        expect(readArchiveMemo().pausedTold).toBe(false)
    })

    test('is set once the paused notice has been posted, apart from the other memos', () => {
        rememberPausedTold()

        const memo = readArchiveMemo()
        expect(memo.pausedTold).toBe(true)
        expect(memo.skipped.size).toBe(0)
        expect(memo.tooLarge).toBe(false)
        expect(readArchiveStrikes()).toBe('none')
    })

    test('leaves the skipped characters and the too-large memo unchanged', () => {
        rememberSkipped(['a'])
        rememberTooLarge()

        rememberPausedTold()

        const memo = readArchiveMemo()
        expect([...memo.skipped]).toEqual(['a'])
        expect(memo.tooLarge).toBe(true)
    })

    test('reads as not set when localStorage throws, and a write that throws is logged and ignored', () => {
        rememberPausedTold()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
        vi.stubGlobal('localStorage', throwingStorage())

        expect(readArchiveMemo().pausedTold).toBe(false)
        expect(() => rememberPausedTold()).not.toThrow()
        expect(warn).toHaveBeenCalled()
    })
})

describe('clearing the memo of the boot archive pass', () => {
    test('also forgets the strike count and the told record, and leaves other storage keys alone', () => {
        localStorage.setItem('unrelated-key', 'kept')
        rememberSkipped(['a', 'b'])
        rememberTooLarge()
        recordArchiveStart()
        recordArchiveStart()
        rememberPausedTold()
        expect(readArchiveStrikes()).toBe('paused')

        clearArchiveMemo()

        const memo = readArchiveMemo()
        expect(memo.skipped.size).toBe(0)
        expect(memo.tooLarge).toBe(false)
        expect(memo.pausedTold).toBe(false)
        expect(readArchiveStrikes()).toBe('none')
        expect(localStorage.getItem(STRIKES_KEY)).toBeNull()
        expect(localStorage.getItem(TOLD_KEY)).toBeNull()
        expect(localStorage.getItem('unrelated-key')).toBe('kept')
    })

    test('forgets a stored value that is not a count, so the setting off and on resumes archiving', () => {
        localStorage.setItem(STRIKES_KEY, 'garbage')
        expect(readArchiveStrikes()).toBe('paused')

        clearArchiveMemo()

        expect(readArchiveStrikes()).toBe('none')
        expect(recordArchiveStart()).toBe(true)
    })

    test('guard: does not throw when localStorage throws', () => {
        vi.stubGlobal('localStorage', throwingStorage())

        expect(() => clearArchiveMemo()).not.toThrow()
    })
})
