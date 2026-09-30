/**
 * State shared by the modules that start, hold and cancel a generation: the
 * composer's action window, the abort controller of the one send in progress,
 * and the count of turns that auto mode reads. It imports
 * nothing, so `index.svelte.ts` and every module that imports it can depend on
 * it without a cycle.
 *
 * `doingChat` stays in `index.svelte.ts`. A starter is busy while that flag is
 * set or while `isComposerWindowOpen()` is true.
 */

let windowOpen = $state(false)

/**
 * True from the composer Send's take until its hand-off returns, for the whole
 * of a reroll or unreroll, and for a whole auto-mode run. Reactive: the Send
 * button's template reads it.
 */
export function isComposerWindowOpen(): boolean {
    return windowOpen
}

export function setComposerWindow(open: boolean): void {
    windowOpen = open
}

let unitController: AbortController | null = null

/** Publishes the abort controller of the send that has just taken the flag. */
export function publishUnit(controller: AbortController): void {
    unitController = controller
}

/** Withdraws `controller` if it is still the published one. */
export function releaseUnit(controller: AbortController): void {
    if(unitController === controller){
        unitController = null
    }
}

/** Aborts the send in progress, if any. */
export function abortUnitInProgress(): void {
    unitController?.abort()
}

let turnsReached = 0

/**
 * Called by a send at the point where it has settled on the character it
 * speaks as, past a group's own dispatch and the member checks. Auto mode
 * compares the count before and after a tick to tell a tick that reached a
 * turn from one that did not.
 */
export function noteTurnReached(): void {
    turnsReached++
}

export function turnsReachedCount(): number {
    return turnsReached
}
