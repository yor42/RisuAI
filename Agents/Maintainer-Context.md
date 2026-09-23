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
- **Reasoning:** stated directly (quoted below) — this is a long-lived community fork, and upstream
  accepts only small, measurable PRs, so plugin code must keep working there too.
- **Alternatives rejected:** not recorded in source.
- **Depends on:** MC-032.

> - **`risuai.d.ts` note.** Document that both can reject, and label this **specific to this
>   fork**.
>   - This work is a long-lived community fork (like Haejeok-Risu or PocketRisu), not a series of
>     upstream PRs. Upstream appears to accept only small, measurable PRs.
>   - Plugin code must keep working on upstream too. The note should tell authors to wrap these
>     calls in `try/catch`, which is harmless on upstream, and must not suggest they can count on
>     the rejection happening.

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
