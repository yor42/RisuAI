// Legacy Capacitor-based mobile storage - deprecated
// For Tauri 2.0 Android, use Tauri's file system API instead

export function encodeCapKeySafe(oldKey:string){
    return oldKey.replace(/_/g, '__').replace(/\//g, '_s').replace(/\./g, '_d').replace(/\$/g, '_t').replace(/-/g, '_h').replace(/:/g, '_c') + '.bin'
}

export function decodeCapKeySafe(newKey:string){
    newKey = newKey.substring(0, newKey.length-4)
    return newKey.replace(/_c/g, ':').replace(/_h/g, '-').replace(/_t/g, '$').replace(/_d/g, '.').replace(/_s/g, '/').replace(/__/g, '_')
}

export class MobileStorage{
    async setItem(key:string, value:Uint8Array) {
        throw new Error('MobileStorage is deprecated - use Tauri-based storage for mobile platforms')
    }
    async getItem(key:string):Promise<Buffer> {
        throw new Error('MobileStorage is deprecated - use Tauri-based storage for mobile platforms')
    }
    async keys():Promise<string[]>{
        throw new Error('MobileStorage is deprecated - use Tauri-based storage for mobile platforms')
    }
    async removeItem(key:string){
        throw new Error('MobileStorage is deprecated - use Tauri-based storage for mobile platforms')
    }

    listItem = this.keys
}

function byteLengthToString(byteLength:number):string{
    if(byteLength < 1024){
        return byteLength + ' B'
    }
    if(byteLength < 1024*1024){
        return (byteLength/1024).toFixed(2) + ' KB'
    }
    if(byteLength < 1024*1024*1024){
        return (byteLength/1024/1024).toFixed(2) + ' MB'
    }
    return (byteLength/1024/1024/1024).toFixed(2) + ' GB'
}

export async function capStorageInvestigation(){
    // Legacy Capacitor storage investigation - deprecated
    // For Tauri mobile platforms, implement Tauri-based storage investigation
    const investResults:{
        key:string,
        size:string,
    }[] = []

    const estimated = await navigator.storage.estimate()

    if(estimated){
        investResults.push({key:'webstorage', size:byteLengthToString(estimated.usage)})
    }

    return investResults
}