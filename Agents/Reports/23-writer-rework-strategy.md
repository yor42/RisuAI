# Writer rework: writes follow the work they belong to, not the selection

**STATUS:** open

**Status:** strategy, 2026-09-24. Maintainer-approved (`MC-073` to `MC-076`). No stage is planned
yet; each stage gets its own plan and gates (`opus-reviewer`, since every stage touches
persistence).

**Evidence:** ledger rows 159 (writer surface), 160 (HaejeokRisuai comparison), 161
(`senior-advisor`), 162 (pre-W0 checks). Report 22's two Gate 1 rounds (section 11) are what
surfaced the problem.

---

## 1. The problem

A unit of work (a send, a generation, a trigger run, a `/` command) writes to character and chat
data after `await`s, but it never records which character and chat it belongs to. Each write
finds its target again through the UI selection (`selectedCharID`, `chatPage`,
`get/setCurrentCharacter`, `get/setCurrentChat`), or through an array index captured earlier.
Two failure classes follow:

- **Resolved live at write time** — redirected by a plain switch:
  - trigger `setVar` and the `varChanged` block (CHORE-25);
  - nine v2 effects ending in `setCurrentCharacter` (CHORE-26 is the no-switch group case);
  - CBS `setChatVar` / `getChatVar`, and `loadLoreBookV3Prompt`;
  - Lua character writers;
  - the `request` trigger (CHORE-27);
  - `sendMain`'s message write-back (Report 22 section 2.2);
  - plugin v3 `sendChat`.
- **Index frozen at start** — redirected when the arrays shift: `sendChatBody`'s ~45 writes
  through `characters[selectedChar].chats[selectedChat]` break under Branch/Copy/New Chat
  `unshift`, a chat reorder, or a permanent character delete.

The consequences range from a chat's history or variables being overwritten to a whole
character (or group) being replaced, and all of them are saved.

## 2. Direction (`senior-advisor`, ledger row 161)

**Root cause:** the UI cursor is the only address space for writes.

**Strategy:** each unit of work carries an **origin** — `{chaId, chatId}`, captured from objects,
never from indices — and every write it makes resolves its target by identity at the moment of
the write.

- The engine layers already receive their subject: `runTrigger(char, …, {chat})`,
  `runScripted(…, {char, chat, setVar, getVar})`, `processScript(char, …)`. Most sites are
  substitutions, not new plumbing.
- **One module owns origin:** capture, a resolver (origin → live character and chat slots, or
  null), a write helper, and a registry of in-flight origins.
- **Plugin-facing "current" helpers stay bound to the selection.** That is a public contract
  (`MC-011`). A plugin or script that never switches sees no difference.
- HaejeokRisuai independently built the same shape (`ChatTarget` / `resolveChatTarget`, ledger
  row 160). We adopt the idea, not their code, which depends on their rewritten stores.

## 3. Invariants

- **W-1.** A write made for a unit of work resolves its target by identity when the write happens.
  If the target is gone, the write is dropped silently (`MC-075` 2).
- **W-2.** Whole-object commit stays. The trigger engine mutates a clone and the caller commits
  it; only the address changes. Field merging would be a trigger-engine rewrite and is out of
  scope.
- **W-3.** An origin-bound write to a character that is not selected is saved. Ledger row 162,
  check 1, ran this: an in-place write to a non-selected character is lost without
  `markCharacterForSave`, while whole-object replacement is caught by the identity tracker. So
  **the write helper marks by default.**
- **W-4.** Recursion inherits origin. Group turns, auto-continue and resend re-enter `sendChat`;
  they must carry the origin, not re-read the selection. `SendChatCallContext` (CHORE-01), which
  already captures `chaId`, becomes the origin's carrier.
- **W-5.** Creating an origin registers it as "writing into `{chaId, chatId}`"; disposing it
  unregisters it, in the same `finally` that ends the work. The delete confirmation (`MC-075` 2)
  asks this registry, so nothing can leak a "writing" state.
- **W-6.** In a group, the origin separates the **character whose trigger runs** (the member) from
  the **owner of the chat** (the group). A member's trigger never writes into the group's slot
  (CHORE-26).

## 4. Stages (order per `MC-076`)

`updateInlayScreen` (CD-4) runs first; it is independent.

| Stage | Scope | Closes |
|---|---|---|
| **W0 — Identity** | Every chat has a stable `id`: the creation sites that omit one (`ChatList` New Chat, the `characterFormatUpdate`/`createNewGroup` fallbacks, `characterCards.ts` imports) get one, and imports never create a duplicate within a character. Also the origin module: capture, resolver, marking write helper, in-flight registry, with unit tests. **Not** `findCharacterbyId`, which skips groups and returns a blank character on a miss; use an index lookup by `chaId`. | Report 22's I1 (lifted out of the composer stage) |
| **W1 — Engine binding** | `triggers.ts`: `setVar`, `varChanged`, the nine `setCurrentCharacter` effects, with W-6. `chatVar.svelte.ts`: an explicit target, threaded through the parser's matcher registration, which has no per-call hook today. `loadLoreBookV3Prompt` takes its origin. The callers of `runScripted` pass origin-bound `char`/`chat`/`setVar`/`getVar`. `Chat.svelte`'s manual trigger commit. | CHORE-25, CHORE-26 |
| **C — Composer** | Report 22 rev 3, on W0's resolver: per-chat drafts (I2), with the send captured as an origin. | Report 22 sections 2.1 and 2.2 |
| **W2 — Generation and deletion** | `sendChatBody`'s frozen indices become resolutions; W-4 recursion; the `start`-trigger commit; `@@inject`; memory-result writes; `throwError`'s fallback; the `request` trigger, plus a sweep of the other `getCurrentCharacter()` sites in `request.ts`. The `MC-075` 2 warning in `removeChar` and the two chat-delete handlers. The `MC-075` 3 Home check, including `sendChatMain`'s reads after awaits at index −1. | CHORE-27 |
| **W3 — `/` commands** | `processCommand` takes the send's origin (`MC-075` 1) and passes it to the `sendChat`/`runTrigger` it invokes. Small; may share W2's gate. | — |

Multiuser is out of the rework and has its own removal stage (`MC-074`); it must not be folded
in.

## 5. What each stage's red tests must prove

- **W1:** drive the real `runTrigger` on a real `$state` database, with an effect that awaits;
  move the selection during the await.
  - B's `scriptstate`, `globalLore`, `desc` and chat-object identity are unchanged.
  - A's change survives encode → decode.
  - Must fail at HEAD on B. A variant without the mark must fail on A.
  - For W-6: a group with a member trigger, no switch; the group slot is untouched.
- **W2:** drive the real `sendChat` on the `sendChatSaveMarks` harness pattern, separately with:
  - a Branch `unshift` on the origin;
  - a permanent delete of a character at a lower index;
  - a two-member group with a switch between turns;
  - an auto-continue after a switch;
  - a delete of the origin (no throw, nothing written, the confirmation reported "writing", the
    registry empty afterwards).
- **W3:** a command that awaits, then a switch.

Each test states its HEAD failure reason in the gate record, not in the test.

## 6. Do not

- An async-context "current" (Shape B). Display-mode triggers, the `request` trigger, nested
  manual triggers and Lua/wasm callbacks interleave on one queue, and its failure mode is a silent
  fall-through to the cursor, which is the bug itself.
- A switch lock, or setting `doingChat` earlier. `MC-073` rejected it, and `sendChatBody` clears
  `doingChat` before every recursion anyway.
- Carrying `{index, chatIndex}` pairs as the origin. That is the frozen-index class again.
- Fixing CHORE-25 apart from W1, or letting the composer stage carry its own resolver.

## 7. Open

- Whether a real plugin relies on trigger writes following a selection change the plugin itself
  makes during a `v2Wait`. It is unknowable from this repo. The contract is that plugin "current"
  stays bound to the selection and engine writes are bound to their origin.
- Id-less chats installed at runtime by a plugin's `setChatToIndex`: the resolver falls back to
  object identity and otherwise drops the write. **Superseded by Report 24 (O-1, ID-4 and ID-6):**
  every install route fills missing ids, `beginWork` fills the rest, and the origin holds no
  object reference. An id with two holders is skipped with a warning (`MC-078`).
- `graphmem.ts`'s chat-variable callers: not yet traced for whether they hold their subject.
- CHORE-26 and CHORE-27 are traced, not run. W1's and W2's red tests are their proof.
