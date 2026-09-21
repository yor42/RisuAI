# Report 12 — Character-list avatar work (Phase 2 item 3, part 1): staged plan

**Status:** AV-1 **passed its plan gate on 2026-09-21** (`adversarial-reviewer`, "approve with
required changes", ledger row 20). All required changes are folded into §2 below. AV-2..AV-4 are
not yet planned.
**Scope chosen by the maintainer:** all four stages, A, B, C and D (see §1). The chat-message list
is item 3 part 2 and is **not** in this report.
**Evidence base:** ledger rows 13, 17, 18 and 19. All citations below were re-verified by the
Orchestrator at HEAD `947a42c8`.

To avoid collision with the module-editor "Stage A/B" of Reports 09-11, the stages here are
prefixed **AV-**. The maintainer's letters map as follows: A → **AV-1**, C → **AV-2**,
B → **AV-3**, D → **AV-4**. That is also the implementation order, which is by rising risk.
Each stage has its own plan gate, implementation, and post-implementation gate. **Only AV-1 is
planned in full here and submitted to the gate now.** AV-2..AV-4 are recorded as constraints and
open questions, so their later plans cannot start from a wrong premise.

---

## 1. Problem, as measured

- **Real profiles.** The maintainer has 500+ characters; extreme users have 1000+. Users at 1000+
  consistently report instability and sudden data/asset loss. Most avatars are PNGs under ~10 MB,
  with 10 MB the upper bound. The maintainer ranks the character list as the slowest part of the
  app.
- **Lookup counts** (harness `Agents/Tools/save-gen/charlist-avatar-count.svelte.harness.ts`,
  real components with a spy standing in for `getFileSrc`, N = 1000):

| Layout | Initial mount | Search, all match | Search, 10% match | Rename one visible char | Change one avatar | Chat message |
|---|---|---|---|---|---|---|
| simple (default; `MobileCharacters.svelte`) | 1000 | 0 | 0 | 1000 | 1000 | 0 |
| grid (`GridCatalog.svelte:90-109`) | 1000 | 1000 | 100 | 1000 | 1000 | 0 |
| list (`GridCatalog.svelte:110-131`) | 1000 | 1000 | 100 | 1000 | 1000 | 0 |

  The sidebar and the `selectChar` dialog (`AlertComp.svelte:385-388`) were not in the harness.
  Source says the sidebar re-resolves every avatar on any rename, avatar change, reorder, folder
  edit or `roundIcons` toggle (ledger 18).
- **Per-lookup cost on the plain-HTTP branch** (`globalApi.svelte.ts:285`): ~8.75 ms and a 1.33 MB (4/3)
  base64 string per MB of avatar. Measured on an i9-13900K / RTX 3090 / 64 GB DDR5, so this is a
  best case.
- **Per-lookup cost elsewhere:** Tauri (`asset://`) and service-worker builds do not encode, but
  fetch and decode the full image for a 56 px icon. That cost is **unmeasured**.
- **What is portable:** the counts and the bytes. The milliseconds are best-case only.

**AV-1 removes every redundant repeat lookup** (all non-initial columns above except "change one
avatar", which should fall to 1). It does not change the initial mount; AV-2 does. It does not
change the per-lookup cost; AV-3 and AV-4 do.

- **Platform mix and hardware floor** (maintainer, 2026-09-21):
  - **Most common:** the hosted web app. It is HTTPS, so it takes the service-worker path: no
    re-encode, but a full-size fetch and decode for each icon.
  - **Second:** locally hosted plain HTTP, the base64 path.
  - **Third:** Tauri desktop.
  - **Account sync** is almost unused.
  - **Hardware floor:** Raspberry Pi 3 (1 GB) and mid-range phones.
  - **Consequence:** AV-4 helps the largest group, and AV-3 the second.
  - **Animated avatars exist, though uncommon.** AV-4 must preserve them.
  - **Plugins** add buttons to the top hamburger menu; none is reported to touch the character
    lists.

---

## 2. AV-1 — resolve each avatar once per character (FULL PLAN, submitted to gate)

### 2.1 Mechanism (verified in Svelte 5.55.1 source)

- **The item source changes every render.** Each list builds a fresh object per item on every
  render: `formatChars` (`GridCatalog.svelte:23-53`), `sortChar` (`MobileCharacters.svelte:53-71`),
  and `newCharImages` (`Sidebar.svelte:83-130`).
- **So the source fails its equality check.** Items are `source()` with strict `===`
  (`each.js:664-666` — `source()` at `:666` — runes mode `EACH_ITEM_IMMUTABLE`), and `internal_set(item.v, value)`
  (`each.js:307`) fails `===` for every item.
- **So every avatar lookup re-runs.** Every per-item template effect is invalidated, and the
  inline `getCharImage(...)` call re-runs, creating a new Promise. That restarts the child's
  `{#await}` and calls `getFileSrc` again.
- **Unkeyed lists also shift items.** In grid and list, narrowing a search moves characters to new
  positions. So even an equality-gated item would see a different image string and re-resolve.

### 2.2 Approach

Two changes, applied only at the O(N) call sites:

**(i) An equality boundary on the image path.** Before resolving, read the path into its own
derived value, so that re-evaluating it to an equal string does not invalidate the resolution. The
candidate form, per item:
```svelte
{@const imgPath = char.image}
{@const avatarStyle = getCharImage(imgPath, 'css')}
<BarIcon additionalStyle={avatarStyle} ... />
```
**Settled at the plan gate, empirically.** The reviewer compiled and ran real Svelte 5.55.1
components, and the Orchestrator re-ran the probe (exit 0, 7 tests). In runes mode `{@const}`
lowers to `$.derived` (`compiler/.../visitors/ConstTag.js:16-36`). A derived only marks its
dependents dirty when its value changes (`deriveds.js` `update_derived`, `!derived.equals(value)`),
but it always re-executes its **own** body when it is marked dirty.

Measured calls after replacing 20 items with fresh objects carrying equal image strings:

| Form | Calls |
|---|---|
| inline call | 20 |
| single `{@const style = getStyle(item.image)}` | 20 |
| child component with one `$derived(getStyle(image))` | 20 |
| **two-level `{@const imgPath}` then `{@const style}`** | **0** |
| wrapper with two `$derived` | 0 |

The two-level form re-resolves exactly 1 item on one real image change. Toggling `hideAllImages`
still re-resolves all 20.

**Use the two-level `{@const}` form.** The two-`$derived` wrapper is the fallback. A single-level
derived must NOT be used. It looks equivalent and does not gate: the investigator's claim
(ledger 18) was wrong.

`getCharImage` reads `DBState.db.hideAllImages` (`characters.ts:57-63`) inside the derived, so
toggling that setting still re-resolves. This is preserved automatically and must be tested.

**(ii) Stable keys where filtering reorders items.** Key grid, list and trash by the character's
index in `db.characters` (`char.index`, from `formatChars`). Key the simple layout by `char.i`.
These are unique by construction, so a duplicate `chaId` cannot trigger Svelte's
`each_key_duplicate`. They are stable under filtering and sorting, because they index the source
array, not the filtered position.

**The sidebar is not re-keyed.** Its order only changes on drag or folder edit. Re-keying would
change how its native HTML5 drag-and-drop (`Sidebar.svelte:329-396`) reuses DOM nodes, for no
measured gain. The sidebar gets change (i) only, at `:594`, `:603` and `:756`.

**`AlertComp.svelte:385-388`** iterates `DBState.db.characters` directly. Its items are the live
proxies, whose identity is stable, so no churn is expected. **Measure it in the test; change it
only if it churns.**

### 2.3 Files (expected)

- `src/lib/Others/GridCatalog.svelte`: `:93`, `:96`, `:111`, `:113`, `:134`, `:136`.
- `src/lib/Mobile/MobileCharacters.svelte`: `:74`, `:80`.
- `src/lib/SideBars/Sidebar.svelte`: `:594`, `:603`, `:756`.
- **Possibly a new small wrapper component, only if the `{@const}` form fails.**
- **`BarIcon.svelte` and `SidebarAvatar.svelte` are NOT changed.** Their prop contracts are
  unchanged, so their 15 non-hot-path uses are unaffected.
- **Test:** a new `*.svelte.test.ts` in the `pnpm test` suite, following the mount pattern of
  `src/lib/UI/GUI/guiRendering.test.ts`. Mocks stay in one file, as in the harnesses. Location is
  the implementer's choice, next to the components.
  **Gate requirement (MAJOR):** this test runs in the shared suite, so it MUST:
  - mount **once per layout** and reuse that mount across scenarios, as the harness does
    (`charlist-avatar-count.svelte.harness.ts:467-481`). Fresh 1000-character mounts per scenario
    caused a heap OOM in the harness.
  - keep **N small**, enough to show O(N) against O(1) (e.g. N = 50-200). N = 1000 stays in the
    harness only.
  - report the added suite wall time. The first import of the transitive graph costs ~13-17 s on
    this machine.
- **Harness fix:** the `:683` comment in `charlist-avatar-count.svelte.harness.ts` is wrong. It
  says `sortChar` "never read[s] chats", but it reads `c.chats.length`. Reword it as an
  observation.

### 2.4 Invariants

1. **One lookup per character** on initial mount, as today. AV-1 does not defer anything.
2. **A real image change re-resolves exactly that character.**
3. **Toggling `hideAllImages` re-resolves every mounted avatar**, to the placeholder and back.
4. **Toggling `roundIcons` still restyles every sidebar avatar.** This is a prop, not a
   resolution, so it must not require re-resolution.
5. **No change to**:
   - DOM structure, class names, `data-char-id`, or the drag-and-drop spacer elements;
   - `scrollToActiveCharacter` (`Sidebar.svelte:224-259`);
   - search semantics; sort order; trash filtering;
   - `onclick` targets. `changeChar(char.index)` / `changeChar(char.i)` must still open the right
     character after filtering.
6. **No data, save-format or asset-store change.** This is UI-only.

### 2.5 Tests: red before green, and the count must be cited

The new suite test must **FAIL against current code** before the change. The implementer records
the failing output, then applies the change, then shows it passing. Required cases, at N ≥ 200 to
keep the suite fast; the harness keeps covering 1000:

| Case | Current (observed) | After |
|---|---|---|
| grid: search keystroke that still matches all | N | **0** |
| grid: search narrowing to 10% | 10% of N | **0** |
| list: same two cases | same | **0** |
| simple: rename one character | N | **0** — or **1** if the rename moves the row; state which |
| grid/list/simple: change one character's avatar | N | **1** |
| any layout: toggle `hideAllImages` | — | **N**, and every avatar shows the placeholder |
| sidebar: rename one character | N (source) | **0** |
| sidebar: change one avatar | N (source) | **1** |
| after filtering: click row k → `changeChar` gets the correct `db.characters` index | — | pass |
| `AlertComp` selectChar: rename one character | measure | report |
| grid/list: delete a character (splice `db.characters`) while open | — | every remaining tile shows **its own** avatar (no stale image in a reused key) — gate MINOR 4 |

The implementer should also re-run the harness at N = 1000 and put the before/after table in the
post-implementation gate packet.

### 2.6 Compatibility

- **Upstream characters, modules, presets, backups:** untouched.
- **Plugins:** the v3 `SafeDocument` exposes the real DOM. AV-1 changes no element, attribute or
  class. Keyed `{#each}` reuses the same markup, although DOM node identity may be preserved
  differently on reorder. **Reviewer: challenge whether any known plugin or theme depends on
  node identity or order in these lists.** None was found (ledger 18, Q6).

### 2.7 Risks

- **R1.** The equality boundary may not gate, which is the disputed claim. Mitigation: the test
  proves it, and the wrapper-component fallback exists.
- **R2.** A keyed `{#each}` could alter transition or focus behaviour in grid/list. None is
  present (no transitions on these rows); verify.
- **R3.** Stale clicks after re-keying, if a key and a click index diverge. Covered by the
  click-after-filter test.
- **R4.** AV-1 could look like a fix while the initial-mount cost remains. That is expected and
  stated; AV-2 addresses it.

---

## 3. AV-2 — lazy avatar resolution (constraints; plan after AV-1 lands)

- **Real plugins checked (2026-09-21):** AssetGod v3_alt and fast-character-import v3, both
  maintainer-provided and gitignored. They add menu entries via `risuai.registerButton`, not by DOM
  injection. Their DOM queries target only their own `#ag-*` / `.ag-*` / `[data-act]` elements,
  so neither depends on list or sidebar DOM. (`grep` of both bundles for host-DOM selectors
  outside their own prefixes found none.)
- **Resolve avatars, not items.** Keep every item element mounted, including
  `SidebarAvatar`'s `data-char-id` (`SidebarAvatar.svelte:44`), and defer only the `getCharImage`
  call until the item nears the viewport. That keeps `scrollToActiveCharacter` (`:251`) and
  drag-and-drop working unchanged.
- **Use a per-item IntersectionObserver** with the real scroll root, not fixed-height windowing.
  Heights are non-uniform in list/trash and open folders. The scroll roots are
  `GridCatalog.svelte:57`, `MobileCharacters.svelte:73` (nested inside `:57` when reached from the
  grid page), and `Sidebar.svelte:542`.
- **`LazyPortal.svelte` has zero users and is one-shot**, so it defers cost but does not bound
  it. Do not adopt it unexamined.
- **Bound memory, don't just defer.** Decide whether an avatar scrolled far away releases its
  resolved string. On plain HTTP that is ~1.33 MB per MB of avatar, per character.
- **Preserve `SidebarAvatar`'s three visual states:** pending, no-image with color fallback, and
  resolved (ledger 18, Q7).
- **Open question for the maintainer:** which plugins or themes touch the sidebar or lists.

## 4. AV-3 — plain-HTTP encode (constraints; plan after AV-2)

- **Scope:** only the branch `!isTauri && !isAccount && !usingSw` (`globalApi.svelte.ts:242-286`).
  Never make the account branch more aggressive.
- **Candidates:** (a) cache the encoded string with a **byte** budget, not the current count
  budget; (b) return `blob:` URLs. **Do not revoke `blob:` URLs on LRU eviction.**
  `{#await}`-bound `<img>` elements hold the string, the 200-entry cap is smaller than a real list,
  and `blobUrlCache` is never revoked, as precedent.
- **Required alongside `blob:` URLs:**
  - Add `blob:` to the three clipboard allow-lists (`Chat.svelte:673,713,765`), which otherwise
    silently drop images.
  - **Keep `blob:` URLs out of the persisted `oder.img`** (`Sidebar.svelte:658`; read by
    `backuplocal.ts:270-273`).
- **Side finding:** on plain HTTP, every folder image is persisted in the save as a full base64
  `data:` URL today.
- **Do not fix in AV-3, but do not break:** the systemic `image/png` MIME label, which also covers
  video and audio assets.
- **Gate:** `opus-reviewer`, because this is asset caching.

## 5. AV-4 — thumbnails (constraints; measure first)

- **Measure first:** on Tauri and the service-worker path, measure the full-size decode cost for
  a 56 px icon before committing to AV-4.
- **Precedent:** canvas `drawImage` → `toDataURL`, proven in production at
  `BotSettings.svelte:805-818`. Avoid `OffscreenCanvas`/`createImageBitmap(resize)`, whose webview
  support is unverified.
- **Storage invisible to backup, export, cleanup and sync:**
  - web: a separate `localforage.createInstance`, like `inlayStorage` (`inlays.ts:30`);
  - Tauri: an AppData subdir outside `assets`/`remotes`;
  - **account branch: a local-only cache, never the hub.**
- **Key:** `char.image` is content-hashed (`saveAsset` → `hasher`), so a path-keyed thumbnail
  cannot go stale.
- **Open question for the maintainer:** are avatars ever animated (GIF, APNG, animated WebP)? A
  thumbnail freezes them, and they would need to be detected and skipped.
- **Gate:** `opus-reviewer`.

---

## 6. Gate instructions for AV-1

Reviewer tier is `adversarial-reviewer` (Sonnet 5). AV-1 is UI-only, with no persistence, save
format or asset caching, so AGENTS.md §4 does not require `opus-reviewer`. Try to falsify:

- the §2.2 mechanism, from the Svelte 5.55.1 source;
- the key choices;
- the invariants;
- the test table, especially whether each "Current" figure really fails today;
- the compatibility claim.

Also check this plan's own citations and arithmetic. Brief errors have shipped before.
