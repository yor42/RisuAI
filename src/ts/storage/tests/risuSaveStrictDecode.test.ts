import { describe, test, expect, vi, beforeEach } from 'vitest'
import * as fflate from 'fflate'

// Strict decoding is for callers that must not act on a partial reading of a
// save file: every block the file promises has to be present and intact, and
// nothing may be answered from the IndexedDB block cache or from a legacy
// format. The default decode stays lenient for every other caller.
//
// Platform boundaries mocked here: the IndexedDB block cache (localforage),
// the shared storage the remote blocks live in (`forageStorage`), the live
// database flag that enables remote saving, and the platform flags.

const { cacheStore, remoteStore, remoteFlag } = vi.hoisted(() => ({
    cacheStore: new Map<string, unknown>(),
    remoteStore: new Map<string, Uint8Array>(),
    remoteFlag: { enabled: false },
}))

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async (key: string) => cacheStore.get(key) ?? null),
            setItem: vi.fn(async (key: string, value: unknown) => {
                cacheStore.set(key, value)
            }),
            removeItem: vi.fn(async (key: string) => {
                cacheStore.delete(key)
            }),
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
            isPlainHttpFileSrc: vi.fn(() => false),
        }) as unknown as typeof import('src/ts/globalApi.svelte'),
)

vi.mock(
    import('src/ts/storage/database.svelte'),
    () =>
        ({
            getDatabase: vi.fn(() => ({ enableRemoteSaving: remoteFlag.enabled })),
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
import type { toSaveType } from '../risuSave'
import type { Database } from '../database.svelte'

beforeEach(() => {
    cacheStore.clear()
    remoteStore.clear()
    remoteFlag.enabled = false
})

//#region file-level helpers: parse, rewrite and reassemble the block container

const FILE_HEADER_LENGTH = 9 // "RISUSAVE" plus the format version byte

interface RawBlock {
    type: number
    compression: number
    name: string
    payload: Uint8Array
}

const crcTable = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[n] = c
    }
    return table
})()

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (let i = 0; i < data.length; i++) {
        crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}

function u32le(value: number): Uint8Array {
    const out = new Uint8Array(4)
    new DataView(out.buffer).setUint32(0, value, true)
    return out
}

function readU32le(data: Uint8Array, offset: number): number {
    return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true)
}

function parseBlocks(file: Uint8Array): RawBlock[] {
    const blocks: RawBlock[] = []
    let offset = FILE_HEADER_LENGTH
    while (offset < file.length) {
        const type = file[offset]
        const compression = file[offset + 1]
        const nameLength = file[offset + 2]
        const name = new TextDecoder().decode(file.subarray(offset + 3, offset + 3 + nameLength))
        offset += 3 + nameLength
        const length = readU32le(file, offset)
        offset += 4 + 4 // length field, then the header checksum
        const payload = file.slice(offset, offset + length)
        offset += length + 4 // payload, then the data checksum
        blocks.push({ type, compression, name, payload })
    }
    return blocks
}

function serializeBlock(block: RawBlock, options: { breakDataChecksum?: boolean } = {}): Uint8Array {
    const nameBytes = new TextEncoder().encode(block.name)
    const header = new Uint8Array(3 + nameBytes.length + 4)
    header.set([block.type, block.compression, nameBytes.length], 0)
    header.set(nameBytes, 3)
    header.set(u32le(block.payload.length), 3 + nameBytes.length)
    const dataChecksum = (crc32(block.payload) ^ (options.breakDataChecksum ? 0xffffffff : 0)) >>> 0
    const out = new Uint8Array(header.length + 4 + block.payload.length + 4)
    out.set(header, 0)
    out.set(u32le(crc32(header)), header.length)
    out.set(block.payload, header.length + 4)
    out.set(u32le(dataChecksum), header.length + 4 + block.payload.length)
    return out
}

function assemble(
    file: Uint8Array,
    blocks: RawBlock[],
    options: { breakDataChecksumOf?: string } = {},
): Uint8Array {
    const parts = blocks.map((block) =>
        serializeBlock(block, { breakDataChecksum: block.name === options.breakDataChecksumOf }),
    )
    const total = FILE_HEADER_LENGTH + parts.reduce((sum, part) => sum + part.length, 0)
    const out = new Uint8Array(total)
    out.set(file.subarray(0, FILE_HEADER_LENGTH), 0)
    let offset = FILE_HEADER_LENGTH
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

function replacePayload(file: Uint8Array, name: string, payload: Uint8Array, compression = 0): Uint8Array {
    const blocks = parseBlocks(file)
    const target = blocks.find((block) => block.name === name)
    expect(target, `block ${name} is present`).toBeTruthy()
    target!.payload = payload
    target!.compression = compression
    return assemble(file, blocks)
}

function breakDataChecksum(file: Uint8Array, name: string): Uint8Array {
    const blocks = parseBlocks(file)
    expect(blocks.some((block) => block.name === name), `block ${name} is present`).toBe(true)
    return assemble(file, blocks, { breakDataChecksumOf: name })
}

function retypeBlock(file: Uint8Array, name: string, type: number): Uint8Array {
    const blocks = parseBlocks(file)
    const target = blocks.find((block) => block.name === name)
    expect(target, `block ${name} is present`).toBeTruthy()
    target!.type = type
    return assemble(file, blocks)
}

function removeBlock(file: Uint8Array, name: string): Uint8Array {
    const blocks = parseBlocks(file)
    const remaining = blocks.filter((block) => block.name !== name)
    expect(remaining.length).toBe(blocks.length - 1)
    return assemble(file, remaining)
}

//#endregion

//#region fixture builders

let fixtureCounter = 0

function makeToSave(): toSaveType {
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

interface Fixture {
    file: Uint8Array
    firstId: string
    secondId: string
}

/**
 * Encodes a two-character database. The remote-block store keys embed a hash
 * of the content, and the encoder remembers which remote files this page load
 * already wrote, so every fixture uses ids and content no other fixture in
 * this file has used.
 */
async function buildFixture(options: { remote?: boolean; compression?: boolean } = {}): Promise<Fixture> {
    const n = ++fixtureCounter
    const firstId = `strict-a-${n}`
    const secondId = `strict-b-${n}`
    const db = {
        formatversion: 5,
        botPresets: [],
        botPresetsId: 0,
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters: [
            { chaId: firstId, type: 'character', name: `First ${n}`, chats: [] },
            { chaId: secondId, type: 'character', name: `Second ${n}`, chats: [] },
        ],
    } as unknown as Database

    remoteFlag.enabled = options.remote === true
    const encoder = new RisuSaveEncoder()
    await encoder.init(db, {
        compression: options.compression ?? false,
        skipRemoteSavingOnCharacters: false,
    })
    // set() is what writes the root block's block directory.
    await encoder.set(db, makeToSave())
    remoteFlag.enabled = false
    const encoded = encoder.encode()
    expect(encoded).not.toBeNull()
    return { file: new Uint8Array(encoded!), firstId, secondId }
}

/** The four ways a file can be short of what it promises; each yields bytes and the id of the affected character. */
const damagedFileBuilders: Record<string, () => Promise<{ file: Uint8Array; affectedId: string }>> = {
    'a non-root block fails its data checksum': async () => {
        const { file, firstId } = await buildFixture()
        return { file: breakDataChecksum(file, firstId), affectedId: firstId }
    },
    'a non-root block does not parse as JSON': async () => {
        const { file, firstId } = await buildFixture()
        const notJson = new TextEncoder().encode('{"chaId": not json')
        return { file: replacePayload(file, firstId, notJson), affectedId: firstId }
    },
    'a remote block names a file that is missing': async () => {
        const { file, firstId } = await buildFixture({ remote: true })
        const remoteKeys = Array.from(remoteStore.keys()).filter((key) => key.includes(firstId))
        expect(remoteKeys.length).toBe(1)
        remoteStore.delete(remoteKeys[0])
        return { file, affectedId: firstId }
    },
    'a block has a type this reader does not know': async () => {
        const { file, firstId } = await buildFixture()
        return { file: retypeBlock(file, firstId, 99), affectedId: firstId }
    },
    'a remote pointer has a version this reader does not know': async () => {
        const { file, firstId } = await buildFixture({ remote: true })
        const pointer = parseBlocks(file).find((block) => block.name === firstId)
        expect(pointer, 'the remote pointer block is present').toBeTruthy()
        const info = JSON.parse(new TextDecoder().decode(pointer!.payload)) as { v: number }
        expect(info.v).toBe(2)
        const unknownVersion = new TextEncoder().encode(JSON.stringify({ ...info, v: 3 }))
        return { file: replacePayload(file, firstId, unknownVersion), affectedId: firstId }
    },
    'a directory entry is absent from the file and only the block cache holds it': async () => {
        const { file, firstId } = await buildFixture()
        expect(cacheStore.has(`risuSaveBlock_${firstId}`)).toBe(true)
        return { file: removeBlock(file, firstId), affectedId: firstId }
    },
}

//#endregion

function characterIds(decoded: Database): string[] {
    return (decoded.characters ?? []).map((character) => character.chaId as string)
}

/**
 * Collects every promise rejection nobody handled while it is listening. A
 * decompression failure surfaces on the stream's writer promise, which only
 * shows up as an unhandled rejection a few ticks after the decode returns, so
 * `stop()` waits before reporting.
 */
function watchUnhandledRejections() {
    const seen: unknown[] = []
    const listener = (reason: unknown) => { seen.push(reason) }
    process.on('unhandledRejection', listener)
    return {
        async stop(): Promise<unknown[]> {
            await new Promise((resolve) => setTimeout(resolve, 50))
            process.off('unhandledRejection', listener)
            return seen
        },
    }
}

/** A file whose first character block is flagged compressed but holds bytes that are not gzip data, with valid checksums. */
async function buildFileWithUndecompressibleBlock(): Promise<Uint8Array> {
    const { file, firstId } = await buildFixture()
    const notGzip = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    return replacePayload(file, firstId, notGzip, 1)
}

describe('a compressed non-root block whose payload cannot be decompressed', () => {
    test('strict decoding rejects and leaves no unhandled rejection behind', async () => {
        const file = await buildFileWithUndecompressibleBlock()
        const watch = watchUnhandledRejections()
        let outcome: unknown = 'resolved'
        try {
            outcome = await decodeRisuSave(file, { strict: true }).then(() => 'resolved', (error: unknown) => error)
        } finally {
            const unhandled = await watch.stop()
            expect(unhandled).toEqual([])
        }
        expect(outcome).toBeInstanceOf(Error)
    })

    test('default decoding resolves and leaves no unhandled rejection behind', async () => {
        const file = await buildFileWithUndecompressibleBlock()
        const watch = watchUnhandledRejections()
        let decoded: Database | null = null
        try {
            decoded = await decodeRisuSave(file)
        } finally {
            const unhandled = await watch.stop()
            expect(unhandled).toEqual([])
        }
        expect(Array.isArray(decoded?.botPresets)).toBe(true)
    })
})

describe('strict decoding of a RisuSave file', () => {
    describe.each(Object.entries(damagedFileBuilders))('when %s', (_label, build) => {
        test('strict decoding rejects', async () => {
            const { file } = await build()
            await expect(decodeRisuSave(file, { strict: true })).rejects.toThrow()
        })

        test('guard: default decoding of the same bytes still resolves', async () => {
            const { file } = await build()
            const decoded = await decodeRisuSave(file)
            expect(decoded).toBeTruthy()
            expect(Array.isArray(decoded.botPresets)).toBe(true)
        })
    })

    test('guard: default decoding answers a directory entry missing from the file out of the block cache', async () => {
        const { file, affectedId } = await damagedFileBuilders[
            'a directory entry is absent from the file and only the block cache holds it'
        ]()
        const decoded = await decodeRisuSave(file)
        expect(characterIds(decoded)).toContain(affectedId)
    })

    test('guard: default decoding replaces a block that fails its data checksum with the block cache copy', async () => {
        const { file, affectedId } = await damagedFileBuilders['a non-root block fails its data checksum']()
        const decoded = await decodeRisuSave(file)
        expect(characterIds(decoded)).toContain(affectedId)
        expect(characterIds(decoded).length).toBe(2)
    })

    test('guard: default decoding skips a block that does not parse as JSON and keeps the others', async () => {
        const { file, affectedId } = await damagedFileBuilders['a non-root block does not parse as JSON']()
        const decoded = await decodeRisuSave(file)
        expect(characterIds(decoded)).not.toContain(affectedId)
        expect(characterIds(decoded).length).toBe(1)
    })

    test('guard: strict decoding of an intact file equals default decoding', async () => {
        const { file, firstId, secondId } = await buildFixture()
        const lenient = await decodeRisuSave(file)
        const strict = await decodeRisuSave(file, { strict: true })
        expect(characterIds(strict).sort()).toEqual([firstId, secondId].sort())
        expect(strict).toEqual(lenient)
    })

    test('guard: strict decoding of an intact file whose blocks are compressed equals default decoding', async () => {
        const { file } = await buildFixture({ compression: true })
        const lenient = await decodeRisuSave(file)
        const strict = await decodeRisuSave(file, { strict: true })
        expect(characterIds(strict).length).toBe(2)
        expect(strict).toEqual(lenient)
    })

    test('guard: strict decoding of an intact file whose characters live in remote blocks equals default decoding', async () => {
        const { file, firstId, secondId } = await buildFixture({ remote: true })
        expect(remoteStore.size).toBe(2)
        const lenient = await decodeRisuSave(file)
        const strict = await decodeRisuSave(file, { strict: true })
        expect(characterIds(strict).sort()).toEqual([firstId, secondId].sort())
        expect(strict).toEqual(lenient)
    })

    describe('bytes that are not a RisuSave file', () => {
        function gzippedJson(): Uint8Array {
            return fflate.gzipSync(new TextEncoder().encode(JSON.stringify({ notARisuSave: true })))
        }

        test('strict decoding rejects instead of falling back to a legacy format', async () => {
            await expect(decodeRisuSave(gzippedJson(), { strict: true })).rejects.toThrow()
        })

        test('guard: default decoding of the same bytes still resolves through the legacy fallback', async () => {
            const decoded = await decodeRisuSave(gzippedJson())
            expect((decoded as unknown as { notARisuSave: boolean }).notARisuSave).toBe(true)
        })
    })
})
