# Risuai (fork)

<picture>
  <img alt="Risuai" src="public/logo_typo_small.avif" width="400"/>
</picture>

[![Svelte](https://img.shields.io/badge/svelte-5-red?logo=svelte)](https://svelte.dev/) [![Typescript](https://img.shields.io/badge/typescript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/) [![Tauri](https://img.shields.io/badge/tauri-2-%2324C8D8?logo=tauri)](https://tauri.app/) [![Vite](https://img.shields.io/badge/vite-8-%23646CFF?logo=vite)](https://vite.dev/) [![Tailwind CSS](https://img.shields.io/badge/tailwindcss-4-%2306B6D4?logo=tailwindcss)](https://tailwindcss.com/)

This is a fork of [RisuAI](https://github.com/kwaroran/RisuAI), a cross platform AI chatting application (desktop, web and self-hosted). The fork is for stabilization and improvement: fixing data-loss and reliability problems, and making targeted improvements. Characters, modules, presets, `.bin` backups and plugins made for upstream RisuAI must keep working here.

**Status: there are no releases yet. This fork is experimental and heavily work in progress.** There is nothing to download. You can build it from source or with Docker, as described below. Keep a `.bin` backup of anything you care about.

## Features

- **Many AI providers**: OpenAI, Anthropic (Claude), Google (Gemini) and Vertex AI, Mistral, Cohere, NovelAI, NovelList, DeepSeek, DeepInfra, NanoGPT, AWS (Bedrock), AI Horde, Ollama, WebLLM (in-browser inference), OpenRouter and Ooba (Text Generation WebUI). Plugins can add more.
- **Emotion Images**: Show the character image that matches the current expression.
- **Additional Assets**: Embed images, audio and video in a character and show them in the chat or as the background.
- **Group Chats**: Multiple characters in one chat.
- **Plugins**: Add features and providers, and share them.
- **Scripting**: Regex scripts, trigger scripts, Lua scripting and modules.
- **Translators**: Translate input and output automatically.
- **Lorebook**: Also known as world info or memory book. It gives a character more to remember.
- **UI modes**: Standard Risu, Waifulike, Mobile Chat, CardBoard and Custom HTML, plus colour schemes.
- **Prompting**: Change the prompt order, and use conditions and variables.
- **TTS**: Read the output text aloud.
- **Long-term memory**: HypaMemory V2 and V3, SupaMemory and Hanurai Memory.

## What's different from upstream

This is a short list of changes you will notice. See [Migrating from upstream](wiki/Migrating-from-upstream.md) for moving your data.

- **No RisuAccount and no Google Drive backup.** Account sign-in, sync and Drive backup are removed. RisuRealm still works, and the first time you use it the app asks you to accept upstream's Terms of Service and Privacy Policy. Move data with a local `.bin` backup. A `.bin` made while signed in to RisuAccount on `risuai.xyz` cannot be read here.
- **Saving across tabs and devices.** A self-hosted Node server refuses a save from a stale tab instead of overwriting newer data. When another tab saves, a tab with no unsaved edits usually reloads, but not while it has an unsaved draft open, and not more than twice a minute. A tab with unsaved edits asks you first, and asks again at most once a minute.
- **Restoring a backup is guarded.** Load Backup Locally and Load Internal Backup refuse to run on the web build while another tab of the app is open, and warn you if the browser cannot check. They also refuse while a reply is being written into a chat. Load Internal Backup now writes the snapshot as the main save and reloads the app.
- **Local backups include every asset, not only `.png` files.** Audio, video, WebP, JPEG, font and CSS assets are included. Inlay images, video and audio in chat messages are still not backed up.
- **"Clean Unused Archived Data and Assets" is a guarded, manual clean-up.** It refuses while a reply is being written, while saving has stopped, and while two characters share an id. It also refuses when the saved data has changed since the page last read it (or the page has no record of it yet), and on the web build while another tab is open. It also deletes unused asset files.
- **Archived characters load when you open them.** The automatic 10-day archiving of characters is gone. A new archiving pass is still being built, so this fork does not archive characters yet. The Advanced setting "Archive characters at startup" exists, but it does nothing until that pass lands.
- **Work stays in the chat it started in.** A reply, and the memory summaries and variable writes that come with it, are written into the chat the message was sent from, even if you switch chats, add a branch or reorder chats while it generates.
- **Deleting a chat or character stops the work in it.** Deleting a chat warns you if something is still writing into it, and deletes the chat you confirmed even if the list changed meanwhile.
- **Escape no longer answers a prompt.** Escape does nothing on a confirm or input prompt that waits for an answer, instead of answering it with an empty answer. It still closes information alerts.

## Documentation

- [Wiki](wiki/Home.md): the pages in this repository, rewritten for this fork.
- [Plugin development guide](plugins.md)

## Building from source

Prerequisites:

- Node.js 20.19+ or 22.12+.
- pnpm 10.34.1. `package.json` pins it, so `corepack enable` is enough.
- For the desktop build only: Rust and Cargo, plus the platform prerequisites in the [Tauri guide](https://tauri.app/start/prerequisites/).

```
pnpm install
pnpm dev          # web development server, http://localhost:5174
pnpm build        # web build into dist/
pnpm tauri dev    # desktop development
pnpm tauri build  # desktop build
pnpm check        # type checking
pnpm test         # unit tests
```

To run the self-hosted Node server, build the web app, then start the server from the repo root:

```
pnpm build
pnpm runserver
```

It serves `dist/` and keeps its data in `save/`, both relative to the folder you start it from. It listens on port 6001, or on `PORT` if you set that.

### The legal-documents notice

A frontend built without `VITE_RISU_LEGAL_CONFIGURED` shows a "legal documents not configured" notice instead of the app. This applies to `pnpm dev`, `pnpm build` and the Docker build, and the variable is read when the frontend is built, so set it in the environment of that command (for Docker, see [Docker](#docker)). The notice says you can set it to `TRUE` if you are running a "self-hosted instance for private use from the original repository", or a "simple fork for testing and development to PR back to the original repository". Otherwise it says you must first create your own Terms of Service and Privacy Policy pages and change their URLs in the source, and add the original Terms of Service and Privacy Policy alerts to the parts that use Risuai services. Read it before you set it.

### Known problems with the Node server

- **A plain-HTTP address other than localhost does not work at present.** Opening the server over a LAN or VPN address without HTTPS stops the boot with "Cannot read properties of undefined (reading 'generateKey')", because the browser does not offer `crypto.subtle` outside a secure context. localhost works. HTTPS has not been tested. This is tracked as CHORE-49 in `Agents/Roadmap.md`.
- **The first run of a brand-new server can fail until you reload.** The app asks you to set a password. After you enter it, the boot can stop with the alert "getItem Error". Reload the page and enter the same password, and it boots. This was seen on an empty `save/` folder, and nothing was lost. This is tracked as CHORE-50 in `Agents/Roadmap.md`.

## Docker

This fork builds from source with Docker. It uses its own project, container and volume names (`risuai-fork` and `risuai-fork-save`), so it does not touch an upstream Docker install. To bring your data over, make a `.bin` backup on upstream and load it here, as described in [Migrating from upstream](wiki/Migrating-from-upstream.md).

1. Clone this repository.
2. From the repo root, build and start it:
   ```
   docker compose up -d --build
   ```
3. Open `http://localhost:6001`. Until you set the legal flag as described [below](#the-legal-documents-notice-in-a-docker-build), this shows the legal-documents notice.

The image is built from the `Dockerfile` in this repo (base image `node:24-slim`). The build needs Docker with BuildKit, because the `Dockerfile` uses `RUN --mount=type=cache`. The save lives in the `risuai-fork-save` volume, which Docker names `risuai-fork_risuai-fork-save` (the project name plus the volume name). The Node server problems above apply to this container as well, so use `localhost`.

Upstream's compose file also maps host port 6001, so this container and an upstream one cannot run at the same time. To run both, change the left-hand number of `6001:6001` under `ports:` in one of the two compose files.

### The legal-documents notice in a Docker build

The Docker build keeps the [legal-documents notice](#the-legal-documents-notice) unless whoever builds sets `VITE_RISU_LEGAL_CONFIGURED` for that build. Nothing sets it by default, and the image shows the notice instead of the app until it is set. Read the notice before you set it.

The value is baked into the frontend when the image is built, so it has to be set for the build. Setting it on a running container does nothing. Set it in the shell that runs `docker compose up -d --build` or `docker compose build`:

```
# bash
VITE_RISU_LEGAL_CONFIGURED=TRUE docker compose up -d --build

# PowerShell
$env:VITE_RISU_LEGAL_CONFIGURED = 'TRUE'; docker compose up -d --build
```

Or put `VITE_RISU_LEGAL_CONFIGURED=TRUE` in your own `.env` file next to `docker-compose.yml`. Compose reads that file, and `.env` is in `.gitignore`, so it stays yours. `docker-compose.yml` passes the value to the `Dockerfile` as a build argument. If the value is empty or unset, the notice stays.
