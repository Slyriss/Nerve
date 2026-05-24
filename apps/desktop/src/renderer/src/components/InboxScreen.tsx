import { useState } from "react";
import { CalendarClock, Check, Monitor, Plus, RefreshCw, Settings } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { EmptyState } from "./EmptyState";
import { taskTypeLabel, useCopy } from "../lib/copy";
import type { ActionItem, ActionItemStatus, ActionItemUrgency, ConnectorStatus } from "../lib/types";
import { suggestedReminderForInboxItem, fromDateTimeLocal, formatLocalDateTimeSlot, addMinutesLocal } from "../lib/utils";

export function InboxScreen({ snapshot, language, onStartOnItem }: { snapshot: AppSnapshot; language: "en" | "zh"; onStartOnItem?: (goal: string) => void }) {
  const t = useCopy(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [reminderDrafts, setReminderDrafts] = useState<Record<string, string>>({});
  const [reminderEnabledDrafts, setReminderEnabledDrafts] = useState<Record<string, boolean>>({});
  const connectors = (snapshot as any).connectors as ConnectorStatus[] ?? [];
  const inboxItems = (snapshot as any).inboxItems as ActionItem[] ?? [];
  const gmailConnector = connectors.find((c) => c.name === "gmail");
  const isConnected = gmailConnector?.connected === true;
  const urgencyRank: Record<ActionItemUrgency, number> = { high: 0, medium: 1, low: 2 };
  const visibleItems = inboxItems
    .filter((i) => i.status !== "dismissed")
    .slice()
    .sort((a, b) => {
      const u = urgencyRank[a.urgency] - urgencyRank[b.urgency];
      if (u !== 0) return u;
      return b.extractedAt.localeCompare(a.extractedAt);
    });
  const googleClientId = (snapshot.settings as any).googleClientId as string ?? "";

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      await (window.nerve as any).connectGmail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Gmail.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await (window.nerve as any).disconnectGmail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFetch() {
    setBusy(true);
    setError(null);
    try {
      await (window.nerve as any).fetchInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan inbox.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateItem(itemId: string, status: ActionItemStatus) {
    if (status === "promoted") {
      const item = inboxItems.find((candidate) => candidate.id === itemId);
      const scheduleAt = scheduleDrafts[itemId] || (item ? suggestedReminderForInboxItem(item) : "");
      const reminderEnabled = reminderEnabledDrafts[itemId] ?? true;
      const reminderAt = reminderEnabled ? reminderDrafts[itemId] || (scheduleAt ? addMinutesLocal(scheduleAt, -10) : "") : "";
      if (!scheduleAt) {
        setError(t("reminderRequired"));
        return;
      }
      try {
        setError(null);
        await window.nerve.promoteInboxItem(itemId, {
          dueAt: fromDateTimeLocal(scheduleAt),
          reminderAt: reminderEnabled ? fromDateTimeLocal(reminderAt) : null
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item.");
      }
      return;
    }
    try {
      await (window.nerve as any).updateInboxItem(itemId, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  const urgencyColor: Record<ActionItemUrgency, string> = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#6b7280"
  };

  return (
    <section className="settings-layout">
      <div className="page-title compact">
        <span className="eyebrow">Gmail</span>
        <h2>{t("inboxTitle")}</h2>
      </div>

      {!googleClientId ? (
        <div style={{ padding: "1.5rem", background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: "1rem" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.8 }}>{t("inboxSetupHint")}</p>
          <button onClick={() => window.nerve.openMain("/settings")}>
            <Settings size={16} /> {t("settings")}
          </button>
        </div>
      ) : !isConnected ? (
        <div style={{ padding: "1.5rem", background: "rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: "1rem" }}>
          <p style={{ marginBottom: "0.75rem", opacity: 0.8 }}>{t("inboxNotConnected")}</p>
          {gmailConnector?.error && (
            <p style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: "0.75rem" }}>{gmailConnector.error}</p>
          )}
          <button className="primary" disabled={busy} onClick={handleConnect}>
            <Monitor size={16} /> {t("inboxConnect")}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", padding: "0.75rem 1rem", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
            <span style={{ fontSize: "0.75rem", background: "rgba(34,197,94,0.15)", color: "#22c55e", padding: "2px 8px", borderRadius: 12, fontWeight: 600 }}>
              {t("inboxConnected")}
            </span>
            {gmailConnector.email && (
              <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>{gmailConnector.email}</span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
              <button disabled={busy} onClick={handleFetch}>
                <RefreshCw size={15} /> {busy ? t("inboxFetching") : t("inboxFetch")}
              </button>
              <button disabled={busy} onClick={handleDisconnect}>
                {t("inboxDisconnect")}
              </button>
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <EmptyState icon={<Monitor size={18} />} title={t("inboxEmpty")} body="" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {visibleItems.map((item, index) => {
                const scheduleValue = scheduleDrafts[item.id] ?? suggestedReminderForInboxItem(item);
                const reminderEnabled = reminderEnabledDrafts[item.id] ?? true;
                const reminderValue = reminderDrafts[item.id] ?? addMinutesLocal(scheduleValue, -10);
                return (
                  <article className="inbox-item-card" key={item.id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div className="inbox-item-head" style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                      {item.source === "calendar" ? <CalendarClock size={14} style={{ flexShrink: 0, opacity: 0.7, marginTop: 2 }} /> : <Monitor size={14} style={{ flexShrink: 0, opacity: 0.7, marginTop: 2 }} />}
                      <strong style={{ flex: 1, fontSize: "0.9rem" }}>{item.title}</strong>
                      {index === 0 && item.status === "pending" && (
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "rgba(239,68,68,0.18)", color: "#ef4444", flexShrink: 0 }}>
                          {t("topPriority")}
                        </span>
                      )}
                      <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: `${urgencyColor[item.urgency]}22`, color: urgencyColor[item.urgency], flexShrink: 0 }}>
                        {item.urgency}
                      </span>
                    </div>
                    {item.description && (
                      <p style={{ fontSize: "0.8rem", opacity: 0.7, margin: 0 }}>{item.description}</p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      {item.suggestedTaskType && (
                        <span style={{ fontSize: "0.7rem", padding: "2px 7px", borderRadius: 10, background: "rgba(255,255,255,0.08)", opacity: 0.8 }}>
                          {taskTypeLabel(item.suggestedTaskType, language)}
                        </span>
                      )}
                      {item.dueHint && (
                        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                          <CalendarClock size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
                          {item.dueHint}
                        </span>
                      )}
                    </div>
                    <div className="inbox-schedule-row">
                      {item.status !== "promoted" && (
                        <>
                          <div className="inbox-schedule-preview">
                            <span>{t("inboxWillSchedule")}</span>
                            <strong>{formatLocalDateTimeSlot(scheduleValue)}</strong>
                            <small>{reminderEnabled ? `${t("inboxReminderAt")}: ${formatLocalDateTimeSlot(reminderValue)}` : t("inboxNoReminder")}</small>
                          </div>
                          <div className="inbox-time-grid">
                            <label className="inbox-reminder-field">
                              {t("inboxChangeSlot")}
                              <input
                                type="datetime-local"
                                value={scheduleValue}
                                onChange={(event) => {
                                  const nextSchedule = event.currentTarget.value;
                                  setScheduleDrafts({ ...scheduleDrafts, [item.id]: nextSchedule });
                                  if (!(item.id in reminderDrafts)) {
                                    setReminderDrafts({ ...reminderDrafts, [item.id]: addMinutesLocal(nextSchedule, -10) });
                                  }
                                }}
                                title={t("inboxReminderHint")}
                              />
                            </label>
                            <div className="inbox-reminder-column">
                              <label className={`inbox-reminder-field ${reminderEnabled ? "" : "reserved"}`} aria-hidden={!reminderEnabled}>
                                {t("inboxReminderAt")}
                                <input
                                  type="datetime-local"
                                  value={reminderValue}
                                  disabled={!reminderEnabled}
                                  tabIndex={reminderEnabled ? 0 : -1}
                                  onChange={(event) => setReminderDrafts({ ...reminderDrafts, [item.id]: event.currentTarget.value })}
                                />
                              </label>
                            </div>
                          </div>
                        </>
                      )}
                      <div className="inbox-actions-row">
                        <button className="primary" disabled={item.status === "promoted"} style={{ fontSize: "0.8rem", padding: "4px 12px" }} onClick={() => handleUpdateItem(item.id, "promoted")}>
                          {item.status === "promoted" ? <Check size={13} /> : <Plus size={13} />}
                          {item.status === "promoted" ? t("inboxAdded") : t("inboxPromote")}
                        </button>
                        {item.status !== "promoted" && (
                          <label className="inbox-reminder-toggle action-toggle">
                            <input
                              type="checkbox"
                              checked={reminderEnabled}
                              onChange={(event) => setReminderEnabledDrafts({ ...reminderEnabledDrafts, [item.id]: event.currentTarget.checked })}
                            />
                            {t("inboxReminderToggle")}
                          </label>
                        )}
                        {item.status !== "promoted" && <button style={{ fontSize: "0.8rem", padding: "4px 12px" }} onClick={() => handleUpdateItem(item.id, "dismissed")}>
                          {t("inboxDismiss")}
                        </button>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {error && <p className="error-note" style={{ marginTop: "1rem" }}>{error}</p>}
    </section>
  );
}
