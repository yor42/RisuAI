// @vitest-environment happy-dom

/**
 * I15 (Agents/Reports/28-risuaccount-removal-plan.md).
 * `StorageMaintenanceSettings.svelte` hosts the two panels merged into the
 * "Backup & Files" tab (MC-088): the Asset Cache Integrity panel, gated
 * `!isTauri`, and the OPFS "Local Storage Backend" switch, gated
 * `!isTauri && !isNodeServer && opfsSupported` (`opfsSupported` reads
 * `navigator.storage.getDirectory`, `FileSystemFileHandle.prototype.createWritable`
 * and `navigator.locks` off the live browser environment at mount time, so a
 * fresh mount after changing those globals observes the change).
 *
 * MOCKED: `src/ts/platform` (`isTauri`/`isNodeServer`, both mutable getters
 * backed by a hoisted flag), `src/ts/stores.svelte` (`DBState`, a thin
 * reactive stand-in so `Check`'s `bind:check={DBState.db.checkCorruption}`
 * has somewhere to write) and `src/ts/storage/storageMaintenance` (every
 * export the component calls, as plain spies -- this file asserts only on
 * which panels render, not on the panels' own logic, which
 * `storageMaintenanceOpfs.test.ts` and `storageMaintenanceAssetIntegrity.test.ts`
 * cover directly). `src/lang` and `src/lib/UI/GUI/CheckInput.svelte` are
 * real: both are plain, dependency-light modules.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import type { Database } from 'src/ts/storage/database.svelte'

//#region module mocks

const platformState = vi.hoisted(() => ({ isTauri: false, isNodeServer: false }))

vi.mock(import('src/ts/platform'), () => ({
    get isTauri() { return platformState.isTauri },
    get isNodeServer() { return platformState.isNodeServer },
}) as unknown as typeof import('src/ts/platform'))

vi.mock(import('src/ts/stores.svelte'), () => {
    const state = $state({ db: { checkCorruption: false } as unknown as Database })
    return {
        DBState: state,
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/storage/storageMaintenance'), () => ({
    verifyAssetIntegrity: vi.fn(async () => {}),
    isOpfsEnabled: vi.fn(() => false),
    enableOpfs: vi.fn(async () => {}),
    disableOpfs: vi.fn(async () => {}),
}) as unknown as typeof import('src/ts/storage/storageMaintenance'))

//#endregion

import { language } from 'src/lang'
import StorageMaintenanceSettings from './StorageMaintenanceSettings.svelte'

/** Grants every global `opfsSupported` reads: `navigator.storage.getDirectory`,
 *  `FileSystemFileHandle.prototype.createWritable` and `navigator.locks`. */
function grantOpfsSupport(): void {
    Object.defineProperty(window.navigator, 'storage', {
        value: { getDirectory: vi.fn(async () => ({})) },
        configurable: true,
    })
    Object.defineProperty(window.navigator, 'locks', {
        value: {},
        configurable: true,
    })
    ;(globalThis as unknown as { FileSystemFileHandle: { prototype: { createWritable: () => Promise<unknown> } } }).FileSystemFileHandle = {
        prototype: {
            createWritable: async () => ({}),
        },
    }
}

/** Leaves every global `opfsSupported` reads absent, as a plain static build
 *  without OPFS support would. */
function revokeOpfsSupport(): void {
    Object.defineProperty(window.navigator, 'storage', { value: undefined, configurable: true })
    Object.defineProperty(window.navigator, 'locks', { value: undefined, configurable: true })
    delete (globalThis as unknown as { FileSystemFileHandle?: unknown }).FileSystemFileHandle
}

function mountPanel(): { target: HTMLElement; app: Record<string, unknown> } {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(StorageMaintenanceSettings, { target, props: {} }) as unknown as Record<string, unknown>
    return { target, app }
}

async function teardown(target: HTMLElement, app: Record<string, unknown>): Promise<void> {
    await unmount(app as never)
    target.remove()
}

function hasIntegrityPanel(target: HTMLElement): boolean {
    return target.textContent?.includes(language.assetIntegrityHeading) ?? false
}

function hasOpfsPanel(target: HTMLElement): boolean {
    return target.textContent?.includes(language.opfsBackendHeading) ?? false
}

beforeEach(() => {
    platformState.isTauri = false
    platformState.isNodeServer = false
    revokeOpfsSupport()
})

afterEach(() => {
    revokeOpfsSupport()
})

describe('StorageMaintenanceSettings gates its two panels per build (I15)', () => {
    test('Tauri: neither panel renders', async () => {
        platformState.isTauri = true
        grantOpfsSupport()

        const { target, app } = mountPanel()
        flushSync()

        expect(hasIntegrityPanel(target)).toBe(false)
        expect(hasOpfsPanel(target)).toBe(false)

        await teardown(target, app)
    })

    test('Node: the integrity panel renders, the OPFS panel does not', async () => {
        platformState.isNodeServer = true
        grantOpfsSupport()

        const { target, app } = mountPanel()
        flushSync()

        expect(hasIntegrityPanel(target)).toBe(true)
        expect(hasOpfsPanel(target)).toBe(false)

        await teardown(target, app)
    })

    test('static with OPFS support: both panels render', async () => {
        grantOpfsSupport()

        const { target, app } = mountPanel()
        flushSync()

        expect(hasIntegrityPanel(target)).toBe(true)
        expect(hasOpfsPanel(target)).toBe(true)

        await teardown(target, app)
    })

    test('static without OPFS support: the integrity panel renders, the OPFS panel does not', async () => {
        revokeOpfsSupport()

        const { target, app } = mountPanel()
        flushSync()

        expect(hasIntegrityPanel(target)).toBe(true)
        expect(hasOpfsPanel(target)).toBe(false)

        await teardown(target, app)
    })
})
