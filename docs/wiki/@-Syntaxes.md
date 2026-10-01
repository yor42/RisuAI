# @ Syntax

`@`-prefixed syntax is unrelated to Markdown/HTML and [[Curly Brased Syntaxes]]. Each form below only has an effect in one specific place in the app.

## Prompt role decorators

In the **Main Prompt**, **Jailbreak Prompt**, and **Global Note**, you can mark parts of the text as belonging to a specific chat role by starting a line with `@@system`, `@@user`, or `@@assistant` (three `@` also works: `@@@system`, etc.). Everything up to the next role marker (or the end of the text) is sent with that role.
<!-- src/ts/process/index.svelte.ts:423-453 -->

```
@@system
Assistant must act as SomeThing, and must follow the rules.
@@assistant
Ok, I understand, here is the output:
```

If the text doesn't start with `@@` at all, it is treated as entirely `system` role.
<!-- src/ts/process/index.svelte.ts:428-429 -->

This only applies when the character is **not** using a [[Prompt Template]] and is **not** a Utility Bot. With a Prompt Template, each prompt block already has its own role set in the template itself, so this text-based syntax is not consulted.
<!-- src/ts/process/index.svelte.ts:375-453 -->

### `@@system` / `@@@system`
Marks the following text as `system` role.

### `@@assistant` / `@@@assistant`
Marks the following text as `assistant` role.

### `@@user` / `@@@user`
Marks the following text as `user` role.

## Regex Script effects

These are written as the **output** of a [[Regex Script]] entry and change what the script does, instead of (or in addition to) substituting text. See [[Regex Script]] for how to create and run scripts; only the `@@` decorators themselves are documented here.
<!-- src/ts/process/scripts.ts:160-289 -->

### `@@emo <name>`
When the script's pattern matches, adds `<name>` to the character's recent emotion images instead of replacing text.
<!-- src/ts/process/scripts.ts:184-206 -->

### `@@repeat_back <pos>`
If the script's pattern does **not** match the current message, it looks the pattern up in the previous message of the same role and copies that match in instead. `<pos>` controls where the copied text goes: `end`, `start`, `end_nl` (end, on a new line), or `start_nl` (start, on a new line). If `<pos>` is omitted, it's appended at the end.
<!-- src/ts/process/scripts.ts:252-287 -->

### `@@move_top <replacement>` / `@@move_bottom <replacement>`
Removes the matched text from its original position and re-inserts `<replacement>` at the very top or bottom of the message instead. `<replacement>` can use `$&`, `$1`, `$2`, ... and `$<name>` capture-group references, same as normal regex replacement text. The `g` flag is dropped for these directives, so only the first match is ever moved, even with Global checked. See [[Regex Script]] for details.
<!-- src/ts/process/scripts.ts:160-162,216-246 -->

### `@@inject`
When the pattern matches, saves the message's current full text back into the chat log immediately (instead of only changing what's displayed), then removes the matched text from the working copy. Only has an effect on an actual chat message (not on prompts being previewed). It always targets the currently selected character, so it has no effect for group members or preview characters.
<!-- src/ts/process/scripts.ts:207-211 -->

## Lorebook decorators

Lines starting with `@@` (and the `@@@` fallback form) at the top of a lorebook entry's content are **lorebook decorators**. They control where and when the entry is inserted, for example `@@depth 0`, `@@end`, `@@position`, `@@activate_only_after`, `@@probability`, `@@inject_lore`. The full list is on [[Lorebook]].
<!-- src/ts/process/lorebook.svelte.ts:302-507 -->

## Other notes

- These decorators are recognized only by the exact mechanisms above (prompt-role splitting, a Regex Script's output field, or the top of a lorebook entry) — writing `@@system` or `@@emo` in ordinary chat text does nothing.
- Only `@@move_top`/`@@move_bottom` substitute capture-group references (`$1`, `$&`, ...; named `$<name>` references do not currently work, see [[Regex Script]]) in their replacement text; `@@emo`, `@@repeat_back`, and `@@inject` don't use the output text for substitution at all.
  <!-- src/ts/process/scripts.ts:184-289 -->

## See also
- [[Regex Script]] — full documentation for creating scripts these effects attach to.
- [[Curly Brased Syntaxes]] — `{{...}}` macros.
- [[Prompt Template]] — the role-per-block system that supersedes the `@@` prompt decorators when in use.
