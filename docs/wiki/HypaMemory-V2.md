# HypaMemory V2

HypaMemory V2 is a [[Long Term Memory]] system. It summarizes old messages in token-sized chunks and keeps every summary. Each request, it builds a memory block from two parts: the earliest summaries, and summary paragraphs retrieved by embedding similarity to the latest messages. It is the predecessor of [[HypaMemory V3]], and its data can be converted to V3.

## Enabling

1. **Settings → Other Bots → Long Term Memory → Type → HypaMemory V2**. Selecting it sets the model to distilbart.
2. Pick an **Embedding** model in the same section (see [[Embedding models|Long Term Memory#embedding-models]]).
3. Turn on the character's memory toggle in the chat toggles.

## Settings

- **SupaMemory Model**: the summarizer. The options are the same as for [[SupaMemory]]: **distilbart-cnn-6-6 (Free/Local)**, **OpenAI 3.5 Turbo Instruct** (needs the **SupaMemory OpenAI Key**, at most 600 output tokens) and **Auxiliary Model**.
- **Summarization Prompt**: blank uses a built-in "summarize the ongoing role story and remove redundancy" instruction. For the Auxiliary Model, a prompt starting with `<|im_start|>` is parsed as ChatML, with `{{slot}}` replaced by the chat text. Any other prompt is sent as a system message after the chat text. distilbart ignores the prompt. This is the same stored prompt as the SupaMemory Prompt.
- **Chunk Size** (default 3000, minimum 100): the maximum number of tokens of messages summarized into one summary.
- **Allocated Tokens** (default 3000, minimum 100): the token budget for the memory block.

## How it works

This runs on every request while the toggle is on.

1. **Budget.** V2 subtracts the reserved response length (**Max Response**) from the prompt count and adds **Allocated Tokens** as a placeholder for the memory block. It then compares the result with Max Context.
2. **Clean up.** A summary is discarded, together with its paragraphs, if any message it covers is no longer in the chat history, for example because that message was deleted.
3. **Resume.** Messages up to the last message of the newest summary are already summarized and are removed from the history.
4. **Summarize while over budget.** Starting at the resume point, messages are collected until the next one would exceed **Chunk Size**. The last 4 messages are never summarized. The very first entry of the history is never included, and neither are empty messages. The collected messages are sent as `role: text` lines, and the result becomes a new summary. It is also split at blank lines into paragraphs for retrieval. This repeats until the prompt fits. It stops with an error if nothing can be collected:
   - *"… can't summarize last 4 messages …"* when only the protected last messages remain. Increase Max Context.
   - *"Message tokens (…) exceeds chunk size (…)"* when a single message is larger than Chunk Size. Increase Chunk Size.
   - A summarization call may fail up to 3 times in a row before V2 gives up with *"Summarization failed multiple times"*.
5. **Build the memory block.**
   - **Past Events Summary**: summaries are added **starting from the oldest**, until the next one would exceed half of Allocated Tokens.
   - **Past Events Details**: every paragraph of every summary is scored against the last three messages. The weights are 1 for the newest, ½ and ⅓ for the others, and the scores are summed. Paragraphs are added in score order until the next one would exceed what is left of Allocated Tokens. They can include paragraphs of summaries already shown in the first part.
6. **Insert** one system message at the start of the remaining history:

```
<Past Events Summary>
…summaries…</Past Events Summary>
<Past Events Details>…paragraphs…
</Past Events Details>
```

Embedding runs on every request once summaries exist. New paragraphs are embedded once and cached, and the three query messages are embedded each time.

## Data

Stored per chat:

- The summaries, each with its text, the messages it covers, and the last of those messages, used to resume.
- The retrieval paragraphs, each with its text and a link back to the summary it came from.
- An internal counter used to number new summaries.

**Hypa V2 Modal** opens a viewer where you can edit the text of every paragraph (**Chunks**) and every summary (**Summarized**). Find it in the character settings, or in the chat menu if **Show Menu Hypa Modal** is on in Accessibility settings. Editing a summary does not update the paragraphs that were split from it.

Data in the old V2 format is migrated automatically the next time V2 runs, and current V2 data can be converted to V3 from the Hypa V3 Modal. See [[Conversion paths|Long Term Memory#conversion-paths]].
