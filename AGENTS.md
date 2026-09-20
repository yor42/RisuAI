## Project Overview

Risuai is a cross-platform AI chatting application built with:
- **Frontend**: Svelte 5 + TypeScript
- **Desktop**: Tauri 2.5 (Rust backend)
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS 4
- **Package Manager**: pnpm

The application allows users to chat with various AI models (OpenAI, Claude, Gemini, and more) through a single unified interface. It features a rich user interface with support for themes, plugins, custom assets, and advanced memory systems.

## Directory Structure

```
risuai-newest/
├── src/                    # Main application source code
│   ├── ts/                 # TypeScript business logic
│   ├── lib/                # Svelte UI components
│   ├── lang/               # Internationalization (i18n)
│   ├── etc/                # Documentation and extras
│   └── test/               # Test files
├── src-tauri/              # Tauri desktop backend (Rust)
├── server/                 # Self-hosting server implementations
│   ├── node/               # Node.js server (current)
│   └── hono/               # Hono framework server (future)
├── public/                 # Static assets
├── dist/                   # Build output
├── resources/              # Application resources
└── .github/workflows/      # CI/CD pipelines
```

### Source Code Structure (`/src`)

#### `/src/ts` - TypeScript Business Logic

| Directory/File | Purpose |
|----------------|---------|
| `storage/` | Data persistence layer (database, save files, platform adapters) |
| `process/` | Core processing logic (chat, requests, memory, models) |
| `plugins/` | Plugin system (API v3.0, sandboxing, security) |
| `gui/` | GUI utilities (colorscheme, highlight, animation) |
| `drive/` | Cloud sync and backup |
| `translator/` | Translation system |
| `model/` | Model definitions and integrations |
| `sync/` | Multi-user synchronization |
| `cbs.ts` | Callback system |
| `characterCards.ts` | Character card import/export |
| `parser.svelte.ts` | Message parsing |
| `stores.svelte.ts` | Svelte stores for state management |
| `globalApi.svelte.ts` | Global API methods |
| `bootstrap.ts` | Application initialization |

#### `/src/ts/process` - Core Processing

| Directory/File | Purpose |
|----------------|---------|
| `index.svelte.ts` | Main chat processing orchestration |
| `request/` | API request handlers (OpenAI, Anthropic, Google) |
| `memory/` | Memory systems (HypaMemoryV2/V3, SupaMemory, HanuraiMemory) |
| `models/` | AI model integrations (NAI, OpenRouter, Ooba, local models) |
| `templates/` | Prompt templates and formatting |
| `mcp/` | Model Context Protocol support |
| `files/` | File handling (inlays, multisend) |
| `embedding/` | Vector embeddings |
| `lorebook.svelte.ts` | Lorebook/world info management |
| `scriptings.ts` | Scripting system |
| `triggers.ts` | Event triggers |
| `stableDiff.ts` | Stable Diffusion integration |
| `tts.ts` | Text-to-speech |

#### `/src/lib` - Svelte UI Components

| Directory | Purpose |
|-----------|---------|
| `ChatScreens/` | Chat interface components |
| `UI/` | General UI components (GUI, NewGUI, Realm) |
| `Setting/` | Settings panels |
| `SideBars/` | Sidebar components (Scripts, LoreBook) |
| `Others/` | Miscellaneous components |
| `Mobile/` | Mobile-specific UI |
| `Playground/` | Testing/playground features |
| `VisualNovel/` | Visual novel mode |
| `LiteUI/` | Lightweight UI variant |

## Building and Running

### Prerequisites

- Node.js 20.19+ or 22.12+ and pnpm
- Rust and Cargo (for Tauri builds)

### Development

```bash
# Web development server
pnpm dev

# Tauri desktop development
pnpm tauri dev
```

### Production Builds

```bash
# Web build
pnpm build

# Web build for hosting
pnpm buildsite

# Tauri desktop build
pnpm tauribuild
pnpm tauri build

# Hono server build
pnpm hono:build
```

### Type Checking

```bash
pnpm check
```

## Development Conventions

### Coding Style

- The project uses Prettier for code formatting
- Ensure code is formatted before committing

### State Management

The project uses Svelte 5 Runes system:
- `$state`, `$derived`, `$effect` for reactive state
- Svelte stores (writable, readable) in `stores.svelte.ts`

Key stores:
- `DBState` - Database state
- `selectedCharID` - Current character
- `settingsOpen`, `sideBarStore`, `MobileGUI` - UI state
- `loadedStore`, `alertStore` - Application state
- `DynamicGUI` - Responsive layout switching

### Styling & Theming

To ensure dynamic theme support across the app, always use the project's custom theme colors defined in `src/styles.css` when styling components with Tailwind CSS. If you need to check how these colors are dynamically managed or view available presets (like dark, light, cherry, etc.), reference `src/ts/gui/colorscheme.ts`. Only inspect this file when specifically working on theme-related logic.

Available custom theme colors include:
- `textcolor`, `textcolor2`
- `bgcolor`, `darkbg`, `darkbutton`, `selected`
- `borderc`, `darkborderc`
- `draculared`

You can safely apply Tailwind's opacity modifiers directly to these custom theme colors (e.g., `text-textcolor/90`, `bg-textcolor/5`, `border-textcolor/10`).

### File Naming Conventions

- `.svelte.ts` - Svelte 5 files with runes
- `.svelte` - Svelte component files
- Use camelCase for file names

### Testing

- Unit tests use Vitest (`pnpm test` runs `vitest run`); there are ~20+ `*.test.ts` files spread across `src/lib`, `src/ts/parser`, `src/ts/process`, `src/ts/storage`, `src/ts/translator`, and elsewhere — not exhaustive coverage, but a real and growing suite, not just a placeholder.
- Run `pnpm check` for type checking (svelte-check).
- Test coverage is uneven: some areas (e.g. `src/ts/storage/remoteSaveCleanup.test.ts`) only exercise Tauri/Node-specific code paths and say nothing about the pure web build's behavior in that area. Don't assume a file has tests nearby means that exact runtime path is covered — check what the test actually exercises.

## Key Architectural Patterns

### Data Layer

- Database abstraction (`src/ts/storage/autoStorage.ts`) selects a backend at runtime, in priority order: account-sync (HTTP, `accountStorage.ts`) → Node server (HTTP, `nodeStorage.ts`) → OPFS (`opfsStorage.ts`) → LocalForage (fallback).
- **OPFS for the main database is opt-in, off by default, on the web build**: `AutoStorage` only selects it when `localStorage['opfs_flag!'] === "able"`. As of Phase 1 (`Agents/Roadmap.md`), that flag is reachable through an in-app toggle (`src/lib/Setting/Pages/FilesSettings.svelte`, "Local Storage Backend" section) that migrates existing LocalForage data to OPFS and reloads; nothing sets it automatically, so a fresh browser profile still defaults to LocalForage for `database/database.bin`. Cold storage (`src/ts/process/coldstorage.svelte.ts`) has always used OPFS directly, independent of this flag. Don't assume "OPFS" in a file name means it's active for a given user — check the `opfs_flag!` gate (or the settings toggle's current state) first.
- Tauri desktop bypasses this whole abstraction for the primary database write and calls `@tauri-apps/plugin-fs`'s `writeFile` directly (see `src/ts/globalApi.svelte.ts`'s `saveDb()`), including for "remote" character blocks — `AutoStorage`'s remote-block path is only actually exercised by the Node-server backend, not Tauri.
- Save file format: `.bin` files with encryption support, structured as a block/chunk format (`RisuSaveType` in `src/ts/storage/risuSave.ts`) — a root block plus one block per character/module/preset/etc., only-changed-blocks-re-encoded incrementally.
- Character cards: Import/export in various formats (.risum, .risup, .charx)

### Processing Pipeline

1. Chat processing in `process/index.svelte.ts`
2. Request handling with provider abstraction
3. Memory systems for context management
4. Lorebook integration for world info

### Plugin System (API v3.0)

- Iframe-based sandboxing for security
- SafeDocument/SafeElement wrappers for DOM access
- Plugin storage (save-specific and device-specific)
- Custom AI provider support
- Hot reload support for development

See `plugins.md` for comprehensive plugin development guide.

### UI Architecture

- Component-based with Svelte 5
- Responsive design with mobile/desktop variants
- Theme system with custom color schemes
- Multiple UI modes: Classic, WaifuLike, WaifuCut
- Dynamic GUI switching based on viewport
- No traditional router; uses conditional rendering in App.svelte
- In-app drag-and-drop uses custom MIME types to avoid conflicting with file imports; see `src/ts/dragTypes.ts`

## Supported AI Providers

- OpenAI (GPT series)
- Anthropic (Claude)
- Google (Gemini)
- DeepInfra
- OpenRouter
- AI Horde
- Ollama
- Ooba (Text Generation WebUI)
- Custom providers via plugins

## Internationalization

Supported languages:
- English (en)
- Korean (ko)
- Chinese Simplified (cn)
- Chinese Traditional (zh-Hant)
- Vietnamese (vi)
- German (de)
- Spanish (es)

Language files are located in `/src/lang/`.

## Deployment Targets

- **Web**: Vite static site
- **Desktop (Tauri)**: Windows (NSIS), macOS (DMG, APP), Linux (DEB, RPM, AppImage)
- **Docker**: Container (port 6001)
- **Self-hosted**: Node.js or Hono server

## Security

- Plugin sandboxing with iframe isolation
- DOM sanitization with DOMPurify
- Buffer encryption/decryption utilities
- CORS handling with proxy support
- Tauri HTTP plugin for native fetch

## Documentation

| File | Description |
|------|-------------|
| `README.md` | Main project documentation |
| `plugins.md` | Plugin development guide |
| `AGENTS.md` | AI assistant documentation |
| `src/ts/plugins/migrationGuide.md` | Plugin API migration guide |
| `server/hono/README.md` | Hono server documentation |
| `server/node/readme.md` | Node server documentation |

## AI Coding Agent Requirements

Use a senior-orchestrator workflow. Keep discovery, implementation, review, and arbitration in separate contexts whenever the available agent system permits it.

This effort is a targeted stabilization and improvement campaign, **not a rewrite or major overhaul**. Bug fixes, reliability and performance work, maintainability improvements, UI improvements, and new or enhanced features are permitted. The compatibility invariant is that upstream-compatible characters, modules, presets, backup `.bin` files, plugins, and other supported user data and integrations must continue to work on this fork. 

### 1. Multi-Agent Routing Protocol (CRITICAL)
You are the **Opus 5 Senior Orchestrator**. To prevent token bleeding and maximize the Max 5x plan quota, you MUST delegate tasks to specialized subagents in `.claude/agents/` using this routing matrix:

1. **Code & File Search / Survey** -> Delegate immediately to `code-searcher` (powered by **Claude Haiku 4.5**). Never use Opus 5 or Sonnet 5 to read entire folders or run blind greps.
2. **Implementation / Type Bug Fixes** -> Delegate bounded scopes to `sonnet-coder` (powered by **Claude Sonnet 5**). Pass only the exact file paths and line ranges.
3. **Complex Architectural Decisions** -> Handled by you (Opus 5). When the decision meets an escalation trigger in 1.2, escalate to `senior-advisor` rather than deciding alone.
4. **Performance, Profiling, and Memory Leaks** -> Delegate to `perf-analyzer` (powered by **Claude Sonnet 5**). Give it access to execution logs, heap snapshots, and profiling data to isolate the root cause before any code changes.
5. **Writing Tests & Fixing Test Failures** -> Delegate to `test-warrior` (powered by **Claude Sonnet 5**). Use this agent exclusively for creating Vitest suites, mocking external APIs/Tauri file systems, and resolving test regressions without letting test logs bloat the main context.
6. **Adversarial Code & Plan Review** -> Delegate to `adversarial-reviewer` (powered by **Claude Sonnet 5**). This agent operates strictly in a read-only sandbox to falsify implementations, trace async race conditions, and mandate zero-defect code quality before final integration.
7. **Deep Investigation / Verifying How Something Actually Behaves / Sizing a Change** -> Delegate to `opus-investigator` (powered by **Claude Opus 5**). Use when you need to *know* rather than guess: tracing a mechanism end to end, counting a blast radius, or checking whether a premise you are about to act on is true. Do NOT use it for plain lookups — that is `code-searcher`'s job and costs a fraction as much.
8. **High-Rigor Adversarial Review (expensive-to-reverse changes)** -> Delegate to `opus-reviewer` (powered by **Claude Opus 5**). Use instead of `adversarial-reviewer` when the failure mode is silent data loss or the change touches save/persistence, the save format, the reactive database, or asset caching. Unlike the Sonnet tier it also fact-checks the commit message, code comments, and whether the tests would genuinely fail against the pre-change code.
9. **Strategic Escalation (stuck, contradicted, or a foundational fork)** -> Escalate to `senior-advisor` (powered by **Fable 5.1**) under the triggers in 1.2. It gives direction only and never writes code.

#### 1.1 Dynamic Subagent Generation (Autonomy Rule)
- If a task requires highly specialized domain knowledge not covered by existing subagents (e.g., Rust/Tauri backend native bridging, complex data migration scripts, security isolation checks), you (Opus 5) have the authority to dynamically create a new subagent.
- **Process:**
  1. Write a new markdown profile under `.claude/agents/<name>.md`.
  2. Define a strict YAML frontmatter choosing the optimal 2026 model (e.g., `claude-sonnet-5` for heavy logic, `claude-haiku-4.5` for lightweight tasks) and minimal required tools.
  3. Clearly separate its context and rules to keep it focused.
  4. Inform the user about the new agent creation before delegating the task.

#### 1.2 Escalation Ladder (cost-ordered)
Route to the cheapest tier that can answer the question. Escalating early wastes quota; escalating late wastes far more, because wrong direction compounds into work that has to be thrown away.

| Need | Agent | Model |
|---|---|---|
| Where is X | `code-searcher` | Haiku 4.5 |
| Implement a bounded change | `sonnet-coder` | Sonnet 5 |
| Routine plan or code review | `adversarial-reviewer` | Sonnet 5 |
| What actually happens / how big is this really | `opus-investigator` | Opus 5 |
| Review where a defect is expensive to reverse | `opus-reviewer` | Opus 5 |
| Direction when stuck or at a foundational fork | `senior-advisor` | Fable 5.1 |

**Escalate to `senior-advisor` when at least one holds:**
- Two materially different solution attempts have failed.
- Root cause remains unclear after targeted investigation.
- Evidence contradicts your current mental model.
- The fix requires changing a foundational architectural assumption.
- Multiple plausible approaches exist and choosing wrong creates substantial downstream work.
- A bug crosses several subsystem boundaries.
- Your confidence is below the required threshold after gathering available evidence.
- The team appears stuck in a loop.

Plus one standing use: **attacking a plan that is expensive to reverse, before implementing it.**

**Rules for escalating.** Hand `senior-advisor` a dossier — what was attempted, what was observed, what the evidence contradicts — so it verifies and extends rather than rediscovering. It never writes code; it returns ROOT CAUSE / MISSED INSIGHT / RECOMMENDED STRATEGY / NEXT INVESTIGATION / DO NOT / UNCERTAINTY. Do not invoke it as a second opinion alongside another reviewer, and do not invoke it for work that is merely hard rather than directionally unclear.

**Codex** remains available as an independent implementation-focused review (section 5) but is quota-constrained and is not the default escalation path. Prefer `senior-advisor` for direction and `opus-reviewer` for rigour; reserve Codex for cases where a genuinely independent toolchain is the point.

### 2. TypeScript & Svelte 5 Technical Guardrails
When writing or refactoring code for this repository, all agents must strictly adhere to the following language rules to prevent compile-time/runtime regressions:
- **Strict Anti-`any` Policy:** Do not use `any` or `unknown` as a lazy fix for type errors. Always declare precise `interface` or `type` aliases matching the Risuai domain architecture.
- **Svelte 5 Runes Invariant:** Ensure state management uses Svelte 5 Runes (`$state`, `$derived`, `$effect`) correctly. Do not mix legacy Svelte v4 store syntax (`$store`) inside new Svelte 5 components unless explicitly bridging older modules.
- **Fail-Fast Typing:** Before declaring a task complete, the agent must guide the user to run `pnpm check` to ensure Svelte components and TypeScript logic are free of compiler diagnostics.

### 3. Agentic Workflow Loop Control (Preventing Token Bleeding)
- **Bounded Tool Execution:** Agents must not execute more than 3 consecutive automated tool loops (e.g., recursive searching or iterative failing test fixes) without printing a summary and asking for human validation or direction.
- **Context Flushes:** Every independent bug fix or refactoring unit must be treated as an isolated transaction. Once a `git diff` is verified, the agent must instruct the user: *"Task complete. Please run `/clear` to reset the token context before the next task."*

### 4. Two-step review for non-trivial code changes
For any **non-trivial** code change — new features, architectural changes, anything touching areas flagged in `Agents/Reports/` (save/persistence, the reactive database, asset caching, Tauri platform config), or anything the orchestrator judges risky or wide-reaching — use two independent review gates, once before implementing and once after:

1. **Plan review.** Before writing code, record the scope, proposed approach, expected files, invariants, risks, tests, design tradeoffs, and how compatibility with upstream artifacts and integrations will be preserved. Give that plan to a fresh Sonnet reviewer in a clean context and frame the task as an attempt to falsify the approach and its assumptions. The reviewer must look for accidental feature removal, plugin/module/provider incompatibility, inability to read or use existing characters, presets, modules, or backup files, unsafe format migration, and workflow regressions in addition to ordinary correctness risks. If the change meets a Codex escalation condition, run Codex adversarial review as an additional independent challenge before implementation. Resolve or explicitly disposition confirmed findings.
2. **Implement.** Delegate the bounded implementation to a Sonnet worker. Keep the accepted plan and its constraints available, but do not contaminate the later reviewer with the worker's private reasoning transcript.
3. **Code review.** Give the requirements, accepted plan, actual diff, relevant source, and test evidence to a different fresh Sonnet reviewer. Require it to look for defects, regressions, uncovered paths, incorrect assumptions, missing tests, and drift from the reviewed plan. If escalation is required, also run Codex `review` for implementation-focused inspection or `adversarial-review` when the design and assumptions must be challenged. Fold in confirmed corrections, rerun relevant checks, and review any material fix-up diff before considering the change done.
4. **Arbitrate.** Opus evaluates findings against source evidence. It must not resolve disagreement by seniority or majority vote. If material disagreement remains after targeted re-checks, escalate to `senior-advisor` with a dossier of both positions and the evidence each rests on; if that is unavailable, report the blocker and do not mark the disputed work final. Note that reviewers have been wrong in this campaign: before propagating a reviewer's factual claim into a plan, a commit message, or another agent's brief, verify it against source yourself.

**Choosing a review tier.** Use `adversarial-reviewer` (Sonnet 5) by default. Use `opus-reviewer` (Opus 5) when the failure mode is silent data loss, or when the change touches save/persistence, the save format, the reactive database, or asset caching — it additionally fact-checks the commit message, the code comments, and whether the tests would actually fail against the pre-change code, all of which are part of the change and all of which have carried real defects here.

**Tests as evidence.** When a fix is for a bug that can be reproduced, write the test against the unfixed code and confirm it FAILS before applying the fix. A test written afterwards cannot distinguish "this works" from "this is shaped the way I expected". Keep any test that already passed pre-fix if it adds coverage, but comment it as such so it is never mistaken for proof. Commit tests together with the fix so no commit leaves the suite red, and record the pre-fix failure in the commit message instead.

**Carve-out:** skip the plan-review gate for changes that are small and low-risk on their face — a one-line fix, a config tweak, a typo/string change, or a well-contained bug fix with an obvious correct shape. The fresh post-implementation review remains mandatory for every AI-authored code change. When risk or scope is uncertain, use the plan-review gate. A reviewer may be reused for a later pass only if its context remains independent of implementation reasoning; never let an implementer self-approve.

### 5. Invoking Codex without slash commands

Slash commands are convenience wrappers. An agent with Bash and Node access may invoke the installed plugin runtime directly; it must not stop merely because it cannot issue a slash command. Preserve the requested arguments and focus text. `${CLAUDE_PLUGIN_ROOT}` must refer to the installed Codex plugin root.

```bash
# Native review of the working tree or branch
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" review "--wait --scope working-tree"
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" review "--wait --base <ref> --scope branch"

# Adversarial challenge to the approach, assumptions, and implementation
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" adversarial-review "--wait --scope working-tree <focus text>"
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" adversarial-review "--wait --base <ref> --scope branch <focus text>"

# Open-ended Codex investigation, rescue, or explicitly requested fix
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task --fresh "<bounded request with artifacts and questions>"
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task --resume "<follow-up request>"
```

- Use `review` for review-only defect finding against local Git state. It does not accept custom focus text.
- Use `adversarial-review` when Codex should challenge design choices, tradeoffs, assumptions, and real-world failure modes; it accepts focus text after the flags.
- Use `task --fresh` for a new targeted investigation or rescue task and `task --resume` only for a genuine follow-up to the current Codex thread. Before choosing automatically, an interactive agent may inspect `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task-resume-candidate --json`; use `--fresh` when no relevant resumable thread exists.
- Prefer `--wait` only for a clearly small review (roughly one or two files). Use `--background` for larger or unclear scopes when the hosting agent can actually launch a background process. The companion parses the flag, but background detachment is provided by the host shell/tool, not by the flag alone.
- Treat untracked files as reviewable work. For working-tree scope, inspect `git status --short --untracked-files=all` as well as staged and unstaged diffs before concluding there is nothing to review.
- `review` and `adversarial-review` are review-only. Do not ask that invocation to patch files. Return and preserve Codex's stdout as the review artifact, then let the orchestrator disposition findings and delegate any fixes.
- Do not invent, paraphrase, or claim a Codex result if the command cannot run. If the helper reports that Codex is missing or unauthenticated, report that exact blocker and ask the user to run `/codex:setup`. Continue safe work that does not depend on the escalation, but do not mark the escalated work final.

## Contribution Guidelines

1. Follow the existing coding style and conventions
2. Run `pnpm check` before submitting a pull request
3. Ensure your code is well-tested
4. Format code with Prettier before committing
5. Any AI-agent-authored code change or investigative report must go through the independent-review process above before being considered complete — non-trivial changes need both the plan review and the post-implementation code review, with Codex added when the escalation policy requires it
