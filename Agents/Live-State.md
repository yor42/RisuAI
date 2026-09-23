# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`, **14 commits ahead of origin, nothing
pushed.**

- `65ca6c0`, `4db160d7`, `094bf505`, `adc838c4`, `5367a3b8`, `6717547d` — the documentation
  restructure, the AGENTS.md fact-check, and the corrections that preceded this work.
- `0558f775` — home-screen Stage 1: three unsanitized `{@html}` sinks closed.
- `d6379a6b` — home-screen Stage 2: the realm preview rebuilt as a Related Links card.
- `131fdcd5` — the locale pass: 510 missing keys filled, nine broken strings repaired.
- `deb873b2` — home-screen Stage 3: the fork-aware Source & Issues disclosure.
- `01d6d96e` — the documentation pass: `MC-059` through `MC-066`, Live-State rewritten,
  Investigation-Ledger rows 110 to 119.
- `16e6f7e9` — live-check fixes: `upstream` pill contrast, CJK heading wrap, card-level
  focus ring.
- `c02aec74` — `MC-067`: a bare Space or Enter reaches a keyboard-focused native control.
- The records commit that follows them: `MC-067`, this file, ledger rows 120 to 124.

## The home-screen rework is COMPLETE

All three stages are committed, and the live browser check has now run. Results below.

**Stage 1** closed three unsanitized `{@html}` sinks, not the two the brief named. The third —
`formatEffectDisplay` in `TriggerV2List.svelte` — was the severe one, reachable by importing a
character card rather than by compromising a server.

**Stage 2** replaced the realm block with a card inside the Related Links grid. Five states
(offline, pending, failed, empty, populated) where there had been one; `getRisuHub` returns a
discriminated `RisuHubResult` with an 8-second `AbortController` bound; `export let
hubAdditionalHTML` deleted and the announcement moved below the grid into a labelled container.

**Stage 3** turned the GitHub card into a disclosure revealing this fork's repository and issues
alongside upstream's, gave the Email card the same treatment, and marked every upstream-owned link.

### The live check RAN. Results below.

Run in Claude in Chrome against the maintainer's dev server on a QHD display (`dpr: 1`, so
every figure below is real CSS pixels). `happy-dom` performs no layout and models neither
paint order nor pointer interception, and Stage 2 produced **four layout defects that passed
941 tests** — so these were measured with `getBoundingClientRect` and `getComputedStyle`
rather than reasoned about.

**Geometry matches every reference value.** At `lg` (viewport 1904) the realm card computes
`grid-column: 3 / span 1`, `grid-row: 1 / span 2`, 384px against its 380px floor, scroller
capped at 200px with `min-h: 0` and 436px of content, so it scrolls. At `md` (864): two
columns, realm `span 2`, 296px, scroller 150px. At base (600): one column, no horizontal
overflow, realm card last. **No fabricated fourth track** — the `lg:col-span-1` fix holds in a
real browser, not just in the compiled CSS.

**Keyboard.** Enter opens the disclosure; Escape closes it and returns focus to the trigger.
Both confirmed directly.

**Tap target — clean.** At `lg` and at mobile, every revealed link's centre *and* both far
corners resolve to the link itself via `elementFromPoint`; the trigger is never hit. The
trigger ends at 477px and the panel starts at 485px.

**No fetch-time layout shift, proved more strongly than planned.** Population beat the poll,
so instead of catching the pending frame the content was varied directly: the card measures
**384px at 0, 2 and 10 items** while the scroller moves 0 -> 84 -> 200. Its height is
content-independent by construction, which is the actual claim.

**Mutual exclusion works — but only under real clicks.** Two synthetic `.click()` calls in one
tick left both disclosures open, which reads as a bug if you stop there. Real mouse clicks
give `true,false` then `false,true`. Drive this with real input or not at all.

### Two defects found, both fixed and re-measured

1. **The `upstream` pill failed WCAG AA.** 12px at weight 400 needs 4.5:1; it measured
   **2.67:1** on the card and **3.01:1** inside the panel — `text-textcolor2` on
   `bg-textcolor2/20`. Changed to `text-textcolor/70`, re-measured live at **6.70/6.76** on the
   cards and **7.41** in the panel. A theme token was used rather than a literal slate value
   because this app is themeable. Note the pill carries `aria-hidden="true"`; that does not
   exempt it, since the text is visible and carries meaning for sighted users.
2. **Korean card titles broke mid-word.** At `lg` the column is 272px and the Korean title for
   Source & Issues rendered split inside its final word. `break-keep` (`word-break: keep-all`)
   re-breaks it at the space instead. Verified by eye, because the line count is unchanged at
   two and a height measurement therefore shows nothing.

### Checked by the maintainer by hand

- **Space on the disclosure trigger: FIXED and hand-verified.** Upstream's default hotkey
  binds bare Space to `focusInput`, and `src/ts/hotkey.ts` called `preventDefault()` on it, so
  Space activated no native `<button>`, `<select>` or `<summary>` anywhere in the app
  (upstream `f5f05bdf`, 2025-03-20). `MC-067`: the hotkey loop now steps aside for a bare
  Space or Enter when a native control has **keyboard** focus (`:focus-visible`). The seam
  is `src/ts/hotkeyYield.ts`. The maintainer confirmed all three cases by hand: the disclosure
  opens, Space after clicking reroll still jumps to the chat input, and Space on a
  Tab-focused chat button activates it.
  **An earlier entry here called Space a harness limitation. That was wrong.** The
  "control" was a plain button injected into the *same page*, so the same document-level
  hotkey swallowed its Space too. A control must be isolated from the thing under test.
- **Focus ring on the disclosure cards: FIXED and hand-verified.** It now sits on the card via
  `has-[>button:focus-visible]` and traces the rounded edge like the single-button cards.
- **The motion path: VERIFIED by the maintainer in Firefox**, where the animation plays.
  In Chrome, `prefers-reduced-motion: reduce` is **on** on the maintainer's machine,
  so the reduced-motion branch verified itself (instant 172px, zero `getAnimations()` entries)
  and the animated branch never ran. It cannot be flipped from the page: `matchMedia` returns a
  distinct `MediaQueryList` per call, so the component's own object is unreachable. Toggling
  Windows Settings -> Accessibility -> Visual effects -> Animation effects flips it live and
  also exercises the component's `change` listener, which nothing else touches.

### Observed, not a defect, recorded so it is not rediscovered

Opening a disclosure grows grid row 2 from 200px to 380px, and the realm card from 384px to
564px. This was predicted from the markup at the planning stage. It reads fine: the sibling
Email card keeps its content top-aligned and the realm card's decorative artwork fills the
extra space. No change made.

**Pre-existing and out of scope:** card description text measures **3.32:1** — `text-textcolor2`
on all five cards alike. It is a repo-wide pattern this stage did not introduce, and changing
the token is a maintainer decision with reach far beyond this screen.

**How to re-run it.** The maintainer starts the dev server (port 5174) and the pane must be
visible. The built-in browser pane **cannot boot this app** — its service-worker registration
fails and `registerSw()` is awaited unguarded, so the bootstrap dies at "Checking Service
Worker...". Use Claude in Chrome. The window must not be maximised or Chrome ignores resize
requests, and a phone-width RDP session cannot reach `md` or `lg`. The screenshot tool's
coordinate frame is scaled ~0.82x from CSS pixels on this display, so click by element `ref`,
not by coordinate. Move the mouse away before measuring — `hover:-translate-y-1` produces 4px
artifacts.

## Durable drafts — NEXT. Resume here after the compaction

**Do not re-open the question of whether this stage is finished.** It was checked against
`Agents/Reports/20-durable-drafts-plan.md` and is not. `MC-055` paused it until the home-screen
rework was done. That is now true, including the live check, so the stage resumes.

Built and matching the plan section by section, for the main message editor only:
`src/ts/draftContents.ts` (LRU-bounded, identity-keyed), `src/ts/draftContentOrphanGate.ts` (60s
cap, swept on `saveDb`'s existing cadence), and `src/lib/ChatScreens/Chat.svelte`. The
uncommitted work passes as part of the current suite (72 files, 993 passed, 4 skipped).

**Genuinely missing:**

1. **The translation editor's capture is entirely unwired.** `draftContents.ts` implements
   `TranslationIdentity` and has namespacing tests for it, but `Chat.svelte` imports only
   `MessageIdentity`. `loadTranslationForEdit` and `saveTranslationEdit` contain no draft-store
   call at all.
2. **The visible restore marker and one-click revert exist on neither surface.** This is
   `MC-042`, a maintainer decision.
3. **Gate 2 (the `opus-reviewer` mutant gate) never ran.**
4. **No live check in a browser.**

### Resume plan

**Step 0: re-read before briefing anyone.** Report 20 sections 4.3, 4.4, 5.2, 5.4 and 11 hold the
constraints. Section 5.4 is binding, not advisory:
- the marker and revert must exist on **both** edit surfaces: `textBox()`'s `AutoresizeArea`
  and the `cardboard` theme's raw `<textarea>`. Marker on one only is a silent restore for the
  other theme's users.
- a revert **deletes the record**, or the rejected draft is offered again on the next open.
- for a `tr:` record the revert target is the **cached translation** that
  `loadTranslationForEdit` seeded, not the record's `baseData`.
- per 4.4, long-press on the **original-text** textarea discards, while long-press on the
  **translation** textarea **saves**. The clear-on-exit list follows each editor.

**Step 1: one question for the maintainer before implementation.** `MC-042` fixes *that* a
marker and a revert exist, not how they look or what they say. Propose a concrete design
matching the home-screen work (lucide icon, subtle motion, theme tokens, contrast measured) and
get a yes. New strings need keys in all seven locales through the `translator` agent. The
Korean "source" slip shows why word choice needs care.

**Step 2: implement items 1 and 2 together, red tests first.** They share the same surfaces and
the `tr:` revert target couples them. `sonnet-coder` for source, `test-warrior` for tests.

**Step 3: Gate 2.** `opus-reviewer`, fresh, over the whole durable-drafts diff, with mutations.
This is persistence work, so it gets the high-rigour tier.

**Step 4: live check in Chrome.** Reproduce Path 1 from Report 20 section 2.1 (the one-click
loss) and confirm the draft survives, the marker shows and revert works, on **both** the
default and `cardboard` themes and for the translation editor. Use the lessons in the live-check
section above: click by element `ref`, and any control must be isolated from the page under test.

**Step 5: commit durable drafts on its own.** That unblocks `src/ts/globalApi.svelte.ts` for the
two deferred `openURL` fixes below.

## Deferred, and both blocked on the same file

`src/ts/globalApi.svelte.ts` carries the uncommitted durable-drafts work, so neither of these has
been touched. Do them when that file unblocks:

- **`openURL` has no `noopener`.** It is a bare `window.open(url, "_blank")`, and Stage 1 made
  realm-controlled URLs a consumer of it. Deferred by maintainer decision, **not** because it was
  judged unimportant.
- **`window.open` with a `mailto:` leaves a blank tab** once the OS mail client takes over. Stage 3
  added two `mailto:` destinations that route through it.

## Other open items

- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists, so `Asset Cache/` itself is not ignored. Nothing is exposed today, but a
  plugin bundle landing there would not be covered.
- **Composer stage** — split out of durable drafts by maintainer decision. Needs
  flush-under-the-old-key-then-restore-under-the-new ordering, all three values, and a generation
  token for the async translate writes. The composer mis-send remains live until it lands.
- **Report 21 findings** awaiting prioritisation: `updateInlayScreen` destroying hand-edited custom
  prompts (confirmed data loss), remote-block read verification, `removeChar`'s missing `doingChat`
  guard, plugin permission caching, `saveTimeoutExecute`'s missing ceiling.

## Locales

All seven files are at **1560 leaf keys**, zero missing, zero present that `en.ts` lacks, and 50
CBS tag names each with none unknown to English. Two verification scripts live in the session
scratchpad and should be rewritten if needed rather than trusted from memory: one evaluates each
module with the repo's own esbuild and compares keys and placeholders; the other audits CBS tag
names. **A line-based parser cannot do this** — `en.ts` has 74 arrow-function values whose braces
drift a brace-counting stack, and the first attempt reported ~77 missing and ~56 stale keys per
locale, uniformly, including a key English plainly has.

Three changes this session modify existing translations rather than adding to them, each on an
explicit maintainer decision and each recorded as an authorised exception: `MC-063` (Latin
`Risuai`), `MC-064` (人设), and the Spanish register harmonisation.

## Test suite

**72 files, 993 passed, 4 skipped, 0 failed.** `pnpm check` clean. Run with
`npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"` — the bare command picks
up a stray worktree under `.claude/` and reports phantom failures.

## Uncommitted work

**Durable drafts only**, exactly as described above: `src/lib/ChatScreens/Chat.svelte`,
`src/ts/globalApi.svelte.ts`, `src/ts/draftContents.ts`, `src/ts/draftContents.test.ts`,
`src/ts/draftContentOrphanGate.ts`, `src/ts/draftContentOrphanGate.test.ts`,
`src/lib/ChatScreens/Chat.messageEditor.svelte.test.ts`.

## What this session established about its own method

Five gate rounds ran across two stages. **Four rejected.** Three found defects no test could have
caught: a Tailwind cascade bug proved by compiling the classes through the repo's own build, an
accessibility regression that two tests had pinned as correct, and a plan instructing an agent to
violate its own documented contract.

Three separate artifacts shipped false statements before being caught — a code comment, a test
header, and the commit message. None affected runtime; all three would have misled the next reader.
**Gate the prose the same way as the code.**

And twice a measurement that looked authoritative was wrong: the line-based locale parser above,
and a `grep` for `\r` that reports zero regardless of truth in this shell. Count bytes with
`tr -cd '\r' | wc -c` instead.

The live check added a third: a "control" that proved nothing. A plain button injected into the
same page also ignored Space, which looked like proof of a harness limit. It was the same
document-level hotkey swallowing both. The maintainer's hand test caught it. **A control must be
isolated from the thing under test.** Separately, the Orchestrator's own brief added an ARIA-role
list the maintainer never chose, and the gate caught it regressing about 30 of the app's own
controls. A brief can widen a decision just as an implementer can.
