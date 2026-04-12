import {
  cloneExercise,
  cloneWorkoutDay,
  cloneWorkoutDays,
  buildExerciseIdentity,
  areExercisesEquivalent,
  commitCurrentDay,
} from '@/services/programs/clone';
import type { ProgramExercise, WorkoutDay, ExerciseVariant } from '@/types';

const baseExercise: ProgramExercise = {
  name: 'Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest', 'triceps'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  variant: { angle: 'Flat' } as ExerciseVariant,
  variantOptions: [
    { label: 'Flat', field: 'angle', value: 'Flat', aliases: ['Flat BP'] },
    { label: 'Incline', field: 'angle', value: 'Incline', aliases: undefined },
  ],
  aliases: ['BP', 'Chest Press'],
  repRangeMin: 6,
  repRangeMax: 12,
  progressionThreshold: 2,
  timesRepsHitInARow: 0,
};

describe('services/programs/clone', () => {
  describe('cloneExercise', () => {
    it('deep-clones muscle_groups_worked', () => {
      const clone = cloneExercise(baseExercise);
      expect(clone.muscle_groups_worked).toEqual(baseExercise.muscle_groups_worked);
      expect(clone.muscle_groups_worked).not.toBe(baseExercise.muscle_groups_worked);
    });

    it('deep-clones variant.extras', () => {
      const exerciseWithExtras: ProgramExercise = {
        ...baseExercise,
        variant: { angle: 'Flat', extras: ['Pause'] } as ExerciseVariant,
      };
      const clone = cloneExercise(exerciseWithExtras);
      expect(clone.variant?.extras).toEqual(['Pause']);
      expect(clone.variant?.extras).not.toBe((exerciseWithExtras.variant as any).extras);
    });

    it('deep-clones variantOptions aliases', () => {
      const clone = cloneExercise(baseExercise);
      expect(clone.variantOptions).toEqual(baseExercise.variantOptions);
      expect(clone.variantOptions![0].aliases).not.toBe(baseExercise.variantOptions![0].aliases);
    });

    it('deep-clones top-level aliases', () => {
      const clone = cloneExercise(baseExercise);
      expect(clone.aliases).toEqual(baseExercise.aliases);
      expect(clone.aliases).not.toBe(baseExercise.aliases);
    });

    it('handles null variant', () => {
      const noVariant: ProgramExercise = { ...baseExercise, variant: null };
      const clone = cloneExercise(noVariant);
      expect(clone.variant).toBeNull();
    });

    it('handles undefined variantOptions', () => {
      const noOptions: ProgramExercise = { ...baseExercise, variantOptions: undefined };
      const clone = cloneExercise(noOptions);
      expect(clone.variantOptions).toBeUndefined();
    });

    it('handles undefined aliases', () => {
      const noAliases: ProgramExercise = { ...baseExercise, aliases: undefined };
      const clone = cloneExercise(noAliases);
      expect(clone.aliases).toBeUndefined();
    });

    it('preserves numeric fields', () => {
      const clone = cloneExercise(baseExercise);
      expect(clone.repRangeMin).toBe(6);
      expect(clone.repRangeMax).toBe(12);
      expect(clone.progressionThreshold).toBe(2);
      expect(clone.timesRepsHitInARow).toBe(0);
    });
  });

  describe('buildExerciseIdentity', () => {
    it('produces consistent identity for same exercise', () => {
      const id1 = buildExerciseIdentity({ name: 'Bench Press', variant: null });
      const id2 = buildExerciseIdentity({ name: 'Bench Press', variant: null });
      expect(id1).toBe(id2);
    });

    it('produces different identity for different variant', () => {
      const id1 = buildExerciseIdentity({ name: 'Bench Press', variant: null });
      const id2 = buildExerciseIdentity({ name: 'Bench Press', variant: { angle: 'Incline' } });
      expect(id1).not.toBe(id2);
    });
  });

  describe('areExercisesEquivalent', () => {
    it('returns true for same name and null variant', () => {
      expect(
        areExercisesEquivalent(
          { name: 'Squat', variant: null },
          { name: 'Squat', variant: null }
        )
      ).toBe(true);
    });

    it('returns false for different names', () => {
      expect(
        areExercisesEquivalent(
          { name: 'Squat', variant: null },
          { name: 'Deadlift', variant: null }
        )
      ).toBe(false);
    });

    it('returns false for different variants', () => {
      expect(
        areExercisesEquivalent(
          { name: 'Bench Press', variant: { angle: 'Flat' } },
          { name: 'Bench Press', variant: { angle: 'Incline' } }
        )
      ).toBe(false);
    });
  });

  describe('cloneWorkoutDay', () => {
    it('deep-clones exercises', () => {
      const day: WorkoutDay = {
        dayNumber: 1,
        exercises: [baseExercise],
      };
      const clone = cloneWorkoutDay(day);
      expect(clone.exercises[0]).toEqual(baseExercise);
      expect(clone.exercises[0].muscle_groups_worked).not.toBe(baseExercise.muscle_groups_worked);
    });

    it('preserves dayNumber', () => {
      const day: WorkoutDay = { dayNumber: 3, exercises: [] };
      const clone = cloneWorkoutDay(day);
      expect(clone.dayNumber).toBe(3);
    });
  });

  describe('cloneWorkoutDays', () => {
    it('deep-clones each day', () => {
      const days: WorkoutDay[] = [
        { dayNumber: 1, exercises: [baseExercise] },
        { dayNumber: 2, exercises: [] },
      ];
      const clone = cloneWorkoutDays(days);
      expect(clone).toHaveLength(2);
      expect(clone[0].exercises[0].muscle_groups_worked).not.toBe(days[0].exercises[0].muscle_groups_worked);
    });
  });
});