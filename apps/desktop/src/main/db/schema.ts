import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  goal: text("goal").notNull(),
  taskType: text("task_type").notNull(),
  taskTypesJson: text("task_types_json").notNull().default("[]"),
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
  taskType: text("task_type").notNull().default("General writing"),
  deadlineText: text("deadline_text").notNull().default(""),
  dueAt: text("due_at"),
  reminderAt: text("reminder_at"),
  status: text("status").notNull(),
  atomizationLevel: integer("atomization_level").notNull(),
  delayCount: integer("delay_count").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at")
});

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  orderIndex: integer("order_index").notNull(),
  title: text("title").notNull(),
  taskType: text("task_type").notNull().default("General writing"),
  deadlineText: text("deadline_text").notNull().default(""),
  dueAt: text("due_at"),
  reminderAt: text("reminder_at"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at")
});

export const guidanceSteps = sqliteTable("guidance_steps", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull(),
  sessionId: text("session_id").notNull(),
  orderIndex: integer("order_index").notNull(),
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
  detectedTaskType: text("detected_task_type"),
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

export const taskHistory = sqliteTable("task_history", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  taskType: text("task_type").notNull(),
  source: text("source").notNull(),
  confidence: text("confidence").notNull(),
  summary: text("summary").notNull(),
  stepId: text("step_id"),
  activeApp: text("active_app"),
  windowTitle: text("window_title"),
  createdAt: text("created_at").notNull()
});

export const reminders = sqliteTable("reminders", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  stepId: text("step_id"),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  deadlineText: text("deadline_text").notNull(),
  dueAt: text("due_at"),
  reminderAt: text("reminder_at").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  triggeredAt: text("triggered_at")
});

export const settingsTable = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const connectorTokens = sqliteTable("connector_tokens", {
  connector: text("connector").primaryKey(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  email: text("email"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const inboxItems = sqliteTable("inbox_items", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  sourceMessageId: text("source_message_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  urgency: text("urgency").notNull().default("low"),
  suggestedTaskType: text("suggested_task_type").notNull().default("Email or admin"),
  dueHint: text("due_hint"),
  status: text("status").notNull().default("pending"),
  extractedAt: text("extracted_at").notNull(),
  createdAt: text("created_at").notNull()
});

export const schema = {
  sessions,
  steps,
  activities,
  guidanceSteps,
  screenshots,
  aiObservations,
  events,
  breadcrumbs,
  taskHistory,
  reminders,
  settingsTable,
  connectorTokens,
  inboxItems
};
