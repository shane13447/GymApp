/**
 * Hook encapsulating History screen data loading and grouping.
 *
 * Manages workout loading on mount, grouping by date, and
 * pull-to-refresh. The pure grouping logic lives in
 * lib/workout-history.ts for independent testability.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

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
  const loadRequestIdRef = useRef(0);

  const loadWorkouts = useCallback(async (mode: 'initial' | 'refresh') => {
    const requestId = ++loadRequestIdRef.current;

    if (mode === 'refresh') {
      setIsRefreshing(true);
    }

    try {
      const loadedWorkouts = await db.getAllWorkouts();
      if (requestId === loadRequestIdRef.current) {
        setWorkouts(loadedWorkouts);
      }
    } catch (error) {
      console.error('Error loading workouts:', error);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
        if (mode === 'refresh') {
          setIsRefreshing(false);
        }
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWorkouts('initial');
    }, [loadWorkouts])
  );

  const handleRefresh = useCallback(async () => {
    await loadWorkouts('refresh');
  }, [loadWorkouts]);

  const workoutsByDate = useMemo(() => groupWorkoutsByDate(workouts), [workouts]);

  return {
    workouts,
    workoutsByDate,
    isLoading,
    isRefreshing,
    handleRefresh,
  };
};
