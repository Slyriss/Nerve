import React from "react";
import { Check, Clock, Pause, Play, RefreshCw } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { useNow } from "../lib/hooks";
import { timeLeft, hasPastDeadline, isPast, completionStats, nextScheduledLabel } from "../lib/utils";

export function StepCard({
  snapshot,
  setSnapshot,
  compact = false,
  voiceSlot
}: {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  compact?: boolean;
  voiceSlot?: React.ReactNode;
}) {
  const step = snapshot.activeStep;
  const latestObservation = snapshot.observations[0];
  const observation =
    step && latestObservation?.stepId === step.id
      ? latestObservation
      : undefined;
  const thinking = snapshot.thinkingPauseUntil && Date.parse(snapshot.thinkingPauseUntil) > Date.now();
  const delayActive = Boolean(snapshot.delayUntil && Date.parse(snapshot.delayUntil) > Date.now());
  const breakActive = snapshot.breakEndsAt && Date.parse(snapshot.breakEndsAt) > Date.now();
  const voiceGuidance = step && snapshot.voiceGuidance && (!snapshot.voiceGuidance.stepId || snapshot.voiceGuidance.stepId === step.id)
    ? snapshot.voiceGuidance
    : null;
  const t = useCopy(snapshot.settings.language);
  const paused = snapshot.session?.status === "paused";
  const { completed, percent, total } = completionStats(snapshot.steps);
  useNow(snapshot.thinkingPauseUntil || snapshot.breakEndsAt || snapshot.delayUntil ? 1000 : 30_000);
  async function action(type: "done" | "thinking" | "delay" | "markDone" | "keepWorking" | "endBreak" | "repeatRoutine") {
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
        {step.dueAt && <span className={isPast(step.dueAt) ? "past-due-chip" : ""}>Due {new Date(step.dueAt).toLocaleString()}</span>}
        {step.routineIntervalMinutes && <span>{t("routineEvery")} {step.routineIntervalMinutes} min</span>}
        {step.routineNextAt && <span className={isPast(step.routineNextAt) ? "past-due-chip" : ""}>{t("routineNext")} {new Date(step.routineNextAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        {step.delayCount > 0 && <span>{step.delayCount} delays</span>}
      </div>
      {voiceSlot}
      <p className="action-text">{voiceGuidance?.suggestedNextAction || observation?.suggestedNextAction || step.nextAction}</p>
      <p className="muted">
        {voiceGuidance
          ? voiceGuidance.response
          : thinking
          ? t("thinkingHold")
          : observation?.conciseExplanation || step.explanation || t("nextPhysical")}
      </p>
      {voiceGuidance && <p className="voice-guidance-note">Voice coach updated this from your last question.</p>}
      {observation?.suggestedStepComplete && (
        <div className="completion-prompt">
          <span>{t("completePrompt")}</span>
          <button onClick={() => action("markDone")}>{t("markDone")}</button>
          <button onClick={() => action("keepWorking")}>{t("keepWorking")}</button>
        </div>
      )}
      <div className={compact ? "button-grid" : "button-row"}>
        <button onClick={() => action("thinking")}>
          {thinking ? <Play size={16} /> : <Pause size={16} />} {thinking ? t("cancelThinking") : t("thinking")}
        </button>
        <button onClick={() => action("delay")}>
          <Clock size={16} /> {delayActive ? `Cancel (${timeLeft(snapshot.delayUntil)})` : t("delay")}
        </button>
        <button className="primary" style={compact ? { gridColumn: "1 / -1" } : undefined} onClick={() => action("done")}>
          <Check size={16} /> {t("done")}
        </button>
        {step.routineIntervalMinutes && (
          <button onClick={() => action("repeatRoutine")} title={t("repeatRoutine")}>
            <RefreshCw size={16} /> {t("repeatRoutine")}
          </button>
        )}
        {!compact && (
          <button onClick={async () => setSnapshot(await window.nerve.pauseSession())}>
            <Pause size={16} /> {t("pauseSession")}
          </button>
        )}
      </div>
    </section>
  );
}
