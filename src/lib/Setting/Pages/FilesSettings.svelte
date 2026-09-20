<script lang="ts">
    import { language } from "src/lang";
    import { alertConfirm, alertError, alertMd, alertNormal, alertStore } from "src/ts/alert";
    import { checkDriver } from "src/ts/drive/drive";
    import { isTauri, isNodeServer } from "src/ts/platform"
    import { OpfsStorage } from "src/ts/storage/opfsStorage";
    import { acquireExclusiveStorageMigrationLock, forageStorage, getUncleanablesSync } from "src/ts/globalApi.svelte";
    import { scanAssetCacheIntegrity, evictAssetCacheEntries } from "src/ts/storage/assetIntegrity";
    import { markAppInitiatedReload } from "src/ts/reloadGuard";
    import { DBState } from "src/ts/stores.svelte";
    import Check from "src/lib/UI/GUI/CheckInput.svelte";
    import localforage from "localforage";

    async function verifyAssetIntegrity(){
        const targets = getUncleanablesSync(DBState.db, 'basename')
        if(targets.length === 0){
            alertNormal('No assets to check.')
            return
        }
        let summary
        let scanError: any = null
        try {
            alertStore.set({ type: 'wait', msg: `Verifying asset cache... (0 / ${targets.length})` })
            summary = await scanAssetCacheIntegrity(targets, (done, total) => {
                alertStore.set({ type: 'wait', msg: `Verifying asset cache... (${done} / ${total})` })
            })
        } catch (error) {
            scanError = error
        } finally {
            // Always clear the blocking 'wait' state, even if the scan threw —
            // otherwise a Cache API failure (storage/security errors, not just
            // the API being entirely absent) leaves the app stuck behind it
            // with no way to dismiss it. Deliberately not calling alertError()
            // in the catch block above: alertStore is a single shared slot, and
            // this finally block runs before that return completes, so setting
            // it to 'error' there would just get immediately overwritten with
            // 'none' by this line — report the failure only after this whole
            // try/finally has settled.
            alertStore.set({ type: 'none', msg: '' })
        }
        if(scanError){
            alertError(scanError)
            return
        }
        if(summary.unsupported){
            alertError('This browser does not support the check needed here (Cache API unavailable).')
            return
        }

        let evicted = 0
        if(summary.mismatches.length > 0){
            if(await alertConfirm(`Found ${summary.mismatches.length} corrupted cache entries. Remove them from the cache now? A page reload will be needed afterward for the fix to take effect.`)){
                try {
                    evicted = await evictAssetCacheEntries(summary.mismatches.map((m) => m.basename))
                } catch (error) {
                    alertError(error)
                    return
                }
            }
        }

        let report = `## Asset Cache Integrity Report\n\n`
        report += `- Checked: ${summary.checked} / ${targets.length}\n`
        report += `- Not yet cached (normal, not an issue): ${summary.notCached}\n`
        report += `- Not content-addressed (can't be verified this way): ${summary.notContentAddressed}\n`
        report += `- **Mismatches found: ${summary.mismatches.length}**\n`
        if(summary.mismatches.length > 0){
            report += `\n`
            for(const m of summary.mismatches){
                report += `- \`${m.basename}\`\n`
            }
            report += evicted > 0
                ? `\nRemoved ${evicted} corrupted cache entries. Reload the app for the fix to take effect.`
                : `\nLeft in the cache, as requested.`
        }
        else{
            report += `\nNo corruption detected in the checked assets.`
        }
        alertMd(report)
    }

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
        markAppInitiatedReload()
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
            markAppInitiatedReload()
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

{#if !isTauri && !forageStorage.isAccount}
    <h2 class="mb-2 text-2xl font-bold mt-6">Asset Cache Integrity</h2>
    <p class="text-sm opacity-70 mb-2">Checks cached images/assets against their own content hash to detect corruption, without re-downloading anything from storage. Read-only unless you choose to remove a corrupted entry.</p>
    <Check bind:check={DBState.db.checkCorruption} name="Warn on startup if a quick sample check finds corruption" />
    <button
        onclick={verifyAssetIntegrity}
        class="drop-shadow-lg p-3 border-darkborderc border-solid mt-2 flex justify-center items-center ml-2 mr-2 border-1 hover:bg-selected text-sm">
        Verify Asset Cache Now
    </button>
{/if}

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