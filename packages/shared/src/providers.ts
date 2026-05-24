import {
  analyzeScreenOutputSchema,
  generatePlanOutputSchema,
  parseJsonObject
} from "./aiSchema.js";
import { planPrompt, screenAnalysisPrompt } from "./prompts.js";
import type {
  AIProvider,
  AIProviderName,
  AnalyzeScreenInput,
  AnalyzeScreenOutput,
  GeneratePlanInput,
  GeneratePlanOutput,
  TaskType
} from "./types.js";

type PlanTuple = readonly [string, string, string];

const plans: Record<TaskType, readonly PlanTuple[]> = {
  "Essay writing": [
    ["Open or focus the essay document", "Click into the essay document.", "Start by getting the writing surface in front of you."],
    ["Write a rough thesis sentence", "Write one rough sentence that says what the essay will argue.", "It can be messy; it only needs to exist."],
    ["Draft the introduction", "Write one rough opening sentence.", "A rough sentence is enough to restart."],
    ["Add 3 bullet points for the main argument", "Type three short bullet points under the introduction.", "Short fragments are enough."],
    ["Expand bullet point 1 into a paragraph", "Turn the first bullet into two rough sentences.", "Keep it plain and unfinished."],
    ["Expand bullet point 2 into a paragraph", "Turn the second bullet into two rough sentences.", "One small paragraph at a time."],
    ["Expand bullet point 3 into a paragraph", "Turn the third bullet into two rough sentences.", "Use simple wording first."],
    ["Write a rough conclusion", "Write one sentence that returns to the thesis.", "This can be a placeholder."],
    ["Do a quick clarity pass", "Read the introduction and fix one unclear phrase.", "Only one small pass for now."],
    ["Save/export/submit if relevant", "Save the document or prepare the file for submission.", "Finish with the practical handoff."]
  ],
  "General writing": [
    ["Open the writing surface", "Click into the document or note where this belongs.", "Start by putting the task in front of you."],
    ["Write one rough opening line", "Type one imperfect first sentence.", "A rough line lowers the start-up cost."],
    ["Add three rough points", "Write three short bullets for what needs to be included.", "Fragments are enough."],
    ["Expand the first point", "Turn the first bullet into two sentences.", "Keep the draft plain."],
    ["Expand the next point", "Turn the next bullet into two sentences.", "Move one small piece forward."],
    ["Add a closing line", "Write one sentence that finishes the thought.", "It can be a placeholder."],
    ["Do one clarity pass", "Fix one unclear phrase.", "One pass is enough for now."]
  ],
  Coding: [
    ["Open the project", "Bring the editor or terminal with the project into view.", "Start by getting the work surface ready."],
    ["Find the current task file", "Open the file or error location most likely related to the goal.", "One file is enough to begin."],
    ["Run the smallest check", "Run the relevant app, test, or typecheck command.", "Let the system show the next clue."],
    ["Make one focused edit", "Change the smallest code block that addresses the issue.", "Keep the edit narrow."],
    ["Save and rerun the check", "Save the file and rerun the same check.", "Verify the change before widening scope."],
    ["Read the next error or result", "Look at the first failing line or success output.", "Use one result at a time."],
    ["Record the next follow-up", "Write down the next tiny fix or verification step.", "Leave a clear handoff for yourself."]
  ],
  Research: [
    ["Open the research source", "Open one article, PDF, note, or search result related to the goal.", "One source is enough to begin."],
    ["Read one small section", "Read the title, abstract, or first relevant paragraph.", "Keep the reading bounded."],
    ["Capture one useful note", "Write one sentence or quote summary in your notes.", "One note creates traction."],
    ["Mark relevance", "Add a short note on why this source matters or does not.", "This prevents vague collecting."],
    ["Find one supporting detail", "Look for one fact, concept, or citation you can use.", "A single detail is progress."],
    ["Summarize the source", "Write a two-sentence summary.", "Keep it rough and usable."],
    ["Choose the next source or stop", "Pick one next source or return to the main task.", "Make the next move explicit."]
  ],
  Study: [
    ["Open the study material", "Bring the lecture, notes, or textbook section into view.", "Start with the material visible."],
    ["Pick one small section", "Choose one heading, slide, or problem.", "Keep the scope small."],
    ["Read or attempt one item", "Read one paragraph or try one question.", "One item is enough."],
    ["Write one recall note", "Write what you remember in one sentence.", "Recall beats rereading."],
    ["Check the answer or notes", "Compare your note with the source.", "Use the source as feedback."],
    ["Fix one gap", "Add one missing detail or correction.", "Close one loop."],
    ["Choose the next item", "Move to the next heading, slide, or question.", "Continue in small steps."]
  ],
  "Email or admin": [
    ["Open the required place", "Open the inbox, form, portal, or document for this task.", "Start with the destination visible."],
    ["Find the relevant item", "Click the message, form field, or file that matters.", "One item at a time."],
    ["Draft the first line", "Type one plain first sentence or fill one field.", "A rough start is enough."],
    ["Add the required detail", "Enter one date, attachment, answer, or decision.", "Move one concrete piece."],
    ["Review the visible fields", "Check the next required field or sentence.", "Look only for what is missing."],
    ["Prepare to send or save", "Click the save, preview, or draft area without submitting yet.", "Pause before the final action."],
    ["Finish the handoff", "Send, save, file, or record the next follow-up if ready.", "Complete the practical loop."]
  ],
  Presentation: [
    ["Open the presentation file", "Bring the slide deck or notes into view.", "Start with the deck visible."],
    ["Name the audience and point", "Write one sentence for what the presentation needs to show.", "Anchor the deck before polishing."],
    ["Draft the slide sequence", "Add or review the main slide titles.", "Structure comes before visuals."],
    ["Fill one slide", "Add one rough bullet or visual to the current slide.", "One slide at a time."],
    ["Check the required deadline/export", "Look at the submit, share, or presentation requirement.", "Keep the final handoff visible."],
    ["Do one rehearsal pass", "Read one slide aloud or check one transition.", "A tiny rehearsal catches gaps."],
    ["Export or prepare to present", "Save, export, or leave the deck ready to share.", "Close the practical loop."]
  ],
  "Personal / life": [
    ["Check the next personal time anchor", "Look at the next timed personal task or reminder.", "Personal needs count as real obligations."],
    ["Prepare for the next routine task", "Put the needed item, app, room, or timer in front of you.", "Make the next action visible."],
    ["Do the first small physical move", "Stand up, pick up the item, or move toward the right place.", "Starting can be the whole step."],
    ["Complete one personal task", "Do the next concrete action for the meal, pet, shower, errand, chore, or appointment.", "Keep it direct and kind."],
    ["Reset the space", "Put away one item or leave one note for what is next.", "A small reset protects the next transition."],
    ["Return or transition", "Open the next task, reminder, or work surface.", "The handoff is part of the session."],
    ["Mark the task done", "Mark this item complete or write the next reminder.", "Close the loop gently."]
  ],
  "Health / self-care": [
    ["Prepare the self-care step", "Move toward the room, item, or timer needed.", "Body care counts as real work."],
    ["Start the first physical action", "Stand up or put the needed item in reach.", "The transition is the first step."],
    ["Complete the care action", "Do the shower, medication, break, hygiene, or rest step.", "Keep it simple and kind."],
    ["Reset for the next task", "Put one item away or set one timer.", "Leave an easy re-entry point."]
  ],
  "Household / chores": [
    ["Choose the smallest visible area", "Look at one surface, basket, sink, or item.", "One visible spot is enough."],
    ["Move one item", "Pick up, put away, wash, or sort one thing.", "A single physical move starts the chore."],
    ["Set a short boundary", "Start a timer or decide the tiny stopping point.", "Keep it contained."],
    ["Close the chore loop", "Put away one tool or mark the chore done.", "End with a small reset."]
  ],
  Errands: [
    ["Check the errand requirement", "Look at the address, item, pickup, return, or opening time.", "Know the practical constraint."],
    ["Prepare the needed item", "Put the keys, wallet, bag, document, or list in reach.", "Prep prevents a second start."],
    ["Start the route or order", "Open maps, the store page, or the errand note.", "Move one step toward the errand."],
    ["Record completion", "Mark the errand done or write the next pickup/return step.", "Close the loop."]
  ],
  Meals: [
    ["Choose the meal path", "Open the recipe, delivery app, kitchen, or food item.", "Food is a valid task."],
    ["Start meal prep", "Take out one ingredient, plate, pan, or ordering screen.", "Make the next action physical."],
    ["Eat or finish ordering", "Prepare, order, or eat the meal.", "No shame; fuel helps the session."],
    ["Reset after the meal", "Put away one item or note the next task.", "Transition gently."]
  ],
  "Pet care": [
    ["Check the pet task", "Look at what the pet needs: walk, food, water, cleaning, or appointment.", "Pet care is part of the plan."],
    ["Prepare the pet item", "Pick up the leash, bowl, bag, toy, carrier, or note.", "Prep is the first movement."],
    ["Do the care action", "Feed, walk, clean, refill, or prepare the pet task.", "Keep attention on one care action."],
    ["Reset and return", "Put away one item or mark the pet task done.", "Leave a clear handoff."]
  ],
  Exercise: [
    ["Prepare to move", "Put shoes, clothes, mat, water, or timer in reach.", "Setup is a real start."],
    ["Start one movement", "Stand up, stretch once, or start the timer.", "One movement is enough to begin."],
    ["Complete the planned movement", "Do the walk, workout, stretch, or exercise block.", "Keep it bounded."],
    ["Cool down or record it", "Drink water, stop the timer, or mark it done.", "Close the loop."]
  ],
  "Social / communication": [
    ["Open the conversation", "Open the message, call, invite, or note.", "Start with the actual thread."],
    ["Write or say one plain line", "Type one sentence or prepare one call point.", "Plain is enough."],
    ["Send or schedule the communication", "Send, call, schedule, or save the draft.", "Make the social step concrete."],
    ["Return to the next task", "Close the thread or write the follow-up reminder.", "Protect the transition."]
  ],
  "Finance / bills": [
    ["Open the bill or money task", "Open the bill, invoice, bank, budget, or payment page.", "Use the official place."],
    ["Check the amount and due date", "Read the amount, account, and due date once.", "Accuracy matters here."],
    ["Complete one safe action", "Pay, schedule, download, or record one finance item.", "Take one careful step."],
    ["Save confirmation", "Save, screenshot, or note the confirmation/reference.", "Close the finance loop."]
  ],
  "Design or creative": [
    ["Open the canvas or asset", "Bring the design file, editor, or reference into view.", "Start with the work surface visible."],
    ["Choose one element", "Select one layer, section, clip, or object to work on.", "One element keeps the task small."],
    ["Make one visible change", "Adjust one color, size, word, position, or cut.", "A visible change creates momentum."],
    ["Compare against the goal", "Look at the change and name one thing to keep or change.", "Use the goal as the anchor."],
    ["Refine one detail", "Make one small adjustment to the selected element.", "Polish one piece only."],
    ["Save a version", "Save or duplicate the current version.", "Protect the progress."],
    ["Export or note next step", "Export a draft or write the next edit needed.", "Leave the work easy to resume."]
  ],
  Planning: [
    ["Open a planning surface", "Open notes, calendar, task app, or a blank document.", "Get one place to hold the plan."],
    ["Write the desired outcome", "Write one sentence describing what done looks like.", "Make the endpoint visible."],
    ["List three constraints", "Add up to three bullets for time, requirements, or blockers.", "Only the obvious constraints."],
    ["Choose the first next action", "Pick one action that can be done physically next.", "Avoid solving the whole plan."],
    ["Assign a time or place", "Put the action on a calendar, list, or note.", "Give it a home."],
    ["Identify one blocker", "Write one thing that might interrupt the plan.", "Name it without solving everything."],
    ["Save the plan", "Save, pin, or leave the plan visible.", "Make it easy to return."]
  ],
  "Mixed work": [
    ["Open the main work surface", "Bring the main document, editor, inbox, or task note into view.", "Start with the place that anchors the session."],
    ["Name the current lane", "Write or select the one lane you are working in first: writing, coding, admin, presentation, research, study, personal/life, health, chores, errands, meals, pet care, exercise, social, finance, design, or planning.", "This keeps mixed work from becoming a blur."],
    ["Finish one tiny action in that lane", "Do the next physical action for the current lane.", "One lane gets one small move."],
    ["Record the handoff", "Write one short note about what changed or what remains.", "This protects context before switching."],
    ["Switch to the next needed lane", "Open the next relevant app or document for the next scope.", "Switching is allowed when it is part of the plan."],
    ["Do one tiny action in the new lane", "Complete one physical action in the new scope.", "Keep the switch contained."],
    ["Close the loop", "Save, mark done, or write the next follow-up.", "End with a clear resume point."]
  ]
} as const;

const defaultPlan = (input: GeneratePlanInput): GeneratePlanOutput => ({
  steps: buildPlan(input).map(({ draft: [title, nextAction, explanation], taskType }) => ({
    title,
    nextAction,
    explanation,
    taskType,
    deadlineText: "",
    dueAt: null,
    reminderAt: null
  }))
});

function normalizeScopes(input: Pick<GeneratePlanInput | AnalyzeScreenInput, "taskType"> & { taskTypes?: TaskType[]; sessionTaskTypes?: TaskType[] }) {
  const scopes = input.taskTypes ?? input.sessionTaskTypes ?? [input.taskType];
  const valid = scopes.filter((scope) => scope !== "Mixed work");
  return valid.length ? valid : [input.taskType === "Mixed work" ? "General writing" : input.taskType];
}

function buildPlan(input: GeneratePlanInput) {
  const scopes = normalizeScopes(input);
  if (input.taskType !== "Mixed work" && scopes.length <= 1) {
    const taskType = scopes[0] ?? input.taskType;
    return (plans[taskType] ?? plans["General writing"]).map((draft) => ({ draft, taskType }));
  }
  const plan = [
    { draft: plans["Mixed work"][0], taskType: "Planning" as TaskType },
    { draft: plans["Mixed work"][1], taskType: "Planning" as TaskType }
  ];
  for (const scope of scopes) {
    const template = plans[scope] ?? plans["General writing"];
    plan.push(
      { draft: template[0], taskType: scope },
      { draft: template[Math.min(2, template.length - 1)], taskType: scope },
      { draft: template[Math.min(4, template.length - 1)], taskType: scope }
    );
  }
  plan.push({ draft: plans["Mixed work"][3], taskType: "Planning" as TaskType });
  return plan;
}

function looksTaskRelated(input: AnalyzeScreenInput, text: string): boolean {
  const goalWords = input.sessionGoal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  if (goalWords.some((word) => text.toLowerCase().includes(word))) return true;

  const patterns: Record<string, RegExp> = {
    "Essay writing": /essay|word|doc|docs|notion|notes|research|article|pdf|citation|library|media|study|journal|paper/i,
    "General writing": /word|doc|docs|notion|notes|draft|editor|markdown|paper|writing/i,
    Coding: /code|codex|vscode|visual studio|terminal|powershell|github|git|issue|localhost|docs|api|stack|error|test|typescript|python/i,
    Research: /research|article|pdf|journal|paper|library|scholar|notes|citation|zotero|source|search/i,
    Study: /course|lecture|slides|notes|quiz|assignment|canvas|classroom|study|textbook|pdf/i,
    "Email or admin": /mail|outlook|gmail|calendar|form|portal|drive|invoice|application|admin|settings|account/i,
    Presentation: /presentation|slides|deck|powerpoint|keynote|rehearsal|present/i,
    "Personal / life": /calendar|alarm|timer|maps|weather|routine|personal/i,
    "Health / self-care": /shower|hygiene|medication|medicine|health|doctor|therapy|sleep|nap|break|self care|self-care/i,
    "Household / chores": /laundry|clean|dishes|trash|tidy|chores|household|vacuum|room/i,
    Errands: /errand|pickup|return|store|shopping|groceries|maps|pharmacy|post office/i,
    Meals: /meal|dinner|lunch|breakfast|cook|recipe|eat|food|delivery|kitchen/i,
    "Pet care": /dog|cat|pet|walk|leash|feed|vet|litter|animal/i,
    Exercise: /exercise|workout|gym|stretch|run|walk|yoga|fitness/i,
    "Social / communication": /message|chat|call|text|discord|whatsapp|wechat|email|social|reply/i,
    "Finance / bills": /bank|bill|payment|invoice|budget|rent|subscription|finance|tax/i,
    "Design or creative": /figma|canva|photoshop|illustrator|design|canvas|image|video|audio|editor|asset|prototype/i,
    Planning: /calendar|todo|task|notion|notes|planner|trello|linear|asana|schedule|plan/i
  };
  return normalizeScopes(input).some((scope) => (patterns[scope] ?? patterns["General writing"]).test(text));
}

function detectTaskType(input: AnalyzeScreenInput, text: string): TaskType {
  const patterns: Record<string, RegExp> = {
    "Essay writing": /essay|thesis|introduction|conclusion|citation|paper/i,
    "General writing": /word|doc|docs|notion|notes|draft|editor|markdown|writing/i,
    Coding: /code|codex|vscode|visual studio|terminal|powershell|github|git|localhost|api|error|test|typescript|python/i,
    Research: /research|article|pdf|journal|paper|library|scholar|citation|zotero|source|search/i,
    Study: /course|lecture|slides|quiz|assignment|canvas|classroom|textbook/i,
    "Email or admin": /mail|outlook|gmail|calendar|form|portal|drive|invoice|application|account/i,
    Presentation: /presentation|slides|deck|powerpoint|keynote|rehearsal|present/i,
    "Personal / life": /calendar|alarm|timer|maps|routine|personal/i,
    "Health / self-care": /shower|hygiene|medication|medicine|health|doctor|therapy|sleep|nap|break|self care|self-care/i,
    "Household / chores": /laundry|clean|dishes|trash|tidy|chore|household|vacuum|room/i,
    Errands: /errand|pickup|return|store|shopping|groceries|maps|pharmacy|post office/i,
    Meals: /meal|dinner|lunch|breakfast|cook|recipe|eat|food|delivery|kitchen/i,
    "Pet care": /dog|cat|pet|walk|leash|feed|vet|litter|animal/i,
    Exercise: /exercise|workout|gym|stretch|run|walk|yoga|fitness/i,
    "Social / communication": /message|chat|call|text|discord|whatsapp|wechat|social|reply/i,
    "Finance / bills": /bank|bill|payment|invoice|budget|rent|subscription|finance|tax/i,
    "Design or creative": /figma|canva|photoshop|illustrator|design|canvas|image|video|audio|prototype/i,
    Planning: /calendar|todo|task|planner|trello|linear|asana|schedule|plan/i
  };
  return normalizeScopes(input).find((scope) => (patterns[scope] ?? /$a/).test(text)) ?? input.currentStep.taskType ?? input.taskType;
}

function looksDistracting(text: string): boolean {
  return /discord|youtube|tiktok|instagram|reddit|netflix|game|steam|chat/i.test(text);
}

function compactActivityPlan(input: GeneratePlanInput, output: GeneratePlanOutput): GeneratePlanOutput {
  const explicitActivityCount = input.goal
    .split(/\s*(?:,|;|\band\b|\n)+\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 8 && /\b(need|finish|write|prepare|walk|shower|dinner|lunch|breakfast|call|pay|clean|submit|complete|do|make|send)\b/i.test(part))
    .length;
  if (explicitActivityCount < 2 || output.steps.length <= explicitActivityCount + 2) return output;

  const groups = new Map<string, GeneratePlanOutput["steps"][number]>();
  for (const step of output.steps) {
    const dueKey = step.dueAt || step.deadlineText || "none";
    const taskKey = step.taskType || "General writing";
    const keyword =
      /slide|presentation|deck/i.test(`${step.title} ${step.nextAction}`) ? "slides" :
      /script/i.test(`${step.title} ${step.nextAction}`) ? "script" :
      /dog|pet|walk/i.test(`${step.title} ${step.nextAction}`) ? "dog" :
      /shower|hygiene/i.test(`${step.title} ${step.nextAction}`) ? "shower" :
      /dinner|lunch|breakfast|meal/i.test(`${step.title} ${step.nextAction}`) ? "meal" :
      step.title.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    const key = `${taskKey}|${dueKey}|${keyword}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...step });
    } else {
      groups.set(key, {
        ...existing,
        title: chooseActivityTitle(existing.title, step.title),
        nextAction: existing.nextAction,
        explanation: existing.explanation || step.explanation,
        dueAt: existing.dueAt || step.dueAt,
        reminderAt: existing.reminderAt || step.reminderAt,
        deadlineText: existing.deadlineText || step.deadlineText,
        routineIntervalMinutes: existing.routineIntervalMinutes || step.routineIntervalMinutes,
        routineNextAt: existing.routineNextAt || step.routineNextAt
      });
    }
  }
  const compacted = [...groups.values()];
  return compacted.length < output.steps.length ? { steps: compacted } : output;
}

function chooseActivityTitle(a: string, b: string) {
  const score = (text: string) => (/open|review|add one|first|prepare|return|save|export/i.test(text) ? 0 : 1) + Math.min(text.length / 100, 1);
  return score(b) > score(a) ? b : a;
}

const userStates = ["on_task", "productive_drift", "unproductive_drift", "stuck", "thinking", "progress", "unknown"] as const;
const taskRelevanceValues = ["on_task", "possibly_related", "off_task", "unknown"] as const;
const progressStateValues = ["changed", "unchanged", "complete_suggested", "unknown"] as const;
const interventionTypes = ["none", "step_card", "drift_card", "thinking_hold"] as const;
const urgencyValues = ["low", "medium"] as const;
const breadcrumbRelevanceValues = ["productive", "unproductive", "unknown"] as const;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const normalized = stringValue(value).toLowerCase().replace(/[\s-]+/g, "_");
  return allowed.find((item) => item.toLowerCase() === normalized || item.toLowerCase().replace(/[\s-]+/g, "_") === normalized) ?? fallback;
}

function parsePlanContent(content: string, input: GeneratePlanInput): GeneratePlanOutput | null {
  try {
    const payload = parseJsonObject(content);
    const parsed = generatePlanOutputSchema.safeParse(payload);
    if (parsed.success) return compactActivityPlan(input, parsed.data);

    const root = objectValue(payload);
    const rawSteps = Array.isArray(payload)
      ? payload
      : Array.isArray(root?.steps)
        ? root.steps
        : Array.isArray(root?.activities)
          ? root.activities
          : Array.isArray(root?.tasks)
            ? root.tasks
            : Array.isArray(root?.plan)
              ? root.plan
              : [];
    if (!rawSteps.length) return null;

    const repaired = {
      steps: rawSteps
        .map((raw) => {
          const step = objectValue(raw);
          if (!step) return null;
          const title = stringValue(pickValue(step, ["title", "activity", "task", "name", "summary"]));
          const nextAction = stringValue(
            pickValue(step, ["nextAction", "next_action", "action", "firstAction", "first_action", "guidance"]),
            title ? `Open the relevant place and start: ${title}.` : ""
          );
          if (!title || !nextAction) return null;
          return {
            title,
            nextAction,
            explanation: stringValue(pickValue(step, ["explanation", "reason", "why", "note"]), "One small step is enough."),
            taskType: pickValue(step, ["taskType", "task_type", "type", "scope", "category"]) ?? input.taskType,
            deadlineText: stringValue(pickValue(step, ["deadlineText", "deadline_text", "deadline", "dueText", "due_text"])),
            dueAt: pickValue(step, ["dueAt", "due_at", "due", "deadlineAt", "deadline_at"]) ?? null,
            reminderAt: pickValue(step, ["reminderAt", "reminder_at", "remindAt", "remind_at"]) ?? null,
            routineIntervalMinutes: pickValue(step, ["routineIntervalMinutes", "routine_interval_minutes", "repeatIntervalMinutes", "repeat_interval_minutes", "intervalMinutes", "interval_minutes"]) ?? null,
            routineNextAt: pickValue(step, ["routineNextAt", "routine_next_at", "nextRoutineAt", "next_routine_at", "repeatNextAt", "repeat_next_at"]) ?? null
          };
        })
        .filter(Boolean)
    };
    const repairedParsed = generatePlanOutputSchema.safeParse(repaired);
    return repairedParsed.success ? compactActivityPlan(input, repairedParsed.data) : null;
  } catch {
    return null;
  }
}

function parseAnalyzeContent(content: string, input: AnalyzeScreenInput): AnalyzeScreenOutput | null {
  try {
    const payload = parseJsonObject(content);
    const parsed = analyzeScreenOutputSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
    const root = objectValue(payload);
    if (!root) return null;
    const userState = enumValue(pickValue(root, ["userState", "user_state", "state", "classification"]), userStates, input.thinkingPauseActive ? "thinking" : "unknown");
    const shouldIntervene = booleanValue(
      pickValue(root, ["shouldIntervene", "should_intervene", "intervene"]),
      userState === "stuck" || userState === "unproductive_drift"
    );
    const repaired = {
      userState,
      taskRelevance: enumValue(pickValue(root, ["taskRelevance", "task_relevance", "relevance"]), taskRelevanceValues, userState === "unproductive_drift" ? "off_task" : "unknown"),
      progressState: enumValue(pickValue(root, ["progressState", "progress_state", "progress"]), progressStateValues, "unknown"),
      activeContext: stringValue(pickValue(root, ["activeContext", "active_context", "context"]), `${input.activeApp}: ${input.windowTitle}`),
      visibleChangeSummary: stringValue(pickValue(root, ["visibleChangeSummary", "visible_change_summary", "changeSummary", "change_summary"]), input.screenshotChangedSinceLastCapture ? "The screen changed since the last capture." : "The screen did not visibly change."),
      conciseExplanation: stringValue(pickValue(root, ["conciseExplanation", "concise_explanation", "explanation", "message"]), "I’ll keep the next step ready."),
      suggestedNextAction: stringValue(pickValue(root, ["suggestedNextAction", "suggested_next_action", "nextAction", "next_action"]), input.currentStep.nextAction),
      suggestedStepComplete: booleanValue(pickValue(root, ["suggestedStepComplete", "suggested_step_complete", "stepComplete", "step_complete"]), false),
      shouldIntervene,
      interventionType: enumValue(pickValue(root, ["interventionType", "intervention_type"]), interventionTypes, shouldIntervene ? "step_card" : "none"),
      urgency: enumValue(pickValue(root, ["urgency"]), urgencyValues, "low"),
      breadcrumbRelevance: enumValue(pickValue(root, ["breadcrumbRelevance", "breadcrumb_relevance", "driftRelevance", "drift_relevance"]), breadcrumbRelevanceValues, "unknown"),
      detectedTaskType: pickValue(root, ["detectedTaskType", "detected_task_type", "taskType", "task_type"]) ?? undefined
    };
    const repairedParsed = analyzeScreenOutputSchema.safeParse(repaired);
    return repairedParsed.success ? repairedParsed.data : null;
  } catch {
    return null;
  }
}

export class ClaudeAIProvider implements AIProvider {
  readonly name = "claude" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = "claude-haiku-4-5"
  ) {}

  async generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    const content = await this.chat(planPrompt(input));
    const parsed = parsePlanContent(content, input);
    if (parsed) return parsed;
    const repairContent = await this.chat(
      `${planPrompt(input)}

The previous response did not meet the required contract. Return strict JSON only. If the user's text contains distinct activities, return one row per activity. Every row must include title, nextAction, explanation, taskType, deadlineText, dueAt, reminderAt, routineIntervalMinutes, and routineNextAt. Use null for dueAt/reminderAt/routineIntervalMinutes/routineNextAt when not applicable.`
    );
    const repaired = parsePlanContent(repairContent, input);
    if (repaired) return repaired;
    return compactActivityPlan(input, generatePlanOutputSchema.parse(parseJsonObject(repairContent)));
  }

  async analyzeScreen(input: AnalyzeScreenInput): Promise<AnalyzeScreenOutput> {
    const content = await this.chat(screenAnalysisPrompt(input));
    const parsed = parseAnalyzeContent(content, input);
    if (parsed) return parsed;
    const repairContent = await this.chat(
      `${screenAnalysisPrompt(input)}

The previous response did not meet the required contract. Return strict JSON only, with every required key present. Use the exact enum values from the schema.`
    );
    const repaired = parseAnalyzeContent(repairContent, input);
    if (repaired) return repaired;
    return analyzeScreenOutputSchema.parse(parseJsonObject(repairContent));
  }

  private async chat(prompt: string, retries = 1): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Claude API key is missing.");
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: "Return strict JSON only. You are calm, concise, and shame-reducing.",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      if (retries > 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        return this.chat(prompt, retries - 1);
      }
      throw new Error(`Claude request failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const content = data.content?.find((block) => block.type === "text")?.text;
    if (!content) {
      throw new Error("Claude returned no content.");
    }
    return content;
  }
}

/** Tries the primary provider; falls back to the secondary on any network/server error. */
export class FallbackAIProvider implements AIProvider {
  readonly name: AIProviderName;

  constructor(
    private readonly primary: AIProvider,
    private readonly secondary: AIProvider | null
  ) {
    this.name = primary.name;
  }

  async generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    try {
      return await this.primary.generatePlan(input);
    } catch (err) {
      if (this.secondary) {
        console.warn(`[Nerve] Primary provider (${this.primary.name}) failed for generatePlan, falling back to ${this.secondary.name}:`, err);
        return this.secondary.generatePlan(input);
      }
      throw err;
    }
  }

  async analyzeScreen(input: AnalyzeScreenInput): Promise<AnalyzeScreenOutput> {
    try {
      return await this.primary.analyzeScreen(input);
    } catch (err) {
      if (this.secondary) {
        console.warn(`[Nerve] Primary provider (${this.primary.name}) failed for analyzeScreen, falling back to ${this.secondary.name}:`, err);
        return this.secondary.analyzeScreen(input);
      }
      throw err;
    }
  }
}

export class DeepSeekAIProvider implements AIProvider {
  readonly name = "deepseek" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = "deepseek-chat"
  ) {}

  async generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    const content = await this.chat(planPrompt(input));
    const parsed = parsePlanContent(content, input);
    if (parsed) return parsed;
    const repairContent = await this.chat(
      `${planPrompt(input)}

The previous response did not meet the required contract. Return strict JSON only. If the user's text contains distinct activities, return one row per activity. Every row must include title, nextAction, explanation, taskType, deadlineText, dueAt, reminderAt, routineIntervalMinutes, and routineNextAt. Use null for dueAt/reminderAt/routineIntervalMinutes/routineNextAt when not applicable.`
    );
    const repaired = parsePlanContent(repairContent, input);
    if (repaired) return repaired;
    return compactActivityPlan(input, generatePlanOutputSchema.parse(parseJsonObject(repairContent)));
  }

  async analyzeScreen(input: AnalyzeScreenInput): Promise<AnalyzeScreenOutput> {
    const content = await this.chat(screenAnalysisPrompt(input));
    const parsed = parseAnalyzeContent(content, input);
    if (parsed) return parsed;
    const repairContent = await this.chat(
      `${screenAnalysisPrompt(input)}

The previous response did not meet the required contract. Return strict JSON only, with every required key present. Use the exact enum values from the schema.`
    );
    const repaired = parseAnalyzeContent(repairContent, input);
    if (repaired) return repaired;
    return analyzeScreenOutputSchema.parse(parseJsonObject(repairContent));
  }

  private async chat(prompt: string, retries = 1): Promise<string> {
    if (!this.apiKey) {
      throw new Error("DeepSeek API key is missing.");
    }
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "Return strict JSON only. You are calm, concise, and shame-reducing."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      if (retries > 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        return this.chat(prompt, retries - 1);
      }
      throw new Error(`DeepSeek request failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DeepSeek returned no content.");
    }
    return content;
  }
}
