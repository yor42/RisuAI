# Removal stage — Google Drive backup, dead code, `risuaiAccountCached`, the Patreon list

**STATUS:** done. Committed 2026-09-27 as `2af8d4fe`, `a9c29ba7` and `237ebba1`; Gate 2 round 3
[APPROVE] (row 239); live check row 240; commit messages row 241; records `e8500372`. Plan rev 3.2,
2026-09-27.
- **Gate 1 passed:** round 4 [APPROVE], ledger row 236.
- **Implemented.**
- **Gate 2 round 1 (`opus-reviewer`, ledger row 237): [REJECT].** Two MAJOR findings, both
  confirmed by the Orchestrator:
  - the restore-race test does not cover a save cycle that asks for the lock after the restore
    has written;
  - the cleanup runs only on the non-Tauri boot branch, contrary to I5.
- Rev 3.2 amends I5 and the tests; section 9 maps each finding to its change.
- **Gate 2 round 2: [REJECT]** (row 238): one guard was left aimed at the old call site.
- **Gate 2 round 3: [APPROVE]** (row 239). Every mutant in the final list is killed.
- **Live check passed** (row 240).
- **Committed 2026-09-27:** `2af8d4fe` (B, plus the Communities page, `MC-093`), `a9c29ba7` (D) and
  `237ebba1` (A, C and E together, since they share `bootstrap.ts`, `globalApi.svelte.ts` and the
  tests, and E's lock rationale assumes Drive is gone). The commit messages had an [EDITORIAL]
  check (ledger row 241).
- **Observation:** `Communities.svelte` has had no menu entry since upstream `3d2d07fe` repointed it to the supporter page, so the
  page is unreachable, like `GithubStars.svelte` was. It is not removed here.
- Rev 2 passed Gate 1 round 2 ([APPROVE], ledger row 234).
- Rev 3 added item E. The same reviewer rejected it (round 3, row 235) for two plan gaps:
  - two existing tests would crash on a missing mock export;
  - an undisclosed trade-off.
- Rev 3.1 answers both.

**Gate 1 round 1 (`adversarial-reviewer`, ledger row 233): [REJECT].** Three findings, each
verified by the Orchestrator against source; rev 2 answers them (section 8). The reviewer
confirmed the MC-092 readings, both MC-091 amendments, the `dropInstance` semantics and the key
counts.

**Decisions:** MC-092 (this stage, and each of its four removals), MC-080 (RisuAccount dropped;
its "keep Google Drive backup" is superseded by MC-092; Realm and `/hub-proxy` stay), MC-081
(encrypted account `.bin` refusal, which lives in `backuplocal.ts`/`backupContainer.ts` and
stays), MC-011 (upstream data keeps working; no fork userbase), MC-089, MC-091 (scope
amendments).

**Evidence:** `investigator` packet (2026-09-27, ledger row 232), and the Orchestrator's own
checks against HEAD `b7b1fd00`: `risu_lastsaved` and `BackupDb` are referenced only in
`drive.ts`; `GithubStars` has no importer; `oauth_login` has no caller in `src/`; the agreement
prompt's strings (`en.ts`, `upstreamAgreementPrompt*`) name no service; no `src/` file loads any
`src/etc/docs/*.cbs`; `SettingsMenuIndex` 77 is used only in `Settings.svelte`.

## 1. Scope

**A. Google Drive backup (CHORE-36), web and Tauri, entirely.**
- Delete `src/ts/drive/drive.ts` and `src/ts/drive/tests/driveUpstreamConsent.test.ts`.
- `UserSettings.svelte`: the Drive Save/Load buttons and their import. Every local-backup
  control stays.
- `bootstrap.ts`: the `checkDriverInit()` step (the `?code=`/`?state=` OAuth handling and its
  "Checking Drive Sync..." status) and its import.
- `globalApi.svelte.ts`: the `syncDrive()` call at the start of `saveDb()` and the import. `syncDrive()`
  only clones the whole database into `BackupDb`, which nothing reads.
- Lang keys, all seven languages: `savebackup`, `loadbackup`, `pasteAuthCode`, `loadLatest`,
  `loadOthers` (used only by Drive), and `googleDriveInfo`, `googleDriveConnection`,
  `googleDriveConnected` (already unreferenced). 8 keys, 56 entries.
- Test mocks: the 11 test files that mock `src/ts/drive/drive` only to satisfy the import graph
  drop that mock. Two of them use the `checkDriverInit` mock as an observable, not only a stub:
  `bootstrap.opfsSwitchNotice.svelte.test.ts` asserts it was called as proof that boot went on
  past the notice, and `bootstrap.staleAccountProfile.svelte.test.ts` asserts it was not called
  as proof that boot stopped. Each such assertion is replaced by an equally strong observable
  of the same boot position (for example the service-worker step or `loadedStore`), never simply
  deleted.
- **Comments that describe Drive as live** are rewritten, not left dangling (AGENTS.md section
  4). At HEAD they are in:
  - `bootstrap.ts` (the stale-profile branch's "never reaches checkDriverInit");
  - `globalApi.svelte.ts`:
    - the `AsyncMutex`/`dbWriteLock` rationale, built on `loadDrive()` as the other writer. After
      this stage, the other holder is the exclusive storage-migration lock (`storageTabLocks.ts`:
      `enableOpfs`, `disableOpfs`, the boot copy), and the "left unreleased before a reload" case
      is its reloading callers;
    - the storage-tab-locks instance comment;
    - the save loop's write-lock comment;
    - the `getUncleanables`/`buildAssetKeepSet` comments;
  - `upstreamAgreement.ts` (the list of fresh reads that never publish);
  - `storageTabLocks.ts` (the single-instance rule's "`saveDb()` and `loadDrive()`");
  - `storageMaintenance.ts` (the "same reasoning as loadDrive()" comment);
  - test headers and comments: `globalApi.storageTabLocksIdentity`,
    `bootstrap.upstreamAgreement`, `bootstrap.opfsSwitchNotice`, `bootstrap.staleAccountProfile`,
    `process/tests/coldStorageDeletionGuards`.

  Before Gate 2, `rg -n "loadDrive|backupDrive|checkDriver|syncDrive|drive.ts|drive/drive|Google
  Drive|BackupDb|risu_lastsaved" src` returns only the new CHORE-38 cleanup and its tests. The
  implementer also reads every comment in the diff for a mechanism that no longer exists.
- **`getUncleanables()` is removed.** Its only production caller is `loadDrive()`, and so is the
  coldStorageDeletionGuards test that pins it "for drive.ts" (a10). `getUncleanablesSync` and
  `buildAssetKeepSet` stay unchanged.
  - `resolveUncleanableChars` keeps its `swallowErrors` option even though its `false` value loses
    its only caller. It sits in the asset sweep's keep-set path, and simplifying it would reopen
    that path's review for no behaviour change.
  - This is recorded as an observation, not fixed here.
- Docs: `AGENTS.md`'s `drive/` row (becomes local backup only), `plugins.md` and
  `src/ts/plugins/migrationGuide.md`, which has it in two places (drop "or a Google Drive
  backup").
- **Kept:** `backupContainer.ts`, `backuplocal.ts` and their tests. The folder keeps its name
  `src/ts/drive/`; renaming it would touch every importer for no behaviour change.
- **Not changed:** the upstream-agreement prompt. Its strings already say "a service operated by
  upstream RisuAI" without naming one, so MC-092's "its wording follows" needs no edit once
  Drive's call site is gone. The six other `askUpstreamAgreement()` call sites and `upstreamAgreement.ts` are untouched.
- Nothing Drive-specific exists in `tauri.conf.json` (`csp: null`), the capabilities, the Rust
  code or the servers.

**B. CHORE-37 dead code.**
- `src/LiteMain.svelte` and `src/lib/LiteUI/LiteCardIcon.svelte` (its only importer is
  `LiteMain`).
- `src/etc/docs/docs_text.cbs`.
- The Tauri `oauth_login` command (`main.rs`: `get_oauth_client`, `oauth_login`, its
  `invoke_handler` entry, and any imports only they use) and the `oauth2` crate (`Cargo.toml`,
  `Cargo.lock`). It is a stub with placeholder URLs and credentials. Drive on Tauri never used
  it.
- **Amendment (MC-091, shared cause with the Patreon decision; also CHORE-24):**
  `src/lib/Others/GithubStars.svelte` is
  deleted whole. It has no importer at HEAD, and its one content item this stage cares about is
  a Patreon button (D).
- `AGENTS.md`'s `LiteUI/` row goes.
- **Not in scope:** the other three `src/etc/docs/*.cbs` files are also loaded by nothing, but
  no ticket names them. Recorded as an observation.

**C. CHORE-38 — clear `risuaiAccountCached`, no recovery.**
- The code that created this LocalForage instance was deleted with `accountStorage.ts` in
  CHORE-33 (`87b974e5`). What remains is only browser-side storage on profiles that used account
  sync. Clearing it is new code.
- **Amendment (shared cause, MC-091):** `localStorage['risu_lastsaved']`, Drive's own
  timestamp, becomes the same kind of orphan once A lands and is removed in the same step.

**E. Amendment (MC-091, shared cause): serialize the local-backup restore write with the save
loop.**
- Drive's `loadDrive()` restore is the only restore that takes `dbWriteLock` before writing
  `database/database.bin`. It deliberately keeps holding the lock on success, so no autosave from
  the stale page can land after it. `LoadLocalBackup()` (`backuplocal.ts`) writes the same key
  with no lock.
- The race: a save cycle that encoded the pre-restore database can take the lock and write
  after the restore's write. The reload then loads the old database, and the user has seen
  "Success".
- With Drive gone, local `.bin` restore is the only restore and the migration path from upstream
  (MC-011).
- Section 1 A rewrites the `dbWriteLock` rationale either way. Leaving the lock's only restore
  path unlocked would make that rationale describe a guarantee no restore has.
- The change: `LoadLocalBackup()`'s restore write holds `dbWriteLock` the way `loadDrive()`
  did:
  - acquired before the write;
  - never released once the write succeeds, since a reload or relaunch follows;
  - released if the write fails.
- Found by the Gate 1 round 2 reviewer as a pre-existing observation; confirmed by the
  Orchestrator in source (`backuplocal.ts`'s restore branch; the save loop encodes before it
  acquires the lock).
- **Not in scope: other tabs.** Another open tab keeps its own save loop and can write its
  pre-restore database after the restore. Closing that gap needs the cross-tab lock or a
  refusal while other tabs are open, which is a product choice. It is filed as CHORE-42.

**D. The Patreon list.**
- Delete `src/lib/Setting/Pages/ThanksPage.svelte` (all of it is Patreon: it fetches
  `sv.risuai.xyz/patreon/list` on mount and links to patreon.com).
- `Settings.svelte`: the menu entry (index 77), its page branch and the import.
- `Communities.svelte`: the "Support Project" (patreon.com) button. GitHub and Discord stay.
- Lang keys: `supporterThanks`, `supporterThanksDesc`, and `donatorPatreonDesc` (already
  unreferenced). 3 keys, 21 entries.
- **Orchestrator's reading of MC-092:** "remove the Patreon list" covers every Patreon link, not
  only the supporter list, because the stated reason ("I do not wish to take a donation") applies
  to each. With `GithubStars.svelte` deleted under B, `Communities.svelte` holds the only other
  one.

## 2. Invariants

- **I1. Local backup is unchanged.** Save, partial save, load, internal backup, cold-storage
  cleanup and the encrypted-account refusal (MC-081) behave exactly as at HEAD. Their tests pass
  unedited.
- **I2. Realm's agreement gate is unchanged**, with its prompt text. No boot path reaches an
  upstream host before acceptance.
- **I3. A URL carrying `?code=` and `?state=` boots normally** and contacts no upstream host,
  whether or not the agreement was accepted. It is no longer treated as a Drive callback.
- **I4. The save loop writes exactly what it wrote before;** only the unread clone is gone.
- **I5. After a boot, the LocalForage instance named `risuaiAccountCached` no longer exists** on
  every build that has LocalForage (web, Node-server, Tauri webview).
  - `localStorage['risu_lastsaved']` is absent.
  - `localStorage['backup']` is absent when its value is `save` or `load`. Only the removed
    Drive buttons wrote those values, and nothing reads the key. A different value is left
    alone, because the key name is generic (amendment, rev 3.2).
  - The cleanup runs on the Tauri and the non-Tauri boot branch alike. The `dosync` and
    `fallbackRisuToken` removals stay where they are, on the non-Tauri branch only.
  - The cleanup creates no other store, such as LocalForage's default `localforage` database.
  - No other LocalForage instance or IndexedDB database is cleared or dropped, and no other
    localStorage key is removed.
  - Boot never fails and never waits on this cleanup. A cleanup that rejects, or never
    settles (an IndexedDB delete blocked by another open connection), leaves boot unaffected.
  - Running it on a profile that never had the instance is harmless, and so is running it on
    every boot.
  - It need not run on the stale-profile path, which reloads; the next boot takes the ordinary
    path and runs it. The stale-profile path clears or drops no other store.
- **I10. A local-backup restore is the last write of `database/database.bin` from its page.**
  A save cycle that encoded the pre-restore database, whether it is waiting for the lock or has
  not yet asked for it, never lands after the restore's write. If the restore's write fails, the
  lock is released and saving carries on. Every other restore behaviour (the confirmations,
  cold-storage checks, id repair, the encrypted-account refusal) is unchanged.
- **I6. Upstream saves load unchanged.** No `Database` field is Drive- or Patreon-specific; an
  upstream `.bin` or database is read exactly as at HEAD.
- **I7. Settings:** no Drive buttons, no supporter page and no Patreon link anywhere. Every
  other settings page opens from the same menu entry as before.
- **I8. Builds:** `pnpm check` is clean; `pnpm run build` passes; `cargo check` passes in
  `src-tauri` after the Rust removal. No `invoke` of a removed command exists.
- **I9. Lang files:** exactly the 11 keys above removed from all seven languages; nothing else
  changes; CRLF preserved.

## 3. Mechanism notes (non-normative)

- C: a best-effort `localforage.dropInstance({ name: 'risuaiAccountCached' })`, not awaited on the
  boot path, with its rejection caught, placed beside the existing stale-sync-flag cleanup in
  `bootstrap.ts` (the `dosync` / `fallbackRisuToken` removals). The implementer confirms how
  LocalForage 1.10's `dropInstance` behaves for a database that does not exist, and whether it
  creates one before deleting it. It also confirms that upstream's instance used the default
  driver config: the name alone must identify it.

## 4. Tests

Red first against HEAD where marked. Each red run must fail on the behavioural assertion, not on
an import or a missing export.
- **C, reproducer (RED):** `bootstrap.staleAccountProfile.svelte.test.ts`'s
  `assertLocalforageUntouched()` is called only by its two stale-profile scenarios.
  - Those keep asserting that nothing is cleared or dropped, the drop included, since the
    stale-profile path returns before the cleanup (I5).
  - Only the helper's "none is ever named `risuaiAccountCached`" line pins the opposite of the
    decision (a store merely created under that name is not a problem). It goes, recorded as a
    decided reversal of a guard (MC-092) in the commit message.
  - A **new, separate** ordinary-boot scenario asserts that `risuaiAccountCached` is dropped
    exactly once and that no other instance is cleared or dropped.
- **C, reproducer (RED):** `risu_lastsaved` is removed at boot, and no other localStorage key is
  removed beyond those the file already expects.
- **C, guard:** a drop that rejects, and one that never settles, still lets boot reach the loaded
  state.
- **A, reproducer (RED):** in `bootstrap.upstreamAgreement.svelte.test.ts`, a `?code=&state=`
  URL with the agreement accepted makes no request to an upstream host and boots normally. At
  HEAD it exchanges the code with the hub. The file's Drive scenarios are removed; its `?realm=`
  scenarios stay unedited (I2).
- **D, reproducer (RED):** `Communities.svelte.test.ts` gains "offers no Patreon link". The
  existing Discord pin stays.
- **E, reproducer (RED):** a save cycle holding a pre-restore payload races a local restore.
  After both settle, the last `database/database.bin` write is the restored payload. At HEAD the
  old payload lands last.
  - It goes in a new file that loads the real `globalApi.svelte.ts` and the real `backuplocal.ts`,
    so both share the real `dbWriteLock`. This follows
    `globalApi.storageTabLocksIdentity.svelte.test.ts`'s real-module pattern, with controllable
    storage I/O to force the ordering.
  - The existing `backuplocal*.test.ts` harnesses mock `globalApi.svelte` away, lock included,
    so they cannot carry this test.
- **E, collateral:** `backuplocalEncryptedRefusal.test.ts` and `backuplocalIdRepair.test.ts`
  reach the restore write through a `globalApi.svelte` mock with no `dbWriteLock`. Each mock
  gains a `dbWriteLock` stub whose `acquire()` resolves to a release function, so those tests keep
  asserting what they assert today instead of crashing on the missing export.
- **E, guard:** when the restore's write rejects, a later save cycle still writes (the lock was
  released).
- **Deleted:** `driveUpstreamConsent.test.ts`, which pins only the removed module.
- No source-text guards.

## 5. Risks

- **E keeps the lock after a successful restore write, as `loadDrive()` did.** On Tauri the
  restore awaits `relaunch()`; on the web it sets `location.search`. If that relaunch or
  navigation fails after the write, saving on that page stays blocked until the user reloads.
  - This is the accepted trade-off: no stale autosave can land over the restored database.
  - The restored data is already on disk, and the next start loads it.

- **The drop is a data deletion.** The only protection against dropping the wrong store is the
  exact name; I5's "no other instance" test is what enforces it.
- **The upstream-agreement test is a consent-gate regression test.** Narrowing it must not
  weaken the `?realm=` scenarios. Gate 2 compares them with HEAD.
- **Rust:** removing `oauth2` changes `Cargo.lock`. `cargo check` shows whether any other code
  used a type it re-exported.

## 6. Review and verification

- Gate 1: `adversarial-reviewer` on this plan.
- Gate 2: `opus-reviewer`, because the stage touches the save loop and bootstrap and deletes
  stored data.
- Full suite, `pnpm check`, `pnpm run build` and `cargo check` on the final snapshot
  (Orchestrator).
- Live check on a production build (Node server, per Live-State):
  - seed an IndexedDB database `risuaiAccountCached` plus `risu_lastsaved`, reload, and confirm
    both are gone while every other store is intact;
  - no Drive buttons in Backup & Files;
  - no supporter page in Settings;
  - no Patreon link in Communities.
- Commits: one per item (A, B, C, D, E), after Gate 2.

## 9. Gate 2 round 1 findings → rev 3.2

- **F1 (MAJOR), the race test's coverage:**
  - Add a regression reproducer: the restore writes first, then a save cycle carrying
    pre-restore bytes asks for the lock. It must never land. It fails against HEAD's
    `backuplocal.ts` and against an always-release mutant.
  - Narrow the existing test's title to the case it covers.
  - Give each test in that file a fresh module instance, so no test depends on another's held
    lock.
- **F2 (MAJOR), Tauri:**
  - The cleanup moves to a point both boot branches reach on the non-stale path; the
    stale-profile return still skips it.
  - `bootstrap.tauriStaleAccountPin.test.ts` gains a `dropInstance` mock and a Tauri assertion:
    - the drop happens exactly once;
    - `risu_lastsaved` is removed;
    - `accountst`, `dosync` and `fallbackRisuToken` are untouched.
- **F3, F4 (EDITORIAL):**
  - `backuplocal.ts`'s "still holding the pre-restore in-memory database" becomes in-flight save
    cycles' bytes;
  - `assetIntegrity.ts`'s dangling `getUncleanables()` reference goes.
- **F5 (MINOR):** the rejecting-drop guard also asserts that no rejection goes unhandled.
- **F6 (MINOR):** the drop must not create LocalForage's default database (I5, rev 3.2).
  `localforage.dropInstance` initialises the default instance first;
  `createInstance({ name }).dropInstance()` does not.
- **F7 (optional), all three taken:**
  - `public/icon/github-mark-white.svg` (only `GithubStars.svelte` used it) is deleted under B;
  - `localStorage['backup']` is cleared under the value guard (I5);
  - `upstreamAgreement.ts`'s "Plenty of other fresh reads" is reworded.

## 7. Hand-off: wiki pages that go stale (not edited here)

- `wiki/Migrating-from-upstream.md`: Drive named as a kept upstream service; the
  `risuaiAccountCached` section says the fork never touches it.
- `wiki/RisuAI-Basics.md`: Drive in the agreement-gate description; the "Local and Drive backups"
  row.
- `wiki/Settings.md`: the Patreon list/buttons; the Communities row naming Patreon.
- `wiki/Settings-Account-and-Files.md`: the "Save Backup"/"Load Backup" description is the Drive
  flow under generic names.

## 8. Gate 1 round 1 findings → rev 2

- **F1 (stale comments):** section 1 A now names every comment that describes Drive as live,
  gives the `dbWriteLock` rationale its new subject, and adds the pre-Gate-2 sweep.
- **F2 (`getUncleanables`):** removed with its a10 test; `resolveUncleanableChars`'s option is
  recorded, not simplified.
- **F3 (the stale-profile test):** section 4 separates the new ordinary-boot drop assertion from
  the two stale-profile scenarios, which keep asserting no drop.
- Also from the review: the replaced `checkDriverInit` observables, the six (not five) other
  agreement call sites, the amendment label, and `migrationGuide.md`'s two places.
