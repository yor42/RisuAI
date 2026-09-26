# Live State

**This file is REWRITTEN each session, not appended to.** It holds only the current state. Do not
treat it as a log or history.
- For durable doctrine and constraints, see `Agents/Phase2-Handoff.md`.
- For the document index, see `Agents/README.md`.
- For maintainer decisions and context, see `Agents/Maintainer-Context.md`.

**Read this first after a context compaction.**

## Session date

2026-09-25 to 2026-09-26.

## Branch and commit state

The branch is `fix/persistence-conflict-platform-hardening`. **It has not been pushed since
`12841c19`.** The maintainer said the push can wait.
- `911376cb`: CHORE-34, the multiuser removal (code, tests, `package.json`/`pnpm-lock.yaml`,
  `AGENTS.md`, `wiki/Playground.md`).
- The commit after it: the CHORE-34 records and this briefing.

**Not staged, by the maintainer's instruction:** the parallel documentation session's
`wiki/Settings-*.md` files, `wiki/Home.md` and `wiki/_Sidebar.md`. Wait for the maintainer's
update, and do not delete them.

**Uncommitted, from the CHORE-33 step 1 session:** ledger rows 190 to 192 and MC-084 to MC-086.
The maintainer has not asked for a commit.

## Current: RisuAccount removal (CHORE-33), step 1 done, waiting on the maintainer

**Done 2026-09-25:** the blast-radius refresh. Ledger row 190 is the `code-searcher` survey,
row 191 the legal-notice and ToS lens, row 192 the investigator workflow (6 repo lenses, 3 fork
lenses, critic, gaps, 2 `deep-investigator` checks). The Orchestrator verified the key claims.
The evidence packets are in this session's scratchpad (`survey/`, `inv6-stale-profile/`,
`loadlocalbackup-write-order/` with the RUN red-test prototype, `tests-account-symbols/`,
`changes-since-row173/`, `user-surface-and-scope/`, `docs-staleness/`, `fork-*/`, `gap-*/`,
`contradiction-*/`, `legal-notice-and-tos/`). Scratchpad files do not survive the session;
rows 190 to 192 are the durable record.

**New maintainer input this session:**
- MC-084: Realm's standalone site has its own sign-in and upload.
- MC-085: the legal-documents notice is tied to RisuAccount. Upstream's ToS and Privacy Policy
  mostly cover account sync and Realm. The maintainer supplied the Korean texts.
- MC-086 (decision, "if possible"): move the ToS agreement prompt from boot to the first use of
  an upstream service.

**The maintainer answered the step 1 questions** (MC-087, 2026-09-25). They took the
Orchestrator's recommendation for the landing backend.

**Report 28 rev 1 is written** (`Agents/Reports/28-risuaccount-removal-plan.md`). It has three
sub-stages:
- 28A: the importer refusal;
- 28B: the removal;
- 28C: agreement at first use of an upstream service.

**Gate 1 round 1 rejected rev 1** (ledger row 193): substantive, round 1 of the three-round
count. The Orchestrator verified every finding. Its reviews are in the scratchpad
(`gate1-*/review.md`).

**Report 28 rev 2** takes every round 1 finding, plus MC-088.

**Gate 1 round 2 rejected rev 2** (ledger row 194), the second substantive rejection. The
mechanism question was answered yes:
- **I6's stale-profile notice** now ends the boot: acknowledge, clear the flags, reload.
- **28C's agreement** is now enforced in the functions that send requests upstream, not at UI
  call sites.

**Report 28 rev 3** carries both, plus every round 2 finding.

**Gate 1 round 3 approved rev 3** (ledger row 195): all four lenses APPROVE-WITH-FINDINGS, no
BLOCKER or MAJOR. **Gate 1 has passed.**
- **Report 28 rev 3.1** folds in all 62 round 3 findings. Contradictions are fixed in place; the
  rest is in section 11, which is binding.
- **The fix-up review** (ledger row 196) rejected rev 3.1 for wording only. Two fold-ins were
  wrong (the `compression` option, and section 5's translation rule), and some fixes existed only
  in section 11.
- **Rev 3.2** corrects them and merges section 11 into the home sections. Its re-check (ledger
  row 197) approved with one MINOR, fixed in place. **The plan is final.**
- **Waiting on the maintainer's go for 28A.**
- **MC-089 (maintainer):** keep the OPFS switch visible. Nothing ships until every open ticket
  is cleared.

**The records are committed** as `4aa29913`, at the maintainer's word. It is unpushed, like
`911376cb` and `c225643b`.

**28A is in progress, uncommitted.**
- **The red tests failed at HEAD for the right reason:** 14 behavioural failures (writes
  happened), plus 3 pins.
- **The implementation:**
  - `src/ts/drive/backupContainer.ts` (new): a shared header parser, the walk, and
    `decodeEntryName`;
  - `backuplocal.ts`: the walk runs first; the loop guard; the encrypt and decrypt paths are
    removed;
  - three new keys in all 7 lang files.
- **The Orchestrator's review found one gap:** a complete marker name followed by a cut-off
  data-length field, in both the walk and the loop, and the loop checked the name only after the
  body fit. `test-warrior`'s parser-level tests went red on it, and `sonnet-coder` fixed it.
- **Where it stands:** the suite is 107 files, 1364 passed, 4 skipped; `pnpm check` is clean.
- **Gate 2 is running**: workflow `chore33-28a-gate2`, two `opus-reviewer` lenses. The commit
  message draft is at `scratchpad/commit-28a.txt`.
- **Process note.** `sonnet-coder` briefly wrote, then deleted, a scratch test under `src/`. No
  trace remains. Future briefs must say "never under `src/`, not even temporarily".
- **Gate 2** (row 198) rejected for wording only. The remediation and its fix-up review (row
  199) approved. The live check (row 200) passed: the refusal is shown, `save/` is
  byte-identical, and a 10k-entry walk takes about 2.5 s.
- **Cleanup is done.** The maintainer closed the tab and the server was stopped. `save/` was
  restored and matches the pre-check manifest; the boot's extra dbbackup was moved to
  `scratchpad/live28a/created-by-check/`.
- **28A is committed as `e1dd839c`**, at the maintainer's word: 13 files. It is unpushed, like
  `911376cb`, `c225643b` and `4aa29913`.
**28B (the removal) is committed as `87b974e5`** (2026-09-26, at the maintainer's word): 101
files, unpushed. The `Agents/` records and the wiki session's files were left out.

**How it was built:**
- **Red tests first.** Two `test-warrior`s, against the seam names in `scratchpad/28b/seams.md`.
  The red run is `scratchpad/28b/red-run-before-b1.txt`: 24 tests failed in 6 files, and 3 more
  files failed to load.
- **Three implementation batches:**
  - batch 1: the logic layer;
  - batch 2: the UI, the lang keys and the prose sweep;
  - batch 3: `server.cjs`'s Sionyw routes and the `openid-client` package.

  Each batch's report is in `scratchpad/28b/b1-report.md`, `b2-report.md` and `b3-report.md`.
- **Then the rest:**
  - a test pass;
  - `translator` for the six locales, with the upstream labels resolved by the Orchestrator;
  - `doc-writer`: AGENTS.md, plugins.md, migrationGuide.md, two wiki pages, and the new
    `wiki/Migrating-from-upstream.md`.

**Gate 2:**
- **Round 1** (row 203): three `opus-reviewer` lenses plus `doc-verifier`. It rejected on test
  gaps and wording, and counts as round 1 of the three-round rule.
- **The fix-up review** (row 204) approved with findings.
- **The live check** (row 205) passed, apart from the Echo message (see row 205).

**Current state:**
- **Tests and checks:** the suite is 115 files, 1389 passed and 4 skipped. `pnpm check` is 0
  errors. `pnpm run build` and `node --check server/node/server.cjs` pass.
- **The commit message draft** is `scratchpad/28b/commit-28b.txt`.
- **`save/`** is restored and verified by hash.
- **The server** is stopped, including its node child.
- **Three Chrome tabs are still open** on `localhost:6001`. The maintainer closes them, because
  of the leave-site guard, and must do so before the server is started again.

**What to stage for 28B:**
- everything under `src/`, `server/`, `package.json` and `pnpm-lock.yaml`;
- `AGENTS.md` and `plugins.md`;
- `wiki/Plugin-API-Reference.md`, `wiki/RisuAI-Basics.md` and `wiki/Migrating-from-upstream.md`.

Never stage the wiki session's files: `wiki/Settings*.md`, `wiki/Home.md` and `wiki/_Sidebar.md`.

**Known items from 28B, closed by 28C:**
- **DS S1** is closed. 28C's `askUpstreamAgreement()` replaces the boot `alertTOS` prompt
  entirely; there is no boot prompt left for a mismatch toast to displace.
- **Self-re-posting alerts can ping-pong** is closed by design, not by luck: Report 28's R6 keeps
  the stale-profile notice's page life ending before `loadedStore.set(true)`, so it can never be
  live at the same time as an agreement prompt; T-C13 pins the scenario.
- **Still open, unrelated to 28C:** the "Backup & Files" tab still uses the old account tab's
  person icon (cosmetic).

**28C (agreement at first use of Realm or Drive) is committed as `d2653123`, and its live check
has passed (ledger row 221).** The history below (the escalation, the redesign, Gate 2) is kept
as the record of how it was built.
- **Red tests first** (ledger rows 209-210). Workflow `chore33-28c-red-tests` (3 `test-warrior`s +
  3 `adversarial-reviewer` checks, ~1.61M tokens, 467 tool uses) wrote 126 tests across 16 files
  against the seam contract (`scratchpad/28c/seams.md`); 55 failed at HEAD. Reviews: module-boot
  APPROVE-WITH-FINDINGS; requests REJECT (a decline test would hang against a correct
  implementation; the drive suite loaded the real `stores.svelte`); views REJECT (`RealmPopUp`
  missing the legal-flag stub; `RealmFrame` could not catch a transient iframe; a five-state test
  coupled to store caching). Workflow `chore33-28c-red-fixes` (3 `test-warrior`s + 3 re-checks,
  ~1.10M tokens, 327 tool uses) fixed all of it, plus two more defects found in the same pass
  (~121k more).
- **Implementation:** batch 1 (module, request functions, boot, prompt; `sonnet-coder` ~378k),
  batch 2 (views; ~238k). A boot-test leak (cleanup answering 'no', which is not one of the
  prompt's own answers) was fixed by `test-warrior` (~112k).
- **The Orchestrator found a real bug by reading the new module,** not by running it: it
  subscribed to `alertStore` before posting, so an answer left over from an earlier prompt
  resolved the next one — after one Decline, every later Realm/Drive click was silently declined
  with no prompt shown. Red tests first (~112k), then the fix, post before subscribing (~50k).
- **Then:** a placeholder button label fix, translations for the six other locales, and a
  translatable final punctuation for Chinese; a post-implementation test pass. Pre-gate: the
  suite was 124 files, 1459 passed, 4 skipped; `pnpm check` clean; build ok.
- **Gate 2 round 1** (ledger row 213): three `opus-reviewer` lenses, all REJECT (substantive;
  round 1 of the three-round count). No consent leak, no data loss, no crash, no build defect;
  every mutant that sends a request or skips a prompt was killed. Findings: a stray `'consent'`
  result didn't show the placeholder (C1); the `storage` listener didn't re-read on a cleared key
  (C2); Drive's `checkDriverInit` didn't strip `code`/`state` on every path that must not run
  (C3); several false or history production comments (C4); prompt layout and string fixes (C5).
  Fix-up: `test-warrior` ~294k, `translator` ~58k, `sonnet-coder` ~193k.
- **Gate 2 round 2** (ledger row 214): one `opus-reviewer`, REJECT (substantive — **the second
  consecutive substantive rejection** under AGENTS.md section 4's three-round rule). F1: the
  round-1 fix's placeholder-control logic failed the reviewer's own S-a to S-d scenario matrix
  (S-c doubled the `getRisuHub` call). F8: no test covered those scenarios. **Is the mechanism the
  problem? No** — reviewer and Orchestrator judged the design (a consent `hubStatus` plus the
  placeholder) sound, and the round-1 fix brief's non-normative mechanism ("reloads only if the
  view is in the consent state"), which the coder and tests had followed instead of the invariant
  above it, the cause. The round-2 fix brief stated only the invariant and the scenarios, leaving
  the mechanism to the implementer. **Round 3 and the `senior-advisor` escalation below found this
  "mechanism sound" judgement wrong.** Fix-up: `test-warrior` ~127k, `sonnet-coder` ~113k.
- **Gate 2 round 3 was interrupted by a process exit before its verdict** (ledger row 215). Its
  scratch scenarios survive (`scratchpad/28c/gate2-r3/scen/mm-r3.svelte.test.ts`,
  `rm-r3.svelte.test.ts`, `scen-run2.txt`) and found two more double `getRisuHub` loads in the
  placeholder control's load logic, in both views: **E2**, a `key:null` storage event arriving
  while the prompt is up (after the control captured the store as `true` at click time) flips the
  store, so the store-driven effect and the control's own reload both fire; **E4**, the control
  activated twice before the answer joins the one pending prompt, but both continuations reload.
  This was the third leak found in this same load logic (round 1's C1, round 2's F1/S-c, now
  E2/E4), so the Orchestrator escalated to `senior-advisor` before a fourth revision. Dossier:
  `scratchpad/28c-escalation/dossier.md` (a different scratchpad session from the rest of 28C's
  evidence, since the interruption reset it).
- **The `senior-advisor` escalation has returned** (ledger row 216; Report 28 section 11.7 rev
  3.5). **Diagnosis:** the store could stay `true` while storage held no acceptance, because
  nothing published a fresh `false` back to it — every fix after round 1 was trying to make the
  control *predict* whether the (silently stale) store would still fire the effect, and every
  prediction had a hole. **Redirected:** remove the second load trigger rather than guard it.
  **Adopted fix:** Invariant A (the `upstreamAccepted` store never disagrees with the latest fresh
  read of storage, in either direction; once `getRisuHub`/`getRealmInfo` returns `'consent'`, the
  store reads `false`) and Invariant B (in each view, only the store-driven effect loads in
  response to acceptance; the placeholder's control only asks — section 3.3's original ownership
  statement, restored). The `'consent'` `hubStatus` round 1 introduced is removed. A fresh Gate 2
  review runs on the new design once built; the three-round rejection counter restarts for it.
- **Invariant A/B is built** (ledger rows 218-220; Report 28 section 11.7 rev 3.6). A first
  `test-warrior`/`sonnet-coder` pass (~200k/75 tools; ~359k/96 tools) wrote red tests and built a
  "pulse" store plus a per-view flag on top of them, because the tests' `getRisuHub` stand-in did
  not publish on a fresh `'consent'` read — it modelled a state the real request no longer leaves
  once Invariant A holds. The Orchestrator traced the failure to the stand-in, not the design. A
  second pair (`test-warrior` ~150k/60 tools fixed the mocks to honour the publish rule and
  removed a test pinning the pulse; `sonnet-coder` ~188k/65 tools removed the pulse, the flag and
  the extra bookkeeping) left the plain design: the store follows storage via
  `publishUpstreamAccepted()` on the Realm list/info consent branches, Accept and Decline; each
  view loads in response to acceptance only from its store-driven effect; the control only asks.
  **Lesson:** a test stand-in must honour the same rule as the real function it stands in for, or
  the tests re-create the defect the design removes.
- **Gate 2 on the new design** (ledger row 220): one fresh `opus-reviewer`, ~245k, 79 tool uses.
  **[EDITORIAL].** Behaviour accepted: both invariants hold as scoped, every scenario holds (137
  repo tests, 34 scratch scenarios), Svelte hazards safe; 14 mutants, every request/load mutant
  killed. Survivors: the Decline republish path (untested, minor), one equivalent mutant, and a
  proposed guard on `MainMenu`'s online listener that plan section 11.3 accepts leaving out.
  Required editorial corrections: the commit message's red-evidence claim (the view scenarios
  cannot fail against the pre-rework views, because their stand-in now publishes — the real red
  evidence for the rework is the two tests pinning the publish) plus two further overstatements;
  several test and code comments (a nonexistent "last-handled tracking", test titles claiming the
  control reloads, an unmount comment describing the removed pulse/flag design, an undefined
  "Invariant A" label and an unscoped statement of it, a false "search input's value still
  changes", a misleading example in the Decline branch). **Corrections were folded in and the
  design is committed as `d2653123`.** Optional, not taken: a test for the Decline republish; a
  store guard on `MainMenu`'s online listener; tidy the T-C15 mocks.
- **Check owner's final snapshot** (Orchestrator): 124 files, 1493 passed, 4 skipped; `pnpm check`
  0; build ok.
- **28C is committed as `d2653123`** (2026-09-26): the module, request functions, boot, prompt,
  views, lang keys and their tests.
- **The live check** (ledger row 221) passed on every item run live: no request to `/hub-proxy`,
  `risuai.xyz`, `risuai.net` or Sionyw before acceptance, at boot, from the home placeholder, from
  the desktop Realm browser, or from a `?realm=` deep link; declining left everything in place and
  fetched nothing on a reload; `save/` was byte-identical afterwards. Not run live: the
  `betaMobileGUI` mobile landing view (covered by T-C2m) and the accept path (proven by tests, not
  run live per MC-081).

**The comment sweep (history-narrating comments, AGENTS.md's "Comments state invariants, never
history") is done and approved, uncommitted, and lands in a separate commit from CHORE-33.**
- Ledger row 212: `code-searcher` survey (~86k; 557 hits across 124 files), three `sonnet-coder`s
  (A ~404k, B ~365k, C ~194k) editing 55 files (`scratchpad/comment-sweep/files.txt`),
  `adversarial-reviewer` APPROVE-WITH-FINDINGS (~183k): token-level proof that no code changed in
  28 `.ts` files, a hand check of 5 `.svelte` files; 33 touched test files, 575 passed.
- Findings: about 20 pre-existing in-repo `file:line` citations survive in six files (a later
  pass); one circular comment in `LoreBookList.svelte`.
- **Held back until after 28C, because 28C was still editing them:** `globalApi.svelte.ts`; every
  file 28C touches; the test files that still held `alertTOS` mocks.

**What to stage for 28C:**
- everything under `src/` that 28C's seam contract and implementation touch:
  `src/ts/upstreamAgreement.ts` (new), `src/ts/alert.ts`, `src/ts/bootstrap.ts`,
  `src/ts/characterCards.ts`, `src/ts/drive/drive.ts`, `src/lib/Others/AlertComp.svelte`,
  `src/lib/UI/MainMenu.svelte`, `src/lib/UI/Realm/RealmMain.svelte`,
  `src/lib/UI/Realm/RealmFrame.svelte`, `src/lib/UI/Realm/RealmPopUp.svelte`,
  `src/lib/SideBars/CharConfig.svelte`, `src/ts/globalApi.svelte.ts`'s dropped `alertTOS` import,
  and every new or changed test file for them;
- the seven `src/lang/*.ts` files;
- `wiki/Migrating-from-upstream.md`, `wiki/RisuAI-Basics.md` and `wiki/Creating-a-Basic-Bot.md`.

**What to stage for the comment sweep (a separate commit):** the 55 files in
`scratchpad/comment-sweep/files.txt`.

**What to stage for the docs commit (a separate commit, after 28C and the sweep):** `AGENTS.md`,
`.claude/agents/*.md`, and everything under `Agents/**` — the MC-091 workflow pilot (Report 29 and
the `AGENTS.md`/`.claude/agents` edits it made), and this session's own records (the ledger, this
file, Report 28). None of these three commits' file lists overlap.

**Never stage the wiki session's files:** `wiki/Settings*.md`, `wiki/Home.md` and
`wiki/_Sidebar.md`.

**Next for CHORE-33:**
1. **Push**, when the maintainer says. The branch has not been pushed since `12841c19` (see
   "Branch and commit state" above); the comment sweep (`57d1596a`), 28C (`d2653123`) and the
   docs commit (`fd13d930`) are all already committed but unpushed.
2. **Optional follow-ups from Gate 2** (ledger row 220), not required for the commit: a test for
   the Decline republish path; a store guard on `MainMenu`'s online listener; tidy the T-C15
   mocks.
3. **The second comment-sweep pass**, held back by ledger row 212 while 28C was still editing its
   files: `globalApi.svelte.ts`, every file 28C touched, and the test files that held `alertTOS`
   mocks.
4. **Update the records** listed in Report 28 section 10 — still outstanding; this session's check
   of `Agents/Roadmap.md` found its CHORE-33 entry still reads "planned; Gate 1 passed", not
   updated for 28A/28B/28C:
   - the Roadmap, including the six tickets from section 3.5, and 28A/28B/28C's completed status;
   - Report 25's "Superseded" note;
   - Report 28's STATUS;
   - hand the wiki session its list, including the 28C additions (`Settings-Chat-Bot.md`,
     `Settings-Display.md`).

**The edit-button bug (MC-090): the mechanism is found, and it is upstream's and this fork's**
(ledger rows 201 and 202).
- **The mechanism (reproduced).** `Chats.svelte` mounts one `Chat` per visible message, keyed by
  a hash of the message's data, id, index and flags, plus `ReloadChatPointer[index]`. `editMode`
  is local state, so any change to that hash remounts the message and silently drops the
  editor.
- **What changes the hash:**
  - `ReloadChatPointer` bumps, from TriggerV2 `v2UpdateChatAt`, Lua `reloadChat` and embedded
    buttons;
  - every `ReloadGUIPointer` tick, which resets the whole pointer map. `runTrigger` ticks it
    whenever a chat variable changed;
  - rewrites of the message text: `modifychat`, `cutchat`, regex `@@inject`, and inlays that
    finish loading late.
- **Not the maintainer's supplied plugins** (row 202).
- **Still open: why it stays stuck across clicks.** The maintainer's answers (MC-090,
  2026-09-26) rule out row 201's race as the whole story:
  - the button stays dead after waiting;
  - no per-reply scripts are involved;
  - the newest message is affected too.

  Workflow `edit-button-stuck-state-investigation` is running. It has four `investigator`
  lenses (persistent gating state, orphaned instances, newest-message streaming, a persistent
  repro) and a critic. Packets go to `scratchpad/editbug3-*/`.
- **The fix is a new ticket,** not yet filed on the Roadmap. It keeps each message's component
  identity, and its edit mode, across these rebuilds.

The original stage brief follows.

The maintainer chose it as the next stage on 2026-09-25, after CHORE-34 and before W1 (MC-080,
"Timing"). Its scope and the migration refusal are already decided.

**Read first:**
- `MC-080` (scope and timing) and `MC-081` (the encrypted-`.bin` refusal and its message) in
  `Agents/Maintainer-Context.md`, plus `MC-011`, `MC-012`, `MC-025`, `MC-026` and `MC-002`.
- **Report 25** (`Agents/Reports/25-risuaccount-removal-strategy.md`). It is the strategy:
  - section 4: what goes and what stays;
  - section 5: the nine invariants;
  - section 6: the refusal message;
  - section 10: next investigations and the do-not list;
  - section 12: the records to update.
- **Report 27** (the CHORE-34 plan). It is the template for this stage's plan: blast-radius
  table, invariants with acceptance, and tests to delete, edit or pin.
- Ledger rows 173 to 175: the original blast-radius map, the reference forks and the
  `senior-advisor` scope call.

**Report 25's line numbers are stale.** They were cited against the W0 working tree, before W0,
CHORE-28 and CHORE-34 were committed. CHORE-34 edited `AlertComp.svelte`, `index.svelte.ts` and
others. Cite by name, and re-derive any location before relying on it.

**Stage plan** (AGENTS.md section 4; `opus-reviewer` gates throughout, since the stage touches
save/persistence, backend selection and the `.bin` importer):
1. **Refresh the blast radius**, one ledger row per dispatch, starting at row 190.
   - One batched `code-searcher` survey of every Report 25 section 10 item 1 pattern, against
     HEAD. The Orchestrator re-runs the counts.
   - Then an `investigator` pass on what the survey cannot settle:
     - invariant 6's scenario: `accountst = able` with a stale local database in the fallback
       backend, and where detection could live;
     - the exact write order in today's `LoadLocalBackup`, for the red test;
     - the current test files that reference account symbols (Report 25 invariant 9 counted
       23 before W0 landed);
     - whatever changed since ledger row 173.
   - Escalate to `deep-investigator` only on the 1.3 triggers.
   - Section 10 item 6 (compare W1's file list) is moot, because the maintainer fixed the
     order.
   - Item 5 (whether Realm's upload page offers its own sign-in) needs a network visit. Do not
     probe (`MC-081`); ask the maintainer if it matters.
2. **Bring the maintainer the questions that are theirs.** Known open ones:
   - **Invariant 6's two design choices:** which backend a detected profile lands on, and
     whether detection lives in `AutoStorage.Init()` or in `bootstrap.ts`.
   - **Anything user-visible** beyond what MC-080 already lists.
   - **Unused `src/lang` keys:** delete them? For CHORE-34 the answer was yes (MC-083).
3. **Plan as Report 28, then Gate 1** (`opus-reviewer`, fresh). The plan must carry all nine
   Report 25 invariants with acceptance scenarios.
4. **Tests.** The red test comes first: invariant 1's four-entry fixture (asset, cold entry,
   marker, database) with write spies, red at HEAD. Then `sonnet-coder`, then Gate 2
   (`opus-reviewer`), a live check on a production build, and a commit on the maintainer's word.

**Stage obligations beyond `src/`:**
- **`AGENTS.md`:** its "Data Layer" section names account-sync as the first backend and in the
  remote-block paragraph. Both must change.
- **`plugins.md`:** invariant 8's `saveMethod` values and the four "syncs across devices"
  passages.
- **The migration wiki page** (Report 25 section 6).
- **`wiki/Settings-Account-and-Files.md`** belongs to the parallel wiki session. Do not edit it;
  list what goes stale for them.

## Work order

1. **W0: identity.** Done and committed.
2. **CHORE-28.** Done and committed (Report 26).
3. **Multiuser removal (CHORE-34, `MC-074`/`MC-083`, Report 27).** Done and committed
   (`911376cb`).
4. **RisuAccount removal (CHORE-33, `MC-080`/`MC-081`, Report 25).** Next.
5. **W1: engine binding.** This closes CHORE-25 and CHORE-26. Then the composer stage (Report 22
   rev 3), then W2 and W3.

## CHORE-34 facts later stages rely on

- **`src/ts/sync/` no longer exists.** `peerjs` is gone from the dependencies. Nothing reads
  `ConnectionOpenStore`.
- **`saveAsset`'s custom-id parameter** has no production caller.
  - `verifyAssetCacheEntry` judges a 64-hex custom id as a content hash, so a caller must never
    pass a 64-hex id that is not the hash.
  - A `uuidv4()` name, the fallback on non-secure origins, reports 'not-content-addressed'.
- **`checkCharOrder`'s `§temp` exclusion** is the only remaining `§temp` reference, and T1 pins it
  (`src/ts/checkCharOrder.tempCharacter.svelte.test.ts`). Upstream saves can carry such a
  character.
- **Upstream facts:**
  - upstream still ships multiuser (`upstream/main`, 2026-09-23);
  - upstream never writes `Message.otherUser`;
  - user messages without `name` already exist upstream.

## CHORE-28 facts later stages rely on

- **`RisuSaveEncoder` (`risuSave.ts`):**
  - Each `init`/`set` pass takes one copy of the character list at its start.
  - It counts holders by `String(chaId)` and encodes each key at most once.
  - A key with two or more holders is frozen: its block is kept unchanged, taken out of
    `toSave.character` and never deleted.
  - A never-saved duplicate writes its first holder once.
  - `init({ previous })` reuses the replaced encoder's block only for a key duplicated in its own
    snapshot.
  - `getFrozenKeys()` exposes the frozen set.
- **Marks.** `toSave.character` can hold raw, non-string `chaId` values (`frontUnshiftSelected`,
  `appendIfAbsent`). The encoder compares marks by `String()`. **Never convert the list to strings
  in place:**
  - `mergeUnsavedChanges` folds it back into the live tracker after a failed write;
  - `prepareSaveIteration`'s no-reload filter compares raw values, so the mark would be dropped.
- **`globalApi.svelte.ts`:**
  - `reloadSaveEncoder` is the shared reload hand-over.
  - `checkFrozenKeysForResolution` is the idle step.
  - `publishFrozenSaveIndicator` feeds `frozenSaveKeysStore`, which `SavePopupIcon.svelte`
    renders. The RisuAccount removal edits that file too, because it imports `AccountWarning`
    (Report 25 invariant 4). Keep the frozen-key indicator.
  - The save loop's calls to the last two are covered by review only.
- **Resolving a duplicate.** A normal delete only trashes a character, so the key stays duplicated.
  A permanent delete resolves it. `removeChar` and `restoreCharacterFromTrash` accept the
  character object, and the grid uses that form.
- **Cold storage.** `cleanColdStorage` refuses while any key is frozen.

## W0 facts the next stages rely on

- **`src/ts/process/chatIds.ts`:**
  - pure fill, repair and duplicate warnings;
  - a missing id is always fresh;
  - `repairDatabaseIds` runs at boot and on every decoded backup before install, including the
    local `.bin` restore. W0 also added it to `loadRisuAccountBackup` (`drive/accounter.ts`) and
    `autoServerBackup` (`kei/backup.ts`). Those calls go with the functions the RisuAccount
    removal deletes. **The local `.bin` restore's call must stay.**
- **`src/ts/process/chatOrigin.ts`:** a target that is gone or held twice is skipped (`MC-075`,
  `MC-078`). There is no production caller yet; W1 binds the first.
- **W1 must:**
  - call `beginWork` only with objects read back through `DBState`;
  - resolve once per synchronous batch;
  - report the Lua and CBS resolution counts;
  - measure a production build with throttling;
  - prove that `runTrigger`'s whole-clone commit cannot drop a message.

## Operational notes for this environment

- **Git Bash here fails on heredocs, and on single commands longer than about 230 characters.**
  Write scripts with the Write tool, or use PowerShell. Commit with `git commit -F <file>`.
- **Git Bash rewrites any argument that begins with `/`** (MSYS path conversion). `git grep
  '/kei'` reported no matches when there were five. Prefix such commands with
  `MSYS_NO_PATHCONV=1`, or drop the leading slash from the pattern.
- **Four agents hold `Write`, for scratchpad files only:** `opus-reviewer`,
  `adversarial-reviewer`, `investigator` and `deep-investigator` (in effect since 2026-09-25).
  `code-searcher`, `doc-verifier` and `senior-advisor` lack it. Check `^tools:` in
  `.claude/agents/*.md` before a brief promises a tool.
- **Tell every agent** to run shell commands from the scratchpad, never from the repo root, and
  never to use globs in `mkdir` or `cp`.
- **Mutants:** build them from the current source each round, through a scratch Vitest config
  that aliases the module. When swapping in HEAD versions of files, serve every changed file,
  including the `./en` import.
- **`pnpm remove`/`add` backfill `libc:` metadata** into unrelated lockfile entries (pnpm
  10.34.1). Strip the added lines so the lockfile diff is only the intended change, then validate
  with `pnpm install --frozen-lockfile --offline`.
- **Line endings.** `core.autocrlf=true`, so git normalises them, and a CRLF/LF flip in a
  working-tree file never shows in the diff. Judge by `git diff --numstat` and git's "LF will be
  replaced" warnings, not by Git Bash `grep`/`od` counts, which misreported twice. The `Agents/`
  documents are LF.

## Open items

- **Possibly still present:** `C:\Projects\scratch_investigator_tmp` (empty) and
  `Temp\claude\coldstorage.svelte.ts.bak`. The maintainer deleted `%TEMP%\qa1`.
- **Scratch trees with `node_modules` junctions.** Remove each junction with `cmd /c rmdir` before
  any recursive delete.
- **The `.gitignore` entry** for `Asset Cache/Community Mitigation_Webrowser Plugin/` names a path
  that no longer exists.
- **Card description contrast is 3.32:1.** This is a maintainer decision and has not been raised.
- **The per-instance `matchMedia` listener in `Chat.svelte`.**
- **The sidebar is deferred** (`MC-071`).

## Test suite

**104 files: 1311 passed, 4 skipped, 0 failed** at `911376cb`. `pnpm check` is clean.
- Run the suite with `npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.
  Plain `pnpm test` also picks up `.claude/worktrees/**`.

## How to live-check this app

- **Use Claude in Chrome, not the built-in pane.** The service worker kills the boot in the pane.
- **Build for production.** Run `pnpm run build` with `$env:VITE_RISU_LEGAL_CONFIGURED='TRUE'`
  set for that one PowerShell command only, then start `pnpm run runserver` (port 6001) yourself
  as a background process. The maintainer approved this on 2026-09-25.
  - Do not use `preview_start`. It would open the app in the built-in pane on the same server
    storage, making a second writer.
- **The Node server's data is `save/`** (gitignored). It is a near-empty throwaway, not the
  fixture.
  - Before the check, copy it to the scratchpad.
  - Afterwards, stop the server and restore it. Verify the restore by hash, and move any file the
    test created out rather than deleting it.
- **Model:** Echo needs no API key. In the model picker it sits under "For Developer" once "show
  unrecommended settings" is ticked.
- **Settings:** restore any setting you change. The `save/` restore covers the Node server's
  settings.
- **The leave-site guard prompts on every reload of the Node build**, by design
  (`preload.beforeUnload.test.ts`). A forced navigation does not get past it, and closing the tab
  hangs the tool.
  - Confirm the save reached `save/` (mtime and `__revisions.json`), then ask the maintainer to
    refresh or close the tab.
  - Close the tab before the server restarts, or it can write stale state back.
- **Network:** do not probe upstream services (`MC-081`).
- **Stopping the server.** `TaskStop` on `pnpm run runserver` kills only the pnpm wrapper. The
  `node server/node/server.cjs` child keeps listening on port 6001. Stop it by PID, and confirm
  the port is closed before restoring `save/`.
- **A hidden Chrome window.** When `document.visibilityState` is `hidden`:
  - screenshots time out;
  - chained timers are throttled, so `waitAlert` loops can take up to about a minute.

  Page scripts still work. Clicks via `element.click()` and page reads were enough for 28B's
  check.
- **Seeding test data.** Use `globalThis.__pluginApis__.getChar()` / `setChar()` on the main page
  to set a field on the selected character; the `save/` restore undoes it. **Never switch the
  model this way.** `setDatabaseLite` did not reach the send path, and a test message went to the
  profile's default provider (row 205). Use the model picker.

## Method lessons from this session

- **Verifying a packet's refutation needs its own grep.** Row 185 called `sendMain` nonexistent.
  The Orchestrator checked the half it expected (that `index.svelte.ts` never reads the store) and
  wrote a false "correction" into MC-074. Gate 1 caught it. When a packet says something does not
  exist, grep for that name.
- **A comment rewrite inherits the plan's claim, so check the claim.** Report 27 rev 1 described a
  doubled asset path that no upstream revision could produce. Gate 1 traced the call site
  (`requestChar()` never takes an argument) and killed it.
- **For a removal, the review budget goes on the words.** Both CHORE-34 gates rejected on wording
  only, and neither found a code defect. The comments, the records and the commit message carried
  every defect.
- **A fix that normalises one side of a comparison needs the other side checked too** (CHORE-28).
  Counting holders by `String(chaId)` while matching raw marks deleted numeric-id characters.
- **A suggested simplification can reintroduce a bug one layer out** (CHORE-28). Check where a
  mutated value flows after the function returns.
