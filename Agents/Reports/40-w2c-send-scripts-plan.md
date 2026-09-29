# Report 40 — W2c: the send's scripts, Lua edit triggers and lorebook read the send's chat

**STATUS:** plan rev 5.1, 2026-09-29. **Gate 1 passed.** Rounds 1-4 [REJECT] (ledger rows 357-359,
362), with a `senior-advisor` escalation (row 360) and a measurement (row 361) between rounds 3 and
4. After round 4 the maintainer split the prompt's index tags and hidden-message rule (`MC-111`,
`MC-112`) into their own stage, W2c-c (`MC-113`); rev 5 is W2c-a without them. Round 5 [EDITORIAL]
(row 363), applied in rev 5.1. **Gate 2 passed; live check passed.** Section 12 is the gate record.

W2c binds the send's own reads to the chat the send started in. W2a (`ec65c200`, Report 35) gave
the send one origin and bound every write its own code makes. W1b (Report 34) built the target
mechanism for the parser, modules, persona and lorebook, and bound every caller outside the send.
What remains in the send are its parser calls, its scripts, its Lua edit triggers, its lorebook
scan and a few helpers. They still read the selection, and three of them write to it.

**Split (ledger row 355, `MC-113`).** W2c is three stages, each with its own plan, gates and commit:
- **W2c-a (this plan):** the script pass (`processScript`, `processScriptFull`, the `@@inject` and
  `@@repeat_back` branches), the send's Lua edit triggers and the lorebook scan read and write the
  send's chat; and `MC-110` 3: `@@inject` and `@@repeat_back` in the prompt-building pass address
  the real message. Every persistent cross-chat write left in W2c is here, and so is the per-flush
  cost.
- **W2c-b:** the 36 prompt parses in `sendChatBody`, `getPersonaPrompt`, `getModuleToggles`, the
  prompt's `getModuleAssets`, and the helpers `exampleMessage`, `additionalInformations` and
  `supaMemory`'s user name read the send's chat. These read only.
- **W2c-c:** `MC-111` and `MC-112`: the prompt's index tags describe the message being processed,
  and every look-back while the prompt is built skips hidden messages, with the script cache made
  sound for it. Its plan starts from a complete inventory of every parse that builds the prompt;
  the material from W2c-a's rounds 2-4 (section 12) is its starting evidence.

**Decisions this plan implements:**
- `MC-095` 2: W2 binds the send's parser calls, its lorebook call and its scripts under the send's
  one origin, through W1b's mechanism.
- `MC-110`:
  1. the send's reads follow its writes: in a chat whose id has two holders, they read the chat the
     send started in (`MC-104` 1);
  2. the send's Lua edit triggers choose which triggers run from the send's chat, but the Lua's own
     chat reads and writes keep `MC-078`;
  3. `@@inject` and `@@repeat_back` in the prompt-building pass address the real message when the
     chat has disabled messages.
- `MC-113`: `MC-111` and `MC-112` are W2c-c's; in W2c-a the tags, walk-backs and script cache of the
  prompt-building pass keep their upstream behaviour.
- `MC-103` 3: Home, or a switch, during a send does not stop it.
- `MC-075` 2: a write that finds its origin gone is dropped silently.
- `MC-011`, `MC-089`: upstream data compatibility is the invariant; fork-local behaviour is not
  worth preserving, and nothing ships between stages.

## 1. What is wrong at HEAD

Evidence: ledger rows 355 (packet in the session scratchpad, `w2c/packet.md`), 356 (the harness
spike, `w2c/spike/`), 357 and 362 (Gate 1 probes, `w2c/gate1/` and `w2c/gate1r4/`). File
references are dated to `5e4a2bfd`; `src/` at `9dee3ea9` is the same for everything here.

1. **The send's script pass reads and writes the selection.** None of the five script calls in
   `sendChatBody` passes an origin: `processScript` for the first message, `processScriptFull` in
   the prompt-building loop (`editprocess`), the streamed reply (`processAndWriteReply`), and the
   non-streamed reply and its continue. Inside, the module regex list, the script parses, the
   dynamic-asset lookup, and the `@@inject` and `@@repeat_back` branches read the selection
   (`db.characters[get(selectedCharID)]`). After a switch mid-send, the other chat's module regex
   transforms this chat's reply and prompt, and this chat's own module regex is not applied (row
   356).
2. **`@@inject` writes to the selection.** In the streamed reply it writes the pre-removal text to
   `message[replyIndex]` of the selected chat, on every flush where the pattern matches. The send
   then overwrites its own reply, so absent a switch nothing shows. After a switch, the other
   chat's message at that index is overwritten (row 356). That chat is the selected one, which the
   database's change tracking saves, so the damage persists. The non-streamed reply does the same
   when the selection has moved: its index is the send's chat length, which in the other chat can
   name an existing message, so `@@inject` overwrites it and `@@repeat_back` reads that chat (row
   367). The accidents in item 3 hold only while the selection is on the send's chat.
3. **Two load-bearing accidents on the non-streamed first reply, upstream included.** There,
   `chatID` is `message.length`, so the message does not exist yet.
   - `@@inject`'s write throws inside `executeScript`'s `try`, so the branch's own
     `data.replace(reg, "")` never runs, and the script changes nothing.
   - `@@repeat_back` reads `chat.message[chatID].role` and throws the same way in any non-empty
     chat, so it appends nothing. In an empty chat (`chatID` 0) its loop does not run and it
     appends.
4. **The Lua edit triggers act on the selection.** `editRequest` (twice, before the request) and
   `editOutput` (each flush, through `processScriptFull`) run with every chat and owner write
   binding. Since W1b those bindings resolve through an origin when the call carries one. The send
   passes none. So the message bindings act on the chat that was selected when each call began,
   while `setChatVar`/`getChatVar` and the owner bindings read the live selection at each call. The
   module triggers themselves are chosen from the selection's modules. After a switch, a Lua
   `editOutput` `setChatVar` lands in the other chat (row 356).
5. **The lorebook scan reads and writes the selection.** `loadLoreBookV3Prompt()` reads the selected
   character's and chat's lore, and the selection's module lore, and writes its
   `@@keep_activate_after_match` / `@@dont_activate_after_match` flags into the selected chat's
   `scriptstate`. After a switch, the prompt holds the other chat's lore (row 356). At Home, an
   always-active entry from a global module carrying one of those decorators throws in
   `setChatVar` (`characters[-1]`), and the send rejects with no request (row 357, by execution).
6. **`@@inject` and `@@repeat_back` in the prompt pass address the wrong message.** The
   `editprocess` loop passes the position in `ms` (which skips disabled messages and starts after
   an `allBefore` reset) as `chatID`, and both branches index the chat with it. So with a disabled
   message or a reset, `@@inject` writes CBS-expanded prompt text into another message (row 357, by
   execution), and `@@repeat_back` compares against another message's role. Upstream has the same
   defect. (The index tags have it too; they are W2c-c's, `MC-113`.)

## 2. The design

**The send passes its `SendSubject` to its script pass and its lorebook scan, and uses it to choose
its Lua edit triggers.** The `SendSubject` (W2a) resolves the send's origin with the send's
identity hints (`MC-104` 1), through a fast path that does no scan while the chat and its owner
are where they were.

- **Reads.** With a subject, every read the script pass, the Lua trigger selection and the lorebook
  make of the owner, its chat, its modules or its persona reads the subject's resolution, exactly as
  W1b's R1 defines for trigger runs. In a group send the resolution is the group and its chat, which
  is what the selection is absent a switch.
- **No fallback.** A subject that is gone reads an empty chat with no owner (W1b's R6), never the
  selection.
- **Writes.** `@@inject` and the lorebook flags resolve, write and mark in one synchronous stretch,
  and land in the send's chat or nowhere.
- **Lua edit triggers (`MC-110` 2).** Which triggers run (module triggers, and the character's own)
  is chosen through the send's subject. The Lua bindings get a subject built from the origin alone
  (`createRunSubject`), which keeps `MC-078`: a chat whose id has two holders reads as empty and
  takes no writes, as the send's start and output trigger runs already do. The text the triggers
  return is used either way. Absent a switch, the Lua sees and does what it does at HEAD,
  including in a group (S5): its variable defaults come from the chat's owner, read through the
  Lua's own subject (never the `SendSubject`, whose hint would break `MC-078`), and the runner-type
  check on `upsertLocalLoreBook` applies as at HEAD, so a group module's `editOutput` still does not
  upsert, and a member's `editRequest` still does. The origin the Lua gets carries no group member:
  it resolves the owner and chat exactly as the full origin does, and the only bindings that read
  the member are `upsertLocalLoreBook`'s gating and `generateImage`, which edit triggers cannot
  reach (no low-level access). `upsertLocalLoreBook` itself is not changed; it is shared with
  trigger runs.
- **The `@@` branches address a message, not an index.** Each script call that can reach them
  names the message they act on: the reply (streamed, non-streamed and continue) or, in the prompt
  pass, the message being processed (`MC-110` 3). The message is identified when the call starts
  and found again in the send's chat when a branch runs.
  - `@@inject` writes that message, or, if there was no such message or it is no longer in the
    chat, skips the whole branch including its `replace` (section 1 item 3).
  - `@@repeat_back` compares against that message's role and walks back from its position in the
    chat, over the whole chat, as it does on the reply at HEAD, with HEAD's first-message fallback.
    When there is no such message, it appends nothing in a non-empty chat and appends in an empty
    one, as at HEAD.
- **Everything else in the prompt pass keeps HEAD's `chatID`.** The position in `ms` stays the
  `chatID` the parser, the index tags and the script cache's key see (`MC-113`). The real position
  of the processed message goes into the key as well, since `@@repeat_back`'s output now depends on
  it; the key is otherwise unchanged, and so is its staleness, which is W2c-c's.
- **Finding the message is never quadratic.** The prompt pass knows each message's chat index from
  when `ms` was built; a lookup checks it by identity against the send's chat, and on a failed check
  rebuilds a map from message to index in one pass, validating every later map hit by identity. A
  message absent from a fresh map, or whose map hit fails validation after the pass's one rebuild,
  counts as gone. On the reply, the message is the tracked reply (W2a).

**A consequence to disclose, until W2c-c.** HEAD's `@@repeat_back` walk already crosses disabled
messages, from the `ms` position. Rev 5's walk starts from the real message, so which disabled
message it can reach changes. `MC-111` 2 (W2c-c) makes the walk skip them. Nothing ships between
the stages (`MC-089`).

## 3. Scope

**In W2c-a:**
- `scripts.ts`: `processScript` and `processScriptFull` accept the send's subject and, for the
  `@@` branches, the message they act on (both additive; an `Origin` caller keeps its behaviour).
  With the subject, the parses, the module regex list, `@@inject`, `@@repeat_back` and the
  dynamic-asset lookup use it.
- `scriptings.ts`: `runLuaEditTrigger` accepts the send's subject for its trigger selection and
  gives `runScripted` the origin, with the adjustments S5 needs in a group.
- `index.svelte.ts`: the five script calls, the two `editRequest` calls and the lorebook call pass
  the send's subject; the prompt pass and the reply calls name the message for the `@@` branches.
- `sendCharacterMessage.ts` (the `editinput` script): builds a `SendSubject` from the work handle's
  origin with `{ owner: char, chat: startChat }` as its hint and passes it, so that `editinput` in a
  duplicated-id chat reads the chat the message is appended to (`MC-110` 1); its Lua follows
  `MC-110` 2. **Scope amendment (`MC-091`):** same API change, same defect; the packet's B-4.
- `loadLoreBookV3Prompt` already accepts a `RunSubject`, and its snapshot works over a
  `SendSubject` (row 357); `lorebook.svelte.ts` needs no change.
- Comments this change makes false, at least: the "Resolved once, here" comment in
  `runLuaEditTrigger`, `runScripted`'s "unchanged for `runLuaEditTrigger`", and
  `sendCharacterMessage`'s doc comment.

**Not in W2c-a:**
- W2c-b's reads and W2c-c's rule (above), including the send's entry `runCurrentChatFunction` pass
  and chatML template items (row 362), which W2c-c's inventory takes.
- The request layer, tool calls, graph memory, `templates/*` and the `request` trigger (W2d).
- `editdisplay`, rendering, `runLuaButtonTrigger`, the plugin API's `processScriptFull`, the
  translator, `HypaV3Modal`, `Toggles.svelte`: screen-bound by design (Report 34 section 3).
- The script cache's staleness for an `out` that reads chat state (packet B-3; rows 360-361): the
  prompt pass's use of the cache is W2c-c's; elsewhere it is upstream behaviour.
- The cache's 1,000-entry FIFO misses every lookup on a repeat send in a chat of about 1,000
  messages or more (row 361); pre-existing and upstream. A Roadmap chore (`MC-069`): CHORE-45.
- `if (DBState.db.personaPrompt)` gating the bound persona's prompt (packet B-2): W2c-b decides.

## 4. Invariants

- **S1. The script pass reads the send's chat.** Every per-chat or per-character read that
  `processScript`/`processScriptFull` make for the send (module regex, parses, `@@` branches,
  dynamic assets) reads the send's owner and chat as its subject resolves them, whatever the
  selection is, including Home.
- **S2. `@@inject` writes the message it was called for, in the send's chat, or nothing.** It never
  writes to another chat or another message. A write is marked for save in the same synchronous
  stretch. If the message did not exist when the call started, or is gone when the branch runs, the
  branch does nothing, and the data passes on unchanged by it.
- **S2b. `@@repeat_back` reads the message it was called for, in the send's chat.** Its role and its
  walk-back start from that message; with no such message it behaves as at HEAD (section 2).
- **S3. The Lua edit triggers the send runs are chosen from the send's chat's modules and owner.**
  Their chat and owner bindings read and write the send's chat under `MC-078`: never the
  selection, and nothing in a chat whose id has two holders.
- **S4. The lorebook scan reads the send's owner, chat and modules.** It does not throw at Home, and
  its flag writes land in the send's chat, marked, or nowhere.
- **S5. No switch, no change.** With the selection on the send's chat throughout, every output (the
  request, the reply, the flags, the injected message, the Lua's reads and writes, what gets saved,
  and what the script cache holds) equals HEAD's, single and group, on every path: the streamed
  reply, the non-streamed first reply, the non-streamed continue, and the prompt pass. Exceptions:
  `MC-110` 3 in a chat with a disabled message or an `allBefore` reset, for `@@inject` and
  `@@repeat_back` only; and a message deleted or moved during the send (reproducer 3), where the
  `@@` branches act on the message by identity or not at all.
- **S6. Duplicated id (`MC-110` 1).** In a chat whose id has two holders, the script pass and the
  lorebook read and write the holder the send started from, whatever the selection is; the Lua
  bindings follow S3.
- **S7. Other callers are unchanged.** A call with no subject and no named message behaves as at
  HEAD: the plugin API's `processScriptFull`, the HypaV3 modal, display, the translator.
- **S8. No ambient subject.** The subject travels as an argument (W1b's R9).
- **S9. Cost.** An undisturbed stream does no full resolution per flush for a card without a Lua
  `editOutput` trigger. With one, each Lua trigger run costs at least one full resolution, as a
  trigger run does today; Gate 2 measures it. Finding the prompt pass's messages costs at most one
  O(n) map rebuild per pass, then O(1) per lookup; no step added by W2c-a is quadratic in the
  chat's length.

## 5. Mechanism (non-normative)

- An optional `subject?: RunSubject` after the existing `origin` parameter of `processScript`,
  `processScriptFull` and `runLuaEditTrigger`; the subject is used for reads, the origin for the Lua
  bindings. An optional message reference (the message object and its index when the call starts)
  for the `@@` branches.
- `runScripted` must still receive `origin`: its `getVar`/`setVar` defaults are chosen by whether
  an origin is passed, and without one Lua `setChatVar` falls back to the selection.
- S5 in a group: pass `runScripted` the origin without `memberChaId`, and an explicit `getVar`
  such as `getChatVar(key, luaSubject)` over the Lua's own `createRunSubject`, which takes defaults
  from the owner. Optional: skip `runScripted`'s post-run resolve for edit triggers, whose `chat`
  result `runLuaEditTrigger` discards.
- `@@inject` / `@@repeat_back`: at write or read time resolve the subject, check
  `chat.message[index] === message`, and fall back to the pass's map (section 2) only if not.
- The key: append the real index only when a message reference is given **and** its index differs
  from `chatID`, as a suffix with a terminator no HEAD key ends with (HEAD keys end in `0`, `1` or
  `|`), for example `\u0000ref=N\u0000`. So no reply key and no prompt-pass key changes unless a
  message is disabled or reset, a suffixed key never equals an unsuffixed one, and two suffixed
  keys cannot align.

## 6. Performance

Report 35 section 6 measured a full resolution at +0.28 ms per flush at 1x and +2.2 ms at 6x, and
the `SendSubject` fast path at +6 µs per flush at 6x. Passing the bare origin to the per-flush calls
would add full resolutions per flush. With the send's subject, a flush adds at least four fast-path
resolutions and the module lookups HEAD already does, and no full scan while nothing moves. A card
with a Lua `editOutput` trigger adds a full resolution per trigger run (S9). Gate 2 re-runs W2a's
measurement with `resolutionCountForTests`, with and without a Lua `editOutput` trigger. The prompt
pass's cache behaviour is unchanged (row 361 measured it). All figures are from an i9-13900K(F);
the project targets Pi-class and mid-range phones, roughly 10-15x slower.

## 7. Acceptance scenarios and tests

Tests are written first and must fail at HEAD on the behaviour they name. Harness: the spike's
(row 356), in the repository: the real `sendChat` with the real parser, `scripts.ts`,
`scriptings.ts` (wasmoon), `modules.ts` and `lorebook.svelte.ts`; `requestChatData` mocked; the real
`structuredClone` polyfill. `resetScriptCache()` at the start of every test, and distinct chunk text
per path, because the script cache's key collides between the non-streamed first reply and a
streamed reply at the same index. `runCurrentChatFunction` rewrites every message's text at each
send's entry, so fixtures must not rely on a message's own tags surviving a send. Lua reproducers
use `setChatVar`.

Reproducers (fail at HEAD):
1. **Module regex after a switch.** Chat A's send; the selection moves to B between two stream
   chunks; B's modules add an output regex and A's modules add another. A's reply has A's regex
   applied and not B's.
2. **Streamed `@@inject` after a switch.** A's streamed reply with an `@@inject` script; switch to
   B (which has a message at the reply's index) between chunks. B's message is unchanged; A's
   reply is correct.
3. **`@@inject` addresses the message, not the index.** During a flush's await, a message before
   the reply is deleted. The reply is written, and the pattern is stripped from the reply's text;
   no other message changes. (At HEAD the write throws past the end and the pattern stays.)
4. **Lua `editOutput` after a switch.** A Lua `editOutput` trigger calls `setChatVar`; switch to B
   mid-stream. The variable lands in A's chat, marked; B's is unchanged.
5. **Lua `editRequest` after a switch** before the request: its `setChatVar` lands in A.
6. **Module Lua triggers are chosen from A's modules** after a switch to B with different modules.
7. **Lorebook after a switch.** A switch at the send's first awaits: the prompt holds A's lore, not
   B's, and a decorated entry's flag lands in A's `scriptstate`, marked.
8. **Lorebook at Home.** Home at the send's first awaits, with an always-active entry from a global
   module carrying `@@keep_activate_after_match`: the send does not throw, and the flag lands in A.
9. **Prompt-pass `@@inject` with a disabled message** (`MC-110` 3): `@@inject` writes the message
   being processed, not the one at its position in `ms`. Also with an `allBefore` reset and no
   disabled message.
9b. **Prompt-pass `@@repeat_back` with a disabled message** (`MC-110` 3): the chat
   `[c0 "c0 TAGc0", D (user, disabled) "D TAGD", u2 "u2 TAGu2", c3 "c3"]`, processing c3. HEAD
   compares against u2's role and appends `TAGD`, the disabled message's text; the fix compares
   against c3's role and appends `TAGc0`. The expected value reads no hidden message.
11. **Duplicated id, with a switch** (`MC-110` 1): A's chat id has two holders; the selection moves
    to the other holder mid-send. The script pass reads, and `@@inject` writes, the holder the send
    started from.
12. **Duplicated id, Lua** (`MC-110` 2): the Lua `setChatVar` goes nowhere; its returned text is
    used.
13. **`editinput` in a duplicated-id chat, with a switch to the other holder** reads the chat the
    message is appended to.

Guards (pass before and after):
- G1. The non-streamed first reply with `@@inject`: the output is unchanged by the script.
- G1b. The non-streamed first reply with `@@repeat_back` in a non-empty chat appends nothing; in an
  empty chat it appends.
- G1c. The non-streamed continue with `@@inject` and `@@repeat_back`: output as at HEAD.
- G2. No switch: request, reply, flags, injected message and saved data equal HEAD's, single and
  group (S5).
- G2b. No switch, group: a group module's Lua `editOutput` calling `upsertLocalLoreBook` writes
  nothing; a member's `editRequest` Lua reading an unset variable gets the group's default, not the
  member's.
- G2c. The prompt pass's index tags (`{{chat_index}}`, `{{previouscharchat}}`) with a disabled
  message give HEAD's output (`MC-113`).
- G3. Other callers: the plugin `processScriptFull`, the HypaV3 modal and display, unchanged.
- G4. A group send's Lua `editRequest` runs the member's triggers and the group's modules.
- G5. Resolution count on an undisturbed stream (S9).
- G6. Duplicated id, no switch: the script pass reads the holder the send started from (as HEAD
  does through the selection).

**A happy-dom suite with a proxied (`$state`) database and no Lua.** The node harness compiles
`$state` unproxied (row 358), so identity checks and their cost are invisible to it. This suite
covers: the prompt pass's `@@inject` with a disabled message; `@@inject`'s re-find after an earlier
message is deleted; and a cost guard on a 2,000-message chat showing the prompt pass rebuilds its
map at most once (a count of rebuilds or fallback searches, not a timing).

## 8. Compatibility

No data format changes. Upstream cards, modules and presets see identical output absent a switch,
except `MC-110` 3: with a disabled message or an `allBefore` reset, `@@inject` and `@@repeat_back`
in the prompt pass address the message being processed (and `@@repeat_back`'s walk may reach a
disabled message until W2c-c). Plugins: the v3 `processScriptFull` keeps its signature and
behaviour.

## 9. Risks

- The two accidents (section 1 item 3): a guard that skips only the write, or a `?.` on
  `@@repeat_back`'s read, would change upstream output.
- `processScriptCache` returns before the `@@` side effects on a hit. Tests reset it at the start
  of each test.
- `getModules`' single-entry cache alternates between the render path and the flush after a switch
  to a chat with other modules; correct output, extra work, to be measured.
- `getChatVar(subject)` initialises an empty `scriptstate` on the target chat.
- The Lua subject must not drift to the hint: that would silently break `MC-078` for edit triggers,
  and only a duplicated-id test catches it. A view over the `SendSubject`'s fast path cannot keep
  `MC-078`, because the fast path does not detect a second holder.
- The key change must not alter HEAD's cache behaviour for any call whose real index equals its
  `chatID` (section 5).

## 10. Files expected

`src/ts/process/scripts.ts`, `src/ts/process/scriptings.ts`, `src/ts/process/index.svelte.ts`,
`src/ts/process/sendCharacterMessage.ts`, and new tests under `src/ts/process/tests/`.

## 11. Review

Every write here is persistent and the change touches the reactive database: `opus-reviewer` at
both gates.

## 12. Gate record

**Harness spike (ledger row 356): feasible.** One node-environment Vitest file ran the real
`sendChat` with the real scripts, Lua, modules, lorebook, parser and persona helpers. At HEAD it
reproduced section 1 items 1, 2, 4 and 5 after a switch: B's name and lore in A's prompt, B's
message overwritten by a streamed `@@inject`, and a Lua `editOutput` write landing in B.

**Gate 1 round 1, `opus-reviewer` (fresh), rev 1: [REJECT]** (ledger row 357; findings in the
scratchpad, `w2c/gate1/round1.md`).
- F1 (MAJOR): the Lua edit triggers with the send's origin changed output in a group with no
  switch (a group module's `upsertLocalLoreBook`; the member's variable defaults). Rev 2: S5 now
  covers the Lua, with guard G2b.
- F2 (MAJOR): the proposed `MC-078` view over the fast path cannot detect a second holder. Rev 2:
  the Lua bindings keep `createRunSubject(origin)`; S9 states the cost.
- F3 (MAJOR): `@@repeat_back`'s accident on the non-streamed first reply. Rev 2: section 1 item 3,
  the design, guard G1b.
- F4 (MAJOR, test): the duplicated-id reproducer passed at HEAD. Rev 2: reproducers 11 and 13
  switch to the other holder; G6 is the no-switch guard.
- F5 (MAJOR, product): the real index changed tags and walk-backs beyond `MC-110` 3. Put to the
  maintainer: `MC-111`. Rev 2 implements it, with the `-1` case and the index taken from the
  subject's chat.
- F6 (MINOR): the Home fixture and S4's wording. Rev 2: reproducer 8 and S4.
- F7 (MINOR): script-cache collisions in tests. Rev 2: section 7.
- F8 (EDITORIAL, nine items): applied (sections 1, 3, 4, 6, 7 and 9).
- F9 (note): `runScripted` needs the origin; section 5.

**Gate 1 round 2, the same reviewer, rev 2: [REJECT]** (ledger row 358; `w2c/gate1/round2.md`).
Every round-1 finding resolved. New:
- N1 (MINOR): which bindings read the member. Rev 3: the Lua origin carries no member; `getVar`
  reads through the Lua's own subject (section 2, section 5).
- N2 (MAJOR, measured): a per-message `indexOf` made the prompt pass quadratic on a proxied
  database. Rev 3: identity check first (section 2, S9, section 5, the happy-dom suite).
- N3 (MAJOR): the script cache's key omitted the walk-back rule, leaking between the send, the
  HypaV3 modal and the plugin API. Rev 3: the rule is in the key, keyed on the send asking for it
  (section 2, S7, reproducer 10b, G7).
- N4 (MINOR): the walk-back's fallback. Rev 3: the first message only if it was sent, else empty.
- N5 (MINOR): which parses count as the prompt pass. Rev 3: the script call only; the index-less
  parses go to W2c-b; disclosed.
- N6 (EDITORIAL): the `-1` case, S5's exception, `{{messageidleduration}}`. Applied.
- N7 (MINOR): the node harness does not proxy `$state`. Rev 3: the happy-dom suite.

**Disclosed to the maintainer with rev 3:** `{{messageidleduration}}` follows `MC-111` 2; the
walk-back's first-message fallback; and `MC-111` 2 for the prompt pass's index-less parses is left
to W2c-b. **The maintainer's answer is `MC-112`:** the first two kept; the third widened to every
prompt parse, delivered in W2c-a.

**Gate 1 round 3, the same reviewer, rev 3: [REJECT]** (ledger row 359; `w2c/gate1/round3.md`).
N1, N2 and N4-N7 resolved. New:
- N8 (MAJOR): the cache's key has nothing about which messages are sent, so disabling a message
  between two sends left its text in the second prompt. Rev 4: the purity check (section 2, S7b,
  reproducers 14-16).
- N9 (MINOR): the rule marker's position in the key. Rev 4: moot; the rule is no longer in the key.
- N10 (MINOR): reproducer 10's fixture and 10b passed at HEAD. Rev 4: 10 uses
  `[c0, u1, D, u3, c4]`; the group fallback is 10a with a non-empty `firstMessage`; 10b is guard G8.
- N11 (EDITORIAL): the `allBefore` boundary excludes the flagged message itself. Applied.
- The optional re-scan note: rev 4 rebuilds the index map once on the first miss (S9).

**Escalation, `senior-advisor` (ledger row 360)**, after three [REJECT] rounds. Root cause: the
cache keys on content, not on the chat state a script's `out` and `@@repeat_back` read, so each
round found another dimension (F7, N3, N8); the edit dimension is already stale at HEAD and
upstream. Strategy: cache a prompt-pass result only when it is a function of the key, by a purity
check on the script list or a plain bypass, chosen by measurement. Not to do: a sent-state token in
the key, writer-side invalidation, prefix digests, keying on the mode.

**Measurement, `perf-analyzer` (ledger row 361):** bypassing costs about 50 ms per 1,000 messages
on the i9, about a third of tokenization; the advisor's middle band, so rev 4 takes the purity
check. HEAD's cache already misses on repeat sends in chats of about 1,000 messages or more (a
Roadmap chore).

**Gate 1 round 4, `opus-reviewer` (fresh), rev 4: [REJECT]** (ledger row 362;
`w2c/gate1r4/round4.md`; probes at HEAD `9dee3ea9`). The purity check held, as did F1-F9, N1, N2,
N4, N6, N7 and N11. New:
- M1 (MAJOR): a message's own tags are expanded, and written back into the stored message, by
  `runCurrentChatFunction` at the send's entry, before the parse rev 4 gave the rule.
- M2 (MAJOR): chatML template items are parsed by `parseChatML`, outside rev 4's list.
- T1 (MAJOR, test): reproducers 14-16 passed at HEAD. T2 (MINOR): reproducer 10's `@@repeat_back`
  half never read the disabled message at HEAD.
- P1 (MINOR): a `<cbs>` `in` was outside the purity check. P2 (MINOR): the index map's rebuild rule.
- D1 (MINOR): `{{history}}`, `{{lastmessage}}` and `{{previouschatlog}}` return hidden messages.
- E1-E3 (EDITORIAL): the -1 behaviour of two tags; the lorebook's parse; who pays a cache miss.

**The maintainer's decision, `MC-113`.** Every finding from round 2 on came from `MC-111`/`MC-112`;
the rest had held since rev 2. `MC-111` and `MC-112` move to their own stage, W2c-c, planned from a
complete inventory of the parses that build the prompt. Rev 5 is W2c-a without them:
- kept from rev 4: the binding, the Lua subject, the lorebook, `@@inject` by message, the
  accidents, P2's rebuild rule (section 2, S9), T2's fixture (reproducer 9b);
- removed: the index tags, the walk-back rule, the purity check, reproducers 10-10d and 14-16,
  guards G7-G9; M1, M2, P1, D1 and E1-E3 go to W2c-c with the round files, rows 360-362 and the
  measurement as its starting evidence;
- new: the `@@` branches take a message reference, the prompt pass keeps HEAD's `chatID` for
  everything else (G2c), and the key gains the real index; `@@repeat_back`'s walk may reach a
  disabled message until W2c-c (disclosed, section 2).

**Gate 1 round 5, the round-4 reviewer (reuse), rev 5: [EDITORIAL]** (ledger row 363;
`w2c/gate1r4/round5.md`; probes at HEAD `9dee3ea9`, `r3.log`). The design holds: the two indices,
the message reference on the reply paths, the preserved accidents, and the split. F1-F9, N1, N2 and
N7 hold; N4, N6 and N11 are moot under `MC-113`; P2 and T2 applied. Corrections, applied in rev 5.1:
- R5-1: reproducer 9b's fixture made the fix's expected value a disabled message's text; D is now a
  user message (HEAD appends `TAGD`, the fix `TAGc0`).
- R5-2: reproducer 3 named a failure HEAD does not have (HEAD's write throws past the end and the
  pattern stays); it now asserts the stripped reply.
- R5-3: the key suffix on every referenced call changed HEAD's cache sharing on the reply paths;
  the suffix is now added only when the real index differs from `chatID`, with a terminator.
- R5-4: S5's exceptions now include a message deleted or moved during the send.
- R5-5: S9's cost wording, and a map hit that fails validation after the one rebuild counts as gone.
- R5-6: the disclosure's comparison with HEAD, whose walk also crosses disabled messages.
The Orchestrator checked each correction against the round file.

**The build (tests first).** Red tests (ledger row 364): 22 reproducers fail at HEAD `9dee3ea9` on
their named behaviour, 19 guards pass. The fix (row 365) in four production files. Acceptance tests
on the fix's seams (row 366). Pre-gate snapshot: `pnpm test` 169 files, 2325 passed, 4 skipped;
`pnpm check` clean; the build passes.

**Gate 2 round 1, `opus-reviewer` (fresh): [REJECT], on tests only** (row 367;
`w2c/gate2/round1.md`). The production code accepted: S1-S9 hold, both accidents preserved, the
five implementation deviations accepted (the locator in `index.svelte.ts`; a three-way message
reference; the subject in its own parameter; `getModuleAssets(subject)`; `runScripted`'s post-run
resolve kept). F1: four invariants untested (the non-streamed first reply after a switch, the Lua
`getVar` in a duplicated-id chat, the `@@inject` save mark, map-hit validation), each shown by a
surviving mutant. F2: four reproducers labelled as guards. F3-F6: four comments. F7: a title. F8:
section 1 item 2 understated the non-streamed defect (corrected).

**Gate 2 round 2, the same reviewer: [EDITORIAL], closed** (row 368; `w2c/gate2/round2.md`). All
round-1 findings resolved; the remediation changed comment lines only in production. R2-1, a test
header's claim, and an optional doc bullet corrected by the Orchestrator. Suite: 169 files, 2331
passed, 4 skipped; `pnpm check` clean.

**Live check: passed** (row 369). A chat switch and Home mid-send on a production build: the reply
and the Lua variable land in the send's chat; the other chat's message at the reply's index is
untouched; the same after a reload; no console errors.

**Commit-message check (ledger row 370; the Gate 2 reviewer): [EDITORIAL], applied.** Claims
verified. Corrected: the test count (31 fail at HEAD on behaviour; 4 guards need the fix's
counters) and two missing reproducer subjects; the first-reply sentence; the per-call cost as an
upper bound; a line naming what W2c-b leaves.
