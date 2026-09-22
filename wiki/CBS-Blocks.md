# CBS: Block Syntax

Part of [[Curly-Brased-Syntaxes]]. Blocks wrap a region of text and conditionally keep it, drop it, repeat it, or leave it unparsed. A block is opened with `{{#name ...}}` and closed with either the matching `{{/name}}` or the generic closer `{{/}}` — both work for every block type. <!-- src/ts/parser/parser.svelte.ts:1759-1815 -->

Blocks can be nested arbitrarily; each nesting level is tracked on its own stack frame, so an inner block's whitespace/parsing mode does not leak into the outer one except where documented below (e.g. `#each`/`#when` interacting with `:else`). <!-- src/ts/parser/parser.svelte.ts:1646-1656,1700-1857 -->

## `{{#when}}` — conditional block (preferred)

```
{{#when condition}}...{{/when}}
{{#when::not::condition}}...{{/when}}
```

`{{#when}}` replaced the older `{{#if}}` because it supports operators. A bare condition (no operators) is truthy if it equals `1` or `true`; anything else is falsy. You can write a single condition either with `::` (`{{#when::condition}}`) or with a space and no `::` at all (`{{#when condition}}`) — but mixing a space-form condition with operators does not work; once you use an operator you must use `::` throughout. <!-- src/ts/parser/parser.svelte.ts:1229-1452 -->

### Operators

Operators are combined by walking the `::`-separated argument list from **right to left**, consuming two-argument operators as `(rightOperand, operator, leftOperand)`. This means `and`/`or` chains evaluate right-to-left, which can give surprising results when mixed. For example, `{{#when::a::tis::3::or::b::tis::7}}` evaluates `b::tis::7` before combining with `or`, not `a::tis::3` first. Test long chains of different operators carefully before relying on them. <!-- src/ts/parser/parser.svelte.ts:1246-1420; src/ts/parser/tests/cbs/conditionals.test.ts:265-281 -->

Comparison/equality (each takes the operand to its right and the one further right as its two sides):

| Operator | Meaning |
|---|---|
| `A::is::B` | `A === B` (string equality) |
| `A::isnot::B` | `A !== B` |
| `A::>::B` | `parseFloat(A) > parseFloat(B)` |
| `A::<::B` | `parseFloat(A) < parseFloat(B)` |
| `A::>=::B` | `parseFloat(A) >= parseFloat(B)` |
| `A::<=::B` | `parseFloat(A) <= parseFloat(B)` |

<!-- src/ts/parser/parser.svelte.ts:1289-1408 -->

Logical:

| Operator | Meaning |
|---|---|
| `not::A` | Negate `A` (truthy check is `A === "1" \|\| A === "true"`) |
| `A::and::B` | Both truthy |
| `A::or::B` | Either truthy |

<!-- src/ts/parser/parser.svelte.ts:1250-1288 -->

Variable/toggle shortcuts:

| Operator | Meaning |
|---|---|
| `var::name` | Truthy check on chat variable `name` |
| `toggle::name` | Truthy check on global chat variable `toggle_name` |
| `A::vis::B` | Chat variable `A`'s value equals literal `B` |
| `A::visnot::B` | Chat variable `A`'s value does not equal literal `B` |
| `A::tis::B` | Global toggle variable `A` (i.e. `toggle_A`) equals literal `B` |
| `A::tisnot::B` | Global toggle variable `A` does not equal literal `B` |

<!-- src/ts/parser/parser.svelte.ts:1309-1368 -->

Whitespace-handling modifiers (see next section) — `keep` and `legacy` — can be combined with any condition, e.g. `{{#when::keep::not::condition}}`.

### Whitespace handling

By default (`{{#when condition}}` with no `keep`/`legacy`), a **truthy** block's content has its leading/trailing blank lines trimmed and every line's leading whitespace stripped (each line is individually left-trimmed) — a falsy block simply produces nothing. <!-- src/ts/parser/parser.svelte.ts:1504-1562 -->

| Modifier | Effect |
|---|---|
| `{{#when::keep::condition}}` | Preserves all whitespace exactly as written, including inside `:else` |
| `{{#when::legacy::condition}}` | Falls back to `{{#if}}`'s whitespace handling (trim start of block, end of block, and start of every line) and **does not support `:else`** |

<!-- src/ts/parser/parser.svelte.ts:1424-1447,1427-1447,1554-1562; src/ts/cbs.ts:2447 -->

### `{{:else}}`

Used only inside `{{#when}}` (not `{{#if}}`/`{{#if_pure}}`, and not with the `legacy` operator). If the block spans one line, `{{:else}}` can appear inline on that line; if the block spans multiple lines, `{{:else}}` must be alone on its own line (no other text before/after it on that line), or it will not be recognized as the separator. <!-- src/ts/parser/parser.svelte.ts:1516-1552; src/ts/cbs.ts:2443-2448 -->

```
{{#when condition}}
shown when true
{{:else}}
shown when false
{{/when}}
```

`{{:else}}` also works correctly when the `{{#when}}` is nested inside another `{{#when}}` or inside a `{{#each}}` loop body. <!-- src/ts/parser/tests/cbs/conditionals.test.ts:353-376 -->

## `{{#if}}` / `{{#if_pure}}` (deprecated, still supported)

```
{{#if 1}}...{{/if}}
{{#if_pure 1}}...{{/if_pure}}
```

Both are truthy only for a literal `1` or `true` right after the space (the check reads the first whitespace-delimited token, so trailing text after that token is ignored, e.g. `{{#if 1 because reasons}}` still renders); anything else drops the block. They exist only because `{{#when}}` didn't support extra operators at the time `{{#if}}` was written, and are now deprecated in favor of `{{#when}}`/`{{#when::keep::...}}`. <!-- src/ts/cbs.ts:2381-2401; src/ts/parser/parser.svelte.ts:1216-1227 -->

- `{{#if}}`: same whitespace trimming as `{{#when}}`'s default mode (trims block edges and each line's leading whitespace). <!-- src/ts/parser/parser.svelte.ts:1504-1505 -->
- `{{#if_pure}}`: preserves all whitespace exactly (equivalent to `{{#when::keep::...}}`). <!-- src/ts/parser/parser.svelte.ts:1513-1515 -->
- Neither supports `{{:else}}`.

## `{{#each}}` — loop over an array

```
{{#each arrayExpr as varName}}...{{slot::varName}}...{{/each}}
{{#each arrayExpr varName}}...{{/each}}          (the "as" keyword can be omitted)
{{#each::keep arrayExpr as varName}}...{{/each}}
```

`arrayExpr` is evaluated as CBS first (so `{{getvar::arr}}` etc. work), then parsed as JSON. If the result isn't valid JSON, or is valid JSON that isn't an array, it falls back to splitting the raw (CBS-evaluated) text on `§`. If the text contains no `§`, that fallback produces a single-element array holding the whole expression text — so the body still runs once, with `{{slot::varName}}` substituted by that raw text; the loop is not skipped. An empty array produces no output. <!-- src/ts/parser/parser.svelte.ts:1187-1197,1467-1478,1772-1791; src/ts/parser/tests/cbs/loop.test.ts:100-108 -->

Inside the body, `{{slot::varName}}` is substituted, per iteration, with the current element — if the element is a string it's inserted directly, otherwise it's JSON-stringified (so nested arrays/objects round-trip as JSON text, letting you nest `{{#each}}` over a 2D array). <!-- src/ts/parser/parser.svelte.ts:1772-1791 -->

Default whitespace handling trims the block's outer whitespace and left-trims each line (same as `{{#when}}`'s default); `{{#each::keep ...}}` preserves everything. `{{#each}}` works correctly nested inside `{{#when}}`/`{{:else}}` and vice versa. <!-- src/ts/parser/parser.svelte.ts:1507-1512; src/ts/parser/tests/cbs/loop.test.ts:126-151 -->

```
{{#each [1, 2, 3] as n}}{{slot::n}} {{/each}}    → "1 2 3 "
{{#each [] as n}}{{slot::n}}{{/each}}            → ""
```

## `{{#func}}` / `{{call::}}` — reusable snippets

```
{{#func name arg1 arg2}}
  body using {{arg::0}} and {{arg::1}}
{{/func}}
...
{{call::name::value1::value2}}
```

`{{#func name ...argNames}}` stores its (unparsed) body under `name` for later use in the same CBS run, including any nested recursive calls. Declaring a function produces no output by itself. <!-- src/ts/parser/parser.svelte.ts:1479-1485,1792-1799 -->

`{{call::name::arg0::arg1::...}}` substitutes `{{arg::0}}`, `{{arg::1}}`, ... in the stored body with the literal call arguments (this is plain string substitution before parsing, not CBS-argument passing) and then parses the substituted body again. Calls nest up to a depth of 20 (shared with the general CBS recursion limit); past that, `{{call::...}}` and any other nested CBS evaluation returns `ERROR: Call stack limit reached`. <!-- src/ts/parser/parser.svelte.ts:1667-1671,1816-1834 -->

## `{{#pure}}` (deprecated) / `{{#puredisplay}}`

```
{{#puredisplay}}raw {{content}} shown as-is{{/puredisplay}}
```

Content inside is emitted completely unparsed (no CBS function inside it is evaluated) after trimming leading/trailing whitespace. `{{#puredisplay}}` additionally re-escapes any `{{`/`}}` in its content (to `\{\{`/`\}\}`) so that a later re-parse of the surrounding text (e.g. by a display/markdown pass) does not accidentally evaluate it either. `{{#pure}}` is the deprecated predecessor kept for backward compatibility; it does not do that re-escaping, so its content can be re-evaluated (and potentially misrendered) if the text is parsed a second time — prefer `{{#puredisplay}}`. <!-- src/ts/cbs.ts:2450-2465; src/ts/parser/parser.svelte.ts:1499-1503,1800-1803; src/ts/parser/tests/cbs/escapes.test.ts:117-134 -->

## `{{#escape}}` — escape literal braces/parens

```
{{#escape}}literal {curly} (parens) text{{/escape}}
{{#escape::keep}}...{{/escape}}
```

Converts every `{`, `}`, `(`, `)` inside the block into private-use placeholder characters, so they survive any further CBS parsing as inert text and are converted back to plain `{`/`}`/`(`/`)` only when the final text is unescaped (this happens automatically wherever RisuAI renders the final chat text or assembles the model prompt — see "Escaping and nesting" on [[Curly-Brased-Syntaxes]]). Default mode trims surrounding whitespace; `{{#escape::keep}}` preserves it. <!-- src/ts/cbs.ts:2467-2477; src/ts/parser/parser.svelte.ts:1462-1466,1593-1594; src/ts/parser/tests/cbs/escapes.test.ts:136-152 -->

## `{{#code}}` — normalize escaped text

```
{{#code}}line1\nline2A{{/code}}
```

Not documented in the built-in function registry, but implemented directly in the parser: strips all literal newline and tab characters from the block, then unescapes `\uXXXX` sequences and the usual backslash escapes (`\n` `\r` `\t` `\b` `\f` `\v`). Two escapes are broken: `\a` outputs a literal `a` (not a bell character), and `\x` always emits a NUL character (U+0000) and ignores any hex digits that follow it — `\x41` produces a NUL followed by the literal text `41`, not `A`. Useful for embedding a code sample that was itself written with escaped newlines. <!-- src/ts/parser/parser.svelte.ts:1565-1591 -->

## Legacy single-brace block: `{# ... #}`

An older, hard-coded (not user-extensible) block form still recognized by the parser, using single braces instead of double:

```
{#if 1
shown only if the condition is 1
#}
```

The first line after `{#` up to the first space is treated as the keyword; only `if` is implemented. The condition token (second word on that first line) is falsy for `""`, `"0"`, or `"-1"` — anything else, including arbitrary text, counts as **truthy** (this is different from `{{#if}}`, which is only truthy for `1`/`true`). If the condition fails to match `if` at all, or parsing fails, the original `{#...#}` text is left untouched in the output. This form predates `{{#if}}`/`{{#when}}`; prefer those instead. <!-- src/ts/parser/parser.svelte.ts:1161-1183,1712-1723 -->

## `{{slot}}` and `{{position}}`

- `{{slot::name}}` / `{{slot}}` — a placeholder consumed by whichever construct created it (`{{#each}}`'s loop variable, or a prompt template's content slot); it has no standalone meaning outside those contexts. <!-- src/ts/cbs.ts:2491-2496 -->
- `{{position::name}}` — declares a named insertion point that other features (e.g. the `@@position <name>` decorator) can target; see [[Prompt-Template]] for how positions are consumed. <!-- src/ts/cbs.ts:2498-2503 -->
