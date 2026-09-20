import { beforeEach, describe, expect, test, vi } from 'vitest'

// Every test needs a pristine copy of localDrafts.ts so the module-private
// `localDraftKeys` set starts empty -- matching the reset-modules + per-test
// dynamic import pattern used in src/ts/reloadGuard.test.ts.
beforeEach(() => {
    vi.resetModules()
})

describe('localDrafts', () => {
    test('hasLocalDrafts is false when empty', async () => {
        const { hasLocalDrafts } = await import('./localDrafts')

        expect(hasLocalDrafts()).toBe(false)
    })

    test('registering a key makes hasLocalDrafts true', async () => {
        const { registerDraft, hasLocalDrafts } = await import('./localDrafts')

        registerDraft('a')

        expect(hasLocalDrafts()).toBe(true)
    })

    test('double-register of the same key is idempotent', async () => {
        const { registerDraft, unregisterDraft, hasLocalDrafts } = await import('./localDrafts')

        registerDraft('a')
        registerDraft('a')
        unregisterDraft('a')

        // A single unregister must fully clear a key that was registered twice --
        // otherwise a double-register would require a double-unregister, and any
        // holder that registers once but unregisters via multiple exit paths
        // (`$effect` cleanup + a defensive `onDestroy`) would leak the key forever.
        expect(hasLocalDrafts()).toBe(false)
    })

    test('unregistering an unknown key is a safe no-op', async () => {
        const { unregisterDraft, hasLocalDrafts } = await import('./localDrafts')

        expect(() => unregisterDraft('never-registered')).not.toThrow()
        expect(hasLocalDrafts()).toBe(false)
    })

    test('unregistering an unknown key does not disturb other registered keys', async () => {
        const { registerDraft, unregisterDraft, hasLocalDrafts } = await import('./localDrafts')

        registerDraft('a')
        unregisterDraft('never-registered')

        expect(hasLocalDrafts()).toBe(true)
    })

    test('register -> unregister -> register round-trip', async () => {
        const { registerDraft, unregisterDraft, hasLocalDrafts } = await import('./localDrafts')

        registerDraft('a')
        unregisterDraft('a')
        expect(hasLocalDrafts()).toBe(false)

        registerDraft('a')
        expect(hasLocalDrafts()).toBe(true)
    })

    test('hasLocalDrafts stays true while at least one of several keys remains', async () => {
        const { registerDraft, unregisterDraft, hasLocalDrafts } = await import('./localDrafts')

        registerDraft('a')
        registerDraft('b')
        unregisterDraft('a')

        expect(hasLocalDrafts()).toBe(true)

        unregisterDraft('b')

        expect(hasLocalDrafts()).toBe(false)
    })

    test('module state does not leak between tests', async () => {
        const { hasLocalDrafts } = await import('./localDrafts')

        // If a previous test's registerDraft() call leaked through a shared module
        // instance, this would observe true.
        expect(hasLocalDrafts()).toBe(false)
    })
})
