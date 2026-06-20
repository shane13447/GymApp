import type { ExerciseVariant, ExerciseVariantOption } from '@/types';

/**
 * Builds a stable React key for a variant option.
 *
 * @param {ExerciseVariantOption} option - Variant option to key.
 * @returns {string} A `field:value` key, falling back to `'extra'`/label when absent.
 */
export const getVariantOptionKey = (option: ExerciseVariantOption): string => {
  return `${option.field ?? 'extra'}:${option.value ?? option.label}`;
};

/**
 * Resolves the human-readable label for a variant option.
 *
 * @param {ExerciseVariantOption} option - Variant option to label.
 * @returns {string} The option's value when present, otherwise its label.
 */
export const getVariantOptionLabel = (option: ExerciseVariantOption): string => {
  return option.value ?? option.label;
};

/**
 * Returns a new variant with the given option applied.
 *
 * Options without a `field`/`value` are appended to `extras` (deduplicated);
 * otherwise the corresponding variant field is set. The input is not mutated.
 *
 * @param {ExerciseVariant | null | undefined} currentVariant - Existing variant, if any.
 * @param {ExerciseVariantOption} option - Option to apply.
 * @returns {ExerciseVariant} A new variant with the option applied.
 */
export const applyVariantOption = (
  currentVariant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): ExerciseVariant => {
  const next: ExerciseVariant = { ...(currentVariant ?? {}) };
  if (next.extras) next.extras = [...next.extras];

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

/**
 * Returns a new variant with the given option removed.
 *
 * Options without a `field`/`value` are removed from `extras`; otherwise the
 * matching variant field is cleared. The input is not mutated.
 *
 * @param {ExerciseVariant | null | undefined} currentVariant - Existing variant, if any.
 * @param {ExerciseVariantOption} option - Option to remove.
 * @returns {ExerciseVariant | null} A new variant, or `null` when it becomes empty.
 */
export const removeVariantOption = (
  currentVariant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): ExerciseVariant | null => {
  if (!currentVariant) {
    return null;
  }

  const next: ExerciseVariant = { ...currentVariant };
  if (next.extras) next.extras = [...next.extras];

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

/**
 * Determines whether a variant option is currently selected.
 *
 * @param {ExerciseVariant | null | undefined} variant - Variant to inspect, if any.
 * @param {ExerciseVariantOption} option - Option to check for.
 * @returns {boolean} `true` when the option is present on the variant.
 */
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
