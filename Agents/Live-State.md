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

The branch is `fix/persistence-conflict-platform-hardening`, pushed to origin (yor42/RisuAI) and
in sync at `21668b28`.
- `2420d717`: the CHORE-28 code.
- `21668b28`: the CHORE-28 records.

A follow-up commit adds this briefing and the `Write` grants below.

**Not staged, by the maintainer's instruction:** the parallel documentation session's
`wiki/Settings-*.md` files, `wiki/Home.md` and `wiki/_Sidebar.md`. Wait for the maintainer's
update, and do not delete them.

## Next session: start the multiuser removal (`MC-074`)

The maintainer chose this as the next stage on 2026-09-25. Nothing has started yet.

**Read first:**
- `MC-074` in `Agents/Maintainer-Context.md` (its "How to apply" list is the investigation scope);
- `MC-011`: upstream data carrying multiuser fields must still load;
- Report 25, the RisuAccount removal strategy. It is the template for a removal: blast radius,
  invariants, and "tests for removed behaviour are deleted".
- Keep the RisuAccount removal a **separate** stage. Do not fold it in (Roadmap, CHORE-33).

**What is already known.** None of it has been investigated yet.
- `src/ts/sync/multiuser.ts` is 448 lines. Its writes deliberately go to the live selection. It
  contains one incidental `cha.chaId = '§temp'`.
- **Files that import it:**
  - `Chat.svelte`, `DefaultChatScreen.svelte`, `Sidebar.svelte`, `SideChatList.svelte`,
    `PlaygroundMenu.svelte`;
  - `process/index.svelte.ts`, which includes `sendMain`'s message `name` field via
    `ConnectionOpenStore`;
  - `storage/assetIntegrity.ts`.
- **Test files that mock or cover it:**
  - `sync/tests/multiuserReceiveChatSaveMarks.svelte.test.ts`;
  - `sendChatSaveMarks`;
  - `sendChatColdGuard`;
  - three `Chat.*` tests;
  - `SideChatList.newChat`.
- `AlertComp.svelte` and all seven `src/lang/*.ts` files mention it.

**Stage plan** (AGENTS.md section 4; opus-tier gates, because it touches the send path and the
save marks):
1. **Blast-radius investigation** (`investigator`; escalate to `deep-investigator` only on the
   triggers). Cover:
   - UI entry points;
   - every `ConnectionOpenStore` and other exported-store read;
   - the plugin API surface;
   - saved fields in `database.svelte.ts` and characters;
   - hub or network endpoints it uses (read the code only; **no probing**, `MC-081`);
   - `server/`;
   - tests and translations.
   Log it in the ledger (next row 185).
2. **Plan as Report 27, then Gate 1** (`opus-reviewer`, fresh). The plan must include:
   - invariants: nothing reachable is left dangling;
   - upstream data with multiuser fields loads;
   - send and save-mark behaviour are unchanged for the single user;
   - which tests are deleted, and which are kept or changed.
3. **Decisions to put to the maintainer, if the investigation raises them:**
   - whether to remove the now-unused `src/lang` keys, which the maintainer edits by hand;
   - anything user-visible besides the menu entries.
4. **Test first**, then `sonnet-coder`, then Gate 2 (`opus-reviewer` lenses), then commit on the
   maintainer's word.

**Operational notes for this environment:**
- **Git Bash here fails on heredocs, and on single commands longer than about 230 characters.**
  Write scripts with the Write tool, or use PowerShell.
- **Four agents now hold `Write`, for scratchpad files only:** `opus-reviewer`,
  `adversarial-reviewer`, `investigator` and `deep-investigator`. The profiles were edited on
  2026-09-25 at the maintainer's request, and the change takes effect in a new session.
  `code-searcher`, `doc-verifier` and `senior-advisor` still lack it. Check `^tools:` in
  `.claude/agents/*.md` before a brief promises a tool.
- Tell every agent to run shell commands from the scratchpad, never from the repo root, and never
  to use globs in `mkdir` or `cp`.
- Build mutants from the current source each round. When swapping in HEAD versions of files,
  serve every changed file, including the `./en` import.

## Work order

1. **W0: identity.** Done and committed.
2. **CHORE-28.** Done and committed (Report 26).
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
