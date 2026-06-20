import {
  MAX_EXERCISE_NAME_LENGTH,
  MAX_EXERCISES_PER_DAY,
  MAX_PROGRAM_NAME_LENGTH,
  MAX_WORKOUT_DAYS,
  MIN_WORKOUT_DAYS,
} from '@/constants';
import type { Program, ProgramExercise, ValidationResult, WorkoutDay } from '@/types';

/**
 * Wraps a list of error messages into a ValidationResult.
 *
 * @param {string[]} errors - Collected validation error messages.
 * @returns {ValidationResult} Result whose `isValid` is true only when `errors` is empty.
 */
function toValidationResult(errors: string[]): ValidationResult {
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Builds a stable, order-independent key identifying an exercise's variant.
 *
 * Empty/undefined/null variant fields are ignored and remaining entries are
 * sorted, so two exercises with the same variant always produce the same key.
 *
 * @param {ProgramExercise} exercise - Program exercise whose variant should be keyed.
 * @returns {string} `'default'` when no variant is set, otherwise a stable JSON key.
 */
function getStableVariantKey(exercise: ProgramExercise): string {
  const variant = exercise.variant;
  if (!variant || Object.keys(variant).length === 0) {
    return 'default';
  }

  const variantEntries = Object.entries(variant)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify(variantEntries);
}

/**
 * Validates a program name for presence and maximum length.
 *
 * @param {string} name - Raw program name to validate.
 * @returns {ValidationResult} Result describing any name validation errors.
 */
export function validateProgramName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name || !name.trim()) {
    errors.push('Program name is required');
  } else if (name.trim().length > MAX_PROGRAM_NAME_LENGTH) {
    errors.push(`Program name must be ${MAX_PROGRAM_NAME_LENGTH} characters or less`);
  }

  return toValidationResult(errors);
}

/**
 * Validates that a workout day count is a number within the allowed range.
 *
 * @param {number} days - Number of workout days in the program.
 * @returns {ValidationResult} Result describing any day-count validation errors.
 */
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

/**
 * Validates workout day structure and duplicate exercise/variant rules.
 *
 * @param {WorkoutDay} day - Workout day containing day number and exercise list.
 * @returns {ValidationResult} Result containing all day-level validation errors.
 */
export function validateWorkoutDay(day: WorkoutDay): ValidationResult {
  const errors: string[] = [];

  if (!day.exercises || day.exercises.length === 0) {
    errors.push(`Day ${day.dayNumber} must have at least one exercise`);
  } else if (day.exercises.length > MAX_EXERCISES_PER_DAY) {
    errors.push(`Day ${day.dayNumber} cannot have more than ${MAX_EXERCISES_PER_DAY} exercises`);
  }

  if (Array.isArray(day.exercises)) {
    const seenExerciseVariants = new Set<string>();

    for (const exercise of day.exercises) {
      const nameKey = (exercise.name ?? '').trim().toLowerCase();
      const duplicateKey = `${nameKey}:${getStableVariantKey(exercise)}`;

      if (!nameKey) {
        continue;
      }

      if (seenExerciseVariants.has(duplicateKey)) {
        errors.push(`Duplicate exercise "${exercise.name}" with the same variant on Day ${day.dayNumber}`);
        continue;
      }

      seenExerciseVariants.add(duplicateKey);
    }
  }

  return toValidationResult(errors);
}

/**
 * Validates an individual program exercise configuration.
 *
 * @param {ProgramExercise} exercise - Program exercise containing target values and progression metadata.
 * @returns {ValidationResult} Result containing all exercise-level validation errors.
 */
export function validateExercise(exercise: ProgramExercise): ValidationResult {
  const errors: string[] = [];

  if (!exercise.name || !exercise.name.trim()) {
    errors.push('Exercise name is required');
  } else if (exercise.name.trim().length > MAX_EXERCISE_NAME_LENGTH) {
    errors.push(`Exercise name must be ${MAX_EXERCISE_NAME_LENGTH} characters or less`);
  }

  if (exercise.weight && exercise.weight.trim()) {
    const stripped = exercise.weight.replace(/[^0-9.\-]/g, '');
    const weightNum = parseFloat(stripped);
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

  if (!exercise.reps || !exercise.reps.trim()) {
    errors.push('Reps must be greater than 0');
  } else {
    const repsNum = parseInt(exercise.reps, 10);
    if (isNaN(repsNum)) {
      errors.push('Reps must be a valid number');
    } else if (repsNum <= 0) {
      errors.push('Reps must be greater than 0');
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

  if (exercise.progression && exercise.progression.trim()) {
    const stripped = exercise.progression.replace(/[^0-9.\-]/g, '');
    const progressionNum = parseFloat(stripped);
    if (isNaN(progressionNum)) {
      errors.push('Progression must be a valid number');
    } else if (progressionNum <= 0) {
      errors.push('Progression must be greater than 0 or left empty');
    }
  }

  return toValidationResult(errors);
}

/**
 * Validates a complete (partial) program, aggregating name, day-count, day, and
 * exercise errors. Exercise errors are prefixed with their day number.
 *
 * @param {Partial<Program>} program - Program to validate; may be incomplete.
 * @returns {ValidationResult} Result containing all aggregated validation errors.
 */
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

/**
 * Parses a weight string into a numeric value and unit.
 *
 * Accepts an optional `kg`/`lb`/`lbs` suffix; `lb` is normalised to `lbs`.
 * An empty string is treated as valid with a zero value.
 *
 * @param {string} weight - Raw weight string such as `"60 kg"` or `"135 lbs"`.
 * @returns {{ value: number; unit: string; isValid: boolean }} Parsed value, normalised unit, and validity flag.
 */
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

/**
 * Formats a numeric weight and unit into a display string.
 *
 * @param {number} value - Weight value; `0` produces an empty string.
 * @param {string} [unit='kg'] - Unit label to append.
 * @returns {string} Formatted string like `"60 kg"`, or `""` when value is `0`.
 */
export function formatWeight(value: number, unit: string = 'kg'): string {
  if (value === 0) {
    return '';
  }

  return `${value} ${unit}`;
}

/**
 * Parses a reps string into a positive integer value.
 *
 * An empty string is treated as valid with a zero value. Non-integer or
 * non-positive inputs are rejected as invalid.
 *
 * @param {string} reps - Raw reps string.
 * @returns {{ value: number; isValid: boolean }} Parsed value and validity flag.
 */
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

/**
 * Formats a numeric reps value as a display string.
 *
 * @param {number} value - Reps value to format.
 * @returns {string} The value rendered as a string.
 */
export function formatReps(value: number): string {
  return value.toString();
}

/**
 * Validates that an input parses to a positive decimal number.
 *
 * An empty string is treated as valid with a `null` value (optional field).
 *
 * @param {string} input - Raw input string to validate.
 * @returns {{ value: number | null; isValid: boolean; error: string | null }} Parsed value, validity flag, and error message when invalid.
 */
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

/**
 * Validates that an input parses to a positive whole number.
 *
 * An empty string is treated as valid with a `null` value (optional field).
 *
 * @param {string} input - Raw input string to validate.
 * @returns {{ value: number | null; isValid: boolean; error: string | null }} Parsed value, validity flag, and error message when invalid.
 */
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
