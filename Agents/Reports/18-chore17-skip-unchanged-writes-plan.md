# CHORE-17 plan: skip rewriting blocks that did not change

**STATUS:** implemented (`dfabaa15`)

**Status:** rev 2, 2026-09-22.
- Gate 1 on rev 1 (`opus-reviewer`, fresh): APPROVE-WITH-FINDINGS.
- Rev 2 folds in every finding (§9). The Orchestrator re-verified M2 (`chatPage` is a serialized
  character field) and the account-storage warn return in source.
- Red tests, implementation, Gate 2 (three rounds), measurement and live check done; committed as `dfabaa15`.

**Scope (maintainer's decision, 2026-09-22):** only "layer 2" from the CHORE-17 entry in
`Agents/Roadmap.md`: skip storage writes whose bytes are already stored. The plugin-setter
reconcile ("layer 1") is on hold; the Roadmap records why. Unchanged: the save format, the
decoder, the plugin API, and what is written to `database.bin`.

## 1. Facts this plan rests on

The sources were an investigator packet (premise check and skip-safety check), a perf-analyzer
run in real Chromium, and Gate 1, all on 2026-09-22. The Orchestrator spot-checked the
load-bearing claims in source (marked **[verified]**).

1. **The cost.**
   - One all-N `RisuSaveEncoder.set()` at 1000 characters and ~150k messages takes 1155 ms. That
     is headless Chrome 154 with real IndexedDB, on an i9-13900K (best case).
   - 36% of it (418 ms) is the per-block `risuSaveCacheForage.setItem`.
   - Stringify (30%) and encoding (32%) cannot be skipped by this plan, because they produce the
     bytes being compared.
   - Today's save yields at each block's `setItem`: 1002 slices, the longest 44 ms.
   - Harness: `Agents/Tools/save-gen/chore17-run.mjs`.
2. **Where the write happens [verified].**
   - `encodeRawBlock` (`src/ts/storage/risuSave.ts`) assembles the block bytes, then awaits
     `risuSaveCacheForage.setItem('risuSaveBlock_<name>', {type, data, name})`, then returns the
     bytes. The caller stores them in `this.blocks[<name>]`.
   - If `setItem` throws, nothing is returned and `this.blocks` keeps the previous bytes.
   - localforage resolves `setItem` in `transaction.oncomplete`, so a resolved write is a
     committed one.
   - Every write to `this.blocks[k]` in `init()` and `set()` comes from the same instance's
     `encodeBlock` → `encodeRawBlock`. No code copies, restores or moves blocks between encoders.
     A remote pointer is cached under its chaId, which is the same key as its `this.blocks`
     entry.
   - **Therefore, whenever `this.blocks[name]` holds bytes, exactly those bytes were
     successfully written to that cache key.**
3. **What reads the cache [verified].**
   - Only `RisuSaveDecoder.decode()` reads it, in the ROOT case, for a `__directory` entry whose
     block did not load from the buffer. That happens after a data-checksum failure or a parse
     failure, or when the file ends exactly at a block boundary. (Root is first, so its
     `__directory` survives.)
   - A block truncated mid-way throws `CriticalBlockError` instead, which aborts the whole decode
     with no fallback to the cache.
   - No other code reads, deletes or clears the `risuSaveCache` store. The `localforage.clear()`
     in `autoStorage.ts` clears a different store.
   - The cache is a corruption fallback, never preferred over `database.bin`.
4. **The comparison needs no new memory.** `this.blocks` already holds every block's last bytes
   for the session (about 109 MB at the fixture size).
5. **Who benefits.** Boot and `reinitEncoder()` (the full reload used by backup loads,
   `removeChar` and cold storage) each construct a new `RisuSaveEncoder` with empty `this.blocks`.
   - **Stage A (the local cache skip) therefore never fires there.** It helps only `set()` on a
     live encoder:
     - the plugin mark-all save;
     - the selected character. `prepareSaveIteration` trims the tracker to
       `[tracker.character[0]]`, so the selected character is re-encoded on every save. That
       includes saves triggered by a preset edit, a module edit, an edit to another character,
       or a change to a root-level setting. When the selected character itself did not change,
       Stage A skips its write.
   - A `chatPage` switch is **not** skippable. `chatPage` is a serialized character field, so
     switching chats changes the bytes (Gate 1, M2).
   - The Roadmap's advisor text claimed layer 2 helps boot, reloads and backup loads. That is
     corrected for Stage A. **Stage B is different** (§3): its set is module-level, so it does
     fire after a reload.
6. **Nothing time-varying in a block.**
   - The header holds the type, the compression flag, the name and the length, plus two CRC32s.
     Identical input gives identical bytes when compression is off.
   - Compression is on only for account storage (`compression: forageStorage.isAccount` in
     `globalApi.svelte.ts`).
   - Whether gzip output is deterministic affects only the hit rate there, not safety.
7. **Remote blocks [verified].** With remote saving on (Tauri or the Node server; opt-in), a
   character goes through `encodeRemoteBlock`:
   - It encodes the JSON, hashes it with SHA-256, and writes `remotes/<name>.<hash>.bin`, which
     is content-addressed.
   - It then encodes a small pointer block under the same name through `encodeRawBlock`.
   - `set()` never passes `skipRemoteSaving`, so an unchanged character's remote file is
     rewritten on every save.
   - In **this build**, no code path deletes hash-named remote files: Stage 3a shipped without
     garbage collection, and both branches of `cleanChunks` return early for any name that is
     not `.local.bin`. The server's `/api/remove` is only called from the client.
   - An upstream or older fork client sharing the same Node server can delete hash-named files
     after 7 days, through the `.slice(0,-10)` `cleanChunks` bug recorded in `bootstrap.ts`.
     That problem exists regardless of this plan (§7).
8. **A latent bug next to the remote skip [verified].**
   - In `encodeRemoteBlock`, `checkedRemoteExistence.add(fileName)` runs inside the
     existence-check block before the write is attempted. If the write throws, the file is
     recorded although it was never written.
   - It is unreachable today:
     - only the boot `init()` passes `skipRemoteSaving: true`, once per page load;
     - `reinitEncoder` passes `false`;
     - a failing boot `init` stops `saveDb`.
   - Stage B would make it reachable. It is fixed in §3.
9. **A resolved remote write is not always a persisted one [verified].** `AccountStorage.setItem`
   returns without writing on a `403` with `x-risu-status: warn`. Remote saving can reach it on
   the Node server when account storage is in use.

## 2. Stage A: the local cache skip

**The change.**
- In `encodeRawBlock`, after the final bytes are assembled and before `setItem`, compare them to
  `this.blocks[arg.name]`.
- Compare length first, then the whole buffer in `Uint32` words plus the tail bytes. The buffers
  are fresh `ArrayBuffer`s, so offset 0 is aligned.
- If they are equal, skip the `setItem` and still return the bytes. No signature changes.

**Why it is safe.**
- By fact 2, equal bytes in `this.blocks[name]` mean these exact bytes were already committed to
  the cache key.
- Equal bytes also mean equal cached `data`. The block bytes encode `arg.data`, either raw via
  `TextEncoder` or as gzip, which decompresses to a single string.
- `TextEncoder` is injective only on well-formed strings. `arg.data` is always `JSON.stringify`
  output, which escapes lone surrogates, so the argument holds.
- The block type byte is part of the compared bytes, so a name shared by two block kinds cannot
  match.

**Keep today's yields (Gate 1, M1).**
- `setItem` resolving is the save loop's only macrotask boundary on the local path without
  compression.
- Without it, a plugin mark-all `set()` with 999 unchanged characters would become one long task:
  about 720 ms on the i9, and likely seconds on a Pi or a mid-range phone.
- So when a write is skipped, the encoder yields to the event loop if more than a small budget
  (about 8 ms) has passed since the last yield or `setItem`. It uses `scheduler.yield()` where
  available, else a `MessageChannel` message, not `setTimeout(0)`, which cost about 6 ms per
  yield in the measurement.
- Any resolved `setItem` resets the budget.
- The save is then no longer than today's, and no slice is longer than today's.

**Accepted trade-off: multiple tabs.**
- Tabs share one IndexedDB origin. With the skip, the cache can hold another tab's version of a
  character that this tab has not re-encoded differently since, while this tab's `database.bin`
  holds its own.
- This already happens today for every character that is not marked, because `set()` rewrites
  only the keys of marked characters.
- It matters only if this tab's `database.bin` has a corrupt block for that character during a
  two-tab conflict.
- Every boot's `init()` rewrites all cache keys, so any divergence heals on reload.
- Accepted (Gate 1 concurs).

The unused `arg.cache` field is left alone.

## 3. Stage B: the remote file skip, plus the latent-bug fix

**The change: one set, not two (Gate 1, minor 2).** Repurpose the module-level
`checkedRemoteExistence` as "remote file names this page load has **written successfully or
confirmed to exist**":
- Add a name only after an existence check returns true, or after `writeFile` /
  `forageStorage.setItem` resolves.
- A throwing write leaves the name out, so the next save retries it. This fixes fact 8.
- `encodeRemoteBlock` skips the write when the name is in the set, whether or not the caller
  passed `skipRemoteSaving`.
- The existing boot behaviour stays as it is: `skipRemoteSaving` still triggers the existence
  check for names not in the set.

**Account storage (fact 9).** When `forageStorage.isAccount`, record nothing, and skip no write
beyond the boot existence check that already exists. A write that returns without persisting
cannot be told apart from a real write there.

**Why it is safe.**
- The name contains the SHA-256 of the content, so a hit means the same bytes are stored.
- In this build nothing deletes such files (fact 7), so a hit stays true for the page load.

**It fires after reloads too (Gate 1, M3).**
- The set is module-level, so it survives `reinitEncoder()`. After a backup load, a `removeChar`
  or a cold-storage reload, remote files already written this page load are not rewritten.
- This overrides the intent of upstream commit `f484ed72`, which made full reloads pass
  `skipRemoteSavingOnCharacters: false`. That is safe under content addressing, and it is
  disclosed in the commit message.

**What this does not skip.** Stringify and SHA-256 still run for every re-encoded character, and
the pointer block then goes through Stage A's skip.

Remote saving is opt-in and was off in the Chromium fixture, so no cost figure is claimed for
this stage.

Stages A and B may land in one commit, since each is small and they are independent. Gate 2
decides.

## 4. Tests (real `RisuSaveEncoder` and decoder)

**Where:** in `src/ts/storage/tests/risuSave.test.ts` and `risuSaveRemoteBlocks.test.ts`.

**Mock changes needed first:**
- In `risuSave.test.ts`, `createInstance` returns new `vi.fn`s from a plain arrow function. It
  must hand out a shared, countable `setItem`.
- Its `store` Map must be cleared between tests, or each test must use unique chaIds.
- In `risuSaveRemoteBlocks.test.ts`, the module-level set persists across tests while
  `remoteStore` is cleared. Use `vi.resetModules()` with a dynamic import per test, or unique
  content per test.

Apart from those mock changes, no existing test should change.

**Red first (fail on today's code, pass after the change):**
- **A1:** calling `set()` twice with the same unchanged, marked character does not call the
  cache `setItem` for that key the second time.
- **A8:** the same as A1 on the remote-pointer path. With remote saving on, an unchanged
  character's pointer block is not rewritten in the cache.
- **A9:** a skip-heavy `set()` yields once the budget has passed. Use a controllable clock and a
  spied yield function.
- **B1:** with remote saving on, calling `set()` twice for an unchanged character does not
  rewrite `remotes/<name>.<hash>.bin`.
- **B3 (fact 8):** in one module instance, run `init()` with `skipRemoteSaving` set, a missing
  file and a throwing write, then run it again. The second attempt must write the file.

**Guards (pass before and after; they pin behaviour the change must keep):**
- **A2:** a changed character is written, and its cache entry holds the new data.
- **A3:** change the character after `init`, then run a `set()` whose cache `setItem` throws. The
  next `set()` must write, and the entry must end up with the new data. (Without the change in
  between, a skip on the retry would be correct.)
- **A4:** a round trip through encode and decode still yields identical data after skipped
  writes.
- **A5, recovery:** skip a write, corrupt that character's data checksum in the encoded buffer,
  then decode. The character must be recovered from the cache with the right content. The cache
  must be isolated from other tests.
- **A6:** after a fresh encoder's `init()`, every block is written.
- **B2:** a remote write that throws is retried by the next save, and its name is not recorded.
- **B4:** a changed character writes a new hash file, and decode reads the new content.
- **B5:** with `forageStorage.isAccount`, nothing is recorded, and neither of two unchanged
  `set()` calls skips its remote write.

**Informational, in the Chromium harness (not a gate):** whether browser gzip gives identical
bytes for identical input. A Node test would only exercise zlib.

## 5. Measurement and live check

- **Re-run `chore17-run.mjs` with the change applied:** an all-N `set()` in which 999 characters
  are unchanged. Report the total, the **longest task**, the number of slices over 16 ms, and the
  cost of the byte comparison.
  - The expected saving is up to the IndexedDB share (about 36%), minus the cost of the
    comparison and the yields.
  - Report measured figures only.
- **Live check** (the maintainer starts the dev server): count `risuSaveBlock_*` writes in the
  app's own IndexedDB for these saves on the 31-character fixture:
  - a plugin-style `setDatabase` save: only changed characters are written;
  - a preset or module edit with a character selected: the selected character's key is not
    rewritten;
  - a `chatPage` switch: the selected character's key **is** rewritten, as expected.

  Then reload and confirm every character loads.

## 6. Compatibility

- Nothing on disk changes shape.
- `database.bin` is still written in full on every save.
- An upstream build reading this fork's save sees identical files. The cache holds the same
  values it would have held; only redundant rewrites are dropped.
- Remote files: the same content-addressed names are written. Rewrites are skipped only for names
  this page load already wrote or confirmed.

## 7. Out of scope

- Layer 1: on hold.
- Per-chat save blocks: Roadmap Phase 2 item 9, a save-format change.
- Skipping stringify or encode for unchanged characters, which would need a change signal. The
  advisor's DO NOT list applies.
- Removing `arg.cache`.
- Shrinking the encoder's 109 MB of retained blocks.
- Checking a remote file's content against its hash on decode (a torn Tauri write is never
  repaired). This predates the plan, and Stage B does not make it worse within a page load.
- Upstream or older clients' `cleanChunks` deleting hash-named files on a shared Node server
  (fact 7).

## 8. Staging and gates

1. Gate 1 (done: APPROVE-WITH-FINDINGS; rev 2).
2. Red tests.
3. Implementation.
4. Gate 2 (`opus-reviewer`, including a fact-check of the commit message).
5. Measurement.
6. Live check.
7. Commit, when the maintainer asks.

## 9. Gate record

### Gate 1 — opus-reviewer (fresh), 2026-09-22 — [APPROVE-WITH-FINDINGS] (rev 1)

**Held.**
- The §2 safety argument.
- Fact 8, and that its fix is correct.
- Fact 7 for this build.
- Stage A's part of fact 5.
- Accepting the multi-tab trade-off.

**MAJOR.**
- **M1:** skipping `setItem` removes the save loop's only macrotask yields, turning a mark-all
  save into one ~720 ms task on the i9. Rev 2 adds budgeted yields (§2) and reports the longest
  task (§5).
- **M2:** a `chatPage` switch changes the serialized character, so it cannot be skipped. The real
  beneficiary is the selected character re-encoded on every save through the tracker trim.
  Fixed in fact 5 and §5; re-verified by the Orchestrator.
- **M3:** Stage B's module-level set fires after reloads, contradicting fact 5 and overriding
  upstream `f484ed72`'s intent. Disclosed in §3 and fact 5.

**MINOR.**
1. A resolved account write may not persist. Fact 9 added; §3 skips nothing on account storage.
2. One set, not two. §3 repurposes `checkedRemoteExistence`.
3. "Truncated" overstated. Fact 3 corrected.
4. The "today" wording in the multi-tab paragraph. Fixed.
5. Fact 7 applies to this build only. Scoped, and the upstream deletion risk added to §7.
6. The comparison has a cost. §2 now compares in words, and §5 measures it.
7. Tests:
   - red tests and guards are now labelled;
   - A3 now changes the character first;
   - A5 now isolates the cache;
   - the mock changes are named;
   - the module-level set is isolated per test;
   - gzip determinism moved to the harness;
   - A8 added for the remote-pointer path.

**Suspicion only, recorded in §7:** remote file content is never checked against its hash on
decode.

### Gate 2 — implementation, three rounds, opus-reviewer (fresh each round), 2026-09-22

Every round found the code correct. Each reviewer independently confirmed three things:
- the five red-first tests (A1, A8, A9, B1, B3) fail on the pre-change source for the right
  reason;
- `this.blocks[k]` only ever holds bytes this encoder committed to that cache key;
- yielding inside `set()` opens no new concurrency window, because `set()` is called only from
  `saveDb`'s serial loop.

`NodeStorage.setItem` throws on every failure, so it has no resolve-without-persist path.

- **Round 1: REJECT, on text only.**
  - Stale "today"/"yet"/future-tense test comments and titles, including B3's title, which
    described the fixed bug as current.
  - A false description of upstream `f484ed72`.
  - "Nothing is skipped on account storage" was false: the boot existence check still skips.
  - "SHA-256" where the file name uses a 64-bit SHA-256 prefix.
  - A9's title overstated what it tested. A9 was also strengthened to prove the yield is awaited
    in order; it failed with the `await` removed.
  - Commit-message corrections: the uncompressed local path; the yield budget's reset points;
    the dropped boot log line; older clients deleting remote files on a shared Node server.
- **Round 2: REJECT.**
  - One surviving false account claim in the tests.
  - A test gap: a length-only `rawBlockBytesEqual` passed every test. Equal-length guards A2b
    and B4b were added; test-warrior showed that both fail against that mutant.
  - Wording that narrated the change was cleaned up.
- **Round 3: APPROVE-WITH-FINDINGS.** 14 mutants were run in the reviewer's scratchpad.
  - MAJOR: deleting the word loop in the comparator passed, because A2b's and B4b's lengths
    are not multiples of 4 and the tail loop compared differing CRC bytes. Guards at a length
    divisible by 4 were added.
  - The account branch must never read the set, because the backend can switch to account
    storage mid-page. A test was added, and the comment now states this reason.
  - Tests were added for the `noteYielded` wiring, a boot-confirmed file being recorded, and
    the `yieldToEventLoop` fallbacks.
  - The last narration in comments was removed.
  - The commit message's "Tests:" paragraph was updated.

## 10. Results (2026-09-22)

**Measurement.** Headless Chrome 154 with real IndexedDB, on an i9-13900K. That is a best case,
so there is no Pi or phone claim. The fixture is 1000 characters and about 150k messages. Ledger
row 86.

- **Every character marked but unchanged:**
  - The all-N `set()` goes from 1155 ms to about 710-746 ms.
  - The IndexedDB writes go from 418 ms to 0.
  - The byte compare costs 13.5 ms in total.
- **One character changed:** about 750 ms, and exactly one block write.
- **Longest slice:** 43.9 → 45.0 ms on the same fixture, with 10 slices over 16 ms either way.
  On a fixture with a larger block it is 72 ms, which tracks that block's own stringify and
  encode time. The budget adds at most about 8 ms per block.
- **The first re-measurement reported 127 ms. That was a method artifact:** it inferred yields
  from how long each one took to resume. The Orchestrator rejected it as inconsistent with the
  code, and the second run counted yields directly instead.
- The headless `longtask` observer did not report a deliberate 100 ms loop, so no longtask
  figure is used.
- Browser gzip is deterministic, so account storage (which compresses) also gets skip hits.

**Live check.** Dev server started by the maintainer; 31-character fixture; ledger row 87. Writes
were counted with a wrapper on `IDBObjectStore.put`, filtered to `risuSaveBlock_*`.

| Action | Block writes |
|---|---|
| V2-API `setDatabase`, fresh `characters` array, one description changed | 1 (that character) |
| With a character selected, a preset rename | `risuSaveBlock_preset` only, not the selected character |
| `chatPage` switch | the selected character's block is rewritten, as expected |

All edits were reverted through the app, and the reverts saved. After a reload, all 31
characters loaded with their chats, and no test marker remained.

**Final tests.** 732 passed, 4 skipped; `pnpm check` 0 errors, 0 warnings.
