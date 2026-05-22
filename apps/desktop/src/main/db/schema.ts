import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  goal: text("goal").notNull(),
  taskType: text("task_type").notNull(),
  deadlineText: text("deadline_text").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const steps = sqliteTable("steps", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  orderIndex: integer("order_index").notNull(),
  title: text("title").notNull(),
  nextAction: text("next_action").notNull(),
  explanation: text("explanation").notNull(),
  status: text("status").notNull(),
  atomizationLevel: integer("atomization_level").notNull(),
  delayCount: integer("delay_count").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at")
});

export const screenshots = sqliteTable("screenshots", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  filePath: text("file_path").notNull(),
  thumbnailPath: text("thumbnail_path").notNull(),
  capturedAt: text("captured_at").notNull(),
  activeApp: text("active_app").notNull(),
  windowTitle: text("window_title").notNull(),
  perceptualHash: text("perceptual_hash").notNull(),
  createdAt: text("created_at").notNull()
});

export const aiObservations = sqliteTable("ai_observations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  screenshotId: text("screenshot_id"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  userState: text("user_state").notNull(),
  taskRelevance: text("task_relevance").notNull(),
  progressState: text("progress_state").notNull(),
  activeApp: text("active_app").notNull(),
  activeContext: text("active_context").notNull(),
  visibleChangeSummary: text("visible_change_summary").notNull(),
  conciseExplanation: text("concise_explanation").notNull(),
  suggestedNextAction: text("suggested_next_action").notNull(),
  suggestedStepComplete: integer("suggested_step_complete").notNull(),
  shouldIntervene: integer("should_intervene").notNull(),
  interventionType: text("intervention_type").notNull(),
  urgency: text("urgency").notNull(),
  breadcrumbRelevance: text("breadcrumb_relevance").notNull(),
  rawJson: text("raw_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const breadcrumbs = sqliteTable("breadcrumbs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  appName: text("app_name").notNull(),
  windowTitle: text("window_title").notNull(),
  relevance: text("relevance").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationSeconds: integer("duration_seconds")
});

export const settingsTable = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const schema = {
  sessions,
  steps,
  screenshots,
  aiObservations,
  events,
  breadcrumbs,
  settingsTable
};
