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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
        // Only the support-gate check and install_python were attempted;
        // the dependency loop and run_py_server must not run when install
        // itself failed. Asserted as the exact ordered call sequence
        // (rather than a raw call count) so this stays correct if another
        // leading gate check is ever added.
        expect(invokeMock.mock.calls.map(([cmd]) => cmd)).toEqual([
            'local_inference_unsupported_reason',
            'install_python',
        ])
        expect(invokeMock).toHaveBeenCalledWith('install_python', { path: '/fake/appdata' })

        // The module-private latch must have been reset on failure: a later
        // call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
        // Asserted as the exact ordered call sequence (rather than a raw
        // call count) so this stays correct if another leading gate check
        // is ever added.
        expect(invokeMock.mock.calls.map(([cmd]) => cmd)).toEqual([
            'local_inference_unsupported_reason',
            'install_python',
            'install_pip',
        ])
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
        // Asserted as the exact ordered call sequence (rather than a raw
        // call count) so this stays correct if another leading gate check
        // is ever added.
        expect(invokeMock.mock.calls.map(([cmd]) => cmd)).toEqual([
            'local_inference_unsupported_reason',
            'install_python',
            'install_pip',
            'post_py_install',
        ])
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
        // Asserted as the exact ordered call sequence (rather than a raw
        // call count) so this stays correct if another leading gate check
        // is ever added.
        expect(invokeMock.mock.calls.map(([cmd]) => cmd)).toEqual([
            'local_inference_unsupported_reason',
            'install_python',
            'install_pip',
        ])

        // Only the initial probe fetch happened — no retry after a pip
        // install that throws.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
        // Asserted as the exact ordered call sequence (rather than a raw
        // call count) so this stays correct if another leading gate check
        // is ever added.
        expect(invokeMock.mock.calls.map(([cmd]) => cmd)).toEqual([
            'local_inference_unsupported_reason',
            'install_python',
            'install_pip',
            'post_py_install',
        ])

        // Only the initial probe fetch happened — no retry after a
        // finalize step that throws.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private latch must have been reset on failure: a
        // later call should do real work again, not silently no-op.
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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

    test('unsupported platform: gate resolves a reason string, bails before any download even when completed.txt already exists, and does not latch initPython off for a later call', async () => {
        const reason = 'Local inference is not supported on ARM64 Windows.'
        // completed.txt already exists (e.g. from a previous install on a
        // different machine/architecture, or a synced app-data folder).
        // The gate must win regardless — a gate placed after this check
        // would let an ARM user with a stale prior install slip straight
        // through to run_py_server.
        existsMock.mockResolvedValue(true)
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'local_inference_unsupported_reason') {
                return reason
            }
            // Any other command firing here is exactly the bug this test
            // guards against: the gate must refuse before anything else
            // is ever invoked.
            throw new Error(`unexpected invoke: ${cmd}`)
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

        expect(alertClearMock).toHaveBeenCalled()
        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(reason)
        // The UI must never even flash an "Installing..." spinner for a
        // platform that was refused up front.
        expect(alertWaitMock).not.toHaveBeenCalled()

        // The whole point of the gate: refuse before any download begins.
        // No other invoke happens at all.
        expect(invokeMock).toHaveBeenCalledTimes(1)
        expect(invokeMock).toHaveBeenCalledWith('local_inference_unsupported_reason')
        expect(invokeMock).not.toHaveBeenCalledWith('install_python', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('install_pip', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('post_py_install', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('install_py_dependencies', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('run_py_server', expect.anything())

        // No retry fetch was performed — only the initial probe.
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // The module-private `initPython` latch must never have been set
        // on this refused path: a later call, once the gate reports the
        // platform as supported, must do real work rather than being
        // permanently no-op'd off.
        existsMock.mockResolvedValue(false)
        invokeMock.mockClear()
        fetchMock.mockClear()
        alertErrorMock.mockClear()
        alertClearMock.mockClear()
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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
        expect(alertErrorMock).not.toHaveBeenCalled()
    })

    test('unsupported-reason check rejects: alertError fires with a clean-failure message, no other invoke happens, and the error propagates', async () => {
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'local_inference_unsupported_reason') {
                throw new Error('IPC channel closed')
            }
            throw new Error(`unexpected invoke: ${cmd}`)
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

        expect(alertClearMock).toHaveBeenCalled()
        expect(alertErrorMock).toHaveBeenCalledTimes(1)
        expect(alertErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to check local inference support'),
        )
        expect(alertWaitMock).not.toHaveBeenCalled()

        expect(invokeMock).toHaveBeenCalledTimes(1)
        expect(invokeMock).toHaveBeenCalledWith('local_inference_unsupported_reason')
        expect(invokeMock).not.toHaveBeenCalledWith('install_python', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('install_pip', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('post_py_install', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('install_py_dependencies', expect.anything())
        expect(invokeMock).not.toHaveBeenCalledWith('run_py_server', expect.anything())

        // No retry fetch after a definitive gate-check failure.
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('placement invariant: two concurrent calls each hit the support-gate check, but still produce exactly one install_python and one run_py_server', async () => {
        // The support-gate invoke is a deliberate `await` placed BEFORE
        // the re-entrancy guard (`if(initPython){...}; initPython = true`),
        // never between that check and that set. If it were ever moved
        // into that gap, two concurrent callers could both observe
        // `initPython === false` and both start a duplicate install (and
        // duplicate run_py_server, racing for port 10026). This test
        // fails if the gate call is ever relocated into that gap.
        invokeMock.mockImplementation(async (cmd: string) => {
            if (cmd === 'local_inference_unsupported_reason') {
                return null
            }
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

        // Both overlapping callers reach the gate check — it runs
        // unconditionally on every call, ahead of the latch guard.
        const gateCalls = invokeMock.mock.calls.filter(
            ([cmd]) => cmd === 'local_inference_unsupported_reason',
        )
        expect(gateCalls).toHaveLength(2)

        // ...but exactly one install sequence and one server start must
        // have run, no matter how many overlapping callers raced into
        // installPython() after the gate.
        const installPythonCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'install_python')
        const runServerCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'run_py_server')
        expect(installPythonCalls).toHaveLength(1)
        expect(runServerCalls).toHaveLength(1)
        expect(sleepMock).toHaveBeenCalledTimes(1)
    })
})
