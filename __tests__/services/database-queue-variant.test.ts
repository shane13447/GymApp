jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

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

describe('database queue variant persistence', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('saveWorkoutQueue writes variant_json and getWorkoutQueue reads it back', async () => {
    const capturedRows: unknown[][] = [];

    const runAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO queue_exercises')) {
        capturedRows.push(params ?? []);
      }
    });

    const queueExerciseRows = [
      {
        id: 1,
        name: 'Barbell Bench Press',
        equipment: 'Barbell',
        muscle_groups: JSON.stringify(['chest']),
        is_compound: 1,
        weight: 82.5,
        reps: 8,
        sets: 3,
        rest_time: 180,
        progression: 2.5,
        has_customised_sets: 0,
        variant_json: JSON.stringify({ angle: 'Incline' }),
        position: 0,
      },
    ];

    const getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes('FROM workout_queue')) {
        return [
          {
            id: 'q0',
            program_id: 'program-1',
            program_name: 'Program A',
            day_number: 1,
            scheduled_date: null,
            position: 0,
          },
        ];
      }

      if (sql.includes('FROM queue_exercises')) {
        return queueExerciseRows;
      }

      return [];
    });

    const getFirstAsync = jest.fn(async () => null);

    jest.resetModules();
    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(),
        runAsync,
        getAllAsync,
        getFirstAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { saveWorkoutQueue, getWorkoutQueue } = await import('@/services/database');

    const queue = [
      createQueueItem({
        exercises: [createExercise({ variant: { angle: 'Incline' } })],
      }),
    ];

    await saveWorkoutQueue(queue);

    const savedVariant = capturedRows[0]?.[11];
    expect(savedVariant).toBe(JSON.stringify({ angle: 'Incline' }));

    const reloaded = await getWorkoutQueue();
    expect(reloaded[0].exercises[0].variant).toEqual({ angle: 'Incline' });
  });

  it('addToWorkoutQueue and updateQueueItem both persist variant_json', async () => {
    const insertedVariants: unknown[] = [];

    const runAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO queue_exercises')) {
        insertedVariants.push((params ?? [])[11]);
      }
    });

    const getFirstAsync = jest.fn(async (sql: string) => {
      if (sql.includes('MAX(position)')) {
        return { max_pos: 0 };
      }
      return null;
    });

    jest.resetModules();
    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(),
        runAsync,
        getAllAsync: jest.fn(async () => []),
        getFirstAsync,
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { addToWorkoutQueue, updateQueueItem } = await import('@/services/database');

    const queueItem = createQueueItem({
      exercises: [createExercise({ variant: { angle: 'Incline', grip: 'Wide' } })],
    });

    await addToWorkoutQueue(queueItem);
    await updateQueueItem(queueItem);

    expect(insertedVariants).toEqual([
      JSON.stringify({ angle: 'Incline', grip: 'Wide' }),
      JSON.stringify({ angle: 'Incline', grip: 'Wide' }),
    ]);
  });
});
