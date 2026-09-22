# Curly Braced Syntaxes (CBS)

Curly Braced Syntaxes (CBS) are RisuAI's built-in templating language. They can appear in almost any text field that flows into a chat: character description/personality/scenario/example dialogue, the main prompt, jailbreak, global note, author's note, lorebook entries, regex script input/output, first messages, and chat messages themselves.

For example, if the main prompt contains `{{char}} is cute` and you are chatting with a character named "Hana", the app renders it as `Hana is cute`.

This page covers the basics, character/prompt accessors, and variables. See also:

- [[CBS-Blocks]] — `{{#when}}`/`{{#if}}`, `{{#each}}`, `{{#func}}`/`{{call}}`, `{{#pure}}`/`{{#puredisplay}}`, `{{#escape}}`, and the legacy `{# #}` block.
- [[CBS-Functions]] — comparisons, string/array/dictionary functions, math, random/dice, time/date formatting, system metadata, encoding helpers.
- [[CBS-Assets]] — displaying character assets, emotion images, inlays, and profile pictures.

To try CBS as you read, use the **Syntax** tool in the [[Playground]]. Its **CBS Doc** tool lists every tag with a short description.

## How CBS is evaluated

CBS is parsed by a single scanner that walks the text looking for `{{...}}` (and the block form `{{#...}}...{{/...}}`). The same parser runs whether the text is being shown on screen or sent to the model, but a few functions behave differently depending on which one is happening. For example, `{{comment}}` and `{{file}}` only produce visible markup when the text is being displayed. <!-- src/ts/parser/parser.svelte.ts:1602-1692; src/ts/cbs.ts:972-981,2130-2140 -->

CBS runs in, among other places:

- **Prompt assembly** — main prompt, jailbreak, global note, author's note, persona, description/personality/scenario/example dialogue, lorebook entries, and prompt-template blocks are all parsed as CBS while building the request to the model. `{{setvar}}`/`{{addvar}}`/`{{setdefaultvar}}` only actually write during this one pass, so a variable write embedded in, say, a lorebook entry that gets evaluated multiple times for other reasons doesn't fire repeatedly. <!-- src/ts/process/index.svelte.ts:147,446-1502 -->
- **Chat display** — character messages are re-parsed for display so CBS output reflects the latest variable state even for older messages. <!-- src/ts/parser/parser.svelte.ts:764-805; src/ts/process/scripts.ts:99-133 -->
- **Regex scripts (lorebook and elsewhere)** — the text a regex script operates on is always parsed as CBS first; a script's own pattern is only parsed as CBS first if the script has the `<cbs>` flag (or `cbs` action) set, and the text is parsed again after a match is replaced. See [[Regex-Script]] for details. <!-- src/ts/process/scripts.ts:71-79,133,176-179,248 -->
- **Triggers, translator input, the chat variable tokenizer estimate, exported example messages, and slash commands** also all run through CBS. <!-- src/ts/process/triggers.ts; src/ts/translator/translator.ts:713; src/ts/tokenizer.ts:403; src/ts/process/exampleMessages.ts:61; src/ts/process/command.ts:52-58 -->

Nested CBS calls (e.g. `{{call::...}}` invoking another parsing pass, or a function like `{{personality}}` re-parsing character text) share a call-stack counter. Past a depth of 20, the parser returns the literal string `ERROR: Call stack limit reached` instead of recursing further. <!-- src/ts/parser/parser.svelte.ts:1667-1671,1816-1834 -->

## Syntax rules

- **Function name matching is forgiving.** Whitespace, underscores, and hyphens are stripped and the name is lowercased before lookup, so `{{not_equal}}`, `{{NotEqual}}`, and `{{not-equal}}` all resolve to the same function. This is why many functions have aliases that only differ by punctuation. <!-- src/ts/parser/parser.svelte.ts:1119 -->
- **Argument separator.** Arguments are normally separated by `::`. The parser checks the first colon in the tag: if the character right after it is also a colon, the whole tag is split on `::`; otherwise it's split on single `:`. In practice, stick to `::` consistently. Mixing `:` and `::` in the same tag does not work the way you'd expect. <!-- src/ts/parser/parser.svelte.ts:1111-1120 -->
- **`{{? expression}}`** is a special case recognized before the colon-splitting rule above: it requires a literal space after `?` and evaluates as a math expression (identical evaluator to `{{calc}}` — see [[CBS-Functions]]). <!-- src/ts/parser/parser.svelte.ts:1107-1110 -->
- **Unresolved tags are left alone.** If `{{something}}` doesn't match any registered function (and isn't a recognized block), the literal text `{{something}}` is kept in the output rather than being deleted or erroring. <!-- src/ts/parser/parser.svelte.ts:1835-1838 -->
- **`<char>`, `<user>`, `<bot>`** are rewritten to `{{char}}`/`{{user}}`/`{{bot}}` before parsing, so the old angle-bracket syntax still works, though it's discouraged. See [[HTML-Syntaxes]] for why bare angle brackets are otherwise risky in this context. <!-- src/ts/parser/parser.svelte.ts:1694 -->
- **Nesting depth.** You can nest CBS freely, e.g. `{{calc::9 + {{getvar::a}} + 1}}`. The scanner supports up to 512 nesting levels, far more than any real template needs. Nesting far beyond normal use is not supported — unlike the 20-level call-stack limit above, which produces a clear `ERROR:` string. <!-- src/ts/parser/parser.svelte.ts:1648,1667-1671 -->

## Escaping literal braces, parentheses, and colons

Because `{`, `}`, `(`, `)`, `<`, `>`, `:`, and `;` all have syntactic meaning somewhere in CBS/HTML rendering, dedicated functions produce them as inert placeholder characters (from the Unicode Private Use Area) that survive further CBS parsing and are converted to the real character only when the final text is unescaped for display or for the model request:

| You want | Use |
|---|---|
| `{` | `{{decbo}}` |
| `}` | `{{decbc}}` |
| `{{` | `{{bo}}` |
| `}}` | `{{bc}}` |
| `(` | `{{displayescapedbracketopen}}` / `{{debo}}` / `{{(}}` |
| `)` | `{{displayescapedbracketclose}}` / `{{debc}}` / `{{)}}` |
| `<` | `{{displayescapedanglebracketopen}}` / `{{deabo}}` / `{{<}}` (renders as `&lt;`) |
| `>` | `{{displayescapedanglebracketclose}}` / `{{deabc}}` / `{{>}}` (renders as `&gt;`) |
| `:` | `{{displayescapedcolon}}` / `{{dec}}` / `{{:}}` |
| `;` | `{{displayescapedsemicolon}}` / `{{;}}` |
| a literal newline | `{{br}}` / `{{newline}}` |
| a literal `\n` (backslash-n text, not an actual newline) | `{{cbr}}` / `{{cnl}}` / `{{cnewline}}` (`{{cbr::3}}` does not repeat — it behaves the same as `{{cbr}}` with no argument) |

<!-- src/ts/cbs.ts:1385-1486; src/ts/parser/parser.svelte.ts:122-150; src/ts/parser/tests/cbs/escapes.test.ts:81-108 -->

For escaping a whole block of text at once, use the `{{#escape}}...{{/escape}}` block (see [[CBS-Blocks]]) instead of individual escape functions. The placeholders are converted back to real characters wherever RisuAI does its final unescape pass — this happens both when rendering chat markdown for display and when assembling the final message content for the model request, so escaped text is safe to nest inside further CBS without being re-interpreted. <!-- src/ts/parser/parser.svelte.ts:133-150,179; src/ts/process/request/request.ts:218 -->

## Basics

| Syntax | Aliases | Output |
|---|---|---|
| `{{char}}` | `bot` | Current character's nickname (or name); the group name for group chats; `"botname"` in consistent-character/estimation mode |
| `{{user}}` | — | User's display name (`"username"` in consistent-character mode) |
| `{{personality}}` | `charpersona` | Character's personality field, itself CBS-parsed |
| `{{description}}` | `chardesc` | Character's description field, itself CBS-parsed |
| `{{scenario}}` | — | Character's scenario field, itself CBS-parsed |
| `{{exampledialogue}}` | `examplemessage`, `example_dialogue` | Character's example dialogue, itself CBS-parsed |
| `{{persona}}` | `userpersona` | Active user persona prompt, itself CBS-parsed |
| `{{mainprompt}}` | `systemprompt`, `main_prompt` | Main system prompt, itself CBS-parsed |
| `{{jb}}` | `jailbreak` | Jailbreak prompt, itself CBS-parsed |
| `{{globalnote}}` | `systemnote`, `ujb` | Global note/UJB, itself CBS-parsed |
| `{{authornote}}` | `author_note` | Current chat's author's note, falling back to the prompt template's default author's note text |
| `{{blank}}` | `none` | Empty string |
| `{{lorebook}}` | `worldinfo` | JSON array of every currently-active lorebook entry (character + chat + module lorebooks), each entry JSON-stringified |
| `{{history}}` | `messages` | JSON array of the full chat history including the greeting, each message CBS-parsed |
| `{{history::role}}` | — | Chat history as a plain-text array, each line prefixed with `role: ` |
| `{{userhistory}}` | `usermessages`, `user_history` | JSON array of only the user's messages, each CBS-parsed |
| `{{charhistory}}` | `charmessages`, `char_history` | JSON array of only the character's messages, each CBS-parsed |
| `{{previouscharchat}}` | `lastcharmessage` | Nearest earlier character message (falls back to the first message/greeting) |
| `{{previoususerchat}}` | `lastusermessage` | Nearest earlier user message (empty string outside a chat-message context) |

<!-- src/ts/cbs.ts:146-170,172-182,194-211,213-234,237-250,252-265,267-280,282-295,298-305,307-315,317-334,336-352,354-370,372-380,382-390,392-413,436-443,1512-1543 -->

See [[CBS-Functions]] for the many more chat/message/system accessors (`{{chatindex}}`, `{{role}}`, `{{model}}`, `{{maxcontext}}`, time/date functions, etc.), and [[CBS-Assets]] for anything that displays an image, video, or audio.

## Variables

CBS has three kinds of variables, all read/written as plain strings:

### Chat variables — `{{getvar}}` / `{{setvar}}` / `{{addvar}}` / `{{setdefaultvar}}`

Stored per-chat, so they persist with that specific conversation across sessions. `{{getvar::name}}` returns `"null"` (the string) if the variable was never set — unless the character or a preset defines a default value for that name, in which case the default is returned instead. Because chat variables don't re-render older messages automatically, editing the value a prompt reads from a variable may not visibly change already-generated text until the next generation. <!-- src/ts/parser/chatVar.svelte.ts:6-40; src/ts/cbs.ts:792-859 -->

Writes (`{{setvar}}`, `{{addvar}}`, `{{setdefaultvar}}`) only take effect while the app is building the outgoing prompt for a generation. Everywhere else (display re-render, etc.) these three are silent no-ops, so a variable-writing tag doesn't fire every time the surrounding text happens to be re-parsed. `{{addvar}}` coerces both sides with `Number(...)`, so adding to a non-numeric variable produces `NaN`. <!-- src/ts/cbs.ts:810-859; src/ts/process/index.svelte.ts:147 -->

### Global chat variables — `{{getglobalvar}}` / used via triggers' "set global var" effects

Shared across every character/chat by default. RisuAI also supports **per-chat overrides** of a global variable name, used when a chat has the **Local Toggles** option enabled — in that mode, reading/writing a "global" variable actually reads/writes a copy scoped to that one chat instead of the shared value. Plain `{{getglobalvar::name}}` transparently prefers the chat-local override if one exists, falling back to the shared value. <!-- src/ts/parser/chatVar.svelte.ts:42-87; src/ts/cbs.ts:861-868 -->

### Temp variables — `{{tempvar}}` / `{{settempvar}}`

Exist only for the duration of one CBS parsing run (and any recursive calls it makes, e.g. via `{{call::}}`); never persisted. Useful for intermediate values inside a `{{#func}}`. `{{return::value}}` immediately ends the current parser run and yields `value` as the whole result of that run — anything else queued in the same run is discarded. <!-- src/ts/cbs.ts:753-790; src/ts/parser/parser.svelte.ts:1661-1665,1835-1848 -->

### Math-expression variable shortcuts

Inside `{{calc::...}}` / `{{? ...}}` expressions specifically (not general CBS text), `$name` reads chat variable `name` as a number and `@name` reads global chat variable `name` as a number; non-numeric values are treated as `0`. See [[CBS-Functions]] for the full expression syntax.

## Legacy syntax

These still work for backward compatibility with older character cards, but new content should avoid them:

| Legacy form | Use instead |
|---|---|
| `{#if <a>` on its own line, block ending in `#}` | `{{#when a}}...{{/when}}` — see [[CBS-Blocks]] for the exact (different!) truthiness rule this legacy form uses |
| `{{#if condition}}...{{/if}}` | `{{#when condition}}...{{/when}}` |
| `{{#if_pure condition}}...{{/if_pure}}` | `{{#when::keep::condition}}...{{/when}}` |
| `{{#pure}}...{{/pure}}` | `{{#puredisplay}}...{{/puredisplay}}` |
| `<char>`, `<user>`, `<bot>` | `{{char}}`, `{{user}}`, `{{bot}}` |
| `{{dice::XdY}}` | `{{roll::XdY}}` (identical behavior; `roll` is the actively maintained name and also has a deterministic sibling `{{rollp}}`) |

<!-- src/ts/cbs.ts:2381-2401,2450-2459; src/ts/parser/parser.svelte.ts:1161-1183 -->
