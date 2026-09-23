# Stage B plan — partition the modules dirty-tracking effect

**STATUS:** implemented (`847bb8e8`)

Status: **GATE 1 PASSED — [APPROVE-WITH-FINDINGS] (opus-reviewer, 2026-09-21). All 7 findings
folded in below. Nothing implemented.** **[corrected 2026-09-23]** This is stale: the partition shipped as `847bb8e8`. (Ledger row 11's post-implementation review of "the partition diff" could only exist if the code had shipped.)
The reviewer could not construct a missed-mutation path and proved dependency-closure equivalence
against Svelte 5.55.1 source. Its findings were in this document's claims and test plan, not in the
design. Gate record: section 8.
Branch `fix/persistence-conflict-platform-hardening`, base HEAD `afcb4e09`.
Review tier: `opus-reviewer` — this touches the effect that gates whether modules are written to
disk at all, so the failure mode is silent data loss.
Supersedes: `Agents/Reports/10-stage-b-module-draft-copy-plan.md` (draft-copy design, rejected at
two gates, retired on a senior-advisor escalation; its sections 8-10 hold the evidence).
Predecessor: Stage A, `f4867e63`.

## 1. Problem, measured

`src/ts/storage/dbChangeEffects.svelte.ts:33-38` deep-reads the **entire** modules array and sets
one boolean:

```
$effect(() => {
    $state.snapshot(DBState.db.modules)
    opts.tracker.modules = true
    opts.markChanged(ranOnce2)
    ranOnce2 = true
})
```

Its dependency closure is the whole array, so **one leaf write re-walks every module**. Editing a
single character in one module's name pays for all of them.

Measured in the live app (dev build, real `input` events, module editor open, mutations restored
and verified):

| Modules | Input -> layout, median | vs 16.7 ms frame budget |
|---|---|---|
| 52 | 13.2-13.7 ms | 79-82% |
| 104 | **25.1 ms** | **150%** |

Ratio 52 -> 104 is **1.9x** — the cost is O(modules). Cost breakdown at 52 modules:

| Component | Cost | Share |
|---|---|---|
| Effect flush (editor closed) | 11.5 ms | **84%** |
| DOM / render (editor open delta) | ~2.2 ms | 16% |

**The effect is the cost, not the DOM.** That was the open question that had to be settled before
planning, and it is settled.

### 1.1 Hardware — every number above is a best case

All measurements were taken on an **Intel i9-13900K / RTX 3090 / 64 GB DDR5**. RisuAI targets
Raspberry Pi self-hosting and mobile/PWA, where single-threaded JS is several times slower.

**This plan does not claim the partition brings anyone inside the frame budget except on a
high-end desktop.** What is hardware-independent is the *ratio*: the win comes from doing less
work (skipping N-1 modules), not from doing work faster, so the factor holds everywhere while only
the residual varies. Absolute savings are *larger* on slow hardware, so the users helped most are
those on the weakest devices.

### 1.2 User-visible symptom, reported by the maintainer

The freeze occurs while typing in a module text field. The community workaround is to compose text
elsewhere and paste it in once, and a community plugin exists that opens a separate text window and
commits only on "done". Character definitions and character lorebook entries do **not** have this
problem — see section 2.

## 2. Why modules and not characters — and why this is NOT the character pattern

The maintainer reports that this freeze once affected every text field, and that character
definitions and character lorebooks no longer suffer it while modules still do. The current-state
difference is visible in this same file:

| | Characters | Modules |
|---|---|---|
| Generic deep-read loop | **excluded** (`:64` `key !== 'characters'`) | n/a |
| What is deep-read | only `DBState.db.characters[selIdState]` (`:70-86`) — the selected one | the **whole array** (`:34`) |
| Tracker shape (`risuSave.ts` `toSaveType`) | per-entity: `character: string[]`, `chat: [string,string][]` | one flag: `modules: boolean` |

**This is NOT "the same pattern applied to modules", and an earlier draft of this plan said so
wrongly (gate finding F-1).** The character mechanism is **selection-based narrowing**. This change
is **partitioning without narrowing**. Different mechanisms, opposite safety properties, and the
distinction must survive into the commit message.

**The character mechanism is in fact an example of the hazard, not a model of the fix.**
`tracker.character` is written in exactly one place -- `dbChangeEffects.svelte.ts:77-78` -- gated on
`selIdState`. `risuSave.ts:285-308` re-encodes a character only when its `chaId` is in
`toSave.character`; otherwise it reuses the existing block, encoding only when no block exists yet
(`else if(!this.blocks[character.chaId])`). **So a mutation to a non-selected character that already
has a block is not re-encoded.** Reachable by anything writing to a character other than
`selectedCharID` -- plugin, MCP/risuaccess, trigger, or bulk operation. Verified by the
orchestrator; logged as a separate finding in section 8 and explicitly **not** fixed here.

What the character code legitimately supplies is the *current-state contrast* in the table above:
modules are the only large collection still deep-read wholesale on every keystroke. That is the
motivation. It is not a safety precedent.

**History note (gate finding F-6).** An earlier draft asserted "characters were fixed while modules
were not". `git log -S "key !== 'characters'"` gives `b4d08b1f` ("fix save lag"), which introduced
the entire effect-based tracker with character scoping **already present** -- there was no later
"characters got fixed" event. The maintainer's report describes the user-visible outcome
(characters do not freeze, modules do), which is accurate; the historical mechanism claim was not.
Do not state it as history in a commit message.

**Do NOT copy the character mechanism.** Characters scope by a global selection
(`selectedCharID`) plus per-entity save blocks. Modules have neither:

- There is no global "module being edited" — the editor's state is component-local.
- `risuSave.ts:328-334` encodes modules as **one monolithic block** (`JSON.stringify(data.modules)`).

Scoping modules by a selection would therefore be **unsafe**: mutations from import, delete,
toggle, or a plugin would be missed, and a missed mutation is never written to disk. Per-element
child effects cover every element and assume no selection, which is why this change is strictly
safer than the character mechanism -- and why it is deliberately not modelled on it.

## 3. Verified facts

Re-verified by the orchestrator against source at `afcb4e09`.

| # | Claim | Evidence |
|---|---|---|
| F1 | The modules effect deep-reads the whole array and sets one boolean | `dbChangeEffects.svelte.ts:33-38` |
| F2 | That boolean gates whether the block is encoded at all | `risuSave.ts:328-334`, `if(toSave.modules)` |
| F3 | Modules are ONE save block; characters/chats are per-entity | `toSaveType` in `risuSave.ts` |
| F4 | Characters are excluded from the generic loop and scoped to the selection | `dbChangeEffects.svelte.ts:64`, `:70-86` |
| F5 | Nested `$effect` is legal | `node_modules/svelte/src/internal/client/reactivity/effects.js:53-63` — `validate_effect` throws only with no active effect/reaction, or during teardown |
| F6 | These effects run inside an `$effect.root` | `globalApi.svelte.ts:606-608` |
| F7 | `markChanged` is `saveTimeoutExecute`, a 500 ms **trailing** debounce that re-arms on every call | `globalApi.svelte.ts:591`, `:594-604` |
| F8 | First run must not mark dirty | `dbChangeEffects.svelte.ts:6-7` contract; every effect passes `ranOnceN` |
| F9 | A shallow read here has already caused real data loss | `:19-24` comment on the presets effect, from `8bc0f426` — the in-tree warning against narrowing |
| F10 | `$effect` overhead of N children vs 1 is below measurement noise | shape-change 0.92-1.01x across N=52 and N=104, `module-effect-overhead-bench.harness.ts` |

## 4. Proposed change

**One file: `src/ts/storage/dbChangeEffects.svelte.ts`. One effect. No other file changes.**

Replace the single modules effect with an outer effect over array *shape* plus one child effect per
element that deep-reads only that element:

```
let modulesRanOnce = false
$effect(() => {
    const mods = DBState.db.modules
    const len = mods?.length ?? 0          // shape: push/splice/whole-array replacement
    for (let i = 0; i < len; i++) {
        const m = mods[i]                  // element identity: modules[i] = {...}
        if (!m) continue
        let childRanOnce = false
        $effect(() => {
            $state.snapshot(m)             // deep-read THIS element only
            opts.tracker.modules = true
            opts.markChanged(childRanOnce)
            childRanOnce = true
        })
    }
    opts.tracker.modules = true
    opts.markChanged(modulesRanOnce)
    modulesRanOnce = true
})
```

Key properties:

- **`tracker.modules` stays a single boolean, set by the outer and by every child.** Save behaviour
  is bit-for-bit identical to today: any module mutation re-encodes the whole modules block.
  **No save-format change, no migration, no compatibility risk** (F2, F3).
- **The dependency closure is preserved, not narrowed.** Every element is still deep-read; the
  reads are merely partitioned across effects. This respects F9's warning — narrowing loses writes,
  partitioning does not.
- **Shape changes are covered by the outer effect**, which reads `length` and each `mods[i]`
  identity — the same reads Stage A's `moduleUpdateDeps.ts:31-33` already relies on.

### 4.1 The delicate part — first-run semantics

F8 requires that an effect's first run not mark dirty. Children are torn down and recreated
whenever the outer re-runs, so each recreated child's first run passes `false`. **A shape change
would therefore be missed by the children** — and is covered instead by the outer effect's own
`markChanged(modulesRanOnce)`, which passes `true` on every run after the first.

**There are TWO independent guards here, not one (gate finding F-2).** An earlier draft named only
the outer's `markChanged`, which would invite a maintainer to delete the child's
`opts.tracker.modules = true` as redundant. It is not redundant:

1. `opts.tracker.modules = true` is set unconditionally by the outer **and by every child**,
   independent of any `ranOnce` flag -- and `tracker.modules`, not `dirtySinceLastSave`, is what
   `risuSave.ts:328` actually gates on.
2. `markChanged(false)` never means "mark clean". `saveTimeoutExecute`
   (`globalApi.svelte.ts:594-604`) only ever sets `dirtySinceLastSave = true` and re-arms the
   timer; the boolean argument cannot undo anything.

Both invariants belong in the code comment and the commit message. Pinned by the equivalence suite
(section 5), not assumed.

## 5. Tests — equivalence first, then red-before-green

Seam already exists: `src/ts/storage/tests/dbChangeEffects.svelte.test.ts` (8 tests, real `$state`
DBState, driven with `flushSync`). No new seam, no extraction, no leaf module.

**Step 1 — equivalence suite, written against the CURRENT effect and passing.** These assert that
the set of mutations flagging `tracker.modules` is unchanged. They must pass before the change and
after it; that is the point.

1. Leaf write (`modules[k].name`), nested leaf (`modules[k].lorebook[i].content`).
2. Element replacement (`modules[k] = {...}`).
3. `push`, `splice`, in-place reorder.
4. Whole-array replacement (`db.modules = [...]`).
5. The real call-site pair at `ModuleSettings.svelte:133-134` -- `splice` followed by the
   self-assign -- **does** mark dirty (the splice is what marks). Assert that, **not** the negative
   "self-assign alone does not mark" (gate finding F-5): a negative assertion enshrines
   under-marking as a spec and would fail if anything ever made it safer.
6. First run does not mark dirty (F8).
7. Mutation of a module that is NOT the one most recently touched still marks dirty.
8. Empty array, and a module array containing a hole/undefined entry.
9. **Post-shape-change leaf mutation (gate finding F-4, load-bearing).** After a shape change has
   torn down and recreated the children, a leaf mutation to a **pre-existing** module must still
   mark dirty. No test or benchmark in this repo has ever executed a `$effect` created inside a
   *re-running* `$effect` -- `module-effect-overhead-bench.svelte.ts` creates its children directly
   in `$effect.root` and tears them down via the root, a different path. This is the untested
   mechanic the whole design rests on. Items 3 and 7 do not cover it: item 3 does not mutate
   afterwards, item 7 does not follow a shape change.

**Assert arguments, never call counts (gate finding F-3).** The existing test
`first run reports markChanged(false) for every effect` asserts `toHaveBeenCalledTimes(6)`. It
survives only because `installDb()` sets `modules: []`. With 52 modules the first flush calls
`markChanged` 6 times today and **58** times after (1 outer + 52 children + 5 siblings). Any
equivalence test that populates modules and asserts a count will pass before and fail after --
breaking this section's own "must pass before and after" rule, and the tempting repair (relaxing
the assertion) would silently destroy F8's first-run coverage. Assert `tracker.modules`, and that
every first-run call receives `false`.

**Step 2 -- the one genuinely red test.** A leaf write in module `k` must not deep-read module `j`.

**Observability (gate finding F-7).** "Counting child-effect runs" is NOT observable through
`DbChangeEffectOptions`, which exposes only `tracker` and `markChanged`; adding a hook would be the
"helper invented to be deleted" this plan disclaims. Use an **accessor property** on a fixture
module instead: `proxy.js:178` skips source creation when the descriptor has no `writable`, so
`:198` falls through to `Reflect.get` -- the getter fires on every deep read and is itself
untracked, and `clone.js`'s `Object.keys` walk reaches it. Red before (fires on every keystroke in
any module), green after (fires only for the edited module). No production hook, no source-text
assertion.

**Step 3 — verification.** `pnpm check` 0/0 and `pnpm test` **checking the exit code, not the pass
count** (a run reporting matching pass counts while exiting ELIFECYCLE has bitten this campaign).
Baseline to preserve: 32 files / 358 passed / 3 skipped.

**Step 4 — real-app before/after**, repeating section 1's measurement protocol at 52 and 104
modules with the editor open, mutations restored and verified. Numbers reported with the hardware
stated (1.1).

## 6. Risks

- **Missed mutation = silent data loss.** The only real risk. Mitigated by preserving the full
  closure and by the equivalence suite, which is written first and must pass against the unchanged
  code so it cannot be tuned to the new implementation.
- **First-run semantics on shape change** (4.1) — the one place a mutation could be dropped.
  Explicitly tested.
- **Effect churn** — N children torn down and recreated on every shape change. Measured at
  0.92-1.01x today's cost across N=52 and N=104 (F10), with no growth trend. Not a regression, but
  shape changes remain expensive in absolute terms on both sides (40-113 ms in the harness); this
  change neither fixes nor worsens that.
- **Unverified on low-end hardware** (1.1). The ratio argument holds; the budget claim does not.
- **`markChanged` is called N+1 times per shape-change flush instead of once.** Harmless, recorded
  so nobody rediscovers it as a bug: all calls are synchronous within one flush and
  `saveTimeoutExecute` re-arms to the same wall-clock deadline (F7).
- **Pre-existing and NOT a regression:** `saveTimeoutExecute` has no max-wait, so a driver that
  changes module shape repeatedly with `await`s in between (e.g. `characterCards.ts` pushing in a
  loop) can starve the save. Identical on both sides. Do not fix here.

## 7. Explicitly out of scope

- **Asset modules.** A module with 5,000+ asset references costs 17-36 ms to snapshot *on its own*
  (harness, production), so partitioning does not bring that module inside budget. It still helps
  enormously — today one such module taxes every keystroke in every OTHER module; partitioned, only
  while editing that module. Bounding or virtualising the `assets` deep-read is a separate problem
  needing its own plan and gate, and is subject to the same no-narrowing rule (F9).
- **The draft copy.** Retired as a performance mechanism. It may return as a *product* decision
  (half-typed regexes should not reach prompt building until committed), decided on those terms.
- **`flushPendingSave()` / Tauri close hook ("B1").** An app-wide durability upgrade discovered
  during the draft-copy work, not owned by this stage. Its own roadmap item.
- **The other monolithic effects** (`botPresets`, `loadouts`, `plugins`, `pluginCustomStorage`)
  have the same shape and would likely benefit from the same treatment. Not in this change.
- **Narrowing `dbChangeEffects.svelte.ts` in any form.** Forbidden (F9).
- Everything in `Agents/Maybe-Later.md`; `src/ts/kei/backup.ts:86`; the `modules.test.ts.snap`
  line-ending churn (keep excluding it); reworking the tracking layer (`33b665d1` / `72ce7218`).


---

## 8. Gate record 1 — opus-reviewer, 2026-09-21 — [APPROVE-WITH-FINDINGS]

**Design: sound.** The reviewer worked the full mutation matrix against
`node_modules/svelte/src/internal/client/proxy.js` and `shared/clone.js` and established that
`$state.snapshot(array)` registers exactly three dependency kinds — the `db.modules` source, the
array `length` source, and one source per index — and notably **not** the array's `version` source,
because the array branch of `clone.js` uses an index loop and `i in value`, never `ownKeys`. The
proposed outer reads exactly that set. Per-element `$state.snapshot(m)` then recurses identically
for each element's subtree. **Union of dependencies is identical; the closure is preserved, not
narrowed.** No missed-mutation path could be constructed, including same-batch interleaves of a
shape change plus a leaf write (traced through `batch.js` and `runtime.js:453-458`), effect
teardown/recreation (`effects.js:467-491`, `:526-566` — no leak, no stale firing, bounded memory),
and `effect_in_teardown` (unreachable; these children have no teardown callback).

Findings, all folded into this revision:

- **F-1 (highest — false claim in a shipped artifact).** An earlier draft's "the partition is the
  pattern this file already uses for characters" was **false**, and self-contradicted four lines
  later. Section 2 rewritten. The reviewer additionally established that the cited prior art has
  its own unmarked-mutation hole — see the separate finding below.
- **F-2.** Section 4.1 named only one of two guards. Both now stated.
- **F-3.** The equivalence suite would have broken itself: the existing
  `first run reports markChanged(false) for every effect` test asserts
  `toHaveBeenCalledTimes(6)`, which survives only because `installDb()` sets `modules: []`. With
  52 modules the first flush calls `markChanged` 6 times today and 58 after. Section 5 now
  mandates asserting arguments, never counts.
- **F-4.** No test or bench in this repo has ever executed a `$effect` created inside a
  *re-running* `$effect` — the overhead bench creates children directly in `$effect.root`. Added as
  explicit equivalence test 9.
- **F-5.** A negative assertion (self-assign does not mark) would enshrine under-marking as a spec.
  Replaced with the real call-site pair.
- **F-6.** The "characters were fixed later" history is unsupported: `b4d08b1f` introduced the
  tracker with character scoping already present. Hedged to a maintainer report of the outcome.
- **F-7.** "Counting child-effect runs" is not observable through `DbChangeEffectOptions`. Replaced
  with the accessor-property technique.

Reviewer-verified, reproduced independently where cheap: F1-F10 all accurate; F10's ratios re-run
at 0.97x (N=52) and 0.94x (N=104); `pnpm test` 32 files / 358 passed / 3 skipped exit 0;
`pnpm check` 0/0.

### 8.1 SEPARATE FINDING — non-selected characters are not marked for save

Not introduced by this change, not fixed by it, and **must not be absorbed into it.** Raised by the
gate and verified independently by the orchestrator:

- `tracker.character` is written in exactly one place, `dbChangeEffects.svelte.ts:77-78`, gated on
  `selIdState`.
- `risuSave.ts:285-308` re-encodes a character only when its `chaId` appears in
  `toSave.character`; otherwise it reuses the existing block
  (`else if(!this.blocks[character.chaId])` encodes only when no block exists yet).

**So a mutation to a non-selected character that already has an encoded block is not re-encoded,**
and is lost on reload unless something else forces a full encoder reload. Reachable by any writer
targeting a character other than `selectedCharID`: plugin, MCP/risuaccess, trigger, bulk operation,
or lorebook update.

#### Investigation result (`investigator`, 2026-09-21) — SCOPED, NOT FIXED

Mechanism **confirmed** on all three steps. Severity: **occasional-loss bug** — not a systemic
crisis, not a no-op. Orchestrator re-verified every claim below against source.

**Mitigation A — `requiresFullEncoderReload` forces a full re-encode of every character**
(`globalApi.svelte.ts:777-784` builds a fresh encoder; `risuSave.ts:250-260` re-encodes all
characters regardless of `toSave.character`). Set at exactly 4 sites: `characters.ts`,
`drive/backuplocal.ts`, `kei/backup.ts`, `process/coldstorage.svelte.ts`.

**Mitigation B — selecting the character later re-captures the edit.** The effect re-runs on
selection change and unshifts the newly-selected `chaId` unconditionally; because the edit is on
the live proxy, it is picked up then. **So the real failure mode is "never persists unless the user
reopens that character before reload/crash/close", not unconditional loss.** Both mitigations are
accidents of implementation, not designed guarantees — B relies on a front-of-array compare rather
than a set membership test.

**Blast radius.** 67 raw candidate writes across 24 files; after tracing each to its index source,
**~60 resolve to the live selection** (`get(selectedCharID)` / `$selectedCharID` / followed by a
`selectedCharID.set`) and are therefore not instances. Real non-selected-index writers:

| Writer | Status |
|---|---|
| `process/coldstorage.svelte.ts:590-622` compaction sweep (iterates ALL characters) | **self-mitigated** — sets `requiresFullEncoderReload` at `:621`. Someone understood this gap for this one writer |
| `src/lib/Others/GridCatalog.svelte:142-146` restore-from-trash | **UNMITIGATED, real UI action** |
| `src/ts/plugins/apiV3/v3.svelte.ts:879-885` `setCharacterToIndex` | **UNMITIGATED, public plugin API** |
| `bootstrap.ts:495-503` legacy `!db.formatversion` image-path migration | narrow; one-time legacy path only |

**The trash-restore bug, concretely.** `GridCatalog.svelte:142-146` does
`DBState.db.characters[restoreIdx].trashTime = undefined` with
`restoreIdx = findCharacterIndexbyId(char.chaId)` — not the selection — then calls
`checkCharOrder()`, which mutates only `db.characterOrder`. That top-level key IS covered by the
generic loop (`:62-69`), so a save fires — but this character's `chaId` never enters
`toSave.character`, so `risuSave.ts:298` reuses the stale block, which still has `trashTime` set.
**Restore a character from trash, do not open it, close the app: it is back in the trash.**

**`setCharacterToIndex`** writes `db.characters[charId] = char` at a caller-supplied index, is
documented in `plugins/apiV3/risuai.d.ts:1326-1333`, and has **zero first-party callers** — it
exists purely as a third-party extension point. A plugin editing several characters by index has
only the open one survive, with no error or plugin-visible signal.

**Fix surface — small but not proven exhaustive.** The defect is centralised: one gating condition
(`dbChangeEffects.svelte.ts:70-86`) and one consumer (`risuSave.ts:284-308`). The ~60
selection-relative writers need no change. What is missing is a general "mark this `chaId` dirty"
primitive — today the only escape hatch is `requiresFullEncoderReload`, a blunt whole-database
re-encode. `toSaveType.character` is already `string[]` of arbitrary ids, so **the save format does
not block a fix**; the obstacle is that these writers have no handle on the tracker instance.

**Bonus finding — `toSave.chat` is dead.** `grep -n "toSave.chat\|RisuSaveType.CHAT" src/ts/storage/risuSave.ts`
returns **nothing**. It is populated (`dbChangeEffects.svelte.ts:80-85`) and merged back on failed
saves (`globalApi.svelte.ts:620-623`), but the encoder never reads it — chats persist inside the
whole-character `CHARACTER_WITH_CHAT` block, gated solely by `toSave.character`. So a fix needs no
parallel per-chat work, and this is leftover plumbing for granularity that was never wired up.

**Not settled:** whether real plugins call `setCharacterToIndex` on non-current indices
(unknowable from this repo; the sanctioned API shape is the relevant fact), and whether
`bootstrap.ts`'s legacy migration is still reachable. The investigator also did not exhaustively
sweep MCP/risuaccess write paths beyond the one it read, so "small" is bounded-but-not-proven.

**Disposition: scoped, logged, NOT fixed.** Needs its own plan and gate. Do not absorb into the
partition change.


---

## 9. IMPLEMENTED — real-app before/after, measured

Change landed in `src/ts/storage/dbChangeEffects.svelte.ts` (one file, 41 lines, exactly the
shape in section 4 plus the comment section 4.1 requires). Tests written FIRST by a separate agent
against the unchanged source; orchestrator verified red-before-green independently
(26 passed / 1 failed / exit 1 before, 27 passed / exit 0 after).

### Verification (orchestrator re-ran everything; exit codes, not pass counts)

| Check | Result |
|---|---|
| `npx vitest run src/ts/storage/tests/dbChangeEffects.svelte.test.ts` | 27 passed, **exit 0** (was 26/1, exit 1) |
| `pnpm test` | 32 files, **377 passed, 3 skipped, exit 0** |
| `pnpm check` | **0 errors, 0 warnings, exit 0** |
| `git diff --stat src/` | 2 files: the effect (+41/-4) and its tests (+493) |

### Real-app measurement — identical protocol to section 10.5g of the superseded plan

Live dev server, seed-1337 fixture, module editor open on `Module 2 (giant)`, real `input`
events dispatched into the name field, timed to forced style+layout flush. All mutations restored
and verified (`restoredCount: 52`, `dupLeft: 0`, `dirtyNames: 0`).

| Modules | BEFORE | AFTER | Speedup | AFTER vs 16.7 ms budget |
|---|---|---|---|---|
| 52 | 13.2 ms | **1.9 ms** | **6.9x** | 11% |
| 104 | 25.1 ms | **1.8 ms** | **13.9x** | 11% |
| **scaling ratio 52 -> 104** | **1.9x (O(modules))** | **0.95x (FLAT)** | — | — |

**The design's central claim is confirmed empirically: cost is now independent of module count.**
104 modules measured marginally *faster* than 52, which is within noise and is exactly what O(1)
predicts. Before the change the same measurement scaled 1.9x.

At the maintainer's real profile size this takes typing from **150% of the frame budget to 11%**,
and unlike the previous figure it no longer degrades as modules are added.

### Hardware caveat still stands (section 1.1)

Measured on an i9-13900K. The **ratio** (6.9x / 13.9x) and the **flatness** are hardware-
independent — they come from doing less work, not from doing work faster. The absolute
"11% of budget" figure is a high-end-desktop number and is NOT claimed for Raspberry Pi or mobile.

### Incidental observation, not fixed

The dev console shows `KEI auto-backup failed: Cannot read properties of undefined (reading 'kei')`
firing on every load — the known unrelated bug at `src/ts/kei/backup.ts:86` (`db.account.kei`
without optional chaining). Confirmed live rather than merely theoretical. Still out of scope.
