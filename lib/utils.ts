import type { ExerciseVariant } from '@/types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const VARIANT_LABEL_ORDER: Array<keyof Omit<ExerciseVariant, 'extras'>> = [
  'angle',
  'grip',
  'posture',
  'laterality',
];

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

export function formatExerciseDisplayName(
  name: string,
  variant?: ExerciseVariant | null
): string {
  const variantLabel = getExerciseVariantLabel(variant);
  if (!variantLabel) return name;
  return name ? `${name} (${variantLabel})` : variantLabel;
}
