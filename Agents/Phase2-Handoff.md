# Phase 2 Initiation Brief — RAM / Rendering Performance

You are the **Opus 5 Senior Orchestrator** for the RisuAI stabilization campaign.
Governance is in `AGENTS.md`; agent profiles are in `.claude/agents/`. Read AGENTS.md
section 1 (routing), 1.2 (escalation ladder) and 4 (review gates) before dispatching
anything.

## Standing constraints

- **English only** in all thinking, subagent briefs, and replies. Token budget and cache hygiene.
- **No blind over-reading.** Do not absorb large files into your own context. Delegate.
- **You do not write application code.** All `.ts` / `.svelte` / `.rs` / `.yml` edits go
  through `sonnet-coder`. You may edit `AGENTS.md` and `Agents/*.md` directly.
- **Do not overwrite, revert, or clean existing uncommitted changes without asking.**
- **COMPATIBILITY INVARIANT.** Upstream-compatible characters, modules, presets, backup
  `.bin` files, plugins and other supported user data must keep working on this fork. Any
  breaking proposal needs explicit user approval plus impact / migration / fallback analysis.
- **Targeted stabilization, not a rewrite.** Perf work included; rearchitecture is a
  user decision, not yours.

## Repo state at handoff

- Branch `fix/persistence-conflict-platform-hardening`, **22 commits ahead of origin**, HEAD `1f5c0cb8`.
- Baselines, all verified: `pnpm check` 0 errors / 0 warnings; `pnpm test` **31 files, 331 passed, 3 skipped**; `cd src-tauri && cargo check` clean.
- Working tree carries ONE deliberate exception: `src/ts/process/mcp/risuaccess/tests/__snapshots__/modules.test.ts.snap` shows modified but has an **empty content diff** (line endings only). It has been excluded from every commit this campaign. Leave it alone.
- Phase 1 / 1.5 and three rounds of persistence fixes are done. See `Agents/Roadmap.md`.

## What Phase 2 is

The shared root cause behind the app's memory and responsiveness problems. It is the
load-bearing phase — Phase 4 (Android) is gated behind it.

**The central measured finding:** `$state.snapshot()` cost scales with **proxied node
count, not payload bytes.** Measured 6-17x a plain `structuredClone`. Concretely: 4,000
small entries cost 37ms; 4 huge entries cost 0.065ms *despite 2.8x more bytes*. Every
optimisation instinct that targets payload size is therefore wrong here. Target node count.

**Numbers already measured** (warm-up discarded, medians reported, floor reported alongside):

| Case | Cost |
|---|---|
| `$state.snapshot(modules)`, module-heavy install (52 modules / 7.27MB) | 33.82 ms per call |
| Module editor, per keystroke | ~67.6 ms (two effects track `modules`) |
| `$state.snapshot` chat-heavy (10k messages) | 79.67 ms |
| `botPresets`, 3 / 15 / 50 presets | 0.24 / 1.76 / 7.33 ms |
| Frame budget | 16.7 ms |

The module-editor figure is the one with an independent corroborating signal: the
community calls that text field "stuttery."

**Benchmark harness** (scratch, NOT in the repo, but still on disk):
`C:\Users\yor42\AppData\Local\Temp\claude\C--Projects-RisuAI\65a82f70-385b-4d39-aa7e-b168c9825a15\scratchpad\save-gen\`
— `build.ts`, `svelte-proxy-bench.svelte.ts`, `svelte-proxy-bench.spec.ts`,
`botpreset-bench.spec.ts`, `generate-and-verify.spec.ts`. Run via
`scratchpad\vitest.fixtures.config.ts` with `NODE_PATH="C:/Projects/RisuAI/node_modules"`.
Seed 1337. Tiers: light / chat-heavy / module-heavy / both-heavy. **Re-read it before
re-measuring rather than rebuilding it.** If Phase 2 needs it repeatedly, propose adding it
to the repo — that is a user decision.

## Suggested first target (not an instruction — re-verify before committing to it)

**The module-editor per-keystroke cost.** Reasons it is the right opening move:

1. Highest measured cost with a real user complaint attached.
2. A draft-copy fix for it was designed earlier and **rejected** — correctly — because it
   would have added a fourth draft holder to a mechanism that already mishandled three.
3. That objection no longer applies. `src/ts/localDrafts.ts` now exists and is proven in
   production by the multi-tab work (commit `4b2db8db`), with five draft holders registered
   via `$effect` on state plus `onDestroy` backstops. It is the piece the rejected plan was missing.

Two effects track `modules`: one in `src/ts/storage/dbChangeEffects.svelte.ts` and one in
`src/ts/stores.svelte.ts` (~195-204). **Verify both still exist and still deep-read before
sizing anything** — the effects were relocated this session and any line number here is stale.

## Traps specific to this area

- **`crypto.randomUUID()` is secure-context only.** It is `undefined` on plain-HTTP LAN.
  Self-hosting RisuAI on a Raspberry Pi over `http://192.168.x.x` is popular with this
  user's community. Use `v4()` from `uuid`. This already caused one blocker.
- **Service workers also require a secure context**, so the LAN path falls back to base64
  `data:` URIs — the memory-heavy asset path. Any asset-memory work must account for it.
- **The asset cache is load-bearing for a data-loss fix.** `fileSrcCache`
  (`parser.svelte.ts` ~431) and `blobUrlCache` (~678) are unbounded with no
  `revokeObjectURL`, but bounding them must be checked against the invariants of the
  asset-corruption fix this fork carries. Upstream never merged that fix; the community
  works around it with a browser plugin. Do not bound these caches without tracing that first.
- **Draft-aware dirty tracking exists now** (`src/ts/localDrafts.ts`,
  `src/ts/storage/multiTabReload.ts`). If a perf fix moves editor state, it must register a
  draft or it will reintroduce the data loss fixed in `4b2db8db`.

## Open items NOT in Phase 2 scope (documented, do not silently absorb)

- **alertStore hijack** — investigated and deliberately deferred. Full mechanism, four
  blocking findings, and the shape of a real fix are in `Agents/Roadmap.md`. Do not attempt
  the "obvious" mutex; it was taken to a plan gate and rejected. One instance was fixed
  narrowly in `399d52ae`.
- `loadPages` never reset on character switch.
- `streamingDisplayOptimizationMode` defaults to `'off'`, causing per-network-chunk full-chat clones.
- Last-writer-wins whole-DB overwrite — pre-existing and architectural.
- `Agents/Maybe-Later.md` holds out-of-campaign QOL ideas. Not scheduled.

## Cautions earned the hard way

This campaign's expensive errors have **not** been bad code. The suite was green every
time. They were correct reasoning applied to an unverified premise:

1. **Re-verify every cited line number.** Citation drift has bitten repeatedly.
2. **Reviewers here have been wrong.** Before propagating a reviewer's factual claim into a
   plan, a commit message, or another agent's brief, check it against source. A false claim
   was once made the headline of a commit message on a data-loss fix; the next reviewer
   caught it. Worse, the correct answer had already been derived and was then abandoned in
   deference to the reviewer.
3. **Do not assert a path you have not traced.** Turn it into a test instead.
4. **Write bug-fix tests against the unfixed code and confirm they FAIL first.** A test
   written after the fix cannot distinguish "this works" from "this is shaped the way I
   expected." Commit tests with the fix so no commit leaves the suite red.
5. **Count, do not estimate,** when sizing. One "roughly 50" was really 83, and it inverted
   the recommendation.

`opus-investigator`, `opus-reviewer` and `senior-advisor` were created at the end of the last
session specifically to catch these, and are **unexercised**. Expect to tune the
`senior-advisor` trigger bar on first real use — it may prove set too conservatively.

## First actions

1. Confirm the baselines above still hold.
2. Dispatch `opus-investigator` to re-verify the two `modules` effects and size the
   module-editor fix honestly, including any load-bearing accident.
3. Plan-gate before implementing. Persistence-adjacent work uses `opus-reviewer`.
