/**
 * Database Preferences & Profile Module
 *
 * User preferences, profile, and muscle group target CRUD.
 * Extracted from database.ts to keep the facade thin.
 */

import { DEFAULT_QUEUE_SIZE } from '@/constants';
import type { MuscleGroupTarget, UserPreferences, UserProfile } from '@/types';
import { TrainingGoal } from '@/types';

import { getDatabase, runInTransaction } from '@/services/db/connection';

// ---------------------------------------------------------------------------
// Dependency injection types (for setCurrentProgramId cross-cutting deps)
// ---------------------------------------------------------------------------

type IncrementQueueGenerationIdFn = () => number;
type GetQueueGenerationIdFn = () => number;
type GenerateWorkoutQueueFn = (programId: string) => Promise<number | null>;
type ClearWorkoutQueueFn = () => Promise<void>;

let _incrementQueueGenerationId: IncrementQueueGenerationIdFn = () => 0;
let _getQueueGenerationId: GetQueueGenerationIdFn = () => 0;
let _generateWorkoutQueue: GenerateWorkoutQueueFn = async () => null;
let _clearWorkoutQueue: ClearWorkoutQueueFn = async () => {};

/**
 * Register cross-cutting dependencies that this module cannot import directly
 * (to avoid circular dependencies). Called once at app init from database.ts.
 */
export const registerPreferencesDeps = (deps: {
  incrementQueueGenerationId: IncrementQueueGenerationIdFn;
  getQueueGenerationId: GetQueueGenerationIdFn;
  generateWorkoutQueue: GenerateWorkoutQueueFn;
  clearWorkoutQueue: ClearWorkoutQueueFn;
}): void => {
  _incrementQueueGenerationId = deps.incrementQueueGenerationId;
  _getQueueGenerationId = deps.getQueueGenerationId;
  _generateWorkoutQueue = deps.generateWorkoutQueue;
  _clearWorkoutQueue = deps.clearWorkoutQueue;
};

// ---------------------------------------------------------------------------
// User Preferences
// ---------------------------------------------------------------------------

/**
 * Read the singleton user preferences row, returning sensible defaults when no
 * row exists yet.
 *
 * @returns {Promise<UserPreferences>} The stored (or default) user preferences.
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
 * Update one or more fields of the singleton user preferences row. Only
 * provided (non-undefined) fields are written; `updated_at` is refreshed when
 * any field changes.
 *
 * @param {Partial<UserPreferences>} preferences - The preference fields to update.
 * @returns {Promise<void>} Resolves when the update has been persisted.
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
 * Get the id of the currently-selected program from user preferences.
 *
 * @returns {Promise<string | null>} The current program id, or null if none is set.
 */
export const getCurrentProgramId = async (): Promise<string | null> => {
  const prefs = await getUserPreferences();
  return prefs.currentProgramId;
};

/**
 * Set (or clear) the current program. Selecting a program regenerates the
 * workout queue and aborts if a newer generation superseded it; clearing the
 * program bumps the queue generation id and clears the queue. Either way the
 * preference is updated on success.
 *
 * @param {string | null} programId - The program to make current, or null to clear.
 * @returns {Promise<void>} Resolves once the change has been applied.
 */
export const setCurrentProgramId = async (programId: string | null): Promise<void> => {
  if (programId) {
    const completedGenerationId = await _generateWorkoutQueue(programId);
    if (completedGenerationId === null || completedGenerationId !== _getQueueGenerationId()) {
      return;
    }
  } else {
    _incrementQueueGenerationId();
    await _clearWorkoutQueue();
  }

  await updateUserPreferences({ currentProgramId: programId });
};

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

/**
 * Read the singleton user profile row, returning a fully-null default profile
 * when no row exists yet.
 *
 * @returns {Promise<UserProfile>} The stored (or default) user profile.
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
 * Update one or more fields of the singleton user profile row. Only provided
 * (non-undefined) fields are written; `updated_at` is refreshed when any field
 * changes.
 *
 * @param {Partial<UserProfile>} profile - The profile fields to update.
 * @returns {Promise<void>} Resolves when the update has been persisted.
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

// ---------------------------------------------------------------------------
// Muscle Group Targets
// ---------------------------------------------------------------------------

/**
 * Read all configured muscle group targets, ordered by muscle group name.
 *
 * @returns {Promise<MuscleGroupTarget[]>} The list of muscle group targets.
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
 * Read the target set count for a single muscle group.
 *
 * @param {string} muscleGroup - The muscle group to look up.
 * @returns {Promise<number | null>} The target sets, or null if none is configured.
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
 * Insert or update the target set count for a muscle group (upsert).
 *
 * @param {string} muscleGroup - The muscle group to set.
 * @param {number} targetSets - The desired weekly target set count.
 * @returns {Promise<void>} Resolves when the target has been persisted.
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
 * Delete the target for a single muscle group, if present.
 *
 * @param {string} muscleGroup - The muscle group whose target should be removed.
 * @returns {Promise<void>} Resolves when the deletion has completed.
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
 * Replace all muscle group targets with the provided set, atomically within a
 * transaction (existing rows are cleared first).
 *
 * @param {MuscleGroupTarget[]} targets - The complete set of targets to persist.
 * @returns {Promise<void>} Resolves once all targets have been saved.
 */
export const saveMuscleGroupTargets = async (
  targets: MuscleGroupTarget[]
): Promise<void> => {
  const database = await getDatabase();

  await runInTransaction(database, async () => {
    await database.runAsync('DELETE FROM muscle_group_targets');

    for (const target of targets) {
      await database.runAsync(
        `INSERT INTO muscle_group_targets (muscle_group, target_sets)
         VALUES (?, ?)`,
        [target.muscleGroup, target.targetSets]
      );
    }
  });
};
