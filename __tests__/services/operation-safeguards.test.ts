import { applyOperationIntentSafeguards } from '@/services/coach/operation-safeguards';
import type { TargetedExerciseRef } from '@/services/queue/types';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';

const createExercise = (
  exerciseInstanceId: string,
  name: string,
  weight: string,
  reps: string,
  variant: ProgramExercise['variant'],
  muscleGroups: string[]
): ProgramExercise => ({
  exerciseInstanceId,
  name,
  equipment: 'Test',
  muscle_groups_worked: muscleGroups,
  isCompound: true,
  sets: '3',
  reps,
  weight,
  restTime: '120',
  progression: 'none',
  hasCustomisedSets: false,
  variant,
});

const createQueue = (): WorkoutQueueItem[] => [
  {
    id: 'q0',
    dayNumber: 1,
    programId: 'p1',
    programName: 'Test',
    exercises: [
      createExercise('q0:e0', 'Dumbbell Press', '30', '10', { angle: 'Flat' }, ['chest']),
      createExercise('q0:e1', 'Overhead Barbell Press', '50', '8', { posture: 'Standing' }, ['shoulders']),
    ],
    position: 0,
  },
];

const createTarget = (exerciseIndex: number, name: string, exerciseInstanceId: string): TargetedExerciseRef => ({
  queueItemId: 'q0',
  dayNumber: 1,
  exerciseIndex,
  exerciseInstanceId,
  name,
  displayName: name,
});

describe('operation intent safeguards', () => {
  it('applies a requested variant to all resolved targets the model missed', () => {
    const result = applyOperationIntentSafeguards({
      request: 'use incline variations for all chest moves today',
      parsedQueue: createQueue(),
      targetedExercises: [createTarget(0, 'Dumbbell Press', 'q0:e0')],
    });

    expect(result[0].exercises[0].variant).toEqual({ angle: 'incline' });
    expect(result[0].exercises[1].variant).toEqual({ posture: 'Standing' });
  });

  it('lightens mild injury targets weight-first', () => {
    const result = applyOperationIntentSafeguards({
      request: 'my shoulder feels a little irritated today, go easier on pressing',
      parsedQueue: createQueue(),
      targetedExercises: [createTarget(1, 'Overhead Barbell Press', 'q0:e1')],
    });

    expect(result[0].exercises[1].weight).toBe('40');
    expect(result[0].exercises[1].reps).toBe('8');
  });

  it('removes moderate or severe injury targets left behind by the model', () => {
    const result = applyOperationIntentSafeguards({
      request: "my lower back is sore, adjust today's plan so it doesn't flare up",
      parsedQueue: createQueue(),
      targetedExercises: [createTarget(1, 'Overhead Barbell Press', 'q0:e1')],
    });

    expect(result[0].exercises.map((exercise) => exercise.name)).toEqual(['Dumbbell Press']);
  });

  it('does not run injury removal fallback for explicit remove requests', () => {
    const result = applyOperationIntentSafeguards({
      request: 'I hurt my wrists, take out all the forearm stuff',
      parsedQueue: createQueue(),
      targetedExercises: [createTarget(1, 'Overhead Barbell Press', 'q0:e1')],
    });

    expect(result[0].exercises.map((exercise) => exercise.name)).toEqual([
      'Dumbbell Press',
      'Overhead Barbell Press',
    ]);
  });

  it('repairs explicit numeric clauses the model applied to the wrong resolved target', () => {
    const queue = createQueue();
    queue[0].exercises[0] = {
      ...queue[0].exercises[0],
      name: 'Triangle Rows',
      variant: { grip: 'Neutral Grip' },
      sets: '4',
    };

    const result = applyOperationIntentSafeguards({
      request: 'I want 4 sets of pulldowns and 5 sets of triangle rows',
      parsedQueue: queue,
      targetedExercises: [createTarget(0, 'Triangle Rows', 'q0:e0')],
    });

    expect(result[0].exercises[0].sets).toBe('5');
  });

  it('keeps split but-clauses attached to their own numeric target', () => {
    const queue = createQueue();
    queue[0].exercises[0] = {
      ...queue[0].exercises[0],
      name: 'Calf Press',
      reps: '20',
    };
    queue[0].exercises[1] = {
      ...queue[0].exercises[1],
      name: 'Leg Extensions',
      reps: '20',
    };

    const result = applyOperationIntentSafeguards({
      request: 'make calf press 20 reps but drop leg extensions to 6',
      parsedQueue: queue,
      targetedExercises: [
        createTarget(0, 'Calf Press', 'q0:e0'),
        createTarget(1, 'Leg Extensions', 'q0:e1'),
      ],
    });

    expect(result[0].exercises[0].reps).toBe('20');
    expect(result[0].exercises[1].reps).toBe('6');
  });
});
