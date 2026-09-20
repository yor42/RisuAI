import { writable } from "svelte/store"
import { getDatabase } from "./database.svelte"
import localforage from "localforage"
import { alertLogin, alertNormalWait, alertStore } from "../alert"
import { forageStorage, getUncleanables, getUncleanablesSync } from "../globalApi.svelte"
import { encodeRisuSaveLegacy } from "./risuSave"
import { v4 } from "uuid"
import { language } from "src/lang"
import { sleepForever } from "../util"
import { markAppInitiatedReload } from "../reloadGuard"
import { fetchProtectedResource } from "../sionyw"

export const AccountWarning = writable('')
let risuSession = ''
const cachedForage = localforage.createInstance({name: "risuaiAccountCached"})

let seenWarnings:string[] = []

// Thrown by AccountStorage.getItem when the server reports our locally-cached
// copy is stale (HTTP 303, match:false) without actually returning fresh
// content. This is NOT the same as "no data exists" (that's a genuine 204) —
// conflating the two previously caused callers to treat a stale-cache signal
// as an empty account and silently overwrite real remote data with nothing.
export class AccountSyncCacheMismatchError extends Error {
    constructor(key: string) {
        super(`Account sync: server reports a newer copy of "${key}" exists but did not return it (cache mismatch). This must not be treated as an empty account.`)
        this.name = 'AccountSyncCacheMismatchError'
    }
}

// Thrown by AccountStorage.setItem when the hub rejects a write as a
// revision conflict (409/412) rather than a generic error — distinguishes
// "another writer got here first, don't retry the same stale write" from a
// transient I/O failure. Whether the hub actually sends one of these codes
// today is unverified (its source isn't in this repo); this exists so the
// client behaves correctly the moment it does, instead of retrying a write
// the hub will keep rejecting. See Agents/Reports/06-conflict-resolution-design-feasibility.md.
export class AccountSyncConflictError extends Error {
    constructor(key: string) {
        super(`Account sync: server rejected the write to "${key}" because a newer version already exists on the server (revision conflict).`)
        this.name = 'AccountSyncConflictError'
    }
}

export class AccountStorage{
    auth:string
    usingSync:boolean

    async setItem(key:string, value:Uint8Array) {
        this.checkAuth()
        let da:Response

        let daText:string|undefined = undefined
        const getDaText = async () => {
            if(daText === undefined){
                daText = await da.text()
            }
            return daText
        }


        let saveDate:string

        // Only commits the just-written value into the local cache once the
        // server has actually confirmed it (2xx, or 304 meaning "already
        // matches") — never speculatively ahead of that check. Previously
        // this ran unconditionally right after the fetch resolved, so a
        // rejected write (a 409/412 conflict, or any other non-2xx status)
        // would still have overwritten the local cache with the stale
        // content a later getItem()'s 303/match:true fast path could then
        // serve back as if it had been accepted. See
        // Agents/Reports/06-conflict-resolution-design-feasibility.md,
        // Option 1's account-sync correction.
        const commitCache = async () => {
            if(key === 'database/database.bin'){
                await cachedForage.setItem(key, value)
                await cachedForage.setItem(key + '__date', saveDate)
            }
        }

        while((!da) || da.status === 403){

            saveDate = Date.now().toFixed(0)

            if(risuSession === ''){
                da = await fetchProtectedResource('/api/account/getsessionnumber', {
                    method: "GET"
                })

                const json = await da.json()
                risuSession = `${json.sessionNumber}`
            }

            da = await fetchProtectedResource('/api/account/write', {
                method: "POST",
                body: value as any,
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-risu-key': key,
                    'X-Format': 'nocheck',
                    'x-risu-session': risuSession,
                    'x-risu-save-date': saveDate
                }
            })

            if(da.headers.get('Content-Type') === 'application/json'){
                const json = JSON.parse(await getDaText())
                if(json?.warning){
                    if(!seenWarnings.includes(json.warning)){
                        seenWarnings.push(json.warning)
                        AccountWarning.set(json.warning)
                    }
                }
                if(json?.reloadSession){
                    alertNormalWait(language.activeTabChange).then(() => {
                        markAppInitiatedReload()
                        location.reload()
                    })
                    // Genuinely never-resolving, not `sleep(hugeNumber)` — that
                    // reads as "wait forever" but isn't: setTimeout's delay is
                    // milliseconds, so even 100000000 is only ~27.8 hours, after
                    // which this would silently resume and resend against a
                    // session the server already told us to reload away from.
                    await sleepForever()
                    return
                }
            }

            if(da.status === 304){
                await commitCache()
                return key
            }
            // The hub's actual conflict semantics aren't verifiable from this
            // repo (its source isn't here), but if it ever does send a 409/412
            // revision-conflict status, the client must not blind-retry the
            // same stale write into it forever — surface a typed error
            // instead, same shape as NodeStorageConflictError for the
            // self-hosted server.
            if(da.status === 409 || da.status === 412){
                throw new AccountSyncConflictError(key)
            }
            if(da.status === 403){
                if(da.headers.get('x-risu-status') === 'warn'){
                    return
                }
                localStorage.setItem("fallbackRisuToken",await alertLogin())
                this.checkAuth()
            }
        }
        if(da.status < 200 || da.status >= 300){
            throw await getDaText()
        }
        await commitCache()
        if(key.startsWith('assets/')){
            await localforage.setItem(key, new Uint8Array(value).buffer)
        }
        return await getDaText()
    }
    async getItem(key:string, callback?:(status:number) => void):Promise<Buffer> {
        this.checkAuth()
        if(key.startsWith('assets/')){
            const k:ArrayBuffer = await localforage.getItem(key)
            if(k){
                return Buffer.from(k)
            }
        }
        let da:Response
        const saveDate = await cachedForage.getItem(key + '__date') as number|undefined
        const perf = performance.now()
        while((!da) || da.status === 403){
            da = await fetchProtectedResource('/api/account/read/' + Buffer.from(key ,'utf-8').toString('hex') + 
                (key.includes('database') ? ('|' + v4()) : ''), {
                method: "GET",
                headers: {
                    'x-risu-key': key,
                    'x-risu-save-date': (saveDate || 0).toString()
                }
            })
            if(da.status === 403){
                localStorage.setItem("fallbackRisuToken",await alertLogin())
                this.checkAuth()
            }
        }
        if(da.status === 303){
            const data = await da.json()
            if(data.match){
                const c = Buffer.from(await cachedForage.getItem(key))
                return c
            }
            else{
                throw new AccountSyncCacheMismatchError(key)
            }
        }

        if(da.status < 200 || da.status >= 300){
            throw await da.text()
        }
        if(da.status === 204){
            return null
        }
        if(key.startsWith('assets/')){
            const ab = await da.arrayBuffer()
            await localforage.setItem(key, ab)
            return Buffer.from(ab)
        }
        if(!callback){
            const ab = await da.arrayBuffer()
            return Buffer.from(ab)
        }
        const size = parseInt(da.headers.get('x-body-size'))
        const appendable = new Uint8Array(size)
        const reader = da.body.getReader()

        let i = 0
        while(true){
            const {done, value} = await reader.read()
            if(done){
                break
            }
            appendable.set(value, i)
            i += value.length
            callback(i/size)
        }

        return Buffer.from(appendable)
    }
    keys():string[]{
        let db = getDatabase()
        return getUncleanablesSync(db, 'pure')
    }
    removeItem(key:string){
        throw "Error: You cannot remove data in account. report this to dev if you found this."
    }

    private checkAuth(){
        const db = getDatabase()
        this.auth = db?.account?.token
        if(!this.auth){
            try {
                db.account = JSON.parse(localStorage.getItem("fallbackRisuToken"))
                this.auth = db?.account?.token
                db.account.useSync = true
            } catch (error) {}
        }
    }


    listItem = this.keys
}

export async function unMigrationAccount() {
    const keys = await forageStorage.keys()
    let db = getDatabase()
    let i = 0;
    const MigrationStorage = localforage.createInstance({name: "risuai"})
    
    for(const key of keys){
        alertStore.set({
            type: "wait",
            msg: `Migrating your data...(${i}/${keys.length})`
        })
        await MigrationStorage.setItem(key,await forageStorage.getItem(key))
        i += 1
    }

    db.account = null
    await MigrationStorage.setItem('database/database.bin', encodeRisuSaveLegacy(db))

    alertStore.set({
        type: "none",
        msg: ""
    })

    localStorage.setItem('dosync', 'avoid')
    localStorage.removeItem('accountst')
    localStorage.removeItem('fallbackRisuToken')
    location.reload()
}