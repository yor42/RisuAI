/**
 * Synthetic heavy save-data generator — pure data-building logic.
 *
 * This file is PROFILING TOOLING ONLY. It lives entirely outside the RisuAI
 * repo (under the session scratch directory) and must never be copied into
 * the repo itself. It has zero dependency on any RisuAI source file — it
 * only builds plain JS objects shaped like `Database` (see
 * src/ts/storage/database.svelte.ts:802-1278) from a seeded PRNG, so it can
 * run under plain Node/tsx with no mocking required.
 *
 * Sizing rationale (revision 2 — corrects an earlier "modules are small"
 * assumption): there are TWO suspected, separately-attributable costs, not
 * one:
 *   1. src/ts/globalApi.svelte.ts:620-625 — a `$effect` that
 *      `$state.snapshot(DBState.db.modules)`s the WHOLE modules array on
 *      every module-editor keystroke (community-reported "stuttery" text
 *      fields in the module editor).
 *   2. src/ts/globalApi.svelte.ts:658-667 — a `$effect` that deep-clones all
 *      chats of the ACTIVE character on every streaming chunk.
 * Tiers are restructured (see TierName/TIER_CONFIG below) to vary these two
 * axes independently so a measurement can attribute cost to one or the
 * other, plus a `both-heavy` combined worst case and a `light` baseline.
 *
 * Module realism (per project-owner correction): RisuAI modules are
 * heavily-used pseudo-plugins — inline lorebooks with hundreds of entries,
 * substantial embedded CJS source (`RisuModule.cjs: string` — confirmed
 * plain inline source text, not a file reference, per
 * src/ts/process/modules.ts:24), and asset tables. Note `RisuModule.assets`
 * (src/ts/process/modules.ts:30) is `[string,string,string][]` — a
 * (name, path, ext) tuple pointing at an entry saved separately via
 * `saveAsset()` (src/ts/globalApi.svelte.ts:321-346, which writes bytes to
 * Tauri's `assets/` dir or `forageStorage` and returns only a path string
 * like `assets/<hash>.<ext>`) — i.e. assets are REFERENCES, never inline
 * bytes, in the module object itself. A "populated asset table" therefore
 * adds many short strings, not megabytes, to the clone/snapshot path; the
 * megabyte-scale weight of a heavy module comes from `cjs` and `lorebook`,
 * not `assets`. Modeled accordingly below.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic, reproducible across runs.
// ---------------------------------------------------------------------------

export const SEED = 1337

export function mulberry32(seed: number) {
    let a = seed | 0
    return function rng(): number {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

type Rng = () => number

function randInt(rng: Rng, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min
}

function choice<T>(rng: Rng, arr: T[]): T {
    return arr[Math.floor(rng() * arr.length)]
}

function uuidLike(rng: Rng): string {
    // Not a real UUID (no crypto needed) — just unique enough for a
    // synthetic fixture, in the same visual shape RisuAI's `uuid` v4 ids use.
    const hex = () => Math.floor(rng() * 16).toString(16)
    const seg = (n: number) => Array.from({ length: n }, hex).join('')
    return `${seg(8)}-${seg(4)}-4${seg(3)}-a${seg(3)}-${seg(12)}`
}

// ---------------------------------------------------------------------------
// Realistic, varied prose generator (roleplay-chat-flavored, not uniform
// filler) — compressibility matters because the encoder gzips blocks, so
// text is built from a moderate vocabulary + sentence templates rather than
// repeating one fixed string or using purely random bytes.
// ---------------------------------------------------------------------------

const SUBJECTS = ['she', 'he', 'the old man', 'the stranger', 'the captain', 'a soft voice', 'the wind', 'her hand', 'his eyes', 'the room', 'the fire', 'a shadow', 'the crowd', 'the door', 'silence']
const VERBS = ['drifted', 'lingered', 'trembled', 'settled', 'wavered', 'flickered', 'pressed forward', 'hesitated', 'leaned closer', 'pulled away', 'whispered', 'shifted', 'gleamed', 'faded', 'sharpened']
const OBJECTS = ['across the room', 'into the dark', 'toward the window', 'against the cold', 'through the crowd', 'beneath the table', 'over the horizon', 'along the corridor', 'past the threshold', 'into the silence', 'around the fire', 'beyond the walls']
const ADJECTIVES = ['quiet', 'restless', 'familiar', 'uncertain', 'distant', 'sudden', 'gentle', 'sharp', 'faint', 'steady', 'nervous', 'warm', 'cold', 'strange', 'careful']
const NOUNS = ['memory', 'promise', 'question', 'secret', 'warning', 'story', 'plan', 'doubt', 'hope', 'fear', 'answer', 'excuse', 'glance', 'breath', 'thought']
const CONNECTORS = ['But', 'Still,', 'Even so,', 'And yet,', 'For a moment,', 'Somehow,', 'Without warning,', 'At last,', 'Slowly,', 'Then,']
const DIALOGUE_STARTERS = ['"I did not expect this," ', '"You should not have come here," ', '"Tell me the truth," ', '"We do not have much time," ', '"I remember now," ', '"That is not what I meant," ', '"Wait," ', '"Listen to me," ']
const DIALOGUE_TAGS = ['she said quietly.', 'he muttered.', 'the voice replied.', 'she whispered, almost to herself.', 'he answered, not looking up.', 'came the reply.', 'she said, her voice steady.']

function sentence(rng: Rng): string {
    const roll = rng()
    if (roll < 0.2) {
        return `${choice(rng, DIALOGUE_STARTERS)}${choice(rng, DIALOGUE_TAGS)}`
    }
    if (roll < 0.35) {
        return `${choice(rng, CONNECTORS)} ${choice(rng, SUBJECTS)} ${choice(rng, VERBS)} ${choice(rng, OBJECTS)}.`
    }
    if (roll < 0.55) {
        return `${choice(rng, SUBJECTS)[0].toUpperCase()}${choice(rng, SUBJECTS).slice(1)} ${choice(rng, VERBS)}, ${choice(rng, ADJECTIVES)} and ${choice(rng, ADJECTIVES)}.`
    }
    return `There was a ${choice(rng, ADJECTIVES)} ${choice(rng, NOUNS)} in the air, and ${choice(rng, SUBJECTS)} ${choice(rng, VERBS)} ${choice(rng, OBJECTS)}.`
}

/** Builds prose of roughly [minLen,maxLen] characters (varied, not padded). */
export function generateProse(rng: Rng, minLen = 200, maxLen = 900): string {
    const target = randInt(rng, minLen, maxLen)
    let out = ''
    while (out.length < target) {
        out += (out ? ' ' : '') + sentence(rng)
    }
    return out
}

function generateShortLine(rng: Rng, minLen = 20, maxLen = 80): string {
    const target = randInt(rng, minLen, maxLen)
    let out = ''
    while (out.length < target) {
        out += (out ? ' ' : '') + sentence(rng)
    }
    return out.slice(0, target)
}

// ---------------------------------------------------------------------------
// Pseudo-JS code generator for RisuModule.cjs — varied-but-compressible
// "plugin source" text (function/variable-shaped tokens), sized in bytes
// rather than characters-of-prose, since heavy modules' CJS is the intended
// megabyte-scale contributor (see file header).
// ---------------------------------------------------------------------------

const CODE_FN_NAMES = ['handleRequest', 'generateImage', 'runSideStory', 'onMessage', 'onTrigger', 'buildPrompt', 'callLLM', 'parseResponse', 'formatOutput', 'applyLore', 'scheduleTask', 'fetchAsset', 'cacheResult', 'validateInput', 'dispatchEvent']
const CODE_VAR_NAMES = ['context', 'payload', 'result', 'config', 'state', 'buffer', 'response', 'promptChunks', 'sessionId', 'retries', 'cacheKey', 'assetRef']
const CODE_STRINGS = ['"generate side-story"', '"image generation failed"', '"retrying request"', '"applying lorebook entry"', '"cache miss"', '"awaiting LLM response"']

function codeLine(rng: Rng): string {
    const roll = rng()
    if (roll < 0.25) {
        return `function ${choice(rng, CODE_FN_NAMES)}(${choice(rng, CODE_VAR_NAMES)}, ${choice(rng, CODE_VAR_NAMES)}) {`
    }
    if (roll < 0.5) {
        return `    const ${choice(rng, CODE_VAR_NAMES)} = await ${choice(rng, CODE_FN_NAMES)}(${choice(rng, CODE_VAR_NAMES)});`
    }
    if (roll < 0.7) {
        return `    if (${choice(rng, CODE_VAR_NAMES)}) { console.log(${choice(rng, CODE_STRINGS)}); }`
    }
    if (roll < 0.85) {
        return `    ${choice(rng, CODE_VAR_NAMES)}.${choice(rng, CODE_VAR_NAMES)} = ${randInt(rng, 0, 9999)};`
    }
    return `}`
}

/** Builds pseudo-JS source text of roughly `targetBytes` UTF-8 bytes (ASCII-only, so bytes === chars). */
function generateCodeText(rng: Rng, targetBytes: number): string {
    const lines: string[] = [`// Auto-generated synthetic CJS module body (profiling fixture only)`]
    let len = lines[0].length
    while (len < targetBytes) {
        const line = codeLine(rng)
        lines.push(line)
        len += line.length + 1
    }
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Distribution helper: split `total` messages across `chatCount` chats with
// some variance, always summing exactly to `total`.
// ---------------------------------------------------------------------------

function distribute(rng: Rng, total: number, buckets: number): number[] {
    const weights = Array.from({ length: buckets }, () => 0.5 + rng())
    const sumWeights = weights.reduce((a, b) => a + b, 0)
    const counts = weights.map((w) => Math.max(1, Math.round((w / sumWeights) * total)))
    // Fix rounding drift so the sum is exact.
    let drift = total - counts.reduce((a, b) => a + b, 0)
    let i = 0
    while (drift !== 0) {
        const idx = i % buckets
        if (drift > 0) {
            counts[idx]++
            drift--
        } else if (counts[idx] > 1) {
            counts[idx]--
            drift++
        }
        i++
    }
    return counts
}

// ---------------------------------------------------------------------------
// Minimal-but-structurally-complete builders for the shapes documented in
// database.svelte.ts / src/ts/process/modules.ts. Required (non-optional)
// fields are always populated; optional fields are included only where they
// add realistic weight (promptInfo, lorebooks, cjs, etc).
// ---------------------------------------------------------------------------

function makeLoreEntry(rng: Rng, idx: number, contentMin = 150, contentMax = 400) {
    return {
        key: `keyword-${idx}`,
        secondkey: '',
        insertorder: idx,
        comment: `Lore entry ${idx}`,
        content: generateProse(rng, contentMin, contentMax),
        mode: 'normal' as const,
        alwaysActive: rng() < 0.2,
        selective: false,
    }
}

function makeCustomScript(rng: Rng, idx: number) {
    return {
        comment: `Regex rule ${idx}`,
        in: `/pattern${idx}/g`,
        out: `replacement ${idx}`,
        type: 'editoutput',
        ableFlag: false,
    }
}

function makeTrigger(rng: Rng, idx: number) {
    return {
        comment: `Trigger ${idx}`,
        type: 'manual' as const,
        conditions: [],
        effect: [],
    }
}

/** [name, path, ext] — a REFERENCE tuple (see file header); the path shape mirrors saveAsset()'s real output. */
function makeAssetRef(rng: Rng, idx: number): [string, string, string] {
    const ext = choice(rng, ['png', 'webp', 'mp3', 'wav'])
    const hash = uuidLike(rng).replace(/-/g, '')
    return [`asset-${idx}`, `assets/${hash}.${ext}`, ext]
}

function makeOpenAIChatEntry(rng: Rng, role: 'system' | 'user' | 'assistant') {
    return {
        role,
        content: generateProse(rng, 100, 500),
    }
}

function makeMessage(rng: Rng, idx: number, attachPromptInfo: boolean) {
    const role: 'user' | 'char' = idx % 2 === 0 ? 'user' : 'char'
    const msg: Record<string, unknown> = {
        role,
        data: generateProse(rng, 200, 900),
        time: 1700000000000 + idx * 60000,
    }
    if (attachPromptInfo) {
        // Heavy, realistic case: a full prompt reconstruction embedded per
        // message (MessagePresetInfo.promptText: OpenAIChat[]).
        const promptText = []
        promptText.push(makeOpenAIChatEntry(rng, 'system'))
        const turns = randInt(rng, 4, 10)
        for (let i = 0; i < turns; i++) {
            promptText.push(makeOpenAIChatEntry(rng, i % 2 === 0 ? 'user' : 'assistant'))
        }
        msg.promptInfo = {
            promptName: 'default',
            promptText,
        }
        msg.generationInfo = {
            model: 'gpt-4o-mini',
            inputTokens: randInt(rng, 400, 4000),
            outputTokens: randInt(rng, 50, 600),
        }
    }
    return msg
}

function makeChat(rng: Rng, chatIdx: number, messageCount: number, promptInfoFraction: number) {
    const messages = []
    for (let i = 0; i < messageCount; i++) {
        const attach = i % 2 === 1 && rng() < promptInfoFraction // only on 'char' turns
        messages.push(makeMessage(rng, i, attach))
    }
    return {
        message: messages,
        note: generateShortLine(rng, 10, 60),
        name: `Chat ${chatIdx + 1}`,
        localLore: Array.from({ length: randInt(rng, 0, 3) }, (_, i) => makeLoreEntry(rng, i)),
        id: uuidLike(rng),
        lastDate: 1700000000000 + messageCount * 60000,
    }
}

export interface CharacterSpec {
    chaId: string
    name: string
    chatMessageCounts: number[] // messages per chat, in order
    promptInfoFraction: number
}

function makeCharacter(rng: Rng, spec: CharacterSpec) {
    const chats = spec.chatMessageCounts.map((count, i) => makeChat(rng, i, count, spec.promptInfoFraction))
    return {
        type: 'character' as const,
        name: spec.name,
        image: '',
        firstMessage: generateProse(rng, 200, 500),
        desc: generateProse(rng, 300, 900),
        notes: generateShortLine(rng, 20, 100),
        chats,
        chatFolders: [],
        chatPage: 0,
        viewScreen: 'none' as const,
        bias: [],
        emotionImages: [],
        globalLore: Array.from({ length: randInt(rng, 1, 5) }, (_, i) => makeLoreEntry(rng, i)),
        chaId: spec.chaId,
        sdData: [],
        customscript: Array.from({ length: randInt(rng, 0, 3) }, (_, i) => makeCustomScript(rng, i)),
        triggerscript: Array.from({ length: randInt(rng, 0, 2) }, (_, i) => makeTrigger(rng, i)),
        utilityBot: false,
        exampleMessage: generateProse(rng, 150, 400),
        creatorNotes: generateShortLine(rng, 30, 150),
        systemPrompt: '',
        postHistoryInstructions: '',
        alternateGreetings: [],
        tags: ['synthetic', 'profiling'],
        creator: 'synthetic-generator',
        characterVersion: '1.0',
        personality: generateShortLine(rng, 50, 200),
        scenario: generateShortLine(rng, 50, 200),
        firstMsgIndex: -1,
        additionalText: '',
        replaceGlobalNote: '',
    }
}

/**
 * Three module weight classes, per the corrected sizing brief:
 *  - 'light':    a handful of small modules (chat-heavy / light tiers).
 *  - 'moderate': the "many moderate ones" that make up most of a heavy
 *                install (module-heavy / both-heavy tiers).
 *  - 'giant':    the "several very large ones" — hundreds of lorebook
 *                entries, substantial CJS, populated (but lightweight —
 *                reference-only, see file header) asset tables. Sized to
 *                land in the megabytes individually, dominated by `cjs`.
 */
type ModuleWeight = 'light' | 'moderate' | 'giant'

function makeModule(rng: Rng, idx: number, weight: ModuleWeight) {
    let lorebookCount: number, regexCount: number, triggerCount: number, assetCount: number, cjsBytes: number, loreContentMax: number
    switch (weight) {
        case 'light':
            lorebookCount = randInt(rng, 0, 3)
            regexCount = randInt(rng, 0, 1)
            triggerCount = 0
            assetCount = randInt(rng, 0, 2)
            cjsBytes = rng() < 0.3 ? randInt(rng, 50, 300) : 0
            loreContentMax = 300
            break
        case 'moderate':
            lorebookCount = randInt(rng, 10, 50)
            regexCount = randInt(rng, 2, 10)
            triggerCount = randInt(rng, 1, 5)
            assetCount = randInt(rng, 2, 10)
            cjsBytes = randInt(rng, 5, 50) * 1024
            loreContentMax = 400
            break
        case 'giant':
            lorebookCount = randInt(rng, 200, 500)
            regexCount = randInt(rng, 10, 30)
            triggerCount = randInt(rng, 5, 15)
            assetCount = randInt(rng, 20, 100)
            cjsBytes = randInt(rng, 500, 2000) * 1024 // 0.5-2 MB of source text
            loreContentMax = 500
            break
    }
    const mod: Record<string, unknown> = {
        name: `Module ${idx} (${weight})`,
        description: generateShortLine(rng, 30, 120),
        id: uuidLike(rng),
        lorebook: Array.from({ length: lorebookCount }, (_, i) => makeLoreEntry(rng, i, 150, loreContentMax)),
        regex: Array.from({ length: regexCount }, (_, i) => makeCustomScript(rng, i)),
        trigger: Array.from({ length: triggerCount }, (_, i) => makeTrigger(rng, i)),
        assets: Array.from({ length: assetCount }, (_, i) => makeAssetRef(rng, i)),
    }
    if (cjsBytes > 0) {
        mod.cjs = generateCodeText(rng, cjsBytes)
    }
    return mod
}

/** Builds a module list matching the requested weight profile. */
function buildModuleList(rng: Rng, profile: 'light' | 'heavy'): Record<string, unknown>[] {
    if (profile === 'light') {
        // "a handful, small" — chat-heavy / light tiers.
        const count = randInt(rng, 3, 5)
        return Array.from({ length: count }, (_, i) => makeModule(rng, i, 'light'))
    }
    // 'heavy': 30-60 modules installed, several (3-6) very large, rest moderate.
    const total = randInt(rng, 30, 60)
    const giantCount = randInt(rng, 3, 6)
    const modules: Record<string, unknown>[] = []
    for (let i = 0; i < total; i++) {
        const weight: ModuleWeight = i < giantCount ? 'giant' : 'moderate'
        modules.push(makeModule(rng, i, weight))
    }
    return modules
}

function makePersona(rng: Rng, idx: number) {
    return {
        personaPrompt: generateProse(rng, 100, 300),
        name: `Persona ${idx}`,
        icon: '',
        id: uuidLike(rng),
        note: generateShortLine(rng, 20, 80),
    }
}

// ---------------------------------------------------------------------------
// Tier configuration + top-level Database assembly.
//
// Restructured (revision 2) so the two suspected costs — module-editor
// snapshot of `db.modules`, and per-streaming-chunk deep clone of the active
// character's chats — vary independently:
//   light         — light chat, light modules   (baseline)
//   chat-heavy    — heavy chat, light modules    (isolates the chat-clone cost)
//   module-heavy  — light chat, heavy modules    (isolates the module-snapshot cost)
//   both-heavy    — heavy chat, heavy modules    (realistic worst case)
// ---------------------------------------------------------------------------

export type TierName = 'light' | 'chat-heavy' | 'module-heavy' | 'both-heavy'

interface TierConfig {
    activeMessages: number
    activeChatCount: number
    moduleProfile: 'light' | 'heavy'
}

export const TIER_CONFIG: Record<TierName, TierConfig> = {
    light: { activeMessages: 200, activeChatCount: 8, moduleProfile: 'light' },
    'chat-heavy': { activeMessages: 10000, activeChatCount: 40, moduleProfile: 'light' },
    'module-heavy': { activeMessages: 200, activeChatCount: 8, moduleProfile: 'heavy' },
    'both-heavy': { activeMessages: 10000, activeChatCount: 40, moduleProfile: 'heavy' },
}

const OTHER_CHARACTER_COUNT = 30
const PERSONA_COUNT = 5

export interface BuiltDatabase {
    database: Record<string, unknown>
    stats: {
        totalCharacters: number
        totalChats: number
        totalMessages: number
        activeCharacterChaId: string
        activeCharacterMessages: number
        activeCharacterChats: number
        moduleCount: number
    }
}

export function buildTierDatabase(tier: TierName): BuiltDatabase {
    const rng = mulberry32(SEED + tierSeedOffset(tier))
    const config = TIER_CONFIG[tier]

    const activeChatCounts = distribute(rng, config.activeMessages, config.activeChatCount)

    const activeChar = makeCharacter(rng, {
        chaId: `active-${tier}`,
        name: `Active Character (${tier})`,
        chatMessageCounts: activeChatCounts,
        promptInfoFraction: 0.15,
    })

    const otherCharacters = []
    let otherTotalMessages = 0
    let otherTotalChats = 0
    for (let c = 0; c < OTHER_CHARACTER_COUNT; c++) {
        const totalForThisChar = randInt(rng, 100, 300)
        const chatCount = randInt(rng, 2, 4)
        const counts = distribute(rng, totalForThisChar, chatCount)
        otherTotalMessages += totalForThisChar
        otherTotalChats += chatCount
        otherCharacters.push(
            makeCharacter(rng, {
                chaId: `other-${tier}-${c}`,
                name: `Side Character ${c}`,
                chatMessageCounts: counts,
                promptInfoFraction: 0.05,
            }),
        )
    }

    const modules = buildModuleList(rng, config.moduleProfile)
    const personas = Array.from({ length: PERSONA_COUNT }, (_, i) => makePersona(rng, i))

    const globalLoreBooks = [
        {
            name: 'World Lore',
            data: Array.from({ length: 10 }, (_, i) => makeLoreEntry(rng, i)),
        },
        {
            name: 'Faction Lore',
            data: Array.from({ length: 6 }, (_, i) => makeLoreEntry(rng, i)),
        },
    ]

    // The ACTIVE character is placed at index 0 — `selectedCharID` is a
    // runtime-only writable store (src/ts/globalApi.svelte.ts:27), never
    // persisted in the save file itself, so there is no in-file field to
    // "point" it at a character. Index 0 is the natural, easiest-to-select
    // entry after import (first character shown in the character list).
    const characters = [activeChar, ...otherCharacters]

    const database: Record<string, unknown> = {
        formatversion: 5,
        characters,
        botPresets: [],
        botPresetsId: 0,
        modules,
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        personas,
        selectedPersona: 0,
        loreBook: globalLoreBooks,
        // A handful of common top-level fields set explicitly for realism;
        // everything else is left absent and backfilled by setDatabase()'s
        // checkNullish/??= normalization on load (database.svelte.ts:30+).
        username: 'Profiler',
        mainPrompt: '',
        jailbreak: '',
        globalNote: '',
        characterOrder: characters.map((c) => c.chaId),
    }

    const totalCharacters = characters.length
    const totalChats = activeChar.chats.length + otherTotalChats
    const activeCharacterMessages = activeChar.chats.reduce((a: number, c: any) => a + c.message.length, 0)
    const totalMessages = activeCharacterMessages + otherTotalMessages

    return {
        database,
        stats: {
            totalCharacters,
            totalChats,
            totalMessages,
            activeCharacterChaId: activeChar.chaId,
            activeCharacterMessages,
            activeCharacterChats: activeChar.chats.length,
            moduleCount: modules.length,
        },
    }
}

function tierSeedOffset(tier: TierName): number {
    // Distinct-but-deterministic per tier, derived from the single hardcoded
    // SEED so re-running always reproduces byte-identical output per tier.
    return { light: 0, 'chat-heavy': 1, 'module-heavy': 2, 'both-heavy': 3 }[tier]
}
