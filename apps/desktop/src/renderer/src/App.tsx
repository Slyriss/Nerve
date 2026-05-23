import { useEffect, useRef, useState, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
<<<<<<< Updated upstream
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Eye,
  FileText,
  FolderOpen,
  KeyRound,
  ListChecks,
  Minimize2,
  Monitor,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Zap
} from "lucide-react";
import { taskTypes, type AppSnapshot, type BreadcrumbRecord, type EventRecord, type NerveSettings, type PlanStepDraft, type SessionLogData, type SessionSummaryRecord, type StepRecord, type TaskType } from "@nerve/shared";
=======
import { Activity, CalendarClock, Clock, Eye, FileText, ListChecks, Monitor, Settings } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useSnapshot } from "./lib/hooks";
import { useCopy } from "./lib/copy";
import { completionStats, nextScheduledLabel, stateLabel } from "./lib/utils";
import type { View } from "./lib/types";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BlockerScreen } from "./components/BlockerScreen";
import { Overlay } from "./components/Overlay";
import { SessionCommandBar } from "./components/SessionCommandBar";
import { ActiveSessionHandoff } from "./components/ActiveSessionHandoff";
import { SessionStart } from "./components/SessionStart";
import { PlanEditor } from "./components/PlanEditor";
import { CalendarScreen } from "./components/CalendarScreen";
import { SessionLog } from "./components/LogScreen";
import { SessionHistory } from "./components/HistoryScreen";
import { InboxScreen } from "./components/InboxScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { appDisplayName, brandIconLogo, brandWordLogo } from "./lib/catAssets";
>>>>>>> Stashed changes
import "./styles.css";

type ConnectorName = "gmail";
type ActionItemStatus = "pending" | "promoted" | "dismissed";
type ActionItemUrgency = "low" | "medium" | "high";

interface ActionItem {
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

interface ConnectorStatus {
  name: ConnectorName;
  connected: boolean;
  lastFetchedAt?: string | null;
  email?: string | null;
  error?: string | null;
}

type View = "start" | "plan" | "calendar" | "log" | "history" | "settings" | "inbox";
type CopyKey =
  | "privateCopilot"
  | "session"
  | "settings"
  | "runningSideTab"
  | "handoffBody"
  | "keepSidebarSlim"
  | "endSession"
  | "pauseSession"
  | "resumeSession"
  | "pausedTitle"
  | "pausedBody"
  | "ready"
  | "goal"
  | "taskType"
  | "mode"
  | "screenshotNotice"
  | "startSession"
  | "currentProvider"
  | "nextStep"
  | "sessionComplete"
  | "currentStep"
  | "noSession"
  | "done"
  | "thinking"
  | "delay"
  | "thinkingHold"
  | "routine"
  | "repeatRoutine"
  | "routineEvery"
  | "routineNext"
  | "waitingRoutineTitle"
  | "waitingRoutineBody"
  | "breakReminders"
  | "breakReminderEvery"
  | "breakDuration"
  | "breakTime"
  | "breakEndsIn"
  | "getBackToWork"
  | "nextBreak"
  | "pastDeadlineTitle"
  | "pastDeadlineBody"
  | "keepPastDeadline"
  | "nextPhysical"
  | "completePrompt"
  | "markDone"
  | "keepWorking"
  | "noAppChanges"
  | "stateOnTask"
  | "stateProgress"
  | "stateProductiveDrift"
  | "stateUnproductiveDrift"
  | "stateStuck"
  | "stateThinking"
  | "stateUnknown"
  | "language"
  | "english"
  | "mandarin"
  | "aiProvider"
  | "deepseekKey"
  | "deepseekModel"
  | "detectionInterval"
  | "stuckThreshold"
  | "driftThreshold"
  | "thinkingPause"
  | "panelOpacity"
  | "storeScreenshots"
  | "privacyNotice"
  | "openScreenshotFolder"
  | "deleteData"
  | "viewPlan"
  | "calendar"
  | "viewLog"
  | "history"
  | "hotkeyHint"
  | "bannedSites"
  | "bannedSitesEnabled"
  | "bannedSitesHelp"
  | "bannedSiteTitle"
  | "bannedSiteBody"
  | "bannedSiteBody2"
  | "bannedSiteBody3"
  | "bannedSiteAction"
  | "soundEnabled"
  | "endSessionConfirm"
  | "endSessionConfirmYes"
  | "endSessionConfirmNo"
  | "replanSession"
  | "replanning"
  | "inboxTitle"
  | "inboxEmpty"
  | "inboxFetch"
  | "inboxFetching"
  | "inboxConnect"
  | "inboxDisconnect"
  | "inboxPromote"
  | "inboxAdded"
  | "inboxDismiss"
  | "inboxReminderHint"
  | "suggestedReminder"
  | "inboxConnected"
  | "inboxNotConnected"
  | "inboxSetupHint"
  | "inboxNoActivePlan"
  | "quickNotes"
  | "notePlaceholder"
  | "noteReminder"
  | "addNote"
  | "reminderRequired"
  | "reminders"
  | "startNow"
  | "remindLater"
  | "setReminder"
  | "connectors"
  | "googleClientId"
  | "googleClientIdHint"
  | "googleClientSecret"
  | "googleClientSecretHint"
  | "saveGoogleOAuth";

const copy: Record<"en" | "zh", Record<CopyKey, string>> = {
  en: {
    privateCopilot: "Private task co-pilot",
    session: "Session",
    settings: "Settings",
    runningSideTab: "Nerve is running in the side tab.",
    handoffBody: "You can close or ignore this main window. The current step and any gentle prompts will stay in the slim sidebar.",
    keepSidebarSlim: "Keep sidebar slim",
    endSession: "End session",
    pauseSession: "Pause session",
    resumeSession: "Resume session",
    pausedTitle: "Session paused.",
    pausedBody: "I’ll hold this spot. Capture and reminders are paused until you resume.",
    ready: "Ready when you are",
    goal: "Goal",
    taskType: "Task type",
    mode: "Mode",
    screenshotNotice: "Nerve captures screenshots during a session and stores them locally on this device for demo/debugging. You can delete session data from Settings.",
    startSession: "Start Session",
    currentProvider: "Current provider",
    nextStep: "Next step",
    sessionComplete: "Session complete.",
    currentStep: "Current step",
    noSession: "No session is active.",
    done: "Done",
    thinking: "I’m thinking",
    delay: "Give me 5 more minutes",
    thinkingHold: "Got it. I’ll hold this step while you think.",
    routine: "Routine",
    repeatRoutine: "Repeat routine task",
    routineEvery: "Repeat every",
    routineNext: "Next routine",
    waitingRoutineTitle: "Waiting for the next scheduled routine.",
    waitingRoutineBody: "I’ll bring it back to priority 1 when it is time.",
    breakReminders: "Break reminders",
    breakReminderEvery: "Remind every",
    breakDuration: "Break length",
    breakTime: "Break time",
    breakEndsIn: "Break ends in",
    getBackToWork: "Get back to work",
    nextBreak: "Next break",
    pastDeadlineTitle: "Past deadline",
    pastDeadlineBody: "This time has already passed. Confirm it if this is the deadline you meant to keep.",
    keepPastDeadline: "Keep this deadline",
    nextPhysical: "No rush. When you’re ready, the next physical action is:",
    completePrompt: "This step looks complete. Mark it done?",
    markDone: "Mark Done",
    keepWorking: "Keep Working",
    noAppChanges: "No app changes yet.",
    stateOnTask: "On task",
    stateProgress: "Progress",
    stateProductiveDrift: "Possibly related",
    stateUnproductiveDrift: "Away",
    stateStuck: "Stuck",
    stateThinking: "Thinking",
    stateUnknown: "Holding",
    language: "Language",
    english: "English",
    mandarin: "Mandarin",
    aiProvider: "AI provider",
    deepseekKey: "DeepSeek API key",
    deepseekModel: "DeepSeek model",
    detectionInterval: "Detection interval",
    stuckThreshold: "Stuck threshold",
    driftThreshold: "Drift threshold",
    thinkingPause: "Thinking pause",
    panelOpacity: "Panel opacity",
    storeScreenshots: "Store screenshots locally",
    privacyNotice: "DeepSeek analysis may send screen/session context to the configured API. Screenshots stay local unless you explicitly change the implementation.",
    openScreenshotFolder: "Open screenshot folder",
    deleteData: "Delete all local session data",
    viewPlan: "View plan",
    calendar: "Calendar",
    viewLog: "Session log",
    history: "History",
    hotkeyHint: "Win+Shift+N toggles the sidebar.",
    bannedSites: "Banned websites",
    bannedSitesEnabled: "Intrusive banned-site overlay",
    bannedSitesHelp: "One domain per line. Nerve detects these locally from the active browser window when Windows exposes the page URL or title.",
    bannedSiteTitle: "Leave this site.",
    bannedSiteBody: "This site is on your banned list for this session. Close it or switch back to the task now.",
    bannedSiteBody2: "You came back. Close it and refocus.",
    bannedSiteBody3: "Third time. Close this tab and don't come back.",
    bannedSiteAction: "Return to the current task:",
    soundEnabled: "Sound alert on detection",
    endSessionConfirm: "You still have steps to go. End the session anyway?",
    endSessionConfirmYes: "Yes, end it",
    endSessionConfirmNo: "Keep going",
    replanSession: "Re-plan from here",
    replanning: "Regenerating plan…",
    inboxTitle: "Inbox",
    inboxEmpty: "No action items found",
    inboxFetch: "Scan inbox",
    inboxFetching: "Scanning...",
    inboxConnect: "Connect Gmail",
    inboxDisconnect: "Disconnect",
    inboxPromote: "Add to session",
    inboxAdded: "Added",
    inboxDismiss: "Dismiss",
    inboxReminderHint: "Pick a reminder before adding.",
    suggestedReminder: "Suggested window",
    inboxConnected: "Connected",
    inboxNotConnected: "Not connected",
    inboxSetupHint: "Enter your Google OAuth Client ID in Settings to connect Gmail.",
    inboxNoActivePlan: "No active plan right now. Make a plan from the main page first, then come back to add inbox items to the session.",
    quickNotes: "Quick notes",
    notePlaceholder: "Something to remember or add to the plan...",
    noteReminder: "Reminder",
    addNote: "Add to plan",
    reminderRequired: "Choose a reminder time first.",
    reminders: "Reminders",
    startNow: "Start now",
    remindLater: "Remind later",
    setReminder: "Set reminder",
    connectors: "Connectors",
    googleClientId: "Google Client ID",
    googleClientIdHint: "Create a Desktop app OAuth client at console.cloud.google.com",
    googleClientSecret: "Google Client Secret",
    googleClientSecretHint: "Required for some Google OAuth client types; leave blank if your client does not have one.",
    saveGoogleOAuth: "Save Google OAuth"
  },
  zh: {
    privateCopilot: "私人任务辅助",
    session: "会话",
    settings: "设置",
    runningSideTab: "Nerve 正在侧边栏运行。",
    handoffBody: "你可以关闭或忽略主窗口。当前步骤和温和提示会留在右侧小栏里。",
    keepSidebarSlim: "保持侧栏收起",
    endSession: "结束会话",
    pauseSession: "暂停会话",
    resumeSession: "继续会话",
    pausedTitle: "会话已暂停。",
    pausedBody: "我会保留当前位置。截图和提醒会暂停，直到你继续。",
    ready: "准备好时开始",
    goal: "目标",
    taskType: "任务类型",
    mode: "模式",
    screenshotNotice: "Nerve 会在会话期间截图，并只保存在本设备用于演示/调试。你可以在设置中删除本地数据。",
    startSession: "开始会话",
    currentProvider: "当前提供方",
    nextStep: "下一步",
    sessionComplete: "会话已完成。",
    currentStep: "当前步骤",
    noSession: "当前没有活动会话。",
    done: "完成",
    thinking: "我在思考",
    delay: "再给我 5 分钟",
    thinkingHold: "收到。我会先帮你保留这一步。",
    routine: "例行任务",
    repeatRoutine: "重复例行任务",
    routineEvery: "重复间隔",
    routineNext: "下次例行任务",
    waitingRoutineTitle: "正在等待下一次例行任务。",
    waitingRoutineBody: "到时间时，我会把它提到优先级 1。",
    breakReminders: "休息提醒",
    breakReminderEvery: "提醒间隔",
    breakDuration: "休息时长",
    breakTime: "休息时间",
    breakEndsIn: "休息剩余",
    getBackToWork: "回到工作",
    nextBreak: "下次休息",
    pastDeadlineTitle: "截止时间已过",
    pastDeadlineBody: "这个时间已经过去。如果这是你想保留的截止时间，请确认。",
    keepPastDeadline: "保留这个截止时间",
    nextPhysical: "不急。准备好时，下一步身体动作是：",
    completePrompt: "这一步看起来已完成。要标记完成吗？",
    markDone: "标记完成",
    keepWorking: "继续处理",
    noAppChanges: "还没有应用切换记录。",
    stateOnTask: "在任务中",
    stateProgress: "有进展",
    stateProductiveDrift: "可能相关",
    stateUnproductiveDrift: "已离开",
    stateStuck: "卡住",
    stateThinking: "思考中",
    stateUnknown: "保留中",
    language: "语言",
    english: "英语",
    mandarin: "中文",
    aiProvider: "AI 提供方",
    deepseekKey: "DeepSeek API 密钥",
    deepseekModel: "DeepSeek 模型",
    detectionInterval: "检测间隔",
    stuckThreshold: "卡住阈值",
    driftThreshold: "偏离阈值",
    thinkingPause: "思考暂停",
    panelOpacity: "侧栏透明度",
    storeScreenshots: "本地保存截图",
    privacyNotice: "DeepSeek 分析可能会把屏幕/会话上下文发送到配置的 API。截图仍保存在本地，除非你明确修改实现。",
    openScreenshotFolder: "打开截图文件夹",
    deleteData: "删除所有本地会话数据",
    viewPlan: "查看计划",
    calendar: "日历",
    viewLog: "会话日志",
    history: "历史",
    hotkeyHint: "Win+Shift+N 可切换侧栏。",
    bannedSites: "禁止网站",
    bannedSitesEnabled: "强提醒禁止网站覆盖层",
    bannedSitesHelp: "每行一个域名。Windows 暴露当前浏览器 URL 或标题时，Nerve 会在本地检测这些网站。",
    bannedSiteTitle: "离开这个网站。",
    bannedSiteBody: "这个网站在你的禁止列表里。现在关闭它，或切回当前任务。",
    bannedSiteBody2: "你又回来了。关掉它，重新集中注意力。",
    bannedSiteBody3: "第三次了。关掉这个标签页，别再来了。",
    bannedSiteAction: "回到当前任务：",
    soundEnabled: "检测到时播放声音提醒",
    endSessionConfirm: "你还有步骤未完成，确定要结束会话吗？",
    endSessionConfirmYes: "是的，结束",
    endSessionConfirmNo: "继续进行",
    replanSession: "从这里重新规划",
    replanning: "正在重新生成计划…",
    inboxTitle: "收件箱",
    inboxEmpty: "没有待处理事项",
    inboxFetch: "扫描邮件",
    inboxFetching: "扫描中...",
    inboxConnect: "连接 Gmail",
    inboxDisconnect: "断开连接",
    inboxPromote: "加入任务",
    inboxAdded: "已加入",
    inboxDismiss: "忽略",
    inboxReminderHint: "加入前先选择提醒时间。",
    suggestedReminder: "建议提醒时间",
    inboxConnected: "已连接",
    inboxNotConnected: "未连接",
    inboxSetupHint: "请在设置中输入 Google OAuth 客户端 ID 以连接 Gmail。",
    inboxNoActivePlan: "当前没有活动计划。请先从主页创建计划，然后回来把邮件事项加入会话。",
    quickNotes: "快速笔记",
    notePlaceholder: "临时想到的事情，或想加入计划的想法...",
    noteReminder: "提醒",
    addNote: "加入计划",
    reminderRequired: "请先选择提醒时间。",
    reminders: "提醒",
    startNow: "现在开始",
    remindLater: "稍后提醒",
    setReminder: "设置提醒",
    connectors: "连接器",
    googleClientId: "Google 客户端 ID",
    googleClientIdHint: "在 console.cloud.google.com 创建桌面应用 OAuth 客户端",
    googleClientSecret: "Google 客户端密钥",
    googleClientSecretHint: "某些 Google OAuth 客户端类型需要；如果你的客户端没有密钥可留空。",
    saveGoogleOAuth: "保存 Google OAuth"
  }
};

function useCopy(language: "en" | "zh") {
  return (key: CopyKey) => copy[language][key];
}

function stateLabel(state: string | undefined, t: (key: CopyKey) => string) {
  switch (state) {
    case "on_task":
      return t("stateOnTask");
    case "progress":
      return t("stateProgress");
    case "productive_drift":
      return t("stateProductiveDrift");
    case "unproductive_drift":
      return t("stateUnproductiveDrift");
    case "stuck":
      return t("stateStuck");
    case "thinking":
      return t("stateThinking");
    default:
      return t("stateUnknown");
  }
}

function useSnapshot() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  useEffect(() => {
    window.nerve.getSnapshot().then(setSnapshot);
    return window.nerve.onSnapshot(setSnapshot);
  }, []);
  return [snapshot, setSnapshot] as const;
}

function timeLeft(until: string | null) {
  if (!until) return "";
  const seconds = Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000));
  const m = Math.floor(seconds / 60).toString();
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function addMinutesIso(value: string | null | undefined, minutes: number) {
  const base = value ? Date.parse(value) : Date.now();
  const start = Number.isFinite(base) ? base : Date.now();
  return new Date(start + minutes * 60_000).toISOString();
}

function isPast(value?: string | null) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < Date.now();
}

function hasPastDeadline(step: Schedulable) {
  return isPast(step.dueAt) || isPast(step.reminderAt) || isPast(step.routineNextAt);
}

function syncedRoutinePatch(step: PlanStepDraft, minutes: number | null): Partial<PlanStepDraft> {
  if (!minutes) {
    return { routineIntervalMinutes: null, routineNextAt: null };
  }
  const anchor = step.reminderAt || step.routineNextAt || step.dueAt || null;
  const routineNextAt = addMinutesIso(anchor, minutes);
  return {
    routineIntervalMinutes: minutes,
    routineNextAt,
    reminderAt: step.reminderAt || routineNextAt
  };
}

type Schedulable = { reminderAt?: string | null; dueAt?: string | null; routineNextAt?: string | null };

function scheduleTime(step: Schedulable) {
  const routine = step.routineNextAt ? Date.parse(step.routineNextAt) : Number.POSITIVE_INFINITY;
  const reminder = step.reminderAt ? Date.parse(step.reminderAt) : Number.POSITIVE_INFINITY;
  const due = step.dueAt ? Date.parse(step.dueAt) : Number.POSITIVE_INFINITY;
  return Math.min(
    Number.isFinite(routine) ? routine : Number.POSITIVE_INFINITY,
    Number.isFinite(reminder) ? reminder : Number.POSITIVE_INFINITY,
    Number.isFinite(due) ? due : Number.POSITIVE_INFINITY
  );
}

function sortBySchedule<T extends Schedulable>(steps: T[]) {
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const diff = scheduleTime(a.step) - scheduleTime(b.step);
      return Number.isFinite(diff) ? diff : a.index - b.index;
    })
    .map(({ step }) => step);
}

function timeLabel(value?: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
}

function fileSrc(filePath: string) {
  return `nerve-file://local/${encodeURIComponent(filePath)}`;
}

function useNow(intervalMs = 1000) {
  const [value, setValue] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setValue(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return value;
}

function completionStats(steps: StepRecord[]) {
  const total = steps.length;
  const completed = steps.filter((step) => step.status === "complete").length;
  const active = steps.find((step) => step.status === "active");
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { active, completed, percent, total };
}

function nextScheduledLabel(steps: Schedulable[]) {
  const now = Date.now();
  const next = sortBySchedule(steps).find((step) => Number.isFinite(scheduleTime(step)) && scheduleTime(step) >= now);
  if (!next) return "No deadline";
  return new Date(scheduleTime(next)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function defaultReminderLocal(minutes = 30) {
  return toDateTimeLocal(new Date(Date.now() + minutes * 60_000).toISOString());
}

function nextLocalTime(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return toDateTimeLocal(date.toISOString());
}

function suggestedReminderForInboxItem(item: ActionItem) {
  if (item.urgency === "high") return defaultReminderLocal(15);
  if (item.suggestedTaskType === "Finance / bills") return defaultReminderLocal(60);
  if (item.suggestedTaskType === "Email or admin") return defaultReminderLocal(30);
  if (item.suggestedTaskType === "Planning") return nextLocalTime(9);
  if (item.urgency === "medium") return defaultReminderLocal(90);
  return nextLocalTime(10);
}

function localDateKey(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(value?: string | null) {
  return Boolean(value && localDateKey(value) === localDateKey(new Date()));
}

function calendarLabel(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function monthTitle(date: Date) {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_value, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function playBannedSiteSound() {
  try {
    const ctx = new AudioContext();
    const beep = (freq: number, startAt: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.22, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.15);
      osc.start(startAt);
      osc.stop(startAt + 0.15);
    };
    beep(660, ctx.currentTime);
    beep(880, ctx.currentTime + 0.2);
    beep(1100, ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 700);
  } catch {
    // AudioContext unavailable
  }
}

function App() {
  const [snapshot, setSnapshot] = useSnapshot();
  const [view, setView] = useState<View>(() => {
    const route = location.hash.replace("#/", "");
    return route === "plan" || route === "calendar" || route === "log" || route === "history" || route === "settings" || route === "inbox" ? route : "start";
  });
  const isOverlay = location.hash.startsWith("#/overlay");
  const isBlocker = location.hash.startsWith("#/blocker");

  // All hooks must be called unconditionally, before any early returns.
  const t = useCopy(snapshot?.settings.language ?? "en");
  const sessionOpen = snapshot?.session?.status === "active" || snapshot?.session?.status === "paused";

  // Reset to start screen when a session closes so stale plan/log data doesn't persist
  useEffect(() => {
    if (!sessionOpen && (view === "plan" || view === "calendar" || view === "log")) {
      setView("start");
    }
  }, [sessionOpen]);

  if (!snapshot) return <div className="loading"><img src={brandIconLogo} alt="" /> {appDisplayName}</div>;
  if (isBlocker) return <BlockerScreen snapshot={snapshot} />;
  if (isOverlay) return <Overlay snapshot={snapshot} setSnapshot={setSnapshot} />;

  const showHandoff = sessionOpen && view === "start";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark"><img src={brandIconLogo} alt="" /></div>
          <div>
            <h1 className="brand-title" aria-label={appDisplayName}>
              <span>别</span>
              <img className="brand-wordmark" src={brandWordLogo} alt="meow" />
              <span>鱼</span>
            </h1>
          </div>
        </div>
        <nav className="tabs">
          <button className={view === "start" ? "active" : ""} title={t("session")} onClick={() => setView("start")}>
            <FileText size={16} /> <span className="nav-label">{t("session")}</span>
          </button>
          {sessionOpen && (
            <>
              <button className={view === "plan" ? "active" : ""} title={t("viewPlan")} onClick={() => setView("plan")}>
                <ListChecks size={16} /> <span className="nav-label">{t("viewPlan")}</span>
              </button>
              <button className={view === "calendar" ? "active" : ""} title={t("calendar")} onClick={() => setView("calendar")}>
                <CalendarClock size={16} /> <span className="nav-label">{t("calendar")}</span>
              </button>
              <button className={view === "log" ? "active" : ""} title={t("viewLog")} onClick={() => setView("log")}>
                <Eye size={16} /> <span className="nav-label">{t("viewLog")}</span>
              </button>
            </>
          )}
          <button className={view === "inbox" ? "active" : ""} title={t("inboxTitle")} onClick={() => setView("inbox")} style={{ position: "relative" }}>
            <Monitor size={16} /> <span className="nav-label">{t("inboxTitle")}</span>
            {(() => {
              const inboxItems = (snapshot as any).inboxItems as ActionItem[] ?? [];
              const pendingCount = inboxItems.filter((i) => i.status === "pending").length;
              return pendingCount > 0 ? (
                <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
              ) : null;
            })()}
          </button>
          <button className={view === "history" ? "active" : ""} title={t("history")} onClick={() => setView("history")}>
            <Clock size={16} /> <span className="nav-label">{t("history")}</span>
          </button>
          <button className={view === "settings" ? "active" : ""} title={t("settings")} onClick={() => setView("settings")}>
            <Settings size={16} /> <span className="nav-label">{t("settings")}</span>
          </button>
        </nav>
      </header>

      {sessionOpen && <SessionCommandBar snapshot={snapshot} />}
      {showHandoff && <ActiveSessionHandoff snapshot={snapshot} setSnapshot={setSnapshot} setView={setView} />}
      {!showHandoff && view === "start" && <SessionStart setSnapshot={setSnapshot} settings={snapshot.settings} />}
      {!showHandoff && view === "plan" && <PlanEditor snapshot={snapshot} setSnapshot={setSnapshot} />}
      {!showHandoff && view === "calendar" && <CalendarScreen snapshot={snapshot} />}
      {!showHandoff && view === "log" && <SessionLog snapshot={snapshot} setSnapshot={setSnapshot} />}
      {!showHandoff && view === "history" && <SessionHistory />}
      {view === "inbox" && <InboxScreen snapshot={snapshot} language={snapshot.settings.language} />}
      {view === "settings" && <SettingsScreen snapshot={snapshot} setSnapshot={setSnapshot} />}
    </main>
  );
}

function SessionCommandBar({ snapshot }: { snapshot: AppSnapshot }) {
  const { completed, percent, total } = completionStats(snapshot.steps);
  const latestState = snapshot.observations[0]?.userState;
  const t = useCopy(snapshot.settings.language);
  return (
    <section className="command-bar">
      <div className="command-primary">
        <span className={`status-dot ${snapshot.session?.status || "idle"}`} />
        <div>
          <strong>{snapshot.session?.goal || t("ready")}</strong>
          <span>{snapshot.activeStep?.title || t("noSession")}</span>
        </div>
      </div>
      <div className="command-metrics">
        <span><ListChecks size={14} /> {completed}/{total} done</span>
        <span><Activity size={14} /> {percent}%</span>
        <span><CalendarClock size={14} /> {nextScheduledLabel(snapshot.steps)}</span>
        <span className={`state-pill ${latestState || "unknown"}`}>{stateLabel(latestState, t)}</span>
      </div>
    </section>
  );
}

function ActiveSessionHandoff({
  snapshot,
  setSnapshot,
  setView
}: {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  setView: (view: View) => void;
}) {
  const t = useCopy(snapshot.settings.language);
  const paused = snapshot.session?.status === "paused";
  return (
    <section className="handoff-layout">
      <div className="handoff-panel">
        <div className="mark">N</div>
        <h2>{paused ? t("pausedTitle") : t("runningSideTab")}</h2>
        <p className="muted">{paused ? t("pausedBody") : t("handoffBody")}</p>
        <div className="button-row">
          <button onClick={() => setView("plan")}>
            <ListChecks size={16} /> {t("viewPlan")}
          </button>
          <button onClick={() => setView("log")}>
            <Eye size={16} /> {t("viewLog")}
          </button>
        </div>
        <div className="button-row">
          {paused ? (
            <button className="primary" onClick={async () => setSnapshot(await window.nerve.resumeSession())}>
              <Play size={16} /> {t("resumeSession")}
            </button>
          ) : (
            <button onClick={async () => setSnapshot(await window.nerve.pauseSession())}>
              <Pause size={16} /> {t("pauseSession")}
            </button>
          )}
          <button onClick={() => window.nerve.setOverlayExpanded(false)}>
            <Minimize2 size={16} /> {t("keepSidebarSlim")}
          </button>
          <button className="danger" onClick={async () => setSnapshot(await window.nerve.endSession())}>{t("endSession")}</button>
        </div>
        <p className="subtle">{t("hotkeyHint")}</p>
      </div>
    </section>
  );
}

function SessionStart({
  setSnapshot,
  settings
}: {
  setSnapshot: (snapshot: AppSnapshot) => void;
  settings: NerveSettings;
}) {
  const [goal, setGoal] = useState("");
  const [detectedTaskTypes, setDetectedTaskTypes] = useState<TaskType[]>([]);
  const [parsedSteps, setParsedSteps] = useState<PlanStepDraft[]>([]);
  const [parseBusy, setParseBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useCopy(settings.language);
  useNow(30_000);
  const unresolvedPastDeadlineCount = parsedSteps.filter((step) => hasPastDeadline(step) && !step.pastDeadlineConfirmed).length;
  function patchParsedStep(index: number, patch: Partial<PlanStepDraft>) {
    setParsedSteps((steps) => steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)));
  }
  async function parse() {
    if (!goal.trim()) return;
    setParseBusy(true);
    setError("");
    try {
      const parsed = await window.nerve.parseTaskList({
        goal: goal.trim()
      });
      setParsedSteps(sortBySchedule(parsed.steps));
      setDetectedTaskTypes(parsed.taskTypes);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "The task list could not be parsed.");
    } finally {
      setParseBusy(false);
    }
  }
  async function start() {
    if (!goal.trim()) return;
    setBusy(true);
    setError("");
    try {
      setSnapshot(
        await window.nerve.startSession({
          goal: goal.trim(),
          taskTypes: detectedTaskTypes.length ? detectedTaskTypes : undefined,
          parsedSteps: parsedSteps.length ? parsedSteps : undefined
        })
      );
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "The session could not start.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="start-layout">
      <div className="start-panel">
        <div className="page-title">
          <span className="eyebrow">{t("session")}</span>
          <h2>{t("ready")}</h2>
        </div>
        <div className="start-composer">
          <label>
            {t("goal")}
            <textarea
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                setParsedSteps([]);
                setDetectedTaskTypes([]);
              }}
              placeholder="Finish math research, walk the dog at 3pm, shower at 5pm, dinner at 6pm..."
            />
          </label>
          <aside className="composer-rail">
            <div>
              <span className="rail-label">Provider</span>
              <strong>DeepSeek</strong>
            </div>
            <div>
              <span className="rail-label">Capture</span>
              <strong>{settings.screenshotIntervalSeconds}s</strong>
            </div>
            <div>
              <span className="rail-label">Language</span>
              <strong>{settings.language.toUpperCase()}</strong>
            </div>
          </aside>
        </div>
        <div className="button-row split-actions">
          <div className="button-row">
            <button disabled={!goal.trim() || parseBusy || busy} onClick={parse}>
              <ListChecks size={16} /> {parseBusy ? "Parsing..." : "Parse task list"}
            </button>
            {parsedSteps.length > 0 && <span className="subtle">{parsedSteps.length} activities parsed</span>}
          </div>
          <button className="primary" disabled={!goal.trim() || busy || unresolvedPastDeadlineCount > 0} onClick={start}>
            <Check size={16} /> {t("startSession")}
          </button>
        </div>
        {unresolvedPastDeadlineCount > 0 && (
          <p className="deadline-warning">
            <AlertTriangle size={15} /> {unresolvedPastDeadlineCount} {t("pastDeadlineTitle").toLowerCase()}
          </p>
        )}
        {parsedSteps.length > 0 && (
          <section className="parsed-timetable">
            <div className="section-head">
              <h3>Editable timetable</h3>
              <button
                onClick={() =>
                  setParsedSteps((steps) => [
                    ...steps,
                    {
                      title: "New activity",
                      nextAction: "Do one small physical action.",
                      explanation: "Keep it small and concrete.",
                      taskType: detectedTaskTypes[0] ?? "Personal / life",
                      deadlineText: "",
                      dueAt: null,
                      reminderAt: null,
                      routineIntervalMinutes: null,
                      routineNextAt: null
                    }
                  ])
                }
              >
                <Plus size={16} /> Add activity
              </button>
            </div>
            {parsedSteps.map((step, index) => {
              const pastDeadline = hasPastDeadline(step);
              return (
              <article className={`timetable-row ${pastDeadline ? "past-due" : ""}`} key={`${step.title}-${index}`}>
                <div className="time-cell">
                  <span>{index + 1}</span>
                  <label className="time-field">
                    Remind
                    <input
                      type="datetime-local"
                      value={toDateTimeLocal(step.reminderAt)}
                      onChange={(event) => {
                        const reminderAt = fromDateTimeLocal(event.currentTarget.value);
                        patchParsedStep(index, {
                          reminderAt,
                          routineNextAt: step.routineIntervalMinutes && reminderAt ? addMinutesIso(reminderAt, step.routineIntervalMinutes) : step.routineNextAt,
                          pastDeadlineConfirmed: false
                        });
                      }}
                    />
                  </label>
                  <label className="time-field">
                    Due
                    <input
                      type="datetime-local"
                      value={toDateTimeLocal(step.dueAt)}
                      onChange={(event) => {
                        const dueAt = fromDateTimeLocal(event.currentTarget.value);
                        patchParsedStep(index, {
                          dueAt,
                          ...(step.routineIntervalMinutes && !step.routineNextAt && dueAt ? { routineNextAt: addMinutesIso(dueAt, step.routineIntervalMinutes), reminderAt: dueAt } : {}),
                          pastDeadlineConfirmed: false
                        });
                      }}
                    />
                  </label>
                  <label className="time-field">
                    {t("routineNext")}
                    <input
                      type="datetime-local"
                      value={toDateTimeLocal(step.routineNextAt)}
                      onChange={(event) => {
                        const routineNextAt = fromDateTimeLocal(event.currentTarget.value);
                        patchParsedStep(index, {
                          routineNextAt,
                          pastDeadlineConfirmed: false
                        });
                      }}
                    />
                  </label>
                </div>
                <div className="activity-fields">
                  <input value={step.title} onChange={(event) => patchParsedStep(index, { title: event.currentTarget.value })} />
                  <input value={step.deadlineText || ""} placeholder="Deadline text" onChange={(event) => patchParsedStep(index, { deadlineText: event.currentTarget.value })} />
                  <p className="subtle">The next physical action will appear in the sidebar when this activity is active.</p>
                </div>
                <div className="activity-controls">
                  <select value={step.taskType || detectedTaskTypes[0] || "Personal / life"} onChange={(event) => patchParsedStep(index, { taskType: event.currentTarget.value as TaskType })}>
                    {taskTypes.filter((type) => type !== "Mixed work").map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <label className="time-field">
                    {t("routineEvery")}
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={step.routineIntervalMinutes ?? ""}
                      onChange={(event) => patchParsedStep(index, { ...syncedRoutinePatch(step, event.currentTarget.value ? Number(event.currentTarget.value) : null), pastDeadlineConfirmed: false })}
                      placeholder="minutes"
                    />
                  </label>
                  {pastDeadline && !step.pastDeadlineConfirmed && (
                    <div className="deadline-warning">
                      <AlertTriangle size={15} />
                      <div>
                        <strong>{t("pastDeadlineTitle")}</strong>
                        <p>{t("pastDeadlineBody")}</p>
                      </div>
                      <button onClick={() => patchParsedStep(index, { pastDeadlineConfirmed: true })}>{t("keepPastDeadline")}</button>
                    </div>
                  )}
                  <button
                    title="Remove"
                    onClick={() => setParsedSteps((steps) => steps.filter((_step, stepIndex) => stepIndex !== index))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
              );
            })}
          </section>
        )}
        <p className="notice">{t("screenshotNotice")}</p>
        {error && <p className="error-note">{error}</p>}
      </div>
    </section>
  );
}

function BlockerScreen({ snapshot }: { snapshot: AppSnapshot }) {
  const alert = snapshot.bannedSiteAlert;
  const step = snapshot.activeStep;
  const strikes = snapshot.bannedSiteStrikeCount;
  useEffect(() => {
    if (!alert) {
      void window.nerve.dismissBlocker();
    }
  }, [alert]);
  return (
    <div className="blocker-screen">
      <div className="blocker-card">
        <div className="blocker-icon">✖</div>
        <h1 className="blocker-title">Leave this site.</h1>
        <p className="blocker-site">{alert?.rule ?? "Banned site"}</p>
        {strikes > 1 && <span className="blocker-strike">Strike #{strikes}</span>}
        {step && (
          <div className="blocker-task">
            <p className="blocker-task-label">Your current task:</p>
            <strong>{step.title}</strong>
            <p>{step.nextAction}</p>
          </div>
        )}
        <button className="blocker-dismiss" onClick={() => window.nerve.dismissBlocker()}>
          I'll leave the site, let me back in
        </button>
      </div>
    </div>
  );
}

function Overlay({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const expanded = snapshot.overlayExpanded || Boolean(snapshot.bannedSiteAlert);
  const opacity = snapshot.settings.panelOpacity;
  const completed = snapshot.steps.filter((step) => step.status === "complete").length;
  const total = snapshot.steps.length || 1;
  const t = useCopy(snapshot.settings.language);
  const latestState = snapshot.observations[0]?.userState;
  const [sideView, setSideView] = useState<"step" | "timetable">("step");
  const [confirmEnd, setConfirmEnd] = useState(false);
  useNow(snapshot.thinkingPauseUntil || snapshot.breakEndsAt ? 1000 : 30_000);
  const prevAlertRef = useRef<typeof snapshot.bannedSiteAlert>(null);
  useEffect(() => {
    if (snapshot.settings.soundEnabled && snapshot.bannedSiteAlert && !prevAlertRef.current) {
      playBannedSiteSound();
    }
    prevAlertRef.current = snapshot.bannedSiteAlert;
  }, [snapshot.bannedSiteAlert, snapshot.settings.soundEnabled]);
  // Reset timetable view when session ends so stale step data doesn't persist
  useEffect(() => {
    const open = snapshot.session?.status === "active" || snapshot.session?.status === "paused";
    if (!open) { setSideView("step"); setConfirmEnd(false); }
  }, [snapshot.session?.status]);
  return (
    <div className={`overlay ${expanded ? "expanded" : "slim"} ${snapshot.bannedSiteAlert ? "banned-active" : ""}`} style={{ opacity }}>
      {!expanded ? (
        <div className="overlay-slim">
          <div className="mark">N</div>
          <div className="vertical-status">{snapshot.session?.status || "idle"}</div>
          <div className="rail-progress">
            <span style={{ height: `${(completed / total) * 100}%` }} />
          </div>
          <p>{snapshot.activeStep?.title || "No session"}</p>
          <button title="Expand" onClick={() => window.nerve.setOverlayExpanded(true)}>
            <ChevronLeft size={18} />
          </button>
        </div>
      ) : (
        <div className="overlay-expanded">
          <div className="overlay-head">
            <div>
              <strong>Nerve</strong>
              <span>{snapshot.session?.status === "completed" ? t("sessionComplete") : t("nextStep")}</span>
            </div>
            <span className={`state-pill ${snapshot.bannedSiteAlert ? "banned" : latestState || "unknown"}`}>
              {snapshot.bannedSiteAlert ? "Blocked" : stateLabel(latestState, t)}
            </span>
            {!snapshot.bannedSiteAlert && (
              <button title="Collapse" onClick={() => window.nerve.setOverlayExpanded(false)}>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
          <div className="side-toggle">
            <button className={sideView === "step" ? "active" : ""} onClick={() => setSideView("step")}>
              <Check size={14} /> Step
            </button>
            <button className={sideView === "timetable" ? "active" : ""} onClick={() => setSideView("timetable")}>
              <Clock size={14} /> Time
            </button>
          </div>
          <div className="overlay-scroll-area">
            {sideView === "step" ? (
              <>
                {snapshot.bannedSiteAlert ? <BannedSiteCard snapshot={snapshot} /> : <StepCard snapshot={snapshot} setSnapshot={setSnapshot} compact />}
                {snapshot.thinkingPauseUntil && Date.parse(snapshot.thinkingPauseUntil) > Date.now() && (
                  <div className="timer quiet">
                    <Pause size={15} /> {t("stateThinking")} {timeLeft(snapshot.thinkingPauseUntil)}
                  </div>
                )}
                {snapshot.breakEndsAt && Date.parse(snapshot.breakEndsAt) > Date.now() && (
                  <div className="timer quiet">
                    <Clock size={15} /> {t("breakEndsIn")} {timeLeft(snapshot.breakEndsAt)}
                  </div>
                )}
              </>
            ) : (
              <SideTimetable snapshot={snapshot} />
            )}
          </div>
          {sideView === "step" && (
            <div className="overlay-links">
              {snapshot.session?.status === "active" && <button onClick={async () => setSnapshot(await window.nerve.pauseSession())}>{t("pauseSession")}</button>}
              {snapshot.session?.status === "paused" && <button onClick={async () => setSnapshot(await window.nerve.resumeSession())}>{t("resumeSession")}</button>}
              <button onClick={() => window.nerve.openMain("/plan")}>{t("viewPlan")}</button>
              <button onClick={() => window.nerve.openMain("/log")}>{t("viewLog")}</button>
              <button onClick={() => window.nerve.openMain("/settings")}>{t("settings")}</button>
              {snapshot.session && snapshot.session.status !== "completed" && (
                confirmEnd ? (
                  <div className="overlay-confirm-end">
                    <p>{t("endSessionConfirm")}</p>
                    <div className="overlay-confirm-btns">
                      <button className="danger-sm" onClick={async () => { setConfirmEnd(false); setSnapshot(await window.nerve.endSession()); }}>{t("endSessionConfirmYes")}</button>
                      <button onClick={() => setConfirmEnd(false)}>{t("endSessionConfirmNo")}</button>
                    </div>
                  </div>
                ) : (
                  <button className="danger-sm" onClick={() => setConfirmEnd(true)}>{t("endSession")}</button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BannedSiteCard({ snapshot }: { snapshot: AppSnapshot }) {
  const alert = snapshot.bannedSiteAlert;
  const strikes = snapshot.bannedSiteStrikeCount;
  const t = useCopy(snapshot.settings.language);
  const bodyText = strikes >= 3 ? t("bannedSiteBody3") : strikes === 2 ? t("bannedSiteBody2") : t("bannedSiteBody");
  return (
    <section className="banned-card">
      <div className="banned-card-head">
        <p className="eyebrow">{alert?.rule || t("bannedSites")}</p>
        {strikes > 1 && <span className="strike-badge">#{strikes}</span>}
      </div>
      <h2>{t("bannedSiteTitle")}</h2>
      <p>{bodyText}</p>
      {snapshot.activeStep && (
        <div className="return-task">
          <span>{t("bannedSiteAction")}</span>
          <strong>{snapshot.activeStep.title}</strong>
          <p>{snapshot.activeStep.nextAction}</p>
        </div>
      )}
      <p className="subtle">{alert?.activeApp}: {alert?.windowTitle}</p>
    </section>
  );
}

function SideTimetable({ snapshot }: { snapshot: AppSnapshot }) {
  const activeId = snapshot.activeStep?.id;
  const now = Date.now();
  const missedSteps = snapshot.steps.filter((step) =>
    step.status !== "complete" && (
      Boolean(step.dueAt && Date.parse(step.dueAt) < now) ||
      Boolean(step.reminderAt && Date.parse(step.reminderAt) < now)
    )
  );
  const missedStepIds = new Set(missedSteps.map((step) => step.id));
  const missedReminders = snapshot.reminders.filter((reminder) =>
    reminder.status !== "dismissed" &&
    !reminder.stepId &&
    (reminder.status === "triggered" || (reminder.status === "scheduled" && Date.parse(reminder.reminderAt) < now))
  );
  const steps = sortBySchedule(snapshot.steps).filter((step) =>
    !missedStepIds.has(step.id) &&
    step.status !== "complete" &&
    (isToday(step.reminderAt) || isToday(step.dueAt))
  );
  const reminders = snapshot.reminders
    .filter((reminder) =>
      reminder.status !== "dismissed" &&
      reminder.status !== "triggered" &&
      !reminder.stepId &&
      isToday(reminder.reminderAt) &&
      Date.parse(reminder.reminderAt) >= now
    )
    .slice(0, 6);
  return (
    <section className="side-timetable">
      {(steps.length > 0 || reminders.length > 0) && <h3 className="side-section-title">Upcoming</h3>}
      {steps.length === 0 && reminders.length === 0 && missedSteps.length === 0 && missedReminders.length === 0 && (
        <div className="side-empty">No same-day activity scheduled.</div>
      )}
      {steps.map((step) => {
        const isPastDue = hasPastDeadline(step) && step.status !== "complete";
        return (
          <article className={`${step.status} ${step.id === activeId ? "current" : ""} ${isPastDue ? "past-due" : ""}`} key={step.id}>
            <div className="side-time">
              <span>Remind</span>
              <strong>{timeLabel(step.routineNextAt || step.reminderAt)}</strong>
              <span>Due {timeLabel(step.dueAt)}</span>
            </div>
            <div className="side-activity">
              <span>{step.taskType}</span>
              <strong>{step.title}</strong>
              <p>{step.routineIntervalMinutes ? `Routine · every ${step.routineIntervalMinutes}m` : step.id === activeId ? "Current step" : step.status}</p>
            </div>
          </article>
        );
      })}
      {reminders.length > 0 && (
        <div className="side-reminders">
          <h3>Reminders</h3>
          {reminders.map((reminder) => (
            <article className={reminder.status} key={reminder.id}>
              <div className="side-time">
                <span>{reminder.status}</span>
                <strong>{timeLabel(reminder.reminderAt)}</strong>
              </div>
              <div className="side-activity">
                <span>{reminder.taskType}</span>
                <strong>{reminder.title}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
      {(missedSteps.length > 0 || missedReminders.length > 0) && (
        <div className="side-reminders missed">
          <h3>Missed events</h3>
          {missedSteps.slice(0, 4).map((step) => (
            <article className="past-due" key={`missed-step-${step.id}`}>
              <div className="side-time">
                <span>Missed</span>
                <strong>{timeLabel(step.reminderAt || step.dueAt)}</strong>
              </div>
              <div className="side-activity">
                <span>{step.taskType}</span>
                <strong>{step.title}</strong>
              </div>
            </article>
          ))}
          {missedReminders.slice(0, 4).map((reminder) => (
            <article className="triggered" key={`missed-reminder-${reminder.id}`}>
              <div className="side-time">
                <span>{reminder.status}</span>
                <strong>{timeLabel(reminder.reminderAt)}</strong>
              </div>
              <div className="side-activity">
                <span>{reminder.taskType}</span>
                <strong>{reminder.title}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StepCard({
  snapshot,
  setSnapshot,
  compact = false
}: {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  compact?: boolean;
}) {
  const step = snapshot.activeStep;
  const latestObservation = snapshot.observations[0];
  const observation =
    step && latestObservation?.stepId === step.id
      ? latestObservation
      : undefined;
  const thinking = snapshot.thinkingPauseUntil && Date.parse(snapshot.thinkingPauseUntil) > Date.now();
  const breakActive = snapshot.breakEndsAt && Date.parse(snapshot.breakEndsAt) > Date.now();
  const t = useCopy(snapshot.settings.language);
  const paused = snapshot.session?.status === "paused";
  const { completed, percent, total } = completionStats(snapshot.steps);
  async function action(type: "done" | "thinking" | "delay" | "markDone" | "keepWorking") {
    setSnapshot(await window.nerve.action(type));
  }
  if (!snapshot.session) {
    return <div className="step-card"><p>{t("noSession")}</p></div>;
  }
  if (breakActive) {
    return (
      <section className={`step-card ${compact ? "compact" : ""}`}>
        <div className="step-card-head">
          <div>
            <p className="eyebrow">{t("breakTime")}</p>
            <h2>{t("breakEndsIn")} {timeLeft(snapshot.breakEndsAt)}</h2>
          </div>
          <span className="task-badge">{t("breakReminders")}</span>
        </div>
        <p className="muted">{step ? `${t("getBackToWork")}: ${step.title}` : t("waitingRoutineBody")}</p>
        <button className="primary" onClick={() => action("endBreak")}>
          <Play size={16} /> {t("getBackToWork")}
        </button>
      </section>
    );
  }
  if (snapshot.session.status === "completed") {
    return <div className="step-card"><h2>{t("sessionComplete")}</h2><p className="muted">{t("sessionComplete")}</p></div>;
  }
  if (!step) {
    return (
      <section className={`step-card ${compact ? "compact" : ""}`}>
        <div className="step-card-head">
          <div>
            <p className="eyebrow">{t("routine")}</p>
            <h2>{t("waitingRoutineTitle")}</h2>
          </div>
        </div>
        <p className="muted">{t("waitingRoutineBody")}</p>
        {snapshot.steps.some((candidate) => candidate.routineNextAt) && (
          <div className="step-meta">
            <span>{t("routineNext")} {nextScheduledLabel(snapshot.steps)}</span>
          </div>
        )}
      </section>
    );
  }
  if (paused) {
    return (
      <section className={`step-card ${compact ? "compact" : ""}`}>
        <div className="step-card-head">
          <div>
            <p className="eyebrow">{t("currentStep")}</p>
            <h2>{step.title}</h2>
          </div>
          <span className="task-badge">{step.taskType}</span>
        </div>
        <p className="muted">{t("pausedBody")}</p>
        <button className="primary" onClick={async () => setSnapshot(await window.nerve.resumeSession())}>
          <Play size={16} /> {t("resumeSession")}
        </button>
      </section>
    );
  }
  return (
    <section className={`step-card ${compact ? "compact" : ""} ${hasPastDeadline(step) ? "past-due" : ""}`}>
      <div className="step-card-head">
        <div>
          <p className="eyebrow">{t("currentStep")}</p>
          <h2>{step.title}</h2>
        </div>
        <span className="task-badge">{step.taskType}</span>
      </div>
      <div className="progress-line" aria-label={`${percent}% complete`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="step-meta">
        <span>{completed}/{total} complete</span>
        {step.reminderAt && <span className={isPast(step.reminderAt) ? "past-due-chip" : ""}>Remind {new Date(step.reminderAt).toLocaleString()}</span>}
        {step.dueAt && <span className={isPast(step.dueAt) ? "past-due-chip" : ""}>Due {new Date(step.dueAt).toLocaleString()}</span>}
        {step.routineIntervalMinutes && <span>{t("routineEvery")} {step.routineIntervalMinutes} min</span>}
        {step.routineNextAt && <span className={isPast(step.routineNextAt) ? "past-due-chip" : ""}>{t("routineNext")} {new Date(step.routineNextAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        {step.delayCount > 0 && <span>{step.delayCount} delays</span>}
      </div>
      <p className="action-text">{observation?.suggestedNextAction || step.nextAction}</p>
      <p className="muted">
        {thinking
          ? t("thinkingHold")
          : observation?.conciseExplanation || step.explanation || t("nextPhysical")}
      </p>
      {observation?.suggestedStepComplete && (
        <div className="completion-prompt">
          <span>{t("completePrompt")}</span>
          <button onClick={() => action("markDone")}>{t("markDone")}</button>
          <button onClick={() => action("keepWorking")}>{t("keepWorking")}</button>
        </div>
      )}
      <div className={compact ? "button-grid" : "button-row"}>
        <button className="primary" onClick={() => action("done")}>
          <Check size={16} /> {t("done")}
        </button>
        <button onClick={() => action("thinking")}>
          {thinking ? <Play size={16} /> : <Pause size={16} />} {thinking ? t("cancelThinking") : t("thinking")}
        </button>
        <button onClick={() => action("delay")}>
          <Clock size={16} /> {t("delay")}
        </button>
        {!compact && (
          <button onClick={async () => setSnapshot(await window.nerve.pauseSession())}>
            <Pause size={16} /> {t("pauseSession")}
          </button>
        )}
      </div>
    </section>
  );
}

function QuickNotesSection({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const t = useCopy(snapshot.settings.language);
  const [note, setNote] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canAdd = note.trim().length > 0 && reminderAt;

  async function addNote() {
    if (!reminderAt) {
      setError(t("reminderRequired"));
      return;
    }
    try {
      setError(null);
      const refreshed = await window.nerve.addNoteToPlan({ note, reminderAt: fromDateTimeLocal(reminderAt) ?? "" });
      setSnapshot(refreshed);
      setNote("");
      setReminderAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reminderRequired"));
    }
  }

  return (
    <section className="note-panel">
      <div className="settings-section-head">
        <FileText size={16} />
        <h3>{t("quickNotes")}</h3>
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("notePlaceholder")} />
      <div className="note-controls">
        <label>
          {t("noteReminder")}
          <input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.currentTarget.value)} />
        </label>
        <button className="primary" disabled={!canAdd} onClick={addNote}>
          <Plus size={14} /> {t("addNote")}
        </button>
      </div>
      {error && <p className="error-note">{error}</p>}
    </section>
  );
}

function ReminderPanel({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const t = useCopy(snapshot.settings.language);
  const [snoozeAt, setSnoozeAt] = useState<Record<string, string>>({});
  const reminders = snapshot.reminders
    .filter((reminder) => reminder.status !== "dismissed")
    .slice()
    .sort((a, b) => {
      if (a.status === "triggered" && b.status !== "triggered") return -1;
      if (a.status !== "triggered" && b.status === "triggered") return 1;
      return a.reminderAt.localeCompare(b.reminderAt);
    })
    .slice(0, 8);

  async function startNow(reminderId: string) {
    setSnapshot(await window.nerve.startReminder(reminderId));
  }

  async function remindLater(reminderId: string) {
    const value = snoozeAt[reminderId] || defaultReminderLocal(30);
    setSnapshot(await window.nerve.snoozeReminder(reminderId, fromDateTimeLocal(value) ?? ""));
  }

  if (reminders.length === 0) return null;
  return (
    <section className="reminder-panel">
      <div className="settings-section-head">
        <CalendarClock size={16} />
        <h3>{t("reminders")}</h3>
      </div>
      {reminders.map((reminder) => (
        <article className={reminder.status} key={reminder.id}>
          <div>
            <strong>{reminder.title}</strong>
            <span>{reminder.status} · {new Date(reminder.reminderAt).toLocaleString()}</span>
          </div>
          {reminder.message && <p>{reminder.message}</p>}
          {reminder.status === "triggered" && (
            <div className="reminder-actions">
              <button className="primary" onClick={() => startNow(reminder.id)}>
                <Play size={13} /> {t("startNow")}
              </button>
              <input
                type="datetime-local"
                value={snoozeAt[reminder.id] ?? defaultReminderLocal(30)}
                onChange={(event) => setSnoozeAt({ ...snoozeAt, [reminder.id]: event.currentTarget.value })}
              />
              <button onClick={() => remindLater(reminder.id)}>
                <Clock size={13} /> {t("remindLater")}
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

type CalendarItem = {
  id: string;
  dateKey: string;
  at: string;
  kind: "reminder" | "due";
  title: string;
  subtitle: string;
  status: string;
  taskType: string;
};

function calendarItems(snapshot: AppSnapshot): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const step of snapshot.steps) {
    if (step.reminderAt) {
      items.push({
        id: `${step.id}:reminder`,
        dateKey: localDateKey(step.reminderAt),
        at: step.reminderAt,
        kind: "reminder",
        title: step.title,
        subtitle: step.nextAction,
        status: step.status,
        taskType: step.taskType
      });
    }
    if (step.dueAt) {
      items.push({
        id: `${step.id}:due`,
        dateKey: localDateKey(step.dueAt),
        at: step.dueAt,
        kind: "due",
        title: step.title,
        subtitle: step.deadlineText || "Due",
        status: step.status,
        taskType: step.taskType
      });
    }
  }
  for (const reminder of snapshot.reminders) {
    if (reminder.status === "dismissed") continue;
    if (reminder.stepId && reminder.status === "scheduled") continue;
    items.push({
      id: `reminder:${reminder.id}`,
      dateKey: localDateKey(reminder.reminderAt),
      at: reminder.reminderAt,
      kind: "reminder",
      title: reminder.title,
      subtitle: reminder.message,
      status: reminder.status,
      taskType: reminder.taskType
    });
  }
  return items
    .filter((item) => item.dateKey)
    .sort((a, b) => a.at.localeCompare(b.at));
}

function CalendarScreen({ snapshot }: { snapshot: AppSnapshot }) {
  const t = useCopy(snapshot.settings.language);
  const [month, setMonth] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState(() => localDateKey(new Date()));
  const items = calendarItems(snapshot);
  const grouped = new Map<string, CalendarItem[]>();
  for (const item of items) {
    grouped.set(item.dateKey, [...(grouped.get(item.dateKey) ?? []), item]);
  }
  const cells = monthCells(month);
  const selectedItems = (grouped.get(selectedKey) ?? []).sort((a, b) => a.at.localeCompare(b.at));
  const moveMonth = (delta: number) => {
    const next = new Date(month);
    next.setMonth(month.getMonth() + delta, 1);
    setMonth(next);
  };
  return (
    <section className="calendar-layout">
      <div className="calendar-shell">
        <div className="calendar-main">
          <div className="calendar-toolbar">
            <button title="Previous month" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={16} />
            </button>
            <div className="page-title compact">
              <span className="eyebrow">Schedule</span>
              <h2>{monthTitle(month)}</h2>
            </div>
            <button title="Next month" onClick={() => moveMonth(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="month-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span className="weekday" key={day}>{day}</span>
            ))}
            {cells.map((date) => {
              const key = localDateKey(date);
              const dayItems = grouped.get(key) ?? [];
              return (
                <button
                  className={`calendar-cell ${sameMonth(date, month) ? "" : "outside"} ${key === selectedKey ? "selected" : ""} ${key === localDateKey(new Date()) ? "today" : ""}`}
                  key={key}
                  onClick={() => setSelectedKey(key)}
                >
                  <span>{date.getDate()}</span>
                  {dayItems.length > 0 && (
                    <strong>{dayItems.length}</strong>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="calendar-detail">
          <div className="calendar-day-head">
            <h3>{calendarLabel(selectedKey)}</h3>
            <span>{selectedItems.length}</span>
          </div>
          {selectedItems.length === 0 ? (
            <EmptyState icon={<CalendarClock size={18} />} title="No activity" body="Scheduled notes, inbox items, reminders, and due dates will appear here." />
          ) : (
            <div className="calendar-items">
              {selectedItems.map((item) => (
                <article className={`${item.kind} ${item.status}`} key={item.id}>
                  <time>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.subtitle}</p>
                    <span>{item.kind === "due" ? "Due" : "Reminder"} · {item.taskType} · {item.status}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function PlanEditor({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const session = snapshot.session;
  const { completed, percent, total } = completionStats(snapshot.steps);
  const [replanning, setReplanning] = useState(false);
  const t = useCopy(snapshot.settings.language);
  async function patch(step: StepRecord, patchValue: Partial<StepRecord>) {
    setSnapshot(await window.nerve.updateStep(step.id, patchValue));
  }
  async function replan() {
    setReplanning(true);
    try {
      setSnapshot(await window.nerve.replanSession());
    } finally {
      setReplanning(false);
    }
  }
  if (!session) return <SessionStart setSnapshot={setSnapshot} settings={snapshot.settings} />;
  return (
    <section className="content-grid">
      <div className="side-stack">
        <StepCard snapshot={snapshot} setSnapshot={setSnapshot} />
        <QuickNotesSection snapshot={snapshot} setSnapshot={setSnapshot} />
        <ReminderPanel snapshot={snapshot} setSnapshot={setSnapshot} />
        <BreadcrumbTrail breadcrumbs={snapshot.breadcrumbs.slice(0, 8).reverse()} />
      </div>
      <div className="plan-list">
        <div className="section-head">
          <div className="page-title compact">
            <span className="eyebrow">Plan</span>
            <h2>Editable plan</h2>
          </div>
          <div className="section-head-actions">
            <button onClick={replan} disabled={replanning}>
              <RefreshCw size={16} /> {replanning ? t("replanning") : t("replanSession")}
            </button>
            <button onClick={async () => setSnapshot(await window.nerve.addStep(session.id))}>
              <Plus size={16} /> Add step
            </button>
          </div>
        </div>
        <div className="plan-summary">
          <div>
            <strong>{percent}%</strong>
            <span>{completed}/{total} complete</span>
          </div>
          <div>
            <strong>{nextScheduledLabel(snapshot.steps)}</strong>
            <span>next time</span>
          </div>
          <div>
            <strong>{snapshot.reminders.length}</strong>
            <span>reminders</span>
          </div>
        </div>
        {snapshot.steps.map((step) => (
          <article className={`plan-step ${step.status} ${hasPastDeadline(step) && step.status !== "complete" ? "past-due" : ""}`} key={step.id}>
            <div className="step-index">{step.orderIndex + 1}</div>
            <div className="step-fields">
              <input key={`title-${step.id}-${step.title}`} defaultValue={step.title} onBlur={(event) => patch(step, { title: event.currentTarget.value })} />
              <textarea key={`action-${step.id}-${step.nextAction}`} defaultValue={step.nextAction} onBlur={(event) => patch(step, { nextAction: event.currentTarget.value })} />
              <div className="deadline-fields">
                <label>
                  Remind
                  <input
                    key={`remind-${step.id}-${step.reminderAt ?? ""}`}
                    type="datetime-local"
                    defaultValue={toDateTimeLocal(step.reminderAt)}
                    onBlur={(event) => {
                      const reminderAt = fromDateTimeLocal(event.currentTarget.value);
                      patch(step, {
                        reminderAt,
                        ...(step.routineIntervalMinutes && reminderAt ? { routineNextAt: addMinutesIso(reminderAt, step.routineIntervalMinutes) } : {})
                      });
                    }}
                  />
                </label>
                <label>
                  Due
                  <input key={`due-${step.id}-${step.dueAt ?? ""}`} type="datetime-local" defaultValue={toDateTimeLocal(step.dueAt)} onBlur={(event) => patch(step, { dueAt: fromDateTimeLocal(event.currentTarget.value) })} />
                </label>
                <label>
                  {t("routineEvery")}
                  <input key={`routine-interval-${step.id}-${step.routineIntervalMinutes ?? ""}`} type="number" min="0" step="5" defaultValue={step.routineIntervalMinutes ?? ""} onBlur={(event) => patch(step, { routineIntervalMinutes: event.currentTarget.value ? Number(event.currentTarget.value) : null })} />
                </label>
                <label>
                  {t("routineNext")}
                  <input
                    key={`routine-next-${step.id}-${step.routineNextAt ?? ""}`}
                    type="datetime-local"
                    defaultValue={toDateTimeLocal(step.routineNextAt)}
                    onBlur={(event) => {
                      const routineNextAt = fromDateTimeLocal(event.currentTarget.value);
                      patch(step, {
                        routineNextAt,
                        ...(step.routineIntervalMinutes ? { reminderAt: routineNextAt } : {})
                      });
                    }}
                  />
                </label>
              </div>
              {hasPastDeadline(step) && step.status !== "complete" && (
                <p className="deadline-warning">
                  <AlertTriangle size={15} /> {t("pastDeadlineTitle")}
                </p>
              )}
              <span>{step.status}</span>
            </div>
            <div className="step-controls">
              <button title="Move up" onClick={async () => setSnapshot(await window.nerve.reorderStep(step.id, "up"))}>
                <ArrowUp size={15} />
              </button>
              <button title="Move down" onClick={async () => setSnapshot(await window.nerve.reorderStep(step.id, "down"))}>
                <ArrowDown size={15} />
              </button>
              <button title="Mark complete" onClick={() => patch(step, { status: "complete" })}>
                <Check size={15} />
              </button>
              <button title="Delete" onClick={async () => setSnapshot(await window.nerve.deleteStep(step.id))}>
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BreadcrumbTrail({ breadcrumbs, compact = false }: { breadcrumbs: AppSnapshot["breadcrumbs"]; compact?: boolean }) {
  if (breadcrumbs.length === 0) {
    return null;
  }
  return (
    <div className={`breadcrumbs ${compact ? "compact" : ""}`}>
      {breadcrumbs.map((crumb) => (
        <span className={crumb.relevance} key={crumb.id}>
          {compact ? (
            <>
              <strong>{crumb.appName}</strong>
              <em>{crumb.windowTitle || "Untitled"}</em>
            </>
          ) : (
            `${crumb.appName}: “${crumb.windowTitle || "Untitled"}”`
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Log helpers ────────────────────────────────────────────────────────────

const SKIP_EVENTS = new Set([
  "screenshot_captured", "app_window_changed", "ai_observation", "capture_error"
]);

function getMeta(event: EventRecord): Record<string, unknown> {
  try { return JSON.parse(event.metadataJson) || {}; } catch { return {}; }
}

type TlEventClass = "tl-start" | "tl-end" | "tl-done" | "tl-warn" | "tl-error" | "tl-nudge" | "tl-pause" | "tl-info";

function eventClass(type: string): TlEventClass {
  if (["session_started", "session_resumed"].includes(type)) return "tl-start";
  if (["session_ended", "session_completed"].includes(type)) return "tl-end";
  if (["session_paused", "thinking_clicked", "thinking_cancelled", "break_started", "break_finished", "break_cancelled"].includes(type)) return "tl-pause";
  if (["step_done", "guidance_done"].includes(type)) return "tl-done";
  if (["banned_site_detected", "deadline_reminder_triggered", "routine_promoted"].includes(type)) return "tl-warn";
  if (type === "provider_error") return "tl-error";
  if (type === "step_shown") return "tl-nudge";
  return "tl-info";
}

function eventLabel(type: string, meta: Record<string, unknown>, stepMap: Map<string, string>): string {
  switch (type) {
    case "session_started": return "Session started";
    case "session_ended": return "Session ended";
    case "session_paused": return "Session paused";
    case "session_resumed": return "Session resumed";
    case "session_completed": return "All steps completed";
    case "step_done": {
      const title = meta.stepId ? stepMap.get(meta.stepId as string) : null;
      return title ? `Completed: ${title}` : "Step completed";
    }
    case "guidance_done": return "Sub-step done";
    case "step_added": return "Step added to plan";
    case "step_deleted": return meta.title ? `Removed: ${meta.title as string}` : "Step removed";
    case "step_reprioritized": return "Priority changed";
    case "banned_site_detected": return `Flagged: ${meta.rule || "banned site"}`;
    case "step_shown": return "Nudge sent";
    case "thinking_clicked": return "Thinking pause";
    case "thinking_cancelled": return "Thinking pause ended";
    case "routine_promoted": return "Routine moved to priority 1";
    case "routine_repeated": return "Routine scheduled again";
    case "break_started": return "Break started";
    case "break_finished": return "Back-to-work reminder";
    case "break_cancelled": return "Break ended";
    case "replan": return "Plan regenerated";
    case "deadline_reminder_triggered": return meta.routine ? `Routine reminder: ${meta.title || ""}` : `Deadline reminder: ${meta.title || ""}`;
    case "provider_error": return "AI analysis failed";
    default: return type.replaceAll("_", " ");
  }
}

function eventDetail(type: string, event: EventRecord): string | null {
  if (type === "step_shown") return event.message;
  if (type === "provider_error") return event.message;
  if (type === "session_started") return null;
  return null;
}

type TlItem =
  | { kind: "event"; at: string; event: EventRecord }
  | { kind: "crumb"; at: string; crumb: BreadcrumbRecord };

function buildTimeline(events: EventRecord[], breadcrumbs: BreadcrumbRecord[]): TlItem[] {
  const items: TlItem[] = [];
  for (const event of events) {
    if (!SKIP_EVENTS.has(event.type)) items.push({ kind: "event", at: event.createdAt, event });
  }
  for (const crumb of breadcrumbs) {
    if ((crumb.durationSeconds ?? 0) >= 30) items.push({ kind: "crumb", at: crumb.startedAt, crumb });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

function computeLogStats(
  events: EventRecord[],
  breadcrumbs: BreadcrumbRecord[],
  steps: StepRecord[],
  sessionStart: string,
  sessionEnd?: string | null
) {
  const durationSec = sessionEnd
    ? Math.round((Date.parse(sessionEnd) - Date.parse(sessionStart)) / 1000)
    : Math.round((Date.now() - Date.parse(sessionStart)) / 1000);
  const totalSteps = steps.length;
  const doneSteps = steps.filter((s) => s.status === "complete").length;
  const relevantSec = breadcrumbs.filter((b) => b.relevance === "productive").reduce((n, b) => n + (b.durationSeconds ?? 0), 0);
  const totalBreadcrumbSec = breadcrumbs.reduce((n, b) => n + (b.durationSeconds ?? 0), 0);
  const focusPct = totalBreadcrumbSec > 30 ? Math.round((relevantSec / totalBreadcrumbSec) * 100) : null;
  const driftCount = events.filter((e) => e.type === "banned_site_detected").length;
  const nudgeCount = events.filter((e) => e.type === "step_shown").length;
  return { durationSec, totalSteps, doneSteps, focusPct, driftCount, nudgeCount };
}

// ─── LogSummary ─────────────────────────────────────────────────────────────

function LogSummary({ session, events, breadcrumbs, steps }: SessionLogData) {
  const { durationSec, totalSteps, doneSteps, focusPct, driftCount, nudgeCount } =
    computeLogStats(events, breadcrumbs, steps, session.startedAt, session.endedAt);
  const allDone = doneSteps === totalSteps && totalSteps > 0;
  const statusLabel = session.status === "completed" ? "Completed" : session.status === "paused" ? "Paused" : "In progress";

  return (
    <div className="log-summary">
      <div className="log-summary-top">
        <span className={`task-badge ${session.status}`}>{statusLabel}</span>
        <p className="log-summary-goal">{session.goal}</p>
        {session.taskTypes.length > 0 && (
          <p className="log-summary-types">{session.taskTypes.join(" · ")}</p>
        )}
      </div>
      <div className="log-summary-stats">
        <span className="stat-chip"><Clock size={11} /> {formatDuration(durationSec)}</span>
        <span className={`stat-chip ${allDone ? "good" : ""}`}>
          <Check size={11} /> {doneSteps}/{totalSteps} steps
        </span>
        {focusPct !== null && (
          <span className={`stat-chip ${focusPct >= 70 ? "good" : focusPct >= 40 ? "" : "warn"}`}>
            <Activity size={11} /> {focusPct}% focus time
          </span>
        )}
        {driftCount > 0 && (
          <span className="stat-chip warn"><AlertTriangle size={11} /> {driftCount} drift{driftCount !== 1 ? "s" : ""}</span>
        )}
        {nudgeCount > 0 && (
          <span className="stat-chip"><Zap size={11} /> {nudgeCount} nudge{nudgeCount !== 1 ? "s" : ""}</span>
        )}
        {session.startedAt && (
          <span className="stat-chip">
            <CalendarClock size={11} /> {new Date(session.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── LogTimeline ─────────────────────────────────────────────────────────────

function LogTimeline({ events, breadcrumbs, steps }: Pick<SessionLogData, "events" | "breadcrumbs" | "steps">) {
  const stepMap = new Map(steps.map((s) => [s.id, s.title]));
  const items = buildTimeline(events, breadcrumbs);

  if (items.length === 0) {
    return <EmptyState icon={<Activity size={18} />} title="No activity yet" body="Actions will appear here as the session progresses." />;
  }

  return (
    <div className="tl">
      {items.map((item, i) => {
        if (item.kind === "event") {
          const meta = getMeta(item.event);
          const cls = eventClass(item.event.type);
          const label = eventLabel(item.event.type, meta, stepMap);
          const detail = eventDetail(item.event.type, item.event);
          return (
            <div key={item.event.id} className={`tl-item ${cls}`}>
              <time className="tl-time">{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              <div className="tl-dot" />
              <div className="tl-body">
                <p className="tl-label">{label}</p>
                {detail && <p className="tl-detail">{detail}</p>}
              </div>
            </div>
          );
        } else {
          const { appName, windowTitle, durationSeconds, relevance } = item.crumb;
          const title = windowTitle && windowTitle !== appName ? windowTitle : null;
          return (
            <div key={`${item.crumb.id}-${i}`} className={`tl-item tl-crumb tl-crumb-${relevance}`}>
              <time className="tl-time">{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              <div className="tl-dot" />
              <div className="tl-body">
                <p className="tl-label">
                  <Monitor size={11} className="tl-crumb-icon" />
                  {appName}{title ? <span className="tl-crumb-title"> · {title}</span> : null}
                  {durationSeconds ? <span className="tl-crumb-dur">{formatDuration(durationSeconds)}</span> : null}
                </p>
              </div>
            </div>
          );
        }
      })}
    </div>
  );
}

// ─── SessionLog (current session) ────────────────────────────────────────────

function SessionLog({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  if (!snapshot.session) {
    return (
      <section className="log-layout">
        <div className="events">
          <EmptyState icon={<Activity size={18} />} title="No active session" body="Start a session to see the log." />
        </div>
      </section>
    );
  }

  const logData: SessionLogData = {
    session: snapshot.session,
    events: snapshot.events,
    breadcrumbs: snapshot.breadcrumbs,
    steps: snapshot.steps,
  };

  return (
    <section className="log-layout">
      <div className="events">
        <div className="page-title compact">
          <span className="eyebrow">Live</span>
          <h2>Session log</h2>
        </div>
        <LogSummary {...logData} />
        <LogTimeline events={snapshot.events} breadcrumbs={snapshot.breadcrumbs} steps={snapshot.steps} />
      </div>
      <div className="gallery">
        <ReminderPanel snapshot={snapshot} setSnapshot={setSnapshot} />
        <div className="section-head">
          <div className="page-title compact">
            <span className="eyebrow">Capture</span>
            <h2>Screenshots</h2>
          </div>
          <span className="count-pill">{snapshot.screenshots.length}</span>
        </div>
        {snapshot.screenshots.length === 0 ? (
          <EmptyState icon={<Camera size={18} />} title="No screenshots yet" body="Captured frames will appear here." />
        ) : (
          <div className="thumb-grid">
            {snapshot.screenshots.map((shot) => (
              <figure key={shot.id}>
                {shot.thumbnailPath && <img src={fileSrc(shot.thumbnailPath)} alt="" />}
                <figcaption>
                  <strong>{new Date(shot.capturedAt).toLocaleTimeString()}</strong>
                  <span>{shot.activeApp}</span>
                  <span>{shot.windowTitle}</span>
                  <span>{shot.aiState || "—"}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── SessionHistory ───────────────────────────────────────────────────────────

function SessionHistory() {
  const [sessions, setSessions] = useState<SessionSummaryRecord[]>([]);
  const [detail, setDetail] = useState<SessionLogData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.nerve.getSessions().then(setSessions);
  }, []);

  async function openDetail(sessionId: string) {
    setLoading(true);
    const data = await window.nerve.getSessionLog(sessionId);
    setDetail(data);
    setLoading(false);
  }

  if (detail) {
    return (
      <section className="history-layout">
        <button className="history-back" onClick={() => setDetail(null)}>
          <ChevronLeft size={15} /> Back to history
        </button>
        <LogSummary {...detail} />
        <LogTimeline events={detail.events} breadcrumbs={detail.breadcrumbs} steps={detail.steps} />
      </section>
    );
  }

  return (
    <section className="history-layout">
      <div className="section-head">
        <div className="page-title compact">
          <span className="eyebrow">Archive</span>
          <h2>Session history</h2>
        </div>
        <button onClick={() => window.nerve.getSessions().then(setSessions)} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {sessions.length === 0 ? (
        <EmptyState icon={<Clock size={18} />} title="No sessions yet" body="Completed sessions will appear here." />
      ) : (
        <div className="history-list">
          {sessions.map((session) => {
            const allDone = session.completedStepCount === session.stepCount && session.stepCount > 0;
            return (
              <article
                className={`history-card ${session.status} history-card-clickable`}
                key={session.id}
                onClick={() => openDetail(session.id)}
              >
                <div className="history-card-top">
                  <span className={`task-badge ${session.status}`}>{session.status}</span>
                  <h3>{session.goal}</h3>
                  <p className="muted">{session.taskTypes.join(" · ")}</p>
                </div>
                <div className="history-metrics">
                  <span><strong>{formatDuration(session.durationSeconds)}</strong> spent</span>
                  <span className={allDone ? "metric-good" : ""}>
                    <strong>{session.completedStepCount}/{session.stepCount}</strong> steps done
                  </span>
                  <span><strong>{Math.round(session.completionRate * 100)}%</strong> complete</span>
                  {session.driftCount > 0 && (
                    <span className="metric-warn"><strong>{session.driftCount}</strong> drift{session.driftCount !== 1 ? "s" : ""}</span>
                  )}
                </div>
                <p className="subtle">
                  {new Date(session.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {session.endedAt ? ` → ${new Date(session.endedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })}` : " · ongoing"}
                  <span className="history-card-hint">View log →</span>
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InboxScreen({ snapshot, language }: { snapshot: AppSnapshot; language: "en" | "zh" }) {
  const t = useCopy(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderDrafts, setReminderDrafts] = useState<Record<string, string>>({});
  const connectors = (snapshot as any).connectors as ConnectorStatus[] ?? [];
  const inboxItems = (snapshot as any).inboxItems as ActionItem[] ?? [];
  const gmailConnector = connectors.find((c) => c.name === "gmail");
  const isConnected = gmailConnector?.connected === true;
  const visibleItems = inboxItems.filter((i) => i.status !== "dismissed");
  const googleClientId = (snapshot.settings as any).googleClientId as string ?? "";
  const hasActivePlan = snapshot.session?.status === "active" || snapshot.session?.status === "paused";

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      await (window.nerve as any).connectGmail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Gmail.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await (window.nerve as any).disconnectGmail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFetch() {
    setBusy(true);
    setError(null);
    try {
      await (window.nerve as any).fetchInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan inbox.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateItem(itemId: string, status: ActionItemStatus) {
    if (status === "promoted" && !hasActivePlan) {
      setError(t("inboxNoActivePlan"));
      return;
    }
    if (status === "promoted") {
      const item = inboxItems.find((candidate) => candidate.id === itemId);
      const reminderAt = reminderDrafts[itemId] || (item ? suggestedReminderForInboxItem(item) : "");
      if (!reminderAt) {
        setError(t("reminderRequired"));
        return;
      }
      try {
        setError(null);
        await window.nerve.promoteInboxItem(itemId, { reminderAt: fromDateTimeLocal(reminderAt) ?? "" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item.");
      }
      return;
    }
    try {
      await (window.nerve as any).updateInboxItem(itemId, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  const urgencyColor: Record<ActionItemUrgency, string> = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#6b7280"
  };

  return (
    <section className="settings-layout">
      <div className="page-title compact">
        <span className="eyebrow">Gmail</span>
        <h2>{t("inboxTitle")}</h2>
      </div>

      {!googleClientId ? (
        <div style={{ padding: "1.5rem", background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: "1rem" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.8 }}>{t("inboxSetupHint")}</p>
          <button onClick={() => window.nerve.openMain("/settings")}>
            <Settings size={16} /> {t("settings")}
          </button>
        </div>
      ) : !isConnected ? (
        <div style={{ padding: "1.5rem", background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: "1rem" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.8 }}>{t("inboxNotConnected")}</p>
          {gmailConnector?.error && (
            <p style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: "0.75rem" }}>{gmailConnector.error}</p>
          )}
          <button className="primary" disabled={busy} onClick={handleConnect}>
            <Monitor size={16} /> {t("inboxConnect")}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", padding: "0.75rem 1rem", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
            <span style={{ fontSize: "0.75rem", background: "rgba(34,197,94,0.15)", color: "#22c55e", padding: "2px 8px", borderRadius: 12, fontWeight: 600 }}>
              {t("inboxConnected")}
            </span>
            {gmailConnector.email && (
              <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>{gmailConnector.email}</span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
              <button disabled={busy} onClick={handleFetch}>
                <RefreshCw size={15} /> {busy ? t("inboxFetching") : t("inboxFetch")}
              </button>
              <button disabled={busy} onClick={handleDisconnect}>
                {t("inboxDisconnect")}
              </button>
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <EmptyState icon={<Monitor size={18} />} title={t("inboxEmpty")} body="" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {visibleItems.map((item) => (
                <article key={item.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                    <strong style={{ flex: 1, fontSize: "0.9rem" }}>{item.title}</strong>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: `${urgencyColor[item.urgency]}22`, color: urgencyColor[item.urgency], flexShrink: 0 }}>
                      {item.urgency}
                    </span>
                  </div>
                  {item.description && (
                    <p style={{ fontSize: "0.8rem", opacity: 0.7, margin: 0 }}>{item.description}</p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    {item.suggestedTaskType && (
                      <span style={{ fontSize: "0.7rem", padding: "2px 7px", borderRadius: 10, background: "rgba(255,255,255,0.08)", opacity: 0.8 }}>
                        {item.suggestedTaskType}
                      </span>
                    )}
                    {item.dueHint && (
                      <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                        <CalendarClock size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
                        {item.dueHint}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                    {item.status !== "promoted" && (
                      <label className="inbox-reminder-field">
                        {t("noteReminder")}
                        <input
                          type="datetime-local"
                          value={reminderDrafts[item.id] ?? suggestedReminderForInboxItem(item)}
                          onChange={(event) => setReminderDrafts({ ...reminderDrafts, [item.id]: event.currentTarget.value })}
                          title={t("inboxReminderHint")}
                        />
                        <span>{t("suggestedReminder")}</span>
                      </label>
                    )}
                    <button className="primary" disabled={item.status === "promoted"} style={{ fontSize: "0.8rem", padding: "4px 12px" }} title={!hasActivePlan ? t("inboxNoActivePlan") : undefined} onClick={() => handleUpdateItem(item.id, "promoted")}>
                      {item.status === "promoted" ? <Check size={13} /> : <Plus size={13} />}
                      {item.status === "promoted" ? t("inboxAdded") : t("inboxPromote")}
                    </button>
                    {item.status !== "promoted" && <button style={{ fontSize: "0.8rem", padding: "4px 12px" }} onClick={() => handleUpdateItem(item.id, "dismissed")}>
                      {t("inboxDismiss")}
                    </button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="error-note" style={{ marginTop: "1rem" }}>{error}</p>}
    </section>
  );
}

function SettingsScreen({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const [settings, setSettings] = useState(snapshot.settings);
  const t = useCopy(settings.language);
  useEffect(() => setSettings(snapshot.settings), [snapshot.settings]);
  async function save(patch: Partial<NerveSettings>) {
    const refreshed = await window.nerve.updateSettings(patch);
    setSettings(refreshed.settings);
    setSnapshot(refreshed);
  }
  return (
    <section className="settings-layout">
      <div className="page-title compact">
        <span className="eyebrow">Control</span>
        <h2>{t("settings")}</h2>
      </div>
      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-section-head">
            <ShieldCheck size={17} />
            <h3>Session behavior</h3>
          </div>
          <div className="settings-grid">
            <Select label={t("language")} value={settings.language} onChange={(value) => save({ language: value as NerveSettings["language"] })} options={["en", "zh"]} labels={{ en: t("english"), zh: t("mandarin") }} />
            <Select label={t("detectionInterval")} value={settings.screenshotIntervalSeconds} onChange={(value) => save({ screenshotIntervalSeconds: Number(value) as NerveSettings["screenshotIntervalSeconds"] })} options={[10, 30, 60]} suffix="seconds" />
            <Select label={t("stuckThreshold")} value={settings.stuckThresholdMinutes} onChange={(value) => save({ stuckThresholdMinutes: Number(value) as NerveSettings["stuckThresholdMinutes"] })} options={[5, 8, 10]} suffix="minutes" />
            <Select label={t("driftThreshold")} value={settings.driftThresholdMinutes} onChange={(value) => save({ driftThresholdMinutes: Number(value) as NerveSettings["driftThresholdMinutes"] })} options={[3, 6, 10]} suffix="minutes" />
            <Select label={t("thinkingPause")} value={settings.thinkingPauseMinutes} onChange={(value) => save({ thinkingPauseMinutes: Number(value) as NerveSettings["thinkingPauseMinutes"] })} options={[3, 5, 10]} suffix="minutes" />
            <Select label={t("panelOpacity")} value={settings.panelOpacity} onChange={(value) => save({ panelOpacity: Number(value) as NerveSettings["panelOpacity"] })} options={[0.5]} suffix="" />
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Clock size={17} />
            <h3>{t("breakReminders")}</h3>
          </div>
          <label className="switch-row">
            <span>{t("breakReminders")}</span>
            <input
              type="checkbox"
              checked={settings.breakRemindersEnabled}
              onChange={(event) => save({ breakRemindersEnabled: event.target.checked })}
            />
          </label>
          <div className="settings-grid">
            <Select label={t("breakReminderEvery")} value={settings.breakIntervalMinutes} onChange={(value) => save({ breakIntervalMinutes: Number(value) as NerveSettings["breakIntervalMinutes"] })} options={[15, 25, 30, 45, 60, 90]} suffix="minutes" />
            <Select label={t("breakDuration")} value={settings.breakDurationMinutes} onChange={(value) => save({ breakDurationMinutes: Number(value) as NerveSettings["breakDurationMinutes"] })} options={[5, 10, 15, 20, 30]} suffix="minutes" />
          </div>
          {snapshot.breakReminderAt && <p className="subtle">{t("nextBreak")} {new Date(snapshot.breakReminderAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <KeyRound size={17} />
            <h3>Provider</h3>
          </div>
          <div className="settings-grid">
            <label>
              {t("aiProvider")}
              <input value="DeepSeek" readOnly />
            </label>
            <label>
              {t("deepseekModel")}
              <input value={settings.deepseekModel} onChange={(event) => setSettings({ ...settings, deepseekModel: event.target.value })} onBlur={() => save({ deepseekModel: settings.deepseekModel })} />
            </label>
            <label className="wide-field">
              {t("deepseekKey")}
              <input type="password" value={settings.deepseekApiKey} onChange={(event) => setSettings({ ...settings, deepseekApiKey: event.target.value })} onBlur={() => save({ deepseekApiKey: settings.deepseekApiKey })} />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Monitor size={17} />
            <h3>{t("connectors")}</h3>
          </div>
          <div className="settings-grid">
            <label className="wide-field">
              {t("googleClientId")}
              <input
                type="text"
                value={(settings as any).googleClientId ?? ""}
                onChange={(event) => setSettings({ ...settings, googleClientId: event.target.value } as any)}
                placeholder="1234567890-abc...apps.googleusercontent.com"
              />
              <span className="subtle" style={{ fontSize: "0.75rem", marginTop: 4, display: "block" }}>{t("googleClientIdHint")}</span>
            </label>
            <label className="wide-field">
              {t("googleClientSecret")}
              <input
                type="password"
                value={(settings as any).googleClientSecret ?? ""}
                onChange={(event) => setSettings({ ...settings, googleClientSecret: event.target.value } as any)}
                onBlur={() => save({ googleClientSecret: (settings as any).googleClientSecret } as any)}
                placeholder="GOCSPX-..."
              />
              <span className="subtle" style={{ fontSize: "0.75rem", marginTop: 4, display: "block" }}>{t("googleClientSecretHint")}</span>
            </label>
            <div className="wide-field">
              <button
                onClick={() => save({
                  googleClientId: (settings as any).googleClientId,
                  googleClientSecret: (settings as any).googleClientSecret
                } as any)}
                style={{ width: "fit-content" }}
              >
                <KeyRound size={15} /> {t("saveGoogleOAuth")}
              </button>
            </div>
          </div>
          {(() => {
            const connectors = (snapshot as any).connectors as ConnectorStatus[] ?? [];
            const gmail = connectors.find((c) => c.name === "gmail");
            return (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem", padding: "0.5rem 0" }}>
                <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>Gmail</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                  background: gmail?.connected ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                  color: gmail?.connected ? "#22c55e" : undefined }}>
                  {gmail?.connected ? t("inboxConnected") : t("inboxNotConnected")}
                </span>
                {gmail?.connected && gmail.email && (
                  <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>{gmail.email}</span>
                )}
              </div>
            );
          })()}
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Eye size={17} />
            <h3>{t("bannedSites")}</h3>
          </div>
          <label className="switch-row">
            <span>{t("bannedSitesEnabled")}</span>
            <input
              type="checkbox"
              checked={settings.bannedSitesEnabled}
              onChange={(event) => save({ bannedSitesEnabled: event.target.checked })}
            />
          </label>
          <label className="switch-row">
            <span>{t("soundEnabled")}</span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(event) => save({ soundEnabled: event.target.checked })}
            />
          </label>
          <label className="wide-field">
            {t("bannedSites")}
            <textarea
              value={settings.bannedSites.join("\n")}
              onChange={(event) => setSettings({ ...settings, bannedSites: event.target.value.split(/\r?\n/) })}
              onBlur={() => save({ bannedSites: settings.bannedSites })}
              placeholder={"youtube.com\ntiktok.com\ninstagram.com"}
            />
          </label>
          <p className="subtle">{t("bannedSitesHelp")}</p>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Database size={17} />
            <h3>Local data</h3>
          </div>
          <label className="switch-row">
            <span>{t("storeScreenshots")}</span>
            <input type="checkbox" checked={settings.storeScreenshots} onChange={(event) => save({ storeScreenshots: event.target.checked })} />
          </label>
        </section>
      </div>
      <p className="notice">{t("privacyNotice")}</p>
      <div className="button-row">
        <button onClick={() => window.nerve.openScreenshotFolder()}>
          <FolderOpen size={16} /> {t("openScreenshotFolder")}
        </button>
        <button className="danger" onClick={async () => { await window.nerve.deleteAllData(); setSnapshot(await window.nerve.getSnapshot()); }}>
          <Trash2 size={16} /> {t("deleteData")}
        </button>
      </div>
      <p className="subtle">{snapshot.screenshotFolder}</p>
    </section>
  );
}

function Select({
  label,
  value,
  options,
  suffix,
  onChange,
  labels
}: {
  label: string;
  value: string | number;
  options: Array<string | number>;
  suffix?: string;
  onChange: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <label>
      {label}
      <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={String(option)} key={String(option)}>
            {labels?.[String(option)] ?? option}
            {suffix ? ` ${suffix}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "monospace" }}>
          <strong>Something went wrong.</strong>
          <pre style={{ marginTop: "1rem", fontSize: "0.8rem", opacity: 0.7 }}>{this.state.error.message}</pre>
          <button style={{ marginTop: "1rem" }} onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
