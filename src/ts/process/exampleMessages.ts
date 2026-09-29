import type { OpenAIChat } from "./index.svelte";
import type { character } from "../storage/database.svelte";
import type { RunSubject } from "./chatOrigin";
import type { PromptView } from "../cbs";
import { risuChatParser } from "./scripts";

/**
 * Parses the character's example dialogue as the chat `subject` stands for; with no subject, as the selected chat.
 * With a `promptView` every line is parsed as part of the prompt.
 */
export function exampleMessage(char:character, subject?:RunSubject, promptView?:PromptView):OpenAIChat[]{
    if(char.exampleMessage === ''){
        return []
    }

    const messages = char.exampleMessage.split('\n')
    let result:OpenAIChat[] = []
    let currentMessage:OpenAIChat

    function add(){
        if(currentMessage){
            result.push(currentMessage)
        }
    }

    for(const mes of messages){
        const trimed = mes.trim()
        const lowered = trimed.toLocaleLowerCase()


        if(lowered === '<start>'){
            add()
            result.push({
                role: "system",
                content: '[Start a new chat]',
                memo: "NewChatExample",
            })
            currentMessage = null
        }
        else if(lowered.startsWith('{{char}}:')  || lowered.startsWith('<bot>:') || lowered.startsWith(`${char.name}:`)){
            add()
            currentMessage = {
                role: "assistant",
                content: trimed.split(':', 2)[1].trimStart(),
                name: 'example_assistant' 
            }
        }
        else if(lowered.startsWith('{{user}}:') || lowered.startsWith('<user>:')){
            add()
            currentMessage = {
                role: "user",
                content: trimed.split(':', 2)[1].trimStart(),
                name: 'example_user'
            }
        }
        else{
            if(currentMessage){
                currentMessage.content += "\n" + trimed
            }
        }
    }
    add()
    
    result = result.map((r) => {
        return {
            role: r.role,
            content: risuChatParser(r.content, promptView ? {chara: char, subject, promptView} : {chara: char, subject}),
            name: r.name,
            memo: r.memo
        }
    })

    return result
}