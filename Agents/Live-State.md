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

The branch is `fix/persistence-conflict-platform-hardening`. Origin (yor42/RisuAI) is at
`b50c8974`, which holds W0 and its records.

**CHORE-28 is implemented and has passed its gates, but is not committed.** It waits for the
maintainer's go-ahead.
- **Code and tests:** everything under `src/`, in the working tree.
- **Records:**
  - Report 26;
  - `MC-082`;
  - ledger rows 178 to 184;
  - the Roadmap entry for CHORE-28;
  - this file.
- **Commit message draft:** `commit-chore28.txt` in the session scratchpad.

**Not staged, by the maintainer's instruction:** the parallel documentation session's
`wiki/Settings-*.md` files, `wiki/Home.md` and `wiki/_Sidebar.md`. Wait for the maintainer's
update, and do not delete them.

## Work order

1. **W0: identity.** Done and committed.
2. **CHORE-28.** Done and gated; awaiting commit (Report 26).
3. **The removals:**
   - **Multiuser removal (`MC-074`).**
   - **RisuAccount removal (`MC-080`/`MC-081`, CHORE-33, Report 25).** The scope is decided. The
     timing is **deferred by the maintainer**.
   - `senior-advisor` recommends doing both removals before W1, multiuser first.
4. **W1: engine binding.** This closes CHORE-25 and CHORE-26. Then the composer stage (Report 22
   rev 3), then W2 and W3.

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
    renders.
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
    local `.bin` restore.
- **`src/ts/process/chatOrigin.ts`:** a target that is gone or held twice is skipped (`MC-075`,
  `MC-078`). There is no production caller yet; W1 binds the first.
- **W1 must:**
  - call `beginWork` only with objects read back through `DBState`;
  - resolve once per synchronous batch;
  - report the Lua and CBS resolution counts;
  - measure a production build with throttling;
  - prove that `runTrigger`'s whole-clone commit cannot drop a message.

## Open items

- **A stray folder to delete by hand:** `C:\Users\yor42\AppData\Local\Temp\qa1`. It is a
  reviewer's scratch copy: Git Bash `ln -s` made a real copy.
- **Also still present:**
  - `C:\Projects\scratch_investigator_tmp`, which is empty;
  - `Temp\claude\coldstorage.svelte.ts.bak`.
- **Scratch trees with `node_modules` junctions.** Remove each junction with `cmd /c rmdir` before
  any recursive delete.
- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists.
- **Card description contrast is 3.32:1.** This is a maintainer decision and has not been raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).

## Test suite

**104 files: 1310 passed, 4 skipped, 0 failed.** `pnpm check` is clean.
- Run the suite with `npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.
  Plain `pnpm test` also picks up `.claude/worktrees/**`.

## How to live-check this app

- **Use Claude in Chrome, not the built-in pane.** The service worker kills the boot in the pane.
- **Leave-site guard:** it is off on the Vite dev server. Use a production build: run
  `pnpm run build` with `VITE_RISU_LEGAL_CONFIGURED=TRUE` set inline for that run only, then
  `pnpm run runserver`.
- **Model:** Echo is the fixture's model, so reroll needs no API key.
- **Settings:** restore any setting you change.
- **Network:** do not probe upstream services (`MC-081`).

## Method lessons from this session

- **A fix that normalises one side of a comparison needs the other side checked too.** Gate 2
  round 2 found that counting holders by `String(chaId)` while matching raw marks deleted
  numeric-id characters. Asking the mechanism question up front in round 3 settled it.
- **A suggested simplification can reintroduce a bug one layer out.** Converting the mark list in
  place would have dropped marks via `mergeUnsavedChanges`. Check where a mutated value flows
  after the function returns.
- **Mutants go stale.** Mutant files generated before a later source fix silently revert that fix
  too. Regenerate them from the current source each round.
- **HEAD swaps must serve every changed file.** A regex that missed `./en` skewed one round's
  counts.
- **Check tool grants before briefing** (feedback memory). A brief told `adversarial-reviewer` to
  use Write, which it does not have.
- **Scratch hygiene.** Reviewers created stray files three times: a file in the repo root that
  was deleted, a `cp` glob that matched another session's scratchpad, and an `ln -s` that made a
  real copy in `%TEMP%`. Briefs say to run shell commands from the scratchpad and never to use
  globs.
