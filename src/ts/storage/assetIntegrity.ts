import { hasher } from "../parser/parser.svelte"
import { getBasename } from "../globalApi.svelte"

export type AssetVerifyResult =
    | { status: 'ok' }
    | { status: 'mismatch', expectedHash: string, actualHash: string }
    | { status: 'not-content-addressed' }
    | { status: 'not-cached' }
    | { status: 'unsupported' }

const CONTENT_HASH_BASENAME = /^[0-9a-f]{64}$/i

/**
 * Cheaply checks whether a service-worker-cached asset's bytes still match
 * their own filename — without ever touching the source-of-truth storage
 * backend (IndexedDB/OPFS/Node server), and without needing any new
 * persisted metadata.
 *
 * This works because saveAsset() (src/ts/globalApi.svelte.ts) names every
 * asset it creates after the SHA-256 hash of its own content (`hasher()`,
 * src/ts/parser/parser.svelte.ts), UNLESS called with an explicit custom id
 * — and nothing in this codebase currently does that (verified: every
 * saveAsset() call site either omits the id argument or passes an empty
 * string). So for the overwhelming majority of real assets, the filename
 * already IS the expected content hash — no separate freshness marker needs
 * to be stored "alongside" the cache entry, since one is already encoded in
 * its name. Re-hashing just the cached copy and comparing it to that name
 * is enough to catch drift/corruption (Agents/Roadmap.md Phase 1 item 6),
 * without the cost of also fetching a comparison copy from local storage.
 *
 * Read-only: reports a mismatch, does not attempt to repair one. Intended
 * for a small sampled boot-time check (see bootstrap.ts's cleanChunks()) and
 * for a future explicit "verify assets" UI action (Phase 1 item 7).
 */
export async function verifyAssetCacheEntry(loc: string): Promise<AssetVerifyResult> {
    if (typeof caches === 'undefined') {
        return { status: 'unsupported' }
    }
    const basename = getBasename(loc)
    const dot = basename.lastIndexOf('.')
    const hashPart = dot === -1 ? basename : basename.slice(0, dot)
    if (!CONTENT_HASH_BASENAME.test(hashPart)) {
        return { status: 'not-content-addressed' }
    }
    const encoded = Buffer.from(loc, 'utf-8').toString('hex')
    const cache = await caches.open('risuCache')
    const cached = await cache.match('/sw/img/' + encoded)
    if (!cached) {
        return { status: 'not-cached' }
    }
    const bytes = new Uint8Array(await cached.arrayBuffer())
    const actualHash = await hasher(bytes)
    const expectedHash = hashPart.toLowerCase()
    if (actualHash.toLowerCase() === expectedHash) {
        return { status: 'ok' }
    }
    return { status: 'mismatch', expectedHash, actualHash: actualHash.toLowerCase() }
}
