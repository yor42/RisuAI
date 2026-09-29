import { get } from "svelte/store"
import { DBState, selectedCharID } from "../stores.svelte"

/**
 * Identifies the selected character and the chat it has open. The selected chat
 * is not a store: it is `chatPage` on the character in `DBState`.
 */
function selectionKey(charIndex: number): string {
    const char = DBState.db?.characters?.[charIndex]
    const chat = char?.chats?.[char.chatPage]
    return `${charIndex}|${char?.chaId ?? ''}|${chat?.id ?? ''}`
}

/**
 * Calls `onChange` at every change of the selected character or of its selected
 * chat, observed as it happens: leaving a selection and coming back still
 * reports the change. A character switch is reported as the store changes; a
 * chat switch away and back inside one synchronous stretch is coalesced and
 * reports nothing. Returns the function that ends the watching; call it once
 * `onChange` has done its work.
 */
export function watchSelectedChat(onChange: () => void): () => void {
    let stopped = false
    const initial = get(selectedCharID)
    let selected = $state(initial)
    let last = selectionKey(initial)

    let firstDelivery = true
    const stopStore = selectedCharID.subscribe((id) => {
        if (firstDelivery) {
            firstDelivery = false
            return
        }
        if (stopped) {
            return
        }
        selected = id
        last = selectionKey(id)
        onChange()
    })

    const stopRoot = $effect.root(() => {
        $effect(() => {
            const key = selectionKey(selected)
            if (stopped || key === last) {
                return
            }
            last = key
            onChange()
        })
    })

    return () => {
        if (stopped) {
            return
        }
        stopped = true
        stopStore()
        stopRoot()
    }
}
