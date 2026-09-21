# Maybe Later — QOL Backlog

Ideas that are **not** part of the stabilization campaign. Nothing here is approved,
scheduled, or estimated. This file exists so a good idea does not die in a chat log.

**Rules for this file**
- Every entry must say what *already exists* before it says what is missing. Several
  "missing" features in this app turn out to be built but undiscoverable.
- Cite `file:line` for anything asserted about current behaviour, and re-verify before
  acting — citation drift has repeatedly bitten this campaign.
- Entries must respect the compatibility invariant: upstream-compatible characters,
  modules, presets, backups and plugins keep working. Anything additive to a shared
  format needs an explicit fallback for clients that do not understand it.

---

## QOL-01 — Character-bound modules for the RisuRealm asset-module workflow

**Status:** idea. Partially built already.
**Raised by:** yor42, 2026-09-21.

### Context

RisuRealm enforces a 150 MB limit per uploaded bot card. The community routes around
this by shipping assets (per-character emotion sprites, animated images) as separate
**asset modules**, which are frequently far larger than the card itself — tens of MB to
1-2 GB in extreme cases.

The consequence is that a card and the modules it depends on are separate artifacts with
**no declared relationship between them**. A bot that expects three asset modules has no
way to say so, and the user is expected to know and to enable them by hand.

### What already exists

Module resolution is already multi-source. `getModules()` unions five independent lists
(`src/ts/process/modules.ts:398-412`):

| Source | Scope | Field |
|---|---|---|
| `db.enabledModules` | global | `Database.enabledModules` |
| `currentChat.modules` | per-chat | `Chat.modules` (`database.svelte.ts:1830`) |
| `character.modules` | **per-character** | `character.modules` |
| `persona.embeddedModule` | per-persona | — |
| `db.moduleIntergration` | per-preset | comma-separated ids, `database.svelte.ts:2217` |

So **per-character binding — the thing that would solve the stated problem — is already
implemented.** It is toggled in the chat module menu:

- **Left click** → chat-level, rendered blue (`ModuleChatMenu.svelte:83-97`)
- **Right click / long press** → character-level, rendered violet (`ModuleChatMenu.svelte:102-112`)

It is documented, but only in a single sentence inside the menu (`src/lang/en.ts:1133`):
"You can also enable for this character by right clicking or long pressing the enable
button."

### What is actually missing

**A. Discoverability.** *(Behaviour confirmed by yor42, 2026-09-21: right-click / long-press
does work as documented, and does bind character-wide. The feature is fine. Finding it is
the problem.)*

The binding model has three states, communicated almost entirely through colour:

| State | Colour | How you set it |
|---|---|---|
| Chat-level | blue | left click / tap |
| Character-level | violet | right click / long press |
| Globally enabled | greyed, non-interactive | elsewhere, in module settings |

There is no legend, no tooltip, and no persistent indication of a module's tier once the
menu is closed. The only explanation is one line of small grey text above the search box
(`ModuleChatMenu.svelte:46` rendering `en.ts:1133`), which describes the *gesture* but
never says what the resulting colour means.

As yor42 put it: "if you tap and hold the check icon next to the module, it turns purple,
and it means that module is enabled character wide" is very hard to figure out unless the
user reads the code. A hidden gesture whose only feedback is an unlabelled colour change
is not discoverable, and long-press in particular has no visual affordance at all.

Concrete, low-risk improvements — none of which change behaviour:
- A legend mapping each colour to its scope, rendered in the menu.
- A text badge ("chat" / "character") on the row instead of relying on colour alone.
  This also fixes the accessibility problem: blue vs violet is a poor distinction for
  colour-vision-deficient users, and it is the *only* signal today.
- An explicit control for the character-level toggle, so it is reachable without knowing
  the gesture. The gesture can stay as a shortcut.
- State the colour meaning in `chatModulesInfo`, not just the gesture.

**B. No character-editor view of bound modules.** `character.modules` is written *only*
from the right-click handler in `ModuleChatMenu.svelte`. Nothing in the character editor
lists, displays, or edits it. There is no way to answer "what does this bot need?"
without opening a chat with it and reading button colours.

**C. No declared card→module dependency.** This is the real gap behind the 150 MB
workaround. Importing a card does not, and cannot, bind the asset modules it expects,
because the card has nowhere to name them. The author cannot ship the binding; the user
must reconstruct it manually, per bot, from the card's description text.

### Sketch of a direction (not a plan)

- **Cheap, safe, no format change:** address (A) and (B). A legend in the module menu, and
  a read-only "bound modules" row in the character editor. This alone may resolve the
  reported pain, since the mechanism already works once you know it is there.
- **Additive format change:** let a card declare optional module dependencies by id/name.
  On import, surface "this bot expects modules X, Y — bind them?" rather than binding
  silently. Must be ignorable by upstream clients and must degrade to today's behaviour
  when the modules are absent, per the compatibility invariant.
- **Explicitly out of scope:** anything that auto-downloads modules, or that makes a card
  fail to import when a declared module is missing.

### Related

Compare **persona binding**, which solved the analogous problem at chat scope:
`Chat.bindedPersona` (`database.svelte.ts:1832`), bound from `CustomSidebar.svelte:74-77`
and `SideChatList.svelte:276-289`, consumed at `DefaultChatScreen.svelte:371-374`. Note
that persona binding got a visible, labelled UI affordance; module binding did not.

---

## QOL-02 — Bulk import for modules and plugins

**Status:** idea. Confirmed gap, narrow and self-contained.
**Raised by:** yor42, 2026-09-21.

### What already exists

Character import is **already multi-file**. `importCharacter()` calls
`selectFileByDom(["*"], 'multiple')` and loops over the result
(`src/ts/characterCards.ts:32-42`), wired to the standard add-character menu at
`src/ts/characters.ts:871-872`. Nothing needs doing there.

### What is missing

Both sibling importers pick exactly one file and have no surrounding loop:

| Importer | Picker | Location |
|---|---|---|
| Character | `selectFileByDom([...], 'multiple')` + `for` loop | `characterCards.ts:32-42` |
| Module | `selectSingleFile(['json','lorebook','risum','charx'])` | `modules.ts:257`, called from `ModuleSettings.svelte:173` |
| Plugin | `selectSingleFile(['js','ts'])` | `plugins.svelte.ts:143` |

Importing N modules or N plugins therefore means N passes through the file dialog. This
matters most for the asset-module workflow described in QOL-01, where a single bot can
expect several modules.

### Why it looks cheap

The multi-file precedent already exists in this codebase in both shapes — `selectMultipleFile`
is used for asset add (`ModuleMenu.svelte:254`), and `selectFileByDom(..., 'multiple')` plus a
loop is used for characters. The work is plausibly picker swap plus a loop plus per-item
error isolation, so one bad file in a batch does not abort the rest.

**Unverified:** whether `importModule()` and `importPlugin()` are re-entrant enough to be
called in a loop — both show confirmation dialogs and mutate `DBState` directly. Check before
assuming this is a five-line change.

---

## QOL-03 — Bulk and housekeeping operations for character/module assets

**Status:** idea. Partially built already — do not write "there is no asset UI".
**Raised by:** yor42, 2026-09-21.

### What already exists

A table-based asset manager already ships for **both** characters and modules, with near
identical markup: `src/lib/SideBars/CharConfig.svelte:590-654` and
`src/lib/Setting/Pages/Module/ModuleMenu.svelte:246-301`. A smaller add-only grid exists at
`src/lib/ChatScreens/AssetInput.svelte:34-53`.

It already supports:
- **Multi-file add** — `selectMultipleFile([...])` then a push loop (`ModuleMenu.svelte:254-266`,
  `CharConfig.svelte:596-610`).
- **Inline preview** of image/video/audio per row, behind the `useAdditionalAssetsPreview`
  setting (`CharConfig.svelte:625`, `ModuleMenu.svelte:280`).
- **Rename in place** via a bound `TextInput` (`CharConfig.svelte:635`, `ModuleMenu.svelte:290`).
- **Delete**, one row at a time, `splice(i,1)` (`CharConfig.svelte:638-648`,
  `ModuleMenu.svelte:293-300`).

### What is missing

- No multi-select and no bulk remove — there is no checkbox markup in either table.
- No search or filter, which is what makes the list unusable at the sizes QOL-01 describes
  (asset modules of tens of MB to 1-2 GB, i.e. potentially hundreds of rows).
- No unused-asset detection. A grep for `unused` across `src/ts` and `src/lib` surfaces only
  `coldstorage.svelte.ts:247-256`, which cleans unused *cold-storage keys* — a different
  subsystem, not `additionalAssets`/`assets` dead references.

The community wrote a large plugin covering exactly these gaps (kept locally as evidence; see
the note at the end of this file). That it exists at all is the strongest signal the native UI
stops short of what the workflow needs.

---

## QOL-04 — Import and backup speed, and the platform boundary that governs it

**Status:** idea. **Read the platform section before designing anything** — the obvious
premise here was tested and is false.
**Raised by:** yor42, 2026-09-21. Platform claim refuted by investigation the same day.

### The premise that did NOT survive

The proposal was: "every platform under this fork's coverage reads assets locally and needs no
separate asset server; only the public risuai.xyz instance uses asset-cache servers, and that
instance is out of scope for us — so we can be aggressive."

**That is true for Tauri only.** The boundary is not hosted-vs-self-hosted, it is
**Tauri vs. everything-else-with-Account-Sync-enabled**, and it is a *user preference*, not a
deployment property:

- **Tauri desktop — always local, unconditionally.** `getFileSrc()` tests `isTauri` first and
  returns `convertFileSrc(...)` before the account branch is reachable
  (`globalApi.svelte.ts:170-187`). The "Save Data In Account" toggle is hidden entirely on Tauri
  (`UserSettings.svelte:159`, `{#if !isTauri}`).
- **Any non-Tauri build with Account Sync on — remote.** `globalApi.svelte.ts:188-190` returns
  `hubURL + '/rs/' + loc` for assets whenever `forageStorage.isAccount`. No hostname gate.
- **Self-hosted node server is not exempt.** Its `hubURL` proxies to a hardcoded
  `https://sv.risuai.xyz` (`server/node/server.cjs:22`). A self-hoster who logs into RisuAccount
  routes assets through the same infrastructure as the public instance.
- `server/hono/` is a 12-line stub with no asset routes — not a fourth platform to reason about.

### What already exists (and is easy to miss)

- **The hub-protecting throttle is already written, and is already conditional.**
  `backuplocal.ts:147-150` sleeps 1000 ms per asset **only** when
  `forageStorage.isAccount && !isCached`. Local and Tauri users already skip it. So for a local
  user, backup slowness is the sequential loop (`backuplocal.ts:107-151`), not the throttle —
  and speeding *that* path up touches no upstream server at all.
- **A partial backup already ships and is already in the UI.** `SavePartialLocalBackup()`
  (`backuplocal.ts:203+`) skips `emotionImages`, `additionalAssets`, `ccAssets` and `vits`,
  behind two confirmations, exposed as its own button at `UserSettings.svelte:56-63`.
  "There is no fast backup option" would be false.
- **Parallel asset save already exists for one import format.** `.charx` import uses a
  semaphore with `MAX_CONCURRENT_ASSET_SAVES = 10` (`processzip.ts:13,203,391-410`). The legacy
  PNG/CCv2 path saves sequentially in a bare `for` loop (`characterCards.ts:282-286`). The
  pattern to copy is already in-repo.
- **Hash-based dedup already exists**, but only for RisuRealm imports with sync on
  (`characterCards.ts:258-281`, gated by `lightningRealmImport`,
  `advancedSettingsData.ts:231`). Local file-picker imports get none of it.

### The direction this points

The defensible version of this item is **"bring the local paths up to the fast paths that
already exist elsewhere in this repo"** — port the `.charx` semaphore to legacy PNG import, and
parallelise the non-account backup loop. Neither touches the account path, so neither increases
load on upstream infrastructure, and the existing `isAccount` throttle keeps protecting it.

**Do not** make the account/sync path more aggressive. The upstream maintainer's objection to a
community backup plugin was specifically that plugins run on the public instance and would
strain its asset-cache servers; `backuplocal.ts:147-150` is that concern encoded in this
codebase. Any change here must leave the `isAccount` branch's behaviour alone, and must not
assume a self-hosted deployment is automatically off that path.

### Still unverified

- Whether the hub rejects proxied traffic from a self-hosted node server server-side. The client
  path is traced and real; it was not exercised against a live server, so the practical blast
  radius could be smaller than the code suggests.
- Relative cost of an IndexedDB round-trip vs. an `AccountStorage` fetch — not benchmarked, so
  the two have not been ranked.

---

## Note on the evidence directories

`Agents/Evidences of Investigations/` holds third-party community plugin bundles used as
evidence for QOL-03 and QOL-04. They are **gitignored on purpose** (`.gitignore`, bottom):
they are other people's work, this fork's origin is a public repo, and committing them
republishes them. Read them in the working tree; never commit them.
