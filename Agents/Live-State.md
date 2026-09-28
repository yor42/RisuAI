# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-25 to 2026-09-27.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It is pushed through `2cdfb2b5`;
`4cdb5ef1` is committed on top and not pushed.**
- Earlier stages: CHORE-34 `911376cb`; CHORE-33 `e1dd839c`, `87b974e5`, `d2653123`; CHORE-39
  `37898465`. Their records run to `b7b1fd00`.
- The removal stage (Report 31):
  - `2af8d4fe`: dead code, including the Communities page;
  - `a9c29ba7`: the Patreon page;
  - `237ebba1`: Drive removed, leftovers cleared at boot, and the local restore lock;
  - `e8500372`: the records, and `MC-093`.
- The upstream sync:
  - `425080e6`: Svelte 5.56.8;
  - `f190d950`: zh-Hant, from upstream;
  - `0efc3d22`: the `{{slot}}` help text in every language;
  - `4cdb5ef1`: the maintainer's own rewording of the Korean `{{slot}}` note.
- CHORE-42 (Report 32): `80c9128a` (plan records), `ce6bc594` (the fix) and `2cdfb2b5` (its records).

## Parallel sessions (from 2026-09-27)

Two sessions work **in this same checkout at once**, started from the maintainer's hand-off prompts:
- **The W1 session** owns everything outside `wiki/`, including all `Agents/` records.
  - The next ledger row is 253 and the next report is 33.
  - It lists the wiki pages W1 makes stale, and does not edit them.
- **The wiki session** owns `wiki/**` only, including the earlier wiki session's uncommitted
  `wiki/Settings*.md`, `wiki/Home.md` and `wiki/_Sidebar.md`.
  - It writes nothing to `Agents/`. Its findings, suspected bugs and questions go to the
    maintainer in its final report.
  - Its hand-off covers:
    - Report 28 §10's list and the 28C additions;
    - Report 31 §7;
    - CHORE-42's refusal and warning;
    - CHORE-39's switch notices;
    - the `{{slot}}` help text.
- **Rules for both:**
  - stage by explicit path only;
  - never `git add -A`, `stash`, `reset`, `checkout -- <path>` or `restore` on another
    session's files;
  - commit and push only at the maintainer's request.

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

1. **The wiki hand-off** was given on 2026-09-27 to the parallel wiki session (see "Parallel sessions" above).
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
   - **Status (2026-09-27):** CHORE-36, CHORE-37, CHORE-38 and the Patreon removal are done
     (Report 31). CHORE-42, which came out of that stage, is done too (Report 32). CHORE-40 is
     still open, and CHORE-35's opt-in stage follows W1.
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
6. **A native-speaker check on the new translations.** The maintainer reviewed the Korean
   (`4cdb5ef1`). The translator suggested that the German and Vietnamese
   `restoreNoLockWarningConfirm`, a data-loss warning, and the German `{{slot}}` phrasing get a
   native check.
7. **The MC-091 workflow pilot continues** over the next 5-10 items. 28C's Gate 2 was its first
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

5a. **CHORE-42** (`MC-093`: refuse, or warn about, a local restore while other tabs are open). Done,
   committed as `ce6bc594` (Report 32; Gate 2 rows 249-250; live check row 251). It adds a per-origin
   storage epoch to `storageTabLocks.ts`. It also fixes `237ebba1`'s cancellable restore reload.

**Next: step 6, W1** (engine binding), per the order below.

**Upstream sync (2026-09-27):** Svelte 5.56.8 (`425080e6`, ledger rows 244-245) and upstream's zh-Hant
improvements (`f190d950`, row 248) are merged. `upstream/main` has nothing newer as of this date.
6. **W1: engine binding, done.** W1a is committed (`13ed2e75`), W1b (`22db8dfe`). `MC-094` split it into W1a and W1b.
   - **W1a:** every write a trigger run makes. It closes CHORE-25 and CHORE-26. Its plan will be
     Report 33.
   - **W1b:** the read side and the parser. Its plan is Report 34. `MC-095` moves the send's own
     parser calls, `{{setvar}}` writes, lorebook call and graph memory to W2.
   - After W1: the composer stage (Report 22 rev 3), then W2 and W3.
   See "W1 state" below.
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

## W1 state (2026-09-27)

- **Scoping:** ledger rows 253-254. **Escalation:** row 255 (`senior-advisor`).
- **Decision: `MC-094`.**
  - A trigger run has no commit step (W-2′, superseding Report 23's W-2 and `MC-076`'s "whole-object
    commit stays"). Each change is applied to the origin's live target when the effect runs.
  - The clones go, and `runTrigger` returns no `chat`.
  - W1 splits into W1a (writes) and W1b (reads and the parser).
- **Why:** at HEAD, a send or edit made in a chat while a manual trigger awaits is lost to
  `setCurrentChat(clone)`. That trigger sets no `doingChat`.
- **Pre-plan work in flight:**
  - row 256, `investigator`: the W1a mechanism inventory (awaits, in-place normalisations, result
    consumers, origins per caller, display mode, tests);
  - row 257, `perf-analyzer`: a throttled production measurement in headless Chrome of the clone,
    proxy reads, resolution and the memo.
- **Report 33 rev 3.1** (the W1a plan): **Gate 1 passed** (rows 258-260: two substantive
  rejections, then an editorial round; the reviewer was reused).
- **Build, tests first:**
  1. the seam: `src/ts/process/sendCharacterMessage.ts`, extracted from `sendMain` with no
     behaviour change; the suite stays at the baseline. Done, uncommitted. That coder ran
     `git add -N` and a bare `git reset`. The index was empty at the time, and the wiki session
     has been warned;
  2. the red tests (`test-warrior`):
     - First writer (~562k): three suites, `triggerOriginWrites.svelte.test.ts`,
       `sendCharacterMessage.svelte.test.ts` and `Chat.triggerOriginWrites.svelte.test.ts`. At HEAD
       29 fail and 10 pass (the guards). The Orchestrator re-ran them.
     - Gaps: the seam suite failed on the return value rather than on behaviour, and the
       real-engine `sendChat` suite (tests 10, 21, and 12/13's `sendChatBody` half) was not
       written.
     - A second writer (~378k) finished both and added a Lua-button guard. There are four suites,
       adding `src/ts/process/tests/sendChatTriggerWrites.svelte.test.ts`.
     - The Orchestrator re-ran them: **at HEAD 35 fail (34 on behavioural or contract assertions,
       one on its then-missing test export), and 12 pass (eight guards, three specification
       tests, one diagnostic; ledger row 264).** The first writer's "all LF" claim was false: three of its
       files are CRLF. Each file is internally consistent, and autocrlf normalises them;
  3. the implementation (a separate `sonnet-coder`, ~518k): done.
     - It left 2 failures, both test defects, which a test writer fixed and re-proved red against
       HEAD through scratch alias configs. The module-stamping test moved to
       `src/ts/process/tests/modulesTriggerStamping.svelte.test.ts`.
     - Plan rev 3.2 aligned §3's gone-member rule for `upsertLocalLoreBook` with T4.
     - Orchestrator checks on the pre-gate snapshot: **135 files, 1604 passed, 4 skipped, exit
       0**; `pnpm check` clean; `pnpm run build` passes;
  4. **Gate 2 round 1 (row 261): [REJECT].**
     - B1: the Lua path never marks for save.
     - B3: a gone member collapses to the owner, which feeds nested triggers and image generation.
     - B2: mutants survive, and tests are missing.
     - T9: `{chara}` is read after an await.
     - Editorial fixes in production comments and tests.
     - The remediation runs tests first:
       - The test writer (~313k) is done. Its six reproducers (B1 ×4, B3 ×2) are red on the
         current tree, which the Orchestrator re-ran. The mutant-killers pass, and the test
         editorials are applied. It made and deleted a probe file inside `src/ts/process/`,
         against the rules; nothing is left.
       - The implementer fixed B1, B3, T9 and the four production comments.
       - A further gap was found and closed tests-first. Lua `setChatVar` in a call with an
         origin (the Lua button) still used the selection-bound `chatVar`. `runScripted` now
         gives such a call origin-bound defaults.
       - Orchestrator checks: **135 files, 1625 passed, 4 skipped, exit 0**; `pnpm check`
         clean; history grep 0.
       - **Gate 2 round 2 (row 262): [EDITORIAL]**, closed by the Orchestrator after verifying
         E-a to E-d. Two optional mutant-killers were added. **Gate 2 passed.**
       - Final snapshot: **135 files, 1628 passed, 4 skipped, exit 0**; `pnpm check` clean; the
         build passes.
  5. **Live check passed (row 263).** It covered the CHORE-25 switch, a send during a button
     trigger's wait, and the CHORE-26 group, on a production build with Echo. `save/` was restored
     and hash-verified. The maintainer closed the Chrome tab on localhost:6001; the server is
     stopped.
  6. **The records are updated:**
     - Report 23: W-2 is superseded by W-2′.
     - Report 24: O-6 and §10 are annotated.
     - Roadmap: CHORE-25 and CHORE-26 are fixed; CHORE-27's bullet is corrected.
     - Ledger row 253 is corrected.
  7. **The commit-message fact-check (row 264): [EDITORIAL], applied.** The final draft is in the
     scratchpad (`w1a-commit-msg.txt`). The stale wiki claims are listed in Report 33 §13 for the
     maintainer. **Committed on the maintainer's request (2026-09-28): the fix as `13ed2e75`, then these
     records.**
  8. **Next after the commit: W1b** (CBS variables, `loadLoreBookV3Prompt`, `graphmem.ts`, the Lua
     read bindings, `infunctions.ts`, the render-time subjects), then the composer stage, W2 and W3.
- **To update in the plan's records:**
  - Report 23: W-2′ supersedes W-2.
  - Report 24: strike §10's last bullet and O-6's "W1 uses `commitChat`".
  - Roadmap: CHORE-25 and CHORE-26.
- **For W2:**
  - `findCharacterbyIdwithCache` may hand `sendChat` a non-live member.
  - Roadmap CHORE-27's claim that 8 of the 9 effects write live during a `request` run is false.
    The `request` and `display` allowlists exclude them (ledger row 256). Correct CHORE-27's
    entry with W1a's records.

## W1b state (2026-09-28)

- **Done: committed as `22db8dfe`** (the fix and tests), then the records. Report 34 rev 2.3;
  ledger rows 265-271; `MC-095` (the send's reads, `{{setvar}}` writes, lorebook call and graph
  memory go to W2).
- Gate 1: rows 266 ([REJECT]) and 267 ([EDITORIAL]). Gate 2: rows 268 ([REJECT], tests only) and
  269 ([EDITORIAL]). Live check: row 270. Commit-message check: row 271.
- **R3 exceptions** (read-only, recorded in Report 34 section 4):
  - with no current character or chat, a few tags return a value where HEAD threw;
  - with no origin, Lua `getLoreBooksMain` reads the call's held chat.
- **For W2:**
  - The `GLGlobalVariables` subject branches (`setGlobalChatVar` and the rest) have no caller
    with a subject yet. With a gone subject, `setGlobalChatVar` writes the database-wide global
    even when the origin chat had a local override. W2 must decide that.
  - `@@inject`/`@@repeat_back` need `chatID !== -1`; they belong to the send.
- **Stale wiki claims:** the `doc-verifier` list went to the Wiki session, at the maintainer's
  request.
- **Next:** the composer stage (Report 22 rev 3), then W2 and W3.

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

**130 files: 1557 passed, 4 skipped, 0 failed** — the check on CHORE-42's final tree (`ce6bc594`).
`pnpm check` is clean, and `pnpm run build` passes. `cargo check` last ran on the removal stage.
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
