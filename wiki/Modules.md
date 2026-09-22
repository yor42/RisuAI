# Modules

A module is a reusable bundle of content that you can switch on for every chat, for one character, or for one chat. It is not a [[plugin|Plugin Docs]]. Plugins are JavaScript that extend the app. Modules only carry the same kinds of content a character card carries.

A module can hold:

- **Lorebook** entries (see [[Lorebook]]), added after the character's own lore.
- **Regex scripts** (see [[Regex Script]]).
- **Trigger scripts** (see [[Trigger Script]] and [[Lua Scripting]]).
- **Additional assets** (images, audio, video, fonts, CSS) that CBS asset tags can use (see [[CBS Assets]]).
- **Background Embedding**: HTML that is added to the chat background.
- **Custom Toggles**: switches that appear in the chat's side toggles.

<!-- src/ts/process/modules.ts:19-35, 430-508 -->

## Managing modules

Open **Settings → Modules**. The page lists every installed module and has a search box.

Each module row has these buttons:

- **Enable Globally** (globe icon): turns the module on for every character and chat. It is blue when on. It is amber when the module is not enabled globally but is enabled through **Module Integration** (see below).
- **Download** (share icon): exports the module. You choose **CharX (Recommended)** or **RisuM (Legacy)**.
- **Edit** (pen icon).
- **Remove** (trash icon), after a confirmation.

The buttons under the list, from left to right:

- **+**: creates an empty module and opens the editor.
- **Person icon**: switches the list into conversion mode. Clicking a module's person icon then adds a copy of the module to your characters.
- **Waypoints icon**: adds an MCP module (see [MCP modules](#mcp-modules)).
- **Upload icon**: imports a module file.

<!-- src/lib/Setting/Pages/Module/ModuleSettings.svelte:42-180 -->

### The module editor

The editor has five tabs.

- **Basic Info**: **Name**, **Description**, **Namespace**, **Hide Icon UI** and **Custom Toggles**.
- **Lore Book**: the module's lorebook entries and folders, with import and export.
- **Regex Script**: the **Background Embedding** box, then the module's regex scripts.
- **Trigger Script**: the module's triggers, plus the **Low Level Access** checkbox.
- **Additional Assets**: a table of asset names and files. Accepted files are png, webp, avif, gif, jpeg/jpg, svg, mp4, webm, mp3, ttf, otf, woff, woff2 and css.

<!-- src/lib/Setting/Pages/Module/ModuleMenu.svelte:151-316 -->

## Enabling a module

A module is active in a chat if it is enabled in any of these places:

1. **Globally**: the globe button in **Settings → Modules**.
2. **For the current chat**: open the chat menu next to the input box and choose **Modules**. Clicking a module's check button turns it on for this chat only (blue).
3. **For the current character**: in the same **Modules** window, right-click or long-press a module's check button. The module is then on in every chat with that character (violet).
4. **Through Module Integration**: **Settings → Chat Bot → Others → Module Integration** is a text box. Put module namespaces there, separated by commas (for example `module1,module2`). This setting is saved with prompt presets, so switching presets can switch modules. Only modules that have a **Namespace** can be enabled this way.

Globally enabled modules are greyed out in the chat's Modules window, because they are already on.

<!-- src/ts/process/modules.ts:398-427; src/lib/Setting/Pages/Module/ModuleChatMenu.svelte:60-120; src/lib/Setting/Pages/BotSettings.svelte:772-773 -->

### Order

When several modules are active, their lorebooks, regex scripts, triggers and toggles are combined in the order the modules were created or imported. This is not the order shown in **Settings → Modules**, which sorts by name, and it is not the order in which you enabled them. A module that is enabled in more than one place is only applied once.

<!-- src/ts/process/modules.ts:374-381; src/lib/Setting/Pages/Module/ModuleSettings.svelte:27-33 -->

## Fields in detail

### Namespace

An optional identifier that stays the same when a module is re-imported (the module's internal id changes on every import). It is used by **Module Integration** and by these CBS functions:

- `{{moduleenabled::namespace}}` (alias `module_enabled`): `1` if a module with that namespace is active, otherwise `0`.
- `{{moduleassetlist::namespace}}` (alias `module_assetlist`): the asset names of that module.

See [[CBS Functions]]. If you are not sure what to put, leave it blank.

<!-- src/ts/cbs.ts:1608-1638 -->

### Custom Toggles

Each line defines one control in the chat's side toggle panel:

```
key=Label
key=Label=select=Option A,Option B,Option C
key=Label=text
key=Label=textarea
key=Label=group
key=Label=groupEnd
key=Label=divider
key=Text=caption
```

A line with only `key=Label` is a checkbox. The value is stored as the global chat variable `toggle_<key>`, so scripts and CBS can read it (for example `{{getglobalvar::toggle_key}}`). The toggles of all active modules are shown together with the prompt preset's and the character's own custom toggles.

<!-- src/ts/util.ts:1059-1099; src/ts/process/modules.ts:490-502; src/lib/SideBars/Toggles.svelte:70-130 -->

### Hide Icon UI

If any active module has this checked, the character's chat icon is hidden.

### Background Embedding

The Background Embedding of every active module is joined and added to the chat background, the same way as a character's background embedding.

### Low Level Access

Triggers that come from a module run with the module's **Low Level Access** setting, whatever each trigger's own setting says. Low level access unlocks trigger effects that call the AI model or need heavy computing (for example running an LLM, image generation, alerts and similarity checks). When you import a module or a character card that has Low Level Access on, the app asks you to confirm first. Do not enable it unless you need these features.

<!-- src/ts/process/modules.ts:459-474, 306-311; src/ts/process/triggers.ts:1406-1541 -->

## Import and export

**Import** accepts:

- `.charx`: a character card, converted into a module.
- `.risum`: the legacy binary module format.
- `.json`: a module exported as JSON, a RisuAI lorebook export, a lorebook in another app's `entries` format, or a RisuAI regex export.
- `.lorebook`.

Every imported module gets a new internal id, so importing the same file twice gives two separate modules.

**Export** offers:

- **CharX (Recommended)**: the module is saved as a `.charx` character card.
- **RisuM (Legacy)**: the binary `.risum` format. Assets are stored separately inside the file and get new asset ids when imported again.

Converting a character into a module keeps its description, first message, alternate greetings and global note replacement as special lorebook entries, so converting it back to a character restores them.

<!-- src/ts/process/modules.ts:40-355; src/ts/interchangeability.ts -->

## MCP modules

An MCP module holds only the address of an MCP (Model Context Protocol) server. When it is active, the server's tools are made available to the model. MCP modules cannot be edited or exported, so their Download and Edit buttons are disabled.

<!-- src/ts/process/modules.ts:504-508; src/ts/process/mcp/mcp.ts -->

## Notes

- If a module asset has the same name as one of the character's own assets, the character's asset is used. See [[CBS Assets]].
- Large asset modules make saves and backups larger. Assets inside modules are never removed by unused-asset cleanup while the module exists.
- A persona made from a character or a module keeps an embedded module inside the persona. That embedded module is not applied to chats unless the same module is also installed in **Settings → Modules**.
- Some edits (for example to a module's lorebook or triggers) may not show in an open chat until the chat view refreshes. Switching chats or characters refreshes it.
