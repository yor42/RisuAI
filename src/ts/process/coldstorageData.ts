import { language } from "../../lang"
import type { Database, character, groupChat, Chat } from "../storage/database.svelte"
import type { SerializableHypaV2Data } from "./memory/hypav2"
import type { SerializableHypaV3Data } from "./memory/hypav3"

export const coldStorageHeader = '\uEF01COLDSTORAGE\uEF01'

const coldStorageLoadErrorPrefix = '[Cold storage data could not be loaded. Key: '
const coldStorageLoadErrorSuffix = ']'

/**
 * Builds the chat-message text that recorded a failed/unusable cold read.
 *
 * `preLoadChat` (`coldstorage.svelte.ts`) does not mutate the chat on a
 * failed read -- it resolves `'error'` and leaves the pointer in
 * `chat.message[0].data` untouched, so the read can simply be retried by
 * reopening the chat. An older install (or backup) can still hold a chat
 * whose `message[0]` was overwritten with this legacy error text instead.
 *
 * This builder has no production caller of its own. It is kept only as the
 * counterpart of `matchColdStorageLoadErrorKey` -- the two share the same
 * prefix/suffix constants so they cannot drift apart -- and is used by
 * tests to build a chat already holding this legacy text, standing in for
 * an install that hit a failed read under the old behaviour.
 * `listRecoverableErrorKeysFromDb` calls `matchColdStorageLoadErrorKey`
 * directly rather than this builder, and the chat-screen notice for a
 * failed read uses the differently-worded, parameterised
 * `language.errors.coldStorageChatLoadFailed`, not this text.
 */
export function formatColdStorageLoadError(coldDataKey: string): string {
    return `${coldStorageLoadErrorPrefix}${coldDataKey}${coldStorageLoadErrorSuffix}`
}

/**
 * True when `chat`'s first message is still a live cold-storage pointer --
 * i.e. `preLoadChat` has not yet restored it (or a read attempt failed and
 * left the pointer in place rather than overwriting it).
 * Used to block sending into a chat that has not finished loading
 * (CHORE-07).
 */
export function isColdChat(chat: Pick<Chat, 'message'> | null | undefined): boolean {
    const data = chat?.message?.[0]?.data
    return typeof data === 'string' && data.startsWith(coldStorageHeader)
}

/**
 * Recovers the key from text that exactly matches
 * `formatColdStorageLoadError`'s output, anchored on the whole string.
 * Returns null for anything else, including a near-miss with extra
 * prefix/suffix text around an otherwise-exact match -- the captured key
 * text itself is never rejected by its format.
 */
export function matchColdStorageLoadErrorKey(text: unknown): string | null {
    if (!text || typeof text !== 'string') {
        return null
    }
    if (!text.startsWith(coldStorageLoadErrorPrefix) || !text.endsWith(coldStorageLoadErrorSuffix)) {
        return null
    }
    return text.slice(coldStorageLoadErrorPrefix.length, text.length - coldStorageLoadErrorSuffix.length)
}

/**
 * The four per-chat side fields a cold blob can carry, shared by
 * `retryLegacyColdChatLoad` (`coldstorage.svelte.ts`) for both the "live"
 * chat and the restored blob.
 */
export type RetryLegacyColdChatSideFields = Pick<Chat, 'hypaV2Data' | 'hypaV3Data' | 'scriptstate' | 'localLore'>

function normalizeChatMemos(memos: string[] | Set<string> | undefined | null): string[] {
    if (!memos) {
        return []
    }
    return Array.isArray(memos) ? memos : Array.from(memos)
}

function mergeHypaV3Categories(
    blobCategories: SerializableHypaV3Data['categories'] | undefined,
    liveCategories: SerializableHypaV3Data['categories'] | undefined,
): SerializableHypaV3Data['categories'] | undefined {
    if (!blobCategories?.length && !liveCategories?.length) {
        return liveCategories ?? blobCategories
    }
    const seenIds = new Set<string>()
    const merged: NonNullable<SerializableHypaV3Data['categories']> = []
    for (const category of [...(blobCategories ?? []), ...(liveCategories ?? [])]) {
        if (seenIds.has(category.id)) {
            continue
        }
        seenIds.add(category.id)
        merged.push(category)
    }
    return merged
}

/**
 * hypaV3 links a summary to the messages it covers by `chatId` memo, not by
 * index (`hypav3.ts`'s `startIdx` computation) -- keeping only the live
 * post-error memory would push every restored message before `startIdx`, so
 * it would never be summarized or prompted again. Emptiness is judged on
 * `summaries.length` alone (semantic, not deep-equal to the cold-storage
 * reset shape): a live chat that never re-accumulated any summary of its
 * own takes the blob's data wholesale, even if some OTHER field (e.g.
 * `modalSettings`) happens to be set on it (CHORE-07).
 *
 * **Accepted limit.** This only protects BLOB messages the blob's own
 * summaries already covered. After the merge, the last summary is a live
 * post-error one, so `startIdx` (`[...lastSummary.chatMemos].at(-1)`) is
 * computed from THAT summary's memos -- any blob
 * message the blob never got around to summarizing (or every blob message,
 * if the blob has `{summaries:[]}` while live has summaries) falls before
 * `startIdx` and is never summarized or prompted again. The same applies to
 * `mergeHypaV2SideField` below when the blob has no `mainChunks` but live
 * does. This is a memory-context gap only -- `chat.message` itself still
 * has every message, restored blob and live tail alike; nothing is lost,
 * only left out of future summarization/prompting until the next full
 * re-summarize.
 */
function mergeHypaV3SideField(
    live: SerializableHypaV3Data | undefined,
    blob: SerializableHypaV3Data | undefined,
    droppedErrorMessageChatId: string | undefined,
): SerializableHypaV3Data | undefined {
    const liveSummaries = live?.summaries ?? []
    if (liveSummaries.length === 0) {
        return blob ? { ...blob } : live
    }

    // The dropped error-text message may have picked up a `chatId` memo on
    // the user's first post-error send (`index.svelte.ts`). Any live
    // summary that still references it must have that one memo removed, or
    // `cleanOrphanedSummary` (`hypav3.ts`) would delete the whole
    // summary on the next send, since the message it was keyed to is gone
    // -- unless `preserveOrphanedMemory` is set (also in `hypav3.ts`). If
    // stripping that one memo leaves a summary with NO memos left at all,
    // this drops the summary outright here instead: `hypav3.ts`'s own
    // `startIdx` computation reads `[...lastSummary.chatMemos].at(-1)`,
    // which would be `undefined` for a summary with an empty list, so an
    // empty-chatMemos summary must never be allowed to become the last one.
    const strippedLiveSummaries = droppedErrorMessageChatId
        ? liveSummaries
            .map((summary) => {
                const memos = normalizeChatMemos(summary.chatMemos)
                if (!memos.includes(droppedErrorMessageChatId)) {
                    return summary
                }
                return {
                    ...summary,
                    chatMemos: memos.filter((memo) => memo !== droppedErrorMessageChatId),
                }
            })
            .filter((summary) => normalizeChatMemos(summary.chatMemos).length > 0)
        : liveSummaries

    return {
        ...live,
        summaries: [...(blob?.summaries ?? []), ...strippedLiveSummaries],
        categories: mergeHypaV3Categories(blob?.categories, live?.categories),
    }
}

/**
 * hypaV2's `mainChunks` are numbered ids, so concatenating blob and live
 * would collide -- this is always a full replacement, never a splice. If
 * the blob has any `mainChunks`, its data is taken wholesale: the
 * post-error messages then sit after `startIdx`, and the normal
 * summarization loop picks them up again. Otherwise the live value (which
 * may itself be empty, if the chat never accumulated hypaV2 memory either
 * before or after the error) is kept untouched (CHORE-07).
 */
function mergeHypaV2SideField(
    live: SerializableHypaV2Data | undefined,
    blob: SerializableHypaV2Data | undefined,
): SerializableHypaV2Data | undefined {
    if (blob?.mainChunks?.length) {
        return blob
    }
    return live
}

/**
 * The side-field merge `retryLegacyColdChatLoad` (`coldstorage.svelte.ts`)
 * applies when restoring a legacy error-text chat's OBJECT-shaped blob --
 * never for a legacy array blob, which carries no side fields at all and
 * whose caller leaves the live side fields untouched instead of calling
 * this (CHORE-07).
 *
 * `droppedErrorMessageChatId` is the `chatId` of the error-text
 * `message[0]` being dropped by the restore, if it has one yet (it only
 * gets one on the user's first post-error send) -- passed through to the
 * hypaV3 merge so it can strip that memo out of any live summary that
 * references it.
 */
export function mergeRetriedColdChatSideFields(
    live: RetryLegacyColdChatSideFields,
    blob: RetryLegacyColdChatSideFields,
    droppedErrorMessageChatId: string | undefined,
): RetryLegacyColdChatSideFields {
    return {
        hypaV2Data: mergeHypaV2SideField(live.hypaV2Data, blob.hypaV2Data),
        hypaV3Data: mergeHypaV3SideField(live.hypaV3Data, blob.hypaV3Data, droppedErrorMessageChatId),
        scriptstate: { ...(blob.scriptstate ?? {}), ...(live.scriptstate ?? {}) },
        localLore: [...(blob.localLore ?? []), ...(live.localLore ?? [])],
    }
}

/**
 * Collects the key from any chat whose FIRST message exactly matches the
 * cold-storage load-error text, regardless of how many messages follow it
 * -- a user who kept chatting after the error keeps every later message,
 * and this only inspects `message[0]`. These blobs are still referenced by
 * that visible error text and must not be treated as unused
 * (CHORE-07).
 */
export function listRecoverableErrorKeysFromDb(db: Pick<Database, 'characters'> | null | undefined): string[] {
    const keys = new Set<string>()
    for (const character of db?.characters ?? []) {
        if (!character) {
            continue
        }
        for (const chat of character.chats ?? []) {
            const key = matchColdStorageLoadErrorKey(chat.message?.[0]?.data)
            if (key) {
                keys.add(key)
            }
        }
    }
    return Array.from(keys)
}

export function getColdStorageBackupKey(name: string): string | null {
    const match = name.match(/^(?:coldstorage[/_])?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.json$/)
    return match?.[1] ?? null
}

/**
 * True when a restore would place a unit under `key`, i.e. the entry name the
 * backup writer produces for it is one `getColdStorageBackupKey` maps back to
 * the same key. A key that fails this and was found inside an archive or named
 * by load-error text is never read or written by a backup; the keys the
 * database itself points at are read as listed.
 */
export function isRestorableColdStorageKey(key: string): boolean {
    return getColdStorageBackupKey(getColdStorageBackupName(key)) === key
}

export function getColdStorageBackupName(key: string): string {
    return `coldstorage_${key}.json`
}

export function isColdStorageBackupData(data: unknown): boolean {
    if (Array.isArray(data)) {
        return true
    }

    return !!data
        && typeof data === 'object'
        && ('character' in data || 'message' in data)
}

/**
 * Whether a restore stores the parsed body of a backup entry as a unit.
 * Under the name the backup writer produces (`coldstorage_<uuid>.json`) any
 * JSON body is a unit: plugin storage holds values of every shape. Under any
 * other accepted name (bare `<uuid>.json`, `coldstorage/<uuid>.json`) the body
 * must still be chat or character shaped.
 */
export function isAcceptedColdStorageBackupEntry(name: string, data: unknown): boolean {
    if (name.startsWith('coldstorage_') && getColdStorageBackupKey(name) !== null) {
        return true
    }
    return isColdStorageBackupData(data)
}

export type ColdStorageInnerKey = {
    key: string
    kind: 'pointer' | 'errorText'
}

function classifyFirstMessage(message: unknown): ColdStorageInnerKey | null {
    if (!message || typeof message !== 'object') {
        return null
    }
    const data = (message as { data?: unknown }).data
    if (typeof data !== 'string') {
        return null
    }
    if (data.startsWith(coldStorageHeader)) {
        return { key: data.slice(coldStorageHeader.length), kind: 'pointer' }
    }
    const errorKey = matchColdStorageLoadErrorKey(data)
    return errorKey ? { key: errorKey, kind: 'errorText' } : null
}

function classifyChatFirstMessage(chat: unknown): ColdStorageInnerKey | null {
    if (!chat || typeof chat !== 'object') {
        return null
    }
    const message = (chat as { message?: unknown }).message
    return Array.isArray(message) ? classifyFirstMessage(message[0]) : null
}

/**
 * The cold-storage keys an archive value refers to: the pointer in, or the
 * legacy load-error text naming, the first message of every chat it holds.
 * Handles a character blob (`{character: {chats}}`), a chat unit
 * (`{message: [...]}`) and a legacy bare message array. Total: whatever else
 * the value holds, or however malformed an inner field is, that part
 * contributes no key and nothing throws. A key reached both ways is a pointer.
 */
export function listInnerColdStorageKeys(value: unknown): ColdStorageInnerKey[] {
    const found = new Map<string, ColdStorageInnerKey>()
    const add = (inner: ColdStorageInnerKey | null) => {
        if (inner && found.get(inner.key)?.kind !== 'pointer') {
            found.set(inner.key, inner)
        }
    }

    if (Array.isArray(value)) {
        add(classifyFirstMessage(value[0]))
    }
    else if (value && typeof value === 'object') {
        const archive = value as { character?: unknown, message?: unknown }
        if (Array.isArray(archive.message)) {
            add(classifyFirstMessage(archive.message[0]))
        }
        const character = archive.character
        if (character && typeof character === 'object') {
            const chats = (character as { chats?: unknown }).chats
            if (Array.isArray(chats)) {
                for (const chat of chats) {
                    add(classifyChatFirstMessage(chat))
                }
            }
        }
    }
    return Array.from(found.values())
}

function listColdDataKeysFromCharacter(character: character | groupChat): string[] {
    const keys: string[] = []
    if (character.coldstorage) {
        keys.push(character.coldstorage)
        if (Array.isArray(character.coldStoragedChats)) {
            keys.push(...character.coldStoragedChats)
        }
    }
    const chats: unknown = character.chats
    if (Array.isArray(chats)) {
        for (const chat of chats) {
            const inner = classifyChatFirstMessage(chat)
            if (inner?.kind === 'pointer') {
                keys.push(inner.key)
            }
        }
    }
    return keys
}

function listColdErrorKeysFromCharacter(character: character | groupChat): string[] {
    const keys: string[] = []
    const chats: unknown = character.chats
    if (Array.isArray(chats)) {
        for (const chat of chats) {
            const inner = classifyChatFirstMessage(chat)
            if (inner?.kind === 'errorText') {
                keys.push(inner.key)
            }
        }
    }
    return keys
}

/** The unit ids the plugin storage mapping (`_coldplugin`) points at. */
export function listColdPluginStorageKeys(db: Pick<Database, 'pluginCustomStorage'> | null | undefined): string[] {
    const mapping: unknown = db?.pluginCustomStorage?._coldplugin
    if (!mapping || typeof mapping !== 'object') {
        return []
    }
    return Object.values(mapping).filter((key): key is string => typeof key === 'string')
}

export function listColdDataKeysFromDb(db: Pick<Database, 'characters'|'pluginCustomStorage'> | null | undefined): string[] {
    const keys = new Set<string>()
    for (const character of db?.characters ?? []) {
        if (!character) {
            continue
        }
        for (const key of listColdDataKeysFromCharacter(character)) {
            keys.add(key)
        }
    }

    for (const key of listColdPluginStorageKeys(db)) {
        keys.add(key)
    }

    return Array.from(keys)
}

/**
 * Where a backup starts reading from. `normal` roots are the keys the
 * database points at (stub, `coldStoragedChats`, a live chat's pointer);
 * `errorText` roots are the keys a live chat's legacy load-error text names;
 * `plugin` roots are plugin storage units, whose content is carried but never
 * searched for further references. `owner` is the display name of the
 * character the root was found on.
 */
export type ColdBackupRoot = {
    key: string
    kind: 'normal' | 'errorText' | 'plugin'
    owner?: string
}

function getColdStorageCharacterLabel(character: character | groupChat): string {
    const name = typeof character.name === 'string' ? character.name.trim() : ''
    const chaId = typeof character.chaId === 'string' ? character.chaId : ''
    return name || chaId || language.errors.coldStorageUnknownCharacterName
}

export function listColdBackupRoots(db: Pick<Database, 'characters'|'pluginCustomStorage'> | null | undefined): ColdBackupRoot[] {
    const roots: ColdBackupRoot[] = []
    for (const character of db?.characters ?? []) {
        if (!character) {
            continue
        }
        const owner = getColdStorageCharacterLabel(character)
        for (const key of listColdDataKeysFromCharacter(character)) {
            roots.push({ key, kind: 'normal', owner })
        }
        for (const key of listColdErrorKeysFromCharacter(character)) {
            roots.push({ key, kind: 'errorText', owner })
        }
    }
    for (const key of listColdPluginStorageKeys(db)) {
        roots.push({ key, kind: 'plugin' })
    }
    return roots
}

export function getColdStorageAffectedCharacters(
    db: Pick<Database, 'characters'> | null | undefined,
    unavailableKeys: Iterable<string>,
    ownersByKey?: ReadonlyMap<string, readonly string[]>,
): {
    characterNames: string[]
    unresolvedKeys: string[]
} {
    const targetKeys = new Set(unavailableKeys)
    const resolvedKeys = new Set<string>()
    const characterNames: string[] = []

    for (const character of db?.characters ?? []) {
        if (!character) {
            continue
        }

        let isAffected = false
        for (const key of listColdDataKeysFromCharacter(character)) {
            if (targetKeys.has(key)) {
                resolvedKeys.add(key)
                isAffected = true
            }
        }

        if (isAffected) {
            characterNames.push(getColdStorageCharacterLabel(character))
        }
    }

    // A key found only inside an archive, or named only by a live chat's
    // load-error text, is not in any character's own list; the collector
    // recorded which characters' roots and archives led to it.
    if (ownersByKey) {
        for (const key of targetKeys) {
            const owners = resolvedKeys.has(key) ? undefined : ownersByKey.get(key)
            if (!owners?.length) {
                continue
            }
            resolvedKeys.add(key)
            for (const owner of owners) {
                if (!characterNames.includes(owner)) {
                    characterNames.push(owner)
                }
            }
        }
    }

    return {
        characterNames,
        unresolvedKeys: Array.from(targetKeys).filter((key) => !resolvedKeys.has(key)),
    }
}
