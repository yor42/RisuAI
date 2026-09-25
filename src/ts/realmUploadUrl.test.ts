// @vitest-environment happy-dom

/**
 * `getRealmUploadUrl()` (`src/ts/realmUploadUrl.ts`) is the URL `RealmFrame.svelte`
 * loads its upload iframe from. It must be a well-formed URL with no
 * `edit`/`edit-type`/`token` query parameter, whatever the selected
 * character's `realmId`: editing an existing Realm listing in-app is not
 * supported (MC-080); a character that already has a `realmId` instead gets
 * a confirm before a fresh upload (`openRealmUpload`, tested separately).
 *
 * `src/ts/stores.svelte` is mocked defensively in case the real module reads
 * the selected character from it: the URL is the same constant regardless,
 * so both scenarios below must produce identical, well-formed output.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { writable } from 'svelte/store'
import type { Database } from 'src/ts/storage/database.svelte'

const dbState = { db: { characters: [] } as unknown as Database }
const selectedCharID = writable(-1)

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: dbState,
    selectedCharID,
}) as unknown as typeof import('src/ts/stores.svelte'))

function selectCharacterWithRealmId(realmId: string): void {
    dbState.db.characters = [
        { type: 'character', realmId } as unknown as Database['characters'][number],
    ]
    selectedCharID.set(0)
}

beforeEach(() => {
    selectCharacterWithRealmId('')
})

describe('getRealmUploadUrl()', () => {
    test('a well-formed URL with path /upload and hash #noLayout, no edit/edit-type/token parameter, for a character with no realmId', async () => {
        const { getRealmUploadUrl } = await import('src/ts/realmUploadUrl')
        selectCharacterWithRealmId('')

        const url = new URL(getRealmUploadUrl())

        expect(url.pathname).toBe('/upload')
        expect(url.hash).toBe('#noLayout')
        expect(url.searchParams.has('edit')).toBe(false)
        expect(url.searchParams.has('edit-type')).toBe(false)
        expect(url.searchParams.has('token')).toBe(false)
    })

    test('the same well-formed URL, with no edit/edit-type/token parameter, for a character that already has a realmId', async () => {
        const { getRealmUploadUrl } = await import('src/ts/realmUploadUrl')
        selectCharacterWithRealmId('existing-realm-id')

        const raw = getRealmUploadUrl()
        const url = new URL(raw)

        expect(url.pathname).toBe('/upload')
        expect(url.hash).toBe('#noLayout')
        expect(raw).not.toContain('edit=')
        expect(raw).not.toContain('edit-type')
        expect(raw).not.toContain('token')
    })
})
