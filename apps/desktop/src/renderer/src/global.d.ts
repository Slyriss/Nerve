import type { AppSnapshot, NerveSettings, PlanStepDraft, SessionLogData, SessionSummaryRecord, StepRecord, TaskType, ActionItemStatus, VoiceCoachResponse, VoiceTranscriptionResponse } from "@nerve/shared";

type NerveAction = "done" | "thinking" | "delay" | "markDone" | "keepWorking" | "repeatRoutine" | "endBreak";

interface NerveBridge {
  getSnapshot: () => Promise<AppSnapshot>;
  voiceMessage: (audioBase64: string) => Promise<VoiceCoachResponse>;
  setVoiceState: (state: "idle" | "listening" | "thinking" | "speaking" | "error") => Promise<void>;
  transcribeVoice: (audioBase64: string) => Promise<VoiceTranscriptionResponse>;
  startSession: (input: { goal: string; deadlineText?: string; taskType?: TaskType; taskTypes?: TaskType[]; parsedSteps?: PlanStepDraft[]; lockInMode?: boolean }) => Promise<AppSnapshot>;
  parseTaskList: (input: { goal: string; deadlineText?: string; taskTypes?: TaskType[] }) => Promise<{ steps: PlanStepDraft[]; taskTypes: TaskType[] }>;
  updateStep: (stepId: string, patch: Partial<StepRecord>) => Promise<AppSnapshot>;
  addStep: (sessionId: string) => Promise<AppSnapshot>;
  deleteStep: (stepId: string) => Promise<AppSnapshot>;
  reorderStep: (stepId: string, direction: "up" | "down") => Promise<AppSnapshot>;
  action: (action: NerveAction) => Promise<AppSnapshot>;
  updateSettings: (patch: Partial<NerveSettings>) => Promise<AppSnapshot>;
  setOverlayExpanded: (expanded: boolean) => Promise<void>;
  openMain: (route?: string) => Promise<void>;
  quitApp: () => Promise<void>;
  openScreenshotFolder: () => Promise<string>;
  getSessions: () => Promise<SessionSummaryRecord[]>;
  getSessionLog: (sessionId: string) => Promise<SessionLogData | null>;
  pauseSession: () => Promise<AppSnapshot>;
  resumeSession: (sessionId?: string) => Promise<AppSnapshot>;
  endSession: () => Promise<AppSnapshot>;
  updateSession: (sessionId: string, patch: { goal?: string; deadlineText?: string }) => Promise<AppSnapshot>;
  replanSession: () => Promise<AppSnapshot>;
  deleteAllData: () => Promise<void>;
  dismissBlocker: () => Promise<void>;
  connectGmail: () => Promise<AppSnapshot>;
  disconnectGmail: () => Promise<AppSnapshot>;
  fetchInbox: () => Promise<AppSnapshot>;
  updateInboxItem: (itemId: string, status: ActionItemStatus) => Promise<AppSnapshot>;
  promoteInboxItem: (itemId: string, input: { reminderAt?: string | null; dueAt?: string | null }) => Promise<AppSnapshot>;
  addNoteToPlan: (input: { note: string; reminderAt: string; dueAt?: string | null }) => Promise<AppSnapshot>;
  startReminder: (reminderId: string) => Promise<AppSnapshot>;
  snoozeReminder: (reminderId: string, reminderAt: string) => Promise<AppSnapshot>;
  deleteReminder: (reminderId: string) => Promise<AppSnapshot>;
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => () => void;
  onToggleVoice: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    nerve: NerveBridge;
  }
}

export {};
