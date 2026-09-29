# W2b — One generation at a time, owned by the send that started it

**STATUS:** plan rev 7.2, 2026-09-29. **Gate 2 passed; live check passed; committed as `ac8cb3da`.** **Gate 1 passed** (round 7 [EDITORIAL], applied); rev 7.2
amends D4's yield placement at implementation (section 12). W2b-core. Gate 1 rounds 1-3 [REJECT]; escalated to
`senior-advisor` (ledger row 323), whose direction rev 4 adopts (section 12). Rounds 4 and 5 (a
fresh reviewer) held the design and rejected definitions and scenarios; revs 6 and 7 correct
them. The preview work moved to its own stage, W2b-previews (section 3).

**Decisions:**
- `MC-103` 1: a starter that finds another send in flight is refused silently; the plugin
  `sendChat` keeps its contract of throwing. The Orchestrator default "the preview hotkey and
  DevTool register as work" is already true (W2a's wrapper registers every call it accepts).
- `MC-105`: `/multisend` replies to every segment (1); the busy button cancels every generation
  (2); a group preview previews the next member (3, W2b-previews).
- `MC-106`: an unquoted `|||` stays in the command's text (1); a `/multisend` inside a running
  send posts its segments without replies (2); a preview's Cancel button (3, W2b-previews).
- `MC-107`: a stopped `/multisend` that has posted a segment leaves the composer empty (1); the
  `|||` rule applies to trigger effects too (2).
- `MC-098` 1: switching stays unrefused while the composer is between its take and generation.
  `MC-099`: the busy button cancels a composer send that has not reached generation. `MC-100`:
  the composer is locked from Send until generation starts.
- `MC-073`: refusals are silent. `MC-011`, `MC-089`, `MC-091`.

**Evidence:**
- Ledger rows:
  - 319, the scoping packet (scratchpad `w2b/packet.md`);
  - 320-322, Gate 1 rounds 1-3 (scratchpad `w2b/gate1/`, with the reviewer's execution runs
    `spin.mjs`, `multisendSplit.test.ts`, `groupQuiet.test.ts` and `yieldOrder.*`);
  - 323, the escalation;
  - 324, Gate 1 round 4 (scratchpad `w2b/gate1r4/`, with `quietGroup.svelte.test.ts` on the real
    `sendChat`, and the yield probes);
  - 325, Gate 1 round 5 (`w2b/gate1r4/round5.md`, with `emptyOrder.test.ts`);
  - 326, Gate 1 round 6 (`w2b/gate1r4/round6.md`).
- The Orchestrator re-read in source:
  - the wrapper, `enterSendChat` and the body up to `doingChat.set(true)`. It checked that no
    await separates the wrapper's guard from that set, so the check and the take happen together;
  - the group loop;
  - `sendChatMain`, `runAutoMode` and `abortChat`;
  - `processMultiCommand`'s splitter, `/multisend` and the composer's command stage;
  - `groupOrder`;
  - `sendPofile`;
  - the plugin `sendChat`;
  - the preview hotkey;
  - DevTool's Preview and Autopilot;
  - the Post File menu item.

## 1. What is wrong at HEAD

`doingChat` means "a generation is running", and every reader treats it that way: the composer's
guards, `changeChar`, the plugin throw, cold storage, the translator, Suggestions and the busy
button. But nothing owns it.

- **No owner.** `sendChatBody` sets the flag on every call, and never clears it at a normal or
  error end. Each caller clears it itself, unconditionally, and some callers never do.
- **Stolen flag.** Three paths clear a flag another unit holds:
  - the composer's hand-off, which clears it after every `sendChatMain`, including when `sendChat`
    refused because another unit held it. A second Send is then accepted and runs concurrently
    into the same chat;
  - the preview hotkey at Home, whose guard skips Home, once an earlier preview has left a body;
  - auto mode, which never reads the flag. Started during a plugin send, its first tick is refused
    and clears the plugin's flag.
- **Stuck flag.** Send, reroll and `changeChar` are then refused until a reload (auto mode, which
  never reads the flag, clears it instead). These
  leave it stuck:
  - `/multisend`;
  - a `.po` Post File job;
  - DevTool Autopilot, from its second entry;
  - a preview that throws.
- **Accepted during the flag.** The wrapper refuses only `chatProcessIndex === -1`. So a direct
  outermost `sendChat(i)` with `i ≥ 0` runs even while another send streams. DevTool Autopilot, the
  one caller that makes such a call, re-checks the flag itself just before it.
- **The composer's take.** From Send's take until the body sets the flag, the flag is false. The
  plugin, the preview hotkey and DevTool pass their guards; the composer's own hand-off is then
  refused, and its message gets no reply.
- **`/multisend a|||b|||c`** is cut at every `|` by `processMultiCommand`. It posts `a`, then
  fails, and the composer posts the command text as a message.
- **Cancel.** Only the composer passes an abort signal. During any other generation, the busy
  button shows its stop icon and does nothing.
- **Auto mode can freeze the page.** A tick that is refused, or a group tick whose turn order is
  empty, completes without awaiting anything. The loop then re-enters on resolved promises alone
  (`spin.mjs`).

## 2. The design

**D1. The unit owns the flag and its cancel.**
- **What a unit is.** A `sendChat` call that is not one of the send's own recursions (group turns,
  auto-continue, resend) is a unit.
- **Taking the flag.** After its refusals, and before its first await, a unit sets `doingChat`. It
  also publishes its own abort controller as *the unit in progress*, linked to any signal its
  caller passed. The wrapper checks the flag and takes it in one synchronous stretch, so **at most
  one unit is ever in progress**.
- **A signal already aborted at entry.** An outermost call whose caller's signal is already
  aborted returns `false` before `enterSendChat`. It is treated as refused: it takes no flag,
  publishes nothing, registers no work and fills no ids, so it runs no trigger, no script, no
  memory and no request, and writes nothing.
  - This covers a busy-button press during the composer's `sleep(10)` after its append, whose
    `abort` event has fired before the hand-off. `MC-099` 4 governs that press (after the append,
    the busy button aborts generation): the user's message stays without a reply, and the composer
    stays empty.
  - The rule applies to outermost calls only. A recursion runs on its unit's signal, whose aborts
    the body already handles: after an abort, a marked recursion can still run its start trigger
    and memory before ending, as at HEAD. That is deliberate.
- **Releasing it.** The unit clears both the flag and the published controller in its `finally`,
  on every exit, including a throw.
- **Invariant:** the published controller is non-null exactly when `doingChat` is true.
- **Recursions and refusals.** The recursions carry an explicit marker. The flag does not refuse
  them, and they neither set nor clear the flag nor publish a controller. A refused call does none
  of these either. The marker must be explicit: "carries an origin" and "index ≥ 0" both fail.
- **Nothing else writes the flag.** This removes the packet's 15 clears (section 1a).

**D2. A unit's outcome.** An outermost `sendChat` reports completion (`true`) only when its body
returned `true` **and** its own controller was not aborted. So an abort always reports "not
completed", whatever the body's tail did after the stream. The body's own return, and what the
recursions return to the group loop, are unchanged.

**D3. One busy predicate for starters.**
- **What counts as busy.** A send is in flight while `doingChat` is set, or while the composer
  holds its action window (`windowOpen`). The window is open:
  - from Send's take until its hand-off returns;
  - for a whole reroll;
  - for a whole auto-mode run.
- **When starters check it.** Each starter below checks before its first side effect.
- **Unchanged.** The composer's own hand-off is refused by the flag only. `changeChar` reads only
  the flag, and the chat switches read nothing, so the window refuses no switch (`MC-098` 1).

| Starter | Refusal |
|---|---|
| Send, Continue, reroll, unreroll | unchanged (they already check both) |
| Auto mode | silent; it reads the flag before each tick (D4) |
| Plugin `sendChat` | throws "A chat is already in progress" (existing message), now also while the window is open |
| Preview hotkey | silent, while busy and at Home; it never clears the flag |
| DevTool Preview and Autopilot | silent; adds the window check; they never clear the flag |
| `.po` Post File | silent, after the pick (the type is known only then); nothing is pushed |
| `/multisend` | never refused and never reads the window; see D5 |

**D4. Auto mode.**
- **Between ticks** it yields to the event loop with a macrotask. The first tick runs straight
  from the click, as at HEAD. Before every tick it reads the flag, in the same synchronous stretch
  as that tick's `sendChat`.
- **It stops:**
  - when another unit holds the flag;
  - after a tick that does not complete (D2): refused, cancelled or failed;
  - when the busy button is pressed (D6), including a press that lands in the yield;
  - after 50 consecutive quiet ticks.
- **A quiet tick** is one in which no turn reached its generation setup: the point, past the group
  dispatch and the member checks, where the send has settled on the character it speaks as. The
  send reports this itself, so the rule never re-derives who may speak.
  - A character chat's tick always reaches it, so it is never quiet. (Auto mode is offered only in
    group chats today; this keeps the rule true if that changes.)
  - A group's own dispatch does not count as a turn. Only a member turn that was not skipped does.
  - Examples of a quiet group tick: the random roll picked only the last speaker; every member in
    the order was skipped because they were gone, removed from the group, or not resolvable to one
    character.
  - A cold member is restored and takes their turn (`MC-104` 2), so that tick is not quiet.
  - A tick that reached a turn resets the count, whatever the turn produced; no message count is
    used.
  - A random-order group with no active, talkative member throws in the group loop at HEAD
    (`groupOrder([])` returns `[undefined]`), so that tick fails, and auto mode stops after it.
    That is kept.
- **Why a count and not a predicate.** Round 4 showed that a predicate for "a member can speak"
  drifts from the turn's own rules: skips for ambiguous members and for failed pins, cold
  restores, and deleted members still listed. The count needs no copy of those rules.
- **Why 50.** The chance of a random quiet tick is measured, not assumed. In a two-member group it
  is 28% at the default talkativeness (4/6) and 83% at the lowest setting with a self-mention
  (row 321). The chance that a given window of 50 ticks is all quiet is 0.834^50 ≈ 1e-4; at the
  worst setting, a false stop comes on average after about 52,000 ticks. A group where no turn can
  ever run stops after 50 ticks, with a yield between each two and no request.

**D5. Loop starters.** Each entry's `sendChat` is a unit under D1, so the flag is released between
entries.
- **"Does not complete"** means D2's `false`, or a throw.
- **A throw is still surfaced as at HEAD.** A loop that stops on a throw rethrows it after its own
  stop, so the error still reaches the user through the app's `unhandledrejection` alert, or its
  caller's own catch. `sendPofile` stopped by a throw makes no further download, as at HEAD (on
  Tauri it has already downloaded after each earlier entry); stopped by a `false`, it ends as at its
  normal end.
- **Autopilot and `sendPofile`:**
  - before each entry's push, they check the busy predicate;
  - they stop at the first entry that is busy or does not complete (D2), and make no further push;
  - On a stop that is not a throw, `sendPofile` then ends as at its normal end, with what it has
    built.
- **`/multisend`** reads the flag once, before its first push. Its mode then holds for the whole
  run: while it runs, either the outer send holds the flag throughout, or nothing can take the
  flag, since no macrotask runs between its segments.
  - **Flag held** (it runs inside another send, from a trigger in it, or from a trigger button
    mid-send): it posts every segment, and calls `sendChat` for none (`MC-106` 2).
  - **Flag free:** it posts each segment and generates its reply, in order. It stops at the first
    segment that does not complete, including one cancelled by the busy button (`MC-105` 1-2).

**D6. The busy button stops the unit on every path (`MC-105` 2).**
- **What it does now.** On every press, the button:
  - aborts the unit in progress, if any;
  - stops auto mode, if running;
  - does what it does today: it cancels an unsettled composer take (`MC-099`), and aborts the
    composer's generation controller.
- **The unit abort is unconditional.** It does not sit behind the take-cancel's early return. While
  a composer take runs a `/multisend`, the take is still unsettled, and its segment is the unit.
- **`MC-107` 1.** Once a `/multisend` has posted a segment during the take's `/` stage, the
  composer treats the command as handled, however the stage ends: a busy-button cancel, a throw,
  or a later command in the pipe that fails. The command text is neither put back nor posted as a
  message. The staged files and the translation go back as today, so "empty" means the text box.
  - The composer knows this without caller context: `/multisend` counts its pushes in the leaf
    module, and the take records the count when its `/` stage starts. Every ending compares
    against that record, including `abortChat`, which puts the text back at the press, before the
    stage has ended.
  - A trigger button's `/multisend` pushing during the same stage counts too (the disclosed class,
    section 3).
- **A cancelled plugin `sendChat`** resolves `true`, as it does today whatever its send returns.

**D7. The command line keeps `|||` (`MC-106` 1, `MC-107` 2).**
- **The rule.** An unquoted run of three or more `|` stays in the command's text. One `|` or two
  (`||`) still separate commands; the two therefore still fail on the empty command between them.
- **It applies everywhere the command line runs**, in the composer and in trigger `command`
  effects.
- **No line that completes at HEAD changes.** A line that fails at HEAD can change what its earlier
  commands did. A trigger expands CBS before the split and ignores the failure. So
  `/setvar key=x {{getvar::list}}`, with `list` holding `a|||b`, stores `a` at HEAD and `a|||b`
  under D7.

## 3. Scope

**In:** D1-D7. Files are in section 9.

**W2b-previews** (its own plan and gates, after W2b-core; `MC-089` means nothing ships between):
- the previews' notice: closing their own notice, leaving later alerts in place, the Cancel button
  (`MC-106` 3);
- no stale preview;
- no throw on an empty body;
- the group preview (`MC-105` 3).

W2b-core only removes the previews' flag clears, and refuses the hotkey at Home and while busy.

**Out:**
- **W3.** Binding `/multisend`, `sendPofile` and trigger-run `/` commands to an origin. W2b-core
  leaves them on the chat captured at each `sendChat`'s entry. It also leaves to W3 whether a
  cancel stops other `/` commands.
- **Disclosed.** A trigger button's `/multisend` pressed while the composer's window is open, or
  during auto mode's yield, can take the flag first:
  - the composer's hand-off, or auto mode's next tick, is then refused;
  - if it posts during a composer take's `/` stage, the take's typed text is not put back when the
    stage ends early (D6).

  No two generations run at once, and the flag is never stolen or stuck.
- **Disclosed (W3):** a press during a command *before* a `/multisend` in the same pipe, as in
  `/speak x|/multisend a|||b`, puts the text back, and the pipe then goes on to post and generate
  the segments. Whether a cancel stops a running `/` command is W3's.
- **W2e.** The delete warning and complete registration.
- **Upstream behaviour kept:**
  - what a preview writes before its return;
  - reroll trimming the reply before a refusal that is not a busy refusal;
  - Autopilot passing its loop index as `chatProcessIndex`. In a group, entry *i* speaks as member
    *i*; past the last member it errors, which D5 turns into a stop.
- **The name-alike store.** `export const abortChat = writable(false)` in `index.svelte.ts` has no
  reader. Leave it alone, and do not wire the button to it.

## 4. Invariants

- **I1. Owner.** `doingChat` is true, and a unit controller is published, exactly while an accepted
  unit is in progress.
  - Both are set before the unit's first await, and cleared when it settles.
  - A refused call and a recursion change neither.
  - At most one unit is in progress.
- **I2. No flicker.** Across group turns, auto-continue and resend, the flag stays true.
- **I3. One at a time.** While the flag is held, no `sendChat` is accepted except the holder's own
  recursions. While the composer's window is open, no starter in D3's table makes a side effect,
  except for two:
  - the composer's own hand-offs: Send's, reroll's and each auto-mode tick's, each made inside its
    own window;
  - `/multisend`, which posts its segments in either state and generates only when the flag is
    free.
- **I4. Switches unchanged.** `changeChar` is refused exactly when the flag is set.
- **I5. Outcome.** An outermost `sendChat` whose controller was aborted returns `false`.
- **I6. Auto mode.**
  - It yields between every two ticks and never runs a tick while another unit holds the flag.
  - It stops after a tick that does not complete, on the busy button, and after 50 consecutive
    quiet ticks (D4). A tick outside a group is never quiet.
  - A random quiet tick does not stop it, and a tick with a cold member's turn is not quiet.
- **I7. Loops.**
  - Autopilot and `sendPofile` make no push after an entry that is busy or does not complete.
  - `/multisend` with the flag free makes no push after a segment that does not complete.
  - With the flag held, `/multisend` posts every segment and calls no `sendChat`.
- **I8. Cancel.** While a unit is in progress, the busy button aborts it and the unit reports "not
  completed". A call whose caller's signal was already aborted at entry returns `false`, takes no
  flag and runs nothing.
  `MC-099`'s take-cancel is unchanged, except as `MC-107` 1 amends it: after a `/multisend` has
  posted during the `/` stage, the text is neither put back nor posted.
- **I9. Plugin contract.** `risuai.sendChat`:
  - throws "A chat is already in progress" when refused;
  - otherwise pushes its message into the selected chat;
  - resolves `true` when its send settles, including when cancelled.
- **I10. Readers.** Every reader of `doingChat` keeps its code. Only the flag's lifetime changes.
- **I11. Splitter.** An unquoted `|||` never separates commands; every `|` or `||` that separates
  commands today still does.

## 5. Mechanism (non-normative)

- **The recursion marker.** `SendChatArg` gains an internal marker for the three recursions, or the
  recursions call an inner function.
- **The leaf module.** A `.svelte.ts` leaf module holds:
  - the window flag, kept reactive, because `DefaultChatScreen.svelte` reads `isComposerBusy()` in
    its template;
  - the busy predicate;
  - the unit-in-progress slot.

  `index.svelte.ts` must not import `composerActions.svelte.ts`. The implementer checks for import
  cycles and reports what it found.
- **Signals.** Link the caller's signal to the unit's controller with a listener, and remove the
  listener in the `finally`. `AbortSignal.any` needs Safari 17.4 or later.
- **The wrapper's `finally`** releases the flag and the slot before `markCharacterForSave`.
- **The yield.** A `MessageChannel` post is not slowed in a hidden tab or by chained timers, as
  `setTimeout(0)` is.
- **Auto mode's tick outcome.** `sendChatMain` returns the unit's outcome. A "turns reached"
  counter in the leaf module is bumped where the send settles on the character it speaks as, past
  the group dispatch and the member checks; bumping it at the body's entry would count the group's
  own dispatch and bring back the endless loop. Auto mode reads the counter before and after each
  tick; D1 guarantees no other unit can bump it meanwhile. Auto mode reads the flag immediately
  before calling, with no await in between.
- **Testable seams.** Move DevTool's Autopilot loop and its Preview handler out of
  `DevTool.svelte`'s markup, into functions tests can call. Drive the hotkey through the keydown
  harness in `hotkeyCharSwitch.svelte.test.ts`.
- **Test mocks.** The composer and mount suites' mocks encode "`sendChatMain` clears the flag".
  They move to the new protocol.

## 6. Acceptance scenarios and tests

**Order of work:**
1. Extract the DevTool seams, with no behaviour change. Snapshot; the whole suite passes on it.
2. Write the reproducers against that snapshot. Each must fail there on the behaviour it names,
   and the failure is recorded.
3. Then write the fix.

Guards are labelled `guard:`. Harnesses that could spin at the snapshot are bounded: the mocked
tick stops auto mode after a fixed number of calls. A yield is detected with a `MessageChannel`
message posted before auto mode starts, which a correct yield delivers within a few ticks; a
`setTimeout` probe is not used, because it fires unpredictably around `MessageChannel` yields
(round 4 measured it).

1. **The hand-off does not steal the flag.** Another unit holds the flag, and the composer hands
   off. It is refused, and the flag is still true afterwards. (At HEAD it is false.)
2. **A normal end clears the flag**, without any caller clearing it. (At HEAD it stays true.)
3. **A throw clears the flag.** (At HEAD it is stuck.)
4. **No flicker.** Across an auto-continue and across a resend, a subscriber records no false
   before the unit settles. (At HEAD each records one.)
   - `guard:` the same holds across a group's two turns.
5. `guard:` a refused call leaves the flag set and publishes nothing.
6. **One unit.** While a unit streams, a direct outermost `sendChat(0)` is refused and registers
   nothing. (At HEAD it runs.)
   - **An already-aborted signal.** On the real `sendChat` harness, a direct call with an aborted
     signal returns `false`, and `requestChatData`, the start trigger, the flag, the registry and
     the message ids are untouched. (At HEAD the body runs: the start trigger fires, and
     `requestChatData` is called with the aborted signal.)
   - `guard:` in the composer suite, a press during `sleep(10)` hands the hand-off an aborted
     signal.
7. **Outcome.** A unit aborted in its output trigger, after the stream, returns `false`. (At HEAD
   it returns `true`.)
   - `guard:` a unit aborted during the stream returns `false`.
8. **Hotkey.** A send is running and the user is at Home, with a body left by an earlier preview.
   The preview hotkey leaves the flag set and sends nothing. (At HEAD it clears the flag.)
9. **The composer's window.** During Send's input-trigger wait:
   - the plugin `sendChat` throws and pushes nothing;
   - the preview hotkey and DevTool Preview do nothing;
   - the composer's reply then generates.

   At HEAD, the plugin and the previews run, and the composer's reply is refused.
10. **Auto mode.**
    - While a plugin send is in flight, starting auto mode does nothing.
    - A tick refused mid-loop stops it.
    - In the composer suite, with ticks that report quiet: auto mode stops after 50, and the
      `MessageChannel` probe is delivered before it ends. (At HEAD it never yields.)
    - `guard:` in the composer suite, 49 quiet ticks and then one that reaches a turn do not stop
      it, and the count starts again.
    - `guard:` in the composer suite, in a character chat, auto mode runs past 50 ticks.
    - An acceptance test for the new report (at the snapshot it can fail only on a missing export):
      on the real `sendChat` harness, a group tick reports quiet when the only member who can speak
      spoke last, when the other member is deleted, and when the other member's id has two holders.
      Each reports that a turn was reached when the member is cold (restored), and in a character
      chat. Round 4 showed with the real `sendChat` that the
      deleted and duplicated cases return `true` with no request before any macrotask.
    - At HEAD, auto mode steals the flag.
    - The busy button stops it, including a press that lands in the yield.
11. **Autopilot, three entries.** Each gets a reply, and the flag is false at the end. (At HEAD,
    entry 2 is pushed with no reply, and the flag is stuck.)
12. **`/multisend a|||b|||c` typed in the composer.** Three user messages, each followed by its
    reply. The command text is not posted, and the flag is false at the end. (At HEAD only `a` is
    posted, then the command text.)
    - `guard:` `/a|/b` runs two commands.
    - `guard:` `/a||/b` still fails.
13. **Nested `/multisend`.** A plugin `sendChat` whose output trigger runs `/multisend x|||y`
    posts both segments with no reply of their own, and calls no `sendChat` for them. The plugin
    send's reply is intact, and the flag is false after it. This needs a harness with the real
    `command.ts`. (At HEAD only `x` is posted.)
14. **`.po` Post File.** The flag is false after the job. (At HEAD it is stuck.)
    - `guard:` every entry gets its reply.
    - An acceptance test for the fix (at the snapshot the first entry's stuck flag refuses the
      Send, so the window never opens): with `isTauri` mocked, a composer Send that opens its
      window between two entries makes the next entry push nothing, and the job stops.
15. **Busy refusals.** While a send runs:
    - a `.po` Post File pushes nothing;
    - Autopilot pushes nothing;
    - `guard:` reroll and unreroll are refused.
16. **Cancel.** The busy button aborts each of these, and the flag is false afterwards:
    - a plugin `sendChat`, which resolves `true`;
    - Autopilot, which pushes no further entry;
    - `/multisend` typed in the composer, which posts no further segment and leaves the text box
      empty (`MC-107` 1);
    - `/multisend a|/trigger x` typed in the composer, pressed during `/trigger`: the text is not
      put back (at HEAD it is);
    - `/multisend` run by the input trigger, which posts no further segment; the test asserts that
      the segment's request signal was aborted, so it fails at HEAD on the cancel, not on the
      splitter;
    - `sendPofile`, which stops;
    - auto mode, which runs no further tick.

    Each is tested with the press during the stream. The loops are also tested with a press after
    the stream, in the output trigger. The plugin's after-stream case is a `guard:`.
17. **`MC-107` 1's other endings.**
    - `/multisend a|/nosuchcommand` typed in the composer: `a` is posted with its reply, and the
      command text is neither posted as a message nor put back. (At HEAD the fall-through posts the
      command text.)
    - `/multisend a|||b` whose first segment's send throws: the text is not put back, `b` is not
      posted, and the error is still alerted. (At HEAD the text is put back.)
    - `guard:` Autopilot and `sendPofile` whose entry's send throws: the call rejects with the
      error (which the app's `unhandledrejection` handler alerts), and `sendPofile` makes no
      download after the throw. Both stop, as at HEAD.
18. **Readers.**
    - `guard:` `changeChar` is refused while the flag is set.
    - `guard:` `changeChar` is accepted during the composer's input-trigger wait.

The existing tests that pin the flag's end state pass unchanged, including resend in
`sendChatOrigin.svelte.test.ts` and cold storage's RL6 and RL8. The two composer mocks are updated.

## 7. Compatibility

- **Plugins.** `risuai.sendChat` keeps its signature, its throw message and its push.
  - It now also throws while the composer's window is open. Before, it ran, and caused the
    composer's own reply to be refused.
  - The busy button can cancel it; it then resolves `true`.
  - The plugin permission prompt still appears before the busy throw, as at HEAD.
- **Characters, modules, presets and backups.** Untouched.
- **`/multisend`.** From the composer or a trigger outside a send, it posts every segment, each
  with a reply (`MC-105` 1, `MC-106` 1, `MC-107` 2). Upstream posts `a` with a reply, then the
  command fails. Inside a send, it posts every segment without replies, as upstream does.
- **The command line.** Only a `|||` run changes meaning (D7).
- **`sendChat`'s return.** An outermost call aborted after its stream now returns `false`. Its
  callers are the composer, the plugin, the hotkey, DevTool, `/multisend` and `sendPofile`. None is
  plugin-visible except through the plugin's own `true`.

## 8. Risks

- **The flag every send depends on.** A missed recursion marker would make a recursion refuse
  itself. This is covered by scenario 4, the group tests and resend in
  `sendChatOrigin.svelte.test.ts`.
- **The single slot** rests on the check and the take happening together (D1). Scenario 6 pins it.
  Any await added between the wrapper's guard and the take would break it.
- **Auto mode's quiet signal** comes from the group loop itself, so it cannot drift from who may
  speak. Scenario 10 covers a deleted, a duplicated and a cold member, and a random quiet run.
- **Import cycles** from the leaf module.
- **Suggestions** requests once per settled unit instead of on each flicker.

## 9. Files expected

- `src/ts/process/index.svelte.ts`
- `src/ts/process/composerActions.svelte.ts`
- `src/ts/process/command.ts` (the splitter and `/multisend`)
- `src/ts/process/files/multisend.ts`
- `src/ts/plugins/apiV3/v3.svelte.ts`
- `src/ts/hotkey.ts`
- `src/lib/SideBars/DevTool.svelte`
- `src/lib/ChatScreens/DefaultChatScreen.svelte` (the `.po` refusal only, if it lands there)
- a `.svelte.ts` leaf module under `src/ts/process/` (new), and the Autopilot seam
- tests under `src/ts/process/tests/` and beside the seam

## 10. Review

- **Gate 1 rounds 4-6:** a fresh `opus-reviewer`, given rounds 1-3 and the escalation, reused
  for its own later rounds.
- **Gate 2:** a fresh `opus-reviewer`, with the diff, the red-test evidence and the checks.
- **Live check**, after Gate 2, on a production build with Echo:
  - the preview hotkey at Home mid-send;
  - `/multisend a|||b|||c`, and the busy button during it;
  - auto mode started mid-send;
  - the busy button during auto mode.

## 11. (reserved)

## 12. Gate record

(The dispositions under rounds 1 and 2 cite that revision's own numbering of D-items, invariants
and scenarios, which later revisions reuse for other items.)

**Gate 1, round 1 (rev 1; ledger row 320): [REJECT].**

Major findings:
- **M1.** `/multisend a|||b|||c` is cut apart by the splitter, so scenario 10 could not pass.
  Resolved by `MC-106` 1 → D7, I11 and scenario 10.
- **M2.** I3 contradicted the composer's own `/multisend`, and the nested case was undecided.
  Resolved by `MC-106` 2 → D2, D4, I3 and scenario 11.
- **M3.** A cancelled send can return true, so a stop keyed to the return value fails. Resolved by
  a per-job cancel that decides by itself (D5), I6, and scenarios 14 and 15.
- **M4.** A quiet group tick spins auto mode. Resolved by D3 and I5 (yield, plus the bounded quiet
  run) and scenario 8.
- **M5.** The Loading notice is never closed and hides the busy button. Resolved by `MC-106` 3 →
  D6, I8, and scenarios 15 and 16.

Minor findings:
- **m6.** Loop entries did not re-check busy before pushing. Resolved in D4 and scenario 12.
- **m7.** The seams did not exist at HEAD. Resolved by the order of work in section 6.

Editorial:
- **E8 a-h**, applied:
  - `windowOpen`'s real span;
  - the refusal of a `.po` file after it is picked;
  - the plugin's resolve;
  - the switches;
  - the start trigger's push;
  - the preview's writes;
  - resend coverage;
  - the hotkey's precondition at Home.
- The optional points were taken where they bear on the design: a reactive leaf, the signal link,
  and the order of the `finally`.

**Gate 1, round 2 (rev 2; ledger row 321; the round-1 reviewer): [REJECT].** Round 1's findings
are answered; three new defects in rev 2's own additions.
- **N1 (MAJOR).** One "running job" slot: a nested `/multisend` ending first cleared it, so the busy
  button stopped reaching the outer job. → D5: jobs in progress are a set, and the busy button
  aborts them all; I7; scenario 11.
- **N2 (MAJOR).** "Closes its notice" would have cleared the error alert that explains a failed
  preview; `inlayErrorResponse`'s appended error was missing. → D6, I8, scenario 16.
- **N3 (MAJOR).** The carve-out for "the composer's own `/multisend`" cannot be built: a trigger
  button's `/multisend` reaches the same path with no caller context. → D2: `/multisend` never
  checks the window; I3 restated; the section 5 hint dropped; the disclosure widened.
- **N4 (MINOR).** The quiet-group reproducer would hang at the snapshot. → a bounded harness,
  scenario 8.
- **N5 (MINOR).** D3's arithmetic used the fallback talkativeness. → measured figures, and the
  constant sized against the lowest setting (50).
- **N6 (MINOR).** Labels: scenario 15's Cancel button is an acceptance test; the plugin's
  after-the-stream cancel is a guard; scenario 11 needs a real `command.ts` harness.
- **Editorial, applied:** D7 "no line that completes at HEAD", with the `setvar` case; `||` stated;
  the rule's reach to trigger effects stated as the Orchestrator's reading of `MC-106` 1.
- **Optional taken:** the `MessageChannel` yield; the disclosure of a trigger's `/multisend` in
  auto mode's yield; a fixed turn order for scenario 17.
- **At this second rejection, the Orchestrator asked whether the mechanism was the problem.** Both
  new majors came from treating a nested `/multisend` as a special case: an owner of the window,
  or an owner of the single cancel slot. Rev 3 removes the special case instead of guarding it:
  `/multisend` never checks the window, and the busy button aborts every job in progress.

**Gate 1, round 3 (rev 3; ledger row 322; the round-1 reviewer): [REJECT].**
- **S1 (MAJOR).** Every generating `/multisend` (typed in the composer, run by the input trigger, or
  run by a trigger button) had no abortable signal. `processMultiCommand` has no caller context,
  and each segment's `sendChat` made a fresh signal.
- **S2 (MAJOR, test).** The nested-cancel scenario passed at HEAD, through the composer's legacy
  controller.
- **Minor findings.**
  - A quiet tick measured by message length misfires on cards that drop a message each turn.
  - The timer assertion conflicted with the `MessageChannel` yield (measured).
  - The Cancel click should close the notice at once.
- **Third consecutive substantive rejection:** escalated.

**Escalation (ledger row 323; `senior-advisor`).**
- **Root cause.** The flag was owned by the unit (an outermost `sendChat`) and the cancel by the
  job (the starter). Starter identity does not exist below `processMultiCommand`/`runTrigger`.
  Every major since round 1 was that gap surfacing at a new point.
- **Missed insight.** The wrapper checks the flag and takes it together, so at most one unit is
  ever in progress, and a nested outermost call is refused, not registered. The Orchestrator
  re-checked that no await separates the two.
- **Adopted in rev 4:**
  - the unit owns the flag and one controller in a single slot (D1);
  - the wrapper reports an aborted unit as not completed (D2);
  - loops stop on a unit that does not complete (D5);
  - the busy button aborts the unit on every path and stops auto mode directly (D6);
  - `/multisend` reads the flag once, before its first push (D5);
  - a deterministic predicate for "no member can speak" replaces the count of 50 (D4);
  - the previews split into W2b-previews (section 3).
- **Rejected on its advice:** per-job cancels, a cancel epoch, a set of jobs, deciding a cancel from
  the body's return, and using the take record as caller context.
- **Maintainer questions it raised:**
  - `MC-107` 1: a stopped `/multisend` does not put its text back;
  - `MC-107` 2: confirms the `|||` rule for triggers.

**Gate 1, round 4 (rev 4; ledger row 324; a fresh reviewer): [REJECT].**
- **Held:** D1's single unit (no await between the check and the take, traced); D2 (no caller
  relies on `true` after an abort, and the only aborting test expects `false`); D5's single flag
  read; D6; no missing starter; the split.
- **S1 (MAJOR).** D4's "a member can speak" predicate did not match the turn's own skips (gone,
  ambiguous, a failed pin) or cold restores. Reproduced with the real `sendChat`: a deleted or
  duplicated member makes every tick quiet, so auto mode retries forever. → the advisor's stated
  fallback (row 323, "the predicate needs it or the count stays"): a count of 50 ticks in which no
  member's turn ran, reported by the group loop (D4, I6, scenario 10).
- **S2.** The timer probe is nondeterministic around `MessageChannel` yields (measured). → a
  `MessageChannel` probe.
- **S3.** `MC-107` 1 keyed on "a unit in progress" missed a pipe after `/multisend`. → a push count
  compared across the `/` stage; also covers a throw and a failing later command (D6, I8).
- **S4.** An already-aborted signal is never passed on by a listener. → D1, I8, scenario 6.
- **S5.** Scenario 14's gap case cannot reach its precondition at the snapshot. → labelled as an
  acceptance test.
- **Editorial E1-E5, applied;** O1-O3 taken.

**Gate 1, round 5 (rev 5; ledger row 325; the round-4 reviewer): [REJECT].** The design held (D1-D7,
and the count in D4); four corrections.
- **F1 (MAJOR, spec).** "A tick in which the group turn ran no member's turn" made every character
  chat tick quiet. → a quiet tick defined positively (no turn reached generation setup); a tick
  outside a group is never quiet; the skip list kept as examples (D4, I6, scenario 10).
- **F2.** "An already-aborted signal makes no request" was false for HEAD's body. → such a call
  returns `false` before its body and runs nothing (D1, I8); scenario 6 is now a reproducer.
- **F3.** `MC-107` 1's scenarios could not reach their precondition, and covered one ending of
  three. → `/multisend a|/trigger x`; scenario 17 adds the failing command and the throw.
- **F4.** Scenario 10's cold bullet passes at HEAD, and the composer suite cannot test what the
  group loop reports. → split between the real `sendChat` harness and the composer suite, with
  guards labelled.
- **Editorial E1-E4, applied:** the empty-order throw kept and described; round 4's evidence
  stated precisely; the 50-tick figure stated per window, with the mean; section 10.
- **Optional taken:** `abortChat` compares against the count recorded at the stage's start (O1);
  the pipe case before a `/multisend` disclosed (O2).
- **Not re-escalated.** Rounds 4 and 5 rejected definitions and scenarios within the advisor's
  direction and its named fallback; neither reopened the design.

**Gate 1, round 6 (rev 6; ledger row 326; the round-4 reviewer): [REJECT].** Every round-5 fix
verified. The reviewer corrected its own round 5: F1 should have been MINOR, since auto mode is
offered only in groups.
- **G1 (MINOR, behavioural).** A loop that stops on a throw could swallow an error HEAD alerts. →
  D5: rethrow after the stop; `sendPofile` makes no further download on a throw; scenario 17 asserts the
  alert and adds Autopilot and `sendPofile`.
- **Editorial H1-H3, applied:** scenario 10's report test labelled an acceptance test; D1 cites
  `MC-099` 4; the already-aborted check sits before `enterSendChat`.
- **Optional P1-P2, taken:** scenario 6 split between the real harness and a composer guard; the
  rule stated for outermost calls only.

**Gate 1, round 7 (rev 7; ledger row 327; the round-4 reviewer): [EDITORIAL].** G1's fix verified
on every path (Autopilot's click handler; `postChatFile` and its callers have no catch, so the
rethrow reaches the `unhandledrejection` alert; the composer's `/multisend` keeps the push-count
rule and still alerts). H1-H3 and P1-P2 verified.
- **J1, J2, applied in rev 7.1:** D5's older `sendPofile` sub-bullet qualified to a stop that is
  not a throw; scenario 17's guard asserts the rejection, which the app then alerts.
- **Q1, taken:** D1 says a marked recursion can still run its start trigger and memory after an
  abort, as at HEAD.
- **Closed by the Orchestrator:** the diff of rev 7.1 holds only these three wording changes and
  this record. **Gate 1 passed.**

**Implementation amendment (rev 7.2, the Orchestrator).** D4 and I6 said auto mode yields *before*
each tick. Implemented literally, a toggle in the same click as the start ran no tick, and two
existing composer tests, which expect the started tick to run, failed. The invariant the yield
exists for is that auto mode never runs two ticks without handing control back to the event loop,
and that a stop landing in a yield runs no further tick; a yield *between* ticks keeps both, and the
first tick runs straight from the click, as at HEAD. D4 and I6 now say "between ticks". Gate 2
reviews it.

**Gate 2, round 1 (ledger row 330; `opus-reviewer`, fresh): [REJECT].**
- **F1.** The take's `/multisend` push count was never frozen at the end of its `/` stage, so an
  input trigger's `/multisend` later in the same take made a cancelled or throwing message that
  starts with `/` go unreturned. → the count taken at the stage's end, in a `finally`, and compared
  after it; the live count while the stage runs.
- **F2.** A chat switch in auto mode's yield ran one more full tick. → the chat on screen checked at
  the loop's top, beside the flag, in the same synchronous stretch as the tick.
- **E1-E3,** comments, corrected. **O1-O3** taken (a test-file header; pins for the per-tick flag
  read and the yield between every two ticks; the save marks settled in a nested `finally`). O4
  left (the composer guard still catches a composer that writes the flag). O5 noted in row 330.
- Reproducers for F1 and F2 were written first and failed on the named behaviour.

**Gate 2, round 2 (ledger row 331; the round-1 reviewer): [APPROVE].** Every finding verified;
load-time mutants show the new reproducers fail against round 1's exact lines, and the live and
frozen comparisons are each pinned. Nothing new. **Gate 2 passed.** Checks on the final snapshot
(the Orchestrator): `pnpm test` 155 files, 1974 passed, 4 skipped; `pnpm check` clean; `pnpm build`
passes.

**Live check (ledger row 332): passed.** Production build, Node server, Echo (6 s, non-streaming),
Claude in Chrome with the window hidden, so every step ran through page scripts.
- **The preview hotkey at Home mid-send:** no Loading notice, and the flag stayed held (a
  character switch was refused mid-send and accepted after); the reply landed in its chat. A
  positive control with a character selected and idle showed the notice, so the dispatched key
  reaches the handler.
- **`/multisend a|||b|||c`:** three user messages, each with its reply; no command text posted.
- **The busy button during `/multisend x|||y|||z`:** `x` posted with no reply; `y` and `z` never
  posted; the text box stayed empty (`MC-107` 1); a following send worked.
- **Auto mode clicked during a group send:** nothing started, and nothing generated after the
  send.
- **The busy button during an auto-mode tick:** the tick was aborted, auto mode turned off, and no
  further tick ran in the next 18 s; a following send worked.
- **Console:** one exception, from the positive control: the hotkey's `JSON.parse` of Echo's plain
  text. That is W2b-previews' "no throw on a body that is not JSON"; the flag was released after it.
- **Cleanup:** the server stopped by PID and the port confirmed closed; `save/` restored and
  verified by SHA-256 (6 files, 0 mismatches); the two backups the app created moved to the
  scratchpad. The Chrome tab is left for the maintainer to close.

**Commit-message check (ledger row 333; the Gate 2 reviewer): [EDITORIAL], applied.** Counts
verified (15 clears, 40 reproducers and 19 guards, three Gate 2 reproducers, 50 ticks). Corrected:
the send did clear the flag on some exits; auto mode cleared a stuck flag rather than being
refused by it (section 1 carried the same slip, fixed here); the DevTool handlers moved *and*
changed in this commit; a loop's throw propagates rather than being rethrown; the trigger `|||`
case stated; `MC-107` 1 cited for the busy button only; the hotkey now always refused at Home.
