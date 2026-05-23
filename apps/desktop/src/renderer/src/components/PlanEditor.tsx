import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { AppSnapshot, StepRecord } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { completionStats, nextScheduledLabel, hasPastDeadline, toDateTimeLocal, fromDateTimeLocal, addMinutesIso } from "../lib/utils";
import { StepCard } from "./StepCard";
import { QuickNotesSection } from "./QuickNotesSection";
import { ReminderPanel } from "./ReminderPanel";
import { BreadcrumbTrail } from "./BreadcrumbTrail";
import { SessionStart } from "./SessionStart";

export function PlanEditor({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
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
