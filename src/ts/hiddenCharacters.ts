/**
 * chaIds of characters that are real entries in `db.characters` but are never
 * offered to the user as a character: the Playground's utility character and
 * the `§temp` copy that upstream multiuser can leave behind. Hiding is a
 * presentation rule only; neither character is deleted, renamed or migrated.
 */
const HIDDEN_SYSTEM_CHA_IDS: ReadonlySet<string> = new Set(['§playground', '§temp'])

/**
 * True for the characters every character list skips (the sidebar's order,
 * the grid, the mobile list, the group-member picker and the character
 * hotkeys). This module must stay free of imports so any list view can use it
 * without pulling in the rest of the app.
 */
export function isHiddenSystemCharacter(char: { chaId?: string } | null | undefined): boolean {
    return !!char && typeof char.chaId === 'string' && HIDDEN_SYSTEM_CHA_IDS.has(char.chaId)
}
