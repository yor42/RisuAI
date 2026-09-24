import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// `openUrlOnWeb` calls the real `allowNextBeforeUnload` for a mailto:/tel:
// handoff; that side effect on `beforeunload` handling is covered end to end
// (together with the real `preload.ts` listener) in
// `src/preload.beforeUnload.test.ts`. Mocked here so this file can assert
// purely on `openUrlOnWeb`'s own scheme dispatch -- which scheme opens a tab,
// which hands off to the OS, and which is refused -- without depending on
// `reloadGuard`'s timer state.
//
// Three cases below (an uppercase `HTTPS://` prefix, a leading-whitespace
// `  https://` URL, and a mixed-case `MaIlTo:` scheme) pin that the
// allowed-scheme decision is taken on the parser-normalised `protocol`, not
// the raw input: uppercase, leading whitespace, and mixed case each still
// take the allowed path, opening or handing off with the normalised href.
// Against a previous `openUrlOnWeb` that always did `window.open(url,
// '_blank')` with no scheme dispatch, no `noopener`, and no allowance call,
// all 18 tests in this file fail, these three included.
const { allowNextBeforeUnload } = vi.hoisted(() => ({
    allowNextBeforeUnload: vi.fn(),
}))

vi.mock(import('./reloadGuard'), () => ({
    allowNextBeforeUnload,
}))

import { openUrlOnWeb, type OpenUrlWindow } from './openUrlWeb'

type FakeWindow = OpenUrlWindow & { open: ReturnType<typeof vi.fn<(url: string, target: string, windowFeatures: string) => Window | null>> }

function makeWindow(href: string): FakeWindow {
    return {
        open: vi.fn<(url: string, target: string, windowFeatures: string) => Window | null>(() => null),
        location: { href },
    }
}

beforeEach(() => {
    allowNextBeforeUnload.mockClear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('openUrlOnWeb', () => {
    test('opens an absolute http(s) URL in a new tab with noopener and leaves the current location untouched', () => {
        const win = makeWindow('https://app.example/')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        openUrlOnWeb('https://example.com/a', win)

        expect(win.open).toHaveBeenCalledTimes(1)
        const [href, target, features] = win.open.mock.calls[0]
        expect(href).toBe('https://example.com/a')
        expect(target).toBe('_blank')
        expect(features.split(',').map(part => part.trim())).toContain('noopener')
        expect(win.location.href).toBe('https://app.example/')
        expect(warnSpy).not.toHaveBeenCalled()
    })

    test.each([
        ['HTTPS://example.com/a', 'https://example.com/a'],
        ['  https://example.com/a', 'https://example.com/a'],
    ])('opens %s using the parser-normalised href since dispatch reads the parsed protocol, not the raw prefix', (input, expectedHref) => {
        const win = makeWindow('https://app.example/')

        openUrlOnWeb(input, win)

        expect(win.open).toHaveBeenCalledTimes(1)
        const [href, target, features] = win.open.mock.calls[0]
        expect(href).toBe(expectedHref)
        expect(target).toBe('_blank')
        expect(features).toContain('noopener')
    })

    test('hands a mixed-case mailto: scheme to the OS using the parser-normalised href', () => {
        const win = makeWindow('https://app.example/')

        openUrlOnWeb('MaIlTo:a@b.c', win)

        expect(allowNextBeforeUnload).toHaveBeenCalledTimes(1)
        expect(win.open).not.toHaveBeenCalled()
        expect(win.location.href).toBe('mailto:a@b.c')
    })

    test('resolves a relative URL against the window location before opening it', () => {
        const win = makeWindow('http://host:6001/')

        openUrlOnWeb('/hub-proxy/redirect/docs/lua', win)

        expect(win.open).toHaveBeenCalledTimes(1)
        const [href, , features] = win.open.mock.calls[0]
        expect(href).toBe('http://host:6001/hub-proxy/redirect/docs/lua')
        expect(features).toContain('noopener')
    })

    test.each([
        ['mailto:a@b.c', 'mailto:a@b.c'],
        ['MAILTO:a@b.c', 'mailto:a@b.c'],
        ['tel:+123', 'tel:+123'],
    ])('hands %s to the OS from the current tab after allowing the next beforeunload', (input, expectedHref) => {
        const win = makeWindow('https://app.example/')

        openUrlOnWeb(input, win)

        expect(allowNextBeforeUnload).toHaveBeenCalledTimes(1)
        expect(win.open).not.toHaveBeenCalled()
        expect(win.location.href).toBe(expectedHref)
    })

    test.each([
        ['javascript:alert(1)?code=SECRET', 'javascript:'],
        ['JavaScript:x?code=SECRET', 'javascript:'],
        ['  javascript:x?code=SECRET', 'javascript:'],
        ['java\tscript:x?code=SECRET', 'javascript:'],
        ['data:text/html,x?code=SECRET', 'data:'],
        ['blob:https://example.com/uuid?code=SECRET', 'blob:'],
        ['vbscript:x?code=SECRET', 'vbscript:'],
        ['file:///etc/passwd?code=SECRET', 'file:'],
        ['foo:bar?code=SECRET', 'foo:'],
    ])('refuses a URL with scheme %s without leaking its path or query into the warning', (input, expectedScheme) => {
        const win = makeWindow('https://app.example/')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        openUrlOnWeb(input, win)

        expect(win.open).not.toHaveBeenCalled()
        expect(win.location.href).toBe('https://app.example/')
        expect(allowNextBeforeUnload).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const [message] = warnSpy.mock.calls[0]
        expect(message).toContain(expectedScheme)
        expect(message).not.toContain('SECRET')
    })

    test('refuses a URL the parser rejects outright, without opening anything or naming it', () => {
        const win = makeWindow('https://app.example/')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        openUrlOnWeb('http://[', win)

        expect(win.open).not.toHaveBeenCalled()
        expect(win.location.href).toBe('https://app.example/')
        expect(allowNextBeforeUnload).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy.mock.calls[0][0]).not.toContain('[')
    })
})
