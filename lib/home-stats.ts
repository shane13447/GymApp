/**
 * Home dashboard pure logic extracted from Home.tsx.
 *
 * All functions here are pure (no React, no db, no side-effects)
 * so they can be unit-tested independently of the component lifecycle.
 */

import type { Workout, WorkoutQueueItem } from '@/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Summary statistics displayed on the Home dashboard.
 */
export interface HomeStats {
  totalWorkouts: number;
  thisWeek: number;
  streak: number;
}

// =============================================================================
// Streak calculation
// =============================================================================

/**
 * Calculate the current workout streak from a list of workouts.
 *
 * A "streak" counts consecutive days (going backward from today or yesterday)
 * where a completed workout was logged. If today has no workout, starting
 * from yesterday is allowed (one-day grace for "haven't worked out yet today").
 *
 * @param workouts - Full list of workouts with completion status
 * @returns Number of consecutive days with completed workouts, ending at today or yesterday
 */
export const calculateStreak = (workouts: Workout[], now?: Date): number => {
  const completedWorkouts = workouts.filter((workout) => workout.completed);
  if (completedWorkouts.length === 0) return 0;

  let streak = 0;
  const today = new Date((now ?? new Date()).getTime());
  // Use UTC to match workout.date UTC comparisons (ISO strings use UTC)
  today.setUTCHours(0, 0, 0, 0);

  let checkDate = new Date(today);
  for (let i = 0; i < 365; i++) {
    const dateStr = checkDate.toISOString().split('T')[0];
    const hasWorkout = completedWorkouts.some(
      (workout) => workout.date.split('T')[0] === dateStr
    );

    if (hasWorkout) {
      streak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else if (i === 0) {
      // Grace: allow skipping today and checking from yesterday
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
};

// =============================================================================
// Weekly workout count
// =============================================================================

/**
 * Count completed workouts that fall within the current calendar week.
 *
 * Week starts on Sunday (as per Date.getDay() convention).
 *
 * @param workouts - Full list of workouts
 * @returns Number of completed workouts this week
 */
export const getThisWeekWorkoutCount = (workouts: Workout[], now?: Date): number => {
  const referenceDate = now ?? new Date();
  const weekStart = new Date(referenceDate);
  // Preserve local calendar boundaries to match the Home screen's prior behavior.
  weekStart.setDate(referenceDate.getDate() - referenceDate.getDay());
  weekStart.setHours(0, 0, 0, 0);

  return workouts.filter(
    (workout) => new Date(workout.date) >= weekStart && workout.completed
  ).length;
};

// =============================================================================
// Date formatting
// =============================================================================

/**
 * Format a date string as a human-readable relative description.
 *
 * - "Today" for dates from today
 * - "Yesterday" for dates from yesterday
 * - "X days ago" for dates within the past week
 * - "Mon Day" (e.g. "Apr 12") for older dates
 *
 * @param dateString - ISO date string
 * @returns Human-readable relative date description
 */
export const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((todayMidnight.getTime() - dateMidnight.getTime()) / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// =============================================================================
// Muscle group extraction
// =============================================================================

/**
 * Collect unique, sorted muscle groups from a queue item's exercises.
 *
 * @param workout - Queue item containing exercises with muscle_groups_worked
 * @returns Sorted array of unique muscle group names
 */
export const getMuscleGroups = (workout: WorkoutQueueItem): string[] => {
  const muscleGroups = new Set<string>();
  workout.exercises.forEach((exercise) => {
    exercise.muscle_groups_worked.forEach((group) => {
      muscleGroups.add(group);
    });
  });
  return Array.from(muscleGroups).sort();
};

/**
 * Build a short human-readable summary of muscle groups targeted.
 *
 * - "mixed focus" when no groups are tagged
 * - Comma-separated names for 3 or fewer groups
 * - Truncated with "+N" overflow for more than 3 groups
 *
 * @param workout - Queue item to summarize
 * @returns Summary string
 */
export const getMuscleGroupSummary = (workout: WorkoutQueueItem): string => {
  const groups = getMuscleGroups(workout);
  if (groups.length === 0) return 'mixed focus';
  if (groups.length <= 3) return groups.join(', ');
  return `${groups.slice(0, 3).join(', ')} +${groups.length - 3}`;
};
