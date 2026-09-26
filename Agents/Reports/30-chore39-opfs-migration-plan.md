# CHORE-39 — OPFS migration: no lockout, no partial read, one migrator

**STATUS:** **done, committed as `37898465`** (2026-09-26). Gate 2 round 1 rejected the
implementation (ledger row 229: the lock winner did not re-read the flag); round 2 closed it as
[EDITORIAL] (row 230). The live check passed (row 231). Plan rev 2.1; Gate 1 as below.

**Gate 1 passed.**
- **Round 1 rejected rev 1** (`opus-reviewer`): one BLOCKER, three MAJOR, two MINOR and editorial
  points, all verified by the Orchestrator against source. Rev 2 answers each; section 6 maps
  finding to change.
- **Round 2 (the same reviewer) returned [EDITORIAL] on rev 2:** the design holds in every Web
  Locks ordering its queue simulation walked (`scratchpad/locksim2.mjs`: two tabs with long and
  short copies, the migrator closed at three points, both scenario B orderings), with no split
  backends, no write during another tab's copy, and no hang. Two wording corrections (E1: O5's
  "migrator closed" acceptance; E2: scope the unsupported-locks branch) and four recommendations
  (N1: post the notice after `setDatabase()` so it is translated; N2: the lock seam's
  single-instance rule; N3: O7's refusal before the lock; N4: the O5 red run fails for the real
  reason). Rev 2.1 applies all six; they are closed under AGENTS.md section 4's editorial-only
  rule.
- Ledger: row 223 (the investigation), rows 226 and 227 (Gate 1 rounds 1 and 2).

**Decisions:** MC-089 (the OPFS switch stays visible; nothing ships until every ticket clears),
MC-092 (CHORE-39 goes before W1), MC-088 (the switch lives on the Backup & Files tab), MC-011
(no fork userbase; upstream data must keep working).

**Evidence:** `investigator` packet (2026-09-26); the Gate 1 round 1 review, including its
Web Locks queue simulation (`scratchpad/locksim.mjs`, a diagnostic experiment); the
Orchestrator's own reading of `autoStorage.ts` `Init()`, `opfsStorage.ts`, `storageMaintenance.ts`,
`coldstorage.svelte.ts` and the Web Locks helpers in `globalApi.svelte.ts`. Report 28 F9 and
ledger row 194 finding (6) raised the ticket.

---

## 1. What happens today (TRACED unless marked)

- **`enableOpfs()` does not copy anything.** It confirms, takes the exclusive storage-migration
  lock (which requires no other live tab), sets `localStorage['opfs_flag!'] = 'able'`, and
  reloads. The lock is released by the reload.
- **The copy runs on the next boot**, in `AutoStorage.Init()`, when the flag is `'able'`, OPFS is
  supported, the LocalForage `risuai` instance holds `database/database.bin`, and neither
  `migrated` nor `denied_opfs` is set there. It copies every LocalForage key into `OpfsStorage`,
  one at a time, then sets `realStorage` to OPFS, clears the progress alert, and writes
  `migrated = true` into LocalForage. The source is never removed.
- **Any throw in that branch fails the boot for good.** `Init()` has no try/catch; the only catch
  is `bootstrap.ts`'s outer `alertError`, which never sets `loadedStore`. The user dismisses the
  error and is left on "Loading…". Settings (and `disableOpfs()`) cannot be reached. Every later
  boot retries the full copy from the start. The only way out is outside the app.
- **Three throws lead there:**
  1. a `QuotaExceededError` (or any OPFS error) mid-copy. The copy and its source share one
     origin quota, and the source is not removed, so the copy needs free space about equal to
     the LocalForage payload;
  2. the final `migrated` write into LocalForage failing after a complete copy. Plausible when
     the user is short of space, which is when they would enable OPFS (not shown). Every retry
     then re-copies everything and fails on the same write;
  3. **a junk key from cold storage (Gate 1 finding 2).** Cold storage writes
     `coldstorage_<key>.json` into the OPFS root, the same directory `OpfsStorage` uses.
     `OpfsStorage.keys()` hex-decodes every file name, so each such name decodes to a junk key
     (the reviewer ran the `buffer` polyfill and got `"\f"`). `disableOpfs()` copies it back as
     `setItem(junk, null)` into LocalForage. On the next enable the copy calls
     `opfs.setItem(junk, null)`, and `stream.write(null)` throws (INFERRED from WebIDL: `null`
     converts to a `WriteParams` dictionary missing its required `type`; not run in a browser).
     So for a profile with cold storage, enable → disable → enable fails every time.
- **A partial copy is never read as the database.** `realStorage` becomes OPFS only after the
  loop completes, or when `migrated` is set (only ever written after a complete loop), or when
  LocalForage has no database. This property must be kept.
- **Two tabs can copy at once (TRACED; the reviewer's simulation confirmed the lock
  behaviour).** The boot copy runs under only the shared tab-presence lock. A second tab opened
  during the copy starts its own copy; if the first finishes and saves to OPFS first, the second
  overwrites the newer `database/database.bin`. Two comments claim the opposite: the lock
  helper's doc comment in `globalApi.svelte.ts` and the comment at the top of `Init()`. Both hold
  for `enableOpfs()`'s own critical section, not for the boot copy.
- **The Settings switch reads only the flag.** `StorageMaintenanceSettings.svelte` picks "enable"
  or "switch to default" from `isOpfsEnabled()`, which reads `opfs_flag!`. `disableOpfs()`
  copies every OPFS key into LocalForage without checking which backend this tab is on. Today a
  set flag always means this tab is on OPFS; any design that leaves a tab on LocalForage with the
  flag set breaks that (Gate 1 finding 1).
- **`denied_opfs`** is read in `Init()` and has never been written in any commit.
- **`isQuotaExceededError`** is module-private in `globalApi.svelte.ts`.
- **Coverage:** `enableOpfs`/`disableOpfs` have tests (`storageMaintenanceOpfs.test.ts`). The
  copy loop in `Init()` has none.
- **Upstream compatibility facts (reviewer, from git history):** upstream never had a UI for the
  flag (`1f2e9be9` added the migration, `3d6169b5` renamed the flag; the fork's `155c915c` wired
  the switch). The `migrated` boolean, the hex-named files in the OPFS root and the unused
  `denied_opfs` key are upstream's and are kept.

## 2. Invariants and acceptance

**O1 — No lockout.** If the boot copy cannot complete, that boot finishes on LocalForage, whose
data is intact, and `opfs_flag!` is cleared, so the next boot does not retry and the Settings
switch shows OPFS off. The user is told, in a notice, that the storage backend was not switched,
that their data is unchanged, and why: out of space for a quota error (`isQuotaExceededError`,
exported), otherwise a generic reason with the error text. They may switch again from Settings.
The progress alert does not stay on screen.
- **Scope (Gate 1 finding 3).** Only failures **after the decision to copy** are O1 failures:
  the copy loop, O4's clean-up, and the completion marker. A failure to **read the decision
  state** (the flag, `migrated`, whether LocalForage holds a database) is not caught by O1: it
  stays a loud boot failure and never selects LocalForage. Otherwise a failed read on an
  already-migrated profile would boot the stale pre-migration LocalForage copy with no warning.
*Acceptance:* a copy that throws a `QuotaExceededError` at key k of n; one that throws a
non-quota error; each boots to LocalForage, reads the original database, clears the flag, and
posts the notice. RED against the current code. A decision-state read that throws still rejects
`Init()` (guard).

**O2 — Completion is recorded, or the switch does not happen.** OPFS becomes the backend only
after the copy loop and the completion marker (`migrated` in LocalForage, as upstream) have both
succeeded. If the marker write fails after a complete copy, that is an O1 failure.
*Acceptance:* the marker write throws after a complete copy → O1's outcome, and a second boot
does not re-copy. RED against the current code.

**O3 — A partial copy is never read as the database** (kept). *Acceptance:* guard tests: after
O1's failure paths the next boot reads LocalForage; with the flag set by hand again and
`migrated` unset, the copy restarts rather than reading OPFS.

**O4 — A failed copy gives back the space it took.** On an O1 failure, every key this run
created or overwrote in OPFS is removed, **including the key being written when the throw
happened** (`getFileHandle(..., { create: true })` has already created its file). Removal is
best effort: a failed removal is logged, not fatal. It runs while this tab still holds the
exclusive lock, so no other tab can read OPFS meanwhile. These keys are copies of LocalForage
values that are still intact, so removing them loses nothing.
*Acceptance:* after a failure at key k, OPFS holds none of the keys this run wrote, including
key k's empty file (RED). A key present in OPFS before the run and not rewritten by it is
untouched (**guard**: it passes against today's code too).

**O5 — One migrator, and every tab decides its backend from state read under its own lock.**
- The boot copy runs while this tab holds the exclusive storage lock.
- **Every** tab, winner and loser alike, settles its backend only from the flag and `migrated`
  as read **after** it is back on the shared hold it keeps for its lifetime (for the winner:
  after the release function resolves). Outcomes: marker set → OPFS; flag cleared → LocalForage;
  flag set and marker unset → this tab did not copy and cannot now (another tab is alive, or the
  migrating tab was closed mid-copy): **clear the flag** (never keep it; Gate 1 finding 1),
  LocalForage, and O1's notice with a reason that is true in both cases ("another tab was open,
  or a switch was interrupted").
- **Web Locks unsupported** (`navigator.locks` absent) is handled separately from "not granted"
  (Gate 1 finding 4): clear the flag, LocalForage, notice with that reason. The Settings switch
  already requires `navigator.locks`, so this is reachable only through a flag set outside the
  app.
- **Locks are released before any notice is posted** (Gate 1 finding 5), so no other tab waits
  at `tabPresenceLockAcquired` for this tab's user to click.
- The copy uses the raw OPFS and LocalForage instances, never `AutoStorage` methods (which would
  re-enter `Init()` and deadlock on `dbWriteLock`).
- `Init()` returns one shared in-flight promise, so a second caller in the same tab cannot start
  a second copy.
*Acceptance* (with the test harness in section 3): two tabs booting, copy longer than the
exclusive timeout → exactly one copies; the loser ends on OPFS and never writes OPFS during the
copy. Copy shorter than the timeout → the loser gets the lock, sees the marker, ends on OPFS
without copying. A tab opened mid-copy waits, then boots on OPFS. The migrating tab closed
mid-copy, three cases: a waiting tab whose exclusive request had already timed out → clears the
flag, LocalForage, notice; a waiting tab whose request is still queued → gets the lock, copies,
ends on OPFS; a fresh boot after the closure → copies, ends on OPFS (as O3's guard requires).
RED for the concurrent case against the current code, failing because two tabs both copy — not
because the lock seam or an injection point is missing; the red run is recorded as it actually
failed.
- **Scope of the unsupported-locks branch.** It applies only where the lock is taken: after the
  decision, with `migrated` unset and a LocalForage database present. It is never checked at the
  top of the OPFS branch, where it would clear the flag of a migrated profile and boot the stale
  pre-migration LocalForage copy.

**O6 — Space is checked before the switch, while Settings is on screen.** In `enableOpfs()`,
before the exclusive lock is taken: when `navigator.storage.estimate()` is available and
`quota - usage` is below `usage` (the copy may need about as much again), show a confirm that
says the switch may not fit and what happens if it fails (O1), with both figures. Proceed only on
confirm. When `estimate()` is unavailable or throws, skip the check. The threshold overestimates
(usage includes cold storage and caches); that only causes extra prompts. The reviewer agreed a
confirm, not a refusal, is the right strength given O1.
*Acceptance:* ample space → no extra prompt; tight space → the confirm, and Cancel leaves the
flag unset and does not reload.

**O7 — The Settings switch reflects the backend this tab is actually on, and disabling needs
OPFS (Gate 1 finding 1).** The switch shows "switch to default" only when this tab's storage is
OPFS. `disableOpfs()` refuses, with a message, unless this tab's storage is OPFS. With O1/O5
always clearing the flag this cannot diverge from the flag, but the switch must not rest on that.
*Acceptance:* a tab on LocalForage with the flag set by hand never offers or runs the disable
action (RED for `disableOpfs()` against the current code).

**O8 — Cold storage never breaks the switch (Gate 1 finding 2).**
- The copy skips keys whose LocalForage value is `null` or `undefined` (junk keys already copied
  back by an earlier `disableOpfs()` stay harmless).
- `OpfsStorage.keys()` returns only names that round-trip (hex-decode, then re-encode, equals
  the file name). Every name `OpfsStorage` itself writes round-trips; cold storage's files and
  any other foreign files do not, so `disableOpfs()` stops creating junk keys.
*Acceptance:* enable → disable → enable with a `coldstorage_*.json` file present ends on OPFS
with the data intact (RED against the current code, given the fake OPFS rejects
`write(null)` as the reviewer infers a browser does). `keys()` with a cold-storage file present
excludes it.

**O9 — Unchanged behaviour.**
- A profile already migrated (flag `'able'`, `migrated` true) boots on OPFS with no copy. This
  is also upstream's state for a user who set the flag upstream. Guard test, with a variant where
  `navigator.locks` is absent (still OPFS, flag kept).
- No database in LocalForage → OPFS with no copy. Guard test.
- Node server and Tauri never reach this branch.
- The save format, block layout and `database.bin` contents are untouched.

## 3. Proposed approach (non-normative)

- **A testable lock seam (Gate 1 finding 6).** Move the Web Locks helpers
  (`acquireOwnSharedPresenceLock`, `acquireExclusiveStorageMigrationLock`, their per-tab state and
  the write mutex they take) into a small module whose factory takes the lock manager and returns
  per-tab state; `globalApi.svelte.ts` keeps its current exports as the default instance. Tests
  then build one instance per simulated tab against a fake lock manager that grants strictly in
  queue order (a shared request waits behind a queued exclusive one) and honours `AbortSignal`.
  Without both, the timeout paths and "exactly one copies" pass for the wrong reason (a shared
  in-process mutex would serialise the tabs, not the locks).
  **Single-instance rule:** production has exactly one instance per page, and its write mutex is
  the same object as the `dbWriteLock` that `saveDb` and `loadDrive` take. A second instance
  would let an autosave land in OPFS after `disableOpfs()` read it, and would give the tab a
  second shared hold that blocks its own exclusive request. An identity test pins it.
- `autoStorage.ts`: read the decision state outside any O1 catch; take the exclusive lock; re-read;
  copy with tracked keys, skipping null values; write the marker; on failure remove the tracked
  keys, clear the flag, record a notice reason on the instance (as `staleAccountProfile` is
  recorded) and land on LocalForage; release the lock; re-read under the shared hold and settle.
- `bootstrap.ts`: if a notice reason is recorded, post the notice **after `setDatabase()`**
  (where the stale-profile check sits, after decode and before `checkDriverInit`), so it shows in
  the user's language (`language` is English until `setDatabase()` runs `changeLanguage()`), and
  wait for it to be acknowledged before continuing the boot. The locks are already released, so
  only this tab waits. Waiting also keeps the notice from colliding with a later
  blocking dialog (Report 28 section 11.7's accepted limitation), since the agreement prompt and
  the deep-link prompt are posted only after `loadedStore`.
- `opfsStorage.ts`: the round-trip filter in `keys()`. Optionally `abort()` the writable stream
  after a failed write, which may give back the swap file's space (suspected, not shown).
- `storageMaintenance.ts`: O6's check before the lock; O7's refusal, also before the lock (a
  refusal after it would leave `dbWriteLock` held). `StorageMaintenanceSettings.svelte`:
  the switch reads the backend in use.
- `globalApi.svelte.ts`: export `isQuotaExceededError`; correct the lock helper's doc comment,
  and the comment at the top of `Init()`, to name the boot copy.
- `src/lang/*.ts`: the notice reasons, the O6 confirm, the O7 refusal (en by `sonnet-coder`, the
  rest by `translator`).
- Tests: a new `autoStorage.opfsMigration.test.ts` (fake OPFS that can throw at key k and rejects
  `write(null)`, fake LocalForage, the lock seam with per-tab instances);
  `storageMaintenanceOpfs.test.ts` extended for O6 and O7; an `opfsStorage` test for O8's
  `keys()` filter.

## 4. Questions for Gate 1 round 2

1. Is O5's "clear the flag when this tab cannot copy" safe in every Web Locks ordering, including
   the reviewer's scenario B (a tab running `disableOpfs()` while another boots)? Under O7 that
   tab must be on OPFS to disable at all.
2. Does the lock seam extraction change any behaviour of the existing helpers, or of
   `disableOpfs()`'s catch path, which calls the release function without reloading?
3. Is waiting for the notice in `bootstrap.ts` safe relative to `LoadingStatusState`, the service
   worker and the stale-profile notice (which is posted without waiting and ends the boot)?
4. O8's round-trip filter: can any file `OpfsStorage` or upstream wrote fail to round-trip (for
   example a key with characters whose UTF-8 hex is not unique)?

## 5. Out of scope, and optional items not taken

- Reclaiming the LocalForage source after a successful migration.
- Cold storage's own quota handling, and moving cold storage out of the OPFS root.
- Which OPFS call raises `QuotaExceededError` in each browser (a runtime observation; the design
  treats any throw the same way).
- **Removing `migrated` in `enableOpfs()`** (reviewer's optional item): not taken. With the flag
  cleared outside the app while `migrated` is set, both choices lose something (keeping it boots
  OPFS and hides LocalForage edits made since; removing it copies older LocalForage data over
  newer OPFS data). The app itself never clears the flag while `migrated` is set, so this state
  arises only from outside the app. Left as is.

## 6. Gate 1 round 1 findings → rev 2

| Finding | Change |
|---|---|
| 1 BLOCKER: fallback kept the flag; disable could roll back data; tabs on different backends | O5 always clears the flag; every tab settles from state read under its shared hold; O7 |
| 2 MAJOR: cold storage junk key fails every re-enable | O8; section 1 item 3 |
| 3 MAJOR: O1 must not cover decision-state reads | O1 scope paragraph |
| 4 MINOR: unsupported locks treated as "tab alive"; notice untrue if the migrator died | O5 bullets 3 and 4 |
| 5 MINOR: release locks before the notice | O5 bullet; section 3's `bootstrap.ts` item |
| 6 MAJOR (tests): fake locks and shared module state | Section 3's lock seam; O5's scenarios; O4 guard label and in-flight key |
| 7 EDITORIAL: section 3 contradiction; I6 misdescribed; "likely" | Section 3 now hands the notice to boot; "plausible" |
| Missed facts: `isQuotaExceededError` private; `Init()` comment | Section 1; section 3 |
