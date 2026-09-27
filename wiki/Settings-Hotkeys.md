# Settings: Hotkey

Part of [[Settings]]. Open **Settings → Hotkey**.

This page needs a window at least 768px wide. Below that width the pane opens but stays blank — the page's own "screen too small" message never actually shows, because Settings itself refuses to mount the Hotkey page below that width in the first place.
<!-- src/lib/Setting/Settings.svelte:230; src/lib/Setting/Pages/HotkeySettings.svelte:8-11 -->

## The table

One row per saved hotkey (a fresh install starts with the defaults below; the list can differ from the defaults if an action was added or removed since your data was created).

| Column | Does |
|---|---|
| Ctrl / Shift / Alt toggles | Three buttons per row; click to flip whether that modifier is required. There's no check for a binding that collides with another hotkey. |
| Key | Click, then press a key to rebind. The very next keydown is captured, including keys like Tab, Escape or Space (shown as "SPACE") — whatever you press becomes the new binding. |

<!-- src/lib/Setting/Pages/HotkeySettings.svelte -->

## When a hotkey does and doesn't fire

- While you're typing in a text field, a hotkey that requires no modifier (Ctrl/Alt/Shift) does not fire — only modified hotkeys do.
- If a button, dropdown, link or similar control currently holds keyboard focus, a bare (unmodified) **Space** or **Enter** press activates that control instead of running a hotkey bound to the same key — this only applies when the focus got there by keyboard (not just a mouse click).
- Otherwise, matching requires an exact match on which modifiers are held; there's no partial/loose matching.

<!-- src/ts/hotkey.ts:14-22,331-348; src/ts/hotkeyYield.ts -->

## Ctrl+1 through Ctrl+9: quick preset switch

Separately from the table above, pressing **Ctrl+1** through **Ctrl+9** switches to your 1st through 9th saved preset (in whatever order your presets are stored in), showing a toast with the preset's name. Nothing happens if you don't have that many presets, or while another alert/dialog is open. This binding is fixed to digits 1–9 and is not itself listed as a rebindable row on this page.
<!-- src/ts/hotkey.ts:188-244,418-427 -->

## Default hotkeys

| Action | Default binding | What it does |
|---|---|---|
| Reroll | Ctrl+Alt+R | Clicks the reroll button on the last message. |
| Undo Reroll | Ctrl+Alt+F | Clicks the undo-reroll button. |
| Translate | Ctrl+Alt+T | Clicks the translate button on the last message. |
| Remove | Ctrl+Alt+D | Clicks the remove button on the last message. |
| Edit | Ctrl+Alt+E | Clicks the edit button on the last message, then focuses its edit box. |
| Copy | Ctrl+Alt+C | Clicks the copy button on the last message. |
| Send | Ctrl+Alt+Enter | Clicks the send button. |
| Settings | Ctrl+S | Opens or closes Settings. |
| Home | Ctrl+H | Returns to the character list. |
| Quick Presets Select | Ctrl+P | Opens or closes the quick preset picker. |
| Quick Persona Select | Ctrl+E | Opens or closes the quick persona picker. |
| Quick Model Select | Ctrl+M | Listed and rebindable, but pressing it currently does nothing — there is no handler for this action. |
| Toggle CSS | Ctrl+. | Toggles Safe Mode (disables custom CSS) and refreshes the theme/CSS. |
| Previous Character | Ctrl+[ | Selects the previous character in the name-sorted list. Currently does nothing when the open character is first or last in that list. |
| Next Character | Ctrl+] | Selects the next character in the name-sorted list. Currently does nothing when the open character is first or last in that list. |
| Quick Menu | Ctrl+` | Opens a menu to jump to Presets, Persona or Loadout. |
| Quick Settings | Ctrl+Q | Opens or closes the quick-settings overlay. |
| Toggle Voice | Ctrl+V | Listed and rebindable, but pressing it currently does nothing — there is no handler for this action. |
| Toggle Log | Ctrl+L | Opens the request log viewer. |
| Preview Request | Ctrl+U | Builds and previews the prompt that would be sent, without sending it. Does nothing while a response is already generating for the current character. |
| Toggle Webcam | Ctrl+W | Listed and rebindable, but pressing it currently does nothing — there is no handler for this action. |
| Focus Input | Space (no modifier) | Focuses the chat message box. Subject to the focused-control step-aside described above. |
| Scroll to Active Character | Ctrl+G | Scrolls the character sidebar to the active character. Removed from your hotkey list entirely if **Scroll to Active Character** is off in Advanced Settings. |
| Popup Editor | Ctrl+X | While typing in certain text areas, opens a full-size popup editor for that field's text and writes your edit back when it closes. |
| Loadout | Ctrl+O | Opens or closes the loadout picker. |

<!-- src/ts/defaulthotkeys.ts:9-149; src/ts/hotkey.ts:40-173; src/lib/UI/GUI/TextAreaInput.svelte:70-98; src/ts/storage/database.svelte.ts (scrollToActiveChar filtered when enableScrollToActiveChar is false) -->

Quick Model Select, Toggle Voice and Toggle Webcam are shown on this page and can be rebound like any other hotkey, but pressing the bound key does not currently do anything — there is no code anywhere that responds to these three actions.

**Scroll to Active Character** only appears in the table (and only fires) while **Scroll to Active Character** is on in **Settings → Advanced Settings**. Turning that option off removes the row from your saved hotkey list.
