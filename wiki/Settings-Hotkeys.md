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

<!-- src/ts/hotkey.ts:16-320 (handler), 29-37 (unmodified keys in text fields), 53-57 (control yields), 387-404 (hotkeyMatches); src/ts/hotkeyYield.ts:38-66 -->

## Ctrl+1 through Ctrl+9: quick preset switch

Separately from the table above, pressing **Ctrl+1** through **Ctrl+9** switches to your 1st through 9th saved preset (in whatever order your presets are stored in), showing a toast with the preset's name. The toast reads "Changed to Preset: <name>" (fixed English text). Nothing happens if you don't have that many presets, or while another alert/dialog is open. It is not blocked while a reply is generating. Only Ctrl needs to be held: Shift and Alt are not checked. This binding is fixed to digits 1–9 and is not itself listed as a rebindable row on this page. It runs only if no table hotkey used the key press.
<!-- src/ts/hotkey.ts:234-291,474-483 -->

## Default hotkeys

| Action | Default binding | What it does |
|---|---|---|
| Reroll | Ctrl+Alt+R | Clicks the **first** reroll button found on the page; does nothing if there is none. Refused silently (no message) while a send, reroll or auto mode is running, and while a prompt is waiting for an answer. |
| Undo Reroll | Ctrl+Alt+F | Clicks the first undo-reroll button. Refused silently under the same conditions as Reroll, and does nothing when there is no earlier reroll to go back to. |
| Translate | Ctrl+Alt+T | Clicks the translate button on the last message. |
| Remove | Ctrl+Alt+D | Clicks the remove button on the last message. |
| Edit | Ctrl+Alt+E | Clicks the edit button on the last message, then focuses its edit box. |
| Copy | Ctrl+Alt+C | Clicks the copy button on the last message. |
| Send | Ctrl+Alt+Enter | Clicks the send button. While a send is running the send button is replaced by the stop button, so this hotkey does nothing and does not stop the send. |
| Settings | Ctrl+S | Opens or closes Settings. |
| Home | Ctrl+H | Returns to the character list. Works while a reply is generating; the reply carries on in its own chat. |
| Quick Presets Select | Ctrl+P | Opens or closes the quick preset picker. |
| Quick Persona Select | Ctrl+E | Opens or closes the quick persona picker. |
| Quick Model Select | Ctrl+M | Listed and rebindable, but the global hotkey does nothing — there is no handler for this action. Inside the message box, Ctrl+M is a separate fixed shortcut that rerolls (see below). |
| Toggle CSS | Ctrl+. | Toggles Safe Mode (disables custom CSS) and refreshes the theme/CSS. |
| Previous Character | Ctrl+[ | Selects the previous character in a list of **all** characters sorted by name (not the sidebar order; the list includes groups and trashed characters). Does nothing when the open character is the first in that list. From Home or the Playground it selects the **last** one. It does nothing, silently, while any reply is generating. Restores a character from cold storage if needed, and can show "Cold storage data could not be loaded…" if that fails. |
| Next Character | Ctrl+] | The mirror of Previous Character: does nothing at the last character of the name-sorted list, and from Home or the Playground it selects the **first** one. Same silent refusal while a reply is generating. |
| Quick Menu | Ctrl+` | Opens a menu to jump to Presets, Persona or Loadout. |
| Quick Settings | Ctrl+Q | Opens or closes the quick-settings overlay. |
| Toggle Voice | Ctrl+V | Listed and rebindable, but pressing it currently does nothing — there is no handler for this action. |
| Toggle Log | Ctrl+L | Opens the request log viewer. |
| Preview Request | Ctrl+U | Builds and previews the prompt that would be sent, without sending it. Always uses up the key press. Refused while any reply is generating, while a send is starting, while a prompt is waiting, while a non-toast alert is showing, and at Home. |
| Toggle Webcam | Ctrl+W | Listed and rebindable, but pressing it currently does nothing — there is no handler for this action. |
| Focus Input | Space (no modifier) | Focuses the chat message box. Subject to the focused-control step-aside described above. |
| Scroll to Active Character | Ctrl+G | Scrolls the character sidebar to the active character. Removed from your hotkey list entirely if **Scroll to Active Character** is off in Advanced Settings. |
| Popup Editor | Ctrl+X | While typing in certain text areas, opens a full-size popup editor for that field's text and writes your edit back when it closes. |
| Loadout | Ctrl+O | Opens or closes the loadout picker. |

<!-- src/ts/defaulthotkeys.ts:10-146; src/ts/hotkey.ts:57-225 (dispatch), 124-173 (prev/next); src/ts/characters.ts:1003-1025; src/ts/process/composerActions.svelte.ts:422-430,501-538; src/ts/process/previewRunner.ts:30-38; src/lib/UI/GUI/TextAreaInput.svelte:70-98; src/ts/storage/database.svelte.ts (scrollToActiveChar filtered when enableScrollToActiveChar is false) -->

Quick Model Select, Toggle Voice and Toggle Webcam are shown on this page and can be rebound like any other hotkey, but for Toggle Voice and Toggle Webcam pressing the bound key does not currently do anything — there is no code anywhere that responds to them. Quick Model Select's global hotkey also does nothing; only the message box's own Ctrl+M (below) rerolls.

**Scroll to Active Character** only appears in the table (and only fires) while **Scroll to Active Character** is on in **Settings → Advanced Settings**. Turning that option off removes the row from your saved hotkey list.

## Message box keys

These belong to the message box, not the table above.

| Key | Main box | Translate box (shown with Auto Translate Input) |
|---|---|---|
| Enter, with **Send with Enter Key** on | Sends. Shift+Enter is a new line. Ignored while an input method (IME) is composing. | Sends (without Shift). |
| Enter, with **Send with Enter Key** off | Shift+Enter sends; Enter is a new line. | Nothing sends: Enter and Shift+Enter are both new lines. |
| Ctrl+M | Rerolls. Fixed, cannot be rebound, and does not depend on the Quick Model Select row. Shift or Alt held does not change it. | Same. |

Ctrl+M rerolls only while the message box has focus; elsewhere it does nothing. It is refused silently while a send, reroll or auto mode is running (including while the box is read-only during a send). Unlike the Reroll hotkey, it is not refused while a prompt is waiting for an answer.

<!-- src/lib/ChatScreens/DefaultChatScreen.svelte:608-622,734-745 -->
