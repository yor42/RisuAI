// @vitest-environment happy-dom

/**
 * MC-078, MC-079, MC-082. `SavePopupIcon.svelte` shows a persistent
 * indicator while any chaId is frozen against a save-file rewrite, following
 * `savingStoppedReason`'s own branch order: `savingStoppedReason` wins over
 * the duplicate-id indicator, which in turn sits before the ordinary saving
 * animation so a save in progress does not make the indicator flicker off.
 * Mount pattern follows `GridCatalog.duplicateChaId.svelte.test.ts` (same
 * directory).
 *
 * MOCKED: `src/ts/globalApi.svelte` (`saving` alone) and a reactive
 * `stores.svelte` stand-in. `src/lang` is real (a plain data module, no side
 * effects).
 */
import { flushSync, mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Database } from '../../ts/storage/database.svelte'
import type { FrozenSaveKeyInfo } from '../../ts/stores.svelte'

//#region module mocks

vi.mock(import('src/ts/globalApi.svelte'), () => {
    const saving = $state({ state: false })
    return { saving } as unknown as typeof import('src/ts/globalApi.svelte')
})

vi.mock(import('../../ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
        savingStoppedReason: writable(''),
        frozenSaveKeysStore: writable<FrozenSaveKeyInfo[]>([]),
    } as unknown as typeof import('../../ts/stores.svelte')
})

const { alertMdSpy, alertNormalSpy } = vi.hoisted(() => ({
    alertMdSpy: vi.fn(),
    alertNormalSpy: vi.fn(),
}))

vi.mock(
    import('src/ts/alert'),
    () =>
        ({
            alertMd: alertMdSpy,
            alertNormal: alertNormalSpy,
        }) as unknown as typeof import('src/ts/alert'),
)

//#endregion

import { DBState, savingStoppedReason as savingStoppedReasonStore, frozenSaveKeysStore as frozenSaveKeysStoreMock } from '../../ts/stores.svelte'
import { saving } from 'src/ts/globalApi.svelte'
import { language } from '../../lang'
import SavePopupIcon from './SavePopupIcon.svelte'

function mountIcon(): { target: HTMLElement; app: Record<string, unknown> } {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(SavePopupIcon, { target, props: {} }) as unknown as Record<string, unknown>
    return { target, app }
}

async function teardown(target: HTMLElement, app: Record<string, unknown>): Promise<void> {
    await unmount(app as never)
    target.remove()
}

beforeEach(() => {
    saving.state = false
    savingStoppedReasonStore.set('')
    frozenSaveKeysStoreMock.set([])
    DBState.db = {} as unknown as Database
    alertMdSpy.mockReset()
    alertNormalSpy.mockReset()
})

describe('SavePopupIcon shows nothing when nothing is wrong', () => {
    test('no button is rendered', async () => {
        const { target, app } = mountIcon()
        flushSync()
        expect(target.querySelector('button')).toBeNull()
        await teardown(target, app)
    })
})

describe('SavePopupIcon -- the duplicate-chaId indicator (MC-078, MC-079, MC-082)', () => {
    test('shows the indicator while a chaId is frozen, and clicking it reports the paused names', async () => {
        frozenSaveKeysStoreMock.set([{ chaId: 'dup-1', names: ['A', 'B'] }])
        const { target, app } = mountIcon()
        flushSync()

        const button = target.querySelector('button')
        expect(button).not.toBeNull()
        button!.click()
        flushSync()

        expect(alertNormalSpy).toHaveBeenCalledTimes(1)
        expect(alertNormalSpy.mock.calls[0][0]).toBe(language.duplicateChaIdSavePausedMessage('A and B'))

        await teardown(target, app)
    })

    test('two frozen ids are reported as separate groups, joined by "; "', async () => {
        frozenSaveKeysStoreMock.set([
            { chaId: 'dup-1', names: ['A', 'B'] },
            { chaId: 'dup-2', names: ['C', 'D'] },
        ])
        const { target, app } = mountIcon()
        flushSync()

        const button = target.querySelector('button')
        expect(button).not.toBeNull()
        button!.click()
        flushSync()

        expect(alertNormalSpy).toHaveBeenCalledTimes(1)
        expect(alertNormalSpy.mock.calls[0][0]).toBe(language.duplicateChaIdSavePausedMessage('A and B; C and D'))

        await teardown(target, app)
    })

    test('clears once no chaId is frozen', async () => {
        frozenSaveKeysStoreMock.set([{ chaId: 'dup-1', names: ['A', 'B'] }])
        const { target, app } = mountIcon()
        flushSync()
        expect(target.querySelector('button')).not.toBeNull()

        frozenSaveKeysStoreMock.set([])
        flushSync()
        expect(target.querySelector('button')).toBeNull()

        await teardown(target, app)
    })

    test('savingStoppedReason wins over the duplicate-chaId indicator', async () => {
        savingStoppedReasonStore.set('stay')
        frozenSaveKeysStoreMock.set([{ chaId: 'dup-1', names: ['A', 'B'] }])
        const { target, app } = mountIcon()
        flushSync()

        const buttons = target.querySelectorAll('button')
        expect(buttons.length).toBe(1)
        buttons[0].click()
        flushSync()

        // savingStoppedReason's own branch (alertNormal with the stay message),
        // not the duplicate-chaId message.
        expect(alertNormalSpy).toHaveBeenCalledTimes(1)
        expect(alertNormalSpy.mock.calls[0][0]).not.toBe(language.duplicateChaIdSavePausedMessage('A and B'))

        await teardown(target, app)
    })

    test('the duplicate-chaId indicator wins over the ordinary saving animation, so a save in progress does not hide it', async () => {
        DBState.db = { showSavingIcon: true } as unknown as Database
        saving.state = true
        frozenSaveKeysStoreMock.set([{ chaId: 'dup-1', names: ['A', 'B'] }])
        const { target, app } = mountIcon()
        flushSync()

        const buttons = target.querySelectorAll('button')
        expect(buttons.length).toBe(1)

        await teardown(target, app)
    })

    test('the ordinary saving animation still shows once no chaId is frozen and nothing else is wrong', async () => {
        DBState.db = { showSavingIcon: true } as unknown as Database
        saving.state = true
        const { target, app } = mountIcon()
        flushSync()

        expect(target.querySelector('button')).toBeNull()
        expect(target.textContent).toBe('')
        expect(target.querySelector('div.saving-animation')).not.toBeNull()

        await teardown(target, app)
    })
})
