# Prompt Template

A prompt template sets exactly what goes into the prompt and in what order. It is a list of items (prompt text, description, lorebook, chat history and so on) that you arrange by dragging. It replaces the older **Main Prompt / Jailbreak Prompt / Global Note / Formatting Order** fields.

The template is part of the current preset. Switching presets switches the template and all its [settings](#template-settings).

<!-- src/ts/storage/database.svelte.ts:2170-2229 -->

## Turning it on

Go to **Settings → Chat Bot → Others → Prompt Template** and check **Use Prompt Template**. After that:

- **Settings → Chat Bot → Prompt** shows the template's item list instead of the legacy fields.
- **Settings → Chat Bot → Others → Prompt Template** shows the [template settings](#template-settings).

(With the legacy settings layout, a **Prompt Template** button opens an editor with **Template** and **Settings** tabs instead.)

A new template starts empty. The app always adds an **End-Injected Prompts** item at the end if the template has none (see below).

Turning the template off does not delete the legacy fields, and turning it on does not delete them either. While the template is on, the legacy fields are ignored.

<!-- src/lib/Setting/Pages/BotSettings.svelte:713-723,828-853; src/ts/process/index.svelte.ts:424-436 -->

### Without a template

With the template off, the prompt is built from **Main Prompt**, **Jailbreak Prompt** (only while **Toggle Jailbreak** is on), **Global Note** and the other parts, in the order set by **Formatting Order**. The character's **System Prompt** replaces the Main Prompt in this mode (with `{{original}}` standing for the Main Prompt). The character's System Prompt is not used when a template is on.

<!-- src/ts/process/index.svelte.ts:469-499 -->

## Items

Each item has a type. Every item can also have a **Name**, which only labels it in the editor.

| Type | Inserts |
|---|---|
| **Plain Prompt** | Your text, with a **Role** (User, Character or System Prompt). Its **special type** can be **No Special Type**, **Main Prompt** or **Global Note**. A Global Note item is replaced by the character's **Replace Global Note** if the character has one (`{{original}}` stands for the item's text). |
| **Jailbreak Prompt** | Like Plain Prompt, but only when **Toggle Jailbreak** is on. |
| **Chain of Thoughts** | Like Plain Prompt, but only when chain of thought is on. This type is only offered when the unrecommended **Custom Chain of Thoughts** setting is on. |
| **Persona Prompt** | The selected persona's description. |
| **Character Description** | The character's description, plus personality and scenario, and lorebook entries placed before or after the description. |
| **Lorebook** | The active lorebook entries that have no special position. See [[Lorebook]]. |
| **Author's Note** | The chat's Author's Note. If it is empty, the item's **Default Prompt** is used. |
| **Supa/HypaMemory** | The summaries from the active [[Long Term Memory]] system. Empty if none is active. |
| **Chat** | Part or all of the chat history. See [Chat ranges](#chat-ranges). |
| **End-Injected Prompts** | Everything that the app adds at the end: depth-0 lorebook injections, trigger output, the Chain of Thoughts instruction, group-chat and character-screen instructions, "[Continue the last response]" when continuing, and the **Post End** text. |
| **ChatML** | Several messages written in ChatML, starting with `<|im_start|>`. Each message starts with `<|im_start|>` followed by `user`, `system` or `assistant`. Text that does not start with `<|im_start|>` inserts nothing. |
| **Cache Point** | Nothing. It marks the last **Depth** messages built so far (of the chosen role, or **All**) as a cache point, for providers that support prompt caching. |

<!-- src/ts/process/index.svelte.ts:1333-1519; src/lib/UI/PromptDataItem.svelte:64-104,261-374 -->

### Custom Inner Format

Persona Prompt, Character Description, Author's Note and Supa/HypaMemory items have a **Custom Inner Format** checkbox. When it is checked, the item's content is placed inside your text where `{{slot}}` appears. For example:

```
<character>
{{slot}}
</character>
```

Only the first `{{slot}}` is replaced. CBS in the rest of the text is processed. These items can also set a role. Without one they are sent as system messages.

### Chat ranges

A **Chat** item inserts the whole history by default. Check **Advanced** to set **Range Start** and **Range End**. Negative numbers count from the end. For example, a start of `-4` with **Until Chat End** checked inserts the last four messages. If the start is not before the end, the item inserts nothing.

Several Chat items let you put other items between parts of the history, for example a note placed four messages before the end: one Chat item from the start to `-4`, then the note, then one Chat item from `-4` until chat end.

### How items are combined

Items are processed from top to bottom. Consecutive system messages are merged into one, joined by a blank line. Empty messages are dropped.

The editor warns you (it does not block you) when the template has no Main Prompt or more than one, no Global Note or more than one, no Character Description or Lorebook item, no Chat item that reaches the end of the chat, or advanced chat ranges that do not line up.

<!-- src/ts/process/index.svelte.ts:1294-1317; src/ts/process/templates/templateCheck.ts -->

## Text in items

All item text goes through CBS (see [[Curly Brased Syntaxes]]), so `{{char}}`, `{{user}}`, `{{#if}}`, `{{getvar::...}}` and the rest work.

Two tags are especially useful here:

- `{{position::name}}` is replaced with lorebook entries whose position is `@@position pt_name`. See [[Lorebook]].
- `{{prefill_supported}}` returns `1` when the selected model id starts with `claude`, otherwise `0`. Wrap a Character-role Plain Prompt at the end in `{{#if {{prefill_supported}}}}…{{/if}}` to prefill only where it works.

## Utility bots

For a character marked **Utility Bot**, your template is not used. A fixed template is used instead: main prompt, description, lorebook, chat, global note and end-injected prompts. Check **Utility Override** in the template settings to use your template for utility bots too.

<!-- src/ts/process/index.svelte.ts:438-467 -->

## Template settings

These are in **Settings → Chat Bot → Others → Prompt Template** once the template is on.

| Setting | What it does |
|---|---|
| **Post End** | Text added as a system message after the End-Injected Prompts. |
| **Send Chat as System** | Sends chat history as system messages, each line prefixed with its role. A Chat item can opt out with **Send as original role**. |
| **Format Group in Single** | Formats a one-character chat like a group chat, with names in front of messages. |
| **Trim 'Start New Chat' Messages** | Leaves out the "[Start a new chat]" marker. |
| **Utility Override** | See [Utility bots](#utility-bots). |
| **Enable Schema**, **Strict Schema**, **JSON Schema**, **Extract JSON** | Ask the model for JSON output that follows a schema, and pull one field out of the response. |
| **Max Thought Tag Depth** | How far back `<Thoughts>` tags are handled in the history. -1 means no limit. |
| **Non-Speaker Role in Group** / **Non-Speaker Inner Format** | The role and the wrapper (with `{{slot}}`) used for other characters' messages in group chats. |
| **Custom Toggles** | Switches shown in the chat's side panel. The syntax is the same as a module's; see [[Custom Toggles|Modules#custom-toggles]]. Read them with `{{getglobalvar::toggle_key}}`. |
| **Default Variables** | `name=value` lines that set starting values for chat variables. A character's default variable with the same name wins. |
| **Predicted Output** | Sent as OpenAI's predicted output. |
| **Auto Suggest** | The prompt used by the Auto Suggest feature. |

<!-- src/lib/Setting/Pages/PromptSettings.svelte -->
