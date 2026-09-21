/**
 * Shared, plain-TS (no runes) fixture helpers for the two addendum benches:
 *   - module-scaling-bench.harness.ts        (asset-heavy shape + module-count scaling)
 *   - module-effect-overhead-bench.harness.ts ($effect.root scheduling/teardown overhead)
 *
 * Deliberately NOT modifying build.ts (an existing harness-support file other
 * benches already depend on) per the task's "add a new one" instruction.
 * Everything here is self-contained and seeded from build.ts's exported
 * `mulberry32`/`SEED` only, so it stays deterministic without touching
 * build.ts's internals.
 */
import { mulberry32, SEED } from './build'

// ---------------------------------------------------------------------------
// Module-count scaling: build.ts's heavy module profile picks its count via
// `randInt(rng, 30, 60)` with NO parameter to request an exact size, tied to
// a per-tier seeded rng stream that also consumes randomness for characters
// generated earlier in the same buildTierDatabase() call. There is no clean
// way to ask build.ts for "exactly 104 heavy modules" without either
// modifying it (out of scope here) or re-deriving its rng consumption order
// outside the file (fragile, and exactly the "improvising something
// non-deterministic" the task told us not to do).
//
// Instead: duplicate the real seed-1337 module-heavy array (52 modules) to
// get an exact, fully deterministic 104-element point. This is NOT a second
// independently-generated 104-module fixture -- it is the same 52 modules,
// present twice (the second copy is `structuredClone`d, so it is a distinct
// object graph, not aliased references to the same underlying objects) --
// but it isolates exactly the question item 2 asks (does whole-array
// snapshot cost scale with element count/bytes) without introducing any
// non-determinism. Documented plainly in the report; not hidden.
// ---------------------------------------------------------------------------

/** Returns a NEW array of `times * base.length` modules: `base`, then `times-1` structuredClone()'d copies appended. */
export function duplicateModules<T>(base: T[], times: number): T[] {
    const out: T[] = [...base]
    for (let t = 1; t < times; t++) {
        out.push(...(structuredClone(base) as T[]))
    }
    return out
}

// ---------------------------------------------------------------------------
// Asset-heavy module shape (addendum item 1).
//
// Per the maintainer's source citations: saveAsset() (globalApi.svelte.ts:
// 324-335) returns a hash id, not inline bytes, and ModuleMenu.svelte:264
// pushes [name, id, extension] into RisuModule.assets?: [string,string,
// string][] (modules.ts:30). A "10,000 image" asset module therefore
// contributes ~10,000 short-string TUPLES to db.modules, not megabytes of
// binary -- similar total bytes to a cjs-heavy module at the same nominal
// size, but ~10,000x the node/array count. That structural difference is
// exactly what this fixture isolates.
// ---------------------------------------------------------------------------

function hex(rng: () => number, n: number): string {
    let s = ''
    for (let i = 0; i < n; i++) s += Math.floor(rng() * 16).toString(16)
    return s
}

const ASSET_NAME_WORDS = ['portrait', 'background', 'scene', 'cg-event', 'sprite', 'icon', 'emote', 'splash', 'cover', 'tile', 'expression', 'pose']
const ASSET_EXTS = ['png', 'webp', 'jpg', 'mp4']

/** [name, hash-id, ext] -- mirrors ModuleMenu.svelte:264's push order into RisuModule.assets. */
function makeRealisticAssetEntry(rng: () => number, idx: number): [string, string, string] {
    const word = ASSET_NAME_WORDS[Math.floor(rng() * ASSET_NAME_WORDS.length)]
    // Realistic filename, 20-40 chars: word + index + a short random suffix, padded/truncated to range.
    const raw = `${word}_${idx}_${hex(rng, 6)}`
    const targetLen = 20 + Math.floor(rng() * 20) // [20,40)
    const name = raw.length >= targetLen ? raw.slice(0, targetLen) : raw.padEnd(targetLen, '0')
    const id = hex(rng, 64) // hash-like id, 64 hex chars
    const ext = ASSET_EXTS[Math.floor(rng() * ASSET_EXTS.length)] // 3-4 chars
    return [name, id, ext]
}

/**
 * Builds ONE module whose `assets` array has `assetCount` realistic
 * [name, id, ext] tuples and is otherwise minimal (empty lorebook/regex/
 * trigger, no cjs), so any snapshot-cost difference from a cjs/lorebook-
 * heavy module of similar total bytes is attributable to the assets
 * array's structure (many small nested arrays) rather than to some other
 * field.
 */
export function buildAssetHeavyModule(assetCount: number, seedOffset = 0): Record<string, unknown> {
    const rng = mulberry32(SEED + 5000 + seedOffset) // offset well clear of build.ts's own tier offsets (0-3).
    return {
        name: `Asset Module (${assetCount} assets)`,
        description: 'synthetic asset-heavy module (profiling fixture only)',
        id: hex(rng, 32),
        lorebook: [],
        regex: [],
        trigger: [],
        assets: Array.from({ length: assetCount }, (_, i) => makeRealisticAssetEntry(rng, i)),
    }
}
