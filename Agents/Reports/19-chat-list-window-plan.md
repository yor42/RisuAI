# Chat list plan: bound the message window, then decide on full virtual scrolling

**Status:** rev 7, 2026-09-23.
- Gate 1 on rev 6, Stage A: **APPROVE-WITH-FINDINGS**. All findings are folded in (§7); the
  Orchestrator verified M1 in source.
- Stage A implemented; Gate 2: **APPROVE-WITH-FINDINGS**, findings fixed red-first (§7).
- Stage A live check: **passed** (§7).
- Next: the commit, when the maintainer asks.

Earlier history:
- Gate 1 rejected revs 1-5, each time finding a new edit-loss path or a false premise (§7).
- The Orchestrator then escalated to `senior-advisor`. The triggers were several materially
  different designs failing, and a loop. The maintainer asked for the escalation and approved its
  recommended order.
- Rev 6 replaces the auto-shrink designs with **A-lite**: reset the window on a switch only when
  no message editor is open. Edit safety moves to a later **durable drafts** stage.

**Scope.** This is Roadmap Phase 2 item 3, the chat-list half. The maintainer reports four
slowdowns in long chats: opening a long chat, sluggishness after scrolling far back, lag while
streaming, and typing lag. Module toggling is also slow, which is CHORE-04. The plan fixes the
measured mechanisms in stages, cheapest first. It decides on full virtual scrolling (unmounting
off-screen messages) only after the cheap stages are measured. Character lists and the sidebar
are separate Roadmap items.

## 1. Measurements (live app, 2026-09-22)

The setup was the dev build in the Chromium pane on an i9-13900K. That is a best case, so no Pi or
phone claim is made. Timings used `flushSync`. The test data was a temporary character with one
chat of 3000 messages of about 1 KB each; it was deleted afterwards, and the deletion was verified
after a reload.

| Action | Fresh window (30 mounted) | After scrolling back (600 mounted) |
|---|---|---|
| Streamed chunk (`message.data` append) | 6-11 ms median | **124 ms** median (max 192) |
| Keystroke in the chat input | 3 ms median | **37 ms** median (max 187) |
| `ReloadGUIPointer` bump (what a module toggle fires) | 19-30 ms | **295-429 ms** |
| Selecting the character | 330-622 ms | **4.9 s** |
| Switching away to a small character | 52-60 ms | 682 ms |
| DOM elements / JS heap | ~1,400 | 21,642 / +62 MB |

- Each scroll-up step (+15 messages) cost 24-113 ms early on, and 104-204 ms at 400-600 mounted.
- Selecting the character, at a fresh window of 30, took 19-46 ms at 300 messages, 141-199 ms at
  1000 and 358-445 ms at 3000. So about 0.12-0.15 ms per message of total chat length.
- `$state.snapshot` of all 3000 messages takes 44 ms. **What the rest of the selection cost is has
  not been measured** (§2.6).

## 2. Mechanisms

The sources were two investigator packets and Gate 1. **[verified]** means checked in source by
the Orchestrator or by the gate.

1. **The window only grows [verified].**
   - `loadPages` is a `$state` local to `DefaultChatScreen.svelte`. It starts at 30 and grows by
     15 per scroll-up near the top. `scrollToMessage`, the bookmark jump and the fold "load more"
     raise it too.
   - It is reduced by the screenshot reset. The fold's "load more" also moves the range: it clears the
     fold and re-anchors the range at the end, which can drop the previous range.
   - `DefaultChatScreen` is not keyed by character or chat, so `loadPages` survives character and
     chat switches while the chat screen stays mounted. That is the desktop case: the 4.9 s row
     above.
   - `ChatScreen` unmounts, resetting it, when settings or the grid open, on a theme change, and on
     MobileGUI whenever the chat screen is left (`MobileBody.svelte`).
2. **A failed screenshot leaves the window at `Infinity`** while the chat screen stays mounted.
   `screenShot()` resets `loadPages` only as the last statement in its `try`.
3. **Streaming under `'off'` (the default) remounts the streaming message on every write
   [verified].**
   - `Chats.svelte` `updateChatBody` keys each mounted message by a hash that includes its text
     under `'off'`, so each write of `message.data` takes the `mount()` branch: unmount the old
     `Chat`/`ChatBody` and mount a new one, re-parsing the markdown.
   - Under `'off'` the writes are **not** frame-coalesced. The `requestAnimationFrame` path is
     taken only for `'balanced'` or `'strong'` (`coalesceStreamingDisplay`). `'off'` writes once
     per `reader.read()` chunk, after a `processScriptFull` pass, and also bumps `reloadKeys`. So
     several remounts per frame are possible.
   - The same effect re-hashes every mounted message's text. It also calls `checkIfAtBottom()` on
     every run, whose `getBoundingClientRect` forces a synchronous layout of the whole column.
   - **How the 124 ms at 600 mounted splits between remounting, re-hashing, forced layout and
     script processing has not been measured.** Stage B measures it first.
4. **`ReloadGUIPointer` re-renders every mounted message [verified].** Every mounted `Chat`
   subscribes to it and re-runs `updateDisplayedMessage()`, and it is also part of the `{#key}`
   around `ChatBody`, so the body re-renders too. It is bumped by a module toggle, GUI reload,
   triggers, Lua, regex and script edits, and chat rename or delete. The cost is O(window).
5. **Typing is probably layout (plausible; not yet measured).**
   - `messageInput` is component-local, and nothing in the chat reads it.
   - `updateInputSize()` writes `style.height = "0"` and then reads `scrollHeight`, which forces a
     synchronous layout of the `.default-chat-screen` flex column holding every mounted message.
   - **Refuted if:** a keystroke with the resize disabled is still O(window). A flex-item textarea
     is not a relayout boundary, so the next frame's layout could cost the same without any forced
     sync.
6. **Selecting a character rebuilds the save tracker's per-message effects [verified as a
   mechanism; its cost share is unmeasured].**
   - CHORE-01 Stage 2's 6b-char effect tears down and rebuilds one child per chat, and one
     grandchild per message, for every chat of the character, on every selection.
   - Gate 1 points out that this may be a minor share: snapshots are about 0.015 ms per message,
     Svelte traversal about 0.065 µs per effect, and `markChanged` only re-arms a timer. Ledger row
     77 also found the chat view, not the tracker, dominated a chatPage switch.
   - **Stage D therefore starts with a profile, and proceeds only if the tracker share justifies
     touching a save tracker.**

## 3. Direction (senior-advisor escalation, 2026-09-22; the maintainer approved the order)

- **Edit safety.** Revs 1-5 failed because they made the window policy (or the renderer)
  responsible for edit safety. The unmount surface is spread over at least six sites in four
  components: the `Chats` diff, the greeting gate, fold, `Chats`' `onDestroy`, `ChatScreen`
  unmounting, and a `ReloadChatPointer` bump. A guard placed in the policy can cover only the sites
  it knows about.
  - **Edit safety belongs to the draft store**, not to the window policy.
  - Until that exists, **the window is never reduced while a message editor is open**. That is the
    whole of Stage A.
- **Two independent levers:**
  - bounding N, for the O(window) JavaScript: mount on reopen, unmount plus fan-out on switch,
    parse on a pointer bump;
  - **containment**, for work that is O(window) only through layout and style: `checkIfAtBottom()`
    on every `Chats` run, and the textarea write-then-read.
- **Order (approved):**
  1. Stage A (below).
  2. The containment experiment.
  3. Durable drafts, with their own plan and gate.
  4. A2, the shrink on a return to the bottom.
  5. B and D, measure-first.
  6. E, only if still needed.

**Facts the escalation added (Orchestrator-verified):**
- `changeChatTo` bumps `ReloadGUIPointer` synchronously (`globalApi.svelte.ts`). So every **chat**
  switch re-parses and re-keys every old mounted message just before `Chats` unmounts them. Chat
  switches come from the chat list, branch, import, and the "branched from" link;
  `SideChatList.svelte` bumps it a second time.
  - **Character** switches (`changeChar`, then `selectedCharID.set`) do not bump it. So it is
    **not** part of §1's 682 ms "switching away to a small character" row (Gate 1 on rev 6, M1).
- The per-write `reloadKeys += 1` under `'off'` has no UI reader in `src` (only its type), so there
  is no UI fan-out from it.
- Every message editor already registers a draft with `localDrafts.ts`: `Chat.svelte`'s main and
  translation editors, which also covers the greeting (it is a `Chat` too), and
  `PartialEditController`.
  - A `Chat` registers on the editor flag alone, so an editor opened with unchanged text still
    registers.
  - The composer and the HypaV3 modal register too.

### Stage A (A-lite): reset the window on a switch only when no message editor is open

1. **Draft kinds.** `localDrafts.ts` gains a kind per registration (`'message'` | `'composer'` |
   `'other'`) and `hasMessageEditorDrafts()`.
   - The composer registers as `'composer'` and HypaV3 as `'other'`.
   - **The default kind is `'message'`**, so any registration a later change forgets to classify
     blocks the reset. It errs towards today's behaviour, never towards loss.
   - `hasLocalDrafts()` keeps its current meaning (every kind) for the multi-tab gate, unchanged.
2. **Reset on a chat-identity change.** A `$effect.pre` in `DefaultChatScreen`, keyed on a string
   chat key: the character's `chaId`, plus the chat's `id` or, when `id` is missing, the chat
   object's identity.
   - When the key changes and `hasMessageEditorDrafts()` is false, it sets `loadPages` to the
     configured initial value.
   - When an editor is open, it does nothing, which is exactly today's behaviour (copy and branch
     survival included).
   - It depends only on the key string. For a chat with an `id`, replacing the object (V3
     `setCharacterToIndex`, a cold character restore) never resets. For an id-less chat the key
     falls back to object identity, so a replacement does reset. That is gated, so nothing is
     lost; the view only jumps. It is rare, because ids are backfilled at boot and on import.
   - **Implementation notes:**
     - derive the key from the same `currentCharacter` and `chatPage` expressions that feed
       `currentChat`, so the key and the messages can't diverge;
     - wrap the `loadPages` and initial-value reads in `untrack`;
     - update the last-seen key even when the reset is skipped.
   - **Ordering:** in Svelte 5.55.1 a parent `$effect.pre` (`RENDER_EFFECT | USER_EFFECT`) runs
     during the batch traversal, before any `$effect` (deferred), so the reset lands before
     `Chats`' `$effect` renders the new chat in the same flush.
3. **Scroll to the bottom after a reset that actually lowered `loadPages`.** A no-op reset (30 to
   30) does not scroll, so behaviour is otherwise unchanged. Implementation:
   - Set `chatBody.parentElement.scrollTop = 0`, which is the bottom in `flex-col-reverse`.
     Do it synchronously, right after `updateChatBody`, in `Chats`' effect.
   - Don't use the existing `scrollToLatestMessage`. Its `scrollIntoView({block:'start'})` hides the
     end of a tall newest message and the composer, drifts once the async `ChatBody` parse settles,
     and scrolls ancestors (Gate 1 on rev 6, M2).
   - Signal it with a reset token. A freshly mounted `Chats` starts from the current token, so it
     never replays a stale scroll.
   - After a cold-storage switch the old `Chats` is destroyed and the scroller already clamps to
     0, so no scroll is needed.
4. **Screenshot.** `runWithFullWindow(set, restore, fn)`.
   - The restore in `finally` returns `loadPages` to its **pre-screenshot value**, not the initial
     count, and only when `hasMessageEditorDrafts()` is false.
   - With an editor open, the restore becomes **pending**. It is applied when the last message
     draft unregisters, or at the next reset, whichever comes first. So the full window doesn't
     survive across switches while editors stay open (Gate 1 on rev 6, minor 1).
   - Resets are suppressed while a screenshot runs. If the chat key changed during the screenshot,
     the restore goes to the **initial** value (still gated), not the old chat's pre-screenshot
     value.

**Expected:** the 4.9 s reopen and the cross-chat carry-over disappear whenever no editor is open.
Unchanged:
- the cost while scrolled back within one chat;
- the 682 ms character switch-away (the cost of unmounting the old window);
- `alwaysScrollToNewMessage` flows.

**Tests** (red evidence is mutants, since the modules don't exist yet):
- **Draft kinds:**
  - classified and unclassified registrations;
  - the composer and HypaV3 don't block;
  - `hasLocalDrafts()` is unchanged.
  - Mutants: default kind `'other'`. For call-site classification, export named kind constants or
    wrappers and test those; composer counted as `'message'` is a mutant of those. It fails safe
    either way.
- **The window policy module** (next to `chatLoadPages.ts`):
  - the chat key: missing `id`, two id-less chats, deleting a chat at the same index;
  - reset only on a key change;
  - no reset while an editor is open.
  - Mutants: keying on the object; ignoring the editor gate.
- **`runWithFullWindow`:**
  - it restores the pre-screenshot value on success and on a throw;
  - it skips the restore while an editor is open.
  - The pending restore applies when the last draft unregisters.
  - A key change during the screenshot restores to the initial value.
  - Mutants: restore to the initial count; restore outside `finally`; restore ignoring the gate.
- **Live:**
  - With no editor open: the number of **new-chat messages mounted during the switch's flush**
    equals the initial count, and the view lands at the bottom. (The simultaneous peak is the old
    window plus the new one, because `updateChatBody` mounts before it unmounts.) Also: a tall
    newest message stays anchored at its end, with the composer visible, including on a
    mobile-width viewport.
  - With each editor open (main, translation, partial, greeting translation): a switch behaves
    exactly as today, including copy and branch survival.
  - A screenshot, with and without an open editor.
  - Repeat §1's reopen row.

### The containment experiment (next, measure-first)

1. Profile one streaming write and one keystroke at 600 mounted in the Performance panel, to
   separate scripting from style, layout and paint.
2. Time a keystroke with `updateInputSizeAll()` stubbed out in a scratch build.
3. In devtools only, try `content-visibility: auto` plus an intrinsic-size estimate on the
   `.chat-message-container` element that `Chats` creates, then re-run the streaming and keystroke
   rows.
4. Check, in order:
   - `scrollToMessage` to an off-screen index;
   - the screenshot `toCanvas` over `.risu-chat`;
   - scroll anchoring while scrolling up in `flex-col-reverse`;
   - WebKit on Tauri.

Any failure decides whether the rule is unconditional or switched off during screenshots and seeks.
The rule goes on the container `Chats` creates, never inside `Chat.svelte`'s markup. Plan and gate
it after the measurement.

**Also measure:** a **chat-to-chat** switch at 600 mounted, as a new baseline, and the same with the
`ReloadGUIPointer` bump in `changeChatTo` temporarily removed. If the bump is a large share, deferring
it until after the switch has flushed is a separate cheap fix. The 682 ms character switch never
runs the bump.

### Durable drafts (foundational; own plan and gate)

- Draft **content** moves into `localDrafts.ts`, keyed by message identity: the chat key, index,
  `message.chatId`, and the base `data`. The translation editor adds its cache key. The partial
  editor adds what its `handleSave` needs.
- Editors mirror their text while open, and rehydrate on mount **only on an exact identity match**.
  That is the same exact-text rule as Stage B's, so a stale draft can never overwrite newer data.
  Mismatches are pruned. Drafts are cleared only on deliberate exits: save, the long-press discard,
  the translation save, and the partial close. Unmount never clears a draft.
- This also fixes edit loss that exists today, e.g. opening settings while editing, or a
  `ReloadChatPointer` bump.
- **Open maintainer decision:** a leftover draft could defer the multi-tab auto-reload until
  pruned. It needs a cap and a prune rule. The maintainer chose to decide this when the plan is
  written.
- Once this lands, A2, the screenshot restore gate, and every "open editor" hazard on Stage E's
  list stop being hazards.

### A2, B, D, E (after the above)

- **A2, the shrink on a user return to the bottom.** It becomes safe once durable drafts exist.
  Rev 5's findings still apply to its scrolling behaviour: R1, removing visible messages when an
  extension lifts, is moot without an extension, but the target must keep every visible message;
  and R2, stalls.
- **B, streaming.** Measure-first, with the decision rule and pinned constraints from rev 3:
  - exact-text reuse;
  - equivalence covers the final render, translation state and display scripts during streaming.

  `'balanced'` already avoids the per-chunk remount by design. Whether the default should stay
  `'off'` is a product question for the maintainer, alongside any engineering fix.
- **D, the tracker's selection cost.** Profile first. Proceed only if it is at least 25% of the
  selection time. Pinned:
  - a singleton last chunk plus head-aligned chunks;
  - exact tiling;
  - an injectable K;
  - boundary mutations;
  - mutant-red.
- **E, full virtual scrolling.** Not before durable drafts exist. The hazard list from rev 3
  stands.

## 4. Compatibility

- **Stage A:** it changes only how many messages are mounted after a switch, and only when no
  message editor is open. Nothing is persisted, and neither the save format nor the plugin API
  changes.
- **Draft kinds:** in-memory only.

## 5. Staging and gates

1. Gate 1 on rev 6, Stage A.
2. Mutant-red tests, then the implementation.
3. Gate 2.
4. Live check.
5. Commit when the maintainer asks.
6. The containment measurement, then its own plan and gate.
7. The durable-drafts plan and gate.

## 6. Out of scope

- Character lists and the sidebar (separate Roadmap items).
- ~~The unexplained failed deletion of the temporary character~~ **Explained** (live check,
  2026-09-23). It was the test harness, not the app: a bare `db.characters.splice` does not set
  `requiresFullEncoderReload`, so the saver keeps the removed character's block and the character
  comes back on reload. Reproduced twice (6 s and 20 s before reload). The app's `removeChar` sets
  the flag, and deleting through it persisted. Harnesses must delete through `removeChar`.

## 7. Gate record

### Gate 1 — opus-reviewer (fresh), 2026-09-22 — [REJECT] (rev 1)

Held (verified by the reviewer):
- the single `loadPages` reduction, and the screenshot `catch` not resetting it;
- the streaming remount under `'off'`, and the hash-diff unmount of messages outside a shrunk
  window;
- `ReloadGUIPointer` subscription plus the `{#key}`;
- the full 6b-char rebuild on every selection;
- the `updateInputSize` write-then-read.

The partition argument for chunking holds if the chunks tile exactly. Rejecting active-chat-only
children is correct.

**MAJOR (all folded into rev 2):**
- **M1:** the A2 edit guard missed `editTranslationMode` and `PartialEditController`. "Commit on
  unmount" is unsafe (the long-press exit discards). `hasLocalDrafts()` is too coarse. Now a
  per-index editor guard (Stage A).
- **M2:** Stage D's tests could not catch a tiling gap (the fixtures have 2-3 messages). Now an
  injectable K, long odd-length fixtures, boundary mutations and mutant-red.
- **M3:** Stage D's premise was unmeasured, and the project's data suggests a minor share. Now
  profile first.
- **M4:** mechanism 3's "at most one per frame" was false under `'off'`, and the cost split was
  unmeasured. Forced layout from `checkIfAtBottom()` was added. Re-verified by the Orchestrator.
- **M5:** Stage B must reuse an instance only on exact text equality. A length-plus-revision hash
  opens an overwrite path. Pinned.

**MINOR (all folded):**
- A1 scroll-to-latest, identity key and ordering.
- "Whole session" was overstated (desktop only).
- A2 edge trigger, user-input requirement, settle, and no visible jump in `flex-col-reverse`
  (check on WebKit).
- Screenshot suppression plus the `runWithFullWindow` seam.
- The correct at-bottom check (`Chats.checkIfAtBottom`, not `children[0]`).
- Mutant-red instead of import-red.
- Mechanism 5's refutation test and `content-visibility`.
- Tail-aligned chunks.

### Gate 1 re-review — opus-reviewer (fresh), 2026-09-22 — [REJECT] (rev 2)

**Resolved in rev 2:** M2, M3, M4, M5.

**Not resolved:**
- **M1:** the guard covered only A2, and a per-index registry collides.
- **The tail-alignment rationale** was backwards.

**New findings:**
- **B1 (BLOCKER):** "a switch already unmounts every message" was false. Copy and branch keep the
  message hashes, so instances with open editors survive today; A1 would have dropped them.
- **M1:** the per-index registry collides when two editors are open on one message.
- **M2:** A3 restoring to the initial count would turn a failed screenshot into an edit-loss path.
- **M3:** tail alignment puts the streaming message in a full chunk.
- **Minors:**
  - id-less chats in the chat key;
  - a reset that depends on the objects;
  - where scroll-to-latest runs;
  - a shrink target that removes visible messages;
  - scrollbar drag and the `alwaysScrollToNewMessage` gap;
  - two overstated claims;
  - B and D had no decision rule;
  - B updating an instance with an open editor.

**Rev 3:**
- replaces the per-decision guards with **one guard at the unmount site** (`hasUnsavedEdit()`
  plus a same-hash-at-same-index check), which resolves B1, M1 and M2 and also covers today's
  screenshot-success and branch paths;
- fixes every minor in Stage A;
- reduces B, C and D to measure-first steps with decision rules and the constraints already
  pinned;
- switches D to head alignment.

### Gate 1 re-review — opus-reviewer (fresh), 2026-09-22 — [REJECT] (rev 3)

**Resolved:** B1, M1 (in design), M2, M3, and all the minors except one wording point.

**New findings:**
- **X1 (BLOCKER):** the greeting `Chat` (`idx -1`) is mounted by `DefaultChatScreen` under
  `{#if message.length <= loadPages}`, outside `Chats`. Its translation editor is reachable, so A2
  and A1 would newly destroy it. "`toRemove` is the only unmount site" was false; `Chats`'
  `onDestroy` also unmounts.
- **X2:** a recorded index past the end of the current messages would throw.
- **X3:** the keep check needed the mount loop's exact hash (`chatId`, portrait, `disabled`,
  reload pointer, streaming index), and had to re-add kept hashes, or it would orphan or
  duplicate instances.
- **Minors:**
  - when a kept instance unmounts;
  - the gap above the window makes the editor jump away while scrolling up, so §5's claim was
    wrong;
  - A1 ordering (a writable `$derived`, and a peak-count check);
  - A2 under a fold and touch momentum;
  - the `children[1]` wording;
  - the id-less wording;
  - `PartialEditController` has no export yet.

**Rev 4:**
- drops the keep-outside-the-window design;
- clamps every window reduction to the oldest open editor, including the greeting's, so X1, X2
  and X3 and the gap cannot arise;
- specifies the untracked clamp read, the writable `$derived`, the fold-aware target, the touch
  window and the `PartialEditController` export;
- fixes both pieces of wording.

### Gate 1 re-review — opus-reviewer (fresh), 2026-09-22 — [REJECT] (rev 4)

**Resolved:** X1, X2, X3; the A1 ordering; the fold arithmetic; the touch window; the
`PartialEditController` export.

**New findings:**
- **N1 (BLOCKER):** clamping `loadPages` left zero slack, so the next appended message slid the
  window past the editor and silently lost it. The same happens to the greeting and to the branch
  case.
- **N2 (MAJOR):** on a switch the clamp mixed indices from the chat being left with the new chat's
  length. It could mount almost the whole new chat, and the window stayed large because A2's edge
  wouldn't fire.
- **N3 (MAJOR):** "an open editor is never outside it" was false. Appends, a fold, the fold's
  "load more", hash changes, and component unmounts all still remove instances, and "load more" is
  not pure growth.
- **Minors:**
  - m1: a stale fold index in the reset;
  - m2: with a length that is a multiple of K, the streaming message sits in a full chunk;
  - m3: the `children[1]` wording.

**Rev 5:**
- stops clamping `loadPages`. `updateChatBody` extends its rendered range to the oldest open
  editor that still **belongs**: same `chatId` and `data` at that index in the current messages.
  The greeting gate also admits a belonging greeting editor. This resolves N1 and N2, and m1 is
  moot;
- lists N3's paths as out of reach and unchanged, and corrects §2.1;
- uses a singleton last chunk for Stage D (m2);
- fixes the wording (m3).

### Gate 1 re-review — opus-reviewer (fresh), 2026-09-22 — [REJECT] (rev 5)

**Resolved:** N1 and N2 (for editors inside `Chats`), N3 in substance, m1, m2 and m3.

**New findings:**
- **G1 (BLOCKER):** the greeting's "same chat / same `fmIndex`" rule was stricter than today. A
  switch to another chat of the same character now destroyed a greeting translation edit that
  survives today.
- **R1 (MAJOR):** when the extension lifted (e.g. on save), hundreds of visible messages
  unmounted and the view jumped. Closings that don't write data left the range stale until some
  later run.
- **R2 (MAJOR):** scroll-up stalled until `loadPages` climbed past the extension.
- **Minors:**
  - the direction of the belonging check's error claim was backwards;
  - the greeting and `Chats`' range were not joined;
  - the greeting's reference point was undefined;
  - the out-of-reach "load more" entry no longer held;
  - "a belonging open editor" wording.

### Escalation — senior-advisor (Fable 5.1), 2026-09-22

**Triggers:** several different designs had failed (per-decision guards, a guard at the unmount
site, a `loadPages` clamp, range extension), and five rejections in a row showed a loop. The
maintainer asked for the escalation.

**Root cause:** the five rejections were one structural fact. Unsaved editor text lives in a
component instance whose lifetime depends on a content hash, and the instance can be unmounted
from at least six sites in four components. A guard placed in the window policy is incomplete by
construction.

**Direction:**
- A-lite first, using the existing draft registry with a kind flag;
- then containment for the layout-bound costs;
- durable drafts keyed by message identity, as the foundational fix;
- A2, B and D after that;
- E only after durable drafts.

**DO NOT:**
- a sixth "guard the window policy" variant;
- commit on unmount;
- use `hasLocalDrafts()` unmodified;
- key the reset on the objects;
- start E before durable drafts;
- treat containment as a substitute for bounding N;
- put the containment rule inside `Chat.svelte`.

**New fact:** `changeChatTo` fans `ReloadGUIPointer` out over the old window on every switch. The
Orchestrator verified this claim, the dead `reloadKeys` and the draft registry's hooks in source.

**Maintainer decisions:** the order was approved. The trade-off in durable drafts (a leftover
draft could defer the multi-tab auto-reload) is to be decided when that plan is written.

### Gate 1 — opus-reviewer (fresh), 2026-09-23 — [APPROVE-WITH-FINDINGS] (rev 6, Stage A)

**Held:**
- The gate covers every message and greeting editor while text is unsaved: registration happens
  on the flag, outside the `{#key}`.
- The only `registerDraft` callers are the three editors, the composer and HypaV3. `BookmarkList`'s
  `Chat` instances would default to `'message'`, which fails safe.
- The Svelte 5.55.1 ordering holds: a parent `$effect.pre` runs in the traversal, and user effects
  run afterwards (async mode is off).
- The multi-tab gate is untouched.

**MAJOR:**
- **M1:** the `changeChatTo` fan-out does not run on character switches, so it is not part of the
  682 ms row. The Orchestrator verified this in `changeChar`.
- **M2:** scroll-after-reset was under-specified. `scrollIntoView` hides a tall newest message and
  the composer, and drifts after the async parse. A no-op reset should not scroll.

**MINOR:**
1. The pending screenshot restore, and a key change during a screenshot.
2. "Never resets" is overstated for id-less chats.
3. Define the live peak metric.
4. The composer mutant can't be killed by a unit test without call-site constants.
5. Implementation notes: key from the same expressions, `untrack`, and update the last-seen key.
6. Wording: the components register, not `localDrafts.ts`.

**All folded into rev 7.**

### Gate 2 — opus-reviewer (fresh), 2026-09-23 — [APPROVE-WITH-FINDINGS] (Stage A implementation)

**Findings, all in the screenshot restore:**
1. Overlapping screenshots (a double click): the second saved the full window as its "before"
   value, so the restore left every message mounted.
2. A restore deferred by an open editor survived a chat change and later restored the old chat's
   window instead of the initial value.
3. A deferred restore scrolled the view when it applied.

**Fixes:** a screenshot depth counter (save at the first, restore at the last); a skipped reset
replaces a pending restore with the initial value; a deferred restore does not bump the reset
token. Five tests written first failed on the old policy and pass now. All 14 mutants were killed
(run in the scratchpad). Full suite 775 passed, 4 skipped; `pnpm check` 0 errors, 0 warnings.

### Stage A live check — Orchestrator, 2026-09-23 — [PASS]

Dev build, i9-13900K (best case). Temporary character with two 2000-message chats (A, B) and a
short chat whose newest message is very tall; removed afterwards through `removeChar`.

| Check | Result |
|---|---|
| Grow A to 405 mounted, switch to B, no editor open | B mounts 30 (1970-1999), scroller at the bottom, 112 ms to the second frame |
| Grow B to 405, open the edit box on a message, switch to A | A mounts 405: unchanged from before, as designed |
| The next switch back to B, editor gone | B mounts 30, at the bottom |
| Composer text typed, grow to 150, switch | Reset to 30; composer text kept (composer does not gate) |
| Grow to 150, switch to the tall-message chat at 375x812 | End of the tall message at 720-740 px, composer at 760 px: anchored at its end, composer visible |
| Grow to 150, switch character away and back | 30 mounted, at the bottom |

Not exercised live: the screenshot restore (it saves a file); covered by the unit tests and
mutants. The console buffer had overflowed before the check, so console errors were not
verified.
