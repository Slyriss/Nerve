# Nerve

Nerve is a Windows-first private task co-pilot for people with ADHD. It runs as a slim always-on-top overlay and watches your screen passively — it never clicks, types, or touches your work. When you stall, drift, or ask for help, it surfaces one calm next physical action.

Nerve does not click, type, block apps, close apps, modify documents, or automate the OS.

## What it does

- **Monitors your session** — captures periodic screenshots locally to detect whether you're on task, drifting, or stuck
- **AI-generated plan** — breaks your goal into concrete sequential steps; each step has one immediately doable physical action
- **Gentle overlay** — slim right-side panel that expands only when intervention is warranted
- **Atomise on demand** — any step can be broken into a smaller physical action, down to "put your hand on the mouse"
- **Thinking pause** — hold the current step without prompts for up to 10 minutes
- **5-minute delay** — snooze the overlay and return automatically
- **Editable plan** — reorder, edit, add, or delete steps at any time
- **Full session log** — every observation, breadcrumb, and screenshot recorded locally

## Task types

Eight built-in templates with tailored step patterns and app-detection logic:

`Essay writing` · `General writing` · `Coding` · `Research` · `Study` · `Email or admin` · `Design or creative` · `Planning`

## Languages

English and Mandarin (中文) — switch in Settings at any time.

## AI providers

| Provider | Key required | Privacy |
|----------|-------------|---------|
| Mock | No | Fully local — no network calls |
| DeepSeek | Yes | Sends session context to DeepSeek API |

Mock mode is the default and works without any setup. DeepSeek adds real screen-context analysis.

## Install

**Windows:**
```powershell
pnpm install
```

**macOS:** Xcode Command Line Tools are required to compile native modules (`better-sqlite3`, `active-win`). Install them first, then:
```bash
xcode-select --install
pnpm install
```
On first run, grant **Screen Recording** and **Accessibility** permissions when prompted. See [macOS notes](#macos) below.

## Run in development

```powershell
pnpm dev
```

Starts Vite, compiles the Electron main/preload TypeScript, and launches the app.

## Build

```powershell
pnpm build
```

## Run tests

Smoke test — validates the full happy-path session flow:

```powershell
pnpm --filter @nerve/desktop smoke
```

Break test — validates edge cases (blank goals, invalid settings, active-step deletion):

```powershell
pnpm --filter @nerve/desktop break
```

## Using DeepSeek

Set your key in Settings, or pass it via environment variable:

```powershell
$env:DEEPSEEK_API_KEY = "your_key"
$env:DEEPSEEK_MODEL  = "deepseek-chat"
pnpm dev
```

## Data and privacy

All session data (steps, observations, breadcrumbs, screenshots) is stored locally at:

```
%APPDATA%\Nerve\NerveData\
```

Screenshots are stored as JPEG and auto-deleted after 30 days. You can disable screenshot storage or wipe all data from Settings at any time.

Mock mode makes zero network requests. DeepSeek mode sends session context (goal, current step, active app/window title, elapsed time) to the configured API. Screenshots are never uploaded.

## Architecture

- **Electron 34** — main process handles all IPC, SQLite, screen capture, and window management
- **React 19 + Vite 6** — single renderer bundle serves both the main window and the overlay via hash routing
- **better-sqlite3 + Drizzle ORM** — local WAL-mode SQLite; schema in `apps/desktop/src/main/db/schema.ts`
- **pnpm monorepo** — shared types, providers, and prompts live in `packages/shared`

See `CLAUDE.md` for a full developer reference including the IPC API, how to add task types and AI providers, and known constraints.

## macOS

The app runs on macOS with graceful degradation:

| Feature | macOS |
|---|---|
| Core UI, sessions, SQLite | Full |
| Always-on-top overlay | Full |
| safeStorage (API key) | Full — uses Keychain |
| Mica background blur | Not available — standard window |
| Screen capture | Requires Screen Recording permission |
| Active window detection | Requires Accessibility permission |

If either permission is denied, the app continues running — AI analysis falls back to text-only context and window detection returns `"Unknown app"`.

## Limitations

- Active development on Windows 11 — macOS works with noted caveats, Linux untested
- Read-only — Nerve does not automate, click, or type
- Not a medical device or clinical ADHD treatment
