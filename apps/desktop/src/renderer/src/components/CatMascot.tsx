import { useEffect, useState } from "react";
import { catFrames, type CatMood } from "../lib/catAssets";

const frameMs: Record<CatMood, number> = {
  sleep: 1700,
  calm: 1400,
  play: 820,
  thinking: 1300,
  watch: 1000,
  warn: 760,
  threat: 620,
  block: 580,
  break: 760
};

export function CatMascot({
  mood = "calm",
  size = "medium",
  message,
  timerText,
  warningLevel = 0,
  className = ""
}: {
  mood?: CatMood;
  size?: "tiny" | "small" | "medium" | "large" | "hero";
  message?: string;
  timerText?: string;
  warningLevel?: number;
  className?: string;
}) {
  const frames = catFrames[mood] ?? catFrames.calm;
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
    if (frames.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, frameMs[mood] ?? 1000);
    return () => window.clearInterval(timer);
  }, [frames, mood]);

  return (
    <div className={`cat-mascot ${mood} ${size} level-${warningLevel} ${className}`.trim()}>
      <div className="cat-stage" aria-hidden="true">
        <img src={frames[frameIndex % frames.length]} alt="" draggable={false} />
      </div>
      {(message || timerText) && (
        <div className="cat-bubble">
          {message && <span>{message}</span>}
          {timerText && <strong>{timerText}</strong>}
        </div>
      )}
    </div>
  );
}
