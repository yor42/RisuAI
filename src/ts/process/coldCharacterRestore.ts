import { DBState } from "../stores.svelte"
import { alertError } from "../alert"
import { language } from "../../lang"
import type { character, groupChat } from "../storage/database.svelte"
import { readColdStorageItem, type ColdStorageReadResult } from "./coldstorage.svelte"
import { applyStubStateOnRestore } from "./coldCharacter"

/**
 * Reading an archived character's unit back and installing it in place of its
 * stub, shared by `changeChar` (`characters.ts`) and
 * `restoreColdCharacterByChaId` (`coldMemberRestore.ts`).
 *
 * This module must not import `characters.ts` or `index.svelte.ts` statically.
 * The group turn in `index.svelte.ts` loads `coldMemberRestore.ts` on demand
 * so that this path does not add a load-time cycle back through
 * `characters.ts`; a static import of either module here would put that cycle
 * back. (It does reach `index.svelte.ts` indirectly through
 * `coldstorage.svelte.ts`, which the rest of the application already loads.)
 * It does not look at `doingChat`, since a group turn restores a member
 * mid-send. Formatting the installed character and selecting it are the
 * callers' jobs.
 */

type Slot = character | groupChat

export type ColdRestoreOutcome =
    /**
     * `character` is the character now in the list in place of the stub.
     * `installedHere` is true for the one call that read the unit and made the
     * install, false for a call that joined that restore or found the
     * character already full.
     */
    | { status: 'restored', character: Slot, installedHere: boolean }
    /** No slot to install into was left after the read. Nothing was installed and nothing was shown. */
    | { status: 'gone' }
    /** The unit could not be used, or the chaId is held by several characters. The user has been told, and the stub is untouched. */
    | { status: 'refused' }

export interface ColdRestoreOptions {
    /**
     * Find the slot to install into after the read by the stub's `chaId`
     * instead of by the stub object: the sole holder of that id. No holder
     * ends silently as `gone`; several holders are refused with the
     * user-facing alert. A sole holder that is already a full character is
     * left alone, and one that is a stub pointing at another unit than the one
     * read is `gone`: a unit is never installed into a placeholder that points
     * elsewhere. A request that joins a running restore applies the holder
     * count again once that restore has settled: none is `gone`, several are
     * refused with the alert.
     */
    byChaId?: boolean
}

/** One running restore per stub object; a second request for the same stub joins it instead of reading and installing again. */
const running = new WeakMap<object, Promise<ColdRestoreOutcome>>()

/** The indexes of every character holding `chaId`. */
export function findChaIdHolders(chaId: string): number[] {
    const characters = DBState.db?.characters
    const found: number[] = []
    if (!Array.isArray(characters)) {
        return found
    }
    for (let i = 0; i < characters.length; i++) {
        if (characters[i]?.chaId === chaId) {
            found.push(i)
        }
    }
    return found
}

async function readUnit(key: string): Promise<ColdStorageReadResult> {
    try {
        return await readColdStorageItem(key)
    } catch (error) {
        return { status: 'error', error }
    }
}

async function restoreOnce(stub: Slot, options: ColdRestoreOptions): Promise<ColdRestoreOutcome> {
    const key = stub.coldstorage
    if (!key) {
        return { status: 'restored', character: stub, installedHere: false }
    }
    const chaId = stub.chaId
    const result = await readUnit(key)

    // The slot is found again after the read: entries may have been inserted,
    // deleted or replaced while it was pending, so an index taken before it
    // can point at another character.
    const characters = DBState.db?.characters
    if (!Array.isArray(characters)) {
        return { status: 'gone' }
    }
    let index: number
    if (options.byChaId) {
        const holders = findChaIdHolders(chaId)
        if (holders.length === 0) {
            return { status: 'gone' }
        }
        if (holders.length > 1) {
            alertError(language.errors.coldStorageRestoreFailed)
            return { status: 'refused' }
        }
        index = holders[0]
        const holder = characters[index]
        if (!holder.coldstorage) {
            return { status: 'restored', character: holder, installedHere: false }
        }
        if (holder.coldstorage !== key) {
            return { status: 'gone' }
        }
    } else {
        index = characters.indexOf(stub)
        if (index === -1) {
            return { status: 'gone' }
        }
    }
    // The slot's own state is what the restored character inherits: it may be
    // a copy of the stub that was trashed or lifted from the trash meanwhile.
    const target = characters[index]

    if (result.status === 'error') {
        console.error(`Cold storage unit ${key} of ${target.name} could not be read`, result.error)
        alertError(language.errors.coldStorageRestoreUnreadable)
        return { status: 'refused' }
    }
    const stored = result.status === 'ok' ? (result.value as { character?: Slot } | null | undefined)?.character : undefined
    if (!stored) {
        alertError(language.errors.coldStorageRestoreFailed)
        return { status: 'refused' }
    }
    if (stored.chaId !== target.chaId) {
        console.error(`Cold storage unit ${key} holds a character with chaId ${stored.chaId}, but the placeholder ${target.name} has chaId ${target.chaId}; the placeholder is kept`)
        alertError(language.errors.coldStorageRestoreFailed)
        return { status: 'refused' }
    }

    characters[index] = applyStubStateOnRestore(target, stored)
    return { status: 'restored', character: characters[index], installedHere: true }
}

/**
 * Replaces `stub`, a character that is in `DBState.db.characters` as an
 * archived placeholder, by the full character in its unit.
 *
 * The unit is read through `readColdStorageItem`, so a missing unit and an
 * unreadable one are told apart to the user; an unreadable one never claims
 * the data may be lost. The install lands only in the slot found after the
 * read (see `ColdRestoreOptions.byChaId`), and only when the unit's character
 * carries that slot's `chaId` (the placeholder never adopts another id). The
 * restored character keeps the trash state `applyStubStateOnRestore` gives it
 * from the slot as it is when the read completes.
 *
 * Requests for one stub while a restore of it is running join that restore.
 */
export function restoreColdCharacter(stub: Slot, options: ColdRestoreOptions = {}): Promise<ColdRestoreOutcome> {
    const joined = running.get(stub)
    if (joined) {
        const chaId = stub.chaId
        return joined.then((outcome): ColdRestoreOutcome => {
            if (outcome.status !== 'restored') {
                return outcome
            }
            if (options.byChaId) {
                const holders = findChaIdHolders(chaId).length
                if (holders === 0) {
                    return { status: 'gone' }
                }
                if (holders > 1) {
                    alertError(language.errors.coldStorageRestoreFailed)
                    return { status: 'refused' }
                }
            }
            return { ...outcome, installedHere: false }
        })
    }
    const started = restoreOnce(stub, options).finally(() => {
        running.delete(stub)
    })
    running.set(stub, started)
    return started
}
