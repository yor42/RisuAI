/**
 * The device records of the boot archive pass, all in `localStorage`, which is
 * readable before the database is installed. None holds more about a character
 * than its `chaId`.
 *
 * The notice memo: the characters the pass skipped because their unit could
 * not be stored, whether the Node server refused the commit as too large, and
 * whether the user was told archiving is paused. The pass only reads it.
 * `bootstrap.ts` writes it, and only after it has posted the notice that carries
 * it, so a boot that never reaches the user leaves no memo and the next boot
 * behaves as if nothing had happened. Reads of the memo fail open: storage that
 * throws reads as an empty memo, and a write that throws is logged and ignored,
 * which costs a repeated notice or a retry on the next boot and nothing else.
 *
 * The strike count of the crash-loop breaker: the pass itself writes it, a
 * start record before it writes anything and a reset when it succeeds. It fails
 * closed. A count that cannot be read, a start record that cannot be written
 * and a stored value that is not a count all stop the pass, because a count
 * that reads as zero would let a crash loop run unbounded.
 *
 * Turning the setting off clears all of it.
 *
 * The restore-all count of the V2.1 plugin crash-loop breaker is a separate
 * record under its own key, outside `clearArchiveMemo` and outside the
 * fail-closed strike reader above. A start record is made before every archived
 * character is restored for an enabled V2.1 plugin, and a reset when the restore
 * loop ends. It fails open, the opposite of the strike count: a count that
 * cannot be read or a start record that cannot be written lets the restore run
 * uncounted with a warning, and a stored value that is not a non-negative
 * integer reads as zero. Failing closed would switch off the user's plugin
 * whenever storage throws or is full.
 */

export interface ArchiveMemo {
    /** `chaId`s of characters the pass does not try to archive on this device. */
    skipped: ReadonlySet<string>
    /** The commit was over the Node server's body limit; the pass does nothing on this device. */
    tooLarge: boolean
    /** The paused notice was posted on this device. Fails open like the other two. */
    pausedTold: boolean
}

/**
 * What the strike count says: `none` (zero), `one`, `paused` (two or more, or a
 * stored value that is not a count) and `unreadable` (the storage threw).
 */
export type ArchiveStrikeState = 'none' | 'one' | 'paused' | 'unreadable'

const SKIPPED_KEY = 'archivePassSkipped'
const TOO_LARGE_KEY = 'archivePassTooLarge'
const STRIKES_KEY = 'archivePassStrikes'
const PAUSED_TOLD_KEY = 'archivePassPausedTold'
const RESTORE_ALL_KEY = 'v21RestoreAllStrikes'

function readSkippedIds(): string[] {
    try {
        const raw = localStorage.getItem(SKIPPED_KEY)
        if (!raw) {
            return []
        }
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch (error) {
        return []
    }
}

function readFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1'
    } catch (error) {
        return false
    }
}

export function readArchiveMemo(): ArchiveMemo {
    return {
        skipped: new Set(readSkippedIds()),
        tooLarge: readFlag(TOO_LARGE_KEY),
        pausedTold: readFlag(PAUSED_TOLD_KEY),
    }
}

/** Adds `chaIds` to the skipped characters; the ones already there stay. */
export function rememberSkipped(chaIds: readonly string[]): void {
    if (chaIds.length === 0) {
        return
    }
    try {
        const merged = new Set(readSkippedIds())
        for (const chaId of chaIds) {
            merged.add(chaId)
        }
        localStorage.setItem(SKIPPED_KEY, JSON.stringify([...merged]))
    } catch (error) {
        console.warn('The archive pass could not remember the skipped characters on this device:', error)
    }
}

export function rememberTooLarge(): void {
    try {
        localStorage.setItem(TOO_LARGE_KEY, '1')
    } catch (error) {
        console.warn('The archive pass could not remember the too-large save on this device:', error)
    }
}

export function rememberPausedTold(): void {
    try {
        localStorage.setItem(PAUSED_TOLD_KEY, '1')
    } catch (error) {
        console.warn('The archive pass could not remember that the paused notice was posted on this device:', error)
    }
}

/**
 * The count the strike record holds. Never goes through a fail-open reader:
 * a storage that throws answers `unreadable`, and a value that is not a
 * non-negative decimal integer answers `paused` (the setting off and on clears
 * it).
 */
export function readArchiveStrikes(): ArchiveStrikeState {
    let raw: string | null
    try {
        raw = localStorage.getItem(STRIKES_KEY)
    } catch (error) {
        return 'unreadable'
    }
    if (raw === null) {
        return 'none'
    }
    if (!/^[0-9]+$/.test(raw)) {
        return 'paused'
    }
    const count = Number(raw)
    return count === 0 ? 'none' : count === 1 ? 'one' : 'paused'
}

/**
 * Counts a pass that is about to write: takes none to one and one to two, and
 * answers true only when the new count reads back. Answers false, writing
 * nothing, when the count is paused or unreadable, and false when the write
 * fails or does not stick; it never throws.
 */
export function recordArchiveStart(): boolean {
    const state = readArchiveStrikes()
    if (state !== 'none' && state !== 'one') {
        return false
    }
    const next = state === 'none' ? '1' : '2'
    try {
        localStorage.setItem(STRIKES_KEY, next)
        return localStorage.getItem(STRIKES_KEY) === next
    } catch (error) {
        console.warn('The archive pass could not record that it started on this device:', error)
        return false
    }
}

/** Zero is the absence of the key. A failure is logged and ignored. */
export function resetArchiveStrikes(): void {
    try {
        localStorage.removeItem(STRIKES_KEY)
    } catch (error) {
        console.warn('The archive pass could not reset its strike count on this device:', error)
    }
}

/** The stored restore-all text: null when absent, undefined when the storage threw (logged). */
function readRestoreAllRaw(): string | null | undefined {
    try {
        return localStorage.getItem(RESTORE_ALL_KEY)
    } catch (error) {
        console.warn('The restore-all count could not be read on this device; the restore runs uncounted:', error)
        return undefined
    }
}

function restoreAllCountOf(raw: string | null | undefined): number {
    return typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : 0
}

/** The restore-all count. Zero when absent, not a count, or unreadable; never throws. */
export function readRestoreAllStrikes(): number {
    return restoreAllCountOf(readRestoreAllRaw())
}

/**
 * Counts a restore that is about to read units. Writes nothing, with a warning,
 * when the count cannot be read or the write fails; never throws.
 */
export function recordRestoreAllStart(): void {
    const raw = readRestoreAllRaw()
    if (raw === undefined) {
        return
    }
    try {
        localStorage.setItem(RESTORE_ALL_KEY, String(restoreAllCountOf(raw) + 1))
    } catch (error) {
        console.warn('The restore-all start could not be recorded on this device; the restore runs uncounted:', error)
    }
}

/** Writes zero, which is how a finished restore and every clear leave the count. Never throws. */
export function resetRestoreAllStrikes(): void {
    try {
        localStorage.setItem(RESTORE_ALL_KEY, '0')
    } catch (error) {
        console.warn('The restore-all count could not be reset on this device:', error)
    }
}

/** Resets the count only when it holds something other than zero, so a profile that never counted never writes. Never throws. */
export function clearRestoreAllStrikes(): void {
    const raw = readRestoreAllRaw()
    if (raw === null || raw === undefined || raw === '0') {
        return
    }
    resetRestoreAllStrikes()
}

/** Forgets the notice memo, the strike count and the told record; other storage keys are left alone. */
export function clearArchiveMemo(): void {
    for (const key of [SKIPPED_KEY, TOO_LARGE_KEY, STRIKES_KEY, PAUSED_TOLD_KEY]) {
        try {
            localStorage.removeItem(key)
        } catch (error) {
            console.warn('The archive pass memo could not be cleared on this device:', error)
        }
    }
}
