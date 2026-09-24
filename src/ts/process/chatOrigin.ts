import { v4 as uuidv4 } from "uuid"
import { DBState } from "../stores.svelte"
import type { character, groupChat, Chat } from "../storage/database.svelte"
import { markCharacterForSave } from "../storage/characterSaveMarks"

/**
 * The origin API: an opaque, re-resolved-on-every-use address for a chat
 * (and, for a group, a member) inside the live database, plus the
 * synchronous read/write primitives built on it. This module imports the app
 * store (`stores.svelte.ts`) for live access to `DBState.db`, which is why
 * the pure id fill and duplicate-warning helpers live in the separate
 * `chatIds.ts` instead: storage, boot and backup code that only needs those
 * can use them without loading the rest of the app.
 */

/**
 * A write's address: which owner (a character, or a group by its own
 * `chaId`) holds the chat, which chat, and -- for a group -- which member's
 * trigger is running when that differs from the owner. Holds no index and no
 * object reference, because both go stale the moment the array they point
 * into is edited; every field here is an opaque id, re-resolved against the
 * live database on every use.
 */
export type Origin = {
    chaId: string
    chatId: string
    memberChaId?: string
}

/**
 * What an origin resolved to, for the duration of one synchronous callback.
 * Never persist any field of this past the callback that received it -- the
 * next edit to `characters` (an insert, a delete, a reorder, or a whole-slot
 * replacement) can move or invalidate every one of them.
 */
export interface OriginContext {
    owner: character | groupChat
    ownerIndex: number
    chat: Chat
    chatIndex: number
    member: character | null
    memberIndex: number | null
}

/**
 * Forms the origin of `chat` as held by `character`, straight from the ids
 * already on both objects. Pure: never touches the live database and never
 * mutates its arguments. Returns null and warns, naming `character`, when
 * either object has no id yet -- callers that may be handed an id-less
 * object should fill it first (see `beginWork`).
 */
export function originOf(character: character | groupChat, chat: Chat): Origin | null {
    if (!character.chaId) {
        console.warn(`originOf: character "${character.name}" has no chaId yet; cannot form an origin for it.`)
        return null
    }
    if (!chat.id) {
        console.warn(`originOf: a chat of character "${character.name}" has no id yet; cannot form an origin for it.`)
        return null
    }
    return { chaId: character.chaId, chatId: chat.id }
}

interface CharacterMatch {
    index: number
    character: character | groupChat
}

interface ChatMatch {
    index: number
    chat: Chat
}

/**
 * Scans `DBState.db.characters` for every holder of `chaId`, live, on every
 * call -- no cache, no memory of a past result. Returns null when nothing
 * holds it, when its one holder is a cold-storage placeholder (both "gone",
 * `MC-075`), or when more than one character holds it ("ambiguous",
 * `MC-078`; warns in that case only). A trashed character (`trashTime` set)
 * still resolves.
 */
function resolveCharacterByChaId(chaId: string): CharacterMatch | null {
    const characters = DBState.db?.characters
    if (!Array.isArray(characters)) {
        return null
    }
    let match: CharacterMatch | null = null
    let holders = 0
    for (let i = 0; i < characters.length; i++) {
        const candidate = characters[i]
        if (candidate && candidate.chaId === chaId) {
            holders++
            match = { index: i, character: candidate }
        }
    }
    if (holders === 0) {
        return null
    }
    if (holders > 1) {
        console.warn(
            `More than one character holds chaId "${chaId}". Skipping the write rather than guessing which `
            + `one is real -- this resolves on its own once the duplicate is gone.`
        )
        return null
    }
    if (match && match.character.coldstorage) {
        return null
    }
    return match
}

/**
 * Scans `owner.chats` for every holder of `chatId`, live, on every call.
 * Same gone/ambiguous rules as `resolveCharacterByChaId`, scoped to this one
 * owner's chats rather than the whole database.
 */
function resolveChatInOwner(owner: character | groupChat, chatId: string): ChatMatch | null {
    const chats = owner.chats
    if (!Array.isArray(chats)) {
        return null
    }
    let match: ChatMatch | null = null
    let holders = 0
    for (let i = 0; i < chats.length; i++) {
        const candidate = chats[i]
        if (candidate && candidate.id === chatId) {
            holders++
            match = { index: i, chat: candidate }
        }
    }
    if (holders === 0) {
        return null
    }
    if (holders > 1) {
        console.warn(
            `More than one chat holds id "${chatId}" within "${owner.name}". Skipping the write rather than `
            + `guessing which one is real -- this resolves on its own once the duplicate is gone.`
        )
        return null
    }
    return match
}

/**
 * Resolves an origin against the live database: the owner and its index, the
 * chat and its index, and -- when `origin.memberChaId` is set -- the member
 * and its index, resolved separately from the owner. A gone or ambiguous
 * member resolves to `member: null, memberIndex: null` without affecting the
 * owner or chat resolution. Never reads `selectedCharID` or `chatPage`, never
 * fabricates an object, and never guesses between two holders of an id.
 *
 * Exported for tests only. Every other caller reaches the live data through
 * `writeAt`, `readAt`, `commitCharacter` or `commitChat`, which resolve an
 * origin and discard the result at the end of one synchronous callback; none
 * of those return a live object or an index that can outlive that callback.
 */
export function resolveOrigin(origin: Origin): OriginContext | null {
    const ownerMatch = resolveCharacterByChaId(origin.chaId)
    if (!ownerMatch) {
        return null
    }
    const chatMatch = resolveChatInOwner(ownerMatch.character, origin.chatId)
    if (!chatMatch) {
        return null
    }
    let member: character | null = null
    let memberIndex: number | null = null
    if (origin.memberChaId) {
        const memberMatch = resolveCharacterByChaId(origin.memberChaId)
        if (memberMatch) {
            member = memberMatch.character as character
            memberIndex = memberMatch.index
        }
    }
    return {
        owner: ownerMatch.character,
        ownerIndex: ownerMatch.index,
        chat: chatMatch.chat,
        chatIndex: chatMatch.index,
        member,
        memberIndex,
    }
}

/**
 * A callback for `writeAt`/`readAt` must run to completion synchronously, in
 * the same tick as resolution: the context it receives goes stale on the
 * very next edit to `characters`. Typing the return as `undefined` rejects a
 * Promise-returning (and so `async`) function at compile time -- an ordinary
 * block-bodied arrow function that returns nothing still type-checks. A
 * caller reached through an untyped boundary (a plugin, `any`) can still pass
 * one at runtime; `runOrigin` below catches that with a thenable check, since
 * the compile-time guard alone cannot stop it.
 */
type OriginCallback = (ctx: OriginContext) => undefined

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
        value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof (value as { then?: unknown }).then === 'function'
    )
}

/**
 * Resolves `origin` and, when it resolved, calls `fn` with the context. When
 * `mark` is set, marks the owner -- and the member, whenever it resolved --
 * for save, unconditionally, in a `finally`: a `fn` that throws after writing
 * in place still gets its write saved. A `fn` that returns a thenable throws
 * after it returns (marks still apply), since the compile-time guard on
 * `OriginCallback` cannot stop a caller that bypassed it. Returns false
 * without calling `fn` or marking anything when the origin is gone or
 * ambiguous.
 */
function runOrigin(origin: Origin, fn: OriginCallback, mark: boolean): boolean {
    const ctx = resolveOrigin(origin)
    if (!ctx) {
        return false
    }
    try {
        const result: unknown = fn(ctx)
        if (isThenable(result)) {
            throw new Error(
                'writeAt/readAt requires a synchronous fn; a Promise-returning fn is not supported.'
            )
        }
    } finally {
        if (mark) {
            markCharacterForSave(ctx.owner.chaId)
            if (ctx.member) {
                markCharacterForSave(ctx.member.chaId)
            }
        }
    }
    return true
}

/**
 * Runs `fn` against `origin`'s resolved owner, chat and member, and marks
 * the owner -- and the member, whenever it resolved -- for save. See
 * `runOrigin` for the gone/ambiguous and marking rules.
 */
export function writeAt(origin: Origin, fn: OriginCallback): boolean {
    return runOrigin(origin, fn, true)
}

/**
 * Runs `fn` against `origin`'s resolved owner, chat and member, the same as
 * `writeAt`, but marks nothing -- for a caller that only reads.
 */
export function readAt(origin: Origin, fn: OriginCallback): boolean {
    return runOrigin(origin, fn, false)
}

/**
 * Replaces the owner's or the member's slot in `DBState.db.characters` with
 * `clone`, but only when `clone.chaId` equals that slot's own `chaId` -- a
 * member's clone can never land in the owner's slot, or the reverse. Follows
 * the same gone/ambiguous rule as `resolveOrigin`: false, with nothing
 * written, in either case. Marks whichever slot it wrote.
 */
export function commitCharacter(origin: Origin, which: 'owner' | 'member', clone: character | groupChat): boolean {
    const ctx = resolveOrigin(origin)
    if (!ctx) {
        return false
    }
    if (which === 'owner') {
        if (!clone.chaId || clone.chaId !== ctx.owner.chaId) {
            return false
        }
        DBState.db.characters[ctx.ownerIndex] = clone
        markCharacterForSave(clone.chaId)
        return true
    }
    if (ctx.member === null || ctx.memberIndex === null) {
        return false
    }
    if (!clone.chaId || clone.chaId !== ctx.member.chaId) {
        return false
    }
    DBState.db.characters[ctx.memberIndex] = clone
    markCharacterForSave(clone.chaId)
    return true
}

/**
 * Replaces the owner's chat with `clone`, but only when `clone.id` equals
 * `origin.chatId`. Follows the same gone/ambiguous rule as `resolveOrigin`:
 * false, with nothing written, in either case. Marks the owner.
 */
export function commitChat(origin: Origin, clone: Chat): boolean {
    const ctx = resolveOrigin(origin)
    if (!ctx) {
        return false
    }
    if (!clone.id || clone.id !== origin.chatId) {
        return false
    }
    ctx.owner.chats[ctx.chatIndex] = clone
    markCharacterForSave(ctx.owner.chaId)
    return true
}

/**
 * A registered unit of work in flight against an origin. `end()` unregisters
 * it; a second call is harmless.
 */
export interface WorkHandle {
    origin: Origin
    end: () => void
}

interface Registration {
    chaId: string
    chatId: string
    memberChaId?: string
}

// Plain module state, like `src/ts/localDrafts.ts` -- not a rune. Nothing
// here needs to be reactive: `isWriting` is polled, never watched, and a
// registration that outlives its work (because a caller forgot to call
// `end()`) should not need a reactive graph to eventually settle; it just
// leaves a stale "writing" answer, never a lost write.
const registrations: Registration[] = []

function registerOrigin(origin: Origin): WorkHandle {
    const registration: Registration = { chaId: origin.chaId, chatId: origin.chatId, memberChaId: origin.memberChaId }
    registrations.push(registration)
    let ended = false
    return {
        origin,
        end: () => {
            if (ended) {
                return
            }
            ended = true
            const index = registrations.indexOf(registration)
            if (index !== -1) {
                registrations.splice(index, 1)
            }
        },
    }
}

/**
 * True when `character` already has a `chaId`, or is found by identity among
 * `DBState.db.characters` -- a pre-insertion object or a clone, which was
 * never inserted into the live array, cannot be told apart from the real
 * thing any other way (Svelte 5 proxies compare by identity when both sides
 * were read through `DBState`). Never mutates `character`. Warns and returns
 * false otherwise, so a caller that finds this false knows to fill nothing at
 * all rather than fill this one and fail a later check.
 */
function characterIdFillable(character: character | groupChat): boolean {
    if (character.chaId) {
        return true
    }
    const characters = DBState.db?.characters
    if (Array.isArray(characters) && characters.indexOf(character) !== -1) {
        return true
    }
    console.warn(
        'beginWork: a character with no chaId was not found in the live database; refusing to fill its '
        + 'id. Pass an object read back through DBState, never a clone or a pre-insertion object.'
    )
    return false
}

/**
 * True when `chat` already has an id, or is found by identity among
 * `owner.chats` -- but only once `owner` itself is confirmed live by
 * identity in `DBState.db.characters`. A clone owner that already carries
 * its source's own `chaId` is not enough on its own: `characterIdFillable`
 * accepts such a clone because its own id needs no fill, but a clone's
 * `chats` cannot be trusted to prove `chat` is live either way -- a shallow
 * clone (`{ ...character }`) shares the very same live `chats` array, while
 * a deep one (`$state.snapshot`, `structuredClone`) does not -- so it is the
 * owner-liveness check above, not the clone's `chats` reference, that
 * refuses an unfindable owner here. Same purpose and refusal rule as
 * `characterIdFillable`, scoped to one owner's chats. Never mutates `chat`
 * or `owner`.
 */
function chatIdFillable(owner: character | groupChat, chat: Chat): boolean {
    if (chat.id) {
        return true
    }
    const characters = DBState.db?.characters
    const ownerIsLive = Array.isArray(characters) && characters.indexOf(owner) !== -1
    const chats = ownerIsLive ? owner.chats : null
    if (Array.isArray(chats) && chats.indexOf(chat) !== -1) {
        return true
    }
    console.warn(
        `beginWork: a chat with no id was not found among "${owner.name}"'s live chats; refusing to fill `
        + 'its id. Pass an object read back through DBState, never a clone or a pre-insertion object.'
    )
    return false
}

/**
 * Fills `character.chaId` with a fresh uuid when missing. Callers must only
 * call this once `characterIdFillable(character)` has already returned true.
 * A present `chaId` is never touched.
 */
function fillChaId(character: character | groupChat): { chaId: string, filled: boolean } {
    if (character.chaId) {
        return { chaId: character.chaId, filled: false }
    }
    const fresh = uuidv4()
    character.chaId = fresh
    return { chaId: fresh, filled: true }
}

/**
 * Fills `chat.id` with a fresh uuid when missing. Callers must only call this
 * once `chatIdFillable(owner, chat)` has already returned true. A present id
 * is never touched.
 */
function fillChatId(chat: Chat): { chatId: string, filled: boolean } {
    if (chat.id) {
        return { chatId: chat.id, filled: false }
    }
    const fresh = uuidv4()
    chat.id = fresh
    return { chatId: fresh, filled: true }
}

/**
 * Registers a unit of work against `character`'s chat, filling a missing
 * `chaId` or chat id on the live objects (never reassigning a present one).
 * `character`, `chat` and `member` must all be objects read back through
 * `DBState`, never a caller's pre-insertion object or a clone: a clone or
 * pre-insertion object can never be found in the live data by identity, and
 * filling a chat's id safely requires the owner itself to be found there too
 * -- a clone owner that already carries its source's own `chaId` needs no
 * fill for itself, but a shallow clone's `chats` is the same live array
 * while a deep clone's is not, so only the owner-liveness check, never the
 * clone's `chats` reference, can tell the chat is live. Every object with a
 * missing id is checked for findability first; only once every one of them
 * is found does any fill run,
 * so a call that is going to be refused never leaves a partial fill (an owner
 * id written, then the call refused for an unfindable chat) on the live
 * database. When one is not found, this returns null and warns, and writes
 * nothing. Also returns a handle -- with a warning -- when the origin it
 * built is already ambiguous; the writes made through it will then skip
 * under `resolveOrigin`'s own rule, on their own, until the duplicate is
 * gone.
 *
 * Call this only from an event handler or an async unit of work, never
 * during a reactive derivation ($derived/$effect): it can write to the live
 * database (the id fill), which a derivation must not do.
 *
 * `member` is typed `character | groupChat` because that is the element type
 * of `DBState.db.characters`, the array a caller reads it back from; a group
 * member is semantically always an ordinary character, never a nested group.
 */
export function beginWork(character: character | groupChat, chat: Chat, member?: character | groupChat): WorkHandle | null {
    // Every object with a missing id must be findable live before any fill
    // runs: filling the owner and then discovering the chat cannot be found
    // would leave a fresh chaId written to the live database even though the
    // call as a whole is refused.
    if (!characterIdFillable(character) || !chatIdFillable(character, chat) || (member && !characterIdFillable(member))) {
        return null
    }

    const ownerFill = fillChaId(character)
    const chatFill = fillChatId(chat)
    if (ownerFill.filled || chatFill.filled) {
        markCharacterForSave(ownerFill.chaId)
    }

    let memberChaId: string | undefined
    if (member) {
        const memberFill = fillChaId(member)
        memberChaId = memberFill.chaId
        if (memberFill.filled) {
            markCharacterForSave(memberFill.chaId)
        }
    }

    const origin: Origin = memberChaId
        ? { chaId: ownerFill.chaId, chatId: chatFill.chatId, memberChaId }
        : { chaId: ownerFill.chaId, chatId: chatFill.chatId }

    // Read-only: resolving here (and discarding the result) is what produces
    // the ambiguous-origin warning at registration time, in addition to the
    // one every later write already gets from resolveOrigin.
    resolveOrigin(origin)

    return registerOrigin(origin)
}

/**
 * True when a registered unit of work targets `target.chaId` (as an owner or
 * as a group's member), or -- when `target.chatId` is given -- targets that
 * chat of it specifically. Registrations are counted, so two overlapping
 * units of work both keep `isWriting` true until both have called `end()`.
 * A stale registration (a caller that never called `end()`) leaves a
 * spurious "writing" answer here, never a lost write.
 */
export function isWriting(target: { chaId: string, chatId?: string }): boolean {
    return registrations.some((registration) => {
        const targetsCharacter = registration.chaId === target.chaId || registration.memberChaId === target.chaId
        if (!targetsCharacter) {
            return false
        }
        return target.chatId === undefined || registration.chatId === target.chatId
    })
}
