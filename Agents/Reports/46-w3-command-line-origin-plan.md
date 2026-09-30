# Report 46 — W3: `/` commands, `/multisend` and Post File act on their own chat

**STATUS:** plan rev 3.2, 2026-09-30. **Gate 1 passed. Gate 2 passed** (rows 439-441, [EDITORIAL]
three times; one behaviour fix to `/trigger`'s depth). **Live check passed** (row 442).
Commit-message check (row 443). **Committed** as `e07d32fb`, records the commit after it.
- Round 1 [REJECT] (ledger row 432) and round 2 [REJECT] (row 434) were answered by rev 2 and rev 3.
- Round 3 [EDITORIAL] (row 436) was applied in rev 3.2. In rev 3.2, the maintainer confirmed the
  two rev 3 readings as an amendment to `MC-128`.
- Every row was executed at HEAD (rows 430, 433, 435): 120 tests, 99 FAIL on their named value, and
  21 guards PASS.
- Gate 1 round 1 returned [REJECT] (ledger row 432). Rev 2 answers it, with `MC-128` for finding
  B4.
- Rev 2.1 records rev 2's new rows as executed at HEAD (ledger row 433). The full set is 109 tests:
  91 FAIL on their named value, and 18 guards PASS.

**Sources:**
- the W3 scoping packet (ledger row 429; scratchpad `w3/packet.md`, probes `w3/probes.md`, harness
  `w3/w3probe.svelte.test.ts`);
- the maintainer's answers, recorded as `MC-126`, `MC-127` and `MC-128`.

**Rev 1.1** records every section 5 row executed at HEAD (ledger row 430; scratchpad `w3/rows/`: 73
tests, 62 failing on their named value, 11 guards passing). It also folds in what that run found:
- `{{setvar::}}` in an argument writes nowhere;
- `/cut <id>` with a real message id takes the range form;
- `/trigger` returns `undefined` in every chat;
- one more P5 row.

Section 8 is the gate record.

Decisions this plan implements: `MC-075` 1, `MC-076`, `MC-078`, `MC-098` 2, `MC-099`, `MC-103`,
`MC-104` 1, `MC-105`, `MC-106`, `MC-107`, `MC-110` 2, `MC-121`, `MC-126`, `MC-127`, `MC-128`.

## 1. What is wrong at HEAD (`61b5a885`)

The source of each item is packet Q1-Q6 and the probes P1-P7.

1. **Every `/` command acts on the chat on screen.**
   - `processCommand` in `command.ts` reads `db.characters[get(selectedCharID)]` and its
     `chats[chatPage]` at each command's start. `/setvar`, `/addvar` and `/getvar` read it again,
     and `/trigger` reads `getCurrentCharacter`/`getCurrentChat`.
   - The CBS in each argument is parsed with no subject, so `{{getvar::}}` in an argument reads the
     selection's variables. Arguments are parsed without `runVar`, so `{{setvar::}}` there writes
     nothing at all (`cbs.ts`, `setvar`). That stays.
   - None of the three callers passes a chat:
     - the composer's `/` stage (`sendMain` in `composerActions.svelte.ts`);
     - the trigger `command` effect;
     - the trigger `v2Command` effect.

   A pipe that awaits (`/speak`, `/input`, `/buttons`, `/test_lorebook`, `/trigger`, `/multisend`)
   and then writes, writes to whatever is on screen then:
   - P4: `/speak x|/send hi` with a chat switch during `/speak` posts `hi` to the other chat.
   - P5: at Home, the next command throws a TypeError.
   - A trigger run's other effects, and its model calls (`MC-121`), act on the run's own chat. Its
     command line is the part that does not.
2. **`/multisend` splits a segment from its reply.** Segments go to the chat object held since the
   command started. Each reply goes to the chat on screen at its `sendChat(-1)`. P1: a switch
   during segment `a` posts `b` to the first chat and its reply to the second. P2: Home ends the
   loop.
3. **Post File (`.po`, `sendPofile` in `files/multisend.ts`)**:
   - It binds to the chat on screen when the file dialog closes, not the chat where it was clicked.
   - It re-reads the selection after every entry. P6: entry 2 and its reply land in the other chat,
     and entry 1's `msgstr` records that chat's last message.
   - P6b: Home throws, and nothing is downloaded.
   - **P7, data loss on Tauri:** after each entry, `sendPofile` writes its held chat object back into
     `chats[chatPage]` of its held character. A chat switch during the Tauri `downloadFile` await
     replaces the newly shown chat with a second reference to the first, which also duplicates the
     id. The write of `DBState.db.characters[get(selectedCharID)]` has the same shape for a
     character switch (INFERRED).
4. **A cancel does not stop a pipe** (P3). In the composer, `/speak x|/multisend a|||b` with the
   busy button pressed during `/speak`:
   - the text goes back and the flag is free;
   - the pipe then posts `a` and `b` and generates both replies;
   - the draft still holds the command, so the next Send repeats it.

   The pipes of a send's triggers have no signal at all.
5. **A trigger button's `/multisend` contends with a starting send** (Report 36 section 3, D6):
   - It reads only `doingChat`, so while the composer's window is open (a take before its hand-off,
     or auto mode's yield) it takes the flag, and the hand-off or next tick is refused.
   - The take's put-back is suppressed by any `/multisend` push anywhere, because
     `multisendPushCount` is one global counter.
6. **`setDatabase(db)` after each command write.** It runs the full normaliser, which sets
   `isStreaming = false` on every chat. So a button's `/setvar` during a stream resets the
   streaming chat's flag. The reset is TRACED; the display effect is INFERRED.
7. **Command bugs, identical upstream** (`MC-127`):
   - `/cut N` keeps only message N (it assigns `splice`'s return value);
   - `/cut a-b` keeps only that range;
   - `/del N` keeps only the last N, and `/del 0` empties the chat;
   - `/getvar` on an unset variable throws;
   - `/addvar` on an unset variable writes `NaN`;
   - `/comment` in an empty chat throws;
   - `/trigger` returns `undefined` down the pipe in every chat. The group early return and the end
     of the ordinary case both use a bare `return`;
   - `/cut <id>` takes the range form whenever the argument contains `-`. Real message ids are
     uuids and always do, so cutting by a real id never works. At HEAD, `/cut bbbb-2222` keeps every
     message, because it becomes `slice(0, 2222)`;
   - `/trigger` has no recursion bound;
   - Post File tests for `#. Note =` but strips `#. Notes =`, and a leftover `if(i > 100) break`
     cuts a job off and downloads a partial file.

## 2. The design

### 2.1 A pipe has a chat

A pipe runs for exactly one chat, fixed when it starts:

| The pipe's caller | Its chat | Duplicated id |
|---|---|---|
| The composer's `/` stage | the take's origin (`workHandle.origin`) | writes to the object the take started from, as the take's own appends do (`MC-104` 1, `MC-126` 6): the take's hint `{owner: char, chat: startChat}` |
| A trigger's `command` / `v2Command` effect | the run's origin (the run's own subject) | the run already stops before any effect (`refreshSubject`, `MC-078`, `MC-110` 2); unchanged |
| A trigger button | the run's origin, taken at click (unchanged) | as above |
| `/trigger` inside a pipe | the pipe's chat | as above for the run it starts |

Every command finds the pipe's chat by id at the moment it reads or writes. It never uses the
selection, and never uses an object held across an `await`:
- A command that awaits (`/speak`, `/multisend`, `/test_lorebook`, `/trigger`) resolves again after
  the await before it touches the chat.
- The pipe's "character" is the chat's owner. In a group chat that is the group, so `chara` is
  `null` exactly as it is for a group on screen today; `/speak` and `/trigger` keep their group
  behaviour.
- CBS in a command's arguments is parsed with the pipe's subject, so it reads that chat's variables.
  Arguments are still parsed without `runVar`, so `{{setvar::}}` there still writes nothing.
- `/test_lorebook` scans with that subject (`loadLoreBookV3Prompt(subject)` already takes one).

**Plugins.** They stay on the selection (`MC-076`). They have no command-line entry, and the plugin
`sendChat` is unchanged.

### 2.2 Writes and saves

A command's write goes into the resolved chat and marks the chat's owner for save, whether or not
that character is selected. The `setDatabase(db)` calls after command writes go away:
- the database is a `$state` proxy, so a direct write is already reactive;
- the save mark is what persists a non-selected character;
- this also removes the `isStreaming` reset (section 1 item 6).

### 2.3 A gone chat stops the pipe (`MC-126` 6)

If the pipe's chat is gone, or ambiguous for a subject that has no hint, when a command is about to
run, the pipe stops silently:
- no further command runs;
- nothing is written anywhere else.

`/multisend` checks this before each segment. A command that is already running finishes; its
write, if any, is dropped (`MC-075` 2).

### 2.4 Cancel (`MC-126` 1)

A pipe may carry an abort signal. When the signal is aborted, the pipe stops before its next
command and before `/multisend`'s next segment. A step that is already running (`/speak`, a
`/trigger` run, an `/input` or `/buttons` prompt, a lorebook scan) is not interrupted and finishes
first.

| Pipe | Signal |
|---|---|
| The composer's `/` stage | the take's `controller.signal`. `abortChat` already aborts it while the take is unsettled. |
| A send's start and output triggers | the send's unit signal (`abortSignal` in `sendChatBody`), passed to `runTrigger` |
| The composer's input trigger | the take's signal (`sendCharacterMessage` already receives it) |
| Runs started by `runtrigger`, `v2RunTrigger` and `/trigger` | inherit their parent run's signal |
| A trigger button | none, as before. The busy button still cancels a segment's generation, which ends the loop as today. |

For the composer, the busy button's put-back and the pipe agree (`MC-099` 1, `MC-107` 1,
`MC-128`):
- **Pressed before the take's own pipe has written anything:** the text goes back, and nothing more
  is written. For example, pressed during the first `/speak`.
- **Pressed once the take's own pipe has written:** the composer stays empty, and what was written
  stays.

**When the pipe counts as having written.** The take's pipe counts as having written from the
moment it starts any command outside the non-writing set, whether or not that command then changes
anything.
- **The non-writing set** is `/speak`, `/echo`, `/popup`, `/pass`, `/input`, `/buttons`, `/len`,
  `/getvar`, `/setinput`, `/?`, and an unknown command. None of them writes chat state.
- **Every other command** is `/send`, `/sendas`, `/comment`, `/cut`, `/del`, `/setvar`, `/addvar`,
  `/multisend`, `/trigger` and `/test_lorebook`. Each counts at its start, before any await.

Counting at the start means nothing has to be forwarded into the runs `/trigger` starts. The command
already counted before its run began, so whatever that run and its pipes write is covered.

`MC-128` originally listed the first eight. The maintainer then added `/trigger` and
`/test_lorebook` (`MC-128`'s amendment, after round 3), because the rule is that nothing replays:
- a resend re-runs a trigger, whose effects can write;
- `/test_lorebook`'s scan writes lore flags (`loadLoreBookV3Prompt` through `snapshotSubject`).

The cost, accepted: the composer stays empty after a cancel during a `/trigger` that turned out to
write nothing, or during a lore scan.

Writes by anything else never count: a trigger button, auto mode, or another chat.

**A pipe that fails after writing.** When a pipe returns `false` (an unknown command, `/setinput`,
or a stop) after it has counted as written, the text is handled: it is not posted as a message and
not put back. `/send x|/nosuchcommand` therefore posts `x` and nothing else. At HEAD it also posts
the raw command text and generates a reply. HEAD already treats a `/multisend` post this way; this
extends the same rule to every write (`MC-106`/`MC-107`'s reasoning, confirmed in `MC-128`'s
amendment). With no write, the unknown-command fallback is unchanged: the text is sent as a message.

The take's input trigger is not its `/` pipe. A cancel during the input trigger puts the text back,
and whatever the trigger wrote stays (`MC-099` 1 and 3), as it does today.

### 2.5 `/multisend` (`MC-126` 3 and 4)

- **Where it writes.** Each segment is pushed into the pipe's chat, resolved at the push. Its reply
  is generated with `sendChat(-1, { origin, originHint?, signal })` for that same chat. The
  composer's pipe passes its hint.
- **When it generates replies.** A reply is generated only when no send holds the flag and no send
  is starting (the composer's window is not open). The exception is the work that opened the window
  itself: the take's `/` stage and the take's own input trigger. A `/multisend` from those
  generates, as it does today. Any other `/multisend` while the window is open posts its segments
  without replies. In practice that means a trigger button, or a `/trigger` inside a button's pipe.
  `MC-106` 2 already gives it that behaviour while a send is running. So a button never takes the
  flag from a starting send or from auto mode's next tick. The decision is read once, before the
  first push, as today.
- **After the user leaves.** Once running, it keeps posting and answering in its own chat when the
  user switches chats or goes Home (`MC-126` 4, like `MC-103` 3).
- **The take's put-back** follows section 2.4. A post by a trigger button never suppresses it,
  even in the take's own chat.
- **Forwarding.** `/trigger` forwards to the run it starts, and that run's `runtrigger`,
  `v2RunTrigger` and command effects forward on:
  - the pipe's window ownership;
  - its signal;
  - its trigger depth.

  The "has written" record is not forwarded (section 2.4).

  So a `/trigger t` in the take's pipe, where `t` runs `/multisend`, still generates. The same
  `/trigger` inside a button's pipe never gains ownership.

### 2.6 Post File (`MC-126` 5, `MC-127` 4)

- **Binding.** `postChatFile` receives the chat of the composer record it was invoked for. That is
  the key both callers in `DefaultChatScreen.svelte` already hold at click. It also receives the
  objects the caller read that chat through (`currentCharacter`, `currentChatObj`) as a hint.
  Every entry and its reply go to that chat, resolved at each use.
- **A duplicated id.** Post File's replies are sends, so a duplicated id follows `MC-104` 1: the
  job writes to the chat it was clicked in, like a composer send (Orchestrator's reading, recorded
  at round 1 finding B5). With no key (`resolveDraftKeyForWrite` returned null), a `.po` job does
  nothing.
- **The reply recorded as `msgstr`** is the last message of that chat after the entry's
  `sendChat`. That is the same rule as today, applied to the right chat. If the chat has no last
  message by then, the entry records an empty `msgstr` and the job continues; it does not throw.
- **No write-back.** The held chat and character are not written back into the database (P7).
- **Stopping.** The busy refusal at an entry is unchanged: stop, and download what was built if an
  entry was sent. A chat that is gone at an entry stops the job the same way. A chat that is gone
  before the first entry sends nothing and downloads nothing.
- **Parser fixes.** The `#. Note =` prefix is removed from the note. There is no line cap.

### 2.7 The command fixes (`MC-127` 1-3)

`/cut` chooses its form from the whole argument, trimmed, not from whether it contains `-`. Let `L`
be the chat's length.
- **`/cut N`**, where the argument is an optionally negative decimal integer (`^-?\d+$`):
  - For `0 <= N < L` it removes message N.
  - For `-L <= N < 0` it removes message `L + N`. `-0` is 0.
  - Any other N removes nothing. `splice`'s clamping of an out-of-range start must not leak through:
    `/cut -5` on three messages removes nothing.
- **`/cut a-b`**, where the argument is two non-negative decimal integers joined by `-`, with
  optional spaces around the `-` (`^\d+\s*-\s*\d+$`, so upstream's `/cut 1 - 3` still works):
  - It removes the messages at indices `a` to `b - 1`. Those are the ones `slice(a, b)` selects
    today; `b` past the end stops at the end.
  - `a >= b` removes nothing.
- **`/cut <id>`** is anything else. It removes the message whose `chatId` equals the argument, so
  real uuid ids now work.
  - An argument that matches no message removes nothing. That includes a malformed range such as
    `2-` or `-`, which at HEAD emptied the chat.
  - A message id is never taken for a number or a range. Ids are uuids, and the two numeric forms
    above do not match them.

**Scope amendment (`MC-091`, a shared-cause correction for `MC-127` 1):** without this test, the
fixed range form would take a uuid for a range. `/cut bbbb-2222` would then delete messages 0 to
2221 instead of keeping them.
- **`/del N`**, where the trimmed argument is a decimal integer (`^\d+$`), removes the last N
  messages.
  - `N = 0` removes nothing.
  - `N >= L` empties the chat, as the help text's "delete" implies.
  - Anything else removes nothing: a negative, `2abc` (which `parseInt` would read as 2), or empty.
- **`/getvar`** on an unset variable returns `'null'`, the fallback the code already names.
- **`/addvar`** treats an unset variable as 0. An existing non-numeric value still gives `NaN`, as
  upstream. `MC-127` 2 covers the unset case only.
- **`/comment`** in an empty chat does nothing and passes the pipe on.
- **`/trigger`** passes the pipe on unchanged: in a group chat, when its run is refused, and after
  its run.
- **`/trigger`'s depth.** Its runs follow the same depth rule as the `runtrigger` effect: past 10
  nested runs, counted together with `runtrigger`/`v2RunTrigger`, it runs nothing unless the
  invoking trigger has `lowLevelAccess`. A pipe started by the composer starts at depth 0.
- **Unchanged:** the help text and the command parser, including `=` in arguments (`MC-127`).

### 2.8 Mechanism (non-normative)

`processMultiCommand(command, ctx)` takes a required context:
- a subject, `SendSubject` with hint or `RunSubject`;
- an optional signal;
- whether the pipe owns the composer's window;
- the trigger depth and `lowLevelAccess`;
- a "has written" record, which only the composer's `/` stage supplies and only its own top-level
  commands set.

`processCommand` resolves `ctx.subject` per command, and sets the record at the start of each
command outside the non-writing set (section 2.4), before any await. All three callers pass a context, so there is no caller without a chat.

`RunTriggerArg` gains optional fields that the nested runs carry on:
- the signal;
- window ownership.

`/trigger` passes all of them. The take's record is set at the start of each counting command
(section 2.4) and is not forwarded into nested runs.

The put-back and the "handled" decision in `sendMain` both read that record instead of the global
`multisendPushCount`. The global counter is then unused by the take; delete it if nothing else reads
it.

## 3. Scope

**In:**
- `src/ts/process/command.ts`;
- `src/ts/process/files/multisend.ts` (`sendPofile`, `postChatFile`);
- `src/ts/process/composerActions.svelte.ts` (the `/` stage call and the put-back);
- `src/ts/process/triggers.ts` (the two command effects, and the signal and window flag on nested
  runs);
- `src/ts/process/index.svelte.ts` (pass the unit signal to the three `runTrigger` calls);
- `src/ts/process/sendCharacterMessage.ts` (pass the take's signal and window ownership to the input
  trigger);
- `src/ts/process/generationOwnership.svelte.ts` (the global push counter, if it becomes unused);
- `src/lib/ChatScreens/DefaultChatScreen.svelte` (pass the key and the hint to both `postChatFile`
  calls);
- `src/ts/process/tests/generationOwnership.svelte.test.ts`. It calls the real
  `processMultiCommand` with one argument six times: two `/setvar` pipes, and four `/multisend`
  calls inside its mocked input and output trigger handlers. Each call gets the context its real
  caller would pass. The mocked input-trigger handlers own the window;
- new tests.

**Out:**
- **`loadInternalBackup` during work:** W2e (`MC-127` 5).
- **Interrupting a running step (`/speak`, a prompt, a `/trigger` run):** rejected in `MC-126` 1.
- **The command parser's `=` rule:** kept (`MC-127`).
- **The plugin `sendChat`:** stays on the selection (`MC-076`).
- **The delete warning and complete registration:** W2e.
- **A trigger-button pipe's cancel:** none, as before (`MC-126` 1).

**Scope amendment (`MC-091`):** none expected. Any file beyond the list above is recorded in the
gate record.

## 4. Invariants

- **I1. A pipe writes only to its own chat** (section 2.1). The chat is found by id at each command,
  or at each segment or entry. Nothing a command writes lands in a chat the user switched to, and
  nothing throws at Home.
- **I2. No command reads the selection.** This covers `command.ts` and `sendPofile`, and includes
  the CBS in arguments.
- **I3. Every command write, and every Post File push, marks its chat's owner for save.** No
  command write calls `setDatabase`.
- **I4. A duplicated id.** The composer's pipe, and Post File, write to the object they started
  from (`MC-104` 1). A trigger run stops before its command effect, as today.
- **I5. A stopped pipe runs no further command and writes nothing more, anywhere.** That includes a
  detached copy of a gone chat. It stops on an aborted signal or on a gone chat. A running step
  finishes.
- **I6. `/multisend` generates replies only when no send holds the flag and none is starting**, or
  when it is the work that opened the window. That is the take's `/` stage, the take's input
  trigger, and every run and pipe nested under either of them through `/trigger`, `runtrigger` or
  `v2RunTrigger`. Otherwise it posts without replies. It never takes the flag from a starting send
  or from auto mode.
- **I7. The take's text is handled once the take's own `/` pipe has started a counting command**
  (section 2.4, `MC-128`). From then on:
  - a cancel leaves the composer empty;
  - a `false` result does not post the text.

  Before that, a cancel puts the text back, and a `false` result sends it as a message. A command
  by a trigger button, auto mode or another chat never counts, even in the take's own chat.
- **I8. No two generations at once, and the flag is never stolen or stuck** (unchanged).
- **I9. Post File's entries, replies and `msgstr` come from the chat where it was clicked.** It never
  writes a held object back into the database.
- **I10. The command semantics are those of section 2.7.** Everything else about the command
  language is unchanged: names, arguments, pipes, `|||`, `{{pipe}}`/`{{slot}}`, help, and the group
  behaviour. The unknown-command fallback, which sends the text as a message, is unchanged too,
  except after a counting command (I7).

## 5. Tests (written before the fix; red at HEAD unless marked guard)

**Harness.** `generationOwnership.svelte.test.ts` drives the real `sendChat`, `processMultiCommand`,
`postChatFile`/`sendPofile` and `composerActions` over a `$state` database. It provides held
streams, `platformBox` and a gated `downloadFile`.
- Rows that need the real trigger engine with the real `command.ts` need a new harness. Base it on
  `triggerOriginWrites.svelte.test.ts` with `./command` unmocked.
- Rows that need real CBS need the real parser for those rows.
- The test writer chooses the files. New test files are LF.

Every row is a real `expect`, and every row is executed at HEAD before Gate 1 accepts the plan.

**Executed at HEAD (ledger row 430).** The run used scratchpad `w3/rows/`: `commandLineOrigin.svelte.test.ts` (identity parser, the real trigger engine and real `command.ts`) and `commandLineOriginParser.svelte.test.ts` (the real parser).
- **Results:** 73 tests, 62 non-guard FAIL on their named value, and 11 guards PASS. There were no setup, import or hang failures. The results were identical on a second run. Re-run with `bash w3/rows/run.sh <name>`. The results are in `w3/rows/results-head.txt`.
- **`×2` rows** run over both the `command` and `v2Command` effects.
- **Two seams mirror today's callers and do not mount them:**
  - `clickTriggerButton(name)` mirrors `handleButtonTriggerWithin` in `Chat.svelte`.
  - `clickPostFile(query)` mirrors the `DefaultChatScreen.svelte` caller and passes the click-time key `{chaId, chatId}` as `postChatFile`'s second argument, which HEAD ignores.
- **B7's `setDatabase`** is a spy that mirrors the normaliser's `isStreaming` reset.

The row list below reflects what the run found:

**Binding (the composer's pipe)**
- **B1.** `/speak x|/send hi`, with a chat switch during `/speak`: `hi` lands in the take's chat;
  the other chat is unchanged. (P4)
- **B2.** B1 with Home instead: `hi` lands in the take's chat, and nothing throws. (P5)
- **B3.** `/multisend a|||b`, with a chat switch during `a`'s generation: the take's chat ends
  `[…, a, reply, b, reply]`; the other chat is unchanged; each request is for the take's chat. (P1)
- **B4.** B3 with Home: both segments are posted and answered in the take's chat. (P2, `MC-126` 4)
- **B5.** After a switch, `/setvar`, `/addvar` and `/getvar` act on the take's chat's variables
  (3 tests).
  - Real parser: `{{getvar::k}}` in a `/send` argument reads the take's chat.
  - **Guard:** `{{setvar::k::v}}` in a `/pass` argument writes no variable of the chat on screen.
- **B6.** For each writing command (`/send`, `/sendas`, `/comment`, `/cut`, `/del`, `/setvar`,
  `/addvar`, `/multisend`): after a switch, the take's character is marked for save.
- **B7.** The streaming flag is unchanged. A chat that is streaming keeps `isStreaming` when a
  command writes. Needs a real or spied `setDatabase`; the test writer picks the observable, and it
  must fail at HEAD.
- **B8.** A duplicated id: the take starts in chat A; chat B holds the same id; the user switches to
  B during `/speak`. `/send hi` lands in A, not B, and is not skipped.
- **B9 (guard).** An unknown command in the composer sends its text as a message, as today.

**Gone chat**
- **G1.** The take's chat is deleted during `/speak` in `/speak x|/send hi`: nothing is posted
  anywhere, and no later command runs.
- **G2.** A trigger pipe `/speak x|/send hi` whose chat is deleted during `/speak`: the same.

**Cancel**
- **C1.** The busy button pressed during `/speak` in `/speak x|/multisend a|||b`: the text is back
  in the take's record, nothing is posted, and no request is made. (P3)
- **C2 (guard).** Pressed during `a`'s generation in `/multisend a|||b|||c`: `a` stays, `b` and `c`
  are not posted, and the composer is empty (`MC-107` 1).
- **C3.** A send's start trigger runs `/speak x|/send y`; the busy button pressed during `/speak`:
  `y` is not posted. Real trigger engine.
- **C4.** The same for an output trigger, and for the composer's input trigger.
- **C5.** A nested run (`runtrigger` to a trigger whose command is `/speak x|/send y`), pressed
  during `/speak`: `y` is not posted.
- **C6 (guard).** A trigger button's pipe `/speak x|/send y`, pressed during `/speak`: `y` is posted
  (a button's pipe has no cancel).

**Trigger runs**
- **T1.** A button's pipe `/speak x|/send hi`, with a chat switch during `/speak`: `hi` lands in the
  button's chat. Covers both `command` and `v2Command`.
- **T2.** A start trigger's `command` `/send hi` after an awaited step, with a switch before it: `hi`
  lands in the send's chat.
- **T3.** A button's pipe after Home: the command writes to the run's chat and nothing throws.
- **T4.** Real parser: CBS that reaches a button's pipe after a switch reads the run's chat. A
  trigger's `command` effect value is CBS-expanded with the run's subject before the pipe starts, so
  the row brings the CBS in through `/input`, whose answer is `{{getvar::k}}`, then
  `/send {{pipe}}`.
- **T5 (guard).** A run in a chat whose id has two holders stops before its command effect
  (`MC-078`).
- **T6.** `/trigger t` in the composer's pipe after a switch: `t` runs on the take's chat.

**Buttons and the flag**
- **F1.** The composer's window is open (the take held in its input trigger, or at its `/` stage);
  a button's `/multisend a|||b` in the same chat posts both segments, makes no request, and does
  not take the flag. The take's hand-off then generates.
- **F2.** Auto mode's yield: a button's `/multisend` posts without replies, and the next tick runs.
- **F3 (guard).** The take's input trigger's own `/multisend a|||b` generates both replies, then the
  take's message is appended and generated.
- **F4 (guard).** The composer's own `/multisend a|||b` generates both replies (`MC-105` 1).
- **F5.** A button's `/multisend` in another chat during a take's `/` stage, then the busy button:
  the take's text is put back.
- **F6 (guard).** A button's `/multisend` with the window closed and the flag free generates its
  replies.

**Post File**
- **P1.** Clicked in chat A; the dialog resolves after a switch to B: every entry and reply is in A.
- **P2.** A switch during entry 1: entry 2 and its reply are in A, and entry 1's `msgstr` is its
  reply. (P6)
- **P3.** Home during entry 1: the job continues in A and a file is downloaded. (P6b)
- **P4.** Tauri: a switch during the per-entry `downloadFile`: B keeps its own messages and id,
  and the chat ids stay distinct. (P7)
- **P5.**
  - **Guard** (HEAD's `sendChat` already refuses a gone origin): A is deleted during an entry's
    generation; the job stops and downloads.
  - Red:
    - A is deleted during entry 1's Tauri download: entry 2 is not sent and nothing reaches another
      chat.
    - A is deleted while the file dialog is open: nothing is sent or downloaded.
- **P6.** A `#. Note = x` line yields `Note: x` with no prefix, and a job of more than 100 lines is
  not truncated.
- **P7 (guard).** The busy refusal at an entry is unchanged.

**Command fixes**
- **K1.** `/cut 1` on `[m0, m1, m2]` leaves `[m0, m2]`. `/cut -1` removes the last message.
- **K2.** `/cut 1-3` on `[m0 … m4]` leaves `[m0, m3, m4]`.
- **K3.** `/del 2` on `[m0 … m4]` leaves `[m0, m1, m2]`; `/del 0` leaves the chat unchanged.
- **K4.**
  - **Guard:** `/cut x1` removes the message whose `chatId` is `x1`.
  - Red: `/cut <uuid>`, with a real uuid message id, removes exactly that message and no range.
- **K5.** `/getvar key=unset` returns `'null'`.
- **K6.** `/addvar key=unset 5` stores `'5'`.
- **K7.** `/comment x` in an empty chat neither throws nor stops the pipe.
- **K8.** `/pass hello|/trigger t|/send {{pipe}}` posts `hello`, not `"undefined"`, both in a group
  chat and in a character's chat.
- **K9.** A trigger whose command runs `/trigger self` runs at most 12 times: the first run, ten
  nested runs, and a margin. The test caps the count in a spy and fails past it rather than
  hanging.

**Added in rev 2 (Gate 1 round 1), executed at HEAD (ledger row 433):** 36 tests, 29 FAIL on their
named value, 7 guards PASS.
- **Guards that pass at HEAD, each against a named wrong fix:**
  - K1b `/cut -5`: a clamping `splice`.
  - K3b `/del abc`.
  - F8 (three tests): ownership not forwarded through nesting. HEAD ignores the window, so they pass.
  - P8 in holder A: resolving by id alone.
  - C9.
- **Rows added as red variants:**
  - P8 with a switch to the other holder during entry 1;
  - P9, as direct `postChatFile` calls with no key. The Post File button can pass a null key when
    `resolveDraftKeyForWrite` returns null; the direct call stands in for it.
- **P11** runs on Tauri. It checks the push's own mark during entry 2's request, before any settle
  marks.
- **B10** uses `/input q|/speak x`, with the switch during `/input`.
- **B11** checks the subject the scan receives.
- **P10** empties the chat with an output trigger's `v2CutChat`.
- **K10** uses the same bound of 12 as K9.
- **K4b.** `/cut <uuid>` with a real uuid message id removes exactly that message.
- **K8b.** `/pass hello|/trigger t|/send {{pipe}}` in a character's chat posts `hello`.
- **K1b.** On `[m0, m1, m2]`:
  - `/cut -5` and `/cut 9` remove nothing;
  - `/cut -0` removes `m0`;
  - `/cut 3-1` removes nothing;
  - `/cut 1 - 2` removes `m1`;
  - `/cut 2-` removes nothing.
- **K3b.** On `[m0, m1, m2]`:
  - `/del 9` empties the chat;
  - `/del -1`, `/del abc` and `/del 2abc` remove nothing.
- **K10.** Depth is counted together: a trigger whose `runtrigger` effect and a `/trigger` command
  alternate recursion runs a bounded number of times, not unbounded.
- **B10.** `/speak x` after a character switch passes the take's character to `sayTTS`, not the
  selected one.
- **B11.** `/test_lorebook` after a chat switch scans the take's chat. Observable through its
  result, or through the subject its scan receives.
- **B12.** After a chat switch, the take's chat receives the content change from each of these, and
  the other chat is unchanged: `/sendas y`, `/comment y`, `/cut 0` and `/del 1`.
- **G1b / G2b.** The composer pipe and a trigger pipe end with an observable step after the write:
  `/speak x|/send hi|/setvar key=k v|/multisend z`, with the chat deleted during `/speak`. No
  request is made, the remaining chat is unchanged, and the detached chat object gains neither `hi`
  nor `$k`. A save mark is not asserted: the gone chat's owner may own other chats, and a mark only
  saves it.
- **C7.** `/send x|/speak y|/pass z` with busy pressed during `/speak`: `x` stays in the chat, the
  composer is empty, and `z` does not run (`MC-128`).
- **C8.** `/setvar key=k v|/speak y` with busy pressed during `/speak`: the composer is empty
  (`MC-128`).
- **C9 (guard).** A cancel during the input trigger puts the text back, and the trigger's own write
  stays (`MC-099` 3).
- **F7.** A button's `/multisend p|||q` in the take's own chat during its `/` stage, then busy: the
  take's text is put back (`MC-128`: a button's post never counts).
- **F8.** Window ownership through nesting, in two forms:
  - The take's input trigger runs `runtrigger` to a trigger whose command is `/multisend a|||b`:
    both segments are answered.
  - The take's `/` stage runs `/trigger t`, where `t`'s command is `/multisend a|||b`: both are
    answered.
- **F9.** A button's pipe runs `/trigger t`, where `t` runs `/multisend a|||b`, while the window is
  open: no replies, and the flag is untouched.
- **P8.** Post File in a chat whose id has two holders, clicked in holder A: every entry and reply
  lands in A (`MC-104` 1).
- **P9.** `postChatFile` with a `.po` file and no key sends and downloads nothing.
- **P10.** After an entry's `sendChat`, the chat has no messages (a trigger cut it): the entry's
  `msgstr` is empty, and the job continues and downloads.
- **P11.** Post File's pushes after a character switch mark the clicked character for save.

**Added in rev 3 (Gate 1 round 2), executed at HEAD (ledger row 435):** 11 tests, 8 FAIL, and 3
guards PASS.
- **Guards:**
  - N1b pins today's fallback.
  - N2d guards against a depth bound that ignores `lowLevelAccess`. HEAD has no bound at all, so it
    passes there.
  - N2e guards against ownership that is not forwarded through `/trigger` and `runtrigger`.
- **G1b/G2b** lost their save-mark assertion. They still fail at HEAD on the request count and on
  the remaining chat.
- **Every earlier row** was checked against the rev 3 rule and none contradicts it (C1, C2, C4, C7,
  C8, C9, F5, F7, G1, B9).
- **N1.** `/send x|/nosuchcommand` in the composer: the chat is `[…, 'x']`, the text is not posted,
  no request is made, and the composer is empty.
- **N1b (guard).** `/pass x|/nosuchcommand`: the text is sent as a message and generated, as today.
- **N2a.** `/trigger t` in the composer, where `t`'s command is `/speak y|/send a`, with busy
  pressed during `/speak`:
  - `a` is not posted, because the signal reaches `t`'s pipe;
  - the composer is empty, because `/trigger` counted at its start.
- **N2b.** `/test_lorebook|/speak y`, with busy pressed during `/speak`: the composer is empty.
- **N2c.** `/trigger t|/speak y`, where `t` writes nothing, with busy pressed during `/speak`: the
  composer is empty.
- **N2d.** A `/trigger t` chain whose invoking trigger has `lowLevelAccess` passes the depth of 10.
  The row caps its own count and asserts more than 12 runs.
- **N2e.** The take's `/` stage runs `/trigger t`; `t`'s `runtrigger` reaches `u`, whose command is
  `/multisend a|||b`: both segments are answered.
- **N2f.** A button's pipe runs a trigger whose `runtrigger` reaches `/multisend a|||b` while the
  window is open: no replies, and the flag is untouched.
- **K1c.** On `[m0, m1, m2]`:
  - `/cut -3` removes `m0`;
  - `/cut 1-9` removes `m1` and `m2`;
  - `/del 3` empties the chat.

## 6. Risks

- **Removing `setDatabase(db)`** drops its normaliser pass after command writes. Nothing a command
  writes needs normalising: it pushes `{role, data}` messages, edits `message` or `scriptstate`. The
  save mark replaces the tracking.
- **The composer's input trigger owning the window.** If the flag does not reach nested runs, a
  `/trigger` inside the input trigger's pipe would lose its replies. F3 covers the direct case;
  nested runs carry the flag (section 2.8).
- **A stopped composer pipe returns `false`.** On a cancel, `sendMain` returns first. Otherwise
  I7 decides:
  - **After a counting command,** the text is handled: it is neither posted nor put back.
  - **Before one,** `sendMain` treats the text as a message. On a gone chat the append is refused
    as well, and the text returns to the gone chat's record.

  In neither case is the command text posted to a live chat because the pipe stopped.
- **29 test files reference `processMultiCommand`.** 28 mock it as `vi.fn(async () => {})` without
  asserting its arguments, and a required second parameter breaks none of them.
  `generationOwnership.svelte.test.ts` calls the real function six times with one argument. It is
  in scope (section 3), or `pnpm check` and those tests fail.
- **Group chats** were not probed. The pipe's character is the owner, the same as a group on screen
  today.

## 7. Compatibility

- **Upstream characters, modules and presets with trigger commands** run the same commands with the
  same syntax. The only difference is that the commands now act on the run's chat instead of the
  chat on screen, and those are the same chat unless the user switches mid-run.
- **`/cut` and `/del` now delete what they name** (`MC-127` 1). Content relying on upstream's
  inverted behaviour would change. That behaviour contradicts the help text.
  - Upstream arguments that were malformed now remove nothing. At HEAD, `/cut 2-` emptied the chat,
    `/del 0` emptied it, and `/del 2abc` acted as `/del 2`.
  - `/cut 1 - 3` with spaces keeps working as a range.
- **After a command line has written, a failing command no longer posts the raw text.** At HEAD
  and upstream, `/send x|/nosuchcommand` posts `x`, then posts the raw command text and generates a
  reply. It now posts only `x`. With no earlier write, the fallback is unchanged (`MC-128`'s
  amendment).
- **A cancel after `/trigger` or `/test_lorebook` has started leaves the composer empty**, like a
  cancel after any other write (`MC-128`).
- **Unchanged:** the plugin API, the save format, and the `.po` file format.

## 8. Gate record

### Rows executed at HEAD (ledger row 430)

The run was done by `test-warrior` in scratchpad `w3/rows/`. It gave 62 FAIL and 11 PASS as
guards, and the plan was changed as a result (rev 1.1):
- **B5.** `{{setvar::}}` in an argument writes nowhere at HEAD, because arguments are parsed
  without `runVar`. Its row became a guard, and section 1 was corrected.
- **P5.** "Deleted during entry 2" already passes at HEAD. It became a guard, and two red rows were
  added.
- **K4.** A real uuid id takes the range form. The `/cut` form is now chosen by pattern (section
  2.7, scope amendment).
- **K8.** `/trigger` returns `undefined` in every chat, not only in groups.

Choices the test writer made, accepted:
- K9's bound is 12 runs.
- B6 uses a character switch.
- F5 asserts that the button's segments in the other chat get no replies (section 2.5).
- F2 clicks inside the composer's source setter at the end of each tick, which is inside the
  auto-mode window.

### Gate 1 round 1 (rev 1.1): [REJECT] (ledger row 432)

A fresh `adversarial-reviewer`. It re-ran both row files at HEAD (73: 62 FAIL, 11 guards PASS).
Each finding and how rev 2 answers it:
- **B1.** `/cut -N` past the start removes message 0, because `splice` clamps. The edge forms were
  undefined.
  - Rev 2: section 2.7 defines every form by pattern and range. Rows K1b and K3b; compatibility
    note.
- **B2.** A per-chat push counter lets a trigger button's post into the take's own chat suppress
  the put-back.
  - Rev 2: the record is per pipe (sections 2.4 and 2.8, I7). Row F7.
- **B3.** Window ownership through nested runs and `/trigger` had no row.
  - Rev 2: forwarding is stated (section 2.5, I6). Rows F8 and F9.
- **B4.** A cancel after an earlier write puts the text back, and a resend replays the write.
  - Put to the maintainer: `MC-128`, any write of the pipe keeps the composer empty. Section 2.4,
    rows C7 and C8, guard C9.
- **B5.** Post File in a duplicated-id chat would do nothing.
  - Orchestrator: its replies are sends, so it gets the click-time hint (`MC-104` 1). With no key,
    nothing happens. Section 2.6, I4, rows P8 and P9.
- **B6.** `generationOwnership.svelte.test.ts` calls the real `processMultiCommand` six times.
  - Rev 2: added to scope, and the risk corrected.
- **B7.** Rows a wrong implementation passes.
  - Rev 2 adds: G1b and G2b (writes to a detached copy), B10 (`/speak`'s character), B11
    (`/test_lorebook`), B12 (content rows), P11 (Post File marks), K10 (mixed depth).
  - The two unexecuted rev 1.1 rows (K4b, K8b) are executed before round 2.
- **Editorial, taken:**
  - "every row is executed" versus the unexecuted rows;
  - 28/29 files;
  - section 2.4's wording;
  - `splice` wording;
  - section 2.6 against `MC-104`;
  - `/addvar` on an existing non-numeric value, kept as upstream and stated;
  - Post File's missing last message, now an empty `msgstr` (row P10).
  - The per-chat map's reset hook is moot: there is no per-chat map.

### Rev 2 rows executed at HEAD (ledger row 433)

`test-warrior`, scratchpad `w3/rows/` (`body.rev2.frag`, `run7.json`, `results-head.txt`). The 73
rows from before are unchanged in status and in their failure messages. One assertion was dropped:
G1b's save-mark check (section 5). The rest is as section 5 records.

### Gate 1 round 2 (rev 2.1): [REJECT] (ledger row 434)

The same `adversarial-reviewer`. It re-ran the rows at HEAD: 109 tests, 91 FAIL, 18 guards PASS.
Round 1 was closed except as below.
- **N1.** After a write, the unknown-command fallback was undefined. `sendMain`'s "handled"
  decision reads the same `/multisend`-only counter as the put-back.
  - Rev 3: a pipe that returns `false` after counting as written has its text handled (section 2.4,
    I7, I10). Rows N1 and N1b.
- **N2.** Rows a wrong implementation passes: the record through nested runs, `/trigger` and
  `/test_lorebook` counting and when, the signal through `/trigger`, the `lowLevelAccess` bypass,
  and composite ownership chains.
- **N3.** Section 2.4 added `/trigger` and `/test_lorebook` to `MC-128`'s list without recording it.

**At the second rejection, the Orchestrator asked whether the mechanism was the problem.** Partly,
yes.
- The round-1 answer counted writes after each command, then forwarded the record into nested runs.
  That forwarding is what N2 found holes in.
- Rev 3 counts at the start of any command outside a fixed non-writing set. This settles when
  `/trigger` counts (at its start), and it removes forwarding of the record entirely.
- N3 was recorded as the Orchestrator's reading of `MC-128` pending the maintainer. They
  confirmed it after round 3 (`MC-128`'s amendment).

Rows N1, N1b, N2a-N2f and K1c were added. Editorial, taken:
- P9's note;
- K4b and K8b are executed;
- the sources header lists `MC-128`;
- the optional boundary rows, now K1c.

### Rev 3 rows executed at HEAD (ledger row 435)

`test-warrior`, scratchpad `w3/rows/` (`body.rev3.frag`, `run8.json`, `results-head.txt`). The
earlier 109 are unchanged except the edited G1b/G2b. One comment in F7 was reworded to the rev 3
rule, with no change to its expectation.

### Gate 1 round 3 (rev 3.1): [EDITORIAL] (ledger row 436)

The same `adversarial-reviewer`. It re-ran the rows at HEAD: 120 tests, 99 FAIL, 21 guards PASS.
- **No behavioural finding.** N1-N3 are closed, each by a discriminating row.
- **The counting rule held under attack.** No command in the non-writing set writes chat state:
  CBS writes in arguments need `runVar`, which command arguments never set. Counting at the start
  is consistent with a gone chat, a `false` result and `/multisend`'s no-reply mode. No nested
  write can replay.
- **Editorial, applied in rev 3.2:**
  - section 2.8 said the record is set "after" each command; it is set at the start;
  - section 6's "stopped pipe" risk contradicted I7;
  - section 7 lacked the two upstream-visible changes;
  - N3 was marked disclosed rather than decided. The maintainer then confirmed both readings as
    `MC-128`'s amendment.
- **Optional rows, taken for the red-test stage:**
  - `/input q|/speak x` and `/getvar key=k|/speak x`, cancelled during `/speak`: the text goes back;
  - `/trigger t|/nosuchcommand` and `/test_lorebook|/nosuchcommand`: handled, nothing posted;
  - a cancel during a running `/test_lorebook` scan: the composer is empty.

### Red tests and the fix (ledger rows 437-438)

- **Red tests.** `src/ts/process/tests/commandLineOrigin.svelte.test.ts` and
  `commandLineOriginParser.svelte.test.ts` (LF) hold 125 tests. At `61b5a885`, 102 fail on
  assertions and 23 guards pass.
- **The fix, by `sonnet-coder`,** is in the section 3 files.
  - `processMultiCommand(command, ctx)` builds one subject per line.
  - It checks for a gone chat and for an abort before every command and before every `/multisend`
    segment.
  - `noteWrite` fires at the start of the counting commands.
  - Writes go into the resolved chat, followed by `subject.mark()`.
  - The take reads `record.wrote`, and the global push counter is deleted.
- **Test-only scope note.** The eight `postChatFile(poFile(...))` calls in
  `generationOwnership.svelte.test.ts` now pass the key and the hint that the chat screen passes.
  No assertion changed.

### Gate 2 (ledger rows 439-441)

**Round 1: [EDITORIAL], `opus-reviewer` (row 439).**
- **Pre-change run.** The reviewer ran its own swap of the production modules to `61b5a885`: 102
  FAIL, and every guard passes.
- **Mutants.** 35 were run and 30 were killed. The survivors are M02, which is equivalent, and four
  test gaps.
- **Editorial findings:**
  - **E1:** the `depth` doc comment was false.
  - **E2:** the parser file's header had been copied from the other file.
- **Optional findings, O1-O9.** O6 was taken as a behaviour fix: `/trigger` did not count its
  siblings, so fan-out grew as 2^10.

**Remediation (row 440).**
- **Taken:** E1, E2, O1, O2, O4, O7, O8, O9 and O6.
- **O6.** `/trigger` now draws on the run's own `recursiveCount` through a shared reference. It
  applies `runtrigger`'s exact check, increment and passed value. The test is a differential against
  `runtrigger`: `/trigger self|/trigger self` and the same shape with two `runtrigger` effects must
  run equally often.
  - The Orchestrator's first expectation for this row, "at most 30", was wrong. `runtrigger`'s own
    fan-out is Fibonacci-like (143 runs) and is upstream behaviour.
  - An interim read-back version (10 runs) was rejected because it is stricter than `runtrigger`.
- **Declined:**
  - **O5.** Importing the constant into `triggers.ts` breaks tests that mock `./command`.
  - **O3.** No production path replaces the chat object during a segment.

**Remediation review: [EDITORIAL] (row 441).**
- O6 matches `runtrigger`.
- E1 still had one false sentence. The Orchestrator applied the reviewer's wording.
- **Mutants.** 40 were run. R4 (a run's context copies the count) survived, and a differential row
  was added for it. R7 (a fresh count per composer command) was left: it only matters past ten
  `/trigger`s in one composer line.

### Live check (ledger row 442): passed

The check ran on a production build and Node server, in Claude in Chrome. The main model was a
plugin probe with a 6-second delay and no network access; the auxiliary model was Echo.

- **L1.** `/multisend a|||b` was sent in Chat 1, and the user switched to Chat B during the first
  reply.
  - Every segment, reply and output-trigger `/sendas` landed in Chat 1.
  - Chat B was untouched.
  - The second request was built from Chat 1.
- **L2.** `/cut 1-3`, `/cut <uuid>` and `/del 1` each removed exactly what they name.
- **L3.** `/sendas z|/nosuchcommand` posted only `z`.
- **L4.** While an `/input` prompt is open, the busy button cannot be pressed.

Not exercised live: Post File, trigger buttons, and a cancel before a write. The tests cover all
three.
