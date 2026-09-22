/**
 * CHORE-17 FOLLOW-UP driver -- same pattern as chore17-run.mjs (build with
 * vite, serve statically on a private port, drive with a real headless
 * Chrome via playwright-core, print JSON results). Never touches port 5174.
 *
 * Usage (repo root):
 *   CHORE17_PLAYWRIGHT_MODULE=<path to playwright-core/index.js> \
 *     node Agents/Tools/save-gen/chore17-followup-run.mjs
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DIST_DIR = path.resolve(REPO_ROOT, 'Agents/Tools/output/chore17-followup-dist')
const PORT = Number(process.env.CHORE17_PORT || 5298)
const CHROME_PATH = process.env.CHORE17_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PLAYWRIGHT_MODULE = process.env.CHORE17_PLAYWRIGHT_MODULE

if (!PLAYWRIGHT_MODULE) {
    console.error('CHORE17_PLAYWRIGHT_MODULE is required.')
    process.exit(1)
}

console.log('[chore17-followup] building browser bundle with vite (production mode) ...')
execFileSync('npx', ['vite', 'build', '--config', 'Agents/Tools/save-gen/chore17-followup-vite-build.config.ts'], {
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
console.log(`[chore17-followup] static server on http://127.0.0.1:${PORT}`)

const playwrightModule = await import(pathToFileURL(PLAYWRIGHT_MODULE).href)
const chromium = (playwrightModule.default || playwrightModule).chromium

console.log(`[chore17-followup] launching headless Chrome (${CHROME_PATH}) with --expose-gc ...`)
const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--js-flags=--expose-gc', '--no-sandbox', '--enable-precise-memory-info'],
})

try {
    const page = await browser.newPage()
    page.on('console', (msg) => console.log('[page]', msg.text()))
    page.on('pageerror', (err) => console.error('[page error]', err))

    const url = `http://127.0.0.1:${PORT}/Agents/Tools/save-gen/chore17-followup.html`
    console.log(`[chore17-followup] navigating to ${url} ...`)
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })

    console.log('[chore17-followup] waiting for the harness to finish ...')
    await page.waitForFunction(() => window.__CHORE17_FOLLOWUP_DONE__ === true, { timeout: 600000 })

    const error = await page.evaluate(() => window.__CHORE17_FOLLOWUP_ERROR__)
    if (error) {
        console.error('[chore17-followup] harness threw:\n' + error)
        process.exitCode = 1
    } else {
        const results = await page.evaluate(() => window.__CHORE17_FOLLOWUP_RESULTS__)
        console.log('=== CHORE-17 FOLLOW-UP RESULTS (JSON) ===')
        console.log(JSON.stringify(results, null, 2))
        console.log('=== end ===')
    }
} finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
}
