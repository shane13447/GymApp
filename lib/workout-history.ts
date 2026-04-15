/**
 * Workout history pure logic extracted from History.tsx.
 *
 * Contains date grouping and time formatting functions that
 * have no React or database dependencies, making them independently
 * testable. The React hook wrapper remains in hooks/use-workout-history.ts.
 */

import type { Workout } from '@/types';

// =============================================================================
// Types
// =============================================================================

/**
 * A group of workouts sharing the same calendar date.
 */
export interface WorkoutsByDate {
  date: string;
  workouts: Workout[];
}

// =============================================================================
// Pure functions
// =============================================================================

/**
 * Group workouts by their calendar date, sorted newest-first.
 *
 * Each workout's date is formatted to a locale string like
 * "April 13, 2026" for grouping, and workouts within each group
 * are sorted by timestamp descending.
 *
 * @param workouts - Flat list of workouts (may be unsorted)
 * @returns Array of WorkoutsByDate groups, sorted newest first
 */
export const groupWorkoutsByDate = (workouts: Workout[]): WorkoutsByDate[] => {
  const grouped: Map<string, { sortKey: number; workouts: Workout[] }> = new Map();

  workouts.forEach((workout) => {
    const workoutDate = new Date(workout.date);
    const dateKey = workoutDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const existing = grouped.get(dateKey);
    if (existing) {
      existing.workouts.push(workout);
    } else {
      grouped.set(dateKey, { sortKey: workoutDate.getTime(), workouts: [workout] });
    }
  });

  return Array.from(grouped.entries())
    .sort(([, a], [, b]) => b.sortKey - a.sortKey)
    .map(([date, { workouts: group }]) => ({
      date,
      workouts: group.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    }));
};

/**
 * Format a date string as a localized time string (e.g. "3:05 PM").
 *
 * @param dateString - ISO date string
 * @returns Formatted time string
 */
export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};