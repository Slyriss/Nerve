import { contextBridge, ipcRenderer } from "electron";
import type { AppSnapshot, NerveSettings, StepRecord, TaskType } from "@nerve/shared";

const nerve = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:getSnapshot"),
  startSession: (input: { goal: string; deadlineText?: string; taskType?: TaskType; taskTypes?: TaskType[] }): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:startSession", input),
  updateStep: (stepId: string, patch: Partial<StepRecord>): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:updateStep", stepId, patch),
  addStep: (sessionId: string): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:addStep", sessionId),
  deleteStep: (stepId: string): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:deleteStep", stepId),
  reorderStep: (stepId: string, direction: "up" | "down"): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:reorderStep", stepId, direction),
  action: (action: "done" | "thinking" | "delay" | "atomize" | "markDone" | "keepWorking"): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:action", action),
  updateSettings: (patch: Partial<NerveSettings>): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:updateSettings", patch),
  setOverlayExpanded: (expanded: boolean): Promise<void> => ipcRenderer.invoke("nerve:setOverlayExpanded", expanded),
  openMain: (route?: string): Promise<void> => ipcRenderer.invoke("nerve:openMain", route),
  openScreenshotFolder: (): Promise<string> => ipcRenderer.invoke("nerve:openScreenshotFolder"),
  endSession: (): Promise<AppSnapshot> => ipcRenderer.invoke("nerve:endSession"),
  updateSession: (sessionId: string, patch: { goal?: string; deadlineText?: string }): Promise<AppSnapshot> =>
    ipcRenderer.invoke("nerve:updateSession", sessionId, patch),
  deleteAllData: (): Promise<void> => ipcRenderer.invoke("nerve:deleteAllData"),
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
