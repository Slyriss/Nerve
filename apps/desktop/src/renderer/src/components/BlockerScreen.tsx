import { useEffect } from "react";
import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { CatMascot } from "./CatMascot";

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
          <CatMascot mood="block" size="hero" message={t("lockInBlockerTitle")} warningLevel={3} />
          <h1 className="blocker-title">{t("lockInBlockerTitle")}</h1>
          <p>{t("getBackToWork")}</p>
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
        <CatMascot mood="block" size="hero" message={t("bannedSiteTitle")} warningLevel={Math.min(3, strikes)} />
        <h1 className="blocker-title">{t("bannedSiteTitle")}</h1>
        <p className="blocker-site">{alert?.rule ?? "Banned site"}</p>
        {strikes > 1 && <span className="blocker-strike">Strike #{strikes}</span>}
        <div className="blocker-task">
          <strong>{t("getBackToWork")}</strong>
        </div>
        <button className="blocker-dismiss" onClick={() => window.nerve.dismissBlocker()}>
          {t("lockInBack")}
        </button>
      </div>
    </div>
  );
}
