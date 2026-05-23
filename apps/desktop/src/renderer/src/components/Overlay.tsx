import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Pause } from "lucide-react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { useNow } from "../lib/hooks";
import { timeLeft, completionStats, stateLabel, playBannedSiteSound } from "../lib/utils";
import { StepCard } from "./StepCard";
import { SideTimetable } from "./SideTimetable";
import { BannedSiteCard } from "./BannedSiteCard";

export function Overlay({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const expanded = snapshot.overlayExpanded || Boolean(snapshot.bannedSiteAlert);
  const opacity = snapshot.settings.panelOpacity;
  const { completed, total: totalRaw } = completionStats(snapshot.steps);
  const total = totalRaw || 1;
  const t = useCopy(snapshot.settings.language);
  const latestState = snapshot.observations[0]?.userState;
  const [sideView, setSideView] = useState<"step" | "timetable">("step");
  const [confirmEnd, setConfirmEnd] = useState(false);
  useNow(snapshot.thinkingPauseUntil || snapshot.breakEndsAt || snapshot.delayUntil || snapshot.breakReminderAt ? 1000 : 30_000);
  const prevAlertRef = useRef<typeof snapshot.bannedSiteAlert>(null);
  useEffect(() => {
    if (snapshot.settings.soundEnabled && snapshot.bannedSiteAlert && !prevAlertRef.current) {
      playBannedSiteSound();
    }
    prevAlertRef.current = snapshot.bannedSiteAlert;
  }, [snapshot.bannedSiteAlert, snapshot.settings.soundEnabled]);
  // Reset timetable view when session ends so stale step data doesn't persist
  useEffect(() => {
    const open = snapshot.session?.status === "active" || snapshot.session?.status === "paused";
    if (!open) { setSideView("step"); setConfirmEnd(false); }
  }, [snapshot.session?.status]);
  return (
    <div className={`overlay ${expanded ? "expanded" : "slim"} ${snapshot.bannedSiteAlert ? "banned-active" : ""}`} style={{ opacity }}>
      {!expanded ? (
        <div className="overlay-slim">
          <div className="mark">N</div>
          <div className="vertical-status">{snapshot.session?.status || "idle"}</div>
          <div className="rail-progress">
            <span style={{ height: `${(completed / total) * 100}%` }} />
          </div>
          <p>{snapshot.activeStep?.title || "No session"}</p>
          <button title="Expand" onClick={() => window.nerve.setOverlayExpanded(true)}>
            <ChevronLeft size={18} />
          </button>
        </div>
      ) : (
        <div className="overlay-expanded">
          <div className="overlay-head">
            <div>
              <strong>Nerve</strong>
              <span>{snapshot.session?.status === "completed" ? t("sessionComplete") : t("nextStep")}</span>
            </div>
            <span className={`state-pill ${snapshot.bannedSiteAlert ? "banned" : latestState || "unknown"}`}>
              {snapshot.bannedSiteAlert ? "Blocked" : stateLabel(latestState, t)}
            </span>
            {!snapshot.bannedSiteAlert && (
              <button title="Collapse" onClick={() => window.nerve.setOverlayExpanded(false)}>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
          <div className="side-toggle">
            <button className={sideView === "step" ? "active" : ""} onClick={() => setSideView("step")}>
              <Check size={14} /> Step
            </button>
            <button className={sideView === "timetable" ? "active" : ""} onClick={() => setSideView("timetable")}>
              <Clock size={14} /> Time
            </button>
          </div>
          <div className="overlay-scroll-area">
            {sideView === "step" ? (
              <>
                {snapshot.bannedSiteAlert ? <BannedSiteCard snapshot={snapshot} /> : <StepCard snapshot={snapshot} setSnapshot={setSnapshot} compact />}
                {snapshot.thinkingPauseUntil && Date.parse(snapshot.thinkingPauseUntil) > Date.now() && (
                  <div className="timer quiet">
                    <Pause size={15} /> {t("stateThinking")} {timeLeft(snapshot.thinkingPauseUntil)}
                  </div>
                )}
                {snapshot.breakEndsAt && Date.parse(snapshot.breakEndsAt) > Date.now() && (
                  <div className="timer quiet">
                    <Clock size={15} /> {t("breakEndsIn")} {timeLeft(snapshot.breakEndsAt)}
                  </div>
                )}
                {snapshot.settings.breakRemindersEnabled && !snapshot.breakEndsAt && snapshot.breakReminderAt && Date.parse(snapshot.breakReminderAt) > Date.now() && (
                  <div className="timer quiet">
                    <Clock size={15} /> {t("nextBreak")} {timeLeft(snapshot.breakReminderAt)}
                  </div>
                )}
              </>
            ) : (
              <SideTimetable snapshot={snapshot} />
            )}
          </div>
          {sideView === "step" && (
            <div className="overlay-links">
              {snapshot.session?.status === "active" && <button onClick={async () => setSnapshot(await window.nerve.pauseSession())}>{t("pauseSession")}</button>}
              {snapshot.session?.status === "paused" && <button onClick={async () => setSnapshot(await window.nerve.resumeSession())}>{t("resumeSession")}</button>}
              <button onClick={() => window.nerve.openMain("/plan")}>{t("viewPlan")}</button>
              <button onClick={() => window.nerve.openMain("/log")}>{t("viewLog")}</button>
              <button onClick={() => window.nerve.openMain("/settings")}>{t("settings")}</button>
              {snapshot.session && snapshot.session.status !== "completed" && (
                confirmEnd ? (
                  <div className="overlay-confirm-end">
                    <p>{t("endSessionConfirm")}</p>
                    <div className="overlay-confirm-btns">
                      <button className="danger-sm" onClick={async () => { setConfirmEnd(false); setSnapshot(await window.nerve.endSession()); }}>{t("endSessionConfirmYes")}</button>
                      <button onClick={() => setConfirmEnd(false)}>{t("endSessionConfirmNo")}</button>
                    </div>
                  </div>
                ) : (
                  <button className="danger-sm" onClick={() => setConfirmEnd(true)}>{t("endSession")}</button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
