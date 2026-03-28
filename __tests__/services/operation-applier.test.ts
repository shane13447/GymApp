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
});
