/**
 * Double Progression Service
 * 
 * Manages automatic weight/rep progression based on rep range targets.
 * 
 * How it works:
 * - User works within a rep range (e.g., 3-5 reps for strength)
 * - When ALL sets hit the top of the range, increment timesRepsHitInARow
 * - When timesRepsHitInARow >= progressionThreshold, increase weight and reset reps to range bottom
 * - If ANY set fails to hit top of range, reset timesRepsHitInARow to 0
 */

import type { ExperienceLevel, ProgramExercise } from '@/types';
import { EXPERIENCE_LEVEL_DEFAULTS } from '@/constants/program-generation-defaults';

/**
 * Progression amount by experience level and body part
 */
const getProgressionAmount = (
  experienceLevel: ExperienceLevel,
  isLowerBody: boolean
): number => {
  const defaults = EXPERIENCE_LEVEL_DEFAULTS[experienceLevel];
  return isLowerBody 
    ? defaults.progressionAmount.lower 
    : defaults.progressionAmount.upper;
};

/**
 * Determines if an exercise is primarily lower body based on muscle groups
 */
const isLowerBodyExercise = (muscleGroups: string[]): boolean => {
  const lowerBodyMuscles = ['quads', 'hamstrings', 'glutes', 'calves', 'hamstrings'];
  return muscleGroups.some(mg => lowerBodyMuscles.includes(mg));
};

/**
 * Updates the timesRepsHitInARow counter based on logged reps
 * 
 * @param exercise - The program exercise with progression fields
 * @param loggedRepsPerSet - Array of reps logged for each set
 * @returns Updated exercise with potentially incremented timesRepsHitInARow
 */
export const updateProgressionStreak = (
  exercise: ProgramExercise,
  loggedRepsPerSet: number[]
): ProgramExercise => {
  const repRangeMax = exercise.repRangeMax ?? 12; // Default to hypertrophy range
  const allSetsHitTop = loggedRepsPerSet.every(reps => reps >= repRangeMax);
  
  const currentStreak = exercise.timesRepsHitInARow ?? 0;
  
  return {
    ...exercise,
    timesRepsHitInARow: allSetsHitTop ? currentStreak + 1 : 0,
  };
};

/**
 * Applies progression if threshold is met
 * 
 * @param exercise - The program exercise with progression fields
 * @returns Updated exercise with potentially increased weight and reset reps
 */
export const applyProgression = (
  exercise: ProgramExercise
): ProgramExercise => {
  const timesRepsHitInARow = exercise.timesRepsHitInARow ?? 0;
  const progressionThreshold = exercise.progressionThreshold ?? 2;
  const repRangeMin = exercise.repRangeMin ?? 8;
  const repRangeMax = exercise.repRangeMax ?? 12;
  
  // Determine experience level (default to intermediate)
  const experienceLevel: ExperienceLevel = (exercise as unknown as { experienceLevel?: ExperienceLevel }).experienceLevel ?? 'intermediate';
  const progressionAmt = getProgressionAmount(experienceLevel, isLowerBodyExercise(exercise.muscle_groups_worked ?? []));
  
  // Check if threshold is met
  if (timesRepsHitInARow >= progressionThreshold) {
    const currentWeight = parseFloat(exercise.weight) || 0;
    const currentProgression = parseFloat(exercise.progression) || progressionAmt;
    
    return {
      ...exercise,
      weight: String(currentWeight + currentProgression),
      reps: String(repRangeMin), // Reset to bottom of range
      progression: String(currentProgression),
      timesRepsHitInARow: 0, // Reset streak
    };
  }
  
  return exercise;
};

/**
 * Calculates progression preview - shows what would happen if user hits threshold
 * 
 * @param exercise - The program exercise with progression fields
 * @returns Object with preview information
 */
export const getProgressionPreview = (
  exercise: ProgramExercise
): {
  currentStreak: number;
  threshold: number;
  sessionsUntilProgression: number;
  projectedWeightIncrease: number;
  projectedReps: number;
} => {
  const currentStreak = exercise.timesRepsHitInARow ?? 0;
  const threshold = exercise.progressionThreshold ?? 2;
  const repRangeMin = exercise.repRangeMin ?? 8;
  
  const experienceLevel: ExperienceLevel = (exercise as unknown as { experienceLevel?: ExperienceLevel }).experienceLevel ?? 'intermediate';
  const projectedWeightIncrease = getProgressionAmount(experienceLevel, isLowerBodyExercise(exercise.muscle_groups_worked ?? []));
  
  return {
    currentStreak,
    threshold,
    sessionsUntilProgression: Math.max(0, threshold - currentStreak),
    projectedWeightIncrease,
    projectedReps: repRangeMin,
  };
};

/**
 * Initializes default progression fields for a new exercise
 * 
 * @param base - Base exercise to add progression fields to
 * @param trainingGoal - Optional training goal for rep range defaults
 * @returns Exercise with progression fields initialized
 */
export const initializeProgressionFields = (
  base: ProgramExercise,
  trainingGoal?: string
): ProgramExercise => {
  let repRangeMin: number;
  let repRangeMax: number;
  
  switch (trainingGoal) {
    case 'strength':
      repRangeMin = 3;
      repRangeMax = 5;
      break;
    case 'hypertrophy':
      repRangeMin = 8;
      repRangeMax = 15;
      break;
    case 'improve_overall_health':
      repRangeMin = 5;
      repRangeMax = 15;
      break;
    default:
      repRangeMin = 8;
      repRangeMax = 12;
  }
  
  return {
    ...base,
    repRangeMin,
    repRangeMax,
    progressionThreshold: 2,
    timesRepsHitInARow: 0,
  };
};

/**
 * Validates progression configuration
 */
export const validateProgressionConfig = (exercise: ProgramExercise): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  const repRangeMin = exercise.repRangeMin;
  const repRangeMax = exercise.repRangeMax;
  const threshold = exercise.progressionThreshold;
  
  if (repRangeMin !== undefined && repRangeMax !== undefined) {
    if (repRangeMin < 1) {
      errors.push('repRangeMin must be at least 1');
    }
    if (repRangeMax <= repRangeMin) {
      errors.push('repRangeMax must be greater than repRangeMin');
    }
    if (repRangeMax > 100) {
      errors.push('repRangeMax seems unreasonably high');
    }
  }
  
  if (threshold !== undefined) {
    if (threshold < 1) {
      errors.push('progressionThreshold must be at least 1');
    }
    if (threshold > 20) {
      errors.push('progressionThreshold seems unreasonably high (max recommended: 10)');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};