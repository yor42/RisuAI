/**
 * Boot's id repair is reachable from a test as `assignIds`, exported from
 * `bootstrap.ts`. The three backup loads run the same algorithm directly, as
 * `repairDatabaseIds` from `src/ts/process/chatIds.ts`, which `assignIds`
 * itself delegates to for its own `DBState.db` case.
 *
 * Only `./platform` and `./stores.svelte` are mocked, the minimum needed to
 * import `bootstrap.ts` without running the reactive effects several of its
 * other real dependencies register at module scope; every other import
 * bootstrap.ts makes is left real.
 */
import { test, expect, vi } from 'vitest'
import { writable } from 'svelte/store'
import type { Database } from './storage/database.svelte'

vi.mock(import('./platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('./platform'))

vi.mock(import('./stores.svelte'), () => {
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
    } as unknown as typeof import('./stores.svelte')
})

import { assignIds } from './bootstrap'
import { repairDatabaseIds } from './process/chatIds'
import { DBState } from './stores.svelte'

test('assignIds is exported from bootstrap.ts and repairs a missing or duplicate chaId or chat id in place', () => {
    expect(typeof assignIds).toBe('function')

    DBState.db.characters = [
        { chaId: 'a', chats: [{ id: 'chat-a' }, {}] },
        // Same chaId as the first character, and its own chat's id collides
        // with the first character's chat too -- both resolved by keeping
        // the first holder by position and reassigning the other.
        { chaId: 'a', chats: [{ id: 'chat-a' }] },
        // No chaId at all.
        { chats: [{}] },
    ] as unknown as Database['characters']

    assignIds()

    const [first, second, third] = DBState.db.characters as unknown as {
        chaId: string
        chats: { id: string }[]
    }[]

    expect(first.chaId).toBe('a')
    expect(second.chaId).not.toBe('a')
    expect(typeof third.chaId).toBe('string')
    expect(third.chaId.length).toBeGreaterThan(0)

    expect(first.chats[0].id).toBe('chat-a')
    expect(typeof first.chats[1].id).toBe('string')
    expect(second.chats[0].id).not.toBe('chat-a')
})

test('running assignIds again on an already-unique database changes nothing', () => {
    DBState.db.characters = [
        { chaId: 'x', chats: [{ id: 'y' }] },
    ] as unknown as Database['characters']

    assignIds()
    const before = JSON.parse(JSON.stringify(DBState.db.characters))
    assignIds()

    expect(DBState.db.characters).toEqual(before)
})

test('a non-array chats value is left as it was', () => {
    const malformedChats = { notAnArray: true }
    DBState.db.characters = [
        { chaId: 'a', chats: malformedChats },
    ] as unknown as Database['characters']

    assignIds()

    // Deep equality, not identity: reading `chats` back through this live
    // `$state` character returns a reactive wrapper around the value on its
    // first read, by design of Svelte's proxy, not because the repair
    // reassigned anything -- see the sibling test below for the identity
    // guarantee on a plain object.
    expect((DBState.db.characters[0] as unknown as { chats: unknown }).chats).toEqual({ notAnArray: true })
})

// Coverage, not proof: repairDatabaseIds doing nothing at all would also
// leave this object exactly as it was, so passing here does not by itself
// prove the repair preserves a non-array chats value on purpose -- only that
// it never replaces it with a different object.
test('repairDatabaseIds leaves a non-array chats value as the exact same object on a plain target', () => {
    const malformedChats = { notAnArray: true }
    const target = {
        characters: [
            { chaId: 'a', chats: malformedChats },
        ],
    }

    repairDatabaseIds(target)

    expect(target.characters[0].chats).toBe(malformedChats)
})

test('a missing chats value becomes an empty array', () => {
    DBState.db.characters = [
        { chaId: 'a', chats: undefined },
        { chaId: 'b', chats: null },
    ] as unknown as Database['characters']

    assignIds()

    expect((DBState.db.characters[0] as unknown as { chats: unknown[] }).chats).toEqual([])
    expect((DBState.db.characters[1] as unknown as { chats: unknown[] }).chats).toEqual([])
})
