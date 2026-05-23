export type TaskType =
  | "Essay writing"
  | "General writing"
  | "Coding"
  | "Research"
  | "Study"
  | "Email or admin"
  | "Presentation"
  | "Personal / life"
  | "Health / self-care"
  | "Household / chores"
  | "Errands"
  | "Meals"
  | "Pet care"
  | "Exercise"
  | "Social / communication"
  | "Finance / bills"
  | "Design or creative"
  | "Planning"
  | "Mixed work";

export const taskTypes: TaskType[] = [
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

export type SessionStatus = "active" | "paused" | "completed";
export type StepStatus = "pending" | "active" | "complete";
export type GuidanceStepStatus = "pending" | "active" | "complete";
export type AIProviderName = "deepseek";
export type UserState =
  | "on_task"
  | "productive_drift"
  | "unproductive_drift"
  | "stuck"
  | "thinking"
  | "progress"
  | "unknown";
export type TaskRelevance = "on_task" | "possibly_related" | "off_task" | "unknown";
export type ProgressState = "changed" | "unchanged" | "complete_suggested" | "unknown";
export type InterventionType = "none" | "step_card" | "drift_card" | "thinking_hold";
export type Urgency = "low" | "medium";
export type BreadcrumbRelevance = "productive" | "unproductive" | "unknown";
export type DisplayLanguage = "en" | "zh";
export type ReminderStatus = "scheduled" | "triggered" | "dismissed";
export type ConnectorName = "gmail";
export type ActionItemStatus = "pending" | "promoted" | "dismissed";
export type ActionItemUrgency = "low" | "medium" | "high";

export interface PlanStepDraft {
  title: string;
  nextAction: string;
  explanation: string;
  taskType?: TaskType;
  deadlineText?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  routineIntervalMinutes?: number | null;
  routineNextAt?: string | null;
  pastDeadlineConfirmed?: boolean;
}

export interface GeneratePlanInput {
  goal: string;
  taskType: TaskType;
  taskTypes?: TaskType[];
  language?: DisplayLanguage;
  deadlineText?: string;
  activeApp?: string;
  windowTitle?: string;
  currentDateTime?: string;
  timezone?: string;
  screenSummary?: string;
}

export interface GeneratePlanOutput {
  steps: PlanStepDraft[];
}

export interface AnalyzeScreenInput {
  sessionGoal: string;
  taskType: TaskType;
  sessionTaskTypes?: TaskType[];
  language?: DisplayLanguage;
  currentStep: PlanStepDraft & {
    id?: string;
    atomizationLevel?: number;
    delayCount?: number;
  };
  activeApp: string;
  windowTitle: string;
  elapsedOnCurrentStepSeconds: number;
  elapsedInCurrentAppSeconds: number;
  screenshotChangedSinceLastCapture: boolean;
  recentBreadcrumbs: BreadcrumbDraft[];
  delayCount: number;
  atomizationLevel: number;
  thinkingPauseActive: boolean;
  screenSummary?: string;
}

export interface AnalyzeScreenOutput {
  userState: UserState;
  taskRelevance: TaskRelevance;
  progressState: ProgressState;
  activeContext: string;
  visibleChangeSummary: string;
  conciseExplanation: string;
  suggestedNextAction: string;
  suggestedStepComplete: boolean;
  shouldIntervene: boolean;
  interventionType: InterventionType;
  urgency: Urgency;
  breadcrumbRelevance: BreadcrumbRelevance;
  detectedTaskType?: TaskType;
  stepId?: string | null;
}

export interface AIProvider {
  readonly name: AIProviderName;
  generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput>;
  analyzeScreen(input: AnalyzeScreenInput): Promise<AnalyzeScreenOutput>;
}

export interface SessionRecord {
  id: string;
  goal: string;
  taskType: TaskType;
  taskTypes: TaskType[];
  deadlineText: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummaryRecord extends SessionRecord {
  stepCount: number;
  completedStepCount: number;
  completionRate: number;
  durationSeconds: number;
  screenshotCount: number;
  observationCount: number;
  driftCount: number;
  lastEventType?: string | null;
}

export interface SessionLogData {
  session: SessionRecord;
  events: EventRecord[];
  breadcrumbs: BreadcrumbRecord[];
  steps: StepRecord[];
}

export interface StepRecord {
  id: string;
  sessionId: string;
  orderIndex: number;
  title: string;
  nextAction: string;
  explanation: string;
  taskType: TaskType;
  deadlineText: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  routineIntervalMinutes?: number | null;
  routineNextAt?: string | null;
  status: StepStatus;
  atomizationLevel: number;
  delayCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface ActivityRecord {
  id: string;
  sessionId: string;
  orderIndex: number;
  title: string;
  taskType: TaskType;
  deadlineText: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  routineIntervalMinutes?: number | null;
  routineNextAt?: string | null;
  status: StepStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface GuidanceStepRecord {
  id: string;
  activityId: string;
  sessionId: string;
  orderIndex: number;
  nextAction: string;
  explanation: string;
  status: GuidanceStepStatus;
  atomizationLevel: number;
  delayCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface ScreenshotRecord {
  id: string;
  sessionId: string;
  filePath: string;
  thumbnailPath: string;
  capturedAt: string;
  activeApp: string;
  windowTitle: string;
  perceptualHash: string;
  aiState?: UserState;
  stepTitle?: string;
  createdAt: string;
}

export interface AIObservationRecord extends AnalyzeScreenOutput {
  id: string;
  sessionId: string;
  screenshotId?: string | null;
  provider: AIProviderName;
  model: string;
  rawJson: string;
  createdAt: string;
}

export interface EventRecord {
  id: string;
  sessionId: string;
  type: string;
  message: string;
  metadataJson: string;
  createdAt: string;
}

export interface ReminderRecord {
  id: string;
  sessionId: string;
  stepId?: string | null;
  taskType: TaskType;
  title: string;
  message: string;
  deadlineText: string;
  dueAt?: string | null;
  reminderAt: string;
  status: ReminderStatus;
  createdAt: string;
  triggeredAt?: string | null;
}

export interface TaskHistoryRecord {
  id: string;
  sessionId: string;
  taskType: TaskType;
  source: "session_start" | "step_active" | "screen_detected" | "manual";
  confidence: "low" | "medium" | "high";
  summary: string;
  stepId?: string | null;
  activeApp?: string | null;
  windowTitle?: string | null;
  createdAt: string;
}

export interface BreadcrumbDraft {
  appName: string;
  windowTitle: string;
  relevance: BreadcrumbRelevance;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number;
}

export interface BreadcrumbRecord extends BreadcrumbDraft {
  id: string;
  sessionId: string;
}

export interface BannedSiteAlert {
  rule: string;
  activeApp: string;
  windowTitle: string;
  detectedAt: string;
}

export interface ConnectorMessage {
  id: string;
  source: ConnectorName;
  subject?: string;
  body: string;
  sender: string;
  receivedAt: string;
  isRead: boolean;
  threadId?: string;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  source: ConnectorName;
  sourceMessageId: string;
  urgency: ActionItemUrgency;
  suggestedTaskType: TaskType;
  dueHint?: string;
  extractedAt: string;
  status: ActionItemStatus;
}

export interface ConnectorStatus {
  name: ConnectorName;
  connected: boolean;
  lastFetchedAt?: string | null;
  email?: string | null;
  error?: string | null;
}

export interface FetchInboxOptions {
  maxMessages?: number;
  unreadOnly?: boolean;
}

export interface NerveSettings {
  aiProvider: AIProviderName;
  deepseekApiKey: string;
  deepseekModel: string;
  screenshotIntervalSeconds: 10 | 30 | 60;
  stuckThresholdMinutes: 5 | 8 | 10;
  driftThresholdMinutes: 3 | 6 | 10;
  thinkingPauseMinutes: 3 | 5 | 10;
  panelOpacity: 0.3 | 0.5 | 0.8;
  storeScreenshots: boolean;
  language: DisplayLanguage;
  bannedSitesEnabled: boolean;
  bannedSites: string[];
  soundEnabled: boolean;
  gmailEnabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
}

export interface AppSnapshot {
  session: SessionRecord | null;
  steps: StepRecord[];
  activities: ActivityRecord[];
  guidanceSteps: GuidanceStepRecord[];
  activeStep: StepRecord | null;
  screenshots: ScreenshotRecord[];
  events: EventRecord[];
  breadcrumbs: BreadcrumbRecord[];
  observations: AIObservationRecord[];
  taskHistory: TaskHistoryRecord[];
  reminders: ReminderRecord[];
  settings: NerveSettings;
  overlayExpanded: boolean;
  delayUntil: string | null;
  thinkingPauseUntil: string | null;
  breakReminderAt: string | null;
  breakEndsAt: string | null;
  bannedSiteAlert: BannedSiteAlert | null;
  bannedSiteStrikeCount: number;
<<<<<<< Updated upstream
=======
  lockInAlert: boolean;
  lockInWarningStartedAt: string | null;
>>>>>>> Stashed changes
  screenshotFolder: string;
  connectors: ConnectorStatus[];
  inboxItems: ActionItem[];
}

export const defaultSettings: NerveSettings = {
  aiProvider: "deepseek",
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  screenshotIntervalSeconds: 10,
  stuckThresholdMinutes: 8,
  driftThresholdMinutes: 6,
  thinkingPauseMinutes: 5,
  panelOpacity: 0.5,
  storeScreenshots: true,
  language: "en",
  bannedSitesEnabled: false,
  bannedSites: ["youtube.com", "tiktok.com", "instagram.com", "reddit.com", "netflix.com"],
  soundEnabled: false,
  gmailEnabled: false,
  googleClientId: "",
  googleClientSecret: ""
};
