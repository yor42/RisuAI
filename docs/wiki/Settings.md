# Settings

Open Settings from the gear/menu icon in the main app chrome. On a wide window (700px or more) the sidebar and the page content sit side by side; below that width, opening Settings shows the sidebar menu first, and picking an entry replaces it with that page (a back arrow / the close button returns to the menu). This narrow-layout split is separate from **Mobile GUI** mode, which forces the same side-by-side-vs-stacked split regardless of width.
<!-- src/lib/Setting/Settings.svelte:28,35,193 -->

## Menu, in order

The sidebar shows these entries top to bottom. Each maps to a child page:

1. **Chat Bot** — [[Settings Chat Bot]]
2. **Persona** — [[Settings Persona]]
3. **Other Bots** — [[Settings Other Bots]]
4. **Display & Audio** — [[Settings Display]]
5. **Language** — [[Settings Language]]
6. **Accessibility** — [[Settings Accessibility]]
7. **Modules** — see [[Modules]]
8. **Plugin** — [[Settings Plugins]]
9. **Backup & Files** — [[Settings Backup and Files]]
10. **Hotkey** — [[Settings Hotkeys]] (this page's content only renders when the window is 768px wide or more)
11. **Advanced Settings** — [[Settings Advanced]]
12. Any plugin-defined menu entries a loaded plugin has registered
13. **Easy Panel** — see below, shown only with **Enable Risuai Pro Tools** on

<!-- src/lib/Setting/Settings.svelte:41-184 -->

### Lite mode

Lite is a build-time option (`VITE_RISU_LITE`), not a setting you can toggle in the app. On a Lite build, only **Language**, **Backup & Files** and **Hotkey** remain in the menu; everything else, including plugin-defined entries and Easy Panel, is hidden.
<!-- src/lib/Setting/Settings.svelte:41,89,117,136,185; src/ts/lite.ts -->

### (?) help icons, the flask icon and the warning-triangle icon

On the data-driven pages (currently Advanced Settings, plus the same shared renderer used elsewhere), each control can carry a **(?)** help icon that opens a popup with more explanation text. A flask icon next to a control marks it as experimental — this is a label only, and does not by itself decide whether the control is visible. Whether an experimental-flagged control is visible depends on that control's own separate condition. A warning-triangle icon replaces the (?) icon on controls that are unrecommended to change; those controls are also grouped behind a **Show Unrecommended** toggle so they are hidden until you turn that on.
<!-- src/ts/setting/utils.ts:17-22,64-67; src/lib/Others/Help.svelte:2 -->

### Use Legacy GUI

**Use Legacy GUI** (on the Display & Audio page) changes how sub-sectioned pages present their sections. With it off (default), a page like Chat Bot or Other Bots shows its sections as a row of tabs, one open at a time. With it on, the same sections are shown as individually collapsible, stacked accordion panels, each starting collapsed.
<!-- src/ts/storage/database.svelte.ts:1076; src/lib/Setting/Pages/BotSettings.svelte:113; src/lib/Setting/Pages/OtherBotSettings.svelte:25 -->

---

## Modules

The Modules page (see [[Modules]] for what a module contains) lists your installed modules, sorted by name for display only — this display sort does not change the order modules are stored or merged in. Each row has:

| Control | Does |
|---|---|
| Globe icon | Toggles the module on/off globally (adds/removes it from the list of always-enabled modules). Shown tinted if the module would already apply through namespace integration without being explicitly enabled. |
| Export icon | Choose CharX (current format) or legacy RisuM export. Disabled for MCP modules. |
| Edit (pencil) icon | Opens the module editor for that module. Disabled for MCP modules. |
| Delete (trash) icon | Confirms, then removes the module (and un-enables it first if it was globally enabled). |
| "+" | Creates a new, blank module and opens the editor on it immediately. |
| Character-conversion toggle | Swaps the row's icon set for a single "convert to character" button. |
| MCP import icon | Imports a module from an MCP source. |
| Filesystem import icon | Imports a module file from disk. |

<!-- src/lib/Setting/Pages/Module/ModuleSettings.svelte:27-36,56-175 -->

## Easy Panel

Easy Panel is a separate overlay, not a page in the sidebar's own content area — it opens on top of Settings when you click its menu entry, and only appears in the menu at all when **Enable Risuai Pro Tools** is on.

If the underlying requirements aren't already met (separate parameters enabled, matching model/preset flags set), Easy Panel shows a requirements banner with a single **Run** button in place of the **Models** tab; clicking it sets all five required flags at once. The banner only replaces the **Models** tab: the other tabs show their content whether or not the requirements are met. The four tabs are:

- **Models** — pickers for the main model, submodel, and four separate models (Long-Term Memory, Translator, Emotion Image, Others).
- **Parameters** — either a per-model override editor, or a per-category (Long-Term Memory / Translator / Emotion Image / Others) editor, depending on the Settings tab below.
- **Custom Models** — the same custom-model editor as Advanced Settings' Custom Models section.
- **Settings** — one checkbox that switches the Parameters tab between per-model and per-category mode.

<!-- src/lib/Others/ProTools/EasyPanel.svelte:21-147 -->

---

## Pages that are not in the menu

A few pages exist in the app's code but have no menu entry that opens them, so they cannot currently be reached through the sidebar:

- **Global Lorebook** — an editor for a global lorebook entry list.
- **Global Regex** — an editor for `db.globalscript`, a regex-entry list. Stated neutrally: this is not the regex list applied to chats. The list that actually runs during chat is the preset's **Regex Script**, found on **Chat Bot → Others** — see [[Settings Chat Bot]].

<!-- src/lib/Setting/Settings.svelte:196-234 (no branch reachable from any menu button for these); src/lib/Setting/Pages/GlobalRegex.svelte:11 -->
