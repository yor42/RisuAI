import { DBState } from "../stores.svelte";
import { type Message, type character } from "../storage/database.svelte";
import { runTrigger } from "./triggers";
import { processScript } from "./scripts";
import { beginWork, originStatus, writeAt } from "./chatOrigin";
import { markCharacterForSave } from "../storage/characterSaveMarks";

/**
 * Runs a character's input trigger, then its `editinput` script, and
 * appends the resulting user message to the chat the send started from.
 * The append target is resolved through the origin after every await this
 * function makes, never through the live `chatPage` and never through
 * `cha` -- a switch during either await must not move where the message
 * lands, and must never make two chats share one message array.
 *
 * Returns false, appending nothing, when that chat is gone by the time the
 * append would run. An ambiguous origin still appends, to the chat object
 * held since the start of the send, read at the moment of the append.
 */
export async function sendCharacterMessage(selectedChar: number, cha: Message[], messageInput: string): Promise<boolean> {
    const char = DBState.db.characters[selectedChar] as character
    const startChat = char.chats[char.chatPage]

    const workHandle = beginWork(char, startChat)
    if (!workHandle) {
        return false
    }

    try {
        await runTrigger(char, 'input', { chat: startChat, origin: workHandle.origin })

        const data = await processScript(char, messageInput, 'editinput', {}, workHandle.origin)

        const status = originStatus(workHandle.origin)
        if (status === 'gone') {
            return false
        }

        const message: Message = {
            role: 'user',
            data,
            time: Date.now(),
        }

        if (status === 'ambiguous') {
            // The chat object held since the start of the send, read at the
            // moment of the append -- never an id resolved now, which a
            // duplicate could resolve to the wrong holder of, and never a
            // message array captured before a cut that ran during either
            // await above.
            startChat.message.push(message)
            markCharacterForSave(char.chaId)
        } else {
            writeAt(workHandle.origin, (ctx) => {
                ctx.chat.message.push(message)
            })
        }
        return true
    } finally {
        workHandle.end()
    }
}
