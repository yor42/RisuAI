# Report 16 — AV-4: thumbnails for list avatars (plan)

**STATUS:** implemented (`41977ac0`)

**Status:** rev 2, 2026-09-22. **Committed `41977ac0`.** Red and mutation proofs are ledger rows 56 and 59. The post-implementation gates (rows 57, 58) found no runtime defect beyond the read-phase timeout and the store timeouts, both fixed. Live check: row 60. The plan gate (`opus-reviewer`, ledger row 54) returned **approve with
required changes** R1-R9. All of them are folded in below. The Orchestrator re-verified the load-bearing
citations: R2 (`bootstrap.ts:570-575,293`, `database.svelte.ts:713`), R4 (`characters.ts:57-70`) and
R7 (`multiuser.ts:101-120`, `globalApi.svelte.ts:480-509`).
**Maintainer decisions (2026-09-22):**
- Baseline avatar: the NovelAI portrait, **832×1216 PNG**. Many users generate avatars there.
- **First view waits for the thumbnail.** A list icon without a thumbnail is generated before it
  shows. Where a thumbnail exists, the lists never hold the full-size image. Each avatar pays
  this once.
- Animated avatars exist and must stay animated (Report 12 §1).
**Evidence base:** investigator packet and follow-up (ledger row 52) and the Orchestrator's
measurement (ledger row 53), at HEAD `1b3de644`.

---

## 1. Facts

- **F1: the measurement** (seed tab, Chromium pane, i9-13900K, DPR 1). There were 40 real avatars
  from the hub listing: 25 JPEG and 15 PNG, from 512×512 to 3328×4864, and from 0.04 to 20 MB.
  - The four 832×1216 PNGs: 1.2–1.5 MB each. Full decode 6.8–10.5 ms. **4.0 MB bitmap each.** A
    160 px WebP thumbnail is 9–10 KB and decodes in about 1 ms.
  - All 40 images: full decode 258 ms, **197 MB of bitmaps**. As 160 px thumbnails: 39 ms, about
    4 MB. The single 3328×4864 PNG costs 92 ms and 65 MB.
  - Generation, with PNG, WebP and JPEG encodes all timed together: 23 ms for JPEG sources and
    43–54 ms for PNG sources. The largest image took 115 ms.
  - Stored size of a 160 px thumbnail: WebP about 9.6 KB on average, PNG about 72 KB.
  - `toDataURL('image/webp')` returned WebP in Chromium. **WebKit is UNVERIFIED.** That covers
    Tauri on macOS and Linux, and Safari. WebKit historically falls back to PNG.
  - Geometry: the measured thumbnails were **160×160 center crops**. The plan's 168-px short side
    with no crop gives 168×246 for the baseline, about 1.5× the pixels, so about 14 KB as WebP.
  - Milliseconds are best case. A Pi 3 or a mid-range phone is several times slower. **Bitmap
    sizes do not depend on the hardware.**
- **F2: the list render sites.** There are exactly eight, all fixed at 56 px:
  - `GridCatalog.svelte:110,133,161`, `MobileCharacters.svelte:85` and `AlertComp.svelte:399` use
    `BarIcon` (`3.5rem`, `BarIcon.svelte:23-25`) with `getCharImage(...,'css')`, drawn as
    `background-image`.
  - `Sidebar.svelte:616,629,756` use `SidebarAvatar` (`size="56"`) with
    `getCharImage(...,'plain')`. These are `<img>`, except the folder, which is a background div.
  - No flag makes any of them larger: not `largePortrait`, `iconsize`, `'contain'` or `'lgcss'`.
  - Full-size sites (chat, `CharConfig`, `PersonaSettings`, `BookmarkList`) use other types or
    sizes. They must not change.
- **F3: resolution.** `getCharImage(loc,type)` (`characters.ts:54-86`) checks `hideAllImages`
  and an empty `loc`, then calls `getFileSrc` once and wraps the result by `type`. Each list site
  hands the promise to `{#await}` in `BarIcon`/`SidebarAvatar`. It gets a fresh promise on every
  near-viewport entry (AV-2 `nearViewport`). **A promise that resolves later still renders; no
  extra wiring is needed.**
- **F4: raw bytes.** `readImage(loc)` (`globalApi.svelte.ts:457-470`) returns raw bytes on every
  branch: Tauri `readFile`, otherwise `forageStorage.getItem`. It neither caches nor re-encodes.
- **F5: canvas taint.** The Tauri asset protocol (`http(s)://asset.localhost`) is a different
  origin (`Chat.svelte:673`), and its CORS behaviour is UNVERIFIED. **The generator must build its
  `Image` from a `blob:` URL of the raw bytes, never from the `getFileSrc` result.** That URL is
  same-origin on every platform. The `blob:` precedent is `BotSettings.svelte:809-813`.
  `Chat.svelte:686-691` avoids taint the same way, but through a FileReader `data:` URL.
- **F6: storage.**
  - `inlayStorage` (`inlays.ts:30`) is a separate `localforage` instance, used on every platform
    including Tauri. It never goes through `AutoStorage`, so it is local-only and invisible to
    account sync.
  - Backup (`backuplocal.ts`) and the boot asset sweeps (`assetSweep.ts:56-75,111-119`,
    `bootstrap.ts:592-664`) never enumerate it.
  - It has **no automatic eviction.** Items are removed only by hand, in
    `PlaygroundInlayExplorer.svelte:56,71`. That is tolerable only because inlays are rare.
- **F7: keys.** `saveAsset` names assets by the SHA-256 of their content (`globalApi.svelte.ts:487`,
  `parser.svelte.ts:1034-1036`). Every `char.image` write goes through it without a custom id.
  - **The one custom-id caller** is multiuser `receive-asset` (`sync/multiuser.ts:311-313`), through
    the `saveImage` alias. It never carries `char.image`: the sender sends only `additionalAssets`
    and `emotionImages` (`multiuser.ts:96-121`).
  - Its id is a full loc (`id: a[1]`). `saveAsset` therefore writes `assets/assets/<hash>.png.png`
    (`globalApi.svelte.ts:497,503`) and never overwrites the referenced asset. **Thumbnail keys
    cannot go stale through it.**
  - The `assetIntegrity.ts:19-24` comment ("nothing in this codebase currently does that") is
    false. Corrected, comment only, in `e9a99644`. See §5.
- **F8: animated formats.** `selectCharImg` accepts png, webp, gif, jpg and jpeg
  (`characters.ts:88-96`). Imports write raw bytes. `getImageType` (`media/imageType.ts:3-46`)
  sniffs the format, but **nothing in `src/` detects animation.**
- **F9: cleanup.** Assets are deleted only at boot, by `cleanChunks` (`bootstrap.ts:293`, called
  with no options). There is no per-delete hook. **`cleanChunks` returns before building its
  keep-set** in two cases:
  - account sync (`bootstrap.ts:570-572`);
  - `db.coldstorage && !cleanColdStorage` (`:573-575`). `coldstorage` defaults to true for anyone
    without plugins (`database.svelte.ts:713`), so **for most users its keep-set is never built.**

  Its keep-set holds **basenames** (`globalApi.svelte.ts:1774`), not full locs.
- **F10: `getCharImage`'s early exits compare the type literally.** `hideAllImages` returns
  `/none.webp` only for `'plain'` (`characters.ts:59`). An empty `loc` returns `''` only for
  `'css'` (`:66`). An unknown type falls through to the `'contain'` wrapping (`:83-85`).

## 2. Design

### 2.1 Scope

- **In scope:** the eight list sites in F2, on Tauri, the service worker and plain HTTP.
- **Out of scope:**
  - **The account branch.** When `forageStorage.isAccount` is true, the avatar keeps today's hub
    URL and gets no thumbnail. Generating one would add a hub read per avatar, and the isAccount
    branch must never become more aggressive.
  - **Any `loc` that is not under `assets/`.**
  - **Every non-list site.**

### 2.2 New module `src/ts/media/avatarThumb.ts`

- **Store.** `thumbStorage = localforage.createInstance({name:'risuThumb', storeName:'avatarThumb', driver: localforage.INDEXEDDB})`.
  - Pinning the driver stops bulk thumbnails spilling into `localStorage` when IndexedDB is missing.
    If the store cannot be created or used, the thumbnail path is off (see "never rejects").
  - One store on every platform, including Tauri. This deviates from Report 12 §5, which proposed
    an AppData subdir for Tauri. The reason: `inlayStorage` already proves IndexedDB on Tauri (F6),
    and one code path is smaller and testable. The gate accepted this.
  - A cache, not data. Deleting it is always safe.
- **Record.** The key is the full `loc`. The value is `{v: THUMB_VERSION, src: string}` or
  `{v: THUMB_VERSION, skip: true}`.
  - A record whose `v` is not the current version counts as absent.
  - `THUMB_VERSION` changes whenever the size, format or scaling policy changes.
- **`getAvatarThumbSrc(loc): Promise<string | null>`.** `null` means "use the full-size path".
  - **It never rejects.** Any throw anywhere in the path, including a failing store `getItem`,
    resolves to `null` (R6).
  - **It reads no reactive state before its first `await`.** Otherwise it would add dependencies to
    the `{@const}` blocks that AV-1 relies on.
  - Lookup order:
    1. **In-memory memo, then the in-flight map.** An in-flight promise is shared. The memo holds
       successes and skip results only. It is an insertion-order LRU capped at 1000 entries and
       16 MiB of string length.
    2. **Store hit:** return `src`, or `null` if it is a skip record.
    3. **Miss:** enqueue generation.
- **The queue.**
  - **Concurrency 2, served newest-first (LIFO), so icons now on screen are not stuck behind items
    scrolled past** (R1).
  - **A per-task timeout of 15 s** covers read, decode and encode. On timeout the slot is freed, the
    caller gets `null` (full-size fallback), and the object URL is revoked and `img.src` cleared at
    that moment, not in a `finally` that might never run. A late result from a timed-out task is
    discarded, neither stored nor memoized.
  - `drawImage` and `toDataURL` run synchronously on the main thread, so the two slots overlap
    only I/O and decode, not encode.
- **Generation.**
  1. Read the bytes with `readImage(loc)`.
  2. **`null`, empty or fewer than 12 bytes counts as a transient failure** (R3): return `null` and
     store nothing.
  3. If the image is animated (`isAnimatedImage`), persist a skip record.
  4. If the type is unsupported (supported: JPEG, PNG, WebP, BMP, AVIF), persist a skip record.
  5. Decode: `Blob` → `URL.createObjectURL` → `new Image()` → `await img.decode()`.
  6. If `thumbDimensions` is `null` (the short side is already ≤ 168), persist a skip record. The
     full-size path costs no more than a thumbnail for such an image.
  7. Draw at the scaled size, with `imageSmoothingQuality = 'high'`, keeping the aspect ratio and
     with **no crop**. The gate verified that every site frames the image with `cover` or
     `object-cover`, so the framing is unchanged. 168 is 56 × DPR 3 (at a 16 px root font size),
     and a baseline portrait becomes 168×246.
  8. Encode with `toDataURL('image/webp', 0.85)`. If the prefix is not `data:image/webp`, use
     `toDataURL('image/png')` (about 105 KB at 168×246). PNG keeps alpha.
  9. Clean up: revoke the object URL, set `img.src = ''`, and zero the canvas size.
  10. Persist best-effort. A store write that fails (for example, over quota) still returns the
      generated `src`.
  11. **Failures (read, decode, encode, timeout) are neither stored nor memoized** (R5). The next
      request retries.
- **Canvas readback guard** (R9). Once per session, before the first generation, draw a known
  4×4 pattern and read it back with `getImageData`. If it does not match exactly (for example under
  Firefox `resistFingerprinting`, or LibreWolf), the thumbnail path is off for the session and
  every call returns `null`. **Stored thumbnails are still served**; the guard only stops new ones
  from being made.
- **`isAnimatedImage(bytes: Uint8Array): boolean`** (pure, exported for tests):
  - **GIF** (`GIF87a`/`GIF89a`): `true`. Treat any GIF as possibly animated.
  - **PNG:** walk the chunks from offset 8. Return `true` if `acTL` occurs before the first
    `IDAT`. Stop at `IDAT`, at `IEND`, or on a malformed or overrunning length.
  - **WebP** (`RIFF....WEBP`): `true` if the chunk at offset 12 is `VP8X` and the flags byte at
    offset 20 has bit `0x02` set.
  - **AVIF/HEIF sequence:** `true` if the `ftyp` major brand or any compatible brand is `avis`.
  - **Anything else:** `false`.
- **`thumbDimensions(w, h, shortSide): {w, h} | null`** (pure): returns `null` when
  `min(w,h) <= shortSide`, and otherwise rounds both sides, each at least 1.

### 2.3 Integration

- **`getCharImage`** gains two types, `'thumb'` and `'thumbcss'` (R4).
  - At the top of the function, `'thumb'` is mapped to `'plain'` and `'thumbcss'` to `'css'` as a
    local wrap type, with a `thumb` flag. All existing branches, including `hideAllImages` and the
    empty `loc`, then compare the wrap type, so they behave exactly as for `'plain'`/`'css'`.
  - Only the `getFileSrc` call changes. If `thumb && isThumbEligible(loc)`, call
    `getAvatarThumbSrc(loc)`, falling back to `getFileSrc(loc)` on `null`.
  - `isThumbEligible(loc)` = `loc.startsWith('assets/') && !forageStorage.isAccount`. It is
    stricter than needed on Tauri with an account, but never more aggressive.
- **The eight list sites** change `'css'` to `'thumbcss'` and `'plain'` to `'thumb'`. Nothing else
  in them changes. No other call site changes.
- **The sweep** (R2) is **independent of `cleanChunks`.** `sweepAvatarThumbs(keep: Set<string>)`
  runs one `iterate()` pass and deletes records whose key (a full `loc`) is not in `keep`, or whose
  `v` is stale.
  - `keep` is built from the in-memory DB: every `db.characters[].image`, plus the folder images in
    `db.characterOrder`. Cold-storage stubs keep `image` (`coldstorage.svelte.ts:771`), so no cold
    read is needed. Trashed characters stay in `db.characters`, so they are kept.
  - It runs once per boot, after the database has loaded and detached from boot (next to the
    `cleanChunks()` call at `bootstrap.ts:293`, but not inside it and not awaited), in its own
    `try/catch`.
  - It touches only `risuThumb`, so it cannot affect the existing sweeps or boot. A wrong keep-set
    can only delete thumbnails, which are then regenerated.
  - It runs on every branch, account included. Account users have no thumbnails, so it is a no-op
    there.

### 2.4 Accepted costs

- **The first view after the update, and each new avatar, is slower once.** Estimated for 40
  visible baseline avatars: about 1-2 s on the i9, since encoding is serial on the main thread,
  and tens of seconds on a Pi 3, with some scroll jank while it runs. This is an estimate; the live
  check measures the i9 figure. Icons fill in progressively, newest request first. The maintainer
  chose this over holding full-size bitmaps.
- **Peak memory while generating:** two sources in flight. That is about 8 MB at baseline, and up
  to about 130 MB for two worst-case 3328×4864 sources. Whether Chromium's decoded-image cache is
  bounded by the concurrency limit is UNVERIFIED; the live check measures it.
- **Disk:** about 14 KB per thumbnailed avatar as WebP, about 105 KB with the PNG fallback.
- **Animated, small, unsupported and account-hub avatars keep today's full-size cost.**
- **Where the readback guard trips** (fingerprinting-resistant browsers), new avatars keep today's
  full-size cost.

## 3. Compatibility

- **No save-format change.** The thumbnail store is a local cache. Backup, export, account sync
  and the asset sweeps never see it (F6). Deleting it only costs regeneration.
- **Upstream characters, modules, presets, backups and plugins:** unaffected. `char.image` is read,
  never written. The new `getCharImage` types are internal, and existing types behave identically.
- **Tauri:** bytes come from `readImage`, and the canvas is fed from a `blob:` URL, so taint cannot
  apply.
- **`hideAllImages` and an empty `loc`:** these return exactly what `'plain'`/`'css'` return,
  through the type mapping in §2.3.

## 4. Tests

The canvas is unavailable under vitest, so generation is injected. The live check covers the real
canvas path.

- **Red:** fails on current code. **Guard:** passes today and pins behaviour.
- **T1-T8, T11 and T13 are new-module tests.** Their module does not exist today, so they are red
  by absence and prove behaviour only.

| # | Test | Kind |
|---|---|---|
| T1 | `isAnimatedImage`: GIF87a/89a → true; static PNG → false; APNG (`acTL` before `IDAT`) → true; `acTL` after `IDAT` → false; truncated or overrunning PNG → false, no throw; simple WebP (`VP8 `/`VP8L`) → false; `VP8X` with 0x02 → true; `VP8X` without → false; AVIF `avif` → false; `avis` (major or compatible) → true; JPEG → false | new |
| T2 | `thumbDimensions`: 832×1216 → 168×246; 1216×832 → 246×168; 168×300 → null; 100×100 → null; 1×5000 → null; 5000×200 → 4200×168 | new |
| T3 | A store hit returns `src` without calling the generator. A skip record returns `null`. A wrong `v` regenerates. **A store `getItem` that throws resolves `null`, not a rejection.** | new |
| T4 | Concurrent calls for one `loc` → one generation; a different `loc` → separate | new |
| T5 | Five distinct `loc`s → never more than 2 generators running at once | new |
| T5b | Two generators that never settle do not block a third `loc` after the timeout (fake timers). Those two resolve `null`, and a late result is discarded. | new |
| T5c | LIFO: with both slots busy, the most recently queued `loc` starts first | new |
| T6 | A generator failure → `null`, not stored or memoized, and a second call retries. `readImage` returning `null`, empty or 11 bytes → `null` with no skip record. | new |
| T7 | A store `setItem` failure still returns the generated `src` | new |
| T8 | Memo LRU: count and byte caps evict the oldest; an evicted entry is re-read from the store | new |
| T9 | `getCharImage` `'thumb'`/`'thumbcss'`: a thumbnail is wrapped exactly like `'plain'`/`'css'`; `null` → falls back to `getFileSrc`; `'thumb'` + `hideAllImages` → `/none.webp`; `'thumbcss'` + empty `loc` → `''` | **red** |
| T9g | `getCharImage` thumb types: account → never calls the thumbnail path; a loc not under `assets/` → never calls it | guard |
| T10 | Existing types `'plain'`/`'css'`/`'lgcss'`/`'contain'` never call the thumbnail path | guard |
| T11 | `sweepAvatarThumbs`: keeps full-`loc` keys in `keep`; deletes unreferenced and stale-`v` records; a key whose basename matches a kept asset under a different path is deleted; a throwing store does not throw out of the sweep. `buildThumbKeepSet(db)` includes character images, cold-stub images, trashed characters and folder images. | new |
| T12 | In the AV-1/AV-2 suites (`charlistAvatarLazy.svelte.test.ts`, `charlistAvatarLookups.svelte.test.ts`), mock `src/ts/media/avatarThumb` with a `getAvatarThumbSrc` spy that returns `null` by default. The existing `getFileSrc` counts must still hold, and the spy receives the `loc` from each list site those suites mount. | **red** (spy) |
| T13 | The readback guard: a mismatching `getImageData` turns generation off (stored hits are still served), and a matching one leaves it on | new |

**Live check** (seed tab, pane visible, the maintainer runs the dev server). Temporary avatars go
under `assets/av4live-*`:
- a baseline 832×1216 PNG;
- a small PNG;
- a GIF, an APNG and an animated WebP;
- a JPEG with EXIF rotation.

Check that:
- list icons are `data:image/webp` with a short side of 168, and are oriented correctly;
- the store is populated;
- a second resolution is served from the store, with no `readImage` and no generation;
- animated avatars stay full-size and animated, and the small PNG is skipped;
- a forced PNG fallback works;
- an orphaned key and a stale-`v` record are removed by the sweep;
- generation time for 40 icons and the heap delta are recorded;
- cleanup is verified.

## 5. Recorded, not fixed

- The false `assetIntegrity.ts` comment (F7) is fixed in `e9a99644`, comment only.
- **Multiuser `receive-asset` saves received assets to `assets/assets/<hash>.<ext>.png`** (F7), a
  path nothing references. So in a multiuser session, received emotion and additional assets
  likely do not resolve on the receiving side. This is a pre-existing bug, and it is not AV-4's.
- The gate's recommendations that were not adopted:
  - clearing the thumbnail store on backup or drive restore (`backuplocal.ts:511-513`,
    `drive.ts:341-345`). A thumbnail made from a partly corrupt asset could outlive the repair.
    That is a suspicion only; the keys are content hashes, so a repaired asset normally has the
    same key.
  - a JPEG fallback for JPEG sources on WebKit.
- `characters.ts:735-797` (the group-icon merge) draws the live `getCharImage` URL into a canvas.
  On Tauri that may taint the canvas. **UNVERIFIED**; never exercised on Tauri as far as the code
  shows.
- `inlayStorage` has no automatic eviction (F6).
- WebKit WebP encoding is UNVERIFIED. The PNG fallback covers correctness; a Tauri macOS or Linux
  user pays PNG size.

## 6. Gate instructions

Reviewer: `opus-reviewer` (asset caching plus a hook into the boot sweep). Try to falsify:

- F1–F9 against the source;
- the animation signatures, including byte offsets;
- the claim that no crop is needed (check how `BarIcon`/`SidebarAvatar` size and position the
  image, including the folder background div);
- the eligibility predicate against every `getFileSrc` branch;
- the safety of the sweep hook, especially which `cleanChunks` paths build a keep-set, and that a
  failure there cannot affect the existing sweeps;
- the memo caps, and whether the concurrency limit can deadlock or starve (an image whose decode
  never settles);
- the tests, especially that T9/T10 would fail on today's code where applicable.

Check this plan's citations and arithmetic.
