# Deferral re-review: which "pre-existing" calls survive, and which do not

**STATUS:** reference

**Status:** rev 1, 2026-09-23. Findings only; no stage is planned here.

**Why this exists.** Deferrals across the campaign were sometimes justified on the grounds that a
defect was "pre-existing", "not newly introduced", or that fixing it would change current behaviour.
The maintainer established on 2026-09-23 that **this fork has never shipped and has no userbase** —
the campaign itself gates the first release, and the last build with users is upstream. So there is
no installed behaviour to preserve and nobody was ever hit by a fork-local bug. Every deferral
resting on that reasoning needed re-testing. Deferrals resting on genuine scope or blast-radius
reasons are unaffected.

**Method.** An investigator swept `Agents/**/*.md` (excluding `Agents/Evidences of Investigations/`,
which is gitignored third-party material and was never opened), classified each deferral by the
reason actually load-bearing in the doc, and re-checked **current source** for each rather than
trusting the doc. 41 distinct items. The Orchestrator then independently verified in source the four
items below that carry a recommendation.

---

## 1. The headline: most "pre-existing" labels were honest, not excuses

This is the important negative result. Of the nine items whose deferral mentioned pre-existing
status, only **three** actually rested on it. The others used it as a *provenance label* while the
load-bearing reason was genuine and still holds:

- **Plugin `setDatabase` deletions reappearing after reload** — kept deliberately because the naive
  fix is worse: it would add a permanent-deletion path driven by stale plugin snapshots. Sound.
- **Last-writer-wins on revision-unaware backends** — a CRDT or op-log is a save-format and decoder
  rewrite, deferred behind Phase 2 by product decision. Sound.
- **The CHORE-09 group** — labelled "upstream behaviour, not fork-introduced", but deferred on
  priority and on most items being unreproduced, not on provenance. Sound.

The list below is therefore short by design. Inflating it would waste the campaign's remaining
effort on items whose deferrals were correct.

## 2. Re-open: deferred on void reasoning, still open, integrity or loss class

All three were verified in source by the Orchestrator on 2026-09-23.

### 2.1 `removeChar` permanent-delete has no in-flight-generation guard

`removeChar(identifier, name, 'permanent' | 'permanentForce')` in `src/ts/characters.ts` resolves the
index and calls `chars.splice(index, 1)` with **no `doingChat` check**. An in-flight generation
writing by index can therefore land on a different character after the array shifts.

Deferred in Report 17 §8 as a "**pre-existing corruption bug**" and a candidate for a future chore.
That is the void reasoning, verbatim.

The function already resolves the index late to survive *concurrent deletions*, so the race it does
not cover is specifically a live generation. **The fix is cheap: the `doingChat` guard pattern already
exists elsewhere in the same file**, so this is reusing a local idiom, not inventing one.

Class: INTEGRITY — a write lands on the wrong character.

### 2.2 `saveTimeoutExecute` has no maximum wait

`saveTimeoutExecute()` in `src/ts/globalApi.svelte.ts` clears and reschedules its timeout on every
call, with no ceiling and no forced flush. A driver that mutates repeatedly with awaits between
mutations — an import loop is the realistic case — can starve the save indefinitely.

Deferred in Report 11 §6 as "**pre-existing and NOT a regression** … Do not fix here."

Class: DATA-LOSS in principle, via a starved save outliving the session. The trigger pattern is
narrow, which is a reason to rank it below 2.1 and 2.3, not to leave it unlisted.

### 2.3 Remote blocks are content-hash-named but never verified on read

`hashRemoteBlockContent` in `src/ts/storage/risuSave.ts` is used **only on the encode side**, for
naming. The `RisuSaveType.REMOTE` decode path parses the pointer — including its `hash` field for v2
pointers — but does not re-hash the fetched content and compare. A torn or partial write to a remote
block is therefore served silently as if it were intact.

Deferred in Report 18 §7 because it "**predates** the plan, and Stage B does not make it worse within
a page load."

**This is the best value of the three.** The verification datum is already persisted in the v2
pointer, so closing it is a re-hash and a comparison on read, plus a decision about what to do on
mismatch — and the surrounding code already has a "don't guess, skip this block cleanly" convention
for exactly this situation. v1 pointers carry no hash and are simply not covered.

Class: INTEGRITY, shading into DATA-LOSS when the corrupt block is a character.

## 3. Orthogonal, and arguably more urgent: confirmed loss deferred on *priority*

The sweep's most valuable output was not on the question it was asked. These were deferred by
priority ranking, not by pre-existing reasoning, so strictly they are outside this re-review — but
they are confirmed, currently shipping, and in the class the campaign exists to close.

### 3.1 `updateInlayScreen()` destroys hand-edited custom prompts (CD-4, CHORE-11)

Orchestrator-verified: `updateInlayScreen(char)` in `src/ts/process/inlayScreen.ts` assigns
`char.newGenData = { … }` with mode defaults **unconditionally**, in every branch, with no check for
existing user-authored content. Toggling the view screen or the Inlay Screen setting therefore
silently discards whatever the user wrote.

Class: **DATA-LOSS**, directly user-authored content, one toggle away. This is the single strongest
pull-in candidate found by the sweep.

### 3.2 Plugin permission results are cached wrongly and then ignored (CHORE-08)

Investigator-verified, not re-verified by the Orchestrator: `getPluginPermission` in
`src/ts/plugins/apiV3/v3.svelte.ts` caches by `pluginName` alone rather than by plugin *and* kind, so
one grant can satisfy a different permission kind. Separately, `addProvider` awaits
`getPluginPermission(...)` and **does not act on the returned boolean**.

Class: INTEGRITY, permission-adjacent. A consent check that does not gate anything is worse than no
check, because the UI implies a decision was enforced. Worth confirming before acting.

### 3.3 Also confirmed still open by sampling

- **HAN-1** — a dedup check compares against `vector[0].substring(16)` while the prefix it strips is
  17 characters, so the check never matches and retrieved memory duplicates prompt context.
- **PG-1** — `GridCatalog.svelte`'s filter checks only `trashTime`, so the Playground character is
  deletable from the grid; the character auto-recreates but its chat history does not.

## 4. Doc rot found while sweeping

Three documents — Reports 09 and 11, and `Agents/Phase2-Handoff.md` — assert that
`src/ts/kei/backup.ts` reads `db.account.kei` without optional chaining, describing it as "confirmed
live" and "still not fixed". **It was fixed**, in commit `0291ea36`, which also closed CHORE-05's
nine save-conflict translation keys. The line now reads `if(!db.account?.kei){` with an explanatory
comment.

`Agents/Phase2-Handoff.md`'s claim that "`loadPages` is never reset on character switch" is likewise
superseded by Report 19's Stage A, though a documented residual remains (the reset is gated on no
message editor being open).

Stale "still broken" claims are worse than no claim: they spend a future session's effort
re-investigating a closed item. These should be corrected.

## 5. Coverage gaps — recorded rather than guessed

- **~54 individual sub-IDs** across the CHORE-09/10/12/13/14/15/16 catalogues were **not**
  individually re-verified against current source. Four of the highest-severity were sampled (§3.1,
  §3.2, §3.3) and **all four were still open**, which is weak evidence that the rest have not
  silently healed either — but it is sampling, not coverage.
- **Seven items from Report 13 §6** came back CANNOT-TELL: multiuser chat replacement after a failed
  guest load, account-mode `keys()` omitting non-avatar assets from backups, `drive.ts`'s incomplete
  sync on a failed read, cold-chat exports carrying only the pointer, `.bin` backups omitting legacy
  error-text chat blobs, the restore-then-cleanup-during-failing-saves race, and plugin side-field
  overwrite via `setChatToIndex`. Each needs a fixture, not a read.
- **CHORE-04** (module-toggle freeze) remains an unmeasured hypothesis; nothing indicates a
  measurement was ever taken.
- One item confirmed still open, `cleanChunks()` not being awaited in `src/ts/bootstrap.ts`, is a
  genuine asset-deletion race that was scoped out of the CHORE-07 plan rather than deferred on
  pre-existing grounds. Listed here so it is not lost.

## 6. Suggested order, if these are taken up

Not a plan and not gated; a recommendation for sequencing if the maintainer wants them.

1. **§3.1 (`updateInlayScreen`)** — confirmed loss of user-authored content, small, self-contained.
2. **§2.3 (remote-block verification on read)** — the verification datum is already persisted.
3. **§2.1 (`removeChar` generation guard)** — reuses an idiom already present in the file.
4. **§3.2 (plugin permission)** — verify first; it is the one recommendation here resting on a single
   investigator's reading.
5. **§2.2 (`saveTimeoutExecute` ceiling)** — real but narrow.
6. **§4 (doc corrections)** — cheap, and it stops costing future sessions.

Everything in §5 needs its own investigation before it can be ranked at all.
