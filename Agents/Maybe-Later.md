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

**A. Discoverability.** A two-tier binding model is communicated entirely through two
button colours and one sentence of prose. There is no legend, no tooltip, no distinct
affordance, and no indication of which tier a given module is bound at once the menu is
closed. A user can plausibly use this app for a long time without discovering that
character-level binding exists — which is how this idea was raised in the first place.

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
