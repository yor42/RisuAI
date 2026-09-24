/**
 * Specifies the origin module's `writeAt`: a group origin resolves its
 * member separately from its owner.
 *
 * A group's members are ordinary characters, present as their own entries in
 * `DBState.db.characters` (groups share the chaId space), so these fixtures
 * place the member alongside the group rather than nesting it inside the
 * group object.
 */
import { describe, test, expect, vi } from 'vitest'
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

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('a group origin resolves its member separately from its owner', () => {
    test('fn receives the group as owner, its chat, and the resolved member', () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a', 'member-b']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
            makeCharacter('member-b', [makeChat('member-b-chat')]),
        ])
        const origin = { chaId: 'group-1', chatId: 'chat-1', memberChaId: 'member-a' }

        let seenOwnerChaId: string | undefined
        let seenChatId: string | undefined
        let seenMemberChaId: string | undefined
        let seenMemberIndex: number | null | undefined
        expect(writeAt(origin, (ctx) => {
            seenOwnerChaId = (ctx.owner as unknown as { chaId: string }).chaId
            seenChatId = ctx.chat.id
            seenMemberChaId = (ctx.member as unknown as { chaId: string } | null)?.chaId
            seenMemberIndex = ctx.memberIndex
        })).toBe(true)

        expect(seenOwnerChaId).toBe('group-1')
        expect(seenChatId).toBe('chat-1')
        expect(seenMemberChaId).toBe('member-a')
        expect(seenMemberIndex).toBe(1)
    })

    test('a gone member resolves to null, and the owner write still lands', () => {
        installDb([makeGroup('group-1', [makeChat('chat-1')], ['missing-member'])])
        const origin = { chaId: 'group-1', chatId: 'chat-1', memberChaId: 'missing-member' }

        let seenMember: unknown
        let seenMemberIndex: number | null | undefined
        expect(writeAt(origin, (ctx) => {
            seenMember = ctx.member
            seenMemberIndex = ctx.memberIndex
        })).toBe(true)

        expect(seenMember).toBeNull()
        expect(seenMemberIndex).toBeNull()
    })

    test('an ambiguous member resolves to null, and the owner write still lands', () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['dup-member']),
            makeCharacter('dup-member', [makeChat('a')]),
            makeCharacter('dup-member', [makeChat('b')]),
        ])
        const origin = { chaId: 'group-1', chatId: 'chat-1', memberChaId: 'dup-member' }

        let seenMember: unknown
        expect(writeAt(origin, (ctx) => { seenMember = ctx.member })).toBe(true)

        expect(seenMember).toBeNull()
    })
})
