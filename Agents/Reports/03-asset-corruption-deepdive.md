# Investigation (Deep-Dive Pass 2): Asset Reference Resolution & Lifecycle Beyond Images

Read-only investigation. No source files were modified. Builds on `Agents/Reports/03-asset-corruption.md` (Pass 1, cross-validated by Codex adversarial review). This pass does **not** re-verify Pass 1's four confirmed mechanisms (`checkImg()` unbounded fuzzy collapse, `getUncleanablesSync` allowlist gaps, zero-byte SW cache poisoning, stale `risuSaveBlock_*` rows) — the first two of the four listed as "fixed" by the caller (`checkImg()` selector + zero-byte guards) were spot-checked as still present in current code (see Lead 1 and the file:line citations below) and are not revisited further. The `getUncleanablesSync` completeness gap is still open and is referenced here only where a *new* angle on it was found.

> **Cross-validated** via an independent Codex adversarial-review pass (`Agents/CodexReviews/03-asset-corruption-deepdive.codexreview.md`). Verdict: **partially confirmed with corrections**. BGM, inlay-lifecycle, and CHARX-precedence findings are confirmed as-is. Two findings were **reversed** on cross-validation, both downgraded from "checked, sound" to confirmed defects — see the corrected Lead 4 and the corrected import-collision note under Lead 2 below. Two more were narrowed: the module/character asset-name collision (Lead 6) picks *deterministically* per chat, not nondeterministically as the executive summary originally claimed; and the emotion-cache bug (Lead 5) is scoped to the current session only — `CharEmotion` is an in-memory, non-persisted store, so the "survives a restart" consequence originally described was invented and has been removed.

Current branch: `investigation/perf-persistence-assets-platform-baseline`. All citations are against the working tree at investigation time.

## Executive Summary

Six new, independently-confirmed findings, none previously documented:

1. **CONFIRMED (shared pipeline), GC-inheritance claim narrowed [corrected]** — Non-image asset tags (`video`, `audio`, `bgm`, `raw`, `path`, `bg`, `asset`) go through the *exact same* resolution pipeline as images (`getAssetSrc`/`getFileSrcCached`/`getClosestMatch` in `src/ts/parser/parser.svelte.ts`), so they identically inherit the (now-fixed) zero-byte cache bug, and are **not** subject to `ChatBody.svelte`'s `checkImg()` collapse bug, because that function's query selector only ever matches `<img>` elements. **The GC-allowlist claim was overstated**: sharing a byte-resolution pipeline does not by itself mean every video/audio/bgm reference inherits Pass 1's GC-allowlist gap — GC eligibility in `getUncleanablesSync` is determined by *which field* references the asset path, not by the rendered media type. Video/audio/bgm referenced via `additionalAssets` or module assets (the common case) are already correctly included in the allowlist, same as images referenced the same way. The actual elevated-risk fields identified in Pass 1 (`gptSoVitsConfig.ref_audio_data`, `NAIImgConfig.*`, `wavespeedImage.*`) remain elevated-risk regardless of media type — this is a per-field gap, not a per-media-type one.
2. **CONFIRMED BUG (new)** — The `<audio risu-ctrl="bgm___...">` player in `src/ts/observer.svelte.ts:60-72` only ever creates one `Audio` object and never updates or replaces it while it's alive (`if(!bgmElement)`), so switching to a chat/character with a *different* `{{bgm::name}}` reference during the same session can silently keep playing the previous (wrong) track instead of the new one.
3. **CONFIRMED BUG (new)** — `resetAssetsCache`/`getAssetSrc` in `src/ts/parser/parser.svelte.ts:410-421,451-461` pools character `additionalAssets` and *module* assets into the same `assetPaths[key]` bucket when an asset name+extension collide. If an installed module happens to define an asset with the same name as a character's own asset, `{{img::<name>}}` will resolve between the character's intended file and the unrelated module's file via a hash pick that's **[corrected]** deterministic per chat ID (not random/nondeterministic — see Lead 6 for the exact mechanism), so the same chat consistently gets the same (possibly wrong) file, but different chats using the same character/module pair can get different results. This is a genuinely new "wrong image, no error" mechanism, independent of all four Pass-1 bugs.
4. **CONFIRMED BUG (new), wording narrowed [corrected]** — The chat-attachment ("inlay") storage (`src/ts/process/files/inlays.ts`) has **no automatic boot-time GC at all** — the only *production* call site for `removeInlayAsset` is a manual user action in `src/lib/Playground/PlaygroundInlayExplorer.svelte` (a test file also calls it directly, so "the only call site in the whole codebase" was imprecise — the accurate claim is "the only production call site is manual"). This is largely the inverse risk profile from the main asset GC: orphaned inlay attachments accumulate forever (unbounded IndexedDB growth) with nothing to sweep them, and deleting a message never frees its inlay. **The "can never be wrongly deleted" framing was too absolute**: nothing in the app auto-deletes a *referenced* inlay, but a user manually deleting an attachment that's still referenced by a message (via the same Playground UI) is not prevented either — the real finding is "no automated cleanup of any kind, in either direction," not "referenced inlays are categorically safe."
5. **CONFIRMED BUG (new), scope corrected** — Emotion-image resolution caches a **resolved asset path by value**, not the emotion name, in the `CharEmotion` store (`src/ts/process/scripts.ts:184-206`, consumed by `src/ts/util.ts:336-348` → `getCharImage`/`getFileSrc`). If the user edits or removes that emotion image afterward (`rmCharEmotion`, `src/ts/characters.ts:183-189`, which only splices the array), the cached path is never invalidated, so the emotion box can keep trying to render a now-unreferenced (and GC-eligible) asset until the next `@@emo` trigger for that character. **[corrected]** This is scoped to the *current session only*: `CharEmotion` is an in-memory `writable` store (`src/ts/stores.svelte.ts:29`, initialized to `{}`) that is never persisted, so the stale entry does not survive an app restart — the originally-drafted "survives a restart and later renders a GC-deleted asset" consequence was not supported by the code and has been removed.
6. **CONFIRMED BUG (new, unrelated to media)** — `src/ts/process/processzip.ts:342`'s `.charx` import size gate, `if(file.originalSize ?? 0 < MAX_ASSET_SIZE_BYTES)`, is an operator-precedence bug: `??` binds looser than `<`, so this parses as `file.originalSize ?? (0 < MAX_ASSET_SIZE_BYTES)`, i.e. **the actual size comparison never happens** for any file whose `originalSize` is a known, non-nullish number — the intended pre-decompression size skip is dead code, and oversized files get fully decompressed into memory before the real, after-the-fact `byteLength` check (`processzip.ts:365-367`) excludes them.

**[corrected]** Character import/export (Lead 2) was checked and found sound on the specific risks originally feared (content-hash storage prevents name-based overwrite; missing-reference imports fail loud) — but a related ZIP-uniqueness assumption used to support that conclusion does not hold (see Lead 2 correction below). Group-chat asset exclusion (Lead 4) was originally reported as "checked, sound" — that verdict is **wrong** and has been reversed; see the corrected Lead 4 below.

---

## Lead 1 — Video/Audio/BGM Asset Resolution

**Verdict: CONFIRMED (shared pipeline) + CONFIRMED BUG (bgm playback layer, new)**

`assetRegex` (`src/ts/parser/parser.svelte.ts:408`) matches `raw|path|img|image|video|audio|bgm|bg|emotion|asset|video-img|source` in one regex, and every one of those types is handled inside the **same** `replaceAsync` callback in `parseAdditionalAssets` (`parser.svelte.ts:495-582`):

- Name lookup: same `assetPaths` map for all non-`emotion`/`source` types (`parser.svelte.ts:525`, built by `getAssetSrc` at `:410-421`, populated for both character `additionalAssets` and module assets at `:455-456`).
- Fuzzy fallback: same `getClosestMatch`/`getDistance`/`trimmer` (`:599-662`), gated by the same `DBState.db.legacyMediaFindings`/`assetMaxDifference` settings (`:527-529`, `:619`) — this fallback is **not image-specific**; a slightly-misspelled `{{video::…}}`, `{{audio::…}}`, `{{bgm::…}}` or `{{bg::…}}` tag is just as capable of fuzzy-resolving to the wrong asset as `{{img::…}}`, bounded only by `assetMaxDifference`.
- Byte resolution: same `getFileSrcCached`/`getFileSrc` (`:433-441`, `src/ts/globalApi.svelte.ts:115-224`) — meaning the same SW `/sw/img/` cache, the same `usingSw`/Tauri/account branches, and therefore the same (now-guarded) zero-byte cache-poisoning exposure (Pass 1 Hypothesis 1/3) applies identically to video, audio, and bgm assets — there is no separate, less-tested path for them at the storage layer. This directly answers the lead: non-image types are **not** independently implemented; they are thin `<video>`/`<audio>`/`risu-ctrl` wrappers around identical asset-resolution code. **[corrected]** The GC-allowlist exposure (Pass 1 Hypothesis 2) does *not* follow automatically from sharing this pipeline, though: `getUncleanablesSync` decides allowlist membership per-*field* (e.g. `additionalAssets`, `vits.files`, `gptSoVitsConfig.ref_audio_data`), not per rendered media type, so a video/audio/bgm asset referenced through an already-covered field (like `additionalAssets`) is just as protected as an image referenced the same way. The elevated-risk fields from Pass 1 remain elevated regardless of what media type they happen to point at.

Where they diverge is downstream, in the DOM-rescan layer:

- `ChatBody.svelte:185` — `checkImg()`'s query selector is `bodyRoot.querySelectorAll('img:not(...))')`. This can **only ever match `<img>` elements** (`parser.svelte.ts:557-560` for `img`/`image`; `emotion` at `:510`). `<video>` (`:561-564`), `<audio>` (`:565-566`), and the hidden `bgm` `<div>` (`:579`) are never selected by this query. **Video/audio/bgm are therefore immune to the Pass-1 `checkImg()` unbounded-fuzzy-collapse bug specifically** — that bug is scoped to `<img>` elements only, not a general media-asset bug as the lead's framing might suggest.
- Spot-check of the two "already-fixed" Pass-1 items, confirmed still present in current code: `ChatBody.svelte:185`'s selector now excludes `:not([src^="/sw/img/"])`, and `globalApi.svelte.ts:136-197`'s `getFileSrc` no longer memoizes a transient miss as permanently resolved (`fileCache.res[ind] = 'missing'` at `:189`/`:194`, retried via `shouldResolve = existing === 'missing'` at `:155`/`:161`).

**New finding — BGM playback never updates to a new track.** The `bgm` type renders as `<div risu-ctrl="bgm___auto___${p}" style="display:none;"></div>` (`parser.svelte.ts:579`), consumed by a global 100ms-polling observer in `src/ts/observer.svelte.ts`:

```
57:        const split = ctrlName.split('___');
58:
59:        switch(split[0]){
60:            case 'bgm':{
61:                const volume = split[1] === 'auto' ? 0.5 : parseFloat(split[1]);
62:                if(!bgmElement){
63:                    bgmElement = new Audio(split[2]);
64:                    bgmElement.volume = volume
65:                    bgmElement.addEventListener('ended', ()=>{
66:                        bgmElement.remove();
67:                        bgmElement = null;
68:                    })
69:                    bgmElement.play();
70:                }
71:                break
72:            }
```

`bgmElement` is a single module-level variable, and a new `Audio` is only ever constructed `if(!bgmElement)`. If the user switches to a different chat/character whose messages reference a *different* `{{bgm::name}}` while the previous track is still playing (or another `risu-ctrl="bgm___..."` node from older messages is still present anywhere in the DOM and gets polled first — `document.querySelectorAll('[x-hl-lang], [risu-ctrl]')` at `observer.svelte.ts:90` has no scoping to "current" content), the new `p` (resolved asset URL) in the freshly-rendered node's `risu-ctrl` attribute is **silently ignored** — no new `Audio` is created, no src is swapped, and the wrong track keeps playing (or none at all, if the first-seen node isn't the intended one) until the old track finishes and `bgmElement` resets to `null`. This is a genuine "resolves to the wrong asset, silently, no error" bug specific to the audio pathway.

## Lead 2 — Character Import/Export Asset Handling

**Verdict: CHECKED — NO ISSUE on both feared risks, but one CONFIRMED unrelated import bug found in the same code path.**

- **Storage-path collision:** `saveAsset()` (`src/ts/globalApi.svelte.ts:257-287`) derives the on-disk id from `hasher(data)` — a content hash, not a user-visible name (`:264`) — so two different imported characters can only collide on the *same file path* if their asset bytes are byte-for-byte identical, which is the dedup behavior working as intended, not corruption. No name-based overwrite risk was found.
- **`__asset:` dict collision during `.charx` import — [corrected]:** `CharXImporter#handleFile` (`src/ts/process/processzip.ts:335-339, 380-401`) keys `this.assetBuffers`/`this.assets` by `file.name`, the file's path inside the ZIP archive. The original draft of this section asserted ZIP archives cannot contain two entries with the same path — **that assumption is false**: the ZIP format permits duplicate member names (most tools that create ZIPs won't do this deliberately, but a hand-crafted or malformed `.charx` file can), and this codebase does not validate against it. Since both dictionaries are keyed solely by `file.name`, two same-named entries in one archive can overwrite or share state (and, since file processing is asynchronous, the final value that survives is whichever completes last, not necessarily first-in-archive-order). Content-hash-addressed storage (`saveAsset()`'s `hasher(data)`, see below) still prevents this from corrupting *previously-saved, unrelated* assets on disk, so this does not invalidate the "no name-based overwrite risk on disk" finding — but the import path itself is not collision-free the way originally claimed, and could produce an import where the wrong bytes end up associated with a given asset key mid-import.
- **Import leaving a character pointing at a never-written asset:** when `assetDict[key]` is missing for an `__asset:`-referenced entry, `importCharacterCardSpec` **throws** (`characterCards.ts:760`, `:787`, `:810`, `:859`, `:869`: `'Error while importing, asset ' + key + ' not found'`), aborting the whole import rather than silently leaving a dangling `assets/*` reference. This is a fail-loud design, not a silent-corruption one — good.

**New finding, same code path — CONFIRMED BUG.** The mechanism that *can* legitimately produce a missing `assetDict[key]` (a file excluded for being oversized, `processzip.ts:365-367`, `excludedFiles.push(fileName)`) is reachable via a broken pre-check:

```
processzip.ts:341-344
        // Only process files smaller than MAX_ASSET_SIZE_BYTES (50MB)
        if(file.originalSize ?? 0 < MAX_ASSET_SIZE_BYTES){
            file.start()
        }
```

`??` has lower precedence than `<`, and mixing them (unlike `??` with `||`/`&&`) is not a syntax error, so this parses as `file.originalSize ?? (0 < MAX_ASSET_SIZE_BYTES)`. Since `0 < MAX_ASSET_SIZE_BYTES` (`50 * 1024 * 1024`, `:9`) is always `true`, the right-hand side of `??` is always `true`, and `??` only falls through to it when `file.originalSize` is `null`/`undefined`. For any file where the ZIP's declared size is a normal, present, **positive** number, the `if` condition literally evaluates to `file.originalSize` itself (truthy) — the comparison against `MAX_ASSET_SIZE_BYTES` **never executes** for those files. **[corrected]** "Every file" overstated this: `??` only triggers on `null`/`undefined`, not on falsy-but-present values — a file whose `originalSize` is genuinely `0` makes the condition evaluate to `0` (falsy), so `file.start()` is *not* called for a zero-sized entry (it's silently skipped rather than size-gate-bypassed). The dead-code bug applies to every file with a positive, non-nullish `originalSize` — the overwhelming majority of real files — not literally every file without exception. The intended "skip decompressing huge files early" gate is dead code; every file (regardless of size) gets `file.start()`'d and fully buffered into memory (`#handleFileData`/`AppendableBuffer`, `:337`, `:351-356`) before the real, after-the-fact `byteLength > MAX_ASSET_SIZE_BYTES` check (`:365-367`) finally excludes it. Practical effect: importing a `.charx` with a very large embedded asset can consume far more memory/time than the 50MB cap was meant to bound, and on constrained devices (mobile/low-RAM Tauri) this raises the odds of an OOM or crash mid-import, which — given `#processAssetQueue` assigns to `this.assets[asset.id]` only after a successful `saveAsset` (`:391-409`) — could leave the import in a partially-completed state (some assets saved to storage, `cardData` already extracted, but `done()` never resolved cleanly). This isn't the "silent wrong resolution" class from Pass 1, but it is a concrete, confirmed bug in the same import path the lead asked about.

## Lead 3 — Inlay (Chat Attachment) Storage Integrity

**Verdict: CONFIRMED — inverse risk profile from the main asset cache; no GC exists.**

`src/ts/process/files/inlays.ts:30-33` confirms the lead's assumption: a dedicated `localforage.createInstance({name: 'inlay', storeName: 'inlay'})`, separate from the main `forageStorage` asset store. Key observations:

- **No SW/CacheStorage layer.** Inlays never go through `/sw/img/`, `/sw/register/`, or `getFileSrc`. Images/audio/video are read directly via `getInlayAssetBlob(id)` (`inlays.ts:190-206`) and turned into a `blob:` URL cached in a module-level `Map` in the parser (`parser.svelte.ts:664`, `parseInlayAssets` at `:666-701`). This means the zero-byte cache-poisoning bug (Pass-1 Hypothesis 1/3) **structurally cannot occur** for inlays — there is no intermediate cache to poison, `inlayStorage` (IndexedDB via localforage) is the one and only source of truth.
- **No boot-time cleanup analogous to `cleanChunks()`.** A repo-wide search for `removeInlayAsset` call sites finds one production call site, a user-initiated delete button in `src/lib/Playground/PlaygroundInlayExplorer.svelte:56,71` (**[corrected]**: a test file also calls this function directly for test setup/teardown — the accurate claim is "one production call site," not "the only call site in the whole codebase"). There is no equivalent of `bootstrap.ts:511` (`cleanChunks`) for the `inlay` forage instance, and no code path that scans chat message bodies for `{{inlay::id}}`/`{{inlayed::id}}` references and reconciles them against `inlayStorage`'s contents. Consequence: deleting a chat message, an entire chat, or a character does not free the inlay blobs it referenced — `inlayStorage` grows without bound over the life of the profile. **[corrected]** Describing this as "inlays can never be wrongly deleted" overstates the safety: there is simply no *automatic* deletion in either direction (no auto-GC of orphans, no auto-protection of referenced ones) — a manual delete via the same Playground UI can still remove an inlay a message still references, since nothing checks reference-in-use before allowing that action. This is primarily storage bloat, not corruption, but it is a real, previously undocumented gap in the same "asset lifecycle" space the investigation is about.
- **Minor, low-severity:** `getInlayAssetBlob` (`inlays.ts:190-206`) migrates legacy base64-string-backed entries to `Blob` in place via `setInlayAsset(id, {...img, data})` at `:200` **without `await`ing it** — a fire-and-forget write. Two concurrent reads of the same legacy entry could both perform the migration redundantly; harmless (same resulting bytes either time) but worth noting as sloppy, not as a corruption source.

## Lead 4 — Group-Chat Asset Handling Exclusion

**Verdict: [corrected] CONFIRMED BUG (reopened) — the original "checked, no issue" verdict in this section was wrong.** The original draft of this section read the `groupChat` interface only through line 1548 and concluded it has no `additionalAssets`/`vits`/`ccAssets` fields at all. That is factually false: `groupChat` (`src/ts/storage/database.svelte.ts:1510-1580`) **does** declare `vits?: OnnxModelFiles` at line 1557 and `additionalAssets?:[string, string, string][]` at line 1570 (both under a `//lazy hack for typechecking` comment block starting at line 1550 — `ccAssets` is genuinely absent, so that specific part of the original claim stands). This was caught by an independent Codex adversarial-review pass, not found in the original investigation.

`src/ts/globalApi.svelte.ts:1039-1057`:
```
1039:        if (cha.type !== 'group') {
1040:            if (cha.additionalAssets) { ... }
1045:            if (cha.vits) { ... }
1052:            if (cha.ccAssets) { ... }
1057:        }
```

Since `groupChat` objects genuinely have `additionalAssets` and `vits` fields on their type, `getUncleanablesSync`'s blanket `cha.type !== 'group'` guard skips adding *those two fields'* asset references to the boot-time GC allowlist for every group-chat entry — meaning if a `groupChat` object ever has non-empty `additionalAssets`/`vits` data (populated via import, legacy migration, or any code path that writes to a `groupChat` using the shared `character|groupChat` type without checking `type`), those referenced assets would be silently deleted on the next `cleanChunks()` boot sweep, exactly the same failure class as Pass 1's Hypothesis 2 (incomplete GC allowlist), just via an additional, previously-undocumented field-exclusion path.

**What remains genuinely unverified** (flagging honestly rather than overcorrecting into a second overstated claim): whether `groupChat.additionalAssets`/`.vits` are ever actually *populated* with real data in practice — the "lazy hack for typechecking" comment suggests these fields may exist on the type purely so shared `character|groupChat`-typed code compiles without narrowing, and might never be assigned real values through any normal UI flow for an actual group chat. This distinction matters: if nothing ever writes to `groupChat.additionalAssets`/`.vits`, the GC-allowlist gap is latent/inert; if anything does (e.g. a data-migration path, a plugin, or a future feature), it's a live data-loss bug today. This determination was not made in the time available for this pass and is flagged as a concrete follow-up rather than asserted either way.

The rest of the original section's reasoning stands: a group's `characters: string[]` holds `chaId` references into `db.characters`, where each member is its own separate `type: 'character'` entry that goes through the same `getUncleanablesSync` loop unaffected by this bug (their own `additionalAssets`/`vits`/`ccAssets` are added to the uncleanable set normally, since `cha.type !== 'group'` is true for them). `emotionImages` is shared by both types and is correctly added unconditionally at `:1034-1038`. The risk identified here is scoped specifically to a `groupChat` object's *own* `additionalAssets`/`vits` fields, not to its members' assets.

## Lead 5 — Emotion Image Resolution

**Verdict: CONFIRMED BUG (new) — stale cached path, distinct from the general asset-resolution bugs.**

Trigger mechanism: a regex script with `@@emo <name>` as its output (`src/ts/process/scripts.ts:184-206`):
```
194:                        if(char.type !== 'simple'){
195:                            for(const emo of char.emotionImages){
196:                                if(emo[0] === emoName){
197:                                    const emos:[string, string,number] = [emo[0], emo[1], Date.now()]
198:                                    tempEmotion.push(emos)
199:                                    charemotions[char.chaId] = tempEmotion
200:                                    CharEmotion.set(charemotions)
```
On a match, the **resolved path** `emo[1]` (not the name `emo[0]`) is copied by value into the `CharEmotion` Svelte store, keyed by `char.chaId`, capped at 4 entries (`:191-193`).

Rendering: `EmotionBox.svelte:8` calls `getEmotion(DBState.db, $CharEmotion, 'contain')` (`src/ts/util.ts:291`), which for the `viewScreen === 'emotion'` case does:
```
util.ts:336-344
        if(currentChar.viewScreen === 'emotion'){
            const currEmotion = chaEmotion[currentChar.chaId]
            let im = ''
            if(!currEmotion || currEmotion.length === 0){
                im = (await getCharImage(defaultEmotion(currentChar?.emotionImages),type))
            }
            else{
                im = (await getCharImage(currEmotion[currEmotion.length - 1][1], type))
            }
```
The non-empty branch (`:343`) passes the **cached path** straight to `getCharImage(loc, type)` (`src/ts/characters.ts:54-86`), which calls `getFileSrc(loc)` directly (`:71`) — there is no re-lookup by emotion name against the character's *current* `emotionImages` array at render time.

The invalidation gap: `rmCharEmotion(charId, emotionId)` (`src/ts/characters.ts:183-189`) is the only path found that removes an emotion image, and it does nothing but `dbChar.emotionImages.splice(emotionId, 1)` — it never touches the `CharEmotion` store, never checks whether the removed entry is currently cached as "last shown" for that character, and there is no reverse index from path back to cache entries to invalidate. `addCharEmotion` (`characters.ts:162-178`) similarly just appends a new `[name, path]` pair without touching any existing cached emotion.

Consequence: if a user removes or replaces (delete + re-add under the same name) an emotion image via `CharConfig.svelte` while that exact emotion is the most-recently-triggered one for the character, `EmotionBox` keeps resolving the **old, now-orphaned** path via `getFileSrc` until the next `@@emo` trigger for that character overwrites the cache entry. **[corrected]** The verified impact is scoped to **in-session stale rendering only**: `CharEmotion` (`src/ts/stores.svelte.ts:29`) is an in-memory `writable` store, not persisted to `DBState`/save data, so it does not survive an app restart. The originally-drafted scenario — a mid-session emotion swap followed by an app restart carrying the stale path forward into a genuinely-GC'd-file failure — is **not supported** by the code: on restart, `CharEmotion` re-initializes to `{}`, and the stale path is gone along with it. The real, confirmed bug is narrower: within one running session, after removing/replacing an emotion, the character's emotion box can keep showing the old image until the next `@@emo` trigger for that character, which is still a genuine (if less severe) instance of the investigation's "resolves to stale/wrong asset, no error" failure class. This is scoped to `viewScreen === 'emotion'`; the `imggen`/other view-screen branches (`util.ts:349` onward) were not found to have the same value-vs-name caching pattern in the portion read.

## Lead 6 — Other Findings in the Same Failure Class

**CONFIRMED BUG (new) — Character-asset/module-asset name collision silently blends unrelated assets.**

`resetAssetsCache` (`parser.svelte.ts:451-461`) builds one shared `assetPaths` map from *both* the character's own assets and every currently-active module's assets:
```
451:export function resetAssetsCache(charAssets: string[][], emoAssets: string[][], moduleAssets: string[][]) {
452:    const assetPaths: AssetPaths = {}
...
455:    getAssetSrc(charAssets, assetPaths)
456:    getAssetSrc(moduleAssets, assetPaths)
```
and `getAssetSrc` (`:410-421`) does:
```
410:function getAssetSrc(assetArr: string[][], assetPaths: AssetPaths) {
411:    for (const asset of assetArr) {
412:        const key = asset[0].toLocaleLowerCase()
413:        assetPaths[key] ??= { srcPaths: [], ext: asset[2] }
414:        if(assetPaths[key].ext === asset[2]){
415:            assetPaths[key].srcPaths.push(asset[1])
416:        }
417:    }
418:}
```
Because `charAssets` is processed first and `moduleAssets` second **into the same object**, if a module (which may be installed independently by the user, from a marketplace, unrelated to the character author) happens to define an asset with the same lowercased `name` and the same `ext` as one of the character's own `additionalAssets` entries, the module's `srcPaths` entry is appended alongside the character's — not rejected, not namespaced. At render time (`parseAdditionalAssets`, `:541-550`), when `match.srcPaths.length > 1`, a deterministic-but-opaque-to-the-user hash pick (`pickHashRand(chatID, ...)`, `:546-549`) selects between them per chat. The result: `{{img::<name>}}` (or `video`/`audio`/`asset`/etc.) can silently render the *module's* unrelated asset instead of the character's intended one, purely because of a name collision — with no error, no warning, and behavior that varies by chat ID. This fits the investigation's "silently resolves to the wrong thing" failure class precisely and is independent of every Pass-1 mechanism. (The multi-source `srcPaths` array is an intentional feature for a *single* character's own same-named asset variants — e.g. multiple "random" images for one emotion tag — the bug is specifically that module assets are pooled into the *same* bucket as character assets rather than kept separate or given precedence rules.)

**COULDN'T DETERMINE (flagged, not chased further) — module-asset cache staleness on module toggle.** `assetsCache`/`emoAssetsCache` (`parser.svelte.ts:448-449`) are module-level (not per-character) variables, refreshed by an `$effect.root` that depends on `selIdState.selId`/the current character object (`:463-477`) and lazily inside `parseAdditionalAssets` only `if (!assetsCache || !emoAssetsCache)` (`:485-487`). Whether toggling a module on/off *without* switching characters reliably re-triggers this effect depends on whether `getModuleAssets()` (`src/ts/process/modules.ts:444-456`, itself built on `getModules()`'s `lastModules`-keyed memoization at `:398-418` — not fully read in this pass) reads reactive `$state` in a way Svelte 5's effect tracking picks up. Not confirmed either way in the time available; worth a follow-up if module-asset staleness is ever reported.

---

## Recommendations, Ranked by (Impact, Effort)

1. **(High impact, Low effort) Namespace module assets separately from character assets in `resetAssetsCache`/`getAssetSrc`** (Lead 6), e.g. give module-sourced entries a distinct key prefix, or have character-asset entries take strict precedence over module entries on name collision instead of pooling into the same `srcPaths` array. This is a one-function fix that closes a silent-wrong-image bug with no opt-in gate (unlike `checkImg()`'s `newImageHandlingBeta`), so it is live for every user today.
2. **(Medium impact, Low effort) Fix the `.charx` import size-gate operator-precedence bug** (`processzip.ts:342`): parenthesize as `if((file.originalSize ?? 0) < MAX_ASSET_SIZE_BYTES)`. Cheap fix, removes a real resource-exhaustion/partial-import-failure risk on large `.charx` files.
3. **(Medium impact, Low effort) Invalidate or re-key `CharEmotion` on emotion edit/removal** (Lead 5): have `rmCharEmotion`/the emotion-replace flow in `CharConfig.svelte` clear or update any `CharEmotion` entry whose cached path matches the removed/replaced image, or switch the cache to store the emotion *name* and re-resolve the path at render time in `getEmotion()`/`EmotionBox.svelte` instead of caching the resolved path by value.
4. **(Medium impact, Low effort) Fix `bgm` playback to react to a changed `risu-ctrl` src** (Lead 1): track the currently-playing source string and re-create/redirect `bgmElement` when a newly-observed `risu-ctrl="bgm___..."` node's `p` differs from what's currently playing, instead of gating solely on `!bgmElement`.
5. **(Low-Medium impact, Medium effort) Add an opt-in or automatic orphan sweep for `inlayStorage`** (Lead 3): since there is currently zero cleanup, even a manual "clean unused attachments" action (scan all chats for `{{inlay(ed)?::id}}` references, diff against `inlayStorage` keys, prompt before deleting) would close the unbounded-growth gap; given the inverse risk profile (never wrongly deletes something referenced, by construction — there's no allowlist to get wrong), this is lower-risk to add than the equivalent for main assets.
6. **(Low impact, Low effort) `await` the legacy-format migration write in `getInlayAssetBlob`** (`inlays.ts:200`) to avoid the redundant-write race on concurrent reads of the same legacy base64 entry.

## Files Read During This Pass

- `C:\Projects\RisuAI\Agents\Reports\03-asset-corruption.md` (Pass 1, read in full first)
- `C:\Projects\RisuAI\src\ts\parser\parser.svelte.ts` (`assetRegex`, `getAssetSrc`, `getEmoSrc`, `resetAssetsCache`, `parseAdditionalAssets`, `getClosestMatch`, `getDistance`, `trimmer`, `parseInlayAssets`, `blobUrlCache`)
- `C:\Projects\RisuAI\src\ts\observer.svelte.ts` (`risu-ctrl` / `bgm` DOM-poll handler)
- `C:\Projects\RisuAI\src\ts\globalApi.svelte.ts` (`getFileSrc`, `saveAsset`, `loadAsset`, `getUncleanables`, `getUncleanablesSync`)
- `C:\Projects\RisuAI\src\ts\characterCards.ts` (`importCharacterProcess`, `importCharacterCardSpec` emotion/additionalAssets/vits/v3-assets import branches, `__asset:` export encoding)
- `C:\Projects\RisuAI\src\ts\process\processzip.ts` (`CharXImporter`: `#handleFile`, `#handleFileData`, `#handleFileComplete`, `#processAssetQueue`)
- `C:\Projects\RisuAI\src\ts\process\files\inlays.ts` (full file: `postInlayAsset`, `writeInlayImage`, `getInlayAsset`, `getInlayAssetBlob`, `listInlayAssets`, `setInlayAsset`, `removeInlayAsset`)
- `C:\Projects\RisuAI\src\lib\Playground\PlaygroundInlayExplorer.svelte` (only `removeInlayAsset` call site)
- `C:\Projects\RisuAI\src\ts\storage\database.svelte.ts` (`groupChat` interface, lines 1510-1550)
- `C:\Projects\RisuAI\src\ts\process\scripts.ts` (`@@emo` trigger handling)
- `C:\Projects\RisuAI\src\ts\util.ts` (`getEmotion`, `defaultEmotion`)
- `C:\Projects\RisuAI\src\lib\ChatScreens\EmotionBox.svelte` (full file)
- `C:\Projects\RisuAI\src\ts\characters.ts` (`getCharImage`, `addCharEmotion`, `rmCharEmotion`, `selectCharImg`)
- `C:\Projects\RisuAI\src\ts\process\modules.ts` (`getModules`, `getModuleAssets`, `getModuleTriggers`)
- `C:\Projects\RisuAI\src\lib\ChatScreens\ChatBody.svelte` (`checkImg` selector, spot-check only)
