# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-25.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It has not been pushed since
`12841c19`.** The maintainer said the push can wait.
- `911376cb`: CHORE-34, the multiuser removal (code, tests, `package.json`/`pnpm-lock.yaml`,
  `AGENTS.md`, `wiki/Playground.md`).
- The commit after it: the CHORE-34 records and this briefing.

**Not staged, by the maintainer's instruction:** the parallel documentation session's
`wiki/Settings-*.md` files, `wiki/Home.md` and `wiki/_Sidebar.md`. Wait for the maintainer's
update, and do not delete them.

**Uncommitted, from the CHORE-33 step 1 session:** ledger rows 190 to 192 and MC-084 to MC-086.
The maintainer has not asked for a commit.

## Current: RisuAccount removal (CHORE-33), step 1 done, waiting on the maintainer

**Done 2026-09-25:** the blast-radius refresh. Ledger row 190 is the `code-searcher` survey,
row 191 the legal-notice and ToS lens, row 192 the investigator workflow (6 repo lenses, 3 fork
lenses, critic, gaps, 2 `deep-investigator` checks). The Orchestrator verified the key claims.
The evidence packets are in this session's scratchpad (`survey/`, `inv6-stale-profile/`,
`loadlocalbackup-write-order/` with the RUN red-test prototype, `tests-account-symbols/`,
`changes-since-row173/`, `user-surface-and-scope/`, `docs-staleness/`, `fork-*/`, `gap-*/`,
`contradiction-*/`, `legal-notice-and-tos/`). Scratchpad files do not survive the session;
rows 190 to 192 are the durable record.

**New maintainer input this session:**
- MC-084: Realm's standalone site has its own sign-in and upload.
- MC-085: the legal-documents notice is tied to RisuAccount. Upstream's ToS and Privacy Policy
  mostly cover account sync and Realm. The maintainer supplied the Korean texts.
- MC-086 (decision, "if possible"): move the ToS agreement prompt from boot to the first use of
  an upstream service.

**The maintainer answered the step 1 questions** (MC-087, 2026-09-25). They took the
Orchestrator's recommendation for the landing backend.

**Report 28 rev 1 is written** (`Agents/Reports/28-risuaccount-removal-plan.md`). It has three
sub-stages:
- 28A: the importer refusal;
- 28B: the removal;
- 28C: agreement at first use of an upstream service.

**Gate 1 round 1 rejected rev 1** (ledger row 193): substantive, round 1 of the three-round
count. The Orchestrator verified every finding. Its reviews are in the scratchpad
(`gate1-*/review.md`).

**Report 28 rev 2** takes every round 1 finding, plus MC-088.

**Gate 1 round 2 rejected rev 2** (ledger row 194), the second substantive rejection. The
mechanism question was answered yes:
- **I6's stale-profile notice** now ends the boot: acknowledge, clear the flags, reload.
- **28C's agreement** is now enforced in the functions that send requests upstream, not at UI
  call sites.

**Report 28 rev 3** carries both, plus every round 2 finding.

**Gate 1 round 3 approved rev 3** (ledger row 195): all four lenses APPROVE-WITH-FINDINGS, no
BLOCKER or MAJOR. **Gate 1 has passed.**
- **Report 28 rev 3.1** folds in all 62 round 3 findings. Contradictions are fixed in place; the
  rest is in section 11, which is binding.
- **The fix-up review** (ledger row 196) rejected rev 3.1 for wording only. Two fold-ins were
  wrong (the `compression` option, and section 5's translation rule), and some fixes existed only
  in section 11.
- **Rev 3.2** corrects them and merges section 11 into the home sections. Its re-check (ledger
  row 197) approved with one MINOR, fixed in place. **The plan is final.**
- **Waiting on the maintainer's go for 28A.**
- **MC-089 (maintainer):** keep the OPFS switch visible. Nothing ships until every open ticket
  is cleared.

**Next, after the fix-up review:** report to the maintainer and ask to start 28A. 28A begins
with `test-warrior`'s red test (T-A1 to T-A13), built from row 192's prototype.
- **A substantive rejection** means escalating to `senior-advisor` with a dossier before rev 4.
- **A mis-launch happened.** An accidental relaunch of the round 2 script
  (`wiw5yfble`) was stopped within seconds. The round 2 review files were untouched: their
  timestamps predate it.

**MC-088 is in rev 2:** the unreachable `FilesSettings.svelte` page (CHORE-14 UI-1) merges into
the renamed "Backup & Files" tab.

**Next:** arbitrate round 2's findings against source, log ledger row 194, and report to the
maintainer. No code before Gate 1 approves.

The original stage brief follows.

The maintainer chose it as the next stage on 2026-09-25, after CHORE-34 and before W1 (MC-080,
"Timing"). Its scope and the migration refusal are already decided.

**Read first:**
- `MC-080` (scope and timing) and `MC-081` (the encrypted-`.bin` refusal and its message) in
  `Agents/Maintainer-Context.md`, plus `MC-011`, `MC-012`, `MC-025`, `MC-026` and `MC-002`.
- **Report 25** (`Agents/Reports/25-risuaccount-removal-strategy.md`). It is the strategy:
  - section 4: what goes and what stays;
  - section 5: the nine invariants;
  - section 6: the refusal message;
  - section 10: next investigations and the do-not list;
  - section 12: the records to update.
- **Report 27** (the CHORE-34 plan). It is the template for this stage's plan: blast-radius
  table, invariants with acceptance, and tests to delete, edit or pin.
- Ledger rows 173 to 175: the original blast-radius map, the reference forks and the
  `senior-advisor` scope call.

**Report 25's line numbers are stale.** They were cited against the W0 working tree, before W0,
CHORE-28 and CHORE-34 were committed. CHORE-34 edited `AlertComp.svelte`, `index.svelte.ts` and
others. Cite by name, and re-derive any location before relying on it.

**Stage plan** (AGENTS.md section 4; `opus-reviewer` gates throughout, since the stage touches
save/persistence, backend selection and the `.bin` importer):
1. **Refresh the blast radius**, one ledger row per dispatch, starting at row 190.
   - One batched `code-searcher` survey of every Report 25 section 10 item 1 pattern, against
     HEAD. The Orchestrator re-runs the counts.
   - Then an `investigator` pass on what the survey cannot settle:
     - invariant 6's scenario: `accountst = able` with a stale local database in the fallback
       backend, and where detection could live;
     - the exact write order in today's `LoadLocalBackup`, for the red test;
     - the current test files that reference account symbols (Report 25 invariant 9 counted
       23 before W0 landed);
     - whatever changed since ledger row 173.
   - Escalate to `deep-investigator` only on the 1.3 triggers.
   - Section 10 item 6 (compare W1's file list) is moot, because the maintainer fixed the
     order.
   - Item 5 (whether Realm's upload page offers its own sign-in) needs a network visit. Do not
     probe (`MC-081`); ask the maintainer if it matters.
2. **Bring the maintainer the questions that are theirs.** Known open ones:
   - **Invariant 6's two design choices:** which backend a detected profile lands on, and
     whether detection lives in `AutoStorage.Init()` or in `bootstrap.ts`.
   - **Anything user-visible** beyond what MC-080 already lists.
   - **Unused `src/lang` keys:** delete them? For CHORE-34 the answer was yes (MC-083).
3. **Plan as Report 28, then Gate 1** (`opus-reviewer`, fresh). The plan must carry all nine
   Report 25 invariants with acceptance scenarios.
4. **Tests.** The red test comes first: invariant 1's four-entry fixture (asset, cold entry,
   marker, database) with write spies, red at HEAD. Then `sonnet-coder`, then Gate 2
   (`opus-reviewer`), a live check on a production build, and a commit on the maintainer's word.

**Stage obligations beyond `src/`:**
- **`AGENTS.md`:** its "Data Layer" section names account-sync as the first backend and in the
  remote-block paragraph. Both must change.
- **`plugins.md`:** invariant 8's `saveMethod` values and the four "syncs across devices"
  passages.
- **The migration wiki page** (Report 25 section 6).
- **`wiki/Settings-Account-and-Files.md`** belongs to the parallel wiki session. Do not edit it;
  list what goes stale for them.

## Work order

1. **W0: identity.** Done and committed.
2. **CHORE-28.** Done and committed (Report 26).
3. **Multiuser removal (CHORE-34, `MC-074`/`MC-083`, Report 27).** Done and committed
   (`911376cb`).
4. **RisuAccount removal (CHORE-33, `MC-080`/`MC-081`, Report 25).** Next.
5. **W1: engine binding.** This closes CHORE-25 and CHORE-26. Then the composer stage (Report 22
   rev 3), then W2 and W3.

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
    renders. The RisuAccount removal edits that file too, because it imports `AccountWarning`
    (Report 25 invariant 4). Keep the frozen-key indicator.
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
    `autoServerBackup` (`kei/backup.ts`). Those calls go with the functions the RisuAccount
    removal deletes. **The local `.bin` restore's call must stay.**
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
- **Line endings.** `core.autocrlf=true`, so git normalises them, and a CRLF/LF flip in a
  working-tree file never shows in the diff. Judge by `git diff --numstat` and git's "LF will be
  replaced" warnings, not by Git Bash `grep`/`od` counts, which misreported twice. The `Agents/`
  documents are LF.

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

## Test suite

**104 files: 1311 passed, 4 skipped, 0 failed** at `911376cb`. `pnpm check` is clean.
- Run the suite with `npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.
  Plain `pnpm test` also picks up `.claude/worktrees/**`.

## How to live-check this app

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

## Method lessons from this session

- **Verifying a packet's refutation needs its own grep.** Row 185 called `sendMain` nonexistent.
  The Orchestrator checked the half it expected (that `index.svelte.ts` never reads the store) and
  wrote a false "correction" into MC-074. Gate 1 caught it. When a packet says something does not
  exist, grep for that name.
- **A comment rewrite inherits the plan's claim, so check the claim.** Report 27 rev 1 described a
  doubled asset path that no upstream revision could produce. Gate 1 traced the call site
  (`requestChar()` never takes an argument) and killed it.
- **For a removal, the review budget goes on the words.** Both CHORE-34 gates rejected on wording
  only, and neither found a code defect. The comments, the records and the commit message carried
  every defect.
- **A fix that normalises one side of a comparison needs the other side checked too** (CHORE-28).
  Counting holders by `String(chaId)` while matching raw marks deleted numeric-id characters.
- **A suggested simplification can reintroduce a bug one layer out** (CHORE-28). Check where a
  mutated value flows after the function returns.
