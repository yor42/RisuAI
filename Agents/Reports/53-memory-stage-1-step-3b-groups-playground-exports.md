# Report 53 — Memory stage 1, step 3b: groups, the Playground and the exports of archived characters (D5 exports, D8, D19 Playground restore; MC-146 2 and 3)

**STATUS:** done, 2026-10-01. **Gate 2 approved at round 3**: round 1 [REJECT], rounds 2 and 3 [APPROVE], all
by `adversarial-reviewer` (ledger rows 510-512). Committed as `1b38b5d5`; this report is added by the
records commit that follows it. This report covers **3b**. Step 3a is Report 52. Steps 4-7 of Report 49
are not started, so memory stage 1 as a whole is not done. The plan was gated once, as part of the
stage plan (Report 49, Gate 1); this step had its own Gate 2 only. The tier is the one Report 49
section 3.4 gives for step 3 (`adversarial-reviewer`; `opus-reviewer` for the plugin and MCP write
paths, which were 3a).

One [REJECT] round and then two approvals: the three-round escalation rule (`AGENTS.md` section 1.2)
was not triggered. Round 3 reviewed a defect in the dataset export that the `doc-writer` found while drafting this report,
after round 2 had approved (section 4).

Final checks, run again by the Orchestrator on the final tree after Gate 2 round 3 (they replace the
earlier run, which gave 3723 passed):
- `pnpm test`: 222 files, 3724 passed, 4 skipped (`3b/gate/full-final2.log`);
- `pnpm check`: 0 errors, 0 warnings (`3b/gate/check-final2.log`);
- `pnpm build`: exit 0 (`3b/gate/build-final2.log`; `3b/gate/final-status2.txt` reads "test exit 0",
  "check exit 0", "build exit 0").

Step 3a's final tree had 216 files and 3680 passed (Report 52). The difference is 6 files and 44 tests,
which is the size of the six new test files (section 1, Tests). Nothing was run in a browser or a Tauri
build (section 5).

**Sources** (scratchpad `memfoot/step3/`; not durable, so this report and ledger rows 509-512 are the
durable record):
- `3b/brief-3b.md`: the Orchestrator's decisions D-a to D-e (its section 1) and the acceptance
  scenarios G1-G7, A1-A4, C1-C2, T1-T4, P1-P4, E1-E4 and I1-I4 (its section 2);
- `packet.md` (sections 4, 5 and 7): the step 3a investigator's code map of the readers, the groups and
  the Playground, at HEAD `96772e97` (ledger row 504);
- `3b/records-notes.md`: the Orchestrator's notes for this batch (costs and the maintainer's statements
  of 2026-10-01);
- `3b/red.log`, `3b/red-r1.log` and `3b/red-r2.log`: the red-first evidence;
- `3b/gate/review-r1.md`, `review-r2.md` and `review-r3.md`: the Gate 2 hand-backs, saved by the Orchestrator (the
  reviewer does not write report files); the scratch mutants, `mut.config.mjs` and `pg.svelte.test.ts`
  in `3b/gate/`;
- `3b/gate/full-final2.log`, `check-final2.log`, `build-final2.log`, `final-status2.txt`: the final checks
  (the `-final` files without the 2 are the earlier run, before round 3);
- `3b/commit-msg.txt`: the commit message; this report agrees with it;
- `Agents/Reports/49-memory-stage-1-plan.md` (section 3.3 D5, D8, D19; 3.4 step 3; 3.5) and
  `Agents/Reports/52-memory-stage-1-step-3a-plugins-and-mcp.md`, whose seam (`readColdCharacterCopy`,
  the `quiet` option and the failure reasons of `restoreColdCharacter`, `coldCharacterAccess.ts`) this
  step reuses.

Other dispatches, with task usage as reported in `records-notes.md` (the ledger has rows only for the
fact-check and the three gate rounds):
- `sonnet-coder`, the Playground extraction: 45.7k tokens, 8 tools;
- `test-warrior`, the red tests: 219.9k tokens, 85 tools;
- `sonnet-coder`, the implementation: 174k tokens, 85 tools;
- `sonnet-coder`, the F1 fix: 46.6k tokens, 12 tools (48.3k cumulative, 15 tools, after the alert-wording
  swap, section 2);
- `test-warrior`, the F1 regression test and its four companion tests: 71.1k tokens, 22 tools (83.8k
  cumulative for that instance, 7 tools this round, for the group-placeholder export test);
- `sonnet-coder`, the export fix (round 3): 53.8k tokens cumulative for that coder instance, 6 tools this
  round;
- `doc-writer`, the plugin documentation: 83.5k tokens, 30 tools (101k cumulative, 6 tools, for the
  corrections round);
- `translator`: 48.9k tokens, 12 tools (53.3k cumulative, 3 tools, for the "first message" reword);
- `doc-writer`, this report and the other records: 215.7k tokens, 54 tools (265.3k cumulative, 24 tools,
  for the update round after round 3);
- `doc-verifier`, the check of this batch: 215.9k tokens, 63 tools (ledger row 513).

The round-3 figures in this list are from the Orchestrator's added section of `records-notes.md`, which
reports them from the task-usage notifications and hand-backs it received.

Decisions bearing on this step (the main ones `brief-3b.md` lists; it also lists `MC-081`, no upstream
services and synthetic data only). `MC-146` 2 (a group opens even when a member's archive cannot be
restored; that member stays archived, gets no greeting in a new chat, is skipped in turns, and an alert
names it). `MC-146` 3 (an archived `§playground` character is restored when the Playground chat opens;
if the restore fails, the user is alerted and the Playground chat does not open). `MC-136` 3 (V3
`getDatabase` returns placeholders, as upstream does; calls for one character return it fully loaded).
`MC-011` (the fork has never shipped) and `MC-089` (nothing ships until every open ticket clears; the
brief paraphrases this as "nothing ships between steps"). Two rules come from `AGENTS.md` and not from
an MC entry: scope amendments need a stated failure, causal link and smallest correction (the
scope-amendments rule, `MC-091`), and "existing fork behaviour" is not a reason to keep anything
(derived from `MC-011`).

Terminology: the maintainer said on 2026-10-01 to write "first message" (Korean 첫 메시지), not
"greeting", in the user-facing strings. This report uses "first message" except where it quotes
`MC-146` 2, the brief or a test title, which say "greeting".

## 1. What step 3b changed

Summary from the commit message (`commit-msg.txt`); the scenario ids are in the brief. In every area
below, an archived character is a placeholder (the "stub" of Report 51) in `DBState.db.characters`: its
`coldstorage` field is truthy and its full data lives in a cold-storage unit.

**Groups: selecting a group (`changeChar`, `src/ts/characters.ts`; G1-G7).**
- *Before* (packet section 5, item 1; read in source at `96772e97`, nothing executed): `changeChar`
  restored only the clicked slot. After a group was selected its members were still placeholders, and
  the readers of a member's real fields (display regex scripts and assets, the background and emotion
  view) saw default-filled empties.
- *Now:* both branches of `changeChar` that can select a group restore its archived members first: the
  branch for an archived group (the group is restored, then its members) and a new branch for a full
  group that has at least one archived member. The helper `restoreGroupMembers` restores the members
  one at a time with `restoreColdCharacter(stub, { byChaId: true, quiet: true })`, looking each slot up
  again by `chaId` for every member, and returns the names of those it could not load.
- A member it installs is format-updated and its `lastInteraction` is not changed (D-a). The group
  keeps its own bump.
- A member that cannot be loaded (missing or unreadable unit, or a `chaId` held by several characters,
  one of them archived) stays exactly as it was. The group is still selected, and the user gets **one**
  notice naming every such member (`coldStorageGroupMembersNotLoaded`), shown just before the
  selection, instead of the restore's own unnamed alerts. A member `chaId` that no character holds is
  not reported. A member whose restore ends `gone` is neither restored nor named, and stays archived
  (the writer's reading of `restoreGroupMembers`; not run).
- After the awaits, the call checks that it is still the latest `changeChar` call and that `doingChat`
  is false, then finds the group again by `indexOf`. A stale call does not select.
- Selecting a non-group character, or a group whose members are all in memory, reads no unit and shows
  no alert.

**Groups: `addGroupChar` (`src/ts/process/group.ts`; A1-A4).**
- *Before* (packet section 5, item 2): it pushed `findCharacterbyId(res).firstMessage` into the group's
  chat, and that is `''` for a placeholder.
- *Now:* a picked archived character is restored first through `restoreArchivedForWrite` and
  format-updated at its new index, and then the first-message question is asked. If the restore
  succeeds, the member is restored, format-updated and added either way, and the user is asked as
  before; if they accept, the first message pushed is the unit's own. If the
  restore fails, the character is still added to `characters`, `characterTalks` and `characterActive`,
  no first message is pushed (not even a blank one), the confirm is skipped (an `alertConfirm` would
  overwrite the named error in the single alert slot) and `restoreArchivedForWrite` has already shown
  one alert naming it (D-b). If the picked character is gone after the restore, nothing is added and
  nothing is shown. A character already in the group still gets `alreadyCharInGroup` and nothing is
  restored.
- `characterFormatUpdate` is loaded on demand (`characters.ts` imports `doingChat` from
  `index.svelte.ts`, which imports `group.ts`), before the restore, so no further await sits between
  the restore and the use of its index.

**Groups: `createNewChat` (`src/ts/characters.ts`; C1-C2).**
- *Before* (packet section 5, item 3): each member's `firstMessage` was pushed, a blank for a
  placeholder.
- *Now:* a member that is still a placeholder gets no entry. The function stays synchronous, returns 0,
  and the new chat has an id from the start. A member `chaId` that no character holds still gets the
  empty entry it got before.

**Group turns (`sendChat`, `src/ts/process/index.svelte.ts`; T1-T4). D-c changes step 2's rule.**
- *Before* (step 2, Report 51): a member whose restore failed stopped the group turn (`sendChat`
  resolved false), with the restore's own unnamed alert.
- *Now:* that member is passed over, the walk goes on, and `sendChat` resolves true (also when no other
  member is left to speak). `restoreColdCharacterByChaId` (`src/ts/process/coldMemberRestore.ts`) now restores with
  `quiet: true` and shows one alert naming the member, through `alertNamedRestoreFailure` (newly
  exported from `src/ts/process/coldCharacterAccess.ts`), with the missing or the unreadable wording
  that fits. A later turn tries the restore again, so a broken member can show one alert per send. A
  member deleted or taken out of the group during its own restore is still passed over silently.

**The Playground (`src/ts/playgroundChat.ts`, `src/lib/Playground/PlaygroundMenu.svelte`; P1-P4).**
- *Before* (packet R1 and section 7; read in source at `96772e97`, nothing executed): the click handler
  `playgroundChat` in `PlaygroundMenu.svelte` wrote `utilityBot`, `name` and `firstMessage` into the
  `§playground` slot, formatted it and selected it, and it did not go through `changeChar`. A
  `§playground` placeholder, which an arriving profile can hold, was mutated and selected.
- *Step one, a behaviour-preserving extraction:* the handler moved unchanged into the exported
  `openPlaygroundChat()` of the new `src/ts/playgroundChat.ts`; the component calls it, drops four import
  lines and the `selectedCharID` specifier, and imports `openPlaygroundChat`. This was done first so the red tests ran against the unchanged behaviour.
- *Now:* when the `§playground` slot holds a placeholder, `openPlaygroundChat` restores it through
  `restoreArchivedForWrite` first.
  - `failed` (the restore's `missing`, `unreadable`, `mismatch` or `ambiguous` refusal): it returns. The
    restore has shown one alert naming it: the retry wording for `unreadable`, and the "may be
    permanently lost" wording for the other three. The placeholder is untouched, nothing is selected and `PlaygroundStore` is not set to 2.
  - `ready`: the slot holds the full character from the unit with its chats kept. It becomes the
    utility bot (`utilityBot` true, `name` `'assistant'`, `firstMessage` `'{{none}}'`), is formatted
    with the interaction bump, is selected, and `PlaygroundStore` is set to 2.
  - `gone` with a placeholder still holding the slot (found again by `chaId`): it shows one alert
    naming the placeholder, with the "unreadable" wording, and returns with nothing written, selected
    or set. This is the case Gate 2 round 1 rejected (section 4, F1).
  - `gone` with no `§playground` left in the list: a blank one is created and selected, as before.
- A full `§playground` and a list with no `§playground` behave as before.

**Dataset export (`exportAsDataset`, `src/ts/storage/exportAsDataset.ts`; E1-E4; D-e).**
- *Before* (packet section 4): one row per non-group placeholder, with an empty description, one chat
  `{data: ''}` and an empty lorebook.
- *Now:* for each archived character the function reads the unit as a copy with
  `readColdCharacterCopy`, one at a time, takes the rows from the copy (`desc`, each chat's `message`,
  `globalLore`) and drops it. It walks a snapshot of the list, so the list can change while a unit is
  read. The placeholder stays in its slot and nothing is marked for save. Group placeholders yield no
  rows and are not read. A unit that cannot be read gives no rows, and the end notice
  (`coldStorageDatasetExportSkipped`) names the character; the export still downloads. A unit that
  reads fine but holds a group yields no rows, like any group, and is not named. That case arises for a
  placeholder made by upstream, which is typed as a character even for a group (the plugin notes below).
  With no placeholders the output and the notice are as before.

**Asset integrity (`verifyAssetIntegrity`, `src/ts/storage/storageMaintenance.ts`; I1-I4; D-e).**
- *Before* (packet section 4): the check covered only a placeholder's `image`, because the placeholder
  carries none of the emotion images, additional assets, vits, gptSoVits or `ccAssets` paths.
- *Now:* the new `collectIntegrityTargets` takes everything `getUncleanablesSync(DBState.db)` yields
  and adds, for each archived character, the targets of its unit read as a copy, one at a time. The
  targets go through a `Set`, so a path appears once. The restore modules load only when an archived
  character exists. While units are read, a `wait` alert shows `assetIntegrityReadingArchivedProgress`
  (done and total), and a `finally` sets the alert state back to none whatever happens. A character
  whose unit cannot be read does not stop the scan; the report names it with
  `assetIntegrityReportArchivedNotChecked`. When no target is left at all, the "no assets" path still
  shows the report with that line. With no archived characters the targets are exactly what they were. The collector keys on
  `coldstorage` only, never on `type`, so an upstream-made group placeholder's unit is read and scanned
  like any other (the round-3 reviewer).

**Plugin documentation (`plugins.md`, `src/ts/plugins/apiV3/risuai.d.ts`; `MC-136` 3).** Labelled
"Fork-specific note (not upstream RisuAI)" blocks, 25 added lines in `plugins.md` and 89 in the `.d.ts`
(JSDoc only). They cover:
- `getDatabase`: it returns a placeholder (`coldstorage` set) for an archived character, as upstream
  does. Which fields a fork-made placeholder carries and which an upstream-made one carries (only
  `name`, `image`, `chaId`, `coldstorage` and one empty dummy chat, plus internal fields
  (`chatPage`, `firstMsgIndex`, `coldStoragedChats`), with `type` always `'character'`, even for a
  group); do not rely on the fork-only fields; use `getCharacterFromIndex` for the full
  data, with a short example that re-checks `chaId` because indices can shift between awaits.
- `setDatabase` and `setDatabaseLite`: a placeholder that may not take a character's place is not an
  error; the live character is put back or the placeholder is left out, with a console warning.
- `getCharacterFromIndex`, `getChatFromIndex`, `setChatToIndex`, `setCharacter`, `setChar` and
  `setCharacterToIndex`: the 3a behaviour of Report 52 (reads from a copy; restore first; a refused
  placeholder rejects).

These notes describe 3a's behaviour and the `getDatabase` decision; 3b's code does not change them. They
were fact-checked by `doc-verifier` in two passes (ledger row 509).
- Pass 1 checked 17 claims: 9 verified, 2 overstated (#A and #B), 5 incomplete, 1 unverifiable. All 9
  corrections were applied by the `doc-writer`. Pass 2 verified the corrections, with none remaining.
  - #A (overstated): the placeholder field list implied that every placeholder carries
    `lastInteraction`, `trashTime`, `creatorNotes` and a group's `characters`; only fork-built ones do.
    An upstream-made placeholder has `type: 'character'` even for a group. The Orchestrator checked that
    against `git show upstream/main:src/ts/process/coldstorage.svelte.ts`, where the stub builder writes
    the literal `type: 'character'` (line 423; the writer of this report read the same line).
  - #B (overstated): `setDatabase` and `setDatabaseLite` were said to "keep the live element in that
    place". They put back the live character with the same `chaId`, matched by `chaId`, not by index.
  - Incomplete: #C, the failure list lacked "does not hold that character"; #D, `setChatToIndex` also
    rejects when the character can no longer be loaded, and an out-of-range chat index is a silent
    no-op, as upstream; #E, upstream `getChatFromIndex` on a placeholder returns its dummy chat for
    index 0 and null otherwise; #F, `setCharacterToIndex` with an out-of-range index does nothing and
    does not reject; #G, the `plugins.md` example lacked `if (!db) return;` and a `chaId` check across
    awaits; #H, the `.d.ts` `setChar` lacked the note that `setCharacter` has. (#E is counted among the 9
    verified and is also marked incomplete, so the header's 17 = 9 + 2 + 5 + 1 holds while six items,
    #C to #H, are incomplete; 2 + 6 + 1 = 9 corrections were applied.)
  - #I (unverifiable): "any character may be archived". The hedge became "a character can be archived".

**Strings.** Four new English keys in `src/lang/en.ts`, added by the coder with their call sites and
translated into ko, cn, zh-Hant, vi, de and es by the `translator` (6 added lines in each of the seven
files, `git diff --numstat`):
- `coldStorageGroupMembersNotLoaded` (names the members of the group that could not be loaded; they stay
  archived, get no first message in a new chat and are skipped when the group talks);
- `coldStorageDatasetExportSkipped` (names the archived characters not in the dataset);
- `assetIntegrityReadingArchivedProgress` ("Reading archived characters... (done / total)");
- `assetIntegrityReportArchivedNotChecked` (the report line naming archived characters whose assets were
  not checked).

The single-character alerts (a missing unit, T1, A3 and P2; an unreadable one, T2) reuse
`coldStorageNamedRestoreFailed` and `coldStorageNamedRestoreUnreadable` from 3a.

**Where the code is** (`git status`, on the uncommitted tree). New: `src/ts/playgroundChat.ts` and the
six test files below. Changed: `src/ts/characters.ts`, `src/ts/process/group.ts`,
`src/ts/process/index.svelte.ts`, `src/ts/process/coldMemberRestore.ts`,
`src/ts/process/coldCharacterAccess.ts`, `src/ts/storage/exportAsDataset.ts`,
`src/ts/storage/storageMaintenance.ts`, `src/lib/Playground/PlaygroundMenu.svelte`,
`src/ts/plugins/apiV3/risuai.d.ts`, `plugins.md`, the seven language files and four existing test files
(section 2).

**Tests.** Six new files, 44 tests, counted from the test titles in the six files (the `test.each` in
the Playground file is 2 tests):
- `src/ts/characters.coldGroup.svelte.test.ts` (13);
- `src/ts/playgroundChat.coldStub.svelte.test.ts` (7);
- `src/ts/process/tests/groupAddColdMember.test.ts` (7);
- `src/ts/process/tests/sendChatGroupColdMember.svelte.test.ts` (5);
- `src/ts/storage/tests/exportAsDatasetCold.test.ts` (6);
- `src/ts/storage/tests/storageMaintenanceAssetIntegrityCold.test.ts` (6).

**Against the unchanged code, measured on all 44** by the `doc-verifier` after the records were drafted
(logs `3b/verifier-*.log`): HEAD copies of the changed production files served through the round-1
reviewer's swap config, with the Playground handler as it stood at HEAD in `playgroundChat.ts`.
**31 failed and 13 passed.** Failures per file: characters.coldGroup 9, Playground 5,
groupAddColdMember 6, exportAsDatasetCold 4, sendChatGroupColdMember 2, storageMaintenanceAssetIntegrityCold
5 (9 + 5 + 6 + 4 + 2 + 5 = 31).
- The 13 passes are the 12 tests titled `guard:` in the first run and the export group-placeholder test.
  The latter is red only against the tree before round 3 (below), not at HEAD.
- All 8 edited existing tests fail at the unchanged code.

The record of the first red run (`3b/red.log`: HEAD's production code plus only the Playground
extraction, 8 files, **28 failed and 31 passed**):
- The run held 38 of the 44 new tests, in the six new files: 26 failed and 12 passed, and the 12 are
  exactly the tests titled `guard:`.
- It also held two existing tests that the coder edited to the D-c rule, one in
  `sendChatGroupOrigin.svelte.test.ts` and one in `sendChatTurnsReached.svelte.test.ts`. Both fail at
  HEAD (1 failure in each file).
- 28 = 26 + 2.
- The round-1 reviewer swapped HEAD's copies of the seven changed production files in through a scratch
  Vitest config (`playgroundChat.ts` was not among them) and got **31 failures across 10 files**, the new
  suites plus the edited tests. The hand-back does not break the 31 down by test.
- Reverting one production file at a time at round 1 (failing tests): `characters.ts` 8, `group.ts` 4,
  `index.svelte.ts` 4, `coldMemberRestore.ts` 8, `exportAsDataset.ts` 4, `storageMaintenance.ts` 5.
  `coldCharacterAccess.ts` alone fails 14, only because other files import its new export, so the
  reviewer discounted it.

Six of the 44 were added after that first run. Five came after round 1 (`3b/red-r1.log`):
- They are regression tests. All five fail at the unchanged code (the verifier's measurement above),
  and each pins a decision: the F1 test (the Playground restore that ends `gone` with a placeholder still
  in the slot), three that aim at the round-1 survivors (an archived group is selected at its new index
  when a character is inserted before it during a member's restore; `addGroupChar` format-updates a
  restored member in its slot without a new interaction time; a picked character deleted while its unit
  is read is not added), and one at the no-holder path (a restore that ends with no `§playground`
  creates a blank one). Round 2 killed the mutants of these decisions.
- `red-r1.log` (27 tests in three files, 1 failed, 26 passed) shows the F1 test failing on the tree
  before the F1 fix, with the placeholder renamed `'assistant'` where it had to keep its own name; the
  other four passed on that tree.
- Two of the five were titled `guard:` when added (the no-holder test and the new-index test). That label
  was wrong, because they fail at HEAD; the `test-warrior` removed the prefix.

The sixth came after round 2 (`3b/red-r2.log`): "a placeholder typed as a character whose readable unit
holds a group yields no rows, is read at most once, and is not named in the end notice" in the export
file. It failed on the tree before the export fix because the end notice named 'Guild' (1 failed, 5
passed in that file); it passes at HEAD. Its title originally said "is read once" while the assertion is
`calls.length <= 1`, which a zero-read run would also pass (the round-3 reviewer's optional point; the
title now says "at most once").

At the unchanged code: 31 red and 13 green, 44 in all.

## 2. The Orchestrator's decisions

The brief (`brief-3b.md`, section 1) fixed five decisions before any code was written. `MC-146` 2 and 3
settle what happens when a group member's or the Playground's archive cannot be restored; D-a to D-c
settle the details.

- **D-a. A member that selecting a group restores gets its format update and no `lastInteraction`
  bump.** The user opened the group, not the member. The group keeps its bump.
- **D-b. `addGroupChar` with a member whose archive cannot be restored adds the member without a first
  message, and an alert names it.** It is `MC-146` 2 applied to adding.
- **D-c. In a group turn, a member whose restore fails is passed over and the walk goes on.** Step 2
  stopped the group there; this changes it (`MC-146` 2, "skipped in turns"). A later turn tries the
  restore again.
- **D-d. The `§` exclusion from archiving stays in step 5** (Report 49 D19; Report 52 section 2, R1: it is a step 5 rule, and the 10-day path has none today), with the boot pass that
  replaces the 10-day path. 3b does not touch archiving.
- **D-e. Dataset export and the asset-integrity check read each archived character's unit as a copy, one
  at a time, and never install it.** A unit that cannot be read is skipped, and the end notice names each
  one. Neither aborts.

Decisions made during the step:
- **The F1 alert says "unreadable".** The F1 fix needs an alert for a `gone` restore that leaves a
  placeholder in the slot. The coder chose the `mismatch` wording; the Orchestrator chose `unreadable`
  (`coldStorageNamedRestoreUnreadable`: "could not be loaded right now. Nothing was changed. Please try
  again."). The `mismatch` text says the data may be permanently lost, and the Orchestrator judged that untrue for
  this case. The round-2 reviewer found the `unreadable` text true for this state and accepted it.
- **The coder's edits to existing tests were accepted.** The diff shows 8 existing tests edited in four
  files:
  - Six change the expected alert text (one of them, in `coldMemberRestore.test.ts`, also retitles its
    test, adding ", naming the character"), from the unnamed `coldStorageRestoreFailed` or
    `coldStorageRestoreUnreadable` to the named `coldStorageNamedRestoreFailed(name)` or
    `coldStorageNamedRestoreUnreadable(name)`: one in `characters.coldRestore.svelte.test.ts` and five in
    `coldMemberRestore.test.ts`. They follow from `restoreColdCharacterByChaId` now restoring quietly and
    naming the placeholder.
  - Two, one each in `sendChatGroupOrigin.svelte.test.ts` and `sendChatTurnsReached.svelte.test.ts`,
    encode D-c. They used to assert that a failed member stops the group; they now assert that the
    member is passed over.
  - The six alert-text edits were not in the first red run (`red.log` covered the new files and the two
    sendChat files); the two D-c edits were, and failed at HEAD. The verifier's later run found all 8
    failing at the unchanged code.
  - The round-1 reviewer judged the edits legitimate (section 4). The brief that asked for this record
    called them "six edited existing tests"; the count of eight is from this report's reading of
    `git diff` on the four files, and the Orchestrator confirmed it.

## 3. Scope notes

Report 50 section 3, Report 51 section 3 and Report 52 section 3 record the `MC-091` amendments of
those steps. **As far as the evidence shows, 3b needed none.** The brief records no amendment, and every
changed area is on 3b's own list (groups, the Playground, the two exports, the plugin documentation).
Two changes reach modules that earlier steps own, and the brief's decisions require both:
- `restoreColdCharacterByChaId` (step 2's module, 3a's last edit) now restores quietly and names the
  member, because D-c and scenarios T1 and T2 ask for a named alert;
- `alertNamedRestoreFailure` is newly exported from `coldCharacterAccess.ts`, which `coldMemberRestore.ts`
  and `playgroundChat.ts` import. The module still imports neither `characters.ts` nor
  `index.svelte.ts` (round-1 reviewer, judgement 2).

`group.ts` now imports `coldCharacterAccess.ts` statically, and that reaches `index.svelte.ts` through
`coldCharacterRestore.ts` and `coldstorage.svelte.ts`. The round-1 reviewer judged this safe by reasoning
and did not run an unmocked module load (section 5). `characters.ts` still does not import
`coldMemberRestore.ts`, which would be a cycle.

## 4. Gate 2 record

`adversarial-reviewer` was used, as Report 49 section 3.4 assigns it to the non-write parts of step 3.
The same reviewer instance ran all three rounds. It ran on the working tree against HEAD `0e054956`, not on a
commit, with mutants and a reproduction built in its own scratchpad by a Vitest config that swaps module
sources at load. It re-ran the touched tests and, in rounds 1 and 2, `pnpm check`. Ledger rows 510-512 hold the costs.

### Round 1: [REJECT]

Snapshot: `0e054956` plus the working tree (the tracked diff, the untracked `playgroundChat.ts` and the
six untracked test files). The 10 touched or new test files gave 124 passed; `pnpm check` 0 errors, 0
warnings. The reviewer did not re-run the full suite or the 96 neighbouring files; it relied on the
implementer's logs for those.

**F1 (MAJOR, logic):** `openPlaygroundChat` wrote, formatted and selected a placeholder when the
restore ended `gone` and a placeholder still held the slot. `restoreArchivedForWrite` returns `gone` in
more cases than "nobody holds the `chaId`": also when the sole holder is a placeholder pointing at a
different unit than the one read, and when the holder is still a placeholder after the restore.
`openPlaygroundChat` returned early only on `failed`, so `gone` fell through to the selection code. That
contradicts `MC-146` 3. The reviewer's scratch test held a unit read, changed the slot's `coldstorage`
key, then released the read, and got
`{"cold":"unit-moved","util":true,"name":"assistant","fm":"{{none}}","sel":1,"store":2,"alerts":[]}`:
the slot still a placeholder, written, selected, `PlaygroundStore` 2, and no alert. Likelihood is low
(the unit key has to change while the read is pending, for example on a re-archive). The cold unit
itself is not touched, so there is no data loss; the consequence is a selected placeholder with empty
chat data. Disposition: fixed (the `gone` branch looks the holder up again), with a regression test.

Everything else the reviewer probed held (items as it numbered them):
- **The edited existing tests** are legitimate (section 2): `toHaveBeenCalledTimes(1)` is kept, the
  "read error" test keeps its `not.toHaveBeenCalledWith` check, and reverting `index.svelte.ts` alone
  fails 4 tests including both D-c edits. The dropped `alertErrorMock not called` assertions were on a
  mocked restore and asserted nothing about alerts, and the real-restore file asserts the exact alert list.
- **`addGroupChar`:** skipping the confirm on `failed` is right (an `alertConfirm` would overwrite the
  named error in the one alert slot); the format update uses a fresh index.
- **The awaits in `changeChar`:** each branch checks the call id and `doingChat`, then re-finds the
  group; members are restored one at a time and looked up by `chaId` each time; a concurrent
  `changeChar` joins the running restore; only the call that installed a member formats it; a placeholder
  is never mutated; the notice fires once, only on the call that selects.
- **Group turns (D-c):** passing a failed member over works in the order loop, the preview loop and the
  single-member path. The only caller with a member index is `devToolActions`, which checks truthiness.
- **Dataset export and asset integrity:** one-at-a-time reading is tested with a max-in-flight counter;
  stubs stay in their slots; the `wait` state is always cleared (a `finally`, and the read helper never
  throws); targets are the full-character set (image, emotions, additional assets, vits, gptSoVits,
  `ccAssets`), deduplicated through a `Set`; the no-targets path still names the unchecked characters.
- **Comments:** every new or changed comment was read; none cites a round, a reviewer, a mutant, history
  or a line number, and none describes a mechanism that does not exist.
- **Translations:** the three stable keys keep the English meaning and have the same signatures in all
  six files; `coldStorageGroupMembersNotLoaded` was in flux and not reviewed in round 1.
- **Tests red for the stated reason:** all seven production files at HEAD gave 31 failures across 10
  files (section 1); the per-file reverts are in section 1. The guards pass at both HEAD and the tree
  (G6, G7, C2, A4, T3, T4, E4). Every scenario G1-G7, A1-A4, C1-C2, T1-T4, P1-P4, E1-E4 and I1-I4 had a
  test; the F1 regression test was missing.

**Mutants, round 1: 9 run, 6 killed and 3 survived** (scratch copies of `characters.ts` and
`group.ts`):

| Mutant | Result |
|---|---|
| drop the `callId` check in the full-group branch | KILLED |
| drop the `doingChat` check in the full-group branch | KILLED |
| a restored member's interaction is bumped | KILLED |
| no format update on a restored member in `changeChar` | KILLED |
| ambiguous member not reported | KILLED |
| first message offered although the restore failed | KILLED |
| the archived-group branch uses the pre-await index instead of re-finding | SURVIVED |
| `addGroupChar` does not call `characterFormatUpdate` after the restore | SURVIVED |
| `addGroupChar` adds the member on `gone` | SURVIVED |

The survivors were test gaps, not defects. Three of the five tests added after round 1 (section 1) are aimed
at them.

**Optional, round 1:** a test for the `wait` state being cleared when the scan throws; no progress
display in `exportAsDataset`; `addGroupChar` `gone` is a silent no-op when it comes from a placeholder
pointing at another unit (the same rare path as F1); a static import would be simpler than the dynamic
one in `storageMaintenance.ts`.

### Round 2: [APPROVE]

Snapshot: the working tree after the F1 fix and the new tests. 26 test files (the storage tests, the
process tests and the group, Playground and characters suites) gave 474 passed; `pnpm check` 0 errors, 0
warnings; the round-1 scratch reproduction passes (6/6). The full suite was not re-run by the reviewer.
- **F1 fixed on every outcome:** `failed` returns, as before; `ready` selects as before; `gone` looks the
  holder up again, and a placeholder still holding the slot gives one named alert and a return with no
  write, format update, selection or `PlaygroundStore` change; no holder left falls through and creates a
  blank `§playground`, as before. The `unreadable` wording is accepted (section 2).
- **Mutants, round 2: 8 run, 7 killed and 1 survived:**

| Mutant | Result |
|---|---|
| drop the holder re-check (`gone` falls through) | KILLED (the F1 test) |
| the re-check returns without the alert | KILLED |
| `gone` with no holder returns instead of creating | KILLED (the no-holder guard) |
| the archived group is selected at the pre-await index | KILLED (the new-index guard) |
| `addGroupChar` does not format after the restore | KILLED |
| `addGroupChar` format update bumps the interaction | KILLED |
| `addGroupChar` adds the member on `gone` | KILLED |
| the alert uses the 'missing' wording instead of 'unreadable' | SURVIVED (optional: the tests assert that the alert names the character, not its wording) |

  All three round-1 survivors are now killed.
- **Nothing new introduced:** the `gone` branch is reached only when a placeholder was present before
  the restore; the full, absent and `ready` paths are unchanged.
- **`coldStorageGroupMembersNotLoaded` in all seven files:** same key and signature
  `(characterNames: string) =>`; the meaning is intact; each file's wording uses its own `firstMessage`
  term (en "first message", ko 첫 메시지, cn 初始消息, zh-Hant 開局訊息, vi tin nhắn đầu tiên, de erste
  Nachricht, es primer mensaje).
- **Optional:** assert the alert wording in the F1 test; the two round-1 items that stand (the `wait`
  clear on a throw, and no progress display in `exportAsDataset`).

The grep for history words over the diff and `playgroundChat.ts` found only "no longer" in the plugin
documentation text, in its ordinary sense ("no longer in the list").

### Round 3: [APPROVE]

Trigger: after round 2 had approved, the `doc-writer`, drafting this report, raised in its hand-back, as
a reading of `exportAsDataset` against the upstream stub builder, that an upstream-made group placeholder is typed
`'character'`, so the early `slot.type === 'group'` skip does not apply to it. The code then read the
unit, found a group, left it out and put its name in the "could not be loaded" notice, which is untrue
for a unit that read fine. The Orchestrator confirmed it by reading `exportAsDataset.ts`
(`records-notes.md`) and had it fixed and reviewed.
- **The fix** (`exportAsDataset.ts`): only `copy.status !== 'ok'` puts a name in the notice. A copy that
  reads ok and holds a group is skipped with no rows and no name. The doc comment says so. The early skip
  for a fork-built group placeholder (real `type`) is unchanged and still avoids the read.
- **The test** is the sixth added test (section 1): red on the tree before the fix (`red-r2.log`).
- **The review:** the reverted-fix mutant (the round-2 condition
  `copy.status !== 'ok' || copy.character.type === 'group'`) fails that test, 1 failed of 6, for the stated
  reason (the notice names 'Guild'; the unit read is `ok`, so the typed-as-character shape is exercised).
  With the fix, `src/ts/storage/tests` passes: 18 files, 357 tests. By `git diff --stat` against the
  earlier views, `exportAsDataset.ts` is the only source file whose size moved. The reviewer did not
  re-run the full suite or `pnpm check`; the Orchestrator ran both afterwards (final checks above).
- **Other 3b paths that key on a placeholder's `type`:** none breaks for an upstream-made group
  placeholder, by the reviewer's reading. `collectIntegrityTargets` keys on `coldstorage` only and scans a
  group copy like any other. In `changeChar` the archived branch triggers on `coldstorage`, and the group
  test is applied to the restored character. `archivedMemberIds`, `restoreGroupMembers`,
  `createNewChat` and `addGroupChar` key on `coldstorage` and `chaId`.
- **Pre-existing, found by the reviewer, not fixed (section 5):** the member picker offers an upstream
  group placeholder as a member candidate.
- **Optional:** the test title said "is read once" and the assertion is `<= 1`; the title now says "at
  most once".

One [REJECT] round and then two approvals, so the three-round rule was not triggered.

## 5. What is not covered

- **No live check was run.** Nothing in 3b ran in a browser or a Tauri build. The new tests model the
  unit reads; real Node, OPFS and Tauri unit reads, the group screen after a real restore of its members,
  and the Playground on a profile holding an archived `§playground` are live-check-only.
- **The `§` exclusion from archiving stays in step 5 (D-d).** At the packet's HEAD the 10-day path has no
  `§` exclusion, and neither has upstream's, so a `§playground` placeholder can still be created until
  step 5. 3b makes opening one safe; it does not stop it being archived.
- **One optional mutant survives:** the F1 alert's wording (`unreadable` against `missing`) is not
  asserted; the tests check that the alert names the character.
- **`exportAsDataset` shows no progress** while it reads a large number of archived units one at a time;
  `verifyAssetIntegrity` does.
- **The `wait` state's clearing when the scan throws is untested.** The `finally` is in the code and the
  reviewer read it; no test makes the scan throw. The integrity test's `getUncleanablesSync` mock
  re-implements the function, so it checks the wiring, not the real collector.
- **A failed group member alerts again on every send.** Each send re-reads its unit and shows one named
  alert. D-c decides this ("a later turn tries the restore again"); the round-1 reviewer accepted it.
- **`addGroupChar` on `gone` is silent.** When `restoreArchivedForWrite` returns `gone` because the
  placeholder points at a different unit than the one read, the member is not added and nothing is
  shown. The decision not to add on `gone` is pinned by a test; the silence is the round-1 optional item.
- **`changeChar` leaves a `gone` group member archived without naming it.** In `restoreGroupMembers` a
  member whose restore ends `gone` is neither restored nor named, so the group opens without a notice
  for it. The writer's reading of the source, not run.
- **The real module-load order of `group.ts`'s new import chain** was reasoned about by the round-1
  reviewer and not executed unmocked. `v3.svelte.ts` already loads the same chain.
- **The member picker offers an upstream group placeholder (pre-existing, not caused by 3b; recorded,
  not fixed).** The picker (the `selectChar` branch of `src/lib/Others/AlertComp.svelte`) lists
  `char.type !== 'group'`. An upstream-made group placeholder is typed `'character'`, so it is offered.
  Picking it in `addGroupChar` now restores the group and adds it as a member of another group; at HEAD
  the pick added the placeholder itself, so 3b is not worse (the round-3 reviewer's reading of the
  source; not run). The round-3 reviewer's smallest guard: treat
  a `ready` result whose `type` is `'group'` like `gone`. It changes what the user sees, so it needs a
  decision and is left open.

## 6. Open follow-ups

1. **CHORE-16 PG-1 is next, as its own small fix** (the maintainer's approval of 2026-10-01), between
   3b and step 4: every character-list view skips `§playground` and `§temp`, as `checkCharOrder` does, so
   the Playground's "assistant" character can no longer be opened or deleted from the grid or the mobile
   list. Confirm the full set of list views first; the wiki session updates `wiki/Playground.md`
   afterwards (`Agents/Live-State.md`, work order; `Agents/Roadmap.md`, CHORE-16).
2. **Step 4** of Report 49 (section 3.4): the backup collects each blob's inner pointer keys from the
   value it reads and drops `value` retention (D13); Gate 2 is `opus-reviewer`. Steps 5-7 follow.
3. **A native-speaker check of the four new strings** in cn, zh-Hant, vi, de and es. The maintainer said
   on 2026-10-01 that the new Korean strings look fine so far. The round-1 reviewer checked
   the meaning and that the terms match each file's existing `assetIntegrity*` strings (ko 에셋, cn and
   zh-Hant 资源 and 資源, vi tài sản, de Assets, es activos); it noted that vi "tài sản" and es "activos"
   read slightly like "property" or "financial assets", and that they match the files' existing choices.
   The translator's low-confidence notes for the four strings (its hand-back, as the Orchestrator's notes
   record it; the ko and cn notes were first written for the earlier "greeting" wording and the
   first-message reword superseded them): ko, the 첫 메시지 wording (the maintainer said the Korean looks
   fine so far); cn, 初始消息 (the file's `firstMessage` term) against 问候语 (used for
   `alternateGreetings`); zh-Hant, 開局訊息 may read slightly odd; vi, "nhóm trò chuyện" could read as
   "chat group" rather than "the group talks", and the report line "chưa được kiểm tra tài sản" is
   clipped; de and es, "spricht" and "habla" are literal; es, "activos" in the report line reads stiff.
4. **A combined live check of 3a and 3b** on an archived profile (Report 52 section 6, item 8), covering
   the V3, MCP and restore-all paths, group selection, the Playground and the two exports.
5. **Optional test gaps and polish** (section 4): assert the F1 alert's wording; a test for the `wait`
   clear on a throw; progress in `exportAsDataset`; the silent `gone` in `addGroupChar`; a static import
   in `storageMaintenance.ts`; the export test's "at most once" assertion, which a zero-read run also passes.
6. **Step 3a's follow-ups stand** (Report 52 section 6: O1, O2, O4, O6, the optional test gaps, the
   no-format-pass residue, and step 5's reuse of `hasEnabledV21Plugin` and its ownership of
   `loadInternalBackup`).
7. **Step 5 still owns** the `§` exclusion from archiving (D19; D-d) and the retirement of the 10-day
   path.
8. **The member picker offers an upstream group placeholder** (section 5): a decision on what the user
   should see, then the smallest guard in `addGroupChar`. Pre-existing; not a 3b regression.
