export type ConnectorName = "gmail" | "calendar";
export type ActionItemStatus = "pending" | "promoted" | "dismissed";
export type ActionItemUrgency = "low" | "medium" | "high";

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  source: ConnectorName;
  sourceMessageId: string;
  urgency: ActionItemUrgency;
  suggestedTaskType: string;
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

export type View = "start" | "plan" | "calendar" | "log" | "history" | "settings" | "inbox";

export type CopyKey =
  | "privateCopilot" | "session" | "settings" | "runningSideTab" | "handoffBody"
  | "endSession" | "pauseSession" | "resumeSession"
  | "lockInMode" | "lockInModeHint" | "lockInBlockerTitle" | "lockInBack"
  | "lockInWarningTitle" | "lockInWarningBody"
  | "physicalTask" | "topPriority" | "startOnThis" | "addTask"
  | "tasksDueToday" | "nothingUrgent"
  | "pausedTitle" | "pausedBody" | "ready" | "goal" | "taskType" | "mode"
  | "screenshotNotice" | "startSession" | "currentProvider" | "nextStep"
  | "sessionComplete" | "currentStep" | "noSession" | "done" | "thinking"
  | "cancelThinking" | "delay" | "thinkingHold" | "routine" | "repeatRoutine"
  | "routineEvery" | "routineNext" | "waitingRoutineTitle" | "waitingRoutineBody"
  | "breakReminders" | "breakReminderEvery" | "breakDuration" | "breakTime"
  | "breakEndsIn" | "getBackToWork" | "nextBreak" | "pastDeadlineTitle"
  | "pastDeadlineBody" | "keepPastDeadline" | "nextPhysical" | "completePrompt"
  | "markDone" | "keepWorking" | "noAppChanges" | "stateOnTask" | "stateProgress"
  | "stateProductiveDrift" | "stateUnproductiveDrift" | "stateStuck"
  | "stateThinking" | "stateUnknown" | "language" | "english" | "mandarin"
  | "aiProvider" | "deepseekKey" | "deepseekModel" | "detectionInterval"
  | "stuckThreshold" | "driftThreshold" | "thinkingPause" | "panelOpacity"
  | "storeScreenshots" | "privacyNotice" | "openScreenshotFolder" | "deleteData"
  | "viewPlan" | "calendar" | "viewLog" | "history" | "hotkeyHint"
  | "bannedSites" | "bannedSitesEnabled" | "bannedSitesHelp" | "bannedSiteTitle"
  | "bannedSiteBody" | "bannedSiteBody2" | "bannedSiteBody3" | "bannedSiteAction"
  | "soundEnabled" | "endSessionConfirm" | "endSessionConfirmYes" | "endSessionConfirmNo"
  | "replanSession" | "replanning" | "inboxTitle" | "inboxEmpty" | "inboxFetch"
  | "inboxFetching" | "inboxConnect" | "inboxDisconnect" | "inboxPromote"
  | "inboxAdded" | "inboxDismiss" | "inboxReminderHint" | "suggestedReminder"
  | "inboxConnected" | "inboxNotConnected" | "inboxSetupHint" | "inboxNoActivePlan"
  | "quickNotes" | "notePlaceholder" | "noteReminder" | "addNote"
  | "reminderRequired" | "reminders" | "startNow" | "remindLater" | "setReminder"
  | "connectors" | "googleClientId" | "googleClientIdHint" | "googleClientSecret"
  | "googleClientSecretHint" | "saveGoogleOAuth" | "elevenLabsApiKey"
  | "elevenLabsVoiceId" | "elevenLabsVoiceHint" | "voiceCoach";

export type Schedulable = { reminderAt?: string | null; dueAt?: string | null; routineNextAt?: string | null };

export type CalendarItem = {
  id: string;
  dateKey: string;
  at: string;
  kind: "reminder" | "due" | "routine";
  title: string;
  subtitle: string;
  status: string;
  taskType: string;
};
