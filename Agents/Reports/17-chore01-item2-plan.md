# CHORE-01 + Phase 2 item 2 plan — mark non-selected character edits for save, then partition the selected-character tracker

Status: **Stage 1 implemented; gate 2 passed on code after three rounds (last REJECT text-only,
fixed); live check passed; committed as `152cc563`. Stage 2 implemented; gate 3 approved with
findings after three rounds (rounds 1-2 REJECT on comment accuracy, code judged correct), findings
folded in; live check passed 2026-09-22; uncommitted.**
Rev 1 was REJECTED at gate 1; rev 2 passed the re-review with findings F1-F11 (§10), folded in
below. The Orchestrator re-verified rev 1's blocking findings in source before accepting them.
Branch `fix/persistence-conflict-platform-hardening`, base HEAD `0291ea36`.
Design choice made by the maintainer on 2026-09-22: **option B** (selection-scoped partition plus
explicit marks), not option A (watch every character). §2 records why.
Review tier: `opus-reviewer` at every stage. This touches the code that decides whether a character
is written to disk at all, so the failure mode is silent data loss.
Predecessors: Report 11 (Stage B modules partition; §8.1 is the original CHORE-01 finding);
Roadmap CHORE-01, CHORE-03, Phase 2 items 2 and 8. Evidence: ledger rows 61-63.

## 1. Facts this plan rests on

### 1.1 The tracker and the save side

- **Effect 6** (`src/ts/storage/dbChangeEffects.svelte.ts:93-122`) does two jobs:
  - `:95-102` deep-reads every top-level DB key except `characters`, `botPresets`, `modules`,
    `loadouts`, `plugins`, `pluginCustomStorage` (e.g. `characterOrder`);
  - `:103-119` deep-reads the **selected** character only: each non-`chats` field (`:104-108`) and
    the whole `chats` array (`:109`); then unshifts its `chaId` into `tracker.character` if the
    front differs (`:110-112`) and a `[chaId, chatId]` pair into `tracker.chat` (`:113-118`, dead,
    CHORE-02).
- **Encoder** (`src/ts/storage/risuSave.ts:271-318`, `set`): re-encodes a character only if its
  `chaId` is in `toSave.character` (`:284-297`); otherwise reuses the cached block, encoding only
  when none exists (`:298-308`). Leftover ids are deleted **unless** saved in this pass
  (`:310-318`, `savedId`), so a duplicate or stale id of an existing character is harmless (the
  "Deleting character data" log line may still name it).
- **Save loop** (`src/ts/globalApi.svelte.ts:929-970`): snapshots `changeTracker` (`:942`), trims it
  to `[character[0]]` (`:949`). The front id is **sticky**: re-encoded on every save until another
  id takes the front. Marks arriving during `await encoder.set` land in the live tracker after the
  trim and survive (gate 1, traced). On a failed save, `mergeUnsavedChanges` (`:770-786`) folds the
  snapshot back, de-duplicated.
- `saveTimeoutExecute(markDirty)` (`:750-760`) only sets `dirtySinceLastSave = true` and re-arms the
  500 ms debounce. It reads `saveTimeout` (a `let` at `:748`), so calling it before `:748` has run
  throws a ReferenceError.
- **Boot order:** `saveDb()` is started without `await` (`bootstrap.ts:292`) after
  `loadedStore.set(true)` (`:287`), so the UI is live while `encoder.init` (`globalApi.svelte.ts:743`)
  awaits each character in turn (`risuSave.ts:250-260`; on Node/Tauri each goes through
  `encodeRemoteBlock`, `:409`, with a `forageStorage.keys()` per character, `:501`). With 1000
  characters that window is seconds long.
- `requiresFullEncoderReload` (`:549`, consumed at `:933-939`): a fresh encoder and a full re-encode.
  Set at exactly four sites: `characters.ts:854` (inside `removeChar`, trash and permanent),
  `drive/backuplocal.ts:566`, `kei/backup.ts:64`, `coldstorage.svelte.ts:979`. **All stay.** A
  full reload also drops blocks of characters no longer in `db.characters`, which the incremental
  `set()` never does (the decoder turns every character block back into a character,
  `risuSave.ts:695-699`).

### 1.2 The writer census (closed 2026-09-22; commands in ledger row 61; gate additions row 63)

| Writer | Location | Kind of write | Persisted today? |
|---|---|---|---|
| **Generation continuing after a selection change** | `src/ts/process/index.svelte.ts`: index captured once at `:265` (`let selectedChar` is a function local, `:114`); later writes to `characters[selectedChar]` at `:1666`, `:1671`, `:1730`, `:1756`, `:1774-1797`, `:1928`, `:1951`, `:2217` | in place | **No.** `changeChar` refuses while `doingChat` (`characters.ts:896`), but the Ctrl+[ / Ctrl+] hotkeys (`defaulthotkeys.ts:87-96` → `hotkey.ts:103,119`), Playground (`PlaygroundMenu.svelte:39`), multiuser `receive-char` (`multiuser.ts:306`) and the Home buttons (`Sidebar.svelte:430`, `MobileHeader.svelte:19`) change the selection without that check, and nothing aborts the generation. Hotkey case: tokens after the next save are never re-encoded. Home case: the character stays at the sticky front but nothing schedules a save, so the reply tail is lost on a reload with no other change. **Likely the most common real-world loss path.** |
| Restore from trash | `src/lib/Others/GridCatalog.svelte:170-176` | in place: `trashTime = undefined` | **No.** Reproduced by `Agents/Tools/save-gen/trash-restore-repro.svelte.harness.ts` |
| Plugin V3 `setCharacterToIndex` | `src/ts/plugins/apiV3/v3.svelte.ts:884-889` | element replacement | **No** (unless the selected index) |
| Plugin V3 `setChatToIndex` | `v3.svelte.ts:947-956` | in place on the character | **No** for a non-selected character (common case is the selected one via chat listeners) |
| Plugin `setDatabase` / `setDatabaseLite` — **V2.x** | `src/ts/plugins/plugins.svelte.ts:752-781` | V2 `getDatabase()` returns a wrapper over the **live** `DBState.db` (`:671-712`), so a plugin edits live elements in place and then assigns the same array back (`:757`, `:775`) and the same db (`:763`; `database.svelte.ts:725` via `:781`). No source changes value, so no effect fires | **No** for every non-selected character |
| Plugin `setDatabase` / `setDatabaseLite` — **V3** | same setters, re-exported at `v3.svelte.ts:758-759`; V3 `getDatabase` returns snapshots (`:771-785`), either the full `characters` snapshot or no `characters` key (never a partial array) | whole-array replacement with fresh objects | **No** for every non-selected character |
| risuaccess (MCP) character tools | `src/ts/process/mcp/risuaccess/characters.ts:524-1063` (through `setCharacterLuaScript`, `:1045-1063`), resolved via `utils.ts:4` `getCharacter`; each write happens after an awaited `promptAccess` (`:543`, `:611`, `:694`, `:797`, `:874`, `:967`, `:1063`). Dispatched by `client.ts:84-99` `callTool`. `chats.ts` is read-only (`risu-get-chat-history`) | in place | **No** for a non-selected character |
| Internal backup load; account backup load | `globalApi.svelte.ts:2923` (`loadInternalBackup`); `accounter.ts:134` | `setDatabase(decoded)`: fresh db, no `requiresFullEncoderReload` | **No** for non-selected characters (cached blocks reused); characters deleted since the backup would also survive |
| Multiuser `receive-chat` | `sync/multiuser.ts:316-324` | `setDatabase(getDatabase({snapshot:true}))`: fresh db | Persisted for the selected character only; not a loss path for others (they are unchanged), but see §3.2 cost |
| Legacy image migration; `makeColdData` | `bootstrap.ts:499-507` (in `checkNewFormat`, `:264`); `:286` | in place, before `saveDb` | Yes: the first `encoder.init` covers them |
| Cold-storage compaction sweep; `removeChar` | `coldstorage.svelte.ts:950-980`; `characters.ts:825-854` | in place | Yes: `requiresFullEncoderReload` |
| Cold-storage restore on select | `characters.ts:903` | element replacement of the character being selected | Yes (selected); the identity tracker would also mark it once, harmless |
| Import / create | `characters.ts:19-35` | append | Yes: new ids have no block |

Cleared as non-instances: group-chat members, plugin `setChar`, `characterFormatUpdate` and
`setCharacterByIndex` (self-assignment), multiuser `receive-char`'s own write (selects in the same
handler). Lua/CBS scripting and group chats were cleared by the investigator and are **UNVERIFIED by
the gate**; the implementer re-checks them with the ledger-61 commands.

### 1.3 Item 2 — measured cost (Node, i9-13900K; best case, never a Pi/phone claim)

Harnesses `Agents/Tools/save-gen/dbchange-*.svelte.harness.ts`; raw data
`Agents/Tools/output/chore01-item2-measure.md` (gitignored). Ledger row 62. UNVERIFIED by the gate.

- **Today (M1):** 74 ms per change at 10k messages on the selected character, 385 ms at 50k, for a
  keystroke and a streamed token alike; 98.8-100% is `$state.snapshot(chats)`; ~60 MB transient
  allocation per flush.
- **Selection-scoped partition (M2):** field writes ~0.002 ms; a token append 0.02-0.6 ms only with
  per-message children; ~680 B per message effect (+6.4 MB at 10k, +32.6 MB at 50k).
- **Identity-only tracker (M4):** 4.9 ms boot, 1-2 ms per shape change at 1000 characters; catches
  element and whole-array replacement, misses in-place writes.

## 2. Why option B, not option A

Option A (one deep child effect per character) fixes CHORE-01 for every writer, but retains about
**+170 MB** at 1000 characters / ~148k messages (537 → 708 MB, Node) and 1.5-1.7 s at boot on the
i9, and it would lock in the boot proxy materialisation that is Phase 2 item 8's main lever. The
hardware floor is a Pi 3 and mid-range phones. The maintainer chose B.

**B's weakness:** coverage of in-place writes to non-selected characters depends on each writer
marking. §5 mitigates it (rule, recorded census, a test per writer); it cannot eliminate it. Gate 1
found three writers the census had missed (generation after a switch, the V2 in-place setDatabase,
backup loads), which is the weakness in action and the reason §5 exists.

## 3. Stage 1 — CHORE-01: mark non-selected edits for save

Effect 6 is **not** edited in Stage 1.

### 3.1 The mark primitive and its wiring (gate findings 3, 4, 10)

- New module `src/ts/storage/characterSaveMarks.ts` (fork-specific internal API, labelled so):
  - `markCharacterForSave(chaId)`: no-op for a falsy or non-string id. Otherwise appends `chaId`
    to the installed tracker's `character` array **at the end, only if absent**, and requests a
    save through the installed scheduler.
  - `installCharacterSaveMarks({ tracker, schedule })` and a matching uninstall for tests.
  - **Before install, marks are queued** in a module-level `Set`, not dropped. `install` drains the
    queue into the tracker.
- **Production wiring in `saveDb()`:**
  - install right after `changeTracker` is created (`globalApi.svelte.ts:732`), i.e. **before**
    `encoder.init`, with a scheduler that only records "pending" while `saveTimeoutExecute` is not
    yet defined;
  - once `saveTimeoutExecute` exists (after `:760`), swap in the real scheduler and, if pending,
    call `saveTimeoutExecute(true)` once;
  - so a mark made during the seconds-long `encoder.init` window is kept in the tracker and saved
    by the first `set()`, whatever `init` already encoded.
- **Home-screen case:** with nothing selected (boot `selectedCharID = -1`, `bootstrap.ts:288`) the
  tracker is empty and the first mark becomes the sticky front, re-encoded on every save until a
  character is selected. Accepted (bounded, one character) and pinned by S6.
- `saveDb` has exactly one caller (`bootstrap.ts:292`), and runs synchronously up to
  `await encoder.init`, so installing at `:732` happens before any UI or effect can mark (re-review).
  The queue has a `resetCharacterSaveMarksForTest()` hook so tests cannot leak marks into each other.
- **Named seams (re-review F5), extracted unchanged in behaviour from `saveDb`:**
  - `bootSaveSequence({ tracker, init, installMarks, … })`: install marks, run `encoder.init`
    (recording the encoded proxies), then swap in the real scheduler and flush a pending save.
    S13 drives it with a slow fake `init`.
  - `prepareSaveIteration({ encoder, reloadFlag, tracker, … })`: the reload branch (`:933-939`),
    the snapshot/trim (`:942-955`), and the post-reload filter (§3.2). S11 drives it.
  - `mergeUnsavedChanges` (`:770-786`) as a pure function. S14 proves a mark arriving during
    `await encoder.set` survives the trim.

### 3.2 An identity tracker over `db.characters`

- A new, separate effect in `registerDbChangeEffects`. It reads `DBState.db.characters`, its
  `length` and each `chars[i]`, and **no property of any element**.
- It keeps a closure `WeakSet` of element proxies already seen. On every run after the first, any
  element not in the set whose `chaId` is truthy is appended to **`opts.tracker.character`** with a
  shared pure `appendIfAbsent(tracker, id)` (the same rule `markCharacterForSave` uses), and
  `opts.markChanged(true)` is called. Then all current elements are added. It does not go through
  the module-global installed tracker (re-review F7), so tests stay isolated.
- **Its first run calls neither `appendIfAbsent` nor `markChanged`**, apart from marking elements
  missing from the seed. So the existing `toHaveBeenCalledTimes(6)`
  (`dbChangeEffects.svelte.test.ts:278`) stays valid in Stage 1; Stage 2 updates it (§4.3).
- **First run and the boot window (finding 3):** the tracker is registered in `saveDb()` after
  `encoder.init`. Its first run must not treat elements replaced *during* `init` as seen.
  `encoder.init` therefore records the set of character proxies it encoded (it already iterates
  them, `risuSave.ts:250`; `getDatabase()` without `snapshot` is the live proxy,
  `database.svelte.ts:732-737`, so identities match), and the tracker's `WeakSet` is **seeded from
  that set** through a new optional `seed` option of `registerDbChangeEffects`. Its first run marks
  any current element not in it. Without a `seed` (tests, or any other caller), the first run only
  fills the set.
- Svelte facts (gate 1, verified against 5.55.1): reading `chars[i]` returns the child proxy stored
  in that index's source, stable per underlying object (`proxy.js:174-195`); a replaced element
  gets a new proxy; splice, sort and reorder only move existing proxies, so nothing is marked;
  `proxy()` returns an existing proxy unchanged (`proxy.js:42`), and self-assignment notifies
  nothing.
- Covers: V3 `setCharacterToIndex`, V3 `setDatabase` / `setDatabaseLite` with `characters`, the
  backup loads, and any future element or whole-db replacement.
- **Cost of marking every character on a whole-db replacement:**
  - backup loads additionally set `requiresFullEncoderReload` (§3.3). A reload does **not**
    supersede the marks: `toSave` is cloned from the tracker after the reload (`:942`), so every
    marked id would be encoded a second time (re-review F1). `prepareSaveIteration` therefore
    removes from `toSave.character`, after a successful reload, exactly the ids whose proxies the
    new `init` encoded (filter by the recorded proxies, never by clearing, so a mark made during
    that `init` survives);
  - **multiuser `receive-chat`** (`multiuser.ts:316-324`) replaces the db with a snapshot on every
    received chat, so each one would re-encode every character. This is a performance regression
    for guests. **Fix in Stage 1:** change that handler to write the received chat in place into
    the live selected character instead of `setDatabase(getDatabase({snapshot:true}))`. About five
    lines. It must also reset `isStreaming` and `activeStreamingDisplayOptimizationMode` on the
    received chat, which `setDatabase` does today (`database.svelte.ts:714-719`); the rest of what
    `setDatabase` does there is already-applied `??=` defaults (re-review F8). `latestSyncChat`
    aliasing and the throw when nothing is selected are unchanged.

### 3.3 Explicit coverage at each writer

| Writer | Change |
|---|---|
| Generation after a selection change | Split `sendChat` into a thin outer function and the existing body. The body reports the captured index and `chaId` (captured right after `:265`/`:266`, from `nowChatroom`) to the outer through a small context object; the outer's `finally` marks **both** the captured `chaId` and `characters[selectedChar]?.chaId` (re-review F6: a permanent delete during generation shifts indices, so the index-based writes may land elsewhere; marking both covers both, and the de-duplication makes the selected case free). The auto-continue recursion (`:1911`, `:1955`) goes through the outer, so each level gets its own `finally`. This also schedules the save the Home case is missing. |
| Plugin `setDatabase` / `setDatabaseLite` (V2 and V3) | **Maintainer decision (re-review F3), 2026-09-22: mark, do not reload.** When `Array.isArray(newDb.characters)` (re-review F9), after the write, `markCharacterForSave` every `chaId` in `db.characters`. Covers V2 in-place edits (invisible to the identity tracker) and V3 copies. **Never deletes:** a character the plugin removed keeps its block and comes back on reload, exactly as today (§8), and a stale plugin snapshot cannot permanently delete a character imported during the plugin's await. **Cost (re-review F2):** this fires on almost every plugin `setDatabase` call, because V2 `'characters' in wrapper` is always true and V3 `getDatabase()` defaults to `'all'`; each such call re-encodes every character on the next save (one IDB write per character on web; one remote file per character on Node/Tauri). Coalesced by the 500 ms debounce. Today those calls silently lose non-selected edits instead. Measured at the live check. |
| Internal / account backup load | Set `requiresFullEncoderReload.state = true` at `globalApi.svelte.ts:2923` and `accounter.ts:134`, as the other three restore paths already do. A backup load is an explicit user action to replace everything, so dropping characters absent from the backup is intended. With the post-reload filter (§3.2) the save encodes each character once. |
| Restore from trash | Extract `restoreCharacterFromTrash(chaId)` (clears `trashTime`, calls `checkCharOrder()`, marks) into `characters.ts`; `GridCatalog.svelte` calls it. |
| V3 `setChatToIndex` | Extract its body into a testable function in the plugin module; mark the target `chaId` after the write. |
| V3 `setCharacterToIndex` | No explicit mark; the identity tracker covers it (S2 pins it through the real function). |
| risuaccess tools | **Requirement: a mark must happen after the handler's last mutation.** A mark made only before the mutation is not enough: every write here follows an awaited `promptAccess`, so a save can encode the old state and the trim then drops the id. Implementation (re-review F4): `callTool` (`client.ts:84-99`) creates a **per-call** context `{ touched: Set<string> }` and passes it to the handler; every mutating handler resolves its character through `getCharacterForWrite(id, ctx)`, which adds the `chaId` to `ctx.touched`; `callTool`'s `finally` marks `ctx.touched` after the handler settles (success or throw). No module-level set, so overlapping calls cannot clear each other's ids. Read-only tools keep `getCharacter`. |

### 3.4 Stage 1 tests (red before green; all drive the real functions, not copies)

| # | Test | Kind |
|---|---|---|
| S1 | `restoreCharacterFromTrash` on a non-selected character with the real `registerDbChangeEffects` + real `RisuSaveEncoder`: after encode → decode, `trashTime` is cleared. The harness, promoted and inverted. | **red** (on current code the equivalent inline write loses it) |
| S2 | Real `setCharacterToIndex` on a non-selected index: persisted. | **red** |
| S3 | Real plugin `setDatabase` and `setDatabaseLite`: (a) V2-style in-place edit of a non-selected character through the live wrapper; (b) V3-style fresh array; after save → decode, both persisted (**red**). (c) a character removed from the array still decodes (today's behaviour kept, **guard**). (d) `characters: undefined` does not mark and does not throw (**guard**, F9). | **red** + guard |
| S4 | Extracted `setChatToIndex` on a non-selected character: persisted. | **red** |
| S5 | Table-driven over **every** mutating risuaccess tool through the real `callTool`, each on a non-selected character, with `promptAccess` resolved after a save has run: persisted. Plus two overlapping calls on different characters: both persisted. A test asserts the table covers every tool whose handler writes (enumerated from the tool registry). | **red** |
| S6 | `markCharacterForSave`: append-if-absent, never displaces a non-empty `character[0]`, becomes the front when the tracker is empty (Home case), falsy id is a no-op, marks before install are queued and drained. | new |
| S7 | Identity tracker: seeded first run marks nothing; an element replaced after seeding but before the first run is marked; splice/reorder marks nothing; element replacement marks exactly that `chaId`; whole-array replacement marks all; in-place field write marks nothing; falsy `chaId` skipped; the same-proxy / new-proxy premise. | new |
| S8 | Deletion safety: a marked id whose character exists is re-encoded, not deleted; `removeChar` still sets `requiresFullEncoderReload`. | guard |
| S9 | Existing `dbChangeEffects.svelte.test.ts` and `risuSave.test.ts` unchanged and green. | guard |
| S10 | Generation after a switch, through the real outer `sendChat` with a stubbed model: change `selectedCharID` mid-stream; after completion and save → decode, the full reply is in the original character. | **red** |
| S11 | Backup load, then one real `prepareSaveIteration` + `set`: restored non-selected characters match the backup, characters absent from the backup are gone, and each character is encoded exactly once (F1). | **red** |
| S12 | Multiuser `receive-chat` rewrite, **with the identity tracker enabled**: the received chat lands in the selected character with `isStreaming` reset; only that character is marked. Shown failing against the old handler with the identity tracker in place (F11). | **red** |
| S13 | Boot window, through the real `bootSaveSequence` with a slow fake `init`: a mark made while `init` is pending is persisted by the first `set()`; installing after `init` would fail this test. | **red** |
| S14 | Pure snapshot/trim/merge: a mark added between snapshot and the end of `set` survives into the next save; a failed save merges without loss or duplication. | guard |

## 4. Stage 2 — item 2: partition the selected-character half of effect 6

**Partition, never narrow:** the union of the new effects' dependencies must equal today's effect 6
closure (Report 11 §4, §8 method).

### 4.1 Shape (gate finding 7)

Line numbers in this subsection refer to `dbChangeEffects.svelte.ts` before Stage 1 (base HEAD
`0291ea36`); the implementation notes below describe what shipped.

- **6a — generic top-level loop** (`:95-102`), moved unchanged into its own effect.
- **6b-front — a small effect** that reads `selIdState`, `characters[selIdState]`, its `chaId`,
  `chatPage` and `chats[chatPage]?.id`, and does the `tracker.character` front-unshift and the
  `tracker.chat` pair exactly as `:110-118` do today. Because it is separate, a `chatPage` change
  does not rebuild any message children.
- **6b-char — the selected character**, outer effect: reads `selIdState`, `characters[selIdState]`
  and the character's `for…in` key set; creates one child per non-`chats` field
  (`$state.snapshot(char[key])`) and one **chats-shape** child.
- **Chats-shape** reads `chats` and its `length` only, and creates one child per index `i`. **Each
  index child reads `chats[i]` itself**, so replacing one chat re-runs one child, not all.
- **Per-chat child:** reads every key of the chat except `message` (`Object.keys` + snapshot), then:
  - if `message` is an array: reads `message` and its `length`, and creates one grandchild per
    index `j` that reads `message[j]` itself and snapshots it;
  - otherwise (malformed data, `message` not an array): `$state.snapshot(message)`. Real cold-storage
    stubs are arrays and go through the array branch above — the whole-character stub's `chats[0]`
    (`coldstorage.svelte.ts:774`) and the chat-level stub (`:865`) both set `message` to a
    one-element array. The non-array branch exists only for malformed data where `message` is not an
    array, the same case `index.svelte.ts:220` guards against; it is kept to preserve equivalence
    with the old effect, which snapshotted whatever `message` was.
- Every effect that fires does the front-unshift of the selected `chaId` and calls
  `markChanged(ranOnce)`; recreated children pass `false`, so shape changes are covered by the
  parent's `markChanged(true)`, as in Stage B.
- **Per-message children for every chat of the selected character.** The active-chat-only variant
  needs re-partitioning on `chatPage` changes; uniform costs ~680 B per message (+33 MB at 50k,
  i9/Node). Recorded alternative.
- A new `message` array on each generation (`runCurrentChatFunction`, `index.svelte.ts:146`)
  rebuilds that chat's grandchildren once per generation, not per token. Accepted; measured.

### 4.2 Closure equivalence (gate finding 6, corrected)

- `$state.snapshot`'s object branch uses `Object.keys` (`svelte/src/internal/shared/clone.js`),
  which goes through the proxy's `ownKeys` trap and reads `version` (`proxy.js:334`). So today's
  `:109` snapshot **already** depends on the `version` source of every chat and every message, and
  on every key. The array branch reads `length` and every index, not the array's `version`.
- The partition reads the same set: `Object.keys`/snapshot on each chat (version + keys + values),
  `length` + every index on `chats` and on each `message`, snapshot of each message. The gate
  re-derives this against 5.55.1 and the implementer's code comment must state it this way.
- **Duplicate ids:** effect 6's front-unshift does not de-duplicate against marks appended at the
  end. Safe (`savedId`), noted in the comment.

### 4.3 Stage 2 tests (gate finding 8)

- **Equivalence suite, green on today's code first.** For each mutation class: reset the
  `markChanged` spy and set `tracker.character = []` **before** the mutation; assert the selected
  `chaId` is re-added and `markChanged(true)` was called by a 6b effect (identity tracker disabled
  in this suite, or its calls distinguished). Classes: field write; nested write (lorebook entry
  content, emotion image list); key added and removed; chat pushed, spliced and replaced; `chats`
  array replaced; message appended; last message `data` appended (token); message edited in a
  non-active chat; message deleted; `message` array replaced; cold-stub chat (a one-element array)
  edited; malformed non-array `message` edited; `chatPage` changed; selection changed; selected
  character replaced by identity.
- **Rebuild-count tests:** a `chatPage` change creates no message children; replacing chat `i`
  re-runs only chat `i`'s child.
- **Negative control:** a write to a non-selected character is not marked by any 6b effect.
- **Existing count test:** `dbChangeEffects.svelte.test.ts:278` asserts `toHaveBeenCalledTimes(6)`
  on first run. Stage 2 changes the number of effects; the test is updated to the new count with a
  comment listing each effect, and the equivalence suite (not the count) is the safety evidence.
- **Cost:** the M1 harness re-run against the partition, in the harness suite. Numbers with the
  hardware caveat.

### Stage 2 implementation notes (Gate 3)

- **The `for…in` entanglement, found in implementation and fixed.** A `for…in` over a Svelte 5 proxy
  calls the `getOwnPropertyDescriptor` trap per key (`node_modules/svelte/src/internal/client/proxy.js:201-206`).
  That trap subscribes the running effect to the value of every property whose source already
  exists. So the 6b-char outer effect rebuilt the whole subtree on a `chatPage` change, and on every
  field write after any re-run. It was fixed by enumerating with `Reflect.ownKeys` (the `ownKeys`
  trap, `:333-347`, reads only `version`) and by leaving `chatPage` out of the field children,
  because 6b-front covers it.
- **Measured** on an i9-13900K under Node (best case; no claim for a Pi or a phone), 10k / 50k
  messages over 10 chats, M1 (the old merged effect) → partition:
  - keystroke: 74 / 385 → 0.67 / 3.2 ms
  - streamed token: 74 / 385 → 0.66 / 3.4 ms
  - message push: 74 / 385 → 8.2 / 45 ms (rebuilds that chat's per-message children once per
    appended message)
  - chatPage switch: 74 / 385 → 0.67 / 3.4 ms (89 / 515 ms before the `Reflect.ownKeys` fix)
  - keystroke after a switch: 1.0 / 3.5 ms
  - retained heap after mount (proxies, sources and effects together): 23.7 / 119 MB. The
    commit-message reviewer ran the same harness test against the pre-Stage-2 source and reported
    15.1 / 75.7 MB, so the new effects add about 9 / 43 MB (reviewer's scratchpad run, not kept).
- **The residual scaling is Svelte's flush traversal** (TRACED in
  `node_modules/svelte/src/internal/client/reactivity/batch.js:364-407`, `Batch#traverse`). It walks
  every live plain `$effect` in the tree; the only ones skipped are clean BRANCH/ROOT effects, `INERT`
  effects, and effects in `#skipped_branches` (`batch.js:371-374`). That
  costs about 0.065 µs per effect. It was confirmed by
  `Agents/Tools/save-gen/flush-traversal-scaling-bench.svelte.harness.ts`: N idle effects (each with one stable dependency, so not Svelte-`INERT`), 0.64 ms
  at 10k and 3.08 ms at 50k. It matches the keystroke cost per message.
- **Recorded option, not implemented:** fewer effects per message, for example chunked message
  children (one child per K messages) or active-chat-only children, to cut both the traversal cost
  and the retained heap. Record it as an open follow-up. The Pi and phone floor makes per-keystroke
  traversal worth revisiting after the live measurement.
- **`chats[chatPage]` without `?.`:** §4.1 wrote `chats[chatPage]?.id`, but the pre-Stage-2 effect
  read `chats[chatPage].id` with no `?.`, so it threw when `chatPage` was out of range. 6b-front
  keeps that (still throws in the same cases); a partition is not the place to change it. The
  `db.characters` read keeps the old `DBState?.db?.characters?.[selIdState]` guard (restored in
  Gate 3 round 2).
- **Gate 3 finding 2:** children fronted a `chaId` captured at outer-run time, so an in-place `chaId`
  rename re-fronted the stale id. That would be silent loss if some writer ever renames in place; no
  production writer does today (INFERRED). Fixed by reading the id at fronting time.
- **A behaviour change from the partition:** a write to a top-level key alone (for example
  `characterOrder`) no longer front-unshifts the selected character. 6a
  (`dbChangeEffects.svelte.ts:118-129`) only reads the generic top-level keys and calls
  `opts.markChanged(ranOnce6a)`; it does not call `frontUnshiftSelected`, which now lives only in
  6b-front and the other 6b pieces. `markChanged(true)` still runs, so the save still happens and the
  top-level data is still saved. **Nothing different is written:** the selected character is already
  the tracker's sticky front (every 6b piece fronts it on its first run and on each selection change,
  and `prepareSaveIteration` keeps `character[0]` when it trims), so it is still re-encoded on that
  save. The difference is only visible in a tracker whose front is not the selected character, as
  in the test's sentinel. (Commit-message check, 2026-09-22, corrected an earlier claim here that
  the re-encode was skipped.)
- **Gate 3 round 2:** the reviewer reported a second independent old-vs-new differential fuzz
  (250 seeds × 60 steps, run from its scratchpad and not kept) with zero misses, plus five mutants
  each caught by the real test file; the code was judged correct. The round's rejection was for
  comment accuracy (and one restored `?.` guard on `db.characters`). Test comments now refer to
  effects in `dbChangeEffects.svelte.ts` by name (6a, 6b-front, 6b-char, and so on) instead of by
  line number, since the line numbers went stale twice.

## 5. Keeping B's weakness in check

- **Rule in `AGENTS.md` (area traps):** any code that writes to a character other than the one
  selected **at the time of the write** must call `markCharacterForSave(chaId)`, unless it replaces
  the element or the whole db (identity tracker) or sets `requiresFullEncoderReload`. Includes async
  work that captured an index and may outlive a selection change.
- **Recorded census commands** (ledger rows 61, 63), to re-run after upstream merges.
- **A test per writer** (S1-S5, S10, S11).

## 6. Live check (maintainer starts the dev server; pane visible)

- Stage 1: trash restore without opening, reload; a V3 test plugin calling `setCharacterToIndex`,
  `setChatToIndex`, `setDatabase` on a non-selected character, reload; start a generation, press
  Ctrl+] mid-stream, wait for completion, reload: the reply is complete in the original character.
  Measure one save after a plugin `setDatabase` with characters on a large fixture.
- Stage 2: keystroke and streaming frame times on a 10k-message character before and after; time a
  `chatPage` switch; heap after selecting it. All numbers best-case hardware.

### Live check (Stage 1) — completed 2026-09-22

Run by the Orchestrator against the maintainer's dev server, pane visible, on the 31-character
module-heavy fixture. All three Stage 1 checks passed after a page reload: trash restore through
the catalog trash tab without opening the character; V3 `setCharacterToIndex`, `setChatToIndex`, a
V3-style `setDatabase` with a fresh `characters` array, and a V2-style in-place edit plus
`setDatabaseLite`, each on a different non-selected character; and a generation (built-in Echo
model, non-streaming) with the selection switched mid-generation via `selectedCharID.set` (Ctrl+]
did not switch while focus was in the input) — the reply persisted in the original character. A
save after a plugin `setDatabase` on 31 characters completed about 0.8 s after the call, including
the debounce. Test markers remain in the fixture. Ledger row 69.

**Large-fixture measurement (perf-analyzer, Node, i9-13900K; best case, not a Pi/phone claim).**
One save iteration with no reload, real `prepareSaveIteration` + real `RisuSaveEncoder.set()` on a
warmed encoder, real `$state` proxy, `buildManyCharactersFixture`; median of 6 (max in brackets):

| Fixture | `prepareSaveIteration` all-N / 1 | `set()` all-N (plugin `setDatabase`) | `set()` 1 id (normal) | Transient heap, all-N `set()` |
|---|---|---|---|---|
| 500 chars, ~20k messages | 0.94 / 0.62 ms | 165 ms (179) | 14 ms | ~18 MB |
| 1000 chars, ~150k messages | 2.27 / 1.60 ms | ~1.18 s (1.34 s) | 49 ms | ~117 MB |

The all-N cost tracks message volume (7.5x more messages, 7.1x the time), because every character's
chats are serialised and compressed again. perf-analyzer's report attributed the growth to the
`indexOf` scan in `set()`; the Orchestrator rejected that: about 500k comparisons at N=1000 is a few
milliseconds. It is a one-off per plugin `setDatabase`/`setDatabaseLite` call (a single mark loop,
no repetition in `plugins.svelte.ts`), but a plugin that calls it every turn pays it every turn. On
target hardware expect several times this: a multi-second main-thread stall on a 1000-character
profile. Recorded for the maintainer as a follow-up decision (the mark-every-character choice, F3).
Harness: `Agents/Tools/save-gen/chore01-plugin-setdatabase-save-bench.svelte.harness.ts`. This cost
is CHORE-17's subject; see `Agents/Roadmap.md` CHORE-17 for the recommended re-encode-only-what-changed
strategy, sequenced after Stage 2.

### Live check (Stage 2) — completed 2026-09-22

Dev server started by the maintainer, pane visible. A temporary character "Livecheck 10k (temp)"
(10 chats × 1000 messages, cloned from a fixture character) was added through `DBState`, measured,
then removed with `removeChar(chaId, name, 'permanentForce')`; a page reload confirmed 31 characters
and no trace of it. Same i9-13900K, in Chromium, so best case; no claim for a Pi or a phone.

- The pane throttled `requestAnimationFrame` (an idle frame took ~590 ms), so frame times were not
  usable. Each edit was timed synchronously with the app's own `flushSync` (Vite dep instance):
  tracker effects plus any UI effects the edit triggers, excluding the async save loop.
- Keystroke (`desc`): 1.1 ms median (0.8-2.5). After a chatPage switch: 1.3 ms (0.8-3.5), so the
  `Reflect.ownKeys` fix holds in the browser.
- Streamed token on the active chat: 16.3 ms median (10.4-26.4); this includes the chat view
  re-rendering that message (the tracker share is ~0.7 ms in the Node harness).
- chatPage switch: 104-299 ms (5 runs); this is the chat view rendering a different 1000-message
  chat (the tracker share is ~0.7 ms in Node).
- Old merged effect, proxy: `snapshot(chats)` of that character took 204 ms median (129-257) in the
  same page. That snapshot was 98.8-100% of the old per-edit cost (§1.3), so every keystroke and
  token paid roughly that before Stage 2.
- Selecting the character: 1.09 s to the end of the task, 4.6 s to the (throttled) frame; not
  separable from the chat view's own render. Heap was not separable from the module-heavy fixture
  (~1.5 GB); the Node figure stands (about +9 MB at 10k for the effects, 23.7 MB total after mount).
- Timing without `flushSync` (setTimeout gaps) gave 280 / 470 ms medians because the async save
  loop, which re-encodes the selected 10k-message character on each save, landed in the gaps. That
  is the save cost, unchanged by Stage 2; recorded for CHORE-17 context.

## 7. Compatibility

- **No save-format change.** The encoder's `set()` is untouched; `encoder.init` only additionally
  records which proxies it encoded.
- **Plugin API signatures unchanged.** `setCharacterToIndex`, `setChatToIndex`, `setDatabase`,
  `setDatabaseLite` behave the same except that their writes now persist. A character removed
  through `setDatabase` still comes back on reload, as today (maintainer decision, §3.3).
- Upstream characters, modules, presets, backups and plugins unaffected; legacy array-format cold
  chats untouched. Real cold-storage stubs are one-element `message` arrays
  (`coldstorage.svelte.ts:774`, `:865-869`), so they go through the per-message (array) branch in
  Stage 2 like any other chat, not the plain-snapshot fallback. Only malformed data where `message`
  is not an array hits the plain-snapshot fallback (§4.1).
- `requiresFullEncoderReload` and its four existing call sites stay; two are added (the internal
  and account backup loads).

## 8. Out of scope (recorded, not fixed)

- **CHORE-02** (`tracker.chat` is dead): its pair is recomputed by 6b-front with today's reads.
  Not literally byte-for-byte in timing, harmless because the encoder never reads it.
- **Aborting or blocking generation on a selection change.** The hotkeys, Playground, Home and
  `receive-char` skipping the `doingChat` check is arguably its own bug; Stage 1 makes the write
  persist, it does not change when switching is allowed.
- **Characters removed by a plugin `setDatabase` reappear on reload** (pre-existing; the
  incremental `set()` never drops blocks). Kept deliberately (§3.3): fixing it by reload would add a
  permanent-deletion path through stale plugin snapshots.
- **Index shift during generation:** `removeChar(..., 'permanent')` splices `db.characters` with no
  `doingChat` check (`characters.ts:825-854`), so a generation's index-based writes can land on a
  different character. Pre-existing corruption bug; Stage 1 only makes sure whatever was written is
  persisted. Candidate for CHORE-03 or its own chore.
- CHORE-03's wider trash bug hunt; item 8 (boot materialisation); item 3 (chat-list DOM).

## 9. Staging and gates

1. Gate 1 passed (rev 2 re-review, findings folded into rev 3).
2. Stage 1 implementation (sonnet-coder) + tests (test-warrior), red proved against current code.
3. Gate 2 on Stage 1 including the commit message. Live check. Commit when the maintainer asks.
4. Stage 2 equivalence suite first (green on current code), then implementation.
5. Gate 3 on Stage 2. Live measurement. Commit when the maintainer asks.

## 10. Gate record

### Gate 1 — opus-reviewer, 2026-09-22 — [REJECT] (rev 1)

Svelte 5.55.1 source read; no tests run. Option B judged sound; rev 1's facts were not.

- **Blocking 1:** census missed generation continuing after a selection change (§1.2 row 1).
  Orchestrator verified `index.svelte.ts:264`, `characters.ts:896`, `defaulthotkeys.ts:87-96`,
  `hotkey.ts:103,119`. Folded into §3.3 and S10.
- **Blocking 2:** V2 `getDatabase` is a live wrapper, so V2 `setDatabase` edits in place and the
  identity tracker cannot see it. Orchestrator verified `plugins.svelte.ts:671-680,752-781`. Folded
  into §3.3 (full reload when characters are passed) and S3.
- **Blocking 3:** "no-op before the hook is installed is safe" was false (`bootstrap.ts:292`
  un-awaited, `:287` UI live). Orchestrator verified. Folded into §3.1 (queue + early install),
  §3.2 (seeding) and S13.
- Should-fix 4 (test seams), 5 (backup loads, multiuser `receive-chat`), 6 (Svelte `ownKeys`
  reasoning), 7 (rebuild cost of the Stage 2 shape), 8 (unfalsifiable equivalence assertion),
  9 (risuaccess coverage), 10 (Home-screen sticky front, falsy ids): folded into §3.1-§3.4 and
  §4.1-§4.3.
- Nits: §1.1 citations corrected (`characters.ts:854`, trim at `:949`);
  `dbChangeEffects.svelte.ts:48`'s stale `globalApi.svelte.ts:594-604` citation to be fixed in
  Stage 2; CHORE-02 wording (§8); duplicate-id log line (§1.1, §4.2).

### Gate 1 re-review — opus-reviewer (fresh), 2026-09-22 — [APPROVE-WITH-FINDINGS] (rev 2)

Read the plan, the cited source and Svelte 5.55.1 (`proxy.js`, `clone.js`); no tests run. All three
rev-1 blocking findings resolved; option B as written safe to implement. Confirmed: install at
`:732` precedes any UI or effect (`saveDb` synchronous to `await encoder.init`, single caller);
`init` sees live proxies; V3 `getDatabase(includeOnly)` never returns a partial `characters` array;
§4.2 closure reasoning correct.

- **F1** a full reload does not supersede marks (double encode) → post-reload filter (§3.2).
- **F2** the plugin-setter trigger fires on almost every `setDatabase` → cost stated (§3.3).
- **F3** reload from a stale plugin snapshot is a new permanent-deletion path → **maintainer chose
  marking every character instead of reloading** (§3.3, §7, §8).
- **F4** risuaccess recorded ids unspecified → per-call context through `callTool` (§3.3, S5).
- **F5** no named seams for S3/S10/S11/S13 → `bootSaveSequence`, `prepareSaveIteration`, outer
  `sendChat` (§3.1, §3.3, §3.4).
- **F6** mark both captured `chaId` and index-resolved id; index-shift bug recorded (§3.3, §8).
- **F7** identity tracker marks through `opts.tracker`; queue reset hook; count test (§3.1, §3.2,
  §4.3).
- **F8** `receive-chat` rewrite must reset `isStreaming` and
  `activeStreamingDisplayOptimizationMode` (§3.2). **F9** guard on `Array.isArray` (§3.3, S3d).
  **F10** citations (`:265`, risuaccess range, `chats.ts` read-only) (§1.2). **F11** S12 with the
  identity tracker enabled (§3.4).

### Gate 2 — Stage 1 implementation, three rounds, 2026-09-22

**Pass 1 — opus-reviewer, fresh — [REJECT].** Two blocking findings, both proven with a probe: **B1**
`prepareSaveIteration` reloaded before snapshotting, and the post-reload filter dropped in-place
edits made during the reload (same object) — a decode showed the original text. **B2** plugin
setters marked every character, so a stale second plugin `setDatabase` made `encoder.set()` delete
a character's block permanently — reproduced through the real V2 API. Should-fix: a strong `Set` of
boot proxies kept alive; S12 red for a mock artifact; backup-load wiring untested; the registry
test overpromised; stale boot comments; drifted citations. Five commit-message corrections. The
Orchestrator re-verified B1 and B2 in source.

Between passes, an `investigator` checked the B2 fix premise ("every intentional removal sets the
reload flag"). The premise as worded was **REFUTED**, in favour of the fix: the only removals
without a reload are the plugin setters and V3 `setCharacterToIndex` re-keying, and those must not
delete. A first fix attempt by `sonnet-coder` re-appended plugin-removed characters to
`db.characters`; the Orchestrator **rejected** it because it changes plugin-visible behaviour and
covers only the setters. The approach was reverted after the tests were restructured (a
plugin-level "removal honoured" test, and a save-level no-reload presence filter), and the pass-1
WeakSet should-fix (infeasible; the seed must be iterable) was replaced by
`takeEncodedCharacterProxies()`.

**Pass 2 — opus-reviewer, fresh — [REJECT].** 1: `onSnapshotTaken` cleared `dirtySinceLastSave`
before the reload, so a throwing reload left the tab looking clean, and the multi-tab path could
auto-reload and discard edits without a prompt; fixed with `onSnapshotRestored` plus an
unconditional flag set in the outer catch. 2: `opts.seed` was retained by effect closures, pinning
boot-time characters (a WeakRef probe showed them still alive); fixed with `opts.seed = undefined`.
3: misleading test and comment text. Also folded in: O(N²) proxy scans (70 ms at 1000 characters,
279 ms at 2000, i9) replaced by a per-call Map/Set, and the reload flag cleared before the await so
a removal during the reload is not erased. Red tests were written before each fix.

**Pass 3 — opus-reviewer, fresh — [REJECT, on text only].** No data-loss, crash or build defect
found. Four false comments fixed as comment-only edits; the Orchestrator verified with a diff that
only comment lines changed. Commit-message corrections applied. Non-blocking finding recorded for
CHORE-03 (§8): a `removeChar('permanent')` splice during an in-flight `set()` can skip a character,
deleting its block for one write; it heals on the next save, which reloads. Accepted behaviour,
disclosed in the commit message: a V3 `setCharacterToIndex` re-key keeps the old block, so both
versions appear after a reload.

Ledger rows 64-68.

**Design changes versus rev 3 §3** (all made in response to the above):

- The snapshot in `prepareSaveIteration` now moves before the reload, instead of after it.
- A no-reload presence filter: the save never asks the encoder to delete a character outside a
  reload, so a stale plugin `setDatabase` cannot delete a block.
- `takeEncodedCharacterProxies()` replaces the WeakSet-of-boot-proxies should-fix, and the seed is
  released (`opts.seed = undefined`) so boot-time character proxies are not pinned by effect
  closures.
- `onSnapshotRestored` replaces the earlier "clear `dirtySinceLastSave` before the reload"
  behaviour, so a throwing reload and the multi-tab auto-reload path cannot look clean while edits
  are discarded.
- The reload flag is cleared before the `await`, not after, so a removal that happens during the
  reload itself is not erased.
