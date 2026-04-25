/**
 * Tests for workout progression pure logic extracted from ActiveWorkout.tsx.
 * Covers auto-weight calculation, numeric coercion, and edge-case guards.
 */

import {
  calculateAutoWeight,
  calculateProgressionRecommendation,
  didHitRepRangeMax,
  getHighestLoggedWeight,
} from '@/lib/workout-progression';
import type { ProgramExercise, WorkoutExercise } from '@/types';

describe('calculateAutoWeight', () => {
  it('returns 0 when lastWeight is null', () => {
    expect(calculateAutoWeight(null, 5)).toBe(0);
  });

  it('returns lastWeight unchanged when progression is 0', () => {
    expect(calculateAutoWeight(80, 0)).toBe(80);
  });

  it('returns lastWeight unchanged when progression is undefined/NaN', () => {
    expect(calculateAutoWeight(80, NaN)).toBe(80);
    expect(calculateAutoWeight(80, Number(undefined))).toBe(80);
  });

  it('adds positive progression to lastWeight', () => {
    expect(calculateAutoWeight(80, 2.5)).toBe(82.5);
  });

  it('ignores negative progression because progression must be positive or empty', () => {
    expect(calculateAutoWeight(80, -5)).toBe(80);
  });

  it('handles string-like numeric inputs via coercion', () => {
    // The function receives numbers, but the original code used Number() coercion
    // on both parameters to guard against DB-returned strings
    expect(calculateAutoWeight(80, Number('2.5'))).toBe(82.5);
    expect(calculateAutoWeight(Number('80'), Number('2.5'))).toBe(82.5);
  });

  it('returns progression value when lastWeight is 0 and progression is non-zero', () => {
    // 0 + progression = progression (baseline of 0 means "no previous weight",
    // so the autopopulated value is just the progression)
    expect(calculateAutoWeight(0, 5)).toBe(5);
  });

  it('returns lastWeight when progression results in NaN', () => {
    // NaN progression: should fallback to lastWeight
    expect(calculateAutoWeight(80, NaN)).toBe(80);
  });

  it('handles decimal progression precisely', () => {
    expect(calculateAutoWeight(60, 1.25)).toBe(61.25);
  });

  it('handles large progression values', () => {
    expect(calculateAutoWeight(60, 20)).toBe(80);
  });

  it('returns lastWeight when lastWeight is null regardless of progression', () => {
    expect(calculateAutoWeight(null, 10)).toBe(0);
    expect(calculateAutoWeight(null, -5)).toBe(0);
  });

  it('returns 0 for lastWeight=0 with progression=0', () => {
    expect(calculateAutoWeight(0, 0)).toBe(0);
  });
});

const makeProgramExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  name: 'Barbell Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest', 'triceps'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  variant: null,
  ...overrides,
});

const makeWorkoutExercise = (overrides: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  ...makeProgramExercise(overrides),
  loggedWeight: 80,
  loggedReps: 8,
  loggedSetWeights: [],
  loggedSetReps: [],
  ...overrides,
});

describe('customised-set progression helpers', () => {
  it('uses the highest per-set logged weight when customised set weights exist', () => {
    const exercise = makeWorkoutExercise({
      loggedWeight: 80,
      loggedSetWeights: [80, 82.5, 77.5],
    });

    expect(getHighestLoggedWeight(exercise)).toBe(82.5);
  });

  it('requires every customised set to hit repRangeMax', () => {
    const template = makeProgramExercise({
      hasCustomisedSets: true,
      sets: '3',
      repRangeMax: 10,
    });

    expect(didHitRepRangeMax(makeWorkoutExercise({ loggedSetReps: [10, 10, 10] }), template)).toBe(true);
    expect(didHitRepRangeMax(makeWorkoutExercise({ loggedSetReps: [10, 9, 10] }), template)).toBe(false);
  });

  it('uses simple logged reps for non-customised exercises', () => {
    const template = makeProgramExercise({ repRangeMax: 10 });

    expect(didHitRepRangeMax(makeWorkoutExercise({ loggedReps: 10 }), template)).toBe(true);
    expect(didHitRepRangeMax(makeWorkoutExercise({ loggedReps: 9 }), template)).toBe(false);
  });

  it('falls back to simple linear progression when double-progression fields are absent', () => {
    const template = makeProgramExercise({ progression: '2.5' });
    const recommendation = calculateProgressionRecommendation(template, [
      makeWorkoutExercise({ loggedWeight: 80 }),
    ]);

    expect(recommendation.weight).toBe(82.5);
    expect(recommendation.timesRepsHitInARow).toBeUndefined();
  });

  it('increments only after the threshold of consecutive all-set max hits', () => {
    const template = makeProgramExercise({
      progression: '2.5',
      repRangeMin: 8,
      repRangeMax: 10,
      progressionThreshold: 2,
    });

    const oneHit = calculateProgressionRecommendation(template, [
      makeWorkoutExercise({ loggedWeight: 80, loggedReps: 10 }),
    ]);
    expect(oneHit.weight).toBe(80);
    expect(oneHit.timesRepsHitInARow).toBe(1);

    const thresholdHit = calculateProgressionRecommendation(template, [
      makeWorkoutExercise({ loggedWeight: 80, loggedReps: 10 }),
      makeWorkoutExercise({ loggedWeight: 77.5, loggedReps: 10 }),
    ]);
    expect(thresholdHit.weight).toBe(82.5);
    expect(thresholdHit.timesRepsHitInARow).toBe(0);
  });

  it('resets the consecutive counter when the latest workout misses repRangeMax', () => {
    const template = makeProgramExercise({
      progression: '2.5',
      repRangeMin: 8,
      repRangeMax: 10,
      progressionThreshold: 2,
    });

    const recommendation = calculateProgressionRecommendation(template, [
      makeWorkoutExercise({ loggedWeight: 80, loggedReps: 9 }),
      makeWorkoutExercise({ loggedWeight: 77.5, loggedReps: 10 }),
    ]);

    expect(recommendation.weight).toBe(80);
    expect(recommendation.timesRepsHitInARow).toBe(0);
  });
});
