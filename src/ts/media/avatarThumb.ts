import localforage from 'localforage'
import { readImage, forageStorage } from '../globalApi.svelte'
import { getImageType } from './imageType'
import { DBState } from '../stores.svelte'
import type { Database, folder } from '../storage/database.svelte'
import { asBuffer } from '../util'

/**
 * Small cached thumbnails for the 56px list avatars (grid, mobile list,
 * sidebar). Where a thumbnail exists, the lists draw it instead of holding
 * the full-size bitmap, so a baseline NovelAI-sized portrait (832x1216,
 * several MB decoded) costs a few KB and a one-time decode instead of paying
 * its full bitmap size on every list render.
 */

export const THUMB_SHORT_SIDE = 168
/** Bump whenever the size, format or scaling policy changes; older records
 *  then count as absent instead of being served stale. */
export const THUMB_VERSION = 1

type ThumbRecord = { v: number, src: string } | { v: number, skip: true }
type GenResult = { src: string } | { skip: true } | null
/** Public generator shape used by tests: no cleanup plumbing to inject. */
type Generator = (loc: string) => Promise<GenResult>
type ReadImageFn = (loc: string) => Promise<Uint8Array | null | undefined>

interface ThumbStoreLike {
    getItem(key: string): Promise<unknown>
    setItem(key: string, value: unknown): Promise<unknown>
    removeItem(key: string): Promise<void>
    iterate(callback: (value: unknown, key: string) => void): Promise<void>
}

interface GenContext {
    /** Lets the real generator register an early cleanup the queue's timeout
     *  can call immediately, since a hung decode may never reach its own
     *  `finally`. If the task has already timed out by the time this is
     *  called, `fn` runs immediately instead of waiting to be invoked later. */
    setCleanup(fn: () => void): void
    /** True once this task's own timeout has already fired. The generator
     *  checks this after each await so a read/decode that was still in
     *  flight at timeout doesn't go on to draw and encode the full image for
     *  a caller nobody is waiting on any more. */
    isCancelled(): boolean
}

type FullGenerator = (loc: string, ctx: GenContext) => Promise<GenResult>

const DEFAULT_CONCURRENCY = 2
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_MEMO_MAX_ENTRIES = 1000
const DEFAULT_MEMO_MAX_BYTES = 16 * 1024 * 1024
/** Bounds a single `getItem`/`setItem` call, separate from `timeoutMs`
 *  (which bounds the whole read-decode-draw pipeline), so a hung IndexedDB
 *  open or transaction can't hold a store call - or the concurrency slot
 *  `persistRecord` is awaited under - open indefinitely. */
const DEFAULT_STORE_TIMEOUT_MS = 5000

let concurrency = DEFAULT_CONCURRENCY
let timeoutMs = DEFAULT_TIMEOUT_MS
let memoMaxEntries = DEFAULT_MEMO_MAX_ENTRIES
let memoMaxBytes = DEFAULT_MEMO_MAX_BYTES
let storeTimeoutMs = DEFAULT_STORE_TIMEOUT_MS

/** Sentinel returned by `withStoreTimeout` when the timeout wins the race;
 *  a rejection from the underlying call still propagates normally. */
const STORE_TIMEOUT = Symbol('avatarThumb-store-timeout')

/** Races a store call against `storeTimeoutMs`. On timeout resolves to
 *  `STORE_TIMEOUT` while leaving the original call to settle in the
 *  background (its `.then` here still "handles" it, so a later rejection
 *  never surfaces as unhandled). A genuine rejection is not converted to a
 *  timeout - it still rejects, so existing error handling is unchanged. */
function withStoreTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof STORE_TIMEOUT> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(STORE_TIMEOUT), ms)
        promise.then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (err) => {
                clearTimeout(timer)
                reject(err)
            }
        )
    })
}

// ---------------------------------------------------------------------------
// Store: a cache, not data. Losing it only costs regeneration, so every
// failure path below falls back to "the thumbnail feature is off" instead of
// surfacing an error.
// ---------------------------------------------------------------------------

let realStore: ThumbStoreLike | null | undefined
let storeOverride: ThumbStoreLike | null = null

function getStore(): ThumbStoreLike | null {
    if (storeOverride) {
        return storeOverride
    }
    if (realStore === undefined) {
        try {
            // Pinning the driver keeps bulk thumbnails out of localStorage
            // when IndexedDB is unavailable, rather than silently degrading.
            realStore = localforage.createInstance({
                name: 'risuThumb',
                storeName: 'avatarThumb',
                driver: localforage.INDEXEDDB
            }) as unknown as ThumbStoreLike
        } catch {
            realStore = null
        }
    }
    return realStore
}

async function readStoreRecord(loc: string): Promise<{ kind: 'src', src: string } | { kind: 'skip' } | { kind: 'miss' }> {
    const store = getStore()
    if (!store) {
        return { kind: 'miss' }
    }
    const raw = await withStoreTimeout(store.getItem(loc), storeTimeoutMs)
    if (raw === STORE_TIMEOUT) {
        // A hung read counts as a miss rather than blocking the caller.
        return { kind: 'miss' }
    }
    if (!raw || typeof raw !== 'object') {
        return { kind: 'miss' }
    }
    const rec = raw as Partial<{ v: number, src: string, skip: true }>
    if (rec.v !== THUMB_VERSION) {
        return { kind: 'miss' }
    }
    if (rec.skip) {
        return { kind: 'skip' }
    }
    if (typeof rec.src === 'string') {
        return { kind: 'src', src: rec.src }
    }
    return { kind: 'miss' }
}

async function persistRecord(loc: string, record: ThumbRecord): Promise<void> {
    const store = getStore()
    if (!store) {
        return
    }
    try {
        // A timeout (like a rejection) is simply ignored here: the caller
        // already has the generated src regardless of whether this write
        // ever lands.
        await withStoreTimeout(store.setItem(loc, record), storeTimeoutMs)
    } catch {
        // Best-effort: a full quota or a broken store must not take away the
        // thumbnail already generated for this call.
    }
}

// ---------------------------------------------------------------------------
// In-memory memo (LRU by insertion order) and in-flight dedupe.
// ---------------------------------------------------------------------------

const memo = new Map<string, string | null>()
let memoBytes = 0
const inFlight = new Map<string, Promise<string | null>>()

function memoValueBytes(value: string | null): number {
    return value ? value.length : 0
}

function memoize(loc: string, value: string | null) {
    if (memo.has(loc)) {
        memoBytes -= memoValueBytes(memo.get(loc) ?? null)
        memo.delete(loc)
    }
    memo.set(loc, value)
    memoBytes += memoValueBytes(value)
    while (memo.size > 0 && (memo.size > memoMaxEntries || memoBytes > memoMaxBytes)) {
        const oldestKey = memo.keys().next().value
        if (oldestKey === undefined) {
            break
        }
        memoBytes -= memoValueBytes(memo.get(oldestKey) ?? null)
        memo.delete(oldestKey)
    }
}

// ---------------------------------------------------------------------------
// Queue: concurrency-limited, LIFO (the icon still on screen shouldn't wait
// behind ones already scrolled past), with a per-task timeout.
// ---------------------------------------------------------------------------

interface QueueTask {
    loc: string
    resolve: (value: string | null) => void
}

const queue: QueueTask[] = []
let running = 0

function pump() {
    while (running < concurrency && queue.length > 0) {
        const task = queue.pop()
        if (!task) {
            break
        }
        running++
        void runTask(task)
    }
}

async function runTask(task: QueueTask) {
    let settled = false
    let cancelled = false
    let cleanupFn: (() => void) | null = null

    // Frees the slot and resolves exactly once, whichever of "timeout" or
    // "generator settled" happens first. The other path becomes a no-op via
    // `settled`, so the concurrency slot can never be double-freed.
    const finishAndFree = (value: string | null) => {
        if (settled) {
            return
        }
        settled = true
        running--
        task.resolve(value)
        pump()
    }

    const timer = setTimeout(() => {
        cancelled = true
        try {
            cleanupFn?.()
        } catch {
            // best-effort cleanup only
        }
        finishAndFree(null)
    }, timeoutMs)

    const ctx: GenContext = {
        setCleanup(fn) {
            cleanupFn = fn
            if (settled) {
                // Defensive: current `realGenerate` can't reach this branch,
                // since it checks `isCancelled()` with no await before
                // calling `setCleanup`, and injected test generators never
                // receive `ctx` at all. Kept so that removing that post-read
                // check, or adding an await before `setCleanup`, still can't
                // leak a blob URL/image instead of just dropping the cleanup.
                try {
                    fn()
                } catch {
                    // best-effort cleanup only
                }
            }
        },
        isCancelled() {
            return cancelled
        }
    }

    try {
        const result = await currentGenerator(task.loc, ctx)
        clearTimeout(timer)
        if (settled) {
            // Already timed out: a late result is neither stored nor memoized.
            return
        }
        if (result === null) {
            // Transient failure: not stored, not memoized, so the next
            // request retries.
            finishAndFree(null)
        }
        else if ('skip' in result) {
            await persistRecord(task.loc, { v: THUMB_VERSION, skip: true })
            memoize(task.loc, null)
            finishAndFree(null)
        }
        else {
            await persistRecord(task.loc, { v: THUMB_VERSION, src: result.src })
            memoize(task.loc, result.src)
            finishAndFree(result.src)
        }
    } catch {
        clearTimeout(timer)
        finishAndFree(null)
    }
}

function enqueueGeneration(loc: string): Promise<string | null> {
    if (!ensureReadbackAllowed()) {
        return Promise.resolve(null)
    }
    return new Promise<string | null>((resolve) => {
        queue.push({ loc, resolve })
        pump()
    })
}

// ---------------------------------------------------------------------------
// Public lookup.
// ---------------------------------------------------------------------------

async function resolveThumb(loc: string): Promise<string | null> {
    try {
        const record = await readStoreRecord(loc)
        if (record.kind === 'src') {
            memoize(loc, record.src)
            return record.src
        }
        if (record.kind === 'skip') {
            memoize(loc, null)
            return null
        }
    } catch {
        // A broken store read must not reject the caller; it also can't be
        // trusted enough to attempt generation this call.
        return null
    }
    return enqueueGeneration(loc)
}

/**
 * Resolves a cached (or freshly generated) list-avatar thumbnail for `loc`,
 * or `null` when the caller should fall back to the full-size path. Never
 * rejects, and reads no reactive state before its first await so it stays
 * safe to call from a Svelte `{@const}`.
 */
export async function getAvatarThumbSrc(loc: string): Promise<string | null> {
    if (memo.has(loc)) {
        return memo.get(loc) ?? null
    }
    const existing = inFlight.get(loc)
    if (existing) {
        return existing
    }
    const promise = resolveThumb(loc).finally(() => {
        inFlight.delete(loc)
    })
    inFlight.set(loc, promise)
    return promise
}

/** Account-synced avatars keep today's hub URL; only local `assets/` locs
 *  are eligible. Stricter than strictly needed on Tauri-with-account, but
 *  never more aggressive than the existing full-size path. */
export function isThumbEligible(loc: string): boolean {
    return loc.startsWith('assets/') && !forageStorage.isAccount
}

// ---------------------------------------------------------------------------
// Canvas readback guard: some fingerprinting-resistant browsers return
// altered pixel data from getImageData, which would make a stored "thumbnail"
// garbage. Checked once per session, before the first generation attempt.
// ---------------------------------------------------------------------------

let readbackChecked = false
let readbackAllowed = true
let readbackCheckFn: () => boolean = defaultReadbackCheck

function ensureReadbackAllowed(): boolean {
    if (!readbackChecked) {
        readbackChecked = true
        try {
            readbackAllowed = readbackCheckFn()
        } catch {
            readbackAllowed = false
        }
    }
    return readbackAllowed
}

function defaultReadbackCheck(): boolean {
    try {
        const canvas = document.createElement('canvas')
        canvas.width = 4
        canvas.height = 4
        const c2d = canvas.getContext('2d')
        if (!c2d) {
            return false
        }
        const expected = new Uint8ClampedArray(4 * 4 * 4)
        for (let i = 0; i < 16; i++) {
            expected[i * 4] = (i * 17) % 256
            expected[i * 4 + 1] = (i * 53) % 256
            expected[i * 4 + 2] = (i * 97) % 256
            expected[i * 4 + 3] = 255
        }
        c2d.putImageData(new ImageData(expected.slice(), 4, 4), 0, 0)
        const actual = c2d.getImageData(0, 0, 4, 4).data
        for (let i = 0; i < expected.length; i++) {
            if (actual[i] !== expected[i]) {
                return false
            }
        }
        return true
    } catch {
        return false
    }
}

// ---------------------------------------------------------------------------
// Pure format sniffing, exported for tests.
// ---------------------------------------------------------------------------

function readU32BE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0
}

function chunkTypeAt(bytes: Uint8Array, offset: number): string {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function isGif(bytes: Uint8Array): boolean {
    return bytes.length >= 6 &&
        bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
        bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
}

function isPng(bytes: Uint8Array): boolean {
    return bytes.length >= 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
}

function isApng(bytes: Uint8Array): boolean {
    let pos = 8
    while (pos + 8 <= bytes.length) {
        const length = readU32BE(bytes, pos)
        const type = chunkTypeAt(bytes, pos + 4)
        if (type === 'IDAT' || type === 'IEND') {
            return false
        }
        if (type === 'acTL') {
            return true
        }
        if (pos + 8 + length + 4 > bytes.length) {
            // Overrunning length: malformed, stop without deciding.
            return false
        }
        pos += 8 + length + 4
    }
    return false
}

function isRiffWebp(bytes: Uint8Array): boolean {
    return bytes.length >= 16 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
}

function isAnimatedWebp(bytes: Uint8Array): boolean {
    if (bytes.length < 21) {
        return false
    }
    if (chunkTypeAt(bytes, 12) !== 'VP8X') {
        return false
    }
    return (bytes[20] & 0x02) !== 0
}

function isIsoBmff(bytes: Uint8Array): boolean {
    return bytes.length >= 12 && chunkTypeAt(bytes, 4) === 'ftyp'
}

function hasAvisBrand(bytes: Uint8Array): boolean {
    if (chunkTypeAt(bytes, 8) === 'avis') {
        return true
    }
    const boxSize = readU32BE(bytes, 0)
    const end = boxSize > 0 && boxSize <= bytes.length ? boxSize : bytes.length
    let pos = 16
    while (pos + 4 <= end) {
        if (chunkTypeAt(bytes, pos) === 'avis') {
            return true
        }
        pos += 4
    }
    return false
}

/** Pure and never throws, even on truncated or malformed input. */
export function isAnimatedImage(bytes: Uint8Array): boolean {
    try {
        if (isGif(bytes)) {
            return true
        }
        if (isPng(bytes)) {
            return isApng(bytes)
        }
        if (isRiffWebp(bytes)) {
            return isAnimatedWebp(bytes)
        }
        if (isIsoBmff(bytes)) {
            return hasAvisBrand(bytes)
        }
        return false
    } catch {
        return false
    }
}

/** Pure. `null` when the short side is already at or under `shortSide`, since
 *  the full-size path then costs no more than a thumbnail would. */
export function thumbDimensions(w: number, h: number, shortSide: number): { w: number, h: number } | null {
    if (!(w > 0) || !(h > 0)) {
        return null
    }
    if (Math.min(w, h) <= shortSide) {
        return null
    }
    const scale = shortSide / Math.min(w, h)
    return {
        w: Math.max(1, Math.round(w * scale)),
        h: Math.max(1, Math.round(h * scale))
    }
}

// ---------------------------------------------------------------------------
// Real generator.
// ---------------------------------------------------------------------------

let currentReadImage: ReadImageFn = readImage

function mimeForType(type: ReturnType<typeof getImageType>): string {
    switch (type) {
        case 'JPEG': return 'image/jpeg'
        case 'PNG': return 'image/png'
        case 'WEBP': return 'image/webp'
        case 'BMP': return 'image/bmp'
        case 'AVIF': return 'image/avif'
        default: return 'application/octet-stream'
    }
}

async function realGenerate(loc: string, ctx: GenContext): Promise<GenResult> {
    const bytes = await currentReadImage(loc)
    if (ctx.isCancelled()) {
        // The queue's timeout already resolved the caller with null while
        // this read was still pending; decoding and drawing the full image
        // now would just be unbounded work outside the concurrency limit.
        return null
    }
    if (!bytes || bytes.length < 12) {
        return null
    }
    if (isAnimatedImage(bytes)) {
        return { skip: true }
    }
    const type = getImageType(bytes)
    if (type === 'Unknown') {
        return { skip: true }
    }

    const blob = new Blob([asBuffer(bytes)], { type: mimeForType(type) })
    // Built from a same-origin blob: URL rather than the resolved asset src,
    // so the Tauri asset protocol's cross-origin behaviour can never taint
    // the canvas.
    const url = URL.createObjectURL(blob)
    const img = new Image()
    let cleaned = false
    const cleanup = () => {
        if (cleaned) {
            return
        }
        cleaned = true
        URL.revokeObjectURL(url)
        img.src = ''
    }
    ctx.setCleanup(cleanup)

    let canvas: HTMLCanvasElement | null = null
    try {
        img.src = url
        await img.decode()
        if (ctx.isCancelled()) {
            return null
        }
        const dims = thumbDimensions(img.naturalWidth, img.naturalHeight, THUMB_SHORT_SIDE)
        if (!dims) {
            return { skip: true }
        }
        canvas = document.createElement('canvas')
        canvas.width = dims.w
        canvas.height = dims.h
        const c2d = canvas.getContext('2d')
        if (!c2d) {
            return null
        }
        c2d.imageSmoothingQuality = 'high'
        c2d.drawImage(img, 0, 0, dims.w, dims.h)
        let dataUrl = canvas.toDataURL('image/webp', 0.85)
        if (!dataUrl.startsWith('data:image/webp')) {
            // WebKit historically has no WebP encoder; PNG keeps alpha too.
            dataUrl = canvas.toDataURL('image/png')
        }
        return { src: dataUrl }
    }
    finally {
        // Zeroing releases the backing pixel buffer even when drawImage or
        // toDataURL throws, not only on the success path above.
        if (canvas) {
            canvas.width = 0
            canvas.height = 0
        }
        cleanup()
    }
}

let currentGenerator: FullGenerator = realGenerate

// ---------------------------------------------------------------------------
// Boot sweep: independent of `cleanChunks`, touches only this store.
// ---------------------------------------------------------------------------

/** Full `loc` keys worth keeping: every character/group image, plus folder
 *  images from `characterOrder`. Cold-storage stubs and trashed characters
 *  both keep their `image` field, so no cold read is needed here. */
export function buildThumbKeepSet(db: Database): Set<string> {
    const keep = new Set<string>()
    const characters = db?.characters ?? []
    for (const c of characters) {
        if (c && c.image) {
            keep.add(c.image)
        }
    }
    const order = db?.characterOrder ?? []
    for (const entry of order) {
        if (entry && typeof entry !== 'string') {
            const imgFile = (entry as folder).imgFile
            if (imgFile) {
                keep.add(imgFile)
            }
        }
    }
    return keep
}

/** Deletes records whose key is not in `keep`, or whose `v` is stale. Never
 *  throws: a wrong keep-set can only delete thumbnails, which regenerate. */
export async function sweepAvatarThumbs(keep: Set<string>): Promise<void> {
    const store = getStore()
    if (!store) {
        return
    }
    const stale: string[] = []
    try {
        await store.iterate((value, key) => {
            const rec = value as Partial<ThumbRecord> | null | undefined
            if (!rec || rec.v !== THUMB_VERSION || !keep.has(key)) {
                stale.push(key)
            }
        })
    } catch {
        return
    }
    for (const key of stale) {
        try {
            await store.removeItem(key)
        } catch {
            // best-effort
        }
    }
}

/** Called once at boot, detached from `cleanChunks`. Reads the DB, builds
 *  the keep-set and sweeps, all guarded so a bad snapshot can't affect boot
 *  or the existing asset sweeps. */
export async function startAvatarThumbSweep(): Promise<void> {
    try {
        const keep = buildThumbKeepSet(DBState.db)
        await sweepAvatarThumbs(keep)
    } catch {
        // best-effort background maintenance
    }
}

// ---------------------------------------------------------------------------
// Test hooks.
// ---------------------------------------------------------------------------

export const __avatarThumbTestHooks = {
    setStore(store: ThumbStoreLike | null) {
        storeOverride = store
    },
    setGenerator(fn: Generator) {
        currentGenerator = (loc) => fn(loc)
    },
    setReadImage(fn: ReadImageFn) {
        currentReadImage = fn
    },
    setReadbackCheck(fn: () => boolean) {
        readbackCheckFn = fn
        readbackChecked = false
    },
    setLimits(limits: { concurrency?: number, timeoutMs?: number, storeTimeoutMs?: number, memoMaxEntries?: number, memoMaxBytes?: number }) {
        if (limits.concurrency !== undefined) {
            concurrency = limits.concurrency
        }
        if (limits.timeoutMs !== undefined) {
            timeoutMs = limits.timeoutMs
        }
        if (limits.storeTimeoutMs !== undefined) {
            storeTimeoutMs = limits.storeTimeoutMs
        }
        if (limits.memoMaxEntries !== undefined) {
            memoMaxEntries = limits.memoMaxEntries
        }
        if (limits.memoMaxBytes !== undefined) {
            memoMaxBytes = limits.memoMaxBytes
        }
    },
    reset() {
        memo.clear()
        memoBytes = 0
        inFlight.clear()
        queue.length = 0
        running = 0
        readbackChecked = false
        readbackAllowed = true
        readbackCheckFn = defaultReadbackCheck
        currentGenerator = realGenerate
        currentReadImage = readImage
        storeOverride = null
        concurrency = DEFAULT_CONCURRENCY
        timeoutMs = DEFAULT_TIMEOUT_MS
        storeTimeoutMs = DEFAULT_STORE_TIMEOUT_MS
        memoMaxEntries = DEFAULT_MEMO_MAX_ENTRIES
        memoMaxBytes = DEFAULT_MEMO_MAX_BYTES
    },
    stats() {
        return {
            memoEntries: memo.size,
            memoBytes,
            inFlight: inFlight.size,
            running,
            queued: queue.length
        }
    }
}
