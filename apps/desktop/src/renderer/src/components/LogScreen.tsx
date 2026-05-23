import { Activity, AlertTriangle, CalendarClock, Camera, Check, Clock, Monitor, Zap } from "lucide-react";
import type { AppSnapshot, BreadcrumbRecord, EventRecord, SessionLogData, StepRecord } from "@nerve/shared";
import { EmptyState } from "./EmptyState";
import { ReminderPanel } from "./ReminderPanel";
import { fileSrc, formatDuration } from "../lib/utils";

// ─── Log helpers ─────────────────────────────────────────────────────────────

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

// ─── LogSummary ──────────────────────────────────────────────────────────────

export function LogSummary({ session, events, breadcrumbs, steps }: SessionLogData) {
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

export function LogTimeline({ events, breadcrumbs, steps }: Pick<SessionLogData, "events" | "breadcrumbs" | "steps">) {
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

export function SessionLog({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
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
