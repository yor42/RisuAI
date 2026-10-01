# Settings: Accessibility

Part of [[Settings]]. Open **Settings → Accessibility**. This page is a single flat list of toggles; it has no tabs and is not affected by **Use Legacy GUI** (that only changes the Display page).

<!-- src/ts/setting/accessibilitySettingsData.ts:10-222 -->

| Setting | What it does | Default |
|---|---|---|
| **Ask Removal** | Shows a confirmation dialog before a chat message is removed. | on |
| **Use Swipe for Regeneration** | Enables swiping to regenerate a reply, and the swipe UI for alternate greetings. | on |
| **Remove subsequent when message remove** | When removing a message, also removes every message after it. | off |
| **Send with Enter Key** | When on, Enter sends the message and Shift+Enter inserts a newline; when off, the two are swapped. | on |
| **Fixed chat textarea** | Keeps the chat input box fixed to the bottom of the window instead of inline. Its label notes that Shift+Enter sends instead when this is unchecked. | off |
| **Click Text to Edit** | Lets you click a chat bubble's text to edit it, when the message isn't mid-stream. | off |
| **Enable Block Partial Edit** (Hover to edit individual blocks) | Lets you hover over part of a message to edit just that block. | off |
| **Long Press to Popup Editor** | On right-click or long-press of the chat input box, opens a full popup editor instead of the normal context menu. | off |
| **Enable Drag Partial Edit** (Select text to edit) | Lets you select part of a message's text to edit just that selection. | off |
| **Bot Menu when Launch** | Opens the bot settings panel automatically when the app starts. | off |
| **Show Menu Chat List** | Adds a chat-list entry to the side menu. | off |
| **Show Menu Hypa Modal** | Adds a HypaMemory modal entry to the side menu. | off |
| **Go to Character on Realm Import** | After importing a character card, jumps to that character automatically. | off |
| **Side Menu Reroll Button** | Adds a reroll button to the chat side menu. | off |
| **Local Activation in Global Lorebook** | In the Lorebook editor, treats entries inherited from the character's global lorebook list as locally-activatable instead of always-active. | off |
| **Show Request Info Inside Chat** | Shows the generation-info panel inline in chat instead of only behind a button. | off |
| **Inlay Error Response** | When a generation fails, inserts the error into the chat transcript itself (appended to the last assistant message, or as a new one) instead of showing it as a popup alert. If the character or chat room can't be resolved, it falls back to the popup alert. | off |
| **Lorebook Bulk Enabling** | Adds a bulk-enable control to the Lorebook settings sidebar. | off |
| **Show Translation Loading** | Shows a loading indicator while a translation is in progress. | off |
| **Auto scroll to new message** | Scrolls to a new character message automatically when it arrives. | on |
| **Always scroll to new message** (ignore scroll position) | Scrolls down even if you had scrolled away from the bottom. Shown only when Auto scroll to new message is on. | off |
| **New Message Button Style** | Picks where a "jump to new message" button appears. Shown only when Auto scroll to new message is on and Always scroll to new message is off. | Bottom Center (Default) |
| **Create Folder on Branch** | When branching a chat that has no folder yet, creates one automatically. | on |
| **Move Menu Button to Bottom of Sidebar** | Moves the hamburger menu button from the top of the sidebar to the bottom. | off |
| **Move Instead of Copy on CMP Convert** | A checkbox with no observed effect in the current build. | off |
| **Apply Additional Parameters to All Models** | Sends the **Additional Parameters** table (Chat Bot → Others) with requests to ordinary models. Without it, the table is sent only to **Reverse Proxy**. Custom models from Advanced Settings use their own parameters field either way. | off |
| **Enable Risuai Pro Tools** | Shows an extra "Easy Panel" menu button/feature area. | on if you already have at least one plugin installed, off otherwise |
| **Custom Sidebar Config** (button) | Opens a dialog for configuring the sidebar's icon layout. | — |

<!-- src/ts/setting/accessibilitySettingsData.ts:10-222; src/lib/ChatScreens/Chat.svelte:259-261,820,847-853,904-906,1191,1195,1227; src/lib/ChatScreens/DefaultChatScreen.svelte:641-680,703-731,834-838,1098,1128,1205; src/ts/process/index.svelte.ts:202-253; src/lib/SideBars/Sidebar.svelte:493,862; src/ts/process/request/shared.ts:47-66; src/lib/Setting/Settings.svelte:165-184 -->

**New Message Button Style** options: Bottom Center (Default), Bottom Right, Bottom Left, Floating Circle (Bottom Right), Right Center, Top Bar.

Note: this select's option labels are set once when the app loads and do not update if you change **UI Language** afterward — a reload is needed for them to show in the new language.

<!-- src/ts/setting/accessibilitySettingsData.ts:169-184 -->

Note: the **Long Press to Popup Editor** checkbox currently has no visible label text next to it in the UI — its behaviour still works as described above, but the row shows no name.

<!-- src/ts/setting/accessibilitySettingsData.ts:70-75; src/ts/setting/utils.ts:17-21 -->
