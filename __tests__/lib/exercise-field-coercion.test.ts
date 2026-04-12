import { coerceExerciseFieldValue } from '@/lib/exercise-field-coercion';
import type { ExerciseVariant } from '@/types';

describe('coerceExerciseFieldValue', () => {
  it('coerces hasCustomisedSets to boolean', () => {
    expect(coerceExerciseFieldValue('hasCustomisedSets', true)).toBe(true);
    expect(coerceExerciseFieldValue('hasCustomisedSets', false)).toBe(false);
    expect(coerceExerciseFieldValue('hasCustomisedSets', 'truthy')).toBe(true);
    expect(coerceExerciseFieldValue('hasCustomisedSets', 0)).toBe(false);
  });

  it('coerces variant to ExerciseVariant | null', () => {
    const variant: ExerciseVariant = { grip: 'Overhand' };
    expect(coerceExerciseFieldValue('variant', variant)).toBe(variant);
    expect(coerceExerciseFieldValue('variant', null)).toBeNull();
  });

  it('coerces numeric string fields to string', () => {
    expect(coerceExerciseFieldValue('weight', 80)).toBe('80');
    expect(coerceExerciseFieldValue('reps', 12)).toBe('12');
    expect(coerceExerciseFieldValue('sets', '3')).toBe('3');
    expect(coerceExerciseFieldValue('restTime', 180)).toBe('180');
    expect(coerceExerciseFieldValue('progression', 2.5)).toBe('2.5');
  });

  it('coerces numeric fields to number', () => {
    expect(coerceExerciseFieldValue('repRangeMin', 8)).toBe(8);
    expect(coerceExerciseFieldValue('repRangeMax', 12)).toBe(12);
    expect(coerceExerciseFieldValue('progressionThreshold', 5)).toBe(5);
    expect(coerceExerciseFieldValue('timesRepsHitInARow', 3)).toBe(3);
  });

  it('coerces any other field to string', () => {
    expect(coerceExerciseFieldValue('name', 'Bench Press')).toBe('Bench Press');
    expect(coerceExerciseFieldValue('equipment', 'Barbell')).toBe('Barbell');
  });
});