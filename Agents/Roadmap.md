# Fix &amp; Expansion Roadmap

Derived from [`Summary.md`](Summary.md) and the four reports in [`Reports/`](Reports/), each cross-validated by an independent Codex adversarial-review pass (see [`CodexReviews/`](CodexReviews/)). Nothing in this roadmap has been implemented — it is a sequencing plan for future work. Each item cites its source report for full detail before implementation begins. This revision incorporates the corrections from cross-validation (updated retry/failure semantics, a new Module-create duplicate-insertion fix, corrected Windows-on-ARM control flow, and severity nuances for the asset-corruption GC-omission finding).

Ordering principle: **fix data-loss and correctness first (cheap, high-trust-impact), then the shared architectural root cause (expensive, unlocks everything downstream), then platform breadth.** Android is deliberately the last phase, gated behind Phase 2.

---

## Phase 0 — Quick, low-risk fixes (ship independently, any order, no architectural risk)

These are all small, localized, high-confidence fixes identified across the reports. None depend on each other. Good first-PR candidates.

| Fix | File(s) | Report | Effort |
|---|---|---|---|
| Exclude already-resolved `/sw/img/` sources from `checkImg()`'s re-scan selector | `src/lib/ChatScreens/ChatBody.svelte:185` | 03 | Low |
| Add a distance ceiling to `checkImg()`'s fuzzy fallback (mirror `parser.svelte.ts:619`) | `ChatBody.svelte:226-237` | 03 | Low |
| Reject empty/null bodies in the service-worker register path (stop zero-byte cache poisoning) | `globalApi.svelte.ts:151-155`, `public/sw.js:111-133` | 03 | Low |
| Await `stream.close()` in `OpfsStorage.setItem` (closes a real gap where an async close rejection is silently dropped; currently unreachable via the flag gate) | `src/ts/storage/opfsStorage.ts:12-14` | 02 | Low |
| Give the autosave loop an actual retry path: don't clear `changeTracker`/`changed` until write succeeds; re-arm on failure | `src/ts/globalApi.svelte.ts:409-485` | 02 | Low |
| Surface write failures to the user on first failure, not only once alerts begin at the 5th accumulated failure | `globalApi.svelte.ts:474-482` | 02 | Low |
| Delete orphaned 2024 Capacitor-era assets (`resources/icon-*.png`, `splash*.png`, `capacitor.config.ts`) | `resources/`, repo root | 04 | Low |
| Fix `install_python`'s OS/arch gating (Windows-amd64-only today; on Linux/macOS the failure isn't silent — the frontend proceeds into steps that assume Windows-specific files and can error/panic) and make the frontend actually respect a failed install | `src-tauri/src/main.rs:230-246, 299, 385, 408`, `src/ts/process/models/local.ts:22-54` | 04 | Low |
| **[new, from cross-validation]** Fix the Module "Create" flow's duplicate-insertion bug: `tempModule` gets pushed onto `DBState.db.modules` twice | `src/lib/Setting/Pages/Module/ModuleSettings.svelte:157, 182` | 01 | Low |

**Recommended first PR:** the two `checkImg()` fixes together (asset-corruption items 1-2) — single file, single function, eliminates the most severe corruption mechanism found.

---

## Phase 1 — Persistence & asset-integrity hardening (correctness, no architecture change)

Builds on Phase 0's fixes; addresses the remaining, slightly-larger-effort correctness gaps before touching the shared RAM architecture in Phase 2.

1. **Complete the `getUncleanablesSync` allowlist** — add `gptSoVitsConfig.ref_audio_data.assetId` and `NAIImgConfig.*`/`wavespeedImage.reference_image` (`globalApi.svelte.ts:933-1027`). **Note (corrected):** the GPT-SoVITS field is the genuinely urgent one — its deletion is real functional data loss since TTS reads it back directly with no fallback. NAI/Wavespeed fields are lower urgency, since both retain a separate base64 copy used by generation, so their omission mainly risks a stale cached preview, not a broken feature. Do not add `reference_image_multiple` — cross-validation found no current code path that populates it via `saveAsset`. *(Report 03, item 3 — Medium effort.)* Consider a follow-up to derive this list from a schema/registry instead of manual enumeration, since it has already drifted once.
2. **Add basic storage-quota awareness** — check `navigator.storage.estimate()` before large writes, explicitly catch `QuotaExceededError` with an actionable message instead of the generic alert path. *(Report 02, item 4 — Medium effort.)*
3. **Prune `database/dbbackup-*.bin` more aggressively** on web, or make the per-save-cycle backup opt-in — every autosave currently writes a full extra backup copy, accelerating quota exhaustion. *(Report 02, item 5 — Medium effort.)*
4. **Add a lock between `loadDrive()`'s restore write and the running autosave loop** to close the identified race window. *(Report 02, item 6 — Medium effort.)*
5. **Decide OPFS's fate deliberately** — either wire up a real settings path to enable it (now that its atomicity bug is fixed in Phase 0) so web gets its better durability story, or remove the dead code path. Update `AGENTS.md`'s storage description to match whichever is chosen. *(Report 02, item 8.)*
6. **Add a lightweight cache-freshness signal** for service-worker asset entries (content hash or source marker) so drift between cache and source-of-truth can be cheaply detected without a full byte-for-byte fetch — a first-party, cheaper version of the community plugin's `verify()`. *(Report 03, item 5 — Medium effort.)*
7. **Surface an explicit "asset integrity" feature in-app** (settings/debug action running the equivalent of the plugin's scan/verify/fingerprint), wired to the already-existing but inert `checkCorruption` flag (`database.svelte.ts:610`/`1151`). This is the first-party replacement for the community plugin and should ship once items 1 and 6 above land, since it depends on both a correct GC allowlist and a freshness signal to report anything meaningful. *(Report 03, item 7 — Medium effort.)*

---

## Phase 2 — RAM/architecture rework (the shared root cause; highest leverage, highest effort)

This phase is the load-bearing one: it's what Phase 4 (Android) is gated behind, and it's the most consequential thing found in any of the four investigations. Sequence sub-items by risk — start with the isolated component-level fix, end with the DB-wide architectural change.

1. **Give the Module editor a real local draft copy** instead of binding directly to live `DBState` state; commit to `DBState.db.modules[i]` only on explicit save or a genuine debounce. Removes the two per-keystroke full-`modules`-array deep clones directly. Self-contained, low-risk relative to the rest of this phase — good phase-2 starting point. *(Report 01, recommendation 1 — Medium effort.)*
2. **Narrow the `saveDb()` change-tracking effects** (`globalApi.svelte.ts:350-403`) so they stop `$state.snapshot()`-ing broad subtrees just to detect "something changed." Replace deep-clone-based dirty detection with explicit dirty-marking at actual mutation call sites, or watch only shallow identity/length/timestamp signals. **Note (corrected):** this specific effect already excludes `modules`/`botPresets`/`loadouts`/`plugins`/`pluginCustomStorage` — it's the hot path for *character-field and chat-message* edits specifically, item 1 above is the hot path for module edits. Both need fixing; they're independent, not the same effect. *(Report 01, recommendation 2 — Medium-High effort.)*
3. **Add real virtual scrolling to the chat message list** (`DefaultChatScreen.svelte`), keeping the existing incremental-load-on-scroll-up behavior for fetching history but unmounting off-screen messages so peak DOM/component count is bounded. This is the most Android-relevant fix in the whole roadmap. *(Report 01, recommendation 4 — Medium-High effort.)*
4. **Extend cold storage to size-based (not just idle-time-based) compaction**, so very long *active* chats also get relief, reducing the size of whatever remains to be cloned/stringified by items 1-2. **Note (corrected):** cold storage already offloads old, stale chats belonging to an active character today — this item specifically targets the gap that remains: a chat that's long but still *recent* (not idle 10+ days), which today gets no relief regardless of size. *(Report 01, recommendation 5 — Low-Medium effort.)*
5. **(Architectural, largest item — stage last, after 1-4 prove the pattern) Split `DBState.db.characters` into per-character reactive slices** so only the active character is a "hot" proxy and editing one character cannot force reactivity traversal touching others. Large surface area — every read/write site of `DBState.db.characters[i]` across `src/ts` and `src/lib` — should be scoped deliberately and probably split into its own sub-project once items 1-4 are proven. *(Report 01, recommendation 3 — High effort.)*

**Exit criterion for this phase** (relevant to Phase 4/Android gating): a long chat session with a large module set no longer shows the reported keystroke stutter, and peak memory for an active long conversation is bounded rather than growing monotonically with scroll-back depth.

---

## Phase 3 — ARM desktop platform expansion (independent of Phase 2; can run in parallel with Phase 1/2)

Desktop ARM targets are **not** gated behind the RAM work — they're a CI/packaging problem, not a low-RAM-device problem. Can be scheduled independently.

1. **ARM Linux (`aarch64-unknown-linux-gnu`)**: add to CI matrix (`.github/workflows/github-actions-builder.yml`) via a native `ubuntu-24.04-arm` runner or the QEMU/buildx pattern already proven for the server Docker image. No `Cargo.toml`/`tauri.conf.json` changes expected to be necessary. *(Report 04 — Medium-low effort, depends on Phase 0's `install_python` fix for local-LLM parity but not for the build itself.)*
2. **Windows on ARM (`aarch64-pc-windows-msvc`)**: add a `win-arm64` branch to `install_python`'s URL selection (verify CPython's official win-arm64 embeddable build availability for the pinned version first); verify `llama-cpp-python` wheel availability for that target (spike/investigation task); add CI matrix entry once a suitable runner is available. **Note (corrected):** without this fix, Windows-on-ARM does *not* silently skip local-LLM support the way Linux/macOS do — `std::env::consts::OS` reports `"windows"` regardless of CPU architecture, so an unfixed ARM64 build will actually attempt to run the amd64 interpreter (behavior under x64 emulation is unverified), which could surface as a confusing partial-failure rather than a clean absence of the feature. *(Report 04 — Medium effort.)*

---

## Phase 4 — Android (explicitly gated behind Phase 2)

**Do not begin implementation work in this phase until Phase 2's exit criterion is met.** Cross-compiling the current architecture to Android as-is causes OOM crashes on low-RAM devices — this is a hard prerequisite, not a preference.

Once Phase 2 has landed:

1. Run `tauri android init` — expected (per Tauri's documented tooling behavior, not yet independently verifiable from this repo since `gen/android` doesn't exist) to automatically pick up the already-staged icons at `src-tauri/icons/android/mipmap-*/` (15 files; Phase 0's cleanup already removed the confusing orphaned Capacitor set, so there's no ambiguity left by this point) — verify this actually happens as the first concrete step of this phase, rather than assuming it.
2. Write the `lib.rs` this project doesn't yet have, and reconcile it with the current (substantial) `main.rs` and the commented-out `[lib]` section in `Cargo.toml` (`name = "alib"`). **Note (corrected):** `mainx.txt` is confirmed to match Tauri's mobile-template shape and was introduced alongside that `[lib]` block in the Tauri V2 migration commit, but it is not a "mostly-ready" scaffold — there is no `lib.rs` today, so this is closer to new work than to finishing an existing attempt.
3. Decide a replacement/removal strategy for the plugins currently `cfg`'d out or excluded on Android: `tauri-plugin-single-instance`, `tauri-plugin-updater` (both excluded), `tauri-plugin-deep-link` (needs Android's App Links wiring — Tauri 2 supports this, just not enabled here yet, and it's load-bearing for the existing OAuth login flow).
4. Author an Android/mobile `capabilities/*.json` file (none exists today — `desktop.json` explicitly lists only `["macOS", "windows", "linux"]`).
5. Make an explicit product decision to **disable, not silently break**, the `src-python`/llama.cpp local-inference feature on Android — there is no realistic path to on-device GGUF inference without a substantial from-source NDK cross-compile of `llama-cpp-python`, which is out of scope unless separately justified.
6. Leverage existing `src/lib/Mobile/` components and the storage layer's existing "Mobile" adapter concept as a starting point for the Android UI/storage story — noted as promising but unverified for Tauri-Android-readiness as-is; needs its own validation pass once this phase actually starts.

---

## Sequencing Summary

```
Phase 0 (quick fixes, any order) ──┬──> Phase 1 (persistence/integrity hardening)
                                    │
                                    └──> Phase 3 (ARM Linux / Windows ARM CI) — independent, parallelizable

Phase 1 ──> Phase 2 (RAM/architecture rework) ──> Phase 4 (Android)
```

Phase 3 (desktop ARM) has no dependency on Phase 2 and can proceed in parallel with Phases 1-2 if resourced separately. Phase 4 (Android) must not start before Phase 2's exit criterion is met — this is the one hard ordering constraint in this roadmap.
