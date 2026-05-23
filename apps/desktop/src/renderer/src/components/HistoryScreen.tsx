import { useEffect, useState } from "react";
import { ChevronLeft, Clock, RefreshCw } from "lucide-react";
import type { SessionLogData, SessionSummaryRecord } from "@nerve/shared";
import { EmptyState } from "./EmptyState";
import { LogSummary, LogTimeline } from "./LogScreen";
import { formatDuration } from "../lib/utils";

export function SessionHistory() {
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
