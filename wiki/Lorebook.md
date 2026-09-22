# Lorebook

A Lorebook is a set of text entries ("lore") that are conditionally inserted into the prompt based on the chat's content. It lets you give a character a large amount of background knowledge without paying its token cost on every turn.
<!-- src/ts/process/lorebook.svelte.ts:75 -->

## Where lorebooks live

Three scopes are merged into one list for every scan, in this order: **Character Lore → the current chat's Chat Lore → enabled modules' Module Lore**.
<!-- src/ts/process/lorebook.svelte.ts:79-82 -->

- **Character Lore** — attached to the character and travels with the character card.
  <!-- src/ts/storage/database.svelte.ts:1356 -->
- **Chat Lore** — attached to one specific chat only.
  <!-- src/ts/storage/database.svelte.ts:1821 -->
- **Module Lore** — comes from any enabled [[module|Modules]]; entries from all enabled modules are concatenated in module order.
  <!-- src/ts/process/modules.ts:430-441 -->

The app also has a Global Lorebook settings page, but it cannot be opened from the settings menu, and its entries are never used in chats.
<!-- src/lib/Setting/Settings.svelte:214-215 -->

Folders are UI-only grouping containers. They have a placeholder key that practically never matches chat text, so they organize the list but never insert content themselves.
<!-- src/ts/process/lorebook.svelte.ts:50-58,285-298; src/lib/SideBars/LoreBook/LoreBookData.svelte:121-133 -->

Toggling **Locally Active** on a Character Lore entry from within a chat creates a linked copy in that chat's Chat Lore. The copy mirrors the parent entry's name and text and is always active for that chat only, without duplicating the original entry.
<!-- src/ts/process/lorebook.svelte.ts:60-72,285-298; src/lib/SideBars/LoreBook/LoreBookData.svelte:52-87 -->

## Entry fields

- **Name** — display-only label.
- **Activation Keys** — comma-separated. Any one key matching activates the entry, unless a negative decorator says otherwise (see Activation below).
- **Secondary Keys** — only used when **Selective** is on; see Activation below.
- **Always Active** — skips key matching entirely; the entry is always included, subject to the token budget.
- **Insertion Order** — see Ordering and token budget below.
- **Prompt** — the text inserted, plus any leading `@@decorator` lines (see the decorator list below).
- **Use Regex** — treat every key as a `/pattern/flags` literal instead of plain text (see Activation).
- **Activation Probability** — the current save format expresses this as an `@@probability` decorator (see Legacy).
- **Case Sensitive** — round-tripped for character-card (V2/V3) compatibility, but matching is currently always case-insensitive at runtime. This setting has no effect on activation.
  <!-- src/ts/process/lorebook.svelte.ts:174-180,206-209; src/ts/characterCards.ts:1130,1160 -->

## Activation

Each time the prompt is built, the engine scans all entries that haven't activated yet, and repeats until no new entry activates. This repetition is what makes recursive scanning possible.
<!-- src/ts/process/lorebook.svelte.ts:254-606 -->

For each entry, unless it's Always Active or force-activated by a decorator:

1. The primary **Activation Keys** are checked against the last *N* messages (Scan Depth, see below) plus any already-recursively-activated lore text. Any one key matching is enough.
   <!-- src/ts/process/lorebook.svelte.ts:145-230,534-542 -->
2. If **Selective** is on and Secondary Keys are set, the secondary key group is checked too, and both groups must match for the entry to activate.
   <!-- src/ts/process/lorebook.svelte.ts:527-556 -->
3. Matching is always case-insensitive, and, unless Full Word Matching is on, ignores spaces in both the key and the searched text before comparing substrings.
   <!-- src/ts/process/lorebook.svelte.ts:174-223 -->
4. If **Use Regex** is on, every key must be written as `/pattern/flags`. If even one key in the list isn't in that form, the whole check fails and the entry never activates, not just that key. Both regex and plain-text (substring/full-word) matching test only the raw message text (`m.data`); the `name: text` wrapped form (`m.prompt`) is never matched against — it's only used to label matches in the debug match log.
   <!-- src/ts/process/lorebook.svelte.ts:145-224 -->

**Scan Depth** and **Token Budget**: each character (or group) can override the app-wide defaults. If not overridden, the default Scan Depth is 5 and the default Token Budget is 800.
<!-- src/ts/storage/database.svelte.ts:73-77,819-820,1502-1507 -->

**Recursive scanning**: once an entry activates, its content is added to the pool of text that later entries can match against, so lore can chain. This can be toggled globally per character (default: on) or per entry with the `@@recursive`/`@@unrecursive` decorators. `@@no_recursive_search` excludes just that entry's own text from being used as bait for other entries' recursive matches.
<!-- src/ts/process/lorebook.svelte.ts:88,136-143,499-510,591-604 -->

## Ordering and token budget

1. All activated entries are sorted by **priority**, descending. Priority defaults to Insertion Order but can be overridden per entry with the `@@priority` decorator.
   <!-- src/ts/process/lorebook.svelte.ts:273-274,494-497,608-610 -->
2. Entries are added, in that priority order, until the Token Budget would be exceeded. Anything past the budget is dropped entirely.
   <!-- src/ts/process/lorebook.svelte.ts:612-620 -->
3. The surviving entries are then re-sorted by **Insertion Order** (descending) and reversed, so a higher Insertion Order ends up later in the prompt, closer to the model's next reply and generally more influential. Priority only controls which entries survive the budget cut.
   <!-- src/ts/process/lorebook.svelte.ts:622-624,661-663 -->
4. `@@ignore_on_max_context` forces priority to `-1000`, making that entry the first to be dropped once the budget is tight, without excluding it outright when the budget allows it.
   <!-- src/ts/process/lorebook.svelte.ts:435-438 -->
5. `@@inject_lore` merges are applied after the budget cut, matched against the surviving entries' name. If the target entry was itself dropped by the budget, the injection is silently lost. Note: this can make the actual token count exceed the configured budget.
   <!-- src/ts/process/lorebook.svelte.ts:627-659 -->

## Positions

Set with the `@@position`/`@@depth`/`@@reverse_depth`/`@@role` decorators. Default position is the normal lorebook block; default role is `system`.

- **Normal** (no position decorator) — inserted as part of the main lorebook block, ordered as above.
  <!-- src/ts/process/index.svelte.ts:542-552 -->
- **Before/After Character Description, Personality, Scenario** (`@@position before_desc|after_desc|personality|scenario`) — spliced next to those specific prompt fields.
  <!-- src/ts/process/index.svelte.ts:554-571 -->
- **Custom Prompt Template slot** (`@@position pt_<name>`) — only pulled in where a `{{position::<name>}}` [[CBS|Curly Brased Syntaxes]] tag is placed inside another prompt piece, typically a [[Prompt Template]] block. This is resolved up to 5 nesting levels deep; any leftover `{{position::...}}` tags are then stripped.
  <!-- src/ts/process/index.svelte.ts:513-540 -->
- **`@@depth 0`** (same as the `@@end` decorator) — placed at the very end of the prompt, after everything else. It's split into non-assistant-role and assistant-role groups; assistant-role entries are added after user/system ones, since assistant content must stay a prefill.
  <!-- src/ts/process/index.svelte.ts:595-624 -->
- **`@@depth N`** (`N` > 0) / **`@@reverse_depth N`** — spliced directly into the in-context message list rather than the system-prompt area, at an index computed from `N`. `depth` and `reverse_depth` count from opposite ends of the message list. Useful for content that should appear to come from a specific point in the conversation rather than the system prompt.
  <!-- src/ts/process/index.svelte.ts:1069-1207 -->
- **`@@role user|assistant|system`** — sets the chat role used when the entry is turned into a message. Only meaningful for the depth-based positions above.
  <!-- src/ts/process/lorebook.svelte.ts:363-369 -->

## Injection decorators

Separate from `@@position`:

- **`@@inject_lore <target name>`** — merges this entry's text into another lore entry, matched by that entry's Name, after the token-budget cut. Default operation is append.
- **`@@inject_at <target>`** — targets a [[Prompt Template]] block instead of another lore entry. Default operation is append.
- **`@@inject_prepend`** / **`@@inject_replace <substring>`** — change the operation set by `inject_lore`/`inject_at` to prepend, or to replace a literal substring (`param`) inside the target's text. These can be combined with `inject_lore`/`inject_at` on the same entry; the target choice and the operation are independent decorators.
  <!-- src/ts/process/lorebook.svelte.ts:391-434; src/ts/process/index.svelte.ts:610-658 -->

## All `@@` decorators

Decorators are one per line at the start of an entry's Prompt text. The first line that isn't `@@...` ends the decorator block, and everything from there on is the literal prompt text.
<!-- src/ts/process/lorebook.svelte.ts:300-515 -->

`@@@name args` (triple-`@`) is a fallback form: it only runs if the immediately preceding `@@name` decorator was not recognized. `@@@end`/`@@end` are always equivalent and always run regardless of that fallback state. This lets you write a primary decorator plus a fallback for import/export compatibility with other card formats.

Arguments are comma-separated after the decorator name, e.g. `@@depth 3` → `["3"]`, `@@additional_keys foo, bar` → `["foo","bar"]`.

| Decorator | Arg(s) | Effect |
|---|---|---|
| `@@end` / `@@@end` | — | Reset position to depth-based insertion at depth 0 (same as `@@depth 0`). |
| `@@depth N` | int | See Positions above. |
| `@@reverse_depth N` | int | See Positions above. |
| `@@instruct_depth`, `@@reverse_instruct_depth`, `@@instruct_scan_depth` | — | Recognized but not supported; "instruct mode" doesn't exist in this app. Not recognized means any following `@@@` fallback line is used instead, if present. |
| `@@role user\|assistant\|system` | string | Sets the role used when this entry becomes a message; any other value is rejected. |
| `@@scan_depth N` | int | Overrides this entry's own scan depth (message lookback) for key matching. |
| `@@is_greeting N` | int | Only activates if the currently active greeting is greeting index `N-1` (0 = the character's default First Message, matching the alternate-greetings index + 1). |
| `@@position <target>` | `pt_<name>` or one of `after_desc`, `before_desc`, `personality`, `scenario` | See Positions above; any other value is rejected. |
| `@@inject_lore <name>` | text | See Injection decorators above. |
| `@@inject_at <target>` | text | See Injection decorators above. |
| `@@inject_replace <substring>` | text | See Injection decorators above. |
| `@@inject_prepend` | — | See Injection decorators above. |
| `@@ignore_on_max_context` | — | See Ordering above (forces priority `-1000`). |
| `@@additional_keys k1, k2` | list | Adds a required key group, ANDed with the primary key group; keys inside the group are ORed. |
| `@@exclude_keys k1, k2` | list | Deactivates the entry if any of these keys is present. |
| `@@exclude_keys_all k1, k2` | list | Deactivates the entry only if all of these keys are present. |
| `@@match_full_word` | — | Forces whole-word matching for this entry, overriding the global/character setting. |
| `@@match_partial_word` | — | Forces substring matching for this entry. |
| `@@is_user_icon` | — | Recognized but not implemented; has no effect. |
| `@@activate` | — | Force-activates the entry regardless of key matching. |
| `@@dont_activate` | — | Force-deactivates the entry regardless of key matching. |
| `@@keep_activate_after_match` | — | Once this entry matches once, it force-activates on every future turn of that chat. |
| `@@dont_activate_after_match` | — | Once this entry matches once, it force-deactivates on every future turn of that chat. |
| `@@disable_ui_prompt <target>` | `post_history_instructions` or `system_prompt` | Suppresses that built-in UI prompt block when this entry is active; any other value is rejected. |
| `@@probability N` | int (0–100) | Re-rolled on every scan pass; roughly an `N`% chance to activate even if keys match. |
| `@@priority N` | int | See Ordering above; independent of Insertion Order. |
| `@@recursive` | — | Forces this entry's activated text to be scannable by other entries' recursive matching, overriding the global/character setting. |
| `@@unrecursive` | — | Forces the opposite. |
| `@@no_recursive_search` | — | This entry's own recursive-match text pool is excluded when other entries scan recursively, independent of whether this entry itself does recursive scanning. |
| `@@activate_only_after N` | int | Only activates once the chat has reached at least `N` messages, including the active greeting. |
| `@@activate_only_every N` | int | Only activates every `N`th message. |
| any unrecognized `@@name` | — | Dropped silently, and enables the next `@@@` fallback line, if any. |

## Character, module, and chat lorebooks

- Character Lore and Chat Lore are edited from the same Lorebook panel in a character's sidebar, on separate "Character"/"Chat" tabs. Chat Lore only exists in the current chat and isn't shared across other chats with the same character.
  <!-- src/lib/SideBars/LoreBook/LoreBookSetting.svelte:55-78 -->
- Module Lore ships inside a module and is merged in for every character that has that module enabled. There's no per-character override of a module's own lorebook entries.
- Import/Export writes and reads `{"type":"risu","ver":1,"data":[...]}` JSON. It also accepts a Character Card V2/V3 `character_book` object, using its `entries` list, mapping fields such as `keys`, `secondary_keys`, `order`, `priority`, `constant`, and `selective` onto the fields described above.
  <!-- src/ts/process/lorebook.svelte.ts:668-745 -->

## Legacy

- The old Activation Probability number field is migrated on load into an `@@probability N` decorator prepended to the entry's content, and the field itself is then cleared. This runs once per entry.
  <!-- src/ts/characters.ts:664-681 -->
- `<end>`/`<bot>`/`<user>` legacy tags inside lore content are migrated to `@@depth 0`/`{{char}}`/`{{user}}` in that same pass.
  <!-- src/ts/characters.ts:676 -->
- Two other internal entry types from older save formats are still accepted for backward compatibility, but the current UI only writes Normal, Child, or Folder entries, and always-active behavior is fully controlled by the Always Active toggle.
  <!-- src/ts/process/lorebook.svelte.ts:285; src/ts/process/lorebook.svelte.ts:16-42 -->
- A lore-cache field is round-tripped through character-card export/import for compatibility, but isn't read by the current activation engine.
  <!-- src/ts/characterCards.ts:1132,1162 -->

## Worked examples

**Simple keyword lore:**
- Name: `Hara`, Activation Keys: `hara, idol`, Insertion Order: `100`
- Prompt: `Hara is a 22-year-old idol who...`
- Whenever "hara" or "idol" appears in the last 5 messages (default Scan Depth), this entry's text is inserted.

**Selective (AND) lore:**
- Activation Keys: `sword`; Secondary Keys: `broken`; Selective: on
- Only activates when a recent message contains "sword" **and** a (possibly different) recent message contains "broken".

**Always-on note pinned to the very end of the prompt:**
- Always Active: on
- Prompt:
  ```
  @@depth 0
  @@role system
  Stay in character. Never break the fourth wall.
  ```

**Chained/recursive lore with a probability gate:**
- Entry A — Activation Keys: `forest`; Prompt: `The forest hides an old shrine.`
- Entry B — Activation Keys: `shrine`; Prompt:
  ```
  @@probability 50
  The shrine grants one wish per century.
  ```
- Mentioning "forest" activates A; A's own text then makes B's "shrine" key match on the same scan (recursive scanning), and B has a 50% chance per pass to also activate.
