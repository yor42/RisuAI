# Report 56 — Memory stage 1, step 5: the boot archive pass (5a to 5d-4; D1, D2, D3, D9, D10, D14, D15, D16, D18, D19, D21; MC-148, MC-149, MC-152, MC-158, MC-159)

**STATUS:** code done, 2026-10-02. Step 5 is eight commits, `33545c2c` (5a), `448962f4` (5b), `9b312962` (5c),
`e8cf50de` (5d-1), `29bf2f24` (5d-2a), `4d23b1b4` (5d-2b), `3fca470e` (5d-3) and `e7d7f093` (5d-4), all local and
not pushed. Every sub-step passed its Gate 1 and Gate 2. No gate was left at [REJECT]. The most [REJECT] rounds any
one sub-step had was two, so the three-round rule (`AGENTS.md` section 1.2) never fired and `senior-advisor` was not
used (section 4). **Memory stage 1 as a whole is not done:** steps 6 and 7 of Report 49 are not started (section
14). **No live check of step 5 was run** (section 11). This report was written by `doc-writer` from the commit
messages, the Orchestrator's log, the gate records and the repo records. **The doc-verifier has checked it (44 claim groups: 30
VERIFIED, 2 WRONG, 3 STALE, 5 OVERSTATED, 4 INCOMPLETE; ledger row 602); this version applies its corrections.** The gate verdict tokens are the reviewers' own.

Evidence labels follow the sources: **RUN** means a person or agent executed it and the source says so; **TRACED**
means read in source and not run; **INFERRED** means reasoned and not run. Where a claim rests only on the
Orchestrator's log (`RESUME.md`), the text says "the Orchestrator's log".

Final checks, run by the Orchestrator on the last snapshot Gate 2 of 5d-4 reviewed (`full-*-r2.txt`, ledger row
596), before that round's editorial corrections:
- `pnpm test` (`vitest run`): 261 files, 4956 passed, 4 skipped;
- `pnpm check`: 0 errors, 0 warnings;
- `pnpm build`: ok.

After the round-2 editorial corrections (commit message, test titles, one doc sentence), the Orchestrator's log says
the touched tests were re-run (150 of 150) and `pnpm check` was 0 and 0. The Gate 2 reviewer's own run of the 15 test
files of 5d-4 was 637 passed, 1 skipped, with `pnpm check` 0 and 0 (ledger row 596). The full suite and the build were
not re-run after those corrections (`AGENTS.md` section 4: editorial-only changes do not trigger application tests).
The per-sub-step final numbers are in section 4. Report 55's final run was 229 files and 3876 passed. The difference
to 261 files and 4956 passed includes tests from side tracks that landed in the same window (the desktop updater
disable, the Settings legal links, the legal-flag default), so it is not apportioned to step 5 here.

**Sources** (scratchpad `step5/`; not durable, so this report, `Agents/Maintainer-Context.md` and ledger rows 521-599
are the durable record):
- `RESUME.md`: the Orchestrator's own log for the whole step. Cited as "the Orchestrator's log";
- `decisions.md` and `5d/decisions.md`: the maintainer's answers and the Orchestrator's calls as written down at the time;
- the investigation packets (`inv/`, `5c/inv-packet.md`, `5d/inv-packet.md`, `5d2/inv-packet.md`, `5d3/packet.md`,
  `5d4/packet.md`). **This writer opened only `inv/summary.md`;** the packets' findings are taken from ledger rows 522,
  534, 551, 566, 582 and 588, which summarise them, and from the Orchestrator's log;
- the plans and gate records (`5a/`, `5b/`, `5c/`, `5d/` for 5d-1, `5d2/` for 5d-2a and 5d-2b, `5d3/`, `5d4/`). **Read in
  full by this writer:** the plans for all eight sub-steps; `5a/gate2-r1.md`; `5b/gate2-r1.md` and `gate2-r2.md`;
  `5c/gate2-r1.md` and `gate2-r2.md`; `5d/gate1-r3.md`; `5d2/gate2b-r1.md`; `5d4/gate2-r2.md`; and the 5d-4 mutant table.
  The other Gate 1 and Gate 2 records are cited through their ledger rows, the commit messages and the plans' own
  disposition sections. The reviewers' harness cannot always write a file, so some `gate2` files are the Orchestrator's
  copy of a hand-back;
- the eight commit messages, read with `git show --stat`. **Where a count in the log and a count in a commit message
  differ, the commit message wins** (section 15);
- in the repo: `Agents/Reports/49-memory-stage-1-plan.md`, Reports 51 and 55 (structure), `Agents/Maintainer-Context.md`
  (`MC-148`, `MC-149`, `MC-152`, `MC-156` to `MC-159`), `Agents/Live-State.md` (the step 5 section and its list of the
  Orchestrator's calls), `Agents/Roadmap.md` (CHORE-59, CHORE-61, CHORE-62, and CHORE-55, CHORE-51 for context),
  `Agents/Investigation-Ledger.md` rows 521-599.

Plan-local ids (`I1`, `J4`, `K5`, `R2`, ...) come from the scratchpad plans. The same letter means different things
in different sub-steps, so this report prefixes the sub-step (for example "5c I3").

Decisions bearing on step 5: `MC-148`, `MC-149`, `MC-152`, `MC-158`, `MC-159` (new in this step, section 5);
`MC-011` (the fork has never shipped, so upstream compatibility is what must hold), `MC-089` (nothing ships with a
ticket open), `MC-091` (scope amendments, section 7), `MC-093` (a local restore is refused while other tabs are open),
`MC-129` 4 (a backup load is refused while work is in progress), `MC-130` to `MC-145` (the stage 1 plan, Report 49),
`MC-132` 2 and `MC-146` 4 (only an enabled V2.1 plugin restores every character and blocks boot archiving),
`MC-133` 2 (the boot pass and `init` are not rewritten), `MC-139` 3 and 4 (asset clean-up is manual; the
plugin-storage migration is retired), `MC-142` (the opt-out key), `MC-143` 2 (V3 not seeing legacy inline plugin
storage is accepted), `MC-138` 1 (premise corrected, section 8).

## 1. What step 5 changed

**What a user gets, in plain terms** (the fork has never shipped, `MC-011`; nobody has run any of this):
- **Characters are archived at startup, by one pass, and only then.** On a boot that reads and decodes the main save,
  the pass writes each eligible full character to its own cold-storage unit, reads it back, replaces it in the
  decoded tree with a placeholder (stub) built from what was read back, and commits that tree as the main file before
  the app installs it. Nothing creates a stub after the UI opens. Eligible means: full, not trashed, `chaId` not
  starting with `§`, not shared with another slot after the id repair.
- **The 10-day archiving is gone** (both the character path and the chat path), and so is the plugin-storage
  migration. Existing upstream archives still open and restore (5a).
- **The setting is "Archive characters at startup"** (Settings > Advanced Settings). Absent or `true` means on;
  `false` is the opt-out. On the first boot where the key is absent and the pass can run, a one-time notice says so
  (5a, 5c).
- **Load Internal Backup writes the chosen snapshot as the main save and reloads the page**, instead of installing it
  in memory. It refuses while another tab is open and refuses a damaged or incomplete snapshot as a whole (5b).
- **A character that cannot be written is skipped, not archived, and the user is told once.** A save the pass could
  not commit is refused before anything is written. On the self-hosted Node server, a commit over the server's body
  limit is not sent (5d-1).
- **After two failed or interrupted passes in a row, archiving pauses on this device**, with one notice. Turning the
  setting off and on resumes it (5d-2a). **After two startups in a row die while restoring every archived character
  for a V2.1 plugin, the app turns that plugin off** and says so (5d-2b).
- **Placeholders that upstream made are filled in at startup**: real type, group members, last-used time,
  description and chat count, also when archiving is off (5d-3).
- **A failed read of an archived character or chat says what it can say.** "No storage on this page" and "the copy may
  be damaged" get their own text; every other failure keeps "try again" (5d-4).
- **The README states what happens when a second device starts against the same Node server** (5d-4; section 8).
- **Opening a character from an upstream archive whose placeholder has no trash time restores it as not trashed**,
  where upstream kept the archived copy's old trash time (5a; `MC-149` 4).

| Sub-step | Commit (files, +/-) | What it does | Memory-stage invariants |
|---|---|---|---|
| 5a | `33545c2c` (64, +469/-1168) | Deletes the 10-day paths and the migration; new `archiveCharacters` key and checkbox; the restore trash rule | D14 (binding), D15, D21 |
| 5b | `448962f4` (21, +2307/-478) | `loadInternalBackup` writes the snapshot and reloads; other-tab refusal; waits for the startup clean-up | D3 |
| 5c | `9b312962` (27, +5106/-80) | The boot pass: exclusive hold, fenced commit, the key and its notice | D1, D2, D3, D9, D10, D14, D16, D19 |
| 5d-1 | `e8cf50de` (25, +2301/-71) | Refuse before writing; skip an unwritable character; the Node size rule | D1 (Node limit), D2 (amended) |
| 5d-2a | `29bf2f24` (20, +2143/-52) | The pass breaker: pause after two failed passes | D18 |
| 5d-2b | `4d23b1b4` (16, +1798/-55) | The V2.1 restore-all breaker: turn the plugin off | D18, D16 |
| 5d-3 | `3fca470e` (14, +1995/-80) | Fill in upstream-made placeholders at startup, also with archiving off | D6, `MC-148` |
| 5d-4 | `e7d7f093` (28, +3110/-168) | "Unavailable" and "damaged" wording; README two-device note | D1 ("unavailable"), `MC-138` 1 |

The records commits in the window, with the ledger rows each adds (the row ranges read from `git show` of the ledger
file, 2026-10-02): `756e8210` (rows 521-526: 5a), `57235222` (527-533: the reroll-bug and Maybe-Later records, which also
hold the 5b gate rows 527 and 530), `9361ce1b` (534-540: the README rewrite and records, which include 5c's scoping
refresh and Gate 1, rows 534 and 535), `435a8723` (541-550: 5c's tests, coder, translator and Gate 2, and the Settings
legal links), `fe7c3d1d` (551-569) and `7cf6ac27` (570-599).

## 2. Report 49 items: closed and carried

| Item | After step 5 | Where |
|---|---|---|
| D1 exclusive access | **Closed in code for web, Node and Tauri desktop; not run on any real host.** Web: Web Locks plus OPFS writes or the Node server; the hold is taken after storage init and before the main read, with a grant timeout of about 1 s (`HOLD_TIMEOUT_MS = 1000` in `bootArchivePass.ts`, read 2026-10-02), released with no argument. Node: the commit carries the revision; a 409 discards the result and the app opens on the current file. Tauri: desktop only, single instance. Capability gate, `uuid` v4 unit ids and the explicit `enableRemoteSaving` input to the encoder are in. **Deviation from D1's wording:** the commit's cross-tab broadcast is omitted, because under the exclusive hold no other tab exists to receive it (5c plan I1; Gate 1 E3). | 5c; Node limit 5d-1 |
| D1 Node limit | A commit over 104,857,600 bytes is not sent; the main file is installed as it is, the user is told, and later starts on this device do nothing until the setting is turned off and on (device memo). The limit lives in `server/node/bodyLimit.cjs` (read) and is copied as a literal in `bootArchiveHost.ts` with a test that pins the two (commit message). | 5d-1 |
| D1 "unavailable" (the wording half of D1's capability-gate sentence) | A host with no unit backend already read as `error`, not `missing` (ledger row 551, P-A). Only the text was open. The wording half is covered by 5d-4, for the no-storage case and the damaged case; the capability gate itself was 5c. | 5d-4 |
| D2 unit before pointer | Closed. **Amended by `MC-158` 2:** a failed write or read-back leaves that character full and the pass goes on; two failures in a row stop archiving for that start (the Orchestrator's bound, section 6). | 5c, 5d-1 |
| D3 monotonic (creator part) | **Creator part closed in code; the `code-searcher` sweep (Report 49 section 5 item 6) is carried.** `makeColdData` and its callers are deleted (5a). `loadInternalBackup` no longer installs on the live page (5b; the scoping packet's digest, `inv/summary.md`, found it the only runtime violator, TRACED). The 5c commit message says "Nothing creates a stub after the UI opens"; the claim that `buildColdStub` has one production caller, the pass, comes from 5c Gate 2 round 1 (`step5/5c/gate2-r1.md`), which verified it. A separate `code-searcher` sweep for stub creators is not in the records: TODO(evidence). | 5a, 5b, 5c |
| D9 ids repaired first | `repairDatabaseIds` runs on the raw tree before eligibility, and the same repaired tree is committed and installed (5c I17). | 5c |
| D10 file and memory agree | The committed tree is the installed tree; blobs carry the per-character defaults (moved from `checkNewFormat` into `characterDefaults.ts`) and the streaming reset; `formatversion` must be 5 or higher. | 5c |
| D14 opt-out key | Key and binding (5a); notice and key write (5c). Survives encode and decode through `RisuSaveEncoder` and `encodeRisuSaveLegacy` (a 5a guard, "each through `decodeRisuSave`", not through `LoadLocalBackup` or Tauri). The fork `.bin` round trip and the upstream round trip are therefore **read or partly modelled, not run end to end**. | 5a, 5c |
| D15, D21 | Closed by deletion (5a). No test asserts them; they rest on no definition and no caller of the deleted functions remaining (commit message; Gate 1 source-read that no other caller exists, ledger row 524). | 5a |
| D16 (boot) | No archiving while an enabled V2.1 plugin exists; restore-all breaker (5d-2b). | 5c, 5d-2b |
| D18 boot liveness | The pass breaker (5d-2a) and the restore-all breaker (5d-2b), both amended by `MC-158`. **Resumable batch commits are not built** (the Orchestrator's call: only if the D20 measurement calls for them; section 6). | 5d-2a, 5d-2b |
| D19 `§` ids | `§` ids are never archived (eligibility rule; the check is `cha.chaId.startsWith('§')` in `bootArchivePass.ts`, read 2026-10-02). | 5c |
| D6, D7 (stub, trash) | Step 2 built the v2 stub. **Amended by `MC-149` 4** (the stub's trash state wins at restore for every stub) and extended by `MC-148` (upstream-made stubs are filled in; the stub keeps its own trash state). | 5a, 5d-3 |
| D17 idle reload | **Not started (step 6).** Carries are in section 14. | |
| D20 measurement | **Not started (step 7).** What step 5 added to it is in section 10. | |

The Report 49 step 5 row also lists: the stale `coldstorage` help text fixed in all languages (5a); the notice naming
the toggle it points to (5c: it names Settings > Advanced Settings and the toggle's label); progress (5c; the text is
English); the `MC-138` 1 two-device case documented for users (5d-4, with a corrected premise, section 8); the three
items marked "added after Gate 1" (the rebound checkbox, the two-device documentation, the capability gate with `uuid`
v4 and "unavailable" wording) were each checked at that sub-step's Gates.

## 3. The sub-steps

### 3.1 Step 5a (`33545c2c`): retire the 10-day archiving, add the setting, fix the restore trash rule

**What changed and why** (`MC-142`, `MC-149` 2-4, `MC-139` 4, `MC-143` 2):
- `makeColdData`, `makeColdDataForCharacter`, `makeColdDataForChat` and the plugin-storage migration are deleted,
  with their only call in `loadData` and a dead import in `globalApi.svelte.ts`. Before, on a profile whose root
  `coldstorage` was true, every boot ran `makeColdData` (commit message). Every read, restore, backup and clean-up
  path for existing archives is unchanged apart from the trash rule. Legacy inline plugin storage stays inline.
- The new root key `archiveCharacters` has three states (absent and `true` are on; `false` is the opt-out). The
  checkbox (`adv.coldstorage`) reads it as `!== false` and writes only it, so rendering the page writes nothing.
  Label "Archive characters at startup"; help text rewritten in seven languages; the settings search finds it under
  "cold storage" and "archive" (an optional Gate 2 item the Orchestrator applied).
- **Root `coldstorage` is untouched** (`MC-149` 2): its first-launch default, type and gate on the startup clean-up
  stay. No UI changes it now, so on profiles where it is true (no-plugin profiles by default) the startup asset sweep
  **and the remote-block clean-up** do not run; the manual clean-up handles assets (`MC-139` 3). The remote-block
  clean-up part was a Gate 1 note for the maintainer (ledger row 524); the question text for `MC-149` 2 had said so
  (the Orchestrator's log).
- **The restore trash rule** (`MC-149` 4): at restore the stub's trash state wins for every stub. The rule only
  clears a trash time the stub lacks; it never adds one. This departs from upstream on purpose. Upstream archived
  trashed characters into stubs with no `trashTime`, and at HEAD opening such a stub put the unit's old `trashTime`
  back; the startup purge (`checkNewFormat`, trash older than 3 days) then deleted it (TRACED in the step 5 scoping;
  the upstream side was read in `upstream/main` by the Orchestrator, row 522).
- The `alertClear` that `makeColdData` ran just before `loadedStore` goes with it (Gate 2 found removal harmless).

**Invariants** (5a plan section 2): D15 and D21; every existing archive restores as before except the trash rule;
the checkbox shows the new key and viewing writes nothing; toggling never writes root `coldstorage`; a restored
character's `trashTime` equals the stub's at install, for fork v2 and upstream v1 stubs; `archiveCharacters: false`
survives encode and decode; boot is otherwise unchanged.

**Gates.** Gate 1 (`adversarial-reviewer`): [APPROVE], no blocking finding; it ran a scratch Vite plugin that rewrote
`applyStubStateOnRestore` to the plan's rule in memory over 169 test files and exactly the three guards the plan named
failed (RUN; ledger row 524). Gate 2 (`opus-reviewer`): round 1 [EDITORIAL] (three false test comments), round 2
[APPROVE]; the commit message was [EDITORIAL] (three WRONG claims, four overstated or incomplete) and was corrected
(row 525).

**Tests.** 13 tests fail on the pre-change code on their value assertions, executed by Gate 2 through a scratch config
serving the old `coldCharacter.ts` and `advancedSettingsData.ts`: 3 for the trash rule (at `applyStubStateOnRestore`,
`restoreColdCharacterByChaId` and `changeChar`, replacing three guards that pinned the old rule) and 10 for the
checkbox (3 through `getSettingValue`, 7 mounted through the real `SettingCheck`); 103 passed in that run (RUN).
Seven guards pass before and after: one binding guard and six that check the key survives the encoders. Deleted with
the code: `coldstorageArchive.test.ts`, `coldstorageArchiveV21.test.ts`, `coldStorageChatIdentity.svelte.test.ts`
and the F4 describe in `coldStorageDeletionGuards.svelte.test.ts`; the invariants they pinned for an archive pass were
recorded for 5c (`5c-carried-invariants.md`; Live-State). 35 test files dropped a `makeColdData` mock entry and four
bootstrap tests dropped their `coldstorage.svelte` mock; `pluginRestoreAllBoot` was rewritten around `loadPlugins`
alone and is a guard. No mutant is recorded for 5a other than Gate 1's in-memory rewrite above.
**Final check:** 228 files, 3871 passed, 4 skipped; `pnpm check` 0/0 (Gate 2 re-ran the suite and check and got the
same numbers); the build result rests on the commit message and the Orchestrator's log only.

**Not run:** any browser, Tauri or Node server. No live check.

**Known limits.**
- Between 5a and 5c the help text described a pass that did not exist yet; nothing was archived in that interval
  (plan section 1; accepted under `MC-011`).
- `errors.coldStorageWriteFailed` and `errors.coldStorageVerifyFailed` were unused after 5a and kept for 5c; 5c removed
  them.
- The wiki's Settings-Advanced page still described the old Cold Storage setting (the Wiki session's file; section 13).
- Gate 2 optional items: comments naming the 5c pass (to re-check at 5c Gate 2); an "absent stays absent" assertion
  slightly weaker than its title.

**Dispatches** (ledger rows 522, 524, 525): scoping `investigator` ~376k tokens, 135 tool uses (row 522); Gate 1
`adversarial-reviewer` ~231k, 105 (row 524); `test-warrior` red-first ~114k, 58; `sonnet-coder` ~93k, 47;
`test-warrior` test retirement ~127k, 51; `translator` ~55k, 20; Gate 2 `opus-reviewer` round 1 ~203k, 77, round 2 ~10k,
4, commit-message check ~17k, 5 (row 525).

### 3.2 Step 5b (`448962f4`): Load Internal Backup writes the snapshot as the main save and reloads

**What changed and why** (Report 49 D3; `MC-093`, `MC-129` 4, `MC-091`):
- Before, the load installed the chosen snapshot with `setDatabase` on the live page and left the save loop to write
  it. A save already queued from the pre-load tree could land afterwards and put the old tree back in the main file; a
  snapshot holding stubs replaced full characters while the UI was open (which invariant M forbids); there was no
  cross-tab guard and no write lock (commit message).
- Now the snapshot's bytes are written unchanged as the main file and the page reloads (relaunch on Tauri), as Load
  Local Backup does; boot installs it. The snapshot is decoded with the strict decoder before anything is written
  (a damaged block, a missing remote block, an unrecognised format or a non-object result refuses the whole load).
- On web with Web Locks the load takes the exclusive hold with Load Local Backup's 2-second timeout and refuses with
  the existing other-tab message if another tab is open. Without Web Locks it asks the existing no-lock confirm and
  takes `dbWriteLock` directly, as Tauri does. After the write lands, `noteMainFileBytes` records the bytes and the
  write lock stays closed until the page is gone. The busy refusal runs before the picker, after it, and with no await
  before the write.
- **The load waits for the startup clean-up** (`cleanChunks`, started un-awaited at boot). It deletes a legacy
  `remotes/<chaId>.local.bin` block once its character has been absent from the live database for 7 days; without the
  wait it could delete a block the snapshot references between validation and write (Gate 1 B1; TRACED). The state
  lives in a new dependency-free module, `storage/startupCleanupState.ts` (section 7), and `bootstrap.ts` also reports
  a clean-up failure itself (Gate 2 B1).
- Four new strings in seven languages: `internalBackupListFailed`, `internalBackupUnreadable`,
  `internalBackupWriteFailed`, `internalBackupWaitingForCleanup`. The function moved from `globalApi.svelte.ts` to
  `drive/internalBackup.ts`; `backuplocal.ts` now exports `RESTORE_EXCLUSIVE_LOCK_TIMEOUT_MS` so both loads share it.
- **Behaviour change to note:** a snapshot that loaded partly before is now refused as a whole (a damaged block, or a
  legacy remote block the startup clean-up already deleted). The maintainer wants an option to load the intact data
  (`MC-152`; CHORE-59, section 12).

**Invariants** (5b plan section 3, abbreviated): I1 no runtime install (the live database is the same object after,
whatever the outcome); I2 the bytes written are the snapshot's bytes verbatim; I3 validated strictly before anything is
written; I4 nothing deletes a remote block between validation and write (the startup clean-up is the only deleter of
legacy `remotes/` blocks; `manualCleanup.ts` deletes none); I5 one writer at a time, never a second `dbWriteLock`
acquire inside the hold; I6 the snapshot is the last write (first-come, first-served mutex: a save already holding the
lock or queued ahead lands first and is then overwritten; every later acquirer never resolves); I7 other tabs; I8 busy
refusal; I9 the record follows the write; I10 reload; I11 a write failure leaves everything released and the live
database unchanged; I12 exactly one message per exit, except a user cancel and an app-initiated reload already under
way; I13 snapshots in current and upstream formats still load.

**Gates.** Gate 1 (`adversarial-reviewer`): round 1 [REJECT], round 2 [EDITORIAL] (row 527). B1: the plan's I4 was not
guaranteed, because `cleanChunks` takes no lock (verified by the Orchestrator in `bootstrap.ts`); B2: "a queued save
never lands" is false under a FIFO mutex (verified). Both closed in the revised plan. Round 2: the clean-up signal must
be a state model, a throw while listing is not "this backup is damaged", T15's "one message" needs a definition; N1 (a
partial-load option) went to the maintainer. Gate 2 (`opus-reviewer`): round 1 [REJECT], round 2 [APPROVE] (row 530).
B1: `recordStartupCleanup` attached handlers to `cleanChunks`' promise, so a clean-up rejection that the
`unhandledrejection` handler used to report was swallowed (the Orchestrator verified the handler in `bootstrap.ts`);
B2: no test drove the recording line. E1-E5 editorial, N1-N6 non-blocking. The `[REJECT]` streak was two (Gate 1
round 1, Gate 2 round 1; round 2 of Gate 1 was neutral). **The Orchestrator's second-rejection check** (`AGENTS.md`
section 4): the mechanism was not the problem, B1 and B2 were a wiring defect and a coverage gap in the new signal.

**Tests.** `internalBackupSnapshotLoad.svelte.test.ts` is new (49 tests at first) and `bootstrap.startupCleanup.test.ts`
is new. Against the old function body: 40 of the first 49 failed on behavioural assertions, as did the flipped row in
`backupLoadWhileBusy.svelte.test.ts`, 41 in all (commit message); Gate 2 round 1 re-ran it: 41 failed, 15 passed (RUN).
With the round-2 tests, the old body gives 44 failed, 15 passed (Gate 2 round 2, RUN). The guard that the write is not
double-locked inside the hold passes before the change; the evidence is a scratch mutant that double-acquires and
hangs (the Orchestrator and the reviewer both ran it). Gate 2 round 2 built its own in-memory mutants (no record of
the recording line, a stand-in clean-up, no failure report, no Buffer copy, the round-1 state): each failed the intended
tests. `globalApi.loadInternalBackup.svelte.test.ts` was deleted (it pinned the in-memory install). Gate 2 verified
the commit message: 18 of 18 claims. **Final check:** 229 files, 3921 passed, 4 skipped; `pnpm check` 0/0; build ok
(the Orchestrator's logs `full-*-r2.txt`; the first snapshot was 228 files, 3915 passed, per the Orchestrator's log).

**Not run:** Tauri `writeFile` and `relaunch`; a real Node server answering 409; two real tabs holding Web Locks; a
real page reload.

**Known limits.**
- **CHORE-55:** on Tauri the main file is written by truncate-then-write, so a failed write can leave a partial
  `database/database.bin` and the message "Your current data was not changed." would then be untrue. The same shape is
  in `LoadLocalBackup` and `saveDb` (Gate 2 N2; INFERRED from the plugin source, not run). Filed, not fixed.
- The clean-up wait, lock acquisition and confirm run outside the `try`, as in `LoadLocalBackup`; "Loading backup..."
  and the success text stay English, as there (Gate 2 accepted both deviations).
- On Tauri and without Web Locks the directly held `dbWriteLock` stalls autosave during read and decode. A load queued
  behind this tab's own exclusive operation waits with no timeout, as `LoadLocalBackup` does (plan section 4.1).
- The 2-second other-tab timeout can refuse falsely (plan R4).

**Dispatches:** Gate 1 `adversarial-reviewer` round 1 ~215k tokens, 54 tool uses; round 2 ~255k cumulative, 68 in total
(row 527). Gate 2 `opus-reviewer` round 1 ~249k, 87; round 2 ~314k cumulative, 26 more (row 530). Remediation
`test-warrior` ~189k, 49; `sonnet-coder` ~76k, 31 (row 530). **From the Orchestrator's log only** (no ledger row):
pre-step A `sonnet-coder` (a pure move to `internalBackup.ts`), `test-warrior` red tests ~281k, 84; `sonnet-coder`
~113k, 32; `translator` ~45k, 8.

### 3.3 Step 5c (`9b312962`): the boot archive pass

**What changed and why** (D1, D2, D3, D9, D10, D14, D16, D19; `MC-142`, `MC-148` (5d), `MC-149`, `MC-132` 2,
`MC-091`):
- **When the pass runs** (commit message): only at the two main-file boot sites, never on a backup-fallback boot
  (`MC-149` 1), and only when the **strict** decode of the main file succeeded (a loose decode can silently drop a
  block, and a commit would make that loss permanent). Web: Web Locks plus OPFS writes or the Node server. Tauri:
  desktop only. Not on a stale account-sync profile, not when `formatversion` is below 5, not while an enabled V2.1
  plugin exists, not when `characters` or `botPresets` is not an array, not when archiving is off.
- **What it archives:** full, untrashed characters and groups whose `chaId` does not start with `§` and that no other
  slot shares after the id repair, in list order. Each unit is written, read back, and the stub is built from the
  read-back. A failed write or read-back stopped archiving (5d-1 changes this); characters archived before it were
  committed and a notice named the character.
- **The commit:** the tree gets the container defaults `setDatabase` would give it (an upstream save written between
  2025-08-05 and 2026-03-30 has no `loadouts` block, Gate 1 B2); a fresh encoder runs `init` then `set`, like `saveDb`'s
  first save; `init` takes an optional `enableRemoteSaving` input so a remote-saving profile keeps its remote blocks
  before the live database exists (section 7); `checkCommittedBlocks` verifies the encoded file's own blocks without
  reading any remote file; on any failure the result is discarded and the main file re-read (rules below);
  `noteMainFileBytes` records the committed bytes; nothing is written when nothing changed.
- **The key and notice:** when the key is absent and the pass can run, the commit writes `true`, and a one-time notice
  posted right after install and awaited says where to turn archiving off (this is where `MC-149` 3 left an
  implementation call to the step 5 report; section 6). `setColdStorageItem` now logs the key, not the character.
  `checkNewFormat`'s per-character defaults moved into `characterDefaults.ts`, shared with the pass. The two unused
  cold-storage error strings are removed.

**Invariants** (5c plan sections 2-3; `P` = pass-wide, `E` = per slot, `I` = invariant):

| Id | What must hold |
|---|---|
| P0 | The strict decode succeeded. If it throws, the boot decodes as today and installs that tree with no pass (Gate 1 B1: a loose decode can drop a block whose checksum fails, a character whose JSON does not parse, a remote character whose read fails, or the PLUGINS block). |
| P1-P7 | Main-file boot (not backup fallback); capability and, on web, the hold; not a stale-account profile; `formatversion` a number of 5 or more; no enabled V2.1 plugin (V2.0, V3 and disabled V2.1 do not block); `characters` is an array; `archiveCharacters !== false`. |
| E1-E6 | A slot is archived only if it is a non-null object, full, not trashed, has a non-empty string `chaId` not starting with `§`, no other slot holds that `chaId`, and it is not in the keep-inline set (an optional `keepInline` input; the 5c boot never supplies it). |
| I1 | Exclusive access (web, Node, Tauri), as in section 2. A null grant means no pass this boot; a reloading page does not continue into a pass. |
| I2 | Unit before pointer: a stub enters the tree only after its unit was written and read back as `ok` with an equal `chaId`. |
| I3 | Commit or nothing: any failure after the pass starts mutating the tree discards its result and re-reads the main file through the normal adopting read; no pass failure can send the boot to a backup while the main file decodes. **Per host (as amended at Gate 2 B1):** on web and Node a re-read that throws or returns nothing stops the boot with the error and writes nothing; bytes that do not decode take the web backup-fallback path; Tauri writes the pre-pass bytes back and re-reads, then falls back. |
| I4 | The commit is checked before it overwrites the main file: exactly one character block per `chaId`, in order, each archived slot a stub carrying its unit key, the container blocks present, every `__directory` entry has its block; no remote file is re-read and no second decoded copy is held. |
| I5, I7, I8 | The installed tree equals the committed tree; the committed tree has the container defaults and is what `saveDb` would write; no commit when nothing changed. |
| I6 | With a truthy `enableRemoteSaving` on Tauri or Node, character blocks are written remote, as `saveDb` does; with the input absent every existing caller behaves as before. |
| I9-I15 | A stub is never archived twice; order is kept; trashed slots stay full; the placeholder chat has an id; the V2.1 interlock; one malformed slot never stops the pass; pointer chats and legacy error-text chats are carried unchanged. |
| I16-I18 | Unit ids are `uuid` v4 (never `crypto.randomUUID()`); ids are repaired before eligibility and the repaired tree is the one committed and installed; the unit holds the character as memory would after install. |
| I19 | The one-time notice shows when the boot read a tree without the key and the installed tree holds `true`; `true` and `false` are never rewritten. |
| I20-I23 | Nothing after `loadedStore` creates a stub; progress text while archiving; at most one full character beyond the tree is held by the pass; the pass runs at most once per page load. |

**Gates.** Gate 1 (`opus-reviewer`): round 1 [REJECT], round 2 [EDITORIAL] (rows 534, 535). B1: the pass committed
whatever a loose decode produced; B2: the pass's own check rejected the encoding of any tree without `loadouts` or
`modules`, which is every upstream `formatversion` 5 save written 2025-08-05 to 2026-03-30, so those profiles would
write a full orphan set on every boot; B3: the test plan labelled scenarios red-first that pass at HEAD. Round 1
confirmed B1 and B2 by a diagnostic against the real encoder and decoder (RUN). Round 2: two plan statements corrected.
Gate 2 (`opus-reviewer`): round 1 [REJECT], round 2 [EDITORIAL] (row 544). B1: on web a re-read that threw after a
failed commit returned `backup-fallback`, so `loadData` would install the newest `dbbackup-*.bin` with no alert while
the main file was intact, and the first save would write that backup over it (diagnostic D1 confirmed it, RUN); B2: the
Node rule "a re-read that returns nothing stops the boot" had no test. Round 2 found B1 and B2 resolved and three
wording errors (E5-E7), applied by the Orchestrator. **The Orchestrator's second-rejection check:** the mechanism was
not the problem; Gate 1's B1 and B2 were missing preconditions on the pass's input, and Gate 2's two blockers were one
under-specified rule in the re-read path.

**Tests.** 151 new tests in eight files (commit message). Before the implementation (a placeholder pass module that ran
no pass, with HEAD's other files), 76 failed on their assertions and 52 guards passed; the Gate 2 reviewer read the
failure reasons and found none on an import or setup error, and the Orchestrator re-ran them (ledger row 541). Of the
tests added during review, the four for a web re-read that fails or finds nothing failed on their assertions before
the fix and the rest are guards (the 23 added are 4 red and 19 guards, `guard:`-titled; the count caveat is in
section 15). Gate 2's real-encoder diagnostics (RUN): D2 an upstream-era file commits, strict-decodes, and a second
boot writes nothing; D3 a `chaId` equal to a fixed block name is refused every time but each such boot still writes and
orphans a full unit set (carried to 5d-1); D5 a number `5` beside a string `"5"`. Mutants: the coder's own killed
every gate and failure path it listed except E5 (the shared-`chaId` rule) and P6 (a throwing variant of the
`characters` gate, which the failure path turns into the same outcome; a non-throwing variant is killed). Gate 2 round 1
built mutants for the reloading gate, the outer-catch release, the Node null re-read, the pointer-name clause and the
container-shape clause, and six non-equivalent ones survived; **all ten of round 2's mutants were killed after the
remediation** (rows 542, 544). **Final check:** 239 files, 4077 passed, 4 skipped; `pnpm check` 0/0; build ok (Gate 2
round 2 re-ran the suite and check with the same numbers).

**Not run:** Tauri; a real Node server; a browser's OPFS and Web Locks (commit message).

**Known limits.**
- The pass's tests use the Node-server stand-in and an in-memory OPFS directory; none says anything about Tauri.
- A deterministic pass failure repeated every boot and orphaned a full unit set each time (Gate 2 N3); 5d-1 and 5d-2a
  bound it.
- A discarded pass leaves `risuSaveBlock_<chaId>` cache entries holding stubs until `saveDb`'s `init` rewrites them;
  each points at a verified unit, so it is not a loss path (Gate 2 N4).
- On Tauri a failed commit followed by an undecodable re-read writes the pre-pass bytes back; Tauri's main-file write
  is the non-atomic one in CHORE-55.
- `console.log(decoded.tree)` in the boot, present before this step, keeps the whole tree reachable from an open
  console on boots that archive nothing (Gate 2 N5; the commit also changed `setColdStorageItem`'s own log for this
  reason).
- **Step 6 dependency** (Gate 1 round 2 N5): a pass skipped after an idle reload (the short grant timeout, or another tab
  holding the lock) releases nothing, so step 6 must check that the post-reload pass actually ran.
- Coder deviations from the plan that Gate 2 accepted: the `botPresets` array gate, container blocks parsed in full only
  up to 4 MiB, no recomputed payload checksums, the byte-equal inline stub check, the `parseBlockHeader` extraction
  with the decoder unchanged, `tauriOs.type()` with a user-agent fallback, and a web `sleepForever()` on a reloading
  refusal.

**Dispatches** (rows 534, 535, 541-544): scoping refresh `investigator` ~364k tokens, 124 tool uses (row 534); Gate 1
`opus-reviewer` round 1 ~284k, 66, round 2 ~323k cumulative, 10 more (row 535); `test-warrior` ~465k, 122, ~540k
cumulative at the last run, 34 more (row 541); `sonnet-coder` ~368k, 106, ~399k cumulative, 31 more (row 542);
`translator` ~51k, 13 (row 543); Gate 2 `opus-reviewer` round 1 ~342k, 90, round 2 ~384k cumulative, 21 more (row 544).

### 3.4 Step 5d-1 (`e8cf50de`): refuse before writing, skip an unwritable character, keep a Node commit under the limit

**What changed and why** (`MC-158` 2; Report 49 D1 Node limit; D2 amended; ledger row 551 P-D and P-E):
- **Refused before anything is written.** After the id repair, the pass checks the tree it would commit. It writes
  nothing, encodes nothing and posts nothing (one console warning without character data) when a `chaId`, as a string,
  is one of the seven fixed block names (`root`, `preset`, `modules`, `loadouts`, `plugins`, `pluginStorage`,
  `config`), equals another character's, is `__proto__`, is longer than 255 UTF-8 bytes or does not survive UTF-8, or
  when `modules`, `plugins` or `loadouts` is not an array. Each made the commit fail on every boot after every eligible
  character had been written to its own unit. A character stored as an array is not eligible.
- **One character that cannot be stored is skipped.** A failed write, or a read-back that is not `ok` or names another
  `chaId`, leaves that character full and the pass goes on. The user is told once, naming the characters, and the
  device does not try them again at startup until the setting is turned off and on. **Two failures in a row** (full
  storage, a server that stopped answering) stop archiving for that start, and those two are not remembered (the
  Orchestrator's bound, section 6).
- **The Node limit.** A commit larger than 104,857,600 bytes is not sent; the main file is installed as it is, the user
  is told the save is too large to archive into, and later starts on this device do nothing until the setting is turned
  off and on. The limit lives in `server/node/bodyLimit.cjs` and `server.cjs` uses it for its three body parsers (both
  read 2026-10-02).
- **What is remembered** lives in `localStorage` on this device (keys `archivePassSkipped`, `archivePassTooLarge`) and
  is written only after its notice has been shown, so a start that fails before showing it remembers nothing. Turning
  the setting off, or any start that reads it as off, clears it.
- The stopped notice no longer promises a retry at the next start; two new notices (skipped, too large) in seven
  languages.

**Invariants** (5d-1 plan section 2): J1 the refusal is evaluated after the repair on the tree the commit would encode
and is a pure function of the tree; J3 an isolated unit failure leaves the slot full and the loop continues; J4 two
consecutive unit failures stop archiving for the boot, commit what was archived, and are not memoised; J5 and J7 one
memo rule for every memo: the pass never writes a memo, bootstrap writes it only after posting the notice that carries
it; while the too-large memo is set the pass is a no-op on this device (no unit, no encode, no commit, no re-read, no
notice, even with the key absent); J8 the limit is accepted when `length <= limit` (the raw-body rule) and a test pins
the client's copy to the server module's value; J9 both memos clear when the setting is turned off and on every boot
whose decoded tree has `archiveCharacters === false`; J10 a profile with no refusal, failure or memo entry commits the
same bytes as 5c; J11 no host other than the Node server applies the limit rule.

**Gates.** Gate 1 (`opus-reviewer`): round 1 [REJECT] (F1-F11), round 2 [REJECT] (N1-N7), round 3 [APPROVE] (row 558).
F1: the refusal's evaluation point; F2: skip-and-continue under a systemic failure would memoise every remaining
character and leave one empty OPFS file each; F3: a skip's memo and its notice could come apart; F5: the Node limit
without a memo repeats every boot. Round 1's real-encoder scratch run (RUN) showed a fixed-name `chaId` losing presets,
modules or a character silently at encoder level and a 256-byte `chaId` giving a header that cannot be walked; that
became **CHORE-61** (section 12). Round 2's two majors were the same defect class as F3 and F5, so the memo rule was
made single and host-independent (the Orchestrator's second-rejection check). Gate 2 (`opus-reviewer`): [EDITORIAL],
corrections applied (row 563): the commit message's Node-limit and test accounts, a `bodyLimit.cjs` comment that said
the client takes its number from that file, the `archiveAndCommit` doc, four test labels, a vacuous guard whose harness
never read `localStorage`, a test header.

**Tests.** Written before the change. Against the previous pass (commit message): refusal tests 20 failed, 3 guards
passed; skip tests 14 failed (12 on the number of writes, 1 on the notices, 1 on the array slot); Node-limit tests 4
failed on the main-file write, 1 on the copies written, 1 on the missing `fitsNodeBodyLimit`, 5 guards passed; the memo,
host-binding, setting and bootstrap tests for the new pieces failed. `bootArchivePass.failures.test.ts` C1 and C2
(which pinned "archiving stops at the first failed character") are removed. The Orchestrator re-ran refusal and skips
against HEAD: 34 failed (20 and 14) (RUN). Gate 2 ran 22 scratch mutants: 19 killed; M23 (the stopped notice posted
before the skip notice), M24 (the memo read's catch removed) and M25 (the stopped notice naming the first of the two
failures) survived and were killed after `test-warrior`'s corrections (rows 563, 565). **Final check:** 248 files, 4157
passed, 4 skipped; `pnpm check` 0/0; build ok on the first snapshot (4156 passed), not re-run on the final tree.

**Not run:** Tauri, a real Node server, a browser's OPFS and Web Locks.

**Known limits.** Two unwritable characters next to each other in the eligible order stop archiving there on every
start (J13); 5d-2a counts such a start as a failed pass only when the pass archived nothing (section 3.5). The test-warrior's report
existed only in its hand-back (it could not write a file).

**Dispatches** (rows 551, 558-565): scoping `investigator` 290,362 tokens, 127 tool uses (row 551); Gate 1 `opus-reviewer`
round 1 209,017, 52, round 2 230,167, 57, round 3 244,383, 61 (tokens cumulative for the resumed instance; row 558);
`test-warrior` 274,314, 81 (row 559); `sonnet-coder` 202,761, 87 (the Orchestrator's log said about 60; the ledger holds
the harness figure; row 560); `translator` 53,044, 15; `test-warrior` fixture fixes 297,041 cumulative, 21 in the resume;
Gate 2 `opus-reviewer` 238,692, 61 (row 563); `sonnet-coder` comment fixes 44,082, 13; `test-warrior` corrections
90,525, 34.

### 3.5 Step 5d-2a (`29bf2f24`): the pass breaker

**What changed and why** (Report 49 D18; `MC-158` 1, "Retry once, then pause"):
- Before the pass writes anything (its first unit, or the commit of the setting's key alone), it records on this device,
  in `localStorage` (key `archivePassStrikes`), that a pass has started. A pass that succeeds clears the record.
  **Success** means the pass returned without an error and either archived at least one character or did not stop on
  two failures in a row; a pass that only skipped single characters also succeeds. Every other pass that started stays
  counted: an interruption (a closed or killed tab, out of memory, a reload), an error (the encoder, the block check, a
  refused main-file write including a 409, or a commit over the Node limit), and a stop on two failures in a row that
  archived nothing, even when the key alone was committed.
- With two counted in a row the pass writes nothing on this device and tells the user once (the paused notice). Turning
  the setting off, or any start that reads it off, clears the count and the "told" record together with the 5d-1 memo.
- The notice is posted on the start whose own failure made the count two, last after the other notices; otherwise at
  the next start (an interruption, a re-read failure, a fall back to a backup, a notice never posted). It is not added
  when the same start posts the too-large notice. The "told" record is written only after the notice is posted.
- Check order inside the pass: the too-large record, then the count, then the refusal rules, then eligibility, then the
  start record, and the start is recorded only when the pass will write. A count that cannot be read, or a start record
  that cannot be written or read back, stops the pass for that start without writing anything (fail closed); a stored
  count that is not a whole number reads as paused.
- One new notice, in seven languages. Nothing in the save, its format or its units changes.

**Invariants** (5d-2a plan section 3, with the v2 corrections): K1 counting starts before writing, and a boot that
writes nothing leaves no new record; K2 success resets; K3 failure keeps the strike; K4 two in a row pauses (no unit, no
encode, no commit); K5 told once, at the first boot that knows; K6 the toggle resumes (return to origin: off, then on,
then a boot with eligible characters runs the pass from a zero count); K7 unreadable state fails closed; K8 nothing else
changes, and no character data goes into the new keys; K9 step 6 can read the paused state synchronously.

**Gates.** Gate 1 (`opus-reviewer`): round 1 [REJECT] (F1-F8), round 2 [APPROVE] (row 569). F1: the breaker needed one
success predicate, so that a key-only commit after a 5d-1 two-failure stop with nothing archived counts as a strike (the
Orchestrator verified the code path); F2: the fail-closed tests had to be written where they can break; F3: red claims;
F4: a fixed order of checks; F5: the plan's stated reason for installing the repaired tree on a paused boot was false (the
Orchestrator verified in `bootstrap.ts` that `assignIds` repairs ids on every boot, so it is consistency, not safety).
Gate 2 (`opus-reviewer`):
[EDITORIAL], 32 of 32 mutants killed (row 574); corrections to comments, a test header and title, the German notice
wording and the commit message.

**Tests.** Written before the change. Against the previous pass, 140 of the new tests failed and the guards passed
(commit message): pass tests 54 failed, 11 guards; fail-closed tests 20 failed; bootstrap and setting tests 10 failed, 6
guards; memo-module and host-binding tests 56 failed, 1 guard. The Orchestrator re-ran seven files against HEAD: 140
failed, 44 passed (RUN). That the memo tests test behaviour was shown against a throwaway implementation with a
fail-open count read (3 failed) and with garbage read as no strike (22 failed). 17 mutants in the `test-warrior`'s swap
config plus 15 added by Gate 2: 32 of 32 killed by an in-memory transform. **Two existing tests are corrected:** in the
test environment a spy on `Storage.prototype` stops intercepting `localStorage` once a method has been called, so the
guard that a throwing `localStorage` write does not stop the boot or its notice asserted nothing (shown by the
`test-warrior` and re-run by Gate 2); it now spies on the instance. The Tauri test that a boot never reads the upstream
account keys also spies on the instance. **Final check:** 252 files, 4315 passed, 4 skipped; `pnpm check` 0/0; build ok
before Gate 2's editorial edits, not re-run after them.

**Not run:** Tauri, a real Node server, a browser's OPFS and Web Locks, a whole-browser crash.

**Known limits** (commit message): a pass whose commit reached the server but whose response was lost stays counted
until a later pass succeeds, so one more failure then pauses (the R3 family); a crash within the browser's storage flush
delay after the start record can lose that record. **Consequence of counting a 409** (plan C2): a second device that is
saving during two consecutive passes pauses archiving on this device until the toggle. Report 49 D1's "every other boot"
bound assumed a breaker that resumes by itself; the sticky pause replaces it (ledger row 566 qualified the bound).
`localStorage` persistence across launches on Tauri is INFERRED (plan O5). A restored `.bin` keeps this device's pause
(plan O4).

**Process note.** The `sonnet-coder` made and deleted a temporary Vitest config (`zz-swap`) in the repo root, against
the rule to keep scratch files in the scratchpad; the file was gone when the Orchestrator looked and Gate 2 found the
root clean (row 572). The Orchestrator changed the Korean wording "다시 시작하기 전까지는" to "재개하기 전까지는" (it
could be read as "until you restart") and, after Gate 2, the German wording to "Bis Sie es fortsetzen".

**Dispatches** (rows 566, 569-574): 5d-2 scoping `investigator` 201,182 tokens, 77 tool uses (row 566; it recommended the
a/b split); Gate 1 `opus-reviewer` round 1 171,200, 38, round 2 191,122, 43 cumulative (row 569); `test-warrior` 285,224,
101 and a spy follow-up 330,253 cumulative, 141 cumulative (rows 570, 571); `sonnet-coder` 168,370, 64 (row 572);
`translator` 48,256, 12 (row 573); Gate 2 `opus-reviewer` 232,598, 73 (row 574).

### 3.6 Step 5d-2b (`4d23b1b4`): the V2.1 restore-all breaker

**What changed and why** (Report 49 D18 as amended by `MC-158` 5, "Turn the plugin off"; `MC-132` 2, `MC-146` 4): an
enabled V2.1 plugin makes the app restore every archived character before the plugin loads; at a start only the
loading screen shows meanwhile. A page that dies during that restore cannot repeat it on every start.
- Before the restore reads its first character it adds one to a count kept on this device (`localStorage` key
  `v21RestoreAllStrikes`). When the restore ends, finished or thrown, the count goes back to zero, before any notice
  that waits for the user. **Every restore counts**, not only the one at a start: also those run when a plugin is turned
  on or off, deleted or imported, and those the plugin APIs start. Overlapping restores in one page count once and only
  the last to end resets. A restore that throws is not counted (the app opens and the plugin settings can be reached).
- When an enabled V2.1 plugin is present, at least one character is archived and the count is 2 or more, the app does
  not restore. It turns off every enabled V2.1 plugin, tells the user once which ones (by the name the plugin settings
  show), waits for the notice, and then loads the other enabled plugins, so V3 plugins still load.
- The count is not cleared by the switch-off (that change reaches the save only with the next save). It is cleared when
  the user turns a V2.1 plugin on in the plugin settings (the toggle is now one exported function,
  `togglePluginEnabled`), and by any start whose installed database has no enabled V2.1 plugin, just before the plugins
  load. Those clears write `'0'` and only when the stored value is not already `'0'`, so a profile that never had a V2.1
  plugin never gets the key.
- **This count fails open**, unlike the pass's: a count that cannot be read or written lets the restore run uncounted
  with a warning, and a non-integer reads as 0. Its key is separate from the pass's keys and neither clears the other.
  The only saved change is the plugin's existing `enabled` flag.

**Invariants** (5d-2b plan with the v2 corrections): R1 start record before the first unit read and reset in a
`finally` before any waiting notice (an in-flight counter for overlapping calls); R2 the trip needs an enabled V2.1
plugin, a count of 2 or more and at least one archived character; R3 turning a V2.1 plugin on clears the count before
`loadPlugins` runs; R4 a profile with no enabled V2.1 plugin never reads the count, except the boot clear; R5 separate
keys.

**Gates.** Gate 1 (`opus-reviewer`): round 1 [REJECT] (F1-F9), round 2 [EDITORIAL] (row 575). F1: a trip when no stub
exists; F2: where the reset sits and where test T6 can be hosted; F3: a stale count across devices (the boot clear was
adopted); F4: the toggle's clear was untestable as inline code; F5: the reason for failing open (the Orchestrator
verified that an unguarded `localStorage.removeItem` earlier in `bootstrap.ts` aborts the boot); F6: a post-restore
out-of-memory gap; F7: overlapping calls. The F3 window is disclosed, not closed, and the reviewer agreed. Gate 2
(`opus-reviewer`): round 1 [EDITORIAL], round 2 [EDITORIAL] (row 580). Round 1 traced that the switch-off reaches the
file on every backend (boot trip: `loadPlugins` runs before `saveDb`; mid-session: the plugins effect marks the
tracker), ran 37 mutants and **35 were killed**; the two survivors (the notice naming the internal name instead of the
display name; the start-write failure warning satisfied by the reset's warning) were killed by one added and one
tightened test (row 581). Required wording fixes: the title and notice said "starts" when every caller counts; a line
said V2.0 plugins "still load" (a V2.0 entry never loads); the saved-data sentence; the guard count; a test header.

**Tests.** Against the previous commit, 39 of the 56 new tests failed and the other 17 (all guards) and the 11 existing
tests passed (commit message). 32 failed on behaviour (no start record, no reset, no warning on broken storage, the
plugin not turned off at a count of 2, the count not cleared at a start with no enabled V2.1 plugin); 7 failed only on
the missing `togglePluginEnabled` export, and Gate 2 confirmed those against the real code with behavioural mutants. The
Orchestrator re-ran them at `29bf2f24`: 39 failed, 28 passed (RUN). **Final check:** 254 files, 4372 passed, 4 skipped;
`pnpm check` 0/0; build ok on the first snapshot (4371 passed), not re-run on the final tree.

**Not run:** Tauri, a real Node server, a browser's OPFS, a real tab kill or out-of-memory.

**Known limits** (commit message, Gate 2): the count is per device but the plugin's on/off is in the save, so turning
it off reaches every device that shares the save; a device whose count reached 2 still turns the plugin off at its next
start if the user turned it back on elsewhere before that device started once with it off, or restored a `.bin` with it
on (the F3 window); a restore running in one tab can count toward a trip in another that starts meanwhile (Gate 2 O1);
a page that dies **after** the restore (the plugin's code, the format check or the first save) is not counted and this
does not stop that loop; a crash within the flush delay can lose the start record. Gate 2 optional items not changed:
O6 (a header sentence), O7 (a null plugin entry makes a tripped boot throw out of `loadPlugins`; the boot's catch
swallows it, and the old code failed the same way), O8 (the test comment "an instance spy outlives `vi.restoreAllMocks()`" was not verified by the reviewer; vitest 4.1.2's
`restoreAllMocks` restores `spyOn` spies in general, so the comment may be specific to happy-dom's `Storage` and is
harmless either way).

**Process note.** The `translator` wiped and restored the six language files from HEAD mid-run; the Orchestrator
verified +2 and -0 lines in each, CRLF kept, no BOM, and that the tree had held no earlier language edits (row 578).

**Dispatches** (rows 575-581): Gate 1 `opus-reviewer` round 1 169,123 tokens, 45 tool uses, round 2 184,357 cumulative, 51
(row 575); `test-warrior` 267,995, 85 (row 576); `sonnet-coder` 110,027, 47, with the fix-up 112,734, 53 (row 577);
`translator` 64,884, 18, then 44,470, 19 for the reworked first sentence (rows 578, 579); Gate 2 `opus-reviewer` round 1
236,409, 61, round 2 255,137 cumulative, 11 more (row 580); `test-warrior` O2 and O3 tests 56,985, 16 (row 581).

### 3.7 Step 5d-3 (`3fca470e`): fill in upstream-made placeholders at startup, also with archiving off

**What changed and why** (`MC-148`, `MC-158` 3): characters archived by upstream are placeholders with no real type,
member list, last-used time, description or chat count (a group shows as a character, the mobile list sorts them
without a last-used time, the grid shows "No description", the chat count is 1). The startup pass now reads each such
placeholder's archived copy once and fills those in, also when archiving is off.
- A placeholder is filled in only when its archived copy reads back as a character with the same id. It keeps its own
  name, image, ids, unit key, list of archived chats and **trash state; the archived copy's trash time is never
  copied** (the startup purge of characters trashed more than three days ago runs right after the pass, and upstream
  archived trashed characters without a trash time on the placeholder). A filled-in placeholder is marked current
  (`coldVersion: 2`) and its copy is not read again. One whose copy is missing, unreadable or has another id gets
  nothing and is read again at the next start.
- With archiving on, the fill-in runs in the same pass and commit, before any character is archived, and the 5d-2a
  breaker counts the pass; its start is recorded before the first copy is read. **Filled-in placeholders never count as
  a successful pass**, so a device whose every archive write fails still pauses. A paused device fills in nothing.
- With archiving off, the pass archives nothing, writes no unit, keeps the setting off, posts no notice, writes no
  archive record and writes the save only when it filled something in. A profile with archiving off and no upstream
  placeholder is untouched. Failures are bounded by their own count on this device (`localStorage` key
  `stubEnrichStrikes`, which the archiving-off start clear leaves alone): one failed or interrupted attempt is retried at
  the next start; after two in a row the fill-in stops on this device with a console warning. Changing the archiving
  setting in Settings, either way, clears it. A count that cannot be read or written means no fill-in that start.
- Every gate of the pass applies: no fill-in on a backup-recovery start, on a host where the pass does not run
  (plain-HTTP Node, a browser without OPFS writes, Tauri mobile), without the exclusive hold, with an enabled V2.1
  plugin, or on a save the pass refuses. `plugins.md` and `risuai.d.ts` no longer say an upstream placeholder's type is
  always `'character'`.

**Invariants** (5d-3 plan section 2): I1 fields (real `type`, member list, `lastInteraction` when a number, bounded
description as `creatorNotes`, chat count, `coldVersion: 2`; every other field keeps the stub's value); I2 trash kept
exactly; I3 a missing, errored, non-character or mismatched copy gets no field; I4 once; I5 an archiving-off profile
archives nothing, writes no unit and no notice, never writes the four archive keys, and writes the main file only when a
stub was enriched; I6 on an archiving-on profile the strike start record is written after the legacy scan and before the
first unit read of the pass; I7 enriched stubs never make a pass succeed for the breaker; I8 the off-profile bound; I9
every pass gate applies except the archiving-off exit; I10 each enriched slot is in the block check's expected list with
its exact serialised stub; I11 one unit at a time; I12 only stub blocks change in content, and the whole file is
re-encoded and rewritten.

**Gates.** Gate 1 (`opus-reviewer`): round 1 [REJECT] (F1-F6), round 2 [REJECT] (F7, F8, E1-E4), round 3 [EDITORIAL]
(E5, E6) (row 583). F1: the id repair broke the byte-identical requirement; F2: guards used as reproducers and no purge
harness (mutants M1-M5 added); F7: the archive-on strike record must precede the first enrichment read; F8: the gates
were untested with an enrichable stub on and off. At the second rejection the Orchestrator found the findings were new
test and ordering gaps and the mechanism was not the defect, so a round 3 went ahead (a third [REJECT] would have gone
to `senior-advisor`). Gate 2 (`opus-reviewer`): round 1 [EDITORIAL], round 2 [EDITORIAL] (row 586). Round 1 re-verified
the red counts at HEAD through a `git archive` swap and found one surviving mutant (X6: enriched placeholders dropped
from the commit check's expected list); six tests added after the review kill it.

**Tests.** Against the previous commit (commit message): the new pass test file, 79 of 206 failed, all on behaviour; the
settings test, 6 failed on behaviour; 65 tests of the two new functions and the new count's storage failed only because
those exports did not exist (44 plus 21). After the six added tests the pass test file fails 85 of 212 against the
previous commit. One row of an archiving test table became its own guard test, titled with its real condition.
Mutants: the plan's eight (the archived copy's trash time copied; the current marker dropped or ignored; filled-in
placeholders counted as a successful pass; the archiving-off route on the archive count; notices on that route's failure
path; a placeholder changed after the commit check took its bytes; the start recorded after the reads; a gate bypassed)
are all killed; of 24 further mutants 22 are killed, and two are equivalent (a paused fill-in count that falls through
to the unreadable-count stop, and the archiving-off route reading a device memo that the archiving-off start has already
cleared). That is 32 mutants in all: 30 killed (X6 only after the six added tests) and 2 equivalent. The commit message
and Gate 2's record (M8d, X12) place the two equivalents differently (section 15). **Final check:** 255 files, 4660 passed, 4 skipped; `pnpm check` 0/0. **The build was run on the first
snapshot (4654 passed) and not re-run after the comment, string and test-only remediation** (the Orchestrator's log and
row 587); the commit message's "build ok" refers to that earlier run.

**Not run:** Tauri, a real Node server, a browser's OPFS, a real tab kill or out-of-memory.

**Known limits** (commit message): the first start that fills something in rewrites the whole save (every block
re-encoded, an IndexedDB cache entry per block, and with remote saving one existence check per full character), plus
one archived copy read per placeholder; **not measured**. Placeholders whose copy is missing, unreadable or has another
id are read again every start. On a shared Node save the fill-in moves the save's revision, so another device with the
app open stops saving on its next save (INFERRED; the commit message calls this "the existing conflict prompt", which
`MC-159` 3 corrects, section 8). On the web, a profile with archiving off can now stop at start with an error, or fall
back to a backup, if a failed fill-in save is followed by a save file that cannot be read back. A stopped fill-in is
re-armed only through Settings; a setting changed by a restored backup or another device leaves it stopped, **with no
notice**. With archiving on, two failed fill-in-only passes pause archiving. The loading-screen text of the fill-in is
English and avoids the word "Archiving" (the 5d-3 plan).

**Dispatches** (rows 582-587): scoping `investigator` 238,796 tokens, 91 tool uses (row 582); Gate 1 `opus-reviewer` round
1 226,458, 60, round 2 251,144, 5, round 3 266,357, 4 (tokens cumulative; the sum of tool uses is 69, the Orchestrator's
log said 68; row 583); `test-warrior` 333,805, 109 (row 584); `sonnet-coder` 158,074, 54 (row 585); Gate 2 `opus-reviewer`
round 1 235,563, 65, both rounds about 265k tokens and 87 tool uses (row 586); `sonnet-coder` remediation 126,768, 58
(row 587).

### 3.8 Step 5d-4 (`e7d7f093`): say when an archived character or chat cannot be read on this page or its copy may be damaged

**What changed and why** (Report 49 D1 "unavailable"; `MC-159` 1-2): a failed read of an archived character or chat told
the user "could not be loaded right now ... Please try again" (characters) or "may be a temporary problem" (chats) for
every failure that was not a missing copy. Two cases made that false:
- **No storage on this page:** the browser offers no `navigator.storage.getDirectory` at all (for example a static
  build on a plain-HTTP address). Only the browser-storage read path checks this; the Node server and the desktop app
  never take it. A `getDirectory` that exists but fails keeps the "try again" text.
- **A damaged copy:** the bytes were read but fflate reports malformed or truncated data (codes 0, 1, 2, 3 and 6 of
  fflate 0.8.2), `JSON.parse` fails on the decompressed text, or, for a chat, the decoded value is not a chat. Any other
  failure while decoding (a worker that cannot start, `RangeError`, out of memory, an error without a data code, or a
  `SyntaxError`-named error from the decompress step) stays a plain read error.
- Each case has its own text, named and unnamed for characters, and for chats on first open and after Retry on a chat
  from an older build: **8 new keys in seven languages.** The no-storage text says nothing was changed and offers no
  remedy (a different address has different storage). The damaged text says the copy may be damaged and that nothing was
  changed or deleted. After a Retry that ends as no storage or damaged, the Retry button is hidden, as for a missing
  copy.
- **Only what the user is told changes.** The reader keeps status `'error'` and the restore copy keeps `'unreadable'`,
  with the new kind beside them, so clean-up, the backup collector, backup restore, the pass, dataset export, the asset
  check, the plugin storage bridge and the group and restore-all paths decide as before. The two restore message
  selectors and the chat notices choose by exhaustive switches, so a reason without a text fails the type check. The
  chat results of `preLoadChat` and `retryLegacyColdChatLoad` gain `'unavailable'` and `'damaged'`; their only caller is
  the chat screen. A failure while merging a retried chat's side fields stays `'error'`.
- **README:** the "Saving across tabs and devices" bullet says that between two devices on a Node server there is no
  prompt: when another device or browser saves first, the first device stops saving until it is reloaded and its edits
  since its last save are lost; opening the app on the other device can be enough, because archiving at startup can save
  without an edit.
- The key count is 8, not the "about 4-6" in `MC-159` 2's option text; the wording differs from the option text in two
  further places (section 6, call 24).

**Invariants** (5d-4 plan I1-I8 with the v2 and v2.1 corrections): I1 every consumer of the read result makes the same
decision as at the parent, apart from message selection (nothing classified `error` may become `missing` or `ok`);
I2 no message claims data loss on a no-storage or damaged read, and no message claims a retry will help; I3 a plain read
error keeps today's wording; I4 the no-storage message promises no remedy that would move the data, and the damaged
message does not say retrying is pointless (the cause of undecodable bytes is not known; Gate 1 F6 refuted the
torn-read rationale: the Node server writes by temp file and rename); I5 the `missing`, `mismatch` and `ambiguous`
wording is unchanged; I6 chat messages are distinct on first open and after Retry; I7 new keys only; I8 the README text
matches what the code does.

**Gates.** Gate 1 (`adversarial-reviewer`): round 1 [REJECT] (F1-F11), round 2 [EDITORIAL] (row 589). F1: the chat result
mechanism collided with four existing pins (R2a, R2b, RL11, RL18), and a missed `{:else if}` in the chat screen would
render an empty div silently; F2: "damaged" as "decode throws" swept in a worker that cannot start and out-of-memory
errors, and an fflate error code can be `0`, so the test must be `typeof code === 'number'`; F3: the legacy Retry
button; F4: RL18. The Orchestrator verified F2's decompress passthrough, F6 and F3's template. Round 2 ran fflate 0.8.2
against 300 random byte strings, truncations of a real unit and bit flips: only codes 0, 1, 2, 3 and 6 occurred (RUN;
Node's build only, the browser Worker was not run). **Gate tier:** Report 49 section 3.4 names `opus-reviewer` for step
5's Gate 2. 5d-4 used `adversarial-reviewer` at both gates because it changes read-path classification and text, not
persistence (the 5d-4 plan; the Orchestrator's call, section 6). Gate 2 (`adversarial-reviewer`): round 1 [EDITORIAL]
(row 595), round 2 [EDITORIAL] (row 596). Round 1 re-ran the 14 test files (588 passed, 1 skipped) and `pnpm check`, ran
them against the parent's sources swapped in memory (164 failed, 424 passed: 109 on behaviour and 55 on missing
exports), and ran 50 mutants on the real code: 47 killed; m29 and m80 survived and m63 was not exercised by any test.
Findings E1-E7, O1-O5; the README bullet matched the `NodeStorageConflictError` branch. Round 2 required three
editorial fixes (N1, N2, N4) and one optional (N3); all applied.

**Tests.** Against the previous commit **162 fail: 107 on behaviour and 55 only because the new pure functions did not
exist** (commit message; the first tests gave 164, 109 and 55, and the count fell by three Node empty-body rows removed
at Gate 2 and one backup test added). Three existing tests change on purpose (R2a, R2b, RL11: a chat whose stored value
is not a chat now returns `'damaged'` instead of `'error'`). The `test-warrior` killed 29 mutants over its own reference
implementation; Gate 2's 50 are on the real code. After the review, tests were added that kill m29 (a `JSON.parse`
`RangeError` called damaged), m63 (the backup restore's final check treating a read with a kind as present) and m80 (the
Retry button enabled while a retry is pending). Round 2's 14 mutants over the current sources were all killed except
`r2_m63b`, which is equivalent (a following clause on the decoded value is false for an error read). The helper
`decodeColdStorageBytes`, left with no production caller, is removed with its two tests. The README bullet was
fact-checked by `doc-verifier` (row 594): 12 claims, 9 VERIFIED, 1 OVERSTATED ("without anyone touching it"), 2
INCOMPLETE; the Orchestrator applied the verifier's wording. **Final check:** 261 files, 4956 passed, 4 skipped;
`pnpm check` 0/0; build ok.

**Not run:** a real plain-HTTP static build; a browser's Worker decode path (Vitest uses fflate's Node build); Firefox
private mode; Safari; a real Node server for the README sentence.

**Known limits.** The backup, clean-up and abort texts that also fire on these reads are out of scope and unchanged
(plan V8). A zero-length unit reads as `missing` on a real Node server because `NodeStorage.getItem` returns null for an
empty body (Gate 2 E6), so a damaged-by-truncation-to-zero unit is not "damaged" there. The `doc-verifier` noted that the
README bullet's "Stay" case also parks the tab and the bullet does not say so (optional, not done; row 594).

**Dispatches** (rows 588-596): scoping `investigator` 182,795 tokens, 83 tool uses (row 588); Gate 1
`adversarial-reviewer` round 1 188,704, 67, both rounds 209,423 cumulative (the 78 tool uses is the Orchestrator's sum;
row 589); `test-warrior` 484,646, 213 and 490,452, 220 with the guard follow-up (the Orchestrator's log said about 460k
and 195; row 590); `doc-writer` README sentence 46,273, 16 (row 591); `sonnet-coder` 165,622, 66 (row 592); `translator`
60,683, 7 (row 593); `doc-verifier` README 116,411, 45 (row 594); Gate 2 `adversarial-reviewer` round 1 277,544, 86 (row
595); remediation `test-warrior` 149,779, 70, `sonnet-coder` 69,446, 27, Gate 2 round 2 338,374 cumulative, 28 (row
596).

## 4. Gates, tests and checks at a glance

| Sub-step | Gate 1 | Gate 2 | Red at the parent | Mutants | Final suite (files / passed / skipped); check; build |
|---|---|---|---|---|---|
| 5a | `adversarial-reviewer` [APPROVE] | `opus-reviewer` r1 [EDITORIAL], r2 [APPROVE] | 13 failed, 7 guards | none recorded beyond Gate 1's in-memory rewrite | 228 / 3871 / 4; 0/0; build per the commit message and the log only |
| 5b | `adversarial-reviewer` r1 [REJECT], r2 [EDITORIAL] | `opus-reviewer` r1 [REJECT], r2 [APPROVE] | 41 failed, 15 passed (44 / 15 with round-2 tests) | T10 double-acquire hangs; 5 reviewer mutants each caught by the intended tests | 229 / 3921 / 4; 0/0; ok |
| 5c | `opus-reviewer` r1 [REJECT], r2 [EDITORIAL] | `opus-reviewer` r1 [REJECT], r2 [EDITORIAL] | 76 failed, 52 guards (+ 4 red, 19 guards added in review) | coder's all killed but E5 and P6; Gate 2's 10 killed after remediation | 239 / 4077 / 4; 0/0; ok |
| 5d-1 | `opus-reviewer` r1 [REJECT], r2 [REJECT], r3 [APPROVE] | `opus-reviewer` [EDITORIAL] | 34 failed in refusal and skips (20 + 14); more in other files | 22: 19 killed, then M23-M25 killed | 248 / 4157 / 4; 0/0; build ok on the first snapshot (4156), not re-run on the final tree |
| 5d-2a | `opus-reviewer` r1 [REJECT], r2 [APPROVE] | `opus-reviewer` [EDITORIAL] | 140 failed, 44 passed | 32 of 32 killed | 252 / 4315 / 4; 0/0; build ok before Gate 2's editorial edits, not re-run after them |
| 5d-2b | `opus-reviewer` r1 [REJECT], r2 [EDITORIAL] | `opus-reviewer` r1 [EDITORIAL], r2 [EDITORIAL] | 39 failed, 28 passed | 37: 35 killed, then 2 killed by added tests | 254 / 4372 / 4; 0/0; build ok on the first snapshot (4371), not re-run on the final tree |
| 5d-3 | `opus-reviewer` r1 [REJECT], r2 [REJECT], r3 [EDITORIAL] | `opus-reviewer` r1 [EDITORIAL], r2 [EDITORIAL] | 79 of 206 failed (pass file), 6 settings, 65 on missing exports | 32: 30 killed (X6 only after the six added tests), 2 equivalent | 255 / 4660 / 4; 0/0; **build not re-run after remediation** |
| 5d-4 | `adversarial-reviewer` r1 [REJECT], r2 [EDITORIAL] | `adversarial-reviewer` r1 [EDITORIAL], r2 [EDITORIAL] | 162 failed (107 behaviour, 55 missing exports) | 50 on real code: 47 killed, 3 then killed; r2's 14 all killed but 1 equivalent | 261 / 4956 / 4; 0/0; ok |

**[REJECT] rounds:** 5a 0; 5b 2 (Gate 1 r1, Gate 2 r1); 5c 2; 5d-1 2 (Gate 1 r1, r2); 5d-2a 1; 5d-2b 1; 5d-3 2 (Gate 1
r1, r2); 5d-4 1; 11 in all (this writer's count from the table). An [EDITORIAL] round neither counts nor breaks a streak
(`AGENTS.md` section 4), so no sub-step reached three in a row. **The Orchestrator's second-rejection check**, which
asks whether the mechanism is the problem, was recorded at 5b Gate 2 round 1, 5c Gate 2 round 1, 5d-1 Gate 1 round 2 and
5d-3 Gate 1 round 2; each time it concluded the mechanism was not the problem.

## 5. Maintainer decisions

By id, as recorded in `Agents/Maintainer-Context.md`. Each is the maintainer's answer; where it chose the
Orchestrator's recommended option the entry says so.

| Id | Date | Decision | Landed in |
|---|---|---|---|
| `MC-148` | 2026-10-01 | The boot pass adds the real type, group members, last-used time, description and chat count to every upstream-made (v1) stub, and **the stub keeps its own trash state** (the unit's `trashTime` is not copied). After the pros and cons; the maintainer's words: "Agreed. let's add the type, group members, last-used time, description and chat count, but keep the placeholder's own trash state." | 5d-3 |
| `MC-149` | 2026-10-01 | Four answers, each the recommended option: (1) the pass does not run on a fallback boot; (2) root `coldstorage` keeps gating the startup clean-up as upstream left it, with no UI; (3) the one-time notice shows once, on the first boot where the new key is absent, with the label renamed and new help text in seven languages (**whether the notice shows on a boot where the pass cannot run was left as an implementation call for this report; section 6**); (4) the trash fix is made in step 5: the stub's trash state wins at restore for every stub, which differs from upstream | 5a, 5c |
| `MC-152` | 2026-10-01 | Load Internal Backup should offer to load the intact data of a partly damaged snapshot: "5b: yes, there should be a option to load other data that is intact." Not decided: what counts as affected, the wording, whether it is confirmed, how omissions are reported | CHORE-59 (not started) |
| `MC-158` | 2026-10-01 | Five answers, each the recommended option: (1) a failed or interrupted pass is retried once, then archiving pauses, and turning the setting off and on resumes it (amends D18); (2) a character whose copy cannot be written is skipped and the pass continues (amends D2); (3) upstream placeholders are filled in even when archiving is off (extends `MC-148`); (4) the two-device note goes in the README plus a hand-off to the Wiki session (extends `MC-138` 1); (5) after two startups in a row fail during the V2.1 restore-all, the V2.1 plugin is switched off with a notice (amends D18) | 5d-1, 5d-2a, 5d-2b, 5d-3, 5d-4 |
| `MC-159` | 2026-10-02 | (1) Two devices on a Node server: the README states the real consequence and a ticket is filed for gentler recovery on the first device (CHORE-62); (2) a restore that cannot succeed gets its own message in both cases, for characters and chats; (3, a correction) the premise in `MC-138` 1 and `MC-158` 4 was wrong (section 8) | 5d-4; CHORE-62 |

**Maintainer chat instructions that gated each commit** (Live-State): "commit 5a and docs separately when ready"
(5a); "go ahead and commit step 5b" (5b); "commit the docs for now, and then 5c when ready." (5c, pre-approved to follow
Gate 2); "commit part 1, then start the part 2" (5d-1); "commit part 2a and continue part 2b." (5d-2a); "commit part
2b, and start part 3" (5d-2b); "commit part 3 and start part 4" (5d-3); "commit part 4 and the records when ready"
(5d-4 and the records, pre-approved). The Korean strings added by 5d-1 were accepted by the maintainer ("looks good",
which closed the translator's ko particle note); the native-speaker check for the other languages stays open
(Live-State follow-up 7). The maintainer approved CHORE-62's placement on 2026-10-02 (after steps 6 and 7, before CHORE-58); recorded as
`MC-160` 1 (in the working tree; the records batch commits after this report, in the same session).

**Placement decisions that fix step 5's place in the work order** (not step 5 content): `MC-150` 4 (CHORE-53 right after
step 5), `MC-151` 3 (CHORE-43 with CHORE-54 right after CHORE-53; CHORE-55 with CHORE-51 and CHORE-52).

**Side tracks in the same window** (not step 5; listed because they landed between its commits and share its tree):
the CI and Docker rework and the updater disable (`MC-154`, `712a76ad`, `38583d3b`); the README rewrite (`MC-153`,
`9361ce1b`); the Settings links to the fork's own Terms of Service and Privacy Policy (`MC-156`, `696ba5de`, which waited
for the 5c commit because 5c's Gate 2 read `src/lang`); the legal flag on by default in every build (`MC-157`,
`a6a27df5`); the move of the wiki pages to `docs/wiki/` (`590c5995`).

## 6. The Orchestrator's own calls

**These are not maintainer decisions.** They are the Orchestrator's calls for the maintainer to confirm or overrule.
"Reported" is as the records say: Live-State marks three 5c calls as reported to the maintainer (items 2, 6 and 7 below)
and says of the 5d-1 to 5d-4 calls that the records do not show each was reported. For every item without a "Reported"
tag, the records I read do not show that it was.

*Before and across the sub-steps (the "Orchestrator's calls" in `MC-149`'s trailing note and the Orchestrator's log):*
1. **Enrichment "whenever the pass runs and commits, including when archiving is off."** Contradicted by the 5c code
   (`runPass` returned when `archiveCharacters` was false) and a pinned test; `MC-148` was silent on that case (ledger row
   551, P-C). It became a maintainer question and `MC-158` 3 settled it.
2. **The encoder gets an optional `enableRemoteSaving` input** as an `MC-091` technical prerequisite; `MC-133` 2 says the
   encoder is not rewritten (section 7). Reported (Live-State).
3. **The pass skips its commit when nothing changed** (5c I8). The id repair alone is not a change worth a commit.
4. **Breaker only in step 5; batch commits only if the D20 measurement calls for them.** Report 49 D18 says the
   mechanism is "chosen by measurement" (resumable batch commits, or a crash-loop breaker); the resumable batch commit
   is not built.
5. **`loadInternalBackup` gains `LoadLocalBackup`'s other-tab refusal.** `MC-093` chose refusal over a warning for a local
   restore; the same hazard applies to the internal load (5b plan section 1).
6. **The second-tab wait.** The log's list said "accept the 5-second second-tab delay"; at 5c Gate 1 (E1) this was
   found to be the Orchestrator's call and not `MC-149`'s, and the pass was given a **short exclusive-hold grant timeout
   of about 1 s** (`HOLD_TIMEOUT_MS`) instead of the 5 s default (`acquireExclusiveStorageMigrationLock`). A second tab
   skips the pass rather than waiting; a tab whose previous page is still unloading may skip it for that boot, which
   costs only a later archive. Reported (Live-State).

*5a to 5c, and the gate tiers across the step:*
7. **The one-time notice rule** (the implementation call `MC-149` 3 left for this report). The notice shows on the first
   boot where the key is absent **and the pass can archive** (a capable host, a main-file boot, a complete decode,
   `formatversion` 5 or higher, no enabled V2.1 plugin, not a stale account-sync profile, `characters` and `botPresets`
   both arrays). The key `true` is written by the pass's own commit, also when nothing was archived. A boot where the pass
   cannot run leaves the key absent and shows nothing. The condition is V2.1 only, not V2.0 (`MC-146` 4).
   Reported (Live-State; the Orchestrator's log).
8. **Recorded 5c deviations.** From Report 49 D1's wording: the commit's cross-tab broadcast is omitted (no other tab
   exists under the exclusive hold). In the plan: Tauri's capability is "desktop and not a mobile OS", and `dbWriteLock`
   is not needed there (nothing else writes at boot; if taken it is released on every path). The coder's deviations
   that Gate 2 accepted are in section 3.3.
9. **Report 49 D1's Node upload-limit rule goes to 5d** (5c Gate 1 N8), and the D18 breaker too.
10. **Gate tiers.** Report 49 section 3.4 names only Gate 2's tier for step 5 (`opus-reviewer`); the sub-step plans' Gate
    1 tiers are the Orchestrator's. 5a and 5b Gate 1 ran with `adversarial-reviewer` (the 5a plan gives its reason: no
    persistence write is added, one is removed, and restore semantics change in one field; the 5b plan gives none). Gate 2
    used `opus-reviewer` at 5a, 5b, 5c and 5d-1 to 5d-3. **5d-4 used `adversarial-reviewer` at both gates**, which departs
    from Report 49's step 5 row; the 5d-4 plan's reason is that the change is read-path classification and text, not
    persistence. Not shown to have been reported to the maintainer.

*5b:*
11. **The 5b scope extensions** in section 7 (the clean-up state module; the `RESTORE_EXCLUSIVE_LOCK_TIMEOUT_MS` export).
12. **Parity with `LoadLocalBackup` accepted as a cost** (Gate 1 N2, N6, N7; Gate 2 deviations): the clean-up wait, lock
    acquisition and confirm outside the `try`; the English literals; the 2-second timeout; the accepted stall of autosave
    on Tauri and without Web Locks.
13. **The partial-load question (Gate 1 N1)** was held as a maintainer question under `MC-089` and answered by `MC-152`;
    CHORE-59 was placed with CHORE-51, CHORE-52 and CHORE-55 by the Orchestrator ("the Orchestrator's choice, not the
    maintainer's", `MC-152`). **CHORE-55** was filed from Gate 2 N2.

*5d-1* (Live-State's list; the records do not show each was reported):
14. The 5d split into four sub-steps and 5d-2 into 5d-2a and 5d-2b, on the 5d and 5d-2 investigators' recommendations
    (rows 551, 566).
15. The Node limit is the number 104,857,600, kept in `server/node/bodyLimit.cjs` and copied into the client's host
    binding, with a test that pins the two (no endpoint reports it).
16. The memo of skipped characters and of a too-large save lives in `localStorage`, written only after its notice has
    been posted.
17. A refusal of the first kind is silent apart from one console warning, because the user can do nothing in the app
    about a typed or fixed-name `chaId`.
18. No pre-write size prediction (Gate 1 round 1 F4): a too-large commit is caught when it is made and the device memo
    stops later starts.
19. **Two failures in a row stop archiving for the start, and neither is remembered** (an earlier isolated skip in the
    same start is), because `writeUnit` cannot tell one oversized unit from full storage or a dead server (Gate 1 F2).
    `MC-158` 2 does not decide it.
20. **Accepted limitation (J13):** two unwritable characters next to each other stop archiving there on every start; 5d-2a
    counts such a start as a failed pass only when the pass archived nothing (call 21).

*5d-2a, 5d-2b, 5d-3, 5d-4* (Live-State's list):
21. **5d-2a:** the definition of a failed pass (a pass that archived nothing and stopped on two failures counts, even if
    the key alone was committed; a pass that only skipped single characters succeeds); a refused main-file write,
    including a 409, and a commit over the Node limit count; an unreadable count or start record stops the pass without
    writing (fail closed), and a non-whole-number count reads as paused; the paused notice is posted last, once, on the
    start whose own failure made the count two. **Consequence to report:** because a 409 counts, a second device that is
    saving during two consecutive passes pauses archiving on this device until the toggle. The pause itself is the
    maintainer's (`MC-158` 1), but Report 49 D1's "every other boot" bound assumed a breaker that resumes by itself, and
    the sticky pause replaces it (5d-2a plan C2; ledger row 566).
22. **5d-2b:** only a restore that dies counts; every restore counts, not only the start one; the count is cleared by
    turning a V2.1 plugin on or by a start with no enabled V2.1 plugin, not by the switch-off; **fail open** (unlike the
    pass's count) because failing closed would switch off the user's plugin whenever storage throws or is full; its key
    is separate. **Disclosed, not closed:** the count is per device and the plugin's flag is in the save (Gate 1 F3).
23. **5d-3:** the fill-in has its own failure count (`stubEnrichStrikes`) outside the archive memo, because the
    archiving-off clear would erase an off-profile count at the next start (investigator R3); a filled-in placeholder never
    counts as a successful pass; the fill-in runs before the archiving loop. **To report to the maintainer (Live-State):**
    - **a silent stop:** after two failed or interrupted fill-in attempts in a row the fill-in stops on the device with
      a console warning and no notice; only changing the archiving setting in Settings re-arms it;
    - **two new web boot outcomes** that `MC-158` 3's option text did not describe: on the web, a profile with archiving
      off can now stop at start with an error, or fall back to a backup, if a failed fill-in save is followed by a save
      file that cannot be read back;
    - **English-only progress text** for the fill-in (the precedent: the pass's text is English);
    - on a shared Node save a fill-in commit moves the revision, so another device with the app open stops saving on its
      next save (INFERRED; section 8).
24. **5d-4:** the damaged text says "may be damaged" and that nothing was changed or deleted, and does not say that
    retrying will not help; the no-storage text offers no remedy. Both differ from `MC-159` 2's option text ("say it needs
    HTTPS or localhost"; "retrying will not help"). Live-State records that the HTTPS and retry points were told to the
    maintainer in chat while the plan was out for Gate 1. **The key count:** the doc-verifier's check of this report found
    in the session transcript that the Orchestrator's chat message (2026-10-01, about 20:28Z, transcript line 182314)
    already said it had drafted the English for the eight new messages, so the count of 8 was mentioned to the maintainer
    before the fact-check; after the records fact-check (transcript line 182782) it was explicitly compared with the
    option's "about 4-6". Both are true; `MC-159`'s "the transcript does not show that the maintainer was told" is too
    strong (section 15). "Damaged" is decided only by an fflate data error code in {0, 1, 2, 3, 6} or, at
    the `JSON.parse` step only, an error named `SyntaxError`. A failure while merging a retried chat's side fields stays a
    plain error.
25. **CHORE-62's placement** after steps 6 and 7 and before CHORE-58 was the Orchestrator's position; the maintainer
    approved it on 2026-10-02 (`MC-160` 1; section 5).
26. **CHORE-61 was filed and not placed** (section 12).

## 7. Scope amendments under MC-091

`AGENTS.md` section 1 allows the Orchestrator to amend an item's boundary for a technical prerequisite or a shared-cause
correction, with the concrete failure, the causal connection and the smallest coherent correction recorded. The step 5
records label three:

1. **5a, the restore trash rule** (the 5a plan calls it "an `MC-091` amendment", with `MC-149` 4). *Failure if left:* at
   HEAD, opening an upstream-archived trashed stub puts the unit's old `trashTime` back, the character drops out of the
   list, and the next boot's purge deletes it (TRACED; the upstream side read by the Orchestrator). *Endpoint:*
   `applyStubStateOnRestore` in `coldCharacter.ts`; no other file. *Departure from upstream:* deliberate.
2. **5b, the startup clean-up's completion state** (the 5b commit message: "an `MC-091` amendment"):
   `storage/startupCleanupState.ts` and one recording line at the `cleanChunks()` call in `bootstrap.ts`. *Failure if
   left:* an upstream-written snapshot references a character through a legacy `remotes/<chaId>.local.bin` block that the
   startup clean-up deletes while the load runs; the strict decode passes, the write lands, and the next boot drops the
   character silently (5b plan section 4.7; Gate 1 B1). *Smallest correction:* one small state module, one recording line
   and one await; `cleanChunks` itself is unchanged. Gate 2 B1 then required `bootstrap.ts` to keep reporting a clean-up
   rejection itself, because the recording line had swallowed the report the `unhandledrejection` handler used to make.
3. **5c, the optional `enableRemoteSaving` input on the encoder's `init`** (Live-State: "an `MC-091` amendment (a
   technical prerequisite for implementing the accepted pass safely)"; to be recorded in this report). *Failure if left:*
   the encoder reads `getDatabase()` at encode time and `DBState.db` is `{}` before `setDatabase`, so an encode before
   install on a Tauri or Node profile with `enableRemoteSaving` on would write every character inline, which can exceed
   the Node server's limit (the scoping, ledger row 522, premise 2, qualified at the fact-check to profiles with the flag
   on; the Orchestrator verified it in source). *Smallest correction:* an optional input kept on the encoder instance and
   consulted by `init` and `set`; with it absent every existing caller behaves as before. The Orchestrator's reading
   (`MC-149`'s trailing note) is that `MC-133` 2, which says the pass and `init` are not rewritten, is not infringed by an
   optional input.

**Scope extensions the plans list as expected files but the records do not label `MC-091`** (listed for the
maintainer's information; each is in the plan's expected files and passed its gates):
- 5b: `backuplocal.ts` now exports `RESTORE_EXCLUSIVE_LOCK_TIMEOUT_MS` (the constant gained `export` and its doc comment
  now names the internal-backup load; read in `git show 448962f4`, 2026-10-02; `LoadLocalBackup` itself is unchanged).
  The 5b plan said `LoadLocalBackup` "is not changed" and listed `backuplocal.ts` as the reference, and the Orchestrator's
  log notes the export as a deviation to mention in this report. Gate 2 accepted the new module's import of
  `backuplocal.ts` as free of a cycle (Gate 2 round 1, deviation (a)).
- 5c: the `risuSave.ts` read-only block check and the `parseBlockHeader` extraction (decoder unchanged, Gate 2 checked
  every computed value), the `characterDefaults.ts` extraction from `checkNewFormat`, and the key-only log in
  `setColdStorageItem`.
- 5d-1: `server/node/bodyLimit.cjs` and `server.cjs` (server-side files outside `src`).
- 5d-2b: the plugin toggle becomes the exported `togglePluginEnabled` (a Gate 1 F4 requirement for testability);
  `PluginSettings.svelte` calls it.
- 5d-3: one sentence each in `plugins.md` and `risuai.d.ts`.
- 5d-4: `DefaultChatScreen.svelte` and the restore message selectors.

## 8. The correction of the MC-138 1 premise

`MC-138` 1 (2026-09-30) accepted that on a Node server used from two devices at once the second device's boot may
archive the character open on the first, and said the first device "then gets the existing 'another device saved'
conflict prompt." `MC-158` 4's question text repeated that wording, and the 5d-3 commit message does too ("another
device with the app open gets the existing conflict prompt on its next save").

**What the source says** (read in `src/ts/globalApi.svelte.ts` by the Orchestrator on 2026-10-02, `MC-159` 3, with the
toast text as the Roadmap's CHORE-62 quotes it; this writer re-read the `BroadcastChannel` line, the branch start, lines
`:1501-1502` and the `en.ts` text on the same HEAD; `globalApi.svelte.ts` is not in any 5d commit's file list):
- The tab prompt that `MC-138` 1 meant rests on `BroadcastChannel('risu-db')` (`new BroadcastChannel('risu-db')` at
  `:1042`). A `BroadcastChannel` reaches only tabs of the same browser, so a second device or browser never sends it.
- What the first device gets is the `NodeStorageConflictError` branch of `saveDb` (starts at `:1451`). Before the commit:
  one toast ("Your local data conflicts with a newer version on the self-hosted server ... (unsynced local changes will be
  lost)"), `savingStoppedReason.set('node-conflict')` at `:1501` and `await sleepForever()` at `:1502`. `sleepForever`
  never resolves, so only a reload ends it. The red save-stopped icon shows `savingStoppedNodeConflictMessage`
  (`SavePopupIcon.svelte`; `en.ts` text: "This tab has stopped saving ... permanently stopped trying to save. Changes made
  from now on will not be kept ... any unsynced local changes will be lost.").
- Edits made on the first device since its last successful save are therefore lost on reload, and nothing offers to keep
  them.

**What stands and what is unproven.** `MC-138` 1's decision, to accept the case and document it, stands; `MC-159` 1 adds a
ticket (CHORE-62). **Unproven (INFERRED, not run against a real server):** that device B's startup commit always makes
device A's next save fail. The inference is from the shared revision check (the 5c commit carries the Node revision);
no real Node server was run for step 5. The 5d-4 investigator's finding was ledger row 588; the fact-check of the README
bullet was row 594.

**Where the correction is recorded:** `MC-159` 3, a pointer under `MC-138` 1 and one under `MC-158` 4, the Roadmap's
CHORE-62, Live-State, and the README bullet. The 5d-3 commit message is not edited; `MC-159` 3 is its correction.

## 9. Compatibility

- **Stub, unit and block format are unchanged.** A unit is still `{character}` under a `uuid` v4 key; the encoder and the
  block format are not rewritten (`MC-133` 2). A fork-written unit restores on upstream (Report 49 section 3.5, read from
  `upstream/main`, not executed). Upstream ignores the extra stub fields and the new root key (same source, read, not
  executed).
- **The new root key `archiveCharacters`** rides in the root block; absent or `true` is on. It survives the two encoders
  (5a guard, through `decodeRisuSave`). The fork `.bin` round trip and the upstream round trip were not run.
- **Upstream stubs.** The pass never rewrites an existing stub's archive form; 5d-3 fills placeholder fields from the
  unit and marks them `coldVersion: 2`, keeping the stub's name, image, ids, unit key, chat list and trash state. At
  restore the stub's trash state wins, a deliberate departure from upstream (`MC-149` 4).
- **Upstream-era saves.** A `formatversion` 5 save written between 2025-08-05 (`31e6eb33`) and 2026-03-30 (`6470e1c4`) has
  no `loadouts` block; the pass gives the committed tree the container defaults `setDatabase` would, and it commits and
  decodes strictly (RUN, Gate 2 diagnostic D2). Saves below `formatversion` 5 get no pass. A legacy-format main file
  (`raw`, `compressed`, `stream`) is re-encoded in the block format by a pass commit, as `saveDb`'s first save does (5c
  plan section 6).
- **Plugins.** A V2.1 plugin enabled at boot stops archiving. A trip of the restore-all breaker writes `enabled: false`
  into the saved plugin list, so it reaches every device sharing the save (the only saved change). V3 plugins still load
  after a trip. `getDatabase('all')` returns stubs, as upstream does; the plugin docs no longer say an upstream
  placeholder's type is always `'character'` (5d-3).
- **Device-local state** is in `localStorage` and not in the save: `archivePassSkipped`, `archivePassTooLarge`,
  `archivePassStrikes`, `archivePassPausedTold`, `stubEnrichStrikes`, `v21RestoreAllStrikes` (key names read in
  `bootArchiveMemo.ts` on 2026-10-02). A restored `.bin` keeps this device's pause (5d-2a plan O4).
- **Load Internal Backup** now refuses a snapshot with a damaged or missing block as a whole, where it used to load it
  without that part (5b).
- **A fork backup** restores on upstream except on an upstream web build without OPFS `createWritable`, which still
  needs the inline-everything backup first (Report 49 section 3.5; `MC-145`). Unchanged by step 5.

## 10. Unmeasured costs

Nothing in step 5 was measured. Report 49's table of effects (a main file of about 41-46 MB and a heap of about 70-76 MB
for the maintainer's profile) is still a projection, and its app measurements so far ran on an i9-13900K (Report 49
section 1). D20 (step 7) is where these are measured.
- **The first-boot pass (D20):** a sequential unit write and read-back per character, an encode and block check of the
  whole tree, an IndexedDB block-cache entry per block, and, with remote saving on Node, a `/api/list` per remote
  character in `init` (5c plan risk 7). The pass and `saveDb`'s later `init` each write a full set of block-cache
  entries on a committing boot (5c plan N7, carried to D20). Peak memory: the plan's invariant is at most one full
  character beyond the tree; no peak was measured.
- **The first start that fills something in (5d-3):** a whole-save re-encode (every block, an IndexedDB cache entry per
  block, with remote saving one existence check per full character, on Node a full key listing each), a whole-file
  write, and one archived copy read per placeholder. **Not measured** (commit message). Placeholders whose copy is
  missing, unreadable or mismatched are read again every start, and a mismatched copy costs a full decode each time.
- **The block check** parses container blocks in full only up to 4 MiB and bracket-checks above (5c deviation); its cost
  on the maintainer's profile is not measured.
- **The hold's effect on a second tab:** the second tab skips the pass after about 1 s; the lengthened wait for a booting
  tab is not measured.
- **The batch-commit cost** that would decide the D18 mechanism: no batch commit exists, and `init` plus `encode` per batch
  on `real2` was not measured.
- **Node 100 MB limit in practice:** whether the maintainer's profile commits under it after archiving is projected, not
  measured.

## 11. What was not run

No sub-step ran a live check; the only check of the running app in the window was the Settings legal-links footer
(ledger row 548), which is not step 5. This list comes from the commit messages and the plans; 5b's commit message has no
"not run" line, so its entries are from its plan and Gate 2 records. Tests model the web/OPFS backend and the Node-server stand-in; **a mocked success is not
evidence of a real backend's behaviour.** Across the eight commit messages, the following were **not run**:
- **Tauri:** the pass, the fenced commit, `writeFile` and `relaunch` in 5b, single-instance behaviour, and the
  pre-pass-bytes write-back. Tauri mobile never runs the pass (5d-3 investigator R4).
- **A real Node server:** a real 409, the revision handling, the 100 MiB limit rejection, `/api/list`, and the README's
  two-device sentence (TRACED, not run).
- **A real browser's OPFS and Web Locks:** two real tabs contending for the hold; the 1 s and 2 s grant timeouts; OPFS
  `createWritable`.
- **A real tab kill, out-of-memory or whole-browser crash:** both breakers' interruption paths are modelled by a start
  record without an end. The flush-window loss of the start record is unobserved.
- **Android and iOS** (Report 49 section 3.7: the Android wrapper needs its own D1 review).
- **A plain-HTTP static build** (the case the "no storage" text is for), Firefox private mode (a `getDirectory` that
  exists and rejects), Safari, and a browser's Worker decode path (Vitest uses fflate's Node build).
- Docker, GitHub Actions and Wiki Sync are outside step 5.

## 12. Open follow-ups and questions

**Filed from step 5 (all open):**
1. **CHORE-59** (Roadmap): Load Internal Backup refuses a partly damaged snapshot as a whole. `MC-152` decided it should
   offer the intact data; no design yet. Placed with CHORE-51, CHORE-52 and CHORE-55 (the Orchestrator's choice).
2. **CHORE-61** (Roadmap; data-loss candidate; **not scheduled and not placed**): the save encoder silently loses presets,
   modules or a character when a `chaId` equals a fixed block name, and cannot write a `chaId` over 255 bytes. Observed
   only at encoder level, by 5d-1's Gate 1 reviewer in a scratch run of the real `RisuSaveEncoder`; not through `saveDb`,
   not in a running app. How a live character comes to hold such a `chaId` is unknown (TODO(evidence) in the ticket).
   The boot pass now refuses such a tree; an ordinary save does not.
3. **CHORE-62** (Roadmap): on a Node server, another device's save makes this device stop saving until it reloads, and its
   edits since its last save are lost. TRACED, not run. **The maintainer approved CHORE-62's placement on 2026-10-02 (after steps 6 and 7, before CHORE-58);
   recorded as `MC-160` 1.**
4. **CHORE-55** (from 5b Gate 2 N2): Tauri main-file writes are not atomic.

**The work order after step 5** (Live-State, with `MC-160` 3 in the working tree): CHORE-53, then CHORE-63 with CHORE-40
(`MC-160` 3), then CHORE-43 with CHORE-54, then CHORE-51, CHORE-52, CHORE-55 and CHORE-59, then steps 6 and 7, then
CHORE-62, then CHORE-58. `MC-089`: nothing ships until every open ticket
clears.

**Questions and confirmations for the maintainer** (the records do not show an answer):
5. **Confirm or overrule the Orchestrator's calls in section 6**, especially: the 1 s hold timeout (call 6); a 409
   counting toward the pause (call 21); the fill-in's silent stop after two failures (call 23); the two new web boot
   outcomes on an archiving-off profile (call 23); English-only progress text (call 23); the V2.1 switch-off reaching
   every device that shares the save (call 22); and the 5d-4 gate tier (call 10).
6. **Is a live check of the pass wanted before step 6?** Nothing in the records schedules one; section 11 lists what one
   would settle. TODO(evidence): no live-check plan for step 5 is in the records.
7. **Native-speaker check of the new strings** in cn, zh-Hant, vi, de and es (Live-State follow-up 7). The maintainer
   accepted the Korean strings. The translators' low-confidence notes are in ledger rows 543, 561, 578 and 593 (row 573 holds none).
   TODO(evidence): the 5d-2a translator's notes (`archiveCharactersPausedNotice`) were not found (ledger row 573 holds none).
8. **Optional items not applied** at gates (each recorded in section 3): the 5d-2b O6 to O8; the README "Stay" case; the
   5d-1 Gate 2 note that "These characters" reads oddly for one name (Live-State: the records do not show a change).

**Records still to fix** (found while writing this report): Live-State cites `bootArchivePass.ts:139` for the hold
timeout, which is stale (the constant is at `:208` on this HEAD), and `bootArchivePass.ts:325` for the read of
`tree.archiveCharacters === false`, also stale (the read is at `:475` and `:479`).

## 13. The Wiki hand-off

`docs/wiki/**` is the Wiki session's lane; the Main Campaign never edits it, and this report did not. Live-State's
"Wiki session hand-off" holds four items, checked against source on 2026-10-01 and 2026-10-02. Three are step 5's:
- **`docs/wiki/Settings-Backup-and-Files.md`, the Load Internal Backup row** says it installs the restored database,
  shows "Loaded backup" and does not reload. Since `448962f4` it writes the snapshot as the main save and reloads (or
  relaunches on Tauri). Live-State also says the Clean Unused Cold Storage row uses the old label (the English label is
  now "Clean Unused Archived Data and Assets"); that item is not from a step 5 commit as far as the records show.
- **`docs/wiki/Settings-Advanced.md`, the Cold Storage row** uses the old label, the root key `coldstorage` and the old
  default. Since `33545c2c` the checkbox is "Archive characters at startup", bound to `archiveCharacters` (absent or `true`
  is on); since `9b312962` the boot pass reads it and writes `true` with a one-time notice on a boot that can archive.
- **A fourth item (2026-10-02; `MC-158` 4, `MC-159` 1): the two-device note for a Node server.** No wiki page mentions the
  two-device case or the stopped-saving state. Facts to carry, TRACED and not run: there is no prompt between devices (the
  tab prompt covers only tabs of the same browser); when another device or browser saves first, the first device shows a
  message on its next save and stops saving until the tab is reloaded; edits since its last successful save are lost on
  reload; opening the app on the other device can be enough, because startup archiving can save even when you edit
  nothing. The README's "Saving across tabs and devices" bullet carries the same wording (committed in `e7d7f093`).
The first Live-State item (the Docker volume names in `Migrating-from-upstream.md`) belongs to the README and Docker side
track (`MC-153`), not step 5.

**Observation, not in the records as a hand-off:** Live-State's list does not mention the pause notice and its
off-and-on resume (5d-2a), the V2.1 plugin switch-off (5d-2b), the fill-in of upstream placeholders (5d-3) or the new
"no storage" and "damaged" read messages (5d-4). Whether the wiki should carry them is the Wiki session's and the
maintainer's call.

## 14. What remains of memory stage 1

Step 5 closes the steps Report 49 section 3.4 numbers 1 to 5. **Steps 6 and 7 are not started; no code exists for
either.**

- **Step 6, the idle reload (D17; `opus-reviewer`).** Facts step 5 left it:
  - **The breaker state is readable synchronously**, without importing the pass: `readArchiveStrikes()` in
    `bootArchiveMemo.ts` returns `'none'`, `'one'`, `'paused'` or `'unreadable'` (read 2026-10-02; 5d-2a plan K9 and O3).
    No consumer exists. Report 49 D17 requires "the D18 breaker is not armed" among its conditions; step 6 chooses its rule
    for `'one'` and `'unreadable'`. D18 as built has two counts: the pass's, and the V2.1 restore-all count under a
    separate key (`readRestoreAllStrikes()`, same file); whether the second matters to D17 is step 6's call.
  - **A pass skipped after an idle reload releases nothing** (the short grant timeout, or another tab holding the lock; 5c
    Gate 1 round 2 N5), so step 6 must check that the post-reload pass ran before it treats the reload as having released memory.
  - **The pass accepts a keep-inline input** (`keepInline` on `BootArchivePassInput`, read 2026-10-02; the 5c boot never
    supplies it), so the character and group members the reload is about to reopen can stay full.
  - **Backup-in-progress hang points** (Report 55 section 7): the early `return`s of `SaveLocalBackup` and
    `SavePartialLocalBackup` and the `finally` of `LoadLocalBackup`.
  - **The clean-URL reload** and the `launchQueue` observation (Report 49 D17) are unchanged by step 5. The 5b plan (I10)
    has `loadInternalBackup` use `history.replaceState` plus `location.reload()` on the web and `relaunch()` on Tauri.
- **Step 7, measurement (D20; `perf-analyzer`, no Gate 2).** Section 10 lists what step 5 added: the first-boot pass wall
  time and peak on `real2` and `s1000` on the 2 GB AVD; the batch-commit cost that decides D18's mechanism; the page-load
  listing cost; the cost of the first fill-in (a whole-save rewrite); the backup peak with about 495 blobs; heap in the
  built app with stubs against today.
- **After stage 1** (`MC-145`, unchanged): the upstream-compatible inline-everything backup, then archiving of modules
  that are not enabled, then the rest of stage 2 (the streamed backup); stage 3 (the Node streamed write, CHORE-46) is
  re-measured first (Live-State). Report 49 section 5's open items (the missing-unit pointer-chat retainer; the
  rejected-avatar icon) remain open.
- **Status of stage 1:** it is done only when steps 6 and 7 are. The memory goal (a main file under the Node limit and a
  heap near the post-boot estimate) is a projection that step 5 did not test.

## 15. Discrepancies and evidence gaps

**Counts where the log and a commit message differ; the commit message wins:**
- 5d-4 red count: the Orchestrator's log and ledger row 590 give 164 failing (109 on behaviour and 55 on missing exports)
  for the first tests; the commit message gives 162 (107 and 55) for the final tests. Both are right for their tests (row
  596 explains the difference).
- 5d-4 survivors: the Orchestrator's log says m29, m63 and m80 survive; ledger rows 595 and 598 say m29 and m80 survive and
  m63 is not exercised by any test. The commit message says 47 were killed and three "were not covered".
- Token and tool counts: the log's figures for the 5d-1 coder (about 60 tool uses), the 5d-4 `test-warrior` (about 460k,
  195), the 5d-3 Gate 1 tool uses (68) and several others are estimates; this report uses the ledger's harness figures
  and says so. Ledger rows say that tool-use figures for resumed agents are sometimes per run and sometimes cumulative
  (row 598), so sums of tool uses here are not harness figures.
- 5c test count: the commit message and Gate 2 round 2 say 151 tests in eight files. Gate 2 round 1 ran 128 tests in
  those files before the remediation (the 76 red and 52 guards of the first run), and ledger row 541 says the remediation
  added 23 (Gate 2 round 2's count); 128 plus 23 is 151, but the commit message says one replaced test is among the added
  ones, and a replacement would leave 150. The fact-check (row 550) could not resolve it. **TODO(evidence)** for the exact
  split.
- **5d-3 equivalent mutants.** The commit message describes the two equivalents as a paused fill-in count that falls
  through to the unreadable-count stop and the archiving-off route reading a device memo already cleared; Gate 2's record
  names them M8d and X12. The sources place the two equivalents differently, and this report does not decide which
  description matches which id. The totals agree: 32 mutants, 30 killed, 2 equivalent.
- **The 5d-1, 5d-2a and 5d-2b build claims.** Earlier text implied the build ran on each final tree. It ran on the first
  snapshot for 5d-1 (4156 passed) and 5d-2b (4371 passed), and before Gate 2's editorial edits for 5d-2a; it was not re-run
  after. For 5a the build result rests on the commit message and the Orchestrator's log only (section 3.1, section 4).
- **A records error being corrected (`MC-159` 2).** `MC-159` says "the transcript does not show that the maintainer was told
  the key count would be 8 rather than 'about 4-6'". The doc-verifier found that the Orchestrator's chat message while the
  plan was out for Gate 1 already said the English for the eight new messages was drafted, and that after the records
  fact-check the count was explicitly compared with "about 4-6" (section 6, call 24). The records batch is to correct
  `MC-159`.
- **Where the D3 claims come from.** The "one production caller" sentence is 5c Gate 2 round 1's, and the "only runtime
  violator" claim is the scoping digest's, not ledger row 522's or the commit message's (section 2).

**Gaps (TODO(evidence)):**
- The 5d-2a translator's notes (`archiveCharactersPausedNotice`) were not found; ledger row 573 holds none.
- A separate `code-searcher` sweep for stub creators (Report 49 section 5 item 6): not in the records. The evidence is the
  5c commit message, 5c Gate 2 round 1's verification and the scoping digest's finding that `loadInternalBackup` was the
  only runtime violator.
- The number of mutants the `test-warrior` ran for 5b's remediation guards (B2, N4) is not recorded; Gate 2 round 2's five
  and the T10 mutant are.
- The 5b pre-gate dispatches (the move, the red tests, the coder, the translator) are in the Orchestrator's log only,
  with no ledger row.
- No live-check plan for step 5 (section 12 item 6).
- Ledger rows 601 and 602 hold this report's draft and its fact-check (the doc-verifier's result: 44 claim groups, 30
  VERIFIED, 2 WRONG, 3 STALE, 5 OVERSTATED, 4 INCOMPLETE; this version applies its corrections). Row 599's cost is
  corrected in the same records batch. Row 605 holds this report's corrections run. The next free numbers are `MC-161`, Report 57, row 606 and CHORE-64.
