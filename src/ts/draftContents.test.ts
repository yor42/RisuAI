import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDraftContentStore, draftIdentityKey, DRAFT_CONTENT_RECORD_LIMIT } from './draftContents'
import { createOrphanRegisteringDraftStore } from './draftContentOrphanGate'

// Report 20's content store: the second of the two maps in §3 -- keyed by
// namespaced *content* identity (outliving any editor instance), as opposed
// to `localDrafts`'s per-instance liveness map. Every test that exercises a
// store builds its own via `createDraftContentStore` so the record bound
// (§6.1) can be set small for the eviction tests, without any shared
// module-level state to reset between tests -- except the `draftIdentityKey`
// tests just below, which call that pure key function directly and build no
// store at all.

describe('draftIdentityKey: namespacing (mandatory, §4)', () => {
    test('a chatId-keyed msg identity and a tr identity built from the same raw parts never collide', () => {
        const msgKey = draftIdentityKey({ kind: 'msg', chatKey: 'chat-1', chatId: 'chatid-1', index: 0 })
        const trKey = draftIdentityKey({ kind: 'tr', key: 'chat-1:chatid-1' })

        expect(msgKey).not.toBe(trKey)
    })

    test('an index-keyed msg identity (no chatId yet) and a tr identity built from the same raw parts never collide', () => {
        const msgKey = draftIdentityKey({ kind: 'msg', chatKey: 'chat-1', chatId: undefined, index: 42 })
        const trKey = draftIdentityKey({ kind: 'tr', key: 'chat-1:42' })

        expect(msgKey).not.toBe(trKey)
    })

    test('a chatId-keyed identity and an index-keyed identity for the same chatKey/index never collide', () => {
        const chatIdKey = draftIdentityKey({ kind: 'msg', chatKey: 'chat-1', chatId: '7', index: 7 })
        const indexKey = draftIdentityKey({ kind: 'msg', chatKey: 'chat-1', chatId: undefined, index: 7 })

        expect(chatIdKey).not.toBe(indexKey)
    })
})

describe('draftContents: basic set/get/clear round trips', () => {
    test('an index-keyed record (no chatId yet) round-trips while the message still has no chatId', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'chat-1', chatId: undefined, index: 7 }

        store.set(identity, 'typed text', 'base text')

        expect(store.get(identity, 'base text')).toEqual({ text: 'typed text', baseData: 'base text', updatedAt: expect.any(Number) })
    })

    test('a chatId-keyed record round-trips once both set and get use the chatId', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'chat-1', chatId: 'chatid-1', index: 2 }

        store.set(identity, 'draft text', 'base text')

        expect(store.get(identity, 'base text')).toEqual({ text: 'draft text', baseData: 'base text', updatedAt: expect.any(Number) })
    })

    test('a translation record round-trips under its own namespace', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'tr' as const, key: 'source-text-cache-key' }

        store.set(identity, 'translated draft', 'source text')

        expect(store.get(identity, 'source text')).toEqual({ text: 'translated draft', baseData: 'source text', updatedAt: expect.any(Number) })
    })

    test('getting an identity that was never set is a plain miss', () => {
        const store = createDraftContentStore({ maxRecords: 10 })

        expect(store.get({ kind: 'msg', chatKey: 'chat-1', chatId: 'chatid-1', index: 0 }, 'base')).toBeUndefined()
    })

    test('setting a msg record does not leak into a tr identity built from the same raw parts', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        store.set({ kind: 'msg', chatKey: 'chat-1', chatId: 'chatid-1', index: 0 }, 'msg draft', 'base')

        expect(store.get({ kind: 'tr', key: 'chat-1:chatid-1' }, 'base')).toBeUndefined()
    })

    test('delete removes a record explicitly, independent of any base-text comparison', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'c', chatId: 'a', index: 0 }
        store.set(identity, 'text', 'base')

        store.delete(identity)

        expect(store.get(identity, 'base')).toBeUndefined()
    })

    test('clear empties every record regardless of namespace', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        store.set({ kind: 'msg', chatKey: 'c', chatId: 'a', index: 0 }, 'text', 'base')
        store.set({ kind: 'tr', key: 'tr-key' }, 'translated', 'source')

        store.clear()

        expect(store.size()).toBe(0)
    })
})

describe('draftContents: baseData lives in the record, compared and pruned on read (§4.2)', () => {
    test('a base-text mismatch on read returns undefined', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'chat-1', chatId: 'chatid-1', index: 0 }

        store.set(identity, 'draft text', 'old base')

        expect(store.get(identity, 'new base')).toBeUndefined()
    })

    test('a base-text mismatch on read prunes the record entirely, not merely hides it', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'chat-1', chatId: 'chatid-1', index: 0 }

        store.set(identity, 'draft text', 'old base')
        store.get(identity, 'new base') // mismatch: must delete the record, not just miss it

        // If base text were folded into the key, a changed base would give a
        // *miss* rather than a *mismatch*: the old-keyed record would still be
        // sitting in the map, unreachable but never pruned, and the store
        // would grow unboundedly on every reroll-while-editing (§4.2).
        expect(store.size()).toBe(0)
    })

    test('a matching base text on read is a hit and does not disturb the record', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'chat-1', chatId: 'chatid-1', index: 0 }

        store.set(identity, 'draft text', 'base')

        expect(store.get(identity, 'base')).toEqual({ text: 'draft text', baseData: 'base', updatedAt: expect.any(Number) })
        expect(store.size()).toBe(1)
    })

    test('a translation record compares baseData as the source text, not the cached translation', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'tr' as const, key: 'tr-cache-key' }

        store.set(identity, 'edited translation', 'original source text')

        // The source text changed underneath (e.g. the underlying message was
        // rerolled) -- the translation draft must be treated as stale, keyed
        // off the source it was made from, not off its own translated text.
        expect(store.get(identity, 'a different source text')).toBeUndefined()
    })
})

describe('draftContents: no unmount-triggered clearing', () => {
    test('a successful get does not clear the record -- reopening without saving still finds it', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'chat-1', chatId: 'chatid-1', index: 0 }

        store.set(identity, 'draft text', 'base')

        expect(store.get(identity, 'base')).toEqual({ text: 'draft text', baseData: 'base', updatedAt: expect.any(Number) })
        // Simulates an involuntary unmount and remount with no deliberate
        // clear in between -- the record must still be there.
        expect(store.get(identity, 'base')).toEqual({ text: 'draft text', baseData: 'base', updatedAt: expect.any(Number) })
    })
})

describe('draftContents: index-keyed records and the backfill transition, no bridging (§4.1)', () => {
    test('a chatId-keyed record survives an index shift, since the index is not part of the key', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const chatKey = 'chat-1'
        const chatId = 'chatid-1'

        store.set({ kind: 'msg', chatKey, chatId, index: 5 }, 'draft text', 'base text')

        // A message above this one was deleted, shifting this message from
        // index 5 down to index 4. chatId is preserved.
        const afterShift = { kind: 'msg' as const, chatKey, chatId, index: 4 }

        expect(store.get(afterShift, 'base text')).toEqual({ text: 'draft text', baseData: 'base text', updatedAt: expect.any(Number) })
    })

    test('a record filed with no chatId is not bridged once its own message gains a chatId (accepted cost, §4.1/§9)', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const chatKey = 'chat-1'

        store.set({ kind: 'msg', chatKey, chatId: undefined, index: 3 }, 'typed but never sent', 'hello')

        // The message is sent (backfill assigns a chatId); its editor reopens
        // before anything else changes its index.
        const afterSend = { kind: 'msg' as const, chatKey, chatId: 'chatid-1', index: 3 }

        expect(store.get(afterSend, 'hello')).toBeUndefined()
        // The stale index-keyed record is deleted, not left orphaned.
        expect(store.size()).toBe(0)
    })

    test('no index fallback: two identical messages sharing a post-shift index do not cross-restore once both gain chatIds (§4.1)', () => {
        const store = createDraftContentStore({ maxRecords: 10 })
        const chatKey = 'chat-1'

        // "/send hello" twice: two identical messages, both with no chatId
        // yet. Message A sits at index 5; a draft is filed for it while
        // editing, then its editor unmounts (e.g. a pointer bump).
        store.set({ kind: 'msg', chatKey, chatId: undefined, index: 5 }, "A's draft", 'hello')

        // An earlier message is deleted, so message B (the second, textually
        // identical "hello") shifts down into index 5 -- the very index A's
        // record was filed under, even though A itself has since moved.
        // Both messages then gain chatIds on Send.
        const messageB = { kind: 'msg' as const, chatKey, chatId: 'chatid-B', index: 5 }

        // B's chatId lookup misses (no record was ever filed under a chatId
        // key), and the base text happens to match A's stored baseData too:
        // a record filed without a chatId is never restored onto a message
        // that has one.
        const restored = store.get(messageB, 'hello')

        expect(restored).toBeUndefined()
        // The stale record is gone, not left reachable for a later, wrong
        // restore either.
        expect(store.size()).toBe(0)
    })
})

describe('draftContents: record bound with LRU eviction (§6.1)', () => {
    test('inserting beyond the bound evicts the least-recently-used record', () => {
        const store = createDraftContentStore({ maxRecords: 2 })
        const a = { kind: 'msg' as const, chatKey: 'c', chatId: 'a', index: 0 }
        const b = { kind: 'msg' as const, chatKey: 'c', chatId: 'b', index: 1 }
        const c = { kind: 'msg' as const, chatKey: 'c', chatId: 'c', index: 2 }

        store.set(a, 'A', 'base')
        store.set(b, 'B', 'base')
        // Touch A so B becomes the least-recently-used entry.
        store.get(a, 'base')
        store.set(c, 'C', 'base')

        expect(store.get(a, 'base')).toEqual({ text: 'A', baseData: 'base', updatedAt: expect.any(Number) })
        expect(store.get(b, 'base')).toBeUndefined()
        expect(store.get(c, 'base')).toEqual({ text: 'C', baseData: 'base', updatedAt: expect.any(Number) })
    })

    test('the bound is injectable: a larger bound does not evict at the same count', () => {
        const store = createDraftContentStore({ maxRecords: 5 })
        for (let i = 0; i < 3; i += 1) {
            store.set({ kind: 'msg', chatKey: 'c', chatId: `id-${i}`, index: i }, `text-${i}`, 'base')
        }

        expect(store.size()).toBe(3)
    })

    test('growth never exceeds the injected bound, however many distinct records are set', () => {
        const store = createDraftContentStore({ maxRecords: 3 })

        for (let i = 0; i < 20; i += 1) {
            store.set({ kind: 'msg', chatKey: 'c', chatId: `id-${i}`, index: i }, `text-${i}`, 'base')
        }

        expect(store.size()).toBeLessThanOrEqual(3)
    })
})

describe('draftContents: updatedAt is stamped from the injected now (§5.4 / MC-068 draft age)', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    test('set() stamps updatedAt using the injected now() at the time of the call', () => {
        let current = 1_000
        const store = createDraftContentStore({ maxRecords: 10, now: () => current })
        const identity = { kind: 'msg' as const, chatKey: 'c', chatId: 'a', index: 0 }

        store.set(identity, 'text', 'base')

        expect(store.get(identity, 'base')?.updatedAt).toBe(1_000)
    })

    test('a later set() on the same identity refreshes updatedAt to the new now() value', () => {
        let current = 1_000
        const store = createDraftContentStore({ maxRecords: 10, now: () => current })
        const identity = { kind: 'msg' as const, chatKey: 'c', chatId: 'a', index: 0 }

        store.set(identity, 'first draft', 'base')
        current = 5_000
        store.set(identity, 'second draft', 'base')

        expect(store.get(identity, 'base')?.updatedAt).toBe(5_000)
    })

    test('get() returns the previously stamped updatedAt unchanged (a read must not re-stamp it)', () => {
        let current = 1_000
        const store = createDraftContentStore({ maxRecords: 10, now: () => current })
        const identity = { kind: 'msg' as const, chatKey: 'c', chatId: 'a', index: 0 }

        store.set(identity, 'text', 'base')
        current = 9_999 // time passes before the record is merely read, not re-set
        const record = store.get(identity, 'base')

        expect(record?.updatedAt).toBe(1_000)
    })

    test('now defaults to Date.now when not injected', () => {
        vi.useFakeTimers()
        const fixed = 1_700_000_000_000
        vi.setSystemTime(fixed)
        const store = createDraftContentStore({ maxRecords: 10 })
        const identity = { kind: 'msg' as const, chatKey: 'c', chatId: 'a', index: 0 }

        store.set(identity, 'text', 'base')

        expect(store.get(identity, 'base')?.updatedAt).toBe(fixed)
    })
})

describe('draftContents: updatedAt forwards unchanged through the orphan gate (§5.4; the gate must not re-derive its own timestamp for the record)', () => {
    test('draftContentOrphanGate-style wrapping returns the exact updatedAt the wrapped store stamped', () => {
        let current = 42
        const store = createOrphanRegisteringDraftStore(
            createDraftContentStore({ maxRecords: 10, now: () => current }),
            { capMs: 1_000 }
        )
        const identity = { kind: 'msg' as const, chatKey: 'c', chatId: 'a', index: 0 }

        store.set(identity, 'text', 'base')

        expect(store.get(identity, 'base')?.updatedAt).toBe(42)
    })
})

describe('draftContents: the production configuration is sane', () => {
    // This module exports no ready-made singleton of its own (see this
    // module's own closing comment for why) -- `draftContentOrphanGate.ts`
    // builds the one production instance, and its own singleton smoke test
    // (`draftContentOrphanGate.test.ts`) already covers that the wiring
    // works end to end. What is left to pin here is only that the
    // factory, given the actual production bound, behaves as a usable
    // store -- not a duplicate of that other test.
    test('a store built with the production record limit is a usable store', () => {
        const store = createDraftContentStore({ maxRecords: DRAFT_CONTENT_RECORD_LIMIT })
        const identity = { kind: 'msg' as const, chatKey: 'smoke-test-chat', chatId: 'smoke-test-id', index: 0 }

        store.set(identity, 'smoke test text', 'base')

        expect(store.get(identity, 'base')).toEqual({ text: 'smoke test text', baseData: 'base', updatedAt: expect.any(Number) })

        store.delete(identity)
        expect(store.get(identity, 'base')).toBeUndefined()
    })
})
