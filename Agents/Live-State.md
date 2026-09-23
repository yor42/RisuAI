# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`, **6 commits ahead of origin, nothing pushed.**

- `65ca6c0`, `4db160d7`, `094bf505`, `adc838c4` — the documentation restructure and the AGENTS.md
  fact-check.
- `5367a3b8` — three over-propagated claims corrected, six maintainer decisions recorded.
- `0558f775` — Stage 1 of the home-screen rework: three unsanitized `{@html}` sinks closed.

**The only uncommitted work is the paused durable-drafts source.** See the last section.

## Home-screen rework

`src/lib/UI/MainMenu.svelte`, mounted from `src/lib/ChatScreens/DefaultChatScreen.svelte` and from
nowhere else. Three stages, each with its own plan gate.

### Stage 1 — DONE, committed as `0558f775`

Three unsanitized `{@html}` sinks, not the two the brief named. A sweep found 15 `{@html}` sites
across 12 files; three carried unsanitized input.

- `src/ts/hubHtml.ts` — sanitizes the realm feed (`hubAdditionalHTML`) through a DOMPurify
  allowlist on a **private instance** (`createDOMPurify(window)`), because `parser.svelte.ts`
  registers three global hooks at import time that measurably altered this boundary. Anchors route
  through `openURL`, restricted to http/https locally rather than inside `openURL`, because
  `MainMenu`'s own `relatedLinks` opens a `mailto:`.
- `src/ts/triggerEffectDisplay.ts` — escapes `formatEffectDisplay`'s interpolated holes. This was
  the severe sink: `characterCards.ts` imports `triggerscript` from character cards with **no
  validation**, so an imported card was a stored-XSS carrier. The realm sinks by contrast need
  control of upstream's realm server.

72 tests, every one mutation-verified, including three component tests that fail when a sink is
disconnected — the modules had been thoroughly tested while the wiring had no guard at all.

**Round 1 rejected this stage, and the reason is worth carrying forward.** The fix escaped the ten
`{{…}}` holes and missed the eleventh interpolation — the template itself.
`(language.triggerDesc[type + 'Desc'] || type)` falls back to the raw, card-controlled
`effect.type`; `.replace` rewrites nothing because a payload contains no holes; and
`checkSupported` treats every unknown effect name as supported. Two artifacts asserted the
escaping invariant while it was false.

**Open follow-up, deliberately deferred (maintainer decision, 2026-09-23).** `openURL` does a bare
`window.open(url, "_blank")` with no `noopener`, so an opened page keeps a `window.opener` handle
on the app window, and Stage 1 makes realm-controlled URLs a consumer of that path for the first
time. **Deferred because `src/ts/globalApi.svelte.ts` carries uncommitted durable-drafts work** —
fixing it there would entangle two independent stages in one file — **not because it was judged
unimportant.** Do it once durable drafts unblocks that file.

### Stage 2 — home-screen layout. Not started.

Per `MC-053`, the realm block becomes a **card inside the Related Links grid** — a taller card
holding a compact preview list — rather than a full-width section above it. That dissolves the
mobile-fold problem by construction instead of by reordering.

Per `MC-057`, the widget renders a visible pending state: a spinner plus "loading...". No new
`src/lang` key is needed (`language.loading` exists, `animate-spin` is already used in `src/lib`).
The spinner must sit **inside** the card's committed height so it does not reintroduce the shift
`MC-053` removes, and needs `role="status"` or an `aria-live` region to be announced at all.

Per `MC-056`, the feed must distinguish a failed fetch from an empty result. **This is not a
wording change confined to `MainMenu.svelte`:** `getRisuHub` destroys the distinction inside
`src/ts/characterCards.ts` by catching everything and returning `[]`, so its contract changes, and
`RealmMain.svelte` is a second consumer that moves with it. The plan gate should settle all four
states at once — in flight, failed, empty, populated — including the missing fetch timeout, rather
than fixing the wording and leaving two states indistinguishable.

### Stage 3 — a "Source & Issues" disclosure. Not started.

Must work by tap and by keyboard; hover may only ever be an enhancement. Per `MC-054`, standardise
on the `Exy3NrqkGm` Discord invite (`Communities.svelte` still carries the stale `JzP8tB9ZK8`) and
mark upstream-owned links with a grey `upstream` label.

### Realm-fetch defects, recorded and not yet fixed

`getRisuHub` has no fetch timeout. It returns `jso.cards`, which is `undefined` on a 200 response
lacking a `cards` key, and `MainMenu.svelte` then calls `charas.length` with no `{:catch}` branch
anywhere in the block. `hubAdditionalHTML` is a plain module binding in a `.ts` file, not a rune —
`RealmMain.svelte` reads it at top-level template position, so its copy is frozen at mount and
never updates when sort/search/NSFW refetch. **The `{#await}` does not re-invoke on re-render** —
traced through Svelte's compiled `await.js`, not assumed.

## Durable drafts stage — PAUSED, verified incomplete

**Do not re-open the question of whether this stage is finished.** It was checked against
`Agents/Reports/20-durable-drafts-plan.md` on 2026-09-23 and is not. See `MC-055`. Resume **after**
the home-screen rework, per the same decision.

Built, complete, and matching the plan section by section — the main message editor only:

- `src/ts/draftContents.ts` — LRU-bounded (200 records), identity-keyed, no index fallback.
- `src/ts/draftContentOrphanGate.ts` — 60s registration cap, swept on `saveDb`'s existing cadence,
  no new timer. The two bounds are independent, as §6.1 specifies.
- `src/lib/ChatScreens/Chat.svelte` — identity frozen at open, seeding precedence, both edit
  surfaces bound to the buffer, §5.5 deliberately not adopted.

`src/ts/localDrafts.ts` and its test are byte-untouched — confirmed by git, not by reading. That is
the stage's own falsifier for the two-map split.

**Genuinely missing:**

1. **The translation editor's capture is entirely unwired.** `draftContents.ts` implements
   `TranslationIdentity` and has namespacing tests for it, but `Chat.svelte` imports only
   `MessageIdentity` and never constructs the other. `loadTranslationForEdit` and
   `saveTranslationEdit` contain no draft-store call at all.
2. **The visible restore marker and one-click revert exist on neither surface** — this is
   `MC-042`, a maintainer decision. A case-insensitive search for `revert` or `restored` in
   `Chat.svelte` returns nothing.
3. **Gate 2 (the `opus-reviewer` mutant gate) never ran.** Report 20 §11 stops at "proceeding to
   ... Gate 2". The author's own tests do encode the plan's named mutants, which is real
   red-before-green coverage — but that is not the same artefact as the gate.
4. **No live check in the browser pane.**

No unscoped additions were found: every function, constant and comment traces to a numbered section
of Report 20. `git stash list` is empty; every dangling commit predates the stage.

## Composer stage

Split out of durable drafts by maintainer decision. Needs flush-under-the-old-key-then-restore-
under-the-new-key ordering; all three values (`messageInput`, `messageInputTranslate`,
`fileInput`); and a generation token for the async translate writes. The composer mis-send remains
live until this lands.

## Report 21 (deferral re-review)

Findings awaiting prioritisation: `updateInlayScreen` destroying hand-edited custom prompts
(confirmed data loss); remote-block read verification; `removeChar`'s missing `doingChat` guard;
plugin permission caching (needs verification first); `saveTimeoutExecute`'s missing ceiling; doc
corrections.

## Documentation

D1 and D2 of the restructure are complete and committed; D3 was assessed and deliberately skipped.
`AGENTS.md` was fact-checked against source in `094bf505` — eleven claims were wrong, stale or
materially incomplete.

`5367a3b8` corrected three instances of one recurring failure — a true maintainer statement widened
by one step, with the widening never marked. `MC-026` (a referent slipped between this fork's
maintainer and upstream's developer), `MC-052` (a comparison to other forks became a claim about
this fork), `MC-058` (an offer to review ko/en became a ban on editing `src/lang`). **When
restating something the maintainer said, keep the scope they gave it.**

**One open item is not documentation:** the `.gitignore` entry for
`Asset Cache/Community Mitigation_Webrowser Plugin/` names a path that no longer exists, so
`Asset Cache/` itself is not ignored. Nothing is exposed today — `git status --untracked-files=all`
is clean there — but a plugin bundle landing in that folder would not be covered.

## Test suite

**64 files, 906 passed, 4 skipped, 0 failed.** `pnpm check` clean. Run with
`npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"` — a stray worktree under
`.claude/worktrees/` produces phantom failures otherwise.

## Uncommitted work

**Durable drafts only** (paused, incomplete — see above): `src/lib/ChatScreens/Chat.svelte`,
`src/ts/globalApi.svelte.ts`, `src/ts/draftContents.ts`, `src/ts/draftContents.test.ts`,
`src/ts/draftContentOrphanGate.ts`, `src/ts/draftContentOrphanGate.test.ts`,
`src/lib/ChatScreens/Chat.messageEditor.svelte.test.ts`.
