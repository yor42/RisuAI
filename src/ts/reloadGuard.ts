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
