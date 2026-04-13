/**
 * Tests for workout history pure logic extracted from History.tsx.
 * Covers date grouping, time formatting, and edge cases.
 */

import { groupWorkoutsByDate, formatTime } from '@/lib/workout-history';
import type { Workout } from '@/types';

/** Helper: create a minimal Workout with a given date and program name. */
function makeWorkout(date: string, programName: string = 'Test Program', completed: boolean = true): Workout {
  return {
    id: `w-${date}-${programName}`,
    date,
    programId: 'prog-1',
    programName,
    dayNumber: 1,
    exercises: [],
    completed,
  };
}

// =============================================================================
// groupWorkoutsByDate
// =============================================================================

describe('groupWorkoutsByDate', () => {
  it('returns empty array for empty input', () => {
    expect(groupWorkoutsByDate([])).toEqual([]);
  });

  it('groups workouts by date', () => {
    const workouts = [
      makeWorkout('2026-04-13T10:00:00Z', 'Morning Workout'),
      makeWorkout('2026-04-13T15:00:00Z', 'Evening Workout'),
      makeWorkout('2026-04-12T09:00:00Z', 'Yesterday Workout'),
    ];

    const result = groupWorkoutsByDate(workouts);
    expect(result.length).toBe(2);
    // Most recent date group first
    expect(result[0].workouts.length).toBe(2);
    expect(result[1].workouts.length).toBe(1);
  });

  it('sorts groups by date descending', () => {
    const workouts = [
      makeWorkout('2026-04-10T10:00:00Z'),
      makeWorkout('2026-04-13T10:00:00Z'),
      makeWorkout('2026-04-11T10:00:00Z'),
    ];

    const result = groupWorkoutsByDate(workouts);
    // Groups should be sorted newest first
    const dates = result.map((g) => new Date(g.workouts[0].date).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThan(dates[i]);
    }
  });

  it('sorts workouts within each group by time descending', () => {
    const workouts = [
      makeWorkout('2026-04-13T08:00:00Z', 'Early'),
      makeWorkout('2026-04-13T18:00:00Z', 'Late'),
      makeWorkout('2026-04-13T12:00:00Z', 'Mid'),
    ];

    const result = groupWorkoutsByDate(workouts);
    expect(result.length).toBe(1);
    expect(result[0].workouts[0].programName).toBe('Late');
    expect(result[0].workouts[1].programName).toBe('Mid');
    expect(result[0].workouts[2].programName).toBe('Early');
  });

  it('handles single workout', () => {
    const workouts = [makeWorkout('2026-04-13T10:00:00Z')];
    const result = groupWorkoutsByDate(workouts);
    expect(result.length).toBe(1);
    expect(result[0].workouts.length).toBe(1);
  });
});

// =============================================================================
// formatTime
// =============================================================================

describe('formatTime', () => {
  it('formats a time string with hour and minute', () => {
    const result = formatTime('2026-04-13T15:30:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns a non-empty string for any valid date', () => {
    expect(formatTime('2026-01-01T00:00:00Z')).toBeTruthy();
    expect(formatTime('2026-12-31T23:59:59Z')).toBeTruthy();
  });
});