import { safeStructuredClone } from "../polyfill"
import type { Database, character, groupChat, Chat } from "../storage/database.svelte"

export const coldStorageHeader = '\uEF01COLDSTORAGE\uEF01'

const coldStorageLoadErrorPrefix = '[Cold storage data could not be loaded. Key: '
const coldStorageLoadErrorSuffix = ']'

/**
 * Builds the chat-message text that recorded a failed/unusable cold read.
 *
 * HISTORY (CHORE-07): before stage 7b, `preLoadChat`
 * (`coldstorage.svelte.ts`) wrote this text directly into
 * `chat.message[0].data` whenever a cold read failed or returned unusable
 * data, permanently overwriting the pointer. As of stage 7b, `preLoadChat`
 * no longer mutates the chat on a failed read -- it resolves `'error'` and
 * leaves the pointer in `chat.message[0].data` untouched, so the read can
 * simply be retried by reopening the chat.
 *
 * This builder has no production caller of its own. It is kept only as the
 * counterpart of `matchColdStorageLoadErrorKey` -- the two share the same
 * prefix/suffix constants so they cannot drift apart -- and is used by
 * tests to build a chat already holding this pre-7b text, standing in for
 * an install that hit a failed read before stage 7b shipped.
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
 * i.e. `preLoadChat` has not yet restored it (or a read attempt failed and,
 * as of stage 7b, left the pointer in place rather than overwriting it).
 * Used to block sending into a chat that has not finished loading
 * (CHORE-07 stage 7b).
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
export function matchColdStorageLoadErrorKey(text: string | null | undefined): string | null {
    if (!text) {
        return null
    }
    if (!text.startsWith(coldStorageLoadErrorPrefix) || !text.endsWith(coldStorageLoadErrorSuffix)) {
        return null
    }
    return text.slice(coldStorageLoadErrorPrefix.length, text.length - coldStorageLoadErrorSuffix.length)
}

/**
 * Collects the key from any chat whose FIRST message exactly matches the
 * cold-storage load-error text, regardless of how many messages follow it
 * -- a user who kept chatting after the error keeps every later message,
 * and this only inspects `message[0]`. These blobs are still referenced by
 * that visible error text and must not be treated as unused
 * (CHORE-07 stage 7a §2.2).
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

function replaceData(data: string | undefined, replacer: { [key: string]: string }) {
    if (!data) {
        return data
    }
    return replacer[data] ?? data
}

function replaceCharacterResources(cha: character | groupChat, replacer: { [key: string]: string }) {
    cha.image = replaceData(cha.image, replacer)

    if (cha.emotionImages) {
        for (let i = 0; i < cha.emotionImages.length; i++) {
            cha.emotionImages[i][1] = replaceData(cha.emotionImages[i][1], replacer)
        }
    }

    if (cha.type !== 'group' && cha.additionalAssets) {
        for (let i = 0; i < cha.additionalAssets.length; i++) {
            cha.additionalAssets[i][1] = replaceData(cha.additionalAssets[i][1], replacer)
        }
    }
}

export function replaceColdStoragePayloadResources(data: unknown, replacer: { [key: string]: string }): unknown {
    if (
        !data
        || typeof data !== 'object'
        || !('character' in data)
        || !data.character
        || typeof data.character !== 'object'
    ) {
        return data
    }

    const cloned = safeStructuredClone(data) as { character: character | groupChat }
    replaceCharacterResources(cloned.character, replacer)
    return cloned
}

function listColdDataKeysFromCharacter(character: character | groupChat): string[] {
    const keys: string[] = []
    if (character.coldstorage) {
        keys.push(character.coldstorage)
        keys.push(...(character.coldStoragedChats ?? []))
    }
    for (const chat of character.chats ?? []) {
        const firstMessage = chat.message?.[0]
        if (firstMessage?.data?.startsWith(coldStorageHeader)) {
            keys.push(firstMessage.data.slice(coldStorageHeader.length))
        }
    }
    return keys
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

    const coldPluginStorageKeys = (Object.values((db?.pluginCustomStorage?._coldplugin as {[key:string]:string}) ?? {}))

    for(const key of coldPluginStorageKeys){
        keys.add(key)
    }

    return Array.from(keys)
}

export function getColdStorageAffectedCharacters(
    db: Pick<Database, 'characters'> | null | undefined,
    unavailableKeys: Iterable<string>,
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
            characterNames.push(character.name?.trim() || character.chaId || 'Unknown character')
        }
    }

    return {
        characterNames,
        unresolvedKeys: Array.from(targetKeys).filter((key) => !resolvedKeys.has(key)),
    }
}
