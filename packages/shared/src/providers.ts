import {
  analyzeScreenOutputSchema,
  atomizeStepOutputSchema,
  generatePlanOutputSchema,
  parseJsonObject
} from "./aiSchema.js";
import { atomizePrompt, planPrompt, screenAnalysisPrompt } from "./prompts.js";
import type {
  AIProvider,
  AnalyzeScreenInput,
  AnalyzeScreenOutput,
  AtomizeStepInput,
  AtomizeStepOutput,
  GeneratePlanInput,
  GeneratePlanOutput
} from "./types.js";

const plans = {
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
  ]
} as const;

const defaultPlan = (input: GeneratePlanInput): GeneratePlanOutput => ({
  steps: (plans[input.taskType] ?? plans["General writing"]).map(([title, nextAction, explanation]) => ({
    title,
    nextAction,
    explanation
  }))
});

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
    "Design or creative": /figma|canva|photoshop|illustrator|design|canvas|image|video|audio|editor|asset|prototype/i,
    Planning: /calendar|todo|task|notion|notes|planner|trello|linear|asana|schedule|plan/i
  };
  return (patterns[input.taskType] ?? patterns["General writing"]).test(text);
}

function looksDistracting(text: string): boolean {
  return /discord|youtube|tiktok|instagram|reddit|netflix|game|steam|chat/i.test(text);
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;

  async generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    return defaultPlan(input);
  }

  async analyzeScreen(input: AnalyzeScreenInput): Promise<AnalyzeScreenOutput> {
    const context = `${input.activeApp} ${input.windowTitle}`;
    const related = looksTaskRelated(input, context);
    const distracting = looksDistracting(context);
    const noChangeLong = !input.screenshotChangedSinceLastCapture && input.elapsedOnCurrentStepSeconds >= 60;

    if (input.thinkingPauseActive) {
      return {
        userState: "thinking",
        taskRelevance: related ? "on_task" : "unknown",
        progressState: "unknown",
        activeContext: context || "Unknown app",
        visibleChangeSummary: "Thinking pause is active.",
        conciseExplanation: "Got it. I’ll hold this step while you think.",
        suggestedNextAction: input.currentStep.nextAction,
        suggestedStepComplete: false,
        shouldIntervene: false,
        interventionType: "thinking_hold",
        urgency: "low",
        breadcrumbRelevance: "unknown"
      };
    }

    if (distracting) {
      return {
        userState: "unproductive_drift",
        taskRelevance: "off_task",
        progressState: input.screenshotChangedSinceLastCapture ? "changed" : "unchanged",
        activeContext: context,
        visibleChangeSummary: "The active window looks away from the essay.",
        conciseExplanation: "You’re away from the task. The next step is still here.",
        suggestedNextAction: input.currentStep.nextAction,
        suggestedStepComplete: false,
        shouldIntervene: input.elapsedInCurrentAppSeconds >= 60,
        interventionType: "drift_card",
        urgency: "medium",
        breadcrumbRelevance: "unproductive"
      };
    }

    if (related && input.screenshotChangedSinceLastCapture) {
      return {
        userState: "progress",
        taskRelevance: "on_task",
        progressState: "changed",
        activeContext: context,
        visibleChangeSummary: "The screen changed while a task-related window is active.",
        conciseExplanation: "This looks like progress. I’ll keep the step ready.",
        suggestedNextAction: input.currentStep.nextAction,
        suggestedStepComplete: input.elapsedOnCurrentStepSeconds > 180,
        shouldIntervene: false,
        interventionType: "none",
        urgency: "low",
        breadcrumbRelevance: "productive"
      };
    }

    if (related && noChangeLong) {
      return {
        userState: "stuck",
        taskRelevance: "on_task",
        progressState: "unchanged",
        activeContext: context,
        visibleChangeSummary: "The document has not visibly changed yet.",
        conciseExplanation: "Still with you. The document has not visibly changed yet. Try one small action.",
        suggestedNextAction: input.currentStep.nextAction,
        suggestedStepComplete: false,
        shouldIntervene: true,
        interventionType: "step_card",
        urgency: "medium",
        breadcrumbRelevance: "productive"
      };
    }

    if (related) {
      return {
        userState: "on_task",
        taskRelevance: "on_task",
        progressState: input.screenshotChangedSinceLastCapture ? "changed" : "unchanged",
        activeContext: context,
        visibleChangeSummary: "The active window appears related to the task.",
        conciseExplanation: "This looks related. I’ll keep the next step ready.",
        suggestedNextAction: input.currentStep.nextAction,
        suggestedStepComplete: false,
        shouldIntervene: false,
        interventionType: "none",
        urgency: "low",
        breadcrumbRelevance: "productive"
      };
    }

    return {
      userState: "unknown",
      taskRelevance: "unknown",
      progressState: input.screenshotChangedSinceLastCapture ? "changed" : "unchanged",
      activeContext: context || "Unknown app",
      visibleChangeSummary: "The current screen is hard to classify.",
      conciseExplanation: "No rush. I’ll keep the next step ready.",
      suggestedNextAction: input.currentStep.nextAction,
      suggestedStepComplete: false,
      shouldIntervene: false,
      interventionType: "none",
      urgency: "low",
      breadcrumbRelevance: "unknown"
    };
  }

  async atomizeStep(input: AtomizeStepInput): Promise<AtomizeStepOutput> {
    const ladder = [
      input.currentNextAction,
      "Click into the document.",
      input.taskType === "Coding" ? "Move your cursor to the editor or terminal." : "Move your cursor to the work area.",
      "Put your hand on the mouse or trackpad.",
      "Take one breath and look at the current window title."
    ];
    const level = Math.min(input.atomizationLevel + 1, ladder.length - 1);
    return {
      nextAction: ladder[level],
      explanation: "This is a smaller physical action. No extra decision is needed.",
      atomizationLevel: level
    };
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
    return generatePlanOutputSchema.parse(parseJsonObject(content));
  }

  async analyzeScreen(input: AnalyzeScreenInput): Promise<AnalyzeScreenOutput> {
    const content = await this.chat(screenAnalysisPrompt(input));
    return analyzeScreenOutputSchema.parse(parseJsonObject(content));
  }

  async atomizeStep(input: AtomizeStepInput): Promise<AtomizeStepOutput> {
    const content = await this.chat(atomizePrompt(input));
    return atomizeStepOutputSchema.parse(parseJsonObject(content));
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
