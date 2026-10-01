# Settings: Plugin

Part of [[Settings]]. Open **Settings → Plugin**. See [[Plugin Docs]] for how to write a plugin.

## Plugin list

Each installed plugin is a row. Click the row's header to expand or collapse its argument list.

| Element | Shown when | Does |
|---|---|---|
| "Hot" badge | The plugin is currently hot-reloading | Indicator only. |
| Version-2 warning icon | The plugin declares API version 2 or 2.1 | Opens a warning explaining the version gap. |
| Custom link icon(s) | The plugin declares one or more `customLink` entries with an http(s) URL | Opens that link in a new tab. |
| Update-available icon | The plugin has an `updateURL` and a check finds a newer version | Confirms, then updates the plugin. |
| Enable/disable (power icon) | Always | Toggles the plugin on or off and reloads plugins. |
| Remove (trash icon) | Always | Confirms, then removes the plugin. If it was the currently selected plugin provider, that selection is cleared too. |

<!-- src/lib/Setting/Pages/PluginSettings.svelte:35-130 -->

## Version 1 plugins

A V1 plugin shows a fixed warning that the app expects API V3, instead of an argument editor. V1 plugin arguments are not editable from this page.
<!-- src/lib/Setting/Pages/PluginSettings.svelte:135-140 -->

## Argument editor (V2/V3 plugins)

For a V2 or V3 plugin, each declared argument (except ones whose name is prefixed `hidden_`) gets a control based on its type:

| Argument shape | Control shown |
|---|---|
| An array value | Select dropdown |
| `"string"` type | Text field, or a textarea, or a group of radio buttons |
| `"int"` type | Number field, checkbox, or a group of radio buttons |

A divider line can be inserted before an argument if the plugin marks it. A radio-button group is built from a comma-then-pipe-separated list of `label|value` pairs the plugin supplies.
<!-- src/lib/Setting/Pages/PluginSettings.svelte:142-240 -->

## Adding plugins

| Control | Does |
|---|---|
| "+" | Opens the plugin import dialog. |
| Code icon (menu) | Choose "Import plugin with hot reload" (loads the plugin's files with hot reload enabled — useful while developing one), "Download plugin template" (downloads a starter plugin project archive), or Cancel. |

<!-- src/lib/Setting/Pages/PluginSettings.svelte:246-276 -->
