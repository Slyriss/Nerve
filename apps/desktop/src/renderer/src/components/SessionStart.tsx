import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, ListChecks, Plus, Trash2 } from "lucide-react";
import { taskTypes, type AppSnapshot, type NerveSettings, type PlanStepDraft, type TaskType } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { useNow } from "../lib/hooks";
import { hasPastDeadline, isToday, toDateTimeLocal, fromDateTimeLocal, addMinutesIso, syncedRoutinePatch, sortBySchedule } from "../lib/utils";

export function SessionStart({
  setSnapshot,
  settings,
  prefillGoal
}: {
  setSnapshot: (snapshot: AppSnapshot) => void;
  settings: NerveSettings;
  prefillGoal?: string;
}) {
  const [goal, setGoal] = useState(prefillGoal ?? "");
  const [lockInMode, setLockInMode] = useState(false);
  useEffect(() => {
    if (prefillGoal) setGoal(prefillGoal);
  }, [prefillGoal]);
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
          parsedSteps: parsedSteps.length ? parsedSteps : undefined,
          lockInMode
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
        <label className="toggle-label">
          <input type="checkbox" checked={lockInMode} onChange={(event) => setLockInMode(event.target.checked)} />
          {t("lockInMode")} — {t("lockInModeHint")}
        </label>
        {parsedSteps.length > 0 && (() => {
          const todaySteps = parsedSteps.filter((s) => s.dueAt && isToday(s.dueAt));
          const allFuture = parsedSteps.every((s) => !s.dueAt || Date.parse(s.dueAt) > Date.now() + 7 * 86400_000);
          return (
            <>
              {todaySteps.length > 1 && (
                <p className="subtle"><AlertTriangle size={13} /> {todaySteps.length} {t("tasksDueToday")}</p>
              )}
              {allFuture && (
                <p className="subtle"><Clock size={13} /> {t("nothingUrgent")}</p>
              )}
            </>
          );
        })()}
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
