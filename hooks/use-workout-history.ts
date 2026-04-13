/**
 * Hook encapsulating History screen data loading and grouping.
 *
 * Manages workout loading on mount, grouping by date, and
 * pull-to-refresh. The pure grouping logic lives in
 * lib/workout-history.ts for independent testability.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import * as db from '@/services/database';
import { groupWorkoutsByDate, type WorkoutsByDate } from '@/lib/workout-history';
import type { Workout } from '@/types';

/**
 * Return type for the useWorkoutHistory hook.
 */
export interface WorkoutHistoryResult {
  workouts: Workout[];
  workoutsByDate: WorkoutsByDate[];
  isLoading: boolean;
  isRefreshing: boolean;
  handleRefresh: () => Promise<void>;
}

/**
 * Manages workout history data loading, grouping, and refresh.
 *
 * Loads all workouts on mount, groups them by date for display,
 * and supports pull-to-refresh.
 */
export const useWorkoutHistory = (): WorkoutHistoryResult => {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Load workout history from persistence and update local screen state.
   * Sets the initial loading flag false once the request completes.
   */
  const loadWorkouts = async () => {
    try {
      const loadedWorkouts = await db.getAllWorkouts();
      setWorkouts(loadedWorkouts);
    } catch (error) {
      console.error('Error loading workouts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkouts();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadWorkouts();
    setIsRefreshing(false);
  }, []);

  const workoutsByDate = useMemo(() => groupWorkoutsByDate(workouts), [workouts]);

  return {
    workouts,
    workoutsByDate,
    isLoading,
    isRefreshing,
    handleRefresh,
  };
};
