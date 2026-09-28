import { DBState } from "../stores.svelte"
import { getColdStorageItem } from "./coldstorage.svelte"
import { characterFormatUpdate } from "../characters"

/**
 * The index of the one character holding `chaId`, or -1 when none or several
 * do. Several holders are refused rather than guessed between.
 */
function soleHolderIndex(chaId: string): number {
    const characters = DBState.db?.characters
    if (!Array.isArray(characters)) {
        return -1
    }
    let found = -1
    for (let i = 0; i < characters.length; i++) {
        if (characters[i]?.chaId === chaId) {
            if (found !== -1) {
                return -1
            }
            found = i
        }
    }
    return found
}

/**
 * Brings the cold-storage character holding `chaId` back into memory, with
 * `changeChar`'s checks: the stored item's character must carry the same
 * `chaId`. Resolves true when the character holding that id is warm
 * afterwards, false when the restore failed and the placeholder was left as
 * it was.
 *
 * The slot is found again by `chaId` after the cold read's await: the
 * characters array can have had entries inserted or deleted while the read
 * was pending, so an index taken before it points at some other character.
 *
 * This module imports `characters.ts` and `coldstorage.svelte.ts`, both of
 * which import `doingChat` from `index.svelte.ts`. The send therefore loads it
 * with a dynamic `import()` at the call site, on the cold-member path only: a
 * static import from `index.svelte.ts` would put a load-time cycle through
 * both of them.
 */
export async function restoreColdCharacterByChaId(chaId: string): Promise<boolean> {
    const before = soleHolderIndex(chaId)
    if (before === -1) {
        return false
    }
    const placeholder = DBState.db.characters[before]
    if (!placeholder.coldstorage) {
        return true
    }
    const coldData = await getColdStorageItem(placeholder.coldstorage)
    if (!coldData?.character || coldData.character.chaId !== chaId) {
        return false
    }
    const index = soleHolderIndex(chaId)
    if (index === -1) {
        return false
    }
    if (!DBState.db.characters[index].coldstorage) {
        return true
    }
    DBState.db.characters[index] = coldData.character
    characterFormatUpdate(index)
    return true
}
