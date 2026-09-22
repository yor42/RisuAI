# Creating a Basic Bot

This guide makes a simple character from scratch. It assumes you have already picked a model and entered an API key (see [[RisuAI Basics]]).

## 1. Create the character

Click **+** in the character list and choose **Create from Scratch**. A new, empty character is selected, and its settings sidebar opens on the Basic page.

<!-- src/ts/characters.ts:684-736,876-908 -->

## 2. Fill in the Basic page

- **Name** (the box at the top): what the character is called. `{{char}}` in any text is replaced with it.
- **Description**: everything the model should know about the character, such as appearance, personality, background, and how they speak. This is the most important field. It is sent with every message, so its length (shown in tokens under the box) counts against **Max Context**.
- **First Message**: the character's opening message. It strongly shapes the style and length of later replies, so write it the way you want the character to write.

That is enough to start chatting. Type a message in the chat and send it.

Use `{{user}}` for your persona's name and `{{char}}` for the character's name, so the text still works if either changes. See [[Curly Brased Syntaxes]].

<!-- src/lib/SideBars/CharConfig.svelte:266-345 -->

### Author's Note

The **Author's Note** on the same page belongs to the current chat, not the character. Use it for things that apply right now, like the current scene, or how you want the next replies to go. It has a strong effect, and it is not exported with the character.

## 3. Optional: more fields

These are on the **Advanced Settings** page (activity icon):

- **Example Message**: sample conversations that show how the character talks. Start each one with `<START>`:

  ```
  <START>
  {{user}}: Hi.
  {{char}}: Oh, hello! I didn't see you there.
  ```

- **Alternative First Messages**: extra opening messages. At the start of a chat, arrows on the first message switch between them.
- **Creator's Comment**: a note for people who use your character. It is shown above the first message and is not sent to the model.
- **System Prompt**: replaces the main prompt for this character. Use `{{original}}` to include the normal main prompt. It is not used when a [[Prompt Template]] is on.

**Personality** and **Scenario** fields exist for compatibility with other apps, but they are hidden unless **Show Unrecommended Settings** (**Settings → Advanced Settings**) is on, or they already contain text. Put that information in the Description instead.

Other features you can add later: a [[Lorebook]] for facts that only matter when mentioned, [[emotion images|Additional Character Screen]], a [[TTS]] voice, and [[Regex Script]] or [[Trigger Script]].

<!-- src/lib/SideBars/CharConfig.svelte:1054-1284; src/lang/en.ts:105-116 -->

## 4. Set a character icon

On the **Character Display** page (smile icon), open **Character Icon** and upload an image.

## 5. Export and share

On the share page (share icon), **Export Character** saves the character as a file. You can choose:

- **Character Card V3**, in the format **CHARX**, **CHARX-JPEG**, **PNG** or **JSON**.
- **Character Card V2**, the older PNG format that more apps can read.

**Share to RisuRealm** publishes it to RisuRealm instead.

<!-- src/lib/Others/AlertComp.svelte:740-810; src/ts/characterCards.ts:689-717 -->
