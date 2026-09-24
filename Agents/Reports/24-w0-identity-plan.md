# W0 — Identity: every chat has a stable id; the origin module

**STATUS:** open

**Status:** plan rev 4.2, 2026-09-24. Rev 4.2 drops id inheritance on install (ID-4) after Gate 2
rounds 1 and 2 rejected it; see section 12.
- Gate 1 rejected rev 1, rev 2 and rev 3 (section 12).
- After the third rejection this was escalated to `senior-advisor` (ledger row 168), and the
  maintainer decided the open question (`MC-078`).
- **Gate 1 round 4 approved rev 4 with findings** (ledger row 170), and rev 4.1 folds them in.
- A duplicate `chaId` loses a whole character at the next save. This is pre-existing and affects
  upstream too. It goes to CHORE-28, straight after W0 (`MC-079`).
- Ready for implementation.

This is the first stage of the writer rework (Report 23, `MC-073` to `MC-076`).

**Evidence:**
- ledger row 164, the evidence packet;
- rows 165 to 167, Gate 1 rounds 1 to 3;
- row 168, the escalation;
- row 169, the four follow-up checks.

The Orchestrator re-read the source for every finding it acted on.

**Maintainer context:**
- `MC-011`: compatibility; the fork has never shipped.
- `MC-072`: the composer keys drafts on this identity.
- `MC-073`: no switch lock.
- `MC-074`: multiuser is out of scope.
- `MC-075`: a write whose origin chat is gone drops silently, and deleting a chat while it is being written to asks first (W2).
- `MC-076`: the stage order.
- `MC-078`: a write whose target id has two holders is skipped with a warning, never guessed.

---

## 1. Scope

W0 builds chat identity and the origin module. **It binds no writer.** No trigger, CBS, Lua, send
or `/` command changes behaviour in this stage; W1 to W3 do that on top of it.

W0 changes these things for users:
- the id fills in section 3;
- the import id rule;
- the two New Chat bugs in section 4;
- a warning when a plugin creates a duplicate id;
- one sentence in the plugin docs.

Out of scope:
- every caller of the origin module (W1 to W3);
- the delete warning (W2);
- `SendChatCallContext` (W2);
- multiuser (`MC-074`).

## 2. What already holds (no change)

- **Boot repairs ids.** `assignIds` walks `characters` in array order and keeps one set for the
  whole database, holding `chaId`s and chat ids together. A missing id gets a fresh one. So does
  an id already in the set, from any character or chat of either kind. The first holder by
  position keeps the id. Boot saves at once. The repair is safe because at boot nothing (no unit
  of work, draft or plugin call) can hold a reference to an id. **W0 leaves it unchanged, and it
  stays the only code that reassigns a present id.**
- **Save format.** `chat.id` is an optional field already in upstream's type, and adding one is
  invisible to an upstream build.
- **Ids are opaque strings.** Most are uuid v4. Others exist: `§playground`, multiuser's `§temp`,
  and ids from files or plugins.
- **Cold storage.** `makeColdData` runs only at boot, before `assignIds`. The `coldstorage` field
  marks a placeholder reliably. Only `changeChar` restores one, and the `characterFormatUpdate` it
  then calls fills every missing chat id.
- **These paths already assign a fresh id:** Branch, both Copy handlers, `SideChatList`'s New
  Chat, and the JSON v2, `risuChat` v1 and `.jsonl` imports.
- **`chaId` stability.** No character-duplicate feature exists. No runtime path outside boot,
  `characterFormatUpdate` and multiuser reassigns a `chaId`. Groups share the `chaId` space.
- **Display mode.** A display-mode trigger's `setVar` writes only temporary variables, so a
  display-mode run needs no origin.
- **Branch links store the source chat's id.** `changeChatTo(id)` opens the first chat of the
  current character with that id, which is another reason an id must never move.
- **Plugin docs promise positions, not identity** (ledger row 169, check 3):
  - `plugins.md`: "Character & Chat by Index — access characters and chats by their position".
  - `risuai.d.ts`: "Saves a chat at a specific index".
  - Nothing is said about `chat.id` or `chaId`.
- **A plugin swap can't lose a save block** (ledger row 169, check 2; run with existing tests).
  Between two `setCharacterToIndex` calls, the identity tracker marks only the incoming
  `chaId`. `prepareSaveIteration`'s no-reload branch also drops ids that are absent from
  `characters` before the encoder runs, so no block is deleted without a reload. Chat swaps
  mark the owning character on each call.
- **v2.1 plugins get the live database.** `getDatabase()` returns a proxy over `DBState.db`, so
  `setDatabaseLite(getDatabase())` receives the live objects, including chats the plugin inserted
  in place (run).

## 3. Identity invariants

**Principle.** An id is the plugin's declaration of what it wants:
- **An id-less object asks for positional handling,** as upstream gives it.
- **An object carrying an id asks for identity handling.**

The app never infers intent and never overwrites the declaration. Which holder of a duplicate is
"real" cannot be decided from anything the app observes: v3 setters receive clones, one call per
task; copy idioms carry the old id; a swap is a sequence of calls. **So nothing at runtime ever
decides it.**

**ID-1: id at creation.** Every chat the app itself creates has an `id` from the moment it enters
a `chats` array. The sites that omit one today:
- `ChatList.svelte`'s New Chat;
- `createNewGroup`'s first chat;
- `createBlankChar`, a new character's first chat. The same fix covers its other callers:
  Playground, `convertModuleToCharacter` and `convertPersonaToCharacter`;
- `characterFormatUpdate`'s empty-chats fallback;
- both `characterCards.ts` import literals. Today these only get an id at the first `changeChar`
  or the next boot;
- the cold-storage placeholder chat.

The implementer re-runs the survey (`chats.unshift|push|splice`, `chats: [{`, and any chat
literal or copy assigned into a `chats` array), and the code review checks the list.

**ID-2: imports get a fresh id.** Every chat import gives every imported chat a fresh id. This
moves HTML import and `risuAllChats` v1 into line with the other import paths.
- Consequence, recorded rather than fixed: a `branchedfrom` link between chats in one imported
  file no longer resolves. The upstream JSON v2 path behaves the same way.

**ID-3: a present id never changes or moves at runtime.** No runtime code assigns an id to an
object **already in the database** that has one, or gives such an object's id to a different
object. Boot's repair (section 2) is the only exception, together with its run after the three
backup loads (ID-4). The app's own new objects get a fresh id, even when they are copied from an
object that has one. Examples are Branch, Copy (ID-1) and imports (ID-2).

**ID-4: every install route fills missing ids, and only missing ids, before it assigns.**
Filling afterwards is invisible through the `$state` proxy once the property has been read. For
v2.1 routes the incoming objects are the live ones, so the fill writes to them directly.

The rule for a missing id: **every missing id is fresh. Nothing inherits** (rev 4.2).
- A missing id is never taken from the object being replaced. This covers a chat id in
  `setChatToIndex`, and a `chaId` in `setCharacterToIndex` and `setChar`.
- A chat id inside a character or database install is never taken by position.
- **Why nothing inherits.** Deciding which existing object an id-less install stands for is a
  guess, and it cannot be made safely one call at a time.
  - A swap installed in either order can hand an id to a second holder. So can a three-way
    rotation. Gate 2 rounds 1 and 2 ran both orders.
  - The next call then puts the id back on its original holder, leaving two holders of one id.
  - A duplicate `chaId` loses a character at the next save (CHORE-28).
  - A fresh id, at worst, makes a write in flight drop (`MC-075`). This is the same "never
    guess" principle as ID-5 and `MC-078`.
- **Consequences, recorded rather than fixed.**
  - **A plugin that rewrites an object without its id gives it a new identity.** From W2 on, an
    origin for the replaced chat or character is gone: a reply in flight for it drops, and its
    composer draft is orphaned. At HEAD the frozen-index write lands it and overwrites the
    plugin's edit. HEAD also gives that object a fresh id, but only at the next boot.
  - **The replaced character's save block is not deleted without a full encoder reload.** Stale
    copies can come back after a reload, and they accumulate: each id-less install leaves one
    more block, so 30 installs bring back about 30 copies. Gate 2 round 3 ran this. At HEAD the
    id-less character reuses a single block key instead, and can lose its newest content. No
    content is lost. This belongs in CHORE-29's scope: deleting the replaced block fixes both.
  - A plugin that keeps the object's id keeps its identity. The plugin docs say to keep ids, and
    to drop or regenerate them only on a copy.

Further rules:
- `setChar` with nothing selected (`selectedCharID` is −1) fills a fresh `chaId` like everything
  else. The write itself is a pre-existing bug (section 10).
- The fill reads only the incoming value and never scans the database. The duplicate warning
  (ID-5) is the only per-install scan.
- It tolerates malformed input without throwing: a character with no `chats`, and a chat
  missing fields, are left as the install would have left them.

The routes (Gate 1 rounds 2 and 3 checked this list as complete):
- v3 `setChatToIndex` and `setCharacterToIndex`;
- v2.1 `setChar`, which is also v3's `setChar` and `setCharacter`;
- plugin `setDatabase` and `setDatabaseLite`, and their v3 re-exports. These fill every
  character and chat in the incoming `characters`;
- `loadInternalBackup`, `loadRisuAccountBackup` and the Kei restore. These call `setDatabase`
  without reloading. Each runs boot's repair on the **decoded backup before `setDatabase`
  installs it**, having first normalised what boot's `checkNewFormat` normalises before
  `assignIds`, including `chats ??= []`. At that point the backup is the whole new database, so
  there is nothing else to dedupe against.
  - A malformed backup that still throws aborts the load before anything is replaced. It can
    never leave a merged restore, which would bring back characters the backup does not hold.
  - The repair edits the plain object before it enters `$state`. Edits made to it afterwards
    would be invisible through the proxy.
  - `requiresFullEncoderReload.state = true` stays where it is, after `setDatabase`.

  These loads
  do not check `doingChat` or the registry. Work that straddles a backup load keeps its origins,
  and they resolve against the new database. Only a duplicate that the old database also held
  can be affected; that is a W2 residual (section 10).

The cold-storage restore is already covered by `characterFormatUpdate` (section 2) and gets a
scenario.

**ID-5: duplicates are reported, never repaired, at runtime.**
- **Detection.** Both holders of a duplicate are always left untouched. A warning is logged when
  the incoming value holds an id twice or more where the database just before the call did not.
  This is a noise filter, and it is not complete:
  - chat ids are compared within the installed character only;
  - for a character whose `chaId` already has two holders, a per-slot install reports nothing
    about its chats, and a database install compares it against only one of the holders;
  - duplicates made in place on live objects are not seen.

  The warning **reports the state after the call, not blame** (Gate 2 round 4). It says:
  - which id now has more than one holder;
  - that this may be transient, or may predate the call;
  - what that means: writes addressed by id to either holder are skipped, and for a `chaId`
    the next save keeps only one character.

  Deciding from one call whether that call created the duplicate is undecidable across a
  sequence of calls, for the same reason identity is (section 3's principle). A swap whose
  pre-existing duplicate is on the character installed second shows this. The rule "warn only
  when the call raised the count" stays as a noise filter, not as a verdict.
  - For a chat id, the check is within the owner. For a `chaId`, it is database-wide.
  - The warning says the duplicate may be transient: the first call of a swap made with two
    per-slot setters always leaves one, and that is not a defect.
  - The warning never claims the calling plugin made the duplicate.
  - The plugin is named only on v3 routes, where `makeRisuaiAPIV3` has it in scope. The
    re-exported setters and `setChatToIndexImpl` need a wrapper that carries it. v2.1 plugins
    share one `__pluginApis__` object, so their warning names no plugin.
- **Cost.**
  - A per-slot setter checks one `chaId` against the database, about 0.75 ms (ledger row 169,
    check 1). It reassigns nothing, so it is not the rejected seed.
  - `setDatabase` and `setDatabaseLite` must not add a cost comparable to their own.
    - Gate 2 round 2 measured `setDatabaseLite` at 1000 × 20 going from 16.6 ms to 83.3 ms
      (i9, dev build), mostly the duplicate walk.
    - When the incoming `characters` is the live array (the v2.1 idiom), nothing can be
      introduced, so the walk is skipped.
    - Otherwise only ids that occur twice or more in the incoming value are compared with the
      earlier counts.
    - Gate 2 round 3 measured HEAD against W0 in one session: an i9 on P-cores, production-mode
      Svelte, 1000 × 20. All figures are best case; Pi and phones are several times slower, and
      the cost scales with the total number of chats.
      - The duplicate walk now costs about nothing on the live idiom.
      - **The fill itself does not.** It reads every chat id through the `$state` proxy, so
        `setDatabaseLite(getDatabase())` goes from about 0.6 ms to about 9.5 ms, and to about
        24 ms on cold proxies. These are the figures after the indexed loop, re-measured in the
        fix-up review of round 4; round 3 measured about 13 ms and 28 ms before that change.
      - Setting that cost against scenario 11 (a v2.1 plugin can `unshift` an id-less chat
        in place) and against the call's own consequence, the Orchestrator **accepts it**: the call
        already marks every character, so the next save re-encodes all of them, which costs far
        more.
      - The implementation takes the constant-factor gains: an indexed loop, and skipping the
        per-character chat-id count for incoming characters that are the same objects as before.
      - `setDatabase` with a snapshot costs +11%, and per-slot setters add at most about 0.75 ms.
- **Plugin docs.** `risuai.d.ts` and `plugins.md` gain a sentence: `chat.id` and `chaId` must be
  unique, and a copy of a chat or character must drop or regenerate them.

**ID-6: the live proxy is filled at `beginWork`.** A v2.1 plugin can `unshift` an id-less chat
through the live proxy without calling any install API. `beginWork` (O-7) fills a missing chat id
or `chaId` on the live objects it is given, with a fresh id, and marks the character. It never
reassigns a present id.

**Not guaranteed (recorded in section 10):**
- **For a duplicate chat id:** which holder keeps the id at the next boot. It is the first by
  position, as upstream does, and drafts and branch links follow that choice. Both chats survive,
  because they share one character block.
- **For a duplicate `chaId`: that both characters survive.** The save file holds one block per
  `chaId`, so the next save keeps one of them. Which one depends on the save path and the order.
  The copy can overwrite the original. This is upstream behaviour, and W0 neither causes it nor
  makes it worse (Gate 1 round 4 ran it). It holds because nothing inherits (ID-4); inheritance
  caused it in Gate 2 rounds 1 and 2.
- **Identity for a plugin that rewrites an object without its id.** It gets a new id (ID-4). **CHORE-28**, straight after W0, guards the save
  (`MC-079`). Until then W0 warns in the console only.
- **Identity across a reorder**, for a plugin that passes id-less objects. `setChatToIndex` is
  positional. A character or database install gives fresh ids (ID-4 consequences).
- **That writes reach either holder** of a duplicate while it lasts (`MC-078`).

## 4. Two New Chat bugs, folded in (Report 22 section 2.4)

W0 edits these handlers for ID-1, so it fixes these bugs too. Upstream `main` has the same code.
Gate 1 confirmed both at source.
- **`ChatList.svelte`'s New Chat** `unshift`s, pushes each group member's greeting into
  `chats[len]` (after the `unshift`, that is the **last** chat in the array), and then opens
  `changeChatTo(len)`, the same wrong chat.
- **`SideChatList.svelte`'s group New Chat** also pushes the greetings into `chats[len]`. It already
  opens chat 0.

**N-1.** After New Chat:
- the new chat is at index 0 and is the one opened;
- a group's greetings are in it;
- no existing chat's `message` changed.

Non-normative: extract one function into `characters.ts` for both handlers to call.

## 5. Origin invariants

**O-1: the origin.** An origin is `{chaId, chatId, memberChaId?}`.
- `chaId` and `chatId` address the chat owner (for a group, the group) and the chat.
- `memberChaId` names the character whose trigger runs, when that is not the owner (W-6).
- `chatId` means `Chat.id`, never `Message.chatId`.
- An origin holds no index and no object reference. This replaces Report 23 section 7's
  object-identity fallback. Trigger clones and v3 clones break object identity, and ID-4 and ID-6
  make the fallback unnecessary.

**O-2: reading an origin.** `originOf(character, chat)` is pure. On a missing id it returns null
and logs a `console.warn` naming the character.

**O-3: resolution is scoped to a synchronous callback.**
- `writeAt(origin, fn)` and `readAt(origin, fn)` resolve the origin and call `fn` with:
  - `owner` and `ownerIndex`;
  - `chat` and `chatIndex`;
  - `member` and `memberIndex`, or null.
- `fn` is typed so that a function returning a Promise fails `pnpm check`. Test files fall under
  the tsconfig, and Vitest does not type-check.
- A returned thenable also throws at runtime after `fn` returns, because a `fn` typed `any` gets
  past the type. The marks in O-4 still apply.
- No exported API returns a live object, or an index, that can outlive the tick. The resolver is
  exported for tests only.

**O-4: gone, ambiguous, and marking.** The origin is **gone** when:
- no character has its `chaId`;
- the character is a cold-storage placeholder;
- no chat in the owner has its `chatId` (`MC-075` 2).

The origin is **ambiguous** when more than one character has its `chaId`, or more than one chat
in the owner has its `chatId` (`MC-078`).

In both cases `fn` does not run, nothing is marked, and the call returns false. An ambiguous
origin also logs a warning. Both rules apply to every write made for the unit of work.

Further rules:
- **The member resolves separately.** If it is gone or ambiguous, `member` is null and the
  owner's writes proceed.
- **Resolution keeps no state.** Every call reads the live data, so an origin that was ambiguous
  resolves again as soon as the duplicate is gone.
- **`writeAt` marks** the owner, and the member whenever it resolved. It does this
  unconditionally, in a `finally` (W-3).

**O-5: resolution never reads the selection.** It never reads `selectedCharID` or `chatPage`,
never fabricates an object, and never chooses between two holders. A trashed character resolves,
and only a permanent delete makes it gone. Each resolution scans `characters` in full, which
costs about 0.75 ms on the i9 with Svelte's development build (ledger row 169). No index cache.

W-1 requires a fresh resolution after every `await`, so the rule is **one resolution per
synchronous batch of writes**, not one per field. The W1 plan must report how many resolutions
its Lua and CBS paths make per unit of work, since those writers are called once per value. It
must also measure a production build with CPU throttling before the cost is accepted.

**O-6: whole-object commit (W-2, W-6).**
- `commitCharacter(origin, 'owner' | 'member', clone)` replaces that slot only when `clone.chaId`
  equals the slot's `chaId`.
- `commitChat(origin, clone)` replaces the chat only when `clone.id` equals `origin.chatId`.

Both follow O-4, return false otherwise, and mark what they wrote. W1 uses `commitChat` for
`Chat.svelte`'s manual trigger commit and `sendChat`'s trigger commit.

**O-7: the in-flight registry (W-5).**
- **`beginWork(character, chat, member?)`** takes objects **read back through `DBState`**, never a
  caller's pre-insertion object or a clone. A plain object becomes a different, proxied reference
  once it enters the `$state` tree (ledger row 169, check 4).
  - If an id is missing and the object is not found in the live data by identity, `beginWork`
    returns null and warns.
  - Otherwise it applies ID-6, builds the origin, registers it and returns a handle. It also
    returns a handle when the origin is ambiguous, logging a warning; the writes will then skip
    under O-4.
  - It is called only from event handlers and async units of work, never during a reactive
    derivation. Display-mode runs do not begin work.
- **`handle.end()`** unregisters, and a second call is harmless.
- **`isWriting({chaId, chatId?})`** answers for the character, or for that chat of it. A
  registration counts for its owner and its member. Registrations are counted.
- The registry is plain module state, like `localDrafts.ts`. Work that never settles leaves a
  stale "writing" answer: a spurious warning, never a lost write.

**O-8: unchanged.** Plugin "current" helpers, `getCurrentCharacter`, `getCurrentChat`,
`findCharacterbyId` and `chatWindowKey` are not touched.

## 6. Mechanism (non-normative)

- **Where the code goes.** One module holds the origin API and the install fill, for example
  `src/ts/process/chatOrigin.ts`. Boot's `assignIds` stays a **separate function with a
  different contract**: repair, not fill. The three backup loads call it. Do not merge the two.
- **Composer stage (Report 22 rev 3).** When `beginWork` fills the id of a chat installed through
  the live proxy, that chat's `chatWindowKey` changes once, mid-send. Report 22 section 3 also
  still describes the WeakMap fallback in the present tense; rev 3 must update it.

## 7. Acceptance scenarios

**How scenarios are tested.** Each test names a behaviour.
- **Red** means the test fails on an assertion against the pre-fix behaviour, never on a missing
  import. A fix that goes through a newly extracted function follows three steps: extract with no
  behaviour change, confirm the test is red, then fix.
- **Coverage** means the test passes at HEAD. Its comment says so and gives the reason.
- **Specification** tests exercise the new module, which does not exist at HEAD.

**Identity: red at HEAD**
1. `ChatList`'s New Chat gives the new chat an id.
2. Group New Chat in `ChatList`:
   - the greetings land in the new chat at index 0;
   - the other chats are unchanged;
   - index 0 is opened.
3. `SideChatList`'s group New Chat: the greetings land in the new chat, and the others are
   unchanged.
4. `createNewGroup` and `createBlankChar`: the first chat has an id.
5. Both `characterCards.ts` literals give the chat an id before any `changeChar`.
6. HTML import where the file's id equals an existing chat's: the import gets a fresh id, and the
   existing chat is unchanged.
7. `risuAllChats` v1 with two chats sharing an id, one of them equal to an existing chat's: every
   imported id is fresh and distinct.
8. `setChatToIndex` with an id-less chat: the chat gets a fresh id, never the replaced chat's.
8a. **Swaps and rotations of id-less objects never leave a duplicate**, in either installation
    order. This holds for two `setChatToIndex` calls, two `setCharacterToIndex` calls, two
    `setChar` calls, and a three-way rotation. After encode and decode, every character survives.
9. Unshift an id-less chat, then `setCharacterToIndex` (and `setChar`):
   - the new chat has a fresh id;
   - every existing chat keeps its id;
   - no id is duplicated.
10. `setCharacterToIndex` and `setChar` with no `chaId`: the character gets a fresh `chaId`, never
    the replaced character's.
11. `setDatabase` and `setDatabaseLite` with a new id-less chat in an existing character and a new
    id-less character: every new object gets an id. This includes v2.1's
    `getDatabase().characters[0].chats.unshift(...)` followed by `setDatabaseLite(getDatabase())`.
12. `loadInternalBackup`, `loadRisuAccountBackup` and the Kei restore, each with id-less chats.
    Afterwards every chat has an id and none is duplicated. Use the existing harnesses
    (`globalApi.loadInternalBackup.svelte.test.ts`, `accounterBackupReload.test.ts`,
    `kei/backup.test.ts`). A backup that holds a character without `chats`:
    - does not throw;
    - leaves `requiresFullEncoderReload.state` true.
13. The cold-storage placeholder chat has an id. This is driven through `makeColdData` with
    mocks. At runtime it cannot matter, because boot's repair runs afterwards.
14. **Copy idiom, through v3:** `unshift({...chats[0]})`, then v3 `setCharacter`.
    - Both ids are unchanged.
    - A duplicate warning is logged, naming the plugin.
    - The fill changes nothing.
    - Red half: the warning. Coverage half: both ids unchanged.
    - A second install that leaves the same pre-existing duplicate does not warn again.
    - The first call of a character swap warns, and the warning's wording marks it as possibly
      transient.

**Identity: coverage at HEAD** (each passes at HEAD and must keep passing)
15. A chat swap made with two `setChatToIndex` calls ends as `[k3, k1, k2, k0]`, each id with its
    own content.
16. A sort of every chat by id, done through `setChatToIndex`: every id stays with its content.
    The follow-up assertion (boot's repair then changes nothing) is a specification half, because
    HEAD does not export `assignIds`.
17. A character swap made with two `setCharacterToIndex` calls, then encode and decode: each
    character appears once, with its own `chaId`.
18. Cold restore of a blob whose chats have no id: after `changeChar`, every chat has one.
19. Malformed input to each install route, such as a character without `chats`, does not throw in
    the fill.
20. `setDatabaseLite(getDatabase())` with no plugin edits changes nothing.
20a. **Pins the `chaId` save collision (CHORE-28's red test).** Two characters share one `chaId`.
    After encode and decode, only one character remains. The assertion records today's
    behaviour and says so. CHORE-28 inverts it.

**Wiring: mount tests, red at HEAD.** Clicking New Chat in a mounted `ChatList.svelte`, under
happy-dom and following `Chat.messageEditor.svelte.test.ts` and `MainMenu.*.svelte.test.ts`, gives
the new chat an id and opens index 0. Test `SideChatList.svelte`'s group New Chat the same way if
it mounts under the same setup. If it does not, record that as a code-review check.

**Origin module: specification**
21. `beginWork`:
    - on an id-less chat inserted through the live proxy, it fills the id and marks the chat;
    - on a chat that already has an id, it changes nothing;
    - given a pre-insertion object or a clone of an id-less chat, it returns null, warns, and
      writes nothing.
22. `originOf` on an id-less chat returns null, warns, and changes nothing.
23. After an `unshift` on the owner, the origin resolves to the same chat at its new index.
24. After a permanent delete at a lower index, the origin resolves to the same character at its new
    index.
25. Gone:
    - the owner is permanently deleted: false, and `fn` does not run;
    - the chat is deleted: the same;
    - a trashed character still resolves.
26. When the chat object is replaced by a clone with the same id, `fn` sees the new object.
27. When the character is replaced at the same index by a clone with the same `chaId`, `fn` sees
    the new object.
28. The whole `characters` array is reassigned, and a character is moved away and back
    (return-to-origin). Resolution is correct each time.
29. **Ambiguous (`MC-078`):**
    - Duplicate the chat id, as in the copy idiom: false, `fn` does not run, nothing is marked,
      and a warning is logged.
    - Give the copy a fresh id: the origin resolves to the original.
    - Swap halfway, after only the first setter. The origin of the overwritten slot's chat is
      gone, and its writes drop silently. The origin of the chat that moved in is ambiguous, and
      its writes are skipped with a warning. After the second setter, both resolve to their
      chats in their new slots. Either outcome is acceptable, because the plugin's own snapshot
      would overwrite such a write at HEAD.
    - The same with a duplicate `chaId`.
30. A cold-storage placeholder: false.
31. With `selectedCharID` and `chatPage` set to other values, including −1, the results are
    unchanged.
32. Group with member:
    - `fn` receives the group, its chat and the member;
    - with the member gone or ambiguous, `member` is null and the owner's write lands.
33. `writeAt` on a non-selected character survives encode and decode. With marking disabled, the
    write is lost. Disabling marking is a module-mock toggle in the test, never a production option.
34. When `fn` throws after an in-place write, the owner and member are still marked.
35. When `fn` returns a promise, the call throws and still marks. An `@ts-expect-error` on an async
    `fn` is enforced by `pnpm check`.
36. `commitCharacter`:
    - a member's clone sent to the owner is refused, and the group is unchanged;
    - the owner's own clone replaces the owner and marks;
    - the member's own clone replaces the member and marks.
37. `commitChat`:
    - a clone with a different id is refused;
    - a clone with a matching id replaces the chat and marks;
    - when the origin is gone or ambiguous: false.
38. Registry:
    - `isWriting` is true for the chat and for the character, and false after `end`;
    - calling `end` twice is harmless;
    - two registrations need two ends;
    - a group registration counts for both the owner and the member.
39. Work that throws, with `end` in a `finally`, leaves nothing registered.
40. After a persistent duplicate **chat id** within one character, boot's repair keeps the first
    holder by position. This documents the residual. It is not extended to `chaId`s, which do
    not survive a save (20a).

## 8. Compatibility

- **Save format:** unchanged.
- **Upstream data:** boot is unchanged. Backup loads that do not reload now get boot's repair.
- **Plugins:**
  - A plugin's present ids are never changed, including in swaps and sorts (scenarios 15 to 17
    pin today's behaviour).
  - Missing ids are always fresh, never taken from the replaced object or by position (ID-4).
  - A duplicate a plugin's install call creates is left as the plugin made it and warned about.
    Once writers resolve by id (W1 onward), writes to it are skipped until it is gone
    (`MC-078`). At HEAD those writes land by index.
  - **Not warned:** a duplicate a v2.1 plugin makes in place, through `getDatabase()` and then
    `setDatabaseLite(getDatabase())`. The call receives the live array, so nothing is introduced
    from its point of view. A duplicate `chaId` made this way still loses a character at the
    next save. That is a residual of CHORE-28, which guards the save itself.
  - The fill writes to the object the plugin passed in, which for v3 is a clone. The v2.1
    wrapper already writes to `newDb.plugins`.
  - Plugin "current" helpers are untouched.
  - The docs gain one sentence about uniqueness.
- **Exported chats:** they carry their id. Importing one gives it a fresh id.
- **Cards, modules, presets:** untouched.

## 9. Risks

- **A plugin that keeps a duplicate chat id for good** loses writes to that chat until the next
  boot. Boot then picks the holder by position. The warning names the plugin (v3 only), and
  `MC-078` accepts this.
- **A duplicate `chaId`** loses a whole character at the next save, as it does at HEAD. W0 only
  warns; CHORE-28 guards the save (`MC-079`).
- **The app makes duplicates itself until W1 and W2 land**, and O-4 skips writes to those as well:
  - During the output trigger's await, a Branch, New Chat or Copy `unshift` followed by
    `sendChatBody`'s frozen-index clone write-back duplicates a chat id.
  - CHORE-26's member clone that overwrites the group slot duplicates the member's `chaId`.

  O-4 has no production caller in W0, so nothing changes yet. W1 and W2 remove both sources, and
  their tests must assert that no duplicate remains.
- **A plugin that reorders id-less objects** gets positional identity, as upstream does.
- **Performance.** Resolution costs about 0.75 ms per `writeAt` on the i9, measured on Svelte's
  development build. There is no Pi measurement. W1 must call `writeAt` once per unit of writes,
  not once per field.
- **Dead code until W1**, which follows directly.

## 10. Residuals

- **The not-guaranteed items** in section 3.
- **Hotkey selection.** The prev/next hotkeys bypass `changeChar`, so they can open a cold
  placeholder, and its writes drop. Report 22 rev 3 owes the fix, or W2 does.
- **`graphmem.ts`'s chat-variable callers** belong to W1.
- **Pre-existing, candidate chores:**
  - v2.1 `setChar` writes into whatever is selected at call time. With nothing selected it writes
    `characters[-1]`, which is silently lost.
  - `makeColdDataForCharacter` does not skip groups.
  - A character's unsaved edit is dropped for one save iteration if a swap catches it in the
    no-reload presence filter (ledger row 169, check 2; the filter does not re-fold it).
  - Filling a `chaId` on a character that was already saved without one leaves the old block,
    saved under an empty name, in place, so a stale copy comes back on the next load. The
    reviewer ran this in round 4. HEAD already does it through `characterFormatUpdate`, and
    ID-4 and ID-6 add sites. **CHORE-29.**
- **W2's:** work that straddles a backup load keeps origins that resolve against the new
  database. Only a duplicate that the old database also held can misbehave.
- **W2's:** group turns re-read the selection in each recursive `sendChat` (W-4). There are three
  chat-delete handlers.
- **For W1:** `runTrigger` clones the whole character, chats included, so a `commitCharacter` of
  that clone overwrites chat changes made while the trigger awaits. This is W-2's accepted
  limitation, and W1 must show it cannot drop a message.

## 11. Files expected

- **New:** the origin module (API and fill) and its tests.
- **`src/ts/characters.ts`:**
  - the New Chat function;
  - `createNewGroup` and `createBlankChar`;
  - `characterFormatUpdate`'s fallback;
  - the HTML and `risuAllChats` v1 imports.
- **`src/lib/Others/ChatList.svelte`** and **`src/lib/SideBars/SideChatList.svelte`**: call the
  extracted New Chat function.
- **`src/ts/characterCards.ts`**: the two import literals.
- **`src/ts/process/coldstorage.svelte.ts`**: the placeholder.
- **`src/ts/plugins/apiV3/v3.svelte.ts`** and **`src/ts/plugins/plugins.svelte.ts`**: the install
  routes and the warning.
- **`src/ts/bootstrap.ts`**: export `assignIds` unchanged, for the backup loads.
- **`src/ts/globalApi.svelte.ts`**, **`src/ts/drive/accounter.ts`** and **`src/ts/kei/backup.ts`**:
  run the repair after a non-reloading load.
- **`src/ts/plugins/apiV3/risuai.d.ts`** and **`plugins.md`**: the uniqueness sentence.
- **Tests** beside each.

## 12. Gate record

### Gate 1 round 1 — `opus-reviewer` (fresh), rev 1 — **[REJECT]**

The Orchestrator re-checked B1 in source:
- `allowedDbKeys` includes `characters`;
- v2.1 `getDatabase` is a live proxy;
- v2 `setChar` installs a whole character;
- the three backup loads call `setDatabase` and do not reload.

Findings and how they were handled:
- **B1:** id-less chats still reach runtime, and rev 1 dropped the fallback, so W1 would drop
  writes that land at HEAD. → Fill on every install route and after the three loads; close the
  live proxy at `beginWork`.
- **M1:** a fresh id on a slot replacement changes identity. → Inherit (narrowed in rev 3 and rev 4).
- **M2:** "mark the member when touched" could not be implemented. → Mark unconditionally, in a
  `finally`.
- **M3:** red via a missing import proves nothing, and the wiring was untested. → Test sequence
  and mount tests.
- **MINORs:**
  - the import rules;
  - the cache and duplicates;
  - fill before assigning (run by the reviewer);
  - a missing member;
  - a plugin duplicate disabling both objects;
  - `commitChat`;
  - the async guard;
  - "uuid v4";
  - the card literals;
  - a scenario label;
  - the hotkey residual;
  - the mock toggle.

**Escalation count:** 1.

### Gate 1 round 2 — `opus-reviewer` (fresh), rev 2 — **[REJECT]**

Route coverage from round 1 was closed. The Orchestrator re-checked `changeChatTo(id)`, the
`branchedfrom` link and `runTrigger`'s clone.

Findings and how they were handled:
- **BLOCKER-1:** slot-index inheritance gives an existing chat's id to a new empty chat. → Rev 3:
  inherit only where one object was addressed.
- **MAJOR-1:** position-first dedupe lets an incoming object take an existing id. → Rev 3: a
  seeded fill in which "what stays wins" (superseded in rev 4).
- **MAJOR-2:** "the same rule as boot" was false. → Rev 3: the seeded fill described as boot's
  algorithm (superseded in rev 4).
- **MINORs:**
  - `beginWork` on a clone;
  - labels;
  - the mount test;
  - type-test enforcement;
  - O-4's chat-write semantics;
  - I-2 and branch links;
  - Report 23's superseded fallback;
  - I-1 wording.

**Escalation count:** 2. At the second rejection the Orchestrator asked whether the mechanism was
the problem. Rev 3 replaced heuristic reconstruction of identity with "never guess".

### Gate 1 round 3 — `opus-reviewer` (fresh), rev 3 — **[REJECT]** → escalated

The Orchestrator checked F1 against the plan's own I-5. The reviewer ran it.

- **F1 (MAJOR):** the collision rule breaks swaps and sorts done through per-slot setters, which
  work at HEAD.
  - In the chat case, an id is lost for good.
  - In the character case, a stale duplicate block survives a reload.
  - Section 8's claim that "boot would also have re-id'd one" was false.
- **F2 (MAJOR):** the seed for `setDatabase`/`setDatabaseLite` is undefined.
- **F3 (MAJOR):** duplicates inside one incoming value are settled by position.
- **F4 (MINOR):** the seed costs about 21 ms per call at 1000 × 20, which makes plugin loops
  O(N²).
- **F5 (MINOR):** cold restore was not listed.
- **F6 (MINOR):** the fill does not tolerate malformed input.
- **F7 and F8 (wording):**
  - `beginWork` must use objects read back through `DBState`;
  - `setChar` from Home;
  - "oldest" means "last";
  - superseded text in Reports 22 and 23;
  - the order of the backup-load fill.

**Escalation count:** 3 consecutive substantive rejections. The item was escalated to
`senior-advisor` (ledger row 168).

### Escalation — `senior-advisor` (Fable 5.1)

**Verified:** F1 (reran it). v3 setters deserialise clones, one task per call. Cold restore is
already filled by `characterFormatUpdate`. A character swap that keeps its ids leaves no stale
block.

**Root cause:** every revision tried to decide, at install time, which holder of an id is the real
one, with no input that can decide it. Merging boot's repair into the runtime fill brought repair
semantics into a context where repair is unsafe; that produced F1, F2 and F4.

**Strategy:**
- never reassign or move a present id at runtime;
- fill missing ids only (inheriting only from the single object addressed);
- no seed and no global scan on install;
- warn on duplicates;
- treat ambiguity as gone, pending the maintainer;
- keep boot unchanged and separate.

**Maintainer:** chose to skip with a warning over first-by-position (`MC-078`).

**Follow-up checks** (ledger row 169):
- the ambiguity scan costs about 0.75 ms per resolution;
- a mid-swap autosave cannot delete a block;
- the docs promise positions only;
- the v2.1 round trip is live-object and a no-op.

**Rev 4 dispositions:**
- F1 to F3 and F5 → ID-3 to ID-6, and scenarios 14 to 18 and 29;
- F4 → no seed, and a bounded per-install check;
- F6 → ID-4 tolerance, and scenario 19;
- F7 → O-7;
- F8 → sections 4 and 10, ID-4, and section 6's note to Report 22 (Report 23 section 7 is
  annotated as superseded by O-1).

### Gate 1 round 4 — `opus-reviewer` (fresh), rev 4 — **[APPROVE-WITH-FINDINGS]**

The mechanism holds. No new crash or data-loss path relative to HEAD comes from the design. Round
3's F1 to F3 and F5 to F8 are closed. F4 is partly open (MINOR-7).

The Orchestrator re-checked MAJOR-1 in `risuSave.ts`: one block per `chaId`, and the incremental
`set` encodes only the first marked holder.

- **MAJOR-1** (record; run by the reviewer). A duplicate `chaId` does not survive a save, so boot
  never repairs it: one whole character is lost, and the copy can overwrite the original. The same
  happens at HEAD. §3's "not guaranteed" list, scenario 40 and `MC-078`'s "resume … by the next
  boot's repair" were false for `chaId`s.
  → The corrections are made. The maintainer chose a separate save-layer fix straight after W0
  (`MC-079`, CHORE-28). Scenario 20a pins today's behaviour.
- **MINOR-2.** The repair after a backup load could throw before the full-reload flag is set.
  "Nothing refers to its ids" was false.
  → ID-4: normalise, then repair. The straddling case is a W2 residual. Scenario 12 extended.
  During implementation the Orchestrator moved the repair to the decoded backup, before
  `setDatabase`. That way a throw aborts the load before anything is replaced, and the edit
  cannot be invisible through the proxy.
- **MINOR-3.** ID-5 warned spuriously on swaps, and blamed a pre-existing duplicate on the plugin
  that called next.
  → Warn only about duplicates the call introduced, worded as possibly transient. Scenario 14
  extended.
- **MINOR-4.** v2.1 cannot name the plugin.
  → Name it on v3 only. Scenario 14 goes through v3.
- **MINOR-5.** Positional handling was overstated for character and database installs.
  → ID-4 consequences.
- **MINOR-6.** The app itself makes duplicates until W1 and W2 land.
  → §9. W1 and W2 tests assert that none remain.
- **MINOR-7.** The fill cost on `setDatabase*` was unstated.
  → ID-5: measured at Gate 2.
- **MINOR-8.** "Once per unit of writes" could not be enforced.
  → O-5: once per synchronous batch. W1 reports its resolution counts and measures a production
  build with throttling.
- **MINOR-9.** Filling a `chaId` brings back a stale block (run).
  → CHORE-29.
- **MINOR-10** (wording).
  → ID-3 is limited to objects already in the database. A replaced object without an id gives a
  fresh id. Scenarios 12, 16, 29 and 40 relabelled or clarified.

**Confirmed sound:**
- the route list and §2's claims;
- inheritance in `setChatToIndex`;
- O-3's typing under `strict: false` (the reviewer ran `tsc`).

**No further plan gate.** Round 4 approved, and every finding was dispositioned in the text.
Gate 2 (`opus-reviewer`) reviews the implementation against rev 4.1.

### Gate 2 round 1 — `opus-reviewer` (fresh), implementation — **[REJECT]**

The Orchestrator re-checked MAJOR-1 in `chatIds.ts`. The character fill inherits the replaced
`chaId` without looking for another holder, and the duplicate warning skips the case where the
new id equals the old one.

- **MAJOR-1 (substantive; run).** Inheritance can create a duplicate without any warning.
  - In a v3 swap of `[X (no chaId), K]`, the second call inherits `K`'s `chaId` onto X. After
    encode and decode one character is lost. At HEAD both are saved.
  - The same applies to chat ids.
  - This contradicts §3's "neither causes it nor makes it worse".
  - The plan's inherit rule was underspecified. Gate 1 round 2 had asked for an "held nowhere
    else" check; the escalation dropped it as vacuous because it read the scope as the incoming
    value only.
  - → ID-4 now inherits only when no other holder exists in the owner or the database.
- **MAJOR-2 (wording).** False claims:
  - the commit message's "boot's own algorithm, now exported as `assignIds`";
  - stale New Chat test comments and titles that still say `withId`, "no behaviour change" and
    "already holds today";
  - two identical click helpers.
- **MINOR (wording).**
  - The `assignIds` test header.
  - Mislabelled coverage in `pluginIdentityFill`.
  - The commit message's counts. The run gives 34 failing at HEAD and 18 passing, not 32 and 20.
    7 of the 34 fail at HEAD only because `createNewChat` does not exist there; against the
    behaviour-identical extraction they fail on assertions.
  - The New Chat bug scope.
  - The origin test files are labelled "coverage" when they are specification tests.
- **MINOR (substantive).**
  - `repairDatabaseIds` replaces any non-array `chats` with `[]`. HEAD left it alone, and the plan
    said `??=`.
  - `beginWork` can fill the owner's `chaId` and then return null.
  - 14 surviving mutants. Examples: fill after assignment on each route; repair order in the
    backup loads (hidden because `setDatabase` is mocked); fill in place of repair; the chat-id
    "no second warning" case; a resolver cache; the member commit guard; scenario 16's second
    half.
  - `assignIds(target)` has no production caller.
- **Confirmed sound:**
  - `chatOrigin.ts` against O-1 to O-8, with the async-`fn` type guard enforced;
  - inheritance on the slot setters;
  - no inheritance by position;
  - the backup loads' order in the code;
  - N-1 in both buttons, with the mount tests red at HEAD;
  - compatibility;
  - no per-render cost.

**Escalation count (Gate 2):** 1 substantive rejection.

### Gate 2 round 2 — `opus-reviewer` (fresh), implementation — **[REJECT]**

The reviewer re-derived the commit message's counts (124, 39, 7, 53, 25) by running them, and
judged the stub method honest. The origin module, `beginWork`'s ordering and
`repairDatabaseIds` were confirmed sound.

- **MAJOR-A (substantive; run).** The held-elsewhere check runs one call at a time. When a plugin
  installs the id-less side first:
  - the id-less side inherits the replaced id;
  - the plugin's second call puts the same id back on its original holder;
  - so both slots end up holding one id.

  In the character case, K is lost after encode and decode. The same happens with v2.1
  `setChar` and with chats. The reviewer reasoned that a three-way rotation defeats any local
  check.
- **MAJOR-B (wording).** False claims:
  - the commit message's "This change creates no such duplicate";
  - "CHORE-28 fixes", when it has not landed;
  - three backup tests cite CHORE-28 as the reason for a limit. The Kei restore never touches the
    save layer at all.
  - `chatIds.ts`' header says nothing reassigns a present id, but `repairDatabaseIds` does;
  - a stale importChat comment;
  - a stale comment in `plugins.svelte.ts` about re-exporting as-is.
- **MINOR (substantive).**
  - **Performance.** `setDatabaseLite` at 1000 × 20 went from 16.6 ms to 83.3 ms, and a snapshot
    install from 5.0 ms to 63.5 ms. The plan required a measurement and none was reported.
  - **Three mutants survive:**
    - `beginWork`'s member check;
    - the plugin name on the v3 `setChatToIndex` wrapper;
    - the fill position in `setDatabase` (near-equivalent).
  - **Scenario 18 has no test.**
- **MINOR (wording).**
  - 19 of the 25 tests that pass at HEAD have no coverage comment.
  - A describe title promises something no test in it asserts.
  - The commit message's "extraction" claim holds only for `ChatList`.
  - An unused `type Database` import.
  - Two identical tests.
  - The plan's ID-4 contradicts itself on scanning.
  - Ledger row 171 says all four swap tests pass at HEAD; one fails there.

**Mechanism question (second consecutive rejection on the same mechanism).** Both rounds'
data-loss findings come from inheritance. Rounds 3 and 4 of Gate 1 found the same thing about
collisions: deciding at install time which object an id stands for is undecidable call by call.

→ **Rev 4.2 drops inheritance.** Every missing id is fresh (ID-4). This reverses Gate 1 round 1
M1's disposition. The cost is a new identity for an object a plugin rewrites without its id: its
in-flight writes drop (`MC-075`), and its draft is orphaned. No data is lost at save.

**Escalation count (Gate 2):** 2 consecutive substantive rejections. A third escalates to
`senior-advisor` before the next remediation.

### Gate 2 round 3 — four `opus-reviewer` lenses (fresh), implementation — no substantive rejection

**Method.** A workflow ran four independent lenses: data safety, tests/mutants/counts,
wording/commit, and performance. Any BLOCKER or MAJOR substantive finding was set to be
re-checked by a `deep-investigator`; none was raised. Ledger row 176 records the round.

**Lens results.**
- Data safety: APPROVE-WITH-FINDINGS.
- Performance: APPROVE-WITH-FINDINGS.
- Tests: REJECT, which the lens itself stated was on wording only.
- Wording: REJECT, wording only.

**The Orchestrator's arbitration.**
- No substantive defect above MINOR, so this does not count toward the Gate 2 escalation, and
  the streak ends here.
- Round 2's MAJOR-A is **closed**. The data-safety lens ran 432 swap and rotation probes across
  all routes, orders and id sets: all pass. The inheritance mutant fails 288 of them.
- The counts (133 / 44 / 6 / 54 / 29) and the stub method were confirmed by two lenses
  independently.

**Substantive MINORs, all fixed in the remediation:**
- DS-1: `beginWork` accepts a cloned owner that still carries its `chaId`, fills the clone's
  chat and returns a handle to nothing live. It must be fixed before W1 binds a caller.
- DS-3(a): a swap blames the plugin for a chat-id duplicate that already existed.
- F1: nothing catches position-based inheritance on `setDatabase` or `setDatabaseLite`
  (mutants M03c-f survived).
- F5: the plugin name is unpinned on five v3 paths.
- F6: no test shows a database install warning when it introduces a chat-id duplicate.
- P2: the per-character count is repeated for live character objects.

**Recorded, not changed:**
- DS-2: stale blocks accumulate. ID-4's consequence text is corrected; this goes to CHORE-29.
- DS-3(b): the duplicate-`chaId` corner of the database walk. It is covered by CHORE-28.
- P1: the live-idiom fill cost. ID-5 records the numbers and the Orchestrator accepts the cost.
- F6: v2.1 in-place duplicates are not warned. Recorded in section 8 as a CHORE-28 residual.

**Wording, fixed:**
- the console warning claimed writes are skipped (true only from W1 on) and did not mention the
  save loss;
- the commit message listed the rotations among the 29 tests that pass at HEAD, whereas they
  fail there;
- the Kei test was mislabelled as coverage, and 5 tests that pass at HEAD had no coverage
  label;
- two titles promised a fresh id without asserting it;
- the premise of the `chatIds.ts` header;
- the "never carry duplicate chaIds" comments;
- the backup-load comments;
- the plugin docs now tell authors to keep ids when replacing an object;
- `assignIds` is marked boot-only;
- miscellaneous comments.

**Process notes.**
- A reviewer accidentally created a directory outside the scratchpad whose name contains a
  literal `*` (`...\Temp\claude\C--P*\`). The permission classifier denied its deletion, so it
  is reported to the maintainer.

### Gate 2 round 4 — three `opus-reviewer` lenses (fresh), re-check of round 3's remediation

**Verdict and closure.**
- All three lenses hinted REJECT, but every finding is MINOR, each substantive one was run,
  and none concerns data. Ledger row 177 records the round.
- Closed: DS-1. The clone owner is refused, and a shallow copy sharing the live `chats` array is
  also refused.
- Mutants run this time (killed or survived):
  - killed: M03c-f (id by position on the database routes); M06 (the plugin name on each v3 path); F6 (the
    database chat-id warning); DS-1; the replaced-slot baseline.
  - survived, as expected: P2n (removing the identity skip), which is behaviour-neutral.

**Substantive MINORs.**
- **R4-1 / R4-MC-1 / W1.** DS-3(a) is fixed for one swap order only. If the character carrying a
  pre-existing duplicate is installed second, the swap is still blamed.
- **R4-3.** The prior-holder scan runs on every per-slot install. It adds about 0.45 ms to
  `setChar` (production mode, 1000 characters).
- **R4-4 / W9.** The "more than one prior holder" skip is untested.
- **R4-MC-3.** Wrong length-based variants of the P2 skip survive.

**Mechanism question.**
- The second round running on the same kind of finding: warning attribution.
- Blaming a call for a duplicate cannot be decided call by call, just as identity cannot.
- → The warning now reports the state after the call (ID-5). The count filter stays as noise
  reduction only. The prior-holder scan returns early when the incoming chats have no repeated
  id.

**Wording.**
- The universal "never blamed" claims in the titles, the commit message and the database-walk
  documentation.
- The shallow-copy reasoning in `beginWork`.
- The rotation comment.
- The commit's cost sentence, which is missing the cold-proxy case (+23.5 ms).
- The detection blind spot, which is wider than stated: an in-place duplicate on live objects
  passed in a new array is not detected either.
- CHORE-29's visible consequence: the replaced character comes back after a restart.
- "By index" for a `Set` built from an iterator.
- The Kei test comment.

**Next.** The remediation runs tests first, then source. A narrow fresh review of the fix-up
diff follows.
- Several scratch trees contain `node_modules` junctions into the repo. Remove them with `rmdir`
  before any recursive delete.
