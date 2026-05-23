import { useEffect, useState } from "react";
import type { AppSnapshot } from "@nerve/shared";

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  useEffect(() => {
    window.nerve.getSnapshot().then(setSnapshot);
    return window.nerve.onSnapshot(setSnapshot);
  }, []);
  return [snapshot, setSnapshot] as const;
}

export function useNow(intervalMs = 1000) {
  const [value, setValue] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setValue(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return value;
}
