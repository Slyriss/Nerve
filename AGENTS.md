# Nerve — Codebase Guide for Codex

## What this project is

Nerve is a Windows-first Electron desktop app that acts as a private, read-only ADHD task co-pilot. It captures periodic screenshots, classifies user state with AI (DeepSeek or Mock), and shows a slim always-on-top overlay panel with the next concrete physical action the user should take. It never types, clicks, or modifies the user's work — it only observes and prompts.

## Monorepo structure

```
apps/desktop/          Electron app (main process + renderer + preload)
  src/main/main.ts     All backend logic: IPC, DB, capture loop, window management (~1200 lines)
  src/main/db/schema.ts  Drizzle ORM table definitions (single source of truth for schema)
  src/preload/preload.cts  IPC bridge — exposes window.nerve to the renderer
  src/renderer/src/App.tsx  React UI (main window + overlay, both served from same bundle)
  src/renderer/src/global.d.ts  Type declaration for window.nerve (must stay in sync with preload)

packages/shared/       Shared types, AI providers, prompts, schemas
  src/types.ts         All TypeScript interfaces and the taskTypes/defaultSettings exports
  src/providers.ts     MockAIProvider + DeepSeekAIProvider implementations
  src/prompts.ts       AI prompt templates (planPrompt, screenAnalysisPrompt, atomizePrompt)
  src/aiSchema.ts      Zod validation schemas for AI JSON responses + parseJsonObject()
  src/index.ts         Barrel export — everything flows through here
```

## Technology stack

- **Electron 34** — desktop shell, IPC, screen capture (`desktopCapturer`), `safeStorage`
- **React 19 + Vite 6** — renderer (single bundle serves both main window and overlay via hash routing)
- **better-sqlite3 + Drizzle ORM** — local SQLite with WAL mode; schema in `db/schema.ts`
- **Zod** — validates all AI JSON responses before they touch app state
- **pnpm** monorepo with workspace packages

## Key architectural patterns

### Two windows, one bundle
The overlay (`#/overlay`) and main window (`#/`) are both loaded from the same Vite bundle. `App.tsx` checks `location.hash.startsWith("#/overlay")` to render the correct tree. Both windows receive broadcast snapshots via `nerve:snapshot` IPC events.

### Broadcast-based state sync
All state lives in the main process (SQLite + globals). After any mutation, `broadcast()` is called, which rebuilds `snapshot()` and sends it to both windows via `webContents.send("nerve:snapshot", data)`. The renderer's `useSnapshot()` hook subscribes to these events. There is no optimistic UI — the renderer always reflects confirmed DB state.

### IPC API (window.nerve)
Every IPC call returns an `AppSnapshot` (the full app state) except `setOverlayExpanded` and `deleteAllData`. This makes every action atomic from the renderer's perspective — call the action, get the new state back, done.

| Handler | Returns | Description |
|---|---|---|
| `getSnapshot` | `AppSnapshot` | Full current state |
| `startSession` | `AppSnapshot` | Creates session + AI plan |
| `endSession` | `AppSnapshot` | Marks session completed, stops capture |
| `updateSession` | `AppSnapshot` | Edit session goal or deadline |
| `updateStep` | `AppSnapshot` | Patch step fields (title, nextAction, explanation, status, orderIndex) |
| `addStep` | `AppSnapshot` | Append a blank step |
| `deleteStep` | `AppSnapshot` | Delete a step, auto-activates next |
| `reorderStep` | `AppSnapshot` | Swap step order_index with neighbour |
| `action` | `AppSnapshot` | done / thinking / delay / atomize / markDone / keepWorking |
| `updateSettings` | `AppSnapshot` | Patch settings with validation |
| `setOverlayExpanded` | void | Toggle overlay width, sets collapse cooldown |
| `openMain` | void | Show/focus main window at a route |
| `openScreenshotFolder` | string | Open screenshots folder in Explorer |
| `deleteAllData` | void | Wipe all session data and files |
| `onSnapshot` | cleanup fn | Subscribe to pushed snapshots |

### Settings cache
`getSettings()` caches in `cachedSettings`. It is invalidated by `updateSettings()`, `deleteAllData()`, and `applyUserRequestedDefaults()`. The DeepSeek API key is encrypted via Electron's `safeStorage` using an `enc:<base64>` prefix — decrypted on read, encrypted on write, backwards-compatible with plain-text legacy values.

### Screenshot pipeline
- Format: JPEG (full at quality 85, thumb at quality 75, 320×180)
- Perceptual hash: 8×8 downscale, average-brightness bit comparison → 64-char binary string
- Hashes are compared for equality (not Hamming distance) — any pixel-level change counts as "changed"
- Retention: `pruneOldScreenshots(30)` runs at app startup, deletes files + DB records older than 30 days

### Overlay expand cooldown
`overlaySuppressUntil` (60 seconds after manual collapse) prevents the system from immediately re-expanding the overlay after the user deliberately collapses it. `expandOverlayFromSystem()` checks this before setting `overlayExpanded = true`.

## Task types

8 task types are supported, each with a tailored mock plan and keyword detection patterns:

`Essay writing` | `General writing` | `Coding` | `Research` | `Study` | `Email or admin` | `Design or creative` | `Planning`

The `taskTypes` array is exported from `packages/shared/src/types.ts` and used in both the renderer (session start dropdown) and main process.

When adding a new task type:
1. Add to the `TaskType` union and `taskTypes` array in `types.ts`
2. Add a plan template to the `plans` object in `providers.ts`
3. Add a detection pattern to the `patterns` object in `providers.ts` (`looksTaskRelated`)
4. Add a breadcrumb classification pattern to `classifyRelevance` in `main.ts`

## Internationalisation (i18n)

UI copy lives in the `copy` object in `App.tsx`. Currently supports `"en"` (English) and `"zh"` (Mandarin). The `language` setting is stored in SQLite and included in every `AppSnapshot`.

When adding new UI strings:
1. Add the key to the `CopyKey` union type
2. Add the value to both `copy.en` and `copy.zh`
3. Use `t("yourKey")` inside any component that calls `useCopy(snapshot.settings.language)`

AI prompts are not yet translated — the `language` field is passed to prompts/providers but `prompts.ts` ignores it currently. Future work: add Chinese prompts for DeepSeek when `language === "zh"`.

## Adding a new AI provider

1. Implement the `AIProvider` interface from `types.ts` (3 methods: `generatePlan`, `analyzeScreen`, `atomizeStep`)
2. Export the class from `providers.ts`
3. Add the provider name to `AIProviderName` in `types.ts`
4. Add it to `settingOptions.aiProvider` in `main.ts`
5. Wire it up in the `provider()` factory function in `main.ts`
6. Add a settings select option in `SettingsScreen` in `App.tsx`

## Database

Schema is defined in `src/main/db/schema.ts` (Drizzle) and mirrored as raw SQL in `ensureStorage()` in `main.ts`. If you change the schema, update both.

Indexes exist on `session_id + order_index/captured_at/created_at/started_at` for all child tables.

No migration system — schema changes require `db.exec("ALTER TABLE ...")` in `ensureStorage()` or a version gate. For development, deleting `%APPDATA%\Nerve\NerveData\nerve.sqlite` is sufficient.

## Known constraints

- **Windows primary** — the app is designed and tested on Windows 11. macOS works with caveats (see below).
- **Linux** — untested; `active-win` has no Linux support, all screen capture is untested.
- `safeStorage` requires the app to be `ready` — never call `encryptApiKey`/`decryptApiKey` before `app.whenReady()`
- `applyUserRequestedDefaults()` forces `screenshotIntervalSeconds: 60` and `panelOpacity: 0.5` on every startup — these are intentionally locked for the current UX design
- The preload (`preload.cts`) compiles to `.cjs` — the `webPreferences.preload` path uses `preload.cjs`
- Both windows use the same preload — overlay-specific actions (`setOverlayExpanded`) are available in the main window too

## macOS compatibility

The app **runs on macOS** with graceful degradation. Prerequisites and caveats:

### Required setup
1. **Xcode Command Line Tools** — both `better-sqlite3` and `active-win` are native Node addons compiled by `@electron/rebuild` on `postinstall`. Without Xcode CLT, `pnpm install` will fail.
   ```bash
   xcode-select --install
   ```

### Permissions (prompted on first run)
- **Screen Recording** (`System Preferences → Privacy & Security → Screen Recording`) — required for `desktopCapturer`. If denied, screenshot analysis silently fails with `capture_error` logged; the app continues running but AI has no visual context.
- **Accessibility** (`System Preferences → Privacy & Security → Accessibility`) — required for `active-win` (active window detection). If denied, falls back to `"Unknown app"` gracefully.

### Feature differences on macOS
| Feature | macOS behavior |
|---|---|
| Mica background blur (`backgroundMaterial: "mica"`) | Silently ignored — standard opaque window |
| Screen capture | Works if Screen Recording permission granted |
| Active window detection | Works if Accessibility permission granted |
| `safeStorage` | Full — uses macOS Keychain |
| SQLite, IPC, all CRUD | Full |
| Always-on-top overlay | Full |
| `setVisibleOnAllWorkspaces` | Full |

## Feature improvement opportunities

These are deliberate gaps, not bugs:

1. **Session history** — `nerve:getSessions` IPC exists but there is no history UI; past sessions are invisible after completion
2. **Pause session** — only Start and End exist; a Pause state (`SessionStatus = "paused"`) would let users resume context
3. **AI-powered plan regeneration** — users can edit steps manually but cannot ask AI to revise the plan mid-session
4. **Global hotkey** — no system-wide shortcut to expand/collapse the overlay without clicking it
5. **Translated AI prompts** — `language` is passed to providers but `prompts.ts` always generates English prompts
6. **Ollama / local AI** — adding a third provider for fully offline use would be the next privacy tier
7. **Sound cues** — gentle audio notification when the overlay expands (opt-in)
8. **Session summary** — end-of-session report: time spent, steps completed, drift ratio, breadcrumb breakdown
9. **Custom step count** — AI generates a fixed number of steps per task type; user preference for more/fewer steps
10. **Accessibility** — no ARIA labels, no keyboard navigation in overlay buttons

## Dev commands

```
pnpm dev          Start Electron + Vite in watch mode
pnpm build        Build all packages
pnpm typecheck    Run tsc across all packages
pnpm smoke        Run smoke test suite (validates happy-path session flow)
pnpm break        Run break test suite (validates edge cases and error handling)
```

Data is stored at `%APPDATA%\Nerve\NerveData\` (Windows). Delete this folder to reset all state.
