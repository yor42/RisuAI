# Report 50 — Memory stage 1, step 1: the exclusive manual clean-up (D11) and no startup asset sweep once a stub exists (D12)

**STATUS:** done, 2026-09-30. **Gate 2 approved at round 3** ([APPROVE]): round 1 [REJECT], round 2
[EDITORIAL], round 3 [APPROVE], all by `opus-reviewer` (ledger rows 488-490). Committed as
`2b3dd636`; this report is added by the records commit that follows it. Steps 2-7 of Report 49 are
not started, so memory stage 1 as a whole is not done. The plan was gated once, as part of the stage
plan (Report 49, Gate 1); this step had its own Gate 2 only.

Final checks by the Orchestrator on the final snapshot: `pnpm test` 205 files, 3436 passed, 4
skipped; `pnpm check` 0 errors; `pnpm build` exit 0. Every backend result in the tests comes from
fakes (Node server, OPFS, plugin-fs, Web Locks). Nothing was run in a browser or a Tauri build.

**Sources** (scratchpad `memfoot/step1/`; not durable, so this report and ledger rows 487-492 are the
durable record):
- `brief.md`: the invariants I1-I14, the acceptance scenarios S1-S21, the test-facing API and the
  Orchestrator's decisions;
- `packet.md`: the investigator's code map, whose refuted or shifted premises are P1-P9 (ledger row
  487);
- `gate2/review-r1.md`, `review-r2.md`, `review-r3.md`: the Gate 2 hand-backs, saved by the
  Orchestrator (the reviewer does not write report files);
- `commit-msg.txt`: the final commit message, which the reviewer fact-checked (ledger row 491);
- `Agents/Reports/49-memory-stage-1-plan.md` (section 3.3 D11 and D12; section 3.4 step 1).

Decisions this step implements: `MC-134` 3 (unused chat units are removed only by the manual
clean-up), `MC-137` 4 as amended by `MC-140` (orphaned units wait for a manual clean-up), `MC-138` 2
(an unreadable archive is shown with a notice), `MC-139` 3 (asset clean-up moves into the manual
clean-up; startup runs none once characters are archived), `MC-141` 2 (a shared Node server accepts a
short window, with a warning), `MC-142` (the `coldstorage` root field is left untouched), `MC-133` 2
(`init` unchanged; block format and encoder unchanged per Report 49 section 3.5), `MC-011` (the fork has never shipped; upstream data must
keep working), `MC-091` (scope amendments).

## 1. What step 1 changed

The Settings button that was "Clean Unused Cold Storage" is now one exclusive run that also deletes
unused asset files. Summary from the commit message (`commit-msg.txt`); the numbered invariants are
in the brief.

**Refusals and exclusivity.**
- It refuses while chat work is running (generating or sending) or the composer window is open, while
  saving is stopped, or while a character's id is frozen. It checks again before every deletion
  batch. A run stopped partway says how many items it had deleted.
- Web with Web Locks: it refuses while another tab of the app is open, and otherwise holds the
  exclusive storage lock for the whole run, which parks this tab's saves. Without Web Locks it asks
  an extra confirmation. On the Node server the confirmation warns against running it while another
  device uses the same server (`MC-141` 2). On Tauri there is no tab check.
- It refuses when the main file in storage is not the one this tab last read or wrote. The tab keeps
  a fingerprint of that file, not its bytes: SHA-256 per 4 MiB slice, or, without `crypto.subtle`, a
  JavaScript hash of the length, both ends and 256 sampled windows. With no record, it refuses.
- On the Node server the file is read with a new `NodeStorage.peekItem`, so the revision sent with the
  next save is unchanged and a peer's save still produces a 409.

**What it keeps.**
- An archived unit is kept when live memory, the committed main file or any retained `dbbackup-*.bin`
  snapshot references it, directly, through plugin storage, or inside the blob of an archived
  character. Each blob is read once. A missing, unreadable or mismatched blob stops the run, and the
  notice names the character and where the reference came from.
- The main file and the snapshots are decoded strictly. `decodeRisuSave` gains `{strict: true}`,
  which rejects a dropped or unparsable block, a missing remote file, a directory entry that is not
  in the file (no cache fallback), an unknown block type or remote-pointer version, and bytes that are
  not a RisuSave file (no legacy fallback after a failed decode; files with an
  older whole-file header such as `compressed`, `raw` or `stream` still decode as before, without
  strict checks). A snapshot pruned between listing and reading is skipped.
  Default decoding is unchanged for every other caller, apart from the decompress fix in section 3, C.
- Only units and assets that were present when this page loaded and are still present when the run
  starts can be deleted. The load-time listing is taken on every boot path before plugins load. If it
  fails, nothing can be deleted until the next load. A missing units directory is decided with
  `exists()`, because Windows reports it as os error 3.
- Assets are kept when live memory references them (read again just before each batch), when the
  committed main file references them, or when a character inside any blob read references them.
  Assets referenced only by a snapshot's own characters, modules or personas are not kept, as in the
  startup sweep.

**Deleting.**
- Node server deletes are sent in requests whose `file-path` header stays at most 8000 bytes. The
  code also caps a batch at 100 keys (`DELETE_BATCH_SIZE` and `NODE_REQUEST_KEY_BYTES` in
  `src/ts/storage/manualCleanup.ts`). One request used to carry every key, and Node's default 16 KB
  header limit answers 431 above about 165 unit keys (measured against a plain Node `http` server).
- Every failed delete is counted on every backend (a unit that is already gone is not a failure).
  The run ends with a notice giving the count, or with a completion notice.
- On Tauri a failed unit removal or file read counts as "already gone" only when the error is os
  error 2 and the file no longer exists. A failed asset removal is always counted.

**Startup (D12).** Once any character in the loaded save is an archived stub, the startup asset sweep
does not run. The integrity sample and the remote-file clean-up are unchanged, and a profile with no
stub keeps the existing behaviour.

**Strings.** The Settings label and confirmation say that unused asset files are deleted too.
The translator added 21 keys and reworded 2 (`cleanColdStorage`, `cleanColdStorageConfirm`) in each of
ko, cn, zh-Hant, vi, de and es.

**Where the code is.** New modules: `src/ts/storage/manualCleanup.ts` (the run; `cleanColdStorage()`
in `coldstorage.svelte.ts` stays the entry the button calls and loads it on demand),
`src/ts/storage/loadTimeListing.ts` and `src/ts/storage/mainFileRecord.ts`. Changed: `bootstrap.ts`,
`drive/backuplocal.ts`, `globalApi.svelte.ts`, `process/coldstorage.svelte.ts`,
`storage/nodeStorage.ts`, `storage/risuSave.ts` and the seven language files. The new code sits in new
modules because 43 test files `vi.mock` `coldstorage.svelte.ts` (Report 49, section 3.4; the code map
counted it again).

**Tests.** `manualCleanup.svelte.test.ts` with `manualCleanupHarness.ts` (a save-file composer, and
a fake Node server that mirrors the parts of `server.cjs` the clean-up depends on: revisions,
`if-match-revision` and the header ceiling), `risuSaveStrictDecode.test.ts`,
`loadTimeListing.test.ts`, `backuplocalMainFileRecord.test.ts`,
`globalApi.saveDbMainFileRecord.svelte.test.ts` (the real `saveDb` loop, web write path), and
additions to `coldStorageDeletionGuards` and the two bootstrap test files. Against `211e7603` with an
inert scaffold (the new option ignored, the new functions empty), every new test that is not a guard
fails on an assertion: 151 passed, 83 failed (commit message). One guard, the os error 2 listing
case, also fails there, only because the listing module is empty in the scaffold.

## 2. The Orchestrator's decisions

The investigator's code map (row 487) raised nine premises, P1-P9. The Orchestrator's brief answered
the ones below. Each is recorded as the brief states it.

| Packet premise | Decision |
|---|---|
| **P3**, D12's gate is the root flag `db.coldstorage`, not "a stub exists" | Read "a profile with no stub keeps today's sweep" literally. The startup asset sweep runs only when today's gate lets it run (`db.coldstorage` false, or the `cleanColdStorage` option true) **and** no character in the loaded tree is a stub. It never deletes more than today. |
| **P4**, the early return also skips the remote-block GC | D12 gates the asset sweep only. The remote-block GC after it keeps exactly today's gate. The integrity sample above the early return stays where it is (guard: `bootstrap.staleAccountProfile.svelte.test.ts`, "I17"). |
| **P5 and P6**, a Node batch delete overflows the header limit; delete failures are swallowed | Scope amendment (`AGENTS.md` `MC-091`, shared-cause correction); see section 3. |
| **P2**, nothing records "main changed" | A module-level record of the main file as this tab last read or committed it, set at every point where this tab reads the main file at boot and where `saveDb` and `LoadLocalBackup` write it. D1's fenced commit (step 5) will reuse it. It must not depend on `crypto.subtle`, which a non-secure context lacks. With no record, the clean-up refuses. |
| **P8**, an unreadable blob referenced by an old snapshot would stop every clean-up | Follows `MC-138` 2: an unreadable or missing blob referenced by any keep source stops the clean-up. The notice names the character and the source: live, the committed file, or the snapshot's file name. |
| **P1**, the wait overlay is one shared store entry that a toast replaces | The wait indicator is visible during every deletion batch, on every backend, even if something (a toast) replaced it meanwhile. |
| **Busy.** D17's registry does not exist until step 6 | Step 1 refuses on what exists today: `hasAnyWork()` / `isWorkInProgress()`, a frozen chaId, `savingStoppedReason` set. Step 6 extends it. |

No decision for P7 or P9 is recorded in the brief. P7: `resolveUncleanableChars` is module-private
and reads blobs with `getColdStorageItem`, which collapses missing and error into `null`; the new code
reads blobs with the three-way `readColdStorageItem` (packet). P9: `loadInternalBackup` does not reload or write the main file, so
the load-time listing is stale after it; the packet marks this INFERRED as harmless for step 1 and
noted for step 5.

## 3. Scope amendments and additions

Only P5 and P6 are labelled an `MC-091` amendment in the brief. The other four are recorded here in
the same form. Each states the failure if left, the causal link and the smallest correction.

**A. Node batch deletes and failure reporting (P5, P6).**
- *Failure if left:* the Node server rejects a delete request carrying more than about 165 unit keys
  (HTTP 431). The packet's probe, `hdr.cjs`: on a plain `http` server with 96 hex characters per key
  (`coldstorage/<uuid>`), 160 keys returned 200 and 170 returned 431; Node v24.19.0's default
  `maxHeaderSize` is 16384. `removeColdStorageItems` catches every error on all three backends, so the
  clean-up cleared its wait indicator and reported nothing, having deleted nothing. After archiving,
  one session can leave hundreds of orphans (`MC-137` 4 as amended by `MC-140`; `MC-139` 2 for the
  volume), so the first real clean-up would leave hundreds of them.
- *Causal link:* the clean-up deletes through `removeColdStorageItems`, which sent every key in one
  `file-path` header.
- *Smallest correction:* deletes in bounded batches, and any failed delete is counted and reported.
- Reverse proxies with a smaller header limit were not checked (packet, section 11).

**B. `NodeStorage.peekItem` (invariant I7).**
- *Failure if left:* `NodeStorage.getItem` overwrites the stored revision for the key (`knownRevisions`,
  `nodeStorage.ts` at `211e7603`), so a re-read of the main file for the comparison would replace the
  baseline this tab's next save sends. A peer save made before the clean-up would then no longer
  produce a 409 on this tab's next save.
- *Causal link:* the clean-up must read the main file and the snapshots on the Node server, and the
  only read endpoint returns the full body and a revision.
- *Smallest correction:* a read that does not adopt a revision (`peekItem`). Scenario S15 pins it.
- Round 1 N7 records a side effect: `getItem` no longer adopts a revision when the body read fails
  (benign; accepted).

**C. The decoder's decompress fix (default decode).**
- *What changed:* in `RisuSaveDecoder.decode`, a compressed block is written and closed on a
  `DecompressionStream`; the `write` and `close` promises now have `.catch(() => {})`, so a payload
  that is not valid gzip fails through the read, into the block's own catch. Before, those two
  promises could reject on their own. The block is still dropped in default mode, as before; in
  strict mode it rejects the decode.
- *Effect, as the reviewer states it (round 1 N8):* the default-decode gzip catch also suppresses a
  post-boot `alertError` for v0 or encoder-bug payloads. The reviewer judged this acceptable.
- *Why it was needed (shared cause):* the test agent writing the strict-decode tests found that a
  compressed non-root block whose payload cannot be decompressed makes the un-awaited
  `writer.write(...)` reject with `Z_DATA_ERROR` as an unhandled rejection, even in default mode, so
  the case could not be included in the strict tests at first. Strict mode must reject on exactly that
  failure (I3), so the Orchestrator put the fix in the coder's brief. In default mode such a block is
  a dropped block with no unhandled rejection; in strict mode the decode rejects.
- *Evidence:* two reproducers in `risuSaveStrictDecode.test.ts`, "a compressed non-root block whose
  payload cannot be decompressed > strict decoding rejects and leaves no unhandled rejection behind"
  and "> default decoding resolves and leaves no unhandled rejection behind", were red on the base
  with `expected [ TypeError { code: 'Z_DATA_ERROR' } ] to deeply equal []`.
- *Left as is (out of scope):* the top-level legacy "stream" header branch keeps the same un-caught
  pattern; the coder did not change it.

**D. N5: assets referenced only by the committed main are kept (I5 extended).**
- *Failure if left (reviewer's sequence, round 1 N5):* with the first draft's keep-set, an avatar
  change is parked under the lock, the clean-up deletes the old avatar, the page dies before the save,
  and the main file in storage then points at a deleted asset.
- *Causal link:* the brief's I5 kept live references and the assets of every blob read, but not what
  the committed main file itself references.
- *Smallest correction:* add the committed main's own asset references (`getUncleanablesSync` over the
  committed tree) to the keep-set. Adopted; round 2 verified it.
- Snapshots do not get the same treatment: a retained snapshot's own characters, modules and personas
  keep no assets, as in the startup sweep (round 2 ED1 required the module comment to say so).

**E. The stricter Tauri "already gone" rule.**
- *Failure if left:* round 2 found a change that was not on the Orchestrator's list: the
  missing-file test for Tauri file reads (`isMissingTauriFile`) decided by `exists()` alone. The
  reviewer noted that Rust's `Path::exists()` is false on any metadata error, so a snapshot that is present but cannot be stat'ed would be skipped, weakening I3
  (strict reads) in principle. No concrete path was found; it is a suspicion.
- *Smallest correction:* `isMissingTauriFile(path, error)` requires os error 2 **and** `!exists`.
  Adopted by the Orchestrator and re-checked by the reviewer in round 3 (a behaviour change).
- *Cost:* one stricter-rule refusal (round 3): on Windows a delete-pending snapshot, during a
  concurrent `getDbBackups` prune (Tauri saves are not parked), gives os error 5. The run stops with
  the generic `coldStorageCleanupFailed` notice, nothing deleted, and a retry succeeds. Loud and safe.
- The units directory is different: it is decided with `exists()` after a failed `readDir` (the
  directory counts as missing only if `exists()` is false; finding F1 below), because a missing
  directory is os error 3 on Windows.

## 4. Gate 2 record

`opus-reviewer` was used because the failure mode is silent data loss on a persistence path
(`AGENTS.md` section 4). The same reviewer instance ran all three rounds and the commit-message
check. It ran on the working tree, not on a commit. It used mutants built in its own scratchpad by a
Vitest config that swaps module sources at load. Ledger rows 488-491 hold the costs.

### Round 1 — [REJECT] (~330k tokens)

Snapshot: `211e7603` plus uncommitted `src/` changes (10 modified, 8 untracked; +465/-222).

Execution evidence: working tree, 7 test files, 217 passed, 1 skipped. Base plus an inert scaffold
(six files from `211e7603`; `loadTimeListing` and `mainFileRecord` as empty scaffolds): 147 passed,
70 failed; all 62 non-guard tests in the four new files and 8 new bootstrap non-guards fail on the
intended assertions, and all 41 guards pass. 30 mutants: 19 killed, 11 survived (counted from the
lists in the hand-back). A record diagnostic showed both digest paths working, and that the JavaScript
path misses a same-length flip in an unsampled window (a documented residual). A Windows probe:
`read_dir` on a missing directory returns os error 3, and `tauri-plugin-fs` 2.5.2 passes the text
through.

| Finding | Content | Disposition |
|---|---|---|
| **F1** MAJOR | `listTauriDirectory` in the load-time listing treated only "(os error 2)" as missing. A missing directory on Windows is os error 3, so the listing became "no listing" and every clean-up would refuse forever on a Windows profile without a `coldstorage` directory. Broke I12; the comment was false. | Fixed: when `readDir` fails, `exists()` decides whether the directory is missing, with a test. Verified in round 2. |
| **F2** MAJOR (test) | The Node S13 test passed with mutant M16 (the failure count dropped; the run ended "7 unused item(s) were deleted" with nothing deleted). | Fixed: the failure-count tests on Node (409, 431, 500), OPFS and Tauri now require an `alertError` containing the failure count and no `alertNormal`, which kills M16. Verified in round 2. |
| **F3** MINOR | A stop partway wrapped "not started ... Nothing was deleted" reasons inside "stopped partway: N deleted". | Fixed: `currentRefusal()` returns an at-start wording and a partway wording, with new English strings `coldStorageCleanupStoppedBusy`, `coldStorageCleanupStoppedSavingStopped` and `coldStorageCleanupStoppedFrozen(characterGroups)`. A partway notice never embeds "was not started", "was skipped" or "Nothing was deleted". Three reproducers stop a run at 100 of 250 deletions. Verified in round 2. |
| **E1** | Comments (module comment, `KeepSet.addTree`, test header) claimed assets reachable from the committed main and snapshots were kept; they were not. | Fixed; see round 2 ED1 for the reworded version. |
| **E2** | `coldStorageDeletionGuards` comments described the removed `collectColdCharacterKeysOrAbort`. | Fixed. |
| **E3** | The `loadTimeListing.test.ts` guard "resolves when only the units listing throws" broke `realStorage.keys`, which the code never calls, so it was vacuous. | Fixed. |
| Translations (required before release) | `cleanColdStorage` and `cleanColdStorageConfirm` in the six languages understated the deletion (assets). | Sent to the `translator` after the gate. |
| **N1** | S21 (the `saveDb` record) untested. The reviewer named `globalApi.saveSequence.svelte.test.ts` as a real-`saveDb` harness. | **That was wrong:** that file tests extracted helpers. The test agent wrote `globalApi.saveDbMainFileRecord.svelte.test.ts` instead; the reviewer accepted the correction in round 2. |
| **N2** | The Node 8000-byte budget was untested (mutant M09). Asset keys are about 76 characters, 152 bytes hex-encoded in the header, so 100 keys are about 15.2 KB of header. | Verified in round 2. |
| **N3** | Untested: the live-unit re-check per batch (M05), strict unknown block type and remote-pointer version (M18, M19). | Verified in round 2 for M18 and M19 (the commit message lists the strict unknown block type and remote-pointer version among the strict rejections). M05 left untested by decision; see the survivors below. |
| **N4** | The sampled JavaScript fingerprint on a Node server without `crypto.subtle`; the Node revision would be exact. | **Deferred to CHORE-49** (round 2). See section 6. |
| **N5** | Assets referenced only by the committed main were deletable (section 3, D). | Adopted; verified in round 2. |
| **N6** | `unitCandidates` held every present unit, and each batch re-walked the live database. | Fixed: unit and asset candidates are pre-filtered by the recorded keep-set before batching; the per-batch synchronous check reads only live references; the progress counter counts deletion candidates only. Verified in round 2. |
| **N7** | `getItem` no longer adopts a revision when the body read fails. | Accepted (benign). |
| **N8** | The default-decode gzip catch suppresses a post-boot `alertError` for v0 or encoder-bug payloads. | Accepted. |
| **N9** | `coldStorageCleanupAborted` dead; `coldStorageCleanupMainUnknown` wording does not cover a failed digest; M28 safe; the working copy of `bootstrap.tauriStaleAccountPin.test.ts` was LF (blob unaffected). | Listed as verified in round 2. The key is still defined; see section 6. |

Held in round 1: I1, I2, I4, I5; I3 (strict is all-or-nothing, default unchanged apart from N8); the
I6 race (fail-safe); I7; I8-I11 apart from F2 and N2; I12 apart from F1; I13 and P4; I14; the lock is
released on every exit; no wait overlay is left behind.

Round 1 mutants that survived: M05 (no per-batch re-check test; N3), M08 (equivalent), M09 (N2),
M16 (F2), M18 and M19 (N3), M22-M25 and M28 (the reviewer's N1 lists M22-M25 as fail-safe: they only
cause refusals; N9 calls M28 safe). The round-2 mutant set re-targets the round-1 survivors; R09,
R16, R18, R19, R22, R23 and R28 were killed (R28 re-targets M28 as a failed listing recorded as
empty). M24 and M25 correspond to R24 and R25, and M05 to R05; those three still survive in round 2.

### Round 2 — [EDITORIAL] (~49k more, same reviewer)

- F1-F3 and E1-E3 verified fixed; N1, N2, N3, N5, N6 and N9 verified. The reviewer accepted the
  Orchestrator's correction of its N1.
- Evidence: working tree, 8 test files, 231 passed, 1 skipped. Against the round 1 implementation, 5
  tests failed exactly as intended (os error 3, three partway strings, the committed-main asset).
  Base plus scaffold: 151 passed, 80 failed, and every new non-guard fails. (The final base-run figure
  is 83 failed; see the commit message in section 1.) 19 mutants: 14 killed, 5 survived.
- New strings judged accurate; translations were still open.
- **ED1:** the `manualCleanup.ts` module header said a retained snapshot keeps no assets; the code keeps
  the assets of blobs reached through snapshot stubs (as I5 says). Reworded.
- **ED2:** the `keepFromMainFile` comment claimed saves are parked for the whole run; that holds only
  on web with Web Locks. Reworded.
- **Unlisted change** (found by the reviewer, not in the Orchestrator's list): `isMissingTauriFile` used
  `exists()` alone. Acceptable, but the reviewer raised the suspicion in section 3, E and offered the
  stricter form as optional.
- **Dispositions by the Orchestrator:** ED1, ED2 and the doc comment fixed; the stricter file check
  adopted (a behaviour change, so the reviewer re-checks it); N4 deferred to CHORE-49; N7 and N8
  accepted.

Round 2 mutants that survived: R05 (the live-unit re-check per batch; no test by decision, section 5),
R24 and R25 (the two boot record notes; fail-safe, since a missing record only makes the run refuse),
R32 (a snapshot keeping its own assets; it keeps more, so it is safe) and R38 (`isMissingTauriFile`
always false; loud).

### Round 3 — [APPROVE] (~15k more, same reviewer)

- ED1 and ED2 verified against the code: `addTree` adds blob assets for every stub in every tree;
  snapshots pass `keepOwnAssets=false` and the committed main passes `true`; `dbWriteLock` is held for
  the run only on web with Web Locks.
- `isMissingTauriFile(path, error)` (os error 2 and `!exists`) judged correct on every Tauri platform:
  `plugin-fs` 2.5.2 embeds the `io::Error` text, a missing file in an existing directory is os error 2
  on Windows and Unix, and both callers' parent directories exist. The one refusal it found is in
  section 3, E.
- 7 further mutants (`mutants3/`): the S1-S4, S6 and S7 mutants killed; S5 (accepting os error 2 or
  3) survives, with no consequence.
- Control: the 8 step test files, 234 passed, 1 skipped.
- Optional, not applied: the `coldStorageCleanupFailed` text ("failed partway through") is also shown
  when a read error stops the run before any deletion (a pre-existing string).
- Not reviewed in round 3: `src/lang/{ko,cn,zh-Hant,vi,de,es}.ts`, which the `translator` was editing
  concurrently.

### Commit-message check (ledger row 491) — [EDITORIAL]

The reviewer fact-checked the commit message. Its hand-back listed 8 corrections, all applied by the
Orchestrator:
- three required: the stale base figure (80 to 83) and the failure message; the one guard that fails
  on the base; the title overstating what is kept;
- three recommended: the decoder wording; the harness description; the source of the 431 figure;
- two missing "Not covered" items: the untested boot-read and Tauri-write record notes, and the
  untested live unit re-check.

It also gave four optional precisions (work and composer wording, "at most 8000 bytes", "already gone
is not a failure", the D12 sentence), which were applied too. The message in `commit-msg.txt` is the
corrected one.

## 5. What is not covered

From the commit message:
- Without `crypto.subtle`, a same-length change to the main file in bytes the sample skips goes
  unnoticed. That context has no Web Locks, so the run already asks the user to confirm no other tab
  is open. It matters on the Node server only over plain HTTP, which does not boot on this code
  (CHORE-49). The same residual exists today on a static web build served over plain HTTP (it boots
  and saves, ledger row 485); only the no-Web-Locks confirmation covers it there, and there is no
  revision to compare.
- The record of the main file taken at the two boot reads, and the one taken after `saveDb`'s Tauri
  write, have no test; a missing record only makes the run refuse.
- The re-check of live unit references before each batch has no test; nothing in this step makes a
  unit that existed at load newly referenced during a run.
- Every backend result comes from fakes (Node server, OPFS, plugin-fs, Web Locks); nothing was run in
  a browser or a Tauri build.

Also, by design (`MC-141` 2; the brief's I8 records the dialog warning): on a Node server shared by two devices, a unit another
device wrote before this page loaded and has not yet committed may be deleted. This is accepted with
a warning in the dialog (`MC-141` 2).

## 6. Open follow-ups

1. **A native-speaker check of the translations.** The translator flagged the consent and warning
   strings in every language, and a few Korean phrasings, for a native-speaker check.
   - The reviewer confirmed, in the commit-message check (ledger row 491, not in rounds 1-3), that no
     translated consent or warning string (`cleanColdStorageConfirm`,
     `coldStorageCleanupNoLockConfirm`, `coldStorageCleanupNodeConfirm` in ko, cn, zh-Hant, vi, de and
     es) drops a consequence the English states.
   - The maintainer reviewed the Korean strings and accepted them ("korean translation looks good
     enough", 2026-09-30).
   - The native-speaker check remains open for cn, zh-Hant, vi, de and es.
2. **N4: the sampled fingerprint on a Node server without `crypto.subtle`.** Not reachable today,
   because the Node server does not boot over plain HTTP (CHORE-49, `MC-144`). When CHORE-49 is
   fixed, this residual becomes reachable on the Node server. The Node revision gives an exact
   alternative. Noted in the Roadmap under CHORE-49. The same residual exists today on a static web
   build served over plain HTTP (it boots and saves, ledger row 485); only the no-Web-Locks
   confirmation covers it there, and there is no revision to compare.
3. **The `coldStorageCleanupFailed` wording.** "Failed partway through" is shown also for a read-error
   stop before any deletion (round 3, optional; a pre-existing string).
4. **`coldStorageCleanupAborted` is unused.** It is still defined in the seven language files
   (`src/lang/*.ts`) and no other file under `src/` references it (grep at `2b3dd636`). Removing it is
   a translation-file edit, so it goes through the `translator` or the maintainer.
5. **No live verification.** Nothing was run in a browser or a Tauri build. The reviewer's Windows
   probe in round 1 was a small Rust program (scratchpad `oserr.rs`) that printed `std::fs` error
   text, including os error 3 for `read_dir` on a missing directory; no Tauri app was run.
6. **The live-unit re-check per batch is untested by decision** (round 2, R05; section 5).
