import { v4 as uuidv4 } from "uuid"
import type { Chat, character, groupChat } from "../storage/database.svelte"

/**
 * The archived-character placeholder (the "stub"): what stands in the
 * character list for a character whose full data lives in a cold-storage
 * unit, and the pure rules around it.
 *
 * This module must stay free of `characters.ts`, `index.svelte.ts`, `util.ts`
 * (which loads `characters.ts`) and `coldstorage.svelte.ts` (which imports
 * this module): the restore side, which does read storage, lives in
 * `coldCharacterRestore.ts`.
 */

/**
 * Value of `coldVersion` on a stub built by `buildColdStub`. A stub without it
 * was made by the upstream application; it restores the same way, only its
 * trash state is read more conservatively (`applyStubStateOnRestore`).
 */
export const COLD_STUB_VERSION = 2

/** Longest description a stub carries; the grid shows only a few lines of it. */
const COLD_STUB_DESCRIPTION_LIMIT = 500

type Slot = character | groupChat

/**
 * Exactly the fields a stub carries. It is deliberately not a full
 * `character` or `groupChat`; it is cast to one at the single place that
 * builds it, because every list reader and the save code only read these.
 */
interface ColdStubFields {
    type: 'character' | 'group'
    name: string
    image?: string
    chaId: string
    lastInteraction?: number
    trashTime?: number
    characters?: string[]
    creatorNotes: string
    coldstorage: string
    coldStoragedChats: string[]
    chats: Chat[]
    chatPage: number
    firstMsgIndex: number
    coldVersion: number
    coldChatCount: number
}

/**
 * The text the character grid shows for a description: the `en` section of a
 * multilingual `creatorNotes`, else the text outside any section. It applies
 * the same rule as `parseMultilangString` in `util.ts` (not importable here)
 * and the grid's `['en'] || ['xx']`.
 */
function shownDescription(notes: string): string {
    const sections = /# `(.+?)`\n([\s\S]+?)(?=\n# `|$)/g
    let en = ''
    let match: RegExpExecArray | null
    while ((match = sections.exec(notes)) !== null) {
        if (match.index === sections.lastIndex) {
            sections.lastIndex++
        }
        if (match[1] === 'en') {
            en = match[2]
        }
    }
    return en || notes.replace(sections, '')
}

/**
 * The description a stub carries, chosen the way the grid chooses it and then
 * cut to a bounded length, so the stub renders as the full character does.
 */
function stubDescription(creatorNotes: unknown): string {
    const text = shownDescription(typeof creatorNotes === 'string' ? creatorNotes : '')
    if (text.length <= COLD_STUB_DESCRIPTION_LIMIT) {
        return text
    }
    let cut = text.slice(0, COLD_STUB_DESCRIPTION_LIMIT)
    const last = cut.charCodeAt(cut.length - 1)
    if (last >= 0xD800 && last <= 0xDBFF) {
        cut = cut.slice(0, -1)
    }
    return cut
}

/**
 * The stub for `source`, which is written into the unit `unitKey`.
 * `coldStoragedChats` lists the chat units `source` already points at. Returns
 * a new object; `source` is not modified.
 *
 * Besides the pointer fields (`coldstorage`, `coldStoragedChats` and the one
 * dummy chat, whose first message must stay empty) the stub carries what the
 * character lists show: the real `type` (and a group's member list), name,
 * image, `lastInteraction`, `trashTime`, the chat count and the description.
 * It carries no message content. `trashTime` and `lastInteraction` are left
 * off when unset, so a saved stub has no such key. It never throws on odd
 * saved data, because one bad character must not stop the archive pass: a
 * group without a member list gets an empty one, and a description that is
 * not a string gives an empty description.
 */
export function buildColdStub(source: character, unitKey: string, coldStoragedChats: string[]): character
export function buildColdStub(source: groupChat, unitKey: string, coldStoragedChats: string[]): groupChat
export function buildColdStub(source: Slot, unitKey: string, coldStoragedChats: string[]): Slot
export function buildColdStub(source: Slot, unitKey: string, coldStoragedChats: string[]): Slot {
    const stub: ColdStubFields = {
        type: source.type === 'group' ? 'group' : 'character',
        name: source.name,
        image: source.image,
        chaId: source.chaId,
        creatorNotes: stubDescription(source.creatorNotes),
        coldstorage: unitKey,
        coldStoragedChats: [...coldStoragedChats],
        chats: [{
            id: uuidv4(),
            message: [{
                time: Date.now(),
                data: '',
                role: 'char'
            }],
            note: "",
            name: "",
            localLore: []
        }],
        chatPage: 0,
        firstMsgIndex: 0,
        coldVersion: COLD_STUB_VERSION,
        coldChatCount: Array.isArray(source.chats) ? source.chats.length : 0,
    }
    if (typeof source.lastInteraction === 'number') {
        stub.lastInteraction = source.lastInteraction
    }
    if (source.trashTime) {
        stub.trashTime = source.trashTime
    }
    if (source.type === 'group') {
        stub.characters = Array.isArray(source.characters) ? [...source.characters] : []
    }
    return stub as unknown as Slot
}

/**
 * Whether the boot-time archive pass may turn `cha` into a stub: it is not one
 * already and it is not in the trash.
 */
export function isArchivableCharacter(cha: Slot): boolean {
    return !cha.coldstorage && !cha.trashTime
}

function isCurrentStub(stub: Slot): boolean {
    return typeof stub.coldVersion === 'number' && stub.coldVersion >= COLD_STUB_VERSION
}

/**
 * Gives the character restored from a unit the trash state of the stub it
 * replaces, and returns it. Only `trashTime` is touched.
 *
 * A stub built by this fork is authoritative for the trash state, including
 * its absence: the trash was applied to (or lifted from) the stub after the
 * unit was written. A stub made by the upstream application has no way to
 * record a lifted trash, so only a `trashTime` it does carry (which only a
 * trash action can have set) is applied; otherwise the unit's own state stays.
 */
export function applyStubStateOnRestore<T extends Slot>(stub: Slot, restored: T): T {
    if (isCurrentStub(stub)) {
        if (stub.trashTime) {
            restored.trashTime = stub.trashTime
        } else {
            delete restored.trashTime
        }
    } else if (stub.trashTime) {
        restored.trashTime = stub.trashTime
    }
    return restored
}

/**
 * The chat count a character list shows: the full character's count for a
 * stub built here, `chats.length` for a full character and for a stub made by
 * the upstream application.
 */
export function coldStubChatCount(cha: Slot): number {
    if (cha.coldstorage && isCurrentStub(cha) && typeof cha.coldChatCount === 'number') {
        return cha.coldChatCount
    }
    return cha.chats.length
}
