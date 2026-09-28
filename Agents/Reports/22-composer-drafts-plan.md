# Composer drafts: per-chat unsent text, and a send that stays on its own chat

**STATUS:** implemented (`b05231c6`, `1bc5f288`, `67f17f1a`) — S0, S1 and S2 shipped

**Status:** rev 8.2, 2026-09-28. **The composer stage is done:** S0 `b05231c6`, S1 `1bc5f288`
and S2 `67f17f1a` (section 11). Section 7 is S2's accepted plan. Sections 3 to 6 and 8 are S1's.

Rev 1 to rev 6 were rejected on substance. After rev 3, `senior-advisor` set the direction (ledger
row 274). Rounds 4 to 6 found that direction sound, and rejected rules added to handle text typed
during a send's wait. The maintainer then chose to lock the composer during that wait (`MC-100`),
which removes those rules (section 11).

**Maintainer decisions:**
- `MC-072`: the product decisions;
- `MC-073`: no switch lock;
- `MC-075`: `/` commands are W3's, and a write to a gone origin drops silently;
- `MC-076`: the order;
- `MC-078`: an ambiguous target is never guessed;
- `MC-089` and `MC-091`;
- `MC-094` and `MC-095`;
- `MC-097`: generation is W2's, and the composer empties at Send;
- `MC-098`: busy until generation starts, and `sendPofile` is W2/W3's;
- `MC-099`: the busy button cancels a send that has not reached generation;
- `MC-100`: the composer is locked from Send until generation starts, and the reroll history stays
  per composer (its cross-chat bug is `CHORE-43`);
- `MC-102`: S2's lock stays global, and two chats holding one id share one draft.

**Evidence:**
- ledger row 272 (re-scoping);
- row 273 (Gate 1 round 3);
- row 274 (`senior-advisor`);
- row 275 (Gate 1 round 4);
- row 276 (Gate 1 round 5);
- row 277 (Gate 1 round 6).

---

## 1. The stage's shape

The stage's goal is unchanged from rev 3:
- no mis-send;
- no loss on a switch, a remount or a re-key;
- a send's message stays on its own chat, and no two chats share one array;
- no double send;
- reroll and auto mode leave the composer alone;
- late results go to their own chat;
- only the composer on screen, or a send in flight, holds the multi-tab reload;
- the hotkeys switch like a click;
- no format or plugin API change.

The stage is delivered in three items, in this order (an `MC-091` amendment; section 11):

| Item | Scope | Gate |
|---|---|---|
| **S0** | `prevChar`/`nextChar` go through `changeChar`; the bounds are fixed; from Home, `nextChar` opens the first character in name order and `prevChar` the last | carve-out: red tests, then the fix, then the post-implementation review |
| **S1** | The composer's actions (Send, Continue, reroll, unreroll, auto mode) move into a `.ts` seam. Send becomes an ownership transfer with one window, a pre-generation cancel, and every branch bound to the origin | this rev |
| **S2** | Per-chat records, the id fill at the first write, the late writers, on-screen liveness, the cap, the remount paths, the textarea height, and the mount harness | its own plan and Gate 1, after S1 |

**Why S1 comes before S2.** With per-chat records but the current send, a live read after the
`/` command's await would fetch B's draft and append it to A. Nothing ships between the stages
(`MC-089`).

**What S1 does not do:**
- per-chat drafts: H1 is still the one shared composer;
- generation's own reads after a mid-send switch (`MC-097` 1);
- `/` commands' own reads (`MC-075` 1);
- `sendPofile` (`MC-098` 2);
- generation starters outside the composer (section 8).

## 2. S1's loss surface at `688b13e8`

The code under `src/` is identical to `790643ff`.

| Item | Where |
|---|---|
| **Double send.** `sendMain`'s `$doingChat` check runs once, before the awaits; `doingChat` is set only in `sendChatBody`. A second Enter during the input trigger re-reads the same text | `sendMain` (`DefaultChatScreen.svelte`), `sendChatBody` (`index.svelte.ts`) |
| **Reroll, unreroll or auto mode during a send.** They pass their `$doingChat` check. A reroll trims the chat and starts generation; the send then appends into that chat mid-generation, its own hand-off is refused, and its `sendChatMain` clears `doingChat` under the running reroll | `reroll`, `unReroll`, `runAutoMode`, `sendChatMain` |
| **The `sleep(10)` gap.** Each send sleeps 10 ms after its append. With two sends, the first reaches `sendChatMain` first; the second is refused by `sendChat`'s `isDoing` check, and the second's `sendChatMain` then sets `$doingChat = false` under the first's generation | `sendMain`, `sendChatMain` |
| **A second composer during a send.** On mobile a switch remounts the composer. A Send from the new instance during A's wait races the same way | `MobileBody.svelte`, `sendChatMain` |
| **The write-back after a `/` command's await.** `cha` is captured as the live array before the await, and `messageInput` and `fileInput` are re-read live after it. If no command handles the text, and either the composer was emptied during the await (the empty branch, any character type) or the send is in a group, `chats[<live chatPage>].message = cha` runs. After a switch to another chat of the same owner during the await, two chats share one array. It needs a command that awaits: `/test_lorebook`, `/multisend`, `/input`, `/buttons`, or `/speak` for a character (`/speak` returns at once for a group) | `sendMain` |
| **Frozen index.** `selectedChar` is held as a `characters` index across that await and passed to `sendCharacterMessage`. A permanent delete at a lower index names another character (traced, not run) | `sendMain`, `sendCharacterMessage.ts` |
| **Reroll and auto mode clear the composer** | `sendChatMain`'s `messageInput = ''` |
| **Reroll bookkeeping is not tied to a chat.** `rerolls`/`rerollid` reset only when `lastCharId` (a `characters` index) differs, or after an append. Reroll in chat A, switch to chat B of the same character, then reroll and unreroll: A's reply objects are written over B's last message. On desktop this is reachable within one component instance; on mobile the remount resets it. **Not S1: `CHORE-43` (`MC-100` 2)** | `reroll`, `unReroll`, `sendMain` |
| **No cancel before generation.** The busy button calls `abortChat`, which aborts only the controller `sendChatMain` creates | `abortChat`, `sendChatMain` |
| **Work registration.** Only the character branch calls `beginWork`, so `isWriting` misses the other branches. It has no non-test caller yet; W2 wires the delete warning to it | `sendCharacterMessage.ts`, `chatOrigin.ts` |

## 3. S1 invariants (normative)

**The holders.** At every instant, each taken value is in exactly one of these holders:
- **H1, the composer.** In S1: the component's `messageInput`, `messageInputTranslate` and
  `fileInput`, reached through a source the component supplies. In S2: the per-chat record.
- **H2, the in-flight slot.**
  - It is module-level, survives a remount, and is never shown.
  - While it holds anything, it registers one `COMPOSER_DRAFT_KIND` draft under its own key.
- **H3, the chat's message array,** reached only through the send's origin.

The seam never keeps a taken value in a local, a closure or an argument that outlives an await,
except as a copy passed to a hook while H2 still holds the original.

**I-S1 — Accept or refuse before anything moves.**
- **A Send or Continue is refused, and nothing is taken, when:**
  - the chat is cold (the existing guard and alert);
  - `doingChat` is set;
  - the window is open (I-S3);
  - `beginWork` refuses the origin.
- **Otherwise, in one synchronous step:**
  - `beginWork` captures the origin (owner `chaId` and chat id);
  - the send's own abort controller is created;
  - H1's three values move to H2, leaving H1 empty;
  - the window opens.

**I-S2 — Each value leaves H2 exactly once.**
- **Append.** The message is built from H2's values, with the files inlined into the text as
  today. H2 is emptied at the push, in the same synchronous stretch, including the
  ambiguous-origin push onto the held chat object.
- **Handled `/` command.** The text is consumed. The staged files and the translation go back to
  H1, as at `790643ff`.
- **Every other exit without an append goes back to H1:** a gone origin, a throw from anywhere
  in the send, a cancel (I-S8), and a refused append.
- **The put-back rule.** Because of I-S10, H1 at a put-back holds nothing typed. It holds at most
  the late results of a file operation (paste, Post File) that started before the take.
  - Each text field becomes the taken value followed directly by H1's value, which is what a late
    result's own append produces.
  - The taken files go in front of H1's.
  - The taken values are the originals: the text before `{{inlayed::}}` inlining, and the files.
  - Nothing is re-derived.
  - Afterwards, the input is resized, as typing does.
- **A translation result is written only while its source is unchanged.** Both translation paths
  (`updateInputTransateMessage`, forward and reverse) capture the source field's text when they
  start. When they resolve, they write the derived field only if the source field still holds
  exactly that text; otherwise the result is discarded. So neither a translation in flight at the
  take nor one started during the wait can overwrite a put-back.
- **One outermost `try/finally`** owns all of this. The plan states that rule, not a list of
  exits.

**I-S3 — One composer action at a time.**
- **The window** is module-level and global: one for every chat and composer instance. It opens
  at a Send's or Continue's take, or at the start of a reroll, unreroll or auto mode. It closes
  in that action's outermost `finally`, after its generation hand-off has returned. For auto mode,
  that is when the loop ends.
- **While it is open,** Send, Continue, reroll, unreroll and starting auto mode are refused
  silently, and a refused action changes nothing. Switching chats or characters is not refused
  (`MC-073`).
- **Stopping auto mode is never refused.** Neither is the busy button's abort.
- **It is not `doingChat`.** `changeChar` refuses on `doingChat`, so building the window on it
  would make the switch lock `MC-073` rejected.
- **A `finally` acts only on its own action.** A cancelled send's `finally`, running late when its
  stalled await settles, never closes a newer window, empties a newer slot or puts anything back
  a second time.

**I-S4 — Every branch appends through the origin captured at the take.**
- This covers the character branch (as in W1a), the group branch and the `*says nothing*` push.
- After any await, the send never addresses by `$selectedCharID`, `chatPage`, a `characters`
  index or a message array captured before the await, and never reads H1.
- **An ambiguous origin** appends to the chat object held since the take, as W1a decided (row 259,
  N2).
- **A gone origin** appends nothing.

**I-S5 — Busy (`MC-098` 1).** The Send button shows its existing busy state while the window is
open or `doingChat` is set.

**I-S6 — Only a take empties the composer.** Generation, reroll, unreroll and auto mode never write
H1.

**I-S7 — The work registration ends with its action.** `beginWork`'s handle is ended in the
outermost `finally`, on every exit.

**I-S8 — Cancel before generation (`MC-099`).**
- Clicking the busy button before the append aborts the send. H2 goes back to H1 (I-S2), the
  handle ends, and the window closes at once.
- An aborted send never appends and never starts generation, even when its stalled await settles
  later. The check reads **that send's own** controller, not whichever action is current, and runs
  at the push, in the same synchronous stretch.
- Writes the input trigger has made stay (`MC-094`).
- After the append, the button aborts generation, as today.

**I-S9 — Reroll bookkeeping stays with its composer instance (`MC-100` 2).** The reroll history
(`rerolls`, `rerollid`, `lastCharId`) is held per composer instance, reached through the source,
and behaves exactly as at `790643ff`, including the reset a remount gives it. The module's
actions read and write it only through the source. Its cross-chat defect is `CHORE-43`.

**I-S10 — The composer is locked from the take until generation starts (`MC-100` 1).**
- **When:** from a Send's or Continue's take, until its hand-off to generation or its put-back.
- **What is locked:**
  - both text fields are read-only;
  - paste, Post File, stickers and suggestions add nothing;
  - the Send button shows busy, and its click cancels (I-S5, I-S8).
- **What still happens:**
  - late results of a file operation started before the take land in H1;
  - switching chats and characters is not refused (`MC-073`).
- **Where it lives:** the lock is module state, so it holds in every composer instance and
  survives a remount.
- **When it ends:** at the hand-off, meaning the moment before the generation callback is called.
  It also ends in the outermost `finally` on every exit, so no path leaves it set. Input is open
  again while generation runs, as at `790643ff`; the window (I-S3) still refuses the composer's
  actions until generation returns.

**Mechanism (non-normative).**
- A module such as `src/ts/process/composerActions.svelte.ts` holds:
  - H2 and the window (reactive, for I-S5);
  - the current action's abort controller;
  - the lock (reactive, for I-S10);
  - one function per action: `send(continue)`, `reroll`, `unreroll`, `toggleAutoMode`, `abort`.
- The component calls them one-to-one, and supplies:
  - a source with live accessors (`get`/`set` for each of the three fields, and for the reroll
    bookkeeping);
  - the translation call;
  - the input resize.
- `sendCharacterMessage` takes the origin's handle and an append callback, and no longer calls
  `beginWork` itself.
- **Order of work:**
  1. Move the actions' current logic into the module **with no behaviour change**. The source's
     live accessors let the moved code read `messageInput` and `fileInput` after the `/` await
     exactly as it does now. The suite stays at its baseline.
  2. Write the red tests against that module.
  3. Fix.
- **The component binds the lock** to both textareas' `readonly` and to its input handlers.

## 4. S1 acceptance scenarios

Every scenario is a test on the module, with an in-memory source.
- **Red:** fails against the behaviour-preserving move on an assertion.
- **Guard:** passes before and after.

1. **Double send** (red): Send in A with a slow input trigger. During the wait, Send again and,
   separately, Continue.
   - Exactly one message, with A's text, is appended, and generation starts once.
   - After generation returns, Send works.
2. **Other actions during a send** (red): during A's wait, reroll, unreroll and starting auto mode
   each change nothing. The chat is not trimmed, and no generation starts. While auto mode runs,
   Send is refused, and toggling auto mode off stops it after the current tick (guard).
3. **The `sleep(10)` gap** (red): a Send between the append and the hand-off is refused.
4. **A second source** (red): during A's wait, a Send through a different source (a remounted
   composer) is refused and takes nothing.
5. **Busy** (red): the busy state is true from the take until generation returns, and false after
   every exit in scenarios 6 to 9.
6. **A throw before the append.** Separately: the input trigger throws; a plugin `editinput` hook
   rejects; `processMultiCommand` throws.
   - Nothing is appended.
   - The three original values are back: the text un-inlined and the files staged.
   - The window and the lock are closed, and `isWriting` is false.
   - This is a guard for the text and the closed window: at `790643ff` the clear follows the
     append. It is red for the files when the trigger or the hook throws, since the move inlines
     them before the trigger. When `processMultiCommand` throws, the files are not yet inlined, so
     that half is a guard.
7. **Gone origin:** delete the origin chat during the wait. Nothing is appended, the values go
   back, and the window is closed. For a character, the wait is the input trigger; this half is a
   guard (W1a returns false). For a group, which runs no input trigger, the wait is a slow `/`
   command that no command handles; this half is red.
8. **Handled `/` command** (guard): the text is consumed, and the staged files and translation
   remain.
9. **Cancel before generation** (red): Send with a trigger that never settles, then abort.
   - The values are back, and the window is closed.
   - Then a new Send, with its own controller, is started, and after that the old trigger
     resolves. The old send appends nothing and starts no generation, and the new send is not
     disturbed by the old send's late `finally`.
10. **In-flight liveness** (red): during the wait, with the composer empty, `hasLocalDrafts()` is
    true and `getMultiTabAction` for a clean tab returns `'stay'`. After the append, only H1's own
    registration counts.
11. **Write-back after a `/` await** (red), each with a switch to another chat of the same owner
    during a slow first command:
    - a group send;
    - a character send whose composer is emptied during the await.
    The origin chat gains the message where one is due. The other chat's array is unchanged in
    content and identity, and is not the origin's array.
12. **Frozen index** (red): during a slow `/` command's await, a character at a lower index is
    permanently deleted. The message lands in the origin character's chat, found by `chaId`.
13. **Reroll and auto mode keep the composer** (red): with text typed, a reroll and one auto-mode
    tick leave it in place.
14. **The lock** (red, on the lock flag; the component's enforcement is in the live check):
    - The lock flag is set from the take until the hand-off. It is cleared at the hand-off, after
      a cancel, after a throw, and after every other exit.
    - The flag is module-level: a second source created during the wait sees it set.
    - A late **text** result (a text file from Post File or a paste) from an operation started
      before Send, which resolves during the wait, is in the composer after a successful send.
      This half is red: at `790643ff` the clears in `sendMain` and `sendChatMain` drop it.
    - A late **asset** result from such an operation is in the composer after the send too. This
      half is a guard: at `790643ff`, `fileInput` is emptied before the trigger's await and never
      again.
    - After a cancel, late results follow the restored values.
15. **A translation in flight at the take** (guard, on the source-equality rule): with
    translate-input on, Send while a translation of the text is still in flight.
    - If it resolves during the wait and the send is then cancelled, both fields hold exactly the
      taken values, with no duplicate.
    - If it resolves after the cancel, the derived field holds the fresh translation, with no
      duplicate.
16. **No switch** (guard): the message is appended, the composer is empty, generation runs once,
    and the window closes after it.
17. **Refused actions change nothing** (guard, and red for the window): a cold chat, `doingChat`,
    an open window and a `beginWork` refusal each leave the composer and the chat unchanged.

## 5. Compatibility

- **No change to** the save format, the plugin API, CBS, Lua or triggers.
- **Plugin `editinput` hooks** receive the text they received at `790643ff` in the no-switch case.
- **A legacy plugin that reads the textarea's DOM** during an `editinput` hook now sees it empty.
  No plugin API exposes the composer, and hooks receive the text as their argument.
- **The busy state** is the existing Send-button swap.
- **Translation results** are discarded when their source changed before they resolved. At
  `790643ff`, a stale result overwrote the derived field.
- **Every theme, the mobile layout and customHTML** use the same `DefaultChatScreen`.

## 6. Tests and checks

- **The module suite** carries scenarios 1 to 17, on the pattern of
  `sendCharacterMessage.svelte.test.ts` (real `runTrigger` and `processScript`, network mocked).
- **The component** keeps no action logic; its wiring (a button or key to a module function) is
  checked by review and the live check.
- **Red evidence:** each red scenario's failure against the behaviour-preserving move is recorded,
  with its reason, in the gate record.
- **Guards:** the existing `sendCharacterMessage.svelte.test.ts` and `localDrafts.test.ts`, updated
  only where signatures change.
- **Checks:** the Orchestrator runs the full suite, `pnpm check` and `pnpm run build` on the final
  snapshot.
- **Live check** on a production build with Echo:
  - a slow Lua input trigger with a second Send, a reroll, and a cancel;
  - the busy state;
  - a switch during the wait;
  - **the lock:** during a slow trigger, typing in both fields, an image paste, Post File, a sticker
    and a suggestion click all add nothing. A remount during the wait (Settings, or the mobile chat
    list) shows a locked composer. Input works again once generation starts, and after a cancel;
  - **Enter with a Korean IME in Chrome.** The main textarea checks `!e.isComposing`, and the
    translate-input textarea does not. WebKit's composition ordering cannot be checked here; that
    stays listed in section 9.

## 7. S2 — per-chat drafts (rev 8.2, normative; implemented in `67f17f1a`)

**Base:** `2177f7d2`. S0 (`b05231c6`) and S1 (`1bc5f288`) are in. Scoping packet: ledger row 291.
**Decisions:** `MC-072`, `MC-073`, `MC-075`, `MC-078`, `MC-089`, `MC-091`, `MC-097` to `MC-100`,
and `MC-102` (the lock stays global; two chats holding one id share one draft).

### 7.1 Scope

**S2 delivers:**
- per-chat composer records at module level, which become H1;
- the id fill at the first write;
- put-backs to the origin's record, which removes S1's interim limits (section 8);
- late writers bound to the record they started in (`MC-072` 2);
- on-screen liveness (`MC-072` 3), the cap and the textarea height;
- a `DefaultChatScreen` mount harness;
- **`CHORE-44`, folded in** (an `MC-091` amendment):
  - **The failures:**
    - after a remount, auto mode cannot be stopped from the composer on screen, and its loop keeps
      generating until the selected character changes;
    - after a remount, the busy button cannot abort a generation that is already running. The
      controller it aborts is the clicked instance's own, which is `null` in a new instance
      (Gate 1 round 1's probe, run against `2177f7d2`). That breaks I-S8's last bullet
      (`MC-099`) across a remount.
  - **The shared cause:** composer state held per component instance, which a remount resets.
    S2 moves the composer's values out of the instance for the same reason.
  - **The smallest correction:** auto mode's running state and the current action's generation
    controller become module state, beside S1's window.

**S2 does not do:**
- the reroll history (`MC-100` 2, `CHORE-43`);
- generation after a mid-send switch (`MC-097` 1, W2);
- `sendPofile` (`MC-098` 2);
- `/` commands' own reads (`MC-075` 1, W3);
- persistence: drafts stay in memory, as today.

### 7.2 The loss surface at `2177f7d2`

| Item | Where |
|---|---|
| **One composer for every chat.** `messageInput`, `messageInputTranslate` and `fileInput` are component `$state`. On desktop, text typed in A shows in B and a Send there sends it into B. On mobile, and on desktop through Settings, the grid or a theme change, a remount drops it | `DefaultChatScreen.svelte`; mounted through `ChatScreen.svelte` from `App.svelte` and `MobileBody.svelte` |
| **A put-back goes to the sending instance** (`record.source`). After a remount it lands in the unmounted instance and is lost. After a switch it shows in the chat now on screen | `sendMain`'s `finally` and `abortChat` in `composerActions.svelte.ts` |
| **Late writers write the instance's live fields.** A paste or Post File that resolves after a switch lands in the chat on screen. The translation paths compare and write the live fields | `DefaultChatScreen.svelte`'s `onpaste` and Post File handlers; `updateInputTransateMessage` |
| **Auto mode and the generation's abort controller are per instance** (`CHORE-44`) | `autoMode` and `abortController` in `DefaultChatScreen.svelte`; `runAutoMode`, `sendChatMain` and `abortChat` |

### 7.3 Invariants

S1's I-S1 to I-S10 stay in force. H1 is now the origin's per-chat record.

**D1. The per-chat record is the composer's state.**
- Records live at module level. Each holds the three values.
- The composer on screen reads and writes the record for the on-screen key directly: one copy,
  with no mirror in the component.
- A switch changes which record is shown, and nothing is copied. A remount shows whatever the
  record holds.
- The three values belong to one record. A record whose three values are all empty is dropped
  at once, so it never counts toward the cap (D8) and never outlives the write that emptied it.

**D2. The key.**
- The key is the owner's `chaId` plus `chat.id` for the chat on screen,
  `characters[selectedCharID].chats[chatPage]`.
- It never contains an index or an object identity.
- It is **not** `chatWindowKey`: that helper falls back to a per-object `WeakMap` key for an
  id-less chat, which is the alias rev 1 was rejected for.
- **With no chat object on screen** (Home, an out-of-range `chatPage`), there is no record, and
  nothing is shown or written.
- **Two chats of one owner holding one id** share one record (`MC-102` 2). By the same reasoning,
  two owners holding one `chaId` share the records of chats whose ids also match.
- **A chat object replaced by one with the same id** (a cold restore, a plugin write, Lua
  `setFullChat`) keeps its record.

**D3. Ids are filled at the first write, never by showing.**
- **When:** a write to the on-screen chat while its owner's `chaId` or its `chat.id` is missing.
- **How:** first fill the ids through `beginWork` on the live objects, then write under the
  resulting key. After that the chat's key never changes.
- **The fill leaves no registration.** The handle `beginWork` returns is ended at once, so
  `isWriting` never stays true for a keystroke.
- **Where:** fills run only from event handlers (the textarea's `input` listener, a late writer's
  start), never inside a `$derived`, an `$effect` or the template.
- **If `beginWork` refuses** the on-screen chat, the write goes to a transient record bound to
  that chat object.
  - It is never stored, never shown under another chat, and is dropped when the chat leaves the
    screen.
  - A Send from it is refused by I-S1's `beginWork` rule.
  - This is not expected to be reachable: the on-screen chat is read through `DBState`.
- **Reachability.** No route that produces an id-less chat within a session was found at
  `2177f7d2`: W0 fills at creation and import, and the plugin install routes fill missing ids
  through `chatIds.ts`'s install helpers. The fill is a backstop.

**D4. Showing is not writing.** Switching to a chat, a remount, or re-deriving the key never
creates, modifies or re-timestamps a record. Only a write to one of the three values does.

**D5. A send's values leave and return through the origin's record.**
- The take moves the on-screen record's three values to H2 (I-S1). The record on screen at the
  take is the origin's, since the key and the origin come from the same ids.
- **Every put-back (I-S2, I-S8) writes to the origin's record by its key:**
  - whether or not that record is on screen;
  - whichever composer instance is mounted, or none;
  - under I-S2's put-back rule, applied to that record.
- **A put-back never writes any other record.**
- **A gone origin's** put-back lands in a record that is never shown again and ages out (D8).
- **An ambiguous origin** appends as W1a decided, and so has no put-back.

**D6. Late results go to the record they started in (`MC-072` 2).**
- **Which writers:** each writer that resolves after an await captures the key when it starts
  (filling ids per D3):
  - the paste `FileReader` → `postChatFile`;
  - Post File's `postChatFile`;
  - both directions of `updateInputTransateMessage`, including the experimental translator's
    delayed path.
- **At resolve,** it writes to that key's record, on screen or not.
- **A translation** writes the derived field only if that record's source field still holds
  exactly the text that was translated. Otherwise it is discarded. S1 checks this on the live
  fields; S2 checks it on the record.
- **Synchronous writers** write the on-screen record within the same handler:
  - the sticker `onSelect`;
  - `Suggestion.svelte`'s two buttons;
  - the staged file's remove button;
  - the synchronous clears in `updateInputTransateMessage`.
- **Every write goes through the record's write,** including today's in-place edits (`push`,
  `splice`, `+=`), so D3's fill and D8's write time apply to it. The empty view shown for a chat
  with no record is never mutated.
- I-S10's lock checks stay where S1 put them, at each writer's start.

**D7. Liveness (`MC-072` 3).**
- While the **on-screen** record is non-empty, the composer holds its one `COMPOSER_DRAFT_KIND`
  registration, as today.
- H2 registers as in S1.
- Records not on screen register nothing. They never reach `hasLocalDrafts()`,
  `hasMessageEditorDrafts()`, the window policy or the multi-tab gate.
- The composer does not use `draftContents.ts` or `draftContentOrphanGate.ts`.

**D8. Bounded.**
- **The cap:** stored records are capped by the composer's own constant. It is of the same order
  as `DRAFT_CONTENT_RECORD_LIMIT` (200) but not shared with it.
- **Eviction:**
  - the least recently **written** record goes first, and is dropped silently (7.7);
  - the record on screen is never evicted;
  - a record for a deleted chat is never shown again, and ages out.

**D9. The height follows the shown text, whoever writes it.**
- Both inputs are sized to the text of the record on screen, as typing sizes them today.
- This holds when a different record is shown, and after any write to the shown record:
  typing, a put-back, a late result or a clear.
- It holds after a remount too. No writer has to resize an instance itself, since the instance
  that started an operation may be gone.

**D10. The lock is global (`MC-102` 1).** I-S10 is unchanged. From a take until its hand-off or
put-back, every composer is read-only, whichever record it shows. Switching is not refused
(`MC-073`).

**D11. Auto mode is module state (`CHORE-44`).**
- **Running:** whether auto mode is running is held at module level, and every composer instance
  shows it.
- **Stopping:** a toggle in any instance, including one mounted after the loop started, stops the
  loop after its current tick.
- **Starting:** it is refused while the window is open (I-S3), as in S1.
- The loop's existing stop, when the selected character changes, stays.

**D12. The busy button in any instance aborts the current generation (`CHORE-44`, `MC-099`).**
- The abort controller of the generation the window's current action started is module state.
  It is not held per instance.
- Once a send has appended, or during a reroll or an auto-mode tick, the busy button
  in any composer instance aborts that generation. That includes an instance mounted after the
  generation started.
- Before the append, I-S8's cancel is unchanged.

**Mechanism (non-normative).**
- **A module** such as `src/ts/process/composerDrafts.svelte.ts` holds:
  - a map from key to a reactive record;
  - a `peek(key)` that returns the stored record, or a shared empty view that is never stored;
  - `write`, `take`, `putBack`, the cap, and the key and fill helpers.
- **The component** binds with function bindings (`bind:value={getter, setter}`). The setter runs
  from the `input` listener (Svelte 5.56.8, ledger row 274). Svelte also calls it once at mount
  when the getter returns `null` or `undefined`, so the getter always returns a string.
- **Where records are created:** never in a `$derived` or the template, which would hit
  `state_unsafe_mutation`.
- **The source:** `composerActions.svelte.ts` reaches the records by key, not through the
  instance's `composerSource`. The source keeps only the instance-held reroll history and
  `closeMenu`; the controller (D12) and auto mode (D11) move to the module.
- **The height (D9):** one effect on the shown values. A `$effect.pre` runs before the DOM value
  updates, so it would measure the old text.

### 7.4 Acceptance scenarios

Each scenario is a test unless marked live.
- **Red:** it fails against `2177f7d2` on a behavioural assertion.
- **Guard:** it passes before and after.
- **Spec:** a specification test on the new draft module, which has no counterpart before the
  change. It is neither red nor a guard.

The harness scenarios run on the new `DefaultChatScreen` mount harness, which is built and run
against `2177f7d2` first.

1. **Switch** (red, harness): in A, type text, stage a file and set the translation. Switch to B:
   another character, and separately another chat of the same character.
   - B's composer is empty.
   - A Send from B carries nothing of A's.
   - Back in A, all three values are there.
2. **Return to origin** (spec on the module; guard on the harness): A → B → A without typing in B. A's values are there,
   and no record exists for B.
3. **Branch, Copy, New Chat** (red, harness): type in A, then Branch; separately Copy; separately
   each New Chat button. The new chat's composer is empty, and A keeps its text.
4. **Remount** (red, harness):
   - Type in A, then unmount and remount. A's text is there.
   - Send in A to completion, then remount. The sent text does not come back.
5. **Put-back after a remount** (red): Send in A with an input trigger that never settles. Remount,
   then cancel from the new instance. The new instance shows A's three original values.
6. **Put-back after a switch** (red on `composerActions`, where at `2177f7d2` B's composer, the
   one shared source, receives A's put-back; spec for the record half on the draft module):
   - B holds its own draft. Send in A with a slow trigger, switch to B, and cancel.
     - B's composer is unchanged.
     - Back in A, A's original values are there.
   - Separately, delete A's chat during the wait:
     - nothing is appended anywhere;
     - B's record is untouched.
7. **Id fill at the first write** (spec on the module; on the harness, the first bullet is red
   and the other two are guards):
   - An id-less chat, installed on the live database and shown, is typed into once.
     - Its id, and a missing `chaId`, are filled.
     - `isWriting` is false afterwards, and the text is kept.
     - More typing, then a switch away and back, keeps it under the same key.
   - Showing an id-less chat and leaving it without typing fills nothing.
   - A same-id object replacement keeps the draft.
8. **Late file or paste** (red, harness): start in A, switch to B, then resolve.
   - B is unchanged.
   - Back in A, the file is staged and any text result is appended.
9. **Late translation** (red): start a translation in A, switch to B, then resolve.
   - B is unchanged, and A's derived field holds the result.
   - If A's source field was edited before it resolved, the result is discarded.
   - Covered for both directions, and for the experimental translator's delayed path.
10. **Liveness:**
    - With text stored for A and nothing in B on screen, `hasLocalDrafts()` is false (red on the
      harness: at `2177f7d2` A's text is still in the shared composer, and registered).
    - With text on screen, it is true (guard).
    - A stored record never makes `hasMessageEditorDrafts()` true (spec on the module; guard on
      the harness).
11. **Showing is not writing** (spec): switching to a chat with no record, and back, creates no record.
    Switching to a chat with a record does not alter or re-timestamp it; the eviction order shows
    this.
12. **Cap** (spec): past the cap, the least recently written record goes, never the one on screen.
13. **Duplicate id** (spec, `MC-102` 2): two chats of one owner holding one id show one draft.
14. **Auto mode across a remount** (red): start auto mode, remount, then toggle it off in the new
    instance. The loop stops after its current tick.
15. **Generation abort across a remount** (red): a generation is running, started by a Send
    that has appended and, separately, by an auto-mode tick. A second source (a remounted
    composer) clicks the busy button, and that generation's signal is aborted.
16. **S1's suite** (guard): `src/ts/process/tests/composerActions.svelte.test.ts` passes, changed only where the source
    shape changes, and every one of its scenarios is kept.
17. **Live check, production build with Echo:**
    - the height follows the shown text (D9): a multi-line draft in A and a one-line one in B,
      and a multi-line put-back after a remount;
    - the busy button aborting generation after a remount (D12);
    - scenario 1 on desktop;
    - a put-back after a remount through the mobile chat list;
    - auto mode stopped from a remounted composer;
    - S1's unexercised items: Korean IME Enter, Post File, a sticker and a suggestion.

### 7.5 Compatibility

- **No change to** the save format, the plugin API, CBS, Lua or triggers. Drafts stay in memory
  only.
- **Nothing outside the composer reads its values** (row 291's grep: only
  `DefaultChatScreen.svelte`, and `Suggestion.svelte` through a callback prop).
- **The id fill** writes `chat.id` or `chaId` on live objects and marks the character for save,
  as `beginWork` does today at a send. It now happens at the first keystroke instead.
- **Every theme, the mobile layout and customHTML** mount the same `DefaultChatScreen`.

### 7.6 Tests and checks

- **The draft module:** scenarios 2, 7, 11, 12 and 13, plus the record half of 6 and 10.
- **`src/ts/process/tests/composerActions.svelte.test.ts`:** scenarios 5, 6, 9, 14, 15 and 16.
- **The mount harness:** scenarios 1, 3, 4 and 8, plus the wiring half of 2, 7 and 10.
  - It is built on the pattern of `Chat.messageEditor.svelte.test.ts` and
    `composerActions.svelte.test.ts`'s mocks.
  - Harness scenarios drive the real component; only services outside it are mocked.
- **Red evidence:** each red scenario's failure against `2177f7d2`, with its reason, is recorded
  in the gate record. A failure caused by a missing module or export proves nothing. Spec tests
  on the new draft module make no red claim.
- **Checks:** the Orchestrator runs the full suite, `pnpm check` and `pnpm run build` on the final
  snapshot, then the live check.

### 7.7 Limitations

- **A reload drops composer drafts,** as today. A multi-tab reload drops stored drafts for chats
  not on screen (`MC-072` 3). That includes a put-back to a record not on screen.
- **Two chats holding one id share one draft** (`MC-102` 2), and so do chats with matching ids
  under two owners holding one `chaId`. Boot repairs such duplicates; a plugin can create one
  within a session. Anything sent is visible in the composer first.
- **Past the cap, the least recently written draft is dropped silently** (D8). A put-back to a
  deleted chat counts as a write, so its record ages out like any other.
- **The id fill can move the chat list's view.** The chat window policy sees a new key when an
  id-less chat gains its id. Unless a message editor is open, it resets the loaded page window,
  as a switch does. This happens only for id-less chats, for which no in-session route was
  found (D3). It happens at `2177f7d2` too, at the first send.
- **A chat whose id cannot be filled** gets only a transient draft (D3). This is not expected to
  be reachable.
- **The reroll history** stays per instance (`MC-100` 2, `CHORE-43`).

## 8. Limitations (S1)

**Covered by maintainer decisions:**
- Generation after a mid-send switch runs on the chat on screen until W2 (`MC-097` 1).
- The text is out of sight during a slow send (`MC-097` 2). The busy state shows it, and the
  button cancels it (`MC-098` 1, `MC-099`).
- `sendPofile` is W2/W3's (`MC-098` 2). A `/` command's own reads are W3's (`MC-075` 1).

**Decided by `MC-100`:**
- The next message cannot be typed while a send's input trigger runs; input opens when generation
  starts, or on cancel.
- The reroll history's cross-chat defect is `CHORE-43`, not S1.

**Proposed, S1 interim until S2:**
- **Put-backs land in the shared composer.** After a remount the owning instance is gone, and the
  put-back is lost. After a switch, the text shows in the chat now on screen. This diverges from
  `MC-097` 2's "that chat's draft", which S2 delivers. It is no worse than `790643ff`, where the
  text simply stayed in the shared composer.
- **Generation starters outside the composer do not consult the window:** plugin v3 `sendChat`,
  the `previewRequest` hotkey, DevTool and `sendPofile`. If one starts during a send's wait, that
  send's hand-off is refused, its message gets no reply, and its `sendChatMain` clears `doingChat`
  under the other generation. That is as at `790643ff`. W2 owns generation's starters and the
  `doingChat` flag's ownership.

**Pre-existing, outside S1 (noted for their owners):**
- `/multisend` leaves `doingChat` set (W3).
- `doingChatInputTranslate` is never set.
- Auto mode on a cold chat may spin without yielding (traced, not run; a ticket candidate).

## 9. Claims not independently re-verified

- The frozen-index row (scenario 12) is traced from source, not run.
- The throw propagation from `runTrigger` rests on the Orchestrator's reading (row 273). The
  `finally` holds either way.
- `isWriting` has no non-test caller (`senior-advisor`'s grep, row 274; round 4 agreed).
- The ordering of WebKit's IME composition against a synchronous take (round 4's suspicion) cannot
  be checked on this machine.

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

### Rev 3 — 2026-09-28

- Rewritten after W0 and W1 were committed. Re-scoping packet: ledger row 272.
- **Closed upstream of this stage:**
  - I1's creation and import rules (W0), and the New Chat bugs (W0);
  - M1 and M5 (W1a, `MC-094`);
  - the character branch's write-back (W1a, S1).
- **Maintainer decisions:**
  - `MC-097` 1: generation after a mid-send switch is W2's, so rev 2's I6 stop is dropped;
  - `MC-097` 2: the composer empties at Send (I5's take), replacing rev 2's partial-clear rule
    (M3).
- **Added, per `MC-091`'s scope-amendment rule:** each is in `sendMain` or on the composer's own
  key path, and each was raised by this plan's own gates or re-scoping.
  - the group and empty branches' write-back and the frozen index (I5);
  - the one-send window (I13);
  - reroll and auto mode (I11, from M2);
  - the hotkeys (I12, from M4);
  - the textarea height (I10);
  - I1's re-key across an id fill (Report 24 section 6).

### Gate 1 round 3 — `opus-reviewer` (fresh), rev 3 — **[REJECT]** (ledger row 273)

The Orchestrator re-checked BLOCKER-1 and MAJOR-1 in source before acting on them.

- **Sound:**
  - Every "closed upstream" row in section 2 (W1a's origin-bound append; no
    `setCurrentCharacter`/`setCurrentChat` left in the trigger or send path; W0's ids at New
    Chat, Branch, both Copy paths and the plugin install routes).
  - Section 2's open rows, and the late-writer list, which is complete.
  - I13's premise (`sendChat` sets `doingChat` before any await), and I11 (nothing needs
    `sendChatMain`'s clear).
  - Key derivation for groups, the playground and Home; the harness is feasible; no plugin, CBS or
    Lua hook reads the composer.
  - The reviewer judged the take-at-Send mechanism itself sound.
- **BLOCKER-1:** a throw before the append loses the taken values. `runTrigger`, a v2 plugin
  `editinput` hook (`processScriptFull`'s `await plugin(data)`) and `processMultiCommand` do not
  catch. At `790643ff` the text survives, because the clear follows the append.
- **MAJOR-1:** once the take has emptied the record, nothing registers `COMPOSER_DRAFT_KIND`, so
  `getMultiTabAction` auto-reloads a clean tab mid-send, and the message is lost silently.
- **MAJOR-2:** scenarios 11 and 12 (and 13) were placed on a module that does not exist yet. The
  late writers are component code, so they need the mount harness.
- **MAJOR-3:** I13's window is not required to survive a remount. On mobile a switch remounts the
  composer.
- **MINORs:**
  - a handled `/` command now drops staged files and the translation;
  - a refused Send must not take;
  - the empty branch never follows an await;
  - I1 needs a lasting alias for late writers and must cover a `chaId` fill;
  - I10 has no verification route;
  - sections 5 and 7 disagree on which scenarios are red, and scenario 10's second bullet
    contradicts I5;
  - section 9's items 3 and 4 are not maintainer-accepted;
  - I12 from Home, `prevChar` from the last character, and `reseter`;
  - duplicate ids share one draft record.
- **Optional:**
  - a busy indicator during I13's window;
  - `beginWork`'s handle ends on every exit;
  - a restore puts back the original values, not the inlined text;
  - I7 stands in for `MC-043`'s generation token.
- **Escalation count: 3 consecutive substantive rejections.** Escalated to `senior-advisor`
  before a rev 4 (ledger row 274).

### Escalation — `senior-advisor` (ledger row 274)

- **Root cause.** Every rev specified the send as a value pipeline. The text sat in a local of
  `sendMain` across an await, which is an unowned holder: nothing registers it, a remount cannot
  reach it, and nothing puts it back on a throw. Each round found that interval. The plan also
  enumerated exits instead of stating one structural rule, and each round gated 13 invariants and
  22 scenarios in a new shape.
- **Direction.**
  - Take-at-Send stays (`MC-097` 2), specified as an **ownership transfer** between holders: the
    per-chat record; one module-level in-flight slot per origin, which is never shown, holds the
    liveness registration and **is** the one-send window; and the chat's message array.
  - Each transition is synchronous. The in-flight slot goes back to the record in one outermost
    `finally`. A handled `/` command consumes the text only.
  - The window closes after `sendChatMain` returns, which covers the `sleep(10)` gap.
  - `beginWork` runs once at the take, for all three branches.
  - Ids are filled at the first write to a record. That removes the `WeakMap` key, the re-key and
    the alias.
  - I10 goes to the live check.
- **Split (`MC-091` amendment, recorded by the Orchestrator).** The composer stage becomes three
  items, in this order:
  - **S0**, the hotkeys (I12): carve-out sized, with its own post-implementation review.
  - **S1**, the send seam: extraction, then the ownership model.
  - **S2**, the per-chat records, the late writers and the mount harness.
  - Why: S1 before S2 is safe, and the reverse is not. With records but the current send, a live
    read after the `/` await would fetch B's draft and append it to A.
- **Orchestrator's checks:**
  - Svelte 5.56.8's `bind_value` calls the setter from the `input` event listener, not from an
    effect, so an id fill at the first keystroke is safe.
  - The composer's generating actions are `sendMain` (Send, Continue), `reroll` and `runAutoMode`.
  - The hotkey bounds and the throw from Home are confirmed.
- **Maintainer (`MC-098`):** the Send button shows its busy state from the take until generation
  starts, and `sendPofile` belongs to W2/W3.

### Rev 4 — 2026-09-28

- Follows the escalation's direction. It is the normative plan for S1 only. S0 goes to its
  post-implementation review, and S2 gets its own plan (section 7).
- **Round 3 findings, disposed:**
  - BLOCKER-1 → I-S2 (one outermost `finally` puts the values back);
  - MAJOR-1 → H2 holds the liveness registration (scenario 8);
  - MAJOR-2 → S2, with the harness;
  - MAJOR-3 → I-S3 is module-level and global (scenario 3).
  - **MINORs:**
    - a handled `/` command → I-S2 (the files and translation go back);
    - a refused Send → I-S1 and scenario 13;
    - the empty branch → section 2 (never after an await);
    - I1 and the late writers → S2 (fill at the first write);
    - I10 → S2's live check;
    - the test contradictions → section 4's single red/guard labelling;
    - section 9 → section 8 separates decided from proposed items;
    - I12 → S0, with Home defined;
    - duplicate ids → S2's notice.
  - **Optional items:** the busy state is `MC-098` 1 (I-S5); `beginWork`'s end is I-S7; the
    original values are restored (I-S2); I7's substitution for `MC-043`'s token is carried into
    S2.

### Gate 1 round 4 — `opus-reviewer` (fresh), rev 4 (S1) — **[REJECT]** (ledger row 275)

The Orchestrator re-checked M2, m6 and the IME handler in source.

- **Sound:**
  - the holder model H1/H2/H3, the synchronous take, the one outermost `finally`, and the global
    module-level window, which survives a remount;
  - the premise that `sendChat` sets `doingChat` synchronously;
  - the handled-command put-back matching `790643ff`;
  - `processMultiCommand` really can throw;
  - S1 before S2 is safe;
  - no plugin, `editinput`, format or switch-lock exposure.
- **M1 (test design):** `reroll`, `unReroll` and `runAutoMode` stay in the component, so a
  seam-only suite cannot show that they respect the window. A reroll during the input trigger's
  wait then races the send.
- **M2 (design):** the busy control calls `abortChat`, which does nothing before `sendChatMain`
  creates a controller. A stalled input trigger or `editinput` hook blocks every composer action
  until a reload, which loses the taken text. The maintainer chose cancel (`MC-099`).
- **MINORs:**
  - m1: the merge rule is wrong in "translate input" mode, where `messageInput` is derived and a
    late translation can overwrite the restored text;
  - m2: stray newlines;
  - m3: scenarios 5, 6 and 8 are mislabelled (8 is red);
  - m4: `take`/`putBack` cannot express the behaviour-preserving extraction;
  - m5: H2 must be emptied inside the append callback;
  - m6: `/speak` returns at once for a group;
  - m7: the empty branch is reachable after the `/` await through the live re-read, and its
    write-back aliases a character's chats too;
  - m8: the `sleep(10)` roles are reversed;
  - m9: "nothing is worse" is overstated;
  - m10: non-composer generation starters do not consult the window, and the hand-off clears
    `doingChat` unconditionally;
  - m11: the put-back does not resize the input;
  - m12: the interim put-back diverges from `MC-097` 2.
- **Suspicions, for the live check:** Enter with a Korean IME on WebKit versus the synchronous
  take; a legacy plugin reading the textarea's DOM.
- **Pre-existing, noted:**
  - `/multisend` leaves `doingChat` stuck (W3);
  - `doingChatInputTranslate` is never set;
  - auto mode on a cold chat may spin (traced, not run).
- **Escalation count:** the fourth consecutive substantive rejection, and the first after the
  escalation. The Orchestrator asked whether the mechanism is the problem. The reviewer found the
  escalation's structure sound. Its majors are one test-design omission and one behaviour the
  plan left unspecified. So rev 5 follows the same structure rather than re-escalating.

### Rev 5 — 2026-09-28

- **M1:** every composer action moves into the module (section 3's mechanism, I-S3), so the
  suite drives reroll, unreroll and auto mode (scenarios 2 and 13).
- **M2:** `MC-099`, which gives I-S8 and scenario 9.
- **m1:** the typed-field rule and re-derivation (I-S2, scenario 15).
- **m2:** non-empty parts only.
- **m3:** relabelled (6 and 7 per half; 10 is red).
- **m4:** a source with live accessors.
- **m5:** H2 is emptied inside the append callback, with the abort checked there.
- **m6 and m7:** section 2's write-back row is rewritten (it covers the empty branch too, and
  character sends), and scenario 11 has both cases.
- **m8:** the `sleep(10)` roles are corrected.
- **m9:** section 1's claim is removed; section 8 lists the interim differences.
- **m10:** I-S9, scenario 14, and section 8's disclosure.
- **m11:** a resize after a put-back.
- **m12:** section 8 states the divergence from `MC-097` 2.
- **Suspicions:** the Korean IME Enter goes to the live check, and WebKit is listed as
  unverifiable. The legacy DOM-reading plugin is in section 5.
- **Pre-existing items:** section 8.
- **Orchestrator addition:** stopping auto mode, and the busy button's abort, are never refused
  (I-S3). This holds because the window stays open for the whole auto-mode loop.

### Gate 1 round 5 — the round-4 reviewer (reuse), rev 5 — **[REJECT]** (ledger row 276)

- **Resolved:** every round-4 finding except m1, which is partly resolved. All red/guard labels
  hold.
- **MAJOR-A:** the module-level reroll bookkeeping resets only on a `characters`-index change. An
  unreroll in chat B can write chat A's reply objects over B's last message, and a remount no
  longer resets it. The same bug is reachable on desktop within one instance.
- **MAJOR-B:**
  - I-S9's "its own call set it" cannot be read from `sendChat`'s return value, since many
    `return false` paths leave `doingChat` set. Reading it that way leaves the composer busy and
    `changeChar` refusing every switch.
  - Under I-S9, auto mode started while another generation holds `doingChat` spins on microtasks
    and freezes the tab.
- **MINORs:**
  - m-a: the abort check must read the send's own controller;
  - m-b: the re-derivation has no request ordering;
  - m-c: the typed field chosen by mode is wrong when the user types into the main field;
  - m-d: scenario 7's group half needs a slow `/` command.
- **Optional:** `/input` and `/buttons` are modal; the ambiguous push is not a callback; a cancel
  during `/multisend` (W3).
- **Escalation count:** the fifth consecutive substantive rejection. The Orchestrator asked
  whether the mechanism is the problem. Both majors are in surface that rev 5 added, not in the
  escalation's structure.

### Rev 6 — 2026-09-28

- **MAJOR-B → I-S9 removed.** `doingChat` is handled exactly as at `790643ff`, which has no
  auto-mode spin. The clobber by outside starters is disclosed in section 8, for W2.
- **MAJOR-A → I-S9 (new):** the reroll history is keyed by the chat. Scenario 14 now tests it, and
  section 2 lists the pre-existing desktop bug.
- **m-b and m-c → the put-back merges each text field independently, with no re-derivation.** A
  translation result is written only while its source is unchanged (rev 3's I7 rule, applied to
  both translation paths). Scenario 15 has the late translation resolve last.
- **m-a:** I-S8 checks the send's own controller; scenario 9 has cancel, then a new Send, then a
  late resolve.
- **m-d:** scenario 7 names the group's wait.
- **Optional:** the ambiguous push is covered by I-S2's wording.

### Gate 1 round 6 — the round-4 reviewer (reuse), rev 6 — **[REJECT]** (ledger row 277)

- **Resolved:**
  - MAJOR-B (dropping the old I-S9 restores the clear of `790643ff`; no auto-mode spin);
  - m-a (scenario 9's order kills a current-controller check);
  - m-b and m-c;
  - m-d.
  - The source-equality rule agrees with the exp-translator path's 1500 ms check. With the old
    I-S9 gone, no window or auto-mode defect remains.
- **MAJOR-1:** "nothing is re-derived" combined with "discard a result whose source changed" leaves
  `messageInput` stale for good after a translate-input put-back. A translation in flight is
  discarded, and nothing re-issues it, so after an `MC-099` cancel the next Enter sends only the
  old translation. This is worse than `790643ff`, and scenario 15 as written asserts the defect.
- **MAJOR-2:** I-S9 resets only when a reroll or unreroll reads the history. Every generation
  hand-off, including each auto-mode tick, also writes it, so a group's auto-mode reply in chat B
  is recorded under chat A's key and can be written over A's last message. On mobile this is
  new: the remount used to reset it.
- **m-1:** step 1 cannot move the reroll bookkeeping to module level without a behaviour change.
- **Escalation count:** the sixth consecutive substantive rejection. Rounds 4 to 6 each found the
  escalation's structure sound, and rejected rules added to answer the previous round. The
  Orchestrator stopped iterating and put the stage's direction to the maintainer.

### Rev 7 — 2026-09-28 (`MC-100`)

- **The composer is locked from the take until generation starts (I-S10).** A put-back therefore
  meets only late file results, and goes in front of them. That removes the typed-text merge and
  the re-derivation, which are round 6's MAJOR-1 and the source of round 4's m1 and round 5's m-b
  and m-c.
- **The reroll bookkeeping stays per composer instance, as at `790643ff` (I-S9).** That removes
  round 6's MAJOR-2 and m-1. The cross-chat reroll defect is filed as `CHORE-43`.
- **Scenarios:**
  - 1 no longer types during the wait;
  - 6 checks the un-inlined files;
  - 14 is now the lock;
  - 15 is the translation in flight at Send.
- **Unchanged:** the source-equality rule for translation results. It still stops a translation
  in flight at the take from writing into the emptied composer and doubling the text after a
  put-back.

### Gate 1 round 7 — the round-4 reviewer (reuse), rev 7 — **[EDITORIAL]** (ledger row 280)

- **Design accepted.** `MC-100` removes the merge family.
- **Resolved:** round 6's MAJOR-1, MAJOR-2 and m-1.
- **The lock is sound:**
  - it ends at the hand-off, while the window runs until generation returns;
  - every exit ends it;
  - late file results are consistent with the put-back rule;
  - a readonly textarea still fires `paste` and `keydown`, so the paste handler checks the lock
    and Enter and Ctrl+M are refused by the window;
  - there is no interaction with auto mode or reroll;
  - a remount sees the lock.
- **Required corrections, applied by the Orchestrator in rev 7.1:**
  - E1: scenario 15 contradicted I-S2's own rule, and its red label did not hold. It is now a
    guard, and asserts the fresh translation when the result resolves after a cancel.
  - E2: scenario 14 asserted component wiring. It now asserts the lock flag, and the live check
    lists the lock.
  - E3: a late text result is red; a late asset is a guard.
  - E4: I-S10 ends in the outermost `finally` too, and "the hand-off" is defined.
- **Also applied:** the optional correction to scenario 6's label, for the `processMultiCommand`
  throw.
- **Not applied:** the optional re-application of a translation discarded during the wait. S1
  restores the values as they were at Send.
- **Gate 1 for S1: passed.**

### Build — S1

- **Move:** row 281. **Red tests:** row 282. Against the move, 23 fail and 10 pass (guards). The
  busy and lock flags are specification tests. The `beginWork`-refusal leg of scenario 17 cannot
  be reached through the composer.
- **Implementation:** row 283. Orchestrator checks: 140 files, 1709 passed, 4 skipped; `pnpm
  check` clean; build passes.

### Gate 2 round 1 — `opus-reviewer` (fresh) — **[REJECT], tests only** (ledger row 284)

- **No production defect.** The reviewer re-derived the red evidence (23/10) from its own pre-fix
  reconstruction.
- **Surviving mutants:**
  - M8: the lock is held through generation;
  - M9/M10: translation source-equality;
  - M12: an unconditional in-flight clear;
  - M14: put-back order;
  - M19: the group's ambiguous push.
- **MAJOR 1:** scenario 15 has no real test.
- **MAJOR 2:** the lock's release at the hand-off, and scenario 9's order (cancel A, B stalls, A
  resolves, cancel B), are untested.
- **MINORs:**
  - scenario 5's busy state after exits 7 to 9;
  - conditional busy and lock assertions;
  - no reset between tests;
  - stale comments in the test file;
  - four false production comments;
  - I-S2's push gap: a cancel in it duplicates the text, but no user event can land there. It is
    fixed anyway with an `onAppended` callback, as section 3 planned.
- **Pre-existing, filed:** auto mode started in one composer instance cannot be stopped from a
  remounted one (`CHORE-44`). That contradicts I-S3's "stopping auto mode is never refused"
  across instances, so I-S3 holds within one instance only until `CHORE-44`.

### Gate 2 round 2 — the round-1 reviewer (reuse) — **[EDITORIAL]** (ledger rows 285-286)

- **Behaviour accepted.**
  - All 19 mutants are killed.
  - `onAppended` closes the push gap, confirmed by probes.
  - The `finally` holds on every outcome.
- **Required:**
  - E1: the `InflightRecord` comment;
  - E2: three tests that pass before the fix are labelled `guard:`.
- **Taken, although optional:**
  - `registerDraft` moves inside the outermost `try`, so a throwing drafts listener cannot strand the taken values;
  - a forward-direction translation test.
- **Not taken:** scenario 17's `beginWork`-refusal test. The composer cannot reach that path without faking `beginWork`, and the code is three lines that are correct on inspection.

### Gate 2 round 3 — the round-1 reviewer (reuse) — **[EDITORIAL]**, closed (ledger row 288)

- **Resolved:**
  - E1 and E2. Pre-fix, exactly the 13 `guard:` tests pass.
  - The forward test kills M20. All 20 mutants are killed.
  - `registerDraft` inside the `try` holds for a listener that throws at registration.
- **E3:** the comment claimed more than that. A listener that also throws at the `finally`'s
  `unregisterDraft` is not covered, and no production listener can throw. The Orchestrator
  narrowed the comment (editorial only).
- **Gate 2 for S1: passed.**
- **Final snapshot:** 140 files, 1718 passed, 4 skipped; `pnpm check` clean; build passes.
- **Next:** the live check (section 6), then the commit.

### Live check — S1 — passed (ledger row 289)

- **Setup:** a production build on the Node server, in Chrome, with Echo (4 s delay) set in
  Settings first. The input trigger was a Lua `onInput` that sleeps 8 s.
- **Send:**
  - the composer is locked, empty and busy at Send;
  - typing and a second Enter are refused, and exactly one message is appended;
  - the lock releases at the append, while busy continues through generation;
  - text typed during generation is kept.
- **Cancel:** a physical click on the busy button before the append restores the text within
  19 ms, and nothing is appended later. A click after the append aborts generation (`MC-099` 4).
- **During a wait:** Ctrl+M is refused, a paste into the locked composer adds nothing, a switch
  leaves the composer locked, and the message lands in its own chat with no aliasing. Generation
  then runs on the chat on screen (`MC-097` 1, W2).
- **Remount:** a composer remounted through Settings is locked.
- **Saved:** `database.bin` holds every appended message and not the cancelled one.
- **Not live:**
  - the Korean IME Enter;
  - Post File;
  - stickers and suggestions (review only).
- **Cleanup:** the server was stopped, and `save/` restored and verified by SHA-256.

### S2 plan, rev 8 — 2026-09-28

- Written from the scoping packet (ledger row 291) and the maintainer's `MC-102`.
- `CHORE-44` is folded in under `MC-091` (section 7.1).

### S2 Gate 1 round 1 — `opus-reviewer` (fresh), rev 8 — **[REJECT]** (ledger row 292)

The Orchestrator re-checked MAJOR-1, MINOR-3 and E1 in source.

- **Sound:**
  - D5 against S1 as built: the take and origin share one read, and the put-back runs once.
  - D2's refusal of `chatWindowKey`.
  - D3: `beginWork` is safe in an event handler, and Svelte 5.56.8's bind setter runs from the
    `input` listener, outside any reactive context. Nothing fills ids inside a derivation.
  - D6's late-writer list, D7, D10, D11's failure statement, 7.2 and 7.5, and harness
    feasibility.
  - Red labels on scenarios 1, 3, 4, 5, 6, 8, 9 and 14 (traced).
- **MAJOR-1:** after a remount, the busy button cannot abort a running generation. `abortChat`
  aborts the clicking instance's own controller, which is `null` in a new instance. The reviewer's
  probe confirmed it against `2177f7d2`. It has `CHORE-44`'s cause, and the plan named no home for
  the controller. The Roadmap's `CHORE-44` text also said the button "aborts only the current
  generation"; it aborts nothing.
- **MINORs:**
  - D9 covered only a change of record, not writes to the shown record from outside the instance,
    such as a put-back after a remount;
  - D8 let empty records count toward the cap, and did not disclose eviction loss;
  - D6 omitted the staged file's remove button and the experimental translator's synchronous
    clears, and did not require in-place edits to go through the record write;
  - the scenario labels: 10's first bullet is red, 13 cannot be a guard on a new module, 2, 7, 11
    and 12 were unlabelled, and the "stub" rule had no meaning for a new store.
- **Editorial:**
  - no in-session route to an id-less chat was found (the plugin install routes fill ids);
  - two owners sharing a `chaId` share records too;
  - the bind getter must never return `null` or `undefined`;
  - the test file's path.

### S2 plan, rev 8.1 — 2026-09-28

- MAJOR-1 → D12 (the generation's controller is module state) and scenario 15. The Roadmap's
  `CHORE-44` text is corrected.
- MINOR-1 → D9 (the height follows the shown text, whoever writes it).
- MINOR-2 → D1 (empty records are dropped at once) and a 7.7 disclosure. Eviction stays
  least-recently-written, with no new rule for dead records.
- MINOR-3 → D6 (the full synchronous list; every write goes through the record).
- MINOR-4 → the red, guard and spec labels in 7.4 and 7.6.
- Editorials → D2, D3, the mechanism, and 7.7.

### S2 Gate 1 round 2 — the round-1 reviewer (reuse), rev 8.1 — **[EDITORIAL]**, closed (ledger row 293)

- Every round-1 finding is fixed. D12 was traced against `abortChat`, `sendMain` and
  `sendChatMain`:
  - I-S8's in-flight cancel is untouched;
  - after the append, the only controller left is the send's own;
  - a stale, aborted controller is harmless.
- MINOR-2's answer (drop empty records, disclose eviction) was judged sufficient.
- **Editorial, applied as rev 8.2 and checked in source by the Orchestrator:**
  - scenario 7's harness labels;
  - scenario 6's red half;
  - D12 no longer lists unreroll, which starts no generation;
  - D3's citation of the plugin install helpers;
  - optional: scenario 10's third bullet is labelled, and the Roadmap's `CHORE-44` shape names the
    controller.
- **Gate 1 for S2 is passed.**

### Build — S2 (ledger rows 294-296)

- **Red tests first** (row 294). The new `DefaultChatScreen` mount harness drives the real
  component. It had 20 tests against `2177f7d2`: 15 red and 5 guards.
- **The fix** (row 295). It adds `src/ts/process/composerDrafts.svelte.ts` and changes
  `composerActions.svelte.ts` and `DefaultChatScreen.svelte`. S1's suite was changed only for
  the source shape.
- **Spec tests and coverage** (row 296). The draft module got 10 spec tests, and the harness
  gained 7 more tests.
- **Final snapshot:** 142 files, 1755 passed and 4 skipped; `pnpm check` clean; the build
  passes.

### S2 Gate 2 round 1 — `opus-reviewer` (fresh) — **[REJECT]** (ledger row 297)

The Orchestrator re-checked MAJOR-1 in source.

- **Sound:**
  - the invariants, as implemented:
    - D1-D5: every put-back goes by the origin's key;
    - D6: no in-place edit is left, and every late writer captures its key at the start;
    - D7-D11;
    - D12, apart from MAJOR-1's window;
  - Svelte reactivity: no write is reachable from a derivation, and the binding getter always
    returns a string;
  - S1's suite: the same 42 titles, and no assertion was weakened;
  - compatibility;
  - the 15 reds, re-run against `2177f7d2` through a load-hook swap;
  - of 23 mutants, all but four were killed.
- **MAJOR-1 (logic):**
  - After the append and before generation, which is the `sleep(10)` gap, a busy-button click
    aborted the previous generation's controller, or nothing.
  - The send's own controller became module state only inside `sendChatMain`.
  - At `2177f7d2`, the take published it at once, so this broke D12 and I-S8's last bullet.
  - The reviewer's probe confirmed it.
- **MAJOR-2 (test):** nothing checked that a late Post File, paste or forward-translation result
  lands in A's record. Three mutants that silently drop an off-screen result survived.
- **MINORs:**
  - the spec tests could not tell "least recently written" from "least recently created"
    (mutant M7 survived);
  - if `sendChatMain` throws, `runAutoMode`'s `finally` leaves `autoModeRunning` set.
- **Editorial:**
  - three `guard:` tests are reproducers: at `2177f7d2` they fail;
  - two comments narrate history;
  - two comments name `composerDrafts.ts`;
  - the `SvelteMap` comment's staleness claim.

### S2 remediation — 2026-09-28 (ledger row 298)

- **Tests first.**
  - A reproducer for MAJOR-1. It was red before the source fix: `signal.aborted` was false.
  - MAJOR-2's switch-back assertions, and MINOR-1's rewrite spec.
  - Scenario 1 now checks all three values on returning, and scenario 7 checks the key is stable.
  - The three reproducers lost their `guard:` prefix, and two comments were rewritten.
- **Source.**
  - The send's controller is published at the take.
  - `runAutoMode`'s `finally` clears `autoModeRunning`.
  - Two file names in comments, and the `SvelteMap` comment.

### S2 Gate 2 round 2 — the round-1 reviewer (reuse) — **[APPROVE]** (ledger row 298)

- **Every finding is fixed.**
  - The reproducer fails with the round-1 source swapped in, and passes now.
  - Mutants M7, M15a, M15b, M15d, M16 and M18 are killed.
  - Against `2177f7d2`, the harness has 18 failing and 9 passing. The 9 that pass are exactly the
    tests titled `guard:`.
- **The early publish was traced** against a cancelled in-flight send, a following reroll or
  auto-mode tick, and a handled `/` command. Probes P2 to P4 pass, and no new defect was found.
- **Optional:** M17 survived, because the `finally` clear had no test. A test was added after the
  approval (row 299).

### After approval — S2 (ledger row 299)

- **The optional MINOR-2 test:** "a generation that throws during an auto-mode tick leaves auto
  mode stopped". It fails against a scratchpad mutant without the `finally` clear (`expected true
  to be false`).
- **Final snapshot:** 142 files, 1758 passed and 4 skipped; `pnpm check` is clean; the production
  build ran after the last source change.

### Live check — S2 — passed (ledger row 299)

- **Setup:** a production build on the Node server, in Chrome, with Echo (3 s delay) set in
  Settings.
  - Alpha has two chats and a Lua `onInput` that sleeps 8 s.
  - Beta has one chat.
  - The group Gamma has Alpha and Beta as members.
  - A remount is a Settings round trip. A tag on the textarea element showed that a new element
    was created each time.
- **Switch (scenario 1) and height (D9):**
  - Alpha's four-line draft was 128 px.
  - Beta, and Alpha's other chat, showed an empty 44 px composer.
  - Back in Alpha, the four lines were there at 128 px.
- **Put-back after a remount (scenario 5):**
  - The composer was locked and empty during the wait in the new element.
  - A physical busy click restored all three lines at 100 px.
  - Nothing was appended in the 10 s after.
- **Put-back after a switch (scenario 6):**
  - During Alpha's wait, Beta showed its own draft, read-only (`MC-102` 1).
  - The cancel left Beta's draft as it was, and Alpha's text was back in Alpha.
  - Nothing was appended.
- **Abort after a remount (D12):** Send in Beta, a remount, then a busy click during Echo's delay.
  No reply was appended.
- **Auto mode after a remount (D11):**
  - In Gamma, the remounted composer showed auto mode running (`autoload`).
  - Toggling it off there let the current tick finish (2 to 3 messages), and nothing more was
    generated in 18 s.
- **Not live:**
  - the Korean IME Enter;
  - Post File (the native picker);
  - stickers and suggestions (harness and review only).
- **Cleanup:**
  - The server was stopped by PID, and the port was confirmed closed.
  - `save/` was restored and verified by SHA-256 (6 files, no mismatch). The two backups the
    check created were moved to the scratchpad.
  - The Chrome tab is still open for the maintainer to close, because of the leave-site guard.

### Commit-message check — S2 — the Gate 2 reviewer (reuse) — **[EDITORIAL]**, closed (ledger row 300)

- **Correction to the gate record above:** the MAJOR-1 test is a **guard** against `2177f7d2`,
  not a reproducer.
  - `2177f7d2` already published the send's controller at the take
    (`source.abortController.set(controller)`), and probe P1 passes there.
  - The gap was a regression in this change's first implementation, which moved the controller
    to module state. The test was renamed `guard: …`.
- **The auto-mode throw test is a reproducer against `2177f7d2`:** probe P5 fails there, because
  the flag stays true.
- **The message was corrected:**
  - the controller publish is described as kept behaviour;
  - the auto-mode fix is added;
  - both tests are labelled, with P5's pre-fix failure;
  - the silent eviction past 200 drafts is added to "Known limits", with the optional limits;
  - the id fill and resize wordings are made precise.
