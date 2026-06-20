import type { ExerciseVariant } from '@/types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind/clsx class values into a single deduplicated class string.
 *
 * @param {...ClassValue} inputs - Class values (strings, arrays, objects) to combine.
 * @returns {string} The merged class name string with conflicting Tailwind classes resolved.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const VARIANT_LABEL_ORDER: Array<keyof Omit<ExerciseVariant, 'extras'>> = [
  'angle',
  'grip',
  'posture',
  'laterality',
];

/**
 * Builds a comma-separated label describing an exercise variant.
 *
 * Known variant fields (angle, grip, posture, laterality) are listed in a fixed
 * order, followed by any extra tags. Blank/whitespace-only values are skipped.
 *
 * @param {ExerciseVariant | null} [variant] - Variant to describe, if any.
 * @returns {string} Comma-separated label, or an empty string when no variant is set.
 */
export function getExerciseVariantLabel(variant?: ExerciseVariant | null): string {
  if (!variant) return '';

  const labels = VARIANT_LABEL_ORDER
    .map((field) => variant[field])
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());

  const extras = (variant.extras ?? [])
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());

  const combined = [...labels, ...extras];
  return combined.join(', ');
}

/**
 * Formats an exercise's display name, appending its variant label in parentheses.
 *
 * @param {string} name - Base exercise name.
 * @param {ExerciseVariant | null} [variant] - Variant to append, if any.
 * @returns {string} `"Name (variant)"`, just the name, or just the variant label when name is empty.
 */
export function formatExerciseDisplayName(
  name: string,
  variant?: ExerciseVariant | null
): string {
  const variantLabel = getExerciseVariantLabel(variant);
  if (!variantLabel) return name;
  return name ? `${name} (${variantLabel})` : variantLabel;
}
