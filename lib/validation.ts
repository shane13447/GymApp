import {
  MAX_EXERCISE_NAME_LENGTH,
  MAX_EXERCISES_PER_DAY,
  MAX_PROGRAM_NAME_LENGTH,
  MAX_WORKOUT_DAYS,
  MIN_WORKOUT_DAYS,
} from '@/constants';
import type { Program, ProgramExercise, ValidationResult, WorkoutDay } from '@/types';

function toValidationResult(errors: string[]): ValidationResult {
  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateProgramName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name || !name.trim()) {
    errors.push('Program name is required');
  } else if (name.trim().length > MAX_PROGRAM_NAME_LENGTH) {
    errors.push(`Program name must be ${MAX_PROGRAM_NAME_LENGTH} characters or less`);
  }

  return toValidationResult(errors);
}

export function validateNumberOfDays(days: number): ValidationResult {
  const errors: string[] = [];

  if (isNaN(days)) {
    errors.push('Number of days must be a valid number');
  } else if (days < MIN_WORKOUT_DAYS) {
    errors.push(`Must have at least ${MIN_WORKOUT_DAYS} workout day`);
  } else if (days > MAX_WORKOUT_DAYS) {
    errors.push(`Cannot have more than ${MAX_WORKOUT_DAYS} workout days`);
  }

  return toValidationResult(errors);
}

export function validateWorkoutDay(day: WorkoutDay): ValidationResult {
  const errors: string[] = [];

  if (!day.exercises || day.exercises.length === 0) {
    errors.push(`Day ${day.dayNumber} must have at least one exercise`);
  } else if (day.exercises.length > MAX_EXERCISES_PER_DAY) {
    errors.push(`Day ${day.dayNumber} cannot have more than ${MAX_EXERCISES_PER_DAY} exercises`);
  }

  return toValidationResult(errors);
}

export function validateExercise(exercise: ProgramExercise): ValidationResult {
  const errors: string[] = [];

  if (!exercise.name || !exercise.name.trim()) {
    errors.push('Exercise name is required');
  } else if (exercise.name.trim().length > MAX_EXERCISE_NAME_LENGTH) {
    errors.push(`Exercise name must be ${MAX_EXERCISE_NAME_LENGTH} characters or less`);
  }

  if (exercise.weight && exercise.weight.trim()) {
    const weightNum = parseFloat(exercise.weight.replace(/[^0-9.]/g, ''));
    if (isNaN(weightNum) && exercise.weight.trim() !== '') {
      errors.push('Weight must be a valid number');
    } else if (weightNum < 0) {
      errors.push('Weight cannot be negative');
    }
  }

  if (exercise.sets && exercise.sets.trim()) {
    const setsNum = parseInt(exercise.sets, 10);
    if (isNaN(setsNum)) {
      errors.push('Sets must be a valid number');
    } else if (setsNum < 1) {
      errors.push('Must have at least 1 set');
    } else if (setsNum > 20) {
      errors.push('Cannot have more than 20 sets');
    }
  }

  if (exercise.restTime && exercise.restTime.trim()) {
    const restNum = parseInt(exercise.restTime, 10);
    if (isNaN(restNum)) {
      errors.push('Rest time must be a valid number');
    } else if (restNum < 0) {
      errors.push('Rest time cannot be negative');
    } else if (restNum > 600) {
      errors.push('Rest time cannot exceed 10 minutes (600 seconds)');
    }
  }

  return toValidationResult(errors);
}

export function validateProgram(program: Partial<Program>): ValidationResult {
  const errors: string[] = [];

  const nameValidation = validateProgramName(program.name || '');
  errors.push(...nameValidation.errors);

  if (!program.workoutDays || program.workoutDays.length === 0) {
    errors.push('Program must have at least one workout day');
    return toValidationResult(errors);
  }

  const daysValidation = validateNumberOfDays(program.workoutDays.length);
  errors.push(...daysValidation.errors);

  for (const day of program.workoutDays) {
    const dayValidation = validateWorkoutDay(day);
    errors.push(...dayValidation.errors);

    for (const exercise of day.exercises) {
      const exerciseValidation = validateExercise(exercise);
      errors.push(...exerciseValidation.errors.map((error) => `Day ${day.dayNumber}: ${error}`));
    }
  }

  return toValidationResult(errors);
}

export function parseWeight(weight: string): { value: number; unit: string; isValid: boolean } {
  if (!weight || !weight.trim()) {
    return { value: 0, unit: '', isValid: true };
  }

  const match = weight.trim().match(/^(\d+\.?\d*)\s*(kg|lbs?)?$/i);
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
}

export function formatWeight(value: number, unit: string = 'kg'): string {
  if (value === 0) {
    return '';
  }

  return `${value} ${unit}`;
}

export function parseReps(reps: string): { value: number; isValid: boolean } {
  if (!reps || !reps.trim()) {
    return { value: 0, isValid: true };
  }

  const trimmed = reps.trim();
  const num = parseInt(trimmed, 10);

  if (!isNaN(num) && num > 0 && String(num) === trimmed) {
    return { value: num, isValid: true };
  }

  return { value: 0, isValid: false };
}

export function formatReps(value: number): string {
  return value.toString();
}

export function validatePositiveDecimal(
  input: string
): { value: number | null; isValid: boolean; error: string | null } {
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
}

export function validatePositiveInteger(
  input: string
): { value: number | null; isValid: boolean; error: string | null } {
  if (!input || !input.trim()) {
    return { value: null, isValid: true, error: null };
  }

  const trimmed = input.trim();

  if (!/^\d+$/.test(trimmed)) {
    return { value: null, isValid: false, error: 'Must be a valid whole number' };
  }

  const num = parseInt(trimmed, 10);

  if (num <= 0) {
    return { value: null, isValid: false, error: 'Must be a positive number' };
  }

  return { value: num, isValid: true, error: null };
}
