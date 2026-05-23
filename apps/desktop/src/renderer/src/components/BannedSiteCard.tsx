import type { AppSnapshot } from "@nerve/shared";
import { useCopy } from "../lib/copy";
import { CatMascot } from "./CatMascot";

export function BannedSiteCard({ snapshot }: { snapshot: AppSnapshot }) {
  const alert = snapshot.bannedSiteAlert;
  const strikes = snapshot.bannedSiteStrikeCount;
  const t = useCopy(snapshot.settings.language);
  const bodyText = strikes >= 3 ? t("bannedSiteBody3") : strikes === 2 ? t("bannedSiteBody2") : t("bannedSiteBody");
  return (
    <section className="banned-card">
      <CatMascot
        mood="block"
        size="medium"
        message={t("bannedSiteTitle")}
        warningLevel={Math.min(3, strikes)}
      />
      <div className="banned-card-head">
        <p className="eyebrow">{alert?.rule || t("bannedSites")}</p>
        {strikes > 1 && <span className="strike-badge">#{strikes}</span>}
      </div>
      <h2>{t("bannedSiteTitle")}</h2>
      <p>{bodyText}</p>
      {snapshot.activeStep && (
        <div className="return-task">
          <span>{t("bannedSiteAction")}</span>
          <strong>{snapshot.activeStep.title}</strong>
          <p>{snapshot.activeStep.nextAction}</p>
        </div>
      )}
      <p className="subtle">{alert?.activeApp}: {alert?.windowTitle}</p>
    </section>
  );
}
