import { useEffect, useState, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  FolderOpen,
  ListChecks,
  Pause,
  Plus,
  Settings,
  Trash2
} from "lucide-react";
import { taskTypes, type AppSnapshot, type NerveSettings, type StepRecord, type TaskType } from "@nerve/shared";
import "./styles.css";

type View = "start" | "plan" | "log" | "settings";
type CopyKey =
  | "privateCopilot"
  | "session"
  | "settings"
  | "runningSideTab"
  | "handoffBody"
  | "keepSidebarSlim"
  | "endSession"
  | "ready"
  | "goal"
  | "taskType"
  | "optionalDeadline"
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
  | "viewLog";

const copy: Record<"en" | "zh", Record<CopyKey, string>> = {
  en: {
    privateCopilot: "Private task co-pilot",
    session: "Session",
    settings: "Settings",
    runningSideTab: "Nerve is running in the side tab.",
    handoffBody: "You can close or ignore this main window. The current step and any gentle prompts will stay in the slim sidebar.",
    keepSidebarSlim: "Keep sidebar slim",
    endSession: "End session",
    ready: "Ready when you are",
    goal: "Goal",
    taskType: "Task type",
    optionalDeadline: "Optional deadline",
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
    privacyNotice: "In DeepSeek mode, AI analysis may send screen/session context to the configured API. Mock mode does not upload screenshots.",
    openScreenshotFolder: "Open screenshot folder",
    deleteData: "Delete all local session data",
    viewPlan: "View plan",
    viewLog: "Session log"
  },
  zh: {
    privateCopilot: "私人任务辅助",
    session: "会话",
    settings: "设置",
    runningSideTab: "Nerve 正在侧边栏运行。",
    handoffBody: "你可以关闭或忽略主窗口。当前步骤和温和提示会留在右侧小栏里。",
    keepSidebarSlim: "保持侧栏收起",
    endSession: "结束会话",
    ready: "准备好时开始",
    goal: "目标",
    taskType: "任务类型",
    optionalDeadline: "可选截止时间",
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
    privacyNotice: "使用 DeepSeek 时，AI 分析可能会把屏幕/会话上下文发送到配置的 API。Mock 模式不会上传截图。",
    openScreenshotFolder: "打开截图文件夹",
    deleteData: "删除所有本地会话数据",
    viewPlan: "查看计划",
    viewLog: "会话日志"
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

function App() {
  const [snapshot, setSnapshot] = useSnapshot();
  const [view, setView] = useState<View>(() => {
    const route = location.hash.replace("#/", "");
    return route === "plan" || route === "log" || route === "settings" ? route : "start";
  });
  const isOverlay = location.hash.startsWith("#/overlay");

  if (!snapshot) return <div className="loading">Nerve</div>;
  if (isOverlay) return <Overlay snapshot={snapshot} setSnapshot={setSnapshot} />;
  const t = useCopy(snapshot.settings.language);

  const sessionActive = snapshot.session?.status === "active";
  const showHandoff = sessionActive && view === "start";

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
          {sessionActive && (
            <>
              <button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>
                <ListChecks size={16} /> {t("viewPlan")}
              </button>
              <button className={view === "log" ? "active" : ""} onClick={() => setView("log")}>
                <Eye size={16} /> {t("viewLog")}
              </button>
            </>
          )}
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <Settings size={16} /> {t("settings")}
          </button>
        </nav>
      </header>

      {showHandoff && <ActiveSessionHandoff snapshot={snapshot} setSnapshot={setSnapshot} setView={setView} />}
      {!showHandoff && view === "start" && <SessionStart setSnapshot={setSnapshot} settings={snapshot.settings} />}
      {!showHandoff && view === "plan" && <PlanEditor snapshot={snapshot} setSnapshot={setSnapshot} />}
      {!showHandoff && view === "log" && <SessionLog snapshot={snapshot} />}
      {view === "settings" && <SettingsScreen snapshot={snapshot} setSnapshot={setSnapshot} />}
    </main>
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
  return (
    <section className="handoff-layout">
      <div className="handoff-panel">
        <div className="mark">N</div>
        <h2>{t("runningSideTab")}</h2>
        <p className="muted">{t("handoffBody")}</p>
        <div className="button-row">
          <button onClick={() => setView("plan")}>
            <ListChecks size={16} /> {t("viewPlan")}
          </button>
          <button onClick={() => setView("log")}>
            <Eye size={16} /> {t("viewLog")}
          </button>
        </div>
        <div className="button-row">
          <button onClick={() => window.nerve.setOverlayExpanded(false)}>{t("keepSidebarSlim")}</button>
          <button className="danger" onClick={async () => setSnapshot(await window.nerve.endSession())}>{t("endSession")}</button>
        </div>
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
  const [deadlineText, setDeadlineText] = useState("");
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<TaskType[]>(["General writing"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useCopy(settings.language);
  async function start() {
    if (!goal.trim()) return;
    setBusy(true);
    setError("");
    try {
      setSnapshot(await window.nerve.startSession({ goal: goal.trim(), deadlineText: deadlineText.trim(), taskTypes: selectedTaskTypes }));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "The session could not start.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="start-layout">
      <div className="start-panel">
        <h2>{t("ready")}</h2>
        <label>
          {t("goal")}
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Draft the intro, fix the failing test, process the form, study chapter 4..."
          />
        </label>
        <label>
          {t("taskType")}
          <div className="scope-grid">
            {taskTypes.filter((type) => type !== "Mixed work").map((type) => (
              <label className="scope-chip" key={type}>
                <input
                  type="checkbox"
                  checked={selectedTaskTypes.includes(type)}
                  onChange={(event) => {
                    setSelectedTaskTypes((current) => {
                      const next = event.target.checked ? [...current, type] : current.filter((item) => item !== type);
                      return next.length ? next : [type];
                    });
                  }}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </label>
        <label>
          {t("optionalDeadline")}
          <input value={deadlineText} onChange={(event) => setDeadlineText(event.target.value)} placeholder="4pm today" />
        </label>
        <div className="fixed-row">
          <span>{t("mode")}</span>
          <strong>{selectedTaskTypes.length > 1 ? "Mixed work" : selectedTaskTypes[0]}</strong>
        </div>
        <p className="notice">{t("screenshotNotice")}</p>
        {error && <p className="error-note">{error}</p>}
        <div className="button-row">
          <button className="primary" disabled={!goal.trim() || busy} onClick={start}>
            <Check size={16} /> {t("startSession")}
          </button>
          <button onClick={() => window.nerve.openMain("/settings")}>
            <Settings size={16} /> {t("settings")}
          </button>
        </div>
        <p className="subtle">{t("currentProvider")}: DeepSeek</p>
      </div>
    </section>
  );
}

function Overlay({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const expanded = snapshot.overlayExpanded;
  const opacity = snapshot.settings.panelOpacity;
  const completed = snapshot.steps.filter((step) => step.status === "complete").length;
  const total = snapshot.steps.length || 1;
  const t = useCopy(snapshot.settings.language);
  const latestState = snapshot.observations[0]?.userState;
  useNow(snapshot.delayUntil || snapshot.thinkingPauseUntil ? 1000 : 30_000);
  return (
    <div className={`overlay ${expanded ? "expanded" : "slim"}`} style={{ opacity }}>
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
            <span className={`state-pill ${latestState || "unknown"}`}>{stateLabel(latestState, t)}</span>
            <button title="Collapse" onClick={() => window.nerve.setOverlayExpanded(false)}>
              <ChevronRight size={18} />
            </button>
          </div>
          <StepCard snapshot={snapshot} setSnapshot={setSnapshot} compact />
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
          <BreadcrumbTrail compact breadcrumbs={snapshot.breadcrumbs.slice(0, 4).reverse()} />
          <div className="overlay-links">
            <button onClick={() => window.nerve.openMain("/plan")}>{t("viewPlan")}</button>
            <button onClick={() => window.nerve.openMain("/log")}>{t("viewLog")}</button>
            <button onClick={() => window.nerve.openMain("/settings")}>{t("settings")}</button>
          </div>
        </div>
      )}
    </div>
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
  async function action(type: "done" | "thinking" | "delay" | "atomize" | "markDone" | "keepWorking") {
    setSnapshot(await window.nerve.action(type));
  }
  if (!snapshot.session) {
    return <div className="step-card"><p>{t("noSession")}</p></div>;
  }
  if (snapshot.session.status === "completed" || !step) {
    return <div className="step-card"><h2>{t("sessionComplete")}</h2><p className="muted">{t("sessionComplete")}</p></div>;
  }
  return (
    <section className="step-card">
      <p className="eyebrow">{t("currentStep")}</p>
      <span className="task-badge">{step.taskType}</span>
      <h2>{step.title}</h2>
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
      </div>
    </section>
  );
}

function PlanEditor({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const session = snapshot.session;
  async function patch(step: StepRecord, patchValue: Partial<StepRecord>) {
    setSnapshot(await window.nerve.updateStep(step.id, patchValue));
  }
  if (!session) return <SessionStart setSnapshot={setSnapshot} settings={snapshot.settings} />;
  return (
    <section className="content-grid">
      <div>
        <StepCard snapshot={snapshot} setSnapshot={setSnapshot} />
        <BreadcrumbTrail breadcrumbs={snapshot.breadcrumbs.slice(0, 8).reverse()} />
      </div>
      <div className="plan-list">
        <div className="section-head">
          <h2>Editable plan</h2>
          <button onClick={async () => setSnapshot(await window.nerve.addStep(session.id))}>
            <Plus size={16} /> Add step
          </button>
        </div>
        {snapshot.steps.map((step) => (
          <article className={`plan-step ${step.status}`} key={step.id}>
            <div className="step-index">{step.orderIndex + 1}</div>
            <div className="step-fields">
              <input defaultValue={step.title} onBlur={(event) => patch(step, { title: event.currentTarget.value })} />
              <textarea defaultValue={step.nextAction} onBlur={(event) => patch(step, { nextAction: event.currentTarget.value })} />
              <input defaultValue={step.explanation} onBlur={(event) => patch(step, { explanation: event.currentTarget.value })} />
              <select value={step.taskType} onChange={(event) => patch(step, { taskType: event.currentTarget.value as TaskType })}>
                {taskTypes.filter((type) => type !== "Mixed work").map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <span>{step.status}</span>
            </div>
            <div className="step-controls">
              <button title="Move up" onClick={async () => setSnapshot(await window.nerve.reorderStep(step.id, "up"))}>↑</button>
              <button title="Move down" onClick={async () => setSnapshot(await window.nerve.reorderStep(step.id, "down"))}>↓</button>
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

function SessionLog({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <section className="log-layout">
      <div className="events">
        <h2>Session log</h2>
        {snapshot.taskHistory.length > 0 && (
          <div className="task-history">
            <h3>Task history</h3>
            {snapshot.taskHistory.slice(0, 12).map((entry) => (
              <article key={entry.id}>
                <strong>{entry.taskType}</strong>
                <span>{entry.source.replaceAll("_", " ")} · {entry.confidence}</span>
                <p>{entry.summary}</p>
              </article>
            ))}
          </div>
        )}
        {snapshot.events.map((event) => (
          <article className="event-row" key={event.id}>
            <time>{new Date(event.createdAt).toLocaleTimeString()}</time>
            <div>
              <strong>{event.type.replaceAll("_", " ")}</strong>
              <p>{event.message}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="gallery">
        <h2>Screenshot gallery</h2>
        <div className="thumb-grid">
          {snapshot.screenshots.map((shot) => (
            <figure key={shot.id}>
              {shot.thumbnailPath && <img src={fileSrc(shot.thumbnailPath)} alt="" />}
              <figcaption>
                <strong>{new Date(shot.capturedAt).toLocaleTimeString()}</strong>
                <span>{shot.activeApp}</span>
                <span>{shot.windowTitle}</span>
                <span>{shot.aiState || "unknown"}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
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
      <h2>{t("settings")}</h2>
      <div className="settings-grid">
        <Select label={t("language")} value={settings.language} onChange={(value) => save({ language: value as NerveSettings["language"] })} options={["en", "zh"]} labels={{ en: t("english"), zh: t("mandarin") }} />
        <label>
          {t("aiProvider")}
          <input value="DeepSeek" readOnly />
        </label>
        <label>
          {t("deepseekKey")}
          <input type="password" value={settings.deepseekApiKey} onChange={(event) => setSettings({ ...settings, deepseekApiKey: event.target.value })} onBlur={() => save({ deepseekApiKey: settings.deepseekApiKey })} />
        </label>
        <label>
          {t("deepseekModel")}
          <input value={settings.deepseekModel} onChange={(event) => setSettings({ ...settings, deepseekModel: event.target.value })} onBlur={() => save({ deepseekModel: settings.deepseekModel })} />
        </label>
        <Select label={t("detectionInterval")} value={settings.screenshotIntervalSeconds} onChange={(value) => save({ screenshotIntervalSeconds: Number(value) as NerveSettings["screenshotIntervalSeconds"] })} options={[60]} suffix="seconds" />
        <Select label={t("panelOpacity")} value={settings.panelOpacity} onChange={(value) => save({ panelOpacity: Number(value) as NerveSettings["panelOpacity"] })} options={[0.5]} suffix="" />
        <Select label={t("stuckThreshold")} value={settings.stuckThresholdMinutes} onChange={(value) => save({ stuckThresholdMinutes: Number(value) as NerveSettings["stuckThresholdMinutes"] })} options={[5, 8, 10]} suffix="minutes" />
        <Select label={t("driftThreshold")} value={settings.driftThresholdMinutes} onChange={(value) => save({ driftThresholdMinutes: Number(value) as NerveSettings["driftThresholdMinutes"] })} options={[3, 6, 10]} suffix="minutes" />
        <Select label={t("thinkingPause")} value={settings.thinkingPauseMinutes} onChange={(value) => save({ thinkingPauseMinutes: Number(value) as NerveSettings["thinkingPauseMinutes"] })} options={[3, 5, 10]} suffix="minutes" />
        <label className="switch-row">
          <span>{t("storeScreenshots")}</span>
          <input type="checkbox" checked={settings.storeScreenshots} onChange={(event) => save({ storeScreenshots: event.target.checked })} />
        </label>
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
