import { useEffect, useState } from "react";
import { Clock, Database, Eye, FolderOpen, KeyRound, Monitor, ShieldCheck, Trash2 } from "lucide-react";
import type { AppSnapshot, NerveSettings } from "@nerve/shared";
import { Select } from "./Select";
import { useCopy } from "../lib/copy";
import type { ConnectorStatus } from "../lib/types";


export function SettingsScreen({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (snapshot: AppSnapshot) => void }) {
  const [settings, setSettings] = useState(snapshot.settings);
  const [pendingClientSecret, setPendingClientSecret] = useState("");
  const [lockInDefault, setLockInDefault] = useState(snapshot.settings.defaultLockInMode ?? false);
  const t = useCopy(settings.language);
  useEffect(() => {
    setSettings(snapshot.settings);
    setLockInDefault(snapshot.settings.defaultLockInMode ?? false);
  }, [snapshot.settings]);
  async function save(patch: Partial<NerveSettings>) {
    const refreshed = await window.nerve.updateSettings(patch);
    setSettings(refreshed.settings);
    setSnapshot(refreshed);
  }
  async function toggleLockIn(checked: boolean) {
    setLockInDefault(checked); // optimistic
    await save({ defaultLockInMode: checked });
  }
  return (
    <section className="settings-layout">
      <div className="page-title compact">
        <span className="eyebrow">Control</span>
        <h2>{t("settings")}</h2>
      </div>
      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-section-head">
            <ShieldCheck size={17} />
            <h3>Session behavior</h3>
          </div>
          <div className="settings-grid">
            <Select label={t("language")} value={settings.language} onChange={(value) => save({ language: value as NerveSettings["language"] })} options={["en", "zh"]} labels={{ en: t("english"), zh: t("mandarin") }} />
            <Select label={t("detectionInterval")} value={settings.screenshotIntervalSeconds} onChange={(value) => save({ screenshotIntervalSeconds: Number(value) as NerveSettings["screenshotIntervalSeconds"] })} options={[10, 30, 60]} suffix="seconds" />
            <Select label={t("stuckThreshold")} value={settings.stuckThresholdMinutes} onChange={(value) => save({ stuckThresholdMinutes: Number(value) as NerveSettings["stuckThresholdMinutes"] })} options={[5, 8, 10]} suffix="minutes" />
            <Select label={t("driftThreshold")} value={settings.driftThresholdMinutes} onChange={(value) => save({ driftThresholdMinutes: Number(value) as NerveSettings["driftThresholdMinutes"] })} options={[3, 6, 10]} suffix="minutes" />
            <Select label={t("thinkingPause")} value={settings.thinkingPauseMinutes} onChange={(value) => save({ thinkingPauseMinutes: Number(value) as NerveSettings["thinkingPauseMinutes"] })} options={[3, 5, 10]} suffix="minutes" />
            <Select label={t("panelOpacity")} value={settings.panelOpacity} onChange={(value) => save({ panelOpacity: Number(value) as NerveSettings["panelOpacity"] })} options={[0.5]} suffix="" />
            <div className="checkbox-row">
              <input type="checkbox" checked={lockInDefault} disabled style={{ opacity: 0.4 }} />
              <span>
                <strong>{t("lockInMode")}</strong>
                <span className="subtle">Toggle this on the session start screen — it cannot be changed here.</span>
              </span>
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Clock size={17} />
            <h3>{t("breakReminders")}</h3>
          </div>
          <label className="switch-row">
            <span>{t("breakReminders")}</span>
            <input
              type="checkbox"
              checked={settings.breakRemindersEnabled}
              onChange={(event) => save({ breakRemindersEnabled: event.target.checked })}
            />
          </label>
          <div className="settings-grid">
            <Select label={t("breakReminderEvery")} value={settings.breakIntervalMinutes} onChange={(value) => save({ breakIntervalMinutes: Number(value) as NerveSettings["breakIntervalMinutes"] })} options={[15, 25, 30, 45, 60, 90]} suffix="minutes" />
            <Select label={t("breakDuration")} value={settings.breakDurationMinutes} onChange={(value) => save({ breakDurationMinutes: Number(value) as NerveSettings["breakDurationMinutes"] })} options={[5, 10, 15, 20, 30]} suffix="minutes" />
          </div>
          {snapshot.breakReminderAt && <p className="subtle">{t("nextBreak")} {new Date(snapshot.breakReminderAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <KeyRound size={17} />
            <h3>Provider</h3>
          </div>
          <div className="settings-grid">
            <label>
              {t("aiProvider")}
              <input value="DeepSeek" readOnly />
            </label>
            <label>
              {t("deepseekModel")}
              <input value={settings.deepseekModel} onChange={(event) => setSettings({ ...settings, deepseekModel: event.target.value })} onBlur={() => save({ deepseekModel: settings.deepseekModel })} />
            </label>
            <label className="wide-field">
              {t("deepseekKey")}
              <input type="password" value={settings.deepseekApiKey} onChange={(event) => setSettings({ ...settings, deepseekApiKey: event.target.value })} onBlur={() => save({ deepseekApiKey: settings.deepseekApiKey })} />
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Monitor size={17} />
            <h3>{t("connectors")}</h3>
          </div>
          <div className="settings-grid">
            <label className="wide-field">
              {t("googleClientId")}
              <input
                type="text"
                value={(settings as any).googleClientId ?? ""}
                onChange={(event) => setSettings({ ...settings, googleClientId: event.target.value } as any)}
                placeholder="1234567890-abc...apps.googleusercontent.com"
              />
              <span className="subtle" style={{ fontSize: "0.75rem", marginTop: 4, display: "block" }}>{t("googleClientIdHint")}</span>
            </label>
            <label className="wide-field">
              {t("googleClientSecret")}
              <input
                type="password"
                value={pendingClientSecret}
                onChange={(event) => setPendingClientSecret(event.target.value)}
                placeholder={(snapshot as any).hasGoogleClientSecret ? "••••••• (set — type to replace)" : "GOCSPX-..."}
              />
              <span className="subtle" style={{ fontSize: "0.75rem", marginTop: 4, display: "block" }}>{t("googleClientSecretHint")}</span>
            </label>
            <div className="wide-field">
              <button
                onClick={async () => {
                  const patch: Record<string, string> = { googleClientId: (settings as any).googleClientId };
                  if (pendingClientSecret) patch.googleClientSecret = pendingClientSecret;
                  await save(patch as any);
                  setPendingClientSecret("");
                }}
                style={{ width: "fit-content" }}
              >
                <KeyRound size={15} /> {t("saveGoogleOAuth")}
              </button>
            </div>
          </div>
          {(() => {
            const connectors = (snapshot as any).connectors as ConnectorStatus[] ?? [];
            const gmail = connectors.find((c) => c.name === "gmail");
            return (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem", padding: "0.5rem 0" }}>
                <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>Gmail</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                  background: gmail?.connected ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                  color: gmail?.connected ? "#22c55e" : undefined }}>
                  {gmail?.connected ? t("inboxConnected") : t("inboxNotConnected")}
                </span>
                {gmail?.connected && gmail.email && (
                  <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>{gmail.email}</span>
                )}
              </div>
            );
          })()}
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Eye size={17} />
            <h3>{t("bannedSites")}</h3>
          </div>
          <label className="switch-row">
            <span>{t("bannedSitesEnabled")}</span>
            <input
              type="checkbox"
              checked={settings.bannedSitesEnabled}
              onChange={(event) => save({ bannedSitesEnabled: event.target.checked })}
            />
          </label>
          <label className="switch-row">
            <span>{t("soundEnabled")}</span>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(event) => save({ soundEnabled: event.target.checked })}
            />
          </label>
          <label className="wide-field">
            {t("bannedSites")}
            <textarea
              value={settings.bannedSites.join("\n")}
              onChange={(event) => setSettings({ ...settings, bannedSites: event.target.value.split(/\r?\n/) })}
              onBlur={() => save({ bannedSites: settings.bannedSites })}
              placeholder={"youtube.com\ntiktok.com\ninstagram.com"}
            />
          </label>
          <p className="subtle">{t("bannedSitesHelp")}</p>
        </section>
        <section className="settings-section">
          <div className="settings-section-head">
            <Database size={17} />
            <h3>Local data</h3>
          </div>
          <label className="switch-row">
            <span>{t("storeScreenshots")}</span>
            <input type="checkbox" checked={settings.storeScreenshots} onChange={(event) => save({ storeScreenshots: event.target.checked })} />
          </label>
        </section>
      </div>
      <p className="notice">{t("privacyNotice")}</p>
      <div className="button-row">
        <button onClick={() => window.nerve.openScreenshotFolder()}>
          <FolderOpen size={16} /> {t("openScreenshotFolder")}
        </button>
        <button className="danger" onClick={async () => { await window.nerve.deleteAllData(); setSnapshot(await window.nerve.getSnapshot()); }}>
          <Trash2 size={16} /> {t("deleteData")}
        </button>
      </div>
      <p className="subtle">{snapshot.screenshotFolder}</p>
    </section>
  );
}
