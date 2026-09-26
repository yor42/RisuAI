# RisuAI Basics

This page covers the main screen, the first settings you need, and common errors. Other pages go into each feature in detail.

## First steps

1. Open **Settings → Chat Bot**. On the **Model** tab, pick a **Model** and enter the API key for its provider.
2. Open **Settings → Persona** and set your name and icon.
3. Add a character: import a card, pick one from RisuRealm, or make your own (see [[Creating a Basic Bot]]).
4. Select the character and start chatting.

## The main screen

The screen has three parts:

- **The character list** on the far left.
- **The character settings sidebar** next to it, for the selected character.
- **The chat** on the right.

If the sidebar is closed, open it with the arrow button in the top-left corner. On a small screen the open sidebar may cover the chat.

<!-- src/lib/SideBars/Sidebar.svelte; src/lib/UI/GUI/SideBarArrow.svelte -->

### Character list

- Click a character to switch to it. Drag characters to reorder them.
- Drag one character onto another to make a folder. Right-click a folder to rename it, or change its color or image.
- The **+** button opens the add-character menu:
  - **Choose from RisuRealm**: browse shared characters. Until you accept upstream RisuAI's Terms of Service and Privacy Policy (asked the first time you use Realm or Google Drive backup), the Realm preview and browser show a placeholder instead of listings.
  - **Import Character**: load a character card file (`.png`, `.json`, `.charx`, `.jpg` or `.jpeg`).
  - **Create from Scratch**: make an empty character.
  - **Create Group Chat**: chat with several characters at once.
- The menu button opens **Settings** and the other app pages.
- The **Playground** icon opens a set of testing tools. See [[Playground]].

<!-- src/lib/SideBars/Sidebar.svelte:147-334,631-690; src/lib/Others/AlertComp.svelte:594-670; src/ts/characterCards.ts:52-171 -->

### Character settings sidebar

The icons at the top switch between pages:

| Icon | Page |
|---|---|
| Person | Basic: **Description**, **First Message** and the chat's **Author's Note** |
| Smile | **Character Display**: icon, [[Additional Character Screen]] and additional assets |
| Book | [[Lorebook]] |
| Speaker | [[TTS]] (single characters only) |
| Braces | **Scripts**: background HTML, [[Regex Script]] and [[Trigger Script]] (single characters only) |
| Activity | **Advanced Settings**: example messages, alternative first messages, creator's comment, system prompt, default variables, and more |
| Share | Export or remove the character (single characters only) |

The **Author's Note** belongs to the current chat, not to the character, so it is not included when you export the character.

The Basic page also shows the chat toggles, such as the memory toggle (see [[Long Term Memory]]), custom toggles from [[Modules]] and the preset, and **Toggle Jailbreak**. Toggle Jailbreak only appears when the current prompt actually contains a jailbreak prompt. It is a global switch, not a per-character one.

<!-- src/lib/SideBars/CharConfig.svelte:235-345,1054-1284; src/lib/SideBars/Toggles.svelte:25-54,185-205 -->

### Chat

Type in the box at the bottom and press the send button. **Send with Enter Key** (**Settings → Accessibility**) decides whether Enter sends or adds a new line.

The menu button next to the send button opens the chat menu. What it shows depends on your settings:

- **Chat List**: switch between this character's chats, or start a new one.
- **Continue Response**: let the character continue its last message.
- **Modules**: turn [[Modules]] on for this chat or this character.
- **Auto Suggest**: suggests replies for you.
- **Post File**: attach an image or file.
- **Screenshot**: save an image of the chat.
- **Auto Translate Input**: shown when a translator is set up.
- **Stop TTS**: shown for Web Speech and ElevenLabs voices.
- **Auto Mode**: in group chats.
- **Regenerate**: only if **Side Menu Reroll Button** is on.
- Memory windows for HypaMemory, and items added by plugins.

<!-- src/lib/ChatScreens/DefaultChatScreen.svelte:661-802,1012-1163 -->

### Message buttons

Each message has buttons for:

- **Edit** and **Remove**. Long-press Remove (or turn on **Remove subsequent when message remove** in **Settings → Accessibility**) to choose between removing only that message or that message and every message after it.
- **Translate**, when a translator is set up.
- **Copy**, if **Use Chat Message Copy** is on in **Settings → Display & Audio**.
- **TTS**, when the character has a voice.
- **Regenerate** on the latest reply. With **Use Swipe for Regeneration** on (**Settings → Accessibility**), arrows let you move between regenerated versions. The first message has arrows whenever the character has alternative first messages.

More actions are in the message's extra menu: **Bookmark** (if enabled), **Branch** (start a new chat from this message), **Disable Message** (leave it out of the prompt) and **Cut Messages for AI**.

<!-- src/lib/ChatScreens/Chat.svelte:573-992 -->

## Settings

Open **Settings** from the menu in the character list. The main sections are:

| Section | What is there |
|---|---|
| **Chat Bot** | Model, API keys, parameters, prompts and presets. See [[Prompt Template]]. |
| **Persona** | Your name, icon and description. You can keep several personas. |
| **Other Bots** | [[Long Term Memory]], [[TTS]], emotion images and image generation. |
| **Display & Audio** | Theme, sizes, colors and sounds. |
| **Language** | App language and translator. |
| **Accessibility** | Input and accessibility options. |
| **Modules** | See [[Modules]]. |
| **Plugin** | See [[Plugin Docs]]. |
| **Backup & Files** | Local and Drive backups, and storage settings (fork-specific name; upstream calls this tab "Account & Files"). |
| **Hotkey** | Keyboard shortcuts. |
| **Advanced Settings** | Options for advanced users. |

<!-- src/lib/Setting/Settings.svelte:41-184 -->

## Common errors

- **"Error: The minimum required token is greater than the Max Context Size."**: the parts that must always be sent (description, prompts, persona and so on) do not fit in **Max Context**. Shorten them, or raise Max Context in **Chat Bot → Parameters** if your model allows it.
- **"The file is invalid, or it's data is corrupted."**: the file you tried to import is not a character card RisuAI can read.
- **"Error: Unknown model selected"**: the selected model is not available. Pick another one in **Chat Bot**.
- **"You are trying local request on web version…"**: the web version cannot reach `localhost` addresses. Use the desktop app or another address.
- Errors that mention quota, billing or an invalid key come from your AI provider, not from RisuAI. Check your key and your account on the provider's site.

<!-- src/lang/en.ts:16-53; src/ts/globalApi.svelte.ts:1546-1548 -->
