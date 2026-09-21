# Stage B plan — give the module editor a real local draft copy

Status: **REVISION 3 — third plan gate pending. Nothing implemented.**
Revision 1: REJECTED by `opus-reviewer`, 11 findings (record in section 8).
Revision 2: REJECTED by a fresh `opus-reviewer`, 11 findings, 6 REJECT-grade (record in
section 9). Revision 2's duplicate-id "index hint" fix was circular and fixed nothing; its Tauri
handler shape could strand an unclosable window; its flush-correlation proof was wrong about what
`:786` snapshots. All are corrected here.
Branch `fix/persistence-conflict-platform-hardening`, base HEAD `afcb4e09`.
Review tier: `opus-reviewer` (persistence-adjacent; failure mode is silent data loss).
Predecessor: Stage A, `f4867e63`, `Agents/Reports/09-stage-a-module-effect-narrowing-plan.md`.

## 1. Problem

Editing a module today mutates `DBState.db.modules` on every keystroke. `ModuleSettings.svelte:110`
assigns `tempModule = rmodule`, where `rmodule` is the live `$state` proxy element of
`DBState.db.modules`; `ModuleMenu.svelte` then binds every field of it. So each character typed
into a module's name, description, lorebook, regex or trigger is a write into the reactive
database, which re-runs both module-watching effects:

- `stores.svelte.ts:197` — narrowed in Stage A to `trackModuleUpdateDeps()`, **now 0.03 ms**.
- `dbChangeEffects.svelte.ts:34` — `$state.snapshot(DBState.db.modules)`, **29.18 ms/keystroke**,
  deliberately NOT narrowed (see section 5). This is now essentially the entire per-keystroke cost.

Per-keystroke total after Stage A is **29.21 ms**, against a 16.7 ms frame budget. Those three
numbers are quoted from `f4867e63`'s own benchmark block; 29.21 ms is the post-Stage-A *total*,
not the cost of any one site.

Stage B removes both from the typing path by not mutating `db.modules` while typing at all.

**Do not re-justify this with Stage A's 2.00x.** Stage B *subsumes* that number for typing.
Stage A's residual value is on non-typing paths that mutate modules: commit, import, delete,
toggle. The two are not additive.

## 2. Verified facts

Re-verified by the orchestrator against source at `afcb4e09`; not taken from a report.

| # | Claim | Evidence |
|---|---|---|
| F1 | `tempModule` is an alias of the live db element, not a copy | `ModuleSettings.svelte:110` `tempModule = rmodule`, inside `#each sortModules(DBState.db.modules, ...)` at `:51` |
| F2 | The edit commit is an idempotent self-assign today | `ModuleSettings.svelte:192` `DBState.db.modules[editModuleIndex] = tempModule`; by F1 the RHS already *is* that element |
| F3 | Create mode eagerly pushes before any editing | `ModuleSettings.svelte:152-158`; explanatory comment at `:182-184` (the brief cited `:181-183`; `:181` is the `<Button>` tag, the comment is `182-184`) |
| F4 | `getModules()` caches on the joined enabled-id string, which does not change on content edits | `modules.ts:417-419`; cache vars `modules.ts:396-397` |
| F5 | `lastModuleData` holds live proxy references — the cache is stale-proof *by accident* | `getModuleByIds()` `modules.ts:374-381` returns `db.modules.filter(...)`, i.e. the same proxies |
| F6 | `refreshModules()` has exactly ONE caller | `grep -rn refreshModules src/` → definition `modules.ts:588`, import `ModuleSettings.svelte:7`, call `ModuleSettings.svelte:39` (inside `onDestroy`). No others |
| F7 | Blast radius of a stale cache is wide — roughly 30 invocation sites | Cite the command, not a number: `grep -rno "getModules()\|getModuleLorebooks()\|getModuleAssets()\|getModuleTriggers()\|getModuleRegexScripts()" src/ --include=*.ts --include=*.svelte` gives 19 outside `modules.ts` and 12 inside it at `afcb4e09`. An earlier draft of this plan said "49", which counted matching *lines including imports*; the gate's replacement figure (21/28) does not reproduce either. The conclusion — `refreshModules()` at commit is mandatory — does not depend on the exact count |
| F8 | `RisuModule` has 15 fields, **12** optional (`name`, `description`, `id` are required) | `modules.ts:19-35`; `sed -n '19,35p' src/ts/process/modules.ts \| grep -c "?:"` = 12 |
| F9 | `moduleUpdate()` reads exactly four module fields | `modules.ts:552-583`: `id` (`:557`), `hideIcon` (`:566`), `backgroundEmbedding` (`:569`); `namespace` via `getModuleByIds` `modules.ts:378` |
| F10 | Stage A's tracker already covers single-element replacement | `moduleUpdateDeps.ts:31-33` reads `modules.length` and `modules[i]` |
| F11 | `ModuleMenu` writes ONLY through `currentModule`; it touches `DBState` for one read | `ModuleMenu.svelte:27` `$bindable()`; only `DBState` uses are `:32` and `:280`, both `DBState.db.useAdditionalAssetsPreview` |
| F12 | `localDrafts` gates multi-tab auto-reload, not saving | `globalApi.svelte.ts:677,685` feed `getMultiTabAction` / `shouldRetainOtherTabSavedSignal`. Registry is a plain `Set`, `localDrafts.ts:17` |
| F13 | All cited history is reachable from HEAD | `895c298e` (double-insert fix), `ae167294` (draft-destroying auto-reload fix), `f4867e63` (Stage A), `33b665d1` / `72ce7218` (the two proxy-layer reverts) — each `git merge-base --is-ancestor <sha> HEAD` returns true |

### F14 — NOT in the brief. There is no cancel control, and unmount currently *preserves* edits.

`mode` is assigned in exactly four places: `:112` (to 2), `:158` (to 1), `:185` (to 0), `:193`
(to 0). Both transitions back to 0 are the commit buttons. **There is no Cancel, no Back, no
Escape handler.**

The only other way to leave an open editor is to destroy the component, and both mount points
are inside `{#if}` blocks, so switching tabs destroys it:

- `Settings.svelte:225` (`$SettingsMenuIndex === 14`)
- `src/lib/Others/QuickSettingsGUI.svelte:27` (`QuickSettings.index === 2`)

Today, destroying the component mid-edit **keeps every edit**, because by F1 the edits already
landed in `db.modules`. `onDestroy` then calls `refreshModules()` and the data is live and correct.

This inverts the brief's requirement that "abandoning leaves `db.modules` untouched". Applied
literally to the only abandon path that exists, that requirement *is* the silent data loss: the
user types for two minutes, clicks another settings tab, and everything is gone with no prompt.
Section 3 resolves this; it is the single most important thing for the gate to attack.

### F15 — NOT in the brief. The edit-mode commit button is conditionally rendered.

`ModuleSettings.svelte:190` gates the commit `<Button>` on `tempModule.name !== ''`. Harmless
today (F2 makes it a self-assign; the edit is already live). With a real draft, a user who clears
the name field in order to retype it has **no commit control at all**, and the only remaining
exit is the destroy path of F14.

### F16 — NOT in the brief. Assets are written to storage before the module references them.

`ModuleMenu.svelte:255-265` calls `saveAsset()` and then pushes `[name, imgp, extension]` onto
`currentModule.assets`. The blob hits storage immediately. Under commit-on-save, an abandoned
draft orphans that blob. This is a storage leak, not data loss, and it is bounded by the
resolution chosen in section 3.

## 3. Proposed change

No format change, no migration, no change to `RisuModule`. Split across two separately-gated
stages (§3.7.4):

- **Stage B1** — `src/ts/globalApi.svelte.ts` only: an awaitable flush primitive. Purely additive.
- **Stage B2** (this document) — `src/lib/Setting/Pages/Module/ModuleSettings.svelte`, a new leaf
  `src/ts/process/moduleDraft.svelte.ts` (§4), and the Tauri close hook (§3.7.3).

### 3.1 The draft lifecycle — commit-on-save, debounced commit, and flush on every teardown

Given F14, this plan deliberately does **not** adopt "abandon discards". The draft is a
*batching* mechanism, not a transaction:

1. Entering edit mode (`:107-113`) deep-copies the module into the draft and captures
   `openedRef = rmodule`, the element's own proxy (section 3.2). `editModuleIndex` is dropped.
2. Entering create mode (`:151-159`) builds the draft **without** pushing to `db.modules`.
3. The commit button commits (section 3.2).
4. **Idle-debounced commit** at the same 500 ms the save layer already uses, so the draft is
   never more than one debounce window behind `db.modules` (section 3.7.1).
5. `onDestroy` commits any still-open **and actually-changed** draft (`mode !== 0`) **before**
   calling `refreshModules()`, then unregisters the draft key.

   The change gate is load-bearing, not an optimisation (gate round 2, finding 7). Today, opening
   the pencil and switching tabs writes nothing — F2's self-assign only runs via the `:191`
   button, itself gated by `:190`. An unconditional teardown commit would replace the element,
   set `tracker.modules`, and force a full `JSON.stringify(data.modules)` re-encode plus a
   `database.bin` rewrite on every no-edit open/close. Worse, it flips `dirtySinceLastSave` true,
   so on a peer save `getMultiTabAction` (`src/ts/storage/multiTabReload.ts:33-37`) returns
   `'prompt'` where a clean tab returns `'auto-reload'` — a user-visible modal caused by merely
   looking at a module. Compare against the snapshot taken at open; commit only on difference.
6. `pagehide` and `visibilitychange === 'hidden'` commit, for web and PWA, where `onDestroy`
   never runs (section 3.7.2).
7. Tauri `onCloseRequested` commits **and waits for the write to land** before allowing the
   window to close (section 3.7.3).

F15 stops mattering, because the flush paths commit regardless of the commit button's visibility.

**Observable changes this DOES introduce** — the gate (R9, R10) refuted an earlier claim here that
net semantics were "identical to today". Three things change, and the commit message must say so:

1. **Live preview stops in the sidebar editor.** By F5 the `getModules()` cache holds live proxies,
   so today editing `hideIcon` or `backgroundEmbedding` from `QuickSettingsGUI` updates the chat
   icon and background *while you type* — that is exactly what Stage A's smoke check measured.
   With a draft copy those stop updating until commit. Invisible via the full-screen Settings panel
   (`App.svelte:212` replaces the chat screen), visible via the sidebar.
2. **In-progress module content stops reaching prompt building.** Same mechanism: today a
   half-typed regex or lorebook entry is already live to every `getModule*` consumer (F7).
3. **Durability granularity changes** from per-keystroke to per-flush. Section 5 states the
   remaining exposure precisely; it is not zero and the plan does not claim it is.

Asset orphaning (F16) is *reduced*, not eliminated: `ModuleMenu.svelte:263` writes the blob before
`:264` records the reference, so a termination between those two statements orphans it regardless
of what the draft does.

Create mode changes one more observable thing, and it is a bug fix: today, pressing "+" and
navigating away leaves a permanent nameless module in `db.modules`. Under the new lifecycle the
plan commits a create-draft only if it is non-pristine — see section 6 Q2 for the predicate, which
is subtler than it first appears.

Rejected alternative — "abandon discards, add a Cancel button": strictly larger, adds UI and
i18n strings, and converts F14 from a non-issue into a confirm-dialog problem that must be solved
on a code path (`onDestroy`) where an async confirm cannot block teardown. Recorded here so the
reviewer can argue for it rather than having to reconstruct it.

### 3.2 Committing

Resolution order is **object identity, then `findIndex` by id, then push**:

```
function resolveCommitIndex(modules, draft, openedRef) {
    const byRef = modules.indexOf(openedRef)   // the exact element the user opened
    if (byRef !== -1) return byRef
    return modules.findIndex(v => v.id === draft.id)   // element was replaced; -1 means gone
}
// commit:
const idx = resolveCommitIndex(DBState.db.modules, draft, openedRef)
if (idx === -1) { DBState.db.modules.push(draft) }
else { DBState.db.modules[idx] = draft }
refreshModules()
```

**Why identity and not an index hint — revision 2 got this wrong and gate round 2 caught it.**
Revision 2 proposed validating a stored index against `modules[hint]?.id === draft.id`. That is
**circular**: the only index computed at open is `ModuleSettings.svelte:109`
`DBState.db.modules.findIndex((v) => v.id === rmodule.id)` — already a bare `findIndex` by id.
So for `modules = [A(id=X), B(id=X)]` with the user editing **B**, `:109` yields `hint = 0`,
`modules[0].id === draft.id` passes, and the commit writes over **A** — byte-identical to the
outcome the hint was introduced to prevent. Revision 2's fix did not fix anything.

Object identity does work: `rmodule` inside `{#each sortModules(DBState.db.modules, ...)}` is the
same memoised child proxy as the array element (Svelte caches `proxy(target[prop])` per key in
`node_modules/svelte/src/internal/client/proxy.js`), and `sortModules` (`:27-36`) reaches it via
`filter().sort()`, which read through the trap. So capture `openedRef = rmodule` at open and use
`indexOf`. **The `#each` index `i` is NOT usable** — the list is filtered and sorted, so `i` is a
display position, not an array index.

Identity also degrades correctly: if the element is genuinely replaced (another commit, an import
rewriting the slot), `indexOf` returns -1 and the id fallback runs, which for a unique id is exact
and for a duplicate id is no worse than today.

**Why not a bare `findIndex` (gate finding R3).** Duplicate module ids are reachable:
`importModule()` regenerates the id only on the JSON path (`modules.ts:304` `importData.id = v4()`),
while the `.risum` path pushes `readModule()`'s output verbatim with its id intact
(`modules.ts:286-287`; `readModule` returns `main.module` unchanged at `modules.ts:168`). Importing
the same `.risum` twice yields two elements sharing an `id`, which is why
`deduplicateModuleById` (`modules.ts:383-394`) exists at all. With `modules = [A(id=X), B(id=X)]`
and the user editing **B**, a bare `findIndex` resolves to **A** and destroys it. The index hint
re-identifies the exact element the user opened and only falls back when it genuinely moved.

- **Never the stored index alone.** F2 becomes a real write, so a stale index — after a delete at
  `:133`, or an import landing while the editor is open — clobbers a different module. The hint is
  validated against `id` before it is trusted, which is what makes it safe.
- `push` when absent covers create mode and the case where the module was deleted while this
  editor was open. One code path, both modes, so the `895c298e` double-insert cannot recur.
- The `namespace`/`id` cross-match at `modules.ts:377-379` does **not** interact: `findIndex`
  compares `v.id` only. That cross-match affects `getModules()` selection, which the mandatory
  `refreshModules()` already handles.
- `refreshModules()` is mandatory here (F4 + F5 + F6 + F7): replacing the array element detaches
  the proxy that `lastModuleData` is holding, and every `getModule*` consumer (F7) reads the pre-edit module
  until the enabled-id string happens to change.

### 3.3 Deep copy

`$state.snapshot(rmodule)` **alone** — no `structuredClone` — assigned into the `$state` draft so
Svelte re-proxies it deeply. Per gate finding R11, `snapshot()` already returns a fully detached
plain-object tree (`node_modules/svelte/src/internal/shared/clone.js`), so wrapping it re-walks the
tree for nothing and is the only construct in the pair that can *throw*: it converts `snapshot()`'s
silent non-cloneable fallback into a `DataCloneError` raised inside the pencil-button `onclick`.

**Never enumerate fields** (F8: 15 fields, 12 optional — dropping
`mcp`, `icon`, `namespace`, `customModuleToggle`, `lowLevelAccess` or `assets` is silent loss).
The draft must be a deep proxy, not a frozen object: `ModuleMenu.svelte:211` passes
`currentModule.lorebook` to `LoreBookList` as a plain (non-`$bindable`) prop and the child mutates
that array in place.

Byte-identity requirement: for a module opened and closed with no edits, the committed object must
serialise identically to the original. This holds, and the gate established why rather than
assuming it: the modules block is encoded with `JSON.stringify(data.modules)` (`risuSave.ts:331`,
gated by `toSave.modules` at `:328`), not a structural encoder, so only JSON-visible shape matters.
Svelte's `clone.js` walks `Object.keys()` in insertion order and preserves array holes, and
`JSON.stringify` renders holes as `null` and drops `undefined`-valued keys identically on both
sides. Nothing in `RisuModule` (`modules.ts:19-35`) or `MCPModule` (`:15-17`) is a `Date`, `Map`,
`Set`, or carries `toJSON`. Proof test 4 in section 4 pins it anyway.

### 3.4 Draft registration (F12, `ae167294`)

`registerDraft(key)` for the whole lifetime of `mode !== 0`, from an `$effect` whose cleanup
returns `unregisterDraft`, plus an `onDestroy` backstop — the exact pattern already used at
`Chat.svelte:105-110` and `:111-116` (with `onDestroy` backstops just past `:318`) and `PartialEditController.svelte:53-54,644-646`.

Key is `v4()` from `uuid`, generated once per component instance. **Not** `crypto.randomUUID()`
(`[SecureContext]`, `undefined` on plain-HTTP LAN self-hosting, a supported deployment here) and
**not** derived from an index or module id.

Correction from the gate (R4): an earlier draft justified this by claiming two *simultaneous*
editor instances. That is false — `App.svelte:212` (`{:else if $settingsOpen}` → `Settings.svelte:225`)
and `:220` (`{:else}` → Sidebar → `QuickSettingsGUI.svelte:27`) are mutually exclusive branches of
one chain, so there are two mount **sites** but never two live instances. The `v4()` decision stands
on the reason already documented at `localDrafts.ts:13-16`: a derived key collides across a remount
at the same site — instance A registers, B mounts and registers the same key, A's teardown deletes
it, and B's still-live draft is silently left unprotected.

### 3.5 The comment at `:182-184` (F3)

Removing the eager push at `:157` falsifies the comment that explains it. It must be rewritten to
describe the new design — not deleted, and not left in place. Leaving a comment that explains a
push which no longer exists is, per the reviewer profile, a rejectable defect on its own.

The double-insert bug it guards (`895c298e`) is structurally prevented by section 3.2's single
`findIndex`-then-`push`-or-`replace` path. The new comment should say that, and say it truthfully.

### 3.6 Stage A interaction (F9, F10)

No change to `moduleUpdateDeps.ts` is required — it already reads `modules.length` and
`modules[i]`, so a single-element replacement is tracked. **But** if Stage B causes
`moduleUpdate()` to read a fifth module field, `moduleUpdateDeps.ts` must be updated in the same
commit or edits to that field silently stop updating the GUI. Stage B as planned adds no such
read; the reviewer should confirm that independently.

### 3.7 Durability — the flush paths (maintainer-directed, full parity)

The maintainer was shown the cheaper alternative (a 500 ms debounce alone, no save-loop change,
~500 ms of extra exposure written up as an accepted limitation) and **reaffirmed full parity**,
explicitly accepting a change to `saveDb()`. That decision is recorded, not re-litigated here.

**Corrected baseline — this matters and the gate's R1 did not have it.** Today's durability is
*not* per-keystroke. `globalApi.svelte.ts:591` sets `debounceTime = 500`, and
`saveTimeoutExecute()` (`:594-604`) is a **trailing** debounce that `clearTimeout`s on every call
(`:598-600`). So during continuous typing `changed` is never set and **nothing is written to disk
at all** until the user pauses for 500 ms. R1 remains a real finding — losing a whole session is
still far worse than losing one unpaused burst — but the gap it must close is smaller than R1
stated, and the revised plan must not overstate it in the other direction either.

#### 3.7.1 Debounced commit

The draft commits on a 500 ms trailing debounce, matching `debounceTime`. This alone reduces the
worst case from "the entire editing session" to "one debounce window", and it is what captures
the performance win: the `dbChangeEffects.svelte.ts:34` snapshot is paid once per typing burst
instead of once per keystroke.

#### 3.7.2 Web and PWA

`pagehide` plus `visibilitychange === 'hidden'`. Both commit only — they cannot await a write, and
must not try to.

**These two are not equivalent, and revision 2's risk table wrongly credited both with saving the
tab-close case.** A commit only mutates `DBState` in memory; the write then needs the async
`$effect`, a 500 ms `setTimeout` (`globalApi.svelte.ts:601-603`), the loop to wake from
`await sleep(500)`, and an async `forageStorage.setItem` (`:839`). On a real tab close none of
that completes, so **`pagehide` contributes no durability at all** on `Ctrl+W`. It is still worth
registering, because it costs nothing and covers bfcache-style hides where the page later resumes.

`visibilitychange === 'hidden'` is the one that genuinely pays: a backgrounded PWA keeps running,
so the loop does reach the write before an eventual OS kill. Section 5's table reflects this
split.

Note `src/preload.ts:15-27`'s `beforeunload` is **not** a usable hook here: it is gated on `isWeb`
(`platform.ts:19-21`: `!isTauri && !isNodeServer && location.hostname === 'risuai.xyz'`, so false under Tauri, under a self-hosted node server, and under *any* self-hosted browser deployment), it fires
unconditionally on every navigation for every reason, and it is deliberately bypassed for
app-initiated reloads via `isAppInitiatedReload()` (`src/preload.ts:21-23`).

#### 3.7.3 Tauri desktop — the close hook

`appWindow` already exists at `globalApi.svelte.ts:56` and is currently a **dead reference** —
`grep -c appWindow src/ts/globalApi.svelte.ts` = 1, the declaration itself. The other handles are
`bootstrap.ts:52,90` and `util.ts:14,233-238`; none registers a lifecycle listener, so this is
entirely new plumbing.

API contract, settled from source rather than assumed (the investigation left it open):
`node_modules/@tauri-apps/api/window.d.ts:1223` declares
`onCloseRequested(handler: (event: CloseRequestedEvent) => void | Promise<void>): Promise<UnlistenFn>`,
and the doc block at `:1202-1218` shows an `async` handler calling `event.preventDefault()`.

Shape -- **do NOT call `preventDefault()`**:

```
appWindow.onCloseRequested(async () => {
    try {
        commitOpenDraft()
        await flushPendingSave({ timeoutMs })   // section 3.7.4
    } catch (e) {
        console.error(e)                        // never rethrow: a throw strands the window
    }
    // no preventDefault, so the Tauri wrapper closes the window itself
})
```

Revision 2 proposed `preventDefault()` then `destroy()`. Gate round 2 refuted it by reading the
runtime rather than the typings, and it is right. `node_modules/@tauri-apps/api/window.js`:

```
return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
    const evt = new CloseRequestedEvent(event);
    await handler(evt);
    if (!evt.isPreventDefault()) { await this.destroy(); }
});
```

The wrapper **already awaits an async handler** and closes the window itself. So `preventDefault()`
buys nothing and costs correctness: it opts out of the wrapper's `destroy()`, making the handler
solely responsible for closing. Any throw after it -- in the commit, in `refreshModules()`, in
`flushPendingSave` -- rejects `await handler(evt)`, skips the wrapper's `destroy()`, and **the
window never closes**. Clicking X re-runs the same handler and throws again; the user has to kill
the process. That is a strictly worse failure than the data loss this path exists to prevent, and
section 5 already declares an unbounded wait REJECT-grade.

Not calling `preventDefault()` plus a `try/catch` that never rethrows makes the close
unconditional: the window closes whether the flush succeeded, timed out, or threw.

One thing revision 2 got right and this keeps: had a manual close been needed, it must be
`destroy()`, not `close()` -- `window.d.ts:713` documents that `close()` re-emits
`closeRequested`, which would re-enter this very handler.

**The timeout is not optional.** `saveDb()` parks itself permanently on **six** paths, not the
three revision 2 cited: `globalApi.svelte.ts:704`, `:727`, `:739`, `:748`, `:979`, `:1005`, each
`await sleepForever()`. (Revision 2 cited `:709`/`:977`/`:1003`, which are `saving.state = false`
statements -- every citation was off by two, and three of the six parks were missed. `:704`,
`:727` and `:748` follow a `location.reload()` and can strand a waiter just as effectively.)
There are also retry paths (`savetrys`, `postCommitFailStreak`) with unbounded duration. Without a timeout the promise
never settles and **the user cannot close the app** — a hang is a worse failure than the data loss
this is meant to prevent. On timeout: close anyway, and surface why.

#### 3.7.4 The save-loop seam — split out as its own gated stage

There is no awaitable save today. Both candidate signals fail:

- `dirtySinceLastSave` (`:556`) and `changeTracker` (`:576`) are declared **inside** `saveDb()`
  (`:552`) — function-local, unexported, unreachable from any other module.
- `saving` (`:379`) is exported `$state` and read externally only by `SavePopupIcon.svelte:4,27`
  for an icon. Its `true`→`false` edge is **racy**: a cycle already in flight captured its
  `toSave` snapshot at `:786` *before* the draft commit, so a caller awaiting one edge can be
  satisfied by a write that does not contain the draft.

Do **not** model this on `acquireExclusiveStorageMigrationLock()` (`:506-539`). It looks like the
right pattern and is not: `dbWriteLock` is held only around the raw write (`:833-843`), not around
the encode or the debounce, so acquiring it proves no write is *currently in flight* — not that a
*just-committed* mutation has been written. Revision 2 supported this with a false claim -- that the existing callers
(`FilesSettings.svelte`) bypass `changeTracker` via `MigrationStorage.setItem`. There is no
`MigrationStorage` in that file at all (`grep -rn MigrationStorage src/` matches only
`accountStorage.ts:255,262,267`), and the callers are `:103` and `:122`, not `:114` (which is
`markAppInitiatedReload()`). What is true: `enableOpfs` writes no DB data at all, and
`disableOpfs` writes through a locally-created `localforage` instance (`:132`, `:135`). The
conclusion stands on the `:833-843` argument alone, which is independently verified.

Proposed seam — a commit-sequence correlation, module-scope in `globalApi.svelte.ts`:

```
let saveRequestSeq = 0
let flushWaiters: { seq: number, resolve: () => void }[] = []

export function flushPendingSave(opts: { timeoutMs: number }): Promise<'flushed'|'timeout'> {
    // Caller must have ALREADY mutated DBState synchronously before calling this,
    // so the sequence it takes is ordered before the next toSave snapshot.
    const seq = ++saveRequestSeq
    forceSaveNow()                      // bypass the 500ms trailing debounce
    return raceWithTimeout(waiterFor(seq), opts.timeoutMs)
}
```

Inside the loop: capture `const cycleSeq = saveRequestSeq` **at the same statement** as
`toSave = safeStructuredClone(changeTracker)` (`:786`), and once that cycle reaches
`primaryCommitted` (`:850`), resolve every waiter with `seq <= cycleSeq`.

**Why that correlation holds -- revision 2's stated proof was wrong.** Revision 2 claimed "the
snapshot at `:786` contains every mutation made before it". It does not: `:786` snapshots
`changeTracker`, i.e. *which blocks are dirty*, not the data. The data is read at `:801`
(`getDatabase()`) and encoded at `:808`. And `changeTracker.modules` is set by an **asynchronous**
`$effect` (`dbChangeEffects.svelte.ts:33-38`, registered at `globalApi.svelte.ts:606-608`), so a
synchronous `DBState.db.modules[idx] = draft` does *not* synchronously set the tracker bit.

The correlation holds on a different invariant, which B1 must write down and test rather than
leave implicit: Svelte flushes its batch on a **microtask**
(`node_modules/svelte/src/internal/client/reactivity/batch.js` -> `dom/task.js`, `queueMicrotask`,
no `requestAnimationFrame` on this path), and the loop only resumes across a **macrotask**
boundary (`await sleep(...)`), by which point microtasks have drained.

The failure this excludes is precisely the silent one: if any future change let the loop reach
`:786` without a microtask checkpoint since the caller's mutation, `toSave.modules` would be
`false`, `risuSave.ts:328` would skip the modules block entirely, the write would still land,
`primaryCommitted` would be set, and the waiter would resolve `'flushed'` -- reporting success
while the committed draft was never written. B1 gets an explicit regression test for this.

**Two things B1 must specify that revision 2 left open (gate round 2, findings 9 and 10):**

- `forceSaveNow()` has to reach `changed` (`globalApi.svelte.ts:553`) and `saveTimeout` (`:592`),
  both **locals of `saveDb()`**. Hoisting them to module scope is safe only because `saveDb()`
  has exactly one caller (`bootstrap.ts:290`); that single-instance assumption becomes a real
  invariant and must be written into the code, not assumed. `flushWaiters` must also be pruned on
  timeout, or an exported general-purpose primitive grows an unbounded waiter list.
- Two `continue` paths — `:802-806` (`!db.characters`) and `:810-814` (`!encoded`) — call
  `mergeUnsavedChanges(toSave)` and `continue` **without** setting `changed = true`. The loop then
  drops into the idle poll at `:762` and will not retry until an unrelated mutation arrives. On
  the close path nothing further mutates, so `flushPendingSave` burns its whole `timeoutMs` while
  the loop is otherwise healthy — a long stall, then a close with the draft unwritten. B1 either
  sets `changed = true` on those paths or settles waiters early.

**This is deliberately NOT part of the same commit as the module editor.** Per the maintainer's
own framing it needs its own gate, and per campaign practice risky work is split into gated
stages:

- **Stage B1** — `flushPendingSave()` + `forceSaveNow()` in `globalApi.svelte.ts`. Purely
  additive: no existing caller changes behaviour, nothing is removed, and with no waiters
  registered the loop runs exactly as it does today. Gets its own plan, its own `opus-reviewer`
  gate, and its own tests (including: a waiter registered mid-flight is NOT resolved by the
  in-flight cycle; a parked loop times out rather than hanging).
- **Stage B2** — this document: the draft copy, the debounce, the web hooks, and the Tauri close
  hook consuming B1's primitive.

B2 must not be implemented before B1 has landed and been reviewed. If B1 is rejected at its gate,
B2 falls back to the 500 ms-debounce-only shape with a disclosed residual. **That fallback also
deletes section 3.7.3 outright** and changes section 5's Tauri row to match: with no flush to
await, a close hook would carry the re-entrancy and throw risks of 3.7.3 for zero durability
benefit. The fallback is recorded here so a rejection of B1 does not strand B2.

## 4. Tests — red before green

The seam does not exist yet, and the gate (R5, R6) refuted this plan's first answer twice over.

**Not in `modules.ts`.** An earlier draft put the helper there. That is the exact placement Stage A
had to reverse: `moduleUpdateDeps.ts:24-27` documents that it lives in its own leaf module
precisely so tests can import it without pulling `modules.ts`'s runtime graph — Tauri plugins,
wasm, and a circular edge back through `stores.svelte.ts`. Adding a consumed export to `modules.ts`
is what produced Stage A's ELIFECYCLE. It also contradicted this plan's own "two files, no new
files" claim in section 3.

**Not a trivial extraction either.** Stage A had an existing expression (`$state.snapshot(...)`) to
wrap. Here today's commit is `DBState.db.modules[editModuleIndex] = tempModule`, so the only
*behaviour-preserving* extraction is `resolveCommitIndex(modules, draft, hint) { return hint }` — a
helper that exists solely to be deleted. Red-before-green obtained that way is theatre, and it would
only ever redden proof tests 2 and 3. Tests 1, 5, 6 and 7 are properties of the component, and
test 6 is the anti-data-loss test.

**Seam: a new leaf module `src/ts/process/moduleDraft.svelte.ts`** holding `mode`, the draft
`$state`, the index hint, and `openEdit` / `openCreate` / `commit` / `flush`, with the modules array
passed in. Runtime imports limited to `uuid` and `localDrafts`, so it tests with real runes and no
`vi.mock` — the same shape that made `moduleUpdateDeps.svelte.test.ts` work (the gate re-ran that
suite: 27/27 pass). `ModuleSettings.svelte` becomes a thin caller. This makes the file count
**three**, and section 3's "two files" claim is corrected accordingly.

Proof tests — must FAIL against unfixed code, and the failure output goes in the commit message:

1. Typing into a draft does not mutate `db.modules`.
2. Commit writes to the element whose `id` matches, not to a stored index — set up by deleting a
   preceding module while the editor is open.
3. Commit of a module absent from `db.modules` pushes exactly once (no double insert, `895c298e`).
4. Round-trip with no edits serialises byte-identically, with all 15 fields populated including
   `mcp`, `icon` and `assets`.
5. `refreshModules()` is called at commit, and a `getModules()` consumer sees the new content.
6. Unmount with `mode !== 0` commits the open draft (F14 — the anti-data-loss test).
7. The draft key is registered while `mode !== 0` and unregistered on commit and on destroy.
8. The 500 ms debounce commits after a typing pause, and does **not** commit mid-burst
   (§3.7.1) — use fake timers.
9. `pagehide` with an open draft commits (§3.7.2).

**Which of these the leaf can actually redden, stated honestly (gate round 2, finding 8).** The
importability claim holds — `localDrafts.ts` has zero imports and `uuid` is a leaf package, so
`moduleDraft.svelte.ts` tests with real runes and no `vi.mock`. But the leaf cannot call
`refreshModules()` without pulling `modules.ts`'s graph, which is the whole point of the leaf. So:

| Test | Reddened by | Note |
|---|---|---|
| 1, 2, 3, 4, 8 | the leaf | pure draft/commit/debounce logic |
| 5 (`refreshModules` at commit) | component-level | inject it as a callback and assert the leaf invokes it; the `getModules()` half is the smoke check |
| 6 (unmount commits), 7 (draft registration) | component-level | `mount`/`unmount` per `src/lib/UI/GUI/guiRendering.test.ts:4,31`; needs a mock scaffold this plan must budget |
| 9 (`pagehide`) | component-level | the listener lives in the component, not the leaf — a module-scope listener with no unregister would be its own defect |

**The red-before-green route, which revision 2 wrongly dismissed as theatre.** Implement the leaf
first as a faithful port of today's behaviour — `draft = module` aliasing, `commit` writing through
the stored index — confirm tests 1, 2, 3 and 6 RED against it, then apply the fix. That is a real
port of `ModuleSettings.svelte:110` and `:192`, not a helper invented to be deleted.

Stage B1 carries its own proof tests, in its own plan and its own gate:

- A waiter registered *after* a cycle captured its `toSave` snapshot is **not** resolved by that
  cycle. This is the exact race that makes a bare `saving.state` edge unsafe (§3.7.4), so it is
  the test B1 exists to pass.
- A parked loop (`await sleepForever()` — `globalApi.svelte.ts:704`, `:727`, `:739`, `:748`,
  `:979`, `:1005`) resolves the waiter as `'timeout'` rather than hanging.
- A cycle that `continue`s via `:802-806` or `:810-814` does not strand a waiter for its full
  timeout.
- The microtask-ordering invariant of section 3.7.4: a mutation made synchronously before
  `flushPendingSave()` is always reflected in the `changeTracker` snapshot at `:786`.
- With no waiters registered, the loop's observable behaviour is byte-for-byte unchanged —
  B1 is purely additive.

Coverage tests — label them as such; they pass pre-fix and are not proof: create-mode happy path,
empty-draft suppression, `mode === 0` registers nothing.

Verification: `pnpm check` 0 errors / 0 warnings, and `pnpm test` **checking the exit code, not
the pass count** — Stage A's step 1 reported "31 files, 331 passed" while emitting an unhandled
error and exiting ELIFECYCLE. Plus a manual smoke check in the real app (`.claude/launch.json`,
`risuai-web`, port 5174, `VITE_RISU_LEGAL_CONFIGURED=TRUE`; the USER accepts the ToS dialog),
because the draft/commit lifecycle has no automated coverage of the real wiring.

## 5. Invariants and risks

- **DO NOT narrow `dbChangeEffects.svelte.ts:34`.** It sets `tracker.modules`, which gates whether
  the modules block is re-encoded at all (`risuSave.ts:328`). A missed mutation is never written to
  disk. Stage B removes it from the *typing* path by not writing to `db.modules`; it does not touch
  the effect.
- **Compatibility invariant:** no change to `RisuModule`, to the save format, to import/export, or
  to any `.bin` / charx path. Upstream modules must still load and save unchanged.
- **New silent-failure surface introduced by this change.** An earlier draft claimed section 3.1
  closed this entirely. That was false and the gate rejected it (R1). Stated honestly:

  | Teardown path | Today | With this plan |
  |---|---|---|
  | Tab switch / settings close (`onDestroy` runs) | survives | survives (§3.1 step 5) |
  | PWA backgrounded then OS-killed | survives after last 500 ms pause | survives (`visibilitychange === 'hidden'`; the app keeps running, so the loop writes) |
  | Web tab close (`Ctrl+W`) | loses since last 500 ms pause | loses ≤500 ms more than today — **`pagehide` does NOT make this survive** |
  | Tauri desktop window close | survives after last 500 ms pause | survives (§3.7.3 + B1), **or** on B1 timeout degrades to one debounce window |
  | App-initiated `location.reload()` (`accountStorage.ts:117` et al.) | survives after last 500 ms pause | survives if the debounce (§3.7.1) already fired, else loses ≤500 ms |
  | Process kill / crash | loses since last 500 ms pause | loses ≤500 ms more than today |

  The residual is bounded by one 500 ms debounce window on every path, which is the same order as
  the exposure today's trailing debounce already carries (§3.7). It is **not** zero, and neither
  the commit message nor the code comments may say it is.
- **New hang risk, introduced by §3.7.3.** Waiting on a flush before allowing a window to close
  means a parked or retrying save loop could block the close. §3.7.3's timeout is load-bearing,
  not defensive polish. The reviewer should treat an unbounded wait as REJECT-grade.
- The reviewer should still hunt for teardown paths not in the table above where `onDestroy` does
  not run and the draft would be lost where today it survived.
- MCP modules are not editable (`ModuleSettings.svelte:116-122` disables the pencil), so the draft
  path never sees one through the editor — but section 3.3 must still copy `mcp`, for a non-MCP
  module that somehow carries the field.

## 6. Open questions for the gate

1. **RESOLVED by the maintainer, 2026-09-21 — full durability parity, decided twice.** No Cancel
   button: F14 is sound and discard-on-abandon manufactures a loss path that does not exist today.
   Flush-on-unmount alone does **not** restore today's durability (gate finding R1).

   The maintainer first chose full parity believing it cost one Tauri hook. Investigation then
   established that it also requires a new awaitable save primitive inside `saveDb()` (§3.7.4),
   and separately that the cheaper alternative — a 500 ms debounce alone, no save-loop change —
   lands within ~500 ms of today's actual behaviour, because today's durability is itself only
   trailing-debounced (§3.7). Both corrections were put back to the maintainer, who **reaffirmed
   full parity and explicitly accepted the save-loop change.** Recorded, not re-litigated.

   What the gate should still attack: whether §3.7.4's sequence correlation is actually sound,
   whether the B1/B2 split is drawn in the right place, and whether §3.7.3's timeout genuinely
   prevents an unclosable window.
2. **RESOLVED — empty-draft suppression on create: suppress, with a pristine-identity predicate.**
   Always-commit is not actually available: today's nameless-module wart is a direct consequence of
   the eager push at `:157`, and the only way to reproduce it after removing that push is to re-add
   an eager push, which defeats the stage. So suppression is forced, not smuggled — the commit
   message must say that.

   The predicate an earlier draft proposed ("any optional field populated") is **broken**, and the
   gate caught it: `ModuleMenu.svelte:170-184` does `currentModule.trigger ??= [{...},{...}]`, so
   merely *clicking the Trigger tab* populates two entries; `:158`, `:164` and `:190` likewise set
   `lorebook` / `regex` / `assets` to `[]`. Under that predicate, "press +, click Trigger, walk
   away" commits a nameless module — the exact wart it claims to fix.

   Use instead: suppress iff the draft is structurally identical to the object minted at
   `:152-156` — `name === ''` and `description === ''` and no key beyond `{name, description, id}`
   holding a non-empty value. **Exception:** if `assets.length > 0`, commit regardless, because by
   F16 those blobs are already in storage and discarding the reference orphans them.
3. **RESOLVED — byte-identity holds.** See section 3.3. `risuSave.ts:331` encodes with
   `JSON.stringify`, so only JSON-visible shape matters, and `$state.snapshot` preserves it. The
   `structuredClone` is dropped.

## 7. Explicitly out of scope

The `alertStore` hijack; `loadPages` not reset on character switch; the
`streamingDisplayOptimizationMode` default; last-writer-wins whole-DB overwrite; anything in
`Agents/Maybe-Later.md`; the `src/ts/kei/backup.ts:86` missing optional chaining; the
`modules.test.ts.snap` line-ending churn (keep excluding it); reworking the tracking layer
(reverted twice, `33b665d1` / `72ce7218`); the DEV-inflation hypothesis (tested and disproven at
1.18x).

---

## 8. Plan-gate record 1 — opus-reviewer, 2026-09-21 — [REJECT]

Verdict: **REJECT**. 11 findings. The orchestrator re-verified every load-bearing finding
against source rather than deferring (AGENTS.md section 4 step 4).

Sustained, with the orchestrator's own re-verification:

- **R1 (REJECT-grade).** Section 5's claim that flush-on-unmount closes the new loss surface is
  FALSE. `onDestroy` does not run on process or document termination.
  `grep -rn "onCloseRequested" src/` returns nothing (the only hits are binary build artifacts
  under `src-tauri/target/`). `preload.ts:15` gates the sole `beforeunload` handler on `isWeb`,
  so the Tauri desktop build has NO unload hook at all. And `accountStorage.ts:114-117`
  server-pushed `reloadSession` reloads through the `isAppInitiatedReload()` bypass at
  `preload.ts:20-22`, which is deliberately un-cancellable. Today every keystroke is durable
  within roughly 500 ms; under the plan a desktop window close loses the entire editing session
  silently.
- **R2.** Section 1's perf attribution is false. `f4867e63`'s benchmark reads
  `trackModuleUpdateDeps() 0.03 ms` and `per keystroke 58.35 ms -> 29.21 ms (2.00x)`. 29.21 ms is
  the post-Stage-A per-keystroke TOTAL, not the cost of `stores.svelte.ts:197`, which is now
  0.03 ms. As written the two bullets sum to 58.39 ms and imply Stage A bought nothing.
- **R3 (REJECT-grade).** Duplicate module ids are reachable: `modules.ts:286-287` pushes
  `readModule()`'s output verbatim with its id intact, while `:304` regenerates the id only on the
  JSON path — so importing the same `.risum` twice yields two elements sharing an id.
  `deduplicateModuleById` (`modules.ts:383-394`) exists because of this. Bare
  `findIndex(v => v.id === draft.id)` resolves to the first match, and section 3.1's
  always-commit-on-destroy makes clobbering the wrong module unconditional rather than
  requiring a button press.
- **R4.** "Two simultaneous mount points" is false. `App.svelte:212` (`{:else if $settingsOpen}`
  → `Settings.svelte:225`) and `:220` (`{:else}` → Sidebar → `QuickSettingsGUI.svelte:27`) are
  mutually exclusive branches of one chain. Two mount SITES, never concurrent. The `v4()`
  decision in section 3.4 still stands, but on the remount-collision reason already documented at
  `localDrafts.ts:13-16`, not this one. (The reviewer's own citations here were off by one:
  it wrote `:211/:219/:223` for what is `:212/:220/:225`.)
- **R5.** Sections 3 and 4 contradict each other — "two files, no new files" versus a new helper
  "in `modules.ts`". The latter also walks back into the failure Stage A had to undo:
  `moduleUpdateDeps.ts:24-27` documents that a leaf module exists precisely so tests need not pull
  `modules.ts`'s runtime graph (Tauri plugins, wasm, a circular edge through `stores.svelte.ts`).
- **R6.** Proof tests 1, 5, 6 and 7 are properties of `ModuleSettings.svelte` and the plan names no
  seam that makes them red. An index-or-push helper can only redden tests 2 and 3. Test 6 is the
  anti-data-loss test, so this is not a cosmetic gap.
- **R8.** Fifteen fields, **12** optional, not 13 — `name`, `description`, `id` are required.
- **R9.** "Net semantics: identical to today" is false. By F5 the `getModules()` cache holds live
  proxies, so today the sidebar editor shows `hideIcon` / `backgroundEmbedding` changes live while
  typing, and in-progress module content is already visible to prompt-building consumers. A draft
  copy stops both until commit.
- **R10.** "F16 cannot orphan an asset" is false on every R1 path: `ModuleMenu.svelte:263` writes
  the blob before `:264` records the reference.
- **R11 (suspicion).** `structuredClone` on top of `$state.snapshot` is redundant, and is the only
  throwing construct in the pair. Drop it.

Partially sustained:

- **R7.** The plan's "49 consumers" is wrong. The reviewer's replacement (21 external / 28 total)
  does not reproduce either — the orchestrator measures 19 external / 12 internal. The conclusion
  (`refreshModules()` at commit is mandatory) is unaffected. Cite the command, not a number.

Confirmed sound by the reviewer, independently:

- **F14's core reasoning.** The enumeration of `mode` assignments holds; the global Escape at
  `hotkey.ts:241-248` and `MobileHeader.svelte:33` are both destroy paths, not hide paths. So
  discard-on-abandon really would be the data-loss model, and **rejecting the brief's literal
  wording was correct.**
- **Section 3.6.** No fifth field read is introduced; `moduleUpdateDeps.ts:31-33` genuinely tracks
  single-element replacement, and `moduleUpdateDeps.svelte.test.ts:404` already covers it
  (reviewer re-ran it: 27/27 pass).
- **F1-F6, F9-F16** and the `:182-184` comment correction all verified exactly.
- Putting a component-created `$state` proxy into `DBState.db.modules` is safe in Svelte 5.55.1.

Reviewer recommendations on the section 6 open questions, for the revision to disposition:

1. Keep flush-on-unmount, do NOT add Cancel — but add an idle-debounced commit (~1.5-2 s) plus
   `pagehide` / `visibilitychange`, and either a Tauri `onCloseRequested` commit or a written
   acceptance of losing up to one debounce window on desktop window close.
2. Suppress the empty create-draft, but define "empty" as byte-pristine against the object minted
   at `:152-156`. The plan's predicate is broken: `ModuleMenu.svelte:170-184` populates
   `trigger` with two entries merely on clicking the Trigger tab. Commit regardless if
   `assets.length > 0`, since those blobs are already in storage.
3. Byte-identity holds. `risuSave.ts:331` encodes with `JSON.stringify(data.modules)`, so only
   JSON-visible shape matters, and Svelte's `clone.js` preserves key order and array holes. Keep
   proof test 4; drop the `structuredClone`.

**Disposition: plan not approved. Revision required, then a second plan gate before any
implementation.** Open scope question raised to the user: R1's remedy expands the stage past
"2 files, ~6 edit sites".

---

## 9. Plan-gate record 2 — opus-reviewer (fresh context), 2026-09-21 — [REJECT]

Verdict: **REJECT**, 11 findings, 6 REJECT-grade. A fresh dispatch, explicitly told it was not
bound by round 1's conclusions. The orchestrator re-verified every REJECT-grade finding against
source before accepting it.

Sustained, orchestrator-verified:

- **#1 (the serious one).** Revision 2's "index hint" fix was **circular and fixed nothing**. The
  only index computed at open is `ModuleSettings.svelte:109`
  `DBState.db.modules.findIndex((v) => v.id === rmodule.id)` — already a bare `findIndex` by id.
  So validating `modules[hint]?.id === draft.id` re-derives the same wrong element, and for
  `[A(id=X), B(id=X)]` with B open, the commit still destroys A. Worse than today, because
  revision 2 fires the commit on debounce, unmount, `pagehide` and window close rather than only
  on a name-gated button. Corrected in section 3.2 to object identity (`indexOf(openedRef)`).
- **#2.** Section 5's risk table credited `pagehide` with saving the web tab-close case. It does
  not: a commit only mutates memory, and the write needs an async effect, a 500 ms timeout, the
  loop to wake, and an async `setItem` — none of which complete on `Ctrl+W`. The row was also
  conflating `pagehide` with `visibilitychange === 'hidden'`, which *does* pay. Split and corrected.
- **#3.** Revision 2's Tauri handler shape could strand an **unclosable window**. Read from the
  runtime, not the typings: `@tauri-apps/api/window.js`'s `onCloseRequested` already
  `await handler(evt)` and then `if (!evt.isPreventDefault()) await this.destroy()`. Calling
  `preventDefault()` opts out of that `destroy()` and makes the handler solely responsible, so any
  throw after it leaves the window permanently unclosable. Corrected: no `preventDefault()`, plus a
  `try/catch` that never rethrows.
- **#4.** Revision 2's flush-correlation proof was wrong about its own cited line. `:786` snapshots
  `changeTracker` (which blocks are dirty), not the data — the data is read at `:801` and encoded
  at `:808` — and the tracker bit is set by an **async** `$effect`. The correlation does hold, but
  on a microtask-vs-macrotask ordering invariant that revision 2 never stated. Rewritten, with the
  silent-failure mode it excludes spelled out and a B1 regression test for it.
- **#5.** Three citation sets wrong in the safety-critical argument: `sleepForever()` is at
  `:704`, `:727`, `:739`, `:748`, `:979`, `:1005` — **six** sites, not three, and revision 2's
  `:709`/`:977`/`:1003` are all `saving.state = false`, off by two each. The `FilesSettings.svelte`
  / `MigrationStorage` supporting sentence was fabricated — `grep -rn MigrationStorage src/`
  matches only `accountStorage.ts:255,262,267`. All corrected.
- **#6.** Section 3.2 still asserted "49 consumers" while F7 retracted it seven sections earlier —
  the same document stating incompatible facts. Removed.
- **#7-#11.** Unconditional teardown commit turns every no-edit open/close into a full modules
  re-encode and flips a clean tab dirty (changing `getMultiTabAction` from `'auto-reload'` to
  `'prompt'`); the leaf seam cannot redden tests 5/6/7/9 as claimed; B1 never specified how
  `forceSaveNow()` reaches `saveDb()`'s closure locals, nor waiter pruning; two `continue` paths
  (`:802-806`, `:810-814`) can strand a waiter for its full timeout on a healthy loop; the B2
  fallback failed to delete section 3.7.3. All folded in.

Confirmed sound by this gate, independently re-derived:

- **Section 3.7's corrected baseline** — `debounceTime = 500` is trailing and re-arms on every
  call, so continuous typing never sets `changed`. The only other `changed = true` sites are
  `:602`, `:757` and `:916`, none on a typing path. "Loses ≤500 ms more than today" is
  arithmetically right: the two debounces are sequential, not additive.
- **`primaryCommitted` is the correct resolve edge** — set at `:850` only after the write resolves
  under `dbWriteLock` (`:835-840`); everything after is ancillary. A failed write cannot resolve a
  waiter.
- **Section 3.3** — byte-identity verified down to `clone.js:57-105`, hole preservation at
  `:66`/`:75`, the non-cloneable fallback at `:128-136`, and `proxy.js:333-348` preserving key
  order. Dropping `structuredClone` is right.
- **Section 1's numbers** reproduce exactly from `f4867e63`; `0.03 + 29.18 = 29.21`.
- **F1-F6, F8-F16** verified exactly. **B1's additivity claim is correct.** **The B1/B2 split line
  is drawn in the right place.**

**Disposition: revision 3 written, third gate not yet run.** Orchestrator note for the record: of
the 22 findings across both gates, the majority were errors in the orchestrator's own plan text,
including two that would have shipped a silent-data-loss path while claiming to close one. The
gate is earning its cost; the plan text is not yet trustworthy on first draft.

---

## 10. Strategic escalation — senior-advisor (Fable 5.1), 2026-09-21 — DIRECTION CHANGE

Escalated under AGENTS.md 1.2 after two successive rejections. Two of its claims are decisive and
were re-verified by the Orchestrator against Svelte's source before being accepted.

### 10.1 Revision 3 does not work. The optimisation defeats itself after 500 ms.

**This is not a findings-quality issue — the design does not deliver the win it exists for, and
neither Opus gate caught it.**

Section 3.2 commits with `DBState.db.modules[idx] = draft`, where `draft` is the leaf's `$state`
proxy. Svelte's array `set` trap runs `proxy(value)` (`node_modules/svelte/src/internal/client/proxy.js:302`),
and `proxy()` returns the value **unchanged** when `STATE_SYMBOL in value` (`:42-45`). So the
stored element *is* the draft object.

Consequence: after the first 500 ms debounced commit, the draft and the db element are the same
object again. Aliasing is re-established, `dbChangeEffects.svelte.ts:34` re-runs on **every
subsequent keystroke for the rest of the editing session**, and the 29.18 ms is back. Stage B
buys 500 ms of relief per editing session.

Second-order: `openedRef` (the element captured at open) is no longer in the array, so
`indexOf` returns -1 and every later commit falls through to the bare-id fallback — silently
degrading the duplicate-id fix of section 3.2 to exactly the behaviour it was written to prevent.

Fixable in one line (commit `$state.snapshot(draft)` so the set trap mints a fresh proxy), but
this is the **third consecutive revision with a fatal flaw**, and the first where the flaw is that
the optimisation does not optimise.

### 10.2 The premise was wrong: this is a granularity problem, not a persistence problem.

The 29.18 ms is not "the cost of tracking `db.modules` for persistence". It is the cost of one
effect's *dependency closure* being the whole array, so one leaf write re-walks all ~52 modules.

The draft design accepts that premise and moves the **data** out of `db` rather than fixing the
**effect shape** — which manufactures a durability delta that did not exist, which needs a
debounced commit, which needs teardown flushes, which on Tauri needs an awaitable save, which
needs a timeout because `saveDb()` parks on six paths, which needs a close hook with specific
re-entrancy semantics. **Every REJECT-grade finding across both gates is a defect in one of those
compensating layers.** The design generates the findings.

### 10.3 Recommended replacement — partition, do not narrow

"Do not narrow" and "do not partition" are different constraints, and only the first is
load-bearing. The invariant is that every mutation of `db.modules` sets `tracker.modules` before
the next `toSave` snapshot (`globalApi.svelte.ts:786`). Narrowing drops dependencies and violates
it. **Partitioning keeps the identical closure, sliced per element:** an outer effect over array
shape (`length`, element identity — the reads `moduleUpdateDeps.ts:31-33` already performs) plus
one child effect per element deep-reading only that element. A keystroke re-runs one child: the
snapshot of one module.

Verified legal: `validate_effect` (`node_modules/svelte/src/internal/client/reactivity/effects.js:53-63`)
throws only when there is no active effect/reaction or during teardown; nested effects are fine.

This is **not** the twice-reverted `#1233` proxy layer — `git show 33b665d1` shows a hand-rolled
267-line listener proxy (`databaseState.svelte.ts`) replacing Svelte's own. A partition uses only
`$effect` and `$state.snapshot`, already in the file.

Scope collapses dramatically: `ModuleSettings.svelte` is untouched, so F14, F15, F16, duplicate
ids, `refreshModules()`, `localDrafts`, the Tauri hook and B1 all leave scope, because nothing
about *when data reaches `db`* changes. The test seam already exists —
`src/ts/storage/tests/dbChangeEffects.svelte.test.ts`, 8 tests, real `$state` DBState driven with
`flushSync`.

### 10.4 B1 was mis-sold, including by this plan

B1 + `onCloseRequested` makes Tauri window close **lossless**, which is an *upgrade* over today
(`globalApi.svelte.ts:594-604`'s trailing debounce already loses an unpaused burst), not parity.
It is an app-wide durability item that benefits every editor, discovered here but not owned here.
It should be its own roadmap item with its own plan and gate, and the maintainer should be asked
about it on those honest terms rather than as a Stage B dependency.

### 10.5 Measure before planning anything — there is no end-to-end number

`Agents/Tools/README.md:76-79` states the benchmarks run against a standalone `$state` container,
excluding the effects' downstream work, so the real figure is "this **or higher**". Nobody has
measured input-event-to-paint in the real app. Required before the next plan:

1. End-to-end keystroke latency, 52-module profile, plus a local never-shipped probe assigning a
   snapshot at `ModuleSettings.svelte:110` — that second number is the **ceiling of any approach**
   that removes the effect from the typing path. If it is still near 16.7 ms, the cost is in
   `ModuleMenu`/`LoreBookList` DOM and neither design reaches budget.
2. `$state.snapshot` of one giant module vs the whole array. Under ~5 ms and the partition lands
   in budget; over ~10 ms and a draft would pay the same in its debounce detector.
2b. **Scaling check — added after the profile-size answer below.** Measure the whole-array
   snapshot at ~52 AND at ~100+ modules. This tests the linearity assumption, establishes what the
   maintainer's own profile actually costs today, and quantifies the partition's O(modules) -> O(1)
   claim rather than asserting it.
3. ~~Ask the maintainer what a real profile looks like.~~ **RESOLVED 2026-09-21 — the fixture is
   representative, and conservative.** The maintainer reports **100+ modules** in their own
   installation (firsthand), and that **50+ module installations seem common in the community**
   (their impression, not measured — record as reported, not verified). They explicitly noted they
   sit at the heavy end and asked that this be taken as context.

   The advisor's "this may be a benchmark artefact" uncertainty is therefore **closed in the
   opposite direction**: the 52-module / 7.27 MB fixture is not a worst case, it is near the median
   of the affected population, and the maintainer's own profile is roughly double it.

   **This raises the value of the work and sharpens the choice of mechanism.**
   `dbChangeEffects.svelte.ts:34` snapshots the entire array, so its per-keystroke cost scales with
   module count. If that scaling is roughly linear, a 100-module profile pays well over 50 ms per
   keystroke from that one effect alone — more than 3x the 16.7 ms frame budget — meaning typing is
   genuinely broken for the heaviest users, not merely slow.

   It also favours the partition on a property neither mechanism had been credited with: **the
   partition's steady-state per-keystroke cost is one module's snapshot, approximately independent
   of module count.** Today's shape is O(modules) per keystroke; the partition is O(1). The win
   grows with profile size instead of shrinking, and the worst-affected users benefit most. A draft
   copy has the same O(1) property but only buys it with the persistence change that both gates
   rejected — so the partition dominates it on this axis too. Linearity remains an assumption until
   2b is measured.

### 10.5b Benchmark result, and why it is PROVISIONAL

`Agents/Tools/save-gen/module-partition-bench.harness.ts` (production, seed 1337,
module-heavy, 52 modules / 7.27 MB). Run by `perf-analyzer`, then **re-run independently by
the Orchestrator**; both agree within ~2% and exit 0.

| Condition | Production median | vs 16.7 ms budget |
|---|---|---|
| whole-array snapshot (today) | 29.80 ms | **178%** |
| one module, LARGEST in fixture | 4.19 ms | 25% |
| one module, MEDIAN | 0.198 ms | 1% |
| all 52 individually, one pass (shape change) | 30.21 ms | 1.01x today's single walk |

On its face the partition clears budget and adds no shape-change regression.

**But the fixture's "largest module" is the CHEAPEST shape to snapshot, so this is not the
worst case.** It is 85% a single 1.4 MB `cjs` string — close to a memcpy. The maintainer
reports real "asset modules" bundling **10,000+ images** to work around RisuRealm's 150 MB
upload limit, reaching 1-2 GB on disk.

Those gigabytes do **not** enter `db.modules` — verified: `saveAsset()`
(`globalApi.svelte.ts:324-335`) returns a hash id and `ModuleMenu.svelte:264` pushes
`[name, id, extension]` into `RisuModule.assets?: [string,string,string][]` (`modules.ts:30`).
So such a module adds ~1 MB of strings. **Similar bytes, radically different structure:**
~10,001 nested arrays versus a few giant strings. `$state.snapshot` cost tracks node count far
more than byte count, so an asset module is plausibly far more expensive than 4.19 ms.

Measurement addendum dispatched: asset-shaped module at 1k / 5k / 10k entries; whole-array
scaling at 52 vs ~104 modules; and the `$effect` scheduling/teardown overhead of N children
versus 1, which `perf-analyzer` correctly flagged as unmeasured in its own report.

**ADDENDUM LANDED — see 10.5c. The provisional warning above was justified: the asset shape
does change the conclusion, though not the recommendation.**

### 10.5c Addendum results (perf-analyzer, Orchestrator-reproduced, all exit 0)

**Asset-heavy module, single module, production.** Cost tracks NODE COUNT, not bytes — confirmed:

| `assets` entries | Bytes | Production | vs 16.7 ms budget |
|---|---|---|---|
| 1,000 | 0.10 MB | 3.59 ms | 22% |
| 5,000 | 0.51 MB | 17.12 ms | **exceeds budget alone** |
| 10,000 | 1.03 MB | 35.61 ms | **2.1x budget alone** |

At near-identical bytes, the 1.03 MB asset module costs **~8x** the 1.65 MB cjs-heavy module
(4.0-4.7 ms). A single 10k-asset module costs more than today's entire 52-module whole-array walk.

**Module-count scaling — linearity confirmed, "O(modules) today" holds.**

| N | Bytes | Production |
|---|---|---|
| 52 | 7.27 MB | 29.66 ms |
| 104 | 14.55 MB | 65.93 ms (2.2x) |

Caveat recorded by the agent: the 104 point is the 52-module fixture duplicated, not an
independently-built fixture — `build.ts` has no exact-count parameter.

**`$effect` overhead of N children vs 1 — NOT detectable.** Steady state, one leaf mutation:

| N | Partitioned (one child fires) | Today (whole-array effect) |
|---|---|---|
| 52 | 0.28 ms | 30.84 ms |
| 104 | 2.97 ms | 62.95 ms |

Isolation held in every run: mutating one module's leaf dirtied exactly that module's child and
none of the other 51/103. Shape-change (teardown + recreate + mount all N) vs today's single
effect re-run: **0.92-1.01x**, no growth trend from 52 to 104 — overhead is below measurement
noise. Both sides are dominated by the same traversal cost. Shape changes remain expensive either
way (40-113 ms); the partition neither fixes nor worsens that uncommon path.

### 10.5d What this means

**For a normal module at the maintainer's real scale (104 modules), the partition is a large
multi-x improvement, not the ~2x this campaign has been valuing** (harness ratios; see 10.5g for
the smaller, more trustworthy in-browser ratios, and 10.5h for the hardware caveat that bounds all
of these). Today every keystroke in every
module pays 65.93 ms (394% of budget). Partitioned, a typical module costs 0.28 ms and the worst
non-asset module 2.97 ms. This is a far stronger result than the draft-copy design ever promised,
at a fraction of its risk, and it touches no persistence code.

**Known scoped limitation — asset modules.** A module with 5,000+ asset references exceeds the
frame budget on its own, partitioned or not. So the partition does NOT make *editing an
asset module* fast. It still helps that user enormously: today one 10k-asset module anywhere in
the profile adds ~35 ms to every keystroke in every OTHER module; partitioned, that cost is paid
only while editing that module. The asset case is a separate, narrower problem — bounding or
virtualising what is deep-read from `assets` — and must NOT be absorbed into this stage.
Note that narrowing the `assets` read is forbidden by the same rule as the rest: a missed mutation
is never written to disk. Any asset fix needs its own plan and its own gate.

One conclusion is already robust, and it is the strongest argument for the partition yet:
**today a single asset module anywhere in the profile taxes every keystroke in every other
module**, because the effect's closure is the whole array. Partitioned, that cost is paid only
while editing that one module. For a 100+ module profile containing asset modules, that is the
difference between "typing is broken everywhere" and "one module is slow to edit".

### 10.5e PRIOR ART — the fix already exists in this file, for characters

Supplied by the maintainer and verified against source. This is the strongest argument for the
partition and it was not discovered by either gate, the advisor, or the Orchestrator.

The maintainer reports that this "freeze on every keystroke" behaviour **used to affect every text
field in the app**, and that character definitions and character lorebook entries **already got
fixed** — modules are the leftover. The community workaround for modules is to edit text elsewhere
and paste when done, and there is a community plugin that opens a separate text window and commits
only on "done". (That workaround is, notably, the draft-copy design implemented by hand — evidence
that draft semantics have product value, but the partition removes the need for it by fixing the
cause.)

The fix is in `dbChangeEffects.svelte.ts` itself:

- `:64` **excludes** `characters` from the generic deep-read loop.
- `:70-86` deep-reads only `DBState.db.characters[selIdState]` — the **selected** character.
- `toSaveType` (`risuSave.ts`) gives characters **per-entity tracking**: `character: string[]` and
  `chat: [string, string][]`, keyed by `chaId`.

Modules got neither: `:33-38` is `$state.snapshot(DBState.db.modules)` plus
`modules: boolean` — the whole array, one flag.

**So the partition is not a new pattern. It is the pattern this file already uses for the entity
that was already fixed, applied to the entity that was missed.** That reframes the change from
"an optimisation" to "finishing an incomplete fix", which is a materially easier case to defend at
a gate and a materially safer one to implement.

**Important difference in mechanism, do NOT copy characters literally.** Characters scope by a
global selection (`selectedCharID`) plus per-entity save blocks. Modules have neither: there is no
global "module being edited", and `risuSave.ts:328-334` encodes modules as **one monolithic block**
(`JSON.stringify(data.modules)`). Therefore:

- The partition must keep `tracker.modules` a single boolean, set by ANY child effect. Save
  behaviour is then bit-for-bit identical to today — no save-format change, no migration, and the
  compatibility invariant is untouched.
- Scoping by "currently edited module" the way characters scope by `selIdState` would be **unsafe**:
  mutations from import, delete, toggle, or a plugin would be missed, and a missed mutation is never
  written to disk. Per-element child effects cover every element and have no selection assumption,
  so the module version is strictly safer than the character version it is modelled on.

Related history on this file: `339d5ed1` extracted these effects from `saveDb()`; `8bc0f426` fixed
presets silently discarding renames and images — the `:19-24` comment records that a shallow read
there missed in-place mutations. That comment is the in-tree warning against narrowing, and the
partition respects it by preserving the full closure rather than reducing it.

### 10.5f REAL-APP measurement (Orchestrator, browser pane, dev build)

Run against the live app on `http://localhost:5174` with the seed-1337 fixture loaded (52 modules).
Read-only where possible; the one mutating measurement restored the original value and verified it
(`restored: true`).

| Measurement | Browser (dev) | Node harness for comparison |
|---|---|---|
| `snapshot(modules)` whole array | **11.3 ms** | 29.8 ms (prod) / 34.0 ms (dev) |
| `snapshot(module)` largest | **1.4 ms** | 4.19 ms (prod) |
| **Full per-keystroke effect flush** (mutate + drain microtasks) | **11.5 ms** (min 10.9, max 18.4) | n/a |

**Two corrections to the harness README's caveat** (`Agents/Tools/README.md:76-79`, "the real
per-keystroke figure is this **or higher**, never lower"):

1. **Wrong on engine speed.** Chromium is ~2.6x faster than the Node/vitest harness on identical
   data. The absolute harness numbers overstate real cost substantially. The *ratio* between
   whole-array and single-module holds (~8x both ways), so the harness remains valid for
   comparing designs — just not for absolute budget claims.
2. **Right, but negligibly, on downstream work.** Full effect flush (11.5 ms) minus raw snapshot
   (11.3 ms) is ~0.2 ms. The effect is essentially all snapshot.

**What this means.** At 52 modules the effect alone is 69% of the frame budget with the editor
closed. At the maintainer's 100+ modules, applying the measured 2.17x scaling, it is roughly
**23 ms — about 138% of budget** — before any asset module is counted. That is a real over-budget
figure from this single effect, which both confirms the maintainer's reported freeze and confirms
the effect (not only DOM) as a genuine cause.

Partitioned, that becomes ~1.4 ms worst case and well under that typically, and it stays there as
module count grows.

### 10.5g GAP CLOSED — editor open, real input events, real module counts

Maintainer's direction: close gaps with real data rather than interpolation. Done. Measured in the
live app with the module editor OPEN on the largest module, dispatching real `input` events into
the name field, timed to forced style+layout flush. All mutations restored and verified.

| Modules | Input -> layout (median) | min / max | vs 16.7 ms budget |
|---|---|---|---|
| 52 (fixture as loaded) | **13.2-13.7 ms** | 13.0 / 25.5 | 79-82% |
| **104 (duplicated in-app, measured)** | **25.1 ms** | 24.2 / 27.5 | **150%** |

Ratio 52 -> 104: **1.9x**. Linearity is now confirmed on live in-app data, not only in the harness.
Restoration verified after every run: module count back to 52, no `DUP ` entries left, all names
clean, settings UI returned to its prior state.

**The advisor's ceiling question is answered: DOM does NOT dominate.**

| Component | Cost at 52 modules |
|---|---|
| Effect flush (editor closed, programmatic mutation) | 11.5 ms |
| Editor open, full input -> layout | 13.7 ms |
| **=> DOM/render share** | **~2.2 ms (~16%)** |
| **=> effect share** | **~11.5 ms (~84%)** |

So a tracking change DOES reach budget, and the win will be felt rather than absorbed by DOM cost.
Projected partitioned cost: ~2.2 ms DOM + ~1.4 ms single-module snapshot = **~3.6 ms, ~22% of
budget — and flat as module count grows**, versus 25.1 ms and rising today at 104 modules.

**This supersedes the extrapolated "~23 ms at 100+ modules" figure above with a measured 25.1 ms.**

**Remaining honest caveats.** (1) Dev build, not production — production is typically faster, so
these are conservative. (2) The 104-module point duplicates the 52-module fixture in-app; it is
real measurement on real app state, but not 104 independently-authored modules. (3) The fixture's
heaviest module holds 97 asset refs; a real 5,000-10,000-asset module was measured only in the
harness (17-36 ms for that module alone) and not in the browser.

### 10.5h HARDWARE CONTEXT — every number above is a BEST CASE

Supplied by the maintainer. **All measurements in 10.5b through 10.5g were taken on an
Intel i9-13900K / RTX 3090 / 64 GB DDR5 machine** — near the top of consumer single-threaded JS
performance. They are a *lower bound on latency*, not a typical user experience.

This project explicitly targets hardware far below that: Raspberry Pi self-hosting (already noted
elsewhere in this campaign as popular with this community) and mobile browsers / PWA. Single-core
JS throughput on a Pi 4/5 or a mid-range phone is commonly several times slower than a 13900K, and
`$state.snapshot` is pure single-threaded pointer-chasing and allocation — exactly the workload
that scales worst on weak cores and slow memory.

**Claims that must be corrected before they reach a plan or a commit message:**

| Claim as previously written | Corrected |
|---|---|
| "The partition clears the 16.7 ms frame budget" | Clears it **on a high-end desktop**. Budget compliance on low-end hardware is **unverified** |
| "25.1 ms at 104 modules" | 25.1 ms **on a 13900K**. Proportionally worse on weaker hardware |
| "~3.6 ms partitioned" | ~3.6 ms **on a 13900K** |

**What IS hardware-independent, and it is the load-bearing part.** The improvement is a *ratio*:
the partition skips walking N-1 modules per keystroke. That ratio (~7x at 52 modules, ~14x at 104,
growing with module count) comes from doing less work, not from doing work faster, so it holds on
any hardware. What varies is only whether the remaining cost fits in a frame.

**This strengthens the case rather than weakening it, and changes who benefits most.** In absolute
milliseconds the saving is *larger* on slow hardware: if a Pi is 8x slower, today's 104-module
keystroke is ~200 ms and the partitioned one ~29 ms. Neither is inside the frame budget, but one is
unusable and the other is merely imperfect. The users helped most by this change are precisely the
ones on the weakest hardware — the opposite of the usual pattern where optimisations matter most to
people who already have fast machines.

**Honest statement for the plan and the commit message:** this change removes an O(modules)
per-keystroke cost and replaces it with O(1). On a high-end desktop that brings a 104-module
profile from ~25 ms to ~3.6 ms, inside the frame budget. On low-end hardware the same ~7-14x
reduction applies, but whether the result fits in 16.7 ms is **not measured and must not be
claimed**. Verifying that needs someone running the build on a Pi or a phone.

**Follow-up worth doing, not blocking:** re-run 10.5g under CPU throttling (Chrome DevTools
`Emulation.setCPUThrottlingRate`, 4x/6x/20x) or on real low-end hardware, before/after the
partition. That converts the low-end claim from an argument into a measurement. It could not be
done from this session — the browser pane exposes page-context JS, not the CDP emulation domain.

### 10.6 Status

**This plan is SUPERSEDED, not merely rejected.** Do not write revision 4. The draft copy may
return later as a *product* decision (half-typed regexes should not reach prompt building until
committed — gate round 1, R9 item 2), decided on those terms, never as a performance fix.
