# Report 15 — AV-3: stop re-encoding avatars and assets on plain HTTP (plan)

**Status:** rev 2, 2026-09-22. **Committed `d6ee89db`** (post-implementation gate ledger 50, live check ledger 51). The plan gate (`opus-reviewer`, ledger row 48) returned **approve with
required changes**. All required changes are folded in below; the reviewer's citations for them were
re-verified by the Orchestrator.
**Maintainer decisions (2026-09-22):** option (a), caching the encoded string with a byte budget,
not `blob:` URLs. **Fold in** the chat renderer's unbounded `fileSrcCache`. Budget **64 MiB**.
**Evidence base:** investigator packet (ledger row 47), with its key citations re-verified by the
Orchestrator at HEAD `5084e1ee`: `globalApi.svelte.ts:104-160` (cache and eviction), `:170-291`
(`getFileSrc`), `parser.svelte.ts:113-119` (DOMPurify keeps `blob:`), `:431-441` (`fileSrcCache`),
`Sidebar.svelte:684-685` (`oder.img`), `Chat.svelte:673,713,765` (clipboard allow-lists).

---

## 1. Facts

- **F1: the branches of `getFileSrc`** (`globalApi.svelte.ts:170-291`):
  - Tauri (`:171-186`): `pathCache`, returns `convertFileSrc`. It does not touch `fileCache`.
  - Account with an `assets` path (`:188-190`): returns `hubURL + '/rs/' + loc`, with no cache.
  - Service worker (`:192-241`): uses **the same `fileCache` Map**. Its entries are
    `{status:'done'|'missing'}` and never carry `data`. It returns `/sw/img/...`.
  - **Plain HTTP** (`:242-286`), the AV-3 scope: it caches raw bytes (`data: Uint8Array`) and
    **re-encodes on every call**:
    `` `data:image/png;base64,${Buffer.from(resolved?.data ?? new Uint8Array()).toString('base64')}` ``
    (`:285`). An account user with a path that does not start with `assets` also lands here or in
    the service-worker branch; that is existing behaviour, and AV-3 does not change it.
- **F2: the eviction policy.** `touchFileCache` (`:122-159`) is an LRU with a cap of 200 entries.
  It evicts non-loading entries first, then falls back to loading entries. That is safe because
  waiters await `entry.promise` directly. Results are committed only if the loading entry is still
  current (`:233`, `:259`, `:268`).
- **F3: a second, unbounded cache.** `fileSrcCache` (`parser.svelte.ts:431-441`) keeps every
  `getFileSrc` result that chat rendering asks for (`parseAdditionalAssets`, `:520`, `:566`), and
  nothing ever deletes from it. On plain HTTP it pins about 4/3·B bytes for every asset ever shown
  in chat, for the life of the tab. On the other branches it holds short URLs.
- **F4: 41 call sites.** There are 12 direct calls and 29 through `getCharImage` (29 calls on 28
  lines). They put the
  string in `<img src>`, CSS `url()`, sanitized chat HTML, canvas (`characters.ts:745-785`),
  clipboard (`Chat.svelte:673,713,765`) and **one persisted field**, `oder.img`
  (`Sidebar.svelte:685`). With option (a), the returned value is **byte-for-byte identical** to
  today's, so none of these sites changes.
- **F5: no tests cover `fileCache`.** The parser tests and the AV-1/AV-2 suites mock `getFileSrc`
  entirely. `usingSw` has an exported setter (`setUsingSw`, `:1098`). `forageStorage.isAccount` is
  a mutable property that tests already flip. `isTauri` is fixed at module load and is `false`
  under vitest.
- **F6: the memory held today, per plain-HTTP asset of B bytes.** B raw bytes sit in `fileCache`.
  **Each call** also allocates a fresh string of about 4/3·B bytes; base64 is ASCII, so V8 can store it
  one byte per character; it is 4/3 of the raw bytes. Report 14 §2.1 measured 713.9 MB of base64 for
  535.4 MB of PNG, exactly 4/3; that is the base64 size, not how V8 stores it. So N holders (list items, sidebar,
  dialogs, chat) hold N separate copies. On top of that, `fileSrcCache` keeps one copy forever for
  every asset shown in chat.

## 2. Design

### 2.1 `globalApi.svelte.ts`: cache the encoded string with a byte budget

- **Entry shape.** Plain-HTTP `'done'` entries store the finished string (`src: string`) **instead
  of** the raw bytes. Service-worker entries stay as they are and carry no `src`.
- **Encode once, inside the loading promise.** The read and the encode happen together in the
  existing `(async () => ...)()` producer, so concurrent callers share one read **and one encode**,
  and every caller served from the same cache entry (or memo slot) receives the same string
  object. **Implementation note:** `src` holds the full `data:` string and is returned as is; an
  earlier draft stored only the payload and prepended the prefix per call, which would give each
  holder its own copy. JS cannot observe string identity, so **no test covers this**; it rests on
  code review (ledger 50).
- **Output is unchanged.** It is the same expression, the same `image/png` label (Report 12 §4:
  "do not fix, do not break"), and the same result for a missing file: `getItem` returning null
  still yields `data:image/png;base64,`.
- **Budget.** `FILE_CACHE_MAX_BYTES = 64 * 1024 * 1024`. An entry costs `src.length` bytes (one-byte
  string), **excluding the constant 22-character `data:image/png;base64,` prefix** (Orchestrator
  decision at implementation; `fileCacheEntryCost`). Service-worker, loading and missing entries cost 0. The 200-entry count cap **stays**,
  because service-worker entries still rely on it.
- **Accounting.** Keep a running `fileCacheBytes` total. Every insert, replace and delete must update
  it, including the delete-then-set inside `touchFileCache`, both eviction loops, and the catch path
  (`:268-270`). Route all of them through one small helper so no path can be missed.
- **Eviction.** Loop while `size > 200 || bytes > FILE_CACHE_MAX_BYTES`, oldest first, skipping
  loading entries. Keep the existing fallback, which evicts loading entries when the **count** is
  over. Loading entries hold no bytes, so evicting them can never help the byte budget, and the
  fallback must not spin on it.
- **An oversized entry is not cached in the Map.** If one `src` is larger than the budget, it is
  returned to its callers and **not** committed to the Map. Its loading entry is removed only if it
  is still current. An entry just **under** the budget still evicts everything else; that is
  accepted.
- **One-slot memo for oversized results (gate M2).** Keep only the most recent oversized result
  (`{loc, src}`) outside the budget, and replace it when another oversized result arrives. Without
  it, an oversized chat asset (e.g. a video over about 48 MiB raw) would be read and encoded again
  on **every streaming update**, because `ChatBody.svelte:156` re-parses and `ParseMarkdown` runs
  `parseAdditionalAssets` up to twice (`parser.svelte.ts:762`, `:773`). HEAD avoids that only by
  pinning every such string forever in `fileSrcCache`. The memo pins at most one.
- **`src` travels in the promise's resolved value**, not only in the Map, so waiters on an
  oversized or evicted entry still receive it (waiters await the promise directly, `:278`).
- **A missing `src` stays byte-identical:** the fallback is `src ?? 'data:image/png;base64,'`,
  matching HEAD's `resolved?.data ?? new Uint8Array()` at `:285`.
- **Holders are unaffected.** An evicted string stays alive for as long as a DOM node or component
  still holds it. AV-2 already bounds the mounted list, and the chat DOM bounds the chat. The
  budget bounds the cache, not the holders.
- **Sharing one string helps `'plain'` holders only** (e.g. the sidebar). `getCharImage`'s `'css'`,
  `'lgcss'` and `'contain'` modes (`characters.ts:74-84`) wrap the string in a template, so each of
  those holders still has its own full-length copy, as today.

### 2.2 `parser.svelte.ts`: no permanent copy on plain HTTP (fold-in, F3)

- **Add one exported predicate to `globalApi.svelte.ts`** that reports whether a `loc` would take
  the plain-HTTP branch right now. It must mirror `getFileSrc`'s own conditions exactly:
  `!isTauri && !(forageStorage.isAccount && loc.startsWith('assets')) && !usingSw`. `getFileSrc`
  picks its branch synchronously before its first await, and `usingSw` changes once, from false to
  true, at boot (`bootstrap.ts:233`). So `getFileSrcCached` must call the predicate in the same tick
  as `getFileSrc`, with no await in between.
- **`getFileSrcCached`** skips `fileSrcCache` (no get, no set) when the predicate is true, and
  calls `getFileSrc` directly. That call is a Map lookup on a hit, and at worst one read plus one
  encode after eviction. Tauri, account and service-worker behaviour is unchanged.
- **Accepted costs.**
  - If one chat uses more than 64 MiB of assets, re-rendering it re-reads and re-encodes the
    evicted ones. Today that memory is simply held forever.
  - **Character lists can re-read more than HEAD does (gate M1).** HEAD's cap is 200 entries of any
    size, so with 1 MB avatars it keeps about 200 MB raw and never re-reads within 200 characters.
    The new budget keeps about 48 such avatars, so scrolling back further than that reads from
    storage again. Encodes never go up, because HEAD re-encodes on every call anyway.
  - **This cost is temporary if AV-4 ships** (maintainer question, 2026-09-22). AV-4 plans small
    thumbnails for list avatars (Report 12 §5). Estimated sizes, not measured: a PNG thumbnail of
    128-256 px is about 30-150 KB, so 40-200 KB as base64. At that size the 200-entry count cap is
    reached before 64 MiB (64 MiB ÷ 200 ≈ 330 KB per entry), so list scroll-back reach matches HEAD's
    200 entries. If AV-4 serves thumbnails from its own store instead of through `getFileSrc`, the
    lists stop using this cache entirely. Either way 64 MiB is enough for the lists after AV-4.
    Animated avatars stay full-size and remain under the M1 cost. AV-4 is "measure first", so until
    it ships M1 applies as written.
- **Existing mocks (gate L6).** 16 test files mock `globalApi.svelte` with factories that lack the new
  predicate. Add it (returning `false`) wherever a mocked module reaches `getFileSrcCached`.

### 2.3 Not changed

- The account branch; per AGENTS.md the isAccount branch is never made more aggressive.
- Tauri, and the service-worker return values.
- The `image/png` label.
- `oder.img` (it keeps receiving the same `data:` string it gets today; the backup no-op in
  `backuplocal.ts:268-278` is pre-existing, see §5).
- The clipboard allow-lists, canvas code and `blobUrlCache`.
- The uncached `readImage` → `data:` path in `index.svelte.ts:1024-1049`, which builds prompt
  payloads, not display strings.

## 3. Compatibility

There is no change to the save format, backups, characters, modules, presets or plugins. The string
`getFileSrc` returns is identical in content on every branch.

The performance effect depends on asset size (gate M1):
- **Large assets** (a working set over 64 MiB of base64): memory is capped, where HEAD held up to 200
  raw entries plus a fresh string per call and a permanent chat copy. Encodes drop to one per cache
  fill. **Storage reads can go up** when scrolling back past what the budget holds.
- **Small assets** (200 entries under 64 MiB, i.e. under about 250 KB raw each): the cache holds 4/3×
  HEAD's bytes, on the V8 heap rather than in off-heap buffers. In exchange there is no re-encoding
  and no per-holder copy for `'plain'` holders. Whether 64 MiB of heap strings is a concern on a Pi 3
  is **unverified**; the live check watches it.

## 4. Tests (red before green; test-warrior writes them, then sonnet-coder implements)

A test seam is needed, because nothing is exported today (F5). The seam should be test-only. It
lets a test set a small byte budget **and a small count cap**, read the entry count, and reset the
cache. It must expose **both** the running byte total **and** a total recomputed from the Map, and
every byte assertion checks that the two are equal (gate M3). Tests also spy on
`forageStorage.getItem`.

- **Encode count (gate L1).** `polyfill.ts:43` replaces `globalThis.Buffer`, so spy on
  `globalThis.Buffer.prototype.toString` **after** imports. Count only calls with `'base64'`, because
  the service-worker branch calls `'hex'` (`:193`). Assert exact counts (`toBe(1)`).
- **Use a unique `loc` per test**, because HEAD has no reset hook.
- String identity cannot be observed in JS, so no test claims it.

Each test must fail on HEAD, with stubs swapped in where the seam does not exist yet, and the
failure must be recorded.

| # | Behaviour | Why it fails on HEAD |
|---|---|---|
| T1 | 3 calls for one `loc` produce one read and **one** encode | HEAD encodes 3× |
| T2 | 5 concurrent first calls produce one read and one encode, and all return equal strings | HEAD encodes 5× |
| T3 | With a budget of about 2.5 entries, loading a third entry evicts the oldest (a re-request reads again), and the byte total never exceeds the budget | HEAD uses a count cap only |
| T4 | An entry larger than the budget is returned correctly, is not cached, and does not evict others | new |
| T5 | Service-worker entries (`setUsingSw(true)`) cost 0 bytes and do not throw under byte eviction; they still obey the 200 count cap | guard |
| T6 | A read that throws removes the entry and leaves the byte total correct; a retry succeeds | guard |
| T7 | A missing file (`getItem` → null) still returns `data:image/png;base64,` | guard, unchanged output |
| T8 | Account plus `assets/…` still returns the hub URL, with no read and no cache entry | guard |
| T9 | Parser: on plain HTTP, rendering the same asset twice calls `getFileSrc` twice (no permanent copy). The mock must return a **non-empty** string, because `getFileSrcCached` treats `''` as a miss (`:435`) | HEAD calls once |
| T10 | Parser: with `usingSw` on, the second render is served from `fileSrcCache` | guard |
| T11 | The predicate agrees with the branch `getFileSrc` actually takes, across Tauri-false × account × `assets`-prefix × `usingSw` | new |
| T12 | Orphaned retry (gate M3): the count-cap fallback (`:153-158`) evicts a loading entry and a retry starts. When the orphan completes it does not commit; an **oversized** orphan does not delete the retry's entry; both totals still agree | guard |
| T13 | Oversized memo: two calls for one oversized `loc` produce one read and one encode; a second oversized `loc` replaces the memo; the memo never counts toward the budget | fails on the encode count |

`pnpm test` and `pnpm check` must stay green.

**Live check** (maintainer's dev server, plain HTTP, pane visible), with the seed fixture:
- Open the character list, scroll away and back. Confirm through the seam or the `getItem` count
  that scroll-back is served without re-reading **while the scrolled set stays under 64 MiB**.
- Also try realistic avatar sizes (about 1 MB) and scroll back past about 48 characters, where
  re-reads are expected.
- Confirm that avatars, a chat asset and the clipboard copy still render.
- Note the heap size, for the unverified Pi 3 heap question.

## 5. Recorded, not fixed here

- `oder.img` persists a full base64 `data:` string into the save, and `backuplocal.ts:268-278`
  treats it as a storage key, so folder images are always "missing" from partial backups. This is
  pre-existing, and AV-3 neither makes it worse nor fixes it.
- `blobUrlCache` (`parser.svelte.ts:678-693`, inlays) is never revoked and has no limit.
- `readImage` (`index.svelte.ts:1024-1049`) re-reads and re-encodes on every prompt build.
- The `image/png` label is also applied to video and audio (`parser.svelte.ts:576-588`). No
  consumer depends on it.

## 6. Gate instructions

Reviewer: `opus-reviewer`, fresh. Try to falsify:

- §1, from the source at HEAD;
- that the returned string is identical on every branch and every error path;
- the byte accounting on every Map mutation, including the eviction fallback and the orphaned-retry
  commit guard;
- that the oversized-entry rule cannot strand a loading entry or its waiters;
- that the §2.2 predicate mirrors `getFileSrc` exactly, including the account-but-not-`assets`
  case;
- that each §4 test really fails on HEAD;
- the 64 MiB budget against the Pi 3 floor.

Also check this plan's own citations and arithmetic.
