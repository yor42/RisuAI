# Report 49 — Memory footprint stage 1 (MC-119): the accepted plan and its gate record

**STATUS:** behaviour accepted at Gate 1 round 5 ([EDITORIAL], plan version r4), 2026-09-30; the
corrections were applied to the plan text by the Orchestrator (plan section 10) and are not yet
re-verified. **Nothing is implemented yet.** Gate 1 ran five rounds over five plan versions:
[REJECT] on the per-chat plan, [REJECT] on the character-grain plan r1, [REJECT] on r2, [REJECT] on
r3, then [EDITORIAL] on r4. Steps 1-7 (section 3) each get their own implementation and Gate 2,
except step 7 (measurement), which has no Gate 2. The five rounds are ledger rows 478-482 (section
4); this report and those rows are the durable record. Section 3 marks what was added after
Gate 1.

**Sources** (scratchpad `memfoot/`, written by the Orchestrator from hand-backs unless noted):
- the accepted plan, `stage1c/plan.md` (r4 with the round-5 editorial corrections);
- the superseded per-chat plan `stage1/plan.md` and its Gate 1, `stage1/gate1/review-r1.md`;
- the character-grain gates, `stage1c/gate1/review-r1.md`, `review-r2.md`, and the r3/r4 gates,
  `stage1c/gate1r3/review-r1.md`, `review-r2.md`;
- the three `senior-advisor` directions, `advisor-1.md`, `advisor-2.md`, `advisor-3.md`;
- the scoping packets `stage1/packet.md` and `stage1c/packet.md`;
- measurements: `m1m2/report.md`, `retainer/report.md`, `retainer/verify/report.md`,
  `real-profile/handoff.md`, `real-profile/chat-split-real.txt` (both maintainer-run scripts),
  `gen/README.md`;
- ledger rows 455-486 and `MC-130` to `MC-145`; `CHORE-49` in the Roadmap.

The review files, packets and hand-backs above live in a session scratchpad and are not durable.
This report and ledger rows 478-486 are the durable record of the gate rounds.

Decisions this plan implements: `MC-130` to `MC-145` (section 2 places each), `MC-119` (the
memory-footprint work). Constraints it works under: `MC-011` (the fork has never shipped, so
upstream compatibility is the invariant), `MC-036` (mark-all on whole-database setters), `MC-081`,
`MC-091` (scope amendments). Basis: HEAD `bb3f9e7b`. A separately gated `Chat.svelte` fix, committed
as `ccf45c53` after the plan was written, is not part of this plan (section 6).

## 1. Summary

**What stage 1 is.**
- **Characters are archived only at startup.** A boot pass runs on the raw save tree, under
  exclusive access from before the main file is read until the pass's own commit resolves.
- **The archive form is upstream's.** A character becomes the existing cold-storage stub (enriched
  with the real `type`, `lastInteraction`, `trashTime`, a chat count and a version marker) plus one
  blob `{character}` under a fresh random UUID.
- **A character stays loaded once opened.** No code path creates a stub, or replaces a full
  character with one, after the UI opens. The plan calls this invariant M ("monotonic").
- **An idle reload releases the characters opened since the last load.** When the restored
  characters add up past a threshold (non-normative: about 50 MB of unit payload) and the user has
  been idle, the app saves and reloads itself. The reload re-runs the boot pass and reopens the same
  character and chat.
- **Also in stage 1:** unit and asset clean-up move into the manual clean-up; the startup asset
  sweep stops once any stub exists; the plugin-storage migration and the 10-day archiving paths are
  retired; a new root key is the opt-out (default on, with a notice; `MC-142`).
- **Not in stage 1:** a runtime archive engine, per-chat archiving, modules, streamed or inline
  backup, the Node streamed write (section 3, out of scope).

**What it achieves on the maintainer's profile.** The profile (maintainer-run read-only scripts on a
copy of the maintainer's `database.bin`, ledger row 470): 499 characters, file 155.8 MB
(163,331,827 bytes), of which character blocks 114.9 MB, modules 32.0 MB, plugins 7.3 MB; chats are
19.4 MB. Parsed in Node, the file is 258.6 MB of heap (1.66x). That is measured, but it counts raw
parsed objects only and is a lower bound for the app.

| Quantity | Today | After stage 1 | Confidence |
|---|---|---|---|
| Main file | 155.8 MB (measured, row 470); over the Node server's 100 MB limit | about 41-46 MB | **Estimate, not measured.** Advisor-2 (row 472): modules 32 + plugins 7.3 + presets and root 1.4 + about 0.3 of stubs + the open character |
| Heap after boot | 258.6 MB parsed (measured, raw objects) | about 70-76 MB | **Estimate, not measured.** Advisor-3 (row 475) states it; the scoping packet (`stage1c/packet.md` S6, row 473) derives it as the file estimate times the measured 1.66 file-to-heap ratio. That product is 68-76 MB, stated there as 70-76 |
| **File** bytes added per character opened in a session | n/a | about 230 KB on average, 4.6 MB at most | Advisor-3's figures, **in file bytes, not heap:** 114.9 MB of character blocks / 499 characters, and the largest shell (chats excluded) is 4.59 MB (row 470). The heap cost is larger. Characters are about 178 MB of the 259 MB parsed heap (about 357 KB each on average; row 470) and the measured file-to-heap ratio is 1.66x. No per-character heap maximum is in the evidence |

- **These are projections.** D20 (section 3) is the measurement that replaces them, on the `real2`
  preset and on `s1000`, on the 2 GB AVD. The app measurements so far (rows 468, 471, 474) ran on an i9-13900K, so they
  say nothing about the Pi or mobile targets.
- **Modules stay inline in stage 1** (32 MB of the estimated 41-46 MB remainder). On the report's
  own estimate, modules are 70-78% of what remains, so advisor-2's trigger (modules over about 30%
  of what remains moves the module item forward) is already met on paper. `MC-145` (amending
  `MC-143` 3) records the order: after stage 1, the upstream-compatible inline-everything backup
  comes first, then archiving of modules that are not enabled, then the rest of stage 2.

## 2. How the direction was reached

All dates are 2026-09-30 unless a row says otherwise. This is history. It belongs in a report and
not in code comments.

| # | What happened | Evidence | Decision |
|---|---|---|---|
| 1 | The memory-footprint work is scheduled after W2e. The heap measurement showed memory is the scarce resource. | ledger 383 (cited by `MC-119`) | `MC-119` (2026-09-29) |
| 2 | The maintainer decides the first two changes: stop the boot walk, and store each chat separately. The display limit is display-only; upstream compatibility means an upstream-restorable `.bin` backup. | (row 455's title cites it) | `MC-130` |
| 3 | Groundwork. Row 455 measured that replacing data behind `$state` through the proxy retains it (the exp0 experiment); row 468 later corrected this. Rows 456 and 457 mapped the persistence side (four more full-reload sites, no per-chat dirty signal) and the consumer side (plugins can read and write back every chat of every character). | rows 455, 456, 457 | none |
| 4 | The maintainer states that the real backup is about 36 GB (said after row 456 reported the Node server's 100 MB limit) and decides how plugins and snapshots meet per-chat storage. | rows 456, 457 | `MC-131` (a stated fact); `MC-132` (V3 loads on demand; V2.1 keeps everything loaded; snapshots restore chats fully) |
| 5 | A synthetic generator was built to the 36 GB baseline. **Direction 1 (advisor-1)** then said: do not build a second store. Cold storage's model (a loaded chat is inline in the file, an unloaded one is a pointer) keeps memory and file in agreement; generalise its policy, do not rewrite `init` or the block format. It named M1 and M2 as the measurements needed. The dossier listed `MC-130` to `MC-132`. | rows 458, 462, 459, `advisor-1.md` | none |
| 6 | The PocketRisu study gave ideas only. CHORE-47 (a local backup left out every asset that was not a `.png`) was scoped, tested, fixed and gated (Report 48). | rows 460, 461, 463-467 | `MC-133`: stage 1 extends cold storage, the boot pass is not rewritten, CHORE-47 is fixed first |
| 7 | M1 and M2. An installed-then-swapped array is freed in Node, and in the built app except for about 28 MB held by a retainer (identified in row 471); the retention applies to data present when the proxy was created (this corrects row 455). The synthetic main file shrinks to 12.1 MB of 169.7 MB (`real`), a projection on synthetic data. One machine, i9-13900K. | row 468 | none |
| 8 | Scoping of the per-chat plan. | row 469 | `MC-134`: archiving follows its own rule; all at first boot with progress; manual clean-up only; chats over about 16 KB |
| 9 | **The per-chat plan was written and rejected at Gate 1 round 1** (four blockers, section 4). | `stage1/gate1/review-r1.md`, row 478 | none |
| 10 | **The real profile contradicted the premise.** Chats are 19.4 of 155.8 MB. Lorebooks are 56.5 MB and asset lists 16.9 MB. Chat archiving as planned would leave 137.3 MB, still over the Node limit. The generator's `real` preset had put about 93% of the file in chats. | row 470 (`real-profile/handoff.md`) | `MC-135` (`stated`, not a decision). Row 477 then showed the message field is 93.6% of the maintainer's chat bytes (18.17 MB; message text alone is 17.61 MB, 90.7%). |
| 11 | **Direction 2 (advisor-2): the character is the right grain.** The character block is already the encoder's, the dirty-tracking, the identity-tracker and the cold-storage unit. Use the existing stub form, enriched. Reject partial shells. Per-chat archiving moves later. | row 472, `advisor-2.md` | `MC-136`: whole characters; the `coldstorage` toggle becomes an opt-out and the 10-day rule goes (item 2 is later amended by `MC-142`); `getDatabase('all')` returns placeholders; the retainer gets an in-app fix first |
| 12 | Scoping at the character grain **refuted parts of direction 2**: the writer set was wrong in both directions (the packet lists paths that reach a stub: V3 `setChatToIndex`, V2.1's live proxy, `playgroundChat`, seven MCP write tools, and others), and default-on does not reach a persisted `coldstorage:false`. | row 473, `stage1c/packet.md` | `MC-137` (a saved OFF reset once; the startup asset clean-up keeps working; opting out keeps existing archives; unit reuse later; item 1 is later replaced by `MC-142`, item 2 reversed by `MC-139` 3, item 4 amended by `MC-140`) and, after the character plan's first Gate 1 review (round 2 overall), `MC-138` (the two-device Node case is accepted; an unreadable archive pausing the clean-up gets a notice) |
| 13 | **Two more rejections** of the character-grain plan (r1, then r2). With the per-chat plan that made three substantive rejections in a row, which is the escalation trigger in AGENTS.md 1.2. | `stage1c/gate1/review-r1.md`, `review-r2.md`, rows 479, 480 | none |
| 14 | **Direction 3 (advisor-3): the mechanism was the problem.** A runtime archive swaps a character's object identity (`characters[i] = stub`) while other code holds references across awaits. The set of holders is open, so enumerating them (pins, selection epoch, marks, audits) left a new hole every round. An identity swap is safe in only two regimes: **exclusively, before the UI opens,** or **monotonically, stub to full only, for the page life.** Boot is already exclusive and restore is already monotonic. Recommended: archive only at boot, release by idle self-reload (deferred and measured first), one exclusive walk for the clean-up, retire the migration, and encode "once" as a new three-state root key. | row 475, `advisor-3.md` | `MC-139` (the maintainer chose "need release while running" over the advisor's startup-only option; browses hundreds of characters a session; asset clean-up into the manual clean-up; migration retired). `MC-140`: release by an automatic reload at idle moments, reusing the startup pass. `MC-142` (recorded after `MC-141`): the maintainer approved the new three-state root setting, which replaces the one-time reset of `coldstorage` and amends `MC-137` 1 |
| 15 | Calibration for the D20 measurements. `real2` reproduces the maintainer's `database.bin` (155.6 against 155.8 MB; parsed heap 259.14 against 258.6 MB; every table line within about 6.5%; seed 1 only; after the chat recalibration the chat lines are within about 7% and the messages-per-chat p90 is 9 against 8). | rows 476, 477 | `MC-135` 4 |
| 16 | Plan r3 was rejected at Gate 1 (round 4 overall) on the idle reload (D17) and the clean-up (D11). | `stage1c/gate1r3/review-r1.md`, row 481 | `MC-141`: the idle reload fires by itself only when the user is idle (non-normative: about 2 minutes), the window has focus, nothing changed since the final save and nothing is running; the clean-up on a shared Node server accepts a short window, with a dialog warning |
| 17 | **Plan r4 was accepted at [EDITORIAL].** Its two blockers were resolved in substance; a false claim and stale text were corrected. | `stage1c/gate1r3/review-r2.md`, row 482 | none |
| 18 | `doc-verifier` checked this report, `MC-134` to `MC-142`, ledger rows 469-477 and the README counts (about 75 claims). Its corrections were applied. It also raised whether the Node server is always a secure context; the maintainer answered how Node users are deployed, that retiring the migration is accepted, and that module archiving follows stage 1 (later amended by `MC-145`). | row 484 | `MC-143` |
| 19 | **The plain-HTTP question was observed.** The Node server over plain HTTP from a non-localhost origin does not boot on this code, so `MC-143` 1's picture cannot hold on this code. From source, such deployments should have worked on upstream up to `v2026.2.291` (traced, not run; some users may be secure by another route). The maintainer had the fix filed as its own ticket. D1 gained a capability gate, `uuid` v4 unit ids and "unavailable" wording (plan section 11). | row 485, `memfoot/plainhttp/packet.md` | `MC-144`: restore plain-HTTP Node as `CHORE-49` (Roadmap); memory stage 1 does not wait for it |
| 20 | After the doc-verifier re-check, the order after stage 1 was corrected: modules would have come ahead of the backup, but upstream has no archived-module form, so a backup with archived modules restores on upstream only if it writes everything inline. | rows 484, 486 (the re-checks) | `MC-145`: after stage 1, the inline-everything backup first, then module archiving (amends `MC-143` 3) |

**Resolved: the Node server does not boot over plain HTTP** (ledger row 485; observed on a scratch
production build of the working tree, headless Chrome 154, one machine).
- **Observed:** opening the Node server at a non-localhost plain-HTTP origin stops at "Cannot read
  properties of undefined (reading 'generateKey')" during "Loading Local Save File", and no `/api`
  request is sent. A control on localhost booted to the "Set your password" prompt; the first-run
  flow and a save were not run there. HTTPS was not run.
- **Traced:** `AutoStorage` picks `NodeStorage` before any capability test. Its JWT auth needs
  `crypto.subtle`, which a non-secure context lacks. There is no polyfill, no auth-free route for
  `/api/read` and `/api/write`, and no fallback adapter.
- **Origin:** upstream `61996dd2` (2026-03-03, first tag `v2026.3.330`) replaced the password-hash
  auth with client-signed JWTs. From source, plain-HTTP Node deployments should have worked on
  upstream up to `v2026.2.291` (traced, not built or run; some users may be secure by another
  route).
- **Consequence for D1:** every Node deployment that boots is a secure context with Web Locks
  (localhost observed; HTTPS inferred from the secure-context rule, not run). The
  only non-secure host that boots is a static build, which has no Web Locks, OPFS or
  `crypto.randomUUID`. If CHORE-49 restores plain-HTTP Node, D1 must be re-opened, because the
  revision fence would then be the only exclusivity (packet Q5).
- **Decisions:** `MC-143` 1 (the maintainer says most plain-HTTP users run Node over a LAN IP or
  VPN) cannot describe a working deployment on this code; on old upstream it should have (traced,
  not run). `MC-144` files the fix as `CHORE-49`, separate
  from memory stage 1.

## 3. The accepted plan

Mechanisms are NON-NORMATIVE unless marked "required". Invariants and scenarios are normative.
Numbers marked "non-normative" are starting values, not requirements. Items marked *(added after Gate 1; to be checked at that step's Gate 2)* were
added after Gate 1 and have not been through a plan gate.

### 3.1 Model
- **Stubs are created only by the boot pass.** Nothing creates a stub after the UI opens (M).
- **A restored character stays full until the next page load.**
- **An idle reload re-runs the boot pass** (`MC-140`), which releases the characters opened since
  the last load.
- **The stub is the existing upstream cold-storage character form, enriched.** The unit is the
  existing blob `{character}` under a fresh random UUID.
- **Unchanged:** chats inside a loaded character (a later step), modules (later), the block format,
  the encoder and `init` (`MC-133` 2).

### 3.2 Policy
- **Eligible at the boot pass** (required). A character is archived when ALL of these hold:
  - it is full;
  - it is not trashed;
  - its `chaId` does not start with `§`;
  - it is not a multi-holder after the id repair;
  - it is not the character that an idle reload is about to reopen, nor a member of that group;
  - the save's `formatversion` is 5 or higher (D10);
  - archiving is on (the opt-out, D14);
  - no V2/V2.1 plugin is enabled.
- **V2/V2.1** (`MC-132` 2):
  - with any enabled at boot, the pass archives nothing and restores every stub;
  - enabling one at runtime restores every stub before its code runs;
  - a missing unit leaves the stub, with a notice naming the character.
- **The opt-out** (`MC-136` 2, `MC-137` 3, `MC-142`):
  - A new root key, name non-normative (for example `archiveCharacters`), with three states: absent,
    true, false.
  - Absent means on: the boot pass archives and a one-time notice says so, then the key is written
    as `true`. `false` is honoured.
  - The upstream `coldstorage` field is left untouched, and its 10-day path is retired.
  - Turning archiving off archives nothing new, and existing stubs stay openable.
  - The only existing control is the `adv.coldstorage` checkbox (`bindKey: 'coldstorage'`,
    `advancedSettingsData.ts`). Step 5 rebinds it to the new key. *(added after Gate 1; to be checked at that step's Gate 2)*
- **The plugin-storage migration** (`MC-139` 4) is retired. Legacy inline plugin storage stays
  inline. The V3 consequence (V3 plugins, which read only `_coldplugin`, keep not seeing legacy
  inline plugin storage on profiles where the migration never ran) is accepted (`MC-143` 2).
- **Clean-up:**
  - Units and assets are cleaned only by the manual clean-up, in one exclusive pass (`MC-134` 3,
    `MC-139` 3). Startup runs no asset sweep once any stub exists.
  - An unreadable blob stops that clean-up, with a notice naming the character (`MC-138` 2).
  - Orphans: one unit per character restored between two loads (`MC-137` 4 as amended by `MC-140`).
- **The idle reload** (`MC-140`):
  - It fires when the characters restored since the last load add up past a threshold
    (non-normative: about 50 MB of unit payload), the pass could release them, and the app is
    quiescent and the user idle (D17, `MC-141` 1).
  - It saves first, and reloads only if nothing changed after that save's snapshot. It reopens the
    same character and chat.

### 3.3 Invariants and acceptance scenarios (normative)

Red-first where the behaviour is new or fixed. Guards are labelled `guard:`.

- **D1: the boot pass runs under exclusive access.**
  - **Web, including the Node server (every Node deployment that boots is a secure context, ledger
    row 485):** the exclusive presence lock is taken before the main file is read and held until
    the commit resolves. This is the
    `AutoStorage` boot-copy shape. A tab opened meanwhile waits, then reads the settled outcome.
  - **Node server:** the revision is an additional fence against other devices. A 409 discards the
    pass result, and the app opens on the current file with no data lost. The orphaned units are
    accepted. They are bounded by D18 only with batch commits; with the breaker alone, a second
    device that stays active adds a full set every other boot.
  - **Tauri:** single instance.
  - **A web host without Web Locks** (a non-secure context, so no OPFS): the pass archives
    nothing. Observed (row 485): the Node server does not boot over plain HTTP on this code
    (`CHORE-49`), so the only non-secure host that boots is a static build. The pass is gated on
    capabilities, not on the platform: on web, Web Locks plus either OPFS writes or the Node server;
    on Tauri, single instance.
    *(added after Gate 1; to be checked at that step's Gate 2)*
  - **Unit ids** come from `uuid` v4, never `crypto.randomUUID()`, which is absent in a non-secure
    context. *(added after Gate 1; to be checked at that step's Gate 2)*
  - **On a host with no unit backend,** a stub's unit read reports "unavailable", never "missing".
    *(added after Gate 1; to be checked at that step's Gate 2)*
  - **The commit is the pass's own fenced write,** performed while the pass holds `dbWriteLock` and
    the exclusive presence lock. It carries the Node revision and posts the same cross-tab broadcast
    that `saveDb` posts. It does not go through `saveDb`'s loop, because `dbWriteLock` is not
    re-entrant and `saveDb` has not started yet.
  - **Node limit:** a batch commit is made only once the encoded tree is under the server's upload
    limit (`'100mb'` in `server.cjs`, 104,857,600 bytes). If archiving everything eligible still
    leaves the tree over it, the pass stops without writing units on later boots and shows a
    notice. It does not write a full set of orphans every boot.
  - **On any commit failure (a 409 or otherwise), the pass re-reads the main file and the app opens
    on what it holds.** The pass result is discarded. This covers a commit that landed but whose
    response was lost.
  - The commit updates the same last-commit record that `saveDb` and D11 use (today's unused
    `lastDbData`, or its replacement).
  - The pass encodes before `setDatabase`, so it passes the user's `enableRemoteSaving` to the
    encoder explicitly and does not read it from the live database (`risuSave.ts`).
  - *Scenarios:* tab B opens during tab A's pass, and B's saves are never overwritten; a Node peer
    saves during the pass, giving a 409, nothing lost, and the app opens; no locks and no Node,
    nothing is archived.
- **D2: unit before pointer.** The commit contains a stub only if its unit write succeeded before
  the commit began. A failed unit write leaves the character inline and stops the pass. Characters
  already archived stay archived.
- **D3: monotonic (invariant M).** After the UI opens, no code path creates a stub or replaces a
  full character with one. This includes:
  - plugin setters (no-downgrade: an incoming stub is refused when the live `chaId` is full, when
    the live stub has a different key, or when the `chaId` does not exist);
  - `loadInternalBackup`: it writes the chosen snapshot as the main file and reloads, and the boot
    pass then runs under D1. There is no runtime pass;
  - any `makeColdData` remnant.
  - *Evidence:* the round-4 reviewer's own grep found no path after the UI opens beyond those named
    (section 5, item 6). The full `code-searcher` sweep for stub creators (advisor-3 NEXT 6) is
    part of step 3's audit and step 5's creator check, and is not done yet.
- **D4: writers that can target a stub.** Such a writer restores first, finds the character again by
  `chaId` after the restore, then writes and marks. A failed restore refuses the write, with an
  error the caller sees. An incoming stub for a `chaId` that does not exist is refused.
  - Sites: V3 `setChatToIndex` (W8), the seven MCP write tools (W13), and `playgroundChat` (W16,
    which goes through `changeChar`, while `§` ids are never archived).
  - The step-3 audit lists every writer that can reach a non-selected character. Under M, a writer
    holding a full object needs nothing (W17, `AssetInput`).
  - *Scenarios:* an MCP write to an archived character lands in the character; a V3
    `setChatToIndex` on a stub lands; a failed restore gives the caller an error.
- **D5: readers of archived characters.**
  - `getCharacterFromIndex` and `getChatFromIndex` return full data from a copy, without installing
    it. `getDatabase('all')` returns stubs (`MC-136` 3).
  - MCP read tools answer from the blob. `exportAsDataset` streams blobs. `verifyAssetIntegrity`
    covers archived characters.
  - None of them returns a stub's default-filled empties as data.
- **D6: the stub shows correctly.** It carries the real `type`, `name`, `image`, `chaId`,
  `lastInteraction`, `trashTime`, a chat count, `creatorNotes` (truncated, non-normative),
  `characters` for groups, `coldStoragedChats` and a version marker. The grid description, the
  mobile count and sort, and the select-character dialog match the full character.
- **D7: trash.** Trashed characters are not archived. A stub un-trashed and then opened stays
  un-trashed; a stub trashed and then opened stays trashed (the stub's `trashTime`, applied at
  restore for v2 stubs). An upstream-made stub restores unchanged.
- **D8: groups.** Selecting a group restores every stub member before the group screen reads them.
  `addGroupChar` restores the member it adds. Under M they stay full until the next load. No blank
  greeting is created from a stub.
- **D9: ids are repaired before archiving.** A duplicate `chaId` in the raw payload is repaired
  first, so the stub and the blob agree. A re-id'd upstream stub whose blob mismatches is logged.
- **D10: file and memory agree after boot.** After the pass, the committed main holds exactly the
  stubs memory holds. Blobs carry the normalised fields (`normalizeCharacterShell`, extracted from
  `checkNewFormat`), gated on `formatversion >= 5`. `isStreaming` is reset in the blobs.
- **D11: the manual clean-up is one exclusive pass.**
  - It holds the exclusive lock on web with locks; it asks for confirmation without locks, as
    `LoadLocalBackup` does. It refuses to start while any work or busy action (D17's registry) is in
    progress, and the UI is blocked while it runs.
  - **Units:** a unit is deletable only if it was present in this page's load-time listing AND is in
    the listing taken at the start of the clean-up. A unit written after this page loaded (plugin
    storage, another device's archive) is never deleted. The load-time listing must complete before
    `loadPlugins` runs. The same rule applies to assets (optional hardening, adopted).
  - **Assets:** the keep-set covers the sources of today's startup sweep (live memory: characters,
    modules, personas, root) plus every blob. Just before each deletion batch, the live references
    are read again in the same synchronous step, and any asset referenced now is kept.
  - It computes both keep-sets by reading each blob once, one at a time. The units it keeps are those
    referenced by live memory, the committed `database.bin` and every retained `dbbackup-*.bin`. It
    follows stub -> blob -> inner chat keys and legacy error keys, and `_coldplugin`.
  - It uses a strict decode that aborts on a dropped block, an unparsed block, a missing REMOTE file
    or a directory entry answered from the cache.
  - It refuses when the main file changed since this tab last loaded or committed it, and stops on
    an unreadable blob with a notice naming the character.
  - Its dialog warns against running it while another device uses the same Node server. On a shared
    Node server, a unit another device wrote before this page loaded and has not yet committed may
    be deleted. This is accepted (`MC-141` 2).
  - *Scenarios:* a plugin-storage unit written during the clean-up is kept; an asset added to a
    loaded character during the clean-up is kept; a unit referenced only by the committed main is
    kept; a unit referenced only by the oldest retained snapshot is kept; a missing REMOTE file
    aborts; an asset referenced only inside a blob is kept.
- **D12: startup runs no asset sweep once any stub exists** (`MC-139` 3). A profile with no stub
  keeps today's startup sweep.
- **D13: a backup is consistent.** The backup collects each blob's inner pointer keys and legacy
  error keys from the value it reads, and drops `value` retention. The idle reload does not fire
  during a backup, a partial backup or a backup load. *Scenario:* a blob containing a legacy
  error-text chat carries that key into the backup.
- **D14: the opt-out key.** Absent means on, with a one-time notice. A later `false` survives
  reboots, a fork-backup round trip and an upstream round trip. `false` archives nothing new and
  keeps stubs openable. The `adv.coldstorage` checkbox (`bindKey: 'coldstorage'`,
  `advancedSettingsData.ts`) is the only existing control; step 5 rebinds it to the new key
  *(added after Gate 1; to be checked at that step's Gate 2)*. *Scenarios:* start from absent, from `true` and from `false`.
- **D15: the plugin-storage migration never runs.** Legacy inline plugin keys stay inline after any
  boot.
- **D16: V2/V2.1** as in 3.2. *Scenarios:* enabled at boot, all stubs are restored and nothing is
  archived; enabled at runtime, every stub is restored before the plugin's code runs; a missing unit
  gives a notice.
- **D17: the idle reload** (`MC-140`, `MC-141` 1). It fires only when all of these hold:
  - the restored-bytes threshold is crossed;
  - the next pass could release something: archiving is on, no V2/V2.1 plugin is enabled, the D18
    breaker is not armed, and this is the only tab;
  - the user has been idle (no pointer, key, touch, wheel, scroll or IME composition events) for the
    dwell (non-normative: 2 minutes), and the window has focus and is visible;
  - no work is registered anywhere (`hasWorkIn`, generation, send);
  - no busy action is registered. Step 6 builds an enumerated busy registry; each user-initiated
    async action that writes on completion registers there and deregisters in `finally`:
    `addCharEmotion`, `selectCharImg`, `makeGroupImage`, `AssetInput`; imports and exports; image
    generation and TTS; V3 plugin storage writes; MCP tool loops; backup, restore and clean-up;
    anything else step 6's audit finds;
  - no alert, prompt, modal or MCP confirmation is open;
  - there is no unsent composer draft that would not survive a reload (the `multiTabReload.ts`
    draft guards);
  - no `chaId` is frozen, and saving has not been stopped (`savingStoppedReason`);
  - no in-flight call is counted at the choke points `saveAsset`, `setColdStorageItem`, the file
    pickers and the V3 host bridge;
  - the final save succeeded AND nothing has changed after that save's snapshot. "Changed" covers
    everything the next save would write, including `requiresFullEncoderReload`, which `removeChar`
    sets. The change counter and the reload call are checked in the same synchronous task.

  Every condition must hold continuously for a few seconds (non-normative: 5 s). This closes the
  gaps between the alert phases of a long import.
  - **Accepted residual:** a plugin holding unfinished work invisibly between host calls. A missed
    busy entry loses one unfinished action, as closing the tab would. It never loses saved data.
  - **The reload target:** a clean URL, through the same `history.replaceState` + `location.reload()`
    pair that `backuplocal.ts` uses. That precedent keeps the fragment and drops the whole query, and
    its Tauri path uses `relaunch()`; the whole-hash strip and the Tauri path here are new. The whole
    hash is stripped (`#import_module=`,
    `#import_preset=`, `#share_*`, ...), and the `realm` and `charahub` query parameters are
    stripped, so no launch action runs again. On Tauri, the update prompt is skipped on an idle
    reload. Whether an installed web app's `launchQueue` re-delivers launch files after a reload is
    checked by observation in step 6.
  - After the reload, the same character and chat are open, and the pass kept that character (and
    its group's members) inline. It never loses data: if a save fails, or anything changed after the
    final snapshot, it does not reload. At most one reload per interval (non-normative: 10 minutes).
  - *Scenarios:* threshold crossed while a reply is generating, no reload until it ends; a draft in
    the composer, no reload; typing during the final save, no reload; a frozen key, no reload;
    `addCharEmotion` pending, no reload; a save failure, no reload; launched with
    `#import_module=`, the idle reload imports nothing again; after the reload, the heap is back
    near the post-boot level (measured in D20).
- **D18: boot liveness.** An interrupted pass loses nothing, and the next boot opens the app. Two
  mechanisms, chosen by measurement (advisor-3 NEXT 2): resumable batch commits under the hold; a
  crash-loop breaker that skips one pass, with a notice. A 409-aborted pass arms the breaker. The
  breaker also covers the V2/V2.1 restore-all, so a crash inside it does not repeat every boot.
- **D19: the Playground and `§` ids are never archived,** and opening the Playground never selects
  a stub.
- **D20: measurement** (`perf-analyzer`, not vitest), on `real2` (seed 1) and on `s1000`, on the
  2 GB AVD: first-boot pass wall time and peak; later-boot time; heap after boot; `changeChar`
  latency for the largest blob; an idle-reload cycle after opening 100 characters; the batch-commit
  cost; the page-load listing cost (D11); the backup peak with about 495 blobs.
- **D21: the 10-day paths are retired.** The idle-days chat path and the character path in
  `makeColdData` no longer run.

### 3.4 Steps (each its own implementation and Gate 2)

| # | Step | Covers | Gate 2 tier |
|---|---|---|---|
| 1 | Manual clean-up as one exclusive pass; the page-load listing is taken before `loadPlugins` | D11, D12 | `opus-reviewer` |
| 2 | Stub v2 and restore module; `changeChar` and `coldMemberRestore` use it; the `MobileCharacters` count and the `GridCatalog` description | D6, D7, D9 (restore side) | `opus-reviewer` |
| 3 | Consumers and writers: the stub-writer audit, MCP, V3 hydrate and restore-first, no-downgrade, V2/V2.1 restore-all in `loadPlugins`, group member restore, the Playground, `exportAsDataset`, `verifyAssetIntegrity` | D3 (setter part), D4, D5, D8, D16 (runtime), D19 | `adversarial-reviewer`; `opus-reviewer` for the plugin and MCP write paths |
| 4 | Backup: inner keys from blobs; drop `value` | D13 | `opus-reviewer` |
| 5 | Boot pass: the four boot install sites; `loadInternalBackup` writes the snapshot and reloads, keeping the write lock closed until the reload as `LoadLocalBackup` does, so a queued `saveDb` write cannot undo the load; the notice names the settings toggle it points to; the stale `coldstorage` help text (`en.ts` and the other languages) is fixed; the exclusive hold; the fenced commit; the opt-out key and notice, with the `adv.coldstorage` checkbox rebound to the new key *(added after Gate 1; to be checked at that step's Gate 2)*; the migration and the 10-day paths retired; progress; the `MC-138` 1 two-device Node case documented for users *(added after Gate 1; to be checked at that step's Gate 2)*; the D1 capability gate, `uuid` v4 unit ids and "unavailable" wording *(added after Gate 1; to be checked at that step's Gate 2)* | D1, D2, D3 (creator part), D9, D10, D14, D15, D16 (boot), D18, D21 | `opus-reviewer` |
| 6 | Idle reload: the busy registry and choke-point counters, the continuous-hold rule, the clean-URL reload, the `launchQueue` observation | D17 | `opus-reviewer` |
| 7 | Measurement | D20 | none: `perf-analyzer` runs it, and there is no Gate 2 |

- Steps 1-4 land before step 5. Until step 5 lands, no new archiving path exists, and the existing
  10-day path still archives profiles that have the flag on. Step 6 lands after step 5.
- New code goes into new modules: 43 test files `vi.mock` `coldstorage.svelte.ts` (47 mention it;
  counted at Gate 1).

### 3.5 Compatibility
- The pointer format, blob shape, block format and encoder are unchanged. Upstream ignores extra
  stub fields and the new root key, and copies that key through its encoder (Gate 1 round 4 read
  `upstream/main`'s `set()` and decoder: **read, not executed**).
- A fork backup restores on upstream, except on an upstream web build without OPFS `createWritable`.
  There the units fail to restore, and when upstream's `coldstorage` flag is false, upstream's next
  startup sweep also deletes the archived characters' assets. That makes the inline-everything backup (stage 2) **required** before a fork
  backup is offered for such a target.
- V3: `getDatabase('all')` returns stubs, as upstream does. Single-character calls return full data.
- An upstream tab open on the same origin at the same time is a pre-existing hazard for every save
  and is not designed for.
- Upstream backups and characters keep working: the stub and blob shape and the whole-slot restore
  match upstream's (Gate 1 round 2 read `upstream/main`; read, not executed).

### 3.6 Risks for the Gate 2 reviewers to attack
1. Is M really monotonic: is there any stub creator or downgrade path after the UI opens?
2. D1 on each environment: is the exclusive hold held from before the read to after the commit at
   each of the four boot install sites? `loadInternalBackup` writes the snapshot and reloads, so it
   goes through a boot install site.
3. D17 quiescence: which in-progress state is missing from the list, and what is lost if a reload
   fires during it?
4. D4: is the audit's writer set complete for writes to non-selected characters that can reach a
   stub?
5. D11: an exclusive clean-up while the Node server is shared by another device (accepted residual,
   `MC-141` 2).
6. D14's round trips through upstream.

### 3.7 Out of scope
- a runtime archive engine (not planned; advisor-3 DO NOT);
- per-chat archiving inside a loaded character;
- the long-chat display window;
- modules (after stage 1 and the inline-everything backup, `MC-145`);
- streamed and inline backup (stage 2);
- the Node streamed write (stage 3, CHORE-46; re-measure first);
- reuse of unchanged units, with an existence check (a later stage, `MC-137` 4);
- inlays in backups (CHORE-48);
- the missing-unit pointer-chat retainer (a follow-up, ledger 474);
- the Android wrapper: it gets its own review of D1 (Tauri's single-instance guarantee is checked
  for desktop only, per Gate 1 round 3).

## 4. Gate record

Reviewer for every round: `opus-reviewer`. Round 4 was a fresh reviewer (row 481). Rounds 3 and 5
are re-checks by the reviewer of the preceding round; each cites its own earlier review. Rounds are read-only source reviews: nothing was
executed except read-only `git`, `grep`, `sed` and `wc`. Every gate here is a Gate 1 (plan review).
Verdict tokens are the reviewer's. Ledger rows 478-482 record the five rounds (question, reviewer,
tokens, findings).

| Round | Plan | Verdict | Ledger row | Disposition |
|---|---|---|---|---|
| 1 | Per-chat plan (`stage1/plan.md`) | [REJECT] | 478 | Plan superseded after the real profile (row 470) and advisor-2 (row 472). B2 and B4 carried over to the character grain unchanged; B1 does not arise there if the nested walk covers live, committed and snapshot stubs; B3 (unit reuse) dropped from stage 1. |
| 2 | Character grain r1 | [REJECT] | 479 | r2 written: an asset-sweep scanned-set fence (r2 plan's C15), a re-resolve rule for writers after an await (C20), a plugin-migration gate (C21), a sole-tab rule (C22), a reset marker (C23), V2/V2.1 at runtime (C24), boot liveness (C25). |
| 3 | Character grain r2 | [REJECT] | 480 | Third substantive rejection in a row: escalated to `senior-advisor` (row 475), which found the runtime engine to be the mechanism at fault. |
| 4 | r3 (no runtime engine; startup-only pass plus idle reload) | [REJECT] | 481 | r4 written; `MC-141` recorded the maintainer's decisions on both blockers. |
| 5 | r4 | [EDITORIAL] | 482 | Corrections applied by the Orchestrator (plan section 10); not yet re-verified. The reviewer's file records no re-read of the corrected text. |

### Round 1: per-chat plan (four blockers; 16 non-blocking, 4 editorial)
- **B1:** legacy error-text chats were eligible for archiving, which buries their recovery key, and
  the in-use set dropped error keys (chat content unrecoverable after a clean-up).
- **B2:** the clean-up's in-use set omitted the committed `database.bin`, other tabs and other
  devices (a failing main write, a second Node device, an in-flight unit).
- **B3:** unit reuse re-pointed at a key it never re-verified, and a literal reading of the abort
  rule deleted a reused key.
- **B4:** "any unreadable snapshot aborts the clean" cannot fire through `decodeRisuSave`, which
  skips dropped blocks and absent REMOTE files, and answers a directory entry from the cache.
- Also found (non-blocking): I13 holds without any marks, because `init` records nothing that
  suppresses the first write; MCP `getChatHistory` and the branch view read pointers; the archive
  swap arms a dirty save.

### Round 2: character grain r1 (four blockers; 11 non-blocking, 8 editorial)
- **B1:** a writer that holds a character across an await writes into a detached object once the
  character is archived; the MCP write tools do this on every call with an `id`.
- **B2:** the startup asset sweep, run over every stub, skips a character when the array is
  spliced during the keep-set build, and deletes that character's assets.
- **B3:** the `MC-137` 1 reset turns on `makeColdData`'s plugin-storage migration for V2/V2.1 plugin
  users, whose plugins then read empty storage.
- **B4:** the first-boot pass widens the tab-boot/peer-save race from seconds to minutes, and the
  commit right after the pass has no fence.
- Held as sound: upstream compatibility of the stub and blob shape.

### Round 3: character grain r2 (four blockers; 6 non-blocking)
- **R2-B1:** the scanned-set fence does not catch an asset added to an inline character scanned
  earlier in the same sweep.
- **R2-B2:** the sole-tab rule is checked at the start of the pass, but a tab that opens during it
  can save before the commit.
- **R2-B3:** the plan does not say what "the only tab" means when Web Locks are unavailable.
- **R2-B4:** the reset marker is written only when a reset happens, so a user's first opt-out on a
  profile saved `true` is overridden.

### Round 4: r3 (two blockers; 9 non-blocking)
- **B1:** D17 as written let the reload drop edits: an edit during the final save, a frozen key
  (saving paused yet every save "succeeds"), and in-flight actions with nothing registered.
- **B2:** D11's clean-up was concurrent with this page's own writers (a plugin-storage unit written
  mid-walk, an asset added mid-walk, a second Node device), so R2-B1 was not "removed by
  construction".
- The reviewer held that no stub creator exists after the UI opens other than those the plan names
  (its own grep; see section 5).

### Round 5: r4 ([EDITORIAL]; no blocker)
- **R1** (required): D1's claim that `saveDb`'s normal retry writes the main file after a failed pass
  commit is false; `saveDb` writes only when a mark set `changed`. Corrected to "re-read the main
  file and open on what it holds".
- **R2** (required wording): `loadInternalBackup` must keep the write lock closed until the reload.
- **R3** (required precision): define "nothing changed" to cover everything the next save writes;
  require continuous quiescence; count in-flight calls at choke points; include wheel and scroll.
- **R4** (required precision): the page-load listing is taken before any plugin code runs.
- **R7** (required): stale lines in plan sections 6 and 8, and the store name `savingStoppedReason`.
- **Non-blocking:** R5 (the exact Node limit and stop rule), R6 (the clean-URL mechanism).
  **Optional:** O1 (page-load listing for assets) adopted; O2 (collect asset references from
  snapshots) not adopted, so snapshot assets stay a gap as in today's sweep.
- The reviewer confirmed the pass's commit is consistent with `saveDb` for the Node revision, the
  dirty flags and the broadcast, and named two missing pieces (the last-commit record and the
  explicit `enableRemoteSaving`), both now in D1.

### Where each finding landed in r4 (plan sections 8-10)
- **Removed by construction (no runtime engine):** rounds 2-3's B1 for full holders, the pins, the
  engine pause, and the engine parts of the sole-tab rule.
- **B1 for stubs:** D4. **B2 and R2-B1:** D11 and D12. **B3:** D15. **B4, R2-B2, R2-B3:** D1.
  **R2-B4:** D14 (a three-state key, no marker). **Boot liveness:** D18. **Round 4's B1:** D17.
  **Round 4's B2:** D11. **Round 4's N6:** D3 and step 5. **Round 5's R1-R7, N3:** plan section 10.

## 5. Open items and follow-ups

1. **The missing-unit pointer-chat retainer** (ledger 474). After the `senderIcon` fix, switching to
   a cold-storage pointer chat whose unit is **missing** keeps the array (+27.3 MB with or without
   the fix). Clicking another chat releases it with the fix (78.6 -> 52.2 MB) but not without it. Two routes hold `DefaultChatScreen`'s stale
   `currentChat` value: a module-level `draftsChangedListeners` closure, and the
   `{#await preLoadChat}` block created in the switch batch. A scratch variant that changes both
   frees it (+0.2 MB; one machine, an i9-13900K). Out of plan scope (3.7). **Decision needed:**
   an app-level fix for both routes, or a Svelte `patchedDependencies` patch, which `MC-136` 4
   considers only if a measurement shows other screens still hold memory.
2. **A rejected avatar image leaves no icon** (pre-existing; found in the `Chat.svelte` fix's
   Gate 2 by `adversarial-reviewer`). A pre-rejected `img` promise in `Chat.svelte`'s `senderIcon`
   `{#await}` has no `{:catch}`, so it produces an unhandled rejection and no icon element at all.
   It is identical before and after `ccf45c53`. A real rejection source such as `getFileSrc` was
   not investigated.
3. **The inline-everything backup (stage 2) is required** before a fork backup is offered for an
   upstream web build without OPFS `createWritable` (3.5). A related unmeasured figure: the backup
   holds about 290 MB for 495 units (arithmetic in row 473, not measured), and advisor-2 said that
   if the backup peak is over today's decode peak, stage 2's streaming comes before archiving is on
   by default. The scoping packet (S6, row 473) estimates the peak at about 415 MB after stage 1
   against about 450 MB today (inferred), so stage 1 does not materially lower the backup peak (about 415 against about 450 MB, both
   inferred); dropping `value`
   (D13) gives about 240 MB (inferred). D20 now lists the backup peak with about 495 blobs.
4. **CHORE-46 re-measurement.** The estimated 41-46 MB main file is under the Node server's 100 MB
   limit, so advisor-2 demoted the streamed `/api/write` to "measure after stage 1". D1's Node limit
   rule leaves a profile that stays over the limit archiving nothing on later boots.
5. **Measurements D20 needs** (D20 lists eight):
   - first-boot pass wall time and peak, on `real2` (seed 1) and `s1000`, on the 2 GB AVD;
   - later-boot time; heap after boot; `changeChar` latency for the largest blob (advisor-2 NEXT 3:
     over about 300 ms would raise a size-threshold question to the maintainer);
   - an idle-reload cycle after opening 100 characters;
   - the batch-commit cost, which decides the D18 mechanism (advisor-3 NEXT 2: `init` + `encode` per
     batch on `real2`, desktop and AVD);
   - heap in the built app with stubs against today (advisor-2 NEXT 2; if modules are over about
     30% of what remains, pull the module item forward);
   - the page-load listing cost (D11), one listing per boot including each idle reload (Gate 1
     round-5 R4);
   - the backup peak with about 495 blobs (item 3).
6. **The `code-searcher` sweep for stub creators** (advisor-3 NEXT 6) is not done yet. It is part of
   step 3's audit and step 5's creator check. Until then, the evidence is the round-4 reviewer's own
   grep: every `.coldstorage =` or `coldstorage:` write is inside `makeColdDataForCharacter`, and the
   whole-tree replaces at `setDatabase` sites are covered by no-downgrade.
7. **Not carried into the plan from advisor-3:** NEXT 5 (lock survival when a mobile tab is
   discarded mid-pass). NEXT 1 was answered by `MC-139` 2 (hundreds of characters a session), and
   NEXT 3 no longer applies (the sweep moved).
8. **Plan-time observations still open:** the `launchQueue` behaviour after a reload (step 6); the
    D14's upstream round trip was read in source, not run. The plain-HTTP Node question is settled
    by observation (row 485; section 2), except that HTTPS was not run.
9. **The Android wrapper** needs its own D1 review (3.7).
10. **Later stages.** `MC-136` 1 and 4 fix the retainer first and put per-chat archiving after the
    long-chat display work (`MC-134` 4's 16 KB applies there). The rest of advisor-2's order (list
    and avatar browsing) is its proposal, not a recorded decision. `MC-145` (amending `MC-143` 3)
    records the order after stage 1: the upstream-compatible inline-everything backup first, then
    archiving of modules that are not enabled, then the rest of stage 2. Advisor-2 said modules
    need a new blob kind and that the inline backup comes first because upstream has no module
    stub form.
11. **Node over plain HTTP** does not boot on this code (row 485; section 2). `CHORE-49` (`MC-144`)
    is filed in the Roadmap, not fixed and not scheduled. If it lands, D1 must be re-opened.

## 6. Related

**The separately gated `Chat.svelte` retainer fix (`MC-136` 4; ledger rows 471 and 474).** It is not
part of this plan. Committed as `ccf45c53`.
- **What it fixes.** Row 468 found that after a chat switch about 28 of 46.6 MB stayed until another
  character was selected. Row 471 measured the retainer: the array is the chat-switch batch's old
  value of `DefaultChatScreen`'s `currentChat` derived, pinned by exactly one block, the greeting
  `Chat`'s `senderIcon` `{#await img}`. The earlier inference that it was `ChatBody`'s
  `{#await markParsingResult}` (row 469) is refuted. The fix creates that block one microtask after
  mount.
- **Verification (row 474).** After the swap, the heap is +0.9 MB above baseline with the fix and
  +28.0 MB without it; the array's WeakRefs are collected. With a real avatar, five cases give
  identical outerHTML and layout and pixel-identical screenshots. One machine, i9-13900K, headless
  Chrome 154, svelte 5.56.8, synthetic data.
- **Why it matters here.** Advisor-2 noted that this retainer defeats character archiving's release
  for the last-left character; `MC-136` 4 puts the fix first. It is independent of this plan's steps.
- **The commit.** `ccf45c53`, "fix(chat): switching chats no longer keeps the previous chat's
  messages in memory": `Chat.svelte` (12 lines added) and the new
  `Chat.senderIconMount.svelte.test.ts` (`git show --stat`).
- **Its Gate 2** (`adversarial-reviewer`; ledger row 483):
  - Code review: [APPROVE]. The invariants were checked by mounting the real `Chat` old and new.
    Optional notes on the comment's placement and indentation.
  - The committed test's review: [APPROVE]. Mutants such as `setTimeout(0)`, binding the await at
    mount, and `{#if false}` fail the reproducer or the latest-wins guard. Two optional
    test-strengthening notes were not applied: the unmount guard asserts only through vitest's
    unhandled-error channel, and a swap after the await exists is not covered.
  - Found in passing: the rejected-avatar defect (section 5, item 2).
- **Still open after the fix:** item 1 of section 5.
