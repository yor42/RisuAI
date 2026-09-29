# Report 39 — Escape on alerts: plan (rev 3.1)

Date: 2026-09-29. Status: plan; Gate 1 passed at round 3 ([EDITORIAL], applied in rev 3.1). This item builds on W2b-previews,
committed as `8f93d095`, with its records in `5e4a2bfd`. Implementation starts only once the
worktree is on `5e4a2bfd`. Ledger rows 348 onward (investigation 348, Gate 1 round 1 349).

## 1. The defect (upstream behaviour)

`initHotkey`'s late Escape block in `src/ts/hotkey.ts` runs `alertToast('Alert Closed')` whenever
`doingAlert()` is true, then closes settings. The toast replaces whatever alert was up. Its
`onanimationend` (in `AlertComp.svelte`, a 1 s animation) later writes `{type:'none', msg:''}`.

So Escape on any alert waiting for an answer answers `''`, about a second late:

- `alertConfirm` gives `false`. The instant-remove confirm in `Chat.svelte`'s delete handler then
  removes the message **and every message after it**.
- `alertInput` gives `''`. `NodeStorage`'s first-run password prompt then sets the server password
  to `digestPassword('')`.
- `alertSelect` gives `''`. `exportChat` falls through to its TXT download.
- `alertCardExport` gives `''`, and `JSON.parse('')` throws.

If another alert replaces the toast within that second, the waiter takes that alert's answer
instead. Upstream (`upstream/main`) has the same block and toast.

## 2. Decision (`MC-109`)

1. Escape on an alert waiting for an answer does nothing.
2. Escape on an information alert closes it at once, with no toast.
3. A prompt that another alert covers is a second stage (out of scope here).

## 3. Classification (normative)

Every member of `alertData['type']` (24 members) gets exactly one class. The table is a total
`Record`, so a new type fails the type check until it is classified.

| Class | Types | Escape does |
|---|---|---|
| answer (`ignore`) | `ask`, `pluginconfirm`, `select`, `input`, `selectChar`, `addchar`, `chatOptions`, `cardexport`, `selectModule`, `tos`, `staleAccountNotice` | nothing; the event is consumed |
| left alone (`ignore`) | `progress` | nothing; the event is consumed |
| info (`close`) | `normal`, `error`, `markdown`, `requestdata`, `hypaV2`, `branches`, `requestlogs`, `pukmakkurit`, `wait2` | writes `{type:'none', msg:''}`, then closes settings as today |
| idle | `none`, `toast`, `wait` | today's path: closes settings if open |

Notes:

- `wait` is idle, which is today's behaviour: `doingAlert()` is false for it. A `wait` carrying
  `onCancel` is handled earlier, by W2b-previews' Escape block, and never reaches this one.
- `wait2` (`alertErrorWait`, no live caller) has no button. Escape is its only exit, so it is
  info-class.
- `pukmakkurit` has no poster and no button. It is info-class for the same reason.
- `progress` is left alone per `MC-109` 2. Today Escape swaps the full-screen progress overlay for
  a toast, and a hung import's overlay could be dismissed that way. That exit goes (section 7).

## 4. Invariants

- I1. Escape never writes the store while an `ignore`-class alert is up.
- I2. While an `ignore`-class alert is up, Escape changes no other state either. Settings stay
  open. The late block calls `preventDefault` and `stopPropagation`, so window-level bubble
  listeners do not run. Every current Escape listener that could act behind an alert is of that
  kind: `BookmarkList`, `TriggerV2List`, `SourceDisclosure`, and `IrisModal` via `svelte:window`.
  Element-level listeners and other `document` listeners are not covered, and none of them handles
  Escape behind an alert today.
- I3. On an info-class alert, Escape writes exactly one `{none,''}` to the store. It shows no toast
  and closes settings as today.
- I4. On an idle-class value, Escape behaves exactly as today.
- I5. Keys that return before the late block are unchanged. This covers the early text-input
  return (an unmodified Escape with focus in an INPUT, TEXTAREA or contenteditable) and
  W2b-previews' `wait`+`onCancel` block. A modified Escape (Shift or Ctrl) that bypasses the
  text-input return reaches the late block and follows I1-I4.
- I6. No alert function's signature or answer value changes, and no caller of an alert function
  changes. The plugin v3 and Lua `alertConfirm`, `alertSelect` and `alertInput` keep their
  contracts. A prompt dismissed with Escape simply keeps waiting.
- I7. Every `ignore`-class prompt has an on-screen way to answer. `selectChar` has none today
  (its only controls add a character), so it gets a Cancel button (section 5).

## 5. Approach (non-normative except where marked)

- **Seam.** A new dependency-light module `src/ts/alertEscape.ts`, with only a type import of
  `alertData`. It exports the total table and
  `escapeActionFor(type): 'ignore' | 'close' | 'idle'`. `hotkey.ts` imports it directly, so test
  mocks of `./alert` never stub it.
- **Hotkey.** The late Escape block switches on the seam:
  - `ignore`: `preventDefault`, `stopPropagation`, return.
  - `close`: `alertClear()`, then today's settings close and `preventDefault`.
  - `idle`: today's path.
  - `alertToast` is no longer called from this block. It stays exported for its other callers.
- **`selectChar` Cancel (normative; `MC-091` amendment, a technical prerequisite of `MC-109` 1).**
  The `selectChar` block in `AlertComp.svelte` gets a Cancel button, using the existing
  `language.cancel` string. It writes `{type:'none', msg:''}`. `addGroupChar` in `group.ts`
  already treats `''` as an abort (`if(res)`). The concrete failure without it: after `MC-109` 1,
  the picker's only exits are adding some character to the group or reloading the page.

## 6. Tests (red first on this snapshot, then the fix)

The harness follows `src/ts/alert.blockingAnswer.test.ts`, which imports the real `alert.ts` with
`./stores.svelte` mocked to a writable `alertStore` and `settingsOpen`, and with
`./storage/database.svelte` and `./platform` mocked. It also follows
`src/ts/hotkeyCharSwitch.svelte.test.ts` for installing `initHotkey`'s listener once. That means
`beforeAll`, or capturing the handler through a `document.addEventListener` spy; it must not be
re-installed in every test. No assertion counts calls on a mocked alert function.

Put the tests in a new file, `src/ts/hotkeyEscape.test.ts`. `hotkey.test.ts`'s `./alert` mock
(`doingAlert: () => false`) makes these assertions vacuous.

- T1. **Specification test** for the seam. Every union member maps to the class in section 3. It
  imports `alertEscape.ts` with no mocks. It cannot run at HEAD (no module), so it is not a guard.
- T2. **Reproducer.** An `ask` object is in the store and settings are open. Escape is dispatched
  on `document.body`. The store still holds the same object, and settings are still open. Red at
  HEAD: the store is `{toast,'Alert Closed'}` and settings close.
- T3. **Reproducer**, parameterised over every other `ignore`-class type: `pluginconfirm`,
  `input`, `select`, `selectChar`, `addchar`, `chatOptions`, `selectModule`, `cardexport`, `tos`,
  `staleAccountNotice` and `progress`. The assertions are the same as T2's.
- T4. **Reproducer.** An `ask` alert is up, and a `window` keydown listener is registered. The
  listener does not see Escape. Red at HEAD.
- T5. **Reproducer**, parameterised over every info type, with settings open. After Escape, the
  store is `{type:'none', msg:''}` synchronously and settings are closed. Red at HEAD, where the
  store holds a toast.
- T6. **Guard**, parameterised over `none`, `toast` and `wait` with settings open. Escape closes
  settings and leaves the store unchanged. Passes before and after.
- T7. **Reproducer**, end to end with the real `alertConfirm`. It is pending, and the toast's
  `animationend` is emulated by a store subscriber that writes `{none,''}` 1 s after a `toast`
  value. Then: Escape, advance fake timers past 1.5 s, the promise is still pending and the store
  holds the same `ask` object. Writing `{none,'no'}` (the NO button) then resolves it `false`, and
  in a second case `{none,'yes'}` resolves it `true`. Red at HEAD: the promise resolves `false` at
  the emulated toast close.
- T8. **Guard.** Escape is dispatched twice on `ask`. The result is identical to one Escape.
- T9. **Guard (I5).** An unmodified Escape with focus in an INPUT inside the document, with an
  `ask` alert up, leaves the store and settings unchanged. It passes before and after, because it
  never reaches the block. A Shift+Escape in the same setup follows T2 (a reproducer).
- T10. **Reproducer (I7).** `AlertComp` is mounted with a `selectChar` alert, as
  `AlertComp.tos.svelte.test.ts` does. A Cancel button exists, and clicking it writes
  `{type:'none', msg:''}`. Red at HEAD, where there is no button.

- T11. **Reproducer, in `previewRunner.test.ts`.** A preview result is waiting behind a `normal`
  alert. Escape closes that alert, and the result shows at once. This is `MC-108` 5 with Escape
  as the close. Red at `5e4a2bfd`, where the store holds Escape's toast and the result has not
  shown.

**Existing tests that change behaviour.** `previewRunner.test.ts`'s `pendingBehindToast` helper
reaches "a result pending behind a toast" by pressing Escape on a `normal` alert. With this fix,
Escape closes that alert, so the result shows at once and the toast state never occurs. Seven
tests fail: the three "a newer run ..." tests and the four "an attempt refused because ... leaves
the pending result to show when the toast ends" cases.

The helper instead covers the `normal` alert with `alertToast(...)` directly. That state is
reachable through the preset-change toast. Its docstring changes to match. The seven tests keep
their assertions.

**Known residual (stage 2, not proven here).** A prompt covered by another alert still takes that
alert's answer. That includes an info alert closed by Escape: the covered prompt resolves `''`, as
at HEAD.

## 7. Risks and compatibility

- **Keyboard users lose Escape-to-dismiss on prompts.** Enter still means Yes on `ask`, `normal`
  and `error`. This was chosen knowingly (`MC-109` 1).
- **Escape no longer dismisses a hung import's progress overlay.** A reload is the exit, as it
  already was for a hung `wait` notice.
- **Consent prompts** (`tos`, `staleAccountNotice`) re-post on any foreign value, so Escape already
  did nothing visible to them. Accept, Decline and OK remain.
- **Upstream artifacts are untouched.** A plugin, Lua or trigger prompt waits for a click instead
  of getting `''` or `false` after 1 s. Nothing in `plugins.md` or the plugin typings documents
  Escape on alerts.
- **Comments and tests that describe Escape's toast become false.** These must be corrected:
  - the `alertStaleAccountNotice` doc comment in `alert.ts`;
  - `bootstrap.staleAccountProfile.svelte.test.ts`: the test title "Escape's toast" and the comment
    on hotkey.ts's "real Escape write". The toast write is kept as a foreign-value simulation, but
    it is no longer described as Escape's write;
  - `alert.blockingAnswer.test.ts` and `upstreamAgreement.test.ts` were checked, and they contain
    no wording that calls the toast write Escape's.
- **Expected files:**
  - `src/ts/alertEscape.ts` (new), `src/ts/hotkey.ts`, `src/lib/Others/AlertComp.svelte`,
    `src/ts/alert.ts` (comment only);
  - `src/ts/hotkeyEscape.test.ts` (new), an AlertComp `selectChar` test (new);
  - `bootstrap.staleAccountProfile.svelte.test.ts` (wording only);
  - `src/ts/process/tests/previewRunner.test.ts` (`pendingBehindToast` changes behaviour, and T11
    is added);
  - this report and the campaign records.
