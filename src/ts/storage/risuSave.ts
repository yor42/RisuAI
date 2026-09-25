import { Packr, Unpackr, decode } from "msgpackr/index-no-eval";
import * as fflate from "fflate";
import { getDatabase, presetTemplate, type Database } from "./database.svelte";
import localforage from "localforage";
import { forageStorage } from "../globalApi.svelte";
import { isNodeServer, isTauri } from "src/ts/platform"
import { createYieldBudget } from "./saveYield"
import {
    writeFile,
    BaseDirectory,
    exists,
    mkdir,
    readFile,
} from "@tauri-apps/plugin-fs"

const packr = new Packr({
    useRecords:false
});

const unpackr = new Unpackr({
    int64AsType: 'number',
    useRecords:false
})

const disableRemoteSaving = () => {
    try {
        const db = getDatabase()
        return !db.enableRemoteSaving
    } catch (error) {
        return true
    }
}
// CHORE-17 Stage B (plan Report 18 §3): remote file names this page load has
// written successfully or confirmed to exist. `encodeRemoteBlock` skips a
// rewrite whenever a name is already in here (except on account storage,
// which neither reads nor records it). Module-level (not per-encoder), so
// this also applies after `reinitEncoder()` reloads. Upstream commit
// f484ed72 makes a full reload pass `skipRemoteSavingOnCharacters: false`,
// which on its own rewrites every character's remote file unconditionally;
// this set skips a file already written this page load regardless. Safe
// because remote file names are content-addressed and nothing in this build
// deletes them (plan fact 7); a `cleanChunks` bug in older clients sharing
// the same Node server can still delete a hash-named file after 7 days (plan
// fact 7, Gate 1 M3).
const checkedRemoteExistence = new Set<string>();

/**
 * Content-addressing hash for remote character blocks (Phase 1.5 Tier B
 * Stage 3a — see Agents/Reports/07-remote-block-versioning-design.md).
 * Truncated to 16 hex chars (64 bits) — ample collision resistance for a
 * per-character, per-user keyspace, keeps filenames short. Deliberately a
 * small local helper rather than reusing `hasher()` from
 * `src/ts/parser/parser.svelte.ts` (also SHA-256-based, same convention
 * `saveAsset()` already established for asset addressing) — importing that
 * module here would pull in its large, UI-adjacent dependency graph for no
 * benefit, since the hashing itself is a three-line primitive already used
 * inline in several other files in this codebase (e.g. mcplib.ts,
 * filesystemclient.ts).
 */
async function hashRemoteBlockContent(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16)
}

const magicHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7]);
const magicCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 8]);
const magicStreamCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9]);
// The 9th byte doubles as a format-version marker within the "RISUSAVE"
// block format: 0 = original (no per-block checksum trailer), 1 = adds a
// 4-byte CRC32 trailer to every block (see encodeRawBlock/RisuSaveDecoder
// below) so a bit-flip inside a block parses as corrupted instead of
// silently becoming wrong-but-valid-looking data. `magicRisuSavePrefix` (the
// first 8 bytes only, version-independent) is what identifies a buffer as
// this block format at all; checkHeader() uses it so old (v1) saves keep
// decoding exactly as before, while new writes always use v2.
const magicRisuSavePrefix = new TextEncoder().encode("RISUSAVE");
const magicRisuSaveHeaderV2 = new TextEncoder().encode("RISUSAVE\x01");

const crc32Table = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
        }
        table[n] = c
    }
    return table
})()

/** Standard CRC-32 (IEEE 802.3) — cheap, sync, and enough to catch a bit-flip. */
function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF
    for (let i = 0; i < data.length; i++) {
        crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
}

/** Reads a little-endian uint32 out of `data` at `offset`, copying first to avoid TypedArray alignment issues on an arbitrary offset. */
function readUint32LE(data: Uint8Array, offset: number): number {
    const buf = new ArrayBuffer(4)
    new Uint8Array(buf).set(data.slice(offset, offset + 4))
    return new Uint32Array(buf)[0]
}

/**
 * CHORE-17 (plan Report 18 §2): compares two block buffers for the
 * encodeRawBlock skip. Both sides are always fresh `ArrayBuffer`s allocated
 * at `byteOffset` 0 (see encodeRawBlock's `arrayBuf`/`buf`), so the common
 * case can compare 4 bytes at a time via `Uint32Array` instead of one byte at
 * a time. The `byteOffset` check is a defensive guard, not something either
 * operand hits -- both `a` and `b` are always fresh buffers at `byteOffset`
 * 0. If it ever fails anyway, falling back to a plain byte loop keeps this
 * correct instead of misreading unaligned words.
 */
function rawBlockBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    const length = a.length
    if (a.byteOffset === 0 && b.byteOffset === 0) {
        const wordCount = length >>> 2
        const aWords = new Uint32Array(a.buffer, 0, wordCount)
        const bWords = new Uint32Array(b.buffer, 0, wordCount)
        for (let i = 0; i < wordCount; i++) {
            if (aWords[i] !== bWords[i]) return false
        }
        for (let i = wordCount * 4; i < length; i++) {
            if (a[i] !== b[i]) return false
        }
        return true
    }
    for (let i = 0; i < length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

/**
 * Removes every occurrence of `value` from `list`, not only the first.
 * `list` is `toSave.character`, declared `string[]`, but the selected-
 * character effect (`frontUnshiftSelected`, `dbChangeEffects.svelte.ts`) and
 * the identity tracker's own append (`appendIfAbsent`,
 * `characterSaveMarks.ts`) push a character's raw chaId into it at runtime,
 * whatever that declared type says -- so each element is compared by
 * `String(list[i])`, not by identity, to still catch a raw, non-string
 * chaId.
 */
function removeAllOccurrences(list: string[], value: string): void {
    for (let i = list.length - 1; i >= 0; i--) {
        if (String(list[i]) === value) {
            list.splice(i, 1);
        }
    }
}

/**
 * Thrown for a block-parsing failure that must abort decoding entirely
 * rather than being silently skipped (RisuSaveDecoder's raw byte-parsing
 * loop otherwise treats every per-block error as "drop this one block and
 * keep going" — appropriate for a corrupted character or module, but not for
 * the root block, whose __directory field is what makes every other
 * directory-cached block loadable at all).
 */
class CriticalBlockError extends Error {}


async function checkCompressionStreams(){
    if(!CompressionStream){
        const {makeCompressionStream} = await import('compression-streams-polyfill/ponyfill');
        //@ts-expect-error polyfill CompressionStream type is incompatible with globalThis.CompressionStream
        globalThis.CompressionStream = makeCompressionStream(TransformStream);
    }
    if(!DecompressionStream){
        const {makeDecompressionStream} = await import('compression-streams-polyfill/ponyfill');
        //@ts-expect-error polyfill DecompressionStream type is incompatible with globalThis.DecompressionStream
        globalThis.DecompressionStream = makeDecompressionStream(TransformStream);
    }
}

export function encodeRisuSaveLegacy(data:any, compression:'noCompression'|'compression' = 'noCompression'){
    let encoded:Uint8Array = packr.encode(data)
    if(compression === 'compression'){
        encoded = fflate.compressSync(encoded)
        const result = new Uint8Array(encoded.length + magicCompressedHeader.length);
        result.set(magicCompressedHeader, 0)
        result.set(encoded, magicCompressedHeader.length)
        return result
    }
    else{
        const result = new Uint8Array(encoded.length + magicHeader.length);
        result.set(magicHeader, 0)
        result.set(encoded, magicHeader.length)
        return result
    }
}

export async function encodeRisuSaveCompressionStream(data:any) {
    await checkCompressionStreams()
    let encoded:Uint8Array = packr.encode(data)
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(encoded as any);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer()
    const result = new Uint8Array(new Uint8Array(buf).length + magicStreamCompressedHeader.length);
    result.set(magicStreamCompressedHeader, 0)
    result.set(new Uint8Array(buf), magicStreamCompressedHeader.length)
    return result
}

export type toSaveType = {
    character: string[];
    chat: [string, string][];
    botPreset: boolean;
    modules: boolean;
    loadouts: boolean;
    plugins: boolean;
    pluginCustomStorage: boolean;
}

enum RisuSaveType {
    CONFIG = 0,
    ROOT = 1,
    CHARACTER_WITH_CHAT = 2,
    CHAT = 3,
    BOTPRESET = 4,
    MODULES = 5,
    REMOTE = 6,
    CHARACTER_WITHOUT_CHAT = 7,
    ROOT_COMPONENT = 8,
    PLUGINS = 9,
    LOADOUTS = 10,
    PLUGIN_STORAGE = 11,
}

type EncodeBlockArg = {
    compression:boolean
    data:string
    type:RisuSaveType
    name:string
    cache?:boolean
    skipRemoteSaving?:boolean
}

type EncodeBlockOption = {
    remote: 'none'|'prefer'|'force'
}

const risuSaveCacheForage = localforage.createInstance({
    name: 'risuSaveCache'
});
export class RisuSaveEncoder {

    private blocks: { [key: string]: Uint8Array } = {};
    private compression: boolean = false;
    // Fork-specific internal API (Report 17 Stage 1 §3.1/§3.2): the set of
    // character objects THIS init() call actually encoded (by identity, not a
    // copy). Consumed by saveDb() to seed the identity tracker's WeakSet
    // (dbChangeEffects.svelte.ts) so a replacement that happens WHILE init()
    // is still running isn't treated as "already seen" once that effect
    // starts, and by prepareSaveIteration()'s post-reload filter, so a full
    // reload doesn't double-encode an already-marked character the same save
    // iteration (plan §3.2, gate finding F1). Purely additional bookkeeping;
    // does not change what init() encodes or how. Released via
    // `takeEncodedCharacterProxies()` (Report 17 Stage 1, Gate 2 should-fix
    // (memory)) once each consumer above has read it -- and each consumer in
    // turn drops its own copy afterward (saveDb() releases its `seed`
    // argument, and registerDbChangeEffects releases `opts.seed`) -- so
    // together, nothing here keeps a boot-time character object reachable
    // for this encoder's whole lifetime.
    private encodedCharacterProxies = new Set<Database['characters'][number]>();
    // CHORE-17 (plan Report 18 §2, Gate 1 M1): one budget per encoder
    // instance, since each instance has its own `setItem` yield history.
    // `encodeRawBlock` calls `noteYielded()` after a real write resolves and
    // awaits `maybeYield()` after a skipped one. A skipped write crosses no
    // macrotask boundary, so this is what keeps a run of skips yielding
    // periodically instead of running as one long task.
    private yieldBudget = createYieldBudget();
    // chaId keys currently held by two or more characters in the last pass
    // (`init` or `set`) this encoder ran. While a key is here, its block is
    // held unchanged rather than rewritten from either holder (MC-078,
    // MC-079, MC-082) -- see the duplicate handling in `init` and `set`
    // below. Recomputed from scratch every pass; a key leaves this set the
    // moment a pass sees it with fewer than two holders.
    private frozenKeys = new Set<string>();

    /** A snapshot of the chaId keys currently frozen against a rewrite. */
    getFrozenKeys(): Set<string> {
        return new Set(this.frozenKeys);
    }

    async init(data:Database,arg:{
        compression?: boolean,
        skipRemoteSavingOnCharacters?: boolean,
        /**
         * The encoder this fresh one is replacing on a full reload. Consulted
         * only for a key that this pass's own snapshot finds duplicated and
         * for which this encoder has no block of its own: `previous.blocks`
         * is read, never copied in bulk ahead of time, so a key duplicated in
         * `previous` that this pass finds with zero or one holder is never
         * carried, and a key `previous` never held a block for still falls
         * through to a first-holder write. `previous` itself is never
         * written to.
         */
        previous?: RisuSaveEncoder
    } = {}){
        const {
            compression = false,
            skipRemoteSavingOnCharacters = true,
            previous
        } = arg;
        this.compression = compression;
        this.encodedCharacterProxies = new Set();
        let obj:Record<any,any> = {}
        let keys = Object.keys(data)
        for(const key of keys){
            if(key !== 'characters' && key !== 'botPresets' && key !== 'modules'){
                obj[key] = data[key]
            }
        }
        this.blocks['root'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(obj),
            type: RisuSaveType.ROOT,
            name: 'root'
        });
        this.blocks['preset'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.botPresets),
            type: RisuSaveType.BOTPRESET,
            name: 'preset'
        });
        this.blocks['modules'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.modules),
            type: RisuSaveType.MODULES,
            name: 'modules'
        });
        this.blocks['loadouts'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.loadouts),
            type: RisuSaveType.LOADOUTS,
            name: 'loadouts'
        });
        this.blocks['plugins'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.plugins),
            type: RisuSaveType.PLUGINS,
            name: 'plugins'
        });
        this.blocks['pluginStorage'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.pluginCustomStorage),
            type: RisuSaveType.PLUGIN_STORAGE,
            name: 'pluginStorage'
        });
        // One snapshot for this whole pass: a holder appended to the live
        // array while this loop is still awaiting an earlier holder's block
        // write is not seen until the next pass. Each holder's chaId is read
        // once, here -- never re-read from the character later -- so a chaId
        // edited mid-pass still encodes and freezes under the value it held
        // when this pass started. `holderKeys` holds `String(chaId)`, the
        // same coercion a plain object's own property access already applies
        // to `this.blocks[chaId]`, so a numeric or missing chaId dedupes and
        // freezes exactly as it would key a block; `holderRawKeys` keeps the
        // uncoerced value, which is what `encodeBlock`'s `name` must receive
        // so the written bytes are unchanged.
        const snapshot = data.characters.slice();
        const holderKeys: string[] = new Array(snapshot.length);
        const holderRawKeys: string[] = new Array(snapshot.length);
        const holderCounts = new Map<string, number>();
        for (let i = 0; i < snapshot.length; i++) {
            const rawKey = snapshot[i].chaId;
            const key = String(rawKey);
            holderRawKeys[i] = rawKey;
            holderKeys[i] = key;
            holderCounts.set(key, (holderCounts.get(key) ?? 0) + 1);
        }

        const encodedThisPass = new Set<string>();
        const newFrozenKeys = new Set<string>();
        for (let i = 0; i < snapshot.length; i++) {
            const character = snapshot[i];
            const key = holderKeys[i];
            const rawKey = holderRawKeys[i];
            if (encodedThisPass.has(key)) {
                // At most one encode per key per pass -- a later holder of an
                // already-handled key is neither written nor counted again.
                continue;
            }
            encodedThisPass.add(key);
            const holders = holderCounts.get(key) ?? 0;
            if (holders > 1) {
                const existingBlock = this.blocks[key] !== undefined ? this.blocks[key] : previous?.blocks[key];
                if (existingBlock !== undefined) {
                    // A block already exists for a key two or more characters
                    // now hold -- either committed by this encoder already,
                    // or carried from the encoder being replaced -- kept
                    // unchanged, from neither holder.
                    this.blocks[key] = existingBlock;
                    newFrozenKeys.add(key);
                    continue;
                }
                // MC-082: no block for this duplicated key in either encoder
                // -- the first holder in snapshot order is written once,
                // then frozen like any other duplicate.
                this.blocks[key] = await this.encodeBlock({
                    compression,
                    data: JSON.stringify(character),
                    type: RisuSaveType.CHARACTER_WITH_CHAT,
                    name: rawKey,
                    skipRemoteSaving: skipRemoteSavingOnCharacters
                }, {
                    remote: 'prefer'
                });
                this.encodedCharacterProxies.add(character);
                newFrozenKeys.add(key);
                continue;
            }
            this.blocks[key] = await this.encodeBlock({
                compression,
                data: JSON.stringify(character),
                type: RisuSaveType.CHARACTER_WITH_CHAT,
                name: rawKey,
                skipRemoteSaving: skipRemoteSavingOnCharacters
            }, {
                remote: 'prefer'
            });
            this.encodedCharacterProxies.add(character);
        }
        this.frozenKeys = newFrozenKeys;

        this.blocks['config'] = await this.encodeBlock({
            compression,
            data: JSON.stringify({
                version: 1
            }),
            type: RisuSaveType.CONFIG,
            name: "config"
        })
    }

    /**
     * Fork-specific internal API -- see the field comment above `init()`.
     * Takes (returns, then replaces with a fresh empty Set) rather than just
     * reading, so each consumer's call releases this encoder's references to
     * the character objects it just encoded once it's done with them --
     * otherwise the encoder would keep every boot-time character object
     * reachable for as long as it lives (Report 17 Stage 1, Gate 2
     * should-fix (memory), replacing the earlier, rejected WeakSet approach).
     * This only releases the encoder's own copy -- each consumer (saveDb()'s
     * `seed` argument, registerDbChangeEffects' `opts.seed`) must separately
     * drop its own reference once it has built whatever it needed from the
     * returned Set, or that consumer becomes the new thing pinning every
     * boot-time character reachable instead. Callers that need
     * the set more than once within the same logical use must save the
     * returned reference themselves; a second take comes back empty.
     */
    takeEncodedCharacterProxies(): Set<object> {
        const proxies = this.encodedCharacterProxies;
        this.encodedCharacterProxies = new Set();
        return proxies;
    }

    async set(data:Database, toSave:toSaveType){
        let obj:Record<any,any> = {}
        let keys = Object.keys(data)
        for(const key of keys){
            if(
                key !== 'characters' && key !== 'botPresets' && key !== 'modules' &&
                key !== 'loadouts' && key !== 'plugins' && key !== 'pluginCustomStorage'
            ){
                obj[key] = data[key]
            }
        }

        // One snapshot for this whole pass, same reasoning as init() above:
        // an insert onto the live array partway through this loop is not
        // seen until the next set() call, and each holder's chaId is read
        // once, up front. `holderKeys` holds `String(chaId)`, matching the
        // coercion a plain object's own property access already applies to
        // `this.blocks[chaId]`; `holderRawKeys` keeps the uncoerced value for
        // `encodeBlock`'s `name`, so the written bytes are unchanged.
        const snapshot = data.characters.slice();
        const holderKeys: string[] = new Array(snapshot.length);
        const holderRawKeys: string[] = new Array(snapshot.length);
        const holderCounts = new Map<string, number>();
        for (let i = 0; i < snapshot.length; i++) {
            const rawKey = snapshot[i].chaId;
            const key = String(rawKey);
            holderRawKeys[i] = rawKey;
            holderKeys[i] = key;
            holderCounts.set(key, (holderCounts.get(key) ?? 0) + 1);
        }

        const frozenBeforePass = this.frozenKeys;
        const savedId = new Set<string>();
        const encodedThisPass = new Set<string>();
        const newFrozenKeys = new Set<string>();
        for (let i = 0; i < snapshot.length; i++) {
            const character = snapshot[i];
            const key = holderKeys[i];
            const rawKey = holderRawKeys[i];
            if (encodedThisPass.has(key)) {
                // At most one encode per key per pass.
                continue;
            }
            encodedThisPass.add(key);
            const holders = holderCounts.get(key) ?? 0;
            // Compares by `String(m)`, not identity: the selected-character
            // effect (`frontUnshiftSelected`) and the identity tracker
            // (`appendIfAbsent`) push a character's raw chaId into
            // `toSave.character` at runtime, and that mark must still match
            // this holder's own `String(chaId)` key. `toSave.character`
            // itself is never rewritten to hold `String(chaId)` in place: a
            // failed write folds it back into the live tracker via
            // `mergeUnsavedChanges`, and `prepareSaveIteration`'s no-reload
            // filter compares it against raw chaIds -- either one would drop
            // a numeric chaId's mark turned into `"5"` here.
            const markIndex = toSave.character.findIndex((m) => String(m) === key);

            if (holders > 1) {
                if (this.blocks[key] !== undefined) {
                    // Kept unchanged, whichever holder is marked -- every
                    // occurrence of the key is taken out of toSave.character
                    // (a dirty-marking effect can add the same id twice), so
                    // the deletion branch below never sees it.
                    newFrozenKeys.add(key);
                    savedId.add(key);
                    removeAllOccurrences(toSave.character, key);
                    continue;
                }
                // MC-082: never saved before -- the first holder in snapshot
                // order is written once, then frozen the same way.
                this.blocks[key] = await this.encodeBlock({
                    compression: this.compression,
                    data: JSON.stringify(character),
                    type: RisuSaveType.CHARACTER_WITH_CHAT,
                    name: rawKey
                }, {
                    remote: 'prefer'
                });
                savedId.add(key);
                newFrozenKeys.add(key);
                removeAllOccurrences(toSave.character, key);
                continue;
            }

            // Exactly one holder this pass. A mark writes it; a key
            // that was frozen going into this pass writes it too, even
            // unmarked, so saving resumes with its current content as soon
            // as the duplicate is gone -- not only once a new mark happens to
            // arrive. A key with no block yet and no mark still gets its
            // first write.
            if (markIndex !== -1 || frozenBeforePass.has(key) || this.blocks[key] === undefined) {
                this.blocks[key] = await this.encodeBlock({
                    compression: this.compression,
                    data: JSON.stringify(character),
                    type: RisuSaveType.CHARACTER_WITH_CHAT,
                    name: rawKey
                }, {
                    remote: 'prefer'
                });
                savedId.add(key);
                if (markIndex !== -1) {
                    toSave.character.splice(markIndex, 1);
                }
            }
        }
        this.frozenKeys = newFrozenKeys;
        if(toSave.character.length > 0){
            console.log(`Deleting character data: ${toSave.character.join(', ')}`);
            //probably deleted characters
            for(const chaId of toSave.character){
                // `savedId` holds `String(chaId)`, so a raw, possibly
                // non-string mark left over here (see `markIndex` above) is
                // compared the same way, not by identity.
                if(!savedId.has(String(chaId))){
                    delete this.blocks[chaId];
                }
            }
        }

        if(toSave.botPreset){
            this.blocks['preset'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.botPresets),
                type: RisuSaveType.BOTPRESET,
                name: 'preset'
            });
        }
        if(toSave.modules){
            this.blocks['modules'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.modules),
                type: RisuSaveType.MODULES,
                name: 'modules'
            });
        }

        if(toSave.loadouts){
            this.blocks['loadouts'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.loadouts),
                type: RisuSaveType.LOADOUTS,
                name: 'loadouts'
            });
        }

        if(toSave.pluginCustomStorage){
            this.blocks['pluginStorage'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.pluginCustomStorage),
                type: RisuSaveType.PLUGIN_STORAGE,
                name: 'pluginStorage'
            });
        }

        if(toSave.plugins){
            this.blocks['plugins'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.plugins),
                type: RisuSaveType.PLUGINS,
                name: 'plugins'
            });
        }

        obj["__directory"] = Object.keys(this.blocks).filter(key => key !== 'root');
        this.blocks['root'] = await this.encodeBlock({
            compression: this.compression,
            data: JSON.stringify(obj),
            type: RisuSaveType.ROOT,
            name: 'root'
        });
    }

    encode(arg:{
        compression?: boolean
    } = {}){
        if(!this.blocks['config']){
            return null
        }
        let totalLength = 0
        for(const key in this.blocks){
            totalLength += this.blocks[key].length;
        }
        totalLength += magicRisuSaveHeaderV2.length;
        const arrayBuf = new ArrayBuffer(totalLength);
        const view = new Uint8Array(arrayBuf);
        let offset = 0;
        view.set(magicRisuSaveHeaderV2, offset);
        offset += magicRisuSaveHeaderV2.length;
        for(const key in this.blocks){
            view.set(this.blocks[key], offset);
            offset += this.blocks[key].length;
        }
        console.log(Object.keys(this.blocks).length, 'blocks encoded');
        return arrayBuf;
    }

    async encodeBlock(arg:EncodeBlockArg, option:EncodeBlockOption = { remote: 'none' }){
        if(
            option.remote === 'force' ||
            (
                option.remote === 'prefer' &&
                (
                    isTauri ||
                    isNodeServer
                )
            ) &&
            !disableRemoteSaving()
        ){
            return await this.encodeRemoteBlock(arg);
        }
        return await this.encodeRawBlock(arg);
    }

    async encodeRawBlock(arg:EncodeBlockArg){
        let databuf: Uint8Array;
        const cacheBlock = arg.cache ?? true;
        if(arg.compression){
            await checkCompressionStreams();
            const cs = new CompressionStream('gzip');
            const writer = cs.writable.getWriter();
            writer.write(new TextEncoder().encode(arg.data));
            writer.close();
            const compressedData = await new Response(cs.readable).arrayBuffer();
            databuf = (new Uint8Array(compressedData));
        }
        else{
            databuf = (new TextEncoder().encode(arg.data));
        }
        const nameBuf = new TextEncoder().encode(arg.name);
        const lengthBuf = new ArrayBuffer(4);
        new Uint32Array(lengthBuf)[0] = databuf.length;

        // Two separate checksums, not one, because they protect against
        // different failure modes and the decoder needs to react differently
        // to each:
        //  - headerChecksum covers type+compression+nameLen+name+length —
        //    everything the decoder needs to know WHERE this block's data
        //    ends (and so where the next block starts). The decoder verifies
        //    this BEFORE trusting `length` enough to read `data` at all. If
        //    it fails, the decoder can no longer safely locate any
        //    subsequent block either, so it must abort decoding entirely
        //    rather than merely skip this one block.
        //  - dataChecksum covers only the payload. Once headerChecksum has
        //    confirmed `length` is intact, a dataChecksum-only mismatch means
        //    just this block's own content is corrupted — block boundaries
        //    are still known, so it's safe to drop only this block and keep
        //    decoding the rest of the file, same as any other per-block
        //    parse failure.
        // A single checksum covering everything couldn't distinguish these
        // two cases from the mismatch alone, which is exactly the gap Codex
        // review found: framing-field corruption (type/name/length) was
        // going undetected because only the payload was checksummed.
        const headerBytes = new Uint8Array(2 + 1 + nameBuf.length + 4);
        headerBytes.set([arg.type, arg.compression ? 1 : 0], 0);
        headerBytes.set([nameBuf.length], 2);
        headerBytes.set(nameBuf, 3);
        headerBytes.set(new Uint8Array(lengthBuf), 3 + nameBuf.length);
        const headerChecksumBuf = new ArrayBuffer(4);
        new Uint32Array(headerChecksumBuf)[0] = crc32(headerBytes);

        const dataChecksumBuf = new ArrayBuffer(4);
        new Uint32Array(dataChecksumBuf)[0] = crc32(databuf);

        const arrayBuf = new ArrayBuffer(headerBytes.length + 4 + databuf.length + 4);
        const buf = new Uint8Array(arrayBuf);
        buf.set(headerBytes, 0);
        buf.set(new Uint8Array(headerChecksumBuf), headerBytes.length);
        buf.set(databuf, headerBytes.length + 4);
        buf.set(new Uint8Array(dataChecksumBuf), headerBytes.length + 4 + databuf.length);

        // CHORE-17 Stage A (plan Report 18 §2): skip the cache write when
        // these bytes are already what `this.blocks[arg.name]` holds. Safe
        // because every assignment to `this.blocks[k]` comes from a
        // previously *committed* `encodeRawBlock` call under that same key --
        // on this instance, or, for a key duplicated across a full reload
        // (`init`'s `previous` option), on the instance being replaced.
        // Either way, nothing writes that cache key while the key stays
        // duplicated, so equal bytes here still mean these exact bytes were
        // already written under this cache key -- and since `arg.data` is
        // always `JSON.stringify` output (well-formed, no lone surrogates),
        // `TextEncoder` is injective on it, so equal encoded bytes also mean
        // equal source data. The block type byte is part of the compared
        // bytes, so two block kinds sharing a name can't false-match.
        const existing = this.blocks[arg.name];
        if (existing && rawBlockBytesEqual(buf, existing)) {
            // No `setItem` this time, which was the save loop's only
            // macrotask boundary on this path -- yield instead so a run of
            // skips doesn't turn into one long task (plan §2, Gate 1 M1).
            await this.yieldBudget.maybeYield();
            return buf;
        }

        await risuSaveCacheForage.setItem(`risuSaveBlock_${arg.name}`, {
            type: arg.type,
            data: arg.data,
            name: arg.name,
        });
        this.yieldBudget.noteYielded();
        return buf;
    }

    async encodeRemoteBlock(arg:EncodeBlockArg){
        console.log(`Encoding remote block: ${arg.name}`);
        const encoded = new TextEncoder().encode(arg.data);
        // Content-addressed naming (Phase 1.5 Tier B Stage 3a — see
        // Agents/Reports/07-remote-block-versioning-design.md): the filename
        // is a function of content, not a stable per-character name, so a
        // write is always a fresh, never-again-mutated object (or a true
        // no-op if identical content was already written under this exact
        // hash). This is what makes a rejected root write's earlier remote
        // writes harmless garbage instead of silently-visible corruption —
        // the bug that got the original (unversioned) eligibility-extension
        // attempt reverted. `v:1`/bare-name pointers (pre-this-change saves)
        // are still fully supported for reading — see RisuSaveDecoder's
        // REMOTE case below — this only changes what NEW writes produce.
        const hash = await hashRemoteBlockContent(encoded);
        const fileName = `remotes/${arg.name}.${hash}.bin`

        const writeRemoteFile = async () => {
            if(isTauri){
                if(!(await exists('remotes', { baseDir: BaseDirectory.AppData }))){
                    await mkdir('remotes', { recursive: true, baseDir: BaseDirectory.AppData });
                }
                await writeFile(fileName, encoded!, { baseDir: BaseDirectory.AppData });
            }
            else{
                await forageStorage.setItem(fileName, encoded);
            }
        };

        if(forageStorage.isAccount){
            // CHORE-17 Stage B, fact 9 (plan §3): `AccountStorage.setItem` can
            // resolve without persisting (a 403 with `x-risu-status: warn`),
            // so a resolved write here can't be trusted the way a resolved
            // local-cache `setItem` can. `forageStorage.isAccount` can also
            // flip to true mid-page (`autoStorage.ts`'s "save current data to
            // account" path), so a name recorded while writing to local or
            // Node storage must not suppress a later upload to the account.
            // This branch neither reads nor records `checkedRemoteExistence`
            // for either reason -- no write is skipped beyond the boot
            // existence check just below, which still skips a write when it
            // finds the file already there. On Tauri, account storage still
            // writes remote files locally through `writeFile`, not through
            // `AccountStorage`, so the 403-warn concern doesn't apply there
            // and this bypass is merely conservative.
            if(arg.skipRemoteSaving){
                let fileExists = false;
                if(isTauri){
                    fileExists = await exists(fileName, { baseDir: BaseDirectory.AppData });
                }
                else{
                    const stored = await forageStorage.keys();
                    if(stored.includes(fileName)){
                        fileExists = true;
                    }
                }
                if(!fileExists){
                    arg.skipRemoteSaving = false;
                }
            }
            if(!arg.skipRemoteSaving){
                await writeRemoteFile();
            }
        }
        else{
            // CHORE-17 Stage B (plan §3): `checkedRemoteExistence` holds
            // "this page load wrote or confirmed this exact file exists", so
            // a hit skips the write outright, whether or not the caller
            // passed `skipRemoteSaving`. Safe because the name contains a
            // 64-bit SHA-256 prefix of the content (hashRemoteBlockContent
            // above) -- a collision is negligible, but on a hit the existing
            // file is kept rather than overwritten -- and nothing in this
            // build deletes a hash-named file within a page load (plan fact 7).
            let shouldWrite = true;
            if(checkedRemoteExistence.has(fileName)){
                shouldWrite = false;
            }
            else if(arg.skipRemoteSaving){
                let fileExists = false;
                if(isTauri){
                    fileExists = await exists(fileName, { baseDir: BaseDirectory.AppData });
                }
                else{
                    const stored = await forageStorage.keys();
                    if(stored.includes(fileName)){
                        fileExists = true;
                    }
                }
                if(fileExists){
                    // Recorded only once the existence check has confirmed
                    // the file; a name is never recorded before a write
                    // whose outcome is unknown.
                    checkedRemoteExistence.add(fileName);
                    shouldWrite = false;
                }
            }
            if(shouldWrite){
                await writeRemoteFile();
                // Recorded only after the write has resolved, so a throwing
                // write leaves the name out and the next save retries it.
                checkedRemoteExistence.add(fileName);
            }
        }

        return await this.encodeBlock({
            compression: false,
            data: JSON.stringify({
                v: 2,
                type: arg.type,
                name: arg.name,
                hash,
            }),
            type: RisuSaveType.REMOTE,
            name: arg.name
        });
    }
}

export class RisuSaveDecoder {
    private blocks: {
        name: string;
        type: RisuSaveType;
        compression: boolean;
        content: string;
    }[] = []
    // Whether every block in `data` carries a trailing 4-byte CRC32 (format
    // version 2 — see the magicRisuSaveHeaderV2 comment above). Set by
    // decodeRisuSave() from the file's own header byte before construction,
    // so old (v1) saves are decoded exactly as before — no checksum bytes to
    // read, nothing new to verify — while new (v2) saves get verified.
    constructor(private hasChecksums: boolean = false) {}
    async decode(data: Uint8Array): Promise<Database> {
        console.log('Decoding RisuSave data');
        let offset = magicRisuSaveHeaderV2.length;
        //@ts-expect-error Database has required fields, but we initialize empty and populate incrementally during decode
        let db:Database = {}
        const loadedBlocks = new Set<string>();
        while (offset < data.length) {
            const blockStart = offset;
            try {
                const type = data[offset];
                const compression = data[offset + 1] === 1;
                offset += 2;

                const nameLength = data[offset];
                offset += 1;
                const name = new TextDecoder().decode(data.subarray(offset, offset + nameLength));
                offset += nameLength;

                const newArrayBuf = new ArrayBuffer(4);
                const lengthSubUint8Buf = data.slice(offset, offset + 4);
                new Uint8Array(newArrayBuf).set(lengthSubUint8Buf);
                const length = new Uint32Array(newArrayBuf)[0];
                offset += 4;

                if (this.hasChecksums) {
                    // Verified BEFORE `length` is trusted enough to slice out
                    // `data` below — if type/compression/name/length were
                    // corrupted, we can no longer know where this block (or
                    // any later one) actually ends, so this must abort
                    // decoding entirely rather than continue at a
                    // now-unreliable offset.
                    const headerSpan = data.subarray(blockStart, offset);
                    const storedHeaderChecksum = readUint32LE(data, offset);
                    offset += 4;
                    const actualHeaderChecksum = crc32(headerSpan);
                    if (actualHeaderChecksum !== storedHeaderChecksum) {
                        throw new CriticalBlockError(`Header checksum mismatch for block at offset ${blockStart} (claimed name "${name}", type ${type}) — this block's framing is corrupted; cannot safely continue decoding.`);
                    }
                }

                if (offset + length > data.length) {
                    throw new CriticalBlockError(`Block "${name}" (type ${type}) claims a length of ${length} bytes, which exceeds the remaining buffer — framing is corrupted; cannot safely continue decoding.`);
                }
                let blockData = data.subarray(offset, offset + length);
                offset += length;

                if (this.hasChecksums) {
                    // Covers only the payload, now that the header checksum
                    // above has confirmed block boundaries are intact — a
                    // mismatch here means just THIS block's own content is
                    // corrupted, and it's safe to drop only this block and
                    // keep decoding the rest of the file.
                    const storedDataChecksum = readUint32LE(data, offset);
                    offset += 4;
                    const actualDataChecksum = crc32(blockData);
                    if (actualDataChecksum !== storedDataChecksum) {
                        throw new Error(`Data checksum mismatch for block "${name}" (type ${type}): expected ${storedDataChecksum}, got ${actualDataChecksum} — this block's content is corrupted.`);
                    }
                }

                if (compression) {
                    //decode using DecompressionStream
                    await checkCompressionStreams();
                    const cs = new DecompressionStream('gzip');
                    const writer = cs.writable.getWriter();
                    writer.write(blockData as any);
                    writer.close();
                    const buf = await new Response(cs.readable).arrayBuffer();
                    blockData = new Uint8Array(buf);
                }

                loadedBlocks.add(name);
                this.blocks.push({
                    name,
                    type,
                    compression,
                    content: new TextDecoder().decode(blockData)
                })   
            } catch (error) {
                if (error instanceof CriticalBlockError) {
                    throw error
                }
                continue
            }
        }
        console.log('blocks',this.blocks)
        let directory: string[] = []
        // Tracked instead of trusting "some block claimed type ROOT and
        // reached this switch case" alone — a bit-flip in a block's type
        // byte can redirect a completely different (still checksum-valid,
        // since the checksum only proves internal self-consistency, not that
        // `type` is what it was originally written as) block into looking
        // like ROOT, or vice versa. Requiring this to actually flip true —
        // i.e. a block that both claims ROOT and successfully JSON.parses —
        // before returning is what actually closes that gap, not the
        // per-block checksum alone.
        let rootProcessed = false;
        for(let i = 0; i < this.blocks.length; i++){
            const key = i;
            try {
                switch(this.blocks[key].type){
                    case RisuSaveType.ROOT:{
                        const rootData = JSON.parse(this.blocks[key].content);
                        rootProcessed = true;
                        for(const rootKey in rootData){
                            if(!db[rootKey] && !rootKey.startsWith('__')){
                                db[rootKey] = rootData[rootKey];
                            }
                            if(rootKey === '__directory'){
                                directory = rootData[rootKey];
                                console.log('RisuSave directory:', directory);
                                for(const dirKey of directory){
                                    if(!loadedBlocks.has(dirKey)){
                                        try {
                                            console.log(`Loading directory block ${dirKey} from cache`);
                                            const dirData:{
                                                type:RisuSaveType
                                                data:string
                                                name:string
                                            } = await risuSaveCacheForage.getItem(`risuSaveBlock_${dirKey}`) as any;

                                            if(dirData){
                                                this.blocks.push({
                                                    name: dirData.name,
                                                    type: dirData.type,
                                                    compression: false,
                                                    content: dirData.data
                                                });
                                                loadedBlocks.add(dirKey);
                                            }
                                        } catch (error) {
                                            console.error(`Error loading directory block ${dirKey}:`, error);
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    }
                    case RisuSaveType.CHARACTER_WITH_CHAT:
                    case RisuSaveType.CHARACTER_WITHOUT_CHAT:{
                        db.characters ??= [];
                        const character = JSON.parse(this.blocks[key].content);
                        db.characters.push(character);
                        break
                    }
                    case RisuSaveType.BOTPRESET:{
                        db.botPresets = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.MODULES:{
                        db.modules = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.CONFIG:{
                        //ignore for now
                        break;
                    }
                    case RisuSaveType.PLUGINS:{
                        db.plugins = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.LOADOUTS:{
                        db.loadouts = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.PLUGIN_STORAGE:{
                        db.pluginCustomStorage = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.REMOTE:{
                        const remoteInfo:{
                            v:number
                            type:RisuSaveType
                            name:string
                            hash?:string
                        } = JSON.parse(this.blocks[key].content);
                        // v1 pointers (pre-Stage-3a saves) name a stable,
                        // mutable file; v2 pointers name a content-addressed,
                        // immutable one. An unrecognized version, or a v2
                        // pointer missing its hash, is treated the same way
                        // this format already treats other corruption —
                        // don't guess, skip this block cleanly (the per-block
                        // checksum already protects the JSON payload itself,
                        // so this can only happen from a genuine encoder bug,
                        // not byte-level corruption — still fail closed).
                        let fileName: string
                        if(remoteInfo.v === 2 && remoteInfo.hash){
                            fileName = `remotes/${remoteInfo.name}.${remoteInfo.hash}.bin`
                        }
                        else if(remoteInfo.v === 1){
                            fileName = `remotes/${remoteInfo.name}.local.bin`
                        }
                        else{
                            console.warn(`Remote pointer for "${remoteInfo.name}" has an unrecognized version (${remoteInfo.v}) or a v2 pointer missing its hash; skipping.`);
                            break;
                        }
                        let remoteData:Uint8Array|null = null
                        if(isTauri){
                            try {
                                if(await exists(fileName, { baseDir: BaseDirectory.AppData })){
                                    remoteData = await readFile(fileName, { baseDir: BaseDirectory.AppData });
                                }
                            } catch (error) {
                                console.error(`Error reading remote file ${fileName} in Tauri:`, error);
                            }
                        }
                        else{
                            const stored = await forageStorage.getItem(fileName);
                            if(stored){
                                remoteData = stored as Uint8Array;
                            }
                        }

                        if(!remoteData){
                            console.warn(`Remote file ${fileName} not found.`);
                            break;
                        }
                        const decoded = new TextDecoder().decode(remoteData)

                        //add to blocks for further processing
                        this.blocks.push({
                            name: remoteInfo.name,
                            type: remoteInfo.type,
                            compression: false,
                            content: decoded
                        });
                        break;
                    }
                    case RisuSaveType.ROOT_COMPONENT:{
                        const componentData:{
                            data:any
                            key:string
                        } = JSON.parse(this.blocks[key].content);
                        db[componentData.key] = componentData.data;
                        break;
                    }
                    default:{
                        console.warn(`Not Implemented RisuSaveType: ${this.blocks[key].type} for ${this.blocks[key].name}`);
                    }
                }   
            } catch (error) {
                console.error(`Error processing block ${this.blocks[key].name}:`, error);

                if(this.blocks[key].type === RisuSaveType.ROOT){
                    throw new Error('Failed to decode root block, cannot proceed with decoding RisuSave data');
                }
            }
        }
        if(!rootProcessed){
            // No block both claimed type ROOT and successfully parsed as one
            // — whether because it was dropped for a checksum mismatch, its
            // type byte was itself corrupted into or out of ROOT, or it was
            // simply missing. Every file this encoder produces always writes
            // exactly one root block (see encode()'s `!this.blocks['config']`
            // guard, and init()'s unconditional `this.blocks['root'] = ...`),
            // so its absence here always means something went wrong, not a
            // legitimately-rootless save. Throwing here — instead of quietly
            // returning whatever fragments of `db` were assembled — is what
            // lets bootstrap.ts's backup-fallback recovery path actually
            // trigger instead of silently booting into a near-empty database.
            throw new Error('RisuSave data has no valid root block, cannot proceed with decoding RisuSave data');
        }
        //to fix botpreset bugs
        if(!Array.isArray(db.botPresets) || db.botPresets.length === 0){
            db.botPresets = [presetTemplate]
            db.botPresetsId = 0
        }
        console.log('Decoded RisuSave data', db);
        return db;
    }
}

export async function decodeRisuSave(data:Uint8Array){
    try {
        const header = checkHeader(data)
        switch(header){
            case "compressed":
                data = data.slice(magicCompressedHeader.length)
                return decode(fflate.decompressSync(data))
            case "raw":
                data = data.slice(magicHeader.length)
                return unpackr.decode(data)
            case "stream":{
                await checkCompressionStreams()
                data = data.slice(magicStreamCompressedHeader.length)
                const cs = new DecompressionStream('gzip');
                const writer = cs.writable.getWriter();
                writer.write(data as any);
                writer.close();
                const buf = await new Response(cs.readable).arrayBuffer()
                return unpackr.decode(new Uint8Array(buf))
            }
            case "risusave":{
                // Byte 8 (right after the 8-byte "RISUSAVE" prefix checkHeader()
                // matched) is the format version — 0 means the original format
                // (files written before this existed), 1 means every block
                // carries a trailing CRC32 checksum. Any OTHER value is treated
                // as corruption and rejected outright (falling through to the
                // legacy-format fallback attempts below, then ultimately to the
                // caller as a decode failure) rather than silently guessed at as
                // "must be legacy" — a version byte is exactly as capable of
                // being the one bit that got flipped as anything else in the
                // file, and guessing wrong here would mean skipping checksum
                // verification entirely for a file that actually has it.
                const versionByte = data[magicRisuSavePrefix.length];
                if (versionByte !== 0 && versionByte !== 1) {
                    throw new Error(`Unrecognized RisuSave format version byte: ${versionByte}`);
                }
                const decoder = new RisuSaveDecoder(versionByte === 1);
                return await decoder.decode(data);
            }
        }
        return unpackr.decode(data)
    }
    catch (error) {
        console.error('Error decoding RisuSave data:', error);
        try {
            console.log('risudecode')
            const risuSaveHeader = new Uint8Array(Buffer.from("\u0000\u0000RISU",'utf-8'))
            const realData = data.subarray(risuSaveHeader.length)
            const dec = unpackr.decode(realData)
            return dec   
        } catch (error) {
            const buf = Buffer.from(fflate.decompressSync(Buffer.from(data)))
            try {
                return JSON.parse(buf.toString('utf-8'))
            } catch (error) {
                return unpackr.decode(buf)
            }
        }
    }
}

function checkHeader(data: Uint8Array) {

    let header:'none'|'compressed'|'raw'|'stream'|'risusave' = 'raw'

    if (data.length < magicHeader.length) {
      return false;
    }
  
    for (let i = 0; i < magicHeader.length; i++) {
      if (data[i] !== magicHeader[i]) {
        header = 'none'
        break
      }
    }

    if(header === 'none'){
        header = 'compressed'
        for (let i = 0; i < magicCompressedHeader.length; i++) {
            if (data[i] !== magicCompressedHeader[i]) {
                header = 'none'
                break
            }
        }
    }

    if(header === 'none'){
        header = 'stream'
        for (let i = 0; i < magicStreamCompressedHeader.length; i++) {
            if (data[i] !== magicStreamCompressedHeader[i]) {
                header = 'none'
                break
            }
        }
    }

    if(header === 'none'){
        header = 'risusave'
        // Only the version-independent "RISUSAVE" prefix is checked here — the
        // 9th byte (format version: v1 has no per-block checksums, v2 does) is
        // read separately in decodeRisuSave() to decide how RisuSaveDecoder
        // should parse the blocks that follow, not to decide IF this is a
        // RisuSave buffer at all.
        for (let i = 0; i < magicRisuSavePrefix.length; i++) {
            if (data[i] !== magicRisuSavePrefix[i]) {
                header = 'none'
                break
            }
        }
    }

    // All bytes matched
    return header;
  }