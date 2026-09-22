# Plugin Docs

RisuAI plugins are user-supplied JavaScript (or TypeScript) files that extend the app: custom AI providers, chat/lorebook hooks, extra settings screens, buttons, MCP tools, TTS pre/post-processing, and more.

This page covers the plugin file format, how plugins are installed and sandboxed, and the permission system. For the full method-by-method API listing, see [[Plugin API Reference]].

## API versions

There have been three plugin API generations:

| Version | Status |
|---|---|
| **3.0** | Current. All new plugins should target this. |
| 2.1 | **Discontinued.** Cannot be newly installed. |
| 2.0 | **Discontinued.** Cannot be newly installed, and no longer executes even if already saved in a profile. |

New installs are gated on the `//@api` header at import time <!-- src/ts/plugins/plugins.svelte.ts:343-361 -->:

- `//@api 3.0` → accepted.
- `//@api 2.1` → the importer refuses with *"Your plugin specifies API version 2.1, which is outdated and no longer supported. Please update your plugin to use at least API version 3.0."* and nothing is installed. <!-- src/ts/plugins/plugins.svelte.ts:345-348 -->
- `//@api 2.0`, or no `//@api` header at all → refused the same way with a 2.0-specific message. <!-- src/ts/plugins/plugins.svelte.ts:349-353 -->

This gate only blocks **new imports/updates**. If a V2/V2.1 plugin is already present in an existing save (imported before this gate existed, or carried over from an older profile), it still loads: `loadPlugins()` partitions saved plugins by their stored `version` field and always calls the V2 loader for anything tagged `2` or `'2.1'`. See [Legacy (discontinued)](#legacy-v2--v21-discontinued) below for exactly what that loader does with them. <!-- src/ts/plugins/plugins.svelte.ts:419-430 -->

## Plugin file format

A plugin is a single `.js` (or `.ts`, transpiled on import with Sucrase) file. Metadata is declared with `//@`-prefixed comment lines, followed by the plugin's code.

```js
//@name my_plugin
//@display-name My Plugin
//@api 3.0
//@version 1.0.0
//@arg api_key string Your API key

Risuai.log("Hello from my_plugin!");
```

The importer scans **every line of the file** (not just a "header block") for lines starting with a recognized `//@` prefix <!-- src/ts/plugins/plugins.svelte.ts:184-317 -->, so directives are technically picked up wherever they appear. The one exception is `//@version`, which is rejected unless it appears within the first ~500 bytes of the file <!-- src/ts/plugins/plugins.svelte.ts:295-304 -->. In practice, put **all** metadata at the top of the file for readability and to guarantee `//@version` is caught.

### Metadata headers

| Header | Required | Meaning |
|---|---|---|
| `//@name <name>` | Yes | Internal, stable identifier. Used to key stored settings/arguments/storage — avoid renaming after publishing. <!-- src/ts/plugins/plugins.svelte.ts:185-192 --> |
| `//@api <version>` | Yes (in practice) | API version. Only `3.0` allows install; see [API versions](#api-versions). <!-- src/ts/plugins/plugins.svelte.ts:193-205 --> |
| `//@display-name <name>` | No | Friendly name shown in the plugin list UI. Can be changed freely. <!-- src/ts/plugins/plugins.svelte.ts:206-213 --> |
| `//@arg <name> <string\|int> [description/meta]` | No, repeatable | Declares a user-configurable argument. See [Argument metadata](#argument-metadata). <!-- src/ts/plugins/plugins.svelte.ts:239-278 --> |
| `//@link <https-url> [hover text]` | No, repeatable | Adds a link icon next to the plugin in the settings list. URL must start with `https`. <!-- src/ts/plugins/plugins.svelte.ts:215-238 --> |
| `//@update-url <https-url>` | No | URL checked for updates (must support CORS + HTTP `Range` requests — only the first 512 bytes are fetched for the version probe). Must be `https`. Requires `//@version` to also be set. <!-- src/ts/plugins/plugins.svelte.ts:280-293,324-327 --> |
| `//@version <semver>` | Required only if `//@update-url` is set | The plugin's own version, e.g. `1.0.0`. Must be `>= 0.0.1`. Must appear within the first ~500 bytes of the file. <!-- src/ts/plugins/plugins.svelte.ts:295-304,329-332 --> |
| `//@allowed-ipc <plugin-name> [more names...]` | No | Whitelists other plugins allowed to talk to/from this one over `addPluginChannelListener`/`postPluginChannelMessage`. <!-- src/ts/plugins/plugins.svelte.ts:306-316 --> |

Update checking (`checkPluginUpdate`) does a `Range: bytes=0-512` GET on `//@update-url`, regexes out a `//@version` line from the partial response, and compares it against the installed `//@version` using dotted-numeric comparison (`1.2.0` > `1.10.0` is false — it compares numerically per segment, not lexicographically). <!-- src/ts/plugins/plugins.svelte.ts:51-107 -->

### Argument metadata

Beyond the type (`string` or `int`), text after the type on an `//@arg` line can carry metadata using `{{key}}` / `{{key::value}}` tokens; anything left over becomes the argument's description. The settings UI understands the following keys: <!-- src/ts/plugins/plugins.svelte.ts:260-277 --> <!-- src/lib/Setting/Pages/PluginSettings.svelte:142-237 -->

- `{{name::Label}}` — overrides the field's display name.
- `{{placeholder::...}}` — input placeholder text.
- `{{textarea}}` — renders a multi-line text area instead of a single-line input (string args only).
- `{{checkbox}}` / `{{checkbox::Label}}` — renders as a checkbox (int args only; stores `"1"`/`"0"`).
- `{{radio::Label A|valueA,Label B|valueB}}` — renders as a radio group.
- `{{divider}}` / `{{divider::Section title}}` — draws a section divider before the field.

```js
//@arg mode string {{name::Mode}}{{radio::Fast|fast,Accurate|accurate}} Choose a processing mode
```

Argument names beginning with `hidden_` are parsed and stored like any other argument but are not rendered in the settings UI. <!-- src/lib/Setting/Pages/PluginSettings.svelte:142-145 -->

## Install, enable and update flow

- **Import**: the settings page's "+" button calls `importPlugin()` with no code, which opens a native file picker for `.js`/`.ts` files; plugins can also be imported programmatically by passing source text directly (used for updates and hot-reload). <!-- src/ts/plugins/plugins.svelte.ts:129-156 -->
- If a plugin with the same `//@name` already exists, the user is asked to confirm overwriting it. <!-- src/ts/plugins/plugins.svelte.ts:388-397 -->
- Newly imported/updated plugins are added to the plugin list and marked `enabled: true`, then `loadPlugins()` re-runs the whole plugin set. <!-- src/ts/plugins/plugins.svelte.ts:363-409 -->
- **Enable/disable**: the power-toggle button in the plugin list flips `plugin.enabled` and calls `loadPlugins()`; disabled plugins are filtered out before loading. <!-- src/lib/Setting/Pages/PluginSettings.svelte:97-104 --> <!-- src/ts/plugins/plugins.svelte.ts:419-430 -->
- **Remove**: deletes the entry from the plugin list and reloads. <!-- src/lib/Setting/Pages/PluginSettings.svelte:114-133 -->
- **Update**: if `//@update-url` is set, the UI polls it and offers a one-click reinstall via `updatePlugin()`, which re-imports the fetched source under `isUpdate: true` (the plugin name cannot change across an update). <!-- src/ts/plugins/plugins.svelte.ts:109-127,382-385 -->
- **Hot reload (dev mode)**: "Import plugin with hot reload" opens a live file handle via the File System Access API and re-imports the file automatically whenever it changes on disk, with `isHotReload: true`. Only API 3.0 plugins can be hot-reloaded. <!-- src/ts/plugins/apiV3/developMode.ts --> <!-- src/ts/plugins/plugins.svelte.ts:358-361 -->
- **Install from another plugin**: a plugin can propose installing other plugins by writing `plugins` into the object it passes to `setDatabase`. Each proposed plugin must already declare `//@api 3.0`, must not already be installed under the same name+script, and the user is shown a confirmation dialog per plugin before it's added. <!-- src/ts/plugins/plugins.svelte.ts:765-782,931-952 -->

## Sandbox model

V3 plugins run **inside a real, sandboxed `<iframe>`**, not in the main page. <!-- src/ts/plugins/apiV3/factory.ts:769-926 -->

- The iframe has `sandbox="allow-scripts allow-modals allow-downloads"` — no `allow-same-origin`, so the iframe's origin is opaque and it cannot reach the host's cookies/storage/DOM directly.
- Its Content-Security-Policy sets `connect-src 'none'` (no `fetch`/`XHR`/`WebSocket` from inside the iframe at all), `frame-src 'none'` (no nested iframes), `object-src 'none'`, and `script-src 'nonce-...' 'wasm-unsafe-eval'` (only the host-injected bootstrap script and WASM may run; arbitrary `<script>` injection is blocked). <!-- src/ts/plugins/apiV3/factory.ts:438 -->
- All communication with the host happens over `postMessage` RPC. The injected bootstrap script exposes a `window.risuai` (and `window.Risuai` alias) `Proxy` where **every property access returns an async caller** that round-trips to the host — this is why every plugin API call must be `await`ed, even ones that look synchronous on the host side. <!-- src/ts/plugins/apiV3/factory.ts:374-382 -->
- Network access from a plugin must go through `risuai.nativeFetch`/`risuai.addProvider`, which run on the host side; the iframe itself cannot make network requests because of `connect-src 'none'`.
- DOM access to the *real* app UI is only available through the `SafeElement`/`SafeDocument` wrapper objects returned by `getRootDocument()` (gated by the `mainDom` permission) — plugins get an RPC handle to specific elements, not the actual `document`. Element creation is limited to a fixed tag whitelist (unknown tags silently become `<div>`), `<a>` elements can only get a validated `http(s)` `href` via `createAnchorElement()`, custom attributes are restricted to an `x-` prefix, and `innerHTML`/`outerHTML` writes are passed through DOMPurify. <!-- src/ts/plugins/apiV3/v3.svelte.ts:64-392 -->
- A plugin's own iframe UI (built with the iframe's *real*, unrestricted `document`) is shown/hidden with `showContainer()`/`hideContainer()`.

## Legacy V2 / V2.1 (discontinued)

**Do not target V2 or V2.1 for new plugins.** They can no longer be installed, and V2.1 is explicitly called out in-app as unsafe. The in-app warning shown for any installed V2/V2.1 plugin reads: *"Plugin V2 and V2.1 is considered unsafe and will stop working in future versions. Please do not use these versions of plugins."* <!-- src/lang/en.ts:1629 --> <!-- src/lib/Setting/Pages/PluginSettings.svelte:53-59 -->

What actually happens today, for plugins already saved from before the gate existed:

- **V2.1** plugins still run: their source is passed through a static-analysis safety pass that blocklists `eval`, `new Function`, `sessionStorage`, and `cookieStore`, and rewrites `window`/`global`/`globalThis`/`self`/`top`/`parent`/`frames` to a restricted object. The code then runs via `new Function(...)` in the **main page context** — there is no iframe sandbox for V2/V2.1. <!-- src/ts/plugins/pluginSafety.ts --> <!-- src/ts/plugins/plugins.svelte.ts:890-903 -->
- **V2.0** plugins are not executed at all any more; the loader only logs a warning that the plugin was removed. <!-- src/ts/plugins/plugins.svelte.ts:904-909 -->

The old V2/V2.1 globals (`getArg`, `setArg`, `getChar`, `setChar`, `addProvider`, `addRisuScriptHandler`, `addRisuReplacer`, `addRisuChatListener`, `onUnload`, `risuFetch`, `nativeFetch`, `getDatabase`, `setDatabase`, `setDatabaseLite`, `safeLocalStorage`, `safeIdbFactory` (backed by prefixed `indexedDB` databases), `safeDocument`) are still wired up for compatibility, but plugin authors should not build anything new on them. <!-- src/ts/plugins/plugins.svelte.ts:496-815 -->

## Permission system

A number of V3 APIs are gated behind a runtime consent prompt, resolved by an internal `getPluginPermission(pluginName, kind, reconfirm)` helper: <!-- src/ts/plugins/apiV3/v3.svelte.ts:581-639 -->

| Permission kind | Gated APIs | Prompt |
|---|---|---|
| `db` | `getDatabase()` | *"Plugin {name} is requesting to access the full database, which may expose sensitive information."* |
| `mainDom` | `getRootDocument()` | *"...requesting to access the main Document..."* |
| `fetchLogs` | `getFetchLogs()` | *"...requesting to fetch logs, which may expose sensitive information."* |
| `replacer` | `addRisuReplacer()`, `addRisuChatListener()`, `registerBodyIntercepter()` | *"...requesting permission to replace content in the chat..."* |
| `provider` | the function registered via `addProvider()`, checked on every invocation | *"...requesting permission to access the provider..."* |
| `sendChat` | `sendChat()` | *"...requesting permission to send chat messages on your behalf..."* |
| `inlay` | `readInlay()` | *"...requesting permission to access the inlay..."* |

<!-- src/lang/en.ts:1622-1629 -->

Once the user answers, the decision is remembered for that plugin for the rest of the session so they aren't re-prompted on every call; some permissions (`db`, `provider`, `replacer`/chat-listener, `fetchLogs`... — anything passed `'periodically'`) additionally persist the grant to local storage and ask again automatically after 3 days. <!-- src/ts/plugins/apiV3/v3.svelte.ts:591-639 --> A denied prompt makes the gated call return `null`/`false` (or, for `addRisuReplacer`/`addRisuChatListener`, silently no-op) rather than throw.

Plugins can also proactively ask with `risuai.requestPluginPermission(kind)`.

**Not every powerful API is permission-gated** — notably `setDatabase()`/`setDatabaseLite()` (writing), `getCharacter()`/`setCharacter()`, `getCharacterFromIndex()`/`setCharacterToIndex()`, `getChatFromIndex()`/`setChatToIndex()`, and `runLLMModel()` currently have no consent prompt at all, even though `getDatabase()` (reading) does. Treat those as always-available.

## Known issue: writing to a non-selected character

`setCharacterToIndex(index, character)` and `setChatToIndex(characterIndex, chatIndex, chat)` write directly into the in-memory character list by index (the same indices you get back from `addRisuChatListener`'s `characterIndex`/`chatIndex`, or from `getCurrentCharacterIndex()`). <!-- src/ts/plugins/apiV3/v3.svelte.ts:884-891,947-957 -->

There's a known, not-yet-fixed issue where a write targeting a character other than the one currently open in the UI may not persist to disk until that character is opened at least once. This also applies to a `characters` array passed to `setDatabase()`/`setDatabaseLite()`. Until this is fixed, if a plugin needs to reliably persist a write, target the currently selected character (`getCurrentCharacterIndex()`) rather than an arbitrary index from a background listener.

## Minimal working V3 plugin

```js
//@name hello_world_plugin
//@display-name Hello World
//@api 3.0
//@version 1.0.0
//@arg greeting string {{name::Greeting text}} Text shown when the button is pressed

(async () => {
    await risuai.registerButton({
        name: 'Say Hello',
        icon: '👋',
        iconType: 'html',
        location: 'action',
        id: 'hello-world-button'
    }, async () => {
        const greeting = (await risuai.getArgument('greeting')) || 'Hello!';
        await risuai.alert(greeting);
    });

    await risuai.onUnload(() => {
        console.log('hello_world_plugin unloaded');
    });
})();
```

See [[Plugin API Reference]] for the complete list of available methods.
