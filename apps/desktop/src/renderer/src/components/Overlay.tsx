import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, LoaderCircle, Mic, Pause, Volume2 } from "lucide-react";
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
          <div className="mark">喵</div>
          <div className="vertical-status">{snapshot.session?.status || "idle"}</div>
          {snapshot.voiceState !== "idle" && <div className={`slim-voice-label ${snapshot.voiceState}`}>{snapshot.voiceState}</div>}
          {!snapshot.bannedSiteAlert && <VoiceCoach snapshot={snapshot} compact />}
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
              <strong>别Meow鱼</strong>
              <span>{snapshot.session?.status === "completed" ? t("sessionComplete") : t("nextStep")}</span>
            </div>
            <span className={`state-pill ${snapshot.bannedSiteAlert ? "banned" : latestState || "unknown"}`}>
              {snapshot.bannedSiteAlert ? "Blocked" : stateLabel(latestState, t)}
            </span>
            <div className="overlay-head-actions">
              <button title="Collapse" onClick={() => window.nerve.setOverlayExpanded(false)}>
                <ChevronRight size={18} />
              </button>
            </div>
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
                {snapshot.bannedSiteAlert ? <BannedSiteCard snapshot={snapshot} /> : <StepCard snapshot={snapshot} setSnapshot={setSnapshot} compact voiceSlot={<VoiceCoach snapshot={snapshot} />} />}
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
              <div className="overlay-link-row">
                {snapshot.session?.status === "active" && <button onClick={async () => setSnapshot(await window.nerve.pauseSession())}>{t("pauseSession")}</button>}
                {snapshot.session?.status === "paused" && <button onClick={async () => setSnapshot(await window.nerve.resumeSession())}>{t("resumeSession")}</button>}
                <button onClick={() => window.nerve.openMain("/settings")}>{t("settings")}</button>
              </div>
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

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

function VoiceCoach({ snapshot, compact = false }: { snapshot: AppSnapshot; compact?: boolean }) {
  const active = snapshot.session?.status === "active";
  const configured = Boolean(snapshot.settings.elevenLabsApiKey && snapshot.settings.elevenLabsVoiceId);
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [lastExchange, setLastExchange] = useState<{ transcription: string; response: string } | null>(null);
  const stateRef = useRef<VoiceState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const toggleRef = useRef<() => void>(() => {});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }

  function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === "string" ? reader.result : "";
        resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Could not read voice recording."));
      reader.readAsDataURL(blob);
    });
  }

  async function sendRecording(blob: Blob) {
    if (blob.size === 0) {
      setError("No audio captured.");
      setState("idle");
      void window.nerve.setVoiceState("error");
      return;
    }
    setState("thinking");
    void window.nerve.setVoiceState("thinking");
    try {
      const result = await window.nerve.voiceMessage(await blobToBase64(blob));
      setLastExchange({ transcription: result.transcription, response: result.response });
      setExpanded(true);
      setState("speaking");
      void window.nerve.setVoiceState("speaking");
      const audio = new Audio(`data:audio/mpeg;base64,${result.audioBase64}`);
      audio.onended = () => {
        setState("idle");
        void window.nerve.setVoiceState("idle");
      };
      audio.onerror = () => {
        setState("idle");
        void window.nerve.setVoiceState("error");
      };
      await audio.play();
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : "Voice coach failed.");
      setState("idle");
      void window.nerve.setVoiceState("error");
    }
  }

  async function startListening() {
    if (!active || !configured || stateRef.current === "thinking" || stateRef.current === "speaking") return;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanupStream();
        void sendRecording(blob);
      };
      recorder.start();
      setState("listening");
      void window.nerve.setVoiceState("listening");
    } catch (voiceError) {
      cleanupStream();
      setError(voiceError instanceof Error ? voiceError.message : "Microphone permission was not available.");
      setState("idle");
      void window.nerve.setVoiceState("error");
    }
  }

  function stopListening() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  toggleRef.current = () => {
    if (stateRef.current === "listening") {
      stopListening();
    } else {
      void startListening();
    }
  };

  useEffect(() => window.nerve.onToggleVoice(() => toggleRef.current()), []);

  useEffect(() => {
    if (!active && stateRef.current === "listening") stopListening();
  }, [active]);

  if (!active) return null;

  const busy = state === "thinking" || state === "speaking";
  const title = !configured
    ? "Add ElevenLabs API key and voice ID in Settings"
    : state === "listening"
      ? "Stop listening"
      : "Start voice coach";

  if (compact) {
    return (
      <div className="voice-coach compact">
        <button
          className={`voice-button ${state}`}
          disabled={!active || !configured || busy}
          title={title}
          onClick={() => toggleRef.current()}
        >
          {state === "thinking" ? <LoaderCircle size={15} /> : state === "speaking" ? <Volume2 size={15} /> : <Mic size={15} />}
        </button>
      </div>
    );
  }

  const inlineLabel =
    state === "listening" ? "Listening… press again to stop" :
    state === "thinking" ? "Thinking…" :
    state === "speaking" ? "Speaking reply" :
    !configured ? "Add ElevenLabs key in Settings" :
    "Ask voice coach (Alt+M)";

  return (
    <div className="voice-coach-inline">
      {state === "listening" && (
        <div className="voice-listening-banner">
          <span className="voice-listening-dot" />
          Listening...
        </div>
      )}
      <button
        className={`voice-inline-btn ${state}`}
        disabled={!active || !configured || busy}
        onClick={() => toggleRef.current()}
      >
        {state === "thinking" ? <LoaderCircle size={15} /> : state === "speaking" ? <Volume2 size={15} /> : <Mic size={15} />}
        <span>{inlineLabel}</span>
      </button>
      {error && <p className="voice-error">{error}</p>}
    </div>
  );
}

