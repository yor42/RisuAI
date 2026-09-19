# RisuAI Performance / RAM Investigation

Scope: read-only static analysis of `C:\Projects\RisuAI`. No source files were modified. All claims below are tagged **[confirmed]** (verified by reading the actual code path) or **[unverified]** (user report / hypothesis not directly traced in code).

> **Cross-validated** via an independent Codex adversarial-review pass (`Agents/CodexReviews/01-performance-ram.codexreview.md`). Verdict: **partially confirmed with corrections**. All core mechanisms (monolithic `DBState`, the two per-keystroke module-array deep clones, live-state aliasing in the Module editor, absence of bounded chat windowing) were independently re-verified and hold up. Four overstatements were corrected in place below (cold storage's actual reach into active-character chats, the autosave effect's actual scope for module edits, the Module "Create" flow's duplicate-insertion bug that the original pass missed, and the "append-only" chat-rendering claim needing a per-chat-switch qualification). Each corrected passage is marked **[corrected]** with the original claim struck through context noted inline.

---

## Executive Summary

- **[confirmed] The entire save file lives in one root Svelte 5 `$state` object (`DBState.db` in `src/ts/stores.svelte.ts:105-107`), holding every character, every chat, every message, every module, every preset.** Any mutation anywhere in this tree is a mutation of that one reactive proxy graph.
- **[confirmed, scope corrected] A global `$effect` block, set up once by `saveDb()` (`src/ts/globalApi.svelte.ts:330-404`), deep-clones the entire active character (all fields, plus separately all of that character's `chats`, i.e. every message of every chat page) and every other top-level DB key whenever any of *those specific* fields changes.** **[corrected]** This effect explicitly excludes `modules`, `botPresets`, `loadouts`, `plugins`, and `pluginCustomStorage` (they're watched by separate sibling effects instead) — so it is not accurate to say it "re-runs on essentially any edit in the app." A Module editor keystroke, specifically, does **not** trigger this character/chat clone at all; it only triggers the two `modules`-array clones described below. This effect remains the mechanism behind stutter when editing *character* fields or chatting (since chat messages are part of `chats`), just not for module edits.
- **[confirmed] Module editor keystrokes mutate `DBState.db.modules[i]` directly and immediately — not a local draft.** `ModuleSettings.svelte:110` sets `tempModule = rmodule`, and `rmodule` is a live element of the reactive `DBState.db.modules` array (not a copy), so `bind:value` in `ModuleMenu.svelte` writes straight into the global state proxy on every keystroke.
- **[confirmed but with a nuance] Disk persistence itself is debounced (500ms, `src/ts/globalApi.svelte.ts:334-347`)**, so it is not literally "one disk write per keystroke." The actual per-keystroke cost is the synchronous main-thread `$state.snapshot()` deep-clone work inside the reactive effects, which runs immediately (not debounced) on every state change, before the debounce timer ever fires.
- **[confirmed] There is no virtual scrolling / list windowing anywhere in `src/lib`.** The chat message list (`DefaultChatScreen.svelte`) uses an append-only "load more on scroll" pattern (`chatLoadInitialPages`/`chatLoadAdditionalPages`, default 30/+15 messages) but never unmounts messages once rendered — long chats accumulate an ever-growing, fully-mounted DOM/component tree.
- **[confirmed, scope corrected] Cold storage (`coldstorage.svelte.ts`) offloads whole idle characters (10+ days untouched) and legacy plugin storage, and also independently sweeps every *chat* of every non-cold character for one older than that same 10-day cutoff — including chats that belong to the currently-active character.** **[corrected]** It is inaccurate to say it does "nothing" for active characters or gives them "zero benefit": an active character with old chats does get those chats offloaded. What it genuinely does not cover is the *active/recent* chat itself, or `modules` — that narrower claim is what's relevant to the RAM/stutter problems above.
- **[Android-relevant]** Every issue above is a "hold everything in memory as live reactive JS objects, deep-clone repeatedly" pattern. On a memory-constrained Android WebView this is the most direct path to the OOM crashes referenced in context point #2 — see the dedicated section below.

---

## Confirmed Findings

### 1. `DBState` is one monolithic `$state` tree

`src/ts/stores.svelte.ts:105-107`:
```ts
export const DBState = $state({
    db: {} as any as Database
});
```
`Database` (`src/ts/storage/database.svelte.ts:802-1278`) is a single interface containing `characters: (character|groupChat)[]`, each with `chats: Chat[]`, each chat with a full `message[]` array, plus `modules`, `botPresets`, `loadouts`, `plugins`, `pluginCustomStorage`, and ~300 other settings fields. There is no per-character or per-chat `$state` slicing — Svelte 5's deep-proxy reactivity wraps the *entire* object graph in one pass (`$state()` recursively proxies nested objects/arrays). This means:
- Every character, not just the active one, is a live reactive proxy sitting in memory for the life of the app session (mitigated only by cold storage for idle characters — see §5).
- Any `$effect`/`$derived` that reads a broad path (e.g. `DBState.db.modules`, `DBState.db.characters[i]`) subscribes to every nested field touched during that read, so structurally-unrelated edits can share dependency sets and cause "unrelated" effects to refire.

### 2. The global autosave effect deep-clones large parts of the tree synchronously on every edit

`src/ts/globalApi.svelte.ts:292-404`, inside `saveDb()` (called once at boot, `src/ts/bootstrap.ts:255`):

```ts
$effect(() => {
    $state.snapshot(DBState.db.modules)              // line 357
    changeTracker.modules = true
    saveTimeoutExecute()
})
...
$effect(() => {                                        // line 376
    for (const key in DBState.db) {
        if (key !== 'characters' && key !== 'botPresets' && key !== 'modules' &&
            key !== 'loadouts' && key !== 'plugins' && key !== 'pluginCustomStorage') {
            $state.snapshot(DBState.db[key])            // deep clone every other top-level setting
        }
    }
    if (DBState?.db?.characters?.[selIdState]) {
        for (const key in DBState.db.characters[selIdState]) {
            if (key !== 'chats') {
                $state.snapshot(DBState.db.characters[selIdState][key])
            }
        }
        $state.snapshot(DBState.db.characters[selIdState].chats)  // line 391: ALL chats, ALL messages, of the active character
        ...
    }
    saveTimeoutExecute()
})
```
`$state.snapshot()` performs a full recursive deep copy, converting the reactive proxy graph into plain objects (this is standard Svelte 5 semantics — it is not a cheap reference read). Because the effect *reads* every field it snapshots, Svelte's fine-grained reactivity makes the effect depend on all of them; the effect therefore re-runs whenever **any** of those fields changes, and each re-run repeats the full deep clone of:
- every non-list top-level DB setting,
- every field of the currently-selected character (excluding `chats`, which is separately snapshotted),
- the *entire* `chats` array (every chat, every message) of the currently-selected character,
- (in the sibling effect at line 356) the entire `modules` array.

This runs synchronously on the main thread as part of Svelte's effect flush, i.e., in the same frame as the keystroke — before the 500ms debounce (`saveTimeoutExecute`, lines 341-348) ever fires. The debounce only delays the *disk write* (`encoder.set()` / `writeFile`, lines 447-467); it does not delay or batch the deep-clone cost of the effect itself.

**[corrected]** The original draft of this section claimed "every keystroke anywhere in the UI that touches `DBState.db`" pays this clone cost — that overstates the effect's actual dependency scope. This effect only re-runs when a field it actually *reads* changes: non-list top-level DB settings, or a field of the currently-selected character (including its `chats`). It explicitly skips `modules`, `botPresets`, `loadouts`, `plugins`, and `pluginCustomStorage` (lines 46-47) — those are watched by separate sibling effects (see §3 for the `modules` one) that do not read `chats` at all. So a keystroke in a *character* field or in chat messages does pay the full-chat-history clone cost on every keystroke; a keystroke in the Module editor does not touch this particular effect (it only triggers the two `modules`-array clones described in §3 and the deep-dive section below). Deep changes inside `botPresets` content are also not watched by any deep snapshot here — the dedicated effect for `botPresets` only reads `botPresetsId` and `botPresets.length`, i.e. identity/count signals, not full content.

### 3. `moduleUpdate()` itself is cheap, but is invoked via the same expensive read pattern

A second, independent effect exists in `src/ts/stores.svelte.ts:195-204`:
```ts
$effect(() => {
    $state.snapshot(DBState.db.modules)
    DBState?.db?.enabledModules
    DBState?.db?.enabledModules?.length
    DBState?.db?.characters?.[selIdState.selId]?.chats?.[...]?.modules?.length
    ...
    moduleUpdate()
})
```
`moduleUpdate()` (`src/ts/process/modules.ts:552-583`) is internally cheap — it's guarded by a `lastModuleIds` string comparison (`modules.ts:579`) so it only triggers a GUI reload when the *set of enabled module IDs* changes, not on text edits. However, the `$state.snapshot(DBState.db.modules)` call on line 196 still runs its full deep clone on every re-run regardless of that guard, because the guard is inside `moduleUpdate()`, which runs *after* the snapshot has already been taken. This is a second, independent full-`modules`-array clone triggered by the same keystroke, on top of the one in `saveDb()`'s effect (§2).

### 4. The Module editor text-field deep dive (see dedicated section below).

### 5. Cold storage covers idle characters, idle chats within any character (including the active one), and legacy plugin storage — but not the live working set

`src/ts/process/coldstorage.svelte.ts`:
- `makeColdData()` (line 575) is only invoked when `DBState.db.coldstorage` is enabled, and replaces whole characters whose `lastInteraction < now - 10 days` (`makeColdDataForCharacter`, line 390-392) **or** individual chats within a character whose newest message timestamp is older than that same 10-day cutoff and which have ≥4 messages (`makeColdDataForChat`, line 450-458 and 483). Small/young chats are explicitly left inline ("it is inefficient to store small data", line 455-458).
- **[corrected]** `makeColdData()` applies the chat-level check to every chat of every *non-cold* character, not just characters that are themselves stale — so an actively-used character with old, stale chats sitting alongside its current one **does** get those old chats offloaded. The original draft of this section said cold storage covers "only idle characters/chats," which is directionally right, but a later summary line in this report incorrectly generalized that into "a user actively chatting with one character... gets zero benefit from cold storage" — that stronger claim is false and has been corrected below.
- It also migrates legacy inline `pluginCustomStorage` entries out to cold storage (`migratePluginStorageToColdStorage`, line 555-573).
- **What it does NOT cover:** the *active/recent* chat itself (exactly the data touched by every character-field/message keystroke in §2), `modules`, `botPresets`, `loadouts`, `plugins`, or any other top-level `Database` field. Editing modules gets zero benefit from cold storage regardless of the correction above, since `modules` is never a candidate for cold-storage offload at all.
- Cold-storaged data, when reloaded (`preLoadChat`, line 627-665), is decompressed and merged straight back into the live `$state` tree — so cold storage is purely a "spill old data to disk when untouched" mechanism, not a general RAM-reduction strategy for the working set.

### 6. Full-DB `JSON.stringify` cost on save

`src/ts/storage/risuSave.ts` — `RisuSaveEncoder.init()` (lines 129-200) and `.set()` (lines 202-302) call `JSON.stringify()` per logical block: once per character (`JSON.stringify(character)`, line 184/220/232 — full character including all chats), once for `data.modules` (line 159/262), once for `data.botPresets`, `data.loadouts`, `data.plugins`, `data.pluginCustomStorage`. `.set()` is smarter than `.init()` in that it only re-stringifies blocks flagged dirty by `toSaveType` (so it's not a full-DB stringify on every save cycle), but a single edited character still means a full `JSON.stringify` of that character's entire chat history (potentially thousands of messages) on every debounced save tick, and a single module edit means a full `JSON.stringify(data.modules)` (every module, every lorebook/regex/trigger entry in it) every debounced tick. This runs on the main thread (no worker offload visible in this file).

---

## The Module Text-Field Keystroke-Save Deep Dive

**Verdict: the user report is directionally correct but the mechanism is more specific than "saves to disk on every keystroke."** Precisely:

1. **Component chain**: `ModuleSettings.svelte` (list + edit host) → `ModuleMenu.svelte` (`bind:currentModule`) → `TextInput.svelte` / `TextAreaInput.svelte` (`bind:value`).
2. **The critical aliasing bug/behavior**: in `ModuleSettings.svelte:107-113` (edit button handler):
   ```ts
   onclick={async (e) => {
       const index = DBState.db.modules.findIndex((v) => v.id === rmodule.id)
       tempModule = rmodule       // <-- rmodule IS DBState.db.modules[index] (a live reactive proxy)
       editModuleIndex = index
       mode = 2
   }}
   ```
   `rmodule` comes from iterating `sortModules(DBState.db.modules, moduleSearch)` (`ModuleSettings.svelte:51`), i.e. it is not a copy — Svelte 5's `$state` proxies are transparent objects, and array `.filter()/.sort()` (inside `sortModules`) preserve references to the same proxied elements. Assigning `tempModule = rmodule` makes the local editor's `$bindable() currentModule` prop point at the *same* underlying `DBState.db.modules[index]` proxy. **There is no draft/staging copy.**
   - Contrast this with the "create new module" path (`mode === 1`, `ModuleSettings.svelte:151-159`): there, `tempModule` is a genuinely fresh local object and is only pushed into `DBState.db.modules` when the create button is pressed. But since that same `tempModule` object was also just `.push()`-ed onto `DBState.db.modules` immediately (line 157, *before* editing even starts) to reserve its slot, it too becomes a live proxy element immediately, so the same live-mutation behavior applies to "create" mode as well from the moment the name/description fields render.
3. **Per-keystroke path**: `TextInput.svelte` uses native `bind:value` (line 63) with no debouncing — the DOM `input` event synchronously assigns the bound Svelte state on every keystroke (this is standard two-way binding, not custom code). `TextAreaInput.svelte`'s `oninput` handler (lines 50-61) is very slightly smarter — it supports an `optimaizedInput` batching mode (`if(inpa++ > 10){ ...update... }`, i.e. update every 11th char) but **this prop defaults to `optimaizedInput = true`, and `ModuleMenu.svelte` does not pass `oninput`/pass a lower threshold — it uses the default**, and `TextInput.svelte` (used for the module `name`/`description`/`namespace` fields, `ModuleMenu.svelte:199-203`) has *no* such batching at all — every keystroke updates state immediately.
4. **Consequence**: because `currentModule` (== `tempModule`) is literally `DBState.db.modules[editModuleIndex]`, every keystroke in the Name/Description/Namespace fields (`TextInput`, immediate) and in the Custom Prompt Template Toggle / background-embedding / lorebook-content fields (`TextAreaInput`, batched every ~10 chars by default) is a **direct, synchronous mutation of the live `DBState.db.modules` array**. That mutation:
   - triggers the `$effect` in `src/ts/stores.svelte.ts:195-204` → `$state.snapshot(DBState.db.modules)` (full deep clone of *every* module, not just the one being edited) → cheap `moduleUpdate()` call (guarded, see §3 above, so no GUI reload unless module IDs changed) — **but the deep clone itself still runs every time**;
   - triggers the sibling `$effect` in `src/ts/globalApi.svelte.ts:356-360` inside `saveDb()` → a second full `$state.snapshot(DBState.db.modules)` deep clone → sets `changeTracker.modules = true` and (re)starts the 500ms debounce timer.
5. **Is it debounced?** Only the *disk write* is debounced (500ms, `saveTimeoutExecute`, `globalApi.svelte.ts:341-348`). The two `$state.snapshot()` deep clones described above are **not** debounced — they run once per state-changing keystroke (or once per ~10 characters for `TextAreaInput` fields, due to `optimaizedInput`). For a `modules` array containing many modules with substantial lorebook/regex/trigger content, this is a real, repeated, synchronous main-thread cost per keystroke, which matches the reported UI stuttering even though no disk I/O is happening per keystroke.
6. **Does it write to DB vs local-only state?** There is no "local-only" component state for the Module editor at all — the editor *is* the DB state (see point 2). This is different from, e.g., a typical form pattern where a draft is edited locally and committed on submit. For **edit mode**, the submit button (`ModuleSettings.svelte:189-192`) is indeed close to a no-op, redundantly doing `DBState.db.modules[editModuleIndex] = tempModule`, which is already true.
7. **[corrected — new finding from cross-validation] For *create* mode specifically, the submit button is not a no-op — it's a bug.** `tempModule` is `.push()`-ed onto `DBState.db.modules` once immediately when create mode opens (`ModuleSettings.svelte:157`, to reserve a live slot so the same aliasing behavior applies while editing), and then `.push()`-ed a **second time** on the Create button's submit handler (`ModuleSettings.svelte:182`). Both pushes reference the same `tempModule` object, so the net effect is the same module object being inserted into `DBState.db.modules` twice — a duplicate-entry bug distinct from, and in addition to, the per-keystroke deep-clone cost described above. This was not identified in the original investigation pass and was caught during cross-validation.

**Summary sentence for the report consumer**: every keystroke in a Module's Name/Description/Namespace field synchronously mutates the live global database state and forces two independent full deep-clones of the entire `modules` array (via two separate `$effect`s, one in `stores.svelte.ts`, one in `globalApi.svelte.ts`'s `saveDb()`); actual disk persistence of that mutation is separately debounced 500ms, so the stutter is a CPU/memory-clone problem, not an I/O problem.

---

## Virtual Scrolling / Large-List Audit

- **No virtual scrolling or windowing library is used anywhere in `src/lib`.** A grep for `virtual`/`IntersectionObserver`/windowing patterns across `src/lib` only turns up unrelated hits (`LazyPortal.svelte`, `TriggerV2List.svelte`, `CharConfig.svelte`, `PlaygroundInlayExplorer.svelte`, `PartialEditController.svelte`) — none of which implement list virtualization.
- **Chat message list — confirmed the most likely offender.** `src/lib/ChatScreens/DefaultChatScreen.svelte`:
  - `loadPages` starts at `getInitialChatLoadPages(DBState.db)` (default 30, `src/ts/chatLoadPages.ts:1`, `DefaultChatScreen.svelte:47`).
  - On scroll near the top, `loadPages += getAdditionalChatLoadPages(DBState.db)` (default +15, `DefaultChatScreen.svelte:576`).
  - This is a **monotonically-growing render window within a single open chat**: once a message is rendered because `loadPages` grew, nothing in this file ever shrinks `loadPages` or removes already-rendered messages from the DOM as the user scrolls away from them. For a chat with hundreds/thousands of messages, after enough scroll-back the component tree holds every one of those messages mounted simultaneously (each `Message.svelte` instance carrying its own markdown/highlight/asset-rendering state).
  - **[corrected]** "Append-only" is qualified: `loadPages` resets back to the initial default whenever the selected chat changes (switching chats, or explicit reset/jump paths), so the growth is not global/permanent across the whole session — it's monotonic only during continuous scroll-back within *one currently-open* chat. The core conclusion is unaffected: within that one long chat, peak DOM/component count is still unbounded and never shrinks as the user scrolls, which is the actual mechanism behind the RAM/perf risk.
  - This is a **partial, non-equivalent mitigation** compared to true virtual scrolling: it avoids rendering the *entire* history on first load, but does not bound peak memory/DOM node count once a user has scrolled through a long conversation in one sitting.
- Other candidate large lists (character list `src/lib/Others/ChatList.svelte`, `src/lib/Mobile/MobileCharacters.svelte`, lorebook list `src/lib/SideBars/LoreBook/LoreBookList.svelte`) all use plain `{#each}` over the full array with no pagination or windowing at all — lower risk in practice since character/lorebook counts are typically smaller than message counts, but confirmed absent of any windowing.

---

## Cold Storage: What It Solves vs What It Doesn't

**Solves:**
- Bounds long-term storage growth for characters/chats untouched for 10+ days (moves their bulk data to a compressed, separately-fetched blob keyed by UUID; the in-memory character stub left behind after cold-storaging is a minimal placeholder — `coldstorage.svelte.ts:422-441`).
- Cleans up orphaned cold-storage blobs (`cleanColdStorage`, line 244).
- Also offloads legacy inline `pluginCustomStorage` values.

**Does not solve:**
- Nothing for the *active/recent* chat itself being edited or chatted in right now — this is exactly the data path implicated in §2 (the `saveDb()` autosave effect) for character-field and message edits.
- Nothing for `modules`, `botPresets`, `loadouts`, `plugins` — all still fully resident and fully re-cloned on relevant edits, regardless of which character they belong to.
- Nothing for chats that are "recent" but already long (a very active, very long-running chat with the *current* character gets no relief; the 10-day-idle threshold and the ≥4-message threshold are both about staleness, not about size).
- It's an opt-in feature gated by `DBState.db.coldstorage` (default depends on `data?.plugins?.length === 0`, `database.svelte.ts:713`) — plugin users get it disabled by default.

**[corrected]** Older, already-stale chats belonging to an actively-used character *are* covered — see §5's correction above. Only the character's active/recent chat and the app-wide `modules`/`botPresets`/`loadouts`/`plugins` collections are genuinely outside cold storage's reach.

---

## Memory Systems (HypaMemoryV2/V3, SupaMemory, HanuraiMemory) RAM Footprint Notes

- Memory-system data (e.g. `HypaV3Data.summaries`, `src/ts/process/memory/hypav3.ts:54`) is stored **inside each `chat` object** (`chat.hypaV3Data`, referenced directly in `coldstorage.svelte.ts:488` and `chatLoadPages`-adjacent code), i.e. it lives inside the same monolithic `DBState.db` tree described in §1 — it is not a separately-managed, evictable cache. It is therefore additive to, not a duplication that could be trimmed independent of, the character/chat data already resident.
- Because it's part of `chat`, it is included in the full-`chats`-array deep clone performed by the `saveDb()` effect (§2, line 391) on every keystroke touching the active character, and it is JSON-stringified as part of that character's block on every save (`risuSave.ts:184/220/232`).
- Cold storage's `makeColdDataForChat` explicitly clears `chat.hypaV2Data`/`chat.hypaV3Data` when a chat is cold-storaged (`coldstorage.svelte.ts:512-520`) and restores them on `preLoadChat` (`coldstorage.svelte.ts:644-648`) — so cold storage *does* reach memory-system data, but only for chats that already qualify as idle/old, same limitation as §5.
- This investigation did not trace token-budget-bounded in-memory summarization structures (e.g. `hypaAllocatedTokens`/`hypaChunkSize` settings, `database.svelte.ts:529-530`) deeply enough to state a hard per-conversation RAM ceiling for HypaV3 — flagging as **[unverified/needs follow-up]** whether summary counts are unbounded for extremely long single conversations.

---

## Android Feasibility Notes (not designing the rollout — flagging risk only)

Per context point #2, naively cross-compiling the current implementation causes OOM crashes on low-RAM Android devices. Everything confirmed above compounds that risk:

- **The single monolithic `DBState.db` tree (§1)** means the *entire* save file's live characters/chats/modules are proxied and resident simultaneously on mobile too — there is no code path that lazily loads only the active character into memory; cold storage is the only partial exception and only for stale data.
- **The `saveDb()` autosave effect's repeated full deep-clones of the active character's entire chat history and the full `modules` array (§2, §3)** run on every keystroke on Android exactly as on desktop — but mobile devices have less RAM headroom for the transient garbage these clones generate, and (per AGENTS.md) Tauri mobile builds share this same TS/Svelte code path, so this is not a desktop-only cost.
- **The Module editor's live-binding-to-global-state pattern (deep dive section)** means editing modules with large embedded lorebooks/regex/trigger content on a low-RAM Android device would be the most reproducible way to trigger visible jank or memory pressure from a single UI screen.
- **The unbounded, append-only chat message rendering (Virtual Scrolling section)** is likely the single most dangerous item for Android specifically: long-running chats are common in this app's use case, and mobile WebViews have both less RAM and (typically) slower DOM/layout performance than desktop, so the same "never unmount old messages" behavior that causes desktop stutter is more likely to cause outright OOM kills on Android.
- **Full-block `JSON.stringify` of an entire character's chat history per save tick (§6)** is CPU/RAM-transient-heavy in a way that's more costly on mobile CPUs/GC.

This report does not propose an Android-specific rollout plan (out of scope per the task); it only flags that the four items above are the ones most likely to need fixing *before* any Android rollout, not after.

---

## Recommendations (ranked by impact × effort; no implementation performed)

1. **(High impact / Medium effort) Stop the Module editor from binding directly to live `DBState` state.** Give `ModuleMenu.svelte`/`ModuleSettings.svelte` a real local draft (deep-clone the module into `tempModule` on edit-open, e.g. via `$state(structuredClone(rmodule))`) and only commit it back into `DBState.db.modules[editModuleIndex]` on explicit Save (or on a debounced timer, e.g. 300-500ms of inactivity). This alone removes the two per-keystroke full-`modules`-array deep clones described in the deep-dive section, and is a self-contained, low-risk change scoped to one component tree.
2. **(High impact / Medium-High effort) Narrow the `saveDb()` change-tracking effects (`globalApi.svelte.ts:350-403`) so they don't `$state.snapshot()` broad subtrees just to detect "something changed."** Options: (a) replace the deep-clone-based dirty detection with an explicit "mark dirty" call sited at the actual mutation call sites (the codebase already has many discrete setter functions like `setCurrentCharacter`/`setCurrentChat` in `stores.svelte.ts` that could set a dirty flag directly, avoiding any snapshot read); (b) if a generic reactive watcher is preferred, watch only shallow identity/length signals (e.g. array `.length`, a per-record `modification_date` timestamp) instead of deep-snapshotting full content. This is the single highest-leverage fix since it's on the hot path for *every* edit in the app, not just modules.
3. **(High impact / High effort, architectural) Split `DBState.db.characters` into per-character `$state` slices** (e.g. a `Map<chaId, CharacterState>` where only the active character's proxy is "hot," others are held as plain, non-proxied objects until selected) so that editing one character's fields cannot possibly force reactivity graph traversal touching other characters. This is the deepest fix for the "one giant `$state` object" root cause but touches a very large surface area (every place that reads/writes `DBState.db.characters[i]` throughout `src/ts` and `src/lib`), so it should be scoped carefully and probably staged after items 1-2 prove out the pattern on a smaller subtree.
4. **(High impact for long chats / Medium-High effort) Add real virtual scrolling / windowing to the chat message list** in `DefaultChatScreen.svelte` (e.g. `@tanstack/svelte-virtual` or a hand-rolled `IntersectionObserver`-based unmount-when-offscreen approach layered on top of the existing `loadPages` pagination). Keep the existing incremental-load-on-scroll-up behavior for fetching more history, but stop keeping every previously-loaded message mounted — cap the live DOM/component window (e.g. render only messages within N screens of the viewport, keep the rest as lightweight placeholders sized to preserve scroll position). This is the most Android-relevant fix given point #2 in the task context.
5. **(Medium impact / Low effort) Expand cold storage's staleness window to also consider size, not just idle time**, or add a separate "large chat" compaction path so very long *active* chats (not just idle ones) can have old message batches (not memory summaries) spilled to cold storage while the tail stays hot — reduces the size of the per-keystroke chat-array clone in `saveDb()`'s effect even before item 2/3 land.
6. **(Low impact / Low effort, quick win) In `TextAreaInput.svelte`, make `optimaizedInput`'s batching threshold (currently a hardcoded `> 10` characters, line 52) configurable/tunable and default `TextInput.svelte` (currently unbatched) to a similar small time- or char-based batch** for large-content fields like module lorebook/regex/trigger text — cheap, localized, and reduces clone frequency even before the deeper architectural fixes above land. Note this only reduces *frequency*, not the root cause, so it should be considered a stopgap, not a substitute for items 1-2.
7. **[new, from cross-validation] (Low impact / Low effort, correctness bug, independent of the perf fixes) Fix the Module "Create" flow's duplicate-insertion bug.** `ModuleSettings.svelte:157` and `:182` both `.push()` the same `tempModule` object onto `DBState.db.modules`, inserting every newly-created module twice. This should be fixed regardless of whether/when item 1 (draft-copy the editor) lands, since it's a correctness bug, not just a perf one — though implementing item 1 first would likely eliminate it as a side effect, since a proper draft-then-commit flow only pushes once, on explicit save.
