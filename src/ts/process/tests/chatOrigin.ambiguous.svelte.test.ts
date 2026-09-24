/**
 * Specifies the origin module's `writeAt` and `resolveOrigin`: an ambiguous
 * id is skipped with a warning, never guessed (MC-078).
 *
 * The mid-swap tests drive the duplicate by writing directly to the live
 * `chats`/`characters` arrays, one array element at a time, rather than
 * through `setChatToIndexImpl` (`src/ts/plugins/apiV3/v3.svelte.ts`), to
 * avoid the large mock scaffold `v3SaveMarks.svelte.test.ts` needs for that
 * path. A direct element write reproduces the exact intermediate state a
 * per-slot setter leaves behind (`db.characters[i].chats[j] = chat` /
 * `db.characters[i] = char`), which is all the origin module's own
 * resolution rules care about.
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
import { writeAt, resolveOrigin } from '../chatOrigin'
import { installCharacterSaveMarks, resetCharacterSaveMarksForTest } from '../../storage/characterSaveMarks'
import type { toSaveType } from '../../storage/risuSave'

type CharacterFixture = Database['characters'][number]

function makeChat(id: string | undefined, extra: Partial<Chat> = {}): Chat {
    return { id, message: [], note: '', name: '', localLore: [], ...extra } as Chat
}

function makeCharacter(chaId: string | undefined, chats: Chat[], extra: Record<string, unknown> = {}): CharacterFixture {
    return {
        chaId, name: 'Character', type: 'character', chatPage: 0, chats,
        firstMessage: '', desc: '', notes: '', chatFolders: [], viewScreen: 'none',
        bias: [], emotionImages: [], globalLore: [],
        ...extra,
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
    vi.restoreAllMocks()
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('an ambiguous id is skipped with a warning, never guessed (MC-078)', () => {
    test('duplicate chat id from the copy idiom: writeAt returns false, fn does not run, nothing is marked, and a warning is logged', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a', { note: 'original' })])])
        const owner = DBState.db.characters[0] as unknown as { chats: Chat[] }
        owner.chats.push({ ...owner.chats[0] })
        const tracker = makeTracker()
        installCharacterSaveMarks({ tracker, schedule: () => {} })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        const fn = vi.fn()
        expect(writeAt(origin, fn)).toBe(false)
        expect(fn).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalled()
        expect(tracker.character).toEqual([])
    })

    test('giving the copy a fresh id resolves the origin to the original', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a', { note: 'original' })])])
        const owner = DBState.db.characters[0] as unknown as { chats: Chat[] }
        owner.chats.push(makeChat('chat-a-copy', { note: 'copy' }))

        const origin = { chaId: 'char-a', chatId: 'chat-a' }
        const ctx = resolveOrigin(origin)
        expect(ctx?.chat.note).toBe('original')
    })

    test('a chat-id duplicate from a mid-swap: the overwritten slot is gone, the moved-in id is ambiguous, and both resolve once the second setter completes the swap', () => {
        installDb([makeCharacter('char-a', [
            makeChat('k0'),
            makeChat('A', { note: 'A-content' }),
            makeChat('B', { note: 'B-content' }),
            makeChat('k3'),
        ])])
        const owner = DBState.db.characters[0] as unknown as { chats: Chat[] }
        const originA = { chaId: 'char-a', chatId: 'A' }
        const originB = { chaId: 'char-a', chatId: 'B' }

        // First setter of the swap: the slot holding 'A' is overwritten with
        // 'B's content, so the array now holds 'B' twice and 'A' nowhere.
        owner.chats[1] = makeChat('B', { note: 'B-content' })

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const fnAGone = vi.fn()
        expect(writeAt(originA, fnAGone)).toBe(false)
        expect(fnAGone).not.toHaveBeenCalled()

        const fnBAmbiguous = vi.fn()
        expect(writeAt(originB, fnBAmbiguous)).toBe(false)
        expect(fnBAmbiguous).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalled()

        // Second setter completes the swap: the other slot, at index 2,
        // becomes 'A's content.
        owner.chats[2] = makeChat('A', { note: 'A-content' })

        const fnA = vi.fn()
        expect(writeAt(originA, fnA)).toBe(true)
        expect((fnA.mock.calls[0][0] as { chatIndex: number }).chatIndex).toBe(2)

        const fnB = vi.fn()
        expect(writeAt(originB, fnB)).toBe(true)
        expect((fnB.mock.calls[0][0] as { chatIndex: number }).chatIndex).toBe(1)
    })

    test('a chaId duplicate from a mid-swap: the overwritten slot is gone, the moved-in chaId is ambiguous, and both resolve once the second setter completes the swap', () => {
        installDb([
            makeCharacter('X', [makeChat('x-chat')], { name: 'X-content' }),
            makeCharacter('Y', [makeChat('y-chat')], { name: 'Y-content' }),
        ])
        const originX = { chaId: 'X', chatId: 'x-chat' }
        const originY = { chaId: 'Y', chatId: 'y-chat' }

        // First setter of the swap: the slot holding 'X' is overwritten with
        // 'Y's content, so the array now holds chaId 'Y' twice and 'X' nowhere.
        DBState.db.characters[0] = makeCharacter('Y', [makeChat('y-chat')], { name: 'Y-content' })

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(writeAt(originX, vi.fn())).toBe(false)
        expect(writeAt(originY, vi.fn())).toBe(false)
        expect(warn).toHaveBeenCalled()

        // Second setter completes the swap.
        DBState.db.characters[1] = makeCharacter('X', [makeChat('x-chat')], { name: 'X-content' })

        const fnX = vi.fn()
        expect(writeAt(originX, fnX)).toBe(true)
        expect((fnX.mock.calls[0][0] as { ownerIndex: number }).ownerIndex).toBe(1)

        const fnY = vi.fn()
        expect(writeAt(originY, fnY)).toBe(true)
        expect((fnY.mock.calls[0][0] as { ownerIndex: number }).ownerIndex).toBe(0)
    })
})
