/**
 * Coach utility functions shared between Coach.tsx and prompt-test-runner.ts
 *
 * Extracted from app/(tabs)/Coach.tsx to eliminate duplication
 * and enable reuse across the coach pipeline.
 */

import type { ExerciseVariant } from '@/types';

/**
 * Parse a free-form variant string (e.g. "incline / wide grip") into an
 * {@link ExerciseVariant} by splitting on slashes/commas, trimming each
 * segment, and mapping recognised tokens to angle, grip, posture, laterality,
 * or extras. Lives here (no DB/UI deps) so it can be shared across the coach
 * pipeline and unit-tested in isolation.
 *
 * @param {string} value - The variant descriptor string to parse.
 * @returns {ExerciseVariant | null} The parsed variant, or `null` when no
 *   segments are present or no fields are detected.
 */
export const parseVariantString = (value: string): ExerciseVariant | null => {
  const segments = value
    .split(/[\/,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const variant: ExerciseVariant = {};
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (lower.includes('incline') || lower.includes('decline')) {
      variant.angle = segment;
    } else if (
      lower.includes('grip') ||
      lower.includes('neutral') ||
      lower.includes('supinated') ||
      lower.includes('pronated') ||
      lower.includes('reverse') ||
      lower.includes('close') ||
      lower.includes('wide') ||
      lower.includes('narrow')
    ) {
      variant.grip = segment;
    } else if (
      lower.includes('seated') ||
      lower.includes('standing') ||
      lower.includes('supported') ||
      lower.includes('bent')
    ) {
      variant.posture = segment;
    } else if (
      lower.includes('one-arm') ||
      lower.includes('single arm') ||
      lower.includes('one leg') ||
      lower.includes('single leg')
    ) {
      variant.laterality = segment;
    } else {
      variant.extras = [...(variant.extras ?? []), segment];
    }
  }

  return Object.keys(variant).length > 0 ? variant : null;
};

/**
 * Infers an exercise variant requested in a free-text coach prompt.
 *
 * Matches a set of known variant phrases (e.g. "neutral grip", "incline"),
 * and maps "wrist-friendly" to "neutral grip".
 *
 * @param {string} prompt - User prompt to scan (case-insensitive).
 * @returns {string | null} The detected variant phrase, or `null` if none match.
 */
export const inferRequestedVariant = (prompt: string): string | null => {
  const lowerPrompt = prompt.toLowerCase();

  const explicitVariants = [
    'neutral grip',
    'close grip',
    'wide grip',
    'incline',
    'decline',
    'high bar',
    'low bar',
  ];

  for (const variant of explicitVariants) {
    if (lowerPrompt.includes(variant)) {
      return variant;
    }
  }

  if (lowerPrompt.includes('wrist-friendly')) {
    return 'neutral grip';
  }

  return null;
};

/**
 * Infers injury severity from an injury type label.
 *
 * @param {string} type - Injury type label (case-insensitive), e.g. "Injury - Severe".
 * @returns {'mild' | 'moderate' | 'severe' | null} The matched severity, or `null` if none.
 */
export const inferInjurySeverity = (type: string): 'mild' | 'moderate' | 'severe' | null => {
  const lowerType = type.toLowerCase();
  if (lowerType.includes('injury - severe')) return 'severe';
  if (lowerType.includes('injury - moderate')) return 'moderate';
  if (lowerType.includes('injury - mild')) return 'mild';
  return null;
};

export type CoachProxyMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};