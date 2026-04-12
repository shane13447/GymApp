/**
 * Database Timer Module
 *
 * CRUD operations for active rest timers.
 * Extracted from database.ts to keep the facade thin.
 */

import { getDatabase } from '@/services/db/connection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

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

export const cleanupOrphanedTimersWithDatabase = async (database: import('expo-sqlite').SQLiteDatabase): Promise<number> => {
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
 */
export const cleanupOrphanedTimers = async (): Promise<number> => {
  const database = await getDatabase();
  return cleanupOrphanedTimersWithDatabase(database);
};