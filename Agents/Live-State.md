# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-25 to 2026-09-28.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It is pushed through `2cdfb2b5`;
`4cdb5ef1` is committed on top and not pushed.**
- Earlier stages: CHORE-34 `911376cb`; CHORE-33 `e1dd839c`, `87b974e5`, `d2653123`; CHORE-39
  `37898465`. Their records run to `b7b1fd00`.
- The removal stage (Report 31):
  - `2af8d4fe`: dead code, including the Communities page;
  - `a9c29ba7`: the Patreon page;
  - `237ebba1`: Drive removed, leftovers cleared at boot, and the local restore lock;
  - `e8500372`: the records, and `MC-093`.
- The upstream sync:
  - `425080e6`: Svelte 5.56.8;
  - `f190d950`: zh-Hant, from upstream;
  - `0efc3d22`: the `{{slot}}` help text in every language;
  - `4cdb5ef1`: the maintainer's own rewording of the Korean `{{slot}}` note.
- CHORE-42 (Report 32): `80c9128a` (plan records), `ce6bc594` (the fix) and `2cdfb2b5` (its records).
- W1 (not pushed): W1a `13ed2e75` and records `490bdec2`; W1b `22db8dfe` and records `790643ff`.
- The composer stage: S0 `b05231c6` (the hotkeys), S1 `1bc5f288` (the composer) and records
  `2177f7d2`; S2 `67f17f1a` (per-chat drafts) and records `9ce59e0d`. Not pushed. See
  "Composer stage state" below.
- Vitest excludes `.claude/**` (`7b72b813`).
- The upstream batch (`MC-101`), not pushed: `3482ef4f`, `73edeb69`, `295c0fa7`, `5064bc4c`,
  `5c85cac7`, `0f38ac8c`, `9213ebc2`, then its records commit on top. See "Upstream batch state"
  below.
- W2a (Report 35), not pushed: `ec65c200`, then its records commit on top. See "W2 state" below.
- W2b-core (Report 36), not pushed: `ac8cb3da`, then its records commit on top. See "W2 state"
  below.

## Parallel sessions (from 2026-09-27)

Two sessions work **in this same checkout at once**, started from the maintainer's hand-off prompts:
- **The W1 session** owns everything outside `wiki/`, including all `Agents/` records.
  - The next ledger row is 253 and the next report is 33.
  - It lists the wiki pages W1 makes stale, and does not edit them.
- **The wiki session** owns `wiki/**` only, including the earlier wiki session's uncommitted
  `wiki/Settings*.md`, `wiki/Home.md` and `wiki/_Sidebar.md`.
  - It writes nothing to `Agents/`. Its findings, suspected bugs and questions go to the
    maintainer in its final report.
  - Its hand-off covers:
    - Report 28 §10's list and the 28C additions;
    - Report 31 §7;
    - CHORE-42's refusal and warning;
    - CHORE-39's switch notices;
    - the `{{slot}}` help text.
- **Rules for both:**
  - stage by explicit path only;
  - never `git add -A`, `stash`, `reset`, `checkout -- <path>` or `restore` on another
    session's files;
  - commit and push only at the maintainer's request.

## CHORE-33 (RisuAccount removal): done

28A, 28B and 28C are all committed (`e1dd839c`, `87b974e5`, `d2653123`) and live-checked (ledger
rows 200, 205, 221). The plan is final at Report 28 rev 3.6
(`Agents/Reports/28-risuaccount-removal-plan.md`). **Gate 1 (rows 193-197) gated the whole
three-sub-stage plan.** For how each sub-stage was built and gated after that, see that report's
STATUS block and section 11, and ledger rows 198 to 222:
- **28A** (the importer refusal): Gate 2 rows 198-199; live check row 200.
- **28B** (the removal): Gate 2 rows 203-204; live check row 205.
- **28C** (agreement at first use of Realm or Drive): red tests rows 209-210; implementation row
  211; Gate 2 rounds 1-2 rows 213-214 (both substantive rejections); round 3 (row 215) was
  interrupted by a process exit before a verdict, though its scenarios found two more leaks
  (E2/E4) in the same load logic; the `senior-advisor` escalation on the placeholder-control load
  logic, row 216 (instead of a fourth revision); the Invariant A/B rework rows 218-219; Gate 2 on
  the new design and its editorial re-check, rows 220 and 222.
- **The comment sweep** (row 212) is a separate commit (`57d1596a`), not part of CHORE-33.

## Open follow-ups, waiting on the maintainer

1. **The wiki hand-off** was given on 2026-09-27 to the parallel wiki session (see "Parallel sessions" above).
2. **The three optional Gate 2 follow-ups** (row 220) are done and committed (row 225).
3. **The second comment-sweep pass** is done and committed (row 228). Left for a later pass:
   `globalApi.svelte.ts` cites "ledger row 61" for a timing claim that rows 63 and 79 carry; fix it
   when CHORE-39 edits that file.
4. **CHORE-35 to CHORE-40** (Report 28 section 3.5's six out-of-scope items) are filed as Roadmap
   tickets. MC-092 (2026-09-26) decided CHORE-36 (remove Google Drive backup, superseding MC-080's
   "keep Drive"), CHORE-38 (clear `risuaiAccountCached`, no recovery) and the Patreon-list part of
   CHORE-35's scope (removed); the rest of CHORE-35 (the remaining upstream-infrastructure
   features) becomes opt-in, its own stage after W1. MC-089 says nothing ships until every open
   ticket clears.
   - **Status (2026-09-27):** CHORE-36, CHORE-37, CHORE-38 and the Patreon removal are done
     (Report 31). CHORE-42, which came out of that stage, is done too (Report 32). CHORE-40 is
     still open, and CHORE-35's opt-in stage follows W1.
5. **CHORE-41, the edit-button bug** (was MC-090, now filed as a ticket). The mechanism is found
   (ledger rows 201-202): `Chats.svelte` mounts one `Chat` per visible message, keyed by a hash of
   the message's data, id, index and flags, plus `ReloadChatPointer[index]`; `editMode` is local
   state, so any change to that hash remounts the message and silently drops the editor. This is
   present in both upstream and this fork; the maintainer's supplied plugins were ruled out.
   **Still open:** why the button stays dead across repeated clicks (workflow
   `edit-button-stuck-state-investigation`, ledger row 206, found a likely cause — an uncaught
   synchronous error during the edit-mode branch's mount, caught by no `<svelte:boundary>` — but
   the throw site itself is not found; the maintainer's console output is needed). Blocked on
   that console output.
6. **A native-speaker check on the new translations.** The maintainer reviewed the Korean
   (`4cdb5ef1`). The translator suggested that the German and Vietnamese
   `restoreNoLockWarningConfirm`, a data-loss warning, and the German `{{slot}}` phrasing get a
   native check.
7. **The MC-091 workflow pilot continues** over the next 5-10 items. 28C's Gate 2 was its first
   use of the `[EDITORIAL]` outcome and of reviewer continuity for a re-check.

## Work order

**Done and committed:** W0 (identity); CHORE-28 (Report 26); the multiuser removal (CHORE-34,
`MC-074`/`MC-083`, Report 27, `911376cb`); the RisuAccount removal (CHORE-33, `MC-080`/`MC-081`,
Report 25/28, see above).

**Current order (`MC-092`, 2026-09-26):**

1. **The records** — done, committed.
2. **The three optional 28C Gate 2 follow-ups** — done, committed (row 225).
3. **The second comment-sweep pass** — done, committed (row 228).
4. **CHORE-39** (OPFS migration) — done, committed (`37898465`); Gate 2 rows 229-230, live
   check row 231.

5. **The removal stage** — done, committed (`2af8d4fe`, `a9c29ba7`, `237ebba1`). Report 31: Drive
   (CHORE-36), dead code (CHORE-37, plus the Communities page, `MC-093`), `risuaiAccountCached`
   (CHORE-38), the Patreon page, and a lock on the local restore write.

5a. **CHORE-42** (`MC-093`: refuse, or warn about, a local restore while other tabs are open). Done,
   committed as `ce6bc594` (Report 32; Gate 2 rows 249-250; live check row 251). It adds a per-origin
   storage epoch to `storageTabLocks.ts`. It also fixes `237ebba1`'s cancellable restore reload.

**Next: step 6, W1** (engine binding), per the order below.

**Upstream sync (2026-09-27):** Svelte 5.56.8 (`425080e6`, ledger rows 244-245) and upstream's zh-Hant
improvements (`f190d950`, row 248) are merged. `upstream/main` has nothing newer as of this date.
6. **W1: engine binding, done.** W1a is committed (`13ed2e75`), W1b (`22db8dfe`). `MC-094` split it into W1a and W1b.
   - **W1a:** every write a trigger run makes. It closes CHORE-25 and CHORE-26. Its plan will be
     Report 33.
   - **W1b:** the read side and the parser. Its plan is Report 34. `MC-095` moves the send's own
     parser calls, `{{setvar}}` writes, lorebook call and graph memory to W2.
   - After W1: the composer stage (Report 22), then the upstream batch (`MC-101`), then W2 and W3.
   See "W1 state" below.
6a. **The composer stage (Report 22) is done.** S0 `b05231c6`, S1 `1bc5f288` and S2 `67f17f1a`,
   each with its records commit. See "Composer stage state" below.
6b. **The upstream batch (`MC-101`) is done** (ledger rows 301-304). See "Upstream batch state"
   below.
6c. **W2 is in progress.** See "W2 state" below.
7. **CHORE-35's opt-in stage** (the remaining upstream-infrastructure features: `/proxy2`'s
   static-web default, the transformers CDN, the MCP OAuth helper, `#import=<url>`,
   `getProxyStreamJobBaseUrl`), after W1.

CHORE-40 (the copy-button URL fetch) is not placed in this sequence; CHORE-41 (the edit-button
bug) is blocked on the maintainer's console output, not scheduled by position.

## CHORE-34 facts later stages rely on

- **`src/ts/sync/` no longer exists.** `peerjs` is gone from the dependencies. Nothing reads
  `ConnectionOpenStore`.
- **`saveAsset`'s custom-id parameter** has no production caller.
  - `verifyAssetCacheEntry` judges a 64-hex custom id as a content hash, so a caller must never
    pass a 64-hex id that is not the hash.
  - A `uuidv4()` name, the fallback on non-secure origins, reports 'not-content-addressed'.
- **`checkCharOrder`'s `§temp` exclusion** is the only remaining `§temp` reference, and T1 pins it
  (`src/ts/checkCharOrder.tempCharacter.svelte.test.ts`). Upstream saves can carry such a
  character.
- **Upstream facts:**
  - upstream still ships multiuser (`upstream/main`, 2026-09-23);
  - upstream never writes `Message.otherUser`;
  - user messages without `name` already exist upstream.

## CHORE-28 facts later stages rely on

- **`RisuSaveEncoder` (`risuSave.ts`):**
  - Each `init`/`set` pass takes one copy of the character list at its start.
  - It counts holders by `String(chaId)` and encodes each key at most once.
  - A key with two or more holders is frozen: its block is kept unchanged, taken out of
    `toSave.character` and never deleted.
  - A never-saved duplicate writes its first holder once.
  - `init({ previous })` reuses the replaced encoder's block only for a key duplicated in its own
    snapshot.
  - `getFrozenKeys()` exposes the frozen set.
- **Marks.** `toSave.character` can hold raw, non-string `chaId` values (`frontUnshiftSelected`,
  `appendIfAbsent`). The encoder compares marks by `String()`. **Never convert the list to strings
  in place:**
  - `mergeUnsavedChanges` folds it back into the live tracker after a failed write;
  - `prepareSaveIteration`'s no-reload filter compares raw values, so the mark would be dropped.
- **`globalApi.svelte.ts`:**
  - `reloadSaveEncoder` is the shared reload hand-over.
  - `checkFrozenKeysForResolution` is the idle step.
  - `publishFrozenSaveIndicator` feeds `frozenSaveKeysStore`, which `SavePopupIcon.svelte`
    renders. The RisuAccount removal edited that file too, because it imported `AccountWarning`
    (Report 25 invariant 4). The frozen-key indicator is kept.
  - The save loop's calls to the last two are covered by review only.
- **Resolving a duplicate.** A normal delete only trashes a character, so the key stays duplicated.
  A permanent delete resolves it. `removeChar` and `restoreCharacterFromTrash` accept the
  character object, and the grid uses that form.
- **Cold storage.** `cleanColdStorage` refuses while any key is frozen.

## W0 facts the next stages rely on

- **`src/ts/process/chatIds.ts`:**
  - pure fill, repair and duplicate warnings;
  - a missing id is always fresh;
  - `repairDatabaseIds` runs at boot and on every decoded backup before install, including the
    local `.bin` restore. W0 also added it to `loadRisuAccountBackup` (`drive/accounter.ts`) and
    `autoServerBackup` (`kei/backup.ts`). Those calls went with the functions the RisuAccount
    removal deleted. **The local `.bin` restore's call stays.**
- **`src/ts/process/chatOrigin.ts`:** a target that is gone or held twice is skipped (`MC-075`,
  `MC-078`). There is no production caller yet; W1 binds the first.
- **W1 must:**
  - call `beginWork` only with objects read back through `DBState`;
  - resolve once per synchronous batch;
  - report the Lua and CBS resolution counts;
  - measure a production build with throttling;
  - prove that `runTrigger`'s whole-clone commit cannot drop a message.

## W1 state (2026-09-27)

- **Scoping:** ledger rows 253-254. **Escalation:** row 255 (`senior-advisor`).
- **Decision: `MC-094`.**
  - A trigger run has no commit step (W-2′, superseding Report 23's W-2 and `MC-076`'s "whole-object
    commit stays"). Each change is applied to the origin's live target when the effect runs.
  - The clones go, and `runTrigger` returns no `chat`.
  - W1 splits into W1a (writes) and W1b (reads and the parser).
- **Why:** at HEAD, a send or edit made in a chat while a manual trigger awaits is lost to
  `setCurrentChat(clone)`. That trigger sets no `doingChat`.
- **Pre-plan work in flight:**
  - row 256, `investigator`: the W1a mechanism inventory (awaits, in-place normalisations, result
    consumers, origins per caller, display mode, tests);
  - row 257, `perf-analyzer`: a throttled production measurement in headless Chrome of the clone,
    proxy reads, resolution and the memo.
- **Report 33 rev 3.1** (the W1a plan): **Gate 1 passed** (rows 258-260: two substantive
  rejections, then an editorial round; the reviewer was reused).
- **Build, tests first:**
  1. the seam: `src/ts/process/sendCharacterMessage.ts`, extracted from `sendMain` with no
     behaviour change; the suite stays at the baseline. Done, uncommitted. That coder ran
     `git add -N` and a bare `git reset`. The index was empty at the time, and the wiki session
     has been warned;
  2. the red tests (`test-warrior`):
     - First writer (~562k): three suites, `triggerOriginWrites.svelte.test.ts`,
       `sendCharacterMessage.svelte.test.ts` and `Chat.triggerOriginWrites.svelte.test.ts`. At HEAD
       29 fail and 10 pass (the guards). The Orchestrator re-ran them.
     - Gaps: the seam suite failed on the return value rather than on behaviour, and the
       real-engine `sendChat` suite (tests 10, 21, and 12/13's `sendChatBody` half) was not
       written.
     - A second writer (~378k) finished both and added a Lua-button guard. There are four suites,
       adding `src/ts/process/tests/sendChatTriggerWrites.svelte.test.ts`.
     - The Orchestrator re-ran them: **at HEAD 35 fail (34 on behavioural or contract assertions,
       one on its then-missing test export), and 12 pass (eight guards, three specification
       tests, one diagnostic; ledger row 264).** The first writer's "all LF" claim was false: three of its
       files are CRLF. Each file is internally consistent, and autocrlf normalises them;
  3. the implementation (a separate `sonnet-coder`, ~518k): done.
     - It left 2 failures, both test defects, which a test writer fixed and re-proved red against
       HEAD through scratch alias configs. The module-stamping test moved to
       `src/ts/process/tests/modulesTriggerStamping.svelte.test.ts`.
     - Plan rev 3.2 aligned §3's gone-member rule for `upsertLocalLoreBook` with T4.
     - Orchestrator checks on the pre-gate snapshot: **135 files, 1604 passed, 4 skipped, exit
       0**; `pnpm check` clean; `pnpm run build` passes;
  4. **Gate 2 round 1 (row 261): [REJECT].**
     - B1: the Lua path never marks for save.
     - B3: a gone member collapses to the owner, which feeds nested triggers and image generation.
     - B2: mutants survive, and tests are missing.
     - T9: `{chara}` is read after an await.
     - Editorial fixes in production comments and tests.
     - The remediation runs tests first:
       - The test writer (~313k) is done. Its six reproducers (B1 ×4, B3 ×2) are red on the
         current tree, which the Orchestrator re-ran. The mutant-killers pass, and the test
         editorials are applied. It made and deleted a probe file inside `src/ts/process/`,
         against the rules; nothing is left.
       - The implementer fixed B1, B3, T9 and the four production comments.
       - A further gap was found and closed tests-first. Lua `setChatVar` in a call with an
         origin (the Lua button) still used the selection-bound `chatVar`. `runScripted` now
         gives such a call origin-bound defaults.
       - Orchestrator checks: **135 files, 1625 passed, 4 skipped, exit 0**; `pnpm check`
         clean; history grep 0.
       - **Gate 2 round 2 (row 262): [EDITORIAL]**, closed by the Orchestrator after verifying
         E-a to E-d. Two optional mutant-killers were added. **Gate 2 passed.**
       - Final snapshot: **135 files, 1628 passed, 4 skipped, exit 0**; `pnpm check` clean; the
         build passes.
  5. **Live check passed (row 263).** It covered the CHORE-25 switch, a send during a button
     trigger's wait, and the CHORE-26 group, on a production build with Echo. `save/` was restored
     and hash-verified. The maintainer closed the Chrome tab on localhost:6001; the server is
     stopped.
  6. **The records are updated:**
     - Report 23: W-2 is superseded by W-2′.
     - Report 24: O-6 and §10 are annotated.
     - Roadmap: CHORE-25 and CHORE-26 are fixed; CHORE-27's bullet is corrected.
     - Ledger row 253 is corrected.
  7. **The commit-message fact-check (row 264): [EDITORIAL], applied.** The final draft is in the
     scratchpad (`w1a-commit-msg.txt`). The stale wiki claims are listed in Report 33 §13 for the
     maintainer. **Committed on the maintainer's request (2026-09-28): the fix as `13ed2e75`, then these
     records.**
  8. **Next after the commit: W1b** (CBS variables, `loadLoreBookV3Prompt`, `graphmem.ts`, the Lua
     read bindings, `infunctions.ts`, the render-time subjects), then the composer stage, W2 and W3.
- **To update in the plan's records:**
  - Report 23: W-2′ supersedes W-2.
  - Report 24: strike §10's last bullet and O-6's "W1 uses `commitChat`".
  - Roadmap: CHORE-25 and CHORE-26.
- **For W2:**
  - `findCharacterbyIdwithCache` may hand `sendChat` a non-live member.
  - Roadmap CHORE-27's claim that 8 of the 9 effects write live during a `request` run is false.
    The `request` and `display` allowlists exclude them (ledger row 256). Correct CHORE-27's
    entry with W1a's records.

## W1b state (2026-09-28)

- **Done: committed as `22db8dfe`** (the fix and tests), then the records. Report 34 rev 2.3;
  ledger rows 265-271; `MC-095` (the send's reads, `{{setvar}}` writes, lorebook call and graph
  memory go to W2).
- Gate 1: rows 266 ([REJECT]) and 267 ([EDITORIAL]). Gate 2: rows 268 ([REJECT], tests only) and
  269 ([EDITORIAL]). Live check: row 270. Commit-message check: row 271.
- **R3 exceptions** (read-only, recorded in Report 34 section 4):
  - with no current character or chat, a few tags return a value where HEAD threw;
  - with no origin, Lua `getLoreBooksMain` reads the call's held chat.
- **For W2:**
  - The `GLGlobalVariables` subject branches (`setGlobalChatVar` and the rest) have no caller
    with a subject yet. With a gone subject, `setGlobalChatVar` writes the database-wide global
    even when the origin chat had a local override. W2 must decide that.
  - `@@inject`/`@@repeat_back` need `chatID !== -1`; they belong to the send.
- **Stale wiki claims:** the `doc-verifier` list went to the Wiki session, at the maintainer's
  request.
- **Next:** done; see the composer stage below.

## Composer stage state (2026-09-28)

- **Plan:** Report 22 rev 7.1.
  - Gate 1 was rejected six rounds running (rows 273, 275-277), escalated after the third (row
    274), and passed at round 7 (row 280).
  - The maintainer's decisions: `MC-097` (generation is W2's; empty at Send), `MC-098` (busy;
    `sendPofile` goes to W2/W3), `MC-099` (cancel before generation) and `MC-100` (the lock; the
    reroll history stays per instance).
- **S0, the hotkeys (`b05231c6`):** tests and fix (row 278); Gate 2 [APPROVE] (row 279).
- **S1, the composer's actions (`1bc5f288`):**
  - `src/ts/process/composerActions.svelte.ts`: the move (row 281), the red tests (row 282), and
    the fix (row 283);
  - Gate 2: round 1 [REJECT], tests only (row 284); the remediation (row 285); rounds 2-3
    [EDITORIAL] (rows 286, 288);
  - live check (row 289); commit-message check (row 290).
- **Filed:** `CHORE-43` (unreroll can write one chat's reply into another) and `CHORE-44` (auto
  mode cannot be stopped from a remounted composer).
- **Known S1 interim limits, fixed by S2:** a put-back after a remount lands in the unmounted
  composer and is lost; after a switch, a put-back shows in the chat on screen.
- **For W2:** generation still runs on the selection after a mid-send switch; the hand-off clears
  `doingChat` unconditionally; `changeChatTo` is unguarded during generation.
- **For W3:** a cancel during a slow `/` command puts its text back while the command keeps
  running; `/multisend` leaves `doingChat` set.
- **Wiki:** the stale-claims list (`Settings-Hotkeys.md`, `RisuAI-Basics.md`) went to the Wiki
  session.
- **S2, per-chat drafts, with `CHORE-44` folded in (`67f17f1a`):**
  - the plan is Report 22 section 7 (rev 8.2), with `MC-102`;
  - Gate 1: round 1 [REJECT], round 2 [EDITORIAL] (rows 291-293);
  - the red tests, the fix and the spec tests (rows 294-296);
  - Gate 2: round 1 [REJECT], round 2 [APPROVE] (rows 297-298);
  - the live check (row 299) and the commit-message check (row 300).
- **The interim limits S1 left are fixed** (put-backs after a remount or a switch). CHORE-44 is
  fixed.

### The composer as built (after S2; what W2 and the upstream batch start from)

- **`src/ts/process/composerDrafts.svelte.ts`** is the per-chat draft store:
  - a `SvelteMap` of `$state` records keyed by `chaId::chatId`;
  - `peek(key)` returns the record, or a frozen empty view, and never creates one;
  - `write(key, updater)` is the one write path. It drops an emptied record, and past 200 it
    evicts the least recently written, never the key set by `setOnScreenKey`;
  - `take` and `putBack`;
  - `resetComposerDraftsForTests`.
- **`src/ts/process/composerActions.svelte.ts`:**
  - **`ComposerActionsSource`** now holds only the instance's reroll history (`rerolls`,
    `rerollId`, `lastCharId`) and `closeMenu`.
  - **The take and every put-back go by `workHandle.origin`'s key.** A put-back never goes through
    the source.
  - **Module state:**
    - `windowOpen` and `locked` (the global lock, `MC-102` 1);
    - the `inflight` record;
    - `autoModeRunning` (`isAutoModeActive()`);
    - `currentGenerationController`, published at the take and again in `sendChatMain`.
  - **`abortChat()` takes no source.** It cancels the in-flight send, or else aborts the current
    generation.
  - **`runAutoMode`'s `finally`** clears both the window and the auto-mode flag.
  - **`updateInputTransateMessage(key, reverse)`** writes only if that record's source text is
    unchanged.
- **`DefaultChatScreen.svelte`:**
  - it has no composer `$state` of its own;
  - the textareas use function bindings to the shown record;
  - writes go through `resolveDraftKeyForWrite()`, which fills missing ids through `beginWork` and
    ends the handle at once;
  - late writers (paste, Post File) capture the key before their await;
  - one `$effect` resizes after the shown text changes;
  - a transient `fallbackDraft` is used if the fill is refused, which is not expected to be
    reachable.
- **Tests:**
  - `src/lib/ChatScreens/DefaultChatScreen.composer.svelte.test.ts` (27, LF): a mount harness of
    the real component in happy-dom, driven through the DOM;
  - `src/ts/process/tests/composerDrafts.svelte.test.ts` (11 spec, LF);
  - `src/ts/process/tests/composerActions.svelte.test.ts` (44, LF);
  - `src/ts/hotkeyCharSwitch.svelte.test.ts` (18).
- **Line endings:**
  - CRLF: `composerDrafts.svelte.ts`, `composerActions.svelte.ts`, `sendCharacterMessage.ts`,
    `DefaultChatScreen.svelte`, `Suggestion.svelte`, `hotkey.ts` and
    `sendCharacterMessage.svelte.test.ts`;
  - LF: the composer test files above and `editInputOrigin.svelte.test.ts`.
  - Check line endings by byte count.
- **Open, for later owners:**
  - `CHORE-43`: the reroll history is per instance;
  - W2: generation after a mid-send switch; `doingChat` ownership; outside generation starters
    that ignore the window;
  - W3: `/` commands' own reads; `/multisend` leaves `doingChat` set;
  - the composer part of the wiki waits for W2 (a source-line anchor in `RisuAI-Basics.md` shifts
    with S2).
- **Vitest and `.claude/worktrees`:** `7b72b813` adds `exclude: [...configDefaults.exclude,
  '**/.claude/**']` to `vitest.config.ts`. Discovery no longer collects the stale Claude-app
  worktrees' copies, so `--exclude` is no longer needed (verified: 142 files, 1758 passed and 4
  skipped with no flag).

### Process lessons from this stage

- Gate 1 rejected S1's plan six times in a row. Each time, the rejected rule had been added only
  to merge text typed during the wait. The fix was a product simplification put to the maintainer
  (the `MC-100` lock), not more rules. When a plan keeps failing on rules for one edge case, ask
  whether a product constraint removes the edge case.
- Test titles must state the required behaviour, never the defect; five S1 titles had to be
  renamed. Weak assertions (`toContain` where exact equality was meant) made two reds pass against
  the defect.
- **A remediation test is a reproducer only if it fails against the pre-change base.** In S2 a
  test that failed only against the change's own first implementation was first called a
  reproducer. The commit-message check ran it against `2177f7d2` and found it is a guard.
- **Live check in Chrome:**
  - the window must be visible, or screenshots time out (in S2 it reported `hidden`, but
    screenshots worked);
  - a remount is proved by tagging the textarea element and checking that the tag is gone;
  - auto mode is offered only in group chats;
  - the plugin `getDatabase` proxy only writes `allowedDbKeys`, so the model must be set in
    Settings (Echo is under "For Developer", behind "show unrecommended settings");
  - a click meant to land during a wait must be in the **same** `browser_batch` as the Send: the
    latency between tool calls is seconds.

## Upstream batch state (2026-09-28; `MC-101`, rows 287 and 301-304)

- **`upstream/main` is at `ca1345fc`** (fetched 2026-09-28); the merge base is still `669b12ce`.
  Every first-parent landing in `669b12ce..ca1345fc` is now in the fork, except `ca1345fc` itself,
  which is not ported. Two of them came in before this batch: `25001174` as `425080e6` and
  `9546973a` as `f190d950`. Each pick in this batch was taken as its first-parent diff.
- **Straight picks, each authored by its upstream contributor:**
  - `3482ef4f` (`b544d744`): Claude 5 Opus; `resolveClaudeThinkingType`;
  - `73edeb69` (`e8c063c0`): Monaco workers through `?worker`; Lua completion;
  - `295c0fa7` (`a66f81a8`): DOMPurify keeps `asset:` media `src`. There is no new exposure: on
    Windows the same scope is already served as `http://asset.localhost/`;
  - `5064bc4c` (`851e8ca5`): the Lua `axLLM` mode option;
  - `5c85cac7` (`5f9e3cbe`): the loadout apply options are persisted (the generic root path,
    row 302).
- **Hand ports, authored `yor42` with the upstream contributor as co-author:**
  - `0f38ac8c` (`5537816a`): plugin permissions are keyed by script hash plus permission, and a
    denied provider is enforced (row 303). `readInlay` and `addRisuChatListener` go through the
    scoped check. On `upstream/main` both still use the old argument order, so upstream refuses
    them for every plugin without asking. `providerPermissionDenied` is in all seven languages;
    zh-Hant is the fork's own.
  - `9213ebc2` (`7fd4b875`): the reroll snapshot in `sendChatMain` slices before it clones
    (row 304).
- **Open, not scheduled:**
  - Two overlapping `alertConfirm` calls share one answer, so a user can grant a permission whose
    prompt they never saw. This predates the batch and is the same upstream. It is a possible
    follow-up ticket.
  - A session-cached grant skips the periodic reconfirm for the rest of that session, the same as
    upstream.
  - `hasher` needs `crypto.subtle`, so plugin permission checks throw on a plain-HTTP LAN origin.
    This predates the batch.
  - A partial `loadoutApplyOptions` object, which only a hand-edited save can hold, hides the
    missing toggles. This is the same upstream.

## W2 state (2026-09-29)

- **Scoping:** ledger rows 305-306 (packets in the session scratchpad, `w2/packet-A.md` and
  `w2/packet-B.md`). **Decisions:** `MC-103` (busy starters refused silently; a confirmed delete
  aborts; Home keeps generating; a gone group member is skipped; the split) and `MC-104` (a
  duplicated id: the send writes to the object it started from; a cold group member is restored).
- **The split, in order:** W2a (the send's origin, writes, recursion and registration), W2b
  (`doingChat` ownership and the other starters), W2c (the send's scripts and parses, including
  the `@@inject` and Lua edit-trigger writes), W2d (the request layer, tools, graph memory,
  CHORE-27), W3 (`/` commands, `/multisend`, `sendPofile`), W2e (the delete warning and complete
  registration).
- **W2a: done, committed as `ec65c200`** (the fix and tests), then its records commit. Report 35 rev 2.6.
  - Gate 1 passed (rows 307 [REJECT], 308 [EDITORIAL], 311 [EDITORIAL] on the fast-path addendum).
  - Stream cost measured (rows 309, 314): the verified fast path is required and implemented; an
    undisturbed stream adds +6 µs per flush at 6x, with no full scan after the first.
  - Red tests (rows 310, 313), implementation (row 312).
  - Gate 2: rows 315 [REJECT] (a missing reply ended the send, breaking upstream cards that rebuild
    the chat with Lua `setFullChat`) and 316 [EDITORIAL], closed by the Orchestrator.
  - Live check passed (row 317).
  - Final snapshot: `pnpm test` 150 files, 1895 passed, 4 skipped; `pnpm check` clean; the build
    passes.
  - Optional, not taken (Report 35 section 12): skip the image-prompt request when there is no
    reply; align the non-streaming continue whose target is already missing.
  - Commit-message check (row 318): [EDITORIAL], applied.
  - W2a is followed by W2b.
- **W2b-core: Gate 1 passed** (Report 36 rev 7.1; ledger rows 319-327). Decisions `MC-105`,
  `MC-106`, `MC-107`. Seven rounds: rounds 1-3 [REJECT], then a `senior-advisor` escalation (row
  323: the unit that owns the flag also owns the cancel; at most one unit is ever in progress);
  rounds 4-6 [REJECT] on definitions and scenarios; round 7 [EDITORIAL], applied.
  - The preview work (notice, Cancel button, stale preview, group preview) is split out as
    **W2b-previews**, its own plan and gates after W2b-core.
  - Seams, red tests (40 reproducers, 19 guards) and the fix: rows 328-329. Gate 2: rows 330
    [REJECT] and 331 [APPROVE]. Live check passed (row 332).
  - Final snapshot: `pnpm test` 155 files, 1974 passed, 4 skipped; `pnpm check` clean; the build
    passes.
  - Commit-message check (row 333): [EDITORIAL], applied. **Committed as `ac8cb3da`** at the
    maintainer's request.
  - W2b-previews follows (the preview's notice and Cancel button, stale previews, a body that is
    not JSON, the group preview; `MC-105` 3, `MC-106` 3).
- **W2b-previews: Gate 1 passed** (Report 38 rev 5.1; ledger rows 334-340). Decision `MC-108`
  (five items). Five rounds:
  - rounds 1-3 [REJECT];
  - a `senior-advisor` escalation (row 338): the pending-result race was on the read side of the
    alert store, so blocking alerts now capture their answer from the subscriber (D9, an `MC-091`
    amendment fixing a lost-answer bug that predates this item);
  - round 4 [REJECT] from a fresh reviewer on bounded plan defects;
  - round 5 [EDITORIAL], applied.
  - Seams, red tests (46 reproducers, 20 guards), the fix, the translation and the acceptance
    tests: rows 341-342. Gate 2: rows 343 [EDITORIAL] and 344 [APPROVE]. Live check passed (row
    345), with one defect (an empty member name) fixed test-first and approved (row 346).
  - Final snapshot: `pnpm test` 160 files, 2212 passed, 4 skipped; `pnpm check` clean; the build
    passes. Commit-message check (row 347): [EDITORIAL], applied. Committed as `8f93d095`,
    with its records in `5e4a2bfd`.
  - Flagged to the maintainer as a separate task: Escape on a blocking alert leaves it unanswered
    (upstream). Addressed by Escape on alerts, stage 1, below.
  - Next: W2c (the send's scripts and parses).
- **Escape on alerts (stage 1): Gate 2 passed** (Report 39 rev 3.1; `MC-109`; ledger rows
  348-354). Escape leaves a prompt waiting for an answer alone, closes an information alert at
  once, and leaves a progress bar alone. The group character picker gets a Cancel (`MC-091`).
  - Gate 1: rounds 1-2 [REJECT], round 3 [EDITORIAL]. Gate 2: [APPROVE].
  - Final snapshot: `pnpm test` 163 files, 2273 passed, 4 skipped; `pnpm check` clean; the build
    passes. Committed as `6631f5e0`.
  - Next: stage 2 (`MC-109` 3): a prompt covered by another alert takes that alert's answer.
- **Disclosed for the maintainer:** in a chat with a duplicated id, the send's own writes land
  (`MC-104` 1) but its trigger runs still write nothing (`MC-078`).

## Operational notes for this environment

- **Git Bash here fails on heredocs, and on single commands longer than about 230 characters.**
  Write scripts with the Write tool, or use PowerShell. Commit with `git commit -F <file>`.
- **Git Bash rewrites any argument that begins with `/`** (MSYS path conversion). `git grep
  '/kei'` reported no matches when there were five. Prefix such commands with
  `MSYS_NO_PATHCONV=1`, or drop the leading slash from the pattern.
- **Four agents hold `Write`, for scratchpad files only:** `opus-reviewer`,
  `adversarial-reviewer`, `investigator` and `deep-investigator` (in effect since 2026-09-25).
  `code-searcher`, `doc-verifier` and `senior-advisor` lack it. Check `^tools:` in
  `.claude/agents/*.md` before a brief promises a tool.
- **Tell every agent** to run shell commands from the scratchpad, never from the repo root, and
  never to use globs in `mkdir` or `cp`.
- **Mutants:** build them from the current source each round, through a scratch Vitest config
  that aliases the module. When swapping in HEAD versions of files, serve every changed file,
  including the `./en` import.
- **`pnpm remove`/`add` backfill `libc:` metadata** into unrelated lockfile entries (pnpm
  10.34.1). Strip the added lines so the lockfile diff is only the intended change, then validate
  with `pnpm install --frozen-lockfile --offline`.
- **Line endings.** The `Agents/` documents are LF. With `core.autocrlf=true`, git normalises line
  endings, so a CRLF conversion in the working tree does not show in `git diff`. Check
  `git ls-files --eol <file>` after editing — it must say `w/lf`. (Two files were silently
  converted to CRLF this session and have been restored.) Judge counts by `git diff --numstat`
  and git's "LF will be replaced" warnings, not by Git Bash `grep`/`od` counts, which misreported
  twice.

## Open items

- **Possibly still present:** `C:\Projects\scratch_investigator_tmp` (empty) and
  `Temp\claude\coldstorage.svelte.ts.bak`. The maintainer deleted `%TEMP%\qa1`.
- **Scratch trees with `node_modules` junctions.** Remove each junction with `cmd /c rmdir` before
  any recursive delete.
- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists.
- **Card description contrast is 3.32:1.** This is a maintainer decision and has not been raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).
- **"Backup & Files" still uses the old account tab's person icon** (cosmetic; noted in Report 28
  section 11.2, not fixed there).

## Test suite

**163 files: 2273 passed, 4 skipped, 0 failed**, the check on the final tree of Escape on alerts (stage 1, uncommitted). `pnpm check` is clean, and `pnpm run build` passes.
`cargo check` last ran on the removal stage.
- Run the suite with plain `pnpm test` or `npx vitest run`. `vitest.config.ts` excludes
  `.claude/**` (`7b72b813`).

## How to live-check this app

- **OPFS is not offered on the Node server.** To live-check the OPFS switch, build as below, then
  serve `dist` with `pnpm run preview -- --port 4173 --strictPort` in the background and use a
  Chrome window at least about 1300 px wide (narrower windows hide the Settings menu behind the
  list button). Stop it by the PID listening on 4173. The localhost:4173 origin holds only
  throwaway test data.

- **Use Claude in Chrome, not the built-in pane.** The service worker kills the boot in the pane.
- **Build for production.** Run `pnpm run build` with `$env:VITE_RISU_LEGAL_CONFIGURED='TRUE'`
  set for that one PowerShell command only, then start `pnpm run runserver` (port 6001) yourself
  as a background process. The maintainer approved this on 2026-09-25.
  - Do not use `preview_start`. It would open the app in the built-in pane on the same server
    storage, making a second writer.
- **The Node server's data is `save/`** (gitignored). It is a near-empty throwaway, not the
  fixture.
  - Before the check, copy it to the scratchpad.
  - Afterwards, stop the server and restore it. Verify the restore by hash, and move any file the
    test created out rather than deleting it.
- **Model:** Echo needs no API key. In the model picker it sits under "For Developer" once "show
  unrecommended settings" is ticked.
- **Settings:** restore any setting you change. The `save/` restore covers the Node server's
  settings.
- **The leave-site guard prompts on every reload of the Node build**, by design
  (`preload.beforeUnload.test.ts`). A forced navigation does not get past it, and closing the tab
  hangs the tool.
  - Confirm the save reached `save/` (mtime and `__revisions.json`), then ask the maintainer to
    refresh or close the tab.
  - Close the tab before the server restarts, or it can write stale state back.
- **Network:** do not probe upstream services (`MC-081`).
- **Stopping the server.** `TaskStop` on `pnpm run runserver` kills only the pnpm wrapper. The
  `node server/node/server.cjs` child keeps listening on port 6001. Stop it by PID, and confirm
  the port is closed before restoring `save/`.
- **A hidden Chrome window.** When `document.visibilityState` is `hidden`:
  - screenshots time out;
  - chained timers are throttled, so `waitAlert` loops can take up to about a minute.

  Page scripts still work. Clicks via `element.click()` and page reads were enough for 28B's and
  28C's checks.
- **Seeding test data.** Use `globalThis.__pluginApis__.getChar()` / `setChar()` on the main page
  to set a field on the selected character; the `save/` restore undoes it. **Never switch the
  model this way.** `setDatabaseLite` did not reach the send path, and a test message went to the
  profile's default provider (row 205). Use the model picker.
