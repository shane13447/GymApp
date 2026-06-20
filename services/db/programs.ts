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

import type { Program, WorkoutDay } from '@/types';

import { getDatabase, runInTransaction } from '@/services/db/connection';
import {
  deserializeProgramExerciseRow,
  serializeExerciseToSqlParams,
} from '@/services/db/serialization';
import type { SqlExerciseRow } from '@/services/db/serialization';
import { cloneWorkoutDays } from '@/services/programs/clone';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load all workout days (with their ordered exercises) for a program.
 *
 * @param {string} programId - The program whose workout days should be loaded.
 * @returns {Promise<WorkoutDay[]>} The program's workout days ordered by day number.
 */
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

/**
 * Derive a unique program id for a duplicate by appending a copy suffix and
 * the current timestamp to the source id.
 *
 * @param {string} sourceProgramId - The id of the program being duplicated.
 * @returns {string} A new, timestamped duplicate program id.
 */
const createDuplicateProgramId = (sourceProgramId: string): string => {
  return `${sourceProgramId}-copy-${Date.now()}`;
};

/**
 * Build a duplicate program draft (without timestamps) from a source program,
 * assigning a fresh id and the supplied name and deep-cloning all workout days
 * and exercises via the shared `cloneWorkoutDays` helper.
 *
 * @param {Program} program - The source program to duplicate.
 * @param {string} duplicateName - The name to give the duplicate.
 * @returns {Omit<Program, 'createdAt' | 'updatedAt'>} A program draft ready to be created.
 */
const cloneProgramForDuplicate = (program: Program, duplicateName: string): Omit<Program, 'createdAt' | 'updatedAt'> => ({
  id: createDuplicateProgramId(program.id),
  name: duplicateName,
  workoutDays: cloneWorkoutDays(program.workoutDays),
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

/**
 * Load every program with its workout days, newest first.
 *
 * @returns {Promise<Program[]>} All stored programs ordered by creation date descending.
 */
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

/**
 * Load a single program (with its workout days) by id.
 *
 * @param {string} programId - The id of the program to load.
 * @returns {Promise<Program | null>} The program, or null if it does not exist.
 */
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

/**
 * Persist a new program along with its workout days and exercises, atomically
 * within a transaction. Timestamps are generated server-side.
 *
 * @param {Omit<Program, 'createdAt' | 'updatedAt'>} program - The program draft to create.
 * @returns {Promise<Program>} The created program including its generated timestamps.
 */
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
        const { sql, params } = serializeExerciseToSqlParams(day.exercises[i], i, dayId);
        await database.runAsync(sql, params);
      }
    }
  });

  return {
    ...program,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Update an existing program's name and fully replace its workout days and
 * exercises, atomically within a transaction.
 *
 * @param {Program} program - The full program to persist (existing days are replaced).
 * @returns {Promise<void>} Resolves when the update has committed.
 */
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
        const { sql, params } = serializeExerciseToSqlParams(day.exercises[i], i, dayId);
        await database.runAsync(sql, params);
      }
    }
  });
};

/**
 * Duplicate a program under a new, trimmed name. Validates that the name is
 * non-empty and not already used by another program before creating the copy.
 * Data access is injected via `deps` to avoid circular imports.
 *
 * @param {string} programId - The id of the program to duplicate.
 * @param {string} duplicateNameRaw - The desired name for the duplicate (trimmed before use).
 * @param {{ getProgramById: (id: string) => Promise<Program | null>; getAllPrograms: () => Promise<Program[]>; createProgram: (draft: Omit<Program, 'createdAt' | 'updatedAt'>) => Promise<Program>; }} deps - Injected data-access functions.
 * @returns {Promise<Program>} The newly created duplicate program.
 * @throws {Error} If the name is empty, the source program is missing, or the name collides.
 */
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

/**
 * Delete a program and, if it was the current program, clear the current
 * selection. When the deleted program corresponds to a seed, its lifecycle
 * state is marked as deleted by the user. Cross-cutting operations are injected
 * via `deps` to avoid circular imports.
 *
 * @param {string} programId - The id of the program to delete.
 * @param {{ getUserPreferences: GetUserPreferencesFn; setCurrentProgramId: SetCurrentProgramIdFn; setSeedLifecycleStateWithDatabase: SetSeedLifecycleStateWithDbFn; getSeedStateColumn: GetSeedStateColumnFn; }} deps - Injected cross-cutting dependencies.
 * @returns {Promise<void>} Resolves once deletion (and any current-program reset) completes.
 */
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

  const prefs = await deps.getUserPreferences();
  const wasCurrent = prefs.currentProgramId === programId;

  const deletedRows = await runInTransaction(database, async () => {
    const deleteResult = await database.runAsync('DELETE FROM programs WHERE id = ?', [programId]);
    const rows = typeof deleteResult?.changes === 'number' ? deleteResult.changes : 0;

    if (rows > 0 && deps.getSeedStateColumn(programId)) {
      await deps.setSeedLifecycleStateWithDatabase(database, programId, 'deleted_by_user');
    }

    return rows;
  });

  if (wasCurrent && deletedRows > 0) {
    await deps.setCurrentProgramId(null);
  }
};
