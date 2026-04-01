import type { ExerciseVariant, ExerciseVariantOption } from '@/types';

export const getVariantOptionKey = (option: ExerciseVariantOption): string => {
  return `${option.field ?? 'extra'}:${option.value ?? option.label}`;
};

export const getVariantOptionLabel = (option: ExerciseVariantOption): string => {
  return option.value ?? option.label;
};

export const applyVariantOption = (
  currentVariant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): ExerciseVariant | null => {
  const next: ExerciseVariant = { ...(currentVariant ?? {}) };

  if (!option.field || !option.value) {
    const currentExtras = next.extras ?? [];
    if (!currentExtras.includes(option.label)) {
      next.extras = [...currentExtras, option.label];
    }
    return next;
  }

  next[option.field] = option.value;
  return next;
};

export const removeVariantOption = (
  currentVariant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): ExerciseVariant | null => {
  if (!currentVariant) {
    return null;
  }

  const next: ExerciseVariant = { ...currentVariant };

  if (!option.field || !option.value) {
    const remainingExtras = (next.extras ?? []).filter((extra) => extra !== option.label);
    if (remainingExtras.length > 0) {
      next.extras = remainingExtras;
    } else {
      delete next.extras;
    }
  } else if (next[option.field] === option.value) {
    delete next[option.field];
  }

  return Object.keys(next).length > 0 ? next : null;
};

export const isVariantOptionSelected = (
  variant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): boolean => {
  if (!variant) {
    return false;
  }

  if (!option.field || !option.value) {
    return (variant.extras ?? []).includes(option.label);
  }

  return variant[option.field] === option.value;
};
