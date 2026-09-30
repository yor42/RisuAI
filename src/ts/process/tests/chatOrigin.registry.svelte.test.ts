/**
 * Specifies the origin module's in-flight registry: `isWriting` counts a
 * registration for its owner and, for a group, for its member too;
 * `hasWorkIn` and `stopWorkIn` match the owner only; `end()` is idempotent.
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
import { beginWork, isWriting, registerWork, hasWorkIn, stopWorkIn, hasAnyWork, isWorkInProgress, type WorkHandle } from '../chatOrigin'

type CharacterFixture = Database['characters'][number]

function makeChat(id: string | undefined): Chat {
    return { id, message: [], note: '', name: '', localLore: [] } as Chat
}

function makeCharacter(chaId: string, chats: Chat[]): CharacterFixture {
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
describe('the in-flight registry is counted, and end() is idempotent', () => {
    test('isWriting is true for the chat and the character while registered, and false after end', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]
        const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0])!

        expect(isWriting({ chaId: 'char-a' })).toBe(true)
        expect(isWriting({ chaId: 'char-a', chatId: 'chat-a' })).toBe(true)

        handle.end()

        expect(isWriting({ chaId: 'char-a' })).toBe(false)
        expect(isWriting({ chaId: 'char-a', chatId: 'chat-a' })).toBe(false)
    })

    test('calling end twice is harmless', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]
        const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0])!

        handle.end()
        expect(() => handle.end()).not.toThrow()
        expect(isWriting({ chaId: 'char-a' })).toBe(false)
    })

    test('two registrations need two ends', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]
        const chat = (owner as unknown as { chats: Chat[] }).chats[0]
        const handle1 = beginWork(owner, chat)!
        const handle2 = beginWork(owner, chat)!

        handle1.end()
        expect(isWriting({ chaId: 'char-a' })).toBe(true)

        handle2.end()
        expect(isWriting({ chaId: 'char-a' })).toBe(false)
    })

    test('a group registration counts for both the owner and the member', () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
        ])
        const owner = DBState.db.characters[0]
        const member = DBState.db.characters[1]
        const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0], member)!

        expect(isWriting({ chaId: 'group-1' })).toBe(true)
        expect(isWriting({ chaId: 'member-a' })).toBe(true)

        handle.end()

        expect(isWriting({ chaId: 'group-1' })).toBe(false)
        expect(isWriting({ chaId: 'member-a' })).toBe(false)
    })
})

// Specification: the origin module has no earlier version to fail against,
// so these tests pin its contract rather than prove a fix.
describe('a registration ended in a finally leaves nothing registered, even if the work throws', () => {
    test('work that throws, with end() in a finally, leaves nothing registered', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]

        expect(() => {
            const handle = beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0])!
            try {
                throw new Error('boom')
            } finally {
                handle.end()
            }
        }).toThrow('boom')

        expect(isWriting({ chaId: 'char-a' })).toBe(false)
    })
})

const openHandles: WorkHandle[] = []

/** Registers a unit of work that `afterEach` ends even when the test fails. */
function open(handle: WorkHandle): WorkHandle {
    openHandles.push(handle)
    return handle
}

afterEach(() => {
    for (const handle of openHandles.splice(0)) {
        handle.end()
    }
})

// Specification tests: they pin the contract of stopWorkIn.
describe('stopWorkIn calls each matching registration\'s stop once', () => {
    test('a stop runs once per matching registration, and a second stopWorkIn does nothing', () => {
        const stopOne = vi.fn()
        const stopTwo = vi.fn()
        const stopOther = vi.fn()
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopOne))
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopTwo))
        open(registerWork({ chaId: 'char-b', chatId: 'chat-b' }, stopOther))

        stopWorkIn({ chaId: 'char-a', chatId: 'chat-a' })
        stopWorkIn({ chaId: 'char-a', chatId: 'chat-a' })

        expect(stopOne).toHaveBeenCalledTimes(1)
        expect(stopTwo).toHaveBeenCalledTimes(1)
        expect(stopOther).not.toHaveBeenCalled()
    })

    test('a stop after end() does nothing', () => {
        const stop = vi.fn()
        const handle = open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stop))

        handle.end()
        stopWorkIn({ chaId: 'char-a', chatId: 'chat-a' })

        expect(stop).not.toHaveBeenCalled()
    })

    test('a stop given to beginWork is the one stopWorkIn calls', () => {
        installDb([makeCharacter('char-a', [makeChat('chat-a')])])
        const owner = DBState.db.characters[0]
        const stop = vi.fn()
        open(beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0], undefined, stop)!)

        stopWorkIn({ chaId: 'char-a' })

        expect(stop).toHaveBeenCalledTimes(1)
    })

    test('a registration with no stop is left registered and stopWorkIn does not throw', () => {
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }))

        expect(() => stopWorkIn({ chaId: 'char-a' })).not.toThrow()
        expect(hasWorkIn({ chaId: 'char-a' })).toBe(true)
    })

    test('a stop that ends its own registration neither skips a sibling nor makes anything run twice', () => {
        const stopSibling = vi.fn()
        let selfHandle: WorkHandle | undefined
        const stopSelf = vi.fn(() => { selfHandle?.end() })
        selfHandle = open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopSelf))
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopSibling))
        const stopThird = vi.fn()
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopThird))

        stopWorkIn({ chaId: 'char-a', chatId: 'chat-a' })

        expect(stopSelf).toHaveBeenCalledTimes(1)
        expect(stopSibling).toHaveBeenCalledTimes(1)
        expect(stopThird).toHaveBeenCalledTimes(1)

        stopWorkIn({ chaId: 'char-a', chatId: 'chat-a' })

        expect(stopSelf).toHaveBeenCalledTimes(1)
        expect(stopSibling).toHaveBeenCalledTimes(1)
        expect(stopThird).toHaveBeenCalledTimes(1)
    })

    test('a stop that ends a later matching registration keeps that registration\'s stop from running', () => {
        const stopLater = vi.fn()
        let laterHandle: WorkHandle | undefined
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, () => { laterHandle?.end() }))
        laterHandle = open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopLater))

        stopWorkIn({ chaId: 'char-a' })

        expect(stopLater).not.toHaveBeenCalled()
    })

    test('a stop that throws is logged and does not keep the others from running', () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        const stopAfter = vi.fn()
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, () => { throw new Error('stop failed') }))
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopAfter))

        try {
            expect(() => stopWorkIn({ chaId: 'char-a' })).not.toThrow()
            expect(stopAfter).toHaveBeenCalledTimes(1)
            expect(logged).toHaveBeenCalledTimes(1)
        } finally {
            logged.mockRestore()
        }
    })
})

// Specification tests: they pin the contract of the owner-only query hasWorkIn and of stopWorkIn's matching.
describe('hasWorkIn and stopWorkIn match by owner and chat, not by member', () => {
    test('a registration that only matches as a member is ignored by the owner-only query and by stopWorkIn', () => {
        installDb([
            makeGroup('group-1', [makeChat('chat-1')], ['member-a']),
            makeCharacter('member-a', [makeChat('member-a-chat')]),
        ])
        const owner = DBState.db.characters[0]
        const member = DBState.db.characters[1]
        const stop = vi.fn()
        open(beginWork(owner, (owner as unknown as { chats: Chat[] }).chats[0], member, stop)!)

        expect(isWriting({ chaId: 'member-a' })).toBe(true)
        expect(hasWorkIn({ chaId: 'member-a' })).toBe(false)
        expect(hasWorkIn({ chaId: 'member-a', chatId: 'chat-1' })).toBe(false)
        stopWorkIn({ chaId: 'member-a' })
        expect(stop).not.toHaveBeenCalled()

        expect(hasWorkIn({ chaId: 'group-1' })).toBe(true)
        expect(hasWorkIn({ chaId: 'group-1', chatId: 'chat-1' })).toBe(true)
        stopWorkIn({ chaId: 'group-1' })
        expect(stop).toHaveBeenCalledTimes(1)
    })

    test('a chat query ignores another chat of the same owner, and a character query matches both', () => {
        const stopA = vi.fn()
        const stopB = vi.fn()
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, stopA))
        open(registerWork({ chaId: 'char-a', chatId: 'chat-b' }, stopB))

        expect(hasWorkIn({ chaId: 'char-a', chatId: 'chat-a' })).toBe(true)
        expect(hasWorkIn({ chaId: 'char-a', chatId: 'chat-c' })).toBe(false)
        expect(hasWorkIn({ chaId: 'char-a' })).toBe(true)

        stopWorkIn({ chaId: 'char-a', chatId: 'chat-a' })
        expect(stopA).toHaveBeenCalledTimes(1)
        expect(stopB).not.toHaveBeenCalled()

        stopWorkIn({ chaId: 'char-a' })
        expect(stopA).toHaveBeenCalledTimes(1)
        expect(stopB).toHaveBeenCalledTimes(1)
    })

    test('a query for another character finds nothing', () => {
        open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }, vi.fn()))

        expect(hasWorkIn({ chaId: 'char-b' })).toBe(false)
    })
})

describe('hasAnyWork and isWorkInProgress follow the registry', () => {
    test('both are true while any unit is registered, whatever chat it is bound to, and false once every unit has ended', () => {
        expect(hasAnyWork()).toBe(false)
        expect(isWorkInProgress()).toBe(false)

        const first = open(registerWork({ chaId: 'char-a', chatId: 'chat-a' }))
        const second = open(registerWork({ chaId: 'char-b', chatId: 'chat-b' }))
        expect(hasAnyWork()).toBe(true)
        expect(isWorkInProgress()).toBe(true)

        first.end()
        expect(hasAnyWork()).toBe(true)

        second.end()
        expect(hasAnyWork()).toBe(false)
        expect(isWorkInProgress()).toBe(false)
    })
})
