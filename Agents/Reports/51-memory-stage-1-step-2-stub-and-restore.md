# Report 51 — Memory stage 1, step 2: the v2 archived-character placeholder (stub) and one restore path (D6, D7, D9 restore side)

**STATUS:** done, 2026-10-01. **Gate 2 approved at round 2** ([APPROVE]), then one editorial round:
round 1 [REJECT], round 2 [APPROVE], round 3 [EDITORIAL] (remediation check plus the commit-message
check), all by `opus-reviewer` (ledger rows 495-497). Committed as `db49aeeb`; this report is
added by the records commit that follows it. Steps 3-7 of Report 49 are not started, so memory stage
1 as a whole is not done. The plan was gated once, as part of the stage plan (Report 49, Gate 1);
this step had its own Gate 2 only.

Final checks by the Orchestrator: `pnpm test` 209 files, 3559 passed, 4 skipped; `pnpm check` 0 errors
and 0 warnings; `pnpm build` exit 0. They ran on the snapshot that Gate 2 round 3 reviewed (the final
code). Comment-only edits made afterwards (the round-3 corrections, and one more test comment in
`sendChatTurnsReached.svelte.test.ts` that the `doc-verifier` found) were not re-run. The first checks
before round 1 gave 3542 passed in the same 209 files. Nothing was run in a browser or a Tauri build, and the archive pass is tested on the
Node-server branch only.

**Sources** (scratchpad `memfoot/step2/`; not durable, so this report and ledger rows 494-497 are the
durable record):
- `brief.md`: the invariants I1-I10, the acceptance scenarios, the test-facing API and the
  Orchestrator's decisions on the packet's open points;
- `packet.md`: the investigator's code map, whose refuted or corrected premises are R1-R5 and whose
  open points are P1-P9 (ledger row 494);
- `tests/table.md`, `tests/delta-table.md` and the `g2-*.log` and `g2r2-*.log` files: the red-first
  evidence;
- `gate2/brief-r1.md` (which also records the post-brief alert-contract decision),
  `gate2/review-r1.md`, `review-r2.md`, `review-r3.md`: the Gate 2 hand-backs, saved by the
  Orchestrator (the reviewer does not write report files), each ending with the Orchestrator's
  disposition;
- `gate2/checks.md`, `full-r3.log`, `check-r3.log`, `build-r3.log`: the checks;
- `commit-msg.txt`: the draft the reviewer checked in round 3 (ledger row 497), corrected afterwards
  (one comment-only line in a test was also corrected after the check);
- `Agents/Reports/49-memory-stage-1-plan.md` (section 3.3 D6, D7 and D9; section 3.4 step 2; 3.5).

Decisions bearing on this step (the ones the brief lists). Step 2 implements `MC-136` 1 (character
grain; the upstream stub form, enriched). It keeps these as constraints: `MC-011` (the fork has never
shipped; upstream characters, stubs and backups must keep working), `MC-133` 2 (by its own text the
boot pass and `init` are not rewritten), `MC-140` (a restored character stays full until the next page
load) and `MC-142` (the root `coldstorage` field is untouched). `MC-136` 3 (V3 `getDatabase('all')`
returns stubs) is step 3 and untouched here. "Block format and encoder unchanged" comes from Report 49
section 3.5 and the brief's I8. The brief records that no `MC-091` amendment was needed (section 3).

## 1. What step 2 changed

Summary from the commit message (`commit-msg.txt`); the numbered invariants are in the brief.

**The stub.** The placeholder that an archived character leaves in the character list is built by one
function, `buildColdStub` in the new `src/ts/process/coldCharacter.ts`. The pointer fields are
unchanged: the unit key, `coldStoragedChats`, and one dummy chat with an empty first message. It now
also carries:
- the real type, and for a group a copy of its member list, so a group keeps its icon and stays out of
  the select-character dialog;
- `name`, `image`, `chaId`, `lastInteraction` and `trashTime` (when set);
- the chat count, in `coldChatCount`, which the mobile list shows;
- in `creatorNotes`, the description the grid would show for the full character (its `en` section,
  else the text outside any section), cut to 500 characters;
- a version marker, `coldVersion: 2`.

The stub is built from the character read back from its unit. It does not throw on a group without a
member list or on a non-string description. The 10-day archive path, which still runs until step 5,
uses this builder and no longer archives a character that is in the trash.

**One restore.** `restoreColdCharacter` in the new `src/ts/process/coldCharacterRestore.ts` is used by
`changeChar` and by `restoreColdCharacterByChaId` (the group-turn member restore).
- It reads the unit with the three-way `readColdStorageItem`. A missing unit keeps the "may be
  permanently lost" alert. A read error shows a new message, `coldStorageRestoreUnreadable`: the
  character could not be loaded right now, nothing was changed, try again.
- A unit whose `chaId` differs from the stub's is refused, with the alert and a `console.error`
  naming both ids, the unit key and the character's name. The stub never adopts the unit's id.
- The trash state is taken from the stub as it is when the read completes. For a v2 stub, the stub's
  `trashTime` wins, including "not trashed". For a stub made by upstream, a set `trashTime` wins and
  otherwise the unit is installed exactly as stored. So a character archived by this fork and then
  trashed or restored from the trash keeps that state when opened, including from the trash view.
- A second request for a stub that is already being restored joins that restore, so the unit is
  installed once.
- `changeChar` installs only into the slot that still holds the stub it was clicked on. When the list
  changed during the read it used to write the caller's index: it could throw, report a healthy
  character as possibly lost, or install twice and drop edits. It selects only if no later
  `changeChar` call started and no chat started generating during the read.
- The group-turn restore installs into the only character holding the `chaId` that is still a stub,
  as before, including a copy a plugin put in its place during the read. It installs nothing when
  that stub now points at another unit, since that other unit would then lose its last reference and
  the manual clean-up would delete it. It shows the alert itself: several holders give the "may be
  lost" alert, when no character holds the id it ends silently, and the send loop no longer adds its
  own.

**Upstream compatibility.** The block format and the encoder are unchanged, and nothing needs the
marker or the new fields to restore. A v2 stub stays a valid upstream stub: upstream restores it by
replacing it with the unit's character and lists it from the same fields (it shows chat count 1).
This was read from `upstream/main` (packet section 8), not run.

**Strings.** The new message is translated into ko, cn, zh-Hant, vi, de and es by the `translator`
(one key, `coldStorageRestoreUnreadable`, in each of the six files).

**Where the code is.** New modules: `src/ts/process/coldCharacter.ts` and
`src/ts/process/coldCharacterRestore.ts`. Changed (from `git status` on the uncommitted tree):
`src/ts/characters.ts`, `src/ts/process/coldMemberRestore.ts`, `src/ts/process/coldstorage.svelte.ts`,
`src/ts/process/index.svelte.ts`, `src/ts/storage/database.svelte.ts` (the optional `coldVersion` and `coldChatCount` fields, each added
twice: four added lines in the diff), `src/lib/Mobile/MobileCharacters.svelte`
and the seven language files (`en.ts` holds the English source). `GridCatalog.svelte` and
`AlertComp.svelte` are not among the modified files: the grid's description and the select dialog's
group exclusion follow from the stub's fields alone.

**Tests.** New: `coldCharacter.test.ts`, `characters.coldRestore.svelte.test.ts`,
`GridCatalog.coldStub.svelte.test.ts` (`MobileCharacters`, `GridCatalog` and the select-character
dialog), `coldstorageArchive.test.ts` (the real `makeColdData` on the Node-server branch). Additions
to `coldMemberRestore.test.ts`. The restore-side mocks in `coldMemberRestore`,
`characters.newChatIdentity` and `hotkeyCharSwitch` now go through `readColdStorageItem`, and
`sendChatGroupOrigin` and `sendChatTurnsReached` expect no alert from the send loop. Against
`bc09a9a1` with an inert `coldCharacter.ts` (today's stub shape, rules that do nothing) and the new
string injected, the seven test files as first written (`tests/table.md`: `coldCharacter.test.ts`,
`characters.coldRestore.svelte.test.ts`, `GridCatalog.coldStub.svelte.test.ts`,
`coldstorageArchive.test.ts`, `coldMemberRestore.test.ts`, `characters.newChatIdentity.svelte.test.ts`
and `sendChatGroupOrigin.svelte.test.ts`; one test in them, the several-holders alert, was added after
the first run) gave 54 failures, each on an assertion, and 82
passes (guards, unchanged tests, and the string test, which fails without the injection); examples
are "expected 'character' to be 'group'", "expected undefined to be 5000" and "promise rejected
TypeError ... instead of resolving" (commit message; `tests/table.md` lists each test as RED or
green). The non-guard tests added during review failed on the tree before the fix they cover, except
the ones listed in section 4, round 3, E-M3; the rest are guards that pin checks no test covered. The
stub-pointing-at-another-unit case also fails with `bc09a9a1`'s `coldMemberRestore.ts` swapped in,
which installs the unit it read there.

## 2. The Orchestrator's decisions

The investigator's code map (row 494) corrected five premises, R1-R5, and raised nine open points,
P1-P9.

**Premises the packet refuted or corrected** (packet section 0; all TRACED at `bc09a9a1` unless
marked):
- **R1.** "Restore revives the blob's `trashTime`" holds in mechanism, but in both directions today,
  on the fork and on upstream. A character trashed before archiving becomes an un-trashed-looking
  stub, and opening it brings back the blob's `trashTime`. A character trashed after archiving keeps
  `trashTime` on the stub only, and opening it (including from the trash view) drops it. The packet
  calls this second direction, a stub trashed after archiving, the common one. D7's "trashed
  characters are not archived" removes only the first direction; the version marker plus the
  restore-time merge fixes the second, so it belongs in step 2.
- **R2.** `characterFormatUpdate` is never called on a stub, with one exception: `PlaygroundMenu.svelte`
  calls it on whatever `§playground` slot holds (step 3).
- **R3.** `updateInteraction: true` is a dead parameter: `cha.lastInteraction = Date.now()` runs
  unconditionally, so both restore sites reset `lastInteraction`. A stub's copied `lastInteraction`
  matters only while the character is cold. The commit message records no change to this.
- **R4.** The count of test files that `vi.mock` `coldstorage.svelte.ts` is 45 by the packet's grep,
  not the 43 in Report 49 (the packet notes the counting method may differ).
- **R5.** The stub population on first use is upstream (v1) stubs, not v2. Upstream defaults cold
  storage on for installs with no plugins and archives every character idle for 10 days; step 5's pass
  archives only full characters, so existing v1 stubs are never enriched.

**Decisions on the open points** (`brief.md`, section 1, as the brief states them):

| Packet point | Decision |
|---|---|
| **P1**, the real population is v1 stubs | Step 2's list fixes reach v2 stubs only. Upstream-made (v1) stubs keep what they show today until the user opens them and a later boot pass archives them again. Whether step 5's pass should enrich v1 stubs is a question for step 5, not this step (section 6, item 1). |
| **P2**, wire the v2 builder into `makeColdDataForCharacter`? | Yes. The still-running 10-day path builds v2 stubs through the new builder and no longer archives a trashed character (D7). It keeps everything else (its 10-day rule, `crypto.randomUUID()`, no `§` exclusion); those are step 3 and step 5 items. |
| **P3**, what `creatorNotes` carries | The description text the grid shows for the full character, cut to a bounded length (the brief says non-normative 500 characters; implemented as 500), not a raw cut of the multilingual string. |
| **P4**, the trash merge for unmarked stubs | For a v2 stub, the stub's `trashTime` wins, including "absent". For an unmarked (upstream-made) stub, a truthy stub `trashTime` wins (only a user trash can have set it); otherwise the blob is installed exactly as stored. |
| **P5**, a blob whose `chaId` differs from the stub's | Refused; the stub stays; `console.error` names the stub's `chaId`, the blob's `chaId`, the unit key and the character's name. The id is never adopted (the step 1 clean-up relies on the pair agreeing). |
| **P6**, a duplicate-`chaId` stub in `changeChar` | `changeChar` restores the stub the user clicked, found again by reference after the read. Duplicate `chaId`s are not refused there (today's click behaviour). `restoreColdCharacterByChaId` keeps its sole-holder rule. |
| **P7**, the failure message | The restore reads through the three-way `readColdStorageItem`. A read error is never reported to the user as possible data loss (a new English string; the translations followed the gate). |
| **P8**, single-flight for concurrent restores | The brief's answer is stronger than the packet's recommendation (the re-check by reference alone): at most one install per stub (I6), and selection follows the most recent `changeChar` call (I7). |
| **P9**, marker and count field names | The brief named only the marker, non-normatively, as `coldVersion: 2`. The count field's name (`coldChatCount`, commit message) and the split into two modules (the builder, and the effectful restore; neither imports `characters.ts` or `index.svelte.ts`, I10 requires that of the new module) were the implementation's. |
| **Group-turn alert contract** (post-brief; recorded in `gate2/brief-r1.md`) | `restoreColdCharacterByChaId` shows the alert itself: missing unit gives `coldStorageRestoreFailed`; read error gives `coldStorageRestoreUnreadable`; a mismatch gives Failed plus the `console.error`; several holders give Failed with no read. It is silent when no character holds the id. The `index.svelte.ts` caller shows no alert of its own. The evidence gives no separate reason for this decision; the brief's I5 requires the read-error message at both sites, and the previous boolean result could not carry it (reading, not a recorded reason). |

## 3. Scope notes

Recorded in the same form as Report 50 section 3. The brief states that no `MC-091` amendment was
needed for the first note.

**A. `changeChar`'s stale index (moved onto the shared restore).**
- *Failure if left (packet, section 2, items 1 and 2; TRACED as a reading of the code, no test
  exercised it at `bc09a9a1`):* after the read, `changeChar` used the caller's index again. If the
  array shifted, the character check failed and a healthy character was reported as "may be
  permanently lost"; if it shrank below the index, `DBState.db.characters[index].chaId` threw a
  TypeError inside an un-awaited click handler. Two concurrent `changeChar` calls on one stub each
  installed their own parsed copy, so the second replaced the first's object, dropping edits made in
  between and anything holding the first object. The last call to finish won the selection, not the
  last to start.
- *Causal link:* `changeChar` is one of the two restore sites that step 2 moves onto the shared
  restore.
- *Smallest correction:* the shared restore re-finds the slot by reference after the read (I6), joins
  a restore in flight, and selection follows the latest call (I7). Not an `MC-091` amendment because
  the module is what step 2 builds (brief; packet section 11.1).

**B. N7 (round 2): the by-chaId path did not check the key that was read.**
- *It existed at `bc09a9a1` too.* `restoreColdCharacterByChaId` never checked that the target stub
  still has the unit key it read. The reviewer's diagnostic (`rv/tests/r2diag.test.ts`): a stub
  replaced during the read by a same-`chaId` stub with key `unit-new` gets `unit-old`'s content
  installed, `unit-new` becomes unreferenced, and the manual clean-up would delete it. It needs a
  whole-database install during the read (a backup load, or V3 `setDatabase` with foreign data).
- *Why it was fixed here:* the Orchestrator judged it data-loss adjacent and inside this module. A
  different key now counts as "gone" (nothing installed). The evidence does not call it an `MC-091`
  amendment.
- *Evidence:* the Orchestrator's disposition specified a red test for it. In round 3 the reviewer's
  diagnostic gave `{result:false, coldstorage:'unit-new', alerts:0}` after the fix, and
  `bc09a9a1` installs the old unit there. The new test failed on the round-2 tree ("expected true to
  be false") and also with `bc09a9a1`'s `coldMemberRestore.ts` swapped in (`tests/g2r2-now.log`,
  `tests/g2r2-head.log`).

**C. N5 (round 1): the builder must not throw at boot.** The reviewer suspected that `buildColdStub`
threw on a group without a `characters` array or on a non-string `creatorNotes`, which would reject
`makeColdData`'s `Promise.all` inside the boot `try` and stop the app from finishing its load on every
boot. It was a suspicion when raised. The builder is new code, so `bc09a9a1` has nothing to reproduce
it against. The Orchestrator adopted a defensive fix, and six new tests reproduce it on the round-1
tree (`tests/g2-all.log`, `tests/g2-archive.log`): three in `coldCharacter.test.ts` (a group without a
member list, `creatorNotes` a number, `creatorNotes` an object) and the same three in
`coldstorageArchive.test.ts`, where `makeColdData` rejects. The reviewer's hand-back says four.

**D. The alert contract moved into the restore** (section 2, last row). It is an addition to the
brief made before Gate 2, which the reviewer received in `brief-r1.md`.

## 4. Gate 2 record

`opus-reviewer` was used because Report 49 section 3.4 names it for step 2. The same reviewer instance ran all three rounds and the
commit-message check. It ran on the working tree against `bc09a9a1`, not on a commit, with mutants
built in its own scratchpad by a Vitest config that swaps module sources at load
(`rv/vitest.rv.config.ts`). Ledger rows 495-497 hold the costs.

### Round 1 — [REJECT] (~212k tokens)

Snapshot: `bc09a9a1` plus the working tree (diff byte-identical to `diff-r1.patch`, new-module sha256
matched); `pnpm check` 0; 7 files, 140 passed under the reviewer's config. Test audit: the reds fail
for the stated reasons, guards are labelled, and the missing scaffold for `coldCharacterRestore.ts`
(added by the coder) does not weaken the restore-side reds. 22 mutants: 18 killed; survivors M6, M9,
M13 and M18 (below).

| Finding | Content | Disposition |
|---|---|---|
| **F1** blocking | `restoreColdCharacterByChaId` located the slot after the read by the stub object only. A same-`chaId` copy installed during the read (V3 `setCharacterToIndex`, or `setDatabase` with snapshots) gave "gone", so it returned false with no alert and the `index.svelte.ts` caller, which saw the member still exist, stopped the group turn silently. `bc09a9a1` re-found the slot by the sole holder of the `chaId` and restored. This contradicted I6 ("sole holder of the chaId that is still a stub, unchanged rule"). Differential `rv/tests/f1.test.ts`: working tree `{result:false, alerts:0, holderIsStub:true}`; with `bc09a9a1`'s `coldMemberRestore.ts` swapped in `{result:true, holderIsStub:false}`. The Orchestrator verified that V3 `setCharacterToIndex` assigns the plugin's object into the slot (`v3.svelte.ts`). | Fixed; verified in round 2. |
| **E1** | `coldMemberRestore.test.ts` header said the slot is re-found by `chaId`, which was false in that tree. | Fixed. |
| **E2** | `coldMemberRestore.ts` doc: "silent when the placeholder left the list" was false in the F1 case, and "imports `characters.ts` and `coldstorage.svelte.ts`" was stale. | Fixed. |
| **E3** | `index.svelte.ts`: "The restore has already told the user why it failed", and a `sendChatGroupOrigin` comment, were false in the F1 case. | Fixed. |
| **E4** | `coldCharacterRestore.ts` header: `index.svelte.ts` declares `doingChat`, it does not import it; the module loads `index.svelte.ts` transitively through `coldstorage.svelte.ts` (no new cycle). | Fixed. |
| **N1** | A joiner got the first call's outcome whatever its own `requireSoleHolder` (mutant M6 survives); no data risk. | Adopted: the by-chaId path re-checks the sole holder itself after the restore settles. Test red on the round-1 tree; verified in round 2. |
| **N2** | The stub built from the read-back unit was unpinned (M13 survives). | Pinned with a test; kills M13 (round 2). |
| **N3** | `changeChar` with a same-`chaId` copy is a silent no-op (I6 accepts it; a second click works). `hotkey.ts`'s post-await `selectedCharID === target` check skips its reset when the list shifted (cosmetic). | Accepted. |
| **N4** | `coldMemberRestore.ts` and `MobileCharacters.svelte` were LF in the working tree (CRLF at `bc09a9a1`, per the Orchestrator's check). | Fixed by the Orchestrator; round 2 found it resolved. |
| **N5** (suspicion) | `buildColdStub` throws on a group without a `characters` array or a non-string `creatorNotes`, which rejects `makeColdData`'s `Promise.all` inside the boot `try`, so the app never finishes loading. | Adopted (section 3, C); six tests red on the round-1 tree (the hand-back says four), verified in round 2. |

Mutants that survived in round 1: M6 (N1), M9 (a joined call also formats; harmless), M13 (N2) and M18
(equivalent).

### Round 2 — [APPROVE] (~44k more, same reviewer)

Snapshot: `bc09a9a1` plus the working tree (diff byte-identical to `diff-r2.patch`; new files match
`untracked-r2.sha`); `pnpm check` 0; the 9 step files, 174 passed under the reviewer's config.
- **F1 fixed:** the differential gives `{result:true, alerts:0, holderIsStub:false}` for a one-slot and
  a whole-array copy, matching `bc09a9a1`; the trash merge reads from the found slot (a test pins
  9000). The new F1 tests are red on the round-1 tree.
- E1-E4 fixed and true. N1 adopted (joiner re-check; test red on the round-1 tree). N2 pinned. N4
  resolved. N5 fixed.
- Mutants killed (from the hand-back, by name): the joiner re-check, the stub built from the live
  object (M13), the by-chaId rule switched off, the merge taken from the original stub, no mismatch
  refusal, the N5 guards, no join, and the no-holder alert. The hand-back gives no total; counting the
  round-2 mutant logs gives 13, of which 9 killed and 4 survived.

| Finding | Content | Disposition |
|---|---|---|
| **N6** | Two by-chaId checks unpinned: the several-holders refusal after the read (a duplicate inserted ahead during the read receives the install), and the already-full shortcut (the unit is installed over a full character, dropping its edits). | Adopted: one test each. |
| **N7** | Section 3, B. Exists at `bc09a9a1` too. | Adopted: a different key counts as gone, with a red test. |
| **N8** | A by-chaId joiner of a click restore that ends "gone" still stops silently. It needs a click, a group send and a plugin copy within one read. Negligible. | Accepted. |
| **N9** | The by-chaId doc says the joiner gets the same rule, but with no holder at settle the joiner alerted instead of ending silently. | Adopted: no holder at settle is "gone", silent. |
| **N10** | In the N1 scenario the joiner's alert says data may be lost although nothing was; this follows the brief's several-holders decision. | Accepted. |

Mutants that survived in round 2: the several-holders refusal (N6), the already-full shortcut (N6),
"mismatch against the original stub" (equivalent) and "re-check for all joiners" (unreachable).

The Orchestrator's disposition marked N7 and N9 as executable remediation, so the same reviewer checked
that diff in round 3.

### Round 3 — [EDITORIAL] (~36k more, same reviewer; remediation check plus the commit-message check)

Snapshot: `bc09a9a1` plus the working tree (diff byte-identical to `diff-r3.patch`); the 9 step files,
178 passed under the reviewer's config. Full suite, check and build are the Orchestrator's round-3 logs
on this snapshot.
- **F1 holds** (the differential is true for a one-slot and a whole-array copy).
- **N7 fixed:** the key check runs in the by-chaId branch before the read result is examined; the
  diagnostic gives
  `{result:false, coldstorage:'unit-new', alerts:0}`. N9 fixed and the byChaId doc matches. N6a kills
  "no several-holders refusal"; the N6b guard kills "no already-full shortcut". The N9 microtask-order
  comment is true. N8 reproduces as accepted.
- The N9 test against `bc09a9a1`'s module only times out (`bc09a9a1` never joins), so it reproduces
  the round-2 defect only.
- 9 mutants, all killed.
- **Translations:** all six keep "right now / nothing changed / try again", and none mentions loss.

Editorial findings (all applied by the Orchestrator with scripts that assert one exact match per
replacement; the comment edits changed only comment lines, `index.svelte.ts` stayed CRLF and the test
file stayed LF):

| Finding | Content |
|---|---|
| **E-C1** | The `index.svelte.ts` comment "the restore has already told the user why" and the `sendChatGroupOrigin` comment were false in the N7 case (a silent stop). |
| **E-M1** | Commit message: "now also when a plugin replaced that stub with a copy" is false against `bc09a9a1` (it re-found the slot by the sole holder). |
| **E-M2** | Commit message: `sendChatGroupOrigin` and `sendChatTurnsReached` do not use `readColdStorageItem`; they expect no alert from the send loop. |
| **E-M3** | Commit message: not every review test failed on the earlier tree (the N2 guard, the N6b guard and the join guard are guards; N6a passes on the round-2 tree). |
| **E-M4** | Commit message: the 54 and 82 figures are for the test files as first written; the committed `coldMemberRestore.test.ts` imports `coldCharacterRestore`, which is absent at `bc09a9a1`. |

Optional points, all applied to the message: qualify the trash sentence to fork-built stubs; say the
string test passed only through the injection; say "fails at `bc09a9a1`" was measured with
`bc09a9a1`'s `coldMemberRestore.ts` swapped in; add the silent cases and upstream group stubs to "Not
covered". One optional point was **not adopted**: the Spanish string is informal (`Inténtalo`) while its
immediate neighbours are formal (`Sus datos`), and the reviewer suggested matching them. The
Orchestrator's reason: the neighbouring cold-storage retry string
(`coldStorageLegacyChatRetryFailed`) and `hubLoadFailed` already use "Inténtalo", so the file mixes
registers and the new line matches its nearest retry string.

The editorial-only corrections were closed by the Orchestrator's check of the diff, with no re-review
(`AGENTS.md` section 4).

## 5. What is not covered

From the commit message:
- Stubs made by upstream keep showing chat count 1, no last-opened time and "No description" until
  they are opened and archived again. An upstream-made group stub keeps type `'character'`: no group
  icon, and it is listed in the select-character dialog.
- Nothing was run in a browser or a Tauri build; the archive pass is tested on the Node-server branch
  only.
- A click on a stub that a plugin replaced with a copy during the read does nothing; a second click
  opens it.
- A group turn stops without a message when the member's only holder now points at another unit, or
  when it joined a click restore whose stub was replaced during the read.
- Group members that are still stubs are read as stubs by the group screen until they speak (step 3).

## 6. Open follow-ups

1. **P1: should step 5's boot pass enrich upstream-made (v1) stubs?** Step 2 accepted that only v2
   stubs get the list fixes (section 2). Real users arrive with v1 stubs (R5). Reading each v1 stub's
   unit once to enrich it is expensive and not in the plan. This is a question for the maintainer at
   step 5.
2. **A native-speaker check of the translations.** `coldStorageRestoreUnreadable` was added to ko, cn,
   zh-Hant, vi, de and es by the `translator`. The reviewer checked the meaning in round 3 (section
   4). A native-speaker check is still open for all six. No maintainer acceptance of the step-2
   strings is recorded.
3. **Accepted residuals** (section 4): **N3** (a same-`chaId` copy makes a click restore a silent
   no-op, and `hotkey.ts` skips its reset when the list shifted; cosmetic) and **N8** (a by-chaId
   joiner of a click restore that ends "gone" stops silently). Also **N10**: in the several-holders
   join case the alert says data may be lost when nothing was (the brief's decision).
4. **Step 3 items that step 2 leaves.** Group members that are still stubs are read as stubs by the
   group screen until they speak (commit message). From the packet, at `bc09a9a1`: the Playground
   (`PlaygroundMenu.svelte` mutates the slot and calls `characterFormatUpdate` on whatever
   `§playground` holds, D19; packet section 11.2); `addGroupChar` and `createNewChat` read
   `firstMessage` from a stub (D8; packet section 11.3); `exportAsDataset` writes a garbage entry per
   stub (D5; packet section 4). The 10-day path's `crypto.randomUUID()`, its lack of a `§` exclusion
   and the rest of the eligibility rules are step 3 and step 5 items (brief, P2).
5. **`updateInteraction` is a dead parameter** (packet R3): both restore sites reset `lastInteraction`
   to now. The commit message records no change to it.
6. **No live verification.** Nothing was run in a browser or a Tauri build; the restore tests mock
   the cold-storage reader.
