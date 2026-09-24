import { hubURL } from "../characterCards"
import { getDatabase, setDatabase } from "../storage/database.svelte"
import { alertConfirm, alertError, alertMd, alertNormal, alertSelect, alertWait } from "../alert"
import { AppendableBuffer, requiresFullEncoderReload } from "../globalApi.svelte"
import { decodeRisuSave } from "../storage/risuSave"
import { language } from "src/lang"
import { fetchProtectedResource } from "../sionyw"
import { repairDatabaseIds } from "../process/chatIds"

export function risuLogin() {
    const win = window.open(hubURL + '/hub/login')
    window.addEventListener("message", (ev) => {
        if(ev.source !== win.window){
            return
        }
        console.log(ev)
        const data = JSON.parse(ev.data)
        console.log(data)
        win.close()
    })
}

export async function saveRisuAccountData() {
    const db = getDatabase()
    if(!db.account){
        alertError("Not logged in error")
        return
    }
    const s = await fetch(hubURL + '/hub/account/save', {
        method: "POST",
        body: JSON.stringify({
            token: db.account.token,
            save: db.account.data
        })
    })
    if(s.status !== 200){
        alertError(await s.text())
        return
    }
}

export async function loadRisuAccountData() {
    const db = getDatabase()
    if(!db.account){
        alertError("Not logged in error")
        return
    }
    const s = await fetchProtectedResource('/hub/account/load', {
        method: "POST",
    })
    if(s.status !== 200){
        alertError(await s.text())
        return
    }
    db.account.data = await s.json()
}

export async function loadRisuAccountBackup() {
    const db = getDatabase()
    if(!db.account){
        alertError("Not logged in error")
        return
    }
    const s = await fetchProtectedResource('/hub/backup/list', {
        method: "GET",
    })
    if(s.status !== 200){
        alertMd(await s.text())
        return
    }
    const backups = await s.json() as string[]
    if(!backups.length){
        alertError("No backups found")
        return
    }
    const backupIdStr = await alertSelect([...backups.map((v) => {
        const int = parseInt(v)

        if(!isNaN(int)){
            const intl = new Intl.DateTimeFormat([
                navigator.language,
                'en-US'
            ], {
                dateStyle: 'short',
                timeStyle: 'short'
            }).format(new Date(int))
            return intl
        }

        return v
    }), "Cancel"])
    const backupIdNum = parseInt(backupIdStr)
    if(backupIdNum === backups.length){
        return
    }
    if(isNaN(backupIdNum)){
        alertError("Invalid backup id")
        return
    }
    if(!await alertConfirm(language.backupLoadConfirm)){
        return
    }
    if(!await alertConfirm(language.backupLoadConfirm2)){
        return
    }

    const backupId = backups[backupIdNum]

    const backup = await fetchProtectedResource('/hub/backup/get', {
        method: "GET",
        headers: {
            'x-risu-key': backupId
        }
    })

    if(backup.status !== 200){
        alertError(await backup.text())
        return
    }
    else{
        const buf = new AppendableBuffer()
        const reader = backup.body.getReader()

        while(true){
            const {done, value} = await reader.read()
            if(done){
                break
            }
            alertWait("Downloading backup: " + buf.buffer.byteLength)
            buf.append(value)
        }

        alertWait("Loading backup")

        const decoded = await decodeRisuSave(buf.buffer)
        // This load never reloads the page, so boot's repair would not run
        // until the next start; it repairs ids on the decoded backup before
        // `setDatabase` installs it. A throw here aborts the load before
        // anything is replaced, and an edit made after the object enters
        // `$state` is invisible once that property has been read.
        repairDatabaseIds(decoded)
        setDatabase(decoded)
        // A backup load is an explicit user action to replace everything, so a
        // full reload (and dropping characters absent from the backup) is
        // intended -- the other three call sites already do this (plan §3.3).
        requiresFullEncoderReload.state = true

        alertNormal('Loaded backup')
    }

}