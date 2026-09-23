import { describe, expect, test, vi } from 'vitest'
import { defaultIsKeyboardFocused, shouldYieldToFocusedControl } from './hotkeyYield'

function makeEv(key: string, mods: Partial<{ ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean }> = {}) {
    return {
        key,
        ctrlKey: mods.ctrlKey ?? false,
        altKey: mods.altKey ?? false,
        shiftKey: mods.shiftKey ?? false,
        metaKey: mods.metaKey ?? false,
    }
}

const keyboardFocused = () => true
const mouseFocused = () => false

describe('shouldYieldToFocusedControl', () => {
    test('Space + keyboard-focused BUTTON yields', () => {
        const el = document.createElement('button')
        expect(shouldYieldToFocusedControl(makeEv(' '), el, keyboardFocused)).toBe(true)
    })

    test('Space + keyboard-focused SELECT yields', () => {
        const el = document.createElement('select')
        expect(shouldYieldToFocusedControl(makeEv(' '), el, keyboardFocused)).toBe(true)
    })

    test('Space + keyboard-focused SUMMARY yields', () => {
        const el = document.createElement('summary')
        expect(shouldYieldToFocusedControl(makeEv(' '), el, keyboardFocused)).toBe(true)
    })

    test('Space + keyboard-focused role="button" element does not yield (ARIA role gets no native activation, so yielding would leave Space doing nothing)', () => {
        const el = document.createElement('div')
        el.setAttribute('role', 'button')
        expect(shouldYieldToFocusedControl(makeEv(' '), el, keyboardFocused)).toBe(false)
    })

    test('Space + keyboard-focused role="checkbox" element does not yield (ARIA role gets no native activation, so yielding would leave Space doing nothing)', () => {
        const el = document.createElement('div')
        el.setAttribute('role', 'checkbox')
        expect(shouldYieldToFocusedControl(makeEv(' '), el, keyboardFocused)).toBe(false)
    })

    test('Enter + keyboard-focused role="button" element does not yield (ARIA role gets no native activation, so yielding would leave Enter doing nothing)', () => {
        const el = document.createElement('div')
        el.setAttribute('role', 'button')
        expect(shouldYieldToFocusedControl(makeEv('Enter'), el, keyboardFocused)).toBe(false)
    })

    test('Enter + keyboard-focused role="checkbox" element does not yield (ARIA role gets no native activation, so yielding would leave Enter doing nothing)', () => {
        const el = document.createElement('div')
        el.setAttribute('role', 'checkbox')
        expect(shouldYieldToFocusedControl(makeEv('Enter'), el, keyboardFocused)).toBe(false)
    })

    test('Space + keyboard-focused <a href> does not yield (Space natively scrolls, not activates links)', () => {
        const el = document.createElement('a')
        el.setAttribute('href', '#')
        expect(shouldYieldToFocusedControl(makeEv(' '), el, keyboardFocused)).toBe(false)
    })

    test('Enter + keyboard-focused <a href> yields', () => {
        const el = document.createElement('a')
        el.setAttribute('href', '#')
        expect(shouldYieldToFocusedControl(makeEv('Enter'), el, keyboardFocused)).toBe(true)
    })

    test('Enter + <a> without href does not yield', () => {
        const el = document.createElement('a')
        expect(shouldYieldToFocusedControl(makeEv('Enter'), el, keyboardFocused)).toBe(false)
    })

    test('Space + mouse-focused button does not yield (pins the reroll-after-click hazard: clicking reroll then pressing Space must not reroll again)', () => {
        const el = document.createElement('button')
        expect(shouldYieldToFocusedControl(makeEv(' '), el, mouseFocused)).toBe(false)
    })

    test('ctrl+Space on a keyboard-focused button does not yield', () => {
        const el = document.createElement('button')
        expect(shouldYieldToFocusedControl(makeEv(' ', { ctrlKey: true }), el, keyboardFocused)).toBe(false)
    })

    test('alt+Space on a keyboard-focused button does not yield', () => {
        const el = document.createElement('button')
        expect(shouldYieldToFocusedControl(makeEv(' ', { altKey: true }), el, keyboardFocused)).toBe(false)
    })

    test('shift+Space on a keyboard-focused button does not yield', () => {
        const el = document.createElement('button')
        expect(shouldYieldToFocusedControl(makeEv(' ', { shiftKey: true }), el, keyboardFocused)).toBe(false)
    })

    test('meta+Space on a keyboard-focused button does not yield', () => {
        const el = document.createElement('button')
        expect(shouldYieldToFocusedControl(makeEv(' ', { metaKey: true }), el, keyboardFocused)).toBe(false)
    })

    test('a non-activation key on a keyboard-focused button does not yield', () => {
        const el = document.createElement('button')
        expect(shouldYieldToFocusedControl(makeEv('r'), el, keyboardFocused)).toBe(false)
    })

    test('el === null does not yield', () => {
        expect(shouldYieldToFocusedControl(makeEv(' '), null, keyboardFocused)).toBe(false)
    })

    test('el === document.body does not yield', () => {
        expect(shouldYieldToFocusedControl(makeEv(' '), document.body, keyboardFocused)).toBe(false)
    })

    test('defaultIsKeyboardFocused returns false rather than throwing when matches() throws', () => {
        const el = document.createElement('button')
        vi.spyOn(el, 'matches').mockImplementation(() => {
            throw new Error(':focus-visible not supported')
        })
        expect(defaultIsKeyboardFocused(el)).toBe(false)
    })
})
