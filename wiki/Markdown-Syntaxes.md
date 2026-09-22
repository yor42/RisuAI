# Markdown Syntaxes

Chat text (messages, first message, example messages, etc.) is rendered with [markdown-it](https://github.com/markdown-it/markdown-it), then sanitized. Raw HTML is also allowed inside the same text — see [[HTML Syntaxes]] — and [[Curly Brased Syntaxes]] (`{{...}}`) are expanded *before* Markdown runs.
<!-- src/ts/parser/parser.svelte.ts:764-805 -->

Renderer options actually in use:

- `html: true` — inline HTML tags are preserved, not escaped.
- `breaks: true` — a single newline becomes `<br>` (you don't need a blank line to break a paragraph).
- `linkify: false` — bare URLs are **not** auto-linked. Use `[text](https://example.com)`.
- `typographer: true` — enables the smart-quote handling described below.
- The indented-code-block rule is disabled, so indenting a line by 4 spaces does **not** create a code block. Only fenced code blocks (below) work.
<!-- src/ts/parser/parser.svelte.ts:24-30,43-44 -->

## Basic syntax

```
*italic*        **bold**        ***bold italic***      ~~strikethrough~~
# Heading 1     ## Heading 2 ... ###### Heading 6
- list item
1. numbered item
> blockquote
---             (horizontal rule)
[link](https://example.com)
![alt text](https://example.com/image.png)
```

These come straight from markdown-it's default rule set (CommonMark + GFM), so anything not explicitly listed in this page (e.g. task-list checkboxes, footnotes) is **not** enabled: no such plugin is loaded.
<!-- src/ts/parser/parser.svelte.ts:1-2,24-44 -->

### Tables

GFM-style tables are supported out of the box:

```
| Name | Age |
|------|-----|
| Hana | 20  |
```
<!-- src/ts/parser/parser.svelte.ts:43-44 -->

## Code blocks

Only fenced code blocks are rendered as code — indented code is not:

````
```js
console.log("hello");
```
````

If a language is given after the opening fence, the block is syntax-highlighted with highlight.js. Recognized language tags (aliases in parentheses) are:
`bash`, `c`/`cpp`, `cs`/`csharp`, `css`, `dart`, `html`/`svg`/`xml`, `java`, `js`/`jsx`/`javascript`, `json`, `lua`, `markdown`/`md`, `py`/`python`, `rust`, `shell`, `ts`/`tsx`/`typescript`, `txt`/`vtt` (rendered as plain text), `yaml`.
Any other language tag falls back to an unhighlighted `<pre><code>` block.
<!-- src/ts/parser/parser.svelte.ts:206-397 -->

A special language tag, `risuerror`, renders the block as an in-chat error box instead of code. This is used internally to surface parser/rendering errors and isn't meant to be written by hand.
<!-- src/ts/parser/parser.svelte.ts:373-377,389-391 -->

Right-clicking a rendered code block gives a **Copy** / **Download** context menu (the file extension used for download matches the language tag).
<!-- src/ts/observer.svelte.ts:26-73 -->

## Smart quotes and dialogue coloring

Straight double quotes (`"..."`) and single quotes (`'...'`) are not left as-is: they are converted to typographic quotes and, by default, colored/marked to visually separate dialogue from narration (via `<mark risu-mark="quote1">` / `quote2`).
<!-- src/ts/parser/parser.svelte.ts:152-204; src/styles.css:281-289 -->

This is controlled by these display settings:
- **Custom Quotes** — lets you pick which quote glyphs are used instead of the default `“ ” ‘ ’`.
- **Disable Quote Formatting** — turns off the colorizing/marking and just outputs the chosen quote glyphs plain.
- **Blockquote Styling** — when enabled, a `"..."` that spans on its own turns into a highlighted, left-bordered block (like a blockquote) instead of inline-colored text; `'...'` still renders as inline-colored text.
<!-- src/ts/parser/parser.svelte.ts:181-201; src/lang/en.ts:1282,1307,1663 -->

## Math

`$$formula$$` renders inline LaTeX via [KaTeX](https://katex.org/), producing MathML output (not display/block mode — it stays inline in the paragraph). If the formula fails to parse, the raw `$$formula$$` text is left as-is instead of erroring.
<!-- src/ts/parser/parser.svelte.ts:157-178 -->

```
The area is $$\pi r^2$$.
```

## Legacy

- Raw HTML tags work directly inside chat text (see [[HTML Syntaxes]]); you don't need to escape `<` or `>`.
- `<user>`, `<char>`, and `<bot>` (as literal angle-bracket "tags") are not real HTML. They're rewritten to `{{user}}` / `{{char}}` / `{{bot}}` before Markdown even runs. See [[Curly Brased Syntaxes]].
<!-- src/ts/parser/parser.svelte.ts:1694 -->

## See also

- [[HTML Syntaxes]] — what raw HTML/CSS is allowed and how it's sanitized.
- [[Curly Brased Syntaxes]] — `{{...}}` macros, including the asset/image embedding functions that generate `<img>`/`<video>`/`<audio>` tags.
- [[@ Syntaxes]] — `@@`-prefixed prompt/regex decorators.
