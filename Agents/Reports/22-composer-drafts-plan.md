# Composer drafts: per-chat unsent text, and a send that stays on its own chat

**STATUS:** open

**Status:** rev 2, 2026-09-24. **Sequenced after writer stages W0 and W1 (`MC-076`)**; rev 3 will take its
identity rule (I1) from W0 and its send-window invariants from W0's resolver. Gate 1 round 1 on
rev 1 and round 2 on rev 2 were both **[REJECT]** (section 11). Round 2 found I2 (the record is the
composer's state) sound, and every major in the send window, before generation starts. The
maintainer chose to investigate reworking the writer rather than locking switches during a send.
Sections 4 (I5, I6) and 5 (scenarios 5 to 8) wait on that decision; the rest of the plan does
not.

**Scope.** The composer stage split out of Report 20 (section 4.5; `MC-043`). The maintainer's
product decisions are `MC-072`. Evidence: investigator packet, 2026-09-24 (ledger row 157); the
Orchestrator's source check of `sendMain` (section 2.2); Gate 1 round 1 (ledger row 158).

---

## 1. What the stage must do

- **No mis-send.** Text, staged files and the input translation typed while chat A was open can
  never be sent into chat B, whether B is another character or another chat of the same
  character (including a chat created by Branch, Copy or New Chat).
- **No loss on a switch, a remount or a re-key.** Leaving chat A keeps its unsent composer state;
  returning to A shows it again, silently (`MC-072` 1). This holds when the composer component is
  destroyed and recreated in between, as it is on mobile on every switch and on desktop when
  Settings or the grid opens. A chat never seen before opens with an empty composer.
- **A send stays on the chat it started on.** The user message goes into the chat that was open
  when Send was pressed, with the text, files and translation that were in the composer then. No
  other chat's `message` array is written.
- **No double send.** Once a send has taken the composer's contents, those contents cannot
  reappear anywhere — not on return, not after a remount.
- **Late async results go to their own chat** (`MC-072` 2), never to the chat now on screen.
- **Only the composer on screen holds the multi-tab reload** (`MC-072` 3).
- Nothing about the save format, the plugin API or any persisted file changes. Composer drafts
  live in memory only, as today; a reload drops them, as today.

## 2. The loss surface

### 2.1 The mis-send (Report 20 section 4.5, re-verified at HEAD)

There is exactly one composer: `messageInput`, `messageInputTranslate` and `fileInput` are
component `$state` in `DefaultChatScreen.svelte`, which serves every theme, the mobile layout and
LiteUI. On desktop it is not unmounted on a character or chat switch. On mobile, `MobileBody`
unmounts it whenever the chat list or character settings open (`MobileSideBar > 0`) and when no
character is selected. So on mobile a switch currently **drops** the composer text rather than
mis-sending it, and on desktop it mis-sends. Nothing clears or swaps the three values on a switch.
`sendMain` reads `$selectedCharID` and the character's live `chatPage` when Send is pressed.

**Repro (desktop):** type in chat A, select chat B (another character, or another chat of the same
character), press Send. The text goes into B.

### 2.2 `sendMain` can overwrite another chat's whole history (new)

`sendMain` takes `cha = …chats[chatPage].message` near its start, then awaits
`processMultiCommand`, `runTrigger(char, 'input', …)` and `processScript(…, 'editinput')` (and a
`sleep(10)`), then writes `DBState.db.characters[selectedChar].chats[<live chatPage>].message =
cha`. `doingChat` is set only later, inside `sendChat`; `changeChatTo` and the chat-list click
handlers have no guard, and `changeChar`'s `doingChat` check is still false in this window
(Gate 1 round 1 confirmed all of this by reading).

**Repro (traced, not yet run):** a character with an `input` trigger that takes time (a Lua
trigger calling an LLM takes seconds). Type, press Send, and while the trigger runs select
another chat of the same character. Chat B's `message` array is replaced by chat A's, and the
save loop writes it.

Two further live reads in the same window: `processScript(char, messageInput, …)` reads the
composer after the trigger await, `fileInput` is inlined after the `processMultiCommand` await,
and the final clear empties whatever the composer holds by then. Once drafts are per-chat, all
three would act on chat B's draft. This stage fixes them.

**Not fixed here — `CHORE-25`:** in the same window, a trigger's `setVar` writes `scriptstate` to
the **live** selection (`triggers.ts`, the `setVar` closure and the `varChanged` block), so B's
trigger variables are replaced by A's. The same happens for output triggers during generation,
since `changeChatTo` is unguarded then too. It is a trigger-engine defect independent of the
composer, recorded as `CHORE-25` and sequenced by the maintainer as the stage after this one
(section 8).

### 2.3 Async writers with no identity check

| Writer | Writes | Can resolve after a switch |
|---|---|---|
| `updateInputTransateMessage` (both branches; the experimental-translator branch adds a 1.5 s sleep) | `messageInput` or `messageInputTranslate`, from a `.then()` | yes |
| "Post File" menu → `postChatFile` (waits on the native file picker) | appends to `fileInput` / `messageInput` | yes, for as long as the picker is open |
| `onpaste` → `FileReader.onload` → `postChatFile` | same | yes |

### 2.4 Two upstream bugs in the New Chat handlers (folded in)

Both New Chat handlers `unshift` the new chat, then address it as `chats[len]` — which after the
`unshift` is the **oldest existing chat**. For a group, each member's greeting is pushed into that
old chat. `ChatList.svelte`'s handler then calls `changeChatTo(len)`, opening the oldest chat
instead of the new one, and creates the chat with no `id`. (Upstream `main` has the same code.)
This stage edits exactly these handlers to give the chat an id (I1), so it fixes both indices too.

## 3. Identity

**The draft key is `(chaId, chat.id)`.** It is derived from the chat on screen,
`characters[selectedCharID].chats[chatPage]`, never from an index.

**I1 — every chat has an `id` before the composer keys it, and that id does not change while the
chat exists.** Round 1's blocker was that `chatWindowKey`'s per-object `WeakMap` fallback for
id-less chats is not stable: `characterFormatUpdate` fills in the id in place when the character is
clicked, and `sendChat` replaces the chat object with the trigger's structured clone after every
reply. For the window policy a re-key only moves the view. For the composer it would strand the
text under a key nothing derives again. So:
- **The creation sites that omit an id get one:** `ChatList.svelte`'s New Chat, the fallback
  chats in `characterFormatUpdate` and `createNewGroup` (and any other literal `chats: [{…}]` in
  `characters.ts` without an id — the implementer enumerates them, and the code review checks the
  list).
- **Imports never introduce a duplicate id within a character:** a JSON or HTML chat import whose
  id is missing, or already used by another chat of that character, gets a fresh one. (HTML import
  today keeps the file's id, so re-importing an exported chat creates two chats with one key.)
- Boot's `assignIds` already covers upstream saves and legacy data; nothing changes there.
- **A chat still lacking an id** (a plugin's `setChatToIndex` supplying an id-less object is the
  only known route) is keyed by the existing `WeakMap` fallback. The residual is listed in
  section 9.

With a stable id, replacing the chat object (the trigger clone, a cold-character restore, a
multiuser sync, a plugin write) keeps the key, and the draft stays put.

A JSON/HTML import `unshift`s without `changeChatTo`, so the chat on screen genuinely changes
under the user. The composer follows the chat, which is correct; A's draft stays under A's key.

## 4. Invariants (normative)

### Why the mechanism changed

Rev 1 kept the three values as component `$state` and copied them in and out of a store at a
switch ("flush under the remembered key, then load"). Round 1 showed that design has three holes
the switch step cannot see: a re-key without a switch (above), a remount (the component and its
remembered key are destroyed; on mobile this happens on every switch), and a store record that
outlives the send that consumed it (A→B→A leaves A's record stored; Send clears only the live
buffer; a remount then reloads the sent text, which can be sent again). Each hole comes from
having **two copies** of the draft — the buffer and the record — and a step that must keep them
in sync.

**I2 — The per-chat record *is* the composer's state.** There is one copy. The composer reads
and writes the three values directly on the record for the current key; a switch changes which
record it shows, and nothing is copied. A remount shows whatever the record holds. The records
live outside the component (module level), so they survive its destruction.

**I3 — The three values move together.** `messageInput`, `messageInputTranslate` and `fileInput`
belong to one record. A record whose three values are all empty is not kept (it may be dropped
when it becomes empty or when its key leaves the screen — implementer's choice, but an empty
record never counts for anything).

**I4 — Showing a record is not writing one.** Switching to a chat, remounting, or re-deriving the
key never creates, modifies or re-timestamps a record. Only a write to one of the three values
does.

**I5 — A send is bound to its origin record.** At Send, `sendMain` captures the character, the
chat's key and the **record** — and reads the text, files and translation from that record at
that moment. Every later step uses the captures: the command, trigger and script calls, the file
inlining, the write-back and the clear.
- **Write-back** resolves the target chat **by key inside the captured character at write time**
  (so a chat object replaced mid-send by a trigger clone, a multiuser sync or a plugin still
  receives the message). If no chat with that key exists any more, the send writes nothing,
  alerts, and leaves the record as it is (round 1, MAJOR 3).
- **Clear** acts on the captured record, wherever it is shown. If the record still holds exactly
  what was captured, it is emptied. If the user has added to it since (they went back to A
  mid-send and typed), only the captured text is removed when the record's text still starts with
  it; otherwise the record is left untouched. Either way, text the send took cannot survive to be
  sent again, and text the send did not take is not destroyed.

**I6 — Generation does not run against a different chat.** If the chat on screen has a different
key by the time `sendMain` would call `sendChatMain`, the send stops after writing the user
message into its origin chat. The user can continue or reroll from that chat. Round 1 confirmed
this strands no one (empty-composer sends, groups, `sendContinue`, the A→B→A return).

**I7 — Late results follow their origin record.** Each async writer in section 2.3 captures the
record (or key) when it starts, and writes to that record when it resolves, whether or not it is
on screen:
- **File or pasted image:** appended to the origin record.
- **Translation:** written to the origin record's derived field **only if** its source field still
  holds exactly the text that was translated; otherwise discarded. Because the result goes to the
  origin record whether or not it is on screen, a translation that finishes after a switch is not
  lost, and the derived field is not left stale (round 1, MINOR 6: in reverse mode `sendMain`
  sends the derived `messageInput`).

**I8 — Liveness unchanged.** The existing `COMPOSER_DRAFT_KIND` registration (one per mounted
composer, present while the **record on screen** is non-empty) behaves as today. Records not on
screen register nothing: they never reach `hasLocalDrafts()`, `hasMessageEditorDrafts()`, the
window policy or the multi-tab gate, and they do not go through `draftContentOrphanGate`
(`MC-072` 3; Report 20 section 3.1's premise).

**I9 — Bounded.** Stored records are capped (non-normative: the same order as
`DRAFT_CONTENT_RECORD_LIMIT`, least recently written evicted first), and the record on screen is
never evicted. A record for a deleted chat is never shown again and ages out under the cap.

**I10 — Existing exits kept.**
- The cold-storage guard at the top of `sendMain` still returns without clearing.
- A recognised `/` command still clears, under I5's clear rule.
- A failed send still does not restore the text, as today.

**Mechanism (non-normative).** A module (for example `src/ts/composerDrafts.svelte.ts`) holding a
map from key to a reactive record, a `getOrCreate(key)`/`peek(key)` pair, the clear rule, the cap,
and the late-result routing, unit-testable without mounting `DefaultChatScreen`. The component
derives the key and binds its inputs to the record's fields. **Hazards for the implementer:** a
record must not be created inside a `$derived` or the template if that writes reactive state
(Svelte 5's `state_unsafe_mutation`), and I4 forbids creating a record merely to show it — a
`peek` that returns an empty, un-stored view until the first write satisfies both. `MC-043`'s
"generation token" is met by capturing the record and I7's source-text check.

## 5. Acceptance scenarios (each becomes a test; red first where the bug exists today)

1. **Switch:** type in A, switch to B (another character; and separately another chat of the same
   character): B's composer is empty; Send from B carries nothing from A; back in A, A's text is
   there.
2. **Return to origin:** A → B → A without typing in B: A's text is there, and no record exists
   for B.
3. **Branch / Copy / New Chat:** type in A, then Branch (and separately Copy, and each New Chat
   button): the new chat's composer is empty and A keeps the text.
4. **All three values:** stage a file and a translation in A, switch away and back: all three are
   there. Send from B: A's file is still staged in A only.
5. **Mid-send switch (section 2.2):** with a slow `input` trigger, press Send in A and switch to B
   (same character) before the trigger resolves. A gains the user message with A's text; B's
   `message` array is unchanged in content and identity; B's composer shows B's own draft; A's
   record is empty; `sendChatMain` is not called. **Must fail against HEAD.**
6. **Mid-send, no switch:** today's behaviour: the message is pushed, the composer is cleared, and
   `sendChatMain` runs.
7. **Mid-send, return and type:** Send in A, switch to B and back to A during the trigger, type
   " more": after the send, A's composer holds " more" (and not the sent text).
8. **Mid-send, chat object replaced:** during the trigger, replace A's chat object with a clone
   (same id): the message lands in the chat object now in the array.
9. **Remount:** type in A, unmount and remount the composer (mobile chat list; desktop Settings):
   A's text is there. Send in A after an A → B → A round trip, then remount: the sent text does
   **not** come back.
10. **Re-key without a switch:** a chat created by `ChatList`'s New Chat, typed into, then its
    character clicked again (`characterFormatUpdate`), and separately a completed reply whose
    output trigger replaces the chat object: the text stays in the composer.
11. **Late file / paste:** start in A, switch to B, resolve: B unchanged; back in A the file is
    staged.
12. **Late translation:** start in A, switch to B, resolve: B unchanged, A's derived field holds
    the result. With the source edited before it resolves: discarded.
13. **Liveness:** text stored for A, nothing in B on screen: `hasLocalDrafts()` is false; text on
    screen: true, as today. A stored record never makes `hasMessageEditorDrafts()` true.
14. **Showing is not writing:** switching to a chat with no record and back creates no record;
    switching to a chat with a record does not alter or re-timestamp it.
15. **Cap:** past the cap the least recently written record goes, never the one on screen.
16. **Cold-storage guard:** Send in a cold chat alerts and leaves the composer untouched.
17. **Ids:** every creation site in I1 yields a chat with an id; a JSON/HTML import of a chat whose
    id collides with an existing chat of that character gets a fresh id; an import with a unique
    id keeps it.
18. **New Chat (section 2.4):** for a group, the greetings land in the new chat and no existing
    chat's `message` changes; `ChatList`'s New Chat opens the new chat.

## 6. Compatibility

- **Save format, plugin API, CBS, Lua and triggers: untouched.** No plugin API reads or writes the
  composer; no CBS tag or script hook touches `messageInput` (grep of `src/ts/plugins`, `cbs.ts`,
  `scriptings.ts`; round 1 re-checked). Lua chat APIs act on the trigger's cloned chat.
- **Chat ids:** adding an `id` at creation matches what boot's `assignIds` and
  `characterFormatUpdate` already do to every chat, so every saved chat already carries one after
  a reload; upstream builds read and write the field. Giving an imported chat a fresh id only when
  it would collide changes nothing an upstream build relies on.
- **Triggers:** `runTrigger(char, 'input', …)` receives the same chat as today in the no-switch
  case. In the switch case it received the origin chat's messages; its `setVar` writes are
  `CHORE-25`'s, not fixed here (section 2.2).
- **Theme and layout:** one component. A `customHTML` layout's composer bindings go through the
  same component; the code review checks them rather than this plan assuming.

## 7. Tests

- Unit tests for the module in section 4 cover scenarios 2, 4, 11 to 15 at the seam.
- `sendMain` and the remount cases are in-component. Scenarios 1, 5 to 10 and 16 use a mount
  harness for `DefaultChatScreen` on the pattern of `Chat.messageEditor.svelte.test.ts` (round 1:
  a test of a not-yet-extracted helper fails on import at HEAD, which proves nothing). **Scenarios
  1 and 5 must fail against HEAD for the stated reason** (text in B; B's array replaced and
  `sendChatMain` called), recorded before the fix.
- Scenarios 17 and 18 test the creation and import sites directly.
- `localDrafts.test.ts` passes unmodified (I8).

## 8. Next stage: `CHORE-25`

A trigger's `setVar` (and the `varChanged` block after the trigger) writes `scriptstate` to the
chat on screen rather than the chat the trigger ran for. Any chat switch while a trigger runs —
the `input` trigger in `sendMain`'s window, or an `output` trigger during generation, since
`changeChatTo` is unguarded — replaces the new chat's trigger variables with the old chat's, and
the save loop writes them. The maintainer has sequenced it as the stage right after this one,
before `updateInlayScreen` (2026-09-24).

## 9. Accepted limitations

- Composer drafts do not survive a reload, as today (`MC-072` 3's reasoning).
- A multi-tab reload drops stored drafts for chats not on screen (`MC-072` 3).
- A chat that reaches the database with no id through a plugin's `setChatToIndex` is keyed by the
  per-object fallback; if that object is then replaced, its draft is stranded (not sent anywhere
  wrong).
- `sendPofile` (the `.po` "Post File" path in `multisend.ts`) pushes into the chat on screen and
  calls `sendChat` directly; a switch while its picker is open still sends into the new chat.
  `MC-072` 2 is met for staged files and pasted images, not for this path.
- A `/` command acts on whatever its own code reads when it runs; only the composer text passed to
  it and the clear are bound (I5).
- `sendChat`'s own reads of the selection once it starts are out of scope; I6 stops the send
  before it can start on a different chat.
- A failed send still does not restore the composer text.
- Trigger variables in a mid-send switch: `CHORE-25` (section 8).

## 10. Claims not independently re-verified

- The plugin sandbox's DOM layer was checked by grep only (section 6).
- Section 2.2's repro is traced from source by two independent reads, not yet run. Scenario 5's
  red test is its verification.

## 11. Gate record

### Gate 1 round 1 — `opus-reviewer` (fresh), rev 1 — **[REJECT]**

- **BLOCKER 1:** the `WeakMap` key for an id-less chat changes on `characterFormatUpdate`'s id
  fill-in and on `sendChat`'s trigger-clone replacement; rev 1's flush-at-switch filed the text
  under a dead key. → Section 3's I1 (ids at every creation site; no duplicate ids on import).
- **MAJOR 2:** unmount/remount was undefined; `DefaultChatScreen` unmounts on every mobile switch
  and on desktop Settings/grid; A→B→A then Send then a remount resurrected the sent text. →
  I2 (one copy; the record is the state) and I5's clear rule; scenario 9.
- **MAJOR 3:** writing to the captured chat object misses a replacement mid-send. → I5 resolves
  the target by key at write time; scenario 8.
- **MAJOR 4:** trigger `setVar` writes `scriptstate` to the live selection; rev 1's section 6 was
  misleading. → Stated in section 2.2; `CHORE-25`; section 8.
- **MINORs:** capture all three values at Send (I5); discarding a late translation left the
  derived field stale (I7); `sendPofile` not covered (section 9); duplicate ids on HTML import
  (I1, scenario 17); helper-first red tests prove nothing (section 7); missing scenarios (7 to 10,
  17); cold storage's `preLoadChat` does not replace the chat object — the replacement is the
  cold-character restore in `changeChar` (section 3 corrected).
- **Confirmed sound by round 1:** section 2.2 is real; Branch/Copy's same-tick switch is safe; I7
  (now I8) and `MC-072` 3 hold; I5 (now I6) strands no one; no plugin/CBS/Lua exposure.
- **Escalation count:** 1 substantive rejection.

### Gate 1 round 2 — `opus-reviewer` (fresh), rev 2 — **[REJECT]**

Orchestrator re-checked M1, M2, M4 and M5 in source before acting on them.

- **Sound:** I2 in Svelte 5.55.1: function bindings plus an un-stored `peek` view satisfy I4 and
  avoid `state_unsafe_mutation`. Also sound: every remount path (MobileBody, waifu/standard theme,
  LiteMain, Settings/grid); section 2.4's two bugs, and folding them in; id stability across
  multiuser, Branch, Copy and `/setvar`; scenarios 1 and 5 fail at HEAD.
- **M1:** trigger v2 effects (`v2SetCharacterDesc`, `v2SetReplaceGlobalNote`, the lorebook
  effects) call `setCurrentCharacter(clone)`, which replaces the **live selected** character's
  slot. A captured character object then goes stale, so write-back must resolve the character by
  `chaId`.
- **M2:** `sendChatMain` clears `messageInput` itself; it is shared with reroll (Ctrl+M) and auto
  mode, so it would empty whichever record is on screen. At HEAD, Ctrl+M already wipes a typed
  draft.
- **M3:** I5's clear rule contradicts its own guarantee; files can be sent twice; a second Enter
  during the trigger window captures the same record again.
- **M4:** I1's residual list is wrong. The prev/next-character hotkeys call `selectedCharID.set`
  directly, skipping `changeChar` (and `characterFormatUpdate`, the cold restore and the
  `doingChat` guard). `characterCards.ts` creates id-less chats. Plugin v2 `setChar` and v3
  `setCharacterToIndex` can install them.
- **M5:** the loss in the send window is a whole character, not only trigger variables: an input
  trigger `[v2Wait; v2SetCharacterDesc]` plus a character switch overwrites character B with A's
  clone. The same can happen during generation through the hotkeys.
- **MINORs:** a restored draft keeps the old textarea height, so it is clipped; late writers must
  capture the key, not the record; `sleep(10)` is after the write-back; MC-043's
  flush-then-restore ordering is superseded by I2; label the scenarios that pass at HEAD.
- **Chore candidate:** a hotkey switch onto a cold-storage placeholder character skips the
  restore (inferred).
- **Escalation count:** 2 consecutive substantive rejections. At the second rejection the
  Orchestrator asked whether the mechanism was the problem. It was: making the send window
  survive a switch means binding every writer in the trigger engine. The Orchestrator offered a
  switch lock; the maintainer chose to investigate a writer rework instead (`MC-073`).
