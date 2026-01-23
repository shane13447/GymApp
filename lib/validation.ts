/**
 * Validation utilities for the Gym App
 */

import {
  MAX_EXERCISE_NAME_LENGTH,
  MAX_EXERCISES_PER_DAY,
  MAX_PROGRAM_NAME_LENGTH,
  MAX_WORKOUT_DAYS,
  MIN_WORKOUT_DAYS,
} from '@/constants';
import type { Program, ProgramExercise, ValidationResult, WorkoutDay } from '@/types';

/**
 * Validate a program name
 */
export const validateProgramName = (name: string): ValidationResult => {
  const errors: string[] = [];

  if (!name || !name.trim()) {
    errors.push('Program name is required');
  } else if (name.trim().length > MAX_PROGRAM_NAME_LENGTH) {
    errors.push(`Program name must be ${MAX_PROGRAM_NAME_LENGTH} characters or less`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate number of workout days
 */
export const validateNumberOfDays = (days: number): ValidationResult => {
  const errors: string[] = [];

  if (isNaN(days)) {
    errors.push('Number of days must be a valid number');
  } else if (days < MIN_WORKOUT_DAYS) {
    errors.push(`Must have at least ${MIN_WORKOUT_DAYS} workout day`);
  } else if (days > MAX_WORKOUT_DAYS) {
    errors.push(`Cannot have more than ${MAX_WORKOUT_DAYS} workout days`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate a workout day
 */
export const validateWorkoutDay = (day: WorkoutDay): ValidationResult => {
  const errors: string[] = [];

  if (!day.exercises || day.exercises.length === 0) {
    errors.push(`Day ${day.dayNumber} must have at least one exercise`);
  } else if (day.exercises.length > MAX_EXERCISES_PER_DAY) {
    errors.push(`Day ${day.dayNumber} cannot have more than ${MAX_EXERCISES_PER_DAY} exercises`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate an exercise
 */
export const validateExercise = (exercise: ProgramExercise): ValidationResult => {
  const errors: string[] = [];

  if (!exercise.name || !exercise.name.trim()) {
    errors.push('Exercise name is required');
  } else if (exercise.name.trim().length > MAX_EXERCISE_NAME_LENGTH) {
    errors.push(`Exercise name must be ${MAX_EXERCISE_NAME_LENGTH} characters or less`);
  }

  // Validate weight (should be a non-negative number)
  if (typeof exercise.weight !== 'number' || isNaN(exercise.weight)) {
    errors.push('Weight must be a valid number');
  } else if (exercise.weight < 0) {
    errors.push('Weight cannot be negative');
  }

  // Validate reps (should be a positive integer)
  if (typeof exercise.reps !== 'number' || isNaN(exercise.reps)) {
    errors.push('Reps must be a valid number');
  } else if (exercise.reps < 1) {
    errors.push('Must have at least 1 rep');
  } else if (!Number.isInteger(exercise.reps)) {
    errors.push('Reps must be a whole number');
  }

  // Validate sets (should be a positive integer)
  if (typeof exercise.sets !== 'number' || isNaN(exercise.sets)) {
    errors.push('Sets must be a valid number');
  } else if (exercise.sets < 1) {
    errors.push('Must have at least 1 set');
  } else if (exercise.sets > 20) {
    errors.push('Cannot have more than 20 sets');
  } else if (!Number.isInteger(exercise.sets)) {
    errors.push('Sets must be a whole number');
  }

  // Validate rest time (should be a non-negative integer in seconds)
  if (typeof exercise.restTime !== 'number' || isNaN(exercise.restTime)) {
    errors.push('Rest time must be a valid number');
  } else if (exercise.restTime < 0) {
    errors.push('Rest time cannot be negative');
  } else if (exercise.restTime > 600) {
    errors.push('Rest time cannot exceed 10 minutes (600 seconds)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate an entire program
 */
export const validateProgram = (program: Partial<Program>): ValidationResult => {
  const errors: string[] = [];

  // Validate name
  const nameValidation = validateProgramName(program.name || '');
  errors.push(...nameValidation.errors);

  // Validate workout days
  if (!program.workoutDays || program.workoutDays.length === 0) {
    errors.push('Program must have at least one workout day');
  } else {
    const daysValidation = validateNumberOfDays(program.workoutDays.length);
    errors.push(...daysValidation.errors);

    // Validate each day
    for (const day of program.workoutDays) {
      const dayValidation = validateWorkoutDay(day);
      errors.push(...dayValidation.errors);

      // Validate each exercise
      for (const exercise of day.exercises) {
        const exerciseValidation = validateExercise(exercise);
        errors.push(...exerciseValidation.errors.map((e) => `Day ${day.dayNumber}: ${e}`));
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Parse and validate weight input
 * Returns the numeric value and unit
 */
export const parseWeight = (
  weight: string
): { value: number; unit: string; isValid: boolean } => {
  if (!weight || !weight.trim()) {
    return { value: 0, unit: '', isValid: true };
  }

  const match = weight.trim().match(/^([\d.]+)\s*(kg|lbs?|lb)?$/i);
  if (!match) {
    return { value: 0, unit: '', isValid: false };
  }

  const value = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase() || '';

  return {
    value: isNaN(value) ? 0 : value,
    unit: unit === 'lb' ? 'lbs' : unit,
    isValid: !isNaN(value) && value >= 0,
  };
};

/**
 * Format weight with unit
 */
export const formatWeight = (value: number, unit: string = 'kg'): string => {
  if (value === 0) return '';
  return `${value} ${unit}`;
};

/**
 * Parse reps input (must be a whole number)
 */
export const parseReps = (reps: string): { value: number; isValid: boolean } => {
  if (!reps || !reps.trim()) {
    return { value: 0, isValid: true };
  }

  const trimmed = reps.trim();

  // Check for single whole number only
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num > 0 && String(num) === trimmed) {
    return { value: num, isValid: true };
  }

  return { value: 0, isValid: false };
};

/**
 * Format reps for display
 */
export const formatReps = (value: number): string => {
  return value.toString();
};

// =============================================================================
// PROFILE VALIDATION
// =============================================================================

/**
 * Validate a positive decimal number (for weight fields)
 * Returns parsed value and validation state
 */
export const validatePositiveDecimal = (
  input: string
): { value: number | null; isValid: boolean; error: string | null } => {
  // Empty is valid (field is optional)
  if (!input || !input.trim()) {
    return { value: null, isValid: true, error: null };
  }

  const trimmed = input.trim();
  const num = parseFloat(trimmed);

  if (isNaN(num)) {
    return { value: null, isValid: false, error: 'Must be a valid number' };
  }

  if (num <= 0) {
    return { value: null, isValid: false, error: 'Must be a positive number' };
  }

  return { value: num, isValid: true, error: null };
};

/**
 * Validate a positive integer (for target sets)
 * Returns parsed value and validation state
 */
export const validatePositiveInteger = (
  input: string
): { value: number | null; isValid: boolean; error: string | null } => {
  // Empty is valid (field is optional)
  if (!input || !input.trim()) {
    return { value: null, isValid: true, error: null };
  }

  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);

  if (isNaN(num)) {
    return { value: null, isValid: false, error: 'Must be a valid number' };
  }

  if (num <= 0) {
    return { value: null, isValid: false, error: 'Must be a positive number' };
  }

  if (!Number.isInteger(parseFloat(trimmed))) {
    return { value: null, isValid: false, error: 'Must be a whole number' };
  }

  return { value: num, isValid: true, error: null };
};
