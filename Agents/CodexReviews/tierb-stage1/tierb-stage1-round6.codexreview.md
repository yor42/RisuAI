(node:54636) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.
(Use `node --trace-deprecation ...` to show where the warning was created)
[codex] Starting Codex task thread.
[codex] Thread ready (01a0bb7d-a087-7320-b72c-d66347bd5d85).
[codex] Turn started (01a0bb7d-a1d2-77d2-9679-4dfdf5176531).
[codex] Assistant message captured: {"verdict":"needs-attention","summary":"I’m inspecting the current server/client diff, surrou...
[codex] Running command: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'git diff -- server/node/server.cjs src...
[codex] Command completed: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'git diff -- server/node/server.cjs src... (exit 0)
[codex] Running command: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$p='"'server/node/server.cjs'; "'$c=Ge...
[codex] Command completed: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '$p='"'server/node/server.cjs'; "'$c=Ge... (exit 0)
[codex] Assistant message captured: {"verdict":"needs-attention","summary":"No-ship. The per-handler rollback assignments are loc...
[codex] Turn completed.
# Codex Adversarial Review

Target: working tree diff
Verdict: needs-attention

No-ship. The per-handler rollback assignments are locally correct and non-throwing, but the shared persistence queue still allows one request to durably serialize another request’s uncommitted revision. Lowercase canonicalization also lacks migration handling for uppercase filenames previously accepted on case-sensitive filesystems.

Findings:
- [high] Queued revision saves can commit another request’s revision before that request succeeds (server/node/server.cjs:68-80)
  `saveRevisions()` serializes the live shared `revisions` object when its queued `run` eventually starts, rather than capturing this caller’s state or owning the mutation transaction. With an earlier save already pending, request A can bump key A and queue its save, then request B can bump key B and queue behind A. When A’s queued run starts, it serializes both bumps. If A succeeds but B’s own save later fails, B rolls its in-memory entry back and reports an uncommitted failure, yet B’s bump is already durable in A’s save. After restart, B’s client is stranded behind a revision that its failed operation supposedly never committed. Per-key locks do not prevent this because the requests touch different keys. The write and remove rollback loops themselves restore the correct captured values and cannot ordinarily throw, but they cannot undo this earlier cross-request persistence.
  Recommendation: Serialize revision mutation and persistence as one global transaction: perform each request’s revision validation/mutation and snapshot creation inside the revision-save queue, or otherwise ensure a queued save can publish only explicitly committed deltas. Do not serialize the mutable live object containing later callers’ provisional changes. Add a fault-injection test with at least three overlapping different-key operations: one save occupying the queue, followed by two queued mutations where the latter save fails.
- [medium] Canonicalization can orphan previously accepted uppercase filenames on case-sensitive filesystems (server/node/server.cjs:1295-1304)
  The old API accepted uppercase hex and used it verbatim as the filename. Read, write, and remove now unconditionally lowercase the path, but `/api/list` merely decodes each directory filename and performs no migration. On Linux, an existing uppercase filename such as `AA` is distinct from `aa`: listing still reports its decoded logical key, but a subsequent client request encoded canonically as lowercase accesses `aa`, cannot read or remove `AA`, and a write can create a second physical file. This is a compatibility/data-access regression for any uppercase paths written through the previously supported API. It is not observable on case-insensitive Windows/macOS filesystems, but the Node server supports Linux deployments.
  Recommendation: Add a startup or explicit migration that detects valid uppercase/mixed-case hex filenames and atomically renames them to lowercase, with collision handling when both variants exist. Migrate corresponding revision-map keys too. Alternatively, temporarily resolve legacy exact-case entries safely while converging them to the canonical name. Add a Linux/case-sensitive-filesystem compatibility test.

Next steps:
- Redesign revision persistence so provisional mutations from later callers cannot enter an earlier caller’s durable snapshot.
- Add concurrency fault-injection coverage for queued saves and rollback after a later save failure.
- Define and test migration/collision behavior for legacy mixed-case on-disk filenames before shipping Tier B Stage 1.
