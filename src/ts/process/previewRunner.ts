import { get } from "svelte/store"
import { language } from "src/lang"
import { alertClear, alertMd, alertWait, type alertData } from "../alert"
import { alertStore } from "../stores.svelte"
import { doingChat, sendChat, type PreviewResult, type SendChatArg } from "./index.svelte"
import { isComposerWindowOpen } from "./generationOwnership.svelte"
import { watchSelectedChat } from "./previewSelectionWatch.svelte"

/**
 * Ends the result that is waiting for its alert to close: its store
 * subscription and its selection watcher. Null while nothing waits.
 */
let endPendingResult: (() => void) | null = null

function dropPendingResult(): void {
    const end = endPendingResult
    endPendingResult = null
    end?.()
}

/**
 * Whether a prompt preview may start. It may not while a generation or the
 * composer's Send holds the chat, nor while an alert is up: the preview's wait
 * notice would cover that alert, and the alert's waiter would then read the
 * `none` that ends the preview as its own answer. A toast does not block.
 */
export function previewMayStart(): boolean {
    if (get(doingChat) || isComposerWindowOpen()) {
        return false
    }
    const type = get(alertStore).type
    return type === 'none' || type === 'toast'
}

/**
 * Shows `md` once the alert now in front of it is closed: at the first `none`
 * the store takes, delivered to this subscriber. Every blocking alert takes its
 * answer from that same `none` (see `alertEndMessage` in `alert.ts`), and the
 * store delivers a value to all its subscribers before it delivers a write made
 * from inside one, so the result never becomes an alert's answer. It waits for
 * no timer and holds no flag. A newer preview run, or any change of the
 * selected character or chat, drops it.
 */
function showAfterAlertCloses(md: string): void {
    dropPendingResult()
    let settled = false
    let unsubscribe: (() => void) | undefined
    let unwatch: (() => void) | undefined
    const end = () => {
        if (settled) {
            return
        }
        settled = true
        if (endPendingResult === end) {
            endPendingResult = null
        }
        unsubscribe?.()
        unwatch?.()
    }
    endPendingResult = end
    unwatch = watchSelectedChat(end)
    unsubscribe = alertStore.subscribe((value) => {
        if (settled || value.type !== 'none') {
            return
        }
        end()
        alertMd(md)
    })
    if (settled) {
        unsubscribe()
        unwatch()
    }
}

/**
 * Runs one prompt preview: a wait notice with a Cancel button, a preview send
 * on its own abort signal, and then what `render` makes of the call's own
 * output. Callers check `previewMayStart()` first.
 *
 * - Cancelled: the notice is closed at the press and nothing is shown.
 * - The send returned false, or produced nothing to render: the runner closes
 *   its notice if the store still holds it, and shows nothing. An alert that
 *   replaced the notice (the failure's error, say) stays.
 * - The send threw: the notice is closed the same way and the error propagates.
 * - Otherwise the result is shown now if the store holds the notice, nothing or
 *   a toast; behind any other alert it is shown after that alert closes.
 *
 * `render` returns the markdown for a result, or undefined when there is none.
 */
export async function runPreview(
    arg: Pick<SendChatArg, 'preview' | 'previewPrompt'>,
    render: (result: PreviewResult) => string | undefined
): Promise<void> {
    dropPendingResult()

    const controller = new AbortController()
    const result: PreviewResult = {}
    let cancelled = false
    let notice: alertData | undefined = undefined

    const closeIfOurs = () => {
        if (notice && get(alertStore) === notice) {
            alertClear()
        }
    }

    notice = alertWait("Loading...", () => {
        if (cancelled) {
            return
        }
        cancelled = true
        closeIfOurs()
        controller.abort()
    })

    try {
        const completed = await sendChat(-1, { ...arg, signal: controller.signal, previewResult: result })
        if (cancelled) {
            return
        }
        const md = completed
            ? (result.noSpeaker ? language.groupPreviewNoSpeaker : render(result))
            : undefined
        if (md === undefined) {
            closeIfOurs()
            return
        }
        const current = get(alertStore)
        if (current === notice || current.type === 'none' || current.type === 'toast') {
            alertMd(md)
        } else {
            showAfterAlertCloses(md)
        }
    } catch (error) {
        closeIfOurs()
        throw error
    }
}

const SECRET_MASK = '••••'

/** A value shown as a mask with the length of what it hides. */
function maskText(secret: string): string {
    return `${SECRET_MASK} (${secret.length} chars)`
}

/** Values that show what is wrong with a credential instead of hiding it. */
function isVisibleNonValue(text: string): boolean {
    return text === '' || text === 'undefined' || text === 'null'
}

function maskHeaderValue(value: unknown, keepScheme: boolean): unknown {
    if (value === null || value === undefined) {
        return value
    }
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    if (isVisibleNonValue(text)) {
        return value
    }
    if (keepScheme) {
        const parts = /^(\S+)\s+(\S[\s\S]*)$/.exec(text)
        if (parts) {
            return isVisibleNonValue(parts[2]) ? value : `${parts[1]} ${maskText(parts[2])}`
        }
    }
    return maskText(text)
}

function isSecretHeader(name: string): boolean {
    const lower = name.toLowerCase()
    return lower === 'cookie' || /key|token|secret|signature|auth/.test(lower)
}

function isSchemeHeader(name: string): boolean {
    const lower = name.toLowerCase()
    return lower === 'authorization' || lower === 'proxy-authorization'
}

/** Masks the value of every query parameter whose name says it is a credential; the URL need not parse. */
function maskUrl(url: string): string {
    return url.replace(
        /([?&])([^=&#\s]*(?:key|token|secret|signature)[^=&#\s]*)=([^&#\s]*)/gi,
        (_match, separator: string, name: string, value: string) =>
            `${separator}${name}=${isVisibleNonValue(value) ? value : maskText(value)}`
    )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The request as it is shown: credentials masked, everything else as it is. The request itself is untouched. */
function maskRequest(request: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = { ...request }
    if (typeof masked.url === 'string') {
        masked.url = maskUrl(masked.url)
    }
    if (isPlainObject(masked.headers)) {
        masked.headers = Object.fromEntries(
            Object.entries(masked.headers).map(([name, value]) => [
                name,
                isSecretHeader(name) ? maskHeaderValue(value, isSchemeHeader(name)) : value,
            ])
        )
    }
    return masked
}

/** A code fence that the text cannot close early. */
function fenced(info: string, text: string): string {
    return '```' + info + '\n' + text.replaceAll('```', '\\`\\`\\`') + '\n```\n'
}

/**
 * Text that came from card data, made safe to put in a Markdown heading: one
 * line, with the characters Markdown and HTML act on escaped.
 */
export function escapeMarkdownText(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/[\\`*_{}[\]()#+\-.!|~]/g, '\\$&')
}

/**
 * A previewed group member's name as one safe line, or undefined when there is
 * nothing to show: no member, or a name that is empty or only whitespace.
 */
export function memberLabel(memberName?: string): string | undefined {
    if (memberName === undefined) {
        return undefined
    }
    const label = escapeMarkdownText(memberName)
    return label === '' ? undefined : label
}

/**
 * The markdown shown for a request body. A body that is a JSON object is
 * pretty-printed with credentials masked; any other JSON is pretty-printed
 * as it is; anything else is shown as text. The body never closes the fence
 * early. Nothing here throws.
 */
export function renderPromptPreview(body: string, memberName?: string): string {
    let md = '### Prompt'
    const label = memberLabel(memberName)
    if (label !== undefined) {
        md += ' — ' + label
    }
    md += '\n'
    if (body.trim() === '') {
        return md + '> The request body is empty.\n'
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(body)
    } catch {
        return md + fenced('', body)
    }
    const shown = isPlainObject(parsed) ? maskRequest(parsed) : parsed
    return md + fenced('json', JSON.stringify(shown, null, 2))
}

/** The markdown for a prompt-preview result, or undefined when the call wrote no body. */
export function renderPromptResult(result: PreviewResult): string | undefined {
    return result.body === undefined ? undefined : renderPromptPreview(result.body, result.memberName)
}
