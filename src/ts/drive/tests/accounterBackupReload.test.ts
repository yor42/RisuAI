/**
 * Report 17 ("CHORE-01 + Phase 2 item 2") Stage 1, Gate 2 (opus-reviewer,
 * REJECT) should-fix item: "Backup-load wiring is untested" -- the account
 * backup loader (`loadRisuAccountBackup`, `src/ts/drive/accounter.ts`, ~line
 * 134) had no test asserting `requiresFullEncoderReload.state` actually gets
 * set after a backup load, despite carrying a comment claiming exactly that
 * (plan §3.3, "the other three call sites already do this"). Its sibling,
 * `loadInternalBackup()` (globalApi.svelte.ts), has its own test file
 * (`src/ts/globalApi.loadInternalBackup.svelte.test.ts`).
 *
 * Drives the REAL, unmocked `loadRisuAccountBackup()`. All I/O (network via
 * `fetchProtectedResource`, the various alert prompts) is mocked; `AppendableBuffer`
 * is a lightweight concat-only stand-in (not the real one from globalApi.svelte.ts,
 * which is a heavy module -- see the comment on that mock below). `decodeRisuSave`
 * / `RisuSaveEncoder` are the REAL `src/ts/storage/risuSave.ts`, so the backup
 * bytes this test decodes are genuine, not hand-rolled fixtures.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

//#region module mocks

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(async () => {}),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(async () => {}),
    readFile: vi.fn(async () => new Uint8Array()),
    BaseDirectory: { AppData: 0 },
}))

vi.mock(import('../../characterCards'), () => ({
    hubURL: 'https://example.invalid',
}) as unknown as typeof import('../../characterCards'))

vi.mock(import('../../storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => ({ account: { token: 'test-token', data: {} } })),
    setDatabase: vi.fn(),
    presetTemplate: { name: 'test-preset' },
}) as unknown as typeof import('../../storage/database.svelte'))

const alertSelectImpl = vi.hoisted(() => ({ fn: vi.fn(async (..._args: unknown[]) => '0') }))

vi.mock(import('../../alert'), () => ({
    alertConfirm: vi.fn(async () => true),
    alertError: vi.fn(),
    alertMd: vi.fn(),
    alertNormal: vi.fn(),
    alertSelect: (...args: unknown[]) => alertSelectImpl.fn(...args),
    alertWait: vi.fn(),
}) as unknown as typeof import('../../alert'))

const requiresFullEncoderReloadMock = vi.hoisted(() => ({ state: false }))

/**
 * `AppendableBuffer` here is a lightweight, concat-only stand-in for
 * globalApi.svelte.ts's real one -- loading the real globalApi.svelte.ts
 * module for this test would require the same ~25-module mock scaffold
 * globalApi.saveSequence.svelte.test.ts and globalApi.loadInternalBackup.svelte.test.ts
 * already carry (for loadInternalBackup(), the sibling of this test's
 * subject), which is unnecessary here: `loadRisuAccountBackup()` only uses
 * AppendableBuffer's `append`/`buffer` contract and never touches anything
 * else globalApi.svelte.ts exports. `requiresFullEncoderReload` is the actual
 * object under test -- accounter.ts imports this SAME mocked object (not the
 * real, `$state`-backed one), since it's what `loadRisuAccountBackup()` itself
 * reads/writes via that import. Defined inline inside the factory (not as a
 * top-level `const`) because vi.mock factories are hoisted above their
 * module's own top-level declarations.
 */
vi.mock(import('../../globalApi.svelte'), () => ({
    AppendableBuffer: class {
        private chunks: Uint8Array[] = []
        append(chunk: Uint8Array) {
            this.chunks.push(chunk)
        }
        get buffer(): Uint8Array {
            const total = this.chunks.reduce((n, c) => n + c.length, 0)
            const out = new Uint8Array(total)
            let offset = 0
            for (const c of this.chunks) {
                out.set(c, offset)
                offset += c.length
            }
            return out
        }
    },
    requiresFullEncoderReload: requiresFullEncoderReloadMock,
}) as unknown as typeof import('../../globalApi.svelte'))

type FetchProtectedResourceMock = (url: string, options?: RequestInit) => Promise<{
    status: number
    text: () => Promise<string>
    json?: () => Promise<unknown>
    body?: { getReader: () => { read: () => Promise<{ done: boolean, value?: Uint8Array }> } }
}>

const fetchProtectedResourceImpl = vi.hoisted(() => ({ fn: vi.fn() as unknown as FetchProtectedResourceMock }))

vi.mock(import('../../sionyw'), () => ({
    fetchProtectedResource: (...args: [string, RequestInit?]) => fetchProtectedResourceImpl.fn(...args),
}) as unknown as typeof import('../../sionyw'))

//#endregion

import { loadRisuAccountBackup } from '../accounter'
import { RisuSaveEncoder } from '../../storage/risuSave'
import type { Database } from '../../storage/database.svelte'

type CharacterFixture = Database['characters'][number]

function makeCharacter(chaId: string, name: string): CharacterFixture {
    return {
        chaId,
        name,
        type: 'character',
        chatPage: 0,
        chats: [{ id: `${chaId}-chat-0`, message: [], note: '', name: '', localLore: [] }],
    } as unknown as CharacterFixture
}

function buildDb(characters: CharacterFixture[]): Database {
    return {
        formatversion: 5,
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters,
    } as unknown as Database
}

/** A single-chunk-then-done ReadableStream reader, mirroring fetch's Response.body contract. */
function makeSingleChunkReader(data: Uint8Array) {
    let consumed = false
    return {
        read: async () => {
            if (consumed) {
                return { done: true, value: undefined }
            }
            consumed = true
            return { done: false, value: data }
        },
    }
}

beforeEach(() => {
    requiresFullEncoderReloadMock.state = false
    alertSelectImpl.fn = vi.fn(async () => '0') // selects backups[0] (backupIdNum === backups.length means "Cancel")
})

describe('loadRisuAccountBackup — Report 17 Stage 1 Gate 2 should-fix: backup-load wiring untested', () => {
    test('a real backup load through the REAL loadRisuAccountBackup() sets requiresFullEncoderReload.state', async () => {
        const backupDb = buildDb([makeCharacter('char-A', 'A from account backup')])
        const encoder = new RisuSaveEncoder()
        await encoder.init(backupDb, { compression: false, skipRemoteSavingOnCharacters: false })
        const encoded = new Uint8Array(encoder.encode()!)

        fetchProtectedResourceImpl.fn = vi.fn(async (url: string) => {
            if (url === '/hub/backup/list') {
                return { status: 200, text: async () => '', json: async () => ['1700000000'] }
            }
            if (url === '/hub/backup/get') {
                return { status: 200, text: async () => '', body: { getReader: () => makeSingleChunkReader(encoded) } }
            }
            throw new Error(`unexpected fetchProtectedResource call: ${url}`)
        }) as unknown as FetchProtectedResourceMock

        expect(requiresFullEncoderReloadMock.state).toBe(false)

        await loadRisuAccountBackup()

        // THE ASSERTION UNDER TEST -- red-proven by temporarily disabling the
        // single `requiresFullEncoderReload.state = true` line in
        // accounter.ts's loadRisuAccountBackup() and confirming this fails,
        // then restoring the file byte-identical.
        expect(requiresFullEncoderReloadMock.state).toBe(true)
    })
})
