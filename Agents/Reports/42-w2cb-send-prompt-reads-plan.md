# Report 42 — W2c-b: the send's prompt parses and helpers read the send's chat

**STATUS:** plan rev 2.2, 2026-09-29. **Gate 1 passed:** round 1 [REJECT] on the test plan (ledger
row 384); rev 2 answered it and added `MC-117`; round 2 [EDITORIAL] (row 385), applied in rev 2.1.
Red tests (row 386), the fix (row 387, with a scope amendment for `CustomSidebar.svelte`, section 3),
Gate 2 round 1 [REJECT] on tests only (row 389), tests remediated, round 2 [APPROVE] (row 390).
**Gate 2 passed; live check passed** (row 391). Commit-message check (row 392): [EDITORIAL],
applied. Section 8 is the gate record.

W2c-a (Report 40, `79c6e35e`) bound the send's script pass, its Lua edit triggers and its lorebook
scan to the chat the send started in. W2c-b binds the rest of the prompt: the send's own parser
calls, `parseChatML`, the persona block, the module toggles and assets it records, the example
messages, the additional-info query and the memory summarizers' inputs. These read only; two of
them end up stored on the reply. W2c-b also makes a chat bound to the selected persona read that
persona as it is being edited (`MC-117`).

**Decisions this plan implements:**
- `MC-095` 2: W2 binds the send's parser calls under the send's one origin.
- `MC-110` 1, `MC-104` 1: the send's reads follow its writes; in a chat whose id has two holders
  they read the holder the send started from.
- `MC-116`: the persona block is gated on the persona of the send's own chat.
- `MC-117`: a chat bound to the currently selected persona reads its live values, in the send and
  on screen.
- `MC-113`: the prompt pass's index tags, look-backs over hidden messages and the script cache are
  W2c-c's. W2c-b does not change them.
- `MC-103` 3: Home, or a switch, during a send does not stop it.
- `MC-076`, Report 34 section 3: screen-bound callers (`Toggles.svelte`, the HypaV3 modal, the
  plugin API, the translator, triggers' own `parseChatML`) keep reading the selection.
- `MC-011`, `MC-089`: upstream data compatibility is the invariant; nothing ships between stages.
- `MC-091`: scope amendments for the memory summarizers and for `MC-117`'s screen reads
  (section 3).

## 1. What is wrong at HEAD

Evidence: ledger rows 382 (packet and scratch tests in the session scratchpad, `w2cb/`) and 384
(Gate 1 round 1, `w2cb/gate1/`). Lines are dated to `1d6fa16b`; `index` is
`src/ts/process/index.svelte.ts`.

Every site in items 1-10 reads the selection. The send can run with a stale selection from its
first line: the composer awaits its input trigger and `editinput` before `sendChat`, and group
turns 2..n, auto-continue, resend and auto-mode rounds all arrive with an origin (scoping packet
R-4, reproduced). So a switch or Home before or during a send puts the other chat's content into
this chat's request.

1. **36 `risuChatParser` calls in `sendChatBody` pass no subject** (the 37th, in
   `runCurrentChatFunction`, is bound). Main, jailbreak and global note; author note; description,
   personality, scenario, additional info; the four lorebook prompt parses; the persona block;
   the template cards in the tokenizing and build passes; the first message; each sent message's
   own text (`index:1319`); the group/`sendName` wrapper (`index:1406`, a string `chara`); depth
   prompts; bias entries; `pushPromptInfoBody` (no `chara`); `depth_prompt`; and, after the
   reply, the `igp` prompt (no `chara`). 33 of them pass `chara: currentChar`. After a switch to
   B, `{{char}}` is B's name (a non-group selection beats `chara`, `cbs.ts`),
   `{{user}}`/`{{persona}}` are B's persona, and per-chat tags read B's chat. At Home the parses
   with no `chara` give an empty `{{char}}` and the global user.
2. **`parseChatML` parses unbound** (`parser/chatML.ts`, `risuChatParser(v)`). The send reaches it
   for a `chatML` template card (tokenizing and build passes) and the `igp` prompt. The memory
   summarizers reach it when their summarization prompt starts with `<|im_start|>`:
   - supaMemory (`supaMemory.ts:256`, inside its own summarizer);
   - hypav2 (`summary()`, `hypav2.ts:39`, parse at 111, called from `hypaMemoryV2` at 494);
   - hypav3 (exported `summarize`, `hypav3.ts:1681`, parse at 1695, called from
     `hypaMemoryV3MainExp` at 405 and from `hypaMemoryV3Main` at 1151 and 1384; the HypaV3 modal
     calls it too).
3. **The persona block** takes its content from `getPersonaPrompt()` with no chat, so from the
   selection's bound persona. Its gate, `DBState.db.personaPrompt`, is the selected persona's
   editing buffer, which a chat switch does not touch; it is wrong on its own (`MC-116`), with or
   without a switch, and upstream has the same gate.
4. **`getModuleToggles()`** has no subject parameter; its result is recorded as
   `promptInfo.promptToggles` and **stored on the reply** when `promptInfoInsideChat` is on. After
   a switch A's reply records B's module toggles; at Home, none.
5. **`promptInfo.promptText`**, built from `pushPromptInfoBody` and the card parses, is **stored on
   the reply** with the selection's names and persona.
6. **`getModuleAssets()`** in the `{{asset_prompt::}}` replacement reads the selection's modules
   (the script pass's own call was bound in W2c-a).
7. **`exampleMessage`** parses its example dialogue with no subject; its `userName` parameter is
   never read.
8. **`additionalInformations`** labels user messages in its embedding query with `getUserName()`,
   the selection's persona, although it already receives the chat.
9. **`supaMemory`** labels user messages in the summarizer's input with `getUserName()`, although
   it already receives the chat. What it stores is the summarizer's output, so the wrong label
   reaches the stored summary only if the model repeats it.
10. **Two `getUserName()` calls are dead** (`exampleMessage`'s argument, and the user branch of
    the `name` computation in the per-message loop, whose `name` is never read). They read the
    selection for nothing; the second runs a persona lookup per user message.
11. **A chat bound to the selected persona reads a stale copy** (`MC-117`; upstream too). The
    selected persona is edited in a buffer (`db.username`, `db.userIcon`, `db.personaPrompt`,
    `db.userNote`) that Persona settings copies into `db.personas[selected]` only when it switches,
    reorders or deletes a persona (`saveUserPersona`, `persona.ts`), or sets a new avatar. `checkPersonaBinded` (`util.ts`) returns the saved
    entry, so `getUserName`, `getUserIcon` and `getPersonaPrompt` for such a chat, and the screen's
    own lookups (`CustomSidebar.svelte`, `DefaultChatScreen.svelte`), show the old values while it
    is edited. Under `MC-116`, clearing that persona's prompt would keep sending the old text.

No site in items 1-10 writes chat content. One read initialises state: `getChatVar` with a
subject does `scriptstate ??= {}` on the resolved chat (`chatVar.svelte.ts`), so after binding
that initialisation lands on the send's chat rather than the selection's.

**Absent a switch nothing in items 1-10 changes** (row 382, executed): 815 tags x `chatID`
{-1, 1} x `chara` given or omitted, parsed with and without a real `SendSubject`, selection on
the send's chat: 0 differences for a character send and for a group send (member as `chara`,
group as owner), apart from `{{random}}` sampling (finding 1, row 384). The helpers
(`getUserName(chat)`, `getPersonaPrompt(chat)`, `getModules(subject)`, `getModuleAssets(subject)`)
match too. A control with the selection on B differs on 6 of 8 probe tags. The intended changes
with no switch are `MC-116` and `MC-117`.

## 2. The design

**The send's prompt reads resolve through the send's `SendSubject`** (the `subject` W2a creates in
`enterSendChat` and W2c-a already passes to the script pass and lorebook). As in W1b and W2c-a:
- A read of the owner, its chat, its persona or its modules reads the subject's resolution,
  whatever the selection, including Home.
- **No fallback to the selection.** A subject that is gone reads an empty chat and the global
  persona (W1b R6). The send ends at its next origin check, as today.
- A persona helper that takes a chat gets `subject.resolve()?.chat ?? null`, resolved in the same
  synchronous statement as its use. It never gets `undefined`, which means "the selection".

Per site (the mechanism is non-normative; the invariants in section 4 are what counts):
- **The 36 parses** gain the subject. Each keeps its current `chara` exactly: the character or
  member where it passes one, the speaker-name string at the group wrapper, and **none** where it
  passes none (`pushPromptInfoBody`, the `igp` parse). Adding a `chara` there would change a
  group send's `{{char}}` from the group to the member. `chatID`, `role`, `cbsConditions` and
  every other option stay as they are (`MC-113`).
- **`parseChatML(data, subject?)`**: the optional subject goes to its parse, with no `chara`. The
  send's three calls pass it. Other callers (`triggers.ts`, `translator.ts`) are unchanged.
- **Persona (`MC-116`)**: one resolution and one `getPersonaPrompt(chat)` read give both the gate
  and the content: the block is added, with that text, when it is non-empty. For a chat with no
  bound persona (or a bound persona that no longer exists) that text is the global buffer, so the
  block is what it is at HEAD.
- **Live persona (`MC-117`)**: when the persona a chat is bound to is the currently selected one
  (the entry at `db.personas[db.selectedPersona]`, by identity or id; an out-of-range selected
  index means none is selected), its name, icon, prompt and note are the buffer's, each falling
  back to the entry's with `??` when the buffer field is undefined; every other field (`id`,
  `embeddedModule`, `largePortrait`) is the entry's. One shared function in `util.ts` applies this
  rule, and both the persona helpers (`getUserName`, `getUserIcon`, `getPersonaPrompt`) and
  `DefaultChatScreen.svelte`'s lookup call it, replacing the screen's own `db.personas.find`.
  `checkPersonaBinded` itself can stay raw for `modules.ts`, which needs only the entry's
  `embeddedModule` and id. A chat bound to another persona, and an unbound chat, are
  unchanged.
- **`getModuleToggles(subject?)`** passes the subject to `getModules`; the send passes it.
  `Toggles.svelte` is unchanged.
- **`getModuleAssets(subject)`** in the `{{asset_prompt::}}` replacement.
- **`exampleMessage(char, subject?)`** replaces the unread `userName` parameter; its parse gets the
  subject. One caller.
- **`additionalInformations`** and **`supaMemory`** call `getUserName(chat)` with the chat they
  already receive (`chats` and `room`): for the send, the holder resolved at its entry. A gone
  subject leaves that object's own bound persona in the label, never the selection's.
- **The summarizers**: the exported entry points (`supaMemory`, `hypaMemoryV2`, `hypaMemoryV3`)
  take an optional trailing subject. **Every internal hop takes it as a required parameter**
  (`RunSubject | undefined`): hypav2's `summary`, `hypaMemoryV3Main`, `hypaMemoryV3MainExp`, and
  an internal hypav3 summarizer that `Main` and `MainExp` call at all three of their call sites.
  hypav3's exported `summarize(messages, isResummarize?, subject?)` becomes a thin wrapper over
  that internal summarizer, for the HypaV3 modal, whose calls pass none and stay screen-bound.
  supaMemory's inner summarizer is a closure over the entry's parameters and needs no parameter
  of its own. A missed hop is then a type error, not a silent read of the selection. Type-only
  imports (`import type`) for `RunSubject` in `chatML.ts` and the memory files.
- **The dead reads go:** the `getUserName()` argument to `exampleMessage`, and the user branch of
  the unread `name` computation. The rest of that computation is left alone.

**Not changed:** the request layer, `templates/*`, tool calls, MCP, `nai.ts` (W2d); the
`globalChatVariables['toggle_*']` read next to `getModuleToggles` (db-level; packet B-5); the
script pass, Lua and lorebook (W2c-a); tags, look-backs, the script cache (W2c-c); when the buffer
is copied into the saved entry (`MC-117` changes what a bound chat reads, not the copy).

## 3. Scope

Production files: `index.svelte.ts`, `parser/chatML.ts`, `modules.ts` (`getModuleToggles`),
`exampleMessages.ts`, `embedding/addinfo.ts`, `memory/supaMemory.ts`, `memory/hypav2.ts`,
`memory/hypav3.ts`, `util.ts` (the persona helpers), `lib/ChatScreens/DefaultChatScreen.svelte`
(its persona lookup), `lib/SideBars/CustomSidebar.svelte` (its bound-persona name and note). Signature changes are additive optional parameters on exported functions,
and required parameters on internal ones; `exampleMessage`'s unread second parameter becomes the
subject (one caller).

**Scope amendments (`MC-091`):**
- **The memory summarizers.** The scoping (row 355) counted no parser reads in the memory systems;
  row 382 found them through `parseChatML`. Left out, a supaMemory, hypav2 or hypav3
  summarization with a chatML prompt reads the selection's names and persona into the summary
  request, and the summary it produces is stored in the chat (`supaMemoryData`, `hypaV2Data`,
  `hypaV3Data`). Same unbound helper; the smallest correction is the subject through the three
  memory entry points.
- **`MC-117`'s screen reads.** The maintainer decided the live persona applies on screen too.
  `DefaultChatScreen.svelte` looks the persona up itself and needs the same rule, or the chat's
  header and its prompt would disagree.
- **`CustomSidebar.svelte` (rev 2.2, found in the Orchestrator's review of the fix, row 387).**
  Rev 2.1 assumed the sidebar got the live rule through `checkPersonaBinded`, but the design lets
  `checkPersonaBinded` stay raw for `modules.ts`. Left as it was, the sidebar would show a chat
  bound to the selected persona with its saved name and note while the header and the prompt show
  the edited ones. It now applies `livePersona` to the persona it displays.

Comments this change makes false, at least: `checkPersonaBinded`'s header comment in `util.ts`,
and any doc comment on `parseChatML`, `exampleMessage`, `getModuleToggles`, `summarize` or the
memory entry points that describes their parameters.

## 4. Invariants

- **R1. The send's prompt reads the send's chat.** Every site in section 1 items 1-10 reads the
  send's owner, chat, persona and modules as its subject resolves them, whatever the selection,
  including Home: the model request's messages and `biasString`, the `igp` request, the
  summarizer requests, the embedding query, and the reply's `promptInfo` (`promptToggles`,
  `promptText`).
- **R2. No switch, no change.** With the selection on the send's chat throughout, every output in
  R1 equals HEAD's, character and group sends, with and without a prompt template (including a
  `chatML` card) and with each memory system on, **except**:
  - `MC-116`: a chat bound to a persona other than the selected one, with a prompt, now sends it
    when the global buffer is empty; a chat bound to a persona other than the selected one, with
    an empty prompt, no longer sends a template persona card's bare format when the global buffer
    is non-empty (in plain mode HEAD's empty block is already dropped);
  - `MC-117`: a chat bound to the selected persona sends the buffer's name and prompt where they
    differ from its saved entry (with the buffer's prompt empty it sends no block, as at HEAD).
  A chat with no bound persona sends exactly what it does at HEAD.
- **R3. Never the selection.** A gone subject reads an empty chat and the global persona at every
  site that resolves; `additionalInformations` and `supaMemory` keep the chat object they were
  given. No site throws, and none reads the selection.
- **R4. A duplicated-id chat** reads the holder the send started from (`MC-110` 1), at the prompt
  sites and at the memory sites.
- **R5. Cost.** An undisturbed send makes no more full origin resolutions than at HEAD (the fast
  path is uncounted). No site adds a full scan per message.
- **R6. Other callers are unchanged:** `Toggles.svelte`, the HypaV3 modal's `summarize`, the
  plugin API's `processScriptFull`, `triggers.ts` and `translator.ts`'s `parseChatML`, display.
- **R7. `MC-113` untouched:** every parse keeps the options it has at HEAD (`chara`, `chatID`,
  `role`, `cbsConditions`, and the rest), with only `subject` added; the script cache's keys are
  unchanged.
- **R8. `MC-117`.** For a chat bound to the selected persona, the persona helpers and the chat
  screen report the buffer's name, icon, prompt and note, and follow an edit at once; clearing
  the prompt stops the send's persona block. A chat bound to another persona reads that
  persona's saved entry, as at HEAD.

## 5. Tests (written before the fix; red at HEAD unless marked guard)

**Send harness** (row 382, section 7): the node header of `sendChatScriptsOrigin` with four more
modules real (`parser/chatML`, `exampleMessages`, `embedding/addinfo`, `memory/supaMemory`); the
`requestChatData` mock as the capture point, by mode (`model`, `memory`, `emotion`); the reply's
`promptInfo` and the chat's memory data; the embedding query from the `HypaProcesser` mock. The
selection is stale from the start (origin on A, selection on B or Home), which covers the entry
stretch without a mid-send hook; at least one reproducer switches mid-send. hypav2 and hypav3
stay mocked here, and their mocks record the subject argument.

- **Reproducers (stale selection B, and Home), one per class:** each parse class in section 1
  item 1, with `{{char}}`, `{{user}}` and per-chat tag markers; a `chatML` template card, in both
  passes, with `{{user}}` in it; the `igp` prompt; the persona content; `promptToggles` and
  `promptText` on the reply; `{{asset_prompt::}}`; example messages; the embedding query; the
  supaMemory summarizer input, plain and with a chatML prompt; a group send; the send passing its
  subject to `hypaMemoryV2` and `hypaMemoryV3` (the recording mocks).
- **Memory-level reproducers** (a direct test per system, selection on B, subject on A, chatML
  summarization prompt with `{{user}}`/`{{char}}`): hypav3 through `hypaMemoryV3` reaching its
  internal summarizer, plus the exported `summarize(messages, false, subject)`; hypav2 through
  `hypaMemoryV2` with a small fixture (row 385 reached `summary` with 10 chats, a tokenizer mock
  of 50 per chat, `maxContext` 200, `chunkSize` 100, `supaModelType: 'subModel'`); each also with
  a duplicated id (R4).
- **`MC-116`** (every fixture binds the chat to a persona **other than the selected one**, and
  fixes the buffer's content): reproducers: a bound persona with a prompt, buffer empty, sends the
  block; a bound persona with an empty prompt, buffer non-empty, with a template `persona` card,
  sends no card. Guards: the same empty-prompt case in plain mode (no block at HEAD either); an
  unbound chat sends the buffer's prompt; a bound persona with a prompt, buffer non-empty, sends
  the bound prompt.
- **`MC-116` with `MC-117`** (guard): a chat bound to the selected persona, saved entry's prompt
  non-empty, buffer's prompt empty, sends no block. HEAD sends none either (its gate is the
  buffer); the guard fails an implementation of `MC-116` that reads the saved entry.
- **`MC-117`:** reproducers: a chat bound to the selected persona, after an edit to the buffer,
  sends the edited prompt and name, and `getUserName`/`getUserIcon`/`getPersonaPrompt` for it
  return the buffer's. The shared `util.ts` rule is tested directly for the screen's values
  (name, icon, portrait flag). Guards: after the buffer's prompt is cleared, no persona block
  (HEAD's gate gives the same); a chat bound to another persona reads its saved entry; an unbound
  chat reads the buffer, as at HEAD; an out-of-range selected index reads the saved entry.
- **Completeness and R7 guard (behavioural):** wrap the parser that `index` and
  `exampleMessages` import, and the one `chatML.ts` imports; run the character, group,
  template-with-chatML, `igp`, asset-prompt and supaMemory sends; every top-level parse call
  carries the send's subject, and each call's option keys are HEAD's plus `subject`. The HEAD key
  sets are recorded from a run at HEAD.
- **Other guards:**
  - R2 as a control run per variant (selection on the send's chat) against fixed expected
    strings.
  - The parser-level corpus differential through a real `SendSubject` (character and group),
    with `Math.random` stubbed by a counter reset before each side and the clock frozen
    (`vi.useFakeTimers`, `setSystemTime`). The test must pass ten reruns in a row.
  - R3 with a gone subject; R4 with a duplicated id; R5 with `resolutionCountForTests` around an
    undisturbed send, also once under the proxied (happy-dom) header; R6 for `getModuleToggles()`
    and `summarize()` with no subject.

## 6. Risks

- **Adding a `chara`** where a parse has none changes a group's `{{char}}` (R2). The completeness
  guard's option-key check catches it.
- **Passing `undefined`** to a persona helper reads the selection. Pass `?? null`.
- **A missed hop in the memory functions** would read the selection silently; required internal
  parameters, including hypav3's internal summarizer, make it a type error. The exported
  `summarize` stays optional, so only the HypaV3 modal may call it.
- **Existing suites mock `parseChatML` to return `[]`** and mock the helpers as `vi.fn`; no test
  asserts their arguments, so additive parameters are safe, but those suites cannot see these
  reads. The new suites unmock them.
- **`MC-116` and `MC-117` change prompts for upstream chats with no switch,** in the cases in R2.
  Maintainer-approved; the commit message says so.
- **`MC-117` touches the persona helpers shared with the screen.** A helper that returns a merged
  object must keep every field callers read (`id`, `embeddedModule`, `largePortrait`, `note`);
  `modules.ts` reads `embeddedModule` through it.
- **A missed site.** Besides the behavioural guard, the reviewer re-runs the counts and greps the
  send and its helpers for `getUserName()`, `getPersonaPrompt()`, `getModules()`,
  `getModuleAssets()`, `getModuleToggles()` and `parseChatML(` with no subject.

## 7. Compatibility

No data format changes. Characters, modules, presets, backups and plugins load as before; nothing
new is saved. Absent a switch, every prompt built from upstream data is identical to HEAD's except
the `MC-116` and `MC-117` persona cases in R2. Plugin-facing and screen-bound helpers keep their
behaviour, apart from `MC-117`'s live values for a chat bound to the selected persona: every caller
of `getUserName`, `getUserIcon` and `getPersonaPrompt` sees them, which includes the Lua bindings
that return the user's name or persona, `{{user}}`/`{{persona}}` wherever they are parsed, the chat
screen's user name and icon, bookmarks, suggestions, chat exports (`characters.ts`), and the request
layer's user-name reads (`stringlize.ts`, `nai.ts`, `templates/chatTemplate.ts`, which W2d binds). The plugin API does not call these helpers; its raw
`getDatabase` view is unchanged.

## 8. Gate record

**Gate 1 round 1 (ledger row 384; fresh `adversarial-reviewer`): [REJECT] on the test plan; the
design held.** Counts, bare-call greps and the upstream gate re-verified; no missed site. Findings
and their disposition in rev 2:
1. The corpus-differential guard was flaky (a double run does not filter `{{random}}`; 5 of 6
   reruns failed): `Math.random` stubbed and the clock frozen; ten green reruns required.
2. The plain empty-prompt persona case is green at HEAD: relabelled a guard; the template card
   case stays a reproducer.
3. hypav2/hypav3 were not reachable from the send harness, and hypav3 has three `summarize` calls
   in two internal functions: required internal parameters; memory-level tests; recording mocks
   in the send harness.
4. R7 and completeness rested on a grep: a behavioural parser spy with option-key comparison.
5. A chat bound to the selected persona reads a stale saved copy, and under `MC-116` clearing its
   prompt would keep sending it: to the maintainer, `MC-117` (read the live persona), added to
   scope, R2 and R8.
6. R3's wording vs `additionalInformations`/`supaMemory`: restated as "never the selection"; the
   persona gate and content share one read.
7. "No site writes chat state": corrected (`getChatVar`'s `scriptstate ??=`).
Non-blocking, taken: `{{user}}` in a chatML card; R4 at the memory sites; `import type`; R5 under
the proxied header.

**Gate 1 round 2 (ledger row 385; the same reviewer): [EDITORIAL], applied in rev 2.1.** Every
round-1 finding closed; `MC-117`'s design held (every bound-persona reader enumerated; no caller
writes through or compares the returned object; `embeddedModule` survives). Memory-level tests
executed as feasible, and the corpus's only nondeterminism is `Math.random` and `Date`.
Corrections:
1. "A missed hop is a type error" was false for hypav3's three `summarize` calls: an internal
   summarizer with a required subject; the exported one wraps it.
2. R2's `MC-116` exceptions now name a persona other than the selected one and the buffer's
   state; `MC-117`'s notes that a cleared buffer prompt sends no block, as at HEAD.
3. `MC-116` test fixtures bind to a persona other than the selected one and fix the buffer; one
   interaction guard with `MC-117` added (green at HEAD, whose gate is the buffer; it fails an
   `MC-116` that reads the saved entry). The Orchestrator also relabelled rev 2's `MC-117`
   cleared-prompt reproducer as a guard, for the same reason.
4. "modules, portrait flag" corrected to `embeddedModule`, `largePortrait`.
Suggestions taken: one shared `util.ts` rule for the helpers and the screen; `checkPersonaBinded`
stays raw for `modules.ts`; the selected persona by identity or id, with an out-of-range guard,
and `??` fallback.

**Red tests (ledger row 386).** Five new suites; 138 reproducers red at HEAD, all on assertions, 44
guards green, 6 acceptance tests pending. The proxied suite's cost guard was first built on raw
fixtures, so its hint never matched the proxies and it reported 10 + M full resolutions at HEAD; the
Orchestrator caught it, and with objects read back through `DBState` HEAD makes 1, the bound.

**The fix (row 387).** Eleven production files. The coder stopped on 14 red tests whose fixture bound
chat A to the selected persona (a buffer read under `MC-117`); the fixture now selects a third
persona. The Orchestrator's review found the `CustomSidebar.svelte` gap (section 3). Pre-gate:
`pnpm test` 177 files, 2676 passed, 4 skipped; `pnpm check` clean; the build passes.

**Gate 2 round 1 (row 389; fresh `adversarial-reviewer`): [REJECT], on tests only.** No behavioural
defect in the production diff; about 80 mutants killed. Findings from the survivors: the persona
block's `?? null` under a gone subject; two parse sites the completeness guard never reached (the
author note's default text, the memory card); hypav3's similarity-step summarizer site never
reached, hidden by a `.catch`; the modal's `summarize(…, true)`; `??` against `''` for the live name,
icon and note; supaMemory's oversized-chat label; an overclaiming title; mixed line endings.
Remediated by the test writer: every named mutant killed; 210 of 210 on the fix, 160 red and 50
green against HEAD's production files; `pnpm test` 177 files, 2696 passed, 4 skipped.

**Gate 2 round 2 (row 390; the same reviewer): [APPROVE].** The production diff byte-identical to
round 1's; 210 of 210 on the fix; 160 red and 50 green against HEAD's production files, every
passer a guard; all 37 drop-subject mutants and every round-1 survivor killed, except one mutant
equivalent for reachable inputs and the two component-wiring reverts (covered through the shared
rule only, as Gate 1 accepted). Two editorial nits in test comments, applied by the Orchestrator.

**Live check (row 391): passed**, on a production build with Echo. A chat bound to the selected
persona showed the edited name at once, in its messages and in the chat screen's user label, while
the saved entry kept the old one. The prompt preview showed the send's persona, the live persona
prompt, no block once it was cleared, and (`MC-116`) the bound persona's prompt while the selected
persona's was empty. Not exercised: the custom sidebar (not shown by default), and a stale selection
at prompt time (covered by the suites).

**Commit-message check (row 392; the Gate 2 reviewer): [EDITORIAL], applied.** Corrected: the
acceptance tests that fail only on the missing export (seven direct tests of `livePersona`; the note
field has no behavioural reproducer); `summarize` gains an optional parameter; when the persona
buffer is copied into its entry (also here, in `MC-117` and in `livePersona`'s doc comment); the
IGP request's name; what a gone chat reads at the two label sites; one guard that is a reproducer;
"at most one" full resolution; and three records claims.
