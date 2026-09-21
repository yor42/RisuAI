# Report 13 — CHORE-07: a failed cold-storage read must never destroy data (plan, revision 3, STAGED)

**Status:** revision 3. Revisions 1 and 2 each received "approve with required changes" from
`opus-reviewer` (ledger 23 and 25), with a new BLOCKER each time. Rev 3 **stages** the work, per
the campaign rule to split risky batches into gated stages:

- **7a, "stop deleting"**, is planned in full here and submitted for gate now.
- **7b and 7c** keep the reviewed designs, with every rev-2 finding folded in (§4 and §5). Each
  gets its own gate before implementation.

The Orchestrator verified every rev-2 finding cited below against source or git history before
folding it in.

**Evidence:**
- Ledger 14 (found), 15 (reproduced), 21 (fix facts), 22 (asset sweep reproduced), 23 and 25
  (gates).
- Harnesses: `Agents/Tools/save-gen/cold-storage-orphan-repro.svelte.harness.ts` and
  `asset-gc-cold-read-repro.svelte.harness.ts`.
- In the wild: a 2026-07-27 community post shows path 1.
- **History:** the destructive error message was introduced by upstream `9a59d483`, "fix: prevent
  chat data loss in cold storage", on 2026-02-23. Before it, a failed read kept the pointer.

## 1. Root cause (unchanged)

`getColdStorageItem` (`coldstorage.svelte.ts:40-105`; account `:44-59`, Node `:61-74`, Tauri
`:75-85`, OPFS `:86-104`) returns `null` for three outcomes: missing, a transient failure, and
present but unreadable. Callers that act destructively on `null`:

1. **`preLoadChat`** (`:627-665`) overwrites the chat with an error message. A later manual
   `cleanColdStorage()` (`:244-262`, the button at `UserSettings.svelte:94-95`) then deletes the
   intact blob. **Reproduced, and seen in the wild.**
2. **`getUncleanables`** (`globalApi.svelte.ts:1474-1489`) keeps the stub, so `cleanChunks`
   (`bootstrap.ts:556`; keep-set `:576`; Tauri sweep `:577-589`; web and Node sweep `:645-656`)
   deletes that character's emotion and additional assets. **Reproduced.**
3. **The account branch** throws uncaught; a pre-existing send race. Both belong to stage 7b.

## 2. Stage 7a — stop deleting (FULL PLAN, submitted to gate)

**Goal:** neither deletion path can destroy data that may still be recoverable. Nothing about how
chats load changes. Two changes, both pure "don't delete".

### 2.1 The startup asset sweep skips when its view is incomplete

- Add `getUncleanablesChecked(db)` → `{ keys, complete }` in `globalApi.svelte.ts`, beside
  `getUncleanables`. `complete` is false if, for any character with `cha.coldstorage`:
  - `getColdStorageItem` returns a falsy value; **or**
  - the returned value fails the existing `coldData.character && coldData.character.chaId === cha.chaId`
    check (`:1480`).
- 7a does **not** need the three-way reader. For the sweep, "missing" and "error" both mean
  incomplete, so skip either way.
- `getUncleanables(db, uptype)` keeps its signature and behaviour for `drive.ts:312`. The
  implementation shares one internal loop, so the two cannot drift.
- `cleanChunks` uses the checked form at `:576`. When the result is incomplete it **skips only the
  `assets/` deletions**: the Tauri loop `:577-589`, and in the web loop `:645-700` only the
  `assets/` branch (`:650-656`), which is interleaved with `remotes/` handling. The remote-block
  cleanup (`:592+`, and the web `remotes/` branch) is unchanged. It logs one line saying why.
- **Seam (gate R9).** Extract the gate plus both delete loops into an exported, testable function
  with injected lister and remover functions (Tauri `readDir`/`remove`, web
  `forageStorage.keys`/`removeItem`). The test drives the real wiring, not a replica.
  `cleanChunks` calls it.
- **Only asset-deletion sites in the codebase** (gate-enumerated): `bootstrap.ts:584`, `:654` and
  `:699`. `:699` is remotes, not assets; confirm this and leave it alone.
- **Cost:** orphaned assets are not collected on affected installs. Disk use, not loss.

### 2.2 The manual cold-storage cleanup keeps blobs referenced by the error text

- `listColdDataKeysFromDb` (`coldstorageData.ts:64-97`) feeds both `cleanColdStorage`'s keep-list
  and backup payload collection (`collectColdStorageBackupPayloads`, `coldstorage.svelte.ts:330-358`).
- Add a separate `listRecoverableErrorKeysFromDb(db)`. It returns the key from any chat whose
  **`message[0].data` exactly matches** the error template, with the whole string anchored.
- The template, confirmed unchanged since `9a59d483` (gate R5b): the literal text written at
  `coldstorage.svelte.ts:655-657`, `[Cold storage data could not be loaded. Key: ${coldDataKey}]`.
  The implementer copies it from source; it is not retyped.
- **Match the first message only, not "exactly one message"** (gate R5a). Users typically kept
  chatting after the error.
- `cleanColdStorage` keeps the union of the two lists.
- **Backups are unchanged.** Error keys are **not** added to the backup payload list, which would
  make every backup warn about missing blobs.
- **Cost:** truly orphaned blobs behind such messages are kept. Disk use, not loss.

### 2.2b Gate-required changes to 7a (ledger 26, all verified by the Orchestrator)

- **F1 (MAJOR): error-text chats inside characters that are themselves cold-stored.**
  - **The gap:** a cold character's stub records only pointer chats (`coldstorage.svelte.ts:411-418`)
    and keeps one empty chat (`:426-435`), so the in-memory scan never sees such chats.
  - **Change:** `cleanColdStorage` also reads each cold character's blob and collects both
    error-text keys and pointer keys from its chats. The pointer keys also backstop stubs written
    between `52aee0d1` and `c4783544`, which lack `coldStoragedChats`.
  - **If any such read throws, returns falsy, or fails the chaId check, abort the entire cleanup**
    with a message. That is the same "incomplete view means don't delete" rule as §2.1.
  - **Test:** a11, RED.
- **Throws count as incomplete:** `getUncleanablesChecked` wraps each read in try/catch.
- **Healthy-install behaviour stays identical, including failure behaviour:**
  - **Tauri:** a throwing `readDir('assets')` still rejects `cleanChunks` before the remote cleanup
    runs.
  - **Web:** keep the if/else order (`assets/`, then skip `.meta`, then `remotes/`) and a single
    `forageStorage.keys()` call.
- **Red-first sequence** (the seam does not exist in unfixed code):
  1. Extract the seam as a **pure refactor**. Cross-check it deletes exactly the same set as the
     verbatim replica in `asset-gc-cold-read-repro.svelte.harness.ts` on the same fixtures.
  2. Write a1-a4, a7 and a11, and record them FAILING.
  3. Add the checks, and show them passing.
- **Key matching:** anchor on the template and capture any key text. Never reject by key format:
  a wrong keep costs disk, a wrong drop loses data. a8 keeps its prefix and suffix near-misses.
- **a7 fixture** is produced by the real `preLoadChat` with a missing blob. Also test that a later
  send leaves the error text unchanged: `sendChat`'s `runCurrentChatFunction` runs
  `risuChatParser(v.data, {runVar:true})` over messages (`index.svelte.ts:144-149`); SUSPECTED
  harmless, test it.
- **Accepted:** one permanently missing cold character blob disables asset GC on that install.
  Disk use only.
- **§3 advice reworded (F2),** see §3.

### 2.3 Invariants

- No change to loading, saving, the UI, the plugin API, or any format.
- Healthy installs behave identically:
  - every cold read succeeds, so the sweep runs as today;
  - no error messages exist, so cleanup keeps the same set.
- The remote-block cleanup is untouched.

### 2.4 Tests

"RED" means it must fail on unfixed code, recorded. "CHAR" passes before and after, and is
labelled so. Comments are present tense.

| # | Case | Kind |
|---|---|---|
| a1 | Tauri, one transient cold read failure → the sweep deletes nothing; the character's emotion and additional assets survive | RED |
| a2 | Same on the web branch (forage `assets/` keys) | RED |
| a3 | Blob genuinely missing → the sweep skipped | RED |
| a4 | chaId mismatch in the blob → the sweep skipped | RED |
| a5 | All reads ok → the sweep deletes exactly the unreferenced assets, as today | CHAR |
| a6 | `remotes/` cleanup still runs when the asset sweep is skipped | CHAR |
| a7 | `cleanColdStorage` keeps a blob referenced only by `message[0]` equal to the error text, with the chat also holding later messages | RED |
| a8 | A near-miss string (extra prefix or suffix, a different key format) is not kept | CHAR |
| a9 | Backup payload collection is unchanged by error-text keys | CHAR |
| a10 | `getUncleanables` output is unchanged for `drive.ts` | CHAR |

**Destination:** `src/ts/process/tests/coldStorageDeletionGuards.svelte.test.ts`. Mocks stay in one
file, reusing the two harnesses' documented mock sets. Run `pnpm test` and `pnpm check`, and
cite the exit codes.

**Gate:** `opus-reviewer`. The post-implementation gate is `opus-reviewer` too.

## 3. User advice until 7b/7c ship

Anyone who sees `[Cold storage data could not be loaded. Key: …]` should not run "clean cold
storage". **After 7a ships** it is safe for chats showing that error text. **Until 7c ships**,
do not run it right after opening cold chats, or while saving is failing: a restore that has not
yet been saved can still have its blob deleted (gate F2).

## 4. Stage 7b — no destroy on load, plus guards (design; own gate before implementing)

The rev-2 design, with every rev-2 gate finding folded in:

- **Three-way reader** `readColdStorageItem` → `ok | missing | error`. **It classifies I/O and
  decoding only. No shape check** (gate R1, BLOCKER): the reader also serves character blobs
  `{character}` and arbitrary plugin values.
  - **Tauri:** `missing` only when `readFile`'s error matches `/\(os error [23]\)/` **and**
    `exists()` is false (gates M4, R7). `exists()` alone is `Path::exists`.
  - **OPFS:** `NotFoundError`.
  - **Node:** `getItem` returned `null`.
  - **Account:** consult the local fallback on every non-200 and on a network throw, and a local
    `ok` wins. `missing` only for 204 plus local-missing. **404 is an error.**
  - The `getColdStorageItem` wrapper becomes `ok` → value, otherwise `null`, never throwing.
- **`preLoadChat`:**
  - It never rejects, and resolves `'ok' | 'missing' | 'error'`.
  - **The chat-shape check lives here** (R1): a `null` or bad-shape value is an `error`.
  - It captures `chaId` and the pointer string **before** the `await`, re-locates the chat after
    it, and proceeds only if `message[0]` is still that pointer.
  - **ok, object format:**
    - messages: restored, then anything appended after the pointer;
    - `hypaV2Data` = restored (R2b: chunk ids are numbered from `lastMainChunkID`);
    - `hypaV3Data.summaries` = restored, then new;
    - `hypaV3Data.categories` merged by id, restored first (R2c);
    - `metrics`, `modalSettings` and `lastSelectedSummaries` = restored;
    - `localLore` = restored, then new, deduplicated by id with the restored entry kept (R2d);
    - `scriptstate` = a shallow merge, new values winning.
  - **ok, legacy array format** (written up to `f62de63f`, before the object format of
    `190f3d77`): merge messages only, and **leave the side fields untouched**. They are the real
    data for those chats (R2a).
  - **missing:** as today, but keep appended messages.
  - **error:** no mutation at all.
- **Persist a restore on a non-selected character** (R3; replaces `requiresFullEncoderReload`,
  which does not trigger a save and re-encodes every character):
  - export a targeted `markCharacterForSave(chaId)` from `saveDb`'s scope, which pushes to
    `changeTracker.character` and calls `saveTimeoutExecute(true)`;
  - keep a module-level set of keys restored this session, and add it to `cleanColdStorage`'s
    keep-list. That covers debounce and failed saves.
  - Test end to end on the encoded save.
- **Guards** (B1 and R4). An `isColdChat` refusal:
  - at the `sendChat` entry, **before `doingChat.set(true)`** (`index.svelte.ts:219`);
  - reported with `alertError`, **never `throwError`**, which writes into the chat under
    `inlayErrorResponse`;
  - in `v3.svelte.ts` `risuai.sendChat`, before the push (`:1411-1415`), rejecting;
  - in `sendMain`, as the **first statement**, before `processMultiCommand`
    (`DefaultChatScreen.svelte:175`), because `/cut`, `/del` and `/multisend clear` mutate without
    `sendChat` (`command.ts:128-150,172`).
- **UI** (M1): `{:then r}{#if r === 'error'}` notice plus Retry via `{#key retryCounter}`, with one
  new `en` key flagged under CHORE-05.
- **Tests:** the rev-2 table with the gate's relabelling (R6):
  - 10 → CHAR, 5d → CHAR;
  - add a RED case for "network throw + local ok";
  - add tests for R1 (the reader returns ok for `{character}` and plugin scalars, including
    `null`), R2a, R4a-c and R5c.

## 5. Stage 7c — recovery and plugin storage (design; own gate)

- **Recovery of already-hit chats:**
  - a Retry element of its own, since these chats render in `{:else}` (R8);
  - reads the key via the reader;
  - on `ok`, restores as in 7b. If there was activity after the error, `hypaV2Data` is kept as is
    (R5c);
  - **refuses while `doingChat` is set or a stream is active** (R5c).
- **`_getPluginStorage` rejects on `error`** and returns `null` only for `missing`.
  - The reviewer recommends this: low-to-moderate compatibility risk, since host errors already
    reach plugins as rejections (`factory.ts:281,466-467`), and it prevents the silent
    get-default-set overwrite.
  - Add a note to `risuai.d.ts` that `getItem` can reject.
  - **Awaiting the maintainer's decision.**
- **Moved here from 7b** (the 7b gate on 2026-09-21 cut 7b down to a minimal core; the gate found
  no data-loss path in any of these being deferred):
  - the three-way reader (`ok | missing | error`) and a `missing` branch in `preLoadChat`;
  - **a firm "this chat's data is gone, delete it" notice, but only for a reliable `missing`**
    (maintainer request). 7b shows a softer notice for every failed load, because 7b cannot tell a
    temporary failure from lost data, and telling users to delete a recoverable chat would lead to
    its blob being cleaned;
  - merging the side fields (R2b-d);
  - the `v3.svelte.ts` `risuai.sendChat` guard;
  - `markCharacterForSave` and the restored-keys keep-list (F2);
  - a Retry button for pointer chats (switching chats already retries).

## 6. Out of scope, recorded (suspected, pre-existing)

- Multiuser sync may replace the host's chat after a failed guest load (`sync/multiuser.ts:141,147,321`).
- `cleanChunks()` is not awaited (`bootstrap.ts:292`), so assets added between `:576` and `:578`
  can be swept.
- Account mode: `keys()` omits the non-avatar assets of cold characters, so local backups can
  miss them (`backuplocal.ts:108`).
- `drive.ts:312` sync is incomplete on a failed read.
- Exports of a still-cold chat export only the pointer.
