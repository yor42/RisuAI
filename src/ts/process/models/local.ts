import { invoke } from "@tauri-apps/api/core";
import * as path from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { alertClear, alertError, alertWait } from "src/ts/alert";
import { getDatabase } from "src/ts/storage/database.svelte";
import { sleep } from "src/ts/util";

let initPython = false

async function installPython():Promise<boolean>{
    try{
        const unsupportedReason = await invoke<string | null>("local_inference_unsupported_reason")
        if(unsupportedReason){
            alertClear()
            alertError(unsupportedReason)
            return false
        }
    }
    catch(error){
        alertClear()
        alertError("Failed to check local inference support: " + error)
        return false
    }
    if(initPython){
        return true
    }
    initPython = true
    const appDir = await path.appDataDir()
    const completedPath = await path.join(appDir, 'python', 'completed.txt')
    if(await exists(completedPath)){
        alertWait("Python is already installed, skipping")
    }
    else{
        alertWait("Installing Python")
        const installed = await invoke<boolean>("install_python", {
            path: appDir
        })
        if(!installed){
            initPython = false
            alertClear()
            alertError("Failed to install the bundled Python runtime. The bundled Python local-inference server could not be started on this system.")
            return false
        }
        alertWait("Installing Pip")
        try{
            const pipInstalled = await invoke<boolean>("install_pip", {
                path: appDir
            })
            if(!pipInstalled){
                initPython = false
                alertClear()
                alertError("Failed to install Pip for the bundled Python runtime. The bundled Python local-inference server could not be started on this system.")
                return false
            }
        }
        catch(error){
            initPython = false
            alertClear()
            alertError("Failed to install Pip for the bundled Python runtime: " + error)
            return false
        }
        alertWait("Rewriting requirements")
        try{
            const postInstalled = await invoke<boolean>('post_py_install', {
                path: appDir
            })
            if(!postInstalled){
                initPython = false
                alertClear()
                alertError("Failed to finalize the bundled Python runtime installation. The bundled Python local-inference server could not be started on this system.")
                return false
            }
        }
        catch(error){
            initPython = false
            alertClear()
            alertError("Failed to finalize the bundled Python runtime installation: " + error)
            return false
        }

        alertClear()
    }
    const dependencies = [
        'pydantic',
        'scikit-build',
        'scikit-build-core',
        'pyproject_metadata',
        'pathspec',
        'llama-cpp-python',
        'uvicorn[standard]',
        'fastapi'
    ]
    for(const dep of dependencies){
        alertWait("Installing Python Dependencies (" + dep + ")")
        try{
            await invoke('install_py_dependencies', {
                path: appDir,
                dependency: dep
            })
        }
        catch(error){
            initPython = false
            alertClear()
            alertError("Failed to install Python dependency (" + dep + "): " + error)
            return false
        }
    }

    try{
        await invoke('run_py_server', {
            pyPath: appDir,
        })
    }
    catch(error){
        initPython = false
        alertClear()
        alertError("Failed to start the local inference server: " + error)
        return false
    }
    await sleep(4000)
    alertClear()
    return true

}

async function getLocalKey(retry = true) {
    try {
        const ft = await fetch("http://localhost:10026/")
        const keyJson = await ft.json()
        const keyPath = keyJson.dir
        const key = await readTextFile(keyPath)
        return key
    } catch (error) {
        if(!retry){
            throw `Error when getting local key: ${error}`
        }
        //if is cors error
        if(
            error.message.includes("NetworkError when attempting to fetch resource.")
            || error.message.includes("Failed to fetch")
        ){
            const installed = await installPython()
            if(!installed){
                throw `Error when getting local key: local inference sidecar could not be started`
            }
            return await getLocalKey(false)
        }
        else{
            throw `Error when getting local key: ${error}`
        }
    }
}

export async function tokenizeGGUFModel(prompt:string):Promise<number[]> {
    const key = await getLocalKey()
    const db = getDatabase()
    const modelPath = db.aiModel.replace('local_', '')
    const b = await fetch("http://localhost:10026/llamacpp/tokenize", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-risu-auth": key
        },
        body: JSON.stringify({
            prompt: prompt,
            n_ctx: db.maxContext,
            model_path: modelPath
        })
    })

    return await b.json()
}