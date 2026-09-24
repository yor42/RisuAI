# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23 to 2026-09-24.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`, **18 commits ahead of origin, nothing
pushed**, once the two commits below land.

- Already committed this session: `16e6f7e9` (home-screen live-check fixes), `c02aec74`
  (`MC-067`, Space and Enter reach a keyboard-focused control), `fe90145e` (their records),
  `e250089a` (the durable-drafts code commit), `0be3e0ca` (the durable-drafts records commit).
- `160ba715` — **the openURL code commit:** `src/ts/openUrlWeb.ts`
  (new), `src/ts/reloadGuard.ts`, `src/preload.ts`, `src/ts/globalApi.svelte.ts`,
  `src/ts/hubHtml.ts` and `src/lib/UI/SourceDisclosure.svelte` (comment-only), plus
  `src/ts/openUrlWeb.test.ts` and `src/preload.beforeUnload.test.ts`.
- **The records commit that follows it:** this file, `Agents/Investigation-Ledger.md` rows 142
  to 150, Roadmap CHORE-22 to CHORE-24, and `MC-070` (self-hosted builds get the leave-site guard;
  CHORE-22 is the next stage).

## openURL fix is DONE

`openURL`'s web branch was a bare `window.open(url, "_blank")`. It now calls `openUrlOnWeb` in
`src/ts/openUrlWeb.ts`, decided on the parsed `URL.protocol`: http/https opens a new tab with
`noopener` (referrer unchanged, relative URLs resolve against the page); mailto:/tel: is handed
to the OS from the current tab; any other or unparsable scheme opens nothing, with a warning
naming only the scheme. `src/ts/reloadGuard.ts` gained a one-shot handoff allowance (3s from the
most recent handoff), consulted by `src/preload.ts`'s `beforeunload` handler, kept separate from
the app-initiated-reload flag. The Tauri branch is unchanged (shell plugin 2.3.6's default open
scope already allows only http(s)/mailto/tel).

**Three defects fixed:** no `noopener` (reverse tabnabbing, including realm-hub links); a stray
blank tab on `mailto:` (the home Email card's two addresses); and any scheme reaching
`window.open` on the web — `mcplib.ts`'s MCP OAuth path passes an MCP server's unvalidated
`authorization_endpoint`, so `javascript:`/`data:` could otherwise have reached it.

**Tests:** `src/ts/openUrlWeb.test.ts` (18) and `src/preload.beforeUnload.test.ts` (14), red
before green. **Gate:** no plan-review gate, by the Orchestrator's carve-out judgment (the brief
carried invariants and six acceptance scenarios). The new timer allowance then carried the one
substantive defect Gate 2 found, which a plan review might have caught. Gate 2 by `adversarial-reviewer`, two rounds: round 1 found a
real race (overlapping handoffs inside the 3s window could clear each other's allowance, direction
only adds an unwanted prompt), fixed and re-tested red-first; round 2 was wording-only (test
counts, a stale test title, a commit-message overstatement), all fixed. Full detail and token
costs: `Agents/Investigation-Ledger.md` rows 142-150.

**Live-checked in Chrome** against the dev server: the Website card opened a new tab with
`window.opener === null` and its referrer present; the fork Email card's address opened the mail
client from the same tab with no new tab, and the page received a `beforeunload` for that
same-tab handoff. **Not live-checked:** the "Leave site?" guard itself — it is registered only
when `isWeb` (`location.hostname === 'risuai.xyz'`), so it never registers on the dev host; the
3s allowance is verified by tests only.

**Upstream chores found in passing (`MC-069`), now in the Roadmap:** CHORE-22 (self-hosted web
builds and the dev server have no accidental-close guard at all — decided in `MC-070`: they get it),
CHORE-23 (`mcplib.ts`'s `oauthLogin` doesn't await/catch `openURL`, minor), CHORE-24
(`GithubStars.svelte` is unused, minor).

## Durable drafts is DONE

Report 20's stage, minus the pieces split out by decision (the composer, section 4.5;
`PartialEditController`, section 4.6). Text typed into the message editor or the translation
editor survives an involuntary unmount, restored with the `MC-068` marker, its age, and a
one-click Revert. Report 20 section 11 has the full Gate 2 record (seven rounds, one
escalation).

**The mechanism, in one line:** capture runs on the edit surfaces' `input` events
(`captureMessageEdit` / `captureTranslationEdit` in `Chat.svelte`), never on changes to the bound
buffer. **Do not move capture back into an `$effect`** — it cannot tell the user's writes from the
component's own (open, revert, the translation save's write-back); three gate rounds were lost to
exactly that.

**Live-checked in Chrome:** type/reroll/unReroll/reopen restores the draft with the marker, on
default and `cardboard`; Revert and the age display work; a `mobilechat` draft survives the
settings screen unmounting the chat; marker contrast 6.82:1 (default), 7.82:1 (light surfaces);
Revert wraps below the label with no overlap at narrow widths, all seven locales. **Not
live-checked:** the translation editor (needs a configured LLM translator) and `Prereroll` (needs
multi-candidate generations) — both covered by tests.

**How to live-check this app (lessons from this session):**
- Claude in Chrome, not the built-in pane (the service worker kills the boot).
- The sidebar avatar sometimes ignores the `computer` tool's clicks after a reload. Calling
  `.click()` from JS on the avatar image's nearest `button, [role=button]` ancestor (a `<span>` at
  about (40, 92) at 1440px wide) works — but a JS `.click()` carries no user activation, so if the
  control you're testing opens a popup (e.g. `window.open`), that call must be a real `computer`
  click instead, or the popup will be silently blocked.
- The "Leave site?" `beforeunload` guard is registered only when `location.hostname ===
  'risuai.xyz'` (`isWeb`, `src/ts/platform.ts`), so it cannot be exercised on the dev host at all —
  don't spend time trying to trigger it there.
- `find` can mislabel which message a control belongs to. Locate controls through
  `.chat-message-container` in JS: index 0 is the newest message, with `.button-icon-edit` and
  `.dyna-icon` inside it.
- Type with real key events (the `type` action) into a focused textarea. Capture listens to
  `input`, so setting `.value` from JS proves nothing.
- A source edit can trigger a full reload back to the home screen; re-select the character.
- Echo is the fixture's model, so reroll needs no API key.
- Restore any setting you change: the layout theme and "클릭해서 수정하기" were both flipped and
  restored this session.

## Next

1. **The composer stage** (Report 20 section 4.5): flush-under-the-old-key-then-restore-under-the-new
   ordering, all three values, and a generation token for the async translate writes. The composer
   mis-send remains live until it lands. **Use input-event capture here too**; the composer has no
   open event, so a touched flag would have nowhere to reset.
2. **Report 21 findings**, awaiting prioritisation: `updateInlayScreen` destroying hand-edited
   custom prompts (confirmed data loss), remote-block read verification, `removeChar`'s missing
   `doingChat` guard, plugin permission caching, `saveTimeoutExecute`'s missing ceiling.
3. **Upstream chores** CHORE-19 to CHORE-24 (Roadmap, per `MC-069`). CHORE-20 (`mobilechat` has no
   touch exit from the editor) should be confirmed on a touch device first. CHORE-22 (no
   accidental-close guard on self-hosted web/the dev server) is decided (`MC-070`) and is the stage
   in progress.

## Other open items

- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists, so `Asset Cache/` itself is not ignored.
- **Card description contrast** on the home screen is 3.32:1 (`text-textcolor2`, repo-wide). This
  is a maintainer decision, not yet raised as work.
- **Per-instance `matchMedia` listener** in `Chat.svelte` for reduced motion. A shared
  module-level source would be cheaper on Pi and mobile.

## Test suite

**77 files, 1085 passed, 4 skipped, 0 failed.** `pnpm check` clean. Run with
`npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.

## Uncommitted work

The openURL code commit and its docs commit, both described above under "Branch and commit
state" — nothing else.

## What this session established about its own method

Gate 2 on durable drafts took seven rounds and one escalation. The lessons are now in AGENTS.md
section 4. In short:
- **Comments narrate invariants, never history.** Most rejections were prose describing a design
  the code no longer had.
- **The keyword grep is necessary, not sufficient.** Rounds 4 to 6 each found sentences with no
  trigger word.
- **Briefs state invariants and acceptance scenarios, not mechanisms.** Round 2's substantive
  rejection came from a mechanism the Orchestrator's brief specified.
- **At the second rejection, ask whether the mechanism is the problem.** The answer here was
  structural, and `senior-advisor` found it.
- **Mutation briefs use the scratchpad**, never in-place edits.

Two more from the live check:
- **A layout fix for one script can break another.** `break-keep`, added for Korean, made the
  spaceless Chinese labels overflow. Measure every locale, including the worst case (Vietnamese
  was the narrowest).
- **A guard's stated reason must be checked against HEAD, not assumed.** Round 7's final check
  found a guard note claiming HEAD "never touches" a registry it actually uses.
