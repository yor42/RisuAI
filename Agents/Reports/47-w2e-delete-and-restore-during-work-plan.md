# Report 47 — W2e: a delete warns and stops the work in the chat; a backup load waits for work

**STATUS:** plan rev 2.2, 2026-09-30. **Gate 1 passed:** round 2 [EDITORIAL] (ledger row 448), its
corrections applied in rev 2.2. **Gate 2 passed** (row 451 [REJECT], test-only; remediation [APPROVE],
row 452). **Live check passed** (row 453). Commit-message check (row 454). **Committed** as
`baf238e7`, records the commit after it. Round 1 [REJECT] (ledger row 446) was answered in rev 2 with the
`MC-129` amendment (a stop ends a trigger's remaining effects). Rev 2.1 records rev 2's rows executed
at HEAD (ledger row 447): 53 tests, 37 FAIL on their named value, 16 PASS (14 guards and R4a/R4b,
which pass by accident), identical on a second run.
- Rev 1.1 records every section 5 row executed at HEAD (ledger row 445; scratchpad `w2e/rows/`, five
  files): 34 tests, 23 FAIL on their named value, 11 PASS (the guards, plus the first S4 test, which
  rev 1.1 superseded), identical on a second run. G1 and G2 test an API that does not exist yet and
  are written with the fix.
- Rev 1.1 also folds in what that run found: a permanent delete already stops a `/multisend` or Post
  File job (W3's gone-chat rule), so only a trash is red there (S4, S5); auto mode already stops at its
  next tick boundary (S6); the stale-index deletes are run, not inferred (R1-R3); an abort keeps the
  partly streamed reply and clears `isStreaming` (X1); `loadInternalBackup`'s two confirmations are in
  its caller, `UserSettings.svelte` (2.5).

**Sources:**
- the W2e scoping packet (ledger row 444; scratchpad `w2e/packet.md`), whose decision-critical
  claims the Orchestrator re-checked in source;
- the maintainer's answers, recorded as `MC-129`.

Decisions this plan implements: `MC-075` 2, `MC-078`, `MC-103` 2 and its defaults, `MC-104` 1,
`MC-126` 1, `MC-127` 5, `MC-128`, `MC-129` and its amendment. Scope amendments under `MC-091`:
section 3, items 4 and 5.

## 1. What is wrong at HEAD (`26d57bdc`)

1. **A delete never warns and never stops anything.** The three chat-delete handlers
   (`SideChatList.svelte` twice, `Others/ChatList.svelte` once) and `removeChar` in
   `characters.ts` confirm with `language.removeConfirm + name` whatever is running. A reply being
   generated into the deleted chat keeps streaming and spends tokens (`MC-103` 2 is unimplemented).
   After a **permanent** delete, a `/` line, `/multisend` and a Post File job already stop at their
   next step, because their chat is gone (`MC-126` 6); only the step in flight runs on.
2. **A trash leaves every piece of work writing into the trashed character.** Trash only sets
   `trashTime`, and the resolver in `chatOrigin.ts` resolves a trashed character "ok" (pinned by
   `chatOrigin.resolution.svelte.test.ts`). The reply finishes, auto mode ticks until its chat
   check fails, and later `/multisend` segments, Post File entries, auto-continues and trigger
   writes all land in the trashed character.
3. **Nothing can stop "the work in chat X".** The registry (`registerWork`/`beginWork`,
   `WorkHandle`, `isWriting`) records `{chaId, chatId, memberChaId?}` only: no way to stop the
   work. `publishUnit` keeps the running send's controller without its origin. The only stop is
   `abortChat`, which is global: it aborts whatever send runs in any chat and switches auto mode
   off. `isWriting` has no production caller, and it counts a group member's turn as writing into
   the member's own character.
4. **A trigger run cannot be stopped between effects.** `runTrigger` in `triggers.ts` reads its
   signal only for its `/` command lines and to forward it to nested runs; before each effect it
   checks only that its chat still resolves, which a trashed chat does. A send's start, input and
   output triggers therefore run all their remaining effects (model calls, posted messages) after
   the busy button, and would after a delete. A trigger-button run (`handleButtonTriggerWithin` in
   `Chat.svelte`) gets no signal at all (`MC-126` 1 leaves it without a cancel from the busy
   button). Run in Gate 1 (row 446): a run holding `/input`, trashed and aborted, still posted its
   next effect's message.
5. **The chat-delete handlers can delete the wrong chat.** Each awaits the confirm, calls
   `changeChatTo(0)`, then splices: `SideChatList`'s folder branch at
   `chara.chats.indexOf(chat)` (−1 when the chat is already gone, which removes the last chat),
   the other two at a loop index read before the await (the wrong chat once the list shifted
   during the confirm). Run at HEAD (rows R1-R3): with a chat inserted at the top during the
   confirm, the neighbour is removed and the confirmed chat kept; with the confirmed chat already
   gone, the folder branch removes the last remaining chat. `CharConfig.svelte`'s delete passes
   `removeChar` the selected index, read before its two confirmations, so a character list that
   shifts during them trashes the wrong character (GridCatalog passes the object).
6. **A backup load straddles running work.** `loadInternalBackup` (one caller,
   `UserSettings.svelte`) swaps `DBState.db` without a reload and checks nothing. Writes resolved
   by id afterwards land in the restored database's same-id chat, mixed with the send body's
   old-database objects; the user message pushed before the swap is lost. `LoadLocalBackup` in
   `backuplocal.ts` writes `database.bin`, installs and reloads, also without a check.

Upstream (`f9728b14`) has none of this: no registry, no check in any delete handler or backup
load, and the same three handlers.

## 2. The design

### 2.1 What "work in a chat" is

Work in a chat is any registered unit whose **owner** is that chat: `{chaId, chatId}` equal to the
chat's owner character (or group) and the chat's id. Work in a character is any registered unit
whose owner `chaId` is that character's, in any of its chats. A unit registered for a group turn
counts for the group and its chat, **never** for the member character (`MC-129` 3): deleting the
group, or its chat, warns and stops the member's turn; deleting the member does neither.

The registered units at HEAD (packet Q1, re-checked): the composer take (Send/Continue, its `/`
line, its input trigger and generation), every `sendChat` level (group turns, auto-continue,
resend, and every starter that goes through it: reroll's generation, auto mode's ticks, the
preview hotkey, DevTool, plugin `sendChat`, `/multisend` segments, Post File entries), reroll,
auto mode, `/trigger`, and a trigger-button run. Every flow that writes into a chat after an
await is among them. W2e adds no new kind of registration; it gives each registration a way to be
stopped.

### 2.2 The warning (`MC-075` 2, `MC-103` defaults, `MC-129` 2 and 3)

- On the **first** confirmation of a delete, when work is running in the chat (a chat delete) or
  in the character (a character or group delete, trash or permanent alike), the confirmation shows
  the usual text and, on its own line, a short warning that something is currently writing into
  it and that deleting stops it, though a step already running may still finish. One new string for a chat and one for a character, in `en.ts`,
  then the six other languages.
- When nothing is running there, the confirmation text is exactly what it is at HEAD.
- `removeChar`'s second confirmation is unchanged.
- Deleting a character that is only a **member** of a busy group shows no warning and stops
  nothing (`MC-129` 3).
- The warning is read when the confirmation opens. It is advisory: what is stopped is decided at
  removal (2.3).

### 2.3 A confirmed delete stops the work (`MC-103` 2, `MC-129` 1 and 2)

- After the last confirmation, in the same synchronous stretch as the removal, every unit
  running in the deleted chat (or any chat of the deleted character) is stopped, **whether or not
  the warning was shown** (work may have started or ended while the confirmation was open).
  Work in any other chat, including auto mode or a send there, is untouched.
- "Stopped" means what the busy button does to that unit, applied to that unit only:
  - a send being generated is aborted (a partly streamed reply is kept and post-processed as the
    busy button keeps it; continuations stop: group turns, auto-continue, resend);
  - a composer take still before its push is cancelled, with `MC-128`'s rule for its text;
  - auto mode started in that chat stops; auto mode elsewhere keeps running;
  - a `/` command line stops before its next command, and `/multisend` and Post File stop before
    their next segment or entry;
  - a composer take after its push, before the send has taken over, is stopped through the take's
    own signal, so the send it hands off to refuses at entry;
  - a trigger run (a send's start, input or output trigger, a nested run, or a trigger-button run)
    starts no further effect, and its `/` command lines stop before their next command. The effect
    already running finishes, including a model call or a Lua script (`MC-129` 1 and amendment).
    A trigger-button run gets its own signal, used only by a delete (the busy button still does not
    reach it, `MC-126` 1).
- Trash and permanent delete stop the same work. After a trash, a straggling write that still
  lands goes into the trashed character, which a restore brings back (`MC-129` 2); the resolver's
  "a trashed character resolves ok" rule does not change. After a permanent delete, such a write
  finds its chat gone and drops silently (`MC-075` 2).
- After the stopped units settle, the registry holds nothing for the deleted chat or character.

### 2.3a The busy button and trigger effects (`MC-129` amendment)

The busy button aborts the running send's signal at HEAD. With the per-effect check in 2.3, that
abort also ends the send's start, input or output trigger at its next effect, and every run nested
in it. Nothing else about the busy button changes.

### 2.4 The chat-delete handlers delete the chat that was confirmed

Scope amendment (`MC-091`, a technical prerequisite): the stop in 2.3 and the removal must name the
same chat, and that must be the chat the user confirmed.
- After the confirmation, each handler finds the confirmed chat object in its owner's live `chats`
  by reference. If it is no longer there, or it is now the owner's only chat (the one-chat rule each
  handler applies before its confirm), the handler removes nothing and stops nothing.
- Otherwise it stops that chat's work and removes exactly that chat. `changeChatTo(0)` stays as at
  HEAD; the removal is by the reference found, not by an index read before the await.
- `removeChar` resolves a character object by reference after its confirmations, but a number by
  the index it was given. **Amendment (`MC-091`):** `CharConfig.svelte` passes the selected
  character object, as GridCatalog does. The work stopped is that of the character actually
  resolved at removal.

### 2.5 A backup load waits for work (`MC-127` 5, `MC-129` 4)

- **"Work in progress"** is: any registered unit, a send holding `doingChat`, or the composer's
  window open.
- `loadInternalBackup` refuses while work is in progress, with a message that work is in progress
  and to wait for it or stop it first. It checks before anything is asked: its caller in
  `UserSettings.svelte` asks two confirmations before calling it, and the backup picker is inside
  it; a refusal comes before both. It checks again immediately before it installs the decoded
  database, after every await; a refusal at that check installs nothing and changes nothing.
- `LoadLocalBackup` refuses the same way: before its caller's two confirmations and its file
  picker, when the picker returns, and again immediately before the database write, after every
  await (the decode, the cold-storage checks and confirm, and the write lock's acquire).
- The refusal message says that work is in progress and to wait for it or stop it; a reload also
  ends all work (a trigger-button run shows no busy state).
- One new message string, in seven languages.
- When no work is in progress, both behave exactly as at HEAD.

### 2.6 Mechanism (non-normative)

- A registration may carry a `stop` callback. `sendChat`'s outer call passes its unit's abort; the
  take passes a stop that cancels its record before the push (as `abortChat`'s pre-push branch
  does) and aborts `record.controller` after it; auto mode
  passes "stop this loop"; the trigger-button run passes its own controller's abort, and hands the
  signal to `runTrigger`.
- `chatOrigin.ts` gains an owner-only query (`hasWorkIn({chaId, chatId?})`), a stop
  (`stopWorkIn(target)`, calling each matching registration's `stop` once) and an any-work query.
  `isWriting` keeps its member-inclusive meaning or is replaced; the implementer chooses, and
  names the choice in the gate record. The stop snapshots the matching registrations before
  calling any stop (a stop may end its own registration).
- The stops run after `changeChatTo(0)`, immediately before the removal, with the removal's
  target found in the same stretch.
- `runTrigger` checks its signal wherever it already checks `refreshSubject()` before an effect
  or loop step.
- The delete helpers and the backup check live where the implementer judges best, but the three
  chat handlers share one helper rather than three copies.

## 3. Scope

1. `src/ts/process/chatOrigin.ts`: registration with a stop; the owner-only query, the stop and the
   any-work query.
2. `src/ts/process/index.svelte.ts`, `composerActions.svelte.ts`: pass a stop for the send unit,
   the take and auto mode.
3. `src/lib/ChatScreens/Chat.svelte`: the trigger-button run gets a controller and passes its
   signal. `src/ts/process/triggers.ts`: the signal is checked before each effect and loop step
   (`MC-129` amendment).
4. **Amendment (`MC-091`):** `SideChatList.svelte` (both chat handlers) and `Others/ChatList.svelte`
   re-find the confirmed chat by reference after the await.
5. `src/ts/characters.ts` (`removeChar`): warning and stop. **Amendment (`MC-091`):**
   `src/lib/SideBars/CharConfig.svelte` passes the character object.
6. `src/ts/globalApi.svelte.ts` (`loadInternalBackup`), `src/ts/drive/backuplocal.ts`
   (`LoadLocalBackup`), and their caller `UserSettings.svelte` if the check belongs there.
7. `src/lang/en.ts` for three strings (the chat warning, the character warning, the backup refusal),
   then the six other languages through `translator`.
8. Tests (section 5).

**Not in scope:**
- The busy button still cannot cancel a trigger-button run (`MC-126` 1); only a delete stops one.
- A Lua button run (`runLuaButtonTrigger`), and a Lua script inside a trigger, are not interrupted;
  each finishes, as an effect in flight does.
- A trigger's own model or image request (`requestChatData` inside `triggers.ts`) receives no
  signal; the request finishes, its effect completes, and no later effect starts.
- **Duplicate ids.** The registry matches by id. While an id has two holders mid-session (repaired
  at boot and on every restore, `MC-078`), deleting one holder warns about, and stops, work that the
  other holder's send writes to (`MC-104` 1). Disclosed, not fixed.
- `storageMaintenance.ts`'s OPFS migration reloads the page without a work check; it is not a
  backup load and is not named in `MC-129` 4.
- `google.ts`'s Vertex token refresh calls `setDatabase(getDatabase())` mid-generation, which
  clears `isStreaming` on every chat (packet Q4, inferred). Recorded for Carry-Forward.
- A click on a trigger button in a group chat is ignored (`handleButtonTriggerWithin` returns for a
  group), so there is nothing to register there.

## 4. Invariants

- **I1.** With nothing running in a chat, its delete confirmation text is exactly HEAD's.
- **I2.** With work running in a chat (or in a character, for a character delete), the first
  confirmation shows the warning; the second (`removeChar`) does not.
- **I3.** A work unit registered only as a group member's turn never produces the warning and is
  never stopped by deleting the member character.
- **I4.** After a confirmed delete, no unit bound to the deleted chat (or character) starts another
  command, trigger effect, segment, entry, turn, tick or request. Units bound to other chats are
  untouched: their signals are not aborted, and auto mode elsewhere keeps running.
- **I4a.** After the busy button, the running send's triggers start no further effect.
- **I5.** A delete removes exactly the chat (or character) the user confirmed, or nothing if it is
  gone or is its owner's only chat.
- **I6.** A trash keeps what the stopped work had already written, including a partly streamed
  reply; a permanent delete drops every later write for the deleted chat silently, with no throw
  and no write into another chat.
- **I7.** Every registration still ends in a `finally`; after the stopped work settles, the registry
  is empty for the deleted target, and a stop called twice (or after the unit ended) does nothing.
- **I8.** A backup load never installs a database while work is in progress; with no work in
  progress it behaves exactly as at HEAD.
- **I9.** The plugin API is unchanged: `sendChat` still throws while a chat is in progress
  (`MC-103` 1); `setChar`, `setCharacterToIndex`, `setChatToIndex`, `setDatabase` and
  `setDatabaseLite` keep their contracts.

## 5. Tests (written before the fix; red at HEAD unless marked guard)

Harnesses to reuse (packet Q7): `generationOwnership.svelte.test.ts` (real `$state` database, a held
provider stream, the real composer, `abortChat`, the `.po` job, DevTool, plugin `sendChat`);
`GridCatalog.duplicateChaId.svelte.test.ts` (real `removeChar`, mocked confirm);
`SideChatList.newChat.svelte.test.ts` and `ChatList.newChat.svelte.test.ts` (mounted real
components); `Chat.triggerOriginWrites.svelte.test.ts` (a manual trigger run);
`chatOrigin.registry.svelte.test.ts`; `globalApi.loadInternalBackup.svelte.test.ts` and
`drive/tests/backuplocal*.test.ts`.

Each row names the value it asserts. Each is to be executed at HEAD before Gate 1, with its HEAD
result recorded in section 8.

**Delete warning (D)**
- D1. Chat A streaming a held reply; delete A from `SideChatList` (folder-less branch): the confirm
  text contains the chat warning.
- D2. Same through `SideChatList`'s folder branch and through `Others/ChatList`.
- D3. guard: nothing running; the confirm text equals `removeConfirm + name` exactly (all three
  handlers and `removeChar`).
- D4. guard: a send streaming in chat B of the same character; deleting chat A shows no warning.
- D5. A send streaming in the character's chat B; trashing the character through `removeChar`: the
  first confirm contains the character warning, the second does not.
- D6. A group turn streaming as member M; trashing M: no warning (guard at HEAD for the text; the
  stop half is S7).
- D7. A trigger-button run held on a non-modal step (a held model call) in chat A; deleting A shows
  the warning.
- D8. A group's turn streaming as member M; deleting the group chat shows the warning.

**Stop on confirmed delete (S)**
- S1. Chat A streaming; confirm the delete: the provider's signal is aborted, `doingChat` is false
  after settling, the registry is empty, chat A is gone, and no message lands in any other chat.
- S2. Trash the character while its chat streams: the request is aborted, `trashTime` is set, and
  the trashed chat holds the partial reply.
- S3. Permanent delete while streaming: aborted; no write anywhere afterwards, no throw.
- S4. Composer `/multisend a|||b` in chat A, delete A during a's reply: the reply's request is
  aborted. (That `b` is never posted and no second request starts already holds at HEAD, where the
  chat is gone; kept in the row as a guard clause.)
- S4t. Same, but trash the character: the request is aborted, `b` is never posted, and no second
  request starts.
- S5. A Post File job in chat A, trash the character during an entry's reply: the request is
  aborted and no later entry is posted.
- S6. Auto mode in chat A (on screen); delete A: auto mode is inactive at once and the tick's
  request is aborted. (No further tick already holds at HEAD.)
- S7. A group turn streaming as member M; trash M: the group's request is **not** aborted, and the
  group's reply lands (guard at HEAD).
- S8. Chat B streaming (another character); delete chat A of the first character: B's request is
  not aborted and auto mode in B keeps running (guard).
- S9. A trigger-button run in chat A whose trigger holds a model call and then runs `/send y`;
  trash the character during the call, then release it: `y` is not posted.
- S9e. A trigger-button run whose effects are a held model call, then a posted message, then a
  second model call; trash the character during the first call, then release it: no message is
  posted and no second request starts.
- S10. A composer take in chat A before its push (held `/speak`); delete A: the take is cancelled,
  the window and lock close, nothing is posted.
- S11. The warning was not shown (nothing running when the confirm opened), and a send starts in
  chat A while the confirm is open (a plugin `sendChat`); confirming stops it.
- S12. Work in chat A ends while the confirm (with the warning) is open, and a send starts in chat
  B: the confirm carried the warning (red), and confirming deletes A without aborting B's send
  (guard clause).
- S13. A group's turn streaming as member M; delete the group's chat: the request is aborted and no
  further member's turn starts.
- S14. A trigger-button run held on a model call in chat A **and** a send streaming in chat B;
  **trash** the character: the trigger run starts no further effect, and B's request is not
  aborted (B belongs to a second character, so the trash does not touch it). A second variant runs auto mode in B instead: auto
  mode stays active right after the confirm. guard variants: the same with a delete of chat A,
  where the run already stops at HEAD because its chat is gone. A scratch mutant whose deletes call
  the global `abortChat()` fails every variant on the B clauses (`w2e/rows/m1.json`).
- S15. A composer take in chat A after its push, inside the hand-off before `sendChat` (the
  harness's intercepted sleep); trash the character there: no request starts.

**Busy button and trigger effects (T)**
- T1. A send whose start trigger holds a model call and then posts a message; press the busy
  button during the call, then release it: the message is not posted, and the held call's output
  variable is set (the effect already running finishes).
- T2. guard: the same send without the busy button posts the message and generates.

**Right chat (R)**
- R1. `SideChatList` folder-less branch: while the confirm for chat 2 is open, a new chat is inserted
  at index 0; confirming removes chat 2, not its new neighbour.
- R2. Same for `Others/ChatList`.
- R3. `SideChatList` folder branch: chat X is removed by another path while its confirm is open;
  confirming removes nothing (the last chat survives).
- R4. A character with two chats; while the delete confirm for one chat is open, the other is
  removed by another path: confirming removes nothing (the one-chat rule). R4a (folder-less) and
  R4b (`ChatList`) deleting chat 2 pass at HEAD by accident (`splice(1,1)` on a one-chat list);
  the discriminating variants are R4c (folder branch) and R4d/R4e (deleting chat 1 while chat 2 is
  removed), which empty the list at HEAD.
- R5. `CharConfig`'s delete of the selected character; while its confirmations are open a character
  is inserted before it: the confirmed character is trashed and its neighbour is not.

**Backup load (B)**
- B1. A send streaming; `loadInternalBackup`: refused with the message, `DBState.db` is the same
  object, no confirm asked.
- B2. No work at the start; a send starts during the decode (the last await before the install);
  at install it is refused and `DBState.db` is unchanged.
- B3. guard: no work; `loadInternalBackup` installs as at HEAD.
- B4. A send streaming; `LoadLocalBackup`: refused before `database.bin` is written.
- B5. guard: no work; `LoadLocalBackup` behaves as at HEAD.
- B6. Composer window open without a send (a take held on `/input`): refused.
- B7. No work at `LoadLocalBackup`'s start; a send starts during the file read (B7a) and during the
  last await before the database write (B7b); the database write does not happen.
- B8. A send streaming; the backup buttons in `UserSettings.svelte`: refused before either of their
  confirmations is asked.

**Registry (G)** (new API: written with the fix, not executable at HEAD)
- G1. A stop callback runs once per matching registration; a second `stopWorkIn` and a stop after
  `end()` do nothing.
- G2. The owner-only query ignores a member-only registration; a chat query ignores another chat of
  the same owner.

## 6. Risks

- **The busy button now ends a send trigger's remaining effects** (`MC-129` amendment). A start
  trigger stopped half-way leaves what its earlier effects did: variables and lore flags, and
  message edits half done (an output trigger `[v2CutChat, v2RunLLM, v2Impersonate]` stopped during
  the model call leaves the message cut and never re-added; inferred). `MC-126` 1 already allows
  the same for `/` lines. That is the maintainer's chosen rule; T1 pins it, and the gate should check no other caller of `runTrigger`
  passes a signal that is aborted in normal operation.
- **A leaked registration** (a missing `end()`) now shows a warning that never clears and refuses
  every backup load until a reload. Every production registration ends in a `finally` (packet Q1);
  G1 and S1's "registry empty" checks cover the new stop path.
- **`abortChat` ends the take's registration before its stalled step returns.** A delete in that
  window finds no take to stop; the step then sees its aborted signal and returns. Covered by S10
  only if the step posts nothing; the reviewer should check this path.
- **Stopping inside the removal stretch.** An abort runs listeners synchronously; nothing a stop
  callback does may await or change the character list before the removal.
- **Trash keeps a partial reply** (`MC-129` 2, intended). A reviewer should confirm that a trashed
  chat's partial reply is post-processed the same way the busy button's is, not left mid-stream
  with `isStreaming` set.
- **Real-use reachability.** An `/input` or `/buttons` prompt covers the screen, and a delete
  confirmation opened behind it waits for it (`alertPrompts.ts` queues prompts). Rows that hold a
  run use a non-modal step (a held model call) instead.
- **The composer's put-back** for a cancelled take writes the taken text into the deleted chat's
  draft record. For a trash that is what a restore should bring back; for a permanent delete the
  record is orphaned exactly as a typed draft of a deleted chat is at HEAD.

## 7. Compatibility

- No save-format change: nothing new is stored. The registry is in memory only.
- Upstream characters, modules, presets and backups are unaffected; a backup load behaves as at
  HEAD whenever nothing is running.
- Plugins: no API changes (I9). A plugin that deletes nothing sees no difference; a plugin
  `sendChat` into a chat the user deletes is aborted like any send, which a plugin already handles
  as the busy button's abort.
- Lang files: three new keys; existing keys and their text are unchanged.

## 8. Gate record

### Rows executed at HEAD (ledger row 445)

`test-warrior`, scratchpad `w2e/rows/` (five files, config `vitest.w2e.config.ts`), against
`26d57bdc` with no source changes, twice with identical results: 34 tests, 23 FAIL on their named
value, 11 PASS (D3a, D3b, D4, D6, S7, S8, S9's delete variant, B3, B5, the X1 diagnostic, and the
first S4 test).
- S4 as first written passed at HEAD: after a permanent delete the pipe already stops. Rev 1.1 added
  the abort (S4) and the trash variant (S4t, red: `b` posted, two requests); the first test was
  removed with rev 2's rows.
- S6 and S12 are red only on the clauses now named; their other clauses hold at HEAD.
- R1 and R2 remove the shifted neighbour (`['cn','c2','c3']` for `['cn','c1','c3']`); R3 leaves `[]`
  for `['c1']`.
- X1: `abortChat` on a streaming send keeps the partial text, clears `isStreaming` and `doingChat`.
- B rows: at HEAD, `loadInternalBackup` asks only its picker; the discriminating clauses are
  `DBState.db` identity, the `setDatabase` call and the picker not asked.
- Approximations: S11 starts the send inside the mocked confirm; B2 starts it from inside the
  backup read; B6's held take is both registered and window-open, so the two cannot be told apart
  there.

### Gate 1 round 1 (rev 1.1): [REJECT] (ledger row 446)

`opus-reviewer`, fresh. Re-ran the rows: 34 tests, 23 FAIL, 11 PASS (the plan said 24 and 10).
- **M1 (MAJOR, design):** a trigger run's later effects are not stopped after a trash: `runTrigger`
  reads its signal only for command lines. Run (`gate1/g1diag.svelte.test.ts`, DIAG-E): a run holding
  `/input`, trashed and aborted, then posted its next `v2Impersonate`. The send's own triggers share
  the gap. Answered by the `MC-129` amendment (a stop, from a delete or the busy button, ends a
  trigger's remaining effects): 2.3, 2.3a, I4, I4a, rows S9e, T1, T2.
- **M2 (MAJOR, tests):** no row has work in the deleted chat and in another chat at once, so a fix
  that calls the global `abortChat` passes. Answered by S14.
- **m1:** the take after its push, before `sendChat`, has no stop. Answered in 2.3 and S15.
- **m2:** re-finding by reference lets the last chat be deleted. Answered in 2.4, I5 and R4.
- **m3:** `CharConfig` passes `removeChar` an index read before the confirms; "`removeChar` resolves
  by reference" was false for it. Answered by an `MC-091` amendment (2.4, section 3) and R5.
- **m4:** duplicate ids: a delete of one holder stops the other's work. Disclosed in section 3.
- **m5:** B2 starts too early; no row for `LoadLocalBackup`'s second check or for the refusal before
  `UserSettings`' confirmations. Answered by B2, B7, B8 and 2.5.
- **m6:** no row for a group's own delete during a member's turn. Answered by D8 and S13.
- **m7:** the warning overpromised. Reworded in 2.2.
- **Editorial:** E1 (counts; the superseded S4 test) in the STATUS; E2 (S12's title), E4 (rows held
  on a modal `/input`, which a user cannot reach behind the prompt) in rows D7, S9 and section 6;
  E3 ("the database write"); E5 (a group ignores trigger-button clicks).
- **Optional, taken:** snapshot registrations before stopping; stop after `changeChatTo(0)`; the
  refusal message mentions a reload; `LoadLocalBackup` re-checks after its picker returns.

### Rev 2 rows executed at HEAD (ledger row 447)

`test-warrior`, resumed; seven files in `w2e/rows/`; twice, identical: 53 tests, 37 FAIL on their
named value, 16 PASS.
- A chat delete already stops a trigger-button run at HEAD (its chat is gone), so S9's and S14's red
  variants use a trash; the delete variants are guards.
- S13 is red only on the abort; "no further member turn" already holds.
- R4a and R4b pass by accident; R4c-R4e are red (the list is emptied).
- S14 against a scratch mutant calling the global `abortChat()` on delete: fails on B's signal and
  `doingChat` (send variant) and on the tick's signal and auto mode (auto variant).
- Approximations: R5 mounts the real `CharConfig.svelte` (child lists stubbed); B8 mounts the real
  `UserSettings.svelte`; B2 hooks `decodeRisuSave`; B7 hooks the file-read loop's sleep.

### Gate 1 round 2 (rev 2.1): [EDITORIAL] (ledger row 448)

`opus-reviewer`, resumed. Re-ran the rows (53 tests, 37 FAIL, 16 PASS) and the global-`abortChat`
mutant (S14 fails on the other chat's clauses). M1, M2, m1-m7 and E1-E5 resolved. The amendment's
risks traced: no caller passes an already-aborted signal in normal operation; a stopped run returns
through the gone-origin path and each caller re-checks its signal. Corrections, applied in rev 2.2:
- e1: 2.6's take stop (before and after the push);
- e2: the row-445 record's counts and the first S4 test;
- e3: R4a/R4b are guards and titled so; test titles carry no "(added)";
- e4: `LoadLocalBackup`'s re-check when its picker returns, now in 2.5;
- e5: S14's B belongs to a second character.
Optional, taken: n1 (T1 pins that the running effect finishes), n2 (B7b at the last await before the
write), n3 (section 6: a stopped trigger can leave a message edit half done).

### Red tests and the fix (ledger rows 449-450)

- **Red tests** (row 449): eight new files, 54 tests at HEAD, 38 FAIL on their named value, 16 guards
  PASS; the Orchestrator re-ran them (38 failed).
- **The fix** (`sonnet-coder`, row 450): the registry takes a stop per registration, with an owner-only
  query, a snapshotting stop and an any-work query (`isWriting` kept, member-inclusive, unused in
  production); `sendChat`'s unit, the take (before and after its push), auto mode, the trigger-button
  run and the Post File job pass stops; `runTrigger` checks its signal before each trigger and effect;
  one chat-delete helper, `removeChatConfirmed` in `characters.ts`, serves the three handlers;
  `CharConfig` passes the character object; `backupWorkGuard.ts` holds the refusal, called from
  `UserSettings.svelte` before the confirmations and inside both loaders before the install or write.
  "Work in progress" is any registration or the composer window; `doingChat` is not read, because a
  send registers before taking it and ends after releasing it.
- **Found during the fix:** the Post File job had no registration of its own, so on Tauri a trash
  during the between-entry download stopped nothing. A red test was written first (entries two and
  three posted, three requests instead of one), then the job was registered with a stop.
- Registry tests G1 and G2 were added to `chatOrigin.registry.svelte.test.ts`.
- The three strings were translated into the six other languages (`translator`).
- **Pre-gate run:** 198 files, 3,269 passed, 4 skipped; `pnpm check` clean; the build passes.

### Gate 2 (ledger row 451): [REJECT], test-only

`opus-reviewer`, fresh. No production defect in any of the nine areas.
- **Red evidence re-run:** the new files with 13 HEAD sources swapped in at load: 57 tests, 39 FAIL on
  their named value, 18 guards PASS; the Post File test fails with only HEAD `multisend.ts`.
- **Mutants:** 21 generated, 20 run; killed: a delete calling the global `abortChat`, the trigger check
  after an await, per-trigger-only checks, no one-chat rule, a stale splice index, entry-only backup
  checks, no take stop after the push, no send stop, a member-inclusive owner match, a chat stop
  ignoring the chat id, no trigger-button signal, `CharConfig` passing the index, an unregistered
  Post File job, a stop running twice. Survived: auto mode's stop as a no-op and the window clause
  of `isWorkInProgress` (both redundant today, traced), a stop before `changeChatTo(0)` (mocked), and
  **stops not snapshotted (F1)**.
- **F1 (MAJOR, test):** the snapshot test calls `stopWorkIn` twice before asserting, so the live-array
  mutant passes. It matters: a take's pre-push stop ends its own registration synchronously, and a
  trigger-button run registered after it would be skipped.
- **Editorial:** E1 (`backuplocal.ts`'s refusal comment overclaimed "writes nothing": assets and cold
  items already read stay); E2-E4 (test docblocks stating history or copied boilerplate); E5 (the
  take's `settled` is also set by a trash of its character).
- **Optional, taken:** the warning tests compare the exact strings.

### Gate 2 remediation (ledger row 452): [APPROVE]

The Gate 2 reviewer, resumed: production changed only in the E1 and E5 comments; the stops-not-
snapshotted mutant is now killed; with 13 HEAD sources swapped in, 57 tests: 39 FAIL on their named
value (the warning tests on the exact string) and 18 guards PASS. Optional, taken: the registry
test's docblock names the owner-only match. Orchestrator's final run: 198 files, 3,269 passed,
4 skipped; `pnpm check` clean; the build passes.

### Live check (ledger row 453): passed

A production build and Node server, in Claude in Chrome. The main model was a plugin probe with a
delay (10 s, then 30 s) that records its abort signal; the auxiliary model was Echo.
- **L4.** With nothing running, a chat delete's confirmation was the usual text alone.
- **L1.** A chat deleted during its reply: the confirmation carried the warning on its own line;
  confirming aborted the request and removed only that chat.
- **L2.** The character deleted from its settings during a reply: the first confirmation carried the
  character warning and the second was plain; the request was aborted, the character trashed with
  the user message and no reply, and no reply landed after the probe returned.
- **L3.** With a send running, both backup buttons refused before any confirmation and the send
  finished normally; once idle, the internal backup reached its usual confirmation.

Not exercised live: a trigger-button run, a Post File job, a group, and the stale-index races. The
tests cover them.
