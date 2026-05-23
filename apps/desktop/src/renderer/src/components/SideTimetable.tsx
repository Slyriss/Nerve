import type { AppSnapshot } from "@nerve/shared";
import { hasPastDeadline, sortBySchedule, timeLabel, isToday } from "../lib/utils";

export function SideTimetable({ snapshot }: { snapshot: AppSnapshot }) {
  const activeId = snapshot.activeStep?.id;
  const now = Date.now();
  const missedSteps = snapshot.steps.filter((step) =>
    step.status !== "complete" && (
      Boolean(step.dueAt && Date.parse(step.dueAt) < now) ||
      Boolean(step.reminderAt && Date.parse(step.reminderAt) < now)
    )
  );
  const missedStepIds = new Set(missedSteps.map((step) => step.id));
  const missedReminders = snapshot.reminders.filter((reminder) =>
    reminder.status !== "dismissed" &&
    !reminder.stepId &&
    (reminder.status === "triggered" || (reminder.status === "scheduled" && Date.parse(reminder.reminderAt) < now))
  );
  const steps = sortBySchedule(snapshot.steps).filter((step) =>
    !missedStepIds.has(step.id) &&
    step.status !== "complete" &&
    (isToday(step.reminderAt) || isToday(step.dueAt))
  );
  const reminders = snapshot.reminders
    .filter((reminder) =>
      reminder.status !== "dismissed" &&
      reminder.status !== "triggered" &&
      !reminder.stepId &&
      isToday(reminder.reminderAt) &&
      Date.parse(reminder.reminderAt) >= now
    )
    .slice(0, 6);
  return (
    <section className="side-timetable">
      {(steps.length > 0 || reminders.length > 0) && <h3 className="side-section-title">Upcoming</h3>}
      {steps.length === 0 && reminders.length === 0 && missedSteps.length === 0 && missedReminders.length === 0 && (
        <div className="side-empty">No same-day activity scheduled.</div>
      )}
      {steps.map((step) => {
        const isPastDue = hasPastDeadline(step) && step.status !== "complete";
        return (
          <article className={`${step.status} ${step.id === activeId ? "current" : ""} ${isPastDue ? "past-due" : ""}`} key={step.id}>
            <div className="side-time">
              <span>Remind</span>
              <strong>{timeLabel(step.routineNextAt || step.reminderAt)}</strong>
              <span>Due {timeLabel(step.dueAt)}</span>
            </div>
            <div className="side-activity">
              <span>{step.taskType}</span>
              <strong>{step.title}</strong>
              <p>{step.routineIntervalMinutes ? `Routine · every ${step.routineIntervalMinutes}m` : step.id === activeId ? "Current step" : step.status}</p>
            </div>
          </article>
        );
      })}
      {reminders.length > 0 && (
        <div className="side-reminders">
          <h3>Reminders</h3>
          {reminders.map((reminder) => (
            <article className={reminder.status} key={reminder.id}>
              <div className="side-time">
                <span>{reminder.status}</span>
                <strong>{timeLabel(reminder.reminderAt)}</strong>
              </div>
              <div className="side-activity">
                <span>{reminder.taskType}</span>
                <strong>{reminder.title}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
      {(missedSteps.length > 0 || missedReminders.length > 0) && (
        <div className="side-reminders missed">
          <h3>Missed events</h3>
          {missedSteps.slice(0, 4).map((step) => (
            <article className="past-due" key={`missed-step-${step.id}`}>
              <div className="side-time">
                <span>Missed</span>
                <strong>{timeLabel(step.reminderAt || step.dueAt)}</strong>
              </div>
              <div className="side-activity">
                <span>{step.taskType}</span>
                <strong>{step.title}</strong>
              </div>
            </article>
          ))}
          {missedReminders.slice(0, 4).map((reminder) => (
            <article className="triggered" key={`missed-reminder-${reminder.id}`}>
              <div className="side-time">
                <span>{reminder.status}</span>
                <strong>{timeLabel(reminder.reminderAt)}</strong>
              </div>
              <div className="side-activity">
                <span>{reminder.taskType}</span>
                <strong>{reminder.title}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
