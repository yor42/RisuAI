(node:27436) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated.
(Use `node --trace-deprecation ...` to show where the warning was created)
[codex] Starting Codex task thread.
[codex] Thread ready (01a0bb55-1832-7c81-a142-fd99d9cd41e8).
[codex] Turn started (01a0bb55-19cb-7d03-bd01-a3d4af08d27e).
[codex] Assistant message captured: {"verdict":"approve","summary":"I’m inspecting the actual diff and surrounding decoder/error/...
[codex] Running command: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'git diff -- src/ts/storage/risuSave.ts...
[codex] Command completed: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'git diff -- src/ts/storage/risuSave.ts... (exit 0)
[codex] Running command: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content src/ts/storage/risuSave.ts...
[codex] Command completed: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content src/ts/storage/risuSave.ts... (exit 0)
[codex] Running command: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content src/ts/storage/risuSave.ts...
[codex] Command completed: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'Get-Content src/ts/storage/risuSave.ts... (exit 0)
[codex] Assistant message captured: {"verdict":"needs-attention","summary":"Do not ship yet. Payload CRCs are computed consistent...
[codex] Turn completed.
# Codex Adversarial Review

Target: working tree diff
Verdict: needs-attention

Do not ship yet. Payload CRCs are computed consistently and legacy v1 decoding remains compatible, but the integrity mechanism leaves its own version/framing metadata unprotected, allowing single-bit corruption to produce a silently partial database.

Findings:
- [high] Unprotected version and block metadata can bypass checksums and suppress root-fatal handling (src/ts/storage/risuSave.ts:410-422)
  The decoder classifies any `RISUSAVE` prefix as this format and enables checksums only when byte 8 equals exactly 1. A one-bit change from version 1 to 0 therefore makes a v2 file parse as legacy: each checksum trailer is treated as the next block header, commonly leaving only the first/root block and silently losing characters, presets, modules, and later blocks. Separately, CRC covers only `databuf`; corruption of a root block's type byte from ROOT to another type is accepted because the payload CRC still matches, bypassing both `CriticalBlockError` and the later root-specific JSON failure check. Corrupted name, compression, or length fields can similarly redirect parsing before verification. These are realistic bit-flip scenarios that can return a plausible but incomplete database instead of triggering backup recovery.
  Recommendation: Fail closed on every unsupported version byte rather than treating it as legacy; accept only 0 and 1. Protect framing metadata as well as payload—prefer a checksum over type, compression, name length/name, data length, and payload—or add an independently protected file/header version and strict structural validation. Require exactly one successfully processed ROOT block before returning. Add tests for a flipped version byte and corrupted ROOT type/name/length/compression fields through `decodeRisuSave()`.

Next steps:
- Expand the integrity envelope and enforce strict version/root validation.
- Add adversarial corruption tests for header and block framing, including compressed blocks.
- Re-run the complete Vitest suite and `pnpm check` after correction.
