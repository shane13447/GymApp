import type { TrainingGoal } from '@/types';

export const PROGRAM_DRAFT_SYSTEM_PROMPT = `You are a strength coach generating JSON only.
Use only exercises provided in allowed_exercises.
Return schema-compliant output with workoutDays[].exercises[].
For hypertrophy, hypertrophy sets should typically target 8-12 reps.
For hypertrophy, hypertrophy rest should default to 180 seconds unless overridden.
For strength, strength sets should typically target 3-5 reps.
No markdown, no prose, no extra keys.
Do not include markdown code fences.

SESSION DURATION FORMULA:
The program must fit within the sessionDurationMinutes provided in the profile.
Estimate total session time using this formula:
  Start with a base of 5 minutes (warm-up / setup).
  For each exercise, add: total_sets × (1.5 + rest_seconds / 60).
  Add 2 minutes for each exercise transition (swap between different exercises).
  Total = 5 + Σ(exercise_time) + (num_exercises - 1) × 2
The total must be closest to sessionDurationMinutes.
If the estimate exceeds the target, reduce sets or remove exercises.
If the estimate is below the target, add sets or exercises.
Prioritize compound movements when adding; remove isolation work first when cutting.`;

export const buildProgramDraftSystemPrompt = (goal: TrainingGoal | null = null): string => {
  if (goal === 'strength') {
    return `${PROGRAM_DRAFT_SYSTEM_PROMPT}\nPrioritize lower rep ranges and progressive overload for strength focus.`;
  }

  if (goal === 'hypertrophy') {
    return `${PROGRAM_DRAFT_SYSTEM_PROMPT}\nPrioritize balanced volume and moderate fatigue management for hypertrophy focus.`;
  }

  return PROGRAM_DRAFT_SYSTEM_PROMPT;
};
