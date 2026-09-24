# RisuAccount removal: scope, migration facts and staging strategy

**STATUS:** open

**Status:** strategy, 2026-09-25. Scope and the migration-refusal decision are
maintainer-decided (`MC-080`, `MC-081`). No stage is planned yet; the removal gets its own
plan and gates (`opus-reviewer`, since it touches save/persistence and the storage backend
selection).

**Evidence:** ledger row 173 (blast-radius map: six `investigator` lenses on this repo plus
HaejeokRisuai, each verified by `deep-investigator`, then a completeness critic with gap
investigations), row 174 (PocketRisu and PocketRisu-Kei, verified, three-fork comparison), row
175 (`senior-advisor`, escalated scope/migration/timing question, with two Orchestrator
corrections). `Agents/Maintainer-Context.md`: MC-002, MC-011, MC-012, MC-025, MC-026, MC-074,
MC-079, MC-080, MC-081.

**Citation note.** `src/ts/drive/backuplocal.ts`, `src/ts/storage/database.svelte.ts` and
`src/ts/setting/advancedSettingsData.ts` are unmodified in the working tree, so their line
numbers match HEAD. `src/ts/bootstrap.ts`, `src/ts/characterCards.ts`,
`src/ts/globalApi.svelte.ts`, `src/ts/kei/backup.ts`, `src/ts/process/coldstorage.svelte.ts`,
`src/ts/drive/accounter.ts`, `src/ts/plugins/apiV3/v3.svelte.ts` and
`src/ts/plugins/plugins.svelte.ts` carry uncommitted W0 changes; line numbers cited in them
below are to the working tree, with uncommitted W0 changes, and can differ from HEAD by about
one (confirmed for `v3.svelte.ts`: cited at 1285 in the working tree against 1271 at HEAD,
identical content, per ledger row 173's C9 correction). `plugins.md` is separately modified,
uncommitted, by an unrelated session, so no line number is cited for it below.

---

## 1. The decision

**MC-080** (2026-09-24): RisuAccount sync is dropped from this fork. A user migrating from
upstream, including an account-sync user, keeps their data by making a `.bin` local backup
upstream and importing it here. That import path must keep working (`MC-011`).

**Scope, decided 2026-09-25.** The maintainer chose the option `senior-advisor` recommended
(ledger row 175): **Option B, remove all of RisuAccount, keep Realm on its own footing.**

- **Removed:** the hub sign-in and everything that uses its token — account sync, account data
  save and load, account backup restore, account cold storage, Kei auto-backup (already
  unreachable from the UI), in-app edit and remove of the user's own Realm uploads, and the Kei
  image-generation provider. Upstream data naming the Kei provider shows a clear
  unsupported-provider error instead of silently doing nothing.
- **Kept:** Realm browse, info, download, report and anonymous upload; Google Drive backup (its
  token exchange goes through the hub but needs no sign-in); the self-hosted server's
  `/hub-proxy`.
- **Rejected:** keeping the hub sign-in only for Realm ownership (Option C); removing only the
  sync backend (Option A) — none of the three reference forks stopped there, and it keeps two
  code paths that re-create `db.account` from `localStorage`.

**MC-081** (2026-09-25): an account-sync-encrypted `.bin` backup is not supported. This is one
narrow exception to MC-011. The import tells the user upfront, before anything is written, that
the file cannot be read, and names two things the user can do upstream instead (section 6).
Every other upstream `.bin` stays supported, including an unencrypted one from an account-sync
user.

**Timing: deferred.** The maintainer said "decide later." The one hard constraint is that the
removal cannot start before W0 is committed, because it shares six files with W0:
`bootstrap.ts`, `characterCards.ts`, `globalApi.svelte.ts`, `kei/backup.ts`,
`drive/accounter.ts` and `coldstorage.svelte.ts`. W0 added a `repairDatabaseIds` call to
`loadRisuAccountBackup` (`drive/accounter.ts`) and to `autoServerBackup` (`kei/backup.ts`); both
functions are deleted under Option B, and that call goes with them.

`senior-advisor` recommends: W0, CHORE-28, the multiuser removal (`MC-074`), the account
removal, then W1, the composer stage, W2 and W3. MC-080 records an acceptable alternative
(both removals after W1) and one thing to avoid (placing either removal after W2). The two
removals stay separate stages; multiuser goes first because it is smaller and carries no
migration obligation.

## 2. The problem and the root cause

**RisuAccount is one credential, from one source, read by four unrelated things.**

`db.account.token` has exactly one source: the hub login `postMessage` handler in
`UserSettings.svelte` and the login modal in `AlertComp.svelte`. Four unrelated things consume
it:

1. the storage backend (`AccountStorage`, gated by `forageStorage.isAccount` /
   `db.account.useSync`);
2. the hub's per-account services: account data save/load, backup restore, cold storage, and Kei
   backup and image generation;
3. Realm ownership: upload attribution, editing an earlier upload, and removing it — against a
   different host (`realm.risuai.net`) than the sync backend;
4. hub-side Drive-token roaming (Drive's OAuth tokens live in `db.account.data`, independent of
   the sync backend).

A second, smaller Drive coupling sits inside the sync backend rather than the token: `loadDrive`'s
`checkImageExists` reads `db?.account?.useSync` as a shortcut for skipping images that already
exist (`drive/drive.ts:218`; Orchestrator correction, ledger row 175). The removal edits this one
line; Drive's backup and restore themselves are unaffected.

**"Sync only" is not a smaller removal — it is a different end state.** It keeps the
credential's only source alive, keeps two code paths that re-create `db.account` from
`localStorage` (`AccountStorage.checkAuth`, and the `kei` Stable Diffusion provider writing it
back from the `fallbackRisuToken` key), and leaves the hub-service consumers reachable but
pointless.

**The migration artifact is made by upstream's code, on upstream's origin.** The fork controls
only the import side and the documentation. Under MC-081, the import side's job changes from
"decrypt" to "refuse before writing." The current importer writes each entry as it streams, so
it cannot know a file carries the account marker until the second-to-last entry (section 3).

## 3. Migration facts

- **Encryption applies on upstream's hosted origin only.** Since upstream commit `d0548267`
  (2026-06-11), `SaveLocalBackup`'s encrypt branch is gated on
  `forageStorage.isAccount && location.origin.endsWith('risuai.xyz')` (`backuplocal.ts`, TRACED).
  An account-sync user on a self-hosted upstream server, or logged out, produces a plaintext
  `.bin`.
- **The writer order puts the marker after the data.** `backuplocal.ts` writes assets
  (`:101`/`:144`), then cold-storage payloads (`:158`), then the `encryption.risudat` marker
  (`:168`), then `database.risudat` (`:174`) — TRACED, verified by the Orchestrator against
  source. A forward-streaming import cannot know the file is marked until it has already
  written everything that came before the marker.
- **No assets by default.** `skipSavingAssetsOnWebSync ??= true` (`database.svelte.ts:712`),
  with its toggle hidden behind "show unrecommended settings"
  (`advancedSettingsData.ts:250-253`). With it set, `SaveLocalBackup`'s asset loop silently
  skips every `assets/`-prefixed key for an account-sync user (`backuplocal.ts:127-130`) —
  CONFIRMED, identical default in upstream.
- **Partial backup versus logging out first lose different things.**
  - A **Partial Local Backup** made while still logged in is plaintext. It keeps every chat,
    including cold-storage bodies (fetched from the hub). Its asset map
    (`backuplocal.ts`, about lines 233-287) keeps character, group and persona profile images,
    the user icon, the background (`customBackground`), and folder and bot preset images; it
    drops emotion images, additional assets, VITS files and CC assets. `SavePartialLocalBackup`
    neither honours `skipSavingAssetsOnWebSync` nor encrypts, but does collect cold bodies
    through the account branch of `getColdStorageItem` — TRACED.
  - **Logging out first** (`unMigrationAccount`) copies every referenced asset locally but never
    the cold-storage bodies — TRACED, identical to upstream. A Full backup taken afterward is
    plaintext, with all `.png` assets and no cold chats.
  - **The only complete route is both:** Partial while logged in, then log out, then Full, then
    import both files here. Cold entries written by one import persist through the other. This
    is read from source, not run.
- **Browser decryption needs a secure context.** The decrypt path uses `window.crypto.subtle`
  (`util.ts:413-433`); the pinned `lib.dom.d.ts` marks it "available only in secure contexts."
  Plain-HTTP self-hosting cannot decrypt in the browser. (This fact is now moot for the shipped
  decision, since MC-081 refuses rather than attempting decrypt — it stays relevant only if the
  decision is ever revisited.)
- **A malformed marker falls through today, inherited unchanged from upstream.** If the
  `encryption.risudat` entry is present but malformed, `decodeRisuSave` has no case matching
  ciphertext's magic bytes and falls through to `unpackr.decode(data)` with no format validation
  at all — TRACED, byte-identical to upstream, and no test covers it (this is the failure mode
  PocketRisu bricked instances on — section 9). A fuzz run (RUN) of msgpackr 1.10.1 with
  `risuSave.ts`'s own config (`{int64AsType:'number', useRecords:false}`) threw on all 20,000
  random inputs sized 1 KB to 1 MB; at 16 KB or smaller it occasionally returned a string or an
  object instead of throwing. If that first decode throws, `decodeRisuSave`'s own fallback calls
  `fflate.decompressSync` without its own try, so a throw there propagates straight out of the
  function. `LoadLocalBackup`'s only try/catch covers the synchronous file-picker setup, not the
  async callback where `decodeRisuSave` is awaited, so a throw becomes an unhandled promise
  rejection that the app's global `unhandledrejection` handler alerts, rather than an in-flow
  error message. **Invariant 1 closes this**: refusing on the marker's mere presence means
  `decodeRisuSave` is never reached on a malformed-marker file. MC-081's decided wording was
  widened accordingly, from the successfully-parsed `type: 'account'` case to any
  `encryption.risudat` entry regardless of content.
- **The importer writes before it reaches the marker.** Today, assets and cold-storage entries
  are written during the streaming loop, before the decrypt is even attempted at `:533`
  (TRACED). The existing abort message ("your current data has not been modified,"
  `backuplocal.ts:541-548`) is overstated for this reason — it is fork-local commentary, not an
  upstream claim. Under MC-081, "upfront" means nothing is written before the refusal: no asset,
  no cold-storage entry, no database. Because the marker comes after all the data entries in a
  flat, length-prefixed container, a check inside the forward-streaming loop cannot meet that
  bar. The importer must know the file's manifest before its first write — either by walking
  names and lengths first (a `File` supports random-access slicing) or by deferring every write
  until the manifest is known. This is non-normative on which shape to build; the invariant is
  the "before" (section 5, invariant 1).
- **Context, not a new invariant: the backup-creation asset loops can also throw.**
  `SaveLocalBackup` and `SavePartialLocalBackup`'s asset loops call `AccountStorage.getItem`
  unconditionally on the account branch; a non-2xx response throws, and neither function nor its
  `UserSettings.svelte` caller catches it, so the global `unhandledrejection` handler alerts
  instead of the backup failing cleanly (TRACED). Two things create per-user asset keys with no
  local bytes to throw on: `characterCards.ts`'s Lightning Realm Import and `processzip.ts`'s
  CharX `#processAssetQueue` skip path, both hub-only dedup shortcuts. The fork's own hardened
  303 branch (`AccountSyncCacheMismatchError`, a deliberate change from upstream's `return null`)
  is a second, independent way to hit the same throw. No fork user has been affected, since the
  fork has never shipped (`MC-011`), and the stage deletes both dedup shortcuts and the account
  branch of the asset loops outright.

## 4. What Option B removes and keeps

| Component | Disposition | Note |
|---|---|---|
| Hub login iframes, the `'login'` alert type | Removed | `UserSettings.svelte`, `AlertComp.svelte` |
| `sionyw.ts`, `drive/accounter.ts`, `storage/accountStorage.ts` | Removed | whole files |
| `src/lib/Others/SavePopupIcon.svelte` | Removed | always mounted (`App.svelte:259`); imports `AccountWarning` and branches on `savingStoppedReason === 'account-conflict'` — missed by the `\.account\b` grep alone (invariant 4) |
| Account branches in `autoStorage.ts`, `bootstrap.ts`, `globalApi.svelte.ts`, `risuSave.ts`, `coldstorage.svelte.ts`, `avatarThumb.ts`, `multiTabReload.ts`, `processzip.ts` | Removed | |
| `characterCards.ts`'s charx hub dedup and `lightningRealmImport` | Removed | hub asset pointers with no local bytes; cannot outlive the backend |
| Kei auto-backup (`kei/backup.ts`) and its server-URL setting | Removed | UI trigger commented out (`UserSettings.svelte:188`); still auto-invoked from `bootstrap.ts:222`'s account-sync corruption-recovery path, which goes with the removal |
| Realm remove, and the token-bearing "update my own upload" edit | Removed | both need the token |
| `kei` Stable Diffusion provider | Removed, replaced | explicit unsupported-provider error at generation time, on any upstream save naming it |
| `skipSavingAssetsOnWebSync`, `lightningRealmImport` settings | Removed | ignored on load if present in upstream data |
| Decrypt of an account-encrypted `.bin` (the `sv.risuai.xyz/cryptokey` fetch) | **Not kept** | MC-081 refuses instead of decrypting; the cryptokey call is not built |
| Detection of the `encryption.risudat` marker (`type: 'account'`) | Kept, repurposed | drives the refusal, not a decrypt attempt |
| Realm browse, info, download, report, anonymous upload | Kept | needs no account |
| Google Drive backup | Kept | token exchange via the hub, no sign-in required; `drive.ts:218`'s `useSync` read (an existing-image skip) is edited, not left as-is |
| `/hub-proxy` in `server.cjs` | Kept | also carries Realm traffic on Node builds |

Dead code the stage can also remove, in the same pass or a follow-up: the dormant Sionyw OAuth
branch in `server.cjs` (the `X-Node-Server-Auth` check is unreachable, since Node lowercases the
header it compares against a capitalised literal), and the unreachable `RealmUpload.svelte` (its
token-bearing call is preceded by a hardcoded `testMode = true` early return).

## 5. The nine invariants

1. **The refusal comes before every write.** For a `.bin` containing any entry named
   `encryption.risudat`, whatever its content, the importer writes nothing: no asset, no
   cold-storage entry, no database, no `localStorage` flag, no `DBState` change. Acceptance: a
   fixture in upstream's writer order (asset, cold entry, marker, database) is imported, and
   every storage-write spy records zero calls; the user sees the reason and the two upstream
   alternatives. **This scenario is red at HEAD** — it fails against today's importer, which
   writes assets and cold entries before it reaches the marker (section 3). This is the removal
   stage's red test.
2. **Without the marker, today's behaviour is kept exactly.** A plaintext upstream `.bin`
   imports as before, including one from an account-sync user on a self-hosted origin or after
   logout. Acceptance: the same fixture without the marker restores all three entries.
3. **The marker is never written anywhere**, not as an asset and not as a cold entry.
4. **No code reads `db.account` after the stage.** A live `database.bin` carried over by
   copying the folder still contains `account`, with `useSync` or `kei` set; the fork loads it,
   ignores the fields, and drops them on the next format update. The `\.account\b` grep alone
   misses a consumer with no `.account` property access: `SavePopupIcon.svelte` (always mounted,
   `App.svelte:259`) imports `AccountWarning` from `storage/accountStorage` and branches on the
   `'account-conflict'` value that `globalApi.svelte.ts`'s `AccountSyncConflictError` catch
   writes to `savingStoppedReason` (RUN, ledger row 173's resumed gap round). Acceptance: a grep
   for `\.account\b` in non-test, non-lang source is empty, **and** nothing imports
   `storage/accountStorage`, `sionyw` or `drive/accounter`.
5. **Upstream data that names a removed feature loads, and fails loudly.**
   `sdProvider: 'kei'` produces a visible unsupported-provider error at generation time. The
   `lightningRealmImport` and `skipSavingAssetsOnWebSync` fields are ignored.
6. **A profile whose `localStorage` still says account sync was on does not silently boot a
   stale local database.** Scenario: `accountst` is `able` and the fallback backend holds a
   frozen copy from before migration. The fork tells the user this profile's data lived on a
   RisuAccount, clears the flags, and points to the `.bin` route.
   - **No mechanism survives the removal to do this detection.** `AutoStorage.Init()`'s
     `accountst` branch and `checkAccountSync()` are exactly the code being deleted, and nothing
     else in the boot sequence reads `accountst` today (TRACED). The only in-app remediation that
     exists now, `unMigrationAccount` (the Logout button / "Save Data In Account" checkbox), is
     deleted along with the rest of the account UI, with no substitute built yet.
   - **`unMigrationAccount` has a pre-existing upstream bug**, found while tracing this
     invariant: it always migrates into a plain `localforage.createInstance({name:"risuai"})`
     instance, regardless of whether the user's platform is Node-server or OPFS-enabled — so on
     those two platforms, logging out today already writes to a backend `Init()` will not select
     on the next boot, stranding the just-migrated data (TRACED). This is removed along with the
     rest of `unMigrationAccount`, not fixed separately.
   - **Two open design choices for the stage plan:** which backend a detected profile should
     land on (always plain LocalForage, mirroring `unMigrationAccount`'s existing precedent, or
     whatever `Init()` would natively select for that platform); and whether the detection lives
     inside `Init()` itself (before any backend is chosen, but without UI/alert access) or in
     `bootstrap.ts` immediately after `Init()` returns (with alert access, one boot-frame later).
     Neither is decided here.
   - **The affected population is essentially empty**, because the fork has never shipped
     (`MC-011`) — this scenario needs a profile that already migrated to account sync on this
     fork before the removal ships.
7. **Realm and Drive keep working on every build.** Realm browse, info, download and anonymous
   upload on web, Tauri and Node, with `/hub-proxy` intact; Drive's token exchange intact.
   "Update on Realm" is either removed or builds its URL correctly — it must not ship malformed.
8. **The plugin runtime never reports `saveMethod === 'account'`**, and `plugins.md` is
   corrected in two places:
   - the values the `saveMethod` code actually returns (`tauri`, `account` today, `local` — not
     the `'indexeddb'`/`'filesystem'` values currently documented there);
   - the four passages claiming `pluginStorage` "syncs between/across devices" (TRACED). That is
     true today only because `pluginStorage` is cold-storage-backed for v3, and cold storage's
     only cross-device transport is the account cold-storage path (`/hub/account/coldstorage`)
     this stage removes. After removal, a `.bin` local backup or a Google Drive backup still
     carries `pluginStorage`'s data across devices, but both are manual, user-triggered actions —
     no automatic cross-device transport survives.
9. **Tests that pin removed behaviour are deleted or rewritten with it**, not kept green by
   fixtures. A reproducible count (RUN, `git grep`, run twice with identical results): 18 tracked
   test files reference account symbols, plus 5 untracked W0-stage files, for 23 total. Of these,
   1 (`drive/tests/accounterBackupReload.test.ts`) is wholly account-sync behaviour and is
   deleted outright. 6 are mixed: an unrelated-feature test file with one to four cases that pin
   a currently-live, `isAccount`-gated production branch outside the account module itself —
   those cases are deleted or rewritten for the surviving default, and the rest of the file is
   untouched. 16 are incidental: `isAccount`/`AccountStorage` appears only as an inert,
   never-toggled fixture default, and only the fixture needs updating. (Supersedes this report's
   earlier 16-of-20 estimate; see ledger row 173's resumed gap round.)

## 6. The migration message and wiki obligations

**The refusal message** (decided with MC-081) says the file cannot be read, then gives one line
each on the two things a user can do upstream instead:

- **A Partial Local Backup.** Not encrypted; keeps every chat, including cold-storage bodies. It
  keeps the labelled images: character, group and persona profile images, the user icon, the
  background, and folder and preset images. It drops everything else, including emotion images,
  additional assets and VITS files. (Corrected 2026-09-25 by this report's fact-check: the
  option text the maintainer chose said "loses all images except profile pictures," which
  undercounted what it keeps. The decision itself is unchanged; see `MC-081`.)
- **Logging out of account sync first, then a full backup.** Keeps the `.png` assets; loses the
  cold-storage chat bodies.

**The migration wiki page** gives the complete route: both backups, imported one after the
other. The page marks that route as read from the code and not tested — nobody on this project
has an account backup to test with. Only official-site (`risuai.xyz`) account users can hit the
refusal at all, since upstream encrypts only on that origin; self-hosted-upstream account users
are unaffected by the refusal, and to get images they must untick "Skip Saving Assets on Web
Sync" (hidden behind "show unrecommended settings") or log out first, same as any account user.

**Later UX items, not this stage:** showing the user what a plaintext file contains before
writing anything; an import option on the first-run screen (`WelcomeRisu.svelte` offers none
today).

**`wiki/Settings-Account-and-Files.md`** exists in a parallel documentation session that is on
hold. It documents the account UI (the Risu Account login/logout section, the "Save Data In
Account" checkbox, the Load Auto Server Backup label, and account-keyed visibility gates on the
corruption-check and OPFS sections) and is already wired into `wiki/_Sidebar.md` and
`wiki/Home.md`. It was written before MC-080 was recorded and will need revising once this stage
lands. This report does not edit it.

## 7. What removal unblocks

**The evidence corrects the framing here: these optimisations were fenced off the account path,
not blocked by it.** At least four already-shipped pieces of work — AV-4 avatar thumbnails, the
character-list avatar full-size-fetch optimisation (Report 12), CHORE-17's remote-block
skip-write optimisation, and `bootstrap.ts`'s asset-GC/cache-integrity sweep — each carry an
explicit `!forageStorage.isAccount` or `db.account?.useSync` exclusion. Every one of them
already shipped for all non-account users; the guard excluded account-sync users from it, it did
not prevent the work.

Removal deletes the duplicated branches this produced: `cleanChunks`' account early return, the
`getFileSrc` hub-CDN path, the thumbnail gate, the FilesSettings integrity-panel gate, the
encoder's `compression: forageStorage.isAccount`, the dbbackup-creation gate and its 3-second
sleep, and the account branch in `encodeRemoteBlock`. **MC-026's standing constraint on the
shared `SaveLocalBackup`** — "any change here must leave the `isAccount` branch's behaviour
alone, and must not assume a self-hosted deployment is automatically off that path" — goes away
because the branch itself is gone. MC-026's root concern (upstream's objection to community
plugins straining its asset-cache servers) still applies to whatever hub path survives, such as
Realm's own asset traffic; only the `isAccount` wording disappears.

Removal is **not** a precondition for MC-025's goal of a faster Tauri/local backup path — that
branch is already separable from the account branch — but it simplifies the shared function by
removing one axis of behaviour to preserve.

Separately: account-sync web users lack local dbbackup rotation by design (upstream substitutes
a hub-side "Auto Server Backup"). Removal turns former account-sync users into local users, who
get rotation like everyone else.

## 8. Timing

**Hard constraint:** the removal starts only after W0 is committed. It shares six files with W0
(`bootstrap.ts`, `characterCards.ts`, `globalApi.svelte.ts`, `kei/backup.ts`,
`drive/accounter.ts`, `coldstorage.svelte.ts`); W0's `repairDatabaseIds` calls in
`drive/accounter.ts` and `kei/backup.ts` are deleted along with the functions that hold them.

- **Recommended** (`senior-advisor`): W0 → CHORE-28 → the multiuser removal (`MC-074`) → the
  account removal → W1 → the composer stage → W2 → W3.
- **Acceptable alternative** (MC-080): both removals after W1.
- **To avoid:** placing either removal after W2.
- **Two stages, not one.** Multiuser goes first — it is smaller and carries no migration
  obligation.

The maintainer deferred picking among these; nothing below assumes a slot has been chosen.

## 9. Reference forks, as precedent

Three forks have already made this cut. Their code is not reused here — the ideas are.

- **PocketRisu** deleted RisuAccount as a side effect of collapsing the whole app onto one
  mandatory self-hosted Node+SQLite server, dropping Tauri and all client-only storage. That
  does not transfer cleanly: this fork keeps Tauri, OPFS and LocalForage as first-class
  backends. It kept Realm browse and download, which were already unauthenticated and
  server-proxied. Its migration path was `.bin` import only, with no attempt at the encrypted
  case: an account-encrypted `.bin` was imported as raw ciphertext and bricked the instance on
  next boot (an HTTP 500 from the deflate decoder), fixed reactively about three months later by
  rejecting the import on the marker rather than decrypting. Its reject guard still runs after
  assets and cold entries are already written — the same ordering hazard this fork's stage must
  close outright under invariant 1.
- **PocketRisu-Kei** inherited that removal, then chose the opposite path for the encrypted
  case: it decrypts server-side, calling the same `cryptokey` endpoint with no credentials. Its
  own removal was not atomic — it took at least four commits over about six months, and Kei's
  token dependency, plus the `account` field on the database type, outlived the first pass as
  stragglers. This is the sharpest available precedent for enumerating every `db.account`
  consumer in one pass rather than iteratively.
- **HaejeokRisuai** removed login, sync and account-backup restore in one commit, then, the same
  day, added a dedicated hardening commit keeping exactly one anonymous hub call: a decrypt path
  for legacy account-encrypted backups, with four regression tests. It replaced Kei image
  generation with an explicit unsupported-provider error — the pattern Option B copies for the
  `kei` provider. It kept Realm browse, download and upload, rehomed onto Realm's own
  authentication.

**No precedent stopped at "sync only."** All three went to full or near-full removal, matching
Option B's choice rather than the narrower Option A.

## 10. Next investigations before the stage plan, and the do-not list

**Next investigations:**

1. Enumerate first, with one batched `code-searcher` survey of every non-test match for:
   `\.account\b`, `isAccount`, `useSync`, `accountst`, `dosync`, `fallbackRisuToken`,
   `AccountStorage`, `AccountWarning`, `AccountSyncConflictError`, `account-conflict`,
   `fetchProtectedResource`; `hub/account`, `hub/backup`, `hub/login`,
   `hub/remove`, `keiServerURL`, `/kei`; `lightningRealmImport`, `CharXSkippableChecker`,
   `hashSignal`, `skipSavingAssetsOnWebSync`, `encryption.risudat`, `cryptokey`; `sionyw`,
   `alertLogin`, `loginSionyw`, and the `'login'` alert type. After the stage, all of these must
   be empty except the marker-name check.
2. Run the red test first: the four-entry fixture (asset, cold entry, marker, database) against
   today's `LoadLocalBackup`, with write spies.
3. Confirm the two upstream alternatives (Partial, log-out-first) by an actual run, if anyone
   obtains a RisuAccount to test with. Otherwise keep them documented as read from source, not
   run, with Partial listed first since it loses no chat.
4. Settle invariant 6's trigger with one concrete scenario: a profile with `accountst = able`
   and a stale local database in the fallback backend.
5. Check whether `realm.risuai.net`'s upload page offers its own sign-in. This is what settled
   Option B against Option C; the maintainer already chose B, so this is a confirmation to run
   before touching the Realm upload UI, not an open decision.
6. Compare W1's file list against the removal's file list before fixing the final stage order.

**Do not:**

- Keep `isAccount` as a constant-false shim.
- Remove only `Init()`'s account branch — `checkAccountSync()` installs `AccountStorage` at
  runtime independently of it, and `bootstrap.ts` calls it twice.
- Search-and-delete "account" or "risuai.xyz." The marker-name check, `hubURL`, `/hub-proxy` and
  `/drive/token` must survive.
- Implement the refusal as a check after the stream.
- Keep the anonymous `/cryptokey` fetch, a server-side decrypt, or the malformed-marker
  fall-through.
- Tell users "log out first" as the only alternative.
- Fold the multiuser and account removals into one stage, or place either after W2.
- Add a `/api/account/*` denylist to `/hub-proxy` in this stage.
- Assume imported data has no `db.account`. Live `database.bin` files and internal snapshots
  carry it.
- Treat Kei auto-backup's removal as a feature loss. Its UI trigger is commented out
  (`UserSettings.svelte:188`) in both this fork and upstream; its one remaining automatic call,
  `autoServerBackup()` from `bootstrap.ts:222`, fires only inside the account-sync
  corruption-recovery path under `checkAccountSync()`, for an account-sync user whose decode and
  local-backup recovery have both already failed. That branch goes with the removal.

## 11. Uncertainties

- **The `/cryptokey` 403.** A `curl` probe of `https://sv.risuai.xyz/cryptokey` from this
  machine (2026-09-24) returned HTTP 403 under every variant tried (stale and fresh timestamps,
  several `Origin` values, a spoofed browser `User-Agent`). Other endpoints on the same host
  returned ordinary 404s to the same client in the same session, so the 403 is specific to this
  path, not a wholesale block. A browser-based probe was denied by the permission classifier,
  and the maintainer, who has no account backup to test with, asked that the endpoint not be
  probed further. Whether a genuine browser succeeds where this `curl` probe did not is unknown.
  This is now moot for the shipped decision — MC-081 refuses rather than attempting decrypt —
  but it remains an open fact about the endpoint, relevant only if the decision is revisited.
- **Realm anonymous upload: stronger evidence than a prior draft of this section stated, but
  still not run.** Upstream added the anonymous-upload path deliberately, in commit `f24989c9`
  ("feat: Add export without login," 2024-05-31), which removed three separate login gates that
  had blocked "Upload to Realm" for logged-out users (character, module and preset upload). The
  path has been unchanged and unreverted for roughly two years and four months, and
  HaejeokRisuai made the identical cut — deleting the token conditional outright — with no later
  revert found (INFERRED from the absence of a revert commit in either fork's history, not RUN).
  This stays INFERRED, not a live confirmation: nothing here traces past the client's
  `postMessage` handshake with the upload iframe, and "accepted" is not provably the same as
  "published" — a silent moderation-hold outcome would look identical from this repo. Whether
  `realm.risuai.net`'s upload page offers its own sign-in is also still unverified. Optional: the
  maintainer can settle this with a manual live check (log out, upload a disposable test
  character, confirm the returned link is reachable in a plain browser afterward).
- Whether the Partial and log-out-first routes behave exactly as read is unverified; they were
  read from source, not run (section 3).
- Upstream may change the `.bin` container's shape again. The removal should key the refusal on
  whether the marker entry is present, not on any parsed value inside it, so it stays correct if
  upstream changes what `type` means.
- Whether MC-002's "account sync almost unused" measurement covers self-hosted Node operators as
  a distinct population, or only the official hosted instance, is unconfirmed (ledger row 173's
  gap investigation, INFERRED). A self-hosted Node operator's server relays all of a synced
  user's account traffic — including the credential and the raw database bytes — through its own
  `/hub-proxy`, a generic, unrestricted passthrough, and that traffic passes through the
  operator's own process memory in plaintext while relaying (TRACED; no evidence found that it
  is logged to disk). Removal ends this exposure as a side effect of dropping the feature; it is
  not itself evidence that today's exposure has been abused.

## 12. Records to update when the stage lands

- `Agents/Roadmap.md`: mark the CHORE entry for this stage done, with the landing commit(s).
- `Agents/Investigation-Ledger.md`: append rows for the stage's plan and code review gates.
- `Agents/Maintainer-Context.md`: an entry recording that MC-080/MC-081 shipped, if the
  Orchestrator judges one warranted at that time.
- `wiki/Settings-Account-and-Files.md`: needs revision to drop the removed UI it currently
  documents (owned by its own session, not by this report).
- `plugins.md`: correct the `saveMethod` documentation to the values the code returns, and the
  four passages claiming `pluginStorage` syncs across devices (invariant 8).
- This report: update **STATUS** once a stage plan exists, and again once the stage lands.
