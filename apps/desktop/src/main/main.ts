import { app, BrowserWindow, desktopCapturer, ipcMain, net, protocol, safeStorage, screen, shell } from "electron";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import {
  DeepSeekAIProvider,
  MockAIProvider,
  defaultSettings,
  type AIObservationRecord,
  type AIProvider,
  type AnalyzeScreenInput,
  type AppSnapshot,
  type BreadcrumbRecord,
  type BreadcrumbRelevance,
  type EventRecord,
  type NerveSettings,
  type ScreenshotRecord,
  type SessionRecord,
  type StepRecord,
  type TaskType
} from "@nerve/shared";
import { schema, settingsTable } from "./db/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

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
let db: Database.Database;
let orm: BetterSQLite3Database<typeof schema>;
let captureTimer: NodeJS.Timeout | null = null;
let delayTimer: NodeJS.Timeout | null = null;
let activeSessionId: string | null = null;
let previousHash: string | null = null;
let overlayExpanded = false;
let overlaySuppressUntil = 0;
let delayUntil: string | null = null;
let thinkingPauseUntil: string | null = null;
let currentBreadcrumbId: string | null = null;
let currentBreadcrumbKey: string | null = null;
let currentBreadcrumbStartedAt: string | null = null;
let cachedSettings: NerveSettings | null = null;

const overlaySlimWidth = 56;
const overlayExpandedWidth = 260;
const DELAY_MINUTES = 5;
const MANUAL_COLLAPSE_COOLDOWN_MS = 60_000;

const settingOptions = {
  aiProvider: ["mock", "deepseek"],
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
      status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, order_index INTEGER NOT NULL, title TEXT NOT NULL,
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
      raw_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL,
      metadata_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS breadcrumbs (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, app_name TEXT NOT NULL, window_title TEXT NOT NULL,
      relevance TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_steps_session ON steps(session_id, order_index);
    CREATE INDEX IF NOT EXISTS idx_screenshots_session ON screenshots(session_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_observations_session ON ai_observations(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_breadcrumbs_session ON breadcrumbs(session_id, started_at);
  `);
  for (const [key, value] of Object.entries(defaultSettings)) {
    orm.insert(settingsTable)
      .values({ key, value: JSON.stringify(value), updatedAt: now() })
      .onConflictDoNothing()
      .run();
  }
  applyUserRequestedDefaults();
}

function applyUserRequestedDefaults() {
  const timestamp = now();
  for (const [key, value] of Object.entries({ screenshotIntervalSeconds: 60, panelOpacity: 0.5 })) {
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
  return {
    id: row.id,
    goal: row.goal,
    taskType: row.task_type,
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
    status: row.status,
    atomizationLevel: row.atomization_level,
    delayCount: row.delay_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
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
  return normalized;
}

function getActiveSession(): SessionRecord | null {
  const row = db.prepare("SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1").get();
  return row ? rowSession(row) : null;
}

function getSessionById(sessionId: string): SessionRecord | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  return row ? rowSession(row) : null;
}

function getCurrentSession(): SessionRecord | null {
  const active = getActiveSession();
  if (active) return active;
  return activeSessionId ? getSessionById(activeSessionId) : null;
}

function getSteps(sessionId: string): StepRecord[] {
  return (db.prepare("SELECT * FROM steps WHERE session_id = ? ORDER BY order_index").all(sessionId) as any[]).map(rowStep);
}

function getActiveStep(sessionId: string): StepRecord | null {
  const row = db.prepare("SELECT * FROM steps WHERE session_id = ? AND status = 'active' ORDER BY order_index LIMIT 1").get(sessionId);
  return row ? rowStep(row) : null;
}

function activateNextPendingStep(sessionId: string, afterOrderIndex = -1) {
  const timestamp = now();
  const nextStep = db
    .prepare(
      `SELECT * FROM steps
       WHERE session_id = ? AND status = 'pending' AND order_index > ?
       ORDER BY order_index LIMIT 1`
    )
    .get(sessionId, afterOrderIndex) as any;
  const fallbackStep =
    nextStep ??
    (db
      .prepare("SELECT * FROM steps WHERE session_id = ? AND status = 'pending' ORDER BY order_index LIMIT 1")
      .get(sessionId) as any);
  if (fallbackStep) {
    db.prepare("UPDATE steps SET status = 'active', updated_at = ? WHERE id = ?").run(timestamp, fallbackStep.id);
    return rowStep(fallbackStep);
  }
  db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, sessionId);
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = null;
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

function provider(settings = getSettings()): AIProvider {
  if (settings.aiProvider === "deepseek") {
    return new DeepSeekAIProvider(settings.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "", settings.deepseekModel || process.env.DEEPSEEK_MODEL || "deepseek-chat");
  }
  return new MockAIProvider();
}

let activeWinFn: (() => Promise<any>) | null = null;

async function getActiveWindowFallback(sourceName = "Unknown screen") {
  try {
    if (!activeWinFn) {
      const mod = await import("active-win");
      const m = mod as unknown as { default?: () => Promise<any>; activeWindow?: () => Promise<any> };
      activeWinFn = m.default ?? m.activeWindow ?? null;
    }
    const active = activeWinFn ? await activeWinFn() : null;
    return {
      activeApp: sanitizeTitle(active?.owner?.name || "Unknown app"),
      windowTitle: sanitizeTitle(active?.title || sourceName)
    };
  } catch {
    return { activeApp: "Unknown app", windowTitle: sanitizeTitle(sourceName) };
  }
}

function sanitizeTitle(title: string): string {
  return title
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?/gi, "[site]")
    .slice(0, 180);
}

function classifyRelevance(appName: string, windowTitle: string): BreadcrumbRelevance {
  const text = `${appName} ${windowTitle}`;
  if (
    /essay|word|doc|docs|notes|research|article|pdf|citation|library|journal|paper|media|code|codex|vscode|visual studio|terminal|powershell|github|git|localhost|api|figma|canva|design|calendar|gmail|outlook|mail|form|portal|course|lecture|slides|todo|task|planner|notion/i.test(
      text
    )
  ) {
    return "productive";
  }
  if (/discord|youtube|tiktok|instagram|reddit|netflix|steam|game/i.test(text)) return "unproductive";
  return "unknown";
}

function isNoisyDetection(appName: string, windowTitle: string) {
  const text = `${appName} ${windowTitle}`;
  return /electron.*nerve|^nerve\b|snipping tool|entire screen/i.test(text);
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

async function capturePrimaryScreen() {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: display.size.width, height: display.size.height }
  });
  const source = sources[0];
  if (!source) throw new Error("No screen source available.");
  return { image: source.thumbnail, sourceName: source.name };
}

function imageHash(image: Electron.NativeImage): string {
  const small = image.resize({ width: 8, height: 8, quality: "good" });
  const bitmap = small.toBitmap();
  const values: number[] = [];
  for (let i = 0; i < bitmap.length; i += 4) {
    values.push((bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3);
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return values.map((value) => (value >= avg ? "1" : "0")).join("");
}

function recentBreadcrumbs(sessionId: string): BreadcrumbRecord[] {
  return (db.prepare("SELECT * FROM breadcrumbs WHERE session_id = ? ORDER BY started_at DESC LIMIT 6").all(sessionId) as any[])
    .map(rowBreadcrumb)
    .reverse();
}

async function analyzeTick() {
  const session = getActiveSession();
  if (!session) return;
  activeSessionId = session.id;
  const activeStep = getActiveStep(session.id);
  if (!activeStep) return;

  try {
    const settings = getSettings();
    const { image, sourceName } = await capturePrimaryScreen();
    const detectedContext = await getActiveWindowFallback(sourceName);
    const usefulContext = isNoisyDetection(detectedContext.activeApp, detectedContext.windowTitle)
      ? lastUsefulContext(session.id) ?? detectedContext
      : detectedContext;
    const { activeApp, windowTitle } = usefulContext;
    updateBreadcrumb(session.id, activeApp, windowTitle);
    const hash = imageHash(image);
    const changed = previousHash === null ? true : previousHash !== hash;
    previousHash = hash;

    const capturedAt = now();
    let screenshotId: string | null = null;
    if (settings.storeScreenshots) {
      screenshotId = id();
      const fullPath = path.join(screenshotDir(), `${capturedAt.replace(/[:.]/g, "-")}-${screenshotId}.jpg`);
      const thumbPath = path.join(screenshotDir(), `${capturedAt.replace(/[:.]/g, "-")}-${screenshotId}-thumb.jpg`);
      fs.writeFileSync(fullPath, image.toJPEG(85));
      fs.writeFileSync(thumbPath, image.resize({ width: 320, height: 180, quality: "good" }).toJPEG(75));
      db.prepare("INSERT INTO screenshots (id, session_id, file_path, thumbnail_path, captured_at, active_app, window_title, perceptual_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        screenshotId,
        session.id,
        fullPath,
        thumbPath,
        capturedAt,
        activeApp,
        windowTitle,
        hash,
        capturedAt
      );
      addEvent(session.id, "screenshot_captured", "Screenshot captured and stored locally.", { screenshotId });
    }

    const elapsedOnStep = Math.round((Date.now() - Date.parse(activeStep.updatedAt)) / 1000);
    const elapsedInApp = currentBreadcrumbStartedAt ? Math.round((Date.now() - Date.parse(currentBreadcrumbStartedAt)) / 1000) : 0;
    const thinkingActive = Boolean(thinkingPauseUntil && Date.parse(thinkingPauseUntil) > Date.now());
    const delayExpired = Boolean(delayUntil && Date.parse(delayUntil) <= Date.now());

    const analyzeInput: AnalyzeScreenInput = {
      sessionGoal: session.goal,
      taskType: session.taskType,
      language: settings.language,
      currentStep: {
        title: activeStep.title,
        nextAction: activeStep.nextAction,
        explanation: activeStep.explanation,
        id: activeStep.id,
        atomizationLevel: activeStep.atomizationLevel,
        delayCount: activeStep.delayCount
      },
      activeApp,
      windowTitle,
      elapsedOnCurrentStepSeconds: elapsedOnStep,
      elapsedInCurrentAppSeconds: elapsedInApp,
      screenshotChangedSinceLastCapture: changed,
      recentBreadcrumbs: recentBreadcrumbs(session.id),
      delayCount: activeStep.delayCount,
      atomizationLevel: activeStep.atomizationLevel,
      thinkingPauseActive: thinkingActive
    };
    let selectedProvider = provider(settings);
    let observation = await selectedProvider
      .analyzeScreen(analyzeInput)
      .catch(async (error: unknown) => {
        addEvent(session.id, "provider_error", "DeepSeek was unavailable. Falling back to Mock mode.", { error: String(error) });
        selectedProvider = new MockAIProvider();
        return selectedProvider.analyzeScreen(analyzeInput);
      });
    observation = {
      ...observation,
      suggestedNextAction: ensurePhysicalAction(observation.suggestedNextAction, activeStep.nextAction)
    };

    const stuckReached = observation.userState === "stuck" && elapsedOnStep >= settings.stuckThresholdMinutes * 60 && !thinkingActive;
    const driftReached =
      observation.userState === "unproductive_drift" && elapsedInApp >= settings.driftThresholdMinutes * 60 && !thinkingActive;
    if (stuckReached || driftReached || delayExpired || observation.shouldIntervene) {
      const expanded = expandOverlayFromSystem();
      if (delayExpired) delayUntil = null;
      if (expanded) {
        addEvent(session.id, "step_shown", observation.conciseExplanation, { interventionType: observation.interventionType });
      }
    }

    const obsId = id();
    db.prepare(`INSERT INTO ai_observations (
      id, session_id, screenshot_id, provider, model, user_state, task_relevance, progress_state, active_app,
      active_context, visible_change_summary, concise_explanation, suggested_next_action, suggested_step_complete,
      should_intervene, intervention_type, urgency, breadcrumb_relevance, raw_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      obsId,
      session.id,
      screenshotId,
      selectedProvider.name,
      settings.aiProvider === "deepseek" ? settings.deepseekModel : "mock",
      observation.userState,
      observation.taskRelevance,
      observation.progressState,
      activeApp,
      observation.activeContext,
      observation.visibleChangeSummary,
      observation.conciseExplanation,
      observation.suggestedNextAction,
      observation.suggestedStepComplete ? 1 : 0,
      observation.shouldIntervene ? 1 : 0,
      observation.interventionType,
      observation.urgency,
      observation.breadcrumbRelevance,
      JSON.stringify(observation),
      now()
    );
    addEvent(session.id, "ai_observation", observation.conciseExplanation, { userState: observation.userState });
    broadcast();
  } catch (error) {
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
  if (captureTimer) clearInterval(captureTimer);
  const session = getActiveSession();
  if (!session) return;
  const settings = getSettings();
  captureTimer = setInterval(() => void analyzeTick(), settings.screenshotIntervalSeconds * 1000);
}

function canAutoExpandOverlay() {
  return Date.now() >= overlaySuppressUntil;
}

function expandOverlayFromSystem() {
  if (!canAutoExpandOverlay()) return false;
  overlayExpanded = true;
  return true;
}

function snapshot(): AppSnapshot {
  const session = getCurrentSession();
  const sessionId = session?.id ?? activeSessionId;
  const steps = sessionId ? getSteps(sessionId) : [];
  return {
    session,
    steps,
    activeStep: sessionId ? getActiveStep(sessionId) : null,
    screenshots: sessionId
      ? (db.prepare(`SELECT s.*, o.user_state ai_state, st.title step_title
          FROM screenshots s
          LEFT JOIN ai_observations o ON o.screenshot_id = s.id
          LEFT JOIN steps st ON st.session_id = s.session_id AND st.status = 'active'
          WHERE s.session_id = ? ORDER BY s.captured_at DESC LIMIT 80`).all(sessionId) as any[]).map(rowScreenshot)
      : [],
    events: sessionId ? (db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at DESC LIMIT 120").all(sessionId) as any[]).map(rowEvent) : [],
    breadcrumbs: sessionId ? (db.prepare("SELECT * FROM breadcrumbs WHERE session_id = ? ORDER BY started_at DESC LIMIT 40").all(sessionId) as any[]).map(rowBreadcrumb) : [],
    observations: sessionId ? (db.prepare("SELECT * FROM ai_observations WHERE session_id = ? ORDER BY created_at DESC LIMIT 50").all(sessionId) as any[]).map(rowObservation) : [],
    settings: getSettings(),
    overlayExpanded,
    delayUntil,
    thinkingPauseUntil,
    screenshotFolder: screenshotDir()
  };
}

function broadcast() {
  applyOverlayBounds();
  const data = snapshot();
  overlayWindow?.webContents.send("nerve:snapshot", data);
  mainWindow?.webContents.send("nerve:snapshot", data);
}

function applyOverlayBounds() {
  if (!overlayWindow) return;
  const display = screen.getDisplayMatching(overlayWindow.getBounds());
  const workArea = display.workArea;
  const width = overlayExpanded ? overlayExpandedWidth : overlaySlimWidth;
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
  void loadWindow(overlayWindow, "/overlay");
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
  void loadWindow(mainWindow, route);
}

function registerIpc() {
  ipcMain.handle("nerve:getSnapshot", () => snapshot());
  ipcMain.handle("nerve:setOverlayExpanded", (_event, expanded: boolean) => {
    overlayExpanded = expanded;
    overlaySuppressUntil = expanded ? 0 : Date.now() + MANUAL_COLLAPSE_COOLDOWN_MS;
    applyOverlayBounds();
    broadcast();
  });
  ipcMain.handle("nerve:openMain", (_event, route = "/") => createMainWindow(route));
  ipcMain.handle("nerve:openScreenshotFolder", () => shell.openPath(screenshotDir()));
  ipcMain.handle("nerve:updateSettings", (_event, patch: Partial<NerveSettings>) => {
    updateSettings(patch);
    return snapshot();
  });
  ipcMain.handle("nerve:deleteAllData", () => {
    if (captureTimer) clearInterval(captureTimer);
    captureTimer = null;
    if (delayTimer) clearTimeout(delayTimer);
    delayTimer = null;
    activeSessionId = null;
    previousHash = null;
    delayUntil = null;
    thinkingPauseUntil = null;
    overlayExpanded = false;
    overlaySuppressUntil = 0;
    currentBreadcrumbId = null;
    currentBreadcrumbKey = null;
    currentBreadcrumbStartedAt = null;
    cachedSettings = null;
    db.exec("DELETE FROM sessions; DELETE FROM steps; DELETE FROM screenshots; DELETE FROM ai_observations; DELETE FROM events; DELETE FROM breadcrumbs;");
    fs.rmSync(screenshotDir(), { recursive: true, force: true });
    fs.mkdirSync(screenshotDir(), { recursive: true });
    broadcast();
  });
  ipcMain.handle("nerve:startSession", async (_event, input: { goal: string; deadlineText?: string; taskType?: TaskType }) => {
    const goal = typeof input.goal === "string" ? input.goal.trim() : "";
    if (!goal) {
      throw new Error("A goal is required.");
    }
    const taskType = input.taskType ?? "General writing";
    const timestamp = now();
    const sessionId = id();
    let planProvider = provider();
    const activeWindow = await getActiveWindowFallback();
    const plan = await planProvider
      .generatePlan({
        goal,
        taskType,
        language: getSettings().language,
        deadlineText: input.deadlineText || "",
        activeApp: activeWindow.activeApp,
        windowTitle: activeWindow.windowTitle
      })
      .catch(async (_error: unknown) => {
        planProvider = new MockAIProvider();
        return planProvider.generatePlan({ goal, taskType, language: getSettings().language, deadlineText: input.deadlineText || "" });
      });

    db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE status = 'active'").run(timestamp, timestamp);
    db.prepare("INSERT INTO sessions (id, goal, task_type, deadline_text, status, started_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, NULL, ?, ?)").run(
      sessionId,
      goal,
      taskType,
      input.deadlineText || "",
      timestamp,
      timestamp,
      timestamp
    );
    const stmt = db.prepare("INSERT INTO steps (id, session_id, order_index, title, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL)");
    plan.steps.forEach((step: { title: string; nextAction: string; explanation: string }, index: number) =>
      stmt.run(id(), sessionId, index, step.title, step.nextAction, step.explanation, index === 0 ? "active" : "pending", timestamp, timestamp)
    );
    activeSessionId = sessionId;
    overlayExpanded = false;
    overlaySuppressUntil = 0;
    delayUntil = null;
    thinkingPauseUntil = null;
    previousHash = null;
    addEvent(sessionId, "session_started", "Session started.", { goal, provider: planProvider.name });
    resetCaptureLoop();
    void analyzeTick();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:endSession", () => {
    const session = getActiveSession();
    if (!session) return snapshot();
    const timestamp = now();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE id = ?")
      .run(timestamp, timestamp, session.id);
    if (captureTimer) clearInterval(captureTimer);
    captureTimer = null;
    delayUntil = null;
    thinkingPauseUntil = null;
    addEvent(session.id, "session_ended", "Session ended by user.");
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

  ipcMain.handle("nerve:updateStep", (_event, stepId: string, patch: Partial<StepRecord>) => {
    const existing = db.prepare("SELECT * FROM steps WHERE id = ?").get(stepId) as any;
    if (!existing) return snapshot();
    const columnMap = {
      title: "title",
      nextAction: "next_action",
      explanation: "explanation",
      status: "status",
      orderIndex: "order_index"
    } as const;
    for (const key of Object.keys(columnMap) as Array<keyof typeof columnMap>) {
      if (patch[key] !== undefined) {
        const column = columnMap[key];
        if (key === "status" && patch.status === "active") {
          db.prepare("UPDATE steps SET status = 'pending', updated_at = ? WHERE session_id = ? AND status = 'active'").run(
            now(),
            existing.session_id
          );
        }
        db.prepare(`UPDATE steps SET ${column} = ?, updated_at = ? WHERE id = ?`).run(patch[key], now(), stepId);
      }
    }
    if (existing.status === "active" && patch.status === "complete") {
      activateNextPendingStep(existing.session_id, existing.order_index);
      addEvent(existing.session_id, "step_done", "Step marked done. Moving to the next step.", { stepId });
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:addStep", (_event, sessionId: string) => {
    const nextIndexRow = db.prepare("SELECT COALESCE(MAX(order_index), -1) + 1 idx FROM steps WHERE session_id = ?").get(sessionId) as { idx: number };
    const nextIndex = Number(nextIndexRow.idx);
    const timestamp = now();
    db.prepare("INSERT INTO steps (id, session_id, order_index, title, next_action, explanation, status, atomization_level, delay_count, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?, NULL)").run(
      id(),
      sessionId,
      nextIndex,
      "New step",
      "Write one small sentence.",
      "Keep it small and concrete.",
      timestamp,
      timestamp
    );
    addEvent(sessionId, "step_added", "A plan step was added.");
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:deleteStep", (_event, stepId: string) => {
    const step = db.prepare("SELECT * FROM steps WHERE id = ?").get(stepId) as any;
    if (step) {
      db.prepare("DELETE FROM steps WHERE id = ?").run(stepId);
      addEvent(step.session_id, "step_deleted", "A plan step was deleted.", { title: step.title });
      if (step.status === "active") {
        activateNextPendingStep(step.session_id, step.order_index);
      }
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:reorderStep", (_event, stepId: string, direction: "up" | "down") => {
    const step = db.prepare("SELECT * FROM steps WHERE id = ?").get(stepId) as any;
    if (!step) return snapshot();
    const other = db
      .prepare(`SELECT * FROM steps WHERE session_id = ? AND order_index ${direction === "up" ? "<" : ">"} ? ORDER BY order_index ${direction === "up" ? "DESC" : "ASC"} LIMIT 1`)
      .get(step.session_id, step.order_index) as any;
    if (other) {
      db.prepare("UPDATE steps SET order_index = ? WHERE id = ?").run(other.order_index, step.id);
      db.prepare("UPDATE steps SET order_index = ? WHERE id = ?").run(step.order_index, other.id);
    }
    broadcast();
    return snapshot();
  });

  ipcMain.handle("nerve:action", async (_event, action: "done" | "thinking" | "delay" | "atomize" | "markDone" | "keepWorking") => {
    const session = getActiveSession();
    if (!session) return snapshot();
    const step = getActiveStep(session.id);
    if (!step) return snapshot();
    const timestamp = now();

    if (action === "done" || action === "markDone") {
      db.prepare("UPDATE steps SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, step.id);
      const nextStep = activateNextPendingStep(session.id, step.orderIndex);
      if (nextStep) {
        addEvent(session.id, "step_done", "Step marked done. Moving to the next step.", { stepId: step.id });
      } else {
        addEvent(session.id, "session_completed", "Session complete.");
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
      db.prepare("UPDATE steps SET delay_count = delay_count + 1, updated_at = ? WHERE id = ?").run(timestamp, step.id);
      addEvent(session.id, "delay_clicked", "Five more minutes started.", { until: delayUntil });
      overlayExpanded = true;
    }

    if (action === "atomize") {
      const ai = provider();
      const smaller = await ai
        .atomizeStep({
          goal: session.goal,
          taskType: session.taskType,
          language: getSettings().language,
          currentStepTitle: step.title,
          currentNextAction: step.nextAction,
          atomizationLevel: step.atomizationLevel,
          delayCount: step.delayCount
        })
        .catch(() => new MockAIProvider().atomizeStep({
          goal: session.goal,
          taskType: session.taskType,
          language: getSettings().language,
          currentStepTitle: step.title,
          currentNextAction: step.nextAction,
          atomizationLevel: step.atomizationLevel,
          delayCount: step.delayCount
        }));
      db.prepare("UPDATE steps SET next_action = ?, explanation = ?, atomization_level = ?, updated_at = ? WHERE id = ?").run(
        smaller.nextAction,
        smaller.explanation,
        smaller.atomizationLevel,
        timestamp,
        step.id
      );
      addEvent(session.id, "step_atomized", "The next action was made smaller.", { ...smaller });
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
        aiProvider: "mock",
        screenshotIntervalSeconds: 10,
        storeScreenshots: true
      });

      const started = await window.nerve.startSession({
        goal: "Smoke test: write a short essay introduction.",
        deadlineText: "today"
      });
      if (!started.session) throw new Error("No session returned after start.");
      if (!started.activeStep) throw new Error("No active step after start.");
      if (started.steps.length < 5) throw new Error("Generated plan is too short.");

      const thinking = await window.nerve.action("thinking");
      if (!thinking.thinkingPauseUntil) throw new Error("Thinking pause was not set.");

      const delayed = await window.nerve.action("delay");
      if (!delayed.delayUntil) throw new Error("Delay countdown was not set.");

      const atomized = await window.nerve.action("atomize");
      if (!atomized.activeStep || atomized.activeStep.atomizationLevel < 1) {
        throw new Error("Atomize did not update the active step.");
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
        storeScreenshots: false
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

      const started = await window.nerve.startSession({
        goal: "Break test: draft one resilient essay paragraph.",
        deadlineText: "later"
      });
      if (!started.session || !started.activeStep) throw new Error("Valid session did not start.");

      const deletedActive = await window.nerve.deleteStep(started.activeStep.id);
      if (!deletedActive.activeStep && deletedActive.session?.status !== "completed") {
        throw new Error("Deleting active step left no active step.");
      }

      const activeBeforeComplete = deletedActive.activeStep;
      if (activeBeforeComplete) {
        const completedViaPlan = await window.nerve.updateStep(activeBeforeComplete.id, { status: "complete" });
        if (!completedViaPlan.activeStep && completedViaPlan.session?.status !== "completed") {
          throw new Error("Plan-editor completion left no active step.");
        }
      }

      await window.nerve.setOverlayExpanded(true);
      await window.nerve.setOverlayExpanded(false);

      const postDelete = await window.nerve.deleteAllData();
      const cleaned = await window.nerve.getSnapshot();
      if (cleaned.session || cleaned.steps.length || cleaned.events.length || cleaned.screenshots.length) {
        throw new Error("Delete all data left session data behind.");
      }
      await window.nerve.updateSettings(originalSettings);

      return {
        rejectedBlankGoal,
        sanitizedInterval: sanitized.settings.screenshotIntervalSeconds,
        sanitizedOpacity: sanitized.settings.panelOpacity,
        activeAfterDelete: Boolean(deletedActive.activeStep),
        cleaned: !cleaned.session && cleaned.steps.length === 0
      };
    })();
  `);

  console.log(`[nerve-break] PASS ${JSON.stringify(result)}`);
  app.quit();
}

app.whenReady().then(() => {
  ensureStorage();
  registerLocalFileProtocol();
  registerIpc();
  createOverlayWindow();
  createMainWindow();
  activeSessionId = getActiveSession()?.id ?? null;
  pruneOldScreenshots();
  resetCaptureLoop();
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

app.on("window-all-closed", () => {});
