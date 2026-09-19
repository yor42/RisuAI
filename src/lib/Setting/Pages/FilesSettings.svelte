<script lang="ts">
    import { language } from "src/lang";
    import { alertConfirm, alertError } from "src/ts/alert";
    import { checkDriver } from "src/ts/drive/drive";
    import { isTauri, isNodeServer } from "src/ts/platform"
    import { OpfsStorage } from "src/ts/storage/opfsStorage";
    import { acquireExclusiveStorageMigrationLock } from "src/ts/globalApi.svelte";
    import localforage from "localforage";

    const opfsSupported = !!(
        typeof window !== 'undefined' &&
        window.navigator?.storage?.getDirectory &&
        (window as any).FileSystemFileHandle?.prototype?.createWritable &&
        (navigator as any).locks
    )

    function opfsEnabled(){
        return localStorage.getItem('opfs_flag!') === 'able'
    }

    async function enableOpfs(){
        if(!await alertConfirm('Switch local storage to OPFS (experimental) and reload the app? Your existing local data will be migrated automatically on reload.')){
            return
        }
        // A live second tab writing through the OLD backend during migration
        // could have its write silently lost once the migration switches which
        // backend future boots use. This is real cross-tab mutual exclusion
        // (Web Locks), not a heartbeat/timeout check — see the lock's own doc
        // comment in globalApi.svelte.ts for why a ping-based liveness check
        // isn't sufficient here.
        const releaseMigrationLock = await acquireExclusiveStorageMigrationLock()
        if(!releaseMigrationLock){
            alertError('Another tab of this app appears to be open (or your browser does not support the check needed here). Close all other tabs first, then try again.')
            return
        }
        // acquireExclusiveStorageMigrationLock() already stopped this tab's own
        // writes internally; never releasing the returned function here is
        // intentional — nothing should write database.bin again before the
        // reload below actually happens, same reasoning as loadDrive()'s
        // restore write in src/ts/drive/drive.ts.
        localStorage.setItem('opfs_flag!', 'able')
        location.reload()
    }

    async function disableOpfs(){
        if(!await alertConfirm('Switch local storage back to the default backend and reload the app? Your existing OPFS data will be migrated automatically before reloading.')){
            return
        }
        const releaseMigrationLock = await acquireExclusiveStorageMigrationLock()
        if(!releaseMigrationLock){
            alertError('Another tab of this app appears to be open (or your browser does not support the check needed here). Close all other tabs first, then try again.')
            return
        }
        // This tab's own writes are already stopped (see enableOpfs()'s comment
        // above), so nothing can write a newer version to OPFS after this loop
        // has read an older one.
        try {
            const opfs = new OpfsStorage()
            const target = localforage.createInstance({ name: "risuai" })
            const keys = await opfs.keys()
            for(const key of keys){
                await target.setItem(key, await opfs.getItem(key))
            }
            // Clear the forward-migration bookkeeping too, so re-enabling later
            // migrates this (now current) data again instead of skipping it as
            // already-migrated.
            await target.removeItem('migrated')
            localStorage.removeItem('opfs_flag!')
            location.reload()
        } catch (error) {
            await releaseMigrationLock()
            alertError(error)
        }
    }
</script>

<h2 class="mb-2 text-2xl font-bold mt-2">{language.files}</h2>
<button
    onclick={async () => {
        if(await alertConfirm(language.backupConfirm)){
            localStorage.setItem('backup', 'save')
            if(isTauri || isNodeServer){
                checkDriver('savetauri')
            }
            else{
                checkDriver('save')
            }
        }
    }}
    class="drop-shadow-lg p-3 border-darkborderc border-solid mt-2 flex justify-center items-center ml-2 mr-2 border-1 hover:bg-selected text-sm">
    {language.savebackup}
</button>

<button
    onclick={async () => {
        if((await alertConfirm(language.backupLoadConfirm)) && (await alertConfirm(language.backupLoadConfirm2))){
            localStorage.setItem('backup', 'load')
            if(isTauri || isNodeServer){
                checkDriver('loadtauri')
            }
            else{
                checkDriver('load')
            }
        }
    }}
    class="drop-shadow-lg p-3 border-darkborderc border-solid mt-2 flex justify-center items-center ml-2 mr-2 border-1 hover:bg-selected text-sm">
    {language.loadbackup}
</button>

{#if !isTauri && !isNodeServer && opfsSupported && localStorage.getItem('accountst') !== 'able'}
    <h2 class="mb-2 text-2xl font-bold mt-6">Local Storage Backend</h2>
    <p class="text-sm opacity-70 mb-2">Experimental. OPFS has a stronger write-atomicity story than the default IndexedDB backend. Switching reloads the app and migrates your existing local data automatically.</p>
    {#if opfsEnabled()}
        <button
            onclick={disableOpfs}
            class="drop-shadow-lg p-3 border-darkborderc border-solid mt-2 flex justify-center items-center ml-2 mr-2 border-1 hover:bg-selected text-sm">
            Switch back to default storage
        </button>
    {:else}
        <button
            onclick={enableOpfs}
            class="drop-shadow-lg p-3 border-darkborderc border-solid mt-2 flex justify-center items-center ml-2 mr-2 border-1 hover:bg-selected text-sm">
            Switch to OPFS storage (experimental)
        </button>
    {/if}
{/if}


<!-- <button
    onclick={async () => {
        if((await alertConfirm(language.backupLoadConfirm)) && (await alertConfirm(language.backupLoadConfirm2))){
            localStorage.setItem('backup', 'load')
            checkDriver('reftoken')
        }
    }}
    class="drop-shadow-lg p-3 border-borderc border-solid mt-2 flex justify-center items-center ml-2 mr-2 border-1 hover:bg-selected text-sm">
    Test
</button> -->