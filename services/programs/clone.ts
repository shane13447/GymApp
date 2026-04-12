/**
 * Program draft cloning and identity utilities
 *
 * Extracted from app/(tabs)/Programs.tsx to enable
 * testable, immutable-clone-safe program draft operations.
 */

import type { ProgramExercise, WorkoutDay } from '@/types';

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

export const buildExerciseIdentity = (exercise: Pick<ProgramExercise, 'name' | 'variant'>): string =>
  JSON.stringify({
    name: exercise.name,
    variant: exercise.variant ?? null,
  });

export const areExercisesEquivalent = (
  left: Pick<ProgramExercise, 'name' | 'variant'>,
  right: Pick<ProgramExercise, 'name' | 'variant'>
): boolean => buildExerciseIdentity(left) === buildExerciseIdentity(right);

export const cloneWorkoutDay = (day: WorkoutDay): WorkoutDay => ({
  ...day,
  exercises: day.exercises.map(cloneExercise),
});

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