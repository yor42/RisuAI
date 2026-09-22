# TTS

TTS (text to speech) reads messages aloud. It is set per character. Open the character's settings sidebar, go to the page with the speaker icon (headed **TTS**), and pick a **Provider**. Group chats have no TTS page.

API keys and server addresses are global. They are in **Settings → Other Bots → TTS**.

<!-- src/lib/SideBars/CharConfig.svelte:752-1053; src/lib/Setting/Pages/OtherBotSettings.svelte:944-966 -->

## When it plays

- **Auto Speech** (**Settings → Other Bots → TTS**): when on, every new reply, including a regenerated one, is read out as soon as it finishes.
- **The speaker button** on each message reads that message on demand. It appears when the current character has a provider set. It reads the stored text of the message, so CBS tags that have not been resolved are read as written.
- **Stop TTS** in the chat menu stops playback. The menu only shows it for Web Speech and ElevenLabs.

<!-- src/ts/process/index.svelte.ts:1850-1851,1918-1919; src/lib/ChatScreens/Chat.svelte:848-858; src/lib/ChatScreens/DefaultChatScreen.svelte:1025-1032 -->

## What is read

Before speaking, every `*` is removed from the text. Nothing else (other markdown, HTML) is removed.

**Read Only Quoted** (on the character's TTS page, for every provider) reads only the text inside `"…"` or `「…」`. If the message has no quotes, nothing is read.

Plugins can also change the text or skip it (see [[Plugin API Reference]]).

<!-- src/ts/process/tts.ts:95-114 -->

## Providers

| Provider | Cost | Needs |
|---|---|---|
| [Web Speech](#web-speech) | Free | Nothing. Uses your browser's or OS's voices. |
| [ElevenLabs](#elevenlabs) | Paid | ElevenLabs API key |
| [OpenAI](#openai) | Paid | OpenAI key, or any OpenAI-compatible endpoint |
| [NovelAI](#novelai) | Subscription | NovelAI API key |
| [fish-speech](#fish-speech) | Paid | fish.audio API key |
| [Huggingface](#huggingface) | Free tier | Huggingface key |
| [VOICEVOX](#voicevox) | Free | A running VOICEVOX Engine |
| [GPT-SoVITS](#gpt-sovits) | Free | A running GPT-SoVITS API server |
| [VITS](#vits) | Free | Nothing. Runs in the browser. |

### Web Speech

Pick a **Speech** voice, or **Auto**. The list comes from your browser and OS, so a voice chosen on one device may not exist on another. Then Auto (the first voice) is used. If your browser has no speech support, the page says so.

### ElevenLabs

1. Get an API key from [ElevenLabs](https://elevenlabs.io/).
2. Put it in **Settings → Other Bots → TTS → ElevenLabs API key**.
3. On the character's TTS page, pick a **Speech** voice. The list is loaded from your ElevenLabs account.

Requests use the `eleven_multilingual_v2` model.

### OpenAI

Put your key in **Settings → Other Bots → TTS → OpenAI Key**, then pick a **Voice** (alloy, echo, fable, onyx, nova or shimmer). The default model is `tts-1`.

Check **Advanced (OpenAI-compatible endpoint)** to use another server with the same API. It shows **Base URL**, **API Key (overrides global)**, **Model** and **Response Format** (mp3, opus, aac, flac, wav or pcm).

### NovelAI

Put your key in **Settings → Other Bots → TTS → NovelAI API key**. Pick a **Voice** from the list, or check **Custom Voice Seed** and type a seed. **Version** is v1 or v2 (default v2).

### fish-speech

Put your key in **Settings → Other Bots → TTS → fish-speech API Key**, then pick a **Model**. **Chunk Length** (default 200) and **Normalize** are passed to the fish.audio API. Speaking without a model selected shows an error.

### Huggingface

Put your key in **Settings → Other Bots → TTS → Huggingface Key**. On the character's page, type the **Model** (a Huggingface model id) and its **Language** (default `en`). If the model is still loading, the app waits and retries until it is ready.

If **Language** is not `en`, the text is machine-translated before it is sent.

Note: this translation currently goes from the chosen language into English, so a non-English model may receive English text.

### VOICEVOX

VOICEVOX is a Japanese TTS engine that you run yourself.

1. Start a VOICEVOX Engine and note its URL.
2. Put the URL in **Settings → Other Bots → TTS → VOICEVOX URL**.
3. On the character's page, pick a **Speaker** and a **Style**. You can also set **Speed scale**, **Pitch scale**, **Volume scale** and **Intonation scale**.

Text is machine-translated into Japanese before it is sent.

### GPT-SoVITS

For a GPT-SoVITS API server that you run yourself. Settings on the character's page:

- **URL** of the server, and **Volume**.
- A reference voice: **Reference Audio Data** (a 3–10 second wav, ogg, aac or mp3 file), or a **Reference Audio Path** on the server. **Use Auto Path** asks the server for the path.
- **Use Reference Audio Script** with the **Reference Audio Script** text and **Reference Audio Language**.
- **Use Long Audio**, **Text Language**, **Top P**, **Temperature**, **Speed**, **Top K** and **Text Split Method**.

### VITS

Runs a VITS model in the browser, with no server. Click **Select Model** and choose a `.zip` that contains the ONNX model. Without a model, a default English model is downloaded on first use.

<!-- src/ts/process/tts.ts:116-419; src/ts/process/transformers.ts -->

## Web version and local servers

ElevenLabs, Web Speech, VOICEVOX and Huggingface requests are sent directly from the browser. A server you run yourself (such as VOICEVOX) must allow cross-origin requests.

On the web version, requests to `localhost`, `127.0.0.1` or `0.0.0.0` are blocked. This affects, for example, a GPT-SoVITS server on the same machine. Use the desktop app, a LAN address, or a tunnel.

<!-- src/ts/globalApi.svelte.ts:1404,1546-1548 -->
