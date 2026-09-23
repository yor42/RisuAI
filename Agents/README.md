# Agents/ — index for the RisuAI stabilization campaign

You are a fresh session (human or subagent) that just opened this repo's `Agents/`
directory. This file plus `Agents/Phase2-Handoff.md` and `Agents/Maintainer-Context.md`
should tell you where everything is, what each document is authoritative for, and what
order to read them in — without opening all 32 reports.

This is an index, not a summary. If you need the campaign's actual findings, follow the
pointers below into the documents that hold them.

## Authority — what each document governs

Several documents overlap in subject matter. When two documents seem to disagree, this
is the order of authority.

- **[`Maintainer-Context.md`](Maintainer-Context.md)** — authoritative for every maintainer-supplied fact and
  decision: what the maintainer has actually said, chosen, or ruled out. Append-only,
  entries tagged with stable `MC-NNN` IDs so other documents can cite one precisely. This
  is the subagent-readable record of maintainer input — look here first for "what did the
  maintainer actually say about X" before trusting a paraphrase in a report or the
  Roadmap.
- **[`Roadmap.md`](Roadmap.md)** — authoritative for phase and item **scope and sequencing**: what is
  in Phase 0/0.5/1/1.5/2/3/4, what depends on what, and current per-item status. It
  cross-references reports by number for detail rather than repeating it.
- **[`Investigation-Ledger.md`](Investigation-Ledger.md)** — authoritative for **what was dispatched, what it cost,
  and what came back**. It is a dispatch log, **not a per-report status register**.
  Every investigation or gate dispatch gets one row (schema: `# | Date | Question |
  Tier(s) | Tokens | Escalated? | Outcome`), but reports 02-08 do not appear in it at
  all — those investigations predate the ledger's introduction. Do not use the ledger to
  ask "is report N done" and do not conclude a report was never investigated just
  because it has no row here.
- **[`Summary.md`](Summary.md)** — a snapshot of investigation rounds 1 and 2 (the four original
  topic reports plus their round-2 deep-dives). **Historical.** Later corrections,
  fixes, and the whole of Phase 1.5 onward are not reflected here; go to `Roadmap.md`
  or the reports themselves for current state.
- **[`Phase2-Handoff.md`](Phase2-Handoff.md)** — durable doctrine only: lessons learned about
  effects, measurement and review process, plus traps that outlive any one session.
  Per-session state was split out of it on 2026-09-23.
- **[`Live-State.md`](Live-State.md)** — what is in flight right now: branch state, the stage
  being built, what remains in it, and the test baseline. **Rewritten each session rather than
  appended to**, so it is never a history. Read it first after a context compaction.
- **[`Reports/`](Reports/)** — per-investigation and per-stage detail: the actual file:line
  evidence, designs, and rationale behind Roadmap items. See the band descriptions
  below.
- **[`Maybe-Later.md`](Maybe-Later.md)** — unscheduled QOL ideas and deferred items. Nothing here is
  approved or scheduled.
- **[`Tools/`](Tools/)** — measurement procedures and fixtures used to produce the campaign's
  performance numbers, with its own `Tools/README.md`.

## `CodexReviews/` — historical gate transcripts, not live guidance

`Agents/CodexReviews/` holds per-round adversarial-review transcripts: the record of a
review that happened, not current guidance. Nothing in this directory should be read as
an instruction for new work — read it only when tracing *why* a stage was designed the
way it was, or to see what a specific review round found and how it was resolved. A
review verdict here can be superseded by a later round on the same topic; check the
Roadmap or the relevant report for which round was final.

Layout is per-topic and per-phase subdirectories (e.g. `phase0/`, `phase1/`, `phase3/`,
`tierb-stage1/`, `tierb-stage2-4/`, `tierb-stage3a/`, `tierb-stage3a-naming-only/`,
`topic05/`, `topic05-fix/`, `topic06/`, `topic07/`, `topic08/`), plus loose top-level
files for the original four topic reviews and their deep-dives. Find the transcript for
a given piece of work by matching its topic/phase name, not by guessing a filename.

## Reading order for a fresh session

1. **[`Maintainer-Context.md`](Maintainer-Context.md)** — what the maintainer has actually decided. Read this
   before trusting any other document's paraphrase of a maintainer decision.
2. **[`Live-State.md`](Live-State.md)** — what is in flight right now. Read this first after a
   context compaction.
3. **[`Phase2-Handoff.md`](Phase2-Handoff.md)** — durable doctrine: the lessons and traps to know
   before touching an effect, a measurement, or a review.
4. **[`Roadmap.md`](Roadmap.md)** — full phase/item scope, sequencing, and status. This is the map of
   the whole campaign.
5. **[`Investigation-Ledger.md`](Investigation-Ledger.md)** — only once you need to know what a specific
   investigation or gate cost and returned, or to check the escalation-rate numbers the
   ledger exists to produce.
6. **`Reports/<N>`** — open the specific report(s) the Roadmap or handoff cites, for
   file:line detail on the item you're touching.
7. **`CodexReviews/<matching dir>`** — only if you need to see why a design was
   rejected or amended in review, not for new guidance.
8. **[`Summary.md`](Summary.md)**, **`Maybe-Later.md`**, **`Tools/`** — as needed; none of these are
   required reading for ordinary work.

## Where do I look for X

| Question | Look in |
|---|---|
| What did the maintainer decide about X? | `Maintainer-Context.md` — it is authoritative for this |
| What is being worked on right now? | `Live-State.md` |
| Why was this designed this way, not some other way? | The relevant `Reports/<N>` file, then `CodexReviews/<matching dir>` for the review trail that shaped it |
| What is the current state of stage/phase N? | `Roadmap.md` |
| What was already investigated and refuted? | `Reports/21-deferral-re-review.md` (re-tested "pre-existing" deferrals), the relevant `Reports/<N>` for a specific claim, `Investigation-Ledger.md` for confirmed-vs-refuted verdicts on dispatched work |
| How do I measure this (RAM, keystroke cost, chat-switch cost, etc.)? | `Tools/README.md` and the other files under `Tools/` |
| What is deliberately not being done / not scheduled? | `Maybe-Later.md`; also check `Roadmap.md` for items marked reverted or deferred with a reason |
| What was dispatched, to whom, and what did it cost? | `Investigation-Ledger.md` |
| What did investigation rounds 1-2 originally find, before later corrections? | `Summary.md` (historical — verify against `Roadmap.md` for anything since superseded) |
| Is a subsystem bug reference (modules, TTS, playground, etc.) real or just a hunch? | The relevant `Reports/99-*.md` — check its per-entry Status line; nothing there has necessarily been reproduced |

## Reports/ — the three bands

`Reports/` has 32 files in three numbered bands. Reports are read for detail once the
Roadmap or handoff has pointed you at a specific one; you don't need to read the whole
directory.

- **01-08 — investigations (12 files).** The four original topic investigations
  (`01-performance-ram`, `02-persistence-reliability`, `03-asset-corruption`,
  `04-tauri-platform-expansion`), each with a `-deepdive` companion (round 2, scoped to
  find *new* bugs rather than re-verify round 1), plus four standalone investigations
  numbered onward: `05-multi-instance-conflict`, `06-conflict-resolution-design-feasibility`,
  `07-remote-block-versioning-design`, `08-remote-block-gc-transactional-safety`.
- **09-21 — stage plans (13 files).** Design and implementation plans for individual
  Roadmap items, in the order they were written. Some describe what shipped; at least
  one describes a design that was **retired, not shipped** — see the convention below.
- **99-\* — subsystem bug references (7 files).** Hand-off lists of suspected bugs found
  incidentally (e.g. while writing a wiki page), one file per subsystem
  (`99-character-display`, `99-long-term-memory`, `99-modules`, `99-playground`,
  `99-prompt-template`, `99-settings-ui`, `99-tts`). Each entry is a claim from reading
  code, not a reproduction — check the per-entry Status line (`Reported` /
  `Reviewer-confirmed` / `Orchestrator-confirmed`) before treating anything in these
  files as settled.

## Conventions

- **Reports are never renumbered and never deleted.** A retired design stays readable as
  evidence of what was tried and rejected, and why. The worked example is
  `Reports/10-stage-b-module-draft-copy-plan.md`: its draft-copy design was rejected at
  two review gates and retired in favor of the effect-partition design in
  `Reports/11-stage-b-module-effect-partition-plan.md`. Report 10's design **must not be
  revived** as a fix for the same problem; the file exists so that stays known rather
  than being rediscovered and re-rejected.
- **Cross-references are mostly prose** ("Report 12", "ledger row 34"), not markdown
  links. Renumbering any report or ledger row would silently break every prose reference
  to it, and no link checker would catch it. Never renumber or reorder existing entries.
- **`Agents/Evidences of Investigations/`** holds maintainer-supplied evidence. Only two
  subdirectories inside it are gitignored, because they contain third-party plugin
  bundles: `Community plugins to solve common pain points/` and
  `Asset Cache/Community Mitigation_Webrowser Plugin/`. Never commit those two, and
  never quote their code into publishable documentation. **The rest of the `Evidences`
  directory is tracked** — do not assume the whole directory is gitignored, that has
  already misled a session. This README does not open that directory; nor should you,
  unless your task specifically requires it.
- **English only.** All campaign documentation (`Agents/**`) is written in English.
  Only user-facing `src/lang/*` strings are localised (Korean and English), and the
  maintainer edits those directly — treat unexpected diffs there as theirs, not a
  regression.
