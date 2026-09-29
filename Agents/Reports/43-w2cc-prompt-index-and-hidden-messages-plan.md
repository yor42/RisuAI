# Report 43 — W2c-c: the prompt's index tags and hidden messages

**STATUS:** plan rev 3.1, 2026-09-29. **Gate 1 passed:** rounds 1 and 2 [REJECT] (rows 394,
395); round 3 [EDITORIAL] (row 396), applied in rev 3.1. Red tests (row 397), the fix (row 398).
**Gate 2 passed:** round 1 [REJECT] (row 399), remediated (row 400), round 2 [EDITORIAL] (row
401), applied. **Live check passed** (row 402). Commit-message check (row 403). **Committed** as
`d27a1ee4`, records the commit after it. Built from the inventory in ledger row 393 (scratchpad
`w2cc/inventory.md`) and the maintainer's answers recorded as `MC-118` and `MC-120`. Section 8 is
the gate record.

W2c-a (Report 40) and W2c-b (Report 42) bound every read the send's prompt makes to the chat the
send started in. W2c-c changes what those reads return inside that chat: the tags that read the
message index describe the message being processed, and nothing that builds the prompt reads a
message that is not sent to the model.

**Decisions this plan implements:**
- `MC-111`: in the prompt-building pass, the index tags describe the message being processed;
  walk-backs consider only sent messages. Walk-backs on the reply keep upstream's behaviour.
- `MC-112`: `{{messageidleduration}}` follows `MC-111` 2; a look-back that finds no earlier sent
  message returns the first message (or chosen greeting) only if it was sent, else nothing; the
  rule covers every parse that builds the prompt.
- `MC-113`: W2c-c delivers `MC-111` and `MC-112`, from a complete inventory.
- `MC-118`: a message's own tags are expanded at its own position when a send starts (hidden
  messages still expanded, their variable writes still run); the text-returning history tags skip
  hidden messages; the lorebook's keyword scan considers only sent messages. Its Orchestrator
  defaults (token copy follows the sent copy; `{{messageidleduration}}` keeps its strings; side
  requests out; the first message keeps index -1; Lua and trigger chat functions read the whole
  chat) are adopted here.
- `MC-120`: the start trigger's system-prompt effects are parsed under the prompt rule; every other
  trigger parse, and Lua's `cbs()`, keep reading the whole chat.
- `MC-119`: CHORE-45 is decided after the memory-footprint work that follows W2e.
- `MC-110` 1, `MC-104` 1, `MC-078`: the send's reads stay on its own chat; nothing here changes
  which chat a read resolves.
- Row 360 (the `senior-advisor` escalation): cache a prompt-pass result only when it is a function
  of its key. Row 361: bypassing costs about 50 ms per 1,000 messages on an i9 (best-case hardware).
- `MC-011`, `MC-089`: upstream data compatibility is the invariant; nothing ships between stages.

## 1. What is wrong at HEAD

Evidence: ledger rows 393 and 394 (probes at HEAD `dd41a43d`, scratchpad `w2cc/gate1/r1.log` and
`r2.log`), and Report 40 section 12 (rows 358-362). "The index" is the `chatID` a parse passes to
`risuChatParser`.

1. **The per-message script pass passes the position among sent messages, not the chat index**
   (`sendChatBody`'s message loop). With a disabled message or an `allBefore` reset before it,
   `{{chat_index}}`, `{{messagetime}}`, `{{messagedate}}`, `{{messageidleduration}}` and the
   walk-back tags in a script's `out` describe another message. The same loop parses each
   message's own text, and the group/`sendName` wrapper, at -1. (`@@inject` and `@@repeat_back`
   already address the real message since W2c-a.)
2. **Walk-backs read hidden messages.** `{{previouscharchat}}`, `{{previoususerchat}}`,
   `{{messageidleduration}}` and `@@repeat_back` (both its `@@` and its `<repeat_back>` form) walk
   over disabled and pre-reset messages, and fall back to the first message even in a group chat or
   after a reset.
3. **When a send starts, every message's own tags are expanded at -1** (`runCurrentChatFunction`,
   also after the reply and on each member turn), and the result is written into the stored chat.
   A tag in an edited or imported message is frozen with the wrong index or with hidden text. The
   same expansion after a non-streamed first reply stores `[Cannot get time]` and `null` for the
   reply's `{{messagetime}}` and `{{role}}` (probe A1: the reply's `editoutput` parse at
   `chatID = message.length` throws and leaves them literal, and the -1 expansion then fills them).
4. **The history tags return hidden messages:** `{{history}}` (with or without arguments),
   `{{userhistory}}`, `{{charhistory}}`, `{{lastmessage}}`, `{{previouschatlog::n}}`. `{{history}}`
   includes the first message even where it was not sent. Every branched chat ends with a disabled
   "branched from" comment, which `{{lastmessage}}` returns until a new message is added.
5. **The lorebook's keyword scan reads hidden messages** (`searchMatch` in `lorebook.svelte.ts`
   slices `chat.message` by scan depth), so hidden text activates entries, and hidden messages use
   up the scan depth. `additionalInformations` (`embedding/addinfo.ts`) builds its query from the
   first four messages, hidden or not.
6. **The start trigger's system-prompt effects** parse their text with no rule, so a walk-back or
   history tag there puts hidden text into the prompt.
7. **The script cache serves results that are not a function of its key** (row 360). A script's
   `out` is parsed, with the text around it, after the replace, and can read other messages,
   variables, the owner and the persona (including the legacy `<char>`/`<user>` forms: probe A6);
   `@@repeat_back` reads earlier messages; a `cbs` action parses `in` at execution. The key has
   none of these. So editing an earlier message leaves a later message's cached expansion in the
   next prompt (probe A3, stale at HEAD and upstream); disabling one moves the later message's
   position and so its key (probe A9), which the real index would no longer do. The HypaV3 modal
   and the plugin API call `editprocess` with the same keys and their own `chatRole`, and the
   prompt pass can be served their entries (probe A11: a user message's `{{role}}` prints `char`).

All seven are the same upstream.

## 2. The design

**One definition of "sent".** A message is hidden when it is `disabled === true`, or when it is
the latest `allBefore` message or anything before it; this is what `makeMs` sends. Whether the
first message (or chosen greeting) is sent is what the send's first-message branch decided: that
decision is taken once, before the start trigger, and every later rule uses it, not a
recomputation (a start trigger can remove a reset or drop `disabled` flags: `cutchat`,
`v2CutChat`, Lua `setFullChat`). `makeMs` and every rule below share one implementation of the
message part.

**The view describes the message list it is read against.** The hidden set is not fixed at one
moment of the send: a start trigger can replace the chat's message list (`cutchat`, `v2CutChat`,
Lua `setFullChat`) before a later effect is parsed, and a set indexed before that would describe
other messages. Each rule reads the hidden set of the list the parse is reading; when the list
changes, the set follows it. In the per-message pass it is exactly the set `makeMs` built the
request from.

**The prompt rule.** Every parse that builds the prompt carries a marker that it does, and the
tags consult it. Parses without the marker behave as at HEAD. The marker travels with the parse
call, not with the send's subject (the send's prompt and reply parses share one subject), and not
inside `CbsConditions`: the V3 plugin API spreads a plugin-supplied `cbsConditions` into its
calls, and a plugin must not be able to set or clear the marker.

Under the marker:
- **Walk-backs** (`{{previouscharchat}}`, `{{previoususerchat}}`, `{{messageidleduration}}`,
  `@@repeat_back` in both forms) skip hidden messages. When no earlier sent message qualifies, the
  two chat tags and `@@repeat_back` use the first message only if it was sent; otherwise the tags
  return `''` and `@@repeat_back` adds nothing. `{{messageidleduration}}` keeps its own strings;
  from a hidden message (the send-start expansion) it skips that message too.
- **History tags** (`MC-118` 2) skip hidden messages; `{{previouschatlog::n}}` returns `''` for a
  hidden index; `{{history}}` includes the first message only if it was sent. `{{lastmessageid}}`,
  `{{messageunixtimearray}}`, `{{idleduration}}`, `{{pick}}`/`{{rollp}}` and `{{firstmsgindex}}`
  keep upstream's reads.
- **Tags at -1 keep their -1 behaviour**, with the walks above filtered: `{{previouscharchat}}` at
  -1 walks from the end over sent messages; `{{previoususerchat}}` at -1 still returns `''`.

**The index.** In the parses done per message (its own text, the script pass, the group/`sendName`
wrapper), the index is the message's chat index. The loop's sent position stays what it is for
the things that count sent messages (the `<Thoughts>` depth test). When a send starts, each
message's own tags are expanded at its own chat index under the marker (`MC-118` 1); every message
is still expanded, `runVar` still set, the result still written into the chat, in all three places
that expansion runs. After a non-streamed first reply, that expansion therefore fills the reply's
`{{messagetime}}` and `{{role}}` with its real time and role (section 1 item 3). The first message
keeps -1; every other prompt parse keeps -1.

**Which parses carry the marker** (row 393 section 1; the completeness test pins it as "every
parse the send makes, except the named exclusions"):
- the send-start expansion (`runCurrentChatFunction`, all three calls);
- in `sendChatBody`: main, jailbreak and global note; the author's note and its default; the
  description, personality and scenario parts, and the parse of `additionalInformations`' result;
  the lorebook prompt parses, including depth entries in both the token and the build pass; the
  persona block; the template cards and their `chatML` items in both passes; the example
  messages; the first message and its script pass; each message's own text, its script pass (with
  the pass's own parse, the `in` parses, the key's `<cbs>` parse and the `out` parses) and its
  group wrapper; `pushPromptInfoBody`; the bias strings; `depth_prompt`;
- the lorebook's own token-budget parse of an entry during the send's scan;
- the send's start trigger's `systemprompt` and `v2SystemPrompt` value parses (`MC-120`),
  including those of every run started within the start trigger's run (`runtrigger`,
  `v2RunTrigger`, at any nesting depth), whose system-prompt text is handed back into the same
  prompt. A manual run started anywhere else does not carry the marker.

**Not under the marker, by decision:** the reply's `editoutput` pass, including its own parse of
the reply text before any script runs (`MC-111` 2: tags the model writes are expanded there, with
upstream walk-backs); the user's input parse (`editinput`, before the message exists); every other
trigger parse and the `editRequest` Lua's `cbs()` and chat functions (`MC-120`, `MC-118`
defaults); the memory summarizers' prompts, the image-prompt request and a trigger's LLM call
(side requests); request parameters (the Node/ooba stop strings, the JSON-schema parses in
`templates/jsonSchema.ts`); display, the translator, the HypaV3 modal and the plugin API.

**The lorebook scan and additional info** (`MC-118` 3). When the send runs the scan, the keyword
match and its scan depth use only sent messages; `activate_only_after` and
`activate_only_every` keep counting the whole chat. The scan from Lua, the `/` command and the
DevTool keeps reading the whole chat. `additionalInformations` builds its query from the first
four sent messages: the same reasoning as `MC-118` 3 (hidden text must not choose what reaches
the prompt), extended here as a scope amendment (`MC-091`) and disclosed with this plan.

**The script cache.** A prompt-pass call (the first message's and each message's script pass) is
served from the cache, and stores into it, only when its result is a function of its key and the
run has no side effect a hit would skip. The decision is made on the key's own inputs, before the
lookup, so that any entry under that key, whichever caller wrote it, is the prompt pass's result
too. The minimum conservative test:
- no script of the mode has an `out` starting with `@@` other than `@@move_top`/`@@move_bottom`;
- none has the `repeat_back`, `inject` or `cbs` action, or a flag containing `<cbs>`;
- none has `{` or `<` in its `out`;
- the pass's text after its own parse (the key's `data`) contains no `{` or `<`. A replace can
  join fragments of the text into a tag (probe B1: `hi {x{lastmessage}}` with an empty `out` for
  `x(?=\{last)` becomes a live `{{lastmessage}}`), and every `out`-parse is the identity only when
  neither the text nor any `out` holds either character.

A call that fails the test neither reads nor writes the cache. Calls outside the prompt pass keep
HEAD's cache use, except that they can no longer be served an entry the prompt pass stored from
an impure run (it stores none). With the real index as the pass's `chatID`, no caller passes a
message reference whose index differs from `chatID` (the reply's references use the reply's
index; the first non-streamed reply passes none), so W2c-a's reference suffix on the key becomes
unreachable and is removed.

**CHORE-45 is not folded in** (`MC-119`): it is decided after the memory-footprint work that
follows W2e. W2c-c decides which prompt-pass results may be cached; the capacity cliff affects
cacheable lists the same before and after.

**Mechanism (non-normative).** A parser option carrying the marker and the send's first-message
decision, and a hidden set computed by the function `makeMs` also uses, looked up in constant time
per index. `makeMs` publishes the set it built for the per-message pass and every later parse.
Inside the start trigger's run, each system-prompt parse builds its set from the list as it stands
at that parse: Lua `removeChat`, `addChat` and `insertChat` edit the list in place (`splice`,
`push`), so a set keyed on the list's identity and length would go stale (a removal plus an
addition keeps both and shifts every later index). The builds are bounded by the number of
effects. Any memo is scoped to one send and does not rely on the send's entry replacing the list.
`processScriptFull` takes the option and passes it to its own parses and to the cache test.
`runTrigger` takes it for the start trigger and hands it on to every run started within the start
trigger's run, at any depth. The coder may choose another shape that meets section 4.

## 3. Scope

**In:** `src/ts/process/index.svelte.ts` (the shared definition, the marker on every listed
parse, the per-message index, the send-start expansion); `src/ts/cbs.ts` (the walk-back and
history tags); `src/ts/parser/parser.svelte.ts` (the option on the parser's arguments);
`src/ts/parser/chatML.ts` (passing the marker through `parseChatML` for the prompt's `chatML`
items); `src/ts/process/scripts.ts` (the marker in the pass, `@@repeat_back`, the cache test, the
suffix's removal); `src/ts/process/triggers.ts` (the two system-prompt effects);
`src/ts/process/lorebook.svelte.ts` (the send's scan); `src/ts/process/embedding/addinfo.ts`;
`src/ts/process/exampleMessages.ts`. Tests under `src/ts/process/tests/`, extending W2c-b's
harness. Records: this report, the ledger, `Live-State.md`, `Carry-Forward.md`.

**Out:**
- the reply's `editoutput` pass (`MC-111` 2);
- CHORE-45 (`MC-119`);
- which chat a read resolves (W2c-a, W2c-b; `MC-110` 1);
- the group-chat speaker lookup in `risuChatParser` (it reads the last message's speaker, not its
  text);
- whether a character switch clears the cache (row 393, not settled): moot for the prompt pass,
  which reads only entries whose result the key determines.

## 4. Invariants

- **S1 (one definition).** "Sent" in every rule is what the request is built from: the messages
  `makeMs` sends, and the first message exactly when the first-message branch sent it. A rule's
  hidden set always describes the message list the parse reads, including after a trigger
  replaces that list.
- **S2 (index).** In the per-message parses, and in the send-start expansion, every index tag
  describes the message itself: its chat index, its time, its role.
- **S3 (walk-backs).** Under the marker, a walk-back never returns, measures or copies a hidden
  message; its fallback is the first message (or chosen greeting) only if that was sent, else
  nothing.
- **S4 (history).** Under the marker, `{{history}}`, `{{userhistory}}`, `{{charhistory}}`,
  `{{lastmessage}}` and `{{previouschatlog::n}}` never return hidden text; `{{lastmessageid}}` and
  the count and time tags return what they return at HEAD.
- **S5 (completeness).** Every parse the send makes carries the marker except the exclusions named
  in section 2; no parse outside the send carries it; a plugin cannot set it. The token-count copy
  of a parse carries exactly the options of its build copy.
- **S6 (others unchanged).** The reply's `editoutput` pass, the input parse, trigger and Lua runs
  other than `MC-120` 1, side requests, display, the translator, the HypaV3 modal and the plugin
  API produce what they produce at HEAD, except that the modal and the plugin API are no longer
  served the prompt pass's impure entries.
- **S7 (send-start expansion).** Every message is still expanded and its variable writes still
  run, hidden ones included; the stored result, and chat variables set from it, differ from HEAD
  only where a tag's value depends on the index or on hidden messages.
- **S8 (lore and additional info).** In the send's scan, a keyword found only in hidden messages
  activates nothing, and the scan depth counts sent messages; the turn-count decorators and the
  scans outside the send are unchanged. `additionalInformations`' query holds only sent messages.
- **S9 (cache).** A prompt-pass call is served from the cache only when running its scripts would
  produce the same text with no side effect, whichever caller stored the entry; it stores nothing
  else. The decision depends only on the key's inputs. Cacheable lists keep hitting
  on a repeat send (below CHORE-45's cliff).
- **S10 (cost).** Deciding whether a message is hidden costs constant time per lookup; no tag or
  script scans the chat to decide it (row 358 N2: an `indexOf` per message made the pass quadratic
  on a proxied database).
- **S11 (binding).** W2c-a's and W2c-b's invariants hold: every read is on the send's own chat;
  `@@inject` writes the message it addresses; `MC-078` and `MC-104` 1 as before.

## 5. Tests (written before the fix; red at HEAD unless marked guard)

Harness: W2c-b's node suite (`sendChatPromptReads.svelte.test.ts`: the real `sendChat`, parser,
CBS, scripts, lorebook and chatML, capturing the request at the `requestChatData` mock, with the
parser spy) and its happy-dom suite for identity and cost. Both mock the trigger engine, so the
start-trigger cases (tests 2 and 7) need a suite that runs the real `triggers.ts` and Lua
(wasmoon), as W2c-a's harness spike did (row 356). Each reproducer fails at HEAD on its named
behaviour, not on setup, and its fixture gives HEAD the wrong value to return.

An existing guard pins HEAD's behaviour and becomes a reproducer: `sendChatScriptsOrigin`'s guard
that "the index tags of the prompt pass keep the position among the sent messages" (it expects
`c4 i=3 p=c1 T1`). Its title and expectation change to the chat index and the walk over sent
messages.

1. `{{chat_index}}`, `{{messagetime}}` and `{{messagedate}}` in an `editprocess` `out`, in a chat
   with a disabled message and with a reset, print the processed message's chat index and time.
2. `{{previouscharchat}}`/`{{previoususerchat}}` in an `out` skip a disabled message of that role;
   do not cross a reset; after a reset, and in a group chat, return `''` where HEAD returns the
   first message; outside those, fall back to the first message (guard) and to the chosen
   alternate greeting (guard). A start trigger that removes the reset (`cutchat`, or Lua
   `setFullChat`) does not make the fallback return the unsent greeting.
   (The start-trigger case runs in the real-trigger suite.)
3. `{{messageidleduration}}` skips a disabled user message between two sent ones.
4. `@@repeat_back`, and the `<repeat_back>` flag form, skip a disabled same-role message; after a
   reset, with a matching earlier same-role message and a matching greeting before it (so HEAD
   adds text), add nothing.
5. Each message's own text and the group wrapper expand `{{chat_index}}` to the message's index,
   reached through a `{{getvar}}` indirection so the tag survives the send-start expansion.
6. The send-start expansion: a stored message holding `{{chat_index}}` and `{{previouscharchat}}`
   is saved with its own index and the nearest earlier sent `char` message; a disabled message is
   still expanded (guard) and its `{{setvar}}` still runs (guard); a disabled message's own
   `{{messageidleduration}}` skips itself; after a non-streamed first reply, the reply's
   `{{messagetime}}` and `{{role}}` are stored with its real time and role.
7. The history tags in the description, in a template card, in a `chatML` item and in a start
   trigger's system-prompt effect: a branched chat's trailing disabled comment is not returned by
   `{{lastmessage}}`; `{{history}}` (both forms), `{{userhistory}}`, `{{charhistory}}` omit
   disabled and pre-reset messages and a first message not sent; `{{previouschatlog::n}}` on a
   hidden index returns `''`; `{{lastmessageid}}` is unchanged (guard); a trigger's variable effect
   still reads the whole chat (guard). In the real-trigger suite: a manual trigger run by the
   start trigger, whose `v2SystemPrompt` is `{{lastmessage}}`, does not return a branched chat's
   disabled comment; after a start-trigger `cutchat` of range 1..3 over `[c0, c1 (disabled), u2]`
   (so the indices shift), a later system-prompt effect's `{{previouscharchat}}` does not return
   c1's text; after a start-trigger Lua `removeChat(0)` then `addChat` over
   `[c0, D (disabled), u2]` (same list, same length, indices shifted), a later system-prompt
   `{{history}}` does not contain D's text; a manual run started outside a send is unchanged
   (guard).
8. The lorebook: a keyword only in a disabled message within the scan depth activates nothing; a
   keyword whose message is within depth only when hidden messages are not counted activates; the
   turn-count decorators are unchanged (guard); the Lua scan (`scriptings.ts`) still reads the
   whole chat (guard).
9. `additionalInformations` queries with sent messages only.
10. The cache, asserting on the later message's own expansion in the second prompt:
    - with a list whose `out` reads `{{previouscharchat}}`, editing an earlier `char` message
      between two sends changes the later message's expansion;
    - the same with a `<repeat_back>` flag-form list whose `out` is plain text;
    - with `out` `hi to <char>`, two characters with an identical preset list and identical text
      each get their own name;
    - with a `{{role}}` `out`, a plugin-API `editprocess` call on the same text and index with
      another `chatRole` does not change the prompt;
    - a message `hi {x{lastmessage}}` with an empty-`out` script for `x(?=\{last)`: after a
      plugin-API `editprocess` call on the same text and index stores its result, the prompt does
      not contain a disabled message's text (probe B1);
    - a plain-replace list is served from the cache on a repeat send (guard, a hit counter).
11. The reply's `editoutput` walk-back still crosses a disabled message (guard, `MC-111` 2); the
    HypaV3 modal's and the plugin API's `editprocess` output is unchanged (guard).
12. Completeness, as an exclusion list: for a send exercising every parse in section 2, every
    top-level parse the parser spy records carries the marker, except a named exclusion set
    identified by seeded text (the reply's pass, the input parse, other trigger effects, Lua, the
    summarizers); each token-count parse carries the options of its build copy; a plugin-API call
    with a `cbsConditions` naming the marker's field does not carry it.
13. Cost: in the happy-dom suite (proxied database) a send over 1,000 and over 2,000 messages with
    a walk-back `out`, with the chat's element reads counted: the count grows linearly (a
    generous ratio bound), and the view is built a bounded number of times per send.

## 6. Risks

- **Cards that rely on the old values.** A card whose `editprocess` script counts with
  `{{chat_index}}` gets the chat index instead of the sent position when messages are disabled.
  `MC-111` decides this; the changelog should say so.
- **Stored text changes.** The send-start expansion writes different text than upstream for
  messages still holding index or walk-back tags, and chat variables set from them change too. The
  text stays plain text; upstream reads it.
- **Hidden text can still reach a prompt through decided paths:** a tag expanded while its target
  was sent stays in the stored text after the target is hidden (`MC-118` 1 keeps saving the
  result); tags the model writes are expanded by the reply's pass with upstream walk-backs
  (`MC-111` 2) and stored; a user's typed tags are expanded at input.
- **Cost on impure lists.** An impure list pays the uncached pass on every send: about 50 ms per
  1,000 messages on the i9 (row 361); slower devices pay more (an estimate, not measured). A
  history tag in an impure `out` makes that pass quadratic in the message count on every send,
  where HEAD cached it after the first. At 999+ messages HEAD already misses (CHORE-45). An
  `@@emo` list runs on every message on every send, as HEAD does on a first send.
- **A missed parse.** The inventory is source-traced and the completeness test pins it as an
  exclusion list; a parse added later without the marker fails that test.
- **Branched chats** change output where cards read `{{lastmessage}}` right after a branch.

## 7. Compatibility

No save-format, card, module, preset or plugin API change. The parser's arguments gain one internal
option, outside `CbsConditions`; a plugin's own `risuChatParser` or `processScriptFull` call,
which cannot set it, behaves as at HEAD. Stored messages remain text. Every behaviour change is a
decided one (`MC-111`, `MC-112`, `MC-118`, `MC-120`) and is listed in section 1.

## 8. Gate record

Inventory: ledger row 393. Maintainer decisions: `MC-118` (and the defaults it records), `MC-119`,
`MC-120`.

**Gate 1 round 1, `opus-reviewer` (fresh), rev 1: [REJECT]** (ledger row 394;
`w2cc/gate1/round1.md`; probes at HEAD `dd41a43d`, `r1.log` and `r2.log`). The design and the
parse list held; W2c-a's M1,
M2, P1 and D1 are closed. Findings and rev 2's answers:
- M1 (MAJOR): the purity test missed the flag forms (`<repeat_back>`, `<inject>`), the legacy
  `<char>` tags and the text around `out`. Rev 2: the conservative syntactic test in section 2,
  with the observed check; test 10 gains the flag-form and legacy cases.
- T1 (MAJOR, test): test 10's first half passed at HEAD. Rev 2 asserts on the later message's
  expansion.
- N1: the first message's sent state is the branch's decision, carried (section 2, S1, test 2).
- N2: the start trigger's parses needed a maintainer answer: `MC-120` (section 2, test 7).
- N3: the marker stays out of `CbsConditions` (section 2, S5, section 7, test 12).
- N4-N8 (tests 5, 4, 8, 12, 13): applied.
- E1: model-written tags are expanded by the reply's pass (section 2, section 6). E2: section 1 item
  3 now states HEAD's stored values; rev 2 fixes them (no chore). E3: section 1 item 7. E4: the
  suffix is removed. E5: section 6. E6: section 2's lists, S6, S7, section 6.
- Optional notes taken: the `<Thoughts>` depth keeps the sent position; `@@emo` in the risks; a
  hidden message's own `{{messageidleduration}}` (test 6).

**Gate 1 round 2, the same reviewer, rev 2: [REJECT]** (ledger row 395; `w2cc/gate1/round2.md`;
probe B1 in `r3.log`). Every round-1 finding resolved; the syntactic cache clauses cover every
`executeScript` branch that reads outside the key or has a side effect. New:
- R1 (MAJOR): `MC-120` applied incompletely. Manual triggers run by the start trigger
  (`runtrigger`, `v2RunTrigger`) hand system-prompt text back into the same prompt and build a
  fresh argument object; and a `cutchat` or `setFullChat` inside the start trigger replaces the
  list a pre-trigger hidden set describes. Rev 3: the marker passes to those nested runs only; the
  hidden set follows the list it describes (section 2, S1, test 7).
- R2 (MINOR): the observed check gated storing but not reading, so an entry the plugin API or the
  modal stored could be served (B1). Rev 3: the decision is on the key's inputs, before the lookup
  (section 2, S9, test 10).
- R3 (MINOR, test): the named harness mocks the trigger engine. Rev 3: a real-trigger suite for
  tests 2 and 7.
- R4 (MINOR, test): `sendChatScriptsOrigin`'s guard pins the sent position. Rev 3: it becomes a
  reproducer (section 5).

**The Orchestrator's question at the second rejection: is the mechanism the problem?** Both R1's
list replacement and R2 came from deciding on the wrong thing: a hidden set fixed at one moment
rather than tied to the list it describes, and a cache decision taken on a run's output rather
than on its key. Rev 3 changes both at that level instead of adding guards. R1's nested runs are a
coverage gap in `MC-120`'s application, not a mechanism defect.

**Gate 1 round 3, the same reviewer, rev 3: [EDITORIAL]** (ledger row 396;
`w2cc/gate1/round3.md`). R1-R4 resolved. The key-input cache condition is sound for entries any
caller writes; the nested-run propagation covers every path to the system-prompt text. Corrections,
applied in rev 3.1:
- the mechanism note: identity and length do not detect Lua's in-place `removeChat`/`addChat`/
  `insertChat` (the Orchestrator re-read the `splice`/`push` calls); each system-prompt parse builds
  its set from the list as it stands, and nothing relies on the entry replacing the list;
- test 7: the in-place Lua case, and the `cutchat` case's range;
- the propagation is to every run within the start trigger's run, at any depth.
Gate 2 checks S1 against in-place edits.

**The build (tests first).** Red tests (ledger row 397): 61 reproducers fail at HEAD on their named
value, every guard passes; a new suite runs the real trigger engine and Lua. The fix (row 398) in
the nine files of section 3. Deviation, ruled sound at Gate 2: the per-message chat index travels
inside the marker (`PromptView.at`), because a W2c-b guard pins those parses' option keys.
Pre-gate snapshot: `pnpm test` 178 files, 2,801 passed, 4 skipped; `pnpm check` clean; the build
passes.

**Gate 2 round 1, `opus-reviewer` (fresh): [REJECT]** (row 399; `w2cc/gate2/round1.md`; 69
mutants).
- M1 (MAJOR, test): four stale-view mutants survived (a memo keyed on list identity and length; one
  view per trigger run; the first-message state recomputed; no rebuild after the start trigger).
- M2 (MAJOR): `@@repeat_back` walked the live list but judged hidden-ness by the pre-pass index, so a
  message removed during the pass put a disabled message's text in the prompt (probe P1).
- m1 (MINOR): a regex script with no `out` failed every send.
- m2, E1: a test title and a `triggers.ts` comment.

**Remediation** (row 400): tests first (T1-T4, the M2 and m1 cases, the optional O1, O2, O5, O6),
then the fix: hidden-ness is judged on the message itself (a set of the hidden message objects),
and a non-string `out` or `flag` makes a pass not cacheable.

**Gate 2 round 2, the same reviewer: [EDITORIAL], Gate 2 passed** (row 401;
`w2cc/gate2/round2.md`; 72 mutants, 67 killed). Of the five survivors, three are stale-view
mutants that matter only when a start trigger removes the reset while keeping the messages before
it, or inserts a message before the reset (the tree is correct there); one is equivalent
(`sc_flag_nonstring`) and one is the reviewer's own synthetic mutant (`sc_repeat_index_view`).
Applied by the Orchestrator: the seven M2 and m1 tests pass at HEAD, so they are titled `guard:`;
region 14's header limits its claim to hidden-ness; the recorded-options guard's title names
`promptView`.

**Live check: passed** (row 402). A production build: the prompt preview showed the chat index,
a walk-back over a disabled message, `{{lastmessage}}` past a trailing disabled comment and the
send-start expansion at its own index; no disabled text in the request; an Echo send completed.

**Commit-message check (row 403; the Gate 2 reviewer): [EDITORIAL], applied.** The pre-fix count
(78 fail at HEAD, no guard) and the cache conditions verified; corrected: the two "still as
upstream" sentences, the branched-chat sentence, the subject line, and this report's mutant count
and disclosure.

**Disclosed to the maintainer after Gate 2:** messages deleted during the prompt build shift where a
walk-back tag starts by the number removed before it, so it can even find its own message (the same
at HEAD; hidden messages are still never taken); a plugin or V3 call that swaps in new message
objects mid-send makes the walk-back and history tags parsed after it read every message as sent,
as HEAD always does, while what the request sends is unaffected.

**Disclosed to the maintainer with this plan:** `additionalInformations` follows `MC-118` 3; a
user's typed tags are expanded at input, before the message is in the chat, and stay upstream's;
tags the model writes are expanded by the reply's pass with upstream walk-backs; CHORE-45 stays
separate (`MC-119`).
