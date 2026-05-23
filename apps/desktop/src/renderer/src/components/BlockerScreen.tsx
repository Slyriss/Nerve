import { useEffect } from "react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";

export function BlockerScreen({ snapshot }: { snapshot: AppSnapshot }) {
  const alert = snapshot.bannedSiteAlert;
  const step = snapshot.activeStep;
  const strikes = snapshot.bannedSiteStrikeCount;
  const lockIn = snapshot.lockInAlert;
  const t = useCopy(snapshot.settings.language);
  useEffect(() => {
    if (!alert && !lockIn) {
      void window.nerve.dismissBlocker();
    }
  }, [alert, lockIn]);
  if (lockIn && !alert) {
    return (
      <div className="blocker-screen lock-in">
        <div className="blocker-card">
          <h1 className="blocker-title">{t("lockInBlockerTitle")}</h1>
          <p>You drifted. Get back to: <strong>{snapshot.session?.goal}</strong></p>
          {step && <p className="step-hint">{step.title}</p>}
          <button className="blocker-dismiss" onClick={() => window.nerve.dismissBlocker()}>
            {t("lockInBack")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="blocker-screen">
      <div className="blocker-card">
        <div className="blocker-icon">✖</div>
        <h1 className="blocker-title">Leave this site.</h1>
        <p className="blocker-site">{alert?.rule ?? "Banned site"}</p>
        {strikes > 1 && <span className="blocker-strike">Strike #{strikes}</span>}
        {step && (
          <div className="blocker-task">
            <p className="blocker-task-label">Your current task:</p>
            <strong>{step.title}</strong>
            <p>{step.nextAction}</p>
          </div>
        )}
        <button className="blocker-dismiss" onClick={() => window.nerve.dismissBlocker()}>
          I'll leave the site, let me back in
        </button>
      </div>
    </div>
  );
}
