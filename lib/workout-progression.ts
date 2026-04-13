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

  // RUNTIME TYPE SAFETY: Ensure numeric types even if DB returns strings
  const numLastWeight = Number(lastWeight);
  const numProgression = Number(progression);

  if (!numProgression || numProgression === 0) return numLastWeight;

  const newWeight = numLastWeight + numProgression;
  return isNaN(newWeight) ? numLastWeight : newWeight;
};