/**
 * SQLite Database Service
 * 
 * Handles all database operations for the Gym App including:
 * - Database initialization and migrations
 * - CRUD operations for programs, workouts, and workout queue
 * - Data validation and error handling
 */

import { DATABASE_NAME, DEFAULT_QUEUE_SIZE } from '@/constants';
import type {
    Program,
    Workout,
    WorkoutQueueItem
} from '@/types';
import * as SQLite from 'expo-sqlite';

import {
    getDb,
    getInitPromise,
    getMaintenancePromise,
    isMaintenanceCompleted,
    logStartupStage,
    registerDatabaseGetter,
    setDb,
    setInitPromise,
    setMaintenanceCompleted,
    setMaintenancePromise,
} from '@/services/db/connection';
import {
    getCurrentProgramId as prefsGetCurrentProgramId,
    getMuscleGroupTargets as prefsGetMuscleGroupTargets,
    getUserPreferences as prefsGetUserPreferences,
    getUserProfile as prefsGetUserProfile,
    removeMuscleGroupTarget as prefsRemoveMuscleGroupTarget,
    saveMuscleGroupTargets as prefsSaveMuscleGroupTargets,
    setCurrentProgramId as prefsSetCurrentProgramId,
    updateUserPreferences as prefsUpdateUserPreferences,
    updateUserProfile as prefsUpdateUserProfile,
    registerPreferencesDeps,
} from '@/services/db/preferences';
import * as programsDb from '@/services/db/programs';
import {
    incrementQueueGenerationId,
    addToWorkoutQueue as queueAddToWorkoutQueue,
    clearWorkoutQueue as queueClearWorkoutQueue,
    dequeueFirstWorkout as queueDequeueFirstWorkout,
    generateWorkoutQueue as queueGenerateWorkoutQueue,
    getQueueItemForDay as queueGetQueueItemForDay,
    getWorkoutQueue as queueGetWorkoutQueue,
    saveWorkoutQueue as queueSaveWorkoutQueue,
    skipQueueToDay as queueSkipQueueToDay,
    updateQueueItem as queueUpdateQueueItem,
    validateWorkoutQueueForPersistence as queueValidateWorkoutQueueForPersistence,
} from '@/services/db/queue';
import {
    type SeedLifecycleState,
    getSeedLifecycleStateWithDatabase,
    getSeedStateColumn,
    mapSeedFixtureToProgram,
    seedTestProgramsIfMissing,
    setSeedLifecycleStateWithDatabase,
    validateSeedFixture,
} from '@/services/db/seeds';
import {
    cleanupOrphanedTimersWithDatabase as timerCleanupOrphanedTimersWithDatabase,
    clearActiveTimer as timerClearActiveTimer,
    clearAllActiveTimers as timerClearAllActiveTimers,
    clearTimersForContext as timerClearTimersForContext,
    getActiveTimer as timerGetActiveTimer,
    getAllActiveTimers as timerGetAllActiveTimers,
    saveActiveTimer as timerSaveActiveTimer,
    updateTimerSetsCompleted as timerUpdateTimerSetsCompleted,
} from '@/services/db/timers';
import * as workoutsDb from '@/services/db/workouts';

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

/**
 * Queue generation lock is now managed in services/db/queue.ts.
 * The incrementQueueGenerationId import provides the same functionality.
 */

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

export { mapSeedFixtureToProgram, validateSeedFixture };
export type { SeedLifecycleState };

/**
 * Reads the persisted lifecycle state for a bundled seed program.
 * Delegates the actual column lookup to the extracted seed service module.
 */
export const getSeedLifecycleState = async (seedId: string): Promise<SeedLifecycleState> => {
  const database = await getDatabase();
  return getSeedLifecycleStateWithDatabase(database, seedId);
};

/**
 * Persists the lifecycle state for a bundled seed program.
 * Unknown seed ids are ignored by the underlying seed service implementation.
 */
export const setSeedLifecycleState = async (
  seedId: string,
  state: SeedLifecycleState
): Promise<void> => {
  const database = await getDatabase();
  await setSeedLifecycleStateWithDatabase(database, seedId, state);
};

// =============================================================================
// USER PREFERENCES (delegated to services/db/preferences.ts)
// =============================================================================

export const getUserPreferences = prefsGetUserPreferences;
export const updateUserPreferences = prefsUpdateUserPreferences;
export const getCurrentProgramId = prefsGetCurrentProgramId;
export const setCurrentProgramId = prefsSetCurrentProgramId;

// =============================================================================
// USER PROFILE (delegated to services/db/preferences.ts)
// =============================================================================

export const getUserProfile = prefsGetUserProfile;
export const updateUserProfile = prefsUpdateUserProfile;

// =============================================================================
// MUSCLE GROUP TARGETS (delegated to services/db/preferences.ts)
// =============================================================================

export const getMuscleGroupTargets = prefsGetMuscleGroupTargets;
export const removeMuscleGroupTarget = prefsRemoveMuscleGroupTarget;
export const saveMuscleGroupTargets = prefsSaveMuscleGroupTargets;

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

export const clearAllWorkouts = workoutsDb.clearAllWorkouts;

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
// REST TIMER PERSISTENCE (delegated to services/db/timers.ts)
// =============================================================================

export type { ActiveTimerState, TimerContext } from '@/services/db/timers';

export const saveActiveTimer = timerSaveActiveTimer;
export const getActiveTimer = timerGetActiveTimer;
export const getAllActiveTimers = timerGetAllActiveTimers;
export const clearActiveTimer = timerClearActiveTimer;
export const clearAllActiveTimers = timerClearAllActiveTimers;
export const clearTimersForContext = timerClearTimersForContext;
export const updateTimerSetsCompleted = timerUpdateTimerSetsCompleted;

const cleanupOrphanedTimersWithDatabase = timerCleanupOrphanedTimersWithDatabase;

// =============================================================================
// MIGRATION / DATA IMPORT
// =============================================================================

// Register cross-module dependencies after all exports are defined
registerPreferencesDeps({
  incrementQueueGenerationId,
  generateWorkoutQueue,
  clearWorkoutQueue,
});
