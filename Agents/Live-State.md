# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For what finished stages leave for later ones, see `Agents/Carry-Forward.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-10-01.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It is pushed through `0a3fb2b0`.**
These later commits are local and not pushed:
- `d25a02fb`: CHORE-47's fix;
- `bb3f9e7b`: CHORE-47's records;
- `ccf45c53`: the chat-switch memory fix;
- `211e7603`: the records of the memory stage 1 plan, its gates and the real-profile findings;
- `2b3dd636`: memory stage 1 step 1, the exclusive manual clean-up (Report 50);
- `bc09a9a1`: the step 1 records and the Roadmap's Phase 2 status note;
- `db49aeeb`: memory stage 1 step 2, the v2 stub and the shared restore (Report 51);
- `d199b07b`: the step 2 records;
- `64f23154`: the manual clean-up reads saves that never used plugin storage (the empty-`pluginStorage` decoder fix);
- `96772e97`: the stage 1 live-check records and CHORE-50;
- `bd57aa19`: memory stage 1 step 3a, plugin and MCP reads and writes of
  archived characters (Report 52);
- the records commit that carries this file.

Push only at the maintainer's request.

The working tree is otherwise clean.
`Agents/Reports/37-chat-html-css-security-surface.md` is untracked. It belongs to another
session (probably "Q&A"; its header says read-only Q&A). Never stage it.

## Parallel sessions (2026-09-30)

Several sessions work **in this same checkout**:
- **"Main Campaign"** (this one) owns everything outside `wiki/`, including the `Agents/` records.
- **"Wiki"** owns `wiki/**` only. It writes nothing to `Agents/`; its findings, suspected bugs and
  questions go to the maintainer in its final report.
- **"Q&A"** is read-only. Its memory-footprint brief started the memory stages (`MC-130`), and it
  handed over the maintainer's real-profile measurement (ledger row 470).
- **"Fix Escape leaving a blocking alert unanswered"**, **"Fix Fullscreen setting error on web
  build"** and **"Fork rebranding exploration"** are idle or done; see Report 39/41 and ledger
  row 428.

**Next free numbers:** `MC-147`, Report 53, ledger row 509 and CHORE-51. Check the ledger's last row before taking
one. `MC-114` and ledger rows 371-374 were reserved for W2c-a and left unused; nobody
should fill them.

**Rules for every session:**
- stage by explicit path only;
- never `git add -A`, `stash`, `reset`, `checkout -- <path>` or `restore` on another session's files;
- commit and push only at the maintainer's request.

## Current work

### Resume here (hand-off, 2026-10-01, memory stage 1: steps 1, 2 and 3a done)

1. **Memory-footprint stage 1 is planned and passed Gate 1** (Report 49, `MC-130` to `MC-145`,
   ledger rows 455-486). **Step 1 is done:** the exclusive manual clean-up (D11) and no startup asset
   sweep once a stub exists (D12), committed as `2b3dd636` (Report 50; Gate 2 approved at round 3,
   ledger rows 487-491). **Step 2 is done:** the v2 stub and the shared restore (D6, D7, D9 restore
   side), committed as `db49aeeb` (Report 51; Gate 2 approved at round 2, then one editorial
   round, ledger rows 494-497). **Step 3a is done:** plugin and MCP reads and writes of archived
   characters (the seam that reads a stub's unit as a copy, no-downgrade in the plugin setters, restore
   first in V3 `setChatToIndex` and the seven MCP write tools, the V2.1 restore-all in `loadPlugins`,
   and the two `MC-091` amendments), committed as the step 3a fix commit (`bd57aa19`; Report 52;
   Gate 2 by `opus-reviewer` approved at round 3 after two [REJECT] rounds, ledger rows 505-507;
   `MC-146`). No live check of 3a was run. Step 3b and steps 4-7 are not started.
   - **Live check of steps 1 and 2 (ledger row 499):** the manual clean-up refused on a profile whose
     `pluginStorage` block is empty (row 500; upstream writes the same empty block). The decoder fix
     and its red-first tests are committed as `64f23154`. The fix passed its `opus-reviewer` gate
     (`[EDITORIAL]`, corrections applied; row 502) and was re-checked live on a scratch Node
     server; the manual clean-up then completed. CHORE-50
     (the first run of a new Node server fails until a reload) was filed from the same session.
   - The round-5 verdict was `[EDITORIAL]`. Its corrections were applied to the plan by the
     Orchestrator and not re-verified; Report 49's section 3 marks what was added after Gate 1.
   - Design:
     - characters are archived only by an exclusive boot pass;
     - an opened character stays loaded until the next page load;
     - an automatic idle reload releases what was opened (`MC-140`, `MC-141`);
     - there is no runtime archive engine (ledger row 475).
   - The working copy of the plan is in the session scratchpad (`memfoot/stage1c/plan.md`).
     Report 49 is the durable version.
2. **Next: implementation step 3b, groups, the Playground and the exports.** The Orchestrator split
   step 3 in two (Report 52 section 2). 3b is:
   - groups: `changeChar` restores a group's members on selection, `addGroupChar`, and `createNewChat`
     skipping a member that stays archived (`MC-146` 2: the group opens, the member stays archived, gets
     no greeting, is skipped in turns, and an alert names it);
   - the Playground: `playgroundChat` restores an archived `§playground` character before it mutates
     and selects it (`MC-146` 3); it does not go through `changeChar` (Report 52 section 2, R1);
   - `exportAsDataset` and `verifyAssetIntegrity` read a stub's unit one at a time (D5);
   - the labelled fork/upstream note for `getDatabase` returning placeholders in `risuai.d.ts` and
     `plugins.md` (`MC-136` 3).

   Gate 2 with `adversarial-reviewer`. 3b reuses 3a's seam (`readColdCharacterCopy`, the `quiet` option
   and the failure reasons of `restoreColdCharacter`, `coldCharacterAccess.ts`). The investigator's code
   map already covers the 3b areas (packet sections 4, 5 and 7, in the session scratchpad,
   `memfoot/step3/packet.md`), so the next step is the brief, then red tests first, the coder, then
   Gate 2. Steps 3 and 4 land before the boot pass (step 5), and the idle reload (step 6) comes after
   it. Open follow-ups: step 1's in Report 50 section 6, step 2's in Report 51 section 6 and step 3a's in
   Report 52 section 6 (among them: whether step 5's pass should enrich upstream-made stubs is a
   question for the maintainer at step 5; step 5 reuses `hasEnabledV21Plugin` and owns
   `loadInternalBackup`, which does not reload at HEAD).
3. **After stage 1** (`MC-145`):
   - the upstream-compatible inline-everything backup;
   - then archiving of modules that are not enabled;
   - then the rest of stage 2 (streamed backup);
   - stage 3 (the Node streamed write, CHORE-46) is re-measured first.
4. **Scratch tooling that stays useful:**
   - the synthetic generator's `real2` preset reproduces the maintainer's profile (ledger rows 476
     and 477);
   - the retainer measurement harness (rows 471 and 474);
   - the maintainer's read-only probe scripts (`shell-fields.cjs`, `profile-probe.cjs`,
     `chat-split.cjs`).

   All of these live in the session scratchpad, `memfoot/`.

## Work order

1. **Memory stage 1** (Report 49), steps 3b-7 (steps 1, 2 and 3a are done, Reports 50-52).
2. **The inline-everything backup, then module archiving** (`MC-145`).
3. **The wiki's composer and send batch** (Wiki session; unblocked since W2 and W3 are done).
4. **CHORE-35's opt-in stage:** the remaining upstream-infrastructure features (`MC-092`).

Not placed in the sequence:
- **CHORE-40** (the copy button's URL fetch): open; the Roadmap gives no position.
- **CHORE-41** (the edit-button bug): blocked on the maintainer's console output.
- **CHORE-43** (unreroll can write one chat's reply into another) and **CHORE-45** (the script cache
  misses on a repeat send in a long chat): filed, not scheduled. CHORE-45 waits for the memory work.
- **CHORE-46** (the Node server's 100 MB body limit): re-measure after stage 1 (Report 49).
- **CHORE-48** (inlays are never backed up): waits for the maintainer's answer.
- **CHORE-49** (the Node server does not boot over plain HTTP; `MC-144`): filed, not scheduled.
- **Follow-ups from the memory work** (Report 49, section 5):
  - switching to a chat whose cold-storage unit is missing still retains the previous chat's
    messages;
  - a rejected avatar image shows no icon.

`MC-089`: nothing ships until every open ticket clears.

## Open follow-ups, waiting on the maintainer

1. **A native-speaker check on the new translations.**
   - The translator suggested one for the German and Vietnamese `restoreNoLockWarningConfirm` (a
     data-loss warning) and the German `{{slot}}` phrasing.
   - For the manual clean-up (step 1), the translator flagged the consent and warning strings in
     every language; the maintainer accepted the Korean strings on 2026-09-30, so the native-speaker
     check remains for cn, zh-Hant, vi, de and es (Report 50 section 6).
   - Step 2 added one string, `coldStorageRestoreUnreadable`, to ko, cn, zh-Hant, vi, de and es. The
     reviewer checked the meaning; the native-speaker check is open for all six (Report 51 section 6).
   - Step 3a added four strings (`coldStorageNamedRestoreFailed`, `coldStorageNamedRestoreUnreadable`,
     `coldStoragePluginRestoreProgress`, `coldStoragePluginRestoreIncomplete`) to the same six
     languages. The reviewer checked the meaning. The translator's low-confidence notes: ko, the
     particle 을(를) after `${characterName}`; cn and zh-Hant, "N items left" (还剩 N 项 / 剩餘 N 項); vi,
     whether "đang được bật" reads as "the plugin is enabled", and "Chúng vẫn ở trạng thái lưu trữ";
     es, the file mixes tú and usted (Report 52 section 6).
2. **CHORE-41's console output** (ledger rows 201-202 and 206): why the edit button stays dead across
   repeated clicks.
3. **The MC-091 workflow pilot:** evaluating it is the maintainer's.
4. **CHORE-48:** should a backup carry inlays?
5. **Report 48's leads:**
   - odd `risuext` extension names;
   - the "missing" wording;
   - a partial file after an entry of 4 GiB or more.

## Finished stages

One row per stage. The Report's STATUS block holds the outcome and the ledger rows hold the
dispatches; `Agents/Carry-Forward.md` holds what a stage left for later ones. Earlier stages
(Phase 0 to durable drafts) are in `Agents/Roadmap.md`.

| Stage | Report | Fix commit(s) | Records commit(s) | Ledger rows |
|---|---|---|---|---|
| W0, identity (`chatIds.ts`, `chatOrigin.ts`) | 24 | `d7505e2f` | `b50c8974` | 164-172, 176-177 |
| CHORE-28, duplicate `chaId` save guard | 26 | `2420d717` | `21668b28` | 178-184 |
| CHORE-34, multiuser removal | 27 | `911376cb` | `c225643b` | 185-189 |
| CHORE-33, RisuAccount removal (28A, 28B, 28C) | 25, 28 | `e1dd839c`, `87b974e5`, `d2653123`; follow-ups `58f37298`; comment sweeps `57d1596a`, `2f6ce6d3` | `4aa29913`, `fd13d930`, `877d233b`, `9cbe2901` | 173-175, 190-200, 203-205, 207-216, 218-222, 224-225, 228 |
| CHORE-39, OPFS migration | 30 | `37898465` | `9cbe2901` (plan), `b7b1fd00` | 223, 226-227, 229-231 |
| Removal stage (Drive, dead code, `risuaiAccountCached`, Patreon; `MC-093`) | 31 | `2af8d4fe`, `a9c29ba7`, `237ebba1` | `e8500372` | 232-241 |
| Upstream sync (Svelte 5.56.8, zh-Hant, `{{slot}}` help) | none | `425080e6`, `f190d950`, `0efc3d22`, `4cdb5ef1` | `80c9128a` | 244-245, 248 |
| CHORE-42, local restore with other tabs open | 32 | `ce6bc594` | `80c9128a`, `2cdfb2b5` | 242-243, 246-247, 249-252 |
| W1a, every write a trigger run makes | 33 | `13ed2e75` | `490bdec2` | 253-264 |
| W1b, the parser and the read side | 34 | `22db8dfe` | `790643ff` | 265-271 |
| Composer stage (S0 hotkeys, S1 actions, S2 per-chat drafts; CHORE-44 folded into S2) | 22 | `b05231c6`, `1bc5f288`, `67f17f1a` | `2177f7d2`, `9ce59e0d` | 157-158, 272-286, 288-300 |
| Vitest excludes `.claude/**` | none | `7b72b813` | `127f84d1`, `d4b0262d` | none |
| Upstream batch (`MC-101`) | none | `3482ef4f`, `73edeb69`, `295c0fa7`, `5064bc4c`, `5c85cac7`, `0f38ac8c`, `9213ebc2` | `679e7ff4` | 287, 301-304 |
| W2a, a send writes into the chat it started in | 35 | `ec65c200` | `650dd97f` | 305-318 |
| W2b-core, one generation at a time | 36 | `ac8cb3da` | `6940a7b3` | 319-333 |
| W2b-previews | 38 | `8f93d095` | `5e4a2bfd` | 334-347 |
| Escape on alerts, stage 1 | 39 | `6631f5e0` | `9dee3ea9` | 348-354 |
| W2c-a, scripts, Lua edit triggers and lorebook | 40 | `79c6e35e` | `4576d07e` | 355-370 |
| Escape on alerts, stage 2 | 41 | `c0b323b0` | `d848ecdf` | 375-381 |
| W2c-b, prompt parses, persona and summaries | 42 | `9d493c79` | `dd41a43d` | 382, 384-392 |
| W2c-c, the prompt's index tags and hidden messages | 43 | `d27a1ee4` | `1e8c64f1` | 393-403 |
| W2d-a, the `request` trigger and the prompt's names (CHORE-27) | 44 | `4c34172c` | `86c1e806` | 404-416 |
| W2d-b, the tool path, graph memory, `risuaccess`, `aiaccess`, four request bugs | 45 | `efd417b9` | `c67bffed` | 417-427 |
| Fullscreen on web (its own session and worktree) | none | `51e923eb` | `61b5a885` | 428 |
| W3, `/` commands, `/multisend` and Post File on their own chat; the command bugs | 46 | `e07d32fb` | `26d57bdc` | 429-443 |
| W2e, a delete warns about and stops the work in its chat; a backup load is refused while busy | 47 | `baf238e7` | `7d4bc4b0` | 444-454 |
| CHORE-47, a local backup includes non-`.png` assets | 48 | `d25a02fb` | `bb3f9e7b` | 461-467 |
| The chat-switch memory fix (the sender icon's `{#await}`; `MC-136` 4) | 49 (section 6) | `ccf45c53` | the records commit after `ccf45c53` | 471, 474, 483 |

Escape on alerts stage 2 and W2c-a were merged as `1d6fa16b`.

## Operational notes for this environment

- **Git Bash here fails on heredocs, and on single commands longer than about 230 characters.**
  Write scripts with the Write tool, or use PowerShell. Commit with `git commit -F <file>`.
- **Git Bash rewrites any argument that begins with `/`** (MSYS path conversion). `git grep
  '/kei'` reported no matches when there were five. Prefix such commands with
  `MSYS_NO_PATHCONV=1`, or drop the leading slash from the pattern.
- **Tool grants** (`^tools:` in `.claude/agents/*.md`, checked 2026-09-30):
  - `opus-reviewer`, `adversarial-reviewer`, `investigator` and `deep-investigator` hold `Write`, for
    scratchpad files only (in effect since 2026-09-25); `perf-analyzer` also holds `Write`;
  - `doc-writer`, `sonnet-coder`, `test-warrior` and `translator` hold `Write` and `Edit`;
  - `code-searcher`, `code-reader`, `doc-verifier` and `senior-advisor` have neither;
  - `code-reader`, `investigator` and `deep-investigator` also hold `Agent`.

  Check the file before a brief promises a tool.
- **Tell every agent** to run shell commands from the scratchpad, never from the repo root, and
  never to use globs in `mkdir` or `cp`.
- **Mutants:** build them from the current source each round, through a scratch Vitest config
  that aliases the module. When swapping in HEAD versions of files, serve every changed file,
  including the `./en` import.
- **`pnpm remove`/`add` backfill `libc:` metadata** into unrelated lockfile entries (pnpm
  10.34.1). Strip the added lines so the lockfile diff is only the intended change, then validate
  with `pnpm install --frozen-lockfile --offline`.
- **Line endings.** The `Agents/` documents are LF in the index. With `core.autocrlf=true`, a
  checkout that rewrites a file leaves it CRLF in the working tree. That is harmless to git, which
  normalises on commit, but normalise it back to LF when you edit. After any edit run
  `git ls-files --eol <file>`: it must say `w/lf`. Judge counts by `git diff --numstat` and git's
  "LF will be replaced" warnings, not by Git Bash `grep`/`od` counts, which misreported twice.

## Open items

- **Possibly still present:** `C:\Projects\scratch_investigator_tmp` (empty) and
  `Temp\claude\coldstorage.svelte.ts.bak`. The maintainer deleted `%TEMP%\qa1`.
- **Scratch trees with `node_modules` junctions.** Remove each junction with `cmd /c rmdir` before
  any recursive delete.
- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists.
- **Card description contrast** (`text-textcolor2` on the home cards) measured 3.32:1 in a live check
  on 2026-09-23 (`fe90145e`), for one colour scheme. A maintainer decision; not raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).
- **"Backup & Files" still uses the old account tab's person icon** (`UserIcon` in
  `Settings.svelte`; cosmetic, not recorded elsewhere).

## Test suite

- **Step 3a's final tree (the step 3a fix commit, `bd57aa19`):** 216 files, 3,680 passed, 4 skipped;
  `pnpm build` exit 0 (ledger row 507; both on the snapshot Gate 2 approved); `pnpm check` 0 errors and
  0 warnings on the final tree, after the post-approval edits (`3a/gate/check-final.log`). The full suite
  and the build were not re-run after the editorial edits to two test headers and the commit message;
  the two edited test files were, 4 passed.
- **Step 2's final tree (`db49aeeb`):** 209 files, 3,559 passed, 4 skipped; `pnpm check` 0 errors;
  `pnpm build` exit 0 (ledger row 497; taken before the round-3 comment-only edits). Step 1's tree
  (`2b3dd636`) had 205 files, 3,436 passed, 4 skipped (row 490). The baseline before step 1 was W2e's
  `baf238e7`: 198 files, 3,269 passed, 4 skipped, 0 failed (row 452).
- `cargo check` last ran on the removal stage.
- Run the suite with plain `pnpm test` or `npx vitest run`. `vitest.config.ts` excludes
  `.claude/**` (`7b72b813`).

## How to live-check this app

- **OPFS is not offered on the Node server.** To live-check the OPFS switch, build as below, then
  serve `dist` with `pnpm run preview -- --port 4173 --strictPort` in the background and use a
  Chrome window at least about 1300 px wide (narrower windows hide the Settings menu behind the
  list button). Stop it by the PID listening on 4173. The localhost:4173 origin holds only
  throwaway test data.

- **Default method: the built-in pane, on a scratch Node server.** Observed 2026-10-01 (ledger row
  501).
  1. **Build for production.** Run `pnpm run build` with `$env:VITE_RISU_LEGAL_CONFIGURED='TRUE'`
     set for that one PowerShell command only. The maintainer approved this on 2026-09-25.
  2. **Start the scratch server.** `server/node/server.cjs` resolves `dist` and `save` from its
     working directory. Make a scratchpad folder holding a junction `dist` to the repo's `dist` and
     an empty `save`. Set `PORT=6011` and run `node C:\Projects\RisuAI\server\node\server.cjs` from
     that folder, as a background process. The repo's `save/` is not touched, so no backup or
     restore is needed.
  3. **Open the pane with `preview_start`** on the `risuai-prod-scratch` entry of
     `.claude/launch.json` (attach-only: `http://localhost:6011`, port 6011, no command). **Never use
     plain `navigate` for the first open.** A pane tab opened that way stops at "Checking Service
     Worker..." with "Failed to register a ServiceWorker ... An unknown error occurred when fetching
     the script"; the pane's network log shows no `sw.js` request, while `curl` gets `/sw.js` with
     200 `application/javascript`. A tab opened with `preview_start` registers the service worker
     and boots.
  4. **Reload with `navigate` and `force: true`.** The Node build's leave-site prompt blocks a
     plain reload; `force` passes it.
  5. **First run on an empty `save`:** the app asks "Set your password to security", and after the
     password is entered the boot stops with the alert "getItem Error" (CHORE-50, open). Reload,
     and enter the same password at "Input your password..."; it then boots. Keep the test
     password in the scratchpad, never in chat or in the docs.
  6. **`tabs_context` reports whether the pane is displayed.** In a displayed pane the page is
     `visible`, and `requestAnimationFrame` and `IntersectionObserver` callbacks fire.
  7. **Stop the server by the PID listening on 6011** and confirm the port is closed.
- **Model:** Echo needs no API key. In the model picker it sits under "For Developer" once "show
  unrecommended settings" is ticked.
- **Settings:** restore any setting you change, or use a fresh scratch `save` for the next check.
- **Network:** do not probe upstream services (`MC-081`).
- **A delayed model with no network:** register a probe with `__pluginApis__.addProvider(name, async
  (arg, abortSignal) => ...)` that records the call and its abort, then pick "Plugin Legacy" (behind
  "show unrecommended settings") and choose it in the plugin select; set the auxiliary model to Echo.
  A confirmation that must land during the wait goes in the same `browser_batch` as the send, and
  the delay must outlast every confirmation (W2e's first 10 s probe finished before the second one).
- **Seeding test data.** Use `globalThis.__pluginApis__.getChar()` / `setChar()` on the main page
  to set a field on the selected character; a fresh scratch `save` (or the `save/` restore, in the
  fallback) undoes it. **Never switch the model this way.** `setDatabaseLite` did not reach the send
  path, and a test message went to the profile's default provider (row 205). Use the model picker.

### Fallback: Claude in Chrome, against the repo's `save/`

Use it when the pane cannot do the check. Its caveats:
- **Start the server yourself.** Run `pnpm run runserver` (port 6001) as a background process, after
  the production build above.
  - Do not point the built-in pane at this server (no `preview_start` on it). It would open the app
    on the same server storage, making a second writer.
- **The Node server's data is `save/`** (gitignored). It is a near-empty throwaway, not the
  fixture.
  - Before the check, copy it to the scratchpad.
  - Afterwards, stop the server and restore it. Verify the restore by hash, and move any file the
    test created out rather than deleting it.
  - The `save/` restore also covers the Node server's settings.
- **Claude in Chrome opens its tab in the background**, so the page starts hidden. Ask the
  maintainer to bring that window and tab to the front before the first click.
- **The leave-site guard prompts on every reload of the Node build**, by design
  (`preload.beforeUnload.test.ts`). In Chrome a forced navigation does not get past it, and closing
  the tab hangs the tool.
  - Confirm the save reached `save/` (mtime and `__revisions.json`), then ask the maintainer to
    refresh or close the tab.
  - Close the tab before the server restarts, or it can write stale state back.
- **Stopping the server.** `TaskStop` on `pnpm run runserver` kills only the pnpm wrapper. The
  `node server/node/server.cjs` child keeps listening on port 6001. Stop it by PID, and confirm
  the port is closed before restoring `save/`.
- **A hidden Chrome window.** When `document.visibilityState` is `hidden`:
  - screenshots time out;
  - chained timers are throttled, so `waitAlert` loops can take up to about a minute.

  Page scripts still work. Clicks via `element.click()` and page reads were enough for 28B's and
  28C's checks.
