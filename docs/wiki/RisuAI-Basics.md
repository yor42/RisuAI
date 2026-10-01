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
  - **Choose from RisuRealm**: browse shared characters. Until you accept upstream RisuAI's Terms of Service and Privacy Policy (asked the first time you use Realm), the Realm preview and browser show a placeholder instead of listings.
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

Type in the box at the bottom and press the send button. **Send with Enter Key** (**Settings → Accessibility**) decides whether Enter sends or adds a new line. With it on, Shift+Enter is a new line. With it off, Shift+Enter sends. When **Auto Translate Input** is on there is a second, translate box: Enter sends from it only if **Send with Enter Key** is on, and it has no send key otherwise. Ctrl+M in either box rerolls (see [[Settings Hotkeys]]).

A line that starts with `/` in the first column is run as a chat command. See [[Chat Commands]].

The menu button next to the send button opens the chat menu. What it shows depends on your settings:

- **Chat List**: switch between this character's chats, or start a new one. Only shown when **Show Menu Chat List** is on.
- **Continue Response**: let the character continue its last message. Always shown, but greyed out and does nothing unless the chat has at least two messages and the last one is the character's. It takes whatever is in the message box, like Send does.
- **Modules**: turn [[Modules]] on for this chat or this character.
- **Auto Suggest**: suggests replies for you.
- **Post File**: attach a file. The picker offers images (jpg, jpeg, png, webp, gif, avif), audio (wav, mp3, ogg, flac), video (mp4, webm, mpeg, avi), `.txt` (the text in the box is used as a search query and matching snippets are added) and `.po` translation files (posted into the chat as a job; see [[Chat Commands]]).
- **Screenshot**: save an image of the chat.
- **Auto Translate Input**: shown when a translator is set up.
- **Stop TTS**: shown for Web Speech and ElevenLabs voices.
- **Auto Mode**: in group chats.
- **Regenerate**: only if **Side Menu Reroll Button** is on.
- **Easy Panel**: shown when **Enable Risuai Pro Tools** is on.
- Memory windows for HypaMemory, and items added by plugins.

On the Playground character the menu button is a **+** that adds an empty character message.

<!-- src/lib/ChatScreens/DefaultChatScreen.svelte:608-622,734-745,965-1126; src/ts/process/files/multisend.ts:245-367 -->

#### Sending, the busy button and stopping

- **Send and Continue empty the box at once.** Your text, staged files and input translation are moved out of the box the moment you press the button.
- **The box is read-only until the reply starts generating.** While it is locked, pasting an image, choosing Post File, picking a sticker and clicking a suggestion are ignored. A paste or Post File that began before the lock still lands, in the chat where it began.
- **The send button turns busy** while a reply is being generated or a send is starting, and for the whole of a reroll, undo reroll or auto-mode run. Clicking it stops the work:
  - **Before your message has been added to the chat:** the send is cancelled. This includes the time the input trigger runs, which happens before the message is added. Your text, files and translation come back into the box. If the line was a `/` command and a writing command had already run, the box stays empty instead. Whatever a trigger already wrote stays. A group chat's send has no input trigger.
  - **While the reply is generating:** it stops the reply. It also stops the send's start and output triggers at their next effect (the effect already running finishes).
  - The busy button stops a send and the triggers that send owns. A trigger run started from a trigger button is not stopped by it; only deleting its chat stops that run.
- **Typing during generation is kept.** The box unlocks when generation starts. What you type stays as your next draft and is not cleared when the reply ends.
- **Only one of Send, Continue, Regenerate, Undo Reroll and Auto Mode runs at a time.** Starting another while one is running does nothing, with no message. The busy button is the only sign. (A Send while a cold-storage chat is still loading shows an error instead.)
- **Each chat keeps its own draft:** unsent text, input translation and staged files stay with the chat they were written in. They survive switching chats, opening Settings and other screen changes. They are kept in memory only, so reloading the page drops them. Only the 200 most recently written drafts are kept; the chat on screen is never the one dropped.

<!-- src/ts/process/composerActions.svelte.ts:187-261,376-390,590-644,675-679; src/ts/process/composerDrafts.svelte.ts:12-15,73,85-101; src/lib/ChatScreens/DefaultChatScreen.svelte:623-676,682-689,786-813,1072-1098; src/lib/ChatScreens/Suggestion.svelte:196-219; src/ts/process/triggers.ts:1376-1381,1473-1478; src/ts/process/sendCharacterMessage.ts:39; src/ts/process/index.svelte.ts:1308,2279,2411 -->

#### Switching chats during a send

- A send's reply goes into the chat you sent from, even if you switch to another chat of the same character or go Home while it generates. Text you type in another chat stays in that chat's draft.
- Switching to another chat of the same character, and going Home, work at any time.
- Switching to a **different character** is refused silently while a reply is generating (the sidebar, grid, mobile list and the Previous/Next Character hotkeys all behave this way). It is allowed in the short moment between pressing Send and generation starting.
- No notice is shown when you switch away mid-send.

<!-- src/ts/globalApi.svelte.ts:3529-3546; src/ts/characters.ts:1003-1025; src/ts/process/composerActions.svelte.ts:224-229,249 -->

#### Deleting while something is writing

If a reply, auto mode, a command line, `/multisend` or a Post File job is writing into a chat, deleting it or its character asks you first:

- **Deleting a chat** adds this line to the confirm: "Something is currently writing into this chat. Deleting it stops that, though a step that is already running may still finish." Confirming stops all work in that chat and removes it. Work in other chats carries on. A step that cannot be interrupted may finish, and its later write to the removed chat is dropped without a message. The only chat of a character cannot be deleted.
- **Trashing or permanently deleting a character or group** adds the line "Something is currently writing into this character. Deleting it stops that, though a step that is already running may still finish." to the first of its two confirms. Confirming stops the work in it, whether or not the line was shown. A trashed character stays where it is, so a write that still lands goes into it.
- **Deleting a member of a busy group shows no warning.** The group chat is not deleted and the turn in flight finishes.

<!-- src/ts/characters.ts:856-909,921-944; src/ts/process/chatOrigin.ts:993-1029; src/lang/en.ts:21,771-774 -->

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
| **Backup & Files** | Local backups and storage settings (fork-specific name; upstream calls this tab "Account & Files"). See [[Settings Backup and Files]]. |
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
