jest.mock('@/services/database', () => ({}));
jest.mock('@/lib/utils', () => ({ getExerciseVariantLabel: () => '' }));

import { mergeScopedQueueChanges } from '@/services/workout-queue-modifier';
import type { WorkoutQueueItem, ProgramExercise } from '@/types';

const makeExercise = (name: string, weight: string = '80'): ProgramExercise => ({
  name,
  equipment: 'Barbell',
  muscle_groups_worked: ['chest'],
  isCompound: true,
  weight,
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  exerciseInstanceId: `ex-${name}`,
  variant: null,
});

const makeQueueItem = (id: string, dayNumber: number, exercises: ProgramExercise[]): WorkoutQueueItem => ({
  id,
  programId: 'prog-1',
  programName: 'Test Program',
  dayNumber,
  exercises,
  position: dayNumber - 1,
});

describe('mergeScopedQueueChanges', () => {
  it('merges horizon-scoped changes back into full queue preserving tail items', () => {
    const fullQueue = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press', '80')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat', '100')]),
      makeQueueItem('q-3', 3, [makeExercise('Deadlift', '120')]),
    ];
    // LLM modified first 2 items (horizon=2)
    const scopedModified = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press', '90')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat', '110')]),
    ];

    const result = mergeScopedQueueChanges(fullQueue, scopedModified, 2);

    expect(result).toHaveLength(3);
    expect(result[0].exercises[0].weight).toBe('90');
    expect(result[1].exercises[0].weight).toBe('110');
    expect(result[2].exercises[0].weight).toBe('120');
    expect(result[2].id).toBe('q-3');
  });

  it('handles scoped queue with more items than horizon (LLM added items)', () => {
    const fullQueue = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat')]),
      makeQueueItem('q-3', 3, [makeExercise('Deadlift')]),
    ];
    // LLM added an exercise within the horizon
    const scopedModified = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press', '90'), makeExercise('Flyes', '20')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat')]),
    ];

    const result = mergeScopedQueueChanges(fullQueue, scopedModified, 2);

    expect(result).toHaveLength(3);
    expect(result[0].exercises).toHaveLength(2);
    expect(result[0].exercises[1].name).toBe('Flyes');
    expect(result[2].exercises[0].name).toBe('Deadlift');
  });

  it('preserves full queue when horizon covers all items', () => {
    const fullQueue = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat')]),
    ];
    const scopedModified = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press', '100')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat', '150')]),
    ];

    const result = mergeScopedQueueChanges(fullQueue, scopedModified, 2);

    expect(result).toHaveLength(2);
    expect(result[0].exercises[0].weight).toBe('100');
    expect(result[1].exercises[0].weight).toBe('150');
  });

  it('returns full queue unchanged when scoped is empty', () => {
    const fullQueue = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat')]),
    ];

    const result = mergeScopedQueueChanges(fullQueue, [], 1);

    expect(result).toHaveLength(2);
    expect(result[0].exercises[0].name).toBe('Bench Press');
  });

  it('does not mutate the original full queue', () => {
    const fullQueue = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press', '80')]),
      makeQueueItem('q-2', 2, [makeExercise('Squat', '100')]),
    ];
    const scopedModified = [
      makeQueueItem('q-1', 1, [makeExercise('Bench Press', '90')]),
    ];

    mergeScopedQueueChanges(fullQueue, scopedModified, 1);

    expect(fullQueue[0].exercises[0].weight).toBe('80');
  });
});
