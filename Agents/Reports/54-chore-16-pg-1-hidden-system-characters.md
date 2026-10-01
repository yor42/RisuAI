# Report 54 — CHORE-16 PG-1: every character list skips the Playground and `§temp` characters

**STATUS:** done, 2026-10-01. **Gate 2 approved on behaviour in two rounds, both `[EDITORIAL]`**, by the same
`adversarial-reviewer` (round 1: three comment corrections; round 2: two comments that overstated a
necessity; all applied). Committed as `08e43e65`; this report is added by the records commit that follows
it. This covers **PG-1 only**. PG-2, PG-3 and PG-4 of CHORE-16 are still open
(`Agents/Reports/99-playground.md`). The change is small and well contained, so the plan gate was skipped
under the carve-out in `AGENTS.md` section 4. Gate 2 had no `[REJECT]` round, so the three-round rule
(`AGENTS.md` section 1.2) was not in play. Nothing was run in a browser (section 6).

The maintainer approved the fix on 2026-10-01: every character-list view skips `§playground` and `§temp`,
as `checkCharOrder` (`src/ts/globalApi.svelte.ts`) already does when it adds ids to the sidebar's
`characterOrder`. It sits between memory stage 1 step 3b (Report 53) and step 4 (`Agents/Live-State.md`,
work order).

**Sources** (scratchpad `pg1/`; not durable, so this report and ledger rows 514-516 are the durable record):
- `brief.md`: the invariants I1-I5 and the acceptance scenarios S1-S6;
- `records-notes.md` and `records-notes-r2.md`: the Orchestrator's notes for this batch (costs, checks, what
  the maintainer was told, the fact-check corrections, the save-mark remediation);
- `red.log` and `red-summary.txt` (the red run of the first 41 tests, at the unchanged source);
  `neighbours.log` (a **baseline**: 9 files, 105 tests, run right after the red run, at the unchanged
  source); `green.log` (after the change: 20 files, 262 tests; the command and file list were not saved);
  `full-status.txt` (the first full checks);
- `red-r2.log` and `green-r2.log` (the two save-mark tests, red against the first fix and green after the
  mark; section 3), `full-status2.txt` (the final full checks);
- `review-r1.md` and `review-r2.md`: the Gate 2 hand-backs, saved by the Orchestrator;
- `Agents/Reports/99-playground.md` (the original finding) and Report 53 (the Playground restore this
  change sits next to).

Decisions bearing on this change:
- `MC-083` decision 3: stray `§temp` characters in upstream saves are left alone, never stripped or migrated
  on load, and `checkCharOrder`'s `§temp` exclusion stays. That it is fine to hide a character from a list
  while leaving it in the save is this change's reading of it, not `MC-083`'s words. Nothing is deleted,
  renamed or migrated here.
- `MC-146` 3: an archived `§playground` is restored when the Playground chat opens; that flow is untouched.
- `MC-011`: the fork has never shipped, and the last build with users is upstream. That upstream saves must
  keep working is `AGENTS.md`'s derivation from it, not `MC-011`'s own wording.
- `MC-091`: scope amendments (section 2).

Dispatches, with task usage as the Orchestrator reported it (tokens are cumulative for a reused instance;
tool uses are for the round named, as in Report 53):
- `code-searcher`, the survey of the list views: 94.0k tokens, 41 tool uses (ledger row 514);
- `test-warrior`, the red tests: 141.2k tokens, 48 tool uses; the two save-mark tests: 150.9k cumulative,
  13 tool uses;
- `sonnet-coder`, the implementation: 64.9k tokens, 31 tool uses; the save mark: 69.2k cumulative, 5 tool
  uses;
- `adversarial-reviewer`, Gate 2: round 1 125.2k tokens, 40 tool uses; round 2 167.7k cumulative, 19 tool
  uses (ledger row 515);
- `doc-writer`, these records: 116.6k tokens, 36 tool uses (as the notes report them);
- `doc-verifier`, the fact-check of the records: 149.9k tokens, 45 tool uses (ledger row 516).

## 1. What changed

The Playground keeps one saved character with `chaId` `'§playground'` (name `'assistant'`, a utility bot).
An upstream multiuser save can also leave a `'§temp'` copy in `db.characters`. When `checkCharOrder` adds
ids to the sidebar's `characterOrder` it skips both (and trashed characters); it does not remove one that a
saved order already holds. Four other views listed them, so the Playground's "assistant" character could be
opened or deleted from the grid, which is the history loss Roadmap CHORE-16 describes.

**One shared rule.** New `src/ts/hiddenCharacters.ts` exports `isHiddenSystemCharacter(char)`. It is true
when `chaId` is the string `'§playground'` or `'§temp'`, and false otherwise (including for a missing or
non-string `chaId`). The module has no imports, so no list view can create an import cycle by using it.
`checkCharOrder` now calls it instead of its two literal comparisons; its result is unchanged (the existing
`checkCharOrder.tempCharacter.svelte.test.ts` still passes, scenario S6). An archived placeholder of either
character carries the same `chaId` (`buildColdStub` in `src/ts/process/coldCharacter.ts` copies it), so the
rule hides a placeholder too.

**The views** (the survey's set plus one the Orchestrator added; section 5):

| View | Where | Change |
|---|---|---|
| Sidebar | `characterOrder`, built by `checkCharOrder` | Same set of ids added as before, now through the shared rule. |
| Grid, list and trash tabs | `formatChars` in `src/lib/Others/GridCatalog.svelte` | Skips a hidden character in every layout and in the trash tab. The header count and the search follow, because both come from `formatChars`. |
| Mobile list | `sortChar` in `src/lib/Mobile/MobileCharacters.svelte` | Skips a hidden character whatever `hideTrash` is. (`hideTrash` is a prop, not a user toggle: the grid's simple layout passes `true`, and the default is `false`.) The `{c, i}` mapping happens before the filter, so each entry still hands its original index to `changeChar`. |
| Group-member picker | the `selectChar` branch of `src/lib/Others/AlertComp.svelte` (only caller: `addGroupChar` in `src/ts/process/group.ts`) | Skips groups (as before), trashed characters and hidden characters, in place. The list stays keyed by index, so the key is still the `db.characters` index. The comment above `visibleSelectChars` was rewritten to match. |
| Previous/next character hotkeys | `prevChar` and `nextChar` in `src/ts/hotkey.ts` | A new `characterCycle` builds the name-sorted cycle, each entry carrying its original index. It drops trashed and hidden characters before the sort. The first, last and selected-not-in-the-cycle cases keep their shape: at the first or last entry the hotkey does nothing, and from a character outside the cycle `nextChar` goes to the first and `prevChar` to the last. |

The cycle holds the characters `checkCharOrder` would add to the sidebar's order (not trashed, not hidden),
in name order, not the sidebar's order (Gate 2 round 1, finding 3; the `characterCycle` comment says
something close to this and was left as it is).

**Opening the Playground clears its `trashTime` and marks it for save** (`selectPlaygroundChat` in
`src/ts/playgroundChat.ts`): when the selected `§playground` character has a `trashTime`, the field is
deleted and `markCharacterForSave(char.chaId)` (`src/ts/storage/characterSaveMarks.ts`) is called. It
applies to the character that is actually selected, including one just restored from an archive. A
placeholder is still never written, and the Playground restore flow of `MC-146` 3 is unchanged.
- **The mark is defence in depth, not a data-loss fix.** The `doc-verifier` noted that `restoreCharacterFromTrash` marks
  explicitly and that no test asserted a save for the in-place delete. The Orchestrator then read
  `characterSaveMarks.ts`, which says writers that mutate a non-selected character in place must mark it
  explicitly, and treated the in-place `trashTime` delete as a possible persistence gap. Gate 2 round 2 then **executed** a scratch test
  against the real `registerDbChangeEffects` and a real tracker (section 5): in the normal flow the
  Playground's `chaId` is tracked and a save is marked **without** the mark, because selecting the
  character re-runs the selected-character effects. The mark makes the save independent of when that
  tracking runs, including before `saveDb` has registered its effects (the mark is queued then). It adds
  one extra debounced save per open of a trashed Playground, and nothing for an untrashed one.

Everything else is unchanged: ordinary characters (including one the user named `'assistant'`), groups where
they appear today, archived placeholders (other than those of the two hidden characters), ordering, search and the value each view hands to `changeChar` or
returns as the picked `chaId`.

**Where the code is.** New: `src/ts/hiddenCharacters.ts` and five test files (section 3). Changed:
`src/ts/globalApi.svelte.ts`, `src/lib/Others/GridCatalog.svelte`, `src/lib/Mobile/MobileCharacters.svelte`,
`src/lib/Others/AlertComp.svelte`, `src/ts/hotkey.ts` and `src/ts/playgroundChat.ts`. Line endings were kept:
the five CRLF source files stay CRLF, `GridCatalog.svelte` is LF in the working tree and stays LF, and the
new files are LF (the round-1 reviewer counted them with a byte-count script, before the save mark was added).

## 2. Scope amendment (`MC-091`)

The approved scope was "hide from the lists". Two parts go beyond it, because each is needed to avoid a
concrete failure that follows from the hiding. The Orchestrator told the maintainer about both in chat on
2026-10-01, together with the `§temp` side effect below, and invited them to say if either addition should
be dropped. The maintainer reviewed the result and approved the changes in chat on 2026-10-01
("changes looks good to me"), so both parts stand.

- **I2: the picker and the hotkeys also skip trashed characters** (the sidebar's order never adds one).
  - *Failure if left:* a group member picked from the trash, or a chat reached by hotkey, is a trashed
    character, and the boot purge deletes a trashed character at the first boot more than three days after
    it was trashed (`checkNewFormat` in `src/ts/bootstrap.ts`, called once per boot; the check on `trashTime`
    plus `1000 * 60 * 60 * 24 * 3`). The group member or the chat would disappear with it.
  - *Causal link:* the picker and the hotkey cycle are character-list views this change edits anyway, and
    they were the two views that still offered trashed characters.
  - *Smallest correction:* the same trashed filter the sidebar's order uses, in those two views only. The
    grid's trash tab and the mobile list's `hideTrash` keep their trash behaviour for every other
    character.
- **I3: opening the Playground clears its `trashTime`.**
  - *Failure if left:* once the Playground character is hidden from the grid's trash tab, a trashed one can
    no longer be restored from there, and the boot purge would delete the Playground's chat history while
    it is in use.
  - *Causal link:* the hiding removes the only way to restore it.
  - *Smallest correction:* clear the field on the character that opening the Playground selects (and mark it
    for save; section 1).

**Side effect, also told to the maintainer.** A stray `§temp` copy from an upstream save is no longer
reachable from the grid (it was already absent from the order `checkCharOrder` builds). Its chats stay in the
save. This follows the approved wording and `MC-083` decision 3: the character is not stripped or migrated,
only not offered.

## 3. Tests

Five new test files, all LF, **43 tests**. The `test-warrior` wrote the first 41 before the change, and they
were run against the unchanged source. Two more were added after the fact-check (the save mark):

| File | Tests | Red at the unchanged code | Guards (pass before and after) |
|---|---|---|---|
| `src/lib/Others/GridCatalog.hiddenCharacters.svelte.test.ts` | 12 | 9 | 3 |
| `src/lib/Mobile/MobileCharacters.hiddenCharacters.svelte.test.ts` | 7 | 5 | 2 |
| `src/lib/Others/AlertComp.hiddenCharacters.svelte.test.ts` | 5 | 4 | 1 |
| `src/ts/hotkey.hiddenCharacters.svelte.test.ts` | 11 | 8 | 3 |
| `src/ts/playgroundChat.trashTime.svelte.test.ts` | 8 (6 at the first run) | 3, measured at the unchanged source | 3 |
| Total | 43 (41 at the first run) | 29 at the unchanged source (first 41 tests); 2 more at the first fix (below) | 12 |

- **29 of the first 41 failed against the unchanged code, on the intended assertions** (`red-summary.txt`):
  a view listing the hidden characters, a hotkey landing on one, or `trashTime` still set after opening. None
  failed on an import or setup error; the Gate 2 reviewer read each red reason against the test source.
- **Two later tests** in the `playgroundChat.trashTime` file, "clearing a full §playground's trashTime marks
  it for save" and "clearing the trashTime of a §playground restored from an archive marks it for save",
  were red against the first fix, the one without the mark: both failed with `Number of calls: 0`
  (`red-r2.log`: that file 2 failed of 8; the log's summary counts a second file as passed). They were not
  run at the unchanged source. Counting each at its own pre-fix tree, **29 + 2 = 31 of the 43 were red**. They pin that a mark for the Playground's
  `chaId` is requested; they do not show that a save is scheduled or a block re-encoded, and Gate 2 round 2
  showed the re-encode happens without the mark. Treat them as regression tests for the mark call, not as
  proof of a data-loss fix.
- The 12 guards carry a `guard:` title prefix and pass before and after the change. They pin what must not
  move: an ordinary character named `'assistant'` stays listed and stays in the cycle; trashed characters
  stay hidden when `hideTrash` says so; a `§playground` without a `trashTime` stays without one; a new one
  has none; a failed restore leaves the placeholder byte-identical and selects nothing.
- After the change all 43 pass (`green-r2.log`: 2 files, 15 tests, the playground trashTime file being one of
  them; the full run in section 4). The first 41 also passed with the neighbouring files in `green.log`
  (20 files, 262 tests; its command and file list were not saved), and in the Gate 2 round-1 reviewer's
  run of the touched and neighbouring files (24 files, 270 tests). `neighbours.log` is a baseline at the
  unchanged source, not a post-change run.
- Not done: no reviewer ran mutants (they reasoned by reading), and the round-1 reviewer did not re-run the
  red run.

## 4. Checks

Run by the Orchestrator on the final tree, before the two comment-only rewordings of Gate 2 round 2
(`full-status2.txt`):
- `pnpm vitest run`: 227 files, 3,767 passed, 4 skipped;
- `pnpm check`: 0 errors, 0 warnings;
- `pnpm build`: exit 0.

The first full run, on the implementation snapshot before the save mark (`full-status.txt`), was 3,765
passed; the difference is the two save-mark tests. The full suite, the check and the build were not re-run
after the comment-only edits (round 1's three, round 2's two); the Orchestrator checked by diff that each
set touched comments only.

## 5. Gate record

**The survey** (ledger row 514). Question: which views list characters from `db.characters`? The
`code-searcher` found the grid's `formatChars`, the mobile list's `sortChar` and the `selectChar` picker,
and the sidebar through `characterOrder`. **It missed the `prevChar` and `nextChar` hotkeys.** The
Orchestrator added them from its own grep of `changeChar(` callers.

**Gate 2, round 1: `[EDITORIAL]`**, `adversarial-reviewer`, on the working tree against HEAD `b4942db4`
(ledger row 515).
- It independently grepped every iteration of `db.characters` in `src/lib` and `src/ts` and agreed that the
  set of UI lists is complete. The MCP `risu-list-characters` tool and the plugin character getters still
  list every entry; the reviewer counted them as data access, not a UI list, and that agrees with leaving
  `§temp` alone (`MC-083`). `alertSelectChar` has one caller and is not part of the plugin API.
- It judged the scope right-sized, and that I2 and I3 fit the `MC-091` rule and do not touch the `MC-146`
  restore flow. Plan review was not needed.
- It checked index mapping: the grid and the mobile list carry the original index, the picker is keyed in
  place, and `characterCycle` stores the original index. The tests assert the indices and `chaId`s handed on
  with hidden entries ahead of the target.
- It checked the only data write added then, `delete char.trashTime`, against `restoreCharacterFromTrash`,
  which writes `undefined`: both leave the field falsy, and the test asserts falsy. It said the clear
  persists through the selected-character effect and the interaction bump; round 2 corrected the reason.
- **Three editorial findings, applied by the Orchestrator and checked as comment-only by diff:**
  1. the `hotkey.hiddenCharacters` test header gave a false reason for keeping `./util`'s real exports (the
     shared rule lives in `hiddenCharacters.ts`, which is not mocked);
  2. the `playgroundChat.trashTime` test named two different files as its import set (both now name
     `playgroundChat.coldStub.svelte.test.ts`), and the `openPlaygroundChat` doc comment was re-wrapped;
  3. the `characterCycle` comment implied the same order as the sidebar; it now says same membership, name
     order.
- The grep of the history trigger words over the diff and the new files found none, and no in-repo line
  numbers were left in comments.
- Not re-run by the reviewer: the red run, the full suite, `pnpm check` and the build (it read the
  Orchestrator's `full-status.txt`).

**Gate 2, round 2: `[EDITORIAL]`**, the same reviewer, after the save mark was added (ledger row 515).
- Round 1's four editorial fixes were verified closed. The `openPlaygroundChat` doc comment still has one
  slightly ragged line break (cosmetic, not required).
- **Executed, not only read:** a scratch test (in the reviewer's scratchpad, nothing under `src/`) with the
  real `registerDbChangeEffects` and a real tracker. (A) Another character selected, the Playground's
  `trashTime` deleted in place, then the Playground selected: its `chaId` is tracked and a save is marked.
  (B) The Playground already selected, only the delete: tracked. (C) Nothing selected, an in-place delete:
  not marked, which is the gap `characterSaveMarks.ts` documents. So in the normal flow the clear is tracked
  and marked for save without the new mark (that the block is then re-encoded is the reviewer's reading
  of `prepareSaveIteration`, not executed). Round 1's conclusion (it persists) stands; its reason did not (selecting the
  character re-runs the selected-character effects; the interaction bump is not what saves it).
- **The mark, judged:** sufficient and redundant for the normal flow; the only help in the narrow window
  before `saveDb` registers its effects (the mark is queued then and drained on install). No harm found: it
  sits in the `charIndex !== -1` branch after the placeholder guards, runs only when `trashTime` is set,
  duplicates de-duplicate, and it costs one extra debounced save per open of a trashed Playground.
- **Two comments overstated necessity** ("the save tracking does not observe" the removal, "may never be
  written"; "only re-encoded if it is marked") and were reworded by the Orchestrator, who checked the diff
  is comment-only. The new test titles ("marks it for save") are true.
- **Optional, not done:** assert that the mark is **not** requested when there is no `trashTime` and when the
  restore fails (section 7). A mutant that marks on every open would survive today.

**The records fact-check** (ledger row 516, `doc-verifier`): 50 claims, 37 VERIFIED, 1 WRONG, 1 STALE, 4
OVERSTATED, 5 INCOMPLETE, 2 UNVERIFIABLE. The corrections are applied in this report, the Roadmap, Live-State
and the commit messages. Its note on the in-place `trashTime` delete led to the save mark (section 1).

## 6. What is not covered

- **No live check in the browser pane.** The tests model the views; the grid, the mobile list, the picker
  and the hotkeys were not exercised in a running app.
- **The MCP list tool and the plugin getters** still list the two system characters. That is data access,
  not a character-list view, and hiding them there is not part of this change.
- **Nothing shows the mark schedules a save.** The two tests mock `markCharacterForSave`; the executed
  scratch test in round 2 covers the tracking, not the save of a Playground left unselected (case C), which
  `characterSaveMarks.ts` documents as a gap in general.

## 7. Open follow-ups

1. **A `§playground` trashed before this change and never opened** (for example one that arrives in an
   upstream save) still reaches the boot purge at the first boot more than three days after it was trashed,
   and can no longer be restored from the trash tab. The same holds for an archived trashed `§playground`
   whose restore keeps failing. Opening the Playground once clears the `trashTime`. This is not new loss in
   kind: a trashed character was always purged. (The round-1 reviewer's optional point O1.)
2. **A stray `§temp` copy has no UI path now.** Its chats remain in the save (section 2).
3. **`wiki/Playground.md`** documents PG-1 as current behaviour (the Playground chat appears in the
   character grid). The wiki session updates it; this session did not touch `wiki/**`.
4. **PG-2, PG-3 and PG-4** remain open under CHORE-16.
5. **Report 53's open follow-up is unchanged by this fix:** the member picker still offers an upstream group
   placeholder (typed `'character'`). The picker's new filter does not look at that.
6. **Optional test guards** (round 2): assert `markCharacterForSave` is not called when the Playground has no
   `trashTime`, and not when the restore fails.
7. **Next:** memory stage 1 step 4 (the backup; `Agents/Live-State.md`).
