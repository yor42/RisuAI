# W1b — A trigger or script reads its own chat, not the one on screen

**STATUS:** plan rev 2.3, 2026-09-28. **Gate 1 passed; Gate 2 passed; live check passed; commit-message
check passed** (section 12; ledger rows 265-271). Committed as `22db8dfe`.

**Decisions:**
- `MC-094`: W1 splits into W1a (writes, committed as `13ed2e75`) and W1b (reads and the parser).
- `MC-095`: the send's own parser calls, its `{{setvar}}` writes, its lorebook call and graph
  memory are bound in W2, not here. W1b builds the mechanism W2 will use.
- `MC-011` (upstream characters, modules, presets, triggers, Lua, CBS and plugins keep working;
  fork-local behaviour is not worth preserving); `MC-075` (a write whose origin is gone drops
  silently); `MC-078` (an ambiguous target is skipped with a warning, never guessed); `MC-076`
  (W-6: a member's trigger never writes into the group's slot); `MC-089`; `MC-091` (scope
  amendments).

**Evidence:**
- W1a's scoping of the same surface: ledger row 254;
- W1b's scoping: ledger row 265 (`investigator`, two `code-searcher` surveys);
- performance of resolution and the memo: row 257;
- W1a's plan and gate record: Report 33.

The Orchestrator re-read the source for every decision-critical claim in section 1: the five
chat-variable tags and their `runVar` gate, `chatVar.svelte.ts`, the `#when` operators,
`checkPersonaBinded`, `getModules`, the Lua read bindings, `loadLoreBookV3Prompt`'s flag writes,
`graphmem.ts` and its six `callTool` sites, and `sendCharacterMessage.ts`'s `editinput` call.

Closes the read half of **CHORE-25**'s class for everything outside the send. No new ticket.

## 1. What is wrong at HEAD

W1a made every write a trigger run makes land on the run's origin. The run's reads through the
parser and several Lua bindings still follow the selection, so after a switch during an await a
trigger reads one chat and writes another.

1. **CBS inside a trigger reads the selection.** `runTrigger` parses its condition and effect
   strings with `risuChatParser(s, {chara: char})` (344 calls). In those strings:
   - `{{getvar}}` and `{{getglobalvar}}` (`cbs.ts`) call the injected `getChatVar`/
     `getGlobalChatVar`, which read `selectedCharID` and `chatPage` on every call
     (`chatVar.svelte.ts`). They never look at `matcherArg`.
   - `{{calc}}`'s and `{{? expr}}`'s `$var`/`@var` tokens do the same through `calcString`
     (`infunctions.ts`). `{{? expr}}` calls `calcString` from `matcher()` in `parser.svelte.ts`,
     not through the `calc` tag.
   - The `#when` operators `var`, `vis`, `visnot`, `toggle`, `tis` and `tisnot` call them directly
     (`parser.svelte.ts`). `#if` has no operators.
   - About twenty more tags read the injected `getSelectedCharID()` and index
     `db.characters[...]`:
     - `{{char}}` (alias `bot`) reads the selection **first**: for a non-group selection it returns
       that character's name before it looks at `matcherArg.chara`. It is a very common tag in
       trigger strings;
     - the message-history tags (`previouscharchat`, `previoususerchat`, `userhistory`,
       `charhistory`, `previouschatlog`, `history`, `lastmessage`, `lastmessageid`,
       `firstmsgindex`, `messagetime`, `messagedate`, `messageunixtimearray`,
       `messageidleduration`, `idleduration`, `role`);
     - `authornote`, whose main path reads the selection's chat;
     - `lorebook`, `emotionlist`, `assetlist`, `chardisplayasset`, `pick` and `rollp`;
     - the fallbacks of `personality`, `description`, `scenario` and `exampledialogue` when `chara`
       is not a character.
   - `{{user}}` and `{{persona}}` read the persona bound to the selection's chat
     (`checkPersonaBinded` in `util.ts`).
   - `moduleenabled`, `moduleassetlist` and `lorebook` read `getModules()`, which reads the
     selection's chat and character.
   - When `chara` is a group, `risuChatParser` finds the last speaker in
     `chara.chats[chara.chatPage]`, the group's current chat, not the run's.

   - `v2Calculate` replaces `$var` through the run's `getVar`, but hands `@var` tokens to
     `calcString`, which reads the selection's per-chat global-variable override. This is a direct
     call, not a parse.

   **Consequence:** after a switch during a trigger's await, a trigger that copies a value
   (`v2SetVar name = {{char}}`, `v2SetVar x = {{getvar::y}}`, or a `lastmessage`-based rule) reads
   the other chat or character and writes that value into its own chat. W1a made the write land
   correctly; the value written is wrong. A `{{setvar}}` in a trigger string writes nothing (it
   is inert without `runVar`), so there is no write through CBS in a trigger.
2. **Lua read bindings read the selection.** `getPersonaName`, `getPersonaDescription`,
   `getPersonaImageMain`, `cbs`, `getLoreBooksMain`, `loadLoreBooksMain`, `getCharacterImageMain`
   and `getGlobalVar` read the selection. `getCharacterLastMessage` and `getUserLastMessage` read
   `ScriptingEngineState.chat`, the chat object held when the call began, instead of re-resolving
   after the call's own awaits as every other chat binding does; `getCharacterLastMessage`'s
   fallback to `firstMessage` reads the selection. Each is declared twice, and the first pair is
   shadowed.
3. **`loadLoreBookV3Prompt` writes.** Its `keep_activate_after_match`/`dont_activate_after_match`
   decorators write `__internal_ka_*`/`__internal_da_*` through `setChatVar`, to the selection.
   Through Lua `loadLoreBooksMain` in a trigger run, a switch puts those flags on the other chat
   and reads the other character's lorebook.
4. **The `editinput` script has no origin.** `sendCharacterMessage.ts` passes its origin to the
   input trigger but calls `processScript(char, messageInput, 'editinput')` with none, and
   `runLuaEditTrigger` takes none. An `editinput` Lua script's `setState` after a switch during
   its own await writes the other chat's `scriptstate`: CHORE-25's class, on the path W1a's S1
   seam protects for the message itself. Its regex scripts' CBS reads the selection too.
   Both run after the input trigger's await, and so does their module selection:
   `runLuaEditTrigger` takes `getModuleTriggers()`, and `processScriptFull` takes
   `getModuleRegexScripts()` after its own awaits. After a switch, the other chat's module
   `editinput` scripts run on the message saved into the send's chat, and the send's own do not.
   `generateScriptCacheKey` parses `<cbs>`-flagged patterns with no target.
5. **Module selection follows the selection.** `runTrigger` takes its module triggers once, at
   its start, from `getModules()`. The start trigger (after `sendChat`'s own awaits) and the
   output trigger (after generation's) can start after a switch, and then run the other chat's
   module triggers against their own chat.

**Not wrong:** message rendering. Every render path reads the selected chat, and no render parse
sets `runVar`, so rendering reads what it shows and writes nothing (row 265).

## 2. The design

**W-1 for reads.** A parse or a Lua binding that runs for a unit of work with an origin reads that
origin's owner and chat, resolved by id, wherever it read the selection. A parse with no origin
reads the selection, exactly as at HEAD.

- **The target is the origin's owner and its chat, never the runner.** Absent a switch, the owner
  and chat are what the selection would have been, including in a group (the group and its chat),
  so every tag keeps its HEAD output. `chara` still names the runner, as at HEAD.
- **The target is W1a's run subject.** A trigger run and a Lua call already hold one
  (`createRunSubject`), memoised for one synchronous stretch. `risuChatParser` has no `await`, so
  one resolution serves a whole parse, and a run's parses share the run's memo.
- **An unresolvable target never falls back to the selection.** Reads see an empty chat with no
  owner: no messages, no variables, no bound persona (so the global persona), no note, and
  variable defaults from `templateDefaultVariables` alone, since there is no owner to take
  `defaultVariables` from. Writes are skipped. A trigger run already stops at its next refresh
  when its origin is gone or ambiguous; this covers a Lua call's own awaits and direct parses.
- **A lorebook scan works on one snapshot.** `loadLoreBookV3Prompt` holds its character and chat
  for its reads for its whole call at HEAD, across one `tokenize` await per active entry. With a
  target it resolves once at entry and reads that snapshot for the rest of the call, as HEAD's
  reads do. Its flag writes also land on that snapshot's chat object and are marked; at HEAD they
  go through `setChatVar` to the live selection at the moment of the write. So if the chat is
  replaced during the call, W1b's flags land on the detached object and are lost, never on
  another chat; that loss is new with W1b (section 9). Lua `loadLoreBooksMain` parses its books
  from the same snapshot. This is a stated exception to R1's "at the moment of the read", and it
  keeps each call to one resolution however many entries it has.

## 3. Scope

**In W1b:**
- `chatVar.svelte.ts`: every function takes an optional target; with none, HEAD's behaviour.
  A write through a target marks it for save.
- `cbs.ts`: every callback that reads the selection, the chat variables, the modules or the
  persona reads the target from `matcherArg` when one is given. Every internal recursive
  `risuChatParser` call forwards it.
- `parser.svelte.ts`: `risuChatParser` accepts the target and puts it on `matcherArg`; the `#when`
  operators and the group last-speaker lookup read it.
- `infunctions.ts`: `calcString` takes an optional target, for `{{calc}}`, `{{? expr}}` and
  `v2Calculate`.
- `util.ts`: `checkPersonaBinded`, `getUserName`, `getPersonaPrompt` and `getUserIcon` take an
  optional chat. Other callers are unchanged.
- `modules.ts`: `getModules` and every lookup built on it that an in-scope path calls
  (`getModuleLorebooks`, `getModuleTriggers`, `getModuleRegexScripts`, `getModuleAssets`) take an
  optional target.
- `lorebook.svelte.ts`: `loadLoreBookV3Prompt` takes an optional target, and its reads, its flag
  writes and its parses all use the snapshot in section 2.
- `triggers.ts`: a non-display run passes its subject to every parse, to `calcString` in
  `v2Calculate`, and to `getModuleTriggers`.
- `scriptings.ts`: the Lua bindings in section 1 item 2 use `ownerFor`/`currentChatFor` and pass
  the subject to their parses, to the persona helpers and to `loadLoreBookV3Prompt`; the shadowed
  duplicates are deleted; `runLuaEditTrigger` takes an optional origin and passes its subject to
  `getModuleTriggers`. `loadLoreBooksMain` resolves at most once per call however many books it
  returns.
- `scripts.ts`: `processScript`/`processScriptFull` take an optional origin, pass it to
  `runLuaEditTrigger`, and use its subject for their parses, `getModuleRegexScripts` and the cache
  key's parse. Their other callers pass none.
- `sendCharacterMessage.ts`: the `editinput` call passes the send's origin.

**Scope amendment (`MC-091`).** Row 265 and Gate 1 found about twenty selection-bound tags beyond
the five chat-variable tags `MC-094` names, plus `{{? expr}}`, the `#when` operators, the persona
lookup, the group last-speaker lookup, `v2Calculate`'s `@var` tokens and the `editinput` path's
module selection. They share the cause (the read has no target) and the fix (read the target
passed down). Leaving them would keep the failure in section 1 for any trigger that uses
`{{char}}`, `{{user}}`, `{{lastmessage}}` or `#when var`, which is most of them.

**Not in W1b:**
- **The send (`MC-095`, W2):** `sendChatBody`'s parser calls and `runCurrentChatFunction`'s
  `{{setvar}}` writes, its `loadLoreBookV3Prompt` call, its `editoutput`/`editprocess` scripts,
  and graph memory's tool calls. W2 gives the send one origin and passes its subject to the API
  W1b builds.
- **Display and request runs** of `runTrigger`: no origin, unchanged. The request trigger is W2's
  (CHORE-27).
- **Callers deliberately bound to the screen:** message rendering, `editdisplay`, the plugin API's
  `parseRisuChat` and other "current" helpers (Report 24's O-8), `Toggles.svelte`'s per-chat
  global-variable controls, `DevTool.svelte`, and the `/` commands (W3).
- **Global variables** (`db.globalChatVariables`) are not per-chat data. Only the per-chat
  override (`GLGlobalVariables`) follows the target.

## 4. Invariants

- **R1 — Target-bound reads.** Every per-chat or per-character read that a parse or Lua binding
  makes for a call with a target reads that target's owner and chat, resolved by id at the moment
  of the read: variables and their defaults, the per-chat global-variable override, messages,
  the author's note, the bound persona, lorebooks, modules, assets, the owner's name and the
  group's last speaker. A switch of character or chat at any await changes nothing a later read
  returns. The one exception is the lorebook snapshot (section 2): `loadLoreBookV3Prompt`'s reads
  and flag writes, and Lua `loadLoreBooksMain`'s per-book parses.
- **R2 — Target-bound writes.** The writes reachable in W1b's scope (the lorebook flags, and the
  `editinput` script's variable writes) land on the target and are marked for save in the same
  synchronous stretch.
- **R3 — No target, no change.** A call with no target behaves exactly as at HEAD, with one
  exception: where HEAD dereferenced a missing current character or chat, it may now return a
  value. That covers three cases:
  - `selectedCharID` indexes no character;
  - the selected character has no chat at its `chatPage`;
  - a group `chara` has no chat at its own `chatPage`.

  In those cases HEAD's tag threw and was left as literal text, HEAD's whole parse threw (the
  group last-speaker lookup, outside `matcher()`'s `try`), or `loadLoreBookV3Prompt` threw a
  `TypeError`. The working tree may instead return an empty name or message, an empty asset
  list, the chara's own lore, the global module lore, or a parse with `chara` as `'bot'`. No
  stored data is read from or written to another chat by this.
  A second, read-only exception: with no origin, the Lua `getLoreBooksMain` binding takes chat
  lore from the chat its call began with (`currentChatFor`, as every other Lua chat binding does
  with no origin), not from the selection at the moment it runs.
- **R4 — No switch, no change.** When the target's owner and chat are the selection, including a
  group and its chat, every output equals the output with no target.
- **R5 — Nested parses keep the target.** A tag parsed inside another tag, a `#when` body, a
  function call or a lorebook entry reads the same target as the outer parse.
- **R6 — No fallback to the selection.** A target that is gone or ambiguous never makes a read
  return the selection's data, and never makes a write land on it. Reads see the empty chat in
  section 2, and nothing throws: the group last-speaker lookup, which sits outside `matcher()`'s
  `try`, treats it as an empty chat.
- **R7 — Bounded resolutions.** A parse with a target resolves at most once, through the run's
  memo; a run's parses in one synchronous stretch share one resolution. A parse that reads no
  per-chat data resolves nothing. A `loadLoreBookV3Prompt` call resolves at most once, and a Lua
  `loadLoreBooksMain` call at most once in total, including the `loadLoreBookV3Prompt` call inside
  it, independent of the number of entries.
- **R8 — HEAD's split on variable defaults stays.** In a group run, `{{getvar}}`'s defaults come
  from the target's owner (as CBS reads them at HEAD), and the effect's `getVar` from the runner
  (as at HEAD and in W1a). W1b does not unify them.
- **R9 — No ambient target.** The target travels as an argument. No module-level variable holds a
  "current" target, because two runs can interleave across awaits.

## 5. Mechanism (non-normative)

- The target is a W1a `RunSubject` (or an interface with its `resolve()` and `mark()`), passed as
  an optional `subject` on `risuChatParser`'s argument and carried on `matcherArg`.
- The injected accessors in `registerCBS` become functions of `matcherArg` (for example
  `getChatVar(key, matcherArg.subject)`), so no callback reads a module-level selection.
- `risuChatParser` copies `subject` onto `matcherObj` under the same field name its argument type
  uses, so the thirteen recursive calls in `cbs.ts` and the parser's own `call::` re-entry, which
  all pass `matcherArg`/`arg` through, keep it (R5).
- `runTrigger` wraps its parses in one local helper that adds `subject`, rather than editing 344
  call sites by hand.
- The lorebook snapshot can be an adapter with `resolve()` returning the entry-time context and
  `mark()` marking its owner, passed to the scan's own parses.
- `getModules` keeps its single-entry cache, keyed by the module ids, so a target's call and a
  display call alternating after a switch recompute the list; the output stays correct.

## 6. Performance

- **Display is unchanged.** Render parses pass no target and take HEAD's path; the only added work
  is one check per per-chat read.
- **Trigger runs** reuse the memo the run already holds. Row 257 measured one full resolution at
  about 130 µs (1x) and 950 µs (6x throttle) over 1000 characters, and a memo hit at 600-770×
  less. A run's parses can resolve in a stretch where W1a's run resolved nothing (for example
  `v2Wait` followed by a `v2ShowAlert` whose value holds `{{lastmessage}}`), but only once per
  stretch, so a run stays within W1a's T9 bound of k+1 full resolutions for k awaits.
- **The new resolutions** are bounded per call, not per entry: one per `loadLoreBookV3Prompt` call,
  one per `loadLoreBooksMain` call in total (its inner `loadLoreBookV3Prompt` included), and one
  per `editinput` stretch that reads per-chat data. At
  HEAD these made none. Without R7's per-call bound, a scan of N active entries would resolve N
  times, one per `tokenize` await.
- **The count is the check.** The tests report full resolutions per run, per parse, and per
  lorebook call against its number of active entries. A new throttled measurement is needed only
  if a count grows with the number of entries or exceeds one per synchronous stretch, or if a
  display path changes.

## 7. Acceptance scenarios and tests

Tests first, against HEAD (`490bdec2`). Each regression reproducer must fail on a behavioural
assertion (an import, setup or missing-export failure does not count). At HEAD
`risuChatParser` ignores an unknown `subject` argument, so a direct parse passing one fails only
because HEAD ignores it: such tests are specification tests, labelled so. Reproducers are driven
through the entry points that exist at HEAD (`runTrigger`, a Lua call, `sendCharacterMessage`).

**The harness.** The suites follow W1a's `triggerOriginWrites.svelte.test.ts` (the harness's
`DBState`, a plain object under the node environment; the real `runTrigger`; real Lua), with
these modules **real, not mocked**:
`risuChatParser` and `cbs.ts`; `chatVar.svelte.ts`; `infunctions.ts`; `util.ts`'s
`checkPersonaBinded`, `getUserName`, `getPersonaPrompt` and `getUserIcon`; `modules.ts`'s
`getModules` and the lookups on it (as `modulesTriggerStamping.svelte.test.ts` loads the real
module); `lorebook.svelte.ts`'s `loadLoreBookV3Prompt`; `scripts.ts`'s `processScript`. A
re-implementation of any of them would test the stand-in. Time-dependent tags run under fake
timers, and seeded tags with fixed seeds. Suites that touch `processScript` call
`resetScriptCache()` between tests, because its cache is module-level and not keyed by chat.

Reproducers (a switch of selection during an await, unless stated):
1. A trigger's `v2SetVar` whose value is `{{getvar::src}}`, after an awaiting effect, writes the
   origin chat's `src`.
2. `v2SetVar name = {{char}}` in a non-group character's trigger, after a switch to another
   non-group character, writes the origin character's name.
3. A `#when` condition using `var`, and one using `vis`.
4. `{{user}}` and `{{persona}}` when the origin's chat and the new selection's chat bind
   different personas.
5. `{{lastmessage}}` and `{{previouscharchat}}` read the origin chat's messages.
6. `{{getglobalvar::k}}` reads the origin chat's per-chat override.
7. `{{calc::$x+1}}` and `{{? $x+1}}` read the origin chat's `x`; `v2Calculate` with an `@k` token
   reads the origin chat's override.
8. **Switched-selection differential (property).** Over random databases (characters, groups,
   chats with messages, variables, per-chat overrides, bound personas, modules, lorebooks and
   assets), parse a corpus of every tag in section 1 with the target T while the selection is
   S ≠ T, and require the same output as a parse with no target while the selection is T. Driven
   through a trigger's `v2SetVar` (a reproducer), with a direct-parse variant as a specification
   test. It catches any tag left unbound. Trigger parses pass `chatID` -1, so the tags that read
   the selection only when `chatID` is set (`previoususerchat`, `messagetime`, `messagedate`,
   `messageidleduration`, `role`'s message branch) are covered only by the direct-parse variant,
   which passes a `chatID`.
9. A group: a member's `triggerlua` calls `cbs("{{char}}")` after a switch of chat inside the
   group; the last-speaker lookup reads the origin chat. (`runTrigger`'s own parses pass the
   member as `chara` and never reach that lookup; the button and `/trigger` refuse groups, and
   `sendCharacterMessage`'s only caller calls it for characters only.)
10. Lua in a trigger, after an await inside the same call: `cbs("{{getvar::x}}")`,
    `getPersonaName`, `getPersonaDescription`, `getPersonaImageMain`, `getLoreBooksMain`,
    `getGlobalVar`, and `getCharacterImageMain` (asserting on the argument passed to `readImage`,
    since the harness's inlay id is a constant). `getCharacterLastMessage` on a chat with no
    `char` message reads the origin owner's `firstMessage`.
11. `getCharacterLastMessage` and `getUserLastMessage` after the origin's chat slot is replaced
    during the call's await read the replacement. A plain switch does not change the held object,
    so the plain-switch case is a guard.
12. Lua `loadLoreBooksMain` returns the origin's lorebook, and a `keep_activate_after_match` entry
    writes its flag to the origin chat, marked for save on the unselected character.
13. `editinput`: a Lua `setState` after a switch during the input trigger lands on the send's chat
    and marks it for save; a regex script's `{{getvar}}` reads it; a module enabled only in the
    send's chat has its `editinput` regex and its Lua `editInput` trigger applied, and one enabled
    only in the new selection's chat has neither.
14. Module selection: a run whose origin chat enables a module that the selection's chat does not
    runs that module's triggers.
15. R6 through Lua: the origin chat is deleted during an await, then `cbs("{{getvar::x}}")`
    returns the default chain's value, not the selection's.

Specification tests:
16. A direct parse with a gone target and with an ambiguous target reads no selection data and
    does not throw, including the group last-speaker lookup (R6).
17. Nested reads: `{{#when::{{getvar::x}}::is::1}}…{{/when}}`, `{{getvar}}` inside a function
    body, and `{{authornote}}`'s recursive parse (R5).
18. R7: resolutions per trigger run with many parses in one stretch; per parse that reads no
    per-chat data (zero); per `loadLoreBookV3Prompt` and per `loadLoreBooksMain` call against the
    number of active entries (one). The suite prints the counts.

Guards (pass before and after; labelled as guards):
19. R3: a parse with no target reads the selection.
20. R4: the same corpus as test 8, with the target equal to the selection and with no target,
    gives equal output, including groups and bound personas.
21. R8: a group run's `{{getvar}}` default comes from the group.
22. Display: `ParseMarkdown` of a message with `{{getvar}}` reads the selected chat.

Existing suites (`chatVar`, `cbs/conditionals`, `scriptings`, W1a's five) must pass unchanged.

## 8. Compatibility

- **Upstream cards, modules and presets:** R4 is the contract. With no switch, the target is the
  selection, so every tag's output is unchanged; test 20 checks it across the tag list.
- **Groups:** the target is the group and its chat, which is what the selection is at HEAD. `chara`
  is unchanged, so `{{char}}` in a member's trigger is still the member.
- **Plugins:** no plugin API changes. `parseRisuChat` builds its argument field by field and
  passes no target.
- **The save format:** unchanged.

## 9. Risks

- **An unbound read.** A tag that reads the selection and is missed keeps the bug for that tag.
  Test 8 catches any tag in its corpus mechanically. The corpus comes from a script over `cbs.ts`
  and `parser.svelte.ts`, and the Gate 2 reviewer re-runs the grep for `getSelectedCharID`,
  `getCurrentChat`, `getCurrentCharacter`, `selectedCharID`, `checkPersonaBinded`, the persona
  helpers, `getModules` and the chat-variable functions across the files in section 10.
- **A dropped target in a nested parse** (R5). Test 17.
- **A target leaking into display.** No display caller passes one; test 22.
- **The owner/runner choice** (R8). A reviewer may argue CBS should follow the runner, as W1a's
  `getVar` does. That would change a group's `{{getvar}}` defaults relative to upstream, which
  R4 forbids.
- **The lorebook snapshot** (section 2). A chat replaced during a scan loses that scan's flags.
  They are re-derived on the next match, and a scan never writes another chat.
- **Residual, accepted: an ambiguous origin on `editinput`.** The script and its regexes read the
  empty chat in section 2, while W1a's `sendCharacterMessage` appends the message to the chat
  object it holds. Two holders of one chat id is already a corrupt state; `MC-078` says never
  guess between them.
- **Known, harmless: defaults when the origin is gone.** Lua `getChatVar` keeps W1a's
  `defaultGetVarFor`, which takes the runner's held `defaultVariables`, while
  `cbs("{{getvar::x}}")` falls back to `templateDefaultVariables` alone. The two can disagree
  inside one call, but nothing is written in that state.
- **Until W2,** a `{{setvar}}` in a message and graph memory follow the selection during a send
  (`MC-095`).

## 10. Files expected

Production: `src/ts/parser/chatVar.svelte.ts`, `src/ts/cbs.ts`, `src/ts/parser/parser.svelte.ts`,
`src/ts/process/infunctions.ts`, `src/ts/util.ts`, `src/ts/process/modules.ts`,
`src/ts/process/lorebook.svelte.ts`, `src/ts/process/triggers.ts`, `src/ts/process/scriptings.ts`,
`src/ts/process/scripts.ts`, `src/ts/process/sendCharacterMessage.ts`.

Tests: new suites under `src/ts/process/tests/` or `src/ts/parser/tests/`.

## 11. Review

- Gate 1: `opus-reviewer` (the change touches the reactive database and per-chat persisted state).
- Build: `test-warrior` writes the reproducers against HEAD first; a separate `sonnet-coder`
  implements.
- Gate 2: `opus-reviewer`, with mutants in its scratchpad.
- Live check on a production build with Echo: a trigger reading `{{char}}` and `{{getvar}}` across
  a switch, and a Lua `loadLoreBooksMain` flag.

## 12. Gate record

### Gate 1 round 1 — `opus-reviewer` (fresh), rev 1 — **[REJECT]** (ledger row 266)

The reviewer accepted the design (the target is the origin's owner and chat, carried on
`matcherArg`; R8's split; no-target parses on HEAD's path) and confirmed the 344 trigger parses,
R5's recursion, the parser's synchronous memo, R4 in every no-switch case, R8 against HEAD, and
the plugin surface. The Orchestrator re-read each finding's source before answering.

- **F1 (major): `{{char}}` reads the selection first.** Section 1 now says so; reproducer 2 and
  the switched-selection differential (test 8), which catches any unbound tag, are added.
- **F2 (major): missing reads.** `{{? expr}}` (from `matcher()`), the Lua `getPersonaName` and
  `getPersonaImageMain` bindings with `getUserIcon`, the `editinput` path's module selection
  (`getModuleTriggers`, `getModuleRegexScripts`) and cache-key parse, and `v2Calculate`'s `@var`
  tokens. All added to sections 1 and 3, with tests 7, 10 and 13.
- **F3 (major): tests.** The harness must load the real persona helpers, modules, lorebook and
  `processScript`. `getUserLastMessage` and `getCharacterLastMessage` hold the chat object, so a
  plain switch is a guard; test 11 replaces the chat slot, and test 10 covers the `firstMessage`
  fallback. `getCharacterImageMain` asserts on `readImage`'s argument. The group last-speaker
  test goes through Lua `cbs` (test 9). Direct parses with `subject` are specification tests; R6
  is reproduced through Lua (test 15). Test 13 asserts the save mark and resets the script cache.
- **F4 (moderate): lorebook cost.** `loadLoreBookV3Prompt` now works on one snapshot taken at its
  entry (section 2, a stated exception to R1), and `loadLoreBooksMain` resolves once per call.
  R7 bounds both per call; section 6 and test 18 count them against the number of active
  entries.
- **F5 (minor): gone and ambiguous.** A gone owner leaves `templateDefaultVariables` alone as
  defaults; the group last-speaker lookup reads an empty chat instead of throwing; the ambiguous
  `editinput` case is a stated residual under `MC-078`.
- **Editorial:** `authornote`'s main path (E1), `{{char}}` (E2), only `getCharacterLastMessage`
  has a `firstMessage` fallback (E3), the start trigger is affected as well as the output
  trigger (E4), `#if` has no operators (E5), and section 6's cost claim (E6). All corrected.
- **Optional, taken:** "no module-level current target" is now R9; `getModules`' single-entry
  cache is noted in section 5. **Not taken:** a switch-to-Home variant, which `MC-075` 3 gives to
  W2.

### Gate 1 round 2 — the same `opus-reviewer` (reuse), rev 2 — **[EDITORIAL]** (ledger row 267)

Every round-1 finding was verified as fixed against source, and nothing new was found in design,
logic, data safety or tests. Six wording corrections, made in rev 2.1 and checked by the
Orchestrator:
1. Section 6: a run's parses can resolve in a stretch where W1a's run resolved nothing; the bound
   is W1a's T9 (k+1 resolutions for k awaits).
2. Section 2: at HEAD the lorebook flag writes go to the live selection, not to the held objects,
   so losing flags written to a replaced chat is new with W1b.
3. R1's exception now covers Lua `loadLoreBooksMain`'s per-book parses, and R7 counts one
   resolution per `loadLoreBooksMain` call including the `loadLoreBookV3Prompt` call inside it.
4. Section 7: the harness's `DBState` is a plain object under the node environment.
5. Test 9: `sendCharacterMessage` has no group check; its only caller calls it for characters
   only (`DefaultChatScreen.svelte`, re-read).
6. Section 1: "the most used tag" was unmeasured; now "a very common tag".

**Optional, all taken:** test 13 adds a module's Lua `editInput` trigger; section 9 notes that
with a gone origin, Lua `getChatVar` and `cbs("{{getvar}}")` can take different defaults (nothing
is written then); test 8 notes that the tags which read the selection only when `chatID` is set
are covered by its direct-parse variant alone.

### The build (tests first)

1. **The tests** (`test-warrior`, ~797k across three rounds):
   - The suites are `src/ts/process/tests/triggerOriginReads.svelte.test.ts`,
     `src/ts/process/tests/editInputOrigin.svelte.test.ts` and
     `src/ts/parser/tests/parserTarget.svelte.test.ts`, all LF.
   - The trigger and `editinput` suites run in the node environment with real Lua and mock DOMPurify
     as a passthrough. The parser suite runs in happy-dom with real DOMPurify.
   - The Orchestrator re-ran them at HEAD: **29 tests; 20 fail on behavioural assertions; 9 pass**
     (the guards, plus three specification tests that already hold: gone and ambiguous direct
     parses, and the two resolution bounds for a trigger run's stretch and for Lua
     `loadLoreBooksMain`).
   - The Orchestrator returned the first draft:
     - Titles and `describe`s stated HEAD's bug, which will be false after the fix.
     - Comments and titles carried plan ids and "HEAD".
     - The `processScript` specification test passed a subject where the plan gives an origin.
     - `{{role}}` could not differ in the direct-parse corpus.
     - The Lua `loadLoreBooksMain` count counted `runScripted`'s own closing resolution (its final
       `currentChatFor`), so a correct fix could read 2. It is now a three-run comparison: the
       call adds at most one resolution, and the same number for 1 book and for 5.

     All fixed; the history and id grep on the three files returns nothing.
   - **Known gap:** `{{messageidleduration}}` cannot differ in the direct-parse corpus at `chatID`
     1. Its scan starts at `chatID` and needs two user messages at or before it.
   - **Note for Gate 2:** a full trigger run always resolves at least once (`refreshSubject`), so
     "resolves nothing" is tested on direct parses only.
2. **The implementation** (a separate `sonnet-coder`, ~498k): eleven production files, CRLF kept.
   Before the gate the Orchestrator sent back seven comments that narrated history ("as before
   `subject` existed", "HEAD's") and a missing save mark on `setGlobalChatVar`'s override delete.
   Orchestrator checks on the pre-gate snapshot: the three suites 29/29; **138 files, 1657
   passed, 4 skipped, exit 0**; `pnpm check` clean; `pnpm run build` passes; history grep 0.

### Gate 2 round 1 — `opus-reviewer` (fresh) — **[REJECT]** (ledger row 268)

The production behaviour held on every scenario checked, and the rejection is for tests.
- **Re-proven:** at HEAD's sources (swapped in at load), 20 of the 29 fail on behaviour. The
  344 parse substitutions in `triggers.ts` are mechanical.
- **Differential:** every registered CBS name and alias (258) in six argument shapes, plus block,
  calc and nested snippets, over 60 seeded random databases, HEAD against the working tree.
  - R4: 0 differences in 273,424 parses with the target equal to the selection.
  - R3: differences appear only when no character is selected (F5).
- **Mutants:** 31 run. The survivors that matter were M02, M03, M07, M08, M14a/c/d/e, M15, M21
  and M26. Each was killed by a reviewer probe that passes on the working tree.
- **F1 (major, tests):** the one W1b write, the lorebook flag, had no test that could fail. The
  Lua `setState` already marked the origin, and the flag key was never inspected.
- **F2 (major, tests):** the two lorebook resolution bounds used entries that read no per-chat
  data, so a per-entry resolution passed.
- **F3 (moderate, tests):** the gone and ambiguous direct parses asserted only "does not throw",
  and passed at HEAD.
- **F4 (moderate, tests):** the group-default guard parsed with no subject, so its comment was
  false after the fix.
- **F5 (minor):** with no valid selection, some no-target parses differ from HEAD where HEAD
  threw. The Orchestrator ruled this an R3 exception (rev 2.2, section 4). No stored data moves.
  In round 2 the differential's differences were all the no-selection case (4,736 of 4,736), and a
  source probe found two more of the same kind (a missing chat at `chatPage`, for the selection and
  for a group `chara`); rev 2.3 widens R3 to cover them.
- **F6 (editorial):** four stale test comments and titles, and three false production comments:
  - `loadLoreBookV3Prompt`'s "finds no lore" (global module lore remains);
  - "resolved fresh on every call" (not true of the snapshot or the memo);
  - `getCharacterLastMessage`'s "never the held chat" (true only with an origin).
- **Residual rulings:**
  - `@@inject` and `@@repeat_back` are moot on this path (both need `chatID !== -1`, and
    `processScript` passes -1).
  - `runLuaButtonTrigger`'s module lookup runs before its first await, at the click's selection.
  - `tokenizeAccurate` is out of scope.
  - `setGlobalChatVar` and the other `GLGlobalVariables` subject branches are the API W2 will use,
    but have no caller with a subject yet. With a gone subject, `setGlobalChatVar` writes the
    database-wide global even when the origin chat had a local override. W2 must decide that.
  - The three-state persona argument is acceptable.
- **Remediation:** the test writer fixes F1-F4, the stale test comments and two optional
  reproducers (`#when toggle`/`tis`, `getLoreBooksMain`'s module lore). The coder fixes the three
  production comments only.

### Gate 2 round 2 — the same reviewer (reuse) — **[EDITORIAL]** (ledger row 269)

Every round-1 finding was verified fixed.
- **Production:** the diff since round 1 is comments only; the R4 differential still applies.
- **Suites:** 30/30 on the working tree. At HEAD's sources, 23 fail on behaviour and 7 pass; both
  gone/ambiguous specification tests now fail at HEAD.
- **Mutants:** every one that matters is killed, including M02, M03, M07, M08, M14a/c/d/e, M15,
  M21, M25 and M26.
- **Survivors, none consequential:**
  - M04b and M04c: the `{{persona}}`/`{{personality}}` recursive parses, whose fixtures hold no
    per-chat tag;
  - M16: `setGLChatVar`'s mark, on a path no caller reaches with a subject;
  - M17c: the cache-key parse.
- **The editorial item:** the differential classified all 4,736 R3 differences as the
  no-selection case. A source probe found two more of the same kind, where HEAD dereferenced a
  missing chat at `chatPage`: for the selected character, and for a group `chara` (where HEAD's
  whole parse threw). Rev 2.3 widens R3 to cover all three, and corrects the round-1 record.
  The Orchestrator closed the round after re-reading both. **Gate 2 passed.**
- **Orchestrator checks on the final snapshot:** 138 files, 1658 passed, 4 skipped, exit 0;
  `pnpm check` clean; history and id grep 0 over the `src` diff and the three test files.

### Live check — passed (ledger row 270)

- **Setup:** a production build (`VITE_RISU_LEGAL_CONFIGURED`) on the Node server (port 6001), in
  Claude in Chrome (a hidden window, driven by page scripts). The model was switched to Echo
  through the model picker before anything ran; no message was sent.
- **Seeding:** two characters made through the app's own New Character, LiveA (`$src` =
  `origin-src`, low-level access, an always-active lorebook entry with
  `@@keep_activate_after_match`) and LiveB (`$src` = `other-src`, its own lorebook), seeded
  through `getChar`/`setChar`.
- **Scenario 1, CBS in a v2 trigger:** LiveA's manual trigger `[v2Wait 6; v2SetVar copy =
  {{getvar::src}}; nm = {{char}}; last = {{lastmessage}}]`, clicked from LiveA's chat. During the
  wait LiveB was selected. LiveA's chat got `$copy` = `origin-src`, `$nm` = `LiveA` and `$last` =
  LiveA's last message; LiveB's `scriptstate` is unchanged.
- **Scenario 2, Lua reads and the lorebook flag:**
  - The trigger: `luacheck = async(function(id) sleep(id, 6000):await(); loadLoreBooks(id);
    setChatVar lorebooks, cbsread = cbs("{{getvar::src}}") end)`, with LiveB selected during the
    sleep.
  - The result: LiveA's chat got `$lorebooks` = `lore A body` (LiveA's lore, not LiveB's), the
    `$__internal_ka_` flag, and `$cbsread` = `origin-src`. LiveB is unchanged.
  - A first attempt wrote nothing. A global Lua function called directly is not a coroutine, so
    its `:await()` fails, and so does `:await()` inside `pcall` ("attempt to yield across a
    C-call boundary"). Wrapping the function in the Lua wrapper's `async` fixed it. This is
    Lua's own behaviour and is unrelated to W1b.
- **Saved:** `database/database.bin` was rewritten after the last run and contains every written
  value. No console errors.
- **Cleanup:**
  - The server was stopped by PID and the port confirmed closed.
  - `save/` was restored and verified by SHA-256 (6 files, 0 mismatches).
  - The two backups the check created were moved to the scratchpad.
  - Echo and "show unrecommended settings" are undone by the restore.
  - The Chrome tab on localhost:6001 is still open, behind the leave-site guard; the maintainer
    closes it.

### Commit-message fact-check — the Gate 2 reviewer (reuse) — **[EDITORIAL]** (ledger row 271)

- **Wrong:**
  - `v2Calculate`'s `$` variables already went through the run's `getVar`; only its `@` variables
    read the selection.
  - The persona helpers take the target's chat, not the target.
  - `/trigger`'s runs are now bound like any other run, so "the `/` commands" were not wholly
    unchanged.
- **Overstated:** "skips writes" (a gone target skips its per-chat writes); "a lorebook call adds
  one" (at most one).
- **Incomplete:** the cost of the `editinput` path.
- **Not disclosed:** with no origin, Lua `getLoreBooksMain` now takes chat lore from
  `currentChatFor` (the call's held chat) rather than the live selection. The Orchestrator
  re-read the binding and ruled it a read-only R3 exception (section 4), matching every other Lua
  chat binding without an origin since W1a.
- **Verified:** the test counts (23 fail at HEAD; the 7 that pass are five guards and two
  specifications) and the differential figures.
- **Applied:** all corrections, plus three optional ones.
