import type { AppSnapshot, NerveSettings, StepRecord, TaskType } from "@nerve/shared";

type NerveAction = "done" | "thinking" | "delay" | "atomize" | "markDone" | "keepWorking";

interface NerveBridge {
  getSnapshot: () => Promise<AppSnapshot>;
  startSession: (input: { goal: string; deadlineText?: string; taskType?: TaskType }) => Promise<AppSnapshot>;
  updateStep: (stepId: string, patch: Partial<StepRecord>) => Promise<AppSnapshot>;
  addStep: (sessionId: string) => Promise<AppSnapshot>;
  deleteStep: (stepId: string) => Promise<AppSnapshot>;
  reorderStep: (stepId: string, direction: "up" | "down") => Promise<AppSnapshot>;
  action: (action: NerveAction) => Promise<AppSnapshot>;
  updateSettings: (patch: Partial<NerveSettings>) => Promise<AppSnapshot>;
  setOverlayExpanded: (expanded: boolean) => Promise<void>;
  openMain: (route?: string) => Promise<void>;
  openScreenshotFolder: () => Promise<string>;
  endSession: () => Promise<AppSnapshot>;
  updateSession: (sessionId: string, patch: { goal?: string; deadlineText?: string }) => Promise<AppSnapshot>;
  deleteAllData: () => Promise<void>;
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => () => void;
}

declare global {
  interface Window {
    nerve: NerveBridge;
  }
}

export {};
