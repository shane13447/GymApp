jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import { validateWorkoutQueueForPersistence } from '@/services/database';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';

const createExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  name: 'Barbell Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  ...overrides,
});

const createQueueItem = (overrides: Partial<WorkoutQueueItem> = {}): WorkoutQueueItem => ({
  id: 'q0',
  programId: 'program-1',
  programName: 'Program A',
  dayNumber: 1,
  exercises: [createExercise()],
  position: 0,
  ...overrides,
});

describe('validateWorkoutQueueForPersistence', () => {
  it('accepts a valid queue', () => {
    const queue = [
      createQueueItem({ id: 'q0', dayNumber: 1, position: 0 }),
      createQueueItem({ id: 'q1', dayNumber: 2, position: 1 }),
    ];

    expect(() => validateWorkoutQueueForPersistence(queue)).not.toThrow();
  });

  it('accepts an empty queue', () => {
    expect(() => validateWorkoutQueueForPersistence([])).not.toThrow();
  });

  it('throws when queue item is missing id', () => {
    const queue = [createQueueItem({ id: '' })];

    expect(() => validateWorkoutQueueForPersistence(queue)).toThrow('missing id');
  });

  it('throws when queue has duplicate ids', () => {
    const queue = [
      createQueueItem({ id: 'q0', dayNumber: 1 }),
      createQueueItem({ id: 'q0', dayNumber: 2 }),
    ];

    expect(() => validateWorkoutQueueForPersistence(queue)).toThrow('duplicate queue item id');
  });

  it('throws when queue item is missing programId', () => {
    const queue = [createQueueItem({ programId: '' })];

    expect(() => validateWorkoutQueueForPersistence(queue)).toThrow('missing programId');
  });

  it('throws when dayNumber is invalid', () => {
    const queue = [createQueueItem({ dayNumber: 0 })];

    expect(() => validateWorkoutQueueForPersistence(queue)).toThrow('dayNumber must be a positive integer');
  });

  it('throws when exercises is empty', () => {
    const queue = [createQueueItem({ exercises: [] })];

    expect(() => validateWorkoutQueueForPersistence(queue)).toThrow('exercises must be a non-empty array');
  });

  it('throws when customised sets are enabled but set semantics are invalid', () => {
    const queue = [
      createQueueItem({
        exercises: [
          createExercise({
            hasCustomisedSets: true,
            sets: '0',
          }),
        ],
      }),
    ];

    expect(() => validateWorkoutQueueForPersistence(queue)).toThrow('customised set semantics');
  });
});