import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, LoaderCircle, ListChecks, Mic, Plus, Trash2 } from "lucide-react";
import { taskTypes, type AppSnapshot, type NerveSettings, type PlanStepDraft, type TaskType } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { useNow } from "../lib/hooks";
import { hasPastDeadline, isToday, toDateTimeLocal, fromDateTimeLocal, addMinutesIso, syncedRoutinePatch, sortBySchedule, parseDeadlineText } from "../lib/utils";

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
  const [lockInMode, setLockInMode] = useState(settings.defaultLockInMode ?? false);
  useEffect(() => {
    if (prefillGoal) setGoal(prefillGoal);
  }, [prefillGoal]);
  const [detectedTaskTypes, setDetectedTaskTypes] = useState<TaskType[]>([]);
  const [parsedSteps, setParsedSteps] = useState<PlanStepDraft[]>([]);
  const [parseBusy, setParseBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dictationState, setDictationState] = useState<"idle" | "listening" | "transcribing">("idle");
  const [error, setError] = useState("");
  const dictationStateRef = useRef(dictationState);
  const goalRecorderRef = useRef<MediaRecorder | null>(null);
  const goalStreamRef = useRef<MediaStream | null>(null);
  const goalChunksRef = useRef<Blob[]>([]);
  const t = useCopy(settings.language);
  useNow(30_000);
  useEffect(() => {
    dictationStateRef.current = dictationState;
  }, [dictationState]);
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
  async function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === "string" ? reader.result : "";
        resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Could not read voice recording."));
      reader.readAsDataURL(blob);
    });
  }
  function cleanupGoalStream() {
    goalStreamRef.current?.getTracks().forEach((track) => track.stop());
    goalStreamRef.current = null;
    goalRecorderRef.current = null;
    goalChunksRef.current = [];
  }
  async function transcribeGoalBlob(blob: Blob) {
    if (blob.size === 0) {
      setError("No audio captured.");
      setDictationState("idle");
      return;
    }
    setDictationState("transcribing");
    try {
      const result = await window.nerve.transcribeVoice(await blobToBase64(blob));
      const text = result.transcription.trim();
      if (text) {
        setGoal((current) => [current.trim(), text].filter(Boolean).join(current.trim() ? "\n" : ""));
        setParsedSteps([]);
        setDetectedTaskTypes([]);
      }
    } catch (dictationError) {
      setError(dictationError instanceof Error ? dictationError.message : "Voice input failed.");
    } finally {
      setDictationState("idle");
    }
  }
  async function startGoalDictation() {
    if (dictationStateRef.current !== "idle") return;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      goalStreamRef.current = stream;
      goalRecorderRef.current = recorder;
      goalChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) goalChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(goalChunksRef.current, { type: mimeType });
        cleanupGoalStream();
        void transcribeGoalBlob(blob);
      };
      recorder.start();
      setDictationState("listening");
    } catch (dictationError) {
      cleanupGoalStream();
      setError(dictationError instanceof Error ? dictationError.message : "Voice input failed.");
      setDictationState("idle");
    }
  }
  function stopGoalDictation() {
    const recorder = goalRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }
  function toggleGoalDictation() {
    if (dictationStateRef.current === "listening") {
      stopGoalDictation();
    } else if (dictationStateRef.current === "idle") {
      void startGoalDictation();
    }
  }
  useEffect(() => {
    const cleanup = window.nerve.onToggleVoice(toggleGoalDictation);
    return () => {
      cleanup();
      if (dictationStateRef.current === "listening") stopGoalDictation();
      cleanupGoalStream();
    };
  }, []);
  return (
    <section className="start-layout">
      <div className="start-panel">
        <div className="page-title">
          <span className="eyebrow">{t("session")}</span>
          <h2>{t("ready")}</h2>
        </div>
        <div className="start-composer">
          <label className="goal-field">
            {t("goal")}
            <textarea
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                setParsedSteps([]);
                setDetectedTaskTypes([]);
              }}
              placeholder="Working on a presentation at 3pm, business report at 5pm..."
            />
            <button
              type="button"
              className={`dictation-button ${dictationState}`}
              disabled={busy || parseBusy || dictationState === "transcribing"}
              title={dictationState === "listening" ? "Stop recording" : "Speak the initial goal"}
              onClick={toggleGoalDictation}
            >
              {dictationState === "transcribing" ? <LoaderCircle size={14} /> : <Mic size={14} />}
              {dictationState === "listening" ? "Press to stop" : dictationState === "transcribing" ? "Transcribing" : "Speak"}
            </button>
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
          {parsedSteps.length > 0 && (
            <button className="primary" disabled={busy || unresolvedPastDeadlineCount > 0} onClick={start}>
              <Check size={16} /> {t("startSession")}
            </button>
          )}
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={lockInMode} onChange={(e) => setLockInMode(e.target.checked)} />
          <span>
            <strong>{t("lockInMode")}</strong>
            <span className="subtle">{t("lockInModeHint")}</span>
          </span>
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
                          reminderAt: dueAt ?? step.reminderAt,
                          ...(step.routineIntervalMinutes && dueAt ? { routineNextAt: addMinutesIso(dueAt, step.routineIntervalMinutes) } : {}),
                          pastDeadlineConfirmed: false
                        });
                      }}
                    />
                  </label>
                  {!!step.routineIntervalMinutes && (
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
                  )}
                </div>
                <div className="activity-fields">
                  <input value={step.title} onChange={(event) => patchParsedStep(index, { title: event.currentTarget.value })} />
                  <input
                    value={step.deadlineText || ""}
                    placeholder="e.g. at 9pm, tomorrow at 10am"
                    onChange={(event) => {
                      const deadlineText = event.currentTarget.value;
                      const { dueAt, reminderAt } = parseDeadlineText(deadlineText);
                      const patch: Partial<typeof step> = { deadlineText, pastDeadlineConfirmed: false };
                      if (!deadlineText.trim()) {
                        patch.dueAt = null;
                        patch.reminderAt = null;
                      } else if (dueAt !== null) {
                        patch.dueAt = dueAt;
                        patch.reminderAt = reminderAt;
                      }
                      patchParsedStep(index, patch);
                    }}
                  />
                  <p className="subtle">The next physical action will appear in the sidebar when this activity is active.</p>
                </div>
                <div className="activity-controls">
                  <select value={step.taskType || detectedTaskTypes[0] || "Personal / life"} onChange={(event) => patchParsedStep(index, { taskType: event.currentTarget.value as TaskType })}>
                    {taskTypes.filter((type) => type !== "Mixed work").map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <label className="checkbox-row" style={{ marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={!!step.routineIntervalMinutes}
                      onChange={(e) => patchParsedStep(index, {
                        ...syncedRoutinePatch(step, e.target.checked ? 30 : null),
                        pastDeadlineConfirmed: false
                      })}
                    />
                    <span><strong>{t("routineEvery")}</strong></span>
                  </label>
                  {!!step.routineIntervalMinutes && (
                    <label className="time-field">
                      <input
                        type="number"
                        min="5"
                        step="5"
                        value={step.routineIntervalMinutes ?? ""}
                        onChange={(event) => patchParsedStep(index, { ...syncedRoutinePatch(step, event.currentTarget.value ? Number(event.currentTarget.value) : null), pastDeadlineConfirmed: false })}
                        placeholder="minutes"
                      />
                      <span className="subtle" style={{ fontSize: "0.75rem" }}>min</span>
                    </label>
                  )}
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
