/**
 * Shared, plain-TS (no runes) fixture helpers for the CHORE-01 item-2
 * measurement suite (dbchange-*-bench.svelte.harness.ts in this directory).
 *
 * Deliberately NOT modifying build.ts, same convention as
 * module-scaling-fixture.ts's header explains: build.ts only exports
 * `SEED`, `mulberry32`, `generateProse`, `CharacterSpec`, `TierName`,
 * `TIER_CONFIG`, `BuiltDatabase`, and `buildTierDatabase` (verified with
 * `grep -n "^export " build.ts`) -- every message/chat/lorebook/script
 * builder used by `buildTierDatabase` is a private, unexported function, and
 * `buildTierDatabase` itself has no parameter for "exactly N messages across
 * exactly M chats for one named character" or "N characters with a given
 * total-message budget". This file re-implements the same shapes
 * independently (same field set as build.ts's private `makeCharacter`/
 * `makeChat`/`makeMessage`/`makeLoreEntry`/`makeCustomScript`/`makeTrigger`,
 * verified by reading build.ts before writing this), seeded only from
 * build.ts's exported `mulberry32`/`SEED`/`generateProse`, so results stay
 * deterministic without editing build.ts.
 *
 * Character/chat shape cross-checked against
 * src/ts/storage/database.svelte.ts (character/Chat/CharacterMessage types)
 * and src/ts/process/coldstorageData.ts (cold-storage pointer format) at
 * read time.
 */
import { generateProse, mulberry32, SEED } from './build'

type Rng = () => number

function randInt(rng: Rng, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min
}

function choice<T>(rng: Rng, arr: T[]): T {
    return arr[Math.floor(rng() * arr.length)]
}

function uuidLike(rng: Rng): string {
    const hex = () => Math.floor(rng() * 16).toString(16)
    const seg = (n: number) => Array.from({ length: n }, hex).join('')
    return `${seg(8)}-${seg(4)}-4${seg(3)}-a${seg(3)}-${seg(12)}`
}

const SHORT_WORDS = ['quiet', 'restless', 'familiar', 'uncertain', 'distant', 'sudden', 'gentle', 'sharp', 'faint', 'steady']
function generateShortLine(rng: Rng, minLen = 20, maxLen = 80): string {
    const target = randInt(rng, minLen, maxLen)
    let out = ''
    while (out.length < target) {
        out += (out ? ' ' : '') + choice(rng, SHORT_WORDS) + '-' + choice(rng, SHORT_WORDS)
    }
    return out.slice(0, target)
}

/** Local copy of build.ts's private `distribute` -- splits `total` into `buckets` positive parts, exact sum. */
export function distributeCounts(rng: Rng, total: number, buckets: number): number[] {
    if (buckets <= 0) return []
    const weights = Array.from({ length: buckets }, () => 0.5 + rng())
    const sumWeights = weights.reduce((a, b) => a + b, 0)
    const counts = weights.map((w) => Math.max(1, Math.round((w / sumWeights) * total)))
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

function makeLoreEntryLocal(rng: Rng, idx: number) {
    return {
        key: `keyword-${idx}`,
        secondkey: '',
        insertorder: idx,
        comment: `Lore entry ${idx}`,
        content: generateProse(rng, 150, 400),
        mode: 'normal' as const,
        alwaysActive: rng() < 0.2,
        selective: false,
    }
}

function makeCustomScriptLocal(rng: Rng, idx: number) {
    return {
        comment: `Regex rule ${idx}`,
        in: `/pattern${idx}/g`,
        out: `replacement ${idx}`,
        type: 'editoutput',
        ableFlag: false,
    }
}

function makeTriggerLocal(_rng: Rng, idx: number) {
    return {
        comment: `Trigger ${idx}`,
        type: 'manual' as const,
        conditions: [],
        effect: [],
    }
}

/** Mirrors build.ts's private `makeMessage` -- role/data/time, occasionally with promptInfo. */
export function buildMessage(rng: Rng, idx: number, attachPromptInfo = false): Record<string, unknown> {
    const role: 'user' | 'char' = idx % 2 === 0 ? 'user' : 'char'
    const msg: Record<string, unknown> = {
        role,
        data: generateProse(rng, 200, 900),
        time: 1700000000000 + idx * 60000,
    }
    if (attachPromptInfo) {
        const promptText = [{ role: 'system', content: generateProse(rng, 100, 500) }]
        const turns = randInt(rng, 4, 10)
        for (let i = 0; i < turns; i++) {
            promptText.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: generateProse(rng, 100, 500) })
        }
        msg.promptInfo = { promptName: 'default', promptText }
        msg.generationInfo = { model: 'gpt-4o-mini', inputTokens: randInt(rng, 400, 4000), outputTokens: randInt(rng, 50, 600) }
    }
    return msg
}

/** Mirrors build.ts's private `makeChat`. */
export function buildChat(rng: Rng, chatIdx: number, messageCount: number, promptInfoFraction = 0.1): Record<string, unknown> {
    const messages = []
    for (let i = 0; i < messageCount; i++) {
        const attach = i % 2 === 1 && rng() < promptInfoFraction
        messages.push(buildMessage(rng, i, attach))
    }
    return {
        message: messages,
        note: generateShortLine(rng, 10, 60),
        name: `Chat ${chatIdx + 1}`,
        localLore: Array.from({ length: randInt(rng, 0, 3) }, (_, i) => makeLoreEntryLocal(rng, i)),
        id: uuidLike(rng),
        lastDate: 1700000000000 + messageCount * 60000,
    }
}

/**
 * A cold-storage-STUB chat: shaped like coldstorageData.ts's live-pointer
 * format (`isColdChat`/`coldStorageHeader`) -- `message` trimmed to a single
 * pointer message whose `data` starts with the cold-storage header, standing
 * in for a chat whose real messages were moved out of memory. Not a full
 * re-implementation of the cold-storage subsystem -- just its in-DB shape,
 * for realism in the "some cold-storage-like stubs" fixture requirement.
 */
export function buildColdStorageStubChat(rng: Rng, chatIdx: number, coldKey: string): Record<string, unknown> {
    const COLD_HEADER = 'COLDSTORAGE'
    return {
        message: [{ role: 'user', data: `${COLD_HEADER}${coldKey}`, time: 1700000000000 }],
        note: '',
        name: `Chat ${chatIdx + 1} (cold)`,
        localLore: [],
        id: uuidLike(rng),
        lastDate: 1700000000000,
    }
}

export interface CharacterFieldOptions {
    lorebookCount?: number
    customScriptCount?: number
    triggerCount?: number
}

/** Full field set mirroring build.ts's private `makeCharacter` (minus the `chats` param, taken separately). */
export function buildCharacterFields(rng: Rng, chaId: string, name: string, opts: CharacterFieldOptions = {}): Record<string, unknown> {
    const lorebookCount = opts.lorebookCount ?? randInt(rng, 1, 5)
    const customScriptCount = opts.customScriptCount ?? randInt(rng, 0, 3)
    const triggerCount = opts.triggerCount ?? randInt(rng, 0, 2)
    return {
        type: 'character' as const,
        name,
        image: '',
        firstMessage: generateProse(rng, 200, 500),
        desc: generateProse(rng, 300, 900),
        notes: generateShortLine(rng, 20, 100),
        chatFolders: [],
        chatPage: 0,
        viewScreen: 'none' as const,
        bias: [],
        emotionImages: [],
        globalLore: Array.from({ length: lorebookCount }, (_, i) => makeLoreEntryLocal(rng, i)),
        chaId,
        sdData: [],
        customscript: Array.from({ length: customScriptCount }, (_, i) => makeCustomScriptLocal(rng, i)),
        triggerscript: Array.from({ length: triggerCount }, (_, i) => makeTriggerLocal(rng, i)),
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

// ---------------------------------------------------------------------------
// M1/M2 fixture: ONE realistic character, total messages spread across a
// requested number of chats.
// ---------------------------------------------------------------------------

export interface SelectedCharacterFixture {
    character: Record<string, unknown>
    /** Index of the last message in the LAST chat -- the natural append target for a "streamed token" write. */
    lastChatIndex: number
    lastMessageIndex: number
}

export function buildSelectedCharacterFixture(opts: {
    chaId: string
    totalMessages: number
    chatCount: number
    seedOffset?: number
}): SelectedCharacterFixture {
    const rng = mulberry32(SEED + 9000 + (opts.seedOffset ?? 0))
    const counts = distributeCounts(rng, opts.totalMessages, opts.chatCount)
    const chats = counts.map((count, i) => buildChat(rng, i, count, 0.1))
    const character = {
        ...buildCharacterFields(rng, opts.chaId, `Selected Character (${opts.totalMessages}msg/${opts.chatCount}chat)`),
        chats,
    }
    const lastChatIndex = chats.length - 1
    const lastMessageIndex = (chats[lastChatIndex].message as unknown[]).length - 1
    return { character, lastChatIndex, lastMessageIndex }
}

// ---------------------------------------------------------------------------
// M3/M4 fixture: MANY characters, realistic skew (a few big chats, most
// small), plus some cold-storage-like stubs.
// ---------------------------------------------------------------------------

export interface ManyCharactersFixture {
    characters: Record<string, unknown>[]
    stats: {
        characterCount: number
        totalMessages: number
        bigCharacterCount: number
        coldStorageCharacterCount: number
    }
}

/**
 * Builds `characterCount` characters whose chats sum to approximately
 * `totalMessages` (realistic skew: `bigFraction` of characters carry
 * `bigMessageShare` of all messages; the remainder are small, few-chat
 * characters -- the "a few big chats, most small" shape M3 asks for).
 * `coldStorageFraction` of characters additionally get ONE of their chats
 * replaced with a cold-storage-pointer stub (see `buildColdStorageStubChat`)
 * -- those messages are NOT counted in the returned total (the whole point
 * of cold storage is that they are not resident), which is disclosed in the
 * returned stats rather than silently fudging the total.
 */
export function buildManyCharactersFixture(opts: {
    characterCount: number
    totalMessages: number
    seedOffset?: number
    bigFraction?: number
    bigMessageShare?: number
    coldStorageFraction?: number
}): ManyCharactersFixture {
    const rng = mulberry32(SEED + 20000 + (opts.seedOffset ?? 0))
    const bigFraction = opts.bigFraction ?? 0.01
    const bigMessageShare = opts.bigMessageShare ?? 0.7
    const coldStorageFraction = opts.coldStorageFraction ?? 0.1

    const bigCharacterCount = Math.max(3, Math.round(opts.characterCount * bigFraction))
    const smallCharacterCount = opts.characterCount - bigCharacterCount

    const bigMessageBudget = Math.round(opts.totalMessages * bigMessageShare)
    const smallMessageBudget = opts.totalMessages - bigMessageBudget

    const bigCounts = distributeCounts(rng, bigMessageBudget, bigCharacterCount)
    const smallCounts = smallCharacterCount > 0 ? distributeCounts(rng, smallMessageBudget, smallCharacterCount) : []

    const characters: Record<string, unknown>[] = []
    let coldStorageCharacterCount = 0
    let actualTotalMessages = 0

    for (let i = 0; i < bigCharacterCount; i++) {
        const chaId = `big-${i}`
        const chatCount = randInt(rng, 3, 8)
        const counts = distributeCounts(rng, bigCounts[i], chatCount)
        const chats = counts.map((count, ci) => buildChat(rng, ci, count, 0.05))
        const makeCold = rng() < coldStorageFraction
        let liveMessages = counts.reduce((a, b) => a + b, 0)
        if (makeCold && chats.length > 1) {
            const coldKey = uuidLike(rng)
            liveMessages -= counts[0]
            chats[0] = buildColdStorageStubChat(rng, 0, coldKey)
            ;(chats[0] as Record<string, unknown>).coldPointer = true
            coldStorageCharacterCount++
        }
        actualTotalMessages += liveMessages
        const character = {
            ...buildCharacterFields(rng, chaId, `Big Character ${i}`, { lorebookCount: randInt(rng, 3, 10) }),
            chats,
            ...(makeCold ? { coldstorage: uuidLike(rng), coldStoragedChats: [chats[0].id as string] } : {}),
        }
        characters.push(character)
    }

    for (let i = 0; i < smallCharacterCount; i++) {
        const chaId = `small-${i}`
        const chatCount = randInt(rng, 1, 3)
        const counts = distributeCounts(rng, smallCounts[i] ?? 1, chatCount)
        const chats = counts.map((count, ci) => buildChat(rng, ci, count, 0.02))
        actualTotalMessages += counts.reduce((a, b) => a + b, 0)
        const character = {
            ...buildCharacterFields(rng, chaId, `Side Character ${i}`, { lorebookCount: randInt(rng, 0, 2), customScriptCount: 0, triggerCount: 0 }),
            chats,
        }
        characters.push(character)
    }

    return {
        characters,
        stats: {
            characterCount: characters.length,
            totalMessages: actualTotalMessages,
            bigCharacterCount,
            coldStorageCharacterCount,
        },
    }
}
