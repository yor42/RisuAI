import { describe, test, expect, vi } from 'vitest'

// Separate from risuSave.test.ts because remote-block encoding requires
// isNodeServer/isTauri to be true (eligibility gate in encodeBlock()) and a
// database with enableRemoteSaving explicitly set — a different mock shape
// than the base fixture file uses, so this stays a dedicated module-mocked
// suite rather than trying to toggle the existing one per-test.

const remoteStore = new Map<string, Uint8Array>()

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock(
    import('src/ts/globalApi.svelte'),
    () =>
        ({
            forageStorage: {
                keys: vi.fn(async () => Array.from(remoteStore.keys())),
                getItem: vi.fn(async (key: string) => remoteStore.get(key) ?? null),
                setItem: vi.fn(async (key: string, value: Uint8Array) => {
                    remoteStore.set(key, value)
                }),
                removeItem: vi.fn(async (key: string) => {
                    remoteStore.delete(key)
                }),
            },
        }) as unknown as typeof import('src/ts/globalApi.svelte'),
)

vi.mock(
    import('src/ts/storage/database.svelte'),
    () =>
        ({
            getDatabase: vi.fn(() => ({ enableRemoteSaving: true })),
            presetTemplate: { name: 'test-preset' },
        }) as unknown as typeof import('src/ts/storage/database.svelte'),
)

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: true,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

import { RisuSaveEncoder, decodeRisuSave } from '../risuSave'
import type { Database } from '../database.svelte'

function buildFixtureDb(chaData: string): Database {
    return {
        formatversion: 5,
        botPresets: [],
        botPresetsId: 0,
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters: [
            {
                chaId: 'char-remote-1',
                type: 'character',
                name: 'Test Character',
                data: chaData,
                chats: [],
            },
        ],
    } as unknown as Database
}

async function encodeFixture(chaData: string): Promise<Uint8Array> {
    const encoder = new RisuSaveEncoder()
    await encoder.init(buildFixtureDb(chaData), { skipRemoteSavingOnCharacters: false })
    const encoded = encoder.encode()
    expect(encoded).not.toBeNull()
    return new Uint8Array(encoded!)
}

// Note: this covers only the content-addressed naming/encode/decode change
// (Phase 1.5 Tier B Stage 3a, naming-only — see Agents/Roadmap.md and
// Agents/Reports/08-remote-block-gc-transactional-safety.md). The GC
// concurrency machinery this suite previously also covered
// (decodeRemotePointers, withRemoteBlockGcLock) was removed after Report 08
// found the GC protocol needed to make automatic reclamation safe is a much
// larger undertaking than initially scoped; the naming change ships without
// automatic reclamation, and superseded remote blocks are left unmanaged by
// the existing (unmodified, pre-existing) cleanChunks() GC path, which only
// ever recognizes the legacy bare-name (`.local.bin`) shape.
describe('Remote block content-addressed naming (Phase 1.5 Tier B Stage 3a, naming-only)', () => {
    test('publishes a v2 pointer whose hash resolves to a real remotes/ key', async () => {
        remoteStore.clear()
        await encodeFixture('hello world')
        const remoteKeys = Array.from(remoteStore.keys())
        expect(remoteKeys.length).toBe(1)
        expect(remoteKeys[0]).toMatch(/^remotes\/char-remote-1\.[0-9a-f]{16}\.bin$/)
    })

    test('round-trips through decode — the character is recovered via its remote block', async () => {
        remoteStore.clear()
        const encoded = await encodeFixture('round trip payload')
        const decoded = await decodeRisuSave(encoded)
        const cha = decoded.characters?.find((c: any) => c.chaId === 'char-remote-1') as any
        expect(cha?.data).toBe('round trip payload')
    })

    test('identical content re-encodes to the same key (dedup, idempotent no-op)', async () => {
        remoteStore.clear()
        await encodeFixture('same content')
        expect(remoteStore.size).toBe(1)
        const firstKey = Array.from(remoteStore.keys())[0]
        await encodeFixture('same content')
        expect(remoteStore.size).toBe(1)
        expect(Array.from(remoteStore.keys())[0]).toBe(firstKey)
    })

    test('different content produces a different key (no silent overwrite of a superseded version)', async () => {
        remoteStore.clear()
        await encodeFixture('content A')
        const keyA = Array.from(remoteStore.keys())[0]
        await encodeFixture('content B')
        const keys = Array.from(remoteStore.keys())
        // Both versions still present in storage — reclaiming the superseded
        // one is explicitly out of scope for this change; see the note above.
        expect(keys).toContain(keyA)
        expect(keys.length).toBe(2)
    })
})
