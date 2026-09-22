import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
    COMPOSER_DRAFT_KIND,
    HYPA_DRAFT_KIND,
    hasLocalDrafts,
    hasMessageEditorDrafts,
    onDraftsChanged,
    registerDraft,
    resetLocalDraftsForTest,
    unregisterDraft,
} from './localDrafts'

// Stage A (A-lite) extends the plain key set into a key -> kind map, so a
// message editor's draft can be told apart from the composer's and HypaV3's.
// `resetLocalDraftsForTest()` gives every test a pristine module-level map
// without the per-test dynamic-import dance `reloadGuard.test.ts` needs for
// modules that lack a reset hook.
beforeEach(() => {
    resetLocalDraftsForTest()
})

describe('localDrafts: unchanged Set-like behaviour (hasLocalDrafts)', () => {
    test('hasLocalDrafts is false when empty', () => {
        expect(hasLocalDrafts()).toBe(false)
    })

    test('registering a key makes hasLocalDrafts true', () => {
        registerDraft('a')

        expect(hasLocalDrafts()).toBe(true)
    })

    test('double-register of the same key is idempotent', () => {
        registerDraft('a')
        registerDraft('a')
        unregisterDraft('a')

        // A single unregister must fully clear a key that was registered twice --
        // otherwise a double-register would require a double-unregister, and any
        // holder that registers once but unregisters via multiple exit paths
        // (`$effect` cleanup + a defensive `onDestroy`) would leak the key forever.
        expect(hasLocalDrafts()).toBe(false)
    })

    test('unregistering an unknown key is a safe no-op', () => {
        expect(() => unregisterDraft('never-registered')).not.toThrow()
        expect(hasLocalDrafts()).toBe(false)
    })

    test('unregistering an unknown key does not disturb other registered keys', () => {
        registerDraft('a')
        unregisterDraft('never-registered')

        expect(hasLocalDrafts()).toBe(true)
    })

    test('register -> unregister -> register round-trip', () => {
        registerDraft('a')
        unregisterDraft('a')
        expect(hasLocalDrafts()).toBe(false)

        registerDraft('a')
        expect(hasLocalDrafts()).toBe(true)
    })

    test('hasLocalDrafts stays true while at least one of several keys remains', () => {
        registerDraft('a')
        registerDraft('b')
        unregisterDraft('a')

        expect(hasLocalDrafts()).toBe(true)

        unregisterDraft('b')

        expect(hasLocalDrafts()).toBe(false)
    })

    test('module state does not leak between tests', () => {
        // If a previous test's registerDraft() call leaked past
        // resetLocalDraftsForTest(), this would observe true.
        expect(hasLocalDrafts()).toBe(false)
    })
})

describe('localDrafts: draft kinds', () => {
    test('the default kind (no argument) counts as a message editor draft', () => {
        registerDraft('a')

        expect(hasMessageEditorDrafts()).toBe(true)
    })

    test('a composer draft counts toward hasLocalDrafts but not hasMessageEditorDrafts', () => {
        registerDraft('a', COMPOSER_DRAFT_KIND)

        expect(hasLocalDrafts()).toBe(true)
        expect(hasMessageEditorDrafts()).toBe(false)
    })

    test('an "other" draft counts toward hasLocalDrafts but not hasMessageEditorDrafts', () => {
        registerDraft('a', HYPA_DRAFT_KIND)

        expect(hasLocalDrafts()).toBe(true)
        expect(hasMessageEditorDrafts()).toBe(false)
    })

    test('COMPOSER_DRAFT_KIND is "composer" and HYPA_DRAFT_KIND is "other"', () => {
        expect(COMPOSER_DRAFT_KIND).toBe('composer')
        expect(HYPA_DRAFT_KIND).toBe('other')
    })

    test('unregistering the last message draft makes hasMessageEditorDrafts false', () => {
        registerDraft('a') // default kind: 'message'
        registerDraft('b', COMPOSER_DRAFT_KIND)

        unregisterDraft('a')

        expect(hasMessageEditorDrafts()).toBe(false)
        // The composer draft is untouched.
        expect(hasLocalDrafts()).toBe(true)
    })

    test('re-registering the same key with a different kind: the last registration wins', () => {
        registerDraft('a', 'message')
        registerDraft('a', COMPOSER_DRAFT_KIND)

        // The key is now recorded as a composer draft, not a message draft --
        // the second call replaced the kind rather than adding a second entry.
        expect(hasMessageEditorDrafts()).toBe(false)
        expect(hasLocalDrafts()).toBe(true)

        registerDraft('a', 'message')

        expect(hasMessageEditorDrafts()).toBe(true)
    })

    test('several message drafts: hasMessageEditorDrafts stays true until the last one unregisters', () => {
        registerDraft('a')
        registerDraft('b')

        unregisterDraft('a')
        expect(hasMessageEditorDrafts()).toBe(true)

        unregisterDraft('b')
        expect(hasMessageEditorDrafts()).toBe(false)
    })
})

describe('localDrafts: onDraftsChanged', () => {
    test('the listener is called after a registration that adds a new key', () => {
        const listener = vi.fn()
        onDraftsChanged(listener)

        registerDraft('a')

        expect(listener).toHaveBeenCalledTimes(1)
    })

    test('the listener is called after an unregistration that removes a key', () => {
        registerDraft('a')
        const listener = vi.fn()
        onDraftsChanged(listener)

        unregisterDraft('a')

        expect(listener).toHaveBeenCalledTimes(1)
    })

    test('the listener is not called when unregistering a key that was never registered', () => {
        const listener = vi.fn()
        onDraftsChanged(listener)

        unregisterDraft('never-registered')

        expect(listener).not.toHaveBeenCalled()
    })

    test('a duplicate registration with the same kind does not call the listener again', () => {
        registerDraft('a')
        const listener = vi.fn()
        onDraftsChanged(listener)

        registerDraft('a')

        expect(listener).not.toHaveBeenCalled()
    })

    test('re-registering the same key with a different kind calls the listener', () => {
        registerDraft('a', 'message')
        const listener = vi.fn()
        onDraftsChanged(listener)

        registerDraft('a', COMPOSER_DRAFT_KIND)

        expect(listener).toHaveBeenCalledTimes(1)
    })

    test('the unsubscribe function returned by onDraftsChanged stops further calls', () => {
        const listener = vi.fn()
        const unsubscribe = onDraftsChanged(listener)

        unsubscribe()
        registerDraft('a')

        expect(listener).not.toHaveBeenCalled()
    })

    test('unsubscribing one listener does not affect another still-registered listener', () => {
        const first = vi.fn()
        const second = vi.fn()
        const unsubscribeFirst = onDraftsChanged(first)
        onDraftsChanged(second)

        unsubscribeFirst()
        registerDraft('a')

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })
})
