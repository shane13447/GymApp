import type { ProgramExercise, WorkoutExercise } from '@/types';

/**
 * Workout progression pure logic extracted from ActiveWorkout.tsx.
 *
 * Contains the auto-weight calculation function that determines
 * progressive overload based on previously logged weights.
 * Pure functions here are independently testable and have no
 * React or database dependencies.
 */

/**
 * Calculate the auto-weight for an exercise based on previous logged weight
 * and progression increment.
 *
 * If there is no previous logged weight (null), returns 0 indicating no
 * baseline exists. Otherwise, adds the progression increment to the
 * previous weight.
 *
 * Runtime type safety: coerces both inputs through Number() to guard
 * against DB-returned strings (e.g. "60" + "2.5" → "602.5" bug).
 *
 * @param lastWeight - Previously logged weight for the exercise, or null
 * @param progression - Weight increment to add (or subtract for deload)
 * @returns The computed weight, or 0 if lastWeight is null. Falls back to
 *          lastWeight if the result is NaN.
 */
export const calculateAutoWeight = (
  lastWeight: number | null,
  progression: number
): number => {
  if (lastWeight === null) return 0;

  const numLastWeight = Number(lastWeight);
  if (!Number.isFinite(numLastWeight)) return 0;

  const numProgression = Number(progression);
  if (!Number.isFinite(numProgression) || numProgression <= 0) return numLastWeight;

  return numLastWeight + numProgression;
};

export type ProgressionRecommendation = {
  weight: number;
  timesRepsHitInARow?: number;
};

const hasDoubleProgressionFields = (exercise: ProgramExercise): boolean => {
  return (
    typeof exercise.repRangeMin === 'number' &&
    exercise.repRangeMin > 0 &&
    typeof exercise.repRangeMax === 'number' &&
    exercise.repRangeMax > 0 &&
    typeof exercise.progressionThreshold === 'number' &&
    exercise.progressionThreshold > 0
  );
};

/**
 * Returns the highest logged weight for a completed exercise.
 *
 * @param exercise - Workout exercise containing simple and/or per-set logged weights.
 * @returns The highest valid per-set weight, falling back to the simple logged weight.
 */
export const getHighestLoggedWeight = (
  exercise: Pick<WorkoutExercise, 'loggedWeight' | 'loggedSetWeights'>
): number => {
  const weights = [
    Number(exercise.loggedWeight) || 0,
    ...exercise.loggedSetWeights.map((weight) => Number(weight) || 0),
  ].filter((weight) => Number.isFinite(weight) && weight > 0);

  return weights.length > 0 ? Math.max(...weights) : 0;
};

/**
 * Checks whether a workout exercise reached the top of its target rep range.
 *
 * @param exercise - Logged workout exercise to evaluate.
 * @param template - Program exercise with rep range and set-count metadata.
 * @returns True when simple reps, or every customised set, reached repRangeMax.
 */
export const didHitRepRangeMax = (
  exercise: Pick<WorkoutExercise, 'loggedReps' | 'loggedSetReps'>,
  template: ProgramExercise
): boolean => {
  const repRangeMax = Number(template.repRangeMax);
  if (!Number.isFinite(repRangeMax) || repRangeMax <= 0) {
    return false;
  }

  if (!template.hasCustomisedSets) {
    return (Number(exercise.loggedReps) || 0) >= repRangeMax;
  }

  const targetSets = Number.parseInt(template.sets, 10);
  if (!Number.isInteger(targetSets) || targetSets < 1) {
    return false;
  }

  if (exercise.loggedSetReps.length < targetSets) {
    return false;
  }

  return exercise.loggedSetReps
    .slice(0, targetSets)
    .every((reps) => (Number(reps) || 0) >= repRangeMax);
};

/**
 * Calculates the next recommended weight and double-progression counter.
 *
 * @param template - Program exercise containing progression settings.
 * @param historyNewestFirst - Completed workout exercises for the same exercise, newest first.
 * @returns Next weight recommendation and, for double progression, the next hit counter.
 */
export const calculateProgressionRecommendation = (
  template: ProgramExercise,
  historyNewestFirst: WorkoutExercise[]
): ProgressionRecommendation => {
  const fallbackWeight = Number(template.weight) || 0;
  const latestWorkout = historyNewestFirst[0];
  const latestWeight = latestWorkout ? getHighestLoggedWeight(latestWorkout) || fallbackWeight : fallbackWeight;
  const progression = Number(template.progression) || 0;

  if (!hasDoubleProgressionFields(template)) {
    return {
      weight: calculateAutoWeight(latestWorkout ? latestWeight : null, progression) || fallbackWeight,
    };
  }

  if (!latestWorkout || progression <= 0) {
    return {
      weight: latestWeight,
      timesRepsHitInARow: 0,
    };
  }

  if (!didHitRepRangeMax(latestWorkout, template)) {
    return {
      weight: latestWeight,
      timesRepsHitInARow: 0,
    };
  }

  let consecutiveHits = 1;
  if (
    typeof latestWorkout.timesRepsHitInARow === 'number' &&
    Number.isInteger(latestWorkout.timesRepsHitInARow) &&
    latestWorkout.timesRepsHitInARow >= 0
  ) {
    consecutiveHits = latestWorkout.timesRepsHitInARow + 1;
  } else {
    consecutiveHits = 0;
    for (const workoutExercise of historyNewestFirst) {
      if (!didHitRepRangeMax(workoutExercise, template)) {
        break;
      }
      consecutiveHits += 1;
    }
  }

  const threshold = Number(template.progressionThreshold) || 0;
  if (consecutiveHits >= threshold) {
    return {
      weight: latestWeight + progression,
      timesRepsHitInARow: 0,
    };
  }

  return {
    weight: latestWeight,
    timesRepsHitInARow: consecutiveHits,
  };
};
