# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For what finished stages leave for later ones, see `Agents/Carry-Forward.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-30.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It is pushed through `ae19db8d`
(`origin` is at that commit). HEAD is W2e's records commit, the one after `baf238e7`, 50
commits ahead, and nothing after `ae19db8d` is pushed.** Push only at the maintainer's request. They
relayed on 2026-09-29, through the Escape session, that they expect to ask once W2 is complete.

The unpushed commits, by stage (`git log --oneline ae19db8d..HEAD`; fix commit first, then its
records commit where there is one):
- **The wiki commits:** `bac50442` (the Settings pages) and `688b13e8` (which character and chat
  triggers and Lua act on). `6b7abcc1` records `MC-096`, the Android wrapper analysis.
- **W1a:** `13ed2e75`, records `490bdec2`. **W1b:** `22db8dfe`, records `790643ff`.
- **Composer stage, S0 to S2:** `b05231c6` (S0), `1bc5f288` (S1), records `2177f7d2`; `67f17f1a` (S2),
  records `9ce59e0d`.
- **Vitest exclusion:** `7b72b813`, records `127f84d1` and `d4b0262d`.
- **Upstream batch (`MC-101`):** `3482ef4f`, `73edeb69`, `295c0fa7`, `5064bc4c`, `5c85cac7`,
  `0f38ac8c`, `9213ebc2`; records `679e7ff4`.
- **W2a:** `ec65c200`, records `650dd97f` (which also holds W2's scoping).
- **W2b-core:** `ac8cb3da`, records `6940a7b3`. **W2b-previews:** `8f93d095`, records `5e4a2bfd`.
- **Escape on alerts, stage 1:** `6631f5e0`, records `9dee3ea9`.
- **W2c-a:** `79c6e35e`, records `4576d07e`.
- **Escape on alerts, stage 2:** `c0b323b0`, records `d848ecdf`.
- **The merge** of W2c-a into Escape on alerts stage 2: `1d6fa16b`.
- **W2c-b:** `9d493c79`, records `dd41a43d` (which also holds the records clean-up).
- **W2c-c:** `d27a1ee4`, records `1e8c64f1`.
- **W2d-a:** `4c34172c`, records `86c1e806`.
- **W2d-b:** `efd417b9`, records `c67bffed`.
- **Fullscreen on web** (its own session): `51e923eb`, records `61b5a885`.
- **W3:** `e07d32fb`, records the commit after it.

**The working tree is clean** apart from `Agents/Reports/37-chat-html-css-security-surface.md`
(untracked), which belongs to another session (probably "Q&A"; its header says read-only Q&A). Never
stage it.

## Parallel sessions (2026-09-29)

Several sessions work **in this same checkout**:
- **"Main Campaign"** (this one) owns everything outside `wiki/`, including the `Agents/` records.
- **"Wiki"** owns `wiki/**` only. It writes nothing to `Agents/`; its findings, suspected bugs and
  questions go to the maintainer in its final report. Its composer and send wiki batch waits for W2.
- **"Fix Escape leaving a blocking alert unanswered"** did Escape on alerts stages 1 and 2, both
  committed, and is idle. It took Report 39, `MC-109` and ledger rows 348-354, then Report 41,
  `MC-115` and rows 375-381.
- **"Q&A"** is read-only. It handed over the heap measurement (ledger row 383).
- **"Fix Fullscreen setting error on web build"** (started 2026-09-30 from a chip this session
  offered) worked in its own worktree. Its fix was cherry-picked here as `51e923eb` (ledger row
  428); its worktree's `node_modules` is a junction to this checkout's, so remove the junction
  alone (`cmd /c rmdir`) before deleting that worktree.

**Next free numbers:** `MC-130`, Report 48, and ledger row 455.
Check the ledger's last row before taking one. `MC-114` and ledger rows 371-374 were reserved for
W2c-a and left unused; nobody should fill them.

**Rules for every session:**
- stage by explicit path only;
- never `git add -A`, `stash`, `reset`, `checkout -- <path>` or `restore` on another session's files;
- commit and push only at the maintainer's request.

## Current work

### Resume here (hand-off, 2026-09-30, after W2e)

1. **W2 is complete** (W2a to W2e and W3). **Push:** the maintainer said they expect to ask once W2
   is complete; do not push until they do.
2. **Next in the work order:** the memory footprint (`MC-119`), then the wiki's composer and send
   batch (Wiki session). Ask the maintainer before starting.
3. **The Chrome tab** from W2e's live check (localhost:6001) may still be open behind its leave-site
   prompt; the server is stopped and `save/` is restored and hash-verified.
4. **Korean strings:** the three new W2e strings in `ko.ts` were flagged by the translator as a bit
   literal; the maintainer usually rewords `ko.ts` themselves.

### W2e: done (committed as `baf238e7`, records the commit after it)

- **Plan:** Report 47 rev 2.2; decisions `MC-129` and its amendment (a confirmed delete stops all the
  work in its chat, trash included; a member's delete does not warn; a backup load is refused while
  busy; a stop, from a delete or the busy button, ends a trigger's remaining effects); ledger rows
  444-454.
- **Gate 1:** round 1 [REJECT], round 2 [EDITORIAL]. **Gate 2:** [REJECT], test-only (the
  snapshot invariant was unpinned); remediation [APPROVE]. **Live check passed** (row 453).
  **Commit-message check** (row 454).
- **Committed** at the maintainer's request. Not pushed.

### The heap measurement (ledger row 383): done

Report in the session scratchpad, `heap/report.md`; summary sent to the Q&A session. It feeds the
memory-footprint stage after W2e (`MC-119`).

## Work order

Placement of the W2 stages is `MC-103`'s split (W2a, W2b, W2c, W2d, W3, W2e, in that order). The
Roadmap has no stage entries for W2c to W3; it carries the tickets below, checked on 2026-09-29
against the entries for CHORE-27, 35, 40, 41, 43 and 45.

1. **The memory footprint** (`MC-119`): the savings being worked out in the Q&A session, from the
   heap measurement (ledger row 383). CHORE-45 is decided after it.
2. **The wiki's composer and send batch** (Wiki session; W2 is now done).
3. **CHORE-35's opt-in stage:** the remaining upstream-infrastructure features (`/proxy2`'s
   static-web default, the transformers CDN, the Lua docs link, the MCP OAuth helper,
   `#import=<url>`, `getProxyStreamJobBaseUrl`). Roadmap: "scheduled after W1", `MC-092`. W1 is done. It is
   sequenced here after W2 by this file, not by the Roadmap.

Not placed in the sequence:
- **CHORE-40** (the copy button's URL fetch): open, Roadmap gives no position.
- **CHORE-41** (the edit-button bug): blocked on the maintainer's console output.
- **CHORE-43** (unreroll can write one chat's reply into another) and **CHORE-45** (the script cache
  misses every lookup on a repeat send in a long chat): both filed and not scheduled. CHORE-45 waits
  for the memory-footprint work (`MC-119`).

`MC-089`: nothing ships until every open ticket clears.

## Open follow-ups, waiting on the maintainer

1. **A native-speaker check on the new translations.** The maintainer reviewed the Korean
   (`4cdb5ef1`). The translator suggested that the German and Vietnamese
   `restoreNoLockWarningConfirm`, a data-loss warning, and the German `{{slot}}` phrasing get a
   native check.
2. **CHORE-41's console output.** The mechanism is found (ledger rows 201-202): `Chats.svelte` mounts
   one `Chat` per visible message, keyed by a hash of the message's data, id, index and flags, plus
   `ReloadChatPointer[index]`; `editMode` is local state, so any change to that hash remounts the
   message and silently drops the editor. It is present in both upstream and this fork; the
   maintainer's supplied plugins were ruled out (row 202). **Still
   open:** why the button stays dead across repeated clicks. Ledger row 206 found a likely cause,
   an uncaught synchronous error during the edit-mode branch's mount that no `<svelte:boundary>`
   catches, but the throw site is not found. The maintainer's console output is needed.
3. **The MC-091 workflow pilot.** Its window ("the next 5-10 comparable items") has passed; the
   ledger's "Reading at row 385" says how many items. Evaluating it is the maintainer's.

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
| CHORE-39, OPFS migration | 30 | `37898465` | `9cbe2901` (plan), `b7b1fd00` | 223, 226-231 |
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
| W2e, a delete warns about and stops the work in its chat; a backup load waits for work | 47 | `baf238e7` | the commit after it | 444-454 |

Escape on alerts stage 2 and W2c-a were merged as `1d6fa16b`.

## Operational notes for this environment

- **Git Bash here fails on heredocs, and on single commands longer than about 230 characters.**
  Write scripts with the Write tool, or use PowerShell. Commit with `git commit -F <file>`.
- **Git Bash rewrites any argument that begins with `/`** (MSYS path conversion). `git grep
  '/kei'` reported no matches when there were five. Prefix such commands with
  `MSYS_NO_PATHCONV=1`, or drop the leading slash from the pattern.
- **Tool grants** (`^tools:` in `.claude/agents/*.md`, checked 2026-09-29):
  - `opus-reviewer`, `adversarial-reviewer`, `investigator` and `deep-investigator` hold `Write`, for
    scratchpad files only (in effect since 2026-09-25); `perf-analyzer` also holds `Write`;
  - `doc-writer`, `sonnet-coder`, `test-warrior` and `translator` hold `Write` and `Edit`;
  - `code-searcher`, `code-reader`, `doc-verifier` and `senior-advisor` have neither.

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
- **Card description contrast is 3.32:1.** This is a maintainer decision and has not been raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).
- **"Backup & Files" still uses the old account tab's person icon** (cosmetic; noted in Report 28
  section 11.2, not fixed there).

## Test suite

- **W2e's final tree (`baf238e7`):** 198 files, 3,269 passed, 4 skipped, 0 failed (ledger row 452);
  `pnpm check` clean, the build passes.
- `cargo check` last ran on the removal stage.
- Run the suite with plain `pnpm test` or `npx vitest run`. `vitest.config.ts` excludes
  `.claude/**` (`7b72b813`).

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
