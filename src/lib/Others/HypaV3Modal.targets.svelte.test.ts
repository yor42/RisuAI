// @vitest-environment happy-dom

/**
 * The HypaV3 modal's summary deletes ("delete this", "delete after"), its bulk
 * re-summarize apply and its reset act on the summaries, character and chat the user
 * aimed at, however the data changes while a confirmation or the summarizer call is open.
 *
 * Mounts the REAL `HypaV3Modal.svelte` with its real header, summary items, bulk bars and
 * footer over a real `$state` database. The summarizer, the translator and the script
 * engine are stubs; the alert confirm is a mock the test holds open and answers, and every
 * other alert call is recorded. Titles beginning "guard:" pin behaviour that must be
 * preserved before and after the change; every other test is a regression reproducer for
 * the behaviour it names.
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Database } from 'src/ts/storage/database.svelte'
import { language } from 'src/lang'

//#region module mocks

const confirms = vi.hoisted(() => {
    const pending: Array<{ message: string, settle: (answer: boolean) => void }> = []
    return {
        pending,
        ask: (message: string) => new Promise<boolean>((settle) => { pending.push({ message, settle }) }),
    }
})

/** Names of every alert function other than the confirm that was called, and the first argument of each call. */
const noticeCalls = vi.hoisted(() => [] as string[])
const noticeMessages = vi.hoisted(() => [] as Array<{ name: string, message: unknown }>)

const summarizer = vi.hoisted(() => {
    const pending: Array<(text: string) => void> = []
    const rejecters: Array<(error: Error) => void> = []
    return {
        pending,
        rejecters,
        run: () => new Promise<string>((resolve, reject) => { pending.push(resolve); rejecters.push(reject) }),
    }
})

const saveMarks = vi.hoisted(() => ({ marked: [] as string[] }))

vi.mock(import('src/ts/alert'), () => {
    const stub: Record<string, unknown> = {
        alertConfirm: confirms.ask,
        alertStore: writable({ type: 'none', msg: '' }),
    }
    const recorded: Record<string, unknown> = {}
    return new Proxy(stub, {
        get: (t, k) => {
            if (k in t) return t[k as string]
            if (k === 'then' || typeof k === 'symbol') return undefined
            return (recorded[k] ??= vi.fn(async (message?: unknown) => { noticeCalls.push(k); noticeMessages.push({ name: k, message }) }))
        },
        has: () => true,
    }) as unknown as typeof import('src/ts/alert')
})

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        selectedCharID: writable(0),
        hypaV3ModalOpen: writable(false),
        settingsOpen: writable(false),
        SettingsMenuIndex: writable(0),
        selIdState: { selId: -1 },
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/process/memory/hypav3'), () => ({
    summarize: vi.fn(() => summarizer.run()),
    getCurrentHypaV3Preset: vi.fn(() => ({ settings: { processRegexScript: false } })),
}) as unknown as typeof import('src/ts/process/memory/hypav3'))

vi.mock(import('src/ts/translator/translator'), () => ({
    translateHTML: vi.fn(async (text: string) => text),
}) as unknown as typeof import('src/ts/translator/translator'))

vi.mock(import('src/ts/process/scripts'), () => ({
    processScriptFull: vi.fn(),
    risuChatParser: vi.fn((text: string) => text),
}) as unknown as typeof import('src/ts/process/scripts'))

vi.mock(import('src/ts/storage/characterSaveMarks'), () => ({
    markCharacterForSave: vi.fn((chaId: string) => { saveMarks.marked.push(chaId) }),
}) as unknown as typeof import('src/ts/storage/characterSaveMarks'))

//#endregion

import { DBState, selectedCharID } from 'src/ts/stores.svelte'
import HypaV3Modal from './HypaV3Modal.svelte'

//#region fixtures and helpers

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function settle(): Promise<void> {
    await sleep(20)
    flushSync()
}

function summary(text: string) {
    return { text, chatMemos: ['memo-' + text], isImportant: false }
}

function chat(texts: string[]) {
    return {
        id: 'chat-' + texts.join(''), name: '', message: [], note: '', localLore: [],
        hypaV3Data: { summaries: texts.map(summary), categories: [{ id: '', name: 'none' }], lastSelectedSummaries: [] },
    }
}

function installDb(...perCharacter: string[][]): void {
    DBState.db = {
        characters: perCharacter.map((texts, i) => ({
            chaId: 'c' + i, name: 'c' + i, type: 'character', chatPage: 0, firstMessage: '', chats: [chat(texts)],
        })),
    } as unknown as Database
    selectedCharID.set(0)
}

const data = (c = 0) => DBState.db.characters[c].chats[0].hypaV3Data
const texts = (c = 0) => data(c).summaries.map((s) => s.text)

interface Mounted { target: HTMLElement, app: Record<string, unknown> }
let mounted: Mounted[] = []

function mountModal(): HTMLElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(HypaV3Modal, { target, props: {} }) as unknown as Record<string, unknown>
    mounted.push({ target, app })
    flushSync()
    return target
}

/** The summary card whose text area holds `text`. */
function card(target: HTMLElement, text: string): HTMLElement {
    const area = (Array.from(target.querySelectorAll('textarea')) as HTMLTextAreaElement[]).find((t) => !t.readOnly && t.value === text)
    if (!area) throw new Error('summary not found: ' + text)
    return area.closest('div.flex.flex-col.p-2') as HTMLElement
}

/** A card's header buttons are, in order: translate, important, reroll, delete this, delete after. */
function cardButtons(target: HTMLElement, text: string): HTMLButtonElement[] {
    const header = card(target, text).firstElementChild as HTMLElement
    return Array.from((header.lastElementChild as HTMLElement).querySelectorAll('button')) as HTMLButtonElement[]
}

async function clickDeleteThis(target: HTMLElement, text: string): Promise<void> {
    cardButtons(target, text)[3].click()
    await settle()
}

async function clickDeleteAfter(target: HTMLElement, text: string): Promise<void> {
    cardButtons(target, text)[4].click()
    await settle()
}

/** The modal header's own buttons are, in order: search, important filter, bulk edit, categories, settings, close. */
function headerButtons(target: HTMLElement): HTMLButtonElement[] {
    const bar = target.querySelector('h1')!.nextElementSibling as HTMLElement
    return Array.from(bar.querySelectorAll(':scope > button')) as HTMLButtonElement[]
}

async function toggleBulkEdit(target: HTMLElement): Promise<void> {
    headerButtons(target)[2].click()
    await settle()
}

async function openResetFromMenu(target: HTMLElement): Promise<void> {
    const more = target.querySelector('div.relative > button') as HTMLButtonElement
    more.click()
    await settle()
    const menu = target.querySelector('div.absolute.right-0') as HTMLElement
    const buttons = Array.from(menu.querySelectorAll('button')) as HTMLButtonElement[]
    buttons[buttons.length - 1].click()
    await settle()
}

async function tick(target: HTMLElement, text: string): Promise<void> {
    const box = card(target, text).querySelector('input[type=checkbox]') as HTMLInputElement
    box.click()
    await settle()
}

const checkedTexts = (target: HTMLElement) => (Array.from(target.querySelectorAll('textarea')) as HTMLTextAreaElement[])
    .filter((t) => !t.readOnly)
    .filter((t) => (t.closest('div.flex.flex-col.p-2')!.querySelector('input[type=checkbox]') as HTMLInputElement | null)?.checked)
    .map((t) => t.value)

function bulkButton(target: HTMLElement, label: string): HTMLButtonElement | undefined {
    return (Array.from(target.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent?.trim() === label.trim())
}

async function resummarize(target: HTMLElement): Promise<void> {
    bulkButton(target, language.hypaV3Modal.reSummarize)!.click()
    await settle()
}

async function finishSummarizer(text: string): Promise<void> {
    summarizer.rejecters.shift()
    const resolve = summarizer.pending.shift()
    if (!resolve) throw new Error('the summarizer is not running')
    resolve(text)
    await settle()
}

/** The apply button of the re-summarize result bar, if the bar is shown. */
function applyResult(target: HTMLElement): HTMLButtonElement | undefined {
    return (Array.from(target.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.title === language.apply)
}

async function answer(value: boolean): Promise<void> {
    const next = confirms.pending.shift()
    if (!next) throw new Error('no confirmation is open')
    next.settle(value)
    await settle()
}

beforeEach(() => {
    confirms.pending.length = 0
    summarizer.pending.length = 0
    summarizer.rejecters.length = 0
    noticeCalls.length = 0
    noticeMessages.length = 0
    saveMarks.marked.length = 0
})

afterEach(async () => {
    for (const m of mounted) {
        await unmount(m.app as never)
        m.target.remove()
    }
    mounted = []
})

const four = () => ['s0', 's1', 's2', 's3']

//#endregion

describe('a summary "delete this"', () => {
    test('guard: with nothing else changing, the confirmed summary is removed and no other', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteThis(target, 's1')
        expect(confirms.pending.length).toBe(1)
        await answer(true)
        expect(texts()).toEqual(['s0', 's2', 's3'])
    })

    test('guard: refusing the confirmation removes nothing', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteThis(target, 's1')
        await answer(false)
        expect(texts()).toEqual(four())
    })

    test('guard: a summary inserted above it while the confirmation is open does not change which summary is removed', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteThis(target, 's2')
        data().summaries.unshift(summary('new'))
        flushSync()
        await answer(true)
        expect(texts()).toEqual(['new', 's0', 's1', 's3'])
    })

    test('two pending deletes of the same summary remove it once', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteThis(target, 's1')
        await clickDeleteThis(target, 's1')
        expect(confirms.pending.length).toBe(2)
        await answer(true)
        await answer(true)
        expect(texts()).toEqual(['s0', 's2', 's3'])
    })

    test('a summary removed by something else while its confirmation is open leaves every other summary in place', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteThis(target, 's1')
        data().summaries.splice(1, 1)
        flushSync()
        await answer(true)
        expect(texts()).toEqual(['s0', 's2', 's3'])
    })

    test('guard: summaries replaced wholesale while the confirmation is open (a send writing its result back) are left as they are', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteThis(target, 's1')
        DBState.db.characters[0].chats[0].hypaV3Data = { summaries: ['t0', 't1', 't2', 't3'].map(summary) } as never
        flushSync()
        await answer(true)
        expect(texts()).toEqual(['t0', 't1', 't2', 't3'])
    })

    test('a removal clears the bulk selection', async () => {
        installDb(['s0', 's1', 's2', 's3', 's4'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tick(target, 's2')
        await tick(target, 's3')
        expect(checkedTexts(target)).toEqual(['s2', 's3'])
        await clickDeleteThis(target, 's0')
        await answer(true)
        expect(checkedTexts(target)).toEqual([])
    })
})

describe('a summary "delete after"', () => {
    test('guard: with nothing else changing, everything after the confirmed summary is removed', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteAfter(target, 's1')
        await answer(true)
        await answer(true)
        expect(texts()).toEqual(['s0', 's1'])
    })

    test('guard: refusing either confirmation removes nothing', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteAfter(target, 's1')
        await answer(true)
        await answer(false)
        expect(texts()).toEqual(four())
    })

    test('guard: a summary inserted above it while the confirmations are open does not change which summaries are removed', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteAfter(target, 's1')
        await answer(true)
        data().summaries.unshift(summary('new'))
        flushSync()
        await answer(true)
        expect(texts()).toEqual(['new', 's0', 's1'])
    })

    test('a summary removed by something else while its confirmations are open removes nothing', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteAfter(target, 's1')
        await answer(true)
        data().summaries.splice(1, 1)
        flushSync()
        await answer(true)
        expect(texts()).toEqual(['s0', 's2', 's3'])
    })

    test('guard: summaries replaced wholesale while the confirmations are open (a send writing its result back) are left as they are', async () => {
        installDb(four())
        const target = mountModal()
        await clickDeleteAfter(target, 's1')
        await answer(true)
        DBState.db.characters[0].chats[0].hypaV3Data = { summaries: ['t0', 't1', 't2', 't3'].map(summary) } as never
        flushSync()
        await answer(true)
        expect(texts()).toEqual(['t0', 't1', 't2', 't3'])
    })
})

describe('the bulk re-summarize apply', () => {
    async function selectAndResummarize(target: HTMLElement, selected: string[], result = 'merged'): Promise<void> {
        await toggleBulkEdit(target)
        for (const text of selected) await tick(target, text)
        await resummarize(target)
        await finishSummarizer(result)
    }

    test('guard: applying merges the selected summaries into the first of them and removes the others', async () => {
        installDb(['s0', 's1', 's2', 's3', 's4', 's5'])
        const target = mountModal()
        await selectAndResummarize(target, ['s3', 's4'])
        applyResult(target)!.click()
        await settle()
        expect(texts()).toEqual(['s0', 's1', 's2', 'merged', 's5'])
    })

    test('after a summary above the selection is deleted, applying never overwrites or removes a summary that was not selected', async () => {
        installDb(['s0', 's1', 's2', 's3', 's4', 's5'])
        const target = mountModal()
        await selectAndResummarize(target, ['s3', 's4'])
        await clickDeleteThis(target, 's0')
        await answer(true)
        applyResult(target)?.click()
        await settle()
        expect(texts()).toEqual(['s1', 's2', 's3', 's4', 's5'])
    })

    test('a selected summary removed while the summarizer runs leaves every summary as it is and says so', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tick(target, 's1')
        await tick(target, 's2')
        await resummarize(target)
        data().summaries.splice(2, 1)
        flushSync()
        await finishSummarizer('merged')
        noticeCalls.length = 0
        applyResult(target)?.click()
        await settle()
        expect(texts()).toEqual(['s0', 's1', 's3'])
        expect(noticeCalls.length, 'a notice is shown (any alert call other than the confirm)').toBeGreaterThan(0)
    })
})

describe('the HypaV3 reset', () => {
    test('guard: a confirmed reset empties the current chat\'s summaries', async () => {
        installDb(four(), ['u0'])
        const target = mountModal()
        await openResetFromMenu(target)
        expect(confirms.pending.length).toBe(1)
        await answer(true)
        await answer(true)
        expect(texts(0)).toEqual([])
        expect(texts(1)).toEqual(['u0'])
    })

    test('guard: refusing a confirmation resets nothing', async () => {
        installDb(four())
        const target = mountModal()
        await openResetFromMenu(target)
        await answer(true)
        await answer(false)
        expect(texts()).toEqual(four())
    })

    test('a selection that moves to another character during the confirmations resets the character the user aimed at and leaves the new one alone', async () => {
        installDb(four(), ['u0', 'u1'])
        const target = mountModal()
        await openResetFromMenu(target)
        await answer(true)
        selectedCharID.set(1)
        flushSync()
        await answer(true)
        expect(texts(1)).toEqual(['u0', 'u1'])
        expect(texts(0)).toEqual([])
    })

    test('a reset of a character that has been deselected marks that character for save', async () => {
        installDb(four(), ['u0', 'u1'])
        const target = mountModal()
        await openResetFromMenu(target)
        await answer(true)
        selectedCharID.set(1)
        flushSync()
        await answer(true)
        expect(saveMarks.marked).toEqual(['c0'])
    })

    test('a character removed during the confirmations resets nothing', async () => {
        installDb(four(), ['u0', 'u1'])
        const target = mountModal()
        await openResetFromMenu(target)
        await answer(true)
        DBState.db.characters.splice(0, 1)
        flushSync()
        await answer(true)
        expect(texts(0)).toEqual(['u0', 'u1'])
    })

    test('a chat that has left the character during the confirmations resets nothing', async () => {
        installDb(four())
        const target = mountModal()
        await openResetFromMenu(target)
        await answer(true)
        DBState.db.characters[0].chats[0] = chat(['v0', 'v1']) as never
        flushSync()
        await answer(true)
        expect(texts(0)).toEqual(['v0', 'v1'])
    })
})

//#region bulk run helpers

/** Finishes the summarizer call that was started `index`-th among those still running. */
async function finishSummarizerAt(index: number, text: string): Promise<void> {
    summarizer.rejecters.splice(index, 1)
    const [resolve] = summarizer.pending.splice(index, 1)
    if (!resolve) throw new Error('no summarizer call at ' + index)
    resolve(text)
    await settle()
}

function resultBarShown(target: HTMLElement): boolean {
    return Array.from(target.querySelectorAll('h3')).some((h) => h.textContent?.trim() === language.hypaV3Modal.reSummarizeResult.trim())
}

/** The text the result bar shows, or null while it shows none. */
function resultText(target: HTMLElement): string | null {
    const area = (Array.from(target.querySelectorAll('textarea')) as HTMLTextAreaElement[]).find((t) => t.readOnly && t.value !== '')
    return area ? area.value : null
}

function resultButton(target: HTMLElement, title: string): HTMLButtonElement {
    const button = (Array.from(target.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.title === title)
    if (!button) throw new Error('result bar button not shown: ' + title)
    return button
}

async function cancelResult(target: HTMLElement): Promise<void> {
    resultButton(target, language.cancel).click()
    await settle()
}

async function rerollResult(target: HTMLElement): Promise<void> {
    resultButton(target, language.hypaV3Modal.retry).click()
    await settle()
}

/** True when applying is possible right now. */
function canApply(target: HTMLElement): boolean {
    const button = applyResult(target)
    return !!button && !button.disabled
}

async function tickBulk(target: HTMLElement, ...selected: string[]): Promise<void> {
    for (const text of selected) await tick(target, text)
}

//#endregion

describe('the bulk re-summarize and re-roll runs', () => {
    test('a re-roll that returns after Cancel shows no result bar and writes nothing', async () => {
        installDb(four())
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's1', 's2')
        await resummarize(target)
        await finishSummarizerAt(0, 'merged')
        await rerollResult(target)
        expect(summarizer.pending.length).toBe(1)
        await cancelResult(target)
        await finishSummarizerAt(0, 'late reroll')
        expect(resultBarShown(target)).toBe(false)
        expect(texts()).toEqual(four())
    })

    test('guard: fewer than two selected summaries left starts no summarizer call', async () => {
        installDb(four())
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's2', 's3')
        data().summaries.splice(3, 1)
        flushSync()
        await resummarize(target)
        expect(summarizer.pending.length).toBe(0)
        expect(resultBarShown(target)).toBe(false)
        expect(texts()).toEqual(['s0', 's1', 's2'])
    })

    test('guard: with fewer than two selected summaries left, re-summarize reports a failure', async () => {
        installDb(four())
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's2', 's3')
        data().summaries.splice(3, 1)
        flushSync()
        await resummarize(target)
        const failures = noticeMessages.filter((n) => n.name === 'alertNormalWait')
        expect(failures.length).toBe(1)
        expect(String(failures[0].message)).toMatch(/^Re-summarize Failed: /)
    })

    test('a summary delete while a re-summarize runs drops its result when the summarizer returns', async () => {
        installDb(['s0', 's1', 's2', 's3', 's4'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's2', 's3')
        await resummarize(target)
        await clickDeleteThis(target, 's0')
        await answer(true)
        await finishSummarizerAt(0, 'late result')
        expect(resultBarShown(target)).toBe(false)
        expect(canApply(target)).toBe(false)
        expect(texts()).toEqual(['s1', 's2', 's3', 's4'])
    })

    test('a summary delete while a re-roll runs drops its result when the summarizer returns', async () => {
        installDb(['s0', 's1', 's2', 's3', 's4'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's2', 's3')
        await resummarize(target)
        await finishSummarizerAt(0, 'merged')
        await rerollResult(target)
        await clickDeleteThis(target, 's0')
        await answer(true)
        await finishSummarizerAt(0, 'late reroll')
        expect(resultBarShown(target)).toBe(false)
        expect(texts()).toEqual(['s1', 's2', 's3', 's4'])
    })

    test('a new selection while a re-summarize runs drops that run\'s result when the summarizer returns', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's1', 's2')
        await resummarize(target)
        await tick(target, 's3')
        await finishSummarizerAt(0, 'late result')
        expect(canApply(target)).toBe(false)
        expect(texts()).toEqual(['s0', 's1', 's2', 's3'])
    })

    test('Cancel then a new re-summarize: the cancelled run\'s result, returning after the new one, does not replace it', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's0', 's1')
        await resummarize(target)
        await cancelResult(target)
        await tickBulk(target, 's2', 's3')
        await resummarize(target)
        expect(summarizer.pending.length).toBe(2)
        await finishSummarizerAt(1, 'NEW')
        await finishSummarizerAt(0, 'OLD')
        expect(resultText(target)).toBe('NEW')
        applyResult(target)!.click()
        await settle()
        expect(texts()).toEqual(['s0', 's1', 'NEW'])
    })

    test('Cancel then a new re-summarize: the cancelled run\'s result, returning first, is not offered for the new selection', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's0', 's1')
        await resummarize(target)
        await cancelResult(target)
        await tickBulk(target, 's2', 's3')
        await resummarize(target)
        await finishSummarizerAt(0, 'OLD')
        expect(canApply(target)).toBe(false)
        await finishSummarizerAt(0, 'NEW')
        expect(resultText(target)).toBe('NEW')
    })

    test('a re-roll that returns after Cancel and a new re-summarize does not offer its text for the new selection', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await toggleBulkEdit(target)
        await tickBulk(target, 's1', 's2')
        await resummarize(target)
        await finishSummarizerAt(0, 'FIRST')
        await rerollResult(target)
        await cancelResult(target)
        await tickBulk(target, 's0', 's3')
        await resummarize(target)
        await finishSummarizerAt(0, 'REROLL')
        expect(canApply(target)).toBe(false)
        await finishSummarizerAt(0, 'NEW')
        applyResult(target)!.click()
        await settle()
        expect(texts()).toEqual(['NEW', 's1', 's2'])
    })
})

/** Fails the summarizer call that was started `index`-th among those still running. */
async function failSummarizerAt(index: number, message: string): Promise<void> {
    summarizer.pending.splice(index, 1)
    const [reject] = summarizer.rejecters.splice(index, 1)
    if (!reject) throw new Error('no summarizer call at ' + index)
    reject(new Error(message))
    await settle()
}

const failureNotices = () => noticeMessages.filter((n) => n.name === 'alertNormalWait')

describe('the bulk run supersession rules', () => {
    async function runningSelection(target: HTMLElement, ...selected: string[]): Promise<void> {
        await toggleBulkEdit(target)
        await tickBulk(target, ...selected)
        await resummarize(target)
    }

    test('a re-summarize whose summarizer call fails after Cancel and a new run neither alerts nor disturbs the new run', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await runningSelection(target, 's0', 's1')
        await cancelResult(target)
        await tickBulk(target, 's2', 's3')
        await resummarize(target)
        await failSummarizerAt(0, 'late failure')
        expect(failureNotices()).toEqual([])
        expect(resultBarShown(target)).toBe(true)
        await finishSummarizerAt(0, 'NEW')
        expect(resultText(target)).toBe('NEW')
    })

    test('a re-roll whose summarizer call fails after Cancel and a new run neither alerts nor disturbs the new run', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await runningSelection(target, 's1', 's2')
        await finishSummarizerAt(0, 'FIRST')
        await rerollResult(target)
        await cancelResult(target)
        await tickBulk(target, 's0', 's3')
        await resummarize(target)
        await failSummarizerAt(0, 'late failure')
        expect(failureNotices()).toEqual([])
        expect(resultBarShown(target)).toBe(true)
        await finishSummarizerAt(0, 'NEW')
        expect(resultText(target)).toBe('NEW')
    })

    test('two re-summarize clicks without Cancel offer only the second run\'s result', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await runningSelection(target, 's0', 's1')
        await resummarize(target)
        expect(summarizer.pending.length).toBe(2)
        await finishSummarizerAt(1, 'SECOND')
        await finishSummarizerAt(0, 'FIRST')
        expect(resultText(target)).toBe('SECOND')
    })

    test('ticking a summary during a run removes the processing bar', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await runningSelection(target, 's1', 's2')
        expect(resultBarShown(target)).toBe(true)
        await tick(target, 's3')
        expect(resultBarShown(target)).toBe(false)
    })

    test('guard: ticking a summary while a finished result is shown keeps that result', async () => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await runningSelection(target, 's1', 's2')
        await finishSummarizerAt(0, 'merged')
        await tick(target, 's3')
        expect(resultBarShown(target)).toBe(true)
        expect(resultText(target)).toBe('merged')
        expect(canApply(target)).toBe(true)
    })

    const supersedes: Array<[string, (target: HTMLElement) => Promise<void>]> = [
        ['Cancel alone', async (target) => { await cancelResult(target) }],
        ['Clear selection', async (target) => {
            bulkButton(target, language.cancel)!.click()
            await settle()
        }],
        ['turning bulk mode off', async (target) => { await toggleBulkEdit(target) }],
        ['the parsed selection input', async (target) => {
            const input = target.querySelector('input[placeholder="1,3,5-8"]') as HTMLInputElement
            input.value = '1'
            input.dispatchEvent(new Event('input', { bubbles: true }))
            await settle()
            bulkButton(target, language.select)!.click()
            await settle()
        }],
    ]

    test.each(supersedes)('%s supersedes the run in flight, so its result is not shown when the summarizer returns', async (_name, act) => {
        installDb(['s0', 's1', 's2', 's3'])
        const target = mountModal()
        await runningSelection(target, 's1', 's2')
        await act(target)
        expect(resultBarShown(target)).toBe(false)
        await finishSummarizerAt(0, 'late result')
        expect(resultBarShown(target)).toBe(false)
        expect(texts()).toEqual(['s0', 's1', 's2', 's3'])
    })
})