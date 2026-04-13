/**
 * Database Workouts Module
 *
 * CRUD operations for completed workouts and logged exercise weights.
 * Extracted from database.ts to keep the facade thin.
 */

import type { ExerciseVariant, Workout } from '@/types';

import { getDatabase, runInTransaction } from '@/services/db/connection';
import {
  serializeVariant,
  parseVariant,
  parseStringArrayField,
  parseNumberArrayField,
} from '@/services/db/serialization';
import type { SqlExerciseRow } from '@/services/db/serialization';
import { safeParseFloat, safeParseInt } from '@/lib/safe-convert';

// ---------------------------------------------------------------------------
// Workout exercises row type (extends SqlExerciseRow with workout-specific fields)
// ---------------------------------------------------------------------------

type WorkoutExerciseRow = SqlExerciseRow & {
  logged_weight: number;
  logged_reps: number;
  logged_set_weights: string;
  logged_set_reps: string;
};

// ---------------------------------------------------------------------------
// Exported CRUD
// ---------------------------------------------------------------------------

export const getAllWorkouts = async (): Promise<Workout[]> => {
  const database = await getDatabase();

  const workouts = await database.getAllAsync<{
    id: string;
    date: string;
    program_id: string;
    program_name: string;
    day_number: number;
    completed: number;
    duration: number | null;
    notes: string | null;
  }>('SELECT * FROM workouts ORDER BY date DESC');

  const result: Workout[] = [];

  for (const workout of workouts) {
    const exercises = await database.getAllAsync<WorkoutExerciseRow>(
      'SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position',
      [workout.id]
    );

    result.push({
      id: workout.id,
      date: workout.date,
      programId: workout.program_id,
      programName: workout.program_name,
      dayNumber: workout.day_number,
      completed: workout.completed === 1,
      duration: workout.duration ?? undefined,
      notes: workout.notes ?? undefined,
      exercises: exercises.map((ex) => ({
        name: ex.name,
        equipment: ex.equipment,
        muscle_groups_worked: parseStringArrayField(ex.muscle_groups, 'workout_exercises.muscle_groups', {
          workout_id: workout.id,
          exercise: ex.name,
        }),
        isCompound: !!ex.is_compound,
        weight: ex.weight.toString(),
        reps: ex.reps.toString(),
        sets: ex.sets.toString(),
        restTime: ex.rest_time.toString(),
        progression: ex.progression.toString(),
        hasCustomisedSets: ex.has_customised_sets === 1,
        variant: parseVariant(ex.variant_json),
        loggedWeight: ex.logged_weight,
        loggedReps: ex.logged_reps,
        loggedSetWeights: parseNumberArrayField(ex.logged_set_weights ?? '[]', 'workout_exercises.logged_set_weights', {
          workout_id: workout.id,
          exercise: ex.name,
        }),
        loggedSetReps: parseNumberArrayField(ex.logged_set_reps ?? '[]', 'workout_exercises.logged_set_reps', {
          workout_id: workout.id,
          exercise: ex.name,
        }),
      })),
    });
  }

  return result;
};

export const getWorkoutsForProgram = async (programId: string, getAllWorkoutsFn: () => Promise<Workout[]>): Promise<Workout[]> => {
  const allWorkouts = await getAllWorkoutsFn();
  return allWorkouts.filter((w) => w.programId === programId);
};

export const getCompletedWorkoutsForProgram = async (programId: string, getWorkoutsForProgramFn: (id: string) => Promise<Workout[]>): Promise<Workout[]> => {
  const workouts = await getWorkoutsForProgramFn(programId);
  return workouts.filter((w) => w.completed);
};

export const saveWorkout = async (workout: Workout): Promise<void> => {
  const database = await getDatabase();

  await runInTransaction(database, async () => {
    await database.runAsync(
      `INSERT INTO workouts (id, date, program_id, program_name, day_number, completed, duration, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workout.id,
        workout.date,
        workout.programId,
        workout.programName,
        workout.dayNumber,
        workout.completed ? 1 : 0,
        workout.duration ?? null,
        workout.notes ?? null,
      ]
    );

    for (let i = 0; i < workout.exercises.length; i++) {
      const exercise = workout.exercises[i];
      const muscleGroups = exercise.muscle_groups_worked ?? [];
      await database.runAsync(
        `INSERT INTO workout_exercises
         (workout_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, logged_weight, logged_reps, logged_set_weights, logged_set_reps, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workout.id,
          exercise.name ?? '',
          exercise.equipment ?? '',
          JSON.stringify(muscleGroups),
          exercise.isCompound ? 1 : 0,
          safeParseFloat(exercise.weight, 0),
          safeParseInt(exercise.reps, 8),
          safeParseInt(exercise.sets, 3),
          safeParseInt(exercise.restTime, 180),
          safeParseFloat(exercise.progression, 0),
          exercise.hasCustomisedSets ? 1 : 0,
          serializeVariant(exercise.variant),
          exercise.loggedWeight ?? 0,
          exercise.loggedReps ?? 0,
          JSON.stringify(exercise.loggedSetWeights ?? []),
          JSON.stringify(exercise.loggedSetReps ?? []),
          i,
        ]
      );
    }
  });
};

export const deleteWorkout = async (workoutId: string): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM workouts WHERE id = ?', [workoutId]);
};

export const getLastLoggedWeight = async (
  exerciseName: string,
  programId: string,
  variant?: ExerciseVariant | null
): Promise<number | null> => {
  const database = await getDatabase();

  const serialisedVariant = serializeVariant(variant);

  if (serialisedVariant) {
    const variantResult = await database.getFirstAsync<{ logged_weight: number }>(
      `SELECT we.logged_weight
       FROM workout_exercises we
       JOIN workouts w ON we.workout_id = w.id
       WHERE we.name = ?
         AND we.variant_json = ?
         AND w.program_id = ?
         AND w.completed = 1
         AND we.logged_weight > 0
       ORDER BY w.date DESC
       LIMIT 1`,
      [exerciseName, serialisedVariant, programId]
    );

    if (variantResult?.logged_weight !== undefined) {
      return variantResult.logged_weight;
    }
  }

  const result = await database.getFirstAsync<{ logged_weight: number }>(
    `SELECT we.logged_weight
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.name = ? AND w.program_id = ? AND w.completed = 1 AND we.logged_weight > 0
     ORDER BY w.date DESC
     LIMIT 1`,
    [exerciseName, programId]
  );

  return result?.logged_weight ?? null;
};