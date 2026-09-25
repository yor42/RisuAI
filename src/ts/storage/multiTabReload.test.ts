import { describe, expect, it } from 'vitest'

import {
    AUTO_RELOAD_BURST_WINDOW_MS,
    AUTO_RELOAD_HISTORY_KEY,
    AUTO_RELOAD_MAX_BURST,
    AUTO_RELOAD_MIN_INTERVAL_MS,
    PROMPT_RENOTIFY_MS,
    getMultiTabAction,
    isRevisionAwareBackend,
    nextAutoReloadHistory,
    readAutoReloadHistory,
    resolvePromptChoice,
    resolveRevisionAwarePromptChoice,
    shouldRetainOtherTabSavedSignal,
    writeAutoReloadHistory,
    type AutoReloadHistory,
    type MultiTabAction,
} from './multiTabReload'

const now = 10_000_000_000

function makeStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial))
    return {
        get length() {
            return data.size
        },
        clear: () => data.clear(),
        getItem: (key: string) => (data.has(key) ? data.get(key) : null) ?? null,
        key: (index: number) => Array.from(data.keys())[index] ?? null,
        removeItem: (key: string) => { data.delete(key) },
        setItem: (key: string, value: string) => { data.set(key, value) },
    }
}

function makeThrowingStorage(): Storage {
    return {
        get length() {
            return 0
        },
        clear: () => { throw new Error('unavailable') },
        getItem: () => { throw new Error('unavailable') },
        key: () => { throw new Error('unavailable') },
        removeItem: () => { throw new Error('unavailable') },
        setItem: () => { throw new Error('unavailable') },
    }
}

describe('getMultiTabAction', () => {
    it('auto-reloads when clean with no history', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('auto-reload')
    })

    it('stays when clean but the last auto-reload was 5s ago', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now - 5000, burst: 1 },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('stay')
    })

    it('auto-reloads when clean, 20s since the last reload, and burst is below the cap', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now - 20000, burst: 1 },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('auto-reload')
    })

    it('stays when the burst cap was hit inside the burst window, even past the min interval', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now - 30000, burst: AUTO_RELOAD_MAX_BURST },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('stay')
    })

    it('auto-reloads again once the burst window has fully elapsed', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now - AUTO_RELOAD_BURST_WINDOW_MS - 1, burst: AUTO_RELOAD_MAX_BURST },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('auto-reload')
    })

    it('auto-reloads at the exact burst window boundary (elapsed == window is not < window)', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now - AUTO_RELOAD_BURST_WINDOW_MS, burst: AUTO_RELOAD_MAX_BURST },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('auto-reload')
    })

    it('prompts when dirty and never prompted before', () => {
        expect(getMultiTabAction({
            dirty: true,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('prompt')
    })

    it('stays when dirty and prompted 5s ago', () => {
        expect(getMultiTabAction({
            dirty: true,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: now - 5000,
            hasLocalDraft: false,
        })).toBe('stay')
    })

    it('prompts again when dirty and last prompted 2 minutes ago (never permanently disarmed)', () => {
        expect(getMultiTabAction({
            dirty: true,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: now - 2 * PROMPT_RENOTIFY_MS,
            hasLocalDraft: false,
        })).toBe('prompt')
    })

    it('clock skew: a future lastAt (negative elapsed) still keeps the burst cap enforced', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now + 5000, burst: AUTO_RELOAD_MAX_BURST },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('stay')
    })

    it('clock skew: a future lastPromptAt (negative elapsed) does not force a re-prompt', () => {
        expect(getMultiTabAction({
            dirty: true,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: now + 5000,
            hasLocalDraft: false,
        })).toBe('stay')
    })

    it('stays when clean but a local draft is in progress, even with fresh history', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: null,
            hasLocalDraft: true,
        })).toBe('stay')
    })

    it('a local draft must never suppress the conflict prompt when dirty (ordering guard)', () => {
        expect(getMultiTabAction({
            dirty: true,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: null,
            hasLocalDraft: true,
        })).toBe('prompt')
    })

    it('a local draft does not defeat the renotify window when dirty and recently prompted', () => {
        expect(getMultiTabAction({
            dirty: true,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: now - 5000,
            hasLocalDraft: true,
        })).toBe('stay')
    })

    it('stays clean with no history when hasLocalDraft is false (regression guard)', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: null, burst: 0 },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('auto-reload')
    })

    it('a local draft still wins over an already-exhausted burst cap', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now - 30000, burst: AUTO_RELOAD_MAX_BURST },
            lastPromptAt: null,
            hasLocalDraft: true,
        })).toBe('stay')
    })
})

describe('shouldRetainOtherTabSavedSignal', () => {
    it('retains the signal when clean with a local draft producing stay', () => {
        expect(shouldRetainOtherTabSavedSignal({
            action: 'stay',
            dirty: false,
            hasLocalDraft: true,
        })).toBe(true)
    })

    it('does not retain when the action is auto-reload', () => {
        expect(shouldRetainOtherTabSavedSignal({
            action: 'auto-reload',
            dirty: false,
            hasLocalDraft: false,
        })).toBe(false)
    })

    it('does not retain when the action is prompt', () => {
        expect(shouldRetainOtherTabSavedSignal({
            action: 'prompt',
            dirty: true,
            hasLocalDraft: true,
        })).toBe(false)
    })

    it('does not retain a dirty stay (the renotify-window case), even with a local draft', () => {
        // This 'stay' is caused by the recently-prompted renotify window, not by the
        // draft -- it must keep re-arming only on a fresh peer broadcast, per the
        // existing "consumed, never latched" behaviour for dirty tabs.
        expect(shouldRetainOtherTabSavedSignal({
            action: 'stay',
            dirty: true,
            hasLocalDraft: true,
        })).toBe(false)
    })

    it('does not retain a clean stay with no local draft (e.g. burst cap)', () => {
        expect(shouldRetainOtherTabSavedSignal({
            action: 'stay',
            dirty: false,
            hasLocalDraft: false,
        })).toBe(false)
    })

    it('does not retain when clean, no draft, and dirty is also false (sanity)', () => {
        const actions: MultiTabAction[] = ['auto-reload', 'prompt', 'stay']
        for (const action of actions) {
            expect(shouldRetainOtherTabSavedSignal({ action, dirty: false, hasLocalDraft: false })).toBe(false)
        }
    })
})

describe('nextAutoReloadHistory', () => {
    it('increments the burst count inside the burst window', () => {
        const history: AutoReloadHistory = { lastAt: now - 10000, burst: 1 }
        expect(nextAutoReloadHistory(history, now)).toEqual({ lastAt: now, burst: 2 })
    })

    it('resets the burst count outside the burst window', () => {
        const history: AutoReloadHistory = { lastAt: now - AUTO_RELOAD_BURST_WINDOW_MS - 1, burst: 2 }
        expect(nextAutoReloadHistory(history, now)).toEqual({ lastAt: now, burst: 1 })
    })

    it('does not mutate its input', () => {
        const history: AutoReloadHistory = { lastAt: now - 10000, burst: 1 }
        const snapshot = { ...history }
        nextAutoReloadHistory(history, now)
        expect(history).toEqual(snapshot)
    })

    it('clock skew: a future lastAt is treated as inside the burst window', () => {
        const history: AutoReloadHistory = { lastAt: now + 5000, burst: 1 }
        expect(nextAutoReloadHistory(history, now)).toEqual({ lastAt: now, burst: 2 })
    })
})

describe('resolvePromptChoice', () => {
    it('maps "0" to flush', () => {
        expect(resolvePromptChoice('0')).toBe('flush')
    })

    it('maps "1" to reload', () => {
        expect(resolvePromptChoice('1')).toBe('reload')
    })

    it('maps an empty string to stay', () => {
        expect(resolvePromptChoice('')).toBe('stay')
    })

    it('maps an unrecognised numeral to stay', () => {
        expect(resolvePromptChoice('2')).toBe('stay')
    })

    it('maps a garbage string to stay', () => {
        expect(resolvePromptChoice('nonsense')).toBe('stay')
    })
})

describe('isRevisionAwareBackend', () => {
    it('is false for a plain localForage/OPFS backend', () => {
        expect(isRevisionAwareBackend({ isNodeServer: false })).toBe(false)
    })

    it('is true for the self-hosted Node server', () => {
        expect(isRevisionAwareBackend({ isNodeServer: true })).toBe(true)
    })
})

describe('resolveRevisionAwarePromptChoice', () => {
    it('maps "0" to reload', () => {
        expect(resolveRevisionAwarePromptChoice('0')).toBe('reload')
    })

    it('maps an empty string to stay', () => {
        expect(resolveRevisionAwarePromptChoice('')).toBe('stay')
    })

    it('maps "1" to stay, since there is no save-mine option on this path', () => {
        expect(resolveRevisionAwarePromptChoice('1')).toBe('stay')
    })

    it('maps a garbage string to stay', () => {
        expect(resolveRevisionAwarePromptChoice('nonsense')).toBe('stay')
    })
})

describe('readAutoReloadHistory', () => {
    it('returns the default for a null storage', () => {
        expect(readAutoReloadHistory(null)).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default for an undefined storage', () => {
        expect(readAutoReloadHistory(undefined)).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default when the storage throws', () => {
        expect(readAutoReloadHistory(makeThrowingStorage())).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default when the key is missing', () => {
        expect(readAutoReloadHistory(makeStorage())).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default for malformed JSON', () => {
        const storage = makeStorage({ [AUTO_RELOAD_HISTORY_KEY]: '{not json' })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default for JSON of the wrong shape', () => {
        const storage = makeStorage({ [AUTO_RELOAD_HISTORY_KEY]: JSON.stringify({ lastAt: 'nope', burst: 1 }) })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default when lastAt is negative', () => {
        const storage = makeStorage({ [AUTO_RELOAD_HISTORY_KEY]: JSON.stringify({ lastAt: -1, burst: 1 }) })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default when burst is NaN', () => {
        const storage = makeStorage({ [AUTO_RELOAD_HISTORY_KEY]: JSON.stringify({ lastAt: 1, burst: Number.NaN }) })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default when burst is fractional', () => {
        const storage = makeStorage({ [AUTO_RELOAD_HISTORY_KEY]: JSON.stringify({ lastAt: 1, burst: 1.5 }) })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: null, burst: 0 })
    })

    it('returns the default when burst is absurdly large', () => {
        const storage = makeStorage({ [AUTO_RELOAD_HISTORY_KEY]: JSON.stringify({ lastAt: 1, burst: 1e9 }) })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: null, burst: 0 })
    })

    it('reads back a well-formed history', () => {
        const storage = makeStorage({ [AUTO_RELOAD_HISTORY_KEY]: JSON.stringify({ lastAt: 42, burst: 2 }) })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: 42, burst: 2 })
    })
})

describe('writeAutoReloadHistory', () => {
    it('does nothing for a null storage', () => {
        expect(() => writeAutoReloadHistory(null, { lastAt: now, burst: 1 })).not.toThrow()
    })

    it('does not throw when the storage throws', () => {
        expect(() => writeAutoReloadHistory(makeThrowingStorage(), { lastAt: now, burst: 1 })).not.toThrow()
    })

    it('round-trips through readAutoReloadHistory', () => {
        const storage = makeStorage()
        writeAutoReloadHistory(storage, { lastAt: now, burst: 2 })
        expect(readAutoReloadHistory(storage)).toEqual({ lastAt: now, burst: 2 })
    })

    // The caller gates the actual reload on this boolean: a tab that cannot record
    // that it auto-reloaded must not auto-reload, or it would loop forever.
    it('reports false when it could not persist', () => {
        expect(writeAutoReloadHistory(null, { lastAt: now, burst: 1 })).toBe(false)
        expect(writeAutoReloadHistory(undefined, { lastAt: now, burst: 1 })).toBe(false)
        expect(writeAutoReloadHistory(makeThrowingStorage(), { lastAt: now, burst: 1 })).toBe(false)
    })

    it('reports true when it persisted', () => {
        expect(writeAutoReloadHistory(makeStorage(), { lastAt: now, burst: 1 })).toBe(true)
    })

    // A storage that accepts setItem without throwing but doesn't actually retain the
    // value (e.g. a sandboxed iframe without allow-same-origin, which gets a fresh
    // opaque origin per navigation and so silently resets on reload) must be treated
    // the same as a failed write, not reported as a successful one.
    it('reports false when setItem does not throw but the value does not persist', () => {
        const storage: Storage = {
            get length() { return 0 },
            clear: () => {},
            getItem: () => null,
            key: () => null,
            removeItem: () => {},
            setItem: () => {},
        }
        expect(writeAutoReloadHistory(storage, { lastAt: now, burst: 1 })).toBe(false)
    })

    it('checks the min interval boundary too', () => {
        expect(getMultiTabAction({
            dirty: false,
            now,
            history: { lastAt: now - AUTO_RELOAD_MIN_INTERVAL_MS, burst: 1 },
            lastPromptAt: null,
            hasLocalDraft: false,
        })).toBe('auto-reload')
    })
})
