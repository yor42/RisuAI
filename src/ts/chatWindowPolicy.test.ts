import { describe, expect, test } from 'vitest'
import { chatWindowKey, createChatWindowPolicy, runWithFullWindow } from './chatWindowPolicy'

// A tiny factory so each test gets its own policy instance with independently
// controllable `initial()` and `editorsOpen()` behaviour, without any shared
// module-level state to reset between tests.
function makePolicy(opts: { initial?: number; editorsOpen?: boolean } = {}) {
    const state = {
        initial: opts.initial ?? 30,
        editorsOpen: opts.editorsOpen ?? false,
    }
    const policy = createChatWindowPolicy({
        initial: () => state.initial,
        editorsOpen: () => state.editorsOpen,
    })
    return { policy, state }
}

// A promise plus its resolve/reject, so a test can control exactly when an
// in-flight `fn` passed to `runWithFullWindow` settles -- needed to make two
// screenshot captures genuinely overlap (the second starts before the first
// resolves), e.g. a double click on the screenshot button.
function createDeferred<T = void>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

describe('chatWindowKey', () => {
    test('uses the character id plus the chat id when the chat has a string id', () => {
        expect(chatWindowKey('char1', { id: 'c1' })).toBe('char1:c1')
    })

    test('an undefined chat gives a stable "none" key', () => {
        expect(chatWindowKey('char1', undefined)).toBe('char1:none')
    })

    test('the same id-less chat object yields the same key on repeated calls', () => {
        const chat = {}

        const first = chatWindowKey('char1', chat)
        const second = chatWindowKey('char1', chat)

        expect(first).toBe(second)
        expect(first).not.toBe('char1:none')
    })

    test('two different id-less chat objects yield different keys', () => {
        const a = chatWindowKey('char1', {})
        const b = chatWindowKey('char1', {})

        expect(a).not.toBe(b)
    })

    test('the same chat (with an id) under another character yields a different key', () => {
        const chat = { id: 'c1' }

        expect(chatWindowKey('charA', chat)).toBe('charA:c1')
        expect(chatWindowKey('charB', chat)).toBe('charB:c1')
        expect(chatWindowKey('charA', chat)).not.toBe(chatWindowKey('charB', chat))
    })
})

describe('createChatWindowPolicy: onKey', () => {
    test('the first call ever records the key without lowering, even when current is far above initial', () => {
        const { policy } = makePolicy({ initial: 30 })

        const result = policy.onKey('char1:c1', 600)

        expect(result).toEqual({ next: 600, lowered: false })
    })

    test('a key change with no editors open resets to the initial value', () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 600)

        const result = policy.onKey('char1:c2', 600)

        expect(result).toEqual({ next: 30, lowered: true })
    })

    test('a key change while an editor is open does not reset', () => {
        const { policy } = makePolicy({ initial: 30, editorsOpen: true })
        policy.onKey('char1:c1', 600)

        const result = policy.onKey('char1:c2', 600)

        expect(result).toEqual({ next: 600, lowered: false })
    })

    test('the same key never resets, even as current has grown', () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        const result = policy.onKey('char1:c1', 600)

        expect(result).toEqual({ next: 600, lowered: false })
    })

    test('lowered is false when the initial value does not lower current (30 -> 30)', () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        const result = policy.onKey('char1:c2', 30)

        expect(result).toEqual({ next: 30, lowered: false })
    })

    test('lowered is true when the initial value lowers current (600 -> 30)', () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 600)

        const result = policy.onKey('char1:c2', 600)

        expect(result).toEqual({ next: 30, lowered: true })
    })

    test('the last-seen key updates even during a skipped change, so returning to an earlier key still resets once editors close', () => {
        const { policy, state } = makePolicy({ initial: 30 })

        policy.onKey('char1:A', 30) // first call: records A

        state.editorsOpen = true
        const skipped = policy.onKey('char1:B', 600) // A -> B, but editors are open: skipped
        expect(skipped).toEqual({ next: 600, lowered: false })

        state.editorsOpen = false
        // The last-seen key is now B (recorded during the skip above), so
        // going back to A is itself a change, detected now that editors are
        // closed -- not treated as "still on A" from the very first call.
        const backToA = policy.onKey('char1:A', 600)
        expect(backToA).toEqual({ next: 30, lowered: true })
    })
})

describe('createChatWindowPolicy: screenshot', () => {
    test('endScreenshot with no key change restores the pre-screenshot value', () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        policy.beginScreenshot(45)
        const result = policy.endScreenshot()

        expect(result).toBe(45)
    })

    test('a key change during the screenshot restores the initial value instead of the pre-screenshot value', () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        policy.beginScreenshot(Infinity)
        policy.onKey('char1:c2', Infinity) // key changes while the screenshot is active

        const result = policy.endScreenshot()

        expect(result).toBe(30)
    })

    test('endScreenshot with an editor open stores a pending restore and returns null; onDraftsChanged applies it once editors close', () => {
        const { policy, state } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        policy.beginScreenshot(45)
        state.editorsOpen = true

        expect(policy.endScreenshot()).toBeNull()

        // Editors are still open: nothing to apply yet.
        expect(policy.onDraftsChanged()).toBeNull()

        state.editorsOpen = false
        expect(policy.onDraftsChanged()).toBe(45)

        // The pending restore was consumed: a second call finds nothing pending.
        expect(policy.onDraftsChanged()).toBeNull()
    })

    test('onKey performing a reset clears a pending restore', () => {
        const { policy, state } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        policy.beginScreenshot(45)
        state.editorsOpen = true
        expect(policy.endScreenshot()).toBeNull() // pending restore: 45

        // Editors close, but a genuine chat-switch reset runs before
        // onDraftsChanged gets a chance to apply the pending restore.
        state.editorsOpen = false
        policy.onKey('char1:c2', 30)

        // The stale pending value from the screenshot must not resurface later.
        expect(policy.onDraftsChanged()).toBeNull()
    })
})

describe('runWithFullWindow', () => {
    test('sets the window to Infinity during fn, then restores the pre-screenshot value on success', async () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 45
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        let duringCall: number | undefined
        const result = await runWithFullWindow(policy, get, set, async () => {
            duringCall = current
            return 'ok'
        })

        expect(duringCall).toBe(Infinity)
        expect(current).toBe(45)
        expect(result).toBe('ok')
    })

    test('restores the pre-screenshot value even when fn throws', async () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 45
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        await expect(
            runWithFullWindow(policy, get, set, async () => {
                throw new Error('boom')
            })
        ).rejects.toThrow('boom')

        expect(current).toBe(45)
    })

    test('does not restore while an editor is open; onDraftsChanged applies it once editors close', async () => {
        const { policy, state } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 45
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        state.editorsOpen = true
        await runWithFullWindow(policy, get, set, async () => {})

        // set() was never called with a restore value while editors were open.
        expect(current).toBe(Infinity)

        state.editorsOpen = false
        expect(policy.onDraftsChanged()).toBe(45)
    })
})

// The policy keeps only one screenshot's worth of state
// (`screenshotActive`, `screenshotPreValue`, `keyChangedDuringScreenshot`),
// not a stack or a counter, so overlapping `runWithFullWindow` calls (e.g. a
// double click on the screenshot button, where the second click fires before
// the first capture's `fn` has resolved) must not corrupt that shared state:
// the second `beginScreenshot` must not overwrite the saved pre-screenshot
// value with Infinity, and `endScreenshot` must not mark the screenshot
// inactive while another capture is still running.
describe('overlapping screenshots', () => {
    test('after both captures finish, the window is back at the value from before the first screenshot, not Infinity', async () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 30
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        const first = createDeferred()
        const second = createDeferred()

        const promise1 = runWithFullWindow(policy, get, set, () => first.promise)
        // The second capture starts before the first has resolved.
        const promise2 = runWithFullWindow(policy, get, set, () => second.promise)

        first.resolve()
        await promise1
        second.resolve()
        await promise2

        // The window must return to 30 (its value before the *first*
        // screenshot began), not Infinity and not any intermediate value.
        expect(current).toBe(30)
    })

    test('a key change after the first capture ends but before the second does not reset the window', async () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 30
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        const first = createDeferred()
        const second = createDeferred()

        const promise1 = runWithFullWindow(policy, get, set, () => first.promise)
        const promise2 = runWithFullWindow(policy, get, set, () => second.promise)

        first.resolve()
        await promise1

        // The second capture is still in flight here. A chat switch at this
        // exact moment must still be suppressed -- a screenshot (the second
        // one) is still running, even though the first one just ended.
        const result = policy.onKey('char1:c2', current)
        expect(result).toEqual({ next: current, lowered: false })

        second.resolve()
        await promise2
    })

    test('with an editor open, the restore stays pending until editors close, and applies the pre-first-screenshot value', async () => {
        const { policy, state } = makePolicy({ initial: 30, editorsOpen: true })
        policy.onKey('char1:c1', 30)

        let current = 30
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        const first = createDeferred()
        const second = createDeferred()

        const promise1 = runWithFullWindow(policy, get, set, () => first.promise)
        const promise2 = runWithFullWindow(policy, get, set, () => second.promise)

        first.resolve()
        await promise1
        second.resolve()
        await promise2

        state.editorsOpen = false
        // The pending restore must resolve to 30 -- the value from before the
        // first screenshot -- once editors close.
        expect(policy.onDraftsChanged()).toBe(30)
    })

    test('one capture throwing still lets the other restore the pre-first-screenshot value', async () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 30
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        const first = createDeferred()
        const second = createDeferred<void>()

        const promise1 = runWithFullWindow(policy, get, set, () => first.promise)
        const promise2 = runWithFullWindow(policy, get, set, () => second.promise)

        second.reject(new Error('boom'))
        await expect(promise2).rejects.toThrow('boom')

        first.resolve()
        await promise1

        // Once both captures have settled (one via a throw), the window
        // belongs back at its pre-first-screenshot value, 30.
        expect(current).toBe(30)
    })
})

// A key change while editors are open must not let a stale pending restore
// (left by a screenshot on the chat just left) survive to be applied to the
// new chat once editors close -- it must fall back to the new chat's initial
// value instead.
describe('pending restore across a key change', () => {
    test('a key change while a restore is pending applies the initial value once editors close, not the stale pre-screenshot value', () => {
        const { policy, state } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        policy.beginScreenshot(45)
        state.editorsOpen = true
        expect(policy.endScreenshot()).toBeNull() // pending restore: 45, still on c1

        // A switch to a different chat while the editor is still open --
        // onKey skips the reset (editor open), but the pending 45 belongs to
        // c1, not c2.
        policy.onKey('char1:c2', 30)

        state.editorsOpen = false
        // 45 belonged to the chat we've since left. Applying it to c2 would
        // give c2 the wrong window size, so it must fall back to the initial
        // value instead.
        expect(policy.onDraftsChanged()).toBe(30)
    })
})

describe('screenshot restore and key-change edge cases', () => {
    test('restores the pre-screenshot value, not the initial value', async () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 45
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        await runWithFullWindow(policy, get, set, async () => {})

        // The restore must use the saved pre-screenshot value (45), not
        // initial() (30).
        expect(current).toBe(45)
    })

    test('restores the window even when fn throws', async () => {
        const { policy } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 45
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        await expect(
            runWithFullWindow(policy, get, set, async () => {
                throw new Error('boom')
            })
        ).rejects.toThrow('boom')

        // The restore must run even when fn() throws (i.e. from a `finally`),
        // not only after a successful fn() call.
        expect(current).toBe(45)
    })

    test('withholds the restore while an editor is open, even immediately after endScreenshot', async () => {
        const { policy, state } = makePolicy({ initial: 30 })
        policy.onKey('char1:c1', 30)

        let current = 45
        const get = () => current
        const set = (n: number) => {
            current = n
        }

        state.editorsOpen = true
        await runWithFullWindow(policy, get, set, async () => {})

        // The restore must respect editorsOpen(): set(45) must not be called
        // here in addition to the earlier set(Infinity), so current stays at
        // Infinity.
        expect(current).toBe(Infinity)
    })

    test('collapses two chat objects that share the same id into the same key', () => {
        const chatA = { id: 'c1' }
        const chatB = { id: 'c1' } // a different object, same id (e.g. after a cold-storage reload)

        // The key must derive from the string id, not object identity, so two
        // distinct objects sharing an id collapse to the same key (keying on
        // the chat object itself, e.g. a WeakMap, would return two different
        // keys here).
        expect(chatWindowKey('char1', chatA)).toBe(chatWindowKey('char1', chatB))
    })

    test('does not lower the window on a key change while an editor is open', () => {
        const { policy } = makePolicy({ initial: 30, editorsOpen: true })
        policy.onKey('char1:c1', 600)

        const result = policy.onKey('char1:c2', 600)

        // The editorsOpen() check on the reset branch must hold, or this
        // would instead return { next: 30, lowered: true }.
        expect(result).toEqual({ next: 600, lowered: false })
    })
})
