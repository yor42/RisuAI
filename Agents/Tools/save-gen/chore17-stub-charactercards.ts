/**
 * CHORE-17 follow-up harness stub for `src/ts/characterCards.ts`, scoped to
 * `stores.svelte.ts`'s own import of it.
 *
 * `stores.svelte.ts` writes `import type { hubType } from "./characterCards"`
 * -- a type-only import that, like the `parser/parser.svelte` one next to it
 * (see `chore17-stub-parser.ts`), empirically does not erase in this build
 * and otherwise pulls in the real `characterCards.ts` -> `characters.ts` ->
 * `parser/parser.svelte.ts` chain (character-card import/export, hub
 * download, markdown parsing) -- none of it reachable from
 * setDatabase/setDatabaseLite/getDatabase/registerDbChangeEffects. Empty on
 * purpose: nothing here imports a runtime value from this module.
 */
export {}

export function characterURLImport(): void {}
export const hubURL = 'https://example.invalid'

export async function exportCharacterCard(): Promise<never> {
    throw new Error('chore17 harness: exportCharacterCard is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}
export async function importCharacterProcess(): Promise<never> {
    throw new Error('chore17 harness: importCharacterProcess is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}

export async function importCharacter(): Promise<never> {
    throw new Error('chore17 harness: importCharacter is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}
