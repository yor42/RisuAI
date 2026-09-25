# CHORE-28 — The save keeps the last good block of a `chaId` held by two characters

**STATUS:** implemented, gated; awaiting commit

**Status:** plan rev 3, 2026-09-25. Implemented; Gate 2 round 3 approved with findings and the
fix-up review approved (section 10, ledger rows 181 to 184).
- Gate 1 round 1 rejected rev 1 with four MAJOR findings (section 10). Rev 2 folds in every one.
- **Gate 1 round 2 approved rev 2 with findings** (ledger row 180). Rev 3 folds them in:
  - the multi-tab half of G-12 is dropped (N1);
  - a zero-holder exit is added (N2);
  - the Red labels are corrected (N3);
  - the grid resolves the clicked row's object after the confirms (N5);
  - the idle step becomes a seam (N6).
- Ready for implementation.

**Evidence:**
- **Ledger row 178, the `investigator` packet.** For every finding this plan acts on, the
  Orchestrator re-read the source:
  - `RisuSaveEncoder.init` and `set` in `risuSave.ts`;
  - `prepareSaveIteration` and `saveDb` in `globalApi.svelte.ts`.
- **Correction to the packet.** The test that pins today's collision does exist. It is "the save
  format holds one block per chaId" in `src/ts/plugins/tests/pluginIdentityFill.svelte.test.ts`,
  which is W0's scenario 20a.
- **Ledger row 179, Gate 1 round 1.** The Orchestrator re-checked each of its four MAJOR findings
  in source:
  - `alert.ts`;
  - `GridCatalog.svelte`;
  - `util.ts` `findCharacterIndexbyId`;
  - `characters.ts` `removeChar`;
  - `SavePopupIcon.svelte`;
  - the reload closure in `saveDb`.

**Maintainer context:**
- `MC-011`: the fork has never shipped, and upstream `.bin` files must keep loading.
- `MC-078`: when a write's target id has two holders, the write is skipped, never guessed.
- `MC-079`: while two characters share a `chaId`, its block is not rewritten, the last good save
  is kept, and the user sees a visible warning.
- `MC-082`: when a duplicated `chaId` has never been saved, the first holder is written once and
  then frozen.
- `MC-074`: multiuser (`src/ts/sync/`) is out of scope.

---

## 1. The defect

The save file holds one block per `chaId`: `RisuSaveEncoder.init` and `set` both write
`this.blocks[character.chaId]`. With two holders of one `chaId`:
- **A full encode (`init`)** encodes every holder under the same key, so the last one in the list
  wins.
- **An incremental save (`set`)** reads the mark from the id, not from a holder. The first holder
  in list order is encoded and consumes the mark. The second is skipped, whichever of the two was
  edited.
- **Either way,** one character is gone at the next load. A plugin's copy can overwrite the
  original. Upstream has the same code.

**Both loops walk the live `data.characters` array and pause at every block write.** A holder
appended partway through a pass is still visited. Gate 1 round 1 ran this: a copy pushed partway
through `init` won the block. Boot's `init` can take seconds at 1000 characters while the UI and
plugins are already live.

**How a duplicate `chaId` reaches runtime:**
- a plugin install of a copy that keeps the id;
- a v2.1 plugin editing `getDatabase()` in place, which W0's warning never sees;
- until W1, CHORE-26's member clone.

**Boot's repair (`assignIds`) runs before the save loop starts.** The backup loads repair the
decoded backup before installing it:
- the internal backup;
- the account backup;
- the Kei restore.

The local `.bin` restore (`backuplocal.ts`) does not repair. It calls `setDatabase`, then writes
the raw file and reloads the page. Boot then repairs, but the save loop can run once in between.
This plan adds the repair there too (G-11).

## 2. Scope

The guard lives in these places:
- the save encoder;
- the full-reload hand-over that replaces it;
- the save loop's idle pass;
- one indicator in the UI.

It also folds in two adjacent fixes the guard depends on:
- the grid acts on the row that was clicked (G-10);
- the local `.bin` restore repairs ids (G-11).

It does **not**:
- change the save format, decode, or any block other than a duplicated `chaId`'s;
- repair, rename or choose between the holders (`MC-078`; W0 never repairs at runtime);
- depend on W0's install-time warning, on which route made the duplicate, or on save marks to
  detect it;
- touch duplicate chat ids. W0 and `MC-078` cover those, and the save format does not key on
  them.

## 3. Invariants

**G-1. Detection is per pass, over one snapshot.**
- Every `init` and every `set` takes one shallow copy of `data.characters` at its start. It counts
  holders per block key, and encodes, over that copy only.
- The block key is computed exactly as `this.blocks` is keyed, so a missing `chaId` is counted
  under the same key it would be written to.
- A key is duplicated when two or more entries in the snapshot share it, however they got there.
- Within one pass, a key is encoded at most once.
- A holder added to the live array during a pass is not seen until the next pass.
- Each holder's key is read once per pass. Encoding uses that key, even if the holder's `chaId`
  changes while the pass is running.
- A holder that is not encoded in a pass is not added to `encodedCharacterProxies`. The identity
  effect may then mark its key once at boot; that costs one extra save, which is harmless.

**G-2. A duplicated key's block is kept.** While a key is duplicated and a block for it exists,
the file written by this save holds that block unchanged. For that key:
- the block is not re-encoded from either holder;
- it is not deleted, including by `set`'s "probably deleted characters" branch;
- a frozen key is taken out of `toSave.character`, so the deletion branch never sees it and no
  false "Deleting character data" line is logged;
- on a remote-block build, its pointer is unchanged and no remote payload is written;
- no local block-cache entry (`risuSaveBlock_<key>`) is written.

**G-3. A full reload keeps it too.**
- A full reload (`requiresFullEncoderReload`) builds a fresh encoder. If the key is duplicated in
  that encoder's snapshot and the encoder being replaced holds a block for it, the fresh encoder's
  output holds that same block.
- The fresh encoder starts with every key it froze or carried recorded as frozen. G-5 then applies
  across the hand-over.
- **The carry copies the block reference only.** It never moves, deletes or changes anything in
  the old encoder's `blocks`. A reload that throws partway leaves the old encoder exactly as it
  was, which is what `prepareSaveIteration`'s catch assumes.
- **The hand-over is one shared function,** used verbatim by `saveDb` and by the tests. A mutant
  that drops the hand-over must fail scenario 9, and the gate re-runs that mutant.

**G-4. Never saved (`MC-082`).**
- **Rule.** When a key is duplicated and no block for it exists, the first holder in snapshot order
  is encoded once. From then on G-2 applies.
- **Where "exists" is checked.** In this encoder, or, on a full reload, in the one being replaced.
- **Known edge.** At boot the encoder is empty even though the file holds a block. In the rare case
  of a copy inserted ahead of the original during boot's `init`, the copy is the one written.
  Section 7 records this.

**G-5. Saving resumes on its own.**
- Once a frozen key has exactly one holder again, the next pass writes that holder's current
  content, including edits made while the key was frozen. That pass can be `set` or a reload's
  `init`.
- This does not depend on a save mark arriving after the duplicate resolved.
- The save loop must actually run a pass:
  - while any key is frozen, the loop's idle branch re-counts holders (reading `chaId` only);
  - when a frozen key has resolved, it schedules a save.
  - **The idle step is a function the loop calls verbatim**, so a test can drive it. A mutant
    that removes the loop's call to it must be caught, or the plan's record says the loop
    wiring is untested.
- **Exit with fewer than two holders.** A frozen key with fewer than two holders in a pass leaves
  `frozenKeys` in that pass:
  - one holder: it is encoded (above);
  - zero holders: its block is handled exactly as HEAD handles an absent, unmarked key, whether
    or not a reload happens.
  - Either way, the indicator and the cold-storage refusal clear. A resolved key triggers exactly
    one save, never a repeating one.

**G-6. The visible warning is a persistent indicator, not a toast.**
- **Why not a toast.** `alertToast` shares the single alert slot. It can replace an open dialog
  (`alertConfirm` then resolves as "no"), and it can be replaced within a second.
- **The indicator.** While any key is frozen, an indicator stays visible, following
  `savingStoppedReason` in `SavePopupIcon.svelte`. It never replaces an open alert. Clicking it
  shows a message that:
  - names the characters by display name;
  - says their changes are not being saved while they share an id;
  - says the save file keeps the last saved version, or, for G-4, that only one of the two is
    protected;
  - says that permanently deleting one of them (trash, then delete from the trash) resumes
    saving.
- **Priority and placement.** In `SavePopupIcon.svelte` the indicator is the branch directly
  after `savingStoppedReason`, before the saving animation. That way it does not flicker off
  during every save when `showSavingIcon` is on. Its state clears when no key is frozen.
- **Every source of a frozen key publishes.** Keys frozen by boot's `init` or by a reload's carry
  publish the indicator and raise the console warning, just as keys frozen by `set` do.
- **Console warning.** One per episode per key, re-armed once the key resolves.
- **Strings.** New user-facing strings go in `src/lang/en.ts`; `translator` fills the other
  languages afterwards.
- **Safety.** Neither the indicator nor the warning ever blocks or throws out of the save loop.

**G-7. Nothing else changes.**
- For a database with no duplicated key, the bytes written are identical to HEAD's.
- Every existing save, remote-block, save-sequence and reload test passes unchanged.
- Decode is untouched.

**G-8. Cost.**
- The holder count reads `chaId` only, once per character per pass, with no other proxy reads.
- The idle re-count runs only while a key is frozen.
- Report both costs measured at 1000 characters (i9, production-mode Svelte), and say that this is
  best-case hardware.

**G-9. The wording matches the new behaviour.**
- **W0's duplicate warning** in `chatIds.ts` says "the next save keeps only one character with
  that chaId". That becomes a statement that saving of that `chaId` is paused and its last saved
  block is kept. Its assertion and title in `v3IdentityFill.svelte.test.ts` ("including the
  save-loss consequence") follow.
- **Any `src/` comment that says a duplicate `chaId` loses a character at save** is corrected.
- **A comment that stays true** is left alone. For example: a duplicate `chaId` never reaches the
  next boot, because the file holds one block per key.
- **The CHORE-17 comment in `encodeRawBlock`** says every block comes from "this same instance".
  After G-3 it no longer does. The comment is corrected: a carried block was committed under the
  same shared cache key, and nothing wrote that key while it was frozen.

**G-10. The grid acts on the row that was clicked.**
- `GridCatalog.svelte`'s delete, permanent delete and restore act on the entry that row shows,
  even when another entry shares its `chaId`. They never act on "the first holder of this
  `chaId`".
- **The entry is identified by the object itself, not by position or `chaId`.** It is located in
  the list **after** any confirm dialogs. An insert or delete elsewhere during a confirm must not
  redirect the action, including onto the other holder of the same `chaId`.
- If that entry is no longer in the list, the action does nothing.
- `removeChar` already accepts an index, so no other caller of `removeChar`,
  `restoreCharacterFromTrash` or `findCharacterIndexbyId` changes behaviour.

**G-11. The local `.bin` restore repairs ids.** `backuplocal.ts` calls `repairDatabaseIds` on the
decoded database before `setDatabase`, as the other backup loads do.

**G-12. Nothing deletes data a kept block needs.**
- **Cold storage.** `cleanColdStorage` works out which cold-storage keys are in use from memory.
  A kept block can reference cold-storage entries that memory no longer does. So while any key is
  frozen, cleanup refuses to run and tells the user why. It checks this at entry, and again
  immediately before it removes anything, because it awaits the verification of every
  cold-stored character in between.
- **Multi-tab: unchanged.** A frozen key does not make the tab dirty. A tab whose only unsaved
  state is frozen edits auto-reloads on a peer's save, as a clean tab does at HEAD, and those edits
  are lost. They are the edits `MC-079` already accepts as unsaved. The dirty prompt's "Save my
  changes" would write the tab's older copy of every other character over the peer's save, which
  is worse.

## 4. Mechanism (non-normative)

These are suggestions only; the invariants are what binds.

**The encoder:**
- It keeps a set of frozen keys, `frozenKeys`.
- `init` and `set` each take a snapshot, count holders, then encode in one loop that skips any key
  already encoded in this pass.
- `set` re-encodes a key that has left `frozenKeys`.
- `init` accepts the previous encoder and copies the block reference for a key that is
  duplicated.

**The reload hand-over.** One of these, so that the production path is the tested path:
- `prepareSaveIteration` calls `opts.reinitEncoder(previousEncoder)`;
- or an exported builder is used by both `saveDb` and the tests.

**The idle step.** An exported function that the loop calls verbatim when `!changed`. It returns
whether a save should be scheduled.

**The indicator:**
- The encoder exposes its frozen keys.
- `saveDb` publishes the characters' names to a store after every pass, including boot's `init`.
- `SavePopupIcon.svelte` renders from that store.
- `risuSave.ts` imports nothing from the UI.

**The grid:**
- The row carries its character object.
- The handlers pass that object into a helper, which runs the confirms and then finds the object
  in `DBState.db.characters` by identity (`indexOf` on the proxy).
- `removeChar` gains, or is wrapped by, that form.
- The existing string and number forms keep their behaviour for their other callers.

## 5. Acceptance scenarios

Each is a Vitest test.
- **Red:** the scenario must be run against HEAD and fail there before the fix is applied. Record
  the run.
- **Guard:** the scenario cannot be red at HEAD. It is proven by a named mutant that fails it, and
  the gate re-runs that mutant.
- **Coverage:** the scenario passes at HEAD and pins behaviour that must not regress.
- Each scenario states the list order and which marks exist at each pass.

**Order.** `set` keeps the first holder in list order and `init` keeps the last. So an
incremental scenario puts the copy B before the original A (`[B, A]`), and an `init`/reload
scenario edits A before the pass and expects A's pre-edit content.

**Encoder, incremental (`set`):**
1. **Red.** Setup: A is saved. The list becomes `[B, A]`, where B is a copy with different content.
   A's key is marked. Pass: `set`. Expected: decoding gives A's last saved content, not B's.
2. **Red.** Setup: `[B, A]`, and A is edited and marked. Expected: decoding still gives A's last
   saved content; neither the edit nor B.
3. **Guard.** Mutant: the frozen key is left in `toSave.character` and not added to `savedId`.
   Expected:
   - the frozen key's block is not deleted;
   - no "Deleting character data" line is logged for it.
4. **Red: resume.**
   - A is saved.
   - B is inserted ahead of A.
   - A is edited and marked while frozen.
   - B is removed from the list, with no mark after that.
   - Expected: the next `set` writes A's edited content.
5. **Resume, then a new duplicate.**
   - A resolves and is saved.
   - A new copy C is inserted ahead of A, and A's key is marked.
   - Expected: the block stays at A's resolved content.
6. **Coverage.** Two characters with different `chaId`s, both marked, are both written. The
   existing "marking BOTH ids" test stays green.
7. **A copy pushed partway through a pass.**
   - **Red, `init` variant.**
     - Setup: during `init`, after A has been encoded, B (same key) is appended.
     - Expected: the block holds A.
     - Then: a marked `set` over `[A, B]` with B edited keeps A's content.
   - **Guard, `set` variant.**
     - Setup: during `set`, after A has consumed its mark, B is inserted.
     - Expected: the block holds A.
     - Mutant: iterate the live array instead of the snapshot.

**Never saved (`MC-082`):**
8. **Red for `init`,** because today the last holder wins.
   - Two new holders, with no prior block. The first in snapshot order is written, through `set`
     and through `init`.
   - Then the first holder is edited and marked. The block still holds its first-written content.

**Full reload, through the shared hand-over:**
9. **Red: the reload keeps the block.**
   - A is saved.
   - B, a copy with A's key, is inserted.
   - A is edited, and a reload is requested.
   - Expected: after the reload, the file holds A's pre-edit block. It holds neither the edit nor
     B's content, and the block is not missing.
   - Mutant: drop the hand-over. It must fail.
10. **No prior block.** As 9, but with no block for the key. The first holder in snapshot order is
    written (G-4).
11. **Resolved during the reload.** The duplicate is resolved while the reload's `init` runs.
    Expected: the next pass writes the survivor's current content (G-3, G-5).
12. **Permanent deletion.**
    - With a reload: B is permanently deleted, and A is written fresh, including edits made while
      frozen.
    - Both deleted: the block is deleted, as it is today.
13. **Zero holders without a reload (G-5 exit).**
    - Setup: both holders are spliced out, with no mark and no reload flag.
    - Expected:
      - the key leaves `frozenKeys`;
      - the indicator clears;
      - the idle step asks for exactly one save;
      - the following idle steps ask for none.

**The save loop's idle step (a seam):**
14. **Red.**
    - Setup: a key is frozen, and one holder is removed in a way that sets no mark.
    - Expected: the idle step asks for a save, and the following pass writes the survivor.
    - Mutant: remove the loop's call to the idle step. If no test can drive the loop, the gate
      record says the loop wiring is covered only by review.

**Remote blocks:**
15. **A frozen key on a remote-block build.** The key writes no remote payload and keeps its
    pointer, through `set` and through a reload.

**The indicator and warning:**
16. **Red.**
    - While a key is frozen, the indicator's store is set and names both characters. It clears
      once the key resolves.
    - This holds for a key frozen by `set`, by boot's `init` and by a reload's carry.
    - The console warning fires once per episode and re-arms after the key resolves.
    - Nothing in the save loop writes `alertToast`, `alertNormal` or anything else to the alert
      store.
17. **Group chats.** A group chat that shares a key with a character, or with another group, is
    guarded the same way.
18. **The indicator's position.** In `SavePopupIcon.svelte`, it shows when `showSavingIcon` is on
    and a save is running, and `savingStoppedReason` still wins over it.

**The grid (G-10):**
19. **Red.** Characters `[A, B]` share a key.
    - Deleting B's row moves B to the trash, not A.
    - Permanently deleting B's trashed row removes B.
    - Restoring B's row restores B.
    - A character is inserted at index 0 while the delete confirm is open, so B's old index now
      holds A. The delete still acts on B.
    - When B is no longer in the list at click time, nothing happens.

**The local `.bin` restore (G-11):**
20. **Red.** A decoded local backup holding a duplicate `chaId` is repaired before `setDatabase`.

**The cold-storage guard (G-12):**
21. **Red.** `cleanColdStorage` refuses while a key is frozen, and deletes nothing.
    - It also refuses when the key becomes frozen during its verification step, after the entry
      check.

**W0's pin, inverted:**
22. **Red.** Rewrite scenario 20a (`pluginIdentityFill.svelte.test.ts`, "the save format holds one
    block per chaId") as a marked `set` pass:
    - the list is `[B, A]`;
    - a block for A already exists;
    - A's key is marked;
    - the decoded file holds A's saved character.
    Keep a separate assertion that the file still holds one block per key.

**Route coverage:**
23. **A v2.1 in-place duplicate.**
    - A copy is inserted at index 0 through `getDatabase()`, then `setDatabaseLite(getDatabase())`
      is called.
    - Through `prepareSaveIteration` and a marked `set`, the original's block is kept.
    - W0's warning never sees this route. This is Red when the copy goes first.

**Compatibility:**
24. **Coverage.** The existing suites pass unchanged: `risuSave`, remote blocks,
    `globalApi.saveSequence`, backup loads, cold storage, multi-tab and `GridCatalog`. The
    exceptions are the tests named in G-9 and scenario 22.

## 6. Compatibility

- **Format:** unchanged. A file written while a key is duplicated is an ordinary save, with one
  block per key. Upstream and this fork read it the same way.
- **Upstream `.bin` files, characters, modules, presets and plugins:** untouched. Decode does not
  change. The local restore gains the same id repair the other backup loads already run.
- **Plugins:** no API change. A plugin that makes a duplicate `chaId` sees the same runtime state.
  Only what reaches disk changes, and the user is told.

## 7. Risks

- **Edits to either holder are not saved while the duplicate lasts.** That is the decision
  (`MC-079`), and the indicator says so. If the app closes, both holders' unsaved edits are lost,
  and the next load shows only the kept block's character.
- **A plugin that keeps a duplicate for good** freezes that character for good. The indicator
  stays up until one holder is permanently deleted.
- **Identical copies may be hard to tell apart.** Whichever one the user deletes, the other becomes
  the saved character with its current content. Both are complete characters; only which content
  survives differs.
- **The boot edge (G-4).** Boot repairs ids before the save loop starts. A copy inserted ahead of
  the original after that repair, but before `init` takes its snapshot, is written first and then
  frozen. HEAD's `init` would have written the last holder, which is the original. This is rare:
  the window is the few awaited root-block writes at the start of `init`. (Corrected at Gate 2; an
  earlier revision called this the same outcome as HEAD's.)
- **The reload path is the easy one to get wrong** (G-3, scenarios 9 to 12). The shared hand-over
  and its mutant are there for that.
- **The deletion branch in `set`** assumes any id left in `toSave.character` belongs to a deleted
  character. A frozen key is taken out of `toSave`, so it never gets there.
- **Multi-tab.** A tab whose only unsaved state is frozen edits auto-reloads on a peer's save, and
  those edits are lost (G-12). The in-memory duplicate goes with them. After the reload, the tab
  shows whatever the peer saved.
- **The block cache and `this.blocks` can already disagree at HEAD,** for example after a failed
  reinit or across tabs sharing the cache. This plan relies on the cache only in one way: a frozen
  key writes no cache entry. It makes no further claim about the cache.

## 8. Files expected

- `src/ts/storage/risuSave.ts`: the guard.
- `src/ts/globalApi.svelte.ts`:
  - the shared hand-over;
  - the idle re-count;
  - the idle step seam;
  - the indicator store update.
- `src/ts/stores.svelte.ts`: the indicator's store.
- `src/lib/Others/SavePopupIcon.svelte`: the indicator.
- `src/lib/Others/GridCatalog.svelte`, and `src/ts/characters.ts` if the restore helper needs an
  index form: G-10.
- `src/ts/drive/backuplocal.ts`: G-11.
- `src/ts/process/coldstorage.svelte.ts`: G-12.
- `src/ts/process/chatIds.ts`: the warning wording (G-9).
- `src/lang/en.ts`: the new strings. `translator` handles the others.
- **Tests:**
  - `src/ts/storage/tests/risuSave.test.ts`, or a new sibling;
  - `src/ts/globalApi.saveSequence.svelte.test.ts`;
  - `src/ts/storage/tests/risuSaveRemoteBlocks.test.ts`;
  - `src/ts/plugins/tests/pluginIdentityFill.svelte.test.ts`;
  - `src/ts/plugins/apiV3/tests/v3IdentityFill.svelte.test.ts`;
  - the cold-storage deletion-guard tests;
  - a `GridCatalog` test;
  - a local-restore test.

## 9. Residuals

- **The boot edge in G-4** (section 7).
- **CHORE-29.** Stale blocks from `chaId` fills and replacements. Unchanged here.

## 10. Gate record

### Gate 1 round 1 — `opus-reviewer` (fresh), rev 1 — **[REJECT]**

Ledger row 179. The Orchestrator re-checked each MAJOR finding in source.

**MAJOR findings:**
- **M1 (run).** Each pass walks the live array, so a copy pushed partway through `init` wins the
  block. A count taken at the start goes stale, and counting inside the loop is too late. **Fixed
  in G-1:** one snapshot per pass, at most one encode per key, and `init` seeds `frozenKeys`.
  Scenarios 7 and 11 were added.
- **M2.** `alertToast` shares the single alert slot. It lasts about a second, can be replaced, and
  can cancel an open `alertConfirm`. **Fixed in G-6:** a persistent indicator following
  `savingStoppedReason`, and nothing written to the alert store from the save loop.
- **M3.** A normal delete only trashes, so the key stays duplicated. The grid's delete, permanent
  delete and restore pass `chaId`, and `findCharacterIndexbyId` returns the first holder. The
  warning's advice could therefore lead the user to delete the original. **Fixed:** G-10, and
  scenario 17. The indicator's text names permanent deletion.
- **M4.** Tests supply their own reload closure, so the production hand-over would be untested.
  **Fixed in G-3:** one shared hand-over, with a mutant that must fail scenario 9.

**MINOR findings:**
- Scenarios 1, 3 and 4 were green at HEAD in `[A, B]` order. They are now in `[B, A]` order, and
  scenario 3 is relabelled as a guard.
- G-5 had no trigger, because a permanent delete of a trashed holder can set no mark. The idle
  re-count was added, with scenario 13.
- Cold-storage cleanup could delete data the kept block needs. Added G-12 and scenario 19.
- Multi-tab: a completed save reset `dirtySinceLastSave`. Added G-12 and scenario 20.
- §1 wrongly claimed that every backup load repairs. Corrected, and G-11 added.
- G-3's cache sentence overstated. Reworded in section 7.
- Keys are now counted the same way `this.blocks` keys them, and frozen keys are taken out of
  `toSave` (G-1, G-2).
- G-9 now covers the test title.
- The boot edge was noted (G-4, section 7).

(Scenario numbers in this round refer to rev 2. Rev 3 renumbered them.)

### Gate 1 round 2 — `opus-reviewer` (fresh), rev 2 — **[APPROVE-WITH-FINDINGS]**

Ledger row 180. The reviewer's new HEAD probes did not run, because of a shell-wrapper failure, so
its claims about HEAD are traced. The Orchestrator re-checked N1 in `multiTabReload.ts` and in the
save loop's prompt, and N5 in `removeChar`.

**Round 1 closure.** M1, M2 and M4 are closed; M3 is mostly closed (see N5). Every MINOR is
closed except the multi-tab one, which rev 2's fix made worse (N1).

**MAJOR findings:**
- **N1. Making a frozen tab dirty is harmful.**
  - A dirty tab prompts on a peer's save. On non-Node backends, "Save my changes" then writes the
    tab's older copy of every character over the peer's save.
  - A permanent duplicate repeats this on every peer save.
  - **Fixed:** the multi-tab half of G-12 is dropped, and a frozen-only tab auto-reloads as at
    HEAD. The Orchestrator decided this without asking the maintainer. It changes nothing
    relative to HEAD, and the edits it loses are the ones `MC-079` already accepts as unsaved.
- **N2. No exit for a key whose holders all disappear without a reload.**
  - The indicator, the dirty flag and the cold-storage refusal could stay on for good.
  - Alternatively, the idle re-count could trigger a save every second.
  - **Fixed:** G-5 now has a fewer-than-two-holders exit, and scenario 13 was added.

**MINOR findings:**
- **N3. Red labels false at HEAD.** Rev 2 scenarios 9, 7 (`set`), 21 and 22 would pass at HEAD.
  **Fixed:**
  - an order rule was added;
  - the reload scenario edits A first;
  - the `set` variant of 7 is now a Guard;
  - the pin is a marked `set` pass;
  - the v2.1 copy goes first.
- **N4.** The CHORE-17 comment's "this same instance" was about to become false. Added to G-9.
- **N5. Index plus check could not tell the two holders apart.** `removeChar` resolves the index
  after its confirms. **Fixed:** G-10 identifies the row by its object, after the confirms. A
  shift onto the other holder was added to scenario 19.
- **N6.** The idle step had no seam, which was M4 again. **Fixed:** G-5 and scenario 14 make it a
  function the loop calls verbatim, with a mutant, or a disclosure.
- **N7.** The indicator's placement, and boot or carry publishing. Added to G-6, and scenarios 16
  and 18.
- **N8.** `cleanColdStorage` checked only at entry. It now checks again before removing anything
  (G-12, scenario 21).
- **N9.** The carry copies the reference only. Added to G-3.
- **N10.** Non-encoded holders stay out of `encodedCharacterProxies`. Added to G-1.

**Scope.** The reviewer would split out only the multi-tab half of G-12, and it is dropped. The
rest stays: G-10 is the fix the indicator tells the user to make, and G-11 is one line.

### Implementation

**Red first.** `test-warrior` wrote scenarios 1, 2, 4, 7 (`init`), 8, 19, 20, 22 and 23 against
HEAD. 15 assertions failed on the loss, and one (never-saved `set`) passed as coverage. The
Orchestrator re-ran them.

**Two coders worked in parallel on disjoint files:**
- the save guard, the hand-over, the idle step, the indicator, cold storage and wording;
- the grid (G-10) and the local restore (G-11).

**The Orchestrator's own review of the first diff** found that the hand-over carried only keys
already frozen in the old encoder. That had two consequences:
- a duplicate first seen at a reload lost its block;
- a frozen key whose holders were all deleted was carried back.

`init` now takes `previous` and consults it only for a key duplicated in its own snapshot.
`test-warrior` then added the tests that use the new seams, and the mutants.

### Gate 2 round 1 — two `opus-reviewer` lenses (fresh)

Ledger row 181.

**Data-safety lens: [APPROVE-WITH-FINDINGS].** It found no loss path. G-7 byte identity was run
against HEAD. All five findings were MINOR:
- a frozen key marked twice logged a false deletion line;
- this report's boot-edge claim was false (corrected in section 7);
- the calls added to the save path were unguarded;
- the cold-storage re-check did not sit immediately before removal;
- the key form was inconsistent.

**Evidence lens: [REJECT].**
- **M1.** The per-pass copy of the list was load-bearing but untested. At HEAD, removing a character
  during an earlier character's write makes the loop skip the next one and delete its block.
- The test counts in the commit were false.
- Test comments described fixed bugs in the present tense.
- Titles claimed wiring the tests did not exercise.

All of these were fixed. This was substantive rejection 1.

### Gate 2 round 2 — `opus-reviewer` (fresh) — **[REJECT]**

Ledger row 182.

**MAJOR-1 (run).** Round 1's `String(chaId)` counting had matched marks with `indexOf(key)`. Marks
can hold the raw selected `chaId`, which `frontUnshiftSelected` pushes. So a selected, edited
character with a numeric `chaId` lost its block on every pass.

**Mechanism question.** The fix-up had normalised only one side of a comparison. Every mark-to-key
comparison now uses the string form, and the raw value is still passed as `encodeBlock`'s `name`.

**MINORs:**
- the counts were off by one, because the HEAD swap had missed `en.ts`;
- two `init` mutants survived;
- the resume wording held only for two holders.

This was substantive rejection 2.

### Gate 2 round 3 — `opus-reviewer` (fresh) — **[APPROVE-WITH-FINDINGS]**

Ledger row 183.

**Result.** The mechanism is consistent wherever the raw and string forms meet. G-7 is identical,
and the counts and cost hold.

**Findings:**
- The deletion loop's `String()` compare had no test. Mutant C loses a numeric character with marks
  `[5, 'x', 5]`.
- One assertion was weak.
- Spies were not restored after a failing assertion.
- `unknown[]` was widened.
- There were two wording issues.

**Rejected suggestion.** The reviewer proposed converting `toSave.character` to strings in place
at the top of `set()`. The Orchestrator did not adopt it. After a failed write,
`mergeUnsavedChanges` folds the list back into the live tracker. The no-reload filter in
`prepareSaveIteration` compares raw values, so a numeric `chaId`'s mark would then be dropped.

**The loop wiring is covered only by review.** The save loop's calls to
`checkFrozenKeysForResolution` and `publishFrozenSaveIndicator` cannot be driven by a test.

### Fix-up review — `adversarial-reviewer` (fresh) — **[APPROVE]**

Ledger row 184. Every round-3 finding is closed, and the checks were run:
- mutant C is killed only by the new `[5, 'x', 5]` test;
- mutant B is killed only by the strengthened numeric two-holder test, which now fails at HEAD;
- the spy restores moved and no assertion went with them;
- the comment warning against converting `toSave.character` in place is true.

The final counts are 56 tests: 25 on the loss, 2 on MC-082, 4 on the indicator, 14 on a missing
function, 1 on wording, and 10 passing at HEAD. The full suite is 104 files, 1310 passed and 4
skipped.
