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
import type { toSaveType } from '../risuSave'
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

// Report 17 ("CHORE-01 + Phase 2 item 2") Stage 1 §3.4, S8 (guard): a marked
// id whose character still exists in `data.characters` is RE-ENCODED by
// set(), never deleted -- deletion (risuSave.ts's "Deleting character data"
// branch) only drops ids that are in `toSave.character` but NOT found in
// `data.characters` this pass (i.e. genuinely removed characters), never an
// id that is simply marked-and-still-present. This is the invariant CHORE-01
// leans on: marking a character "extra" (e.g. every character on a plugin
// setDatabase call, or a duplicate identity-tracker + explicit mark) is
// always safe.
describe('RisuSaveEncoder.set() — marked-but-still-present characters are re-encoded, not deleted (Report 17 Stage 1 S8)', () => {
    function buildTwoCharacterDb(): Database {
        return {
            formatversion: 5,
            botPresets: [],
            botPresetsId: 0,
            modules: [],
            loadouts: [],
            plugins: [],
            pluginCustomStorage: {},
            characters: [
                { chaId: 'char1', type: 'character', name: 'Character One', chats: [] },
                { chaId: 'char2', type: 'character', name: 'Character Two', chats: [] },
            ],
        } as unknown as Database
    }

    function makeToSave(character: string[]): toSaveType {
        return {
            character,
            chat: [],
            botPreset: false,
            modules: false,
            loadouts: false,
            plugins: false,
            pluginCustomStorage: false,
        }
    }

    test('marking BOTH ids (one redundantly) re-encodes both; neither is deleted', async () => {
        const db = buildTwoCharacterDb()
        const encoder = new RisuSaveEncoder()
        await encoder.init(db)

        // Mutate char1 in place, then mark BOTH ids -- char2 didn't change at
        // all, so marking it here is the "extra, redundant mark" case
        // (identity tracker + explicit mark both firing, or a plugin
        // setDatabase marking every character) that must stay harmless.
        db.characters[0].name = 'Character One (edited)'
        const toSave = makeToSave(['char1', 'char2'])

        await encoder.set(db, toSave)
        const decoded = await decodeRisuSave(new Uint8Array(encoder.encode()!))

        const decodedChar1 = decoded.characters?.find((c: any) => c.chaId === 'char1')
        const decodedChar2 = decoded.characters?.find((c: any) => c.chaId === 'char2')
        expect(decodedChar1).toBeTruthy()
        expect(decodedChar1!.name).toBe('Character One (edited)')
        expect(decodedChar2).toBeTruthy()
        expect(decodedChar2!.name).toBe('Character Two') // unchanged, but still present -- not deleted
    })

    test('a genuinely removed character (in toSave.character but absent from data.characters) IS deleted', async () => {
        const db = buildTwoCharacterDb()
        const encoder = new RisuSaveEncoder()
        await encoder.init(db)

        // char2 removed from the live array entirely (e.g. removeChar's
        // 'permanent' path), and its id is still in toSave.character (e.g. it
        // was marked before being removed in the same save cycle).
        const dbAfterRemoval: Database = { ...db, characters: [db.characters[0]] } as unknown as Database
        const toSave = makeToSave(['char2'])

        await encoder.set(dbAfterRemoval, toSave)
        const decoded = await decodeRisuSave(new Uint8Array(encoder.encode()!))

        expect(decoded.characters?.find((c: any) => c.chaId === 'char2')).toBeUndefined()
        expect(decoded.characters?.find((c: any) => c.chaId === 'char1')).toBeTruthy()
    })
})

// Report 17 Stage 1 Gate 2 should-fix (memory) (proxy release): `takeEncodedCharacterProxies()`
// replaces `getEncodedCharacterProxies()` -- instead of a read-only peek, it
// hands the caller the recorded set AND resets the internal one to a fresh,
// empty `Set`, so each recorded proxy is consumed exactly once. Used once for
// the identity-tracker seed at boot, and once per reload by
// `prepareSaveIteration`'s post-reload filter (see globalApi.saveSequence.svelte.test.ts).
describe('RisuSaveEncoder.takeEncodedCharacterProxies() — Report 17 Stage 1 Gate 2 (B2 fix, proxy release)', () => {
    function buildTwoCharacterDbForProxyTest(): Database {
        return {
            formatversion: 5,
            botPresets: [],
            botPresetsId: 0,
            modules: [],
            loadouts: [],
            plugins: [],
            pluginCustomStorage: {},
            characters: [
                { chaId: 'char1', type: 'character', name: 'Character One', chats: [] },
                { chaId: 'char2', type: 'character', name: 'Character Two', chats: [] },
            ],
        } as unknown as Database
    }

    test('after init() on a 2-character database, the first call returns both character objects; a second call returns an empty set', async () => {
        const db = buildTwoCharacterDbForProxyTest()
        const encoder = new RisuSaveEncoder()
        await encoder.init(db)

        const firstTake = encoder.takeEncodedCharacterProxies()
        expect(firstTake.size).toBe(2)
        expect(firstTake.has(db.characters[0])).toBe(true)
        expect(firstTake.has(db.characters[1])).toBe(true)

        const secondTake = encoder.takeEncodedCharacterProxies()
        expect(secondTake.size).toBe(0)
    })
})
