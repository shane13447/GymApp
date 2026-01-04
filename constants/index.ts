/**
 * Application constants
 */

// =============================================================================
// DATABASE
// =============================================================================

export const DATABASE_NAME = 'gymapp.db';
export const DATABASE_VERSION = 1;

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULT_WEIGHT_UNIT = 'kg' as const;
export const DEFAULT_QUEUE_SIZE = 3;
export const DEFAULT_REST_TIME = '180';
export const DEFAULT_SETS = '3';
export const DEFAULT_REPS = '8-12';
export const DEFAULT_PROGRESSION = '';

// Exercise defaults for new exercises
export const EXERCISE_DEFAULTS = {
  weight: '0',
  reps: DEFAULT_REPS,
  sets: DEFAULT_SETS,
  restTime: DEFAULT_REST_TIME,
  progression: DEFAULT_PROGRESSION,
} as const;

// =============================================================================
// LIMITS
// =============================================================================

export const MAX_PROGRAM_NAME_LENGTH = 100;
export const MAX_EXERCISE_NAME_LENGTH = 100;
export const MAX_WORKOUT_DAYS = 7;
export const MIN_WORKOUT_DAYS = 1;
export const MAX_EXERCISES_PER_DAY = 20;
export const MAX_QUEUE_SIZE = 10;

// =============================================================================
// UI CONSTANTS
// =============================================================================

export const ANIMATION_DURATION = 200;
export const DEBOUNCE_DELAY = 300;
export const LIST_ITEM_HEIGHT = 80;

// =============================================================================
// MUSCLE GROUPS
// =============================================================================

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'glutes',
  'hamstrings',
  'calves',
  'abs',
  'lats',
  'traps',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

// =============================================================================
// EQUIPMENT TYPES
// =============================================================================

export const EQUIPMENT_TYPES = [
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Bodyweight',
  '',
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];
