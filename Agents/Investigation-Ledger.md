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
