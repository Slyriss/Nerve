import type { AppSnapshot, UserState } from "@nerve/shared";

export type CatMood =
  | "sleep"
  | "calm"
  | "play"
  | "thinking"
  | "watch"
  | "warn"
  | "threat"
  | "block"
  | "break";

export const brandWordLogo = new URL("../../../../../../images/MEWO.png", import.meta.url).href;
export const brandIconLogo = new URL("../../../../../../images/cat.png", import.meta.url).href;
export const appDisplayName = "别meow鱼";

const cat03 = new URL("../../../../../../images/657902907/3.webp", import.meta.url).href;
const cat07 = new URL("../../../../../../images/657902907/7.webp", import.meta.url).href;
const cat08 = new URL("../../../../../../images/657902907/8.webp", import.meta.url).href;
const cat10 = new URL("../../../../../../images/657902907/10.webp", import.meta.url).href;
const cat12 = new URL("../../../../../../images/657902907/12.webp", import.meta.url).href;
const cat13 = new URL("../../../../../../images/657902907/13.webp", import.meta.url).href;
const cat18 = new URL("../../../../../../images/657902907/18.webp", import.meta.url).href;
const cat19 = new URL("../../../../../../images/657902907/19.webp", import.meta.url).href;
const cat20 = new URL("../../../../../../images/657902907/20.webp", import.meta.url).href;
const cat28 = new URL("../../../../../../images/657902907/28.webp", import.meta.url).href;
const cat30 = new URL("../../../../../../images/657902907/30.webp", import.meta.url).href;
const cat32 = new URL("../../../../../../images/657902907/32.webp", import.meta.url).href;
const cat41 = new URL("../../../../../../images/657902907/41.webp", import.meta.url).href;
const cat43 = new URL("../../../../../../images/657902907/43.webp", import.meta.url).href;
const cat52 = new URL("../../../../../../images/657902907/52.webp", import.meta.url).href;
const cat58 = new URL("../../../../../../images/657902907/58.webp", import.meta.url).href;
const cat61 = new URL("../../../../../../images/657902907/61.webp", import.meta.url).href;
const cat63 = new URL("../../../../../../images/657902907/63.webp", import.meta.url).href;
const cat65 = new URL("../../../../../../images/657902907/65.webp", import.meta.url).href;
const cat67 = new URL("../../../../../../images/657902907/67.webp", import.meta.url).href;
const cat74 = new URL("../../../../../../images/657902907/74.webp", import.meta.url).href;
const cat75 = new URL("../../../../../../images/657902907/75.webp", import.meta.url).href;
const cat76 = new URL("../../../../../../images/657902907/76.webp", import.meta.url).href;
const cat78 = new URL("../../../../../../images/657902907/78.webp", import.meta.url).href;
const cat80 = new URL("../../../../../../images/657902907/80.webp", import.meta.url).href;
const cat82 = new URL("../../../../../../images/657902907/82.webp", import.meta.url).href;
const cat83 = new URL("../../../../../../images/657902907/83.webp", import.meta.url).href;
const cat89 = new URL("../../../../../../images/657902907/89.webp", import.meta.url).href;

export const catFrames: Record<CatMood, string[]> = {
  sleep: [cat75, cat89, cat18, cat19, cat32],
  calm: [cat03, cat18, cat19, cat20, cat65],
  play: [cat41, cat43, cat52, cat58, cat78, cat83],
  thinking: [cat61, cat65, cat67, cat74],
  watch: [cat10, cat28, cat30, cat76, cat80],
  warn: [cat30, cat76, cat12, cat13, cat63],
  threat: [cat76, cat07, cat12, cat63, cat82],
  block: [cat07, cat08, cat12, cat63, cat82],
  break: [cat41, cat43, cat52, cat58, cat78, cat83]
};

export function lockInWarningLevel(startedAt?: string | null) {
  if (!startedAt) return 0;
  const elapsed = Date.now() - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  if (elapsed > 14_000) return 3;
  if (elapsed > 7_000) return 2;
  return 1;
}

export function moodForUserState(state?: UserState) {
  switch (state) {
    case "on_task":
    case "progress":
      return "sleep";
    case "productive_drift":
      return "calm";
    case "thinking":
      return "thinking";
    case "stuck":
      return "watch";
    case "unproductive_drift":
      return "warn";
    default:
      return "calm";
  }
}

export function catMoodForSnapshot(snapshot: AppSnapshot): CatMood {
  if (snapshot.bannedSiteAlert || snapshot.lockInAlert) return "block";
  if (snapshot.breakEndsAt && Date.parse(snapshot.breakEndsAt) > Date.now()) return "break";
  const warningLevel = lockInWarningLevel(snapshot.lockInWarningStartedAt);
  if (warningLevel >= 3) return "threat";
  if (warningLevel === 2) return "warn";
  if (warningLevel === 1) return "watch";
  return moodForUserState(snapshot.observations[0]?.userState);
}
