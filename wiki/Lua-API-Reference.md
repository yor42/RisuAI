# Lua API Reference

Every function listed here is available as a global inside a Risu Lua script (see [[Lua Scripting]] for lifecycle, permissions, and examples). The **Call it as** column is the name you actually use in Lua. Some entries are wrapped automatically so they decode JSON or wait for a promise to resolve before returning to your script. <!-- src/ts/process/scriptings.ts:1247-1407 -->

Access levels, from the "permission tiers" section on [[Lua Scripting]]:
- **None** — works in every mode, including `editDisplay`.
- **Safe** — every mode except `editDisplay`.
- **EditDisplay** — `editDisplay` mode only. Also included wherever Safe is listed, since those bindings accept either access level.
- **Low-level** — requires low-level access to be turned on for the owning character/module, and is unavailable in edit-listener modes.

## Chat variables & state

| Call it as | Args | Returns | Access |
|---|---|---|---|
| `getChatVar(id, key)` | key: string | string value (or `"null"`) | None |
| `setChatVar(id, key, value)` | key, value: string | — | Safe + EditDisplay |
| `setChatVarChanged(id, key, value)` | key, value: string | `true` if the value actually changed, else nothing | Safe + EditDisplay |
| `getGlobalVar(id, key)` | key: string | string value from the chat-independent global variable store | None |
| `getState(id, name)` *(Lua shim)* | name: string | decoded Lua value from a `"__"+name` chat variable | None (delegates to `getChatVar`) |
| `setState(id, name, value)` *(Lua shim)* | name: string, value: any | — | Safe + EditDisplay (delegates to `setChatVar`) |
| `setStateChanged(id, name, value)` *(Lua shim)* | name: string, value: any | `true` if changed | Safe + EditDisplay |
<!-- src/ts/process/scriptings.ts:105-124, 1329-1342 -->

## Chat history

| Call it as | Args | Returns | Access |
|---|---|---|---|
| `getChat(id, index)` *(shim)* | index: number (supports negative/`.at()` indexing) | table `{role, data, time}` or `nil` | None |
| `getChatData(id, index)` | index: number | message text, or `''` | None |
| `getChatRole(id, index)` | index: number | `'user'`/`'char'`, or `''` | None |
| `getRecentChats(id, count)` *(shim)* | count: number | table array of the last `count` messages, `{role, data, time}` each | None |
| `getFullChat(id)` *(shim)* | — | table array of every message | None |
| `setFullChat(id, value)` *(shim)* | value: table array of `{role, data}` | replaces the whole chat message list | Safe |
| `getChatLength(id)` | — | number of messages | None |
| `setChat(id, index, value)` | index: number, value: string | overwrites message text at index | Safe |
| `setChatRole(id, index, value)` | index, value (`'user'` else treated as `'char'`) | — | Safe |
| `cutChat(id, start, end)` | start, end: number | slices the message array to `[start, end)` | Safe |
| `removeChat(id, index)` | index: number | removes one message | Safe |
| `addChat(id, role, value)` | role (`'user'` else `'char'`), value: string | appends a message | Safe |
| `insertChat(id, index, role, value)` | index, role, value | inserts a message at index | Safe |
| `getCharacterLastMessage(id)` | — | text of the most recent `char`-role message, falling back to the selected character's first message | None |
| `getUserLastMessage(id)` | — | text of the most recent `user`-role message, or `''` | None |
| `getAuthorsNote(id)` | — | the chat's author's note, or `''` | None |
<!-- src/ts/process/scriptings.ts:162-261, 979-1054, 730-732 -->

## Character & persona

| Call it as | Args | Returns | Access |
|---|---|---|---|
| `getName(id)` | — | selected character's name | None |
| `setName(id, name)` | name: string | throws if not a string | Safe |
| `getDescription(id)` | — | selected character's description; throws if it's a group | Safe |
| `setDescription(id, desc)` | desc: string | throws if it's a group; the type check on `desc` is broken (it checks an unrelated outer-scope variable instead of the `desc` parameter), so a non-string `desc` is not rejected and is assigned to the description as-is | Safe |
| `getCharacterFirstMessage(id)` | — | selected character's first message | None |
| `setCharacterFirstMessage(id, data)` | data: string | `true`/`false` | Safe |
| `getPersonaName(id)` | — | active persona's display name | None |
| `getPersonaDescription(id)` | — | persona prompt, CBS-parsed against the selected character | None |
| `getBackgroundEmbedding(id)` | — | selected character's background HTML content | Safe |
| `setBackgroundEmbedding(id, data)` | data: string | `true`/`false` | Safe |
| `getCharacterImage(id)` *(shim)* | — | `{{inlayed::id}}` CBS tag for the selected character's portrait, or `''` | None |
| `getPersonaImage(id)` *(shim)* | — | `{{inlayed::id}}` CBS tag for the active persona's icon, or `''` | None |
<!-- src/ts/process/scriptings.ts:651-755, 406-466, 1292-1298 -->

## Lorebook

| Call it as | Args | Returns | Access |
|---|---|---|---|
| `getLoreBooks(id, search)` *(shim)* | search: string, matched against a lore entry's comment/title | table array of matching entries (local chat lore + global lore + module lore), content CBS-parsed | None |
| `upsertLocalLoreBook(id, name, content, options)` | name, content: string; `options: {alwaysActive?, insertOrder?, key?, secondKey?, regex?}` | inserts/replaces a **local (per-chat)** lore entry named `name`; no-op for groups | Safe |
| `loadLoreBooks(id, reserve)` *(shim, awaits, low-level)* | reserve: number of tokens to hold back from the model's max context length | table array of `{role, data}` for every currently-active lore entry that fits the remaining budget | Low-level |
<!-- src/ts/process/scriptings.ts:758-866, 1271-1278 -->

## LLM requests

| Call it as | Args | Returns | Access |
|---|---|---|---|
| `LLM(id, prompt, useMultimodal, options)` *(shim)* | `prompt`: array of `{role, content}` (`system`/`sys`, `user`, `assistant`/`bot`/`char` all normalize); `useMultimodal`: bool, expands `{{inlay\|inlayed\|inlayeddata::x}}` tags into image attachments; `options: {streaming?}` | `{success, result}` using the main model | Low-level |
| `axLLM(id, prompt, useMultimodal, options)` *(shim)* | same as `LLM` | `{success, result}` using the auxiliary ("otherAx") model slot | Low-level |
| `simpleLLM(id, prompt)` | prompt: string | `{success, result}` object (no JSON round-trip needed) using the main model, no multimodal support | Low-level |
<!-- src/ts/process/scriptings.ts:506-649, 868-977, 1280-1290 -->

## Media / misc

| Call it as | Args | Returns | Access |
|---|---|---|---|
| `generateImage(id, value, negValue)` | value: prompt, negValue: negative prompt (default `''`) | `{{inlay::id}}` CBS tag, or an `'Error: ...'` string | Low-level |
| `similarity(id, source, value)` | source: string, value: string[] | array of `value` ranked by embedding similarity to `source` | Low-level |
| `request(id, url)` | url: string (see limits in [[Lua Scripting]]) | JSON string `{status, data}` | Low-level |
| `hash(id, value)` | value: string | hex SHA-256 digest | None |
| `getTokens(id, value)` | value: string | token count | Safe |
| `sleep(id, time)` | time: milliseconds | resolves `true` after the delay | Safe |
| `cbs(value)` *(no `id` argument at all)* | value: string | `value` run through the CBS parser against the selected character | None |
| `log(value)` *(Lua shim)* | any JSON-serializable Lua value | prints it to the browser console | None |
| `reloadDisplay(id)` | — | bumps the GUI reload counter | Safe |
| `reloadChat(id, index)` | index: number | bumps the reload counter for one chat message | Safe |
| `stopChat(id)` | — | marks the current generation to be stopped | Safe |
<!-- src/ts/process/scriptings.ts:125-404, 468-470, 292-311 -->

## Alerts

| Call it as | Args | Returns | Access |
|---|---|---|---|
| `alertError(id, value)` | string | — | Safe |
| `alertNormal(id, value)` | string | — | Safe |
| `alertInput(id, value)` | string prompt | the text the user typed | Safe |
| `alertSelect(id, value)` | `value: string[]` of options | the chosen option | Safe |
| `alertConfirm(id, value)` | string prompt | `true`/`false` | Safe |
<!-- src/ts/process/scriptings.ts:131-160 -->

## Edit-listener registration (Lua-side only)

| Call it as | Args | Notes |
|---|---|---|
| `listenEdit(type, func)` | `type` in `'editRequest' \| 'editDisplay' \| 'editInput' \| 'editOutput'`, `func(id, value, meta)` | registers `func` in an internal list; every registered function for the matching type runs in order, threading the value through each; throws for any other `type` |
<!-- src/ts/process/scriptings.ts:1300-1327 -->

## Not reachable from the current UI

A Python execution backend also exists internally, mirroring this Lua API, but there's currently no way to select it as a script language from the character or module editors. <!-- src/ts/process/scriptings.ts:41-49, 97-104, 1476-1564 -->

## See also

- [[Lua Scripting]] — lifecycle, permission model, sandbox limits, and examples.
- [[Trigger Script]] — where `triggerlua` fits among the trigger effect types.
