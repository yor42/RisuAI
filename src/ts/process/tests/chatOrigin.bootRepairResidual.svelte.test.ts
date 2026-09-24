/**
 * Specifies the origin module's `resolveOrigin` together with boot's id
 * repair.
 *
 * `assignIds` is boot's id repair, exported from `src/ts/bootstrap.ts`
 * (`src/ts/bootstrap.assignIds.svelte.test.ts` specifies its own contract)
 * so it can be driven directly from a test. This file documents the one
 * residual case: for a persistent duplicate *chat id* within one character,
 * boot's repair keeps the first holder by position, and the origin resolves
 * to that holder afterward. A duplicate `chaId` is not covered here: the
 * save file holds one block per `chaId`, so a duplicate `chaId` never
 * survives to the next boot at all.
 *
 * Only `../../platform` and `../../stores.svelte` are mocked, mirroring
 * `bootstrap.assignIds.svelte.test.ts`'s own minimal scaffold -- the least
 * needed to import `bootstrap.ts` without running the reactive effects its
 * other real dependencies register at module scope.
 */
import { describe, test, expect, vi } from 'vitest'
import { writable } from 'svelte/store'
import type { Database, Chat } from '../../storage/database.svelte'

vi.mock(import('../../platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('../../platform'))

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: { characters: [] } as unknown as Database })
    const selIdState = $state({ selId: -1 })
    return {
        DBState: state,
        selIdState,
        MobileGUI: writable(false),
        botMakerMode: writable(false),
        selectedCharID: writable(-1),
        loadedStore: writable(false),
        LoadingStatusState: writable(''),
    } as unknown as typeof import('../../stores.svelte')
})

import { assignIds } from '../../bootstrap'
import { DBState } from '../../stores.svelte'
import { resolveOrigin } from '../chatOrigin'

function makeChat(id: string | undefined, extra: Partial<Chat> = {}): Chat {
    return { id, message: [], note: '', name: '', localLore: [], ...extra } as Chat
}

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('boot repair of a persistent duplicate chat id, and the origin that resolves to it', () => {
    test('the first holder by position keeps the id, and the origin resolves to that holder', () => {
        DBState.db.characters = [
            {
                chaId: 'char-a', name: 'Character', type: 'character', chatPage: 0,
                chats: [
                    makeChat('dup', { note: 'first' }),
                    makeChat('other'),
                    makeChat('dup', { note: 'second' }),
                ],
            },
        ] as unknown as Database['characters']

        assignIds()

        const owner = DBState.db.characters[0] as unknown as { chats: Chat[] }
        expect(owner.chats[0].id).toBe('dup')
        expect(owner.chats[2].id).not.toBe('dup')

        const origin = { chaId: 'char-a', chatId: 'dup' }
        const ctx = resolveOrigin(origin)
        expect(ctx?.chatIndex).toBe(0)
        expect(ctx?.chat.note).toBe('first')
    })
})
