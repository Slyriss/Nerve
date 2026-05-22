import { z } from "zod";

export const planStepDraftSchema = z.object({
  title: z.string().min(1),
  nextAction: z.string().min(1),
  explanation: z.string().min(1)
});

export const generatePlanOutputSchema = z.object({
  steps: z.array(planStepDraftSchema).min(1)
});

export const analyzeScreenOutputSchema = z.object({
  userState: z.enum([
    "on_task",
    "productive_drift",
    "unproductive_drift",
    "stuck",
    "thinking",
    "progress",
    "unknown"
  ]),
  taskRelevance: z.enum(["on_task", "possibly_related", "off_task", "unknown"]),
  progressState: z.enum(["changed", "unchanged", "complete_suggested", "unknown"]),
  activeContext: z.string(),
  visibleChangeSummary: z.string(),
  conciseExplanation: z.string(),
  suggestedNextAction: z.string(),
  suggestedStepComplete: z.boolean(),
  shouldIntervene: z.boolean(),
  interventionType: z.enum(["none", "step_card", "drift_card", "thinking_hold"]),
  urgency: z.enum(["low", "medium"]),
  breadcrumbRelevance: z.enum(["productive", "unproductive", "unknown"])
});

export const atomizeStepOutputSchema = z.object({
  nextAction: z.string().min(1),
  explanation: z.string().min(1),
  atomizationLevel: z.number().int().min(1)
});

export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
