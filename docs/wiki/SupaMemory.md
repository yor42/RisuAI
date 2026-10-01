# SupaMemory

SupaMemory is the oldest [[Long Term Memory]] system. When the prompt no longer fits in Max Context, it summarizes the oldest messages and adds the result to one running summary. When that summary gets long, it summarizes the summary. Nothing happens while the chat still fits.

**HypaMemory (v1)** is SupaMemory with one extra step: it keeps every chunk summary it has written and retrieves the most relevant ones by embedding similarity. It is covered at the end of this page. It is not the same thing as [[HypaMemory V2]] or [[HypaMemory V3]].

## Enabling

1. **Settings → Other Bots → Long Term Memory → Type → SupaMemory**. Selecting it sets the model to distilbart.
2. Optionally check **Enable HypaMemory** to get v1, and pick an **Embedding** model.
3. Turn on the character's memory toggle in the chat toggles. It reads **Toggle SupaMemory**, or **Toggle HypaMemory** when v1 is on.

## Settings

- **SupaMemory Model**: what writes the summaries.
  - **distilbart-cnn-6-6 (Free/Local)**: a small summarization model run in the browser. It ignores the SupaMemory Prompt.
  - **OpenAI 3.5 Turbo Instruct**: calls OpenAI's completions endpoint with `gpt-3.5-turbo-instruct`, at most 600 output tokens and temperature 0. The prompt sent is the chat text, then the SupaMemory Prompt, then `Output:`. It needs the **SupaMemory OpenAI Key**.
  - **Auxiliary Model**: your Auxiliary Model, or the memory model if **Separate Models for Auxiliary Models** is set up. If the prompt starts with `<|im_start|>`, it is parsed as ChatML and `{{slot}}` is replaced by the chat text. Otherwise the model gets the chat text as a user message, followed by the prompt as a system message.
- **Max SupaMemory Chunk Size** (default 1200, minimum 100): the maximum size of one chunk of messages sent to be summarized. The effective limit is the smaller of this and Max Context ÷ 3.
- **SupaMemory OpenAI Key**: only shown for the OpenAI option.
- **SupaMemory Prompt**: the summarization instruction. When blank, a built-in "summarize the ongoing role story and remove redundancy" instruction is used.
- **Enable HypaMemory**: switches to v1 (see below).
- **Memory Punctuation Removal** (Settings → Advanced Settings): strips most punctuation from the saved SupaMemory summary when it is loaded, and from v1's stored chunk summaries before they are embedded. It is not applied to v1's running summary, and it affects no other memory system.

## How it works

The check counts the prompt including the reserved response length, plus 10 tokens. If that fits in Max Context, SupaMemory does nothing. The saved summary is not inserted either.

Otherwise:

1. **Drop the preamble.** Everything before the "[Start a new chat]" marker is removed, which is the example messages.
2. **Resume.** If a summary was saved before, the messages it already covers are removed from the front of the history, up to the saved resume message. The summary's tokens are counted instead. If the resume message no longer exists in the chat, SupaMemory stops with *"SupaMemory: chat ID not found"*.
3. **If it fits now**, the summary is inserted as a system message at the start of the history, and the request continues.
4. **Otherwise, summarize until it fits.** Each round:
   - Take messages from the oldest end until the next one would exceed the chunk size. If the very first message is already larger than the chunk size, it is taken on its own, unless it is a system message. Messages are written as `Name: text`: the character's name for assistant messages (left blank in group chats) and your user name for others.
   - Summarize that chunk and append the result to the running summary as a new paragraph. Before appending, if the running summary already has 4 or more paragraphs, the whole summary is summarized into one first.
   - If all remaining messages would fit in a single chunk, SupaMemory first re-summarizes the running summary instead. If that is still not enough, it shrinks the chunk size to 70% and tries again. Once the chunk size would go below 500, it stops with *"Not Enough Tokens to summarize in SupaMemory"*.
5. **Insert** the running summary as a system message at the start of the remaining history.

## Data

The summary is saved per chat, as plain text:

```
<id of the first message not yet summarized>
<summary text>
```

The character settings panel shows this as a **SupaMemory** text box, when the chat has data or the character's memory toggle is on. You can edit or clear it there. Keep the first line as a message ID from the chat.

## HypaMemory (v1)

With **Enable HypaMemory** checked, the steps above change in three ways:

- **Chunk summaries are kept.** Every chunk summary is also stored in a separate list.
- **Retrieval, only when over Max Context.** The stored chunk summaries that are not already in the running summary are embedded. The query is the oldest remaining non-system messages of the history (up to four of them). The top three matches are added to the prompt as a `past events:` line, either in the same system message as the summary or in a separate system message before it.
- **Earlier compaction.** The running summary is re-summarized once it reaches 3 paragraphs instead of 4.

v1 keeps a history of snapshots in the same place as the plain-text summary above, marked with `hypa:` on the first line followed by a JSON array, newest first:

```
hypa:
[
  { "id": "<resume message id>", "supa": "<running summary>", "hypa": ["<chunk summary>", "..."] }
]
```

When the chat is loaded, the first snapshot whose resume message is still in the chat is used. So if you delete recent messages, v1 falls back to an older snapshot instead of failing. A new snapshot is added whenever the resume point moves. If none of the snapshots match, v1 stops with *"hypaMemory: chat ID not found"*.

Switching between SupaMemory and v1 does not convert data; see [[Conversion paths|Long Term Memory#conversion-paths]].
