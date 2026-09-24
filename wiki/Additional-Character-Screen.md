# Additional Character Screen

The Additional Character Screen shows a picture of the character outside the chat messages, and changes it as the chat goes on. It is set per character.

Open the character's settings sidebar, go to the **Character Display** page, and pick the **Additional Character Screen** tab. (The other two tabs on that page are **Character Icon** and **Additional Assets**.)

<!-- src/lib/SideBars/CharConfig.svelte:353-372, 473-577 -->

## Modes for a character

| Mode | What it shows |
|---|---|
| **None** | Nothing. This is the default. |
| **Emotion Images** | One of the images you uploaded, picked by the emotion of the character's latest reply. See [Emotion Images](#emotion-images). |
| **Image Generation** | A new image generated after each reply. See [Image Generation](#image-generation). |

## Emotion Images

"Emotion Images" (also called expressions) is the most common mode.

### Setting it up

1. Select **Emotion Images**.
2. Click **+** under the table and pick image files (png, webp or gif). You can pick several at once.
3. Each image's emotion name is taken from its file name, without the extension. You can edit the **Emotion Name** in the table afterwards.

Use plain words as names, such as `joy`, `anger`, `fear` or `surprise`. An image named exactly `neutral` (lowercase) is the default. It is shown before any emotion has been detected. The app recommends more than three images; with fewer it has little to choose from, but nothing stops you.

<!-- src/ts/characters.ts:168-206; src/ts/util.ts:289-298; src/lang/en.ts:80-81 -->

### How the emotion is picked

After each reply, the app picks one of the emotion names. The method is a global setting: **Settings → Other Bots → Emotion Images → Emotion Method**.

- **Ax. Model** (default): the **Auxiliary Model** (set in **Settings → Chat Bot**) is asked to choose one word from your emotion names that best fits the reply. Recently shown emotions are made less likely, so the image does not get stuck. If the answer matches a name exactly it is used. Otherwise a name contained in the answer is used, and if there is none, `neutral` is used if it exists. If nothing matches, the previous image stays.
- **MiniLM-L6-v2**: a small embedding model that runs locally compares the reply with your emotion names and picks the closest one. It makes no API calls and always picks something.

The prompt used by **Ax. Model** can be replaced in **Settings → Advanced Settings → Emotion Prompt**. Leave it blank to use the built-in prompt.

<!-- src/lib/Setting/Pages/OtherBotSettings.svelte:969-977; src/ts/process/index.svelte.ts:2050-2229; src/ts/setting/advancedSettingsData.ts:33-34 -->

### Inlay Screen

With **Inlay Screen** checked, no separate model call is made. Instead, the character's model is told to write a tag such as `<Emotion="joy">` in its reply. The tag is shown as the matching image inside the message, and no side image box is shown.

The text that tells the model to do this is in the **Image Generation Instructions** box (the same label is used in both modes). `{{slot}}` in it is replaced with the list of emotion names. Changing the mode or the Inlay Screen checkbox keeps your edits in this box; it's only reset to the default if you leave it empty or it still holds a built-in default text, and emptying it on purpose counts as unedited too.

<!-- src/ts/process/inlayScreen.ts:1-113; src/ts/process/index.svelte.ts:626-639 -->

### Other ways to show an emotion image

- `{{emotion::name}}` in a message shows that emotion image inline. See [[CBS Assets]].
- A [[Regex Script]] whose output is `@@emo name` sets the displayed emotion directly. When it fires, the automatic pick is skipped for that reply. It works in any mode, as long as the character has an image with that name. See [[@ Syntaxes]].

<!-- src/ts/parser/parser.svelte.ts:532-539; src/ts/process/scripts.ts:182-206 -->

## Image Generation

In this mode, after each reply the **Auxiliary Model** (set in **Settings → Chat Bot**) reads the chat and writes an image prompt. The prompt is sent to the image generator, and the result replaces the displayed image.

It needs an image generator. Set one in **Settings → Other Bots → Image Generation** (for example Stable Diffusion WebUI, NovelAI, ComfyUI, Dall-E, Stability API, Fal.ai, Imagen or an OpenAI-compatible endpoint).

The character's fields:

- **Image Generation Instructions**: the instructions given to the Auxiliary Model for turning the chat into a prompt.
- **Image Generation Prompt**: the prompt sent to the image generator. `{{slot}}` is replaced with the Auxiliary Model's output.
- **Image Generation Negative Prompt**.
- **Inlay Screen**: when checked, the character's model writes `<ImgGen="prompt">` in its reply instead, and the image is generated and shown inside the message.

The **Image Generation Instructions** box has a different job depending on **Inlay Screen**: with Inlay off, it's the system prompt for the Auxiliary Model that writes the image prompt above; with Inlay on, it's added straight to the main chat instead, and it must tell the character's own model to write the `<ImgGen="...">` tag itself. Toggling **Inlay Screen** keeps whatever you've typed in this box rather than switching it to match, so rewrite it yourself after toggling — otherwise, with Inlay on, the model may never write the tag and no images will appear.

Image Generation mode does not work for a character inside a group chat. The app shows "Stable diffusion in group chat is not supported".

<!-- src/ts/process/stableDiff.ts:12-61; src/ts/process/inlayScreen.ts:81-113; src/ts/process/index.svelte.ts:626-639,2230-2249; src/lib/SideBars/CharConfig.svelte:562-577 -->

## Group chats

A group has its own setting on the same tab. It decides how the members' images are laid out. Each member still uses its own mode.

| Mode | What it shows |
|---|---|
| **None** | Nothing. |
| **Single View** | Only the member whose image changed most recently. |
| **Multiple Character View** | Every member's image side by side. |
| **Double Character View** | The first two members, overlapping. Other members are not shown. |

<!-- src/ts/util.ts:313-368; src/lib/ChatScreens/TransitionImage.svelte:113-136 -->

## Where the image appears

This depends on **Settings → Display & Audio → Theme**:

- **Waifulike**: the image stands beside the chat. **Waifu Chat Width** and **Waifu Character Size** set the two widths.
- Other themes: a small box in the top-right corner of the chat. Drag its bottom-left corner to resize it.

The image cross-fades when it changes. The **Hide All Images** option hides it along with all other images.

<!-- src/lib/ChatScreens/ChatScreen.svelte:35-80; src/lib/ChatScreens/ResizeBox.svelte -->
