import { allowNextBeforeUnload } from './reloadGuard'

/**
 * The subset of `window` that `openUrlOnWeb` needs, kept narrow and precisely
 * typed so a test can supply a plain object instead of a real `Window` (the
 * real global satisfies this structurally, so `window` itself is a valid
 * argument at every call site).
 */
export interface OpenUrlWindow {
    open(url: string, target: string, windowFeatures: string): Window | null
    location: { href: string }
}

/**
 * Web-build scheme handling for `openURL`. The URL is resolved against the
 * given window's current location (so a relative URL like `/hub-proxy/...`
 * resolves the same way a browser would resolve it), then dispatched by its
 * parsed `protocol` -- never by a raw string prefix, since the URL parser
 * itself strips things like leading whitespace or embedded tabs before the
 * scheme is read:
 * - `http:`/`https:` open in a new tab with no `window.opener` (`noopener`),
 *   so the opened page cannot reach back into this one.
 * - `mailto:`/`tel:` are handed to the OS from the current tab (setting
 *   `location.href`), with a one-shot allowance (`allowNextBeforeUnload`) so
 *   the app's own "Leave site?" prompt does not fire for that handoff.
 * - Every other scheme, and any string the URL parser rejects outright, opens
 *   nothing and leaves the current location untouched. The warning names only
 *   the refused scheme, never the full URL, since a caller (MCP OAuth
 *   discovery, for one) may pass a URL carrying authorization parameters.
 */
export function openUrlOnWeb(url: string, win: OpenUrlWindow): void {
    let resolved: URL
    try {
        resolved = new URL(url, win.location.href)
    }
    catch {
        console.warn('openURL: refused an unparsable URL')
        return
    }

    const scheme = resolved.protocol

    if (scheme === 'http:' || scheme === 'https:') {
        win.open(resolved.href, '_blank', 'noopener')
        return
    }

    if (scheme === 'mailto:' || scheme === 'tel:') {
        allowNextBeforeUnload()
        win.location.href = resolved.href
        return
    }

    console.warn(`openURL: refused to open a URL with scheme "${scheme}"`)
}
