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
  MuscleGroupTarget,
  Program,
  ProgramExercise,
  UserPreferences,
  UserProfile,
  Workout,
  WorkoutQueueItem
} from '@/types';
import { TrainingGoal } from '@/types';
import * as SQLite from 'expo-sqlite';

import {
  serializeVariant,
} from '@/services/db/serialization';
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
  registerDatabaseGetter,
} from '@/services/db/connection';
import {
  validateWorkoutQueueForPersistence as queueValidateWorkoutQueueForPersistence,
  getWorkoutQueue as queueGetWorkoutQueue,
  saveWorkoutQueue as queueSaveWorkoutQueue,
  addToWorkoutQueue as queueAddToWorkoutQueue,
  dequeueFirstWorkout as queueDequeueFirstWorkout,
  clearWorkoutQueue as queueClearWorkoutQueue,
  updateQueueItem as queueUpdateQueueItem,
  generateWorkoutQueue as queueGenerateWorkoutQueue,
  skipQueueToDay as queueSkipQueueToDay,
  getQueueItemForDay as queueGetQueueItemForDay,
  incrementQueueGenerationId,
} from '@/services/db/queue';
import * as programsDb from '@/services/db/programs';
import * as workoutsDb from '@/services/db/workouts';

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

/**
 * Queue generation lock is now managed in services/db/queue.ts.
 * The incrementQueueGenerationId import provides the same functionality.
 */

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

registerDatabaseGetter(getDatabase);

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

export const validateWorkoutQueueForPersistence = queueValidateWorkoutQueueForPersistence;

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
  incrementQueueGenerationId();

  await updateUserPreferences({ currentProgramId: programId });
  
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
// PROGRAMS (delegated to services/db/programs.ts)
// =============================================================================

export const getAllPrograms = programsDb.getAllPrograms;

export const getProgramById = programsDb.getProgramById;

export const createProgram = programsDb.createProgram;

export const updateProgram = programsDb.updateProgram;

export const duplicateProgram = async (programId: string, duplicateNameRaw: string): Promise<Program> => {
  return programsDb.duplicateProgram(programId, duplicateNameRaw, {
    getProgramById: programsDb.getProgramById,
    getAllPrograms: programsDb.getAllPrograms,
    createProgram: programsDb.createProgram,
  });
};

export const deleteProgram = async (programId: string): Promise<void> => {
  return programsDb.deleteProgram(programId, {
    getUserPreferences: getUserPreferences,
    setCurrentProgramId: setCurrentProgramId,
    setSeedLifecycleStateWithDatabase: setSeedLifecycleStateWithDatabase,
    getSeedStateColumn: getSeedStateColumn,
  });
};

// =============================================================================
// WORKOUTS (delegated to services/db/workouts.ts)
// =============================================================================

export const getAllWorkouts = workoutsDb.getAllWorkouts;

export const getWorkoutsForProgram = async (programId: string): Promise<Workout[]> => {
  return workoutsDb.getWorkoutsForProgram(programId, workoutsDb.getAllWorkouts);
};

export const getCompletedWorkoutsForProgram = async (programId: string): Promise<Workout[]> => {
  return workoutsDb.getCompletedWorkoutsForProgram(programId, (id: string) => workoutsDb.getWorkoutsForProgram(id, workoutsDb.getAllWorkouts));
};

export const saveWorkout = workoutsDb.saveWorkout;

export const deleteWorkout = workoutsDb.deleteWorkout;

export const getLastLoggedWeight = workoutsDb.getLastLoggedWeight;

// =============================================================================
// WORKOUT QUEUE (delegated to services/db/queue.ts)
// =============================================================================

/**
 * Get all items in the workout queue
 */
export const getWorkoutQueue = queueGetWorkoutQueue;

/**
 * Save the entire workout queue (replaces existing)
 */
export const saveWorkoutQueue = queueSaveWorkoutQueue;

/**
 * Add an item to the workout queue
 */
export const addToWorkoutQueue = queueAddToWorkoutQueue;

/**
 * Remove the first item from the queue and return it
 */
export const dequeueFirstWorkout = queueDequeueFirstWorkout;

/**
 * Clear the entire workout queue
 */
export const clearWorkoutQueue = queueClearWorkoutQueue;

/**
 * Update a specific queue item
 */
export const updateQueueItem = queueUpdateQueueItem;

// =============================================================================
// QUEUE MANIPULATION (implemented in services/db/queue.ts)
// =============================================================================

/**
 * Skip queue items until the target day is first in the queue.
 * Delegates to queue module which accepts getProgramById and getLastLoggedWeight
 * as injected dependencies.
 */
export const skipQueueToDay = async (
  programId: string,
  targetDayNumber: number,
  originalQueue?: WorkoutQueueItem[]
): Promise<WorkoutQueueItem[] | null> => {
  return queueSkipQueueToDay(programId, targetDayNumber, originalQueue, getProgramById, getLastLoggedWeight);
};

/**
 * Get a queue item for a specific day, if it exists in the queue.
 */
export const getQueueItemForDay = queueGetQueueItemForDay;

// =============================================================================
// QUEUE GENERATION (delegated to services/db/queue.ts)
// =============================================================================

/**
 * Generate a workout queue from a program.
 * Delegates to queue module, injecting getProgramById and getLastLoggedWeight.
 */
export const generateWorkoutQueue = async (programId: string): Promise<void> => {
  return queueGenerateWorkoutQueue(programId, getProgramById, getLastLoggedWeight);
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
