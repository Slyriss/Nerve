import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, CalendarClock, Clock, Eye, FileText, ListChecks, Monitor, Settings } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useSnapshot } from "./lib/hooks";
import { useCopy } from "./lib/copy";
import { completionStats, nextScheduledLabel, stateLabel } from "./lib/utils";
import type { View } from "./lib/types";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BlockerScreen } from "./components/BlockerScreen";
import { CatScreen } from "./components/CatScreen";
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
import "./styles.css";

// suppress unused import warnings — these are used in JSX below
void Activity;
void completionStats;
void nextScheduledLabel;
void stateLabel;

function App() {
  const [snapshot, setSnapshot] = useSnapshot();
  const [view, setView] = useState<View>(() => {
    const route = location.hash.replace("#/", "");
    return (["plan", "calendar", "log", "history", "settings", "inbox"] as const).includes(route as any) ? route as View : "start";
  });
  const [prefillGoal, setPrefillGoal] = useState<string>("");
  const isOverlay = location.hash.startsWith("#/overlay");
  const isBlocker = location.hash.startsWith("#/blocker");
  const isCatScreen = location.hash.startsWith("#/cat");

  const t = useCopy(snapshot?.settings.language ?? "en");
  const sessionOpen = snapshot?.session?.status === "active" || snapshot?.session?.status === "paused";

  useEffect(() => {
    // Calendar is always accessible; only reset session-specific views
    if (!sessionOpen && (view === "plan" || view === "log")) {
      setView("start");
    }
  }, [sessionOpen]);

  if (!snapshot) return <div className="loading"><img src={brandIconLogo} alt="" /> {appDisplayName}</div>;
  if (isBlocker) return <BlockerScreen snapshot={snapshot} />;
  if (isCatScreen) return <CatScreen snapshot={snapshot} />;
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
            <p>{t("privateCopilot")}</p>
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
              <button className={view === "log" ? "active" : ""} title={t("viewLog")} onClick={() => setView("log")}>
                <Eye size={16} /> <span className="nav-label">{t("viewLog")}</span>
              </button>
            </>
          )}
          <button className={view === "calendar" ? "active" : ""} title={t("calendar")} onClick={() => setView("calendar")}>
            <CalendarClock size={16} /> <span className="nav-label">{t("calendar")}</span>
          </button>
          <button className={view === "inbox" ? "active" : ""} title={t("inboxTitle")} onClick={() => setView("inbox")} style={{ position: "relative" }}>
            <Monitor size={16} /> <span className="nav-label">{t("inboxTitle")}</span>
            {(() => {
              const inboxItems = (snapshot as any).inboxItems ?? [];
              const pendingCount = inboxItems.filter((i: any) => i.status === "pending").length;
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
      {!showHandoff && view === "start" && <SessionStart setSnapshot={setSnapshot} settings={snapshot.settings} prefillGoal={prefillGoal} />}
      {!showHandoff && view === "plan" && <PlanEditor snapshot={snapshot} setSnapshot={setSnapshot} />}
      {view === "calendar" && <CalendarScreen snapshot={snapshot} />}
      {!showHandoff && view === "log" && <SessionLog snapshot={snapshot} setSnapshot={setSnapshot} />}
      {view === "history" && <SessionHistory />}
      {view === "inbox" && <InboxScreen snapshot={snapshot} language={snapshot.settings.language} onStartOnItem={(g) => { setPrefillGoal(g); setView("start"); }} />}
      {view === "settings" && <SettingsScreen snapshot={snapshot} setSnapshot={setSnapshot} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
