import { applyOperations, validateOperationApplicability } from '@/services/coach/operation-applier';
import type { QueueOperation } from '@/services/coach/operation-contract';
import type { WorkoutQueueItem, ProgramExercise } from '@/types';

const makeExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  name: 'Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  exerciseInstanceId: 'ex-1',
  variant: null,
  ...overrides,
});

const makeQueue = (exercises: ProgramExercise[] = [makeExercise()]): WorkoutQueueItem[] => [
  {
    id: 'q-1',
    programId: 'prog-1',
    programName: 'Test Program',
    dayNumber: 1,
    exercises,
    position: 0,
  },
];

describe('operation-applier', () => {
  describe('swap_variant', () => {
    it('swaps an exercise variant from null to a specific grip', () => {
      const queue = makeQueue([makeExercise({ variant: null })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'swap_variant',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { variant: 'close_grip' },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].variant).toEqual({ grip: 'close_grip' });
    });

    it('swaps an existing variant to a different one', () => {
      const queue = makeQueue([
        makeExercise({ variant: { grip: 'wide' } }),
      ]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'swap_variant',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { variant: 'neutral' },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].variant).toEqual({ grip: 'neutral' });
    });

    it('respects exerciseInstanceId target', () => {
      const queue = makeQueue([
        makeExercise({ exerciseInstanceId: 'ex-42', name: 'Squat', variant: null }),
      ]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'swap_variant',
          target: { exerciseInstanceId: 'ex-42' },
          value: { variant: 'seated' },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].variant).toEqual({ posture: 'seated' });
    });

    it('does not modify the original queue', () => {
      const original = makeQueue([makeExercise({ variant: null })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'swap_variant',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { variant: 'close_grip' },
        },
      ];

      applyOperations(original, ops);
      expect(original[0].exercises[0].variant).toBeNull();
    });
  });

  describe('add_exercise', () => {
    it('adds a new exercise to the target day', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Barbell Curl' },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises).toHaveLength(2);
      expect(result[0].exercises[1].name).toBe('Barbell Curl');
    });

    it('sets default weight/reps/sets when not provided', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Hammer Curl' },
        },
      ];

      const result = applyOperations(queue, ops);
      const added = result[0].exercises[1];
      expect(added.weight).toBe('0');
      expect(added.reps).toBe('8');
      expect(added.sets).toBe('3');
      expect(added.restTime).toBe('180');
    });

    it('uses provided weight/reps/sets when specified', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Cable Curl', weight: 20, reps: 12, sets: 4 },
        },
      ];

      const result = applyOperations(queue, ops);
      const added = result[0].exercises[1];
      expect(added.name).toBe('Cable Curl');
      expect(added.weight).toBe('20');
      expect(added.reps).toBe('12');
      expect(added.sets).toBe('4');
    });

    it('does not modify the original queue', () => {
      const original = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Cable Curl' },
        },
      ];

      applyOperations(original, ops);
      expect(original[0].exercises).toHaveLength(1);
    });
  });

  describe('validateOperationApplicability', () => {
    it('reports missing targets for swap_variant on nonexistent exercise', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'swap_variant',
          target: { dayNumber: 1, exerciseName: 'Nonexistent' },
          value: { variant: 'close_grip' },
        },
      ];

      const result = validateOperationApplicability(queue, ops);
      expect(result.canApply).toBe(false);
      expect(result.missingTargets.length).toBeGreaterThan(0);
    });

    it('passes for valid swap_variant target', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'swap_variant',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { variant: 'close_grip' },
        },
      ];

      const result = validateOperationApplicability(queue, ops);
      expect(result.canApply).toBe(true);
    });

    it('always passes for add_exercise (no target to validate)', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Cable Curl' },
        },
      ];

      const result = validateOperationApplicability(queue, ops);
      expect(result.canApply).toBe(true);
    });
  });

  // =========================================================================
  // modify_weight
  // =========================================================================
  describe('modify_weight', () => {
    it('modifies exercise weight', () => {
      const queue = makeQueue([makeExercise({ weight: '80' })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_weight',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { weight: 85 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].weight).toBe('85');
    });

    it('does not modify original queue', () => {
      const original = makeQueue([makeExercise({ weight: '80' })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_weight',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { weight: 85 },
        },
      ];

      applyOperations(original, ops);
      expect(original[0].exercises[0].weight).toBe('80');
    });

    it('ignores modify_weight for nonexistent exercise', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_weight',
          target: { dayNumber: 1, exerciseName: 'Nonexistent' },
          value: { weight: 100 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].weight).toBe('80');
    });
  });

  // =========================================================================
  // modify_reps
  // =========================================================================
  describe('modify_reps', () => {
    it('modifies exercise reps', () => {
      const queue = makeQueue([makeExercise({ reps: '8' })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_reps',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { reps: 12 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].reps).toBe('12');
    });

    it('ignores modify_reps for nonexistent exercise', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_reps',
          target: { dayNumber: 1, exerciseName: 'Nonexistent' },
          value: { reps: 15 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].reps).toBe('8');
    });
  });

  // =========================================================================
  // modify_sets
  // =========================================================================
  describe('modify_sets', () => {
    it('modifies exercise sets', () => {
      const queue = makeQueue([makeExercise({ sets: '3' })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_sets',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { sets: 4 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].sets).toBe('4');
    });
  });

  // =========================================================================
  // remove_exercise
  // =========================================================================
  describe('remove_exercise', () => {
    it('removes an exercise from the queue', () => {
      const queue = makeQueue([
        makeExercise({ name: 'Bench Press', exerciseInstanceId: 'ex-1' }),
        makeExercise({ name: 'Squat', exerciseInstanceId: 'ex-2' }),
      ]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'remove_exercise',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: {},
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises).toHaveLength(1);
      expect(result[0].exercises[0].name).toBe('Squat');
    });

    it('does not modify original queue', () => {
      const original = makeQueue([
        makeExercise({ name: 'Bench Press' }),
        makeExercise({ name: 'Squat' }),
      ]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'remove_exercise',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: {},
        },
      ];

      applyOperations(original, ops);
      expect(original[0].exercises).toHaveLength(2);
    });

    it('ignores remove for nonexistent exercise', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'remove_exercise',
          target: { dayNumber: 1, exerciseName: 'Nonexistent' },
          value: {},
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises).toHaveLength(1);
    });

    it('validates remove_exercise target exists', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'remove_exercise',
          target: { dayNumber: 1, exerciseName: 'Nonexistent' },
          value: {},
        },
      ];

      const result = validateOperationApplicability(queue, ops);
      expect(result.canApply).toBe(false);
      expect(result.missingTargets[0]).toContain('Cannot remove');
    });
  });

  // =========================================================================
  // Boundary and edge cases
  // =========================================================================
  describe('boundary and edge cases', () => {
    it('handles empty operations array', () => {
      const queue = makeQueue([makeExercise()]);
      const result = applyOperations(queue, []);
      expect(result).toEqual(queue);
    });

    it('handles multiple operations in sequence', () => {
      const queue = makeQueue([makeExercise({ weight: '80', reps: '8' })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_weight',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { weight: 85 },
        },
        {
          id: 'op_2',
          type: 'modify_reps',
          target: { dayNumber: 1, exerciseName: 'Bench Press' },
          value: { reps: 10 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].weight).toBe('85');
      expect(result[0].exercises[0].reps).toBe('10');
    });

    it('handles add then remove in sequence', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Cable Curl' },
        },
        {
          id: 'op_2',
          type: 'remove_exercise',
          target: { dayNumber: 1, exerciseName: 'Cable Curl' },
          value: {},
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises).toHaveLength(1);
      expect(result[0].exercises[0].name).toBe('Bench Press');
    });

    it('handles exercise lookup by exerciseInstanceId', () => {
      const queue = makeQueue([makeExercise({ exerciseInstanceId: 'ex-42' })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_weight',
          target: { exerciseInstanceId: 'ex-42' },
          value: { weight: 100 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].weight).toBe('100');
    });

    it('handles case-insensitive exercise name matching', () => {
      const queue = makeQueue([makeExercise({ name: 'Bench Press' })]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'modify_weight',
          target: { dayNumber: 1, exerciseName: 'bench press' },
          value: { weight: 90 },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises[0].weight).toBe('90');
    });

    it('add_exercise generates exerciseInstanceId and enriches from catalog', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Cable Curl' },
        },
      ];

      const catalogLookup = (name: string) => {
        if (name === 'Cable Curl') {
          return {
            equipment: 'Cable',
            muscle_groups_worked: ['biceps'],
            isCompound: false,
          };
        }
        return null;
      };

      const result = applyOperations(queue, ops, catalogLookup);
      expect(result[0].exercises).toHaveLength(2);
      const addedExercise = result[0].exercises[1];
      expect(addedExercise.name).toBe('Cable Curl');
      expect(addedExercise.exerciseInstanceId).toBe(`${queue[0].id}:e1`);
      expect(addedExercise.equipment).toBe('Cable');
      expect(addedExercise.muscle_groups_worked).toEqual(['biceps']);
      expect(addedExercise.isCompound).toBe(false);
    });

    it('add_exercise falls back gracefully without catalog lookup', () => {
      const queue = makeQueue([makeExercise()]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Cable Curl' },
        },
      ];

      const result = applyOperations(queue, ops);
      expect(result[0].exercises).toHaveLength(2);
      const addedExercise = result[0].exercises[1];
      expect(addedExercise.exerciseInstanceId).toBe(`${queue[0].id}:e1`);
      expect(addedExercise.equipment).toBe('');
      expect(addedExercise.muscle_groups_worked).toEqual([]);
    });

    it('keeps generated exerciseInstanceId unique after remove/add sequences', () => {
      const queue = makeQueue([
        makeExercise({ name: 'Bench Press', exerciseInstanceId: 'q-1:e0' }),
        makeExercise({ name: 'Squat', exerciseInstanceId: 'q-1:e1' }),
      ]);
      const ops: QueueOperation[] = [
        {
          id: 'op_1',
          type: 'remove_exercise',
          target: { exerciseInstanceId: 'q-1:e0' },
        },
        {
          id: 'op_2',
          type: 'add_exercise',
          target: { dayNumber: 1 },
          value: { exerciseName: 'Cable Curl' },
        },
      ];

      const result = applyOperations(queue, ops);

      expect(result[0].exercises.map((exercise) => exercise.exerciseInstanceId)).toEqual([
        'q-1:e1',
        'q-1:e2',
      ]);
    });
  });
});
