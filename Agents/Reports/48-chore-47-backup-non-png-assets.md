# Report 48 — CHORE-47: a local backup left out every asset that was not a `.png`

**STATUS:** fixed, 2026-09-30. **Plan gate skipped** under AGENTS.md section 4's carve-out (small,
well-contained, obvious shape). **Gate 2 passed:** round 1 [EDITORIAL] (ledger row 465), remediation
(row 466), round 2 [APPROVE] (row 467). Committed as `d25a02fb`; this report is added by the
records commit that follows it.

**Sources:**
- the CHORE-47 scoping packet (ledger row 461; scratchpad `chore47/packet.md`), whose claims the
  Orchestrator read in source; row 465 found one thing it missed (Node `coldstorage/` keys, below);
- Roadmap CHORE-47 and CHORE-48;
- the code: `src/ts/drive/backuplocal.ts`, `src/ts/globalApi.svelte.ts` and the new
  `src/ts/drive/tests/backuplocalAssetExtensions.test.ts`.

Decisions this change implements: `MC-133` 3 (`CHORE-47` is fixed now, as its own change, not inside
the backup stage), `MC-069` (an upstream defect found in passing goes to the Roadmap), `MC-080`
(migration from and to upstream is by the local `.bin` backup, so what the backup drops is lost).

## 1. What was wrong

`SaveLocalBackup` and `SavePartialLocalBackup` in `backuplocal.ts` kept a key only if it ended in
`.png` (four filters: `endsWith('.png')`, at HEAD `backuplocal.ts:97, 123, 275, 319`, per the
scoping packet). Any asset stored under another extension was left out of the `.bin` file, and
nothing told the user. Restore is not the problem: the fork's restore loop and upstream's both store
any entry that is not `database.risudat`, cold storage or `encryption.risudat` as `assets/` plus its
name, whatever the extension (packet Q3, read at `upstream/main`). So the data was lost at backup
time.

- **Who was affected:** users of the upstream build. `upstream/main` has the identical filter,
  introduced with the feature itself (commits `4f58a12b`, `d8407202`; packet premise 4). The fork has
  never shipped (`MC-011`), so no fork user was hit. Migration from upstream is by this backup
  (`MC-080`), so a card author's audio, video, WebP, JPEG, font or CSS assets would be missing after
  moving to or from a backup.
- **Case-sensitivity:** the test was case-sensitive, so a real PNG stored as `.PNG` was dropped too
  (a risuext card's extension is taken unlowercased; packet Q2).

## 2. Scope

`saveAsset` in `globalApi.svelte.ts` keeps a passed file name's extension. **Four sites pass one:**
the three asset pickers (`AssetInput.svelte`, `CharConfig.svelte`, `ModuleMenu.svelte`) and the
risuext `additionalAssets` import in `characterCards.ts` (hub download and legacy V2+risuext cards;
the extension comes from the card, unvalidated). `.charx` and module import always save `.png`
whatever the content, so their assets were already backed up (ledger row 461). Plugins can pass no
extension (`saveAsset(data)` takes one argument in both plugin APIs; packet Q2).

What the filter did on each path:

| Path | Kept | Dropped |
|---|---|---|
| Full backup, web (`forageStorage.keys()` loop) | keys ending `.png` | every other asset key, and also the non-asset keys that the same `forageStorage.keys()` lists (`database/`, `remotes/`, markers, and on the Node server `coldstorage/`) |
| Full backup, Tauri (`readDir('assets')` loop) | names ending `.png` | every other file, and also subdirectories and system files (`.DS_Store`, `Thumbs.db` can occur; packet, INFERRED) |
| Partial backup, web and Tauri | referenced keys (`assetMap`) ending `.png` | referenced non-png keys. In practice the filter dropped nothing from fork-created profiles, since every profile image is saved without a file name and so is `.png` (packet premise 2, TRACED for callers, INFERRED for "no other setter") |

Two facts shaped the fix:

- **On Tauri the `.png` test also hid things `readFile` cannot read.** Removing it without an
  `isFile` check would send a directory to `readFile`, which throws, and the loop had no try/catch,
  so the backup would abort after the writer was opened (packet Q1). The fix must check the entry
  type.
- **No `.png` key exists outside `assets/` on any backend** (the packet enumerated every writer), so
  switching the web filter to an `assets/` prefix drops no key that was backed up before. The prefix
  is needed because the same listing also returns the database, remote-block and marker keys: without
  it, removing the `.png` test would write them into the backup as asset entries. Row 465
  added one case the packet missed: the Node server's key list includes `coldstorage/<uuid>` keys
  (`coldstorage.svelte.ts` `setItem('coldstorage/' + key, ...)`). They were excluded by the old test
  and are excluded by the prefix test. Cold storage reaches the backup by its own path
  (`collectColdStorageBackupPayloads`).

## 3. The change

`src/ts/drive/backuplocal.ts`:
- `SaveLocalBackup`, Tauri loop: skip an entry unless `asset.isFile || asset.isSymlink`. The read is
  in a try/catch; a failed read lands in the missing-assets list and the loop goes on. `readDir` does
  not follow links, so a symlink is read.
- `SaveLocalBackup`, web loop: keep a key only if it starts with `assets/`.
- `SavePartialLocalBackup`: the `.png` test is gone from both loops. The Tauri loop has the same
  `isFile || isSymlink` check and the same try/catch; the web loop keeps only `assets/` keys. The
  referenced-key set (`assetMap`) is still the selector. One reporting difference on the web: a
  referenced value that is not a stored asset key (for example a URL or `data:` value in a persona
  icon) ending `.png` was looked up, not found and listed as missing; it is now skipped without a
  missing-asset line. No data is involved, and this is intended.
- Restore is unchanged; it is already extension-agnostic and upstream-restorable.

`src/ts/globalApi.svelte.ts`, `LocalWriter.writeBackup`: throws an `Error` naming the entry when the
name length or the data length is above `0xFFFFFFFF`. The container stores both as unsigned 32-bit
values, and the old code wrapped a longer one silently (`new Uint32Array([2**32+5])[0]` is `5`; packet
Q6), which would misparse every entry after it. A thrown error reaches `alertError` through the
`unhandledrejection` listener in `bootstrap.ts` (ledger row 464; the Orchestrator's reading).

Not changed: the partial and full backups' progress text and counters (cosmetic only, packet Q6).

## 4. Tests

New file `src/ts/drive/tests/backuplocalAssetExtensions.test.ts`, 25 tests. The real
`SaveLocalBackup`, `SavePartialLocalBackup`, `LoadLocalBackup` and `LocalWriter` run; only the stream
and file sinks are mocked, and the assertions parse the written container bytes (row 463). Web and
Tauri are covered in one file by a mutable platform mock.

- **Reproducers and guards (final file):** against HEAD's two source files, 14 fail and the 11 that
  pass are exactly the tests titled `guard:` (row 467). Against the fixed tree, 25 of 25 pass.
- **First 17 tests, at the unfixed tree (row 463):** 9 failed and 8 passed. Every failure was an
  AssertionError: only `a.png` written; `expected Error: read failed to be null`; `expected [ 5 ] to
  not include 5` (the wrapped length).
- **Remediation (row 466):** 8 tests added (symlink written, full and partial; a broken symlink
  reported missing; a partial Tauri failed read reported missing; directory guards; the u32 boundary
  at `2**32`, and a guard at `2**32 - 1`). Against the round-1 version of the fix, 4 of them were red
  and 21 passed (row 467).
- **What the tests do not do:** they run the source with mocked storage. They are not evidence about
  a real Tauri or Node backend.
- **Checks on the final snapshot (Orchestrator, row 466):** `pnpm test` 199 files, 3294 passed, 4
  skipped; `pnpm check` clean; `pnpm run build` passes.

## 5. Gate record

- **Plan gate:** skipped under AGENTS.md section 4's carve-out (a well-contained bug fix with an
  obvious correct shape; `MC-133`). The reviewer judged the carve-out justified (row 465).
- **Gate 2, round 1 (`opus-reviewer`, fresh; row 465): [EDITORIAL].** Behaviour accepted on all four
  backends and upstream-restorable. No key backed up before drops out, except user-made symlinks on
  Tauri. Against HEAD (a load-hook swap of the sources): 9 failed on the intended defect and 8 guards
  passed. 16 mutants: 11 killed, 5 survivors judged not consequential.
  - **Required:** the Tauri comment "Only regular files are readable assets" was false. `readDir`
    reports a symlink to a file as `isFile: false` (tauri-plugin-fs 2.5.2), so symlinks were skipped
    silently. Recommended admitting `isSymlink`.
  - **Optional (taken):** the same try/catch in the partial Tauri loop; pin the u32 boundary at
    exactly `2**32`.
- **Remediation (row 466):** tests first (4 red against the round-1 fix), then `isFile || isSymlink`
  in both Tauri loops, the partial read in a try/catch, and the comment reworded.
- **Gate 2, round 2 (the round-1 reviewer, reused; row 467): [APPROVE].** The remediation diff is
  exactly the four requested changes, and `globalApi.svelte.ts` is byte-identical to round 1.
  New mutants killed: the symlink admission removed in each loop, both filters removed, the partial
  try/catch removed or made not to report, and the guard off by one at `2**32`. Two survivors: a
  data-only length guard (the reviewer found the name check unreachable) and a writer call
  moved inside the partial try (not pinned; see section 6). The reworded comments are true.

## 6. Leads not taken

| Lead | Where found | Disposition |
|---|---|---|
| An unvalidated risuext extension can give a key with a further `/` after `assets/` (`characterCards.ts` passes the card's extension as is). The writer keeps only the basename, so the entry name is truncated. | packet R5; row 465 | Not fixed here. The packet marks it out of scope and noted. `TODO(evidence)`: no ticket or owner is recorded. |
| The missing-assets message says an unreadable file is "missing". | row 465 | Not changed. The file is still reported in the missing list, not dropped silently. `TODO(evidence)`: the ledger does not record a decision beyond "lead not taken". |
| Restore copies its pending buffer on every stream chunk (quadratic in entry size), plus a 10 ms sleep per entry. Large video and audio entries, now included in backups, make it costlier. | packet Q6; row 465 | Left to the backup stage (stage 2, `MC-133`). The packet's cost figures are a formula, not a measurement (chunk size INFERRED). |
| A writer error is not pinned by a test in the partial Tauri loop: a mutant that moves the `writeBackup` call inside the read's try/catch, so the error is swallowed, survives. | row 467 | Optional guard, not written. |
| An oversized entry (4 GiB or more) makes `writeBackup` throw mid-loop. The writer is left open, and the file on disk is presumably partial (INFERRED from the loop; not run). | row 464 | Not handled. Only an entry of 4 GiB or more reaches it. `TODO(evidence)`: no decision recorded on whether to close the writer or delete the partial file. |
| Inlay images are never in a local backup: they live in their own LocalForage instance (`inlay`). | packet Q1; row 461 | Filed as `CHORE-48`. Not fixed; whether upstream intends it is unknown. |
