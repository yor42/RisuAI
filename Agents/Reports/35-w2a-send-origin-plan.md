# W2a — A send writes into the chat it started in

**STATUS:** plan rev 2.6, 2026-09-29. **Gate 1 passed; Gate 2 passed** (section 12): round 1 [REJECT]; rev 2.4 amended I5, I7 and I12; rev 2.5 separated a reply rebuilt by a trigger from one the user deleted mid-stream (I5); round 2 [EDITORIAL], applied in rev 2.6 and closed by the Orchestrator. Live check passed; commit-message check passed. **Committed as `ec65c200`.** **Gate 1 passed** (section 12): round 1 [REJECT]; round 2
[EDITORIAL], applied in rev 2.1; rev 2.2 added the fast path section 6's measurement requires; its
review [EDITORIAL], applied in rev 2.3.

**Decisions:**
- `MC-073`: no switch lock. `MC-075`: a write whose origin is gone drops silently (2); Home during
  a send is checked when the rework reaches it (3). `MC-076`: the staging, W-1 to W-6 (Report 23).
- `MC-078`: an ambiguous target is skipped with a warning, never guessed. **Amended for the send by
  `MC-104` 1.**
- `MC-094`: a trigger run has no commit step (W-2′).
- `MC-095`: W2 binds the send's parser calls, its `{{setvar}}` writes, its lorebook call and graph
  memory, together with the send's own writes.
- `MC-097` 1: generation after a mid-send switch is W2's.
- `MC-103`: a busy starter is refused silently (W2b); a confirmed delete aborts (W2e); Home keeps
  generating (3, here); a gone group member is skipped (4, here). The W2 split into W2a-W2e and W3.
- `MC-104`: a send in a chat whose id is duplicated writes to the object it started from (1); a
  cold group member is restored for their turn (2).
- `MC-011` (upstream data and plugins keep working; fork-local behaviour is not worth preserving),
  `MC-089` (nothing ships between stages), `MC-091` (scope amendments).

**Evidence:** ledger rows 305 (the send's writes, reads and recursion; scratchpad
`w2/packet-A.md`), 306 (the registry, `doingChat`, starters and deletes; `w2/packet-B.md`) and 307
(Gate 1 round 1); the resolution cost measured in row 257. The Orchestrator re-read in source: the
`sendChat` wrapper and `SendChatCallContext`; the entry stretch of `sendChatBody`; the group loop;
the memory write-backs; the start-trigger block; the streaming target; auto-continue and resend;
the tail writes; the five `doingChat.set` sites; `sendMain`, `sendChatMain`, `reroll` and
`runAutoMode`; `chatOrigin.ts`'s resolver, run subject and registry; `changeChar`'s cold restore;
cold storage's default and its 10-day rule; and the ambiguous-origin guard in
`sendChatTriggerWrites.svelte.test.ts`.

Closes: the frozen-index class of Report 23 section 1 for the send's own writes; the auto-continue
overwrite of another chat (row 305); the Home error of `MC-075` 3. No new ticket.

**Departure from Report 23 W-4:** the origin rides in `SendChatArg`, the existing input carrier,
not in `SendChatCallContext`, which is an output channel from the body to the wrapper (row 305,
section 3).

## 1. What is wrong at HEAD

A send captures its address once, at entry, as positions: `selectedChar` (an index into
`characters`) and `selectedChat` (an index into that character's `chats`), plus the held objects
`nowChatroom` and `currentChat`. Every later write goes through
`DBState.db.characters[selectedChar].chats[selectedChat]`, after as many as 64 awaits in
`sendChatBody`.

1. **Positions move.** A Branch, Copy or New Chat on the origin character `unshift`s its `chats`;
   a chat reorder moves them; a permanent delete of a character at a lower index shifts
   `characters`. After any of these, the remaining writes land in another chat or another
   character, and are saved. There are 32 write lines and 24 read lines on a frozen address,
   counting the slot lines through `nowChatroom.chats[...]` (row 305, R-2).
2. **Memory results are written twice.** HypaMemory v2/v3 and SupaMemory write their result to the
   held `currentChat` and again to the frozen slot. After a shift, the second write puts one chat's
   summary into another chat's `hypaV2Data`, `hypaV3Data` or `supaMemoryData`.
3. **The streamed reply is addressed by a number.** `msgIndex` is captured once; every chunk writes
   `message[msgIndex].data`. A message deleted during the stream moves the target, or makes the
   write throw. The tail writes (the image-prompt append, both `generationInfo` writes) and an
   auto-continue address "the last message", not the reply.
4. **Each call re-reads the selection at entry, even when it is not the first.** Group turns,
   auto-continue and resend call `sendChat` again, and the composer calls it after the input
   trigger's awaits. Each entry reads the cold guard, `selectedCharID` and `chatPage` from the
   selection, fills message ids on the chat on screen, and a group's turn order reads the last
   message of the chat on screen.
   - An auto-continue after a switch to another chat of the same character takes that chat's last
     message as its prefix and overwrites it with prefix plus continuation.
   - A group turn after a switch generates as whatever the new selection is.
   - A switch to a cold chat that is still loading makes the origin's send stop with
     `coldStorageChatStillLoading`.
5. **Group turns address members by position.** The turn order is computed once, as indices into
   the group's member list. Removing a member between turns (`rmCharFromGroup`, unguarded) shifts
   the later turns onto other members. A deleted member is handed to the turn as a blank "Unknown
   Character" with a fresh `chaId` (`findCharacterbyId`'s miss), so the send's own
   `cannot find character` check never fires. A member in cold storage is handed over as its
   placeholder, and the turn throws in `runTrigger`.
6. **`{{setvar}}` in the chat follows the selection.** `runCurrentChatFunction` re-parses every
   message with `runVar: true` and no subject. It has three call sites; a send runs it twice, once
   at entry and once after the reply (the streaming and non-streaming sites are exclusive). The
   second runs after awaits, so its `setvar` writes go to the chat on screen.
7. **`throwError` writes its error line through the frozen positions.**
8. **The composer reads the selection around the send.** `sendChatMain` reads `previousLength`
   from the selection before `await sendChat`, outside its `try`, and the reroll snapshot and
   `lastCharId` after it. A switch between Send and generation gives the snapshot the wrong length;
   Home in that window throws an unhandled TypeError and nothing is generated. Home during
   generation throws after the send, and the user sees an error alert although the reply was
   saved.
9. **A send entered at Home throws** after it has already set `doingChat`.
10. **The in-flight registry does not cover generation.** `sendChatBody` registers a work handle
    only around its three trigger runs. The composer's `sendMain` handle spans generation; reroll,
    auto mode and every other starter register nothing (row 306).

The objects `nowChatroom` and `currentChat` survive a shift, but not a whole-slot replacement (a
plugin's `setCharacterToIndex` or `setChatToIndex`, a backup load), after which writes to them
are lost.

## 2. The design

The send carries one **origin** (`chatOrigin.ts`'s `Origin`: `chaId`, `chatId`, and
`memberChaId` for a group turn). Every write the send makes resolves that origin when the write
happens (W-1). **A call that carries an origin reads no selection to choose a write's target or to
decide whether to run (the cold guard), including in its entry stretch.** Its other selection
reads (module toggles, the parser calls, lorebook, persona) are W2c's.

- **Where the origin comes from.** A caller that already holds one passes it in `SendChatArg`: the
  composer (`sendMain`'s work handle, and new captures in `reroll` and `runAutoMode`) and every
  recursive call. A caller that passes none (the hotkey preview, DevTool, the plugin `sendChat`,
  `/multisend`, `sendPofile`) gets one captured at entry, in the same synchronous stretch that reads
  the selection today, so their behaviour at entry is unchanged and everything after it is bound.
  The capture happens after the existing refusals (the `doingChat` guard, the cold guard, Home), so
  a refused call fills no ids and marks nothing.
- **Resolution, with the send's own objects as the tie-break (`MC-104` 1).** Alongside the origin,
  the send keeps the character and chat objects it started from, as identity hints only; they are
  never part of `Origin` and never written to unless they are a current holder. A write resolves
  the origin by id:
  - one holder: that holder, whether or not it is the hinted object (a plugin that replaced the
    object with the same ids receives the writes);
  - several holders: the one that is the hinted object; if none is, the write drops;
  - no holder: the write drops.
  The hints are passed down through recursion. The start-trigger block's ambiguous fallback
  follows the same rule instead of reading the frozen slot.
- **The send's trigger runs keep `MC-078`.** `runTrigger` builds its own run subject from the
  origin alone, with no hint, so in a chat whose id is duplicated the send's start and output
  triggers still write nothing (W1a's gated behaviour, pinned by the ambiguous-origin guard in
  `sendChatTriggerWrites`), while the send's own writes, including `runCurrentChatFunction`'s
  `{{setvar}}`, land through the hint. A card's trigger-kept state therefore stops updating in
  such a chat until the duplicate is gone. This is how `MC-104`'s "other writers keep `MC-078`" is
  read here; the maintainer may extend the hint to the send's triggers instead.
- **Registration.** Every `sendChat` call registers its origin for its own whole duration and ends
  the registration in a `finally` (W-5). Nested calls register again; registrations are counted.
  The subject is built from the origin the call was given (or captured), never from the handle
  `beginWork` returns, which drops a gone member.
- **Recursion inherits the origin (W-4).** Group turns pass the group's origin with the member's
  `chaId` taken from the group's member list. Auto-continue and resend pass the origin unchanged;
  auto-continue also passes the id of the reply it continues.
- **A gone origin ends the send quietly.** The write that finds it drops (`MC-075` 2), nothing
  further is written or generated for that send, no recursion follows, and no error is shown. Every
  such exit clears `doingChat` and returns false, as the existing gone exit after the start
  trigger does. Aborting the request on a confirmed delete is W2e's (`MC-103` 2).
- **Group members.** When a member's turn comes:
  - no longer in the group's member list, or no character holds their `chaId`: the turn is
    skipped and the remaining turns run (`MC-103` 4);
  - more than one character holds their `chaId`: the turn is skipped, as for gone (`MC-078`; the
    hint covers the owner and the chat only);
  - in cold storage: restored with `changeChar`'s checks, and the turn runs; if the restore fails,
    `coldStorageRestoreFailed` is shown and the group turn stops (`MC-104` 2). After the cold read's
    await, the restore finds the placeholder again **by `chaId`**, never by an index captured
    before the await, and installs and formats that slot; a character inserted or deleted during
    the read must not turn into a spurious failure.
- **The reply is tracked by id.** The send records the id of the message it appends (or, for a
  continue, the message it continues, filling its `chatId` if it has none). When the
  non-streaming continue replaces that message with a new id, the tracked id follows. Every write
  to the reply, the tail writes, the per-flush `processScriptFull` index, and the auto-continue all
  address the reply by that id. **A missing reply drops only the writes addressed to it** (the
  remaining chunks, inlay, both `generationInfo` writes, the image-prompt append and auto-continue).
  It does not end the send: the output trigger, TTS, emotion, the notification, a resend the
  trigger asked for, image generation and the next group turn run as they do upstream, since none
  of them writes to the reply. The reply goes missing when the user deletes it, and also when the
  card's own output trigger rebuilds the chat without message ids (Lua `setFullChat`, or remove
  then `addChat`), which upstream cards do; ending the send there would silently drop those
  features and the remaining group members.
- **Auto-continue runs only while the reply is still the chat's last message.** A continue tells
  the model to continue the last response, and the prompt ends with the chat's last message. If
  anything (an output trigger's `addChat`, for example) has appended after the reply, there is no
  continuation. This applies to the auto-continue a resend can lead to as well.
- **Home keeps generating** (`MC-103` 3). The composer's reads before and after the send go
  through the origin.

## 3. Scope

**In:**
- `sendChat`, `sendChatBody` and their helpers in `index.svelte.ts`: every write listed in row
  305's classes A, D, F, G, I and J; the reads that choose a write's target; the entry stretch of a
  call that carries an origin (the cold guard, the id fill, the group order's last message); the
  three recursive calls; the group loop and its member checks; the cold-member restore;
  `SendChatCallContext` and the wrapper's marks; the `chatOutput` listeners' index arguments;
  `runCurrentChatFunction`'s parses (class K).
- `composerActions.svelte.ts`: `sendMain` passes its origin and hints down; `reroll` and
  `runAutoMode` capture them; `sendChatMain`'s reads before and after `await sendChat`.
- `chatOrigin.ts`: an additive resolution that takes the identity hints (`MC-104` 1). Existing
  exports keep their behaviour; the other writers keep `MC-078`'s rule.
- The entry check: a send with no origin and nothing selected returns false with no side effect.
- Comments and test headers this change makes false: the JSDoc on `sendChat` and
  `SendChatCallContext`, the ambiguous-fallback comment in the start-trigger block, and the
  `sendChatSaveMarks.svelte.test.ts` header and its "by INDEX" comment.

**Scope amendment (`MC-091`), `runCurrentChatFunction`:** `MC-095` places the send's parser calls,
including the `{{setvar}}` writes, in W2 generally. `runCurrentChatFunction`'s parses move into
W2a because they write (`setvar`, and the parsed text back into each message) on the same lines
W2a rewrites, and need only the one subject W2a creates; W2c would otherwise re-touch those lines.
The failure if left: after a mid-send switch, the send's `setvar` writes land in the chat on
screen, while every other write of the same send lands in its origin. Passing the subject rebinds
every subject-aware tag in those parses, not only `setvar`: `getvar`, `calc`, `char` and `user`,
`getglobalvar` and the module tags. That pulls this part of W2c forward, which is intended.

**Out** (each is a selection-bound read *or write* the send still makes after W2a):
- **W2c, the send's scripts and parses:** its 37 other parser calls; `processScript` and
  `processScriptFull`, including the `@@inject` **write** and the `@@repeat_back` read in
  `scripts.ts`;
  `runLuaEditTrigger` (`editRequest`, `editOutput`), whose Lua chat bindings **write** to the
  selection; `loadLoreBookV3Prompt`; persona and user name; module toggles and assets.
- **W2d, the request layer:** the `request` trigger, provider name reads, tool calls, graph
  memory's `setChatVar` **write**, `risuaccess`.
- `doingChat` ownership and the other starters' busy checks (W2b). W2a keeps every existing
  `doingChat.set` site, adds clears only on its new gone exits, and moves the Home entry return
  before the flag is set. The hotkey and DevTool previews ignore `sendChat`'s result, so at Home
  they will show the previous preview rather than throw; W2b guards them.
- The delete warning and aborting on a confirmed delete (W2e).
- `/` commands and `sendPofile` passing their own origin (W3). Until then they get an origin
  captured at `sendChat`'s entry.
- `findCharacterbyId`'s blank fallback for other callers; the group's member names in the prompt.
- The reroll history's per-instance scope (CHORE-43), except as invariant I9 below.
- `reloadKeys`: it is written only and nothing reads it. It stays, written to the resolved owner.

## 4. Invariants

- **I1. Every write the send's own code makes lands in its origin chat, or nowhere.** This holds
  after a chat `unshift`, a chat reorder or deletion of another chat, a character insert or delete
  at any index, a chat or character switch, and Home. It covers the user message's id fill at
  entry, memory results, the streamed and non-streamed reply, the tail writes (`generationInfo`,
  the image-prompt append), `throwError`'s line and `runCurrentChatFunction`'s parses. It does not
  yet cover the writes listed as Out (W2c, W2d).
- **I2. Nothing outside the origin changes through the send's own code.** A chat, character or
  chat variable the send did not start in is unchanged by those writes, whatever moved during the
  send. The Out writes are excepted until their stages.
- **I3. A write to a non-selected origin is saved** (W-3). It survives encode → decode. Exception:
  while the owner's `chaId` has two holders, CHORE-28 (`MC-079`) does not rewrite that block, so a
  write made through the hint is saved only once the duplicate is gone.
- **I4. Each memory result is written once, to the origin chat.**
- **I5. The reply is addressed by its id.** Every write to it, and every tail write, lands on the
  message the send appended or continued. If that message is gone (deleted, or rebuilt without its
  id by a trigger), nothing more is written for it: no chunk, no inlay, no `generationInfo`, no
  image-prompt append, no continuation, and no throw. The send itself carries on: its
  notification, resend, image generation and later group turns run, and it returns true. When the
  reply goes missing after the output trigger has started (a trigger rebuilding the chat), the
  output trigger, TTS, emotion and the listeners (with `messageIndex` -1) run as upstream. When the
  reply is already missing as the stream ends (the user deleted it), the output trigger, TTS and
  the listeners do not run for it, since there is no reply to act on; the rest of the send still
  does. Deleting or inserting another message does not redirect the reply's writes.
- **I6. Recursion stays in the origin.** Group turns, auto-continue and resend generate into the
  origin chat, whatever the selection is by then. An auto-continue appends to the reply it
  continues, never to another message, and runs only while that reply is the chat's last message.
- **I7. Group turns go to members by `chaId`.** A member who is gone, or no longer in the group's
  member list, when their turn comes is skipped and the remaining turns run; so is a member whose
  `chaId` has two holders, and a cold member who is deleted while their data is being restored. A
  cold member is restored and speaks, even if other characters are inserted or deleted during the
  restore; a restore that fails while the member still exists shows `coldStorageRestoreFailed` and
  stops the group turn.
- **I8. A gone origin ends the send without an error,** a throw, or any write elsewhere, with
  `doingChat` cleared. **A duplicated id does not end it:** the send's own writes go to the holder
  that is the object the send started from, and drop only when no holder is. The send's trigger
  runs keep `MC-078` and write nothing while the id is duplicated (section 2).
- **I9. The composer's reroll snapshot comes from the origin chat,** measured from its length
  before the send, and is never attributed to another character. A switch or Home between Send
  and generation, or during generation, generates into the origin and shows no error.
- **I10. Registration spans the whole send.** While any `sendChat` call is in flight, `isWriting`
  is true for its origin chat (and for its member in a group turn); afterwards nothing it
  registered remains, on success, failure, throw, abort or a gone origin. A refused call registers
  nothing and fills nothing.
- **I11. Entry is unchanged for callers without an origin.** `sendChat(-1, {})` with a selected
  character sends into the chat on screen at that moment, exactly as today; DevTool's
  `sendChat(i)` on a selected group captures member `i` of that group, as today. With nothing
  selected, `sendChat` returns false, throws nothing and leaves `doingChat` as it found it.
- **I12. Plugin-facing contracts hold.** `sendChat`'s exported signature stays compatible (new
  fields are optional). `chatOutput` listeners still receive `characterIndex` and `chatIndex`;
  they are the origin's indices at the moment of the call. When the reply is gone they still run,
  with `messageIndex` -1, as upstream does; when the origin is gone they are not called.
- **I13. A call that carries an origin reads no selection to choose a target or to decide whether
  to run.** Its cold guard checks the origin chat; its id fill and the group order read the origin
  chat. Its remaining selection reads are W2c's.

## 5. Mechanism (non-normative)

- `SendChatArg` gains optional `origin`, `originHint` (`{owner, chat}`) and `continueMessageId`.
  The wrapper applies the refusals, then resolves the origin (or captures one from the selection
  with `beginWork` when absent), keeps the handle, creates one subject for the call from that
  origin and hint, and passes it to the body; the `finally` ends the handle and marks the origin's
  owner and member.
- Every write site uses the subject: resolve, write, done, in one synchronous statement group. The
  frozen `selectedChar`/`selectedChat` go; so do the slot self-assignments
  (`chats[selectedChat] = currentChat`) and the memory's frozen second writes and re-reads.
  `currentChat` stays as the prompt-building input; writes to it become writes to the resolved
  chat.
- The group loop passes `{ origin: { ...groupOrigin, memberChaId: order[i].id }, originHint }`.
  The child checks the member's presence in the resolved group's list and in `characters`, restores
  a cold member, and returns `true` (skipped) when the member is gone or duplicated.
- The cold restore lives in a small helper outside `characters.ts` and `coldstorage.svelte.ts`:
  both import `doingChat` from `index.svelte`, so importing either from the send creates a cycle
  and new mocks in the three `sendChat` harnesses.
- The stream finds the reply by `findMessageIndexByChatId` on each flush, after the subject
  resolves, and passes that index to `processScriptFull`.
- `sendMain` passes `workHandle.origin` and its held objects to `sendChatMain`; `reroll` and
  `runAutoMode` capture with `beginWork` and end it in their `finally`.
- **Auto mode's stop rule changes.** At HEAD it stops only on a character switch; a chat switch
  within the character sends the next round into the new chat. Under W2a it stops when the chat on
  screen is no longer its origin chat (the default stated in `MC-103`).

## 6. Performance

Resolution is a linear scan of `characters` by `chaId`, then of the owner's `chats` by id. Row
257 measured 130 µs at 1x and 950 µs at 6x CPU throttle for 1,000 characters × 20 chats, on the
i9-13900KF, production build, with a line-for-line re-implementation of the resolver. The run
subject memoises within one synchronous stretch.

- The non-streaming path adds a handful of resolutions per send: negligible.
- **The stream resolves once per flush** unless the fast path below applies. The measurement
  that decided this is below; Gate 2 re-runs it against the implemented fast path. These numbers
  are best-case hardware (Pi and mid-range phones are the floor).

**Measured (ledger row 309; rev 2.2).** On a production build with the real `chatOrigin.ts`, a
full resolution per flush adds, for 1,000 characters, about 0.28 ms at 1x and 2.2 ms at 6x per
flush where the flush both passes the reply's index to `processScriptFull` and writes after its
await (two resolutions); a group turn doubles it (4.2 ms at 6x, a quarter of a 16.7 ms frame).
Today's write-only flush costs 12 µs at 6x. In the default streaming mode every chunk flushes, so a
1,500-token reply gains about 3.3 s of main-thread work at 6x (6.3 s for a group turn). A long chat
adds a second term: finding the reply by id costs about 77 ns per message per call. Marking and the
identity tie-break are negligible. **The fast path is therefore required.**

**The fast path (normative rule).** The send keeps the indices of its last full resolution (owner,
chat, member, and the reply's message index) and reuses them for a flush only when all of these
hold, checked afresh at that flush:
- `characters[ownerIndex]` is **the hinted owner object itself** (`===`) and still carries the
  origin's `chaId`;
- its `chats[chatIndex]` is **the hinted chat object itself** and still carries the origin's chat
  id;
- for a group turn, `characters[memberIndex]` is the member object captured at the turn's start
  (after any cold restore) and still carries `memberChaId`;
- `message[replyIndex]` is **the tracked reply message object itself** and still carries the
  tracked reply id.
When the owner or chat check fails, the owner and chat fall back to a full resolution and their
indices are refreshed from it. The member and the reply are handled on their own:
- **The member** is re-found by the identity of its captured object (a scan of `characters` for
  that object), independent of the owner's fallback; when that object is no longer in `characters`,
  the member is resolved by id as before.
- **The reply** follows the same rule as the owner and chat, one level down. The send keeps the
  reply message object as an identity hint beside its id. When the cached index no longer holds
  that object, the reply is found again in the resolved chat's `message` by id: one holder is the
  reply (whether or not it is the hint, so a replacement message is adopted); several holders give
  the one that is the hint, and the write drops when none is; no holder means the reply is gone. No
  rescan of `characters` is needed for this.

*Why this equals a full resolution* (except for the member caveat and the two theoretical cases
below): when the hinted object sits at the verified index with the
origin's id, it is one of the id's holders. A full resolution then returns it whether it is the
only holder or one of several (`MC-104` 1's tie-break), so a duplicate created during the stream
cannot change the answer. A replacement object (a plugin's whole-slot write with the same ids)
fails the identity check and takes the full path, which adopts it; while the send writes to a
replacement rather than its hinted object, every flush takes the full path. The same reasoning
covers the member, except that a member whose `chaId` gains a second holder during the turn keeps
receiving its marks rather than being skipped mid-turn, on both paths, because the member is
re-found by identity; the skip of `MC-078`/N4 applies at the turn's start. The reply follows the
same argument with its own hint. Two theoretical divergences remain, neither a defect: a plugin
setting `coldstorage` in place on the hinted object (the full path would call it gone; the fast
path would not), and the same chat object held at two indices of one `chats` array (the write
target is the same; only the index given to `chatOutput` listeners could differ).

**Warnings.** The additive resolution does not warn when the tie-break succeeds, and a send warns
about an ambiguous origin at most once, not once per flush. To hold, the additive resolution
counts holders without calling `resolveCharacterByChaId` or `resolveChatInOwner`, which warn inside
their scans, and the member's identity re-find means the member's id scan (and its warning) runs
only when the captured object is gone.

## 7. Acceptance scenarios and tests

Red tests are written first, against HEAD, and each must fail on its behavioural assertion (not on
setup, an import or a missing export). They drive the real `sendChat` on the `sendChatSaveMarks`
pattern (happy-dom, a real `$state` database, the real encoder round trip), with the stream fed by
a controllable `ReadableStream` so that edits happen between chunks. Where a scenario needs group
members, `findCharacterbyId` is a faithful fake: it returns the live member, or a blank character
with a fresh `chaId` on a miss, as production does.

1. **Branch during the stream.** Unshift a copy of the origin chat between chunks. The whole reply
   is in the origin chat; the copy is unchanged; after encode → decode the same holds.
2. **Permanent delete of a lower-index character during the stream.** The reply lands in the
   origin; the character that moved into the old index is unchanged.
3. **Two-member group, character switch between turns.** Both turns generate into the group chat,
   as their own members; the other character is unchanged.
4. **Auto-continue after a chat switch within the character.** The continuation appends to the
   origin chat's reply; the other chat's last message is unchanged.
5. **Delete of the origin chat during the stream.** No throw, no error alert, nothing written to
   any other chat, no recursion, `doingChat` cleared; the registry is empty afterwards;
   `isWriting` was true for the origin during the send.
6. **Memory result after a Branch during the memory await** (HypaV3 and SupaMemory at least). The
   summary is only on the origin chat.
7. **Group members:** a member removed from the group between turns, and a member permanently
   deleted between turns: their turn is skipped, the other turns run, and no message carries an
   unknown `saying`. A member whose `chaId` has two holders: skipped. A cold member: restored, and
   their turn runs, including when a character is inserted below them during the cold read. A cold
   member whose restore fails: `coldStorageRestoreFailed`, and the group turn stops.
8. **Switch or Home before generation**, on this harness: `sendChat(-1, {origin, originHint})`
   while another chat, another character, a cold chat that is still loading, or Home is selected.
   The send generates into the origin; the chat on screen is unchanged; no cold-guard error.
9. **Composer hand-off**, on the composer suite with `sendChat` mocked: Home and a switch between
   the take and the hand-off, and during the mocked send. No unhandled rejection and no
   `alertError`; the origin and hints are passed down; the reroll snapshot is the origin's new
   messages, measured from its length before the send. The chat switched to has a different
   message count from the origin, or the switch variant cannot fail at HEAD.
10. **`sendChat(-1)` at Home.** Returns false; no throw; `doingChat` unchanged.
11. **The reply deleted during the stream,** with `autoContinueChat` on, with an earlier `char`
    message that carries `generationInfo`, and with the user's message (the one the send answers)
    left as the chat's last message once the reply is gone. No throw; no later chunk, tail write or
    continuation lands anywhere; the earlier message's `generationInfo` and the user message are
    unchanged. Separately, **an earlier message deleted** during the stream: the reply is still
    complete and correct.
12. **Non-streaming continue:** the replaced message's new id is followed; with an earlier message
    deleted or inserted during the inlay-promise await, the inlay write still lands on it. (Without
    that disturbance the scenario passes at HEAD and is a guard.)
13. **A duplicated chat id during the send:** a plugin-style copy that keeps the id is **unshifted**
    in front of the origin chat, before Send and, separately, during the stream. The send
    generates, and the reply lands in the chat it was sent from; the copy is unchanged. A pushed
    copy is kept as a guard (HEAD writes correctly there). The existing ambiguous-origin guard in
    `sendChatTriggerWrites` keeps passing (the send carries on and generates; the trigger's write
    does not land).
13b. **The fast path equals a full resolution.** Through a test-only hook, on every flush, the
    indices the send used equal those of a fresh full resolution with the tie-break (owner, chat,
    member and reply), while these edits happen between chunks: a whole-slot replacement of the
    origin character and, separately, of the chat (adopted, then every later flush takes the full
    path); an in-place change of the chat id; a chat reorder during a group turn (the owner falls
    back, the member stays found by identity); a copy of the reply message, keeping its id, inserted
    before it (the reply stays the hinted message). The hook is internal and not part of any
    plugin-facing surface.
13c. **An output trigger that rebuilds the chat without message ids** (as Lua `setFullChat` does),
    streaming and non-streaming: the send returns true; TTS, the emotion request and the
    `chatOutput` listener (with `messageIndex` -1) run; nothing is written as the reply's inlay,
    `generationInfo` or image-prompt append; no continuation. In a two-member group, the second
    member still speaks. Separately, the user deleting the reply during the first member's turn: the
    second member still speaks.
13d. **Tail writes go to the reply, not the last message:** an output trigger appends a message
    that carries `generationInfo` after the reply, with `igpPrompt` set. The image-prompt text and
    the final `generationInfo` land on the reply; the appended message is unchanged.
13e. **A cold member deleted during their restore:** their turn is skipped, no alert, and the other
    members speak.
13f. **Warnings and gone exits:** a send in a chat whose id is duplicated, streamed over many
    flushes, logs the ambiguity warning at most once. A group chat deleted between two turns ends
    the send with `doingChat` cleared by the send itself, not only by its caller.
13a. **Auto-continue after an output trigger appends a message** after the reply, with
    `autoContinueChat` on and a reply without ending punctuation: no continuation runs, and neither
    the reply nor the appended message changes.
14. **`{{setvar}}` in the chat, after a switch:** through the real parser, the variable is set in
    the origin chat, not in the chat on screen. If the real parser cannot run inside the send
    harness, the fallback assertion is that both parses receive `runVar: true` and a subject that
    resolves to the origin; that assertion is red at HEAD.
15. **`throwError` after a Branch:** the error line is in the origin chat.
16. **Reroll and auto mode:** a reroll followed by a switch generates into the reroll's chat; auto
    mode stops after a chat switch within one character (red at HEAD, where it sends into the new
    chat).
17. **Guards (pass before and after):** the existing `sendChatSaveMarks`,
    `sendChatTriggerWrites`, `sendChatColdGuard` and composer suites; a plain send with no switch
    writes exactly what HEAD writes (message contents, `generationInfo`, memory data); DevTool's
    `sendChat(i)` on a selected group picks member `i`.

Plus the measurement in section 6.

## 8. Compatibility

- No saved field is added, removed or renamed. Upstream characters, groups and chats load and send
  as before.
- `sendChat(chatProcessIndex, arg)` keeps its signature; `SendChatArg` only gains optional fields.
  The plugin v3 `sendChat` and v2 `chatOutput` listeners keep their shapes (I12).
- A plugin that replaces the origin chat or character object during a send (with the same ids)
  now receives the send's writes on the replacement; at HEAD they went to the replaced object, or
  to whatever sat at the frozen index.
- Behaviour with no switch or edit during the send is unchanged (guard 17), except for three
  deliberate changes:
  - auto mode's stop rule (section 5);
  - when a trigger appends a message after the reply, the tail writes (the image-prompt append,
    both `generationInfo` writes) go to the reply, where HEAD wrote them to the last message;
  - in that case auto-continue does not run, where HEAD continued the last message;
  - when an output trigger rebuilds the chat without message ids (Lua `setFullChat`), the reply
    can no longer be identified, so auto-continue and the image-prompt append do not run for it,
    where HEAD continued and appended to the last message. The rest of the send runs as at HEAD.
    This follows the rule of never guessing a target (`MC-078`, `MC-104`), and is disclosed rather
    than decided by the maintainer.

## 9. Risks

- **The composer's handle outlives generation** (row 305, section 10). `sendMain`'s `finally` runs
  after `await sendChatMain`. The new per-call registration must not replace it or end it early.
- **The wrapper's marks.** `sendChatSaveMarks` pins that the original character is marked after a
  switch. Marking by origin keeps that; the index-based second mark goes.
- **The blank member.** `findCharacterbyId` still returns a blank character to other callers. Only
  the send's group turn stops using it to pick a member.
- **The cold restore inside a send** replaces the member's whole slot. Anything the send holds for
  that member must be read back after the restore.
- **`chatOrigin.ts`** gains an additive resolution. Its existing tests must pass unchanged, and
  Gate 2 reviews it as a shared contract.
- **Self-assignments.** Removing `chats[selectedChat] = currentChat` is a signal no-op (Gate 1
  checked svelte 5.56.8's `proxy.js` and `sources.js`); the guards and the live check confirm it.
- **Stream cost** on slow hardware (section 6).
- **`doingChat`.** The flag stays W2b's; W2a adds clears only on its new gone exits and moves the
  Home entry return before the flag is set.

## 10. Files expected

- `src/ts/process/index.svelte.ts`
- `src/ts/process/composerActions.svelte.ts`
- `src/ts/process/chatOrigin.ts` (additive)
- a small cold-restore helper under `src/ts/process/` (new)
- New or extended tests under `src/ts/process/tests/`, and the `sendChatSaveMarks` header.

## 11. Review

Gate 1: `opus-reviewer` (persistence), asked to falsify this plan. Gate 2: `opus-reviewer`, fresh,
with the diff, the red-test evidence and the measurement. A live check on a production build with
Echo follows Gate 2.

## 12. Gate record

- **Gate 1 round 1 (rev 1; ledger row 307): [REJECT].**
  - S1: ending the send on an ambiguous origin contradicted guard 14, reversed W1a's T5, and made
    Send a silent no-op in a chat with a duplicated id. → `MC-104` 1: the identity tie-break
    (section 2, I8, scenario 13).
  - S2: a cold group member would be skipped for good. → `MC-104` 2: restore (I7, scenario 7).
  - S3: `sendChatMain`'s pre-send read, and the entry stretch of an origin-carrying call, still
    read the selection; no scenario covered a switch before generation. → I13, I9, scenarios 8-9.
  - S4: with the reply deleted, the tail writes and the auto-continue hit other messages; the
    non-streaming continue changes the reply's id. → reply tracked by id (section 2, I5,
    scenarios 11-12).
  - S5: I1/I2 were universal while `@@inject`, the Lua edit triggers and tool calls still write to
    the selection. → carved out and called writes (section 3, I1, I2).
  - S6-S13 (MINOR): I7 narrowed; the subject is built from the given origin, after the refusals;
    DevTool's `sendChat(i)`; the stale preview at Home (W2b); the amendment's wider rebinding;
    auto mode's stop rule disclosed; scenario fixes; the continued message's id fill.
  - E1-E5: the parse count, the await count, the read count, the stale comments to update, and
    the W-4 departure.
- **Gate 1 round 2 (rev 2; ledger row 308; the round-1 reviewer, reused): [EDITORIAL].** Every
  round-1 finding verified resolved; the identity hint, the cold restore, reply tracking, I13 and
  the Out list hold up in design. Required text, applied in rev 2.1:
  - N1: the send's trigger runs keep `MC-078` in a chat with a duplicated id; disclosed (section 2,
    I8) for the maintainer.
  - N2: the cold restore re-finds the placeholder by `chaId` after its await; a helper avoids the
    import cycles.
  - N3: auto-continue runs only while the reply is the chat's last message (section 2, I6,
    scenario 13a).
  - N4: a member whose `chaId` has two holders is skipped.
  - N5: scenario 12 needs a disturbance to be red; scenario 13's reproducer unshifts the copy;
    scenario 9's switched chat differs in length; scenario 11's user message stated.
  - E1-E4: `@@repeat_back` is a read; the "no selection" claims narrowed to targets and the run
    decision; the no-switch behaviour changes listed in section 8; I3's CHORE-28 exception.
  The Orchestrator verified each correction against the finding and closed the round. **Gate 1
  passed.**
- **Fast-path addendum (rev 2.2; ledger row 311; the same reviewer): [EDITORIAL].** The measurement
  is consistent with row 257, and the owner and chat equivalence holds in every listed case; the
  addition does not reopen Gate 1. Required, applied in rev 2.3: F1, the reply's own identity hint
  (the full path's `findIndex` would pick the first of two messages sharing the id); F2, the member
  re-found by identity after any cold restore, independent of the owner's fallback; F3, the
  additive resolution counts holders without the warning scans; F4, scenario 13b and a re-run of
  the measurement at Gate 2; E1 and E2, the stale "may be added" text and the scope of the
  equivalence claim.
- **Gate 2 round 1 (the implementation; ledger row 315; `opus-reviewer`, fresh): [REJECT].**
  - M1 (MAJOR): a missing reply ended the send. An output trigger that rebuilds the chat without
    message ids (Lua `setFullChat`, a stock upstream API) therefore silently dropped TTS, emotion,
    the listeners, the notification, a requested resend and the remaining group members; the
    reviewer reproduced it against HEAD and the working tree. The plan had considered only a user
    deleting the reply. → Rev 2.4: a missing reply drops only the writes addressed to it; the send
    carries on and returns true; the listeners run with `messageIndex` -1, as upstream (section 2,
    I5, I12, scenario 13c). This restores upstream behaviour under `MC-011` for everything that
    does not write to the reply. Two upstream behaviours still differ after such a rebuild:
    auto-continue and the image-prompt append, which HEAD aimed at the last message, do not run
    (section 8).
  - m1: the positive tail-write rule was untested (two surviving mutants). → Scenario 13d.
  - m2: a cold member deleted during their own restore gave a spurious failure. → I7, scenario 13e.
  - m3: the warn-once rule and a group chat deleted between turns were untested. → Scenario 13f.
  - E1-E4: the cold helper's cycle comment, the "no holder left" comment, the "only" in the reply
    hint comment, and a stale comment in `dbChangeEffects.svelte.ts` that cites `throwError`'s old
    guard (in scope as a comment this change makes false).
  - Accepted implementer decisions, recorded here: `throwError` still shows a real provider error
    through `alertError` when the origin is gone; a send that produced no reply (an empty multiline
    result) runs no auto-continue or image-prompt append.
  - Checked sound: the write inventory, the fast path, registration, the composer hand-off, the cold
    restore's `chaId` re-find, `chatOrigin.ts`'s existing contract; 32 of 38 mutants killed, all
    three requested ones among them.
- **Gate 2 round 2 (the remediation; ledger row 316; the round-1 reviewer, reused): [EDITORIAL].**
  Every round-1 finding verified resolved, with no new behavioural defect; the I5 split judged
  sound. The M1 probe now matches HEAD; the pre-remediation tree fails 7 of the new tests on
  behaviour; 33 of 40 mutants killed, including the four round-1 survivors. Required:
  - E-a: the mid-stream-delete test's title claimed "nothing follows", and it did not assert that
    the send carries on. → Retitled, `result` asserted true, and a chunk added after the delete so
    the mid-stream branch runs. The Orchestrator confirmed the mutant `streamDeletedEnds` now fails
    4 tests (it survived before) and the file passes.
  - E-b: the round-1 record and section 8 overstated "restores upstream behaviour". → Corrected;
    section 8 lists the rebuild case.
  Optional, not taken: skip the image-prompt request when there is no reply to append to (O1);
  align the non-streaming continue whose target is already missing with the streaming one (O2); an
  overlong comment line (O3). **Gate 2 passed.**
- **Live check (ledger row 317): passed.** Production build, Node server, Echo (6 s, non-streaming):
  a chat switch, a New Chat unshift, Home, and a delete of the origin chat, each during the wait;
  every reply landed in its origin or nowhere, with no alert, and the save held each message once.
- **Commit-message check (ledger row 318; the Gate 2 reviewer): [EDITORIAL], applied.** The
  pre-change count corrected to 76 behavioural failures (74 reproducers, 2 pinning the deliberate
  change after a chat rebuild); the W2c/W2d carve-out, the two missing-reply cases and the
  performance tense stated; five tests that pass before and after labelled `guard:`.
