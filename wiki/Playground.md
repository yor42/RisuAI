# Playground

The Playground is a set of tools for testing RisuAI features on their own, outside a character's chat. You can try CBS syntax, Jinja templates, tokenizers, embeddings, image generation, translation, MCP servers and more, and see the result immediately.

Nothing you type in the Playground tools is saved, except where noted below (the Playground chat, and deletions in the Inlay Assets Explorer).

## Opening the Playground

Click the **Playground** icon (a shell) in the sidebar. The Playground opens on a grid of tools.

- The back arrow at the top of a tool returns to the grid.
- The **Home** icon in the sidebar leaves the Playground.
- With the compact (hamburger) sidebar, clicking the Playground icon again also closes it.
- Switching characters, including with the previous/next character hotkeys, closes it too.

<!-- src/lib/SideBars/Sidebar.svelte:428-533,868-896; src/lib/Playground/PlaygroundMenu.svelte:57-154 -->

## Tools

| Tool | What it's for |
|---|---|
| [Chat](#chat) | A plain chat with your current model and no character |
| [CBS Doc](#cbs-doc) | Searchable list of every CBS tag and what it does |
| [Embedding](#embedding) | Compare how similar texts are under an embedding model |
| [Tokenizer](#tokenizer) | Count tokens with a chosen tokenizer |
| [Syntax](#syntax) | Evaluate CBS |
| [Jinja](#jinja) | Render a Jinja template |
| [Image Generation](#image-generation) | Test your image generator |
| [Parser](#parser) | See the full HTML a message renders to |
| [Subtitles](#subtitles) | Make subtitles for an audio or video file |
| [Image Translation](#image-translation) | Translate the text inside an image |
| [Translator](#translator) | Test the translator on any text |
| [MCP](#mcp) | List and call tools from your MCP servers |
| [Inlay Assets Explorer](#inlay-assets-explorer) | Browse and delete images, audio and video saved in chats |
| [Prompt Convertion](#prompt-convertion) | Turn SillyTavern preset files into a RisuAI preset |

### Chat

A minimal chat for testing a model or a prompt without a character. It uses your current **Model** from **Settings → Chat Bot**.

It differs from a normal chat:

- It runs as a utility bot, so your main prompt, jailbreak and global note are not used. The prompt is only the chat itself (plus the lorebook, if you add one). If you use a [[Prompt Template]] and turn on **Utility Override**, your template is used instead.
- Messages are labelled **User** and **Assistant**. A swap button next to each label flips the message's role.
- The **+** button next to the input box adds an empty Assistant message without calling the model. Edit it to write the assistant's side yourself, for example to build a few-shot example.

The Playground chat is saved like a normal character (named "assistant"), so its messages are kept between sessions. It is hidden from the character list in the sidebar, but it does appear in the full character grid.

<!-- src/lib/Playground/PlaygroundMenu.svelte:26-50; src/ts/process/index.svelte.ts:438-467; src/lib/ChatScreens/DefaultChatScreen.svelte:762-774; src/lib/ChatScreens/Chat.svelte:996-1004,1230-1240 -->

### CBS Doc

A searchable reference of every CBS tag, with its aliases and description, generated from the app itself. Search by name or alias. For explanations and examples, see [[Curly Brased Syntaxes]] and [[CBS Functions]].

<!-- src/lib/Playground/PlaygroundDocs.svelte -->

### Embedding

Pick an embedding model, type a **Query**, and add one or more **Data** texts with **+**. The tool ranks the data texts by similarity to the query. This is the same search the [[Long Term Memory]] systems use.

The model list is the same as for long-term memory (see [[Embedding models|Long Term Memory#embedding-models]]). GPU models are only listed when your browser supports WebGPU. The OpenAI models show an OpenAI key field, and **Custom** shows URL, key and model fields. These are the same settings long-term memory uses, so changing them here changes them for memory too.

<!-- src/lib/Playground/PlaygroundEmbedding.svelte -->

### Tokenizer

Type text and choose a tokenizer to see the token count and how long encoding took. Available tokenizers: Tiktoken (OpenAI, default), Mistral, NovelAI, Claude, Llama, Llama 3, NovelList, Gemma, Cohere, DeepSeek, DeepSeek V4, GLM 4 and GLM 5.

The tokenizer you pick here is independent of your model setting.

<!-- src/lib/Playground/PlaygroundTokenizer.svelte; src/ts/tokenizer.ts:32-46 -->

### Syntax

Type text with CBS in the input box. The result updates as you type. This is the quickest way to test a CBS expression before putting it in a character or lorebook. See [[Curly Brased Syntaxes]].

<!-- src/lib/Playground/PlaygroundSyntax.svelte -->

### Jinja

Enter a Jinja template and the data to render it with, as JSON. The data box starts with a sample chat (`messages`, `bos_token`, `eos_token`), which is useful for testing instruct-model chat templates. Errors in the template or the JSON are shown in the output.

<!-- src/lib/Playground/PlaygroundJinja.svelte -->

### Image Generation

Enter a **Prompt** and **Neg. Prompt** and generate. The image is made by the generator set in **Settings → Other Bots → Image Generation** and is shown on the page. It is not saved.

<!-- src/lib/Playground/PlaygroundImageGen.svelte -->

### Parser

Shows the HTML that a piece of text turns into after message formatting: Markdown, asset tags, styles and HTML cleanup. CBS is not evaluated here; use [Syntax](#syntax) for that. Use it to check how [[Markdown Syntaxes]] and [[HTML Syntaxes]] will render.

<!-- src/lib/Playground/PlaygroundParser.svelte -->

### Subtitles

Makes subtitles for an audio or video file and downloads them as `.vtt` or `.srt`. There are three modes:

- **LLM**: sends the file to your current chat model. The model must accept audio and video input, and streaming must be on. The page warns you if it doesn't.
- **Whisper**: uses OpenAI's Whisper API with your OpenAI key.
- **Whisper Local**: runs Whisper in your browser and downloads the model the first time. Without WebGPU it still works, but much more slowly, and the page warns you.

You can set the source language (Whisper Local only), the destination language, and edit the prompt.

<!-- src/lib/Playground/PlaygroundSubtitle.svelte -->

### Image Translation

Load an image, and the translation model reads the text in it and draws the translation over the image.

- **Auto** finds and translates all text in the image.
- **Manual** translates only a region you drag to select.

You can set the destination language, the prompt, and the font family and size. The model's answer is shown as JSON, which you can edit to fix the result and redraw it. The model must support image input and structured (JSON) output. Models that only stream are not supported.

<!-- src/lib/Playground/PlaygroundImageTrans.svelte -->

### Translator

Translate any text with the translator set in **Settings → Language**. Choose the source and target language.

- **Bulk** translates many pieces at once. Enter a JSON array of `{"text": "..."}` objects, or separate the pieces with blank lines.
- **Keep Context** (with Bulk) gives each piece the previous pieces (up to 10) as context.
- **Clear Cache** clears the saved results of LLM translations.

<!-- src/lib/Playground/PlaygroundTranslation.svelte -->

### MCP

Click **Refresh** to connect to your MCP servers (including MCP modules from your active [[Modules]]) and list their tools. For each tool you can enter its input as JSON and run it with **Execute**. The result opens in a popup. The tool list is empty until you click Refresh.

<!-- src/lib/Playground/PlaygroundMCP.svelte -->

### Inlay Assets Explorer

Lists the images, audio and video attached to or generated in your chats (inlay assets), loading more as you scroll. You can delete them one at a time, or select several and use **Delete Selected**.

Deleting here is permanent. A message that used a deleted asset can no longer show it.

<!-- src/lib/Playground/PlaygroundInlayExplorer.svelte -->

### Prompt Convertion

Converts SillyTavern preset files into a RisuAI preset. Click **Add** and select one or more JSON files, then **Run**. It accepts chat-completion presets, instruct templates, context templates and text-generation parameter presets. A chat-completion preset can't be combined with an instruct template.

The result is added as a new preset in **Settings → Chat Bot → Presets**.

<!-- src/lib/Playground/ToolConversion.svelte; src/ts/process/prompt.ts:103-125,291-490 -->
