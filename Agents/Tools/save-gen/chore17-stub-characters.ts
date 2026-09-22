/**
 * CHORE-17 follow-up harness stub for `src/ts/characters.ts`.
 *
 * Reached only through the import-type-erasure gap described in
 * `chore17-followup-vite-build.config.ts`'s header (e.g. `util.ts`'s real
 * `import { createBlankChar, getCharImage } from "./characters"` before
 * `util.ts` itself is stubbed away, or `characterCards.ts`'s real import of
 * it) -- never through `setDatabase`/`setDatabaseLite`/`getDatabase`/
 * `registerDbChangeEffects` directly. The real `characters.ts` itself
 * reaches `parser/parser.svelte.ts`, `translator/translator.ts`,
 * `process/inlayScreen.ts`, `process/coldstorage.svelte.ts`,
 * `media/avatarThumb.ts`, and `characterCards.ts` -- a wide character-CRUD/
 * import-export subsystem this harness's fixture (a plain array assignment)
 * never touches. Empty on purpose: nothing this harness keeps real imports
 * a runtime value from this module (only through the already-cut-off `util`/
 * `characterCards` chains).
 */
export {}

export function createBlankChar(): Record<string, unknown> { return {} }
export function getCharImage(): string { return '' }

export function updateLorebooks(v: unknown): unknown { return v }

export class CharacterHandler {
    static instance: CharacterHandler
}
