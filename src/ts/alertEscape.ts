import type { alertData } from './alert'

/**
 * What Escape does while an alert of a given type is up.
 * - `ignore`: the alert waits for an answer, or is deliberately left alone. Escape is consumed
 *   and changes nothing.
 * - `close`: an information alert with no answer to give. Escape closes it.
 * - `idle`: nothing is waiting on the user. Escape takes the ordinary path.
 */
export type AlertEscapeAction = 'ignore' | 'close' | 'idle'

/**
 * Total over `alertData['type']`, so a new alert type fails the type check until it is classified.
 * A prompt waiting for an answer is never answered by Escape. A `wait` alert carrying `onCancel`
 * is handled earlier in hotkey.ts and never reaches this table.
 */
export const ALERT_ESCAPE_ACTIONS: Record<alertData['type'], AlertEscapeAction> = {
    ask: 'ignore',
    pluginconfirm: 'ignore',
    select: 'ignore',
    input: 'ignore',
    selectChar: 'ignore',
    addchar: 'ignore',
    chatOptions: 'ignore',
    cardexport: 'ignore',
    selectModule: 'ignore',
    tos: 'ignore',
    staleAccountNotice: 'ignore',
    progress: 'ignore',
    normal: 'close',
    error: 'close',
    markdown: 'close',
    requestdata: 'close',
    hypaV2: 'close',
    branches: 'close',
    requestlogs: 'close',
    pukmakkurit: 'close',
    wait2: 'close',
    none: 'idle',
    toast: 'idle',
    wait: 'idle',
}

export function escapeActionFor(type: alertData['type']): AlertEscapeAction {
    return ALERT_ESCAPE_ACTIONS[type]
}
