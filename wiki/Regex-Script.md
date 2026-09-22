# Regex Script

A Regex Script rewrites text at a specific point in the message pipeline: it matches a JavaScript regular expression against a string and replaces the match with an OUT template, which may itself contain [[Curly Brased Syntaxes]] and special `@@` directives.
<!-- src/ts/process/scripts.ts:99 -->

## Where scripts live, and processing order

Scripts can be defined in three scopes, and all three are combined and run together, in this order, for every mode except `edittrans`:

1. **Preset scripts** — edited under Settings → the "Preset" page's **Regex Script** accordion. These are saved and loaded as part of the active connection **Preset** and exported/imported with it, so they apply to every character while that preset is loaded, not to a single character.
   <!-- src/ts/process/scripts.ts:134; src/lib/Setting/Pages/BotSettings.svelte:787-789; src/ts/storage/database.svelte.ts:2108,2233 -->
2. **Character scripts** — edited in the character's own config panel.
   <!-- src/lib/SideBars/CharConfig.svelte:689 -->
3. **Module scripts** — on every currently enabled [[module|Modules]], concatenated in module order.
   <!-- src/ts/process/modules.ts:476-488 -->

For `edittrans` scripts only, the order is preset → module → character instead.
<!-- src/ts/translator/translator.ts:649 -->

> Note: Settings also has a separate **"Global Regex"** page. Despite the name, that list is not applied to any message; it is only a save slot used by that page's own Import/Export buttons. If you want a script to run everywhere, put it in the Preset's Regex Script list, not "Global Regex".
> <!-- src/lib/Setting/Pages/GlobalRegex.svelte:7-28 -->

Within one scope, scripts run in list order top-to-bottom unless reordered with `<order N>` (see below).

## Modification types

Set per-script via the "Modification Type" dropdown. Each is a distinct point in the pipeline:
<!-- src/lib/SideBars/Scripts/RegexData.svelte:119-124 -->

| Type (saved value) | UI label | Runs on | When |
|---|---|---|---|
| `editinput` | Modify Input | The text you type, before it is stored as a chat message | When you send a message |
| `editoutput` | Modify Output | The AI's streamed or generated reply, before it is stored as a chat message | After generation |
| `editprocess` | Modify Request Data | Each message's text as it's assembled into the outgoing request, and the character's first message/greeting used for token counting | While building the prompt |
| `editdisplay` | Modify Display | Stored message text only when rendered on screen; never written back to chat data | When the message is displayed |
| `edittrans` | Edit Translation Display | Text after auto-translation, before it is shown | After translation, via a separate, lighter engine (see below) |
| `disabled` | Disabled | Never; matches no mode, effectively turning the script off without deleting it | — |

<!-- editinput: src/lib/ChatScreens/DefaultChatScreen.svelte:269; editoutput: src/ts/process/index.svelte.ts:1670; editprocess: src/ts/process/index.svelte.ts:886-917; editdisplay: src/ts/parser/parser.svelte.ts:783; edittrans: src/ts/translator/translator.ts:639-760 -->

[[Lua edit triggers|Lua Scripting]] (`editInput`/`editOutput`/`editDisplay` callbacks) run before the regex list, for `editinput`, `editoutput`, and `editdisplay`. `editprocess` skips this step entirely.
<!-- src/ts/process/scriptings.ts:1409-1422; src/ts/process/scripts.ts:102 -->

`editdisplay` additionally runs a "display" [[Trigger Script]] hook (non-group characters only), then any plugin hook registered for that mode, then a CBS (`{{...}}`) parsing pass, before the regex list itself runs.
<!-- src/ts/process/scripts.ts:104-133 -->

### `edittrans` uses a separate, lighter engine

`edittrans` scripts run through a separate, lighter engine instead of the main script pipeline. It supports the same flag/action syntax (`<order N>`, `<cbs>`, `<move_top>`, `<move_bottom>`) but not `@@emo`, `@@inject`, or `@@repeat_back`.
<!-- src/ts/translator/translator.ts:632-760 -->

## Flags

The Flag field is a normal JS regex flag string, restricted to `d g i m s u v y`. Unsupported characters are silently stripped, and duplicates are collapsed.
<!-- src/ts/process/scripts.ts:166-174 -->

- If **Custom Flag** is off, the effective flags are always `g`.
- If it's on but the flag field ends up empty after all directive tokens are removed, it falls back to `u`, not `g`.
  <!-- src/ts/process/scripts.ts:172-174 -->

The Flags editor also has toggle buttons for `g i m u s`, plus custom bracket directives (below).
<!-- src/lib/SideBars/Scripts/RegexData.svelte:65-79 -->

### `<...>` bracket directives (Flag field)

Any `<...>` token in the Flag field is parsed out before the string is used as regex flags, and turned into either an ordering rule or an action:
<!-- src/ts/process/scripts.ts:296-330 -->

- `<order N>` — sets execution order. When any script in the whole combined list uses `<order>`, all scripts are re-sorted by order, highest first, before any of them run (scripts without `<order>` default to order `0`).
  <!-- src/ts/process/scripts.ts:298-334 -->
- `<cbs>` — evaluates the IN pattern itself through the CBS parser (`{{...}}` macros) before compiling the regex, so the pattern can depend on character/chat data. Without it, IN is used as a literal regex source.
  <!-- src/ts/process/scripts.ts:176-179 -->
- `<no_end_nl>` — suppresses the automatic trailing newline described below.
- `<move_top>`, `<move_bottom>`, `<repeat_back>` — alternate way to trigger the same-named `@@` directives (see next section) without needing the `@@...` prefix in OUT.
- `<inject>` — undocumented in the UI, but recognized identically to typing `@@inject` in OUT.
  <!-- src/ts/process/scripts.ts:207 -->
- Any other bracket text is still stripped from the flags but has no built-in effect (harmless custom marker).

Multiple directives can be combined in one flag string, comma- or space-separated inside the brackets, e.g. `flag: "gi<order 5><cbs>"`.

### Automatic trailing newline

If OUT ends with `>` (e.g. a closing HTML tag) the engine appends a newline automatically, unless `<no_end_nl>` is set.
<!-- src/ts/process/scripts.ts:163-165 -->

## Replacement syntax

OUT is passed through `$n` → literal newline substitution first, then used as the replacement.
<!-- src/ts/process/scripts.ts:154 -->

- Standard ECMAScript replacement patterns work: `$&` (whole match), `$1`.."$9" (capture groups), `` $` ``/`$'` (before/after), `` $<name> `` (named group). These all work natively for a normal (non-`@@`) replacement.
  <!-- src/ts/process/scripts.ts:248,291 -->
- After a normal replacement, the entire result is re-parsed by CBS again, so OUT can safely contain `{{...}}` macros.
  <!-- src/ts/process/scripts.ts:248,291 -->
- Inside `@@move_top`/`@@move_bottom` output (see below), group substitution is reimplemented separately and only supports `$0..$9` and `$&`. `$<name>` for named groups does not currently work: it does not match against the actual named group, so named-group references are left as literal text in move directives. This holds for both the main script engine and the edittrans engine.
  <!-- src/ts/process/scripts.ts:231-237; src/ts/translator/translator.ts:736-742 -->

## `@@` output directives

If OUT starts with `@@`, or the script has any bracket action (above), the script enters "directive mode": the regex is tested against the current text first, and only a recognized directive (or a plain fallback) runs.
<!-- src/ts/process/scripts.ts:182 -->

| Directive | Syntax | Effect |
|---|---|---|
| `@@emo <name>` | OUT starts with `@@emo ` (no flag equivalent) | If IN matches, adds `<name>` to that character's recent emotion images (must exist among the character's configured emotion images), kept as a stack of up to 5, used by the emotion/sprite view. No-op for preview characters. <!-- src/ts/process/scripts.ts:184-206 --> |
| `@@inject` | OUT starts with `@@inject`, or `<inject>` flag | If IN matches and the script is running on an actual chat message, saves the current (pre-strip) text back into the chat log at that message's position, then removes the matched text from what's returned or displayed. Because it always targets the currently selected character, it has no effect for group members or preview characters. <!-- src/ts/process/scripts.ts:207-211 --> |
| `@@move_top <text>` | OUT starts with `@@move_top`, or `<move_top>` flag | Removes the matched text from its original position, then re-inserts the replacement text at the very top. Only the first match moves — see the callout below. |
| `@@move_bottom <text>` | OUT starts with `@@move_bottom`, or `<move_bottom>` flag | Same as above but appends at the bottom. |
| `@@repeat_back[ end\|start\|end_nl\|start_nl]` | OUT starts with `@@repeat_back`, or `<repeat_back>` flag | Only runs when IN does not match the current text. Walks backward through chat history to the nearest earlier message with the same role (falling back to the active greeting text if none found), matches IN against that text, and copies the match into the current text: appended (default/`end`), prepended (`start`), or with a newline separator (`end_nl`/`start_nl`). Requires the script to be running on an actual chat message. If that earlier text does not match IN, the script throws a TypeError instead of skipping cleanly; the error is caught and logged to the console by the script runner, and the chat text is left unchanged. <!-- src/ts/process/scripts.ts:266-286,335-341 --> |
| any other `@@...` text | — | Not a recognized prefix and reaches no directive branch, so it is used as a literal replacement (same as a normal, non-`@@` OUT), including the CBS re-parse pass. |

**Global flag is ignored for move directives.** Even with the Global (`g`) flag checked, `@@move_top`/`@@move_bottom` drop the `g` flag before matching, so only the first match is ever moved, never all matches. This is true in both the main script engine and the edittrans engine.
<!-- src/ts/process/scripts.ts:160-162,216-217; src/ts/translator/translator.ts:686-688,719-720 -->

## Caching

Results are cached per combination of the active scripts, the input text, the modification type, the chat, and the current CBS state, up to 1000 entries with the oldest evicted first. This means repeated renders of the same text skip re-running every script.
<!-- src/ts/process/scripts.ts:68-97 -->

## Related, adjacent feature: Dynamic Assets

The same pipeline also runs a fuzzy-match pass over `{{asset-type::name}}`-style tags in the text against the character's/module's asset names (Dynamic Assets), but only for `editoutput` unconditionally, and for `editdisplay` only if the "Dynamic Assets on Display" setting is on. It never runs for `editinput`/`editprocess`. This is a separate feature layered into the same pipeline, not a Regex Script directive — see [[HTML Syntaxes]] / [[@ Syntaxes]] for the asset tag syntax itself.
<!-- src/ts/process/scripts.ts:345-382 -->

## Legacy

- Import/Export of a script list produces `{"type":"regex","data":[...]}` JSON; importing merges into the target list rather than replacing it.
  <!-- src/ts/process/scripts.ts:30-66 -->

## Worked examples

**Hide a status block, show HTML instead (Modify Display):**
- IN: `\[status\]`
- OUT: `<div class="status-box">{{getvar::hp}}/100 HP</div>`
- Type: Modify Display, Flag: default (`g`).
- The AI is instructed (in its prompt) to output the literal text `[status]`; this never touches chat storage, so the raw response stays cheap in tokens while the display shows rendered HTML. See [[HTML Syntaxes]] for what's allowed inside OUT.

**Strip a scratchpad the model must not repeat, but still keep it saved (Modify Output, `@@inject`):**
- IN: `<scratchpad>[\s\S]*?<\/scratchpad>`
- OUT: `@@inject`
- Type: Modify Output.
- The full text (including the scratchpad) is written into the stored message, but the scratchpad is stripped from what continues through the pipeline/display for that turn.

**Move an out-of-band author's note to the end of the reply (Modify Output):**
- IN: `\(OOC:.*?\)`
- OUT: `@@move_top $&`
- Type: Modify Output, flag `<order 10>` if you need it to run before other scripts.
