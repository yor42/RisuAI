// Set immediately before an app-initiated `location.reload()` so preload.ts's
// `beforeunload` handler (which otherwise blocks navigation to protect the
// user from an accidental tab close) lets the reload through instead of
// showing a cancellable "Reload site?" dialog. Several call sites call
// `location.reload()` and then immediately `await sleepForever()`, assuming
// the reload will actually happen and discard all JS state (including that
// pending await). If the browser showed a cancellable dialog and the user
// clicked Cancel, those sites would be parked forever with no way to resume
// saving. Kept dependency-free so `preload.ts` -- which runs very early --
// can import it safely.
let appInitiatedReload = false

// If the reload this flag was set for never actually happens (e.g. a plugin's
// own competing `beforeunload` listener -- see plugins.svelte.ts's
// `addEventListener` proxy -- cancels the navigation), the page keeps running
// with accidental-close protection silently disabled for the rest of the
// session. Bound the flag's lifetime instead: in the normal case the page is
// gone (and this timer with it) long before it fires, so it's a no-op; it
// only ever resolves in the failure case, which is exactly when the guard
// should come back.
const APP_INITIATED_RELOAD_RESET_MS = 5000

export function markAppInitiatedReload(): void {
    appInitiatedReload = true
    setTimeout(() => {
        appInitiatedReload = false
    }, APP_INITIATED_RELOAD_RESET_MS)
}

export function isAppInitiatedReload(): boolean {
    return appInitiatedReload
}

// Set immediately before handing a mailto:/tel: URL to the OS from the
// current tab (see openUrlWeb.ts), so preload.ts's `beforeunload` handler
// lets that one handoff through instead of showing the "Leave site?"
// prompt. Unlike `appInitiatedReload` above, this is one-shot: it is
// consumed by the first `beforeunload` it lets through, so a later, genuine
// attempt to leave or close the tab still prompts. The allowance lasts
// EXTERNAL_HANDOFF_RESET_MS from the most recent call -- re-arming or
// consuming it cancels any earlier expiry timer, so one handoff's expiry can
// never clear an allowance a later handoff armed. The bound itself must
// comfortably exceed the delay between setting `location.href` and the
// browser dispatching `beforeunload` for that handoff, so the handoff itself
// never prompts; a browser may not fire a `beforeunload` for a mailto:/tel:
// handoff at all, and in that case a genuine leave/close within the bound
// goes unprompted once, which is the cost of choosing it.
let pendingExternalHandoff = false
let externalHandoffResetTimer: ReturnType<typeof setTimeout> | undefined

const EXTERNAL_HANDOFF_RESET_MS = 3000

export function allowNextBeforeUnload(): void {
    pendingExternalHandoff = true
    clearTimeout(externalHandoffResetTimer)
    externalHandoffResetTimer = setTimeout(() => {
        pendingExternalHandoff = false
        externalHandoffResetTimer = undefined
    }, EXTERNAL_HANDOFF_RESET_MS)
}

export function consumeExternalHandoffAllowance(): boolean {
    if (!pendingExternalHandoff) {
        return false
    }
    pendingExternalHandoff = false
    clearTimeout(externalHandoffResetTimer)
    externalHandoffResetTimer = undefined
    return true
}
