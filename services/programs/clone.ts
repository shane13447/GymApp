/**
 * Program draft cloning and identity utilities
 *
 * Extracted from app/(tabs)/Programs.tsx to enable
 * testable, immutable-clone-safe program draft operations.
 */

import type { ProgramExercise, WorkoutDay } from '@/types';

/**
 * Deep-clone a program exercise so the copy can be mutated without affecting
 * the source. Nested arrays (muscle groups, variant extras, variant option
 * aliases, top-level aliases) and the variant object are duplicated.
 *
 * @param {ProgramExercise} exercise - The exercise to clone.
 * @returns {ProgramExercise} A new exercise with independent nested structures.
 */
export const cloneExercise = (exercise: ProgramExercise): ProgramExercise => ({
  ...exercise,
  muscle_groups_worked: [...exercise.muscle_groups_worked],
  variant: exercise.variant
    ? {
        ...exercise.variant,
        extras: exercise.variant.extras ? [...exercise.variant.extras] : undefined,
      }
    : null,
  variantOptions: exercise.variantOptions
    ? exercise.variantOptions.map((option) => ({
        ...option,
        aliases: option.aliases ? [...option.aliases] : undefined,
      }))
    : undefined,
  aliases: exercise.aliases ? [...exercise.aliases] : undefined,
});

/**
 * Build a stable string identity for an exercise from its name and variant,
 * suitable for equality comparison and map keys.
 *
 * @param {Pick<ProgramExercise, 'name' | 'variant'>} exercise - Exercise (or partial) to identify.
 * @returns {string} A JSON string uniquely representing the name/variant pair.
 */
export const buildExerciseIdentity = (exercise: Pick<ProgramExercise, 'name' | 'variant'>): string =>
  JSON.stringify({
    name: exercise.name,
    variant: exercise.variant ?? null,
  });

/**
 * Determine whether two exercises refer to the same name/variant pair.
 *
 * @param {Pick<ProgramExercise, 'name' | 'variant'>} left - First exercise (or partial).
 * @param {Pick<ProgramExercise, 'name' | 'variant'>} right - Second exercise (or partial).
 * @returns {boolean} True when both share the same exercise identity.
 */
export const areExercisesEquivalent = (
  left: Pick<ProgramExercise, 'name' | 'variant'>,
  right: Pick<ProgramExercise, 'name' | 'variant'>
): boolean => buildExerciseIdentity(left) === buildExerciseIdentity(right);

/**
 * Deep-clone a workout day, cloning each of its exercises so the result is
 * fully independent of the source day.
 *
 * @param {WorkoutDay} day - The workout day to clone.
 * @returns {WorkoutDay} A new workout day with cloned exercises.
 */
export const cloneWorkoutDay = (day: WorkoutDay): WorkoutDay => ({
  ...day,
  exercises: day.exercises.map(cloneExercise),
});

/**
 * Deep-clone an array of workout days.
 *
 * @param {WorkoutDay[]} days - The workout days to clone.
 * @returns {WorkoutDay[]} A new array of independently-cloned workout days.
 */
export const cloneWorkoutDays = (days: WorkoutDay[]): WorkoutDay[] => days.map(cloneWorkoutDay);

/**
 * Commit the currently-selected exercises into a specific day of the workout plan.
 * Returns a new array of workout days with the target day's exercises replaced.
 *
 * This replaces the 4-site pattern in Programs.tsx:
 *   const updatedDays = cloneWorkoutDays(workoutDays);
 *   updatedDays[currentDayIndex].exercises = selectedExercises.map(cloneExercise);
 */
export const commitCurrentDay = (
  days: WorkoutDay[],
  dayIndex: number,
  selectedExercises: ProgramExercise[]
): WorkoutDay[] => {
  const updatedDays = cloneWorkoutDays(days);
  updatedDays[dayIndex].exercises = selectedExercises.map(cloneExercise);
  return updatedDays;
};