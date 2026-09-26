# Report 29 — Workflow pilot: third-party advisor feedback (proposal)

**STATUS:** Proposal received 2026-09-26; adopted as a bounded pilot by MC-091. The adopted rules
live in `AGENTS.md` and `.claude/agents/`; this report is the source they cite, not policy itself.

**Which adopted rule implements which feedback section, one line each:**
- **§1 (optimize the coder-test-review cycle)** → no rule of its own: it sets the pilot's focus
  (repeated remediation, duplicated verification, context reconstruction, review restarts) and
  keeps model assignments unchanged. The rules that act on that focus are listed under §3–§6.
- **§2 (dependencies without destabilizing release outcomes)** → `AGENTS.md`'s new "Scope
  amendments" paragraph (AI Coding Agent Requirements) and `sonnet-coder.md`'s rewritten "Scope is a
  contract, with an amendment route."
- **§3 (conditional verification, not universal reconstruction)** → `AGENTS.md` §1.3's
  "Conditional verification" (replacing "Standing Orchestrator duty"); the observation-vs-
  interpretation labelling added to `investigator.md` and `deep-investigator.md`; the execution-
  evidence sentence added to `opus-reviewer.md`'s "Verify, do not trust"; Phase2-Handoff caution 3.
- **§4 (behavioral acceptance vs. editorial remediation)** → `AGENTS.md` §4's new "Review outcomes
  and remediation" subsection and the `[EDITORIAL]` carve-out in the three-round rule (§1.2); the
  three-token verdict and "Remediation reviews" sections in `opus-reviewer.md` and
  `adversarial-reviewer.md`; the "Re-verification" paragraph in `doc-verifier.md`; the aligned
  three-round wording in `senior-advisor.md`.
- **§5 (reduce repeated implementation and test work)** → `AGENTS.md` §4's "Test purposes" (three
  kinds: regression reproducer, compatibility guard, diagnostic experiment) and the mutation-testing
  addition to "Mutation briefs must use the scratchpad"; the "Checks" ownership rule in §4's new
  subsection; `AGENTS.md` §3's "Context" bullet (no automatic `/clear`); matching rules in
  `sonnet-coder.md` (Remediation Round Protocol step 2) and `test-warrior.md` (Context, Test
  purposes, Checks); Phase2-Handoff caution 5.
- **§6 (bound context, delegation, investigation)** → `AGENTS.md` §1.3's "Bound each dispatch"
  paragraph; `AGENTS.md` §3's "Budgets are checkpoints" bullet; the runtime-evidence rule added to
  `investigator.md` and `deep-investigator.md`; `Agents/README.md`'s note that `Live-State.md` is
  the current-state entry point.
- **§7 (reconcile conflicting instructions at their source)** → the whole diff replaces rather than
  appends: the old "universal reconstruction" wording, the old "[APPROVE-WITH-FINDINGS]" verdict,
  the automatic `/clear`, the fresh-reviewer-every-round rule and the full-suite-on-every-invocation
  rule are all replaced in place, not left standing alongside a new exception; `Agents/README.md`'s
  new Conventions note states the "changed at source, not appended" rule for future edits.
- **§8 (validate through a bounded pilot)** → `Agents/Maintainer-Context.md`'s `MC-091` (the pilot
  decision) and the "Pilot (MC-091)" note added to `Agents/Investigation-Ledger.md`'s Log section.

---

(Third-party advisor feedback, supplied by the maintainer on 2026-09-26, verbatim.)

# Proposed workflow improvements for the RisuAI stabilization campaign

**Purpose and scope**

Revise `AGENTS.md` and the applicable agent profiles and workflow instructions to reduce repeated work without weakening data safety or upstream compatibility.

Implement this as a bounded workflow pilot. This feedback does not authorize application-code changes, automatic ticket deferrals, bypassing unfinished gates, or silently replacing maintainer decisions.

Preserve independent review for substantive changes, especially persistence, destructive operations, reactive database behavior, asset handling, and supported migration paths.

**1. Optimize the complete coder–test–review cycle**

The maintainer reports these shares of subagent token usage:

| Agent | Share |
|---|---:|
| `opus-reviewer` | 26% |
| `sonnet-coder` | 23% |
| `test-warrior` | 19% |
| Combined | 68% |

The observation window and token categories are unspecified. These figures identify where to investigate; they do not establish waste, billing cost, or model efficiency.

Prioritize repeated remediation, duplicated verification, context reconstruction, and unnecessary review restarts across these roles. Keep model assignments unchanged initially so the pilot can assess workflow changes.

**2. Keep release outcomes stable while allowing necessary dependencies**

The campaign addresses accumulated design gaps across a coupled application. Fixing A may legitimately require B because of a shared cause C.

Allow scope amendments for:

- Required behavior in the agreed mobile experience.
- Technical prerequisites needed to implement an accepted requirement safely.
- Shared-cause corrections needed for agreed outcomes or already-authorized work.
- Explicit maintainer decisions to reduce supported operational complexity.

For a proposed dependency, establish the concrete failure if it remains unfixed, its causal connection, and the smallest coherent correction across the required endpoints.

Do not force endpoint-specific patches merely to preserve an original file list. The orchestrator may amend implementation boundaries within authorized scope. New product tradeoffs still belong to the maintainer.

The home-screen change and RisuAccount removal must not be presented as examples of incidental scope creep:

- The home-screen change addresses mobile access to essential navigation.
- RisuAccount removal addresses dependence on an external asset backend and associated backup and maintenance constraints.

Backend licensing uncertainty is a maintainer-reported concern, not an established legal conclusion. Removing RisuAccount does not mean removing every upstream service.

Any revision of MC-089's current-ticket release policy must be explicit. This feedback does not itself defer tickets or change MC-047's Android sequencing.

**3. Replace universal reconstruction with conditional verification**

Separate information in handoffs into:

| Information | Required treatment |
|---|---|
| Observation | Reuse when supported by accessible, applicable evidence. |
| Interpretation | Check whether the evidence supports the conclusion. |
| Settled maintainer decision | Respect; raise new evidence that materially changes its consequences. |

A model's "VERIFIED" label is not sufficient evidence.

Source observations must identify the source they describe. Execution evidence must identify the command, result, and relevant code, dependencies, runtime, configuration, and inputs.

HEAD alone is insufficient in a shared dirty worktree. Identify the relevant working changes, including untracked inputs. Evidence must not silently transfer to a different implementation.

Use existing logs and artifacts where possible. Do not introduce a large evidence-management system.

Decision-critical, high-risk inferences must receive an independent source-level or execution check at the appropriate gate. The orchestrator remains accountable for evidence quality and implications, but need not automatically repeat an adequate independent check.

Reverify when:

- Evidence or provenance is missing or ambiguous.
- Relevant implementation or execution conditions changed.
- Evidence conflicts.
- A conclusion goes beyond what the evidence establishes.
- A critical claim has not received the required independent scrutiny.

Passing tests alone do not establish test adequacy or real platform behavior.

**4. Separate behavioral acceptance from editorial remediation**

Use review outcomes that distinguish:

- **Behavioral changes required.**
- **Behavior accepted; editorial corrections pending.**
- **Accepted.**

Required corrections to false or misleading comments, test descriptions, documentation, and commit messages must be completed before final acceptance. Their existence does not automatically require reopening the entire implementation review.

For an editorial-only correction:

1. Verify the actual diff contains only the intended editorial changes.
2. Check the corrected claim against the relevant evidence.
3. Close the finding without repeating unrelated verification.

Reuse the same independent reviewer for remediation while its context remains usable and separate from the implementer's private reasoning. Provide prior findings, actual changes, and updated evidence.

Executable remediation always receives review of affected behavior. Reopen a broader gate when changes affect shared contracts or invariants, materially alter the architecture, contradict previous evidence, or invalidate prior acceptance. An editorial correction that exposes a substantive misunderstanding also reopens the relevant analysis.

Use a fresh reviewer when independence or context is compromised, or when a new architectural challenge is needed—not automatically after every edit.

Replace "exhaust all logical failure paths" with finite acceptance scenarios, important invariants, sufficient evidence, and no outstanding substantiated blockers.

Do not turn editorial remediation into an unrelated production-cleanup stage.

**5. Reduce repeated implementation and test work**

Consolidate remediation into one brief identifying each finding, the affected requirement, the change boundary, and necessary verification. Keep optional improvements separate.

Assign one owner for required full integration and type checks on the final relevant implementation snapshot. Use targeted checks during remediation. Rerun full checks when changes invalidate their applicability.

Reviewers remain free to rerun critical checks and challenge evidence. Every role need not repeat the entire suite against unchanged inputs. Editorial-only changes should not automatically trigger application tests.

Distinguish test purposes:

- **Regression reproducer:** fails against the relevant pre-fix behavior and passes after correction. The failure must demonstrate the intended defect; an import or setup failure is insufficient.
- **Compatibility guard:** may pass before and after while demonstrating preserved behavior.
- **Diagnostic experiment:** helps establish a mechanism but is not necessarily an acceptance test.

Retain useful compatibility guards. Remove blanket instructions claiming that every test passing before and after proves nothing.

Keep mutation testing focused on meaningful semantic failures, especially destructive operations and persistence invariants. Investigate consequential survivors; do not optimize for mutant counts. Reuse fault-injection infrastructure and applicable evidence instead of rebuilding equivalent experiments each round.

Preserve test isolation from real services. Mocked success must not be presented as proof of native backend behavior.

Passing tests should not automatically trigger `/clear`. Preserve useful continuity within a coherent task; reset when context size, contamination, or changed scope warrants it.

Keep comments and commit messages accurate and focused on behavior and non-obvious rationale. Avoid retelling the investigation inside implementation artifacts.

**6. Bound context, delegation, and investigation**

Preserve historical records. Improve the existing current-state entry point so agents can load relevant decisions, accepted evidence, and unresolved questions without reading entire archives.

Use existing handoffs. Do not add another mandatory report at every transition.

Each additional agent should have a distinct unresolved question or independent verification responsibility. Multiple agents should not reconstruct the same mechanism without an explicit reason.

When an investigation requires missing runtime evidence, identify the exact observation needed. Stop speculative expansion of that branch and obtain the observation. Continue useful independent work where available.

Repeated endpoint omissions should trigger reconsideration of the shared mechanism, ownership, or lifetime rule before another guard is added. Preserve strategic escalation when evidence conflicts or the approach is structurally wrong.

A time or token budget is a checkpoint for reassessing direction. It is never a reason to declare incomplete work accepted.

**7. Reconcile conflicting instructions at their source**

Audit the root AGENTS.md, applicable agent profiles (.claude/agents), campaign index (Agents/README.md), handoff (Agents/Phase2-Handoff.md), live-state instructions (Agents/Live-State.md), and the dispatch templates actually used.

Replace conflicting active rules rather than appending competing exceptions.

Specific reconciliation targets:

- `sonnet-coder` requires full tests and type checks on every remediation invocation and requests a fresh reviewer each round.
- Its strict file-boundary rule needs an efficient route for justified dependency amendments.
- `test-warrior` requests a context reset whenever a suite passes.
- `opus-reviewer` dismisses pre/post passing tests while `AGENTS.md` recognizes useful existing guards.
- The orchestrator's universal personal reverification requirement conflicts with reusable, independently checked evidence.
- Investigation, adversarial review, and document verification instructions need consistent remediation and reopening rules.

Preserve historical review records. Maintain append-only decision history and explicit supersession links. Clearly distinguish proposals from adopted policy.

Relevant maintainer context includes MC-011, MC-047, MC-053, MC-069, MC-080, MC-081, MC-089, and the clarifications in this feedback.

**8. Validate through a bounded pilot**

Pilot the revised workflow on 5–10 reasonably comparable items. Keep model assignments and substantive safety gates unchanged initially.

Record lightweight measures using existing records: elapsed time, token categories when available, dispatches, review rounds, full-suite executions, substantive findings, and later reopenings or escaped defects. Compare similar risk and complexity; do not invent a savings target or claim proven safety from a small sample.

The revised instructions should produce these outcomes:

- A comment-only correction receives targeted factual verification.
- Changed save ordering triggers review of affected safety guarantees.
- A necessary shared dependency can amend scope.
- Inapplicable execution evidence is not reused.
- A useful compatibility guard is retained.
- Required editorial corrections cannot remain pending at completion.
- Routine remediation does not automatically restart the entire review and test pipeline.

Deliver a focused governance diff, a concise explanation of reconciled rules, and any remaining product decisions. Avoid application-code changes and new mandatory governance layers.
