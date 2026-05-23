import { useEffect, useRef, useState, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
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
import "./styles.css";

type View = "start" | "plan" | "log" | "history" | "settings";
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
  | "smaller"
  | "thinkingHold"
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
  | "replanning";

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
    smaller: "Make smaller",
    thinkingHold: "Got it. I’ll hold this step while you think.",
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
    replanning: "Regenerating plan…"
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
    smaller: "再小一步",
    thinkingHold: "收到。我会先帮你保留这一步。",
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
    replanning: "正在重新生成计划…"
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

type Schedulable = { reminderAt?: string | null; dueAt?: string | null };

function scheduleTime(step: Schedulable) {
  const reminder = step.reminderAt ? Date.parse(step.reminderAt) : Number.POSITIVE_INFINITY;
  const due = step.dueAt ? Date.parse(step.dueAt) : Number.POSITIVE_INFINITY;
  return Math.min(Number.isFinite(reminder) ? reminder : Number.POSITIVE_INFINITY, Number.isFinite(due) ? due : Number.POSITIVE_INFINITY);
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
  const next = sortBySchedule(steps).find((step) => scheduleTime(step) >= now);
  if (!next) return "No deadline";
  return new Date(scheduleTime(next)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    return route === "plan" || route === "log" || route === "history" || route === "settings" ? route : "start";
  });
  const isOverlay = location.hash.startsWith("#/overlay");
  const isBlocker = location.hash.startsWith("#/blocker");

  if (!snapshot) return <div className="loading">Nerve</div>;
  if (isBlocker) return <BlockerScreen snapshot={snapshot} />;
  if (isOverlay) return <Overlay snapshot={snapshot} setSnapshot={setSnapshot} />;
  const t = useCopy(snapshot.settings.language);

  const sessionOpen = snapshot.session?.status === "active" || snapshot.session?.status === "paused";
  const showHandoff = sessionOpen && view === "start";

  // Reset to start screen when a session closes so stale plan/log data doesn't persist
  useEffect(() => {
    if (!sessionOpen && (view === "plan" || view === "log")) {
      setView("start");
    }
  }, [sessionOpen]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark">N</div>
          <div>
            <h1>Nerve</h1>
            <p>{t("privateCopilot")}</p>
          </div>
        </div>
        <nav className="tabs">
          <button className={view === "start" ? "active" : ""} onClick={() => setView("start")}>
            <FileText size={16} /> {t("session")}
          </button>
          {sessionOpen && (
            <>
              <button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>
                <ListChecks size={16} /> {t("viewPlan")}
              </button>
              <button className={view === "log" ? "active" : ""} onClick={() => setView("log")}>
                <Eye size={16} /> {t("viewLog")}
              </button>
            </>
          )}
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            <Clock size={16} /> {t("history")}
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <Settings size={16} /> {t("settings")}
          </button>
        </nav>
      </header>

      {sessionOpen && <SessionCommandBar snapshot={snapshot} />}
      {showHandoff && <ActiveSessionHandoff snapshot={snapshot} setSnapshot={setSnapshot} setView={setView} />}
      {!showHandoff && view === "start" && <SessionStart setSnapshot={setSnapshot} settings={snapshot.settings} />}
      {!showHandoff && view === "plan" && <PlanEditor snapshot={snapshot} setSnapshot={setSnapshot} />}
      {!showHandoff && view === "log" && <SessionLog snapshot={snapshot} />}
      {!showHandoff && view === "history" && <SessionHistory />}
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
          <button className="primary" disabled={!goal.trim() || busy} onClick={start}>
            <Check size={16} /> {t("startSession")}
          </button>
        </div>
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
                      reminderAt: null
                    }
                  ])
                }
              >
                <Plus size={16} /> Add activity
              </button>
            </div>
            {parsedSteps.map((step, index) => (
              <article className="timetable-row" key={`${step.title}-${index}`}>
                <div className="time-cell">
                  <span>{index + 1}</span>
                  <label className="time-field">
                    Remind
                    <input
                      type="datetime-local"
                      value={toDateTimeLocal(step.reminderAt)}
                      onChange={(event) => patchParsedStep(index, { reminderAt: fromDateTimeLocal(event.currentTarget.value) })}
                    />
                  </label>
                  <label className="time-field">
                    Due
                    <input
                      type="datetime-local"
                      value={toDateTimeLocal(step.dueAt)}
                      onChange={(event) => patchParsedStep(index, { dueAt: fromDateTimeLocal(event.currentTarget.value) })}
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
                  <button
                    title="Remove"
                    onClick={() => setParsedSteps((steps) => steps.filter((_step, stepIndex) => stepIndex !== index))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
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
  useNow(snapshot.delayUntil || snapshot.thinkingPauseUntil ? 1000 : 30_000);
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
                {snapshot.delayUntil && (
                  <div className="timer">
                    <Clock size={15} /> {timeLeft(snapshot.delayUntil)}
                  </div>
                )}
                {snapshot.thinkingPauseUntil && Date.parse(snapshot.thinkingPauseUntil) > Date.now() && (
                  <div className="timer quiet">
                    <Pause size={15} /> {t("stateThinking")} {timeLeft(snapshot.thinkingPauseUntil)}
                  </div>
                )}
              </>
            ) : (
              <SideTimetable snapshot={snapshot} />
            )}
          </div>
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
  const steps = sortBySchedule(snapshot.steps);
  return (
    <section className="side-timetable">
      {steps.map((step) => {
        const due = step.dueAt ? Date.parse(step.dueAt) : null;
        const isPastDue = Boolean(due && due < now && step.status !== "complete");
        return (
          <article className={`${step.status} ${step.id === activeId ? "current" : ""} ${isPastDue ? "past-due" : ""}`} key={step.id}>
            <div className="side-time">
              <span>Remind</span>
              <strong>{timeLabel(step.reminderAt)}</strong>
              <span>Due {timeLabel(step.dueAt)}</span>
            </div>
            <div className="side-activity">
              <span>{step.taskType}</span>
              <strong>{step.title}</strong>
              <p>{step.id === activeId ? "Current step" : step.status}</p>
            </div>
          </article>
        );
      })}
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
  const observation = snapshot.observations[0];
  const thinking = snapshot.thinkingPauseUntil && Date.parse(snapshot.thinkingPauseUntil) > Date.now();
  const t = useCopy(snapshot.settings.language);
  const paused = snapshot.session?.status === "paused";
  const { completed, percent, total } = completionStats(snapshot.steps);
  async function action(type: "done" | "thinking" | "delay" | "atomize" | "markDone" | "keepWorking") {
    setSnapshot(await window.nerve.action(type));
  }
  if (!snapshot.session) {
    return <div className="step-card"><p>{t("noSession")}</p></div>;
  }
  if (snapshot.session.status === "completed" || !step) {
    return <div className="step-card"><h2>{t("sessionComplete")}</h2><p className="muted">{t("sessionComplete")}</p></div>;
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
    <section className={`step-card ${compact ? "compact" : ""}`}>
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
        {step.dueAt && <span>Due {new Date(step.dueAt).toLocaleString()}</span>}
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
          <Pause size={16} /> {t("thinking")}
        </button>
        <button onClick={() => action("delay")}>
          <Clock size={16} /> {t("delay")}
        </button>
        <button onClick={() => action("atomize")}>
          <ChevronLeft size={16} /> {t("smaller")}
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
          <article className={`plan-step ${step.status}`} key={step.id}>
            <div className="step-index">{step.orderIndex + 1}</div>
            <div className="step-fields">
              <input defaultValue={step.title} onBlur={(event) => patch(step, { title: event.currentTarget.value })} />
              <textarea defaultValue={step.nextAction} onBlur={(event) => patch(step, { nextAction: event.currentTarget.value })} />
              <div className="deadline-fields">
                <label>
                  Remind
                  <input type="datetime-local" defaultValue={toDateTimeLocal(step.reminderAt)} onBlur={(event) => patch(step, { reminderAt: fromDateTimeLocal(event.currentTarget.value) })} />
                </label>
                <label>
                  Due
                  <input type="datetime-local" defaultValue={toDateTimeLocal(step.dueAt)} onBlur={(event) => patch(step, { dueAt: fromDateTimeLocal(event.currentTarget.value) })} />
                </label>
              </div>
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
  if (["session_paused", "thinking_clicked"].includes(type)) return "tl-pause";
  if (["step_done", "guidance_done"].includes(type)) return "tl-done";
  if (["banned_site_detected", "deadline_reminder_triggered"].includes(type)) return "tl-warn";
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
    case "step_atomized": return "Step broken into smaller actions";
    case "step_added": return "Step added to plan";
    case "step_deleted": return meta.title ? `Removed: ${meta.title as string}` : "Step removed";
    case "banned_site_detected": return `Flagged: ${meta.rule || "banned site"}`;
    case "step_shown": return "Nudge sent";
    case "thinking_clicked": return "Thinking pause";
    case "delay_expired": return "5-minute delay ended";
    case "replan": return "Plan regenerated";
    case "deadline_reminder_triggered": return `Deadline reminder: ${meta.title || ""}`;
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

function SessionLog({ snapshot }: { snapshot: AppSnapshot }) {
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
        {snapshot.reminders.length > 0 && (
          <section className="reminder-list">
            <h2>Deadline reminders</h2>
            {snapshot.reminders.slice(0, 10).map((reminder) => (
              <article className={reminder.status} key={reminder.id}>
                <strong>{reminder.title}</strong>
                <span>{reminder.status} · remind {new Date(reminder.reminderAt).toLocaleString()}</span>
                {reminder.dueAt && <span>due {new Date(reminder.dueAt).toLocaleString()}</span>}
                <p>{reminder.message}</p>
              </article>
            ))}
          </section>
        )}
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
