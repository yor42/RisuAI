import { beforeEach, describe, expect, test } from 'vitest'
import {
    DRAFT_CONTENT_ORPHAN_KIND,
    createOrphanRegisteringDraftStore,
    draftContentOrphanGate,
} from './draftContentOrphanGate'
import { createDraftContentStore } from './draftContents'
import {
    hasLocalDrafts,
    hasMessageEditorDrafts,
    onDraftsChanged,
    resetLocalDraftsForTest,
} from './localDrafts'
import { createChatWindowPolicy } from './chatWindowPolicy'

// Report 20 §6: the multi-tab-gate half of durable drafts. Every test that
// exercises the wrapper wires its own `createOrphanRegisteringDraftStore`
// around a fresh `createDraftContentStore`, so the cap (`capMs`) can be set
// to a small, test-controlled value -- except the `DRAFT_CONTENT_ORPHAN_KIND`
// constant test, which wires no store at all, and the production-singleton
// smoke test at the end, which instead exercises `draftContentOrphanGate`
// itself, the one instance production code actually calls through. Every
// test resets the real `localDrafts` module, since this module drives that
// module's actual registry rather than a fake of it (there is nothing
// "external" or heavy to mock here: it is a plain in-memory map, exactly
// like `localDrafts.test.ts` exercises directly).
beforeEach(() => {
    resetLocalDraftsForTest()
})

const msgIdentity = (overrides: Partial<{ chatKey: string, chatId: string | undefined, index: number }> = {}) => ({
    kind: 'msg' as const,
    chatKey: 'chat-1',
    chatId: 'chatid-1',
    index: 0,
    ...overrides,
})

describe('DRAFT_CONTENT_ORPHAN_KIND is an alias for the existing "other" kind, not a new union member (§3)', () => {
    test('the constant is literally "other"', () => {
        expect(DRAFT_CONTENT_ORPHAN_KIND).toBe('other')
    })
})

describe('set() registers an orphan under a non-"message" kind (§6)', () => {
    test('setting a record makes hasLocalDrafts true but leaves hasMessageEditorDrafts false', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })

        store.set(msgIdentity(), 'typed text', 'base text', 0)

        // This is the load-bearing assertion: if the kind argument were ever
        // omitted from the underlying `registerDraft` call, it would take
        // the 'message' default and this would flip to true, pinning
        // `hasMessageEditorDrafts()` true forever -- exactly the failure
        // §3.1 warns about.
        expect(hasMessageEditorDrafts()).toBe(false)
        expect(hasLocalDrafts()).toBe(true)
    })
})

describe('the time cap releases the registration, never the record (§6, §6.1)', () => {
    test('sweeping after the cap has elapsed clears the registration', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        const identity = msgIdentity()

        store.set(identity, 'typed text', 'base text', 0)
        expect(hasLocalDrafts()).toBe(true)

        store.sweepExpiredRegistrations(1000) // exactly at the cap: "at least capMs old"

        expect(hasLocalDrafts()).toBe(false)
    })

    test('sweeping before the cap has elapsed leaves the registration in place', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        const identity = msgIdentity()

        store.set(identity, 'typed text', 'base text', 0)
        store.sweepExpiredRegistrations(999)

        expect(hasLocalDrafts()).toBe(true)
    })

    test('a swept (expired) registration leaves the record itself intact and readable', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        const identity = msgIdentity()

        store.set(identity, 'typed text', 'base text', 0)
        store.sweepExpiredRegistrations(5000)

        // The gate is released...
        expect(hasLocalDrafts()).toBe(false)
        // ...but the record itself is untouched: §6.1 keeps the two bounds
        // separate, and recoverable text is meant to outlive the gate hold.
        expect(store.get(identity, 'base text')).toEqual({ text: 'typed text', baseData: 'base text', updatedAt: expect.any(Number) })
    })
})

describe('an update re-arms the stamp (§6)', () => {
    test('re-setting the same identity resets the cap clock', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        const identity = msgIdentity()

        store.set(identity, 'first draft', 'base text', 0)
        // An update at t=900 -- if this correctly re-arms, the registration
        // is only 999ms old (not yet capped) as of t=1899, even though it
        // would be 1899ms old (long capped) measured from the original t=0.
        store.set(identity, 'second draft', 'base text', 900)

        store.sweepExpiredRegistrations(1899)

        expect(hasLocalDrafts()).toBe(true)

        // But by t=1900 the re-armed stamp (900) has aged out (1000ms since
        // the update).
        store.sweepExpiredRegistrations(1900)
        expect(hasLocalDrafts()).toBe(false)
    })
})

describe('the registration is removed when the record is deleted on base-text mismatch (§4.2, §6)', () => {
    test('a mismatched read deletes both the record and the registration immediately, without waiting for the cap', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1_000_000 })
        const identity = msgIdentity()

        store.set(identity, 'typed text', 'old base', 0)
        expect(hasLocalDrafts()).toBe(true)

        const result = store.get(identity, 'new base') // mismatch

        expect(result).toBeUndefined()
        expect(hasLocalDrafts()).toBe(false)
        expect(store.size()).toBe(0)
    })

    test('an explicit delete (e.g. a §5.4 revert) also releases the registration', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1_000_000 })
        const identity = msgIdentity()

        store.set(identity, 'typed text', 'base', 0)
        store.delete(identity)

        expect(hasLocalDrafts()).toBe(false)
    })

    test('a plain miss (never set) is a safe no-op, not an error', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })

        expect(() => store.get(msgIdentity({ chatId: 'never-set' }), 'base')).not.toThrow()
        expect(hasLocalDrafts()).toBe(false)
    })
})

describe('multiple identities are tracked independently', () => {
    test('sweeping only releases the identity whose stamp has actually expired', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        const older = msgIdentity({ chatId: 'older' })
        const newer = msgIdentity({ chatId: 'newer' })

        store.set(older, 'a', 'base', 0)
        store.set(newer, 'b', 'base', 500)

        store.sweepExpiredRegistrations(1000)

        // `older` has aged out (1000ms), `newer` has not (only 500ms).
        expect(store.get(older, 'base')).toEqual({ text: 'a', baseData: 'base', updatedAt: expect.any(Number) }) // record survives regardless
        expect(hasLocalDrafts()).toBe(true) // `newer` is still registered
    })
})

describe('clear() releases every registration this wrapper made', () => {
    test('clearing the store also unregisters every stamped key', () => {
        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        store.set(msgIdentity({ chatId: 'a' }), 'a', 'base', 0)
        store.set(msgIdentity({ chatId: 'b' }), 'b', 'base', 0)

        store.clear()

        expect(hasLocalDrafts()).toBe(false)
        expect(store.size()).toBe(0)
    })
})

describe('the cap sweep reaches chatWindowPolicy through the real localDrafts notify path, and stays benign (§6)', () => {
    test('a swept orphan registration -- not the earlier set() -- delivers an already-pending screenshot restore', () => {
        let loadPages = 10
        let editorsOpen = true
        const policy = createChatWindowPolicy({
            initial: () => 10,
            editorsOpen: () => editorsOpen,
        })
        // Mirrors DefaultChatScreen.svelte's own wiring: this listener only
        // ever assigns the restored value.
        const unsubscribe = onDraftsChanged(() => {
            const restored = policy.onDraftsChanged()
            if (restored !== null) {
                loadPages = restored
            }
        })

        policy.beginScreenshot(loadPages)
        loadPages = Infinity
        expect(policy.endScreenshot()).toBeNull() // deferred: an editor is open

        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        // Registered WHILE `editorsOpen` is still true: this set()'s own
        // `registerDraft` notification must find an editor still open and
        // stay deferred, so that the assertion below can only be satisfied
        // by the LATER sweep, not by this call.
        store.set(msgIdentity(), 'text', 'base', 0)
        expect(loadPages).toBe(Infinity) // still deferred -- set() did not deliver it

        // The editor has since closed by some path that did not itself
        // re-invoke `onDraftsChanged` -- the restore is still stuck pending.
        editorsOpen = false

        // The sweep -- and, per the assertion above, only the sweep --
        // releases the registration and fires the notification that finally
        // delivers the restore: an `unregisterDraft` call from an expired
        // sweep must still fire `notifyDraftsChanged()`, even though nothing
        // about a message editor changed.
        store.sweepExpiredRegistrations(2000)

        expect(loadPages).toBe(10)

        unsubscribe()
    })

    test('a sweep with nothing pending is a no-op for the policy', () => {
        let loadPages = 10
        const policy = createChatWindowPolicy({ initial: () => 10, editorsOpen: () => false })
        const unsubscribe = onDraftsChanged(() => {
            const restored = policy.onDraftsChanged()
            if (restored !== null) {
                loadPages = restored
            }
        })

        const store = createOrphanRegisteringDraftStore(createDraftContentStore({ maxRecords: 10 }), { capMs: 1000 })
        store.set(msgIdentity(), 'text', 'base', 0)
        store.sweepExpiredRegistrations(2000)

        // No `beginScreenshot`/`endScreenshot` ever ran in this test, so
        // there is nothing pending to restore -- `loadPages` staying at its
        // initial value is expected regardless of the sweep's own behaviour.
        expect(loadPages).toBe(10)

        unsubscribe()
    })
})

describe('the production singleton is wired to the real draftContents and localDrafts', () => {
    test('draftContentOrphanGate.set registers an orphan, and delete releases it', () => {
        const identity = msgIdentity({ chatKey: 'smoke-test-chat', chatId: 'smoke-test-id' })

        draftContentOrphanGate.set(identity, 'smoke test text', 'base')

        expect(draftContentOrphanGate.get(identity, 'base')).toEqual({ text: 'smoke test text', baseData: 'base', updatedAt: expect.any(Number) })
        expect(hasLocalDrafts()).toBe(true)
        expect(hasMessageEditorDrafts()).toBe(false)

        draftContentOrphanGate.delete(identity)

        expect(draftContentOrphanGate.get(identity, 'base')).toBeUndefined()
        expect(hasLocalDrafts()).toBe(false)
        // `draftContents.ts` exports no ready-made singleton to reach into
        // separately -- `draftContentOrphanGate.delete` above is the only
        // way to reach the one production instance that exists, and it
        // already cleared it.
    })
})
