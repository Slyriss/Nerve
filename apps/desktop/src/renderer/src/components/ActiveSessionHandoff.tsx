import { useState } from "react";
import { Eye, ListChecks, Pause, Play, Plus, SquarePen } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import type { View } from "../lib/types";

export function ActiveSessionHandoff({
  snapshot,
  setSnapshot,
  setView
}: {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  setView: (view: View) => void;
}) {
  const t = useCopy(snapshot.settings.language);
  const paused = snapshot.session?.status === "paused";
  const [quickTitle, setQuickTitle] = useState("");
  async function addQuick() {
    if (!quickTitle.trim() || !snapshot.session) return;
    const s = await window.nerve.addStep(snapshot.session.id);
    const newStep = s.steps[s.steps.length - 1];
    if (newStep) {
      setSnapshot(await window.nerve.updateStep(newStep.id, { title: quickTitle.trim() }));
    } else {
      setSnapshot(s);
    }
    setQuickTitle("");
  }
  return (
    <section className="handoff-layout">
      <div className="handoff-panel">
        <div className="mark">喵</div>
        <h2>{paused ? t("pausedTitle") : t("runningSideTab")}</h2>
        <p className="muted">{paused ? t("pausedBody") : t("handoffBody")}</p>
        <div className="button-row">
          <button onClick={() => setView("plan")}>
            <ListChecks size={16} /> {t("viewPlan")}
          </button>
          <button onClick={() => setView("log")}>
            <Eye size={16} /> {t("viewLog")}
          </button>
        </div>
        <div className="button-row">
          {paused ? (
            <button className="primary" onClick={async () => setSnapshot(await window.nerve.resumeSession())}>
              <Play size={16} /> {t("resumeSession")}
            </button>
          ) : (
            <button onClick={async () => setSnapshot(await window.nerve.pauseSession())}>
              <Pause size={16} /> {t("pauseSession")}
            </button>
          )}
          <button className="danger" onClick={async () => setSnapshot(await window.nerve.endSession())}>{t("endSession")}</button>
        </div>
        <section className="handoff-add-section">
          <div className="handoff-add-head">
            <SquarePen size={16} />
            <div>
              <h3>Add to plan</h3>
              <p>Capture one task without leaving the session.</p>
            </div>
          </div>
          <div className="quick-add-row">
            <input
              placeholder={t("addTask")}
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void addQuick(); }}
            />
            <button onClick={addQuick} disabled={!quickTitle.trim()} title="Add task"><Plus size={15} /></button>
          </div>
          <p className="subtle">{t("hotkeyHint")}</p>
        </section>
      </div>
    </section>
  );
}
