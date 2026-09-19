# RisuAI Performance / RAM — Second-Pass Deep Dive

Scope: read-only static analysis of `C:\Projects\RisuAI`, following on from `Agents/Reports/01-performance-ram.md` (first pass, cross-validated). No source files were modified in this pass. This report does **not** re-verify hypotheses the first pass already confirmed — it hunts for the same *class* of bug (unnecessary live-state aliasing, eager deep-clone-on-change-detection, unbounded list rendering, unbounded in-memory caches) in places the first pass did not look. Every claim is tagged **CONFIRMED BUG**, **CONFIRMED NOT AN ISSUE** (checked, ruled out), or **COULDN'T DETERMINE**, with `file:line` citations.

**Phase 0 status check (baseline for this pass):** the duplicate-`.push()` bug in `ModuleSettings.svelte`'s "create module" flow (first report §7) is fixed — the second push at what is now `ModuleSettings.svelte:181-186` was removed and replaced with a comment explaining why. The live-state-aliasing itself (`tempModule = rmodule`, now `ModuleSettings.svelte:110`; and the immediate `DBState.db.modules.push(tempModule)` on "create" at `ModuleSettings.svelte:157`) is **unchanged** — only the duplicate-insertion bug was fixed, not the underlying no-draft pattern. The `saveDb()` autosave effect structure in `globalApi.svelte.ts:355-428` is also structurally unchanged from the first report (verified by reading it directly) — Phase 0 only added retry/merge handling around it (`mergeUnsavedChanges`, `globalApi.svelte.ts:435-448`), not a change to the snapshot pattern itself.

---

## Executive Summary

- **New confirmed bug, comparable severity to the Module editor finding: an unbounded, never-evicted in-memory image-byte cache.** `fileCache` (`src/ts/globalApi.svelte.ts:99-104`) permanently accumulates the full raw `Uint8Array` bytes of every asset (character portraits, emotion sprites, backgrounds, module images) ever resolved through `getFileSrc()` in the non-Tauri/non-service-worker code path (`globalApi.svelte.ts:199-219`), with no cap, no LRU, no clear call anywhere in the file. It also re-encodes the cached bytes to base64 on every single call that needs that asset's src (not just on first load), which is redundant CPU work on top of the memory issue. This is a genuinely new finding, not covered in the first pass, and is arguably more broadly reproducible than the Module editor bug since it fires from ordinary browsing, not just module editing.
- **New confirmed bug: an unbounded in-memory translation cache.** `translator.ts:22-25`'s module-level `cache = {origin: [''], trans: ['']}` grows by one string pair per unique translated string for the life of the session, looked up via linear `Array.indexOf()` scans, with no eviction — distinct from, and in addition to, the properly disk-backed `LLMCacheStorage` (IndexedDB via localforage) in the same file.
- **The Module editor's live-state-aliasing pattern (Pattern A) does not recur verbatim anywhere else** — a repo-wide grep confirms `ModuleSettings.svelte` is the only place using the specific "assign a live array element to a local `$state` variable, then bind an editor to that variable" shape. However, the **LoreBook entry editor** and the **Custom/Regex Script editor** achieve the functional equivalent through Svelte's native `bind:value={array[i]}` prop-drilling all the way from the list component down to the text field, with no draft copy at any point — same "no draft, direct live mutation" root cause, different code shape. This was not identified in the first pass because it doesn't look like the Module editor's code.
- **Pattern B (`$state.snapshot()` inside a reactive block just to force change-detection) has two more instances beyond `saveDb()`/`stores.svelte.ts`**, one of them a real per-AI-response full-character (all chats) deep clone gated behind plugin usage (`src/ts/process/index.svelte.ts:57-77`), not previously documented.
- **No virtual scrolling exists anywhere in `src/lib`, confirmed to also hold for the LoreBook list, Regex/Trigger script lists, character list, and persona list** — same absence as the already-documented chat message list, but in practice lower risk since these lists rarely reach the sizes a long chat history does.
- **Plugin iframe sandboxes (API v3) are correctly cleaned up** — reloading plugins terminates every existing `SandboxHost` (removes its iframe, clears its listeners/registries) before creating new ones. This lead is ruled out.

---

## Lead 1: Is the Module editor's live-state-aliasing bug (Pattern A) repeated elsewhere?

### CONFIRMED BUG (same root cause, different shape) — LoreBook entry editor
`src/lib/SideBars/LoreBook/LoreBookList.svelte:421` (and the `submenu===1`/`globalMode` variants at lines 370/472) pass `bind:value={DBState.db.characters[$selectedCharID].globalLore[i]}` straight into `LoreBookData.svelte`, whose `value` prop is `$bindable()` (`LoreBookData.svelte:31`). Inside, every field is bound directly to that live object: `TextInput size="sm" bind:value={value.comment}` (`LoreBookData.svelte:199/226`), `bind:value={value.key}` (`:231`), `bind:value={value.secondkey}` (`:236`), and critically `TextAreaInput highlight autocomplete="off" bind:value={value.content}` (`LoreBookData.svelte:258`) for the (potentially large) lore entry body. There is no local draft object anywhere in this chain — every keystroke in a lorebook entry's content field mutates `DBState.db.characters[...].globalLore[i].content` directly, which is exactly the "no draft, direct live mutation" root cause behind the Module editor bug. It differs from the Module editor's code shape (native `bind:` chaining vs. a local-variable alias), which is why it wasn't caught by the first, hypothesis-anchored pass — but the consequence is the same: this field is part of `DBState.db.characters[selIdState][key]` and gets swept into the per-character-field snapshot loop in `globalApi.svelte.ts:410-415` on every keystroke (see Lead 2 for the magnitude discussion — `globalLore` is a full array of lore entries, not a scalar, so this clone is non-trivial for characters with many lorebook entries).

**Also new (not Pattern A, but found while reading this component):** `LoreBookData.svelte:259`, `{#await getTokens(value.content)}`, re-invokes `tokenizeAccurate(data)` (`LoreBookData.svelte:46-49`) every time `value.content` changes — i.e., on every keystroke in the lore content field (subject to whatever internal debouncing `TextAreaInput` does, per the first report's `optimaizedInput` finding). Full BPE-style tokenization on every keystroke of a potentially long lorebook entry is a CPU cost with no visible debounce at the call site itself.

### CONFIRMED BUG (same root cause, different shape) — Custom/Regex Script editor
`src/lib/SideBars/Scripts/RegexList.svelte:73`: `<RegexData idx={i} bind:value={value[i]} .../>` where `value` is the live `customscript[]` array (traced from `RegexData.svelte:16` `value: customscript` prop, `$bindable()` at `RegexData.svelte:24`). Fields bind directly: `TextInput size="sm" bind:value={value.comment}` (`RegexData.svelte:112`), and further down (not shown in the excerpt read but same pattern continues) the script's in/out regex and replace strings. Same conclusion as the LoreBook editor: no draft, direct live mutation, swept into the per-character-field clone whenever the script lives on a character (`customscript` also appears at module/global scope — see below).

### CONFIRMED NOT AN ISSUE — Persona editor
`src/lib/Setting/Pages/PersonaSettings.svelte`. Persona name/note/description fields bind directly to flat, top-level `DBState.db` string fields (`bind:value={DBState.db.username}` `:134`, `bind:value={DBState.db.userNote}` `:137`, `bind:value={DBState.db.personaPrompt}` `:140`) — there is no separate array/object being deep-cloned per keystroke beyond what the already-documented top-level-key snapshot loop (`globalApi.svelte.ts:401-409`) already does for *any* top-level scalar field. Structurally "direct bind, no draft" like the others, but the clone target is a single string, not a large nested array — magnitude is not comparable to the Module/LoreBook/Script cases. Ruling this out as a distinct bug; it's already covered by the first report's general Pattern B finding.

### CONFIRMED NOT AN ISSUE — Preset editor
`src/ts/storage/database.svelte.ts:2148-2157` (`changeToPreset`) and `:2159+` (`setPreset`) copy fields *out of* a `botPreset` object *into* top-level `DBState.db` fields (`db.mainPrompt = newPres.mainPrompt ?? db.mainPrompt`, etc.) when a preset is selected. The actual prompt-editing UI (in `PromptSettings.svelte` / `BotSettings.svelte`) then binds to those same top-level scalar fields, not to `DBState.db.botPresets[i]` directly. `src/lib/Setting/botpreset.svelte` (the preset *list*) only binds a preset's `name` directly (`botpreset.svelte:192`, `bind:value={DBState.db.botPresets[i].name}`) while in rename mode — a single scalar field, not a large nested structure. No live-clone-of-a-big-array bug here; ruled out.

### CONFIRMED NOT AN ISSUE (for Pattern A specifically) — CharConfig / character detail editor
`src/lib/SideBars/CharConfig.svelte` reads/writes `DBState.db.characters[$selectedCharID]` directly 251 times in this one file — there is no local draft object for the character editor at all, every field (`bias`, `alternateGreetings`, `additionalAssets`, `ccAssets`, TTS config, etc.) is bound straight to live state. This is architecturally the same "no draft" pattern as everywhere else in the app, but it is **not** an additional/distinct bug beyond what the first report already flagged as the `saveDb()` character-field clone cost (§2 of the first report) — there's no separate local-variable-aliasing trick here that doubles the clone cost the way the Module editor's `tempModule` pattern did. Ruled out as a *new* finding; it's the same already-documented mechanism, not a repeat of the Module-specific double-clone bug.

### Repo-wide check for the exact Module-editor code shape
`grep -rn "= rmodule\|= rchar\|= rpersona\|= rpreset"` across `src/lib` returns only `ModuleSettings.svelte`. A broader check for "`let temp... = $state(...)`"/"`let edit... = $state(...)`" local-draft-looking declarations across `src/lib` (`Grep` on `let temp\w* = \$state\(|let edit\w+ = \$state\(`) turns up `editMode`/`editText`/`editTranslationMode` booleans/strings in `SideChatList.svelte`, `Sidebar.svelte`, `Chat.svelte`, `lorepreset.svelte`, `botpreset.svelte`, `ChatList.svelte`, and `PartialEditController.svelte:43` — none of these alias a live array element into local state the way `ModuleSettings.svelte:110`/`:17` does. **Confirmed: the exact Module-editor code shape is unique to `ModuleSettings.svelte`.** The functionally-equivalent bug (no draft copy at all, via native prop binding instead) is what recurs in the LoreBook and Script editors above.

### Positive counter-example found while checking this lead
`src/lib/ChatScreens/PartialEditController.svelte:43`, `let editText = $state('')`, is a genuine local draft — the component edits `editText` locally and only commits back via `dispatch('save', ...)` on explicit user action, never touching `DBState` directly while typing. This is the pattern the Module/LoreBook/Script editors should be using instead, and it already exists elsewhere in the codebase as prior art.

---

## Lead 2: Is the `$state.snapshot()`-inside-a-reactive-block pattern (Pattern B) repeated outside `saveDb()`?

Full-repo grep for `$state.snapshot(` (all of `src`, `.ts`/`.svelte`), cross-referenced against whether each call site sits inside a `$effect`/`$derived` (eager, reactive, re-runs on every dependency change) versus a one-off event handler (runs once per explicit user action).

### Already known (re-verified, unchanged)
- `globalApi.svelte.ts:382/387/392/397` — `modules`/`loadouts`/`plugins`/`pluginCustomStorage` sibling effects inside `saveDb()`. Unchanged from first report.
- `globalApi.svelte.ts:407` (loop over all top-level DB keys) and `:413`/`:416` (per-character-field loop + full `chats` array) — unchanged.
- `stores.svelte.ts:196` — the `modules` full-array snapshot inside the `moduleUpdate()`-triggering effect. Unchanged.

### CONFIRMED BUG (new) — `$state.snapshot()` inside a `$derived.by()` in the popup text editor
`src/lib/Others/PopupEditor.svelte:17-28`:
```ts
let chatParserValue = $derived.by(() => {
    if(!previewing){ return '' }
    try {
        $state.snapshot(DBState.db.globalChatVariables)
    } catch (error) {}
    return risuChatParser(popUpEditorStore.value)
})
```
This snapshot's return value is discarded — it exists purely to make `chatParserValue` reactively depend on `DBState.db.globalChatVariables` (an eager-recompute-via-derived pattern, the `$derived` sibling of the `$effect`-based Pattern B). It re-runs, and re-snapshots the entire `globalChatVariables` object, every time `popUpEditorStore.value` changes while `previewing` is `true` — i.e., every keystroke in the popup editor with preview mode on. In practice `globalChatVariables` is usually a small map of a handful of chat-scoped variables, so the *magnitude* is likely much lower than the `modules`/`chats` clones, but it is the same anti-pattern and was not previously documented. Flagging as confirmed-present, magnitude unverified (**COULDN'T DETERMINE** how large `globalChatVariables` typically grows in a real session — would need runtime data, not static analysis).

### CONFIRMED BUG (new) — per-AI-message full-character deep clone for plugin chat-output listeners
`src/ts/process/index.svelte.ts:57-77`:
```ts
async function runChatOutputListeners(char: any, chat: any, characterIndex: number, chatIndex: number, messageIndex: number){
    if(pluginV2.chatOutput.size === 0){ return }
    const charSnapshot = $state.snapshot(char)   // line 62 — full character, ALL its chats
    const chatSnapshot = $state.snapshot(chat)   // line 63 — the active chat again
    for(const listener of pluginV2.chatOutput){ ... }
}
```
This is not inside a `$effect` — it's called directly once per chat-output event (i.e., once per AI message received), gated behind `pluginV2.chatOutput.size === 0` so it's a no-op unless a V2 plugin has registered a `chatOutput` listener. When gated open, it deep-clones the **entire character object** (`char`, which — per the first report's §1 — includes that character's full `chats` array, not just the active chat) plus the active `chat` object again, on every single AI response. This is lower-frequency than a per-keystroke cost (once per message, not once per character typed) but potentially much larger in absolute bytes for characters with long chat histories, and it was not covered by the first pass since it isn't part of `saveDb()`. Confirmed present; severity scales with how many users actually have V2 plugins with `chatOutput` listeners enabled — **COULDN'T DETERMINE** real-world prevalence from static analysis.

### CONFIRMED NOT AN ISSUE — remaining `$state.snapshot()` call sites
All other call sites are one-off, user-action-triggered snapshots of a single record (not swept up by a reactive effect, so no per-keystroke repetition):
- `src/lib/ChatScreens/Chat.svelte:924` — branch-chat button handler, snapshots one `Chat` object once per branch action.
- `src/lib/SideBars/SideChatList.svelte:267` and `:378` — "copy chat" context-menu action, snapshots one `Chat` once per copy action.
- `src/lib/SideBars/Sidebar.svelte:150` — folder drag handler, snapshots one folder object once per drag start.
- `src/lib/UI/Realm/RealmUpload.svelte:88` — share-to-hub button handler, snapshots one character once per share action.
- `src/ts/storage/database.svelte.ts:734` — `$state.snapshot(DBState.db)` inside `getDatabase()`'s non-reactive-context fallback path, used for the save pipeline itself (already covered conceptually by the first report's §6 on `RisuSaveEncoder`).
- `src/ts/plugins/apiV3/v3.svelte.ts:767/798/834/865/884/961` — plugin API v3 surface (`db.getLiteDB()`, `getChar()`, `getChat()`, etc.), all invoked on-demand when a plugin explicitly calls the API, not from a standing `$effect`.
All of the above are ruled out as Pattern-B repeats — they run once per explicit action, not reactively on every keystroke.

---

## Lead 3: Unbounded list rendering beyond the chat message list

Re-confirmed absence of any virtualization/windowing library (`grep -i "virtual\|IntersectionObserver"` across `src/lib` still only matches unrelated identifiers, as the first report found). Checked every other data-heavy list:

| List | File:line | Rendering approach | Risk assessment |
|---|---|---|---|
| Chat message list | `DefaultChatScreen.svelte` (per first report) | Paginated load (`loadPages`), never unmounts | **Already documented — highest risk, unbounded within one long chat.** Re-confirmed still no virtualization (`grep -i "virtual\|IntersectionObserver\|svelte-virtual"` on `DefaultChatScreen.svelte` — no matches). |
| LoreBook entry list | `LoreBookList.svelte:419` (`{#each DBState.db.characters[$selectedCharID].globalLore as book, i}`), `:470` (chat-local lore), plus a `Sortable.js` DOM-manipulation layer on top | Plain `{#each}`, full array, every time | CONFIRMED no windowing. Lower risk than chat in practice — lorebook entries per character are typically tens, not thousands — but a character with a very large worldbook would fully mount every entry's edit UI once opened. |
| Regex/Custom script list | `RegexList.svelte:72` (`{#each value as customscript, i}`) | Plain `{#each}` | CONFIRMED no windowing. Script counts are typically small (tens); low practical risk. |
| Trigger list (v2) | `TriggerV2List.svelte:2469/2702/2733/3055` (multiple `{#each value as trigger, i}` blocks, including a nested `{#each ...effect}` per trigger) | Plain `{#each}`, and a *nested* each over each trigger's effect array | CONFIRMED no windowing; the nested per-trigger effect-array `{#each}` means total DOM nodes scale with triggers × effects-per-trigger, not just trigger count. Still typically small in absolute count. |
| Character list (desktop) | `Sidebar.svelte:563` (`{#each charImages as char, ind}`), `:726` (nested `{#each char.folder as char2, ind}`) | Plain `{#each}` | CONFIRMED no windowing (matches first report's conclusion). Character counts are usually far smaller than message counts; low practical risk, but note this list also recomputes portrait image lookups (`{#await getCharImage(...)}`) per visible item on every re-render. |
| Character list (mobile) | `MobileCharacters.svelte`, `sortChar()` (`:53-60+`) | `.map().filter().map()` over the *entire* `characters` array (including cold-storaged/trashed stubs) recomputed on every call, feeding a plain `{#each}` | CONFIRMED no windowing, and the `sortChar` transform itself is not memoized (`$derived`) — it re-runs its full map/filter/map pass on every render/search-keystroke rather than only when `characters` or the search term actually changes. This is a CPU-repetition finding distinct from a memory-growth one. |
| Persona list | `PersonaSettings.svelte:72` (`{#each DBState.db.personas as persona, i}`) | Plain `{#each}` | CONFIRMED no windowing. Persona counts are almost always small (single digits to low tens); negligible practical risk. |
| Module list | `ModuleSettings.svelte:51` (`{#each sortModules(DBState.db.modules, moduleSearch) as rmodule, i}`) | Plain `{#each}` over a freshly-`.filter().sort()`ed array, recomputed on every render (not memoized) | CONFIRMED no windowing, and `sortModules()` is a plain function call in the template (not `$derived`), so it re-runs its filter+sort on every re-render of the list, not just when `modules` or `moduleSearch` changes. Module counts are typically small; low practical risk from list *size*, but the recompute-on-every-render pattern is a minor, genuinely new CPU-waste finding. |

**Net conclusion for Lead 3: no new *unbounded-size* list was found beyond the already-documented chat message list.** The chat list remains the only list in the app whose item count realistically reaches the thousands. What *is* new here is a secondary, lower-severity pattern across several of these components: derived-looking filter/sort/map transforms (`sortModules`, `sortChar`) are written as plain functions called inline in the template rather than as `$derived`, so they redundantly recompute on every re-render rather than being cached — a CPU-waste pattern, not a memory-growth one, and much lower impact than the primary list-virtualization gap.

**Other new finding while reading these components:** `CharConfig.svelte:814`, `{#each JSON.parse(DBState.db.characters[$selectedCharID].voicevoxConfig.speaker) as styles}` — parses a JSON string fresh on every render pass through this `{#each}` block rather than once, inside the render path of a settings panel. Minor CPU inefficiency, flagged for completeness.

---

## Lead 4: Memory held by non-DB subsystems

### CONFIRMED NOT AN ISSUE — plugin iframe sandboxes (API v3) are cleaned up correctly
`src/ts/plugins/apiV3/v3.svelte.ts:1468-1480` (`loadV3Plugins`): before creating any new `SandboxHost`/iframe, it awaits `unloadV3Plugin(instance.name)` for every currently-running instance. `unloadV3Plugin` (`v3.svelte.ts:525-554`) removes the instance from the tracking array, runs the plugin's registered unload callbacks (with a 1s timeout guard), and calls `instance.host.terminate()`. `SandboxHost.terminate()` (`src/ts/plugins/apiV3/factory.ts:928-941`) removes the message listener, calls `this.iframe.remove()` (actually detaches the iframe from the DOM), and clears `instanceRegistry`, `pendingCallbacks`, `abortControllers`, and `callbackWrapperCache`. `loadPlugins()` (`plugins.svelte.ts:419-430`), the single call site that triggers a plugin (re)load whenever the plugin list changes, always goes through `loadV3Plugins`, so disabling/re-enabling a v3 plugin does not accumulate iframes. V2 plugins (`loadV2Plugin`, `plugins.svelte.ts:817+`) don't create iframes at all (no `iframe`/`sandbox` hits in that function). **Ruling this lead out.**

### CONFIRMED BUG (new) — unbounded in-memory translation cache
`src/ts/translator/translator.ts:22-25`:
```ts
let cache={
    origin: [''],
    trans: ['']
}
```
`translate()` (`:39-55`) checks this cache via `cache.origin.indexOf(text)` / `cache.trans.indexOf(text)` before falling through to `runTranslator()`, which on completion does `cache.origin.push(...)` / `cache.trans.push(...)` (`:112-114`). This is a plain module-level array pair with **no size cap, no LRU eviction, and no clearing call anywhere in the file** (verified by grepping the whole file for `cache =`/`cache.origin =`/`cache.trans =` reassignments — none exist besides the initial declaration and the two `.push()` calls). Every distinct string translated in a session (e.g., every unique chat message, if auto-translate is on) is held in memory for the life of the session, and lookups get linearly slower as the cache grows (`indexOf` is O(n)). This is separate from, and in addition to, the properly disk-backed `LLMCacheStorage` (`translator.ts:29-31`, backed by `localforage`/IndexedDB) in the same file — that one is bounded by disk, not RAM, and isn't the concern here.

### CONFIRMED NOT AN ISSUE — embedding/vector caches
`HypaProcesser` (`src/ts/process/memory/hypamemory.ts:38+`) is instantiated fresh per call site (e.g. `additionalInformations()` in `src/ts/process/embedding/addinfo.ts:6`, `const processer = new HypaProcesser()`), and its `vectors` array (`hypamemory.ts:40`) is an instance field, not a module-level singleton — it is eligible for garbage collection once the calling function returns, assuming no external reference is retained (none found). Actual embedding-vector caching for reuse across calls goes through `this.forage` (IndexedDB via localforage; see `testText()`, `hypamemory.ts:147-154`, `getItem`/`setItem` on `this.forage`), i.e., disk-backed, not memory-resident. No unbounded in-memory embedding cache found.

### CONFIRMED NOT AN ISSUE (as a "cache", but also not reused) — regex compilation
No regex-compilation cache/map was found anywhere in `src/ts` (`grep -rn "regexCache\|compiledRegex"` — no matches). `src/ts/process/scripts.ts:181` does `new RegExp(input, flag)` fresh on every use. This means there's no leak (nothing is retained), but also no reuse — a CPU-only inefficiency (recompiling the same regex repeatedly), not a memory-accumulation bug, so it's out of scope for this lead but noted for completeness.

### CONFIRMED BUG (new, most impactful finding in this lead) — unbounded raw-image-byte cache in `getFileSrc()`
`src/ts/globalApi.svelte.ts:99-104`:
```ts
let fileCache: {
    origin: string[], res: (Uint8Array | 'loading' | 'done' | 'missing')[]
} = { origin: [], res: [] }
```
In the **non-Tauri, non-service-worker** branch of `getFileSrc()` (`globalApi.svelte.ts:199-219`, the `else` at line 199 reached when `!isTauri && !usingSw`), a cache miss does:
```ts
let ind = fileCache.origin.indexOf(loc)
if (ind === -1) {
    ind = fileCache.origin.length
    fileCache.origin.push(loc)
    fileCache.res.push('loading')
    const f: Uint8Array = await forageStorage.getItem(loc) as unknown as Uint8Array
    fileCache.res[ind] = f                      // line 206 — full raw decoded bytes stored, forever
    return `data:image/png;base64,${Buffer.from(f).toString('base64')}`
}
```
and a cache **hit** re-encodes the already-cached bytes to base64 again on every call (`globalApi.svelte.ts:215/217`, `Buffer.from(fileCache.res[ind]).toString('base64')`) rather than caching the resulting `data:` URI string. A full-file grep for `fileCache.` (`globalApi.svelte.ts`, all matches listed) shows every reference is either a `.push()`, an index read, or a status-string write (`'loading'`/`'done'`/`'missing'`) — **there is no eviction, size cap, or clear call anywhere in the file.** Every asset resolved through this path (character portraits, emotion sprites, background images, module images — anything rendered via `getCharImage`/`getFileSrc` outside of Tauri and outside service-worker mode) has its full raw byte content retained in a plain in-memory array for the entire app session. For a long session touching many different characters/assets, this is an unbounded accumulation of decoded image data, functionally the same class of bug as the Module editor's per-keystroke clone (unbounded resource retention with no correctness reason) but triggered by ordinary use (viewing characters/chats with images), not a specific editor screen — likely the single most broadly-reproducible RAM-growth path found in either investigation pass, for users on the web/PWA build (this specific branch is gated to `!isTauri`, so it does **not** apply to the desktop Tauri build directly — see caveat below).

**Caveat on applicability:** this exact code path (`globalApi.svelte.ts:199-219`) is reached only when `isTauri` is false and `usingSw` (service worker) is also false — i.e., a non-Tauri web/PWA deployment without service-worker asset caching enabled. The Tauri desktop path (`globalApi.svelte.ts:115-132`) uses `pathCache`/`convertFileSrc` instead (small strings, not raw bytes — see below) and does not exhibit this specific bug. Given the task's Android-feasibility angle (per the first report's Android section) and that Tauri mobile builds share this TS/Svelte code, **COULD NOT DETERMINE from static analysis alone** whether the Android build path also hits the `!isTauri`/`!usingSw` branch under any configuration — worth a runtime check before ruling it in or out for the mobile target specifically. For any web-based deployment of this codebase, it is a confirmed, unconditional bug.

### CONFIRMED BUG (new, lower severity — same pattern, smaller payload) — unbounded path/src string caches
Two smaller unbounded caches of the same "grow forever, never evict" shape, but holding short strings rather than raw bytes, so much lower severity than `fileCache` above:
- `pathCache: { [key: string]: string } = {}` (`globalApi.svelte.ts:106`) — caches Tauri asset path → joined absolute path string, grows one entry per distinct asset path touched, never cleared.
- `fileSrcCache = new Map<string, string>()` (`src/ts/parser/parser.svelte.ts:431`, used by `getFileSrcCached()` at `:433-441`) — caches path → resolved src string, grows one entry per distinct path, never cleared (no `.delete()`/`.clear()` call found for this map anywhere in the file).
Flagging both for completeness since they fit the letter of Lead 4's question, but they hold short strings (paths/URLs), not decoded asset content, so their absolute memory impact is orders of magnitude smaller than `fileCache`'s raw-byte accumulation above.

---

## Lead 5: Other findings noticed in passing (not on the original 5-lead list)

- **`sortModules()` (`ModuleSettings.svelte:27-36`) and `sortChar()` (`MobileCharacters.svelte:53-60+`) are plain functions invoked inline in `{#each ... as ...}` template expressions, not `$derived`.** Svelte re-runs the entire function body (filter + sort, or map + filter + map) on every re-render of the containing component, not only when the underlying array or search term actually changes. CPU-waste pattern, not a memory-growth one; flagged since it's the same "do more redundant work than necessary" family the task asked about.
- **`LoreBookData.svelte:259`'s `{#await getTokens(value.content)}` re-tokenizes the full lore entry body on every content change**, with no debounce at the call site (see Lead 1 above) — a keystroke-triggered CPU cost analogous in spirit to the Module editor's per-keystroke deep-clone cost, just CPU-bound rather than memory-bound.
- **`CharConfig.svelte:814`'s inline `JSON.parse(...)` inside an `{#each}` template expression** re-parses the same JSON string on every render pass rather than once (see Lead 3 above).

No other clearly-actionable instances of the "holds more than necessary" or "redundant work" pattern were found in the areas read for this pass (LoreBook/Script/Persona/Preset/CharConfig editors, the plugin loading/sandbox lifecycle, translation/embedding/regex caching, and the additional list components). Areas not covered in this pass and worth a future look if more time is available: the HypaMemoryV2/V3 summarization pipelines' internal data structures beyond what the first report already flagged as unverified, and the service-worker (`usingSw`) branch of `getFileSrc()` (`globalApi.svelte.ts:137-198`) for an equivalent unbounded-cache risk on that code path specifically (it uses a service worker + `/sw/img/` URL scheme rather than in-memory byte storage, so it looked structurally different from the bug found above, but was not traced as deeply).

---

## Recommendations (ranked by impact × effort; no implementation performed)

1. **(High impact / Low-Medium effort) Cap or evict `fileCache.res` in `getFileSrc()` (`globalApi.svelte.ts:99-104`, `:199-219`).** This is the highest-impact new finding in this pass: switch to an LRU cache with a byte-size or entry-count cap (e.g. evict oldest entries once total cached bytes exceed some threshold), and — as a separate, cheap win — cache the computed `data:` URI string instead of re-running `Buffer.from(...).toString('base64')` on every cache-hit call. Self-contained to one function; does not require the deeper `DBState` architecture work the first report's items 2-3 describe.
2. **(Medium impact / Low effort) Cap the in-memory translator cache (`translator.ts:22-25`).** Either evict on an LRU basis once a size threshold is reached, or drop the in-memory layer entirely and rely solely on the existing disk-backed `LLMCacheStorage`, replacing the `Array.indexOf()` linear scan with a `Map` for O(1) lookups either way.
3. **(Medium impact / Medium effort) Apply the same draft-copy fix recommended for the Module editor (first report, recommendation 1) to the LoreBook entry editor (`LoreBookData.svelte`) and the Custom/Regex Script editor (`RegexData.svelte`).** Both currently bind directly to live `DBState` array elements with no local draft, the same root cause, just reached via native Svelte prop-binding instead of a local-variable alias. Fixing the generic "editor writes to a draft, commits on save/blur" pattern once (e.g. as a shared component/pattern) would address the Module editor, the LoreBook editor, and the Script editor together.
4. **(Low-Medium impact / Low effort) Debounce `getTokens(value.content)` in `LoreBookData.svelte:259`** (and audit other `{#await tokenizeAccurate(...)}`/similar call sites triggered directly off a bound text field) so full tokenization doesn't re-run on every keystroke.
5. **(Low impact / Low effort) Convert `sortModules()`/`sortChar()`/similar inline template-expression transforms to `$derived`** so they only recompute when their actual inputs change, not on every re-render.
6. **(Low impact / Low effort) Cap `pathCache` (`globalApi.svelte.ts:106`) and `fileSrcCache` (`parser.svelte.ts:431`).** Lower priority than item 1 since these hold short strings, but the same fix shape (LRU cap) applies and is cheap to add alongside item 1's work in the same area of the codebase.
7. **(Low impact / Low effort, correctness/perf, unrelated to the above) Fix `CharConfig.svelte:814`'s per-render `JSON.parse()`** by moving the parse to a `$derived` keyed off `voicevoxConfig.speaker`.

Items 1 and 2 are new to this pass and are recommended as the next things to fix after whatever came out of the first report's recommendations — item 1 in particular (`fileCache`) is judged the single highest-value new finding from this deep dive, since it is an unconditional, broadly-reproducible RAM-growth path (for the applicable deployment target) rather than one confined to a specific editor screen.
