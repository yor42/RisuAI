# CBS: Function Reference

Part of [[Curly-Brased-Syntaxes]]. This page lists every general-purpose CBS function that is not a [[block|CBS Blocks]] and not an [[asset/media|CBS Assets]] function. Unless noted otherwise, arguments are separated by `::` and every function returns a plain string (booleans are the strings `"1"`/`"0"`).

Function names are matched case-insensitively with spaces, underscores and hyphens stripped, so `{{not_equal}}`, `{{NotEqual}}` and `{{not equal}}` all call the same function. <!-- src/ts/parser/parser.svelte.ts:1119 -->

## Comparison and logic

| Syntax | Aliases | Result |
|---|---|---|
| `{{equal::a::b}}` | — | `1` if `a === b` (string comparison), else `0` |
| `{{notequal::a::b}}` | `not_equal` | `1` if `a !== b` |
| `{{greater::a::b}}` | — | `1` if `Number(a) > Number(b)` |
| `{{less::a::b}}` | — | `1` if `Number(a) < Number(b)` |
| `{{greaterequal::a::b}}` | `greater_equal` | `1` if `Number(a) >= Number(b)` |
| `{{lessequal::a::b}}` | `less_equal` | `1` if `Number(a) <= Number(b)` |
| `{{and::a::b}}` | — | `1` only if both `a` and `b` are exactly `"1"` |
| `{{or::a::b}}` | — | `1` if either `a` or `b` is exactly `"1"` |
| `{{not::a}}` | — | `0` if `a` is `"1"`, else `1` |
| `{{iserror::a}}` | — | `1` if `a` starts with `error:` (case-insensitive) |

<!-- src/ts/cbs.ts:890-897,899-906,908-915,917-924,926-933,935-942,944-951,953-960,962-969,1938-1945 -->

`and`/`or`/`not` here are strict two-value string comparisons against `"1"`, unlike the operator chain inside `{{#when}}` (see [[CBS-Blocks]]), which is more forgiving about truthy values (`"1"` or `"true"`).

## Strings

| Syntax | Aliases | Result |
|---|---|---|
| `{{startswith::str::sub}}` | — | `1`/`0`, case-sensitive |
| `{{endswith::str::sub}}` | — | `1`/`0`, case-sensitive |
| `{{contains::str::sub}}` | — | `1`/`0`, case-sensitive |
| `{{replace::str::search::replacement}}` | — | All occurrences of `search` replaced |
| `{{split::str::delimiter}}` | — | JSON array of the pieces |
| `{{join::jsonArray::sep}}` | — | Joins a JSON array into one string |
| `{{spread::jsonArray}}` | — | Joins a JSON array with `::` (handy for feeding another CBS function's argument list) |
| `{{trim::str}}` | — | Removes leading/trailing whitespace only |
| `{{length::str}}` | — | String length |
| `{{lower::str}}` | — | Locale-aware lowercase |
| `{{upper::str}}` | — | Locale-aware uppercase |
| `{{capitalize::str}}` | — | Uppercases only the first character |
| `{{reverse::str}}` | — | Reverses by Unicode code point (`[...str].reverse()`), not by grapheme cluster. A single-code-point emoji survives; a multi-code-point cluster (e.g. a ZWJ family emoji, or a base character plus combining marks) comes out visually broken, because nothing special-cases grapheme clusters. Card authors use it to lightly obfuscate spoilers in a description; applying it again restores the text (code point by code point). For something less readable at a glance, see `{{xor}}` (XOR + base64, reversed by `{{xordecrypt}}`) or `{{crypt}}`. None of these is encryption. |
| `{{unicodeencode::str[::index]}}` | `unicode_encode` | Char code (decimal) of the character at `index` (default `0`) |
| `{{unicodedecode::code}}` | `unicode_decode` | Character for a decimal char code |
| `{{u::hex}}` | `unicodedecodefromhex` | Character for a **hex** char code |
| `{{ue::hex}}` | `unicodeencodefromhex` | Same as `{{u}}` (the name is misleading — it also decodes) |
| `{{tonumber::str}}` | — | Strips everything except digits `0-9` and `.` |

<!-- src/ts/cbs.ts:984-991,993-1000,1002-1009,1011-1018,1020-1027,1029-1036,1038-1045,1047-1054,1056-1063,1075-1082,1084-1091,1093-1100,1159-1168,1768-1775,1777-1784,1786-1793,1795-1802,2121-2128; src/ts/parser/tests/cbs/strings.test.ts:155-168 -->

## Math

| Syntax | Aliases | Result |
|---|---|---|
| `{{calc::expression}}` | — | Evaluates a math expression, see **Calc expressions** below |
| `{{? expression}}` | — | Same evaluator as `{{calc}}`, but written with a literal space instead of `::` (must be `{{? ` with the space) |
| `{{round::n}}` | — | Rounds to the nearest integer |
| `{{floor::n}}` | — | Rounds down |
| `{{ceil::n}}` | — | Rounds up |
| `{{abs::n}}` | — | Absolute value |
| `{{remaind::a::b}}` | — | `a % b` |
| `{{pow::base::exp}}` | — | `base ** exp` |
| `{{fixnum::n::digits}}` | `fixnumber` | `n` fixed to `digits` decimal places |
| `{{min::a::b::...}}` or `{{min::jsonArray}}` | — | Smallest value; non-numeric items count as `0` |
| `{{max::a::b::...}}` or `{{max::jsonArray}}` | — | Largest value; non-numeric items count as `0` |
| `{{sum::a::b::...}}` or `{{sum::jsonArray}}` | — | Sum of all values |
| `{{average::a::b::...}}` or `{{average::jsonArray}}` | — | Arithmetic mean |
| `{{fromhex::hex}}` | — | Hex string → decimal number |
| `{{tohex::n}}` | — | Decimal number → hex string |

<!-- src/ts/cbs.ts:801-808,1102-1109,1111-1118,1120-1127,1129-1136,1138-1145,1170-1177,1694-1708,1710-1724,1726-1740,1742-1757,1759-1766,1846-1853,1855-1862,2265-2270; src/ts/parser/parser.svelte.ts:1107-1110 -->

For `min`/`max`/`sum`/`average`: if more than one argument is given, all arguments are treated as the value list; if exactly one argument is given, it is parsed as a JSON array instead.

### Calc expressions (`{{calc}}` / `{{? }}`)

The expression evaluator (shared by `{{calc}}`, `{{? }}`) supports, in this precedence order (low to high): `<` `>` `|` (or) `&` (and) `<=` `>=` `==` `!=`, then `+` `-`, then `*` `/` `%`, then `^` (power), then unary `!` (not). Parentheses `()` group sub-expressions and are evaluated first. `null` (case-insensitive) is treated as `0`. Comparison/boolean operators produce `1`/`0`. A bare `$name` reads chat variable `name` as a number (`0` if not numeric); `@name` reads a global chat variable the same way. <!-- src/ts/process/infunctions.ts:1-160 -->

```
{{calc::2+2*3}}        → 8
{{calc::(2+2)*3}}      → 12
{{calc::$hp <= 0}}     → 1 if chat var "hp" is 0 or less
{{? 10 % 3}}           → 1
```

## Random, dice, and hashing

| Syntax | Aliases | Result |
|---|---|---|
| `{{random}}` | — | Random float `0`–`1` |
| `{{random::a,b,c}}` | — | Random element. A single argument is first tried as a JSON array (`[...]`); otherwise it is split on `,` and `:` (use `\,` to escape a literal comma) |
| `{{random::a::b::c}}` | — | With 2+ arguments, picks one of the arguments themselves at random |
| `{{pick}}` / `{{pick::a,b,c}}` | — | Same argument handling as `{{random}}`, but deterministic: the "random" value is a hash of the chat's message count and character/chat id, so the same message position always picks the same element |
| `{{randint::min::max}}` | — | Random integer, inclusive of both ends; `"NaN"` if either bound isn't a number |
| `{{roll::XdY}}` | — | Sum of rolling `X` `Y`-sided dice (default `1d6` if no argument) |
| `{{rollp::XdY}}` | `rollpick` | Same as `{{roll}}` but deterministic (hash-based, like `{{pick}}`) |
| `{{dice::XdY}}` | — | Same computation as `{{roll}}` (kept as a separate, older function) |
| `{{hash::str}}` | — | Deterministic 7-digit number derived from the string |

<!-- src/ts/cbs.ts:1804-1811,1813-1825,1827-1844,2004-2023,2004-2032,2016-2023,2034-2046,2048-2075,2077-2110 -->

## Time and date

| Syntax | Aliases | Result |
|---|---|---|
| `{{time}}` | — | Current local time as `H:M:S` (not zero-padded) |
| `{{time::format}}` / `{{time::format::unixtimeMs}}` | — | Formats a custom pattern (see below); with a second argument, formats that Unix time in **milliseconds** instead of now |
| `{{date}}` | — | Current local date as `YYYY-M-D` (not zero-padded) |
| `{{date::format}}` / `{{date::format::unixtimeMs}}` | `datetimeformat` | Same custom formatting as `{{time::format}}` |
| `{{isotime}}` | — | Current UTC time as `H:M:S` |
| `{{isodate}}` | — | Current UTC date as `YYYY-M-D` |
| `{{unixtime}}` | — | Current Unix time in **seconds** |
| `{{messagetime}}` | `message_time` | Local time the current message was sent, or an explanatory `[Cannot get time...]` string for old/tokenization contexts |
| `{{messagedate}}` | `message_date` | Local date the current message was sent (same fallbacks as above) |
| `{{messageunixtimearray}}` | `message_unixtime_array` | JSON array of every message's Unix time in **milliseconds** (`0` if missing) |
| `{{idleduration}}` | `idle_duration` | `H:MM:SS` since the chat's last message |
| `{{messageidleduration}}` | `message_idle_duration` | `H:MM:SS` between the current and the previous **user** message |

<!-- src/ts/cbs.ts:445-467,469-490,492-504,506-514,526-534,536-544,547-602,604-639,1564-1584,1586-1606 -->

### Custom format tokens (`{{date::...}}` / `{{time::...}}`)

`YYYY` `YY` `MMMM` `MMM` `MM` `DDDD` (day of year) `DD` `dddd` `ddd` `HH` (24h) `hh` (12h) `mm` `ss` `X` (Unix seconds) `x` (Unix ms) `A` (AM/PM). A leading `:` in the format string is stripped; format strings longer than 300 characters return an empty string. <!-- src/ts/parser/parser.svelte.ts:1130-1159 -->

## Arrays and dictionaries

Arrays and dictionaries are plain JSON text (`["a","b"]`, `{"k":"v"}`); invalid JSON parses to `[]`/`{}`. <!-- src/ts/cbs.ts:16-23 -->

| Syntax | Aliases | Result |
|---|---|---|
| `{{makearray::a::b::c}}` | `array`, `a`, `makearray` | Builds `["a","b","c"]` from the arguments |
| `{{makedict::k1=v1::k2=v2}}` | `dict`, `d`, `makeobject`, `object`, `o` | Builds `{"k1":"v1","k2":"v2"}`; an argument with no `=` is skipped |
| `{{arraylength::jsonArray}}` | — | Element count |
| `{{arrayelement::jsonArray::i}}` | — | Element at index `i` (0-based); `"null"` if out of range; objects are re-serialized to JSON |
| `{{dictelement::jsonObject::key}}` | `objectelement` | Value at `key`; `"null"` if missing |
| `{{element::json::key1::key2::...}}` | `ele` | Walks nested keys/indices one at a time; `"null"` on any failure (missing key, non-object) |
| `{{objectassert::jsonObject::key::value}}` | `dictassert`, `object_assert` | Sets `key` only if it is currently falsy; returns the whole object |
| `{{arrayshift::jsonArray}}` | — | Removes the first element, returns the rest |
| `{{arraypop::jsonArray}}` | — | Removes the last element, returns the rest |
| `{{arraypush::jsonArray::value}}` | — | Appends `value`, returns the whole array |
| `{{arraysplice::jsonArray::start::deleteCount::value}}` | — | Splices in `value` at `start`, removing `deleteCount` elements first, returns the whole array |
| `{{arrayassert::jsonArray::index::value}}` | — | Sets `index` to `value` only if `index` is currently out of bounds (extends the array, leaving holes) |
| `{{range::[n]}}` / `{{range::[start,end]}}` / `{{range::[start,end,step]}}` | — | Builds a JSON array of a numeric sequence. Note the argument is itself a JSON array literal |
| `{{filter::jsonArray::mode}}` | — | `mode` is `all` (default; drops empty strings **and** duplicates), `nonempty`, or `unique` |
| `{{all::a::b::...}}` or `{{all::jsonArray}}` | — | `1` if every value is `"1"` |
| `{{any::a::b::...}}` or `{{any::jsonArray}}` | — | `1` if any value is `"1"` |

<!-- src/ts/cbs.ts:1066-1073,1179-1187,1189-1197,1199-1210,1212-1235,1237-1246,1248-1257,1259-1268,1270-1279,1281-1293,1295-1302,1304-1322,1545-1562,1640-1666,1668-1679,1681-1692 -->

## Variables

See the "Variables" section on [[Curly-Brased-Syntaxes]] for the full explanation of chat/global/temp variables. Quick reference:

| Syntax | Aliases | Notes |
|---|---|---|
| `{{getvar::name}}` | — | Reads a persistent chat variable (`"null"` if unset) |
| `{{setvar::name::value}}` | — | Writes a persistent chat variable; only takes effect while the outgoing prompt is being built for a generation, a no-op elsewhere |
| `{{addvar::name::amount}}` | — | Adds a number to a persistent chat variable; same restriction as `setvar` |
| `{{setdefaultvar::name::value}}` | — | Like `setvar`, but only if the variable is currently unset/empty/`"null"`; same restriction |
| `{{getglobalvar::name}}` | — | Reads a global chat variable (shared across characters/chats) |
| `{{tempvar::name}}` | `gettempvar` | Reads a temp variable (script-execution scoped, not persisted) |
| `{{settempvar::name::value}}` | — | Writes a temp variable |
| `{{return::value}}` | — | Immediately ends the current parser run and yields `value` as the final result |

<!-- src/ts/cbs.ts:753-763,765-776,778-790,792-799,810-824,826-840,842-859,861-868 -->

## Formatting helpers

| Syntax | Result |
|---|---|
| `{{tex::expr}}` (aliases `latex`, `katex`) | Wraps `expr` in `$$...$$` for KaTeX rendering |
| `{{ruby::base::reading}}` (alias `furigana`) | `<ruby>` markup for furigana/ruby text |
| `{{codeblock::code}}` / `{{codeblock::lang::code}}` | `<pre><code>` block, or a highlighted code block when a language is given |
| `{{comment::text}}` | Shows `text` in a `.risu-comment` div **only while displaying**; resolves to empty string when parsed for the model request |
| `{{//  anything}}` | A comment — the whole `{{// ...}}` tag (including the leading `//`) is removed. Unlike `{{comment}}`, it never displays. |
| `{{button::label::triggerId}}` | An HTML button (`risu-trigger="triggerId"`) that fires a manual trigger when clicked |
| `{{risu}}` / `{{risu::sizePx}}` | The Risu logo image, default 45px |
| `{{file::name::base64}}` | While displaying: a `.risu-file` div showing `name`. Otherwise: decodes `base64` as UTF-8 text |
| `{{bkspc}}` | Deletes back to the previous whitespace in the text generated so far in this parser run (word-level backspace) |
| `{{erase}}` | Deletes back to the previous sentence-ending punctuation (`.`, `!`, `?`, newline) in the text generated so far |
| `{{declare::name}}` | Marks a flag for `name`. Nothing currently reads it back, so it has no visible effect. |

<!-- src/ts/cbs.ts:870-877,879-887,971-981,2130-2140,2142-2149,2151-2158,2160-2177,2180-2210,2212-2246,2248-2256,2258-2263 -->

`{{bkspc}}` and `{{erase}}` only work on text produced earlier in the *same* CBS run (e.g. editing the character's own message during a display/output regex pass) — they cannot reach outside the current parse.

## Encoding / obfuscation

| Syntax | Aliases | Result |
|---|---|---|
| `{{xor::str}}` | `xorencrypt`, `xorencode`, `xore` | XORs each byte with `0xFF`, base64-encodes the result |
| `{{xordecrypt::base64}}` | `xordecode`, `xord` | Reverses `{{xor}}` |
| `{{crypt::str[::shift]}}` | `crypto`, `caesar`, `encrypt`, `decrypt` | Caesar-shifts UTF-16 code units by `shift` (default `32768`, which is its own inverse — so the default shift both encrypts and decrypts) |

<!-- src/ts/cbs.ts:1948-1959,1961-1972,1974-1999 -->

These are lightweight obfuscation, not real security. Do not rely on them to hide anything from a determined user.

### Example: keep a spoiler out of sight in a character description

A description often holds a twist the user shouldn't read by accident, for example while opening the character to fix a typo somewhere else. You can store that part encoded, so the editor shows only an unreadable string, while the model still gets the plain text. The description is run through CBS each time the prompt is built.

1. Open **Playground → Syntax**. It runs CBS on whatever you type, in a sandbox.
2. Type the secret part wrapped in `{{xor::…}}`:

   ```
   {{xor::hello}}
   ```

   The Result box shows the encoded text, here `l5qTk5A=`.
3. Copy the result, and put only the decoding call in the character's description:

   ```
   {{char}} is a travelling merchant. {{xordecrypt::l5qTk5A=}}
   ```

   When the prompt is built, the model reads `hello` in place of the call. Someone looking at the description sees only `l5qTk5A=`.

`{{reverse::…}}` works the same way: encode in the Playground, then put `{{reverse::<reversed text>}}` in the description. It is easier to read by eye, though, and the reversed text must not contain `::`, `{{` or `}}`, because those would be read as CBS syntax. XOR output is base64 (letters, digits, `+`, `/`, `=`), so it has no such problem. Keep CBS tags such as `{{user}}` out of the encoded part and write them outside it.

Anyone can paste the string back into the Playground and decode it. This keeps a user from being spoiled by accident; it does not stop one who goes looking.

## System, model, and app metadata

| Syntax | Aliases | Result |
|---|---|---|
| `{{model}}` | — | Current chat model id/name |
| `{{axmodel}}` | — | Current auxiliary/sub model id |
| `{{maxcontext}}` | — | Configured max context length |
| `{{jbtoggled}}` | — | `1`/`0` whether the jailbreak prompt is enabled |
| `{{prefillsupported}}` | `prefill_supported`, `prefill` | `1` if the model id starts with `claude` |
| `{{screenwidth}}` | `screen_width` | Current browser window width in pixels |
| `{{screenheight}}` | `screen_height` | Current browser window height in pixels |
| `{{moduleenabled::namespace}}` | `module_enabled` | `1`/`0` whether a module with that namespace is active |
| `{{metadata::key}}` | — | See table below |

<!-- src/ts/cbs.ts:650-658,660-668,702-710,712-720,1357-1365,1367-1374,1376-1383,1608-1621,1864-1936 -->

`{{metadata::key}}` keys (case-insensitive): `mobile`, `local` (desktop/Tauri build), `node` (self-hosted Node server), `version`, `majorversion`/`majorver`/`major`, `language`/`locale`/`lang` (app language), `browserlanguage`/`browserlocale`/`browserlang`, `modelshortname`, `modelname`, `modelinternalid`, `modelformat`, `modelprovider`, `modeltokenizer`, `risutype` (`local`/`node`/`web`), `maxcontext`, and the joke key `imateapot` (🫖). An unrecognized key returns `Error: <key> is not a valid metadata key.`. <!-- src/ts/cbs.ts:1864-1936 -->

## Chat/character context

| Syntax | Aliases | Result |
|---|---|---|
| `{{chatindex}}` | `chat_index` | Current message's index; `-1` if there isn't one (e.g. first message) |
| `{{firstmsgindex}}` | `firstmessageindex`, `first_msg_index` | Index of the selected alternate greeting, `-1` for the default first message |
| `{{role}}` | — | `"user"`, `"char"`, or `"system"` for the current message context |
| `{{isfirstmsg}}` | `isfirstmessage` | `1`/`0` |
| `{{lastmessage}}` | — | Content of the chat's last message (any role) |
| `{{lastmessageid}}` | `lastmessageindex` | Index of the chat's last message |
| `{{previouschatlog::i}}` | `previous_chat_log` | Content of message `i`; `"Out of range"` if invalid |
| `{{trigger_id}}` | `triggerid` | Value of the `risu-id` attribute on the element that triggered a manual trigger click; `"null"` if none |
| `{{hiddenkey::anything}}` | — | Always empty string; used purely so a lorebook/keyword scanner sees the argument text as an activation key without it appearing in the model request |

<!-- src/ts/cbs.ts:184-192,415-422,424-434,670-688,690-700,722-735,737-750,1147-1157,2112-2119 -->

See [[Curly-Brased-Syntaxes]] for character/prompt text accessors (`{{char}}`, `{{description}}`, `{{lorebook}}`, `{{history}}`, etc.) and [[CBS-Blocks]] for `#if`/`#when`/`#each`/etc.
