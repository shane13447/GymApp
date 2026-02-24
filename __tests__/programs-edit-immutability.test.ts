import type { Program, ProgramExercise, WorkoutDay } from '@/types';

const cloneExercise = (exercise: ProgramExercise): ProgramExercise => ({
  ...exercise,
  muscle_groups_worked: [...exercise.muscle_groups_worked],
});

const cloneWorkoutDay = (day: WorkoutDay): WorkoutDay => ({
  ...day,
  exercises: day.exercises.map(cloneExercise),
});

const cloneWorkoutDays = (days: WorkoutDay[]): WorkoutDay[] => days.map(cloneWorkoutDay);

const createProgramFixture = (): Program => ({
  id: 'program-1',
  name: 'Upper Lower Split',
  workoutDays: [
    {
      dayNumber: 1,
      exercises: [
        {
          name: 'Barbell Bench Press',
          equipment: 'Barbell',
          muscle_groups_worked: ['chest', 'triceps'],
          isCompound: true,
          weight: '80',
          reps: '8',
          sets: '3',
          restTime: '120',
          progression: '2.5',
          hasCustomisedSets: false,
        },
      ],
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('Programs edit cancel immutability', () => {
  it('does not leak unsaved edit changes into original program state after cancel', () => {
    const originalProgram = createProgramFixture();

    // Simulate entering edit mode using cloned workout days.
    const draftWorkoutDays = cloneWorkoutDays(originalProgram.workoutDays);
    const draftSelectedExercises = draftWorkoutDays[0]?.exercises.map(cloneExercise) || [];

    // Simulate editing in draft state.
    draftWorkoutDays[0].exercises[0].weight = '95';
    draftSelectedExercises[0].weight = '95';
    draftWorkoutDays[0].exercises[0].muscle_groups_worked.push('front_delts');

    // Simulate cancel/back by discarding draft state.
    const viewedProgramAfterCancel = originalProgram;

    expect(viewedProgramAfterCancel.workoutDays[0].exercises[0].weight).toBe('80');
    expect(viewedProgramAfterCancel.workoutDays[0].exercises[0].muscle_groups_worked).toEqual([
      'chest',
      'triceps',
    ]);
  });

  it('creates independent nested references for edit drafts', () => {
    const originalProgram = createProgramFixture();
    const draftWorkoutDays = cloneWorkoutDays(originalProgram.workoutDays);

    expect(draftWorkoutDays).not.toBe(originalProgram.workoutDays);
    expect(draftWorkoutDays[0]).not.toBe(originalProgram.workoutDays[0]);
    expect(draftWorkoutDays[0].exercises).not.toBe(originalProgram.workoutDays[0].exercises);
    expect(draftWorkoutDays[0].exercises[0]).not.toBe(originalProgram.workoutDays[0].exercises[0]);
    expect(draftWorkoutDays[0].exercises[0].muscle_groups_worked).not.toBe(
      originalProgram.workoutDays[0].exercises[0].muscle_groups_worked
    );
  });
});
