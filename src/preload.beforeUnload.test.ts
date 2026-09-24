import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// This file has 14 tests. Against the previous behaviour -- a preload
// handler that checks only `isAppInitiatedReload()`, paired with a previous
// `openUrlOnWeb` that always did `window.open(url, '_blank')` with no scheme
// dispatch, no `noopener`, and no allowance call -- 8 already pass and 6
// fail. The 8 that already pass are guards, not evidence that the handoff
// allowance works:
// - "prompts again on a second beforeunload after the allowance is
//   consumed" and "prompts when no beforeunload fires before the allowance
//   expires" pass because the previous handler prompts on every beforeunload
//   that isn't app-initiated, allowance or not.
// - "prompts on a beforeunload dispatched right after the overlapping
//   handoff window is consumed" and "prompts once the second handoff window
//   elapses with no beforeunload dispatched" pass for the same reason: they
//   only assert a prompt happens, so they cannot tell a fix from a guard
//   where an earlier handoff's expiry can clear a later handoff's allowance.
// - "a genuine leave/close attempt after the handoff still prompts" passes
//   for the same reason.
// - All three tests in the "an app-initiated reload bypasses the prompt"
//   describe block pass because the previous handler already checks
//   `isAppInitiatedReload()` the same way.
// The other 6 -- "does not prompt for a beforeunload dispatched right after
// allowNextBeforeUnload", "does not prompt for a beforeunload dispatched
// just before the allowance expires", "does not prompt for the second
// handoff's beforeunload when it arrives after the first handoff's window
// would have ended", and the three `mailto:`/`MAILTO:`/`tel:` cases in
// "openUrlOnWeb mailto:/tel: handoffs suppress exactly one beforeunload
// prompt" -- are what actually distinguish the two behaviours.
//
// `preLoadCheck` in `src/preload.ts` only registers the `beforeunload`
// listener when `isWeb` is true; force that branch without depending on
// `location.hostname`.
vi.mock(import('./ts/platform'), () => ({
    isWeb: true,
}))

// `preLoadCheck()` closes over whichever `reloadGuard` module instance is
// live at call time. Each test gets a fresh instance via `vi.resetModules()`
// so the one-shot handoff allowance and the sticky app-initiated-reload flag
// never leak between tests, but that also means each test's `preLoadCheck()`
// call adds a NEW `beforeunload` listener closed over ITS OWN instance. Left
// in place, a previous test's listener would still fire (against its own,
// stale module instance) on this test's dispatch and could call
// `preventDefault` on the shared event. Every listener `preLoadCheck` adds is
// recorded here and removed in `afterEach` so exactly one listener is live
// per test.
let capturedBeforeUnloadListeners: EventListener[] = []

beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    capturedBeforeUnloadListeners = []
    const realAddEventListener = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
        if (type === 'beforeunload') {
            capturedBeforeUnloadListeners.push(listener as EventListener)
        }
        realAddEventListener(type, listener, options)
    })
})

afterEach(() => {
    for (const listener of capturedBeforeUnloadListeners) {
        window.removeEventListener('beforeunload', listener)
    }
    vi.restoreAllMocks()
    vi.useRealTimers()
})

function dispatchBeforeUnload(): Event {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
}

describe('the beforeunload prompt around a pending external handoff', () => {
    test('does not prompt for a beforeunload dispatched right after allowNextBeforeUnload', async () => {
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('prompts again on a second beforeunload after the allowance is consumed', async () => {
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()
        dispatchBeforeUnload()

        const second = dispatchBeforeUnload()

        expect(second.defaultPrevented).toBe(true)
    })

    test('prompts when no beforeunload fires before the allowance expires', async () => {
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        vi.advanceTimersByTime(3000)

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(true)
    })

    test('does not prompt for a beforeunload dispatched just before the allowance expires', async () => {
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        vi.advanceTimersByTime(2999)

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })
})

describe('overlapping allowNextBeforeUnload calls', () => {
    test("does not prompt for the second handoff's beforeunload when it arrives after the first handoff's window would have ended", async () => {
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        vi.advanceTimersByTime(2900)
        allowNextBeforeUnload()

        vi.advanceTimersByTime(150)

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('prompts on a beforeunload dispatched right after the overlapping handoff window is consumed', async () => {
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        vi.advanceTimersByTime(2900)
        allowNextBeforeUnload()

        vi.advanceTimersByTime(150)
        dispatchBeforeUnload()

        const second = dispatchBeforeUnload()

        expect(second.defaultPrevented).toBe(true)
    })

    test('prompts once the second handoff window elapses with no beforeunload dispatched', async () => {
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        vi.advanceTimersByTime(2900)
        allowNextBeforeUnload()

        vi.advanceTimersByTime(3000)

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(true)
    })
})

describe('openUrlOnWeb mailto:/tel: handoffs suppress exactly one beforeunload prompt', () => {
    test.each([
        ['mailto:a@b.c', 'mailto:a@b.c'],
        ['MAILTO:a@b.c', 'mailto:a@b.c'],
        ['tel:+123', 'tel:+123'],
    ])('%s navigates the current tab and lets its own beforeunload through unprompted', async (input, expectedHref) => {
        const { preLoadCheck } = await import('./preload')
        const { openUrlOnWeb } = await import('./ts/openUrlWeb')

        preLoadCheck()

        const fakeWin = { open: vi.fn(), location: { href: 'https://app.example/' } }
        openUrlOnWeb(input, fakeWin)

        expect(fakeWin.open).not.toHaveBeenCalled()
        expect(fakeWin.location.href).toBe(expectedHref)

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('a genuine leave/close attempt after the handoff still prompts', async () => {
        const { preLoadCheck } = await import('./preload')
        const { openUrlOnWeb } = await import('./ts/openUrlWeb')

        preLoadCheck()

        const fakeWin = { open: vi.fn(), location: { href: 'https://app.example/' } }
        openUrlOnWeb('mailto:a@b.c', fakeWin)
        dispatchBeforeUnload()

        const second = dispatchBeforeUnload()

        expect(second.defaultPrevented).toBe(true)
    })
})

describe('an app-initiated reload bypasses the prompt', () => {
    test('with no handoff pending', async () => {
        const { preLoadCheck } = await import('./preload')
        const { markAppInitiatedReload } = await import('./ts/reloadGuard')

        preLoadCheck()
        markAppInitiatedReload()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('with a handoff also pending', async () => {
        const { preLoadCheck } = await import('./preload')
        const { markAppInitiatedReload, allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        markAppInitiatedReload()
        allowNextBeforeUnload()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('is not itself consumed by a beforeunload dispatch, unlike the one-shot handoff allowance', async () => {
        const { preLoadCheck } = await import('./preload')
        const { markAppInitiatedReload } = await import('./ts/reloadGuard')

        preLoadCheck()
        markAppInitiatedReload()

        dispatchBeforeUnload()
        const second = dispatchBeforeUnload()

        expect(second.defaultPrevented).toBe(false)
    })
})
