# Settings: Advanced

Part of [[Settings]]. Open **Settings → Advanced Settings**. The page shows a warning banner ("Warn: If you don't know what the option does, don't change it!") and then a flat list of controls — there are no tabs.
<!-- src/ts/setting/advancedSettingsData.ts:6-7 -->

This page is built from one data table (`advancedSettingsItems`) rather than hand-written per field.
<!-- src/ts/setting/advancedSettingsData.ts:5-259 -->

A few things apply across the whole page:

- **Help (?) icons** open a text popup with more detail. Not every setting has one.
- Some fields have no help-key entry in the English strings and fall back to their own hard-coded label. Those labels are **not translated** and appear in English even when the app language is set to something else. They are marked below.
- A flask icon marks a setting as experimental, but the icon itself does not hide anything — whether a setting is shown at all is controlled separately by the **Use Experimental** and **Show Unrecommended** checkboxes described below. A few flask-marked settings (**OpenAI Flex Processing**, **Claude Batching**, **Persona Note**) are always visible regardless of the **Use Experimental** checkbox; only the icon is shown.
- Settings are grouped below by what they affect. On the actual page they appear in one continuous list, in the order the underlying data table defines them, not in these groups.

---

## Prompting, lorebook & chat flow

| Setting | Field | What it does | Default | Range/options | Shown when |
|---|---|---|---|---|---|
| **Lorebook Search Depth** | `loreBookDepth` | Number of recent messages scanned for lorebook key matches, unless a character overrides it with its own scan depth. | 5 | 0–20 | always |
| **Lorebook Max Tokens** | `loreBookToken` | Token budget for lorebook entries per generation, unless a character overrides it. | 800 | 0–4096 | always |
| **Target Tokens (Auto Continue)** | `autoContinueMinTokens` | If set above 0 and a response comes back shorter than this many tokens, the app automatically continues the generation. | 0 | min 0 | always |
| **Additional Prompt** | `additionalPrompt` | Text appended to the Main Prompt. Only applies when the preset's **Use Prompt Preprocess** is on — see [[Settings Chat Bot]]. | "The assistant must act as {{char}}. user is {{user}}." | free text | always |
| **Description Prefix** | `descriptionPrefix` | Prefixed to the character description. Only applies when the preset's **Use Prompt Preprocess** is on — see [[Settings Chat Bot]]. | "description of {{char}}: " | free text | always |
| **Emotion Prompt** | `emotionPrompt2` | Prompt used to detect which emotion image to show. If left blank, the built-in default prompt is used instead. | "" (blank) | free text | always |
| **Preset Chain** | `presetChain` | If not blank, a comma-separated list of preset names. Each time you send a message, one of them is picked at random and applied before the request. | not set (off) | free text, placeholder "Leave it blank to not use" | always |
| **Input 'say nothing' when no string inputed** | `useSayNothing` | If enabled, sending with an empty message box inserts a "*says nothing*" turn instead of sending nothing. | true | — | always |
| **Anti-Incomplete Response (Auto Continue)** | `autoContinueChat` | Tries to continue the chat automatically if the response doesn't end with punctuation. The label warns: don't use this with languages that don't use punctuation. | false | — | always |
| **Remove Incomplete Sentences** | `removeIncompleteResponse` | Strips a response left incomplete by an aborted or failed generation. | not set (off) | — | always |
| **Memory Punctuation Removal** | `removePunctuationHypa` | Strips punctuation from SupaMemory summary text before it is stored. | true | — | always |
| **Remember tool usage** | `rememberToolUsage` | Passed through to the main generation pipeline's options; affects tool-call handling during a chat turn. | true | — | always |
| **Persona Note** | `personaNote` | Shows or hides the **Note** field on [[Settings Persona]]. | not set (off) | — | always (flask icon, not gated by **Use Experimental**) |
| **Disable Separate Parameter Change on Preset Change** | `disableSeperateParameterChangeOnPresetChange` | When on, switching presets no longer overwrites per-model "separate parameters." This is also one of the checks Easy Panel uses before it will show its model/parameter tabs. | not set (off) | — | always |

<!-- src/ts/setting/advancedSettingsData.ts:11-22,26-43,121,143-144,186,212,211,167; src/lang/en.ts:143,151-282,776-1697 -->

---

## Requests & network

| Setting | Field | What it does | Default | Range/options | Shown when |
|---|---|---|---|---|---|
| **Request Retrys when Fail** | `requestRetrys` | Number of times a failed request is retried. | 2 | 0–20 | always |
| **Generation Choices** | `genTime` | Number of responses to generate on models that support it. Every response after the first is treated as a cached reroll — this can lower cost, but can also raise it if you use it without rerolling. | 1 | 0–4096 | always |
| **Vision Quality** | `gptVisionQuality` | Quality of the image-detection model. Higher quality is more accurate but uses more tokens. | Low | Low, High | always |
| **Request Location** | `requestLocation` | Adds a `risu-location` header to outgoing proxied requests: Default (no header), EU (GDPR) or US (FedRAMP). | Default | Default, EU (GDPR), US (FedRAMP) | web build only (not shown on Node-server or Tauri builds) |
| **Autofill Request URL** | `autofillRequestUrl` | Auto-fills the request URL to match the current model when the model is set to reverse proxy. | true | — | always |
| **Local Network Mode (Experimental)** — not translated (fallback label) | `localNetworkMode` | Routes private/LAN model URLs through the local runtime path instead of the browser's direct fetch, to avoid browser private-network/CORS restrictions. Gates the timeout field below. | false | — | always |
| **Local Network Timeout (sec)** — not translated (fallback label) | `localNetworkTimeoutSec` | Timeout applied to local-network requests. | 600 | 30–3600 | only when **Local Network Mode** is on |
| **New OpenAI Handling** | `newOAIHandle` | Changes how `example_`-named and `NewChat`-memo messages are formatted for OpenAI-format requests. | true | — | always |
| **Dynamic Model Registry** | `dynamicModelRegistry` | Lets the model list refresh/extend itself dynamically instead of staying static. | true | — | always |
| **Anti-Server Overload** | `antiServerOverloads` | If an Anthropic "overload" error happens mid-stream, retries with the same prompt to make it less likely to recur; also checked in the Gemini fallback path. | not set (off) | — | always |
| **OpenAI Flex Processing** | `openAIFlexProcessing` | Uses OpenAI's Flex service tier: responses can be slower, but cost less (batch-API pricing). Only applies to official OpenAI Chat Completions requests. | false | — | always (flask icon, not gated by **Use Experimental**) |
| **Claude 1 Hour Caching** | `claude1HourCaching` | Sets the extended-TTL cache control on the last cached content block in Anthropic requests, and sends the corresponding beta header. | not set (off) | — | always |
| **Claude Batching** | `claudeBatching` | Removes the `stream` field from outgoing Anthropic requests (except Ollama-Cloud-Anthropic), switching to the non-streaming batch API shape. | not set (off) | — | always (flask icon, not gated by **Use Experimental**) |
| **Simplified tool usage** | `simplifiedToolUse` | Changes how tool calls are built for OpenAI/Google request builders; in Google's format specifically, controls whether the text response is kept alongside a tool call. | false | — | always |
| **Force Proxy Format as OpenAI** | `forceProxyAsOpenAI` | Labelled as forcing OpenAI's request format when using a reverse proxy. Currently has no effect: nothing in the codebase reads this field outside its own type declaration, this setting's definition and the language strings. | not set (off) | — | always |

<!-- src/ts/setting/advancedSettingsData.ts:46-56,60-68,109-118,127-142,162,166-168,172-177,204-217; src/lang/en.ts:171-175,206-207,862,1061,1111,1494,1499-1502,1560-1568,1687 -->

---

## Display, performance & assets

| Setting | Field | What it does | Default | Range/options | Shown when |
|---|---|---|---|---|---|
| **Asset Max Difference** | `assetMaxDifference` | Threshold for the fuzzy dynamic-asset name matcher: if the closest match's distance is above this, the match is discarded. | 4 | no min/max set | always |
| **Keep Session Alive** | `keepSessionAlive` | Keeps the browser tab active so the session doesn't expire from inactivity; may need a refresh to take effect. Off, or Via Sound (plays near-silent audio periodically — the most broadly compatible method). | Off | Off, Via Sound | always |
| **Height Mode** | `heightMode` | Sets which CSS height unit the app's layout uses (`--risu-height-size`): Normal, Percent, VH, DVH, SVH or LVH. | Normal | Normal, Percent, VH, DVH, SVH, LVH | always |
| **Initial Chat Load Count** | `chatLoadInitialPages` | Number of recent chat messages rendered when a chat screen opens. Higher shows more history immediately but can make opening a long chat heavier. | 30 | min 1 | always |
| **Additional Chat Load Count** | `chatLoadAdditionalPages` | Number of older messages rendered each time you scroll to the top. Higher reduces repeated loading but makes each load heavier. | 15 | min 1 | always |
| **Image Compression** | `imageCompression` | Compresses images when exporting a character. If an animated image stops working after export, try turning this off. | true | — | always |
| **Legacy Media Findings** | `legacyMediaFindings` | Uses the old method to find media assets, without the newer search algorithm. | not set (off, uses new method) | — | always |
| **New Image Handling (Beta)** | `newImageHandlingBeta` | Switches chat image rendering to a newer image-body-construction path. | not set (off) | — | always |
| **Allow all in file select** — not translated (fallback label) | `allowAllExtentionFiles` | Widens the native file picker so it no longer restricts by extension. | not set (off) | — | always |
| **No Wait for Translate** | `noWaitForTranslate` | When on, message display doesn't wait for the auto-translate step to finish before showing. | not set (off) | — | always |
| **Enable Scroll to Active Character** | `enableScrollToActiveChar` | Pressing the hotkey, or holding Ctrl while dragging a character, scrolls the sidebar to the active character (opening closed folders automatically). | true | — | always |
| **Return CSS Error** | `returnCSSError` | If a character's custom CSS fails to apply, shows a "CSS ERROR: ..." message in place of silently failing. | true | — | always |
| **Directly open character in RisuRealm** | `realmDirectOpen` | Clicking a character preview in the RisuRealm browser opens the character directly instead of just opening the Realm view. | false | — | always |
| **Bookmark** | `enableBookmark` | Shows or hides the bookmark button in a message's icon row. | not set (off) | — | always |
| **Tokenizer Caching** | `useTokenizerCaching` | Caches tokenizer results in memory, keyed by a hash of the input, instead of re-tokenizing the same text repeatedly. | not set (off) | — | always |
| **Show Separate Aux Models in Model Settings** | `auxModelUnderModelSettings` | Shows an auxiliary-model selector block inside Bot Settings. | not set (off) | — | always |
| **Dynamic Assets** | `dynamicAssets` | If an asset name isn't found while processing data, looks up the closest asset name by vector search and uses that instead. Gates the setting below. | not set (off) | — | always |
| **Use Dynamic Assets in Display** | `dynamicAssetsEditDisplay` | Applies dynamic asset lookup to the "Modify Display" script stage too. The help text warns this can cause performance issues. | not set (off) | — | only when **Dynamic Assets** is on |

<!-- src/ts/setting/advancedSettingsData.ts:55,72-79,84-95,99-105,123,126,163-165,188,204-206,213-216; src/lang/en.ts:151,175-177,222,258,274,974,1183,1185,1220-1221,1314,1392,1488,1550,1575,1626 -->

---

## Saving & backup

Fork difference: three upstream rows in this group — **Kei Server URL**, **Lightning Realm Import** and **Skip Saving Assets on Web Sync** — were account-sync-only controls and were removed along with account sync. What's left:

| Setting | Field | What it does | Default | Range/options | Shown when |
|---|---|---|---|---|---|
| **Cold Storage** | `coldstorage` | Turns the automatic character cold-storage feature on or off. When off, inactive characters' chat data is not moved to cold storage. | on if no plugins were installed when the save was first loaded by a build that has this setting; otherwise off | — | always |
| **Enable Remote Saving** | `enableRemoteSaving` | Controls whether "remote" character blocks are written through the remote-save path. Bypassed only on the Tauri desktop build, which writes the primary database directly. | not set (off) | — | always |

<!-- src/ts/setting/advancedSettingsData.ts:200-201; src/lang/en.ts:1685 -->

---

## Experimental (shown with **Use Experimental**)

**Enable Experimental Features** (`useExperimental`, unchecked by default) reveals the five settings below. Turning it off hides them again; it does not delete their stored values.

| Setting | Field | What it does | Default | Range/options | Shown when |
|---|---|---|---|---|---|
| **Streaming Display Optimization** | `streamingDisplayOptimizationMode` | Reduces display lag when long responses stream in with heavy post-processing (e.g. regex scripts), which can help on mobile or low-end devices. **Off** runs post-processing on every token (can add real overhead). **Balanced** runs it only at ~0.125-second intervals. **Strong** skips post-processing during the stream and runs it once after the stream finishes. The help text calls this experimental and warns some features may behave unexpectedly. | Off | Off, Balanced, Strong | **Use Experimental** on |
| **Google Cloud Tokenization** | `googleClaudeTokenizing` | Uses Google Cloud's own tokenizer (instead of the generic one) for models whose tokenizer is Google Cloud's, and is included in the tokenizer cache key. | not set (off) | — | **Use Experimental** on |
| **Automatic Cache Point** | `automaticCachePoint` | Automatically creates an Anthropic prompt-cache breakpoint after the chat ends, if one doesn't already exist. | not set (off) | — | **Use Experimental** on |
| **New Google Translate Experimental** — not translated (fallback label) | `useExperimentalGoogleTranslator` | Switches to an alternate, higher-quality Google Translate code path in the translator. Its help text points to the generic "this is an unrecommended setting" text. | false | — | **Use Experimental** on |
| **Claude Caching Retrival** | `claudeRetrivalCaching` | Registers a response observer against the replacer/proxy URL for Claude caching retrieval. Its help text also points to the generic "unrecommended setting" text. | not set (off) | — | **Use Experimental** on |

<!-- src/ts/setting/advancedSettingsData.ts:124,145-161,172-177,220-227; src/lang/en.ts:145-150,152,223,261,900,1373,1499-1500 -->

---

## Unrecommended (shown with **Show Unrecommended**)

**Show Unrecommended Settings** (`showUnrecommended`, unchecked by default) reveals the three settings below. Its own help text says: "it will show unrecommended, deprecated settings. It is NOT RECOMMENDED to use these settings."

| Setting | Field | What it does | Default | Range/options | Shown when |
|---|---|---|---|---|---|
| **Chain of Thoughts** | `chainOfThought` | Adds a chain-of-thought prompt to the prompt. Its help text (shown via the deprecation-style help icon) says the toggle is no longer recommended and to put chain-of-thought prompting in other prompt entries instead. | not set (off) | — | **Show Unrecommended** on |
| **Force Plain Fetch** | `usePlainFetch` | Forces the browser's plain `fetch` API instead of the platform's proxy/HTTP path. The help text warns this can cause CORS errors. | not set (off) | — | **Show Unrecommended** on |
| **Show Deprecated Trigger V1** | `showDeprecatedTriggerV1` | Shows the legacy V1 trigger-editing button even when no V1 triggers are present. | not set (off) | — | **Show Unrecommended** on |

<!-- src/ts/setting/advancedSettingsData.ts:122,181-183; src/lang/en.ts:144,154,170,193 -->

---

## Plugins & developer tools

| Setting | Field | What it does | Default | Range/options | Shown when |
|---|---|---|---|---|---|
| **Enable Dev Tools** | `enableDevTools` | Shows a second "dev tool" tab button in the character-sidebar header. | not set (off) | — | always |
| **Plugin Develop Mode** | `pluginDevelopMode` | Labelled as a plugin-developer mode toggle. Currently has no effect: nothing in the codebase reads this field outside its own type declaration, this setting's definition and the language strings. | not set (off) | — | always |
| **Add Prompt Info to Chat** | `promptInfoInsideChat` | Stores the prompt preset's name, active toggles and prompt text in chat metadata. The help text notes this may slightly increase processing time and storage use. Gates the setting below. | false | — | Node-server or Tauri builds only |
| **Add Prompt Text to Chat** | `promptTextInfoInsideChat` | Adds the full prompt text (not just metadata) alongside the field above. | not set (off) | — | Node-server or Tauri builds only, and only when **Add Prompt Info to Chat** is on |

<!-- src/ts/setting/advancedSettingsData.ts:187,192-198,217; src/lang/en.ts:264-265,1304,1554-1555,1644 -->

---

## Custom panels

These three entries are not simple fields; each renders its own component.

### Auto Regenerate On Characterset

An accordion of 18 Unicode-script buttons (Latin, Han, Arabic, Devanagari, Cyrillic, Bengali, Hiragana, Katakana, Telugu, Hangul, Tamil, Thai, Gujarati, Kannada, Ethiopic, Khmer, Greek, Hebrew), each showing a short preview of that script. Clicking a script toggles its membership in the stored ban list (`banCharacterset`, starts empty). After a generation finishes, the app checks the response against every listed script's character range; if a banned script's characters are present, the response is flagged as failed.
<!-- src/lib/Setting/Pages/Advanced/BanCharacterSetSettings.svelte:1-32; src/lang/en.ts:1391 -->

### Custom Models

A full editor for your list of custom model definitions (`customModels`). Each entry (opened by clicking its row) has:

| Field | What it is |
|---|---|
| Name | Display name for the model entry. |
| Request Model | The model id sent in the proxy request (`internalId`). |
| URL | The endpoint URL. |
| Tokenizer | One of 16 options: Unknown, tiktokenCl100kBase, tiktokenO200Base, Mistral, Llama, NovelAI, Claude, NovelList, Llama3, Gemma, GoogleCloud, Cohere, DeepSeek, DeepSeek V4, GLM4, GLM5. |
| Format | One of 15 options: OpenAICompatible, OpenAILegacyInstruct, Anthropic, AnthropicLegacy, Mistral, GoogleCloud, VertexAIGemini, NovelList, Cohere, NovelAI, OobaLegacy, Ooba, Kobold, AWSBedrockClaude, OpenAIResponseAPI. |
| Key/Password | The API key sent with requests to this model. |
| Additional Params | Freeform, line-based `key=value` pairs added to the request body. Prefix a key with `header::` to send it as an HTTP header instead (e.g. `header::Authorization`). Prefix a value with `json::` to send it as parsed JSON. Use `{{none}}` as a value to exclude that key from the request entirely. |
| Flags | 24 boolean capability flags (for example `hasImageInput`, `hasStreaming`, `hasPrefill`, `claudeThinking`) that describe what the model supports. |

Entries can be reordered with the up/down arrows and removed with the trash icon. A model whose id is prefixed `xcustom:::` is resolved against this list to build its runtime model info.
<!-- src/lib/Setting/Pages/Advanced/CustomModelsSettings.svelte:1-201; src/ts/model/modellist.ts:832-836; src/lang/en.ts:985-986,1208,1261,1269,1548 -->

### Show Log / Show Statistics / Export Settings for Bug Report

Three buttons, none of which change a stored setting:

- **Show Request Logs** opens the app's current request log as a text popup.
- **Show Statistics** renders the app's internal usage counters (`db.statics`) as a Markdown table.
- **Export Settings for Bug Report** downloads a JSON snapshot of your settings and also copies it to the clipboard. Before exporting, it removes: `characters`, `loreBook`, `plugins`, `personas`, `username`, `userIcon`, `userNote`, `modules`, `enabledModules`, `botPresets`, `characterOrder`, `webUiUrl`, `hordeConfig`, `novelai`, `koboldURL`, `ooba`, `ainconfig`, `personaPrompt`, `promptTemplate`, `deeplOptions`, `google`, `customPromptTemplateToggle`, `globalChatVariables`, `comfyConfig`, `comfyUiUrl`, `translatorPrompt`, `translatorPresets`, `translatorPresetId`, `customModels`, `mcpURLs`, `authRefreshes` — plus every field whose name contains "key", "proxy" or "hypa" (case-insensitive). It then adds a small `meta` block recording whether the build is Tauri, Node-server, and the page protocol.

<!-- src/lib/Setting/Pages/Advanced/SettingsExportButtons.svelte:1-76; src/lang/en.ts:864,1376,1576 -->
