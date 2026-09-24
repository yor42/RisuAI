# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23 to 2026-09-24.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`, **pushed to origin** (yor42/RisuAI) on
2026-09-24 with the maintainer's go-ahead, in sync once the two commits below land. The push
included `wiki/`, so the wiki-sync CI ran.

- Earlier this session: `160ba715`/`bfe2b9d6` (openURL fix and records), `b6a8f0e6`/`04da01d6`
  (CHORE-22 and records), `9955eaa5` (production-build live check records).
- **The CD-4 code commit:** `src/ts/process/inlayScreen.ts`, `src/ts/process/inlayScreen.test.ts`
  (new), `wiki/Additional-Character-Screen.md`.
- **Its records commit:** this file, `MC-071` to `MC-077`, Roadmap (sidebar symptoms, CHORE-25
  to CHORE-27), ledger rows 157 to 163, Reports 22 and 23.

## Work order (`MC-076`)

1. **CD-4 `updateInlayScreen` — DONE, committed.** Hand-edited image/emotion prompts survive
   mode and Inlay Screen changes. Each field is resolved separately; defaults are byte-identical.
   Edited Image Generation Instructions are kept across an Inlay toggle and documented (`MC-077`).
   13 tests, 4 red at HEAD; Gate 2 (`opus-reviewer`, two passes) approved; ledger row 163.
2. **W0 — identity.** In planning (Report 24). Needs Gate 1. Scope in Report 23 section 4.
3. **W1 — engine binding** (closes CHORE-25 and CHORE-26).
4. **The composer stage** (Report 22 rev 3, on W0's resolver).
5. **W2 — generation and deletion** (closes CHORE-27) and **W3 — `/` commands**.

## Writer rework (`MC-073` to `MC-076`, Report 23)

Writes made for a unit of work resolve their target by identity (`chaId`, chat `id`) at write
time, never through the selection or an index captured earlier. No switch lock. Plugin "current"
helpers stay bound to the selection. Whole-object commit stays. Rules W-1 to W-6 are in Report 23
section 3. Key facts already established:
- **An in-place write to a non-selected character is not saved without `markCharacterForSave`.**
  This was run (ledger row 162), so the write helper marks by default.
- The parser has no per-call hook for `getChatVar`/`setChatVar`; `chatVar` needs an explicit
  target. `runScripted` already accepts `char`/`chat`/`setVar`/`getVar`.
- Use an index lookup by `chaId` for the resolver, never `findCharacterbyId` (it skips groups and
  returns a blank character on a miss).
- HaejeokRisuai (`C:\Projects\HaejeokRisuai`, GPL-3.0) built the same shape (`ChatTarget`); we
  adopt the idea, not the code (ledger row 160).

**Maintainer decisions to honour:**
- `MC-074`: multiuser is to be removed in its own stage; it is out of the rework.
- `MC-075`: `/` commands are bound to the send's origin. Deleting a chat or character while
  something is writing into it asks first; otherwise a write whose origin is gone drops silently.
  The Home case is tested in W2.
- `MC-072`: composer drafts restore silently; late files go to their own chat; only the on-screen
  composer holds the multi-tab reload.
- A refused switch, if one is ever refused, is silent (`MC-073`).

## Composer stage (Report 22, rev 2)

Paused behind W0 and W1. Gate 1 rejected rev 1 and rev 2. Rev 2's mechanism, I2, was found
sound: the per-chat record is the composer's state, held at module level. Every remaining major
was in the send window, and the writer rework now owns those. Rev 3 takes I1 from W0 and captures
the send as an origin. It also still owes:
- removing `sendChatMain`'s own `messageInput = ''` (Ctrl+M reroll wipes a typed draft at HEAD);
- routing the prev/next-character hotkeys through `changeChar`;
- a textarea resize when the key changes.

## Sidebar

Deferred until the work above is done (`MC-071` records the reported symptoms). The first
symptom, a changed order not persisting, is a possible persistence defect; triage it first when
the sidebar comes up.

## Next (options)

- Plan W0 and send it to Gate 1 (`opus-reviewer`).
- Report 21's other findings: remote-block read verification, `removeChar`'s missing `doingChat`
  guard (W2 covers the writer side), plugin permission caching, `saveTimeoutExecute`'s missing
  ceiling.
- Upstream chores CHORE-19 to CHORE-21, CHORE-23, CHORE-24.
- Multiuser removal (`MC-074`), after the composer stage.

## Other open items

- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists, so `Asset Cache/` itself is not ignored.
- **Card description contrast** on the home screen is 3.32:1 (`text-textcolor2`, repo-wide). A
  maintainer decision, not yet raised as work.
- **Per-instance `matchMedia` listener** in `Chat.svelte` for reduced motion. A shared module-level
  source would be cheaper on Pi and mobile.

## Test suite

**78 files, 1105 passed, 4 skipped, 0 failed.** `pnpm check` clean. Run with
`npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`. Plain `pnpm test`
does not exclude `.claude/worktrees/**`.

## How to live-check this app

- Claude in Chrome, not the built-in pane (the service worker kills the boot).
- The sidebar avatar sometimes ignores the `computer` tool's clicks after a reload. A JS `.click()`
  on the avatar's nearest `button, [role=button]` ancestor works, but carries no user activation,
  so a control that opens a popup needs a real `computer` click.
- The "Leave site?" guard is off on the Vite dev server. To see it, use a production build:
  `$env:VITE_RISU_LEGAL_CONFIGURED = 'TRUE'; pnpm run build; Remove-Item
  Env:VITE_RISU_LEGAL_CONFIGURED; pnpm run runserver` (http://localhost:6001). Record
  `beforeunload` outcomes with a listener added after load rather than letting a real dialog
  appear; a real dialog blocks Claude in Chrome until dismissed.
- Locate message controls through `.chat-message-container` in JS (index 0 is the newest).
- Type with real key events; capture listens to `input`.
- Echo is the fixture's model, so reroll needs no API key.
- Restore any setting you change.

## Method lessons from this session

- **At the second rejection, ask whether the mechanism is the problem.** The composer plan's two
  rejections both traced to one pattern (writes follow the selection). A lock would have treated
  the symptom; the maintainer chose the structural fix.
- **"Coverage, not proof" notes must be true.** Two such notes claimed an overwrite and a
  preservation give the same result when they did not. State what the test cannot distinguish,
  not a false equivalence.
- **Test comments must not describe the pre-fix code as current.** Caught again before Gate 2.
