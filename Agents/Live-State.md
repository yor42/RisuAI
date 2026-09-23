# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`. The documentation work is committed in three
commits, all documentation only: `65ca6c0` (the restructure), `4db160d7` (this file brought up to
date), `094bf505` (AGENTS.md corrected against source, plus the release-status entry). **Nothing
is pushed**, and the source work below is not committed.

## Durable drafts stage

**Report 20, Gate 1 passed at rev 4.** Built and pinned:

- A content store: `src/ts/draftContents.ts` — LRU-bounded, identity-keyed, no index fallback.
- An orphan gate: `src/ts/draftContentOrphanGate.ts` — 60s cap, swept on `saveDb`'s existing
  cadence, no new timer.
- The main message editor's capture in `src/lib/ChatScreens/Chat.svelte` — an edit buffer bound to
  both edit surfaces, identity frozen at open, seeding precedence, capture mirroring the buffer.

`src/ts/localDrafts.ts` and its test are deliberately byte-untouched — that is the stage's own
falsifier for the two-map split.

**Remaining in that stage:**

- The translation editor's capture.
- The visible restore marker plus one-click revert on both edit surfaces.
- Gate 2 with mutants.
- A live check in the browser pane.

## Composer stage

Split out of durable drafts by maintainer decision. Needs:

- Flush-under-the-old-key-then-restore-under-the-new-key ordering.
- All three values: `messageInput`, `messageInputTranslate`, `fileInput`.
- A generation token for the async translate writes.

The composer mis-send remains live until this stage lands.

## Report 21 (deferral re-review)

Findings awaiting prioritisation:

- `updateInlayScreen` destroying hand-edited custom prompts (confirmed data loss).
- Remote-block read verification.
- `removeChar`'s missing `doingChat` guard.
- Plugin permission caching (needs verification first).
- `saveTimeoutExecute`'s missing ceiling.
- Doc corrections.

## Documentation restructure

D1 and D2 are complete, committed as `65ca6c0`. D1 added `Agents/README.md` and
`Agents/Maintainer-Context.md` (51 entries). D2 stamped all 32 reports with a `**STATUS:**`
header, split this file out of the handoff, and corrected `Agents/Summary.md`. D3 — moving the
`99-*` subsystem references into their own directory — was assessed and deliberately skipped: the
status headers removed the confusion it existed to fix, and moving files would break prose
cross-references that no link checker catches.

`AGENTS.md` was then fact-checked against source (`094bf505`): eleven claims were wrong, stale or
materially incomplete, including an architectural one — the remote-block path was described as
Node-server-only when every non-Tauri backend takes it — and a two-place instruction to run
Prettier, which this repo does not have in any form. It also gained the release-status entry
(this fork has never shipped; see `MC-011`) and the rule that every subagent brief cites
`Agents/Maintainer-Context.md`.

**One item remains open and is not documentation:** the `.gitignore` entry for
`Asset Cache/Community Mitigation_Webrowser Plugin/` names a path that no longer exists, so
`Asset Cache/` itself is not ignored. Nothing is exposed today — `git status --untracked-files=all`
is clean there — but a plugin bundle landing in that folder would not be covered.

## Test suite

59 files, 834 passed, 4 skipped. `pnpm check` clean.

## Uncommitted work

Two modified source files (`src/lib/ChatScreens/Chat.svelte`, `src/ts/globalApi.svelte.ts`) and
five untracked new source files (`src/ts/draftContents.ts`, `src/ts/draftContentOrphanGate.ts`
and their tests, plus `src/lib/ChatScreens/Chat.messageEditor.svelte.test.ts`). The documentation
is committed; the source work is not.
