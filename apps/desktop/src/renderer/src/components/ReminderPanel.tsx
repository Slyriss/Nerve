import { useState } from "react";
import { CalendarClock, Clock, Play } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { defaultReminderLocal, fromDateTimeLocal } from "../lib/utils";

export function ReminderPanel({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const t = useCopy(snapshot.settings.language);
  const [snoozeAt, setSnoozeAt] = useState<Record<string, string>>({});
  const reminders = snapshot.reminders
    .filter((reminder) => reminder.status !== "dismissed")
    .slice()
    .sort((a, b) => {
      if (a.status === "triggered" && b.status !== "triggered") return -1;
      if (a.status !== "triggered" && b.status === "triggered") return 1;
      return a.reminderAt.localeCompare(b.reminderAt);
    })
    .slice(0, 8);

  async function startNow(reminderId: string) {
    setSnapshot(await window.nerve.startReminder(reminderId));
  }

  async function remindLater(reminderId: string) {
    const value = snoozeAt[reminderId] || defaultReminderLocal(30);
    setSnapshot(await window.nerve.snoozeReminder(reminderId, fromDateTimeLocal(value) ?? ""));
  }

  if (reminders.length === 0) return null;
  return (
    <section className="reminder-panel">
      <div className="settings-section-head">
        <CalendarClock size={16} />
        <h3>{t("reminders")}</h3>
      </div>
      {reminders.map((reminder) => (
        <article className={reminder.status} key={reminder.id}>
          <div>
            <strong>{reminder.title}</strong>
            <span>{reminder.status} · {new Date(reminder.reminderAt).toLocaleString()}</span>
          </div>
          {reminder.message && <p>{reminder.message}</p>}
          {reminder.status === "triggered" && (
            <div className="reminder-actions">
              <button className="primary" onClick={() => startNow(reminder.id)}>
                <Play size={13} /> {t("startNow")}
              </button>
              <input
                type="datetime-local"
                value={snoozeAt[reminder.id] ?? defaultReminderLocal(30)}
                onChange={(event) => setSnoozeAt({ ...snoozeAt, [reminder.id]: event.currentTarget.value })}
              />
              <button onClick={() => remindLater(reminder.id)}>
                <Clock size={13} /> {t("remindLater")}
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
