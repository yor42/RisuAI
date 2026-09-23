# TTS: suspected bugs

**STATUS:** reference

These were found while rewriting the [[TTS]] wiki page. It is a hand-off list for a follow-up investigation, not user documentation.

Each entry is a **claim from reading the code**, not a reproduction. Nothing here has been run or tested. The "Status" line says how far each claim has been checked.

Line numbers refer to the working tree at the time of writing (branch `fix/persistence-conflict-platform-hardening`, after commit `0291ea36`).

**Status values**

- **Reported**: a single reading of the code by a code-reader agent.
- **Orchestrator-confirmed**: the Orchestrator re-read the cited lines and agrees with the claim.
- **Needs repro**: the claim depends on runtime state that code reading alone cannot settle.

**Severity scale**

- **High**: loss or corruption of user data.
- **Medium**: a feature does the wrong thing, or the user cannot recover without leaving the page.
- **Low**: an edge case, dead code, or a doc/UI mismatch.

**Wiki coupling:** the TTS wiki page documents current behaviour, including TTS-1 and TTS-3. A fix must update the page.

## Triage index

| ID | Severity | Status | One line |
|---|---|---|---|
| TTS-1 | Medium | Orchestrator-confirmed | Huggingface "Language" translates the text into English instead of into that language |
| TTS-2 | Medium | Orchestrator-confirmed | Huggingface 503 retry loop has no cap and re-translates the text on every retry |
| TTS-3 | Low | Orchestrator-confirmed | "Stop TTS" is only shown for Web Speech and ElevenLabs, though it works for all providers |
| TTS-4 | Low | Orchestrator-confirmed | ElevenLabs hint text points to a menu path that doesn't exist |
| TTS-5 | Low | Orchestrator-confirmed | `FixNAITTS` is unused, and its default voice differs from the UI's |
| TTS-6 | Low | Reported | The per-message play button reads the raw message, so CBS is spoken literally |
| TTS-7 | Low | Orchestrator-confirmed | Dead `ttsMode !== 'none'` comparison |

---

## TTS-1: Huggingface "Language" translates in the wrong direction

- **Severity:** Medium
- **Status:** Orchestrator-confirmed.
- **Where:** `src/ts/process/tts.ts:254-256`; `src/ts/translator/translator.ts:61-67`
- **Claim:** The call is `runTranslator(text, false, 'en', character.hfTTS.language)`. `runTranslator(text, reverse, from, target)` builds `arg.from = reverse ? from : target` and `arg.to = reverse ? target : from`. With `reverse=false` this gives `from = hfTTS.language`, `to = 'en'`. Compare the normal output translation call `runTranslator(text, false, db.translator, 'en')`, which gives `from='en'`, `to=<user language>`. The Huggingface call therefore translates the reply *into English*, which is the opposite of what a non-English TTS model needs. VOICEVOX (`translator.ts:251-258`) uses `reverse=true` and translates correctly en→ja.
- **Effect:** With Language set to anything but `en`, the model receives English text.
- **Investigate:** Swap the arguments (or use `reverse=true`) and confirm with a non-English Huggingface TTS model.

## TTS-2: Huggingface retry loop has no cap and re-translates on each retry

- **Severity:** Medium
- **Status:** Orchestrator-confirmed.
- **Where:** `src/ts/process/tts.ts:252-288`
- **Claim:** The request runs in `while(true)`. On an HTTP 503 with JSON `estimated_time`, it sleeps and loops, with no retry limit and no cancel path. The translation step (TTS-1) is inside the loop, so the text is translated again on every retry, feeding the previous translation back into the translator.
- **Effect:** A model that keeps answering 503 retries forever. Each retry changes the text further.
- **Investigate:** Move the translation above the loop, add a retry cap, and let Stop TTS break the loop.

## TTS-3: "Stop TTS" menu item is hidden for most providers

- **Severity:** Low
- **Status:** Orchestrator-confirmed.
- **Where:** `src/lib/ChatScreens/DefaultChatScreen.svelte:1025`; `src/ts/process/tts.ts:431-438`
- **Claim:** The chat menu shows Stop TTS only when `ttsMode` is `webspeech` or `elevenlab`. `stopTTS()` stops the shared `sourceNode` (also used by GPT-SoVITS's gain path, `tts.ts:364-370`) and cancels `speechSynthesis`, so it would work for every provider that plays through `playAudio()`.
- **Effect:** Users of OpenAI, NovelAI, fish-speech, Huggingface, VOICEVOX and GPT-SoVITS cannot stop playback.
- **Investigate:** Show the item for every non-empty `ttsMode`. Check whether VITS (`transformers.ts`) uses its own audio path that `stopTTS()` does not reach.

## TTS-4: ElevenLabs hint points to a menu path that doesn't exist

- **Severity:** Low
- **Status:** Orchestrator-confirmed.
- **Where:** `src/lib/SideBars/CharConfig.svelte:792`
- **Claim:** The hard-coded hint says "global Settings → Bot Settings → Others → ElevenLabs API key". The field is in Settings → Other Bots → TTS (`OtherBotSettings.svelte:948-949`). The string is also not localized.
- **Investigate:** Fix the path and move the string into `src/lang`.

## TTS-5: `FixNAITTS` is unused and disagrees with the UI default

- **Severity:** Low
- **Status:** Orchestrator-confirmed that it has no callers. The default mismatch is Reported.
- **Where:** `src/ts/process/tts.ts:492-506`; `src/lib/SideBars/CharConfig.svelte:115-121`
- **Claim:** `FixNAITTS` is exported but never called. Its comment says it mirrors the UI's defaults, but it sets voice `'Anananan'` while the UI initializer sets `'Aini'`.
- **Investigate:** Remove it, or wire it up with the UI's defaults.

## TTS-6: The per-message play button reads the raw message

- **Severity:** Low
- **Status:** Reported.
- **Where:** `src/lib/ChatScreens/Chat.svelte:848-858`
- **Claim:** The button calls `sayTTS(null, isOptimizedStreamingMessage ? rawStreamingText : message)`. `message` appears to be the stored text, not the CBS-parsed display text, so tags such as `{{user}}` in greetings are spoken literally. Auto Speech passes the generated result instead (`index.svelte.ts:1850-1851`).
- **Investigate:** Confirm what `message` holds, and whether it should go through `risuChatParser` like the copy button does (`Chat.svelte:615-620`).

## TTS-7: Dead `'none'` comparison

- **Severity:** Low
- **Status:** Orchestrator-confirmed.
- **Where:** `src/lib/ChatScreens/Chat.svelte:849`
- **Claim:** `ttsMode !== 'none'`. Nothing assigns `'none'`; disabled is `''`. The adjacent truthiness check already covers it. Harmless.
