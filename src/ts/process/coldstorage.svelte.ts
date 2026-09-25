import {
    writeFile,
    BaseDirectory,
    readFile,
    mkdir,
    remove,
    readDir,
    exists
} from "@tauri-apps/plugin-fs"
import { forageStorage, requiresFullEncoderReload } from "../globalApi.svelte"
import { isTauri, isNodeServer } from "src/ts/platform"
import { DBState, selectedCharID, frozenSaveKeysStore } from "../stores.svelte"
import { get } from "svelte/store"
import type { NodeStorage } from "../storage/nodeStorage"
import { compress as fflateCompress, decompress as fflateDecompress } from "fflate"
import { v4 as uuidv4 } from "uuid"
import { fetchProtectedResource } from "../sionyw"
import { alertClear, alertConfirm, alertError, alertWait } from "../alert"
import { language } from "src/lang"
import type { Database, character } from "../storage/database.svelte"
import { coldStorageHeader, getColdStorageAffectedCharacters, getColdStorageBackupName, isColdStorageBackupData, listColdDataKeysFromDb, listRecoverableErrorKeysFromDb, matchColdStorageLoadErrorKey, mergeRetriedColdChatSideFields } from "./coldstorageData"
import { doingChat } from "./index.svelte"

export {
    coldStorageHeader,
    getColdStorageBackupKey,
    getColdStorageBackupName,
    isColdStorageBackupData,
    replaceColdStoragePayloadResources,
    listColdDataKeysFromDb
} from "./coldstorageData"

async function decompress(data:Uint8Array) {
    return new Promise<Uint8Array>((resolve, reject) => {
        fflateDecompress(data, (err, decompressed) => {
            if (err) {
                return reject(err)
            }
            resolve(decompressed)
        })
    })
}

export async function getColdStorageItem(key:string, opts:{
    accountFallback?:boolean
} = {}) {

    if(forageStorage.isAccount && !opts.accountFallback){
        const d = await fetchProtectedResource('/hub/account/coldstorage', {
            method: 'GET',
            headers: {
                'x-risu-key': key,
            }
        })

        if(d.status === 200){
            const buf = await d.arrayBuffer()
            const text = new TextDecoder().decode(await decompress(new Uint8Array(buf)))
            return JSON.parse(text)
        }
        return await getColdStorageItem(key, {
            accountFallback: true
        })
    }
    else if(isNodeServer){
        try {
            const storage = forageStorage.realStorage as NodeStorage
            const f = await storage.getItem('coldstorage/' + key)
            if(!f){
                return null
            }
            const text = new TextDecoder().decode(await decompress(new Uint8Array(f)))
            return JSON.parse(text)
        }
        catch (error) {
            return null
        }
    }
    else if(isTauri){
        try {
            const f = await readFile('./coldstorage/'+key+'.json', {
                baseDir: BaseDirectory.AppData
            })
            const text = new TextDecoder().decode(await decompress(new Uint8Array(f)))
            return JSON.parse(text)
        } catch (error) {
            return null
        }
    }
    else{
        //use opfs
        try {
            const opfs = await navigator.storage.getDirectory()
            const file = await opfs.getFileHandle('coldstorage_' + key+'.json')
            if(!file){
                return null
            }
            const d = await file.getFile()
            if(!d){
                return null
            }
            const buf = await d.arrayBuffer()
            const text = new TextDecoder().decode(await decompress(new Uint8Array(buf)))
            return JSON.parse(text)
        } catch (error) {
            return null
        }
    }
}

/**
 * A three-way outcome for a cold-storage read (CHORE-07 stage 7c-1, plan
 * `Agents/Reports/13-chore07-cold-read-failure-plan.md` §5.2 item 1):
 *   - `'ok'`      -- the bytes were read and decoded. `value` may itself be
 *                    `null` (a plugin can legitimately store `null`) --
 *                    that is still `'ok'`, not `'missing'`.
 *   - `'missing'` -- the backend positively reported "no such item", per the
 *                    backend-specific rules below. Never returned for the
 *                    account branch (see `classifyAccountColdRead`).
 *   - `'error'`   -- anything else: a transient I/O failure, a permission or
 *                    scope error, or a decode (decompress/JSON.parse)
 *                    failure. Every case that isn't clearly "the item was
 *                    never written" falls here on purpose -- the whole point
 *                    of this reader is that callers must not treat an
 *                    ambiguous failure as proof of data loss.
 *
 * This reader does no shape validation of `value` -- it also serves whole
 * character blobs (`{character}`) and arbitrary plugin-stored values, so a
 * shape check does not belong here (see `preLoadChat`, which adds its own
 * shape check on top of this reader's `'ok'` result).
 */
export type ColdStorageReadResult =
    | { status: 'ok', value: any }
    | { status: 'missing' }
    | { status: 'error', error: unknown }

type ColdStorageBytesResult =
    | { status: 'ok', bytes: Uint8Array }
    | { status: 'missing' }
    | { status: 'error', error: unknown }

export async function decodeColdStorageBytes(bytes: Uint8Array): Promise<any> {
    const text = new TextDecoder().decode(await decompress(bytes))
    return JSON.parse(text)
}

/**
 * Pure classification seam for the Tauri backend, with `readFileFn` and
 * `existsFn` injected so this can be unit-tested without mocking
 * `@tauri-apps/plugin-fs` at the module level.
 *
 * `missing` only when `readFileFn` rejects with an error matching
 * `/\(os error 2\)/` **and** a follow-up `existsFn` call resolves `false`
 * (gates M4/R7, plan §5.2 item 1). `exists()` is only ever consulted after a
 * matching read failure, never on a healthy read. An `exists()` throw --
 * e.g. a Tauri fs scope violation -- is `error`, not `missing`: it tells us
 * nothing about whether the file exists. Any other `readFileFn` error
 * (including `os error 3`, and Android's differently formatted errors) is
 * also `error` -- the safe direction, per plan.
 */
export async function classifyTauriColdRead(
    path: string,
    readFileFn: (path: string, opts: { baseDir: number }) => Promise<Uint8Array>,
    existsFn: (path: string, opts: { baseDir: number }) => Promise<boolean>,
): Promise<ColdStorageBytesResult> {
    try {
        const bytes = await readFileFn(path, { baseDir: BaseDirectory.AppData })
        return { status: 'ok', bytes }
    } catch (readError) {
        const message = String((readError as { message?: unknown })?.message ?? readError)
        if (!/\(os error 2\)/.test(message)) {
            return { status: 'error', error: readError }
        }
        try {
            const fileExists = await existsFn(path, { baseDir: BaseDirectory.AppData })
            return fileExists ? { status: 'error', error: readError } : { status: 'missing' }
        } catch (existsError) {
            return { status: 'error', error: existsError }
        }
    }
}

/**
 * Pure classification seam for the OPFS backend, with `getDirectoryFn`
 * injected. `missing` only for a `NotFoundError` thrown while LOCATING OR
 * OPENING THE FILE ITSELF -- i.e. from `getFileHandle(filename)` (called
 * without `{create: true}`, real OPFS's own way of saying "no such file")
 * or `getFile()` -- the name real OPFS's `DOMException` uses, and the name
 * this project's OPFS test mocks use. A `NotFoundError` thrown by
 * `getDirectoryFn()` itself (i.e. `navigator.storage.getDirectory()`) is
 * NOT about this file at all -- it would mean OPFS's root directory
 * couldn't be obtained, which says nothing about whether `filename` exists
 * -- so it (and every other error from either step, including
 * `TypeMismatchError` and `NotReadableError`) is `error`.
 */
export async function classifyOpfsColdRead(
    getDirectoryFn: () => Promise<{
        getFileHandle: (name: string) => Promise<{
            getFile: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>
        }>
    }>,
    filename: string,
): Promise<ColdStorageBytesResult> {
    let opfs: Awaited<ReturnType<typeof getDirectoryFn>>
    try {
        opfs = await getDirectoryFn()
    } catch (error) {
        return { status: 'error', error }
    }

    try {
        const file = await opfs.getFileHandle(filename)
        const f = await file.getFile()
        const buf = await f.arrayBuffer()
        return { status: 'ok', bytes: new Uint8Array(buf) }
    } catch (error) {
        if ((error as { name?: unknown })?.name === 'NotFoundError') {
            return { status: 'missing' }
        }
        return { status: 'error', error }
    }
}

/**
 * Pure classification seam for the Node backend, with `getItemFn` injected.
 * `missing` only when `getItemFn` resolves `null`/`undefined` -- the
 * self-hosted Node server (`NodeStorage.getItem`) answers a missing file
 * with HTTP 200 and an empty body, which it already turns into `null`. Any
 * throw is `error`.
 */
export async function classifyNodeColdRead(
    getItemFn: (key: string) => Promise<Uint8Array | null | undefined>,
    storageKey: string,
): Promise<ColdStorageBytesResult> {
    try {
        const f = await getItemFn(storageKey)
        if (f === null || f === undefined) {
            return { status: 'missing' }
        }
        return { status: 'ok', bytes: new Uint8Array(f) }
    } catch (error) {
        return { status: 'error', error }
    }
}

/**
 * Pure classification seam for the account backend, with `fetchHub` and
 * `readLocal` injected. **Never returns `'missing'`** (plan §5.2 item 1):
 * the hub's 204 meaning is unverified and the hub is upstream-only
 * (`RisuAccount` cannot be modified from this repo), so a hub answer alone
 * can never be allowed to trigger the lost-data notice.
 *
 * On a non-200 status (401, 404, 500, 204, ...) or a network throw, this
 * falls back to `readLocal()`, and a local `'ok'` wins over the hub's
 * failure. A hub `'ok'` (status 200) that fails to decode is `'error'`
 * immediately, with no local fallback attempt -- the hub does have the
 * data, just not readable data. Everything that isn't a local `'ok'`
 * collapses to `'error'`, including a local `'missing'`: this is no more
 * aggressive than today's account branch, which also never trusted a bare
 * "not found" as proof of loss (the `isAccount` rule must never get more
 * aggressive than today).
 */
export async function classifyAccountColdRead(
    fetchHub: () => Promise<{ status: number, arrayBuffer: () => Promise<ArrayBuffer> }>,
    readLocal: () => Promise<ColdStorageReadResult>,
): Promise<ColdStorageReadResult> {
    let hubResponse: { status: number, arrayBuffer: () => Promise<ArrayBuffer> } | null = null
    try {
        hubResponse = await fetchHub()
    } catch (networkError) {
        hubResponse = null
    }

    if (hubResponse && hubResponse.status === 200) {
        try {
            const buf = await hubResponse.arrayBuffer()
            const value = await decodeColdStorageBytes(new Uint8Array(buf))
            return { status: 'ok', value }
        } catch (decodeError) {
            return { status: 'error', error: decodeError }
        }
    }

    const localResult = await readLocal()
    if (localResult.status === 'ok') {
        return localResult
    }
    return {
        status: 'error',
        error: hubResponse
            ? new Error(`Cold storage account read failed with status ${hubResponse.status}`)
            : new Error('Cold storage account read failed: network error')
    }
}

async function readLocalColdStorageBytes(key: string): Promise<ColdStorageBytesResult> {
    if (isNodeServer) {
        const storage = forageStorage.realStorage as NodeStorage
        return await classifyNodeColdRead((k) => storage.getItem(k), 'coldstorage/' + key)
    }
    if (isTauri) {
        return await classifyTauriColdRead('./coldstorage/' + key + '.json', readFile, exists)
    }
    return await classifyOpfsColdRead(() => navigator.storage.getDirectory(), 'coldstorage_' + key + '.json')
}

async function readLocalColdStorageValue(key: string): Promise<ColdStorageReadResult> {
    const bytesResult = await readLocalColdStorageBytes(key)
    if (bytesResult.status !== 'ok') {
        return bytesResult
    }
    try {
        return { status: 'ok', value: await decodeColdStorageBytes(bytesResult.bytes) }
    } catch (decodeError) {
        return { status: 'error', error: decodeError }
    }
}

/**
 * Three-way cold-storage reader (CHORE-07 stage 7c-1, plan §5.2 item 1).
 * Classifies I/O and decoding only -- see `ColdStorageReadResult` above for
 * why there is no shape check here.
 *
 * `getColdStorageItem` above stays byte-identical (gate Q1): its existing
 * callers keep today's behaviour, including the account branch's
 * network-throw rejection that `globalApi.svelte.ts`/`drive.ts` rely on to
 * abort, and the `null`-on-any-failure shape `backuplocal.ts` expects. Only
 * `preLoadChat` and the plugin-storage bridge (`v3.svelte.ts`) moved to this
 * reader instead.
 */
export async function readColdStorageItem(key: string): Promise<ColdStorageReadResult> {
    if (forageStorage.isAccount) {
        return await classifyAccountColdRead(
            () => fetchProtectedResource('/hub/account/coldstorage', {
                method: 'GET',
                headers: {
                    'x-risu-key': key,
                }
            }),
            () => readLocalColdStorageValue(key),
        )
    }
    return await readLocalColdStorageValue(key)
}

async function compressColdStorageValue(value:any):Promise<Uint8Array | null> {
    try {
        const json = JSON.stringify(value)
        return await (new Promise<Uint8Array>((resolve, reject) => {
            fflateCompress(new TextEncoder().encode(json), (err, result) => {
                if (err) {
                    return reject(err)
                }
                resolve(result)
            })
        }))
    } catch (error) {
        console.error('Cold storage compression failed:', error)
        return null
    }
}

export async function setAccountColdStorageItem(key:string, value:any):Promise<boolean> {
    const compressed = await compressColdStorageValue(value)
    if(!compressed){
        return false
    }

    try {
        const res = await fetchProtectedResource('/hub/account/coldstorage', {
            method: 'POST',
            headers: {
                'x-risu-key': key,
                'content-type': 'application/octet-stream'
            },
            body: compressed as any
        })
        if(res.status !== 200){
            console.error('Error setting cold storage item:', await res.text().catch(() => 'unknown'))
            return false
        }
        return true
    } catch (error) {
        console.error('Cold storage account write failed:', error)
        return false
    }
}

export async function setColdStorageItem(key:string, value:any):Promise<boolean> {
    console.log("setting cold storage item", key, value)

    if(forageStorage.isAccount){
        return await setAccountColdStorageItem(key, value)
    }

    const compressed = await compressColdStorageValue(value)
    if(!compressed){
        return false
    }

    if(isNodeServer){
        try {
            const storage = forageStorage.realStorage as NodeStorage
            await storage.setItem('coldstorage/' + key, compressed)
            return true
        } catch (error) {
            console.error('Cold storage node write failed:', error)
            return false
        }
    }

    else if(isTauri){
        try {
            await mkdir('./coldstorage', { recursive: true, baseDir: BaseDirectory.AppData })
            await writeFile('./coldstorage/'+key+'.json', compressed, { baseDir: BaseDirectory.AppData })
            return true
        } catch (error) {
            console.error('Cold storage Tauri write failed:', error)
            return false
        }
    }
    else{
        //use opfs
        try {
            const opfs = await navigator.storage.getDirectory()
            const file = await opfs.getFileHandle('coldstorage_' + key+'.json', { create: true })
            const writable = await file.createWritable()
            await writable.write(compressed as any)
            await writable.close()
            return true
        } catch (error) {
            console.error('Cold storage OPFS write failed:', error)
            return false
        }
    }
}

export async function listColdStorageItems():Promise<{items:string[]}> {
    if(forageStorage.isAccount){
        const d = await fetchProtectedResource('/hub/account/coldstorage', {
            method: 'GET',
            headers: {
                'x-risu-key': '@list-keys',
            }
        })

        if(d.status === 200){
            return await d.json()
        }
        return null
    }

    else if(isNodeServer){
        const fullKeys = await (forageStorage.realStorage as NodeStorage).keys()
        const keys = fullKeys.filter(k => k.startsWith('coldstorage/')).map(k => k.replace('coldstorage/', ''))
        return {
            items: keys
        }
    }

    else if(isTauri){
        const entries = await readDir('./coldstorage', { baseDir: BaseDirectory.AppData })
        const keys = entries.filter(e => e.name.endsWith('.json')).map(e => e.name.slice(0, -5))
        return {
            items: keys
        }
    }
    else{
        const opfs = await navigator.storage.getDirectory()
        const entries = opfs.entries()
        const keys = []
        for await (const [name, handle] of entries) {
            if(name.startsWith('coldstorage_') && name.endsWith('.json')){
                keys.push(name.slice(12, -5))
            }
        }
        return {
            items: keys
        }
    }
}

/**
 * Reads every cold-stored character's own blob and collects both its
 * pointer keys (chats already sent to cold storage) and its error-text
 * keys, so `cleanColdStorage` doesn't wrongly treat those blobs as unused
 * (F1, ledger 26). The stub's own `coldStoragedChats` only captures chats
 * whose `message[0]` still started with `coldStorageHeader` at the moment
 * the character itself went cold (the `coldStoragedChats` scan in
 * `makeColdDataForCharacter`), so it misses both a chat later corrupted
 * into the error text and any stub written before `coldStoragedChats`
 * existed -- reading the full blob's `chats` directly avoids relying on
 * that stale snapshot.
 *
 * If any such read is unusable -- throws, is falsy, or fails the chaId
 * check -- that failure is counted and (when the character has an
 * identifiable name or chaId) its display name is recorded, and scanning
 * continues (rather than stopping at the first failure), so the caller can
 * report every affected character, not just the first. A character with
 * neither is left out of `failedNames` rather than filled in with an
 * untranslated placeholder here -- `cleanColdStorage`'s lang string
 * already has its own localized "unknown character(s)" fallback for an
 * empty `failedNames`, mirroring how `getColdStorageAffectedCharacters`
 * (`coldstorageData.ts`) names unknowns. Once the loop is done, if any
 * failures were counted, returns `{ status: 'aborted', failedNames }` so
 * the caller aborts the entire cleanup rather than delete anything based
 * on an incomplete view (the same "incomplete view means don't delete"
 * rule as the boot-time asset sweep).
 *
 * Discriminated on a string literal (`status`), not a boolean, because
 * this project's `tsconfig.json` has `strict: false` (so
 * `strictNullChecks` is off), under which TypeScript does not narrow a
 * boolean-literal-discriminated union on `if (!x.ok)` -- confirmed with a
 * throwaway repro against this exact tsconfig before choosing this shape.
 */
async function collectColdCharacterKeysOrAbort(
    db: Pick<Database, 'characters'> | null | undefined
): Promise<{ status: 'ok', keys: Set<string> } | { status: 'aborted', failedNames: string[] }> {
    const keys = new Set<string>()
    const failedNames: string[] = []
    let failureCount = 0
    for (const cha of db?.characters ?? []) {
        if (!cha?.coldstorage) {
            continue
        }
        // Guarded with `typeof` rather than `cha.name?.trim()` directly so a
        // non-string `name` can't throw here, outside the try/catch below.
        const displayName = (typeof cha.name === 'string' ? cha.name.trim() : '') || cha.chaId
        try {
            const coldData = await getColdStorageItem(cha.coldstorage)
            if (!coldData?.character || coldData.character.chaId !== cha.chaId) {
                failureCount++
                if (displayName) {
                    failedNames.push(displayName)
                }
                continue
            }
            for (const chat of coldData.character.chats ?? []) {
                const data = chat.message?.[0]?.data
                if (typeof data === 'string' && data.startsWith(coldStorageHeader)) {
                    keys.add(data.slice(coldStorageHeader.length))
                    continue
                }
                const errorKey = matchColdStorageLoadErrorKey(data)
                if (errorKey) {
                    keys.add(errorKey)
                }
            }
        } catch (error) {
            failureCount++
            if (displayName) {
                failedNames.push(displayName)
            }
        }
    }
    if (failureCount > 0) {
        return { status: 'aborted', failedNames }
    }
    return { status: 'ok', keys }
}

/** One group per duplicated chaId, each a list of the display names sharing that id, formatted for `language.errors.coldStorageBlockedByDuplicateChaId`. */
function frozenSaveKeyGroups(): string {
    return get(frozenSaveKeysStore).map((k) => k.names.join(' and ')).join('; ')
}

export async function cleanColdStorage(){
    // A kept block can reference a cold-storage key that memory does not:
    // the frozen character's own current, unsaved edits can drop a
    // reference that the saved block on disk still points at. Refusing
    // outright while any chaId is frozen is what keeps this cleanup from
    // deleting something that block still needs.
    if(get(frozenSaveKeysStore).length > 0){
        alertError(language.errors.coldStorageBlockedByDuplicateChaId(frozenSaveKeyGroups()))
        return
    }

    const db = DBState.db

    const coldCharacterCount = (db?.characters ?? []).filter(cha => cha?.coldstorage).length
    try {
        if(coldCharacterCount > 0){
            alertWait(`Verifying ${coldCharacterCount} cold-stored character(s)...`)
        }
        const coldCharacterKeys = await collectColdCharacterKeysOrAbort(db)
        if(coldCharacterKeys.status === 'aborted'){
            alertClear()
            const names = coldCharacterKeys.failedNames.join(', ')
            console.error(`Cold storage cleanup aborted: could not verify cold-stored character(s): ${names}`)
            alertError(language.errors.coldStorageCleanupAborted(names))
            return
        }

        const actualUsedKeys = new Set<string>([
            ...listColdDataKeysFromDb(db),
            ...listRecoverableErrorKeysFromDb(db),
            ...coldCharacterKeys.keys,
        ])
        const allKeys = (await listColdStorageItems()).items
        const unusedKeys = allKeys.filter(k => !actualUsedKeys.has(k))
        console.log('Cleaning cold storage, actual used keys:', Array.from(actualUsedKeys), 'all keys:', allKeys, 'unused keys:', unusedKeys)

        // Re-checked here, immediately before anything is removed, not only
        // at entry: a chaId can become frozen while the verification and the
        // listing above were in flight, and nothing must be removed once
        // that has happened either.
        if(get(frozenSaveKeysStore).length > 0){
            alertClear()
            alertError(language.errors.coldStorageBlockedByDuplicateChaId(frozenSaveKeyGroups()))
            return
        }

        if(forageStorage.isAccount || isNodeServer){
            await removeColdStorageItems(unusedKeys)
        }
        else{
            for(let i=0;i<unusedKeys.length;i++){
                const key = unusedKeys[i]
                alertWait(`Removing unused cold storage item: ${key} (${i + 1} / ${unusedKeys.length})`)
                await removeColdStorageItems([key])
            }
        }

        alertClear()
    } catch (error) {
        // Anything past this point that throws -- listColdStorageItems()
        // returning null in account mode (so its `.items` access throws a
        // TypeError), a rejected Node `keys()`, or anything else -- must
        // not leave the "Verifying..."/"Removing..." wait indicator on
        // screen, and must not attempt any further deletion.
        alertClear()
        console.error('Cold storage cleanup failed:', error)
        alertError(language.errors.coldStorageCleanupFailed)
    }
}

async function removeColdStorageItems(keys:string[]) {
    
    if(forageStorage.isAccount){
        try {
            const res = await fetchProtectedResource('/hub/account/coldstorage', {
                method: 'POST',
                headers: {
                    'x-risu-key': 'remove',
                    'x-action': 'remove'
                },
                body: JSON.stringify({ keys })
            })
            if(res.status !== 200){
                console.error('Error removing cold storage item:', await res.text().catch(() => 'unknown'))
            }
        } catch (error) {
            console.error('Cold storage account remove failed:', error)
        }
    }
    else if(isNodeServer){
        try {
            const storage = forageStorage.realStorage as NodeStorage
            const deleteKeys = keys.map(k => 'coldstorage/' + k);
            await (storage as NodeStorage).removeItem(deleteKeys)
        } catch (error) {
            console.error(error)
        }
    }
    else if(isTauri){
        try {
            for(let i=0;i<keys.length;i++){
                await remove('./coldstorage/'+keys[i]+'.json', { baseDir: BaseDirectory.AppData })
            }
        } catch (error) {
            console.error(error)
        }
    }
    else{
        //use opfs
        try {
            const opfs = await navigator.storage.getDirectory()
            for(let i=0;i<keys.length;i++){
                await opfs.removeEntry('coldstorage_' + keys[i]+'.json')
            }
        } catch (error) {
            console.error(error)
        }
    }
}

export async function listColdDataKeys(db: Pick<Database, 'characters'|'pluginCustomStorage'> = DBState.db): Promise<string[]> {
    return listColdDataKeysFromDb(db)
}

export type ColdStorageBackupPayload = {
    key: string
    backupName: string
    value: unknown
    encoded: Uint8Array
}

export async function collectColdStorageBackupPayloads(db: Pick<Database, 'characters'|'pluginCustomStorage'> = DBState.db): Promise<{
    payloads: ColdStorageBackupPayload[]
    missingKeys: string[]
    invalidKeys: string[]
}> {
    const coldKeys = await listColdDataKeys(db)
    const payloads: ColdStorageBackupPayload[] = []
    const missingKeys: string[] = []
    const invalidKeys: string[] = []

    for (const key of coldKeys) {
        try {
            const value = await getColdStorageItem(key)
            if (!value) {
                missingKeys.push(key)
                continue
            }

            if (!isColdStorageBackupData(value)) {
                invalidKeys.push(key)
                continue
            }

            payloads.push({
                key,
                backupName: getColdStorageBackupName(key),
                value,
                encoded: new TextEncoder().encode(JSON.stringify(value))
            })
        } catch (error) {
            console.error(`Failed to read cold storage item ${key}:`, error)
            missingKeys.push(key)
        }
    }

    return { payloads, missingKeys, invalidKeys }
}

export async function confirmIncompleteColdStorageOperation(
    db: Pick<Database, 'characters'>,
    unavailableKeys: Iterable<string>,
    operation: 'backup' | 'restore',
): Promise<boolean> {
    const uniqueUnavailableKeys = Array.from(new Set(unavailableKeys))
    if (uniqueUnavailableKeys.length === 0) {
        return true
    }

    const affected = getColdStorageAffectedCharacters(db, uniqueUnavailableKeys)
    const characterNames = affected.characterNames.join(', ')
    const message = operation === 'backup'
        ? language.errors.coldStorageIncompleteBackupConfirm(
            characterNames,
            uniqueUnavailableKeys.length,
            affected.unresolvedKeys.length,
        )
        : language.errors.coldStorageIncompleteRestoreConfirm(
            characterNames,
            uniqueUnavailableKeys.length,
            affected.unresolvedKeys.length,
        )

    return await alertConfirm(message)
}

async function makeColdDataForCharacter(i:number, coldTime:number): Promise<boolean>{
    const lastInteraction = DBState.db.characters[i].lastInteraction ?? Date.now()
    if(lastInteraction < coldTime && !DBState.db.characters[i].coldstorage){
        console.log(`Character ${DBState.db.characters[i].name ?? i} has not been interacted with since ${new Date(lastInteraction).toLocaleDateString()}, moving to cold storage`)
        const id = crypto.randomUUID()
        const writeSuccess = await setColdStorageItem(id, {
            character: DBState.db.characters[i]
        })

        if(!writeSuccess){
            console.error(`Cold storage write failed for character ${i}, keeping original data`)
            return false
        }

        const verifyData = await getColdStorageItem(id)
        if(!verifyData || (!Array.isArray(verifyData) && !verifyData.character)){
            console.error(`Cold storage verification failed for character ${DBState.db.characters[i].chaId ?? i}, keeping original data`, verifyData)
            return false
        }

        //get cold storaged chats in this character
        const coldStoragedChats:string[] = []
        for(let j=0;j<DBState.db.characters[i].chats.length;j++){
            const chat = DBState.db.characters[i].chats[j]
            if(chat.message?.[0]?.data?.startsWith(coldStorageHeader)){
                const coldDataKey = chat.message[0].data.slice(coldStorageHeader.length)
                coldStoragedChats.push(coldDataKey)
            }
        }

        // Not a full character object,
        // just the data needed to show in the character list and load the chat when clicked. The rest will be loaded back when the character is opened.
        const coldCharacter:character = {
            type: 'character',
            image: DBState.db.characters[i].image,
            name: DBState.db.characters[i].name,
            chats: [{
                id: uuidv4(),
                message: [{
                    time: Date.now(),
                    data: '',
                    role: 'char'
                }],
                note: "",
                name: "",
                localLore: []
            }],
            chatPage: 0,
            chaId: DBState.db.characters[i].chaId,
            firstMsgIndex: 0,
            coldstorage: id,
            coldStoragedChats: coldStoragedChats
        } as any

        DBState.db.characters[i] = coldCharacter
        return true
    }

    return false
}

export async function makeColdDataForChat(i:number, j:number, coldTime:number): Promise<boolean>{

    const chat = DBState.db.characters[i].chats[j]
    let greatestTime = chat.lastDate ?? 0

    if(chat.message.length < 4){
        //it is inefficient to store small data
        return false
    }

    if(chat.message?.[0]?.data?.startsWith(coldStorageHeader)){
        //already cold storage
        return false
    }

    if(matchColdStorageLoadErrorKey(chat.message?.[0]?.data)){
        // This chat's message[0] is the pre-7b "could not be loaded" error
        // text, not ordinary content -- it is still the key
        // `retryLegacyColdChatLoad` needs and `listRecoverableErrorKeysFromDb`
        // keeps track of. Making it cold again would bury the original key
        // inside a brand-new blob, unreachable by either (F4, CHORE-07 stage
        // 7c-2, plan §5.3 "scope" item 1). Once Retry succeeds, message[0]
        // is ordinary text again and this chat can be made cold normally.
        return false
    }

    if(DBState.db.characters[i].coldstorage){
        //character is in cold storage, no need to cold storage individual chats
        return false
    }


    for(let k=0;k<chat.message.length;k++){
        const message = chat.message[k]
        const time = message.time
        if(!time){
            continue
        }

        if(time > greatestTime){
            greatestTime = time
        }
    }

    if(greatestTime < coldTime){
        const id = crypto.randomUUID()
        const writeSuccess = await setColdStorageItem(id, {
            message: chat.message,
            hypaV2Data: chat.hypaV2Data,
            hypaV3Data: chat.hypaV3Data,
            scriptstate: chat.scriptstate,
            localLore: chat.localLore
        })

        if(!writeSuccess){
            console.error(`Cold storage write failed for chat ${chat.id ?? j} in character ${i}, keeping original data`)
            alertError(language.errors.coldStorageWriteFailed)
            return false
        }

        // Verify the data can be read back before replacing
        const verifyData = await getColdStorageItem(id)
        if(!verifyData || (!Array.isArray(verifyData) && !verifyData.message)){
            console.error(`Cold storage verification failed for chat ${chat.id ?? j}, keeping original data`)
            alertError(language.errors.coldStorageVerifyFailed)
            return false
        }

        chat.message = [{
            time: Date.now(),
            data: coldStorageHeader + id,
            role: 'char'
        }]
        chat.hypaV2Data = {
            chunks:[],
            mainChunks: [],
            lastMainChunkID: 0,
        }
        chat.hypaV3Data = {
            summaries:[]
        }
        chat.scriptstate = {}
        chat.localLore = []
        
        return true
    }

    return false
}

async function migratePluginStorageKeyToColdStorage(key:string): Promise<boolean>{
    const value = DBState.db.pluginCustomStorage?.[key]
    if(value === undefined){
        return false
    }

    const id = crypto.randomUUID()
    const writeSuccess = await setColdStorageItem(id, value)

    if(!writeSuccess){
        console.error(`Cold storage write failed for plugin storage key ${key}, keeping original data`)
        return false
    }

    const verifyData = await getColdStorageItem(id)
    if(verifyData === null || verifyData === undefined){
        console.error(`Cold storage verification failed for plugin storage key ${key}, keeping original data`)
        return false
    }

    DBState.db.pluginCustomStorage._coldplugin ??= {}
    DBState.db.pluginCustomStorage._coldplugin[key] = id
    delete DBState.db.pluginCustomStorage[key]
    return true
}

async function migratePluginStorageToColdStorage(): Promise<boolean>{
    if(!DBState.db.pluginCustomStorage){
        return false
    }

    //legacy keys stored inline before pluginStorage became coldstorage-backed
    const legacyKeys = Object.keys(DBState.db.pluginCustomStorage).filter(key => key !== '_coldplugin')
    let didChange = false

    for(let i=0;i<legacyKeys.length;i++){
        alertWait(`Migrating plugin storage to cold storage... ${legacyKeys.length - i} items left`)
        const changed = await migratePluginStorageKeyToColdStorage(legacyKeys[i])
        if(changed){
            didChange = true
        }
    }

    return didChange
}

export async function makeColdData(){

    if(!DBState.db.coldstorage){
        return
    }

    const currentTime = Date.now()
    const coldTime = currentTime - 1000 * 60 * 60 * 24 * 10 //10 days before now
    const queue:(() => Promise<boolean>)[] = []
    let didChange = false

    if(await migratePluginStorageToColdStorage()){
        didChange = true
    }

    for(let i=0;i<DBState.db.characters.length;i++){
        queue.push(() => makeColdDataForCharacter(i, coldTime))
    }

    while(queue.length > 0){
        const batch = queue.splice(0, 5) //process 5 at a time to avoid blocking
        alertWait(`Creating character cold storage data... ${queue.length} items left`)
        const results = await Promise.all(batch.map(fn => fn()))

        if(results.some(Boolean)){
            didChange = true
        }
    }

    for(let i=0;i<DBState.db.characters.length;i++){
        for(let j=0;j<DBState.db.characters[i].chats.length;j++){
            queue.push(() => makeColdDataForChat(i, j, coldTime))
        }
    }

    while(queue.length > 0){
        const batch = queue.splice(0, 5) //process 5 at a time to avoid blocking
        alertWait(`Creating chat cold storage data... ${queue.length} items left`)
        const results = await Promise.all(batch.map(fn => fn()))

        if(results.some(Boolean)){
            didChange = true
        }
    }

    if(didChange){
        requiresFullEncoderReload.state = true
    }
    
    alertClear()
}

/**
 * `preLoadChat`'s outcome:
 *   - `'none'`    -- the chat wasn't found, or its first message isn't a
 *                    live cold-storage pointer (nothing to do). Also used
 *                    when the pointer was replaced by something else while
 *                    the read was in flight (see the R4 case below), or
 *                    when the user switched to a different character while
 *                    the read was in flight (CHORE-07 stage 7c-1, plan §5.2
 *                    item 4) -- in either case, by the time the read
 *                    finishes, restoring into this chat would be wrong.
 *   - `'ok'`      -- the read succeeded and the chat's messages/side fields
 *                    were restored.
 *   - `'missing'` -- the reader positively confirmed the data doesn't exist
 *                    (CHORE-07 stage 7c-1). Never mutates the chat, exactly
 *                    like `'error'` -- the pointer is left in place, since a
 *                    `.bin` restore from another device might still hold
 *                    the blob.
 *   - `'error'`   -- the read failed ambiguously, or returned data in a
 *                    shape we don't recognize (CHORE-07 stage 7b: unlike
 *                    the pre-7b behaviour, this never mutates `chat.message`
 *                    and never rejects the returned promise -- the pointer
 *                    is left in place so the read can simply be retried by
 *                    reopening the chat).
 */
export type PreLoadChatResult = 'none' | 'ok' | 'missing' | 'error'

export async function preLoadChat(characterIndex:number, chatIndex:number): Promise<PreLoadChatResult> {
    const chat = DBState.db?.characters?.[characterIndex]?.chats?.[chatIndex]

    if(!chat){
        return 'none'
    }

    // Capture the pointer string and this character's chaId up front -- the
    // chat proxy may be mutated (or entirely replaced), and the user may
    // switch to a different character altogether, while we `await` below.
    const pointer = chat.message?.[0]?.data
    if(typeof pointer !== 'string' || !pointer.startsWith(coldStorageHeader)){
        return 'none'
    }
    const coldDataKey = pointer.slice(coldStorageHeader.length)
    const chaId = DBState.db?.characters?.[characterIndex]?.chaId

    const result = await readColdStorageItem(coldDataKey)

    if(result.status === 'missing'){
        // Positively confirmed missing. Leave the pointer in place (no
        // mutation), the same as 'error', so the caller can show the firm
        // "could not be found" notice without risking a false positive from
        // a merely transient failure.
        console.error(`Cold storage data missing for key: ${coldDataKey}`)
        return 'missing'
    }

    if(result.status === 'error'){
        console.error(`Cold storage read failed for key: ${coldDataKey}`, result.error)
        return 'error'
    }

    const coldData = result.value

    const isLegacyArray = Array.isArray(coldData)
    const isObjectBlob = !!coldData
        && typeof coldData === 'object'
        && Array.isArray((coldData as {message?:unknown}).message)

    if(!isLegacyArray && !isObjectBlob){
        // The read succeeded, but the data isn't in a shape this function
        // recognizes. Leave the pointer in place (no mutation) so a later
        // retry -- e.g. reopening the chat -- can still recover it.
        console.error(`Cold storage data invalid for key: ${coldDataKey}`)
        return 'error'
    }

    // The chat may have moved on entirely while we were awaiting the read
    // (the user switched chats, or something else replaced message[0]) --
    // only apply the restored data if it is still the same live pointer.
    if(chat.message?.[0]?.data !== pointer){
        return 'none'
    }

    // The user may also have switched to a DIFFERENT CHARACTER entirely
    // while we were awaiting the read. A restore that lands on a
    // non-selected character is never tracked for saving, so a later
    // cleanup could delete this blob while the saved database still holds
    // the pointer (CHORE-07 stage 7c-1, plan §5.2 item 4, gate finding 2).
    // Compared by chaId, not by index alone, since the character array can
    // reorder between the capture above and this point.
    const selectedIndex = get(selectedCharID)
    if(DBState.db?.characters?.[selectedIndex]?.chaId !== chaId){
        return 'none'
    }

    // Keep anything appended to the chat while the read was in flight.
    const tail = chat.message.slice(1)

    if(isLegacyArray){
        chat.message = [...(coldData as typeof chat.message), ...tail]
    }
    else{
        const blob = coldData as {
            message: typeof chat.message
            hypaV2Data?: typeof chat.hypaV2Data
            hypaV3Data?: typeof chat.hypaV3Data
            scriptstate?: typeof chat.scriptstate
            localLore?: typeof chat.localLore
        }
        chat.message = [...blob.message, ...tail]
        chat.hypaV2Data = blob.hypaV2Data
        chat.hypaV3Data = blob.hypaV3Data
        chat.scriptstate = blob.scriptstate
        chat.localLore = blob.localLore
    }
    chat.lastDate = Date.now()

    return 'ok'
}

/**
 * `retryLegacyColdChatLoad`'s outcome, mirroring `PreLoadChatResult` but for
 * a chat whose `message[0]` already holds the pre-7b "could not be loaded"
 * error text (`matchColdStorageLoadErrorKey`), rather than a live
 * `coldStorageHeader` pointer (CHORE-07 stage 7c-2, plan §5.3 item 2):
 *   - `'none'`    -- the chat's first message isn't (or is no longer) that
 *                    exact error text, the selected character changed while
 *                    the read was in flight, or the chat identity/order at
 *                    `chatIndex` changed underneath it (a plugin replaced
 *                    the character, or its chats were reordered). Nothing to
 *                    retry, or unsafe to apply the result.
 *   - `'busy'`    -- `doingChat` or the chat's own `isStreaming` was set,
 *                    either before the read started or by the time it
 *                    finished. Retry again once sending settles.
 *   - `'ok'`      -- the read succeeded and the chat's messages/side fields
 *                    were restored -- the same restore `preLoadChat` would
 *                    have done before this chat was corrupted into error
 *                    text.
 *   - `'missing'` -- the reader positively confirmed the data doesn't exist.
 *   - `'error'`   -- the read failed ambiguously, or returned data in a
 *                    shape this function doesn't recognize.
 * `'none'`, `'busy'`, `'missing'` and `'error'` never mutate the chat, so
 * Retry can simply be pressed again later.
 */
export type RetryLegacyColdChatLoadResult = 'none' | 'busy' | 'ok' | 'missing' | 'error'

export async function retryLegacyColdChatLoad(characterIndex:number, chatIndex:number): Promise<RetryLegacyColdChatLoadResult> {
    const chat = DBState.db?.characters?.[characterIndex]?.chats?.[chatIndex]

    if(!chat){
        return 'none'
    }

    // Capture the exact error text and this character's chaId up front --
    // the chat proxy may be mutated or replaced, and the user may switch
    // characters, while we `await` below (mirrors preLoadChat's own
    // up-front capture).
    const errorText = chat.message?.[0]?.data
    const coldDataKey = matchColdStorageLoadErrorKey(errorText)
    if(!coldDataKey){
        return 'none'
    }
    const chaId = DBState.db?.characters?.[characterIndex]?.chaId

    if(get(doingChat) || chat.isStreaming){
        return 'busy'
    }

    const result = await readColdStorageItem(coldDataKey)

    // A send may have started while the read was in flight -- re-check
    // busy status after the await too.
    if(get(doingChat) || chat.isStreaming){
        return 'busy'
    }

    // The user may have switched to a DIFFERENT CHARACTER entirely while we
    // were awaiting the read. Compared by chaId, not index alone, since the
    // character array can reorder in between (mirrors preLoadChat's race
    // check, CHORE-07 stage 7c-1, plan §5.2 item 4).
    const selectedIndex = get(selectedCharID)
    if(DBState.db?.characters?.[selectedIndex]?.chaId !== chaId){
        return 'none'
    }

    // Require the exact same chat object still sitting at chatIndex -- a
    // plugin could have replaced the character or reordered its chats
    // underneath us while we awaited the read (gate finding 4a/4b).
    if(DBState.db?.characters?.[selectedIndex]?.chats?.[chatIndex] !== chat){
        return 'none'
    }

    // A double retry (or any other write) may already have changed
    // message[0] -- only apply this result if it's still the same error
    // text this call started with.
    if(chat.message?.[0]?.data !== errorText){
        return 'none'
    }

    if(result.status === 'missing'){
        console.error(`Cold storage retry: data missing for key: ${coldDataKey}`)
        return 'missing'
    }

    if(result.status === 'error'){
        console.error(`Cold storage retry: read failed for key: ${coldDataKey}`, result.error)
        return 'error'
    }

    const coldData = result.value

    const isLegacyArray = Array.isArray(coldData)
    const isObjectBlob = !!coldData
        && typeof coldData === 'object'
        && Array.isArray((coldData as {message?:unknown}).message)

    if(!isLegacyArray && !isObjectBlob){
        console.error(`Cold storage retry: data invalid for key: ${coldDataKey}`)
        return 'error'
    }

    // Computed only now, from the same identity-checked chat object, after
    // the await (gate finding 4a/4b) -- drops the error-text message[0] and
    // keeps every message sent after it, by identity.
    const droppedErrorMessage = chat.message[0]
    const tail = chat.message.slice(1)

    if(isLegacyArray){
        // A legacy array blob never carried side fields in the first place
        // -- leave every live side field untouched (CHORE-07 stage 7c-2,
        // plan §5.3 item 2).
        chat.message = [...(coldData as typeof chat.message), ...tail]
    }
    else{
        const blob = coldData as {
            message: typeof chat.message
            hypaV2Data?: typeof chat.hypaV2Data
            hypaV3Data?: typeof chat.hypaV3Data
            scriptstate?: typeof chat.scriptstate
            localLore?: typeof chat.localLore
        }

        // Computed BEFORE any assignment to `chat` -- the shape check above
        // only confirms `blob.message` is an array; a side field can still
        // be malformed (e.g. a truthy, non-iterable `localLore` or
        // `hypaV3Data.summaries`), which throws inside the merge. Catching
        // it here, before `chat.message` (or anything else) is touched,
        // keeps the mutate-nothing contract for a bad blob (post-gate
        // finding 1).
        let merged: ReturnType<typeof mergeRetriedColdChatSideFields>
        try {
            merged = mergeRetriedColdChatSideFields(
                {
                    hypaV2Data: chat.hypaV2Data,
                    hypaV3Data: chat.hypaV3Data,
                    scriptstate: chat.scriptstate,
                    localLore: chat.localLore,
                },
                {
                    hypaV2Data: blob.hypaV2Data,
                    hypaV3Data: blob.hypaV3Data,
                    scriptstate: blob.scriptstate,
                    localLore: blob.localLore,
                },
                droppedErrorMessage?.chatId,
            )
        } catch (mergeError) {
            console.error(`Cold storage retry: side-field merge failed for key: ${coldDataKey}`, mergeError)
            return 'error'
        }

        chat.message = [...blob.message, ...tail]
        chat.hypaV2Data = merged.hypaV2Data
        chat.hypaV3Data = merged.hypaV3Data
        chat.scriptstate = merged.scriptstate
        chat.localLore = merged.localLore
    }
    chat.lastDate = Date.now()

    return 'ok'
}
