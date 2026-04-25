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

export const getCurrentProgramId = async (): Promise<string | null> => {
  const prefs = await getUserPreferences();
  return prefs.currentProgramId;
};

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

export const removeMuscleGroupTarget = async (
  muscleGroup: string
): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync(
    'DELETE FROM muscle_group_targets WHERE muscle_group = ?',
    [muscleGroup]
  );
};

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
