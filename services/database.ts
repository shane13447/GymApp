/**
 * SQLite Database Service
 * 
 * Handles all database operations for the Gym App including:
 * - Database initialization and migrations
 * - CRUD operations for programs, workouts, and workout queue
 * - Data validation and error handling
 */

import { DATABASE_NAME, DEFAULT_QUEUE_SIZE } from '@/constants';
import exercisesData from '@/data/exerciseSelection.json';
import type {
  ExerciseVariant,
  MuscleGroupTarget,
  Program,
  ProgramExercise,
  UserPreferences,
  UserProfile,
  Workout,
  WorkoutDay,
  WorkoutQueueItem
} from '@/types';
import { TrainingGoal } from '@/types';
import * as SQLite from 'expo-sqlite';

import {
  serializeVariant,
  parseStringArrayField,
  parseNumberArrayField,
  parseVariant,
  serializeExerciseToSqlParams,
  serializeQueueExerciseToSqlParams,
  deserializeProgramExerciseRow,
} from '@/services/db/serialization';
import type { SqlExerciseRow } from '@/services/db/serialization';
import {
  getDb,
  setDb,
  getInitPromise,
  setInitPromise,
  getMaintenancePromise,
  setMaintenancePromise,
  isMaintenanceCompleted,
  setMaintenanceCompleted,
  runInTransaction,
  logStartupStage,
} from '@/services/db/connection';

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

/**
 * QUEUE GENERATION LOCK: Prevents race conditions when switching programs rapidly.
 * Each call to generateWorkoutQueue increments this ID. If a newer request starts,
 * the older one will abort before writing to the database.
 */
let currentQueueGenerationId = 0;

type SeedFixtureExercise = {
  name: string;
  variant?: Record<string, string | string[]>;
  reps: number[];
  weight: number[];
};

type SeedFixtureDay = {
  dayNumber: number;
  exercises: SeedFixtureExercise[];
};

type SeedFixture = SeedFixtureDay[];

type SeedCatalogEntry = {
  equipment?: string;
  muscle_groups_worked?: string[];
  isCompound?: boolean;
};

// Keep fixture imports on lowercase .json extensions.
// Metro's resolver extension list is lowercase-only (json), and .JSON can fail during Android bundling.
const testProgramFixtureRaw = require('../data/TestProgram.json') as unknown;
const testProgram2FixtureRaw = require('../data/TestProgram2.json') as unknown;

const normaliseSeedFixtureModule = (fixtureModule: unknown): SeedFixture => {
  const normalised =
    fixtureModule && typeof fixtureModule === 'object' && 'default' in fixtureModule
      ? (fixtureModule as { default: unknown }).default
      : fixtureModule;

  return Array.isArray(normalised) ? (normalised as SeedFixture) : [];
};

const STATIC_SEED_FIXTURES: Record<'TestProgram.json' | 'TestProgram2.json', SeedFixture> = {
  'TestProgram.json': normaliseSeedFixtureModule(testProgramFixtureRaw),
  'TestProgram2.json': normaliseSeedFixtureModule(testProgram2FixtureRaw),
};

const loadSeedFixture = (fixtureFileName: 'TestProgram.json' | 'TestProgram2.json'): SeedFixture => {
  const fixture = STATIC_SEED_FIXTURES[fixtureFileName];
  return Array.isArray(fixture) ? fixture : [];
};

const SEED_PROGRAMS = [
  {
    id: 'seed-test-program',
    name: 'Test Program',
    fixtureName: 'TestProgram.json' as const,
  },
  {
    id: 'seed-3day-full-body',
    name: '3 Day Full body',
    fixtureName: 'TestProgram2.json' as const,
  },
] as const;

const SEED_STATE_KEY_BY_ID: Record<string, 'seed_test_program_state' | 'seed_3day_full_body_state'> = {
  'seed-test-program': 'seed_test_program_state',
  'seed-3day-full-body': 'seed_3day_full_body_state',
};

const ALLOWLISTED_SEED_STATE_COLUMNS = new Set<string>([
  'seed_test_program_state',
  'seed_3day_full_body_state',
]);

const getSeedStateColumn = (seedId: string): 'seed_test_program_state' | 'seed_3day_full_body_state' | null =>
  SEED_STATE_KEY_BY_ID[seedId] ?? null;

const buildSeedCatalogIndex = (): Record<string, SeedCatalogEntry> =>
  (exercisesData as Array<SeedCatalogEntry & { name?: string }>).reduce<Record<string, SeedCatalogEntry>>(
    (acc, entry) => {
      if (typeof entry.name === 'string' && entry.name.trim()) {
        acc[entry.name.toLowerCase()] = {
          equipment: entry.equipment,
          muscle_groups_worked: Array.isArray(entry.muscle_groups_worked)
            ? entry.muscle_groups_worked
            : [],
          isCompound: Boolean(entry.isCompound),
        };
      }
      return acc;
    },
    {}
  );

const createProgramWithDatabase = async (
  database: SQLite.SQLiteDatabase,
  program: Omit<Program, 'createdAt' | 'updatedAt'>
): Promise<boolean> => {
  const now = new Date().toISOString();

  return runInTransaction(database, async () => {
    const result = await database.runAsync(
      'INSERT OR IGNORE INTO programs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [program.id, program.name, now, now]
    );

    const insertChanges = typeof result?.changes === 'number' ? result.changes : 1;
    if (insertChanges === 0) {
      return false;
    }

    for (const day of program.workoutDays) {
      const dayResult = await database.runAsync(
        'INSERT INTO workout_days (program_id, day_number) VALUES (?, ?)',
        [program.id, day.dayNumber]
      );

      const dayId = dayResult?.lastInsertRowId ?? null;

      for (let i = 0; i < day.exercises.length; i++) {
        const exercise = day.exercises[i];
        await database.runAsync(
          `INSERT INTO program_exercises
           (workout_day_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dayId,
            exercise.name ?? '',
            exercise.equipment ?? '',
            JSON.stringify(exercise.muscle_groups_worked ?? []),
            exercise.isCompound ? 1 : 0,
            parseFloat(exercise.weight) || 0,
            parseInt(exercise.reps, 10) || 8,
            parseInt(exercise.sets, 10) || 3,
            parseInt(exercise.restTime, 10) || 180,
            parseFloat(exercise.progression) || 0,
            exercise.hasCustomisedSets ? 1 : 0,
            serializeVariant(exercise.variant),
            i,
          ]
        );
      }
    }

    return true;
  });
};

const setSeedLifecycleStateWithDatabase = async (
  database: SQLite.SQLiteDatabase,
  seedId: string,
  state: SeedLifecycleState
): Promise<void> => {
  const column = getSeedStateColumn(seedId);
  if (!column || !ALLOWLISTED_SEED_STATE_COLUMNS.has(column)) {
    return;
  }

  await database.runAsync(
    `UPDATE user_preferences SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [state, 'default']
  );
};

const getSeedLifecycleStateWithDatabase = async (
  database: SQLite.SQLiteDatabase,
  seedId: string
): Promise<SeedLifecycleState> => {
  const column = getSeedStateColumn(seedId);
  if (!column || !ALLOWLISTED_SEED_STATE_COLUMNS.has(column)) {
    return 'pending';
  }

  const row = await database.getFirstAsync<Record<string, string | null>>(
    `SELECT ${column} FROM user_preferences WHERE id = ?`,
    ['default']
  );

  const value = row?.[column];
  if (value === 'seeded' || value === 'deleted_by_user') {
    return value;
  }

  return 'pending';
};

const hasSeedProgramStructure = async (
  database: SQLite.SQLiteDatabase,
  seedId: string
): Promise<boolean> => {
  const workoutDays = await database.getAllAsync<{ id: number }>(
    'SELECT * FROM workout_days WHERE program_id = ?',
    [seedId]
  );

  if (workoutDays.length === 0) {
    return false;
  }

  for (const workoutDay of workoutDays) {
    const exercises = await database.getAllAsync<{ id: number }>(
      'SELECT * FROM program_exercises WHERE workout_day_id = ?',
      [workoutDay.id]
    );

    if (exercises.length > 0) {
      return true;
    }
  }

  return false;
};

const seedTestProgramsIfMissing = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  const catalogIndex = buildSeedCatalogIndex();
  const seedIds = SEED_PROGRAMS.map((seedProgram) => seedProgram.id);

  const existingRows = await database.getAllAsync<{ id: string }>(
    `SELECT id FROM programs WHERE id IN (${seedIds.map(() => '?').join(', ')})`,
    seedIds
  );
  const existingProgramIds = new Set(existingRows.map((row) => row.id));

  for (const seedProgram of SEED_PROGRAMS) {
    const lifecycleState = await getSeedLifecycleStateWithDatabase(database, seedProgram.id);

    if (lifecycleState === 'deleted_by_user') {
      continue;
    }

    if (existingProgramIds.has(seedProgram.id)) {
      const hasStructure = await hasSeedProgramStructure(database, seedProgram.id);
      if (!hasStructure) {
        await database.runAsync('DELETE FROM programs WHERE id = ?', [seedProgram.id]);
        existingProgramIds.delete(seedProgram.id);
        if (lifecycleState === 'seeded') {
          await setSeedLifecycleStateWithDatabase(database, seedProgram.id, 'pending');
        }
      } else {
        if (lifecycleState !== 'seeded') {
          await setSeedLifecycleStateWithDatabase(database, seedProgram.id, 'seeded');
        }
        continue;
      }
    }

    const stateAfterIntegrityCheck = await getSeedLifecycleStateWithDatabase(database, seedProgram.id);
    if (stateAfterIntegrityCheck !== 'pending') {
      continue;
    }

    const fixture = loadSeedFixture(seedProgram.fixtureName);
    const validation = validateSeedFixture(fixture);
    if (!validation.isValid) {
      console.warn('[seed-programs]', {
        seed_id: seedProgram.id,
        fixture: seedProgram.fixtureName,
        reason: 'validation_failed',
        detail: validation.reason,
      });
      continue;
    }

    try {
      const mappedProgram = mapSeedFixtureToProgram(
        seedProgram.id,
        seedProgram.name,
        fixture,
        catalogIndex
      );

      const inserted = await createProgramWithDatabase(database, mappedProgram);
      if (inserted) {
        existingProgramIds.add(seedProgram.id);
      }

      await setSeedLifecycleStateWithDatabase(database, seedProgram.id, 'seeded');
    } catch (error) {
      console.warn('[seed-programs]', {
        seed_id: seedProgram.id,
        fixture: seedProgram.fixtureName,
        reason: 'insert_failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

export const validateSeedFixture = (fixture: unknown): { isValid: boolean; reason?: string } => {
  if (!Array.isArray(fixture)) {
    return { isValid: false, reason: 'Fixture must be an array of days.' };
  }

  if (fixture.length === 0) {
    return { isValid: false, reason: 'Fixture must contain at least one workout day.' };
  }

  for (let dayIndex = 0; dayIndex < fixture.length; dayIndex++) {
    const day = fixture[dayIndex] as SeedFixtureDay;

    if (!Number.isInteger(day?.dayNumber) || day.dayNumber < 1) {
      return { isValid: false, reason: `Invalid dayNumber at index ${dayIndex}.` };
    }

    if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
      return { isValid: false, reason: `Invalid exercises array at day index ${dayIndex}.` };
    }

    for (let exerciseIndex = 0; exerciseIndex < day.exercises.length; exerciseIndex++) {
      const exercise = day.exercises[exerciseIndex];

      if (typeof exercise?.name !== 'string' || !exercise.name.trim()) {
        return {
          isValid: false,
          reason: `Invalid exercise name at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (!Array.isArray(exercise.reps) || !Array.isArray(exercise.weight)) {
        return {
          isValid: false,
          reason: `Missing reps/weight arrays at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.reps.length === 0 || exercise.weight.length === 0) {
        return {
          isValid: false,
          reason: `Empty reps/weight arrays at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.reps.length !== exercise.weight.length) {
        return {
          isValid: false,
          reason: `Mismatched reps/weight lengths at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.reps.some((value) => !Number.isFinite(value))) {
        return {
          isValid: false,
          reason: `Invalid reps values at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }

      if (exercise.weight.some((value) => !Number.isFinite(value))) {
        return {
          isValid: false,
          reason: `Invalid weight values at day ${dayIndex}, exercise ${exerciseIndex}.`,
        };
      }
    }
  }

  return { isValid: true };
};

export const mapSeedFixtureToProgram = (
  programId: string,
  programName: string,
  fixture: SeedFixture,
  catalogIndex: Record<string, SeedCatalogEntry>
): Omit<Program, 'createdAt' | 'updatedAt'> => ({
  id: programId,
  name: programName,
  workoutDays: fixture.map((day) => ({
    dayNumber: day.dayNumber,
    exercises: day.exercises.map((exercise) => {
      const catalogEntry = catalogIndex[exercise.name.toLowerCase()];

      return {
        name: exercise.name,
        equipment: catalogEntry?.equipment ?? '',
        muscle_groups_worked: catalogEntry?.muscle_groups_worked ?? [],
        isCompound: catalogEntry?.isCompound ?? false,
        variant: exercise.variant ?? null,
        weight: String(exercise.weight[0]),
        reps: String(exercise.reps[0]),
        sets: String(exercise.reps.length),
        restTime: '180',
        progression: '0',
        hasCustomisedSets: true,
      } as ProgramExercise;
    }),
  })),
});

/**
 * Get the database instance, initializing if necessary
 *
 * RACE CONDITION FIX: Uses a shared promise to ensure only one initialization
 * happens even when multiple callers request the database simultaneously.
 * Without this, concurrent calls could:
 * 1. All see db === null
 * 2. All start openDatabaseAsync
 * 3. Cause NullPointerException when accessing partially initialized DB
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  const existingDb = getDb();
  if (existingDb) {
    return existingDb;
  }

  const existingPromise = getInitPromise();
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    try {
      logStartupStage('db_open_start');
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
      logStartupStage('db_open_end');

      logStartupStage('db_schema_start');
      await initializeDatabase(database);
      logStartupStage('db_schema_end');

      setDb(database);
      return database;
    } catch (error) {
      setInitPromise(null);
      throw error;
    }
  })();

  setInitPromise(promise);
  return promise;
};

/**
 * Deferred database maintenance
 *
 * BUG (ChatGPT audit): runDeferredDatabaseMaintenance contains seed seeding and orphaned timer
 * cleanup that could block first render if called synchronously. The deferred pattern is correct
 * for startup performance, but the function currently has no error recovery for partial failures
 * (e.g., seed succeeds but timer cleanup fails). Fix: Add per-step try/catch with fallback
 * behaviour during the refactor; each maintenance step should be independently resilient.
 */
export const runDeferredDatabaseMaintenance = async (): Promise<void> => {
  if (isMaintenanceCompleted()) {
    return;
  }

  const existing = getMaintenancePromise();
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const database = await getDatabase();

    logStartupStage('seed_start');
    await seedTestProgramsIfMissing(database);
    logStartupStage('seed_end');

    logStartupStage('timer_cleanup_start');
    await cleanupOrphanedTimersWithDatabase(database);
    logStartupStage('timer_cleanup_end');

    setMaintenanceCompleted(true);
  })().catch((error) => {
    setMaintenancePromise(null);
    throw error;
  });

  setMaintenancePromise(promise);
  return promise;
};

export const validateWorkoutQueueForPersistence = (queue: WorkoutQueueItem[]): void => {
  const seenIds = new Set<string>();

  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];

    if (!item?.id) {
      throw new Error(`Invalid queue item at index ${index}: missing id.`);
    }

    if (seenIds.has(item.id)) {
      throw new Error(`Invalid queue: duplicate queue item id "${item.id}".`);
    }
    seenIds.add(item.id);

    if (!item.programId) {
      throw new Error(`Invalid queue item "${item.id}": missing programId.`);
    }

    if (!Number.isInteger(item.dayNumber) || item.dayNumber < 1) {
      throw new Error(`Invalid queue item "${item.id}": dayNumber must be a positive integer.`);
    }

    if (!Array.isArray(item.exercises) || item.exercises.length === 0) {
      throw new Error(`Invalid queue item "${item.id}": exercises must be a non-empty array.`);
    }

    for (const exercise of item.exercises) {
      if (!exercise) {
        throw new Error(`Invalid queue item "${item.id}": exercise entry is missing.`);
      }

      if (exercise.hasCustomisedSets) {
        const sets = Number.parseInt(exercise.sets, 10);
        if (!Number.isInteger(sets) || sets < 1) {
          throw new Error(`Invalid queue item "${item.id}": customised set semantics are invalid.`);
        }
      }
    }
  }
};

/**
 * Initialize database schema
 * 
 * MIGRATION STRATEGY:
 * SQLite's CREATE TABLE IF NOT EXISTS won't update existing tables.
 * If we change a table's schema, we need to handle migration explicitly.
 * 
 * For the active_rest_timers table:
 * - Legacy schema: exercise_name TEXT PRIMARY KEY (single column key)
 * - Current schema: PRIMARY KEY (exercise_name, program_id, day_number)
 * - Hardened schema: PRIMARY KEY (exercise_instance_id, program_id, day_number)
 *
 * Since timer data is transient (only valid for a few minutes), we can safely
 * drop and recreate the table when required columns are missing.
 */
const initializeDatabase = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  // =============================================================================
  // MIGRATION: Check and upgrade active_rest_timers table
  // =============================================================================
  // WHY WE NEED THIS:
  // CREATE TABLE IF NOT EXISTS won't modify an existing table definition.
  // We need to detect legacy/current schemas and recreate for the hardened key.
  try {
    // PRAGMA table_info returns column information for a table
    const tableInfo = await database.getAllAsync<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>('PRAGMA table_info(active_rest_timers)');

    if (tableInfo.length > 0) {
      const hasProgramId = tableInfo.some((col) => col.name === 'program_id');
      const hasDayNumber = tableInfo.some((col) => col.name === 'day_number');
      const hasExerciseInstanceId = tableInfo.some((col) => col.name === 'exercise_instance_id');

      if (!hasProgramId || !hasDayNumber || !hasExerciseInstanceId) {
        // Timer data is transient, so dropping old schema data is acceptable.
        console.log('Migrating active_rest_timers table to exercise-instance key schema');
        await database.execAsync('DROP TABLE IF EXISTS active_rest_timers');
        console.log('Successfully migrated active_rest_timers to hardened schema.');
      }
    }
  } catch (error) {
    // If PRAGMA fails, table probably doesn't exist - that's fine
    console.log('Timer table check:', error);
  }

  const ensureColumnExists = async (
    tableName: string,
    columnName: string,
    columnDefinition: string
  ) => {
    const tableExists = await database.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [tableName]
    );

    if (!tableExists) {
      return;
    }

    const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
    const hasColumn = columns.some((column) => column.name === columnName);

    if (!hasColumn) {
      await database.execAsync(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
      );
    }
  };

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- User Preferences Table
    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY DEFAULT 'default',
      current_program_id TEXT,
      weight_unit TEXT DEFAULT 'kg',
      theme TEXT DEFAULT 'system',
      queue_size INTEGER DEFAULT ${DEFAULT_QUEUE_SIZE},
      rest_timer_enabled INTEGER DEFAULT 1,
      haptic_feedback_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Programs Table
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Workout Days Table (belongs to a program)
    CREATE TABLE IF NOT EXISTS workout_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
      UNIQUE(program_id, day_number)
    );

    -- Program Exercises Table (belongs to a workout day)
    CREATE TABLE IF NOT EXISTS program_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_day_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      equipment TEXT DEFAULT '',
      muscle_groups TEXT NOT NULL,
      is_compound INTEGER DEFAULT 0,
      weight REAL DEFAULT 0,
      reps INTEGER DEFAULT 8,
      sets INTEGER DEFAULT 3,
      rest_time INTEGER DEFAULT 180,
      progression REAL DEFAULT 0,
      has_customised_sets INTEGER DEFAULT 0,
      variant_json TEXT DEFAULT '',
      position INTEGER DEFAULT 0,
      FOREIGN KEY (workout_day_id) REFERENCES workout_days(id) ON DELETE CASCADE
    );

    -- Completed Workouts Table
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      program_id TEXT NOT NULL,
      program_name TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      duration INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Workout Exercises Table (logged exercises for completed workouts)
    CREATE TABLE IF NOT EXISTS workout_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id TEXT NOT NULL,
      name TEXT NOT NULL,
      equipment TEXT DEFAULT '',
      muscle_groups TEXT NOT NULL,
      is_compound INTEGER DEFAULT 0,
      weight REAL DEFAULT 0,
      reps INTEGER DEFAULT 8,
      sets INTEGER DEFAULT 3,
      rest_time INTEGER DEFAULT 180,
      progression REAL DEFAULT 0,
      has_customised_sets INTEGER DEFAULT 0,
      variant_json TEXT DEFAULT '',
      logged_weight REAL DEFAULT 0,
      logged_reps INTEGER DEFAULT 0,
      logged_set_weights TEXT DEFAULT '[]',
      logged_set_reps TEXT DEFAULT '[]',
      position INTEGER DEFAULT 0,
      FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    -- Workout Queue Table
    CREATE TABLE IF NOT EXISTS workout_queue (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      program_name TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      scheduled_date TEXT,
      position INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Queue Exercises Table (exercises for queued workouts)
    CREATE TABLE IF NOT EXISTS queue_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      equipment TEXT DEFAULT '',
      muscle_groups TEXT NOT NULL,
      is_compound INTEGER DEFAULT 0,
      weight REAL DEFAULT 0,
      reps INTEGER DEFAULT 8,
      sets INTEGER DEFAULT 3,
      rest_time INTEGER DEFAULT 180,
      progression REAL DEFAULT 0,
      has_customised_sets INTEGER DEFAULT 0,
      variant_json TEXT DEFAULT '',
      position INTEGER DEFAULT 0,
      FOREIGN KEY (queue_item_id) REFERENCES workout_queue(id) ON DELETE CASCADE
    );

    -- Active Rest Timers Table (for persisting timers across app lifecycle)
    -- HARDENED KEY FIX: Uses (exercise_instance_id, program_id, day_number) so
    -- duplicate exercise names in the same day can maintain separate timers.
    CREATE TABLE IF NOT EXISTS active_rest_timers (
      exercise_instance_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      program_id TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      end_timestamp INTEGER NOT NULL,
      sets_completed INTEGER DEFAULT 0,
      rest_duration INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (exercise_instance_id, program_id, day_number)
    );

    -- User Profile Table (training preferences)
    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY DEFAULT 'default',
      name TEXT,
      current_weight REAL,
      goal_weight REAL,
      training_goal TEXT,
      target_sets_per_week INTEGER,
      experience_level TEXT,
      training_days_per_week INTEGER,
      session_duration_minutes INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Muscle Group Targets Table (per-muscle group set overrides)
    CREATE TABLE IF NOT EXISTS muscle_group_targets (
      muscle_group TEXT PRIMARY KEY,
      target_sets INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default profile if not exists
    INSERT OR IGNORE INTO user_profile (id) VALUES ('default');

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_workout_days_program ON workout_days(program_id);
    CREATE INDEX IF NOT EXISTS idx_program_exercises_day ON program_exercises(workout_day_id);
    CREATE INDEX IF NOT EXISTS idx_workouts_program ON workouts(program_id);
    CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
    CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);
    CREATE INDEX IF NOT EXISTS idx_queue_exercises_item ON queue_exercises(queue_item_id);
    CREATE INDEX IF NOT EXISTS idx_workout_queue_position ON workout_queue(position);

    -- Insert default preferences if not exists
    INSERT OR IGNORE INTO user_preferences (id) VALUES ('default');
  `);

  await ensureColumnExists('program_exercises', 'is_compound', 'INTEGER DEFAULT 0');
  await ensureColumnExists('program_exercises', 'has_customised_sets', 'INTEGER DEFAULT 0');
  await ensureColumnExists('workout_exercises', 'is_compound', 'INTEGER DEFAULT 0');
  await ensureColumnExists('workout_exercises', 'has_customised_sets', 'INTEGER DEFAULT 0');
  await ensureColumnExists('workout_exercises', 'logged_set_weights', "TEXT DEFAULT '[]'");
  await ensureColumnExists('workout_exercises', 'logged_set_reps', "TEXT DEFAULT '[]'");
  await ensureColumnExists('queue_exercises', 'is_compound', 'INTEGER DEFAULT 0');
  await ensureColumnExists('queue_exercises', 'has_customised_sets', 'INTEGER DEFAULT 0');
  await ensureColumnExists('program_exercises', 'variant_json', "TEXT DEFAULT ''");
  await ensureColumnExists('workout_exercises', 'variant_json', "TEXT DEFAULT ''");
  await ensureColumnExists('queue_exercises', 'variant_json', "TEXT DEFAULT ''");
  await ensureColumnExists('user_preferences', 'seed_test_program_state', "TEXT DEFAULT 'pending'");
  await ensureColumnExists('user_preferences', 'seed_3day_full_body_state', "TEXT DEFAULT 'pending'");
  await ensureColumnExists('user_profile', 'experience_level', 'TEXT');
  await ensureColumnExists('user_profile', 'training_days_per_week', 'INTEGER');
  await ensureColumnExists('user_profile', 'session_duration_minutes', 'INTEGER');
};

export type SeedLifecycleState = 'pending' | 'seeded' | 'deleted_by_user';

export const getSeedLifecycleState = async (seedId: string): Promise<SeedLifecycleState> => {
  const column = getSeedStateColumn(seedId);
  if (!column || !ALLOWLISTED_SEED_STATE_COLUMNS.has(column)) {
    return 'pending';
  }

  const database = await getDatabase();
  const row = await database.getFirstAsync<Record<typeof column, string | null>>(
    `SELECT ${column} FROM user_preferences WHERE id = ?`,
    ['default']
  );

  const value = row?.[column];
  if (value === 'seeded' || value === 'deleted_by_user') {
    return value;
  }

  return 'pending';
};

export const setSeedLifecycleState = async (
  seedId: string,
  state: SeedLifecycleState
): Promise<void> => {
  const column = getSeedStateColumn(seedId);
  if (!column || !ALLOWLISTED_SEED_STATE_COLUMNS.has(column)) {
    return;
  }

  const database = await getDatabase();
  await database.runAsync(
    `UPDATE user_preferences SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [state, 'default']
  );
};

// =============================================================================
// USER PREFERENCES
// =============================================================================

/**
 * Get user preferences
 */
export const getUserPreferences = async (): Promise<UserPreferences> => {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{
    id: string;
    current_program_id: string | null;
    weight_unit: string;
    theme: string;
    queue_size: number;
    rest_timer_enabled: number;
    haptic_feedback_enabled: number;
  }>('SELECT * FROM user_preferences WHERE id = ?', ['default']);

  if (!result) {
    // Return defaults
    return {
      id: 'default',
      currentProgramId: null,
      weightUnit: 'kg',
      theme: 'system',
      queueSize: DEFAULT_QUEUE_SIZE,
      restTimerEnabled: true,
      hapticFeedbackEnabled: true,
    };
  }

  return {
    id: result.id,
    currentProgramId: result.current_program_id,
    weightUnit: result.weight_unit as 'kg' | 'lbs',
    theme: result.theme as 'light' | 'dark' | 'system',
    queueSize: result.queue_size,
    restTimerEnabled: result.rest_timer_enabled === 1,
    hapticFeedbackEnabled: result.haptic_feedback_enabled === 1,
  };
};

/**
 * Update user preferences
 */
export const updateUserPreferences = async (
  preferences: Partial<UserPreferences>
): Promise<void> => {
  const database = await getDatabase();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (preferences.currentProgramId !== undefined) {
    updates.push('current_program_id = ?');
    values.push(preferences.currentProgramId);
  }
  if (preferences.weightUnit !== undefined) {
    updates.push('weight_unit = ?');
    values.push(preferences.weightUnit);
  }
  if (preferences.theme !== undefined) {
    updates.push('theme = ?');
    values.push(preferences.theme);
  }
  if (preferences.queueSize !== undefined) {
    updates.push('queue_size = ?');
    values.push(preferences.queueSize);
  }
  if (preferences.restTimerEnabled !== undefined) {
    updates.push('rest_timer_enabled = ?');
    values.push(preferences.restTimerEnabled ? 1 : 0);
  }
  if (preferences.hapticFeedbackEnabled !== undefined) {
    updates.push('haptic_feedback_enabled = ?');
    values.push(preferences.hapticFeedbackEnabled ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push('default');
    await database.runAsync(
      `UPDATE user_preferences SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }
};

/**
 * Get current program ID
 */
export const getCurrentProgramId = async (): Promise<string | null> => {
  const prefs = await getUserPreferences();
  return prefs.currentProgramId;
};

/**
 * Set current program ID and generate workout queue
 */
export const setCurrentProgramId = async (programId: string | null): Promise<void> => {
  // Invalidate any in-flight queue generation before preferences/queue change.
  // This prevents stale generations from restoring an old queue after the user
  // clears or switches the current program.
  currentQueueGenerationId += 1;

  await updateUserPreferences({ currentProgramId: programId });
  
  // Generate workout queue if a program is set
  if (programId) {
    await generateWorkoutQueue(programId);
  } else {
    await clearWorkoutQueue();
  }
};

// =============================================================================
// USER PROFILE
// =============================================================================

/**
 * Get user profile
 */
export const getUserProfile = async (): Promise<UserProfile> => {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{
    id: string;
    name: string | null;
    current_weight: number | null;
    goal_weight: number | null;
    training_goal: string | null;
    target_sets_per_week: number | null;
    experience_level: string | null;
    training_days_per_week: number | null;
    session_duration_minutes: number | null;
  }>('SELECT * FROM user_profile WHERE id = ?', ['default']);

  if (!result) {
    // Return defaults
    return {
      id: 'default',
      name: null,
      currentWeight: null,
      goalWeight: null,
      trainingGoal: null,
      targetSetsPerWeek: null,
      experienceLevel: null,
      trainingDaysPerWeek: null,
      sessionDurationMinutes: null,
    };
  }

  return {
    id: result.id,
    name: result.name,
    currentWeight: result.current_weight,
    goalWeight: result.goal_weight,
    trainingGoal: result.training_goal as TrainingGoal | null,
    targetSetsPerWeek: result.target_sets_per_week,
    experienceLevel: (result.experience_level as UserProfile['experienceLevel']) ?? null,
    trainingDaysPerWeek: result.training_days_per_week,
    sessionDurationMinutes: result.session_duration_minutes,
  };
};

/**
 * Update user profile
 */
export const updateUserProfile = async (
  profile: Partial<UserProfile>
): Promise<void> => {
  const database = await getDatabase();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (profile.name !== undefined) {
    updates.push('name = ?');
    values.push(profile.name);
  }
  if (profile.currentWeight !== undefined) {
    updates.push('current_weight = ?');
    values.push(profile.currentWeight);
  }
  if (profile.goalWeight !== undefined) {
    updates.push('goal_weight = ?');
    values.push(profile.goalWeight);
  }
  if (profile.trainingGoal !== undefined) {
    updates.push('training_goal = ?');
    values.push(profile.trainingGoal);
  }
  if (profile.targetSetsPerWeek !== undefined) {
    updates.push('target_sets_per_week = ?');
    values.push(profile.targetSetsPerWeek);
  }
  if (profile.experienceLevel !== undefined) {
    updates.push('experience_level = ?');
    values.push(profile.experienceLevel);
  }
  if (profile.trainingDaysPerWeek !== undefined) {
    updates.push('training_days_per_week = ?');
    values.push(profile.trainingDaysPerWeek);
  }
  if (profile.sessionDurationMinutes !== undefined) {
    updates.push('session_duration_minutes = ?');
    values.push(profile.sessionDurationMinutes);
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push('default');
    await database.runAsync(
      `UPDATE user_profile SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }
};

// =============================================================================
// MUSCLE GROUP TARGETS
// =============================================================================

/**
 * Get all muscle group targets
 */
export const getMuscleGroupTargets = async (): Promise<MuscleGroupTarget[]> => {
  const database = await getDatabase();
  const results = await database.getAllAsync<{
    muscle_group: string;
    target_sets: number;
  }>('SELECT * FROM muscle_group_targets ORDER BY muscle_group');

  return results.map((r) => ({
    muscleGroup: r.muscle_group,
    targetSets: r.target_sets,
  }));
};

/**
 * Get target sets for a specific muscle group
 * Returns null if no override is set (use global default)
 */
export const getMuscleGroupTarget = async (
  muscleGroup: string
): Promise<number | null> => {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ target_sets: number }>(
    'SELECT target_sets FROM muscle_group_targets WHERE muscle_group = ?',
    [muscleGroup]
  );
  return result?.target_sets ?? null;
};

/**
 * Set target sets for a muscle group (upsert)
 */
export const setMuscleGroupTarget = async (
  muscleGroup: string,
  targetSets: number
): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO muscle_group_targets (muscle_group, target_sets, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(muscle_group) DO UPDATE SET
       target_sets = excluded.target_sets,
       updated_at = CURRENT_TIMESTAMP`,
    [muscleGroup, targetSets]
  );
};

/**
 * Remove a muscle group target override (revert to global default)
 */
export const removeMuscleGroupTarget = async (
  muscleGroup: string
): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(
    'DELETE FROM muscle_group_targets WHERE muscle_group = ?',
    [muscleGroup]
  );
};

/**
 * Save all muscle group targets (replaces all existing)
 */
export const saveMuscleGroupTargets = async (
  targets: MuscleGroupTarget[]
): Promise<void> => {
  const database = await getDatabase();

  await runInTransaction(database, async () => {
    // Clear existing targets
    await database.runAsync('DELETE FROM muscle_group_targets');

    // Insert new targets
    for (const target of targets) {
      await database.runAsync(
        `INSERT INTO muscle_group_targets (muscle_group, target_sets)
         VALUES (?, ?)`,
        [target.muscleGroup, target.targetSets]
      );
    }
  });
};

// =============================================================================
// PROGRAMS
// =============================================================================

/**
 * Get all programs
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
 * Get a single program by ID
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
 * Get workout days for a program
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
    const exercises = await database.getAllAsync<{
      id: number;
      name: string;
      equipment: string;
      muscle_groups: string;
      is_compound: number;
      weight: number;
      reps: number;
      sets: number;
      rest_time: number;
      progression: number;
      has_customised_sets: number;
      variant_json: string | null;
      position: number;
    }>(
      'SELECT * FROM program_exercises WHERE workout_day_id = ? ORDER BY position',
      [day.id]
    );

    result.push({
      dayNumber: day.day_number,
      exercises: exercises.map((ex) => ({
        name: ex.name,
        equipment: ex.equipment,
        muscle_groups_worked: parseStringArrayField(ex.muscle_groups, 'program_exercises.muscle_groups', {
          workout_day_id: day.id,
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
      })),
    });
  }

  return result;
};

/**
 * Create a new program
 */
export const createProgram = async (program: Omit<Program, 'createdAt' | 'updatedAt'>): Promise<Program> => {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await runInTransaction(database, async () => {
    await database.runAsync(
      'INSERT INTO programs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [program.id, program.name, now, now]
    );

    // Insert workout days and exercises
    for (const day of program.workoutDays) {
      const dayResult = await database.runAsync(
        'INSERT INTO workout_days (program_id, day_number) VALUES (?, ?)',
        [program.id, day.dayNumber]
      );

      const dayId = dayResult.lastInsertRowId;

      for (let i = 0; i < day.exercises.length; i++) {
        const exercise = day.exercises[i];
        // Defensive coding: ensure all fields have valid values
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
            parseFloat(exercise.weight) || 0,
            parseInt(exercise.reps, 10) || 8,
            parseInt(exercise.sets, 10) || 3,
            parseInt(exercise.restTime, 10) || 180,
            parseFloat(exercise.progression) || 0,
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

/**
 * Update an existing program
 */
export const updateProgram = async (program: Program): Promise<void> => {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await runInTransaction(database, async () => {
    // Update program name
    await database.runAsync(
      'UPDATE programs SET name = ?, updated_at = ? WHERE id = ?',
      [program.name, now, program.id]
    );

    // Delete existing workout days (cascade deletes exercises)
    await database.runAsync('DELETE FROM workout_days WHERE program_id = ?', [program.id]);

    // Re-insert workout days and exercises
    for (const day of program.workoutDays) {
      const dayResult = await database.runAsync(
        'INSERT INTO workout_days (program_id, day_number) VALUES (?, ?)',
        [program.id, day.dayNumber]
      );

      const dayId = dayResult.lastInsertRowId;

      for (let i = 0; i < day.exercises.length; i++) {
        const exercise = day.exercises[i];
        // Defensive coding: ensure all fields have valid values
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
            parseFloat(exercise.weight) || 0,
            parseInt(exercise.reps, 10) || 8,
            parseInt(exercise.sets, 10) || 3,
            parseInt(exercise.restTime, 10) || 180,
            parseFloat(exercise.progression) || 0,
            exercise.hasCustomisedSets ? 1 : 0,
            serializeVariant(exercise.variant),
            i,
          ]
        );
      }
    }
  });
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

export const duplicateProgram = async (programId: string, duplicateNameRaw: string): Promise<Program> => {
  const duplicateName = duplicateNameRaw.trim();
  if (!duplicateName) {
    throw new Error('Program name is required');
  }

  const sourceProgram = await getProgramById(programId);
  if (!sourceProgram) {
    throw new Error('Program not found');
  }

  const allPrograms = await getAllPrograms();
  const hasNameCollision = allPrograms.some(
    (program) => program.id !== programId && program.name.toLowerCase() === duplicateName.toLowerCase()
  );

  if (hasNameCollision) {
    throw new Error('Program name already exists');
  }

  const duplicateDraft = cloneProgramForDuplicate(sourceProgram, duplicateName);
  return createProgram(duplicateDraft);
};

/**
 * Delete a program
 */
export const deleteProgram = async (programId: string): Promise<void> => {
  const database = await getDatabase();

  // Check if this is the current program and clear it
  const prefs = await getUserPreferences();
  if (prefs.currentProgramId === programId) {
    await setCurrentProgramId(null);
  }

  // Delete program (cascade deletes workout_days and program_exercises)
  const deleteResult = await database.runAsync('DELETE FROM programs WHERE id = ?', [programId]);
  const deletedRows = typeof deleteResult?.changes === 'number' ? deleteResult.changes : 0;

  if (deletedRows > 0 && getSeedStateColumn(programId)) {
    await setSeedLifecycleStateWithDatabase(database, programId, 'deleted_by_user');
  }
};

// =============================================================================
// WORKOUTS (Completed)
// =============================================================================

/**
 * Get all completed workouts
 */
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
    const exercises = await database.getAllAsync<{
      id: number;
      name: string;
      equipment: string;
      muscle_groups: string;
      is_compound: number;
      weight: number;
      reps: number;
      sets: number;
      rest_time: number;
      progression: number;
      has_customised_sets: number;
      variant_json: string | null;
      logged_weight: number;
      logged_reps: number;
      logged_set_weights: string;
      logged_set_reps: string;
      position: number;
    }>(
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

/**
 * Get workouts for a specific program
 */
export const getWorkoutsForProgram = async (programId: string): Promise<Workout[]> => {
  const allWorkouts = await getAllWorkouts();
  return allWorkouts.filter((w) => w.programId === programId);
};

/**
 * Get completed workouts for a program (for progression calculation)
 */
export const getCompletedWorkoutsForProgram = async (programId: string): Promise<Workout[]> => {
  const workouts = await getWorkoutsForProgram(programId);
  return workouts.filter((w) => w.completed);
};

/**
 * Save a completed workout
 */
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

    // Insert workout exercises
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
          parseFloat(exercise.weight) || 0,
          parseInt(exercise.reps, 10) || 8,
          parseInt(exercise.sets, 10) || 3,
          parseInt(exercise.restTime, 10) || 180,
          parseFloat(exercise.progression) || 0,
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

/**
 * Delete a workout
 */
export const deleteWorkout = async (workoutId: string): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM workouts WHERE id = ?', [workoutId]);
};

/**
 * Get the last logged weight for an exercise in a program
 */
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

// =============================================================================
// WORKOUT QUEUE
// =============================================================================

/**
 * Get all items in the workout queue
 */
export const getWorkoutQueue = async (): Promise<WorkoutQueueItem[]> => {
  const database = await getDatabase();
  
  const queueItems = await database.getAllAsync<{
    id: string;
    program_id: string;
    program_name: string;
    day_number: number;
    scheduled_date: string | null;
    position: number;
  }>('SELECT * FROM workout_queue ORDER BY position');

  const result: WorkoutQueueItem[] = [];
  
  for (const item of queueItems) {
    const exercises = await database.getAllAsync<{
      id: number;
      name: string;
      equipment: string;
      muscle_groups: string;
      is_compound: number;
      weight: number;
      reps: number;
      sets: number;
      rest_time: number;
      progression: number;
      has_customised_sets: number;
      variant_json: string | null;
      position: number;
    }>(
      'SELECT * FROM queue_exercises WHERE queue_item_id = ? ORDER BY position',
      [item.id]
    );

    result.push({
      id: item.id,
      programId: item.program_id,
      programName: item.program_name,
      dayNumber: item.day_number,
      scheduledDate: item.scheduled_date ?? undefined,
      position: item.position,
      exercises: exercises.map((ex) => ({
        exerciseInstanceId: `${item.id}:e${ex.position}`,
        name: ex.name,
        equipment: ex.equipment,
        muscle_groups_worked: parseStringArrayField(ex.muscle_groups, 'queue_exercises.muscle_groups', {
          queue_item_id: item.id,
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
      })),
    });
  }

  return result;
};

/**
 * Save the entire workout queue (replaces existing)
 */
export const saveWorkoutQueue = async (queue: WorkoutQueueItem[]): Promise<void> => {
  const database = await getDatabase();
  validateWorkoutQueueForPersistence(queue);

  await runInTransaction(database, async () => {
    // Clear existing queue
    await database.runAsync('DELETE FROM workout_queue');

    // Insert new queue items
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      await database.runAsync(
        `INSERT INTO workout_queue (id, program_id, program_name, day_number, scheduled_date, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.programId,
          item.programName,
          item.dayNumber,
          item.scheduledDate ?? null,
          i,
        ]
      );

      // Insert queue exercises
      for (let j = 0; j < item.exercises.length; j++) {
        const exercise = item.exercises[j];
        const muscleGroups = exercise.muscle_groups_worked ?? [];
        await database.runAsync(
          `INSERT INTO queue_exercises
           (queue_item_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            exercise.name ?? '',
            exercise.equipment ?? '',
            JSON.stringify(muscleGroups),
            exercise.isCompound ? 1 : 0,
            parseFloat(exercise.weight) || 0,
            parseInt(exercise.reps, 10) || 8,
            parseInt(exercise.sets, 10) || 3,
            parseInt(exercise.restTime, 10) || 180,
            parseFloat(exercise.progression) || 0,
            exercise.hasCustomisedSets ? 1 : 0,
            serializeVariant(exercise.variant),
            j,
          ]
        );
      }
    }
  });
};

/**
 * Add an item to the workout queue
 */
export const addToWorkoutQueue = async (item: WorkoutQueueItem): Promise<void> => {
  const database = await getDatabase();

  // Get the max position
  const maxPos = await database.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) as max_pos FROM workout_queue'
  );
  const position = (maxPos?.max_pos ?? -1) + 1;

  await database.runAsync(
    `INSERT INTO workout_queue (id, program_id, program_name, day_number, scheduled_date, position)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.programId,
      item.programName,
      item.dayNumber,
      item.scheduledDate ?? null,
      position,
    ]
  );

  // Insert queue exercises
  for (let j = 0; j < item.exercises.length; j++) {
    const exercise = item.exercises[j];
    const muscleGroups = exercise.muscle_groups_worked ?? [];
    await database.runAsync(
      `INSERT INTO queue_exercises
       (queue_item_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        exercise.name ?? '',
        exercise.equipment ?? '',
        JSON.stringify(muscleGroups),
        exercise.isCompound ? 1 : 0,
        parseFloat(exercise.weight) || 0,
        parseInt(exercise.reps, 10) || 8,
        parseInt(exercise.sets, 10) || 3,
        parseInt(exercise.restTime, 10) || 180,
        parseFloat(exercise.progression) || 0,
        exercise.hasCustomisedSets ? 1 : 0,
        serializeVariant(exercise.variant),
        j,
      ]
    );
  }
};

/**
 * Remove the first item from the queue and return it
 */
export const dequeueFirstWorkout = async (): Promise<WorkoutQueueItem | null> => {
  const queue = await getWorkoutQueue();
  if (queue.length === 0) return null;

  const first = queue[0];
  const database = await getDatabase();
  
  // Delete the first item (cascade deletes exercises)
  await database.runAsync('DELETE FROM workout_queue WHERE id = ?', [first.id]);

  // Update positions of remaining items
  await database.runAsync(
    'UPDATE workout_queue SET position = position - 1 WHERE position > 0'
  );

  return first;
};

/**
 * Clear the entire workout queue
 */
export const clearWorkoutQueue = async (): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM workout_queue');
};

/**
 * Update a specific queue item
 */
export const updateQueueItem = async (item: WorkoutQueueItem): Promise<void> => {
  const database = await getDatabase();

  await database.runAsync(
    `UPDATE workout_queue SET program_id = ?, program_name = ?, day_number = ?, scheduled_date = ?
     WHERE id = ?`,
    [item.programId, item.programName, item.dayNumber, item.scheduledDate ?? null, item.id]
  );

  // Delete and re-insert exercises
  await database.runAsync('DELETE FROM queue_exercises WHERE queue_item_id = ?', [item.id]);

  for (let j = 0; j < item.exercises.length; j++) {
    const exercise = item.exercises[j];
    const muscleGroups = exercise.muscle_groups_worked ?? [];
    await database.runAsync(
      `INSERT INTO queue_exercises
       (queue_item_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        exercise.name ?? '',
        exercise.equipment ?? '',
        JSON.stringify(muscleGroups),
        exercise.isCompound ? 1 : 0,
        parseFloat(exercise.weight) || 0,
        parseInt(exercise.reps, 10) || 8,
        parseInt(exercise.sets, 10) || 3,
        parseInt(exercise.restTime, 10) || 180,
        parseFloat(exercise.progression) || 0,
        exercise.hasCustomisedSets ? 1 : 0,
        serializeVariant(exercise.variant),
        j,
      ]
    );
  }
};

// =============================================================================
// QUEUE MANIPULATION
// =============================================================================

function roundWeightToNearestQuarter(weight: number): number {
  return Math.round(weight * 4) / 4;
}

function calculateProgressedWeight(exercise: ProgramExercise, lastWeight: number | null): number {
  const numLastWeight = lastWeight !== null ? Number(lastWeight) : null;
  const numProgression = Number(exercise.progression) || 0;
  const numExerciseWeight = Number(exercise.weight) || 0;

  let newWeight = numExerciseWeight;
  if (numLastWeight !== null && numProgression > 0) {
    newWeight = numLastWeight + numProgression;
  } else if (numLastWeight !== null) {
    newWeight = numLastWeight;
  }

  return roundWeightToNearestQuarter(newWeight);
}

async function applyProgressionToExercises(
  exercises: ProgramExercise[],
  programId: string
): Promise<ProgramExercise[]> {
  const exercisesWithProgression: ProgramExercise[] = [];

  for (const exercise of exercises) {
    const lastWeight = await getLastLoggedWeight(exercise.name, programId, exercise.variant);
    const newWeight = calculateProgressedWeight(exercise, lastWeight);

    exercisesWithProgression.push({
      ...exercise,
      weight: newWeight.toString(),
    });
  }

  return exercisesWithProgression;
}

/**
 * Skip queue items until the target day is first in the queue.
 * 
 * UNDO BEHAVIOR: When an originalQueue is provided, this function uses it as
 * the reference point. This enables "undo" when the user goes backward:
 * - Day 1 → Day 2: originalQueue[1] becomes first (skip forward)
 * - Day 2 → Day 1: originalQueue[0] becomes first (restore/undo)
 * 
 * Without originalQueue, each skip is relative to the current queue state,
 * which would cause Day 1 → Day 2 → Day 1 to keep skipping forward.
 * 
 * @param programId - The current program ID
 * @param targetDayNumber - The day number to skip to (1-indexed)
 * @param originalQueue - Optional original queue state for undo support
 * @returns The updated queue, or null if program not found
 */
export const skipQueueToDay = async (
  programId: string,
  targetDayNumber: number,
  originalQueue?: WorkoutQueueItem[]
): Promise<WorkoutQueueItem[] | null> => {
  const program = await getProgramById(programId);
  if (!program || program.workoutDays.length === 0) {
    console.warn('Cannot skip queue: Program not found or has no workout days');
    return null;
  }

  // Use original queue if provided, otherwise fetch current queue
  const referenceQueue = originalQueue ?? await getWorkoutQueue();
  
  // Check if this is even for the same program
  if (referenceQueue.length > 0 && referenceQueue[0].programId !== programId) {
    // Queue is for a different program, regenerate
    await generateWorkoutQueue(programId);
    return getWorkoutQueue();
  }

  // Check if target day is already first in reference queue
  if (referenceQueue.length > 0 && referenceQueue[0].dayNumber === targetDayNumber) {
    // Restore the reference queue (important for undo: restores original state)
    await saveWorkoutQueue(referenceQueue);
    return referenceQueue;
  }

  // Find if target day exists in the reference queue
  const targetIndex = referenceQueue.findIndex(q => q.dayNumber === targetDayNumber);
  
  let newQueue: WorkoutQueueItem[];
  
  if (targetIndex >= 0) {
    // Target day exists in reference queue - slice from there (preserves original items)
    newQueue = referenceQueue.slice(targetIndex).map((item, idx) => ({
      ...item,
      position: idx,
    }));
  } else {
    // Target day not in reference queue - rebuild queue starting from target day
    newQueue = [];
  }

  // Fill queue to maintain DEFAULT_QUEUE_SIZE items
  const numDays = program.workoutDays.length;
  const targetDayIndex = program.workoutDays.findIndex(d => d.dayNumber === targetDayNumber);
  
  if (targetDayIndex === -1) {
    console.warn(`Day ${targetDayNumber} not found in program`);
    return referenceQueue;
  }

  while (newQueue.length < DEFAULT_QUEUE_SIZE) {
    // Calculate which day to add next
    const lastDayNumber = newQueue.length > 0 
      ? newQueue[newQueue.length - 1].dayNumber 
      : targetDayNumber - 1; // So first iteration adds targetDayNumber
    
    // Find the index of the last day in the program
    const lastDayIndex = program.workoutDays.findIndex(d => d.dayNumber === lastDayNumber);
    const nextDayIndex = lastDayIndex === -1 
      ? targetDayIndex  // If last day not found, start from target
      : (lastDayIndex + 1) % numDays;
    
    const nextDay = program.workoutDays[nextDayIndex];

    const exercisesWithProgression = await applyProgressionToExercises(nextDay.exercises, programId);

    newQueue.push({
      id: `queue-${Date.now()}-${newQueue.length}`,
      programId: program.id,
      programName: program.name,
      dayNumber: nextDay.dayNumber,
      exercises: exercisesWithProgression,
      position: newQueue.length,
    });
  }

  // Save the new queue
  await saveWorkoutQueue(newQueue);
  console.log(`Skipped queue to day ${targetDayNumber}, new queue: [${newQueue.map(q => q.dayNumber).join(', ')}]`);
  
  return newQueue;
};

/**
 * Get a queue item for a specific day, if it exists in the queue.
 * Useful for loading pre-calculated exercise values when user switches days.
 * 
 * @param dayNumber - The day number to find
 * @returns The queue item if found, or null
 */
export const getQueueItemForDay = async (dayNumber: number): Promise<WorkoutQueueItem | null> => {
  const queue = await getWorkoutQueue();
  return queue.find(q => q.dayNumber === dayNumber) ?? null;
};

// =============================================================================
// QUEUE GENERATION
// =============================================================================

/**
 * Generate a workout queue from a program
 * Creates DEFAULT_QUEUE_SIZE queue items cycling through the program's workout days
 * Applies auto-progression based on last logged weights
 */
export const generateWorkoutQueue = async (programId: string): Promise<void> => {
  // Increment request ID to invalidate any previous in-flight generations
  currentQueueGenerationId += 1;
  const thisRequestId = currentQueueGenerationId;

  const program = await getProgramById(programId);
  if (!program || program.workoutDays.length === 0) {
    console.warn('Cannot generate queue: Program not found or has no workout days');
    return;
  }

  // Check if we've been superseded by a newer request
  if (thisRequestId !== currentQueueGenerationId) {
    console.log(`Aborting stale queue generation for program: ${program.name}`);
    return;
  }

  const queueItems: WorkoutQueueItem[] = [];
  const numDays = program.workoutDays.length;

  for (let i = 0; i < DEFAULT_QUEUE_SIZE; i++) {
    // Check again inside the loop for long-running generations
    if (thisRequestId !== currentQueueGenerationId) return;

    const dayIndex = i % numDays;
    const workoutDay = program.workoutDays[dayIndex];

    const exercisesWithProgression = await applyProgressionToExercises(workoutDay.exercises, programId);

    queueItems.push({
      id: `queue-${Date.now()}-${i}`,
      programId: program.id,
      programName: program.name,
      dayNumber: workoutDay.dayNumber,
      exercises: exercisesWithProgression,
      position: i,
    });
  }

  // Final check before saving
  if (thisRequestId !== currentQueueGenerationId) {
    console.log(`Aborting stale queue save for program: ${program.name}`);
    return;
  }

  // Save the generated queue
  await saveWorkoutQueue(queueItems);
  console.log(`Generated workout queue with ${queueItems.length} items for program: ${program.name}`);
};

// =============================================================================
// REST TIMER PERSISTENCE
// =============================================================================

/**
 * Timer context - identifies which workout context a timer belongs to.
 * HARDENED KEY FIX: Includes exerciseInstanceId so duplicate exercise names
 * in the same day/program can still have isolated timer records.
 */
export interface TimerContext {
  exerciseInstanceId: string;
  exerciseName: string;
  programId: string;
  dayNumber: number;
}

/**
 * Timer state stored in database
 * Extends TimerContext with the actual timer data
 */
export interface ActiveTimerState extends TimerContext {
  endTimestamp: number;
  setsCompleted: number;
  restDuration: number;
}

/**
 * Save an active rest timer (timestamp-based for persistence across app lifecycle)
 * HARDENED KEY FIX: Uses exerciseInstanceId + programId + dayNumber for uniqueness.
 */
export const saveActiveTimer = async (timer: ActiveTimerState): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO active_rest_timers
     (exercise_instance_id, exercise_name, program_id, day_number, end_timestamp, sets_completed, rest_duration)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      timer.exerciseInstanceId,
      timer.exerciseName,
      timer.programId,
      timer.dayNumber,
      timer.endTimestamp,
      timer.setsCompleted,
      timer.restDuration,
    ]
  );
};

/**
 * Get an active timer for a specific exercise instance in a workout context
 * HARDENED KEY FIX: Requires full context (exerciseInstanceId + program + day).
 */
export const getActiveTimer = async (context: TimerContext): Promise<ActiveTimerState | null> => {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{
    exercise_instance_id: string;
    exercise_name: string;
    program_id: string;
    day_number: number;
    end_timestamp: number;
    sets_completed: number;
    rest_duration: number;
  }>(
    'SELECT * FROM active_rest_timers WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ?',
    [context.exerciseInstanceId, context.programId, context.dayNumber]
  );

  if (!result) {
    return null;
  }

  return {
    exerciseInstanceId: result.exercise_instance_id,
    exerciseName: result.exercise_name,
    programId: result.program_id,
    dayNumber: result.day_number,
    endTimestamp: result.end_timestamp,
    setsCompleted: result.sets_completed,
    restDuration: result.rest_duration,
  };
};

/**
 * Get all active timers
 */
export const getAllActiveTimers = async (): Promise<ActiveTimerState[]> => {
  const database = await getDatabase();
  const results = await database.getAllAsync<{
    exercise_instance_id: string;
    exercise_name: string;
    program_id: string;
    day_number: number;
    end_timestamp: number;
    sets_completed: number;
    rest_duration: number;
  }>('SELECT * FROM active_rest_timers');

  return results.map((r) => ({
    exerciseInstanceId: r.exercise_instance_id,
    exerciseName: r.exercise_name,
    programId: r.program_id,
    dayNumber: r.day_number,
    endTimestamp: r.end_timestamp,
    setsCompleted: r.sets_completed,
    restDuration: r.rest_duration,
  }));
};

/**
 * Clear a specific timer (when stopped or completed)
 * HARDENED KEY FIX: Requires exerciseInstanceId + programId + dayNumber.
 */
export const clearActiveTimer = async (
  context: TimerContext,
  expectedEndTimestamp?: number
): Promise<void> => {
  const database = await getDatabase();

  if (typeof expectedEndTimestamp === 'number') {
    // RACE HARDENING: Delete only the timer generation we expect.
    // This prevents stale clears from deleting a freshly restarted timer.
    await database.runAsync(
      'DELETE FROM active_rest_timers WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ? AND end_timestamp = ?',
      [context.exerciseInstanceId, context.programId, context.dayNumber, expectedEndTimestamp]
    );
    return;
  }

  await database.runAsync(
    'DELETE FROM active_rest_timers WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ?',
    [context.exerciseInstanceId, context.programId, context.dayNumber]
  );
};

/**
 * Clear all active timers (e.g., when workout is saved or day is switched)
 * This clears ALL timers regardless of context - used for full reset scenarios
 */
export const clearAllActiveTimers = async (): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM active_rest_timers');
};

/**
 * Clear all timers for a specific program/day context
 * Useful for clearing only timers from a specific workout session
 */
export const clearTimersForContext = async (
  programId: string,
  dayNumber: number
): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(
    'DELETE FROM active_rest_timers WHERE program_id = ? AND day_number = ?',
    [programId, dayNumber]
  );
};

/**
 * Update sets completed for a timer (without changing timer state)
 * HARDENED KEY FIX: Uses exerciseInstanceId + programId + dayNumber.
 */
export const updateTimerSetsCompleted = async (
  context: TimerContext,
  setsCompleted: number
): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE active_rest_timers SET sets_completed = ? WHERE exercise_instance_id = ? AND program_id = ? AND day_number = ?',
    [setsCompleted, context.exerciseInstanceId, context.programId, context.dayNumber]
  );
};

const cleanupOrphanedTimersWithDatabase = async (database: SQLite.SQLiteDatabase): Promise<number> => {
  const now = Date.now();

  const result = await database.runAsync(
    'DELETE FROM active_rest_timers WHERE end_timestamp < ?',
    [now]
  );

  return result.changes;
};

/**
 * Clean up orphaned/expired timer records
 * ORPHANED TIMER FIX: Called on app startup to remove timers that:
 * 1. Have already expired (end_timestamp < now)
 * 2. Are unreasonably old (end_timestamp was set more than 15 min ago)
 *
 * This handles scenarios where the app was force-killed mid-workout
 * and timer records were left in the database.
 *
 * WHY WE ONLY USE end_timestamp:
 * Previously, we tried to use both end_timestamp (milliseconds) and
 * created_at (text datetime). This didn't work because:
 * - end_timestamp is stored in milliseconds (e.g., 1705520400000)
 * - created_at is stored as text (e.g., "2025-01-17 10:00:00")
 * - SQLite datetime functions expect seconds, not milliseconds
 * - Comparing datetime strings with different formats is unreliable
 *
 * The fix: Use end_timestamp for everything. We can derive "age" from it:
 * - A timer created at time T with duration D has end_timestamp = T + D
 * - So the timer was created at (end_timestamp - rest_duration * 1000)
 * - If that's more than 15 minutes ago, the timer is stale
 */
export const cleanupOrphanedTimers = async (): Promise<number> => {
  const database = await getDatabase();
  return cleanupOrphanedTimersWithDatabase(database);
};

// =============================================================================
// MIGRATION / DATA IMPORT
// =============================================================================

/**
 * Import data from AsyncStorage (for migration)
 */
export const importFromLegacyStorage = async (
  programs: Program[],
  workouts: Workout[],
  queue: WorkoutQueueItem[],
  currentProgramId: string | null
): Promise<void> => {
  // Import programs
  for (const program of programs) {
    try {
      await createProgram(program);
    } catch (e) {
      console.warn('Failed to import program:', program.id, e);
    }
  }

  // Import workouts
  for (const workout of workouts) {
    try {
      await saveWorkout(workout);
    } catch (e) {
      console.warn('Failed to import workout:', workout.id, e);
    }
  }

  // Import queue
  try {
    await saveWorkoutQueue(queue);
  } catch (e) {
    console.warn('Failed to import workout queue:', e);
  }

  // Set current program
  if (currentProgramId) {
    await setCurrentProgramId(currentProgramId);
  }
};

/**
 * Close the database connection
 */
export const closeDatabase = async (): Promise<void> => {
  const currentDb = getDb();
  if (currentDb) {
    await currentDb.closeAsync();
    setDb(null);
    setInitPromise(null);
    setMaintenancePromise(null);
    setMaintenanceCompleted(false);
  }
};
