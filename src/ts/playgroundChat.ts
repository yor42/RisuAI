import { type character } from "./storage/database.svelte";
import { DBState, PlaygroundStore, selectedCharID } from "./stores.svelte";
import { findCharacterIndexbyId } from "./util";
import { characterFormatUpdate, createBlankChar } from "./characters";
import { alertNamedRestoreFailure, restoreArchivedForWrite } from "./process/coldCharacterAccess";
import { markCharacterForSave } from "./storage/characterSaveMarks";

const PLAYGROUND_CHA_ID = '§playground'

/**
 * Opens the Playground chat: selects the `§playground` utility character
 * (created when none exists) after setting the Playground view to its chat
 * page, clears its `trashTime` when set, and bumps its interaction time
 * through a format update. An archived `§playground` (a placeholder in
 * `DBState.db.characters`) is restored from its unit first. A placeholder is
 * never written, format-updated or selected,
 * and the Playground view never moves to its chat page while one holds the
 * slot. When the restore fails, or ends with a placeholder still holding the
 * slot, the user is told once, by name, and nothing changes: the placeholder
 * stays as it is, no character is selected and the Playground view stays where
 * it was. When the restore ends with no `§playground` in the list at all, a
 * blank one is created and selected.
 */
export async function openPlaygroundChat() {
    const existingIndex = findCharacterIndexbyId(PLAYGROUND_CHA_ID)
    if (existingIndex !== -1 && DBState.db.characters[existingIndex].coldstorage) {
        const target = await restoreArchivedForWrite(PLAYGROUND_CHA_ID)
        if (target.status === 'failed') {
            // restoreArchivedForWrite has already told the user.
            return
        }
        if (target.status === 'gone') {
            const holderIndex = findCharacterIndexbyId(PLAYGROUND_CHA_ID)
            const holder = holderIndex === -1 ? undefined : DBState.db.characters[holderIndex]
            if (holder?.coldstorage) {
                // The placeholder's own unit is intact, so a retry reads it.
                alertNamedRestoreFailure(holder, 'unreadable')
                return
            }
        }
    }
    selectPlaygroundChat()
}

function selectPlaygroundChat() {
    const charIndex = findCharacterIndexbyId(PLAYGROUND_CHA_ID)
    PlaygroundStore.set(2)

    if (charIndex !== -1) {

        const char = DBState.db.characters[charIndex] as character
        char.utilityBot = true
        char.name = 'assistant'
        char.firstMessage = '{{none}}'
        // The Playground character is hidden from the trash tab, so it can
        // never be restored from there; the boot purge would otherwise delete
        // the history of a chat that is in use. The character is marked for
        // save explicitly, so the cleared field is written whether or not the
        // selected-character tracking is running yet when it is removed.
        if (char.trashTime !== undefined) {
            delete char.trashTime
            markCharacterForSave(char.chaId)
        }
        DBState.db.characters[charIndex] = char
        characterFormatUpdate(charIndex, { updateInteraction: true })

        selectedCharID.set(charIndex)
        return
    }

    const character = createBlankChar()
    character.chaId = PLAYGROUND_CHA_ID

    DBState.db.characters.push(character)

    selectPlaygroundChat()

}
