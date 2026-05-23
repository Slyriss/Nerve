import type { AppSnapshot } from "@nerve/shared";
import { CatMascot } from "./CatMascot";
import { brandIconLogo, catMoodForSnapshot, lockInWarningLevel } from "../lib/catAssets";

export function CatScreen({ snapshot }: { snapshot: AppSnapshot }) {
  const hasSession = Boolean(snapshot.session);
  const mood = catMoodForSnapshot(snapshot);
  const warningLevel = lockInWarningLevel(snapshot.lockInWarningStartedAt);
  const status = snapshot.bannedSiteAlert
    ? "blocked"
    : snapshot.breakEndsAt
      ? "break"
      : snapshot.session?.status ?? "idle";

  return (
    <main className={`cat-screen-window ${hasSession ? "has-session" : "idle"}`}>
      <section className="cat-screen-bezel" aria-label="Cat focus screen">
        <div className="cat-screen-display">
          {hasSession ? (
            <CatMascot mood={mood} size="small" warningLevel={warningLevel} className="cat-screen-mascot" />
          ) : (
            <img className="cat-screen-logo" src={brandIconLogo} alt="" />
          )}
        </div>
        <div className="cat-screen-footer">
          <span>{status}</span>
          <i aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}
