// @vitest-environment node

/**
 * Specification tests for `src/ts/process/composerDrafts.svelte.ts` itself,
 * on the pattern of `composerActions.svelte.test.ts`. No test here makes a
 * red claim: each one specifies a behaviour the module must hold, not a
 * defect to fail against. Every test drives the module's own exports
 * directly, with no component mounted and no other module mocked.
 */

import { afterEach, describe, expect, test } from 'vitest'
import {
    EMPTY_DRAFT_VIEW,
    peek,
    putBack,
    resetComposerDraftsForTests,
    setOnScreenKey,
    take,
    write,
    type ComposerDraftKey,
} from '../composerDrafts.svelte'

afterEach(() => {
    resetComposerDraftsForTests()
})

function key(chaId: string, chatId: string): ComposerDraftKey {
    return { chaId, chatId }
}

/** Fills `count` distinct keys, in write order, each holding distinct text. */
function fillRecords(count: number, chaId = 'c'): ComposerDraftKey[] {
    const keys: ComposerDraftKey[] = []
    for (let i = 0; i < count; i++) {
        const k = key(chaId, `t${i}`)
        keys.push(k)
        write(k, (record) => { record.messageInput = `text-${i}` })
    }
    return keys
}

describe('composerDrafts: showing is not writing', () => {
    test('peek never creates a record, even for a key with none', () => {
        const k = key('cha-1', 'chat-1')
        const first = peek(k)
        const second = peek(k)
        // If the first call had created and stored a record, the second
        // call would return that stored (non-frozen) record instead of the
        // shared frozen empty view.
        expect(first).toBe(EMPTY_DRAFT_VIEW)
        expect(second).toBe(EMPTY_DRAFT_VIEW)
    })

    test('peek does not protect a record from eviction, proven through the eviction order', () => {
        const keys = fillRecords(200)
        // Read keys[0] repeatedly through peek only -- never through write.
        peek(keys[0])
        peek(keys[0])
        peek(keys[0])

        const overflow = key('c', 'overflow')
        write(overflow, (record) => { record.messageInput = 'overflow-text' })

        // keys[0] was the least recently WRITTEN record; peeking it must not
        // have moved it out of that position.
        expect(peek(keys[0])).toBe(EMPTY_DRAFT_VIEW)
        // keys[1], written after keys[0] and never touched again, survives.
        expect(peek(keys[1]).messageInput).toBe('text-1')
        expect(peek(overflow).messageInput).toBe('overflow-text')
    })
})

describe('composerDrafts: the cap', () => {
    test('evicts the least recently written record once stored records pass the cap', () => {
        const keys = fillRecords(200)
        const overflow = key('c', 'overflow')
        write(overflow, (record) => { record.messageInput = 'overflow-text' })

        expect(peek(keys[0])).toBe(EMPTY_DRAFT_VIEW)
        expect(peek(keys[1]).messageInput).toBe('text-1')
        expect(peek(keys[199]).messageInput).toBe('text-199')
        expect(peek(overflow).messageInput).toBe('overflow-text')
    })

    test('the key set with setOnScreenKey is never evicted, even when it is the oldest', () => {
        const keys = fillRecords(200)
        setOnScreenKey(keys[0]) // the oldest (least recently written) record

        const overflow = key('c', 'overflow')
        write(overflow, (record) => { record.messageInput = 'overflow-text' })

        // keys[0] would ordinarily be the eviction victim; being on screen
        // protects it, so keys[1] (the next oldest) is evicted instead.
        expect(peek(keys[0]).messageInput).toBe('text-0')
        expect(peek(keys[1])).toBe(EMPTY_DRAFT_VIEW)
    })

    test('rewriting the oldest record protects it, telling apart least recently written from least recently created', () => {
        const keys = fillRecords(200)
        // keys[0] was created first, but this write makes it the most
        // recently WRITTEN record -- eviction must follow write order, not
        // creation order.
        write(keys[0], (record) => { record.messageInput = 'text-0-rewritten' })

        const overflow = key('c', 'overflow')
        write(overflow, (record) => { record.messageInput = 'overflow-text' })

        expect(peek(keys[0]).messageInput).toBe('text-0-rewritten')
        expect(peek(keys[1])).toBe(EMPTY_DRAFT_VIEW)
    })
})

describe('composerDrafts: duplicate ids reach one record', () => {
    test('two keys built from the same chaId and chatId reach one record', () => {
        // Built as two separate object literals, as two chats sharing one
        // id (MC-102 2) would produce two separately-constructed keys.
        const keyA = key('shared-cha', 'shared-chat')
        const keyB = key('shared-cha', 'shared-chat')

        write(keyA, (record) => { record.messageInput = 'from-a' })
        expect(peek(keyB).messageInput).toBe('from-a')

        write(keyB, (record) => { record.messageInputTranslate = 'from-b' })
        expect(peek(keyA).messageInputTranslate).toBe('from-b')
    })
})

describe('composerDrafts: D1, an all-empty record is dropped at once', () => {
    test('a write leaving all three fields empty drops the record, and its frozen empty view rejects mutation', () => {
        const k = key('c', 't')
        write(k, (record) => { record.messageInput = 'text' })
        expect(peek(k).messageInput).toBe('text')

        write(k, (record) => { record.messageInput = '' })

        const view = peek(k)
        expect(view).toBe(EMPTY_DRAFT_VIEW)
        expect(() => { view.messageInput = 'mutated' }).toThrow()
        expect(() => { view.fileInput.push('mutated') }).toThrow()
    })
})

describe('composerDrafts: take', () => {
    test('take returns a detached copy and leaves the record gone', () => {
        const k = key('c', 't')
        write(k, (record) => { record.messageInput = 'text'; record.fileInput.push('f1') })

        const snapshot = take(k)
        expect(snapshot).toEqual({ messageInput: 'text', messageInputTranslate: '', fileInput: ['f1'] })
        expect(peek(k)).toBe(EMPTY_DRAFT_VIEW)

        // Detached: mutating the snapshot's own array, and writing a fresh
        // record under the same key afterwards, must not cross-contaminate
        // either direction.
        snapshot.fileInput.push('mutated-after-take')
        write(k, (record) => { record.fileInput.push('fresh') })
        expect(peek(k).fileInput).toEqual(['fresh'])
    })
})

describe('composerDrafts: putBack', () => {
    test('putBack puts the taken text in front of a late result already in the record, and the taken files in front of its files', () => {
        const k = key('c', 't')
        const taken = { messageInput: 'taken-text', messageInputTranslate: 'taken-tr', fileInput: ['taken-file'] }

        // A late result lands in the record before the put-back runs.
        write(k, (record) => {
            record.messageInput = '-late'
            record.messageInputTranslate = '-late-tr'
            record.fileInput.push('late-file')
        })

        putBack(k, taken)

        const record = peek(k)
        expect(record.messageInput).toBe('taken-text-late')
        expect(record.messageInputTranslate).toBe('taken-tr-late-tr')
        expect(record.fileInput).toEqual(['taken-file', 'late-file'])
    })

    test('putBack to a key with no record creates one', () => {
        const k = key('c', 't')
        expect(peek(k)).toBe(EMPTY_DRAFT_VIEW)

        putBack(k, { messageInput: 'restored', messageInputTranslate: '', fileInput: [] })

        expect(peek(k).messageInput).toBe('restored')
    })

    test('a put-back to key A never changes key B\'s record', () => {
        const keyA = key('a', 't')
        const keyB = key('b', 't')
        write(keyB, (record) => { record.messageInput = 'B-text' })

        putBack(keyA, { messageInput: 'A-text', messageInputTranslate: '', fileInput: [] })

        expect(peek(keyB).messageInput).toBe('B-text')
        expect(peek(keyA).messageInput).toBe('A-text')
    })
})
