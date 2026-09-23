# Durable drafts: move editor text into the registry, keyed by message identity

**STATUS:** open

**Status:** rev 4, 2026-09-23. **Gate 1 passed.** Ready for red tests and implementation.
- Round 1 on rev 1: **[REJECT]** (2 blockers). Round 2 on rev 2: **[REJECT]** (3 blockers).
  Round 3 on rev 3: **[APPROVE-WITH-FINDINGS]** (4 majors, 9 minors). All folded in (§11).
- Both named repros were **independently walked end to end** before rev 3 shipped, and then
  re-derived from source by round 3. Both hold, with preconditions stated (§2.1, §2.2).
- The composer is **split into its own stage** (maintainer decision, §4.5), verified safe to defer.
- Three maintainer decisions stand: §6's option (b), §5.4's affordance, §4.5's split.

**Scope.** The foundational stage from Report 19 §3, item 3. Prerequisite for A2, for the screenshot
restore gate, and for E.

**This plan does not change the window policy.** Report 19's Stage A gate is untouched, and both
gate rounds confirmed no violation of the `senior-advisor` DO-NOT list.

---

## 1. What the stage must do

- Editor text survives an **involuntary** unmount, and survives the non-unmount prop reset in §2.2.
- Text is restored only onto **the same message with the same base content**; a stale draft must
  never overwrite newer data.
- Text is cleared only on **deliberate** exits, which differ per editor (§4.4). Unmount never clears.
- Restoring is **visible** and reversible in one click (§5.4).
- Nothing about the save format, the plugin API, or any persisted file changes.

**Qualification.** Because §5.1 freezes the identity at editor-open, a copy or branch performed
mid-edit leaves the record filed under the **original** chat's key. No text is lost — those
operations reuse the mounted instance, so the live buffer survives.

Rev 3 claimed that record was "unreachable and reclaimed by §6's cap". **Both halves were false**
(round 3, MAJOR 2), and the corrections matter:
- It is **reachable**. The original chat still exists and keeps its `id`, so reopening that message
  *in the original chat* finds the record and restores it. The user-visible effect is mild but
  surprising: text typed while looking at the branch can surface later on the original's message.
  §5.4's marker is what keeps this from being silent.
- The cap in §6 removes a **registration**, not a **record**. Nothing reclaimed records, so
  `draftContents` grew without bound on a long-lived tab — exactly the failure §4.2 exists to
  prevent. §6.1 now bounds records separately.

## 2. The loss surface

| # | Path | Mechanism | Notes |
|---|---|---|---|
| 1 | The `Chats` hash diff | `updateChatBody` hashes message data, `chatId`, index, portrait, disabled and the reload pointer; a changed hash unmounts the instance | **one click away** (§2.1) |
| 2 | The greeting gate | the `{#if message.length <= loadPages}` wrapper destroys the greeting `Chat` | |
| 3 | Fold | `chatFoldedStateMessageIndex` narrows `loadStart`/`loadEnd` | same diff as 1 |
| 4 | `Chats`' `onDestroy` | bulk unmount of every live instance | |
| 5 | `ChatScreen` unmounting | tears down `DefaultChatScreen` and everything below | **unverified**, see §10 |
| 6 | A `ReloadChatPointer` bump | folded into the same hash as 1 | **scriptable** — Lua `reloadChat(id, index)` and `v2UpdateChatAt` bump arbitrary indices |
| 7 | **The `BookmarkList` prop reset** | **not an unmount** — see §2.2 | **one click away**; no lifecycle hook to hang a rehydrate on |

Paths 1, 2, 3, 4 and 6 are verified in source. Path 5 is carried from Report 19 and is **not**
re-derived (§10). Rev 2 claimed "all six are confirmed" while its own table said otherwise; corrected.

### 2.1 Path 1 is a live, one-click data-loss bug

`rerolls()` in `Chat.svelte` carries no `editMode` guard — the only `editMode` guards in that
component are the partial-edit trigger, two disabled states, and the textareas. Open the pencil,
type, click the reroll arrow: the reroll writes new data, the hash changes, the instance is
unmounted, and the text is gone. The draft key unregisters cleanly from `onDestroy`, so nothing
looks wrong.

**Preconditions, independently verified (round 2 MINOR 5, then a dedicated end-to-end walk):**
- **The message must be the newest in the chat** — but this is *structurally guaranteed*, not a rare
  setup. `.dyna-icon` is `display:none` except on `.chat-message-container:first-of-type`;
  `Chats.svelte` hardcodes `rerollIcon: 'dynamic'` for every mounted instance, so no user setting
  turns it off; `updateChatBody` inserts newest-first, so the newest message *is* that container;
  and `reroll()`/`unReroll()` always mutate `message.at(-1)` regardless of which message was
  clicked. **"Reroll is visible on" and "reroll acts on" are therefore the same message by
  construction and cannot diverge.** Editing the newest reply and then deciding to reroll instead is
  an ordinary action.
- `DBState.db.swipe` only changes which icon renders; both variants carry `dyna-icon`, so it does
  not affect the precondition.
- **Message folding must not be active**, or `loadStart`/`loadEnd` shift and "first in the DOM" and
  "last in the chat" can diverge. Folding is off by default.
- The message must not be mid-generation — `reroll()`/`unReroll()` early-return on `$doingChat`.

### 2.2 Path 7: `BookmarkList` loses text with no unmount

**Rev 1 sited this on the greeting and was wrong; rev 2's replacement repro was also wrong.** Both
errors had the same shape — a real mechanism attached to an impossible scenario — and both sat in
the headline slot. Rev 3's repro was verified end to end by a separate pass before shipping.

- Rev 1: the greeting's main editor cannot be opened. `startOriginalEdit()`'s two callers are gated
  `idx > -1`; the greeting mounts `idx={-1}`.
- Rev 2: clicking the bookmark toggle *on the edited message* takes `toggleBookmark`'s
  `bookmarkIndex > -1` branch and **removes** it from `chat.bookmarks`, so its keyed block is
  destroyed. That is an unmount — path 4's class — not a prop reset.

**The mechanism.** In `BookmarkList.svelte`, `<Chat>` receives `idx={msg.originalIndex}` (so the
pencil is reachable) and `message={msg.data}` from a `$derived.by`, inside
`{#each bookmarkedMessages as msg (msg.chatId)}`.

In Svelte 5's `prop()`, the written-to-but-not-bound case builds
`derived(() => { overridden = false; return getter() })`. A child write does
`set(d, new_value); overridden = true`, but `overridden = false` is assigned *inside the derived's
own compute*, so any recompute discards the child's local write.

Verified against Svelte's reconciler, not inferred: for a **surviving** keyed block, `each.js` does
`internal_set(item.v, value)` — the block is reused and the new item object is pushed into its
per-item reactive source. The key expression is `msg.chatId` rather than the item itself, so the
compiler sets `EACH_ITEM_REACTIVE` and `item.v` is a real source. `internal_set` skips only on
`equals`, and `bookmarkedMessages` mints a **fresh object literal** for every surviving id, so the
update always fires — **even when the message's own text is byte-identical**.

`editMode` is independent `$state` untouched by the prop reset, and its `$effect` does not re-run, so
the editor stays open and the draft stays registered while the text snaps back.

**Verified repro.** With **at least two bookmarks**: expand one, open its pencil, type, then click
the **trash icon on a different bookmark's row**. `removeBookmark` splices `chat.bookmarks`, the
surviving block is reused, the prop derived recomputes, and the typed text is silently replaced. The
trash control lives in the always-rendered row header, independent of expansion, so it is reachable
while another row's editor is open.

**The blast radius is wider than that repro** (found by the verification pass, not by either gate).
`bookmarkedMessages` recomputes from `messageMap`, which rebuilds from `chat.message` on **any**
message mutation anywhere in the chat. Since the map always mints new literals, *any* unrelated
message change while a bookmark editor is open resets every open bookmark editor. Removing a
different bookmark is merely the narrowest reliable trigger.

**Why this shapes the design.** The natural capture implementation — an `$effect` mirroring the
editor's bound variable — would observe this overwrite as if it were typing and **persist the
corruption into the draft**. §5 is the answer.

Chat-window messages are not exposed to this: `Chats.svelte` mounts each `Chat` with a plain,
non-reactive props object.

## 3. Architecture: two maps, two lifetimes

`localDrafts.ts` documents a deliberate invariant: keys are per component instance (`v4()`, never
`crypto.randomUUID()`, which is `[SecureContext]` and undefined on plain-HTTP LAN self-hosting),
because a derived key collides across a remount at the same index.

Durable drafts needs the **opposite** keying for content. **Two requirements, two maps.**

- `localDrafts: Map<instanceKey, DraftKind>` — **unchanged in shape and meaning**. Liveness only.
  `localDrafts.test.ts` must pass **unmodified**; Gate 1 round 2 ran it and confirmed no edit is
  needed.
- `draftContents: Map<namespacedIdentityKey, DraftRecord>` — **new**. Content, outliving any
  instance.

Both stay plain (non-rune) Maps: `saveDb()`'s plain `while (true)` loop reads the registry from
outside the `$effect.root(...)` driving dirty tracking.

### 3.1 What the split buys, and the premise it rests on

Gate 1 verified the narrow claim in both rounds: a content record cannot by itself make
`hasLocalDrafts()` or `hasMessageEditorDrafts()` return true. `chatWindowPolicy.ts` has no imports
at all and takes `editorsOpen` as an injected dependency.

**The immunity is contingent on a premise, now normative:**

> **Rehydration never sets `editMode`.** A restore seeds the buffer *when the user opens the
> editor*. It never opens an editor, and it never registers liveness on mount.

Otherwise a forgotten draft would resurrect liveness on every remount, suppressing the window reset
non-deterministically and sticking the multi-tab gate.

## 4. Identity is per editor kind

**Supporting facts (gate-verified):**
- `chatId` is backfilled onto every message at the start of the next `sendChat` — **not
  `sendChatMain`**, which is a thin wrapper (round 2 MINOR 7).
- Branch, copy and reorder preserve message `chatId`s; copy and branch assign a fresh **chat** `id`,
  so `chatKey` separates them.
- `undo`/`redo` do not exist for chat messages, but `unReroll` is a de-facto undo for the newest
  message and is covered by base-text comparison, not a dedicated mechanism.

| Editor | Identity key | Namespace |
|---|---|---|
| Main message editor (chat window **and** `BookmarkList`) | `(chatKey, chatId)`; the index key only while the message has no `chatId`, never as a fallback (§4.1) | `msg:` |
| Translation editor (including the greeting's) | the existing content-derived translation cache key | `tr:` |
| Partial edit | out of scope for v1 (§4.6) | — |
| Composer | **moved to its own stage** (§4.5) | — |

**Namespacing is mandatory:** without it a content-derived translation key could collide with a
`msg:` key string and overwrite across editors.

### 4.1 Index is not in the key, and there is no index fallback

**Why the index is not in the key.** Rev 3 said "reorder preserves `chatId`, so requiring the index
to match would discard drafts". **That motivation was wrong** (round 3, MAJOR 3): "reorder" in this
campaign means *chat* reorder, which does not move a single message index, and there is no
message-level reorder anywhere in `src`. The conclusion is right for a reason rev 3 never stated —
**deleting or inserting a message above the edited one** shifts its index while `chatId` is
preserved, via `rm()`, `/cut` and trigger splices. That is the real case, and it is also what makes
an index fallback dangerous.

The index is never part of a `chatId` key. (Rev 3 said it was stored in the record as a tie-break on read; the paragraphs below explain why that is impossible.)

**Premise:** dropping the index from the key is safe only if `chatId` is unique within a chat.
Nothing enforces this, and chats imported from upstream supply their own ids.

**Revs 3 and 4 claimed the stored index was "insurance" — a tie-break on read. It is not, and
cannot be** (found during implementation, Orchestrator-verified). There is one record per key, so
there are never two candidates to disambiguate. And a `record.index === identity.index` check would
be actively wrong: in the *normal* case the message keeps its `chatId` while a deletion above shifts
its index, which is the entire reason the index was dropped from the key. A legitimate shift and a
duplicate-`chatId` sibling are indistinguishable — both read as `record.index !== identity.index` —
so any check that rejects one rejects the other.

The index plays exactly one part: the pre-backfill index key, so a stale orphan can be **found and
deleted** (never restored from). The implementation forms that key from the *lookup* identity's
index; the index stored in the record is never read, and is kept for inspection only (Gate 2 round
4). The real guard against a duplicate
`chatId` is base-text comparison alone, and §9 states its residue accurately.

**The backfill transition.** Messages reach the DB without a `chatId` from the "+" button, `/send`
and `/sendas`, the group first-message add, and trigger pushes. Type into such a message, then Send:
the backfill assigns a `chatId`, the hash changes, the instance remounts, and a lookup by `chatId`
misses a record that was filed with no `chatId` at all.

**Rev 3 tried to bridge that with a narrowed index fallback. It does not work** (round 3, MAJOR 1).
The signature "the record has no `chatId` and the current message now has one" is satisfied by *any*
message that gained a `chatId` in the backfill, not by *the* message the record belongs to:

> `/send hello` twice → two identical messages at indices 5 and 6 with no `chatId`. Edit index 5,
> type, let a pointer bump unmount it (record: `idx:5`, `baseData:'hello'`). Delete a message at
> index 2, so the former index-6 "hello" is now at index 5. Send → both gain `chatId`s. Open index
> 5: the `chatId` lookup misses, the signature matches, `baseData` matches → **the other message's
> draft is restored.**

**Therefore there is no index fallback at all.** A record filed without a `chatId` is looked up by
its index key only while the message still has no `chatId`; once the message has one and the lookup
misses, the record is **deleted**, not bridged.

The cost is one narrow case: text typed into a never-sent message, where the editor is unmounted
*and* a send happens before it is reopened. The benefit is that no restore can land on a message the
draft was not written for. **A missed restore costs a draft; a wrong restore costs a message.**

### 4.2 `baseData` lives in the record, not in the key

Rev 1 put base text in the key, which made "mismatches are pruned" **structurally impossible**: a
changed base gives a *miss*, not a mismatch, so the record is unreachable and the map grows
unbounded — every reroll-while-editing leaving a permanent orphan.

So: key on identity; store `baseData` in the record; compare on read; **delete on mismatch.**

**For a `tr:` record** (round 2, MINOR 3), `baseData` is the **source text the translation was
made from**, not the cached translation — that is what determines whether the translation draft is
still about the same content, and it is what §5.4's revert restores away from.

### 4.3 The translation editor cannot use message identity, and this is pre-existing

`getLLMCache`/`setLLMCache` key the translation store by the literal parsed text, with no index and
no `chatId`. Two messages rendering to identical text already share one cache slot today. A
translation draft anchors to that same key, inheriting the ambiguity without widening it.

### 4.4 Deliberate exits differ per editor

Long-press on the **original-text** textarea discards. Long-press on the **translation** textarea
**saves**. "Long-press means discard" is false, and the clear-on-exit list follows each editor.

### 4.5 The composer moves to its own stage (maintainer decision)

The mis-send is real and gate-verified: `messageInput` is never cleared on a selection change,
`DefaultChatScreen` is not unmounted on a character switch, and `sendMain` pushes into whichever
character is selected at send time. Rev 2 folded the fix in here.

**Gate 1 round 2 showed the fold-in imports a new instance of rev 1's blocker.** §5.1's whole remedy
is "freeze at editor-open", and **the composer has no open event** — it is always live. Two
independent key-dependent effects would then race on a chat switch, and whichever runs first decides
whether the outgoing text is flushed under the old key or written under the new one, destroying the
incoming chat's stored draft.

It also needs machinery this stage does not: the draft unit is **three** values —
`messageInput`, `messageInputTranslate` and `fileInput` — and `sendMain` appends staged files to the
selected character, so moving only the text would leave the attachment half of the mis-send inside a
composer that now *looks* per-chat. And `updateInputTransateMessage` writes from a `.then()` after a
network call with no staleness guard, so an in-flight translate that resolves after a switch lands
in the wrong chat's composer and, via the mirror, its draft record.

**The maintainer chose to split it out.** The composer stage needs: a normative
flush-under-the-old-key-then-restore-under-the-new-one ordering, all three values moving together,
and a generation token for the async translate writes. It is next, not never.

### 4.6 `PartialEditController` is scoped out of v1

Its buffer is a fuzzy-matched sub-range located against live DOM, with offsets into a `sourceData`
snapshot. None survives an unmount. Both gate rounds confirmed the scope-out is coherent: its draft
registration is untouched, so its multi-tab and window-policy behaviour is unchanged. The residual is
a UX inconsistency, and §5.4's affordance must make it visible rather than silent.

Neither `Chat.svelte` nor `PartialEditController` receives `chatId` as a prop today; both would need
the same threading, or both can derive it from `DBState…message[idx].chatId`.

## 5. Capture

### 5.1 Freeze the identity at editor-open

Rev 1 guarded the buffer against a parent recompute and left the **identity key** reactive — the
same hazard with the arrow reversed, since a key derived from live props re-files an in-flight edit
under another message's identity.

> When an editor opens it snapshots its identity key and **freezes** it for the lifetime of the
> buffer. Capture writes to the frozen key. The key is never re-derived from live props.

**This rule does not extend to `selId`/`chatPage`** — see §5.5.

### 5.2 The buffer replaces the prop as the edit target

The main editor stops using the `$bindable` `message` prop as its buffer; a dedicated
component-local `$state` buffer is bound to the textarea, so no parent recompute can reset it.

Both gate rounds verified this is **safe**: across every `Chat.svelte` importer, **no call site uses
`bind:` on `message` and none reads a mutated `message` back.**

Two details:
- There are **two** `bind:value={message}` textareas — the default `textBox` and the `cardboard`
  theme. Both move to the buffer, or the themes diverge.
- On save the buffer is assigned to `message` **as well as** to the DB, because other consumers read
  `message` (`blankMessage`, `displayMessage`, `PartialEditController`'s `messageData`).

**Rev 2 gave the wrong reason for that second point** (round 2, M1). It claimed the no-remount case
was the active streaming message — but `hashMessageData` is `''` only when the instance also has
`isOptimizedStreamingMessage: true`, which hides the pencil and blocks `clickToEdit`, so a
main-editor save there is unreachable. **The genuine no-remount case is `BookmarkList`**, whose each
is keyed on `chatId` and therefore survives a data edit. Right conclusion, wrong reason — the third
unreachable scenario this plan has shipped, and the reason rev 3 had its repros independently walked.

A corollary: no restore can occur on a streaming message, so §5.4's revert is never asked on one.

### 5.3 Seeding precedence

> On open: if a record exists under the frozen identity **and** its stored `baseData` equals the
> current base text, seed from the draft and mark the buffer restored (§5.4). Otherwise seed from
> `message`, and delete any record whose base text no longer matches.

### 5.4 A restore is visible and reversible (maintainer decision)

Without this the stage adds a new quiet failure: the user opens an editor intending a small change
to the text they can see, the box holds something typed an hour ago, they edit the tail and save,
and the message is replaced wholesale.

A restored buffer carries a visible marker and a one-click revert to the stored message text. The
same affordance is where §4.6's gap is made visible.

**The affordance must exist on both edit surfaces** (round 3, MAJOR 4). §5.2 already notes there are
two — `textBox()`'s `AutoresizeArea` component and the `cardboard` theme's raw `<textarea>`. Adding
the marker to only the first would give `cardboard` users a silent restore, which is the exact
quiet wholesale-overwrite this affordance exists to prevent.

**A revert deletes the record** (round 3, MINOR 5). Otherwise the same rejected draft is offered
again on the next open.

For a `tr:` record the revert target is the **cached translation** that `loadTranslationForEdit`
seeded, not the record's `baseData` (round 3, MINOR 4).

### 5.5 **Not adopted:** freezing `selId`/`chatPage` for the save path

Rev 2 made it normative that `edit()` and `handlePartialEditSave()` write through a frozen
`selId`/`chatPage`, on the theory that reading live global state at save time is inherently fragile.
**Gate 1 round 2 showed this would have created a silent cross-chat data-loss bug**, and the
Orchestrator verified it.

Copy (`SideChatList`) and branch (`Chat.svelte`) both `unshift` the new chat and `changeChatTo(0)`,
building it with `$state.snapshot` so message hashes are unchanged and `updateChatBody` **reuses**
the mounted instances. An editing instance therefore survives a chat switch. After the unshift the
displayed chat is index 0 — so a **live** read writes exactly where the user is looking, while a
**frozen** `chatPage` writes to the old index, which now holds an unrelated chat: a message there is
silently destroyed, and if that chat is shorter the assignment throws out of an un-awaited async
handler.

Rev 2's justification was also false. It asserted that surviving instances have no DB-writing
editor; copy and branch preserve chat-window instances that have both `edit()` and
`handlePartialEditSave()`. Report 19 recorded this, and §4 of this plan cites the same fact.

**Are there other surviving-instance switches?** Rev 3 answered by enumerating them, and the
enumeration was incomplete (round 3, MINOR 1): a chat and its copy or branch share message `chatId`s
*permanently*, so an ordinary later chat-list click between those two also reuses instances.

**The conclusion survives on a stronger argument, which replaces the enumeration.** The reuse key in
`updateChatBody` is `data + chatId + index + portrait + disabled + pointer`. An instance is reused
only when that whole tuple matches, which means a reused instance **necessarily corresponds to the
displayed chat's message at that index**. A live read therefore cannot land anywhere else, whatever
sequence of switches produced the reuse. **The live read has no wrong case, so there is nothing to
fix.**

*Recorded because the error is reusable:* rev 2 treated "looks fragile" as "is wrong" without first
establishing what correct behaviour is in the only case where the code path matters.

## 6. The multi-tab gate: option (b), as a draft kind (maintainer decision)

`getMultiTabAction` returns `'stay'` when `!dirty && hasLocalDraft`, and
`shouldRetainOtherTabSavedSignal` re-arms the peer signal in exactly that case, so `saveDb()`'s loop
re-evaluates roughly every 500 ms and fires the moment the draft clears. The `if (dirty)` branch is
ordered **above** the draft branch, so a draft can never suppress the conflict prompt on a
revision-aware backend. A permanently stuck gate is therefore a **stale read, not a clobber** — that
path was closed by `ae167294`.

Rev 1 recommended (a) on a Pareto argument. That compares against a build that has never had a user,
so it is a scope argument, not a shipping one. **Adopted: (b), as a draft kind.**

- When the content store creates or updates a record it also registers an orphan key **explicitly
  under a non-`'message'` kind** and stamps the record with the time; the registration is removed
  after a cap.
- **The kind must be passed explicitly** (round 2, MINOR 2). Omitting the argument takes
  `registerDraft`'s `'message'` default, which would pin `hasMessageEditorDrafts()` true forever —
  precisely the failure §3.1 warns about. §8 tests for this. Reusing `HYPA_DRAFT_KIND` would be
  misleading, so the stage exports its own named constant — **an alias for the existing `'other'`
  kind, not a new member of the `DraftKind` union** (round 3, MINOR 7), because §3 commits to leaving
  `localDrafts`'s shape unchanged.
- Because the kind is not `'message'`, `hasMessageEditorDrafts()` is unaffected and §3.1's
  window-policy immunity survives intact. Only `hasLocalDrafts()` — the multi-tab gate — sees it.
- Gate 1 round 2 verified that `registerDraft` early-returns without notifying on a same-kind
  re-register, so per-keystroke mirroring will not storm `onDraftsChanged`.

**Expiry, specified:** the cap is evaluated by the existing ~500 ms save loop rather than a
per-record timer, so there is no timer to leak; an update **re-arms** the stamp; and the
registration is removed when the record is deleted on mismatch (§4.2).

**A new notification source, and why it is benign** (round 3, MINOR 6). The sweep calls
`unregisterDraft` from inside `saveDb()`'s loop, which fires `notifyDraftsChanged()` and reaches
`chatWindowPolicy`'s `onDraftsChanged()`. A pending screenshot restore can therefore be applied on a
timer rather than on a user action. That is harmless — the restore bumps no token, so it triggers no
scroll — but it is a new path into the window policy and is stated rather than discovered later.

**Implementation notes, surfaced by the implementer rather than decided silently:**
- **The cap duration is 60 s**, injectable. The plan said only "briefly". Because records are
  in-memory, a reload destroys them, so the cap is precisely *how long orphaned text is protected
  from a peer-tab reload*. 60 s gives a peer's save a real window without parking the gate long
  after an editor closed. Recorded as a chosen value, not an accident.
- **The gate is a decorator, and that creates a seam hazard the type system does not catch.**
  `draftContents.ts` deliberately never imports `localDrafts.ts`, so registration happens only via
  `draftContentOrphanGate`. Both it and the raw `draftContents` satisfy `DraftContentStore`, so a
  caller importing the raw store type-checks cleanly and **silently skips registration and the cap
  entirely**. The Orchestrator caused exactly this by briefing the concurrent capture dispatch to
  import the raw store. **Resolution: the raw singleton is withdrawn** so only the factory and the
  gated singleton are importable — enforced by absence rather than by a comment.

### 6.1 Records are bounded separately from registrations

The cap above releases the **gate**. It does not bound the **store**, and rev 3 wrongly claimed it
did (§1, round 3 MAJOR 2). Records are pruned by compare-on-read, which never fires for an identity
the user does not reopen.

**Two bounds, two purposes:**
- **Registrations are time-capped**, as above. Their only job is to hold the multi-tab gate while
  text is at risk, and that job is short-lived.
- **Records are count-bounded**, evicting least-recently-used. Drafts are short strings, so a modest
  bound costs nothing and makes unbounded growth impossible regardless of what the user reopens.

Keeping these separate is what lets recoverable text outlive the gate hold — which §1 promises —
without the store growing forever. An evicted record is gone; that is stated in §9.

**(c) stays rejected:** it touches storage, the campaign's most dangerous surface, and creates
orphans that outlive a reload, for the same residual (b) closes cheaply.

**Unchanged:** the composer and HypaV3 drafts still live in component `$state`, so the gate must keep
existing for those kinds regardless.

## 7. Compatibility

- **In-memory only.** No persisted file, save format or plugin API change. Both gate rounds verified
  this section; the one persisted write nearby, `setLLMCache`, is pre-existing and unchanged in
  shape.
- Chats imported from upstream supply their own `chatId`s, which is why §4.1's uniqueness premise is
  stated rather than assumed.

## 8. Tests

Red-before-green; the store is an extracted seam with no Svelte dependency.

- **The content store:** namespaced keys, set/get/clear, base-text comparison on read, **delete on
  mismatch**, deletion of an index-keyed record once its message has a `chatId`, and LRU eviction at
  the record bound (§6.1).
  - Mutants: rehydrate on partial match; base text moved into the key (must fail the prune test);
    clear-on-unmount; **any index fallback reintroduced** (must fail §4.1's two-identical-messages
    case); eviction disabled (must fail an unbounded-growth assertion).
- **§5.5's non-change needs a pin** (round 3, MINOR 2). It is the most dangerous reasoning in the
  document, it reverses a prior blocker, and the composer stage will have to get the same ordering
  right. Report 19 §9's own lesson was that the suite pinned nothing about how things were wired.
  Pin it: a surviving instance that saves after a copy writes to the **new** chat. Mutant: `edit()`
  reading a frozen `chatPage`.
- **Each loss path gets a named test.** Paths 1 and 7 are the one-click ones, with §2.1's and §2.2's
  verified preconditions encoded rather than assumed.
- **Path 7 needs a test that fails under the naive implementation.** A test asserting only "the
  draft is restored" passes under a capture effect that mirrors the prop. The test must assert that
  **a parent-driven prop change does not overwrite stored draft content**, and must drive it the way
  §2.2 does — a surviving keyed block receiving a new item object, not a destroy-and-remount, which
  the naive effect survives.
- **§5.1's frozen identity:** switch the parent's props under a live buffer, assert the draft is
  still filed under the original identity. Mutant: identity re-derived per capture.
- **§3.1's premise:** rehydration must not set `editMode`. Mutant: restore opens the editor.
- **§6's kind:** assert `hasMessageEditorDrafts()` stays false with orphan records present. Mutant:
  the kind argument omitted, taking the `'message'` default.
- **Liveness unchanged:** both predicates pinned against a populated content map.

## 9. Accepted limitations (rev 3)

- `PartialEditController` keeps today's behaviour (§4.6), made visible by §5.4's affordance.
- The composer keeps today's behaviour until its own stage lands (§4.5). **The mis-send is real and
  remains open until then.**
- Translation drafts inherit the LLM cache's content-key ambiguity (§4.3).
- **Concurrent editors on one identity converge, last writer wins.** The chat window's `Chat` and
  `BookmarkList`'s `Chat` can hold the same message at once and mirror to the same record. Both are
  the user's own text on the same message, so this is stated rather than solved.
- A copy or branch mid-edit leaves the record under the original chat's key, where it can surface
  later on that chat's message (§1). No text is lost, and §5.4's marker makes it visible.
- **Two messages in one chat sharing a `chatId`** (possible only for chats imported from upstream,
  since nothing local enforces uniqueness) **share a single record.** Base-text comparison is the
  only guard, and there is no tie-break — see §4.1. Two consequences, both benign and both stated
  rather than solved: opening the sibling when its text differs deletes the record, costing the
  legitimate draft; opening it when its text matches restores the draft onto it, which is the user's
  own text landing on a message with identical content.
- **Text typed into a never-sent message is lost** if its editor is unmounted and the message
  gains a `chatId` before it is reopened, because there is no index fallback (§4.1). This is the
  deliberate price of never restoring onto the wrong message. A send is one trigger. **Bookmarking
  the message is another** (found at Gate 2 round 1): `toggleBookmark` assigns a missing `chatId`,
  the `chatId` is part of the instance hash, and the instance remounts.
- **Before a `chatId` exists, the index key can still restore onto a twin** (found at Gate 2 round
  1). §4.1's "no restore can land on a message the draft was not written for" holds once messages
  have `chatId`s, not before. Two identical never-sent messages, a draft filed at index 5, and a
  message deleted above them before any send: the twin now sits at index 5 with matching base text
  and receives the draft. The base text is identical, so the landing text is the user's own on
  identical content, and §5.4's marker makes it visible and revertible.
- **An in-place change to a message's text silently prunes its draft.** The read-time base-text
  comparison (§4.2) deletes a record whose `baseData` no longer matches, with no marker. So a draft
  on a message whose `.data` is rewritten in place (a partial-edit save, a `Prereroll` hit, a
  trigger edit) is gone on the next open. This is §4.1's "a missed restore costs a draft" applied
  to those triggers, stated here so it is not mistaken for a bug.
- **The restore marker keeps theme colours inside a `customHTML` layout.** A `<RISUTEXTBOX>` sits
  on the user's own CSS, which the marker cannot know, so its contrast there is whatever that CSS
  makes it. The always-light `cardboard` and `mobilechat` surfaces use fixed greys (Gate 2 round 1).
- **The cap applies to every record with no live editor, not only to orphans** (round 3, MINOR 8).
  An open editor's own `'message'` registration is uncapped, so open editors stay protected; text
  recoverable from a *closed* editor is not held indefinitely. §1's promise that text survives an
  involuntary unmount is therefore bounded by the cap and by §6.1's record bound, and that bound is
  the honest statement of what this stage delivers.

## 10. Claims this plan does **not** rest on verified source

- **Path 5** (`ChatScreen` unmounting on settings, grid or a theme change) is carried from Report 19
  and was not re-derived.
- Paths 3 and 5 are known to be *able* to destroy a live editor; neither has been *observed* doing
  so.

**Retired from this list:** rev 3 disclaimed Report 19's "branch/copy/reorder preserve message
`chatId`s" as unverified at the message level. Gate 1 round 3 settled it — `$state.snapshot` is a
structural deep clone, so `chatId` strings survive verbatim. It is now verified and §5.5 may rest
on it.

## 11. Gate record

### Gate 1 round 1 — `opus-reviewer` (fresh) — **[REJECT]**

- **B1** — rev 1's headline was impossible as sited: the greeting's main editor cannot be opened.
  The mechanism was real one component over; the reviewer located it on `BookmarkList`.
- **B2** — rev 1 froze the buffer but left the identity key reactive.
- M1 mis-cited `saveTranslationEdit()`; M2 the backfill transition; M3 base text in the key breaks
  prune; M4 §3.1's unstated `editMode` premise; M5 seeding contradicted restore; M6 silent restore;
  M7 concurrent-editor collision; M8 the composer's justification was void.
- Dissent on §6, accepted.

### Gate 1 round 2 — `opus-reviewer` (fresh) — **[REJECT]**

- **BL-1** — rev 2's §5.5 would have written the edit into an unrelated chat and could throw, because
  copy and branch preserve editing instances across a switch. **Dropped, not repaired** (§5.5).
- **BL-2** — rev 2's replacement repro was also impossible: the bookmark toggle on the edited message
  removes it and destroys the block. Same shape as B1, in the same slot.
- **BL-3** — the composer fold-in imports rev 1's blocker, because the composer has no open event;
  and the draft unit omitted `fileInput`. Split out (§4.5).
- M1 the streaming-message reason is unreachable; the real case is `BookmarkList`. M2 the index
  fallback can restore onto the wrong message. M3 moot once §5.5 is dropped. M4 async translate
  staleness (moves with the composer).
- MINORs 1-7 all folded in.
- **No dissent on §6**; the reviewer ran `localDrafts.test.ts` and `chatWindowPolicy.test.ts` (59
  passed) to confirm no edit is needed.

### Repro verification — `investigator`, before rev 3 shipped

Commissioned by the Orchestrator after two consecutive impossible-scenario blockers, as a standing
corrective: **every named repro is walked end to end by a separate pass before it ships.**

Both repros **hold with preconditions**, now stated in §2.1 and §2.2. The pass confirmed §2.1's
"newest message" precondition is *structurally guaranteed* rather than incidental, read Svelte's
each reconciler and compiler output to confirm that a surviving keyed block receives a new item
object via `internal_set` (rather than assuming it), and **found that §2.2's blast radius is wider
than the gate's repro**: any message mutation anywhere in the chat resets every open bookmark editor.

### Escalation count

**Two rejections in a row, each with new substantive findings. A third trips the rule** and sends
this to `senior-advisor`. Recorded rather than left implicit, because both rejections turned on the
same author-side failure: verifying a mechanism's components without verifying the scenario.

### Gate 1 round 3 — `opus-reviewer` (fresh) — **[APPROVE-WITH-FINDINGS]**

**Both headline repros survived re-derivation from source**, the first pair in this document's
history to do so. The reviewer compiled `BookmarkList.svelte` with `svelte/compiler` rather than
inferring, confirming the each-block flags give the item a real reactive source and that the child's
prop derived depends on it — and confirmed the exclusion too, that `Chats`' plain props object
yields a derived with no reactive dependency, which is what §5.2 relies on.

- **MAJOR 1** — §4.1's narrowed fallback still restored onto the wrong message, because the backfill
  signature matches *any* message that gained a `chatId`, not *the* one the record belongs to. **The
  fallback is removed entirely** rather than narrowed again.
- **MAJOR 2** — §1's qualification was false twice: the record is reachable, not unreachable, and
  nothing reclaimed records, leaving `draftContents` unbounded. Fixed in §1 and §6.1.
- **MAJOR 3** — §4.1's motivation cited a message-level reorder that **does not exist** in `src`.
  The conclusion was right for an unstated reason (deletion or insertion above the edited message).
  **The fourth instance of this document's recurring pattern**, and the first to survive the repro
  verification pass because it was reasoning prose rather than a named repro.
- **MAJOR 4** — §5.4's affordance was specified for one of the two edit surfaces.
- MINORs 1-9 folded in, including the stronger §5.5 argument (the reuse key necessarily matches the
  displayed chat, which replaces an enumeration that was incomplete), the missing §5.5 test pin, and
  the new `onDraftsChanged` path from the cap sweep.
- **Maintainer decisions upheld, all three.** §6 option (b) could not be broken — no race with an
  open conflict prompt, since that path is reachable only when `dirty`, where retention is false.
  §5.4 stands with MAJOR 4's gap closed. §4.5's split was verified **safe rather than merely
  deferred**: nothing in this stage touches the composer, and the only cross-effect makes the
  multi-tab gate *more* protective of it.
- `localDrafts.test.ts` and `chatWindowPolicy.test.ts` run clean (59 passed), unmodified.

### Escalation count: reset

Two rejections then an approval. The streak is broken, so no escalation. The pattern behind both
rejections — verifying a mechanism's components without verifying the scenario — produced one more
finding here (MAJOR 3) in the one place the repro-verification corrective does not reach: prose
reasoning that cites a scenario without naming it as a repro. **The corrective is widened
accordingly: any scenario a section's argument depends on is verified, whether or not it is
presented as a repro.**

### Next (after Gate 1)

Rev 4 folds in all four majors and nine minors. Proceeding to red tests, then implementation, then
Gate 2, per §10's staging.

### Gate 2 — implementation review (2026-09-23 to 2026-09-24)

The stage resumed after the home-screen rework (`MC-055`). Before Gate 2 the translation editor's
capture and the `MC-042` restore marker were built to `MC-068`, red tests first. Each round used a
fresh `opus-reviewer` with mutation testing.

**Round 1 — [REJECT].** The code was largely sound. Rejected on:
- comments, test names and `MC-068` describing a superseded design (a record written on open);
- age tests that never asserted the age (`createDraftContentStore` captured `Date.now` by
  reference, so fake timers never reached it);
- four surviving mutants: `edit()`'s delete, the `tr:` `baseData`, the `saveDb` sweep, and
  `floor`→`round`;
- three real minors: the age re-stamped on open; a translation save deleting the draft before
  its write settled; marker contrast on the always-light `mobilechat` bubble (about 2.6:1).

Also found: a `toEqual`-shaped test suite had led the coder to make `updatedAt` non-enumerable to
keep old assertions passing. The Orchestrator rejected that before the gate, and the assertions
were updated instead.

**Round 2 — [REJECT], substantive.** The fix for the re-stamp, specified in the Orchestrator's own
brief as "skip while the buffer equals the opening text", had no memory of intervening edits:
restore, type away, type back and unmount stored the deleted text, and going through the base text
and back lost the draft. Also found: overlapping failing translation saves switched capture off.

**Round 3 — [REJECT].** The touched-flag replacement was correct in every traced scenario. The
blocker was wording: a comment gave a round-1 reason for a branch whose real guard was the touched
reset, so trusting it would have led a maintainer to delete that reset. Also found: an overlapping
fail-then-succeed save left a stale draft that was later offered over committed text.

**Escalation to `senior-advisor`.** Root cause: capture was an `$effect` mirroring a buffer written
by both the user and the component (open, revert, the translation save's echo). An effect cannot
tell the two authors apart, and every flag added to reconstruct "did the user type" had a hole.
Direction: capture on the edit surfaces' `input` events. The premise holds by construction:
`bind:value` updates the buffer from the same event, so no user edit can change the buffer without
being captured. The advisor also diagnosed the process. Briefs specified mechanisms instead of
invariants. Comments narrated history: 44% of the lines added to `Chat.svelte` were comments.
AGENTS.md section 4 now carries both correctives.

**Round 4 — [REJECT], wording only.** Full review of the input-event capture. All five invariants
held from source. Every non-equivalent mutant was killed except one test gap: a translation read
using the message instead of the parsed key survived, because the parse mock is an identity. The
reviewer settled the premise from `svelte` 5.55.1's `bind_value`, which updates only on `input` (and
a form `reset`, not applicable here). The rejection was six comments and test titles still
describing the removed effect, flags or snapshots. The keyword grep AGENTS.md requires before a
gate missed all six, because they described the old mechanism without any trigger word.

**Round 5 — [REJECT], wording only.** One test comment still endorsed the round-2 rule ("only a
change away from the seeded text should advance it") that the code deliberately breaks. It also
found smaller comment and doc inaccuracies, all fixed.

**Live check (Orchestrator, Chrome, 2026-09-24).** §2.1's Path 1 was reproduced on the default and
`cardboard` layouts: type in the newest reply's editor, click reroll (the editor vanishes), unReroll,
reopen. The draft came back with the marker. The run also confirmed:
- Revert restored the saved text, and a reopen offered nothing.
- The age read "1분 전" at 77 seconds.
- The `cardboard` card kept its 384px height with and without the marker.
- A `mobilechat` draft survived the settings screen unmounting the chat.
- Light-surface contrast was 7.82:1.

It also found two defects, both fixed and re-measured:
- The default-surface marker was 2.72:1, below MC-068's 4.5:1. It is now 6.82:1.
- The Korean Revert label split mid-word in the narrow `mobilechat` bubble.

Not live-checked: the translation editor (it needs a configured LLM translator) and `Prereroll`
(it needs multi-candidate generations). The tests cover both.

**Round 6 — [REJECT], wording only.** A test header called every test red-before-green; four
already pass before the change and are guards. The reviewer also measured a regression from the
wrap fix itself. `break-keep` forbids breaks inside the spaceless cn and zh-Hant labels, which then
painted over the Revert button. Adding `wrap-anywhere` fixed it, and the Orchestrator re-measured it
live in four locales.

**Round 7 — [APPROVE-WITH-FINDINGS].** Its findings, all folded in before commit:
- One vacuous assertion: it read a raw fixture that Svelte's `$state` proxy never writes.
- Tests that already pass before the change and were not labelled as guards.
- A 320px squeeze. The maintainer chose to let the Revert button wrap to its own line when the
  bar is too narrow.

**Final check — [REJECT], wording only, then folded in.** A fresh `opus-reviewer` byte-verified
that only the wrap classes changed after round 7. It found:
- one guard note claiming the pre-change component never touches the local-drafts registry,
  which it does;
- four commit-message claims that were wrong or overstated.

All were fixed before commit. Its optional suggestion was also taken: `basis-28`, so the icon
stays beside the label at a 320px phone's bubble width. It was re-measured live in all seven
locales at 150–200px and full width, with no overlap or overflow.

**Follow-ups recorded, not blocking.** The upstream ones are tracked in `Agents/Roadmap.md` as CHORE-20 (`mobilechat` has no touch exit from the editor) and CHORE-21 (typing during a translation save), per `MC-069`:
- Typing during a translation save that then succeeds is overwritten by the save's echo. That is
  upstream behaviour (`c2a71c29`), and the deliberate-exit delete then removes the newer text too.
  Deleting only when the record equals the saved text would keep it.
- `saveTranslationEdit` does not check, after its await, that the same editor session is still
  open (a double-click, then a reopen before the second save settles). Suspicion only.
- `mobilechat` has no commit path for the main editor (no pencil; long-press works with a mouse
  only). This predates the stage; drafts now come back there with a marker.
- Each `Chat` instance registers its own `prefers-reduced-motion` listener; a shared module-level
  source would be cheaper on Pi and mobile.

**Escalation count.** Rounds 1 and 2 were substantive; rounds 3 to 6 were wording-only under
AGENTS.md's rule, so they neither count nor break the streak. The escalation after round 3 was
commissioned before that rule existed, and its redirect is kept on its merits.
