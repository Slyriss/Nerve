# Nerve

Nerve is a Windows-first private task co-pilot for people with ADHD. It runs as a slim always-on-top overlay and watches your screen passively — it never clicks, types, or touches your work. When you stall, drift, or ask for help, it surfaces one calm next physical action.

Nerve does not click, type, block apps, close apps, modify documents, or automate the OS.

## What it does

- **Monitors your session** — captures periodic screenshots locally to detect whether you're on task, drifting, or stuck
- **AI-generated plan** — turns broad goals or pasted task lists into a compact timetable, usually one high-level row per user-facing activity
- **Sidebar guide** — shows the current activity with one immediately doable physical action, while keeping the row title broad and recognizable
- **Gentle overlay** — slim right-side panel that expands only when intervention is warranted
- **Atomise on demand** — any step can be broken into a smaller physical action, down to "put your hand on the mouse"
- **Pause and resume** — hold prompts when you need quiet, then resume the same session
- **5-minute delay** — snooze the overlay and return automatically
- **Editable plan** — reorder, edit, add, or delete steps at any time
- **Session history** — review recent sessions, steps, observations, breadcrumbs, and locally stored screenshots
- **Global hotkey** — press `Win+Shift+N` to bring Nerve back quickly
- **Banned website overlay** — optionally keep a local domain list that forces a stronger sidebar warning when a banned site is detected

## Task types

Built-in templates cover work, admin, creative, planning, and personal-life scopes. Nerve can keep a mixed session coherent when your day includes both project work and routine activities like lunch, showering, errands, or walking the dog.

`Essay writing` · `General writing` · `Coding` · `Research` · `Study` · `Email or admin` · `Presentation` · `Personal / life` · `Health / self-care` · `Household / chores` · `Errands` · `Meals` · `Pet care` · `Exercise` · `Social / communication` · `Finance / bills` · `Design or creative` · `Planning` · `Mixed work`

## Languages

English and Mandarin (中文) — switch in Settings at any time.

## AI providers

| Provider | Key required | Privacy |
|----------|-------------|---------|
| DeepSeek | Yes | Sends session context to DeepSeek API |

Nerve runs in DeepSeek-only mode. There is no Mock provider in the runtime app, so configure a DeepSeek API key before starting real sessions.

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

## Using Gmail

Nerve can connect Gmail in read-only mode from the Inbox screen. The app seeds this Google OAuth Client ID by default:

```powershell
1092609867457-ops0dv1svm1k59no81q17tturn11kkb5.apps.googleusercontent.com
```

You can override it before launch if you need a different OAuth client:

```powershell
$env:NERVE_GOOGLE_CLIENT_ID = "your-client-id.apps.googleusercontent.com"
$env:NERVE_GOOGLE_CLIENT_SECRET = "your-client-secret-if-required"
pnpm dev
```

## Data and privacy

All session data (steps, observations, breadcrumbs, screenshots) is stored locally at:

```
%APPDATA%\Nerve\NerveData\
```

Screenshots are stored as JPEG and auto-deleted after 30 days. You can disable screenshot storage or wipe all data from Settings at any time. Session history stays local so you can resume, review, or clean up past sessions.

DeepSeek mode sends session context (goal, current step, active app/window title, elapsed time) to the configured API. Screenshots are never uploaded.

Banned website detection is local and best-effort. Nerve checks the active browser URL only when the operating system/browser exposes it through active-window metadata, and it stores the matched rule plus sanitized window title rather than storing full browser URLs.

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
- Banned website detection is advisory, not a blocker: it shows an intrusive overlay but does not close tabs, block network access, or control other apps
- Not a medical device or clinical ADHD treatment
