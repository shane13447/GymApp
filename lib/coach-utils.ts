/**
 * Coach utility functions shared between Coach.tsx and prompt-test-runner.ts
 *
 * Extracted from app/(tabs)/Coach.tsx to eliminate duplication
 * and enable reuse across the coach pipeline.
 */

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