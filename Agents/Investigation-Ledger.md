# Investigation Ledger

Records every investigation dispatched under the tiering in `AGENTS.md` 1.3, so the
two-tier split is **measured rather than assumed**. The split was adopted as an
architecture to test, not a settled conclusion; if the mid-tier proves unable to produce
packets good enough to resolve most investigations, this ledger is the evidence that
justifies reverting to Opus as the default investigator.

Record one row per investigation, at the time it completes. Token counts come from the
subagent usage reported to the Orchestrator.

## What the numbers are for

| Metric | Why it matters |
|---|---|
| Escalation rate | If it approaches 1, the mid-tier is not doing its job and the split is only adding a hop. |
| Escalations that materially changed the conclusion | The core value question for the Opus tier. Cheap confirmations are fine; *only* confirmations means the bar is too low. |
| Escalations that merely confirmed | Not waste at low rates — it is what a correctly-calibrated bar produces. Waste if it dominates. |
| Cost per investigation, by tier | The economic claim being tested. |
| Failures traceable to bad investigation | The correctness guardrail. Any occurrence is serious and should be written up in full, not just tallied. |

**Honesty rule.** Record outcomes including the ones that argue against the current
architecture. A ledger kept to justify a decision already made is worthless.

## Log

| # | Date | Question | Tier(s) | Tokens | Escalated? | Outcome |
|---|---|---|---|---|---|---|
| 1 | 2026-09-21 | Size the module-editor per-keystroke fix; verify the two `modules` effects | Opus (pre-split; dispatched as `opus-investigator`) | ~99.8k, 43 tool uses | n/a | Accurate on all claims the Orchestrator spot-checked. Surfaced the `getModules()` load-bearing accident and the DEV-inflation risk to the headline measurement — both high-value. Understated two things the Orchestrator caught on verification: **two** reverts of the proxy-tracking approach plus two stabilization patches (it reported one revert), and the load-bearing comment at `ModuleSettings.svelte:181` explaining that the eager `push` exists to prevent a prior double-insert bug. **Its DEV-inflation doubt was tested by `perf-analyzer` and disproven** — production is 1.18x faster, not a multiple. |

| 2 | 2026-09-21 | Stage A plan gate — falsify the narrowing of `stores.svelte.ts:197` to four module fields (`Agents/Reports/09-stage-a-module-effect-narrowing-plan.md`) | `adversarial-reviewer` (Sonnet 5) | ~54.4k, 28 tool uses | No | Verdict *proceed with named amendments*. Could not falsify the three load-bearing claims: the field list (independently enumerated all 15 `RisuModule` fields and traced which reach `moduleUpdate()`), the scope boundary (traced `dbChangeEffects` wiring to `globalApi.svelte.ts:607`, separate from the changed effect), or the synchronous-subscriber leak path via `ReloadGUIPointer` → `resetScriptCache()`. Produced three real amendments, all Orchestrator-verified against source before folding in: two off-by-one line citations in the plan (`:565`→`:566`, `:568`→`:569`); a **better** R1 precedent than the plan had (`IrisModal.svelte:268`, `SegmentedControl.svelte:49` already ship the exact `void x` idiom); and a correctly-identified coverage gap — the tests exercise the extracted helper, not the wiring, so a manual smoke check is now part of acceptance. Note: the reviewer found the plan's cited precedent weaker than an alternative it located itself, which is the kind of finding a gate is for. |

| 3 | 2026-09-21 | Stage A post-implementation review — falsify the implemented narrowing, its tests, and the comments shipping with it | `adversarial-reviewer` (Sonnet 5) | ~60.4k, 25 tool uses | No | Verdict *ship with named fixes*, both cosmetic. Independently re-derived the four-field list from source and found no fifth field, including through the `ReloadGUIPointer` / `HideIconStore` / `moduleBackgroundEmbedding` subscriber fan-out. Fact-checked all 11 checkable claims in the shipped comments against source: all TRUE, with the caveat that the `:566`/`:569` citations are the *read* sites and the matching `.set()` calls are at `:577`/`:575`. Caught one real doc defect — the plan still said the import goes on line 5 of `stores.svelte.ts`, stale after its own leaf-file amendment; fixed. **Process failure worth recording: the brief told the agent it had Bash, and the profile grants only Read/Grep/Glob.** It disclosed this in its first paragraph instead of quietly substituting reasoning for execution, and separately asked that someone with Bash re-run the suite on this exact branch state before merge. The Orchestrator had already done so independently (red run 11 failed / green run 27 passed / full suite 358 passed exit 0 / `pnpm check` 0-0), so the gap was covered — but the brief was wrong and a less careful agent would have papered over it. Check the profile's tool grant before promising a tool. |

## Reading of the log so far (n=1 — not a conclusion)

Run 1 is the only data point and it predates the split, so it cannot settle anything. Two
observations that motivated the split, recorded while they are fresh:

1. **The valuable output was concentrated, and thinner than it first appeared.** Of the two
   findings that looked like they justified the Opus tier, only one survived: the
   `getModules()` load-bearing cache accident was real and decision-changing, while the
   DEV-inflation doubt was tested and disproven (1.18x, not a multiple). Most of the 43 tool
   calls were mechanical archaeology producing no reasoning of either kind. One genuine
   load-bearing find per ~100k tokens is the bar the mid-tier now has to clear — and it is a
   lower bar than the raw report made it look.
2. **Orchestrator verification caught real gaps in an Opus packet.** Both understatements
   above came from an *Opus* investigation, not a cheap one. This is the argument for the
   standing verification duty in 1.3 being tier-independent: the failure mode is
   compression, not model capability. It also means a mid-tier packet should not be held to
   a standard the Opus tier did not meet.
3. **A flagged doubt is not a finding until it is tested.** The Opus packet correctly
   identified a real DEV-only code path and correctly labelled its magnitude UNCERTAIN. The
   Orchestrator then spent a `perf-analyzer` dispatch settling it, and the answer was "no
   material effect." That sequence was correct and should be repeated — but it means an
   investigation's value should be scored on premises *settled*, not premises *raised*.

Do not draw a conclusion about escalation rate until there are enough post-split rows to
have one.
