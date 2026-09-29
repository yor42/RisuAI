# Report 41 — Escape on alerts, stage 2: prompts covered by another alert: plan (rev 2.1)

Date: 2026-09-29. Status: plan; Gate 1 passed at round 2 ([EDITORIAL], applied in rev 2.1). Gate 2
[APPROVE] (ledger row 379; optional items row 380); commit-message check [EDITORIAL], applied (row
381). Committed as `c0b323b0`, records `d848ecdf`. This item builds on stage 1
(Report 39, `6631f5e0`, records `9dee3ea9`). Decisions: `MC-115` (this stage), `MC-109`, `MC-108` 5.
Ledger row 375 is the investigation; its packet is in the Orchestrator's scratchpad
(`stage2/packet.md`). Rows 376 and 377 are Gate 1 rounds 1 and 2.

## 1. The defect (upstream behaviour, with a fork-local detail)

Every blocking alert function in `src/ts/alert.ts` sets `alertStore` and awaits `alertEndMessage()`.
That resolves with `msg` at the first value whose type is `none`. The value might not end the
function's own alert. Upstream polled for the same condition every 10 ms, so it has the hazard too.

A waiting prompt therefore takes a foreign answer in three ways:

- **Cover, then close.** Another alert replaces the prompt on screen. When that alert closes, the
  hidden prompt resolves with its answer.
  - Enter on a `normal` or `error` notice writes `'yes'`, so a hidden `alertConfirm` returns
    `true`. The hidden prompt could be a plugin permission (persisted), MCP write access, the
    Tauri update, a delete confirm, or the hosted password prompt (set to `hash('yes')`).
  - A toast's end, OK, or stage-1 Escape on an info alert writes `''`, which is not a safe cancel
    (`MC-109`). The instant-remove "No" deletes every later message.
  - The full-storage save loop toasts again every few seconds with no user action.
- **Foreign close.** `alertClear()` (20 call lines) and five wrapper `set({type:'none'})` writes
  resolve whatever prompt is showing with `''`.
- **Two prompts.** A second prompt covers the first, and one answer resolves both. Default shortcuts
  are not blocked while an alert is up, so a double-pressed remove opens two delete confirms. That
  one Yes then removes two messages is inferred from `Chat.svelte`'s handler, not run.

Only the terms prompt (`askUpstreamAgreement`) and `alertStaleAccountNotice` defend themselves:
they re-post on any foreign value. A prompt they cover then takes the consent's answer token.

## 2. Decision (`MC-115`)

1. A notice, error, toast or loading overlay that arrives while a prompt is waiting shows at once.
   When it closes, the prompt comes back, with anything typed into it kept. A prompt takes only its
   own answer.
2. A second prompt waits its turn. Prompts show in the order they were asked, and each takes only
   its own answer. The terms prompt and the stale-account notice still go ahead of other prompts.
3. Keyboard shortcuts do nothing while a prompt is waiting for an answer.
4. For about 0.4 s after a prompt comes back, or the next prompt in turn appears, an answer given
   to it is ignored. Typing into it is not. A prompt that opens fresh answers at once.
5. Identical permission requests from one plugin that are in flight together share one prompt and
   its answer.

`MC-108` 5 stands: a finished preview waits while another alert is up. A waiting prompt is such an
alert, even while a notice covers it.

## 3. Terms (normative)

- **Prompt:** an alert whose caller waits for an answer: `ask`, `pluginconfirm`, `select`, `input`,
  `selectChar`, `addchar`, `chatOptions`, `cardexport`, `selectModule`, `tos`,
  `staleAccountNotice`. This is stage 1's `ignore` class minus `progress`. Only `alert.ts` functions
  and `upstreamAgreement.ts` post these types. The classification must be total over
  `alertData['type']`, so a new type fails the type check until it is classified.
- **Consent prompt:** `tos` and `staleAccountNotice`.
- **Cover:** any other alert value except `none`: notices, errors, markdown, toasts, `wait`,
  `wait2`, `progress`, request logs, and so on.
- **Waiting prompt:** a prompt whose caller has not received its answer. At most one waiting prompt
  is *current* (shown, or covered). The rest are *queued*. A prompt type that appears in the store
  without an owner here (a raw post) counts as waiting while it is shown.
- **Code close:** a `none` written through `alert.ts` by code: `alertClear()`, and the
  `alertStore` wrapper's `set({type:'none'})`. Stage 1's Escape on an info alert is a code close
  (it calls `alertClear()`). It only ever closes covers, because info types are never prompts.
- **User answer:** a `none` written to the raw store by `AlertComp`, by `hotkey.ts`'s Enter, or by
  the consent prompts' own answer paths. Tests write the raw store the same way.
- **Idle:** the store is `none` and no prompt is waiting.

## 4. Invariants

- **J1. Own answer.** A prompt's caller receives only an answer given while that prompt is the
  value on screen and past its guard (J10b). It never receives a cover's close, a code close, or
  another prompt's answer. The answer value for a given button or key is unchanged (`MC-109`;
  stage 1's I6).
- **J2. A cover shows at once.** A cover set while a prompt is waiting is the store's value
  immediately. The exception is while a consent prompt is up: its re-post over foreign values is
  unchanged (J7). A cover's own waiter (`alertNormalWait`, `alertErrorWait`, `waitAlert`,
  bootstrap's `waitForAlertCleared`) resolves when it closes, as today.
- **J3. The prompt comes back.** When a cover closes while a prompt is current, the current prompt is
  shown again, with the same message and options. Several covers in a row replace each other as
  today, and the prompt returns after the last one closes.
- **J4. The prompt comes back as the user left it.** That covers:
  - the text typed into an `input`;
  - the choices in `cardexport`;
  - the search text in `selectModule`;
  - the scroll position of a `select` or `selectChar` list.

  Any other prompt state held in `AlertComp` or its children is treated the same way.
- **J5. A code close leaves a showing prompt alone.** A code close while a prompt is the value on
  screen changes nothing and answers nothing. A code close while a cover is on screen closes the
  cover (J3 then applies).
- **J6. In turn.** A prompt asked for while another prompt is waiting is not shown until every
  earlier one is answered. Prompts show in request order.
- **J6a. Never stuck behind a closeless cover.** At the moment a prompt is queued, if the current
  prompt is hidden by a cover the user cannot close, the current prompt is put back on screen at
  once, replacing the cover. The closeless covers are `progress` and a `wait` without `onCancel`.
  J6a is an event, once per queued prompt: a cover written afterwards covers the prompt again (J2)
  and is not fought. A closeable cover (a notice, an error, a `wait` with Cancel) stays until the
  user closes it, and J3 then returns the prompt. It is set directly,
  with no `none` in between. The cover's owner may itself be awaiting the queued prompt, as the card
  importer does (`alertWait`, then `alertInput` for a password). Without J6a, that caller and the
  hidden prompt would wait on each other forever. A cover's waiter then resolves at the prompt's
  answer, as when a prompt replaces a notice today.
- **J7. Consent goes first.** A consent prompt shows at once even while another prompt is waiting.
  The waiting prompt comes back after the consent is answered, and receives only its own answer. A
  prompt asked for while a consent prompt is up waits.
- **J8. A prompt still replaces a status.** A prompt asked for with no other prompt waiting is the
  store's value when the call returns, replacing any cover, as today. Existing chains behave as
  today when no other prompt is waiting:
  - `alertWait`, then a result or a prompt;
  - a prompt answered, then a follow-up prompt;
  - the preview's `wait`+`onCancel` notice;
  - progress loops;
  - `alertClear()` closing one's own notice;
  - `alertClear(); alertError(x)` in one tick.
- **J9. A preview never shows over a waiting prompt.**
  - The preview's result (`MC-108` 5) is shown at once only if no prompt is waiting and the store
    holds the runner's own notice, `none` or a toast. Otherwise it waits for idle.
  - `previewMayStart()` is false while a prompt is waiting, even under a toast.
  - A momentary `none` between a cover's close and the prompt's return does not count as idle.
  - Readers that wait for their own notice to close keep resolving when it closes (J2).
- **J10. Shortcuts wait.** While any prompt is waiting, covered or not:
  - no action of the configurable shortcut table runs;
  - the Ctrl+1..9 preset keys do not switch presets;
  - the triple-touch quick menu does not open.

  A key is consumed (`preventDefault`) exactly when it was consumed before, and never otherwise.
  So Ctrl+V and Ctrl+X still paste and cut in an `input` prompt. Escape keeps stage 1's behaviour.
  Enter answers only when no Ctrl, Alt or Meta modifier is held, and never on key auto-repeat.
- **J10b. A double-press does not answer.** For 400 ms after a prompt comes back (J3, J6a, J7) or
  becomes current after an earlier prompt's answer (J6), an answer to it is discarded and the
  prompt stays up. That applies to any user answer, pointer or key. Typing into the prompt is not
  affected (this is how `MC-115` 4's "clicks and keys" is read). A prompt that becomes current with
  no prompt before it answers at once. A discarded answer is still a `none` on the raw store for a
  moment. A cover's waiter left pending by J6a may resume on it; this is accepted (§7).

  The auto-repeat rule in J10 still applies after the 400 ms, because a held key starts repeating
  after about 500 ms.
- **J11. No API or data change.** No alert function's signature, return type or answer values
  change. No plugin, Lua or trigger API changes shape. No stored data is touched. A prompt's
  promise can settle later than before, after a cover closes or an earlier prompt is answered. It
  never settles with another alert's answer.
- **J12. Duplicate permission requests share one prompt.** Concurrent `getPluginPermission` calls for
  the same plugin script and permission share one in-flight call and its answer. The in-flight
  lookup comes before the function's first `await`, and the entry is cleared when the call settles
  or throws.
- **J13. No reliance on subscriber order.** Correctness does not depend on the order in which
  readers subscribed to `alertStore`. A reader that needs idle gets it from the controller after
  the controller has processed the value.

## 5. Approach (non-normative)

- Keep `alertStore` a plain `writable` that holds what is on screen. Every reader keeps reading
  what is showing.
- Put the controller in a new small module, not in `alert.ts`.
  - Three suites mock `./alert` without the new exports: `hotkey.test.ts`,
    `hotkeyCharSwitch.svelte.test.ts` and `previewOwnership.svelte.test.ts`. With the controller
    in its own module, those mocks do not break.
  - The controller subscribes lazily, at first use. Eager subscription at module load makes 13
    test files that mock `stores.svelte` without `alertStore` fail to load (Gate 1 round 1 ran it).
- The controller holds a FIFO of `{data, resolve}` and the current prompt.
  - Prompt functions register with it. Capture the posted object at `set`, not with `get(store)`
    afterwards.
  - It watches the raw store:
    - a `none` whose previous value was the current prompt's object is that prompt's answer,
      unless the prompt is inside its J10b guard;
    - a `none` after a cover, with a prompt current, re-posts the prompt.
- It publishes idle as its own readable, updated after it processes each value (J13). Nothing in
  the module touches `alertStore` at import, not even a module-level `derived`. Everything starts
  lazily.
  - previewRunner subscribes to that readable.
  - `doingAlert()` becomes true while a prompt is waiting, which covers the preset keys and the
    triple-touch menu (its only callers are in `hotkey.ts`).
- `alertClear()` and the wrapper check for a showing prompt before writing `none` (J5).
- For J4, the lowest-bookkeeping route is to keep a prompt's DOM mounted, hidden under a cover,
  rather than saving each piece of state by type. `AlertComp` must drive this from the store's own
  transitions, not from controller state, so that U6 (which drives the raw store) holds.
- It needs a test reset (as `resetUpstreamAgreementForTests` is), available from the seam commit
  onward. Suites reset with a raw `none`, which under J3 would re-post a leftover prompt.

## 6. Tests (red first, then the fix)

**Seam commit first.** It adds the controller module's exports as unwired stubs and the test reset,
so that no reproducer fails on a missing export. Reproducers go against that snapshot. All use the
real `alert.ts` over a plain `writable`, as `hotkeyEscape.test.ts` does.

**Reproducers:**

- **U1 (J1, J3).** A confirm is waiting, and `alertNormal` covers it. The notice is closed with
  `'yes'`. The confirm is not settled, and the store shows the confirm again. After the guard,
  answering "No" resolves it `false`.
- **U2 (J1, J3), parameterised over the cover:**
  - a toast whose animation ends (`{none,''}`);
  - `alertError` closed by Enter;
  - `alertWait`, then `alertClear()`;
  - `progress`, then the wrapper's `none`.

  It is also parameterised over every waiting prompt type. `alertCardExport` gets a `.catch`, since
  HEAD rejects on `JSON.parse('')`.
- **U3 (J5).** `alertClear()` while a select is showing leaves the select showing and pending.
- **U4 (J6).** Two confirms are asked in a row.
  - The store shows the first. Answering it `'yes'` resolves only the first, and the second shows.
  - After the guard, answering the second `''` resolves it `false`.
- **U5 (J7), parameterised over `tos` (the raw post) and the stale-account notice.** A confirm is
  waiting; the consent is posted, then answered. The confirm comes back and is not settled.
- **U6 (J4), AlertComp.** It drives the store directly, so that it is red on HEAD for the J4 reason:
  the same `input` prompt object, then a cover, then the same object again. The typed text is still
  in the field. A second case does the same for the `cardexport` choices.
- **U7 (J9), previewRunner.**
  - A preview result is pending behind a notice that covers a waiting prompt. Closing the notice
    shows the prompt, not the preview. Answering the prompt shows the preview.
  - Second case: a preview finishing while a toast covers a waiting prompt does not show at once.
  - Third case: `previewMayStart()` is false then.
- **U8 (J10), hotkey.** With a prompt waiting, the remove shortcut does not click remove.
  - A second case does the same with the prompt covered by a notice.
  - It is parameterised over request logs (opens an alert) and settings (changes screen).
  - Ctrl+1 (preset) with the prompt hidden under a toast does not switch presets. Over a showing
    prompt, `doingAlert()` already blocks it, so that case is a guard (G3).
- **U9 (J10), hotkey.** It sets `ask` in the store directly.
  - An Enter with `repeat: true` does not answer it.
  - Ctrl+Enter does not answer it.
- **U10 (J6a), parameterised over `alertWait`, `progress` and a wrapper-set `wait`.** It runs
  `p = alertConfirm('P')`, then the cover, then `q = alertConfirm('Q')`. The store shows P. After
  the guard, answering P shows Q.
  - On HEAD this is red for the J6 reason (Q replaces P). The J6a-specific evidence is the
    "no un-cover on queue" mutant.
  - A second case: a `progress` written after Q is queued covers P and is not fought.
  - A third case (a guard after the fix): with `alertNormal` as the cover, P is not put back; the
    notice stays until closed.
- **U11 (J10b).** A confirm comes back after a cover closes. An answer written within 400 ms is
  discarded, and the confirm stays up and pending. An answer after 400 ms resolves it. The same is
  checked for the second prompt of U4. Use fake timers. On HEAD this is red for the J3 reason, and
  it cannot be red for the J10b reason on any snapshot before J3 exists. The J10b evidence is the
  "guard dropped" mutant.
- **U12 (J12).** Two concurrent permission requests for the same script and permission, driven
  through `makeRisuaiAPIV3` as `v3PluginPermissions.svelte.test.ts` does, call `alertConfirm` once.
  One answer resolves both. A request after that settles is served by the session cache as today.

**Guards:**

- **G1 (J8), each behaving as today:**
  - `alertWait`, then `alertNormal`;
  - `alertWait`, then `alertConfirm` shows the confirm;
  - a confirm answered, then a follow-up confirm, answered at once (the follow-up is fresh);
  - `alertWait`, then `alertClear()` with no prompt;
  - a progress loop ending in `none`.
- **G2 (J2, J9).** `alertNormalWait` over a waiting prompt resolves when the notice closes.
- **G3 (J10).**
  - Ctrl+V in an `input` prompt is not prevented.
  - Ctrl+Alt+Enter over an `ask` does not answer it (the `send` entry consumes it today).
  - Ctrl+1 over a showing prompt does not switch presets.
- **G4 (stage 1 with stage 2).** Escape on a `normal` cover over a waiting prompt closes the cover,
  and the prompt returns. Escape on the preview's `onCancel` notice over a waiting prompt cancels
  the preview, and the prompt returns.
- **G5 (J10, J6).** A raw `tos` post counts as waiting: shortcuts are blocked, and a prompt asked
  for then waits.
- **G6. Existing suites stay green:**
  - `alert.blockingAnswer.test.ts`, `upstreamAgreement.test.ts`,
    `bootstrap.staleAccountProfile.svelte.test.ts`, `hotkeyEscape.test.ts`, `previewRunner.test.ts`
    and `AlertComp.selectChar.svelte.test.ts`;
  - `hotkey.test.ts`, `hotkeyCharSwitch.svelte.test.ts` and `previewOwnership.svelte.test.ts`,
    which mock `./alert`.

  A test that has to change is listed with the reason before the fix is written. Suites that
  reset with a raw `none` also call the test reset.

**Mutants for Gate 2** (scratch Vitest config, never in place):
- the controller accepts any `none` as an answer;
- no re-post after a cover closes;
- code closes not guarded;
- LIFO instead of FIFO;
- no un-cover on queue (J6a);
- the J9 check dropped from either preview branch;
- the J10 check dropped;
- the modifier or repeat check dropped;
- the J10b guard dropped;
- the J12 in-flight sharing dropped, or its entry never cleared.

**Comments that become false at implementation time and must be corrected:**
- the `alertEndMessage` docblock;
- previewRunner's docblocks (every blocking alert takes its answer from that same `none`);
- `previewMayStart`'s docblock;
- the comments in `hotkey.ts` and `alertEscape.ts` that describe what Escape and Enter answer.

## 7. Risks and compatibility

- **Upstream scripts that depended on a foreign answer.** A plugin, Lua script or trigger whose
  prompt was ended by another alert's close will now wait until the user answers it. Several
  prompts that one answer used to settle together now come one at a time. J12 covers plugin
  permissions. MCP access prompts are not cached, and asking each in turn is intended.
- **The hosted first-run password.** `NodeStorage.checkAuth` has several entry points, two instances
  and no in-flight guard. Concurrent first-run prompts were not traced, and boot looks sequential.
  If two ever occur, they are now asked in turn, and the server refuses the second password without
  telling the client. Not in scope; recorded as a residual. Third-party code cannot be searched from here, so
  this residual is real, if unmeasured. Every prompt has an on-screen answer (stage 1's I7).
- **A prompt nobody can answer blocks later prompts.** It does not block notices or errors (J2).
  Escape does not dismiss prompts (`MC-109` 1). A reload remains the exit.
- **A leaked cover.** An operation that throws before its `alertClear()` leaves its notice up. J6a
  uncovers the current prompt when another prompt queues. A leaked `wait` with no prompt waiting
  stays up until the next alert replaces it, as today. A cover written after a prompt is queued, by
  an operation that itself waits on that prompt's owner, could still hide the current prompt. No
  such chain is known.
- **A follow-up prompt is fresh.** A prompt the caller asks for after an earlier prompt's answer
  (the second character-delete confirm) answers at once, so a double-press on the first can answer
  the second. This is unchanged from today and follows `MC-115` 4's scope.
- **A discarded answer's momentary `none`** can resume a cover's waiter that J6a left pending,
  slightly early. Accepted.
- **The momentary `none`.** Subscribers see `none` between a cover's close and the prompt's return.
  Only previewRunner acts on `none` as "idle", and J9 and J13 move it to the controller's readable.
  The other `none` readers either wait for their own notice (correct) or are the consent re-posts
  (safe).
- **Click-through.** A toast has no overlay. While it covers a prompt, a click aimed at the prompt
  can land on the chat behind it. This is not new, but the storage-full loop makes it frequent.
  Rendering a toast above a still-visible prompt is an optional improvement, not in scope.
- **The 400 ms guard** delays a deliberate answer to a returning prompt by at most 0.4 s. A fresh
  prompt is unaffected.
- **Two consent prompts at once** would re-post over each other forever. This is judged
  unreachable, because the stale-account notice runs only before the app loads.
- **Expected files:**
  - a new controller module;
  - `src/ts/alert.ts`, `src/lib/Others/AlertComp.svelte` (and `ModuleChatMenu.svelte` if J4
    needs it), `src/ts/hotkey.ts`, `src/ts/process/previewRunner.ts`, `src/ts/upstreamAgreement.ts`;
  - `src/ts/plugins/apiV3/v3.svelte.ts` (J12);
  - possibly `src/ts/alertEscape.ts`;
  - new tests, and the test reset in the suites listed in G6;
  - this report and the campaign records.

## 8. Gate record

- Gate 1 round 1: [REJECT].
  - F1, blocker: a queued prompt deadlocks behind a cover its own caller owns. Fixed by J6a and U10.
  - F2: subscriber order, and eager subscription breaks 13 test files. Fixed by J13 and §5.
  - F3: `ev.repeat` alone misses a double-press. The maintainer chose the 400 ms guard (`MC-115` 4,
    J10b).
  - F4: blocking the table must not change consumption, and Ctrl+Alt+Enter fell through to Enter's
    answer. Fixed in J10.
  - F5: J4 missed state. It is widened, and U6 reworked.
  - F6: the immediate preview branch, the preset keys and `doingAlert()`. Fixed in J9 and J10.
  - F7: mocks, the reset seam and synchronous posting. Addressed in §5, J8 and §6.
  - F8: editorial fixes in §1, §3 and J2.
  - F9: duplicate permission prompts. The maintainer chose shared prompts (`MC-115` 5, J12).
- Gate 1 round 2: [EDITORIAL], applied in rev 2.1.
  - J6a narrowed to closeless covers, and written as an event.
  - J9 reworded: the runner's own notice still allows an immediate show.
  - J12 requires the lookup before the first `await`, and clearing on settle. The `checkAuth` half
    was dropped as untraced (§7).
  - U8 and U9 relabelled after a HEAD run: Ctrl+Alt+Enter, and Ctrl+1 over a showing prompt, are
    guards.
  - U10 and U11: the J6a and J10b evidence comes from mutants.
  - Residuals added to §7. J10b's reading of `MC-115` 4 stated.
- Gate 2: [APPROVE] (ledger row 379). 44 mutants, 35 killed. The 9 survivors were test gaps
  or equivalents, not defects. The gaps were closed with 19 tests, and the guard's clock is
  monotonic (row 380). Commit-message check: [EDITORIAL], applied (row 381).
