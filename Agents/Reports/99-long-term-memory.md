# Long-term memory: suspected bugs

These were found while documenting the memory systems for [[Long Term Memory]]. It is a hand-off list for a follow-up investigation, not user documentation.

Each entry is a **claim from reading the code**, not a reproduction. Nothing here has been run or tested. The "Status" line says how far each claim has been checked.

Line numbers refer to the working tree at the time of writing (branch `fix/persistence-conflict-platform-hardening`, after commit `0291ea36`).

**Status values**

- **Unverified**: a single reading of the code by the author.
- **Reviewer-confirmed / refuted / partial**: an independent read-only reviewer re-read the code specifically to falsify the claim.
- **Needs repro**: the claim depends on runtime state that code reading alone cannot settle.

**Severity scale**

- **High**: silent loss or duplication of chat content in the prompt, or saved memory that is wrong.
- **Medium**: wrong budget or selection, or an error the user cannot recover from without editing data.
- **Low**: an edge case, a cosmetic problem, or a doc/UI mismatch.

## Triage index

| ID | Severity | Status | One line |
|---|---|---|---|
| HAN-1 | High | Confirmed | The "still in prompt" skip never matches (`substring(16)` vs a 17-char prefix), so retrieval duplicates context |
| V2-1 | High | Confirmed | A failed summary batch is skipped, not retried; a later success persists a permanent gap |
| V2-2 | High | Confirmed | Index-0 skip assumes the NewChat marker; example turns get summarized, or the first message is dropped |
| V2-3 | Medium | Confirmed | `<Past Events Summary>` keeps the oldest summaries and drops the newest |
| SUPA-1 | Medium | Unverified | v1 doesn't count the loaded summary's tokens |
| SUPA-3 | Medium | Unverified | Deleting the resume message breaks SupaMemory permanently |
| V3-1 | Medium | Unverified | The rate limiter throws for UI-allowed concurrency > RPM |
| V3-2 | Medium | Needs repro | A non-contiguous merge can move V3's resume point backwards |
| V3-4 | Medium | Needs repro | Hidden messages may count as orphans and delete their summaries |
| HAN-2 | Low | Confirmed | "Chunk Size" is a reservation; the fill is bounded by Max Context |
| V2-4 | Low | Confirmed | Skipped entries leave the prompt but keep their tokens |
| V2-5 | Low | Reported | `regenerateSummary` is an empty exported stub |
| SUPA-2 | Low | Unverified | v1 comma-joins results and queries with the oldest messages |
| SUPA-4 | Low | Needs repro | A possible infinite loop on a large leading system entry |
| SUPA-5 | Low | Unverified | Legacy davinci/curie values call retired models |
| V3-3 | Low | Unverified | The "Do Not Summarize User Message" help text matches only the experimental path |
| V3-5 | Low | Unverified | The random shuffle is biased |
| SHARED-1 | Low | Unverified | Invalid sort comparator; affects v1 top-3 only |
| SHARED-2 | Low | Unverified | Dot product assumes normalized vectors (Custom endpoint) |
| UI-1 | Low | Unverified | The Type dropdown's precedence differs from the runtime order |
| TOK-1 | Low | Unverified | V2/V3 exclude the response reservation; Hanurai/Supa include it |

---

## HAN-1: Hanurai never skips retrieved messages that are still in the prompt

- **Severity:** High
- **Status:** Reviewer-confirmed. The reviewer checked with `node -e` that `"search_document: ".length === 17`. `HypaProcesser.addText` and `similaritySearchScored` (`hypamemory.ts:157-225`) store and return `content` unchanged, so nothing downstream hides the mismatch.
- **Where:** `src/ts/process/memory/hanuraiMemory.ts:33,37,76,83,90`
- **Claim:** Documents are embedded as `` `search_document: ${text}` ``. The prefix is 17 characters, but the code recovers the text with `.substring(16)`, which leaves a leading space. The check `chats.find((chat) => chat.content === vector[0].substring(16))` compares that against content that was trimmed when the document was built, so it never matches. The skip never fires, and the leading-space text is also what gets inserted.
- **Effect:** On every request, including when the chat fits in context, retrieval re-inserts older messages that are still in the prompt, as far as the budget allows. Content is duplicated and context is wasted.
- **Investigate:** Confirm the prefix length. Check whether `HypaProcesser.addText` or `similaritySearchScored` changes the stored `content`. Log `vector[0].substring(16)` against `chat.content` for one request.

## HAN-2: Hanurai's "Chunk Size" is a reservation, not a cap

- **Severity:** Low (design or label question)
- **Status:** Reviewer-confirmed. The UI's "Chunk Size" binds to `db.hanuraiTokens` (`OtherBotSettings.svelte:1033-1034`), and the fill loop's only bound is `arg.maxContextTokens` (`:86`).
- **Where:** `hanuraiMemory.ts:61-89`. UI label: `OtherBotSettings.svelte:1033-1034`.
- **Claim:** `hanuraiTokens` is only added during trimming. The fill loop stops at `maxContextTokens`, so retrieval can use all remaining context, not "Chunk Size". Combined with HAN-1, that fill is mostly duplicates.
- **Investigate:** Decide whether the intent is a cap. If so, bound the fill by `hanuraiTokens`.

## V2-1: A failed V2 summarization silently drops its batch

- **Severity:** High
- **Status:** Reviewer-confirmed. There is no `idx` rollback on the failure branch, and `currentTokens` is only reduced on success (`:558`).
- **Where:** `src/ts/process/memory/hypav2.ts:415-508`, `:640`
- **Claim:** `idx` advances while `halfData` is collected. When `summary()` fails, `continue` restarts the outer loop from the advanced `idx`, so the failed batch is never retried. If a later batch succeeds, the failed messages are cut out by `chats.slice(idx)` and are covered by no summary. The saved `lastChatMemo` then points past them, so the gap is permanent. `currentTokens` is not reduced for the failed batch either, which causes extra summarization rounds.
- **Mitigation, checked:** it does not limit the damage.
  - The 3-strikes abort (`:499-506`) only fires on 3 *consecutive* failures. Because `idx` moves on after each failure, each strike is a different batch.
  - When a later batch succeeds, `sp.error` is unset, so the caller persists the gapped data (`index.svelte.ts:1109-1110`).
  - The next turn resumes from the saved `lastChatMemo` (`hypav2.ts:383-396`), so the gap is never healed.
  - Net effect: one or two failed batches followed by a success in the same request means permanent silent loss.
- **Investigate:** Make a failure reset `idx = startIdx` (or equivalent), and add a test with a summarizer that fails once and then succeeds.

## V2-2: V2 assumes the first history entry is the "[Start a new chat]" marker

- **Severity:** High when the character has example messages
- **Status:** Reviewer-confirmed, with a detail added after reading `src/ts/process/exampleMessages.ts:5-68`.
- **Where:** `hypav2.ts:432-437`. How `chats` is built: `index.svelte.ts:~627-857`.
- **Claim:** `chats` begins with the example messages, then the `NewChat` marker, then the first message. V2 always skips index 0 and nothing else.
  - With examples, `chats[0]` comes from `exampleMessage()`.
    - If the example text starts with `<START>`, entry 0 is the example marker (`role: 'system'`, `memo: 'NewChatExample'`). Skipping it is harmless, but every example turn after it (`name: 'example_user'` / `'example_assistant'`) is summarized as story. So is the real `NewChat` marker.
    - Without a leading `<START>`, entry 0 is a real example turn. It is dropped unsummarized, and the rest are summarized as story.
    - In both cases the example block is removed from the prompt by `slice(idx)` once summarization passes it.
  - With `promptSettings.trimStartNewChat` and no examples, index 0 is the character's first message, which is dropped without being summarized.
- **Compare:** V3 skips by `name === 'example_user' | 'example_assistant'`, `memo === 'NewChatExample'` and `memo === 'NewChat'` (`hypav3.ts:317-332`, `:1101-1116`). SupaMemory removes everything before the `NewChat` marker (`supaMemory.ts:26-38`).
- **Investigate:** Confirm how examples are represented in `chats`, then apply V3's skip rules to V2.

## V2-3: V2's summary section keeps the oldest summaries and drops the newest

- **Severity:** Medium
- **Status:** Reviewer-confirmed. `mainChunks` is only `push`ed (`:531`), and the legacy conversion `.slice().reverse()`s the old unshift-ordered data (`:189`). No path leaves it newest-first.
- **Where:** `hypav2.ts:563-573`
- **Claim:** `<Past Events Summary>` iterates `mainChunks` oldest-first and stops at `allocatedTokens / 2`. Once summaries outgrow half the budget, the newest ones never appear there. They can only come back as retrieved paragraphs in `<Past Events Details>`.
- **Investigate:** Confirm that `mainChunks` is always oldest-first (it is `push`ed in the loop, and the legacy conversion reverses the old order). Decide whether newest-first was intended.

## V2-4: Skipped V2 entries leave the prompt but keep their tokens

- **Severity:** Low
- **Status:** Reviewer-confirmed. This is pure accounting drift, and it compounds V2-2.
- **Where:** `hypav2.ts:432-444`, `:558`, `:640`
- **Claim:** Index 0 and empty-content entries are skipped with `idx++` but not added to `halfDataTokens`. They are still removed by `slice(idx)`, so `currentTokens` over-counts, which can cause extra summarization.

## V2-5: `regenerateSummary` is an empty exported stub

- **Severity:** Low (dead code)
- **Status:** Reviewer-reported. Author confirmed there is no other call site (grep over `src`).
- **Where:** `hypav2.ts:299-306`
- **Claim:** The function is exported with an empty body and is never called. It is harmless, but it looks like a working API.

---

## SUPA-1: HypaMemory v1 doesn't count the loaded summary's tokens

- **Severity:** Medium
- **Status:** Unverified
- **Where:** `src/ts/process/memory/supaMemory.ts:105-106` vs `:133`, and `:172`
- **Claim:** The plain SupaMemory path adds `tokenize(supaMemory)` after loading. The v1 (`hypa:`) path sets `supaMemory` and `hypaChunks` without adding their tokens. The check `currentTokens < maxContextTokens` at `:172` can therefore pass while the real prompt is over Max Context. The overflow would then surface later, at the prompt-level recheck (`index.svelte.ts:1520`), or push out the response budget.

## SUPA-2: HypaMemory v1 joins its retrieved summaries with commas, and queries with the oldest messages

- **Severity:** Low (formatting); intent unclear (query)
- **Status:** Unverified
- **Where:** `supaMemory.ts:157-161`
- **Claim:** `"past events: " + s.slice(0,3)` coerces a `string[]` into a comma-joined string. The query is `filteredChat.slice(0, 4)`: the **oldest** remaining non-system messages, not the latest. This may be deliberate (the messages nearest the summarized region) or a mistake.

## SUPA-3: SupaMemory breaks for good when its resume message is deleted

- **Severity:** Medium
- **Status:** Unverified
- **Where:** `supaMemory.ts:109-126`
- **Claim:** The first line of `supaMemoryData` is the ID of the first message not yet summarized. If that message is deleted, every later request that overflows fails with "SupaMemory: chat ID not found". The user has to edit or clear the data by hand. v1 falls back to older snapshots; plain SupaMemory has no fallback.

## SUPA-4: A possible infinite loop when a large system entry is first in line

- **Severity:** Low (unlikely trigger)
- **Status:** Unverified. Needs repro.
- **Where:** `supaMemory.ts:330-348`
- **Claim:** If `chats[0]` is a `system` or `function` entry larger than the chunk size, the inner loop breaks with `stringlizedChat === ''` and `spiceLen === 0`. Nothing is spliced, `currentTokens` doesn't change, and the outer `while` repeats forever. It is unclear which `system` entries can reach this point: the `NewChat` marker is kept but is small.

## SUPA-5: Legacy summarizer values still call retired OpenAI models

- **Severity:** Low
- **Status:** Unverified
- **Where:** `supaMemory.ts:218-220`, `hypav2.ts:73-78`
- **Claim:** The UI no longer offers `davinci` or `curie`, but saved settings with those values still request `text-davinci-003` or `text-curie-001`, which OpenAI has retired. Such users get HTTP errors with no migration.

---

## V3-1: The rate limiter throws for settings the UI allows

- **Severity:** Medium
- **Status:** Unverified
- **Where:** `src/ts/process/memory/taskRateLimiter.ts:39-41`. UI: `OtherBotSettings.svelte:1241-1248`. Used at `hypav3.ts:384-395` and `:630-633`.
- **Claim:** The constructor throws `maxConcurrentTasks must be less than tasksPerMinute` when concurrency exceeds RPM. The UI allows RPM ≥ 1 and Max Concurrent up to 10, so, for example, RPM 5 with concurrency 10 makes the experimental V3 path throw on every summarization or similarity search.

## V3-2: Merging non-adjacent summaries can re-summarize messages

- **Severity:** Medium
- **Status:** Unverified. Needs repro.
- **Where:** `src/lib/Others/HypaV3Modal.svelte:217-280`. Resume logic: `hypav3.ts:992-1008` (standard), `:213-229` (experimental).
- **Claim:** Bulk re-summarize puts the merged summary at the smallest selected index and deletes the others. V3 resumes from the last memo of `summaries.at(-1)`. If the selection included the newest summary and was not contiguous, the new last summary is an older one. The messages the old newest summary covered then return to the prompt and will be summarized again, duplicating them in memory.

## V3-3: The help text for "Do Not Summarize User Message" matches only the experimental path

- **Severity:** Low (doc/UI mismatch)
- **Status:** Unverified
- **Where:** `src/lang/en.ts:313-314`. Standard path: `hypav3.ts:1059-1128`. Experimental path: `hypav3.ts:293-349`.
- **Claim:** The help text says user messages are "excluded from the max messages per summary count". That is true only for the experimental path, which counts `toSummarize.length`. The standard path uses a fixed window of `maxChatsPerSummary` messages that includes the skipped user messages. In both paths, user messages are left out of the summary input entirely, which the label ("Do Not Summarize User Message") reflects but the help text doesn't.

## V3-4: Hiding a message may delete summaries under the orphan cleanup

- **Severity:** Medium, if confirmed
- **Status:** Unverified. Needs repro.
- **Where:** `hypav3.ts:1646-1661` (`cleanOrphanedSummary`, called at `:208`, `:987`) and `hypav2.ts:275-297` (`cleanInvalidChunks`). Chat building: `index.svelte.ts:~864-878` (`makeMs` skips `disabled === true` and stops at `'allBefore'`).
- **Claim:** The orphan check compares a summary's message IDs with the `chats` passed to memory, and that list excludes disabled or hidden messages. A summary covering a hidden message is therefore treated as orphaned. It is deleted when **Preserve Orphaned Memory** is off (V3), and always in V2. This deletion is permanent once the chat is saved.

## V3-5: The random-memory shuffle is biased

- **Severity:** Low
- **Status:** Unverified
- **Where:** `hypav3.ts:835`, `:1498`
- **Claim:** `.sort(() => Math.random() - 0.5)` is not a uniform shuffle, so some summaries are favoured. A Fisher–Yates shuffle would fix it.

---

## SHARED-1: Similarity-search sort uses an invalid comparator

- **Severity:** Low (affects HypaMemory v1 only)
- **Status:** Unverified
- **Where:** `src/ts/process/memory/hypamemory.ts:217`
- **Claim:** `.sort((a, b) => (a.similarity > b.similarity ? -1 : 0))` never returns a positive value, which breaks the comparator contract, so the order of the results isn't guaranteed.
- **Who is affected:**
  - Hanurai and V2 (`similaritySearchScored`) sum the scores over all results and then re-sort with a correct comparator, so the bad order should not matter there.
  - HypaMemory v1 (`similaritySearch`, `supaMemory.ts:158-161`) takes the top 3 straight from this order, so it is the path actually affected.
  - The V3 standard path uses its own correct sort (`hypav3.ts:2039`).
  - The V3 experimental path uses `hypamemoryv2.ts`, whose sort is correct.

## SHARED-2: HypaProcesser uses a raw dot product

- **Severity:** Low
- **Status:** Unverified
- **Where:** `hypamemory.ts:232-238`. Compare `hypamemoryv2.ts:357-369`, which uses cosine similarity.
- **Claim:** A dot product is correct only for unit-length vectors. Local models use `normalize: true` (`src/ts/process/transformers.ts`) and OpenAI vectors are normalized. A **Custom (OpenAI-compatible)** endpoint may return vectors that are not, which would skew ranking by vector length.

## UI-1: The Type dropdown and the runtime disagree on priority

- **Severity:** Low
- **Status:** Unverified
- **Where:** `src/lib/Setting/Pages/OtherBotSettings.svelte:985-988` vs `src/ts/process/index.svelte.ts:1081-1145`
- **Claim:** The dropdown shows V3 > V2 > SupaMemory > Hanurai, but the runtime order is Hanurai > V2 > V3 > SupaMemory. With more than one flag set (not possible through the dropdown itself), the UI names a system other than the one that runs. The memory toggle label (`Toggles.svelte:194,209`) also reads "Toggle SupaMemory" while V2 is active.

## TOK-1: V2 and V3 exclude the response reservation, unlike Hanurai and SupaMemory

- **Severity:** Low. Intent unclear.
- **Status:** Unverified
- **Where:** `hypav2.ts:355-358` (commented "temporary fix"), `hypav3.ts:197`, `:976`. Clamp: `index.svelte.ts:1539-1542`.
- **Claim:** `currentTokens` enters memory with `maxResponse` included. V2 and V3 subtract it and never add it back, so they fill the prompt up to Max Context. Hanurai and SupaMemory keep it. The later clamp shrinks the output budget to what is left. Decide whether Max Context means input only or input plus output, and apply one rule to all systems.
