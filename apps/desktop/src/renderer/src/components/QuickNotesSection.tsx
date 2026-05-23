import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { fromDateTimeLocal } from "../lib/utils";

export function QuickNotesSection({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const t = useCopy(snapshot.settings.language);
  const [note, setNote] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canAdd = note.trim().length > 0 && reminderAt;

  async function addNote() {
    if (!reminderAt) {
      setError(t("reminderRequired"));
      return;
    }
    try {
      setError(null);
      const refreshed = await window.nerve.addNoteToPlan({ note, reminderAt: fromDateTimeLocal(reminderAt) ?? "" });
      setSnapshot(refreshed);
      setNote("");
      setReminderAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reminderRequired"));
    }
  }

  return (
    <section className="note-panel">
      <div className="settings-section-head">
        <FileText size={16} />
        <h3>{t("quickNotes")}</h3>
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("notePlaceholder")} />
      <div className="note-controls">
        <label>
          {t("noteReminder")}
          <input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.currentTarget.value)} />
        </label>
        <button className="primary" disabled={!canAdd} onClick={addNote}>
          <Plus size={14} /> {t("addNote")}
        </button>
      </div>
      {error && <p className="error-note">{error}</p>}
    </section>
  );
}
