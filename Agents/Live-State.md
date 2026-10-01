# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For what finished stages leave for later ones, see `Agents/Carry-Forward.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-10-01.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It is pushed through `0a3fb2b0`.**
These later commits are local and not pushed:
- `d25a02fb`: CHORE-47's fix;
- `bb3f9e7b`: CHORE-47's records;
- `ccf45c53`: the chat-switch memory fix;
- `211e7603`: the records of the memory stage 1 plan, its gates and the real-profile findings;
- `2b3dd636`: memory stage 1 step 1, the exclusive manual clean-up (Report 50);
- `bc09a9a1`: the step 1 records and the Roadmap's Phase 2 status note;
- `db49aeeb`: memory stage 1 step 2, the v2 stub and the shared restore (Report 51);
- `d199b07b`: the step 2 records;
- `64f23154`: the manual clean-up reads saves that never used plugin storage (the empty-`pluginStorage` decoder fix);
- `96772e97`: the stage 1 live-check records and CHORE-50;
- `bd57aa19`: memory stage 1 step 3a, plugin and MCP reads and writes of
  archived characters (Report 52);
- `0e054956`: the step 3a records and `MC-146`;
- `1b38b5d5`: memory stage 1 step 3b, groups, the Playground's restore, the dataset export, the
  asset-integrity check and the plugin documentation (Report 53);
- `b4942db4`: the step 3b records;
- `08e43e65`: CHORE-16 PG-1, every character list skips the Playground and `§temp` characters
  (Report 54);
- `10ce39a7`: the PG-1 records;
- `6ad13bac` and `449b10e3`: the Wiki session's commits (the Playground page; then plain Markdown
  links for Emotion Images and Return to Home, by its commit subject);
- `a6719e35`: memory stage 1 step 4, the backup carries every unit it needs and plugin storage of any
  shape (Report 55);
- `129e5a14`: the step 4 records;
- `5f1ecdf9`: every agent profile gets the `PowerShell` tool and a Shell section (the Git Bash `Bash`
  tool fails on every call in this environment, even after an app restart);
- `33545c2c`: memory stage 1 step 5a (the 10-day archiving and the plugin-storage migration are gone,
  the `archiveCharacters` setting, the restore trash rule);
- `1327bcde`: Report 37, the chat HTML and CSS security surface, written by the read-only Q&A session
  and committed at the maintainer's request (no `doc-verifier` pass has run on it);
- `756e8210`: the step 5a records, CHORE-52 and CHORE-53 (`MC-148` to `MC-150`, ledger rows 521-526);
- `448962f4`: memory stage 1 step 5b, Load Internal Backup writes the snapshot as the main save and
  reloads, instead of installing it in memory;
- `57235222`: the records of the reroll bugs, CHORE-54 to CHORE-58, `MC-151` and QOL-04 to QOL-09 (by its
  commit subject);
- `712a76ad`: the CI and Docker rework (`MC-154`; ledger rows 536 and 537). The release step's legal flag now
  reads the opt-in repository variable `VITE_RISU_LEGAL_CONFIGURED`, as `docker-build.yml` does (`MC-155`);
- `38583d3b`: the desktop updater disable (`MC-154` 7; ledger rows 538 and 539);
- the records commit that carries this file.

Both of the last two were committed at the maintainer's approval ("commit the finished side works."). Push only
at the maintainer's request.

The working tree is not clean. It holds uncommitted work from this session: the step 5c work in progress (the
untracked `src/ts/storage/bootArchivePass.ts`, `characterDefaults.ts` and the test files, and edits to
`src/ts/bootstrap.ts`, `src/ts/process/coldstorage.svelte.ts` and `src/lang/en.ts`), and the 2026-10-01 edits
to `README.md` and the `Agents/` records. The untracked `docs/` folder holds the maintainer's WIP Terms of
Service and Privacy Policy templates; agents do not edit it (`MC-155` 4).

## Parallel sessions (2026-09-30)

Several sessions work **in this same checkout**:
- **"Main Campaign"** (this one) owns everything outside `wiki/`, including the `Agents/` records.
- **"Wiki"** owns `wiki/**` only. It writes nothing to `Agents/`; its findings, suspected bugs and
  questions go to the maintainer in its final report.
- **"Q&A"** is read-only. Its memory-footprint brief started the memory stages (`MC-130`), and it
  handed over the maintainer's real-profile measurement (ledger row 470).
- **"Fix Escape leaving a blocking alert unanswered"**, **"Fix Fullscreen setting error on web
  build"** and **"Fork rebranding exploration"** are idle or done; see Report 39/41 and ledger
  row 428.

**Next free numbers:** `MC-156` (`MC-155` is used), Report 56, ledger row 541 and CHORE-61
(`CHORE-60` is used). Check the ledger's last row before taking one. `MC-114` and ledger rows 371-374 were reserved for W2c-a and left unused; nobody
should fill them.

**Rules for every session:**
- stage by explicit path only;
- never `git add -A`, `stash`, `reset`, `checkout -- <path>` or `restore` on another session's files;
- commit and push only at the maintainer's request.

## Current work

### Resume here (hand-off, 2026-10-01, memory stage 1: steps 1, 2, 3a, 3b and 4 done)

1. **Memory-footprint stage 1 is planned and passed Gate 1** (Report 49, `MC-130` to `MC-145`,
   ledger rows 455-486). **Step 1 is done:** the exclusive manual clean-up (D11) and no startup asset
   sweep once a stub exists (D12), committed as `2b3dd636` (Report 50; Gate 2 approved at round 3,
   ledger rows 487-491). **Step 2 is done:** the v2 stub and the shared restore (D6, D7, D9 restore
   side), committed as `db49aeeb` (Report 51; Gate 2 approved at round 2, then one editorial
   round, ledger rows 494-497). **Step 3a is done:** plugin and MCP reads and writes of archived
   characters (the seam that reads a stub's unit as a copy, no-downgrade in the plugin setters, restore
   first in V3 `setChatToIndex` and the seven MCP write tools, the V2.1 restore-all in `loadPlugins`,
   and the two `MC-091` amendments), committed as the step 3a fix commit (`bd57aa19`; Report 52;
   Gate 2 by `opus-reviewer` approved at round 3 after two [REJECT] rounds, ledger rows 505-507;
   `MC-146`). **Step 3b is done:** groups (selecting a group restores its archived members, `addGroupChar`,
   `createNewChat`, and a group turn passes over a member that cannot be restored), the Playground's
   restore, `exportAsDataset`, `verifyAssetIntegrity` and the plugin documentation for `getDatabase` and
   the character and chat API, committed as the step 3b fix commit (`1b38b5d5`; Report 53; Gate 2 by
   `adversarial-reviewer`: round 1 [REJECT], rounds 2 and 3 [APPROVE], ledger rows 510-512; the
   plugin-docs fact-check is row 509). No live check of 3a or 3b was run. **Step 4 is done:** both local
   backups carry every unit the database they write refers to (chat and character archives that other
   archives point at, units named by the legacy "could not be loaded" error text, and V3 plugin storage of
   any shape, restored by a fork restore), with the character named in the prompt, no retained parsed
   `value`, and units first referenced during the asset copy carried too; committed as the step 4 fix
   commit (`a6719e35`; Report 55; Gate 1 by `adversarial-reviewer`, round 1 [REJECT], round 2
   [EDITORIAL], ledger row 518; Gate 2 by `opus-reviewer`, round 1 [REJECT], round 2 [EDITORIAL], row 519;
   the investigation is row 517 and the records fact-check row 520; `MC-147`). No live check was run.
   **Steps 5a and 5b are done** (`33545c2c`, `448962f4`; item 2). Steps 5c, 5d, 6 and 7 have no code yet.
   **CHORE-16 PG-1 is done:** every character-list view (the grid, the mobile list, the group-member
   picker and the previous/next hotkeys; the sidebar's order already skipped both when `checkCharOrder`
   adds ids) skips `§playground` and `§temp`, and opening the Playground clears its `trashTime` and marks
   the character for save (defence in depth); committed as the PG-1 fix commit (`08e43e65`; Report 54;
   Gate 2 by `adversarial-reviewer`, rounds 1 and 2 both `[EDITORIAL]`, corrections applied; ledger rows
   514-516: the survey, Gate 2, the records fact-check). No live check was run. PG-2, PG-3 and PG-4 stay
   open.
   - **Live check of steps 1 and 2 (ledger row 499):** the manual clean-up refused on a profile whose
     `pluginStorage` block is empty (row 500; upstream writes the same empty block). The decoder fix
     and its red-first tests are committed as `64f23154`. The fix passed its `opus-reviewer` gate
     (`[EDITORIAL]`, corrections applied; row 502) and was re-checked live on a scratch Node
     server; the manual clean-up then completed. CHORE-50
     (the first run of a new Node server fails until a reload) was filed from the same session.
   - The round-5 verdict was `[EDITORIAL]`. Its corrections were applied to the plan by the
     Orchestrator and not re-verified; Report 49's section 3 marks what was added after Gate 1.
   - Design:
     - characters are archived only by an exclusive boot pass;
     - an opened character stays loaded until the next page load;
     - an automatic idle reload releases what was opened (`MC-140`, `MC-141`);
     - there is no runtime archive engine (ledger row 475).
   - The working copy of the plan is in the session scratchpad (`memfoot/stage1c/plan.md`).
     Report 49 is the durable version.
2. **Next: memory stage 1 step 5c, the boot pass** (5a and 5b are done; Report 49 section 3.4, step 5;
   Gate 2 is `opus-reviewer`).
   - **CHORE-16 PG-1 is done** (Report 54). The Wiki session has committed the Playground page
     (`wiki/Playground.md`, `6ad13bac`) to match it. The Main Campaign session does not touch `wiki/**`.
   - **A CI/Docker rework and the desktop updater disable are committed** (`712a76ad` and `38583d3b`;
     `MC-154`; ledger rows 536 to 539). The CI/Docker rework passed Gate 2 `[APPROVE]`; the updater disable
     passed `[EDITORIAL]` and its correction is applied. Neither has had a real run: no Docker build, no PR
     Check on GitHub, no desktop build or launch. The first manual run of PR Check is the first evidence that
     the checks are green on Linux. The rest of the release identity is **CHORE-60** (open, not scheduled, a
     release blocker). The legal flag stays unset in every build until the maintainer's own Terms of Service
     and Privacy Policy exist (`MC-155`). The `origin/main` mirror that ran upstream's old workflows is
     deleted, with a stale unrelated branch; `origin` holds only this branch (CHORE-60, 2026-10-01).
   - **CHORE-51 is filed** (DATA LOSS, open): the manual clean-up's keep set never reads chat units, so
     a unit named only by error text inside a chat unit is deleted and that chat's Retry then fails. It
     predates step 4. The new pure `listInnerColdStorageKeys` in `coldstorageData.ts` is written so the
     clean-up can reuse it. It is now scheduled after step 5 and before step 6 (work order, 2026-10-01).
     A fix changes the clean-up's read cost and step 1's gated design.
   - **CHORE-52 is filed** (LOW, integrity hardening; ledger row 521): cold-storage keys are not
     shape-checked before they reach a storage path, on all three backends. No traversal was found; the
     open question is key aliasing, which a shape check does not fix. Scheduled with CHORE-51, after
     step 5.
   - **CHORE-53 is filed** (DATA LOSS, open; ledger row 523; `MC-150`): delete actions in several lists
     act on a stale target, and the Enter that answers a confirm also clicks the control behind it. The
     character trash case is fixed on the fork; the open defects are in the Roadmap. It is scheduled right
     after step 5, before CHORE-51 and CHORE-52 (`MC-150` 4).
   - **Step 5's scoping is recorded:** ledger row 522, `MC-148` (enriching upstream stubs) and `MC-149`
     (the four step 5 answers). Step 5 is split into four sub-steps, each with its own gates:
     - **5a, done** (`33545c2c`): the 10-day archiving and the plugin-storage migration are deleted;
       the checkbox binds the new root key `archiveCharacters` (absent and `true` mean on); the
       label and help text are new in all seven languages; at restore the stub's trash state wins for
       every stub (`MC-149` 4). Gate 1 `adversarial-reviewer` [APPROVE]; Gate 2 `opus-reviewer` round 1
       [EDITORIAL], round 2 [APPROVE]. Nothing archives until 5c. Root `coldstorage` still gates the
       startup asset sweep and remote-block clean-up, with no UI (`MC-149` 2).
     - **5b, done** (`448962f4`): `loadInternalBackup` writes the snapshot and reloads, with
       `LoadLocalBackup`'s other-tab refusal. Gate 1 `adversarial-reviewer` round 1 [REJECT], round 2
       [EDITORIAL] (ledger row 527); Gate 2 `opus-reviewer` round 1 [REJECT], round 2 [APPROVE] (row 530).
     - **5c:** the boot pass (exclusive hold, fenced commit, the one-time notice, the D1 capability gate,
       `uuid` unit ids, an optional `enableRemoteSaving` encoder input, no commit when nothing changed,
       no pass on backup-fallback boots). **Gate 1 is closed** (`opus-reviewer`: round 1 `[REJECT]`, round 2
       `[EDITORIAL]`; ledger rows 534 and 535; the plan is `step5/5c/plan.md` in the session scratchpad,
       sections 8 and 9 hold the dispositions). **The red tests are done** (76 red tests and 52 guards; the
       Orchestrator re-ran them) and **the implementation is in progress.** The test files are untracked, under
       `src/ts/storage/tests/`, `src/ts/bootstrap.archivePass*.test.ts` and `src/ts/process/tests/`. Gate 2 is
       `opus-reviewer`.
     - **5d:** the D18 breaker, the `MC-148` enrichment, the "unavailable" wording and the user docs.
     The plan working copies and gate records are in the session scratchpad (`step5/`); the step 5
     report records the Orchestrator's own implementation calls.
   - **The 5c pass must pin these invariants with its own tests.** The tests deleted in 5a pinned them for
     the old pass, and nothing tests them now:
     1. a stub is built from the unit as read back, not from the live character;
     2. a stub is never archived twice;
     3. list order is preserved around an archived slot;
     4. a trashed character or group writes no unit and stays full;
     5. the stub's single placeholder chat has an id;
     6. while any enabled V2.1 plugin exists, no character is archived (V2.0, V3 and disabled V2.1
        plugins do not block);
     7. one malformed character (a group without a member list, a non-string `creatorNotes`) never
        stops the pass;
     8. a pointer chat or legacy error-text chat inside an archived character is carried unchanged;
     9. test on both the Node-server and OPFS in-memory backends; neither says anything about Tauri.
     Two strings are unused until 5c: `errors.coldStorageWriteFailed` and
     `errors.coldStorageVerifyFailed`.
   - Step 5 lands before the idle reload (step 6). Step 6 has hang points for a backup-in-progress
     signal: the early `return`s of `SaveLocalBackup` and `SavePartialLocalBackup` and the `finally` of
     `LoadLocalBackup` (Report 55 section 7). Open follow-ups: step 1's in Report 50 section 6, step 2's
     in Report 51 section 6, step 3a's in Report 52 section 6, step 3b's in Report 53 section 6 and step
     4's in Report 55 sections 7 and 8 (among them: whether step 5's pass should enrich
     upstream-made stubs is a question for the maintainer at step 5; step 5 reuses
     `hasEnabledV21Plugin`, owned `loadInternalBackup` (5b: it now writes the main save and reloads), and
     owns the `§` exclusion from archiving).
3. **After stage 1** (`MC-145`):
   - the upstream-compatible inline-everything backup;
   - then archiving of modules that are not enabled;
   - then the rest of stage 2 (streamed backup);
   - stage 3 (the Node streamed write, CHORE-46) is re-measured first.
4. **Scratch tooling that stays useful:**
   - the synthetic generator's `real2` preset reproduces the maintainer's profile (ledger rows 476
     and 477);
   - the retainer measurement harness (rows 471 and 474);
   - the maintainer's read-only probe scripts (`shell-fields.cjs`, `profile-probe.cjs`,
     `chat-split.cjs`).

   All of these live in the session scratchpad, `memfoot/`.

## Work order

1. **Memory stage 1** (Report 49), steps 5-7 (steps 1, 2, 3a, 3b and 4 are done, Reports 50-53 and 55),
   in this order:
   1. memory stage 1 step 5, the boot pass (the scoping is recorded: ledger row 522, `MC-148` and `MC-149`;
      5a and 5b are done, `33545c2c` and `448962f4`; 5c and 5d follow);
   2. then **CHORE-53** (DATA LOSS: delete actions act on a stale target, and Enter clicks the control
      behind a confirm; ledger row 523; `MC-150` 4, the maintainer agreed to this position);
   3. then **CHORE-43** (unreroll can write one chat's reply into another) **with CHORE-54** (rerolling
      or going back through rerolls overwrites an edited reply with its generation-time copy; data
      loss, save path inferred). The maintainer placed both right after CHORE-53 (ledger row 528;
      `MC-151` 3, "Right after CHORE-53"). The Orchestrator's recommendation (CHORE-54) is to fix them in
      one change, because both live in the reroll history's ownership;
   4. then **CHORE-51** (DATA LOSS), **CHORE-52** (the unvalidated cold-storage key), **CHORE-55**
      (Tauri main-file writes are not atomic) and **CHORE-59** (Load Internal Backup offers to load the
      intact data of a partly damaged snapshot; `MC-152`; placement is the Orchestrator's choice), each
      its own change with its own gates. The maintainer
      asked on 2026-10-01 for CHORE-51 and CHORE-52 to be added to the work order; their position is
      the Orchestrator's choice. Neither depends on step 5 or step 6, and CHORE-51 is DATA LOSS, so it
      should not wait behind the idle reload and the measurements. CHORE-55 goes in this stretch by
      the maintainer's choice (`MC-151` 3, "With CHORE-51/52");
   5. then steps 6 and 7;
   6. then **CHORE-58** (measure first): PNG character import copies its read buffer quadratically on
      large assets (ledger row 532). It is import performance, not data loss, so it goes last; the maintainer
      accepted the Orchestrator's recommended placement (`MC-151` 8). Its first task is a measurement on the
      real module or the live app.
   - **CHORE-16 PG-1 is done** (Report 54, commit `08e43e65`), the small fix the maintainer approved on
     2026-10-01 between step 3b and step 4. Every character-list view skips `§playground` and `§temp`, as
     `checkCharOrder` does, so the Playground's "assistant" character can no longer be opened or deleted
     from the grid or the mobile list. The Wiki session has updated `wiki/Playground.md` (`6ad13bac`). PG-2,
     PG-3 and PG-4 are open.
2. **The inline-everything backup, then module archiving** (`MC-145`).
3. **The wiki's composer and send batch** (Wiki session; unblocked since W2 and W3 are done).
4. **CHORE-35's opt-in stage:** the remaining upstream-infrastructure features (`MC-092`).

Not placed in the sequence:
- **CHORE-40** (the copy button's URL fetch): open; the Roadmap gives no position.
- **CHORE-41** (the edit-button bug): blocked on the maintainer's console output.
- **CHORE-45** (the script cache misses on a repeat send in a long chat): filed, not scheduled. It
  waits for the memory work.
- **CHORE-46** (the Node server's 100 MB body limit): re-measure after stage 1 (Report 49).
- **CHORE-48** (inlays are never backed up): waits for the maintainer's answer.
- **CHORE-49** (the Node server does not boot over plain HTTP; `MC-144`): filed, not scheduled.
- **CHORE-60** (release identity: the desktop build still carries upstream's identity; the updater part is
  done and committed as `38583d3b`; the rest has no decision): open, not scheduled. It must close before the
  first release (`MC-089`). Its release blockers include the maintainer's own Terms of Service and Privacy
  Policy with the legal flag then set (`MC-155`). The 16 inherited upstream pre-releases and their tags were
  deleted by the maintainer on 2026-10-01; `origin` now has no release and no tag.
- **CHORE-56** (under the beta mobile layout, a touch that ends on a button, input, select or textarea
  throws a TypeError in the swipe handler): suspected; TRACED, not run. The maintainer has not yet
  confirmed or placed it.
- **CHORE-57** (chat import offers `.txt` but has no `.txt` branch, so a picked `.txt` does nothing and
  says nothing): suspected, from reading; not run. **Low priority**, by the maintainer's decision
  (`MC-151` 7); no position in the order.
- **Follow-ups from the memory work** (Report 49, section 5):
  - switching to a chat whose cold-storage unit is missing still retains the previous chat's
    messages;
  - a rejected avatar image shows no icon.

`MC-089`: nothing ships until every open ticket clears.

## Open follow-ups, waiting on the maintainer

1. **A native-speaker check on the new translations.**
   - The translator suggested one for the German and Vietnamese `restoreNoLockWarningConfirm` (a
     data-loss warning) and the German `{{slot}}` phrasing.
   - For the manual clean-up (step 1), the translator flagged the consent and warning strings in
     every language; the maintainer accepted the Korean strings on 2026-09-30, so the native-speaker
     check remains for cn, zh-Hant, vi, de and es (Report 50 section 6).
   - Step 2 added one string, `coldStorageRestoreUnreadable`, to ko, cn, zh-Hant, vi, de and es. The
     reviewer checked the meaning; the native-speaker check is open for all six (Report 51 section 6).
   - Step 3a added four strings (`coldStorageNamedRestoreFailed`, `coldStorageNamedRestoreUnreadable`,
     `coldStoragePluginRestoreProgress`, `coldStoragePluginRestoreIncomplete`) to the same six
     languages. The reviewer checked the meaning. The translator's low-confidence notes: ko, the
     particle 을(를) after `${characterName}`; cn and zh-Hant, "N items left" (还剩 N 项 / 剩餘 N 項); vi,
     whether "đang được bật" reads as "the plugin is enabled", and "Chúng vẫn ở trạng thái lưu trữ";
     es, the file mixes tú and usted (Report 52 section 6).
   - Step 3b added four strings (`coldStorageGroupMembersNotLoaded`, `coldStorageDatasetExportSkipped`,
     `assetIntegrityReadingArchivedProgress`, `assetIntegrityReportArchivedNotChecked`) to the same six
     languages, with "first message" as the term (the maintainer's call, 2026-10-01). **The maintainer said
     on 2026-10-01 that the new Korean strings look fine.** The native-speaker check is open for cn,
     zh-Hant, vi, de and es. The round-1 reviewer noted that vi "tài sản" and es "activos" read slightly
     like "property" or "financial assets" but match those files' existing asset strings (Report 53
     section 6). The translator's low-confidence notes: ko, the 첫 메시지 wording (the maintainer said the Korean looks fine so far); cn, 初始消息
     (the file's `firstMessage` term) against 问候语 (used for `alternateGreetings`); zh-Hant, 開局訊息 may
     read slightly odd; vi, "nhóm trò chuyện" could read as "chat group" rather than "the group talks",
     and "chưa được kiểm tra tài sản" is clipped; de and es, "spricht" and "habla" are literal; es,
     "activos" in the report line reads stiff.
2. **CHORE-41's console output** (ledger rows 201-202 and 206): why the edit button stays dead across
   repeated clicks.
3. **The MC-091 workflow pilot:** evaluating it is the maintainer's.
4. **CHORE-48:** should a backup carry inlays?
5. **The member picker offers an upstream group placeholder** (pre-existing, found at step 3b's Gate 2
   round 3; Report 53 section 5): the picker lists `char.type !== 'group'`, and an upstream-made group
   placeholder is typed `'character'`, so it is offered, and picking it in `addGroupChar` now restores the
   group and adds it as a member of another group. The reviewer's smallest guard: treat a `ready` result
   of `type` `'group'` like `gone`. What the user should see is the maintainer's call.
6. **Report 48's leads:**
   - odd `risuext` extension names;
   - the "missing" wording;
   - a partial file after an entry of 4 GiB or more.
Answered on 2026-10-01 and removed from this list:
- the internal backup load refuses a snapshot with a damaged or missing block as a whole (it was item 7). The
  maintainer wants an option to load the intact data (`MC-152`); filed as CHORE-59 and placed in the work
  order;
- whether the fork's own builds set `VITE_RISU_LEGAL_CONFIGURED` (it was item 8). The flag stays unset in every
  build until the maintainer's own Terms of Service and Privacy Policy exist (`MC-155`); the Docker build and
  both publishing workflows read it as an opt-in setting that is empty by default. The maintainer's answer
  does not mention the investigation of every request the fork sends to upstream's servers that the
  Orchestrator had offered.

**Wiki session hand-off (no edit to `wiki/**` was made by this session).** Checked against source on 2026-10-01:
- `wiki/Migrating-from-upstream.md` (the "In-place upgrades" section, and the earlier sentence about the same
  server folder or Docker volume) describes swapping an upstream Docker install for this fork on the same
  volume as a supported route (`MC-087` 1). The fork's default `docker-compose.yml` now uses its own project,
  container and volume names (`risuai-fork`, `risuai-fork-save`; `MC-153` 2), so an upstream Docker volume is
  opened in place only if the user points the compose file at it deliberately. The `save/` folder route on a
  Node server is not affected.
- `wiki/Settings-Backup-and-Files.md`, the Load Internal Backup row, says it installs the restored database,
  shows "Loaded backup" and "does not reload the app". Since `448962f4`, `loadInternalBackup`
  (`src/ts/drive/internalBackup.ts:154-180`) writes the snapshot as the main save and reloads the page (or
  relaunches on Tauri). The Clean Unused Cold Storage row uses the old label; the English label is now "Clean
  Unused Archived Data and Assets" (`cleanColdStorage` in `src/lang/en.ts`), and the clean-up also deletes
  unused asset files and has more refusals (`src/ts/storage/manualCleanup.ts`, `currentRefusal`).
- `wiki/Settings-Advanced.md`, the Cold Storage row, uses the old label, the root key `coldstorage` and the
  old default. Since `33545c2c` the checkbox is "Archive characters at startup" (`coldStorage` in `en.ts`),
  bound to `archiveCharacters` (absent or `true` means on; `src/ts/setting/advancedSettingsData.ts`, id
  `adv.coldstorage`), and at HEAD nothing reads it, until the step 5c boot pass lands.

## Finished stages

One row per stage. The Report's STATUS block holds the outcome and the ledger rows hold the
dispatches; `Agents/Carry-Forward.md` holds what a stage left for later ones. Earlier stages
(Phase 0 to durable drafts) are in `Agents/Roadmap.md`.

| Stage | Report | Fix commit(s) | Records commit(s) | Ledger rows |
|---|---|---|---|---|
| W0, identity (`chatIds.ts`, `chatOrigin.ts`) | 24 | `d7505e2f` | `b50c8974` | 164-172, 176-177 |
| CHORE-28, duplicate `chaId` save guard | 26 | `2420d717` | `21668b28` | 178-184 |
| CHORE-34, multiuser removal | 27 | `911376cb` | `c225643b` | 185-189 |
| CHORE-33, RisuAccount removal (28A, 28B, 28C) | 25, 28 | `e1dd839c`, `87b974e5`, `d2653123`; follow-ups `58f37298`; comment sweeps `57d1596a`, `2f6ce6d3` | `4aa29913`, `fd13d930`, `877d233b`, `9cbe2901` | 173-175, 190-200, 203-205, 207-216, 218-222, 224-225, 228 |
| CHORE-39, OPFS migration | 30 | `37898465` | `9cbe2901` (plan), `b7b1fd00` | 223, 226-227, 229-231 |
| Removal stage (Drive, dead code, `risuaiAccountCached`, Patreon; `MC-093`) | 31 | `2af8d4fe`, `a9c29ba7`, `237ebba1` | `e8500372` | 232-241 |
| Upstream sync (Svelte 5.56.8, zh-Hant, `{{slot}}` help) | none | `425080e6`, `f190d950`, `0efc3d22`, `4cdb5ef1` | `80c9128a` | 244-245, 248 |
| CHORE-42, local restore with other tabs open | 32 | `ce6bc594` | `80c9128a`, `2cdfb2b5` | 242-243, 246-247, 249-252 |
| W1a, every write a trigger run makes | 33 | `13ed2e75` | `490bdec2` | 253-264 |
| W1b, the parser and the read side | 34 | `22db8dfe` | `790643ff` | 265-271 |
| Composer stage (S0 hotkeys, S1 actions, S2 per-chat drafts; CHORE-44 folded into S2) | 22 | `b05231c6`, `1bc5f288`, `67f17f1a` | `2177f7d2`, `9ce59e0d` | 157-158, 272-286, 288-300 |
| Vitest excludes `.claude/**` | none | `7b72b813` | `127f84d1`, `d4b0262d` | none |
| Upstream batch (`MC-101`) | none | `3482ef4f`, `73edeb69`, `295c0fa7`, `5064bc4c`, `5c85cac7`, `0f38ac8c`, `9213ebc2` | `679e7ff4` | 287, 301-304 |
| W2a, a send writes into the chat it started in | 35 | `ec65c200` | `650dd97f` | 305-318 |
| W2b-core, one generation at a time | 36 | `ac8cb3da` | `6940a7b3` | 319-333 |
| W2b-previews | 38 | `8f93d095` | `5e4a2bfd` | 334-347 |
| Escape on alerts, stage 1 | 39 | `6631f5e0` | `9dee3ea9` | 348-354 |
| W2c-a, scripts, Lua edit triggers and lorebook | 40 | `79c6e35e` | `4576d07e` | 355-370 |
| Escape on alerts, stage 2 | 41 | `c0b323b0` | `d848ecdf` | 375-381 |
| W2c-b, prompt parses, persona and summaries | 42 | `9d493c79` | `dd41a43d` | 382, 384-392 |
| W2c-c, the prompt's index tags and hidden messages | 43 | `d27a1ee4` | `1e8c64f1` | 393-403 |
| W2d-a, the `request` trigger and the prompt's names (CHORE-27) | 44 | `4c34172c` | `86c1e806` | 404-416 |
| W2d-b, the tool path, graph memory, `risuaccess`, `aiaccess`, four request bugs | 45 | `efd417b9` | `c67bffed` | 417-427 |
| Fullscreen on web (its own session and worktree) | none | `51e923eb` | `61b5a885` | 428 |
| W3, `/` commands, `/multisend` and Post File on their own chat; the command bugs | 46 | `e07d32fb` | `26d57bdc` | 429-443 |
| W2e, a delete warns about and stops the work in its chat; a backup load is refused while busy | 47 | `baf238e7` | `7d4bc4b0` | 444-454 |
| CHORE-47, a local backup includes non-`.png` assets | 48 | `d25a02fb` | `bb3f9e7b` | 461-467 |
| The chat-switch memory fix (the sender icon's `{#await}`; `MC-136` 4) | 49 (section 6) | `ccf45c53` | the records commit after `ccf45c53` | 471, 474, 483 |

Escape on alerts stage 2 and W2c-a were merged as `1d6fa16b`.

## Operational notes for this environment

- **Git Bash here fails on heredocs, and on single commands longer than about 230 characters.**
  Write scripts with the Write tool, or use PowerShell. Commit with `git commit -F <file>`.
- **Git Bash rewrites any argument that begins with `/`** (MSYS path conversion). `git grep
  '/kei'` reported no matches when there were five. Prefix such commands with
  `MSYS_NO_PATHCONV=1`, or drop the leading slash from the pattern.
- **Tool grants** (`^tools:` in `.claude/agents/*.md`, checked 2026-09-30):
  - `opus-reviewer`, `adversarial-reviewer`, `investigator` and `deep-investigator` hold `Write`, for
    scratchpad files only (in effect since 2026-09-25); `perf-analyzer` also holds `Write`;
  - `doc-writer`, `sonnet-coder`, `test-warrior` and `translator` hold `Write` and `Edit`;
  - `code-searcher`, `code-reader`, `doc-verifier` and `senior-advisor` have neither;
  - `code-reader`, `investigator` and `deep-investigator` also hold `Agent`.

  Check the file before a brief promises a tool.
- **Tell every agent** to run shell commands from the scratchpad, never from the repo root, and
  never to use globs in `mkdir` or `cp`.
- **Mutants:** build them from the current source each round, through a scratch Vitest config
  that aliases the module. When swapping in HEAD versions of files, serve every changed file,
  including the `./en` import.
- **`pnpm remove`/`add` backfill `libc:` metadata** into unrelated lockfile entries (pnpm
  10.34.1). Strip the added lines so the lockfile diff is only the intended change, then validate
  with `pnpm install --frozen-lockfile --offline`.
- **Line endings.** The `Agents/` documents are LF in the index. With `core.autocrlf=true`, a
  checkout that rewrites a file leaves it CRLF in the working tree. That is harmless to git, which
  normalises on commit, but normalise it back to LF when you edit. After any edit run
  `git ls-files --eol <file>`: it must say `w/lf`. Judge counts by `git diff --numstat` and git's
  "LF will be replaced" warnings, not by Git Bash `grep`/`od` counts, which misreported twice.

## Open items

- **Possibly still present:** `C:\Projects\scratch_investigator_tmp` (empty) and
  `Temp\claude\coldstorage.svelte.ts.bak`. The maintainer deleted `%TEMP%\qa1`.
- **Scratch trees with `node_modules` junctions.** Remove each junction with `cmd /c rmdir` before
  any recursive delete.
- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists.
- **Card description contrast** (`text-textcolor2` on the home cards) measured 3.32:1 in a live check
  on 2026-09-23 (`fe90145e`), for one colour scheme. A maintainer decision; not raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).
- **"Backup & Files" still uses the old account tab's person icon** (`UserIcon` in
  `Settings.svelte`; cosmetic, not recorded elsewhere).

## Test suite

- **Step 4's final tree (the step 4 fix commit, `a6719e35`):** 229 files, 3,876 passed, 4 skipped;
  `pnpm check` 0 errors and 0 warnings; `pnpm build` exit 0 (Report 55 section 4; run on the snapshot
  Gate 2 round 2 reviewed). Round 2's editorial corrections touched comments and test titles only, and
  the two new test files were re-run (109 passed); the full suite was not re-run after them.
- **CHORE-16 PG-1's final tree (the PG-1 fix commit, `08e43e65`):** 227 files, 3,767 passed, 4 skipped;
  `pnpm check` 0 errors and 0 warnings; `pnpm build` exit 0 (Report 54 section 4). The Gate 2 editorial
  fixes (three comments in round 1, two in round 2) touched comments only, and the full checks were not
  re-run after the round-2 rewordings.
- **Step 3b's final tree (the step 3b fix commit, `1b38b5d5`):** 222 files, 3,724 passed, 4 skipped;
  `pnpm check` 0 errors and 0 warnings; `pnpm build` exit 0 (ledger row 512; the Orchestrator ran all
  three on the final tree after Gate 2 round 3; they replace an earlier run of 3,723).
- **Step 3a's final tree (the step 3a fix commit, `bd57aa19`):** 216 files, 3,680 passed, 4 skipped;
  `pnpm build` exit 0 (ledger row 507; both on the snapshot Gate 2 approved); `pnpm check` 0 errors and
  0 warnings on the final tree, after the post-approval edits (`3a/gate/check-final.log`). The full suite
  and the build were not re-run after the editorial edits to two test headers and the commit message;
  the two edited test files were, 4 passed.
- **Step 2's final tree (`db49aeeb`):** 209 files, 3,559 passed, 4 skipped; `pnpm check` 0 errors;
  `pnpm build` exit 0 (ledger row 497; taken before the round-3 comment-only edits). Step 1's tree
  (`2b3dd636`) had 205 files, 3,436 passed, 4 skipped (row 490). The baseline before step 1 was W2e's
  `baf238e7`: 198 files, 3,269 passed, 4 skipped, 0 failed (row 452).
- `cargo check` last ran on the removal stage.
- Run the suite with plain `pnpm test` or `npx vitest run`. `vitest.config.ts` excludes
  `.claude/**` (`7b72b813`).

## How to live-check this app

- **OPFS is not offered on the Node server.** To live-check the OPFS switch, build as below, then
  serve `dist` with `pnpm run preview -- --port 4173 --strictPort` in the background and use a
  Chrome window at least about 1300 px wide (narrower windows hide the Settings menu behind the
  list button). Stop it by the PID listening on 4173. The localhost:4173 origin holds only
  throwaway test data.

- **Default method: the built-in pane, on a scratch Node server.** Observed 2026-10-01 (ledger row
  501).
  1. **Build for production.** Run `pnpm run build` with `$env:VITE_RISU_LEGAL_CONFIGURED='TRUE'`
     set for that one PowerShell command only. The maintainer approved this on 2026-09-25.
  2. **Start the scratch server.** `server/node/server.cjs` resolves `dist` and `save` from its
     working directory. Make a scratchpad folder holding a junction `dist` to the repo's `dist` and
     an empty `save`. Set `PORT=6011` and run `node C:\Projects\RisuAI\server\node\server.cjs` from
     that folder, as a background process. The repo's `save/` is not touched, so no backup or
     restore is needed.
  3. **Open the pane with `preview_start`** on the `risuai-prod-scratch` entry of
     `.claude/launch.json` (attach-only: `http://localhost:6011`, port 6011, no command). **Never use
     plain `navigate` for the first open.** A pane tab opened that way stops at "Checking Service
     Worker..." with "Failed to register a ServiceWorker ... An unknown error occurred when fetching
     the script"; the pane's network log shows no `sw.js` request, while `curl` gets `/sw.js` with
     200 `application/javascript`. A tab opened with `preview_start` registers the service worker
     and boots.
  4. **Reload with `navigate` and `force: true`.** The Node build's leave-site prompt blocks a
     plain reload; `force` passes it.
  5. **First run on an empty `save`:** the app asks "Set your password to security", and after the
     password is entered the boot stops with the alert "getItem Error" (CHORE-50, open). Reload,
     and enter the same password at "Input your password..."; it then boots. Keep the test
     password in the scratchpad, never in chat or in the docs.
  6. **`tabs_context` reports whether the pane is displayed.** In a displayed pane the page is
     `visible`, and `requestAnimationFrame` and `IntersectionObserver` callbacks fire.
  7. **Stop the server by the PID listening on 6011** and confirm the port is closed.
- **Model:** Echo needs no API key. In the model picker it sits under "For Developer" once "show
  unrecommended settings" is ticked.
- **Settings:** restore any setting you change, or use a fresh scratch `save` for the next check.
- **Network:** do not probe upstream services (`MC-081`).
- **A delayed model with no network:** register a probe with `__pluginApis__.addProvider(name, async
  (arg, abortSignal) => ...)` that records the call and its abort, then pick "Plugin Legacy" (behind
  "show unrecommended settings") and choose it in the plugin select; set the auxiliary model to Echo.
  A confirmation that must land during the wait goes in the same `browser_batch` as the send, and
  the delay must outlast every confirmation (W2e's first 10 s probe finished before the second one).
- **Seeding test data.** Use `globalThis.__pluginApis__.getChar()` / `setChar()` on the main page
  to set a field on the selected character; a fresh scratch `save` (or the `save/` restore, in the
  fallback) undoes it. **Never switch the model this way.** `setDatabaseLite` did not reach the send
  path, and a test message went to the profile's default provider (row 205). Use the model picker.

### Fallback: Claude in Chrome, against the repo's `save/`

Use it when the pane cannot do the check. Its caveats:
- **Start the server yourself.** Run `pnpm run runserver` (port 6001) as a background process, after
  the production build above.
  - Do not point the built-in pane at this server (no `preview_start` on it). It would open the app
    on the same server storage, making a second writer.
- **The Node server's data is `save/`** (gitignored). It is a near-empty throwaway, not the
  fixture.
  - Before the check, copy it to the scratchpad.
  - Afterwards, stop the server and restore it. Verify the restore by hash, and move any file the
    test created out rather than deleting it.
  - The `save/` restore also covers the Node server's settings.
- **Claude in Chrome opens its tab in the background**, so the page starts hidden. Ask the
  maintainer to bring that window and tab to the front before the first click.
- **The leave-site guard prompts on every reload of the Node build**, by design
  (`preload.beforeUnload.test.ts`). In Chrome a forced navigation does not get past it, and closing
  the tab hangs the tool.
  - Confirm the save reached `save/` (mtime and `__revisions.json`), then ask the maintainer to
    refresh or close the tab.
  - Close the tab before the server restarts, or it can write stale state back.
- **Stopping the server.** `TaskStop` on `pnpm run runserver` kills only the pnpm wrapper. The
  `node server/node/server.cjs` child keeps listening on port 6001. Stop it by PID, and confirm
  the port is closed before restoring `save/`.
- **A hidden Chrome window.** When `document.visibilityState` is `hidden`:
  - screenshots time out;
  - chained timers are throttled, so `waitAlert` loops can take up to about a minute.

  Page scripts still work. Clicks via `element.click()` and page reads were enough for 28B's and
  28C's checks.
