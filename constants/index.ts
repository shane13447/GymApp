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
export const DEFAULT_REPS = '8';
export const DEFAULT_PROGRESSION = '';

// Exercise defaults for new exercises
export const EXERCISE_DEFAULTS = {
  weight: '0',
  reps: DEFAULT_REPS,
  sets: DEFAULT_SETS,
  restTime: DEFAULT_REST_TIME,
  progression: DEFAULT_PROGRESSION,
  hasCustomisedSets: false,
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

// =============================================================================
// TRAINING GOALS
// =============================================================================

export const TRAINING_GOAL_LABELS = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  improve_overall_health: 'Improve Overall Health',
} as const;

// =============================================================================
// PROFILE DEFAULTS
// =============================================================================

export const DEFAULT_TARGET_SETS_PER_WEEK = 10;

// =============================================================================
// HIERARCHICAL EXERCISE MENU STRUCTURE
// =============================================================================

/**
 * Exercise type - top level classification
 */
export type ExerciseType = 'compound' | 'isolation';

/**
 * Broad muscle categories for the hierarchical menu
 */
export const BROAD_MUSCLE_CATEGORIES = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Abs'] as const;
export type BroadMuscleCategory = (typeof BROAD_MUSCLE_CATEGORIES)[number];

/**
 * Maps broad categories to specific muscle groups from the exercise data
 */
export const MUSCLE_GROUP_MAPPING: Record<BroadMuscleCategory, string[]> = {
  Chest: ['chest'],
  Back: ['lats', 'traps'],
  Shoulders: ['shoulders'],
  Legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  Arms: ['biceps', 'triceps', 'forearms'],
  Abs: ['abs'],
};

/**
 * Compound exercise menu structure
 * Categories that show exercises directly (no sub-menu)
 */
export const COMPOUND_CATEGORIES: BroadMuscleCategory[] = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms'];

/**
 * Isolation exercise menu structure
 * Categories with sub-menus for more granular targeting
 */
export const ISOLATION_CATEGORIES: BroadMuscleCategory[] = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Abs'];

/**
 * Sub-categories for isolation exercises
 * Categories not listed here show exercises directly
 */
export const ISOLATION_SUBCATEGORIES: Partial<Record<BroadMuscleCategory, string[]>> = {
  Back: ['Lats', 'Traps'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  Arms: ['Biceps', 'Triceps', 'Forearms'],
};

/**
 * Maps sub-category display names to muscle group keys
 */
export const SUBCATEGORY_TO_MUSCLE: Record<string, string> = {
  Lats: 'lats',
  Traps: 'traps',
  Quads: 'quads',
  Hamstrings: 'hamstrings',
  Glutes: 'glutes',
  Calves: 'calves',
  Biceps: 'biceps',
  Triceps: 'triceps',
  Forearms: 'forearms',
};
