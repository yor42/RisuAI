# CBS: Assets and Media

Part of [[Curly-Brased-Syntaxes]]. These functions embed a character's additional assets, emotion images, background music, or profile pictures. Most of them only make sense when *displayed* in the chat window — during prompt building for the AI request they still resolve (to a URL/base64 path, an HTML tag, or empty string), so avoid using the HTML-producing ones inside text that gets sent to the model.

All asset-name lookups are case-insensitive and, if no additional asset matches the given name exactly, the client falls back to a fuzzy match (Levenshtein distance against file names with the extension stripped) as long as the distance is within the **Asset Max Difference** setting; otherwise the function returns an empty string. <!-- src/ts/parser/parser.svelte.ts:553-566,627-657 -->

When **Hide All Images** is enabled in settings, every function in this section that would normally emit an image, video, or background element instead returns an empty string. <!-- src/ts/parser/parser.svelte.ts:507,528-530 -->

## Additional assets

| Syntax | Output | Notes |
|---|---|---|
| `{{asset::name}}` | `<img>` (or `<video>` if the asset's extension is a video type) | Generic "display this asset" tag. <!-- src/ts/cbs.ts:2263-2268 --> |
| `{{img::name}}` | Unstyled `<img>` | <!-- src/ts/cbs.ts:2319-2324 --> |
| `{{image::name}}` | `<img>` wrapped in a `.risu-inlay-image` div | <!-- src/ts/cbs.ts:2312-2317 --> |
| `{{video::name}}` | `<video controls autoplay loop>` | <!-- src/ts/cbs.ts:2298-2303 --> |
| `{{video-img::name}}` | `<video autoplay muted loop>` (no controls, used like an animated image) | <!-- src/ts/cbs.ts:2305-2310 --> |
| `{{audio::name}}` | `<audio controls autoplay loop>` | <!-- src/ts/cbs.ts:2277-2282 --> |
| `{{bg::name}}` | Background element; only renders when the app is rendering the character's background image, otherwise resolves to nothing | <!-- src/ts/parser/parser.svelte.ts:595-599 -->|
| `{{bgm::name}}` | Hidden control div (`risu-ctrl="bgm___auto___<url>"`) that the player picks up to start background music | <!-- src/ts/cbs.ts:2291-2296 --> |
| `{{path::name}}` / `{{raw::name}}` | The resolved file path/URL itself, with no markup | <!-- src/ts/cbs.ts:2326-2331 --> |
| `{{emotion::name}}` | `<img>` sourced from the character's **emotion images** (a separate namespace from additional assets) | <!-- src/ts/cbs.ts:2270-2275 --> |

These tags (plus `{{source::...}}`, covered under **Profile pictures** below) are all resolved together in a dedicated asset pass, separate from the general CBS function lookup. <!-- src/ts/parser/parser.svelte.ts:408,523 -->

### Asset name resolution and module/character collisions

When both a module and the active character ship an asset with the same name, the character's own asset always wins. The module's asset is only added if the name is not already claimed by the character. <!-- src/ts/parser/parser.svelte.ts:470-484 -->

## Inlay assets

Inlays are assets attached directly to a chat message (e.g., pasted images) rather than to the character:

| Syntax | Behavior |
|---|---|
| `{{inlay::id}}` | Unstyled inlay; **not** sent to the model |
| `{{inlayed::id}}` | Styled (wrapped in `.risu-inlay-image`) inlay; **not** sent to the model |
| `{{inlayeddata::id}}` | Styled inlay that **is** sent to the model |

<!-- src/ts/cbs.ts:2333-2338,2340-2345,2347-2352 -->

Inlays are resolved in their own pass after the main CBS pass. Image inlays become `<img>`, video inlays become `<video>`, and audio inlays become `<audio>`, each pointing at a blob URL cached per inlay id. <!-- src/ts/parser/parser.svelte.ts:694-729 -->

## Profile pictures

`{{source::user}}` and `{{source::char}}` return the raw source URL/data of the user's persona icon or the character's avatar image respectively (any other argument is not recognized). This is resolved as a placeholder that's substituted only at the very end of asset processing, after everything else has resolved. <!-- src/ts/cbs.ts:2354-2359; src/ts/parser/parser.svelte.ts:541-551,612-622 -->

## Character/module asset listings

| Syntax | Returns |
|---|---|
| `{{emotionlist}}` | JSON array of the current character's emotion-image names |
| `{{assetlist}}` | JSON array of the current character's additional-asset names (empty for groups) |
| `{{chardisplayasset}}` | JSON array of additional-asset names, filtered by the assets excluded in the character's asset list, only when **Insert Asset Prompt** is enabled |
| `{{moduleassetlist::namespace}}` (alias `{{module_assetlist}}`) | JSON array of asset names for the module with the given namespace |

<!-- src/ts/cbs.ts:1316-1329,1331-1344,1477-1497,1607-1622 -->

See also [[CBS-Functions]] for `{{moduleenabled}}`.
