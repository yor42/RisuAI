# CHORE-42 — A local restore while other tabs are open

**STATUS:** plan rev 3.1, 2026-09-27. **Gate 1 passed** (round 3 [APPROVE], ledger row 247). Not implemented. Rev 3.1 folds in round 3's optional points.
- **Gate 1 round 2 (the same reviewer, ledger row 246): [REJECT].**
  - The epoch design, the reload fix, installing the database after the write, and the single release owner are accepted.
  - Three narrow MINOR findings: J8 against CHORE-39's boot-copy tests; the re-record trap and the release order on a mismatch; how J8 is tested.
  - Editorial wording fixes. Rev 3 answers them in section 8.
- **Gate 1 round 1 (`opus-reviewer`, ledger row 243): [REJECT].**
  - Two MAJOR findings: a lost race through the exclusive lock, and a reload that the app's own "Leave site?" guard can cancel.
  - Four MINOR findings and four editorial ones.
  - The Orchestrator verified each finding against source. Rev 2 answers them; section 7 maps finding to change.

**Decisions:**
- MC-093 (refuse the restore, or at least warn, while other tabs are open);
- MC-011 (local `.bin` restore is the migration path from upstream);
- MC-081 (the encrypted-account refusal happens before anything is written);
- MC-002 (hosting setups), MC-050, MC-070 (self-hosted web builds get the leave-site guard; app-initiated reloads mark themselves to pass it), MC-089, MC-091.

**Evidence:**
- the `investigator` packet (ledger row 242);
- the Gate 1 round 1 review and its scratch reproductions (`scratchpad/chore42/lostRace.test.ts`, `doubleRelease.test.ts`);
- the Orchestrator's reading of `storageTabLocks.ts`, `backuplocal.ts`, `reloadGuard.ts` and `preload.ts`.

## 1. The hazard

Tab A restores a local backup and reloads. Tab B, another tab of the same browser and origin, stays open. B has no way to learn of the restore: the restore never posts on the save loop's BroadcastChannel, and `dbWriteLock` is per page. The reloaded A broadcasts only on its first save.

So once anything changes B's database (unsaved edits, a later user edit, a plugin), B's next save writes its whole pre-restore database over the restore. An idle, clean B is safe only until then.

On the Node server, a stale write fails with a 409 for any key the stale tab has already read or written, since `NodeStorage` sends `if-match-revision` for every key in `knownRevisions`. That includes `database/database.bin`. Keys the stale tab never touched are written unguarded.

Tauri is single-instance and has one window.

`loadInternalBackup()` only replaces the in-memory database, and the save loop writes and broadcasts it. It is out of scope.

## 2. Scope

**The guard, in `LoadLocalBackup()` only.** The partial backup has no separate load path. On web builds, before its first write, and after the read-only encryption scan, the restore takes the exclusive storage lock the OPFS switch uses. While it waits, a wait message says it is checking for other open tabs.
- **Another tab is open** (not granted within the timeout): **refused.** An error says to close the other tabs of this app and try again. Nothing is written.
- **Web Locks unavailable:** **warned.**
  - This happens on a statically served web build on a non-secure origin (a plain-HTTP LAN address), and on browsers without Web Locks, e.g. Safari before 15.4. The Node server cannot run on a non-secure origin at all, because `NodeStorage` signs every request with `crypto.subtle`.
  - A confirmation asks the user to close every other tab of this app first. Cancel writes nothing; continue restores under this page's own `dbWriteLock`.
  - Refusing here instead would block every restore on those setups (MC-002; `localDrafts.ts` states their support).
- **Tauri:** single-instance, so no check and no warning. The restore runs under `dbWriteLock`, as today.
- **Granted:** the restore runs to its end under the lock.

**A stale page never performs, or resumes after, an exclusive operation (shared cause, MC-091; answers the lost race).**
- Every exclusive storage operation (restore, OPFS enable/disable, the OPFS boot copy) bumps a per-origin storage epoch as soon as it is granted.
- **When a page records the epoch.** A page records it once, when `AutoStorage.Init` has settled, while it holds its presence lock. It never records again, not even when it re-acquires presence after an attempt. Its own bumps update the record.
  - A page still inside `Init` has loaded nothing. A boot-copy loser therefore keeps CHORE-39's re-read of the marker and the flag under the lock. It does not reload, and its record is taken after `Init` settles.
  - A tab that loaded while another tab held the exclusive lock records the value current after that release, so it does not reload spuriously.
- **The epoch value** is a random token written to `localStorage`, not a counter, so clearing site data mid-session cannot produce a false match. The epoch store is injectable for tests. Cross-process `localStorage` visibility is the same assumption `AutoStorage.Init`'s `opfs_flag!` handoff already makes; it is recorded as S2.
- **Release order on a mismatch.** A page that detects a mismatch reloads **without first releasing `dbWriteLock`**. On the grant path it also keeps the exclusive lock. Its save loop may be parked on `dbWriteLock` holding bytes encoded before the other tab's operation, and releasing for even one tick would let that write land.
- The reload goes through an injectable seam that calls `markAppInitiatedReload()` first, so tests can observe it.
- **The record-taking hook is part of the lock contract**, e.g. a `recordStorageEpoch()` on the lock instance that `AutoStorage.Init` calls when it settles. Tests can then take the record without the real `AutoStorage`. The restore tests mock `storage/autoStorage`, so without such a hook the restore-side J8 reproducer could never fail.
- **A page with no record** skips the comparison. That covers only a page inside `Init`, or one whose `Init` rejected, whose boot has failed anyway.
- **If `localStorage` throws** when the epoch is read or written, the exclusive operation is refused with the storage-lock error, and nothing is written.
- **On a grant,** if the epoch differs from the page's record, another tab's exclusive operation ran since this page booted. The page does not proceed; it reloads.
- **On a failed attempt,** once the page has its presence hold back, the same comparison applies. On a mismatch the page reloads rather than letting its save loop resume.
- This changes `storageTabLocks.ts`'s contract. Its callers are `enableOpfs`, `disableOpfs`, `AutoStorage.Init`'s boot copy and the restore, plus four test files that mock it. The contract must also let a caller tell "unsupported" apart from "another tab". The OPFS switch's user-visible messages stay as they are.
- `autoStorage.ts`'s comment on what the contract does not expose is updated.

**The success path (shared cause with Report 31 item E, MC-091).**
- A successful restore always ends in a real reload that the leave-site guard lets through:
  - it calls `markAppInitiatedReload()`;
  - it uses a navigation that reloads even when the URL has only a fragment.
- The trailing "Success" alert goes. The wait message stays until the page unloads.
- This fixes committed `237ebba1`: there, cancelling the "Leave site?" prompt left the tab alive with its write lock held forever.

**The failure path.**
- The restored database is installed in memory only after its write succeeds. So a failed write leaves this page on its pre-restore database, and the error can truthfully say the restore did not complete. Assets and cold-storage entries already written stay.
- `onchange` gains the error path it lacks. Every failure after the file is chosen shows exactly one error, before any release is awaited. Failures include:
  - an early exit;
  - an asset or cold-storage write error;
  - a decode error;
  - a failed database write, including the Node server's 409.
- Any failure after a successful database write (installing it in memory, Tauri's `relaunch()`) reports that the restore was saved and asks for a reload or restart, and keeps the hold.
- Whatever the restore took is released **exactly once**, by a single owner.

**Lang:** new keys for the refusal, the warning, the wait message, the failure and the "saved, please restart" case, in all seven languages. Warnings keep their full force.

**Not in scope, recorded as observations:**
- other devices sharing one Node server, for keys the stale device never touched;
- `loadInternalBackup()`;
- S1: a tab whose presence request itself rejects still boots unseen. Web Locks rejects only for documents that are not fully active or have opaque origins, which is unlikely for the app page.

## 3. Invariants

- **J1.** A tab of this browser that holds its presence lock blocks the restore: the restore writes nothing and shows the refusal. A tab that is itself mid-way through an exclusive attempt may be overtaken; J8 then makes it reload.
- **J2.** Without Web Locks on a web build, a restore writes nothing until the warning is confirmed. Cancel writes nothing; continue behaves as J4 minus the cross-tab hold. Tauri shows neither the warning nor the refusal.
- **J3.** While a granted restore runs, no other tab of this browser writes the database or performs an exclusive operation. An overtaken tab can still write content-addressed assets through `saveAsset`; that is harmless, and it reloads. A tab that opens meanwhile does not finish booting before the restoring tab reloads or releases.
- **J4.** A successful restore's database write is the last write of `database/database.bin` from its page. The tab never deadlocks on its own locks, and it always reloads with no leave-site prompt.
- **J5.** Every exit without a successful database write releases what the restore took, exactly once. Afterwards this page can save, other tabs can boot, and this page can take the exclusive lock again.
- **J6.** Every failure after the file is chosen shows exactly one message, and none is left as an unhandled rejection or a stuck wait state. Two refinements:
  - A failed database write leaves this page on its pre-restore database.
  - A failure *after* a successful database write (installing it in memory, or Tauri's `relaunch()`) reports that the restore was saved and asks for a reload or restart, and keeps the hold.

  A J8 reload shows no message.
- **J8.** Once another tab's exclusive storage operation has run, a page never performs an exclusive operation and never resumes saving: it reloads first. This covers both of the reviewer's lost-race scenarios: the timed-out B that resumes, and the granted A after B's OPFS switch. On a mismatch, `dbWriteLock` (and on the grant path the exclusive lock) stays held until the page is gone.
- **J7.** Unchanged:
  - the encryption refusal (MC-081), still before any write and outside any lock;
  - reading upstream `.bin` files;
  - the OPFS switch's messages, and its behaviour except J8;
  - the restore's confirmations, cold-storage checks and id repair.

## 4. Tests

Reproducers are written against the current tree and must fail first, on their behavioural assertion.

**Harness:**
- CHORE-39's `FakeLockManagerCore` (private to `autoStorage.opfsMigration.test.ts`) moves to a shared test helper that both suites import. It needs an injectable or fake-timer timeout, and `query()` only if the implementation uses it.
- The restore tests follow `backuplocalRestoreRace.svelte.test.ts`'s real-module pattern, with one `createStorageTabLocks` instance per simulated tab.

**Tests:**
- **J1 (RED):** a second tab holds presence; nothing is written and the refusal is shown.
- **J2 (RED):** no lock manager on a web build. Cancel writes nothing; continue restores. Tauri skips (guard).
- **J3 (RED):** while a granted restore is mid-way, a new tab's presence stays ungranted, then is granted after release.
- **J4:**
  - guard: the granted path completes and does not hang. A second-`dbWriteLock`-acquire mutant must time out.
  - RED: success calls `markAppInitiatedReload()` before navigating, and shows no "Success" alert.
  - guards: item E's two race tests still pass.
- **J5 (guard, mutation-checked):** after a cancelled cold-storage prompt, a mid-stream marker, a decode throw and a failed write:
  - a later `dbWriteLock` acquirer proceeds;
  - a later tab boots;
  - this page takes the exclusive lock again (this catches a double release).
- **J6 (RED):**
  - a rejecting write shows one error, leaves no unhandled rejection (use a plain rejecting function, not `vi.fn()`), and leaves the in-memory database unchanged;
  - Tauri's `relaunch()` rejecting shows the "saved, restart" message.
- **J8 (RED): the reviewer's two lost-race scenarios**, asserted at the contract level. Only one tab can be the real `globalApi` graph in a Vitest worker, so tab B is a bare `createStorageTabLocks` instance with a simulated save loop: a pending `dbWriteLock` acquirer holding stale bytes. Reloads are observed through the injected seam.
  - B times out behind A: B reloads, B's pending acquirer never proceeds, and nothing is written after A's operation.
  - A is granted after B's completed OPFS switch: A reloads before writing anything.
  - An OPFS-switch-only variant.
  - A tab that loaded while another tab held the exclusive lock does not reload (guard).
  - Mutants that must fail: "the lock without the epoch check", "record again on re-acquire", "release `dbWriteLock` before the reload".
- **CHORE-39's O5 boot-copy tests** in `autoStorage.opfsMigration.test.ts` stay unedited, as guards; the only edit to that file is moving `FakeLockManagerCore` out. The shared helper's file name does not end in `.test.ts`.
- **J7:**
  - the encrypted-backup refusal takes no lock and writes nothing;
  - `backuplocalEncryptedRefusal.test.ts` and `backuplocalIdRepair.test.ts` get exactly one edit each: a granted mock of the lock export.
  - The code must not treat a missing export as "unsupported", which would route silently to J2.

## 5. Risks

- **A long restore holds the exclusive lock** for its whole run, and a new tab waits at boot meanwhile. This is intended (J3).
- **An unhandled exit that keeps the lock** blocks this page's saves and other tabs' boots until reload. J5's tests exist for that.
- **Report 31 §5's premise was false:** a failed navigation was not rare, since every web restore hit the leave-site prompt. J4 removes that case. A legacy plugin can still cancel the reload with its own `beforeunload` listener, through the unrestricted `window.addEventListener` proxy (`reloadGuard.ts` notes this). In that case the page keeps its hold until it is closed, and the saved restore loads on the next start.
- **J2 depends on the user closing the other tabs.** This is accepted under MC-093's "at least warn".
- **J8 reloads a tab that lost a race.** Any unsaved edit in that tab is lost, but it would have overwritten newer data anyway. The reload is the safe outcome.

## 6. Review

- **Gate 1:** passed (rows 243, 246, 247).
- **Gate 2:** `opus-reviewer`.
- **Live check:** a production build served statically in Chrome:
  - two tabs: the restore is refused;
  - one tab: the restore succeeds, with no "Leave site?" prompt;
  - a cancelled cold-storage prompt leaves the tab able to save;
  - a plain-HTTP LAN origin shows the warning;
  - the app opened at `/#` still reloads after a restore.

## 7. Gate 1 round 1 findings → rev 2

| Finding | Change |
|---|---|
| 1 (MAJOR, the lost race) | The storage epoch and J8, with both scenarios as reproducers, and a wait message. |
| 2 (MAJOR, the cancellable reload) | `markAppInitiatedReload()`, a reload that always happens, no "Success" alert, J4. Fixes `237ebba1`. Report 31 §5's premise is noted in §5 above. |
| 3 (release twice) | J5: exactly once, and the page takes the lock again afterwards. |
| 4 (failure state) | The database is installed only after the write. One message per failure. The Tauri relaunch message. The message is shown before the release is awaited. |
| 5 (the test plan) | J7's single mock edit and its no-fallback rule; J3 relabelled as a reproducer; the fake extracted to a shared helper; the new tests. |
| 6 (Tauri) | Tauri skips the check (J2). |
| 7, 8, 9 (editorial) | §1 rewritten: Node 409 for keys already read or written, and when an idle B stops being safe. J2's rationale is scoped to static builds and old browsers, with MC-002. |
| 10 (editorial) | The contract's callers, the four test mocks and the `autoStorage.ts` comment are listed. |
| S1 | Recorded as not in scope. |

## 8. Gate 1 round 2 findings → rev 3

| Finding | Change |
|---|---|
| 1 (J8 against the boot copy) | A page records the epoch once `Init` settles. A boot-copy loser keeps CHORE-39's re-read and does not reload. The O5 tests stay unedited as guards. |
| 2 (re-record trap, release order) | Record once, never on re-acquire. On a mismatch, reload without releasing `dbWriteLock` (or the exclusive lock on the grant path). J8's tests assert the pending acquirer never proceeds. Three named mutants. |
| 3 (how J8 is tested) | Contract level, with B as a bare lock instance plus a simulated save loop. An injectable reload seam and epoch store. A test for no spurious reload. |
| 4 (editorial) | J1, J3 and J6 reworded; the plugin `beforeunload` case in §5; section numbering fixed. |
| S2 | A random token rather than a counter; the shared cross-process visibility assumption is recorded. |
