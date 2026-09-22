/**
 * CHORE-17 driver: `vite build`s the throwaway browser bundle
 * (`chore17-vite-build.config.ts`), serves the output on a private static
 * server (default port 5299 — NOT 5174, never touches the maintainer's dev
 * server), drives it with a real, separately-installed headless Chrome via
 * `playwright-core` (installed as a throwaway dependency outside this repo's
 * `package.json` — see the reply for the exact install command), and prints
 * the JSON results the entry script (`chore17-entry.svelte.ts`) collects.
 *
 * Chrome must be launched with `--js-flags=--expose-gc` for `window.gc()` to
 * exist (confirmed: without it, `typeof window.gc === 'undefined'`) — same
 * requirement as this project's Node harnesses' `NODE_OPTIONS=--expose-gc`.
 *
 * Usage (repo root):
 *   node Agents/Tools/save-gen/chore17-run.mjs
 *
 * Env overrides:
 *   CHORE17_CHROME_PATH   path to chrome.exe (default: the machine's
 *                         installed Chrome, found at C:/Program
 *                         Files/Google/Chrome/Application/chrome.exe)
 *   CHORE17_PLAYWRIGHT_MODULE  path to a playwright-core install (default:
 *                         a throwaway node_modules this script expects
 *                         under the OS temp dir — see the reply)
 *   CHORE17_PORT          static-server port (default 5299)
 *
 * Read-only w.r.t. `src/` and does not modify `package.json` — playwright-core
 * is resolved from a path outside the repo, never added as a repo dependency.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DIST_DIR = path.resolve(REPO_ROOT, 'Agents/Tools/output/chore17-dist')
const PORT = Number(process.env.CHORE17_PORT || 5299)
const CHROME_PATH = process.env.CHORE17_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PLAYWRIGHT_MODULE = process.env.CHORE17_PLAYWRIGHT_MODULE

if (!PLAYWRIGHT_MODULE) {
    console.error('CHORE17_PLAYWRIGHT_MODULE is required — path to a throwaway playwright-core install (e.g. .../temp/chore17-tools/node_modules/playwright-core/index.js). See the reply for the install command.')
    process.exit(1)
}

console.log(`[chore17] building browser bundle with vite (production mode) ...`)
execFileSync('npx', ['vite', 'build', '--config', 'Agents/Tools/save-gen/chore17-vite-build.config.ts'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
})

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' }

const server = createServer(async (req, res) => {
    try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
        if (urlPath === '/') urlPath = '/index.html'
        const filePath = path.join(DIST_DIR, urlPath)
        if (!filePath.startsWith(DIST_DIR)) { res.writeHead(403); res.end(); return }
        const s = await stat(filePath).catch(() => null)
        if (!s || !s.isFile()) { res.writeHead(404); res.end('not found: ' + urlPath); return }
        const ext = path.extname(filePath)
        const body = await readFile(filePath)
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(body)
    } catch (err) {
        res.writeHead(500)
        res.end(String(err))
    }
})

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
console.log(`[chore17] static server on http://127.0.0.1:${PORT}`)

const playwrightModule = await import(pathToFileURL(PLAYWRIGHT_MODULE).href)
const chromium = (playwrightModule.default || playwrightModule).chromium

console.log(`[chore17] launching headless Chrome (${CHROME_PATH}) with --expose-gc ...`)
const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--js-flags=--expose-gc', '--no-sandbox', '--enable-precise-memory-info'],
})

try {
    const page = await browser.newPage()
    page.on('console', (msg) => console.log('[page]', msg.text()))
    page.on('pageerror', (err) => console.error('[page error]', err))

    const url = `http://127.0.0.1:${PORT}/Agents/Tools/save-gen/chore17.html`
    console.log(`[chore17] navigating to ${url} ...`)
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })

    console.log('[chore17] waiting for the harness to finish (this does real IndexedDB I/O and can take a few minutes for 1000 characters) ...')
    await page.waitForFunction(() => window.__CHORE17_DONE__ === true, { timeout: 600000 })

    const error = await page.evaluate(() => window.__CHORE17_ERROR__)
    if (error) {
        console.error('[chore17] harness threw:\n' + error)
        process.exitCode = 1
    } else {
        const results = await page.evaluate(() => window.__CHORE17_RESULTS__)
        console.log('=== CHORE-17 RESULTS (JSON) ===')
        console.log(JSON.stringify(results, null, 2))
        console.log('=== end ===')
    }
} finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
}
