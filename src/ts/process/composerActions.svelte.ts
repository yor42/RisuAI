import { get } from 'svelte/store'
import { DBState, selectedCharID } from '../stores.svelte'
import type { Message, character, Chat } from '../storage/database.svelte'
import { doingChat, sendChat } from './index.svelte'
import type { SendChatOriginHint } from './index.svelte'
import { sleep } from '../util'
import { language } from '../../lang'
import { alertError } from '../alert'
import sendSound from '../../etc/send.mp3'
import { sendCharacterMessage } from './sendCharacterMessage'
import { PreUnreroll, Prereroll } from './prereroll'
import { processMultiCommand } from './command'
import { isColdChat } from './coldstorageData'
import { isExpTranslator, translate } from '../translator/translator'
import { beginWork, originStatus, resolveOriginWithHint, writeAt, type Origin, type WorkHandle } from './chatOrigin'
import { markCharacterForSave } from '../storage/characterSaveMarks'
import { registerDraft, unregisterDraft, COMPOSER_DRAFT_KIND } from '../localDrafts'
import * as composerDrafts from './composerDrafts.svelte'
import type { ComposerDraftKey } from './composerDrafts.svelte'
import { v4 as uuidv4 } from 'uuid'

/**
 * Module-level state for the single in-flight composer action (Send or
 * Continue). `windowOpen` is the one-action-at-a-time window: it is open
 * from a Send's/Continue's take, or from the start of a reroll, unreroll or
 * auto mode, until that action's generation hand-off returns. `locked` is
 * open only for a Send's/Continue's own span, from the take until the
 * moment before generation starts (or until the values go back).
 * `autoModeRunning` and `currentGenerationController` are module state too,
 * so a toggle or an abort click in any mounted composer instance --
 * including one mounted after the loop or the generation started -- reaches
 * the one running loop or the one current generation. Every one of these is
 * global and survives a remount, so every composer instance sees the same
 * state. `isComposerBusy`/`isComposerLocked`/`isAutoModeActive` below expose
 * the relevant ones read-only.
 */
let windowOpen = $state(false)
let locked = $state(false)
let autoModeRunning = $state(false)
let currentGenerationController: AbortController | null = null

/**
 * The chat a generation writes into, and the objects it was read through.
 * `sendChatMain` hands both to `sendChat` and reads the chat back through them
 * afterwards, so a switch of chat, character or Home while the reply is
 * generated changes neither where the reply goes nor what is stored for reroll.
 */
interface GenerationTarget {
    origin: Origin
    originHint: SendChatOriginHint
}

/**
 * The in-flight slot's own draft key. Registered under `COMPOSER_DRAFT_KIND`
 * for as long as a Send/Continue holds the composer's taken values, so the
 * multi-tab reload gate sees a draft in flight even though the origin's
 * per-chat record reads empty during that span.
 */
const inflightDraftKey = uuidv4()

/**
 * A Send's or Continue's own pre-append span: the taken values, its work
 * handle and abort controller, and the origin they came from (`workHandle.origin`
 * is also the key every put-back writes to). `abortChat` sets `settled`
 * to true when the busy button cancels this record before its push; a
 * successful push never sets it, and instead clears `inflight` directly (see
 * `clearInflightIfCurrent`'s call sites in `sendMain`), which is what stops a
 * later `abortChat` call from treating an already-pushed send as still
 * cancelable. `sendMain`'s own `finally` always runs `clearInflightIfCurrent`
 * and ends the work handle -- both are harmless to repeat -- but reads
 * `settled` to decide the rest: when it is true, the busy button already put
 * the values back and closed the window and the lock, so `finally` does not
 * put them back a second time, and does not close a window or a lock a later
 * send may since have opened.
 */
interface InflightRecord {
    controller: AbortController
    workHandle: WorkHandle
    takenMessageInput: string
    takenMessageInputTranslate: string
    takenFileInput: string[]
    settled: boolean
}

/**
 * The one Send/Continue currently between its take and its push, or `null`
 * when none is. Cleared the moment that span ends, whichever way -- so a
 * later `abortChat` call (during generation, or with nothing in flight)
 * falls through to aborting whichever controller the module itself holds,
 * instead of re-cancelling a send that has already finished with it.
 */
let inflight: InflightRecord | null = null

function clearInflightIfCurrent(record: InflightRecord): void {
    if(inflight === record){
        inflight = null
    }
}

/**
 * Test-only reset: clears whatever in-flight record a stuck test left
 * behind, closes the window and the lock, stops auto mode and drops the
 * current generation controller, and clears every stored composer draft --
 * so a timed-out test cannot cascade into every test that runs after it.
 * Never called from production code.
 */
export function resetComposerActionsForTests(): void {
    inflight = null
    unregisterDraft(inflightDraftKey)
    locked = false
    windowOpen = false
    autoModeRunning = false
    currentGenerationController = null
    composerDrafts.resetComposerDraftsForTests()
}

/** True while the one-action window is open; the Send button's busy state. */
export function isComposerBusy(): boolean {
    return windowOpen
}

/** True from a Send's/Continue's take until its hand-off or put-back. */
export function isComposerLocked(): boolean {
    return locked
}

/** True while auto mode's loop is running, in every composer instance. */
export function isAutoModeActive(): boolean {
    return autoModeRunning
}

/**
 * The composer's live state, reached through get/set pairs. Only the
 * per-instance reroll history and the menu-close hook remain here: the
 * three text/file values are reached by key through `composerDrafts.svelte.ts`,
 * and auto mode's running state and the current generation's abort
 * controller are this module's own state, not per instance.
 */
export interface ComposerActionsSource {
    rerolls: {
        get(): Message[][]
        set(value: Message[][]): void
    }
    rerollId: {
        get(): number
        set(value: number): void
    }
    lastCharId: {
        get(): number
        set(value: number): void
    }
    closeMenu(): void
}

export async function send(source: ComposerActionsSource): Promise<void> {
    return sendMain(source, false)
}

export async function sendContinue(source: ComposerActionsSource): Promise<void> {
    return sendMain(source, true)
}

export async function sendMain(source: ComposerActionsSource, continueResponse: boolean): Promise<void> {
    // CHORE-07 stage 7b: refuse to run against a chat whose first
    // message is still a live cold-storage pointer -- checked before
    // processMultiCommand so /cut, /del, /multisend etc. can't mutate a
    // chat that hasn't finished loading. This runs before the take, so the
    // composer is never touched at all.
    {
        const guardChar = DBState.db.characters[get(selectedCharID)]
        const guardChat = guardChar?.chats?.[guardChar.chatPage]
        if(isColdChat(guardChat)){
            alertError(language.errors.coldStorageChatStillLoading)
            return
        }
    }

    if(get(doingChat)){
        return
    }
    if(windowOpen){
        return
    }

    const selectedChar = get(selectedCharID)
    const char = DBState.db.characters[selectedChar]
    if(!char){
        return
    }
    const startChat = char.chats?.[char.chatPage]
    if(!startChat){
        return
    }

    if(source.lastCharId.get() !== selectedChar){
        source.rerolls.set([])
        source.rerollId.set(-1)
    }

    // beginWork captures the origin (and refuses to take anything when the
    // character or chat cannot be found or given an id).
    const workHandle = beginWork(char, startChat)
    if(!workHandle){
        return
    }

    // The take: the origin's per-chat record's three values move into the
    // module-level in-flight slot synchronously, leaving that record empty
    // (composerDrafts.take drops an all-empty record at once); the send's
    // own abort controller is created; the window and the lock open.
    const taken = composerDrafts.take(workHandle.origin)
    const takenMessageInput = taken.messageInput
    const takenMessageInputTranslate = taken.messageInputTranslate
    const takenFileInput = taken.fileInput

    const controller = new AbortController()
    // Published here, at the take, not only inside sendChatMain's own later
    // assignment: a busy-button click in the gap between the append and the
    // hand-off to generation (sendMain's post-append sleep) reaches
    // abortChat's fallback, which reads this to abort the send's own
    // controller rather than a stale one left by an earlier generation.
    currentGenerationController = controller

    windowOpen = true
    locked = true

    const record: InflightRecord = {
        controller,
        workHandle,
        takenMessageInput,
        takenMessageInputTranslate,
        takenFileInput,
        settled: false,
    }
    inflight = record

    // Exactly one of these three outcomes is reached, and every exit from
    // the try block below goes through the one outermost finally, which
    // always ends the work handle. Past that: a handled command restores
    // the files and the translation itself, inside the try; an appended
    // message needs nothing restored; only 'refused' makes finally put the
    // taken values back. The window and the lock close in finally on every
    // outcome, unless the busy button already closed them for this record.
    // `registerDraft` runs inside the try, so a drafts-changed listener that
    // throws when the draft is registered still reaches this finally, which
    // puts the values back and closes the window and the lock. A listener
    // that also throws when the finally unregisters the draft is not covered.
    let outcome: 'appended' | 'commandHandled' | 'refused' = 'refused'
    try {
        registerDraft(inflightDraftKey, COMPOSER_DRAFT_KIND)

        let workingText = takenMessageInput

        if(workingText.startsWith('/')){
            const commandProcessed = await processMultiCommand(workingText)
            if(controller.signal.aborted){
                return
            }
            if(commandProcessed !== false){
                // A handled command consumes the text; the staged files and
                // the translation go back into the origin's record, in front
                // of anything a late file result already placed there.
                composerDrafts.putBack(workHandle.origin, {
                    messageInput: '',
                    messageInputTranslate: takenMessageInputTranslate,
                    fileInput: takenFileInput,
                })
                outcome = 'commandHandled'
                clearInflightIfCurrent(record)
                return
            }
        }

        let workingFiles = takenFileInput
        if(workingFiles.length > 0){
            for(const file of workingFiles){
                workingText = workingText + `{{inlayed::${file}}}`
            }
            workingFiles = []
        }

        if(workingText === ''){
            if(controller.signal.aborted){
                return
            }
            const status = originStatus(workHandle.origin)
            if(status === 'gone'){
                return
            }
            if(char.type !== 'group' && DBState.db.useSayNothing){
                const appendSayNothing = (chat: Chat) => {
                    if(chat.message.length === 0 || chat.message[chat.message.length - 1].role !== 'user'){
                        chat.message.push({ role: 'user', data: '*says nothing*' })
                    }
                }
                if(status === 'ambiguous'){
                    appendSayNothing(startChat)
                    markCharacterForSave(char.chaId)
                }
                else{
                    writeAt(workHandle.origin, (ctx) => { appendSayNothing(ctx.chat) })
                }
            }
            outcome = 'appended'
        }
        else if(char.type === 'character'){
            // `onAppended` fires inside sendCharacterMessage's own
            // synchronous push, before this await resolves, so the record
            // stops looking cancelable at the moment the message lands
            // rather than a few microtask turns later.
            await sendCharacterMessage(workHandle, char as character, startChat, workingText, controller.signal, () => {
                outcome = 'appended'
                clearInflightIfCurrent(record)
                unregisterDraft(inflightDraftKey)
            })
        }
        else{
            if(controller.signal.aborted){
                return
            }
            const status = originStatus(workHandle.origin)
            if(status === 'gone'){
                return
            }
            const message: Message = {
                role: 'user',
                data: workingText,
                time: Date.now()
            }
            if(status === 'ambiguous'){
                startChat.message.push(message)
                markCharacterForSave(char.chaId)
            }
            else{
                writeAt(workHandle.origin, (ctx) => { ctx.chat.message.push(message) })
            }
            outcome = 'appended'
        }

        if(outcome !== 'appended'){
            return
        }

        // Past this point a busy-button click aborts generation (the
        // fallback path in abortChat below), not this record: nothing is
        // put back once the message has landed.
        clearInflightIfCurrent(record)
        unregisterDraft(inflightDraftKey)
        source.rerolls.set([])
        await sleep(10)
        // The hand-off: the lock ends the moment before the generation
        // callback is called.
        locked = false
        await sendChatMain(source, { origin: workHandle.origin, originHint: { owner: char, chat: startChat } }, continueResponse, controller)
    }
    finally {
        // A finally acts only on its own action: once the busy button has
        // already cancelled this record, its cleanup already ran, and a
        // second pass here must not put the values back again, close a
        // newer window, or clear an in-flight pointer a later send now
        // owns.
        const alreadySettled = record.settled
        clearInflightIfCurrent(record)
        workHandle.end()
        if(!alreadySettled){
            unregisterDraft(inflightDraftKey)
            if(outcome === 'refused'){
                // The taken values, exactly as they were taken (the text
                // before {{inlayed::}} inlining, and the files), go back to
                // the origin's own record by key -- whether or not that
                // record is on screen, and whichever composer instance, if
                // any, is mounted -- in front of whatever a late writer
                // already placed there.
                composerDrafts.putBack(workHandle.origin, {
                    messageInput: takenMessageInput,
                    messageInputTranslate: takenMessageInputTranslate,
                    fileInput: takenFileInput,
                })
            }
            locked = false
            windowOpen = false
        }
    }
}

export async function reroll(source: ComposerActionsSource): Promise<void> {
    if(get(doingChat)){
        return
    }
    // The one-action window also covers reroll, so a Send while a reroll's
    // own generation is running is refused the same way.
    if(windowOpen){
        return
    }
    windowOpen = true
    let workHandle: WorkHandle | null = null
    try {
        const char = DBState.db.characters[get(selectedCharID)]
        const chat = char?.chats?.[char.chatPage]
        if(!char || !chat){
            return
        }
        // The chat the regenerated reply goes to is fixed here, before the
        // reroll history is read or trimmed.
        workHandle = beginWork(char, chat)
        if(!workHandle){
            return
        }
        if(source.lastCharId.get() !== get(selectedCharID)){
            source.rerolls.set([])
            source.rerollId.set(-1)
        }
        const genId = DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message.at(-1)?.generationInfo?.generationId
        if(genId){
            const r = Prereroll(genId)
            if(r){
                DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message[DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message.length - 1].data = r
                return
            }
        }
        if(source.rerollId.get() < source.rerolls.get().length - 1){
            if(Array.isArray(source.rerolls.get()[source.rerollId.get() + 1])){
                source.rerollId.set(source.rerollId.get() + 1)
                let rerollData = safeStructuredClone(source.rerolls.get()[source.rerollId.get()])
                let msgs = DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message
                for(let i = 0; i < rerollData.length; i++){
                    msgs[msgs.length - rerollData.length + i] = rerollData[i]
                }
                DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message = msgs
            }
            return
        }
        if(source.rerolls.get().length === 0){
            source.rerolls.get().push(safeStructuredClone([DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message.at(-1)]))
            source.rerollId.set(source.rerolls.get().length - 1)
        }
        let cha = safeStructuredClone(DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message)
        if(cha.length === 0 ){
            return
        }
        source.closeMenu()
        const saying = cha[cha.length - 1].saying
        let sayingQu = 2
        while(cha[cha.length - 1].role !== 'user'){
            if(cha[cha.length - 1].saying === saying){
                sayingQu -= 1
                if(sayingQu === 0){
                    break
                }
            }
            let msg = cha.pop()
            if(!msg){
                return
            }
        }
        DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message = cha
        await sendChatMain(source, { origin: workHandle.origin, originHint: { owner: char, chat } })
    }
    finally {
        workHandle?.end()
        windowOpen = false
    }
}

export async function unReroll(source: ComposerActionsSource): Promise<void> {
    if(get(doingChat)){
        return
    }
    if(windowOpen){
        return
    }
    windowOpen = true
    try {
        if(source.lastCharId.get() !== get(selectedCharID)){
            source.rerolls.set([])
            source.rerollId.set(-1)
        }
        const genId = DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message.at(-1)?.generationInfo?.generationId
        if(genId){
            const r = PreUnreroll(genId)
            if(r){
                DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message[DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message.length - 1].data = r
                return
            }
        }
        if(source.rerollId.get() <= 0){
            return
        }
        if(Array.isArray(source.rerolls.get()[source.rerollId.get() - 1])){
            source.rerollId.set(source.rerollId.get() - 1)
            let rerollData = safeStructuredClone(source.rerolls.get()[source.rerollId.get()])
            let msgs = DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message
            for(let i = 0; i < rerollData.length; i++){
                msgs[msgs.length - rerollData.length + i] = rerollData[i]
            }
            DBState.db.characters[get(selectedCharID)].chats[DBState.db.characters[get(selectedCharID)].chatPage].message = msgs
        }
    }
    finally {
        windowOpen = false
    }
}

export async function sendChatMain(source: ComposerActionsSource, target: GenerationTarget, continued: boolean = false, existingController?: AbortController): Promise<void> {

    // Every read around the send goes through the target's own chat, never
    // the selection, which may be another chat, another character or Home by
    // the time the send is handed over or has finished.
    const previousLength = resolveOriginWithHint(target.origin, target.originHint)?.chat.message.length ?? 0
    // Only a take empties a record -- generation itself never writes one.
    const controller = existingController ?? new AbortController()
    // Module state, not per instance, so the busy button in any composer
    // instance -- including one mounted after generation started -- aborts
    // this same generation.
    currentGenerationController = controller
    try {
        await sendChat(-1, {
            signal: controller.signal,
            continue: continued,
            origin: target.origin,
            originHint: target.originHint
        })
        const finished = resolveOriginWithHint(target.origin, target.originHint)
        if(finished && previousLength < finished.chat.message.length){
            source.rerolls.get().push(safeStructuredClone(finished.chat.message.slice(previousLength)))
            source.rerollId.set(source.rerolls.get().length - 1)
        }
    } catch (error) {
        console.error(error)
        alertError(error)
    }
    const settledTarget = resolveOriginWithHint(target.origin, target.originHint)
    if(settledTarget){
        source.lastCharId.set(settledTarget.ownerIndex)
    }
    doingChat.set(false)
    if(DBState.db.playMessage){
        const audio = new Audio(sendSound);
        audio.play().catch(() => {});
    }
}

export function abortChat(): void {
    // While a Send/Continue is still between its take and its push, the
    // busy button cancels it at once here, rather than waiting for its
    // stalled step to resolve and unwind on its own: the window and the
    // lock close immediately, and the taken values go back to the origin's
    // own record by key -- the window is global, so any composer instance's
    // busy button can cancel it, whichever instance (or none) is showing
    // that record now.
    if(inflight && !inflight.settled){
        const record = inflight
        record.settled = true
        inflight = null
        record.controller.abort()
        record.workHandle.end()
        unregisterDraft(inflightDraftKey)
        composerDrafts.putBack(record.workHandle.origin, {
            messageInput: record.takenMessageInput,
            messageInputTranslate: record.takenMessageInputTranslate,
            fileInput: record.takenFileInput,
        })
        locked = false
        windowOpen = false
        return
    }
    // Abort the module-level generation controller, not a per-instance one
    // -- so the busy button in any composer instance, including one mounted
    // after generation started, aborts it. Aborting an already finished (or
    // already aborted) controller is harmless.
    if(currentGenerationController){
        currentGenerationController.abort()
    }
}

/** True while the chat on screen is the one `origin` names. */
function isShowingChat(origin: Origin): boolean {
    const shown = DBState.db.characters[get(selectedCharID)]
    return shown?.chaId === origin.chaId && shown.chats?.[shown.chatPage]?.id === origin.chatId
}

export async function runAutoMode(source: ComposerActionsSource): Promise<void> {
    // Running state is module-level, so stopping auto mode from any
    // instance -- including one mounted after the loop started -- is never
    // refused, even while its own loop below holds the window open.
    if(autoModeRunning){
        autoModeRunning = false
        return
    }
    if(windowOpen){
        return
    }
    const char = DBState.db.characters[get(selectedCharID)]
    const chat = char?.chats?.[char.chatPage]
    if(!char || !chat){
        return
    }
    // Every tick generates into the chat auto mode was started in.
    const workHandle = beginWork(char, chat)
    if(!workHandle){
        return
    }
    const target: GenerationTarget = { origin: workHandle.origin, originHint: { owner: char, chat } }
    autoModeRunning = true
    windowOpen = true
    try {
        while(autoModeRunning){
            await sendChatMain(source, target)
            if(!isShowingChat(target.origin)){
                autoModeRunning = false
            }
        }
    }
    finally {
        // Every exit -- the loop's own stop, a switch to another chat or
        // character, a toggle from another instance, or a throw from
        // sendChatMain -- leaves autoModeRunning false, since it is module
        // state and a stuck true here would survive a remount.
        workHandle.end()
        autoModeRunning = false
        windowOpen = false
    }
}

/**
 * Both translation directions: captures `key`'s record's source field when
 * the request starts, and writes the derived field only while that same
 * record's source field still holds exactly that text when the result
 * comes back -- whether or not the record is on screen by then, and
 * regardless of which composer instance, if any, started the call. `key`
 * is resolved (filling any missing id) by the caller, from an event handler.
 */
export async function updateInputTransateMessage(key: ComposerDraftKey, reverse: boolean): Promise<void> {
    if(!DBState.db.useAutoTranslateInput){
        return
    }
    if(isExpTranslator()){
        if(!reverse){
            composerDrafts.write(key, (r) => { r.messageInputTranslate = '' })
            return
        }
        if(composerDrafts.peek(key).messageInputTranslate === '') {
            composerDrafts.write(key, (r) => { r.messageInput = '' })
            return
        }
        const lastMessageInputTranslate = composerDrafts.peek(key).messageInputTranslate
        await sleep(1500)
        if(lastMessageInputTranslate === composerDrafts.peek(key).messageInputTranslate){
            // The derived field is written only while the source field
            // still holds exactly the text that was sent for translation --
            // a result whose source changed while the request was in
            // flight is discarded rather than overwriting newer input.
            const sourceText = composerDrafts.peek(key).messageInputTranslate
            translate(sourceText, reverse).then((translatedMessage) => {
                if(translatedMessage && composerDrafts.peek(key).messageInputTranslate === sourceText){
                    composerDrafts.write(key, (r) => { r.messageInput = translatedMessage })
                }
            })
        }
        return

    }
    if(reverse && composerDrafts.peek(key).messageInputTranslate === '') {
        composerDrafts.write(key, (r) => { r.messageInput = '' })
        return
    }
    if(!reverse && composerDrafts.peek(key).messageInput === '') {
        composerDrafts.write(key, (r) => { r.messageInputTranslate = '' })
        return
    }
    const sourceText = reverse ? composerDrafts.peek(key).messageInputTranslate : composerDrafts.peek(key).messageInput
    translate(sourceText, reverse).then((translatedMessage) => {
        if(!translatedMessage){
            return
        }
        const currentSourceText = reverse ? composerDrafts.peek(key).messageInputTranslate : composerDrafts.peek(key).messageInput
        if(currentSourceText !== sourceText){
            return
        }
        if(reverse)
            composerDrafts.write(key, (r) => { r.messageInput = translatedMessage })
        else
            composerDrafts.write(key, (r) => { r.messageInputTranslate = translatedMessage })
    })
}
