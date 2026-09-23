# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state — do
not treat it as a log or history. For durable doctrine and constraints, see
`Agents/Phase2-Handoff.md`. For the document index, see `Agents/README.md`. For maintainer
decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-23.

## Branch and commit state

Branch `fix/persistence-conflict-platform-hardening`, **4 commits ahead of origin, nothing pushed**.
The four commits are all documentation: `65ca6c0` (the restructure), `4db160d7` and `adc838c4`
(this file brought up to date), `094bf505` (AGENTS.md corrected against source, plus the
release-status entry).

**Everything described below is uncommitted.** Three unrelated bodies of work are live in the tree
at once; the "Uncommitted work" section at the end groups the files by which one they belong to.

## Current work: the home-screen rework

`src/lib/UI/MainMenu.svelte`, mounted from `src/lib/ChatScreens/DefaultChatScreen.svelte` and from
nowhere else. Three stages, each with its own plan gate.

**Stage 1 — sanitize the unsanitized `{@html}` sinks. REJECTED at the gate on 2026-09-23;
remediation in flight.**

**Stage 1b did not close the sink it was written to close.** In `formatEffectDisplay`, the
expression `(language.triggerDesc[type + 'Desc'] as string || type)` falls back to the **raw,
card-controlled `type` string** when the key is missing, and `.replace(/{{(.+?)}}/g, ...)` rewrites
nothing because a hostile payload contains no `{{ }}` holes. That string is interpolated unescaped
into the returned `<div>` and rendered with `{@html}`. `checkSupported` does not gate it: an
unknown effect name is always "supported" on a trigger whose own type is neither `display` nor
`request`. The fix escaped the ten `{{…}}` holes and missed the eleventh interpolation — the
template itself. **A payload placed in `type` is a strictly easier route than the one that was
closed.** Verified by running the module, not inferred.

Two artifacts also asserted the invariant this falsifies — the comment above `escapeHtml`, and the
spec suite named "escaping holds in every branch". Both are being corrected; neither claim may
reach a commit message.

The stage brief claimed exactly two unsanitized sinks. That is wrong: the repo has 15 `{@html}`
sites across 12 files, and **three** carry unsanitized input. The third is more severe than the two
the brief was written about.

- *Stage 1a* — `src/ts/hubHtml.ts` (new) exports `sanitizeHubHtml` (DOMPurify allowlist:
  `ALLOWED_TAGS` prose/formatting plus `a`, `ALLOWED_ATTR: ['href']`, `ALLOWED_URI_REGEXP`
  restricted to http/https) and `handleHubHtmlClick` (delegates to the nearest anchor, restricts
  to http/https, routes through `openURL`). Applied at both `hubAdditionalHTML` sinks,
  `MainMenu.svelte` and `RealmMain.svelte`. Spec: `src/ts/hubHtml.test.ts`, 13 tests, mutation
  verified.
- *Stage 1b* — `src/lib/SideBars/Scripts/TriggerV2List.svelte`'s `formatEffectDisplay`
  interpolated `effect[field]` into `<span>` markup with no escaping, rendered with `{@html}`.
  `src/ts/characterCards.ts` fills that data on character-card import
  (`triggerscript: data?.extensions?.risuai?.triggerscript ?? []`) with no validation, so **an
  imported character card was a stored-XSS carrier** — a far wider attack surface than the realm
  sinks, which need control of upstream's realm server. Fixed by escaping the interpolated holes,
  not by sanitizing the assembled string, because the surrounding markup is the app's own. Logic
  extracted to `src/ts/triggerEffectDisplay.ts` so the composition is testable.

**Open questions the Stage 1 gate must answer:**

1. `src/ts/parser/parser.svelte.ts` registers three **global** `DOMPurify.addHook` side effects on
   the shared singleton at import time. One does `node.setAttribute('target', '_blank')` for
   http(s) hrefs, so in production `sanitizeHubHtml` emits an attribute its own `ALLOWED_ATTR`
   excludes. Harmless today, but a new security boundary now depends on shared mutable state that
   any importer can change. `createDOMPurify(window)` would give the boundary its own hook table.
   **Not done — deliberately left for the gate rather than expanded into unreviewed scope.**
2. `hubHtml.test.ts` mocks `globalApi.svelte`, so `parser.svelte.ts` never loads under test and the
   suite does not observe production sanitizer output.
3. Stage 1b's extraction is **not** move-only. `checkSupported` gained an explicit
   `EffectSupportContext` parameter because it closed over component state. Reads still happen at
   call time inside the same reactive context, so tracking is preserved — but
   `categoryTriggers.filter(checkSupported)` now allocates a context object **per element**, which
   matters in a performance campaign.
4. Both `hubAdditionalHTML` sinks gained a wrapper `<div>`, so the injected nodes are no longer
   direct flex children, and that div renders even when the string is empty.

**Stage 2 — home-screen layout. Not started.** Per `MC-053`, the realm block becomes a card inside
the Related Links grid — a taller card holding a compact preview list — rather than a full-width
section above it. That dissolves the mobile-fold problem by construction instead of by reordering.

Stage 2 also carries `MC-057`: the widget renders a visible pending state — a spinner plus
"loading..." — because the `{#await}` has no pending branch today and a fetch in flight renders
nothing at all. No new `src/lang` key is needed (`language.loading` exists; `animate-spin` is
already used in `src/lib`). The spinner must sit inside the card's committed height so it does not
reintroduce the shift `MC-053` removes, and needs `role="status"` or an `aria-live` region to be
announced at all.

Stage 2 also carries `MC-056`: the realm feed must distinguish a failed fetch from an empty result.
This is **not** a wording change confined to `MainMenu.svelte` — `getRisuHub` destroys the
distinction inside `src/ts/characterCards.ts` by catching everything and returning `[]`, so its
contract changes, and `RealmMain.svelte` is a second consumer that moves with it. The plan gate
should settle all four states at once (in flight, failed, empty, populated) including the missing
fetch timeout, rather than fixing the wording and leaving two states still indistinguishable.

**Stage 3 — a "Source & Issues" disclosure. Not started.** Must work by tap and by keyboard; hover
may only ever be an enhancement. Per `MC-054`, standardise on the `Exy3NrqkGm` Discord invite
(`Communities.svelte` still carries the stale `JzP8tB9ZK8`) and mark upstream-owned links with a
grey `upstream` label.

**Defects found in the realm fetch, recorded but not fixed:** `getRisuHub` has no fetch timeout;
it returns `jso.cards` which can be `undefined` on a 200 response lacking a `cards` key, and
`MainMenu.svelte` then calls `charas.length` with no `{:catch}` branch anywhere; the `{:else}`
branch renders "Failed to load" whenever the list is merely *empty*, so a working-but-empty realm
reports a failure that did not happen. Also `hubAdditionalHTML` is a plain module binding in a
`.ts` file, not a rune — `RealmMain.svelte` reads it at top-level template position, so its copy is
frozen at mount and never updates when sort/search/NSFW refetch. **The `{#await}` does not
re-invoke on re-render** — this was traced through Svelte's compiled `await.js`, not assumed.

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

## Documentation restructure

D1 and D2 are complete and committed. D3 was assessed and deliberately skipped. `AGENTS.md` was
fact-checked against source in `094bf505` — eleven claims were wrong, stale or materially
incomplete.

Uncommitted documentation work from an earlier session, verified complete and coherent:
`MC-052` (retires the "long-lived community fork" characterization as context cross-contamination),
its back-pointer on `MC-033`, and the matching note in Report 13. `MC-033`'s **Reasoning:** line
was corrected this session — it still repeated the retired claim in the author's own paraphrase,
below the back-pointer. `MC-053`, `MC-054` and `MC-055` were added this session.

**One open item is not documentation:** the `.gitignore` entry for
`Asset Cache/Community Mitigation_Webrowser Plugin/` names a path that no longer exists, so
`Asset Cache/` itself is not ignored. Nothing is exposed today — `git status --untracked-files=all`
is clean there — but a plugin bundle landing in that folder would not be covered.

## Test suite

Last full run: **61 files, 849 passed, 4 skipped, 0 failed**. `pnpm check` clean. A spec for
`src/ts/triggerEffectDisplay.ts` was still being written when this was recorded, so the file count
is expected to rise by one.

## Uncommitted work

**Documentation** (finished, safe to commit): `Agents/Maintainer-Context.md`,
`Agents/Reports/13-chore07-cold-read-failure-plan.md`.

**Home-screen Stage 1** (implemented, gate not run): `src/lib/UI/MainMenu.svelte`,
`src/lib/UI/Realm/RealmMain.svelte`, `src/lib/SideBars/Scripts/TriggerV2List.svelte`,
`src/ts/hubHtml.ts`, `src/ts/hubHtml.test.ts`, `src/ts/triggerEffectDisplay.ts`.

**Durable drafts** (paused, incomplete): `src/lib/ChatScreens/Chat.svelte`,
`src/ts/globalApi.svelte.ts`, `src/ts/draftContents.ts`, `src/ts/draftContents.test.ts`,
`src/ts/draftContentOrphanGate.ts`, `src/ts/draftContentOrphanGate.test.ts`,
`src/lib/ChatScreens/Chat.messageEditor.svelte.test.ts`.
