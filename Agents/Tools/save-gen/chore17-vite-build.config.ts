/**
 * CHORE-17 throwaway Vite BUILD config — NOT a dev server, and does not touch
 * the maintainer's `pnpm dev` on port 5174.
 *
 * Produces a real, production-conditioned browser bundle of the REAL
 * `RisuSaveEncoder` (`src/ts/storage/risuSave.ts`, completely unmodified —
 * this config only redirects two of its sibling imports, see the
 * `chore17-stub-siblings` plugin below) plus a Svelte 5 rune-compiled entry
 * file, for measurement in a real headless Chromium with real IndexedDB
 * (`Agents/Tools/save-gen/chore17-run.mjs` drives it).
 *
 * `vite build`'s default mode is `production` — this is what gives the
 * "production-conditioned Svelte 5.55.1 bundle" the task asks for, the same
 * way the repo's own `vite build` does, with no extra flags needed (Vite
 * injects its own `production` resolve condition ahead of any custom one in
 * build mode, which is what `esm-env`-based packages like Svelte key off of
 * — see `Agents/Tools/README.md`'s note on why `NODE_ENV=production` rather
 * than a `resolve.conditions` override is what actually works for that).
 *
 * Output goes to `Agents/Tools/output/chore17-dist/` (gitignored, same as
 * every other `Agents/Tools/output/` artifact).
 *
 * Read-only w.r.t. `src/` — this config imports `src/ts/storage/risuSave.ts`
 * unmodified; it does not edit it.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SAVE_GEN_DIR = path.resolve(REPO_ROOT, 'Agents/Tools/save-gen')

/**
 * Redirects exactly the two sibling imports `src/ts/storage/risuSave.ts`
 * makes that this harness stubs (see the two stub files' own header
 * comments for why each is stubbed rather than left real). Scoped to
 * `importer` ending in `risuSave.ts` specifically, and to the exact relative
 * specifier strings risuSave.ts itself uses, so this plugin cannot
 * accidentally redirect an unrelated file's import of a same-named module —
 * confirmed by reading risuSave.ts's own import statements before writing
 * this (`./database.svelte`, `../globalApi.svelte`).
 */
function stubRisuSaveSiblings() {
    return {
        name: 'chore17-stub-risusave-siblings',
        enforce: 'pre' as const,
        resolveId(source: string, importer: string | undefined) {
            if (!importer) return null
            const normalized = importer.replace(/\\/g, '/')
            if (!normalized.endsWith('src/ts/storage/risuSave.ts')) return null
            if (source === './database.svelte') {
                return path.resolve(SAVE_GEN_DIR, 'chore17-stub-database.ts')
            }
            if (source === '../globalApi.svelte') {
                return path.resolve(SAVE_GEN_DIR, 'chore17-stub-globalapi.ts')
            }
            // CHORE-17 skip re-measurement: redirects to an INSTRUMENTED
            // passthrough, not a fake stub -- see that file's own header for
            // why a live-binding ES export can't be monkey-patched the way
            // localforage.createInstance is, further down in this harness.
            if (source === './saveYield') {
                return path.resolve(SAVE_GEN_DIR, 'chore17-stub-saveyield-instrumented.ts')
            }
            return null
        },
    }
}

export default defineConfig({
    root: REPO_ROOT,
    plugins: [svelte(), stubRisuSaveSiblings()],
    resolve: {
        alias: {
            src: path.resolve(REPO_ROOT, 'src'),
        },
    },
    build: {
        outDir: path.resolve(REPO_ROOT, 'Agents/Tools/output/chore17-dist'),
        emptyOutDir: true,
        target: 'esnext',
        minify: false,
        sourcemap: false,
        rollupOptions: {
            input: path.resolve(SAVE_GEN_DIR, 'chore17.html'),
        },
    },
})
