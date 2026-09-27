# Settings: Persona

Part of [[Settings]]. Open **Settings → Persona**.

## Persona list

A grid of persona avatars. Click one to switch to it. Drag to reorder — dragging rewrites the stored order and re-resolves which persona is selected by a stable id (a persona dragged for the first time is given one if it doesn't already have one).
<!-- src/lib/Setting/Pages/PersonaSettings.svelte:21-56,72-85 -->

**"+"** opens a menu to create a new persona or import one.
<!-- src/lib/Setting/Pages/PersonaSettings.svelte:87-102 -->

## Selected persona

| Control | Default | Does |
|---|---|---|
| Portrait (click to change) | empty | Opens the image picker for this persona's icon. |
| Name | "User" | Free text; shown as your name in chat. |
| Note | empty | Only shown when **Persona Note** is on (**Settings → Advanced Settings → Persona Note**). A free-text field alongside the persona. |
| Description | empty | Free-text persona description. |
| Large Portrait | off | Checkbox. When on, switches this persona's portrait to a larger display size wherever the app shows persona portraits. |

<!-- src/lib/Setting/Pages/PersonaSettings.svelte:120-158; Note gate: src/lib/Setting/Pages/PersonaSettings.svelte:136, src/ts/storage/database.svelte.ts (personaNote field) -->

## Export / Import / Remove

| Control | Does |
|---|---|
| Export | Downloads the selected persona. |
| Import | Loads a persona from a file exported this way, adding it as a new persona. |
| Remove | Confirms first, then deletes the selected persona and switches to the first remaining one. Disabled while only one persona exists — you cannot remove your last persona. |

<!-- src/lib/Setting/Pages/PersonaSettings.svelte:142-157 -->
