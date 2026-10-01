# Settings: Display

Part of [[Settings]]. Open **Settings → Display & Audio**. The page has three tabs: **Theme**, **Size and Speed** and **Others**. With **Use Legacy GUI** on (a checkbox on the Others tab), the three groups are stacked one after another with no tab bar and no accordions.

Note: which layout you see is decided once, when the page opens. Toggling **Use Legacy GUI** while the page is already open does not switch the layout live — reopen Settings to see the change.

<!-- src/lib/Setting/Pages/DisplaySettings.svelte:1-58; src/lang/en.ts:811,847,1298 -->

---

## Theme tab

| Setting | What it does | Default | Options/range |
|---|---|---|---|
| **Theme** | Chooses the whole chat-UI layout. | Standard Risu | Standard Risu, Waifulike, Mobile Chat, CardBoard, Custom HTML |
| **Define Custom GUI** (button) | Opens a drag-and-drop GUI-tree builder. | — | — |
| **Chat HTML** | Raw HTML template for each chat bubble. Supports the special tags `<risutextbox>`, `<risuicon>`, `<risubuttons>` and `<risugeninfo>` (documented in the field's own help text). | empty | free text |
| **Waifu Chat Width** | Width of the chat panel in Waifulike mode. | 100% | 50–200% |
| **Waifu Character Size** | Size of the character art in Waifulike mode. | 100% | 20–150% |
| **Color Scheme** | Picks a preset color palette (see below) or Custom. | — | see Color scheme presets |
| **Custom Color Scheme editor** | Nine color pickers plus a Light/Dark type selector; shown only when Color Scheme is set to Custom. | — | — |
| **Text Color** | Chooses the text-color palette used in chat. | Classic Risu | Classic Risu, High-Contrast, Custom |
| **Custom Text Theme editor** | Six color pickers (Normal, Italic, Bold, Italic Bold, Single Quote, Double Quote text); shown only when Text Color is Custom. The two quote-text colors can be left unset. | — | — |
| **Font** | Chooses the chat font. | Default | Default (Arial), Times New Roman, Custom |
| **Custom Font** (unlabelled text field under Font) | CSS `font-family` value, used as-is; shown only when Font is Custom. | empty | free text |

Note: **Define Custom GUI** is only shown when Theme is set to a value this button checks for, and the Theme dropdown does not currently offer that value — so this button does not currently appear.

<!-- src/ts/setting/displaySettingsData.svelte.ts:16-139; src/lang/en.ts:344,825,839,858-865,1273,1337-1338 -->

### Color scheme presets

The Color Scheme picker shows a grid of swatches, one per built-in preset, plus a **Custom** tile. Preset names are auto-formatted from their internal name (hyphens become spaces, each word capitalized) — for example `monokai-light` shows as "Monokai Light".

The 17 built-in presets: Default, Dark, Light, Cherry, Galaxy, Nature, Ocean, Aurora, Twilight, Realblack, Monokai Light, Monokai Black, Sky Light, Sage Light, Lavender Light, Slate Light, and Lite.

Clicking a swatch immediately applies it and updates the app's colors. Clicking **Custom** switches to `db.customColorScheme` and reveals the Custom Color Scheme editor above. The editor has Export/Import buttons that read and write a `colorScheme.json` file; importing a file missing any of the ten expected fields is rejected with an "Invalid color scheme" error.

Note: on the Lite build of the app, the Lite palette is always used for chat colors, regardless of which preset is selected here.

<!-- src/ts/gui/colorscheme.ts:36-333,270-273; src/lib/Setting/Pages/Display/ColorSchemeSelect.svelte; src/lib/Setting/Pages/Display/CustomColorSchemeEditor.svelte -->

---

## Size and Speed tab

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Chat Text Size** | Font size of the chat input box. | 100% | 50–200% |
| **Line Height** | Line spacing, combined with Chat Text Size. | 1.25 | 0.5–3 |
| **Icon Size** | Size of the character/user avatar boxes in chat. | 100% | 50–200% |
| **Input Area Size** | Height of the chat input box (Tiniest to Hugest, in named steps). | Default | -5 to 5 |
| **Input Area Text Size** | Text size inside the chat input box. | Default | 0–3 |
| **Sidebar Size** | Width of the sidebar. | 0 | 0–3 |
| **Asset Images Max Width** | Caps the width of additional-asset images rendered in chat. -1 means Unlimited (no cap); 0 means Hidden (images not shown); other values set the cap in rem. | -1 (Unlimited) | -1 to 40 |
| **Animation Speed** | Speed of UI transition animations. | 0.4 | 0–1 |
| **Memory Limit Thickness** | Thickness of the line marking the long-term-memory boundary in chat. Shown only when **Show Memory Limit** (Others tab) is on. | 1 | 1–500 |
| **Settings Close Button Size** | Size of the close (X) button in the Settings window's top-right corner. | 24 | 16–48 |

<!-- src/ts/setting/displaySettingsData.svelte.ts:144-247 -->

---

## Others tab

| Setting | What it does | Default |
|---|---|---|
| **Fullscreen** | Toggles fullscreen mode for the app window. | off |
| **Show Memory Limit** | Shows the long-term-memory boundary line in chat; reveals Memory Limit Thickness above. | off |
| **Show First Message Pages** | Shows a swipe-pager alongside a character's alternate greetings. | off |
| **Hide RisuRealm** | Hides the RisuRealm card from the main menu, including its placeholder shown before you accept upstream's terms ("Realm content comes from a service operated by upstream RisuAI. Agree to its terms to show it." / "Agree and show"). | off |
| **Hide All Images** | Replaces bot avatars, icons, asset images and RisuRealm cover images with a placeholder. | off |
| **Show Folder Name in Icon** | Overlays the folder name as centered text on its sidebar icon. | off |
| **Custom Background** | A checkbox that opens a file picker (png/webp/gif) for a custom app background when checked; unchecking clears it. | off |
| **Play Message Audio** | Plays a short sound when a character's reply finishes. | off |
| **Play Audio on Translate Completion** | Plays the same sound when an auto-translation finishes. | off |
| **Round Icons** | Rounds the corners of chat and sidebar avatars. | off |
| **Custom Text Screen Color** | A checkbox plus a color picker for the chat-text background box; unchecked leaves it at the built-in default. | off |
| **Text Outlines** | Adds an outline (text-shadow) to chat text. | off |
| **Round Text Screen** | Rounds the corners of the chat-text background box. | off |
| **Show Saving Icon** | Shows an animated badge while a save is in progress. | off |
| **Show Prompt Comparison** | Shows a diff-highlighting control in the bot-preset list. | off |
| **Text Screen Borders** | A checkbox plus a color picker for a border on the chat-text background box; same style as Custom Text Screen Color. | off |
| **Use Chat Message Copy** | Adds a copy-text button to each chat message. | off |
| **Use Additional Assets Preview** | Shows inline media previews for a character's or module's additional assets in the editor. | off |
| **Use Legacy GUI** | Stacks the three Display tabs into one page (see above), instead of tabbing them. | off |
| **Hide API Keys** | Masks API-key fields as password inputs across most provider settings (chat and image providers). See [[Settings Other Bots]] for which key fields this does and does not cover on that page. | on |
| **Disable Quote Formatting** | See Quote rendering below. | off |
| **Blockquote Styling** | See Quote rendering below. | off |
| **Custom Quotes** | See Quote rendering below. | off |
| **Leading Double Quote** | Character used as the opening `"` when Custom Quotes is on. | curly opening double quote |
| **Trailing Double Quote** | Character used as the closing `"` when Custom Quotes is on. | curly closing double quote |
| **Leading Single Quote** | Character used as the opening `'` when Custom Quotes is on. | curly opening single quote |
| **Trailing Single Quote** | Character used as the closing `'` when Custom Quotes is on. | curly closing single quote |
| **Beta Mobile GUI** | Uses a beta mobile layout on screens narrower than 800px. Requires a refresh to take effect. | off |
| **Menu Side Bar** | Shows a desktop-style icon sidebar column. | off |
| **Notification** | Requests browser notification permission when checked; if the OS or browser denies it, shows an error and unchecks itself. | off |
| **Use Chat Sticker** | Enables chat stickers. Shown only when **Show Unrecommended** is on — see [[Settings Advanced]]. | off |
| **Custom CSS** | See Custom CSS below. | empty |

The four Leading/Trailing quote fields are shown only when **Custom Quotes** is on.

<!-- src/ts/setting/displaySettingsData.svelte.ts:250-371; src/ts/storage/database.svelte.ts:562; src/lib/UI/MainMenu.svelte:193; src/lang/en.ts -->

### Quote rendering

**Disable Quote Formatting**, **Blockquote Styling** and **Custom Quotes** interact as follows:

- If **Disable Quote Formatting** is on, quotes render as plain characters with no special styling, and **Blockquote Styling** has no effect even if it is also on.
- Otherwise, if **Blockquote Styling** is on, quoted spans (double-quoted text, and single-quoted text nested inside it) are wrapped in styled markup so they can be picked out visually.
- If neither is on (the default), quotes keep the built-in inline quote colouring (`risu-mark="quote1"` / `"quote2"`), without the separate blockquote-style paragraphs that **Blockquote Styling** adds.

**Custom Quotes** is independent of the two settings above: it only chooses *which characters* count as quote marks. When it is off, the app's built-in curly quote pair is used. When it is on, the four Leading/Trailing quote fields supply the characters instead.

<!-- src/ts/parser/parser.svelte.ts:151-188 -->

### Custom CSS

**Custom CSS** (Others tab) is a free-text CSS block applied to the app. If a stylesheet breaks the UI, press **Ctrl + .** (the default **Toggle CSS** hotkey, see [[Settings Hotkeys]]) to switch Safe Mode on or off; Safe Mode turns Custom CSS off without deleting it.

Note: while Safe Mode is on, Custom CSS is not applied, whatever the saved text is.
<!-- src/ts/defaulthotkeys.ts:78-82; src/ts/hotkey.ts:92-96; src/ts/gui/colorscheme.ts:407-412 -->

<!-- src/ts/gui/colorscheme.ts:407-412; src/lang/en.ts:220 -->

---

## Related

- [[Settings Other Bots]] — where most API keys live, and exactly which key fields **Hide API Keys** does and doesn't mask on that page.
- [[Settings Advanced]] — the **Show Unrecommended** toggle that gates **Use Chat Sticker** above.
- [[Settings Chat Bot]] — the Chat Formating / Jinja Template block, which is not part of this page.
