// Stage A (A-lite) of the chat-list-window plan: bound the mounted message
// window (`loadPages` in DefaultChatScreen.svelte) to its initial size on a
// chat-identity change, but only when no message editor is open. Edit safety
// belongs to the draft store (`localDrafts.ts`), not to this policy -- this
// module only decides *when* it is safe to reset, never *whether* an editor
// survives.

// A chat object may lack a stable `id` (backfilled at boot and on import, but
// not guaranteed before then). For those, identity falls back to the object
// itself via a WeakMap, so a genuine replacement of an id-less chat object
// still produces a new key -- gated, so nothing is lost, only the view jumps.
let idlessKeySeq = 0
const idlessKeys = new WeakMap<object, string>()

function chatIdentity(chat: { id?: string } | undefined): string {
    if (chat === undefined) {
        return 'none'
    }
    if (chat.id !== undefined) {
        return chat.id
    }
    let key = idlessKeys.get(chat)
    if (key === undefined) {
        idlessKeySeq += 1
        key = `idless-${idlessKeySeq}`
        idlessKeys.set(chat, key)
    }
    return key
}

// Derives a stable string key for a (character, chat) pair. Two distinct
// chat objects that share a string `id` collapse to the same key -- keying on
// object identity instead would split one chat into two after a
// cold-storage reload replaces the object.
export function chatWindowKey(chaId: string | undefined, chat: { id?: string } | undefined): string {
    return `${chaId ?? 'none'}:${chatIdentity(chat)}`
}

export interface ChatWindowKeyResult {
    next: number
    lowered: boolean
}

export interface ChatWindowPolicy {
    /**
     * Reports the current chat key and the window's current value. Returns
     * the value the window should have next, and whether that value is a
     * lowering of `current`.
     */
    onKey(key: string, current: number): ChatWindowKeyResult
    /**
     * Marks the start of a full-window screenshot capture. Overlapping calls
     * (e.g. a double-clicked screenshot button) increment a depth counter;
     * only the outermost call's `current` is saved as the value to restore
     * to later.
     */
    beginScreenshot(current: number): void
    /**
     * Marks the end of a full-window screenshot capture, decrementing the
     * depth counter. Returns the value to restore the window to, or `null`
     * when there is nothing to apply now -- either an outer capture is still
     * running, or the restore is pending until every message editor closes
     * (`onDraftsChanged` applies it then).
     */
    endScreenshot(): number | null
    /**
     * Called after the draft set changes (a registration or
     * unregistration). Returns a pending screenshot restore value once
     * editors have closed, or `null` when there is nothing to apply.
     */
    onDraftsChanged(): number | null
}

export function createChatWindowPolicy(deps: {
    initial: () => number
    editorsOpen: () => boolean
}): ChatWindowPolicy {
    let lastKey: string | undefined
    // A depth counter, not a boolean: overlapping `runWithFullWindow` calls
    // (e.g. a double-clicked screenshot button) must not let the second
    // `beginScreenshot` clobber the first capture's saved pre-screenshot
    // value, nor let the first `endScreenshot` mark the screenshot inactive
    // while the second capture is still running.
    let screenshotDepth = 0
    let screenshotPreValue: number | null = null
    let keyChangedDuringScreenshot = false
    let pendingRestore: number | null = null

    function onKey(key: string, current: number): ChatWindowKeyResult {
        const isFirst = lastKey === undefined
        const changed = !isFirst && key !== lastKey
        lastKey = key

        if (!changed) {
            return { next: current, lowered: false }
        }

        if (screenshotDepth > 0) {
            // Resets are suppressed while a screenshot runs -- the window is
            // deliberately held at its full-capture value. Record that the
            // key moved, so endScreenshot restores to the initial value
            // instead of the (now stale) pre-screenshot value.
            keyChangedDuringScreenshot = true
            // A pending restore (from an earlier, already-finished capture)
            // belongs to the chat we're now leaving -- fall back to the new
            // chat's initial value instead of ever applying it.
            if (pendingRestore !== null) {
                pendingRestore = deps.initial()
            }
            return { next: current, lowered: false }
        }

        if (deps.editorsOpen()) {
            // Same reasoning as above: a stale pending restore must not
            // survive a key change just because an editor kept the reset
            // itself from happening.
            if (pendingRestore !== null) {
                pendingRestore = deps.initial()
            }
            return { next: current, lowered: false }
        }

        // A genuine reset supersedes any stale pending screenshot restore --
        // otherwise a later onDraftsChanged could resurrect a value that
        // belongs to the chat just left.
        pendingRestore = null

        const next = deps.initial()
        return { next, lowered: next < current }
    }

    function beginScreenshot(current: number): void {
        if (screenshotDepth === 0) {
            screenshotPreValue = current
            keyChangedDuringScreenshot = false
        }
        screenshotDepth += 1
    }

    function endScreenshot(): number | null {
        screenshotDepth -= 1
        if (screenshotDepth > 0) {
            // An outer (or another overlapping) capture is still running --
            // nothing to restore yet.
            return null
        }

        const restoreValue = keyChangedDuringScreenshot ? deps.initial() : screenshotPreValue
        keyChangedDuringScreenshot = false
        screenshotPreValue = null

        if (deps.editorsOpen()) {
            pendingRestore = restoreValue
            return null
        }
        return restoreValue
    }

    function onDraftsChanged(): number | null {
        if (pendingRestore === null) {
            return null
        }
        if (deps.editorsOpen()) {
            return null
        }
        const value = pendingRestore
        pendingRestore = null
        return value
    }

    return { onKey, beginScreenshot, endScreenshot, onDraftsChanged }
}

// Wraps a full-window (Infinity) capture: sets the window to Infinity for
// the duration of `fn`, then restores it in `finally` -- so a throw from
// `fn` still restores. The restore value and timing are entirely decided by
// `policy.endScreenshot()`: overlapping calls (e.g. a double-clicked
// screenshot button) share the policy's depth counter, so nothing is
// restored until the outermost capture ends, and then only to the
// pre-first-capture value -- or to the initial value instead, if the chat
// key changed during any of the nested captures. With an editor open, `set`
// is not called here at all (`endScreenshot` returns `null`); the caller's
// `onDraftsChanged` subscription applies the pending value once editors
// close.
export async function runWithFullWindow<T>(
    policy: ChatWindowPolicy,
    get: () => number,
    set: (next: number) => void,
    fn: () => Promise<T>
): Promise<T> {
    policy.beginScreenshot(get())
    set(Infinity)
    try {
        return await fn()
    } finally {
        const restore = policy.endScreenshot()
        if (restore !== null) {
            set(restore)
        }
    }
}
