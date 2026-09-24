import createDOMPurify from 'dompurify'
import { openURL } from './globalApi.svelte'

/**
 * `src/ts/parser/parser.svelte.ts` registers three global `DOMPurify.addHook` calls on the
 * shared singleton at module load, and none of them are appropriate for this sink:
 * - its `href` hook sets a non-http(s) `href` to `""` rather than removing it, and an empty
 *   `href` resolves through the anchor's IDL attribute to the document's own URL, which is
 *   itself `http(s):` — so `handleHubHtmlClick`'s scheme check below would see a same-origin
 *   URL and treat a stripped, hostile `href` as a legitimate navigation;
 * - it force-adds `target="_blank"`, an attribute outside this sink's own `ALLOWED_ATTR`,
 *   and a hook-set attribute is never re-run through `_isValidAttribute`;
 * - its scheme test (`startsWith('http://')`) is case-sensitive, so a legitimate
 *   `HTTPS://example.com` link (uppercase scheme) silently loses its `href`;
 * - a separate `forceKeepAttr` hook bypasses attribute validation for a `src` on
 *   `IMG`/`SOURCE`/`VIDEO`/`AUDIO`/`STYLE`, but only when that `src` value starts with
 *   `blob:` — inert here only because none of those tags are in this sink's `ALLOWED_TAGS`,
 *   which is incidental rather than guaranteed by anything that ties the two configs together.
 *
 * This sink therefore gets its own DOMPurify instance via the package's callable factory
 * (`createDOMPurify(window)`), so its hook table starts empty and stays empty regardless of
 * what an unrelated module registers on the shared singleton.
 *
 * A second instance makes DOMPurify's internal `_createTrustedTypesPolicy` attempt to create
 * a second `dompurify` Trusted Types policy under the same name. Per the Trusted Types spec,
 * `createPolicy` only rejects a duplicate name when a `trusted-types` CSP directive is present
 * without `allow-duplicates` — and this repo sends no such directive (`index.html`'s CSP
 * `<meta>` is commented out, and `src-tauri/tauri.conf.json` has `"csp": null`), so the second
 * `createPolicy` call most likely succeeds silently rather than throwing. If it ever did throw
 * (e.g. under a future CSP that adds `trusted-types`), that throw happens inside DOMPurify's own
 * try/catch and is swallowed as a `console.warn`. Either way it cannot throw out to the caller,
 * and nothing enforces Trusted Types here today.
 */
const hubPurify = createDOMPurify(window)

/**
 * Sanitizes the raw HTML the RisuRealm hub feed supplies (the `additionalHTML`
 * field of characterCards.ts's `RisuHubResult`) before it reaches an `{@html}` sink.
 *
 * This uses an explicit allowlist (`ALLOWED_TAGS` / `ALLOWED_ATTR`) rather than
 * the denylist pattern in PluginDefinedIcon.svelte's `iconPurify`. A denylist
 * has to name every dangerous attribute in advance and still misses handler
 * attributes such as `onfocus` or `onanimationend`; an allowlist excludes all
 * of them by construction, because nothing not named here survives.
 *
 * The realm server's actual output has not been observed from this repo, so the tags and
 * attributes below are an assumption — prose plus a link — not a measurement:
 * - Tags: `p` and `br` for paragraphs/line breaks, `b`/`strong`/`i`/`em`/`u`
 *   for inline formatting, and `a` for the link itself.
 * - Attributes: only `href`, the one attribute the content needs to carry a
 *   link at all. No `style`, `class`, `target` or `rel` — nothing here reads
 *   them, so they would only be extra surface.
 * - `ALLOWED_URI_REGEXP` restricts every URI-bearing attribute (in practice,
 *   `href`) to `http:`/`https:`, so DOMPurify itself strips a `javascript:`
 *   or other scheme rather than relying on a hand-rolled check afterward.
 * If the real feed actually sends more structure than this (a `div`, `span`, a heading, a
 * list, an `img`, a `class`), this allowlist drops it silently — DOMPurify.sanitize has no
 * error path for a disallowed tag or attribute, it is simply removed. That would show up as
 * missing formatting or a missing image in the rendered card, not as a visible failure. This
 * function does not widen the allowlist on its own; doing so is a separate decision.
 */
export function sanitizeHubHtml(raw: string): string {
    return hubPurify.sanitize(raw, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a'],
        ALLOWED_ATTR: ['href'],
        ALLOWED_URI_REGEXP: /^https?:\/\//i
    })
}

/**
 * Delegated click handler for sanitized hub HTML. The allowlist above leaves
 * `a` as the only interactive element it can contain, so this walks up from
 * the click target to the nearest anchor and routes navigation through
 * `openURL` instead of letting the browser follow the link directly.
 *
 * The http/https restriction lives here, not inside `openURL`, on purpose:
 * sanitized hub HTML should only ever navigate to a web page, while
 * `openURL` is a general-purpose opener that also hands `mailto:`/`tel:`
 * links (see MainMenu.svelte's `relatedLinks`) off to the OS.
 *
 * A keyboard Enter press on a focused anchor dispatches a bubbling `click`
 * event, so this same delegated listener already covers keyboard activation
 * and no separate keydown handler is needed.
 */
export function handleHubHtmlClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    const anchor = target?.closest('a') ?? null
    if (!anchor) {
        return
    }

    event.preventDefault()

    let url: URL
    try {
        url = new URL(anchor.href)
    }
    catch {
        return
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
        openURL(anchor.href)
    }
}
