/**
 * Throwaway vitest config for the synthetic save-data generator.
 *
 * This harness now lives inside the repo, under Agents/Tools/. It mirrors
 * the repo's own vitest.config.ts (same plugin, alias, environment,
 * setupFiles) but with `root` pinned to the repo root (so the `src` alias
 * and every relative resolution inside it still work) and `include`
 * narrowed to ONLY the save-gen harness files. This is what lets the
 * generator reuse RisuAI's real encodeRisuSaveLegacy/decodeRisuSave via the
 * exact vi.mock pattern from src/ts/storage/tests/risuSave.test.ts.
 *
 * This config is NOT what keeps these files out of `pnpm test` — `pnpm
 * test` uses the repo's own vitest.config.ts, which declares no `include`
 * and so falls back to vitest's default glob
 * (`**\/*.{test,spec}.?(c|m)[jt]s?(x)`). The harness files under
 * save-gen/ are named `*.harness.ts`, not `*.spec.ts` or `*.test.ts`, so
 * that default glob never matches them and `pnpm test` never discovers or
 * runs them. That suffix is the actual safety mechanism; do not rename
 * these files back to `*.spec.ts`.
 *
 * Run with (from the repo root, so node_modules resolves):
 *   npx vitest run --config "<this file>"
 */
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// Agents/Tools/vitest.harness.config.ts -> repo root is two levels up.
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
    root: REPO_ROOT,
    plugins: [svelte()],
    resolve: {
        alias: {
            src: '/src',
        },
        conditions: ['browser'],
    },
    test: {
        environment: 'happy-dom',
        setupFiles: ['vitest.setup.ts'],
        include: [
            'Agents/Tools/save-gen/*.harness.ts',
        ],
    },
})
