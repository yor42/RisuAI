// @vitest-environment node

/**
 * The send's prompt -- the parses of `sendChatBody` (the classes named in the tests below), `parseChatML`, the
 * persona block, the module toggles and assets, the example messages, the
 * additional-information query and the supaMemory summarizer input -- reads
 * the chat the send started in, whatever the selection is: on another chat,
 * at Home, or moved there in the middle of the send. A chat bound to the
 * selected persona reads that persona as it is edited, and the persona block
 * is gated on the persona of the send's own chat.
 *
 * Drives the REAL `sendChat` (`../index.svelte`) with the real
 * `../../parser/chatML`, `../exampleMessages`, `../embedding/addinfo`,
 * `../memory/supaMemory`, `../scripts`, `../scriptings`, `../modules`,
 * `../lorebook.svelte`, `../../parser/parser.svelte`, `../../util` and
 * `../chatOrigin`. Only the provider request, the embedding processor, the
 * hypaV2 and hypaV3 memory systems, the trigger engine and the platform/IO
 * packages are mocked; `requestChatData` is a mock, so nothing here says
 * anything about a native backend. `@vitest-environment node` and the inert
 * `dompurify` are for wasmoon's sake, as in `sendChatScriptsOrigin.svelte.test.ts`.
 *
 * Every field the prompt parses carries `{{char}}`, `{{user}}` and a per-chat
 * variable, so a parse's output names the character, the persona and the chat
 * it read. The selected persona is a third persona, so neither chat is bound
 * to it unless a test says so. A scenario is one whole send; the tests that
 * each look at one part of it share the run.
 *
 * Tests whose title starts with `guard:` pass with or without the binding:
 * they pin behaviour that must be preserved.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { writable, get } from 'svelte/store'
import type { Writable } from 'svelte/store'
import type { character, groupChat, Chat, Message, Database, RisuPersona } from '../../storage/database.svelte'
import type { OpenAIChat, SendChatArg } from '../index.svelte'
import type { WorkHandle } from '../chatOrigin'
// Installs the real `globalThis.safeStructuredClone`, the same way
// `src/main.ts` does (`import "./ts/polyfill"`): the setup file's stand-in
// throws on `undefined`, which the script pass clones.
import '../../polyfill'

//#region module mocks

const h = vi.hoisted(() => ({
    request: vi.fn(),
    queries: [] as string[],
    searchResult: [] as string[],
    tokPerChat: 1,
    onAddInfo: null as null | (() => void),
}))

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: vi.fn(async () => null),
            setItem: vi.fn(async () => {}),
            removeItem: vi.fn(async () => {}),
        }),
    },
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/api/path', () => ({
    basename: vi.fn(async (p: string) => p.split('/').pop()),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: vi.fn(() => ({ listen: vi.fn(), setTitle: vi.fn() })),
}))

vi.mock('src/lib/UI/PopupList.svelte', () => ({
    default: class {},
}))

// Inert passthrough: real DOMPurify needs `document`, real wasmoon needs it
// absent, and sanitization is not what this suite tests.
vi.mock('dompurify', () => ({
    default: { addHook: vi.fn(), sanitize: (html: string) => html },
}))

vi.mock(import('../../platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('../../platform'))

vi.mock(import('../../stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        CharEmotion: writable({}),
        selectedCharID: writable(-1),
        selIdState: { selId: 0 },
        CurrentTriggerIdStore: writable(null),
        ReloadChatPointer: writable({}),
        ReloadGUIPointer: writable(0),
        HideIconStore: writable(false),
        moduleBackgroundEmbedding: writable(''),
    } as unknown as typeof import('../../stores.svelte')
})

vi.mock(import('../../alert'), () => ({
    alertError: vi.fn(),
    alertToast: vi.fn(),
    alertInput: vi.fn(async () => ''),
    alertNormal: vi.fn(),
    alertSelect: vi.fn(async () => ''),
    alertConfirm: vi.fn(async () => true),
    alertClear: vi.fn(),
    alertModuleSelect: vi.fn(async () => -1),
    alertStore: writable({ type: '', msg: '' }),
    alertWait: vi.fn(),
}) as unknown as typeof import('../../alert'))

vi.mock(import('../../globalApi.svelte'), () => ({
    fetchNative: vi.fn(),
    readImage: vi.fn(async () => new Uint8Array([1, 2, 3])),
    isPlainHttpFileSrc: vi.fn(() => false),
    aiWatermarkingLawApplies: vi.fn(() => false),
    getFileSrc: vi.fn(async () => ''),
    forageStorage: {
        keys: vi.fn(async () => []),
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
    },
    AppendableBuffer: class {},
    LocalWriter: class {},
    VirtualWriter: class {},
    downloadFile: vi.fn(),
    saveAsset: vi.fn(async () => ''),
}) as unknown as typeof import('../../globalApi.svelte'))

// `tokenizeChat` answers `h.tokPerChat` for every chat, so a test decides how
// soon the context overflows into the memory systems.
vi.mock(import('../../tokenizer'), () => ({
    ChatTokenizer: class {
        constructor(_extra: number, _mode: string) {}
        async tokenizeChat(_chat: unknown) { return h.tokPerChat }
    },
    tokenize: vi.fn(async (s: string) => (s?.length ?? 0)),
    tokenizeNum: vi.fn(async () => [] as number[]),
}) as unknown as typeof import('../../tokenizer'))

vi.mock(import('../../characters'), () => ({
    createBlankChar: vi.fn(() => ({ name: '', chaId: '' })),
    getCharImage: vi.fn(),
}) as unknown as typeof import('../../characters'))

vi.mock(import('../command'), () => ({
    processMultiCommand: vi.fn(async () => {}),
}) as unknown as typeof import('../command'))

vi.mock(import('../files/inlays'), () => ({
    getInlayAsset: vi.fn(),
    getInlayAssetBlob: vi.fn(async () => undefined),
    writeInlayImage: vi.fn(async () => 'inlay-id'),
}) as unknown as typeof import('../files/inlays'))

// The embedding processor records what the additional-information query
// searched for and answers with `h.searchResult`; `addText` is the hook a
// test uses to change the world in the middle of a send.
vi.mock(import('../memory/hypamemory'), () => ({
    HypaProcesser: class {
        async addText() { h.onAddInfo?.() }
        async similaritySearch(query: string) { h.queries.push(query); return h.searchResult }
    },
}) as unknown as typeof import('../memory/hypamemory'))

vi.mock(import('../request/request'), () => ({
    requestChatData: h.request,
}) as unknown as typeof import('../request/request'))

vi.mock(import('../stableDiff'), () => ({
    stableDiff: vi.fn(),
    generateAIImage: vi.fn(async () => null),
}) as unknown as typeof import('../stableDiff'))

vi.mock(import('../../model/modellist'), () => ({
    getModelInfo: vi.fn(() => ({
        id: 'placeholder', name: 'Placeholder Model', shortName: 'Placeholder',
        internalID: 'placeholder', format: 0, provider: 0, tokenizer: 0, flags: [],
    })),
    LLMFlags: {},
}) as unknown as typeof import('../../model/modellist'))

// The real plugin module reads `document` at load time.
vi.mock(import('../../plugins/plugins.svelte'), () => ({
    pluginV2: {
        editdisplay: new Set(),
        editoutput: new Set(),
        editprocess: new Set(),
        editinput: new Set(),
        chatOutput: new Set(),
    },
}) as unknown as typeof import('../../plugins/plugins.svelte'))

vi.mock(import('../../media'), () => ({
    compressImage: vi.fn(async (v: unknown) => v),
}) as unknown as typeof import('../../media'))

vi.mock(import('../../rpack/rpack_js'), () => ({
    decodeRPack: vi.fn(async () => new Uint8Array()),
    encodeRPack: vi.fn(async () => new Uint8Array()),
}) as unknown as typeof import('../../rpack/rpack_js'))

vi.mock(import('../../interchangeability'), () => ({
    convertCharacterToModule: vi.fn(),
    convertModuleToCharacter: vi.fn(),
}) as unknown as typeof import('../../interchangeability'))

vi.mock(import('../../characterCards'), () => ({
    exportCharacterCard: vi.fn(),
    importCharacterProcess: vi.fn(),
}) as unknown as typeof import('../../characterCards'))

// Real-shaped selection accessors over the same mocked `DBState` and
// `selectedCharID` the send reads.
vi.mock(import('../../storage/database.svelte'), async () => {
    const stores = await import('../../stores.svelte')
    const state = stores.DBState as unknown as { db: { characters?: Array<{ chatPage: number, chats?: unknown[] }> } }
    const getCurrentCharacter = () => state.db.characters?.[get(stores.selectedCharID)]
    const getCurrentChat = () => {
        const current = getCurrentCharacter()
        return current?.chats?.[current.chatPage]
    }
    return {
        appVer: '0.0.0',
        presetTemplate: {},
        changeToPreset: vi.fn(),
        setCurrentChat: vi.fn(),
        setDatabase: vi.fn(),
        getDatabase: vi.fn(() => state.db),
        getCurrentCharacter: vi.fn(getCurrentCharacter),
        getCurrentChat: vi.fn(getCurrentChat),
    } as unknown as typeof import('../../storage/database.svelte')
})

vi.mock(import('../tts'), () => ({
    sayTTS: vi.fn(),
}) as unknown as typeof import('../tts'))

vi.mock(import('../memory/hanuraiMemory'), () => ({
    hanuraiMemory: vi.fn(),
}) as unknown as typeof import('../memory/hanuraiMemory'))

// The two memory systems that are not exercised for real here record their
// arguments (the send's subject, when it passes one, is a trailing argument)
// and hand the chats back untouched.
vi.mock(import('../memory/hypav2'), () => ({
    hypaMemoryV2: vi.fn(async (chats: OpenAIChat[], currentTokens: number, ..._rest: Array<object | number>) => ({ chats, currentTokens })),
}) as unknown as typeof import('../memory/hypav2'))

vi.mock(import('../memory/hypav3'), () => ({
    hypaMemoryV3: vi.fn(async (chats: OpenAIChat[], currentTokens: number, ..._rest: Array<object | number>) => ({ chats, currentTokens })),
}) as unknown as typeof import('../memory/hypav3'))

vi.mock(import('../group'), () => ({
    groupOrder: vi.fn((order: unknown) => order),
}) as unknown as typeof import('../group'))

vi.mock(import('../triggers'), () => ({
    runTrigger: vi.fn(async () => undefined),
}) as unknown as typeof import('../triggers'))

vi.mock(import('../models/modelString'), () => ({
    getGenerationModelString: vi.fn(() => undefined),
}) as unknown as typeof import('../models/modelString'))

vi.mock(import('../inlayScreen'), () => ({
    runInlayScreen: vi.fn((_char: unknown, text: string) => ({ text, promise: undefined })),
}) as unknown as typeof import('../inlayScreen'))

vi.mock(import('../prereroll'), () => ({
    addRerolls: vi.fn(),
}) as unknown as typeof import('../prereroll'))

vi.mock(import('../transformers'), () => ({
    runImageEmbedding: vi.fn(),
}) as unknown as typeof import('../transformers'))

// Real: `../../util`, `../scripts`, `../scriptings` (wasmoon), `../modules`,
// `../lorebook.svelte`, `../../parser/parser.svelte`, `../../parser/chatML`,
// `../../cbs`, `../../parser/chatVar.svelte`, `../chatOrigin`,
// `../exampleMessages`, `../embedding/addinfo`, `../memory/supaMemory`,
// `../index.svelte`.

//#endregion

//#region fixtures and helpers

type Owner = character | groupChat
type Selection = Writable<number>

interface PromptEntry {
    role: string
    content: string
    multimodals?: unknown[]
}

interface RequestBody {
    formated?: PromptEntry[]
    biasString?: Array<[string, number]>
}

let sendChat: typeof import('../index.svelte').sendChat
let doingChat: typeof import('../index.svelte').doingChat
let beginWork: typeof import('../chatOrigin').beginWork
let createSendSubject: typeof import('../chatOrigin').createSendSubject
let resolutionCountForTests: typeof import('../chatOrigin').resolutionCountForTests
let resetResolutionCountForTests: typeof import('../chatOrigin').resetResolutionCountForTests
let resetScriptCache: typeof import('../scripts').resetScriptCache
let refreshModules: typeof import('../modules').refreshModules
let DBState: { db: Database }
let selectedCharID: Selection

beforeAll(async () => {
    const jsonLua = await readFile(resolve(process.cwd(), 'public/lua/json.lua'), 'utf8')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(jsonLua, { status: 200 })))

    const index = await import('../index.svelte')
    sendChat = index.sendChat
    doingChat = index.doingChat
    const origin = await import('../chatOrigin')
    beginWork = origin.beginWork
    createSendSubject = origin.createSendSubject
    resolutionCountForTests = origin.resolutionCountForTests
    resetResolutionCountForTests = origin.resetResolutionCountForTests
    resetScriptCache = (await import('../scripts')).resetScriptCache
    refreshModules = (await import('../modules')).refreshModules
    const stores = await import('../../stores.svelte')
    DBState = stores.DBState as unknown as { db: Database }
    selectedCharID = stores.selectedCharID as unknown as Selection
})

beforeEach(() => {
    h.request.mockReset()
    h.queries.length = 0
    h.searchResult = []
    h.onAddInfo = null
    h.tokPerChat = 1
    doingChat.set(false)
    resetScriptCache()
    refreshModules()
})

afterEach(() => {
    selectedCharID.set(-1)
})

function msg(role: 'user' | 'char', data: string, extra: Partial<Message> = {}): Message {
    return { role, data, time: 1, ...extra } as Message
}

function makeChat(id: string, message: Message[], extra: Record<string, unknown> = {}): Chat {
    return {
        id, note: '', name: '', localLore: [], fmIndex: -1, message,
        scriptstate: {}, GLGlobalVariables: {}, modules: [], ...extra,
    } as unknown as Chat
}

function makeChar(chaId: string, name: string, chats: Chat[], extra: Record<string, unknown> = {}): character {
    return {
        chaId, name, type: 'character', chatPage: 0, firstMessage: 'Hello!', alternateGreetings: [],
        desc: `${name} desc`, personality: '', scenario: '', bias: [], utilityBot: false,
        inlayViewScreen: false, reloadKeys: 0, supaMemory: false, customscript: [], triggerscript: [],
        globalLore: [], emotionImages: [], additionalAssets: [], modules: [], exampleMessage: '', chats, ...extra,
    } as unknown as character
}

function makeGroup(chaId: string, memberIds: string[], chats: Chat[], extra: Record<string, unknown> = {}): groupChat {
    return {
        chaId, name: chaId, type: 'group', chatPage: 0, image: '', characters: [...memberIds],
        characterActive: memberIds.map(() => true), characterTalks: memberIds.map(() => 1),
        orderByOrder: true, reloadKeys: 0, supaMemory: false, customscript: [], globalLore: [],
        firstMessage: '', alternateGreetings: [], modules: [], emotionImages: [], defaultVariables: '',
        chats, ...extra,
    } as unknown as groupChat
}

function installDb(characters: Owner[], extra: Record<string, unknown> = {}): void {
    DBState.db = {
        formatversion: 5, botPresets: [], modules: [], loadouts: [], plugins: [], pluginCustomStorage: {},
        personas: [], selectedPersona: 0, characterOrder: characters.map((c) => c.chaId), characters,
        statics: { messages: 0 }, aiModel: 'gpt-3.5-turbo', maxContext: 999999, maxResponse: 500,
        bias: [], mainPrompt: '', globalNote: '', jailbreakToggle: false, chainOfThought: false,
        personaPrompt: '', promptPreprocess: false, additionalPrompt: '', descriptionPrefix: '',
        promptTemplate: undefined, promptInfoInsideChat: false,
        formatingOrder: ['main', 'description', 'personaPrompt', 'chats', 'lastChat', 'jailbreak', 'lorebook', 'globalNote', 'authorNote'],
        autoContinueMinTokens: 0, autoContinueChat: false, igpPrompt: '', notification: false,
        removeIncompleteResponse: false, streamingDisplayOptimizationMode: 'off', ttsAutoSpeech: false,
        presetChain: '', outputImageModal: false, rememberToolUsage: false, supaModelType: 'none',
        supaMemoryPrompt: '', hypav2: false, hypaV3: false, hanuraiEnable: false, inlayErrorResponse: false,
        loreBookDepth: 20, loreBookToken: 999999, templateDefaultVariables: '', globalChatVariables: {},
        enabledModules: [], username: 'GlobalUser', userIcon: 'global.png', ...extra,
    } as unknown as Database
    ;(globalThis as unknown as { __risuTestDb: Database }).__risuTestDb = DBState.db
}

const settle = () => new Promise<void>((r) => setTimeout(r, 0))

/** A send started the way a hinted caller starts one: an origin on `owner`'s `chat`. */
interface Send {
    handle: WorkHandle
    outcome: Promise<boolean | Error>
    failure: Error | null
}

function startSend(owner: Owner, chat: Chat, arg: SendChatArg = {}): Send {
    const handle = beginWork(owner, chat)!
    const send: Send = { handle, outcome: undefined as unknown as Promise<boolean | Error>, failure: null }
    send.outcome = sendChat(-1, { ...arg, origin: handle.origin, originHint: { owner, chat } }).then(
        (value) => value,
        (error: unknown) => {
            const failure = error instanceof Error ? error : new Error(String(error))
            send.failure = failure
            return failure
        },
    )
    return send
}

//#endregion

//#region the prompt-reads world

/**
 * Every field a prompt parse reads carries `{{char}}`, `{{user}}` and a
 * per-chat variable, so the text a parse produces names the character, the
 * persona and the chat it read.
 */
const TAGS = '{{char}}/{{user}}/{{getvar::who}}'
/** What `TAGS` reads as in chat A, whose owner is Alice, bound to persona A. */
const FROM_A = 'Alice/PersonaA/VAR-A'
const FROM_B = 'Bob/PersonaB/VAR-B'

/** The persona at `selectedPersona`: its saved entry lags the editing buffer in `db`. */
const PERSONA_SELECTED: RisuPersona = { id: 'p-S', name: 'SelectedPersona', personaPrompt: 'PS-PROMPT', icon: 'sel.png', note: 'PS-NOTE' }
const PERSONA_A: RisuPersona = { id: 'p-A', name: 'PersonaA', personaPrompt: 'PA-PROMPT', icon: 'a.png', note: '' }
const PERSONA_B: RisuPersona = { id: 'p-B', name: 'PersonaB', personaPrompt: 'PB-PROMPT', icon: 'b.png', note: '' }
const GLOBAL_PROMPT = 'GLOBAL-PROMPT'

const MODULE_A = { id: 'mod-A', name: 'mod-A', customModuleToggle: 'modA=Mod A toggle', assets: [['pic', 'path-a', 'png']] }
const MODULE_B = { id: 'mod-B', name: 'mod-B', customModuleToggle: 'modB=Mod B toggle', assets: [['picb', 'path-b', 'png']] }

function lore(comment: string, content: string): Record<string, unknown> {
    return { comment, content, mode: 'normal', insertorder: 100, alwaysActive: true, key: '', secondkey: '', selective: false }
}

interface WorldOptions {
    db?: Record<string, unknown>
    charA?: Record<string, unknown>
    messagesA?: Message[]
    chatA?: Record<string, unknown>
}

/**
 * Two characters: Alice (chat A, bound to persona A, module A, variable
 * `who` = `VAR-A`) and Bob (chat B, persona B, module B, `VAR-B`). The
 * selected persona is a third one, so neither chat is bound to it. The
 * selection is left to the test.
 */
function world(o: WorldOptions = {}): { A: character, B: character } {
    const A = makeChar('char-A', 'Alice', [makeChat('chat-A', o.messagesA ?? [msg('user', 'U0 hi')], {
        bindedPersona: 'p-A', modules: ['mod-A'], note: `NOTE[${TAGS}]`, scriptstate: { $who: 'VAR-A' }, ...o.chatA,
    })], {
        desc: `DESC[${TAGS}]`, personality: `PERS[${TAGS}]`, scenario: `SCEN[${TAGS}]`, firstMessage: `FIRST[${TAGS}]`,
        exampleMessage: `<START>\n{{user}}: EXU[${TAGS}]\n{{char}}: EXC[${TAGS}]`, ...o.charA,
    })
    const B = makeChar('char-B', 'Bob', [makeChat('chat-B', [msg('user', 'b0')], {
        bindedPersona: 'p-B', modules: ['mod-B'], scriptstate: { $who: 'VAR-B' },
    })])
    installDb([A, B], {
        personas: [{ ...PERSONA_SELECTED }, { ...PERSONA_A }, { ...PERSONA_B }], selectedPersona: 0,
        modules: [MODULE_A, MODULE_B], personaPrompt: GLOBAL_PROMPT, ...o.db,
    })
    return { A, B }
}

/** A prompt-template card list that reaches every card class the send parses. */
function templateDb(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        promptTemplate: [
            { type: 'plain', text: `TPLMAIN[${TAGS}]`, role: 'system', type2: 'main' },
            { type: 'persona', innerFormat: `PCARD[${TAGS}] {{slot}}` },
            { type: 'description', innerFormat: `DCARD[${TAGS}] {{slot}}` },
            { type: 'authornote', innerFormat: `ACARD[${TAGS}] {{slot}}`, defaultText: 'x' },
            { type: 'chatML', text: `<|im_start|>system\nCHATML[${TAGS}]<|im_end|>` },
            { type: 'plain', text: `TPLPLAIN[${TAGS}]`, role: 'system', type2: 'normal' },
            { type: 'plain', text: `TPLGN[${TAGS}]`, role: 'system', type2: 'globalNote' },
            { type: 'jailbreak', text: `TPLJB[${TAGS}]`, role: 'system' },
            { type: 'cot', text: `TPLCOT[${TAGS}]`, role: 'system' },
            { type: 'lorebook' },
            { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        ],
        promptSettings: {}, promptInfoInsideChat: true, promptTextInfoInsideChat: true,
        botPresets: [{ name: 'PRESET' }], botPresetsId: 0, customPromptTemplateToggle: '',
        jailbreakToggle: true, chainOfThought: true,
        globalChatVariables: { toggle_modA: '1', toggle_modB: '1' },
        ...extra,
    }
}

/** The bracketed text of the first `label[...]` marker in `text`, or `null` when there is none. */
function marker(text: string, label: string): string | null {
    const found = new RegExp(`\\b${label}\\[[^\\]]*\\]`).exec(text)
    return found ? found[0] : null
}

interface Captured {
    outcome: boolean | Error
    /** The `model` requests, in order. */
    models: RequestBody[]
    /** The prompt of the first `model` request. */
    prompt: PromptEntry[]
    promptText: string
    biasString: Array<[string, number]> | undefined
    memoryBodies: PromptEntry[][]
    emotionBodies: PromptEntry[][]
    queries: string[]
    replyPromptInfo: { promptName?: string, promptToggles?: Array<{ key: string, value: string }>, promptText?: OpenAIChat[] } | undefined
    supaMemoryData: string | undefined
}

function textOf(entries: PromptEntry[]): string {
    return entries.map((e) => e.content).join('\n')
}

/** Answers every request kind; `model` replies `reply`, `memory` replies `SUMMARY`, `emotion` replies `EMO`. */
function installRequestMock(): void {
    h.request.mockReset()
    h.request.mockImplementation(async (_body: RequestBody, mode: string) => {
        if (mode === 'memory') return { type: 'success', result: 'SUMMARY' }
        if (mode === 'emotion') return { type: 'success', result: 'EMO' }
        return { type: 'success', result: 'reply' }
    })
}

function capture(outcome: boolean | Error, chat: Chat): Captured {
    const calls = h.request.mock.calls as Array<[RequestBody, string]>
    const models = calls.filter((c) => c[1] === 'model').map((c) => c[0])
    const prompt = models[0]?.formated ?? []
    return {
        outcome,
        models,
        prompt,
        promptText: textOf(prompt),
        biasString: models[0]?.biasString,
        memoryBodies: calls.filter((c) => c[1] === 'memory').map((c) => c[0].formated ?? []),
        emotionBodies: calls.filter((c) => c[1] === 'emotion').map((c) => c[0].formated ?? []),
        queries: [...h.queries],
        replyPromptInfo: chat.message.at(-1)?.promptInfo,
        supaMemoryData: chat.supaMemoryData,
    }
}

/**
 * One whole send from `owner`'s `chat`, with the selection at `selection`
 * from its first line (`-1` is Home), and what it asked the provider for.
 */
async function sendWith(owner: Owner, chat: Chat, selection: number, arg: SendChatArg = {}): Promise<Captured> {
    selectedCharID.set(selection)
    installRequestMock()
    h.queries.length = 0
    const send = startSend(owner, chat, arg)
    const outcome = await send.outcome
    send.handle.end()
    return capture(outcome, chat)
}

/**
 * Memoises one scenario per key, so the tests that each look at one part of
 * the same send share a single run. The run happens inside the first test
 * that asks, after the per-test reset.
 */
const scenarios = new Map<string, Captured>()
async function scenario(key: string, run: () => Promise<Captured>): Promise<Captured> {
    let found = scenarios.get(key)
    if (!found) {
        found = await run()
        scenarios.set(key, found)
    }
    return found
}

//#endregion

//#region the parser spy

/**
 * A parser call as the spy saw it: the parser it went through, the first
 * characters of its text, the option keys it passed and, when it passed a
 * subject, the origin that subject stands for.
 */
interface ParserCall {
    via: 'scripts' | 'parser'
    text: string
    keys: string[]
    subject: { chaId: string, chatId: string } | null
}

type ParserOptions = Parameters<typeof import('../../parser/parser.svelte').risuChatParser>[1]

/**
 * Wraps the parser that `index`, `exampleMessages` (through `../scripts`) and
 * `parseChatML` (through `../../parser/parser.svelte`) import. Only a top-level
 * call is recorded: one made while no wrapped call is on the stack, so the
 * nested parses the CBS engine makes for a tag's own arguments are not.
 */
const spy = vi.hoisted(() => {
    const state = { recording: false, depth: 0, calls: [] as ParserCall[] }
    function wrap(via: ParserCall['via'], actual: (text: string, options?: ParserOptions) => string) {
        return (text: string, options?: ParserOptions): string => {
            if (state.recording && state.depth === 0) {
                const origin = options?.subject?.origin
                state.calls.push({
                    via,
                    text: text.slice(0, 32).replace(/\n/g, '\\n'),
                    keys: Object.keys(options ?? {}).sort(),
                    subject: origin ? { chaId: origin.chaId, chatId: origin.chatId } : null,
                })
            }
            state.depth++
            try {
                return actual(text, options)
            } finally {
                state.depth--
            }
        }
    }
    return { state, wrap }
})

vi.mock(import('../scripts'), async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, risuChatParser: spy.wrap('scripts', actual.risuChatParser) }
})

vi.mock(import('../../parser/parser.svelte'), async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, risuChatParser: spy.wrap('parser', actual.risuChatParser) }
})

/**
 * Every top-level parser call the send `run` makes. The send is expected to
 * complete unless `endsGone` says its chat is removed on the way.
 */
async function recordParses(run: () => Promise<Captured>, endsGone = false): Promise<ParserCall[]> {
    spy.state.calls.length = 0
    spy.state.depth = 0
    spy.state.recording = true
    try {
        const r = await run()
        if (!endsGone) {
            expect(r.outcome, 'the send completes').toBe(true)
        }
    } finally {
        spy.state.recording = false
    }
    return [...spy.state.calls]
}

//#endregion

//#region scenarios

/** `{{char}}` and `{{user}}` only: the example dialogue splits its lines at the first colon. */
const TAGS_NO_VAR = '{{char}}/{{user}}'
const FROM_A_NO_VAR = 'Alice/PersonaA'

const STALE: Array<{ name: string, selection: number }> = [
    { name: 'the selection is on another chat', selection: 1 },
    { name: 'the selection is Home', selection: -1 },
]

/** A character send with a marker in every field a non-template prompt parses. */
function plainWorld(): { A: character, B: character } {
    const built = world({
        db: {
            mainPrompt: `MAIN[${TAGS}]`, jailbreakToggle: true, jailbreak: `JB[${TAGS}]`, globalNote: `GN[${TAGS}]`,
            bias: [[`BIAS[${TAGS}]`, 5]], igpPrompt: `<|im_start|>system\nIGP[${TAGS}]<|im_end|>`,
        },
        charA: {
            additionalText: 'INFO1\n\nINFO2', depth_prompt: { depth: 1, prompt: `DP[${TAGS}]` }, bias: [[`CBIAS[${TAGS}]`, 3]],
            exampleMessage: `<START>\n{{user}}: EXU[${TAGS_NO_VAR}]\n{{char}}: EXC[${TAGS_NO_VAR}]`,
            globalLore: [
                lore('normal', `LORE[${TAGS}]`),
                lore('description', `@@position after_desc\nLDESC[${TAGS}]`),
                lore('depth0', `@@depth 0\nLD0[${TAGS}]`),
                lore('depth0-assistant', `@@depth 0\n@@role assistant\nLD0A[${TAGS}]`),
                lore('depth1', `@@depth 1\nLD1[${TAGS}]`),
            ],
        },
        chatA: { scriptstate: { $who: 'VAR-A', $resid: TAGS } },
        // The tags in the last message survive the send's entry expansion, which
        // expands `{{getvar::resid}}` into the raw text of the variable.
        messagesA: [msg('user', 'U0 hi'), msg('char', 'C1 there'), msg('user', 'RESID[{{getvar::resid}}] see {{asset_prompt::pic}} now')],
    })
    h.searchResult = [`ADDI[${TAGS}]`]
    return built
}

/** The plain send, with the selection at `selection` throughout or, when `midSend`, moved to another chat inside `addText`. */
async function runPlain(selection: number, midSend = false): Promise<Captured> {
    const { A } = plainWorld()
    if (midSend) {
        h.onAddInfo = () => selectedCharID.set(1)
    }
    return sendWith(A, A.chats[0], midSend ? 0 : selection)
}

function plainScenario(selection: number, midSend = false): Promise<Captured> {
    return scenario(`plain:${selection}:${midSend}`, () => runPlain(selection, midSend))
}

async function runTemplate(selection: number): Promise<Captured> {
    const { A } = world({
        db: templateDb({
            mainPrompt: `MAIN[${TAGS}]`, jailbreak: `JB[${TAGS}]`, globalNote: `GN[${TAGS}]`,
            igpPrompt: `<|im_start|>system\nIGP[${TAGS}]<|im_end|>`,
        }),
        chatA: { scriptstate: { $who: 'VAR-A', $resid: TAGS } },
        messagesA: [msg('user', 'U0 hi'), msg('user', 'RESID[{{getvar::resid}}]')],
    })
    return sendWith(A, A.chats[0], selection)
}

function templateScenario(selection: number): Promise<Captured> {
    return scenario(`template:${selection}`, () => runTemplate(selection))
}

/**
 * A group chat of Mia and Max, bound to persona A and module A, with a group
 * message template that names the speaker. Selection 3 is a character that is
 * neither the group nor a member.
 */
async function runGroup(selection: number): Promise<Captured> {
    const M1 = makeChar('m1', 'Mia', [makeChat('mc1', [msg('user', 'x')])], { desc: `MIADESC[${TAGS}]` })
    const M2 = makeChar('m2', 'Max', [makeChat('mc2', [msg('user', 'y')])])
    const G = makeGroup('grp', ['m1', 'm2'], [makeChat('gc1', [msg('user', 'gu0'), msg('char', 'from-max', { saying: 'm2' })], {
        bindedPersona: 'p-A', modules: ['mod-A'], scriptstate: { $who: 'VAR-A' },
    })])
    const OTHER = makeChar('oth', 'Other', [makeChat('oc1', [msg('user', 'o')], { bindedPersona: 'p-B', modules: ['mod-B'], scriptstate: { $who: 'VAR-B' } })])
    installDb([G, M1, M2, OTHER], {
        personas: [{ ...PERSONA_SELECTED }, { ...PERSONA_A }, { ...PERSONA_B }], selectedPersona: 0, modules: [MODULE_A, MODULE_B],
        personaPrompt: GLOBAL_PROMPT, groupTemplate: `GRP[${TAGS}]\n{{slot}}`, mainPrompt: `MAIN[${TAGS}]`,
    })
    return sendWith(G, G.chats[0], selection)
}

function groupScenario(selection: number): Promise<Captured> {
    return scenario(`group:${selection}`, () => runGroup(selection))
}

const SUPA_MESSAGES = (): Message[] => [
    msg('user', 'one'), msg('char', 'two'), msg('user', 'three'), msg('char', 'four'), msg('user', 'five'), msg('char', 'six'), msg('user', 'seven'),
]

/** A send whose context overflows, so supaMemory summarizes the head of the chat. */
function supaWorld(summaryPrompt: string, charExtra: Record<string, unknown> = {}): { A: character, B: character } {
    h.tokPerChat = 10
    return world({
        db: { maxContext: 170, maxResponse: 5, supaModelType: 'subModel', maxSupaChunkSize: 40, supaMemoryPrompt: summaryPrompt },
        charA: { supaMemory: true, ...charExtra },
        messagesA: SUPA_MESSAGES(),
    })
}

async function runSupa(selection: number, summaryPrompt: string): Promise<Captured> {
    const { A } = supaWorld(summaryPrompt)
    return sendWith(A, A.chats[0], selection)
}

function supaScenario(key: string, selection: number, summaryPrompt: string): Promise<Captured> {
    return scenario(`supa:${key}:${selection}`, () => runSupa(selection, summaryPrompt))
}

/** A memory-overflow send whose origin is removed from the database inside `addText`. */
async function runGone(selection: number): Promise<Captured> {
    const { A } = supaWorld('', { additionalText: 'INFO1\n\nINFO2' })
    h.onAddInfo = () => {
        DBState.db.characters.splice(0, 1)
        selectedCharID.set(selection === 1 ? 0 : -1)
    }
    return sendWith(A, A.chats[0], 0)
}

function goneScenario(selection: number): Promise<Captured> {
    return scenario(`gone:${selection}`, () => runGone(selection))
}

/**
 * A template send whose chat has no author note, so the note is the default
 * text of the template's author-note card.
 */
async function runDefaultNote(selection: number): Promise<Captured> {
    const template = templateDb()
    const cards = (template.promptTemplate as Array<Record<string, unknown>>).map((card) => (
        card.type === 'authornote' ? { ...card, defaultText: `DEFNOTE[${TAGS}]` } : card
    ))
    const { A } = world({ db: { ...template, promptTemplate: cards }, chatA: { note: '' } })
    return sendWith(A, A.chats[0], selection)
}

function defaultNoteScenario(selection: number): Promise<Captured> {
    return scenario(`default-note:${selection}`, () => runDefaultNote(selection))
}

/**
 * A template send with a `memory` card, whose memory system (hypaV2) hands back
 * a summary chat for the card to fill.
 */
async function runMemoryCard(selection: number): Promise<Captured> {
    const { hypaMemoryV2 } = await import('../memory/hypav2')
    vi.mocked(hypaMemoryV2).mockImplementationOnce(async (chats, currentTokens) => ({
        chats: [{ role: 'system', content: 'SUMMARY-TEXT', memo: 'supaMemory' }, ...chats],
        currentTokens,
    }))
    const template = templateDb({ hypav2: true })
    const cards = [
        ...(template.promptTemplate as Array<Record<string, unknown>>).filter((card) => card.type !== 'chat'),
        { type: 'memory', innerFormat: `MCARD[${TAGS}] {{slot}}` },
        { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
    ]
    const { A } = world({ db: { ...template, promptTemplate: cards }, charA: { supaMemory: true } })
    return sendWith(A, A.chats[0], selection)
}

function memoryCardScenario(selection: number): Promise<Captured> {
    return scenario(`memory-card:${selection}`, () => runMemoryCard(selection))
}

/** A memory-overflow send with additional information; when `move`, the selection moves to another chat inside `addText`. */
function memoryScenario(move: boolean): Promise<Captured> {
    return scenario(`supa:addinfo:${move}`, async () => {
        const { A } = supaWorld('', { additionalText: 'INFO1\n\nINFO2' })
        if (move) {
            h.onAddInfo = () => selectedCharID.set(1)
        }
        return sendWith(A, A.chats[0], 0)
    })
}

//#endregion

//#region the parse classes of a non-template prompt

/** Each class of parse a plain prompt makes, by the marker its field carries. */
const PLAIN_PARSES: Array<[string, string]> = [
    ['main prompt', 'MAIN'],
    ['jailbreak', 'JB'],
    ['global note', 'GN'],
    ['author note', 'NOTE'],
    ['description', 'DESC'],
    ['additional information', 'ADDI'],
    ['personality', 'PERS'],
    ['scenario', 'SCEN'],
    ['normal lorebook prompt', 'LORE'],
    ['description-position lorebook prompt', 'LDESC'],
    ['depth-0 lorebook prompt', 'LD0'],
    ['depth-0 assistant lorebook prompt', 'LD0A'],
    ['depth lorebook prompt', 'LD1'],
    ['character depth prompt', 'DP'],
    ['first message', 'FIRST'],
    ['sent message text', 'RESID'],
]

/** The label that precedes `content` on its line in `text` (`Label: content`), or `null`. */
function labelOf(text: string, content: string): string | null {
    const found = new RegExp(`(?:^|\\n)([^\\n:]+): ${content}`).exec(text)
    return found ? found[1] : null
}

/** The group message wrapper `GRP[...]` that stands right before the message text `body`, or `null`. */
function wrapperOf(text: string, body: string): string | null {
    const found = new RegExp(`(GRP\\[[^\\]]*\\])\\n${body}`).exec(text)
    return found ? found[1] : null
}

function json(value: object | undefined): string {
    return JSON.stringify(value)
}

function personaTokens(text: string): string[] {
    return text.match(/P[SAB]-PROMPT|GLOBAL-PROMPT|EDITED-PROMPT/g) ?? []
}

function expectPlainPrompt(r: Captured, from: string, exampleFrom: string): void {
    expect(r.outcome, 'the send completes').toBe(true)
    for (const [, label] of PLAIN_PARSES) {
        expect(marker(r.promptText, label), label).toBe(`${label}[${from}]`)
    }
    expect(marker(r.promptText, 'EXU')).toBe(`EXU[${exampleFrom}]`)
    expect(marker(r.promptText, 'EXC')).toBe(`EXC[${exampleFrom}]`)
}

describe('guard: with the selection on the send\'s chat, the plain prompt reads that chat', () => {
    test('guard: each parse class of the plain prompt reads the chat the send started in', async () => {
        const r = await plainScenario(0)
        expectPlainPrompt(r, FROM_A, FROM_A_NO_VAR)
    })

    test('guard: the bias strings, persona block, asset and embedding query read the send\'s chat', async () => {
        const r = await plainScenario(0)
        expect(json(r.biasString)).toBe(json([[`BIAS[${FROM_A}]`, 5], [`CBIAS[${FROM_A}]`, 3]]))
        expect(personaTokens(r.promptText)).toEqual(['PA-PROMPT'])
        expect(r.prompt.find((e) => e.content.includes('RESID'))?.multimodals?.length ?? 0).toBe(1)
        expect(labelOf(r.queries[0], 'U0 hi')).toBe('PersonaA')
    })

    test('guard: the igp request reads the send\'s chat', async () => {
        const r = await plainScenario(0)
        expect(textOf(r.emotionBodies[0])).toBe(`IGP[${FROM_A}]`)
    })
})

for (const { name, selection } of STALE) {
    describe(`when ${name} for the whole send, the plain prompt reads the send's chat`, () => {
        for (const [title, label] of PLAIN_PARSES) {
            test(`the ${title} parse reads the send's owner, persona and chat`, async () => {
                const r = await plainScenario(selection)
                expect(r.outcome, 'the send completes').toBe(true)
                expect(marker(r.promptText, label)).toBe(`${label}[${FROM_A}]`)
            })
        }

        test('the example messages parse reads the send\'s owner and persona', async () => {
            const r = await plainScenario(selection)
            expect(marker(r.promptText, 'EXU')).toBe(`EXU[${FROM_A_NO_VAR}]`)
            expect(marker(r.promptText, 'EXC')).toBe(`EXC[${FROM_A_NO_VAR}]`)
        })

        test('the bias entries read the send\'s owner, persona and chat', async () => {
            const r = await plainScenario(selection)
            expect(json(r.biasString)).toBe(json([[`BIAS[${FROM_A}]`, 5], [`CBIAS[${FROM_A}]`, 3]]))
        })

        test('the persona block carries the send\'s chat\'s persona prompt', async () => {
            const r = await plainScenario(selection)
            expect(personaTokens(r.promptText)).toEqual(['PA-PROMPT'])
        })

        test('an asset tag in a sent message finds the send\'s chat\'s module assets', async () => {
            const r = await plainScenario(selection)
            expect(r.prompt.find((e) => e.content.includes('RESID'))?.multimodals?.length ?? 0).toBe(1)
        })

        test('the additional-information query labels user turns with the send\'s chat\'s persona', async () => {
            const r = await plainScenario(selection)
            expect(labelOf(r.queries[0], 'U0 hi')).toBe('PersonaA')
        })

        test('the igp request is parsed as a chatML prompt that reads the send\'s owner, persona and chat', async () => {
            const r = await plainScenario(selection)
            expect(textOf(r.emotionBodies[0])).toBe(`IGP[${FROM_A}]`)
        })
    })
}

describe('when the selection moves to another chat in the middle of the send, the plain prompt still reads the send\'s chat', () => {
    // The move happens inside the additional-information step: each parse
    // that runs after it is the one this exercises.
    for (const [title, label] of PLAIN_PARSES.filter(([, l]) => !['MAIN', 'JB', 'GN', 'NOTE', 'DESC', 'ADDI'].includes(l))) {
        test(`the ${title} parse reads the send's owner, persona and chat`, async () => {
            const r = await plainScenario(0, true)
            expect(r.outcome, 'the send completes').toBe(true)
            expect(marker(r.promptText, label)).toBe(`${label}[${FROM_A}]`)
        })
    }

    test('the example messages, bias entries and persona block read the send\'s chat', async () => {
        const r = await plainScenario(0, true)
        expect(marker(r.promptText, 'EXC')).toBe(`EXC[${FROM_A_NO_VAR}]`)
        expect(json(r.biasString)).toBe(json([[`BIAS[${FROM_A}]`, 5], [`CBIAS[${FROM_A}]`, 3]]))
        expect(personaTokens(r.promptText)).toEqual(['PA-PROMPT'])
    })

    test('the additional-information query labels user turns with the send\'s chat\'s persona', async () => {
        const r = await memoryScenario(true)
        expect(labelOf(r.queries[0], 'one')).toBe('PersonaA')
    })

    test('the summarizer input of supaMemory labels user turns with the send\'s chat\'s persona', async () => {
        const r = await memoryScenario(true)
        expect(labelOf(r.memoryBodies[0][0].content, 'one')).toBe('PersonaA')
    })

    test('guard: with the selection on the send\'s chat throughout, the query and the summarizer input label user turns with its persona', async () => {
        const r = await memoryScenario(false)
        expect(labelOf(r.queries[0], 'one')).toBe('PersonaA')
        expect(labelOf(r.memoryBodies[0][0].content, 'one')).toBe('PersonaA')
    })
})

//#endregion

//#region the parse classes of a template prompt, promptInfo and the igp request

const TEMPLATE_PARSES: Array<[string, string]> = [
    ['template main card', 'TPLMAIN'],
    ['persona card', 'PCARD'],
    ['description card', 'DCARD'],
    ['author note card', 'ACARD'],
    ['chatML card', 'CHATML'],
    ['plain card', 'TPLPLAIN'],
    ['global note card', 'TPLGN'],
    ['jailbreak card', 'TPLJB'],
    ['chain-of-thought card', 'TPLCOT'],
    ['sent message text', 'RESID'],
]

/** The cards whose text `promptInfo.promptText` keeps for the reply. */
const PROMPT_TEXT_PARSES: Array<[string, string]> = [
    ['template main card', 'TPLMAIN'],
    ['persona card', 'PCARD'],
    ['description card', 'DCARD'],
    ['author note card', 'ACARD'],
    ['plain card', 'TPLPLAIN'],
    ['jailbreak card', 'TPLJB'],
    ['chain-of-thought card', 'TPLCOT'],
]

describe('guard: with the selection on the send\'s chat, the template prompt reads that chat', () => {
    test('guard: each card class of the template prompt, the reply\'s promptInfo and the igp request read the chat the send started in', async () => {
        const r = await templateScenario(0)
        expect(r.outcome, 'the send completes').toBe(true)
        for (const [, label] of TEMPLATE_PARSES) {
            expect(marker(r.promptText, label), label).toBe(`${label}[${FROM_A}]`)
        }
        expect(json(r.replyPromptInfo?.promptToggles)).toBe(json([{ key: 'Mod A toggle', value: 'ON' }]))
        const stored = (r.replyPromptInfo?.promptText ?? []).map((e) => e.content).join('\n')
        for (const [, label] of PROMPT_TEXT_PARSES) {
            expect(marker(stored, label), label).toBe(`${label}[${FROM_A}]`)
        }
        expect(textOf(r.emotionBodies[0])).toBe(`IGP[${FROM_A}]`)
    })
})

for (const { name, selection } of STALE) {
    describe(`when ${name} for the whole send, the template prompt reads the send's chat`, () => {
        for (const [title, label] of TEMPLATE_PARSES) {
            test(`the ${title} parse reads the send's owner, persona and chat`, async () => {
                const r = await templateScenario(selection)
                expect(r.outcome, 'the send completes').toBe(true)
                expect(marker(r.promptText, label)).toBe(`${label}[${FROM_A}]`)
            })
        }

        for (const [title, label] of PROMPT_TEXT_PARSES) {
            test(`the ${title} text stored on the reply's promptInfo reads the send's owner, persona and chat`, async () => {
                const r = await templateScenario(selection)
                const stored = (r.replyPromptInfo?.promptText ?? []).map((e) => e.content).join('\n')
                expect(marker(stored, label)).toBe(`${label}[${FROM_A}]`)
            })
        }

        test('the module toggles stored on the reply\'s promptInfo are the send\'s chat\'s', async () => {
            const r = await templateScenario(selection)
            expect(json(r.replyPromptInfo?.promptToggles)).toBe(json([{ key: 'Mod A toggle', value: 'ON' }]))
        })

        test('the igp request is parsed as a chatML prompt that reads the send\'s owner, persona and chat', async () => {
            const r = await templateScenario(selection)
            expect(textOf(r.emotionBodies[0])).toBe(`IGP[${FROM_A}]`)
        })
    })
}

//#endregion

//#region a group send

describe('guard: with the selection on the group, a group send reads the group\'s chat', () => {
    test('guard: each member turn reads its own name with the group\'s persona and chat', async () => {
        const r = await groupScenario(0)
        expect(r.models.length).toBe(2)
        expect(marker(textOf(r.models[0].formated ?? []), 'MAIN')).toBe('MAIN[Mia/PersonaA/VAR-A]')
        expect(marker(textOf(r.models[1].formated ?? []), 'MAIN')).toBe('MAIN[Max/PersonaA/VAR-A]')
        expect(wrapperOf(textOf(r.models[0].formated ?? []), 'from-max')).toBe('GRP[Max/PersonaA/VAR-A]')
    })
})

describe('when the selection is on an unrelated character, a group send reads the group\'s chat', () => {
    test('the main prompt of each member turn reads that member with the group\'s persona and chat', async () => {
        const r = await groupScenario(3)
        expect(r.models.length).toBe(2)
        expect(marker(textOf(r.models[0].formated ?? []), 'MAIN')).toBe('MAIN[Mia/PersonaA/VAR-A]')
        expect(marker(textOf(r.models[1].formated ?? []), 'MAIN')).toBe('MAIN[Max/PersonaA/VAR-A]')
    })

    test('the message wrapper names the speaker and reads the group\'s persona and chat', async () => {
        const r = await groupScenario(3)
        expect(wrapperOf(textOf(r.models[0].formated ?? []), 'from-max')).toBe('GRP[Max/PersonaA/VAR-A]')
    })

    test('the persona block carries the group chat\'s persona prompt in every member turn', async () => {
        const r = await groupScenario(3)
        expect(r.models.map((m) => personaTokens(textOf(m.formated ?? [])))).toEqual([['PA-PROMPT'], ['PA-PROMPT']])
    })
})

//#endregion

//#region supaMemory

describe('supaMemory reads the chat it summarizes', () => {
    test('guard: the summarizer input labels user turns with the persona bound to the send\'s chat', async () => {
        const r = await supaScenario('plain', 0, '')
        expect(r.memoryBodies.length).toBeGreaterThan(0)
        expect(labelOf(r.memoryBodies[0][0].content, 'one')).toBe('PersonaA')
    })

    for (const { name, selection } of STALE) {
        test(`the summarizer input labels user turns with the persona bound to the send's chat when ${name}`, async () => {
            const r = await supaScenario('plain', selection, '')
            expect(r.memoryBodies.length).toBeGreaterThan(0)
            expect(labelOf(r.memoryBodies[0][0].content, 'one')).toBe('PersonaA')
        })

        test(`a chatML summarization prompt reads the send's owner and persona when ${name}`, async () => {
            const r = await supaScenario('chatml', selection, '<|im_start|>system\nSUMP[{{char}}/{{user}}] {{slot}}<|im_end|>')
            expect(r.memoryBodies.length).toBeGreaterThan(0)
            expect(marker(textOf(r.memoryBodies[0]), 'SUMP')).toBe('SUMP[Alice/PersonaA]')
        })
    }

    test('guard: a chatML summarization prompt reads the send\'s owner and persona', async () => {
        const r = await supaScenario('chatml', 0, '<|im_start|>system\nSUMP[{{char}}/{{user}}] {{slot}}<|im_end|>')
        expect(marker(textOf(r.memoryBodies[0]), 'SUMP')).toBe('SUMP[Alice/PersonaA]')
    })
})

//#endregion

//#region a subject that is gone

describe('when the send\'s chat is removed mid-send, nothing reads the selection', () => {
    // The removal happens inside the additional-information step. The send
    // ends at its next origin check, after supaMemory has asked its summary.
    test('the additional-information query keeps the persona bound to the chat object it was given (selection on another chat)', async () => {
        const r = await goneScenario(1)
        expect(labelOf(r.queries[0], 'one')).toBe('PersonaA')
    })

    test('the additional-information query keeps the persona bound to the chat object it was given (selection at Home)', async () => {
        const r = await goneScenario(-1)
        expect(labelOf(r.queries[0], 'one')).toBe('PersonaA')
    })

    test('the summarizer input keeps the persona bound to the chat object supaMemory was given (selection on another chat)', async () => {
        const r = await goneScenario(1)
        expect(labelOf(r.memoryBodies[0][0].content, 'one')).toBe('PersonaA')
    })

    test('the summarizer input keeps the persona bound to the chat object supaMemory was given (selection at Home)', async () => {
        const r = await goneScenario(-1)
        expect(labelOf(r.memoryBodies[0][0].content, 'one')).toBe('PersonaA')
    })

    test('the first-message parse reads an empty chat and the global persona, not the other chat the selection moved to', async () => {
        const r = await goneScenario(1)
        expect(marker(r.memoryBodies[0][0].content, 'FIRST')).toBe('FIRST[Alice/GlobalUser/null]')
    })

    test('guard: with the selection at Home the first-message parse reads an empty chat and the global persona', async () => {
        const r = await goneScenario(-1)
        expect(marker(r.memoryBodies[0][0].content, 'FIRST')).toBe('FIRST[Alice/GlobalUser/null]')
    })
})

//#endregion

//#region a chat id with two holders

describe('a chat whose id has two holders', () => {
    /** The first holder is bound to persona A, the second to persona B; the selection is on the second. */
    function dupScenario(): Promise<Captured> {
        return scenario('dup', async () => {
            const first = makeChat('chat-dup', [msg('user', 'U0 hi'), msg('user', 'RESID[{{getvar::resid}}]')], {
                bindedPersona: 'p-A', modules: ['mod-A'], note: `NOTE[${TAGS}]`, scriptstate: { $who: 'VAR-A', $resid: TAGS },
            })
            const second = makeChat('chat-dup', [msg('user', 'U0 hi')], {
                bindedPersona: 'p-B', modules: ['mod-B'], note: `NOTE[${TAGS}]`, scriptstate: { $who: 'VAR-B', $resid: TAGS },
            })
            const A = makeChar('char-A', 'Alice', [first, second], { desc: `DESC[${TAGS}]`, additionalText: 'INFO1\n\nINFO2' })
            installDb([A], {
                personas: [{ ...PERSONA_SELECTED }, { ...PERSONA_A }, { ...PERSONA_B }], selectedPersona: 0, modules: [MODULE_A, MODULE_B],
                personaPrompt: GLOBAL_PROMPT, ...templateDb({ igpPrompt: `<|im_start|>system\nIGP[${TAGS}]<|im_end|>` }),
            })
            A.chatPage = 1
            return sendWith(A, first, 0)
        })
    }

    test('the description parse reads the holder the send started from', async () => {
        const r = await dupScenario()
        expect(marker(r.promptText, 'DESC')).toBe(`DESC[${FROM_A}]`)
    })

    test('the author note parse reads the holder the send started from', async () => {
        const r = await dupScenario()
        expect(marker(r.promptText, 'NOTE')).toBe(`NOTE[${FROM_A}]`)
    })

    test('the persona block carries the persona bound to the holder the send started from', async () => {
        const r = await dupScenario()
        expect(personaTokens(r.promptText)).toEqual(['PA-PROMPT'])
    })

    test('the module toggles stored on the reply are the holder\'s the send started from', async () => {
        const r = await dupScenario()
        expect(json(r.replyPromptInfo?.promptToggles)).toBe(json([{ key: 'Mod A toggle', value: 'ON' }]))
    })

    test('the additional-information query labels user turns with the persona bound to the holder the send started from', async () => {
        const r = await dupScenario()
        expect(labelOf(r.queries[0], 'U0 hi')).toBe('PersonaA')
    })

    test('the igp request reads the holder the send started from', async () => {
        const r = await dupScenario()
        expect(textOf(r.emotionBodies[0])).toBe(`IGP[${FROM_A}]`)
    })
})

//#endregion

//#region memory systems receive the send's subject

describe('the send hands the memory systems its subject', () => {
    function subjectOf(args: ReadonlyArray<object | number | undefined>): { origin?: { chaId: string, chatId: string } } | undefined {
        return args[6] as { origin?: { chaId: string, chatId: string } } | undefined
    }

    test('hypaMemoryV2 receives a subject on the send\'s chat as its trailing argument', async () => {
        const { hypaMemoryV2 } = await import('../memory/hypav2')
        vi.mocked(hypaMemoryV2).mockClear()
        h.tokPerChat = 10
        const { A } = world({ db: { maxContext: 170, hypav2: true }, charA: { supaMemory: true } })
        await sendWith(A, A.chats[0], 1)

        expect(vi.mocked(hypaMemoryV2)).toHaveBeenCalledTimes(1)
        const subject = subjectOf(vi.mocked(hypaMemoryV2).mock.calls[0])
        expect(subject?.origin, 'the subject argument').toEqual({ chaId: 'char-A', chatId: 'chat-A' })
    })

    test('hypaMemoryV3 receives a subject on the send\'s chat as its trailing argument', async () => {
        const { hypaMemoryV3 } = await import('../memory/hypav3')
        vi.mocked(hypaMemoryV3).mockClear()
        h.tokPerChat = 10
        const { A } = world({ db: { maxContext: 170, hypaV3: true }, charA: { supaMemory: true } })
        await sendWith(A, A.chats[0], 1)

        expect(vi.mocked(hypaMemoryV3)).toHaveBeenCalledTimes(1)
        const subject = subjectOf(vi.mocked(hypaMemoryV3).mock.calls[0])
        expect(subject?.origin, 'the subject argument').toEqual({ chaId: 'char-A', chatId: 'chat-A' })
    })

    test('guard: hypaMemoryV2 and hypaMemoryV3 still receive the chats, the chat and the character of the send', async () => {
        const { hypaMemoryV2 } = await import('../memory/hypav2')
        vi.mocked(hypaMemoryV2).mockClear()
        h.tokPerChat = 10
        const { A } = world({ db: { maxContext: 170, hypav2: true }, charA: { supaMemory: true } })
        await sendWith(A, A.chats[0], 0)

        const args = vi.mocked(hypaMemoryV2).mock.calls[0]
        expect((args[3] as Chat).id).toBe('chat-A')
        expect((args[4] as character).chaId).toBe('char-A')
    })
})

//#endregion

//#region the persona block is gated on the persona of the send's chat

interface PersonaFixture {
    /** The persona the chat is bound to (`''` binds none). */
    bound: string
    /** That persona's saved prompt, when it is one of the three fixtures. */
    boundPrompt?: string
    /** The editing buffer's prompt: `db.personaPrompt`. */
    buffer: string
    template?: boolean
    db?: Record<string, unknown>
}

const PERSONA_TEMPLATE = [
    { type: 'plain', text: 'TPLMAIN', role: 'system', type2: 'main' },
    { type: 'persona', innerFormat: 'PCARD {{slot}}' },
    { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
]

/** One send at the selection on the send's chat, with the persona fixtures given. */
async function personaSend(f: PersonaFixture): Promise<Captured> {
    const savedA = f.boundPrompt === undefined ? PERSONA_A : { ...PERSONA_A, personaPrompt: f.boundPrompt }
    const { A } = world({
        db: {
            personas: [{ ...PERSONA_SELECTED }, { ...savedA }, { ...PERSONA_B }], personaPrompt: f.buffer,
            mainPrompt: 'MAIN[{{user}}]', ...(f.template ? { promptTemplate: PERSONA_TEMPLATE, promptSettings: {} } : {}), ...f.db,
        },
        chatA: { bindedPersona: f.bound },
    })
    return sendWith(A, A.chats[0], 0)
}

describe('the persona block is gated on the send\'s chat\'s persona prompt', () => {
    test('a chat bound to another persona than the selected one sends that persona\'s prompt when the global prompt is empty', async () => {
        const r = await personaSend({ bound: 'p-A', buffer: '' })
        expect(personaTokens(r.promptText)).toEqual(['PA-PROMPT'])
    })

    test('a chat bound to another persona with an empty prompt sends no persona card when the global prompt is not empty', async () => {
        const r = await personaSend({ bound: 'p-A', boundPrompt: '', buffer: 'GLOBAL-PROMPT', template: true })
        expect(r.promptText.match(/PCARD/g) ?? []).toEqual([])
    })

    test('guard: a chat bound to another persona with an empty prompt sends no persona text in plain mode when the global prompt is not empty', async () => {
        const r = await personaSend({ bound: 'p-A', boundPrompt: '', buffer: 'GLOBAL-PROMPT' })
        expect(personaTokens(r.promptText)).toEqual([])
    })

    test('guard: a chat with no bound persona sends the global prompt', async () => {
        const r = await personaSend({ bound: '', buffer: 'GLOBAL-PROMPT' })
        expect(personaTokens(r.promptText)).toEqual(['GLOBAL-PROMPT'])
    })

    test('guard: a chat bound to another persona with a prompt sends that prompt when the global prompt is not empty', async () => {
        const r = await personaSend({ bound: 'p-A', buffer: 'GLOBAL-PROMPT' })
        expect(personaTokens(r.promptText)).toEqual(['PA-PROMPT'])
    })

    test('guard: a chat bound to the selected persona sends no persona block when the buffer\'s prompt is empty, whatever its saved entry holds', async () => {
        const r = await personaSend({ bound: 'p-S', buffer: '' })
        expect(personaTokens(r.promptText)).toEqual([])
    })
})

//#endregion

//#region a chat bound to the selected persona reads the buffer

describe('a chat bound to the selected persona reads the persona as it is being edited', () => {
    const edited = { username: 'EditedName', personaPrompt: 'EDITED-PROMPT' }

    test('the persona block carries the buffer\'s prompt, not the saved entry\'s', async () => {
        const r = await personaSend({ bound: 'p-S', buffer: 'EDITED-PROMPT', db: edited })
        expect(personaTokens(r.promptText)).toEqual(['EDITED-PROMPT'])
    })

    test('{{user}} in the prompt is the buffer\'s name, not the saved entry\'s', async () => {
        const r = await personaSend({ bound: 'p-S', buffer: 'EDITED-PROMPT', db: edited })
        expect(marker(r.promptText, 'MAIN')).toBe('MAIN[EditedName]')
    })

    test('guard: a chat bound to another persona reads that persona\'s saved entry while the buffer is edited', async () => {
        const r = await personaSend({ bound: 'p-A', buffer: 'EDITED-PROMPT', db: edited })
        expect(personaTokens(r.promptText)).toEqual(['PA-PROMPT'])
        expect(marker(r.promptText, 'MAIN')).toBe('MAIN[PersonaA]')
    })

    test('guard: a chat with no bound persona reads the buffer', async () => {
        const r = await personaSend({ bound: '', buffer: 'EDITED-PROMPT', db: edited })
        expect(personaTokens(r.promptText)).toEqual(['EDITED-PROMPT'])
        expect(marker(r.promptText, 'MAIN')).toBe('MAIN[EditedName]')
    })

    test('guard: with the selected index out of range a chat bound to the persona reads its saved entry', async () => {
        const r = await personaSend({ bound: 'p-S', buffer: 'EDITED-PROMPT', db: { ...edited, selectedPersona: 99 } })
        expect(personaTokens(r.promptText)).toEqual(['PS-PROMPT'])
        expect(marker(r.promptText, 'MAIN')).toBe('MAIN[SelectedPersona]')
    })

    test('guard: clearing the buffer\'s prompt stops the persona block of a chat bound to the selected persona', async () => {
        const r = await personaSend({ bound: 'p-S', buffer: '', db: { username: 'EditedName' } })
        expect(personaTokens(r.promptText)).toEqual([])
    })
})

//#endregion

//#region guards: a gone subject, a duplicated id, the cost of a send, and callers with no subject

describe('guard: the send\'s cost, the selection-bound helpers and the unchanged options', () => {
    test('guard: an undisturbed send makes no more than one full origin resolution however long the chat', async () => {
        const messages = Array.from({ length: 30 }, (_, i) => msg(i % 2 ? 'char' : 'user', `m${i} {{getvar::who}}`))
        const { A } = world({ db: templateDb(), messagesA: messages })
        resetResolutionCountForTests()
        const r = await sendWith(A, A.chats[0], 0)

        expect(r.outcome).toBe(true)
        expect(resolutionCountForTests()).toBeLessThanOrEqual(1)
    })

    test('guard: getModuleToggles() with no subject reads the selected chat\'s modules', async () => {
        const { getModuleToggles } = await import('../modules')
        world()
        selectedCharID.set(1)
        expect(getModuleToggles()).toContain('modB=Mod B toggle')
        expect(getModuleToggles()).not.toContain('modA')
        selectedCharID.set(0)
        expect(getModuleToggles()).toContain('modA=Mod A toggle')
    })
})

//#endregion

//#region the default author note, the memory card and the persona block of a gone subject

/** The persona-prompt texts a persona block can carry in these fixtures. */
const PERSONA_PROMPT_TEXTS = ['PS-PROMPT', 'PA-PROMPT', 'PB-PROMPT', GLOBAL_PROMPT]

describe('guard: with the selection on the send\'s chat, the default author note and the memory card read that chat', () => {
    test('guard: the default text of the author-note card reads the chat the send started in', async () => {
        const r = await defaultNoteScenario(0)
        expect(r.outcome, 'the send completes').toBe(true)
        expect(marker(r.promptText, 'DEFNOTE')).toBe(`DEFNOTE[${FROM_A}]`)
    })

    test('guard: the memory card and the text it stores on the reply read the chat the send started in', async () => {
        const r = await memoryCardScenario(0)
        expect(r.outcome, 'the send completes').toBe(true)
        expect(r.promptText).toContain('SUMMARY-TEXT')
        expect(marker(r.promptText, 'MCARD')).toBe(`MCARD[${FROM_A}]`)
        const stored = (r.replyPromptInfo?.promptText ?? []).map((e) => e.content).join('\n')
        expect(marker(stored, 'MCARD')).toBe(`MCARD[${FROM_A}]`)
    })
})

for (const { name, selection } of STALE) {
    describe(`when ${name} for the whole send, the default author note and the memory card read the send's chat`, () => {
        test('the default text of the author-note card, used when the chat has no note, reads the send\'s owner, persona and chat', async () => {
            const r = await defaultNoteScenario(selection)
            expect(r.outcome, 'the send completes').toBe(true)
            expect(marker(r.promptText, 'DEFNOTE')).toBe(`DEFNOTE[${FROM_A}]`)
        })

        test('the memory card reads the send\'s owner, persona and chat', async () => {
            const r = await memoryCardScenario(selection)
            expect(r.outcome, 'the send completes').toBe(true)
            expect(r.promptText, 'the summary chat fills the card').toContain('SUMMARY-TEXT')
            expect(marker(r.promptText, 'MCARD')).toBe(`MCARD[${FROM_A}]`)
        })

        test('the memory card text stored on the reply\'s promptInfo reads the send\'s owner, persona and chat', async () => {
            const r = await memoryCardScenario(selection)
            const stored = (r.replyPromptInfo?.promptText ?? []).map((e) => e.content).join('\n')
            expect(marker(stored, 'MCARD')).toBe(`MCARD[${FROM_A}]`)
        })
    })
}

describe('when the send\'s chat is removed mid-send, the persona block reads the global persona', () => {
    /** The persona-prompt text the persona block parses, from the top-level parser calls of the send. */
    async function personaBlockTexts(selection: number): Promise<string[]> {
        const calls = await recordParses(() => runGone(selection), true)
        return calls.map((c) => c.text).filter((text) => PERSONA_PROMPT_TEXTS.includes(text))
    }

    test('the persona block carries the global persona prompt, not the prompt of the persona bound to the chat the selection moved to', async () => {
        expect(await personaBlockTexts(1)).toEqual([GLOBAL_PROMPT])
    })

    test('guard: with the selection at Home the persona block carries the global persona prompt', async () => {
        expect(await personaBlockTexts(-1)).toEqual([GLOBAL_PROMPT])
    })
})

//#endregion

//#region the send's parser calls are complete and keep their options

/**
 * Every top-level parser call of each send below (a plain character, a prompt template with a chatML card and igp, the default author note, a memory card, a group, and supaMemory with a plain and a chatML prompt), as `via|text|option keys`
 * (the text is its first 32 characters, sorted): the parses that `index`,
 * `exampleMessages`, `supaMemory` and `parseChatML` make, plus the parses the
 * send makes through a subject already. Calls that pass no options at all have
 * an empty key list.
 */
const RECORDED_PARSES: Record<string, string[]> = {
    plain: [
        'parser|IGP[Alice/PersonaA/VAR-A]|',
        'scripts|<|im_start|>system\\nIGP[{{char}}/|',
        'scripts|ADDI[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|BIAS[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|C1 there|chara,role',
        'scripts|C1 there|chara,runVar,subject',
        'scripts|C1 there|chara,runVar,subject',
        'scripts|CBIAS[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DESC[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|DP[{{char}}/{{user}}/{{getvar::w|chara',
        'scripts|EXC[{{char}}/{{user}}]|chara',
        'scripts|EXU[{{char}}/{{user}}]|chara',
        'scripts|FIRST[{{char}}/{{user}}/{{getvar|chara',
        'scripts|GN[{{char}}/{{user}}/{{getvar::w|chara',
        'scripts|JB[{{char}}/{{user}}/{{getvar::w|chara',
        'scripts|LD0A[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|LD0[{{char}}/{{user}}/{{getvar::|chara',
        'scripts|LD1[{{char}}/{{user}}/{{getvar::|chara',
        'scripts|LD1[{{char}}/{{user}}/{{getvar::|chara',
        'scripts|LDESC[{{char}}/{{user}}/{{getvar|chara',
        'scripts|LORE[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|MAIN[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|NOTE[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|RESID[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|RESID[{{char}}/{{user}}/{{getvar|chara,runVar,subject',
        'scripts|RESID[{{getvar::resid}}] see {{a|chara,runVar,subject',
        'scripts|U0 hi|chara,role',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|[Start a new chat]|chara',
        'scripts|\\n\\nCircumstances and context of t|chara',
        'scripts|\\n\\nDescription of {{char}}: PERS[|chara',
        'scripts|reply|chara,runVar,subject',
    ],
    template: [
        'parser|CHATML[{{char}}/{{user}}/{{getva|',
        'parser|CHATML[{{char}}/{{user}}/{{getva|',
        'parser|IGP[Alice/PersonaA/VAR-A]|',
        'scripts|<|im_start|>system\\nIGP[{{char}}/|',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DESC[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|EXC[{{char}}/{{user}}/{{getvar|chara',
        'scripts|EXU[{{char}}/{{user}}/{{getvar|chara',
        'scripts|FIRST[{{char}}/{{user}}/{{getvar|chara',
        'scripts|NOTE[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|RESID[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|RESID[{{char}}/{{user}}/{{getvar|chara,runVar,subject',
        'scripts|RESID[{{getvar::resid}}]|chara,runVar,subject',
        'scripts|TPLCOT[Alice/PersonaA/VAR-A]|',
        'scripts|TPLCOT[{{char}}/{{user}}/{{getva|chara,role',
        'scripts|TPLCOT[{{char}}/{{user}}/{{getva|chara,role',
        'scripts|TPLGN[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLGN[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLJB[Alice/PersonaA/VAR-A]|',
        'scripts|TPLJB[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLJB[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLMAIN[Alice/PersonaA/VAR-A]|',
        'scripts|TPLMAIN[{{char}}/{{user}}/{{getv|chara,role',
        'scripts|TPLMAIN[{{char}}/{{user}}/{{getv|chara,role',
        'scripts|TPLPLAIN[Alice/PersonaA/VAR-A]|',
        'scripts|TPLPLAIN[{{char}}/{{user}}/{{get|chara,role',
        'scripts|TPLPLAIN[{{char}}/{{user}}/{{get|chara,role',
        'scripts|U0 hi|chara,role',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|[Start a new chat]|chara',
        'scripts|\\n\\nCircumstances and context of t|chara',
        'scripts|\\n\\nDescription of {{char}}: PERS[|chara',
        'scripts|reply|chara,runVar,subject',
    ],
    group: [
        'scripts|GRP[{{char}}/{{user}}/{{getvar::|chara',
        'scripts|GRP[{{char}}/{{user}}/{{getvar::|chara',
        'scripts|GRP[{{char}}/{{user}}/{{getvar::|chara',
        'scripts|GRP[{{char}}/{{user}}/{{getvar::|chara',
        'scripts|MAIN[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|MAIN[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|MIADESC[{{char}}/{{user}}/{{getv|chara',
        'scripts|Max desc|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|from-max|chara,role',
        'scripts|from-max|chara,role',
        'scripts|from-max|chara,runVar,subject',
        'scripts|from-max|chara,runVar,subject',
        'scripts|from-max|chara,runVar,subject',
        'scripts|from-max|chara,runVar,subject',
        'scripts|gu0|chara,role',
        'scripts|gu0|chara,role',
        'scripts|gu0|chara,runVar,subject',
        'scripts|gu0|chara,runVar,subject',
        'scripts|gu0|chara,runVar,subject',
        'scripts|gu0|chara,runVar,subject',
        'scripts|reply|chara,role',
        'scripts|reply|chara,runVar,subject',
        'scripts|reply|chara,runVar,subject',
        'scripts|reply|chara,runVar,subject',
        'scripts|reply|chara,runVar,subject',
        'scripts||',
        'scripts||',
        'scripts||chara',
        'scripts||chara',
    ],
    supaPlain: [
        'scripts|DESC[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|EXC[{{char}}/{{user}}/{{getvar|chara',
        'scripts|EXU[{{char}}/{{user}}/{{getvar|chara',
        'scripts|FIRST[{{char}}/{{user}}/{{getvar|chara',
        'scripts|NOTE[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|[Start a new chat]|chara',
        'scripts|\\n\\nCircumstances and context of t|chara',
        'scripts|\\n\\nDescription of {{char}}: PERS[|chara',
        'scripts|five|chara,role',
        'scripts|five|chara,runVar,subject',
        'scripts|five|chara,runVar,subject',
        'scripts|four|chara,role',
        'scripts|four|chara,runVar,subject',
        'scripts|four|chara,runVar,subject',
        'scripts|one|chara,role',
        'scripts|one|chara,runVar,subject',
        'scripts|one|chara,runVar,subject',
        'scripts|reply|chara,runVar,subject',
        'scripts|seven|chara,role',
        'scripts|seven|chara,runVar,subject',
        'scripts|seven|chara,runVar,subject',
        'scripts|six|chara,role',
        'scripts|six|chara,runVar,subject',
        'scripts|six|chara,runVar,subject',
        'scripts|three|chara,role',
        'scripts|three|chara,runVar,subject',
        'scripts|three|chara,runVar,subject',
        'scripts|two|chara,role',
        'scripts|two|chara,runVar,subject',
        'scripts|two|chara,runVar,subject',
        'scripts||',
        'scripts||chara',
        'scripts||chara',
    ],
    supaChatML: [
        'parser|SUMP[{{char}}/{{user}}] PersonaA|',
        'scripts|DESC[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|EXC[{{char}}/{{user}}/{{getvar|chara',
        'scripts|EXU[{{char}}/{{user}}/{{getvar|chara',
        'scripts|FIRST[{{char}}/{{user}}/{{getvar|chara',
        'scripts|NOTE[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|[Start a new chat]|chara',
        'scripts|\\n\\nCircumstances and context of t|chara',
        'scripts|\\n\\nDescription of {{char}}: PERS[|chara',
        'scripts|five|chara,role',
        'scripts|five|chara,runVar,subject',
        'scripts|five|chara,runVar,subject',
        'scripts|four|chara,role',
        'scripts|four|chara,runVar,subject',
        'scripts|four|chara,runVar,subject',
        'scripts|one|chara,role',
        'scripts|one|chara,runVar,subject',
        'scripts|one|chara,runVar,subject',
        'scripts|reply|chara,runVar,subject',
        'scripts|seven|chara,role',
        'scripts|seven|chara,runVar,subject',
        'scripts|seven|chara,runVar,subject',
        'scripts|six|chara,role',
        'scripts|six|chara,runVar,subject',
        'scripts|six|chara,runVar,subject',
        'scripts|three|chara,role',
        'scripts|three|chara,runVar,subject',
        'scripts|three|chara,runVar,subject',
        'scripts|two|chara,role',
        'scripts|two|chara,runVar,subject',
        'scripts|two|chara,runVar,subject',
        'scripts||',
        'scripts||chara',
        'scripts||chara',
    ],
    defaultNote: [
        'parser|CHATML[{{char}}/{{user}}/{{getva|',
        'parser|CHATML[{{char}}/{{user}}/{{getva|',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DEFNOTE[{{char}}/{{user}}/{{getv|chara',
        'scripts|DESC[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|EXC[{{char}}/{{user}}/{{getvar|chara',
        'scripts|EXU[{{char}}/{{user}}/{{getvar|chara',
        'scripts|FIRST[{{char}}/{{user}}/{{getvar|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|TPLCOT[Alice/PersonaA/VAR-A]|',
        'scripts|TPLCOT[{{char}}/{{user}}/{{getva|chara,role',
        'scripts|TPLCOT[{{char}}/{{user}}/{{getva|chara,role',
        'scripts|TPLGN[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLGN[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLJB[Alice/PersonaA/VAR-A]|',
        'scripts|TPLJB[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLJB[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLMAIN[Alice/PersonaA/VAR-A]|',
        'scripts|TPLMAIN[{{char}}/{{user}}/{{getv|chara,role',
        'scripts|TPLMAIN[{{char}}/{{user}}/{{getv|chara,role',
        'scripts|TPLPLAIN[Alice/PersonaA/VAR-A]|',
        'scripts|TPLPLAIN[{{char}}/{{user}}/{{get|chara,role',
        'scripts|TPLPLAIN[{{char}}/{{user}}/{{get|chara,role',
        'scripts|U0 hi|chara,role',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|[Start a new chat]|chara',
        'scripts|\\n\\nCircumstances and context of t|chara',
        'scripts|\\n\\nDescription of {{char}}: PERS[|chara',
        'scripts|reply|chara,runVar,subject',
        'scripts||',
    ],
    memoryCard: [
        'parser|CHATML[{{char}}/{{user}}/{{getva|',
        'parser|CHATML[{{char}}/{{user}}/{{getva|',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|ACARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|DESC[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|EXC[{{char}}/{{user}}/{{getvar|chara',
        'scripts|EXU[{{char}}/{{user}}/{{getvar|chara',
        'scripts|FIRST[{{char}}/{{user}}/{{getvar|chara',
        'scripts|MCARD[{{char}}/{{user}}/{{getvar|',
        'scripts|MCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|NOTE[{{char}}/{{user}}/{{getvar:|chara',
        'scripts|PA-PROMPT|chara',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|PCARD[{{char}}/{{user}}/{{getvar|chara',
        'scripts|TPLCOT[Alice/PersonaA/VAR-A]|',
        'scripts|TPLCOT[{{char}}/{{user}}/{{getva|chara,role',
        'scripts|TPLCOT[{{char}}/{{user}}/{{getva|chara,role',
        'scripts|TPLGN[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLGN[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLJB[Alice/PersonaA/VAR-A]|',
        'scripts|TPLJB[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLJB[{{char}}/{{user}}/{{getvar|chara,role',
        'scripts|TPLMAIN[Alice/PersonaA/VAR-A]|',
        'scripts|TPLMAIN[{{char}}/{{user}}/{{getv|chara,role',
        'scripts|TPLMAIN[{{char}}/{{user}}/{{getv|chara,role',
        'scripts|TPLPLAIN[Alice/PersonaA/VAR-A]|',
        'scripts|TPLPLAIN[{{char}}/{{user}}/{{get|chara,role',
        'scripts|TPLPLAIN[{{char}}/{{user}}/{{get|chara,role',
        'scripts|U0 hi|chara,role',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|U0 hi|chara,runVar,subject',
        'scripts|[Start a new chat]|chara',
        'scripts|\\n\\nCircumstances and context of t|chara',
        'scripts|\\n\\nDescription of {{char}}: PERS[|chara',
        'scripts|reply|chara,runVar,subject',
        'scripts||',
    ],
}

interface ParseRun {
    name: string
    recorded: string[]
    /** The origin every parse must stand for. */
    origin: { chaId: string, chatId: string }
    run: () => Promise<Captured>
}

const PARSE_RUNS: ParseRun[] = [
    { name: 'plain character', recorded: RECORDED_PARSES.plain, origin: { chaId: 'char-A', chatId: 'chat-A' }, run: () => runPlain(0) },
    { name: 'prompt-template character', recorded: RECORDED_PARSES.template, origin: { chaId: 'char-A', chatId: 'chat-A' }, run: () => runTemplate(0) },
    { name: 'prompt-template character with the default author note', recorded: RECORDED_PARSES.defaultNote, origin: { chaId: 'char-A', chatId: 'chat-A' }, run: () => runDefaultNote(0) },
    { name: 'prompt-template character with a memory card', recorded: RECORDED_PARSES.memoryCard, origin: { chaId: 'char-A', chatId: 'chat-A' }, run: () => runMemoryCard(0) },
    { name: 'group', recorded: RECORDED_PARSES.group, origin: { chaId: 'grp', chatId: 'gc1' }, run: () => runGroup(0) },
    { name: 'supaMemory (plain summarization prompt)', recorded: RECORDED_PARSES.supaPlain, origin: { chaId: 'char-A', chatId: 'chat-A' }, run: () => runSupa(0, '') },
    {
        name: 'supaMemory (chatML summarization prompt)', recorded: RECORDED_PARSES.supaChatML, origin: { chaId: 'char-A', chatId: 'chat-A' },
        run: () => runSupa(0, '<|im_start|>system\nSUMP[{{char}}/{{user}}] {{slot}}<|im_end|>'),
    },
]

/** `via|text|keys` of a call, without `subject` among the keys. */
function signatureWithoutSubject(call: ParserCall): string {
    return `${call.via}|${call.text}|${call.keys.filter((k) => k !== 'subject').join(',')}`
}

/** A recorded `via|text|keys` signature without `subject` among the keys; the text may contain `|`, the keys never do. */
function withoutSubject(signature: string): string {
    const cut = signature.lastIndexOf('|')
    const keys = signature.slice(cut + 1).split(',').filter((k) => k !== '' && k !== 'subject')
    return `${signature.slice(0, cut)}|${keys.join(',')}`
}

for (const { name, recorded, origin, run } of PARSE_RUNS) {
    describe(`the parser calls of a ${name} send`, () => {
        test('every top-level call carries a subject standing for the send\'s chat', async () => {
            const calls = await recordParses(run)
            const offenders = calls
                .filter((c) => !(c.subject && c.subject.chaId === origin.chaId && c.subject.chatId === origin.chatId))
                .map((c) => `${c.via}|${c.text}`)
            expect(offenders).toEqual([])
        })

        test('guard: the calls and their options other than subject are the recorded ones', async () => {
            const calls = await recordParses(run)
            expect(calls.map(signatureWithoutSubject).sort()).toEqual(recorded.map(withoutSubject).sort())
        })
    })
}

//#endregion
