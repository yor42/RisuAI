# HTML Syntaxes

Chat text is rendered with `html: true`, so raw HTML tags you type in a message, description, first message, etc. are kept and rendered as real elements, alongside [[Markdown Syntaxes]]. The result is then run through [DOMPurify](https://github.com/cure53/DOMPurify) before it's shown, which strips anything unsafe.
<!-- src/ts/parser/parser.svelte.ts:24-30,807-859 -->

```html
<div style="border:1px solid green;padding:2px">Hello World</div>
```

## What gets sanitized

DOMPurify runs with its normal safe default allow-list (so `<script>`, `on*` event-handler attributes, `javascript:` URLs, etc. are always removed) plus a small set of Risu-specific additions and hooks:
<!-- src/ts/parser/parser.svelte.ts:807-810 -->

- **Links (`href`)** — only `http://` and `https://` links are kept, and are forced to open in a new tab (`target="_blank"`). Any other scheme (e.g. `javascript:`, `data:`) has its `href` stripped entirely.
  <!-- src/ts/parser/parser.svelte.ts:102-109 -->
- **`<iframe>`** — allowed only if its `src` starts with `https://www.youtube.com/embed/`; any other iframe is removed outright. This is the only way to embed external content.
  <!-- src/ts/parser/parser.svelte.ts:46-52 -->
- **`class` attributes** — every class name you write is rewritten with an `x-risu-` prefix (e.g. `class="box"` becomes `class="x-risu-box"`), except highlight.js's own `hljs*` classes. This keeps card/message-authored classes from colliding with, or overriding, the app's own UI classes. Your own `<style>` rules (below) get the same prefix applied automatically, so this is transparent as long as you only style via a `<style>` block in the same message.
  <!-- src/ts/parser/parser.svelte.ts:88-101,969-987 -->
- **`blob:` sources** — `<img>`, `<source>`, `<video>`, `<audio>`, and `<style>` are allowed to keep a `blob:` URL as `src` (used for locally generated/inlaid assets); DOMPurify would otherwise be free to drop it.
  <!-- src/ts/parser/parser.svelte.ts:113-119 -->
- **Images** — if `loading`/`decoding` aren't already set, `<img>` gets `loading="lazy" decoding="async"` added automatically.
  <!-- src/ts/parser/parser.svelte.ts:65-72 -->
- **"Hide All Images" setting** — when enabled, `<img>` sources are swapped for a local placeholder (`/none.webp`) unless the src is the tiny built-in transparent GIF, and any inline `style` containing `background-image`/`background: url(...)` has that property stripped.
  <!-- src/ts/parser/parser.svelte.ts:53-63,76-87; src/lang/en.ts:283,1031 -->

Everything else follows the browser's normal safe HTML: standard tags like `<div>`, `<span>`, `<img>`, `<video>`, `<audio>`, `<details>`/`<summary>`, `<table>`, etc. are allowed; `<script>` and inline event handlers never survive.

## `<style>` blocks are automatically scoped

You can put a `<style>` tag directly in your message/description, and it is rewritten so it can only ever affect the chat text container, never the rest of the app:

```html
<style>.mybox { color: red; }</style>
<div class="mybox">hello</div>
```

becomes, roughly:

```html
<style>.chattext .x-risu-mybox{color:red}</style><div class="x-risu-mybox">hello</div>
```

Every selector is prefixed with `.chattext`, and every class inside it gets the same `x-risu-` prefix your element's `class` attribute gets. Your CSS still targets your own elements without needing to write the prefix yourself.
<!-- src/ts/parser/parser.svelte.ts:960-999; src/ts/parser/tests/trimMarkdownStyle.test.ts:71-75 -->

- `@media`, `@supports`, `@document`, `@host`, and `@container` blocks are scoped the same way, recursively.
  <!-- src/ts/parser/parser.svelte.ts:989-993 -->
- `@import url("data:...")` is neutralized (rewritten to an empty data URI) so a style block can't smuggle a data-URI import.
  <!-- src/ts/parser/parser.svelte.ts:994-998 -->
- CSS that fails to parse is dropped. Markup or `<style>`-closing text hidden inside a CSS string (e.g. `content: "</style><img onerror=...>"`) cannot re-enter the page as HTML; it stays inert text.
  <!-- src/ts/parser/parser.svelte.ts:807-859; src/ts/parser/tests/trimMarkdownStyle.test.ts:101-157 -->
- **"Return CSS Error" setting** — if your CSS fails to parse, enabling this shows `CSS ERROR: ...` in place of the style instead of silently dropping it (useful while debugging a card).
  <!-- src/ts/parser/parser.svelte.ts:1026-1031; src/lang/en.ts:1465 -->

## Risu-specific attributes

These are not standard HTML but are explicitly allowed through the sanitizer because the app listens for them:
<!-- src/ts/parser/parser.svelte.ts:809 -->

- **`risu-ctrl="bgm___<volume>___<url>"`** on any element plays/switches background music. `<volume>` is `auto` (defaults to 0.5) or a number; changing the URL swaps the currently playing track.
  <!-- src/ts/observer.svelte.ts:26,76-102 -->
- **`risu-trigger="<name>"`** (optionally with `risu-id="<id>"`) and **`risu-btn="<event>"`** turn any clickable element into a button that runs a manual [[Regex Script]]/trigger or a Lua button handler when clicked. The exact trigger/event names come from your character's trigger or Lua setup; see [[Regex Script]] for how those are defined.
  <!-- src/lib/ChatScreens/Chat.svelte:332-372 -->
- **`x-hl-lang`** marks a rendered code block with its language, enabling the right-click copy/download menu described in [[Markdown Syntaxes]]. You normally get this from a fenced code block, not by writing it by hand.
  <!-- src/ts/observer.svelte.ts:26-73 -->
- **`risu-mark="quote1"/"quote2"/"blockquote1"/"blockquote2"`** is added automatically by the smart-quote renderer (see [[Markdown Syntaxes]]) to color dialogue text; not meant to be authored directly.
  <!-- src/ts/parser/parser.svelte.ts:187-200; src/styles.css:281-303 -->

## Images, video, and audio

Standard `<img>`, `<video>`, and `<audio>` tags work directly. In practice, most image/video/audio/background embedding in cards is done through the `{{img::...}}` / `{{video::...}}` / `{{audio::...}}` / `{{bg::...}}` family of [[Curly Brased Syntaxes]], which resolve a character's uploaded asset name to a real `src` and emit the appropriate tag for you. See that page for the full list of asset functions.
<!-- src/ts/parser/parser.svelte.ts:408-609 -->

## Model "thinking"/tool tags (not authored HTML)

Two pseudo-tags are recognized in raw model output before Markdown/sanitization even runs, and are not meant to be typed by a user:

- `<Thoughts>...</Thoughts>` is converted into a collapsible `<details><summary>Chain of Thoughts</summary>...</details>` block.
  <!-- src/ts/parser/parser.svelte.ts:741-756; src/lang/en.ts:1091 -->
- `<tool_call>...</tool_call>` is converted into a small "Tool '&lt;name&gt;' Called" notice.
  <!-- src/ts/parser/parser.svelte.ts:759-761; src/lang/en.ts:1546 -->

## Where full HTML is not available

Some non-chat contexts render a deliberately restricted subset instead of the full pipeline above — e.g. chat export to HTML strips `<a>` and `<style>` entirely and drops `style`, `href`, and `class` attributes.
<!-- src/ts/parser/parser.svelte.ts:950-957; src/ts/characters.ts:219-220 -->

## See also

- [[Markdown Syntaxes]] — Markdown rendering, code blocks, quotes, math.
- [[Curly Brased Syntaxes]] — `{{...}}` macros, including asset/image embedding.
- [W3Schools HTML](https://www.w3schools.com/html/default.asp) and [MDN Web Docs](https://developer.mozilla.org/) for general HTML/CSS reference.
