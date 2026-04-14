/**
 * Tests for home dashboard pure logic extracted from Home.tsx.
 * Covers streak calculation, date formatting, muscle group extraction,
 * and weekly workout counting.
 *
 * All date-sensitive tests use fixed Date objects to avoid timezone flakiness.
 */

import {
  calculateStreak,
  formatRelativeDate,
  getMuscleGroups,
  getMuscleGroupSummary,
  getThisWeekWorkoutCount,
} from '@/lib/home-stats';
import type { Workout, WorkoutQueueItem } from '@/types';

/**
 * Create a minimal Workout with a given ISO date string and completion status.
 */
function makeWorkout(date: string, completed: boolean = true): Workout {
  return {
    id: `w-${date}`,
    date,
    programId: 'prog-1',
    programName: 'Test Program',
    dayNumber: 1,
    exercises: [],
    completed,
  };
}

/**
 * Create a date at a specific UTC hour on a YYYY-MM-DD day.
 */
function makeDate(yyyyMmDd: string, hour: number = 12): Date {
  return new Date(`${yyyyMmDd}T${String(hour).padStart(2, '0')}:00:00Z`);
}

/**
 * Create a minimal WorkoutQueueItem with specified muscle groups.
 */
function makeQueueItem(muscleGroups: string[]): WorkoutQueueItem {
  return {
    id: 'q-1',
    programId: 'prog-1',
    programName: 'Test Program',
    dayNumber: 1,
    exercises: muscleGroups.map((muscleGroup, index) => ({
      name: `Exercise ${index}`,
      equipment: 'barbell',
      muscle_groups_worked: [muscleGroup],
      isCompound: true,
      weight: '80',
      reps: '5',
      sets: '3',
      restTime: '180',
      progression: '2.5',
      hasCustomisedSets: false,
      variant: null,
    })),
    position: 0,
  };
}

describe('calculateStreak', () => {
  it('returns 0 for empty workout list', () => {
    expect(calculateStreak([], makeDate('2026-04-13'))).toBe(0);
  });

  it('returns 0 when no workouts are completed', () => {
    const now = makeDate('2026-04-13');
    const workouts = [makeWorkout('2026-04-13T10:00:00Z', false)];

    expect(calculateStreak(workouts, now)).toBe(0);
  });

  it('returns 1 for a single completed workout on the reference day', () => {
    const now = makeDate('2026-04-13');
    const workouts = [makeWorkout('2026-04-13T10:00:00Z', true)];

    expect(calculateStreak(workouts, now)).toBe(1);
  });

  it('counts consecutive days ending on reference day', () => {
    const now = makeDate('2026-04-13');
    const workouts = [
      makeWorkout('2026-04-11T10:00:00Z', true),
      makeWorkout('2026-04-12T10:00:00Z', true),
      makeWorkout('2026-04-13T10:00:00Z', true),
    ];

    expect(calculateStreak(workouts, now)).toBe(3);
  });

  it('counts streak starting from day before when reference day has no workout', () => {
    const now = makeDate('2026-04-13');
    const workouts = [makeWorkout('2026-04-12T10:00:00Z', true)];

    expect(calculateStreak(workouts, now)).toBe(1);
  });

  it('breaks streak when a day is missing', () => {
    const now = makeDate('2026-04-13');
    const workouts = [
      makeWorkout('2026-04-10T10:00:00Z', true),
      makeWorkout('2026-04-12T10:00:00Z', true),
    ];

    expect(calculateStreak(workouts, now)).toBe(1);
  });

  it('ignores incomplete workouts for streak calculation', () => {
    const now = makeDate('2026-04-13');
    const workouts = [
      makeWorkout('2026-04-12T10:00:00Z', true),
      makeWorkout('2026-04-13T10:00:00Z', false),
    ];

    expect(calculateStreak(workouts, now)).toBe(1);
  });

  it('does not mutate the provided reference date', () => {
    const now = makeDate('2026-04-13', 9);

    calculateStreak([makeWorkout('2026-04-13T10:00:00Z', true)], now);

    expect(now.toISOString()).toBe('2026-04-13T09:00:00.000Z');
  });
});

describe('formatRelativeDate', () => {
  it('returns "Today" for dates from today', () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    expect(formatRelativeDate(today.toISOString())).toBe('Today');
  });

  it('returns "Yesterday" for dates from yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);

    expect(formatRelativeDate(yesterday.toISOString())).toBe('Yesterday');
  });

  it('returns "X days ago" for dates within the past week', () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(12, 0, 0, 0);

    expect(formatRelativeDate(threeDaysAgo.toISOString())).toBe('3 days ago');
  });

  it('returns formatted date for dates older than a week', () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    twoWeeksAgo.setHours(12, 0, 0, 0);

    const result = formatRelativeDate(twoWeeksAgo.toISOString());

    expect(result).not.toBe('Today');
    expect(result).not.toBe('Yesterday');
    expect(result).not.toContain('days ago');
  });
});

describe('getMuscleGroups', () => {
  it('returns empty array for queue item with no exercises', () => {
    const item: WorkoutQueueItem = {
      id: 'q-1',
      programId: 'prog-1',
      programName: 'Test',
      dayNumber: 1,
      exercises: [],
      position: 0,
    };

    expect(getMuscleGroups(item)).toEqual([]);
  });

  it('collects and sorts unique muscle groups', () => {
    const item = makeQueueItem(['chest', 'back', 'chest', 'shoulders']);

    expect(getMuscleGroups(item)).toEqual(['back', 'chest', 'shoulders']);
  });
});

describe('getMuscleGroupSummary', () => {
  it('returns "mixed focus" for no muscle groups', () => {
    const item = makeQueueItem([]);

    expect(getMuscleGroupSummary(item)).toBe('mixed focus');
  });

  it('returns joined groups for 3 or fewer', () => {
    const item = makeQueueItem(['triceps', 'chest']);

    expect(getMuscleGroupSummary(item)).toBe('chest, triceps');
  });

  it('truncates with count for more than 3 groups', () => {
    const item = makeQueueItem(['biceps', 'chest', 'back', 'shoulders', 'triceps']);

    expect(getMuscleGroupSummary(item)).toBe('back, biceps, chest +2');
  });
});

describe('getThisWeekWorkoutCount', () => {
  it('returns 0 for empty workouts', () => {
    expect(getThisWeekWorkoutCount([], makeDate('2026-04-13'))).toBe(0);
  });

  it('counts only completed workouts in the same week', () => {
    const now = makeDate('2026-04-13');
    const workouts = [
      makeWorkout('2026-04-13T10:00:00Z', true),
      makeWorkout('2026-04-13T15:00:00Z', false),
      makeWorkout('2026-04-05T10:00:00Z', true),
    ];

    expect(getThisWeekWorkoutCount(workouts, now)).toBe(1);
  });

  it('excludes workouts from previous weeks', () => {
    const now = makeDate('2026-04-13');
    const workouts = [makeWorkout('2026-04-05T10:00:00Z', true)];

    expect(getThisWeekWorkoutCount(workouts, now)).toBe(0);
  });

  it('uses local calendar week boundaries near midnight', () => {
    const now = new Date(2026, 3, 13, 12, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const timezoneOffsetMinutes = weekStart.getTimezoneOffset();
    if (timezoneOffsetMinutes === 0) {
      return;
    }

    const workoutDate = timezoneOffsetMinutes < 0
      ? new Date(weekStart.getTime() + 30 * 60 * 1000)
      : new Date(weekStart.getTime() - 30 * 60 * 1000);

    expect(getThisWeekWorkoutCount([makeWorkout(workoutDate.toISOString(), true)], now)).toBe(
      timezoneOffsetMinutes < 0 ? 1 : 0
    );
  });
});
