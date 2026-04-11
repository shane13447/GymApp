/**
 * Exercise catalog parsing and access
 *
 * Extracted from app/(tabs)/Programs.tsx to enable
 * testable, type-safe catalog loading with explicit validation.
 */

import type { Exercise, ExerciseVariant, ExerciseVariantOption } from '@/types';

import { ExerciseVariantField } from '@/types';

const VALID_VARIANT_FIELDS: ExerciseVariantField[] = ['angle', 'grip', 'posture', 'laterality'];

export const parseVariantOption = (rawOption: unknown): ExerciseVariantOption | null => {
  if (!rawOption || typeof rawOption !== 'object') {
    return null;
  }

  const option = rawOption as Record<string, unknown>;
  const label = typeof option.label === 'string' ? option.label.trim() : '';
  if (!label) {
    return null;
  }

  const field = option.field;
  const normalisedField = VALID_VARIANT_FIELDS.includes(field as ExerciseVariantField)
    ? (field as ExerciseVariantField)
    : undefined;

  const value = typeof option.value === 'string' ? option.value.trim() : undefined;
  const aliases = Array.isArray(option.aliases)
    ? option.aliases
        .filter((alias): alias is string => typeof alias === 'string')
        .map((alias) => alias.trim())
        .filter(Boolean)
    : undefined;

  return {
    label,
    field: normalisedField,
    value: value || undefined,
    aliases: aliases && aliases.length > 0 ? aliases : undefined,
  };
};

export const parseVariantOptions = (rawOptions: unknown): ExerciseVariantOption[] | undefined => {
  if (!Array.isArray(rawOptions)) {
    return undefined;
  }

  const options = rawOptions.map(parseVariantOption).filter((option): option is ExerciseVariantOption => Boolean(option));
  return options.length > 0 ? options : undefined;
};

export const getDefaultVariantForExercise = (
  variantOptions?: ExerciseVariantOption[]
): ExerciseVariant | null => {
  if (!variantOptions || variantOptions.length === 0) {
    return null;
  }

  const defaultVariant: ExerciseVariant = {};

  for (const option of variantOptions) {
    if (!option.field || !option.value) {
      continue;
    }

    if (defaultVariant[option.field]) {
      continue;
    }

    defaultVariant[option.field] = option.value;
  }

  return Object.keys(defaultVariant).length > 0 ? defaultVariant : null;
};

export const parseExerciseCatalog = (data: unknown[]): Exercise[] => {
  return data.map((rawExercise) => {
    const ex = rawExercise as Record<string, unknown>;
    const variantOptions = parseVariantOptions(ex.variantOptions);
    const aliases = Array.isArray(ex.aliases)
      ? ex.aliases
          .filter((alias): alias is string => typeof alias === 'string')
          .map((alias) => alias.trim())
          .filter(Boolean)
      : undefined;

    return {
      name: typeof ex.name === 'string' ? ex.name : '',
      equipment: typeof ex.equipment === 'string' ? ex.equipment : '',
      muscle_groups_worked: Array.isArray(ex.muscle_groups_worked)
        ? ex.muscle_groups_worked.filter((group): group is string => typeof group === 'string')
        : [],
      isCompound: Boolean(ex.isCompound),
      variantOptions,
      aliases: aliases && aliases.length > 0 ? aliases : undefined,
    };
  });
};