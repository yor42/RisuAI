# CHORE-33 — RisuAccount removal

**STATUS:** plan rev 3.6, 2026-09-26. **28C implemented and gated** on the `senior-advisor`'s
Invariant A/B redesign (section 11.7): the store follows storage via `publishUpstreamAccepted()`
on the Realm list/info consent branches, Accept and Decline; each view loads in response to
acceptance only from its store-driven effect; the placeholder's control only asks. **Gate 2 on the
new design is [EDITORIAL]** (ledger row 220): behaviour accepted, corrections in progress. **Commit
pending the maintainer-approved sequence (comment sweep, then 28C, then docs). Not committed.**
**Gate 1 approved rev 3**: round 3, all four lenses APPROVE-WITH-FINDINGS, no BLOCKER or MAJOR
(ledger row 195).
- **Rev 3.1** folded in every round 3 finding, with **section 11 binding**.
- **Its fix-up review** (ledger row 196) rejected it for wording only:
  - two fold-ins were wrong: the `compression` option, and section 5's translation rule;
  - several fixes existed only in section 11.
- **Rev 3.2** corrects both, and merges section 11's corrections into their home sections, so
  sections 1 to 10 and section 11 now agree.
- **The re-check approved rev 3.2 with findings** (ledger row 197): all 15 items correct, one
  MINOR (`close()` in I11's grep line), fixed in place. **The plan is final; 28A waits on the
  maintainer's go.**
- **28A is committed** as `e1dd839c` (2026-09-25). Gate 2 is ledger rows 198 and 199, and the
  live check row 200.
- **28B is implemented and gated** (2026-09-26), uncommitted. Gate 2 is ledger rows 203 and 204,
  and the live check row 205.
  - **Correction to I4:** both local `.bin` writers already stripped `account` before this
    change, so "local exports" was never a leak.
  - **An addition to I17:** the sample runs only when `checkCorruption` is on.
- **28B is committed** as `87b974e5` (2026-09-26).
- **Rev 3.3** adds section 11.6, 28C's readiness items from ledger row 207, and binds them for
  28C. Its review (row 208) approved with findings; R8 and the `bootstrap.ts` row were added.
- **28C is implemented, uncommitted.** Red tests first (ledger rows 209-210), then implementation
  in two batches plus the Orchestrator's own stale-answer finding (row 211). **Gate 2 round 1**
  (row 213) and **round 2** (row 214) both rejected substantively and were both fixed; round 2 is
  the second consecutive substantive rejection under AGENTS.md section 4's three-round rule.
  **Gate 2 round 3 is TODO(evidence)** as of this revision. Section 11.7 records rounds 1-2's
  accepted limitations and load-bearing findings.
- **Rev 3.4** adds section 11.7 and the section 3.3/3.5/5/6/10 updates 28C's implementation and
  Gate 2 rounds 1-2 required.
- **Rev 3.5** corrects section 3.3's `MainMenu.svelte`/`RealmMain.svelte` rows, which rev 3.4 had
  drifted into describing round 1-2's `'consent'` `hubStatus` and control-reload mechanism; they
  now state only the original ownership rule. Section 11.7 gains the round 1-3 history, the
  `senior-advisor`'s diagnosis (dossier `scratchpad/28c-escalation/dossier.md`; ledger row 216),
  and the adopted Invariant A/B fix. That fix's implementation and Gate 2 outcome are
  TODO(evidence).
- **Rev 3.6** records Invariant A/B's implementation and its Gate 2 outcome (ledger rows 218-220).
  The first `test-warrior`/`sonnet-coder` pass built to a flawed red test (the `getRisuHub`
  stand-in did not publish on a fresh `'consent'` read, unlike the real function under Invariant
  A), producing a "pulse" store and a per-view flag; once the stand-in was fixed to publish, a
  second `sonnet-coder` pass removed that bookkeeping, leaving the plain design in section 11.7.
  The check owner's final snapshot: 124 files, 1493 passed, 4 skipped; `pnpm check` 0; build ok. A
  fresh `opus-reviewer` Gate 2 returned **[EDITORIAL]** (ledger row 220): both invariants hold as
  scoped, every scenario holds, and every request/load mutant is killed; the required corrections
  are to the commit message and to several test/code comments, not to behaviour. Corrections are
  in progress; a targeted re-check by the same reviewer follows. Section 11.3 and 11.7 are
  corrected below for two stale/overbroad claims found while writing up this revision.
- **The comment sweep** (row 212) is done and approved, uncommitted, and lands in a separate
  commit from CHORE-33.

**Rev 1** was rejected by Gate 1 round 1 (ledger row 193).

**Rev 2** was rejected by round 2 (row 194). Both rejections were substantive, so this is round 2
of the three-round count. The Orchestrator verified every finding. A third substantive rejection
goes to `senior-advisor` before rev 4.

**Rev 3 answers AGENTS.md's second-rejection question ("is the mechanism the problem?") with two
structural changes:**
1. **I6: the stale-profile boot ends at its notice.** Once the user acknowledges it, the app
   clears the flags and reloads. It never carries on with the database it read before the
   notice.
   - Round 1 found the notice could be erased.
   - Round 2 found that carrying on let a second tab overwrite newer saves.
   - Both came from the boot continuing.
2. **28C: the agreement is enforced in the functions that send requests upstream, not at UI call
   sites.** Each such function returns "consent required" instead of fetching.
   - Round 1 missed the mobile landing view and the upload iframe's timing.
   - Round 2 missed eight browse controls.
   - Both came from gating at UI call sites.

   The UI now only shows placeholders and asks from explicit clicks. A missed UI path can then
   only do nothing; it can never leak a request.

Rev 3 also takes every other round 2 finding.

**Evidence:**
- Ledger rows 190 to 192: the investigation.
- Rows 193 and 194: Gate 1 rounds 1 and 2.
- Earlier: rows 173 to 175, and Report 25, the strategy.
- `Agents/Maintainer-Context.md`: MC-080, MC-081 and MC-084 to MC-089, plus MC-011, MC-012,
  MC-015, MC-025, MC-026 and MC-083.
- The reviews are in this session's scratchpad (`gate1-*/`, `gate1r2-*/`).

**Citation note.** This plan cites code by function and component name. The evidence packets and
reviews carry `file:line` at HEAD `c225643b`.

---

## 1. Decision and scope

**MC-080** removes RisuAccount: the hub sign-in and everything that uses its token.
- **Removed:** account sync, account data save and load, account backup restore, account cold
  storage, Kei auto-backup, Kei image generation, and in-app edit and remove of the user's own
  Realm uploads.
- **Kept:** Realm browse, info, download, report and anonymous upload; Google Drive backup; the
  Node server's `/hub-proxy`.

**MC-081** refuses an account-encrypted `.bin` before any write.

**MC-087** answers the step 1 questions. Among them:
- **In-place upgrades** are supported, so I6 is required. Detection lives in `Init()`, and a
  detected profile lands on the platform's native backend.
- **One shared agreement at first use** of upstream services (MC-086), with a Realm preview
  placeholder.
- **`/proxy2`** is a separate ticket, and **`Legal.svelte`** is unchanged.
- **The Realm notice** is option (b).
- **Unused lang keys are deleted,** and **named dead code goes** in the same pass.
- **Documents are edited:** the four MC-087 #7 names. Section 3.2 adds two committed wiki pages,
  an Orchestrator decision.

**MC-088** merges the unreachable Files page into a tab renamed "Backup & Files".

**Three sub-stages under one plan and one Gate 1**, each with its own tests, Gate 2
(`opus-reviewer`), live check and commit on the maintainer's word:
- **28A: the importer refusal** (I1 to I3).
- **28B: the removal** (I4 to I10, I12, I13, I15, I16).
- **28C: agreement at first use** (I11, I14).

The order is 28A, then 28B, then 28C.

**Orchestrator decisions inside the maintainer's scope**, each with its reason:

| Decision | Reason |
|---|---|
| **I4:** `setDatabase` drops `db.account` on load. | The upstream token leaves storage today through the Drive backup and the Kei upload. |
| **I6:** the notice comes after the database is installed, and acknowledging it reloads the app. | The notice is then in the user's language and on screen before any data. Reloading means the boot never runs on data it read before the notice. |
| **I11:** a new storage key. | Every profile sees the upstream disclosure once. |
| **I11:** the check sits in the request functions. | Gating at UI call sites missed paths in both earlier rounds: the mobile landing view, the upload iframe's timing, and eight browse controls. |
| **I6:** only the notice's own OK acknowledges it. Escape and Enter do not, and the notice is re-posted if another alert displaces it. | Otherwise Escape leaves the boot waiting behind the loading screen with no notice visible (row 195). |
| **MC-087 #4's notice is a confirm** (Continue / Cancel). | It lets the user stop before the upload frame sends anything upstream. |
| **Two committed wiki pages are edited** (`Plugin-API-Reference.md`, `RisuAI-Basics.md`). | They become false after 28B, and neither belongs to the parallel session (MC-083 precedent). |
| **I17:** the `checkCorruption` startup sample runs before `cleanChunks`' cold-storage early return. | MC-088 exposes that toggle, and without this it never fires for profiles with cold storage on, which is the default without plugins. It is an adjacent fix. |
| **I14:** prompts come only from a user action or a followed link. | MC-086's decision moves the prompt from app start to the user's first interaction with an upstream service. Its title reads "… not at boot". |
| **One shared upload opener.** | The notice and the agreement have to run before the frame's first render, which already requests upstream. There are three callers. |
| **I15:** the moved panels' strings are localised. | They become user-facing for the first time (MC-015). |
| **I16:** fix the web corrupt-database fallback in the same pass. | 28B rewrites that code, and the maintainer prefers folding in adjacent fixes. |

---

## 2. Findings the plan rests on

Each finding below was verified by the Orchestrator against source at HEAD `c225643b` (rows 190
to 194).

**F1. The importer.**
- **What `LoadLocalBackup` writes, and when.** It handles entries in file order:
  - asset entries are written mid-stream, through Tauri `writeFile` or `forageStorage.setItem`;
  - cold-storage entries are written mid-stream, through `setColdStorageItem`;
  - the marker and the database are held in memory.
- **The marker.** A well-formed marker triggers the `cryptokey` fetch after the stream. A
  malformed marker, or one of another type, alerts and continues.
- **One reader.** `LoadLocalBackup` is the only reader of the container.
- **The container:**
  - entries are laid out as `[u32 nameLen][name][u32 dataLen][data]`, unsigned and
    little-endian, with no header, trailer or count;
  - names are decoded with a default `TextDecoder`, which strips a leading BOM;
  - only the 18-byte ASCII name and the 21-byte BOM-prefixed name decode to
    `encryption.risudat` (RUN, row 194).
- **Real upstream files put every asset before the marker,** and one avatar alone can exceed 64
  KiB.
- **Test Files.** happy-dom's `File` has `slice`, and its `stream()` yields one chunk.

**F2. The marker's only writer is `SaveLocalBackup`'s account branch.** It is gated on
`forageStorage.isAccount` and an origin ending in `risuai.xyz`.

**F3. The stale profile.**
- **How the stale copy arises.** Account sync freezes the pre-sync data in LocalForage
  `risuai`, OPFS or the Node server's `save/` folder.
- **Two further stores stay behind:** `risuaiAccountCached`, and the default localforage
  instance.
- **After the removal, with nothing added,** `Init()` serves the frozen copy silently.
- **Who reaches it.** An in-place upgrade on the same origin carries the flags and the frozen
  data over.
- **Boot order.** `App` mounts before `loadData()`. `setDatabase` calls `changeLanguage`. Only
  the loading screen shows until `loadedStore.set(true)`.
- **Alerts during boot:**
  - NodeStorage's password prompt fires on the first database read, which comes after `Init()`
    and before install;
  - `makeColdData`'s `alertWait`/`alertClear`, plugin alerts, the nightly warning, and the boot
    ToS prompt (until 28C) fire after install.
- **Tauri** never calls `Init()`.

**F4. `db.account` and where it leaks.**
- **The type.** `account?` is optional and has no default.
- **Where the token goes today:** the live `database.bin`, new dbbackups and the Drive backup
  (`backupDrive` encodes `getDatabase()`). The local `.bin` paths strip it, and the debug export
  excludes it.
- **Plugins cannot read it** (`allowedDbKeys`).
- **`saveDbKei`** posts the whole database, token included, after a successful save, at most
  every 5 minutes after an HTTP 200, while `db.account.kei` is set.
- **The encoder copies every root key.**

**F5. Tests.**
- **30 tracked test files** hit the pattern union:
  - **3 wholly account:** `accounterBackupReload`, `kei/backup` and `kei/backup.restore`;
  - **6 mixed**, as named in row 192;
  - **21 incidental.**
- **One more mixed file** sits outside the union: `coldstorageData.test.ts` (F8). The
  `classifyAccountColdRead` block in `coldStorageDeletionGuards` is mixed as well.
- **Dead mock keys:** `alertLogin: vi.fn()` sits in seven test files and `alertTOS` in nine. The
  `CharXSkippableChecker` mock sits in two.
- **28C changes four suites** (`MainMenu.hubStates`, `MainMenu.hubHtmlSink`,
  `RealmMain.hubStates` and `RealmMain.hubHtmlSink`), plus the five-state marker test inside
  `MainMenu.hubStates`. `MainMenu.disclosureCard` also mounts `MainMenu`. The RealmMain suites
  mock `src/ts/alert` with `alertInput` only.
- **Importing the real `alert.ts`** fails under the MainMenu suites' mocks (RUN).
- **`VITE_RISU_LEGAL_CONFIGURED` is unset under vitest** (RUN).
- **The baseline** is 104 files, 1311 passed, 4 skipped, with the repo's vitest 4.1.2 and the
  repo as cwd.

**F6. Realm.**
- **The in-app edit** is `RealmFrame`'s `getUrl()` appending `&edit=`, which is malformed with no
  token, together with `CharConfig`'s label switch. `realmId` stays on the type (MC-011) and is
  written on each successful character upload.
- **Upload openers:** `CharConfig`'s share button (prompts), `exportChar`'s "realm" option (does
  not) and the preset share (does not). The `module:` branch has no opener.
- **The frame renders before it could ask.** The iframe `src` is set during render, before
  `onMount` (RUN), and the frame paints over `AlertComp`.
- **Browse.** `RealmMain` calls `getHub()` at the top of its script and from 9 more places,
  counting the `online` listener:
  search, the desktop NSFW and sort buttons, the mobile SFW toggle and sort cycle, paging, and
  Retry. `getHub()` reads `search`, `page`, `nsfw` and `sort` synchronously.
- **The mobile GUI** renders `RealmMain` as the landing view.
- **The network functions:**
  - `getRisuHub` returns a typed `RisuHubResult` with a `reason`;
  - `getRealmInfo` strips `?realm=`, then fetches `/hub/info/…`;
  - `downloadRisuHub` fetches Realm's download API;
  - report is an inline `fetch` in `RealmPopUp`;
  - images render only from data those functions return.
- **`characterURLImport`** runs only in `loadData`'s non-Tauri branch, only when `didFirstSetup`
  is set, and is not awaited. It also handles `?charahub=`, `#import=`, `#share_*` and
  `launchQueue`.
- **Dead code:** `RealmUpload.svelte`, `shareRisuHub2` (`testMode`), `openRealm` and
  `risuLogin`.

**F7. The agreement prompt today.**
- **The boot call.** `alertTOS()` at boot is not awaited, and declining reloads the app.
- **The other two callers** are `downloadRisuHub` (skipped under `forceRedirect`) and
  `CharConfig`.
- **Accept writes a generic `'yes'`,** and any `'none'` alert resolves `waitAlert`.
- **Drive.**
  - A button calls `checkDriver`. `checkDriverInit` exchanges `?code=` on any non-Tauri boot; returning
    `true` stops `loadData` before `loadedStore`.
  - Web's `save`/`load` flow redirects to `https://risuai.xyz/`, and the Tauri and Node flows
    use a pasted code.
  - `checkDriver('reftoken')` and `checkDriverInit`'s `accesstauri` branch fed the account's
    stored Drive tokens.
- **On Node,** hub traffic goes to the local `/hub-proxy`.
- **happy-dom follows `window.open` and iframe navigation** with its own fetch, unless disabled.

**F8. Orphans and dependencies.**
- **Removed wholesale:** `openid-client` (only `sionyw.ts` and `server.cjs`). In `server.cjs`,
  also `authCodePath` (`save/__authcode`) and `reverseProxyFunc`'s `X-SERVER-REGISTER` branch
  that reads it. Its only writer is the Sionyw callback.
- **Exports whose only production callers are removed:**
  - `replaceDbResources`;
  - `replaceColdStoragePayloadResources`;
  - `setAccountColdStorageItem`;
  - `classifyAccountColdRead`;
  - `searchTagList`;
  - `getUncleanablesSync`'s `'pure'` mode, whose only caller was `AccountStorage`.
- **Leftover imports and locals, a Gate 2 checklist:**
  - `processzip.ts`: `hasher`, `hubURL` and `HTTP_STATUS_OK_*`;
  - `characterCards.ts`: the lightning fetch-queue state, `forageStorage`,
    `getCurrentCharacter`/`setCurrentCharacter`, `openURL` and `alertMd`;
  - `backuplocal.ts`: `localforage`;
  - `RealmPopUp.svelte`: `TrashIcon`;
  - `AlertComp.svelte`: `hubURL`;
  - `SavePopupIcon.svelte`: `alertMd`;
  - `realm.ts`: `getDatabase`;
  - `UserSettings.svelte`: its iframe and login state, `hubURL` and `forageStorage`;
  - the `ShowRealmFrameStore` imports in `CharConfig` and `botpreset`.
- **The encoder's `compression` option** loses its only writers. The decoder keeps reading
  compressed data.

**F9. The Files page (MC-088).**
- **Unreachable.** It renders at `SettingsMenuIndex` 5, which nothing sets.
- **What it holds:** the Asset Cache Integrity panel (`checkCorruption`, "Verify Asset Cache
  Now") and the OPFS switch (`enableOpfs`/`disableOpfs`, with the migration lock). Their strings
  are hard-coded English.
- **Duplicates:** its Drive buttons duplicate the Account & Files page's.
- **Untested.** No test references its logic.
- **Stale pointers:** `cleanChunks`' toast says "Settings → Files → Asset Cache Integrity", and
  its comment names `FilesSettings.svelte`.
- **The OPFS migration** in `Init()` copies every key and never removes the source. A quota
  error there makes every boot fail, with no in-app way out; the data stays intact (INFERRED).

**F10. Multi-tab and boot saves.**
- **Every boot saves once.** Each change effect's first run arms the save.
- **The cross-tab channel** opens inside `saveDb`.
- **LocalForage and OPFS are not revision-aware**; Node is (409).
- **A clean peer tab** auto-reloads on a broadcast.

**F11. An upstream bug in the web corrupt-database fallback.** It loops over the dbbackups,
newest first, with no `break`, so the oldest decodable one is installed last. The Tauri branch
has the guard.

**Corrections to Report 25**, to be noted in its "Superseded" section:
- **Invariant 6's reasons are wrong.** The population is not "essentially empty", and `Init()`
  does have alert access.
- **Invariant 7's disjunct contradicts MC-080.**
- **`testMode`** sits in `shareRisuHub2`.
- **Invariant 9's counts:** 3 wholly, W0 added 6, 30 files.
- **`/kei`** does match; `sionyw` and `cryptokey` can never reach zero.
- **The `plugins.md` note** is stale.
- **The "Show Unrecommended Settings" step.** Section 6's instruction to untick Skip Saving
  Assets must carry it, since the toggle is hidden behind that setting.
- **The line numbers** went stale with CHORE-28.
- **Row 173's `155c915c`** is this repo's commit.

---

## 3. Blast radius

### 3.1 28A — the importer refusal

| File | Change |
|---|---|
| `src/ts/drive/backuplocal.ts`, plus a new pure module for the header parser (name non-normative) | **One header parser**, shared by the pre-read walk and the streaming loop: the same unsigned little-endian u32 reads and the same `TextDecoder` for names. The walk's window size is a parameter, so tests can make it tiny. **End-of-file rules, all four defined:** fewer than 4 bytes left, a name cut off, a data-length field cut off, a body cut off. Whenever the complete name is the marker, **refuse**. Otherwise the file has **no marker**, and today's import runs unchanged (I2). **Any exception in the walk aborts the import** with an error and writes nothing. No branch depends on file size or on what the `File` object supports. **The walk** reads a small window after each seek and grows it only when a header overruns. It keeps walking past names longer than 21 bytes without buffering them, and shows progress. **`LoadLocalBackup`** runs the walk before the streaming loop, and refuses with the MC-081 message. **The loop's guard:** an entry named `encryption.risudat` aborts before that entry is written, with its own message (not "Nothing was imported"), and nothing after it runs. Delete the `encryptionMeta` parsing, both marker alerts, the `cryptokey` fetch and the decrypt branch. **`SaveLocalBackup`:** delete the encrypt branch. `encryptBuffer`/`decryptBuffer` stay. |
| `src/lang/*.ts` | The refusal and guard messages. |
| `src/ts/drive/tests/…` | T-A1 to T-A13 (section 6). |
| `src/ts/drive/tests/backuplocalIdRepair.test.ts` | A real `File` over the same bytes. No assertion changes. |

28A leaves the `isAccount` sleep alone; 28B removes it.

### 3.2 28B — the removal

**Deleted whole:** `src/ts/sionyw.ts`, `src/ts/drive/accounter.ts`,
`src/ts/storage/accountStorage.ts`, `src/ts/kei/backup.ts`, `src/ts/kei/kei.ts`,
`src/lib/UI/Realm/RealmUpload.svelte` and `src/lib/Setting/Pages/FilesSettings.svelte`. Then
`pnpm remove openid-client`, with the `libc:` backfill stripped, and
`pnpm install --frozen-lockfile --offline`.

| File | Change |
|---|---|
| `src/ts/storage/autoStorage.ts` | Remove `isAccount`, `AccountStorage` from the union, `setItem`'s account branch and `checkAccountSync`. **`Init()`** replaces the `accountst` branch with detection. It records whether `accountst === 'able'` (mechanism non-normative), removes nothing, posts nothing, and falls through to the native cascade. |
| `src/ts/bootstrap.ts` | **Remove** from `loadData`: `readAccountDatabaseWithRetry`, the `isAccount` read branch, both `checkAccountSync` calls, the account corruption-recovery branch (with `autoServerBackup`), the `getDatabase().account` → `loadRisuAccountData` block, and the account imports. **The I6 notice (terminal):** at the point where the second `checkAccountSync` call is today, which is after install and before `checkDriverInit`, the service worker, `characterURLImport`, plugins and `saveDb`: when `Init()` detected a stale profile, show the blocking, localised notice. On acknowledgement, remove `accountst`, `dosync` and `fallbackRisuToken`, then `markAppInitiatedReload()` and `location.reload()`. Boot never continues past the notice in that page life. When `dosync` or `fallbackRisuToken` is present without the detection, remove them silently there and continue. **I16:** the web corrupt-database fallback stops at the first backup that decodes, which is the newest. **`cleanChunks`:** remove the `useSync`/`isAccount` early return and its comment. Its toast points at the Backup & Files tab through a lang key, and its comment names the tab, not `FilesSettings.svelte`. |
| `src/ts/globalApi.svelte.ts` | Remove: `getFileSrc`'s account branch; in `saveDb`, both `compression: forageStorage.isAccount` (each becomes `compression: false`; `reloadSaveEncoder`'s option stays required), the `isAccountSync` argument, the dbbackup gate's account arm and its 3-second sleep, the `saveDbKei` call, and the `AccountSyncConflictError` catch; `getDbBackups`' `useSync` branch; `isPlainHttpFileSrc`'s account term; `useRisuToken`/`useRisuTk` and `x-risu-tk`; `replaceDbResources`; the account imports. Keep the name `disableOpfs` when it moves, or update the comment that names it. |
| `src/ts/storage/risuSave.ts` | `encodeRemoteBlock`'s `isAccount` branch. Decode paths untouched. |
| `src/ts/storage/multiTabReload.ts` | `isRevisionAwareBackend` drops `isAccountSync`. |
| `src/ts/process/coldstorage.svelte.ts` | Remove the account branches of `getColdStorageItem` (with `accountFallback`), `readColdStorageItem`, `setColdStorageItem`, `listColdStorageItems`, `cleanColdStorage` and `removeColdStorageItems`. Remove `setAccountColdStorageItem`, `classifyAccountColdRead` and their doc references, the `replaceColdStoragePayloadResources` re-export, and `fetchProtectedResource`. |
| `src/ts/process/coldstorageData.ts` | `replaceColdStoragePayloadResources`. |
| `src/ts/util.ts` | `searchTagList`. |
| `src/ts/globalApi.svelte.ts` (again) | `getUncleanablesSync`'s `'pure'` mode, if nothing else uses it (Gate 2 confirms). |
| `src/ts/media/avatarThumb.ts` | `isThumbEligible` drops `!forageStorage.isAccount`. |
| `src/ts/characterCards.ts` | **Remove:** the charx hub dedup, the lightning import (argument, callers, fetch queue) and `shareRisuHub2`, with the imports they leave unused. **Add** an exported `openRealmUpload(target)`. For a character with a `realmId`, it first shows the MC-087 #4 notice as a **confirm** (Continue / Cancel). Cancel leaves `ShowRealmFrameStore` untouched. Then it writes the store. `exportChar`'s realm option calls it. |
| `src/lib/SideBars/CharConfig.svelte`, `src/lib/Setting/botpreset.svelte` | The share button always says `shareCloud`. Both call `openRealmUpload`; `CharConfig` keeps its `alertTOS()` check until 28C. |
| `src/ts/process/processzip.ts` | `skipSaving`, `hashSignal`, the skip path, `#finalize`'s branch, `CharXSkippableChecker`, and the imports and constants they leave unused. |
| `src/ts/drive/backuplocal.ts` | The asset-loop account branches, `LoadLocalBackup`'s `isAccount` sleep, and the `localforage` import. `dbWithoutAccount` stays. |
| `src/ts/drive/drive.ts` | `loadDrive`'s `useSync` branch. `checkDriver`'s `'reftoken'` member and branch, and `checkDriverInit`'s `accesstauri` branch, which fed the account's stored tokens and have no other reference. |
| `src/ts/process/stableDiff.ts` | An unsupported-provider check for `'kei'` at the top of `stableDiff()`, before `requestChatData`, and in `generateAIImage`. The `kei` branch and the `keiServerURL` import go. |
| `src/ts/plugins/apiV3/v3.svelte.ts` | Drop `saveMethod`'s `'account'` arm. |
| `src/ts/setting/advancedSettingsData.ts` | Remove the `adv.keiUrl`, `adv.sync.realm` and `adv.skipSavingAssetsOnWebSync` rows, and the sync comment. |
| `src/ts/storage/database.svelte.ts` | Remove `account`, `keiServerURL`, `skipSavingAssetsOnWebSync` and `lightningRealmImport` from the type, along with the two defaults. `setDatabase` removes `account` (I4). |
| `src/ts/alert.ts` | `alertLogin` and the `'login'` type. |
| `src/ts/realm.ts` | `openRealm` and its token reads. |
| `src/lib/Setting/Pages/UserSettings.svelte` | Remove the Risu Account block, the Load Auto Server Backup branch, the window handler's `'drive'` and login branches, and the iframe and login state. The heading becomes "Backup & Files". Host the two moved panels as a **child component** (for example `StorageMaintenanceSettings.svelte`, name non-normative), carrying their logic and localised strings. The gates are `!isTauri`, and `!isTauri && !isNodeServer && opfsSupported`. |
| `src/lib/Setting/Settings.svelte` | Tab label "Backup & Files". Remove the `=== 5` case and the `FilesSettings` import. |
| `src/lib/Others/AlertComp.svelte` | The `'login'` block and its window branch. |
| `src/lib/Others/SavePopupIcon.svelte` | The `AccountWarning` import and branch, and the `'account-conflict'` message. The frozen-save indicator stays byte-for-byte. |
| `src/lib/UI/Realm/RealmPopUp.svelte` | The remove button and `TrashIcon`. |
| `src/lib/UI/Realm/RealmFrame.svelte` | Remove the token reads and `getUrl()`'s token and `&edit=` branches. `getUrl` moves into a plain `.ts` module. Keep the `realmId` write. |
| `server/node/server.cjs` | Remove `getSionywAccessToken`, `__sionyw_client_data.json`, the `openid` require, `/api/oauth_login`, `/api/oauth_callback`, `authCodePath`, `reverseProxyFunc`'s `X-SERVER-REGISTER` branch, and `hubProxyFunc`'s `X-Node-Server-Auth` branch. |
| `src/lang/*.ts` | Delete 16 keys × 7 files. Add the new keys (section 5). |
| Tests | Section 6. |
| `AGENTS.md` | **Data Layer:** drop account-sync, and point the OPFS toggle at the Backup & Files tab. **The `drive/` row** changes from "Cloud sync and backup" to "Google Drive and local backup". That row edit is an Orchestrator correction, since the row is wrong after the removal. |
| `plugins.md`, `src/ts/plugins/migrationGuide.md` | `saveMethod`'s values, and every "sync(able) across/between devices" passage and echo (I8). |
| `wiki/Plugin-API-Reference.md`, `wiki/RisuAI-Basics.md` | These are committed pages, not the parallel session's. `saveMethod` loses `'account'`, and the "Account & Files" row becomes "Backup & Files" (MC-083 precedent). |
| Comments elsewhere | I13's repo-wide prose sweep. |
| `wiki/Migrating-from-upstream.md` (new; name non-normative) | **The routes:** the `.bin` route, the refusal, MC-081's two alternatives, and the **combined route** (Partial, then log out and make a full backup, then import both, in that order). **Self-hosted steps:** make the backup **before** replacing an upstream install; in Advanced settings turn on "Show Unrecommended Settings", then untick "Skip Saving Assets on Web Sync". **Also covered:** what I6's notice means; the Node server case where an upstream logout recovered data into browser LocalForage while `save/` stayed frozen; and `risuaiAccountCached`, for information. Everything is marked as read from source, not run. |

### 3.3 28C — upstream-service agreement at first use

**Mechanism.** The agreement is enforced by the functions that send requests to upstream-operated
hosts for Realm and Drive. They fall into two classes:
- **Functions behind a user action ask first, then proceed only on acceptance:**
  `downloadRisuHub`, `openRealmUpload`, the report fetch and `checkDriver`.
- **Functions not behind a user action never prompt.** Without acceptance they return
  "consent required" and send nothing: `getRisuHub` (`{ok:false, reason:'consent'}`),
  `getRealmInfo` (the same `'consent'` result), `checkDriverInit` (`false`), and `RealmFrame`,
  which renders no iframe.

**The Realm placeholders are driven by the acceptance store.** While it is false, `MainMenu` and
`RealmMain` render the placeholder without calling `getRisuHub`. A stray call that returns
`'consent'` maps to the same placeholder. The placeholder's control only asks, and the store
dependency does the single load. A missed UI path can therefore only do nothing.

| File | Change |
|---|---|
| `src/ts/upstreamAgreement.ts` (new; name non-normative) | **What it holds:** the acceptance store and the prompting helper. **Its imports** are only `svelte/store` and `stores.svelte`'s `alertStore`. It has its own wait loop and never imports `alert.ts` or `database.svelte`. **Acceptance:** a writable store whose start function reads the new `localStorage` key lazily. `isUpstreamAccepted()` re-reads the key, so a tab that accepted elsewhere is seen without asking. A `storage` listener is optional. It exposes a reset for tests. **The helper:** posts the `'tos'` prompt, and resolves `true` only for the prompt-specific Accept value. Accept stores the key and sets the store; decline stores nothing. With `VITE_RISU_LEGAL_CONFIGURED` unset it returns `false` without posting. The old `tos4`/`tos2` keys are left in place, unread. |
| `src/ts/alert.ts` | `alertTOS` goes. |
| `src/lib/Others/AlertComp.svelte` | The `'tos'` block renders the new text from lang keys. Accept writes the prompt-specific value. Delete the expired `tos2` notice. The buttons keep their flag gate. |
| `src/ts/bootstrap.ts` | Delete the boot `alertTOS()` call and its reload. After `loadedStore.set(true)`, drain a pending `?realm=` path with one prompt (section 11.6 R4; `handlePendingRealmLink()` in the seam contract). |
| `src/ts/characterCards.ts` | **Chokepoints:** `getRisuHub` returns `{ok:false, reason:'consent'}` without fetching. `getRealmInfo` strips `?realm=` (with `replaceState`), then returns `'consent'` without fetching; a `?realm=` link found during boot is kept as a pending path and handled after `loadedStore.set(true)` by one prompt (a followed link, I14). Declining fetches nothing, and a reload does not ask again. `downloadRisuHub` asks first, from its user action, whatever `forceRedirect` says. `openRealmUpload` asks first, then shows its notice, then writes the store. |
| `src/lib/UI/Realm/RealmPopUp.svelte` | Report asks first, from its click. |
| `src/lib/UI/MainMenu.svelte` | **Placeholder:** while the acceptance store is false, the preview renders an "agree and show" control in the non-populated `role=status` branch and calls nothing. The control stops propagation and only calls `askUpstreamAgreement()`; it never loads Realm itself (section 11.7's Invariant B). **Loading:** the store-driven effect is the only load trigger, so acceptance given anywhere loads it once, without a remount. `hideRealm` still hides everything. |
| `src/lib/UI/Realm/RealmMain.svelte` | **Placeholder:** the same, on desktop and on the mobile landing view. **Controls:** search, sort, NSFW/SFW, paging and Retry are hidden or inert until acceptance. **Loading:** the store-driven effect is the only load trigger (same invariant as `MainMenu`); the placeholder's control only asks. |
| `src/lib/UI/Realm/RealmFrame.svelte` | It reads acceptance synchronously. The `<iframe>` renders only inside `{#if accepted}`. Without acceptance, `onMount` returns early (no card export) and the store is reset. |
| `src/lib/SideBars/CharConfig.svelte` | Its own `alertTOS()` call goes. |
| `src/ts/drive/drive.ts` | `checkDriver` asks first. Every Drive button passes through it. `checkDriverInit` strips whichever of `code` or `state` is present, with `history.replaceState`, and makes no hub request, whenever the exchange must not run: without acceptance (either parameter present), or with acceptance and a `state` the app does not recognize (Gate 2 round 1 C3; a `?state=` present with no `?code=` is stripped the same way). |
| `src/lang/*.ts` | The 28C strings. |

`Legal.svelte` and the `VITE_RISU_LEGAL_CONFIGURED` gate are unchanged (MC-087 3d).

### 3.4 Kept, not touched

- Realm's kept features, `realmId`, Google Drive backup and restore, `/hub-proxy` and `hubURL`.
- The out-of-scope `sionyw` and `cryptokey` hits: the MCP OAuth helper, the SSRF denylist entry
  and the Vertex variable.
- `encryptBuffer`, `decryptBuffer` and `risuSave`'s decode paths.
- `SettingsExportButtons`' `'account'` exclusion.
- `Message.name` and CHORE-28's frozen-key machinery.
- **Never cleared by this stage:** `risuaiAccountCached`, and the default localforage instance.

### 3.5 Out of scope, filed as tickets when this plan is approved

1. **Upstream infrastructure outside Realm and Drive** (MC-087 3b): `/proxy2` (the default on
   static web; `usePlainFetch` bypasses it), the transformers CDN, the Patreon list, the Lua docs
   link, the MCP OAuth helper, `#import=<url>` in `characterURLImport` (fetches any URL with no
   acceptance check; it is not a Realm feature), and `getProxyStreamJobBaseUrl` (the same proxy
   infrastructure as `/proxy2`). **Observation (pre-existing, not Realm/Drive):** the Lua fetch
   ban-list checks `startsWith('https://risuai.xyz')`, so it does not catch `sv.risuai.xyz` or
   `nightly.sv.risuai.xyz`.
2. **Drive's web flow** redirects Google's OAuth to `https://risuai.xyz/`, where upstream's page
   exchanges the code and backs up or **restores against that origin's own data**. A Load
   started from a fork could therefore restore over the user's data on risuai.xyz (INFERRED).
   Settle it by a live run; this stage leaves Drive as it is.
3. **Dead code:** `LiteMain.svelte`, `docs_text.cbs`, and the `oauth_login` Tauri command with
   the `oauth2` crate.
4. **Recovery from `risuaiAccountCached`,** which the maintainer judges.
5. **OPFS quota lockout** (F9): if the migration fails, fall back to LocalForage for that boot and
   say so, or check quota before migrating.
6. **`Chat.svelte`'s copy button** fetches every http(s) URL in a rendered message, character icon
   or user icon, including `sv.risuai.xyz`, from a click; it is not a Realm or Drive feature
   (11.6's closing paragraph). The maintainer did not bring it into 28C.

---

## 4. Invariants and acceptance

**I1 — The refusal comes before every write (28A).** For a `.bin` holding any entry whose
complete name decodes to `encryption.risudat`, whatever its content, wherever it sits, and
whether or not its data fits, the importer does none of the following:
- no asset write;
- no `setColdStorageItem`;
- no `database.bin` write;
- no `setDatabase` or `DBState` change;
- no `localStorage` write;
- no `fetch`.

The user sees the MC-081 message. Any exception in the walk aborts the import, and nothing is
written. *Acceptance:* T-A1 to T-A4, T-A7 to T-A9, T-A11 and T-A12, with every spy at zero.
All of them are RED at HEAD, T-A11 included (row 195).

**I2 — Without the marker, today's behaviour is kept exactly (28A),** including truncated files.
*Acceptance:*
- T-A5 and T-A13;
- `backuplocalIdRepair.test.ts` passes with a real `File` and no assertion changes.

**I3 — The fork never writes the marker, and never stores it as an asset (28A).**
*Acceptance:*
- T-A6: RED at HEAD, with `isAccount` true, a `https://risuai.xyz` URL and `fetch` stubbed. It
  becomes a pin once 28B removes `isAccount`, and its red run is recorded in 28A's commit;
- T-A10.

**I4 — No code reads `db.account`, and the token stops leaving storage (28B).**
- **At load.** `setDatabase` removes it, so the next save's database, new internal backups,
  Drive uploads and local exports all lack it. Existing dbbackups keep it until they rotate out,
  and are never exported.
- **`localStorage`.** I6 removes `fallbackRisuToken`.

*Acceptance:*
- the I13 greps;
- T-B1: the real `setDatabase(fixture)` leaves no `account` on `getDatabase()`;
- T-B3: `setDatabase`, then `getDatabase()`, the encoder and a decode, carries no `account`.

**I5 — Upstream data that names a removed feature loads, and fails loudly (28B).**
`sdProvider: 'kei'` shows a specific message from `stableDiff()`, before `requestChatData`, and
from `generateAIImage`, before `globalFetch`. The removed fields load and are ignored.
*Acceptance:* T-B4 drives both entry points and spies on `requestChatData` and `globalFetch`.

**I6 — A stale account-sync profile does not boot silently (28B; MC-087 #1, #2).**
- **Detection.** `Init()` records `accountst === 'able'`, removes nothing, and selects the
  native backend.
- **The notice.** `loadData`, after install and before any later boot step, shows a blocking,
  localised notice, and waits.
- **On acknowledgement:** remove `accountst`, `dosync` and `fallbackRisuToken`, then
  `markAppInitiatedReload()` and `location.reload()`. `loadData` then returns at once, because
  `reload()` does not stop JavaScript. That page life never reaches `checkDriverInit`, the
  service worker, `characterURLImport`, plugins, `makeColdData`, `loadedStore` or `saveDb`, so it
  never saves.
- **If the app closes first,** the flags remain, and the next boot shows the notice again.
- **Without the flag.** `dosync` or `fallbackRisuToken` without `accountst` are removed silently.
- **What is never touched.** Frozen data, `risuaiAccountCached` and the default localforage
  instance are never deleted or overwritten.
- **Tauri** is unaffected.

*Acceptance:*
- T-B5, three platform cases: after `Init()` the backend is native, the detection is recorded,
  and the keys are untouched;
- T-B5b: `loadData` does not proceed while the notice is up; a later `alertStore` write cannot
  resolve it; on acknowledgement the keys are removed, the reload is requested, and none of the
  later steps ran;
- T-B6 and T-B7 (a pin);
- the 28B live check, including two tabs.

**I7 — Realm and Drive keep working; the in-app edit is gone (28B).**
- **The upload URL** is the constant base URL plus `#noLayout`.
- **The notice.** A character with a `realmId` gets the confirm. Cancel means no upload.
- **`realmId`** is still written.

*Acceptance:*
- T-B8: `getUrl` is well-formed and has no `edit`. RED at HEAD;
- T-B9: `openRealmUpload`, driven directly and through `exportChar`, confirms for a `realmId`,
  and Cancel leaves the store `''`. There is no confirm for `realmId: ''` or a preset. It is RED
  at HEAD through `exportChar`, which writes the store directly;
- grep, in non-test source: `edit-type`, `&edit=` and `language.updateRealm` are absent outside
  `src/lang`.

**I8 — `saveMethod` is never `'account'`; the docs match the code (28B).** *Acceptance:*
- T-B10: RED at HEAD with `isAccount` true; a pin once 28B removes `isAccount`;
- `pnpm check`;
- `doc-verifier` on every edited passage.

**I9 — Tests that pin removed behaviour are deleted or rewritten with it (28B).** *Acceptance:*
section 6 is applied. Then a grep of `*.test.ts` finds none of the following:
- the deleted module paths and `RealmUpload`;
- `AccountWarning`, `alertLogin` and `CharXSkippableChecker`;
- the F8 helpers;
- `alertTOS`, after 28C.

`isAccount`/`isAccountSync` appear in no test after 28B. T-A6 and T-B10 are RED before 28B with
an `isAccount` fixture; their red runs are recorded in the 28A and 28B commit messages. 28B
removes the property from both, and they stay as pins.

**I10 — CHORE-28's frozen-save indicator survives (28B).** *Acceptance:*
`SavePopupIcon.svelte.test.ts`'s seven cases pass unchanged. The `AccountWarning` mock, import,
reset and header mention go.

**I11 — Nothing reaches an upstream-operated host from a Realm or Drive feature before the user
accepts (28C; MC-086, MC-087 #3).**
- **The request functions hold the check.** `getRisuHub`, `getRealmInfo`, `downloadRisuHub`,
  report, `openRealmUpload`/`RealmFrame`, `checkDriver` and `checkDriverInit` send nothing
  without acceptance.
- **One acceptance** covers both documents and names upstream as the operator. Once accepted, it
  is never asked again, in any tab.
- **Declining** sends nothing and leaves the user where they were. Nothing reloads.
- **No boot prompt.** Nothing prompts at boot.
- **The home preview and `RealmMain`** (desktop and mobile) show placeholders, with their
  controls inert, then load once after acceptance.

*Acceptance:* every prompt test stubs `VITE_RISU_LEGAL_CONFIGURED` with `vi.stubEnv`. Every
decline test asserts that the prompt was posted and that the helper returned `false`.
- **T-C1:** asks; accept stored; decline stores nothing and returns `false`; a generic `'yes'`
  does not count; `tos4='true'` is still asked; a key set behind the store's back returns `true`
  without posting; the flag unset returns `false` without posting.
- **T-C2:** `MainMenu` shows the placeholder, no `getRisuHub` call, and loads once after
  acceptance given elsewhere. Its control does not open Realm.
- **T-C2m:** `RealmMain` shows the placeholder with no request. Clicking each control in both
  layouts makes no request. After acceptance it makes exactly one `getRisuHub` call, and typing
  makes none.
- **T-C3:** `openRealmUpload` for a preset leaves the store `''` on decline. RED against the 28B
  commit.
- **T-C4:** `downloadRisuHub` on decline, including with `forceRedirect`, does not fetch.
- **T-C5:** `checkDriver` on decline does not navigate or open anything. `window.open` and
  `openURL` are stubbed.
- **T-C6:** `loadData` posts no agreement prompt.
- **T-C7:** `exportChar`'s realm option leaves the store `''` on decline.
- **T-C8:** with `?realm=` and no acceptance, the parameter is stripped, there is no `fetch`
  before the post-boot answer, none on decline, and no second prompt after a reload.
- **T-C9:** `RealmFrame` renders no `<iframe>` and runs no export without acceptance.
  `disableIframePageLoading` is set.
- **T-C10:** `checkDriverInit` with `?code=` and no acceptance returns `false`, strips the
  parameters, makes no hub request, and `loadData` reaches `loadedStore`.
- **T-C11:** `getRisuHub` and `getRealmInfo` called directly without acceptance return
  `'consent'` and do not fetch. This is the chokepoint test.
- **A grep:** only `openRealmUpload`, `RealmFrame`'s reset and `RealmFrame`'s `close()` write
  `ShowRealmFrameStore`.
- **The 28C live check.**

**I12 — Strings (28B, 28C; MC-083, MC-087 #5, MC-088).**
- **Deleted from all 7 files (16 keys, 112 entries):** `loginSionyw`, `notLoggedIn`,
  `SaveDataInAccount`, `logout`, `loadAutoServerBackup`, `savingStoppedAccountConflictMessage`,
  `loadDataFromAccount`, `saveCurrentDataToAccount`, `activeTabChange`,
  `skipSavingAssetsOnWebSync`, `updateRealm`, `updateRealmDesc`, `tags`, `dataSavingInAccount`,
  `account` and `files`.
- **Kept:** `backupLoadConfirm`, `backupLoadConfirm2` and `shareCloud`.

*Acceptance:*
- no `language.<key>` access, and no `labelKey`/`language[…]` use, remains outside `src/lang`;
- each language file lacks the key's definition;
- each new key is defined in all 7 files;
- `pnpm check`.

**I13 — Nothing reachable dangles, and no prose describes the removed feature (28B).**
*Acceptance:*
- **An MSYS-safe grep script** (`MSYS_NO_PATHCONV=1`) over `src`, `server` and `src-tauri`. It
  runs the Report 25 section 10 patterns plus `useRisuToken`, `useRisuTk`, `x-risu-tk`,
  `alertLogin`, `saveDbKei`, `keiServerURL`, `openid-client`, `classifyAccountColdRead`,
  `searchTagList`, `X-SERVER-REGISTER`, `__authcode`, `reftoken`, `accesstauri`,
  `FilesSettings` and `Settings → Files`. `sionyw` is case-insensitive; every other pattern is
  case-sensitive.
- **I4's removal is written in a form that does not match `\.account\b`**, for example
  `Reflect.deleteProperty(data, 'account')`, so it needs no allowance.
- **In non-test source, the only hits allowed:**
  - `sionyw`: the agreement prompt's two links, the SSRF entry and `mcplib.ts`'s two lines;
  - `cryptokey`: `google.ts`'s two lines;
  - `encryption.risudat`: the parser's name check and the loop's guard;
  - `accountst`, `dosync` and `fallbackRisuToken`: I6's code in `Init()` and `loadData`.
- **In tests,** the new tests' fixtures, listed file by file at Gate 2.
- **A repo-wide prose sweep** of `src/`, tests included, for account, sync, Kei, lightning,
  hub-login and Files-page wording. `docs_text.cbs` is exempt (ticket 3).
- **An orphan check** over every module a deleted file or removed block imported, and over the
  touched files' imports, constants and local state. It counts production callers only and
  starts from F8's checklist.
- **Also:**
  - `pnpm check`;
  - `pnpm run build`;
  - `node --check server/node/server.cjs`;
  - `openid-client` gone from the lockfile;
  - `pnpm install --frozen-lockfile --offline`.

**I14 — Prompts come only from a user action or a followed link (28C).** The agreement prompt is
posted from an event handler the user triggered, or once after boot for a `?realm=` link, and
never from a mount, an effect or boot. On Tauri, no deep-link listener is registered at HEAD:
`characterURLImport` contains an `onOpenUrl` listener, but `loadData` calls it only on non-Tauri
boots. If a later change registers it, `downloadRisuHub`'s own ask-first gate still covers it.
*Acceptance:* T-C2, T-C2m, T-C6 and T-C8; review.

**I15 — The Backup & Files tab (28B; MC-088).**
- **The label** and heading read "Backup & Files".
- **The panels.** The integrity panel shows on every non-Tauri build, and the OPFS switch on web
  builds that support OPFS. Their strings are localised.
- **One pair of Drive buttons.**
- **No index-5 case.**

*Acceptance:*
- T-B12: the child component's gates on Tauri, Node, static with OPFS and static without;
- T-B13: `enableOpfs`/`disableOpfs` with OPFS and localforage stubbed:
  - a declined confirm writes no flag;
  - a refused lock writes nothing;
  - disable copies every key and removes `migrated` before clearing the flag;
- `pnpm check`;
- the 28B live check (integrity panel on Node; OPFS panel absent there).

**I16 — The web corrupt-database fallback installs the newest backup that decodes (28B; an
adjacent upstream fix).** *Acceptance:* T-B11: with the database corrupt and three backups, the
newest one that decodes is installed. RED at HEAD.

---

## 5. New and changed strings

The English source goes to `sonnet-coder` along with each call site. `translator` then fills
ko, cn, zh-Hant, vi, de and es.

**Where a message names an upstream setting,** the translation uses the label upstream renders in
that locale: its entry in `upstream/main:src/lang/<locale>.ts` if present, otherwise the English
label verbatim. Upstream lacks some of these entries, for example "Skip Saving Assets on Web
Sync" in five locales, and shows English there. The Orchestrator resolves each such label per
locale and gives it to the translator.

Each wording below is a draft; its content is binding.

| Key (name non-normative) | Stage | Content |
|---|---|---|
| refusal | 28A | This backup is encrypted by RisuAccount and cannot be read here, for technical reasons. Nothing was imported. It then lists what the user can do upstream instead. **(1) A Partial Local Backup**, which is not encrypted and keeps every chat, including cold storage. It keeps character, group and persona profile images, the user icon, the background, and folder and preset images. It drops other images and VITS files. **(2) Log out of account sync, then make a full backup**, which keeps the `.png` assets but loses cold-storage chats. Doing both, and importing both, keeps everything; see the migration page. |
| loop guard | 28A | This backup contains an encrypted part and the import stopped. Some images or cold-storage entries may already have been added or replaced. Your current database was not changed. |
| walk error | 28A | The file could not be read. Nothing was imported. It is shown on any exception in the walk, and never the refusal. |
| stale-profile notice | 28B | This browser profile used RisuAccount sync, which this app does not support. What you see is the data stored here before this browser turned on sync; other browsers may have changed it since. Your account's data is still on RisuAccount. If what you see may hold anything your account lacks, make a local backup of it before importing. To bring it here, sign in to an upstream RisuAI, make a local backup (`.bin`) and import it here. On a self-hosted or local upstream, first go to Advanced settings, turn on "Show Unrecommended Settings", then untick "Skip Saving Assets on Web Sync", or images are left out. On risuai.xyz, a full backup made while signed in cannot be imported; the import screen names the alternatives. The migration page has details. (The OK button reloads the app.) |
| `kei` provider error | 28B | The "Kei" image provider is not available in this app. Choose another provider in settings. |
| Realm existing-listing confirm | 28B | This creates a new Realm listing. To edit your existing listing, sign in on RisuRealm's own site. Continue / Cancel. |
| "Backup & Files" | 28B | The tab label and page heading. |
| integrity toast | 28B | Possible asset corruption detected (`${target}`). Check Backup & Files → Asset Cache Integrity. |
| panel strings | 28B | Everything the moved panels show, all English today: the headings and descriptions; the "Warn on startup" toggle label; the buttons; "No assets to check."; the progress text; the Cache API error; the evict confirm; the report lines; both OPFS confirms; and the lock error. Interpolations such as counts and basenames are kept. |
| agreement prompt | 28C | This feature uses a service operated by upstream RisuAI, not by this app. To continue, accept its Terms of Service and Privacy Policy, with links to both. |
| placeholder and button | 28C | Realm content comes from a service operated by upstream RisuAI. Agree to its terms to show it. |

**28C's final `en.ts` keys (rev 3.4; verified in source):** `upstreamAgreementPromptBefore`,
`upstreamAgreementTermsOfService`, `upstreamAgreementPromptBetween`, `upstreamAgreementPrivacyPolicy`,
`upstreamAgreementPromptAfter`, `upstreamAgreementAccept`, `upstreamAgreementDecline`,
`upstreamConsentPlaceholder`, `upstreamConsentShow`.

**The pieces carry their own spaces (Gate 2 round 1, C5).** `AlertComp.svelte`'s `'tos'` block puts
no whitespace in its template between the five prompt pieces
(`{Before}<a>…</a>{Between}<a>…</a>{After}`); each locale's strings supply their own spacing. In
`en.ts`, `upstreamAgreementPromptBefore` ends with a space and `upstreamAgreementPromptBetween` is
`" and "`. Chinese and Traditional Chinese carry no spaces at all around the two links.

---

## 6. Tests

`test-warrior` writes them in the style of the nearest existing files.

**Rules for every new or changed test:**
- stub `fetch` with `vi.stubGlobal` in `beforeEach`;
- stub `window.open` and `openURL`;
- set happy-dom's `disableIframePageLoading` wherever a `RealmFrame` renders;
- every 28C prompt test uses `vi.stubEnv('VITE_RISU_LEGAL_CONFIGURED','TRUE')`;
- seed acceptance through the agreement module's lazy read and test reset, never by mocking the
  helper away;
- red runs at HEAD use scratch copies, never `src/`.

**Suite command:**
`pnpm --dir C:/Projects/RisuAI exec vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.
The baseline is 104 files, 1311 passed, 4 skipped.

**28A.** Every test here uses the real `getColdStorageBackupKey` and `isColdStorageBackupData`,
with `setColdStorageItem` as a spy. The File is real, wrapped where a case needs `stream()` to
yield odd-sized chunks. The walk's window is set through its parameter.

| Test | What it covers | At HEAD |
|---|---|---|
| T-A1 | Upstream order (asset, cold entry, well-formed marker, database), run with the default window and with windows of 1, 5 and 13 bytes. | RED |
| T-A2 | A malformed marker body. | RED |
| T-A3 | A `{type:'none'}` marker, and an empty body. | RED |
| T-A4 | The marker first, and the marker last, at several window sizes. | RED |
| T-A5 | No marker: all entries restore as today, streamed in 7-byte chunks. | pin |
| T-A6 | Per I3. | RED |
| T-A7 | T-A1 with `isTauri`. | RED |
| T-A8 | A body larger than the default window (for example 128 KiB) and several entries before the marker, at the default window. Catches a walk that reads only its first window. | RED |
| T-A9 | A BOM-prefixed marker name after an asset and a cold entry, and a marker whose name is complete but whose data runs past the end. Both are refused. | RED |
| T-A10 | The loop guard. A File whose `slice()` view lacks the marker while its `stream()` view has it after an asset: the guard aborts, with no `assets/encryption.risudat`, no database write, no `setDatabase` and no `fetch`, and the guard's own message. | RED on the abort |
| T-A11 | `slice().arrayBuffer()` rejects on the second window. Nothing is written, and the walk-error message (not the MC-081 refusal) is shown. Fixture per section 11. | RED |
| T-A12 | A marker whose name straddles a window boundary. | RED |
| T-A13 | A truncated file with no marker: the entries before the cut are written, then "Failed, Is file corrupted?", as today. | pin |

`backuplocalIdRepair.test.ts` gets a real `File` (I2).

**28B.**
- **Deleted:** `accounterBackupReload`, `kei/backup` and `kei/backup.restore`.
- **Mixed, case by case:**
  - `getCharImageThumb` T9g;
  - `globalApiFileCacheAv3`: T8, and T11 cut to 4;
  - `avatarThumb` T14;
  - `coldStorageDeletionGuards`: a10b, a14 and R3, plus the `classifyAccountColdRead` block,
    import and mention;
  - `multiTabReload`: 2 deleted, 2 rewritten;
  - `risuSaveRemoteBlocks`: B5 and B6;
  - `coldstorageData`: the `replaceColdStoragePayloadResources` cases.
- **Incidental (21):** fixture fields and dead mocks, including `alertLogin` and
  `CharXSkippableChecker`.
- **`SavePopupIcon`:** per I10.
- **`T-A6`** loses `isAccount`.
- **New:**

  | Test | At HEAD |
  |---|---|
  | T-B1 | RED |
  | T-B3 | RED |
  | T-B4 | RED |
  | T-B5 | RED |
  | T-B5b | RED |
  | T-B6 | RED |
  | T-B7 | pin |
  | T-B8 | RED |
  | T-B9 | RED, through `exportChar` |
  | T-B10 | RED at HEAD with `isAccount`; 28B drops the fixture, and it stays as a pin |
  | T-B11 | RED |
  | T-B12 | new component |
  | T-B13 | pins on the moved logic, run against `FilesSettings`' logic at HEAD through a scratch harness |

**28C.**
- **Changed suites:** `MainMenu.hubStates` (and its five-state test, which gains a consent
  state), `MainMenu.hubHtmlSink`, `RealmMain.hubStates` and `RealmMain.hubHtmlSink`.
  - They seed acceptance through the module.
  - `RealmMain`'s alert mocks need no change, since the new module does not import `alert.ts`.
  - `MainMenu.disclosureCard` is checked.
  - `characterCards.hub.test.ts` gains the `'consent'` case.
- **Dead `alertTOS` mock keys** leave the nine files that hold them.
- **New:**

  | Test | At HEAD |
  |---|---|
  | T-C1 | RED: the new key, the `'yes'` case, the `tos4` case and the flag-unset case |
  | T-C2 | RED |
  | T-C2m | RED |
  | T-C3 | RED against the 28B commit |
  | T-C4 | pin, except its `forceRedirect` case, which is RED |
  | T-C5 | RED |
  | T-C6 | RED |
  | T-C7 | RED |
  | T-C8 | RED |
  | T-C9 | RED |
  | T-C10 | RED |
  | T-C11 | RED |
  | T-C1b | RED (R8: a live subscription to `upstreamAccepted` does not shadow a key accepted behind the store's back) |
  | T-C12 | RED (E-13, NIT-7: with the report popup open, a declined `askUpstreamAgreement()` sends no fetch) |
  | T-C13 | RED against the first version of the change (R6: a stale profile opened with `?realm=` stops at the notice and never posts the agreement prompt) |
  | T-C14 | RED (R5: a prompt displaced by a toast, another alert, a generic `'yes'`, or an empty `none` is re-posted; only its own Accept/Decline resolves it; a second call while one is pending joins it instead of posting again) |
  | T-C15 | RED (R1: without acceptance, neither view ever shows its failed state, including after an `online` event; renamed from its Gate 2 round 1 title to name what it holds) |
  | T-C16 | RED (the `'tos'` block's own buttons write `UPSTREAM_AGREEMENT_ACCEPT`/`UPSTREAM_AGREEMENT_DECLINE` into `alertStore`; with the legal flag unset the block renders no buttons) |

**Also added, folded into the suites above rather than given their own T-C id:**
- **The stale-answer tests** (the Orchestrator's own finding, ledger row 211): an answer left on
  `alertStore` by an earlier, already-resolved prompt must not resolve a later one; the module
  subscribes only after posting, not before.
- **`resetUpstreamAgreementForTests` with a pending prompt:** the reset clears the in-memory state
  and any pending prompt, so the next read re-reads `localStorage`.
- **The storage-write failure tests (Gate 2 round 1 T1):** `localStorage.setItem` throwing on
  Accept still resolves `true`, and in-memory acceptance holds for the rest of the page's life.
  The spy is on the `localStorage` instance, not the prototype, so it fails the write in file
  order under happy-dom.
- **The late-consent tests (Gate 2 round 1 T3; Gate 2 round 2 F8's S-b and S-c):** both views
  recover from a `'consent'` result that arrives after acceptance was already shown.
- **The cleared-storage test (Gate 2 round 1 T4):** a `storage` event with `key: null` flips a
  subscribed `upstreamAccepted` to `false`.
- **The Drive state-only test (Gate 2 round 1 T5):** `checkDriverInit` with `?state=save` and no
  `?code=` strips `state` and returns `false`, with no request.
- **The placeholder-control scenarios S-a to S-d (Gate 2 round 2 F8),** for both `MainMenu` and
  `RealmMain`: S-a normal; S-b late consent with the key gone; S-c late consent, then the store
  catches up through a `storage` event; S-d (`MainMenu` only) `hideRealm` turned on while the
  prompt is up. Accepting results in exactly one `getRisuHub` call in every scenario, and
  Declining in none.

**Red counts.** 55 of 126 tests failed at HEAD across 12 of the first 16 files (ledger row 209,
`scratchpad/28c/red-run-all.txt`). Two more (the stale-answer tests) and nine more from review
(the late-`'consent'` result in both views, the cleared-storage event, and a Drive `?state=` with
no `?code=`; then agreeing from the placeholder after another tab's clear — two loads, in both
views — and while the Realm preview was hidden — one load) ran red against the first version of
the change, before its fix.

**28C's suite baseline (post Gate 2 round 1-2 fixes):** 124 files, 1474 passed, 4 skipped
(`scratchpad/28c/commit-28c.txt`).

Each commit message records which tests failed before its fix.

**Mutants for Gate 2**, built through a scratch Vitest config that aliases the module:
- a walk that reads only its first window;
- a walk that fails open on an exception;
- a walk that compares name bytes without decoding them;
- an I6 that continues booting after acknowledgement;
- a `getRisuHub` without the consent check;
- a helper that returns `true` on decline;
- an `openRealmUpload` that writes the store before its confirm.

---

## 7. Sequence and gates

1. **Gate 1 round 3** (`opus-reviewer`, fresh) on this rev. A substantive rejection escalates to
   `senior-advisor` before rev 4.
2. **28A:** tests, `sonnet-coder`, `translator`, Gate 2, the live check, and a commit on the
   maintainer's word.
3. **28B:** the same. `doc-writer` edits the docs and `doc-verifier` checks them.
4. **28C:** the same.

**Before each gate,** the Orchestrator greps the `src/` diff for
`round [0-9]|MAJOR|MINOR|mutant|brief|first implementation|previously|no longer|used to`.
- **The fixer's brief** asks it to read every comment for a mechanism that no longer exists.
- **Reviewers and tests** use only the scratchpad.
- **Shell commands** run from the scratchpad, never use globs in `mkdir`/`cp`, and set
  `MSYS_NO_PATHCONV=1` for any pattern that begins with `/`.

---

## 8. Live checks

These run on a production build with the Node server, per Live-State:
- build with the legal flag, set for one command only;
- run the server in the background;
- use Claude in Chrome;
- back up `save/` first and restore it by hash afterwards;
- never send traffic to upstream services.

- **28A.**
  - A plaintext `.bin` restores.
  - A scratch-made copy with a marker placed after a body larger than 64 KiB is refused, and
    `save/` is byte-identical afterwards (hash compared).
  - Time a 10,000-entry file. This is best-case hardware, recorded, not a threshold.
- **28B.**
  - Boot, and send an Echo message.
  - **The Backup & Files tab:** the integrity panel, one pair of Drive buttons, no account
    block, no Kei or lightning rows. The OPFS switch is absent, since this is the Node build.
  - **Stale profile:** with the three flags set, reload. The loading screen stays behind the
    notice until it is acknowledged, the keys stay until then, and acknowledging reloads the
    app into the data.
  - **Two tabs** (a smoke test only): set the flags and open two tabs. Acknowledge tab 1, edit
    and save there, then acknowledge tab 2. Tab 1's edit survives. On Node this cannot fail,
    because Node's revision check would protect tab 1 anyway. The evidence for the two-tab
    invariant is T-B5b plus the "continues after acknowledgement" Gate 2 mutant. A static
    LocalForage run needs the maintainer's OK.
  - **A character with a `realmId`,** through both `CharConfig`'s share button and the export
    dialog's Realm option: the confirm appears. Cancel, and nothing loads.
  - **OPFS.** The switch logic is covered by T-B13. The forward migration is not covered. A live
    enable/disable round trip runs only on a static build, with the maintainer's OK.
- **28C.**
  - On a profile past first setup that has not accepted, watch `/hub-proxy/`, `sv.risuai.xyz`,
    `nightly.sv.risuai.xyz` and `realm.risuai.net`.
  - Desktop, and `betaMobileGUI` at a width of 800px or less: the placeholders show. Clicking
    search, sort and NSFW/SFW sends nothing.
  - Declining leaves everything in place. A declined `?realm=` link fetches nothing and does
    not ask again after a reload.
  - The accept path is proven by T-C2 and T-C2m. It runs live only with the maintainer's OK.

---

## 9. Risks and uncertainties

- **A duplicate Realm listing on a fresh upload** of a card already listed is INFERRED. The
  confirm holds either way.
- **The walk's speed** is measured, not proven, on best-case hardware.
- **Removing `account` on load** means a user going back to upstream signs in again.
- **Drive's web flow** (ticket 2).
- **The migration routes are read from source, not run** (MC-081).
- **The I6 notice waits on a person.** A user who never acknowledges it stays at the loading
  screen, by design.
- **Exposing the OPFS switch** (MC-088) makes reachable a migration never used in the field, and
  the quota lockout in ticket 5. The maintainer keeps it visible, and ticket 5 must clear before
  the fork ships (MC-089). T-B13 covers the switch logic, not the migration under quota
  pressure.
- **Coverage gaps:** `UserSettings.svelte`, `AlertComp.svelte` and `server.cjs` are checked by
  `pnpm check`, the build, review and the live checks.

---

## 10. Records to update when the stage lands

- `Agents/Roadmap.md`:
  - CHORE-33's status and commits;
  - the six tickets from 3.5;
  - CHORE-14 UI-1's Files part is resolved.
- `Agents/Reports/25-risuaccount-removal-strategy.md`: STATUS, and the section 2 corrections in
  its "Superseded" note.
- `Agents/Investigation-Ledger.md`: a row per gate.
- `Agents/Live-State.md`.
- **Wiki pages edited directly for 28C** (fork-owned, not the parallel wiki session's files):
  - `wiki/Migrating-from-upstream.md`: the first-use agreement prompt for Realm and Drive, and
    that an acceptance given in upstream RisuAI does not carry over;
  - `wiki/RisuAI-Basics.md`: the Realm preview and browser placeholder before agreement;
  - `wiki/Creating-a-Basic-Bot.md`: "Share to RisuRealm" asks for the agreement first if not
    given.
- **For the parallel wiki session, a hand-off list only:**
  - `Settings-Account-and-Files.md`: the account section, the backup row, the three gates, and
    the merged "Files" section;
  - the page rename to Backup & Files;
  - `Settings-Advanced.md`'s four affected rows;
  - `Settings.md`'s tab name, and its line listing Files under "Pages that are not in the menu";
  - `Settings-Account-and-Files.md`'s "Warn on startup" description (I17 changes when it fires);
  - `Home.md` and `_Sidebar.md`'s links;
  - linking the new migration page;
  - **28C additions:** `Settings-Chat-Bot.md` (the preset "upload to Realm" now asks for the
    agreement first) and `Settings-Display.md` ("Hide RisuRealm": the placeholder shown before
    agreement).
- This report's STATUS.

---

## 11. Round 3 fold-ins (rev 3.1; binding, and they win over earlier sections)

Source: Gate 1 round 3 (ledger row 195). The Orchestrator verified the two items that change
behaviour, R3-2 (`cleanChunks` returns early when cold storage is on, before the integrity
sample) and DS3-1 (Escape replaces any alert with a toast). The rest are test specifications
and clarifications. The IDs below are round 3's.

### 11.1 28A

- **Walk-error message (DS3-5).** A new string: "The file could not be read. Nothing was
  imported." It is shown on any walk exception, never the MC-081 refusal.
- **Loop-guard wording (N-08).** "added or replaced", not "added".
- **I2's exception (DS3-8).** A walk exception aborts a no-marker import before any write. That
  is the one deliberate change from today.
- **T-A8 (N-11).** Its pre-marker body is twice the exported default window.
- **T-A9 (N-12).** Add a variant: a complete marker name followed by a cut-off data-length
  field.
- **T-A11 (DS3-4).**
  - Run on a no-marker fixture and on the upstream order.
  - Use a window small enough to force a second read, and reject that read.
  - Assert the walk-error message, and that the MC-081 refusal is not shown.
- **T-A13 (DS3-6).** The cut lands inside, or before, the final database entry.
- **Removal-created orphans in `backuplocal.ts` (N-13).**
  - `encryptBuffer`/`decryptBuffer` become unused after 28A; remove the import.
  - `DBState` becomes unused after 28B.
  - The unused `hubURL` import goes.

### 11.2 28B

**I6:**
- **What acknowledges the notice (DS3-1, E-06).** Only its own OK. Escape and Enter do not. If
  another alert write displaces it, the notice is re-posted.
- **T-B5b (DS3-2, E-01, E-07).** It runs on the decode, nullish and backup-fallback branches,
  and asserts:
  - the three keys are still present while the notice is up;
  - the notice is visible again after a foreign `alertStore` write, and after Escape;
  - nothing clears or drops the native store, `risuaiAccountCached` or the default localforage
    instance.
- **T-B6.** `dosync` or `fallbackRisuToken` without `accountst` is removed silently; boot
  continues with no notice. RED at HEAD, through `checkAccountSync`.
- **T-B7.** A pin: a Tauri boot never reads or removes the keys, and a profile with no flags
  boots unchanged.
- **New Gate 2 mutant:** "removes the keys before acknowledgement".
- **Notice wording (DS3-7):**
  - "the data stored here before this browser turned on sync; other browsers may have changed it
    since";
  - add: "if what you see may hold anything your account lacks, make a local backup of it before
    importing".

**Realm:**
- **I7 acceptance (R3-5).** The grep for `ShowRealmFrameStore` writers holds from 28B on. The
  allowed writers are `openRealmUpload` and `RealmFrame`'s reset and `close()` (N-15). The 28B
  live check uses both `CharConfig`'s share button and the export dialog's Realm option.
- **T-B9, T-C3 and T-C7 (E-08).** Each also asserts that the store is `''` while the confirm or
  the agreement prompt is still pending.

**Backups and the moved panels:**
- **T-B11 (E-09, DS3-6).**
  - The fixture: a corrupt `database.bin`; a corrupt newest backup; then two backups that both
    decode.
  - Assert that the second-newest is installed and that `setDatabase` ran exactly once.
- **T-B13 (R3-1).** Add the disable-failure case. `target.setItem` rejects on the second key.
  Then:
  - `opfs_flag!` stays `able`;
  - `migrated` is not removed;
  - the lock is released once;
  - an error is shown;
  - no reload.
- **T-B14 (R3-6).** Pins on `verifyAssetIntegrity`, run against HEAD's logic through the scratch
  harness:
  - the scan rejects: the error is shown after the wait clears, and is not overwritten;
  - unsupported: an error;
  - mismatches, confirm declined: no evict;
  - mismatches, confirm accepted: evict with the mismatched basenames.
- **I17 (R3-2).** `cleanChunks` runs its three-asset integrity sample before the cold-storage
  early return. It uses `getUncleanablesSync` over the in-memory database, with no cold reads.
  The label and comment then say what is true. T-B15 has cold storage on and `checkCorruption`
  on, with a corrupt sampled asset: the toast fires. RED at HEAD.
- **Integrity toast (NIT-a).** It keeps `${target}` as an interpolation.
- **The moved panels' strings, all localised (R3-4):**
  - "No assets to check.";
  - the progress text, and the Cache API error;
  - the evict confirm, and the report lines;
  - both OPFS confirms, and the lock error.

**Translation rule (R3-3, E-12):** where a message names an upstream setting, use the label
upstream renders in that locale: its entry if present, otherwise the English label verbatim. The
Orchestrator resolves each label per locale for the translator, for the stale notice (28B) and
the refusal (28A).

**Checklist and tooling:**
- **The F8 checklist gains (NIT-d, NIT-f):**
  - `assetIntegrity.ts`'s "future verify action" comment;
  - `getUncleanables`' own `'pure'` parameter and its JSDoc;
  - the encoder's `compression` option stays in `risuSave`, and `reloadSaveEncoder`'s
    `opts.compression` stays required. Every caller that passed `forageStorage.isAccount` passes
    `compression: false` instead. Neither signature widens or narrows.
- **Server check (N-10).** `node --check server/node/server.cjs` joins 28B's checks.
- **Prose sweep (N-09).** It exempts the new strings that name the removed feature on purpose:
  the refusal, the stale notice and the Kei error.

### 11.3 28C

**The agreement module:**
- **`isUpstreamAccepted()` (MINOR-2)** is a pure re-read. **(Stale as of rev 3.6.)** The claim
  that the store is written only by the helper and the optional `storage` listener no longer
  holds: under the Invariant A/B redesign (section 11.7), `publishUpstreamAccepted()` also writes
  it, on the Realm list/info consent branches, and on Accept and Decline. Templates read
  `$upstreamAccepted`. `RealmMain`'s subscription wraps `getHub()` in `untrack`.
- **Order of checks (NIT-1).** Consent comes before offline, so an offline user who has not
  accepted sees the placeholder. The `online` listeners count as chokepoint-covered callers.
- **Storage failures (NIT-6).** The helper wraps its `localStorage.setItem` in try/catch. The
  in-memory store wins for the rest of that page's life.
- **Deleting `alertTOS` (MINOR-4).** `globalApi.svelte.ts`'s unused `alertTOS` import goes in
  the same step, or the build breaks. Afterwards a grep for `alertTOS` across `src` finds
  nothing.

**`?realm=` links:**
- **The strip (NIT-2)** uses `replaceState`.
- **The post-boot prompt (NIT-3)** is re-posted if displaced, until the user explicitly accepts
  or declines.

**Drive (NIT-h):** `checkDriverInit`, given an unknown `state`, strips the parameters and returns
`false`.

**Tests:**
- **The `stores.svelte` factory mock (MINOR-3, E-03).** Every suite that runs the helper under
  such a mock exports a real `alertStore: writable({type:'none', msg:''})`. That covers:
  - the MainMenu and RealmMain suites;
  - `characterCards.hub`, where every existing case seeds acceptance;
  - the new drive, `RealmFrame` and `loadData` suites;
  - T-C1, which never mocks the helper itself.
- **T-C2 and T-C2m (E-02, MINOR-1).**
  - Assert no `'tos'` alert after mount, after an `online` event, and after a whole-`DBState.db`
    swap.
  - Accepting through the control itself makes exactly one `getRisuHub` call.
  - T-C2m dispatches `online` while the placeholder shows.
- **T-C6 (NIT-5)** asserts that `loadedStore` was reached.
- **T-C10 (NIT-5)** stubs a non-2xx Response, so HEAD returns true and fails fast.
- **T-C12 (E-13, NIT-7):** with the popup open, a declined report sends no fetch. RED at HEAD.
- **T-C1's label (N-02):** RED for the new key, the `'yes'` case, the `tos4` case and the
  flag-unset case.

### 11.4 Live checks (DS3-3, E-11, NIT-4, NIT-g)

- **The two-tab evidence is T-B5b plus the "continues after acknowledgement" Gate 2 mutant.** The
  Node two-tab step is a smoke test only, because Node's revision check would save tab 1 anyway.
  A static LocalForage run needs the maintainer's OK, like the OPFS round trip.
- **The 28C live check** uses a profile past first setup that has not accepted.
- **Section 8's OPFS line** reads "the switch logic is covered by T-B13". The forward migration is
  not covered.

### 11.5 Records (DS3-9)

MC-089 is part of this plan's evidence. It keeps the OPFS switch visible, and the quota-lockout
ticket must clear before the fork ships.

## 11.6 28C readiness at `87b974e5` (rev 3.3; binding for 28C; wins over earlier sections)

**Source:** ledger row 207, the readiness workflow run after 28B landed. The design in section
3.3 holds: with 28C built as specified, no path lets a Realm or Drive feature reach an upstream
host before acceptance. The items below are what the implementer must also do. The Orchestrator
verified R1 to R4 against source.

**R1. Consent is a state of its own in the Realm views.**
- **Today,** `RealmMain` and `MainMenu` map every non-offline failure to `hubStatus = 'failed'`.
  A `'consent'` result would therefore show "Load failed" with an inert Retry.
- **Both views get a distinct consent state** that renders the placeholder (MC-087 #3a). While
  `$upstreamAccepted` is false they render it directly and call nothing.
- **`RealmMain`'s top-level `getHub()` call,** which runs at script init, is replaced by the
  store-driven single load. It is not left in place behind a check.

**R2. `checkDriverInit` needs new stripping code.** Today its only
`history.replaceState(… search = '')` is inside its `catch`. Without acceptance, when `code` or
`state` is present, it strips both with `replaceState`, makes no request, and returns `false`.
An unknown `state` with acceptance does the same (NIT-h).

**R3. `getRealmInfo` switches from `pushState` to `replaceState`,** and strips the parameter
before any `await`. Section 3.3 already says this; the code still uses `pushState`.

**R4. `?realm=` links are queued, then drained after load.**
- **The problem.** `characterURLImport`, and therefore `getRealmInfo`, runs inside `loadData`'s
  non-Tauri branch, before `loadedStore.set(true)`.
- **Without acceptance,** `getRealmInfo` strips the parameter, records the path as pending,
  fetches nothing, and returns `'consent'`.
- **After `loadedStore.set(true)`,** `loadData` drains the pending path through one prompt:
  - accept: the info request runs;
  - decline: nothing is fetched, and the pending path is cleared.
- **After a reload,** there is no second prompt, because the parameter was already stripped.
- **`characterURLImport`'s call site does not move.**

**R5. Every agreement prompt re-posts until it gets an explicit answer.**
- **Scope.** This covers the click prompts too, not only the `?realm=` prompt (NIT-3).
- **What counts as an answer.** Only the prompt's own Accept or Decline value answers it.
  Another alert, a toast (the integrity sample's, for example), Escape's toast, or a generic
  `'yes'` re-posts it.
- **One prompt at a time.** A second `askUpstreamAgreement()` call while one is pending joins
  that pending promise instead of posting a second prompt.

**R6. Invariant: at most one self-re-posting alert is live in a page life.**
- **The stale-profile notice** (I6) ends its page life before `loadedStore.set(true)`.
- **Agreement prompts** are posted only from a user action on the loaded app, or from R4's drain
  after `loadedStore.set(true)`. So they can never be live together.
- **This is a stated invariant, not an accident of position.** A new test holds it: a stale
  profile opened with `?realm=` stops at the notice and never posts the agreement prompt.

**R7. Tests the plan did not name.**
- **Two boot test files** set `tos4` and describe the boot `alertTOS`:
  `bootstrap.staleAccountProfile.svelte.test.ts` and `bootstrap.tauriStaleAccountPin.test.ts`.
  Once the boot call is gone, their setup and comments change.
- **Six suites** need a real `alertStore` in their `stores.svelte` mock, not only in their
  `alert.ts` mock: `MainMenu.hubStates`, `MainMenu.hubHtmlSink`, `RealmMain.hubStates`,
  `RealmMain.hubHtmlSink`, `MainMenu.disclosureCard` and `characterCards.hub`.

**R8. Acceptance given in another tab is found by re-reading the key, never from the cached
store.**
- **The check.** `askUpstreamAgreement()` decides "already accepted" with `isUpstreamAccepted()`.
- **Why not the store.** Once any view subscribes to `upstreamAccepted`, a read of it returns the
  cached value, so another tab's acceptance would be missed and the user asked again (I11).
- **The store follows.** On that path the helper also sets the store, so the view loads.
- **Found by** the addendum's review (ledger row 208).

**New tests:**
- **T-C1b (R8):** hold a live subscription to `upstreamAccepted` (for example, a mounted
  `MainMenu` placeholder). Set the key behind the store's back. `askUpstreamAgreement()` must
  resolve `true` without posting, and the store must become `true`.
- **T-C13 (R6):** the stale-profile case above.
- **T-C14 (R5):** a click prompt displaced by a toast, by another alert and by `'yes'` is
  re-posted each time. Only its own Decline resolves it to `false`.
- **T-C15 (R1):** without acceptance, neither view ever shows its failed state.

**Out of the plan's scope, awaiting the maintainer.** `Chat.svelte`'s copy button fetches every
http(s) URL in the rendered message, character icon and user icon, including `sv.risuai.xyz`.
- **What it is.** It runs from a click and is not a Realm or Drive feature. It re-fetches images
  the browser has already loaded to display the message.
- **Default:** list it in section 3.5 as a sixth out-of-scope item, unless the maintainer brings
  it into 28C.

The maintainer did not bring it into 28C; it stays as item 6 in section 3.5.

## 11.7 28C Gate 2 (rev 3.5; binding for 28C; wins over earlier sections)

**Source:** ledger rows 213, 214 and 215 (Gate 2 rounds 1 to 3 on the 28C implementation; round 3
was interrupted before a verdict) and the `senior-advisor` escalation (dossier
`scratchpad/28c-escalation/dossier.md`; ledger row 216).

**O1 (accepted limitation, recorded, not fixed here).** R5's re-post can hide a blocking dialog
posted while the agreement prompt is pending — for example `saveDb`'s multi-tab conflict prompt
— and that dialog's wait then takes the agreement prompt's answer instead of its own. The conflict
prompt falls back to its safe choice, `'stay'`, so this is not a data-loss path. The old boot
`alertTOS` prompt had the same hazard, and it was worse: any answer but Accept reloaded the app. A
real fix needs an alert queue; that is a later ticket, not part of 28C.

**R6 is load-bearing, not incidental.** Two self-re-posting alerts live at once would ping-pong
without bound. R6 (section 11.6) holds this by ordering — the stale-profile notice's page life
ends before `loadedStore.set(true)`, and no agreement prompt posts before then — and T-C13 pins
the scenario: a stale profile opened with `?realm=` stops at the notice and never posts the
agreement prompt.

**N2 (recorded, not fixed).** A `?realm=` link followed without acceptance (for example while a
stale "Forked" profile is still up) records a pending path that nothing later drains, if the
pending-path key is never removed by an explicit accept or decline. This is unreachable in the
shipped design except by another tab removing the acceptance key mid-flow; recorded, not treated
as a defect.

**The report asks after its own confirm and input.** `RealmPopUp`'s report flow calls
`askUpstreamAgreement()` after its confirm dialog and its text input, immediately before its
`fetch`. S3 ("before its fetch") is met, and the popup is reachable only after acceptance in the
first place.

**Inert `RealmMain` controls still keep their state changes.** Search, sort, NSFW/SFW and paging
apply to the load that runs once acceptance arrives, even though clicking them before acceptance
sends no request. This is intended: the first post-acceptance load reflects whatever the controls
were set to while inert.

**The placeholder's control-ownership rule drifted across rounds 1-2, and round 2's "mechanism
sound" judgement was wrong.** Section 3.3's original design gives the store-driven effect the only
load: "The placeholder's control only asks, and the store dependency does the single load. A
missed UI path can therefore only do nothing." Round 1's fix brief, chasing C1 (a stray `'consent'`
result left with no placeholder), introduced a `'consent'` `hubStatus` and gave the placeholder's
control its own reload — a non-normative mechanism the Orchestrator wrote into that brief, not
something section 3.3 asked for. That reload put two load triggers in each view (the effect and
the control) for one acceptance. Round 2 found the round-1 mechanism doubled the call in scenario
S-c and fixed its discriminator, and the reviewer and the Orchestrator then judged "the
consent-`hubStatus`-plus-placeholder design is sound" — **this judgement was wrong.** Round 3's
interrupted scenarios (`scratchpad/28c/gate2-r3/scen/`) found two more double loads in the same
control: **E2** (a `key:null` storage event arriving while the prompt is up, after the control
captured the store as `true` at click time, flips the store, so the effect and the control's
captured reload both fire) and **E4** (the control activated twice before the answer joins one
pending prompt, but both continuations reload). Three leaks in the same piece of logic (round 1's
C1, round 2's F1/S-c, round 3's E2/E4) triggered the escalation to `senior-advisor` (AGENTS.md
1.2's repeat-rejection rule and 1.3's escalation triggers).

**`senior-advisor`'s diagnosis.** The store could stay `true` while storage held no acceptance,
because nothing published a fresh `false` back to it: `getRisuHub`/`getRealmInfo` read storage
directly and returned `'consent'`, but never corrected the store. Every fix after round 1 was
therefore trying to make the control **predict** whether the (silently stale) store would still
cause the effect to fire — a prediction with a hole wherever the store changes between the click
and the answer, or the control fires twice. Recommended redirection: remove the second load
trigger rather than keep guarding it.

**Adopted fix.**
- **Invariant A (narrowed, rev 3.6 — the round-3.5 wording above was broader than what got
  built):** a request that reads storage and finds no acceptance publishes that read (`getRisuHub`
  and `getRealmInfo`), Accept and Decline publish, and the `storage` listener follows other tabs.
  Other fresh reads — the helper's own read while its prompt is up, `checkDriverInit`,
  `RealmFrame`'s init read — do not publish, and none of them causes a request, a stuck view or a
  double load.
- **Invariant B:** in each view, only the store-driven effect loads Realm in response to
  acceptance. The placeholder's control only calls `askUpstreamAgreement()`; it never loads Realm
  and never reloads on its own account. This restores section 3.3's original ownership statement
  exactly, and section 3.3's `MainMenu.svelte`/`RealmMain.svelte` rows are corrected to it (rev
  3.5).
- The `'consent'` `hubStatus` that round 1 introduced is removed; there is no separate consent
  state for a view to track, only the store's own boolean (kept accurate by Invariant A).
- **A fresh Gate 2 review runs on the new design,** since it replaces rather than patches the
  round 1-2 mechanism; the three-round rejection counter restarts for it (AGENTS.md 1.2).

**Invariant A/B's implementation and Gate 2 outcome are in (ledger rows 218-220; rev 3.6 above).**
Gate 2 on the new design returned **[EDITORIAL]**: both invariants hold as scoped, every scenario
holds, and every request/load mutant is killed. The required corrections are to the commit message
and to test/code comments, not to behaviour; a targeted re-check by the same reviewer follows.
**TODO(evidence): that re-check's outcome, and the live check on a production Node build (section
8's 28C bullet), are not yet in.**

**Process lesson (AGENTS.md section 4).** A non-normative mechanism suggestion in a fix brief
(round 1's "reloads only if the view is in the consent state") can itself be the load-bearing
accident a later round has to undo; writing "non-normative" next to it did not stop the coder and
the round-1 tests from building to it instead of the invariant above it. A judgement that a
mechanism is "sound" after only one round of scenario-checking is not settled — round 2 made that
call and a fresh set of scenarios in round 3 broke it. Later briefs in this campaign should state
the invariant and scenarios first, mark any suggested mechanism explicitly non-normative, and
treat a second occurrence of the same class of leak (not just a second rejection) as a signal to
ask whether the mechanism, not the guard, is wrong.
