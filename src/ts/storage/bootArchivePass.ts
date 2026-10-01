import { v4 as uuidv4 } from 'uuid'
import type { Database } from './database.svelte'
import type { ColdStorageReadResult } from '../process/coldstorage.svelte'
import {
    RisuSaveEncoder,
    RisuSaveType,
    decodeRisuSave,
    hashRemoteBlockContent,
    listEncodedBlocks,
    type EncodedBlockView,
    type toSaveType,
} from './risuSave'
import { buildColdStub } from '../process/coldCharacter'
import { coldStorageHeader } from '../process/coldstorageData'
import { repairDatabaseIds } from '../process/chatIds'
import { hasEnabledV21Plugin } from '../plugins/v21Plugins'
import { applyCharacterDefaults, resetChatStreamingState } from './characterDefaults'

/**
 * The boot archive pass: on a boot that read and strictly decoded the main
 * save file, before the database is installed, every eligible full character
 * is written to its own cold-storage unit, replaced in the decoded tree by a
 * stub, and the tree is committed as the main file, all under exclusive
 * access. The caller installs the tree this module returns.
 *
 * Every effect the pass makes itself (unit writes and reads, the main-file
 * read and write, the hold, progress) arrives through `BootArchiveDeps`; the
 * production binding of those effects lives in `bootArchiveHost.ts`, which is
 * loaded only when no deps are given. The pass imports no `coldstorage.svelte`
 * and no lock binding. It does import `risuSave`, which itself reaches
 * `globalApi.svelte` (and through it `stores.svelte`) for remote character
 * files and `database.svelte` for the live remote-saving flag; a test of this
 * module therefore mocks those two. Keep the static imports to `risuSave`,
 * `coldCharacter`, `coldstorageData`, `chatIds`, `v21Plugins`,
 * `characterDefaults`, `uuid` and type-only imports.
 */

/** Which boot branch of `loadData` is calling. */
export type BootArchiveHost = 'web' | 'tauri'

/** Facts the capability and eligibility gates read, sampled when the session opens. */
export interface BootArchiveEnvironment {
    host: BootArchiveHost
    /** Web only: the self-hosted Node server backs the main file and the units. */
    isNodeServer: boolean
    /** Tauri only: a desktop build (single instance; not a mobile OS). */
    tauriDesktop: boolean
    /** Web only: `locksSupported !== false && !!navigator.locks`. */
    locksSupported: boolean
    /** Web only: `navigator.storage.getDirectory` and `FileSystemFileHandle.prototype.createWritable` both exist. */
    opfsWritable: boolean
    /** `forageStorage.staleAccountProfile`: that boot never reaches plugins or `saveDb`. */
    staleAccountProfile: boolean
}

/**
 * The release function `acquireExclusiveStorageMigrationLock` resolves to.
 * The pass always calls it with no argument: `release(true)` leaves the write
 * lock closed and every later `saveDb` write would wait forever.
 */
export type BootArchiveHoldRelease = (keepWriteLock?: boolean) => Promise<void>

export interface BootArchiveDeps {
    env(): BootArchiveEnvironment
    /** Web only, never called on Tauri: the exclusive hold; `null` when it was not granted within `timeoutMs`. */
    acquireHold(timeoutMs: number): Promise<BootArchiveHoldRelease | null>
    /** `isAppInitiatedReload()`: true when a refused hold meant this page is reloading. */
    isReloading(): boolean
    /**
     * The read the boot's main-file read would make: on web and Node the
     * adopting `forageStorage.getItem('database/database.bin')`, on Tauri the
     * file read. It never writes and never takes a first-launch branch. Used
     * for the re-read after a failed pass; rejects when the read fails.
     */
    readMainFile(): Promise<Uint8Array | null | undefined>
    /** Writes the main file. On Node the write carries the revision the last adopting read took; a conflict rejects. */
    writeMainFile(bytes: Uint8Array): Promise<void>
    /** The `setColdStorageItem` contract: `true` when the unit was written, `false` on any failure. */
    writeUnit(key: string, value: { character: Database['characters'][number] }): Promise<boolean>
    /** The `readColdStorageItem` contract. */
    readUnit(key: string): Promise<ColdStorageReadResult>
    /** Unit ids; defaults to `uuid` v4 (the backup layer requires UUID-shaped keys). */
    newUnitKey?(): string
    /** The encoder the commit is built with; defaults to `new RisuSaveEncoder()`. */
    createEncoder?(): RisuSaveEncoder
    /** Progress text shown while archiving, English, with the count of N. */
    setProgress?(text: string): void
}

export interface BootArchivePassInput {
    /** The tree `decodeRisuSave(bytes, { strict: true })` returned. The pass may mutate it and return it. */
    tree: Database
    /** The bytes `tree` was decoded from. Supplied on Tauri only (the write-back after an undecodable re-read); web callers omit it so the bytes are not kept reachable. */
    prePassBytes?: Uint8Array
    /** `chaId`s that must stay full. The 5c boot never supplies it. */
    keepInline?: ReadonlySet<string>
}

/** A notice the caller translates and posts after the install, awaiting each in order. */
export type BootArchiveNotice =
    | { kind: 'archive-enabled' }
    | { kind: 'archive-stopped', characterName: string }

export type BootArchiveOutcome =
    /**
     * Install `tree`. `noteBytes` are the bytes to give `noteMainFileBytes`
     * (the committed bytes, or the re-read bytes), or `null` when the main
     * file was neither written nor re-read and the boot's own record stands.
     * `notices` are in the order they are posted.
     */
    | { kind: 'install', tree: Database, noteBytes: Uint8Array | null, notices: BootArchiveNotice[] }
    /** The re-read returned bytes that do not decode (web), or Tauri's re-read still did not after the write-back: the caller takes its existing backup-fallback path. */
    | { kind: 'backup-fallback' }
    /** Web (LocalForage, OPFS and Node alike): the re-read threw or returned nothing. The caller stops the boot with `error` shown; nothing is written and no backup is read. */
    | { kind: 'stop', error: unknown }

export interface BootArchiveSession {
    /** True when this boot may run a pass: capable host, hold granted (web), not a stale-account profile. */
    readonly canArchive: boolean
    /** True when the hold was refused because this page is reloading; the caller must not carry on booting. */
    readonly reloading?: boolean
    /**
     * Runs the pass over a strictly decoded tree. It never rejects: every
     * failure is reported through the outcome. It releases the hold itself
     * once the commit settles, or at once when it will not commit.
     */
    run(input: BootArchivePassInput): Promise<BootArchiveOutcome>
    /** Releases whatever the session still holds; idempotent. The caller invokes it on every path that does not reach `run`. */
    release(): Promise<void>
}

type Slot = Database['characters'][number]

/**
 * How long the session waits for the exclusive hold. Short on purpose: a
 * second tab that boots while another is open is refused after this long and
 * boots without a pass, so a long wait would only delay it for nothing.
 */
const HOLD_TIMEOUT_MS = 1000

/**
 * The oldest `formatversion` the pass archives. `checkNewFormat` migrates
 * character fields (image and emotion paths, `sdData`) only for a save whose
 * `formatversion` is falsy or below 3, and it sets `formatversion` itself, so
 * the value is read here from the raw decoded tree, before it runs. A save
 * below 5 has not been through every migration `checkNewFormat` runs, and the
 * pass archives only saves that have (Report 49 D10); such a save boots as it
 * always has, and a later boot archives it once the save holds 5.
 */
const MIN_FORMAT_VERSION = 5

/**
 * Opens the session. Call it after `forageStorage.Init()` (web) or at the
 * start of the Tauri read, and before the main file is read: the exclusive
 * hold is taken here, on every capable boot. `deps` defaults to the
 * production binding.
 */
export async function openBootArchiveSession(host: BootArchiveHost, deps?: BootArchiveDeps): Promise<BootArchiveSession> {
    let resolved = deps
    if (!resolved) {
        try {
            const { createProductionBootArchiveDeps } = await import('./bootArchiveHost')
            resolved = await createProductionBootArchiveDeps(host)
        } catch (error) {
            console.error('The boot archive pass is unavailable:', error)
            return disabledSession()
        }
    }
    return await createSession(host, resolved)
}

function installUntouched(tree: Database): BootArchiveOutcome {
    return { kind: 'install', tree, noteBytes: null, notices: [] }
}

function disabledSession(): BootArchiveSession {
    return {
        canArchive: false,
        async run(input) {
            return installUntouched(input.tree)
        },
        async release() { },
    }
}

async function createSession(host: BootArchiveHost, deps: BootArchiveDeps): Promise<BootArchiveSession> {
    const env = deps.env()
    const capable = host === 'web'
        ? env.locksSupported && (env.isNodeServer || env.opfsWritable)
        : env.tauriDesktop
    let releaseHold: BootArchiveHoldRelease | null = null
    let canArchive = false
    let reloading = false
    if (capable && !env.staleAccountProfile) {
        if (host === 'web') {
            try {
                releaseHold = await deps.acquireHold(HOLD_TIMEOUT_MS)
            } catch (error) {
                console.error('The exclusive hold could not be requested:', error)
                releaseHold = null
            }
            canArchive = releaseHold !== null
            reloading = releaseHold === null && deps.isReloading()
        } else {
            canArchive = true
        }
    }

    let released = false
    const release = async () => {
        if (released) {
            return
        }
        released = true
        const give = releaseHold
        releaseHold = null
        if (give) {
            try {
                // No argument: the write lock goes back with the hold.
                await give()
            } catch (error) {
                console.error('Releasing the exclusive hold failed:', error)
            }
        }
    }

    let ran = false
    return {
        canArchive,
        reloading,
        async run(input) {
            if (ran) {
                return installUntouched(input.tree)
            }
            ran = true
            try {
                return await runPass(host, deps, input, canArchive)
            } catch (error) {
                console.error('The boot archive pass failed before it changed anything:', error)
                return installUntouched(input.tree)
            } finally {
                await release()
            }
        },
        release,
    }
}

//#region eligibility

function isObjectSlot(value: unknown): value is Slot {
    return typeof value === 'object' && value !== null
}

/** The pass-wide gates P4 to P6 on the raw decoded tree. */
function passesTreeGates(tree: Database): boolean {
    return typeof tree.formatversion === 'number'
        && tree.formatversion >= MIN_FORMAT_VERSION
        && !hasEnabledV21Plugin(tree.plugins)
        && Array.isArray(tree.characters)
        && Array.isArray(tree.botPresets)
}

function eligibleIndexes(characters: readonly Slot[], keepInline: ReadonlySet<string> | undefined): number[] {
    const holders = new Map<string, number>()
    for (const cha of characters) {
        const id = String(cha.chaId)
        holders.set(id, (holders.get(id) ?? 0) + 1)
    }
    const indexes: number[] = []
    for (let i = 0; i < characters.length; i++) {
        const cha = characters[i]
        if (
            cha.coldstorage
            || cha.trashTime
            || typeof cha.chaId !== 'string'
            || cha.chaId.length === 0
            || cha.chaId.startsWith('§')
            || holders.get(cha.chaId) !== 1
            || keepInline?.has(cha.chaId)
        ) {
            continue
        }
        indexes.push(i)
    }
    return indexes
}

//#endregion

function pointerChatKeys(cha: Slot): string[] {
    const keys: string[] = []
    if (!Array.isArray(cha.chats)) {
        return keys
    }
    for (const chat of cha.chats) {
        const data = chat?.message?.[0]?.data
        if (typeof data === 'string' && data.startsWith(coldStorageHeader)) {
            keys.push(data.slice(coldStorageHeader.length))
        }
    }
    return keys
}

function characterOf(value: unknown): Slot | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const character = (value as { character?: unknown }).character
    return isObjectSlot(character) ? character : null
}

function emptyToSave(): toSaveType {
    return { character: [], chat: [], botPreset: false, modules: false, loadouts: false, plugins: false, pluginCustomStorage: false }
}

async function runPass(
    host: BootArchiveHost,
    deps: BootArchiveDeps,
    input: BootArchivePassInput,
    canArchive: boolean,
): Promise<BootArchiveOutcome> {
    const tree = input.tree
    // P7 (`archiveCharacters` false) archives nothing and writes nothing.
    if (!canArchive || !passesTreeGates(tree) || tree.archiveCharacters === false) {
        return installUntouched(tree)
    }
    const keyAbsent = tree.archiveCharacters === undefined
    try {
        return await archiveAndCommit(deps, input, keyAbsent)
    } catch (error) {
        console.error('The boot archive pass failed; installing the main file as it is:', error)
        return await installMainFileAsItIs(host, deps, input, keyAbsent)
    }
}

/**
 * Archives what is eligible, then commits the result as the main file. Any
 * throw is a pass failure: the caller discards the tree and re-reads the file.
 * A unit that cannot be written or read back is not a failure: archiving stops
 * there and what was archived so far is committed.
 */
async function archiveAndCommit(deps: BootArchiveDeps, input: BootArchivePassInput, keyAbsent: boolean): Promise<BootArchiveOutcome> {
    const tree = input.tree

    // Ids first: the encoder keeps one block per chaId, so a duplicate left in
    // place would drop a character from the committed file. The same repaired
    // tree is the one the app installs.
    const idsBefore = tree.characters.map((cha) => (isObjectSlot(cha) ? cha.chaId : undefined))
    repairDatabaseIds(tree)
    tree.characters.forEach((cha, i) => {
        if (isObjectSlot(cha) && cha.coldstorage && idsBefore[i] !== undefined && idsBefore[i] !== cha.chaId) {
            console.warn(`The id repair changed the chaId of an archived character (was ${idsBefore[i]}); it cannot be restored.`)
        }
    })
    tree.characters = tree.characters.filter(isObjectSlot)

    // The container fields `setDatabase` would give the tree before its first
    // save. A missing one is written as an empty block that a strict decode
    // rejects.
    Reflect.deleteProperty(tree, 'account')
    tree.modules ??= []
    tree.loadouts ??= []
    tree.plugins ??= []

    const characters = tree.characters
    const eligible = eligibleIndexes(characters, input.keepInline)
    const archivedInfo = new Map<number, { key: string, stubJson: string }>()
    let stoppedAt: string | null = null
    const makeKey = deps.newUnitKey ?? uuidv4
    for (let n = 0; n < eligible.length; n++) {
        const index = eligible[n]
        const slot = characters[index]
        deps.setProgress?.(`Archiving characters ${n + 1}/${eligible.length}`)
        // The unit holds the character as the application would hold it after
        // install.
        applyCharacterDefaults(slot)
        resetChatStreamingState(slot)
        const key = makeKey()
        let readBack: Slot | null = null
        if (await deps.writeUnit(key, { character: slot })) {
            const read = await deps.readUnit(key)
            const candidate = read.status === 'ok' ? characterOf(read.value) : null
            if (candidate && candidate.chaId === slot.chaId) {
                readBack = candidate
            }
        }
        if (!readBack) {
            stoppedAt = typeof slot.name === 'string' ? slot.name : ''
            break
        }
        // The slot's full object is dropped as soon as its stub replaces it.
        const stub = buildColdStub(readBack, key, pointerChatKeys(readBack))
        characters[index] = stub
        archivedInfo.set(index, { key, stubJson: JSON.stringify(stub) })
    }

    const notices: BootArchiveNotice[] = []
    if (archivedInfo.size === 0 && !keyAbsent) {
        // Nothing changed that is worth a write: the boot's own record of the
        // file stands.
        if (stoppedAt !== null) {
            notices.push({ kind: 'archive-stopped', characterName: stoppedAt })
        }
        return { kind: 'install', tree, noteBytes: null, notices }
    }

    if (keyAbsent) {
        tree.archiveCharacters = true
    }
    const encoder = deps.createEncoder?.() ?? new RisuSaveEncoder()
    await encoder.init(tree, { compression: false, enableRemoteSaving: !!tree.enableRemoteSaving })
    await encoder.set(tree, emptyToSave())
    const encoded = encoder.encode()
    if (!encoded) {
        throw new Error('The encoder produced no file.')
    }
    const bytes = new Uint8Array(encoded)
    const expected: CommittedCharacterExpectation[] = characters.map((cha, index) => {
        const info = archivedInfo.get(index)
        return info
            ? { chaId: String(cha.chaId), archivedUnitKey: info.key, stubJson: info.stubJson }
            : { chaId: String(cha.chaId), archivedUnitKey: null }
    })
    const check = await checkCommittedBlocks(bytes, expected)
    if (check.ok === false) {
        throw new Error(`The encoded save failed its block check: ${check.reason}`)
    }
    await deps.writeMainFile(bytes)

    if (keyAbsent) {
        notices.push({ kind: 'archive-enabled' })
    }
    if (stoppedAt !== null) {
        notices.push({ kind: 'archive-stopped', characterName: stoppedAt })
    }
    return { kind: 'install', tree, noteBytes: bytes, notices }
}

/**
 * The main file decoded the way the boot decodes it, and never through the
 * pass: strictly first, then as the boot has always decoded. Null when neither
 * decode works.
 */
async function decodeLikeBoot(bytes: Uint8Array): Promise<Database | null> {
    try {
        return await decodeRisuSave(bytes, { strict: true })
    } catch (error) {
        try {
            return await decodeRisuSave(bytes)
        } catch (looseError) {
            return null
        }
    }
}

/**
 * The outcome after a failed pass: the main file is read again under the same
 * hold and installed as it is. The read goes through the adopting read, so the
 * Node revision the failed commit may have moved is taken again.
 *
 * On web (LocalForage, OPFS and the Node server alike) a re-read that throws
 * or returns nothing stops the boot: the file was readable when the boot read
 * it, so a failed read says nothing about it and a backup copy must not stand
 * in for it. Only bytes that are read but do not decode take the backup path.
 * On Tauri the pre-pass bytes are written back first.
 */
async function installMainFileAsItIs(
    host: BootArchiveHost,
    deps: BootArchiveDeps,
    input: BootArchivePassInput,
    keyAbsent: boolean,
): Promise<BootArchiveOutcome> {
    let bytes: Uint8Array | null | undefined
    let readError: unknown = undefined
    let readFailed = false
    try {
        bytes = await deps.readMainFile()
    } catch (error) {
        readFailed = true
        readError = error
    }
    if (host === 'web' && (readFailed || !bytes || bytes.length === 0)) {
        // With no reading of the file there is nothing safe to install or
        // write; on the Node server the file is also the authority and may
        // belong to another device.
        return { kind: 'stop', error: readFailed ? readError : new Error('The main save file could not be read again after the archive pass failed: nothing was returned.') }
    }
    let tree = bytes ? await decodeLikeBoot(bytes) : null
    if (!tree && host === 'tauri' && input.prePassBytes) {
        // Nothing else writes the main file at boot, so the bytes the boot
        // read can be put back before the file is read once more.
        try {
            await deps.writeMainFile(input.prePassBytes)
            bytes = await deps.readMainFile()
            tree = bytes ? await decodeLikeBoot(bytes) : null
        } catch (error) {
            console.error('Writing the pre-pass save file back failed:', error)
            tree = null
        }
    }
    if (!tree || !bytes) {
        return { kind: 'backup-fallback' }
    }
    // Shown when the file the app now installs holds the key the boot read
    // lacked, whichever write put it there.
    const notices: BootArchiveNotice[] = keyAbsent && tree.archiveCharacters === true ? [{ kind: 'archive-enabled' }] : []
    return { kind: 'install', tree, noteBytes: bytes, notices }
}

//#region block check

/** One character the committed file must hold, in tree order. */
export interface CommittedCharacterExpectation {
    chaId: string
    /** The unit key the stub carries when this slot was archived; `null` for a slot kept as the encoder produced it. */
    archivedUnitKey: string | null
    /** `JSON.stringify` of the stub the encoder was given; compared byte for byte, or by name and hash when the block is a remote pointer. Present exactly when `archivedUnitKey` is. */
    stubJson?: string
}

export type CommitCheckResult = { ok: true } | { ok: false, reason: string }

/** Blocks up to this size are parsed whole by the check; a larger one is only checked for the shape of a JSON array. */
const CHECK_PARSE_LIMIT_BYTES = 4 * 1024 * 1024

const REQUIRED_BLOCKS: readonly { name: string, type: RisuSaveType, array: boolean }[] = [
    { name: 'root', type: RisuSaveType.ROOT, array: false },
    { name: 'config', type: RisuSaveType.CONFIG, array: false },
    { name: 'preset', type: RisuSaveType.BOTPRESET, array: true },
    { name: 'modules', type: RisuSaveType.MODULES, array: true },
    { name: 'loadouts', type: RisuSaveType.LOADOUTS, array: true },
    { name: 'plugins', type: RisuSaveType.PLUGINS, array: true },
]

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

function isCharacterBlockType(type: RisuSaveType): boolean {
    return type === RisuSaveType.CHARACTER_WITH_CHAT
        || type === RisuSaveType.CHARACTER_WITHOUT_CHAT
        || type === RisuSaveType.REMOTE
}

function parseJson(data: Uint8Array): { ok: true, value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(textDecoder.decode(data)) }
    } catch (error) {
        return { ok: false }
    }
}

/** Why a required non-character block is unusable, or null when it is fine. */
function containerBlockProblem(block: EncodedBlockView, array: boolean): string | null {
    if (block.data.length === 0) {
        return `the "${block.name}" block is empty`
    }
    if (block.data.length > CHECK_PARSE_LIMIT_BYTES) {
        const open = array ? 0x5B : 0x7B
        const close = array ? 0x5D : 0x7D
        return block.data[0] === open && block.data[block.data.length - 1] === close
            ? null
            : `the "${block.name}" block is not JSON of the expected shape`
    }
    const parsed = parseJson(block.data)
    if (!parsed.ok) {
        return `the "${block.name}" block does not parse`
    }
    const shapeOk = array
        ? Array.isArray(parsed.value)
        : typeof parsed.value === 'object' && parsed.value !== null && !Array.isArray(parsed.value)
    return shapeOk ? null : `the "${block.name}" block is not the expected kind of JSON`
}

/**
 * The order in which the encoder's block table lists character keys: the
 * table is a plain object, whose integer-like keys come first in ascending
 * order, then the others in insertion order.
 */
function inEncoderKeyOrder(expected: readonly CommittedCharacterExpectation[]): CommittedCharacterExpectation[] {
    const isIndexKey = (key: string) => /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < 4294967295
    const indexKeyed = expected.filter((e) => isIndexKey(e.chaId)).sort((a, b) => Number(a.chaId) - Number(b.chaId))
    return [...indexKeyed, ...expected.filter((e) => !isIndexKey(e.chaId))]
}

interface RemotePointer {
    v: number
    type: number
    name: string
    hash: string
}

function asRemotePointer(value: unknown): RemotePointer | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const pointer = value as Partial<RemotePointer>
    return pointer.v === 2
        && typeof pointer.type === 'number'
        && typeof pointer.name === 'string'
        && typeof pointer.hash === 'string'
        ? pointer as RemotePointer
        : null
}

/**
 * The block check made before the committed file overwrites the main file.
 * The encoded bytes must hold, in their own block order, exactly one
 * character block (inline or a remote pointer) per entry of `expected`; each
 * archived slot's block is a stub carrying its unit key (a remote pointer is
 * compared by name and hash with `stubJson`); the root (with `__directory`),
 * config, presets, modules, loadouts and plugins blocks are present and
 * parse; and every `__directory` entry has its block. It reads no remote file
 * and never holds a second decoded copy of the full characters: only the root,
 * the small container blocks and the stubs are parsed.
 */
export async function checkCommittedBlocks(bytes: Uint8Array, expected: readonly CommittedCharacterExpectation[]): Promise<CommitCheckResult> {
    const fail = (reason: string): CommitCheckResult => ({ ok: false, reason })
    let blocks: EncodedBlockView[]
    try {
        blocks = listEncodedBlocks(bytes)
    } catch (error) {
        return fail(`the encoded file cannot be walked: ${error instanceof Error ? error.message : String(error)}`)
    }

    const byName = new Map<string, EncodedBlockView>()
    for (const block of blocks) {
        if (byName.has(block.name)) {
            return fail(`the block name "${block.name}" appears twice`)
        }
        byName.set(block.name, block)
        if (block.compression) {
            return fail(`the "${block.name}" block is compressed`)
        }
    }

    const fixedNames = new Set<string>(REQUIRED_BLOCKS.map((required) => required.name))
    fixedNames.add('pluginStorage')
    for (const required of REQUIRED_BLOCKS) {
        const block = byName.get(required.name)
        if (!block || block.type !== required.type) {
            return fail(`the "${required.name}" block is missing`)
        }
        const problem = containerBlockProblem(block, required.array)
        if (problem) {
            return fail(problem)
        }
    }
    const storage = byName.get('pluginStorage')
    if (storage && storage.type !== RisuSaveType.PLUGIN_STORAGE) {
        return fail('the "pluginStorage" block has the wrong kind')
    }

    const root = parseJson((byName.get('root') as EncodedBlockView).data)
    const directory = root.ok ? (root.value as { __directory?: unknown }).__directory : undefined
    if (!Array.isArray(directory)) {
        return fail('the root block has no directory')
    }
    for (const entry of directory) {
        if (typeof entry !== 'string' || !byName.has(entry)) {
            return fail(`the directory names a block the file does not hold: ${String(entry)}`)
        }
    }

    // Every block that is not one of the fixed ones is a character block. A
    // character whose chaId is a fixed name was refused above by that block's
    // kind (preset, modules, loadouts, plugins, pluginStorage) or is refused by
    // the count below (root, config, whose block replaced the character's).
    const characterBlocks: EncodedBlockView[] = []
    for (const block of blocks) {
        if (fixedNames.has(block.name)) {
            continue
        }
        if (!isCharacterBlockType(block.type)) {
            return fail(`the "${block.name}" block is not a character block`)
        }
        characterBlocks.push(block)
    }
    const wanted = inEncoderKeyOrder(expected)
    if (characterBlocks.length !== wanted.length) {
        return fail(`the file holds ${characterBlocks.length} character blocks, expected ${wanted.length}`)
    }
    for (let i = 0; i < wanted.length; i++) {
        const block = characterBlocks[i]
        const want = wanted[i]
        if (block.name !== want.chaId) {
            return fail(`character block ${i} is "${block.name}", expected "${want.chaId}"`)
        }
        let pointer: RemotePointer | null = null
        if (block.type === RisuSaveType.REMOTE) {
            const parsed = parseJson(block.data)
            pointer = parsed.ok ? asRemotePointer(parsed.value) : null
            if (!pointer || pointer.name !== want.chaId) {
                return fail(`the remote pointer of "${want.chaId}" is not valid`)
            }
        }
        if (want.archivedUnitKey === null) {
            continue
        }
        if (want.stubJson === undefined) {
            return fail(`no stub was given for "${want.chaId}"`)
        }
        const stubBytes = textEncoder.encode(want.stubJson)
        if (pointer) {
            if (pointer.hash !== await hashRemoteBlockContent(stubBytes)) {
                return fail(`the remote pointer of "${want.chaId}" does not name its stub`)
            }
        } else if (!sameBytes(block.data, stubBytes)) {
            return fail(`the block of "${want.chaId}" is not its stub`)
        }
    }
    return { ok: true }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true
}

//#endregion
