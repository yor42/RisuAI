# Character display (emotion images, image generation): suspected bugs

These were found while rewriting the [[Additional Character Screen]] wiki page. It is a hand-off list for a follow-up investigation, not user documentation.

Each entry is a **claim from reading the code**, not a reproduction. Nothing here has been run or tested.

Line numbers refer to the working tree at the time of writing (branch `fix/persistence-conflict-platform-hardening`, after commit `0291ea36`).

**Status values**

- **Reported**: a single reading of the code by a code-reader agent.
- **Orchestrator-confirmed**: the Orchestrator re-read the cited lines and agrees with the claim.

## Triage index

| ID | Severity | Status | One line |
|---|---|---|---|
| CD-1 | Low | Orchestrator-confirmed | `req.special.emotion` handling is unreachable; nothing sets `special` |
| CD-2 | Low | Orchestrator-confirmed | The `waifuMobile` theme branch can't be selected |
| CD-3 | Low | Orchestrator-confirmed | The emotion Inlay Screen box is labelled "Image Generation Instructions" |
| CD-4 | Low | Reported | Changing the mode or Inlay Screen silently resets hand-edited prompts |
| CD-5 | Low | Reported | `groupChat.emotionImages` may never be read |

---

## CD-1: Dead `special.emotion` path

- **Status:** Orchestrator-confirmed. The `special` field is declared on the response types (`src/ts/process/request/request.ts:72,80,87`) but no request code assigns it.
- **Where:** `src/ts/process/index.svelte.ts:2024-2047`
- **Investigate:** Remove the block and the type field, or find the provider that was meant to set it.

## CD-2: `waifuMobile` theme is unreachable

- **Status:** Orchestrator-confirmed. `'waifuMobile'` appears only at `src/lib/ChatScreens/ChatScreen.svelte:50`. The theme list (`src/ts/setting/displaySettingsData.svelte.ts:22-28`) offers Standard Risu, Waifulike, Mobile Chat, CardBoard and Custom HTML.
- **Investigate:** Remove the branch, or add it to the theme list.

## CD-3: Wrong label on the emotion instructions box

- **Status:** Orchestrator-confirmed.
- **Where:** `src/lib/SideBars/CharConfig.svelte:545-547`
- **Claim:** In Emotion Images mode with Inlay Screen on, the box bound to `newGenData.emotionInstructions` uses `language.imgGenInstructions` ("Image Generation Instructions"). Cosmetic; the wiki page mentions the shared label.
- **Investigate:** Add a dedicated label key (and translations).

## CD-4: Toggling the mode resets prompts

- **Status:** Reported.
- **Where:** `src/ts/process/inlayScreen.ts:52-96`
- **Claim:** `updateInlayScreen()` overwrites `newGenData` with mode defaults whenever the mode or Inlay Screen changes, so hand-edited instructions and prompts are lost without warning. Toggling back doesn't restore them. The wiki page warns users.
- **Investigate:** Only fill defaults when the fields are empty, or confirm before overwriting.

## CD-5: `groupChat.emotionImages` may be unused

- **Status:** Reported (not searched exhaustively).
- **Where:** `src/ts/storage/database.svelte.ts:1525`; `src/ts/characters.ts:44`
- **Claim:** The field exists on group chats and is initialized empty, but no read site was found. Group display uses each member's own emotion images.
