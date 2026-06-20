/**
 * Database serialization helpers
 *
 * Centralizes string↔number conversions for exercise fields,
 * variant JSON parsing, and array field handling.
 * Extracted from database.ts to eliminate 6 duplication sites
 * and enforce consistent NaN/default handling.
 */

import type { ExerciseVariant, ProgramExercise } from '@/types';
import type { SQLiteBindValue } from 'expo-sqlite';
import { safeParseFloat, safeParseInt } from '@/lib/safe-convert';

/**
 * Serialize an exercise variant to its JSON string form for storage.
 *
 * @param {ExerciseVariant | null} [variant] - The variant to serialize.
 * @returns {string} The JSON string, or an empty string when no variant is provided.
 */
export const serializeVariant = (variant?: ExerciseVariant | null): string =>
  variant ? JSON.stringify(variant) : '';

/**
 * Parse a JSON-encoded string array column, tolerating missing/invalid data by
 * logging a fallback warning and returning an empty array. Non-string entries
 * are filtered out.
 *
 * @param {string | null | undefined} raw - The raw stored JSON string.
 * @param {string} fieldName - The field name, used in fallback log context.
 * @param {Record<string, unknown>} context - Extra context merged into fallback logs.
 * @returns {string[]} The parsed string array, or an empty array on failure.
 */
export const parseStringArrayField = (
  raw: string | null | undefined,
  fieldName: string,
  context: Record<string, unknown>
): string[] => {
  if (!raw || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn('[database][json_parse_fallback]', { field: fieldName, reason: 'not_array', ...context });
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string');
  } catch (error) {
    console.warn('[database][json_parse_fallback]', {
      field: fieldName,
      reason: 'parse_error',
      detail: error instanceof Error ? error.message : String(error),
      ...context,
    });
    return [];
  }
};

/**
 * Parse a JSON-encoded number array column, tolerating missing/invalid data by
 * logging a fallback warning and returning an empty array. Non-finite and
 * non-number entries are filtered out.
 *
 * @param {string | null | undefined} raw - The raw stored JSON string.
 * @param {string} fieldName - The field name, used in fallback log context.
 * @param {Record<string, unknown>} context - Extra context merged into fallback logs.
 * @returns {number[]} The parsed finite-number array, or an empty array on failure.
 */
export const parseNumberArrayField = (
  raw: string | null | undefined,
  fieldName: string,
  context: Record<string, unknown>
): number[] => {
  if (!raw || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn('[database][json_parse_fallback]', { field: fieldName, reason: 'not_array', ...context });
      return [];
    }

    return parsed.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  } catch (error) {
    console.warn('[database][json_parse_fallback]', {
      field: fieldName,
      reason: 'parse_error',
      detail: error instanceof Error ? error.message : String(error),
      ...context,
    });
    return [];
  }
};

/**
 * Parse and normalise a stored variant JSON string into an ExerciseVariant.
 * Trims string fields, filters empty extras, and returns null when the JSON is
 * absent, invalid, or yields no meaningful fields.
 *
 * @param {string | null} [variantJson] - The stored variant JSON string.
 * @returns {ExerciseVariant | null} The normalised variant, or null when empty/invalid.
 */
export const parseVariant = (variantJson?: string | null): ExerciseVariant | null => {
  if (!variantJson || !variantJson.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(variantJson) as ExerciseVariant;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const normalised: ExerciseVariant = {};

    if (typeof parsed.angle === 'string' && parsed.angle.trim()) {
      normalised.angle = parsed.angle.trim();
    }
    if (typeof parsed.grip === 'string' && parsed.grip.trim()) {
      normalised.grip = parsed.grip.trim();
    }
    if (typeof parsed.posture === 'string' && parsed.posture.trim()) {
      normalised.posture = parsed.posture.trim();
    }
    if (typeof parsed.laterality === 'string' && parsed.laterality.trim()) {
      normalised.laterality = parsed.laterality.trim();
    }
    if (Array.isArray(parsed.extras)) {
      const extras = parsed.extras
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean);
      if (extras.length > 0) {
        normalised.extras = extras;
      }
    }

    return Object.keys(normalised).length > 0 ? normalised : null;
  } catch {
    return null;
  }
};

export type SqlExerciseRow = {
  id: number;
  name: string;
  equipment: string;
  muscle_groups: string;
  is_compound: number;
  weight: number;
  reps: number;
  sets: number;
  rest_time: number;
  progression: number;
  has_customised_sets: number;
  variant_json: string | null;
  rep_range_min: number | null;
  rep_range_max: number | null;
  progression_threshold: number | null;
  times_reps_hit_in_a_row: number | null;
  position: number;
  exercise_instance_id?: string;
};

/**
 * Converts optional double-progression integers to SQL values.
 *
 * @param value - Optional integer-ish input from a ProgramExercise.
 * @returns A positive integer for configured fields, otherwise null.
 */
export function optionalPositiveIntParam(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * Converts the double-progression hit counter to a persisted SQL value.
 *
 * @param value - Optional integer-ish counter value.
 * @returns A non-negative integer, defaulting to 0.
 */
export function nonNegativeIntParam(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

/**
 * Converts stored optional integers back to ProgramExercise fields.
 *
 * @param value - SQLite numeric value or null.
 * @returns The positive integer when present, otherwise undefined.
 */
function optionalPositiveIntField(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * Build the INSERT SQL and bound parameters for persisting a program exercise
 * into `program_exercises`, applying safe numeric coercion and defaults.
 *
 * @param {ProgramExercise} exercise - The exercise to serialize.
 * @param {number} position - The zero-based ordering position within its day.
 * @param {SQLiteBindValue} foreignKey - The owning workout day id.
 * @returns {{ sql: string; params: SQLiteBindValue[] }} The SQL statement and its bound parameters.
 */
export function serializeExerciseToSqlParams(
  exercise: ProgramExercise,
  position: number,
  foreignKey: SQLiteBindValue
): {
  sql: string;
  params: SQLiteBindValue[];
} {
  const muscleGroups = exercise.muscle_groups_worked ?? [];
  return {
    sql: `INSERT INTO program_exercises
           (workout_day_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, rep_range_min, rep_range_max, progression_threshold, times_reps_hit_in_a_row, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      foreignKey,
      exercise.name ?? '',
      exercise.equipment ?? '',
      JSON.stringify(muscleGroups),
      exercise.isCompound ? 1 : 0,
      safeParseFloat(exercise.weight, 0),
      safeParseInt(exercise.reps, 8),
      safeParseInt(exercise.sets, 3),
      safeParseInt(exercise.restTime, 180),
      safeParseFloat(exercise.progression, 0),
      exercise.hasCustomisedSets ? 1 : 0,
      serializeVariant(exercise.variant),
      optionalPositiveIntParam(exercise.repRangeMin),
      optionalPositiveIntParam(exercise.repRangeMax),
      optionalPositiveIntParam(exercise.progressionThreshold),
      nonNegativeIntParam(exercise.timesRepsHitInARow),
      position,
    ],
  };
}

/**
 * Build the INSERT SQL and bound parameters for persisting an exercise into
 * `queue_exercises`, applying safe numeric coercion and defaults.
 *
 * @param {ProgramExercise} exercise - The exercise to serialize.
 * @param {number} position - The zero-based ordering position within its queue item.
 * @param {string} queueItemId - The owning queue item id.
 * @returns {{ sql: string; params: SQLiteBindValue[] }} The SQL statement and its bound parameters.
 */
export function serializeQueueExerciseToSqlParams(
  exercise: ProgramExercise,
  position: number,
  queueItemId: string
): {
  sql: string;
  params: SQLiteBindValue[];
} {
  const muscleGroups = exercise.muscle_groups_worked ?? [];
  return {
    sql: `INSERT INTO queue_exercises
           (queue_item_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, rep_range_min, rep_range_max, progression_threshold, times_reps_hit_in_a_row, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      queueItemId,
      exercise.name ?? '',
      exercise.equipment ?? '',
      JSON.stringify(muscleGroups),
      exercise.isCompound ? 1 : 0,
      safeParseFloat(exercise.weight, 0),
      safeParseInt(exercise.reps, 8),
      safeParseInt(exercise.sets, 3),
      safeParseInt(exercise.restTime, 180),
      safeParseFloat(exercise.progression, 0),
      exercise.hasCustomisedSets ? 1 : 0,
      serializeVariant(exercise.variant),
      optionalPositiveIntParam(exercise.repRangeMin),
      optionalPositiveIntParam(exercise.repRangeMax),
      optionalPositiveIntParam(exercise.progressionThreshold),
      nonNegativeIntParam(exercise.timesRepsHitInARow),
      position,
    ],
  };
}

/**
 * Convert a raw SQLite exercise row back into a ProgramExercise, parsing array
 * and variant columns and applying default values for missing numeric fields.
 *
 * @param {SqlExerciseRow} ex - The raw database row.
 * @returns {ProgramExercise} The reconstructed program exercise.
 */
export function deserializeProgramExerciseRow(ex: SqlExerciseRow): ProgramExercise {
  return {
    exerciseInstanceId: ex.exercise_instance_id ?? undefined,
    name: ex.name,
    equipment: ex.equipment,
    muscle_groups_worked: parseStringArrayField(ex.muscle_groups, 'program_exercises.muscle_groups', {
      exercise: ex.name,
    }),
    isCompound: !!ex.is_compound,
    weight: (ex.weight ?? 0).toString(),
    reps: (ex.reps ?? 8).toString(),
    sets: (ex.sets ?? 3).toString(),
    restTime: (ex.rest_time ?? 180).toString(),
    progression: (ex.progression ?? 0) > 0 ? ex.progression.toString() : '',
    hasCustomisedSets: ex.has_customised_sets === 1,
    variant: parseVariant(ex.variant_json),
    repRangeMin: optionalPositiveIntField(ex.rep_range_min),
    repRangeMax: optionalPositiveIntField(ex.rep_range_max),
    progressionThreshold: optionalPositiveIntField(ex.progression_threshold),
    timesRepsHitInARow: nonNegativeIntParam(ex.times_reps_hit_in_a_row),
  };
}
