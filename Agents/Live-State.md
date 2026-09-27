# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-25 to 2026-09-26.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It is pushed and in sync with
`origin/fix/persistence-conflict-platform-hardening` at `877d233b`.**
- `911376cb`: CHORE-34, the multiuser removal.
- `c225643b`: the CHORE-34 records and the RisuAccount stage setup.
- `4aa29913`: the CHORE-33 plan (Report 28) and its decisions.
- `e1dd839c`: CHORE-33 28A, the importer refusal.
- `87b974e5`: CHORE-33 28B, the RisuAccount removal.
- `57d1596a`: the comment sweep (first pass), separate from CHORE-33.
- `d2653123`: CHORE-33 28C, the upstream-service agreement at first use.
- `fd13d930`: the MC-091 workflow-pilot adoption, and the 28C/MC-090 records.
- `877d233b`: 28C's live check (ledger row 221) and editorial re-check (row 222) records.

**Uncommitted, by the maintainer's instruction, never staged:** the parallel wiki session's
`wiki/Settings-*.md` (untracked), `wiki/Home.md` and `wiki/_Sidebar.md` (modified).

**Committed 2026-09-26, after `877d233b`, at the maintainer's go:** the 28C optional follow-ups
(ledger row 225), the second comment-sweep pass (row 228), and these records (CHORE-33 closed in
the Roadmap and Reports 25/28, CHORE-35 to CHORE-41 filed, MC-092, Report 30, ledger rows
223-228).

**Committed 2026-09-26/27:** CHORE-39 (`37898465`) and its records (ledger rows 229-231, Report
30, the Roadmap, this file). Pushed (`b7b1fd00`).

**Committed 2026-09-27, not pushed:** the removal stage (`2af8d4fe`, `a9c29ba7`, `237ebba1`) and its
records (Report 31, ledger rows 232-241, `MC-093`, the Roadmap, this file).

## CHORE-33 (RisuAccount removal): done

28A, 28B and 28C are all committed (`e1dd839c`, `87b974e5`, `d2653123`) and live-checked (ledger
rows 200, 205, 221). The plan is final at Report 28 rev 3.6
(`Agents/Reports/28-risuaccount-removal-plan.md`). **Gate 1 (rows 193-197) gated the whole
three-sub-stage plan.** For how each sub-stage was built and gated after that, see that report's
STATUS block and section 11, and ledger rows 198 to 222:
- **28A** (the importer refusal): Gate 2 rows 198-199; live check row 200.
- **28B** (the removal): Gate 2 rows 203-204; live check row 205.
- **28C** (agreement at first use of Realm or Drive): red tests rows 209-210; implementation row
  211; Gate 2 rounds 1-2 rows 213-214 (both substantive rejections); round 3 (row 215) was
  interrupted by a process exit before a verdict, though its scenarios found two more leaks
  (E2/E4) in the same load logic; the `senior-advisor` escalation on the placeholder-control load
  logic, row 216 (instead of a fourth revision); the Invariant A/B rework rows 218-219; Gate 2 on
  the new design and its editorial re-check, rows 220 and 222.
- **The comment sweep** (row 212) is a separate commit (`57d1596a`), not part of CHORE-33.

## Open follow-ups, waiting on the maintainer

1. **Hand the wiki session its list**: Report 28 section 10's hand-off list, plus the 28C
   additions — `Settings-Chat-Bot.md` (the preset "upload to Realm" now asks for the agreement
   first) and `Settings-Display.md` (the placeholder under "Hide RisuRealm"). Do not edit
   `wiki/Settings-Account-and-Files.md`; it belongs to the parallel wiki session.
2. **The three optional Gate 2 follow-ups** (row 220) are done and committed (row 225).
3. **The second comment-sweep pass** is done and committed (row 228). Left for a later pass:
   `globalApi.svelte.ts` cites "ledger row 61" for a timing claim that rows 63 and 79 carry; fix it
   when CHORE-39 edits that file.
4. **CHORE-35 to CHORE-40** (Report 28 section 3.5's six out-of-scope items) are filed as Roadmap
   tickets. MC-092 (2026-09-26) decided CHORE-36 (remove Google Drive backup, superseding MC-080's
   "keep Drive"), CHORE-38 (clear `risuaiAccountCached`, no recovery) and the Patreon-list part of
   CHORE-35's scope (removed); the rest of CHORE-35 (the remaining upstream-infrastructure
   features) becomes opt-in, its own stage after W1. MC-089 says nothing ships until every open
   ticket clears.
5. **CHORE-41, the edit-button bug** (was MC-090, now filed as a ticket). The mechanism is found
   (ledger rows 201-202): `Chats.svelte` mounts one `Chat` per visible message, keyed by a hash of
   the message's data, id, index and flags, plus `ReloadChatPointer[index]`; `editMode` is local
   state, so any change to that hash remounts the message and silently drops the editor. This is
   present in both upstream and this fork; the maintainer's supplied plugins were ruled out.
   **Still open:** why the button stays dead across repeated clicks (workflow
   `edit-button-stuck-state-investigation`, ledger row 206, found a likely cause — an uncaught
   synchronous error during the edit-mode branch's mount, caught by no `<svelte:boundary>` — but
   the throw site itself is not found; the maintainer's console output is needed). Blocked on
   that console output.
6. **The MC-091 workflow pilot continues** over the next 5-10 items. 28C's Gate 2 was its first
   use of the `[EDITORIAL]` outcome and of reviewer continuity for a re-check.

## Work order

**Done and committed:** W0 (identity); CHORE-28 (Report 26); the multiuser removal (CHORE-34,
`MC-074`/`MC-083`, Report 27, `911376cb`); the RisuAccount removal (CHORE-33, `MC-080`/`MC-081`,
Report 25/28, see above).

**Current order (`MC-092`, 2026-09-26):**

1. **The records** — done, committed.
2. **The three optional 28C Gate 2 follow-ups** — done, committed (row 225).
3. **The second comment-sweep pass** — done, committed (row 228).
4. **CHORE-39** (OPFS migration) — done, committed (`37898465`); Gate 2 rows 229-230, live
   check row 231.

5. **The removal stage** — done, committed (`2af8d4fe`, `a9c29ba7`, `237ebba1`). Report 31: Drive
   (CHORE-36), dead code (CHORE-37, plus the Communities page, `MC-093`), `risuaiAccountCached`
   (CHORE-38), the Patreon page, and a lock on the local restore write.

**Next: step 5a, CHORE-42** (`MC-093`: refuse, or at least warn about, a local restore while
other tabs are open). It follows from the removal stage's restore lock and is being scoped.
6. **W1: engine binding.** This closes CHORE-25 and CHORE-26. Then the composer stage (Report 22
   rev 3), then W2 and W3.
7. **CHORE-35's opt-in stage** (the remaining upstream-infrastructure features: `/proxy2`'s
   static-web default, the transformers CDN, the MCP OAuth helper, `#import=<url>`,
   `getProxyStreamJobBaseUrl`), after W1.

CHORE-40 (the copy-button URL fetch) is not placed in this sequence; CHORE-41 (the edit-button
bug) is blocked on the maintainer's console output, not scheduled by position.

## CHORE-34 facts later stages rely on

- **`src/ts/sync/` no longer exists.** `peerjs` is gone from the dependencies. Nothing reads
  `ConnectionOpenStore`.
- **`saveAsset`'s custom-id parameter** has no production caller.
  - `verifyAssetCacheEntry` judges a 64-hex custom id as a content hash, so a caller must never
    pass a 64-hex id that is not the hash.
  - A `uuidv4()` name, the fallback on non-secure origins, reports 'not-content-addressed'.
- **`checkCharOrder`'s `§temp` exclusion** is the only remaining `§temp` reference, and T1 pins it
  (`src/ts/checkCharOrder.tempCharacter.svelte.test.ts`). Upstream saves can carry such a
  character.
- **Upstream facts:**
  - upstream still ships multiuser (`upstream/main`, 2026-09-23);
  - upstream never writes `Message.otherUser`;
  - user messages without `name` already exist upstream.

## CHORE-28 facts later stages rely on

- **`RisuSaveEncoder` (`risuSave.ts`):**
  - Each `init`/`set` pass takes one copy of the character list at its start.
  - It counts holders by `String(chaId)` and encodes each key at most once.
  - A key with two or more holders is frozen: its block is kept unchanged, taken out of
    `toSave.character` and never deleted.
  - A never-saved duplicate writes its first holder once.
  - `init({ previous })` reuses the replaced encoder's block only for a key duplicated in its own
    snapshot.
  - `getFrozenKeys()` exposes the frozen set.
- **Marks.** `toSave.character` can hold raw, non-string `chaId` values (`frontUnshiftSelected`,
  `appendIfAbsent`). The encoder compares marks by `String()`. **Never convert the list to strings
  in place:**
  - `mergeUnsavedChanges` folds it back into the live tracker after a failed write;
  - `prepareSaveIteration`'s no-reload filter compares raw values, so the mark would be dropped.
- **`globalApi.svelte.ts`:**
  - `reloadSaveEncoder` is the shared reload hand-over.
  - `checkFrozenKeysForResolution` is the idle step.
  - `publishFrozenSaveIndicator` feeds `frozenSaveKeysStore`, which `SavePopupIcon.svelte`
    renders. The RisuAccount removal edited that file too, because it imported `AccountWarning`
    (Report 25 invariant 4). The frozen-key indicator is kept.
  - The save loop's calls to the last two are covered by review only.
- **Resolving a duplicate.** A normal delete only trashes a character, so the key stays duplicated.
  A permanent delete resolves it. `removeChar` and `restoreCharacterFromTrash` accept the
  character object, and the grid uses that form.
- **Cold storage.** `cleanColdStorage` refuses while any key is frozen.

## W0 facts the next stages rely on

- **`src/ts/process/chatIds.ts`:**
  - pure fill, repair and duplicate warnings;
  - a missing id is always fresh;
  - `repairDatabaseIds` runs at boot and on every decoded backup before install, including the
    local `.bin` restore. W0 also added it to `loadRisuAccountBackup` (`drive/accounter.ts`) and
    `autoServerBackup` (`kei/backup.ts`). Those calls went with the functions the RisuAccount
    removal deleted. **The local `.bin` restore's call stays.**
- **`src/ts/process/chatOrigin.ts`:** a target that is gone or held twice is skipped (`MC-075`,
  `MC-078`). There is no production caller yet; W1 binds the first.
- **W1 must:**
  - call `beginWork` only with objects read back through `DBState`;
  - resolve once per synchronous batch;
  - report the Lua and CBS resolution counts;
  - measure a production build with throttling;
  - prove that `runTrigger`'s whole-clone commit cannot drop a message.

## Operational notes for this environment

- **Git Bash here fails on heredocs, and on single commands longer than about 230 characters.**
  Write scripts with the Write tool, or use PowerShell. Commit with `git commit -F <file>`.
- **Git Bash rewrites any argument that begins with `/`** (MSYS path conversion). `git grep
  '/kei'` reported no matches when there were five. Prefix such commands with
  `MSYS_NO_PATHCONV=1`, or drop the leading slash from the pattern.
- **Four agents hold `Write`, for scratchpad files only:** `opus-reviewer`,
  `adversarial-reviewer`, `investigator` and `deep-investigator` (in effect since 2026-09-25).
  `code-searcher`, `doc-verifier` and `senior-advisor` lack it. Check `^tools:` in
  `.claude/agents/*.md` before a brief promises a tool.
- **Tell every agent** to run shell commands from the scratchpad, never from the repo root, and
  never to use globs in `mkdir` or `cp`.
- **Mutants:** build them from the current source each round, through a scratch Vitest config
  that aliases the module. When swapping in HEAD versions of files, serve every changed file,
  including the `./en` import.
- **`pnpm remove`/`add` backfill `libc:` metadata** into unrelated lockfile entries (pnpm
  10.34.1). Strip the added lines so the lockfile diff is only the intended change, then validate
  with `pnpm install --frozen-lockfile --offline`.
- **Line endings.** The `Agents/` documents are LF. With `core.autocrlf=true`, git normalises line
  endings, so a CRLF conversion in the working tree does not show in `git diff`. Check
  `git ls-files --eol <file>` after editing — it must say `w/lf`. (Two files were silently
  converted to CRLF this session and have been restored.) Judge counts by `git diff --numstat`
  and git's "LF will be replaced" warnings, not by Git Bash `grep`/`od` counts, which misreported
  twice.

## Open items

- **Possibly still present:** `C:\Projects\scratch_investigator_tmp` (empty) and
  `Temp\claude\coldstorage.svelte.ts.bak`. The maintainer deleted `%TEMP%\qa1`.
- **Scratch trees with `node_modules` junctions.** Remove each junction with `cmd /c rmdir` before
  any recursive delete.
- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists.
- **Card description contrast is 3.32:1.** This is a maintainer decision and has not been raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).
- **"Backup & Files" still uses the old account tab's person icon** (cosmetic; noted in Report 28
  section 11.2, not fixed there).

## Test suite

**127 files: 1535 passed, 4 skipped, 0 failed** — the check on the removal stage's final tree
(`237ebba1`). `pnpm check` is clean; `pnpm run build` and `cargo check` pass.
- Run the suite with `npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.
  Plain `pnpm test` also picks up `.claude/worktrees/**`.

## How to live-check this app

- **OPFS is not offered on the Node server.** To live-check the OPFS switch, build as below, then
  serve `dist` with `pnpm run preview -- --port 4173 --strictPort` in the background and use a
  Chrome window at least about 1300 px wide (narrower windows hide the Settings menu behind the
  list button). Stop it by the PID listening on 4173. The localhost:4173 origin holds only
  throwaway test data.

- **Use Claude in Chrome, not the built-in pane.** The service worker kills the boot in the pane.
- **Build for production.** Run `pnpm run build` with `$env:VITE_RISU_LEGAL_CONFIGURED='TRUE'`
  set for that one PowerShell command only, then start `pnpm run runserver` (port 6001) yourself
  as a background process. The maintainer approved this on 2026-09-25.
  - Do not use `preview_start`. It would open the app in the built-in pane on the same server
    storage, making a second writer.
- **The Node server's data is `save/`** (gitignored). It is a near-empty throwaway, not the
  fixture.
  - Before the check, copy it to the scratchpad.
  - Afterwards, stop the server and restore it. Verify the restore by hash, and move any file the
    test created out rather than deleting it.
- **Model:** Echo needs no API key. In the model picker it sits under "For Developer" once "show
  unrecommended settings" is ticked.
- **Settings:** restore any setting you change. The `save/` restore covers the Node server's
  settings.
- **The leave-site guard prompts on every reload of the Node build**, by design
  (`preload.beforeUnload.test.ts`). A forced navigation does not get past it, and closing the tab
  hangs the tool.
  - Confirm the save reached `save/` (mtime and `__revisions.json`), then ask the maintainer to
    refresh or close the tab.
  - Close the tab before the server restarts, or it can write stale state back.
- **Network:** do not probe upstream services (`MC-081`).
- **Stopping the server.** `TaskStop` on `pnpm run runserver` kills only the pnpm wrapper. The
  `node server/node/server.cjs` child keeps listening on port 6001. Stop it by PID, and confirm
  the port is closed before restoring `save/`.
- **A hidden Chrome window.** When `document.visibilityState` is `hidden`:
  - screenshots time out;
  - chained timers are throttled, so `waitAlert` loops can take up to about a minute.

  Page scripts still work. Clicks via `element.click()` and page reads were enough for 28B's and
  28C's checks.
- **Seeding test data.** Use `globalThis.__pluginApis__.getChar()` / `setChar()` on the main page
  to set a field on the selected character; the `save/` restore undoes it. **Never switch the
  model this way.** `setDatabaseLite` did not reach the send path, and a test message went to the
  profile's default provider (row 205). Use the model picker.
