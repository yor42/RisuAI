/**
 * CHORE-17 browser harness stub for `src/ts/globalApi.svelte.ts`.
 *
 * risuSave.ts imports only `forageStorage` from this module, and only inside
 * `encodeRemoteBlock()` (the remote-block-saving path). That path is never
 * taken in this harness: `encodeBlock()` only calls `encodeRemoteBlock()`
 * when `option.remote === 'force'`, or `option.remote === 'prefer'` AND
 * (`isTauri` or `isNodeServer`) — both false in a real, non-Tauri browser
 * page (confirmed by reading `src/ts/platform.ts`, which this harness leaves
 * REAL/unstubbed). So `forageStorage` is dead code on every path this
 * harness exercises; each method below throws loudly if that assumption is
 * ever violated, rather than silently mocking real network/storage
 * behaviour.
 *
 * Stubbed (not real) because `globalApi.svelte.ts` is this repo's ~1900-line
 * central hub with ~40 first-party imports (drive/*, plugins/*, gui/*,
 * characters, hotkey, parser, autoStorage -> accountStorage ->
 * nodeStorage/opfsStorage, etc. — see the Node harness's own header comment
 * for the full accounting) — pulling it in for real would require
 * reproducing that entire mock list for no benefit, since `forageStorage` is
 * unreachable here.
 */

// Extended for the CHORE-17 follow-up harness (chore17-followup-entry.svelte.ts),
// which also loads the REAL `src/ts/storage/database.svelte.ts` for its real
// setDatabase/setDatabaseLite/getDatabase. That file imports `downloadFile` and
// `saveAsset` (as `saveImageGlobal`) from globalApi.svelte at module scope but
// never calls either on the setDatabase/setDatabaseLite/getDatabase path this
// harness exercises -- both are dead code here, same convention as `forageStorage`
// above.
function unreachable(name: string): never {
    throw new Error(`chore17 harness: forageStorage.${name} should never be called — isTauri=false and isNodeServer=false, so encodeBlock() never takes the remote branch`)
}

export const forageStorage = {
    async setItem(): Promise<never> { return unreachable('setItem') },
    async getItem(): Promise<never> { return unreachable('getItem') },
    async keys(): Promise<never> { return unreachable('keys') },
    async removeItem(): Promise<never> { return unreachable('removeItem') },
}

export async function downloadFile(): Promise<never> {
    throw new Error('chore17 harness: downloadFile is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}
export async function saveAsset(): Promise<never> {
    throw new Error('chore17 harness: saveAsset is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}

export async function fetchNative(): Promise<never> {
    throw new Error('chore17 harness: fetchNative is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}
export async function globalFetch(): Promise<never> {
    throw new Error('chore17 harness: globalFetch is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}
export async function readImage(): Promise<never> {
    throw new Error('chore17 harness: readImage is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}
export function toGetter(): never {
    throw new Error('chore17 harness: toGetter is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}

export class AppendableBuffer {
    append(): void { throw new Error('chore17 harness: AppendableBuffer is dead code on the setDatabase/setDatabaseLite/getDatabase path') }
}

export let requiresFullEncoderReload = { state: false }

export function aiWatermarkingLawApplies(): boolean { return false }
export async function getFileSrc(): Promise<string> { return '' }
export function isPlainHttpFileSrc(): boolean { return false }

export class LocalWriter {
    write(): void { throw new Error('chore17 harness: LocalWriter is dead code on the setDatabase/setDatabaseLite/getDatabase path') }
}

export class VirtualWriter {
    write(): void { throw new Error('chore17 harness: VirtualWriter is dead code on the setDatabase/setDatabaseLite/getDatabase path') }
}

export function changeChatTo(): void {}
export function checkCharOrder(): void {}

export const dbWriteLock = { acquire: async () => () => {} }
export async function getUncleanables(): Promise<Set<string>> { return new Set() }
export async function loadAsset(): Promise<never> {
    throw new Error('chore17 harness: loadAsset is dead code on the setDatabase/setDatabaseLite/getDatabase path')
}
export function openURL(): void {}
export function replaceDbResources(db: unknown): unknown { return db }

export async function getUncleanablesSync(): Promise<Set<string>> { return new Set() }
export const tabPresenceLockAcquired: Promise<void> = Promise.resolve()
