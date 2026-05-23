# 别Meow鱼

A Windows-first private ADHD task co-pilot. Runs as a slim always-on-top overlay, watches your screen passively, and surfaces one calm next physical action when you stall, drift, or ask for help. It never clicks, types, blocks apps, or modifies your work.

---

## Table of Contents

- [What it does](#what-it-does)
- [Task types](#task-types)
- [Languages](#languages)
- [AI providers](#ai-providers)
- [Install](#install)
- [Dev commands](#dev-commands)
- [Using DeepSeek](#using-deepseek)
- [Using Gmail](#using-gmail)
- [Data and privacy](#data-and-privacy)
- [System architecture](#system-architecture)
  - [Process model](#process-model)
  - [Monorepo structure](#monorepo-structure)
  - [Capture pipeline](#capture-pipeline)
  - [Analysis pipeline](#analysis-pipeline)
  - [Broadcast state model](#broadcast-state-model)
  - [IPC API](#ipc-api)
  - [Database schema](#database-schema)
  - [Settings and secrets](#settings-and-secrets)
  - [Voice coach](#voice-coach)
  - [Connectors](#connectors)
  - [UI structure](#ui-structure)
  - [Adding a new AI provider](#adding-a-new-ai-provider)
  - [Adding a new task type](#adding-a-new-task-type)
  - [Internationalisation](#internationalisation)
- [macOS](#macos)
- [Limitations](#limitations)

---

## What it does

- **Monitors your session** — captures periodic screenshots locally to detect whether you're on task, drifting, or stuck
- **AI-generated plan** — turns broad goals or pasted task lists into a sequenced timetable of concrete steps
- **Sidebar guide** — shows the current step with one immediately doable physical action
- **Gentle overlay** — slim right-side panel that expands only when intervention is warranted
- **Voice coach** — press `Alt+M` to ask a question; the app records your mic, reasons over your screen and plan, and replies via TTS
- **Atomise on demand** — any step can be broken into smaller physical sub-actions
- **Pause and resume** — hold prompts when you need quiet, resume the same session
- **5-minute delay** — snooze the overlay nudge and return automatically
- **Editable plan** — reorder, edit, add, or delete steps at any time
- **Session history** — review past sessions, steps, observations, breadcrumbs, and locally stored screenshots
- **Global hotkeys** — `Win+Shift+N` toggles the overlay; `Alt+M` activates the voice coach
- **Banned website overlay** — local domain list that forces a stronger sidebar warning when a banned site is detected
- **Gmail inbox** — connects read-only to Gmail and extracts action items with AI

---

## Task types

`Essay writing` · `General writing` · `Coding` · `Research` · `Study` · `Email or admin` · `Presentation` · `Personal / life` · `Health / self-care` · `Household / chores` · `Errands` · `Meals` · `Pet care` · `Exercise` · `Social / communication` · `Finance / bills` · `Design or creative` · `Planning` · `Mixed work`

---

## Languages

English and Mandarin (中文) — switch in Settings at any time.

---

## AI providers

| Provider | Key required | Privacy |
|---|---|---|
| DeepSeek | Yes | Sends session context + active window metadata to DeepSeek API. Screenshots are never uploaded. |

---

## Install

**Windows:**
```powershell
pnpm install
```

**macOS:** Xcode Command Line Tools are required to compile native modules (`better-sqlite3`, `active-win`):
```bash
xcode-select --install
pnpm install
```
On first run, grant **Screen Recording** and **Accessibility** permissions when prompted.

---

## Dev commands

```powershell
pnpm dev          # Start Electron + Vite in watch mode
pnpm build        # Build all packages
pnpm typecheck    # Run tsc across all packages
pnpm smoke        # Happy-path session flow tests
pnpm break        # Edge case + error handling tests
```

---

## Using DeepSeek

Set your key in Settings, or pass it via environment variable:

```powershell
$env:DEEPSEEK_API_KEY = "your_key"
$env:DEEPSEEK_MODEL  = "deepseek-chat"
pnpm dev
```

---

## Using Gmail

Connect from the Inbox screen. The app uses a built-in Google OAuth client ID by default. Override if needed:

```powershell
$env:NERVE_GOOGLE_CLIENT_ID     = "your-client-id.apps.googleusercontent.com"
$env:NERVE_GOOGLE_CLIENT_SECRET = "your-client-secret"
pnpm dev
```

---

## Data and privacy

All session data is stored locally at `%APPDATA%\[app]\NerveData\`. Screenshots are JPEG-compressed and auto-deleted after 30 days. You can disable screenshot storage or wipe everything from Settings.

DeepSeek mode sends goal, current step, and active app/window title to the API. Screenshots are never uploaded. Banned-site detection is entirely local.

---

## System architecture

### Process model

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                                  │
│                                                                   │
│  ┌───────────────┐  frame event  ┌──────────────────────────────┐ │
│  │ CaptureService│ ────────────▶ │ Orchestrator  (main.ts)      │ │
│  │               │               │                              │ │
│  │ • screenshot  │               │ • session + step state       │ │
│  │ • active win  │               │ • capture loop handler       │ │
│  │ • idle time   │               │ • AI call gating             │ │
│  └───────────────┘               │ • DB writes (Drizzle/SQLite) │ │
│                                  │ • broadcast() → both windows │ │
│  ┌───────────────┐               │ • IPC handlers               │ │
│  │AnalysisService│ ◀───────────▶ │ • global hotkeys             │ │
│  │               │               │ • reminder timer             │ │
│  │ (AI provider  │               │ • banned-site detection      │ │
│  │  wrapper)     │               └──────────────────────────────┘ │
│  └───────────────┘                          │ IPC (contextBridge) │
└─────────────────────────────────────────────┼────────────────────┘
                                              │
              ┌───────────────────────────────┼─────────────────────┐
              │                               │                     │
   ┌──────────▼──────────┐       ┌────────────▼──────────┐          │
   │  Main Window         │       │  Overlay Window        │          │
   │                      │       │                        │          │
   │  #/  → PlanEditor    │       │  #/overlay → Overlay  │          │
   │  #/settings          │       │  always-on-top         │          │
   │  #/log               │       │  slim ↔ expanded       │          │
   │  #/history           │       │                        │          │
   │  #/calendar          │       │                        │          │
   │  #/inbox             │       │                        │          │
   └──────────────────────┘       └────────────────────────┘          │
              │                               │                      │
   ┌──────────▼───────────────────────────────▼─────────────────────┐ │
   │  Single Vite-built renderer bundle (same JS for both windows)   │ │
   │  App.tsx checks location.hash to render the correct tree        │ │
   └─────────────────────────────────────────────────────────────────┘ │
```

### Monorepo structure

```
别Meow鱼/
├── apps/desktop/src/
│   ├── main/
│   │   ├── main.ts          Orchestrator: IPC, DB, capture loop, window management
│   │   ├── capture.ts       CaptureService — sensor layer (screenshots + active-window polling)
│   │   ├── analysis.ts      AnalysisService — thin AI provider wrapper
│   │   ├── connectors/
│   │   │   └── gmail.ts     Gmail OAuth + message fetching + AI extraction
│   │   └── db/
│   │       └── schema.ts    Drizzle ORM table definitions (single source of truth)
│   ├── preload/
│   │   └── preload.cts      IPC bridge — exposes window.nerve to renderer (compiles to .cjs)
│   └── renderer/src/
│       ├── App.tsx           Root — hash routing + snapshot subscription
│       ├── global.d.ts       window.nerve type declaration (must mirror preload)
│       ├── styles.css        Single stylesheet (no CSS modules)
│       ├── lib/
│       │   ├── copy.ts       All UI strings (en + zh)
│       │   ├── types.ts      Renderer-local types + CopyKey union
│       │   ├── hooks.ts      useSnapshot, useNow
│       │   └── utils.ts      Date helpers, stats, formatting
│       └── components/
│           ├── Overlay.tsx              Slim + expanded overlay; VoiceCoach component
│           ├── StepCard.tsx             Current step card (overlay + main window)
│           ├── PlanEditor.tsx           Editable step list + re-plan button
│           ├── SessionStart.tsx         Goal composer with voice dictation
│           ├── SettingsScreen.tsx       All settings
│           ├── ActiveSessionHandoff.tsx Handoff panel when session is running
│           ├── SideTimetable.tsx        Timetable view in overlay
│           ├── CalendarScreen.tsx       Calendar of due/reminder dates
│           ├── InboxScreen.tsx          Action items from connectors
│           ├── LogScreen.tsx            Session log + stats
│           ├── HistoryScreen.tsx        Past sessions browser
│           ├── ReminderPanel.tsx        Reminder manager
│           ├── QuickNotesSection.tsx    Scratch pad
│           ├── BreadcrumbTrail.tsx      Recent app/window activity
│           └── BannedSiteCard.tsx       Blocked-site nudge card
└── packages/shared/src/
    ├── index.ts       Barrel export
    ├── types.ts       All TypeScript interfaces, TaskType union, defaultSettings
    ├── providers.ts   MockAIProvider + DeepSeekAIProvider
    ├── prompts.ts     AI prompt templates (plan, screen analysis, atomize, voice coach)
    └── aiSchema.ts    Zod schemas for all AI JSON responses + parseJsonObject()
```

### Capture pipeline

```
Interval timer OR window-change poll (600 ms) OR voice trigger
        │
        ▼
CaptureService emits "frame" event  →  ScreenCapture {
  image, activeApp, windowTitle, hash, changed, idleSeconds,
  trigger: "interval"|"window-change"|"idle"|"voice", noisy
}
        │
        ▼
main.ts onFrame() handler
  ├── noisy source (own window, system UI)?  → skip AI, use last known context
  ├── system idle > threshold?               → skip
  ├── perceptual hash unchanged?             → skip (8×8 downscale, bit comparison)
  ├── delay / thinking pause active?         → skip
  │
  ▼
AnalysisService.analyzeScreen(input)
  └── DeepSeekAIProvider → POST /chat/completions (vision model)
      Response validated by Zod schema
        │
        ▼
  Write to ai_observations table
  Update breadcrumb (app/window tracking)
  Check banned-site rules
  Apply intervention logic (drift/stuck thresholds → expand overlay)
        │
        ▼
  broadcast() → AppSnapshot to both windows via nerve:snapshot IPC
```

**Perceptual hash:** Each frame is downscaled to 8×8, brightness-averaged, then compared bit-for-bit to the previous frame. Any pixel difference counts as "changed." Identical frames are skipped to avoid redundant AI calls.

### Analysis pipeline

The AI receives an `AnalyzeScreenInput` containing the screenshot (base64 JPEG), active app + window title, session goal + task type, active step, recent breadcrumbs, current user state, and time since last observation.

It returns structured JSON validated by Zod:

| Field | Type | Purpose |
|---|---|---|
| `userState` | enum | `on_task` / `productive_drift` / `unproductive_drift` / `stuck` / `thinking` / `progress` |
| `taskRelevance` | enum | `on_task` / `possibly_related` / `off_task` / `unknown` |
| `progressState` | enum | `changed` / `unchanged` / `complete_suggested` / `unknown` |
| `shouldIntervene` | boolean | Whether to expand overlay and nudge |
| `interventionType` | enum | `none` / `step_card` / `drift_card` / `thinking_hold` |
| `suggestedNextAction` | string | Physical next action to display in overlay |
| `conciseExplanation` | string | Why this action, what was observed |
| `suggestedStepComplete` | boolean | AI thinks current step is done |
| `urgency` | enum | `low` / `medium` |
| `visibleChangeSummary` | string | What changed on screen since last frame |
| `breadcrumbRelevance` | enum | How to classify the current app in the activity trail |
| `detectedTaskType` | TaskType | What type of work the AI sees |

### Broadcast state model

All mutable state lives in the main process. After any mutation, `broadcast()` runs:

```
broadcast()
  └── snapshot()  builds AppSnapshot from:
        session record · active step · all steps (ordered)
        latest AI observations · recent breadcrumbs · recent events
        pending reminders · connector status
        runtime flags: overlayExpanded, delayUntil, thinkingPauseUntil,
                       breakEndsAt, breakReminderAt, bannedSiteAlert
        voice: voiceState, voiceGuidance
        settings: language, opacity, intervals, …
        │
        ▼
  webContents.send("nerve:snapshot", snapshot)  →  main window
  webContents.send("nerve:snapshot", snapshot)  →  overlay window
```

The renderer's `useSnapshot()` hook subscribes to `nerve:snapshot` and re-renders. There is no optimistic UI — every render reflects confirmed DB state.

### IPC API

All calls go through `window.nerve` (injected by the preload). Every handler returns a fresh `AppSnapshot` unless noted.

| Handler | Returns | Description |
|---|---|---|
| `getSnapshot` | `AppSnapshot` | Full current state |
| `startSession` | `AppSnapshot` | Create session + AI plan generation |
| `endSession` | `AppSnapshot` | Mark completed, stop capture |
| `pauseSession` | `AppSnapshot` | Pause session, stop capture loop |
| `resumeSession` | `AppSnapshot` | Resume paused session |
| `updateSession` | `AppSnapshot` | Edit goal or deadline |
| `replanSession` | `AppSnapshot` | Regenerate AI plan from current step forward |
| `updateStep` | `AppSnapshot` | Patch any step field |
| `addStep` | `AppSnapshot` | Append blank step |
| `deleteStep` | `AppSnapshot` | Delete step, auto-activate next |
| `reorderStep` | `AppSnapshot` | Swap step order with neighbour |
| `action` | `AppSnapshot` | `done` / `thinking` / `delay` / `atomize` / `markDone` / `keepWorking` / `endBreak` / `repeatRoutine` |
| `updateSettings` | `AppSnapshot` | Patch settings with validation |
| `setOverlayExpanded` | `void` | Toggle overlay width, set collapse cooldown |
| `openMain` | `void` | Show/focus main window at a route |
| `openScreenshotFolder` | `string` | Open screenshots folder in Explorer |
| `deleteAllData` | `void` | Wipe all data and files |
| `onSnapshot` | cleanup fn | Subscribe to pushed snapshots |
| `onToggleVoice` | cleanup fn | Subscribe to Alt+M hotkey events |
| `voiceMessage` | `VoiceCoachResponse` | Send recorded audio for a voice coach turn |
| `setVoiceState` | `void` | Sync renderer voice state to main |
| `getSessions` | `SessionSummaryRecord[]` | Past session list |
| `getSessionLog` | log data | Full log for a past session |
| `addReminder` | `AppSnapshot` | Add reminder |
| `deleteReminder` | `AppSnapshot` | Remove reminder |
| `getNotes` | `string` | Quick notes for current session |
| `saveNotes` | `void` | Persist quick notes |
| `getInboxItems` | `ActionItem[]` | Fetch inbox from connectors |
| `setInboxItemStatus` | `ActionItem[]` | Mark item promoted/dismissed |
| `connectGmail` | `ConnectorStatus` | Start Gmail OAuth flow |
| `disconnectConnector` | `ConnectorStatus` | Revoke connector tokens |
| `getConnectorStatus` | `ConnectorStatus` | Auth state for all connectors |

### Database schema

Single SQLite file at `%APPDATA%\[app]\NerveData\nerve.sqlite` (WAL mode). Schema defined with Drizzle ORM in `apps/desktop/src/main/db/schema.ts` and mirrored as raw SQL in `ensureStorage()`.

```
sessions          id, goal, task_type, status, started_at, ended_at
steps             id, session_id, order_index, title, next_action, explanation,
                  task_type, due_at, reminder_at, routine_interval_minutes,
                  routine_next_at, status, atomization_level, delay_count
activities        id, session_id, order_index, title, task_type, due_at, …
guidance_steps    id, activity_id, session_id, next_action, explanation, status
screenshots       id, session_id, file_path, thumbnail_path, captured_at,
                  active_app, window_title, perceptual_hash
ai_observations   id, session_id, screenshot_id, step_id, user_state,
                  task_relevance, progress_state, suggested_next_action,
                  concise_explanation, suggested_step_complete,
                  should_intervene, intervention_type, urgency, raw_json
events            id, session_id, type, message, metadata_json
breadcrumbs       id, session_id, app_name, window_title, relevance,
                  started_at, ended_at, duration_seconds
task_history      id, session_id, task_type, source, confidence, summary
reminders         id, session_id, step_id, title, message,
                  due_at, reminder_at, status, triggered_at
settings          key, value (JSON-encoded), updated_at
connector_tokens  connector, access_token, refresh_token, email, expires_at
inbox_items       id, source, source_message_id, title, urgency,
                  suggested_task_type, due_hint, status
```

No migration system — schema changes use `ALTER TABLE` in `ensureStorage()`. Delete `nerve.sqlite` to reset in development.

Screenshots are JPEG files in `NerveData/screenshots/` — full resolution at quality 85, thumbnails at 320×180 quality 75. Files older than 30 days are pruned on startup.

### Settings and secrets

Settings are JSON-encoded key/value rows in the `settings` table. The in-memory cache (`cachedSettings`) is invalidated on `updateSettings()`, `deleteAllData()`, and `applyUserRequestedDefaults()`.

The DeepSeek API key is encrypted at rest with Electron `safeStorage` (DPAPI on Windows, Keychain on macOS), stored with an `enc:` prefix. Plain-text legacy values are accepted on read for backwards compatibility.

`applyUserRequestedDefaults()` forces `screenshotIntervalSeconds: 60` and `panelOpacity: 0.5` on every startup — intentionally locked for the current UX.

### Voice coach

```
User presses Alt+M
        │
        ▼
main.ts globalShortcut handler
  → overlayWindow.showInactive()
  → nerve:toggleVoice IPC sent to both windows
        │
        ▼
VoiceCoach component (Overlay.tsx / StepCard voiceSlot)
  → navigator.mediaDevices.getUserMedia({ audio: true })
  → MediaRecorder records until Alt+M pressed again or button clicked
        │
        ▼
window.nerve.voiceMessage(base64Audio)
        │
        ▼
main.ts voiceMessage IPC handler
  1. Transcribe audio via Whisper (DeepSeek API)
  2. Capture screenshot (trigger: "voice") for visual context
  3. Build voiceCoachPrompt:
       session goal + active step + recent breadcrumbs
       + transcription + previous voice turns (in-memory history)
  4. POST to DeepSeek chat completions
  5. Parse response → { suggestedNextAction, response, transcription }
  6. Update voiceGuidance in state
  7. broadcast() → both windows update
  8. Return audioBase64 from ElevenLabs TTS to renderer
        │
        ▼
Renderer: new Audio(dataUrl).play()
StepCard shows voiceGuidance inline (overrides AI-suggested action text)
```

Voice history (last N turns) is kept in memory for multi-turn context and cleared when the session ends.

### Connectors

**Gmail** — OAuth flow via `shell.openExternal()` and a local redirect server. Read-only. Tokens are encrypted with the same `enc:` mechanism as API keys and stored in `connector_tokens`. On sync, raw messages are sent to DeepSeek for action-item extraction; results land in `inbox_items` and surface in the Inbox screen.

### UI structure

```
App.tsx
  ├── #/overlay  →  <Overlay>
  │     ├── slim (56px)
  │     │     mark · status · VoiceCoach(compact) · progress rail · step title
  │     └── expanded (260px)
  │           header: brand · state pill · collapse btn
  │           side toggle: Step | Time
  │           Step view: StepCard(compact, voiceSlot=<VoiceCoach>) · timers
  │           Time view: SideTimetable
  │           footer: Pause/Resume · Settings · End session
  │
  └── #/  →  main window
        topbar: brand · nav tabs
        │
        ├── view=start + active session  →  ActiveSessionHandoff
        ├── view=start + no session      →  SessionStart
        ├── view=plan                    →  PlanEditor
        │     left (sticky): StepCard · QuickNotes · ReminderPanel · BreadcrumbTrail
        │     right: editable step list (title · nextAction · deadline fields)
        ├── view=log                     →  LogScreen
        ├── view=history                 →  HistoryScreen
        ├── view=calendar                →  CalendarScreen
        ├── view=inbox                   →  InboxScreen
        └── view=settings                →  SettingsScreen
```

Both windows load the same Vite bundle. `location.hash` is the only routing key.

### Adding a new AI provider

1. Implement `AIProvider` from `packages/shared/src/types.ts` — 2 methods: `generatePlan`, `analyzeScreen`
2. Export the class from `packages/shared/src/providers.ts`
3. Add the name to `AIProviderName` union in `types.ts`
4. Add it to `settingOptions.aiProvider` in `main.ts`
5. Wire it in the `provider()` factory in `main.ts`
6. Add a select option in `SettingsScreen.tsx`

### Adding a new task type

1. Add to `TaskType` union and `taskTypes` array in `packages/shared/src/types.ts`
2. Add a mock plan template to the `plans` object in `providers.ts`
3. Add detection patterns to the `patterns` object in `providers.ts`
4. Add a breadcrumb classification pattern to `classifyRelevance` in `main.ts`

### Internationalisation

UI copy lives in `apps/desktop/src/renderer/src/lib/copy.ts` — a `copy` object with `en` and `zh` keys.

To add a new string:
1. Add the key to `CopyKey` in `lib/types.ts`
2. Add to both `copy.en` and `copy.zh` in `copy.ts`
3. Use `t("yourKey")` in any component calling `useCopy(snapshot.settings.language)`

AI prompts are not yet translated — `prompts.ts` always generates English regardless of `language`.

---

## macOS

The app runs on macOS with graceful degradation.

| Feature | macOS |
|---|---|
| Core UI, sessions, SQLite | Full |
| Always-on-top overlay | Full |
| safeStorage (API key) | Full — uses Keychain |
| Mica background blur | Not available — standard window |
| Screen capture | Requires Screen Recording permission |
| Active window detection | Requires Accessibility permission |

If either permission is denied the app continues — AI analysis falls back to text-only context and window detection returns `"Unknown app"`.

---

## Limitations

- Actively developed on Windows 11 — macOS works with noted caveats, Linux untested
- Read-only — never automates, clicks, or types
- Banned website detection is advisory: shows an intrusive overlay but does not block network or close tabs
- Not a medical device or clinical ADHD treatment
