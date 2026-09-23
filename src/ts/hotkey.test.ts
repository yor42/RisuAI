import { writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// This file exercises the real document keydown listener registered by
// initHotkey() in hotkey.ts, to catch a regression where the
// shouldYieldToFocusedControl(...) guard call in front of the hotkey loop
// gets deleted. hotkey.ts pulls in a very heavy import graph (Tauri
// plugins, AI providers, drive sync, etc. via storage/database.svelte and
// process/index.svelte), so every module it imports directly is replaced
// with a minimal stand-in here, matching the mocking pattern used in
// src/ts/storage/tests/dbChangeEffects.svelte.test.ts and
// src/ts/parser/tests/chatVar.svelte.test.ts.

//#region module mocks

vi.mock(import('./storage/database.svelte'), () => {
    return {
        getDatabase: () => ({}),
        changeToPreset: vi.fn(),
    } as unknown as typeof import('./storage/database.svelte')
})

vi.mock(import('./stores.svelte'), () => {
    return {
        alertStore: writable({ type: 'none', msg: '' }),
        DBState: { db: {} as unknown },
        loadoutModalStore: { open: false },
        MobileGUIStack: writable(0),
        MobileSideBar: writable(0),
        openPersonaList: writable(false),
        openPresetList: writable(false),
        OpenRealmStore: writable(false),
        PlaygroundStore: writable(0),
        QuickSettings: { open: false, index: 0 },
        SafeModeStore: writable(false),
        selectedCharID: writable(-1),
        settingsOpen: writable(false),
    } as unknown as typeof import('./stores.svelte')
})

vi.mock(import('./alert'), () => {
    return {
        alertMd: vi.fn(),
        alertSelect: vi.fn(),
        alertToast: vi.fn(),
        alertWait: vi.fn(),
        doingAlert: () => false,
        alertRequestLogs: vi.fn(),
    } as unknown as typeof import('./alert')
})

vi.mock(import('./gui/colorscheme'), () => {
    return {
        updateTextThemeAndCSS: vi.fn(),
    } as unknown as typeof import('./gui/colorscheme')
})

vi.mock(import('./process/index.svelte'), () => {
    return {
        doingChat: writable(false),
        previewBody: '',
        sendChat: vi.fn(),
    } as unknown as typeof import('./process/index.svelte')
})

//#endregion

import { initHotkey } from './hotkey'

let button: HTMLButtonElement
let matchesSpy: ReturnType<typeof vi.spyOn>

function dispatchBareSpace(): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
    })
    button.dispatchEvent(ev)
    return ev
}

beforeEach(() => {
    button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    initHotkey()
})

afterEach(() => {
    matchesSpy?.mockRestore()
    button.remove()
})

describe('initHotkey wiring to shouldYieldToFocusedControl', () => {
    test('bare Space on a keyboard-focused button is left alone (not prevented)', () => {
        matchesSpy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
            return selector === ':focus-visible' && this === button
        })

        const ev = dispatchBareSpace()

        expect(ev.defaultPrevented).toBe(false)
    })

    test('bare Space on a mouse-focused button still gets prevented, preserving default hotkey behaviour', () => {
        matchesSpy = vi.spyOn(Element.prototype, 'matches').mockImplementation(() => false)

        const ev = dispatchBareSpace()

        expect(ev.defaultPrevented).toBe(true)
    })
})
