import type { AppSnapshot, PlanStepDraft, StepRecord } from "@nerve/shared";
import type { ActionItem, CalendarItem, CopyKey, Schedulable } from "./types";

export function stateLabel(state: string | undefined, t: (key: CopyKey) => string) {
  switch (state) {
    case "on_task":
      return t("stateOnTask");
    case "progress":
      return t("stateProgress");
    case "productive_drift":
      return t("stateProductiveDrift");
    case "unproductive_drift":
      return t("stateUnproductiveDrift");
    case "stuck":
      return t("stateStuck");
    case "thinking":
      return t("stateThinking");
    default:
      return t("stateUnknown");
  }
}

export function timeLeft(until: string | null) {
  if (!until) return "";
  const seconds = Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000));
  const m = Math.floor(seconds / 60).toString();
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function addMinutesIso(value: string | null | undefined, minutes: number) {
  const base = value ? Date.parse(value) : Date.now();
  const start = Number.isFinite(base) ? base : Date.now();
  return new Date(start + minutes * 60_000).toISOString();
}

export function isPast(value?: string | null) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < Date.now();
}

export function hasPastDeadline(step: Schedulable) {
  return isPast(step.dueAt) || isPast(step.reminderAt) || isPast(step.routineNextAt);
}

export function syncedRoutinePatch(step: PlanStepDraft, minutes: number | null): Partial<PlanStepDraft> {
  if (!minutes) {
    return { routineIntervalMinutes: null, routineNextAt: null };
  }
  const anchor = step.reminderAt || step.routineNextAt || step.dueAt || null;
  const routineNextAt = addMinutesIso(anchor, minutes);
  return {
    routineIntervalMinutes: minutes,
    routineNextAt,
    reminderAt: step.reminderAt || routineNextAt
  };
}

export function scheduleTime(step: Schedulable) {
  const routine = step.routineNextAt ? Date.parse(step.routineNextAt) : Number.POSITIVE_INFINITY;
  const reminder = step.reminderAt ? Date.parse(step.reminderAt) : Number.POSITIVE_INFINITY;
  const due = step.dueAt ? Date.parse(step.dueAt) : Number.POSITIVE_INFINITY;
  return Math.min(
    Number.isFinite(routine) ? routine : Number.POSITIVE_INFINITY,
    Number.isFinite(reminder) ? reminder : Number.POSITIVE_INFINITY,
    Number.isFinite(due) ? due : Number.POSITIVE_INFINITY
  );
}

export function sortBySchedule<T extends Schedulable>(steps: T[]) {
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const diff = scheduleTime(a.step) - scheduleTime(b.step);
      return Number.isFinite(diff) ? diff : a.index - b.index;
    })
    .map(({ step }) => step);
}

export function timeLabel(value?: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
}

export function fileSrc(filePath: string) {
  return `nerve-file://local/${encodeURIComponent(filePath)}`;
}

export function completionStats(steps: StepRecord[]) {
  const total = steps.length;
  const completed = steps.filter((step) => step.status === "complete").length;
  const active = steps.find((step) => step.status === "active");
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { active, completed, percent, total };
}

export function nextScheduledLabel(steps: Schedulable[]) {
  const now = Date.now();
  const next = sortBySchedule(steps).find((step) => Number.isFinite(scheduleTime(step)) && scheduleTime(step) >= now);
  if (!next) return "No deadline";
  return new Date(scheduleTime(next)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatLocalDateTimeSlot(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function parseDeadlineText(text: string): { dueAt: string | null; reminderAt: string | null } {
  if (!text?.trim()) return { dueAt: null, reminderAt: null };
  const lc = text.toLowerCase();
  const isTomorrow = /\btomorrow\b/.test(lc);

  // Match "at 9pm", "9:30pm", "9 pm", "at 21:00" — require am/pm or explicit "at HH:MM"
  const withMeridian = lc.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const withAt24 = lc.match(/\bat\s+(\d{1,2}):(\d{2})\b/);
  const match = withMeridian ?? withAt24;
  if (!match) return { dueAt: null, reminderAt: null };

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridian = (withMeridian ? match[3] : undefined)?.toLowerCase();

  if (meridian === "pm" && hours < 12) hours += 12;
  else if (meridian === "am" && hours === 12) hours = 0;

  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  if (isTomorrow) d.setDate(d.getDate() + 1);
  else if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);

  const dueAt = d.toISOString();
  return { dueAt, reminderAt: new Date(d.getTime() - 30 * 60_000).toISOString() };
}

export function defaultReminderLocal(minutes = 30) {
  return toDateTimeLocal(new Date(Date.now() + minutes * 60_000).toISOString());
}

export function addMinutesLocal(value: string, minutes: number) {
  const parsed = Date.parse(value);
  const base = Number.isFinite(parsed) ? parsed : Date.now();
  return toDateTimeLocal(new Date(base + minutes * 60_000).toISOString());
}

export function nextLocalTime(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return toDateTimeLocal(date.toISOString());
}

export function suggestedReminderForInboxItem(item: ActionItem) {
  if (item.urgency === "high") return defaultReminderLocal(15);
  if (item.suggestedTaskType === "Finance / bills") return defaultReminderLocal(60);
  if (item.suggestedTaskType === "Email or admin") return defaultReminderLocal(30);
  if (item.suggestedTaskType === "Planning") return nextLocalTime(9);
  if (item.urgency === "medium") return defaultReminderLocal(90);
  return nextLocalTime(10);
}

export function localDateKey(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isToday(value?: string | null) {
  return Boolean(value && localDateKey(value) === localDateKey(new Date()));
}

export function calendarLabel(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function monthTitle(date: Date) {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

export function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_value, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function playBannedSiteSound() {
  try {
    const ctx = new AudioContext();
    const beep = (freq: number, startAt: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.22, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.15);
      osc.start(startAt);
      osc.stop(startAt + 0.15);
    };
    beep(660, ctx.currentTime);
    beep(880, ctx.currentTime + 0.2);
    beep(1100, ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 700);
  } catch {
    // AudioContext unavailable
  }
}

export function calendarItems(snapshot: AppSnapshot): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const step of snapshot.steps) {
    if (step.reminderAt) {
      items.push({ id: `${step.id}:reminder`, dateKey: localDateKey(step.reminderAt), at: step.reminderAt, kind: "reminder", title: step.title, subtitle: step.nextAction, status: step.status, taskType: step.taskType });
    }
    if (step.dueAt) {
      items.push({ id: `${step.id}:due`, dateKey: localDateKey(step.dueAt), at: step.dueAt, kind: "due", title: step.title, subtitle: step.deadlineText || "Due", status: step.status, taskType: step.taskType });
    }
    if (step.routineNextAt) {
      items.push({ id: `${step.id}:routine`, dateKey: localDateKey(step.routineNextAt), at: step.routineNextAt, kind: "routine", title: step.title, subtitle: `Routine · every ${step.routineIntervalMinutes}m`, status: step.status, taskType: step.taskType });
    }
  }
  for (const reminder of snapshot.reminders) {
    if (reminder.status === "dismissed") continue;
    if (reminder.stepId && reminder.status === "scheduled") continue;
    items.push({ id: `reminder:${reminder.id}`, dateKey: localDateKey(reminder.reminderAt), at: reminder.reminderAt, kind: "reminder", title: reminder.title, subtitle: reminder.message, status: reminder.status, taskType: reminder.taskType });
  }
  return items.filter((item) => item.dateKey).sort((a, b) => a.at.localeCompare(b.at));
}

export function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
