import { DBState } from "../stores.svelte"
import { reconcileIncomingCharacters, stubRefusal, type StubRefusal } from "../process/coldCharacter"

/**
 * Fork-specific: the plugin setters refuse an archived-character placeholder (a
 * "stub") whose character is loaded in full. The rule is keyed by `chaId`, not
 * by slot: a placeholder is refused when the live holder of its `chaId` is
 * full, when that holder is archived with another unit, or when no character
 * has its `chaId`. The rule itself is `stubRefusal` /
 * `reconcileIncomingCharacters` in `coldCharacter.ts`; this is how it is
 * applied to what a plugin offers, and reported.
 *
 * This module is shared by `plugins.svelte.ts` and `apiV3/v3.svelte.ts` and
 * imports neither.
 */

type IncomingCharacter = Parameters<typeof stubRefusal>[1]

function warnStubRefused(pluginName: string | undefined, chaId: string, reason: StubRefusal) {
    const why = reason === 'live-full'
        ? 'that character is loaded in full'
        : reason === 'other-unit'
            ? 'the archived character in the list points at another unit'
            : 'no character in the list has that id'
    console.warn(`[WARN] Plugin ${pluginName ?? '(unknown)'} tried to put an archived-character placeholder (chaId ${chaId}) into the character list, but ${why}. The placeholder was refused.`)
}

/**
 * `newDb.characters`, when the plugin sends one, comes back with each refused
 * placeholder swapped for the live character it would have displaced, or left
 * out when no live character has its id. An array whose placeholders are all
 * acceptable comes back as it is.
 */
export function withoutStubDowngrades<T extends { characters?: unknown }>(live: readonly IncomingCharacter[] | undefined, newDb: T, pluginName?: string): T {
    if (!Array.isArray(newDb.characters)) {
        return newDb
    }
    const { characters, refused } = reconcileIncomingCharacters(live ?? [], newDb.characters)
    for (const { chaId, reason } of refused) {
        warnStubRefused(pluginName, chaId, reason)
    }
    return refused.length === 0 ? newDb : { ...newDb, characters }
}

/**
 * The error text when `char`, offered for a slot of the live character list by
 * a single-character setter, is a placeholder that may not go into it (the
 * same rule as for the array setters), and null when it may. Logs the refusal.
 * The setters write nothing on a refusal.
 */
export function incomingCharacterRefusal(char: IncomingCharacter, pluginName?: string): string | null {
    if (!char?.coldstorage) {
        return null
    }
    const holders = (DBState.db.characters ?? []).filter((cha) => cha?.chaId === char.chaId)
    const reason = stubRefusal(holders, char)
    if (!reason) {
        return null
    }
    warnStubRefused(pluginName, char.chaId, reason)
    return `The archived-character placeholder for ${char.chaId} cannot replace a character in the list.`
}
