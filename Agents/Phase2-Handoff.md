# Phase 2 Initiation Brief — RAM / Rendering Performance (checkpoint 2)

You are the **Opus 5 Senior Orchestrator** for the RisuAI stabilization campaign.
Governance is in `AGENTS.md`; agent profiles are in `.claude/agents/`. Read AGENTS.md
section 1 (routing), 1.2 (escalation ladder), 1.3 (investigation tiers) and 4 (review gates)
before dispatching anything.

*This brief replaces the original Phase 2 brief. The module-editor work it proposed is done,
and it shipped a different design from the one that brief recommended — see "What is done".*

## Standing constraints

- **English only** in all thinking, subagent briefs, and replies.
- **No blind over-reading.** Delegate surveys; read only what a decision needs.
- **You do not write application code.** All `.ts` / `.svelte` / `.rs` / `.yml` edits — test files
  included — go through `sonnet-coder` or `test-warrior`. You may edit `AGENTS.md`,
  `Agents/*.md` and `.claude/agents/*.md` directly.
- **Do not overwrite, revert, or clean existing uncommitted changes without asking.**
- **Commit or push only when the maintainer asks.** Commits are local unless told otherwise.
- **COMPATIBILITY INVARIANT.** Upstream-compatible characters, modules, presets, backup `.bin`
  files and plugins must keep working. Any breaking proposal needs explicit approval plus
  impact / migration / fallback analysis.
- **Targeted stabilization, not a rewrite.**

## Repo state at handoff

- Branch `fix/persistence-conflict-platform-hardening`, **56 commits ahead of `origin/main`**
  (`669b12ce`), 0 behind. Pushed to `origin` (`yor42/RisuAI`) and in sync with its tracking
  branch (0 ahead / 0 behind, verified with `git rev-list --left-right --count HEAD...@{u}`).
- Baselines, verified on the committed tree: `pnpm test` **32 files, 377 passed, 3 skipped,
  exit 0**; `pnpm check` **0 errors / 0 warnings, exit 0**. `cargo check` not run recently.
- **History was rewritten on 2026-09-21** (a plugin-bundle purge, then a rebase back onto the
  true main base). Every SHA on this branch changed twice that day. SHAs cited in `Agents/**.md`
  were remapped and audited. **Find a commit by its message, not by a remembered hash.**
- `src/ts/process/mcp/risuaccess/tests/__snapshots__/modules.test.ts.snap` sometimes shows modified
  with an **empty, line-endings-only diff** after `pnpm test`. Never commit it, revert it, or
  re-record it. Upstream branch `cubicj-fix-vitest-snapshot-churn` may fix this properly.
- A dev server may still be running on port 5174 from the last session.

## What is done — the module-editor keystroke freeze

Typing in a module text field froze the UI. **Fixed in two stages, and both are load-bearing.**

| Stage | Commit | What it did |
|---|---|---|
| A | `f4867e63` | Narrowed the GUI-side effect (`stores.svelte.ts:197`) to the 4 fields `moduleUpdate()` reads |
| B | `847bb8e8` | **Partitioned** the save-side effect (`dbChangeEffects.svelte.ts:54-71`): outer effect over array shape plus one child per module |

**Measured in the live app** (module editor open, real input events, i9-13900K, dev build):

| Modules | Before | After |
|---|---|---|
| 52 | 13.2 ms | 1.9 ms |
| 104 | 25.1 ms | 1.8 ms |
| scaling 52→104 | 1.9x | **0.95x — flat** |

Stage B was first planned as a **draft copy** of the edited module. That design was rejected at two
`opus-reviewer` gates and retired after a `senior-advisor` escalation. Do not revive it as a
performance fix. Evidence: `Agents/Reports/10-stage-b-module-draft-copy-plan.md`. What shipped:
`Agents/Reports/11-stage-b-module-effect-partition-plan.md`.

## Doctrine learned this checkpoint — read before touching any effect

1. **Partition, never narrow, a dirty-tracking effect.** In `dbChangeEffects.svelte.ts` the tracker
   flags decide whether a block is encoded **at all**, so a missed mutation is never written — silent
   data loss, not a late save. *Narrowing* (reading fewer dependencies) loses writes; the `:19-24`
   presets comment records a real bug from exactly that (`8bc0f426`). *Partitioning* keeps the
   dependency set identical but splits it across per-element effects. That is what made Stage B
   safe. Roadmap Phase 2 item 2 now carries a warning against its old "shallow signals" suggestion.
2. **`$state.snapshot` cost tracks node count, not bytes.** A 1.03 MB module holding 10k asset
   references costs about 8x a 1.65 MB module that is mostly one large string. Target node count.
3. **Every number here is a best case.** All measurements came from an **i9-13900K / 64 GB DDR5**.
   This project targets Raspberry Pi self-hosting and mobile. Argue from **ratios**, which do not
   depend on hardware when the gain comes from doing less work. **Never claim frame-budget
   compliance without naming the hardware.**
4. **The Node harness overstates absolute cost.** Chromium ran the same fixture about **2.6x
   faster**, but the ratios held. Use the harness to compare designs and the live app for anything
   user-facing.
5. **Real profiles are larger than the fixture.** The maintainer runs **100+ modules** and reports
   50+ as common in the community. Asset modules bundle **10,000+ images** to get around RisuRealm's
   150 MB limit, reaching 1-2 GB on disk. The images stay in asset storage; only `[name, id, ext]`
   references sit in `db.modules`.
6. **Measure the premise before planning.** Three plan revisions for Stage B failed. The
   design was retired because its central premise — that the cost was a persistence problem
   rather than an effect-granularity problem — had never been tested; the revisions only patched
   the layers built on top of it. The maintainer's own context (profile sizes, asset modules,
   hardware, the character-editor comparison) settled more than either review gate did. **Ask the
   maintainer what real usage looks like** before sizing work.
7. **Test comments are shipped artifacts.** Tests written *before* a change, in the future tense
   ("expected to pass once…", "this file is not modified"), become false when they land in the same
   commit. That got a correct change rejected once. Rewrite them in the past tense before
   committing.

## How to measure in the live app

See **`Agents/Tools/README.md` → "Measuring in the live app"**. It covers the setup, how to reach
the app's own `DBState`, the mutate-and-restore protocol, and **three traps** that each gave a
plausible wrong number: Vite's `?t=` cache-busting handing back an empty module copy; importing
`svelte` loading a second runtime whose `flushSync` measures 0 ms; and `requestAnimationFrame` not
firing while the browser pane is hidden. Pass `VITE_RISU_LEGAL_CONFIGURED=TRUE` **inline, for one
run only** — `Legal.svelte:6-8` forbids setting it automatically.

## LIVE STATE — session of 2026-09-21 afternoon (read this first after a context compaction)

**Maintainer decisions this session:**
- Phase 2 **item 3** first, starting with the **character lists**. The maintainer chose all four
  avatar stages. Plan: `Agents/Reports/12-charlist-avatar-plan.md`. Order: AV-1 (stop
  re-lookups), then AV-2 (lazy-mount), then AV-3 (plain-HTTP encode), then AV-4 (thumbnails).
  **Keep B (AV-3) before D (AV-4).**
- **CHORE-07 runs in parallel.** It is a data-loss bug, reproduced and seen in the wild. Plan:
  `Agents/Reports/13-chore07-cold-read-failure-plan.md` rev 3, **staged 7a / 7b / 7c**.
- **Plugin storage decided (2026-09-21):** option A. `getItem` rejects on a read error, and `setItem`
  rejects on a failed write. This is noted in `risuai.d.ts` as fork-specific. This is a long-lived
  community fork, not upstream PRs, so keep changes minimal and upstream-compatible.

**Where each stream stands:**

| Stream | State | Next |
|---|---|---|
| AV-1 | **Committed `64777a34`** (Report 12; gates ledger 20/27; red ledger 24) | none |
| AV-2 | **Committed `97c3f53a`** (Report 14; gates ledger 30/35/37; step-0 memory probe ledger 31; red ledger 36; live check ledger 38) | none |
| CHORE-07 7a | **Committed `c66c9f4b`** (Report 13 §2; gates ledger 29/33/34; red ledger 32) | none |
| AV-3 | constraints only (Report 12 §4) | plan, then gate. Keep AV-3 before AV-4 |
| AV-4 | constraints only (Report 12 §5), measure first | after AV-3 |
| CHORE-07 7b | **Committed `3e17c8a3`** (minimal core; Report 13 §4; gates ledger 39/40) | none |
| CHORE-07 7c-1 | **Committed `be3633bd`** (Report 13 §5 rev 5; gates ledger 41/42; live check ledger 43) | none |
| CHORE-07 7c-2 | designed (Report 13 §5.3: Retry for chats that already show the pre-7b error text) | plan detail, then gate by a fresh `opus-reviewer` |
| Item 3 part 2 (chat list) | not started | plan after the avatar track |

Nothing is pushed. The docs (this file, Roadmap, ledger rows 13-43) are committed separately.

**Small follow-ups found this session (not ticketed yet):**
- `saveDbKei` reads `db.account.kei` without a guard (`src/ts/kei/backup.ts:86`), so it logs "KEI auto-backup failed" on every save when `account` is undefined. Harmless, noisy.
- `getColdStorageAffectedCharacters` (coldstorageData.ts) still has an untranslated `'Unknown character'` fallback.
- Failed cold-storage removals in `removeColdStorageItems` are silent (pre-existing; ledger 34).
- Live checks: a hidden browser pane runs no IntersectionObserver or rAF (ledger 38). The maintainer starts the dev server.

**Key facts established this session, all in the Roadmap and ledger rows 13-38:**
- The chat list is already windowed by `loadPages`, which only grows.
- All 3 character-list layouts plus the sidebar mount everything and re-resolve every avatar.
- The plain-HTTP `getFileSrc` re-encodes base64 on every call: 1.33x the bytes (4/3), ~8.75 ms/MB on the i9.
- **Item 8 (new):** all chats are resident. Chromium proxy overhead is ~1 KB/message (2.47x
  ASCII); 1000 characters and 150k messages gives 95.5 MB plus 140 MB.
- **CHORE-06 (new):** `console.log` retains whole-save objects in Chromium.
- **CHORE-07 has two loss paths, both reproduced:**
  - the chat is overwritten with an error text;
  - startup `cleanChunks` deletes cold characters' emotion and additional assets. This affects
    Tauri and web, for anyone with the setting off.
- **Maintainer context is in memory:** platform mix (hosted web > local HTTP > Tauri, account sync
  almost unused), Pi 3 and mid-range phones as the hardware floor, most avatars under 10 MB,
  animated avatars exist, and upstream rolled cold storage back.

## What is next — the maintainer chooses

Everything open is in **`Agents/Roadmap.md`**. The candidates, each with its own gate:

**Phase 2 performance, still open:**
- **Item 2 — the character and chat change-tracking effect** (the generic effect in
  `dbChangeEffects.svelte.ts`). It is the hot path when editing character fields and chatting.
  **Partition, do not narrow** (doctrine 1). **Plan it together with CHORE-01**, which lives in
  the same effect.
- **Item 3 — virtual scrolling for the chat list.** The fix that matters most for Android.
- **Item 4 — size-based cold-storage compaction.**

**Chores — confirmed and scoped, none fixed:**
- **CHORE-01** — edits to a character that is **not selected** are never marked for save.
  Occasional loss: it persists only if that character is reopened before reload. The fix surface
  is small, centralised, and not blocked by the save format.
- **CHORE-02** — `toSave.chat` is dead plumbing; the encoder never reads it.
- **CHORE-03** — **the trash feature deserves a full bug hunt.** The community reports it as
  unstable. A data-losing bug turned up there by accident and is **empirically reproduced**:
  restore a character from trash without opening it, close the app, and it is back in the trash.
  Reproduction: `Agents/Tools/save-gen/trash-restore-repro.svelte.harness.ts`.
- **CHORE-04** — **enabling or disabling a module also freezes**, by a *different* mechanism that
  Stage B did not fix. The hypothesis is a full chat re-render through `ReloadGUIPointer` (it is
  possibly bumped twice per toggle), which would scale with chat length. It is **unverified —
  measure first.**
- **CHORE-05** — translation coverage, **measured**: 53 to 99 keys missing per language.
  **This branch added 9 English-only strings — the save-conflict dialogs — and translated none of
  them.** Those 9 are the first priority: they are small and they appear when data is at risk.

Suggested order *if the maintainer asks for one*: the 9 CHORE-05 strings are the smallest safety
win; CHORE-04 is a measurement task with no risk; Phase 2 item 2 and CHORE-01 are the largest
payoff and belong together.

## Open items NOT in scope (documented, do not silently absorb)

- **The `alertStore` hijack** — investigated and deliberately deferred. The "obvious" mutex was
  rejected at a plan gate. Details in the Roadmap.
- `loadPages` is never reset on character switch.
- `streamingDisplayOptimizationMode` defaults to `'off'`.
- Last-writer-wins whole-DB overwrite — pre-existing and architectural.
- **Asset-heavy modules** still exceed the frame budget while being edited. That needs its own
  plan, and the no-narrowing rule applies.
- `src/ts/kei/backup.ts:86` reads `db.account.kei` without optional chaining. **It is confirmed
  live**: the dev console logs `KEI auto-backup failed` on every load. Known, and still not fixed.
- `Agents/Maybe-Later.md` is QOL and unscheduled.

## Area traps

- **`crypto.randomUUID()` needs a secure context**; it is `undefined` on plain-HTTP LAN self-hosting.
  Use `v4()` from `uuid`.
- **Service workers also need a secure context**, so LAN falls back to base64 `data:` URIs.
- **`fileSrcCache` and `blobUrlCache`** (`parser.svelte.ts`) are unbounded but load-bearing for this
  fork's asset-corruption fix. Trace that fix before bounding them.
- **Asset reads are local only on Tauri.** Non-Tauri builds with Account Sync fetch from
  `sv.risuai.xyz`. Never make the `isAccount` branch more aggressive.
- **`getModules()` caches on the joined enabled-id string**, and `lastModuleData` holds live proxies.
  Its freshness is a lucky accident. `refreshModules()` has exactly one caller.
- **Duplicate module ids are reachable.** A `.risum` import keeps the id; only JSON imports
  regenerate it.
- **`Agents/Evidences of Investigations/`** holds third-party plugin bundles and is gitignored on
  purpose. Never commit it.

## Cautions earned the hard way

Every expensive error in this campaign got past a green test suite.

1. **Check the exit code, not the pass count.** A run reporting matching counts once exited
   ELIFECYCLE.
2. **Re-verify every cited line number.** Off-by-one citations were caught at most gates,
   including once in a reviewer's own findings.
3. **Reviewers and investigators have been wrong.** Before propagating a factual claim into a plan,
   a commit message, or another agent's brief, check it against source. At the first Stage B gate
   the reviewer made two errors the Orchestrator caught: a set of citations off by one, and a
   replacement count that did not reproduce.
4. **Your own briefs carry errors too.** A wrong figure ("6+N+1" where the answer was 6+N) went into
   a brief, was copied verbatim into a test comment, and was caught only at the post-implementation
   gate. Check arithmetic before briefing.
5. **Write bug-fix tests against the unfixed code and confirm they FAIL first.** Commit the tests
   with the fix.
6. **Count, do not estimate.** Cite the command that produced a count, not just the number.
7. **Check an agent's `tools:` line before a brief promises it a tool.**
8. **Brief investigators so that disproof is an acceptable result.** The trash reproduction was
   useful because the agent was told a clean disproof was welcome.

## Agent tiers — all exercised now

`investigator` (Sonnet) is the default. `deep-investigator` (Opus) is for escalation only.
`opus-reviewer` handles persistence-adjacent gates. `senior-advisor` (Fable) is for direction, not
difficulty: its one use this checkpoint retired a failing design and redirected the work
correctly. `adversarial-reviewer` and `opus-reviewer` both have Bash and are read-only by doctrine,
not by sandbox. Record every investigation and gate in **`Agents/Investigation-Ledger.md`**,
including outcomes that argue against the current architecture.

## First actions

1. Confirm the baselines above still hold, **checking exit codes**.
2. Ask the maintainer which Roadmap item or chore comes next. Do not pick one yourself.
3. For whatever is chosen: measure the premise first, plan it, pass the plan gate, implement, then
   pass the post-implementation gate. Anything persistence-adjacent uses `opus-reviewer`.
