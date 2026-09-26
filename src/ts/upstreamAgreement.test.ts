/**
 * `src/ts/upstreamAgreement.ts` holds the one shared acceptance for every
 * upstream-operated Realm/Drive feature (MC-086, MC-087 #3). `askUpstreamAgreement()`
 * must never be mocked here: every case below drives the module's real
 * prompt and answers it the way `AlertComp`'s own buttons do, through
 * `alertStore`.
 *
 * The module under test imports only `svelte/store` and `alertStore` from
 * `src/ts/stores.svelte`; it never imports `src/ts/alert.ts`. `stores.svelte`
 * is mocked below to a plain, real `alertStore` this file can read and write
 * directly, standing in for `AlertComp.svelte`'s own reads and writes of that
 * same store.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { writable, get } from 'svelte/store'
import type { alertData } from 'src/ts/alert'

vi.mock(import('src/ts/stores.svelte'), () => ({
    alertStore: writable<alertData>({ type: 'none', msg: '' }),
}) as unknown as typeof import('src/ts/stores.svelte'))

import {
    UPSTREAM_AGREEMENT_KEY,
    UPSTREAM_AGREEMENT_ACCEPT,
    UPSTREAM_AGREEMENT_DECLINE,
    upstreamAccepted,
    isUpstreamAccepted,
    askUpstreamAgreement,
    publishUpstreamAccepted,
    resetUpstreamAgreementForTests,
} from 'src/ts/upstreamAgreement'

// The exact same store instance `askUpstreamAgreement()` reads and writes,
// through its own import of the mocked `stores.svelte` above.
const { alertStore } = await import('src/ts/stores.svelte')

/**
 * Forces resolution of a prompt `askUpstreamAgreement()` is still waiting on,
 * whatever value the store holds at the moment this runs, so that wait never
 * keeps running into a later test. This settles as soon as the store's
 * subscriber observes the write; the 500ms bound only fires for a prompt
 * whose own subscriber was already torn down (for example one abandoned by
 * `resetUpstreamAgreementForTests()`), where nothing is left to observe it.
 * Cleanup must never throw a new error that could mask the assertion the
 * test itself already raised, so callers `.catch()` this.
 */
async function settlePendingPrompt(pending: Promise<boolean>, msg: string): Promise<boolean> {
    alertStore.set({ type: 'none', msg })
    return await Promise.race([
        pending,
        new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('a prompt from this test never settled after being answered')), 500)
        ),
    ])
}

beforeEach(() => {
    localStorage.clear()
    resetUpstreamAgreementForTests()
    alertStore.set({ type: 'none', msg: '' })
    vi.stubEnv('VITE_RISU_LEGAL_CONFIGURED', 'TRUE')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('askUpstreamAgreement(): the prompt (T-C1)', () => {
    // Guard: `AlertComp.svelte`'s `'tos'` block matches on exactly this shape.
    test('posts {type:"tos", msg:"tos"}, the shape the real prompt UI matches on', async () => {
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore)).toEqual({ type: 'tos', msg: 'tos' })
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
        }
    })

    test('Accept stores the new key, updates the live store, and resolves true', async () => {
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).toBe('tos')
            alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
            expect(await p).toBe(true)
            expect(localStorage.getItem(UPSTREAM_AGREEMENT_KEY)).toBe('accepted')
            expect(get(upstreamAccepted)).toBe(true)
            expect(isUpstreamAccepted()).toBe(true)
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_ACCEPT).catch(() => {})
        }
    })

    // Declining must never grant access: writing this prompt's own decline
    // value must leave the key unset.
    test('Decline stores nothing, resolves false, and a reload finds nothing accepted', async () => {
        const p = askUpstreamAgreement()
        expect(get(alertStore).type).toBe('tos')
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
        expect(await p).toBe(false)
        expect(localStorage.getItem(UPSTREAM_AGREEMENT_KEY)).toBeNull()
        resetUpstreamAgreementForTests()
        expect(isUpstreamAccepted()).toBe(false)
    })

    test('a generic {type:"none", msg:"yes"} does not count as an answer to this prompt (also T-C14)', async () => {
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).toBe('tos')
            alertStore.set({ type: 'none', msg: 'yes' })
            await vi.waitFor(() => {
                if (get(alertStore).type !== 'tos') {
                    throw new Error('expected the agreement prompt to still be showing, not resolved, after a generic "yes"')
                }
            }, { timeout: 300, interval: 5 })
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
        }
    })

    test('tos4="true" does not skip this prompt', async () => {
        localStorage.setItem('tos4', 'true')
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).toBe('tos')
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
        }
    })

    test('a key accepted behind the store\'s back resolves true without posting', async () => {
        localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).not.toBe('tos')
            expect(await p).toBe(true)
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_ACCEPT).catch(() => {})
        }
    })

    test('with the flag unset it resolves false without posting', async () => {
        vi.stubEnv('VITE_RISU_LEGAL_CONFIGURED', '')
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).not.toBe('tos')
            expect(await p).toBe(false)
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
        }
    })
})

describe('askUpstreamAgreement(): another tab\'s acceptance is found by re-reading, not the cached store (T-C1b)', () => {
    test('a live subscription does not shadow a key accepted behind the store\'s back', async () => {
        const seen: boolean[] = []
        const unsubscribe = upstreamAccepted.subscribe((v) => seen.push(v))
        try {
            localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
            const p = askUpstreamAgreement()
            try {
                expect(get(alertStore).type).not.toBe('tos')
                expect(await p).toBe(true)
                expect(seen[seen.length - 1]).toBe(true)
            } finally {
                await settlePendingPrompt(p, UPSTREAM_AGREEMENT_ACCEPT).catch(() => {})
            }
        } finally {
            unsubscribe()
        }
    })
})

describe('upstreamAccepted: a storage event with no key (another tab clearing localStorage) also triggers a re-read', () => {
    test('key: null after the accepted key is removed flips a subscribed store to false', () => {
        localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
        resetUpstreamAgreementForTests()
        const seen: boolean[] = []
        const unsubscribe = upstreamAccepted.subscribe((v) => seen.push(v))
        try {
            expect(seen[seen.length - 1]).toBe(true)
            localStorage.removeItem(UPSTREAM_AGREEMENT_KEY)
            window.dispatchEvent(new StorageEvent('storage', { key: null }))
            expect(seen[seen.length - 1]).toBe(false)
        } finally {
            unsubscribe()
        }
    })

    // Guard: this direction of the listener (naming the key, not just a whole-storage clear) already
    // updates the store correctly; kept alongside the `key: null` case above for full coverage of
    // the listener's own key check.
    test('a storage event naming the accepted key flips a subscribed store to true', () => {
        const seen: boolean[] = []
        const unsubscribe = upstreamAccepted.subscribe((v) => seen.push(v))
        try {
            expect(seen[seen.length - 1]).toBe(false)
            localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
            window.dispatchEvent(new StorageEvent('storage', { key: UPSTREAM_AGREEMENT_KEY }))
            expect(seen[seen.length - 1]).toBe(true)
        } finally {
            unsubscribe()
        }
    })
})

describe('publishUpstreamAccepted(): the store takes the fresh read the caller just made', () => {
    // `getRisuHub` and `getRealmInfo` (`src/ts/characterCards.ts`) call this at the same point they
    // act on their own `isUpstreamAccepted()` check, so a store a view cached `true` before either
    // function found no acceptance on a fresh read is corrected rather than left to disagree with it.
    test('a stale-true store is corrected to false once a fresh read finds no acceptance', () => {
        localStorage.setItem(UPSTREAM_AGREEMENT_KEY, 'accepted')
        resetUpstreamAgreementForTests()
        const seen: boolean[] = []
        const unsubscribe = upstreamAccepted.subscribe((v) => seen.push(v))
        try {
            expect(seen[seen.length - 1]).toBe(true)
            localStorage.removeItem(UPSTREAM_AGREEMENT_KEY)
            expect(isUpstreamAccepted()).toBe(false)

            publishUpstreamAccepted()

            expect(seen[seen.length - 1]).toBe(false)
            expect(get(upstreamAccepted)).toBe(false)
        } finally {
            unsubscribe()
        }
    })
})

describe('askUpstreamAgreement(): every prompt re-posts until its own answer (T-C14)', () => {
    test('a pending prompt displaced by a toast is re-posted, and only its own Decline resolves it', async () => {
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).toBe('tos')
            alertStore.set({ type: 'toast', msg: 'Alert Closed' })
            await vi.waitFor(() => {
                if (get(alertStore).type !== 'tos') {
                    throw new Error('expected the agreement prompt to reappear after a toast displaced it')
                }
            }, { timeout: 300, interval: 5 })
            alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
            expect(await p).toBe(false)
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
        }
    })

    test('a pending prompt displaced by an empty none (a toast\'s own auto-dismiss) is re-posted, and only its own Decline resolves it', async () => {
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).toBe('tos')
            alertStore.set({ type: 'none', msg: '' })
            await vi.waitFor(() => {
                if (get(alertStore).type !== 'tos') {
                    throw new Error('expected the agreement prompt to reappear after an empty none displaced it')
                }
            }, { timeout: 300, interval: 5 })
            alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_DECLINE })
            expect(await p).toBe(false)
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
        }
    })

    test('a pending prompt displaced by another alert is re-posted, and only its own Accept resolves it', async () => {
        const p = askUpstreamAgreement()
        try {
            expect(get(alertStore).type).toBe('tos')
            alertStore.set({ type: 'error', msg: 'unrelated error' })
            await vi.waitFor(() => {
                if (get(alertStore).type !== 'tos') {
                    throw new Error('expected the agreement prompt to reappear after an unrelated alert displaced it')
                }
            }, { timeout: 300, interval: 5 })
            alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
            expect(await p).toBe(true)
            expect(localStorage.getItem(UPSTREAM_AGREEMENT_KEY)).toBe('accepted')
        } finally {
            await settlePendingPrompt(p, UPSTREAM_AGREEMENT_ACCEPT).catch(() => {})
        }
    })

    test('a second call while one is pending joins it instead of posting again', async () => {
        let tosPostCount = 0
        const unsubscribe = alertStore.subscribe((v) => {
            if (v.type === 'tos') {
                tosPostCount++
            }
        })
        let p1: Promise<boolean> | undefined
        let p2: Promise<boolean> | undefined
        try {
            p1 = askUpstreamAgreement()
            p2 = askUpstreamAgreement()
            expect(tosPostCount).toBe(1)
            alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
            const [a1, a2] = await Promise.all([p1, p2])
            expect(a1).toBe(a2)
        } finally {
            unsubscribe()
            if (p1 && p2) {
                alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
                await Promise.race([
                    Promise.all([p1, p2]),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('a pending prompt from this test never settled')), 500)),
                ]).catch(() => {})
            }
        }
    })
})

describe('askUpstreamAgreement(): a stale answer left on alertStore from an earlier prompt never resolves a new one (plan I11, R5)', () => {
    test('a fresh call made after an earlier Decline posts its own prompt, and only its own Accept resolves it', async () => {
        const p1 = askUpstreamAgreement()
        expect(get(alertStore).type).toBe('tos')
        expect(await settlePendingPrompt(p1, UPSTREAM_AGREEMENT_DECLINE)).toBe(false)
        // alertStore is left holding exactly the value that Decline wrote; nothing else
        // touches it before the next call starts.

        const p2 = askUpstreamAgreement()
        expect(get(alertStore)).toEqual({ type: 'tos', msg: 'tos' })
        expect(await settlePendingPrompt(p2, UPSTREAM_AGREEMENT_ACCEPT)).toBe(true)
    })

    test('a stale Accept value already on alertStore, with nothing actually accepted, does not resolve a new prompt to true or write the key', async () => {
        alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
        resetUpstreamAgreementForTests()
        expect(localStorage.getItem(UPSTREAM_AGREEMENT_KEY)).toBeNull()
        expect(isUpstreamAccepted()).toBe(false)

        const p = askUpstreamAgreement()
        expect(get(alertStore)).toEqual({ type: 'tos', msg: 'tos' })
        expect(localStorage.getItem(UPSTREAM_AGREEMENT_KEY)).toBeNull()

        expect(await settlePendingPrompt(p, UPSTREAM_AGREEMENT_ACCEPT)).toBe(true)
    })
})

describe('resetUpstreamAgreementForTests(): discards a still-pending, unanswered prompt', () => {
    test('a fresh prompt is posted after reset, and it resolves on its own answer', async () => {
        const p1 = askUpstreamAgreement()
        let p2: Promise<boolean> | undefined
        try {
            expect(get(alertStore).type).toBe('tos')
            resetUpstreamAgreementForTests()
            alertStore.set({ type: 'none', msg: '' })

            // If reset left the first prompt's own wait still running, writing an empty
            // none here would make it re-post the prompt (T-C14), indistinguishable from a
            // fresh post below; confirm the store actually settles on 'none' first.
            await new Promise((resolve) => setTimeout(resolve, 20))
            expect(get(alertStore).type).toBe('none')

            p2 = askUpstreamAgreement()
            expect(get(alertStore).type).toBe('tos')
            alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
            expect(await p2).toBe(true)
        } finally {
            if (p2) {
                await settlePendingPrompt(p2, UPSTREAM_AGREEMENT_ACCEPT).catch(() => {})
            }
            await settlePendingPrompt(p1, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
        }
    })
})

describe('askUpstreamAgreement(): a storage write failure never blocks acceptance (section 11.3)', () => {
    // happy-dom binds `setItem` onto the `localStorage` instance the first time any code calls
    // it, which every earlier test in this file already has by the time this block runs; once
    // that instance-level binding exists, a spy on `Storage.prototype` does not sit in the call
    // path, so the spy must go on the `localStorage` instance itself to actually intercept.
    test('Accept still resolves true when localStorage.setItem throws', async () => {
        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError')
        })
        try {
            const p = askUpstreamAgreement()
            try {
                expect(get(alertStore).type).toBe('tos')
                alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
                await expect(p).resolves.toBe(true)
                expect(setItemSpy).toHaveBeenCalledWith(UPSTREAM_AGREEMENT_KEY, 'accepted')
                expect(localStorage.getItem(UPSTREAM_AGREEMENT_KEY)).toBeNull()
            } finally {
                await settlePendingPrompt(p, UPSTREAM_AGREEMENT_ACCEPT).catch(() => {})
            }
        } finally {
            setItemSpy.mockRestore()
        }
    })

    test('a later call in the same page life needs no second prompt after a failed write', async () => {
        const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError')
        })
        let p2: Promise<boolean> | undefined
        try {
            const p1 = askUpstreamAgreement()
            alertStore.set({ type: 'none', msg: UPSTREAM_AGREEMENT_ACCEPT })
            await p1.catch(() => {})
            expect(setItemSpy).toHaveBeenCalledWith(UPSTREAM_AGREEMENT_KEY, 'accepted')
            expect(localStorage.getItem(UPSTREAM_AGREEMENT_KEY)).toBeNull()
            alertStore.set({ type: 'none', msg: '' })

            p2 = askUpstreamAgreement()
            expect(get(alertStore).type).not.toBe('tos')
            expect(await p2).toBe(true)
        } finally {
            if (p2) {
                await settlePendingPrompt(p2, UPSTREAM_AGREEMENT_DECLINE).catch(() => {})
            }
            setItemSpy.mockRestore()
        }
    })
})
