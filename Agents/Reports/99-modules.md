# Modules: suspected bugs

These were found while writing the [[Modules]] wiki page. It is a hand-off list for a follow-up investigation, not user documentation.

Each entry is a **claim from reading the code**, not a reproduction. Nothing here has been run or tested. The "Status" line says how far each claim has been checked.

Line numbers refer to the working tree at the time of writing (branch `fix/persistence-conflict-platform-hardening`, after commit `0291ea36`).

**Status values**

- **Reported**: a single reading of the code by a code-reader agent.
- **Reviewer-confirmed**: an independent read-only reviewer re-read the code and agrees.
- **Orchestrator-confirmed**: the Orchestrator re-read the cited lines and agrees with the claim.

**Severity scale**

- **High**: loss or corruption of user data.
- **Medium**: a feature does the wrong thing, or silently doesn't work.
- **Low**: an edge case, dead code, or a doc/UI mismatch.

**Wiki coupling:** the Modules wiki page documents MOD-1 and MOD-2 as current behaviour. A fix must update the page.

## Triage index

| ID | Severity | Status | One line |
|---|---|---|---|
| MOD-1 | Medium | Reviewer- and Orchestrator-confirmed | A persona's embedded module is never applied to chats |
| MOD-2 | Low | Reviewer- and Orchestrator-confirmed | Modules merge in storage order, but the settings list shows them sorted by name |
| MOD-3 | Low | Orchestrator-confirmed | `RisuModule.cjs` is declared but never read |
| MOD-4 | Low | Orchestrator-confirmed | Two module strings in `src/lang` have no consumers |
| MOD-5 | Low | Reported | `RisuModule.icon` has no editing UI |
| MOD-6 | Low | Reported | Editing a module's lore, regex, triggers or assets doesn't refresh the open chat |

---

## MOD-1: A persona's embedded module is never applied

- **Severity:** Medium
- **Status:** Reviewer-confirmed (doc-verifier pass on the wiki page) and Orchestrator-confirmed.
- **Where:** `src/ts/process/modules.ts:357-381,398-425`
- **Claim:** `getModules()` adds `persona.embeddedModule.id` (normally `'$embedded'`) to the id list, then calls `getModuleByIds(ids)`. That function only filters `db.modules`. The persona's embedded module lives on the persona, not in `db.modules`, so it is never returned. The only code that resolves `'$embedded'` to the persona's module is `getModuleById` (`modules.ts:357-372`), which `getModules()` doesn't use.
- **Effect:** Lorebook, regex, triggers, assets and toggles in a persona's embedded module (created when a persona is made from a character or a module, `interchangeability.ts:125-179`) have no effect in chats. Its assets are still protected from cleanup (`globalApi.svelte.ts:1970-1978`), so the data is kept.
- **Investigate:** In `getModules()`, append `persona.embeddedModule` to the result after `getModuleByIds`, and check the memo key (`lastModules`) still changes when the persona changes. Check whether any UI promises that the embedded module is active.

## MOD-2: Merge order differs from the displayed order

- **Severity:** Low (design or doc question)
- **Status:** Reviewer- and Orchestrator-confirmed.
- **Where:** `src/ts/process/modules.ts:374-381`; `src/lib/Setting/Pages/Module/ModuleSettings.svelte:27-33`
- **Claim:** Lorebooks, regex, triggers and toggles are concatenated in `db.modules` array order (creation/import order). The Modules settings page sorts its list by name for display only. There is no way in the UI to see or change the merge order.
- **Effect:** Users can't predict which module's regex runs first, or which module's lorebook comes first.
- **Investigate:** Decide whether order matters enough to expose (drag to reorder, or show the real order).

## MOD-3: `RisuModule.cjs` is never read

- **Severity:** Low
- **Status:** Orchestrator-confirmed. Only the type definition (`modules.ts:24`) and a test fixture (`src/ts/process/tests/moduleUpdateDeps.svelte.test.ts:90,205-210`) mention it.
- **Investigate:** Remove the field, or document it as reserved.

## MOD-4: Orphaned module strings

- **Severity:** Low
- **Status:** Orchestrator-confirmed.
- **Where:** `src/lang/en.ts:1139-1140` (and every other language file)
- **Claim:** `moduleContent` and `confirmRemoveModuleFeature` are never used by `src/lib` or `src/ts`.
- **Investigate:** Remove them from all language files, or restore the feature they belonged to.

## MOD-5: `icon` has no editing UI

- **Severity:** Low
- **Status:** Reported.
- **Where:** `src/ts/process/modules.ts:34`; `src/lib/Setting/Pages/Module/ModuleMenu.svelte`
- **Claim:** The icon is only set by converting a character into a module, and used when converting back or exporting as CharX. The module editor has no control for it.

## MOD-6: Module content edits don't refresh the open chat

- **Severity:** Low
- **Status:** Reported. The narrowing is intentional (see the comment in `moduleUpdateDeps.ts:11-18`); only the visible side effect is in question.
- **Where:** `src/ts/process/modules.ts:552-583`; `src/ts/process/moduleUpdateDeps.ts`
- **Claim:** `moduleUpdate()` only tracks `id`, `namespace`, `hideIcon` and `backgroundEmbedding`. Editing a module's lorebook, regex, triggers or assets doesn't bump `ReloadGUIPointer`, so an open chat may keep showing the old rendering until something else reloads it. Saving is not affected.
- **Investigate:** Confirm whether regex/asset edits to an enabled module visibly lag in chat. If so, bump the GUI pointer when the module editor closes.
