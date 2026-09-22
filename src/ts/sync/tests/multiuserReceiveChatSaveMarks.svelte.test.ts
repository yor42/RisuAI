/**
 * Report 17 ("CHORE-01 + Phase 2 item 2") Stage 1 §3.2/§3.4, S12:
 *
 * Multiuser `receive-chat` (`src/ts/sync/multiuser.ts`, inside
 * `joinMultiuserRoom()`'s `conn.on('data', ...)` switch) was rewritten to
 * write the received chat IN PLACE into the live selected character instead
 * of `setDatabase(getDatabase({snapshot:true}))`. With the REAL identity
 * tracker (`dbChangeEffects.svelte.ts`) enabled, the OLD handler's whole-db
 * snapshot-and-reassign gave every character a brand-new proxy identity on
 * every received chat, so the identity tracker would mark EVERY character
 * for save, not just the selected one -- a performance regression for
 * guests (plan §3.2, re-review finding F11). This test asserts: the received
 * chat lands in the selected character with `isStreaming` reset, and ONLY
 * that character is marked.
 *
 * Drives the REAL `joinMultiuserRoom()` (through a fake, minimal PeerJS
 * `Peer`/`DataConnection` pair whose events this test fires manually), the
 * REAL `registerDbChangeEffects` (identity tracker included), the REAL
 * `characterSaveMarks.ts`, and the REAL `RisuSaveEncoder` (encode -> decode
 * round trip).
 */
import { flushSync } from 'svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database } from '../../storage/database.svelte'
import type { toSaveType } from '../../storage/risuSave'

//#region module mocks

const memStore = new Map<string, unknown>()

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async (key: string) => memStore.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: unknown) => {
                memStore.set(key, value)
            }),
            removeItem: vi.fn(async (key: string) => {
                memStore.delete(key)
            }),
        }),
    },
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

vi.mock(import('../../platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('../../platform'))

vi.mock(import('../../globalApi.svelte'), () => ({
    readImage: vi.fn(),
    forageStorage: {
        isAccount: false,
        keys: vi.fn(async () => []),
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
    },
    isPlainHttpFileSrc: vi.fn(() => false),
}) as unknown as typeof import('../../globalApi.svelte'))

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
    } as unknown as typeof import('../../stores.svelte')
})

// Faithful to the real getDatabase({snapshot:true}) contract (a deep,
// non-reactive clone) -- this test's RED proof (the pre-fix handler) relies
// on that clone giving every element a brand-new identity, exactly like the
// real $state.snapshot() + structuredClone() does in production.
//
// setDatabase() here also replicates the real function's own isStreaming /
// activeStreamingDisplayOptimizationMode reset loop (database.svelte.ts:714-719)
// over EVERY character's chats, not just the selected one. This matters for the
// OLD (pre-fix) `receive-chat` handler specifically: that handler never reset
// isStreaming itself -- it relied entirely on `setDatabase(db)`'s own side
// effect to do it. A mock that skipped this reset would make the `isStreaming`
// assertion below fail against the OLD handler for the wrong reason (the mock's
// own gap), masking the actual regression this test exists to catch (every
// character getting marked, not just the selected one).
vi.mock(import('../../storage/database.svelte'), async () => {
    const { DBState } = await import('../../stores.svelte')
    return {
        getDatabase: (opts?: { snapshot?: boolean }) =>
            opts?.snapshot ? structuredClone($state.snapshot(DBState.db)) : DBState.db,
        setDatabase: vi.fn((db: Database) => {
            for (const char of db.characters ?? []) {
                for (const chat of char.chats ?? []) {
                    chat.isStreaming = false
                    chat.activeStreamingDisplayOptimizationMode = undefined
                }
            }
            DBState.db = db
        }),
        saveImage: vi.fn(),
        getCurrentChat: vi.fn(),
        setCurrentChat: vi.fn(),
        presetTemplate: { name: 'test-preset' },
    } as unknown as typeof import('../../storage/database.svelte')
})

vi.mock(import('../../alert'), () => ({
    alertError: vi.fn(),
    alertInput: vi.fn(async () => 'test-room-id'),
    alertNormal: vi.fn(),
    alertStore: writable({ type: 'none', msg: '' }),
    alertWait: vi.fn(),
}) as unknown as typeof import('../../alert'))

vi.mock(import('../../util'), () => ({
    findCharacterIndexbyId: vi.fn(() => -1),
    sleep: vi.fn(async () => {}),
}) as unknown as typeof import('../../util'))

vi.mock(import('../../process/index.svelte'), () => ({
    doingChat: writable(false),
}) as unknown as typeof import('../../process/index.svelte'))

/** Minimal fake EventEmitter -- enough to drive PeerJS's on/emit contract deterministically. */
class FakeEmitter {
    private listeners: Record<string, ((...args: unknown[]) => unknown)[]> = {}
    on(event: string, cb: (...args: unknown[]) => unknown) {
        (this.listeners[event] ??= []).push(cb)
        return this
    }
    async emit(event: string, ...args: unknown[]) {
        return Promise.all((this.listeners[event] ?? []).map((cb) => cb(...args)))
    }
}

class FakeConnection extends FakeEmitter {
    send = vi.fn()
    on(event: string, cb: (...args: unknown[]) => unknown) {
        super.on(event, cb)
        // Simulate an immediately-successful connection: by the time the
        // real code's `while(!open){ await sleep(100) }` loop is reached,
        // `open` is already true, so it never has to actually wait.
        if (event === 'open') {
            cb()
        }
        return this
    }
}

const peerRefs = vi.hoisted(() => ({ peer: null as FakeEmitter | null, conn: null as FakeConnection | null }))

class FakePeer extends FakeEmitter {
    constructor(_id: string) {
        super()
        peerRefs.peer = this
    }
    connect(_roomId: string) {
        const conn = new FakeConnection()
        peerRefs.conn = conn
        return conn
    }
}

vi.mock('peerjs', () => ({
    Peer: FakePeer,
}))

//#endregion

import { DBState, selectedCharID } from '../../stores.svelte'
import { joinMultiuserRoom } from '../multiuser'
import { registerDbChangeEffects } from '../../storage/dbChangeEffects.svelte'
import { RisuSaveEncoder, decodeRisuSave } from '../../storage/risuSave'
import { installCharacterSaveMarks, resetCharacterSaveMarksForTest } from '../../storage/characterSaveMarks'

//#region fixtures

type CharacterFixture = Database['characters'][number]

function makeCharacter(chaId: string, name: string): CharacterFixture {
    return {
        chaId,
        name,
        type: 'character',
        chatPage: 0,
        chats: [{ id: `${chaId}-chat-0`, message: [{ role: 'user', data: 'hi', time: 1 }], note: '', name: '', localLore: [] }],
    } as unknown as CharacterFixture
}

function installDb(): void {
    DBState.db = {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characterOrder: ['char-0', 'char-1'],
        characters: [
            makeCharacter('char-0', 'Character Zero (selected)'),
            makeCharacter('char-1', 'Character One (not selected)'),
        ],
    } as unknown as Database
}

function makeTracker(): toSaveType {
    return {
        character: [],
        chat: [],
        botPreset: false,
        modules: false,
        loadouts: false,
        plugins: false,
        pluginCustomStorage: false,
    }
}

function snapshotDb(db: Database): Database {
    return $state.snapshot(db) as Database
}

afterEach(() => {
    resetCharacterSaveMarksForTest()
    peerRefs.peer = null
    peerRefs.conn = null
})

//#endregion

describe('Multiuser receive-chat — Report 17 Stage 1 S12', () => {
    test('the received chat lands in the selected character with isStreaming reset, and ONLY that character is marked', async () => {
        installDb()
        selectedCharID.set(0)

        const tracker = makeTracker()
        const markChanged = vi.fn()
        const cleanup = $effect.root(() => {
            registerDbChangeEffects({ tracker, markChanged }) // identity tracker included, per F11
        })
        flushSync()
        installCharacterSaveMarks({ tracker, schedule: () => {} })

        const encoder = new RisuSaveEncoder()
        await encoder.init(snapshotDb(DBState.db), { compression: false })
        tracker.character = tracker.character.length === 0 ? [] : [tracker.character[0]]

        await joinMultiuserRoom()
        expect(peerRefs.peer).toBeTruthy()
        await peerRefs.peer!.emit('open', 'fake-peer-id')
        expect(peerRefs.conn).toBeTruthy()

        const incomingChat = {
            id: 'char-0-chat-0',
            message: [{ role: 'user', data: 'hi', time: 1 }, { role: 'char', data: 'received reply', time: 2 }],
            note: '',
            name: '',
            localLore: [],
            isStreaming: true,
            activeStreamingDisplayOptimizationMode: 'strong',
        }
        await peerRefs.conn!.emit('data', { type: 'receive-chat', data: incomingChat })
        flushSync()

        // Lands in the live selected character, in place.
        expect(DBState.db.characters[0].chats[0].message).toHaveLength(2)
        expect(DBState.db.characters[0].chats[0].isStreaming).toBe(false)
        expect(DBState.db.characters[0].chats[0].activeStreamingDisplayOptimizationMode).toBeUndefined()

        const toSave = structuredClone(tracker) as toSaveType
        // ONLY the selected character is marked -- not char-1.
        expect(toSave.character).toEqual(['char-0'])

        await encoder.set(snapshotDb(DBState.db), toSave)
        const decoded = await decodeRisuSave(new Uint8Array(encoder.encode()!))
        const decodedChar0 = decoded.characters?.find((c: CharacterFixture) => c.chaId === 'char-0')
        expect(decodedChar0?.chats[0].message).toHaveLength(2)
        expect(decodedChar0?.chats[0].isStreaming).toBe(false)

        cleanup()
    })
})
