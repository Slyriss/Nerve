/**
 * AnalysisService — analysis layer
 *
 * Thin wrapper around the active AIProvider that:
 *  - Keeps provider selection in one place (calls the factory on every
 *    request so settings changes are always picked up immediately)
 *  - Separates AI I/O concerns from the orchestrator in main.ts
 *  - Makes the AI surface easy to swap or mock in future
 */

import type {
  AIProvider,
  AnalyzeScreenInput,
  AnalyzeScreenOutput,
  AtomizeStepInput,
  AtomizeStepOutput,
  GeneratePlanInput,
  GeneratePlanOutput,
} from "@nerve/shared";

export class AnalysisService {
  constructor(private readonly getProvider: () => AIProvider) {}

  get providerName(): string {
    return this.getProvider().name;
  }

  analyzeScreen(input: AnalyzeScreenInput): Promise<AnalyzeScreenOutput> {
    return this.getProvider().analyzeScreen(input);
  }

  generatePlan(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    return this.getProvider().generatePlan(input);
  }

  atomizeStep(input: AtomizeStepInput): Promise<AtomizeStepOutput> {
    return this.getProvider().atomizeStep(input);
  }
}
