import { describe, test, expect, vi } from 'vitest'

//#region module mocks — keep the unit under test isolated from the rest of
// the app's (heavy, side-effecting) dependency graph, matching the pattern
// used in src/ts/process/files/tests/inlays.test.ts.

const store = new Map<string, unknown>()

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async (key: string) => store.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: unknown) => {
                store.set(key, value)
            }),
            removeItem: vi.fn(async (key: string) => {
                store.delete(key)
            }),
        }),
    },
}))

vi.mock(
    import('src/ts/globalApi.svelte'),
    () =>
        ({
            forageStorage: {
                keys: vi.fn(async () => []),
                getItem: vi.fn(async () => null),
                setItem: vi.fn(async () => {}),
            },
            // AV-3 (Report 15 §2.2, gate L6): getFileSrcCached calls this predicate.
            isPlainHttpFileSrc: vi.fn(() => false),
        }) as unknown as typeof import('src/ts/globalApi.svelte'),
)

vi.mock(
    import('src/ts/storage/database.svelte'),
    () =>
        ({
            getDatabase: vi.fn(() => { throw new Error('no live database in tests') }),
            presetTemplate: { name: 'test-preset' },
        }) as unknown as typeof import('src/ts/storage/database.svelte'),
)

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

//#endregion

import { RisuSaveEncoder, RisuSaveDecoder, decodeRisuSave } from '../risuSave'
import type { Database } from '../database.svelte'

const ROOT_MARKER = 'ROOT_MARKER_XYZ'

function buildFixtureDb(): Database {
    return {
        formatversion: 5,
        marker: ROOT_MARKER,
        botPresets: [],
        botPresetsId: 0,
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters: [
            {
                chaId: 'char1',
                type: 'character',
                name: 'Test Character',
                chats: [],
            },
        ],
    } as unknown as Database
}

/** Finds the byte offset of the UTF-8 encoding of `needle` within `haystack`. */
function findByteOffset(haystack: Uint8Array, needle: string): number {
    const needleBytes = new TextEncoder().encode(needle)
    outer: for (let i = 0; i <= haystack.length - needleBytes.length; i++) {
        for (let j = 0; j < needleBytes.length; j++) {
            if (haystack[i + j] !== needleBytes[j]) continue outer
        }
        return i
    }
    return -1
}

async function encodeFixture(): Promise<Uint8Array> {
    const encoder = new RisuSaveEncoder()
    await encoder.init(buildFixtureDb())
    const encoded = encoder.encode()
    expect(encoded).not.toBeNull()
    return new Uint8Array(encoded!)
}

describe('RisuSave per-block checksum (Phase 1 item 11)', () => {
    test('round-trips cleanly when nothing is corrupted', async () => {
        const encoded = await encodeFixture()
        const decoded = await decodeRisuSave(encoded)
        expect(decoded.characters?.[0]?.chaId).toBe('char1')
        expect((decoded as any).marker).toBe(ROOT_MARKER)
    })

    test('drops a corrupted non-root block instead of silently loading wrong data', async () => {
        const encoded = await encodeFixture()
        // Search for the JSON-content occurrence specifically (`"chaId":"char1"`),
        // not the bare block-name field earlier in the same block's header —
        // a character block is literally named after its own chaId, so a
        // naive search for "char1" alone finds that name field first, which
        // the checksum deliberately does NOT cover (see encodeRawBlock: the
        // checksum is computed over `databuf`, i.e. only the data payload
        // after the length field, not the preceding name field) — corrupting
        // it wouldn't exercise this feature at all.
        const marker = '"chaId":"char1"'
        const offset = findByteOffset(encoded, marker)
        expect(offset).toBeGreaterThan(-1)
        const corrupted = new Uint8Array(encoded)
        // Flip only the low bit of one ASCII letter (the 'c' in "char1",
        // landing inside the quotes, not on them) so the corrupted byte is
        // still a printable letter and the JSON stays syntactically valid —
        // this is the "bit-flip that parses fine but is silently wrong"
        // scenario item 11 exists to catch, not something JSON.parse alone
        // would already reject.
        corrupted[offset + '"chaId":"'.length] ^= 0x01
        const decoded = await decodeRisuSave(corrupted)
        // The block never parses successfully at all (checksum mismatch), so
        // `db.characters` is never even initialized — not an empty array.
        expect(decoded.characters?.some((c: any) => c.chaId === 'char1') ?? false).toBe(false)
    })

    test('root block corruption throws instead of degrading to a near-empty database', async () => {
        const encoded = await encodeFixture()
        const offset = findByteOffset(encoded, ROOT_MARKER)
        expect(offset).toBeGreaterThan(-1)
        const corrupted = new Uint8Array(encoded)
        corrupted[offset] ^= 0x01
        // Test RisuSaveDecoder directly rather than decodeRisuSave() — the
        // latter has its own pre-existing legacy-format fallback chain in its
        // outer catch, unrelated to this checksum feature, that could mask
        // whether THIS mechanism specifically detected the corruption.
        const decoder = new RisuSaveDecoder(true)
        await expect(decoder.decode(corrupted)).rejects.toThrow()
    })

    test('decodes a legacy (pre-checksum, v1) buffer with no trailing checksum expected', async () => {
        // Hand-built minimal v1-format buffer: version byte 0 (no checksum
        // trailer on any block), one ROOT block. Verifies old, already-saved
        // files from before this change keep decoding exactly as before.
        const header = new TextEncoder().encode('RISUSAVE\0')
        const name = new TextEncoder().encode('root')
        const content = JSON.stringify({ hello: 'world' })
        const dataBuf = new TextEncoder().encode(content)
        const lengthBuf = new Uint8Array(4)
        new DataView(lengthBuf.buffer).setUint32(0, dataBuf.length, true)
        const ROOT_TYPE = 1 // RisuSaveType.ROOT
        const block = new Uint8Array(2 + 1 + name.length + 4 + dataBuf.length)
        block.set([ROOT_TYPE, 0], 0)
        block.set([name.length], 2)
        block.set(name, 3)
        block.set(lengthBuf, 3 + name.length)
        block.set(dataBuf, 7 + name.length)
        const full = new Uint8Array(header.length + block.length)
        full.set(header, 0)
        full.set(block, header.length)

        const decoded: any = await decodeRisuSave(full)
        expect(decoded.hello).toBe('world')
    })

    test('corrupted framing (a block\'s name field) aborts decoding entirely rather than desyncing later blocks', async () => {
        const encoded = await encodeFixture()
        // Target the 'preset' block's own name field specifically (not its
        // content) — a byte here is covered by the HEADER checksum, not the
        // data checksum, so this exercises the framing-corruption path
        // (which must abort the whole decode, since block boundaries can no
        // longer be trusted) rather than the payload-corruption path (which
        // safely drops just one block and continues).
        const offset = findByteOffset(encoded, 'preset')
        expect(offset).toBeGreaterThan(-1)
        const corrupted = new Uint8Array(encoded)
        corrupted[offset] ^= 0x01
        const decoder = new RisuSaveDecoder(true)
        await expect(decoder.decode(corrupted)).rejects.toThrow()
    })

    test('rejects a buffer with an unrecognized format-version byte instead of silently treating it as legacy', async () => {
        const encoded = await encodeFixture()
        const versionByteOffset = 8 // right after the 8-byte "RISUSAVE" prefix
        expect(encoded[versionByteOffset]).toBe(1) // sanity check: this encoder always writes v2
        const corrupted = new Uint8Array(encoded)
        corrupted[versionByteOffset] = 2 // neither a recognized v1 (0) nor v2 (1) value
        await expect(decodeRisuSave(corrupted)).rejects.toThrow()
    })

    test('a root block whose type byte no longer says ROOT is treated as having no root at all (v1, no checksum coverage)', async () => {
        // Hand-built v1 buffer (see the legacy-decode test above) with a
        // single block that claims a non-ROOT type. Without checksums to
        // catch a corrupted type byte directly, this is exactly the
        // scenario the post-loop "was a root block actually processed"
        // invariant exists to catch — decode must still fail rather than
        // silently return an empty-but-plausible database.
        const header = new TextEncoder().encode('RISUSAVE\0')
        const name = new TextEncoder().encode('root')
        const content = JSON.stringify({ hello: 'world' })
        const dataBuf = new TextEncoder().encode(content)
        const lengthBuf = new Uint8Array(4)
        new DataView(lengthBuf.buffer).setUint32(0, dataBuf.length, true)
        const NOT_ROOT_TYPE = 5 // RisuSaveType.MODULES, not ROOT
        const block = new Uint8Array(2 + 1 + name.length + 4 + dataBuf.length)
        block.set([NOT_ROOT_TYPE, 0], 0)
        block.set([name.length], 2)
        block.set(name, 3)
        block.set(lengthBuf, 3 + name.length)
        block.set(dataBuf, 7 + name.length)
        const full = new Uint8Array(header.length + block.length)
        full.set(header, 0)
        full.set(block, header.length)

        await expect(decodeRisuSave(full)).rejects.toThrow()
    })
})
