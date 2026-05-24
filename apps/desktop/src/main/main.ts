import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, net, Notification, powerMonitor, protocol, safeStorage, screen, shell } from "electron";
import { CaptureService, capturePrimaryScreen, getActiveWindowFallback, imageHash, isNoisyDetection, type ScreenCapture } from "./capture.js";
import { AnalysisService } from "./analysis.js";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import {
  DeepSeekAIProvider,
  defaultSettings,
  voiceCoachPrompt,
  type AIObservationRecord,
  type AIProvider,
  type AnalyzeScreenInput,
  type AppSnapshot,
  type BannedSiteAlert,
  type ActivityRecord,
  type BreadcrumbRecord,
  type BreadcrumbRelevance,
  type EventRecord,
  type GuidanceStepRecord,
  type NerveSettings,
  type PlanStepDraft,
  type ReminderRecord,
  type ScreenshotRecord,
  type SessionRecord,
  type SessionSummaryRecord,
  type StepRecord,
  type TaskHistoryRecord,
  type TaskType,
  type ActionItem,
  type ActionItemStatus,
  type ConnectorName,
  type ConnectorStatus,
  type VoiceCoachMessage,
  type VoiceCoachResponse,
  type VoiceGuidance,
  type VoiceRuntimeState,
  type VoiceTranscriptionResponse
} from "@nerve/shared";
import { schema, settingsTable } from "./db/schema.js";
import { DEFAULT_GOOGLE_CLIENT_ID, startGmailOAuth, refreshGmailToken, fetchGmailMessages, encryptToken, decryptToken, type RawGmailMessage } from "./connectors/gmail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isSelfTest = process.env.NERVE_SMOKE_TEST === "1" || process.env.NERVE_BREAK_TEST === "1";

if (isSelfTest) {
  app.setPath("userData", path.join(app.getPath("temp"), `NerveSelfTest-${process.pid}`));
} else {
  app.setPath("userData", path.join(app.getPath("appData"), "Nerve"));
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "nerve-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

let overlayWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let blockerWindow: BrowserWindow | null = null;
let catWindow: BrowserWindow | null = null;
let db: Database.Database;
let orm: BetterSQLite3Database<typeof schema>;
let captureService: CaptureService | null = null;
let delayTimer: NodeJS.Timeout | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let activeSessionId: string | null = null;
let overlayExpanded = false;
let overlaySuppressUntil = 0;
let delayUntil: string | null = null;
let thinkingPauseUntil: string | null = null;
let breakReminderAt: string | null = null;
let breakEndsAt: string | null = null;
let bannedSiteAlert: BannedSiteAlert | null = null;
let bannedSiteStrikeCount = 0;
let lockInAlert = false;
let lockInWarningStartedAt: string | null = null;
let lockInWarningTimer: NodeJS.Timeout | null = null;
let lastBannedSiteEventKey: string | null = null;
let lastBannedSiteEventAt = 0;
let blockerSuppressUntil = 0;
let currentBreadcrumbId: string | null = null;
let currentBreadcrumbKey: string | null = null;
let currentBreadcrumbStartedAt: string | null = null;
let voiceHistory: VoiceCoachMessage[] = [];
let voiceGuidance: VoiceGuidance | null = null;
let voiceState: VoiceRuntimeState = "idle";
let cachedSettings: NerveSettings | null = null;
let isQuitting = false;

const overlaySlimWidth = 56;
const overlayExpandedWidth = 260;
const overlayBannedWidth = 320;
const catScreenWidth = 124;
const catScreenHeight = 148;
const MANUAL_COLLAPSE_COOLDOWN_MS = 60_000;
const MAX_REMINDER_WAKE_MS = 60_000;
const LOCK_IN_BLOCKER_DELAY_MS = 20_000;
const APP_DISPLAY_NAME = "别meow鱼";
const APP_USER_MODEL_ID = "com.nerve.biemeowyu";

app.setName(APP_DISPLAY_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const settingOptions = {
  aiProvider: ["deepseek"],
  screenshotIntervalSeconds: [10, 30, 60],
  stuckThresholdMinutes: [5, 8, 10],
  driftThresholdMinutes: [3, 6, 10],
  thinkingPauseMinutes: [3, 5, 10],
  panelOpacity: [0.3, 0.5, 0.8],
  language: ["en", "zh"],
  breakIntervalMinutes: [15, 25, 30, 45, 60, 90],
  breakDurationMinutes: [5, 10, 15, 20, 30]
} as const;

const dataDir = () => path.join(app.getPath("userData"), "NerveData");
const screenshotDir = () => path.join(dataDir(), "screenshots");
const dbPath = () => path.join(dataDir(), "nerve.sqlite");
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const validTaskTypes: TaskType[] = [
  "Essay writing",
  "General writing",
  "Coding",
  "Research",
  "Study",
  "Email or admin",
  "Presentation",
  "Personal / life",
  "Health / self-care",
  "Household / chores",
  "Errands",
  "Meals",
  "Pet care",
  "Exercise",
  "Social / communication",
  "Finance / bills",
  "Design or creative",
  "Planning",
  "Mixed work"
];

function canonicalTaskType(value: unknown, fallback: TaskType): TaskType {
  if (typeof value !== "string") return fallback;
  if (validTaskTypes.includes(value as TaskType) && value !== "Mixed work") return value as TaskType;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases: Record<string, TaskType> = {
    writing: "General writing",
    draft: "General writing",
    drafting: "General writing",
    code: "Coding",
    programming: "Coding",
    admin: "Email or admin",
    email: "Email or admin",
    presentation: "Presentation",
    slides: "Presentation",
    deck: "Presentation",
    shower: "Health / self-care",
    hygiene: "Health / self-care",
    medication: "Health / self-care",
    chore: "Household / chores",
    chores: "Household / chores",
    dinner: "Meals",
    lunch: "Meals",
    breakfast: "Meals",
    meal: "Meals",
    dog: "Pet care",
    cat: "Pet care",
    pet: "Pet care",
    walk: "Exercise",
    workout: "Exercise",
    finance: "Finance / bills",
    bill: "Finance / bills",
    bills: "Finance / bills",
    creative: "Design or creative",
    design: "Design or creative",
    "design creative": "Design or creative",
    "design / creative": "Design or creative"
  };
  return aliases[normalized] ?? fallback;
}

function normalizeTaskScopes(taskTypes: Array<TaskType | undefined>): TaskType[] {
  const scopes = taskTypes.filter((type): type is TaskType => Boolean(type) && validTaskTypes.includes(type as TaskType));
  const expanded = scopes.includes("Mixed work") ? scopes.filter((scope) => scope !== "Mixed work") : scopes;
  const unique = [...new Set(expanded)];
  return unique.length ? unique : ["General writing"];
}

function parseRoutineIntervalMinutes(text: string): number | null {
  const lower = text.toLowerCase();
  if (/\b(hourly|every hour)\b/.test(lower)) return 60;
  if (/\b(half hour|half-hour)\b/.test(lower)) return 30;
  const match = lower.match(/\b(?:every|each|repeat(?:s|ing)? every)\s+(\d{1,3})\s*(minutes?|mins?|m|hours?|hrs?|h)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minutes = /^h|hour|hr/.test(unit) ? amount * 60 : amount;
  return minutes >= 1 && minutes <= 24 * 60 ? minutes : null;
}

function normalizeRoutineInterval(value: unknown, text = ""): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  const explicit = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  const interval = explicit && explicit > 0 ? explicit : parseRoutineIntervalMinutes(text);
  return interval && interval >= 1 && interval <= 24 * 60 ? interval : null;
}

function nextRoutineTime(step: Pick<PlanStepDraft, "routineNextAt" | "reminderAt" | "dueAt">, intervalMinutes: number | null) {
  if (!intervalMinutes) return null;
  const explicit = validIso(step.routineNextAt) ?? validIso(step.reminderAt) ?? validIso(step.dueAt);
  if (explicit) return explicit;
  return new Date(Date.now() + intervalMinutes * 60_000).toISOString();
}

function inferTaskScopesFromText(text: string, selected: TaskType[] = []) {
  const selectedScopes = selected.filter((scope) => scope !== "Mixed work");
  const inferred: TaskType[] = [];
  const lower = text.toLowerCase();
  const add = (scope: TaskType, pattern: RegExp) => {
    if (pattern.test(lower) && !inferred.includes(scope)) inferred.push(scope);
  };
  add("Essay writing", /\b(essay|thesis|introduction|conclusion|paragraph)\b/i);
  add("Presentation", /\b(presentation|slides?|deck|powerpoint|keynote|present|rehearse)\b/i);
  add("Health / self-care", /\b(shower|hygiene|medication|medicine|doctor|therapy|sleep|nap|break|self care|self-care)\b/i);
  add("Household / chores", /\b(laundry|clean|dishes|trash|tidy|chores?|vacuum)\b/i);
  add("Errands", /\b(errand|pickup|return|store|shopping|groceries|pharmacy|post office)\b/i);
  add("Meals", /\b(dinner|lunch|breakfast|meal|cook|eat|food|recipe|delivery)\b/i);
  add("Pet care", /\b(dog|cat|pet|leash|feed|vet|litter)\b/i);
  add("Exercise", /\b(exercise|workout|gym|stretch|run|walk|yoga)\b/i);
  add("Social / communication", /\b(call|text|message|reply|dm|discord|whatsapp|wechat)\b/i);
  add("Finance / bills", /\b(bank|bill|payment|invoice|budget|rent|subscription|tax)\b/i);
  add("Design or creative", /\b(canva|figma|design|creative|prototype|video|audio|asset)\b/i);
  add("Research", /\b(research|source|article|paper|citation|math)\b/i);
  add("Study", /\b(homework|revise|study|quiz|exam|lecture|chapter)\b/i);
  add("Coding", /\b(code|bug|test|build|api|github|repo|typescript|python)\b/i);
  add("Email or admin", /\b(email|form|submit|application|invoice|pay|admin|portal)\b/i);
  return normalizeTaskScopes(inferred.length ? inferred : selectedScopes.length ? selectedScopes : ["General writing"]);
}

function scopesFromSteps(steps: PlanStepDraft[], fallback: TaskType[]) {
  return normalizeTaskScopes([
    ...fallback,
    ...steps.map((step) => step.taskType).filter((taskType): taskType is TaskType => Boolean(taskType))
  ]);
}

function extractTimeIso(text: string): string | null {
  // Match "at Xpm", "at X:YYpm", or bare "Xpm"/"X:YYpm" with meridian
  const match = text.match(/(?:\bat\s+|(?<=\s)|^)(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    ?? text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridian = match[3]?.toLowerCase();
  if (meridian === "pm" && hours < 12) hours += 12;
  if (meridian === "am" && hours === 12) hours = 0;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

// Finds all "Xpm" / "at Xpm" occurrences in text, returns each as { iso, index } sorted by position.
function extractAllTimesFromText(text: string): { iso: string; index: number }[] {
  const results: { iso: string; index: number }[] = [];
  const re = /(?:\bat\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let hours = parseInt(m[1], 10);
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    const meridian = m[3].toLowerCase();
    if (meridian === "pm" && hours < 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    results.push({ iso: d.toISOString(), index: m.index });
  }
  return results;
}

function normalizePlanSteps(steps: PlanStepDraft[], fallbackTaskType: TaskType, contextText = ""): PlanStepDraft[] {
  // Pre-extract all times from the goal text so we can assign unmatched ones to steps that have no dueAt.
  const goalTimes = contextText ? extractAllTimesFromText(contextText) : [];
  const usedGoalTimeIndices = new Set<number>();

  // Mark goal times already claimed by AI-returned dueAt values.
  for (const step of steps) {
    const claimed = validIso(step.dueAt);
    if (!claimed) continue;
    const claimedMs = Date.parse(claimed);
    const match = goalTimes.find(
      (t) => !usedGoalTimeIndices.has(t.index) && Math.abs(Date.parse(t.iso) - claimedMs) < 60_000
    );
    if (match) usedGoalTimeIndices.add(match.index);
  }

  const filtered = steps.filter((step) => step.title?.trim() && step.nextAction?.trim());

  return filtered.map((step) => {
    const routineText = `${step.title} ${step.nextAction} ${step.explanation ?? ""} ${step.deadlineText ?? ""} ${filtered.length === 1 ? contextText : ""}`;
    const routineIntervalMinutes = normalizeRoutineInterval(step.routineIntervalMinutes, routineText);
    const routineNextAt = nextRoutineTime(step, routineIntervalMinutes);

    const explicitDueText = typeof step.dueAt === "string" && step.dueAt.trim().length > 0;
    const explicitReminderText = typeof step.reminderAt === "string" && step.reminderAt.trim().length > 0;

    // Time resolution order: valid AI dueAt → step-level text → goal-proximity match → goal-order fallback.
    // If AI explicitly supplied an invalid date string, null it instead of guessing a replacement.
    let dueAt = explicitDueText ? validIso(step.dueAt) : validIso(step.dueAt) ?? extractTimeIso(`${step.title} ${step.deadlineText ?? ""}`);
    let deadlineText = step.deadlineText?.trim() || "";

    if (!dueAt && !explicitDueText && contextText) {
      // Find the nearest unassigned goal time to a keyword from the step title
      const keywords = step.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const goalLower = contextText.toLowerCase();
      let bestTime: { iso: string; index: number } | undefined;
      let bestDist = Infinity;
      for (const kw of keywords) {
        const kwPos = goalLower.indexOf(kw);
        if (kwPos === -1) continue;
        for (const t of goalTimes) {
          if (usedGoalTimeIndices.has(t.index)) continue;
          const dist = Math.abs(t.index - kwPos);
          if (dist < bestDist) { bestDist = dist; bestTime = t; }
        }
      }
      // Also try a simple first-available fallback when there's only one unassigned time and one step without a time
      if (!bestTime) {
        bestTime = goalTimes.find((t) => !usedGoalTimeIndices.has(t.index));
      }
      if (bestTime && bestDist < 60) {
        dueAt = bestTime.iso;
        usedGoalTimeIndices.add(bestTime.index);
        if (!deadlineText) {
          const snippet = contextText.slice(Math.max(0, bestTime.index - 3), bestTime.index + 8).trim();
          deadlineText = snippet;
        }
      }
    }

    const reminderAt = routineNextAt ?? (explicitReminderText ? validIso(step.reminderAt) : validIso(step.reminderAt) ?? (() => {
      return dueAt ? new Date(Date.parse(dueAt) - 15 * 60_000).toISOString() : null;
    })());

    return {
      title: step.title.trim(),
      nextAction: step.nextAction.trim(),
      explanation: step.explanation?.trim() || "One small step is enough.",
      taskType: canonicalTaskType(step.taskType, fallbackTaskType),
      deadlineText,
      dueAt,
      reminderAt,
      routineIntervalMinutes,
      routineNextAt
    };
  });
}

function scheduleTimeForStep(step: Pick<PlanStepDraft, "reminderAt" | "dueAt" | "routineNextAt">) {
  const routine = step.routineNextAt ? Date.parse(step.routineNextAt) : Number.POSITIVE_INFINITY;
  const reminder = step.reminderAt ? Date.parse(step.reminderAt) : Number.POSITIVE_INFINITY;
  const due = step.dueAt ? Date.parse(step.dueAt) : Number.POSITIVE_INFINITY;
  const firstScheduledTime = Math.min(
    Number.isFinite(routine) ? routine : Number.POSITIVE_INFINITY,
    Number.isFinite(reminder) ? reminder : Number.POSITIVE_INFINITY,
    Number.isFinite(due) ? due : Number.POSITIVE_INFINITY
  );
  return firstScheduledTime;
}

function sortPlanStepsBySchedule(steps: PlanStepDraft[]) {
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const diff = scheduleTimeForStep(a.step) - scheduleTimeForStep(b.step);
      return Number.isFinite(diff) ? diff : a.index - b.index;
    })
    .map(({ step }) => step);
}

function localDateTimeContext() {
  const date = new Date();
  return `${date.toLocaleString()} ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
}

function encryptApiKey(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return value;
  return `enc:${safeStorage.encryptString(value).toString("base64")}`;
}

function decryptApiKey(value: string): string {
  if (!value || !value.startsWith("enc:")) return value;
  try {
    if (!safeStorage.isEncryptionAvailable()) return value;
    return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
  } catch {
    return value;
  }
}

function ensureStorage() {
  fs.mkdirSync(screenshotDir(), { recursive: true });
  db = new Database(dbPath());
  orm = drizzle(db, { schema });
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, goal TEXT NOT NULL, task_type TEXT NOT NULL, deadline_text TEXT NOT NULL,
      status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      task_types_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, order_index INTEGER NOT NULL, title TEXT NOT NULL,
      next_action TEXT NOT NULL, explanation TEXT NOT NULL, status TEXT NOT NULL, atomization_level INTEGER NOT NULL,
      delay_count INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
      task_type TEXT NOT NULL DEFAULT 'General writing', deadline_text TEXT NOT NULL DEFAULT '',
      due_at TEXT, reminder_at TEXT, routine_interval_minutes INTEGER, routine_next_at TEXT
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, order_index INTEGER NOT NULL, title TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'General writing', deadline_text TEXT NOT NULL DEFAULT '',
      due_at TEXT, reminder_at TEXT, routine_interval_minutes INTEGER, routine_next_at TEXT, is_off_screen INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS guidance_steps (
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, session_id TEXT NOT NULL, order_index INTEGER NOT NULL,
      next_action TEXT NOT NULL, explanation TEXT NOT NULL, status TEXT NOT NULL, atomization_level INTEGER NOT NULL,
      delay_count INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS screenshots (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, file_path TEXT NOT NULL, thumbnail_path TEXT NOT NULL,
      captured_at TEXT NOT NULL, active_app TEXT NOT NULL, window_title TEXT NOT NULL,
      perceptual_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_observations (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, screenshot_id TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
      step_id TEXT,
      user_state TEXT NOT NULL, task_relevance TEXT NOT NULL, progress_state TEXT NOT NULL, active_app TEXT NOT NULL,
      active_context TEXT NOT NULL, visible_change_summary TEXT NOT NULL, concise_explanation TEXT NOT NULL,
      suggested_next_action TEXT NOT NULL, suggested_step_complete INTEGER NOT NULL, should_intervene INTEGER NOT NULL,
      intervention_type TEXT NOT NULL, urgency TEXT NOT NULL, breadcrumb_relevance TEXT NOT NULL,
      detected_task_type TEXT, raw_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL,
      metadata_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS breadcrumbs (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, app_name TEXT NOT NULL, window_title TEXT NOT NULL,
      relevance TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER
    );
    CREATE TABLE IF NOT EXISTS task_history (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, task_type TEXT NOT NULL, source TEXT NOT NULL,
      confidence TEXT NOT NULL, summary TEXT NOT NULL, step_id TEXT, active_app TEXT, window_title TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, step_id TEXT, task_type TEXT NOT NULL,
      title TEXT NOT NULL, message TEXT NOT NULL, deadline_text TEXT NOT NULL, due_at TEXT,
      reminder_at TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, triggered_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_steps_session ON steps(session_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_activities_session ON activities(session_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_guidance_activity ON guidance_steps(activity_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_screenshots_session ON screenshots(session_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_observations_session ON ai_observations(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_breadcrumbs_session ON breadcrumbs(session_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_task_history_session ON task_history(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_session ON reminders(session_id, reminder_at);
    CREATE TABLE IF NOT EXISTS connector_tokens (
      connector TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      email TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inbox_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      urgency TEXT NOT NULL DEFAULT 'low',
      suggested_task_type TEXT NOT NULL DEFAULT 'Email or admin',
      due_hint TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      extracted_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inbox_items_status ON inbox_items(status, extracted_at);
  `);
  ensureColumn("sessions", "task_types_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("steps", "task_type", "TEXT NOT NULL DEFAULT 'General writing'");
  ensureColumn("steps", "deadline_text", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("steps", "due_at", "TEXT");
  ensureColumn("steps", "reminder_at", "TEXT");
  ensureColumn("steps", "routine_interval_minutes", "INTEGER");
  ensureColumn("steps", "routine_next_at", "TEXT");
  ensureColumn("activities", "routine_interval_minutes", "INTEGER");
  ensureColumn("activities", "routine_next_at", "TEXT");
  ensureColumn("activities", "is_off_screen", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("sessions", "lock_in_mode", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("ai_observations", "step_id", "TEXT");
  ensureColumn("ai_observations", "detected_task_type", "TEXT");
  ensureColumn("reminders", "step_id", "TEXT");
  ensureColumn("reminders", "due_at", "TEXT");
  ensureColumn("reminders", "triggered_at", "TEXT");
  ensureColumn("connector_tokens", "email", "TEXT");
  ensureColumn("connector_tokens", "expires_at", "TEXT");
  ensureColumn("inbox_items", "description", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("inbox_items", "urgency", "TEXT NOT NULL DEFAULT 'low'");
  ensureColumn("inbox_items", "suggested_task_type", "TEXT NOT NULL DEFAULT 'Email or admin'");
  ensureColumn("inbox_items", "due_hint", "TEXT");
  ensureColumn("inbox_items", "status", "TEXT NOT NULL DEFAULT 'pending'");
  migrateLegacyStepsToActivities();
  for (const [key, value] of Object.entries(defaultSettings)) {
    orm.insert(settingsTable)
      .values({ key, value: JSON.stringify(value), updatedAt: now() })
      .onConflictDoNothing()
      .run();
  }
  applyUserRequestedDefaults();
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function migrateLegacyStepsToActivities() {
  const stepCount = (db.prepare("SELECT COUNT(*) count FROM steps").get() as { count: number }).count;
  const activityCount = (db.prepare("SELECT COUNT(*) count FROM activities").get() as { count: number }).count;
  if (!stepCount || activityCount) return;
  const timestamp = now();
  const rows = db.prepare("SELECT * FROM steps ORDER BY session_id, order_index").all() as any[];
  const insertActivity = db.prepare(`INSERT OR IGNORE INTO activities (
    id, session_id, order_index, title, task_type, deadline_text, due_at, reminder_at, status, created_at, updated_at, completed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertGuidance = db.prepare(`INSERT OR IGNORE INTO guidance_steps (
    id, activity_id, session_id, order_index, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at
  ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of rows) {
    insertActivity.run(
      row.id,
      row.session_id,
      row.order_index,
      row.title,
      row.task_type || "General writing",
      row.deadline_text || "",
      row.due_at,
      row.reminder_at,
      row.status,
      row.created_at || timestamp,
      row.updated_at || timestamp,
      row.completed_at
    );
    insertGuidance.run(
      `${row.id}:guidance:0`,
      row.id,
      row.session_id,
      row.next_action,
      row.explanation,
      row.status === "complete" ? "complete" : row.status === "active" ? "active" : "pending",
      row.atomization_level ?? 0,
      row.delay_count ?? 0,
      row.created_at || timestamp,
      row.updated_at || timestamp,
      row.completed_at
    );
  }
}

function applyUserRequestedDefaults() {
  const timestamp = now();
  for (const [key, value] of Object.entries({ aiProvider: "deepseek", screenshotIntervalSeconds: 10, panelOpacity: 0.5 })) {
    orm.insert(settingsTable)
      .values({ key, value: JSON.stringify(value), updatedAt: timestamp })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: JSON.stringify(value), updatedAt: timestamp }
      })
      .run();
  }
  const googleClientId = process.env.NERVE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
  const existingGoogleClientId = db.prepare("SELECT value FROM settings WHERE key = 'googleClientId'").get() as { value?: string } | undefined;
  const parsedGoogleClientId = existingGoogleClientId?.value ? JSON.parse(existingGoogleClientId.value) : "";
  if (typeof parsedGoogleClientId !== "string" || !parsedGoogleClientId.trim()) {
    orm.insert(settingsTable)
      .values({ key: "googleClientId", value: JSON.stringify(googleClientId), updatedAt: timestamp })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: JSON.stringify(googleClientId), updatedAt: timestamp }
      })
      .run();
  }
  const googleClientSecret = process.env.NERVE_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
  if (googleClientSecret) {
    const existingGoogleClientSecret = db.prepare("SELECT value FROM settings WHERE key = 'googleClientSecret'").get() as { value?: string } | undefined;
    const parsedGoogleClientSecret = existingGoogleClientSecret?.value ? JSON.parse(existingGoogleClientSecret.value) : "";
    if (typeof parsedGoogleClientSecret !== "string" || !parsedGoogleClientSecret.trim()) {
      orm.insert(settingsTable)
        .values({ key: "googleClientSecret", value: JSON.stringify(encryptApiKey(googleClientSecret)), updatedAt: timestamp })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: JSON.stringify(encryptApiKey(googleClientSecret)), updatedAt: timestamp }
        })
        .run();
    }
  }
  cachedSettings = null;
}

function registerLocalFileProtocol() {
  protocol.handle("nerve-file", (request) => {
    const url = new URL(request.url);
    const requestedPath = decodeURIComponent(url.pathname.slice(1));
    const resolvedPath = path.resolve(requestedPath);
    const allowedRoot = path.resolve(dataDir());
    const rel = path.relative(allowedRoot, resolvedPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(resolvedPath).toString());
  });
}

function rowSession(row: any): SessionRecord {
  const taskType = row.task_type as TaskType;
  const taskTypes = parseTaskTypes(row.task_types_json, taskType);
  return {
    id: row.id,
    goal: row.goal,
    taskType,
    taskTypes,
    deadlineText: row.deadline_text,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockInMode: Boolean(row.lock_in_mode)
  };
}

function rowStep(row: any): StepRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    orderIndex: row.order_index,
    title: row.title,
    nextAction: row.next_action,
    explanation: row.explanation,
    taskType: row.task_type || "General writing",
    deadlineText: row.deadline_text || "",
    dueAt: row.due_at,
    reminderAt: row.reminder_at,
    routineIntervalMinutes: row.routine_interval_minutes,
    routineNextAt: row.routine_next_at,
    status: row.status,
    atomizationLevel: row.atomization_level,
    delayCount: row.delay_count,
    isOffScreen: Boolean(row.is_off_screen),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function rowActivity(row: any): ActivityRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    orderIndex: row.order_index,
    title: row.title,
    taskType: row.task_type || "General writing",
    deadlineText: row.deadline_text || "",
    dueAt: row.due_at,
    reminderAt: row.reminder_at,
    routineIntervalMinutes: row.routine_interval_minutes,
    routineNextAt: row.routine_next_at,
    status: row.status,
    isOffScreen: Boolean(row.is_off_screen),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function rowGuidanceStep(row: any): GuidanceStepRecord {
  return {
    id: row.id,
    activityId: row.activity_id,
    sessionId: row.session_id,
    orderIndex: row.order_index,
    nextAction: row.next_action,
    explanation: row.explanation,
    status: row.status,
    atomizationLevel: row.atomization_level,
    delayCount: row.delay_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function rowActivityProjection(row: any): StepRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    orderIndex: row.order_index,
    title: row.title,
    nextAction: row.next_action || "Do one small physical action for this activity.",
    explanation: row.explanation || "Keep it small and concrete.",
    taskType: row.task_type || "General writing",
    deadlineText: row.deadline_text || "",
    dueAt: row.due_at,
    reminderAt: row.reminder_at,
    routineIntervalMinutes: row.routine_interval_minutes,
    routineNextAt: row.routine_next_at,
    status: row.status,
    atomizationLevel: row.atomization_level ?? 0,
    delayCount: row.delay_count ?? 0,
    isOffScreen: Boolean(row.is_off_screen),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function parseTaskTypes(value: string | null | undefined, fallback: TaskType): TaskType[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as TaskType[];
  } catch {
    /* older rows may not have multi-scope data */
  }
  return [fallback];
}

function rowScreenshot(row: any): ScreenshotRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    filePath: row.file_path,
    thumbnailPath: row.thumbnail_path,
    capturedAt: row.captured_at,
    activeApp: row.active_app,
    windowTitle: row.window_title,
    perceptualHash: row.perceptual_hash,
    aiState: row.ai_state,
    stepTitle: row.step_title,
    createdAt: row.created_at
  };
}

function screenshotFilesExist(row: { file_path: string; thumbnail_path: string }) {
  return fs.existsSync(row.file_path) && fs.existsSync(row.thumbnail_path);
}

function rowObservation(row: any): AIObservationRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    screenshotId: row.screenshot_id,
    stepId: row.step_id,
    provider: row.provider,
    model: row.model,
    userState: row.user_state,
    taskRelevance: row.task_relevance,
    progressState: row.progress_state,
    activeContext: row.active_context,
    visibleChangeSummary: row.visible_change_summary,
    conciseExplanation: row.concise_explanation,
    suggestedNextAction: row.suggested_next_action,
    suggestedStepComplete: Boolean(row.suggested_step_complete),
    shouldIntervene: Boolean(row.should_intervene),
    interventionType: row.intervention_type,
    urgency: row.urgency,
    breadcrumbRelevance: row.breadcrumb_relevance,
    detectedTaskType: row.detected_task_type,
    rawJson: row.raw_json,
    createdAt: row.created_at
  };
}

function rowEvent(row: any): EventRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    message: row.message,
    metadataJson: row.metadata_json,
    createdAt: row.created_at
  };
}

function rowBreadcrumb(row: any): BreadcrumbRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    appName: row.app_name,
    windowTitle: row.window_title,
    relevance: row.relevance,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds
  };
}

function rowTaskHistory(row: any): TaskHistoryRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    taskType: row.task_type,
    source: row.source,
    confidence: row.confidence,
    summary: row.summary,
    stepId: row.step_id,
    activeApp: row.active_app,
    windowTitle: row.window_title,
    createdAt: row.created_at
  };
}

function rowReminder(row: any): ReminderRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    stepId: row.step_id,
    taskType: row.task_type,
    title: row.title,
    message: row.message,
    deadlineText: row.deadline_text,
    dueAt: row.due_at,
    reminderAt: row.reminder_at,
    status: row.status,
    createdAt: row.created_at,
    triggeredAt: row.triggered_at
  };
}

function getSettings(): NerveSettings {
  if (cachedSettings) return cachedSettings;
  const rows = orm.select().from(settingsTable).all();
  const settings = { ...defaultSettings } as Record<string, unknown>;
  for (const row of rows) settings[row.key] = JSON.parse(row.value);
  const result = settings as unknown as NerveSettings;
  result.deepseekApiKey = decryptApiKey(result.deepseekApiKey ?? "");
  result.elevenLabsApiKey = decryptApiKey(result.elevenLabsApiKey ?? "");
  result.googleClientSecret = decryptApiKey(result.googleClientSecret ?? "");
  cachedSettings = result;
  return cachedSettings;
}

function getConnectorTokenRow(connector: string): { accessToken: string | null; refreshToken: string | null; email: string | null; expiresAt: string | null } | null {
  const row = db.prepare("SELECT * FROM connector_tokens WHERE connector = ?").get(connector) as any;
  if (!row) return null;
  return {
    accessToken: row.access_token ?? null,
    refreshToken: row.refresh_token ?? null,
    email: row.email ?? null,
    expiresAt: row.expires_at ?? null
  };
}

function getConnectorStatuses(): ConnectorStatus[] {
  const gmail = getConnectorTokenRow("gmail");
  return [{
    name: "gmail",
    connected: gmail !== null && gmail.accessToken !== null,
    lastFetchedAt: null,
    email: gmail?.email ?? null,
    error: null
  }];
}

function getVisibleInboxItems(): ActionItem[] {
  const rows = db.prepare("SELECT * FROM inbox_items WHERE status IN ('pending', 'promoted') ORDER BY extracted_at DESC LIMIT 50").all() as any[];
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    source: r.source as ConnectorName,
    sourceMessageId: r.source_message_id,
    urgency: r.urgency as "low" | "medium" | "high",
    suggestedTaskType: r.suggested_task_type,
    dueHint: r.due_hint ?? undefined,
    extractedAt: r.extracted_at,
    status: r.status as "pending" | "promoted" | "dismissed"
  }));
}

async function getValidGmailAccessToken(): Promise<string | null> {
  const settings = getSettings();
  if (!settings.googleClientId) return null;
  const row = getConnectorTokenRow("gmail");
  if (!row?.accessToken) return null;
  // Check expiry (refresh if within 5 minutes of expiring)
  if (row.expiresAt && new Date(row.expiresAt).getTime() - Date.now() < 5 * 60 * 1000) {
    if (!row.refreshToken) return null;
    try {
      const { accessToken, expiresAt } = await refreshGmailToken(settings.googleClientId, row.refreshToken, settings.googleClientSecret);
      const encryptedAccess = encryptToken(accessToken);
      db.prepare("UPDATE connector_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE connector = 'gmail'")
        .run(encryptedAccess, expiresAt, now());
      return accessToken;
    } catch {
      return null;
    }
  }
  return row.accessToken.startsWith("enc:") ? decryptToken(row.accessToken) : row.accessToken;
}

async function extractActionItemsFromMessages(messages: RawGmailMessage[]): Promise<ActionItem[]> {
  if (!messages.length) return [];
  const settings = getSettings();
  const messagesSummary = messages.map((m, i) =>
    `[${i + 1}] Gmail ID: ${m.id}\nFrom: ${m.sender}\nSubject: ${m.subject}\nReceived: ${m.receivedAt}\nBody excerpt: ${m.body.slice(0, 500)}`
  ).join("\n\n---\n\n");

  const prompt = `You are an ADHD assistant. Extract concrete action items from these emails.
For each action item, return a JSON object with:
- title: short action phrase (5-10 words)
- description: 1-2 sentence context
- source: "gmail"
- sourceMessageId: the exact Gmail ID shown for the email
- urgency: "low" | "medium" | "high"
- suggestedTaskType: one of: "Essay writing", "General writing", "Coding", "Research", "Study", "Email or admin", "Presentation", "Personal / life", "Health / self-care", "Household / chores", "Errands", "Meals", "Pet care", "Exercise", "Social / communication", "Finance / bills", "Design or creative", "Planning", "Mixed work"
- dueHint: optional deadline hint extracted from email (e.g. "by Friday", null if none)

Return a JSON array. Only include items that genuinely require user action. Skip newsletters, receipts, and FYI emails.

EMAILS:
${messagesSummary}

Return ONLY valid JSON array.`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.deepseekApiKey}`
      },
      body: JSON.stringify({
        model: settings.deepseekModel || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      })
    });
    if (!response.ok) return [];
    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const items = JSON.parse(match[0]) as any[];
    const nowStr = now();
    const messageIds = new Set(messages.map((message) => message.id));
    const indexToMessageId = new Map(messages.map((message, index) => [String(index + 1), message.id]));
    return items.map((item: any) => ({
      id: id(),
      title: String(item.title ?? "").slice(0, 200),
      description: String(item.description ?? "").slice(0, 500),
      source: "gmail" as const,
      sourceMessageId: resolveSourceMessageId(item.sourceMessageId, messageIds, indexToMessageId),
      urgency: (["low", "medium", "high"].includes(item.urgency) ? item.urgency : "low") as "low" | "medium" | "high",
      suggestedTaskType: canonicalTaskType(item.suggestedTaskType, "Email or admin"),
      dueHint: item.dueHint ? String(item.dueHint).slice(0, 100) : undefined,
      extractedAt: nowStr,
      status: "pending" as const
    })).filter((item) => item.title && item.sourceMessageId);
  } catch {
    return [];
  }
}

function resolveSourceMessageId(value: unknown, messageIds: Set<string>, indexToMessageId: Map<string, string>): string {
  const raw = String(value ?? "").trim();
  if (messageIds.has(raw)) return raw;
  return indexToMessageId.get(raw) ?? "";
}

async function fetchGoogleCalendarEvents(accessToken: string): Promise<ActionItem[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=20`;
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return [];
    const data = await response.json() as any;
    const events = (data.items ?? []) as any[];
    const nowStr = now();
    const nowMs = Date.now();
    return events
      .filter((event) => event.id && event.start && (event.start.dateTime || event.start.date))
      .map((event) => {
        const startStr: string = event.start.dateTime || event.start.date;
        const startMs = Date.parse(startStr);
        const diffH = Number.isFinite(startMs) ? (startMs - nowMs) / 3_600_000 : 999;
        const urgency: "low" | "medium" | "high" = diffH <= 2 ? "high" : diffH <= 24 ? "medium" : "low";
        const title = String(event.summary ?? "Calendar event").slice(0, 200);
        const startLabel = Number.isFinite(startMs) ? new Date(startMs).toLocaleString() : startStr;
        return {
          id: id(),
          title,
          description: `${startLabel} — ${String(event.description ?? "Calendar event").slice(0, 400)}`,
          source: "calendar" as ConnectorName,
          sourceMessageId: String(event.id),
          urgency,
          suggestedTaskType: "Planning" as TaskType,
          dueHint: startLabel,
          extractedAt: nowStr,
          status: "pending" as const
        };
      });
  } catch {
    return [];
  }
}

function updateSettings(patch: Partial<NerveSettings>): NerveSettings {
  const normalized = normalizeSettingsPatch(patch);
  for (const [key, value] of Object.entries(normalized)) {
    orm.insert(settingsTable)
      .values({ key, value: JSON.stringify(value), updatedAt: now() })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: JSON.stringify(value), updatedAt: now() }
      })
      .run();
  }
  cachedSettings = null;
  if ("language" in normalized) {
    voiceHistory = [];
    voiceGuidance = null;
    voiceState = "idle";
  }
  // Reschedule or clear break reminders whenever the relevant settings change
  if ("breakRemindersEnabled" in normalized || "breakIntervalMinutes" in normalized || "breakDurationMinutes" in normalized) {
    const fresh = getSettings();
    if (!fresh.breakRemindersEnabled) {
      clearBreakSchedule();
    } else if (!breakReminderAt && !breakEndsAt) {
      scheduleNextBreak(fresh);
    }
  }
  resetCaptureLoop();
  resetReminderLoop();
  broadcast();
  return getSettings();
}

function normalizeSettingsPatch(patch: Partial<NerveSettings>): Partial<NerveSettings> {
  const normalized: Partial<NerveSettings> = {};
  if (patch.aiProvider && settingOptions.aiProvider.includes(patch.aiProvider)) {
    normalized.aiProvider = patch.aiProvider;
  }
  if (typeof patch.deepseekApiKey === "string") {
    normalized.deepseekApiKey = encryptApiKey(patch.deepseekApiKey.trim());
  }
  if (typeof patch.deepseekModel === "string" && patch.deepseekModel.trim()) {
    normalized.deepseekModel = patch.deepseekModel.trim();
  }
  if (typeof patch.elevenLabsApiKey === "string") {
    normalized.elevenLabsApiKey = encryptApiKey(patch.elevenLabsApiKey.trim());
  }
  if (typeof patch.elevenLabsVoiceId === "string") {
    normalized.elevenLabsVoiceId = patch.elevenLabsVoiceId.trim();
  }
  if (
    patch.screenshotIntervalSeconds &&
    settingOptions.screenshotIntervalSeconds.includes(patch.screenshotIntervalSeconds)
  ) {
    normalized.screenshotIntervalSeconds = patch.screenshotIntervalSeconds;
  }
  if (patch.stuckThresholdMinutes && settingOptions.stuckThresholdMinutes.includes(patch.stuckThresholdMinutes)) {
    normalized.stuckThresholdMinutes = patch.stuckThresholdMinutes;
  }
  if (patch.driftThresholdMinutes && settingOptions.driftThresholdMinutes.includes(patch.driftThresholdMinutes)) {
    normalized.driftThresholdMinutes = patch.driftThresholdMinutes;
  }
  if (patch.thinkingPauseMinutes && settingOptions.thinkingPauseMinutes.includes(patch.thinkingPauseMinutes)) {
    normalized.thinkingPauseMinutes = patch.thinkingPauseMinutes;
  }
  if (patch.panelOpacity && settingOptions.panelOpacity.includes(patch.panelOpacity)) {
    normalized.panelOpacity = patch.panelOpacity;
  }
  if (typeof patch.storeScreenshots === "boolean") {
    normalized.storeScreenshots = patch.storeScreenshots;
  }
  if (patch.language && settingOptions.language.includes(patch.language)) {
    normalized.language = patch.language;
  }
  if (typeof patch.bannedSitesEnabled === "boolean") {
    normalized.bannedSitesEnabled = patch.bannedSitesEnabled;
    if (!patch.bannedSitesEnabled) {
      bannedSiteAlert = null;
      hideBlockerWindow();
      lastBannedSiteEventKey = null;
    }
  }
  if (Array.isArray(patch.bannedSites)) {
    normalized.bannedSites = patch.bannedSites
      .map((site) => (typeof site === "string" ? site.trim().toLowerCase() : ""))
      .map((site) => site.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter((site, index, sites) => site.length > 2 && /^[a-z0-9.*-]+(?:\.[a-z0-9-]+)+$/.test(site) && sites.indexOf(site) === index)
      .slice(0, 80);
  }
  if (typeof patch.soundEnabled === "boolean") {
    normalized.soundEnabled = patch.soundEnabled;
  }
  if (typeof patch.gmailEnabled === "boolean") {
    normalized.gmailEnabled = patch.gmailEnabled;
  }
  if (typeof patch.googleClientId === "string") {
    normalized.googleClientId = patch.googleClientId.trim();
  }
  if (typeof patch.googleClientSecret === "string") {
    normalized.googleClientSecret = encryptApiKey(patch.googleClientSecret.trim());
  }
  if (typeof patch.breakRemindersEnabled === "boolean") {
    normalized.breakRemindersEnabled = patch.breakRemindersEnabled;
  }
  if (patch.breakIntervalMinutes && (settingOptions.breakIntervalMinutes as readonly number[]).includes(patch.breakIntervalMinutes)) {
    normalized.breakIntervalMinutes = patch.breakIntervalMinutes;
  }
  if (patch.breakDurationMinutes && (settingOptions.breakDurationMinutes as readonly number[]).includes(patch.breakDurationMinutes)) {
    normalized.breakDurationMinutes = patch.breakDurationMinutes;
  }
  if (typeof patch.defaultLockInMode === "boolean") {
    normalized.defaultLockInMode = patch.defaultLockInMode;
  }
  return normalized;
}

function getActiveSession(): SessionRecord | null {
  const row = db.prepare("SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1").get();
  return row ? rowSession(row) : null;
}

function getResumableSession(): SessionRecord | null {
  const row = db.prepare("SELECT * FROM sessions WHERE status IN ('active', 'paused') ORDER BY updated_at DESC LIMIT 1").get();
  return row ? rowSession(row) : null;
}

function getSessionById(sessionId: string): SessionRecord | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  return row ? rowSession(row) : null;
}

function getCurrentSession(): SessionRecord | null {
  const current = activeSessionId ? getSessionById(activeSessionId) : null;
  if (current) return current;
  const active = getActiveSession();
  if (active) return active;
  return getResumableSession();
}

function getCurrentActiveSession(): SessionRecord | null {
  const session = getCurrentSession();
  return session?.status === "active" ? session : null;
}

function isCurrentSessionActive(sessionId: string) {
  return getCurrentActiveSession()?.id === sessionId;
}

function getSessionLog(sessionId: string): import("@nerve/shared").SessionLogData | null {
  const sessionRow = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
  if (!sessionRow) return null;
  const events = (db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC").all(sessionId) as any[]).map(rowEvent);
  const breadcrumbs = (db.prepare("SELECT * FROM breadcrumbs WHERE session_id = ? ORDER BY started_at ASC").all(sessionId) as any[]).map(rowBreadcrumb);
  const steps = (db.prepare("SELECT * FROM activities WHERE session_id = ? ORDER BY order_index ASC").all(sessionId) as any[]).map(rowStep);
  return { session: rowSession(sessionRow), events, breadcrumbs, steps };
}

function getSessionSummaries(limit = 60): SessionSummaryRecord[] {
  const rows = db
    .prepare(
      `SELECT
        s.*,
        COUNT(DISTINCT a.id) step_count,
        COUNT(DISTINCT CASE WHEN a.status = 'complete' THEN a.id END) completed_step_count,
        COUNT(DISTINCT sc.id) screenshot_count,
        COUNT(DISTINCT o.id) observation_count,
        COUNT(DISTINCT CASE WHEN o.user_state IN ('productive_drift', 'unproductive_drift') THEN o.id END) drift_count,
        (SELECT e.type FROM events e WHERE e.session_id = s.id ORDER BY e.created_at DESC LIMIT 1) last_event_type
      FROM sessions s
      LEFT JOIN activities a ON a.session_id = s.id
      LEFT JOIN screenshots sc ON sc.session_id = s.id
      LEFT JOIN ai_observations o ON o.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT ?`
    )
    .all(limit) as any[];
  return rows.map((row) => {
    const session = rowSession(row);
    const stepCount = Number(row.step_count || 0);
    const completedStepCount = Number(row.completed_step_count || 0);
    const endTime = session.endedAt ?? (session.status === "completed" ? session.updatedAt : now());
    const durationSeconds = Math.max(0, Math.round((Date.parse(endTime) - Date.parse(session.startedAt)) / 1000));
    return {
      ...session,
      stepCount,
      completedStepCount,
      completionRate: stepCount ? completedStepCount / stepCount : 0,
      durationSeconds,
      screenshotCount: Number(row.screenshot_count || 0),
      observationCount: Number(row.observation_count || 0),
      driftCount: Number(row.drift_count || 0),
      lastEventType: row.last_event_type ?? null
    };
  });
}

function getSteps(sessionId: string): StepRecord[] {
  return (db.prepare(`
    SELECT a.*, g.next_action, g.explanation, g.atomization_level, g.delay_count
    FROM activities a
    LEFT JOIN guidance_steps g ON g.id = (
      SELECT id FROM guidance_steps
      WHERE activity_id = a.id AND status IN ('active', 'pending')
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, order_index
      LIMIT 1
    )
    WHERE a.session_id = ?
    ORDER BY a.order_index
  `).all(sessionId) as any[]).map(rowActivityProjection);
}

function getActiveStep(sessionId: string): StepRecord | null {
  const row = db.prepare(`
    SELECT a.*, g.next_action, g.explanation, g.atomization_level, g.delay_count
    FROM activities a
    LEFT JOIN guidance_steps g ON g.id = (
      SELECT id FROM guidance_steps
      WHERE activity_id = a.id AND status IN ('active', 'pending')
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, order_index
      LIMIT 1
    )
    WHERE a.session_id = ? AND a.status = 'active'
    ORDER BY a.order_index LIMIT 1
  `).get(sessionId);
  return row ? rowActivityProjection(row) : null;
}

function getActivities(sessionId: string): ActivityRecord[] {
  return (db.prepare("SELECT * FROM activities WHERE session_id = ? ORDER BY order_index").all(sessionId) as any[]).map(rowActivity);
}

function getGuidanceSteps(sessionId: string): GuidanceStepRecord[] {
  return (db.prepare("SELECT * FROM guidance_steps WHERE session_id = ? ORDER BY activity_id, order_index").all(sessionId) as any[]).map(rowGuidanceStep);
}

function getActiveGuidanceStep(activityId: string): GuidanceStepRecord | null {
  const row = db.prepare(`
    SELECT * FROM guidance_steps
    WHERE activity_id = ? AND status IN ('active', 'pending')
    ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, order_index
    LIMIT 1
  `).get(activityId);
  return row ? rowGuidanceStep(row) : null;
}

function setActiveActivity(sessionId: string, activityId: string) {
  const target = db.prepare("SELECT * FROM activities WHERE id = ? AND session_id = ? AND status != 'complete'").get(activityId, sessionId) as any;
  if (!target) return getActiveStep(sessionId);
  const timestamp = now();
  db.prepare("UPDATE activities SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'active' AND id != ?").run(
    timestamp,
    sessionId,
    activityId
  );
  db.prepare("UPDATE guidance_steps SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'active' AND activity_id != ?").run(
    timestamp,
    sessionId,
    activityId
  );
  db.prepare("UPDATE activities SET status = 'active', completed_at = NULL, updated_at = ? WHERE id = ?").run(timestamp, activityId);
  const guidance = getActiveGuidanceStep(activityId);
  if (guidance) {
    db.prepare("UPDATE guidance_steps SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, guidance.id);
  }
  clearDelayTimer();
  thinkingPauseUntil = null;
  addTaskHistory(
    sessionId,
    (target.task_type || "General writing") as TaskType,
    "step_active",
    "high",
    `Active step changed: ${target.title}`,
    { stepId: target.id }
  );
  return getActiveStep(sessionId);
}

function ensureHighestPriorityActive(sessionId: string) {
  const rows = db
    .prepare("SELECT * FROM activities WHERE session_id = ? AND status IN ('active', 'pending') ORDER BY order_index")
    .all(sessionId) as any[];
  if (rows.length === 0) return activateNextPendingStep(sessionId);
  const firstReady = rows.find(isRoutineReady);
  if (!firstReady) {
    const active = rows.find((row) => row.status === "active");
    if (active) {
      const timestamp = now();
      db.prepare("UPDATE activities SET status = 'pending', updated_at = ? WHERE id = ?").run(timestamp, active.id);
      db.prepare("UPDATE guidance_steps SET status = 'pending', updated_at = ? WHERE activity_id = ? AND status = 'active'").run(timestamp, active.id);
    }
    return null;
  }
  if (firstReady.status === "active") return getActiveStep(sessionId);
  return setActiveActivity(sessionId, firstReady.id);
}

function activateNextPendingStep(sessionId: string, afterOrderIndex = -1) {
  const timestamp = now();
  const nextSteps = db
    .prepare(
      `SELECT * FROM activities
       WHERE session_id = ? AND status = 'pending' AND order_index > ?
       ORDER BY order_index`
    )
    .all(sessionId, afterOrderIndex) as any[];
  const nextStep = nextSteps.find(isRoutineReady);
  const fallbackStep =
    nextStep ??
    (db
      .prepare("SELECT * FROM activities WHERE session_id = ? AND status = 'pending' ORDER BY order_index")
      .all(sessionId) as any[]).find(isRoutineReady);
  if (fallbackStep) {
    db.prepare("UPDATE activities SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, fallbackStep.id);
    db.prepare(`UPDATE guidance_steps SET status = 'active', updated_at = ? WHERE id = (
      SELECT id FROM guidance_steps WHERE activity_id = ? AND status != 'complete' ORDER BY order_index LIMIT 1
    )`).run(timestamp, fallbackStep.id);
    addTaskHistory(
      sessionId,
      (fallbackStep.task_type || "General writing") as TaskType,
      "step_active",
      "high",
      `Active step changed: ${fallbackStep.title}`,
      { stepId: fallbackStep.id }
    );
    return getActiveStep(sessionId);
  }
  const hasFutureRoutine = (db
    .prepare("SELECT * FROM activities WHERE session_id = ? AND status = 'pending' ORDER BY order_index")
    .all(sessionId) as any[]).some((row) => !isRoutineReady(row));
  if (hasFutureRoutine) return null;
  db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, sessionId);
  if (activeSessionId === sessionId) stopSessionLoops();
  return null;
}

function addEvent(sessionId: string, type: string, message: string, metadata: Record<string, unknown> = {}) {
  db.prepare("INSERT INTO events (id, session_id, type, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id(),
    sessionId,
    type,
    message,
    JSON.stringify(metadata),
    now()
  );
}

function addTaskHistory(
  sessionId: string,
  taskType: TaskType,
  source: TaskHistoryRecord["source"],
  confidence: TaskHistoryRecord["confidence"],
  summary: string,
  details: { stepId?: string | null; activeApp?: string | null; windowTitle?: string | null } = {}
) {
  const recent = db
    .prepare("SELECT task_type, source, summary FROM task_history WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(sessionId) as { task_type: string; source: string; summary: string } | undefined;
  if (recent?.task_type === taskType && recent.source === source && recent.summary === summary) return;
  db.prepare(`INSERT INTO task_history (
    id, session_id, task_type, source, confidence, summary, step_id, active_app, window_title, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id(),
    sessionId,
    taskType,
    source,
    confidence,
    summary,
    details.stepId ?? null,
    details.activeApp ?? null,
    details.windowTitle ?? null,
    now()
  );
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function reminderAtForStep(step: Pick<StepRecord, "dueAt" | "reminderAt">) {
  const explicit = validIso(step.reminderAt);
  if (explicit) return explicit;
  return null;
}

function isRoutineStep(step: Pick<StepRecord, "routineIntervalMinutes"> | any) {
  return Number(step.routineIntervalMinutes ?? step.routine_interval_minutes ?? 0) > 0;
}

function isRoutineReady(row: any) {
  if (!isRoutineStep(row)) return true;
  const nextAt = row.routineNextAt ?? row.routine_next_at;
  return !nextAt || Date.parse(nextAt) <= Date.now();
}

function nextRoutineOccurrence(step: Pick<StepRecord, "routineNextAt" | "routineIntervalMinutes">) {
  const interval = Number(step.routineIntervalMinutes ?? 0);
  if (!interval) return null;
  return new Date(Date.now() + interval * 60_000).toISOString();
}

function moveActivityToTop(sessionId: string, activityId: string) {
  const row = db.prepare("SELECT order_index FROM activities WHERE id = ? AND session_id = ?").get(activityId, sessionId) as { order_index: number } | undefined;
  if (!row || row.order_index === 0) return;
  const timestamp = now();
  db.prepare("UPDATE activities SET order_index = order_index + 1, updated_at = ? WHERE session_id = ? AND id != ? AND order_index < ?").run(
    timestamp,
    sessionId,
    activityId,
    row.order_index
  );
  db.prepare("UPDATE activities SET order_index = 0, updated_at = ? WHERE id = ?").run(timestamp, activityId);
}

function syncStepReminder(step: StepRecord) {
  db.prepare("DELETE FROM reminders WHERE step_id = ? AND status = 'scheduled'").run(step.id);
  if (step.status === "complete") return;
  const routineTimes = [validIso(step.reminderAt), validIso(step.routineNextAt)]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const routineReminderAt = step.routineIntervalMinutes ? routineTimes[0] ?? null : null;
  const reminderAt = routineReminderAt ?? reminderAtForStep(step);
  if (!reminderAt) return;
  const dueAt = validIso(step.dueAt);
  const deadlineText = step.deadlineText || (dueAt ? new Date(dueAt).toLocaleString() : "");
  const routine = Boolean(routineReminderAt);
  db.prepare(`INSERT INTO reminders (
    id, session_id, step_id, task_type, title, message, deadline_text, due_at, reminder_at, status, created_at, triggered_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, NULL)`).run(
    id(),
    step.sessionId,
    step.id,
    step.taskType,
    step.title,
    routine ? `Routine check: ${step.nextAction}` : `Next up: ${step.nextAction}`,
    deadlineText,
    dueAt,
    reminderAt,
    now()
  );
}

function addPlanStepFromSuggestion(input: {
  sessionId: string;
  title: string;
  nextAction: string;
  explanation: string;
  taskType: TaskType;
  deadlineText?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  eventType: string;
  eventMessage: string;
}) {
  const reminderAt = validIso(input.reminderAt);
  const dueAt = validIso(input.dueAt);
  if (!reminderAt && !dueAt) throw new Error("Choose a schedule time before adding this to the plan.");
  const session = getSessionById(input.sessionId);
  if (!session || !["active", "paused"].includes(session.status)) {
    throw new Error("No active plan right now. Make a plan from the main page first, then add this.");
  }
  const title = input.title.trim().slice(0, 180);
  const nextAction = input.nextAction.trim().slice(0, 500);
  if (!title || !nextAction) throw new Error("A title and next action are required.");
  const nextIndexRow = db.prepare("SELECT COALESCE(MAX(order_index), -1) + 1 idx FROM activities WHERE session_id = ?").get(input.sessionId) as { idx: number };
  const timestamp = now();
  const activityId = id();
  db.prepare("INSERT INTO activities (id, session_id, order_index, title, task_type, deadline_text, due_at, reminder_at, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)").run(
    activityId,
    input.sessionId,
    Number(nextIndexRow.idx),
    title,
    input.taskType,
    input.deadlineText ?? "",
    dueAt,
    reminderAt,
    timestamp,
    timestamp
  );
  db.prepare("INSERT INTO guidance_steps (id, activity_id, session_id, order_index, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, 'pending', 0, 0, ?, ?, NULL)").run(
    id(),
    activityId,
    input.sessionId,
    nextAction,
    input.explanation.trim().slice(0, 500) || "Return to this note when the reminder fires.",
    timestamp,
    timestamp
  );
  const step = getSteps(input.sessionId).find((candidate) => candidate.id === activityId);
  if (step) syncStepReminder(step);
  addEvent(input.sessionId, input.eventType, input.eventMessage, { stepId: activityId, dueAt, reminderAt });
  return activityId;
}

function getOrCreateInboxCalendarSession(): SessionRecord {
  const current = getCurrentSession();
  if (current && ["active", "paused"].includes(current.status)) return current;
  const resumable = getResumableSession();
  if (resumable) return resumable;

  const timestamp = now();
  const sessionId = id();
  const taskType: TaskType = "Email or admin";
  const taskTypes: TaskType[] = [taskType];
  db.prepare("INSERT INTO sessions (id, goal, task_type, task_types_json, deadline_text, status, started_at, ended_at, created_at, updated_at, lock_in_mode) VALUES (?, ?, ?, ?, '', 'paused', ?, NULL, ?, ?, 0)").run(
    sessionId,
    "Inbox calendar",
    taskType,
    JSON.stringify(taskTypes),
    timestamp,
    timestamp,
    timestamp
  );
  activeSessionId = sessionId;
  addEvent(sessionId, "inbox_calendar_created", "Inbox calendar created for scheduled email items.", {});
  return rowSession(db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId));
}

function activateReminderStep(reminder: ReminderRecord) {
  if (!reminder.stepId) return;
  const step = db.prepare("SELECT * FROM activities WHERE id = ?").get(reminder.stepId) as any;
  if (!step || step.status === "complete") return;
  const timestamp = now();
  db.prepare("UPDATE activities SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'active'").run(timestamp, reminder.sessionId);
  db.prepare("UPDATE guidance_steps SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'active'").run(timestamp, reminder.sessionId);
  db.prepare("UPDATE activities SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, reminder.stepId);
  const guidance = getActiveGuidanceStep(reminder.stepId) ?? db.prepare("SELECT * FROM guidance_steps WHERE activity_id = ? ORDER BY order_index LIMIT 1").get(reminder.stepId) as any;
  if (guidance) db.prepare("UPDATE guidance_steps SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, guidance.id);
  db.prepare("UPDATE sessions SET status = 'active', ended_at = NULL, updated_at = ? WHERE id = ?").run(timestamp, reminder.sessionId);
  activeSessionId = reminder.sessionId;
}

function checkReminders() {
  const session = getCurrentActiveSession();
  if (!session) return false;
  const timestamp = now();
  const rows = db
    .prepare(`SELECT r.* FROM reminders r JOIN sessions s ON s.id = r.session_id WHERE r.status = 'scheduled' AND r.reminder_at <= ? AND s.status = 'active' AND r.session_id = ? ORDER BY r.reminder_at LIMIT 10`)
    .all(timestamp, session.id) as any[];
  for (const row of rows) {
    const reminder = rowReminder(row);
    db.prepare("UPDATE reminders SET status = 'triggered', triggered_at = ? WHERE id = ?").run(timestamp, reminder.id);
    const reminderStep = reminder.stepId ? getSteps(reminder.sessionId).find((step) => step.id === reminder.stepId) : null;
    const routineReminder = Boolean(reminderStep?.routineIntervalMinutes);
    addEvent(reminder.sessionId, "deadline_reminder_triggered", reminder.title, {
      title: reminder.title,
      stepId: reminder.stepId,
      taskType: reminder.taskType,
      dueAt: reminder.dueAt,
      reminderAt: reminder.reminderAt,
      routine: routineReminder
    });
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: routineReminder ? "别Meow鱼 routine" : "别Meow鱼 reminder",
        body: reminder.dueAt ? `${reminder.title} is due ${new Date(reminder.dueAt).toLocaleTimeString()}. ${reminder.message}` : reminder.message,
        silent: false
      });
      notification.on("click", () => createMainWindow("/log"));
      notification.show();
    }
    if (reminderStep?.routineIntervalMinutes && reminder.stepId) {
      moveActivityToTop(reminder.sessionId, reminder.stepId);
      const activeAfter = setActiveActivity(reminder.sessionId, reminder.stepId);
      if (activeAfter) {
        addEvent(reminder.sessionId, "routine_promoted", `Routine is due now: ${activeAfter.title}.`, { stepId: activeAfter.id });
      }
    }
    overlayExpanded = true;
  }
  const breakChanged = checkBreakReminders();
  let routinePromoted = false;
  const dueRoutines = db.prepare(`
    SELECT * FROM activities
    WHERE session_id = ? AND status = 'pending' AND routine_next_at IS NOT NULL AND routine_next_at <= ?
    ORDER BY routine_next_at ASC LIMIT 5
  `).all(session.id, timestamp) as any[];
  for (const row of dueRoutines) {
    moveActivityToTop(session.id, row.id);
    const activeAfter = setActiveActivity(session.id, row.id);
    if (activeAfter) {
      addEvent(session.id, "routine_promoted", `Routine is due now: ${activeAfter.title}.`, { stepId: activeAfter.id });
      routinePromoted = true;
    }
  }
  const changed = rows.length > 0 || breakChanged || routinePromoted;
  if (changed) broadcast();
  return changed;
}

function nextReminderWakeDelay(sessionId: string) {
  const wakeTimes: number[] = [];
  const nextReminder = db
    .prepare("SELECT reminder_at FROM reminders WHERE session_id = ? AND status = 'scheduled' ORDER BY reminder_at LIMIT 1")
    .get(sessionId) as { reminder_at: string } | undefined;
  const nextRoutine = db
    .prepare("SELECT routine_next_at FROM activities WHERE session_id = ? AND status = 'pending' AND routine_next_at IS NOT NULL ORDER BY routine_next_at LIMIT 1")
    .get(sessionId) as { routine_next_at: string } | undefined;
  for (const value of [nextReminder?.reminder_at, nextRoutine?.routine_next_at, breakEndsAt, breakReminderAt]) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) wakeTimes.push(parsed);
  }
  if (wakeTimes.length === 0) return MAX_REMINDER_WAKE_MS;
  const soonest = Math.min(...wakeTimes);
  return Math.min(MAX_REMINDER_WAKE_MS, Math.max(0, soonest - Date.now()));
}

function resetReminderLoop() {
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = null;
  const session = getCurrentActiveSession();
  if (!session) {
    clearBreakSchedule();
    return;
  }
  checkReminders();
  const active = getCurrentActiveSession();
  if (!active) return;
  reminderTimer = setTimeout(resetReminderLoop, nextReminderWakeDelay(active.id));
}

function provider(settings = getSettings()): AIProvider {
  return new DeepSeekAIProvider(settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "", settings.deepseekModel || process.env.DEEPSEEK_MODEL || "deepseek-chat");
}

const analysisService = new AnalysisService(() => provider());

async function readErrorBody(response: Response) {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return response.statusText;
  }
}

function cleanAudioBase64(input: string) {
  const trimmed = input.trim();
  return trimmed.includes(",") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed;
}

function elevenLabsLanguageCode(language: NerveSettings["language"]) {
  return language === "zh" ? "zh" : "en";
}

async function transcribeWithElevenLabs(audioBase64: string, settings: NerveSettings) {
  const apiKey = settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || process.env.NERVE_ELEVENLABS_API_KEY || "";
  if (!apiKey) throw new Error("ElevenLabs API key is missing.");
  const audioBytes = Buffer.from(cleanAudioBase64(audioBase64), "base64");
  if (audioBytes.length === 0) throw new Error("No audio was recorded.");
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", elevenLabsLanguageCode(settings.language));
  form.append("file", new Blob([new Uint8Array(audioBytes)], { type: "audio/webm" }), "nerve-voice.webm");
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form
  });
  if (!response.ok) throw new Error(`ElevenLabs transcription failed: ${response.status} ${await readErrorBody(response)}`);
  const data = await response.json() as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new Error("ElevenLabs returned an empty transcription.");
  return text;
}

async function captureFreshScreenForVoice(): Promise<ScreenCapture> {
  const { image, sourceName } = await capturePrimaryScreen();
  const detected = await getActiveWindowFallback(sourceName);
  const noisy = isNoisyDetection(detected.activeApp, detected.windowTitle);
  return {
    image,
    sourceName,
    activeApp: detected.activeApp,
    windowTitle: detected.windowTitle,
    matchText: detected.matchText,
    hash: imageHash(image),
    changed: true,
    idleSeconds: powerMonitor.getSystemIdleTime(),
    trigger: "voice",
    noisy
  };
}

async function captureAndAnalyzeForVoice(sessionId: string): Promise<AIObservationRecord | null> {
  try {
    const capture = await captureFreshScreenForVoice();
    await handleCapture(capture, sessionId);
    if (!isCurrentSessionActive(sessionId)) return null;
    const row = db
      .prepare("SELECT * FROM ai_observations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(sessionId) as any;
    return row ? rowObservation(row) : null;
  } catch (error) {
    if (isCurrentSessionActive(sessionId)) {
      addEvent(sessionId, "voice_capture_error", "Voice follow-up could not refresh screen context.", { error: String(error) });
      broadcast();
    }
    return null;
  }
}

async function generateVoiceCoachText(transcription: string, settings: NerveSettings, latestObservation: AIObservationRecord | null) {
  const session = getCurrentSession();
  if (!session || session.status === "completed") throw new Error("Start a session before using voice coach.");
  const steps = getSteps(session.id);
  const recentEvents = (db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at DESC LIMIT 8").all(session.id) as any[]).map(rowEvent);
  const recentBreadcrumbs = (db.prepare("SELECT * FROM breadcrumbs WHERE session_id = ? ORDER BY started_at DESC LIMIT 8").all(session.id) as any[]).map(rowBreadcrumb).reverse();
  const prompt = voiceCoachPrompt({
    transcription,
    sessionGoal: session.goal,
    sessionStatus: session.status,
    taskTypes: session.taskTypes,
    currentStep: getActiveStep(session.id),
    steps,
    recentEvents,
    recentBreadcrumbs,
    latestObservation,
    voiceHistory,
    language: settings.language
  });
  const apiKey = settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) throw new Error("DeepSeek API key is missing.");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: settings.deepseekModel || process.env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.35,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: `You are Nerve, a concise ADHD voice coach. Reply naturally, not JSON. Reply only in ${settings.language === "zh" ? "Mandarin Chinese using simplified Chinese characters" : "English"}.`
        },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!response.ok) throw new Error(`DeepSeek voice coach failed: ${response.status} ${await readErrorBody(response)}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("DeepSeek returned no voice coach response.");
  return text.slice(0, 1200);
}

async function synthesizeWithElevenLabs(text: string, settings: NerveSettings) {
  const apiKey = settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY || process.env.NERVE_ELEVENLABS_API_KEY || "";
  const voiceId = settings.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || process.env.NERVE_ELEVENLABS_VOICE_ID || "";
  if (!apiKey) throw new Error("ElevenLabs API key is missing.");
  if (!voiceId) throw new Error("ElevenLabs voice ID is missing.");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      language_code: elevenLabsLanguageCode(settings.language),
      voice_settings: {
        stability: 0.48,
        similarity_boost: 0.72,
        style: 0.12,
        use_speaker_boost: true
      }
    })
  });
  if (!response.ok) throw new Error(`ElevenLabs speech failed: ${response.status} ${await readErrorBody(response)}`);
  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

async function handleVoiceMessage(audioBase64: string): Promise<VoiceCoachResponse> {
  if (typeof audioBase64 !== "string" || !audioBase64.trim()) {
    throw new Error("No audio was recorded.");
  }
  const settings = getSettings();
  const session = getCurrentSession();
  if (!session || session.status !== "active") throw new Error("Start an active session before using voice coach.");
  voiceState = "thinking";
  broadcast();
  const freshContextPromise = captureAndAnalyzeForVoice(session.id);
  try {
    const transcription = await transcribeWithElevenLabs(audioBase64, settings);
    const latestObservation = await freshContextPromise;
    const response = await generateVoiceCoachText(transcription, settings, latestObservation);
    const speech = await synthesizeWithElevenLabs(response, settings);
    voiceHistory = [...voiceHistory.slice(-18), { role: "user", content: transcription }, { role: "assistant", content: response }];
    voiceGuidance = {
      transcription,
      response,
      suggestedNextAction: latestObservation?.suggestedNextAction ?? null,
      stepId: latestObservation?.stepId ?? getActiveStep(session.id)?.id ?? null,
      activeApp: null,
      windowTitle: null,
      createdAt: now()
    };
    voiceState = "speaking";
    addEvent(session.id, "voice_coach", response, { transcription, stepId: voiceGuidance.stepId });
    overlayExpanded = true;
    broadcast();
    return { transcription, response, audioBase64: speech };
  } catch (error) {
    voiceState = "error";
    broadcast();
    throw error;
  }
}

async function handleVoiceTranscription(audioBase64: string): Promise<VoiceTranscriptionResponse> {
  if (typeof audioBase64 !== "string" || !audioBase64.trim()) {
    throw new Error("No audio was recorded.");
  }
  const transcription = await transcribeWithElevenLabs(audioBase64, getSettings());
  return { transcription };
}

function classifyRelevance(appName: string, windowTitle: string): BreadcrumbRelevance {
  const text = `${appName} ${windowTitle}`;
  if (
    /essay|word|doc|docs|notes|research|article|pdf|citation|library|journal|paper|media|code|codex|vscode|visual studio|terminal|powershell|github|git|localhost|api|figma|canva|design|calendar|gmail|outlook|mail|form|portal|course|lecture|slides|presentation|deck|todo|task|planner|notion|alarm|timer|maps|grocery|meal|dinner|lunch|breakfast|dog|pet|shower|laundry|chores|errand|appointment|health|exercise|walk|bank|bill|payment|message|call|text/i.test(
      text
    )
  ) {
    return "productive";
  }
  if (/discord|youtube|tiktok|instagram|reddit|netflix|steam|game/i.test(text)) return "unproductive";
  return "unknown";
}

function normalizeBannedRule(rule: string) {
  return rule.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function bannedSiteMatch(settings: NerveSettings, context: { activeApp: string; windowTitle: string; matchText?: string }): string | null {
  if (!settings.bannedSitesEnabled) return null;
  const haystack = `${context.activeApp} ${context.windowTitle} ${context.matchText ?? ""}`.toLowerCase();
  for (const rawRule of settings.bannedSites) {
    const rule = normalizeBannedRule(rawRule);
    if (!rule) continue;
    const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/^\\\*\\\./, "(?:[a-z0-9-]+\\.)*");
    const pattern = new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`, "i");
    if (pattern.test(haystack)) return rule;
    // Also match the base hostname without TLD (e.g. "youtube" from "youtube.com")
    // so browsers that show "YouTube - Chrome" rather than "youtube.com" are caught.
    const baseDomain = rule.replace(/\.[a-z]{2,}$/, "");
    if (baseDomain && baseDomain !== rule && baseDomain.length > 2) {
      const baseEscaped = baseDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const basePattern = new RegExp(`(^|[^a-z0-9-])${baseEscaped}([^a-z0-9-]|$)`, "i");
      if (basePattern.test(haystack)) return rule;
    }
  }
  return null;
}

function handleBannedSiteDetection(sessionId: string, settings: NerveSettings, context: { activeApp: string; windowTitle: string; matchText?: string }) {
  const rule = bannedSiteMatch(settings, context);
  if (!rule) {
    bannedSiteAlert = null;
    if (!lockInAlert && !lockInWarningStartedAt) {
      hideBlockerWindow();
    }
    return false;
  }
  clearLockInState();
  const timestamp = now();
  bannedSiteAlert = {
    rule,
    activeApp: context.activeApp,
    windowTitle: context.windowTitle,
    detectedAt: timestamp
  };
  overlayExpanded = true;
  overlaySuppressUntil = 0;
  if (Date.now() >= blockerSuppressUntil) showBlockerWindow();
  const eventKey = `${sessionId}|${rule}|${context.activeApp}|${context.windowTitle}`;
  if (eventKey !== lastBannedSiteEventKey || Date.now() - lastBannedSiteEventAt > 60_000) {
    lastBannedSiteEventKey = eventKey;
    lastBannedSiteEventAt = Date.now();
    bannedSiteStrikeCount++;
    addEvent(sessionId, "banned_site_detected", `Banned site detected: ${rule}. Leave this site and return to your task.`, {
      rule,
      activeApp: context.activeApp,
      windowTitle: context.windowTitle
    });
    if (Notification.isSupported()) {
      new Notification({
        title: "别Meow鱼",
        body: `Leave ${rule} and return to your task.`,
        silent: false
      }).show();
    }
  }
  return true;
}

function clearLockInWarning() {
  lockInWarningStartedAt = null;
  if (lockInWarningTimer) clearTimeout(lockInWarningTimer);
  lockInWarningTimer = null;
}

function clearLockInState() {
  clearLockInWarning();
  lockInAlert = false;
}

function triggerLockInBlocker(sessionId: string) {
  const session = getCurrentActiveSession();
  if (!session || session.id !== sessionId || !session.lockInMode || !lockInWarningStartedAt || bannedSiteAlert) return;
  lockInAlert = true;
  overlayExpanded = true;
  overlaySuppressUntil = 0;
  showBlockerWindow();
  addEvent(session.id, "lock_in_triggered", "Lock-in mode: refocus on your task.", {});
  broadcast();
}

function startLockInWarning(session: SessionRecord) {
  if (lockInAlert) return;
  if (!lockInWarningStartedAt) {
    lockInWarningStartedAt = now();
    addEvent(session.id, "lock_in_warning", "Lock-in mode warning: return to the current task.", {});
  }
  if (!lockInWarningTimer) {
    lockInWarningTimer = setTimeout(() => {
      lockInWarningTimer = null;
      triggerLockInBlocker(session.id);
    }, LOCK_IN_BLOCKER_DELAY_MS);
  }
  overlayExpanded = true;
  overlaySuppressUntil = 0;
}

function calmLockInWarning() {
  if (!lockInWarningStartedAt && !lockInAlert) return;
  clearLockInState();
  if (!bannedSiteAlert) hideBlockerWindow();
}

function lastUsefulContext(sessionId: string): { activeApp: string; windowTitle: string } | null {
  const row = db
    .prepare("SELECT app_name, window_title FROM breadcrumbs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1")
    .get(sessionId) as { app_name: string; window_title: string } | undefined;
  return row ? { activeApp: row.app_name, windowTitle: row.window_title } : null;
}

function ensurePhysicalAction(action: string, fallback: string) {
  const candidate = action.trim();
  if (!candidate) return fallback;
  const hasPhysicalVerb =
    /\b(click|type|write|open|select|press|move|scroll|read|look|copy|paste|save|run|close|switch|drag|drop|attach|fill|enter|choose|focus)\b/i.test(
      candidate
    );
  const isAbstractStart = /^(think|consider|reflect|understand|decide|plan|brainstorm|try to think|work on)\b/i.test(candidate);
  return hasPhysicalVerb || !isAbstractStart ? candidate : fallback;
}

function updateBreadcrumb(sessionId: string, activeApp: string, windowTitle: string) {
  if (isNoisyDetection(activeApp, windowTitle)) return;
  const key = `${activeApp}|${windowTitle}`;
  const timestamp = now();
  if (currentBreadcrumbKey === key && currentBreadcrumbId) return;

  if (currentBreadcrumbId && currentBreadcrumbStartedAt) {
    const duration = Math.max(0, Math.round((Date.parse(timestamp) - Date.parse(currentBreadcrumbStartedAt)) / 1000));
    db.prepare("UPDATE breadcrumbs SET ended_at = ?, duration_seconds = ? WHERE id = ?").run(timestamp, duration, currentBreadcrumbId);
  }

  currentBreadcrumbId = id();
  currentBreadcrumbKey = key;
  currentBreadcrumbStartedAt = timestamp;
  db.prepare("INSERT INTO breadcrumbs (id, session_id, app_name, window_title, relevance, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)").run(
    currentBreadcrumbId,
    sessionId,
    activeApp,
    windowTitle,
    classifyRelevance(activeApp, windowTitle),
    timestamp
  );
  addEvent(sessionId, "app_window_changed", `Now seeing ${activeApp}: ${windowTitle}`, { activeApp, windowTitle });
}

function finishCurrentBreadcrumb() {
  if (currentBreadcrumbId && currentBreadcrumbStartedAt) {
    const timestamp = now();
    const duration = Math.max(0, Math.round((Date.parse(timestamp) - Date.parse(currentBreadcrumbStartedAt)) / 1000));
    db.prepare("UPDATE breadcrumbs SET ended_at = ?, duration_seconds = ? WHERE id = ? AND ended_at IS NULL").run(
      timestamp,
      duration,
      currentBreadcrumbId
    );
  }
  currentBreadcrumbId = null;
  currentBreadcrumbKey = null;
  currentBreadcrumbStartedAt = null;
}

function recentBreadcrumbs(sessionId: string): BreadcrumbRecord[] {
  return (db.prepare("SELECT * FROM breadcrumbs WHERE session_id = ? ORDER BY started_at DESC LIMIT 6").all(sessionId) as any[])
    .map(rowBreadcrumb)
    .reverse();
}

/**
 * Called by CaptureService on every "frame" event.
 * Receives a fully-formed ScreenCapture (image, hash, app context, idle time)
 * and runs AI analysis + DB writes + broadcast for the active session.
 */
async function handleCapture(capture: ScreenCapture, sessionId: string) {
  if (!isCurrentSessionActive(sessionId)) return;
  const session = getSessionById(sessionId);
  if (!session) return;
  const activeStep = getActiveStep(session.id);
  if (!activeStep) return;
  if (activeStep.isOffScreen) return;

  try {
    const settings = getSettings();

    // If the captured window is Nerve itself or another noisy source, fall back to the
    // last meaningful context we recorded so the AI always sees real user activity.
    const contextSource = capture.noisy
      ? (lastUsefulContext(session.id) ?? { activeApp: capture.activeApp, windowTitle: capture.windowTitle })
      : { activeApp: capture.activeApp, windowTitle: capture.windowTitle };
    const { activeApp, windowTitle } = contextSource;
    const matchText = capture.noisy ? undefined : capture.matchText;

    updateBreadcrumb(session.id, activeApp, windowTitle);

    const capturedAt = now();
    let screenshotId: string | null = null;
    if (settings.storeScreenshots) {
      screenshotId = id();
      const fullPath = path.join(screenshotDir(), `${capturedAt.replace(/[:.]/g, "-")}-${screenshotId}.jpg`);
      const thumbPath = path.join(screenshotDir(), `${capturedAt.replace(/[:.]/g, "-")}-${screenshotId}-thumb.jpg`);
      fs.writeFileSync(fullPath, capture.image.toJPEG(85));
      fs.writeFileSync(thumbPath, capture.image.resize({ width: 320, height: 180, quality: "good" }).toJPEG(75));
      db.prepare("INSERT INTO screenshots (id, session_id, file_path, thumbnail_path, captured_at, active_app, window_title, perceptual_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        screenshotId, session.id, fullPath, thumbPath, capturedAt, activeApp, windowTitle, capture.hash, capturedAt
      );
      addEvent(session.id, "screenshot_captured", "Screenshot captured and stored locally.", { screenshotId });
    }

    if (handleBannedSiteDetection(session.id, settings, { activeApp, windowTitle, matchText })) {
      broadcast();
      return;
    }

    const elapsedOnStep = Math.round((Date.now() - Date.parse(activeStep.updatedAt)) / 1000);
    const elapsedInApp = currentBreadcrumbStartedAt ? Math.round((Date.now() - Date.parse(currentBreadcrumbStartedAt)) / 1000) : 0;
    const breakActive = Boolean(breakEndsAt && Date.parse(breakEndsAt) > Date.now());
    const thinkingActive = breakActive || Boolean(thinkingPauseUntil && Date.parse(thinkingPauseUntil) > Date.now());
    if (delayUntil && Date.parse(delayUntil) <= Date.now()) delayUntil = null;

    const analyzeInput: AnalyzeScreenInput = {
      sessionGoal: session.goal,
      taskType: session.taskType,
      sessionTaskTypes: session.taskTypes,
      language: settings.language,
      currentStep: {
        title: activeStep.title,
        nextAction: activeStep.nextAction,
        explanation: activeStep.explanation,
        taskType: activeStep.taskType,
        id: activeStep.id,
        atomizationLevel: activeStep.atomizationLevel,
        delayCount: activeStep.delayCount
      },
      activeApp,
      windowTitle,
      elapsedOnCurrentStepSeconds: elapsedOnStep,
      elapsedInCurrentAppSeconds: elapsedInApp,
      screenshotChangedSinceLastCapture: capture.changed,
      recentBreadcrumbs: recentBreadcrumbs(session.id),
      delayCount: activeStep.delayCount,
      atomizationLevel: activeStep.atomizationLevel,
      thinkingPauseActive: thinkingActive
    };

    let observation;
    try {
      observation = await analysisService.analyzeScreen(analyzeInput);
    } catch (error) {
      if (!isCurrentSessionActive(session.id)) return;
      addEvent(session.id, "provider_error", "DeepSeek analysis failed. Check the API key, model, or network connection.", { error: String(error) });
      overlayExpanded = true;
      broadcast();
      return;
    }
    if (!isCurrentSessionActive(session.id)) return;

    observation = {
      ...observation,
      stepId: activeStep.id,
      suggestedNextAction: ensurePhysicalAction(observation.suggestedNextAction, activeStep.nextAction)
    };
    addTaskHistory(
      session.id,
      observation.detectedTaskType ?? activeStep.taskType,
      "screen_detected",
      observation.detectedTaskType ? "medium" : "low",
      observation.conciseExplanation,
      { stepId: activeStep.id, activeApp, windowTitle }
    );
    const stuckReached = observation.userState === "stuck" && elapsedOnStep >= settings.stuckThresholdMinutes * 60 && !thinkingActive;
    const driftReached = observation.userState === "unproductive_drift" && elapsedInApp >= settings.driftThresholdMinutes * 60 && !thinkingActive;
    if (stuckReached || driftReached || (observation.shouldIntervene && !thinkingActive)) {
      const expanded = expandOverlayFromSystem();
      if (expanded) {
        addEvent(session.id, "step_shown", observation.conciseExplanation, { interventionType: observation.interventionType });
      }
    }

    if (!bannedSiteAlert && session.lockInMode && !thinkingActive) {
      if (observation.userState === "unproductive_drift" || observation.userState === "stuck") {
        startLockInWarning(session);
      } else if (observation.userState === "on_task" || observation.userState === "progress" || observation.userState === "productive_drift") {
        calmLockInWarning();
      }
    } else if (session.lockInMode && thinkingActive) {
      calmLockInWarning();
    }

    db.prepare(`INSERT INTO ai_observations (
      id, session_id, screenshot_id, step_id, provider, model, user_state, task_relevance, progress_state, active_app,
      active_context, visible_change_summary, concise_explanation, suggested_next_action, suggested_step_complete,
      should_intervene, intervention_type, urgency, breadcrumb_relevance, detected_task_type, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id(), session.id, screenshotId, activeStep.id,
      analysisService.providerName,
      settings.aiProvider === "deepseek" ? settings.deepseekModel : "mock",
      observation.userState, observation.taskRelevance, observation.progressState, activeApp,
      observation.activeContext, observation.visibleChangeSummary, observation.conciseExplanation,
      observation.suggestedNextAction, observation.suggestedStepComplete ? 1 : 0,
      observation.shouldIntervene ? 1 : 0, observation.interventionType, observation.urgency,
      observation.breadcrumbRelevance, observation.detectedTaskType ?? null,
      JSON.stringify(observation), now()
    );
    addEvent(session.id, "ai_observation", observation.conciseExplanation, { userState: observation.userState });
    broadcast();
  } catch (error) {
    if (!isCurrentSessionActive(session.id)) return;
    addEvent(session.id, "capture_error", "Screen capture paused for this tick.", { error: String(error) });
    broadcast();
  }
}

function pruneOldScreenshots(keepDays = 30) {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
  const old = db.prepare("SELECT id, file_path, thumbnail_path FROM screenshots WHERE created_at < ?").all(cutoff) as Array<{ id: string; file_path: string; thumbnail_path: string }>;
  deleteScreenshotRecords(old);
}

function pruneMissingScreenshotFiles() {
  const rows = db.prepare("SELECT id, file_path, thumbnail_path FROM screenshots").all() as Array<{ id: string; file_path: string; thumbnail_path: string }>;
  deleteScreenshotRecords(rows.filter((row) => !screenshotFilesExist(row)));
}

function deleteScreenshotRecords(rows: Array<{ id: string; file_path: string; thumbnail_path: string }>) {
  if (rows.length === 0) return;
  const deleteScreenshot = db.prepare("DELETE FROM screenshots WHERE id = ?");
  const detachObservation = db.prepare("UPDATE ai_observations SET screenshot_id = NULL WHERE screenshot_id = ?");
  const tx = db.transaction((staleRows: Array<{ id: string; file_path: string; thumbnail_path: string }>) => {
    for (const row of staleRows) {
      try { fs.rmSync(row.file_path, { force: true }); } catch { /* file already gone */ }
      try { fs.rmSync(row.thumbnail_path, { force: true }); } catch { /* file already gone */ }
      detachObservation.run(row.id);
      deleteScreenshot.run(row.id);
    }
  });
  tx(rows);
}

function getSessionScreenshots(sessionId: string): ScreenshotRecord[] {
  const rows = db.prepare(`SELECT s.*, o.user_state ai_state, st.title step_title
    FROM screenshots s
    LEFT JOIN ai_observations o ON o.screenshot_id = s.id
    LEFT JOIN activities st ON st.session_id = s.session_id AND st.status = 'active'
    WHERE s.session_id = ? ORDER BY s.captured_at DESC LIMIT 80`).all(sessionId) as any[];
  const missing = rows.filter((row) => !screenshotFilesExist(row));
  if (missing.length) {
    deleteScreenshotRecords(missing);
  }
  return rows.filter((row) => screenshotFilesExist(row)).map(rowScreenshot);
}

function resetCaptureLoop() {
  captureService?.stop();
  captureService = null;
  const session = getCurrentActiveSession();
  if (!session) return;
  const settings = getSettings();
  const cs = new CaptureService(settings.screenshotIntervalSeconds * 1000);
  cs.on("frame", (capture: ScreenCapture) => {
    void handleCapture(capture, session.id);
  });
  cs.start();
  captureService = cs;
}

function clearDelayTimer() {
  if (delayTimer) clearTimeout(delayTimer);
  delayTimer = null;
  delayUntil = null;
}

function clearReminderLoop() {
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = null;
}

function clearBreakSchedule() {
  breakReminderAt = null;
  breakEndsAt = null;
}

function scheduleNextBreak(settings?: NerveSettings) {
  const s = settings ?? getSettings();
  if (!s.breakRemindersEnabled) {
    clearBreakSchedule();
    return;
  }
  breakEndsAt = null;
  breakReminderAt = new Date(Date.now() + s.breakIntervalMinutes * 60 * 1000).toISOString();
}

function checkBreakReminders(): boolean {
  const settings = getSettings();
  if (!settings.breakRemindersEnabled) return false;

  // Break is active — check if it has ended
  if (breakEndsAt) {
    if (Date.now() < Date.parse(breakEndsAt)) return false;
    const session = getCurrentActiveSession();
    if (session) {
      finishBreak(session, false);
    } else {
      clearBreakSchedule();
    }
    return true;
  }

  // Break is due — start it
  if (breakReminderAt && Date.now() >= Date.parse(breakReminderAt)) {
    breakReminderAt = null;
    breakEndsAt = new Date(Date.now() + settings.breakDurationMinutes * 60 * 1000).toISOString();
    const session = getCurrentActiveSession();
    if (session) {
      addEvent(session.id, "break_started", `Break time: ${settings.breakDurationMinutes} minutes.`, {
        durationMinutes: settings.breakDurationMinutes
      });
    }
    if (Notification.isSupported()) {
      const n = new Notification({
        title: "Break time",
        body: `Take ${settings.breakDurationMinutes} min. ${APP_DISPLAY_NAME} will check back in.`,
        silent: false
      });
      n.show();
    }
    overlayExpanded = true;
    return true;
  }

  return false;
}

function finishBreak(session: SessionRecord, early: boolean) {
  breakEndsAt = null;
  breakReminderAt = null;
  addEvent(session.id, early ? "break_ended_early" : "break_ended", "Break complete. Back to work.", {});
  scheduleNextBreak();
}

function stopSessionLoops() {
  captureService?.stop();
  captureService = null;
  clearDelayTimer();
  clearReminderLoop();
  clearBreakSchedule();
  clearLockInState();
  finishCurrentBreadcrumb();
}

function canAutoExpandOverlay() {
  return Date.now() >= overlaySuppressUntil;
}

function appIconPath() {
  const candidates = [
    path.resolve(__dirname, "../../../../images/cat.png"),
    path.resolve(process.cwd(), "../../images/cat.png"),
    path.resolve(process.cwd(), "images/cat.png")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function appIcon() {
  const icon = nativeImage.createFromPath(appIconPath());
  return icon.isEmpty() ? undefined : icon;
}

function expandOverlayFromSystem() {
  if (!canAutoExpandOverlay()) return false;
  overlayExpanded = true;
  return true;
}

function toggleOverlayFromHotkey() {
  overlayExpanded = !overlayExpanded;
  overlaySuppressUntil = overlayExpanded ? 0 : Date.now() + MANUAL_COLLAPSE_COOLDOWN_MS;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive();
  } else {
    createOverlayWindow();
  }
  broadcast();
}

function snapshot(): AppSnapshot {
  const session = getCurrentSession();
  const sessionId = session?.id ?? activeSessionId;
  const steps = sessionId ? getSteps(sessionId) : [];
  return {
    session,
    steps,
    activities: sessionId ? getActivities(sessionId) : [],
    guidanceSteps: sessionId ? getGuidanceSteps(sessionId) : [],
    activeStep: sessionId ? getActiveStep(sessionId) : null,
    screenshots: sessionId ? getSessionScreenshots(sessionId) : [],
    events: sessionId ? (db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at DESC LIMIT 120").all(sessionId) as any[]).map(rowEvent) : [],
    breadcrumbs: sessionId ? (db.prepare("SELECT * FROM breadcrumbs WHERE session_id = ? ORDER BY started_at DESC LIMIT 40").all(sessionId) as any[]).map(rowBreadcrumb) : [],
    observations: sessionId ? (db.prepare("SELECT * FROM ai_observations WHERE session_id = ? ORDER BY created_at DESC LIMIT 50").all(sessionId) as any[]).map(rowObservation) : [],
    taskHistory: sessionId ? (db.prepare("SELECT * FROM task_history WHERE session_id = ? ORDER BY created_at DESC LIMIT 80").all(sessionId) as any[]).map(rowTaskHistory) : [],
    reminders: sessionId ? (db.prepare("SELECT * FROM reminders WHERE session_id = ? ORDER BY reminder_at ASC LIMIT 80").all(sessionId) as any[]).map(rowReminder) : [],
    settings: (s => ({ ...s, googleClientSecret: '' }))(getSettings()),
    overlayExpanded,
    delayUntil,
    thinkingPauseUntil,
    breakReminderAt,
    breakEndsAt,
    bannedSiteAlert,
    bannedSiteStrikeCount,
    lockInAlert,
    lockInWarningStartedAt,
    screenshotFolder: screenshotDir(),
    connectors: getConnectorStatuses(),
    inboxItems: getVisibleInboxItems(),
    hasGoogleClientSecret: !!getSettings().googleClientSecret,
    voiceGuidance,
    voiceState
  };
}

function broadcast() {
  applyOverlayBounds();
  const data = snapshot();
  overlayWindow?.webContents.send("nerve:snapshot", data);
  mainWindow?.webContents.send("nerve:snapshot", data);
  catWindow?.webContents.send("nerve:snapshot", data);
  if (blockerWindow && !blockerWindow.isDestroyed()) {
    blockerWindow.webContents.send("nerve:snapshot", data);
  }
  syncCatWindowVisibility(data);
}

function applyOverlayBounds() {
  if (!overlayWindow) return;
  const display = screen.getDisplayMatching(overlayWindow.getBounds());
  const workArea = display.workArea;
  const width = bannedSiteAlert ? overlayBannedWidth : overlayExpanded ? overlayExpandedWidth : overlaySlimWidth;
  overlayWindow.setBounds({
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    width,
    height: workArea.height
  });
}

async function loadWindow(win: BrowserWindow, route: string) {
  if (isDev) {
    await win.loadURL(`${process.env.VITE_DEV_SERVER_URL}/#${route}`);
  } else {
    await win.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: route });
  }
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow = new BrowserWindow({
    width: overlaySlimWidth,
    height,
    x: width - overlaySlimWidth,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    icon: appIcon(),
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.on("moved", applyOverlayBounds);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
  void loadWindow(overlayWindow, "/overlay");
}

function closeOverlayWindow() {
  const window = overlayWindow;
  overlayWindow = null;
  if (window && !window.isDestroyed()) {
    window.close();
  }
}

function createCatWindow() {
  if (catWindow && !catWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  catWindow = new BrowserWindow({
    title: `${APP_DISPLAY_NAME} cat`,
    icon: appIcon(),
    width: catScreenWidth,
    height: catScreenHeight,
    x: workArea.x + workArea.width - overlaySlimWidth - catScreenWidth - 20,
    y: workArea.y + 96,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  catWindow.setAlwaysOnTop(true, "screen-saver");
  catWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  catWindow.on("closed", () => {
    catWindow = null;
  });
  void loadWindow(catWindow, "/cat");
}

function syncCatWindowVisibility(data: AppSnapshot) {
  if (!data.session) {
    if (catWindow && !catWindow.isDestroyed()) {
      catWindow.hide();
    }
    return;
  }
  if (!catWindow || catWindow.isDestroyed()) {
    createCatWindow();
  }
  catWindow?.showInactive();
}

function closeCatWindow() {
  const window = catWindow;
  catWindow = null;
  if (window && !window.isDestroyed()) {
    window.close();
  }
}

function showBlockerWindow() {
  if (blockerWindow && !blockerWindow.isDestroyed()) {
    blockerWindow.show();
    blockerWindow.focus();
    return;
  }
  const { bounds } = screen.getPrimaryDisplay();
  blockerWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: false,
    icon: appIcon(),
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  blockerWindow.setAlwaysOnTop(true, "screen-saver");
  blockerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  blockerWindow.on("closed", () => {
    blockerWindow = null;
  });
  void loadWindow(blockerWindow, "/blocker");
}

function hideBlockerWindow() {
  clearLockInState();
  if (blockerWindow && !blockerWindow.isDestroyed()) {
    blockerWindow.hide();
  }
}

function registerGlobalHotkeys() {
  globalShortcut.unregister("Super+Shift+N");
  globalShortcut.unregister("Alt+M");
  const overlayRegistered = globalShortcut.register("Super+Shift+N", toggleOverlayFromHotkey);
  const voiceRegistered = globalShortcut.register("Alt+M", () => {
    if (getCurrentActiveSession()) {
      overlayExpanded = true;
      overlaySuppressUntil = 0;
    }
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      createOverlayWindow();
    } else {
      overlayWindow.showInactive();
      overlayWindow.webContents.send("nerve:toggleVoice");
    }
    mainWindow?.webContents.send("nerve:toggleVoice");
    broadcast();
  });
  if (!overlayRegistered) {
    console.warn("[nerve] Win+Shift+N could not be registered.");
  }
  if (!voiceRegistered) {
    console.warn("[nerve] Alt+M could not be registered.");
  }
}

function createMainWindow(route = "/") {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    void loadWindow(mainWindow, route);
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 860,
    minHeight: 640,
    title: "别Meow鱼",
    icon: appIcon(),
    backgroundColor: "#00000000",
    backgroundMaterial: "mica",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("close", () => {
    if (isQuitting) return;
    isQuitting = true;
    closeOverlayWindow();
    app.quit();
  });
  void loadWindow(mainWindow, route);
}

function registerIpc() {
  ipcMain.handle("nerve:getSnapshot", () => snapshot());
  ipcMain.handle("nerve:voiceMessage", async (_event, audioBase64: string): Promise<VoiceCoachResponse> => handleVoiceMessage(audioBase64));
  ipcMain.handle("nerve:setVoiceState", (_event, state: VoiceRuntimeState) => {
    voiceState = state;
    if (state !== "idle" && getCurrentActiveSession()) {
      overlayExpanded = true;
      overlaySuppressUntil = 0;
    }
    broadcast();
  });
  ipcMain.handle("nerve:transcribeVoice", async (_event, audioBase64: string): Promise<VoiceTranscriptionResponse> => handleVoiceTranscription(audioBase64));
  ipcMain.handle("nerve:setOverlayExpanded", (_event, expanded: boolean) => {
    overlayExpanded = bannedSiteAlert || lockInAlert || lockInWarningStartedAt ? true : expanded;
    overlaySuppressUntil = overlayExpanded ? 0 : Date.now() + MANUAL_COLLAPSE_COOLDOWN_MS;
    applyOverlayBounds();
    broadcast();
  });
  ipcMain.handle("nerve:openMain", (_event, route = "/") => createMainWindow(route));
  ipcMain.handle("nerve:quitApp", () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.handle("nerve:dismissBlocker", () => {
    blockerSuppressUntil = Date.now() + 30_000;
    hideBlockerWindow();
    broadcast();
    setTimeout(() => captureService?.captureNow("window-change"), 3000);
  });
  ipcMain.handle("nerve:openScreenshotFolder", () => shell.openPath(screenshotDir()));
  ipcMain.handle("nerve:updateSettings", (_event, patch: Partial<NerveSettings>) => {
    updateSettings(patch);
    return snapshot();
  });
  ipcMain.handle("nerve:getSessions", () => getSessionSummaries());
  ipcMain.handle("nerve:getSessionLog", (_event, sessionId: string) => getSessionLog(sessionId));
  ipcMain.handle("nerve:parseTaskList", async (_event, input: { goal: string; deadlineText?: string; taskTypes?: TaskType[] }) => {
    const goal = typeof input.goal === "string" ? input.goal.trim() : "";
    if (!goal) {
      throw new Error("Add a task list or goal before parsing.");
    }
    const requestedScopes = inferTaskScopesFromText(goal, input.taskTypes ?? []);
    const taskType = requestedScopes.length > 1 ? "Mixed work" : requestedScopes[0];
    const activeWindow = await getActiveWindowFallback();
    const parsed = await analysisService.generatePlan({
      goal,
      taskType,
      taskTypes: requestedScopes,
      language: getSettings().language,
      deadlineText: input.deadlineText || "",
      currentDateTime: `${localDateTimeContext()} (${new Date().toISOString()})`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      activeApp: activeWindow.activeApp,
      windowTitle: activeWindow.windowTitle
    });
    const steps = sortPlanStepsBySchedule(normalizePlanSteps(parsed.steps, taskType === "Mixed work" ? requestedScopes[0] : taskType, goal));
    if (steps.length === 0) {
      throw new Error("DeepSeek did not return any usable tasks.");
    }
    return { steps, taskTypes: scopesFromSteps(steps, requestedScopes) };
  });
  ipcMain.handle("nerve:deleteAllData", () => {
    stopSessionLoops();
    activeSessionId = null;
    voiceHistory = [];
    voiceGuidance = null;
    voiceState = "idle";
    overlayExpanded = false;
    overlaySuppressUntil = 0;
    thinkingPauseUntil = null;
    bannedSiteAlert = null;
    hideBlockerWindow();
    bannedSiteStrikeCount = 0;
    lastBannedSiteEventKey = null;
    blockerSuppressUntil = 0;
    cachedSettings = null;
    db.exec("DELETE FROM sessions; DELETE FROM steps; DELETE FROM activities; DELETE FROM guidance_steps; DELETE FROM screenshots; DELETE FROM ai_observations; DELETE FROM events; DELETE FROM breadcrumbs; DELETE FROM task_history; DELETE FROM reminders; DELETE FROM connector_tokens; DELETE FROM inbox_items;");
    fs.rmSync(screenshotDir(), { recursive: true, force: true });
    fs.mkdirSync(screenshotDir(), { recursive: true });
    broadcast();
  });

  ipcMain.handle("nerve:connectGmail", async (): Promise<AppSnapshot> => {
    const settings = getSettings();
    if (!settings.googleClientId) throw new Error("Google Client ID not configured in Settings");
    if (settings.googleClientId === DEFAULT_GOOGLE_CLIENT_ID && !settings.googleClientSecret) {
      throw new Error("This Google OAuth client requires a Google Client Secret. Add it in Settings, save Google OAuth, then try Connect Gmail again.");
    }
    try {
      const tokens = await startGmailOAuth(settings.googleClientId, settings.googleClientSecret);
      const encAccess = encryptToken(tokens.accessToken);
      const existing = getConnectorTokenRow("gmail");
      const encRefresh = tokens.refreshToken ? encryptToken(tokens.refreshToken) : existing?.refreshToken;
      const nowStr = now();
      db.prepare(`
        INSERT INTO connector_tokens (connector, access_token, refresh_token, email, expires_at, created_at, updated_at)
        VALUES ('gmail', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(connector) DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          email = excluded.email,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `).run(encAccess, encRefresh ?? null, tokens.email, tokens.expiresAt, nowStr, nowStr);
      broadcast();
      return snapshot();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/client_secret is missing/i.test(message)) {
        throw new Error("Gmail connection failed: Google says this OAuth client requires a Client Secret. Add the Google Client Secret in Settings, save Google OAuth, then connect again.");
      }
      throw new Error(`Gmail connection failed: ${message}`);
    }
  });

  ipcMain.handle("nerve:disconnectGmail", async (): Promise<AppSnapshot> => {
    db.prepare("DELETE FROM connector_tokens WHERE connector = 'gmail'").run();
    db.prepare("DELETE FROM inbox_items WHERE source IN ('gmail', 'calendar')").run();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:fetchInbox", async (): Promise<AppSnapshot> => {
    const accessToken = await getValidGmailAccessToken();
    if (!accessToken) throw new Error("Gmail not connected or token expired");
    const messages = await fetchGmailMessages(accessToken, 20, true);
    const existingIds = new Set<string>(
      (db.prepare("SELECT source_message_id FROM inbox_items WHERE source = 'gmail'").all() as any[]).map((r: any) => r.source_message_id)
    );
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO inbox_items (id, source, source_message_id, title, description, urgency, suggested_task_type, due_hint, status, extracted_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);
    const nowStr = now();
    if (newMessages.length) {
      const items = await extractActionItemsFromMessages(newMessages);
      for (const item of items) {
        insertStmt.run(item.id, item.source, item.sourceMessageId, item.title, item.description, item.urgency, item.suggestedTaskType, item.dueHint ?? null, item.extractedAt, nowStr);
      }
    }
    const existingCalendarIds = new Set<string>(
      (db.prepare("SELECT source_message_id FROM inbox_items WHERE source = 'calendar'").all() as any[]).map((r: any) => r.source_message_id)
    );
    const calendarItems = await fetchGoogleCalendarEvents(accessToken);
    for (const item of calendarItems) {
      if (existingCalendarIds.has(item.sourceMessageId)) continue;
      insertStmt.run(item.id, item.source, item.sourceMessageId, item.title, item.description, item.urgency, item.suggestedTaskType, item.dueHint ?? null, item.extractedAt, nowStr);
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:updateInboxItem", async (_event, itemId: string, status: ActionItemStatus): Promise<AppSnapshot> => {
    if (status === "promoted" && !getCurrentSession()) {
      throw new Error("No active plan right now. Make a plan from the main page first, then come back to add inbox items to the session.");
    }
    db.prepare("UPDATE inbox_items SET status = ? WHERE id = ?").run(status, itemId);
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:addNoteToPlan", async (_event, input: { note: string; reminderAt: string; dueAt?: string | null }): Promise<AppSnapshot> => {
    const session = getCurrentSession();
    if (!session || !["active", "paused"].includes(session.status)) {
      throw new Error("No active plan right now. Make a plan from the main page first, then add this.");
    }
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (!note) throw new Error("Write a note before adding it to the plan.");
    const firstLine = note.split(/\r?\n/).find((line) => line.trim())?.trim() ?? note;
    addPlanStepFromSuggestion({
      sessionId: session.id,
      title: firstLine,
      nextAction: `Review note: ${firstLine}`,
      explanation: note,
      taskType: session.taskTypes[0] ?? session.taskType,
      reminderAt: input.reminderAt,
      dueAt: input.dueAt,
      eventType: "note_added_to_plan",
      eventMessage: "A note was added to the plan."
    });
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:promoteInboxItem", async (_event, itemId: string, input: { reminderAt?: string | null; dueAt?: string | null }): Promise<AppSnapshot> => {
    const session = getOrCreateInboxCalendarSession();
    const row = db.prepare("SELECT * FROM inbox_items WHERE id = ?").get(itemId) as any;
    if (!row) throw new Error("Inbox item not found.");
    // Idempotency guard: only promote if still pending (prevents duplicate steps on double-click)
    const updated = db.prepare("UPDATE inbox_items SET status = 'promoted' WHERE id = ? AND status = 'pending'").run(itemId);
    if (updated.changes === 0) return snapshot();
    addPlanStepFromSuggestion({
      sessionId: session.id,
      title: row.title,
      nextAction: row.description || `Handle inbox item: ${row.title}`,
      explanation: row.description || "Open Gmail and handle this inbox item.",
      taskType: canonicalTaskType(row.suggested_task_type, "Email or admin"),
      deadlineText: row.due_hint ?? "",
      reminderAt: input.reminderAt,
      dueAt: input.dueAt,
      eventType: "inbox_item_added_to_plan",
      eventMessage: "An inbox item was added to the plan."
    });
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:startReminder", async (_event, reminderId: string): Promise<AppSnapshot> => {
    const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminderId) as any;
    if (!row) return snapshot();
    const reminder = rowReminder(row);
    activateReminderStep(reminder);
    db.prepare("UPDATE reminders SET status = 'dismissed' WHERE id = ?").run(reminderId);
    addEvent(reminder.sessionId, "reminder_started", "Reminder started now.", { reminderId, stepId: reminder.stepId });
    overlayExpanded = true;
    resetCaptureLoop();
    resetReminderLoop();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:snoozeReminder", async (_event, reminderId: string, reminderAt: string): Promise<AppSnapshot> => {
    const nextAt = validIso(reminderAt);
    if (!nextAt) throw new Error("Choose a valid reminder time.");
    const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminderId) as any;
    if (!row) return snapshot();
    db.prepare("UPDATE reminders SET status = 'scheduled', reminder_at = ?, triggered_at = NULL WHERE id = ?").run(nextAt, reminderId);
    addEvent(row.session_id, "reminder_snoozed", "Reminder rescheduled.", { reminderId, reminderAt: nextAt });
    resetReminderLoop();
    broadcast();
    return snapshot();
  });
  ipcMain.handle("nerve:deleteReminder", async (_event, reminderId: string): Promise<AppSnapshot> => {
    const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminderId) as any;
    if (!row) return snapshot();
    db.prepare("UPDATE reminders SET status = 'dismissed' WHERE id = ?").run(reminderId);
    addEvent(row.session_id, "reminder_deleted", "A reminder was deleted from the calendar.", { reminderId, title: row.title });
    resetReminderLoop();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:startSession", async (_event, input: { goal: string; deadlineText?: string; taskType?: TaskType; taskTypes?: TaskType[]; parsedSteps?: PlanStepDraft[]; lockInMode?: boolean }) => {
    const goal = typeof input.goal === "string" ? input.goal.trim() : "";
    if (!goal) {
      throw new Error("A goal is required.");
    }
    const requestedTaskTypes = inferTaskScopesFromText(goal, input.taskTypes ?? (input.taskType ? [input.taskType] : []));
    const parsedSteps = input.parsedSteps?.length ? normalizePlanSteps(input.parsedSteps, requestedTaskTypes[0], goal) : [];
    const taskTypes = parsedSteps.length ? scopesFromSteps(parsedSteps, requestedTaskTypes) : requestedTaskTypes;
    const taskType = taskTypes.length > 1 ? "Mixed work" : taskTypes[0];
    const timestamp = now();
    const sessionId = id();
    const activeWindow = await getActiveWindowFallback();
    const plan = parsedSteps.length
      ? { steps: parsedSteps }
      : await analysisService.generatePlan({
          goal,
          taskType,
          taskTypes,
          language: getSettings().language,
          deadlineText: input.deadlineText || "",
          currentDateTime: `${localDateTimeContext()} (${new Date().toISOString()})`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          activeApp: activeWindow.activeApp,
          windowTitle: activeWindow.windowTitle
        });
    const normalizedPlanSteps = parsedSteps.length ? parsedSteps : normalizePlanSteps(plan.steps, taskType === "Mixed work" ? taskTypes[0] : taskType, goal);
    const planSteps = parsedSteps.length ? normalizedPlanSteps : sortPlanStepsBySchedule(normalizedPlanSteps);

    stopSessionLoops();
    voiceHistory = [];
    voiceGuidance = null;
    voiceState = "idle";
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE status IN ('active', 'paused')").run(timestamp, timestamp);
    db.prepare("INSERT INTO sessions (id, goal, task_type, task_types_json, deadline_text, status, started_at, ended_at, created_at, updated_at, lock_in_mode) VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?, ?)").run(
      sessionId,
      goal,
      taskType,
      JSON.stringify(taskTypes),
      input.deadlineText || "",
      timestamp,
      timestamp,
      timestamp,
      input.lockInMode ? 1 : 0
    );
    const insertActivity = db.prepare("INSERT INTO activities (id, session_id, order_index, title, task_type, deadline_text, due_at, reminder_at, routine_interval_minutes, routine_next_at, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
    const insertGuidance = db.prepare("INSERT INTO guidance_steps (id, activity_id, session_id, order_index, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, ?, 0, 0, ?, ?, NULL)");
    planSteps.forEach((step: PlanStepDraft, index: number) => {
      const activityId = id();
      insertActivity.run(
        activityId,
        sessionId,
        index,
        step.title,
        step.taskType ?? taskType,
        step.deadlineText ?? "",
        validIso(step.dueAt),
        validIso(step.reminderAt),
        step.routineIntervalMinutes ?? null,
        validIso(step.routineNextAt),
        index === 0 ? "active" : "pending",
        timestamp,
        timestamp
      );
      insertGuidance.run(id(), activityId, sessionId, step.nextAction, step.explanation, index === 0 ? "active" : "pending", timestamp, timestamp);
    });
    for (const step of getSteps(sessionId)) syncStepReminder(step);
    activeSessionId = sessionId;
    ensureHighestPriorityActive(sessionId);
    overlayExpanded = false;
    overlaySuppressUntil = 0;
    delayUntil = null;
    thinkingPauseUntil = null;
    bannedSiteAlert = null;
    hideBlockerWindow();
    bannedSiteStrikeCount = 0;
    lastBannedSiteEventKey = null;
    blockerSuppressUntil = 0;
    addEvent(sessionId, "session_started", "Session started.", { goal, provider: analysisService.providerName, taskTypes });
    for (const scope of taskTypes) {
      addTaskHistory(sessionId, scope, "session_start", "high", `Session scope added: ${scope}`);
    }
    const firstStep = getActiveStep(sessionId);
    if (firstStep) {
      addTaskHistory(sessionId, firstStep.taskType, "step_active", "high", `Active step: ${firstStep.title}`, { stepId: firstStep.id });
    }
    resetCaptureLoop();
    resetReminderLoop();
    captureService?.captureNow();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:endSession", () => {
    const session = getCurrentSession();
    if (!session) return snapshot();
    const timestamp = now();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE id = ?")
      .run(timestamp, timestamp, session.id);
    stopSessionLoops();
    voiceHistory = [];
    voiceGuidance = null;
    voiceState = "idle";
    thinkingPauseUntil = null;
    bannedSiteAlert = null;
    hideBlockerWindow();
    bannedSiteStrikeCount = 0;
    lastBannedSiteEventKey = null;
    blockerSuppressUntil = 0;
    addEvent(session.id, "session_ended", "Session ended by user.");
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:pauseSession", () => {
    const session = getCurrentActiveSession();
    if (!session) return snapshot();
    const timestamp = now();
    db.prepare("UPDATE sessions SET status = 'paused', updated_at = ? WHERE id = ?").run(timestamp, session.id);
    activeSessionId = session.id;
    stopSessionLoops();
    thinkingPauseUntil = null;
    bannedSiteAlert = null;
    hideBlockerWindow();
    lastBannedSiteEventKey = null;
    addEvent(session.id, "session_paused", "Session paused. I’ll hold this exact spot.");
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:resumeSession", (_event, sessionId?: string) => {
    const target = sessionId ? getSessionById(sessionId) : getCurrentSession();
    if (!target || target.status === "completed") return snapshot();
    const timestamp = now();
    stopSessionLoops();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE status = 'active' AND id != ?").run(
      timestamp,
      timestamp,
      target.id
    );
    db.prepare("UPDATE sessions SET status = 'active', ended_at = NULL, updated_at = ? WHERE id = ?").run(timestamp, target.id);
    activeSessionId = target.id;
    overlayExpanded = true;
    overlaySuppressUntil = 0;
    addEvent(target.id, "session_resumed", "Session resumed. The next step is still here.");
    resetCaptureLoop();
    resetReminderLoop();
    captureService?.captureNow();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:updateSession", (_event, sessionId: string, patch: { goal?: string; deadlineText?: string }) => {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    if (!session) return snapshot();
    const timestamp = now();
    if (typeof patch.goal === "string" && patch.goal.trim()) {
      db.prepare("UPDATE sessions SET goal = ?, updated_at = ? WHERE id = ?").run(patch.goal.trim(), timestamp, sessionId);
    }
    if (typeof patch.deadlineText === "string") {
      db.prepare("UPDATE sessions SET deadline_text = ?, updated_at = ? WHERE id = ?").run(patch.deadlineText.trim(), timestamp, sessionId);
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:replanSession", async () => {
    const session = getCurrentSession();
    if (!session || session.status === "completed") return snapshot();
    const settings = getSettings();
    const timestamp = now();

    const completedActivities = db
      .prepare("SELECT title FROM activities WHERE session_id = ? AND status = 'complete' ORDER BY order_index")
      .all(session.id) as { title: string }[];
    const activeActivity = db
      .prepare("SELECT title FROM activities WHERE session_id = ? AND status = 'active' ORDER BY order_index LIMIT 1")
      .get(session.id) as { title: string } | undefined;

    let goalWithContext = session.goal;
    if (completedActivities.length > 0) {
      goalWithContext += `\n\nAlready completed:\n${completedActivities.map((a) => `- ${a.title}`).join("\n")}`;
    }
    if (activeActivity) {
      goalWithContext += `\n\nCurrently working on: ${activeActivity.title}\n\nGenerate only the remaining steps needed after the current one.`;
    }

    const plan = await analysisService.generatePlan({
      goal: goalWithContext,
      taskType: session.taskType,
      taskTypes: session.taskTypes,
      language: settings.language,
      deadlineText: session.deadlineText,
      currentDateTime: `${localDateTimeContext()} (${new Date().toISOString()})`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    const pendingIds = (
      db.prepare("SELECT id FROM activities WHERE session_id = ? AND status = 'pending'").all(session.id) as { id: string }[]
    ).map((r) => r.id);
    for (const activityId of pendingIds) {
      db.prepare("DELETE FROM guidance_steps WHERE activity_id = ?").run(activityId);
    }
    db.prepare("DELETE FROM activities WHERE session_id = ? AND status = 'pending'").run(session.id);

    const maxRow = db
      .prepare("SELECT MAX(order_index) as m FROM activities WHERE session_id = ?")
      .get(session.id) as { m: number | null };
    const nextIdx = (maxRow.m ?? -1) + 1;

    const insertActivity = db.prepare(
      "INSERT INTO activities (id, session_id, order_index, title, task_type, deadline_text, due_at, reminder_at, routine_interval_minutes, routine_next_at, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)"
    );
    const insertGuidance = db.prepare(
      "INSERT INTO guidance_steps (id, activity_id, session_id, order_index, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, 'pending', 0, 0, ?, ?, NULL)"
    );

    const planSteps = normalizePlanSteps(plan.steps, session.taskType, session.goal);
    planSteps.forEach((step: PlanStepDraft, index: number) => {
      const activityId = id();
      insertActivity.run(activityId, session.id, nextIdx + index, step.title, step.taskType ?? session.taskType, step.deadlineText ?? "", validIso(step.dueAt), validIso(step.reminderAt), step.routineIntervalMinutes ?? null, validIso(step.routineNextAt), timestamp, timestamp);
      insertGuidance.run(id(), activityId, session.id, step.nextAction, step.explanation, timestamp, timestamp);
    });

    if (!getActiveStep(session.id)) activateNextPendingStep(session.id);
    for (const step of getSteps(session.id)) syncStepReminder(step);
    resetReminderLoop();

    addEvent(session.id, "replan", `Plan regenerated: ${plan.steps.length} new steps added.`, {
      completedCount: completedActivities.length
    });

    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:updateStep", (_event, stepId: string, patch: Partial<StepRecord>) => {
    const existing = db.prepare("SELECT * FROM activities WHERE id = ?").get(stepId) as any;
    if (!existing) return snapshot();
    const activityColumnMap = {
      title: "title",
      taskType: "task_type",
      deadlineText: "deadline_text",
      dueAt: "due_at",
      reminderAt: "reminder_at",
      routineIntervalMinutes: "routine_interval_minutes",
      routineNextAt: "routine_next_at",
      status: "status",
      orderIndex: "order_index",
      isOffScreen: "is_off_screen"
    } as const;
    for (const key of Object.keys(activityColumnMap) as Array<keyof typeof activityColumnMap>) {
      if (patch[key] !== undefined) {
        const column = activityColumnMap[key];
        const value =
          key === "dueAt" || key === "reminderAt" || key === "routineNextAt"
            ? validIso(patch[key] as string | null | undefined)
            : key === "routineIntervalMinutes"
              ? normalizeRoutineInterval(patch[key], "")
              : key === "isOffScreen"
                ? (patch[key] ? 1 : 0)
                : patch[key];
        db.prepare(`UPDATE activities SET ${column} = ?, updated_at = ? WHERE id = ?`).run(value, now(), stepId);
      }
    }
    if (patch.routineIntervalMinutes === null || patch.routineIntervalMinutes === 0) {
      db.prepare("UPDATE activities SET routine_next_at = NULL, updated_at = ? WHERE id = ?").run(now(), stepId);
    } else if (patch.routineIntervalMinutes !== undefined && patch.routineNextAt === undefined) {
      const refreshed = db.prepare("SELECT * FROM activities WHERE id = ?").get(stepId) as any;
      const interval = normalizeRoutineInterval(refreshed?.routine_interval_minutes, "");
      const routineNextAt = interval ? new Date(Date.now() + interval * 60_000).toISOString() : null;
      db.prepare("UPDATE activities SET routine_next_at = ?, reminder_at = ?, updated_at = ? WHERE id = ?").run(
        routineNextAt,
        routineNextAt,
        now(),
        stepId
      );
    }
    if (patch.status === "active") {
      setActiveActivity(existing.session_id, stepId);
    }
    if (patch.status === "complete") {
      const timestamp = now();
      db.prepare("UPDATE guidance_steps SET status = 'complete', completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE activity_id = ?").run(
        timestamp,
        timestamp,
        stepId
      );
    }
    const guidance = getActiveGuidanceStep(stepId);
    if (guidance && patch.nextAction !== undefined) {
      db.prepare("UPDATE guidance_steps SET next_action = ?, updated_at = ? WHERE id = ?").run(patch.nextAction, now(), guidance.id);
    }
    if (guidance && patch.explanation !== undefined) {
      db.prepare("UPDATE guidance_steps SET explanation = ?, updated_at = ? WHERE id = ?").run(patch.explanation, now(), guidance.id);
    }
    const refreshed = getActiveStep(existing.session_id) ?? getSteps(existing.session_id).find((step) => step.id === stepId);
    if (refreshed) {
      syncStepReminder(refreshed);
      resetReminderLoop();
    }
    if (existing.status === "active" && patch.status === "complete") {
      db.prepare("UPDATE reminders SET status = 'dismissed' WHERE step_id = ? AND status IN ('scheduled', 'triggered')").run(stepId);
      activateNextPendingStep(existing.session_id, existing.order_index);
      addEvent(existing.session_id, "step_done", "Step marked done. Moving to the next step.", { stepId });
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:addStep", (_event, sessionId: string) => {
    const nextIndexRow = db.prepare("SELECT COALESCE(MAX(order_index), -1) + 1 idx FROM activities WHERE session_id = ?").get(sessionId) as { idx: number };
    const nextIndex = Number(nextIndexRow.idx);
    const timestamp = now();
    const activityId = id();
    db.prepare("INSERT INTO activities (id, session_id, order_index, title, task_type, deadline_text, due_at, reminder_at, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, '', NULL, NULL, 'pending', ?, ?, NULL)").run(
      activityId,
      sessionId,
      nextIndex,
      "New activity",
      getCurrentSession()?.taskTypes[0] ?? "General writing",
      timestamp,
      timestamp
    );
    db.prepare("INSERT INTO guidance_steps (id, activity_id, session_id, order_index, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, 'pending', 0, 0, ?, ?, NULL)").run(
      id(),
      activityId,
      sessionId,
      "Do one small physical action for this activity.",
      "Keep it small and concrete.",
      timestamp,
      timestamp
    );
    addEvent(sessionId, "step_added", "A plan step was added.");
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:deleteStep", (_event, stepId: string) => {
    const step = db.prepare("SELECT * FROM activities WHERE id = ?").get(stepId) as any;
    if (step) {
      db.prepare("DELETE FROM activities WHERE id = ?").run(stepId);
      db.prepare("DELETE FROM guidance_steps WHERE activity_id = ?").run(stepId);
      db.prepare("UPDATE reminders SET status = 'dismissed' WHERE step_id = ? AND status IN ('scheduled', 'triggered')").run(stepId);
      resetReminderLoop();
      addEvent(step.session_id, "step_deleted", "A plan step was deleted.", { title: step.title });
      if (step.status === "active") {
        activateNextPendingStep(step.session_id, step.order_index);
      }
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:reorderStep", (_event, stepId: string, direction: "up" | "down") => {
    const step = db.prepare("SELECT * FROM activities WHERE id = ?").get(stepId) as any;
    if (!step) return snapshot();
    const activeBefore = getActiveStep(step.session_id);
    const other = db
      .prepare(`SELECT * FROM activities WHERE session_id = ? AND order_index ${direction === "up" ? "<" : ">"} ? ORDER BY order_index ${direction === "up" ? "DESC" : "ASC"} LIMIT 1`)
      .get(step.session_id, step.order_index) as any;
    if (other) {
      const timestamp = now();
      db.prepare("UPDATE activities SET order_index = ?, updated_at = ? WHERE id = ?").run(other.order_index, timestamp, step.id);
      db.prepare("UPDATE activities SET order_index = ?, updated_at = ? WHERE id = ?").run(step.order_index, timestamp, other.id);
      const activeAfter = ensureHighestPriorityActive(step.session_id);
      if (activeAfter && activeAfter.id !== activeBefore?.id) {
        addEvent(step.session_id, "step_reprioritized", `Priority changed. Now focusing on ${activeAfter.title}.`, {
          stepId: activeAfter.id,
          previousStepId: activeBefore?.id ?? null
        });
      }
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:action", async (_event, action: "done" | "thinking" | "delay" | "markDone" | "keepWorking" | "repeatRoutine" | "endBreak") => {
    const session = getCurrentActiveSession();
    if (!session) return snapshot();
    if (action === "endBreak") {
      if (breakEndsAt) finishBreak(session, true);
      broadcast();
      return snapshot();
    }
    const step = getActiveStep(session.id);
    if (!step) return snapshot();
    const timestamp = now();

    if (action === "done" || action === "markDone") {
      const guidance = getActiveGuidanceStep(step.id);
      if (guidance) {
        db.prepare("UPDATE guidance_steps SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, guidance.id);
      }
      const nextGuidance = db.prepare("SELECT * FROM guidance_steps WHERE activity_id = ? AND status = 'pending' ORDER BY order_index LIMIT 1").get(step.id) as any;
      if (nextGuidance) {
        db.prepare("UPDATE guidance_steps SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, nextGuidance.id);
        addEvent(session.id, "guidance_done", "Nice. The next small action is ready.", { stepId: step.id, guidanceId: nextGuidance.id });
      } else {
        db.prepare("UPDATE activities SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, step.id);
        db.prepare("UPDATE reminders SET status = 'dismissed' WHERE step_id = ? AND status IN ('scheduled', 'triggered')").run(step.id);
        const nextStep = activateNextPendingStep(session.id, step.orderIndex);
        if (nextStep) {
          addEvent(session.id, "step_done", "Activity marked done. Moving to the next activity.", { stepId: step.id });
        } else {
          addEvent(session.id, "session_completed", "Session complete.");
        }
      }
      overlayExpanded = true;
      resetReminderLoop();
    }

    if (action === "thinking") {
      const activeUntil = thinkingPauseUntil ? Date.parse(thinkingPauseUntil) : 0;
      if (activeUntil > Date.now()) {
        thinkingPauseUntil = null;
        addEvent(session.id, "thinking_cancelled", "Thinking pause ended. Back to the current step.");
      } else {
        const minutes = getSettings().thinkingPauseMinutes;
        clearDelayTimer();
        delayUntil = null;
        thinkingPauseUntil = new Date(Date.now() + minutes * 60_000).toISOString();
        addEvent(session.id, "thinking_clicked", "Got it. I’ll hold this step while you think.", { until: thinkingPauseUntil });
      }
      overlayExpanded = true;
    }

    if (action === "delay") {
      const activeUntil = delayUntil ? Date.parse(delayUntil) : 0;
      if (activeUntil > Date.now()) {
        clearDelayTimer();
        delayUntil = null;
        addEvent(session.id, "delay_cancelled", "Delay cancelled. Back to the current step.");
      } else {
        clearDelayTimer();
        if (thinkingPauseUntil && Date.parse(thinkingPauseUntil) > Date.now()) {
          thinkingPauseUntil = null;
        }
        delayUntil = new Date(Date.now() + 5 * 60_000).toISOString();
        const guidance = getActiveGuidanceStep(step.id);
        if (guidance) {
          db.prepare("UPDATE guidance_steps SET delay_count = delay_count + 1, updated_at = ? WHERE id = ?").run(timestamp, guidance.id);
        }
        addEvent(session.id, "delay_clicked", "Got it. I'll check back in 5 minutes.", { until: delayUntil });
        delayTimer = setTimeout(() => {
          delayUntil = null;
          delayTimer = null;
          broadcast();
        }, 5 * 60_000);
      }
      overlayExpanded = true;
    }

    if (action === "repeatRoutine") {
      if (step.routineIntervalMinutes) {
        const nextAt = nextRoutineOccurrence(step);
        db.prepare("UPDATE activities SET status = 'pending', routine_next_at = ?, reminder_at = ?, completed_at = NULL, updated_at = ? WHERE id = ?").run(
          nextAt,
          nextAt,
          timestamp,
          step.id
        );
        db.prepare("UPDATE guidance_steps SET status = 'pending', completed_at = NULL, updated_at = ? WHERE activity_id = ?").run(timestamp, step.id);
        db.prepare("UPDATE reminders SET status = 'dismissed' WHERE step_id = ? AND status IN ('scheduled', 'triggered')").run(step.id);
        const refreshed = getSteps(session.id).find((candidate) => candidate.id === step.id);
        if (refreshed) syncStepReminder(refreshed);
        addEvent(session.id, "routine_repeated", `Routine scheduled again for ${nextAt ? new Date(nextAt).toLocaleTimeString() : "later"}.`, {
          stepId: step.id,
          nextAt
        });
        activateNextPendingStep(session.id, step.orderIndex);
        resetReminderLoop();
        overlayExpanded = true;
      }
    }

    if (action === "keepWorking") {
      addEvent(session.id, "completion_kept", "Step kept active.");
    }

    broadcast();
    return snapshot();
  });
}

async function runSmokeTest() {
  if (!mainWindow) throw new Error("Main window was not created.");
  await new Promise<void>((resolve) => {
    if (mainWindow?.webContents.isLoading()) {
      mainWindow.webContents.once("did-finish-load", () => resolve());
    } else {
      resolve();
    }
  });

  const result = await mainWindow.webContents.executeJavaScript(`
    (async () => {
      for (let index = 0; index < 50; index += 1) {
        if (window.nerve) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!window.nerve) throw new Error("Preload API window.nerve was not available.");

      const originalSettings = (await window.nerve.getSnapshot()).settings;
      await window.nerve.deleteAllData();
      await window.nerve.updateSettings({
        aiProvider: "deepseek",
        screenshotIntervalSeconds: 10,
        storeScreenshots: true
      });

      const parsed = {
        steps: [
          {
            title: "Complete math research",
            nextAction: "Open the research notes and read the next visible heading.",
            explanation: "One bounded research move is enough to restart.",
            taskType: "Research",
            deadlineText: "",
            dueAt: null,
            reminderAt: null
          },
          {
            title: "Walk the dog",
            nextAction: "Pick up the leash.",
            explanation: "Start with the first physical pet-care action.",
            taskType: "Pet care",
            deadlineText: "today at 3pm",
            dueAt: new Date(Date.now() + 90_000).toISOString(),
            reminderAt: new Date(Date.now() + 60_000).toISOString()
          },
          {
            title: "Have dinner",
            nextAction: "Open the kitchen or food-ordering app.",
            explanation: "Food is part of the plan.",
            taskType: "Meals",
            deadlineText: "today at 6pm",
            dueAt: new Date(Date.now() + 120_000).toISOString(),
            reminderAt: new Date(Date.now() + 90_000).toISOString()
          }
        ],
        taskTypes: ["Research", "Pet care", "Meals"]
      };

      const started = await window.nerve.startSession({
        goal: "Smoke test: complete math research, walk the dog at 3pm, shower at 5pm, have dinner at 6pm.",
        deadlineText: "today",
        parsedSteps: parsed.steps
      });
      if (!started.session) throw new Error("No session returned after start.");
      if (!started.activeStep) throw new Error("No active step after start.");
      if (started.steps.length < 1) throw new Error("Generated plan is empty.");
      if (!started.session.taskTypes.some((type) => ["Pet care", "Meals"].includes(type))) {
        throw new Error("Session did not preserve personal-life scopes.");
      }

      const thinking = await window.nerve.action("thinking");
      if (!thinking.thinkingPauseUntil) throw new Error("Thinking pause was not set.");

      const thinkingCancelled = await window.nerve.action("thinking");
      if (thinkingCancelled.thinkingPauseUntil) throw new Error("Thinking pause did not cancel.");

      const paused = await window.nerve.pauseSession();
      if (paused.session?.status !== "paused") throw new Error("Pause did not mark the session paused.");
      if (paused.delayUntil || paused.thinkingPauseUntil) throw new Error("Pause left session timers visible.");

      const blockedWhilePaused = await window.nerve.action("done");
      if (blockedWhilePaused.session?.status !== "paused") throw new Error("Paused session accepted an active-only action.");

      const resumed = await window.nerve.resumeSession();
      if (resumed.session?.status !== "active") throw new Error("Resume did not reactivate the session.");
      if (!resumed.activeStep) throw new Error("Resume lost the active step.");

      const advanced = await window.nerve.action("done");
      if (!advanced.activeStep && advanced.session?.status !== "completed") {
        throw new Error("Done did not advance or complete the session.");
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
      const captured = await window.nerve.getSnapshot();
      if (captured.screenshots.length < 1) {
        throw new Error("No screenshot record was captured.");
      }

      await window.nerve.setOverlayExpanded(true);
      const expanded = await window.nerve.getSnapshot();
      if (!expanded.overlayExpanded) throw new Error("Overlay did not expand.");

      await window.nerve.setOverlayExpanded(false);
      const collapsed = await window.nerve.getSnapshot();
      if (collapsed.overlayExpanded) throw new Error("Overlay did not collapse.");

      const result = {
        sessionId: collapsed.session?.id,
        stepCount: collapsed.steps.length,
        reminderCount: collapsed.reminders.length,
        eventCount: collapsed.events.length,
        screenshotCount: collapsed.screenshots.length,
        screenshotFolder: collapsed.screenshotFolder
      };
      await window.nerve.deleteAllData();
      await window.nerve.updateSettings(originalSettings);
      return result;
    })();
  `);

  const screenshotFolder = String((result as { screenshotFolder?: string }).screenshotFolder ?? "");
  if (!screenshotFolder || !fs.existsSync(screenshotFolder)) {
    throw new Error("Screenshot folder was not created.");
  }
  console.log(`[nerve-smoke] PASS ${JSON.stringify(result)}`);
  app.quit();
}

async function runBreakTest() {
  if (!mainWindow) throw new Error("Main window was not created.");
  await new Promise<void>((resolve) => {
    if (mainWindow?.webContents.isLoading()) {
      mainWindow.webContents.once("did-finish-load", () => resolve());
    } else {
      resolve();
    }
  });

  const result = await mainWindow.webContents.executeJavaScript(`
    (async () => {
      for (let index = 0; index < 50; index += 1) {
        if (window.nerve) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!window.nerve) throw new Error("Preload API window.nerve was not available.");

      const originalSettings = (await window.nerve.getSnapshot()).settings;
      await window.nerve.deleteAllData();

      let rejectedBlankGoal = false;
      try {
        await window.nerve.startSession({ goal: "   ", deadlineText: "" });
      } catch {
        rejectedBlankGoal = true;
      }
      if (!rejectedBlankGoal) throw new Error("Blank goal was accepted.");

      await window.nerve.updateSettings({
        aiProvider: "deepseek",
        screenshotIntervalSeconds: 999,
        panelOpacity: 2,
        storeScreenshots: false,
        bannedSitesEnabled: true,
        bannedSites: [" https://YouTube.com/watch?v=test ", "reddit.com/r/all", "bad", "*.tiktok.com", "youtube.com"]
      });
      const sanitized = await window.nerve.getSnapshot();
      if (sanitized.settings.screenshotIntervalSeconds === 999) {
        throw new Error("Invalid screenshot interval was stored.");
      }
      if (sanitized.settings.panelOpacity === 2) {
        throw new Error("Invalid opacity was stored.");
      }
      if (sanitized.settings.storeScreenshots !== false) {
        throw new Error("Valid screenshot storage toggle was not stored.");
      }
      if (!sanitized.settings.bannedSitesEnabled || sanitized.settings.bannedSites.includes("bad")) {
        throw new Error("Banned-site settings were not sanitized.");
      }
      if (sanitized.settings.bannedSites.filter((site) => site === "youtube.com").length !== 1) {
        throw new Error("Duplicate banned-site domains were not collapsed.");
      }

      const aliasSession = await window.nerve.startSession({
        goal: "Break test: write copy, make a poster, and walk dog at 5pm.",
        parsedSteps: [
          {
            title: "Write copy",
            nextAction: "Open the document and type one sentence.",
            explanation: "Start with the first visible line.",
            taskType: "Writing",
            deadlineText: "today at 3pm",
            dueAt: "not a date",
            reminderAt: "also not a date"
          },
          {
            title: "Make poster",
            nextAction: "Open the design file.",
            explanation: "Bring the canvas into view.",
            taskType: "Design / creative",
            deadlineText: "",
            dueAt: null,
            reminderAt: null
          },
          {
            title: "Walk dog",
            nextAction: "Pick up the leash.",
            explanation: "One direct pet-care action.",
            taskType: "dog",
            deadlineText: "today at 5pm",
            dueAt: new Date(Date.now() + 60_000).toISOString(),
            reminderAt: new Date(Date.now() + 30_000).toISOString()
          }
        ]
      });
      const canonicalTaskTypes = ${JSON.stringify(validTaskTypes.filter((type) => type !== "Mixed work"))};
      if (aliasSession.steps.length !== 3 || aliasSession.activities.length !== 3 || aliasSession.guidanceSteps.length !== 3) {
        throw new Error("Parsed activity/guidance rows were not created one-for-one.");
      }
      if (aliasSession.steps.some((step) => !canonicalTaskTypes.includes(step.taskType))) {
        throw new Error("Non-canonical task type reached the renderer snapshot.");
      }
      if (aliasSession.steps[0].dueAt || aliasSession.steps[0].reminderAt) {
        throw new Error("Invalid parsed dates were stored instead of being nulled.");
      }
      if (aliasSession.guidanceSteps.filter((step) => step.status === "active").length !== 1) {
        throw new Error("More than one guidance row was active after session start.");
      }
      const firstActivityId = aliasSession.activeStep?.id;
      const afterFirstDone = await window.nerve.action("done");
      if (firstActivityId && afterFirstDone.guidanceSteps.some((step) => step.activityId === firstActivityId && step.status !== "complete")) {
        throw new Error("Completing an activity did not complete its active guidance row.");
      }

      const routineSession = await window.nerve.startSession({
        goal: "Break test: check specimens every 30 minutes and write a bench note.",
        parsedSteps: [
          {
            title: "Check specimens",
            nextAction: "Walk to the specimen station and check the labels.",
            explanation: "This routine must come back on schedule.",
            taskType: "Research",
            deadlineText: "every 30 minutes",
            dueAt: null,
            reminderAt: new Date(Date.now() - 1000).toISOString(),
            routineIntervalMinutes: 30,
            routineNextAt: new Date(Date.now() - 1000).toISOString()
          },
          {
            title: "Write bench note",
            nextAction: "Open the notes and write one observation.",
            explanation: "Use the time between routine checks.",
            taskType: "General writing",
            deadlineText: "",
            dueAt: null,
            reminderAt: null
          }
        ]
      });
      if (routineSession.activeStep?.title !== "Check specimens") {
        throw new Error("Due routine task did not become active.");
      }
      const repeatedRoutine = await window.nerve.action("repeatRoutine");
      const routineStep = repeatedRoutine.steps.find((step) => step.title === "Check specimens");
      if (!routineStep?.routineNextAt || routineStep.status !== "pending") {
        throw new Error("Routine repeat did not schedule the next occurrence.");
      }
      if (repeatedRoutine.activeStep?.title !== "Write bench note") {
        throw new Error("Repeating a routine did not return focus to the next ready task.");
      }
      const breakReady = await window.nerve.updateSettings({
        breakRemindersEnabled: true,
        breakIntervalMinutes: 15,
        breakDurationMinutes: 5
      });
      if (!breakReady.breakReminderAt) {
        throw new Error("Enabling break reminders did not schedule the next break.");
      }
      const breakOff = await window.nerve.updateSettings({ breakRemindersEnabled: false });
      if (breakOff.breakReminderAt || breakOff.breakEndsAt) {
        throw new Error("Disabling break reminders did not clear break timers.");
      }

      const started = await window.nerve.startSession({
        goal: "Break test: draft one resilient essay paragraph.",
        deadlineText: "later",
        parsedSteps: [
          {
            title: "Draft one resilient essay paragraph",
            nextAction: "Open the document and write one rough sentence.",
            explanation: "A rough sentence is enough to begin.",
            taskType: "Essay writing",
            deadlineText: "",
            dueAt: null,
            reminderAt: null
          },
          {
            title: "Check the paragraph",
            nextAction: "Read the sentence once and fix one unclear word.",
            explanation: "Only one clarity pass is needed for this test.",
            taskType: "Essay writing",
            deadlineText: "",
            dueAt: null,
            reminderAt: null
          }
        ]
      });
      if (!started.session || !started.activeStep) throw new Error("Valid session did not start.");
      const secondStep = started.steps.find((step) => step.id !== started.activeStep?.id);
      if (!secondStep) throw new Error("Reprioritization test needs a second step.");
      const reprioritized = await window.nerve.reorderStep(secondStep.id, "up");
      if (reprioritized.activeStep?.id !== secondStep.id) {
        throw new Error("Moving a pending step to priority 1 did not make it active.");
      }
      if (reprioritized.steps.find((step) => step.id === started.activeStep?.id)?.status !== "pending") {
        throw new Error("Previous active step was not demoted after reprioritization.");
      }

      const paused = await window.nerve.pauseSession();
      if (paused.session?.status !== "paused") throw new Error("Pause failed in break test.");

      const endedWhilePaused = await window.nerve.endSession();
      if (endedWhilePaused.session?.status !== "completed") {
        throw new Error("End session did not complete a paused session.");
      }

      const restarted = await window.nerve.startSession({
        goal: "Break test: draft one resilient essay paragraph.",
        deadlineText: "later",
        parsedSteps: [
          {
            title: "Draft one resilient essay paragraph",
            nextAction: "Open the document and write one rough sentence.",
            explanation: "A rough sentence is enough to begin.",
            taskType: "Essay writing",
            deadlineText: "",
            dueAt: null,
            reminderAt: null
          },
          {
            title: "Check the paragraph",
            nextAction: "Read the sentence once and fix one unclear word.",
            explanation: "Only one clarity pass is needed for this test.",
            taskType: "Essay writing",
            deadlineText: "",
            dueAt: null,
            reminderAt: null
          }
        ]
      });
      if (!restarted.session || !restarted.activeStep) throw new Error("Session did not restart after ending paused session.");

      const deletedActive = await window.nerve.deleteStep(restarted.activeStep.id);
      if (!deletedActive.activeStep && deletedActive.session?.status !== "completed") {
        throw new Error("Deleting active step left no active step.");
      }

      const activeBeforeComplete = deletedActive.activeStep;
      if (activeBeforeComplete) {
        const completedViaPlan = await window.nerve.updateStep(activeBeforeComplete.id, { status: "complete" });
        if (!completedViaPlan.activeStep && completedViaPlan.session?.status !== "completed") {
          throw new Error("Plan-editor completion left no active step.");
        }
        if (completedViaPlan.guidanceSteps.filter((step) => step.status === "active").length > 1) {
          throw new Error("Plan-editor completion left multiple active guidance rows.");
        }
      }

      await window.nerve.setOverlayExpanded(true);
      await window.nerve.setOverlayExpanded(false);

      const postDelete = await window.nerve.deleteAllData();
      const cleaned = await window.nerve.getSnapshot();
      if (cleaned.session || cleaned.steps.length || cleaned.events.length || cleaned.screenshots.length || cleaned.reminders.length) {
        throw new Error("Delete all data left session data behind.");
      }
      await window.nerve.updateSettings(originalSettings);

      return {
        rejectedBlankGoal,
        sanitizedInterval: sanitized.settings.screenshotIntervalSeconds,
        sanitizedOpacity: sanitized.settings.panelOpacity,
        endedPaused: endedWhilePaused.session?.status === "completed",
        activeAfterDelete: Boolean(deletedActive.activeStep),
        cleaned: !cleaned.session && cleaned.steps.length === 0
      };
    })();
  `);

  const hotkeyStart = overlayExpanded;
  toggleOverlayFromHotkey();
  const hotkeyToggled = overlayExpanded;
  toggleOverlayFromHotkey();
  if (hotkeyToggled === hotkeyStart || overlayExpanded !== hotkeyStart) {
    throw new Error("Overlay hotkey toggle did not safely flip and restore overlay state.");
  }

  console.log(`[nerve-break] PASS ${JSON.stringify(result)}`);
  app.quit();
}

app.whenReady().then(() => {
  ensureStorage();
  registerLocalFileProtocol();
  registerIpc();
  createOverlayWindow();
  createMainWindow();
  activeSessionId = getResumableSession()?.id ?? null;
  createCatWindow();
  syncCatWindowVisibility(snapshot());
  pruneOldScreenshots();
  pruneMissingScreenshotFiles();
  resetCaptureLoop();
  resetReminderLoop();
  registerGlobalHotkeys();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createMainWindow();
      createCatWindow();
      syncCatWindowVisibility(snapshot());
    }
  });
  if (process.env.NERVE_BREAK_TEST === "1") {
    setTimeout(() => {
      runBreakTest().catch((error: unknown) => {
        console.error(`[nerve-break] FAIL ${String(error)}`);
        app.exit(1);
      });
    }, 1500);
  } else if (process.env.NERVE_SMOKE_TEST === "1") {
    setTimeout(() => {
      runSmokeTest().catch((error: unknown) => {
        console.error(`[nerve-smoke] FAIL ${String(error)}`);
        app.exit(1);
      });
    }, 1500);
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  closeOverlayWindow();
  closeCatWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
