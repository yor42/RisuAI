# Fix &amp; Expansion Roadmap

Derived from [`Summary.md`](Summary.md), the four round-1 reports, four round-2 deep-dive reports, and the standalone multi-instance-conflict report (05) in [`Reports/`](Reports/), each cross-validated by an independent Codex adversarial-review pass (see [`CodexReviews/`](CodexReviews/)). Each item cites its source report for full detail before implementation begins.

Ordering principle: **fix data-loss and correctness first (cheap, high-trust-impact), then the shared architectural root cause (expensive, unlocks everything downstream), then platform breadth.** Android is deliberately the last phase, gated behind Phase 2.

**Status:** Phase 0 (`895c298e`), Phase 0.5, and Phase 1.5 Tier A (`f1cd4184`) are implemented on `investigation/perf-persistence-assets-platform-baseline`. **Phase 1 is complete** — items 1-9 and 11 are done (see the Phase 1 list below for per-item status); item 10 was implemented, found unsafe by Codex review, and deliberately reverted rather than shipped (see that item's note, and Phase 1.5's note for the related conflict-resolution work). **Phase 1.5 Tier B Stage 1 is done** — real optimistic-concurrency conflict detection for the self-hosted Node server (see Phase 1.5 below); it took 9 rounds of Codex review, more than any other single item in this whole effort. **Tier B Stage 2 (client-side account-sync conflict hardening) is also done**, 3 rounds of Codex review. **Stage 3 (blast-radius reduction) went through a full cycle**: an initial attempt (account-sync eligibility + default-flip) was implemented, found unsafe, and reverted (same class of gap as Phase 1 item 10); a follow-up "Stage 3a" attempt (content-addressed naming with automatic GC) was then implemented, had its GC mechanism found unsafe by Codex, sized by a dedicated 6-round scoping report (`Agents/Reports/08-remote-block-gc-transactional-safety.md`) as a large, separately-resourced undertaking not worth building now, and finally shipped **naming-only, GC explicitly skipped** — 2 more rounds of Codex review, one real pre-existing-code bug caught and fixed in the process. See Phase 1.5 below for the full arc. Every shipped fix across all phases was verified by at least one Codex adversarial-review pass and is clean under `svelte-check`; item 11 (a save-format change) also has a dedicated Vitest suite and the full existing suite passing. **Tier B item 3 (BroadcastChannel over-aggressiveness) is now done as well** — the multi-tab force-reload data-loss bug is replaced by a per-backend hybrid auto-reload/prompt; 4 adversarial review rounds, which unlike every other item in this list were run by fresh Sonnet contexts rather than Codex, since the change did not meet the Codex escalation bar (Codex reviewed only the pre-implementation plan).

Phase 1 item 5 (an OPFS storage-backend settings toggle) is the standout example of why this project requires adversarial review: it took **nine rounds** to reach a correct implementation. Rounds 1-2 fixed the batch's other six items and one high-severity bug each in the Drive-restore/autosave race and the inlay-cleanup scope (the latter was ultimately reverted, not fixed further — see below). Rounds 3-9 were spent entirely on item 5's cross-tab correctness: a same-tab-only mutex (round 3) → a notification-only "nudge other tabs to reload" approach, rejected as non-authoritative (round 4) → a timeout-based cross-tab ping/liveness check, rejected because a suspended/backgrounded peer tab could simply fail to respond in time, and because nothing stopped a brand-new tab from opening mid-migration regardless of ping results (round 5) → a real Web Locks (`navigator.locks`)-based cross-tab mutex, which self-deadlocked because the tab's own permanent shared presence lock blocked its own exclusive-mode request (round 6) → fixed, but with a release-before-queue ordering bug that left a window where a tab was briefly invisible to the lock during concurrent migration attempts (round 7) → fixed, but a *queued-but-not-yet-granted* tab was still found to be a fully active writer until it won or lost the race (round 8) → fixed by acquiring the pre-existing in-process `dbWriteLock` as literally the first step of the whole sequence, stopping every attempting tab's own writes immediately regardless of the cross-tab race's outcome (round 9, approved — "Ship"). See `Agents/CodexReviews/phase1/` for all nine rounds.

A fifth, standalone investigation (topic 05, `Reports/05-multi-instance-conflict.md`) was run after Phase 0.5, into multi-tab/multi-device/multi-writer data loss — a distinct problem class from the single-instance save races Phase 0/0.5 already fixed. It found one **confirmed, standalone bug** (account-sync bootstrap silently blanking the remote database on a stale-cache read — fixed as Phase 1.5 Tier A, `f1cd4184`) plus a broader **last-write-wins architecture gap** across every backend, with the account-sync backend's actual severity unverified — and, as of 2026-09-20, confirmed permanently unverifiable, since the remote hub is maintained entirely upstream and its source is not obtainable by this repo. See `Agents/CodexReviews/topic05/05-multi-instance-conflict.codexreview.md` for the Codex review and correction trail. A sixth investigation (topic 06, `Reports/06-conflict-resolution-design-feasibility.md`) assessed which of Report 05's four sketched conflict-resolution designs is most technically feasible and least invasive — recommending revision/ETag-based optimistic concurrency, scoped first to the self-hosted Node server. That recommendation's first concrete increment ("Stage 1") is now implemented — see Phase 1.5 below for the full 9-round review history, which surfaced more genuine, distinct concurrency bugs than any other single change in this entire investigation-and-remediation effort.

Ideas that are **not** part of this campaign — quality-of-life features, nice-to-haves, and things a user asked for that nobody has scoped — live in [`Maybe-Later.md`](Maybe-Later.md). Nothing there is approved or scheduled; it exists so an idea does not die in a chat log. Entries are required to state what already exists before stating what is missing, because more than one "missing" feature in this app has turned out to be built but undiscoverable.

---

## Phase 0 — Quick, low-risk fixes ✅ **DONE** (ship independently, any order, no architectural risk)

These are all small, localized, high-confidence fixes identified across the reports. None depend on each other. Good first-PR candidates.

| Fix | File(s) | Report | Effort |
|---|---|---|---|
| Exclude already-resolved `/sw/img/` sources from `checkImg()`'s re-scan selector | `src/lib/ChatScreens/ChatBody.svelte:185` | 03 | Low |
| Add a distance ceiling to `checkImg()`'s fuzzy fallback (mirror `parser.svelte.ts:619`) | `ChatBody.svelte:226-237` | 03 | Low |
| Reject empty/null bodies in the service-worker register path (stop zero-byte cache poisoning) | `globalApi.svelte.ts:151-155`, `public/sw.js:111-133` | 03 | Low |
| Await `stream.close()` in `OpfsStorage.setItem` (closes a real gap where an async close rejection is silently dropped; currently unreachable via the flag gate) | `src/ts/storage/opfsStorage.ts:12-14` | 02 | Low |
| Give the autosave loop an actual retry path: don't clear `changeTracker`/`changed` until write succeeds; re-arm on failure | `src/ts/globalApi.svelte.ts:409-485` | 02 | Low |
| Surface write failures to the user on first failure, not only once alerts begin at the 5th accumulated failure | `globalApi.svelte.ts:474-482` | 02 | Low |
| Delete orphaned 2024 Capacitor-era assets (`resources/icon-*.png`, `splash*.png`, `capacitor.config.ts`) | `resources/`, repo root | 04 | Low |
| Fix `install_python`'s OS/arch gating (Windows-amd64-only today; on Linux/macOS the failure isn't silent — the frontend proceeds into steps that assume Windows-specific files and can error/panic) and make the frontend actually respect a failed install | `src-tauri/src/main.rs:230-246, 299, 385, 408`, `src/ts/process/models/local.ts:22-54` | 04 | Low |
| **[new, from cross-validation]** Fix the Module "Create" flow's duplicate-insertion bug: `tempModule` gets pushed onto `DBState.db.modules` twice | `src/lib/Setting/Pages/Module/ModuleSettings.svelte:157, 182` | 01 | Low |

**Recommended first PR:** the two `checkImg()` fixes together (asset-corruption items 1-2) — single file, single function, eliminates the most severe corruption mechanism found.

---

## Phase 0.5 — Deep-dive quick fixes (round 2 findings) ✅ **DONE**

A second, open-ended bug-hunting pass (one per Phase-0-era topic, explicitly scoped to find *new* bugs rather than re-verify round 1) surfaced these additional small, independently-scoped fixes. Same "ship independently, any order" character as Phase 0. Full detail in `Reports/*-deepdive.md` and their Codex reviews.

| Fix | File(s) | Report | Effort |
|---|---|---|---|
| **[Android compile blocker — do this first]** Wrap `tauri_plugin_deep_link::init()` and `tauri_plugin_updater::Builder::new().build()` registrations in `#[cfg(desktop)]`, matching the existing pattern already used for `tauri_plugin_single_instance` | `src-tauri/src/main.rs:582, 585, 570-578` | 04-deepdive | Trivial |
| Namespace module assets separately from character assets (or give character assets precedence) so a name+extension collision no longer silently blends an unrelated module's asset in — this is a live bug with no opt-in gate | `src/ts/parser/parser.svelte.ts:410-421, 451-461` | 03-deepdive | Low |
| Fix the `.charx` import size-gate operator-precedence bug: `if((file.originalSize ?? 0) < MAX_ASSET_SIZE_BYTES)` | `src/ts/process/processzip.ts:342` | 03-deepdive | Low |
| Fix `saveDbKei()` to actually `await` and handle its fetch; only advance the rate-limit timestamp on confirmed success | `src/ts/kei/backup.ts:83-104` | 02-deepdive | Low |
| Fix `bgm` playback to react to a changed `risu-ctrl` src instead of gating solely on `!bgmElement` | `src/ts/observer.svelte.ts:60-72` | 03-deepdive | Low |
| Invalidate/re-key `CharEmotion` on emotion edit/removal instead of caching the resolved path by value | `src/ts/characters.ts:183-189` (`rmCharEmotion`), `src/ts/util.ts:336-348`, `src/ts/process/scripts.ts:184-206` | 03-deepdive | Low |
| Wrap plugin-unload callback execution in try/catch and move `host.terminate()` into a `finally`, so a throwing callback can no longer skip cleanup | `src/ts/plugins/apiV3/v3.svelte.ts` (`unloadV3Plugin`, around line 538/550) | 01-deepdive | Low |
| Reset `changeTracker.loadouts`/`.plugins`/`.pluginCustomStorage` after a successful write, mirroring the existing `botPreset`/`modules` handling | `src/ts/globalApi.svelte.ts:435-448` (`mergeUnsavedChanges`), pre-write trim around `:483-486` | 02-deepdive | Low |
| Await the Node-server batch-remove call so its existing `try/catch` can actually catch failures | `src/ts/process/coldstorage.svelte.ts:287` | 02-deepdive | Low |
| Fix the Node-server batch-delete path on both ends: client should hex-encode each key separately (or send a JSON array) instead of one `$$`-joined blob; server should hex-decode the header before splitting on `$$`. Also stop sending `res.send()` per loop iteration — aggregate one response after the loop | `src/ts/storage/nodeStorage.ts:127-142`, `server/node/server.cjs:1215-1245` | 02-deepdive | Low-Medium |
| Cap/evict `fileCache` (the unbounded raw-asset-bytes cache) — an LRU with a byte-size or entry-count ceiling; this is the single most broadly-reproducible new RAM finding in this investigation | `src/ts/globalApi.svelte.ts:99-104, 199-219` | 01-deepdive | Low-Medium |
| Cap/evict the in-memory translation cache | `src/ts/translator.ts:22-25` | 01-deepdive | Low-Medium |

**Resolved during implementation:**
- **Group-chat GC exclusion** (`src/ts/globalApi.svelte.ts`, `getUncleanablesSync`) — investigated before fixing: grepped every UI and character-import write path for `additionalAssets`/`.vits` and found all of them already gated behind `type === 'character'` checks, so nothing currently populates those fields on a real `groupChat` object; they appear to be inert "lazy hack for typechecking" artifacts on the type. Since a defensive fix was cheap and low-risk regardless, applied it anyway: `additionalAssets`/`.vits` collection now runs unconditionally for every character or group-chat entry (only `ccAssets`, which genuinely doesn't exist on `groupChat`, stays inside the `type !== 'group'` narrowing). Closes the risk class entirely, including for any future code path that might populate these fields without remembering to update this allowlist too. ✅ Done, part of Phase 0.5.

---

## Phase 1 — Persistence & asset-integrity hardening (correctness, no architecture change)

Builds on Phase 0's fixes; addresses the remaining, slightly-larger-effort correctness gaps before touching the shared RAM architecture in Phase 2.

**✅ Items 1-9 and 11 are done**, verified by up to nine rounds of Codex adversarial-review (see `Agents/CodexReviews/phase1/`). **Item 10 was implemented, then reverted** — see its entry below.

1. **✅ DONE. Complete the `getUncleanablesSync` allowlist** — add `gptSoVitsConfig.ref_audio_data.assetId` and `NAIImgConfig.*`/`wavespeedImage.reference_image` (`globalApi.svelte.ts:933-1027`). **Note (corrected):** the GPT-SoVITS field is the genuinely urgent one — its deletion is real functional data loss since TTS reads it back directly with no fallback. NAI/Wavespeed fields are lower urgency, since both retain a separate base64 copy used by generation, so their omission mainly risks a stale cached preview, not a broken feature. Do not add `reference_image_multiple` — cross-validation found no current code path that populates it via `saveAsset`. *(Report 03, item 3 — Medium effort.)* Consider a follow-up to derive this list from a schema/registry instead of manual enumeration, since it has already drifted once.
2. **✅ DONE. Add basic storage-quota awareness** — `saveDb()` now checks `navigator.storage.estimate()` before web writes (one-time-per-session non-blocking warning when free space is under 2x the about-to-be-written size) and explicitly catches `QuotaExceededError`/legacy quota error codes with an actionable "free up space" message and a longer backoff, instead of the generic "retrying…" path. *(Report 02, item 4 — Medium effort.)*
3. **✅ DONE. Throttle `database/dbbackup-*.bin` writes** — every autosave cycle used to also write a full extra numbered backup copy; a new backup snapshot is now only written if 5+ minutes have passed since the last one (the primary `database.bin` write is unaffected). *(Report 02, item 5 — Medium effort.)*
4. **✅ DONE. Real mutual exclusion between `loadDrive()`'s restore write and the autosave loop** — implemented as `dbWriteLock`, an in-process async mutex both `saveDb()`'s write step and `loadDrive()`'s restore write must acquire (not a checked-then-acted boolean flag, which Codex round-1 review found still allowed a stale autosave to land after a restore). `loadDrive()` deliberately never releases it on success, since a reload/relaunch follows immediately. *(Report 02, item 6 — Medium effort.)* This same `dbWriteLock` primitive is now reused by item 5's OPFS migration toggle.
5. **✅ DONE. OPFS settings toggle** — decided (user choice) to wire up a real in-app settings path (`src/lib/Setting/Pages/FilesSettings.svelte`, "Local Storage Backend") rather than remove the dead code, now that its atomicity bug is fixed (Phase 0) and it has genuine cross-tab-safe migration in both directions (see the Status section above for the nine-round review history — this ended up being the single hardest-won fix across all phases so far, requiring a real Web Locks (`navigator.locks`)-based cross-tab mutex, not just the in-process `dbWriteLock`). `AGENTS.md`'s storage description updated to match. *(Report 02, item 8.)*
6. **✅ DONE. Cache-freshness signal for service-worker asset entries** (`src/ts/storage/assetIntegrity.ts`, `verifyAssetCacheEntry()`). Investigation while implementing this found that no new persisted marker was actually needed: `saveAsset()` names every asset it creates after the SHA-256 hash of its own content unless called with an explicit custom id, and a repo-wide search confirmed no call site currently does that — so the expected hash is already free to read from any asset's own filename. The new function re-hashes only the cached copy (opening `caches.open('risuCache')` directly from main-thread code, never touching the source-of-truth storage backend) and compares it to that filename-embedded hash — cheaper than fetching a second copy from local storage to compare against, per the item's own goal. Wired into `bootstrap.ts`'s existing boot-time asset-GC sweep as a small, capped, random 3-asset sample per boot (read-only — logs a mismatch, doesn't repair one; full coverage and remediation is item 7's job). Approved by Codex adversarial-review on the first round. *(Report 03, item 5 — Medium effort.)*
7. **✅ DONE. "Asset Cache Integrity" settings section** (`FilesSettings.svelte`, built on item 6's `verifyAssetCacheEntry()`). A "Verify Asset Cache Now" action runs `scanAssetCacheIntegrity()` across every currently-referenced asset (not just item 6's 3-sample boot check), reports a markdown summary (checked/not-cached/not-content-addressed/mismatch counts, listing mismatched basenames), and offers to evict confirmed-corrupted entries via a new `evictAssetCacheEntries()` (safe — only touches the service-worker cache, never source-of-truth storage; `getFileSrc()` already re-registers fresh bytes on the next cache miss, though only on a fresh page load, not for a tab that already resolved that asset this session — the UI says so). The previously-inert `checkCorruption` flag is now a real checkbox controlling whether the item-6 boot-time sample surfaces a toast on a mismatch (silent console-only by default). Gated off entirely for Tauri and for account-sync users (their assets bypass the service-worker cache this feature inspects; `cleanChunks()`'s boot-time path was also hardened to gate on `forageStorage.isAccount` in addition to the pre-existing `db.account?.useSync` check, since Codex review found these two flags can diverge). Took 3 rounds of Codex review: round 1 found a stuck-UI bug (no `try/finally` around the scan) and the missing account-sync gating; round 2 found the `finally` block's unconditional alert-clear was silently erasing the just-set error alert; round 3 approved with no material findings. *(Report 03, item 7 — Medium effort.)*
8. **✅ DONE. Fixed `backuplocal.ts`'s `LoadLocalBackup()`** — aborts immediately on decrypt failure instead of falling through to `decodeRisuSave()` on the still-encrypted bytes; the restore path now calls `setDatabase()` (full shape/default validation, same as bootstrap's own decode path) instead of the unvalidated `setDatabaseLite()` (`DBState.db = data`, no validation at all). *(Report 02-deepdive, Lead 3 — Medium effort.)*
9. **✅ DONE. Write-then-rename atomicity added to `server/node/server.cjs`'s `/api/write`** — writes to a unique temp file in the same directory first, then atomically renames it over the real path, cleaning up the temp file on failure. Closes the same class of gap Phase-0-era work already closed for the OPFS/browser path, for the server backend. *(Report 02-deepdive, Lead 2 — Medium effort.)*
10. **❌ Attempted, then reverted — needs a properly-scoped follow-up, not a quick fix.** Automatic inlay-asset garbage collection (hooking cleanup into character-trash purge) was implemented, but two rounds of Codex review found it unsafe to ship: the exclusion check that was meant to prevent deleting an inlay asset still referenced elsewhere only covered currently-loaded *live* characters, not any other character's *cold-stored* chats — a real risk of permanently deleting a chat attachment a user could still see elsewhere. Properly closing that gap requires either an expensive full cross-character cold-storage scan on every boot-time purge, or a genuine durable pending-cleanup-queue mechanism (to survive interruption between deletion and the character-removal's own eventual persistence) — both disproportionate for what was scoped as a quick fix, and risking exactly the class of "wrongly delete real user data" bug this whole investigation has been trying to eliminate elsewhere. **Decision: do not ship a partial version of this.** The revert is clean (`src/ts/bootstrap.ts` and `src/ts/process/files/inlays.ts` are byte-identical to pre-Phase-1 HEAD) — inlay assets continue to leak (accumulate forever, the pre-existing status quo), which is a real but non-destructive problem, unlike the alternative. *(Report 02-deepdive / 03-deepdive, both flagged this independently — Medium effort turned out to be an underestimate; needs its own properly-scoped design pass, likely alongside Phase 1.5 Tier B's conflict-resolution work since both are about safe, durable, partial-failure-tolerant state cleanup.)*
11. **✅ DONE. Per-block checksums added to the `RisuSave` block format** (`src/ts/storage/risuSave.ts`). Each block now carries two separate CRC32 checksums: a header checksum over `type+compression+nameLen+name+length`, verified before `length` is trusted enough to locate the block's data (a mismatch aborts decoding entirely, since block boundaries can no longer be trusted for any subsequent block either), and a data checksum over the payload alone, verified after (a mismatch safely drops just that one block, matching the pre-existing per-block-failure behavior). The file-level format-version byte now fails closed on any unrecognized value instead of silently guessing "must be legacy." A new post-decode invariant requires that some block actually claimed and successfully parsed as `ROOT` before returning — closing a type-byte-corruption bypass Codex review found in round 1, where a corrupted type byte could redirect the root block into a different type and skip both the checksum and the existing root-specific fatal-parse-failure check. Old (pre-this-change) saves keep decoding exactly as before via an explicit v1/v2 split on that version byte. Two rounds of Codex review: round 1 found the checksum only covered the payload, leaving framing fields and the version byte unprotected (a corrupted length field could desync all subsequent blocks in the file, silently, with no error); round 2 approved after the header/data checksum split and the root-invariant fix, noting the one remaining theoretical gap (a version byte flipped specifically from 1 to 0) is largely self-defeating in practice since reinterpreting a v2 buffer as v1 misaligns the root block's own byte layout, so the root invariant still catches the ordinary case. A new focused test suite (`src/ts/storage/tests/risuSave.test.ts`, 7 tests) covers clean round-trips, payload corruption, framing corruption, root corruption, an unrecognized version byte, and legacy v1 backward compatibility; the full existing Vitest suite (25 files, 237 tests) still passes. *(Report 02-deepdive, Lead 5 — Medium effort.)*

---

## Phase 1.5 — Multi-writer conflict hardening (new, from topic 05)

**Naming note:** "1.5" reflects topical proximity to Phase 1 (persistence hardening), not an ordering dependency — neither tier below depends on anything in Phase 1, and Tier A shipped out of sequence, the same way Phase 0.5's Android compile-blocker fix jumped ahead of its own numbering. Treat both tiers as independently schedulable, same as Phase 0/0.5 items.

Two tiers here: a small, isolated, high-confidence bug fix that can ship independently like Phase 0/0.5 items, and a genuine architectural/product decision that needs to be made deliberately before implementing anything broader.

**Tier A — isolated, quick fix (same risk profile as Phase 0/0.5) ✅ DONE:**

1. **Fixed account-sync bootstrap's `303`/`match:false` null-handling** so a stale-cache signal from the server is never treated as "no database exists." `AccountStorage.getItem` (`src/ts/storage/accountStorage.ts`) now throws a dedicated `AccountSyncCacheMismatchError` on this signal instead of returning `null`; `src/ts/bootstrap.ts` retries up to 3 times (1s apart) on that specific error before finally surfacing a clear, non-destructive error to the user — it no longer falls through to writing an empty database over a real one. `checkNullish()`'s empty-database-creation branch is now only reachable via a genuine 204 "no content" response, the one legitimate "no data" signal. `src/ts/storage/autoStorage.ts`'s `checkAccountSync()` (a second call site for the same read) needed no change — its existing try/catch already aborts safely on any thrown error. Verified by Codex adversarial-review, see `Agents/CodexReviews/topic05-fix/bootstrap-fix.codexreview.md`. *(Report 05, section 7 / scenario 2 — was the single highest-severity confirmed finding in the whole investigation: it required no second writer, no race, no multi-device setup, just one unlucky read.)*

**Tier B — architecture/product decision, now partially implemented:**

The design-feasibility investigation (topic 06, `Reports/06-conflict-resolution-design-feasibility.md`) recommended **Option 1 (revision/ETag-based optimistic concurrency), scoped first to the self-hosted Node server**, with a concrete "Stage 1" increment sketch. That Stage 1 is now:

2. **✅ DONE. Stage 1: real optimistic-concurrency conflict detection for the self-hosted Node server.** `server/node/server.cjs`'s `/api/write`, `/api/read`, and `/api/remove` now track a per-file revision counter (`__revisions.json`) and support an optional `if-match-revision` header — a write/delete whose presented revision doesn't match the server's current one is rejected with `409` instead of silently overwriting, while clients that never send the header (back-compat) get today's unconditional behavior unchanged. `src/ts/storage/nodeStorage.ts` tracks each key's last-known revision and presents it automatically; a `NodeStorageConflictError` distinguishes a real conflict from a generic I/O failure. `src/ts/globalApi.svelte.ts`'s `saveDb()` surfaces a clear one-time toast on conflict ("reload to get the current data") instead of silently retrying into a wall of rejections or escalating to a scary generic error dialog. This was, by a wide margin, the hardest-won fix in the entire investigation-and-remediation effort: **9 rounds of Codex adversarial-review**, each catching a genuine, distinct concurrency bug — see `Agents/CodexReviews/tierb-stage1/` for the full history. In order: (1) the original naive "check-then-write" design had a TOCTOU race allowing two concurrent writers to both pass the revision check (closed with a real per-key async-mutex critical section, verified via a standalone Node concurrency stress test outside the Vitest suite, since `server.cjs` has no existing test infrastructure); (2) content was committed before its revision bump, so a crash in between could leave new content paired with an old, exploitable revision (fixed by reordering: revision-then-content, the safe crash direction); (3) `/api/remove` bypassed the whole mechanism entirely, letting a stale delete silently resurrect newer content a concurrent writer had just saved (brought under the same per-key lock, made conditional, same crash-safe ordering); (4) batch deletes could partially commit before reporting failure, and malformed/misaligned batch headers could silently downgrade to unconditional (fixed with a new `withFileWriteLocks` nested-lock primitive giving true all-or-nothing batch semantics, plus strict header validation — also stress-tested standalone for deadlock-freedom across overlapping key sets); (5) the deleted key's "tombstone" revision was being discarded client-side, making delete-then-recreate unconditional again (fixed by having the client retain and present it); (6) `fs.rm()` wasn't idempotent and a mid-batch I/O failure left the client with no way to reconcile what had actually committed (fixed with `force:true` plus attaching committed revisions to failure responses); (7) the revision-persistence queue itself could let one request's successful save durably commit a *different*, concurrent request's not-yet-confirmed mutation, making that second request's own failure-rollback a lie (fixed with a new global `withRevisionTransaction` queue serializing the full validate→mutate→persist→rollback sequence, layered under the per-key locks — also stress-tested standalone); (8) `/api/read` had no locking at all, letting a reader land in the crash-safe staged-commit window and receive a new revision paired with old content, which it could then use as a false permission slip to overwrite a write it never actually observed (fixed by locking reads too); (9) that same read-lock fix initially held the lock for the full streamed-response duration, creating a new denial-of-service vector where a stalled/non-consuming client could block all writers to a key indefinitely (fixed by snapshotting the file into memory under the lock, then releasing the lock before sending the response — decoupling lock duration from client download speed entirely). Approved on round 9 with no material findings. Also fixed lowercase-hex-path canonicalization across all three handlers (Windows/macOS are case-insensitive filesystems) and duplicate-path rejection for batches; a pre-existing-uppercase-filename migration path was deliberately deferred as a documented, independently-assessed-as-low-risk limitation (every hex-encoding call site in this repo's own client code is provably lowercase-only). Deliberately excludes account-sync and Tauri, matching the report's own scoping (Tauri bypasses shared storage entirely; the account-sync hub is out of this repo's control). *(Report 06, "Sketch of the first concrete increment" — sized as Medium-High effort in the original sketch; actual effort was substantially higher once adversarial review started finding real concurrency bugs, which is exactly the kind of gap this whole review process exists to catch before it reaches production.)*
3. **✅ DONE. BroadcastChannel over-aggressiveness: hybrid auto-reload / prompt, scoped per backend.** `channel.onmessage` (`src/ts/globalApi.svelte.ts`) used to set a one-way `gotChannel` latch on the *first* save broadcast from any other tab and force-reload it — and a separate bail-out at the top of `saveDb()`'s loop meant that tab then never saved again for the rest of its page load. Unsaved edits in the losing tab were discarded with no prompt; the `mergeUnsavedChanges()` call on that path preserved only change-tracker identifiers, never content, so it was dead bookkeeping rather than the safety net it looked like. Now the handler only sets a flag, and the decision is made once per iteration *inside* the save loop — deliberately not in the message handler, where `location.reload()` can tear an in-flight write. A **clean** tab auto-reloads silently (rate-limited, burst-capped, history in `sessionStorage`, and it will not auto-reload at all if that history cannot be persisted and read back, since a tab that cannot record that it reloaded would loop forever); a **dirty** tab is prompted. Neither `changed` (500ms-debounced, cleared at write start) nor `changeTracker` (trimmed to its head element mid-write, so a clean tab reads non-empty) was usable as a dirty signal, so a dedicated `dirtySinceLastSave` flag was added, cleared at the tracker-snapshot point and restored only on the pre-commit failure path. All decision logic lives in a new dependency-free `src/ts/storage/multiTabReload.ts` (mirroring the `remoteSaveCleanup.ts` idiom) with a 46-case Vitest suite across 7 groups — the only part of this feature that can carry executing coverage, for the reason given under Verification below. **The prompt is scoped per backend, because on revision-aware backends "save mine" is impossible:** `NodeStorage.knownRevisions` is per-instance and deliberately never refreshed from a 409 (`src/ts/storage/nodeStorage.ts`), so the peer save that triggers the prompt is precisely what makes this tab's revision stale — a save-mine write would 409 pre-commit on every retry, forever. On Tauri and OPFS/localForage (revision-unaware) the prompt offers save-mine / discard-mine and both genuinely work; on `isNodeServer || forageStorage.isAccount` it offers reload / stay-and-park instead, with copy that says plainly the edits cannot be saved from this tab until it reloads. **Disclosed limitation: on revision-aware backends, a dirty tab whose peer has saved has no path to keep its edits** — reload discards them, stay parks the tab and they are discarded on the eventual reload. That is the Stage 1/2 optimistic-concurrency guard working exactly as designed, and the pre-batch code discarded those edits too, just without asking; genuinely closing it needs the cross-tab conflict resolution deferred behind Phase 2, not a change here. **A pre-existing bug was found and fixed in the process:** `saveDb()`'s `try` spans past the primary commit through the backup writes, `getDbBackups()`, and `saveDbKei()`, and its catch unconditionally re-merged the tracker and set `changed = true` — so a failure in ancillary post-commit work re-committed the already-committed primary payload, able to overwrite a newer peer write that had landed in between. Now gated on a new `primaryCommitted` flag, with a separate `postCommitFailStreak` counter so a persistently failing backup pipeline still escalates to the user instead of degrading to console-only forever. The broadcast also moved from *before* the write to immediately after the primary commit's lock release — not next to `saveDbKei()`, which is a network call with a 15s `AbortSignal.timeout`. **Review history — 4 adversarial rounds, run by fresh Sonnet contexts rather than Codex** (this did not meet the Codex escalation bar; Codex reviewed the pre-implementation plan only, rejecting revisions 1 and 2): the independent plan review also rejected revision 1, on a permanent `reloadDecisionMade` latch that reproduced the very bug being fixed. Post-implementation round 1 rejected on the `primaryCommitted` early-return silently swallowing the existing quota toast and Node/account conflict escalation for every post-commit failure — a working user-facing error path removed as collateral. Round 3 rejected on two confirmed defects: a `finalFlushPending` reload that fired without re-checking dirtiness, destroying edits made during the write window (a *new* intra-tab data-loss path, in the feature whose entire purpose is preventing exactly that), and the conflict branches never being gated on `primaryCommitted`, so an ancillary backup-prune 409 falsely told the user their save had failed and parked the tab permanently — reintroducing, through a different door, the same "one event disables saving forever" failure this item exists to remove. Round 4 returned approve-with-findings, having confirmed the save-mine impossibility above. The post-flush reload was **deleted rather than patched**, on the reasoning that after flushing, this tab already holds the newest committed state — the reload re-read its own write, and its only distinctive effect was destroying concurrent edits. One further defect was caught by the orchestrator reading the final diff rather than by any reviewer: the new revision-aware `stay` option fell through into the normal save loop, and because a dirty tab already has `changed === true` from the debounce, it immediately 409'd and surfaced a second, unexpected conflict alert before parking anyway — `stay` now parks deliberately and quietly, as its label promises. Worth recording for future rounds: two reviewers were pointed at the `finalFlushPending` reload with explicit instructions to attack it hardest, and only one found the data-loss path — a single clean review round is weak evidence of correctness on this kind of change, not proof. **Verification:** `svelte-check` 0 errors / 0 warnings; full Vitest suite 27 files, 287 passed / 3 skipped (pre-item baseline: 26 files, 241 passed / 3 skipped). **No executing test covers the wiring inside `saveDb()` itself, and deliberately so** — happy-dom ships no `BroadcastChannel` at all (verified empirically, not assumed), so such a test would silently no-op rather than fail, which is worse than having none. Two-simultaneously-dirty-tabs last-write-wins persists on revision-unaware backends (Phase 2 work), as does the sub-frame window between `$effect.root` install and its first effect flush. No change to the `.bin` save format, block layout, pointer versions, or any plugin-facing contract. *(Report 05, section 1.)*
4. **✅ DONE. Stage 2: client-side account-sync conflict hardening.** `src/ts/storage/accountStorage.ts`'s `AccountStorage.setItem` no longer writes the just-sent value into its local `cachedForage` read-cache until the server response is actually confirmed successful (2xx, or 304 meaning "already matches") — previously it cached unconditionally right after the `fetch` resolved, before the status check, so a rejected write would still leave the local cache holding the now-stale content, which a later `getItem`'s 303/match:true fast path could serve back as if it had been accepted. A new `AccountSyncConflictError` (thrown on `409`/`412`) lets `saveDb()` (`src/ts/globalApi.svelte.ts`) react the same way it already does to `NodeStorageConflictError`: a one-time toast, then the loop genuinely stops retrying (see item below — this surfaced a real bug in the *already-shipped* Stage 1 toast handling too). Whether the account-sync hub actually sends `409`/`412` today is unverified (its source isn't in this repo) — this change is a pure "stop actively defeating whatever protection the hub might already have" client-side improvement, not a guarantee of hub-side enforcement, exactly as Report 06 scoped it. Took 3 rounds of Codex review: round 1 found that enabling Stage 3 (below) alongside this introduced a real split-write corruption path, and that both this branch's and the *pre-existing, already-9-round-approved* `NodeStorageConflictError` branch's "stop retrying" claims were false — both just slept 2s and silently resumed retrying via the outer save loop; round 2 approved the Stage 3 revert and the retry-loop fix's intent, but caught that the retry-loop fix's `sleep(100000000)` was itself broken (milliseconds, not an arbitrary "forever" unit — only ~27.8 hours, not ~3170 years) and would silently resume retrying after that window on a long-lived session; round 3 approved after a genuinely non-resolving `sleepForever()` helper (`src/ts/util.ts`) replaced it in both conflict branches, plus the identical pre-existing bug at its original source (`accountStorage.ts`'s `reloadSession` handling, which had the same `sleep(100000000) // wait forever` mistake). See `Agents/CodexReviews/tierb-stage2-4/` for the full 3-round history. *(Report 06, "Incremental adoption path," stage 2.)*
5. **❌ Attempted, then reverted — Stage 3 (blast-radius reduction) needs a properly-scoped follow-up, not a quick change.** Extending the existing per-character `remote: 'prefer'` block-splitting mechanism's eligibility to account-sync, and flipping `db.enableRemoteSaving`'s default from opt-in to opt-out (the latter an explicit, informed product decision made in-session, not something implemented unilaterally), were both implemented, then reverted after round 1 of Codex review on item 4's work found a real, high-severity data-integrity gap: `encodeRemoteBlock` persists a character's `remotes/<chaId>.local.bin` block as a separate, non-transactional write during `encoder.set()`, *before* `saveDb()` attempts the root `database.bin` write those blocks are referenced from. Remote blocks aren't versioned or content-addressed, so a stale client can successfully overwrite a character's remote block, then correctly have its root write rejected by the revision check — but the newer, already-accepted root (written by a different, non-stale client) already references that same stable filename, so a later read can return the stale client's character payload even though the write that produced it was rejected. Enabling this mechanism more broadly (opt-out by default, plus newly eligible for account-sync, which is exactly where Stage 1/2's conflict detection is supposed to matter most) would have actively undermined the protection Stage 1/2 just built, at precisely the boundary it was extended to. This is the same class of gap, and the same "properly closing it requires real design work, not a quick fix" conclusion, as Phase 1 item 10's inlay-GC revert: the actual fix needs content-addressed/versioned remote blocks with an atomically-committed root reference (publish blocks under unique names first, then atomically/conditionally commit the root referencing the exact version, garbage-collecting unreferenced blocks later) — a real format/protocol change, not a default flip. The revert is clean: `src/ts/storage/risuSave.ts` and `src/ts/setting/advancedSettingsData.ts` are byte-identical to pre-this-session HEAD. The pre-existing, smaller-blast-radius version of the same gap (for Tauri/Node-server users who already explicitly opted in via the settings checkbox) is unchanged status quo, not newly introduced. **A dedicated design-feasibility investigation for the actual fix is done** — see `Agents/Reports/07-remote-block-versioning-design.md` (6 rounds of Codex review, `Agents/CodexReviews/topic07/`; more rounds than any single report in this effort so far, reflecting how many rounds it took to stop the report itself from silently re-introducing a version of the same "assumed safe, actually isn't" pattern this whole investigation exists to catch). Verified findings: `saveDb()`'s existing write ordering already does "publish leaf blocks, then commit the gated root" — no new transaction primitive is needed there, only a naming change (content-addressed `remotes/<chaId>.<hash>.bin`, recommended over a revision-counter scheme, which would also be permanently unbuildable for account-sync). Migration is free via a pointer version-discriminator. **The actual hard part, left honestly unresolved by the report rather than papered over: reclaiming superseded remote-block versions has a genuine, unsolved concurrency race** (GC's existing read-then-decide-then-later-delete structure can execute a stale deletion decision after a legitimate republish; a grace period alone does not close it) that needs the same interleaving analysis and stress-testing Tier B Stage 1 needed, not a quick fix — and **account-sync reclamation specifically is blocked outright**, independent of that: `AccountStorage` has no key-enumeration or deletion capability at all, so there is nothing to build a sweep on top of without hub cooperation (confirmed unobtainable, see `Agents/Summary.md` §5). Net effect: a future Stage 3a (naming fix + a properly designed-and-verified GC concurrency protocol, Tauri/Node-server only) is well-scoped and re-attemptable; Stage 3b/3c (account-sync eligibility) remains a genuine open blocker, not merely deferred work.

**Stage 3a was then attempted** (content-addressed naming, `hashRemoteBlockContent()`, `v:2` pointers, version-aware `isRemoteSaveFileLive()`/GC liveness logic, `decodeRemotePointers()` — all still sitting uncommitted in the working tree) but its GC concurrency protocol was found unsafe on both backends by Codex review (`Agents/CodexReviews/tierb-stage3a/`): GC's liveness decision, made from a stale snapshot, wasn't validated against whether the root was about to start referencing a candidate for the first time. **A dedicated follow-up scoping report sized exactly what a real fix would require**: `Agents/Reports/08-remote-block-gc-transactional-safety.md` — this took **6 rounds of Codex review**, the most of any single report in this whole effort, each round finding a new, genuinely deeper gap in the report's own proposed fix (not cosmetic issues — a structural TOCTOU that survives naive precondition-checking, a precondition set that needs a third key, and a step-ordering requirement that no precondition list alone can substitute for). Final, confirmed-sound design if GC is ever built: for the Node server, a three-way revision precondition (candidate key, root, and the candidate's own `.meta` liveness file, all captured from one shared decision-time snapshot) on an extended `/api/remove`, plus reordering `encodeRemoteBlock()` so `.meta` refresh is the first, awaited step of publishing — this closes 2 of 3 known race orderings outright and makes the grace period actually bound the third (previously it didn't, since nothing refreshed `.meta` on republish). For Tauri, widening `withRemoteBlockGcLock` (a single global, not per-key, mutex) to span the writer's entire publish-through-commit sequence, with GC's own decision moved inside that same lock, closes its analogous race completely — a stronger guarantee than Node-server can cheaply achieve, since Tauri doesn't need to scale. **Report 08's own recommendation: do not build this.** GC is confirmed non-load-bearing for correctness (Report 07); the real fix is realistically comparable in review cost to Tier B Stage 1's nine rounds — this report's own 6 rounds sizing it, not even implementing it, are direct evidence of that. **✅ DONE. Shipped naming-only, per Report 08's own recommendation — automatic GC explicitly skipped as not worth the cost.** All GC-only machinery (`withRemoteBlockGcLock`, `RisuSaveDecoder`'s `remotePointers`/`skipRemoteFetch`, `decodeRemotePointers()`) was removed from `src/ts/storage/risuSave.ts`; `src/ts/bootstrap.ts` and `src/ts/storage/remoteSaveCleanup.ts`/its test suite were reverted byte-for-byte to their pre-this-effort state via `git checkout HEAD --`, so the pre-existing (already-safe, never found unsafe by any review in this chain) GC sweep is untouched — it only recognizes the legacy bare-name (`.local.bin`) shape and silently leaves every new hash-named (`v:2`) file unmanaged. **One real bug was caught in this final stripping pass, not a pre-existing issue this session introduced**: `cleanChunks()`'s non-Tauri branch derived a candidate's character id via a hard-coded `getBasename(asset).slice(0, -10)` (removing exactly the length of the literal ".local.bin"), a safe shortcut back when that was the only possible suffix — fed a hash-named file, it silently produced a bogus, never-matching id, making a *live* character's remote block look orphaned and deletable after the grace period. Fixed by switching to the same already-tested `getRemoteSavePayloadName()` helper the Tauri branch already used correctly, closing the one remaining gap between the two branches' recognition rules. 2 rounds of Codex review, see `Agents/CodexReviews/tierb-stage3a-naming-only/`. `svelte-check` 0 errors, full Vitest suite passing (26 files, 241 tests, 3 pre-existing skipped). Superseded remote-block versions now accumulate unreclaimed — an accepted, explicit, quantifiable-only-in-disk-space tradeoff, not data loss — until/unless a future, separately-resourced effort revisits Report 08's sized fix. *(Report 06, "Incremental adoption path," stage 3 / Report 05, section 5 / Report 07 / Report 08.)*
6. **Not attempted — Stage 4 (report's own numbering), and now confirmed permanently unreachable rather than merely blocked pending investigation.** Revisiting whether account-sync can get real server-enforced revision checking depends on either obtaining the hub's (RisuAccount) source or running live multi-session tests against it; Report 06 originally flagged this as *unverified* (no hub source present in this repo, inferred from the absence of `/api/account/*` routes in `server/node/server.cjs`). **Update (2026-09-20):** the project owner directly confirmed the hub is maintained entirely upstream and cannot be modified from this repo at all — this is a confirmed hard constraint, not an open question that more investigation could resolve. Stage 4 is therefore not "not yet scheduled" but genuinely out of scope for this repo, permanently; any future account-sync hardening is limited to what Stage 2's client-side-only approach already represents (see item 4 above). See `Agents/Summary.md` §5 for the same correction. *(Report 06, "Incremental adoption path," stage 4.)*
7. **Deliberately deferred behind Phase 2 (explicit product decision).** Option 3 (CRDT/op-log merge) and Option 4 (hard lock + takeover UI) — both viable later additions layered on Stage 1/2's revision infrastructure, but neither should start before Phase 2's per-character DB decomposition (Phase 2 item 5) exists, since that's the same kind of granular-slice thinking a per-chat conflict design would reuse, and before a product owner decides whether detect-and-refuse is an acceptable long-term UX. *(Report 06, "Incremental adoption path," stage 5.)*

**Round 3 (2026-09-21, Opus): three further live persistence bugs found and fixed.** An audit
of the save loop turned up three data-loss paths that all nine prior Codex rounds had missed,
each shipped with its own fresh-context adversarial review:

8. **✅ DONE — a cancelled reload parked the save loop forever** (`a5dd6566`). Declining the
   multi-tab reload prompt left the tab permanently unable to autosave, with no indication.
   Fixed by suppression rather than detection, after the first plan was rejected for
   introducing two NEW loss paths of its own.
9. **✅ DONE — the multi-tab auto-reload destroyed in-progress drafts** (`ae167294`). A reload
   triggered by another tab discarded unsent composer text, in-flight message edits, and
   translation edits. Adds a draft registry (`src/ts/localDrafts.ts`) consulted by
   `getMultiTabAction`, with five draft holders registered via `$effect` on state.
10. **✅ DONE — preset renames and images were never written to disk** (`339d5ed1` +
    `8bc0f426`). The `botPresets` change-tracking effect read only `botPresetsId` and
    `.length`, so in-place mutations were never flagged, and that flag gates whether the
    preset block is re-encoded at all. The fix is a one-line deep snapshot; the preceding
    commit extracts the six change-tracking effects out of `saveDb()` into
    `registerDbChangeEffects` so they could be tested against production code rather than a
    re-implementation. Measured snapshot cost 0.24/1.76/7.33 ms at 3/15/50 presets, paid on
    preset-array mutations only.

Process notes worth keeping. Item 10 went through two REJECTs: the first (plan gate) corrected
a premise about which mutation paths were actually lossy; the second (post-implementation)
caught a **false scenario in the commit message itself** — an unverified reviewer claim from
the earlier gate that was propagated without being re-checked. Both reviews were fresh Opus
contexts, not Codex, per the standing escalation rule. The tests were deliberately written
against the unfixed code and verified red before the fix, and the one path that could not be
traced end-to-end was turned into a test rather than asserted in prose.

**The alertStore hijack: investigated 2026-09-21, scoped, and deliberately NOT attempted.**
Worth reading before anyone tries it, because the obvious fix is wrong and the reason is
not obvious.

*Mechanism (confirmed).* All modals share one global slot (`alertStore`, `stores.svelte.ts`
~55). Every promise-returning alert in `src/ts/alert.ts` does `set(...)` then `await
waitAlert()` (polls for `type === 'none'`) then `return get(alertStore).msg`. If a second
alert is requested while one is pending, it overwrites the slot; when the user answers,
BOTH pending waiters break and BOTH read the same answer. A chat rename can receive `'yes'`
from an unrelated confirm dialog. There are 13 promise-returning alert functions.

*Why a mutex in `alert.ts` does not fix it.* Ownership cannot be enforced from `alert.ts`,
because `alert.ts` ~25 re-exports a set-only `alertStore` wrapper. Counted: **83** direct
`alertStore.set` writers, **16** `alertClear()` calls and **45** `alertWait()` calls outside
that module, plus the Enter-key handler (`hotkey.ts` ~250) which resolves any pending
`ask`/`normal`/`error` with `'yes'`. A mutex would serialize requests while leaving every one
of those able to resolve a slot-owning alert with a foreign value -- false ownership, which is
worse than none.

*The load-bearing surprise.* Escape-to-close is implemented AS a clobber: `hotkey.ts` ~243
calls `alertToast('Alert Closed')` to dismiss a modal. So toasts cannot be serialized
(Escape would deadlock against the modal it is cancelling) and cannot be left alone (Escape
is the most frequent wrong-value path in the app). Toasts need their own store slot, which
in turn means Escape needs a real cancel protocol to replace the clobber.

*Two alerts have no user-reachable exit at all,* which a queue would convert from a local
annoyance into a permanent global wedge: `alertLogin` (no cancel control; called in a retry
loop at `accountStorage.ts` ~170) and `alertErrorWait`/`'wait2'` (matches no button branch in
`AlertComp.svelte`). A wedged chain means the save loop's conflict prompt never appears and
the tab stops persisting silently -- without even setting `savingStoppedReason`.

*A live data-loss instance, independent of multi-tab:* `bootstrap.ts` ~403-448 maps corrupted
modules through `Promise.all`, so with two corrupted modules one callback's `alertError`
destroys the other's `alertConfirm(resetLorebookQuestion)` mid-flight; Enter then resolves it
`'yes'` and `v.lorebook = []` wipes a lorebook for a question the user never saw.

*Shape of a real fix,* per the plan gate that rejected the mutex-only design: separate toast
store; an explicit `alertCancel()` sentinel mapped inside `alert.ts` to each function's
existing cancel value (near-zero call-site churn -- `''` already means cancelled today, which
is why the sentinel approach is cheaper than it looks); cancel controls added to the `login`
and `wait2` branches; `alertWait`/`alertClear` routed through the slot owner or documented as
owner-only; and `nodeStorage.checkAuth` deduped, since serialization turns its concurrent
callers into N sequential password prompts with conflicting `/api/set_password` writes.
That is a multi-stage project, not a patch.

**Still open, identified but not fixed:** the `alertStore` modal hijack (a spontaneous
multi-tab prompt can resolve a pending `alertInput`, e.g. renaming a chat to `"0"`); the
absence of any "this tab has stopped saving" indicator on the three intentional park paths;
and the pre-existing last-writer-wins whole-DB overwrite, which remains architectural.

---

## Phase 2 — RAM/architecture rework (the shared root cause; highest leverage, highest effort)

This phase is the load-bearing one: it's what Phase 4 (Android) is gated behind, and it's the most consequential thing found in any of the four investigations. Sequence sub-items by risk — start with the isolated component-level fix, end with the DB-wide architectural change.

1. **Module-editor per-keystroke cost.** Split into two independent stages after investigation; see [`Reports/09-stage-a-module-effect-narrowing-plan.md`](Reports/09-stage-a-module-effect-narrowing-plan.md). *(Report 01, recommendation 1.)*

   - **Stage A — narrow the GUI-side dependency tracking. ✅ DONE (`f4867e63`, 2026-09-21).** The `$effect` driving `moduleUpdate()` (`stores.svelte.ts:197`) deep-cloned the whole modules array on every keystroke via `$state.snapshot()` purely to register dependencies. Replaced with `trackModuleUpdateDeps()` (`src/ts/process/moduleUpdateDeps.ts`), reading only the four fields `moduleUpdate()` consumes. Measured 58.35 ms → 29.21 ms per keystroke (2.00x) on the 52-module fixture. Red-before-green tests plus a live-app verification that `hideIcon`/`backgroundEmbedding` still re-run the effect and `name` no longer does.

   - **Stage B — partition the persistence-side dirty-tracking effect. ✅ DONE (2026-09-21).** Plan and all gate records: [`Reports/11-stage-b-module-effect-partition-plan.md`](Reports/11-stage-b-module-effect-partition-plan.md). `dbChangeEffects.svelte.ts`'s modules effect deep-read the **entire** modules array on every keystroke; it is now an outer effect over array shape plus one child effect per module, so a leaf edit re-reads only that module. **A partition, not a narrowing**: the dependency closure is set-identical, `tracker.modules` stays one boolean, and save behaviour, the save format and upstream compatibility are unchanged. Measured in the live app (module editor open, real input events, i9-13900K, dev build): **52 modules 13.2 → 1.9 ms, 104 modules 25.1 → 1.8 ms, and scaling 52→104 went from 1.9x to 0.95x — cost is now flat in module count.**

     *Originally planned as a local draft copy of the module being edited. That design was rejected at two `opus-reviewer` gates and retired after a `senior-advisor` escalation: moving edits out of `db.modules` created a durability gap that needed four compensating layers (debounced commit, teardown flushes, an awaitable save, a Tauri close hook), and its final revision did not even optimise — committing a `$state` proxy into `db.modules` re-aliases it after the first debounce. The retired plan and its gate records are kept as evidence in [`Reports/10-stage-b-module-draft-copy-plan.md`](Reports/10-stage-b-module-draft-copy-plan.md).*

   **Sequencing note — Stages A and B are complementary, and both are load-bearing.** Stage A removed the whole-array snapshot from the *GUI-side* effect (`stores.svelte.ts:197`); Stage B partitioned the *persistence-side* one (`dbChangeEffects.svelte.ts`). The partition still mutates `db.modules` on every keystroke, so Stage A's narrowed effect still runs and still matters: **the measured 1.9 ms depends on both.** *Correction:* an earlier version of this note said Stage B would largely subsume Stage A's win. That was true only of the retired draft-copy design, which would have stopped mutating `db.modules` altogether; it is not true of the partition that shipped.

   **Frame budget — met on a high-end desktop, not claimed elsewhere.** After both stages a keystroke costs ~1.9 ms at 52 or 104 modules on an i9-13900K (about 11% of the 16.7 ms budget), and it no longer grows with module count. The speedup ratio and the flat scaling are hardware-independent, because they come from doing less work. The absolute figures are not: **Raspberry Pi and mobile are unmeasured and no budget claim is made for them.** Asset-heavy modules (5,000+ asset references) still exceed the budget by themselves *while that module is being edited* — snapshot cost tracks node count, not bytes — though they no longer tax keystrokes in every other module. `dbChangeEffects.svelte.ts` must still never be *narrowed*: `tracker.modules` gates whether the modules block is encoded at all (`risuSave.ts:328`), so a missed mutation is never written to disk.
2. **Narrow the `saveDb()` change-tracking effects** (`globalApi.svelte.ts:350-403`) so they stop `$state.snapshot()`-ing broad subtrees just to detect "something changed." Replace deep-clone-based dirty detection with explicit dirty-marking at actual mutation call sites, or watch only shallow identity/length/timestamp signals. **Note (corrected):** this specific effect already excludes `modules`/`botPresets`/`loadouts`/`plugins`/`pluginCustomStorage` — it's the hot path for *character-field and chat-message* edits specifically, item 1 above is the hot path for module edits. Both need fixing; they're independent, not the same effect. *(Report 01, recommendation 2 — Medium-High effort.)*

   **⚠ Caution added 2026-09-21 — do not implement the "shallow identity/length/timestamp" option above as written.** That is *narrowing*, and Stage B established that narrowing this effect family loses writes: `tracker` flags gate whether a block is encoded at all, so a missed mutation is never written rather than written late (the `:19-24` presets comment in `dbChangeEffects.svelte.ts` records a real data-loss bug from exactly this, `8bc0f426`). The technique that worked for modules is **partitioning** — same dependency closure, sliced across per-element effects — and it is the natural candidate here too. Note this is also the effect containing CHORE-01's non-selected-character gap, so the two should be planned together.
3. **Add real virtual scrolling to the chat message list** (`DefaultChatScreen.svelte`), keeping the existing incremental-load-on-scroll-up behavior for fetching history but unmounting off-screen messages so peak DOM/component count is bounded. This is the most Android-relevant fix in the whole roadmap. *(Report 01, recommendation 4 — Medium-High effort.)*
4. **Extend cold storage to size-based (not just idle-time-based) compaction**, so very long *active* chats also get relief, reducing the size of whatever remains to be cloned/stringified by items 1-2. **Note (corrected):** cold storage already offloads old, stale chats belonging to an active character today — this item specifically targets the gap that remains: a chat that's long but still *recent* (not idle 10+ days), which today gets no relief regardless of size. *(Report 01, recommendation 5 — Low-Medium effort.)*
5. **(Architectural, largest item — stage last, after 1-4 prove the pattern) Split `DBState.db.characters` into per-character reactive slices** so only the active character is a "hot" proxy and editing one character cannot force reactivity traversal touching others. Large surface area — every read/write site of `DBState.db.characters[i]` across `src/ts` and `src/lib` — should be scoped deliberately and probably split into its own sub-project once items 1-4 are proven. *(Report 01, recommendation 3 — High effort.)*
6. **[from round 2] Apply the same "give it a real draft copy" fix to the LoreBook entry editor and the Regex/Script editor**, which round 2 confirmed have the same live-`DBState`-binding pattern as the Module editor (item 1 above). Whether they carry the same *clone-cost* severity as the Module editor wasn't established — round 2 found direct binding is actually widespread (Persona/CharConfig too) — so profile each before assuming it needs the same fix; fix the ones that demonstrably clone something expensive on every keystroke. *(Report 01-deepdive, Lead 1 — Medium effort, sequence after item 1 proves the pattern.)*
7. **[from round 2] Add real virtual scrolling (or at minimum a cap) to the other uncapped `{#each}` lists found**: LoreBook/WorldInfo entries, scripts, triggers, characters, personas, modules. Round 2 found these lack any windowing but could not establish real-world cardinality/impact — treat as lower priority than the chat list (item 3) unless a specific list is reported as a problem in practice. *(Report 01-deepdive, Lead 3 — Low-Medium effort, investigate-before-implementing.)*

**Exit criterion for this phase** (relevant to Phase 4/Android gating): a long chat session with a large module set no longer shows the reported keystroke stutter, and peak memory for an active long conversation is bounded rather than growing monotonically with scroll-back depth.

---

## Phase 3 — ARM desktop platform expansion (independent of Phase 2; can run in parallel with Phase 1/2)

Desktop ARM targets are **not** gated behind the RAM work — they're a CI/packaging problem, not a low-RAM-device problem. Can be scheduled independently.

1. **✅ DONE. ARM Linux (`aarch64-unknown-linux-gnu`)**: added to the release build matrix (`.github/workflows/github-actions-builder.yml`) via a native `ubuntu-24.04-arm` GitHub-hosted runner (free for public repos), not QEMU/buildx cross-compilation — Tauri's own guidance favors a native runner for a Rust+WebKit build like this, since cross-compiling under emulation is slower and more prone to native-dependency build failures than the Docker server image's simpler buildx case. No `Cargo.toml`/`tauri.conf.json` changes were needed, matching the original estimate. One real fix beyond the matrix entry itself: the existing "install dependencies (ubuntu only)" step's condition (`matrix.settings.platform == 'ubuntu-latest'`) would have silently skipped installing `libwebkit2gtk-4.1-dev`/`libappindicator3-dev`/`librsvg2-dev`/`patchelf` on the new `ubuntu-24.04-arm` runner, since that's a different platform string — changed to `startsWith(matrix.settings.platform, 'ubuntu')` so both Ubuntu runners get the same system dependencies. Not yet verified by an actual CI run (this only triggers on push to `production` or manual dispatch) — first real run should be watched for `install_python`'s known amd64-only gating (Phase 0, already fixed) and for any ARM-specific native-dependency surprises the YAML change alone can't catch. *(Report 04 — Medium-low effort, confirmed accurate.)*
2. **✅ RESOLVED — decided against.** Windows on ARM (`aarch64-pc-windows-msvc`). Native local inference is now explicitly DISABLED on ARM64 Windows hosts, and no native ARM64 Windows release target is being added. The earlier framing of this item rested on a factual error, corrected here so it is not repeated.
   - **The correction.** The previous "Done" note claimed that making `install_python()` read `std::env::consts::ARCH` prevented an ARM64 build from "silently running the amd64 interpreter under Windows' x64 emulation layer." That scenario cannot occur. `std::env::consts::ARCH` is a **compile-time** constant describing the build *target*, not the host CPU. The only Windows binary this project ships is `x86_64-pc-windows-msvc`, so it reports `"x86_64"` on every machine — including ARM64 hardware under emulation, where downloading the amd64 interpreter is the *correct* behaviour for that process. The `arch == "aarch64"` branch was dead code in every artifact ever produced, and has been removed.
   - **Why disabled rather than shipped.** The spike did establish that `llama.cpp` builds on an ARM64 CI runner — but only after activating the ARM64 Native Tools environment and passing explicit Clang `CMAKE_ARGS`. That answers a CI question, not a product one. A real end user's Windows-on-ARM machine has no Visual Studio or Clang, so the first-run `pip install llama-cpp-python` source build can never succeed there. Shipping a native ARM64 build would not change that; it would relocate the same failure. This is exactly the product-level question the spike's own comments flagged as uninvestigated, and the answer is that the feature is not deliverable to end users on this platform.
   - **What shipped instead.** Runtime host detection via `IsWow64Process2` (`host_is_arm64()` in `src-tauri/src/main.rs`), reading `pNativeMachine` only, which reports the true host architecture regardless of whether the calling process is emulated. A new `local_inference_unsupported_reason()` command lets the frontend refuse before any download begins — including for users who already have a `completed.txt` from a prior install, since that file short-circuits the entire install block. `windows-sys` is pinned to a version already in `Cargo.lock` and scoped to `cfg(windows)`, with a `cfg(not(windows))` arm so macOS and Linux still compile. Known limitation: `windows-link` binds the import via `raw-dylib`, which resolves at load time, so on Windows older than 10.0.10586 the process would fail to start rather than falling back — Tauri v2's floor is Windows 10 1803+, so nothing in the supported matrix is affected.
   - **Spike retired.** `.github/workflows/spike-windows-arm64-llama.yml` has been deleted; its question is moot under this decision. Its findings are preserved in this entry and in git history.
   - **CI matrix unchanged, and was never the problem.** `.github/workflows/github-actions-builder.yml` has no ARM64 Windows entry and never had one, and it installs no Python or pip packages at any point. The pyyaml/uvicorn MSVC bottleneck was never a CI issue — it lives entirely in the end-user first-run path, which is what the gate above short-circuits.
   - **Unplanned but related work.** Investigating this uncovered that every success signal in the bundled-Python install pipeline was fake, and fixing that took four commits ahead of the ARM work itself: `install_pip` judged success by matching `get-pip.py`'s stdout against `"Python "` (a copy-paste of `install_python`'s `python --version` check), so it returned `false` on every *successful* run; `post_py_install` wrote the `completed.txt` gate unconditionally, so a single failed run silently bricked local inference forever, recoverable only by deleting the file by hand; `install_py_dependencies` inspected only stdout and returned `Ok(())` regardless of exit status, so a failed `llama-cpp-python` build was reported as success; and panics inside `async` Tauri commands left their JS promises permanently unsettled (tauri discards the spawned task's `JoinHandle` and installs no `catch_unwind`), so a first run with no network hung the UI forever with no error. All are fixed on this branch, with test coverage. One consequence worth recording: the ARM failure is now visible and accurate *even without* the gate — the gate's remaining value is refusing before a doomed multi-minute build rather than after it.

---

## Phase 4 — Android (explicitly gated behind Phase 2)

**Do not begin implementation work in this phase until Phase 2's exit criterion is met.** Cross-compiling the current architecture to Android as-is causes OOM crashes on low-RAM devices — this is a hard prerequisite, not a preference.

Once Phase 2 has landed:

1. Run `tauri android init` — expected (per Tauri's documented tooling behavior, not yet independently verifiable from this repo since `gen/android` doesn't exist) to automatically pick up the already-staged icons at `src-tauri/icons/android/mipmap-*/` (15 files; Phase 0's cleanup already removed the confusing orphaned Capacitor set, so there's no ambiguity left by this point) — verify this actually happens as the first concrete step of this phase, rather than assuming it.
2. Write the `lib.rs` this project doesn't yet have, and reconcile it with the current (substantial) `main.rs` and the commented-out `[lib]` section in `Cargo.toml` (`name = "alib"`). **Note (corrected):** `mainx.txt` is confirmed to match Tauri's mobile-template shape and was introduced alongside that `[lib]` block in the Tauri V2 migration commit, but it is not a "mostly-ready" scaffold — there is no `lib.rs` today, so this is closer to new work than to finishing an existing attempt.
3. Decide a replacement/removal strategy for the plugins currently `cfg`'d out or excluded on Android: `tauri-plugin-single-instance`, `tauri-plugin-updater` (both excluded), `tauri-plugin-deep-link` (needs Android's App Links wiring — Tauri 2 supports this, just not enabled here yet, and it's load-bearing for the existing OAuth login flow).
4. Author an Android/mobile `capabilities/*.json` file (none exists today — `desktop.json` explicitly lists only `["macOS", "windows", "linux"]`).
5. Make an explicit product decision to **disable, not silently break**, the `src-python`/llama.cpp local-inference feature on Android — there is no realistic path to on-device GGUF inference without a substantial from-source NDK cross-compile of `llama-cpp-python`, which is out of scope unless separately justified.
6. Leverage existing `src/lib/Mobile/` components and the storage layer's existing "Mobile" adapter concept as a starting point for the Android UI/storage story — noted as promising but unverified for Tauri-Android-readiness as-is; needs its own validation pass once this phase actually starts.
7. **[from round 2] Introduce an `isDesktop` (`isTauri && !isMobile`) flag in `src/ts/platform.ts`** and switch the four confirmed `isTauri`-conflated-with-desktop call sites to it: window maximize/fullscreen and the update-checker in `bootstrap.ts`'s startup path, and MCP's stdio transport (arbitrary local-process spawning, fundamentally incompatible with Android's sandbox regardless of gating). Cheap to do now, ahead of when it would otherwise block Android bring-up — could reasonably be pulled forward into Phase 0.5 rather than waiting for this phase, since it doesn't depend on Phase 2. *(Report 04-deepdive, Lead 3 — Low-Medium effort.)* The one-line `#[cfg(desktop)]` compile-blocker fix for the same two plugins at the Rust level is already in Phase 0.5, not repeated here.

---

## Chores — confirmed bugs found during Stage B, NOT yet scheduled

Found while scoping the module-editor partition (2026-09-21). All three were **verified against
source**, none is fixed, and none was absorbed into Stage B. Recorded here so they are not lost.
Evidence and full reasoning: `Agents/Reports/11-stage-b-module-effect-partition-plan.md` section 8.1.

### CHORE-01 — Mutations to a NON-selected character are never marked for save

**Confirmed bug — EMPIRICALLY REPRODUCED, not just source-traced.** Occasional loss, not
systemic; severity depends on user behaviour. See CHORE-03 for the reproduction.

`dbChangeEffects.svelte.ts:70-86` deep-reads only `DBState.db.characters[selIdState]`, and
`tracker.character` is written in exactly one place (`:77-78`), gated on that same selection.
`risuSave.ts:284-308` re-encodes a character only when its `chaId` is in `toSave.character`;
otherwise the `else if(!this.blocks[character.chaId])` branch reuses the existing block. So a
mutation to a non-selected character that already has an encoded block is silently never written.

**Two mitigations, both accidents of implementation rather than designed guarantees:**
- `requiresFullEncoderReload` re-encodes every character (`globalApi.svelte.ts:777-784` ->
  `risuSave.ts:250-260`). Set at only 4 sites: `characters.ts`, `drive/backuplocal.ts`,
  `kei/backup.ts`, `process/coldstorage.svelte.ts`.
- Selecting the character later re-captures the edit, because the effect re-runs on selection
  change and the edit is still on the live proxy. **So the real failure mode is "never persists
  unless the user reopens that character before reload/crash/close."**

**Blast radius:** 67 raw candidate writes across 24 files; ~60 resolve to the live selection and
are not instances. Real non-selected-index writers:

| Writer | Status |
|---|---|
| `process/coldstorage.svelte.ts:590-622` compaction sweep | self-mitigated (sets `requiresFullEncoderReload` at `:621`) |
| `src/lib/Others/GridCatalog.svelte:142-146` restore-from-trash | **UNMITIGATED, real UI action** — see CHORE-03 |
| `src/ts/plugins/apiV3/v3.svelte.ts:879-885` `setCharacterToIndex` | **UNMITIGATED public plugin API**, zero first-party callers, documented at `plugins/apiV3/risuai.d.ts:1326-1333` |
| `bootstrap.ts:495-503` legacy `!db.formatversion` migration | narrow, one-time legacy path |

**Fix surface: small but not proven exhaustive.** The defect is centralised in one gating
condition and one consumer; the ~60 selection-relative writers need no change. What is missing is
a general "mark this `chaId` dirty" primitive — today the only escape hatch is the blunt
whole-database `requiresFullEncoderReload`. `toSaveType.character` is already `string[]` of
arbitrary ids, so **the save format does not block a fix**; the obstacle is that these writers
have no handle on the tracker instance. Needs its own plan and `opus-reviewer` gate.

**Not settled:** whether real plugins call `setCharacterToIndex` on non-current indices
(unknowable from this repo; the sanctioned API shape is the relevant fact), whether the
`bootstrap.ts` legacy migration is still reachable, and MCP/risuaccess write paths were not
exhaustively swept.

### CHORE-02 — `toSave.chat` is dead plumbing in the encoder

`grep -n "toSave.chat\|RisuSaveType.CHAT" src/ts/storage/risuSave.ts` returns **nothing**. The
field is populated (`dbChangeEffects.svelte.ts:80-85`) and merged back on failed saves
(`globalApi.svelte.ts:620-623`), but the encoder never reads it to decide anything — chats persist
inside the whole-character `CHARACTER_WITH_CHAT` block, gated solely by `toSave.character`.

Consequence: leftover/aspirational plumbing for a per-chat granularity that was never wired up.
**Useful corollary: a CHORE-01 fix needs no parallel per-chat work.** Decide whether to wire it up
or delete it; do not leave it looking load-bearing. Low risk either way, but deleting it touches
`toSaveType`, so treat it as save-adjacent.

### CHORE-03 — Trash: dedicated bug-hunting pass

**Maintainer report: the trash implementation is known to be unstable among the community.** That
is consistent with what fell out of CHORE-01 without anyone looking for it:

`GridCatalog.svelte:142-146` restore does
`DBState.db.characters[restoreIdx].trashTime = undefined` with
`restoreIdx = findCharacterIndexbyId(char.chaId)` — not the selection — then calls
`checkCharOrder()`, which mutates only `db.characterOrder`. That top-level key IS covered by the
generic effect loop, so **a save fires** — but this character's `chaId` never enters
`toSave.character`, so `risuSave.ts:298` reuses the stale block, which still has `trashTime` set.

**Reproduction: restore a character from trash, do not open it, close the app. It is back in the
trash on next load.**

**EMPIRICALLY REPRODUCED (2026-09-21)**, driving the real `registerDbChangeEffects()` and the real
`RisuSaveEncoder` / `decodeRisuSave` end to end and inspecting the decoded bytes — not a
reimplementation of the logic. The agent was briefed that a clean disproof was an acceptable result.
Orchestrator re-ran it independently and got identical values:

| Step | Observed |
|---|---|
| Restore char-B (non-selected) exactly as `GridCatalog.svelte:142-146` does | live `trashTime` -> `undefined`; `markChanged(true)` fires from the `characterOrder` touch |
| **Is `char-B` in `toSave.character`?** | **`false`** (`["char-A"]` only) |
| **Decoded `trashTime` after that save** | **`1700000000000` — still trashed. Bug confirmed.** |
| Then select char-B and save again | decoded `trashTime` -> `undefined` — the mitigation is real |

Reproduce:
```
npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/trash-restore-repro.svelte.harness.ts --reporter=verbose
```

The harness lives under `Agents/Tools/` as a `*.harness.ts` precisely so that a reproduction of a bug
we are NOT fixing cannot turn the app suite red. When CHORE-01 is fixed, promote it into a real
regression test and invert the step-7 expectation.

Finding one concrete data-losing bug in the trash path *incidentally*, while investigating
something else entirely, plus independent community reports of instability, is good evidence the
area deserves a hypothesis-free pass of its own rather than one-off fixes. Scope should cover at
minimum: `trashTime` set/clear paths, `removeChar` (`characters.ts:847`, including its
`'permanent'` mode), `GridCatalog.svelte`, `checkCharOrder`, interaction with `characterOrder`,
and what happens to a trashed character's assets and remote blocks.

Relates to the Roadmap's closing "Should there be a Round 3?" question — this is a concrete,
evidence-backed candidate area, which that note said was the missing ingredient.

### CHORE-04 — Module enable/disable causes a freeze too, by a DIFFERENT mechanism

**Maintainer report:** enabling a module from the chat screen (hamburger -> modules) and from
Settings -> Modules both freeze. Deserves its own investigation.

**Important: Stage B's partition does NOT fix this.** Stage B removed the per-keystroke cost of
editing module *content*. Toggling changes `db.enabledModules`, not module content, and the freeze
appears to come from a full GUI reload rather than from dirty-tracking.

**Grounded hypothesis — NOT verified, test it before acting on it:**

- Toggle in Settings (`ModuleSettings.svelte:83-89`) splices/pushes `db.enabledModules` then
  self-assigns it.
- Toggle in the chat menu (`ModuleChatMenu.svelte:98`, `:112`) does the same **and explicitly bumps
  `$ReloadGUIPointer += 1`.**
- Either way the enabled-id string changes, so `getModules()`'s cache key changes
  (`modules.ts:417-419`) and `moduleUpdate()` **also** bumps `ReloadGUIPointer`
  (`modules.ts:579-582`).
- `ReloadGUIPointer` drives `{#key $ReloadGUIPointer}` blocks at `Chat.svelte:522` and
  `BackgroundDom.svelte:15`. A `{#key}` change **destroys and recreates the entire subtree** — i.e.
  the whole chat message list re-renders.

So the suspected cost is a full chat re-render, possibly bumped **twice** per toggle (once
explicitly, once from `moduleUpdate`). That would also explain why it is worse with long chats,
which is a different scaling axis from module count.

**What the investigation should establish first:** measure it before theorising further — the
campaign's repeated lesson. Is the cost the `{#key}` teardown/rebuild, the module recomputation, or
both? Is `ReloadGUIPointer` bumped once or twice per toggle? Is a full chat rebuild actually
necessary for a module toggle, or is it a blunt instrument for a narrower need (background HTML and
chat-icon changes)? Note `resetScriptCache()` also hangs off this pointer, so it is load-bearing for
more than rendering — do not assume it can simply be removed.

### CHORE-05 — Translation coverage: much of the UI is English-only

**Maintainer report:** a lot of UI, dialogs and informational text render in English regardless of
the selected language, which dilutes the localised experience.

**Why missing keys are invisible rather than broken.** `src/lang/index.ts` builds every non-English
locale as `merge(safeStructuredClone(languageEnglish), languageKorean)` (and likewise for the
others) — each locale is **deep-merged over English**. A key missing from `ko.ts` therefore does not
throw or render blank; it **silently renders the English string**. That is exactly the "shows
English regardless of language" symptom, and it is why drift accumulates unnoticed: nothing fails.

**Measured key drift (2026-09-21).** Read-only diff of the flattened exported key sets of
`src/lang/*.ts` against `en.ts`, loaded with Node 24's native type stripping (no build, no source
change). This replaces an earlier line-count estimate.

| Locale | Keys | Missing | Missing % | Missing **and added by this branch** | Present but identical to English |
|---|---|---|---|---|---|
| `en` (reference) | 1529 | — | — | — | — |
| `ko` | 1476 | 53 | 3.5% | 9 | 9 |
| `zh-Hant` | 1464 | 65 | 4.3% | 9 | 17 |
| `cn` | 1431 | 98 | 6.4% | 9 | 19 |
| `de` | 1431 | 98 | 6.4% | 9 | 57 |
| `vi` | 1431 | 98 | 6.4% | 9 | 29 |
| `es` | 1430 | 99 | 6.5% | 9 | 35 |

- **20 keys are missing from all six locales**, so they are English for every non-English user.
- **No locale has orphaned keys** (keys absent from `en.ts`): drift is one-directional.
- "Identical to English" counts strings that exist in the locale but are byte-identical to English
  (filtered to alphabetic strings of 4+ letters). This is an **upper bound** on untranslated
  copy-paste — some are legitimately identical (product names, technical terms). `de` at 57
  stands out.

**This campaign is itself a source of the drift — recorded plainly.** Comparing today's `en.ts`
with `origin/main`'s (`git show origin/main:src/lang/en.ts`) shows **this branch added 9 keys, and
translated none of them into any locale**:

`otherTabSavedTitle`, `otherTabSavedSaveMine`, `otherTabSavedDiscardMine`,
`otherTabSavedConflictTitle`, `otherTabSavedConflictReload`, `otherTabSavedConflictStay`,
`savingStoppedStayMessage`, `savingStoppedNodeConflictMessage`,
`savingStoppedAccountConflictMessage` (introduced in `ee16a995` and `b11ea06a`).

These are the **multi-tab and save-conflict dialogs** — shown precisely when the user's data is at
risk and they must choose correctly between "save mine" and "discard mine". Every non-English user
currently gets that decision in English. They account for 9 of the 20 keys missing everywhere; the
remaining drift (44 `ko` / 56 `zh-Hant` / 89 `cn`,`de`,`vi` / 90 `es`) predates this branch.

**Recommended priority within this chore:** translate those 9 first. It is this campaign's own
debt, it is small and bounded (9 keys x 6 locales = 54 strings), and it sits on a data-safety
path. Everything else can follow.

**Two distinct problems — do not conflate them:**
1. **Key drift** (measured above) — mechanically detectable. A CI check that diffs each locale's
   key set against `en.ts` would stop new drift, including the kind this campaign just added. The
   diff above is a ready-made prototype for it.
2. **Hardcoded English in components** — literals never routed through `language.*` at all.
   **Not measured yet, and invisible to the diff above**, because they never enter any locale
   file. Needs a sweep of `src/lib/**/*.svelte` for user-visible string literals. Likely the larger
   half, and what makes the app feel English-only even where a locale file is complete.

Note `src/lib/Others/Legal.svelte` deliberately carries multi-language text inline and must not be
"fixed" into a single locale.

## Sequencing Summary

```
Phase 0 ✅ done ──> Phase 0.5 (round-2 quick fixes, any order) ──┬──> Phase 1 (persistence/integrity hardening)
                                                                  │
                                                                  └──> Phase 3 (ARM Linux ✅ done / Windows ARM ✅ resolved — declined) — independent, parallelizable

Phase 1 ──┬──> Phase 1.5 Tier A ✅ done (bootstrap null-overwrite fix)
          │
          ├──> Phase 1.5 Tier B Stage 1 ✅ done (Node-server optimistic concurrency, 9 review rounds)
          │
          ├──> Phase 1.5 Tier B Stage 2 ✅ done (account-sync conflict hardening, 3 review rounds)
          │
          ├──> Phase 1.5 Tier B Stage 3 ✅ done, naming-only (content-addressed remote blocks shipped; automatic GC deliberately skipped as not worth the cost — see Report 08)
          │
          ├──> Phase 1.5 Tier B item 3 ✅ done (multi-tab BroadcastChannel hybrid reload/prompt, 4 adversarial review rounds)
          │
          └──> Phase 2 (RAM/architecture rework) ──> Phase 4 (Android)

Phase 1.5 Tier B Stage 4 (revisit account-sync hub enforcement) is confirmed permanently out of reach, not merely blocked pending future hub access — the hub is maintained entirely upstream and this repo has no path to its source or behavior. The deferred-behind-Phase-2 items (CRDT/op-log, hard lock + takeover UI — explicit product decision to defer, not a technical blocker) remain not yet scheduled. A properly-scoped automatic-GC retry for Stage 3 (the transactional mechanism Report 08 sized but recommended against building now) is also not yet scheduled — worth revisiting only if real usage data ever shows unreclaimed remote-block storage growth is an actual problem, not a theoretical one.
```

Phase 0.5's Android compile-blocker fix (`#[cfg(desktop)]` on the two plugin registrations) is cheap enough that it has no real ordering dependency on anything — do it whenever convenient. Phase 1.5 Tier A and Tier B Stage 1 were both pulled forward ahead of/parallel to the rest of Phase 1 and Phase 2, same reasoning — isolated, no architecture dependency. Phase 3 (desktop ARM) has no dependency on Phase 2 and can proceed in parallel with Phases 0.5-2 if resourced separately. Phase 4 (Android) must not start before Phase 2's exit criterion is met — this is the one hard ordering constraint in this roadmap.

**Should there be a Round 3?** Both deep-dive rounds surfaced genuinely new, previously-undocumented bugs — round 2 was not a diminishing-returns exercise. Whether a third open-ended pass is worth running is a judgment call for the project owner: the highest-value remaining unknowns are probably not in these four subsystems anymore (two rounds of hypothesis-free hunting have covered them reasonably thoroughly) but in areas this investigation hasn't touched at all yet (the request/provider-abstraction layer, the memory/summarization systems' correctness beyond RAM footprint, the plugin API v3 sandbox's security boundary, i18n/translation correctness). Recommend deciding this after Phase 0.5 ships and its Codex reviews land, not before.
