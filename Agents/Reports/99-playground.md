# Playground: suspected bugs

**STATUS:** reference

These were found while writing the [[Playground]] wiki page. It is a hand-off list for a follow-up investigation, not user documentation.

Each entry is a **claim from reading the code**, not a reproduction. Nothing here has been run or tested.

Line numbers refer to the working tree at the time of writing (branch `fix/persistence-conflict-platform-hardening`, after commit `0291ea36`).

**Status values**

- **Reported**: a single reading of the code by a code-reader agent.
- **Orchestrator-confirmed**: the Orchestrator re-read the cited lines and agrees with the claim.

**Wiki coupling:** the Playground wiki page says the Playground chat appears in the character grid (PG-1). A fix must update the page.

## Triage index

| ID | Severity | Status | One line |
|---|---|---|---|
| PG-1 | Low | Orchestrator-confirmed | The Playground chat character is hidden from the sidebar but shows in the character grid |
| PG-2 | Low | Orchestrator-confirmed | Prompt Convertion's per-file Delete button does nothing |
| PG-3 | Low | Reported | Dead `PlaygroundStore === 2` branch and an empty `PlaygroundRegex.svelte` |
| PG-4 | Low | Orchestrator-confirmed | Embedding tool edits the live memory settings |

---

## PG-1: Playground character appears in the character grid

- **Status:** Orchestrator-confirmed.
- **Where:** `src/ts/globalApi.svelte.ts:2109`; `src/lib/Others/GridCatalog.svelte:35-60`
- **Claim:** The Playground chat is a normal saved character with `chaId` `'§playground'` (name "assistant", Utility Bot on; `src/lib/Playground/PlaygroundMenu.svelte:26-50`). `checkCharOrder()` keeps `'§playground'` and `'§temp'` out of `characterOrder`, so the sidebar doesn't show it. `GridCatalog`'s `formatChars()` loops over `db.characters` and only filters on `trashTime`, so the character shows in the grid, where it can be searched, opened and deleted.
- **Effect:** Users see an unexplained "assistant" character in the grid. Deleting it deletes the Playground chat history (a new one is created the next time Chat is opened).
- **Note:** `GridCatalog.svelte` has uncommitted changes in the working tree from another session. Coordinate before editing it.
- **Investigate:** Skip `'§playground'` and `'§temp'` in `formatChars()`, the same way `checkCharOrder()` does.

## PG-2: Prompt Convertion's Delete button does nothing

- **Status:** Orchestrator-confirmed.
- **Where:** `src/lib/Playground/ToolConversion.svelte:42`
- **Claim:** Each added file has a Delete button with no `onclick`. A wrongly added file can't be removed without leaving the tool.

## PG-3: Dead code

- **Status:** Reported.
- **Where:** `src/lib/Playground/PlaygroundMenu.svelte:157-159`; `src/lib/Playground/PlaygroundRegex.svelte`
- **Claim:** The `PlaygroundStore === 2` branch only contains a commented-out `<PlaygroundChat/>`, and can't render anyway because opening Chat also selects a character (the menu only renders while no character is selected, `DefaultChatScreen.svelte:638`). `PlaygroundRegex.svelte` is an empty file that nothing imports.
- **Investigate:** Remove both.

## PG-4: Embedding tool shares the live memory settings

- **Status:** Orchestrator-confirmed.
- **Where:** `src/lib/Playground/PlaygroundEmbedding.svelte:54-63` (`bind:value` on `supaMemoryKey` and `hypaCustomSettings.url/key/model`)
- **Claim:** The OpenAI and Custom options read and write the same key, URL and model settings that long-term memory uses. A change made while testing here silently changes chat memory too. This may be intended; the wiki page tells users.
