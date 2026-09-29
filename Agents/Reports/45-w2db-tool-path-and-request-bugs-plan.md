# Report 45 — W2d-b: the tool path, graph memory, `risuaccess`, `aiaccess`, the JSON schema, and four request bugs

**STATUS:** plan rev 2.2, 2026-09-30. **Gate 1 passed:** round 1 [REJECT] (ledger row 419), answered
by rev 2; rev 2.1 records rev 2's rows as executed at HEAD (row 420, scratchpad `w2d/b3/`); round 2
[EDITORIAL] (row 421), applied in rev 2.2. Red tests (row 422), the fix (row 423). **Gate 2:**
round 1 [REJECT], test-only (row 424); remediation [APPROVE] (row 425). **Live check passed** (row
426). Commit-message check (row 427). **Committed** as `efd417b9`, records the commit after it.
Section 8 is the gate record. Built from the W2d-b scoping packet (ledger
row 417, scratchpad `w2d/packet-b.md`, scratch tests `w2d/b/`), the maintainer's answers recorded as
`MC-123` (with its plugin-model amendment), `MC-124` and `MC-125`, and every new test row executed
at HEAD (ledger row 418, scratchpad `w2d/b2/`). Section 8 is the gate record.

W2d-a (`4c34172c`, Report 44) gave a request an optional subject and bound the `request` trigger and
the prompt's names to it. What a request's tools do still follows the selection:
- which tools it gets (`getTools()` → `initializeMCPs()` → `getModuleMcps()` → `getModules()`);
- where a tool call lands (`callTool()` re-initialises from the selection, then scans by name);
- what graph memory and `risuaccess` read and write when called with no `id`;
- the nested request `aiaccess` makes;
- the CBS in the JSON schema and extraction path.

W2d-b binds all of these to the request's subject and fixes four request-layer bugs (`MC-122`,
`MC-124`).

**Decisions this plan implements:**
- `MC-095`, `MC-103`: the send's own requests bind; callers with no origin keep following the
  selection (the Playground, IrisModal, the translator, plugins).
- `MC-121`: a trigger run's model calls follow the run's origin, so their tools do too.
- `MC-125`: an MCP client is not shut down while a call to it is in flight or while it was used in
  the last few minutes.
- `MC-075` 2: a unit whose origin is gone does nothing more to it. `MC-104` 1, `MC-110` 1: a send's
  reads and writes tie-break to the object it started from. `MC-078`: a trigger run's plain
  subject resolves to nothing when its chat id has two holders.
- `MC-122`: the image-prompt `data += rq`, NovelList's `NaN`, the fallback models. `MC-123`: the
  selected model first, then the fallback list. `MC-124`: Claude's JSON extraction.
- `MC-076`: plugin-facing helpers stay on the selection. `MC-011`, `MC-089`: upstream data and
  plugin compatibility; nothing ships between stages.
- Report 23 section 6: no module-level "current send"; the subject travels explicitly.

**Decisions taken by the Orchestrator** (the packet's Q-2, Q-4 and Q-6; Gate 1 may challenge them):
- `aiaccess`'s nested request carries the calling request's subject (Q-2). Without it a nested
  `writeMemory` or `request` trigger reads the selection, which contradicts `MC-095`.
- A failed image-prompt request appends nothing (Q-4). Its `result` is an error string, and
  appending it would save the error into the character's reply.
- A no-`id` `risuaccess` call whose subject is gone or ambiguous returns the existing "not found"
  error text and never falls back to the selection (Q-6, `MC-075` 2).

## 1. What is wrong at HEAD

Every row below was executed at HEAD `86c1e806` (ledger row 417; packet section 4). The Orchestrator
re-read the cited code for the registry, the fallback loop, the NovelList line and the Anthropic
extraction calls.

- **Tools follow the selection.** A subject-bound request with the selection on a character without
  the module gets `tools: []` (T1); at Home also `[]` (T1h); with a chat-level module and the
  character's `chatPage` moved, `[]` (T1c); a trigger run's `runLLM` on chat A with the selection on
  B, `[]` (T2).
- **The registry shuts down another request's clients.** `initializeMCPs` destroys every client
  outside the selection's module set. A request whose tool call is in flight loses its client when
  another initialisation runs for a different set, and its next call answers `Tool … not found on
  any MCP` (L1, L1b). Three concurrent initialisations of one URL build three clients and keep one
  (L2); for `stdio:` that orphans two child processes.
- **Graph memory.** The first write in a chat throws (`'null'` parses to `null`; `graph.push`
  fails), so graph memory never stores anything in a new chat (G1; at Home the same error, G3).
  After a chat switch the write lands in the other chat, with no save mark (G2, G4b). After a switch
  to a character without the module: `Tool writeMemory not found` (G4). With the send's chat
  deleted the write lands in the remaining chat and reports success (G5); with a duplicated chat id
  it writes the first holder (G6).
- **`risuaccess` with no `id`.** After a chat switch, `risu-get-chat-history` returns the other
  chat (R1). With the selection on B, `risu-get-character-info` returns B (R2) and
  `risu-set-character-info` renames B (R3). At Home both answer `Character with ID  not found.`
  (R1h, R3h).
- **`aiaccess`.** The nested request re-runs the selection's `request` trigger over the model's own
  messages and gets the selection's tools (N1).
- **The JSON schema.** `{{char}}` in the schema resolves to the selection (`speaker.const =
  SentinelBob`); at Home the schema build rejects the whole request (`Unsupported Type Detected`, 0
  fetches); an extraction path of `{{char}}` extracts the selection's field (`from-bob`).
- **Four request bugs.**
  - Image prompt (`MC-122` 1): the send's reply gets `[object Object]` appended, also on a failed
    request (IGP, IGP-fail).
  - NovelList (`MC-122` 2): the prompt ends `…hiNaN` instead of `…hi\n\nAliceName 「` (NL).
  - Fallback models (`MC-122` 3, `MC-123`): with a list, only the list is tried (FB).
  - Claude's JSON extraction (`MC-124`): `anthropic.ts` passes `db.jsonSchema` to `extractJSON` as
    the extraction path, so the extraction returns `""` (AN1, function level).

## 2. The design

Mechanisms here are non-normative except where section 4 states an invariant.

### 2.1 Which tools a request gets

- `getModuleMcps(subject?)` reads `getModules(subject)`, which already takes a subject.
  `getTools(subject?)` and `getMCPTools(additional?, subject?)` pass it on. `requestChatData` calls
  `arg.tools ?? getTools(arg.subject)`.
- **An activity's URL list** is the subject's module set (the selection's when there is no subject),
  plus `additional`. Each listing, metadata read and call works on its own activity's list only,
  never on every registered client. Today the two are equal only because the cleanup pass runs
  first; once clients may outlive a switch (section 2.2), anything that walks the whole registry
  would see other sets' clients.
- The tool listing and `getMCPMeta` (the Playground's metadata box, `importMCPModule`) both use the
  activity's list. The listing uses the client each ensure returned (section 2.2), never a later
  read of the registry, and skips a URL whose client could not be created.
- A gone subject resolves to no character and no chat, so its list is the global modules'. The send
  is already ending in that case.

### 2.2 The registry's lifecycle (`MC-125`)

The registry becomes one entry per URL: the client, when it was last used, and how many calls to it
are in flight. Non-normative; what must hold is invariants 2 to 5.

- **Ensuring a URL** returns its client. It is single-flight: concurrent callers share one pending
  creation (L2). The pending creation is forgotten when it settles, on success or failure, so a
  failed `stdio:` start or a cancelled fs picker can be retried. A client registered by a creation
  is stamped as used at that moment, so a sweep cannot take it before its first listing or call.
  Ensuring a URL whose client was swept creates a new one.
- **Failures** keep today's per-URL behaviour: a network failure is logged and yields no client; an
  unknown `internal:` URL or a `stdio:` URL outside Tauri throws, and `getTools()` still sits
  outside the retry `try`, so the request rejects (K1, K2; pre-existing, out of scope).
- **Use stamps.** A client is stamped when it is ensured, listed, scanned by name, and when a call
  to it starts and when it ends. The in-flight count is raised before the call and lowered in a
  `finally`, so a throwing call does not pin its client. A call that never settles pins its client
  (H1, pre-existing).
- **An activity's list** for a call includes the call's `mcpURL`, so a call routed to a client never
  sweeps that client, even when the request's set has changed since it listed. Each activity stamps
  the existing entries of its own list when it starts.
- **The sweep** runs at the start of every listing, metadata read and call, before that activity's
  own work, and never throws: a client whose `destroy()` throws is logged and removed from the
  registry regardless (a `stdio:` child whose kill failed is then leaked, not retried). It shuts
  down a client only when all hold:
  - its URL is in neither the selection's list nor the current activity's list;
  - no call to it is in flight;
  - it has not been stamped within the guard period (a few minutes; one constant).
  A creation still pending is not in the registry yet and is never swept.
- **Call-only URLs** (`internal:risuai`) are a per-URL property, not a second map: such a URL is
  added to every activity's call list, and it is listed only when the activity's own module set
  includes it. Nothing moves a client between maps, so a set that lists it and a set that does not
  can run at once. `callOnlyMCPs` is not read outside `mcp.ts` and goes.
- `internal:fs` holds a directory the user picked, and a picker needs a user gesture. The guard
  period is what keeps it across a switch and back; after it expires, the next use prompts again,
  as HEAD does after any switch.
- **`initializeMCPs(additional?, subject?)`** (the Playground calls it) ensures its activity's list,
  sweeps, and returns nothing.
- **`MCPs`** stays an exported record of live clients keyed by URL; the red tests, written against
  HEAD, read it. `callOnlyMCPs` has no reader outside `mcp.ts` (Gate 1 round 2 grep) and goes.
- **Tests** reset the registry with `vi.resetModules()` and a fresh import, since its state is
  module-level.

### 2.3 Where a tool call lands

- `callTool(name, args, ctx?)` takes an optional per-call context `{subject?, mcpURL?}`.
  - **With `mcpURL`:** the call goes to the client ensured for that URL, taken from the request's
    own tool object.
  - **Without `mcpURL`:** the name is looked up among the clients of the activity's own list (the
    subject's, or the selection's with no subject) plus the call-only URLs, in that order. It never
    reaches a lingering client of another set, even one with a same-named tool. IrisModal's tools
    (no `mcpURL`, no subject) resolve to `internal:risuai` this way, as today.
- The six provider sites pass `{subject: arg.subject, mcpURL}`. The Anthropic site has only the name
  and looks the tool up in `arg.tools`. Its missing membership check (a name absent from
  `arg.tools` is still called by name) is kept: such a name takes the no-`mcpURL` route above, the
  bound equivalent of today (packet L-6).
- The dispatch passes `{subject}` as a **third argument** to the client's `callTool`. Graph memory,
  `risuaccess` and `aiaccess` read it; the network client and the dice, fs and search clients
  ignore it. The plugin MCP client forwards exactly `(toolName, args)`, so the plugin contract of
  `registerMCP` is unchanged. The subject is never put inside `args`.
- The `arg.tools` element type gains an optional `mcpURL`, so a caller's own list without it still
  type-checks; `MCPToolCallContext` in `mcplib.ts` gains the optional subject (type-only import).

### 2.4 Graph memory

- `writeMemory` and `readMemory` read and write the chat variable through the call's subject.
- A missing or non-array stored graph reads as an empty graph, so the first write works (G1).
- A write whose subject resolves to nothing (gone, or a trigger run's duplicated chat id) stores
  nothing and returns an `Error: ` text saying the chat no longer exists, the convention every
  internal tool uses. The check is `subject.resolve()` before the write, because `setChatVar`
  returns `false` for both "gone" and "unchanged".
- With no subject: today's selection behaviour, plus the first-write fix.

### 2.5 `risuaccess` with no `id`

- The single resolver takes the call's subject. No `id` with a subject means the subject's owner
  for the 13 character tools and the subject's chat for `risu-get-chat-history`. A group owner
  keeps today's "group chat" error. A subject that resolves to nothing returns today's "not found"
  error text. An explicit `id` keeps its meaning.
- **The seven writes re-resolve after the confirm prompt.** The prompt names the character resolved
  before it; after the await, the write resolves the subject again, requires the same `chaId`, and
  answers with an `Error:` text when it is gone or changed. The save mark comes from the call's
  `touched` set, which today gets the `chaId` before the prompt; it must get it only once the
  re-check passes, so a refused write marks nothing (R5).
- With no subject: today's `getCurrentCharacter()` path.

### 2.6 `aiaccess`

The nested `requestChatData` carries the call's subject. It then runs the calling chat's `request`
trigger, gets that chat's tools, and binds any nested tool call. With no subject: today's behaviour.

### 2.7 The JSON schema and extraction

- `convertInterfaceToSchema`, `getOpenAIJSONSchema`, `getGeneralJSONSchema` and `extractJSON` take
  an optional `{subject}` and pass it to `risuChatParser`. A subject alone resolves `{{char}}` and
  chat variables (packet PARSER-subject-only), so no `chara` is needed.
- The 14 call sites (3 schema builds, 11 extractions) pass `arg.subject`.
- **Claude** (`MC-124`): the two `anthropic.ts` extractions (the Bedrock branch and the HTTP
  non-streaming branch) pass `arg.extractJson`, as every other provider does. Claude's streaming
  branch has no extraction at all; that stays out of scope (section 3).

### 2.8 The three `MC-122` bugs

- **Image prompt:** append the request's `result` only when it succeeded; a failed request appends
  nothing.
- **NovelList:** remove the stray unary `+`, so the prompt ends with the character's name label.
- **Fallback models** (`MC-123`): the attempt list is the selected model, then the fallback list.
  The "blank response" rule and the last-attempt rule then refer to the last list entry, which is
  right. A failed plugin-provider attempt, after its retries, moves on to the next model like any
  other (`MC-123`'s amendment); today it ends the request at any position (FBP-1 to FBP-5).
  A provider failure marked `noRetry` (Kobold, Horde) skips that model's retries and, likewise,
  moves on to the next model; only at the last attempt does it end the request, as today. With the
  selected model first, keeping today's early return would stop a failing Kobold or Horde primary
  before the list (Gate 1 round 1, F4). NovelList does not set `noRetry` and is retried like any
  other provider (ledger row 420).

## 3. Scope

**Production files** (about 12, about 200 lines; packet section 3):
- `src/ts/process/mcp/mcp.ts` (sections 2.1 to 2.3), `internalmcp.ts` (the optional third
  parameter), `mcplib.ts` (`MCPToolCallContext`'s subject), `graphmem.ts`, `aiaccess.ts`, `risuaccess/client.ts`, `risuaccess/utils.ts`,
  `risuaccess/characters.ts`, `risuaccess/chats.ts`;
- `src/ts/process/modules.ts` (`getModuleMcps`);
- `src/ts/process/request/request.ts` (`getTools(arg.subject)`, the `arg.tools` type, the fallback
  order),
  `anthropic.ts`, `google.ts`, `openAI/requests.ts`, `openAI/responses.ts` (the `callTool` context,
  the schema and extraction subject);
- `src/ts/process/templates/jsonSchema.ts`;
- `src/ts/process/index.svelte.ts` (image prompt), `src/ts/process/stringlize.ts` (NovelList).

**Test files:** new files in `src/ts/process/tests/` on the `requestOrigin` harness; the image-prompt
mocks in `sendChatOrigin.svelte.test.ts` return a result object instead of a bare string.

**Out of scope:**
- explicit-`id` `risuaccess` writes holding their object across the prompt (packet L-9);
- K1/K2 (one bad URL rejects the request);
- `extractJSON` given an already-parsed object in `openAI/requests.ts` (packet Q6, "also seen");
- the Anthropic membership check (kept, section 2.3);
- Claude streaming ignoring `extractJson` (it has no extraction call; AN2-stream, ledger row 418);
- a real `stdio:` child destroyed mid-call hanging the call (H1): the in-flight guard prevents the
  destroy on this path, but a hang from any other cause is not addressed, and a call that never
  settles pins its client;
- a plugin's re-registered MCP keeping its old client for the linger period (at HEAD, while its set
  stays selected);
- `extractJSON` with a dotted path returning the parent object (executed in Gate 1 round 1,
  scratchpad `w2d/gate1b/dotted.svelte.test.ts`; pre-existing; the tests here use single-segment
  paths);
- a subject-bound tool call whose subject is gone still acting on external servers (`internal:fs`,
  http): `MC-075` 2 governs writes to the origin; an external side effect is not decided here.

## 4. Invariants

1. A request with a subject gets the tools of its subject's module set, whatever the selection is
   (including Home). A request without one gets the selection's, as today.
2. A request's tool list never contains the tools of a set it does not use, even while another
   set's client is still registered.
3. No MCP client is shut down while a call to it is in flight, or within the guard period after it
   was created, listed, scanned or called (a call's end counts). After the guard period, the next MCP
   activity shuts down every client that neither the selection nor that activity uses. A throwing
   call or a throwing `destroy()` never pins a client or loses a result.
4. One URL has at most one live client at a time, however many activities run concurrently; a
   failed or swept creation can be retried.
5. A subject-bound tool call reaches the client the request listed; it never answers "not found"
   because the selection moved. A call without `mcpURL`, bound or not, only reaches clients of its
   own activity's list or the call-only URLs, never a lingering client of another set.
6. The subject reaches graph memory, `risuaccess` and `aiaccess` only; a plugin MCP callback receives
   exactly `(toolName, args)`, and `args` never carries the subject.
7. Graph memory's reads and writes go to the call's subject's chat; with the subject gone or
   ambiguous nothing is written and the model is told so. The first write in a chat succeeds.
8. `risuaccess` with no `id` acts on the subject's character or chat, and a write re-checks it after
   its prompt; nothing ever falls back to the selection while a subject is present. A refused write
   changes nothing and marks nothing for save.
9. The CBS in the JSON schema and the extraction path reads the request's subject.
10. The image prompt appends the successful result's text, and nothing on failure.
11. NovelList's prompt ends with `\n\n<name> 「` (or ` 「` when continuing).
12. With a fallback list the selected model is tried first, then each entry in order; with no list,
    only the selected model. A failed plugin-provider attempt, and a `noRetry` failure, move on like
    any other; a blank entry is skipped; a blank reply advances only when "Fallback When Blank
    Response" is on and an attempt remains. The returned `model` names the model that answered.
13. Claude's JSON extraction uses the extraction path.
14. Callers with no subject (Playground MCP page, IrisModal, the translator, plugins) behave as today:
    their listing and metadata see exactly the selection's set (a call-only URL only when a module
    lists it), and their calls reach the selection's set and the call-only URLs.

## 5. Tests (written before the fix; red at HEAD unless marked guard)

IDs follow the packet's executed table. Every row's HEAD value was executed: the packet's rows in
ledger row 417 (scratchpad `w2d/b/`), the rows marked **new** in ledger row 418 (`w2d/b2/`), the
rows marked **rev 2** in ledger row 420. Some of those runs recorded a value without asserting it
(G3 to G6, R1h, R3h, N1, L1, L1b, L2, FBP-1 to FBP-4); the red-test stage writes every row as an
assertion and shows it failing at HEAD on the value it names before the fix, as AGENTS.md section
4 requires. Rows that can only be emulated at HEAD (the selection flipped around a call: L1, FS1b)
are rewritten with real subjects. Guards marked "discriminating" pass at HEAD because HEAD never
lets a client linger; each names the wrong implementation it must fail, and Gate 2 checks that
with a scratch mutant.

**Tools and registry** (real `mcp.ts`, real internal clients, fake network client):
- T1, T1h, T1c, T2: the subject's tools, not `[]`. T3 (guard): with no subject, the selection's.
- L1, L1b: a second initialisation for another set does not shut down the first request's client
  mid-call, and the first request's later call reaches it.
- L2: three concurrent initialisations of one URL build one client.
- **new** W1 (guard): after a switch from set X to set Y, a no-subject request lists only Y's tools.
  At HEAD X is already gone; a scratch add-only, unfiltered `mcp.ts` fails it (`[tool_x, tool_y]`),
  so it guards the filter once X may linger.
- **new** S1: an idle X client survives the switch and a Y listing (red: HEAD shuts it down at once).
- **new** S2 (fake timers): X is alive 30 s after a Y listing (red at HEAD) and, after the guard
  period plus one more MCP activity, shut down. The second half alone passes at HEAD vacuously, so
  the two ship as one test.
- **new** FS1: a switch away from `internal:fs` and back (and the emulated subject-bound use) calls
  the directory picker once and keeps the same client (red: HEAD calls it twice). A no-switch
  control is a guard.
- **new** P1 (guard, discriminating): a plugin MCP callback registered through `registerMCPModule`
  receives exactly `(toolName, args)`, on the subject-bound route with `{subject, mcpURL}` present,
  and on the no-subject route. It fails an implementation that spreads the subject or the context
  into `args` or forwards a third argument; Gate 2 checks that with a scratch mutant. The
  subject-bound half has no HEAD form (no context API).
- L6 (guard): two requests on one set share one client and shut down none.
- **rev 2** E1: request A ensures URL U; before A lists or calls it, an activity for another set
  sweeps; U survives and is built once (red at HEAD: destroyed and rebuilt).
- **rev 2** E2 (guard, discriminating): with one http URL whose handshake fails between two live
  ones, the listing returns the live two and a call reaches each (fails an implementation that
  reads a missing client).
- **rev 2** E3 (guard, discriminating): ensure, sweep it out (guard expired), ensure again: a new
  live client; a handshake that rejects once is retried by the next ensure (fails a cached promise);
  an unknown `internal:` URL and a `stdio:` URL outside Tauri reject on every activity and are never
  registered.
- **rev 2** E4: two sets, one listing `internal:risuai` as a module and one not, interleaved: the
  first set's listing succeeds and keeps `internal:risuai`, and one `RisuAccessClient` exists (red
  at HEAD: the first listing rejects with a `TypeError`, because the other set's initialisation
  moves the client out from under it; sequentially, two instances are built). E4-iris (guard): a
  no-subject call by name under a set without it reaches it.
- **rev 2** E5 (guard, discriminating): a no-subject name-scan call (IrisModal-shaped, the
  Playground's Execute) while another set's client with a same-named tool lingers reaches the
  selection's client; `getMCPMeta` shows only the selection's set (fails a whole-registry scan).
- **rev 2** E6a (guard, discriminating): a call that throws, then the guard period and one
  activity: the client is shut down (fails a counter not lowered in `finally`). E6b: a `destroy()`
  that throws during a sweep does not lose the activity's result (red at HEAD: the activity rejects
  and the registry is left half-cleaned, with the call-only move skipped).
- **rev 2.2** E8: a request lists X; the guard expires; X leaves the subject's set (a module
  toggled off); the request then calls X by `mcpURL`: X is neither destroyed nor rebuilt. Written
  with real subjects at the red-test stage (at HEAD the removal alone destroys X).
- **rev 2** E7: each of the six provider sites (Anthropic, Google non-streaming and streaming,
  OpenAI non-streaming and streaming, Responses) passes `{subject: arg.subject, mcpURL}` to
  `callTool`, with the streaming loops reading them after `requestChatData` has returned (red at
  HEAD: no third argument).

**Graph memory:** G1, G2, G4, G4b, G5, G6, G3 red; G1b and G3r guards. G5 and G6 expect an `Error:`
text and no write, and the send's own chat object, respectively.

**`risuaccess`:** R1, R2, R3, R1h, R3h red. **rev 2** R6: a no-`id` read (`risu-get-character-info`,
`risu-get-chat-history`) whose subject is gone answers the "not found" text and never the
selection's (red at HEAD with the selection on another character, which it reads; at Home HEAD
already answers the text, a guard); R7: the same for a trigger run whose chat id has two holders
(red by construction at HEAD; only its subject half, `resolve()` null, exists there). R4 (guard): a switch during the prompt still writes the
send's character. **new** R5: the send's character removed during the prompt: the write answers
`Error:`, changes nothing and marks nothing (red: HEAD writes the detached object, reports
success and marks the gone `chaId`).

**`aiaccess`:** N1: the nested request runs the calling chat's `request` trigger and gets its tools.

**JSON schema:** SCHEMA-sel-B-subject-A, SCHEMA-home-subject-A, EXTRACT-sel-B-subject-A red;
SCHEMA-sel-B-nosubject guard. **new** AN2: a Claude request with the schema enabled and
`extractJson` set returns the extracted field, on both the HTTP non-streaming and the Bedrock
branches (red: `""` on both; a no-path control returns the raw reply).

**`MC-122`, `MC-123`:** IGP, IGP-fail, NL red. FB red: with list `['gpt4om']` and the selected
model healthy, one fetch to the selected model (HEAD: the list model); with the selected model
failing once, it then falls to the list and succeeds (HEAD: one fetch, `fail`). **new** FBP: a
plugin primary failing through its retries then reaches the list (HEAD: `fail`, 0 fetches); a
plugin list entry failing moves on to the next entry. **rev 2** FB-NR: a Kobold primary failing
with `noRetry` then reaches the list (red at HEAD: the primary is never tried); with no list, one
attempt and `fail` (guard). A NovelList primary failing through its retries then reaches the list
(red at HEAD). **rev 2** FB-BLANK-R:
with "Fallback When Blank Response" on, a blank reply from the selected model advances to the
list, and a blank reply from the last entry is accepted; a blank list entry is skipped. **rev 2**
FB-MODEL: the returned `model` is the list entry that answered (red at HEAD when the selected model
fails first, since HEAD never tries it); when the selected model answered it is the provider's own
`model` field, as with no list (red at HEAD: `gpt4om`). NL-cont, FB-nolist and a plugin primary that recovers within its
retries are guards. The `sendChatOrigin` image-prompt mocks are updated.

## 6. Risks

- **The registry is shared** with the Playground MCP page and `importMCPModule`. Their activities
  have no subject and see the selection's set; the sweep also runs on them.
- **The guard period is a heuristic.** The idle gap inside one request is one model turn, normally
  far shorter than a few minutes; a long reasoning turn can exceed it. If it does, and the user has
  switched and caused MCP activity elsewhere after the guard expired, the request's next call
  re-ensures its client: cheap for internal clients, a respawn for `stdio:`, a new handshake for
  http, and for `internal:fs` a picker that fails without a user gesture. `MC-125` accepts this.
- **The linger has no time bound of its own.** A client is shut down at the first MCP activity
  after the guard period; a user who never uses MCP again keeps it until the app closes, as at HEAD
  after leaving a set with no later initialisation.
- **Claude streaming is still unextracted.** `sendChat` streams when streaming is on, and Claude's
  streaming branch has no extraction, so `MC-124` fixes non-streaming Claude requests and
  non-send callers only.
- **`isPluginModel` exit.** It came with upstream's first fallback commit (`9ed6d209`) and its
  purpose is not recorded. `MC-123`'s amendment removes it. A plugin provider cannot set
  `noRetry` (the plugin reply carries only success and content), so no plugin opts out.
- **Upstream users of the fallback list** see the selected model tried first (`MC-123` accepts it).
- **Type surface:** `arg.tools` is typed `MCPTool[]`; the `mcpURL` field exists at runtime only.
  The plan adds it as optional rather than casting.
- **Tests that mock `mcp/mcp`** (three files) keep working: none asserts `callTool`'s arity, and the
  `getTools` mocks ignore a new argument.

## 7. Compatibility

- Plugins: `registerMCP`'s `callTool(toolName, content)` is unchanged (invariant 6); plugin
  providers never see the subject (W2d-a).
- Module data: MCP URLs and `graphmem_graph` keep their formats. A stored `'null'` or non-array graph
  now reads as empty rather than failing.
- Presets and saves: `fallbackModels` keeps its format; only the order of attempts changes.

## 8. Gate record

### Gate 1 round 1 (rev 1.1): [REJECT] (ledger row 419)

`adversarial-reviewer`, fresh. Re-ran both HEAD harnesses and the add-only mutant; every red row it
opened fails on its named value, and W1 discriminates a widened listing. The Orchestrator checked
the call-only move (`initializeMCPs`' call-only list and the move after the cleanup pass) and the
`noRetry` returns (Kobold's `!da.ok`, Horde's two) in source; the round's report and the first
draft of rev 2 called the first one NovelList's, corrected in rev 2.1 (ledger row 420).

| Finding | Disposition in rev 2 |
|---|---|
| F1a a fresh client has no use stamp; a sweep between ensure and first use destroys it | 2.2: stamped at creation and at a call's end, scan stamps; invariant 3; E1 |
| F1b re-reading the registry after an await; a failed URL has no client | 2.1: listing uses the ensured client, skips missing ones; E2 |
| F1c single-flight bookkeeping (settle, swept clients) | 2.2; invariant 4; E3 |
| F1d the call-only move evicts a listed `internal:risuai` | 2.2: call-only is a per-URL property, `callOnlyMCPs` goes; E4 |
| F2 no-subject name scan and `getMCPMeta` reach lingering clients | 2.1 and 2.3: every activity works on its own list; invariants 5, 14; E5 |
| F3 counter on throw; sweep throwing; test isolation | 2.2: `finally`, sweep first and never throws, `vi.resetModules`; E6 |
| F4 `noRetry` bypasses the fallback | 2.8: moves on unless last; invariant 12; FB-NR |
| F5 P1 on the no-subject route only; no per-site routing test; observed-only rows; blank-response and `model`; Q-6 read rows | P1 widened; E7; section 5 header; FB-BLANK-R, FB-MODEL; R6, R7 |
| Section 6 overclaims (model turn), no stated linger bound, Claude streaming | reworded and added |
| Section 3 missing `mcplib.ts` and the request type | added |
| Optional: plugin re-registration, dotted `extractJSON`, gone-subject external effects | out of scope, section 3 |

The Orchestrator's three decisions (aiaccess, image-prompt failure, gone-subject `risuaccess`)
were accepted.

### Gate 1 round 2 (rev 2.1): [EDITORIAL] (ledger row 421)

The same reviewer, resumed. Re-ran `w2d/b3` (`reg3` 7 red, `tools3` 11, `fb3` 11, `e7` 7 of 7) and
the add-only mutant; every red row it opened fails on its named value, and the discriminating
guards fail the mutant. All round-1 findings closed; it confirmed its round-1 `noRetry` attribution
was wrong (Kobold, not NovelList). No new blocker. Its five corrections, applied in rev 2.2:

| Finding | Rev 2.2 |
|---|---|
| S1 a call's own sweep could take its client when the set changed since listing | 2.2: a call's list includes its `mcpURL`; activities stamp their list at start; E8 |
| S2 an entry whose `destroy()` throws | 2.2: removed regardless, logged |
| E1 `initializeMCPs` after the change | 2.2: defined; `MCPs` stays a URL-keyed record |
| E2 invariant 14 wording | reworded |
| E3 P1 names no wrong implementation | named; Gate 2 mutant |

The Orchestrator checked the diff of rev 2.2 against rev 2.1: it touches only these five places, the
status line and this record. Gate 1 closed.

### Gate 2 (the fix, row 423)

**Round 1: [REJECT], test-only (ledger row 424).** `opus-reviewer`, fresh. No production defect;
every invariant traced or executed holds. Pre-fix swap of all 18 files: 67 failed, 88 passed, every
pass a `guard:`. Of 23 scratch mutants, two consequential survivors: the sweep ignoring in-flight
calls, and a write not reassigned to the live character after the prompt (silent loss when the slot
is replaced during it). R5 drove one of seven writes; the trailing-blank test could not observe its
title. Editorial: a stale rationale in `recheckCharacterForWrite`'s doc, the graph-memory comment's
duplicate case, dead harness fields.

**Remediation: [APPROVE] (ledger row 425).** Tests for the in-flight guard, the live-object write
and R5 over all seven writes; the trailing-blank test made to discriminate; two optional sweep tests;
comment and error-string fixes. Production diff since round 1: comments and one string. Optional
items then taken: the replaced-slot test over all seven writes, a Lua first trigger in the fixture, a
complete list of null resolutions in the graph-memory comment. Final tree: `pnpm test` 187 files,
3,066 passed, 4 skipped; `pnpm check` clean; build passes.

### Live check (ledger row 426): passed

A production build with a local OpenAI-compatible probe as the model: a graph-memory tool call held
across a chat switch, and across Home, wrote the sending chat; the fallback list was reached only
after the selected model's attempts failed.
