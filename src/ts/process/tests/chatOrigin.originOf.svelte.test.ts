/**
 * Specifies the origin module's `originOf`: it is pure and refuses a missing
 * id.
 *
 * `originOf` is pure: it reads the `chaId`/`chat.id` fields of the
 * objects it is given and never touches the live database, so these tests
 * do not install anything into DBState. `../../stores.svelte` is still
 * replaced with a real `$state` DBState purely so importing `chatOrigin.ts`
 * (which also exports the live-data functions in the same module) does not
 * drag in that module's full production dependency graph.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, Chat, character } from '../../storage/database.svelte'

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as unknown as typeof import('../../stores.svelte')
})

import { originOf } from '../chatOrigin'

function makeChat(id: string | undefined, extra: Partial<Chat> = {}): Chat {
    return { id, message: [], note: '', name: '', localLore: [], ...extra } as Chat
}

function makeCharacter(chaId: string | undefined, name = 'Character'): character {
    return {
        chaId, name, type: 'character', chatPage: 0, chats: [],
        firstMessage: '', desc: '', notes: '', chatFolders: [], viewScreen: 'none',
        bias: [], emotionImages: [], globalLore: [],
    } as unknown as character
}

afterEach(() => {
    vi.restoreAllMocks()
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('originOf is pure and refuses a missing id', () => {
    test('returns null, warns, and changes nothing for an id-less chat', () => {
        const owner = makeCharacter('char-a')
        const chat = makeChat(undefined)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const origin = originOf(owner, chat)

        expect(origin).toBeNull()
        expect(warn).toHaveBeenCalled()
        expect(chat.id).toBeFalsy()
        expect(owner.chaId).toBe('char-a')
    })

    test('returns null, warns, and changes nothing for an id-less character', () => {
        const owner = makeCharacter(undefined)
        const chat = makeChat('chat-a')
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const origin = originOf(owner, chat)

        expect(origin).toBeNull()
        expect(warn).toHaveBeenCalled()
        expect(owner.chaId).toBeFalsy()
        expect(chat.id).toBe('chat-a')
    })

    test('returns {chaId, chatId} for a fully identified chat, without a member field', () => {
        const owner = makeCharacter('char-a')
        const chat = makeChat('chat-a')

        const origin = originOf(owner, chat)

        expect(origin).toEqual({ chaId: 'char-a', chatId: 'chat-a' })
    })
})
