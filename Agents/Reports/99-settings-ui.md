# Settings and main UI: suspected bugs

**STATUS:** reference

These were found while rewriting the [[RisuAI Basics]] and [[Creating a Basic Bot]] wiki pages. It is a hand-off list for a follow-up investigation, not user documentation.

Each entry is a **claim from reading the code**, not a reproduction. Nothing here has been run or tested.

Line numbers refer to the working tree at the time of writing (branch `fix/persistence-conflict-platform-hardening`, after commit `0291ea36`).

**Status values**

- **Reported**: a single reading of the code by a code-reader agent.
- **Orchestrator-confirmed**: the Orchestrator re-read the cited lines and agrees with the claim.

**Wiki coupling:** the Lorebook wiki page says the Global Lorebook settings page can't be opened (UI-1). A fix must update the page.

## Triage index

| ID | Severity | Status | One line |
|---|---|---|---|
| UI-1 | Medium | Orchestrator-confirmed | Four settings pages (Files, Communities, Global Lorebook, Global Regex) can't be opened from any menu; Files holds the Phase 1 item 7 integrity controls |
| UI-2 | Low | Reported | The character sidebar's close (X) button is commented out |

---

## UI-1: Four settings pages are unreachable

- **Severity:** Medium, because of the Files page. The other three pages only strand unused data.
- **Status:** Orchestrator-confirmed.
- **Where:** `src/lib/Setting/Settings.svelte:36-192` (menu buttons) vs `:208-217` (render switch)
- **Claim:** `Settings.svelte` renders `FilesSettings` (index 5), `Communities` (7), `GlobalLoreBookSettings` (8) and `GlobalRegex` (9), but no menu button sets `SettingsMenuIndex` to 5, 7, 8 or 9, and a repo-wide search found no other writer of those values. No other file imports these components.
- **Effect:**
  - **Global Lorebook**: its entries are already never used in chats (the lorebook engine doesn't read `db.loreBook`), and now they can't be viewed or exported either.
  - **Global Regex**: `db.globalscript` is not applied at runtime either. The regex pipeline reads `db.presetRegex`, the character's scripts and module scripts (`src/ts/process/scripts.ts:134`); `globalscript` is only read by this page and as the default argument of `exportRegex` (`scripts.ts:30-32`). Any scripts saved there are kept but unused and now invisible.
  - **Files**: this page holds the fork's asset-integrity controls from Phase 1 item 7 (commit `acf94799`): the **Warn on startup if a quick sample check finds corruption** toggle (`db.checkCorruption`, `FilesSettings.svelte:187`), the verify-assets action (`verifyAssetIntegrity`, `:189`), and the OPFS enable/disable buttons (`:200-206`), plus backup save/load. None of these controls exists anywhere else in the UI. `bootstrap.ts:714-732` only shows its corruption toast when `checkCorruption` is on, so users cannot turn the warning on. `git log -S"SettingsMenuIndex = 5"` finds no commit that ever added a menu button for this page.
- **Investigate:** Add a menu entry for Files first (or move its controls into **Account & Files**, `UserSettings.svelte`), since Phase 1 item 7 assumed users could reach them. For the rest, decide whether to restore a menu button or delete it. For Global Lorebook and Global Regex, consider offering users a way to export the stranded data (or migrate it into a module) before removing the pages.

## UI-2: Sidebar close button is commented out

- **Severity:** Low (may be intentional)
- **Status:** Reported.
- **Where:** `src/lib/SideBars/Sidebar.svelte:960`
- **Claim:** The X button is commented out. The sidebar closes by clicking an empty area (`:951-961`) or the dark backdrop in dynamic-GUI mode (`:1018-1034`). This may be hard to discover on touch devices.
