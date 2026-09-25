import localforage from "localforage"
import { tabPresenceLockAcquired } from "../globalApi.svelte"
import { isNodeServer } from "src/ts/platform"
import { NodeStorage } from "./nodeStorage"
import { OpfsStorage } from "./opfsStorage"
import { alertStore } from "../alert"

export class AutoStorage{
    /** Set once, in `Init()`, from a stale RisuAccount-sync profile's leftover `localStorage` flag. Boot (`loadData()` in `bootstrap.ts`) reads this to decide whether to show the stale-profile notice; `Init()` itself never acts on it. */
    staleAccountProfile:boolean = false

    realStorage:LocalForage|NodeStorage|OpfsStorage

    async setItem(key:string, value:Uint8Array):Promise<void> {
        await this.Init()
        await this.realStorage.setItem(key, value)
    }
    async getItem(key:string):Promise<Buffer> {
        await this.Init()
        return await this.realStorage.getItem(key)

    }
    async keys():Promise<string[]>{
        await this.Init()
        return await this.realStorage.keys()

    }
    async removeItem(key:string){
        await this.Init()
        return await this.realStorage.removeItem(key)
    }

    async Init(){
        if(!this.realStorage){
            // Waits for this tab's own shared cross-tab presence lock to actually
            // be granted first — while a storage-backend migration is in progress
            // (holding the same lock exclusively, see globalApi.svelte.ts), a new
            // tab must not start reading/writing any backend at all, since the
            // migration could still be copying data out from under it or the
            // active backend could change out from under it mid-init.
            await tabPresenceLockAcquired
            // A returning RisuAccount-sync profile leaves this flag set. Detection
            // only records it for boot to act on later; it never changes which
            // backend this platform lands on, and never touches the flag itself.
            this.staleAccountProfile = localStorage.getItem('accountst') === 'able'
            if(isNodeServer){
                console.log("using node storage")
                this.realStorage = new NodeStorage()
                return
            }
            else if(window.navigator?.storage?.getDirectory &&
                    FileSystemFileHandle?.prototype?.createWritable &&
                    localStorage.getItem('opfs_flag!') === "able"){
                console.log("using opfs storage")

                const forage = localforage.createInstance({
                    name: "risuai"
                })

                const i = await forage.getItem("database/database.bin")

                if((!i) || (await forage.getItem("migrated"))){
                    this.realStorage = new OpfsStorage()
                    return
                }
                else if(!(await forage.getItem("denied_opfs"))){
                    console.log("migrating")
                    const keys = await forage.keys()
                    let i = 0;
                    const opfs = new OpfsStorage()
                    for(const key of keys){
                        alertStore.set({
                            type: "wait",
                            msg: `Migrating your data...(${i}/${keys.length})`
                        })
                        await opfs.setItem(key,await forage.getItem(key))
                        i += 1
                    }
                    this.realStorage = opfs
                    alertStore.set({
                        type: "none",
                        msg: ""
                    })
                    await forage.setItem("migrated", true)
                    return
                }
            }
            console.log("using forage storage")
            this.realStorage = localforage.createInstance({
                name: "risuai"
            })
        }
    }

    listItem = this.keys
}
