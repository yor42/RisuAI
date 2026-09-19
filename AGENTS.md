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
- **OPFS is currently dead code for the main database on the web build**: `AutoStorage` only selects it when `localStorage['opfs_flag!'] === "able"`, and nothing in the codebase ever sets that flag. In practice, plain web/browser profiles fall through to LocalForage for `database/database.bin`. Cold storage (`src/ts/process/coldstorage.svelte.ts`) *does* use OPFS directly and does work — it's specifically the main-database path where OPFS is unreachable. Don't assume "OPFS" in a file name means it's live in production; check the `opfs_flag!` gate first.
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

Any AI coding agent (Claude Code subagent, Codex, or similar) that produces or modifies application code, or writes an investigative/analysis report intended to inform code changes, **must pass that work through an independent adversarial review before it is treated as final.**

- Use the Codex CLI's adversarial-review command (`/codex:adversarial-review` when available as a slash command, or the equivalent `codex-companion.mjs adversarial-review` invocation) to get a review from a model that did not produce the original work and has no memory of how it was derived.
- This applies to code diffs (the command's default target) and to investigative reports/findings (scope the review with explicit focus text naming the exact file and claims to verify, and instruct it to ignore unrelated files in the working tree).
- Do not treat a report or diff as authoritative, or act on its recommendations, until the adversarial-review pass has run and any confirmed corrections have been folded back in. Mark corrected passages inline (e.g. `[corrected]`) rather than silently rewriting, so the correction trail stays visible.
- If Codex is not installed/authenticated in the current session, say so explicitly and ask before proceeding without this step — don't silently skip it.
- See `Agents/Reports/`, `Agents/CodexReviews/`, `Agents/Summary.md`, and `Agents/Roadmap.md` for a worked example of this workflow (four investigation reports, each independently cross-validated, corrections applied in place).

## Contribution Guidelines

1. Follow the existing coding style and conventions
2. Run `pnpm check` before submitting a pull request
3. Ensure your code is well-tested
4. Format code with Prettier before committing
5. Any AI-agent-authored code change or investigative report must go through the adversarial-review process above before being considered complete
