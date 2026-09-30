# Report 52 — Memory stage 1, step 3a: plugin and MCP reads and writes of archived characters (D3 setter part, D4 plugin and MCP writers, D5 plugin and MCP readers, D16 runtime)

**STATUS:** done, 2026-10-01. **Gate 2 approved at round 3** ([APPROVE]) after two [REJECT] rounds, all by
`opus-reviewer` (ledger rows 505-507). Committed as `bd57aa19`; this report is added by the records commit that follows it. Step 3 was split in two by the
Orchestrator. This report covers **3a** only. **3b** (groups, the Playground's restore, `exportAsDataset`,
`verifyAssetIntegrity` and the `risuai.d.ts` / `plugins.md` notes) and steps 4-7 of Report 49 are not
started, so memory stage 1 as a whole is not done. The plan was gated once, as part of the stage plan
(Report 49, Gate 1); this step had its own Gate 2 only.

Two consecutive [REJECT] rounds and then an approval: the three-round escalation rule (`AGENTS.md`
section 1.2) was not triggered.

Final checks by the Orchestrator. On the snapshot that Gate 2 round 3 approved: `pnpm test` 216 files,
3680 passed, 4 skipped (`3a/gate/full-r3.log`) and `pnpm build` exit 0 (the exit code is from the
Orchestrator's command output; `build-r3.log` shows "built in 10.39s" and no exit code). `pnpm check`
was run on the final tree, after the last production edit and after the post-approval header edits:
0 errors and 0 warnings (`3a/gate/check-final.log`). After the approval the Orchestrator made
editorial-only changes: two test-file headers (the wording "no on-screen control for 'wait2' and
'wait'; only Escape closes those") and the commit message's wording and wrapping. Those edits were not
re-reviewed. The Orchestrator's edit script asserted that each replaced text occurred exactly once.
`git status` and the diffstat afterwards showed no change outside the step's files
(`3a/gate/final-status.txt`). The full suite and the build were not re-run after the editorial edits;
the two edited test files were re-run, 4 passed (`3a/gate/final-headers-run.log`). Nothing was run in a
browser or a Tauri build (section 5).

**Sources** (scratchpad `memfoot/step3/`; not durable, so this report and ledger rows 504-508 are the
durable record):
- `brief-3a.md`: the invariants I1-I8, the acceptance scenarios S1-S24, the test rules and the
  Orchestrator's decisions (section 1 of the brief);
- `packet.md`: the investigator's code map at HEAD `96772e97`, whose refuted or corrected premises are
  R1-R8 and whose open questions are Q1-Q6 (ledger row 504); `idx-sites.txt` (the 123-line index-site
  sweep behind the writer list); `records-notes.md` (the Orchestrator's notes for this batch);
- `3a/red.log`, `3a/red-r1.log`, `3a/red-r2.log`: the red-first evidence;
- `3a/remediation-r1.md`: the remediation brief after round 1;
- `3a/gate/review-r1.md`, `review-r2.md`, `review-r3.md`: the Gate 2 hand-backs, saved by the
  Orchestrator (the reviewer does not write report files);
- `3a/gate/full-r3.log`, `build-r3.log`, `check-final.log`, `final-status.txt`, `final-headers-run.log`: the final checks;
- `3a/commit-msg.txt`: the commit message; this report agrees with it;
- `Agents/Reports/49-memory-stage-1-plan.md` (section 3.3 D3, D4, D5, D16; 3.4 step 3; 3.5; 3.6 risks 1
  and 4) and `Agents/Reports/51-memory-stage-1-step-2-stub-and-restore.md`.

Decisions bearing on this step (the ones `brief-3a.md` lists). `MC-011` (the fork has never shipped;
upstream characters, stubs, backups and plugins must keep working). `MC-132` 1 (a V3 plugin may load
archived data on demand, and a call may be slow). `MC-132` 2, which already names V2.1 only (Report 49 3.2 and D16 had read it as V2/V2.1; `MC-146` 4 settles that V2.0 is excluded, so only an enabled
V2.1 plugin keeps everything loaded). `MC-133` 2 (the boot pass: `RisuSaveEncoder.init` and the full-reload sites are not rewritten in stage 1; "no change to the block format, encoder, stub or unit shape" is the brief's I8).
`MC-136` 3 (V3 `getDatabase('all')` returns placeholders, as upstream). `MC-140` (a restored character
stays full until the next page load). `MC-146` 1 (a plugin or MCP call that reaches a missing or
unreadable archive fails to the caller, with one user alert naming the character; nothing is written into
the placeholder). Two `MC-091` amendments, A1 and A2, are the Orchestrator's (section 3).

## 1. What step 3a changed

Summary from the commit message (`commit-msg.txt`); the numbered invariants are in the brief.

**Before.**
- A plugin or MCP call that addressed an archived character worked on the placeholder (the "stub" of
  Report 51). V3 `getCharacterFromIndex` and `getChatFromIndex`, and the MCP read tools, returned the
  placeholder's empty fields as data.
- The MCP tools that set a character's info, lorebook or regex scripts wrote into the placeholder and
  answered "Successfully ...". So did V3 `setChatToIndex` for chat 0. The next restore replaced the
  placeholder from the unit, so the write was lost. The MCP delete tools and the Lua tool answered an
  error, because the placeholder's lists are empty. V3 `setChatToIndex` for any other chat did nothing.
  (Round 1 E4 and round 2 R2-E5 corrected earlier wordings of this; the packet's table for W8 says the same; its W13a-g row says all seven tools answered "Successfully", which Gate 2 round 2 (R2-E5) corrected for the delete and Lua tools.)
- A plugin could hand a placeholder back through `setChar`, `setCharacter`, `setCharacterToIndex`,
  `setDatabase` or `setDatabaseLite` and replace a loaded character with it, for example when the user
  opens the character between the plugin's read and its write.
- An enabled V2.1 plugin, which edits the live list directly, saw placeholders.

**The seam (I1, I2).**
- `readColdCharacterCopy(stub)` in `src/ts/process/coldCharacterRestore.ts` reads a stub's unit and
  returns an independent copy. It installs nothing, marks nothing for save and shows nothing. The copy
  carries the stub's trash state through `applyStubStateOnRestore` (the rule of Report 51). It reports
  missing, unreadable and mismatched distinctly. The restore's own read-and-check half is shared with it
  (`checkUnit`, per round 1).
- `restoreColdCharacter` gained a `quiet` option and a reason on a refusal: `'missing'`, `'unreadable'`,
  `'mismatch'` or `'ambiguous'` (`ColdRestoreFailure`). Non-quiet behaviour is unchanged: no existing
  test file was modified (round 1; scenario S5).
- New module `src/ts/process/coldCharacterAccess.ts`: `readArchivedCharacter` (a read from a copy) and
  `restoreArchivedForWrite` (restore first, then find the character again by `chaId`). Both fail with a
  message and show the user one alert naming the character. The message is what the caller reports.
  The module does not import `characters.ts` or `index.svelte.ts`, because `v3.svelte.ts` and the MCP
  modules load it and `v3.svelte.ts` sits in a load-time cycle (brief I8; packet 1.2).

**Readers (I5).** Each returns the full character's data when the target is a stub, read from a copy:
- V3 `getCharacterFromIndex` and `getChatFromIndex` (`v3.svelte.ts`); an out-of-range index behaves as for
  a full character. A missing, unreadable or mismatched unit rejects. For a placeholder these return a
  promise and for a full character a value; the bridge awaits every call (checked by the round-1 reviewer
  in `factory.ts`, and `risuai.d.ts` already declares these methods as Promises).
- The six MCP read tools that use `getCharacter`, through the new `getCharacterForRead` in
  `src/ts/process/mcp/risuaccess/utils.ts`, and `risu-get-chat-history` in `chats.ts`. A missing,
  unreadable or mismatched unit makes the tool answer with error text. A group placeholder comes back as
  it is, since no read tool reads a group's data.
- V3 `getDatabase`, including `'all'`, is unchanged and still returns placeholders (`MC-136` 3).
  `risu-list-characters` is unchanged.

**Writers (I4).** They restore a stub first, find the character again by `chaId`, then write and mark as
for a full character.
- V3 `setChatToIndex`: the host function restores first (it is a plain function that returns a promise only for an archived target); the synchronous `setChatToIndexImpl` and
  its tests are as they were (packet R6).
- The seven MCP write tools, through one choke, `recheckCharacterForWrite` (now async). It finds the
  chosen character again after the confirm prompt (the character itself while it is still in the list,
  else the sole holder of its `chaId`). A character deleted while the prompt was open gets the existing
  "character no longer exists" error, where before the tool reported success on a detached object.
- A failed restore writes nothing and leaves the stub unchanged. V3 rejects; MCP answers with error text,
  never "Successfully ...". The user gets one alert naming the character.

**No downgrade (I3).** New module `src/ts/plugins/stubDowngrade.ts` applies the rule that
`stubRefusal` and `reconcileIncomingCharacters` in `src/ts/process/coldCharacter.ts` define. The rule is
keyed by `chaId`, not by slot. A placeholder is refused when:
- the live holder of its `chaId` is loaded in full;
- that holder is archived under a different unit; or
- no character has that `chaId`.

A placeholder equal to the live one (same `chaId`, same unit key) is still accepted, as is a full
character in place of a placeholder.
- Covered: V2 and V3 `setChar`, V3 `setCharacter`, V3 `setCharacterToIndex`, `setDatabase` and
  `setDatabaseLite` with a `characters` array.
- For the single-character setters a refused call writes nothing. V3 rejects; the V2 `setChar` ignores
  the call (fork-specific; a comment beside the V3 wrapper says so).
- In the array setters the live element stays, or a placeholder with no live holder is left out.
- Every refusal logs a `console.warn` naming the plugin and the `chaId`.
- `setDatabase` applies the rule to the list as it is when `characters` is assigned, after any
  plugin-install confirm the same call waited for (round 1 B3).
- Each call builds one `chaId` lookup, not one scan per element (round 1 B2).

**V2.1 restore-all (I6).** `loadPlugins` (`src/ts/plugins/plugins.svelte.ts`) calls
`restoreAllColdCharacters` from the new `src/ts/process/coldRestoreAll.ts` before any V2.1 plugin code
runs. The module is loaded on demand.
- The trigger is one exported predicate, `hasEnabledV21Plugin` in the new `src/ts/plugins/v21Plugins.ts`,
  which is true only for an enabled plugin of version `'2.1'` (`MC-146` 4). Step 5 is to reuse it.
- The units are read one at a time; every restore is quiet; a restored character keeps the
  `lastInteraction` its unit holds; with no stub left nothing is read and nothing is shown.
- A progress notice is shown when more than five are pending (`QUIET_RESTORE_COUNT` in
  `coldRestoreAll.ts`; the brief called the threshold non-normative).
- A stub that cannot be restored stays archived, and the plugin still loads. At the end one notice names
  every such character. It is shown with `alertError` and `await waitAlert()`, so it has an OK button and
  loading waits until the user dismisses it; no later boot notice replaces it (round 1 B1; round 2 R2-B1).
- If the restore cannot run at all (the import or the run throws), `loadPlugins` catches it and shows the
  same notice for every archived character still in the list, before the plugin runs.
- The summary is tested with a modelled boot (`loadPlugins`, then `makeColdData`) and a modelled alert.

**Two amendments (`MC-091`, section 3).** `characterFormatUpdate` sets `lastInteraction` only when
`updateInteraction` is true; `changeChar` already passed `true`, and the group-turn restore and the Playground now pass it too, so every existing caller keeps its bump. While an enabled V2.1 plugin exists,
`makeColdData` archives no character; chats are archived as before.

**Upstream compatibility.** The block format, the encoder, the stub and unit shape and V3's
`getDatabase` are unchanged (brief I8). An upstream-made (v1) stub restores and reads exactly as in
Report 51. The no-format-pass question on the new restore paths is in section 5.

**Strings.** Four new English keys in `src/lang/en.ts`, translated into ko, cn, zh-Hant, vi, de and es by
the `translator` (8 added lines in each of the six files):
- `coldStorageNamedRestoreFailed` (names the character; "missing or invalid, and may be permanently
  lost");
- `coldStorageNamedRestoreUnreadable` (names the character; "could not be loaded right now", nothing
  changed, try again);
- `coldStoragePluginRestoreProgress` ("... N items left");
- `coldStoragePluginRestoreIncomplete` (names every character left archived).

**Where the code is** (from `git status` and a read of the files on the uncommitted tree). New modules:
`src/ts/process/coldCharacterAccess.ts`, `src/ts/process/coldRestoreAll.ts`,
`src/ts/plugins/stubDowngrade.ts`, `src/ts/plugins/v21Plugins.ts`. Changed: `src/ts/process/coldCharacter.ts`,
`src/ts/process/coldCharacterRestore.ts`, `src/ts/process/coldMemberRestore.ts`,
`src/ts/process/coldstorage.svelte.ts`, `src/ts/characters.ts`, `src/ts/plugins/plugins.svelte.ts`,
`src/ts/plugins/apiV3/v3.svelte.ts`, `src/ts/process/mcp/risuaccess/characters.ts`, `chats.ts` and
`utils.ts`, `src/lib/Playground/PlaygroundMenu.svelte` (one argument, I7) and the seven language files.

**Tests.** Seven new files, 89 tests:
- `src/ts/plugins/apiV3/tests/v3ColdCharacters.svelte.test.ts`;
- `src/ts/process/mcp/risuaccess/tests/characterColdStubs.test.ts`;
- `src/ts/plugins/tests/pluginRestoreAll.svelte.test.ts`;
- `src/ts/plugins/tests/pluginRestoreAllBoot.svelte.test.ts`;
- `src/ts/plugins/tests/pluginRestoreAllFailure.svelte.test.ts`;
- `src/ts/characters.lastInteraction.svelte.test.ts`;
- `src/ts/process/tests/coldstorageArchiveV21.test.ts`.

Against the unchanged code (the reviewer swapped HEAD's versions of the changed production files in
through a scratch Vitest config and confirmed the figures in round 3): 68 fail and 21 pass. The 21 are
the tests titled `guard:`, and no test without that title passes. Each failure is an assertion on
behaviour, for example `expected '' to be 'hero description'`, `promise resolved ... instead of
rejecting`, `expected 'unit-hero' to be undefined`, `'Successfully ...' not to contain 'Successfully'`,
`expected [] to have a length of 1` and `expected 1790807297330 to be 1000`. The first run, before the
remediation (`3a/red.log`), gave 64 failing and 20 guards at HEAD in 84 tests; the round-1 and round-2
remediation reproducers were run on the tree before each fix (`red-r1.log`, `red-r2.log`).

## 2. The Orchestrator's decisions

The investigator's code map (row 504) refuted or corrected eight premises, R1-R8, and raised six open
questions, Q1-Q6.

**Premises the packet refuted or corrected** (packet section 0; TRACED at `96772e97`: read in source,
nothing executed):
- **R1. Refuted: the Playground does not go through `changeChar`.** Report 49 D4 says `playgroundChat`
  (W16) does. `PlaygroundMenu.svelte` mutates the `§playground` slot in place, calls
  `characterFormatUpdate` and selects the index itself; the file contains no `changeChar`. It is
  one of three sites that select an index of 0 or more: two in `changeChar` and one in
  `PlaygroundMenu.svelte` (packet). So it does not inherit step 2's restore and needs its own change (3b). Also, the plan's "`§`
  ids are never archived" is a step 5 rule: today's 10-day path has no `§` exclusion, and neither has
  upstream's, so a `§playground` stub can exist on an arriving profile.
- **R2. Corrected: `characterFormatUpdate` always reset `lastInteraction`.** `updateInteraction` is
  declared and passed but never read, so a restore-all built on the existing helpers would stamp "now"
  on every archived character and destroy the recency sort. The packet adds a load-bearing twist:
  the bump also keeps the still-running 10-day pass from re-archiving a restored character at the same
  boot (section 3, A1 and A2).
- **R3. Corrected: only V2.1 runs code.** A version 2 plugin only logs that it is removed, and importing
  a plugin that declares API 2.1 or 2.0 is refused, so V2.1 plugins on a profile can only come from
  saves that already held them. Report 49 (3.2, D16) had read `MC-132` 2 as "V2/V2.1"; `MC-146` 4 settles V2.1 only.
- **R4. Corrected: the restore had no error channel for the caller.** It alerted the user itself and
  returned `refused` with no reason or text, so an MCP or V3 caller had nothing to put in its error and
  restore-all could not use it. The seam is a `quiet` option plus a reason.
- **R5. Corrected: no function read a stub's full character without installing it.**
- **R6. Constraint: `setChatToIndexImpl` is exported, synchronous and pinned by tests.** The restore
  belongs in the V3 host function (`setChatToIndex` in `makeRisuaiAPIV3`), not in the synchronous impl.
- **R7. Confirmed, location updated:** at HEAD the only `coldstorage:` literal is in `buildColdStub`
  (Report 49 section 5 item 6).
- **R8. Corrected: `loadInternalBackup` does not reload at HEAD.** It does `setDatabase(decoded)` with no
  reload, and the decoded snapshot may hold stubs, so today it is a runtime stub-over-full creator. Step
  5 owns it; D3 is not satisfied before then.

**Report 49 corrections** that this step's evidence makes (Report 49 is not edited by this report):
- D4's W16 "via `changeChar`" is wrong (R1).
- "V2/V2.1" (Report 49 3.2, D16) is V2.1 only (R3, `MC-146` 4; `MC-132` 2 already named V2.1 only).
- `loadInternalBackup` does not reload at HEAD (R8; step 5).

Not a correction: test-file counts differ between the reports because they measure different things. Report 49 counted 43 files that `vi.mock` the module (47 mention it); this step's packet counted 53 that mention `coldstorage.svelte`, 52 of them with any `vi.mock`. They are not comparable.

**Decisions on the open questions.** `MC-146` records four maintainer answers (each the recommended
option). The mapping below is my reading of the packet's questions against `MC-146`'s text, not a
statement in it.

| Packet question | Decision |
|---|---|
| **Q1**, a V3 read of an archive that is missing or unreadable: reject or return null | `MC-146` 1: fail. V3 rejects; the MCP read tools answer with error text. |
| **Q2**, a write to a missing unit: the error, plus the restore's alert? | `MC-146` 1: the caller gets the error and the user gets one alert naming the character. Nothing is written into the placeholder. |
| **Q3**, group selection when a member's restore fails | `MC-146` 2 (3b): the group opens; the member stays archived, gets no greeting in a new chat, is skipped in turns, and an alert names it. |
| **Q4**, a `§playground` stub | `MC-146` 3 (3b): restore it when the Playground chat opens; if the restore fails, alert and do not open. It is never archived again (D19). |
| **Q5**, honour `updateInteraction` | The Orchestrator's amendment A1 (section 3). |
| **Q6**, restore-all for V2.1 only, or V2 as well | `MC-146` 4: V2.1 only. `MC-132` 2 already names V2.1 only; `MC-146` 4 settles that Report 49's reading of it as V2/V2.1 was wrong. |

**Orchestrator decisions in `brief-3a.md` section 1:**
- **The split.** 3a is the plugin and MCP surface plus the shared seam that 3b reuses, gated by
  `opus-reviewer`. 3b (groups, the Playground's restore, `exportAsDataset`, `verifyAssetIntegrity`,
  the docs) is gated by `adversarial-reviewer`. The packet's reasons: the 3a paths can lose user data
  silently, the seam has to be reviewed once before four more callers rely on it, and R2 touches a
  shared function.
- **"Stub"** means a character element whose `coldstorage` field is truthy, v1 or v2.
- **The V2.1 predicate** is one exported function, which step 5 reuses.
- **The amendments A1 and A2** (section 3).

## 3. Scope notes

Recorded in the same form as Report 50 section 3 and Report 51 section 3. Both are `MC-091`
amendments.

**A1. `characterFormatUpdate` honours `updateInteraction`.**
- *Failure if left (packet R2; TRACED as a reading of the code):* every restore through the existing
  helpers stamps `lastInteraction` to now. A V2.1 restore-all would give hundreds of characters the same
  "now" and destroy the recency sort (`MobileCharacters` sorts by `lastInteraction`, per the packet).
- *Causal link:* the V2.1 restore-all (I6) restores through the shared restore and `coldMemberRestore.ts`'s
  helpers, which call `characterFormatUpdate`.
- *Smallest correction:* the flag is honoured (absent means no bump). At HEAD only `changeChar` (two
  calls) passed `true`; this change makes `restoreColdCharacterByChaId` in `coldMemberRestore.ts` (the
  group-turn restore) and `playgroundChat` in `PlaygroundMenu.svelte` (the one-argument change in that
  file) pass it too, so every existing caller keeps its bump. The round-1 reviewer listed these as the
  only callers of the function; `characterCards.ts`
  imports it but never calls it. The flag is read at `characters.ts:677` and the callers pass it at
  `characters.ts:1037` and `:1047`, `coldMemberRestore.ts:46` and `PlaygroundMenu.svelte:36` (source read
  on the uncommitted tree).
- *Tests:* S21 (red) and S22 (guard).

**A2. While an enabled V2.1 plugin exists, the 10-day boot path archives no character.**
- *Failure if left (packet 6.5; inferred from bootstrap order, not executed):* with A1 in place, a
  boot-time restore-all restores a character whose `lastInteraction` is older than 10 days and
  `makeColdData` (which runs after `loadPlugins`) then archives it again moments later, while the V2.1
  plugin is already running. The plugin would hold objects the list has replaced with stubs. Before A1
  the bump accidentally prevented this, so A1 and A2 must land together.
- *Causal link:* A1 removes the bump; A2 is the same predicate as I6, checked in the 10-day character
  pass.
- *Smallest correction:* `makeColdData` skips its character pass while `hasEnabledV21Plugin` is true.
  Chat-level archiving is unchanged. Step 5 retires the path.
- *Tests:* S23 (red) and S24 (guard) in `coldstorageArchiveV21.test.ts`. The round-1 reviewer found
  that the chat pass still archives that idle character's chat (one unit written, chat 0 reduced to its
  cold header), which is A2's intent; the test's title was corrected (E2).
- This closes the sequencing risk between steps 3 and 5 that the packet raised (6.5), as far as the
  modelled tests show.

## 4. Gate 2 record

`opus-reviewer` was used because Report 49 section 3.4 names it for step 3's plugin and MCP write paths
(the packet's section 9 gives the same assignment). The same reviewer instance ran all three rounds (the
round-2 and round-3 hand-backs refer to their own earlier rounds). It ran on the working tree against
`96772e97`, not on a commit, with mutants built in its own scratchpad by a Vitest config that swaps
module sources at load. The alert-rendering check mounted the real `AlertComp`. Ledger rows 505-507 hold
the costs.

### Round 1: [REJECT]

Snapshot: `96772e97` plus the working tree (the tracked diff including the translations, four untracked
production files and five untracked test files). `pnpm check` 0 errors, 0 warnings. The five test files
gave 84 passed on the tree, and **64 failed and 20 passed** with the 11 changed tracked production files
served from HEAD (plus `en.ts`). The 20 are exactly the tests titled `guard:`. **18 mutants, all
killed** (refusal rule, the re-find by `chaId`, the quiet flag, the MCP re-find, the V2.1 predicate,
restore-all's order and bump and fire-and-forget, the stub-state copy, A1, A2, the V2 `setChar` refusal,
the `setDatabaseLite` reconcile).

| Finding | Content | Disposition |
|---|---|---|
| **B1** blocking | The restore-all summary was erased at boot when root cold storage is on. `makeColdData` still runs its chat pass, which shows `alertWait` and ends with an unconditional `alertClear`; the alert store has one slot. The user never learns the character is still a placeholder, and the V2.1 plugin then reads and writes it through the live proxy (packet B4, which cannot be intercepted). S18 drove `loadPlugins` alone and the bootstrap tests mock `loadPlugins`. Sub-point (minor): a failed load of the separate `coldRestoreAll` chunk was only logged, so V2.1 code ran with every stub visible and no notice. | Round 1's fix used `alertErrorWait`; round 2 (R2-B1) found that alert type had no OK button, and it was replaced with `alertError` then `await waitAlert()` (in the summary and in the `catch`). Two reproducers red on the round-1 tree (`red-r1.log`). |
| **B2** performance | `stubRefusal` scanned the live reactive list once per incoming stub and `reconcileIncomingCharacters` then scanned it again per refused stub: O(n·m) proxy reads. On the reviewer's i9 test machine, 90% of characters archived: `setDatabase` 147.5 ms at 500 and 595.3 ms at 1000 characters against 3.4 ms at HEAD; `setDatabaseLite` 541.8 ms against 3.5 ms; the reconcile alone at 2000 characters took 2.6 s. Best-case hardware figures. | Fixed: one lookup per call. No timing assertion in the suite; measured by the reviewer's harness. |
| **B3** minor | `setDatabase` checked for placeholders before an awaited `handlePluginInstallViaPlugin` (the plugin-install confirm) and installed `characters` after it, when `plugins` comes first in the object's key order. A character the user restored during the confirm was replaced by the placeholder it had been (reviewer's diagnostic D1: `hero coldstorage = unit-hero, desc = ""`). V3 `getDatabase` emits `characters` before `plugins`, so the window needs a plugin that builds its own key order: narrow. | Fixed: the rule is applied again where `characters` is assigned; a red test. |
| **E1** | The code, tests and commit message claimed a guarantee by slot ("never put a stub in place of a full character"). The rule works by `chaId`. Diagnostics D2 and D3: V3 `setCharacter(stubOfBeta)` with full `alpha` selected and a live stub `beta` with the same key is accepted, and `alpha` is displaced. This is the approved rule, not a behavioural defect. | Wording corrected in `stubDowngrade.ts`, `v3ColdCharacters.svelte.test.ts` (header and describe title) and the commit message. |
| **E2** | A test title said an enabled V2.1 plugin keeps the character "in memory and writes no unit for it". One unit is written (the chat pass). | Retitled to what it asserts. |
| **E3** | A test header listed a module (`characters.ts`) the test never loads. | Corrected. |
| **E4** | The commit message said V3 `setChatToIndex` wrote into the placeholder. It wrote only for chat 0 (the dummy chat) and did nothing for any other index. | Corrected. |
| **O1-O6** optional | O1: "items" could be "characters" in the progress text. O2: `coldStorageNamedRestoreFailed` is also shown for `ambiguous` (two characters with one `chaId`), where "may be permanently lost" is untrue. O3: a test header said every other module is mocked. O4: the V2 and V3 single setters could refuse every stub. O5: the getters read `stored.coldstorage` without `?.`; a null slot now throws. O6: two stubs with one `chaId` are named twice in the summary. | **Adopted: O3 and O5.** Not adopted, recorded as follow-ups: O1, O2, O4, O6 (section 6). |

The reviewer also checked and found sound (no finding): the seam (I1, I2) and the unchanged non-quiet
behaviour; the array setters' refusals and the same-key round trip; the writers' re-find by `chaId` and
the MCP re-check (test S15 is a red test, not a guard as the brief had it: at HEAD a deleted character
gave a reported success on a detached object); the readers; restore-all's one-at-a-time reads and quiet
restores; A1 (every caller passes `true`) and A2; the import graph (I8); the comments (no history
words, no in-repo line numbers); the translations keep the force of the warnings (for example the Korean
"may be permanently lost"). **No format pass on the new restore paths: accepted.** A unit holds the
character as it was in memory after that boot's `checkNewFormat`, and `changeChar` formats a character on
open whoever restored it. The one residue is that a runtime V3 or MCP restore of an upstream unit that
lacks chat ids leaves them missing until the character is opened or the page reloads. The reviewer found
no consumer of a non-selected character's chat ids that fails on that. **Inferred, not run.**

### Round 2: [REJECT]

Snapshot: `96772e97` plus the working tree after the round-1 remediation (`3a/remediation-r1.md`). The
seven test files gave 88 passed on the tree; with HEAD's sources swapped in, **67 failed and 21 passed**
(all 21 titled `guard:`). The reviewer's line-ending check and forbidden-word grep over the new and changed files were clean. B2
re-measured: the reconcile at 900 of 1000 archived 6.2 ms (509.6 ms before) and 5.7 ms at 2000
characters (2567 ms); `setDatabase` at 1000 characters 5.2 ms (HEAD 3.4 ms) and `setDatabaseLite` 4.7 ms.
B2, B3, E1-E4, O3 and O5 verified fixed. **11 mutants: 7 killed, 4 survived** (below).

| Finding | Content | Disposition |
|---|---|---|
| **R2-B1** blocker | The B1 fix used `alertErrorWait`, which sets type `'wait2'` and awaits `waitAlert()`. In `AlertComp.svelte` only `error`, `normal` and `markdown` get an OK button; `'wait2'` shows its message with no control and the overlay has no click handler. The only way out is the Escape key. On a phone or the Android wrapper with an enabled V2.1 plugin and one stub whose unit is missing, start-up would stay on "Loading Plugins..." with the notice; a reload repeats it. The two boot tests passed because their alert model let the modelled user dismiss `alertErrorWait` after 20 ms, which the real UI does not allow. The reviewer's mount diagnostic: `alertErrorWait` renders no button; `alertError` renders `["OK"]`. | Fixed: `alertError(message)` then `await waitAlert()` in `coldRestoreAll.ts` and in the `catch`. The test model was made faithful: only `error`, `normal` and `markdown` are dismissed by the simulated user. Both boot tests were red on the tree before the fix (`red-r2.log`: "boot did not finish: the alert on screen is of type "wait2"..."). |
| **R2-E5** | The commit message said all seven MCP write tools wrote into the placeholder and answered "Successfully". True for the three set tools (info, lorebook, regex scripts). The delete tools and the Lua tool answered an error at HEAD, because the placeholder's lists are empty. Missed in round 1. | Commit message corrected. |
| **R2-E6** minor | The commit message's list of failures at HEAD had no entry for the boot and failure tests (they fail because no notice names the characters left archived). | Added. |

Survivors of the round-2 mutants, all optional test gaps: `map-keeps-last-holder-only` (no test has
duplicate `chaId`s); `single-setter-no-holders` (no guard that a single setter accepts the same
placeholder); `catch-notice-not-awaited` (killed in round 3); `getter-null-slot-unguarded` (O5 has no
test).

### Round 3: [APPROVE]

Snapshot: `96772e97` plus the working tree after the R2-B1 fix. The seven files gave 89 passed on the
tree; with HEAD's sources swapped in, **68 failed and 21 passed** (all 21 titled `guard:`): the commit
message's 89 / 68 / 21 is confirmed. **5 mutants, all killed:** `catch-notice-not-awaited` (the round-2
survivor, killed by "the V2.1 plugin code runs only after the user has dismissed the notice"),
`catch-uses-wait2`, `catch-no-notice`, `summary-not-awaited` and `summary-uses-wait2`. No production use
of `alertErrorWait` remains.
- **R2-B1 fixed.** The reviewer checked every point of the test alert model against `AlertComp.svelte`,
  `alert.ts` and `alertEscape.ts`: `error`, `normal` and `markdown` have an OK button; `wait` has no
  control and its escape action is idle; `wait2` has no on-screen control; `alertClear` releases every
  waiter; `waitAlert` resolves at once when the slot is empty. The `PluginSettings` toggle calls
  `loadPlugins` without awaiting it, so nothing blocks the UI. A V3 plugin that calls `loadPlugins` waits
  until the user dismisses the notice, which the reviewer judged acceptable. Two overlapping runs: the
  second notice overwrites the first and both waits resolve when that one is dismissed.
- **The commit message was fact-checked claim by claim and holds.**

Optional points from round 3, all applied by the Orchestrator after the approval:
- The headers of `pluginRestoreAllBoot` and `pluginRestoreAllFailure` said there is "no way to dismiss a
  'wait2' alert". On a keyboard Escape closes it (`escapeActionFor('wait2')` is `'close'` in
  `src/ts/alertEscape.ts`, which `hotkey.ts` calls). They now say there is no on-screen control and only Escape closes it.
- The commit message says "answered an error" for the Lua tool, where "a not-found error" was loose
  (its text is "User must first change the first trigger type to Lua manually."), and one setter
  paragraph was re-wrapped.
- Round 2's remaining untested items stand as optional (section 6).

The escalation rule of `AGENTS.md` section 1.2 counts three consecutive [REJECT] rounds; this gate had
two.

## 5. What is not covered

- **No live check was run.** Nothing in 3a was run in a browser or a Tauri build. By the packet,
  real Node, OPFS and Tauri unit reads, V2.1 plugin code against a real restore-all on a real archived
  profile, and the boot ordering end to end (the listing, `loadPlugins`, `checkNewFormat`,
  `makeColdData`) are live-check-only; the tests model them.
- **The V2.1 live proxy's nested writes stay covered only by restore-all** (packet B4). `db.characters[i]
  = x` through the `getDatabase()` proxy is not intercepted; only a top-level `set` is trapped. A stub
  that restore-all could not restore (missing unit) is still visible to V2.1 code, which is why the
  summary notice names it.
- **No format pass on the V3, MCP and restore-all restores** (accepted in round 1). Chat ids missing from
  an upstream unit stay missing until the character is opened or the page reloads; **inferred, not run**.
- **No one-entry unit cache for loops over `getChatFromIndex`.** Each call for an archived character
  reads the whole unit (packet section 4; the V3 getter calls `readArchivedCopyOrThrow` per call; `MC-132` 1 accepts on-demand loads).
- **A single-character setter accepts a placeholder for another archived character whose unit key matches
  the live holder's.** The rule is keyed by `chaId` (round 1, diagnostics D2 and D3); it is the same
  displacement a plugin already causes by sending a full character. O4 (refuse every stub in the single
  setters) was not adopted.
- **Duplicate `chaId`s.** A call that finds several holders is refused as `'ambiguous'`; the user then
  sees the "may be permanently lost" alert, which is untrue for that case (O2).
- **A group placeholder** is returned as it is by the MCP readers; every MCP read tool rejects a group
  anyway (round 1).
- **`loadInternalBackup` can still install stubs over full characters at runtime** (packet R8): D3 is
  not satisfied before step 5.
- **Mixed return types.** For an archived character the V3 getters return a promise and for a full
  character a value. The bridge awaits every call.

## 6. Open follow-ups

1. **Step 3b** (gate: `adversarial-reviewer`, the Orchestrator's decision):
   - groups (`changeChar` restores the group's members on selection, `addGroupChar`, `createNewChat`;
     `MC-146` 2);
   - the Playground's restore (`MC-146` 3; the packet's W16 and section 7: a `§playground` stub can be
     selected and mutated today; 3a made only the one-argument `characterFormatUpdate` change there);
   - `exportAsDataset` (a garbage entry per stub, D5) and `verifyAssetIntegrity` (covers only a stub's
     `image`, D5);
   - the labelled fork/upstream note in `risuai.d.ts` and `plugins.md` for `getDatabase` returning
     placeholders (`MC-136` 3), which the round-1 reviewer did not look at and the brief did not ask 3a
     for.
2. **Report 49 corrections** (section 2): W16 is not via `changeChar`; "V2/V2.1" is V2.1 only;
   `loadInternalBackup` does not reload at HEAD (step 5). Report 49 itself is not edited
   here; whether it is edited or this report stands as the correction is the Orchestrator's call.
3. **Optional improvements from round 1, not adopted:**
   - **O1.** "items" to "characters" in `coldStoragePluginRestoreProgress`, in all seven languages. The
     English wording matches `makeColdData`'s existing "... items left" text, and the count is accurate.
   - **O2.** A separate string for the `ambiguous` refusal.
   - **O4.** The single setters could refuse every stub, since the selected slot is never legitimately a
     stub.
   - **O6.** A duplicate name in the restore-all summary (two stubs with one `chaId`); cosmetic.
4. **Optional test gaps** (the surviving round-2 mutants): holders with duplicate `chaId`s; a guard that a
   single setter accepts the same placeholder; the null-slot guard (O5).
5. **A native-speaker check of the four new strings** in ko, cn, zh-Hant, vi, de and es. The reviewer
   checked the meaning in round 1 (for example the Korean "may be permanently lost" keeps its force). The
   translator's low-confidence notes, as its hand-back listed them: ko, the particle 을(를) after
   `${characterName}`; cn and zh-Hant, "N items left" rendered as 还剩 N 项 / 剩餘 N 項; vi, whether "đang
   được bật" reads as "the plugin is enabled", and "Chúng vẫn ở trạng thái lưu trữ"; es, the file mixes
   tú and usted. No maintainer acceptance of
   the step 3a strings is recorded.
6. **Accepted residuals from the gate:** the no-format-pass residue (section 5, inferred, not run); the
   duplicate console warning when `setDatabase` refuses the same stub in both of its passes (round 2).
7. **Sequencing between steps 3 and 5 is closed by A2, as far as the modelled tests show; no live check was run.** Step 5 must reuse `hasEnabledV21Plugin` and
   retire the 10-day character pass (and A2's guard with it); step 5 also owns `loadInternalBackup` and
   the boot install sites (packet section 2, A1-A3).
8. **Live verification** of 3a is not done (section 5); a combined live check after 3b would cover the
   V3, MCP and restore-all paths on an archived profile.
