import { get } from "svelte/store"
import { alertMd, alertWait } from "../alert"
import { DBState, selectedCharID } from "../stores.svelte"
import { applyChatTemplate } from "./templates/chatTemplate"
import { doingChat, previewBody, previewFormated, sendChat } from "./index.svelte"
import { isComposerWindowOpen } from "./generationOwnership.svelte"

function isBusy(): boolean {
    return get(doingChat) || isComposerWindowOpen()
}

export async function runPreviewPrompt(
    previewMode: string,
    previewJoin: string,
    instructType: string,
    instructCustom: string
){
    if(isBusy()){
        return false
    }
    alertWait("Loading...")
    await sendChat(-1, {
        preview: previewJoin !== 'prompt',
        previewPrompt: previewJoin === 'prompt'
    })

    let md = ''
    const styledRole = {
        "function": "📐 Function",
        "user": "😐 User",
        "system": "⚙️ System",
        "assistant": "✨ Assistant",
    }

    if(previewJoin === 'prompt'){
        md += '### Prompt\n'
        md += '```json\n' + JSON.stringify(JSON.parse(previewBody), null, 2).replaceAll('```', '\\`\\`\\`') + '\n```\n'
        alertMd(md)
        return
    }

    let formated = safeStructuredClone(previewFormated)

    if(previewJoin === 'yes'){
        let newFormated = []
        let latestRole = ''

        for(let i=0;i<formated.length;i++){
            if(formated[i].role === latestRole){
                newFormated[newFormated.length - 1].content += '\n' + formated[i].content
            }else{
                newFormated.push(formated[i])
                latestRole = formated[i].role
            }
        }

        formated = newFormated
    }

    if(previewMode === 'instruct'){
        const instructed = applyChatTemplate(formated, {
            type: instructType,
            custom: instructCustom
        })

        md += '### Instruction\n'
        md += '```\n' + instructed.replaceAll('```', '\\`\\`\\`') + '\n```\n'
        alertMd(md)
        return
    }

    for(let i=0;i<formated.length;i++){

        md += '### ' + (styledRole[formated[i].role] ?? '🤔 Unknown role') + '\n'
        const modals = formated[i].multimodals

        if(modals && modals.length > 0){
            md += `> ${modals.length} non-text content(s) included\n`
        }

        if(formated[i].thoughts && formated[i].thoughts.length > 0){
            md += `> ${formated[i].thoughts.length} thought(s) included\n`
        }

        if(formated[i].cachePoint){
            md += `> Cache point\n`
        }

        md += '```\n' + formated[i].content.replaceAll('```', '\\`\\`\\`') + '\n```\n'
    }
    alertMd(md)
}

export async function runAutopilot(autopilot: string[]){
    for(let i=0;i<autopilot.length;i++){
        if(isBusy()){
            return
        }
        const db = (DBState.db)
        let currentChar = db.characters[get(selectedCharID)]
        let currentChat = currentChar.chats[currentChar.chatPage]
        currentChat.message.push({
            role: 'user',
            data: autopilot[i]
        })
        currentChar.chats[currentChar.chatPage] = currentChat
        db.characters[get(selectedCharID)] = currentChar
        if(!(await sendChat(i))){
            return
        }
    }
}
