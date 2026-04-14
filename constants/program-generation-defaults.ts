/**
 * Program generation defaults - finalized after evidence-alignment interview 2026-03-27
 * These values are used for profile-driven draft program generation when users have
 * not yet filled in all profile fields.
 */

import type { ExperienceLevel, TrainingGoal } from '@/types';

// =============================================================================
// EXPERIENCE LEVEL DEFAULTS
// =============================================================================

export const EXPERIENCE_LEVEL_DEFAULTS: Record<ExperienceLevel, {
  compoundRatio: number;
  progressionAmount: { upper: number; lower: number };
  defaultSets: { compound: number; isolation: number };
}> = {
  beginner: {
    compoundRatio: 0.8, // 80%+ compound exercises
    progressionAmount: { upper: 2.5, lower: 5 },
    defaultSets: { compound: 4, isolation: 3 },
  },
  intermediate: {
    compoundRatio: 0.65, // 60-70% compound exercises
    progressionAmount: { upper: 2.5, lower: 5 },
    defaultSets: { compound: 4, isolation: 3 },
  },
  advanced: {
    compoundRatio: 0.55, // 50-60% compound exercises (more isolation flexibility)
    progressionAmount: { upper: 1.25, lower: 2.5 },
    defaultSets: { compound: 5, isolation: 3 },
  },
};

// =============================================================================
// TRAINING GOAL DEFAULTS
// =============================================================================

export const TRAINING_GOAL_DEFAULTS: Record<TrainingGoal | 'default', {
  repRangeMin: number;
  repRangeMax: number;
  setsMultiplier: number;
  restTimeByMuscle: Record<string, number>; // seconds
}> = {
  // Strength: 3-5 reps, longer rest
  strength: {
    repRangeMin: 3,
    repRangeMax: 5,
    setsMultiplier: 1.25, // More sets for strength (5 compound)
    restTimeByMuscle: {
      // Slow recovery muscles need 3 min rest for strength
      chest: 180,
      lats: 180,
      traps: 180,
      shoulders: 180,
      quads: 180,
      hamstrings: 180,
      glutes: 180,
      // Faster recovery still gets 2 min for heavy compounds
      biceps: 120,
      triceps: 120,
      forearms: 120,
      calves: 120,
      abs: 120,
    },
  },
  // Hypertrophy: 8-15 reps
  hypertrophy: {
    repRangeMin: 8,
    repRangeMax: 15,
    setsMultiplier: 1.0,
    restTimeByMuscle: {
      // Hypertrophy expects 2-3 min depending on muscle group
      chest: 180,
      lats: 180,
      traps: 180,
      shoulders: 180,
      quads: 180,
      hamstrings: 180,
      glutes: 180,
      biceps: 120,
      triceps: 120,
      forearms: 120,
      calves: 120,
      abs: 120,
    },
  },
  // Improve Overall Health: 5-15 reps (blended approach)
  improve_overall_health: {
    repRangeMin: 5,
    repRangeMax: 15,
    setsMultiplier: 1.0,
    restTimeByMuscle: {
      chest: 120,
      lats: 120,
      traps: 120,
      shoulders: 120,
      quads: 120,
      hamstrings: 120,
      glutes: 120,
      biceps: 90,
      triceps: 90,
      forearms: 90,
      calves: 90,
      abs: 90,
    },
  },
  // Default fallback
  default: {
    repRangeMin: 8,
    repRangeMax: 12,
    setsMultiplier: 1.0,
    restTimeByMuscle: {
      chest: 180,
      lats: 180,
      traps: 180,
      shoulders: 180,
      quads: 180,
      hamstrings: 180,
      glutes: 180,
      biceps: 120,
      triceps: 120,
      forearms: 120,
      calves: 120,
      abs: 120,
    },
  },
};

// =============================================================================
// PROGRAM SPLITS BY TRAINING FREQUENCY
// =============================================================================

export const PROGRAM_SPLIT_DEFAULTS: Record<string, {
  splitName: string;
  daysPerWeek: number;
  defaultExercisesPerDay: number;
}> = {
  '1': { splitName: 'Full Body', daysPerWeek: 1, defaultExercisesPerDay: 6 },
  '2': { splitName: 'Full Body', daysPerWeek: 2, defaultExercisesPerDay: 6 },
  '3': { splitName: 'Full Body', daysPerWeek: 3, defaultExercisesPerDay: 5 },
  '4': { splitName: 'Upper/Lower', daysPerWeek: 4, defaultExercisesPerDay: 5 },
  '5': { splitName: 'Upper/Lower + PPL', daysPerWeek: 5, defaultExercisesPerDay: 5 },
  '6': { splitName: 'Push/Pull/Legs (2x)', daysPerWeek: 6, defaultExercisesPerDay: 5 },
  '7': { splitName: 'PPL + Weak Point', daysPerWeek: 7, defaultExercisesPerDay: 4 },
};

// =============================================================================
// SESSION DURATION DEFAULTS
// =============================================================================

export const SESSION_DURATION_DEFAULTS: Record<string, {
  exercisesPerSession: number;
  maxExercisesAdvanced: number;
}> = {
  'short': { exercisesPerSession: 4, maxExercisesAdvanced: 6 }, // <= 45 min
  'medium': { exercisesPerSession: 5, maxExercisesAdvanced: 7 }, // 45-75 min
  'long': { exercisesPerSession: 6, maxExercisesAdvanced: 10 }, // > 75 min
};

// =============================================================================
// PROGRESS DEFAULTS
// =============================================================================

export const PROGRESSION_THRESHOLD_DEFAULT = 2; // Sessions at top of rep range before weight increase

// =============================================================================
// STARTING WEIGHT DEFAULTS (Conservative Bodyweight-Based)
// =============================================================================

export const STARTING_WEIGHT_BY_EXERCISE_TYPE: Record<string, {
  method: 'bodyweight-percent' | 'fixed';
  percentage?: number; // 0.5 = 50%
  fixed?: number;
}> = {
  // Squat patterns
  'squat': { method: 'bodyweight-percent', percentage: 0.5 },
  'leg press': { method: 'bodyweight-percent', percentage: 0.6 },
  'leg extension': { method: 'fixed', fixed: 30 },
  'leg curl': { method: 'fixed', fixed: 20 },
  'calf press': { method: 'fixed', fixed: 40 },
  'calf raise': { method: 'fixed', fixed: 20 },

  // Hinge patterns
  'deadlift': { method: 'bodyweight-percent', percentage: 0.6 },
  'rdl': { method: 'bodyweight-percent', percentage: 0.4 },
  'hip thrust': { method: 'bodyweight-percent', percentage: 0.5 },

  // Push patterns
  'bench press': { method: 'bodyweight-percent', percentage: 0.4 },
  'chest press': { method: 'bodyweight-percent', percentage: 0.35 },
  'overhead press': { method: 'bodyweight-percent', percentage: 0.35 },
  'shoulder press': { method: 'bodyweight-percent', percentage: 0.35 },
  'dip': { method: 'bodyweight-percent', percentage: 0.3 },
  'push-up': { method: 'bodyweight-percent', percentage: 0 },

  // Pull patterns
  'row': { method: 'bodyweight-percent', percentage: 0.35 },
  'barbell row': { method: 'bodyweight-percent', percentage: 0.4 },
  'pulldown': { method: 'bodyweight-percent', percentage: 0.35 },
  'pull-up': { method: 'bodyweight-percent', percentage: 0 },
  'lat pulldown': { method: 'bodyweight-percent', percentage: 0.35 },
  'face pull': { method: 'fixed', fixed: 15 },
  'shrug': { method: 'fixed', fixed: 30 },
  'curl': { method: 'fixed', fixed: 10 }, // Dumbbell
  'hammer curl': { method: 'fixed', fixed: 10 },
  'tricep': { method: 'fixed', fixed: 15 },
  'triceps pushdown': { method: 'fixed', fixed: 20 },
  'extension': { method: 'fixed', fixed: 10 },

  // Isolation exercises
  'fly': { method: 'fixed', fixed: 10 },
  'lateral raise': { method: 'fixed', fixed: 5 },
  'rear delt fly': { method: 'fixed', fixed: 5 },
  'crunch': { method: 'bodyweight-percent', percentage: 0 },
  'leg raise': { method: 'bodyweight-percent', percentage: 0 },
  'cable crunch': { method: 'fixed', fixed: 20 },
};

// =============================================================================
// MAIN EXPORT
// =============================================================================

export const PROGRAM_GENERATION_DEFAULTS = {
  experienceLevel: 'intermediate' as ExperienceLevel,
  trainingDaysPerWeek: 3,
  sessionDurationMinutes: 75,
  repRangeMin: 8,
  repRangeMax: 12,
  progressionThreshold: PROGRESSION_THRESHOLD_DEFAULT,
  defaultRestTimeSeconds: 120,
} as const;

/**
 * Gets the appropriate configuration for program generation based on profile inputs
 */
export const getGenerationConfig = (params: {
  experienceLevel: ExperienceLevel | null;
  trainingDaysPerWeek: number | null;
  sessionDurationMinutes: number | null;
  trainingGoal: TrainingGoal | null;
}) => {
  const expLevel = params.experienceLevel ?? PROGRAM_GENERATION_DEFAULTS.experienceLevel;
  const days = params.trainingDaysPerWeek ?? PROGRAM_GENERATION_DEFAULTS.trainingDaysPerWeek;
  const duration = params.sessionDurationMinutes ?? PROGRAM_GENERATION_DEFAULTS.sessionDurationMinutes;
  const goal = params.trainingGoal ?? 'default';

  const expConfig = EXPERIENCE_LEVEL_DEFAULTS[expLevel];
  const goalConfig = TRAINING_GOAL_DEFAULTS[goal] ?? TRAINING_GOAL_DEFAULTS.default;
  const splitConfig = PROGRAM_SPLIT_DEFAULTS[Math.min(days, 7).toString()] ?? PROGRAM_SPLIT_DEFAULTS['3'];

  let durationConfig;
  if (duration <= 45) {
    durationConfig = SESSION_DURATION_DEFAULTS.short;
  } else if (duration <= 75) {
    durationConfig = SESSION_DURATION_DEFAULTS.medium;
  } else {
    durationConfig = SESSION_DURATION_DEFAULTS.long;
  }

  return {
    experienceLevel: expLevel,
    trainingDaysPerWeek: days,
    sessionDurationMinutes: duration,
    trainingGoal: goal,
    repRangeMin: goalConfig.repRangeMin,
    repRangeMax: goalConfig.repRangeMax,
    progressionThreshold: PROGRESSION_THRESHOLD_DEFAULT,
    compoundRatio: expConfig.compoundRatio,
    sets: {
      compound: Math.round(expConfig.defaultSets.compound * goalConfig.setsMultiplier),
      isolation: expConfig.defaultSets.isolation,
    },
    exercisesPerSession: durationConfig.exercisesPerSession,
    maxExercisesAdvanced: durationConfig.maxExercisesAdvanced,
    restTimeByMuscle: goalConfig.restTimeByMuscle,
    split: splitConfig.splitName,
    progressionAmount: expConfig.progressionAmount,
  };
};

export type GenerationConfig = ReturnType<typeof getGenerationConfig>;