import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

//#region module mocks — keep the unit under test isolated from the rest of
// the app's (heavy, side-effecting) dependency graph, matching the pattern
// used in src/ts/storage/tests/risuSave.test.ts and
// src/ts/process/files/tests/inlays.test.ts.

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
}))

const appDataDirMock = vi.fn(async () => '/fake/appdata')
const pathJoinMock = vi.fn(async (...parts: string[]) => parts.join('/'))
vi.mock('@tauri-apps/api/path', () => ({
    appDataDir: appDataDirMock,
    join: pathJoinMock,
}))

const existsMock = vi.fn(async () => false)
const readTextFileMock = vi.fn(async () => 'fake-key')
vi.mock('@tauri-apps/plugin-fs', () => ({
    exists: existsMock,
    readTextFile: readTextFileMock,
}))

const alertClearMock = vi.fn()
const alertErrorMock = vi.fn()
const alertWaitMock = vi.fn()
vi.mock(
    import('src/ts/alert'),
    () =>
        ({
            alertClear: alertClearMock,
            alertError: alertErrorMock,
            alertWait: alertWaitMock,
        }) as unknown as typeof import('src/ts/alert'),
)

const getDatabaseMock = vi.fn(() => ({ aiModel: 'local_test-model.gguf', maxContext: 4096 }))
vi.mock(
    import('src/ts/storage/database.svelte'),
    () =>
        ({
            getDatabase: getDatabaseMock,
        }) as unknown as typeof import('src/ts/storage/database.svelte'),
)

const sleepMock = vi.fn(async (_ms: number) => {})
vi.mock(
    import('src/ts/util'),
    () =>
        ({
            sleep: sleepMock,
        }) as unknown as typeof import('src/ts/util'),
)

//#endregion

const LOCAL_KEY_URL = 'http://localhost:10026/'
const TOKENIZE_URL = 'http://localhost:10026/llamacpp/tokenize'

/** Matches the module's own detection of a CORS/connection-refused failure. */
function networkError(): TypeError {
    return new TypeError('Failed to fetch')
}

function jsonResponse(body: unknown): Response {
    return { json: async () => body } as Response
}

beforeEach(async () => {
    // Every test needs a pristine copy of local.ts so the module-private
    // `initPython` latch starts at its initial value.
    vi.resetModules()
    vi.clearAllMocks()
    existsMock.mockResolvedValue(false)
    appDataDirMock.mockResolvedValue('/fake/appdata')
    readTextFileMock.mockResolvedValue('fake-key')
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('tokenizeGGUFModel — bundled Python sidecar install flow', () => {
    test('install succeeds: proceeds through dependencies + run_py_server, then retries and returns tokens', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })

        let fetchCallCount = 0
        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            fetchCallCount++
            if (url === LOCAL_KEY_URL) {
                // First probe fails (sidecar not up yet), the retry after
                // install succeeds.
                if (fetchCallCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([1, 2, 3])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')
        const result = await tokenizeGGUFModel('hello world')

        expect(result).toEqual([1, 2, 3])

        // Full sequence: install_python -> install_pip -> post_py_install ->
        // 8x install_py_dependencies -> run_py_server.
        expect(invokeMock).toHaveBeenCalledWith('install_python', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('install_pip', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('post_py_install', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        const dependencyCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'install_py_dependencies')
        expect(dependencyCalls).toHaveLength(8)

        // The success path sleeps 4s before declaring the server ready — must
        // not actually be waited on by the test.
        expect(sleepMock).toHaveBeenCalledWith(4000)

        // A retry fetch was attempted after the failed probe, and it succeeded.
        expect(fetchCallCount).toBe(3)
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('definitive failure: alertError fires, no retry fetch, error propagates, and the latch resets for a later attempt', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return false
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to install the bundled Python runtime'),
        )
        // Only the initial probe fetch happened — no retry after a definitive
        // install failure.
        expect(fetchMock).toHaveBeenCalledTimes(1)
        // Only install_python was attempted; the dependency loop and
        // run_py_server must not run when install itself failed.
        expect(invokeMock).toHaveBeenCalledTimes(1)
        expect(invokeMock).toHaveBeenCalledWith('install_python', { path: '/fake/appdata' })

        // The module-private latch must have been reset on failure: a later
        // call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key-2')

        let secondFetchCount = 0
        fetchMock.mockImplementation(async (url: string) => {
            secondFetchCount++
            if (url === LOCAL_KEY_URL) {
                if (secondFetchCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key2.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([9])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })

        const secondResult = await tokenizeGGUFModel('again')

        expect(secondResult).toEqual([9])
        expect(invokeMock).toHaveBeenCalledWith('install_python', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        expect(sleepMock).toHaveBeenCalledWith(4000)
    })

    test('dependency install rejects (llama-cpp-python): alertError identifies the dependency, run_py_server is skipped, no retry fetch, error propagates, and the latch resets for a later attempt', async () => {
        invokeMock.mockImplementation(async (cmd: string, args?: { dependency?: string }) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            if (cmd === 'install_py_dependencies' && args?.dependency === 'llama-cpp-python') {
                throw new Error('native build failed')
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        // run_py_server must never be reached once a dependency install
        // rejects mid-loop.
        expect(invokeMock).not.toHaveBeenCalledWith('run_py_server', expect.anything())

        // The dependency loop ran the earlier dependencies and stopped at
        // llama-cpp-python: uvicorn[standard] and fastapi never ran.
        const dependencyCalls = invokeMock.mock.calls
            .filter(([cmd]) => cmd === 'install_py_dependencies')
            .map(([, args]) => (args as { dependency: string }).dependency)
        expect(dependencyCalls).toEqual([
            'pydantic',
            'scikit-build',
            'scikit-build-core',
            'pyproject_metadata',
            'pathspec',
            'llama-cpp-python',
        ])

        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('llama-cpp-python'),
        )

        // Only the initial probe fetch happened — no retry after a
        // dependency install failure.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again with fresh invokes, not
        // silently no-op forever with the UI stuck on the "Installing
        // Python Dependencies (llama-cpp-python)" spinner.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key-2')

        let secondFetchCount = 0
        fetchMock.mockImplementation(async (url: string) => {
            secondFetchCount++
            if (url === LOCAL_KEY_URL) {
                if (secondFetchCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key2.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([9])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })

        const secondResult = await tokenizeGGUFModel('again')

        expect(secondResult).toEqual([9])
        const secondDependencyCalls = invokeMock.mock.calls.filter(
            ([cmd]) => cmd === 'install_py_dependencies',
        )
        expect(secondDependencyCalls).toHaveLength(8)
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('run_py_server invoke rejects: alertError fires, no retry fetch, error propagates, and the latch resets for a later attempt', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            if (cmd === 'run_py_server') {
                throw new Error('sidecar port already in use')
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        // The full dependency loop ran (nothing there rejected) before
        // run_py_server was attempted and rejected.
        const dependencyCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'install_py_dependencies')
        expect(dependencyCalls).toHaveLength(8)
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })

        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to start the local inference server'),
        )

        // Only the initial probe fetch happened — no retry after
        // run_py_server failed.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again with fresh invokes, not
        // silently no-op forever with the UI stuck on a stale spinner.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key-2')

        let secondFetchCount = 0
        fetchMock.mockImplementation(async (url: string) => {
            secondFetchCount++
            if (url === LOCAL_KEY_URL) {
                if (secondFetchCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key2.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([9])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })

        const secondResult = await tokenizeGGUFModel('again')

        expect(secondResult).toEqual([9])
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('re-entrancy: a second call arriving mid-install does not start a second install sequence', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key')

        let probeCount = 0
        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                probeCount++
                // Both callers' first probe (before any install has
                // happened) fails; every probe after that succeeds.
                if (probeCount <= 2) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([7])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        const [resultA, resultB] = await Promise.all([
            tokenizeGGUFModel('first'),
            tokenizeGGUFModel('second'),
        ])

        expect(resultA).toEqual([7])
        expect(resultB).toEqual([7])

        // Exactly one install sequence must have run, no matter how many
        // overlapping callers raced into installPython().
        const installPythonCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'install_python')
        const runServerCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'run_py_server')
        expect(installPythonCalls).toHaveLength(1)
        expect(runServerCalls).toHaveLength(1)
        expect(sleepMock).toHaveBeenCalledTimes(1)
    })

    test('install_pip resolves false: alertError identifies pip, post_py_install is never invoked, dependencies/run_py_server are skipped, no retry fetch, error propagates, and the latch resets for a later attempt', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return false
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to install Pip'),
        )

        // Writing completed.txt (post_py_install) after a false-returning
        // pip install is exactly what permanently bricks local inference —
        // it must never be reached.
        expect(invokeMock).not.toHaveBeenCalledWith('post_py_install', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('install_py_dependencies', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('run_py_server', expect.anything())
        expect(invokeMock).toHaveBeenCalledTimes(2)
        expect(invokeMock).toHaveBeenCalledWith('install_python', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('install_pip', { path: '/fake/appdata' })

        // Only the initial probe fetch happened — no retry after a
        // definitive pip install failure.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key-2')

        let secondFetchCount = 0
        fetchMock.mockImplementation(async (url: string) => {
            secondFetchCount++
            if (url === LOCAL_KEY_URL) {
                if (secondFetchCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key2.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([9])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })

        const secondResult = await tokenizeGGUFModel('again')

        expect(secondResult).toEqual([9])
        expect(invokeMock).toHaveBeenCalledWith('post_py_install', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('post_py_install resolves false: alertError identifies the finalize step, dependencies/run_py_server are skipped, no retry fetch, error propagates, and the latch resets for a later attempt', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return false
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to finalize the bundled Python runtime installation'),
        )

        expect(invokeMock).not.toHaveBeenCalledWith('install_py_dependencies', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('run_py_server', expect.anything())
        expect(invokeMock).toHaveBeenCalledTimes(3)
        expect(invokeMock).toHaveBeenCalledWith('install_python', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('install_pip', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('post_py_install', { path: '/fake/appdata' })

        // Only the initial probe fetch happened — no retry after a
        // definitive finalize-install failure.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key-2')

        let secondFetchCount = 0
        fetchMock.mockImplementation(async (url: string) => {
            secondFetchCount++
            if (url === LOCAL_KEY_URL) {
                if (secondFetchCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key2.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([9])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })

        const secondResult = await tokenizeGGUFModel('again')

        expect(secondResult).toEqual([9])
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('install_pip invoke rejects: alertError identifies pip, post_py_install is never invoked, dependencies/run_py_server are skipped, no retry fetch, error propagates, and the latch resets for a later attempt', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                throw new Error('pip network reset')
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to install Pip'),
        )

        expect(invokeMock).not.toHaveBeenCalledWith('post_py_install', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('install_py_dependencies', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('run_py_server', expect.anything())
        expect(invokeMock).toHaveBeenCalledTimes(2)

        // Only the initial probe fetch happened — no retry after a pip
        // install that throws.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key-2')

        let secondFetchCount = 0
        fetchMock.mockImplementation(async (url: string) => {
            secondFetchCount++
            if (url === LOCAL_KEY_URL) {
                if (secondFetchCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key2.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([9])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })

        const secondResult = await tokenizeGGUFModel('again')

        expect(secondResult).toEqual([9])
        expect(invokeMock).toHaveBeenCalledWith('post_py_install', { path: '/fake/appdata' })
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('post_py_install invoke rejects: alertError identifies the finalize step, dependencies/run_py_server are skipped, no retry fetch, error propagates, and the latch resets for a later attempt', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                throw new Error('disk full while rewriting python311._pth')
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to finalize the bundled Python runtime installation'),
        )

        expect(invokeMock).not.toHaveBeenCalledWith('install_py_dependencies', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('run_py_server', expect.anything())
        expect(invokeMock).toHaveBeenCalledTimes(3)

        // Only the initial probe fetch happened — no retry after a
        // finalize step that throws.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return true
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })
        readTextFileMock.mockResolvedValue('fake-key-2')

        let secondFetchCount = 0
        fetchMock.mockImplementation(async (url: string) => {
            secondFetchCount++
            if (url === LOCAL_KEY_URL) {
                if (secondFetchCount === 1) {
                    throw networkError()
                }
                return jsonResponse({ dir: '/fake/appdata/key2.txt' })
            }
            if (url === TOKENIZE_URL) {
                return jsonResponse([9])
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })

        const secondResult = await tokenizeGGUFModel('again')

        expect(secondResult).toEqual([9])
        expect(invokeMock).toHaveBeenCalledWith('run_py_server', { pyPath: '/fake/appdata' })
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('regression guard: when install_pip fails, post_py_install (which writes completed.txt) must never be invoked', async () => {
        // This is the exact bug that motivated this test suite: install_pip
        // used to always resolve falsy on success due to a copy-paste
        // stdout check, so post_py_install (and its completed.txt write)
        // could run even though pip was never actually installed —
        // permanently bricking local inference on every future launch.
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'install_python') {
                return true
            }
            if (cmd === 'install_pip') {
                return false
            }
            if (cmd === 'post_py_install') {
                return true
            }
            return undefined
        })

        const fetchMock = vi.fn<(url: string) => Promise<Response>>(async (url) => {
            if (url === LOCAL_KEY_URL) {
                throw networkError()
            }
            throw new Error(`unexpected fetch url: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const { tokenizeGGUFModel } = await import('../local')

        await expect(tokenizeGGUFModel('hello')).rejects.toMatch(
            /local inference sidecar could not be started/,
        )

        expect(invokeMock).not.toHaveBeenCalledWith('post_py_install', expect.anything())
    })
})
