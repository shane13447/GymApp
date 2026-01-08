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
  ProgramExercise,
  UserPreferences,
  Workout,
  WorkoutDay,
  WorkoutQueueItem
} from '@/types';
import * as SQLite from 'expo-sqlite';

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Get the database instance, initializing if necessary
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await initializeDatabase(db);
  }
  return db;
};

/**
 * Initialize database schema
 */
const initializeDatabase = async (database: SQLite.SQLiteDatabase): Promise<void> => {
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
      weight REAL DEFAULT 0,
      reps INTEGER DEFAULT 8,
      sets INTEGER DEFAULT 3,
      rest_time INTEGER DEFAULT 180,
      progression REAL DEFAULT 0,
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
      weight REAL DEFAULT 0,
      reps INTEGER DEFAULT 8,
      sets INTEGER DEFAULT 3,
      rest_time INTEGER DEFAULT 180,
      progression REAL DEFAULT 0,
      logged_weight REAL DEFAULT 0,
      logged_reps INTEGER DEFAULT 0,
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
      weight REAL DEFAULT 0,
      reps INTEGER DEFAULT 8,
      sets INTEGER DEFAULT 3,
      rest_time INTEGER DEFAULT 180,
      progression REAL DEFAULT 0,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (queue_item_id) REFERENCES workout_queue(id) ON DELETE CASCADE
    );

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
  await updateUserPreferences({ currentProgramId: programId });
  
  // Generate workout queue if a program is set
  if (programId) {
    await generateWorkoutQueue(programId);
  } else {
    await clearWorkoutQueue();
  }
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
      weight: number;
      reps: number;
      sets: number;
      rest_time: number;
      progression: number;
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
        muscle_groups_worked: JSON.parse(ex.muscle_groups),
        weight: ex.weight,
        reps: ex.reps,
        sets: ex.sets,
        restTime: ex.rest_time,
        progression: ex.progression,
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
      await database.runAsync(
        `INSERT INTO program_exercises 
         (workout_day_id, name, equipment, muscle_groups, weight, reps, sets, rest_time, progression, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dayId,
          exercise.name,
          exercise.equipment,
          JSON.stringify(exercise.muscle_groups_worked),
          exercise.weight,
          exercise.reps,
          exercise.sets,
          exercise.restTime,
          exercise.progression,
          i,
        ]
      );
    }
  }

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
      await database.runAsync(
        `INSERT INTO program_exercises 
         (workout_day_id, name, equipment, muscle_groups, weight, reps, sets, rest_time, progression, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dayId,
          exercise.name,
          exercise.equipment,
          JSON.stringify(exercise.muscle_groups_worked),
          exercise.weight,
          exercise.reps,
          exercise.sets,
          exercise.restTime,
          exercise.progression,
          i,
        ]
      );
    }
  }
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
  await database.runAsync('DELETE FROM programs WHERE id = ?', [programId]);
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
      weight: number;
      reps: number;
      sets: number;
      rest_time: number;
      progression: number;
      logged_weight: number;
      logged_reps: number;
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
        muscle_groups_worked: JSON.parse(ex.muscle_groups),
        weight: ex.weight,
        reps: ex.reps,
        sets: ex.sets,
        restTime: ex.rest_time,
        progression: ex.progression,
        loggedWeight: ex.logged_weight,
        loggedReps: ex.logged_reps,
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
    await database.runAsync(
      `INSERT INTO workout_exercises 
       (workout_id, name, equipment, muscle_groups, weight, reps, sets, rest_time, progression, logged_weight, logged_reps, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workout.id,
        exercise.name,
        exercise.equipment,
        JSON.stringify(exercise.muscle_groups_worked),
        exercise.weight,
        exercise.reps,
        exercise.sets,
        exercise.restTime,
        exercise.progression,
        exercise.loggedWeight,
        exercise.loggedReps,
        i,
      ]
    );
  }
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
  programId: string
): Promise<number | null> => {
  const database = await getDatabase();
  
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
      weight: number;
      reps: number;
      sets: number;
      rest_time: number;
      progression: number;
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
        name: ex.name,
        equipment: ex.equipment,
        muscle_groups_worked: JSON.parse(ex.muscle_groups),
        weight: ex.weight,
        reps: ex.reps,
        sets: ex.sets,
        restTime: ex.rest_time,
        progression: ex.progression,
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
      await database.runAsync(
        `INSERT INTO queue_exercises 
         (queue_item_id, name, equipment, muscle_groups, weight, reps, sets, rest_time, progression, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          exercise.name,
          exercise.equipment,
          JSON.stringify(exercise.muscle_groups_worked),
          exercise.weight,
          exercise.reps,
          exercise.sets,
          exercise.restTime,
          exercise.progression,
          j,
        ]
      );
    }
  }
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
    await database.runAsync(
      `INSERT INTO queue_exercises 
       (queue_item_id, name, equipment, muscle_groups, weight, reps, sets, rest_time, progression, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        exercise.name,
        exercise.equipment,
        JSON.stringify(exercise.muscle_groups_worked),
        exercise.weight,
        exercise.reps,
        exercise.sets,
        exercise.restTime,
        exercise.progression,
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
    await database.runAsync(
      `INSERT INTO queue_exercises 
       (queue_item_id, name, equipment, muscle_groups, weight, reps, sets, rest_time, progression, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        exercise.name,
        exercise.equipment,
        JSON.stringify(exercise.muscle_groups_worked),
        exercise.weight,
        exercise.reps,
        exercise.sets,
        exercise.restTime,
        exercise.progression,
        j,
      ]
    );
  }
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
  const program = await getProgramById(programId);
  if (!program || program.workoutDays.length === 0) {
    console.warn('Cannot generate queue: Program not found or has no workout days');
    return;
  }

  // Clear existing queue
  await clearWorkoutQueue();

  const queueItems: WorkoutQueueItem[] = [];
  const numDays = program.workoutDays.length;

  for (let i = 0; i < DEFAULT_QUEUE_SIZE; i++) {
    const dayIndex = i % numDays;
    const workoutDay = program.workoutDays[dayIndex];

    // Apply auto-progression to exercises
    const exercisesWithProgression: ProgramExercise[] = [];
    for (const exercise of workoutDay.exercises) {
      // Get last logged weight for this exercise
      const lastWeight = await getLastLoggedWeight(exercise.name, programId);
      
      let newWeight = exercise.weight;
      if (lastWeight !== null && exercise.progression > 0) {
        newWeight = lastWeight + exercise.progression;
      } else if (lastWeight !== null) {
        // Use last logged weight if no progression defined
        newWeight = lastWeight;
      }

      exercisesWithProgression.push({
        ...exercise,
        weight: newWeight,
      });
    }

    queueItems.push({
      id: `queue-${Date.now()}-${i}`,
      programId: program.id,
      programName: program.name,
      dayNumber: workoutDay.dayNumber,
      exercises: exercisesWithProgression,
      position: i,
    });
  }

  // Save the generated queue
  await saveWorkoutQueue(queueItems);
  console.log(`Generated workout queue with ${queueItems.length} items for program: ${program.name}`);
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
  if (db) {
    await db.closeAsync();
    db = null;
  }
};
