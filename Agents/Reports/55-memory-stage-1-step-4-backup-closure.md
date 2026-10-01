# Report 55 — Memory stage 1, step 4: a local backup carries every unit it needs (D13; MC-147)

**STATUS:** done, 2026-10-01. **Gate 1 (the plan, `adversarial-reviewer`):** round 1 [REJECT], round 2
[EDITORIAL] (ledger row 518). **Gate 2 (the implementation, `opus-reviewer`):** round 1 [REJECT], round 2
[EDITORIAL] (ledger row 519). Committed as `a6719e35`; this report is added by the records commit that
follows it. This report covers **step 4**. Steps 5-7 of Report 49 are not started, so memory stage 1 as a
whole is not done. Each gate had one [REJECT] round and then one [EDITORIAL] round, so the three-round
escalation rule (`AGENTS.md` section 1.2) was not triggered. Step 4's tier is the one Report 49 section 3.4
gives it (`opus-reviewer`). No live check was run (section 7).

Final checks, run by the Orchestrator on the snapshot Gate 2 round 2 reviewed, before that round's
comment-and-title-only corrections (`records-notes.md`):
- `pnpm test` (`vitest run`): 229 files, 3876 passed, 4 skipped;
- `pnpm check`: 0 errors, 0 warnings;
- `pnpm build`: exit 0.

PG-1's final tree had 227 files and 3,767 passed (Report 54 section 4). The difference is 2 files and 109
tests, which is the size of the two new test files (section 4). Gate 2 round 2's editorial corrections
(comment and test-title text only) were checked by diff and by
re-running the two new test files (109 passed); the full suite, `pnpm check` and the build were not re-run
after them (`AGENTS.md` section 4: editorial-only changes do not trigger application tests).

**Sources** (scratchpad `step4/`; not durable, so this report and ledger rows 517-520 are the durable
record):
- `plan.md` (the accepted plan, r2, with Gate 1's round-2 corrections): the invariants B1-B9 and the
  acceptance scenarios 1-18 (and 17b) used below;
- `records-notes.md`: the Orchestrator's notes for the investigation, both gates, the remediation and the
  checks;
- `final-counts.json`: the final test counts per file; `orch-red.log` and `orch-remed.log`: the
  Orchestrator's own re-runs of the red tests and of the remediation tests;
- `gate2-brief.md`: the Gate 2 brief; `gate2/`: the reviewer's scratch artifacts (mutant result files, probe and
  HEAD logs, scripts). The hand-backs themselves survive only as `records-notes.md` records them;
- `Agents/Reports/49-memory-stage-1-plan.md` (section 3.3 D13; section 3.4 step 4; section 3.5) and
  `Agents/Reports/53-memory-stage-1-step-3b-groups-playground-exports.md`, whose structure this report follows;
- `Agents/Maintainer-Context.md`, `MC-147`.

Dispatches, with task usage as the Orchestrator's notes report it (the ledger has rows 517-520 for the
investigation, the two gates and the fact-check of this batch):
- `investigator`, the D13 investigation: ~178k tokens, 61 tool uses, ~412 s (row 517);
- `adversarial-reviewer`, Gate 1: round 1 ~140k tokens, 30 tool uses; round 2 ~16k, 3 tool uses (row 518);
- `test-warrior`, the red tests: ~200k tokens, 51 tool uses;
- `sonnet-coder`, the implementation: ~186k tokens, 58 tool uses;
- `opus-reviewer`, Gate 2: round 1 ~246k tokens, 121 tool uses, ~18 min; round 2 ~35k incremental, 24 tool
  uses (row 519);
- `test-warrior`, the remediation tests: ~142k tokens, 56 tool uses;
- `sonnet-coder`, the remediation: ~81k tokens, 45 tool uses;
- `doc-writer`, this report and the other records: ~194k tokens, 63 tool uses; the correction pass after
  `doc-verifier` ~50k more, 32 tool uses;
- `doc-verifier`, the check of this batch: ~216k tokens, 116 tool uses (row 520);
- `opus-reviewer`, the code commit-message check: ~25k incremental, 16 tool uses ([EDITORIAL], six
  corrections applied by the Orchestrator).

Decisions bearing on this step: `MC-147` (items 1-4; section 2), `MC-016` (the "could not be loaded" error
text is seen in the wild on upstream), `MC-011` (the fork has never shipped; upstream compatibility is what
must hold), `MC-130` 3 and 4 (an upstream-restorable `.bin` must stay possible; a memory warning is enough
for now), `MC-145` (the inline-everything backup is a later stage) and `MC-136`. The prompt names the
character by the same rule as the startup clean-up notice (`MC-138` 2); `MC-138` 2 is not a backup rule. `MC-132`
and `MC-146` are not cited: they say nothing about backups. The citations were corrected after the
`doc-verifier` check of this batch (ledger row 520).

## 1. What step 4 changed

Both local backups (`SaveLocalBackup` and `SavePartialLocalBackup` in `src/ts/drive/backuplocal.ts`) now
collect their cold-storage units through one closure rule. In every area below, a "unit" is a cold-storage
entry (a character archive, a chat archive or a plugin storage value) written into the `.bin` as
`coldstorage_<key>.json`.

**What a user gets, in plain terms.**
- A backup carries every readable unit that the database it writes refers to. That includes the chat
  archives and character archives that other archives point at (not only the ones the character list
  names), and the units named by the legacy "Cold storage data could not be loaded" error text in a chat,
  whether that chat is live or sits inside an archive.
- V3 plugin storage values are carried whatever their JSON shape (`null`, `0`, `false`, `""`, a string, a
  number, an array or an object of any shape), and a fork restore puts each one back. Before, only an array or
  an object holding a `message` or `character` key was carried (and not a falsy value), so an array was
  already carried; the values newly carried are the other shapes and the falsy ones.
- A legacy error-text key whose archive is absent on this device is left out, with no prompt. One that exists
  but cannot be read, or reads but is not a chat or a character, is listed in the incomplete-backup prompt,
  naming the character.
- A unit that is unavailable and was found inside an archive is attributed to the character the archive
  belongs to in that prompt, instead of being counted as one that "could not be linked".
- A plugin storage key created while the backup copies assets is carried in the written backup. If its unit
  cannot be read, the user is told when the backup finishes (the confirm has already passed), in the same
  message that reports missing assets.
- A live chat whose first message `data` is a number, an object or a boolean no longer stops the backup, and a
  character whose name is a number or an object (a non-nullish non-string) no longer makes the
  incomplete-backup prompt throw when that character is one the prompt names (section 3).
- A fork restore of a fork backup does not report a plugin storage unit as missing just because its value
  is not an array or a `message`/`character` object.

**The invariants** (`plan.md` section 2; each was a test target, section 4). The mechanisms in the code are
non-normative; the invariants are what the tests pin.

| Id | What holds now |
|---|---|
| B1 | The unit set is closed under "refers to". The roots are the keys `listColdDataKeysFromDb` lists plus the legacy error-text keys of live characters' chats; from every character archive (`{character: {chats}}`) or chat archive (`{message: [...]}`) the backup reads, the pointer keys and error-text keys it contains are followed into the archives they name, each key read once. Plugin units are carried and not walked, with one contrived exception: a plugin-mapped key that is also named by a pointer inside an archive read earlier becomes searchable before its own read, so it is shape-gated and walked; a plugin key found by a pointer after its own read is carried unwalked. Accepted at Gate 2, as one of the judgment calls the Orchestrator flagged (section 5). |
| B1a | A read that succeeded is always carried; the walk can only add keys. `listInnerColdStorageKeys` (`coldstorageData.ts`) is total over `{character: {chats}}`, `{message: [...]}`, a legacy bare message array and any malformed inner field (a non-string `data`, a missing `message`, a null chat): that part contributes no key and nothing throws. |
| B1b | The roots listing is total too. A live chat whose `message[0].data` is not a string (a number, an object or a boolean threw at HEAD; null and undefined did not) is not a pointer and is skipped. `listColdDataKeysFromCharacter` is shared by the roots, the prompt's character lookup and the manual clean-up, so all three get the same rule. |
| B2 | A key's kind is the strictest of all the ways it is reached. Reached by any pointer, stub, `coldStoragedChats` or plugin mapping, it is a normal key; it is an error-text key only when every reach is through error text. The kind (normal or error-text) does not depend on the order keys are reached in; whether a key is walked can, in the contrived plugin case under B1. An error-text key whose read is `missing` is left out with no prompt; one whose read is `error`, or that is not chat or character shaped, is reported. A normal key keeps today's treatment (`missing` or `error` is reported). A key the restore could not place (its backup entry name would not map back to it through `getColdStorageBackupKey`, `isRestorableColdStorageKey`) found inside an archive is reported when it was a pointer and left out when named by error text; it is never read or written. Keys the live database points at directly are read as listed (no filter). |
| B3 | An unavailable key reached through a character's archive is attributed to that character in the prompt (the collector returns an optional `owners` map; `getColdStorageAffectedCharacters` takes it as an optional third argument). |
| B4 | No parsed value is retained: `ColdStorageBackupPayload` no longer has a `value` field; the collector holds one parsed value at a time. The `encoded` bytes are still held until the write (section 7). |
| B5 | Byte compatibility. For every unit today's backup carries, the entry name is `coldstorage_<key>.json` and the bytes are the UTF-8 of `JSON.stringify(parsed value)`, as before. The `database.risudat` entry is unchanged. |
| B6 | Plugin storage (`MC-147` 1). Every `_coldplugin` unit that reads `ok` is carried. The restore's relaxed acceptance (`isAcceptedColdStorageBackupEntry`) applies only to an entry named `coldstorage_<uuid>.json`; a bare `<uuid>.json` or a `coldstorage/<uuid>.json` entry keeps the shape check, and an unshaped body is skipped with a `console.warn` and is neither a unit write nor an asset write. The restore's final check counts a key the restored database maps under `pluginCustomStorage._coldplugin` as present when its unit on the device reads `ok`, whatever the value; chat and character keys keep today's check. |
| B7 | The written database and the carried units agree. In `encodeDatabaseWithLateColdStorage` the roots are listed from the very object that is then encoded, with no `await` between the listing and the encode; a second collection (skipping the keys the first one settled) then reads the units first referenced after the first collection, and error-text roots whose unit was absent then and may exist now. Those units are written after the encode and before the `database.risudat` entry, which is still written last. An unavailable one is reported in the completion message. An existing key overwritten during the backup may be carried in either version (accepted). |
| B8 | Both backups follow B1-B7. |
| B9 | The collector's result stays `{payloads, missingKeys, invalidKeys}`; `owners` and `settledKeys` are optional additions (13 test files mock the old shape, per the plan). |

The new restore pieces are the pure functions `isAcceptedColdStorageBackupEntry` and
`isRestorableColdStorageKey` in `coldstorageData.ts`, tested unmocked. `readColdStorageItem` (the three-way
reader) is now also used by the backup collector and by the restore's final check; the eight drive test
files whose `vi.mock` factory for `coldstorage.svelte` lacked it gained it (one line each; 13 drive test files mock
that module and five already had the export), so no test runs against a factory missing an export that a call
site touches.

**Where the code is** (`git status`, on the uncommitted tree). Changed source: `src/ts/process/coldstorageData.ts`,
`src/ts/process/coldstorage.svelte.ts`, `src/ts/drive/backuplocal.ts` (all three CRLF in the working tree
and kept so). New tests: `src/ts/process/tests/coldStorageBackupCollect.svelte.test.ts` and
`src/ts/drive/tests/backuplocalUnitClosure.test.ts`. Changed tests: `a9` in
`src/ts/process/tests/coldStorageDeletionGuards.svelte.test.ts` (rewritten, CRLF kept) and the one
`readColdStorageItem` line in each of eight `src/ts/drive/tests/backuplocal*.test.ts` files. No translation
key was added.

## 2. The decisions

**`MC-147`** (the maintainer; recorded in `Agents/Maintainer-Context.md`):
1. **Step 4 includes V3 plugin storage.** A fork backup carries every plugin storage value whatever its
   shape, and a fork restore puts it back. An upstream build restoring such a backup skips the values that
   are not arrays or `message`/`character` objects, as it would miss them today. The maintainer chose this on a question the Orchestrator asked after the investigation
   (the alternative was a separate ticket).
2. **An error-text key whose archive is absent on the device is left out without a prompt.** One that exists
   but cannot be read is reported in the incomplete-backup prompt, naming the character. The maintainer
   chose this on the second question (the alternative was listing every absent error-text archive in the
   prompt).

**Two Orchestrator calls, made during the step and then approved by the maintainer in chat on 2026-10-01**
("changes looks like a good call to me; approved."), recorded as `MC-147` 3 and 4:
- **(a) `MC-147` 4: D13 is extended from character archives to chat archives.** Report 49 D13 says the backup
  "collects each blob's inner pointer keys and legacy error keys from the value it reads". Following the
  references inside a chat archive as well as inside a character archive is the intent of "from the value it
  reads"; the plan and the code do it, and the step record says so. (`MC-147` 4 quotes D13 as naming only
  "each blob's inner pointer keys"; the Report 49 text also contains "and legacy error keys". The extension
  is the same either way.)
- **(b) `MC-147` 3: the Gate 2 R2 disposition.** An error-text key whose unit reads `ok` but is not chat or
  character shaped is reported (in the same prompt, naming the character), not left out. The rationale is
  `MC-147` 2's: the backup is silent only when the unit is absent and so nothing is lost; this unit exists.
  The first implementation left such a key out silently, because `MC-147` 2 does not say. The Orchestrator
  applied the `MC-147` 2 rationale and told the maintainer in chat; the maintainer then approved it.
  `retryLegacyColdChatLoad` treats such a unit as an error, which is the reviewer's observation and agrees
  with reporting it.

## 3. Pre-existing defects fixed on the way

Items 1-3 predate step 4. Nobody has run the fork (`MC-011`), so they are described as defects of the code at HEAD
`10ce39a7` (`449b10e3`, the HEAD Gate 2 ran against, adds only wiki commits).
1. **Plugin storage values other than an array or an object holding a `message` or `character` key, and
   falsy ones, were left out of every backup and rejected by restore.** `isColdStorageBackupData` (in
   `coldstorageData.ts`, unchanged) is true for any array and any object with a `message` or `character` key,
   so HEAD already carried plugin values of those shapes (the guard "a plugin value that is an array is carried"
   passes at HEAD). The collector failed every other shape (`{a:1}`, a string, a number) on that check, and
   `null`, `0`, `false` and `""` on `if (!value)`, so they were never carried and raised the
   incomplete-backup prompt on every backup; the restore applied the same check. Upstream is identical (the writer read `git show upstream/main:src/ts/drive/backuplocal.ts`
   lines 495-502 and 550-551, and `coldstorage.svelte.ts` line 343; read, not executed). `MC-147` 1 decides it
   is fixed here.
2. **A live chat whose first message `data` was a number, an object or a boolean made the backup throw, with
   no backup written.** `listColdDataKeysFromCharacter` called `startsWith` on it (`data?.startsWith(...)`
   short-circuits only on `null` and `undefined`, so those did not throw); the collector's key listing ran before
   its per-key `try`, so the throw stopped the backup after "Saving local backup...". The Orchestrator verified the
   `startsWith` throw in source (Gate 1 round 2, section 5), and scenario 17b fails at HEAD on that
   `TypeError` (the Orchestrator's red re-run, section 4).
3. **A character whose name was a number or an object made the incomplete-backup prompt throw.**
   `getColdStorageAffectedCharacters` computed `character.name?.trim()` for every character it named; a non-nullish
   non-string name has no `trim` (the HEAD line is in the diff). It only happened when that character was one the
   prompt would name (a null or undefined name did not throw). Gate 2 found this as
   R1 when the new roots code copied the same expression for every character, where it would have thrown on
   every backup whose database held such a character (section 5); the "prompt shown" test variants also fail at HEAD. The label is now total:
   `getColdStorageCharacterLabel` uses the trimmed name when it is a non-blank string, else a string `chaId`, else
   `language.errors.coldStorageUnknownCharacterName`.
4. **The same totality change reaches the manual clean-up (a consequence, not a defect).**
   `matchColdStorageLoadErrorKey` now takes `unknown` and returns null for a non-string. At HEAD it called
   `text.startsWith` after `if (!text)`, so `listRecoverableErrorKeysFromDb` (the manual clean-up's error-key
   listing, which passes `chat.message?.[0]?.data`) would also have thrown on a numeric first-message `data`
   (read in the diff; not run). The clean-up's use of `listColdDataKeysFromDb` shares the total
   `listColdDataKeysFromCharacter` too.

## 4. Tests and checks

Two new test files, 109 tests, plus `a9` rewritten (counts from `final-counts.json`, the final run, by title
prefix):

| File | Tests | Titled `guard:` | Result |
|---|---|---|---|
| `src/ts/process/tests/coldStorageBackupCollect.svelte.test.ts` | 61 | 25 | all pass |
| `src/ts/drive/tests/backuplocalUnitClosure.test.ts` | 48 | 17 | all pass |
| `src/ts/process/tests/coldStorageDeletionGuards.svelte.test.ts` (`a9` rewritten; 70 tests in the file) | | 0 | 69 pass, 1 skipped (`a6`, pre-existing) |

- The collector tests use the real `setColdStorageItem` and `readColdStorageItem` over the OPFS mock, in the
  style of `coldStorageDeletionGuards.svelte.test.ts`; the drive tests run the real `SaveLocalBackup`,
  `SavePartialLocalBackup` and `LoadLocalBackup` with the real collector, the real `setColdStorageItem` and
  `readColdStorageItem` and the real `LocalWriter`, replacing only the storage and output sinks (`streamsaver`,
  an OPFS stand-in, the key/value store) and the dialogs. **They model the web/OPFS backend only.** No Tauri or Node
  backend behaviour is claimed by any test.
- A "guard" here is a test that passes both before and after the change and pins what must not move (for
  example: `encoded` equals `TextEncoder.encode(JSON.stringify(storedValue))` and the entry name is
  `coldstorage_<key>.json`; a bare or `coldstorage/` entry with an unshaped body is still skipped; an absent
  error-text key raises no prompt). The red tests are regression reproducers.
- **Red at HEAD, first run** (the test-warrior's tests as first written, against HEAD production sources;
  the Orchestrator re-ran it: `orch-red.log`, same counts): across the three files, 138 tests, **38 failed,
  99 passed, 1 skipped**. That was 20 of the 40 collector tests, 17 of the 28 drive tests and `a9`. The only
  `TypeError`s are scenario 17b's production throw from `listColdDataKeysFromCharacter`; the other failures
  were assertions on the intended behaviour.
- **Red at HEAD, final tests** (Gate 2 round 2, executed: HEAD production sources with the current tests, via
  a Vite load hook, before the guard relabel below): **68 failed, 110 passed**. The 68 are the 67 tests not
  titled `guard:` in the two new files (109 minus 42 guards) plus `a9`: 63 fail on their intended assertions and
  5 fail by the production `TypeError` they target (`startsWith` on a non-string first-message `data` once;
  HEAD's prompt calling `trim` on a non-string name four times). **Every `guard:` test passes at HEAD.**
- **The remediation tests** (R1, R2 and the O3 gaps) were written against the tree before the remediation:
  of the 109 tests in the two new files, **29 failed and 80 passed there** (`orch-remed.log`, the
  Orchestrator's re-run). That evidence is against the intermediate tree, not against HEAD. The R1 "prompt
  shown" variants also fail at HEAD (section 3, item 3).
- **E7 relabel.** Gate 2 round 2 found eight cases (three titles, each run with a number and an object, and
  one drive title under both saves) that pass at HEAD and were not titled `guard:`; the Orchestrator added the
  prefix. That raised the guard counts to 25 and 17 above; the 68-failure run above is from before the
  relabel, and it is consistent with the relabeled titles because those eight were passing at HEAD.
- **Mutants** (Gate 2, in memory, the reviewer's scratchpad). Round 1, as the reviewer reported it (recorded
  in `records-notes.md`; its per-mutant files are not on disk): 21 run, 18 killed, 3 survived (the legacy
  bare-array walk; the late pass ignoring `settledKeys`, which writes every unit twice; the late-only
  completion header). Round 2 killed the 3 survivors and ran 4 more on the fixes, 3 killed, 1 harmless
  survivor (`labelRevertChaIdOnly`: the fallback to a non-string `chaId` is untested). Tests that killed each
  mutant in round 2, as the hand-back recorded: `walkerNoLegacyArray` 3, `lateIgnoresSettled` 6,
  `lateOnlyHeader` 1, `lateOnlyHeaderPartial` 1, `labelRevert` 18, `invalidGate` 11, `pluginSearched` 16,
  `noLatePass` 7. On disk, the 25 result files in `gate2/` are the final-state runs: 24 killed, and
  `labelRevertChaIdOnly` survives.

**Checks** (the final run, section top): `pnpm test` 229 files, 3876 passed, 4 skipped; `pnpm check` 0/0;
`pnpm build` exit 0. The first full run on the implementation snapshot, before the remediation, was
3835 passed (3767 plus the 68 tests of the first two files' first versions, 40 + 28); it is superseded.

## 5. Gate record

### Gate 1: the plan (`adversarial-reviewer`, ledger row 518)

Reviewed `plan.md` r1 against HEAD `10ce39a7` and the uncommitted `MC-147` 1 and 2.
- **Round 1: [REJECT]** (~140k tokens, 30 tool uses).
  - **F1:** scenario 12's premise was false. A bare `<uuid>.json` or `coldstorage/<uuid>.json` entry with an
    unshaped body is skipped with a warning, not stored as an asset; the plan's relaxed-restore rule had to be
    scoped to the `coldstorage_<uuid>.json` name only (it is B6's "required" clause).
  - **F2:** the seams could not go red: the plan's tests mocked the collector and mocked
    `isColdStorageBackupData` to `true`. The plan now requires the real collector, the real acceptance rule
    and the mock-factory update.
  - **F3:** the B2 tie-break (order-independent classification) and a rule for non-UUID pointer keys.
  - **F4:** the walker had to be total (B1a).
  - **N1** the B7 window (the late listing and the encode, with no `await` between); **N2** the final check
    for plugin keys; **N3** labels; **N4** Tauri root pointer keys used unvalidated in a path; **N5** Tauri
    `os error 3`; **N6** a unit named only by error text inside a chat unit is not followed by the manual
    clean-up (became CHORE-51); **N7** the restore's final check covers top-level keys only. N1, N2, N3 and N6
    were adopted into the plan; N4, N5 and N7 were recorded as limits (section 7).
- **Round 2: [EDITORIAL]** (~16k tokens, 3 tool uses). Scenario 17 was relabelled and 17b added: the roots
  listing throws at HEAD on a number, object or boolean `data`, so no backup is written (the Orchestrator verified the
  `startsWith` throw in source). The final-check seam needs `readColdStorageItem`, so the eight mock factories
  are updated in the same change. The Orchestrator applied both and updated scenarios 13 and 18.

### Gate 2: the implementation (`opus-reviewer`, ledger row 519)

Ran on the working tree against HEAD `449b10e3` (two wiki-only commits after `10ce39a7`), with executed
evidence.

**Round 1: [REJECT]** (~246k tokens, 121 tool uses, ~18 min).
- **Executed:** the two acceptance files on the working tree (the three acceptance files: 137 passed); the
  same tests with HEAD production sources through a Vite load hook (38 failed, every non-guard test on its
  intended assertion; every guard passed at HEAD); 21 in-memory mutants (18 killed, 3 survived, as the reviewer reported; section 4);
  scratch probes.
- **R1 (blocking):** `listColdBackupRoots` computed a label for every character through `name?.trim()`. A
  character whose name is a number or an object made the roots listing throw, so no backup was written. HEAD's backup did
  not do that. The Orchestrator confirmed it in the diff. Fixed (a total label, section 3 item 3) with tests
  (collector and drive, both saves, with and without a prompt shown).
- **R2:** an error-text key whose unit reads `ok` but is not chat or character shaped was dropped silently
  (the first implementation gated invalid keys by `normalKeys`); `retryLegacyColdChatLoad` treats it as an
  error. The Orchestrator reported it instead (`MC-147` 3; section 2). Fixed, with tests.
- **E1-E5 (editorial):** the restorable-key doc, the collector's doc, the test header and a `describe`, the
  `readColdStorageItem` doc, and the `encodeDatabaseWithLateColdStorage` doc.
- **O1-O6 (optional):** the late-pass message wording; the owners doc; three test gaps (each unit written and
  read once, a legacy bare-array error key, the late-only completion message); `isRestorableColdStorageKey`
  through `getColdStorageBackupName`; the drive test header overstated; B3's partial attribution. O1, O2,
  O3, O4 and O5 were applied; **O6 was not acted on** (section 7).
- The reviewer's judgment calls the Orchestrator had flagged were accepted: the late pass re-reads silent
  error-text roots; an empty pointer key; a plugin unit later reached by a pointer is not searched again.

**Who applied what.** `test-warrior` wrote the R1, R2 and O3 tests first (29 failed on the pre-remediation
tree, section 4). `sonnet-coder` then made the label total, removed the `normalKeys` gate on invalid keys (R2),
and applied E1-E5, O1, O2, O4 and O5. The late completion message is now: "The following cold storage units
are not in the backup. They were first referenced while the backup ran, or they could not be read or were
unusable when the backup reached them:". The Orchestrator ran the pre-gate checks on that snapshot (the
comment-history grep: zero hits; the full suite 3876 passed, 4 skipped; `pnpm check` 0/0; build exit 0).

**Round 2: [EDITORIAL]** (the same reviewer, ~35k tokens incremental, 24 tool uses). Executed: the working tree
(the three acceptance files: 178 passed, 1 skipped); HEAD production sources with the
current tests (68 failed, 110 passed); the mutants re-run (the 3 round-1 survivors killed, 1 harmless survivor left; section 4).
- **E6:** the `readColdStorageItem` doc named a "migration scan"; the scan is the asset keep-set scan
  (`resolveUncleanableChars` in `globalApi.svelte.ts`). Corrected.
- **E7:** eight test cases pass at HEAD but were not titled `guard:`. Relabelled (section 4).
- **Optional:** the E5 doc is incomplete (unplaceable error-text roots), the collect header's invariants list,
  the drive header's `getDatabase` mention. Applied with E6 and E7.
- The Orchestrator applied all of it with an exact-match script (comment and title text only; the line endings
  were checked: the CRLF sources are unchanged in kind and the LF tests have 0 CR). Both acceptance files pass
  (109); the comment-history grep over the `src/` diff found zero hits. Editorial-only, so no full re-run.

The three-round rule did not apply: one [REJECT] and one [EDITORIAL] round at each gate.

## 6. Compatibility

- **`.bin` entry names and bytes are unchanged for every unit the old backup carried** (B5; the byte guard
  `encoded` equals `TextEncoder.encode(JSON.stringify(storedValue))`, executed). New entries (inner chat and
  character archives, error-text units, plugin units of any shape) use the same name form and encoding. No
  change to the block format, the encoder, the `database.risudat` entry or the stub shape.
- **A fork restore of an upstream backup is unchanged.** Upstream writes only units that pass the shape check (an array, or an object with a `message` or
  `character` key) under `coldstorage_<uuid>.json`, which pass either rule. A bare `<uuid>.json` or `coldstorage/<uuid>.json`
  entry keeps today's behaviour exactly (the shape check applies; an unshaped body is skipped with a warning,
  and is neither a unit write nor an asset write): the relaxed acceptance in `isAcceptedColdStorageBackupEntry`
  requires the `coldstorage_` prefix and a name `getColdStorageBackupKey` accepts (read in source; scenario 12
  is the guard, executed).
- **An upstream build restoring a fork backup:** every unit upstream's own backup would carry has the same
  name and bytes; extra shaped units (inner chat archives, error-text units) restore normally there; a plugin
  storage entry whose body is not an array or a `message`/`character` object is skipped with a `console.warn`, as
  `MC-147` 1 says. Arrays and `message`/`character`-shaped plugin values already restore on upstream; only
  other shapes are skipped there. Upstream's final check then lists a skipped key as missing and prompts, as it
  does today when the unit is absent. This is read from `upstream/main` (`backuplocal.ts` lines 495-502 and 550-551, where the shape
  check is applied at both places), not executed.
- **A fork restore of a fork backup** stores a `coldstorage_<uuid>.json` entry whatever its JSON body. The
  accepted limit (plan B6): by name alone, a valid-JSON but unshaped `coldstorage_<uuid>.json` entry for a
  chat key would be stored over the device's unit. Neither upstream nor the fork writer produces one.

## 7. What is not covered

- **No live check was run.** Nothing ran in a browser, on the Node server or in a Tauri build. The tests model
  the web/OPFS backend only.
- **CHORE-51 (filed with this step; DATA LOSS, open, not scheduled).** The manual clean-up's keep set
  (`KeepSet` in `src/ts/storage/manualCleanup.ts`) reads each stub's blob once (`summarizeBlob`) and adds that
  blob's pointer and error-text keys, but it never reads a chat unit, so it follows no reference inside one
  (pointers included; in practice the reference is error text, because `makeColdDataForChat` refuses a chat
  whose `message[0]` is already a pointer, and also one that is already the error text, so chat units that
  hold error text would come from upstream-archived data; inferred, frequency unknown). A unit named only by error text inside a chat unit is
  therefore not kept and the clean-up deletes it, and that chat's Retry then fails. It predates step
  4 and step 4 does not enlarge it; the backup now carries such units. Whether such chat units exist in real
  profiles is unknown (upstream re-archived chats that held the error text; frequency not measured). The new
  pure `listInnerColdStorageKeys` is written so the clean-up can reuse it. Fixing it changes the clean-up's read
  cost and step 1's gated design, so it is its own change (Roadmap, CHORE-51).
- **Tauri root pointer keys are used unvalidated in a path** (`'./coldstorage/' + key + '.json'`). Pre-existing;
  step 4's filter applies to keys found inside archives and to error-text keys, not to the roots the live
  database points at (Gate 1 N4).
- **The restore's final check covers only top-level keys of the restored database,** not keys inside restored
  blobs (Gate 1 N7; unchanged).
- **On Tauri a missing `coldstorage` directory reads as `error` (`os error 3`),** so an absent error-text unit
  there is reported rather than left out. The safe direction (plan B2; Gate 1 N5; from the plan, not executed).
- **O6, not acted on:** when a key K is in character B's own list (a stub or `coldStoragedChats`) and is also
  reached through character A's archive, the prompt names only B. `getColdStorageAffectedCharacters` consults
  the owners map only for keys no character's own list resolved (read in the diff). The reviewer called it
  unrealistic.
- **The non-string `chaId` fallback in `getColdStorageCharacterLabel` is untested** (the surviving mutant
  `labelRevertChaIdOnly`; harmless).
- **The late-unit completion message is English and not a `src/lang` key,** as the existing missing-assets
  message in the same function is.
- **`encoded` bytes are still held until the write** (B4 drops only the parsed `value`). Writing units as they
  are read and the inline-everything backup are stage 2 (`MC-145`).
- **Step 6's hang points for a backup-in-progress signal** (the idle-reload guard of D13's second sentence is
  not in this step). From the investigation: the early `return`s of `SaveLocalBackup` and
  `SavePartialLocalBackup` (the confirm refusal is one; the writer saw several `return` statements and did not
  trace each) and the `finally` of `LoadLocalBackup`. A signal that is set at the start of each must be cleared
  on every one of those paths.
- **Not run, not claimed:** a mocked success of a backend read is not evidence of Tauri or Node behaviour.

## 8. Open follow-ups

1. **CHORE-51** (section 7): the manual clean-up and error-text keys inside chat units.
2. **Step 5** (the boot pass; Report 49 section 3.4) is next. It owns the `§` exclusion from archiving, the
   retirement of the 10-day paths, `loadInternalBackup` and the other items Reports 50-53 left for it.
3. **Step 6** (the idle reload) must use the hang points in section 7.
4. **A live check of the backup and restore** on an archived profile (a combined live check with 3a and 3b,
   Report 53 section 6, item 4): a backup of a profile with archives that hold pointer chats and error-text
   chats, and a restore of it, on the Node server and in a web build.
5. **Optional:** the `labelRevertChaIdOnly` test; the Tauri root-key path validation (N4).
