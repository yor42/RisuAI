import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The four describe blocks immediately below have 14 tests between them.
// Against the previous behaviour -- a preload
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
// `preLoadCheck` in `src/preload.ts` registers the `beforeunload` listener
// from `isTauri` and `import.meta.env.DEV` alone -- `isWeb` has no bearing on
// that decision. Every test still states `isNodeServer` and `isWeb`
// explicitly (via `mockPlatform` below) because together they describe which
// real build target the test stands in for -- the node server, a static
// self-host, or risuai.xyz -- and because `isWeb` still gates preload's
// separate `mainpage` localStorage branch, which every `preLoadCheck()` call
// in this file also runs through. Vitest's own default for
// `import.meta.env.DEV` is `true`, so a test that never touches it would
// otherwise run as if built for the Vite dev server rather than for a
// production web, self-host, or node build; `beforeEach` below stubs `DEV`
// to `false` for every test, and a test that needs dev mode overrides it.

type PlatformOverrides = {
    isTauri?: boolean
    isNodeServer?: boolean
    isWeb?: boolean
}

// Registers `./ts/platform` for this test's own dynamic imports, defaulting
// to the web-on-risuai.xyz combination (`isTauri: false`, `isNodeServer:
// false`, `isWeb: true`). Vitest only reliably applies a `vi.doMock`
// registration for a given specifier the first time it is called after
// `vi.resetModules()`; calling it a second time in the same test (e.g. once
// from a shared default and again to override it) does not reliably take
// effect, and unreliability shows up specifically in whichever test happens
// to run last in the file. Every test in this file therefore calls this
// helper exactly once, with its own complete build-target combination.
function mockPlatform(overrides: PlatformOverrides = {}): void {
    vi.doMock(import('./ts/platform'), () => ({
        isTauri: false,
        isNodeServer: false,
        isWeb: true,
        ...overrides,
    }))
}

// `preLoadCheck()` closes over whichever `reloadGuard`/`platform` module
// instances are live at call time. Each test gets fresh instances via
// `vi.resetModules()` so the one-shot handoff allowance, the sticky
// app-initiated-reload flag, and the build-target mock never leak between
// tests, but that also means each test's `preLoadCheck()` call adds a NEW
// `beforeunload` listener closed over ITS OWN instances. Left in place, a
// previous test's listener would still fire (against its own, stale
// instances) on this test's dispatch and could call `preventDefault` on the
// shared event. Every listener `preLoadCheck` adds is recorded here and
// removed in `afterEach` so exactly one listener is live per test.
let capturedBeforeUnloadListeners: EventListener[] = []

beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubEnv('DEV', false)
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
    vi.unstubAllEnvs()
})

function dispatchBeforeUnload(): Event {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
}

describe('the beforeunload prompt around a pending external handoff', () => {
    test('does not prompt for a beforeunload dispatched right after allowNextBeforeUnload', async () => {
        mockPlatform()
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('prompts again on a second beforeunload after the allowance is consumed', async () => {
        mockPlatform()
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()
        dispatchBeforeUnload()

        const second = dispatchBeforeUnload()

        expect(second.defaultPrevented).toBe(true)
    })

    test('prompts when no beforeunload fires before the allowance expires', async () => {
        mockPlatform()
        const { preLoadCheck } = await import('./preload')
        const { allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        allowNextBeforeUnload()

        vi.advanceTimersByTime(3000)

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(true)
    })

    test('does not prompt for a beforeunload dispatched just before the allowance expires', async () => {
        mockPlatform()
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
        mockPlatform()
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
        mockPlatform()
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
        mockPlatform()
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
        mockPlatform()
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
        mockPlatform()
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
        mockPlatform()
        const { preLoadCheck } = await import('./preload')
        const { markAppInitiatedReload } = await import('./ts/reloadGuard')

        preLoadCheck()
        markAppInitiatedReload()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('with a handoff also pending', async () => {
        mockPlatform()
        const { preLoadCheck } = await import('./preload')
        const { markAppInitiatedReload, allowNextBeforeUnload } = await import('./ts/reloadGuard')

        preLoadCheck()
        markAppInitiatedReload()
        allowNextBeforeUnload()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('is not itself consumed by a beforeunload dispatch, unlike the one-shot handoff allowance', async () => {
        mockPlatform()
        const { preLoadCheck } = await import('./preload')
        const { markAppInitiatedReload } = await import('./ts/reloadGuard')

        preLoadCheck()
        markAppInitiatedReload()

        dispatchBeforeUnload()
        const second = dispatchBeforeUnload()

        expect(second.defaultPrevented).toBe(false)
    })
})

// Against a preload that registers the guard only when `isWeb` is true (the
// previous behaviour): of the 7 tests below, 3 fail and 4 pass.
// - "prompts for a plain beforeunload on the node server", "prompts for a
//   plain beforeunload on a static self-host whose hostname is not
//   risuai.xyz", and "lets a mailto: handoff through unprompted, and still
//   prompts for a later genuine leave" fail against that baseline, since it
//   never registers a listener for either build target (`isWeb` is false on
//   both).
// - "prompts for a plain beforeunload on risuai.xyz" and "registers no guard
//   on Tauri, so a beforeunload is never prevented" pass as guards: `isWeb`
//   alone already reaches the same outcome for those two build targets.
// - "lets an app-initiated reload through unprompted" also passes against
//   that baseline, but only because no listener is registered at all for
//   that build target, so any dispatch goes unprevented regardless of the
//   exemption it means to exercise.
// - "registers no guard in dev, even on a build target that would otherwise
//   get one" passes against that baseline too, but not because it checks
//   dev: its self-host mock has `isWeb: false`, which already skips
//   registration regardless of `DEV`, so against THIS baseline the test does
//   not discriminate a dev build from a non-dev one. It does discriminate a
//   different regression: it is the one test in this file that distinguishes
//   a guard gated on `!isTauri` alone from one that also excludes dev.
describe('preLoadCheck registers the beforeunload guard based on build target', () => {
    test('prompts for a plain beforeunload on the node server', async () => {
        mockPlatform({ isNodeServer: true, isWeb: false })
        const { preLoadCheck } = await import('./preload')
        preLoadCheck()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(true)
    })

    test('prompts for a plain beforeunload on a static self-host whose hostname is not risuai.xyz', async () => {
        mockPlatform({ isWeb: false })
        const { preLoadCheck } = await import('./preload')
        preLoadCheck()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(true)
    })

    test('prompts for a plain beforeunload on risuai.xyz', async () => {
        mockPlatform()
        const { preLoadCheck } = await import('./preload')
        preLoadCheck()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(true)
    })

    test('registers no guard on Tauri, so a beforeunload is never prevented', async () => {
        mockPlatform({ isTauri: true, isWeb: false })
        const { preLoadCheck } = await import('./preload')
        preLoadCheck()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('registers no guard in dev, even on a build target that would otherwise get one', async () => {
        vi.stubEnv('DEV', true)
        mockPlatform({ isWeb: false })
        const { preLoadCheck } = await import('./preload')
        preLoadCheck()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })
})

describe('the guard exemptions apply on a node-server build too', () => {
    test('lets an app-initiated reload through unprompted', async () => {
        mockPlatform({ isNodeServer: true, isWeb: false })
        const { preLoadCheck } = await import('./preload')
        const { markAppInitiatedReload } = await import('./ts/reloadGuard')

        preLoadCheck()
        markAppInitiatedReload()

        const event = dispatchBeforeUnload()

        expect(event.defaultPrevented).toBe(false)
    })

    test('lets a mailto: handoff through unprompted, and still prompts for a later genuine leave', async () => {
        mockPlatform({ isNodeServer: true, isWeb: false })
        const { preLoadCheck } = await import('./preload')
        const { openUrlOnWeb } = await import('./ts/openUrlWeb')

        preLoadCheck()

        const fakeWin = { open: vi.fn(), location: { href: 'https://node-host.example/' } }
        openUrlOnWeb('mailto:a@b.c', fakeWin)

        const handoff = dispatchBeforeUnload()
        expect(handoff.defaultPrevented).toBe(false)

        const genuine = dispatchBeforeUnload()
        expect(genuine.defaultPrevented).toBe(true)
    })
})
