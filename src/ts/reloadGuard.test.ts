import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Every test needs a pristine copy of reloadGuard.ts so the module-private
// `appInitiatedReload` latch starts at its initial value -- matching the
// reset-modules + per-test dynamic import pattern used in
// src/ts/process/models/tests/local.test.ts.
beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('reloadGuard', () => {
    test('defaults to not app-initiated', async () => {
        const { isAppInitiatedReload } = await import('./reloadGuard')

        expect(isAppInitiatedReload()).toBe(false)
    })

    test('isAppInitiatedReload returns true after markAppInitiatedReload', async () => {
        const { markAppInitiatedReload, isAppInitiatedReload } = await import('./reloadGuard')

        markAppInitiatedReload()

        expect(isAppInitiatedReload()).toBe(true)
    })

    test('the flag resets back to false after the timeout elapses', async () => {
        const { markAppInitiatedReload, isAppInitiatedReload } = await import('./reloadGuard')

        markAppInitiatedReload()
        expect(isAppInitiatedReload()).toBe(true)

        vi.advanceTimersByTime(4999)
        expect(isAppInitiatedReload()).toBe(true)

        vi.advanceTimersByTime(1)
        expect(isAppInitiatedReload()).toBe(false)
    })

    test('module state does not leak between tests', async () => {
        const { isAppInitiatedReload } = await import('./reloadGuard')

        // If the previous test's `markAppInitiatedReload()` call leaked
        // through a shared module instance, this would observe `true`.
        expect(isAppInitiatedReload()).toBe(false)
    })
})
