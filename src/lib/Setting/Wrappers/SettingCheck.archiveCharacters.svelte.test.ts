// @vitest-environment happy-dom

/**
 * The "archive characters" checkbox is the real `adv.coldstorage` item from
 * `advancedSettingsData.ts`, rendered by the real `SettingCheck.svelte`, over a
 * reactive stand-in for `DBState`.
 *
 * It is bound to the root opt-out key `archiveCharacters`, which has three
 * states: absent (archiving on), `true` and `false`. The root `coldstorage`
 * field is a separate, legacy switch and is never read or written by the
 * checkbox.
 *
 * Invariants exercised here:
 * - The checkbox reads checked for an absent key and for `true`, unchecked for
 *   `false`, whatever root `coldstorage` holds.
 * - Rendering the checkbox writes nothing: an absent key stays absent.
 * - Unchecking writes `archiveCharacters: false`, checking writes `true`, and
 *   neither touches root `coldstorage`.
 *
 * MOCKED: `src/ts/platform` (a web build), `src/ts/alert` (`alertMd` only) and
 * `src/ts/stores.svelte` (a thin
 * `$state` stand-in, so the write-back effect in `SettingCheck.svelte` has a
 * reactive object to read and write) and every settings data file except
 * `advancedSettingsData.ts` (emptied lists; `src/ts/setting/utils` imports them
 * only to build the full settings list). `src/ts/setting/utils`, `advancedSettingsData.ts`,
 * `src/lang` and `CheckInput.svelte` are real.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import type { Database } from 'src/ts/storage/database.svelte'
import type { SettingContext, SettingItem } from 'src/ts/setting/types'

//#region module mocks

vi.mock(import('src/ts/platform'), () => ({
    isTauri: false,
    isNodeServer: false,
}) as unknown as typeof import('src/ts/platform'))

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: {} as unknown as Database })
    return {
        DBState: state,
    } as unknown as typeof import('src/ts/stores.svelte')
})

// `Help.svelte`, rendered next to the checkbox, imports `alertMd` only for its
// click handler.
vi.mock(import('src/ts/alert'), () => ({
    alertMd: vi.fn(),
}) as unknown as typeof import('src/ts/alert'))

// `src/ts/setting/utils` imports every settings data file only to build the
// full settings list; the other files pull in the whole application graph and are not
// exercised here.
vi.mock(import('src/ts/setting/accessibilitySettingsData'), () => ({
    accessibilitySettingsItems: [],
}) as unknown as typeof import('src/ts/setting/accessibilitySettingsData'))

vi.mock(import('src/ts/setting/botSettingsParamsData'), () => ({
    basicParameterItems: [],
    modelSpecificParameterItems: [],
    penaltyParameterItems: [],
    samplingParameterItems: [],
    seedSetting: [],
}) as unknown as typeof import('src/ts/setting/botSettingsParamsData'))

vi.mock(import('src/ts/setting/chatFormatSettingsData'), () => ({
    chatFormatSettingsItems: [],
}) as unknown as typeof import('src/ts/setting/chatFormatSettingsData'))

vi.mock(import('src/ts/setting/displaySettingsData.svelte'), () => ({
    displaySettingsItems: [],
}) as unknown as typeof import('src/ts/setting/displaySettingsData.svelte'))

//#endregion

import { DBState } from 'src/ts/stores.svelte'
import { advancedSettingsItems } from 'src/ts/setting/advancedSettingsData'
import { getSettingValue } from 'src/ts/setting/utils'
import SettingCheck from './SettingCheck.svelte'

/** The database fields these tests set up and read: the opt-out key and the legacy root switch. */
type ArchiveFields = { archiveCharacters?: boolean; coldstorage?: boolean }

function db(): Database & ArchiveFields {
    return DBState.db as Database & ArchiveFields
}

function installDb(fields: ArchiveFields): void {
    DBState.db = { ...fields } as unknown as Database
}

function archiveItem(): SettingItem {
    const item = advancedSettingsItems.find((candidate) => candidate.id === 'adv.coldstorage')
    if (!item) {
        throw new Error('adv.coldstorage is not in advancedSettingsItems')
    }
    return item
}

function ctx(): SettingContext {
    return { db: DBState.db } as SettingContext
}

let mounted: { target: HTMLElement; app: Record<string, unknown> } | undefined

function mountCheckbox(): HTMLInputElement {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(SettingCheck, { target, props: { item: archiveItem(), ctx: ctx() } }) as unknown as Record<string, unknown>
    mounted = { target, app }
    flushSync()
    const input = target.querySelector('input[type="checkbox"]')
    if (!(input instanceof HTMLInputElement)) {
        throw new Error('the checkbox input did not render')
    }
    return input
}

/** Sets the box the way a click does: the new state, then the `change` event. */
function userSets(input: HTMLInputElement, checked: boolean): void {
    input.checked = checked
    input.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
}

beforeEach(() => {
    installDb({})
})

afterEach(async () => {
    if (mounted) {
        await unmount(mounted.app as never)
        mounted.target.remove()
        mounted = undefined
    }
})

describe('adv.coldstorage reads the archiveCharacters key', () => {
    test('an absent key reads as checked, even when root coldstorage is false', () => {
        installDb({ coldstorage: false })

        expect(getSettingValue(archiveItem(), ctx())).toBe(true)
    })

    test('a false key reads as unchecked, even when root coldstorage is true', () => {
        installDb({ archiveCharacters: false, coldstorage: true })

        expect(getSettingValue(archiveItem(), ctx())).toBe(false)
    })

    test('a true key reads as checked, even when root coldstorage is false', () => {
        installDb({ archiveCharacters: true, coldstorage: false })

        expect(getSettingValue(archiveItem(), ctx())).toBe(true)
    })
})

describe('adv.coldstorage rendered by SettingCheck', () => {
    test('an absent key renders checked, writes nothing, and leaves root coldstorage as it was', () => {
        installDb({ coldstorage: false })

        const input = mountCheckbox()

        expect(input.checked).toBe(true)
        expect('archiveCharacters' in db()).toBe(false)
        expect(db().coldstorage).toBe(false)
    })

    test('guard: an absent key with root coldstorage true renders checked and writes nothing', () => {
        installDb({ coldstorage: true })

        const input = mountCheckbox()

        expect(input.checked).toBe(true)
        expect('archiveCharacters' in db()).toBe(false)
        expect(db().coldstorage).toBe(true)
    })

    test('a false key renders unchecked and stays false, with root coldstorage true', () => {
        installDb({ archiveCharacters: false, coldstorage: true })

        const input = mountCheckbox()

        expect(input.checked).toBe(false)
        expect(db().archiveCharacters).toBe(false)
        expect(db().coldstorage).toBe(true)
    })

    test('a true key renders checked and stays true, with root coldstorage false', () => {
        installDb({ archiveCharacters: true, coldstorage: false })

        const input = mountCheckbox()

        expect(input.checked).toBe(true)
        expect(db().archiveCharacters).toBe(true)
        expect(db().coldstorage).toBe(false)
    })

    test.each([true, false])('unchecking an absent key writes archiveCharacters false and checking again writes true; root coldstorage stays %s', (root) => {
        installDb({ coldstorage: root })
        const input = mountCheckbox()

        userSets(input, false)

        expect(db().archiveCharacters).toBe(false)
        expect(db().coldstorage).toBe(root)

        userSets(input, true)

        expect(db().archiveCharacters).toBe(true)
        expect(db().coldstorage).toBe(root)
    })

    test.each([true, false])('checking a false key writes archiveCharacters true; root coldstorage stays %s', (root) => {
        installDb({ archiveCharacters: false, coldstorage: root })
        const input = mountCheckbox()

        userSets(input, true)

        expect(db().archiveCharacters).toBe(true)
        expect(db().coldstorage).toBe(root)
    })
})
