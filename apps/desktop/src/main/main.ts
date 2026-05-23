import { app, BrowserWindow, globalShortcut, ipcMain, net, Notification, protocol, safeStorage, screen, shell } from "electron";
import { CaptureService, getActiveWindowFallback, isNoisyDetection, type ScreenCapture } from "./capture.js";
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
  type TaskType
} from "@nerve/shared";
import { schema, settingsTable } from "./db/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isSelfTest = process.env.NERVE_SMOKE_TEST === "1" || process.env.NERVE_BREAK_TEST === "1";

if (isSelfTest) {
  app.setPath("userData", path.join(app.getPath("temp"), `NerveSelfTest-${process.pid}`));
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
let bannedSiteAlert: BannedSiteAlert | null = null;
let bannedSiteStrikeCount = 0;
let lastBannedSiteEventKey: string | null = null;
let lastBannedSiteEventAt = 0;
let currentBreadcrumbId: string | null = null;
let currentBreadcrumbKey: string | null = null;
let currentBreadcrumbStartedAt: string | null = null;
let cachedSettings: NerveSettings | null = null;
let isQuitting = false;

const overlaySlimWidth = 56;
const overlayExpandedWidth = 260;
const overlayBannedWidth = 320;
const DELAY_MINUTES = 5;
const MANUAL_COLLAPSE_COOLDOWN_MS = 60_000;

const settingOptions = {
  aiProvider: ["deepseek"],
  screenshotIntervalSeconds: [10, 30, 60],
  stuckThresholdMinutes: [5, 8, 10],
  driftThresholdMinutes: [3, 6, 10],
  thinkingPauseMinutes: [3, 5, 10],
  panelOpacity: [0.3, 0.5, 0.8],
  language: ["en", "zh"]
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

function normalizePlanSteps(steps: PlanStepDraft[], fallbackTaskType: TaskType): PlanStepDraft[] {
  return steps
    .filter((step) => step.title?.trim() && step.nextAction?.trim())
    .map((step) => ({
      title: step.title.trim(),
      nextAction: step.nextAction.trim(),
      explanation: step.explanation?.trim() || "One small step is enough.",
      taskType: canonicalTaskType(step.taskType, fallbackTaskType),
      deadlineText: step.deadlineText?.trim() || "",
      dueAt: validIso(step.dueAt),
      reminderAt: validIso(step.reminderAt)
    }));
}

function scheduleTimeForStep(step: Pick<PlanStepDraft, "reminderAt" | "dueAt">) {
  const reminder = step.reminderAt ? Date.parse(step.reminderAt) : Number.POSITIVE_INFINITY;
  const due = step.dueAt ? Date.parse(step.dueAt) : Number.POSITIVE_INFINITY;
  const firstScheduledTime = Math.min(
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
      due_at TEXT, reminder_at TEXT
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, order_index INTEGER NOT NULL, title TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'General writing', deadline_text TEXT NOT NULL DEFAULT '',
      due_at TEXT, reminder_at TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      completed_at TEXT
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
  `);
  ensureColumn("sessions", "task_types_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("steps", "task_type", "TEXT NOT NULL DEFAULT 'General writing'");
  ensureColumn("steps", "deadline_text", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("steps", "due_at", "TEXT");
  ensureColumn("steps", "reminder_at", "TEXT");
  ensureColumn("ai_observations", "detected_task_type", "TEXT");
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
  cachedSettings = null;
}

function registerLocalFileProtocol() {
  protocol.handle("nerve-file", (request) => {
    const url = new URL(request.url);
    const requestedPath = decodeURIComponent(url.pathname.slice(1));
    const resolvedPath = path.resolve(requestedPath);
    const allowedRoot = path.resolve(dataDir());
    if (!resolvedPath.startsWith(allowedRoot)) {
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
    updatedAt: row.updated_at
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
    status: row.status,
    atomizationLevel: row.atomization_level,
    delayCount: row.delay_count,
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
    status: row.status,
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
    status: row.status,
    atomizationLevel: row.atomization_level ?? 0,
    delayCount: row.delay_count ?? 0,
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

function rowObservation(row: any): AIObservationRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    screenshotId: row.screenshot_id,
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
  cachedSettings = result;
  return cachedSettings;
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
  resetCaptureLoop();
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

function activateNextPendingStep(sessionId: string, afterOrderIndex = -1) {
  const timestamp = now();
  const nextStep = db
    .prepare(
      `SELECT * FROM activities
       WHERE session_id = ? AND status = 'pending' AND order_index > ?
       ORDER BY order_index LIMIT 1`
    )
    .get(sessionId, afterOrderIndex) as any;
  const fallbackStep =
    nextStep ??
    (db
      .prepare("SELECT * FROM activities WHERE session_id = ? AND status = 'pending' ORDER BY order_index LIMIT 1")
      .get(sessionId) as any);
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
  const due = validIso(step.dueAt);
  if (!due) return null;
  return new Date(Date.parse(due) - 30 * 60_000).toISOString();
}

function syncStepReminder(step: StepRecord) {
  db.prepare("DELETE FROM reminders WHERE step_id = ? AND status = 'scheduled'").run(step.id);
  const reminderAt = reminderAtForStep(step);
  if (!reminderAt) return;
  const dueAt = validIso(step.dueAt);
  const deadlineText = step.deadlineText || (dueAt ? new Date(dueAt).toLocaleString() : "");
  db.prepare(`INSERT INTO reminders (
    id, session_id, step_id, task_type, title, message, deadline_text, due_at, reminder_at, status, created_at, triggered_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, NULL)`).run(
    id(),
    step.sessionId,
    step.id,
    step.taskType,
    step.title,
    `Next up: ${step.nextAction}`,
    deadlineText,
    dueAt,
    reminderAt,
    now()
  );
}

function checkReminders() {
  const session = getCurrentActiveSession();
  if (!session) return;
  const timestamp = now();
  const rows = db
    .prepare(`SELECT r.* FROM reminders r JOIN sessions s ON s.id = r.session_id WHERE r.status = 'scheduled' AND r.reminder_at <= ? AND s.status = 'active' AND r.session_id = ? ORDER BY r.reminder_at LIMIT 10`)
    .all(timestamp, session.id) as any[];
  for (const row of rows) {
    const reminder = rowReminder(row);
    db.prepare("UPDATE reminders SET status = 'triggered', triggered_at = ? WHERE id = ?").run(timestamp, reminder.id);
    addEvent(reminder.sessionId, "deadline_reminder_triggered", reminder.title, {
      stepId: reminder.stepId,
      taskType: reminder.taskType,
      dueAt: reminder.dueAt,
      reminderAt: reminder.reminderAt
    });
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: "Nerve reminder",
        body: reminder.dueAt ? `${reminder.title} is due ${new Date(reminder.dueAt).toLocaleTimeString()}. ${reminder.message}` : reminder.message,
        silent: false
      });
      notification.on("click", () => createMainWindow("/log"));
      notification.show();
    }
    overlayExpanded = true;
  }
  if (rows.length > 0) broadcast();
}

function resetReminderLoop() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = null;
  if (!getCurrentActiveSession()) return;
  reminderTimer = setInterval(checkReminders, 30_000);
  checkReminders();
}

function provider(settings = getSettings()): AIProvider {
  return new DeepSeekAIProvider(settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "", settings.deepseekModel || process.env.DEEPSEEK_MODEL || "deepseek-chat");
}

const analysisService = new AnalysisService(() => provider());

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
    hideBlockerWindow();
    return false;
  }
  const timestamp = now();
  bannedSiteAlert = {
    rule,
    activeApp: context.activeApp,
    windowTitle: context.windowTitle,
    detectedAt: timestamp
  };
  overlayExpanded = true;
  overlaySuppressUntil = 0;
  showBlockerWindow();
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
        title: "Nerve",
        body: `Leave ${rule} and return to your task.`,
        silent: false
      }).show();
    }
  }
  return true;
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
    const thinkingActive = Boolean(thinkingPauseUntil && Date.parse(thinkingPauseUntil) > Date.now());
    const delayExpired = Boolean(delayUntil && Date.parse(delayUntil) <= Date.now());

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
    if (stuckReached || driftReached || delayExpired || observation.shouldIntervene) {
      const expanded = expandOverlayFromSystem();
      if (delayExpired) delayUntil = null;
      if (expanded) {
        addEvent(session.id, "step_shown", observation.conciseExplanation, { interventionType: observation.interventionType });
      }
    }

    db.prepare(`INSERT INTO ai_observations (
      id, session_id, screenshot_id, provider, model, user_state, task_relevance, progress_state, active_app,
      active_context, visible_change_summary, concise_explanation, suggested_next_action, suggested_step_complete,
      should_intervene, intervention_type, urgency, breadcrumb_relevance, detected_task_type, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id(), session.id, screenshotId,
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
  const old = db.prepare("SELECT file_path, thumbnail_path FROM screenshots WHERE created_at < ?").all(cutoff) as Array<{ file_path: string; thumbnail_path: string }>;
  for (const row of old) {
    try { fs.rmSync(row.file_path, { force: true }); } catch { /* file already gone */ }
    try { fs.rmSync(row.thumbnail_path, { force: true }); } catch { /* file already gone */ }
  }
  if (old.length > 0) {
    db.prepare("DELETE FROM screenshots WHERE created_at < ?").run(cutoff);
  }
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
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = null;
}

function stopSessionLoops() {
  captureService?.stop();
  captureService = null;
  clearDelayTimer();
  clearReminderLoop();
  finishCurrentBreadcrumb();
}

function canAutoExpandOverlay() {
  return Date.now() >= overlaySuppressUntil;
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
    screenshots: sessionId
      ? (db.prepare(`SELECT s.*, o.user_state ai_state, st.title step_title
          FROM screenshots s
          LEFT JOIN ai_observations o ON o.screenshot_id = s.id
          LEFT JOIN activities st ON st.session_id = s.session_id AND st.status = 'active'
          WHERE s.session_id = ? ORDER BY s.captured_at DESC LIMIT 80`).all(sessionId) as any[]).map(rowScreenshot)
      : [],
    events: sessionId ? (db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at DESC LIMIT 120").all(sessionId) as any[]).map(rowEvent) : [],
    breadcrumbs: sessionId ? (db.prepare("SELECT * FROM breadcrumbs WHERE session_id = ? ORDER BY started_at DESC LIMIT 40").all(sessionId) as any[]).map(rowBreadcrumb) : [],
    observations: sessionId ? (db.prepare("SELECT * FROM ai_observations WHERE session_id = ? ORDER BY created_at DESC LIMIT 50").all(sessionId) as any[]).map(rowObservation) : [],
    taskHistory: sessionId ? (db.prepare("SELECT * FROM task_history WHERE session_id = ? ORDER BY created_at DESC LIMIT 80").all(sessionId) as any[]).map(rowTaskHistory) : [],
    reminders: sessionId ? (db.prepare("SELECT * FROM reminders WHERE session_id = ? ORDER BY reminder_at ASC LIMIT 80").all(sessionId) as any[]).map(rowReminder) : [],
    settings: getSettings(),
    overlayExpanded,
    delayUntil,
    thinkingPauseUntil,
    bannedSiteAlert,
    bannedSiteStrikeCount,
    screenshotFolder: screenshotDir()
  };
}

function broadcast() {
  applyOverlayBounds();
  const data = snapshot();
  overlayWindow?.webContents.send("nerve:snapshot", data);
  mainWindow?.webContents.send("nerve:snapshot", data);
  if (blockerWindow && !blockerWindow.isDestroyed()) {
    blockerWindow.webContents.send("nerve:snapshot", data);
  }
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
  if (blockerWindow && !blockerWindow.isDestroyed()) {
    blockerWindow.hide();
  }
}

function registerGlobalHotkeys() {
  globalShortcut.unregister("Super+Shift+N");
  const registered = globalShortcut.register("Super+Shift+N", toggleOverlayFromHotkey);
  if (!registered) {
    console.warn("[nerve] Win+Shift+N could not be registered.");
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
    title: "Nerve",
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
  ipcMain.handle("nerve:setOverlayExpanded", (_event, expanded: boolean) => {
    overlayExpanded = bannedSiteAlert ? true : expanded;
    overlaySuppressUntil = overlayExpanded ? 0 : Date.now() + MANUAL_COLLAPSE_COOLDOWN_MS;
    applyOverlayBounds();
    broadcast();
  });
  ipcMain.handle("nerve:openMain", (_event, route = "/") => createMainWindow(route));
  ipcMain.handle("nerve:dismissBlocker", () => hideBlockerWindow());
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
    const steps = sortPlanStepsBySchedule(normalizePlanSteps(parsed.steps, taskType === "Mixed work" ? requestedScopes[0] : taskType));
    if (steps.length === 0) {
      throw new Error("DeepSeek did not return any usable tasks.");
    }
    return { steps, taskTypes: scopesFromSteps(steps, requestedScopes) };
  });
  ipcMain.handle("nerve:deleteAllData", () => {
    stopSessionLoops();
    activeSessionId = null;
    overlayExpanded = false;
    overlaySuppressUntil = 0;
    thinkingPauseUntil = null;
    bannedSiteAlert = null;
    hideBlockerWindow();
    bannedSiteStrikeCount = 0;
    lastBannedSiteEventKey = null;
    cachedSettings = null;
    db.exec("DELETE FROM sessions; DELETE FROM steps; DELETE FROM activities; DELETE FROM guidance_steps; DELETE FROM screenshots; DELETE FROM ai_observations; DELETE FROM events; DELETE FROM breadcrumbs; DELETE FROM task_history; DELETE FROM reminders;");
    fs.rmSync(screenshotDir(), { recursive: true, force: true });
    fs.mkdirSync(screenshotDir(), { recursive: true });
    broadcast();
  });
  ipcMain.handle("nerve:startSession", async (_event, input: { goal: string; deadlineText?: string; taskType?: TaskType; taskTypes?: TaskType[]; parsedSteps?: PlanStepDraft[] }) => {
    const goal = typeof input.goal === "string" ? input.goal.trim() : "";
    if (!goal) {
      throw new Error("A goal is required.");
    }
    const requestedTaskTypes = inferTaskScopesFromText(goal, input.taskTypes ?? (input.taskType ? [input.taskType] : []));
    const parsedSteps = input.parsedSteps?.length ? normalizePlanSteps(input.parsedSteps, requestedTaskTypes[0]) : [];
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

    stopSessionLoops();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE status IN ('active', 'paused')").run(timestamp, timestamp);
    db.prepare("INSERT INTO sessions (id, goal, task_type, task_types_json, deadline_text, status, started_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)").run(
      sessionId,
      goal,
      taskType,
      JSON.stringify(taskTypes),
      input.deadlineText || "",
      timestamp,
      timestamp,
      timestamp
    );
    const insertActivity = db.prepare("INSERT INTO activities (id, session_id, order_index, title, task_type, deadline_text, due_at, reminder_at, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
    const insertGuidance = db.prepare("INSERT INTO guidance_steps (id, activity_id, session_id, order_index, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, ?, 0, 0, ?, ?, NULL)");
    plan.steps.forEach((step: PlanStepDraft, index: number) => {
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
        index === 0 ? "active" : "pending",
        timestamp,
        timestamp
      );
      insertGuidance.run(id(), activityId, sessionId, step.nextAction, step.explanation, index === 0 ? "active" : "pending", timestamp, timestamp);
    });
    for (const step of getSteps(sessionId)) syncStepReminder(step);
    activeSessionId = sessionId;
    overlayExpanded = false;
    overlaySuppressUntil = 0;
    delayUntil = null;
    thinkingPauseUntil = null;
    bannedSiteAlert = null;
    hideBlockerWindow();
    bannedSiteStrikeCount = 0;
    lastBannedSiteEventKey = null;
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
    thinkingPauseUntil = null;
    bannedSiteAlert = null;
    hideBlockerWindow();
    bannedSiteStrikeCount = 0;
    lastBannedSiteEventKey = null;
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
      "INSERT INTO activities (id, session_id, order_index, title, task_type, deadline_text, due_at, reminder_at, status, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)"
    );
    const insertGuidance = db.prepare(
      "INSERT INTO guidance_steps (id, activity_id, session_id, order_index, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, 0, ?, ?, 'pending', 0, 0, ?, ?, NULL)"
    );

    plan.steps.forEach((step: PlanStepDraft, index: number) => {
      const activityId = id();
      insertActivity.run(activityId, session.id, nextIdx + index, step.title, step.taskType ?? session.taskType, step.deadlineText ?? "", validIso(step.dueAt), validIso(step.reminderAt), timestamp, timestamp);
      insertGuidance.run(id(), activityId, session.id, step.nextAction, step.explanation, timestamp, timestamp);
    });

    if (!getActiveStep(session.id)) activateNextPendingStep(session.id);
    for (const step of getSteps(session.id)) syncStepReminder(step);

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
      status: "status",
      orderIndex: "order_index"
    } as const;
    for (const key of Object.keys(activityColumnMap) as Array<keyof typeof activityColumnMap>) {
      if (patch[key] !== undefined) {
        const column = activityColumnMap[key];
        if (key === "status" && patch.status === "active") {
          db.prepare("UPDATE activities SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'active'").run(
            now(),
            existing.session_id
          );
        }
        const value = key === "dueAt" || key === "reminderAt" ? validIso(patch[key] as string | null | undefined) : patch[key];
        db.prepare(`UPDATE activities SET ${column} = ?, updated_at = ? WHERE id = ?`).run(value, now(), stepId);
      }
    }
    if (patch.status === "active") {
      const timestamp = now();
      db.prepare("UPDATE guidance_steps SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'active'").run(
        timestamp,
        existing.session_id
      );
      const nextGuidance = getActiveGuidanceStep(stepId);
      if (nextGuidance) {
        db.prepare("UPDATE guidance_steps SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, nextGuidance.id);
      }
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
    if (refreshed) syncStepReminder(refreshed);
    if (existing.status === "active" && patch.status === "complete") {
      db.prepare("UPDATE reminders SET status = 'dismissed' WHERE step_id = ? AND status = 'scheduled'").run(stepId);
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
      db.prepare("UPDATE reminders SET status = 'dismissed' WHERE step_id = ? AND status = 'scheduled'").run(stepId);
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
    const other = db
      .prepare(`SELECT * FROM activities WHERE session_id = ? AND order_index ${direction === "up" ? "<" : ">"} ? ORDER BY order_index ${direction === "up" ? "DESC" : "ASC"} LIMIT 1`)
      .get(step.session_id, step.order_index) as any;
    if (other) {
      db.prepare("UPDATE activities SET order_index = ? WHERE id = ?").run(other.order_index, step.id);
      db.prepare("UPDATE activities SET order_index = ? WHERE id = ?").run(step.order_index, other.id);
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:action", async (_event, action: "done" | "thinking" | "delay" | "atomize" | "markDone" | "keepWorking") => {
    const session = getCurrentActiveSession();
    if (!session) return snapshot();
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
        db.prepare("UPDATE reminders SET status = 'dismissed' WHERE step_id = ? AND status = 'scheduled'").run(step.id);
        const nextStep = activateNextPendingStep(session.id, step.orderIndex);
        if (nextStep) {
          addEvent(session.id, "step_done", "Activity marked done. Moving to the next activity.", { stepId: step.id });
        } else {
          addEvent(session.id, "session_completed", "Session complete.");
        }
      }
      overlayExpanded = true;
    }

    if (action === "thinking") {
      const minutes = getSettings().thinkingPauseMinutes;
      thinkingPauseUntil = new Date(Date.now() + minutes * 60_000).toISOString();
      addEvent(session.id, "thinking_clicked", "Got it. I’ll hold this step while you think.", { until: thinkingPauseUntil });
      overlayExpanded = true;
    }

    if (action === "delay") {
      delayUntil = new Date(Date.now() + DELAY_MINUTES * 60_000).toISOString();
      if (delayTimer) clearTimeout(delayTimer);
      delayTimer = setTimeout(() => {
        const current = getCurrentSession();
        if (!current || current.status !== "active") return;
        expandOverlayFromSystem();
        delayUntil = null;
        addEvent(current.id, "delay_expired", "Five minutes finished. The next step is still here.");
        broadcast();
      }, DELAY_MINUTES * 60_000);
      const guidance = getActiveGuidanceStep(step.id);
      if (guidance) {
        db.prepare("UPDATE guidance_steps SET delay_count = delay_count + 1, updated_at = ? WHERE id = ?").run(timestamp, guidance.id);
      }
      addEvent(session.id, "delay_clicked", "Five more minutes started.", { until: delayUntil });
      overlayExpanded = true;
    }

    if (action === "atomize") {
      try {
        const guidance = getActiveGuidanceStep(step.id);
        const smaller = await analysisService.atomizeStep({
          goal: session.goal,
          taskType: step.taskType,
          sessionTaskTypes: session.taskTypes,
          language: getSettings().language,
          currentStepTitle: step.title,
          currentNextAction: guidance?.nextAction ?? step.nextAction,
          atomizationLevel: guidance?.atomizationLevel ?? step.atomizationLevel,
          delayCount: guidance?.delayCount ?? step.delayCount
        });
        if (guidance) {
          db.prepare("UPDATE guidance_steps SET next_action = ?, explanation = ?, atomization_level = ?, updated_at = ? WHERE id = ?").run(
            smaller.nextAction,
            smaller.explanation,
            smaller.atomizationLevel,
            timestamp,
            guidance.id
          );
        }
        addEvent(session.id, "step_atomized", "The next action was made smaller.", { ...smaller });
      } catch (error) {
        addEvent(session.id, "provider_error", "DeepSeek could not make the step smaller. Check the API key, model, or network connection.", { error: String(error) });
      }
      overlayExpanded = true;
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

      const delayed = await window.nerve.action("delay");
      if (!delayed.delayUntil) throw new Error("Delay countdown was not set.");

      const paused = await window.nerve.pauseSession();
      if (paused.session?.status !== "paused") throw new Error("Pause did not mark the session paused.");
      if (paused.delayUntil || paused.thinkingPauseUntil) throw new Error("Pause left session timers visible.");

      const blockedWhilePaused = await window.nerve.action("done");
      if (blockedWhilePaused.session?.status !== "paused") throw new Error("Paused session accepted an active-only action.");

      const resumed = await window.nerve.resumeSession();
      if (resumed.session?.status !== "active") throw new Error("Resume did not reactivate the session.");
      if (!resumed.activeStep) throw new Error("Resume lost the active step.");

      const atomized = await window.nerve.action("atomize");
      if (!atomized.activeStep) {
        throw new Error("Atomize lost the active step.");
      }
      if (atomized.activeStep.atomizationLevel < 1 && !atomized.events.some((event) => event.type === "provider_error")) {
        throw new Error("Atomize neither updated the step nor logged a provider issue.");
      }

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
  pruneOldScreenshots();
  resetCaptureLoop();
  resetReminderLoop();
  registerGlobalHotkeys();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createMainWindow();
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
});

app.on("window-all-closed", () => {
  app.quit();
});
