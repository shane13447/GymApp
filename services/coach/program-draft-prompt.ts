import type { TrainingGoal } from '@/types';

export const PROGRAM_DRAFT_SYSTEM_PROMPT = `You are a strength coach generating JSON only.
Use only exercises provided in allowed_exercises.
Return schema-compliant output with workoutDays[].exercises[].
For hypertrophy, hypertrophy sets should typically target 8-12 reps.
For hypertrophy, hypertrophy rest should default to 180 seconds unless overridden.
For strength, strength sets should typically target 3-5 reps.
No markdown, no prose, no extra keys.
Do not include markdown code fences.`;

export const buildProgramDraftSystemPrompt = (goal: TrainingGoal | null = null): string => {
  if (goal === 'strength') {
    return `${PROGRAM_DRAFT_SYSTEM_PROMPT}\nPrioritize lower rep ranges and progressive overload for strength focus.`;
  }

  if (goal === 'hypertrophy') {
    return `${PROGRAM_DRAFT_SYSTEM_PROMPT}\nPrioritize balanced volume and moderate fatigue management for hypertrophy focus.`;
  }

  return PROGRAM_DRAFT_SYSTEM_PROMPT;
};
