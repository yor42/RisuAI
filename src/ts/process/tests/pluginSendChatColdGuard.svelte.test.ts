/**
 * CHORE-07 stage 7c-1 -- the v3 plugin API's `risuai.sendChat`
 * (`src/ts/plugins/apiV3/v3.svelte.ts`) must refuse a chat whose first
 * message is still a live cold-storage pointer (`isColdChat`) BEFORE the
 * permission prompt (`getPluginPermission`) and BEFORE pushing the
 * plugin's message into `chat.message` -- not only after. The 7b guard
 * (`isColdChat` check in `sendChat`, `src/ts/process/index.svelte.ts`
 * ~:221-230) runs inside `processSendChat`, which this handler only calls
 * AFTER the permission prompt and the push have already happened.
 * Agents/Reports/13-chore07-cold-read-failure-plan.md §5.2 item 5, gate
 * finding 1.
 *
 * RED-first: this test is written and run against pre-7c-1 (92b9bba7)
 * `v3.svelte.ts`, whose `sendChat` had no guard of its own at the top of
 * the function at all -- it went straight into `getPluginPermission`
 * (which, on a plugin with no recorded permission decision, prompts via
 * `alertConfirm`) and then pushed `message` into `chat.message` before
 * `processSendChat` ever ran. The failing run against that source is
 * recorded in this round's handoff.
 *
 * IMPORTANT (post-gate fixes, round 2):
 *  - The fixture MUST include a matching `db.plugins` entry. Without it,
 *    `getPluginPermission` throws a TypeError at
 *    `DBState.db.plugins.find(...)` (`v3.svelte.ts` ~:606) BEFORE `hasher`,
 *    `alertConfirm` or the push -- which would make the guard test pass
 *    even with the guard deleted, for the wrong reason (a crash, not the
 *    guard). With the entry present, deleting the guard lets the call
 *    proceed through `getPluginPermission` successfully and resolve `true`
 *    instead of rejecting, which is the real behavioural signal this test
 *    needs.
 *  - Assertions read through `DBState.db.characters[0]...` (the reactive
 *    Svelte 5 $state proxy), never through a raw plain-object reference
 *    held separately -- a write made through the proxy does not appear on
 *    a plain object that was merely used to construct the initial value
 *    assigned to `DBState.db`.
 *  - A CONTROL case below drives a NON-cold chat through the same API and
 *    asserts it DOES reach the permission prompt and DOES push/call
 *    `processSendChat`, proving this harness can observe both when they
 *    happen. The guard and control cases use DIFFERENT plugin names, so
 *    neither run is short-circuited by the module-level
 *    `permissionGivenPlugins`/`permissionDeniedPlugins` caches in
 *    `v3.svelte.ts` (which persist for the lifetime of the test file, since
 *    that module is only evaluated once) -- if both cases shared one plugin
 *    name, whichever ran first would grant permission for the plugin name,
 *    and the second run would take the `permissionGivenPlugins.has(...)`
 *    fast path regardless of test order, silently skipping `alertConfirm`.
 *
 * This file drives the REAL `makeRisuaiAPIV3` factory (exported from
 * `v3.svelte.ts` for exactly this purpose, so the guard can be exercised
 * without the iframe/SandboxHost bridge -- that bridge itself is the
 * OPTIONAL "bridge" case from the plan's test list, not covered here) and
 * the REAL, dependency-free `isColdChat` (`coldstorageData.ts`), through
 * `v3.svelte.ts`'s own import. Every other module `v3.svelte.ts` imports is
 * mocked below purely so the module can be constructed at all.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { writable } from 'svelte/store'
import type { Database } from '../../storage/database.svelte'

//#region module mocks -- every static import of `v3.svelte.ts` other than
// `svelte/store`, `uuid`, `src/lang`, `coldstorageData.ts` and
// `pluginColdStorage.ts` (dependency-free/side-effect-free, left real), and
// the module under test itself.

const alertConfirmMock = vi.hoisted(() => vi.fn(async () => true))
const hasherMock = vi.hoisted(() => vi.fn(async () => 'hash'))
const processSendChatMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock(import('../../plugins/plugins.svelte'), () => ({
    allowedDbKeys: [],
    customProviderStore: { providers: new Map() },
    getV2PluginAPIs: () => ({
        safeLocalStorage: {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            key: vi.fn(),
            keys: vi.fn(),
        },
    }),
    handlePluginInstallViaPlugin: vi.fn(),
    pluginV2: { providers: new Map(), chatOutput: new Set() },
}) as unknown as typeof import('../../plugins/plugins.svelte'))

vi.mock(import('../../plugins/apiV3/factory'), () => ({
    SandboxHost: class {},
}) as unknown as typeof import('../../plugins/apiV3/factory'))

vi.mock(import('../../storage/database.svelte'), () => ({
    getDatabase: vi.fn(() => ({}) as unknown),
}) as unknown as typeof import('../../storage/database.svelte'))

vi.mock(import('../../plugins/pluginSafeClass'), () => ({
    SafeLocalPluginStorage: class {},
    tagWhitelist: [],
}) as unknown as typeof import('../../plugins/pluginSafeClass'))

vi.mock('dompurify', () => ({
    default: { sanitize: (v: string) => v },
}))

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(-1),
        additionalChatMenu: [],
        additionalFloatingActionButtons: [],
        additionalHamburgerMenu: [],
        additionalSettingsMenu: [],
        bodyIntercepterStore: [],
        chatPanelStore: [],
    } as unknown as typeof import('../../stores.svelte')
})

vi.mock(import('../../util'), () => ({
    sleep: vi.fn(async () => {}),
}) as unknown as typeof import('../../util'))

vi.mock(import('../../alert'), () => ({
    alertConfirm: alertConfirmMock,
    alertError: vi.fn(),
    alertNormal: vi.fn(),
}) as unknown as typeof import('../../alert'))

vi.mock(import('../../globalApi.svelte'), () => ({
    checkCharOrder: vi.fn(),
    forageStorage: { isAccount: false },
    getFetchLogs: vi.fn(),
}) as unknown as typeof import('../../globalApi.svelte'))

vi.mock(import('../../gui/colorscheme'), () => ({
    changeColorScheme: vi.fn(),
    updateColorScheme: vi.fn(),
    updateTextThemeAndCSS: vi.fn(),
}) as unknown as typeof import('../../gui/colorscheme'))

vi.mock(import('../../platform'), () => ({
    isNodeServer: false,
    isTauri: false,
}) as unknown as typeof import('../../platform'))

vi.mock(import('../mcp/pluginmcp'), () => ({
    registerMCPModule: vi.fn(),
    unregisterMCPModule: vi.fn(),
}) as unknown as typeof import('../mcp/pluginmcp'))

// The reader/writer this test doesn't exercise -- kept as bare stubs so
// `v3.svelte.ts` can import it without pulling in the real module's Tauri
// fs / globalApi.svelte dependency graph.
vi.mock(import('../coldstorage.svelte'), () => ({
    setColdStorageItem: vi.fn(),
    readColdStorageItem: vi.fn(),
}) as unknown as typeof import('../coldstorage.svelte'))

vi.mock(import('../files/inlays'), () => ({
    getInlayAsset: vi.fn(),
}) as unknown as typeof import('../files/inlays'))

vi.mock(import('../../translator/translator'), () => ({
    getLLMCache: vi.fn(),
    searchLLMCache: vi.fn(),
}) as unknown as typeof import('../../translator/translator'))

vi.mock(import('../../parser/parser.svelte'), () => ({
    hasher: hasherMock,
    risuChatParser: vi.fn(),
}) as unknown as typeof import('../../parser/parser.svelte'))

vi.mock(import('../../model/types'), () => ({
    LLMFlags: {},
    LLMFormat: {},
    LLMProvider: {},
    LLMTokenizer: {},
}) as unknown as typeof import('../../model/types'))

vi.mock(import('../index.svelte'), () => ({
    sendChat: processSendChatMock,
    doingChat: writable(false),
}) as unknown as typeof import('../index.svelte'))

vi.mock(import('../scripts'), () => ({
    processScriptFull: vi.fn(),
}) as unknown as typeof import('../scripts'))

vi.mock(import('../../model/modellist'), () => ({
    getModelInfo: vi.fn(() => ({ id: 'test-model' }) as unknown),
}) as unknown as typeof import('../../model/modellist'))

vi.mock(import('../request/request'), () => ({
    requestChatDataMain: vi.fn(),
}) as unknown as typeof import('../request/request'))

vi.mock(import('../modules'), () => ({
    getModuleLorebooks: vi.fn(),
}) as unknown as typeof import('../modules'))

vi.mock(import('../ttsHooks'), () => ({
    registerTTSPreprocessor: vi.fn(),
    unregisterTTSPreprocessor: vi.fn(),
    registerTTSPostprocessor: vi.fn(),
    unregisterTTSPostprocessor: vi.fn(),
}) as unknown as typeof import('../ttsHooks'))

//#endregion

import { makeRisuaiAPIV3 } from '../../plugins/apiV3/v3.svelte'
import { DBState, selectedCharID } from '../../stores.svelte'
import { coldStorageHeader } from '../coldstorageData'

function makePointerChatDb(pluginName: string, coldKey: string): Database {
    return {
        plugins: [{ name: pluginName, script: '' }],
        characters: [{
            chaId: 'plugin-guard-char',
            name: 'Plugin Guard Character',
            type: 'character',
            chatPage: 0,
            chats: [{
                message: [{ time: 1, data: coldStorageHeader + coldKey, role: 'char' }],
                note: '',
                name: '',
                localLore: [],
            }],
        }],
    } as unknown as Database
}

function makeNormalChatDb(pluginName: string): Database {
    return {
        plugins: [{ name: pluginName, script: '' }],
        characters: [{
            chaId: 'plugin-control-char',
            name: 'Plugin Control Character',
            type: 'character',
            chatPage: 0,
            chats: [{
                message: [{ time: 1, data: 'a perfectly ordinary message', role: 'char' }],
                note: '',
                name: '',
                localLore: [],
            }],
        }],
    } as unknown as Database
}

describe('CHORE-07 stage 7c-1: risuai.sendChat refuses a cold chat before the permission prompt and before the push', () => {
    beforeEach(() => {
        alertConfirmMock.mockClear()
        hasherMock.mockClear()
        processSendChatMock.mockClear()
    })

    test('RED: a cold chat rejects, never prompts for permission, and never pushes the message', async () => {
        const pluginName = 'guard-test-plugin'
        const db = makePointerChatDb(pluginName, 'plugin-guard-cold-key')
        DBState.db = db
        selectedCharID.set(0)

        const api = makeRisuaiAPIV3({} as HTMLIFrameElement, { name: pluginName } as never)

        const messageBefore = JSON.parse(JSON.stringify(DBState.db.characters[0].chats[0].message))

        // RED: on pre-7c-1 (92b9bba7), `sendChat` has no guard of its own --
        // it calls `getPluginPermission` (which prompts via `alertConfirm`
        // for a plugin with no recorded decision) and pushes `message` into
        // `chat.message` before `processSendChat` runs, resolving `true`
        // rather than rejecting.
        await expect(api.sendChat('hello')).rejects.toThrow()

        expect(DBState.db.characters[0].chats[0].message).toEqual(messageBefore)
        expect(alertConfirmMock).not.toHaveBeenCalled()
        expect(hasherMock).not.toHaveBeenCalled()
        expect(processSendChatMock).not.toHaveBeenCalled()
    })

    test('CONTROL: a non-cold chat DOES reach the permission prompt and DOES push/call processSendChat', async () => {
        const pluginName = 'control-test-plugin'
        const db = makeNormalChatDb(pluginName)
        DBState.db = db
        selectedCharID.set(0)

        const api = makeRisuaiAPIV3({} as HTMLIFrameElement, { name: pluginName } as never)

        const result = await api.sendChat('a control message')

        // Proves this harness CAN observe the permission prompt and the
        // push/processSendChat call when nothing refuses the send -- the
        // guard test's "not called" assertions above are meaningful only
        // because this control case shows they'd be `true` otherwise.
        expect(result).toBe(true)
        expect(alertConfirmMock).toHaveBeenCalledTimes(1)
        expect(processSendChatMock).toHaveBeenCalledTimes(1)
        expect(DBState.db.characters[0].chats[0].message.at(-1)).toMatchObject({
            data: 'a control message',
            role: 'user',
        })
    })
})
