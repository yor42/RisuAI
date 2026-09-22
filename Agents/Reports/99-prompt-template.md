# Prompt template: suspected bugs

These were found while rewriting the [[Prompt Template]] wiki page. It is a hand-off list for a follow-up investigation, not user documentation.

Each entry is a **claim from reading the code**, not a reproduction. Nothing here has been run or tested.

Line numbers refer to the working tree at the time of writing (branch `fix/persistence-conflict-platform-hardening`, after commit `0291ea36`).

**Status values**

- **Reported**: a single reading of the code by a code-reader agent.
- **Orchestrator-confirmed**: the Orchestrator re-read the cited lines and agrees with the claim.

## Triage index

| ID | Severity | Status | One line |
|---|---|---|---|
| PT-1 | Low | Orchestrator-confirmed (token side); build side Reported | Lorebook and End-Injected items count `innerFormat` tokens that are never sent |
| PT-2 | Low | Orchestrator-confirmed | `promptSettings.assistantPrefill` is stored but never used |

---

## PT-1: `innerFormat` counted but not applied for two item types

- **Where:** `src/ts/process/prompt.ts:77-87` (token count); `src/ts/process/index.svelte.ts:782-795,1382-1394` (build)
- **Claim:** `tokenizePreset()` counts `innerFormat` for `lorebook` and `postEverything` items. The build switch for those two types pushes their content directly and never reads `innerFormat` or `role2`. The editor can't set `innerFormat` on these types (`PromptDataItem.svelte:56-58`), so this only shows up with imported or hand-edited presets, as an inflated token estimate.
- **Investigate:** Drop the two cases from `tokenizePreset()`, or implement `innerFormat` for them. Narrow the `PromptItemTyped` type (`prompt.ts:36-41`) to match.

## PT-2: `assistantPrefill` is inert

- **Where:** `src/ts/process/prompt.ts:10`; `src/ts/storage/database.svelte.ts:439`; `src/ts/process/templates/templates.ts:394`; `src/lang/*.ts` (`assistantPrefill` label)
- **Claim:** The setting has a type, defaults and a translated label, but no UI binding and no reader. Shipped presets prefill with a Character-role Plain Prompt wrapped in `{{#if {{prefill_supported}}}}`.
- **Investigate:** Remove the field and label, or wire it up.

## Related note (not a bug)

`{{prefill_supported}}` returns `1` only when the model id starts with `claude` (`src/ts/cbs.ts:1357-1365`). Other providers that accept an assistant prefill get `0`. Worth revisiting if prefill support is broader now.
