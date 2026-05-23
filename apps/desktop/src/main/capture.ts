/**
 * CaptureService — sensor layer
 *
 * Responsible for:
 *  - Taking periodic screenshots at an adaptive interval
 *  - Polling the active window every 600 ms and firing an immediate
 *    capture when the user switches apps
 *  - Reporting system idle time so the analysis layer can decide
 *    whether to run AI inference on each frame
 *
 * Emits a single "frame" event.  The orchestrator (main.ts) decides
 * what to do with each frame; this module has no business logic.
 */

import { EventEmitter } from "node:events";
import { powerMonitor, screen, desktopCapturer } from "electron";
import type Electron from "electron";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WindowDetection {
  activeApp: string;
  windowTitle: string;
  matchText?: string;
}

export interface ScreenCapture {
  image: Electron.NativeImage;
  sourceName: string;
  /** Sanitised, human-readable app name */
  activeApp: string;
  /** Sanitised window title */
  windowTitle: string;
  /** Raw text from active-win (app name + title + URL) for banned-site matching */
  matchText?: string;
  /** Perceptual hash of the current frame */
  hash: string;
  /** True when the hash differs from the previous frame */
  changed: boolean;
  /** System idle time in seconds at the moment of capture */
  idleSeconds: number;
  /** What triggered this frame */
  trigger: "window-change" | "idle" | "interval" | "voice";
  /**
   * True when the active window is Nerve itself or another noisy source.
   * The orchestrator should fall back to the last known good context.
   */
  noisy: boolean;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Cache the active-win function after the first dynamic import. */
let activeWinFn: (() => Promise<unknown>) | null = null;

/**
 * Strip raw URLs and bare domains from titles before storing them so that
 * the AI never receives personally identifiable browsing paths.
 */
export function sanitizeTitle(title: string): string {
  return title
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?/gi, "[site]")
    .slice(0, 180);
}

/** Returns true when the detected window belongs to Nerve itself or is
 *  another source we should ignore (snipping tool, full-screen overlay). */
export function isNoisyDetection(appName: string, windowTitle: string): boolean {
  return /electron.*nerve|^nerve\b|别meow鱼|\bmewo\b|snipping tool|entire screen/i.test(
    `${appName} ${windowTitle}`
  );
}

/** 8×8 average-brightness perceptual hash → 64-char binary string. */
export function imageHash(image: Electron.NativeImage): string {
  const small = image.resize({ width: 8, height: 8, quality: "good" });
  const bitmap = small.toBitmap();
  const values: number[] = [];
  for (let i = 0; i < bitmap.length; i += 4) {
    values.push((bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3);
  }
  const avg = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  return values.map((v) => (v >= avg ? "1" : "0")).join("");
}

/** Capture the primary display at full resolution. */
export async function capturePrimaryScreen(): Promise<{
  image: Electron.NativeImage;
  sourceName: string;
}> {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: display.size.width, height: display.size.height },
  });
  const source = sources[0];
  if (!source) throw new Error("No screen source available.");
  return { image: source.thumbnail, sourceName: source.name };
}

/** Detect the currently active window via the active-win native module. */
export async function getActiveWindowFallback(
  sourceName = "Unknown screen"
): Promise<WindowDetection> {
  try {
    if (!activeWinFn) {
      const mod = await import("active-win");
      const m = mod as unknown as {
        default?: () => Promise<unknown>;
        activeWindow?: () => Promise<unknown>;
      };
      activeWinFn = m.default ?? m.activeWindow ?? null;
    }
    const active = activeWinFn ? ((await activeWinFn()) as Record<string, unknown> | null) : null;
    const rawUrl = typeof (active as any)?.url === "string" ? (active as any).url : "";
    const rawTitle =
      typeof (active as any)?.title === "string" ? (active as any).title : sourceName;
    return {
      activeApp: sanitizeTitle((active as any)?.owner?.name || "Unknown app"),
      windowTitle: sanitizeTitle(rawTitle),
      matchText: `${(active as any)?.owner?.name || ""} ${rawTitle} ${rawUrl}`,
    };
  } catch {
    return {
      activeApp: "Unknown app",
      windowTitle: sanitizeTitle(sourceName),
      matchText: sourceName,
    };
  }
}

// ─── CaptureService ───────────────────────────────────────────────────────────

export class CaptureService extends EventEmitter {
  /** ms between scheduled ticks (set from screenshotIntervalSeconds setting) */
  private intervalMs: number;
  /** Timer for the adaptive scheduled tick */
  private tickTimer: NodeJS.Timeout | null = null;
  /** Timer for the 600 ms window-change poll */
  private pollTimer: NodeJS.Timeout | null = null;
  /** Hash of the last captured frame */
  private previousHash: string | null = null;
  /** Last known window key (app|title) used to detect switches */
  private previousWindowKey = "";

  private static readonly POLL_MS = 600;
  private static readonly IDLE_THRESHOLD_S = 60;
  /** Back off 3× during extended idle (user stepped away) */
  private static readonly IDLE_BACKOFF_S = 120;

  constructor(intervalMs = 10_000) {
    super();
    this.intervalMs = intervalMs;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Trigger an immediate capture outside the normal schedule (e.g. on session start). */
  captureNow(trigger: ScreenCapture["trigger"] = "interval") {
    void this.doCapture(trigger);
  }

  setIntervalMs(ms: number) {
    this.intervalMs = ms;
    // Restart the tick so the new interval takes effect immediately
    if (this.tickTimer !== null) this.scheduleNext();
  }

  /** Clear the stored hash so the next frame is always treated as "changed". */
  resetHash() {
    this.previousHash = null;
  }

  start() {
    this.startPoll();
    this.scheduleNext();
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.previousHash = null;
    this.previousWindowKey = "";
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private startPoll() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(
      () => void this.pollWindowChange(),
      CaptureService.POLL_MS
    );
  }

  private async pollWindowChange() {
    try {
      const detected = await getActiveWindowFallback();
      if (isNoisyDetection(detected.activeApp, detected.windowTitle)) return;
      const key = `${detected.activeApp}|${detected.windowTitle}`;
      const prev = this.previousWindowKey;
      if (prev && key !== prev) {
        // App switch detected — trigger an immediate capture before updating the key
        await this.doCapture("window-change");
      } else if (!prev) {
        this.previousWindowKey = key;
      }
    } catch {
      /* ignore transient active-win errors */
    }
  }

  private scheduleNext() {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    const idleNow = powerMonitor.getSystemIdleTime();
    const delay =
      idleNow > CaptureService.IDLE_BACKOFF_S
        ? Math.min(this.intervalMs * 3, 60_000)
        : this.intervalMs;
    this.tickTimer = setTimeout(async () => {
      const idleAtFire = powerMonitor.getSystemIdleTime();
      await this.doCapture(
        idleAtFire >= CaptureService.IDLE_THRESHOLD_S ? "idle" : "interval"
      );
      this.scheduleNext();
    }, delay);
  }

  private async doCapture(trigger: ScreenCapture["trigger"]) {
    try {
      const { image, sourceName } = await capturePrimaryScreen();
      const detected = await getActiveWindowFallback(sourceName);
      const noisy = isNoisyDetection(detected.activeApp, detected.windowTitle);
      const hash = imageHash(image);
      const changed = this.previousHash === null ? true : this.previousHash !== hash;
      this.previousHash = hash;
      if (!noisy) {
        this.previousWindowKey = `${detected.activeApp}|${detected.windowTitle}`;
      }
      const capture: ScreenCapture = {
        image,
        sourceName,
        activeApp: detected.activeApp,
        windowTitle: detected.windowTitle,
        matchText: detected.matchText,
        hash,
        changed,
        idleSeconds: powerMonitor.getSystemIdleTime(),
        trigger,
        noisy,
      };
      this.emit("frame", capture);
    } catch {
      /* silently skip — outer tick reschedules regardless */
    }
  }
}
