/**
 * CHORE-17 FOLLOW-UP throwaway Vite BUILD config — NOT a dev server, does not
 * touch the maintainer's `pnpm dev` on port 5174.
 *
 * Separate from `chore17-vite-build.config.ts` (the original phase-breakdown
 * harness, left untouched and still working) because this follow-up needs a
 * much wider REAL import graph: the actual `setDatabase`/`setDatabaseLite`/
 * `getDatabase` (`src/ts/storage/database.svelte.ts`), the actual `DBState`
 * singleton and its baseline `$effect.root` (`src/ts/stores.svelte.ts`), and
 * the actual `registerDbChangeEffects` reactive graph
 * (`src/ts/storage/dbChangeEffects.svelte.ts`) — none of which the original
 * config's importer-scoped stub (risuSave.ts only) would satisfy.
 *
 * The stub list below was arrived at empirically: attempt a real build,
 * follow Rollup's "could not resolve" / "is not exported by" errors one at a
 * time, and stub only the specific sibling import that error names — see
 * each stub file's own header for why it, specifically, is not real. Every
 * stub here cuts off a subsystem that is a bystander to setDatabase/
 * setDatabaseLite/getDatabase/registerDbChangeEffects, not part of what this
 * follow-up measures (module editor, script engine, plugin sandbox, HypaV3
 * memory compression, theme application, markdown/parser pipeline,
 * character-card import/export) — confirmed by reading each real file's
 * body before stubbing it away, not assumed.
 *
 * A single `resolveId` plugin, importer-FILTERED to this repo's own
 * `src/ts/` tree (excluding `node_modules`), does the redirecting. An
 * earlier version of this config used `resolve.alias` (regex form) instead,
 * because a first attempt at a generic (unfiltered) `resolveId` plugin
 * seemed to intermittently miss some importers of the same target file. It
 * turned out that theory was WRONG: the real bug was that the unfiltered
 * plugin ALSO matched several third-party packages' own internal relative
 * imports of the SAME common filenames -- e.g. `sucrase`'s and
 * `postcss-selector-parser`'s own `'./util'`/`'../util'` (confirmed by
 * reading the actual error: `canInsertSemicolon`/`eatContextual`/`expect`
 * are sucrase's tokenizer internals, not this repo's `util.ts`) -- silently
 * redirecting THEIR internal imports to this repo's stub and corrupting
 * their own module graphs, which is what produced confusing, seemingly
 * nondeterministic errors elsewhere. Filtering by importer path (this
 * repo's `src/ts/` only) fixes both problems at once and is more precise
 * than `resolve.alias`, which has no importer context at all.
 *
 * Also empirically required: `import type {...}` specifiers do NOT reliably
 * erase under this repo's Vite 8 / rolldown-vite toolchain even when every
 * specifier in the statement is type-only (e.g. `stores.svelte.ts`'s
 * `import type { hubType } from "./characterCards"`) — the target module
 * still gets resolved, parsed, and (absent a stub) bundled for real, which
 * is why bystander subsystems this far from setDatabase/setDatabaseLite/
 * getDatabase/registerDbChangeEffects are reachable at all.
 *
 * Read-only w.r.t. `src/` — every stub redirect points OUT of `src/` to a
 * file under this directory; it does not edit anything under `src/`.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import wasm from 'vite-plugin-wasm'
import { defineConfig } from 'vite'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SAVE_GEN_DIR = path.resolve(REPO_ROOT, 'Agents/Tools/save-gen')

function stub(name: string): string {
    return path.resolve(SAVE_GEN_DIR, name)
}

function importerEndsWith(importer: string | undefined, suffix: string): boolean {
    if (!importer) return false
    return importer.replace(/\\/g, '/').endsWith(suffix)
}

/** True iff `importer` is one of THIS repo's own src/ts files (never a node_modules dependency's internal import of a same-named sibling -- see header). */
function isOwnSourceImporter(importer: string | undefined): boolean {
    if (!importer) return false
    const norm = importer.replace(/\\/g, '/')
    return norm.includes('/src/ts/') && !norm.includes('/node_modules/')
}

/** True iff `source` (a relative or `src/`-rooted import specifier) resolves to a sibling module named exactly `moduleName` at ANY relative depth -- e.g. moduleName='util' matches './util', '../util', '../../util', 'src/ts/util', but not '../utilFoo', '../traverser/util', or 'src/ts/util/inlayTokens'. */
function matchesModule(source: string, moduleName: string): boolean {
    if (source === `src/ts/${moduleName}`) return true
    if (!(source.startsWith('.') || source.startsWith('src/'))) return false
    const escaped = moduleName.replace(/[.]/g, '\\.').replace(/\//g, '\\/')
    return new RegExp(`^(\\.\\.?/)*${escaped}$`).test(source)
}

function chore17FollowupStubs() {
    return {
        name: 'chore17-followup-stubs',
        enforce: 'pre' as const,
        resolveId(source: string, importer: string | undefined) {
            // Scoped to risuSave.ts's own import (same stub the original
            // harness uses) -- this bundle ALSO loads the REAL
            // src/ts/storage/database.svelte.ts elsewhere (for the real
            // setDatabase/setDatabaseLite/getDatabase), so this ONE redirect
            // must stay importer-scoped, not blanket.
            if (importerEndsWith(importer, 'src/ts/storage/risuSave.ts') && matchesModule(source, 'database.svelte')) {
                return stub('chore17-stub-database.ts')
            }
            // CHORE-17 skip re-measurement: instrumented passthrough, see
            // chore17-stub-saveyield-instrumented.ts's own header.
            if (importerEndsWith(importer, 'src/ts/storage/risuSave.ts') && matchesModule(source, 'saveYield')) {
                return stub('chore17-stub-saveyield-instrumented.ts')
            }

            // Every other redirect below is importer-FILTERED to this
            // repo's own src/ts/ tree (see isOwnSourceImporter's header) --
            // never applies inside node_modules, regardless of how common
            // the target filename is.
            if (!isOwnSourceImporter(importer)) return null

            if (matchesModule(source, 'globalApi.svelte')) return stub('chore17-stub-globalapi.ts')
            if (matchesModule(source, 'util')) return stub('chore17-stub-util.ts')
            if (matchesModule(source, 'gui/colorscheme') || matchesModule(source, 'colorscheme')) return stub('chore17-stub-colorscheme.ts')
            if (matchesModule(source, 'process/memory/hypav3') || matchesModule(source, 'hypav3')) return stub('chore17-stub-hypav3.ts')
            if (matchesModule(source, 'process/modules')) return stub('chore17-stub-process-modules.ts')
            if (matchesModule(source, 'process/scripts')) return stub('chore17-stub-process-scripts.ts')
            if (matchesModule(source, 'parser/parser.svelte') || matchesModule(source, 'parser.svelte')) return stub('chore17-stub-parser.ts')
            if (matchesModule(source, 'characterCards')) return stub('chore17-stub-charactercards.ts')
            if (matchesModule(source, 'characters')) return stub('chore17-stub-characters.ts')

            return null
        },
    }
}

export default defineConfig({
    root: REPO_ROOT,
    plugins: [svelte(), wasm(), chore17FollowupStubs()],
    resolve: {
        alias: {
            src: path.resolve(REPO_ROOT, 'src'),
        },
    },
    build: {
        outDir: path.resolve(REPO_ROOT, 'Agents/Tools/output/chore17-followup-dist'),
        emptyOutDir: true,
        target: 'esnext',
        minify: false,
        sourcemap: false,
        rollupOptions: {
            input: path.resolve(SAVE_GEN_DIR, 'chore17-followup.html'),
        },
    },
})
