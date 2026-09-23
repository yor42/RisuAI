# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`. The documentation restructure is committed
as `65ca6c0` (documentation only). Nothing else below is committed, and nothing is pushed.

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

Two items are open but out of scope for that pass: the `.gitignore` entry for
`Asset Cache/Community Mitigation_Webrowser Plugin/` names a path that no longer exists, leaving
`Asset Cache/` itself unignored; and `AGENTS.md` has not yet gained the routing line requiring
subagent briefs to cite `Agents/Maintainer-Context.md`.

## Test suite

59 files, 834 passed, 4 skipped. `pnpm check` clean.

## Uncommitted work

Two modified source files (`src/lib/ChatScreens/Chat.svelte`, `src/ts/globalApi.svelte.ts`) and
five untracked new source files (`src/ts/draftContents.ts`, `src/ts/draftContentOrphanGate.ts`
and their tests, plus `src/lib/ChatScreens/Chat.messageEditor.svelte.test.ts`). The documentation
is committed; the source work is not.
