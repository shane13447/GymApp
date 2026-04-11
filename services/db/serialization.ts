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

export const serializeVariant = (variant?: ExerciseVariant | null): string =>
  variant ? JSON.stringify(variant) : '';

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
  position: number;
  exercise_instance_id?: string;
};

export function serializeExerciseToSqlParams(
  exercise: ProgramExercise,
  position: number,
  foreignKey: string
): {
  sql: string;
  params: SQLiteBindValue[];
} {
  const muscleGroups = exercise.muscle_groups_worked ?? [];
  return {
    sql: `INSERT INTO program_exercises
           (workout_day_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      foreignKey,
      exercise.name ?? '',
      exercise.equipment ?? '',
      JSON.stringify(muscleGroups),
      exercise.isCompound ? 1 : 0,
      parseFloat(exercise.weight) || 0,
      parseInt(exercise.reps, 10) || 8,
      parseInt(exercise.sets, 10) || 3,
      parseInt(exercise.restTime, 10) || 180,
      parseFloat(exercise.progression) || 0,
      exercise.hasCustomisedSets ? 1 : 0,
      serializeVariant(exercise.variant),
      position,
    ],
  };
}

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
           (queue_item_id, name, equipment, muscle_groups, is_compound, weight, reps, sets, rest_time, progression, has_customised_sets, variant_json, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      queueItemId,
      exercise.name ?? '',
      exercise.equipment ?? '',
      JSON.stringify(muscleGroups),
      exercise.isCompound ? 1 : 0,
      parseFloat(exercise.weight) || 0,
      parseInt(exercise.reps, 10) || 8,
      parseInt(exercise.sets, 10) || 3,
      parseInt(exercise.restTime, 10) || 180,
      parseFloat(exercise.progression) || 0,
      exercise.hasCustomisedSets ? 1 : 0,
      serializeVariant(exercise.variant),
      position,
    ],
  };
}

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
    progression: (ex.progression ?? 0).toString(),
    hasCustomisedSets: ex.has_customised_sets === 1,
    variant: parseVariant(ex.variant_json),
  };
}