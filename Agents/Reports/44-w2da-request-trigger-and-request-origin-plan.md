# Report 44 — W2d-a: the `request` trigger and the request's origin

**STATUS:** plan rev 4.1, 2026-09-29. **Gate 1 passed:** rounds 1 to 3 [REJECT] (rows 405-407);
escalated to `senior-advisor` (row 408); every test row executed at HEAD (row 409); round 4
[EDITORIAL] (row 410), applied in rev 4.1. Red tests in the repo (row 411), the fix (row 412).
**Gate 2:** round 1 [APPROVE] with optional findings (row 413); three taken and verified,
[APPROVE] (row 414). **Live check passed** (row 415). Commit-message check (row 416). **Committed** as `4c34172c`, records the commit after it. Built from the
W2d scoping packet (ledger row 404, scratchpad `w2d/packet.md`) and the maintainer's answer recorded
as `MC-121`. Section 8 is the gate record.

W2a to W2c bound what the send writes and what its prompt reads to the chat the send started in.
The request layer still reads the selection:
- `requestChatData` runs the selected character's `request` trigger over whatever prompt it was
  given;
- the text-completion providers label and parse the prompt with the selected character's name and
  the selected chat's persona name.

W2d-a gives a request an optional subject and makes all of these follow it. The send's own requests
and every trigger-run model call pass one.

W2d-b (a later report) binds the tool path: `getTools`/`initializeMCPs`, the six `callTool` sites,
graph memory, `risuaccess` with no `id`, and `aiaccess`. W2d-a puts the subject on the request's
argument, where W2d-b reads it; W2d-a does not change which tools a request gets.

**Decisions this plan implements:**
- `MC-095` 2, `MC-103` (W2d's scope and its default: only the send's own requests bind the
  `request` trigger; callers with no origin keep following the selection).
- `MC-121`: a trigger run's model calls (the v2 `runLLM` effects, Lua's `LLM`, `simpleLLM`,
  `axLLM`) follow the run's own origin; in a chat whose id has two holders the run's own reads and
  writes keep `MC-078`.
- `MC-110` 2: a send's trigger runs choose and read under `MC-078` in a chat whose id has two
  holders. The `request` trigger is a trigger run and follows it, as the send's start and output
  triggers do (Report 35).
- `MC-110` 1, `MC-104` 1: the send's other reads (here, the names in the prompt) follow its writes,
  including the tie-break to the object the send started from.
- `MC-103` 3: Home during a send does not stop it.
- `MC-075` 2: a unit whose origin is gone does nothing more to it.
- `MC-076`: plugin-facing "current" helpers stay bound to the selection; no switch lock.
- Report 23 section 6: no module-level "current send" holder; the subject travels explicitly.
- `MC-011`, `MC-089`: upstream data compatibility is the invariant; nothing ships between stages.

## 1. What is wrong at HEAD

Evidence: ledger rows 404 and 405 (the round-1 reviewer ran the real `request.ts`, `triggers.ts` and
`modules.ts` at `1e8c64f1`); the Orchestrator re-read the cited code.

- **The `request` trigger follows the selection** (CHORE-27). Inside `requestChatData`'s retry
  loop, after `await getTools()` and the `replacerbeforeRequest` awaits, the block reads
  `getCurrentCharacter()` and `getCurrentChat()` and runs `runTrigger(char, 'request',
  {chat, displayMode: true, displayData})`. It is re-run on every retry and fallback model.
  - `runTrigger`'s display/request argument type is `origin?: undefined`, so the run has no
    subject: its module trigger list (`getModuleTriggers(null)`) and every CBS parse in it read the
    selection too. Handing it the send's character alone would not bind it.
  - The run writes nothing persistent: `requestAllowList` admits only request-state effects and
    pure logic, `setVar` in a display run writes the run-local `tempVars`, and `markWrite` is the
    only save mark in `runTrigger` (ledger rows 256, 405).
- **What a user can reach mid-send** (`changeChar` refuses while `doingChat` is set):
  - **Home:** `runTrigger(undefined, …)` throws on `char.lowLevelAccess` and the block's `catch`
    swallows it, so the send's `request` trigger is silently not applied (executed, row 405).
  - **A chat switch within the same character** (`changeChatTo` has no guard): the trigger runs,
    but its variables, `exists`/`chatindex` conditions and chat-level module triggers read the other
    chat (executed: the rewrite used the other chat's variable).
  - **Another character or a group:** only through the cold-character restore race in `changeChar`
    or the Playground character. Another character's `request` trigger rewrites the prompt
    (executed); a group stops the send's own trigger.
  - **A group send while a character is selected** runs that character's trigger over the group
    turn's prompt.
  - **A retry or fallback after any of these** runs the next attempt's trigger from the new
    selection.
- **The providers' names** read the selection:
  - the five `getCurrentCharacter()?.name` reads in `requestNovelAI`, `requestOobaLegacy`,
    `requestNovelList`, `requestHorde` and `requestWebLLM` (prompt stringification and reply
    parsing);
  - `applyChatTemplate` (`templates/chatTemplate.ts`) reads `getCurrentCharacter().name` with no
    optional chaining for `risu_char`, and `getUserName()` for `risu_user`. Its request-path
    callers are `requestOobaLegacy`, `requestOoba`, the Kobold path, `requestHorde`,
    `requestWebLLM` and the OpenAI-compatible instruct path. **At Home it throws**, so a send on
    those models fails with a `TypeError` (executed with WebLLM, row 405), contrary to `MC-103` 3;
  - `getUserName()` with no chat (the selected chat's bound persona) in `stringlize.ts`'s
    stringifiers and in `getUnstringlizerChunks`, which `unstringlizeChat` and `unstringlizeAIN`
    call, and in `models/nai.ts`. The reply parsers reach it from NovelAI, Ooba legacy, NovelList,
    Horde, WebLLM and `requestOllama`'s non-streaming path (row 406);
  - `risuChatParser` with no options over `db.localStopStrings` in `requestOobaLegacy` and
    `requestOoba`.
  In a group send the character name is the group's (the selected group), not the member's.
- **Trigger-run model calls** (`triggers.ts`'s two `runLLM` effects; `scriptings.ts`'s `LLM`,
  `simpleLLM`, `axLLM`) already run under the run's origin, but their `requestChatData` calls
  carry nothing, so everything above follows the selection (`MC-121`).
- When a character has no triggers, `runTrigger` returns `null` and the block throws on
  `d.displayData`, logging an error on every request. Harmless but noisy; folded in (2.2).
- The request trigger re-applies to the already-rewritten prompt on each retry of one model (only a
  fallback model resets it). Upstream behaviour; kept.

## 2. The design

The mechanism below is non-normative; the invariants in section 4 are what must hold.

### 2.1 A request may carry a subject

`requestChatData`'s argument gains an optional `subject` (a `RunSubject`; a `SendSubject` is one).
It rides on the argument object, which reaches every provider function unchanged. It is never
cloned (only `arg.formated` and the fallback list are) and never handed to a plugin provider or
plugin callback: the plugin-provider branch builds its own argument list, and the plugin API's
`runLLMModel` builds a fresh one. A request with no subject behaves as at HEAD, except for the two
throws folded in below.

### 2.2 The `request` trigger runs under the request's origin, as a trigger run

With a subject, each attempt, at the point where HEAD reads the selection, runs the trigger as the
send's start and output triggers run: under a plain origin, the subject's `chaId` and `chatId`
(without a group member). `runTrigger`'s request argument accepts that origin; the run builds its
own `RunSubject` from it, so its character's trigger list, module triggers, chat, variables,
conditions and CBS parses all read that chat.
- **Resolves to a character:** that character's `request` trigger runs over the prompt. The owner
  is resolved and `runTrigger` called in one synchronous stretch.
- **Resolves to a group:** skipped, as HEAD skips a selected group.
- **Gone, or held by two chats** (`MC-110` 2, `MC-078`): skipped; the prompt goes out as built. In a
  chat whose id has two holders this differs from HEAD, which runs the selected holder's trigger;
  it is the same rule the send's start and output triggers follow there.
- **A run that finds no trigger** leaves the prompt unchanged without logging an error. The request
  block handles it; `runTrigger` keeps returning `null` for "no triggers", which the send's start
  and output callers branch on.

Such a run still writes nothing persistent and marks nothing for save: the allowlist and `setVar`'s
display branch are unchanged. Display runs from the chat screen keep passing no origin.

Without a subject the block reads the selection as now, including the Home and group skips.

### 2.3 The names in the prompt follow the send

With a subject, a request's text-completion formatting takes, when it runs:
- the **character name** from the subject's owner (a character's name for a character send; the
  group's name for a group send, as HEAD gives it); `''` when the subject does not resolve;
- the **user name** from `getUserName(chat)` on the subject's chat (its bound persona, as W2c-b's
  prompt uses); the database user name when the subject does not resolve;
- the **local stop strings** parsed with the subject.

`requestOllama` keeps `arg.currentChar`'s name (the member in a group turn) for its reply parse;
only the user name in that parse follows the subject.

An unresolved subject's chat is `undefined`, and `getUserName(undefined)` reads the selection, so
the implementation passes `null` for it (as `getModules` and `cbs.ts`'s persona argument do);
`getUserName(null)` gives the database user name.

These are the send's reads (`MC-110` 1), so a `SendSubject` resolves them with its tie-break. They
reach `applyChatTemplate`, the `stringlize.ts` functions and `stringlizeNAIChat` as explicit
optional arguments; a caller that passes none (DevTool's template preview, other callers) reads the
selection as now.

`applyChatTemplate` no longer throws when no character is selected: `risu_char` is `''`, matching
the other providers at Home. This also covers a no-subject request at Home.

### 2.4 Who passes a subject

- **The send** (`sendChatBody`, its `subject`): the main reply, the image-prompt request and the
  emotion request; `stableDiff` gains a parameter for its one caller; `hypaMemoryV2`'s `summary`,
  `hypaMemoryV3`'s summariser (whose subject is optional; the HypaV3 modal passes none) and
  `supaMemory` pass the subject they already hold.
- **Trigger runs** (`MC-121`): `runTrigger`'s two `runLLM` effects pass the run's subject; Lua's
  `LLM`, `simpleLLM` and `axLLM` pass the subject of the script's origin
  (`ScriptingEngineState.subject`) when it has one. A Lua button trigger called with no origin
  passes none. (Lua edit triggers run without low-level access, so they make no model calls.)
- **Everyone else passes none:** the translator, Suggestion, the Playground, IrisModal, `aiaccess`
  (W2d-b decides its nested request) and plugin callers.

## 3. Scope

**Production files (expected):** `src/ts/process/request/request.ts` (argument type, the trigger
block, the provider name reads, the stop strings), `src/ts/process/triggers.ts` (the request
argument type, the two `runLLM` calls), `src/ts/process/scriptings.ts` (three model calls),
`src/ts/process/templates/chatTemplate.ts`, `src/ts/process/stringlize.ts`,
`src/ts/process/models/nai.ts`, `src/ts/process/request/openAI/requests.ts` (the instruct path's
template call), `src/ts/process/index.svelte.ts` (three requests and the `stableDiff` call),
`src/ts/process/stableDiff.ts`, `src/ts/process/memory/hypav2.ts`, `hypav3.ts`, `supaMemory.ts`.
Estimated 100 to 150 production lines.

**Scope amendment (`MC-091`):** `applyChatTemplate`, `stringlize.ts` (including the unstringifier
chunks `requestOllama` reaches), `nai.ts` and the stop strings were not in rev 1. They are the same selection reads on the same request, found by Gate 1; leaving
them would keep a send at Home failing on six text-completion paths (`MC-103` 3) and would label
a bound request with another chat's persona. The correction is one optional argument per function.

**Out:** the tool path, graph memory, `risuaccess`, `aiaccess` (W2d-b); the retry re-application
(upstream); which tools a request gets; `requestChatData`'s callers outside the send and trigger
runs; the image-prompt block appending the request result object instead of its text (HEAD,
unrelated; see section 6); `/` commands (W3).

## 4. Invariants

1. **A request with a subject never reads the selection** for its `request` trigger (which
   character's, which module triggers, which chat, which variables, which CBS reads) or for the
   character name, user name and stop strings in its formatting. Proven after Home, a chat switch
   within the character, a switch to another character, and a switch to a group, each between the
   request's start and the point of use.
2. **Each attempt resolves afresh.** A retry or fallback after a switch uses the subject's trigger,
   not the selection's.
3. **A request with no subject reads the selection**, as at HEAD, including the Home and group
   skips and the group name. It changes only in that it no longer throws at Home (the template)
   or logs an error when no trigger exists.
4. **The request run writes nothing persistent and marks nothing for save**, with or without a
   subject: no `scriptstate` change in any chat, no save mark.
5. **Gone:** a subject that no longer resolves skips the trigger (the prompt is sent as built),
   gives `''` as the character name and the database user name. Nothing of another chat or
   character is used instead.
6. **Duplicate chat id:** the `request` trigger of a send, or of a trigger-run model call, whose
   chat id has two holders is skipped, even with nothing switched. The names of such a send come
   from the holder it started from. Inside a send, a trigger-run model call never reaches a
   duplicated-id chat's request (the start and output runs stop first; edit triggers make no model
   calls); only a Lua button trigger reaches it.
7. **A group send** skips the `request` trigger and uses the group's name, whatever is selected.
8. **The subject never crosses a clone or the plugin bridge:** the plugin provider argument and
   every structured clone of request data are unchanged.
9. **A trigger-run model call** runs the `request` trigger of the run's own chat and uses its
   names; a run with no origin follows the selection; a group-owned run's call skips the trigger.
10. **A send at Home does not fail** on any text-completion provider.

## 5. Tests (written before the fix; red at HEAD unless marked guard)

Every row below was executed at HEAD `1e8c64f1` (ledger row 409): the red rows fail on the value
named, every guard passes, and no red is a setup or import failure (each file has passing
preconditions in the same setup). 122 tests: 82 red, 40 guards. They live in the scratchpad
(`w2d/redrun/`) and move into `src/ts/process/tests/` with their import paths changed and the
`json.lua` path made repo-relative; they pass the new `subject` field and `stableDiff`'s new
argument through casts, and are not yet type-checked or run from `src/`. The
annex below is non-normative. A row that cannot be kept red on its named value is re-specified in
the test stage and recorded in this report.

**Acceptance scenarios.** "Expected" is the value after the fix.

| # | Scenario | At HEAD (executed) | Expected |
|---|---|---|---|
| T1 | A character send with a `request` trigger; a switch to Home before the trigger | the prompt is not rewritten | A's rewrite |
| T2 | same; a switch to A's other chat, whose variable differs | the other chat's variable | A's chat's |
| T3 | same; a switch to character B, which has its own `request` trigger | B's rewrite | A's |
| T4 | same; a switch to a group | A's trigger does not run | A's rewrite |
| T5 | a chat-level module trigger only in the other chat | it runs over A's prompt | it does not |
| T5p | a module embedded in the persona bound to the other chat | its trigger runs | the persona of A's chat decides |
| T6, T6f | the provider fails once, or a fallback model is used; the switch comes between attempts | the second attempt uses B's trigger | A's |
| T8 | the send's chat removed before the trigger, the character still selected | the trigger runs on the other chat | skipped |
| T9 | the send's chat id held by two chats, sent from the second, nothing switched | the selected holder's rewrite | skipped |
| T10a | a v2 `runLLM` or legacy `runLLM` effect in a run on chat A, the selection on B | B's trigger | A's |
| T10b | Lua `LLM`, `simpleLLM`, `axLLM` in a run on chat A, and a button trigger with an origin | B's trigger | A's |
| T10c | a Lua button trigger in a chat whose id has two holders, the selection on the first | the selected holder's rewrite | the model is called once, unrewritten |
| T10d | a model call in a group's trigger run, a character selected | the character's trigger | skipped |
| T11 | the real send: the main, image-prompt and emotion requests | no subject | the send's subject |
| T11d | the send's `stableDiff` call (asserted as its third argument, the non-normative mechanism) | no subject argument | the send's subject |
| T11m, T11s | `hypaMemoryV2`, `hypaMemoryV3` (standard, experimental, `summarize`), `supaMemory` and `stableDiff` given a subject | their request has none | it has that subject |
| T14 | a group send, a character with a `request` trigger selected | the character's trigger runs | skipped |
| T15 | a gone subject, a sentinel character selected, a template provider | the sentinel's names | `''` and the database user name |
| S | **the sweep:** ten provider paths (NovelAI, NovelList, Ooba legacy, Ooba, Kobold, Horde, WebLLM, Ollama non-streaming, the OpenAI-compatible instruct path, one chat-format control) x {Home, a poisoned selection}; the poisoned selection is a sentinel character with a sentinel persona, a `request` trigger and module triggers that inject markers, stop strings with `{{char}}`/`{{user}}` and a jinja template with `risu_char`/`risu_user` | at Home, six paths reject with a `TypeError`; poisoned, every payload carries the sentinel's markers and names | the payload has A's trigger, A's names, no sentinel; nothing rejects |
| S-parse | the reply parse on the same paths | the sentinel persona's name | A's |
| T19 | a request with no subject at Home on a template provider | rejects with a `TypeError` | `risu_char` is `''` |
| G1 | guard: no subject; the selection's trigger, the group skip, the template names | — | as HEAD |
| G2 | guard: a request-mode run under a plain origin changes no `scriptstate` and marks nothing | — | as HEAD |
| G3 | guard: a group send with the group selected | — | as HEAD |
| G4 | guard: the plugin-provider argument has no subject | — | as HEAD |
| G5 | guard: a Lua button trigger with no origin follows the selection | — | as HEAD |
| G6 | guard: the sweep with the selection on A | — | as HEAD |
| G10c | guard: a v2 `runLLM` in a duplicated-id chat never reaches the provider | — | as HEAD |
| G-edit | guard: a Lua edit trigger makes no model call | — | as HEAD |
| G-ollama | guard: Ollama's reply parse takes the character name from `arg.currentChar` | — | as HEAD |
| D0 | diagnostic: no read of the `selectedCharID` store during a request with a subject, on each sweep path, and no `DBState.db` change inside the window | 7 to 18 reads per path | 0 |

The sweep S tests the invariant as behaviour: nothing of the selection reaches the request. D0
measures the mechanism and is kept as a diagnostic; it agreed with S on every path at HEAD.

**Annex (non-normative): how the tests run.**
- Real `request.ts`, `triggers.ts`, `modules.ts`, `chatOrigin.ts`, `scriptings.ts` and
  `openAI/requests.ts`; providers stubbed at the network (`globalFetch`, a global `fetch` stub for
  Ollama, a Horde job id with `sleep` mocked). A `replacerbeforeRequest` hook makes the switch.
- Happy-dom for the real `modellist`; node (with `modellist` mocked from `model/types`) for the
  wasmoon Lua tests. The `sendChat*` family's mocked `requestChatData` is T11's capture point.
- Assertions are on the payload with `toContain` (the reformatter prefixes the role), never on the
  absence of an error or on console output.
- D0 flushes effects before its window (`flushSync` and a macrotask): `parser.svelte.ts`'s asset
  effect reads the store after any database change. The fixture sets `cipherChat: false`, since
  `requestOpenAI` writes it on every call. `selIdState` is a second selection path that no request
  code reads; D0 cannot see it, S would.
- Each test uses fresh module ids (`modules.ts` caches the module list by id). Hint objects are read
  back through `DBState`. NovelList labels only quoted speech, so the sweep prompt has some.

## 6. Risks

- **`runTrigger` with a request-mode origin.** Its refresh logic breaks the run on a gone or
  ambiguous subject, which is what invariants 5 and 6 need; the implementation must not add a
  second path that bypasses it or marks for save.
- **Silent degradation.** The block's `catch` turns a mis-bound trigger into "no rewrite"; the tests
  assert on the prompt.
- **Group name.** Taking the name from `arg.currentChar` instead of the subject would change group
  sends to the member's name; the plan keeps the group's name.
- **A structured clone of the whole argument** would throw on a subject. Round 1 found none; the
  implementation keeps it so.
- **Found at HEAD, unrelated to the selection, not fixed here** (reported to the maintainer as
  candidate chores):
  - the image-prompt block appends the request's result object (`data += rq`) instead of its text;
  - `stringlizeAINChat` (NovelList) has a stray unary `+` before a template literal (`res += +`),
    which appends `NaN` and drops the character's name label;
  - with `fallbackModels` set for a mode, the attempts are the list's entries only and the primary
    model is never tried (executed; T6f's "fallback" is the list's second entry). Whether that is
    intended is not established.

## 7. Compatibility

No data format, plugin API or model-visible text changes. `requestChatData`'s new field is optional
and internal (`requestDataArgument` is not exported to plugins). Upstream characters' `request`
triggers run as before on the chat they were sent in when nothing is switched, except in a chat
whose id has two holders (invariant 6), which upstream data does not produce (duplicates come from
plugins; boot repairs duplicate chat ids).

## 8. Gate record

**Round 1 (rev 1), `adversarial-reviewer`, [REJECT]** (row 405; review at scratchpad
`w2d/gate1/r1.md`; probe at `w2d/gate1/probe.svelte.test.ts`, 5 passing at HEAD).
- **B1, missed selection reads:** `applyChatTemplate` (throws at Home), `getUserName()` in the
  stringifiers and `nai.ts`, the stop strings. Taken: 2.3, the scope amendment, T12, T13, T15.
- **B2, the duplicate-id rule was justified against the wrong MC entries:** rev 1 ran the send's
  trigger through the `SendSubject`'s tie-break, but `MC-110` 2 and `MC-121` 1 put a send's trigger
  runs under `MC-078`. Taken: 2.2 runs the trigger under a plain origin, as the send's start and
  output triggers; invariant 6 and T9 changed.
- **B3, tests:** the group-send-with-a-character-selected case, a trigger-run call in a duplicated
  chat, a gone name, the fallback loop, a Lua run with no origin, a group-owned trigger-run call;
  the `modellist`/wasmoon environment conflict; T11's mock. Taken: T6f, T10c, T10d, T14, T15, G5,
  the environment paragraph, T11 as a capture test.
- **Checked correct by round 1:** a hinted duplicate's `status()` is `'ok'`; the reachable switches
  are covered by resolving through the subject; `''` is safe for the stringifiers; the five
  trigger-run sites have a subject in scope except the no-origin Lua runs; no clone or bridge
  carries the argument's subject.
- Folded in from round 1's notes: a run with no trigger no longer logs an error (2.2).

**Round 2 (rev 2), the same reviewer, [REJECT]** (row 406; review at `w2d/gate1/r2.md`; probe
`w2d/gate1/probe2.svelte.test.ts`, 3 passing at HEAD). B1 to B3 confirmed taken; the plain-origin
request run executed at HEAD with the type widened: it reads the origin's chat, leaves every
character byte-identical and marks nothing.
- **F1:** `requestOllama`'s non-streaming reply parse reads the selection's user name through
  `getUnstringlizerChunks`. Taken: sections 1, 2.3 and 3, T18.
- **F2:** T10c through a v2 `runLLM` cannot reach the provider in a duplicated chat (executed).
  Taken: T10c on the Lua path, G10c.
- **F3:** the `sendChat*` harness mocks `stableDiff`, `hypav2` and `hypav3`. Taken: T11 split into
  T11, T11m, T11s.
- **F4:** coalesce an unresolved chat to `null` before `getUserName`; keep `runTrigger`'s `null`
  return; tests for the stop strings, `risu_char` after a switch and the no-subject template at
  Home. Taken: 2.2, 2.3, T15 to T17, T19.
- **The Orchestrator's second-rejection question** (is the mechanism the problem?): both rounds
  found reads missing from an enumerated list, so the plan adds T0, which fails on any selection
  read on the request path rather than relying on the list.

**Round 3 (rev 3), the same reviewer, [REJECT]** (row 407; review at `w2d/gate1/r3.md`; probes 3
and 4, real wasmoon). No design finding.
- **G1:** T10c through an edit trigger cannot be red: `runLuaEditTrigger` runs Lua without low-level
  access, so `LLM` returns at once (the Orchestrator confirmed). A Lua button trigger in a
  duplicated-id chat reaches the provider. Taken: T10c, 2.4, invariant 6, G5.
- **T0:** red at HEAD and every read it finds is one the plan lists, but `parser.svelte.ts`'s asset
  effect reads the store after a database change, so the window needs a flush; `selIdState` is a
  second selection path. Taken: D0 and the annex.

**Escalation** (row 408). Three [REJECT]s in a row: `senior-advisor`. Root cause: a gate-scope
mismatch, not a design defect. Gate 1 was accepting test rows "red by reading" while the reviewer
executed one more slice each round. Its direction, taken: keep the design and the stage whole;
execute every row at HEAD before rev 4; collapse the name rows into one sweep over a poisoned
selection; keep the store counter as a diagnostic; record that a duplicated-id trigger-run call is
unreachable inside a send; round 4 verifies the corrections only.

**Red run** (row 409, `test-warrior`, scratchpad `w2d/redrun/results.md`): section 5's rows, all
executed; T5p (a persona-embedded module), T11d and the gone row T15 added; three HEAD bugs noted
(section 6).

**Round 4 (rev 4), the same reviewer, [EDITORIAL]** (row 410; review at `w2d/gate1/r4.md`). The
round-3 findings are taken. The reviewer re-ran the red run: 122 tests, 82 red, 40 passing, no
failing guard, no passing non-guard, every red an assertion on a value (T19's `TypeError` is its
named value). It confirmed that T10c, T5p, a sweep row and D0 are red on the value they name, and
that the aligned sweep passes the same assertions on all ten paths. Two guards (G4 and the
no-`scriptstate` guard) pass at HEAD because HEAD ignores `subject`; they bite after the change.
No new evidence against the design. **Editorial, applied in rev 4.1:** section 5 claimed the tests
move with only their import paths changed; the `json.lua` path, the casts and the missing type
check are now stated. T11d names its mechanism.

**Red tests and the fix** (rows 411, 412). The four red-run files moved into
`src/ts/process/tests/` (82 red, 40 guards under the repo's config). The fix: 12 production files,
+134/-71; 122/122; the suite, `pnpm check` and the build pass on the tree.

**Gate 2 round 1, `adversarial-reviewer` (fresh), [APPROVE]** (row 413; review at scratchpad
`w2d/gate2/r1.md`). HEAD differential: 82 red, 40 guards. 17 mutants, 15 killed, one equivalent,
one survivor (M17, the group check in the request block). Lua's model calls read
`ScriptingEngineState.subject`, which is per mode and set inside the run's mutex: a concurrent probe
of three overlapping runs sent each run's own chat. Optional findings:
- (1) `templates/jsonSchema.ts` parses the schema and extraction text with no subject; with CBS in
  that text a bound request reads the selection. Carried to W2d-b, which edits the same providers.
- (2) M17 survives. Taken: a guard with a group chat whose module has a `request` trigger.
- (3) a missing space and a dropped trailing space in `stringlize.ts`. Taken.
- (4) a test comment named a stage. Taken.

**Remediation** (row 414): findings (2)-(4) taken; the same reviewer verified them, [APPROVE]. The
new guard is the only test that kills M17. 123/123; `pnpm check` clean.

**Live check** (row 415), production build: a probe provider registered through the plugin API
recorded the prompt, and a `beforeRequest` delay gave the switch window. With nothing switched, after
a click on the other chat, and after a click on Home, the `request` trigger rewrote the prompt from
the send's chat (`TA:A1`); every reply landed in the send's chat and no chat variable changed.
