/**
 * CHORE-17 follow-up harness stub for `src/ts/util.ts`.
 *
 * `util.ts` itself is a 1300+ line module that imports a real Svelte
 * component (`PopupList.svelte`), Tauri plugins, and `src/ts/characters.ts`
 * (itself another wide subsystem) -- none of which the follow-up
 * measurement (the real `setDatabase`/`setDatabaseLite`/`getDatabase` and
 * the real `registerDbChangeEffects` reactive graph) exercises. Only five
 * names from it are actually reached by the modules this harness keeps
 * real (`database.svelte.ts`, `alert.ts`, `translator/presets.ts`):
 * `checkNullish`, `sleep`, `decryptBuffer`, `encryptBuffer`,
 * `selectSingleFile`.
 *
 * `checkNullish` is reimplemented FAITHFULLY (not a no-op) because
 * `setDatabase()`'s own body calls it ~150 times as `??=`-style default
 * fills -- those calls are real, measured work in this harness, so this
 * stub must preserve their exact semantics (verified by reading the real
 * `util.ts` implementation before writing this).
 */
export function checkNullish(data: any): boolean {
    return data === undefined || data === null
}

export async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Passthrough, not real crypto -- unreached on this harness's synthetic fixture (no encrypted fields), kept structurally plausible rather than throwing in case a default-fill path calls it defensively. */
export async function decryptBuffer(buf: Uint8Array): Promise<Uint8Array> {
    return buf
}
export async function encryptBuffer(buf: Uint8Array): Promise<Uint8Array> {
    return buf
}

export async function selectSingleFile(): Promise<never> {
    throw new Error('chore17 harness: selectSingleFile is a UI file-picker, unreachable on the setDatabase/setDatabaseLite/getDatabase path this harness measures')
}

export function findCharacterbyId(): undefined { return undefined }
export function findCharacterIndexbyId(): number { return -1 }
export function getUserName(): string { return 'chore17-harness-user' }
export async function selectMultipleFile(): Promise<never> {
    throw new Error('chore17 harness: selectMultipleFile is a UI file-picker, unreachable on the setDatabase/setDatabaseLite/getDatabase path this harness measures')
}

export function changeFullscreen(): void {}
export async function sleepForever(): Promise<never> {
    return new Promise(() => {})
}

export function BufferToText(buf: unknown): string { return '' }
export function asBuffer(v: unknown): Uint8Array { return new Uint8Array() }

export function getNodetextToSentence(): string { return '' }
export function getPersonaPrompt(): string { return '' }

export function getUserIcon(): string { return '' }
export function pickHashRand(): number { return 0 }

export function getAuthorNoteDefaultText(): string { return '' }
export function isLastCharPunctuation(): boolean { return false }
export function parseToggleSyntax(s: string): string { return s }
export async function replaceAsync(s: string): Promise<string> { return s }
export function trimUntilPunctuation(s: string): string { return s }

export function prebuiltAssetCommand(): unknown[] { return [] }

export function appendLastPath(p: string): string { return p }
export function checkPersonaBinded(): boolean { return false }

export function getKeypairStore(): unknown { return {} }
export function saveKeypairStore(): void {}
export function parseKeyValue(s: string): [string, string] { return [s, ''] }

export function base64url(): string { return '' }

export class Semaphore {
    constructor(_n?: number) {}
    async acquire(): Promise<() => void> { return () => {} }
}
export function blobToUint8Array(): Uint8Array { return new Uint8Array() }
