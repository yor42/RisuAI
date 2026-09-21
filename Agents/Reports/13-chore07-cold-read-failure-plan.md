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

## 5. Stage 7c — plan (revision 5, 2026-09-21; 7c-1 gated, ledger 41)

7b is committed (`3e17c8a3`) as a minimal core. It stops overwriting the chat, adds the send guards
and shows a soft notice. 7c is split into two sub-stages, following the maintainer's "keep it
minimal" direction, and **each sub-stage gets its own gate.** This section is the plan for
**7c-1**. It also records 7c-2 and the work that was dropped.

**Revision 5** folds in the 7c-1 plan gate (ledger 41: approve with required changes). The
Orchestrator verified gate findings 1, 2, 3 and the bridge location in source before folding them
in.

### 5.1 Maintainer decisions (2026-09-21)

- **Plugin storage, option A.**
  - `pluginStorage.getItem` **rejects** when a read fails, and resolves `null` only when the data
    is really missing.
  - `pluginStorage.setItem` **rejects** when a write fails. Today it ignores
    `setColdStorageItem`'s `false`.
- **`risuai.d.ts` note.** Document that both can reject, and label this **specific to this fork**.
  - This work is a long-lived community fork (like Haejeok-Risu or PocketRisu), not a series of
    upstream PRs. Upstream appears to accept only small, measurable PRs.
  - Plugin code must keep working on upstream too. The note should tell authors to wrap these
    calls in `try/catch`, which is harmless on upstream, and must not suggest they can count on
    the rejection happening.
- **Firm notice for lost data.** Show it only for a reliable `missing` result (carried over from
  7b).
- **Fork rule, general.** Stay fully backward compatible with upstream characters, modules, presets,
  `.bin` backups and plugins, and keep changes non-invasive.

### 5.2 7c-1 scope

1. **A new three-way reader,** `readColdStorageItem(key) -> {status:'ok', value} |
   {status:'missing'} | {status:'error', error}`.
   - It classifies I/O and decoding only. It does **no shape check** (R1), because it also serves
     character blobs and arbitrary plugin values, including a stored `null`.
   - **`getColdStorageItem` stays byte-identical** (gate Q1: option (i)). Its 11 existing callers
     keep today's behaviour. Wrapping it would break `globalApi.svelte.ts:1527` / `drive.ts:312`,
     which need the account network-throw rejection to abort, and would give `backuplocal.ts:556`
     a false "cold data missing" prompt.
   - Only two call sites use the new reader: `preLoadChat` and `_getPluginStorage`.
   - Per backend (gate findings 4-6):
     - **Tauri:** `missing` only when the `readFile` error matches `/\(os error 2\)/` **and**
       `exists()` resolves `false`. An `exists()` throw, such as a scope violation, is `error`.
       Android's differently formatted errors always fall to `error`, which is the safe direction.
     - **OPFS:** `missing` only for a `DOMException` named `NotFoundError`. Every other error,
       including `TypeMismatchError` and `NotReadableError`, is `error`.
     - **Node:** `missing` when `getItem` returns `null`, since the server answers a missing file
       with 200 and an empty body. Any throw is `error`.
     - **Account: never `missing`.** Try the hub first. On a non-200 or a network throw, fall back
       to the local read, and a local `ok` wins. Everything else is `error`. The hub's 204
       meaning is unverified and the hub is upstream-only, so a hub answer can never be allowed to
       trigger the lost-data notice. This is no more aggressive than today, as the `isAccount`
       rule requires.
   - Decoding: a decompression or `JSON.parse` failure is `error`.
2. **Plugin storage** (`v3.svelte.ts:1282-1300`).
   - `_getPluginStorage`:
     - no mapping -> `null` (unchanged);
     - `ok` -> the value, `?? null` as today;
     - `missing` -> `null`;
     - `error` -> throw an `Error` whose message names the key but **never the value**.
   - `_setPluginStorage`:
     - **`value === undefined` (gate finding 3).** `JSON.stringify(undefined)` stores 0 bytes and
       would read back as `error` forever. Store `null` instead: `getItem` already returns `null`
       for it today, so plugins see no change. This mirrors the existing guard at
       `coldstorage.svelte.ts:648`.
     - If `setColdStorageItem` returns `false`, throw.
     - **A new key's mapping is recorded only after the write succeeds**, and the implementation
       **re-reads `getDatabase().pluginCustomStorage._coldplugin` after the `await`** (gate finding
       7). It must never write into an object captured before the await, which `_clearPluginStorage`
       may have replaced.
     - The accepted ordering limits: a `removeItem` or `clear` racing a first write may see the key
       come back; two first writes on the same key both succeed, the last to finish wins, and one
       blob is orphaned until cleanup.
     - An existing mapping is left alone on failure.
   - **The bridge** (verified): the host side is `factory.ts:846-868`, where the try/catch sets
     `response.error`. The plugin side is `factory.ts:278-281`, which rejects with
     `new Error(data.error)`. So a host throw arrives as a rejection, and the host neither crashes
     nor raises an unhandled rejection. Legacy v2 plugin storage (`plugins.svelte.ts:716-745`) is
     not affected.
3. **`risuai.d.ts`** (`PluginStorage.getItem`/`setItem`, around `:1017-1030`): add notes worded
   per §5.1.
4. **`preLoadChat`: a `missing` result and the character-switch race.**
   - It resolves `'none' | 'ok' | 'missing' | 'error'`, and uses the new reader.
   - `missing` **mutates nothing**, the same as `error`.
   - **Race fix (gate finding 2, pre-existing data loss).** After the `await`, if `characterIndex`
     is no longer the selected character, return `'none'` and write nothing.
     - How the loss happens: a restore that lands on a non-selected character is never tracked
       for saving (`dbChangeEffects.svelte.ts:103-117`). A later `cleanColdStorage` then deletes
       the blob, while the saved database still holds the pointer.
     - Reopening the chat retries the read. Check the selection by `chaId`, not by index alone.
   - The shape check stays: an `ok` read with a bad shape is `'error'`.
   - **`DefaultChatScreen`:** show the firm notice for `missing` (a new `en` key, flagged for
     CHORE-05), and 7b's soft notice for `error`.
     - The wording must not tell the user to delete unconditionally (gate finding 8). A `.bin`
       restore from another device might still hold the blob, and deleting the chat removes the
       pointer that recovery would need.
     - Proposed wording: "This chat's stored data could not be found (key: …). If you have a backup
       from another device, restore it first. Otherwise the data is lost, and you can delete this
       chat."
5. **`risuai.sendChat` guard: required** (gate finding 1, verified).
   - The problem: `v3.svelte.ts:1411-1415` pushes the plugin's message into the chat *before*
     `processSendChat` runs. The 7b guard refuses the send only after that push, and the plugin
     still gets `true` (`:1427`).
   - The fix: at the start of the `sendChat` handler, before the permission prompt and before the
     push, reject when the selected chat `isColdChat`.

### 5.3 7c-2 (later, own gate): recovery of chats already hit before 7b

- These chats show the old `[Cold storage data could not be loaded. Key: ...]` text as
  `message[0]`, and 7a keeps their blobs.
- A Retry button in the `{:else}` path (R8) reads the key with the 7c-1 reader.
  - `ok`: restore. The messages become the restored ones plus the messages after the error text,
    and `hypaV2Data` is kept as it is if there was activity (R5c).
  - `missing`: show the firm notice.
  - Refuse while `doingChat` is set or a stream is active, and apply the same character-switch
    check as 7c-1.

### 5.4 Dropped, and accepted limits

- **Side-field merges (R2b-d)** are dropped.
  - With the §5.2 item-5 guard, neither the UI nor the plugin `sendChat` can append to a pointer
    chat any more.
  - **Accepted limit (gate finding 9, pre-existing):** a plugin can still write side fields onto
    a pointer chat through `setChatToIndex`/`setCharacterToIndex` (`v3:879-951`). A later `ok`
    restore overwrites them.
- **`markCharacterForSave` and the restored-keys keep-list (F2)** are dropped. The race-fix
  premise was false (§5.2 item 4). After that fix, a restore lands only on the selected
  character, which is tracked for saving, so the targeted save mark is not needed.

### 5.5 Tests (extracted seams, no source-text guards)

**RED on today's code (must fail first):**
- plugin get: an `error` read rejects, and the message does not contain the value;
- plugin set: a failed write rejects;
- plugin set: a failed first write leaves no mapping;
- plugin set: a mapping recorded after a `clear` during the write goes into the live object;
- `preLoadChat` returns `'missing'` and makes no mutation;
- the character-switch race: switch during the read, then `'none'` and no mutation;
- plugin `sendChat` on a cold chat: rejects, with no push and no permission prompt.

**Regression guards (pass today, must keep passing):**
- plugin get: `ok` returns the value, `missing` returns `null`, no mapping returns `null`;
- plugin set: a failure with an existing mapping keeps the mapping;
- plugin set: `setItem(undefined)` then `getItem` gives `null`.

**New reader:**
- a stored `null` and a `{character}` blob are both `ok`;
- Tauri:
  - `os error 2` with `exists` false is `missing`;
  - `os error 2` with `exists` true is `error`;
  - an `exists()` throw is `error`;
  - `os error 3` is `error`;
- OPFS: `NotFoundError` is `missing`, and `TypeMismatchError` is `error`;
- Node: `null` is `missing`, and a throw is `error`;
- account:
  - network throw plus local `ok` is `ok`;
  - network throw plus local missing is `error`;
  - 401/500/204 plus local missing is `error`;
  - 200 with a corrupt body is `error`;
- corrupt compression or JSON is `error`.

**Bridge:** a host throw arrives as a rejection through `factory.ts`'s message handler, if it can
be tested without a real iframe. If not, record that it wasn't tested.

## 6. Out of scope, recorded (suspected, pre-existing)

- Multiuser sync may replace the host's chat after a failed guest load (`sync/multiuser.ts:141,147,321`).
- `cleanChunks()` is not awaited (`bootstrap.ts:292`), so assets added between `:576` and `:578`
  can be swept.
- Account mode: `keys()` omits the non-avatar assets of cold characters, so local backups can
  miss them (`backuplocal.ts:108`).
- `drive.ts:312` sync is incomplete on a failed read.
- Exports of a still-cold chat export only the pointer.
