/**
 * Specifies the origin module's `writeAt`: it marks the owner, and the
 * member whenever it resolved,
 * unconditionally in a `finally` -- these tests exercise that guarantee
 * against a `fn` that throws, and against a `fn` typed to reject a
 * Promise-returning function at compile time but still reachable from an
 * untyped caller at runtime.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, Chat } from '../../storage/database.svelte'

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as unknown as typeof import('../../stores.svelte')
})

import { DBState } from '../../stores.svelte'
import { writeAt } from '../chatOrigin'
import { installCharacterSaveMarks, resetCharacterSaveMarksForTest } from '../../storage/characterSaveMarks'
import type { toSaveType } from '../../storage/risuSave'

type CharacterFixture = Database['characters'][number]

function makeChat(id: string | undefined, extra: Partial<Chat> = {}): Chat {
    return { id, message: [], note: '', name: '', localLore: [], ...extra } as Chat
}

function makeCharacter(chaId: string | undefined, chats: Chat[]): CharacterFixture {
    return {
        chaId, name: 'Character', type: 'character', chatPage: 0, chats,
        firstMessage: '', desc: '', notes: '', chatFolders: [], viewScreen: 'none',
        bias: [], emotionImages: [], globalLore: [],
    } as unknown as CharacterFixture
}

function makeGroup(chaId: string, chats: Chat[], memberChaIds: string[]): CharacterFixture {
    return {
        chaId, type: 'group', image: '', firstMessage: '', chats, chatFolders: [], chatPage: 0,
        name: 'Group', viewScreen: 'multiple', characters: memberChaIds, characterTalks: [], characterActive: [],
        globalLore: [], autoMode: false, useCharacterLore: false, emotionImages: [], customscript: [],
    } as unknown as CharacterFixture
}

function installDb(characters: CharacterFixture[]): void {
    DBState.db = {
        formatversion: 5, botPresetsId: 0, botPresets: [], modules: [], loadouts: [], plugins: [],
        pluginCustomStorage: {}, characterOrder: characters.map((c) => (c as { chaId: string }).chaId),
        characters,
    } as unknown as Database
}

function makeTracker(): toSaveType {
    return { character: [], chat: [], botPreset: false, modules: false, loadouts: false, plugins: false, pluginCustomStorage: false }
}

afterEach(() => {
    resetCharacterSaveMarksForTest()
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('writeAt marks unconditionally, in a finally', () => {
    test('fn throwing after an in-place write still marks the owner', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })

        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        expect(() => writeAt(origin, (ctx) => {
            ctx.chat.note = 'written before throw'
            throw new Error('boom')
        })).toThrow('boom')

        expect(tracker.character).toContain('char-a')
        expect((DBState.db.characters[0] as unknown as { chats: Chat[] }).chats[0].note).toBe('written before throw')
    })

    test('fn throwing after an in-place write still marks a resolved member', () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
        ])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })

        const origin = { chaId: 'group-1', chatId: 'chat-1', memberChaId: 'member-a' }
        expect(() => writeAt(origin, () => { throw new Error('boom') })).toThrow('boom')

        expect(tracker.character).toEqual(expect.arrayContaining(['group-1', 'member-a']))
    })

    test('fn returning a promise makes the call throw after fn returns, and still marks the owner', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })

        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        const asyncFn = async () => { /* a thenable return, reachable only past the type guard below */ }

        expect(() => writeAt(
            origin,
            // @ts-expect-error pins writeAt's `fn` parameter type rejecting a Promise-returning
            // function; an untyped caller can still pass one at runtime, which is what the
            // `toThrow()` below exercises.
            asyncFn,
        )).toThrow()

        expect(tracker.character).toContain('char-a')
    })
})
