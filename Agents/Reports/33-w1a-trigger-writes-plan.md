# W1a — Every write a trigger run makes lands on its own chat, as it happens

**STATUS:** plan rev 3.2, 2026-09-27. **Gate 1 and Gate 2 passed** (section 12). The live check and
the commit-message check passed. Committed in `13ed2e75` (2026-09-28).
- Rev 3.2 aligns §3's gone-member rule for `upsertLocalLoreBook` with T4. Rev 3.1 said it writes
  nothing, which contradicted T4's "chat writes proceed". The implementation follows T4. All three
rounds were by the same `opus-reviewer`, and section 12 answers each:
- round 1 (ledger row 258): **[REJECT]**;
- round 2 (row 259): **[REJECT]**;
- round 3 (row 260): **[EDITORIAL]**, closed by the Orchestrator in rev 3.1.

**Decisions:**
- `MC-094`: a trigger run has no commit step (W-2′, superseding Report 23's W-2 and `MC-076`'s
  "whole-object commit stays"); W1 splits into W1a (writes) and W1b (reads and the parser).
- `MC-076`: the approved strategy (Report 23), including W-6 (a member's trigger never writes into
  the group's slot).
- `MC-011` (upstream triggers, Lua, CBS and plugins keep working); `MC-073` (no lock, and
  `doingChat` is not set earlier); `MC-075` (a write whose origin is gone drops silently);
  `MC-078` (an ambiguous target is skipped with a warning); `MC-089`; `MC-091` (scope amendments).

**Evidence:**
- scoping: ledger rows 253 (trigger engine, with its F1-F4 follow-up) and 254 (CBS, Lua, lorebook);
- the escalation: row 255 (`senior-advisor`);
- the pre-plan inventory and measurement: rows 256 and 257;
- Gate 1 round 1: row 258, including its `proxy()` aliasing probe.

The Orchestrator re-read the source for every decision-critical claim below.

Closes **CHORE-25** and **CHORE-26**. This is the first stage to give `chatOrigin.ts` (W0,
Report 24) a production caller.

---

## 1. What is wrong at HEAD

A trigger run deep-clones its character and chat (`safeStructuredClone` at the top of
`runTrigger`), mutates the clones, and writes back through the **UI selection**:

1. **The wrong chat receives trigger variables (CHORE-25).** `setVar` writes `scriptstate` to a
   chat captured at trigger start, to `getCurrentCharacter().chats[chatPage]` and to
   `characters[selectedCharID].chats[chatPage]`. After the run, `varChanged` writes
   `getCurrentChat().scriptstate`. A switch during any await redirects these writes.
2. **The wrong character is replaced (CHORE-26).** Each of the nine character and lorebook effects
   first writes its field in place through the selection (`characters[selectedCharID]`, or
   `chats[chatPage].note` for `v2SetAuthorNote`), then calls `setCurrentCharacter(…)`.
   - **Seven** of them pass the trigger-start clone, which replaces the whole selected slot.
   - `v2ModifyLorebook` and `v2SetAuthorNote` pass the live selected object, which is a no-op.
   - In a group, the member's trigger runs while the **group** is selected. So the group receives
     the member's fields, or the member's whole clone.
3. **Messages and edits are lost, with no switch at all.**
   - The seven whole-clone replaces put **every chat** of the character back to its trigger-start
     copy.
   - The callers' chat commits (`setCurrentChat(triggerResult.chat)` in `Chat.svelte` and
     `command.ts`, and sendChat's start and output triggers) put the trigger's chat back to its
     trigger-start copy. The manual button trigger sets no `doingChat`, so during its await the
     user can send, or edit a message, in that same chat.
4. **The Lua button can put one chat into another's slot.**
   - `runLuaButtonTrigger` returns `runScripted`'s `chat`, which is the **live** chat object that
     `getCurrentChat()` returned at the click.
   - `Chat.svelte` passes it to `setCurrentChat`, which targets whatever is selected **now**.
   - After a switch during the script's await, the chat on screen is replaced by the earlier chat
     object, which then sits in two slots with one id.
5. **Lua writes go to the selection.** Lua's `setChatVar` (by default), `setName`,
   `setDescription`, `setCharacterFirstMessage` and `setBackgroundEmbedding` read
   `selectedCharID`.
6. **Lua writes are lost or stale.**
   - `upsertLocalLoreBook` writes `localLore` into the trigger's `char` clone, so it persists only
     if a later whole-clone replace happens to fire in the same run.
   - Lua engines are cached by `mode`, and four closures capture the state of the call that built
     the engine. They are rebuilt only when the code text changes:
     - `upsertLocalLoreBook` and `generateImage` capture its `char`;
     - `stopChat` captures its `stopSending`, so it has no effect on later runs of the same code
       and mode;
     - `setDescription` validates that call's `data` rather than its own `desc` argument.
7. **Nested triggers are reverted.** A nested manual trigger (`runtrigger`, `v2RunTrigger`)
   re-clones the parent's clone, and the parent's later replace reverts what the nested one wrote.
8. **Trigger definitions are rewritten.** Each of these stamps `lowLevelAccess` onto live
   definition objects:
   - `getModuleTriggers()`, onto `db.modules` trigger entries, in every mode;
   - `runTrigger` in display and request runs, onto `char.triggerscript`, which is not cloned
     there;
   - `runLuaEditTrigger`, which writes `false` onto `char.triggerscript` on every edit-mode call.

**Not wrong, recorded because a Roadmap entry said otherwise.** The `display` and `request` runs
filter effects through `displayAllowList` and `requestAllowList`. Both exclude every v1 effect and
all nine character and lorebook effects. So Roadmap CHORE-27's "the others write to B's live data
during what should be a display-only run" is false. The only live writes those runs make are the
stamping in item 8. The `request` trigger's remaining problem is that it reads the selection (W2).
This plan's records correct CHORE-27.

## 2. The design (W-2′, `MC-094`)

**A trigger run has no commit step.**
- Each change the run makes to persistent data is applied to the live target when the effect runs,
  as an operation: a message push, splice, slice or edit; a `scriptstate` key; `note`;
  `localLore`; a character field.
- The target is found through the run's **origin** (`chatOrigin.ts`), by id, never through the
  selection.
- Reads in the run see the same live target, so they see the run's own writes.
- `runTrigger` no longer clones the character or the chat, and its result has no `chat`.

**Why this, and not a merge.** At HEAD every trigger write except `chat.message` (and Lua
`localLore`) is already a live field write. The clone and the final replace add nothing but the
losses in section 1. A snapshot commit cannot tell "the trigger removed X" from "someone added X
after the snapshot", so no merge rule fixes it. Applying each operation to the live chat inside one
synchronous stretch leaves nothing to merge, because nothing can interleave within it (row 255).

**Trade-off accepted by the maintainer (`MC-094`).** A trigger's changes are visible while it
runs. For example, a trigger that cuts the chat and then waits on an LLM shows the cut chat during
the wait. Lua `setFullChat` still replaces the whole history, as it always did.

## 3. Scope

**In W1a:**
- **`src/ts/process/triggers.ts`**, all of `runTrigger`:
  - the clones go;
  - `setVar`, `varChanged` and the nine effects write through the origin;
  - the message effects act on the live chat;
  - nested triggers inherit the origin;
  - the run never writes trigger definitions;
  - the result drops `chat`.
- **`src/ts/process/chatOrigin.ts`**: the per-run subject (section 5) is added to the one module
  that owns origin (Report 23 §2).
- **`src/ts/process/scriptings.ts`**, for a call that has an origin:
  - **Writes and their paired reads:**
    - the chat-message bindings;
    - `setChatVar` (through the run's `setVar`);
    - `upsertLocalLoreBook`;
    - `generateImage`'s character;
    - `setName`/`getName`, `setDescription`/`getDescription`,
      `setCharacterFirstMessage`/`getCharacterFirstMessage` and
      `setBackgroundEmbedding`/`getBackgroundEmbedding`.

    The paired reads come forward from W1b, so that a script reads back what it wrote (`MC-091`,
    a shared-cause amendment).
  - **Each binding's subject**, with the origin resolved per call. The "runner" is the character
    whose trigger runs: the member in a group run, otherwise the owner.

    | Binding | Subject | HEAD's subject, with no switch |
    |---|---|---|
    | the chat-message bindings, `setChatVar` | the origin chat | the trigger's chat |
    | `upsertLocalLoreBook` | checks the **runner**'s type; writes `localLore` to the **origin chat** | the runner's clone, whose copy of the chat was lost unless a replace fired |
    | `generateImage` | the **runner** (reference image, emotion key) | the runner, through the closure |
    | `setName`/`getName`, `setDescription`/`getDescription`, `setCharacterFirstMessage`/`getCharacterFirstMessage`, `setBackgroundEmbedding`/`getBackgroundEmbedding` | the **owner** | the selection, which is the owner |

    Each keeps HEAD's no-switch subject, now resolved by id, with one deliberate change. In a
    group run, `upsertLocalLoreBook` now writes the **group's** chat, the origin, where HEAD wrote
    the member clone's own `chats[chatPage]`, which is the member's own chat. The group chat's
    `localLore` is the one the group's prompt uses.

    **For a gone member:**
    - `generateImage` returns without generating.
    - `upsertLocalLoreBook` still writes the group's chat. `localLore` is chat data, and T4 lets
      chat writes proceed. Its type check applies only outside a group run.
    - The v2 character getters read the owner, like `{chara}` parses (T4).
  - `runLuaButtonTrigger` takes an origin.
  - The four stale closures (section 1.6) read per-call state.
  - `runLuaEditTrigger` stops stamping definitions.

  Calls without an origin (`runLuaEditTrigger` and the other callers W1b owns) keep HEAD's
  targets.
- **`src/ts/process/modules.ts`**: `getModuleTriggers()` stops stamping definitions.
- **Callers.** The result-type change forces a touch at every non-display caller. Each one forms
  its origin with `beginWork` from live objects read back through `DBState`, just before the run,
  and ends it in a `finally`. Section 4's T5 gives what each does when the origin is gone or
  ambiguous afterwards.
  - **`src/lib/ChatScreens/Chat.svelte`**: the manual trigger and the Lua button.
    - Both `setCurrentChat(…)` commits are deleted.
    - The `ReloadChatPointer` bump stays.
  - **`src/ts/process/command.ts`'s `/trigger`**:
    - The origin is the selection at the moment the command runs, which is what HEAD reads.
    - W3 rebinds it to the send's origin (`MC-075` 1).
    - The `setCurrentChat` commit is deleted.
  - **`src/lib/ChatScreens/DefaultChatScreen.svelte`**, `sendMain`'s character branch (a
    character, not a group, with a non-empty message). This branch runs the input trigger, then
    `processScript(…, 'editinput')`, then appends the user message. Invariant **S1**:
    - **Where the message goes.** The user message is appended to the chat the send started from,
      resolved by id **after the last await before the append**, which is after
      `processScript`. It never goes to the selection.
      - At HEAD, `cha.push({data: await processScript(…)})` evaluates its receiver before the
        await, which is exactly the "held across a yield" pattern T9 forbids. Gate 2 checks this
        site by name.
    - **No write-back.** The branch writes no message array and no chat object into any slot,
      whether or not triggers ran. The live-`chatPage` write-back (`…chats[chatPage].message =
      cha`) is not done for this branch.
      - With a live array it would make two chats share one array after a switch (row 258, F1).
      - With no triggers at all it already does so at HEAD. There `cha` is the live array, and the
        one real await left in `processScript` is a plugin's `editinput` hook (`processScriptFull`,
        `await plugin(data)`), so a switch during that hook aliases the two chats. S1 fixes that too,
        for characters.
    - **Saved.** The append goes through the origin's write helper, which marks the chat's owner.
      So it survives even when the user has switched to another character.
    - **A gone origin:** nothing is appended, the composer is not cleared, and the send stops.
    - **An ambiguous origin:** the message is appended to the `.message` of the chat **object**
      the send read at its start, read at the moment of the append. It is never appended to an
      array held since the start, which a cut or `setFullChat` during the await can have detached
      (row 259, N2).
    - **Other branches.** The group and empty-message branches keep their write-back. They belong
      to the composer stage (Report 22 §2.2).
    - **The seam.** Tests reach this branch through a function extracted from `sendMain` into a
      `.ts` module. It is extracted first, with no behaviour change, so the red tests can run
      against it before the fix. No test mounts `DefaultChatScreen`.
  - **`src/ts/process/index.svelte.ts`**, in `sendChatBody`, touched at the three trigger sites
    only:
    - **The origin:** the chatroom and the chat read back from it, plus the member in a group
      (W-6).
    - **The start trigger:** `currentChat = triggerResult.chat` and `setCurrentChat(currentChat)`
      are deleted, and `currentChat` is re-read from the origin before `ms = makeMs(currentChat)`.
      - Once the clone is gone, the local `currentChat` is already the live proxy, because
        `runCurrentChatFunction` returns its argument. The re-read keeps `ms` correct if the chat
        object was replaced during the trigger's await, and it is where T5's gone and ambiguous
        handling happens.
    - **The two output triggers:** both commits are deleted: `currentChat = triggerResult.chat`
      together with the frozen-index write after it (`chats[selectedChat] = currentChat`), and
      `chats[selectedChat] = triggerResult.chat`. The frozen-index re-reads that follow stay. Once
      the commits are gone they read back the same slot the output code already writes (W2 owns
      them). **They must not be replaced by an origin re-read**: the inlay write-backs that follow
      write `currentChat` to the frozen index, so after an `unshift` that would put the origin
      chat into a second slot.

    **Scope amendment (`MC-091`).** The result-type change forces this touch inside W2's territory
    (a shared cause). Everything else in `sendChatBody` stays W2's.

**Not in W1a:**
- **W1b:**
  - CBS `{{setvar}}`/`{{getvar}}` and their matcher binding;
  - `chatVar.svelte.ts`;
  - `loadLoreBookV3Prompt` and the Lua `loadLoreBooksMain`/`getLoreBooksMain`;
  - `graphmem.ts`;
  - the Lua `cbs` binding, `getCharacterLastMessage` and `getPersonaDescription`;
  - `infunctions.ts`;
  - `runLuaEditTrigger`'s callers.
- **W2:** the `request` trigger (CHORE-27), `sendChatBody`'s frozen indices, recursion (W-4), the
  delete warning (`MC-075` 2) and the Home check. W1a registers each non-display run with
  `beginWork`, so the registry is truthful when W2 wires the warning.
- **W3:** `/` commands, including the `command`/`v2Command` effects' `/setvar` and `/addvar`, take
  the send's origin.
- **Display and request runs are unchanged,** apart from the stamping fix. Their effects are
  allowlisted to temporary variables and request state, and they keep reading the objects their
  callers pass.
- **Module selection** (`getModules()`, which reads the selection to pick chat and character
  modules) stays as it is. A run takes its module triggers once, at its start. W1b records the
  case where the origin is not the selection.
- **The Python path is unreachable.** No caller passes `type: 'py'`, and `runTrigger` has no case
  for `triggercode`. It gets the same per-call state as Lua and is not otherwise considered.

## 4. Invariants

- **T1 — Origin-bound writes.** Every persistent write that a non-display trigger run makes
  through its own effects and the Lua bindings above lands on the target its origin names,
  resolved by id at the moment of the write, never through the selection. This covers:
  - `scriptstate`, `note` and the chat's messages;
  - `localLore`;
  - `globalLore`, `desc` and `replaceGlobalNote`;
  - the four Lua character fields.

  A switch of character or chat during any await changes nothing about where a write lands.

  **Excluded, because they stay on the selection or on global data:**
  - CBS `{{setvar}}` in a parsed string (W1b);
  - `/setvar` and `/addvar` through `command`/`v2Command` (W3);
  - `v2SetPersonaDesc` and global variables, which are not per-chat data.
- **T2 — No commit step, and no shared arrays.**
  - No part of a run, and none of its callers, replaces a whole character slot or a whole chat slot
    with a copy.
  - So a change that anything else makes to the origin's chat, its other chats or the character
    during the run survives the run: a user send, an in-place message edit, a generation, another
    trigger or a plugin.
  - No caller assigns the origin chat's live message array, or its chat object, into another slot,
    so no two chats share an array or an object.
  - The one exception is Lua `setFullChat`, which replaces the message list by its own contract,
    as at HEAD.
- **T3 — Read-your-writes.** Within a run, a read sees the run's earlier writes:
  - `getVar` after `setVar`;
  - `{{description}}` in a `{chara}` parse after `v2SetCharacterDesc`;
  - `v2GetLorebook*` after a lorebook write;
  - a message read after a message effect;
  - a Lua read after the paired Lua write.

  This includes reads after an await, and in both directions between a parent and a nested
  trigger.

  **Within one API, not across APIs in a group run.** In a member's run, the v2 effects and `{chara}`
  parses see the member, while the Lua character bindings see the group (T4). So v2
  `v2SetCharacterDesc` followed by Lua `getDescription` makes the Lua call throw on the group, and
  `runScripted` swallows the error. HEAD returned the new `desc` there only because the member's
  clone had replaced the group's slot, which is CHORE-26 itself. There is no non-corrupting HEAD
  behaviour to keep (row 259).
- **T4 — Targets in a group run (W-6).** In a member's trigger:
  - the v2 character and lorebook effects (`desc`, `replaceGlobalNote`, `globalLore`) write to the
    **member**;
  - `{chara}` parses and `defaultVariables` use the member, as at HEAD;
  - chat data (messages, `scriptstate`, `note`, `localLore`) goes to the **group's** chat;
  - each Lua binding keeps HEAD's no-switch subject, now resolved by id (the table in section 3):
    - the name, description, first-message and background bindings act on the **owner**. So in a
      group, `setBackgroundEmbedding` changes the background the group chat shows, and
      `setDescription` still throws on a group;
    - `generateImage` uses the **runner**;
    - `upsertLocalLoreBook` checks the runner's type and writes the origin chat;
  - the group's slot is never replaced, its fields other than the ones above are unchanged, and no
    `chaId` gains a second holder.

  A **member that is gone or ambiguous** makes its v2 character-field writes and its
  `generateImage` skip. They never fall back to the owner. Its `{chara}` parses read the owner.
  Chat writes proceed (O-4).
- **T5 — Gone and ambiguous (`MC-075`, `MC-078`).**
  - **In the run.** If the origin is gone or ambiguous when the run resumes, the run stops: no
    further effect runs and nothing is written. A gone origin is silent; an ambiguous one warns
    (the resolver's warning). Nothing throws out of `runTrigger` for this reason, and no chat or
    `chaId` is duplicated.
  - **In the caller, after the run:**
    - **Gone:** the unit stops silently.
      - `sendMain` behaves as S1 says (section 3).
      - `sendChatBody` returns with `doingChat` cleared, as on its other early returns.
      - The button handlers only skip the pointer bump.
    - **Ambiguous:** the unit carries on as HEAD did, without the run's writes.
      - `sendMain` behaves as S1 says: it uses the chat object it holds, never an id it resolves
        and never a held array.
      - `sendChatBody`'s start site reads back its frozen slot.
      - No new user-facing string.
    - **No triggers** (`runTrigger` returned null): `sendChatBody` re-reads nothing. `sendMain`
      still follows S1, which applies whether or not triggers ran.
- **T6 — Saved.** Every write T1 names is marked for save before the run next yields, so it
  survives encode and decode even when its target is not the selected character (W-3).
- **T7 — Registration.** Every non-display run is registered with `beginWork` before its first
  await, and unregistered in a `finally`, even when the run throws. The registry is empty
  afterwards.
- **T8 — Trigger definitions are read-only.** No run of any mode, and no call to
  `getModuleTriggers()` or `runLuaEditTrigger`, writes to a character's `triggerscript` entries or
  a module's `trigger` entries. The per-run `lowLevelAccess` is computed for the run only.
- **T9 — Resolution cost (O-5).** A run makes at most one full resolution per synchronous stretch
  (the code between two yields), whatever the number of reads and writes in it. A resolved object
  is never used after a yield. Section 6 gives the measured cost.
- **T10 — Unchanged:**
  - plugin "current" helpers (O-8), which are selection-bound;
  - the save format;
  - trigger, Lua and CBS syntax and semantics, except where a write now lands, the intermediate
    visibility `MC-094` accepted, and the early-exit case in section 8;
  - display and request runs, except T8;
  - `CurrentTriggerIdStore`, `ReloadGUIPointer` and `ReloadChatPointer` bumps;
  - `stopSending`, `additonalSysPrompt`, `sendAIprompt`, `tokens`, `displayData` and `tempVars`
    in the result.

## 5. Mechanism (non-normative)

**The run subject.** `chatOrigin.ts` gains one construct for a run, for example
`createRunSubject(origin)`. It exposes:
- the live owner and chat;
- the member, kept **separate** from the owner. "Not a group run" and "a group run whose member is
  gone" must never collapse into one "member, else owner" value used for writes (T4);
- the resolution status: ok, gone or ambiguous. `resolveOrigin` alone returns null for both gone
  and ambiguous, and T5 needs the difference;
- a `mark()` that marks the owner, and the member when it resolved.

Resolution is memoised for **one synchronous stretch** only:
- the memo is filled on first use and cleared by a `queueMicrotask` queued at fill time;
- before reuse, it checks that the owner and chat are still at the indices it resolved them to,
  and rescans if not;
- it is never validated across a yield, because the resolver's ambiguity check is a scan.

The memo is cleared on every yield. A microtask queued during a synchronous stretch runs before any
continuation of an `await` the stretch starts. Gate 1 checked this for native promises, thenables,
wasmoon's `run` and Lua `async` continuations. The memo belongs to one run subject.

This refines O-3 and O-5. It is the one sanctioned API that hands out live objects, and it hands
them out only per access, never to be kept across an await. It is not the index cache O-5 forbids,
because nothing survives a tick. Report 24 is annotated to say so.

**The engine.**
- `runTrigger` reads `char` and `chat` through the subject at each use, rather than holding them
  in locals across awaits. This covers the 235 lines (344 parses) of `{chara: char}` and the uses
  after an await in the alert-input and image effects.
- Writes then mark through the subject.
- A forwarding `Proxy` that impersonates the character is **not** acceptable: identity
  comparisons and `$state` would see a foreign object.

**Lua.** `ScriptingEngineState` carries the call's subject, set on **every** call and cleared on a
call without an origin, like its `chat`, `setVar` and `getVar` today.
- The bindings in scope, including `stopChat` and `setDescription`'s check, read per-call state at
  each call, never a closure captured when the engine was built.
- Each binding resolves the subject that section 3's table names.

**Stamping.** Each place that stamps builds its list from shallow copies carrying the run's
`lowLevelAccess`, as `runLuaButtonTrigger` already does.

**The result.** `runTrigger` returns no `chat`. `pnpm check` then lists every consumer; each one
does what section 3 says.

## 6. Performance (row 257)

**Setup (row 257).**
- A production Vite build of the repo's Svelte 5.56.8, with the real `safeStructuredClone`
  imported from `polyfill.ts`. On a `$state` proxy it always takes the `rfdc` fallback, since
  native `structuredClone` throws on a Proxy.
- A line-for-line re-implementation of `resolveOrigin`, because importing it would pull in the
  app's store graph.
- Headless Chrome 154, with CDP CPU throttling at 1x, 4x and 6x, on an i9-13900KF.
- **These are best-case numbers.** Throttling is a rough stand-in for a Pi or a phone, so argue from
  the ratios, which held within about 5% across the throttle rates. The fixture is synthetic:
  messages of 500 characters, `desc` of 2000 characters, 50 lorebook entries.

**What `runTrigger` stops doing.** At HEAD every non-display run deep-clones the character, all
its chats included, and then the chat.

| Chats × messages each | 1x | 4x | 6x |
|---|---|---|---|
| 10 × 100 | 1.8 ms | 8.6 ms | 14 ms |
| 50 × 500 | 45 ms | 196 ms | 321 ms |
| 200 × 500 | 178 ms | 787 ms | 1271 ms |

So one clone of the 200 × 500 character costs about 1.3 s at 6x, and it is paid on every send's
start trigger, again on its output trigger, and on every button trigger.

**What it starts doing.**
- **A full resolution** scans every character, so it does not depend on where the target sits:
  - 500 characters × 20 chats: 64 µs at 1x, 470 µs at 6x;
  - 1000 characters × 20 chats: 130 µs at 1x, 950 µs at 6x.
- **One clone costs as much as many resolutions.** Against 1000 characters it equals 14 of them at
  10 × 100, and about 1350 at 200 × 500. Against 500 characters the figures are 28 and 2700.
- **The memo is required, not optional (T9).** A `getVar`-style read that resolves on every call
  costs about 0.9 ms at 6x with 1000 characters. Resolving once and reusing the result costs about
  1.2 µs, 600 to 770 times less. A trigger that reads a hundred variables would otherwise spend
  about 90 ms at 6x on resolution alone.
- **Reads through the live proxy** cost 270 to 300 times plain reads. A sweep of a 2000-message
  chat takes 350 µs through the proxy against 1.3 µs plain at 1x, and 2.4 ms against 8 µs at 6x.
  That sweep is still two orders of magnitude cheaper than cloning the same chat.

**Net.**
- The removed cost is fixed per run. The added cost is one full resolution per synchronous
  stretch, so it grows with the number of yields.
- On the measured sizes W1a removes more than it adds unless a run yields more often than the
  table's break-even. For example, a 10 × 100 character in a 1000-character database breaks even
  at about 14 stretches. `v2EndIndent` yields once per 100 loop iterations, so a very long v2 loop
  on a small character can cost more than at HEAD, by about one resolution per 100 iterations.
- Not measured: Svelte's flush and re-render cost from live writes inside a run's loops, which the
  clone used to hide until the commit.

Resolution counts by construction (T9):
- **An engine run** with *k* yields makes at most *k* + 1 resolutions, plus its nested runs'.
- **A Lua `triggerlua` call** shares its resolution across one synchronous stretch of Lua. Each
  binding that awaits (LLM, tokenize, alerts, similarity, image) ends a stretch.
- **CBS** is W1b's.

## 7. Acceptance scenarios and tests

**The harness.** A new Vitest suite drives the **real `runTrigger`** on a **real `$state`
database**, as Report 23 §5 requires, with the real `selectedCharID` store and real Lua (wasmoon).
Only the network-facing modules are mocked (`request`, `stableDiff`, `hypamemory`, alerts).
- `v2Wait` provides a real await, and an alert provides one the test resolves by hand.
- A Lua script awaits only inside the `async(...)` wrapper. A plain `function onButtonClick` that
  calls `:await()` fails with "cannot yield in callbacks from javascript", which `runScripted`
  swallows. That would make a test red for a harness reason.
- Saves are checked through the real encoder, by encode and decode, following the
  `characters.saveMarks` pattern.
- **Caller-level tests:**
  - **`Chat.svelte`'s handlers:** mount the component, following `Chat.messageEditor.svelte.test.ts`.
  - **`sendChatBody`:** drive it through `sendChat`, with the `sendChatSaveMarks` pattern. That file
    mocks `../triggers` and `../scriptings`, so W1a's `sendChat` tests go in a suite that uses the
    **real** trigger engine. A mocked `runTrigger` returning a `chat` would only simulate HEAD.
  - **`sendMain`'s character branch:** drive it through S1's extracted seam (section 3). No test
    mounts `DefaultChatScreen`.
- Each red test is written against the unfixed tree and must fail on its behavioural assertion,
  never on a missing export. A seam refactor that adds no behaviour may come first if the tests
  need new surface.
- The failure reason at HEAD goes in the gate record, not in the test.

**Red at HEAD**
1. **CHORE-25.** A manual trigger `[v2Wait; v2SetVar x=1]`, run through `Chat.svelte`'s handler on
   chat A1. During the wait the selection moves to chat A2 of the same character, and, in a second
   run, to character B.
   - Afterwards A1's `scriptstate` holds `x=1`, and the other chat's `scriptstate` is unchanged.
   - A1's value survives encode and decode.
   - The same holds for the `setvar` v1 effect and for Lua `setChatVar`.
2. **CHORE-26.** A group G with member M. M's output trigger runs `v2SetCharacterDesc`,
   `v2CreateLorebook` and `v2SetAuthorNote`, with no switch.
   - M's `desc` and `globalLore` change.
   - G's chat `note` changes.
   - G's slot is the same object, and its `desc`, `globalLore` and other chats are unchanged.
   - No `chaId` is held twice, including after encode and decode.
3. **No message is lost to the commit.** A manual trigger `[v2Wait; v2SetCharacterDesc]`, driven
   through `Chat.svelte`'s handler. During the wait:
   - a user message and a reply are pushed onto the same chat;
   - an earlier message is edited in place;
   - a message is pushed onto another chat of the same character.

   All four survive, and the description changes.
4. **Trigger and user operations both land.** These are driven through `Chat.svelte`'s handler, so
   HEAD fails on the lost concurrent change and not merely on the clone.
   - `[v2Wait; impersonate]` with a concurrent in-place edit: both land.
   - `[v2Wait; cutchat]` with a message pushed during the wait: the cut applies to the live chat as
     it is when the cut runs.
5. **The Lua button after a switch.** Driven through `Chat.svelte`'s `handleButtonTriggerWithin`
   with a real Lua script, in an `async(...)` wrapper, that awaits an alert and then calls
   `addChat`. The chat is switched during the await.
   - The message lands in the original chat.
   - The chat on screen is not replaced.
   - No chat id is held twice.
6. **The input trigger in `sendMain` after a switch**, through the seam. Character C has chats A1
   (selected) and A2, and an input trigger that awaits. During the await, the selection moves to A2.
   - A1 holds the user message.
   - A2's messages are unchanged.
   - A1 and A2 do not share a message array or a chat object.

   **Variants:**
   - No triggers at all, with a plugin `editinput` hook (`pluginV2.editinput`) that awaits, and the
     switch during the hook: the same assertions. This is the HEAD aliasing case (N3). It kills a
     "write back only when no triggers ran" mutant.
   - A switch to another character B during the await: A1's user message survives encode and
     decode.
   - An input trigger `[v2CutChat; v2Wait]`: the user message lands on A1's live, cut array.
7. **Lua `upsertLocalLoreBook`** in a `triggerlua` trigger with no other effect: the origin chat's
   `localLore` holds the entry after encode and decode.
8. **Stale Lua closures.**
   - Two characters run byte-identical `triggerlua` code under the same mode, one after the other,
     and each run's `upsertLocalLoreBook` lands on its own chat.
   - The same holds for `setDescription` with a switch during an await.
   - A second run of the same code and mode that calls `stopChat` stops the send.
9. **Nested triggers.** The parent runs `[v2RunTrigger child; v2SetReplaceGlobalNote]`, and the
   child runs `v2SetCharacterDesc 'x'`. `desc` is `'x'` afterwards.
10. **The output trigger and an `unshift`.** A Branch-style `unshift` of a `$state.snapshot` copy
    with a fresh id, onto the origin character, during an output trigger's await. It runs through
    `sendChat` with the real trigger engine, at both output sites (streaming and non-streaming).
    Afterwards:
    - no chat id is held twice;
    - the Branch copy survives, and so does the chat that shifted into the frozen index;
    - the origin chat holds the trigger's write.

    The fixture runs with the origin at `chatPage` 0 and at a later index.
10a. **An unselected origin is saved (W-3).** A trigger whose origin is not the selected character
    writes `desc` and a variable. Both land on the origin and survive encode and decode, and the
    selected character is unchanged. At HEAD the live assertions fail: the selected character's
    `desc` changes, and the origin object's does not.
11. **Trigger definitions.** The fixture sets `lowLevelAccess` to values that differ from what the
    stamping writes, and compares with `toStrictEqual`.
    - A module trigger entry is unchanged after a run in each mode.
    - A character `triggerscript` entry is unchanged after a display and a request run, and after
      a `runLuaEditTrigger` call. These are the runs that stamp live at HEAD.

**Specification (new behaviour, no HEAD equivalent)**
12. **Gone.**
    - The origin chat is deleted during a wait. The run stops, no later effect runs, nothing lands
      anywhere, nothing throws, and the registry is empty.
    - The same when the owner is permanently deleted.
    - A trashed owner still resolves.
    - `sendChatBody`'s start trigger with a gone origin stops the send, and `doingChat` is false.
    - `sendMain`'s character branch, through the seam, with a gone origin: nothing is appended,
      and the composer keeps its text.
13. **Ambiguous.**
    - A duplicate chat id appears during the wait: the run stops with the resolver's warning, and
      nothing is written.
    - The same for a duplicate `chaId`.
    - `sendChatBody` then carries on and generates.
    - Through the seam, with an input trigger `[v2CutChat; v2Wait]` and a duplicate id appearing
      during the wait: the user message is on the chat object's live `.message` after the cut,
      not on the pre-cut array.
14. **Member gone.** In a member's trigger, the member is deleted during the wait.
    - Its v2 character-field write is skipped.
    - The group's `desc` and `globalLore` are unchanged.
    - A following `setVar` still lands on the group's chat.
15. **Resolution count.** Resolutions are counted through a test seam, not by timing. `beginWork`'s
    own resolution is excluded from the count.
    - A run of 50 reads and writes with no await makes one full resolution.
    - A run with three `v2Wait`s, each followed by a `v2SetVar`, makes four.
16. **Registration.** During the wait, `isWriting` is true for the origin chat, and for the member
    in a group. It is false afterwards, including when an effect throws.

**Guards (pass at HEAD, and must keep passing)**
17. **Read-your-writes (T3)** within a run, across an await, and from parent to nested trigger. At
    HEAD this holds through the clone. The nested-to-parent direction is test 9.
18. **A plain run with no switch.** The values read through `DBState` after the caller has finished
    are the same as at HEAD. This covers each of the nine effects, `setvar`, the message effects
    and the four Lua character setters.
19. **Lua character bindings in a group run** (T4): a member's `setBackgroundEmbedding` changes the
    group's `backgroundHTML`, as at HEAD.
20. **Display and request runs** still write only temporary variables and request state. Trigger
    definitions are test 11's.
21. **The start trigger's `cutchat`** is reflected in the prompt that `sendChatBody` builds after
    it (`ms`).

**Diagnostic**
22. **The mark is load-bearing (W-3).** Test 10a with the marking disabled through a module mock:
    the writes are lost after encode and decode.
    - This shows the mark, not the identity tracker, is what saves an in-place write. The tracker
      saves only whole-slot replacements, so the variant also catches a return to replacing slots.
    - No claim is made about HEAD. There the clone replace puts the origin's `chaId` into the
      selected slot, and which holder survives encode and decode depends on order (CHORE-28).

**Checks.** `pnpm check` is clean, and must fail on an async `fn` passed to `writeAt`, as W0
arranged. The full suite and `pnpm run build` run on the final tree.

## 8. Compatibility

- **Save format:** unchanged.
- **Upstream triggers, Lua and CBS:**
  - every effect keeps its semantics;
  - a script that reads back what it wrote still sees it (T3);
  - what changes is where a write lands after a switch, which was the bug, and that a trigger's
    changes are visible during its awaits, which `MC-094` accepted;
  - a script that built a scratch history, waited, then restored it with `setFullChat` ends in the
    same final state, and only its intermediate state is visible;
  - **an early exit keeps earlier writes.** A run that ends through an effect's bare `return` or a
    throw now keeps the message edits it made before. HEAD discarded them with the clone, although
    its field writes (variables, `note`, the lorebook) had already landed. Examples are
    `v2GetDisplayState` in a non-display run, `v2MakeArrayVar` on a `[…]` name and
    `v2SetLorebookActivation` out of range.
- **Plugins:**
  - no plugin API calls `runTrigger` (row 253);
  - plugin "current" helpers are untouched;
  - a plugin that watched for trigger writes landing on the selection after a switch it made
    itself is the case Report 23 §7 already accepts as unknowable.
- **Group members:**
  - The v2 character and lorebook effects now write to the member instead of the group. This is
    the CHORE-26 fix (W-6).
  - The Lua name, description, first-message and background bindings keep acting on the group, as
    at HEAD, and `generateImage` keeps using the member (T4).
  - Read-your-writes across the two APIs sees two subjects in a group run (T3). HEAD returned the
    member's value there only through the CHORE-26 slot replacement.
  - In a group run, Lua `upsertLocalLoreBook` now writes the group's chat instead of the member's
    own chat (section 3).
- **A split send after a switch, until W2 and the composer stage.** If the user switches chats
  during `sendMain`'s awaits (the input trigger, or a plugin `editinput` hook), the user message
  lands on the chat the send started from (S1). `sendChatMain` still generates on the selection,
  so the reply goes to the other chat and the message stays unanswered. HEAD replaced the other
  chat's whole history instead. No data is lost now, but the behaviour the user sees changes.
- **`lowLevelAccess`:** it is no longer written onto trigger definitions. The value each run uses
  is unchanged.

## 9. Risks

- **A missed read site** holds a live object across an await. The effect is a write to a detached
  object: a silent drop, never a wrong target. The mechanism makes the safe path the default, and
  Gate 2 checks every `await` in `runTrigger` (row 256 lists them).
- **Intermediate visibility.** Accepted (`MC-094`). A message remounts while a trigger edits it
  (the CHORE-41 keying), as it would for any other live edit.
- **The memo and concurrent Lua coroutines.**
  - A script can start several `async` coroutines within one call. They share the call's subject,
    so one can reuse a memo that another filled, after unrelated microtasks have run.
  - The index check catches a slot that was replaced or removed. It does not catch a duplicate id
    created in that window, so the write would land on the holder resolved first.
  - This needs a script with concurrent coroutines and a duplicate made by another flow within one
    microtask checkpoint. It is accepted and recorded as a residual.
- **The `sendChatBody` touch** is in W2's territory. It is limited to the three trigger sites.
  Deleting the output commit removes an in-app source of duplicate chat ids after a Branch
  `unshift` during generation (Report 24 §9). W2 owns the remaining frozen-index writes.
- **W1b is not yet done.**
  - A `{{setvar}}` in a trigger-parsed string follows the selection.
  - Module selection follows the selection.
  - Lua's `getLoreBooksMain`, `loadLoreBooksMain` and `cbs` read the selection.
- **Performance:** section 6, including the long-loop case.

## 10. Files expected

- `src/ts/process/triggers.ts`, `src/ts/process/chatOrigin.ts`, `src/ts/process/scriptings.ts`,
  `src/ts/process/modules.ts`;
- `src/lib/ChatScreens/Chat.svelte`, `src/lib/ChatScreens/DefaultChatScreen.svelte`,
  `src/ts/process/command.ts`, `src/ts/process/index.svelte.ts` (the three trigger sites only);
- tests: the new engine suite, `Chat.svelte` mount tests, additions to the `sendChat` harnesses and
  to `chatOrigin`'s tests; existing `runTrigger` mocks only where the type change requires it;
- no `src/lang` change is expected.

**Records:**
- Report 23: W-2′ supersedes W-2.
- Report 24: strike §10's last bullet and O-6's "W1 uses `commitChat`"; the O-3 and O-5 note.
- Roadmap: CHORE-25 and CHORE-26 are closed; CHORE-27's display-write sentence is corrected.
- Ledger row 253: correct its count to seven whole-clone replaces, not eight.
- Live-State.

## 11. Review

- **Gate 1:** `opus-reviewer`.
- **Build, tests first:** `test-warrior` writes the red tests (section 7), confirmed red on their
  assertions; then `sonnet-coder` implements. The two are kept separate.
- **Gate 2:** `opus-reviewer`, with mutants built in the scratchpad. The candidates are:
  - keep one whole-clone replace;
  - drop the mark;
  - resolve through the selection;
  - reuse the memo across an await;
  - collapse the member into the owner;
  - keep a stamping site;
  - keep `sendMain`'s write-back;
  - hold the append target across `processScript`'s await;
  - append to a held array in the ambiguous branch;
  - give `generateImage` or `upsertLocalLoreBook`'s type check the owner instead of the runner;
  - replace the output site's frozen re-read with an origin re-read;
  - drop `end()`.
- **Live check** on a production build, with the model set to Echo first (Live-State, "How to
  live-check this app"):
  - a manual trigger with `v2Wait` and `v2SetVar`, with a chat switch during the wait;
  - a send during a button trigger's wait;
  - a group member's `v2SetCharacterDesc`.
- **The commit message** is fact-checked by `opus-reviewer`.
- **Wiki pages** that W1a makes stale are listed for the maintainer, not edited.

## 12. Gate record

### Gate 1 round 1 — `opus-reviewer` (fresh), rev 1 — **[REJECT]** (ledger row 258)

The core design is accepted. The reviewer checked all of `runTrigger`, every caller,
`scriptings.ts` and wasmoon, and found no missed persistent write outside the stated carve-outs,
and no change to final state in the no-switch case other than E8's. The Orchestrator verified F1
(`proxy()` returns an existing proxy unchanged: svelte 5.56.8, proxy.js:40-44), F2, F3 and E2 in
source before acting.

**Blocking findings, and how rev 2 answers them:**
- **F1:** `sendMain`'s write-back through the live `chatPage` would make two chats share one array
  after a switch. → The input-trigger branch pushes through the origin and does not write back (§3,
  T2, T5); test 6.
- **F2:** the first output site's frozen-index commit was not dispositioned. → Both output commits
  are deleted, and the frozen re-reads stay, since an origin re-read there would duplicate through
  the inlay write-backs (§3); test 10. The Orchestrator departed from the reviewer's remedy
  ("the re-read replaces 1816 and 1923") for that reason.
- **F3:** moving the Lua character bindings to the member would change visible upstream group
  behaviour (the background). → The Lua bindings keep HEAD's subject class, the owner, resolved by
  id (T4); guard 19. The member and the owner are kept separate for writes (§5); test 14 asserts
  that the group is unchanged.
- **F4:** an ambiguous origin would silently stop every send. → T5 distinguishes gone from
  ambiguous in the callers; no triggers means no re-read; test 13.
- **F5:** tests that would not be red, or red for the wrong reason. → Tests 4 and 5 are driven
  through callers; the Lua `async` wrapper; test 11's fixture and `toStrictEqual`; test 17 narrowed
  to parent-to-child; test 18 reads through `DBState` after the caller; test 22 moved to
  diagnostics; test 20 excludes definitions.

**Editorial, and how rev 2 answers them:**
- **E1:** seven clone replaces, not eight (§1.2). The ledger's row 253 is corrected in the records.
- **E2:** the Python path is unreachable (§3).
- **E3:** the proxy figures were mixed across throttle rates (§6).
- **E4:** the net-cost claim is qualified by yields and loops (§6).
- **E5:** the `runLuaEditTrigger` stamping is added (§1.8, T8, test 11).
- **E6:** the `stopChat` stale closure is added (§1.6, test 8).
- **E7:** the carve-outs are now in T1 itself.
- **E8:** the early-exit case is disclosed (§8).
- **E9:** "235 lines, 344 parses" (§5).
- **E10:** the CHORE-27 correction names the stamping (§1).

**The memo** was checked sound for every await form in the engine. Its concurrent-coroutine case
is recorded in §9.

**Escalation count:** 1 substantive rejection.

### Gate 1 round 2 — the same `opus-reviewer` (reuse), rev 2 — **[REJECT]** (ledger row 259)

**Accepted:**
- F1, F2 and F4 are closed. The Orchestrator's F2 departure is confirmed correct. Keeping the
  frozen re-reads loses none of the trigger's own writes, which land by id. After an `unshift`,
  only the post-trigger inlay and listener code reads the wrong chat. That is W2's class and no
  worse than HEAD, where 1815 also destroyed the Branch copy.
- E1-E10 are closed as worded.
- The test labels for 5, 6, 10, 11, 13, 14 and 19 are correct.
- The reviewer judged the findings caller and specification details, not a recurring mechanism
  defect.

The Orchestrator verified N5's `runCurrentChatFunction` claim in source.

**Findings, and how rev 3 answers them:**
- **N1:** the blanket "owner" rule was wrong for `generateImage` and `upsertLocalLoreBook`, whose
  HEAD subject is the runner. → A per-binding subject table (§3), and T4.
- **N2:** the ambiguous branch appended to an array held since the start of the send, which a cut
  can detach. The append also held its receiver across `processScript`'s await. → S1: resolve
  after the last await, and in the ambiguous branch read the held chat object's `.message` at the
  moment of the append (§3). Test 13's variant; mutants.
- **N3:** "no triggers proceeds as at HEAD" conflicted with removing the write-back, and HEAD
  already aliases on that path. → S1 applies whether or not triggers ran; test 6's variant.
- **N4:** test 22's label was false. Its main assertion is red at HEAD. → That assertion is now red
  test 10a, and the mark-disabled variant stays diagnostic, with the rationale corrected.
- **N5:** `sendMain` has no existing harness, the `sendChat` harnesses mock the trigger engine, and
  the start-trigger rationale was false. → S1's extracted seam; a real-engine `sendChat` suite;
  the rationale corrected (§3, §7).
- **Optional, taken:**
  - test 15's count is defined;
  - T4 says what a gone member's `{chara}` reads use;
  - test 10 asserts the Branch copy survives, at both output sites;
  - the fourth stale closure (`setDescription`'s check) is in §1.6.
- **Also disclosed:** read-your-writes across the v2 and Lua APIs sees two subjects in a group run
  (T3, §8).

**Mechanism question (AGENTS.md §4, at the second rejection).** Three of the findings (F1, N2, N3)
came from one site, `sendMain`'s character branch. Rev 1 and rev 2 had specified it by mechanism,
and no test could reach it. Rev 3 states it as an invariant (S1) and gives it a seam. The design
itself has not been challenged in either round.

**Escalation count:** 2 consecutive substantive rejections. A third means `senior-advisor` before
rev 4.

### Gate 1 round 3 — the same `opus-reviewer` (reuse), rev 3 — **[EDITORIAL]** (ledger row 260)

**Accepted:**
- N1-N5 are closed as behaviour.
- S1 is sound against `sendMain`'s code after the branch: the composer clear, the other branches'
  write-back, and `doingChat`, which is not yet set.
- The per-binding table and T4's gone-member rule are sound.
- There is no blocking scenario.

**Editorial corrections, applied in rev 3.1:**
- **R1.** The no-trigger aliasing case at HEAD comes from a plugin `editinput` hook, not from a Lua
  edit trigger, which would itself be a trigger. The Orchestrator verified the hook's `await` in
  `processScriptFull`. §3 and test 6's variant are corrected. The error was the reviewer's own
  round-2 claim.
- **R2.** In a group run, `upsertLocalLoreBook`'s new target is a deliberate change (§3, §8).
- **R3.** The split send after a switch is disclosed (§8).
- **R4.** Test 10a's HEAD failure rests on its live assertions; test 22 makes no claim about HEAD.

**Optional, taken:**
- O1: test 10 covers the origin at index 0 and at a later index, and the chat that shifted.
- O2: S1's append is marked, with a cross-character variant in test 6.
- O3: the gone-member rules for the runner-based bindings and the v2 getters (§3).

**Gate 1 passed.** Two substantive rejections, then an editorial round. The three-round escalation
did not trigger.

### The build (tests first)

1. **The seam.** `sendCharacterMessage.ts` was extracted from `sendMain` with no behaviour change,
   and the suite stayed at its baseline.
2. **The tests.** Two test writers wrote five suites against the seamed tree. At HEAD, 35 failed and
   12 passed; the Orchestrator re-ran them.
   - Of the 35, 34 failed on behavioural or contract assertions, and the resolution-count
     specification failed on its then-missing test export.
   - The 12 were eight guards, three specification tests and one diagnostic. The row-264
     fact-check corrected this breakdown.
3. **The implementation**, by a separate coder. Its two failures were test defects:
   - the `cutchat` range could not tell live from clone;
   - the module-stamping test exercised its own mock.

   A test writer fixed both, re-proved each red against HEAD through a scratch alias config, and
   moved the module test to `tests/modulesTriggerStamping.svelte.test.ts`.
4. **Rev 3.2** aligned §3's gone-member rule for `upsertLocalLoreBook` with T4.

### Gate 2 round 1 — `opus-reviewer` (fresh) — **[REJECT]** (ledger row 261)

The reviewer's own pre-change run reproduced 35 red and 12 passing. The design, the memo, the
stamping, S1, the callers and the three `sendChatBody` sites were confirmed sound. The Orchestrator
verified B1 and B3 in source.
- **B1 (T6):** nothing on the Lua path marked for save, so a Lua button's writes to an unselected
  origin were lost after encode and decode. `triggerlua` marked only after `runScripted` returned.
- **B2:** mutants survived: per-effect marks, M8, M10, M12, M15, M19 and M21. Plan test 8's second
  bullet was missing, and test 14 lacked its `$y` assertion.
- **B3 (T4):** `refreshSubject`'s `member ?? owner` made a nested trigger call `runTrigger(group)`,
  which threw, and gave image generation the group.
- **T9:** `{chara: char}` was evaluated after an await at eight sites.
- **Editorial:** three production comments; the "real `$state`" claims in the node-environment
  suites (they are plain objects there); stale or dead test text.

**Remediation, tests first:**
- A test writer added six reproducers (red on the tree, re-run by the Orchestrator), the
  mutant-killers and the test editorials.
- The implementer:
  - added `markWriteFor` after each of the twelve Lua write bindings;
  - added a separate `runner`, null when the member is gone, which the nested-trigger and image
    effects skip on;
  - added a `refreshSubject()` after each await whose case then reads the subject;
  - fixed the comments.
- **Found in remediation:** a Lua call with an origin but no `setVar`/`getVar` (the Lua button)
  still used the selection-bound `chatVar`. It was closed the same way: a 2-test reproducer, then
  origin-bound defaults in `runScripted`. Origin-less calls are unchanged.

### Gate 2 round 2 — the same reviewer (reuse) — **[EDITORIAL]** (ledger row 262)

- Served with the pre-remediation code, exactly the 8 new reproducers fail, each on a behavioural
  assertion.
- Every round-1 survivor is killed, as are the new mutants on `runner`, the default `setVar`/`getVar`
  and `addChat`'s mark.
- Stopping mid-effect leaves nothing half-written, and the defaults match `chatVar`'s semantics.
- **Editorial, applied and verified by the Orchestrator:**
  - E-a: a describe title stated the fixed bug;
  - E-b: a false claim of a module test in the engine suite;
  - E-c: a reproducer was labelled a guard;
  - E-d: `defaultGetVarFor`'s docstring ignored the default variables.
- **Optional, taken:**
  - the ids were removed from fixture data;
  - two mutant-killers were added, for v1 `runtrigger` with a gone member and for the Lua button's
    `removeChat` and `setFullChat` saves. Each passes, and each fails against its scratch mutant.
- **Remaining low survivors, recorded:** the refresh after `alertInput` (a read-only parse), and v1
  `runImgGen` passing `char` (equal to `runner` whenever it runs).

**Gate 2 passed.** On the final snapshot: 135 files, 1628 passed, 4 skipped, exit 0; `pnpm check`
clean; `pnpm run build` passes.

**Live check:** passed (ledger row 263). **Commit-message fact-check:** [EDITORIAL], applied (row
264).

## 13. Wiki pages W1a makes stale (for the maintainer; not edited here)

`doc-verifier` checked 42 claims on 8 pages. The Orchestrator spot-checked the quotes.

**STALE:**
- **`Trigger-Script.md`:**
  - the Lorebook V2 section, "All of these persist immediately to the selected character's
    lorebook data";
  - `v2Get`/`v2SetCharacterDesc`, "selected character's description";
  - `v2Get`/`v2SetReplaceGlobalNote`, "selected character's".

  All of these now go to the trigger's own character, which is the member in a group.
- **`Lua-Scripting.md`:** the lead callout, "almost every Lua binding … acts on the currently
  selected character".
  - Now false for the name, description, first-message and background bindings, which act on the
    chat's owner.
  - Still true for `getPersonaDescription`, the lorebook loaders and `cbs` (W1b).
  - Its line citations are off.
- **`Lua-API-Reference.md`:**
  - `getName`, `getDescription`, `getCharacterFirstMessage` and `getBackgroundEmbedding`,
    "selected character's …";
  - `setDescription`'s "checks an unrelated outer-scope variable": fixed;
  - `upsertLocalLoreBook`'s "no-op for groups": in a group run it now writes the group's chat.

**Undocumented W1a behaviour worth a sentence:**
- a trigger's changes are visible while it runs;
- messages sent or edited during a trigger's wait are kept;
- a trigger stops if its chat is deleted or duplicated during a wait;
- in a group, the member's description and lorebook effects write the member.

**Pre-existing, independent of W1a:**
- `Trigger-Script.md`: "Group chats only run module triggers". It holds for paths that pass the
  group itself, such as `runLuaEditTrigger`, but not for a member's `start` and `output` triggers
  during generation.
- `Trigger-Script.md`'s `lowLevelAccess` comment ("not stored on each entry") was false before W1a,
  and W1a makes it true.
