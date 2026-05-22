import { z } from "zod";

const taskTypeValues = [
  "Essay writing",
  "General writing",
  "Coding",
  "Research",
  "Study",
  "Email or admin",
  "Presentation",
  "Personal / life",
  "Health / self-care",
  "Household / chores",
  "Errands",
  "Meals",
  "Pet care",
  "Exercise",
  "Social / communication",
  "Finance / bills",
  "Design or creative",
  "Planning",
  "Mixed work"
] as const;

function normalizeTaskType(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases: Record<string, (typeof taskTypeValues)[number]> = {
    essay: "Essay writing",
    "essay writing": "Essay writing",
    writing: "General writing",
    "general writing": "General writing",
    draft: "General writing",
    drafting: "General writing",
    code: "Coding",
    coding: "Coding",
    programming: "Coding",
    research: "Research",
    study: "Study",
    studying: "Study",
    admin: "Email or admin",
    email: "Email or admin",
    "email/admin": "Email or admin",
    "email or admin": "Email or admin",
    presentation: "Presentation",
    presentations: "Presentation",
    slides: "Presentation",
    slideshow: "Presentation",
    deck: "Presentation",
    personal: "Personal / life",
    life: "Personal / life",
    "personal life": "Personal / life",
    "personal / life": "Personal / life",
    nonwork: "Personal / life",
    "non work": "Personal / life",
    health: "Health / self-care",
    "self care": "Health / self-care",
    "self-care": "Health / self-care",
    shower: "Health / self-care",
    hygiene: "Health / self-care",
    medication: "Health / self-care",
    chores: "Household / chores",
    chore: "Household / chores",
    household: "Household / chores",
    cleaning: "Household / chores",
    laundry: "Household / chores",
    errands: "Errands",
    errand: "Errands",
    shopping: "Errands",
    groceries: "Errands",
    meals: "Meals",
    meal: "Meals",
    dinner: "Meals",
    lunch: "Meals",
    breakfast: "Meals",
    cooking: "Meals",
    cook: "Meals",
    pet: "Pet care",
    pets: "Pet care",
    dog: "Pet care",
    "pet care": "Pet care",
    exercise: "Exercise",
    workout: "Exercise",
    gym: "Exercise",
    walk: "Exercise",
    social: "Social / communication",
    communication: "Social / communication",
    call: "Social / communication",
    message: "Social / communication",
    finance: "Finance / bills",
    bills: "Finance / bills",
    bill: "Finance / bills",
    banking: "Finance / bills",
    payment: "Finance / bills",
    design: "Design or creative",
    creative: "Design or creative",
    "design creative": "Design or creative",
    "design / creative": "Design or creative",
    "design or creative": "Design or creative",
    planning: "Planning",
    plan: "Planning",
    mixed: "Mixed work",
    "mixed work": "Mixed work"
  };
  return aliases[normalized] ?? value;
}

const taskTypeSchema = z.preprocess(normalizeTaskType, z.enum(taskTypeValues));

export const planStepDraftSchema = z.object({
  title: z.string().min(1),
  nextAction: z.string().min(1),
  explanation: z.string().min(1),
  deadlineText: z.string().optional().default(""),
  dueAt: z.string().nullable().optional(),
  reminderAt: z.string().nullable().optional(),
  taskType: taskTypeSchema.optional()
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
  breadcrumbRelevance: z.enum(["productive", "unproductive", "unknown"]),
  detectedTaskType: taskTypeSchema.optional()
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
