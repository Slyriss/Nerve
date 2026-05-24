import { useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import type { CalendarItem } from "../lib/types";
import { EmptyState } from "./EmptyState";
import { taskTypeLabel, useCopy } from "../lib/copy";
import { calendarItems, localDateKey, calendarLabel, sameMonth, monthTitle, monthCells } from "../lib/utils";

export function CalendarScreen({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const t = useCopy(snapshot.settings.language);
  const [month, setMonth] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState(() => localDateKey(new Date()));
  const [showReminders, setShowReminders] = useState(true);
  const items = calendarItems(snapshot).filter((item) => showReminders || item.kind !== "reminder");
  const grouped = new Map<string, ReturnType<typeof calendarItems>>();
  for (const item of items) {
    grouped.set(item.dateKey, [...(grouped.get(item.dateKey) ?? []), item]);
  }
  const cells = monthCells(month);
  const selectedItems = (grouped.get(selectedKey) ?? []).sort((a, b) => a.at.localeCompare(b.at));
  const moveMonth = (delta: number) => {
    const next = new Date(month);
    next.setMonth(month.getMonth() + delta, 1);
    setMonth(next);
  };
  async function deleteItem(item: CalendarItem) {
    if (!window.confirm(t("deleteScheduledItemConfirm"))) return;
    const refreshed = item.source === "step"
      ? await window.nerve.deleteStep(item.sourceId)
      : await window.nerve.deleteReminder(item.sourceId);
    setSnapshot(refreshed);
  }
  return (
    <section className="calendar-layout">
      <div className="calendar-shell">
        <div className="calendar-main">
          <div className="calendar-toolbar">
            <button title="Previous month" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={16} />
            </button>
            <div className="page-title compact">
              <span className="eyebrow">Schedule</span>
              <h2>{monthTitle(month)}</h2>
            </div>
            <button title="Next month" onClick={() => moveMonth(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="month-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span className="weekday" key={day}>{day}</span>
            ))}
            {cells.map((date) => {
              const key = localDateKey(date);
              const dayItems = grouped.get(key) ?? [];
              return (
                <button
                  className={`calendar-cell ${sameMonth(date, month) ? "" : "outside"} ${key === selectedKey ? "selected" : ""} ${key === localDateKey(new Date()) ? "today" : ""}`}
                  key={key}
                  onClick={() => setSelectedKey(key)}
                >
                  <span>{date.getDate()}</span>
                  {dayItems.length > 0 && (
                    <strong>{dayItems.length}</strong>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="calendar-detail">
          <div className="calendar-day-head">
            <h3>{calendarLabel(selectedKey)}</h3>
            <div className="calendar-day-actions">
              <label className="calendar-reminder-toggle">
                <input type="checkbox" checked={showReminders} onChange={(event) => setShowReminders(event.currentTarget.checked)} />
                {t("showReminders")}
              </label>
              <span>{selectedItems.length}</span>
            </div>
          </div>
          {selectedItems.length === 0 ? (
            <EmptyState icon={<CalendarClock size={18} />} title="No activity" body="Scheduled notes, inbox items, reminders, and due dates will appear here." />
          ) : (
            <div className="calendar-items">
              {selectedItems.map((item) => (
                <article className={`${item.kind} ${item.status}`} key={item.id}>
                  <time>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.subtitle}</p>
                    <span>{item.kind === "due" ? "Due" : "Reminder"} · {taskTypeLabel(item.taskType, snapshot.settings.language)} · {item.status}</span>
                  </div>
                  <button className="calendar-delete-btn" title={t("deleteScheduledItem")} onClick={() => deleteItem(item)}>
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
