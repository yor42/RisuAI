import { alertConfirm, alertWait } from "./alert";
import { language } from "../lang";
import { isMobile, isTauri } from "./globalApi.svelte";

export async function checkRisuUpdate(){

    if(isMobile && isTauri){
        return
    }

    // ARM64 빌드에서 updater 비활성화
    if(import.meta.env.VITE_DISABLE_UPDATER === 'true'){
        console.log('Updater disabled for this build')
        return
    }

    try {
        // Dynamically import updater plugins only on desktop
        const { check } = await import('@tauri-apps/plugin-updater');
        const { relaunch } = await import('@tauri-apps/plugin-process');
        
        const checked = await check()
        if(checked){
            const conf = await alertConfirm(language.newVersion)
            if(conf){
                alertWait(`Updating to ${checked.version}...`)
                await checked.downloadAndInstall()
                await relaunch()
            }
        }
    } catch (error) {
        console.error('Update check failed:', error)
    }
}

function versionStringToNumber(versionString:string):number {
    return Number(
      versionString
        .split(".")
        .map((component) => component.padStart(4, "0"))
        .join("")
    );
}