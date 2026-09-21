# Report 14 — AV-2: resolve avatars only near the viewport (plan, revision 2)

Stage AV-2 of the avatar track (maintainer letter C). AV-1 landed as `64777a34`: each avatar now
resolves once per character instead of on every re-render. AV-1 did not change the **initial
mount**: opening a list of N characters still resolves N avatars. On the plain-browser branch each
one is a fresh base64 `data:` string, 1.33 bytes per image byte. AV-2 bounds that work and, if the
measurement in §2 says it is worth it, that memory.

Evidence: ledger 28 (investigator packet, spot-checked by the Orchestrator). Constraints carried
over from Report 12 §3.

## 1. Facts the plan rests on

- **Scroll roots.**
  - `GridCatalog.svelte:57` and `Sidebar.svelte:542` are bounded `overflow-y-auto` containers
    under the `h-screen` root (`App.svelte:129`).
  - `MobileCharacters.svelte:73` is also `overflow-y-auto`, and is **nested inside
    `GridCatalog.svelte:57`** when shown from GridCatalog's "Simple" tab.
- **The nested case is the common phone path.**
  - "Simple" is GridCatalog's default tab (`GridCatalog.svelte:21`, `selected = $state(3)`,
    rendered at `:165-166`).
  - The standalone `MobileBody` route is used only with the opt-in Beta Mobile GUI
    (`bootstrap.ts:281`; `betaMobileGUI` has no default-true).
  - So a default phone gets Sidebar plus GridCatalog, whose Simple tab is the nested
    MobileCharacters. Which of the two nested boxes actually scrolls is inferred from flex
    `min-height:0` mechanics, not measured.
- **Consumers already have a same-size non-image state.** (SidebarAvatar's no-src branch is exercised today only by folders; v10 asserts it for the other sites.)
  - `BarIcon` has `additionalStyle: string | Promise<string>` and a fixed 3.5rem box in both
    `{#await}` branches.
  - `SidebarAvatar`'s no-src, pending and resolved states share one fixed size (`:46-119`).
  - So an unresolved avatar needs no new markup and causes no layout shift.
  - `data-char-id` (`SidebarAvatar.svelte:44`) is independent of the avatar value, so
    `scrollToActiveCharacter` (`Sidebar.svelte:224-259`, query at `:251`) is unaffected.
- **No reusable per-item IntersectionObserver exists.**
  - The three existing users (LazyPortal, PartialEditController, PlaygroundInlayExplorer) are
    single-target. LazyPortal has zero importers.
  - `use:` action precedent in this file family: `SidebarAvatar.svelte:41`.
- **Tests: happy-dom's IntersectionObserver is a no-op stub.** In
  `node_modules/happy-dom/lib/intersection-observer/IntersectionObserver.js` (v20.1.0),
  `observe`, `unobserve` and `disconnect` are `// TODO: Implement`. The callback never fires, so
  the design needs an injectable observer.
- **Who holds the big string.**
  - On the plain-browser branch, `getFileSrc` caches only the raw bytes (`fileCache`, bounded).
    The base64 string is rebuilt on every call (`globalApi.svelte.ts:285`), and only the DOM
    (BarIcon `style`, SidebarAvatar `<img src>`) and the `{@const}` derived hold it.
  - On the Tauri, service-worker and account branches the string is a short URL.
  - Only plain-browser has a string-size memory problem.
- **Adjacent O(N) site.** `AlertComp.svelte:385-388` resolves every character's avatar whenever
  the selectChar dialog opens. It is unkeyed, but does not churn (AV-1 test: 0 lookups on
  rename). It has the same initial-mount problem, so it is folded in (see
  feedback-stage-and-gate-risky-batches).
  - Left alone and recorded instead: `CharConfig.svelte:287`, bounded by group size, and
    `BookmarkList.svelte:185,198`, which is gated behind expand.

## 2. Step 0 — measure release before designing it (perf-analyzer)

Report 12 §3 says "bound memory, don't just defer". Whether dropping a `data:` URL from the DOM
actually frees the **decoded bitmap**, not just the JS string, is engine behaviour. It has no
in-repo evidence. Measure it in Chromium before any code:

- Standalone probe, not the app: 200 fixed-size elements with distinct ~2 MB PNG `data:` URLs,
  first as CSS `background-image` (BarIcon's path) and then as `<img src>` (SidebarAvatar's
  path).
- Record renderer memory (CDP `Memory`/`SystemInfo`, or `performance.measureUserAgentSpecificMemory`
  where available) and JS heap in four states:
  1. baseline;
  2. all shown;
  3. the attribute cleared on all elements, plus GC;
  4. re-shown.
- Report absolute bytes and the ratio to the summed PNG bytes. State the hardware. Argue from
  ratios, since the i9 and RTX 3090 flatter decode.
- **Decision rule:**
  - If clearing frees most of the string plus bitmap, AV-2 includes release (§3.3).
  - If it frees only the JS string, release is still worth it on plain HTTP (1.33x per avatar),
    but the plan says so honestly.
  - If it frees nothing measurable, drop release from AV-2 and ship deferral only.

### 2.1 Result (ledger 31)

Measured in headless Chrome 154 over CDP, on the i9. 200 distinct noise PNGs: 535.4 MB of PNG
and 713.9 MB of base64 (the ratio is exactly 4/3). Each mode ran 3 times, and a 5-cycle run
checked for leaks.

| Mode | Shown, renderer working set over baseline | After clear plus `gc()` | JS heap after gc |
|---|---|---|---|
| A: CSS `background-image` (BarIcon) | +1968 MB (2.76x the base64 bytes) | +4.5 MB, **99.8% released** | back to baseline |
| B: `<img src>` (SidebarAvatar) | about +1.3 GB per cycle | the string is freed, but the bitmaps sit in an engine cache: a **bounded** floor, flat at about 2145 MB across cycles 3-5 | back to baseline |

**Decision: AV-2 includes release (§3.3).**
- For BarIcon sites (GridCatalog, MobileCharacters, AlertComp) release frees string and bitmap.
- For SidebarAvatar sites it reliably frees only the string, the 1.33x cost per avatar. Decoded
  `<img>` bitmaps stay in Blink's own bounded cache, which release does not shrink.
- The real fix for bitmap size is smaller images, which is AV-4 (thumbnails).

Caveats:
- Headless may rasterise in software, so a headful run with GPU raster may move memory into
  the GPU process rather than remove it.
- The GPU process was not separable in this run.
- These are best-case desktop figures. The 2.76x overhead ratio, not the absolute size, is
  what carries over to phones.
- Scripts: the session scratchpad `av2-probe/` (`driver.mjs`, `cycles.mjs`).

## 3. Design

### 3.1 One shared helper: `nearViewport`

- New module `src/ts/gui/nearViewport.svelte.ts` exporting a Svelte action,
  `use:nearViewport={{ onChange }}`.
- The action locates its **root**: the nearest ancestor whose computed `overflow-y` is `auto` or
  `scroll`. It falls back to `null` (the viewport) if there is none.
  - This is always an ancestor, so the observer can never be handed a non-ancestor root. Per
    spec, that would never report intersection, and avatars would never load.
  - It **fails open.** If the chosen box does not really scroll (the nested-case uncertainty),
    every item intersects it, and behaviour degrades to today's (all resolve). It never degrades
    to "nothing loads".
  - It is deliberately not `root: null` everywhere. `rootMargin` applies only to the root, and
    a scroll container clips it, so a viewport root would lose the prefetch margin inside every
    list.
- **One IntersectionObserver per (root, margin) pair**, shared by all items, not one per item.
- **Registry lifecycle (gate BLOCKER 1, ledger 30).** Roots come and go: AlertComp mounts a fresh
  `overflow-y-auto` box every time the dialog opens (`AlertComp.svelte:189-191`), and so do the
  GridCatalog tabs. So the registry must not pin detached roots:
  - key it as `WeakMap<Element, Map<margin, Entry>>`, with the viewport (`null` root) held in a
    separate slot;
  - each `Entry` holds the observer and a `Map<target, callback>`;
  - on the action's `destroy`, `unobserve` and delete the target. When an entry's target map
    empties, `disconnect()` it and **delete it**, deleting the root's outer map once that is
    empty too;
  - test it (v9): after a mount/unmount cycle the registry holds no entry for that root, and the
    fake observer saw `disconnect`.
- Margin: resolve when within one root-height of the root (`rootMargin: '100% 0px'`).
- **Test seam:** the observer constructor is read from `globalThis.IntersectionObserver` at use
  time. Tests `vi.stubGlobal` a fake that captures callbacks and targets, then fire hand-built
  entries. No source-text guards.
- **Missing IntersectionObserver** (very old WebViews): treat every target as visible. That is
  today's behaviour, fail open.

### 3.2 Wiring at each site (on top of AV-1's two-level `{@const}`)

- Each item gets a small visibility state, and the inner const becomes
  `{@const avatarStyle = visible ? getCharImage(imgPath, 'css') : ''}`.
  - For Sidebar: `visible ? (imgPath ? getCharImage(imgPath, 'plain') : '/none.webp') : undefined`,
    which is SidebarAvatar's existing no-src state.
  - AV-1's gating is preserved: the inner derived still depends only on `imgPath` and
    `visible`.
- **Per-item state needs a component boundary**, because `{#each}` bodies can't hold `$state`.
  Two options, and the implementer picks the smaller diff:
  - (a) a tiny wrapper, `LazyAvatarSlot.svelte`, owning `visible` and rendering the existing
    BarIcon or SidebarAvatar;
  - (b) a `SvelteSet` of visible ids in the parent, read by each item.
  
  Either way, **DOM order, classes, `data-char-id`, and Sidebar drag-and-drop handlers are
  unchanged.** A wrapper must not add an element between the drag source and its handlers. If
  it would, use (b) for Sidebar.
- Sites:
  - GridCatalog grid, list and trash (`:93`, `:113`, `:138`, post-AV-1 lines);
  - MobileCharacters (`:74`);
  - Sidebar normal avatar, folder background and folder members (`:592`, `:606`, `:731`);
  - AlertComp selectChar (`:385-388`), which also gets AV-1's key and boundary treatment. Its
    each is unkeyed, so check whether keying is safe exactly as Report 12 did for the others.
- `hideAllImages`: off-screen items don't call `getCharImage`, so they don't depend on it until
  they become visible, and then read the current value. Test it.

### 3.3 Release (step 0 says it pays; see §2.1 for what it does and does not free)

- An item that leaves a wider band (`rootMargin: '300% 0px'`, a second shared observer) sets
  `visible = false`. Its derived then returns the placeholder, and the string becomes
  unreferenced.
- The hysteresis between 100% and 300% prevents thrashing at the edge.
- **Cost, stated honestly:** scrolling back re-runs the base64 encode on plain HTTP, since the
  string is not cached. AV-3 (plain-HTTP encode) is where that gets cheaper. AV-2 does not add a
  string cache.
- Branch-specific release is not worth the complexity: re-resolving a short URL is cheap. Release
  is uniform across branches.

## 4. Invariants

- Every item stays mounted. Only the avatar value is deferred. Scroll height, search, click
  targets, `scrollToActiveCharacter` and drag-and-drop are unchanged.
- No save-format, plugin API or data change. `oder.img` and the persisted data are untouched. No
  `blob:` URLs are introduced (that is AV-3's constraint).
- Fail open everywhere: no root, no IntersectionObserver, a non-scrolling root, or an observer
  error all mean the avatar resolves as it does today.
- Animated avatars: the value passed is unchanged when visible, so animation is preserved.

## 5. Tests (red before green; test-warrior)

New file, or an extension of `charlistAvatarLookups.svelte.test.ts` if its mounts can be reused.
Stub IntersectionObserver with a controllable fake. Keep N small, as with AV-1's OOM caution.

| # | Case | Kind |
|---|---|---|
| v1 | Mount N; the fake reports only the first k as intersecting → exactly k getFileSrc calls, per layout (grid, list, trash, simple, Sidebar, AlertComp) | RED |
| v2 | Firing an intersecting entry for item j resolves j, and its `loc=` path renders | RED |
| v3 | (if release) item leaves the far band → its avatar element shows the placeholder; re-entry resolves again | RED |
| v4 | No `IntersectionObserver` global → all N resolve (fail open) | CHAR |
| v5 | Nested MobileCharacters inside GridCatalog: the chosen root is an ancestor of every target | RED (new) |
| v6 | hideAllImages toggled while items are off-screen → on becoming visible they show the placeholder, and toggling back resolves them | CHAR/RED |
| v7 | Sidebar `data-char-id` present on every item before any resolve; DOM order unchanged | CHAR |
| v8 | AV-1's 16 cases still pass (with the fake reporting all visible) | CHAR |
| v9 | Mount and unmount a list 3 times (and open/close AlertComp's selectChar 3 times) → registry is empty afterwards and every fake observer got `disconnect` | RED (new) |
| v10 | Sidebar normal and folder-member items that are not yet visible render SidebarAvatar's no-src branch (`:111-119`); it is live code today only for folders, so assert its size and classes directly | CHAR/RED |

A live check follows, because happy-dom has no layout. On the dev server (documented protocol
only), at desktop and at the mobile preset with the default GUI, record which box scrolls in the
nested case. Confirm avatars load on scroll and that first open resolves only about one
screenful.

### 5.1 Accepted gaps, stated (gate MAJOR 2 and 3, ledger 30)

- **Nested-root choice has no automated layout guard.** happy-dom has no layout, so v5 can only
  check that the chosen root is an ancestor. If a later CSS change makes every item intersect,
  AV-2 silently degrades to AV-1 behaviour (all resolve). That degradation is the designed
  fail-open, and it loses nothing but the saving. **Mitigation:** the action logs once per
  root, in dev builds only, when more than 3 root-heights of targets intersect at mount (a
  cheap signal that the root isn't clipping). The live check in §5 records which box scrolls
  on desktop and at the mobile preset.
- **Tab switches remount.** GridCatalog's `{#if selected === N}` unmounts and remounts a tab, so
  its items start not-visible and get their first observer callback about one frame later.
  Expect a **brief placeholder flash on a tab switch**, not a layout shift (the box size is
  identical). On plain HTTP the re-encode cost is the same as today, because every tab switch
  already re-resolves every avatar today. Accepted, and recorded as an invariant correction:
  "no layout shift" holds, while "no placeholder flash" does not.

### 5.2 Live check result (ledger 38)

Passed. Simple tab 18/151 (desktop) and 17/151 (phone). Far items are released on scroll. List 13/151. The selectChar dialog loads avatars. On the default phone path the inner MobileCharacters box is the one that scrolls. Note: a hidden browser pane runs no IntersectionObserver callbacks, so live checks need the pane visible.

## 6. Gate

- **Plan gate:** `adversarial-reviewer` (UI only, not persistence).
- **Post-implementation gate:** the same.
- Step 0 runs in parallel with the plan gate. Its result decides §3.3 before implementation
  starts.
