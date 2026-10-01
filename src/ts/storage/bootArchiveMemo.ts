/**
 * The device memo of the boot archive pass: the characters the pass skipped
 * because their unit could not be stored, and whether the Node server refused
 * the commit as too large. Both live in `localStorage`, which is readable
 * before the database is installed, and hold nothing else about a character
 * than its `chaId`.
 *
 * The pass only reads the memo. `bootstrap.ts` writes it, and only after it has
 * posted the notice that carries it, so a boot that never reaches the user
 * leaves no memo and the next boot behaves as if nothing had happened. Turning
 * the setting off clears it. Every access is guarded: storage that throws reads
 * as an empty memo and a write that throws is logged and ignored, which costs a
 * retry on the next boot and nothing else.
 */

export interface ArchiveMemo {
    /** `chaId`s of characters the pass does not try to archive on this device. */
    skipped: ReadonlySet<string>
    /** The commit was over the Node server's body limit; the pass does nothing on this device. */
    tooLarge: boolean
}

const SKIPPED_KEY = 'archivePassSkipped'
const TOO_LARGE_KEY = 'archivePassTooLarge'

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

export function readArchiveMemo(): ArchiveMemo {
    let tooLarge = false
    try {
        tooLarge = localStorage.getItem(TOO_LARGE_KEY) === '1'
    } catch (error) {
        tooLarge = false
    }
    return { skipped: new Set(readSkippedIds()), tooLarge }
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

/** Forgets both memos; other storage keys are left alone. */
export function clearArchiveMemo(): void {
    try {
        localStorage.removeItem(SKIPPED_KEY)
        localStorage.removeItem(TOO_LARGE_KEY)
    } catch (error) {
        console.warn('The archive pass memo could not be cleared on this device:', error)
    }
}
