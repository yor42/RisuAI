# CHORE-34 — Multiuser removal

**STATUS:** done. Committed as `911376cb` on 2026-09-25, after the gates and the live check.
- Gate 1 round 2 approved plan rev 2 (ledger row 187).
- Gate 2 round 1 rejected the implementation for wording only (row 188).
- The fix-up review approved the corrections (row 189).
- The live smoke check passed on a production build (row 189).

**Evidence:** ledger row 185 (`investigator` packet, Orchestrator re-verified). `Agents/Maintainer-Context.md`: MC-074, MC-083, MC-011.
- **Gate 1 round 1 rejected rev 1 for wording only** (ledger row 186); the design held. Rev 2
  corrects the `sendMain` location, replaces the planned `assetIntegrity.ts` comment (the doubled
  path it described cannot occur), names both `case 2` handlers and the dead `Help` import,
  widens I1 to catch stale prose, names T2's harness, and adds a build and live smoke check. The
  Orchestrator re-checked every finding in source.

---

## 1. Decision and scope

**MC-074** (2026-09-24), the maintainer's own words:

> I think we can drop the multiuser feature as whole. Multiuser is another remnant of this
> project originating from being upstream maintainer's toy project. multiuser session was
> explored, but then dropped because it was unstable and buggy.

**Out of scope: the RisuAccount removal (CHORE-33, MC-080).** Ledger row 185 found multiuser
shares no transport, helper or hub route with it. Multiuser runs on PeerJS with its default
signalling server and never touches `sionyw`, `fetchNative` or `hubURL`. The two removals stay
separate stages (MC-074, CHORE-33's Roadmap entry).

**Also out of scope:**
- Removing `saveAsset`'s `customId` parameter. It is kept (section 3) — the smallest change,
  since no production caller passes one after this removal.
- `sendChat`'s double save-mark wrapper. It stays; only its comment's mention of multiuser
  `receive-char` is dropped (section 3).

## 2. Findings the plan rests on

From ledger row 185, verified:

- **No-op for a single user.** `connectionOpen` (a plain `let`) and `ConnectionOpenStore` start
  `false` in `src/ts/sync/multiuser.ts` and are set only after a peer connects, inside
  `createMultiuserRoom`/`joinMultiuserRoom`. `peerSync` returns before any work when closed;
  `peerSafeCheck` returns `true` before any work. So `sendChat`'s `if(connectionOpen){...}` block
  in `src/ts/process/index.svelte.ts` never runs, and the unconditional, unawaited `peerSync()`
  call later in the send does nothing. `peerjs` is imported dynamically inside the room
  functions; importing the module itself has no side effects.
- **`Message.name`.** Written only by `sendMain` in `DefaultChatScreen.svelte`, in its three
  user-message pushes (before it calls `sendChatMain`), as
  `$ConnectionOpenStore ? DBState.db.username : null` — always `null` for a single user. The
  prompt builder in `sendChatBody` computes its own local name and never reads `msg.name`. The
  only other read is in `lorebook.svelte.ts` (`msg.name ?? ...`, on the non-user branch), which
  treats `null` and absent alike. The Lua chat accessors expose only role, data and time.
  `OpenAIChat.name`, read by `stringlize.ts`/`nai.ts`, is a different field.
  `Message.otherUser` is declared and never read or written anywhere.
- **User messages without `name` already exist upstream.** Upstream's `/send` command
  (`command.ts`) and its trigger effects (`triggers.ts`) push user messages with no `name`, as does
  the fork's v3 plugin send. So dropping the field from the composer's pushes produces a shape
  upstream data already contains (Gate 1, ledger row 186).
- **`§temp`.** `multiuser.ts`'s `receive-char` handler sets `cha.chaId = '§temp'`, pushes it into
  `db.characters`, and the `close` handler never removes it. `checkCharOrder` in
  `globalApi.svelte.ts` excludes `§temp` and `§playground` from `characterOrder`.
  `GridCatalog.svelte` and `MobileCharacters.svelte` iterate `db.characters` without that
  exclusion, so a stray `§temp` character stays visible in the catalog and deletable there.
- **The `sendChat` wrapper comment.** The comment above `SendChatCallContext` in
  `index.svelte.ts` lists hotkeys, Playground, Home buttons and multiuser `receive-char` as
  selection changes the double-mark mechanism must survive. The first three stay; the mechanism
  is unchanged; only the comment drops multiuser.
- **`saveAsset(data, customId)`** in `globalApi.svelte.ts`. `multiuser.ts`'s `receive-asset` is
  the only caller that passes a custom id. Plugins reach `saveAsset` only through a one-argument
  wrapper (`plugins.svelte.ts`), so after this removal no production caller passes a custom id.
  The parameter is kept rather than removed — see section 1.
  - **`receive-asset` is unreachable, upstream included.** The host's only `requestChar()` call
    passes no argument, so `excludeAssets` is `null` and the asset-sending branch never runs.
    Gate 1 checked every upstream revision of `multiuser.ts`. No upstream save carries a
    custom-id asset from multiuser.
  - **A second exception to content addressing exists:** `saveAsset` falls back to `uuidv4()`
    when `hasher()` throws. `hasher` calls `crypto.subtle.digest`, which is undefined on
    non-secure origins such as a plain-HTTP LAN host.
  - `assetIntegrity.ts`'s doc comment on `verifyAssetCacheEntry` names the multiuser caller and
    describes the unreachable doubled-path case, so it must be rewritten (section 3).
- **UI entry points.**
  - "Create Multiuser Room" in the chat-options alert (`AlertComp.svelte`), inside
    `{#if DBState.db.useExperimental}`, sends `msg: '2'`. `SideChatList.svelte`'s chat-options
    switch handles case `2` (`changeChatTo` then `createMultiuserRoom()`); it is the last
    numbered case, so removing it renumbers nothing.
  - "Join MultiUser Room" tile in `PlaygroundMenu.svelte`, ungated.
  - `Sidebar.svelte`'s `{:else if $ConnectionOpenStore}` room-status branch.
  - `Chat.svelte` wraps the per-message delete button in `{#if !$ConnectionOpenStore}`, always
    true for a single user.
  - `useExperimental` and the `experimental` Help key are shared with other features and stay.
- **No plugin API surface, nothing in `server/`, no persisted `localStorage` key.**

## 3. Blast radius

| File | Change | Disposition |
|---|---|---|
| `src/ts/sync/multiuser.ts` | delete whole file | `src/ts/sync/` is then empty |
| `src/ts/sync/tests/multiuserReceiveChatSaveMarks.svelte.test.ts` | delete whole file | wholly multiuser behaviour |
| `src/ts/process/index.svelte.ts` | remove the multiuser import, the `if(connectionOpen){...}` block, the `peerSync()` call, and "and multiuser `receive-char`" from the `SendChatCallContext` wrapper comment. In the `sendChat` wrapper comment just below it, drop the stale `characters.ts` line citation (name `removeChar` instead) and the "gate re-review finding F6" history | send path unchanged for a single user |
| `src/lib/ChatScreens/DefaultChatScreen.svelte` | remove the multiuser import; drop the `name:` property from `sendMain`'s three user-message pushes (absent rather than `null` — invariant I2) | |
| `src/lib/ChatScreens/Chat.svelte` | remove the multiuser import; unwrap the delete button (keep the button) | |
| `src/lib/SideBars/Sidebar.svelte` | remove the multiuser import and the room-status branch | |
| `src/lib/SideBars/SideChatList.svelte` | remove the multiuser import and **both** `case 2` handlers (the folder view and the flat list) | each is the last case in its switch; nothing renumbers; `alertChatOptions` returns `parseInt(msg)`, so cancel is `NaN` and hits no case |
| `src/lib/Playground/PlaygroundMenu.svelte` | remove the multiuser import and the Join tile | |
| `src/lib/Others/AlertComp.svelte` | remove only the `useExperimental`-gated Create-room button block, and the `Help` import, whose only use is inside that block | `strict: false` without `noUnusedLocals`, so `pnpm check` would not flag the dead import |
| `src/ts/storage/assetIntegrity.ts` | rewrite the doc comment on `verifyAssetCacheEntry`: `saveAsset` names an asset after its content hash, with two exceptions — an explicit custom id, and the `uuidv4()` fallback when `hasher()` throws (no `crypto.subtle` on a non-secure origin). A `uuidv4()` name reports "not-content-addressed"; a custom id is judged by shape alone, so a 64-hex custom id reports "mismatch" unless it is the content's hash (corrected at Gate 2, ledger row 188). Remove the multiuser caller and the whole "In normal operation…" doubled-path passage. No history words | |
| `src/lang/{en,ko,cn,zh-Hant,vi,de,es}.ts` | delete the 7 keys: `joinMultiUserRoom`, `connectionOpen`, `connectionOpenInfo`, `connectionHost`, `connectionGuest`, `createMultiuserRoom`, `otherUserRequesting` (49 entries total) | MC-083 |
| `package.json` / `pnpm-lock.yaml` | `pnpm remove peerjs` | the lockfile diff must be exactly the importer entry plus the package and snapshot entries for `peerjs`, `peerjs-js-binarypack`, `@msgpack/msgpack`, `eventemitter3`, `webrtc-adapter` and `sdp` (all peerjs-only; the app's own msgpack library is `msgpackr`); anything else is churn, reviewed in Gate 2 |
| `src/ts/process/tests/sendChatSaveMarks.svelte.test.ts` | drop the multiuser `vi.mock`, and "multiuser `receive-char`" from the file's header comment | no assertion reads a mocked multiuser value |
| `src/ts/process/tests/sendChatColdGuard.svelte.test.ts` | drop the multiuser `vi.mock` only | same |
| `src/lib/ChatScreens/Chat.draftCaptureScenarios.svelte.test.ts` | drop the multiuser `vi.mock` only | same |
| `src/lib/ChatScreens/Chat.draftRestoreMarker.svelte.test.ts` | drop the multiuser `vi.mock` only | same |
| `src/lib/ChatScreens/Chat.messageEditor.svelte.test.ts` | drop the multiuser `vi.mock`, and "multiuser sync" from the header comment's list of mocked modules | same |
| `src/lib/SideBars/SideChatList.newChat.svelte.test.ts` | drop the multiuser `vi.mock` only | same |
| `wiki/Playground.md` | edit the "Join MultiUser Room" row | MC-083; not one of the parallel wiki session's files (`wiki/Settings-*.md`, `wiki/Home.md`, `wiki/_Sidebar.md`), which stay untouched |
| `AGENTS.md` | edit the `sync/` "Multi-user synchronization" directory-table row | MC-083 |

**Kept, not touched:** `Message.name` and `Message.otherUser` on the `Message` type;
`checkCharOrder`'s `§temp` exclusion; `saveAsset`'s `customId` parameter; the
`SendChatCallContext` mechanism and the double save mark; `useExperimental`.

## 4. Invariants and acceptance

- **I1 — nothing reachable dangles, and no prose describes the removed feature.** After the
  change:
  `rg -n -i "multi-?user|receive-char|receive-asset|peerjs|ConnectionOpenStore|ConnectionIsHost|RoomIdStore|peerSync|peerSafeCheck|peerRevertChat" src package.json`
  is empty (this also catches stale comments; it does not see translated lang values, which
  is what the next check is for); each of the 7 lang keys is absent from every file in `src`
  (`rg -w <key>` per key); `peerjs` is absent from `pnpm-lock.yaml`; `pnpm check` is clean;
  and `pnpm run build` succeeds (deleting the module changes the import graph, including a
  `multiuser.ts` ↔ `process/index.svelte.ts` cycle, which neither Vitest nor `pnpm check`
  exercises).
- **I2 — single-user send is unchanged.** No multiuser call remains in the send path;
  `chatProcessStage` sequencing for a single user is unchanged; a user message pushed from the
  composer has the same fields as before except `name`, which was always `null` and is now
  absent. Acceptance: Gate 1 confirms no reader distinguishes `name: null` from an absent `name`
  (`lorebook.svelte.ts` uses `??`); `sendChatSaveMarks` and `sendChatColdGuard` stay green with
  only their mock removed.
- **I3 — save marks are unchanged.** The double-mark wrapper and `SendChatCallContext` are
  untouched; the save-mark tests above pass unmodified apart from the mock.
- **I4 — upstream data with multiuser fields loads (MC-011).** A save whose character list
  contains a `§temp` character, and whose messages carry `name` (a string) and
  `otherUser: true`, survives a save-encoder round trip with those fields intact, and
  `checkCharOrder` keeps `§temp` out of `characterOrder` while leaving it in `db.characters`.
- **I5 — the user-visible change is limited** to the two menu entries (the ungated Playground
  "Join MultiUser Room" tile, and "Create Multiuser Room" in chat options when `useExperimental`
  is on) and the room-status sidebar panel, which only renders while a room is open. The
  per-message delete button is unchanged.

## 5. Tests

**Deleted:** the one multiuser test file (`multiuserReceiveChatSaveMarks.svelte.test.ts`).

**Edited:** the six mocks listed in section 3.

**New**, written by `test-warrior` in the style of the nearest existing test files:
- **T1** — `checkCharOrder` with a `§temp` character and a normal one: only the normal one is
  appended to `characterOrder`; both remain in `db.characters`. Its real value is guarding the
  last `§temp` reference against a later "clean-up" (MC-083).
- **T2** — round trip of the I4 fixture through the save encoder and decoder, in
  `src/ts/storage/tests/risuSave.test.ts`, reusing its hoisted mocks, `buildFixtureDb`,
  `encodeFixture` and `decodeRisuSave`. The model is "round-trips cleanly when nothing is
  corrupted" in the per-block checksum describe block. T2 pins an encoder this change does not
  touch: it is cheap MC-011 coverage, not evidence for the removal.

Both T1 and T2 pass at HEAD and must be labelled as pins, not red tests. This is a pure removal:
there is no fails-first test for it. The evidence for the removal is the pins (T1, T2), the
unchanged existing suite (baseline 104 files / 1310 passed / 4 skipped, re-run by Gate 1;
expected after: one file fewer, minus that file's cases, plus T1/T2), invariant I1's greps and
build, and the live smoke check below.

**Live smoke check** (covers the four Svelte edits no test reaches, and module load order). Run
it on a production build in Claude in Chrome, per Live-State's live-check procedure. The Echo
model needs no key. Check each of these, with no console errors:
- boot, and send a message;
- open chat options with `useExperimental` on (no Create entry), then restore the setting;
- open the Playground menu (no Join tile);
- view the sidebar.

Suite command: `npx vitest run --exclude "**/.claude/**" --exclude "**/node_modules/**"`.

## 6. Sequence and gates

1. Gate 1 (`opus-reviewer`, fresh) on this plan.
2. `test-warrior` writes T1/T2 and confirms they pass at HEAD.
3. `sonnet-coder` implements section 3, including `pnpm remove peerjs`. Contacting the npm
   registry for this is ordinary dependency management, not the upstream-service probing MC-081
   rules out.
4. Gate 2 (`opus-reviewer`, fresh): checks the diff, the comments, the lockfile diff and the
   commit message.
5. The live smoke check (section 5).
6. Commit on the maintainer's word.

Before each gate the Orchestrator greps the `src/` diff for
`round [0-9]|MAJOR|MINOR|mutant|brief|first implementation|previously|no longer|used to`.

## 7. Risks and uncertainties

- **`pnpm remove` lockfile churn.** Removing `peerjs` could touch unrelated lockfile entries if
  a transitive dependency is shared with another package. Reviewed in Gate 2.
- **Limited test coverage on the touched Svelte components.** `Sidebar.svelte`, `SideChatList.svelte`,
  `AlertComp.svelte` and `PlaygroundMenu.svelte` have no direct test coverage for the removed
  branches. The removal there is checked by `pnpm check`, the build, review and the live smoke
  check, not by unit tests.
- **The lorebook `msg.name` read.** The branch that reads it is one nothing in the fork currently
  reaches with a named message; an upstream message carrying `name` still takes it, unchanged by
  this removal.

## 8. Records to update when the stage lands

- `Agents/Roadmap.md`: update CHORE-34's status and landing commit(s).
- `Agents/Live-State.md`.
- `Agents/Investigation-Ledger.md`: rows for the remaining gates (Gate 1 round 1 is row 186).
- This report's **STATUS** line.
