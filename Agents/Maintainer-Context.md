# Maintainer Context

This document is a durable log of facts stated by the maintainer, and decisions the maintainer
made, across the RisuAI stabilization campaign. It exists so a fresh session does not have to
re-derive context that already lives in a report, the Roadmap, the ledger or a chat log — and so
that context is not lost when a report is superseded, rewritten, or simply not the file a new
session happens to open first.

**This document is append-only.** New entries are added at the end of their section, in the order
they were seeded or discovered. An entry's claim text — its quote, its date, its citation, its tag
— is never altered and never deleted once written.

**The one exception is the back-pointer.** When a later fact or decision reverses an earlier entry,
the new entry is filed normally and tagged `superseded` (if it reverses a `decision`) or the
reversing entry is tagged `corrected` (if it reverses a `stated` fact) — and the **superseded
entry** is allowed exactly one appended line, naming the entry that reverses it. Nothing else about
the old entry changes. This is a deliberate reading of "append-only": rewording an old entry to
match the new understanding would hide that the claim ever read differently, which defeats the
purpose of a log. Recording the reversal only on the new entry would leave the old entry looking
live to a session that reads top-to-bottom and stops at the first match. Marking both ends is what
lets this document be read starting from either entry and still land on the current truth.

## How to read the tags

- **`stated`** — the maintainer asserted it, and nobody has independently checked it.
- **`verified`** — confirmed against source or a measurement; the entry names what confirmed it.
- **`corrected`** — revises an earlier entry; names which entry it corrects.
- **`decision`** — a fork in the work that the maintainer resolved.
- **`superseded`** — a decision later reversed; names which entry reverses it.
- **`open`** — a question addressed to the maintainer that is not yet resolved. An `open` entry is
  never a settled fact or decision, and it is filed in its own section for exactly that reason —
  so no reader mistakes an unanswered question for an answer.

`open` is not one of the five tags used elsewhere in this campaign's review vocabulary. It is added
here because three genuinely unresolved questions exist in the seed material, and grouping them
under `stated` or `decision` would misrepresent them either way.

## Dating

Many facts here predate any dated record — they describe how the app or the community already
behaved before this campaign started measuring it. Three, and only three, forms of date are used:

1. **A stated date** (`2026-09-21`) — the source itself states when the fact was recorded or the
   decision was made.
2. **A commit-bounded date** (`not recorded · on or before 2026-09-21 (54e9dc58)`) — the source
   gives no date, but a `git log -S` search for the exact text against the source file found the
   commit that introduced it. That commit's date is a genuine, verified upper bound on when the
   claim was first recorded in writing — not a guess, and not the same as the fact's real-world
   truth date.
3. **`not recorded`** — no date and no commit bound could be established (most often because the
   source file carrying the claim is not yet committed).

No date here is inferred from a report number, from where an entry sits in a document, or from a
neighboring entry's date. Where the evidence did not supply one of the three forms above, the entry
says `not recorded` and stops there.

## IDs

Every entry has a stable `MC-NNN` id, assigned in the order entries were written into this
document, and never reused. A `Sweep ref:` line carries the id this entry had in the 2026-09-23
extraction sweep that seeded this document (an `F`- or `D`-number) — that sweep's own numbering is
not stable across edits to the sweep, so the sweep ref exists only to trace an entry back to where
it came from, not to be cited elsewhere. Cite entries by their `MC-` id.

---

## Facts

### MC-001 — Real avatars are PNGs under about 10 MB, with 10 MB the stated upper bound

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F1
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, "§1 Problem, as measured"; also
  `Agents/Roadmap.md`, Phase 2 item 3 (not item 1 — see note)
- **Related:** MC-006

> Most avatars are PNGs under ~10 MB, with 10 MB the upper bound.

The Roadmap carries the same fact in its own words, under Phase 2 item 3 rather than item 1 (the
seed material named item 1; item 1 is the module-editor keystroke item and does not mention avatar
sizes):

> Maintainer: most avatars are PNGs **under ~10 MB**; 10 MB is the upper bound.

---

### MC-002 — Platform mix: hosted web most common, then local plain HTTP, then Tauri; account sync almost unused

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F2
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, "§1 Problem, as measured"; also
  `Agents/Phase2-Handoff.md`, "LIVE STATE — session of 2026-09-21 afternoon" (section removed 2026-09-23 in the handoff/Live-State split; the quoted text is preserved in git history as of `ca27760f`)
- **Related:** MC-003, MC-009

> **Most common:** the hosted web app. It is HTTPS, so it takes the service-worker path: no
> re-encode, but a full-size fetch and decode for each icon.
> **Second:** locally hosted plain HTTP, the base64 path.
> **Third:** Tauri desktop.
> **Account sync** is almost unused.

`Phase2-Handoff.md` restates the same ranking more tersely: "platform mix (hosted web > local HTTP
> Tauri, account sync almost unused)".

---

### MC-003 — Hardware floor is Raspberry Pi 3 (1 GB) and mid-range phones

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F3
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, "§1 Problem, as measured";
  `Agents/Reports/17-chore01-item2-plan.md`, "§2 Why option B, not option A"
- **Related:** MC-002, MC-035

> **Hardware floor:** Raspberry Pi 3 (1 GB) and mid-range phones.

Report 17 restates it in the course of a decision: "The hardware floor is a Pi 3 and mid-range
phones. The maintainer chose B." (see MC-035).

---

### MC-004 — Animated avatars exist, though uncommon, and AV-4 must preserve them

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F4
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, "§1 Problem, as measured"

> **Animated avatars exist, though uncommon.** AV-4 must preserve them.

---

### MC-005 — Upstream rolled cold storage back

- **Tag:** stated
- **Date:** not recorded · on or before 2026-09-21 (`65c90d7f`)
- **Sweep ref:** F5
- **Source:** `Agents/Phase2-Handoff.md`, "LIVE STATE — session of 2026-09-21 afternoon" (section removed 2026-09-23 in the handoff/Live-State split; the quoted text is preserved in git history as of `ca27760f`)

> **Key facts established this session, all in the Roadmap and ledger rows 13-38:**
> […] and upstream rolled cold storage back.

No further detail on this claim (what was rolled back, or why) appears in the cited source.

---

### MC-006 — Maintainer runs 500+ characters; extreme users report 1000+

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F6
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, "§1 Problem, as measured"; also
  `Agents/Roadmap.md`, Phase 2 item 3 (not item 1 — see note)
- **Related:** MC-001, MC-007

> The maintainer has 500+ characters; extreme users have 1000+.

Roadmap's own wording, again under Phase 2 item 3 rather than item 1 as the seed material named it:

> Real profiles: maintainer 500+ characters, extreme users 1000+.

---

### MC-007 — Users at 1000+ characters consistently report instability and sudden data/asset loss

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F7
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, "§1 Problem, as measured"
- **Related:** MC-006

> Users at 1000+ consistently report instability and sudden data/asset loss.

---

### MC-008 — 100+ modules firsthand; 50+ reported as common in the community (unverified impression)

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F8
- **Source:** `Agents/Reports/10-stage-b-module-draft-copy-plan.md`, "§10.5 Measure before planning
  anything — there is no end-to-end number"
- **Related:** MC-009, MC-010

> The maintainer reports **100+ modules** in their own installation (firsthand), and that **50+
> module installations seem common in the community** (their impression, not measured — record as
> reported, not verified). They explicitly noted they sit at the heavy end and asked that this be
> taken as context.

**Canonical wording note.** `Agents/Phase2-Handoff.md` ("Doctrine learned this checkpoint," item 5)
carries the same two figures without the hedge: "The maintainer runs **100+ modules** and reports
50+ as common in the community." That drops the "their impression, not measured" qualifier this
entry's canonical source (Report 10) attaches to the 50+ figure. The 100+ figure is firsthand in
both; the 50+ figure is impression-only in both, but only Report 10 says so explicitly. Treat the
Handoff's copy as lossy, not as a second, independent confirmation.

---

### MC-009 — Asset modules bundle 10,000+ images to route around RisuRealm's 150 MB card limit, reaching 1-2 GB on disk

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F9
- **Source:** `Agents/Reports/10-stage-b-module-draft-copy-plan.md`, "§10.5b Benchmark result, and
  why it is PROVISIONAL" (not §10.5d as the sweep's location note said — see note); also
  `Agents/Phase2-Handoff.md`, "Doctrine learned this checkpoint," item 5
- **Related:** MC-008

> The maintainer reports real "asset modules" bundling **10,000+ images** to work around
> RisuRealm's 150 MB upload limit, reaching 1-2 GB on disk.

`Phase2-Handoff.md`'s shorter paraphrase of the same fact: "Asset modules bundle **10,000+ images**
to get around RisuRealm's 150 MB limit, reaching 1-2 GB on disk." Both name the same figures; the
wording differs but the claim does not, so this is filed as one fact rather than two.

---

### MC-010 — All Stage-B module-editor measurements were taken on an i9-13900K / RTX 3090 / 64 GB DDR5 machine

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F10
- **Source:** `Agents/Reports/10-stage-b-module-draft-copy-plan.md`, "§10.5h HARDWARE CONTEXT —
  every number above is a BEST CASE"

> Supplied by the maintainer. **All measurements in 10.5b through 10.5g were taken on an
> Intel i9-13900K / RTX 3090 / 64 GB DDR5 machine** — near the top of consumer single-threaded JS
> performance. They are a *lower bound on latency*, not a typical user experience.

**Canonical wording note — three copies of decreasing precision.** This is the full spec, and is
canonical. `Agents/Phase2-Handoff.md` ("Doctrine learned this checkpoint," item 3) drops the GPU:
"All measurements came from an **i9-13900K / 64 GB DDR5**." `Agents/Tools/README.md` drops both the
GPU and the RAM: "Campaign measurements to date were taken on an i9-13900K; see the Stage B plan
[…] before quoting any absolute millisecond figure as a user-facing claim." None of the three
contradicts another — each is a shorter copy of the same fact, progressively losing detail. Treat
only Report 10's wording as complete.

---

### MC-011 — This fork has never shipped and has no userbase; the campaign gates the first release

- **Tag:** stated
- **Date:** 2026-09-23
- **Sweep ref:** F11
- **Source:** `Agents/Reports/21-deferral-re-review.md`, opening ("Why this exists")

> The maintainer established on 2026-09-23 that **this fork has never shipped and has no
> userbase** — the campaign itself gates the first release, and the last build with users is
> upstream.

---

### MC-012 — The RisuAccount hub is maintained entirely upstream and cannot be modified from this repo

- **Tag:** stated
- **Date:** 2026-09-20
- **Sweep ref:** F12
- **Source:** `Agents/Summary.md`, "§5 Multi-Instance / Multi-Writer Conflicts"; also
  `Agents/Roadmap.md`, Phase 1.5 Tier B item 6

> **Update (2026-09-20, confirmed by the project owner directly, not just inferred from the
> absence of hub source in this repo): the hub is maintained entirely upstream and cannot be
> modified from this repo at all.** This was originally flagged as an open investigation question
> ("what does the hub enforce, and could we find out"); it is now a confirmed hard constraint
> instead — not a temporary gap pending more research.

Roadmap's version of the same update: "**Update (2026-09-20):** the project owner directly
confirmed the hub is maintained entirely upstream and cannot be modified from this repo at all —
this is a confirmed hard constraint, not an open question that more investigation could resolve."

---

### MC-013 — The trash implementation is known to be unstable among the community

- **Tag:** stated
- **Date:** not recorded · on or before 2026-09-21 (`54e9dc58`)
- **Sweep ref:** F13
- **Source:** `Agents/Roadmap.md`, "CHORE-03 — Trash: dedicated bug-hunting pass"

> **Maintainer report: the trash implementation is known to be unstable among the community.**

---

### MC-014 — Enabling or disabling a module freezes the UI, from both entry points

- **Tag:** stated
- **Date:** not recorded · on or before 2026-09-21 (`54e9dc58`)
- **Sweep ref:** F14
- **Source:** `Agents/Roadmap.md`, "CHORE-04 — Module enable/disable causes a freeze too, by a
  DIFFERENT mechanism"

> **Maintainer report:** enabling a module from the chat screen (hamburger -> modules) and from
> Settings -> Modules both freeze. Deserves its own investigation.

---

### MC-015 — Much of the UI, dialogs and informational text render in English regardless of the selected language

- **Tag:** stated
- **Date:** not recorded · on or before 2026-09-21 (`54e9dc58`)
- **Sweep ref:** F15
- **Source:** `Agents/Roadmap.md`, "CHORE-05 — Translation coverage: much of the UI is
  English-only"

> **Maintainer report:** a lot of UI, dialogs and informational text render in English regardless
> of the selected language, which dilutes the localised experience.

---

### MC-016 — Old user reports exist of the cold-storage "could not be loaded" error text

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F16
- **Source:** `Agents/Roadmap.md`, "CHORE-07 — A transient cold-storage read failure permanently
  orphans a chat (DATA LOSS, reproduced)"

> **Seen in the wild (maintainer, 2026-09-21):** old user reports exist of this exact
> `[Cold storage data could not be loaded...]` text. Cold storage defaults to on only for installs
> that had no plugins at first load, so the affected population is mostly plugin-free users.

---

### MC-017 — Two community plugins that write the database were supplied by the maintainer as evidence

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F17
- **Source:** `Agents/Roadmap.md`, "CHORE-01 — Mutations to a NON-selected character are never
  marked for save"; also `Agents/Reports/12-charlist-avatar-plan.md`, "§3 AV-2 — lazy avatar
  resolution (constraints; plan after AV-1 lands)"

> **Real plugin exposure (2026-09-21).** Two community plugins, provided by the maintainer
> (`Agents/Evidences of Investigations/`, gitignored, never commit), write the database through the
> plugin API:
> - **AssetGod v3_alt:** `risuai.setDatabase` ×7.
> - **fast-character-import v3 2.0.0:** `setDatabaseLite` and `setCharacterToIndex`.

Report 12's shorter restatement: "**Real plugins checked (2026-09-21):** AssetGod v3_alt and
fast-character-import v3, both maintainer-provided and gitignored."

---

### MC-018 — Korean translations of the save-conflict keys were reviewed by the maintainer; the other five locales are model output

- **Tag:** stated
- **Date:** 2026-09-22
- **Sweep ref:** F18
- **Source:** `Agents/Roadmap.md`, "CHORE-05 — Translation coverage," "Status (2026-09-22)"

> **Status (2026-09-22):** the 9 save-conflict keys below are translated into all six locales
> (`0291ea36`; `ko` reviewed by the maintainer, the other five are model translations).

---

### MC-019 — The character list is the slowest part of the app, by the maintainer's own ranking

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F19
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, "§1 Problem, as measured"

> The maintainer ranks the character list as the slowest part of the app.

---

### MC-020 — Keystroke freeze once affected every text field; character and lorebook fields no longer freeze

- **Tag:** corrected
- **Date:** 2026-09-21
- **Sweep ref:** F20
- **Source:** `Agents/Reports/10-stage-b-module-draft-copy-plan.md`, "§10.5e PRIOR ART — the fix
  already exists in this file, for characters"; corrected in
  `Agents/Reports/11-stage-b-module-effect-partition-plan.md`, "§2 Why modules and not
  characters — and why this is NOT the character pattern"
- **Related:** MC-037

> The maintainer reports that this "freeze on every keystroke" behaviour **used to affect every
> text field in the app**, and that character definitions and character lorebook entries **already
> got fixed** — modules are the leftover.

**The correction is subtle, and does not mean the maintainer was wrong.** The maintainer's reported
*outcome* — characters and lorebooks do not freeze, modules do — is confirmed true, and Report 11
restates it independently ("Character definitions and character lorebook entries do **not** have
this problem"). What Report 11 corrected was a *mechanism* claim layered on top during report
drafting, not the maintainer's own words:

> **History note (gate finding F-6).** An earlier draft asserted "characters were fixed while
> modules were not". `git log -S "key !== 'characters'"` gives `b4d08b1f` ("fix save lag"), which
> introduced the entire effect-based tracker with character scoping **already present** -- there
> was no later "characters got fixed" event. The maintainer's report describes the user-visible
> outcome (characters do not freeze, modules do), which is accurate; the historical mechanism claim
> was not. Do not state it as history in a commit message.

So: the fact is accurate and stands as `corrected` only in the sense that a false inference sitting
next to it in an earlier report draft was removed, not because the maintainer's claim was revised.

---

### MC-021 — Four distinct chat-list slowdowns: opening a long chat, scroll-back sluggishness, streaming lag, typing lag

- **Tag:** stated
- **Date:** 2026-09-22
- **Sweep ref:** F21
- **Source:** `Agents/Reports/19-chat-list-window-plan.md`, "Scope"

> **Scope.** This is Roadmap Phase 2 item 3, the chat-list half. The maintainer reports four
> slowdowns in long chats: opening a long chat, sluggishness after scrolling far back, lag while
> streaming, and typing lag. Module toggling is also slow, which is CHORE-04.

---

### MC-022 — Plugins are widely used; the developer strongly discourages V2.* plugin installation for security reasons

- **Tag:** stated
- **Date:** not recorded · on or before 2026-09-19 (`f7e95130`)
- **Sweep ref:** F22
- **Source:** `Agents/Summary.md`, "Cross-Cutting Observations"

> **Plugin ecosystem context** (project owner, not independently investigated here): plugins are
> widely used, but the developer strongly discourages V2.* plugin installation for security
> reasons.

---

### MC-023 — The Android icon/resource claim is confirmed, but more nuanced than "one misplaced folder"

- **Tag:** verified
- **Date:** not recorded
- **Sweep ref:** F23
- **Source:** `Agents/Reports/04-tauri-platform-expansion.md`, "Executive Summary" (the sweep's
  location note said "top summary," which is the same section)

> The Android icon/resource claim from the project owner is **confirmed, but more nuanced than
> "one misplaced folder."** There are two independent, unrelated sets of Android-shaped assets in
> the repo (detailed below): one is an orphaned leftover from a 2024 Capacitor-based Android
> prototype that has nothing to do with Tauri's pipeline, and the other is a correctly-generated,
> Tauri-convention set that is already sitting in the right place, just unused because
> `tauri android init` was never run.

---

### MC-024 — Long-press/right-click on a module's check icon does bind it character-wide; the mechanism works, it is just undiscoverable

- **Tag:** verified
- **Date:** 2026-09-21
- **Sweep ref:** F24
- **Source:** `Agents/Maybe-Later.md`, "QOL-01," §A

> *(Behaviour confirmed by yor42, 2026-09-21: right-click / long-press does work as documented, and
> does bind character-wide. The feature is fine. Finding it is the problem.)*

---

### MC-025 — Maintainer wants to explore speeding up backup specifically on Tauri and local (non-account) paths

- **Tag:** stated
- **Date:** 2026-09-21
- **Sweep ref:** F25
- **Source:** `Agents/Maybe-Later.md`, "QOL-04"

> **yor42, 2026-09-21, after seeing the refutation: wants to explore speeding up backup on Tauri
> and local specifically.** That is the tractable half and it is well scoped, because those are
> exactly the two cases where the `isAccount` throttle never runs.

---

### MC-026 — Upstream's own maintainer objected to a community backup plugin over server strain

- **Tag:** stated
- **Date:** not recorded · on or before 2026-09-21 (`80eec3c1`)
- **Sweep ref:** F26
- **Source:** `Agents/Maybe-Later.md`, "QOL-04"

**Referent note — read carefully.** In every other entry in this document, "the maintainer" means
this fork's maintainer. `Agents/Maybe-Later.md`, QOL-04 is the one place in the seeded material
where "maintainer" means someone else: **upstream's** developer, not this fork's.

> The upstream maintainer's objection to a community backup plugin was specifically that plugins
> run on the public instance and would strain its asset-cache servers; `backuplocal.ts:147-150` is
> that concern encoded in this codebase.

This sits immediately beside the standing rule that the account/sync path must never be made more
aggressive, which is exactly where that rule traces back to. The same paragraph states the rule
directly: "**Do not** make the account/sync path more aggressive. […] Any change here must leave
the `isAccount` branch's behaviour alone, and must not assume a self-hosted deployment is
automatically off that path."

---

### MC-027 — `.gitignore` excludes two specific Evidences subdirectories, not the whole tree

- **Tag:** corrected
- **Date:** 2026-09-23
- **Sweep ref:** none (a standing-practice correction, not part of the F/D sweep table)
- **Source:** `.gitignore` (repo root); `git log --diff-filter=A -- "Agents/Evidences of
  Investigations/Asset Cache/example symptoms.png"`

The campaign's working practice has carried a rule that "`Agents/Evidences of Investigations/` is
gitignored" without qualification. That is too broad. `.gitignore` names exactly two
subdirectories:

> Agents/Evidences of Investigations/Community plugins to solve common pain points/
> Agents/Evidences of Investigations/Asset Cache/Community Mitigation_Webrowser Plugin/

The rest of that tree is tracked, maintainer-supplied evidence. Confirmed directly: `Agents/Evidences
of Investigations/Asset Cache/example symptoms.png` has been committed since `f7e95130`
(2026-09-19), and `git status` at the start of this document's drafting session showed it clean
(no pending change to revert or re-ignore). Verified by the Orchestrator, 2026-09-23.

---

### MC-052 — This is a personal fork about a week old, not a long-lived community fork

- **Tag:** corrected
- **Date:** 2026-09-23
- **Sweep ref:** none (a direct maintainer correction, not part of the F/D sweep table)
- **Source:** stated by the maintainer directly, 2026-09-23. No prior document records it.
- **Corrects:** MC-033
- **Related:** MC-011

`MC-033` quotes a recorded decision containing the line "This work is a long-lived community fork
(like Haejeok-Risu or PocketRisu), not a series of upstream PRs." **The characterization is
wrong.** The maintainer states this is a personal fork, roughly a week old as of 2026-09-23,
created to fix the known data-loss and performance issues directly rather than through upstream
PRs. It has no userbase and no community, and is not comparable to Haejeok-Risu or PocketRisu.

**What MC-033 decided still stands in full.** Only the characterization is corrected, not the
decision. The `risuai.d.ts` note, the instruction that plugin code must keep working on upstream,
the `try/catch` guidance, and the general fork rule — stay fully backward compatible with upstream
characters, modules, presets, `.bin` backups and plugins, and keep changes non-invasive — are all
unaffected. The "not a series of upstream PRs" half of the original line is also correct.

**Provenance is uncertain.** The line sits inside
`Agents/Reports/13-chore07-cold-read-failure-plan.md`, "§5.1 Maintainer decisions (2026-09-21)",
as a sub-bullet supporting the `risuai.d.ts` note, so it was recorded as maintainer-sourced. The
maintainer believes it was an agent's inference. Nothing in the corpus settles which, and the
distinction is not worth pursuing — what matters is that the characterization is not to be
repeated or built on.

**Provenance, settled 2026-09-23.** The paragraph above is superseded: the maintainer stated the
origin directly. It was an agent's inference, and the mechanism is named.

> the long-lived community fork claim is context cross-contamination because I mentioned the other
> forks that was released earlier and has bit more userbase. and previous session decided to
> believe that this is one of the long lasting one too.

**The failure mode generalises, and is the reason this entry is worth its length.** The maintainer
named Haejeok-Risu and PocketRisu as *comparisons* — other forks that exist, shipped, and have some
userbase. A session then transferred those projects' properties onto this one and wrote the result
into a report as a maintainer decision, where it was read as maintainer-sourced ever after. Nothing
was fabricated outright; a real statement was over-extended by one step, and that step was never
marked.

**How to apply.** When the maintainer cites another project, treat the citation as a comparison
until they say otherwise. Properties of the cited project — release status, userbase, age,
governance — do not transfer to this one. If an inference of that kind is load-bearing enough to
record, record it as an inference with its basis, not as a stated fact; `MC-026` is the other place
in this log where a referent slipped, and it carries a similar warning.

**Why this matters beyond wording.** "Long-lived community fork" invites reasoning about
community expectations, contributor onboarding, and an installed base — none of which exist.
Combined with `MC-011` (this fork has never shipped), the correct picture is: no users, no
community, no shipped behaviour to preserve, and therefore no reason to weigh a design by how
little it disrupts the current fork. The upstream compatibility invariant is unaffected, because
it exists for users migrating *from* upstream.

---

## Decisions

### MC-028 — All four avatar stages (AV-1 through AV-4) are in scope, in rising-risk order

- **Tag:** decision
- **Date:** 2026-09-21
- **Sweep ref:** D1
- **Source:** `Agents/Reports/12-charlist-avatar-plan.md`, opening (status block and the
  paragraph that follows it); also `Agents/Phase2-Handoff.md`, "LIVE STATE — session of 2026-09-21
  afternoon" (section removed 2026-09-23 in the handoff/Live-State split; the quoted text is preserved in git history as of `ca27760f`)
- **Reasoning:** the chosen order is stated as being "by rising risk" (quoted below); no further
  reasoning is recorded in source.
- **Alternatives rejected:** not recorded in source.
- **Depends on:** not recorded in source.

> **Scope chosen by the maintainer:** all four stages, A, B, C and D (see §1). […] The maintainer's
> letters map as follows: A → **AV-1**, C → **AV-2**, B → **AV-3**, D → **AV-4**. That is also the
> implementation order, which is by rising risk.

`Phase2-Handoff.md` records the same choice from the maintainer's own session: "Phase 2 **item 3**
first, starting with the **character lists**. The maintainer chose all four avatar stages. […]
Order: AV-1 (stop re-lookups), then AV-2 (lazy-mount), then AV-3 (plain-HTTP encode), then AV-4
(thumbnails). **Keep B (AV-3) before D (AV-4).**"

---

### MC-029 — AV-3: cache the encoded avatar string with a byte budget, not `blob:` URLs; fold in `fileSrcCache`; 64 MiB

- **Tag:** decision
- **Date:** 2026-09-22
- **Sweep ref:** D2
- **Source:** `Agents/Reports/15-av3-plain-http-encode-plan.md`, opening status block
- **Reasoning:** not recorded in source as the maintainer's own stated reasoning (the plan's design
  section argues for option (a), but that is the plan's reasoning, not a quoted maintainer
  rationale).
- **Alternatives rejected:** option (b), `blob:` URLs (named, not explained in the maintainer's own
  words).
- **Depends on:** not recorded in source.

> **Maintainer decisions (2026-09-22):** option (a), caching the encoded string with a byte budget,
> not `blob:` URLs. **Fold in** the chat renderer's unbounded `fileSrcCache`. Budget **64 MiB**.

---

### MC-030 — AV-4: NovelAI 832×1216 PNG as the baseline avatar; first view waits for the thumbnail; animated avatars stay full-size

- **Tag:** decision
- **Date:** 2026-09-22
- **Sweep ref:** D3
- **Source:** `Agents/Reports/16-av4-list-avatar-thumbnails-plan.md`, opening status block
- **Reasoning:** "Many users generate avatars there" (quoted below) is the stated reasoning for the
  baseline choice; no further reasoning recorded for the other two decisions in this entry.
- **Alternatives rejected:** not recorded in source.
- **Depends on:** MC-004 (animated avatars must be preserved).

> **Maintainer decisions (2026-09-22):**
> - Baseline avatar: the NovelAI portrait, **832×1216 PNG**. Many users generate avatars there.
> - **First view waits for the thumbnail.** A list icon without a thumbnail is generated before it
>   shows. Where a thumbnail exists, the lists never hold the full-size image. Each avatar pays
>   this once.
> - Animated avatars exist and must stay animated (Report 12 §1).

---

### MC-031 — CHORE-07 is staged 7a/7b/7c, with 7c split again per the maintainer's "keep it minimal" direction

- **Tag:** decision
- **Date:** 2026-09-21
- **Sweep ref:** D4
- **Source:** `Agents/Reports/13-chore07-cold-read-failure-plan.md`, opening status block and
  "§5 Stage 7c — plan"
- **Reasoning:** the campaign rule to split risky batches into gated stages (stated in the status
  block, quoted below).
- **Alternatives rejected:** not recorded in source.
- **Depends on:** not recorded in source.

> **Status:** revision 3. Revisions 1 and 2 each received "approve with required changes" from
> `opus-reviewer` (ledger 23 and 25), with a new BLOCKER each time. Rev 3 **stages** the work, per
> the campaign rule to split risky batches into gated stages.

And, on splitting 7c further:

> 7b is committed (`3e17c8a3`) as a minimal core. It stops overwriting the chat, adds the send
> guards and shows a soft notice. 7c is split into two sub-stages, following the maintainer's
> "keep it minimal" direction, and **each sub-stage gets its own gate.**

---

### MC-032 — CHORE-07 plugin storage: option A — `getItem`/`setItem` reject on failure

- **Tag:** decision
- **Date:** 2026-09-21
- **Sweep ref:** D5
- **Source:** `Agents/Reports/13-chore07-cold-read-failure-plan.md`, "§5.1 Maintainer decisions
  (2026-09-21)"
- **Reasoning:** not recorded in source beyond the decision itself.
- **Alternatives rejected:** not named in source (the plan calls this "option A" without recording
  what option B was).
- **Depends on:** not recorded in source.

> - **Plugin storage, option A.**
>   - `pluginStorage.getItem` **rejects** when a read fails, and resolves `null` only when the data
>     is really missing.
>   - `pluginStorage.setItem` **rejects** when a write fails. Today it ignores
>     `setColdStorageItem`'s `false`.

---

### MC-033 — Label the reject behaviour fork-specific in `risuai.d.ts`; general fork-compatibility rule

- **Tag:** decision
- **Date:** 2026-09-21
- **Sweep ref:** D6
- **Source:** `Agents/Reports/13-chore07-cold-read-failure-plan.md`, "§5.1 Maintainer decisions
  (2026-09-21)"
- **Reasoning:** stated directly (quoted below) — upstream accepts only small, measurable PRs, so
  this work will not land there, and plugin code must keep working on upstream too.
  **[corrected 2026-09-23]** This line previously opened "this is a long-lived community fork, and
  upstream accepts…". That characterization was wrong and is retired by `MC-052`; the rest of the
  reasoning, and the decision itself, are unchanged.
- **Alternatives rejected:** not recorded in source.
- **Depends on:** MC-032.

> - **`risuai.d.ts` note.** Document that both can reject, and label this **specific to this
>   fork**.
>   - This work is a long-lived community fork (like Haejeok-Risu or PocketRisu), not a series of
>     upstream PRs. Upstream appears to accept only small, measurable PRs.
>   - Plugin code must keep working on upstream too. The note should tell authors to wrap these
>     calls in `try/catch`, which is harmless on upstream, and must not suggest they can count on
>     the rejection happening.

**Corrected by:** `MC-052` — the "long-lived community fork (like Haejeok-Risu or PocketRisu)" characterization is wrong;
this is a personal fork about a week old. The decision recorded here is unaffected.

---

### MC-034 — CHORE-07 7b's minimal core was approved; the firm "data lost" notice waits for 7c

- **Tag:** decision
- **Date:** 2026-09-21
- **Sweep ref:** D7
- **Source:** `Agents/Investigation-Ledger.md`, row 39
- **Reasoning:** stated directly — a failed load that stops writing the error text still leaves the
  pointer on screen indefinitely, so a firm "delete this chat" notice needed a reliable
  missing-vs-error signal that did not exist yet.
- **Alternatives rejected:** shipping the firm notice with the minimal core (rejected because the
  missing-vs-error signal was not yet reliable).
- **Depends on:** MC-031.

> Verdict: **approve with findings**, for a minimal core. Key finding (Orchestrator-verified): once
> a failed load stops writing the error text, the pointer stays on screen indefinitely, so
> `/cut`/`/del`/`/multisend clear` could drop it and a later cleanup could delete the blob — the
> core therefore had to include a `sendMain` guard and a notice, not just 'no mutation'. Deferred
> to 7c: the three-way reader, side-field merges, the plugin `sendChat` guard, save-marking, a
> Retry button. Maintainer approved the core; the firm 'delete this chat' notice waits for a
> reliable missing-vs-error signal in 7c.

---

### MC-035 — CHORE-01 + item 2: option B (selection-scoped partition plus explicit marks), not option A (watch every character)

- **Tag:** decision
- **Date:** 2026-09-22
- **Sweep ref:** D8
- **Source:** `Agents/Reports/17-chore01-item2-plan.md`, opening status block and "§2 Why option
  B, not option A"
- **Reasoning:** option A retains far more memory and boot cost at scale, and the hardware floor
  is a Pi 3 and mid-range phones (quoted below).
- **Alternatives rejected:** option A — "one deep child effect per character."
- **Depends on:** MC-003.

> Design choice made by the maintainer on 2026-09-22: **option B** (selection-scoped partition plus
> explicit marks), not option A (watch every character). §2 records why.

The stated reasoning:

> Option A (one deep child effect per character) fixes CHORE-01 for every writer, but retains about
> **+170 MB** at 1000 characters / ~148k messages (537 → 708 MB, Node) and 1.5-1.7 s at boot on the
> i9, and it would lock in the boot proxy materialisation that is Phase 2 item 8's main lever. The
> hardware floor is a Pi 3 and mid-range phones. The maintainer chose B.

---

### MC-036 — Plugin `setDatabase`/`setDatabaseLite`: mark every character for save rather than reload

- **Tag:** decision
- **Date:** 2026-09-22
- **Sweep ref:** D9
- **Source:** `Agents/Reports/17-chore01-item2-plan.md`, "§10 Gate record," "Gate 1 re-review —
  opus-reviewer (fresh), 2026-09-22 — [APPROVE-WITH-FINDINGS] (rev 2)"; see also §3.3
- **Reasoning:** stated directly — this is "for safety," because V2 plugins edit the database in
  place where the change cannot be observed, and V3 plugins hand back fresh copies (quoted below).
- **Alternatives rejected:** reloading the encoder on a plugin `setDatabase` call — rejected because
  a stale plugin snapshot would then become a new permanent-deletion path.
- **Depends on:** MC-035, MC-017.

> **F3** reload from a stale plugin snapshot is a new permanent-deletion path → **maintainer chose
> marking every character instead of reloading** (§3.3, §7, §8).

§3.3's handler table states the decision itself:

> **Maintainer decision (re-review F3), 2026-09-22: mark, do not reload.**

The "for safety" rationale is **not** in Report 17. It is in `Agents/Roadmap.md`, "CHORE-17":

> That is the maintainer's F3 decision, for safety: V2 edits in place and can't be seen; V3 hands
> back fresh copies. The next save re-encodes all N.

---

### MC-037 — CHORE-17: build "layer 2" (skip unchanged writes) only, for now; layer 1 (setter reconcile) is on hold

- **Tag:** decision
- **Date:** 2026-09-22
- **Sweep ref:** D10
- **Source:** `Agents/Roadmap.md`, "CHORE-17 — Plugin `setDatabase` re-encodes every character (a
  cost, not data loss)"; also `Agents/Reports/18-chore17-skip-unchanged-writes-plan.md`, opening
  "Scope"
- **Reasoning:** the choice followed a real Chromium measurement of the CHORE-01 Stage 2 cost
  (stated in the Roadmap entry); the Roadmap is cited as recording why layer 1 is on hold, but the
  "why" itself is not quoted in the seed material for this entry.
- **Alternatives rejected:** layer 1, the plugin-setter boundary reconcile — deferred, not
  rejected outright.
- **Depends on:** MC-036.

> **Status (2026-09-22):** Sequenced after CHORE-01 Stage 2, by the maintainer's decision. Stage 2
> is now implemented, gated and committed as `fbf799a7`, so CHORE-17 was unblocked and measured in
> real Chromium (see "Measured" below). Based on that measurement, the maintainer chose to build
> **layer 2 only** (the encoder's exact-bytes skip) plus a **remote content-hash write dedupe**,
> now. **Layer 1 (the setter boundary reconcile) is ON HOLD** — see "Why layer 1 is on hold" below.

Report 18's scope statement of the same decision:

> **Scope (maintainer's decision, 2026-09-22):** only "layer 2" from the CHORE-17 entry in
> `Agents/Roadmap.md`: skip storage writes whose bytes are already stored. The plugin-setter
> reconcile ("layer 1") is on hold; the Roadmap records why.

---

### MC-038 — CHORE-17 is sequenced after CHORE-01 Stage 2

- **Tag:** decision
- **Date:** 2026-09-22
- **Sweep ref:** D11
- **Source:** `Agents/Roadmap.md`, "CHORE-17 — Plugin `setDatabase` re-encodes every character (a
  cost, not data loss)"
- **Reasoning:** not recorded in source beyond the sequencing statement itself.
- **Alternatives rejected:** not recorded in source.
- **Depends on:** MC-035.

> **Status (2026-09-22):** Sequenced after CHORE-01 Stage 2, by the maintainer's decision.

---

### MC-039 — Escalation to `senior-advisor` was requested, and its recommended order was approved

- **Tag:** decision
- **Date:** 2026-09-22
- **Sweep ref:** D12
- **Source:** `Agents/Reports/19-chat-list-window-plan.md`, opening status block and "§3 Direction
  (senior-advisor escalation, 2026-09-22; the maintainer approved the order)"; also
  `Agents/Investigation-Ledger.md`, row 97
- **Reasoning:** the trigger for escalating was "several materially different designs failing, and
  a loop" (quoted below); the maintainer's own reasoning for approving the recommended order is not
  separately recorded.
- **Alternatives rejected:** a sixth attempt at guarding the window policy directly, which the
  escalation's own DO-NOT list rules out (recorded as the advisor's recommendation, not a named
  maintainer rejection).
- **Depends on:** not recorded in source.

> Earlier history:
> - Gate 1 rejected revs 1-5, each time finding a new edit-loss path or a false premise (§7).
> - The Orchestrator then escalated to `senior-advisor`. The triggers were several materially
>   different designs failing, and a loop. The maintainer asked for the escalation and approved its
>   recommended order.

The ledger's independent record of the same approval: "The maintainer approved the order and
deferred the multi-tab trade-off to the durable-drafts plan."

---

### MC-040 — Skip the containment experiment's own stage; take the `changeChatTo` fan-out fix instead

- **Tag:** decision
- **Date:** not recorded · on or before 2026-09-23 (`fbc0bd7c`)
- **Sweep ref:** D13
- **Source:** `Agents/Reports/19-chat-list-window-plan.md`, opening status block
- **Reasoning:** the containment experiment "does not pay for itself" (quoted below); §8.6 of the
  same report states this is a recommendation the maintainer's approved order permits changing, but
  does not itself narrate the maintainer's words for choosing the fan-out fix.
- **Alternatives rejected:** shipping containment (`content-visibility: auto`) as its own stage.
- **Depends on:** MC-039.

> Containment experiment: **measured** (§8). It does not pay for itself; the maintainer chose to
> skip it and take the `changeChatTo` fan-out fix instead.

---

### MC-041 — The multi-tab gate ships as option (b): a draft kind, not a Pareto-argued option (a)

- **Tag:** decision
- **Date:** not recorded
- **Sweep ref:** D14
- **Source:** `Agents/Reports/20-durable-drafts-plan.md`, "§6 The multi-tab gate: option (b), as a
  draft kind (maintainer decision)"
- **Reasoning:** stated directly — option (a)'s Pareto argument compares against "a build that has
  never had a user," which is a scope argument, not a shipping one (quoted below).
- **Alternatives rejected:** option (a), a Pareto-based simplification, rejected because its
  comparison is against a build that has never had a user. No other option is recorded in source.
- **Depends on:** MC-011.

> Rev 1 recommended (a) on a Pareto argument. That compares against a build that has never had a
> user, so it is a scope argument, not a shipping one. **Adopted: (b), as a draft kind.**

---

### MC-042 — A restored draft must be visible and reversible: a marker plus a one-click revert

- **Tag:** decision
- **Date:** not recorded
- **Sweep ref:** D15
- **Source:** `Agents/Reports/20-durable-drafts-plan.md`, "§5.4 A restore is visible and reversible
  (maintainer decision)"
- **Reasoning:** stated directly — without this, the stage would add "a new quiet failure": a user
  opening an editor expecting a small edit, finding an hour-old draft, and unknowingly overwriting
  the current message wholesale (quoted below).
- **Alternatives rejected:** a silent restore (the design the stage would default to without this
  decision).
- **Depends on:** not recorded in source.

> Without this the stage adds a new quiet failure: the user opens an editor intending a small
> change to the text they can see, the box holds something typed an hour ago, they edit the tail
> and save, and the message is replaced wholesale.
>
> A restored buffer carries a visible marker and a one-click revert to the stored message text.

---

### MC-043 — The composer's mis-send fix is split into its own stage, after first being folded in

- **Tag:** decision
- **Date:** not recorded
- **Sweep ref:** D16
- **Source:** `Agents/Reports/20-durable-drafts-plan.md`, "§4.5 The composer moves to its own
  stage (maintainer decision)"
- **Reasoning:** stated directly — the fold-in would have re-imported the same freeze-at-open
  hazard already fixed for message editors, because the composer has no "open" event to freeze an
  identity at, and the draft unit needed to move as three linked values, not one (quoted below).
- **Alternatives rejected:** folding the composer fix into this same stage (attempted in revision
  2, then found unsafe by the gate).
- **Depends on:** not recorded in source.

> **Gate 1 round 2 showed the fold-in imports a new instance of rev 1's blocker.** §5.1's whole
> remedy is "freeze at editor-open", and **the composer has no open event** — it is always live.
> [...]
> **The maintainer chose to split it out.** The composer stage needs: a normative
> flush-under-the-old-key-then-restore-under-the-new-one ordering, all three values moving
> together, and a generation token for the async translate writes. It is next, not never.

---

### MC-044 — Module draft-copy durability: full parity with today's behaviour, reaffirmed after a cost correction, decided twice

- **Tag:** superseded
- **Date:** 2026-09-21
- **Sweep ref:** D20
- **Source:** `Agents/Reports/10-stage-b-module-draft-copy-plan.md`, "§3.7 Durability — the flush
  paths (maintainer-directed, full parity)" and "§6 Open questions for the gate," item 1
- **Reasoning:** the maintainer first chose full parity believing it cost one Tauri hook;
  investigation then found it also needed a new awaitable save primitive, and that a cheaper
  debounce-only alternative would land within about 500 ms of today's actual behaviour, because
  today's durability is itself only trailing-debounced. Told this correction, the maintainer
  reaffirmed full parity a second time (quoted below).
- **Alternatives rejected:** a 500 ms debounce alone, with no save-loop change, accepting ~500 ms
  of extra exposure as a documented limitation.
- **Depends on:** MC-008, MC-009, MC-010, MC-020 (the maintainer's own context — profile sizes,
  asset modules, hardware, and the character-editor comparison — is what `Phase2-Handoff.md`
  credits with settling this line of work more than either review gate did; see the closing
  section below).

> The maintainer was shown the cheaper alternative (a 500 ms debounce alone, no save-loop change,
> ~500 ms of extra exposure written up as an accepted limitation) and **reaffirmed full parity**,
> explicitly accepting a change to `saveDb()`. That decision is recorded, not re-litigated here.

The "decided twice" account, from §6:

> **RESOLVED by the maintainer, 2026-09-21 — full durability parity, decided twice.** [...]
> The maintainer first chose full parity believing it cost one Tauri hook. Investigation then
> established that it also requires a new awaitable save primitive inside `saveDb()` (§3.7.4), and
> separately that the cheaper alternative — a 500 ms debounce alone, no save-loop change — lands
> within ~500 ms of today's actual behaviour, because today's durability is itself only
> trailing-debounced (§3.7). Both corrections were put back to the maintainer, who **reaffirmed
> full parity and explicitly accepted the save-loop change.** Recorded, not re-litigated.

**This decision is historical, not binding on what shipped.** It governed the module draft-copy
design end-to-end — the whole design it belongs to was later retired in its entirety (two
`opus-reviewer` gates plus a `senior-advisor` escalation; see "Decisions commonly mis-attributed to
the maintainer," below). This durability decision does **not** bind the effect-partition design
that actually shipped (`Agents/Reports/11-stage-b-module-effect-partition-plan.md`), which does not
move data out of `db.modules` and therefore has no equivalent durability gap to decide. **Superseded
by:** the retirement of the module draft-copy design as a whole. That retirement is not itself a
maintainer decision with its own `MC-` id — see the closing section, which explains why — so this
back-pointer names the closing section rather than a single entry.

---

### MC-045 — OPFS: wire up a real settings toggle rather than delete the dead code

- **Tag:** decision
- **Date:** not recorded · on or before 2026-09-19 (`155c915c`)
- **Sweep ref:** D21
- **Source:** `Agents/Roadmap.md`, Phase 1 item 5
- **Reasoning:** stated directly — the atomicity bug was already fixed (Phase 0), and genuine
  cross-tab-safe migration in both directions now exists (quoted below).
- **Alternatives rejected:** removing the dead OPFS code entirely.
- **Depends on:** not recorded in source.

> **✅ DONE. OPFS settings toggle** — decided (user choice) to wire up a real in-app settings path
> (`src/lib/Setting/Pages/FilesSettings.svelte`, "Local Storage Backend") rather than remove the
> dead code, now that its atomicity bug is fixed (Phase 0) and it has genuine cross-tab-safe
> migration in both directions (see the Status section above for the nine-round review history —
> this ended up being the single hardest-won fix across all phases so far, requiring a real Web
> Locks (`navigator.locks`)-based cross-tab mutex, not just the in-process `dbWriteLock`).

---

### MC-046 — `db.enableRemoteSaving`'s default flips from opt-in to opt-out, as an informed product decision

- **Tag:** decision
- **Date:** not recorded · on or before 2026-09-20 (`724d4334`)
- **Sweep ref:** D22
- **Source:** `Agents/Roadmap.md`, Phase 1.5 Tier B item 5
- **Reasoning:** not recorded in source beyond it being described as "an explicit, informed product
  decision made in-session, not something implemented unilaterally" (quoted below).
- **Alternatives rejected:** leaving the default at opt-in.
- **Depends on:** not recorded in source.

> Extending the existing per-character `remote: 'prefer'` block-splitting mechanism's eligibility to
> account-sync, and flipping `db.enableRemoteSaving`'s default from opt-in to opt-out (the latter an
> explicit, informed product decision made in-session, not something implemented unilaterally), were
> both implemented, then reverted after round 1 of Codex review on item 4's work found a real,
> high-severity data-integrity gap [...]

**Note.** This decision was made, then the feature it enabled (Stage 3, blast-radius reduction) was
implemented and reverted in the same round after a data-integrity gap was found (see the same
Roadmap entry). The decision to flip the default is recorded as made; the source does not state
that the decision itself was reversed, only that the accompanying implementation was.

---

### MC-047 — Android must not be scoped as a standalone task; it is gated behind the RAM/performance rework

- **Tag:** decision
- **Date:** not recorded · on or before 2026-09-19 (`f7e95130`)
- **Sweep ref:** D23
- **Source:** `Agents/Reports/04-tauri-platform-expansion.md`, "Sequencing Constraint: Android Is
  Gated Behind RAM/Performance Fixes"; also `Agents/Summary.md`, "§4 Tauri Platform Expansion"
- **Reasoning:** the current architecture — no virtual scrolling, the entire save database in one
  large reactive in-memory state object — would OOM low-RAM Android devices if cross-compiled as-is
  (stated in both cited sources).
- **Alternatives rejected:** treating Android as a parallel or independent workstream.
- **Depends on:** not recorded in source (the RAM/performance investigation this gate depends on is
  cross-referenced by topic, not by an `MC-` fact seeded here).

> Per explicit instruction from the project owner for this investigation: **do not recommend "just
> add Android support" as a standalone, immediately-actionable item.** A separate investigation
> found the current implementation is RAM-heavy — no virtual scrolling, and the entire save
> database appears to live in one large reactive in-memory state object — and naively
> cross-compiling that as-is to Android would cause OOM crashes on low-RAM Android devices. This
> report treats Android strictly as a **later-phase target**, sequenced strictly *after* that
> RAM/performance rework lands, not as a parallel or independent workstream.

---

### MC-048 — Phase 2 item 3 (character lists) goes first, before the rest of Phase 2

- **Tag:** decision
- **Date:** 2026-09-21
- **Sweep ref:** D24
- **Source:** `Agents/Phase2-Handoff.md`, "LIVE STATE — session of 2026-09-21 afternoon" (section removed 2026-09-23 in the handoff/Live-State split; the quoted text is preserved in git history as of `ca27760f`)
- **Reasoning:** not recorded in source beyond the choice itself.
- **Alternatives rejected:** not recorded in source (Phase 2 items 2 and 4 were the other open
  candidates at the time; the source does not record why they were not chosen first).
- **Depends on:** not recorded in source.

> **Maintainer decisions this session:**
> - Phase 2 **item 3** first, starting with the **character lists**. The maintainer chose all four
>   avatar stages. Plan: `Agents/Reports/12-charlist-avatar-plan.md`. Order: AV-1 (stop
>   re-lookups), then AV-2 (lazy-mount), then AV-3 (plain-HTTP encode), then AV-4 (thumbnails).
>   **Keep B (AV-3) before D (AV-4).**

---

### MC-053 — The home screen's realm block becomes a card in the Related Links grid, not a section above it

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, 2026-09-23, answering the open question in the
  home-screen stage brief ("Should the home screen keep a realm *preview* at all, or reduce to a
  single RisuRealm button?").
- **Reasoning:** recorded in the answer itself — the realm block should follow the design
  convention already used by the Related Links buttons rather than being its own full-width
  section.
- **Alternatives rejected:** three options were offered and none was taken: (a) reorder so Related
  Links sit above the realm block, keeping the preview and reserving its height; (b) reduce the
  realm block to a single RisuRealm button; (c) reorder only, without reserving space. The
  maintainer proposed a fourth shape instead.
- **Related:** MC-011, MC-052.

> I think separate widget that follows design convention of other 'related links' button would be
> more fitting to UI scheme. I Imagine it would be a taller, vertical rectangular button that also
> has smaller, more compact list of previews. not sure if its possible though.

**Consequence for the mobile-fold problem.** The brief's Change 1 was that Related Links sit below
the whole realm grid on mobile and are pushed further down when the fetch resolves. This decision
dissolves that by construction rather than by reordering: the realm becomes one card among the
link cards, so link cards exist both above and beside it, and the preview list is bounded inside a
card instead of being an unbounded grid. Giving that card a fixed height also removes the
after-paint shift, since the compact list resolves inside a box whose size is already committed.

**"not sure if its possible though" — it is.** A grid child spanning two rows with a clamped or
scrolling list inside is ordinary CSS grid work and needs no new dependency. This note is recorded
because the uncertainty is in the source and should not be mistaken for a constraint.

---

### MC-054 — Standardise on the `Exy3NrqkGm` Discord invite, and label upstream-owned links as upstream

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, 2026-09-23, resolving the two divergent Discord
  invites found in source.
- **Reasoning:** recorded in the answer — this fork has no Discord of its own, so the link points
  at upstream's community and should say so.
- **Alternatives rejected:** dropping the Discord link from the home screen entirely and keeping it
  only on the Communities settings page.
- **Related:** MC-052 (this fork has no community of its own), MC-053.

> Exy3NrqkGm is still live. this fork does not have discord, so I think we can have something like
> a gray text that says 'upstream'.

**The divergence is drift, not intent.** `src/lib/UI/MainMenu.svelte` carries
`https://discord.gg/Exy3NrqkGm` and `src/lib/Setting/Pages/Communities.svelte` carries
`https://discord.gg/JzP8tB9ZK8`. Git history explains how: `JzP8tB9ZK8` was introduced 2023-06-16
(`f72380ef`, "comming soon to offical discord for temp") and appeared in both files; commit
`4063f432` (2024-05-01) removed MainMenu's copy during an unrelated import cleanup; and
`5948aa89` (2024-09-05, "Add related links") added a link block back using a *different* code.
Communities was never revisited. **Liveness is a maintainer-supplied fact, not a git-derived one** —
git establishes only which code is newer.

**The `upstream` label generalises.** It applies to every home-screen link owned by upstream rather
than by this fork, not only Discord — see the brief's Change 2, which adds fork repo and fork issue
links beside the existing upstream ones.

---

### MC-055 — Durable drafts pauses where it is; the home-screen rework finishes first

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, 2026-09-23, after a verification pass established
  that the uncommitted durable-drafts work is incomplete rather than finished-but-uncommitted.
- **Reasoning:** stated in the answer — the stage is unfinished, so its state should be recorded
  rather than assumed, and it is picked back up after the home-screen rework rather than
  interleaved with it.
- **Alternatives rejected:** not recorded in source. Finishing durable drafts first, and
  committing the partial work as a checkpoint, were both available and neither was chosen at the
  time of the statement.
- **Related:** MC-042 (the restore affordance that is missing), MC-053, MC-054.

> about the uncommited changes: if those two changes are really unfinished, I think we should
> record it on live status that this is unfinished and we should pick it back up after we finish
> this rework.

**The premise was checked before this decision was made, and the check is why the decision exists.**
The maintainer initially believed the work had been finished by an earlier session that failed to
commit it. A verification pass against `Agents/Reports/20-durable-drafts-plan.md` refuted that: the
main message editor's capture is complete and matches the plan section by section, but the
translation editor is never wired to the draft store (`Chat.svelte` imports only `MessageIdentity`
and never constructs the `TranslationIdentity` that `draftContents.ts` supports), and the `MC-042`
restore marker and one-click revert exist on neither surface — a case-insensitive search for
`revert` or `restored` in `Chat.svelte` returns nothing. Gate 2 was never run; Report 20 §11 stops
at "proceeding to ... Gate 2". `git stash list` is empty and every dangling commit predates the
stage, so there is no lost commit to recover.

**Do not re-open the question of whether this stage is complete.** It was established by source on
2026-09-23. A future session finding substantial, passing, well-tested draft code in the tree is
seeing the *main editor half*, which is genuinely finished — that is precisely what made the work
look complete from the outside.

**Superseded in part (2026-09-24).** The stage resumed after the home-screen rework, as decided
here. The translation editor's capture and the restore marker were then built (`MC-068`), so the
gaps named above describe the tree as of 2026-09-23 only. The sequencing decision itself stands.

---

### MC-056 — The realm feed must distinguish failure from empty; fix it as part of Stage 2

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, 2026-09-23, on a defect surfaced while verifying
  the home-screen stage brief.
- **Reasoning:** stated in the answer — the value is diagnostic. The maintainer explicitly accepts
  that upstream's wording is understandable in practice, and fixes it anyway for what it costs
  future debugging.
- **Alternatives rejected:** leaving it, on the grounds that the realm is unlikely to be empty in
  practice — considered by the maintainer in the same breath and rejected.
- **Related:** MC-053 (Stage 2 rebuilds this block, so the two land together).

> "Failed to load" fetch text issue is noted - I can see why upstream dev chose that wording, as
> realm is unlikely to be literally empty, but I think its something that worths to fix as it
> helps diagnosis to future problems too.

**What the code does today.** `src/lib/UI/MainMenu.svelte` renders
`{#await getRisuHub(...) then charas}{#if charas.length > 0}` ... `{:else}` "Failed to load
{language.hub}...". There are four real states and three renderings: a fetch in flight renders
**nothing at all** (the `{#await}` has no pending branch), a failure and a successful-but-empty
response both render "Failed to load", and a populated response renders cards.

**This cannot be fixed in the component alone.** `getRisuHub` in `src/ts/characterCards.ts`
catches every error and returns `[]`, so the distinction is destroyed inside that function before
any caller sees it. It also returns `jso.cards` directly, which is `undefined` when a 200 response
is an object without a `cards` key — and `MainMenu.svelte` then calls `.length` on it with no
`{:catch}` branch anywhere in the block. Fixing the wording therefore means changing
`getRisuHub`'s contract, and `src/lib/UI/Realm/RealmMain.svelte` is a **second consumer** with its
own `getHub()` call sites and its own empty-state handling, so it moves too.

**Related defect in the same function, not separately decided:** the `fetch` has no timeout or
`AbortController`, so an unreachable realm leaves the section blank indefinitely — which is the
same rendering as "in flight". Whatever shape the Stage 2 plan gate chooses should account for it
rather than leaving a fourth indistinguishable state behind.

---

### MC-057 — The realm widget must render a visible pending state: a spinner and "loading..."

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, 2026-09-23, as a requirement for the Stage 2
  widget.
- **Reasoning:** stated in the answer — without it the user cannot distinguish a fetch in progress
  from a failure.
- **Alternatives rejected:** none offered; this was volunteered, not chosen from options.
- **Related:** MC-053 (the widget this applies to), MC-056 (the other three states).

> note for when we build widget: Fetch in flight should have something like a loading spinner and
> the word 'loading...'. as currently user can't tell if its fetching, or something else went
> wrong.

**This completes the four-state set opened by `MC-056`.** The in-flight state is the worst of the
three that the current code collapses: `{#await getRisuHub(...) then charas}` has no pending
branch, so a fetch in progress renders **nothing at all** — indistinguishable from a failure, from
an empty result, and from a slow network, with no timeout to bound it.

**No new `src/lang` key is required.** `language.loading` already exists in `src/lang/en.ts` with
the value `"Loading"`, and the sibling branch in `MainMenu.svelte` already uses the trailing-
ellipsis convention (`Failed to load {language.hub}...`), so `{language.loading}...` matches the
file's own style. Reusing it avoids adding a key that would then need translating into six locales
for a state the existing vocabulary already covers — an ordinary scope argument, not a
prohibition. **[corrected 2026-09-23]** This passage previously read "`src/lang/*` is the
maintainer's own territory (see `MC-015` …)". That overstated the rule, and the citation did not
support it — `MC-015` is about UI rendering in English regardless of the selected locale and says
nothing about who may edit those files. See `MC-058`. `animate-spin` is already used elsewhere in `src/lib`, so the
spinner needs no new dependency or component either.

**Two constraints the Stage 2 plan gate should carry:**

- The spinner must not itself cause the layout shift `MC-053` exists to remove. It belongs inside
  the card's already-committed height, not above or before it.
- A purely visual spinner is invisible to a screen reader. The pending state needs an accessible
  announcement (`role="status"` or an `aria-live` region) — the same accessibility standard the
  stage brief sets for the Stage 3 disclosure, which must work by tap and by keyboard rather than
  by hover.

---

### MC-058 — "The maintainer reviews Korean and English" is a rule about not reverting, not a ban on editing `src/lang`

- **Tag:** corrected
- **Date:** 2026-09-23
- **Sweep ref:** none (a direct maintainer correction)
- **Source:** stated by the maintainer directly, 2026-09-23, on noticing the claim had spread.
- **Corrects:** a passage in `Agents/README.md` and a passage in `MC-057`; see below.
- **Related:** MC-015, MC-018, MC-052.

> can you check if any of the documentation(memory, maintainer decision, reports, etc) instructs
> to never touch the korean locale file in src/lang? I merely said "I can also review korean and
> english TL) but I think that might have propagated wrongly.

**What was actually said** is that the maintainer *can review* Korean and English translations —
an offer of review capacity. What it does **not** mean is that `src/lang/ko.ts` is off limits to
agents. The `translator` agent maintains all six non-English locales, Korean included; the real
rule is the narrower one already stated correctly in `AGENTS.md` and `.claude/agents/translator.md`:
**never revert, "normalise" or reword the maintainer's own edits**, and expect diffs there that no
brief mentioned.

**Where it had spread.** Both instances were written by the Orchestrator, not by a subagent:

- `Agents/README.md` carried "Only user-facing `src/lang/*` strings are localised (Korean and
  English), and the maintainer edits those directly". The original constraint attached "Korean and
  English" to *which ones the maintainer edits*; the paraphrase moved it onto *which ones are
  localised*, which is false — there are seven locales. Corrected.
- `MC-057` asserted "`src/lang/*` is the maintainer's own territory" and cited `MC-015` for it.
  `MC-015` is about UI text rendering in English regardless of the selected locale and supports no
  such claim. Corrected, and the citation removed.

**The agent profiles were never wrong.** `.claude/agents/translator.md` lists `ko` among the
locales it translates and scopes the rule correctly to reverting; `AGENTS.md`'s routing entry says
"It never reverts the maintainer's own edits in those files." The drift was confined to the
campaign documentation.

**This is the third recorded instance of the same failure** — see `MC-052` (a maintainer's
comparison to other forks became a claim about this fork) and `MC-026` (a referent slipped between
this fork's maintainer and upstream's developer). In each case a true statement was widened by one
step and the widening was never marked. When restating something the maintainer said, keep the
scope they gave it: an offer to review is not a restriction on editing.

---

### MC-059 — The realm announcement banner moves below the Related Links grid

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, 2026-09-23, answering the one design question
  Stage 2 could not settle on its own.
- **Reasoning:** implicit in the option chosen, and recorded here as the argument that was put to
  them: the banner is arbitrary-height content, so it cannot sit inside a card whose whole purpose
  is a committed height; placing it last means it renders nothing in the common case (the string
  is empty), and when it does arrive late there is nothing below it to push.
- **Alternatives rejected:** three were offered. (a) Inside the realm card as a clamped, scrolling
  region — rejected: clips long announcements and competes with the preview list for the card's
  space. (b) Above the grid as today — rejected: it still arrives async above everything and still
  shifts the grid, which is the Change 1 behaviour the stage exists to remove. (c) Realm screen
  only — rejected: this was the option that quietly reduces the reach of what the maintainer had
  called upstream's live announcement channel.
- **Related:** MC-053 (the card this banner cannot live inside), MC-056, MC-057.

**Consequence for Stage 2.** `MainMenu.svelte`'s `{@html sanitizeHubHtml(hubAdditionalHTML)}` sink
moves out of the realm block and becomes a sibling after the Related Links grid. Stage 1's
security properties must survive the move intact: the sanitizer call, the delegated
`handleHubHtmlClick` wrapper, and the `a11y` ignore comments travel together, and
`src/lib/UI/MainMenu.hubHtmlSink.svelte.test.ts` is the guard that proves it — it fails if the
sink is disconnected, which is exactly the risk a move introduces.

**One mechanism this move must not break, and today relies on by accident.**
`hubAdditionalHTML` is a plain module binding in a `.ts` file, not a rune. `MainMenu` reads a
fresh value today only because that read sits *inside* the `{#await … then}` body, which Svelte
creates after the promise resolves. Moved outside that block, the read becomes an ordinary
template expression whose only dependency is non-reactive, and it will render the value as of
mount — empty on first load, and never updated. This is the same defect `RealmMain.svelte`
already has. The move therefore requires the banner's value to become reactive state driven by
the same fetch, not merely a relocated `{@html}`.

---

### MC-060 — An offline device short-circuits the realm fetch instead of timing out

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, 2026-09-23, unprompted, while Stage 2's data layer
  was being built.
- **Reasoning:** stated in the answer — the realm cannot work without the internet, so spending the
  timeout to discover that is wasted, and repeated retries against a known-offline device are worse
  than wasted.
- **Alternatives rejected:** none offered; this was volunteered, not chosen from options.
- **Related:** MC-056 (the state set this extends), MC-057 (the pending state it replaces when
  offline), MC-053.

> I think there should be a early return in case of when the device is offline. realm won't work
> without the internet. and I think realm button could disable itself and turn grayed out early
> with 'device is offline' message if device is not connected to internet instead of wasting time
> trying again multiple times.

**This makes it five states, not four.** `MC-056` opened the set with failed and empty, `MC-057`
added pending; offline is the fifth, and it is reached before any request is issued rather than
after one fails.

**One asymmetry the implementation must respect, and it happens to favour this decision.**
`navigator.onLine === false` is reliable: it means there is definitely no network. `=== true` is
not: it means the device is attached to *a* network, not that the internet or the realm host is
reachable. So the check is sound as an early return and unsound as a precondition — `false`
short-circuits, `true` must fall through to the ordinary fetch, timeout and failure handling with
nothing skipped. The maintainer's phrasing ("early return in case of when the device is offline")
is already on the reliable side of that line; recorded here so a later change does not "simplify"
it into a reachability test.

**The maintainer drew the boundary themselves, unprompted, in the same exchange**, which settles it
rather than leaving it as an implementation inference:

> the goal of offline check is for when it is certain that device is offline. I think net
> reachability case should be covered by 'failed' state. not offline state.

So: **offline is a certainty state, not a diagnosis.** Only `navigator.onLine === false` reaches it.
A device attached to a network that cannot reach the realm host — captive portal, DNS failure, host
down, firewall — is a `failed` or `timeout`, arrived at through the ordinary request path. Nothing
in this stage probes reachability, and nothing should be added that does.

**Two consequences the maintainer did not state, decided at implementation.** The card must leave
the offline state by itself when connectivity returns, via an `online` listener removed on
teardown, or the user is stranded until they find the retry control. And the greyed-out retry
control uses `aria-disabled` rather than the `disabled` attribute, so it stays in the tab order and
a keyboard or screen-reader user can reach it and hear why it does nothing — the same
accessibility standard `MC-057` sets for the pending state and the stage brief sets for Stage 3.

---

### MC-061 — The realm card has no separate browse button: the card body is the browse target

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** a Figma prototype the maintainer made — file `Realm Button design`, key
  `RNE62KHJJwu1lz0pdn3SGu`, frame `3:3` ("Android Compact - 1", 412×917) — plus four notes written
  on the canvas and two answers given when the prototype was read back to them. The maintainer
  flagged it as their first time using Figma; the geometry is nonetheless unambiguous and is what
  this entry records.
- **Reasoning:** stated in the notes themselves, quoted below.
- **Alternatives rejected:** a separate "Browse RisuRealm" button in the card header, which is what
  Stage 2 had already built — rejected explicitly ("remove the separate button entirely").
- **Related:** MC-053 (the card this refines), MC-057, MC-060.

**The prototype's geometry.** Four 91×91 placeholder squares in a 2×2 block, and the realm card at
133×191 beside them spanning both rows. Inside the card: a title, a description line, a frame named
"Scrollable entries", and a semi-transparent compass icon bleeding off the bottom-right.

**The canvas notes, verbatim:**

> 1. 'Browse risurealm' button overshoots the right edge
> 2. New button would be in brightest color of current colorset
> 3. Clicking each entry would take user directly to each entry. while clicking outside of the
>    scrollable zone would act same as the original "Browse Risurealm" Button.

**Two ambiguities were put back to the maintainer and answered.**

*The 91×91 squares are placeholders*, not a request to resize the four Related Links cards. Those
cards, and the grid, are unchanged by this decision. Only the realm card is new.

*Note 1 is a bug report about existing behaviour, not a layout instruction.* In their words:
"overshooting is more like a bug report of what is already there. goal is to remove the separate
button entirely and doing what note 3 says."

**Three further clarifications, given unprompted:**

> description and lucide icon is to match the design of how other buttons(emails, discord, etc)
> looks. so copying hovering animation too would be a good idea.

> hiderealm would preferrably hide this new one widget entirely.

> description should be a description for what this button does. like 'browse more characters
> using risurealm'.

**What this means for the implementation, including one reversal.** The card carries no separate
browse button; a click anywhere outside the scrollable entries opens RisuRealm, and each entry
opens that character. Because the whole card is now clickable, the card-level hover lift is honest
and is restored — an earlier instruction had moved it onto the child buttons precisely because a
non-clickable card should not imply otherwise, and that reasoning no longer applies.

**The card stays a `<div>` regardless.** The rows inside it are buttons, and interactive children
inside a `<button>` are invalid and break keyboard navigation — which would silently disable
`realmDirectOpen`, a persisted setting shipping help text in seven locales that names this exact
behaviour. A delegated click handler on the card gives the mouse behaviour; the title is a
focusable control carrying `hubBrowseMore` as its accessible name, so the keyboard path survives
the loss of the visible button.

**Two constraints the design cannot have anticipated, decided at implementation and flagged.**
"Brightest color of current colorset" maps to the user-customisable `--risu-theme-primary-*` scale
rather than the mock's literal blue. On that background the link cards' `textcolor2` description
token lands near 1.3:1 and is effectively unreadable, so the secondary line reproduces the
*relationship* with reduced-opacity `textcolor` instead of copying the token. And "hide this new
one widget entirely" was read as covering the announcement banner as well as the card, because the
banner is realm-server content and sat inside the `hideRealm` guard before Stage 2 moved it. That
was flagged as an interpretation rather than the maintainer's words, put back to them, and
**confirmed**: "I approve that 'hiderealm' should hide the banner too."

---

### MC-062 — The realm announcement must be visibly labelled as coming from RisuRealm

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly after running the Stage 2 build and looking at the
  home screen.
- **Reasoning:** stated in the answer — an unlabelled announcement can be misread.
- **Related:** MC-059 (which moved this banner below the grid), MC-061, MC-053.

> we should do something about banner's decoration as it does not have any decoration at all. main
> menu currently looks like this, and "we are looking for feedback" just left there with no labels
> or titles such as "announcement from risurealm" can be misreading.

**The misreading is a provenance problem, not only a styling one.** `hubAdditionalHTML` is HTML
supplied by **upstream's** realm server and rendered on this app's own home screen. Unlabelled, a
message like "We are looking for feedback!" reads as first-party — as though RisuAI were asking.
The fix is a container in the cards' visual language plus a heading naming the source, rendered
only when the announcement is non-empty, so an empty labelled box never appears.

The container is **not** clickable and takes no hover lift: only the links inside it are
interactive, through the delegated handler Stage 1 established. Nothing about the sanitization
changes.

**This is also the first time the maintainer has run the Stage 2 build**, and the screenshot
confirmed `MC-061`'s note 1 literally — the "Browse RisuRealm" button overflowed the card's right
edge, in Korean, exactly as the canvas note described. That button is removed by the same pass.

---

### MC-063 — In `cn.ts` the product name is Latin "Risuai", not the 叡苏 transliteration

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, answering a question raised by a locale survey.
- **Reasoning:** stated in the answer — RisuAI is a proper noun.
- **Alternatives rejected:** standardising on 叡苏, which had the larger share of existing usage
  (roughly 14 occurrences against 3).
- **Related:** MC-058 (translations are editable, not off limits), MC-061.

> As I said up above: RisuAI is proper noun, so I think Latin Risuai seems more fitting in cn.

**What prompted it.** `src/lang/cn.ts` was internally split: the transliteration 叡苏 in about
fourteen places and the Latin form in about three — including the plugin security warnings, which
are among the highest-stakes strings in the file. The split was an accident rather than a
convention, so a canonical form had to be chosen before ~98 new keys were added on top of it.

**This is a canonical-form decision, so it applies to existing strings too**, which makes it a
deliberate, authorised exception to the standing rule against modifying existing translations. The
exception covers **the product name only** — not wording, punctuation or register in those strings.

**The `welcome` gloss stays.** That string reads "Risu（叡苏）", glossing the transliteration in
parentheses. Dropping a gloss from a welcome message is a different kind of edit from harmonising a
label, so it was referred back rather than decided by an agent, and the maintainer kept it: *"gloss
can stay there."* A one-time introduction of the name survives fine alongside Latin being canonical
everywhere else.

---

### MC-064 — `cn.ts` uses 人设 for the persona concept, not 用户

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, in the same exchange as `MC-063`.
- **Reasoning:** stated in the answer — the community standard is the more sensible choice.
- **Alternatives rejected:** leaving the existing 用户-based wording, which was internally
  consistent and had been recorded as "not a defect" before this decision.
- **Related:** MC-063 (the other authorised exception in the same file), MC-058.

> following community standard in terms of persona seems more sensible.

`src/lang/cn.ts` rendered the persona concept — the profile representing the user in a roleplay —
with 用户 wording across roughly fourteen keys, where `zh-Hant.ts` uses 人設. Internally consistent,
but generic enough that a user would not connect "用户信息" to "the character profile I use to
represent myself".

**Like `MC-063`, this is an authorised exception to the rule against modifying existing
translations, and it is scoped to the persona concept only** — not the surrounding wording,
punctuation or register.

**It is a judgement per key, not a search and replace.** `zh-Hant.ts` is the reference because it
draws the line: 人設 for `persona`, `largePersonaPortrait`, `includePersonaName`, `bindPersona` and
the bind/unbind messages, but 使用者設定 for `exportPersona`/`importPersona` and 使用者備註 for
`personaNote`, where the string really does mean user settings. `personality` is the character's
personality and is untouched at both of its keys.

---

### MC-065 — The GitHub card becomes the Source & Issues disclosure; Communities gets only the invite fix

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, answering the two questions a Stage 3 evidence
  packet could not resolve from source.
- **Reasoning:** for the second half, stated in the answer — the fork has no Discord server of its
  own.
- **Alternatives rejected:** a separate sixth card beside the existing GitHub one (would put two
  GitHub-ish cards side by side and grow the grid the realm card was just fitted into); folding
  Discord into the same disclosure (would bury the Discord link a level deeper). For Communities:
  giving that page the same four destinations, and leaving it untouched entirely.
- **Related:** MC-054 (the invite standardisation this executes), MC-053, MC-061.

**On the home screen, the existing GitHub card *becomes* the disclosure** rather than gaining a
neighbour. Same position in the Related Links grid; activating it reveals four destinations — this
fork's repository and issues, upstream's repository and issues — instead of navigating straight to
upstream.

**On the Communities settings page, only the stale Discord invite is corrected** — `JzP8tB9ZK8`
becomes `Exy3NrqkGm`, per `MC-054`. That page's GitHub button keeps pointing at upstream and gains
no fork links.

> just fix the invite - fork does not have discord server.

**Two consequences worth carrying into implementation.**

The `RelatedLink` type in `MainMenu.svelte` assumes every entry is a direct-navigate URL —
`onclick={() => openURL(relatedLink.href)}`. One entry now reveals a sub-list instead, so that
assumption breaks and the `{#each}` render must handle both shapes. It looks like a one-line change
and is not.

**There is no accessible disclosure pattern in this codebase to reuse.** A repo-wide search for
`aria-expanded`, `aria-haspopup` and `aria-controls` across `src/lib` returns **zero** matches.
`Accordion.svelte` is a real `<button>`, so Tab and Enter work by native HTML semantics, but it
announces no expand/collapse state; `LoadoutModal.svelte` has no `role="dialog"`, no focus trap and
no Escape handler at all. No accessible-primitives dependency exists — no `bits-ui`, `radix`,
`melt`, `headlessui` or `floating-ui`. So the maintainer's standing constraint for this stage —
*"It must work by tap and by keyboard. Hover may be an enhancement, never the only path"* — has to
be met by building the pattern, not composing one. The `Accordion` is the component most likely to
be copied forward precisely because it is the only reveal-on-click control here, and copying it
would carry its accessibility gap into the one component whose purpose is accessibility.

---

### MC-066 — The Email card becomes a disclosure carrying the maintainer's own address

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** stated by the maintainer directly, unprompted, after seeing the Source & Issues
  disclosure working.
- **Reasoning:** implicit in the request — the same fork-versus-upstream split the GitHub card
  makes, applied to contact. Someone with a bug in *this* build should be able to reach the person
  who maintains it rather than upstream's support.
- **Alternatives rejected:** none offered; volunteered.
- **Related:** MC-065 (the disclosure this reuses), MC-054 (the upstream marker).

> currently E-mail only points to upstream. I think it can have fork submenu too, which should
> point to my email(yoonch1022@naver.com)

The Email card gains two destinations: `mailto:yoonch1022@naver.com` first, then
`mailto:support@risuai.net` carrying the grey upstream marker.

**This entry exists because its absence was caught at a gate.** The implementation shipped the
address while `MC-065` covered only the GitHub card and the plan still described Email as an
untouched plain link. A reviewer reading the records — correctly — flagged it as an implementer
publishing a personal address outside approved scope, and recommended getting an explicit yes
before committing. The decision was real; the record was missing.

The failure was the Orchestrator's: the maintainer gave the decision in conversation and it was
implemented without being written down. **An authorised change that is not recorded is
indistinguishable from drift**, and this campaign already tracks three cases of a claim widening
because nobody could check it against a record. Recording a decision is not bookkeeping after the
fact; it is what makes the difference between the two visible later.

**Worth noting because it is effectively one-way:** a personal address in shipped UI lands in git
history and in every built artifact. That is the maintainer's call to make about their own
application, and they made it — but it is the kind of change that should never reach a commit on an
implementer's initiative.

---

### MC-067 — A bare Space or Enter hotkey steps aside when a control has keyboard focus

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** chosen by the maintainer from three options, after their own hand test showed Space
  does not open the Source & Issues disclosure.
- **Reasoning:** the Orchestrator's recommendation, accepted as offered. It fixes Space for every
  native control in the app while keeping upstream's "Space jumps to the chat input" everywhere a
  control does not hold keyboard focus.
- **Alternatives rejected:** (B) only swallowing Space when `.text-input-area` exists, which fixes
  the home screen but leaves every keyboard-focused button on the chat screen unreachable by Space;
  (C) leaving upstream behaviour alone, which makes the disclosure Enter-only like every other
  button in the app.
- **Related:** MC-065 (the disclosure whose live check exposed this).

> let's go with option A.

**The mechanism being changed.** `src/ts/defaulthotkeys.ts` binds bare Space to `focusInput`
(upstream `f5f05bdf`, 2025-03-20). The document-level keydown handler in `src/ts/hotkey.ts`
matches it whenever focus is outside an input, textarea or contenteditable, counts it as run even
when the chat input does not exist, and then calls `preventDefault()` on the keydown. That cancels
native activation, so **Space activated no `<button>`, `<select>` or `<summary>` anywhere in the
application.** This predates the fork.

**The keyboard-focus condition is what makes this safe, not a refinement.** Chrome focuses a
button when it is clicked with the mouse. Yielding whenever *any* control is focused would mean a
user who clicks reroll and then presses Space to reach the chat input rerolls again instead. The
yield applies only when the control matches `:focus-visible`, which a mouse click on a button does
not produce.

**Scope.** Only the hotkey-matching loop yields, and only for a bare Space or Enter (no Ctrl, Alt,
Shift or Meta). The rest of the handler (the Ctrl+digit presets, Escape, and Enter confirming an
open alert) is unchanged. No stored hotkey data changes: a user's saved bindings keep working,
and the change is to *when* a bare binding fires, not to what is saved.

**Native controls only, and the ARIA-role list was dropped at the gate.** The implementation
brief also yielded for elements with `role="button"`, `checkbox`, `tab` and similar. That was
the Orchestrator's addition, not part of this decision, and the gate found it regressed the
app's own code. Native elements get Space and Enter activation from the browser. ARIA-role
elements only get it if the author wired it up, and about 30 `role="button"` elements here
have no key handler, or handle Enter only (the `SideChatList.svelte` icons) or have an empty
one (the export icon in `ChatList.svelte`). For those, yielding would turn "Space jumps to
the chat input" into "Space does nothing". The yield is therefore limited to `<button>`,
`<select>` and `<summary>` for Space, plus `<a href>` for Enter.

**Maintainer hand test, all three passed:** Space opens the disclosure cards and the ring
follows the card's rounded edge; after clicking reroll, Space jumps to the chat input
instead of rerolling again; Space on the Tab-focused hamburger button beside the chat input
opens its menu.

**How this was found matters.** The automated live check first called Space a harness limitation,
on the strength of a "control" button that did not respond either. The control had been injected
into the same page, so the same document-level hotkey swallowed its Space too. The maintainer's hand
test is what caught it. A control has to be isolated from the thing under test.

---

### MC-068 — The durable-draft restore marker: a bar above the editor, immediate revert, draft age shown

- **Tag:** decision
- **Date:** 2026-09-23
- **Sweep ref:** none (stated directly this session)
- **Source:** the Orchestrator proposed a concrete design for the affordance `MC-042` requires; the
  maintainer chose the recommended option on all three questions.
- **Reasoning:** `MC-042` fixed *that* a restored draft is visible and one-click revertible, not how.
  Report 20 section 5.4's failure case is text typed long ago that the user has forgotten, so the
  marker has to be noticeable and say how old the draft is.
- **Alternatives rejected:** a small "Restored" pill in the message's button row (less noticeable,
  which defeats the purpose); a revert followed by a five-second Undo (more machinery and tests to
  guard against a misclick on text that was never saved as a message).
- **Related:** MC-042 (the marker and revert exist), MC-055 (the stage's sequencing), MC-067 (Space
  and Enter reach the Revert button).

**What was approved:**
- **Placement:** a thin bar directly above the text box, shown only when an editor was seeded from a
  stored draft. It stays up until the editor is saved or left, including while the user types,
  because the text is still based on the draft.
- **Surfaces:** all three: `textBox()`'s original-text editor, `textBox()`'s translation editor,
  and `cardboard`'s own raw textarea for the original text. (`cardboard` has no translation-edit
  button; its `textBox()` shows the translation editor only if the theme is switched while that
  editor is open, and the marker covers that case too.)
- **Look:** a lucide `History` icon, the text "Unsaved edit restored" and the draft's age, and a
  `RotateCcw` Revert button. Default themes use theme tokens. `cardboard` and `mobilechat` use
  fixed greys, because the card and the chat bubble they render in are always light (Gate 2 round 1
  found `mobilechat` at about 2.6:1 with theme tokens). A `customHTML` layout's `<RISUTEXTBOX>`
  sits on the user's own CSS, which the marker cannot know, so it keeps theme tokens. About 150ms
  fade-in, none under `prefers-reduced-motion`.
  Contrast is measured in the browser against 4.5:1.
- **Accessibility:** the bar is a live status region; Revert is a native `<button>`.
- **Revert:** immediate, one click. It replaces the buffer with the saved message text (for a `tr:`
  record, the cached translation `loadTranslationForEdit` seeded), deletes the stored record, and
  hides the bar. The editor stays open.
- **Draft age:** the record gains a last-edited timestamp, formatted with `Intl.RelativeTimeFormat`
  in the UI language, so the age needs no new locale strings.
- **Strings:** the marker text and the Revert label are new keys in all seven locales.

**Two rules the design surfaced.** They are rules, not mechanisms; how the code meets them is the
code's business.

1. **Nothing unchanged is ever offered as a restore.** Opening and leaving an editor untouched must
   not show "Unsaved edit restored" on the next open. "Unchanged" means equal to what the editor
   would otherwise open with: the message text for the original-text editor, and the **cached
   translation** for the translation editor. It is not the record's `baseData`, which for a `tr:`
   record is the source text and can never equal a translation. (`test-warrior` caught this while
   writing the red tests; the Orchestrator's brief had said "base text" for both.) For the
   translation editor the case is reachable, but only when the cached translation comes to *equal*
   the stored draft text. Any write to the translation cache can cause that: for example a
   retranslate that happens to produce that exact text, a partial-edit save (on this message after
   its editor was unmounted, or on another message sharing the cache key), or an import of the LLM
   cache. (A translation-editor save on a message sharing the key deletes the shared record itself.)
2. **The age is the last *edit*, not the last open.** Opening a restored draft, or reverting it,
   must not refresh its age or re-register it.

How Gate 2 converged on a mechanism for these rules, and why the first three attempts failed, is
recorded in Report 20 section 11, not here.

---

### MC-069 — Upstream issues found in passing are recorded in the Roadmap as chores

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, after the durable-drafts live check turned up readability problems
  in the `mobilechat` and `cardboard` themes that predate the fork.
- **Reasoning:** the maintainer's own words below. Upstream defects are frequent, so noticing one is
  routine, and a finding that lives only in a conversation is lost at the next compaction.
- **Related:** MC-011 (the fork has never shipped; upstream is the build with users).

> upstream issues are common in this project - it's GPL 3 community project with tiny userbase
> after all. I think we should put them somewhere in the plan.

**How to apply.** When work runs into an upstream defect outside its scope, record it under the
Roadmap's "Upstream issues found in passing" chores. Say how it was found (live check, review,
reasoning) and how far the cause was traced. Don't fix it inside an unrelated stage, and don't
leave it only in a report's follow-up list or a chat reply. The first three entries are CHORE-19
to CHORE-21.

---

### MC-070 — Self-hosted web builds get the "Leave site?" guard too

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering the question CHORE-22 raised: the accidental-close
  `beforeunload` guard is registered only when `isWeb`, which is true only on the `risuai.xyz`
  host, so self-hosted builds have no accidental-close protection.
- **Reasoning:** the maintainer's own words below.
- **Related:** CHORE-22, MC-069 (the upstream-chore policy that surfaced it), MC-011.

> run chore 22 - I think Leave site guard would be also nice to have on self host.

**How to apply.** A self-hosted web build (the node server) prompts before an accidental tab
close, as `risuai.xyz` does. The guard's existing exemptions still hold there: app-initiated
reloads and the `mailto:`/`tel:` handoff never prompt.

---

### MC-071 — Reported sidebar problems: order not persisting, flaky gestures, no edge scroll, folder drags

- **Tag:** fact
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, relaying community reports against upstream builds (per `MC-011`,
  user-reported symptoms are observations of upstream, not of this fork).
- **Reasoning:** input for the sidebar rework (Roadmap Phase 2 item 3, "Sidebar: a rework"). The
  maintainer deferred that rework behind the known data-loss fixes (the composer stage, then
  `updateInlayScreen`).
- **Related:** MC-011, MC-069.

> 1. Changed character order sometimes does not persist
> 2. Inconsistent Behavior - long tap, drag, etc sometimes does not work
> 3. it is hard to move the character beyond the visible scope, as dragging the character to the
>    edge of the viewport sometimes does not correctly scroll the sidebar
> 4. Dragging the character in and out of folder is inconsistent

**How to apply.** The sidebar investigation checks each symptom against source. Symptom 1 is a
possible persistence defect, not only a UX one: if a reorder can fail to reach the save file, it
belongs with the data-loss work and is triaged first. Symptoms are reports, not reproductions, so
none is treated as confirmed until reproduced or traced.

---

### MC-072 — Composer drafts: silent per-chat restore, late files go to their own chat, only the open composer holds the multi-tab reload

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the Orchestrator asked three questions before writing the composer-stage plan
  (`Agents/Reports/22-composer-drafts-plan.md`); the maintainer chose the recommended option on all
  three.
- **Reasoning:** the composer is always on screen, so restored text is visible without a marker; a
  file the user picked is not silently dropped; and a background draft holding the reload would
  need a cap and a prune rule for little gain, since composer text lives only in memory and an
  ordinary reload already drops it.
- **Alternatives rejected:** showing the `MC-068` restore bar on the composer; discarding a file
  that arrives after a switch; letting every stored composer draft defer the multi-tab reload.
- **Related:** MC-043 (the composer stage and its shape), MC-050, MC-068.

**What was decided:**
1. **Silent restore.** Returning to a chat shows the unsent text, staged files and translation
   left there, with no restore bar.
2. **Late files go to the chat they were started in.** A file picked, or an image pasted, after a
   chat switch lands in the draft of the chat that was open when the pick or paste began, never in
   the chat now on screen.
3. **Only the open composer holds the multi-tab reload.** Unsent text stored for chats not on
   screen does not defer it. This settles `MC-050` for composer drafts only; for message-editor
   records it stays open.

---

### MC-073 — Investigate reworking the chat writer rather than locking switches during a send

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering whether to block chat and character switching during a
  send after Gate 1 round 2 of the composer-drafts plan (`Agents/Reports/22-composer-drafts-plan.md`)
  found that writes in the send and trigger path follow whatever is selected when they land, so a
  switch mid-send can overwrite another chat's history, its variables, or a whole character.
- **Reasoning:** the maintainer's own words below. A lock treats the symptom; the writer is behind
  several persistence issues; the fork has not shipped (`MC-011`), so a structural fix costs least
  now.
- **Alternatives rejected (for now):** blocking switches for the whole send; blocking them only
  until generation starts. Neither is ruled out for good. The investigation decides whether a
  rework is feasible and worth it.
- **Related:** MC-011, MC-043, MC-072, CHORE-25.

> I think blocking writing as whole during generation could feel like a band-aid fix to end users.
> since writer is a source of quite few persistency issue, I think we should investigate if we can
> rework on the writer. currently this fork hasn't shipped. thus if writer rework fixes many core
> problem, now is the best time to fix it.

**Also decided:** if a switch is ever refused, it is refused silently, as clicking a character
already is during generation. No toast, no new strings.

**How to apply.** Before any lock is designed, investigate the writer: every write in the send,
generation and trigger path that goes to the live selection instead of the chat or character it
belongs to. Size a rework in which writes are bound to their origin. The composer stage's
per-chat drafts (Report 22, I2) do not depend on this and are not blocked by it; its send-window
invariants wait for the writer decision.

---

### MC-074 — Multiuser is to be removed; it is not part of the writer rework

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering whether the writer rework (`MC-073`) should bind multiuser
  sync's writes to their origin. Those writes deliberately go to the live selection
  (`src/ts/sync/multiuser.ts`, for save-tracking performance).
- **Reasoning:** the maintainer's own words below.
- **Related:** MC-011, MC-073.

> I think we can drop the multiuser feature as whole. Multiuser is another remnant of this project
> originating from being upstream maintainer's toy project. multiuser session was explored, but
> then dropped because it was unstable and buggy.

**How to apply.** The writer rework leaves `multiuser.ts` out. Removing multiuser is its own
stage. Before anything is deleted, it gets an investigation of everything that depends on it:
- the UI entry points;
- `ConnectionOpenStore` reads (for example `sendMain`'s message `name` field);
- any plugin API surface;
- any saved field.

Upstream data that carries multiuser-related fields must still load (`MC-011`).

---

### MC-075 — The writer rework: `/` commands stay on the chat the send started from; a delete during a write asks first

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering the open questions from the writer investigation (ledger
  row 159).
- **Reasoning:** as stated below; the maintainer chose the behaviour, not the mechanism.
- **Related:** MC-073, MC-074, Report 22.

**What was decided:**
1. **`/` commands are bound to the send's origin** like every other write in the send, not
   resolved from the live selection each time. This supersedes Report 22 section 9's limitation.
2. **Deleting a chat, or its character, while something is writing into it asks first.** A short
   warning in the delete confirmation says something is writing into this chat and asks whether
   to continue. When nothing is writing into it, the delete confirmation is unchanged. If the
   origin chat is gone anyway when a write lands, the write is dropped silently.
3. **Home while a trigger runs** (`selectedCharID = -1`): not investigated now. It is tested when
   the rework actually reaches that path.

The maintainer's words for item 2:

> best approach would be inserting a little warning about "something is currently writing into
> this chat. do you really want to continue?" on deletion message if something is writing into it,
> if not, silent drop should be fine.

---

### MC-076 — The writer rework follows senior-advisor's staging; `updateInlayScreen` goes first

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the Orchestrator presented `senior-advisor`'s writer strategy (ledger row 161) and
  the HaejeokRisuai comparison (ledger row 160). The maintainer approved the strategy and moved
  `updateInlayScreen` ahead of it.
- **Reasoning:** the maintainer's own words below.
- **Supersedes:** the order "composer, then CHORE-25, then `updateInlayScreen`" (this session,
  before the writer investigation).
- **Related:** MC-073, MC-074, MC-075, CHORE-25, Report 22.

> looks good to me, I think small and independant updateInlayScreen should jump ahead though,
> since its another persistency issue.

**Order:**
1. `updateInlayScreen` (CD-4).
2. W0: every chat has a stable id; the origin resolver and in-flight-writer registry.
3. W1: triggers, Lua and CBS write to their own origin. This closes CHORE-25, which is not a stage
   of its own.
4. The composer stage (Report 22 rev 3), on W0's resolver.
5. W2 (generation, group turns, auto-continue, the delete warning, the Home check) and W3 (`/`
   commands).

**Approved strategy:** writes made for a unit of work (a send, a generation, a trigger run, a `/`
command) resolve their target by identity at write time. Plugin-facing "current" helpers stay
bound to the selection. Whole-object commit stays. No switch lock.

---

### MC-077 — Edited Image Generation Instructions are kept across an Inlay Screen toggle, and documented

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering a question raised by Gate 2 of the `updateInlayScreen` fix
  (CD-4; ledger row 163). The Image Generation Instructions box has two jobs. With Inlay Screen off
  it instructs the auxiliary model that writes the image prompt. With Inlay Screen on it goes into
  the main chat and must ask for `<ImgGen="...">` tags. Keeping edited text across a toggle can
  leave text written for one job doing the other.
- **Reasoning:** text stays in a visible box and is never silently wiped; the user rewrites it for
  the new job.
- **Alternatives rejected:** resetting that box on an Inlay Screen toggle only (it always works,
  but edits are lost, as in the bug); keeping it and showing a notice on toggle (a new string in
  seven locales).
- **Related:** MC-076.

**How to apply.** `updateInlayScreen` keeps user-authored text in every field across every mode
and Inlay Screen change. The wiki page for the Additional Character Screen says that the box has
two jobs and should be rewritten after toggling.

---

### MC-078 — A write whose target id has two holders is skipped with a warning, not guessed

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering the question `senior-advisor` raised after three Gate 1
  rejections of the W0 identity plan (Report 24; ledger rows 165 to 168). A plugin can leave two
  chats (or two characters) holding one id, for example by copying a chat and keeping its id.
  Nothing the app can observe tells which holder is the original.
- **Reasoning:** a skipped write can be seen and redone; a write that lands in the wrong chat is
  silent corruption.
- **Alternatives rejected:** writing to the first holder in array order, the rule boot uses to
  repair duplicates (a plugin's copy placed above the original would receive the writes).
- **Related:** MC-075 (a write whose origin chat is gone drops silently), MC-076.

**What was decided:** while an origin's `chaId` or chat id has more than one holder, writes for
it are skipped and a warning is logged, naming the plugin where known. It is not chosen between.
The writes resume on their own once the duplicate is gone. The plugin can remove it, or, for a
duplicate chat id, the next boot's repair does. Boot's repair rule is unchanged.

**Correction (2026-09-24, Gate 1 round 4 of W0):** a duplicate `chaId` does not last until boot.
The save file holds one block per `chaId`, so the next save keeps only one of the two
characters. This is upstream behaviour; see MC-079.

---

### MC-079 — A duplicate `chaId` losing a character at save gets its own fix, straight after W0

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering a finding from Gate 1 round 4 of the W0 plan (Report 24;
  ledger row 170). When two characters share one `chaId`, the next save keeps only one of them,
  and a plugin's copy can overwrite the original, with no warning. Upstream has the same code.
- **Reasoning:** it keeps W0 out of the save code, and it still prevents the loss soon.
- **Alternatives rejected:** folding the save fix into W0 (a bigger stage whose review must also
  cover the save code); a warning only, recorded as a known upstream issue (nothing prevents the
  loss).
- **Related:** MC-078, CHORE-28.

**What was decided:** CHORE-28 runs straight after W0, as a small change to the save code with
its own review. While two characters share a `chaId`, that block is not rewritten, so the last
good save is kept, and the user sees a visible warning. W0 itself only logs a console warning.

---

### MC-080 — RisuAccount sync is to be dropped from this fork; migration is by `.bin` local backup

- **Tag:** decision
- **Date:** 2026-09-24
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, unprompted, during the W0 stage.
- **Reasoning:** the maintainer's own words below. Account sync is maintained entirely upstream
  (MC-012), almost unused (MC-002), and has been a blocker for asset optimisation and for faster,
  more aggressive local backup creation (MC-025).
- **Related:** MC-002, MC-011, MC-012, MC-025, MC-074 (multiuser removal, the same kind of
  stage).

> It is completely upstream maintained, and iirc it was a blocker that affected lots of asset
> optimization and future implementation of more aggressive and faster local backup creation.
> I think it would be a better call to drop risuaccount sync within this fork - future userbase
> migrating from upstream should still be able to back up their save and import them in this
> fork through .bin local backup instead of starting over.

**What was decided:** account sync (the account-backed storage backend) is removed from this
fork. A user migrating from upstream, including an account-sync user, keeps their data by
making a `.bin` local backup upstream and importing it here. That import path must keep working
(MC-011).

**Scope, decided 2026-09-25.** The maintainer chose the option recommended by
`senior-advisor` (ledger row 175): **remove all of RisuAccount, and keep Realm.**
- **Removed:** the hub sign-in and everything that uses its token. That covers account sync,
  account data save and load, account backup restore, account cold storage, Kei auto-backup
  (already unreachable from the UI), in-app edit and remove of the user's own Realm uploads, and
  the Kei image provider. Upstream data naming the Kei provider shows a clear unsupported-provider
  error.
- **Kept:** Realm browse, info, download, report and anonymous upload; Google Drive backup (its
  token exchange goes through the hub but needs no sign-in); and the self-hosted server's
  `/hub-proxy`.
- **Rejected:**
  - keeping the hub sign-in only for Realm ownership;
  - removing only the sync backend. None of the reference forks stopped there, and it keeps two
    code paths that re-create `db.account` from `localStorage`.

**Timing: deferred** by the maintainer ("decide later"). The removal cannot start before W0 is
committed, because it shares six files with W0.

**Timing, decided 2026-09-25**, after the multiuser removal was committed: "next work would be
RisuAccount removal." It is the next stage, before W1. This is the order `senior-advisor`
recommended.
- `senior-advisor` recommends: W0, CHORE-28, the multiuser removal (MC-074), the account
  removal, then W1, the composer stage, W2 and W3.
- **Acceptable alternative:** both removals after W1.
- **To avoid:** placing either removal after W2.
- The two removals stay separate stages.

---

### MC-081 — Account-sync-encrypted `.bin` backups are not supported; the user is told upfront

- **Tag:** decision
- **Date:** 2026-09-25
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering the RisuAccount removal investigation (ledger rows 173 and
  174). The investigation found three things:
  - Since upstream d0548267 (2026-06-11), a full `.bin` made by an account-sync user on the
    official site is encrypted, with a key served by `sv.risuai.xyz/cryptokey`.
  - A `curl` probe of that endpoint from this machine got HTTP 403.
  - A browser probe was denied by the permission classifier.

  The maintainer has no such backup to test with and asked that the endpoint not be probed.
- **Reasoning:** the maintainer's own words, below. The affected group is small. Account-sync
  users are few because RisuAccount's backup size limit leads the community to recommend
  self-hosting upstream, or a dedicated fork such as PocketRisu reached over LAN/VPN (this adds
  context to MC-002). Reading these files would depend on an upstream endpoint that this fork
  cannot verify or control (MC-012).
- **Alternatives rejected:**
  - keeping the anonymous `/cryptokey` decrypt path, as HaejeokRisuai did;
  - decrypting server-side, as PocketRisu-Kei does.
- **Related:** MC-011 (this narrows its `.bin` guarantee for this one case), MC-002, MC-012,
  MC-080.

> if bin created with risuaccount is encrypted, I think safetest move is just telling the user
> upfront that we can't read the encrypted bin due to various technical limitations and dropping
> backward compat just in this case.

**What was decided:**
- **One narrow exception to MC-011.** A `.bin` carrying the account encryption marker is not
  supported. Detection keys on an entry named `encryption.risudat` being present, whatever its
  content, not only on a well-formed `type: 'account'`. A marker that fails to parse today falls
  through and hands ciphertext to the decoder (ledger row 173, resumed gaps). The import tells the user
  upfront that it cannot be read, for technical reasons, and does not attempt it.
- **Every other upstream `.bin` stays supported**, including one from an account-sync user that
  is not encrypted.
- **"Upfront" means nothing is written before the refusal.** No assets, no cold storage, no
  database.

**The refusal message, decided 2026-09-25.** The message says the file cannot be read, then gives
one line each on the two things a user can do upstream instead:
- **A Partial Local Backup.** It is not encrypted and keeps every chat, including cold-storage
  bodies. It keeps the labelled images: character, group and persona profile images, the user
  icon, the background, and folder and preset images. It drops everything else, including
  emotion images, additional assets and VITS files. (Corrected 2026-09-25 by the Report 25
  fact-check. The option text the maintainer chose said "loses all images except profile
  pictures", which undercounted what it keeps. The decision is unchanged.)
- **Logging out of account sync first, then a full backup.** This keeps the `.png` assets but
  loses the cold-storage chat bodies.

The migration wiki page gives the complete route, which is both backups imported one after the
other. The page marks that route as read from the code and not tested: nobody here has an
account backup. Only official-site account users can hit the refusal, because upstream encrypts
only on `risuai.xyz` origins.

---

### MC-082 — A duplicate `chaId` that has never been saved: the first holder is written once, then frozen

- **Tag:** decision
- **Date:** 2026-09-25
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering a gap the CHORE-28 investigation found in MC-079. MC-079
  keeps "the last good save" of a duplicated `chaId`. When both holders were created since the
  last save, there is no last good save.
- **Reasoning:** writing nothing would lose both characters if the app closed before the user
  resolved the duplicate. Writing one keeps at least one of them.
- **Alternatives rejected:** writing no block for that `chaId` until the duplicate is gone.
- **Related:** MC-078, MC-079, CHORE-28.

**What was decided:** while two characters share a `chaId` that has no saved block yet, the save
writes the first holder in list order once, then treats that block like any other duplicate: it
is not rewritten until the duplicate is gone. The visible warning says only one of the two is
protected.

---

### MC-083 — Multiuser removal: delete the lang keys, keep `Message.name`, leave `§temp` alone

- **Tag:** decision
- **Date:** 2026-09-25
- **Sweep ref:** none (stated directly this session)
- **Source:** the maintainer, answering ledger row 185's questions from the multiuser removal
  investigation (MC-074).
- **Reasoning:** the maintainer's own words below.
- **Related:** MC-074, MC-011.

> Delete the keys, keep name, leave §temp, edit both docs

**What was decided:**
1. The 7 multiuser-only `src/lang` keys are deleted from all 7 language files (49 entries):
   `joinMultiUserRoom`, `connectionOpen`, `connectionOpenInfo`, `connectionHost`,
   `connectionGuest`, `createMultiuserRoom`, `otherUserRequesting`.
2. `Message.name` stays on the `Message` type (`database.svelte.ts`), so upstream chats that
   carry it round-trip unchanged.
3. Stray `§temp` characters in upstream saves are left alone: never stripped or migrated on
   load; `checkCharOrder`'s `§temp` exclusion stays. Context: upstream's multiuser join pushes a
   `§temp` copy of the host's character into `db.characters` and never removes it.
4. The removal stage edits `wiki/Playground.md` (its "Join MultiUser Room" row) and `AGENTS.md`'s
   `sync/` "Multi-user synchronization" directory-table row, since `src/ts/sync/` disappears
   entirely.

---

## Open questions

The three entries below are questions addressed to the maintainer that were still unresolved as of
their source's last update. They are grouped separately from Facts and Decisions for one reason:
nothing here is settled, and filing an open question next to a decided one risks a reader treating
it as decided by proximity alone.

### MC-049 — Whether the "Global Regex" setting (`db.globalscript`) not being read by the script engine is a bug or intended

- **Tag:** open
- **Date:** not recorded · on or before 2026-09-22 (`bbdbb07e`)
- **Sweep ref:** F27
- **Source:** `Agents/Roadmap.md`, "CHORE-09 — Scripting, regex and lorebook bugs found during the
  wiki rewrite (none lose data)," table row 8

> Settings → "Global Regex" (`db.globalscript`) is never read by the script engine; it is only an
> import/export staging list. The effective global list is the preset's (`db.presetRegex`).
> Possibly intended; confirm with the maintainer before calling it a bug.

---

### MC-050 — Whether a leftover draft should be allowed to defer the multi-tab auto-reload

- **Tag:** open
- **Date:** not recorded · on or before 2026-09-23 (`b82470a2`)
- **Sweep ref:** D17
- **Source:** `Agents/Reports/19-chat-list-window-plan.md`, "§3 Direction (senior-advisor
  escalation, 2026-09-22; the maintainer approved the order)"; also
  `Agents/Investigation-Ledger.md`, row 97
- **Related:** MC-041

> **Maintainer decisions:** the order was approved. The trade-off in durable drafts (a leftover
> draft could defer the multi-tab auto-reload) is to be decided when that plan is written.

The same open point, in the durable-drafts plan itself (which restates it as still needing a cap
and a prune rule, not as having resolved it):

> **Open maintainer decision:** a leftover draft could defer the multi-tab auto-reload until
> pruned. It needs a cap and a prune rule. The maintainer chose to decide this when the plan is
> written.

---

### MC-051 — Whether `streamingDisplayOptimizationMode` should default to `'off'` or `'balanced'`

- **Tag:** open
- **Date:** not recorded · on or before 2026-09-23 (`b82470a2`)
- **Sweep ref:** D18
- **Source:** `Agents/Reports/19-chat-list-window-plan.md`, "§3 A2, B, D, E (after the above)," "B,
  streaming"

> `'balanced'` already avoids the per-chunk remount by design. Whether the default should stay
> `'off'` is a product question for the maintainer, alongside any engineering fix.

---

## Decisions commonly mis-attributed to the maintainer

Two items in this campaign's own working material named the maintainer as the decision-maker for
something the maintainer did not, in fact, decide. Both mistakes were caught before this document
was written, not after. They are recorded here, stated plainly, because the same mistake is likely
to recur.

### Retiring the module draft-copy design

**What actually happened:** the module-editor draft-copy design (`MC-044`'s durability decision
belonged to it) was rejected twice at `opus-reviewer` plan gates, then formally retired after a
`senior-advisor` escalation — not by the maintainer choosing to abandon it.
`Agents/Phase2-Handoff.md` records this directly:

> Stage B was first planned as a **draft copy** of the edited module. That design was rejected at
> two `opus-reviewer` gates and retired after a `senior-advisor` escalation. Do not revive it as a
> performance fix.

**Unresolved discrepancy — the escalation has no ledger row.** `Agents/Roadmap.md` and
`Agents/Phase2-Handoff.md` both state the design was retired after a `senior-advisor` escalation.
`Agents/Investigation-Ledger.md` contains only two `senior-advisor` rows, and neither is this one:
row 71 is CHORE-17, row 97 is the chat-list window. The rows covering this work run gate (draft-copy
plan), gate round 2 (revision 2), then straight to the partition plan gate, with no escalation
between them. The ledger records every dispatch with its tier and cost, so either the escalation
happened and was never logged, or the "retired after a `senior-advisor` escalation" wording in both
documents is inaccurate. Verified by the Orchestrator, 2026-09-23; **not resolved** — recorded here
so it is not rediscovered. The two `opus-reviewer` rejections are themselves ledger-confirmed and
are not in doubt.

**Where the manifest's citation for this rule did not check out.** The manifest that seeded this
document said the "do not revive it as a performance fix" rule "belongs in Report 10's D2 status
header." It does not: that exact sentence appears only in `Agents/Phase2-Handoff.md`, quoted above.
`Agents/Reports/10-stage-b-module-draft-copy-plan.md` does not contain it. The rule itself is real
and is recorded correctly above; only its citation is corrected here.

**The maintainer's actual role was supplying context, not making this call.** That context —
real profile sizes, real asset-module sizes, real hardware, and the character-editor comparison —
is what `Agents/Phase2-Handoff.md` itself credits with settling the direction of this work more
than either review gate did:

> **Measure the premise before planning.** Three plan revisions for Stage B failed. The design was
> retired because its central premise — that the cost was a persistence problem rather than an
> effect-granularity problem — had never been tested; the revisions only patched the layers built
> on top of it. The maintainer's own context (profile sizes, asset modules, hardware, the
> character-editor comparison) settled more than either review gate did. **Ask the maintainer what
> real usage looks like** before sizing work.

That is real, and worth recording as credit. It is not authorship of the retirement decision
itself, and should not be written up as such.

### Deferring the alertStore mutex

The `alertStore` modal-hijack mutex was investigated, scoped, and deliberately not attempted (see
`Agents/Roadmap.md`, "The alertStore hijack: investigated 2026-09-21, scoped, and deliberately NOT
attempted"). No mention of "maintainer" or "project owner" occurs anywhere near that investigation's
text, its mechanism analysis, or its "shape of a real fix" section. This was an investigation-scoping
outcome — the plan gate that reviewed the mutex-only design rejected it, and the deferral followed
from that rejection — not a call the maintainer made or was asked to make.
