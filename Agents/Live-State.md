# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-24 to 2026-09-25.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`, pushed to origin (yor42/RisuAI) with
the maintainer's go-ahead once the two commits below land.
- **W0 code commit:** chat identity and the origin module (Report 24).
- **Records commit:**
  - this file;
  - `MC-078` to `MC-081`;
  - Roadmap CHORE-28 to CHORE-33;
  - ledger rows 164 to 177;
  - Report 23's supersession note, Report 24 (the W0 plan and every gate record) and Report 25
    (the RisuAccount removal).

**Not staged, by the maintainer's instruction:** the parallel documentation session's
`wiki/Settings-*.md` files, `wiki/Home.md` and `wiki/_Sidebar.md`. Wait for the maintainer's
update; do not delete them.

## Work order

1. **W0: identity.** DONE and committed. Gate 1 approved rev 4.1 after three rejections and a
   `senior-advisor` escalation. Gate 2 ran four rounds plus a fix-up review; rev 4.2 dropped id
   inheritance. The final doc-verifier check passed.
2. **CHORE-28**, next per `MC-079`. While two characters share a `chaId`, the save must not
   rewrite that block and must show a visible warning. W0 test 20a pins today's behaviour.
3. **The removals:**
   - **Multiuser removal (`MC-074`).**
   - **RisuAccount removal (`MC-080`/`MC-081`, CHORE-33, Report 25).** Its scope is decided: all
     of RisuAccount goes, and Realm, Drive and `/hub-proxy` stay. An encrypted account `.bin` is
     refused before any write. Its timing is **deferred by the maintainer**. `senior-advisor`
     recommends both removals before W1, with multiuser first. After W1 is acceptable; after W2
     is to be avoided.
4. **W1: engine binding** (closes CHORE-25 and CHORE-26), then the composer stage (Report 22
   rev 3), then W2 and W3.

## W0 facts the next stages rely on

- `src/ts/process/chatIds.ts`:
  - pure fill, repair and duplicate warnings, with no store import;
  - a missing id is always fresh; nothing inherits;
  - `repairDatabaseIds` runs only at boot (through `assignIds`, which is boot-only) and on
    decoded backups before install.
- `src/ts/process/chatOrigin.ts`:
  - `originOf`, `writeAt`/`readAt` (synchronous callback, marks in a `finally`), `commitCharacter`
    and `commitChat` (id guards), `beginWork` (live objects only) and `isWriting`;
  - a target that is gone or held by two objects is skipped (`MC-075`, `MC-078`);
  - no production caller yet: W1 binds the first.
- **The duplicate warning reports the state after the call, not blame.** Its detection has three
  documented limits:
  - chat ids are compared within the owner only;
  - for a `chaId` with more than one holder, a per-slot install reports nothing about its chats,
    and a database install compares against only one holder;
  - duplicates made in place on live objects are not seen.
- **W1 must:**
  - call `beginWork` only with objects read back through `DBState`, and never during a
    derivation;
  - resolve once per synchronous batch;
  - report the resolution counts for its Lua and CBS paths;
  - measure a production build with throttling;
  - prove that `runTrigger`'s whole-clone commit cannot drop a message.
- **Performance** (i9, production-mode Svelte, 1000 × 20):
  - one resolution costs about 0.5 ms (0.7 ms in the dev build);
  - `setDatabaseLite(getDatabase())` gains about 9 ms, or about 24 ms on cold proxies.

## Open items

- **Stray directory to delete by hand:** `C:\Users\yor42\AppData\Local\Temp\claude\C--P*\` (a literal `*`). An agent created it; the permission classifier blocked its deletion.
- **Scratch trees with `node_modules` junctions.** Several scratch trees contain `node_modules`
  junctions into the repo. Remove each junction with `cmd /c rmdir` before any recursive delete.
- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists.
- **Card description contrast is 3.32:1.** This is a maintainer decision and has not been raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).

## Test suite

**98 files: 1256 passed, 4 skipped, 0 failed.** `pnpm check` is clean.
- Run the suite with `npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.
  Plain `pnpm test` does not exclude `.claude/worktrees/**`.

## How to live-check this app

- **Use Claude in Chrome, not the built-in pane.** The service worker kills the boot in the pane.
- **Leave-site guard:** it is off on the Vite dev server. Use a production build (`pnpm run build`
  with `VITE_RISU_LEGAL_CONFIGURED=TRUE` set inline for that run only, then `pnpm run runserver`).
- **Model:** Echo is the fixture's model, so reroll needs no API key.
- **Settings:** restore any setting you change.
- **Network:** do not probe upstream services such as `sv.risuai.xyz`. The maintainer asked for
  no probing (`MC-081`).

## Method lessons from this session

- **A choice between two holders of an id, or of blame, cannot be made one call at a time.** The
  W0 gates rejected inheritance (by slot, then by holder) and warning attribution for the same
  reason. The answer both times was to stop deciding: use fresh ids, skip ambiguous targets, and
  have warnings report state.
- **Workflows with independent lenses worked well for late gates.** A verify stage that fires only
  on BLOCKER or MAJOR findings kept the cost bounded.
- **A worker's reasoning is not a mutant run.** Ask for the run, and have the next gate re-run it.
- **Scratch hygiene.** Agents twice created files outside the scratchpad: a glob in `mkdir`, and a
  stray `cp`. One agent edited a repo file to test a mutant. Briefs now say this explicitly.
