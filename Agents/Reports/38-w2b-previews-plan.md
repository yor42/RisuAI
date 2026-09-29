# Report 38 — W2b-previews: the prompt preview's notice, Cancel, fresh output and group preview

**STATUS:** plan rev 5.1, 2026-09-29. **Gate 1 passed; Gate 2 passed; live check passed** (one
defect found and fixed test-first). Gate 1: rounds 1-3 [REJECT], then a `senior-advisor`
escalation; round 4 (a fresh reviewer) [REJECT] on four bounded plan defects; round 5
[EDITORIAL], applied in rev 5.1. Committed as `8f93d095`, records `5e4a2bfd`. Section 9 is the gate
record.

W2b-previews is the last part of W2b. W2b-core (`ac8cb3da`, Report 36) made an outermost `sendChat`
a unit that owns the busy flag and one abort controller. This stage fixes the two prompt previews
that ride on it: the preview hotkey (`previewRequest` in `src/ts/hotkey.ts`) and DevTool's Preview
(`runPreviewPrompt` in `src/ts/process/devToolActions.ts`).

**Decisions this plan implements:**
- `MC-105` 3: a prompt preview in a group chat previews the request of the first member whose turn
  it would be, and generates nothing.
- `MC-106` 3: the preview's "Loading..." notice has a Cancel button (the existing "Cancel" string).
- `MC-108`, which amends `MC-106` 3:
  1. Cancel closes the notice at once and discards the result. The send stops at its next stage
     boundary. This holds for the busy button on a normal send too.
  2. Escape on a preview's notice does what Cancel does.
  3. A group preview names its member, and says so when nobody would speak.
  4. The displayed preview masks API keys.
  5. A successful preview that finishes while another alert is up waits until that alert is
     closed. Starting another preview drops the pending one.
- `MC-105` 2: the busy button cancels any generation, previews included. W2b-core delivered this.
- `MC-011` and `MC-089`: the fork has never shipped, so its own behaviour is not worth preserving;
  upstream data compatibility is.
- Report 36's Gate 1 round 2 finding N2: closing the notice must never clear the error alert that
  explains a failed preview.

Evidence: ledger row 334, scratchpad packet `w2bp/packet.md`. Line numbers below are at `6940a7b3`.

## 1. What is wrong (evidence)

The sites below were traced by the investigator. The Orchestrator re-read the ones marked (O).

1. **Both callers ignore `sendChat`'s result.** They read the module exports `previewBody` and
   `previewFormated` whatever happened (`hotkey.ts:154-162`, `devToolActions.ts:22-42`). Those
   exports start as `''` and `[]` (`index.svelte.ts:96-97`, (O)), and only a successful preview
   assigns them (`:1891`, `:1921`, (O)).
   - A first preview that fails runs `JSON.parse('')` and throws. The rejection reaches the
     `unhandledrejection` handler (`bootstrap.ts:345-352`), which replaces the notice with an opaque
     SyntaxError alert instead of a preview.
   - A later failed preview shows the previous body, over the error alert that explained the
     failure.
   - An abort that lands after `requestChatData`'s last abort check, for example during a plugin's
     `replacerafterRequest` (`request.ts:285-289`), lets `previewBody` be assigned (`:1920-1922` runs
     before the abort check at `:1929`, (O)). The wrapper then returns false. A caller that ignores
     the result would show that body. An abort during the request itself assigns nothing
     (`request.ts:274-279` returns `'Aborted'`).
2. **Echo returns plain text.** It is the only provider with no `previewBody` branch
   (`request.ts:950-962`, (O)). `JSON.parse` throws on its body; the W2b-core live check hit
   exactly this. The other providers return JSON, sometimes `{error: "..."}` (NovelAI, plugin
   providers, Horde, WebLLM, OpenAI legacy instruct).
3. **The wait notice has no exit.**
   - Its `'wait'` alert renders a full-screen overlay with no button (`AlertComp.svelte:188-189`,
     `:237-241`).
   - Escape acts only while `doingAlert()` is true, which excludes `'wait'` (`hotkey.ts:259-262`,
     `alert.ts:199-201`, (O)).
   - The overlay covers the busy button.
   - While a text field has focus, the hotkey listener returns early for any key without a
     modifier (`hotkey.ts:16-24`, (O)). Escape has none, and Ctrl+U is usually pressed from the
     composer's text box.
   - A start trigger's `normal` or `error` alert effect (`triggers.ts:1548-1555`, (O)), and Lua's
     alerts (`scriptings.ts:257-267`), replace the notice while the preview runs.
4. **Alerts have no identity.** Each `alertX()` call `set`s a fresh object, and the only readers
   compare types. `get(alertStore)` returns the very object last set, so "my notice is still
   showing" is a reference comparison (executed in the scratchpad). `alertWait` returns nothing
   today (`alert.ts:210-216`, (O)).
5. **The group parent drops the preview flags.**
   - It calls each member with `{chatAdditonalTokens, signal, origin, originHint}` only
     (`index.svelte.ts:635-640`, (O)).
   - So a group preview runs real member sends and appends real replies.
   - It then returns true with the exports untouched, and the caller shows a stale preview.
6. **A group send with no eligible member throws.**
   - Without "order by order", `groupOrder([], …)` returns `[undefined]`: its fallback pushes
     `chars[0]` of an empty array (`group.ts:85-87`, (O); executed).
   - The caller's filter then reads `v.id` (`index.svelte.ts:626-631`, (O)).
   - This is reached when no member is both active and above zero talkativeness, and it affects
     real sends. With "order by order" the loop runs zero times and the send returns true.
7. **An abort reaches only the request.** In a preview, the unit's signal is read by
   `requestChatData` (`request.ts:232`, `:274`), the check at `index.svelte.ts:1929` and the
   wrapper's return (`:274`).
   - It never reaches the start trigger (`:1211`, (O)).
   - Nor memory summarisation (`:1397` onward, which can make real LLM requests), the cold-member
     restore, or Lua and plugin hooks.
   - DevTool's formatted `preview` returns at `:1890-1893` (O) before any check.
   - After a Cancel today, the send would run to its end with the busy flag held.
8. **The preview displays keys.**
   - It pretty-prints the whole `{url, body, headers}`, so `Authorization`, `x-api-key` and
     Google's `?key=` are shown.
9. **The two callers duplicate their prompt rendering line for line** (`hotkey.ts:159-162`,
   `devToolActions.ts:35-39`).

Not plugin-facing: neither the exports nor the `preview` and `previewPrompt` options are exposed to
plugins. The v3 `sendChat(message)` takes a message only. No stored data or file format is touched.

## 2. Design

Mechanisms marked *non-normative* are suggestions; the invariants in section 4 are what binds.

**D1. One preview runner.** Both callers go through a single function. That function:
- refuses while busy (unchanged);
- refuses, without a notice, while an alert other than `none` or a toast is up. Ctrl+U has a
  modifier, so
  it reaches the hotkey listener while any alert shows; without this refusal the preview's notice
  would cover a pending confirm or the module picker, and that alert's waiter would then capture
  the `none` that ends the preview instead of the user's answer. A consequence: Ctrl+U does not
  re-preview while an earlier preview's result is open (it is an alert); the user closes it first;
- consumes the key on every refusal of the hotkey (busy, Home, another alert), as the success path
  does (`preventDefault` and `stopPropagation`). Today a refusal returns before the key is
  consumed, so the browser's own Ctrl+U (view-source) runs;
- shows the notice;
- runs the preview with its own abort signal;
- decides what to show;
- closes its notice.

The hotkey keeps its own refusal at Home (unchanged). DevTool relies on `sendChat` refusing at Home,
which now shows nothing (D3).

*Non-normative:* extend `runPreviewPrompt` in `devToolActions.ts` and have the hotkey call it with
the `'prompt'` join.

**D2. A cancellable notice that knows it is its own.**
- The preview's wait notice carries a Cancel button (`language.cancel`, which exists in all seven
  languages).
- Pressing Cancel, or Escape while that notice is showing:
  - aborts the preview's own signal (passed as `arg.signal`, which the wrapper relays to the unit);
  - closes the notice at once;
  - marks the run as cancelled, so it shows nothing when it ends.
- Escape cancels whatever has focus, a text field included. It is handled before the listener's
  early return for focused text fields, and it is consumed (`preventDefault` and
  `stopPropagation`): an open settings panel stays open, and Escape listeners on `window` (the
  trigger editor, the bookmark list, the Iris modal) do not also fire. Handlers on the focused
  element still run first, as they do today.
- Other wait notices are unchanged: no button, and Escape does nothing.
- *Non-normative:* `alertWait` returns the object it set, and `alertData` gains an optional cancel
  callback that `AlertComp`'s wait branch renders as a button. At the top of `hotkey.ts`'s
  listener, before the focus check, Escape calls the callback when the store holds a wait alert
  that has one.

**D3. Fresh output only.**
- A run displays only output that this call produced.
- It displays nothing when `sendChat` returns false, throws, or was cancelled.
- It keys on the result, not on module state that an earlier call left.
- *Non-normative:* a per-call result object passed in `SendChatArg` (for example
  `previewResult: { body?, formated?, memberName?, noSpeaker? }`). The body writes into it instead
  of the module exports, the group parent forwards it (D5), and the exports are removed. The two
  callers are their only readers.

**D4. Ending, by case.** "Ours" below means the store still holds this run's notice, by reference.
The cases are checked in this order, and the return value comes first: a result that was written
by a call that returned false is never shown.

| How the run ended | What happens |
|---|---|
| Cancelled | Nothing more; the notice was closed at the press. |
| Returned false (with or without a result written) | Close the notice if it is still ours; show nothing else. Where the failure showed an error alert, the notice is no longer ours, so that alert stays (N2). With `inlayErrorResponse` on, the failure is a chat message, not an alert; the notice is still ours and closes. |
| Threw | Close the notice if it is still ours. Let the error propagate, so the global `unhandledrejection` handler in `bootstrap.ts` shows it as before. |
| Returned true with a result (or D5's "no speaker") | If the store holds ours, `none` or a toast, show it now. Otherwise another alert is up (a trigger, Lua or plugin alert, an error from elsewhere, another operation's wait): leave it in place, and show the result at the store's next transition to `none` (`MC-108` 5). |

**Showing a pending result.** The pending result subscribes to the alert store and is shown from
the subscriber, at the first `none` value it receives. No timer is involved. This is safe because
every blocking alert captures its answer from the `none` value that ended it (D9), and Svelte
delivers that value to every subscriber before it delivers a write made from inside a subscriber
(svelte 5.56.8, `store/shared/index.js`, `subscriber_queue`; executed in the scratchpad,
`w2bp/queue.mjs`, in both subscription orders).
- A pending result is dropped when a newer preview run starts, meaning one that passes the busy
  check. A refused attempt does not drop it.
- It is dropped at the first change of the selected character or of its selected chat after the
  run ends, observed as a change, not compared at show time. So switching away and back (A to B to
  A) still drops it. A switch away and back inside one synchronous tick coalesces into no change;
  the hotkeys switch in separate events, so they are not affected. A switch during the run itself
  (the `home` hotkey has no busy guard, `hotkey.ts:82-85`) is not watched: the result then shows
  where the user now is, which is harmless. The `prevChar`, `nextChar` and `home` hotkeys
  (`hotkey.ts:82-136`) switch characters while any alert is up, which is how a switch can happen
  while a result is pending.
- Nothing else waits on it: the unit has settled, the busy flag is released, and the pending wait
  blocks no starter. Its subscription is removed when it shows or is dropped.
- A toast is safe to replace: replacing it unmounts its element, so its `onanimationend` cannot
  later write `none` over the result.
- *Non-normative:* the selected chat is not a store (it is `chatPage` on the character in
  `DBState`, with many writers), so a store subscription cannot see a chat switch. An
  `$effect.root` in a `.svelte.ts` module can track both the selected character's `chaId` and its
  current chat's id; it is disposed when the result shows or is dropped. A module-level run counter
  is compared inside the store subscriber. The subscriber is
  declared with `let` and a `settled` flag, as `alertStaleAccountNotice` does, so a store that is
  already `none` at subscription is handled without a temporal-dead-zone error.

**D5. The group preview.** This applies only to a preview run in a group chat.
- The parent builds the member order exactly as a real send does: the same eligibility, the same
  `groupOrder` draw, the same last-speaker exclusion.
- It walks that order, calling each member with the preview flags and the result object forwarded:
  - A member call that returns false ends the run as false.
  - A member call that returns true without writing a result is skipped, and the walk goes on. A
    real send passes over such members too: gone, duplicated, not in the group, or a failed pin.
  - The first member call that writes a result ends the walk. The result records that member's
    name.
- If the walk ends with no result, the result says "no speaker". The runner shows a short message,
  a new string translated into the seven languages.
- Nothing generates: no reply is appended, and no request is sent without `previewBody`.
- The member it previews goes through the same checks as a real turn, including a cold restore,
  which is a write that a real send also makes.
- Without "order by order", the order is one random draw, so the previewed member is one plausible
  speaker. The heading names them.
- *Non-normative:* a heading `### Prompt — <member name>`. The name is card data, so it is escaped
  for Markdown and HTML before it goes into the heading (ParseMarkdown's DOMPurify config allows
  `iframe`).

**D6. Stage-boundary aborts (`MC-108` 1), for every send, not only previews.**
- The send body returns false, with no alert, when its signal is aborted:
  - before the start trigger runs;
  - after it returns, beside the existing `stopSending` exit but outside `if(triggerResult)`, so it
    also runs when the trigger returns nothing;
  - before memory summarisation;
  - after memory summarisation, before the request is built and sent;
  - in a group send, before each member call.
- DevTool's formatted `preview` checks too before it writes its result.
- Each new exit sits where an existing early return already leaves the chat, so no stage is left
  half-done.
- Passing the signal into the trigger, memory summarisation or cold restore stays W2d's.

**D7. An empty order is empty.** `groupOrder` returns an empty list for an empty input. A real
group send in which nobody is eligible then posts nothing and returns true, as with "order by
order". A group preview reports "no speaker". This is a `MC-091` scope amendment: the group preview
reaches the same code, and leaving it would make the preview throw on a group whose members are all
inactive.

**D8. Rendering.** One renderer for both callers.
- A body that parses as JSON is pretty-printed as today, with keys masked.
- A body that does not parse is shown as text in a plain code fence.
- An empty body shows an explicit marker.
- The ```` ``` ```` escape is kept.

- A body that parses to something other than an object (`null`, a number, a string, an array) is
  pretty-printed with no masking step, and does not throw.

Masking applies to the display only; the request is unchanged:
- **Headers.** Header names are matched without regard to case. A header is masked when its name
  is `authorization`, `proxy-authorization` or `cookie`, or contains `key`, `token`, `secret`,
  `signature` or `auth`. An `Authorization` value keeps its scheme word.
- **The URL.** In a top-level `url`, query parameters whose names contain `key`, `token`, `secret`
  or `signature` are masked. A `url` that does not parse as a URL (Ollama with an empty address
  gives `/api/chat`) is masked by a pattern over its query string, and never throws.
- **A masked value still shows what is wrong with it.** An empty value, and the literal
  `undefined` or `null` (as in `Bearer undefined`), are shown as they are. Any other value becomes
  a mask with its length, for example `Bearer •••• (51 chars)`.
- **The body is not scanned.** No built-in provider's preview body carries a key (Gate 1 round 1).
  Only a user's own additional parameters can put one there (`shared.ts:79-118`), and they are
  shown as they are.

**D9. A blocking alert's answer is the `none` value that ended it.** This is an `MC-091`
shared-cause amendment to `src/ts/alert.ts`.
- **The failure if left:** every blocking alert polls until the store's type is `none`, then reads
  `get(alertStore).msg` (`alert.ts:77-84`, `:291-305`; readers at `:108`, `:118`, `:181`, `:234`,
  `:246`, `:258`, `:271`, `:288`, `:305`). When another alert is set between the user's answer and
  the next poll (a toast, a plugin or Lua alert, a save error, or a pending preview result), the
  poll sees a type other than `none` and keeps waiting. The waiter stays blocked until that other
  alert closes, then returns that alert's closing `msg` instead of the user's answer:
  - `alertConfirm` answered "no", then a `normal` alert closed with Enter (which writes
    `{none, 'yes'}`, `hotkey.ts:268-275`), returns true;
  - `alertSelect` and `alertModuleSelect` return the closing `msg`, usually `''`, so the module
    picker applies no module, silently.

  Executed against the real Svelte store with `alert.ts`'s poll replicated (scratchpad
  `w2bp/gate1r4/poll.mjs`; re-run by the Orchestrator).
- **The causal link:** `MC-108` 5 makes the preview such a writer by design, so the preview cannot
  meet its invariant (P4b) without it. Rounds 2 and 3 patched the write side with delays, and each
  delay left a window.
- **The correction:** one internal helper in `alert.ts` subscribes, and resolves with the `msg` of
  the first `none` value from the subscriber's argument, never from a later `get()`. It unsubscribes
  when it settles, handling the synchronous first call as `alertStaleAccountNotice` already does
  (`alert.ts:138-170`). `waitAlert` and `alertModuleSelect` wrap it, and the blocking functions
  return what it captured.
  - A store that is already `none` at the call still resolves at once, as the poll did.
  - The four external `waitAlert()` callers (`bootstrap.ts:288`, `:437`, `:458`;
    `nodeStorage.ts:291`) only await it, so a captured return value is additive.
  - `AlertComp`'s writes are untouched.
  - For plugins, v3's blocking `alertConfirm` (`v3.svelte.ts:1276-1278`) now returns the user's
    answer in the race window; nothing else visible to plugins changes. v3 `alertNormal` and
    `alertError` are fire-and-forget, and a plugin's `alertStore.set` is a no-op
    (`plugins.svelte.ts:680`).
  - The helper uses `let` and a `settled` flag, as `alertStaleAccountNotice` does.

## 3. Scope

**In:** D1-D9.
- The previews' notice and its Cancel and Escape.
- Fresh output and the body formats.
- The group preview.
- Stage-boundary aborts.
- The empty group order.
- Key masking.
- Blocking alerts capturing their answer (D9).

**Out:**
- **W2d.** Passing the abort into memory summarisation, triggers, cold restore, Lua and plugin
  hooks, and Echo's delay (`request.ts:955`, which ignores the signal). After a Cancel, the busy
  flag stays held until the current stage ends. That is disclosed, not fixed here.
- **Upstream behaviour kept.** What a preview writes before its return: preset chain, statics,
  `lastInteraction`, chat ids, `{{setvar}}` through the re-parse, the start trigger, memory data,
  save marks.
- **Other wait notices** (cold storage maintenance, updates and the rest).
- **Escape inside a plugin iframe.** It never reaches the document listener, so it does not cancel
  a preview. Disclosed.
- **A pending result can still be lost, visibly harmless.** A multi-step flow that writes `none`
  and then its next alert shows the result for an instant, then replaces it. A pending terms or
  stale-account prompt re-posts itself over a result shown at an unrelated `none`. Disclosed.

## 4. Invariants

- **P1. Own notice.** The runner closes or replaces only its own notice. It never clears or covers
  an alert that something else set, error alerts included. It does not start while such an alert is
  up (D1).
- **P2. Fresh output.** What a run displays came from that call. A run that is refused, fails, is
  cancelled or throws displays no preview.
- **P3. No format throw.** No body makes the runner throw: JSON objects, `{error}`, JSON that is not
  an object (`null`, scalars, arrays), plain text, empty, or a `url` that does not parse.
- **P4. Cancel.** Cancel or Escape closes the notice before the handler returns and aborts the
  unit, whatever has focus. Nothing is displayed for that run afterwards. The busy flag is released
  when the unit settles, and the unit stops at its next stage boundary (D6).
- **P4b. A pending result.** A successful result that meets another alert is shown after that
  alert closes, never over it. A newer preview run, or a change of the selected character or chat,
  drops it. It holds no flag while it waits.
- **P8. Answers.** A blocking alert returns the answer the user gave, whatever the store holds
  afterwards.
- **P5. A preview generates nothing.** In a character or a group chat, no reply is appended, and
  every model request the send itself makes carries `previewBody`. Two exceptions are upstream's:
  memory summarisation's own requests, and, with `inlayErrorResponse` on, a failed preview's error
  appended to the chat (`throwError`, `index.svelte.ts:458-483`).
- **P6. Real sends.** Only two things change for a real send:
  - the D6 exits, reached only after an abort (the wrapper already reports an aborted unit as not
    completed, so no outermost caller sees a different return);
  - D7's empty group order, which was a throw.

  A real group send's order, member checks and replies are otherwise unchanged.
- **P7. Masking is display-only.** The request that would be sent is byte-identical.

## 5. Acceptance scenarios

Label key:
- **R**: a regression reproducer. It fails on the step-1 seam snapshot (section 6), on the
  behaviour it names; a missing export or field does not count.
- **G**: a guard. It passes before and after.
- **A**: an acceptance test for something new.

1. **R.** The first preview returns false (for example at Home in DevTool, or a failed request).
   The runner does not throw, the notice closes, and no preview is shown.
2. **R.** Echo's plain text: the preview shows that text in a plain fence, with no throw. **A:** an
   empty body shows the marker; JSON `null`, a number and an array render without a throw. A **G**
   checks that JSON object bodies render as before, apart from the masking.
3. **R.** A successful preview, then a failed one: the second shows nothing, not the first body.
4. **R.** A failed preview whose failure shows an error alert, after an earlier successful
   preview: that error alert is still showing afterwards (N2), not the earlier body. With `inlayErrorResponse` on, the notice closes and no alert is shown.
5. **R.** A call that returns false after writing its result (an abort after the request's last
   abort check) shows nothing.
6. **A.** Cancel and Escape:
   - the button is rendered on the preview's notice (a component mount) and on no other wait
     notice;
   - clicking it closes the notice at once and aborts the preview's signal;
   - when the run ends, nothing is shown;
   - Escape does the same while that notice is showing, including with `activeElement` set to the
     composer's textarea, and it leaves an open settings panel open;
   - with another wait notice up, Escape does nothing;
   - identity, return to origin: a foreign alert replaces the notice, and then a different wait
     notice is set. The run ends and leaves that notice in place.
7. **R and A, pending result (`MC-108` 5).**
   - **R:** a start trigger shows `alertNormal` during a successful preview. The trigger's alert is
     still showing when the run ends; the result appears only after it is closed. (Before the fix,
     the result replaces the trigger's alert.)
   - **A:** a toast, or `none`, at the end is replaced by the result at once.
   - **A:** a blocking alert (`alertConfirm`, and the module picker's `alertModuleSelect`) is
     answered while a result is pending. It returns the user's answer, and the result shows after.
   - **A:** a newer preview run started while a result is pending drops it; a refused attempt does
     not. Setup: the other alert must first be replaced by a toast, or D1 refuses the newer run.
     For example, Escape on a blocking alert shows the "Alert Closed" toast (`hotkey.ts:259-261`),
     and a preview started during that toast runs.
   - **A:** every hotkey refusal consumes Ctrl+U (`preventDefault` is called).
   - **A:** switching the selected character, or its chat, while a result is pending drops it,
     including a switch away and back (A to B to A) before the other alert closes.
   - **R:** a blocking alert (a v3 plugin `alertConfirm`, or the module picker) is up and Ctrl+U is
     pressed. No preview starts, and the alert still returns the user's answer. (Before the fix,
     the preview's notice covers it, and it returns the `none` that ends the preview.)
7b. **R, D9.** Independent of previews, in a new `alert.ts` test:
   - `alertConfirm` answered with `{type:'none', msg:'no'}`, then `alertNormal` in the same tick,
     then that alert closed with `{type:'none', msg:'yes'}` (as Enter does). It returns false. (At
     `6940a7b3` it returns true.)
   - `alertSelect` and `alertModuleSelect` answered with a value, then an alert in the same tick,
     then that alert closed with `''`. Each returns the answer. (At `6940a7b3`, `''`.)
   - **A:** answered, then a toast in the same tick: it resolves with the answer at once. (At
     `6940a7b3` it stays blocked until the toast ends, so this is not a reproducer.)
   - **G:** a store already `none` at the call resolves at once; the external `waitAlert()`
     callers still resume.
8. **R.** A throw from `sendChat` closes the runner's own notice, and the rejection still reaches
   the caller's promise.
9. **R, D6.** For both a preview and a real send (the real `sendChat` harness), each case returns
   false with no alert:
   - an abort before the start trigger means the trigger does not run;
   - an abort during the start trigger means memory summarisation does not run, including when the
     trigger returns nothing;
   - an abort during memory summarisation means `requestChatData` is not called;
   - in a group send, an abort while a member's call is about to return true means no later member
     call starts (no cold restore, no request). Pin the abort where the member still returns true:
     during its output trigger on the non-streaming path, which has no later abort check, or during
     a member skipped by its checks. An abort before a member's request already stops the walk at
     `6940a7b3`, so that placement would be a guard.
   - DevTool's formatted preview never calls `requestChatData`, so the third bullet is a **G** for
     it.
10. **R, D5.** Group preview (the `sendChatGroupOrigin` harness):
    - no reply is appended, and every model request carries `previewBody`;
    - the result is the first member in the drawn order that reaches its request (use "order by
      order", or a name mention, for determinism), and it names that member;
    - a gone or duplicated member ahead of it is skipped;
    - a member call returning false ends the run as false;
    - a member name with Markdown or HTML in it is shown as text.
11. **No speaker (D5 and D7).**
    - **R:** no "order by order", with nobody active. At the snapshot, the preview throws. This runs
      with the real `group.ts` (`vi.importActual`); the harness's pass-through `groupOrder` mock
      cannot reach the throw.
    - **A:** "order by order" with nobody active; the only eligible member is the last speaker;
      every member in the order is skipped by its checks.

    Each preview shows the no-speaker message, and nothing is generated.
12. **R, D7.** A real group send with nobody eligible and no "order by order" does not throw. It
    returns true, and nothing is generated. This runs with the real `group.ts`, or as a direct test
    of `groupOrder` and the caller's filter.
13. **A, D8.** Masking:
    - the headers named in D8 are masked, whatever their case (Bedrock's are lower-case);
    - the `Authorization` scheme word is kept;
    - URL key parameters are masked, including in a `url` that does not parse;
    - an empty value, `undefined` and `null` are shown as they are, and other values show their
      length;
    - the request passed to the provider is unchanged (P7).
14b. **G, at the seam.** DevTool's formatted joins render the same Markdown before and after:
    given a known `formated`, the `'yes'` merge, `'no'`, and the `instruct` mode.
14. **G.** W2b-core's preview tests still hold, updated only for the new runner's shape:
    - refused while busy or while the composer's window is open;
    - the hotkey refused at Home;
    - no flag clears.

## 6. Order of work

1. **Seams, with no behaviour change** (`sonnet-coder`).
   - Extract the runner and the renderer so the hotkey and DevTool share them.
   - Add the `alertWait` handle and the optional cancel field; no button is rendered yet.
   - Add the per-call result (D3) to `SendChatArg`, with all its fields (`body`, `formated`,
     `memberName`, `noSpeaker`). The body writes `body` and `formated` beside the module exports.
     The runner still reads the exports as today, and the group parent does not forward anything
     yet.
   - The suite stays green, and the red tests can compile against the new shape.
2. **Red tests** (`test-warrior`), against the seam snapshot. The reproducers fail on the behaviour
   they name, and the guards pass. The run is recorded.
3. **The fix** (`sonnet-coder`): D2-D9. The new UI string goes in `en.ts` from the coder; the other
   six languages come from `translator`, and `src/lang/ko.ts`'s uncommitted maintainer edits are
   kept.
4. **Post-fix acceptance tests** (`test-warrior`).
5. **Gate 2**, then a live check. The live check covers:
   - the Echo hotkey preview;
   - Cancel, and Escape from the composer's text box;
   - the busy button under the notice;
   - a start trigger's alert during a preview;
   - two trigger `input` alerts answered in a row: the second field does not keep the first one's
     text (D9 removes the 10 ms gap in which the alert component used to unmount);
   - a group preview;
   - masked keys, on a fake key in a scratch profile only.

## 7. Files (expected)

- `src/ts/hotkey.ts`: the hotkey calls the runner, and Escape handles a cancellable notice.
- `src/ts/process/devToolActions.ts`: the runner and the renderer.
- `src/ts/alert.ts`: the cancellable wait, and D9's answer capture.
- `src/lib/Others/AlertComp.svelte`: the Cancel button.
- `src/ts/process/index.svelte.ts`: the per-call result, the group preview walk, and the D6 exits.
- `src/ts/process/group.ts`: D7.
- `src/lang/*.ts`: one new string.
- Tests: `previewOwnership.svelte.test.ts`, whose alert mock must list any new alert export, plus
  new suites alongside it.

## 8. Questions for Gate 1 round 5 (answered; section 9)

1. Are round 4's findings closed: D9's failure description and scenario 7b; D1's refusal while
   another alert is up; D4's event-based drop and its return-to-origin case; the formatted-join
   guard?
2. Does D1's new refusal remove a workflow anyone relies on?

## 9. Gate record

**Gate 1, round 1 (rev 1; ledger row 335; `opus-reviewer`): [REJECT].** The design held on D5,
D6, D7 and compatibility; source citations verified.
- **F1 (MAJOR).** D4 dropped a successful preview whenever another alert was up at the end. A start
  trigger's `normal` or `error` alert (`triggers.ts:1548-1555`) or a Lua alert does that, so a card
  whose start trigger always shows an alert could never be previewed. The replaceable set was also
  a product choice `MC-108` had not made. → The maintainer chose "show it after the other alert is
  closed" (`MC-108` 5); D4, P4b, scenario 7.
- **F2 (MAJOR).** Escape could not cancel while a text field had focus, which is the normal case:
  the listener returns early for keys with no modifier (`hotkey.ts:16-24`). → D2, P4, scenario 6.
- **F3 (MINOR).** Scenarios 11(b) and 12 could not fail in the named harness, which mocks
  `groupOrder` as a pass-through. → the real `group.ts`, or a direct test.
- **F4 (MINOR).** Scenario 9's third case was a guard with the real request layer, and could not
  fail with the mocked one, because D6 had no exit after summarisation. → D6 adds that exit, which
  `MC-108` 1 names ("before the request").
- **F5 (MINOR).** R scenarios asserting the new result fields would fail only on a missing field,
  and three no-speaker cases were new behaviour. → the per-call result goes into the step-1 seam;
  those cases are relabelled A.
- **F6 (MINOR).** P3 missed JSON `null` and an unparsable `url`; header matching had to ignore
  case. → D8, P3, scenarios 2 and 13.
- **F7-F9 (EDITORIAL), applied.**
  - A first failed preview's throw reaches the `unhandledrejection` handler, which shows an opaque
    error alert; the notice is not left up.
  - An aborted `previewPrompt` assigns its body only when the abort lands after the request's
    last check.
  - D4 checks the return value before the result.
- **Optional, taken:**
  - a stage check before each group member call;
  - masks that show their length and leave empty or `undefined` values visible, plus the `auth`
    pattern;
  - Escape consumed with settings left open;
  - the member name escaped.

  **Not taken:** a toast when a group send has nobody eligible. It stays silent, as "order by
  order" already is.

**Gate 1, round 2 (rev 2; ledger row 336; the round-1 reviewer): [REJECT].** All nine round-1
findings verified closed. D6's two new boundaries are safe: no chat or database write happens
between summarisation and the request, and the member-loop exit matches the existing
`if(!r) return false`.
- **N1 (MINOR, logic).** The pending result's delay was tied to `waitAlert`'s 10 ms poll, but
  `alertModuleSelect` polls every 20 ms. A preview result shown 11 ms after the module picker
  closed would make the picker read the result's close message and silently apply no module. → D4:
  a timer of at least 50 ms at each transition to `none`, checked by reference when it fires;
  scenario 7. The Orchestrator re-read both pollers; every reader of an alert's answer is in
  `alert.ts` (`waitAlert` at 10 ms, `alertModuleSelect` at 20 ms), so no longer poll exists.
- **N2 (MINOR, test).** Scenario 9's fourth case already held at `6940a7b3` when the abort landed
  before a member's request. → Pinned to an abort while the member still returns true.
- **Optional, taken:**
  - Escape is consumed with `stopPropagation` too, so `window` listeners do not also fire;
  - a refused preview attempt does not drop a pending result;
  - one subscription per pending result;
  - scenario 4 needs an earlier successful body;
  - DevTool's formatted preview is a guard for scenario 9's third case.
- **At this second rejection, the Orchestrator asked whether the mechanism was the problem.** It
  was not a recurring kind of finding. Round 1's findings were each closed, and round 2's are
  refinements of the waiting rule that `MC-108` 5 introduced, which is timing against pollers the
  plan now names.

**Gate 1, round 3 (rev 3; ledger row 337; the round-1 reviewer): [REJECT].** N2 closed. R3-1
(MINOR, logic): D4 still showed a result at once when the store was `none` at the run's end, so a
result finishing within 20 ms of the user answering a blocking alert raced the poller, which the
plan's own rule forbade. The reviewer's fix was a further delay. It judged the design converged.

**Escalation (ledger row 338; `senior-advisor`), after three consecutive rejections.**
- **Root cause.** A blocking alert's answer is read by a later `get()`, after a poll. The window
  between the user's answer and that read belongs to the read side, and any writer can hit it.
  Rounds 2 and 3 patched the write side, and each patch left a window a reviewer could name. A
  further threshold would too. Ordering between timers with different delays is also not a spec
  guarantee.
- **Missed insight.** `alertStaleAccountNotice` (`alert.ts:138-170`) already captures its answer
  from the subscriber's argument. Svelte delivers each value to every subscriber before any value
  set from inside a subscriber. The Orchestrator executed this in the scratchpad (`w2bp/queue.mjs`)
  in both subscription orders. It also showed that today's polled `get()` reads a toast set in the
  same tick as the answer.
- **Adopted in rev 4:**
  - D9, the read-side capture, as an `MC-091` shared-cause amendment;
  - D4's timer removed; the pending result is shown from a subscriber;
  - a pending result dropped on a change of character or chat, which the advisor raised so it
    would not surface in round 4;
  - Escape in a plugin iframe disclosed.
- **Rejected on its advice:**
  - any further delay rule;
  - an answer id on `alertData`, which would touch AlertComp's 28 write sites;
  - a product constraint for the maintainer, which would remove neither the read-side window nor
    the trigger-alert case.

**Gate 1, round 4 (rev 4; ledger row 339; a fresh `opus-reviewer`): [REJECT].** The design held:
D9's read-side capture and D4's subscriber are correct, Svelte's queue semantics were re-verified
in both subscription orders, and no new data-loss path was found. Four MINOR findings:
- **F1 (test, factual).** D9's pre-fix failure was misdescribed. The poll does not read the other
  alert's text: it keeps waiting while the type is not `none`, then returns that alert's closing
  `msg`. So "no" followed by a `normal` alert closed with Enter returns true, and a toast case
  blocks rather than returns false (executed, `gate1r4/poll.mjs`; the Orchestrator re-ran it). →
  D9 and scenario 7b rewritten.
- **F2 (logic).** P1 and P8 were contradicted at the runner's start. Ctrl+U reaches the listener
  while a plugin's `alertConfirm` or the module picker is up, and the preview's notice then covers
  it. → D1 refuses while such an alert is up; scenario 7.
- **F3 (spec, test).** The character-or-chat drop had no identity key and no return-to-origin
  scenario. → D4 drops on the first change, observed as an event, so a return to the origin still
  drops; scenario 7.
- **F4 (guard).** DevTool's formatted joins and `instruct` rendering had no coverage although D3
  and D5 move their input. → scenario 14b at the seam.
- **F5-F7 (EDITORIAL), applied.** The module picker does have an overlay; the switch comes from
  the `prevChar`, `nextChar` and `home` hotkeys. v3's blocking `alertConfirm` is named. P5 lists
  `inlayErrorResponse`'s appended error.
- **Optional, taken:** the `let` and `settled` pattern named; a live check of two `input` alerts in
  a row; the two accepted silent losses disclosed.

  **Not taken:** dropping a pending result when a real send starts. A real send raises no alert of
  its own, and the result still belongs to the chat it previewed.

**Gate 1, round 5 (rev 5; ledger row 340; the round-4 reviewer): [EDITORIAL], applied in rev 5.1.**
All round-4 findings verified closed.
- **N1.** D1's refusal was not silent on the hotkey path. It returns before the key is consumed,
  so the browser's Ctrl+U (view-source) runs, as today's busy and Home refusals already do. → D1
  consumes the key on every refusal; scenario 7. This follows the reviewer's recommended option,
  and Gate 2 covers it.
- **N2.** A store subscription cannot see a chat switch: the selected chat is `chatPage` in
  `DBState`, not a store. → D4's note made non-normative, with an `$effect.root` that tracks both;
  the same-tick coalescing disclosed.
- **N3.** Scenario 7's "newer run" case was unreachable as written, because D1 refuses while
  another alert is up. → its setup (a toast after Escape) written in.
- **Optional, taken:**
  - D1's consequence disclosed: no re-preview while a result is open.
  - A switch during the run itself is disclosed as unwatched and harmless.

The Orchestrator checked each correction against the finding it answers.

**Implementation (ledger rows 341-342).**
- Step 1, the seams: a shared runner and renderer, `alertWait` returning its object, an unused
  `onCancel`, and a per-call `PreviewResult`. The suite was unchanged; the Orchestrator read the
  diff. The seam's untracked `previewRunner.ts` was not saved at the time; the Orchestrator
  reconstructed it from this session (`w2bp/seam-previewRunner.ts`), so the red run is cited from
  its log.
- Step 2, the red tests: 46 fail on the seam on the behaviour they name, and 20 pass
  (`w2bp/tests/red-run.txt`; re-run by the Orchestrator).
- Step 3, the fix, D1-D9. Beyond the plan:
  - `waitAlert` stays `Promise<void>`, because a string return broke 11 test files' typed mocks;
  - DevTool's formatted modes add a `> Previewing <name>` line for a group member.

  `groupPreviewNoSpeaker` was translated into the six locales, one line each.
- Step 4, the acceptance tests: two new files and three extended. 22 in-memory mutants, 21
  killed; the survivor is equivalent.

**Gate 2, round 1 (ledger row 343; a fresh `opus-reviewer`): [EDITORIAL].** Behaviour accepted.
- 20 mutants killed.
- Two consecutive `alertInput` prompts keep their own text (a happy-dom mount).
- Findings:
  - no test caught D9 reading the answer back from the store;
  - stale test comments and fixtures;
  - `guard:` labels on tests that cannot pass without the fix;
  - one over-broad comment in `alert.ts`.
- All four implementer decisions beyond the plan accepted.
- An upstream hazard was found (Escape turns a blocking alert into a toast without an answer). It
  is flagged to the maintainer as a separate task.

**Gate 2, round 2 (ledger row 344; the same reviewer): [APPROVE].** The `yes` variant kills the
answer-read-back mutant; the corrections verified.

**Live check (ledger row 345): passed, with one defect.** Production build, Echo, Claude in
Chrome.
- The notice's Cancel button, and Escape from the composer.
- Echo's plain text shown as text.
- Refusal over an open result and over a confirm, whose NO was honoured.
- The no-speaker message.
- A group preview that generates nothing.
- Masking, with no request reaching the provider.

The defect: a member with an empty name gave the heading `Prompt —` (new characters are created
unnamed).

**Live-check fix (ledger row 346; reviewed by the Gate 2 reviewer): [APPROVE].** An empty or
whitespace-only member name is treated as no name. The heading is `### Prompt`, and there is no
`> Previewing` line. Six regression tests failed first (`w2bp/tests/emptyname-red.txt`), and a
mutant restoring the old behaviour fails exactly those six.

**Commit-message check (ledger row 347; the Gate 2 reviewer): [EDITORIAL], applied.** Counts
verified. One false claim corrected: the abort does reach the request layer. Six claims made
complete or precise:
- JSON that is not an object;
- the hotkey's Home refusal and key consumption;
- the formatted preview's abort check;
- two groups of reproducers;
- the member name in DevTool's formatted modes;
- the group preview's drawn turn order.

The plugin-visible change is now stated.

**Final snapshot:** `pnpm test` 160 files, 2212 passed, 4 skipped; `pnpm check` clean; the build
passes.
