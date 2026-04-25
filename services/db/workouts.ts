/**
 * Database Workouts Module
 *
 * CRUD operations for completed workouts and logged exercise weights.
 * Extracted from database.ts to keep the facade thin.
 */

import type { ExerciseVariant, ProgramExercise, Workout, WorkoutExercise } from '@/types';

import { getDatabase, runInTransaction } from '@/services/db/connection';
import {
  nonNegativeIntParam,
  optionalPositiveIntParam,
  serializeVariant,
  parseVariant,
  parseStringArrayField,
  parseNumberArrayField,
} from '@/services/db/serialization';
import type { SqlExerciseRow } from '@/services/db/serialization';
import { calculateProgressionRecommendation, getHighestLoggedWeight } from '@/lib/workout-progression';
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

/**
 * Maps a workout exercise SQL row to the app workout exercise model.
 *
 * @param workoutId - Parent workout id used for JSON parse diagnostics.
 * @param ex - SQL row from workout_exercises.
 * @returns WorkoutExercise hydrated with logged values and progression metadata.
 */
const deserializeWorkoutExerciseRow = (workoutId: string, ex: WorkoutExerciseRow): WorkoutExercise => ({
  name: ex.name,
  equipment: ex.equipment,
  muscle_groups_worked: parseStringArrayField(ex.muscle_groups, 'workout_exercises.muscle_groups', {
    workout_id: workoutId,
    exercise: ex.name,
  }),
  isCompound: !!ex.is_compound,
  weight: ex.weight.toString(),
  reps: ex.reps.toString(),
  sets: ex.sets.toString(),
  restTime: ex.rest_time.toString(),
  progression: ex.progression > 0 ? ex.progression.toString() : '',
  hasCustomisedSets: ex.has_customised_sets === 1,
  variant: parseVariant(ex.variant_json),
  repRangeMin: ex.rep_range_min ?? undefined,
  repRangeMax: ex.rep_range_max ?? undefined,
  progressionThreshold: ex.progression_threshold ?? undefined,
  timesRepsHitInARow: nonNegativeIntParam(ex.times_reps_hit_in_a_row),
  loggedWeight: ex.logged_weight,
  loggedReps: ex.logged_reps,
  loggedSetWeights: parseNumberArrayField(ex.logged_set_weights ?? '[]', 'workout_exercises.logged_set_weights', {
    workout_id: workoutId,
    exercise: ex.name,
  }),
  loggedSetReps: parseNumberArrayField(ex.logged_set_reps ?? '[]', 'workout_exercises.logged_set_reps', {
    workout_id: workoutId,
    exercise: ex.name,
  }),
});

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
      exercises: exercises.map((ex) => deserializeWorkoutExerciseRow(workout.id, ex)),
    });
  }

  return result;
};

export const getWorkoutsForProgram = async (programId: string): Promise<Workout[]> => {
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
  }>('SELECT * FROM workouts WHERE program_id = ? ORDER BY date DESC', [programId]);

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
      exercises: exercises.map((ex) => deserializeWorkoutExerciseRow(workout.id, ex)),
    });
  }

  return result;
};

export const getCompletedWorkoutsForProgram = async (programId: string, getWorkoutsForProgramFn: (id: string) => Promise<Workout[]> = getWorkoutsForProgram): Promise<Workout[]> => {
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
         (workout_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, rep_range_min, rep_range_max, progression_threshold, times_reps_hit_in_a_row, logged_weight, logged_reps, logged_set_weights, logged_set_reps, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          optionalPositiveIntParam(exercise.repRangeMin),
          optionalPositiveIntParam(exercise.repRangeMax),
          optionalPositiveIntParam(exercise.progressionThreshold),
          nonNegativeIntParam(exercise.timesRepsHitInARow),
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

export const clearAllWorkouts = async (): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM workouts');
};

export const getLastLoggedWeight = async (
  exerciseName: string,
  programId: string,
  variant?: ExerciseVariant | null
): Promise<number | null> => {
  const database = await getDatabase();
  const serialisedVariant = serializeVariant(variant);

  const result = await database.getFirstAsync<{ logged_weight: number; logged_set_weights: string | null }>(
    `SELECT we.logged_weight, we.logged_set_weights
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.name = ?
       AND ((? = '' AND (we.variant_json = '' OR we.variant_json IS NULL)) OR we.variant_json = ?)
       AND w.program_id = ?
       AND w.completed = 1
       AND (we.logged_weight > 0 OR we.logged_set_weights != '[]')
     ORDER BY w.date DESC
     LIMIT 1`,
    [exerciseName, serialisedVariant, serialisedVariant, programId]
  );

  if (!result) {
    return null;
  }

  const highestWeight = getHighestLoggedWeight({
    loggedWeight: result.logged_weight,
    loggedSetWeights: parseNumberArrayField(result.logged_set_weights ?? '[]', 'workout_exercises.logged_set_weights', {
      exercise: exerciseName,
      program_id: programId,
    }),
  });

  return highestWeight > 0 ? highestWeight : null;
};

/**
 * Gets the next progression recommendation for a program exercise from workout history.
 *
 * @param exercise - Program exercise being queued or loaded.
 * @param programId - Program id whose completed workout history should be scanned.
 * @returns Recommended weight and optional double-progression hit counter.
 */
export const getProgressionRecommendationForExercise = async (
  exercise: ProgramExercise,
  programId: string
): Promise<{ weight: number; timesRepsHitInARow?: number }> => {
  const database = await getDatabase();
  const serialisedVariant = serializeVariant(exercise.variant);

  const rows = await database.getAllAsync<WorkoutExerciseRow & { workout_id: string }>(
    `SELECT we.*, w.id as workout_id
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.name = ?
       AND ((? = '' AND (we.variant_json = '' OR we.variant_json IS NULL)) OR we.variant_json = ?)
       AND w.program_id = ?
       AND w.completed = 1
     ORDER BY w.date DESC`,
    [exercise.name, serialisedVariant, serialisedVariant, programId]
  );

  const history = rows.map((row) => deserializeWorkoutExerciseRow(row.workout_id, row));
  return calculateProgressionRecommendation(exercise, history);
};
