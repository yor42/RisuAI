# Carry-Forward

This file holds what finished stages leave for later ones: durable facts a later stage relies on,
and hand-offs a later owner must still act on. It is organised by the stage that needs each item,
not by the stage that found it. It is not a history: the chronology of a stage is in its Report's
STATUS block and its ledger rows.

- **Live-State links here.** `Agents/Live-State.md` says what is in flight; this file says what is
  waiting.
- **An item is here only while it is open or relied on.** When a stage closes an item, delete it.
  When a stage finishes, add what it leaves for others. Items that a later stage has already closed
  are not kept.
- **Authority.** Where this file and a Report, `Agents/Roadmap.md` or `Agents/Maintainer-Context.md`
  differ, they win. Sources are cited by name, not by line: the code moves.
- **Checked against** the source, the Roadmap, the Reports' STATUS blocks and `git log` at HEAD
  `1d6fa16b` (2026-09-29); the W2c section is updated through W2c-c (`d27a1ee4`).

## After W2c (the send's prompt)

- **W2c is done:** W2c-a `79c6e35e` (Report 40), W2c-b `9d493c79` (Report 42), W2c-c `d27a1ee4`
  (Report 43). The send's prompt reads its own chat; its index tags describe their message; nothing
  that builds it reads a hidden message.
- **W2c-c's `promptView`** (a parser option, never read from `cbsConditions`) marks every parse that
  builds the prompt; `splitSentMessages` in `src/ts/cbs.ts` is the one definition of "sent", shared
  with `makeMs`. A new prompt parse must carry the marker; the completeness test in
  `sendChatPromptReads.svelte.test.ts` catches a missing one only among parses made from
  `index.svelte.ts`, `exampleMessages`, `parseChatML` and `supaMemory`: its parser spy does not see
  parses inside `scripts.ts`, `lorebook.svelte.ts`, `triggers.ts` or `scriptings.ts` (probably
  the import cycle; not tested), which behaviour tests cover instead.
- **W2c-c leaves, the same as upstream (Report 43 section 8):** messages deleted during the prompt
  build shift where a walk-back tag starts by the number removed before it (hidden messages are
  never taken); a plugin or V3 call that swaps in new message objects mid-send makes the walk-back
  and history tags parsed after it read every message as sent, while the request is unaffected.
  Three stale-view mutants survive because identity-based hidden-ness makes a stale view correct
  for every shift; they matter only when a start trigger removes the reset while keeping the
  messages before it, or inserts one before the reset, and the optional tests that kill them
  (Gate 2 round 2, T5 and T6) were not added.
- **CHORE-45** (Roadmap): the script cache's 1,000-entry capacity. W2c-c decides only which
  prompt-pass results may be cached; the capacity is decided after the memory-footprint stage that
  follows W2e (`MC-119`).
- **The group member names in the prompt read `findCharacterbyIdwithCache`, and no later stage owns
  them.** The prompt's group member names, the preview heading and the `msg.saying` comparison read
  it: a per-send cache over `findCharacterbyId`. It returns a blank "Unknown Character" for a gone
  member, and can return a stale object after a cold restore replaces the member's slot mid-send
  (inferred from Report 35 and the cache's fill point; not traced). Report 35
  leaves this out of scope (its list of what it does not change). Not closed.
- **`GLGlobalVariables` subject branches.** `setGlobalChatVar` in
  `src/ts/parser/chatVar.svelte.ts` falls through to the database-wide global when the subject
  resolves to no chat, even if the origin chat had a local override. `MC-103` lists "a
  `GLGlobalVariables` write whose subject is gone is dropped" as an Orchestrator default that the
  maintainer did not object to. No caller passes a subject to `setGlobalChatVar` at HEAD (only
  `Toggles.svelte` calls it, with none), so that default is unimplemented but unreachable.

## W2d (the request layer, tools, graph memory; CHORE-27)

- **Scope** (`MC-103`, `MC-095`): the `request` trigger, the model's tool calls, and graph memory.
- **CHORE-27** (Roadmap): `request.ts` reads `getCurrentCharacter()` and `getCurrentChat()` inside
  its retry loop, after earlier awaits, so a character switch mid-send makes character B's `request`
  trigger rewrite A's prompt. The `request` run filters its effects through an allowlist that
  excludes the character and lorebook effects (ledger row 256); the Roadmap entry was corrected.
- **Orchestrator defaults in `MC-103`** (stated to the maintainer, not objected to, not decided):
  only the send's own requests bind the `request` trigger; the translator, the Playground and other
  callers keep following the selection; the model's `risuaccess` tools, called with no `id` during a
  send, act on the send's chat.

## W3 (`/` commands, `/multisend`, `sendPofile`)

- **Binding to an origin.** W2b-core leaves `/multisend`, `sendPofile` and trigger-run `/` commands
  on the chat captured at each `sendChat`'s entry (Report 36, "Out"). Binding them is W3's.
  `MC-098` sends `sendPofile` to W2/W3.
- **Cancel and `/` commands.** Whether a cancel stops a running `/` command is W3's (`MC-103`,
  Report 36). A cancel during a slow `/` command puts the composer's text back while the command
  keeps running (composer stage, S1). A press during a command before a `/multisend` in the same
  pipe, as in `/speak x|/multisend a|||b`, puts the text back, and the pipe then goes on to post and
  generate (Report 36, disclosed).
- **A trigger button's `/multisend`** pressed while the composer's action window is open, or during
  auto mode's yield, can take the busy flag first. The composer's hand-off or auto mode's next tick
  is then refused. If it posts during a composer take's `/` stage, the take's typed text is not put
  back when the stage ends early (Report 36 section 3, D6). No two generations run at once and the
  flag is never stolen or stuck (Report 36, disclosed).
- **`MC-103` deferred** whether trigger-run `/` commands bind to the trigger run's origin, and a
  `loadInternalBackup` during work. `MC-103` names no stage for the second, and no Report or
  Roadmap entry places it.

## W2e (the delete warning and complete registration)

- **The delete warning.** Confirming the delete of a chat, or of its character, while a reply is
  being generated into it aborts that generation, with a warning (`MC-103` 2, `MC-075` 2). Report 35
  leaves the abort to W2e.
- **There are three chat-delete handlers**: two in `SideChatList.svelte` and one in
  `Others/ChatList.svelte` (ledger row 306).
- **Orchestrator defaults in `MC-103`**: the warning goes on the first confirmation, for trash and
  permanent delete alike; auto mode still stops on a chat switch; the preview hotkey and DevTool
  register as work.

## Wiki batch (owned by the Wiki session; waits for W2)

- The composer and send wiki batch waits for W2. A source-line anchor in `RisuAI-Basics.md` shifts
  with the composer's S2.
- W1a's list of stale wiki claims is Report 33 section 13. The lists for W1b and the composer stage
  (`Settings-Hotkeys.md`, `RisuAI-Basics.md`) went to the Wiki session.

## Not scheduled

- **CHORE-43** (Roadmap): the composer's reroll history is per instance, so unreroll can write one
  chat's reply into another.
- **W2a's optional items** (Report 35 section 12): skip the image-prompt request when there is no
  reply to append to; align the non-streaming continue whose target is already missing with the
  streaming one.
- **The upstream batch** (`MC-101`; ledger rows 302-303) leaves three items, all the same on
  `upstream/main`:
  - a session-cached plugin permission grant skips the periodic reconfirm for the rest of the
    session;
  - `hasher` (`src/ts/parser/parser.svelte.ts`) needs `crypto.subtle`, so plugin permission checks
    throw on a plain-HTTP LAN origin;
  - a partial `loadoutApplyOptions` object, which only a hand-edited save can hold, hides the missing
    toggles.
- **Escape on alerts stage 2 residuals** (Report 41 section 7):
  - the hosted first-run password prompt, if two ever run at once, would now be asked in turn, and
    the server refuses the second password without telling the client;
  - a follow-up prompt asked after an earlier prompt's answer answers at once, so a double-press can
    answer both;
  - third-party scripts that relied on a foreign answer now wait for their own.
- **A comment citation.** Comments in `src/ts/globalApi.svelte.ts` cite "ledger row 61" for a timing
  claim (a seconds-long `encoder.init` window at 1000 characters) that rows 63 and 79 carry. The
  second comment-sweep pass left it; fix it the next time a stage edits those comments.
- **Disclosed for the maintainer.** In a chat whose id has two holders, the send's own writes land
  (`MC-104` 1) but its trigger runs still write nothing (`MC-078`).

## Reference for any later stage

### The save encoder and duplicate ids (CHORE-28, Report 26)

- **`RisuSaveEncoder` (`src/ts/storage/risuSave.ts`):**
  - each `init`/`set` pass takes one copy of the character list at its start;
  - it counts holders by `String(chaId)` and encodes each key at most once;
  - a key with two or more holders is frozen: its block is kept unchanged, taken out of
    `toSave.character` and never deleted;
  - a never-saved duplicate writes its first holder once;
  - `init({ previous })` reuses the replaced encoder's block only for a key duplicated in its own
    snapshot;
  - `getFrozenKeys()` exposes the frozen set.
- **Marks.** `toSave.character` can hold raw, non-string `chaId` values (`frontUnshiftSelected`,
  `appendIfAbsent`), and the encoder compares marks by `String()`. **Never convert the list to
  strings in place:** `mergeUnsavedChanges` folds it back into the live tracker after a failed
  write, and `prepareSaveIteration`'s no-reload filter compares raw values, so the mark would be
  dropped.
- **`src/ts/globalApi.svelte.ts`:** `reloadSaveEncoder` is the shared reload hand-over;
  `checkFrozenKeysForResolution` is the idle step; `publishFrozenSaveIndicator` feeds
  `frozenSaveKeysStore`, which `SavePopupIcon.svelte` renders. The save loop's calls to the last two
  are covered by review only.
- **Resolving a duplicate.** A normal delete only trashes a character, so the key stays duplicated.
  A permanent delete resolves it. `removeChar` and `restoreCharacterFromTrash` accept the character
  object, and the grid uses that form.
- **Cold storage.** `cleanColdStorage` refuses while any key is frozen.

### Identity and origin (W0, Report 24)

- **`src/ts/process/chatIds.ts`:** pure fill, repair and duplicate warnings; a missing id is always
  fresh. `repairDatabaseIds` runs at boot and on every decoded backup before install, including the
  local `.bin` restore.
- **Two rules for anything that calls `beginWork`:**
  - it takes only objects read back through `DBState`. Row 386's proxied harness passed raw fixtures,
    the hint never matched the proxies, and every resolve became a full scan;
  - resolve once per synchronous batch.
- **`src/ts/process/chatOrigin.ts`:** a target that is gone or held twice is skipped (`MC-075`,
  `MC-078`). W1a, W1b, W2a and W2c-a bind their writes and reads through it (Reports 33, 34, 35,
  40). The send's own writes in a duplicated-id chat are the one exception (`MC-104` 1).

### Multiuser removal (CHORE-34, Report 27)

- **`src/ts/sync/` no longer exists**, and `peerjs` is gone from the dependencies.
- **`saveAsset`'s custom-id parameter** has no production caller that passes a non-empty id (checked
  by grep at `1d6fa16b`: every call passes none or `''`). `verifyAssetCacheEntry` judges a 64-hex
  custom id as a content hash, so a caller must never pass a 64-hex id that is not the hash. A
  `uuidv4()` name, the fallback on non-secure origins, reports 'not-content-addressed'.
- **`checkCharOrder`'s `§temp` exclusion** (in `globalApi.svelte.ts`) is the only production
  reference to `§temp`, and `src/ts/checkCharOrder.tempCharacter.svelte.test.ts` pins it. Upstream
  saves can carry such a character.
- **Upstream facts** (`upstream/main`, 2026-09-23): upstream still ships multiuser; it never writes
  `Message.otherUser`; user messages without `name` already exist upstream.

### The composer as built (after the composer stage's S2, Report 22)

Source is authoritative; this is the shape W2 and W3 work against.
- **`src/ts/process/composerDrafts.svelte.ts`** is the per-chat draft store: a `SvelteMap` of
  `$state` records keyed by `chaId::chatId`.
  - `peek(key)` returns the record, or a frozen empty view, and never creates one.
  - `write(key, updater)` is the one write path. It drops an emptied record, and past 200 it evicts
    the least recently written, never the key set by `setOnScreenKey`.
  - `take` and `putBack`; `resetComposerDraftsForTests`.
- **`src/ts/process/composerActions.svelte.ts`:**
  - `ComposerActionsSource` holds only the instance's reroll history (`rerolls`, `rerollId`,
    `lastCharId`) and `closeMenu`.
  - The take and every put-back go by `workHandle.origin`'s key. A put-back never goes through the
    source.
  - Module state: `locked` (the global lock, `MC-102` 1; open only from a Send's or Continue's take
    until generation starts or the values go back); the `inflight` record; `autoModeRunning`
    (`isAutoModeActive()`); `currentGenerationController`, published at the take and again in
    `sendChatMain`.
  - **The composer's action window is not here.** It lives in `generationOwnership.svelte.ts`
    (`isComposerWindowOpen`, `setComposerWindow`) since W2b-core (`ac8cb3da`), where starters
    outside the composer read it.
  - `abortChat()` takes no source. On every press it stops the unit in progress
    (`abortUnitInProgress`, `generationOwnership.svelte.ts`) and auto mode, then cancels an unsettled
    take, or else aborts `currentGenerationController`. `runAutoMode`'s `finally` ends its work
    handle and clears both the window and the auto-mode flag.
  - `updateInputTransateMessage(key, reverse)` writes only if that record's source text is
    unchanged.
- **`DefaultChatScreen.svelte`** has no composer `$state` of its own. The textareas use function
  bindings to the shown record. Writes go through `resolveDraftKeyForWrite()`, which fills missing
  ids through `beginWork` and ends the handle at once. Late writers (paste, Post File) capture the key
  before their await. A transient `fallbackDraft` is used if the fill is refused, which is not
  expected to be reachable.
- **Tests:** `src/lib/ChatScreens/DefaultChatScreen.composer.svelte.test.ts` (a mount harness of the
  real component in happy-dom, driven through the DOM),
  `src/ts/process/tests/composerDrafts.svelte.test.ts`,
  `src/ts/process/tests/composerActions.svelte.test.ts` and `src/ts/hotkeyCharSwitch.svelte.test.ts`.
