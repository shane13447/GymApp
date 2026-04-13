/**
 * Hook encapsulating Home screen data loading and stats calculation.
 *
 * Extracts business logic from Home.tsx into a reusable, testable hook.
 * The hook manages data loading state, streak/stats computation, and
 * refresh behavior — leaving the component as a thin render layer.
 */

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import * as db from '@/services/database';
import {
  calculateStreak,
  getThisWeekWorkoutCount,
  type HomeStats,
} from '@/lib/home-stats';
import type { Program, Workout, WorkoutQueueItem } from '@/types';

/**
 * Loading state machine for the Home dashboard.
 */
export type HomeLoadState = 'initial_loading' | 'refreshing' | 'loaded' | 'failed';

/**
 * Return type for the useHomeData hook.
 */
export interface HomeDataResult {
  loadState: HomeLoadState;
  isRefreshing: boolean;
  loadError: string | null;
  currentProgram: Program | null;
  nextWorkout: WorkoutQueueItem | null;
  recentWorkouts: Workout[];
  stats: HomeStats;
  handleRefresh: () => Promise<void>;
  retry: () => Promise<void>;
}

type HomeDataLoadMode = 'initial' | 'refresh';

/**
 * Provides Home dashboard data: program, queue, recent workouts, and stats.
 *
 * - Loads data on screen focus with request cancellation via ref counter.
 * - Computes streak, weekly count, and total from historical workouts.
 * - Supports pull-to-refresh and error retry.
 */
export const useHomeData = (): HomeDataResult => {
  const [loadState, setLoadState] = useState<HomeLoadState>('initial_loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null);
  const [nextWorkout, setNextWorkout] = useState<WorkoutQueueItem | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [stats, setStats] = useState<HomeStats>({
    totalWorkouts: 0,
    thisWeek: 0,
    streak: 0,
  });

  /**
   * Load dashboard data from the database.
   *
   * Uses a request-ID counter for cancellation: if a newer request
   * supersedes this one, stale results are silently discarded.
   *
   * @param mode - 'initial' for first load (shows skeleton), 'refresh' for pull-to-refresh
   */
  const loadData = useCallback(async (mode: HomeDataLoadMode) => {
    const requestId = ++loadRequestIdRef.current;

    if (mode === 'refresh') {
      setIsRefreshing(true);
      setLoadState('refreshing');
    } else {
      setLoadState((current) => current === 'loaded' ? current : 'initial_loading');
    }

    console.log('[startup][home_load_start]', { mode, requestId });

    try {
      const currentProgramId = await db.getCurrentProgramId();
      if (loadRequestIdRef.current !== requestId) return;

      if (currentProgramId) {
        const program = await db.getProgramById(currentProgramId);
        if (loadRequestIdRef.current !== requestId) return;
        setCurrentProgram(program);
      } else {
        setCurrentProgram(null);
      }

      const queue = await db.getWorkoutQueue();
      if (loadRequestIdRef.current !== requestId) return;
      setNextWorkout(queue.length > 0 ? queue[0] : null);

      const workouts = await db.getAllWorkouts();
      if (loadRequestIdRef.current !== requestId) return;
      setRecentWorkouts(workouts.slice(0, 3));

      const completedWorkouts = workouts.filter((w) => w.completed);
      const thisWeek = getThisWeekWorkoutCount(workouts);
      const streak = calculateStreak(workouts);

      setStats({
        totalWorkouts: completedWorkouts.length,
        thisWeek,
        streak,
      });
      setLoadError(null);
      setLoadState('loaded');
      console.log('[startup][home_load_end]', { mode, requestId, status: 'ok' });
    } catch (error) {
      if (loadRequestIdRef.current !== requestId) return;

      console.error('Error loading home data:', error);
      setLoadError('Unable to load dashboard data right now.');
      setLoadState('failed');
      console.log('[startup][home_load_end]', { mode, requestId, status: 'error' });
    } finally {
      if (loadRequestIdRef.current === requestId && mode === 'refresh') {
        setIsRefreshing(false);
      }
    }
  }, []);

  /** Pull-to-refresh handler. */
  const handleRefresh = useCallback(async () => {
    await loadData('refresh');
  }, [loadData]);

  /** Retry handler for the error state. */
  const retry = useCallback(async () => {
    await loadData('initial');
  }, [loadData]);

  // Reload on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData('initial');
    }, [loadData])
  );

  return {
    loadState,
    isRefreshing,
    loadError,
    currentProgram,
    nextWorkout,
    recentWorkouts,
    stats,
    handleRefresh,
    retry,
  };
};
