/**
 * Exercise field type coercion utility
 *
 * Pure function that maps a raw user input value to the correct
 * TypeScript type for a given ProgramExercise field.
 *
 * Extracted from Programs.tsx to make it unit-testable and reusable.
 */

import type { ExerciseVariant, ProgramExercise } from '@/types';

const NUMERIC_STRING_FIELDS: ReadonlyArray<keyof ProgramExercise> = [
  'weight',
  'reps',
  'sets',
  'restTime',
  'progression',
];

const NUMERIC_FIELDS: ReadonlyArray<keyof ProgramExercise> = [
  'repRangeMin',
  'repRangeMax',
  'progressionThreshold',
  'timesRepsHitInARow',
];

/**
 * Coerces a raw value to the correct TypeScript type for a ProgramExercise field.
 *
 * - `hasCustomisedSets` → boolean
 * - `variant` → ExerciseVariant | null
 * - numeric string fields (weight, reps, sets, restTime, progression) → string
 * - numeric fields (repRangeMin, repRangeMax, progressionThreshold, timesRepsHitInARow) → number
 * - everything else → string
 */
export const coerceExerciseFieldValue = (
  field: keyof ProgramExercise,
  value: string | boolean | number | ExerciseVariant | null
): ProgramExercise[keyof ProgramExercise] => {
  if (field === 'hasCustomisedSets') return Boolean(value);
  if (field === 'variant') return value as ExerciseVariant | null;
  if ((NUMERIC_STRING_FIELDS as readonly string[]).includes(field)) return String(value);
  if ((NUMERIC_FIELDS as readonly string[]).includes(field)) return value as number;
  return String(value);
};