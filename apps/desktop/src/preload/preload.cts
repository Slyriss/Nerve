import { contextBridge, ipcRenderer } from "electron";
import type { AppSnapshot, NerveSettings, PlanStepDraft, SessionLogData, SessionSummaryRecord, StepRecord, TaskType } from "@nerve/shared";

const nerve = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:getSnapshot"),
  startSession: (input: { goal: string; deadlineText?: string; taskType?: TaskType; taskTypes?: TaskType[]; parsedSteps?: PlanStepDraft[]; lockInMode?: boolean }): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:startSession", input),
  parseTaskList: (input: { goal: string; deadlineText?: string; taskTypes?: TaskType[] }): Promise<{ steps: PlanStepDraft[]; taskTypes: TaskType[] }> =>
    ipcRenderer.invoke("nerve:parseTaskList", input),
  updateStep: (stepId: string, patch: Partial<StepRecord>): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:updateStep", stepId, patch),
  addStep: (sessionId: string): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:addStep", sessionId),
  deleteStep: (stepId: string): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:deleteStep", stepId),
  reorderStep: (stepId: string, direction: "up" | "down"): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:reorderStep", stepId, direction),
  action: (action: "done" | "thinking" | "delay" | "markDone" | "keepWorking" | "repeatRoutine" | "endBreak"): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:action", action),
  updateSettings: (patch: Partial<NerveSettings>): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:updateSettings", patch),
  setOverlayExpanded: (expanded: boolean): Promise<void> => ipcRenderer.invoke("nerve:setOverlayExpanded", expanded),
  openMain: (route?: string): Promise<void> => ipcRenderer.invoke("nerve:openMain", route),
  openScreenshotFolder: (): Promise<string> => ipcRenderer.invoke("nerve:openScreenshotFolder"),
  getSessions: (): Promise<SessionSummaryRecord[]> => ipcRenderer.invoke("nerve:getSessions"),
  getSessionLog: (sessionId: string): Promise<SessionLogData | null> => ipcRenderer.invoke("nerve:getSessionLog", sessionId),
  pauseSession: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:pauseSession"),
  resumeSession: (sessionId?: string): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:resumeSession", sessionId),
  endSession: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:endSession"),
  updateSession: (sessionId: string, patch: { goal?: string; deadlineText?: string }): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:updateSession", sessionId, patch),
  replanSession: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:replanSession"),
  deleteAllData: (): Promise<void> => ipcRenderer.invoke("nerve:deleteAllData"),
  dismissBlocker: (): Promise<void> => ipcRenderer.invoke("nerve:dismissBlocker"),
  connectGmail: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:connectGmail"),
  disconnectGmail: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:disconnectGmail"),
  fetchInbox: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:fetchInbox"),
  updateInboxItem: (itemId: string, status: "pending" | "promoted" | "dismissed"): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:updateInboxItem", itemId, status),
  promoteInboxItem: (itemId: string, input: { reminderAt: string; dueAt?: string | null }): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:promoteInboxItem", itemId, input),
  addNoteToPlan: (input: { note: string; reminderAt: string; dueAt?: string | null }): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:addNoteToPlan", input),
  startReminder: (reminderId: string): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:startReminder", reminderId),
  snoozeReminder: (reminderId: string, reminderAt: string): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:snoozeReminder", reminderId, reminderAt),
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("nerve:snapshot", listener);
    return () => {
      ipcRenderer.removeListener("nerve:snapshot", listener);
    };
  }
};

contextBridge.exposeInMainWorld("nerve", nerve);

declare global {
  interface Window {
    nerve: typeof nerve;
  }
}
