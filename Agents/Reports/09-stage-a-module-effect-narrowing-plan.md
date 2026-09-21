# Stage A plan — narrow the `moduleUpdate()` effect's module dependency

Status: **PLAN GATE OPEN — not implemented.** Phase 2, module-editor per-keystroke cost.
Branch `fix/persistence-conflict-platform-hardening`, HEAD `039b4a7c`.

## 1. Problem

Exactly two `$effect`s deep-read the whole modules array per keystroke, each via a
`$state.snapshot(DBState.db.modules)` whose return value is discarded:

| Site | Purpose | In scope? |
|---|---|---|
| `src/ts/storage/dbChangeEffects.svelte.ts:34` | sets `opts.tracker.modules = true`, gating whether the modules block is re-encoded in `risuSave.ts:328` | **NO — L1, do not touch** |
| `src/ts/stores.svelte.ts:197` | dependency-tracking for `moduleUpdate()` | **YES — this plan** |

Measured cost: ~29.15ms per snapshot call in production, ~58ms per keystroke for the pair,
against a 16.7ms frame budget. (Dev 34.46ms, 1.18x. The "DEV instrumentation inflates this"
hypothesis was tested and disproven; do not revive it. The measurement was taken on a
synthetic `$state` container, so it is raw snapshot cost only — the real figure is this or
higher.)

Stage A removes one of the two calls. It does not touch the save-gating one, so the worst
case is a stale GUI preview, never a lost write. It is independent of Stage B (draft-copy
the module editor) and can land alone.

## 2. Verified facts (orchestrator re-verified against source, not taken from a report)

The effect under change, `src/ts/stores.svelte.ts:195-205`, in full:

```ts
$effect(() => {
    $state.snapshot(DBState.db.modules)
    DBState?.db?.enabledModules
    DBState?.db?.enabledModules?.length
    DBState?.db?.characters?.[selIdState.selId]?.chats?.[...]?.modules?.length
    DBState?.db?.characters?.[selIdState.selId]?.hideChatIcon
    DBState?.db?.characters?.[selIdState.selId]?.backgroundHTML
    DBState?.db?.moduleIntergration
    moduleUpdate()
})
```

Its entire body is dependency registration plus one call. It has **no** persistence role:
`opts.tracker` / `markChanged` live only in `dbChangeEffects.svelte.ts`.

`moduleUpdate()` (`src/ts/process/modules.ts:552-583`) consumes, across itself and
`getModules()` -> `getModuleByIds()`:

| Field | Read at | Why |
|---|---|---|
| `module.id` | `modules.ts:378`, `:387-390`, `:556` | selection, dedup, and the `lastModuleIds` reload trigger |
| `module.namespace` | `modules.ts:378` | alternate selection key |
| `module.hideIcon` | `modules.ts:566` | `HideIconStore` |
| `module.backgroundEmbedding` | `modules.ts:569-570` | `moduleBackgroundEmbedding` store |

`RisuModule` (`modules.ts:19-35`) has 15 fields. The other 11 — `name`, `description`,
`lorebook`, `regex`, `cjs`, `trigger`, `lowLevelAccess`, `assets`, `customModuleToggle`,
`mcp`, `icon` — are read only by sibling exports (`getModuleLorebooks`, `getModuleAssets`,
`getModuleTriggers`, `getModuleRegexScripts`, `getModuleToggles`, `getModuleMcps`,
`applyModule`) that `moduleUpdate()` never calls.

`character.modules` and `chat.modules` are `string[]` (`database.svelte.ts:1494,1577,1830`),
not `RisuModule[]`, so they contribute ids only. `persona.embeddedModule`
(`database.svelte.ts:799`) is a `RisuModule` but lives on `db.personas`, so it was never
covered by the `db.modules` snapshot either — unchanged by this plan, not a regression.

No other module field reaches `moduleUpdate()`. Everything else `getModules()` reads
(`db.enabledModules`, `currentChat.modules`, `character.modules`,
`persona.embeddedModule`, `db.moduleIntergration`) is **already** tracked by the sibling
lines :198-203 and is out of `db.modules` anyway.

`getModules()` caches on the joined enabled-id string (`modules.ts:417-420`), which does
not change when module *content* is edited, and `lastModuleData` holds live proxy
references (L3, the load-bearing accident). Consequence for this plan: on a cache hit
`moduleUpdate()` still reads `hideIcon`/`backgroundEmbedding` off live proxies, so those
two fields are *already* tracked incidentally by the call itself. On a cache **miss**
`getModuleByIds()` iterates `db.modules`, registering the array and `id`/`namespace`.
The explicit narrowed read exists so tracking does not depend on which branch ran.

## 3. Proposed change

**Files: 3 changed, 1 added.**

**Amendment (after step 1, Orchestrator's call).** The helper does **not** live in `modules.ts`.
`modules.ts:1-13` imports `src/lang`, `../alert`, `../storage/database.svelte`,
`../globalApi.svelte`, `../media`, `../rpack/rpack_js` (wasm), `../characterCards`,
`../interchangeability` and `../stores.svelte` — and `stores.svelte.ts` imports `modules.ts`
back, so the pair is already circular. A test that imports the real `modules.ts` drags in
Tauri plugins, AI providers and a wasm module, and trips the module-load `$effect.root`.
This is precisely the problem documented at `dbChangeEffects.svelte.test.ts:30-36`, and it is
why `edittransRegex.test.ts` replaces the whole module rather than mocking around it.

The helper therefore goes in a new **leaf** file, `src/ts/process/moduleUpdateDeps.ts`, whose
only import is `import type { RisuModule }` — type-only, so it is erased and the file has
**zero runtime dependencies**. The test imports it directly with no `vi.mock` at all. This
also makes the step-1 stub in `edittransRegex.test.ts` unnecessary, so that file is reverted
to its original state (section 3 item 3 below is superseded).

Cost of the split: the "keep this list in sync with `moduleUpdate()`" warning no longer sits
next to the code it constrains. Mitigated by a pointer comment at `moduleUpdate()` and by
test 5.2, which fails loudly if the two drift.

1. ~~`src/ts/process/modules.ts`~~ → `src/ts/process/moduleUpdateDeps.ts` — one exported helper:

```ts
/**
 * Registers the reactive dependencies moduleUpdate() actually consumes.
 * Replaces a $state.snapshot() deep-read of the whole modules array, which
 * cost ~29ms per keystroke to track four fields per module.
 * Keep this list in sync with getModuleByIds() and moduleUpdate() itself.
 */
export function trackModuleUpdateDeps(modules: RisuModule[] | undefined | null) {
    if (!modules) return
    const len = modules.length
    for (let i = 0; i < len; i++) {
        const m = modules[i]
        if (!m) continue
        void m.id
        void m.namespace
        void m.hideIcon
        void m.backgroundEmbedding
    }
}
```

2. `src/ts/stores.svelte.ts:197` — replace `$state.snapshot(DBState.db.modules)` with
   `trackModuleUpdateDeps(DBState?.db?.modules)`. ~~adding the import to the existing
   `./process/modules` import on line 5~~ — superseded by the leaf-file amendment above:
   the existing line-5 import of `./process/modules` is left alone and a separate
   `import { trackModuleUpdateDeps } from "./process/moduleUpdateDeps"` is added as line 6,
   because the two symbols now come from different files. Nothing else in the effect changes.

3. `src/ts/translator/edittransRegex.test.ts:10-13` — **found during step 1, not anticipated
   by this plan.** That file replaces the whole `../process/modules` module with a two-export
   `vi.mock` factory (`getModuleRegexScripts`, `moduleUpdate`). Because `stores.svelte.ts`'s
   module-load `$effect.root` is pulled in transitively and fires during that test, adding a
   *consumed* named export makes Vitest throw `No "trackModuleUpdateDeps" export is defined
   on the "../process/modules" mock`. The suite still reports 31 files / 331 passed /
   3 skipped, but the run carries 1 unhandled error and exits `ELIFECYCLE Test failed` —
   a real regression against baseline, not a coverage gap. Fix: add
   `trackModuleUpdateDeps: () => {},` to that factory. A no-op stub is correct there; the
   file tests translator regex and asserts nothing about module dependency tracking. Grep
   confirms this is the **only** full-replacement mock of `process/modules` in the repo.

4. New test file for the helper (section 5).

`dbChangeEffects.svelte.ts` is **not touched**.

## 4. Invariants and risks

- **I1 — no persistence exposure.** The changed effect never sets a tracker flag. Stage A
  cannot cause a missed write. If it is wrong, a module's hide-icon or background-embedding
  preview goes stale until the next unrelated re-run.
- **I2 — behaviour parity for the four fields.** Editing `hideIcon`, `backgroundEmbedding`,
  `id` or `namespace` on any module in `db.modules` must still re-run the effect.
- **I3 — array-shape parity.** Push, splice, reorder, and whole-array replacement must still
  re-run it. `modules.length` plus per-index reads cover this; whole-array replacement is
  covered by the `DBState?.db?.modules` property read itself.
- **I4 — intentional narrowing.** Editing `name`, `description`, `lorebook`, `regex`,
  `trigger`, `assets`, `cjs`, `mcp`, `lowLevelAccess`, `customModuleToggle` no longer
  re-runs this effect. That is the point. It must be shown not to matter, which is I2 plus
  the fact that no other consumer sits in this effect.
- **I5 — compatibility invariant.** No save-format, schema, or serialisation change. No
  module field is read, written, added or dropped on disk. Upstream modules, presets,
  characters, `.bin` backups and plugins are untouched.
- **R1 — dead-code elimination.** Bare property-read statements could in principle be
  dropped by a minifier. The `void x` idiom used here already ships in this repo for exactly
  this purpose — forcing an effect dependency — at `src/lib/Others/IrisModal.svelte:268`
  (`void seenDialogue.length;`) and `src/lib/UI/GUI/SegmentedControl.svelte:49`
  (`void activeIndex;`). That is closer precedent than the bare reads at :198-203, which are
  a different code shape. Still to be confirmed against a production build, not assumed.
- **R2 — drift.** If a future edit makes `moduleUpdate()` consume a fifth field, the
  narrowed tracker silently goes stale. Mitigated by the test in 5.2 and the comment.
- **R3 — Stage B interaction.** Stage B replaces an array element with a draft copy. That is
  a `modules[i]` write, covered by I3. Stage A does not constrain Stage B, and Stage B does
  not require Stage A.

## 5. Tests (red-before-green is the acceptance evidence)

New file `src/ts/process/tests/moduleUpdateDeps.svelte.test.ts`, following the proven
reactive pattern in `src/ts/storage/tests/dbChangeEffects.svelte.test.ts` (real `$state`
built inside a `vi.mock` of `stores.svelte`, driven with `flushSync`).

**5.1 — narrowing (must FAIL against unfixed source).** Track a `$state` modules array in an
effect calling `trackModuleUpdateDeps`; mutate `modules[0].name`; assert the effect did
**not** re-run. Against today's `$state.snapshot` deep read this re-runs, so the test is red
first. This is the test that proves the change happened.

**5.2 — field list pin (must FAIL against unfixed source).** For each of `id`, `namespace`,
`hideIcon`, `backgroundEmbedding`: mutate it and assert the effect re-ran. For a
representative non-consumed field (`name`, `lorebook`) assert it did not. This pins the
list behaviourally rather than by asserting on source text.

**5.3 — array shape (coverage; passes pre-fix — must be commented as such).** push, splice,
reorder, whole-array replacement each re-run the effect.

**5.4 — end-to-end store parity (coverage).** With a module whose `hideIcon` is toggled,
`HideIconStore` still updates; with `backgroundEmbedding` edited,
`moduleBackgroundEmbedding` still updates.

Any test that passes pre-fix is kept only as coverage and carries a comment saying so, so it
is never mistaken for proof.

**5.5 — how red-before-green is actually obtained here (gate amendment).** The helper does
not exist yet, so "run the new test against the old source" is not directly possible, and
`$state.snapshot` cannot be moved into `modules.ts` at all — it is a rune, and `modules.ts`
is plain `.ts`, not `.svelte.ts`. Implementation is therefore split into three ordered steps,
landing as one commit:

1. **Extract, do not narrow.** Add `trackModuleUpdateDeps()` to `modules.ts` with a
   deliberately over-broad body, `JSON.stringify(modules)`, which deep-reads every
   enumerable field and so registers the same dependency set as today's
   `$state.snapshot(...)`, without needing a rune. Wire `stores.svelte.ts:197` to call it.
   Behaviour-preserving by construction; `pnpm check` and `pnpm test` must stay at baseline.
2. **Write the tests and confirm RED.** 5.1 and the negative half of 5.2 must FAIL against
   step 1. If they pass, the test is not measuring what it claims and the gate is not met.
3. **Narrow the body** to the four-field read. 5.1 and 5.2 go green; 5.3, 5.4 and the full
   suite stay green.

**5.6 — disclosed coverage gap (gate amendment).** The automated tests exercise the extracted
helper, not the wiring at `stores.svelte.ts:197`. The real effect is created at module load
inside an `$effect.root` that transitively imports the whole app graph — the same problem
documented at `dbChangeEffects.svelte.test.ts:30-36`. `pnpm check` catches a type-level
wiring mistake but not, for example, both the old and the new line being left in place.
A manual smoke check is therefore part of acceptance, not optional: in the running dev app,
toggle a module's `hideIcon` and edit its `backgroundEmbedding`, and confirm the chat icon
and background react.

**Result (2026-09-21) — PASSED, and more precisely than this section asked for.** Run against
`pnpm dev` with a 52-module profile. Rather than eyeballing the GUI, the check reached the
real module graph — Vite serves the same module instances in dev, so
`await import('/src/ts/stores.svelte.ts')` yields the live `DBState` and `HideIconStore`
that the effect at `stores.svelte.ts:197` actually drives. `HideIconStore.set` was wrapped to
count genuine `moduleUpdate()` executions, then one enabled module was mutated field by
field:

| Mutation | Effect re-ran | Expected |
|---|---|---|
| `db.enabledModules = [id]` | yes (1) | yes — tracked separately at :198 |
| `modules[0].hideIcon` | yes (1) | yes — consumed field |
| `modules[0].backgroundEmbedding` | yes (1) | yes — consumed field |
| `modules[0].name` | **no (0)** | no — this is the narrowing |

That last row is the one the unit tests could not reach: it shows the narrowing holding in
the real production wiring, not in an isolated harness. All mutations were reverted and the
profile left as found (`enabledModules` back to `[]`, name and `hideIcon` restored, the
`backgroundEmbedding` key deleted rather than left as `undefined`).

Unrelated pre-existing error observed while the app was open, NOT introduced here and NOT
fixed here: `saveDbKei()` at `src/ts/kei/backup.ts:86` reads `db.account.kei` without
optional chaining, so every `saveDb()` on a profile with no account configured logs
`Cannot read properties of undefined (reading 'kei')`. It touches no module state.

**Checks to rerun before the change is called done:** `pnpm check` (baseline 0 errors /
0 warnings), `pnpm test` (baseline 31 files, 331 passed, 3 skipped), and
`npx vitest run --config Agents/Tools/vitest.harness.config.ts` for the before/after
per-keystroke number. Re-check `git status` for the deliberate
`risuaccess/__snapshots__/modules.test.ts.snap` line-ending-only exception afterwards rather
than assuming it stayed clean; it stays out of the commit.

## 6. Explicitly out of scope

`dbChangeEffects.svelte.ts:34` (L1). The `getModules()` cache and `refreshModules()` (L3) —
Stage A neither depends on nor repairs the load-bearing accident. The proxy-tracking layer,
reverted twice (`33b665d1`, `72ce7218`); `databaseState.svelte.ts` no longer exists. The
alertStore hijack, `loadPages` reset on character switch,
`streamingDisplayOptimizationMode`, last-writer-wins whole-DB overwrite, and
`Agents/Maybe-Later.md`.
