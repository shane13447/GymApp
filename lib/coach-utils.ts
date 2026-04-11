/**
 * Coach utility functions shared between Coach.tsx and prompt-test-runner.ts
 *
 * Extracted from app/(tabs)/Coach.tsx to eliminate duplication
 * and enable reuse across the coach pipeline.
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