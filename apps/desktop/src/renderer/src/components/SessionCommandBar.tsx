import { Activity, CalendarClock, ListChecks } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { completionStats, nextScheduledLabel, stateLabel } from "../lib/utils";

export function SessionCommandBar({ snapshot }: { snapshot: AppSnapshot }) {
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
