# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`, **10 commits ahead of origin, nothing
pushed.**

- `65ca6c0`, `4db160d7`, `094bf505`, `adc838c4`, `5367a3b8`, `6717547d` — the documentation
  restructure, the AGENTS.md fact-check, and the corrections that preceded this work.
- `0558f775` — home-screen Stage 1: three unsanitized `{@html}` sinks closed.
- `d6379a6b` — home-screen Stage 2: the realm preview rebuilt as a Related Links card.
- `131fdcd5` — the locale pass: 510 missing keys filled, nine broken strings repaired.
- `deb873b2` — home-screen Stage 3: the fork-aware Source & Issues disclosure.

## The home-screen rework is COMPLETE

All three stages are committed. What remains is **one live browser check**, below.

**Stage 1** closed three unsanitized `{@html}` sinks, not the two the brief named. The third —
`formatEffectDisplay` in `TriggerV2List.svelte` — was the severe one, reachable by importing a
character card rather than by compromising a server.

**Stage 2** replaced the realm block with a card inside the Related Links grid. Five states
(offline, pending, failed, empty, populated) where there had been one; `getRisuHub` returns a
discriminated `RisuHubResult` with an 8-second `AbortController` bound; `export let
hubAdditionalHTML` deleted and the announcement moved below the grid into a labelled container.

**Stage 3** turned the GitHub card into a disclosure revealing this fork's repository and issues
alongside upstream's, gave the Email card the same treatment, and marked every upstream-owned link.

### What only a browser can still check

`happy-dom` performs no layout and models neither paint order, pointer interception, nor native
focus traversal. Stage 2 produced **four layout defects that passed 941 tests**. These remain
unverified:

1. **Enter and Space on the disclosure trigger.** Provably untestable here — `happy-dom` does not
   implement the browser's Enter/Space-to-click default action for synthetic events, and real
   browsers fire it only for trusted ones, so a test would behave identically against a correct
   implementation and a deleted `onclick`. **This is the only verification that behaviour will
   ever get.**
2. **The slide/fade transitions**, and again with `prefers-reduced-motion` set. They never run
   under test at all: the component collapses their duration to zero when
   `Element.prototype.animate` is absent, which is how the suite passes.
3. **The tap target.** A trigger stretched over the whole card would intercept taps on the links it
   reveals. Closed-state screenshots look perfect and every DOM test passes.
4. **The Email card's grid reflow.** Opening a disclosure grows its row; the sibling card shares
   that row and is `justify-center`, so its content will drift. Predicted from the markup, not
   observed. If it reads badly, `items-start` on the grid or `self-start` on the card fixes it —
   but either changes how all five cards size.
5. **Contrast** on the grey `upstream` pill and the `bg-black/30` panel. Stage 2 hit exactly this:
   `textcolor2` on the realm card measured about 1.3:1 and had to be replaced.

**The maintainer starts the dev server (port 5174) and the pane must be visible.** The built-in
browser pane **cannot boot this app** — its service-worker registration fails and `registerSw()` is
awaited unguarded, so the bootstrap dies at "Checking Service Worker...". Use Claude in Chrome. A
phone-width RDP session cannot reach the `md` or `lg` breakpoints; the window must also not be
maximised, or Chrome ignores resize requests.

## Durable drafts — PAUSED, verified incomplete

**Do not re-open the question of whether this stage is finished.** It was checked against
`Agents/Reports/20-durable-drafts-plan.md` and is not. See `MC-055`. It resumes **now** that the
rework is done, per the same decision.

Built and matching the plan section by section, for the main message editor only:
`src/ts/draftContents.ts` (LRU-bounded, identity-keyed), `src/ts/draftContentOrphanGate.ts` (60s
cap, swept on `saveDb`'s existing cadence), and `src/lib/ChatScreens/Chat.svelte`.

**Genuinely missing:**

1. **The translation editor's capture is entirely unwired.** `draftContents.ts` implements
   `TranslationIdentity` and has namespacing tests for it, but `Chat.svelte` imports only
   `MessageIdentity`. `loadTranslationForEdit` and `saveTranslationEdit` contain no draft-store
   call at all.
2. **The visible restore marker and one-click revert exist on neither surface** — this is
   `MC-042`, a maintainer decision.
3. **Gate 2 (the `opus-reviewer` mutant gate) never ran.**
4. **No live check in the browser pane.**

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

**70 files, 972 passed, 4 skipped, 0 failed.** `pnpm check` clean. Run with
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
