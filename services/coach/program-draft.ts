/**
 * Program Draft Generation Service
 * 
 * This module handles profile-driven draft program generation using the LLM.
 * The generation flow:
 * 1. resolveDraftInputs() - merges user profile with defaults
 * 2. buildProgramDraftRequest() - creates prompt and LLM input from profile
 * 3. Coach invokes LLM with the prompt
 * 4. prepareProgramDraftFromModelResponse() - parses and validates LLM response
 * 
 * NOTE: The deterministic generateProgramDraft() stub has been removed.
 * All program generation must go through the LLM-based flow.
 */

import { PROGRAM_GENERATION_DEFAULTS, getGenerationConfig, type GenerationConfig } from '@/constants/program-generation-defaults';
import exerciseSelectionCatalog from '@/data/exerciseSelection.json';
import { buildProgramDraftContext } from '@/services/coach/program-draft-context';
import { buildProgramDraftSystemPrompt } from '@/services/coach/program-draft-prompt';
import { validateAndRepairProgramDraft } from '@/services/coach/program-draft-validator';
import type { DraftProgram, ExperienceLevel, Program, ProgramExercise, TrainingGoal } from '@/types';

type DraftInput = {
  experienceLevel: ExperienceLevel | null;
  trainingDaysPerWeek: number | null;
  sessionDurationMinutes: number | null;
  trainingGoal?: TrainingGoal | null;
};

type ResolvedDraftInput = {
  experienceLevel: ExperienceLevel;
  trainingDaysPerWeek: number;
  sessionDurationMinutes: number;
  trainingGoal: TrainingGoal | null;
};

export type ProgramDraftLLMInput = {
  profile: ResolvedDraftInput;
  config: GenerationConfig;
  allowed_exercises: {
    name: string;
    equipment: string;
    muscle_groups_worked: string[];
    isCompound: boolean;
    variantOptions?: { label: string; field?: string; value?: string }[];
    aliases?: string[];
  }[];
  progression_defaults: {
    compoundBarbell: number;
    compoundDumbbell: number;
    isolationBarbell: number;
    isolationDumbbell: number;
    threshold: number;
  };
  output_schema_version: 1;
};

/**
 * Resolves draft inputs with defaults for any missing values
 */
const resolveDraftInputs = (input: DraftInput): ResolvedDraftInput => ({
  experienceLevel: input.experienceLevel ?? PROGRAM_GENERATION_DEFAULTS.experienceLevel,
  trainingDaysPerWeek: input.trainingDaysPerWeek ?? PROGRAM_GENERATION_DEFAULTS.trainingDaysPerWeek,
  sessionDurationMinutes: input.sessionDurationMinutes ?? PROGRAM_GENERATION_DEFAULTS.sessionDurationMinutes,
  trainingGoal: input.trainingGoal ?? null,
});

/**
 * Builds a program draft request for the LLM.
 * 
 * @param input - User profile inputs (may be partial - defaults will be applied)
 * @returns The prompt for the LLM and the structured input data
 */
export const buildProgramDraftRequest = (input: DraftInput): { 
  prompt: string; 
  llmInput: ProgramDraftLLMInput 
} => {
  const resolved = resolveDraftInputs(input);
  const config = getGenerationConfig({
    experienceLevel: resolved.experienceLevel,
    trainingDaysPerWeek: resolved.trainingDaysPerWeek,
    sessionDurationMinutes: resolved.sessionDurationMinutes,
    trainingGoal: resolved.trainingGoal,
  });
  
  const context = buildProgramDraftContext(resolved, exerciseSelectionCatalog);

  return {
    prompt: buildProgramDraftSystemPrompt(context.profile.trainingGoal),
    llmInput: {
      profile: context.profile,
      config,
      allowed_exercises: context.allowedExercises,
      progression_defaults: context.progressionDefaults,
      output_schema_version: 1,
    },
  };
};

/**
 * Parses and validates the LLM response to produce a program draft.
 * 
 * @param responseText - Raw text response from the LLM
 * @returns Validated program draft (ready for user preview)
 * @throws Error if response cannot be parsed into a valid program
 */
export const prepareProgramDraftFromModelResponse = (responseText: string): DraftProgram => {
  const validatedDraft = validateAndRepairProgramDraft(responseText);

  if (!validatedDraft.ok) {
    throw new Error(`Program draft was not ingestible: ${validatedDraft.error}`);
  }

  return validatedDraft.value;
};

/**
 * Gets the generation configuration for a given set of inputs.
 * Useful for UI to display what settings will be used before generating.
 */
export const getGenerationConfiguration = (input: DraftInput): GenerationConfig => {
  const resolved = resolveDraftInputs(input);
  return getGenerationConfig({
    experienceLevel: resolved.experienceLevel,
    trainingDaysPerWeek: resolved.trainingDaysPerWeek,
    sessionDurationMinutes: resolved.sessionDurationMinutes,
    trainingGoal: resolved.trainingGoal,
  });
};