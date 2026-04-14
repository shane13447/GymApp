/**
 * Database Programs Module
 *
 * CRUD operations for programs and workout days.
 * Extracted from database.ts to keep the facade thin.
 *
 * Cross-cutting dependencies (getUserPreferences, setCurrentProgramId,
 * setSeedLifecycleStateWithDatabase) are injected at the facade layer
 * to avoid circular imports.
 */

import type { Program, ProgramExercise, WorkoutDay } from '@/types';

import { getDatabase, runInTransaction } from '@/services/db/connection';
import {
  serializeVariant,
  deserializeProgramExerciseRow,
} from '@/services/db/serialization';
import type { SqlExerciseRow } from '@/services/db/serialization';
import { safeParseFloat, safeParseInt } from '@/lib/safe-convert';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const getWorkoutDaysForProgram = async (programId: string): Promise<WorkoutDay[]> => {
  const database = await getDatabase();

  const days = await database.getAllAsync<{
    id: number;
    program_id: string;
    day_number: number;
  }>('SELECT * FROM workout_days WHERE program_id = ? ORDER BY day_number', [programId]);

  const result: WorkoutDay[] = [];

  for (const day of days) {
    const exercises = await database.getAllAsync<SqlExerciseRow>(
      'SELECT * FROM program_exercises WHERE workout_day_id = ? ORDER BY position',
      [day.id]
    );

    result.push({
      dayNumber: day.day_number,
      exercises: exercises.map(deserializeProgramExerciseRow),
    });
  }

  return result;
};

const createDuplicateProgramId = (sourceProgramId: string): string => {
  return `${sourceProgramId}-copy-${Date.now()}`;
};

const cloneProgramExerciseForDuplicate = (exercise: ProgramExercise): ProgramExercise => ({
  ...exercise,
  muscle_groups_worked: [...exercise.muscle_groups_worked],
  variant: exercise.variant
    ? {
        ...exercise.variant,
        extras: exercise.variant.extras ? [...exercise.variant.extras] : undefined,
      }
    : null,
  variantOptions: exercise.variantOptions
    ? exercise.variantOptions.map((option) => ({
        ...option,
        aliases: option.aliases ? [...option.aliases] : undefined,
      }))
    : undefined,
  aliases: exercise.aliases ? [...exercise.aliases] : undefined,
});

const cloneProgramForDuplicate = (program: Program, duplicateName: string): Omit<Program, 'createdAt' | 'updatedAt'> => ({
  id: createDuplicateProgramId(program.id),
  name: duplicateName,
  workoutDays: program.workoutDays.map((day) => ({
    dayNumber: day.dayNumber,
    exercises: day.exercises.map(cloneProgramExerciseForDuplicate),
  })),
});

// ---------------------------------------------------------------------------
// Dependency injection types
// ---------------------------------------------------------------------------

type GetUserPreferencesFn = () => Promise<{ currentProgramId: string | null }>;
type SetCurrentProgramIdFn = (programId: string | null) => Promise<void>;
type SetSeedLifecycleStateWithDbFn = (database: import('expo-sqlite').SQLiteDatabase, seedId: string, state: 'pending' | 'seeded' | 'deleted_by_user') => Promise<void>;
type GetSeedStateColumnFn = (seedId: string) => string | null;

// ---------------------------------------------------------------------------
// Exported CRUD
// ---------------------------------------------------------------------------

export const getAllPrograms = async (): Promise<Program[]> => {
  const database = await getDatabase();

  const programs = await database.getAllAsync<{
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM programs ORDER BY created_at DESC');

  const result: Program[] = [];

  for (const program of programs) {
    const workoutDays = await getWorkoutDaysForProgram(program.id);
    result.push({
      id: program.id,
      name: program.name,
      workoutDays,
      createdAt: program.created_at,
      updatedAt: program.updated_at,
    });
  }

  return result;
};

export const getProgramById = async (programId: string): Promise<Program | null> => {
  const database = await getDatabase();

  const program = await database.getFirstAsync<{
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM programs WHERE id = ?', [programId]);

  if (!program) return null;

  const workoutDays = await getWorkoutDaysForProgram(program.id);

  return {
    id: program.id,
    name: program.name,
    workoutDays,
    createdAt: program.created_at,
    updatedAt: program.updated_at,
  };
};

export const createProgram = async (program: Omit<Program, 'createdAt' | 'updatedAt'>): Promise<Program> => {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await runInTransaction(database, async () => {
    await database.runAsync(
      'INSERT INTO programs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [program.id, program.name, now, now]
    );

    for (const day of program.workoutDays) {
      const dayResult = await database.runAsync(
        'INSERT INTO workout_days (program_id, day_number) VALUES (?, ?)',
        [program.id, day.dayNumber]
      );

      const dayId = dayResult.lastInsertRowId;

      for (let i = 0; i < day.exercises.length; i++) {
        const exercise = day.exercises[i];
        const muscleGroups = exercise.muscle_groups_worked ?? [];
        await database.runAsync(
          `INSERT INTO program_exercises
           (workout_day_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dayId,
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
            i,
          ]
        );
      }
    }
  });

  return {
    ...program,
    createdAt: now,
    updatedAt: now,
  };
};

export const updateProgram = async (program: Program): Promise<void> => {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await runInTransaction(database, async () => {
    await database.runAsync(
      'UPDATE programs SET name = ?, updated_at = ? WHERE id = ?',
      [program.name, now, program.id]
    );

    await database.runAsync('DELETE FROM workout_days WHERE program_id = ?', [program.id]);

    for (const day of program.workoutDays) {
      const dayResult = await database.runAsync(
        'INSERT INTO workout_days (program_id, day_number) VALUES (?, ?)',
        [program.id, day.dayNumber]
      );

      const dayId = dayResult.lastInsertRowId;

      for (let i = 0; i < day.exercises.length; i++) {
        const exercise = day.exercises[i];
        const muscleGroups = exercise.muscle_groups_worked ?? [];
        await database.runAsync(
          `INSERT INTO program_exercises
           (workout_day_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dayId,
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
            i,
          ]
        );
      }
    }
  });
};

export const duplicateProgram = async (
  programId: string,
  duplicateNameRaw: string,
  deps: {
    getProgramById: (id: string) => Promise<Program | null>;
    getAllPrograms: () => Promise<Program[]>;
    createProgram: (draft: Omit<Program, 'createdAt' | 'updatedAt'>) => Promise<Program>;
  }
): Promise<Program> => {
  const duplicateName = duplicateNameRaw.trim();
  if (!duplicateName) {
    throw new Error('Program name is required');
  }

  const sourceProgram = await deps.getProgramById(programId);
  if (!sourceProgram) {
    throw new Error('Program not found');
  }

  const allPrograms = await deps.getAllPrograms();
  const hasNameCollision = allPrograms.some(
    (program) => program.id !== programId && program.name.toLowerCase() === duplicateName.toLowerCase()
  );

  if (hasNameCollision) {
    throw new Error('Program name already exists');
  }

  const duplicateDraft = cloneProgramForDuplicate(sourceProgram, duplicateName);
  return deps.createProgram(duplicateDraft);
};

export const deleteProgram = async (
  programId: string,
  deps: {
    getUserPreferences: GetUserPreferencesFn;
    setCurrentProgramId: SetCurrentProgramIdFn;
    setSeedLifecycleStateWithDatabase: SetSeedLifecycleStateWithDbFn;
    getSeedStateColumn: GetSeedStateColumnFn;
  }
): Promise<void> => {
  const database = await getDatabase();

  await runInTransaction(database, async () => {
    const prefs = await deps.getUserPreferences();
    if (prefs.currentProgramId === programId) {
      await deps.setCurrentProgramId(null);
    }

    const deleteResult = await database.runAsync('DELETE FROM programs WHERE id = ?', [programId]);
    const deletedRows = typeof deleteResult?.changes === 'number' ? deleteResult.changes : 0;

    if (deletedRows > 0 && deps.getSeedStateColumn(programId)) {
      await deps.setSeedLifecycleStateWithDatabase(database, programId, 'deleted_by_user');
    }
  });
};