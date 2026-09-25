/**
 * The URL `RealmFrame.svelte` loads its upload iframe from. Always this same
 * constant, whatever the selected character's `realmId` (MC-080): editing an
 * existing Realm listing in-app is not supported. A character that already
 * has a `realmId` instead gets a confirm before a fresh upload (see
 * `openRealmUpload` in `characterCards.ts`).
 */
export function getRealmUploadUrl(): string {
    return 'https://realm.risuai.net/upload#noLayout'
}
