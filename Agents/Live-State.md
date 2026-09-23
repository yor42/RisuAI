# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23 to 2026-09-24.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`, **16 commits ahead of origin, nothing
pushed**, once the two commits below land.

- Earlier this session: `16e6f7e9` (home-screen live-check fixes), `c02aec74` (`MC-067`, Space
  and Enter reach a keyboard-focused control), `fe90145e` (their records).
- `e250089a` — **the durable-drafts code commit:** `src/`, the seven locale files and the tests.
- **The records commit that follows it:** this file, `AGENTS.md` section 4, `MC-068` and `MC-069`,
  Report 20 sections 4, 9 and 11, Roadmap CHORE-19 to CHORE-21, and ledger rows 125 to 141.

## Durable drafts is DONE

Report 20's stage, minus the pieces split out by decision (the composer, section 4.5;
`PartialEditController`, section 4.6). Text typed into the message editor or the translation
editor survives an involuntary unmount. A restored draft shows the `MC-068` marker, with its age and
a one-click Revert. Report 20 section 11 has the full Gate 2 record.

**The mechanism, in one line:** capture runs on the edit surfaces' `input` events
(`captureMessageEdit` / `captureTranslationEdit` in `Chat.svelte`, fed by `TextAreaResizable`'s
`onUserEdit` and cardboard's `oninput`), never on changes to the bound buffer. **Do not move
capture back into an `$effect`.** An effect cannot tell the user's writes from the component's own
(open, revert, the translation save's write-back). Three gate rounds were lost to exactly that.

**Live-checked in Chrome:**
- Path 1 (type, reroll, unReroll, reopen): draft restored with the marker, on the default and
  `cardboard` layouts.
- Revert works; the age reads correctly; the cardboard card height is unchanged.
- A `mobilechat` draft survived the settings screen unmounting the chat.
- Marker contrast: 6.82:1 on the default layout, 7.82:1 on the light surfaces.
- Narrow widths, all seven locales: the Revert button wraps below the label, with no overlap.

**Not live-checked:** the translation editor (it needs a configured LLM translator) and `Prereroll`
(it needs multi-candidate generations). Both are covered by tests.

**How to live-check this app (lessons from this session):**
- Claude in Chrome, not the built-in pane (the service worker kills the boot).
- The sidebar avatar sometimes ignores the `computer` tool's clicks after a reload. Calling
  `.click()` from JS on the avatar image's nearest `button, [role=button]` ancestor (a `<span>` at
  about (40, 92) at 1440px wide) works.
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

1. **The two deferred `openURL` fixes**, now unblocked because `globalApi.svelte.ts` is committed:
   - `openURL` is a bare `window.open(url, "_blank")` with no `noopener`, and Stage 1 made
     realm-controlled URLs a consumer of it.
   - `window.open` with a `mailto:` leaves a blank tab once the OS mail client takes over.
2. **The composer stage** (Report 20 section 4.5): flush-under-the-old-key-then-restore-under-the-new
   ordering, all three values, and a generation token for the async translate writes. The composer
   mis-send remains live until it lands. **Use input-event capture here too**; the composer has no
   open event, so a touched flag would have nowhere to reset.
3. **Report 21 findings**, awaiting prioritisation: `updateInlayScreen` destroying hand-edited
   custom prompts (confirmed data loss), remote-block read verification, `removeChar`'s missing
   `doingChat` guard, plugin permission caching, `saveTimeoutExecute`'s missing ceiling.
4. **Upstream chores** CHORE-19 to CHORE-21 (Roadmap, per `MC-069`). CHORE-20 (`mobilechat` has no
   touch exit from the editor) should be confirmed on a touch device first.

## Other open items

- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists, so `Asset Cache/` itself is not ignored.
- **Card description contrast** on the home screen is 3.32:1 (`text-textcolor2`, repo-wide). This
  is a maintainer decision, not yet raised as work.
- **Per-instance `matchMedia` listener** in `Chat.svelte` for reduced motion. A shared
  module-level source would be cheaper on Pi and mobile.

## Test suite

**75 files, 1053 passed, 4 skipped, 0 failed.** `pnpm check` clean. Run with
`npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.

## Uncommitted work

None once the two commits land. Never commit, revert or re-record the line-ending churn in the
risuaccess `modules.test.ts.snap`.

## What this session established about its own method

Gate 2 took seven rounds and one escalation. The lessons are now in AGENTS.md section 4. In short:
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
