# Lua Scripting

RisuAI can run a sandboxed Lua VM ([wasmoon](https://github.com/ceifa/wasmoon)) attached to a character, a [[Trigger Script]], or a module. Lua is the most powerful scripting surface in Risu: it can read and rewrite the chat log, character fields, persona fields, lorebooks, and can call the LLM itself, subject to a permission system described below.

This page covers the Lua runtime itself. For *when* Lua code runs as part of a trigger, and how it compares to the block-based V1/V2 trigger formats, see [[Trigger Script]]. For the `{{...}}` macro language, see [[Curly Brased Syntaxes]].

> Almost every Lua binding that reads or writes "the character" or "the persona" acts on the **currently selected character** in the app, not necessarily the character/module that owns the running script. This matters most for modules, which can be attached to many characters at once. <!-- src/ts/process/scriptings.ts:652-666, 673-675, 685-686, 708-709, 724-725, 739-740, 749-750 -->

## Where Lua code lives

A Lua script is stored as a single [[Trigger Script]] entry whose first (and only) effect has `type: "triggerlua"`, holding the whole script as one string of code. <!-- src/ts/process/triggers.ts:58-61 -->

- **Character scripts**: stored on the character. The "Lua" button in the trigger editor replaces the whole trigger list with one `triggerlua` entry. <!-- src/lib/SideBars/Scripts/TriggerList.svelte:64-83 -->
- **Module scripts**: modules can ship their own Lua trigger the same way, and it applies to every character the module is attached to. <!-- src/ts/process/modules.ts:25-27, 459-472 -->
- Group chats have no triggers of their own; only module-provided Lua scripts and triggers run for them. <!-- src/ts/process/scriptings.ts:1427, 1455-1458 -->

## Execution model

- Each *mode* (`start`, `input`, `output`, `manual`/button, `editRequest`, `editDisplay`, `editInput`, `editOutput`, …) gets its own persistent Lua VM instance, and only one call for a given mode runs at a time. <!-- src/ts/process/scriptings.ts:48-50, 78-80, 1216-1245 -->
- The VM is only recreated when the script's code changes; otherwise the same globals persist across calls, so state kept in your own Lua globals or upvalues survives between invocations of the same mode. <!-- src/ts/process/scriptings.ts:84-91, 1063 -->
- Every call re-declares all host functions before running your code, then invokes the entry point for the current mode. Uncaught Lua errors are caught and logged to the console; they do not crash the app, but the trigger's return value is left `undefined`. <!-- src/ts/process/scriptings.ts:1130-1132 -->
- Lua's own `require 'json'` module is preloaded and exposed as the global `json` table (`json.encode`, `json.decode`) — you can use it directly in your own code. <!-- src/ts/process/scriptings.ts:1176-1194, 1249 -->
- An `async(callback)` helper is defined for you; wrap a function with it to write coroutine-based code that can `:await()` a promise-returning host call. Some bindings, such as `loadLoreBooks`, `LLM`, and `getCharacterImage`, are only usable this way. <!-- src/ts/process/scriptings.ts:1276-1298, 1344-1372 -->
- A companion Python engine exists in the same module, but it isn't reachable from the character/module editors today. <!-- src/ts/process/scriptings.ts:41-49, 97-104, 1476-1564 -->

## Lifecycle / entry points

Your script defines global functions that the host calls by name. Which one fires depends on the `mode` the trigger pipeline is running:

| Global function you define | Fired when | Argument(s) | Return value meaning |
|---|---|---|---|
| `onStart(id)` | A new chat/generation round starts (trigger mode `start`) | access token | returning `false` stops the AI from sending/generating <!-- src/ts/process/scriptings.ts:1127-1129 --> |
| `onInput(id)` | Right before the user's message is added to the chat (trigger mode `input`) | access token | `false` stops sending |
| `onOutput(id)` | Right after the character's reply is produced (trigger mode `output`) | access token | `false` stops sending |
| `onButtonClick(id, data)` | An in-chat HTML element with a `risu-btn="..."` attribute is clicked, or another script calls the "Lua button" trigger path | access token, the raw string from `risu-btn` | value returned to the caller |
| any other name, e.g. `onMyEvent(id)` | A **manual** trigger is invoked whose name equals the function name — see "Manual triggers call a same-named Lua function" below | access token | `false` stops sending |
| `listenEdit(type, func)` (call this at the top level, not a callback Risu calls) | Registers `func` to run for `type` in `{'editRequest','editDisplay','editInput','editOutput'}` | — | — |

Dispatch table for the above: <!-- src/ts/process/scriptings.ts:1079-1126, 1374-1403 -->

- `mode === 'input'` → calls global `onInput(id)`
- `mode === 'output'` → calls global `onOutput(id)`
- `mode === 'start'` → calls global `onStart(id)`
- `mode === 'onButtonClick'` → calls global `onButtonClick(id, data)`
- `mode` is one of `editRequest` / `editDisplay` / `editInput` / `editOutput` → replays every function registered with `listenEdit(type, func)` for that type, threading the value through each one in registration order
- anything else → calls the global function whose **name is exactly the mode string** (see manual triggers below)

### Manual triggers call a same-named Lua function

A Lua-mode trigger entry is exempt from the normal "does this trigger's `type` match the current mode" check — a `triggerlua` effect runs on **every** `start`/`input`/`output`/`manual` pass, and your script tells the modes apart by which global function it defines. <!-- src/ts/process/triggers.ts:1238-1240, 1559-1573 -->

When a **manual** trigger is invoked by name (via the `/trigger name` chat command, a `risu-trigger="name"` HTML attribute, or another trigger's "Run Trigger" effect), the Lua runtime is called with `mode` set to that trigger's *name*, not the literal string `manual`. <!-- src/ts/process/triggers.ts:1562 --> That means:

```lua
-- fires for the manual trigger named "Heal"
function Heal(id)
    setChatVar(id, "hp", "100")
end
```
will run whenever something invokes a manual trigger named `Heal`, from the *same* trigger entry that also defines `onStart`/`onInput`/etc. All of these can live in one script.

`editRequest`/`editDisplay`/`editInput`/`editOutput` triggerlua effects are filtered out of `display`/`request`-mode trigger runs, so a whole-script Lua trigger never runs during those two modes. <!-- src/ts/process/triggers.ts:1333-1336, 985-1036 -->

### `listenEdit` (text/prompt editing hooks)

Instead of a single fixed function, register as many editors as you like:

```lua
listenEdit('editOutput', function(id, content, meta)
    return content .. "\n(edited by Lua)"
end)
```

| Type | Fires on | Payload shape | Used when |
|---|---|---|---|
| `editInput` | the user's typed message | plain string | before the message is pushed to chat <!-- src/ts/process/scripts.ts:26-27, 99-134 --> |
| `editOutput` | the character's generated message | plain string | after generation, once per finalize/regenerate/continue path <!-- src/ts/process/index.svelte.ts:1670,1729,1755,1819,1823 --> |
| `editDisplay` | the message text right before it is rendered in the chat UI (does not persist) | plain string | called from the CBS/markdown renderer <!-- src/ts/parser/parser.svelte.ts:783 --> |
| `editRequest` | the **entire formatted prompt** sent to the model | JSON array of `{role, content}` (you get/return a Lua table after `json.decode`/`json.encode` in the wrapper) | right before the request is sent to the API <!-- src/ts/process/index.svelte.ts:1506, 1509 --> |

`editprocess` (used when re-flattening stored history into prompt text) bypasses Lua entirely — the content is returned unchanged for that mode, so `listenEdit` cannot see it. <!-- src/ts/process/scriptings.ts:1420-1422 -->

Each edit-listener call decodes/encodes its payload as JSON, so returning a value of the wrong shape (e.g. a string from an `editRequest` handler, which expects an array) will surface as a JSON error, and Risu falls back to the original content since the error is swallowed. <!-- src/ts/process/scriptings.ts:1424-1449, 1374-1403 -->

## Permission tiers and the `id` token

Every host function receives an `id` string as its first argument — the "access key" minted per invocation. <!-- src/ts/process/scriptings.ts:1065 --> Bindings check this key against one or more access levels before doing anything:

| Access level | Granted when | What it unlocks |
|---|---|---|
| Safe | any mode **other than** `editDisplay` | chat mutation (`setChat`, `addChat`, `cutChat`, …), `stopChat`, alerts, `sleep`, `reloadDisplay`/`reloadChat`, character/persona field setters, `getTokens`, lorebook editing | <!-- src/ts/process/scriptings.ts:1065-1074 -->
| EditDisplay | mode is `editDisplay` only | *just* `setChatVar`/`setChatVarChanged` (chat-variable writes) — nothing else the Safe level allows | <!-- src/ts/process/scriptings.ts:1066-1067, 108-121 -->
| Low-level | non-`editDisplay` mode **and** the owning trigger/character/module has low-level access turned on | `similarity`, `request` (outbound HTTP), `generateImage`, `LLM`/`simpleLLM`/`axLLM`, `loadLoreBooks` | <!-- src/ts/process/scriptings.ts:1071-1073, 314-390, 511-649, 825-828, 868-875 -->

A handful of read-only getters (`getChatVar`, `getGlobalVar`, `getChat`, `getChatData`, `getChatRole`, `getFullChat`, `getRecentChats`, `getChatLength`, `getName`, `getCharacterFirstMessage`, `getPersonaName`, `getAuthorsNote`, `getCharacterImage`, `getPersonaImage`, `hash`, `cbs`, `getCharacterLastMessage`, `getUserLastMessage`, `getLoreBooks`) have no access check at all and work in every mode, including `editDisplay`. See [[Lua API Reference]] for the per-function breakdown.

Low-level access comes from whichever object owns the trigger: a character's own low-level access toggle, or a module's low-level access toggle, which applies to every trigger the module ships and prompts the user for confirmation on import. <!-- src/ts/process/triggers.ts:1073, 1081-1084; src/ts/process/modules.ts:306-311, 459-471 --> Editing (`editRequest`/`editDisplay`/`editInput`/`editOutput`) always runs without low-level access, even for a low-level-enabled character. <!-- src/ts/process/scriptings.ts:1436 -->

Each access key is single-use: it is added to the relevant set right before your entry point is invoked and deleted right after, so you cannot cache and reuse an `id` from a previous call. <!-- src/ts/process/scriptings.ts:1065-1074, 1166-1167 -->

## Chat/variable access

- `getChatVar`/`setChatVar`/`setChatVarChanged` read and write the **same** per-chat variable store the [[Trigger Script]] `$var` system uses, so a Lua script and a V1/V2 trigger can share state through ordinary variable names. <!-- src/ts/process/scriptings.ts:105-121; src/ts/parser/chatVar.svelte.ts:6-40; src/ts/process/triggers.ts:1181-1232 -->
- `getState`/`setState`/`setStateChanged` are Lua-side conveniences that JSON-encode structured values into a separate `"__"+name`-prefixed variable, so they don't collide with plain `$name` trigger variables. <!-- src/ts/process/scriptings.ts:1329-1342 -->
- `getGlobalVar` reads a chat-independent global variable, with an optional per-chat "locally set" override. There's no matching Lua setter for it. <!-- src/ts/process/scriptings.ts:122-124; src/ts/parser/chatVar.svelte.ts:58-64 -->
- Chat message accessors (`getChat`/`getChatData`/`getChatRole`/`getFullChat`/`getRecentChats`/`getChatLength`) operate on the chat object the current script invocation was given, which isn't necessarily "the" active chat if the caller supplied a different one. <!-- src/ts/process/scriptings.ts:162-260 -->

## Limits and sandboxing

- `request(id, url)`: GET only, HTTPS only, URL capped at 120 characters, and `https://realm.risuai.net` / `https://risuai.net` / `https://risuai.xyz` are always rejected; capped at 5 requests per rolling 60-second window **shared across every script in the process**, not per-script. <!-- src/ts/process/scriptings.ts:323-390 -->
- `similarity`, `LLM`/`axLLM`/`simpleLLM`, `generateImage`, `loadLoreBooks` all require low-level access (see table above) in addition to whatever cost/rate limits the underlying feature (embeddings, image generation, model calls) already has.
- Errors from Lua's `error()`, or thrown inside a binding itself (e.g. `setName` on a non-string, `setDescription` on a group chat), are caught and just logged — they do not show a message to the user by default. <!-- src/ts/process/scriptings.ts:663-666, 690-695, 1130-1132 -->
- The VM has no filesystem or arbitrary network access beyond the vetted `request` function; everything else is mediated through the host functions listed above.

## Worked examples

**Greet once per chat, using shared trigger variables:**
```lua
function onStart(id)
    if getChatVar(id, "greeted") ~= "true" then
        setChatVar(id, "greeted", "true")
        addChat(id, "char", "*waves hello*")
    end
end
```

**A button that rerolls a stat and shows it:**
```lua
function onButtonClick(id, data)
    if data == "reroll" then
        local roll = math.random(1, 20)
        setChatVar(id, "lastRoll", tostring(roll))
        alertNormal(id, "You rolled " .. roll)
    end
end
```
Triggered from chat HTML: `<button risu-btn="reroll">Reroll</button>`.

**Rewrite the outgoing prompt (`editRequest`) to inject a note before the last message:**
```lua
listenEdit('editRequest', function(id, messages, meta)
    table.insert(messages, #messages, {role = "system", content = "Stay in character."})
    return messages
end)
```

## See also

- [[Trigger Script]] — the condition/effect system Lua triggers live inside, and the V1/V2 block-scripting alternatives.
- [[Lua API Reference]] — the full list of host functions, arguments, return values, and required access level.
- [[Curly Brased Syntaxes]] — the `{{...}}` macro language `cbs(text)` runs.
