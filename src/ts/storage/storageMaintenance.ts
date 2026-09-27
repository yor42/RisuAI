// Backup & Files maintenance panels (MC-088, I15): the Asset Cache Integrity
// scan and the OPFS storage-backend switch. Kept here as plain functions,
// independent of any settings component, so the same logic backs whichever
// component hosts them.
import { alertConfirm, alertError, alertMd, alertNormal, alertStore } from "../alert"
import { OpfsStorage } from "./opfsStorage"
import { acquireExclusiveStorageMigrationLock, getUncleanablesSync, forageStorage } from "../globalApi.svelte"
import { scanAssetCacheIntegrity, evictAssetCacheEntries } from "./assetIntegrity"
import { markAppInitiatedReload } from "../reloadGuard"
import { DBState } from "../stores.svelte"
import { language } from "src/lang"
import localforage from "localforage"

/**
 * Scans every asset the current database references against its own
 * content hash, and offers to evict any cached copy whose content does not match.
 * Read-only unless the user accepts the eviction confirm.
 */
export async function verifyAssetIntegrity(): Promise<void> {
    const targets = getUncleanablesSync(DBState.db)
    if (targets.length === 0) {
        alertNormal(language.assetIntegrityNoAssets)
        return
    }
    let summary
    let scanError: unknown = null
    try {
        alertStore.set({ type: 'wait', msg: language.assetIntegrityVerifyingProgress(0, targets.length) })
        summary = await scanAssetCacheIntegrity(targets, (done, total) => {
            alertStore.set({ type: 'wait', msg: language.assetIntegrityVerifyingProgress(done, total) })
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
    if (scanError) {
        alertError(scanError instanceof Error ? scanError : String(scanError))
        return
    }
    if (summary.unsupported) {
        alertError(language.assetIntegrityUnsupported)
        return
    }

    let evicted = 0
    if (summary.mismatches.length > 0) {
        if (await alertConfirm(language.assetIntegrityEvictConfirm(summary.mismatches.length))) {
            try {
                evicted = await evictAssetCacheEntries(summary.mismatches.map((m) => m.basename))
            } catch (error) {
                alertError(error)
                return
            }
        }
    }

    let report = language.assetIntegrityReportTitle
    report += language.assetIntegrityReportChecked(summary.checked, targets.length)
    report += language.assetIntegrityReportNotCached(summary.notCached)
    report += language.assetIntegrityReportNotContentAddressed(summary.notContentAddressed)
    report += language.assetIntegrityReportMismatchCount(summary.mismatches.length)
    if (summary.mismatches.length > 0) {
        report += `\n`
        for (const m of summary.mismatches) {
            report += `- \`${m.basename}\`\n`
        }
        report += evicted > 0
            ? language.assetIntegrityReportEvicted(evicted)
            : language.assetIntegrityReportLeftInCache
    }
    else {
        report += language.assetIntegrityReportNoCorruption
    }
    alertMd(report)
}

/**
 * Whether this tab's storage is actually running on OPFS right now --
 * reads the backend `AutoStorage.Init()` selected, not the `opfs_flag!`
 * localStorage flag, which a hand edit or an interrupted switch can leave
 * out of step with the backend in use.
 */
export function isOpfsEnabled(): boolean {
    return forageStorage.realStorage instanceof OpfsStorage
}

/**
 * Checks free space against `navigator.storage.estimate()` before the
 * switch is even confirmed further, and warns if the copy (which needs
 * roughly as much free space again as the data it copies, since the
 * source is never removed) looks unlikely to fit. Skips silently, never
 * refusing, when `estimate()` is unavailable or throws -- the threshold
 * overestimates anyway (usage includes cold storage and caches), so a
 * false positive only costs an extra prompt.
 */
async function confirmEnoughSpaceForSwitch(): Promise<boolean> {
    try {
        const estimate = await navigator.storage?.estimate?.()
        if (!estimate || typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') {
            return true
        }
        const free = estimate.quota - estimate.usage
        if (free >= estimate.usage) {
            return true
        }
        return await alertConfirm(language.opfsEnableSpaceWarningConfirm(estimate.usage, free))
    } catch {
        return true
    }
}

export async function enableOpfs(): Promise<void> {
    if (!await alertConfirm(language.opfsEnableConfirm)) {
        return
    }
    if (!await confirmEnoughSpaceForSwitch()) {
        return
    }
    // A live second tab writing through the OLD backend during migration
    // could have its write silently lost once the migration switches which
    // backend future boots use. This is real cross-tab mutual exclusion
    // (Web Locks), not a heartbeat/timeout check — see storageTabLocks.ts's
    // module header for why a ping-based liveness check isn't sufficient
    // here.
    const releaseMigrationLock = await acquireExclusiveStorageMigrationLock()
    if (!releaseMigrationLock) {
        alertError(language.storageMigrationLockError)
        return
    }
    // acquireExclusiveStorageMigrationLock() already stopped this tab's own
    // writes internally; never releasing the returned function here is
    // intentional — nothing should write database.bin again before the
    // reload below actually happens, same reasoning as LoadLocalBackup()'s
    // restore write in src/ts/drive/backuplocal.ts.
    localStorage.setItem('opfs_flag!', 'able')
    markAppInitiatedReload()
    location.reload()
}

export async function disableOpfs(): Promise<void> {
    // A backend Init() has positively identified as something other than
    // OPFS can never be switched back from here. The check reads the backend
    // in use, not opfs_flag!: a hand-set flag, or any other divergence
    // between the flag and the backend, must not copy OPFS data back over a
    // newer LocalForage copy. A not-yet-initialized
    // realStorage isn't treated as a refusal: Init() always fills it in
    // before Settings can reach this, so this only ever matters as a guard.
    if (forageStorage.realStorage && !(forageStorage.realStorage instanceof OpfsStorage)) {
        alertError(language.opfsDisableRefused)
        return
    }
    if (!await alertConfirm(language.opfsDisableConfirm)) {
        return
    }
    const releaseMigrationLock = await acquireExclusiveStorageMigrationLock()
    if (!releaseMigrationLock) {
        alertError(language.storageMigrationLockError)
        return
    }
    // This tab's own writes are already stopped (see enableOpfs()'s comment
    // above), so nothing can write a newer version to OPFS after this loop
    // has read an older one.
    try {
        const opfs = new OpfsStorage()
        const target = localforage.createInstance({ name: "risuai" })
        const keys = await opfs.keys()
        for (const key of keys) {
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
