# Agents/Tools — campaign tooling

Apparatus for the stabilization campaign. **Not application code and not part of any
build.** Nothing in `src/` imports from here.

## `save-gen/` — synthetic save-data generator and snapshot benchmarks

Generates deterministic RisuAI save data at four sizes and measures the cost of
`$state.snapshot()` over it. Built for Phase 2 (RAM / rendering performance).

- **Seed 1337.** Fixtures are reproducible; a run today matches a run from the session
  that first produced these numbers.
- **Tiers:** `light`, `chat-heavy`, `module-heavy`, `both-heavy`.
- Reuses the repo's real `encodeRisuSaveLegacy` / `decodeRisuSave` via the same
  `vi.mock` pattern as `src/ts/storage/tests/risuSave.test.ts`, so generated `.bin`
  files are real save files rather than approximations.

### Running it

```
npx vitest run --config Agents/Tools/vitest.harness.config.ts
```

Runs from the repo root. The config derives the repo root from its own location, so
there are no absolute paths to update if the repo moves.

### The `.harness.ts` suffix is load-bearing — do not rename

The repo's `vitest.config.ts` declares **no `include`**, so `pnpm test` falls back to
vitest's default glob `**/*.{test,spec}.?(c|m)[jt]s?(x)`. These files were
`*.spec.ts` while they lived outside the repo, where that did not matter. Inside the
repo it does: under the old names `pnpm test` would discover and run them, breaking a
verified baseline of **31 files / 331 passed / 3 skipped** and adding minutes of
benchmark time to every suite run.

`*.harness.ts` does not match that glob. **Do not rename these back to `*.spec.ts`,
and do not add `*.test.ts` / `*.spec.ts` files in this directory.** If you ever need
that, add an explicit `exclude` to the repo's `vitest.config.ts` first and verify the
baseline afterwards.

Baselines were re-confirmed after this directory was added: `pnpm test` 31 files /
331 passed / 3 skipped, `pnpm check` 0 errors / 0 warnings.

### Generated output

`generate-and-verify.harness.ts` writes real fixture `.bin` files to
`Agents/Tools/output/` (~12 MB for a full run). That directory is gitignored. It is
safe to delete at any time; a rerun regenerates it identically from seed 1337.

### Known flake

The `both-heavy` snapshot benchmark can exceed vitest's default 5000 ms per-test
timeout on a loaded machine — it does real `$state.snapshot()` work over ~10 MB of
proxied data. Observed once under the verbose reporter, passing on clean runs before
and after. It is a timing flake, not a defect. Rerun, or raise the timeout for that
case if it becomes persistent.

## Reference measurements (2026-09-21, this machine)

Module-heavy tier, 52 modules / 7.27 MB, 3 warmup discarded + 15 measured, three
independent process runs, medians reported with floor alongside:

| Condition | Per `$state.snapshot(modules)` | Floor | Per keystroke (2 calls) |
|---|---|---|---|
| Dev (`DEV === true`) | 34.46 ms | 33.04 ms | 68.92 ms |
| Production (`DEV === false`) | 29.15 ms | 28.65 ms | 58.29 ms |

Frame budget is 16.7 ms. Production was forced by resolving `esm-env` to its
`production` condition and **verified behaviourally** — `snapshot()` only calls
`state_snapshot_uncloneable()` inside the `DEV` branch, so a `console.warn` spy on a
deliberately uncloneable value fired under dev and not under production.

Dev overstates by **1.18x**, not by a multiple. A hypothesis that DEV instrumentation
inflated the headline figure was tested and **disproven**; do not revive it.

**Caveat carried from the measuring session:** these run against a standalone
`$state({db:...})` container, not the real `DBState` wired into the effect graph. They
are raw snapshot cost only and exclude the effects' downstream work, so the real
per-keystroke figure is this **or higher**, never lower.

## Stage A after-measurement (2026-09-21, same machine)

`track-module-deps-bench.harness.ts` measures `trackModuleUpdateDeps()`
(`src/ts/process/moduleUpdateDeps.ts`) against `$state.snapshot(modules)` over the same
seed-1337 module-heavy fixture, in the same process, so the two sides are comparable.
Both sides are measured fresh on each run rather than compared against a number in this
file. Production is forced with `NODE_ENV=production` in front of the command — a
`resolve.conditions` override does **not** work, because Vite injects its own
`development`/`production` condition ahead of custom ones based on `NODE_ENV`.

```
NODE_ENV=production npx vitest run --config Agents/Tools/vitest.harness.config.ts Agents/Tools/save-gen/track-module-deps-bench.harness.ts --reporter=verbose
```

| Condition | `$state.snapshot(modules)` | `trackModuleUpdateDeps()` | Per keystroke before | Per keystroke after |
|---|---|---|---|---|
| Dev | 33.87 ms | 0.045 ms | 67.74 ms | 33.92 ms |
| Production | 29.18 ms | 0.031 ms | 58.35 ms | 29.21 ms |

**Read the per-keystroke columns carefully.** Stage A replaced **one** of the two
per-keystroke snapshot calls. The other, `dbChangeEffects.svelte.ts:34`, is deliberately
untouched because it gates whether modules are re-encoded to disk. So "after" is
`snapshot + trackModuleUpdateDeps`, not `trackModuleUpdateDeps` alone.

**The frame budget is still missed.** 29.2 ms production is 175% of 16.7 ms, and 33.9 ms
dev is 203%. The surviving `dbChangeEffects` snapshot exceeds the whole budget on its
own. The 2.00x and the ~29 ms saved per keystroke are real; the frame-budget problem is
not solved and Stage A never claimed it would be.

Two deviations from the older measurements above, both deliberate:
- The fixture is enriched with `namespace` / `hideIcon` / `backgroundEmbedding`, which
  `build.ts` leaves unset, so the narrowed read is not timed against absent properties.
  Same shape, size and module count; the freshly measured production snapshot median
  landed within 0.1% of the 29.15 ms published above, which is the cross-check.
- `trackModuleUpdateDeps()` is batched 500 calls per sample and divided out. At ~0.03 ms
  a single call is close enough to timer resolution that an unbatched number would not be
  defensible.

Same standalone-container caveat as above: raw call cost, real figure is this or higher.
