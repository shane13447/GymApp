/**
 * Workout Queue Modifier Service
 * Handles AI-powered workout queue modifications using compressed encoding
 */

import { JOINT_INJURY_MAP } from '@/constants/joint-injury-map';

// =============================================================================
// WEIGHT ROUNDING - Round to nearest 0.5kg for coach-modified queue items
// =============================================================================

/**
 * Rounds a weight to the nearest 0.5kg increment.
 * Example: 82.74 -> 82.5, 82.76 -> 83.0
 * 
 * Used only in the coach modify-workout queue flow.
 * Does NOT apply to manual program creation, ActiveWorkout logging, or history.
 */
export const roundWeightToNearestHalfKg = (weight: number | string): string => {
  const numericWeight = typeof weight === 'string' ? parseFloat(weight) : weight;
  if (isNaN(numericWeight)) {
    return String(weight);
  }
  // Round to nearest 0.5: multiply by 2, round, divide by 2
  const rounded = Math.round(numericWeight * 2) / 2;
  return rounded.toFixed(1);
};

/**
 * Checks if rounding should be applied for a given modification context.
 * Only applies to coach-initiated queue modifications.
 */
export const isCoachQueueModification = (context?: string): boolean => {
  // Could check context string for "coach" or "modify-workout"
  // For now, always round when called from coach flow
  return true;
};
import exercisesData from '@/data/exerciseSelection.json';import { getExerciseVariantLabel } from '@/lib/utils';
import * as db from '@/services/database';
import type { ExerciseVariant, ExerciseVariantOption, ProgramExercise, WorkoutQueueItem } from '@/types';

interface CustomisedSetPayloadInput {
  hasCustomisedSets: boolean;
  repsBySet?: string[];
  weightBySet?: string[];
}

export const normalizeCustomisedSetPayload = (payload: CustomisedSetPayloadInput): CustomisedSetPayloadInput => {
  if (!payload.hasCustomisedSets) {
    return {
      ...payload,
      repsBySet: payload.repsBySet ?? [],
      weightBySet: payload.weightBySet ?? [],
    };
  }

  const repsBySet = payload.repsBySet ?? [];
  const weightBySet = payload.weightBySet ?? [];

  if (repsBySet.length === 0 || weightBySet.length === 0 || repsBySet.length !== weightBySet.length) {
    throw new Error('Invalid customised set payload');
  }

  return {
    ...payload,
    repsBySet,
    weightBySet,
  };
};

// =============================================================================
// EXERCISE DATABASE - Uses exerciseSelection.json
// =============================================================================

interface ExerciseData {
  name: string;
  equipment: string;
  muscle_groups_worked: string[];
  isCompound: boolean;
  variantOptions?: ExerciseVariantOption[];
  aliases?: string[];
}

export interface TargetedExerciseRef {
  queueItemId: string;
  dayNumber: number;
  exerciseIndex: number;
  exerciseInstanceId?: string;
  name: string;
  displayName: string;
}

type TargetedExerciseMatcher = string | TargetedExerciseRef;

const EXERCISES: ExerciseData[] = exercisesData as ExerciseData[];

const VARIANT_FIELD_ORDER: Array<keyof Omit<ExerciseVariant, 'extras'>> = [
  'angle',
  'grip',
  'posture',
  'laterality',
];

const normaliseText = (value: string): string => value.trim().toLowerCase();

export type QueueParseFailureReason = 'none' | 'variant_source_conflict';

let lastQueueParseFailureReason: QueueParseFailureReason = 'none';

export const getLastQueueParseFailureReason = (): QueueParseFailureReason => lastQueueParseFailureReason;

const setLastQueueParseFailureReason = (reason: QueueParseFailureReason): void => {
  lastQueueParseFailureReason = reason;
};

export const parseVariantLabel = (value: string): ExerciseVariant | null => {
  const segments = value
    .split(/[\/,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const variant: ExerciseVariant = {};

  for (const segment of segments) {
    const lower = normaliseText(segment);
    if (lower.includes('incline')) {
      variant.angle = segment;
      continue;
    }
    if (lower.includes('decline')) {
      variant.angle = segment;
      continue;
    }
    if (
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
      continue;
    }
    if (lower.includes('seated') || lower.includes('standing') || lower.includes('supported') || lower.includes('bent')) {
      variant.posture = segment;
      continue;
    }
    if (lower.includes('one-arm') || lower.includes('single arm') || lower.includes('one leg') || lower.includes('single leg')) {
      variant.laterality = segment;
      continue;
    }

    const extras = variant.extras ?? [];
    extras.push(segment);
    variant.extras = extras;
  }

  return Object.keys(variant).length > 0 ? variant : null;
};

const serialiseVariantForPrompt = (variant?: ExerciseVariant | null): string => {
  const label = getExerciseVariantLabel(variant).trim();
  if (!label) {
    return '';
  }

  return label.replace(/,/g, '/');
};

const withVariantDisplayName = (exercise: ProgramExercise): string => {
  const variantLabel = serialiseVariantForPrompt(exercise.variant);
  return variantLabel ? `${exercise.name} (${variantLabel})` : exercise.name;
};

const parseVariantFromToken = (variantToken: string): ExerciseVariant | null => {
  const value = variantToken.trim();
  if (!value) {
    return null;
  }

  return parseVariantLabel(value);
};

const variantValuesFromOptions = (exerciseData?: ExerciseData): Set<string> => {
  const values = new Set<string>();
  if (!exerciseData?.variantOptions) {
    return values;
  }

  for (const option of exerciseData.variantOptions) {
    if (option.value) {
      values.add(normaliseText(option.value));
    }
    values.add(normaliseText(option.label));
    for (const alias of option.aliases ?? []) {
      values.add(normaliseText(alias));
    }
  }

  return values;
};

const variantToComparableSet = (variant?: ExerciseVariant | null): Set<string> => {
  const values: string[] = [];

  for (const field of VARIANT_FIELD_ORDER) {
    const fieldValue = variant?.[field];
    if (fieldValue) {
      values.push(normaliseText(fieldValue));
    }
  }

  for (const extra of variant?.extras ?? []) {
    values.push(normaliseText(extra));
  }

  return new Set(values.filter(Boolean));
};

// Validates a parsed variant against known exercise variant options.
// If no options metadata exists, we treat the variant as viable and allow intent to pass through.
const isVariantValidForExercise = (
  exerciseData: ExerciseData | null,
  variant?: ExerciseVariant | null
): boolean => {
  if (!variant) {
    return true;
  }

  const allowedValues = variantValuesFromOptions(exerciseData ?? undefined);
  if (allowedValues.size === 0) {
    return true;
  }

  const variantValues = variantToComparableSet(variant);
  if (variantValues.size === 0) {
    return true;
  }

  for (const value of variantValues) {
    if (!allowedValues.has(value)) {
      return false;
    }
  }

  return true;
};

// Builds a canonical variant object from option metadata.
// It converts user-entered casing/aliases to option labels (e.g., "inclined" -> "Incline").
const canonicaliseVariantFromOptions = (
  exerciseData: ExerciseData,
  variant: ExerciseVariant
): ExerciseVariant | null => {
  const variantValues = variantToComparableSet(variant);
  if (variantValues.size === 0) {
    return null;
  }

  const canonical: ExerciseVariant = {};
  const extras: string[] = [];

  for (const option of exerciseData.variantOptions ?? []) {
    const optionValues = [option.value, option.label, ...(option.aliases ?? [])]
      .map((value) => normaliseText(value ?? ''))
      .filter(Boolean);

    const matched = optionValues.some((value) => variantValues.has(value));
    if (!matched) {
      continue;
    }

    const canonicalLabel = option.label.trim();
    if (option.field) {
      canonical[option.field] = canonicalLabel;
    } else {
      extras.push(canonicalLabel);
    }
  }

  if (extras.length > 0) {
    canonical.extras = extras;
  }

  return Object.keys(canonical).length > 0 ? canonical : null;
};

// Normalizes a requested variant using available option metadata.
// If requested variant is unsupported, falls back to the provided safe variant (usually the original variant).
const normaliseVariantAgainstOptions = (
  exerciseData: ExerciseData | null,
  variant?: ExerciseVariant | null,
  fallback?: ExerciseVariant | null
): ExerciseVariant | null => {
  if (!variant) {
    return null;
  }

  if (!isVariantValidForExercise(exerciseData, variant)) {
    return fallback ?? null;
  }

  if (!exerciseData?.variantOptions?.length) {
    return variant;
  }

  return canonicaliseVariantFromOptions(exerciseData, variant) ?? fallback ?? null;
};

// Chooses the best source of variant metadata for validation.
// Prefer catalog metadata when present; otherwise use queue/original exercise metadata if available.
const getVariantValidationSource = (
  exerciseData: ExerciseData | null,
  originalEx?: ProgramExercise
): ExerciseData | null => {
  if (exerciseData?.variantOptions?.length) {
    return exerciseData;
  }

  if (originalEx?.variantOptions?.length) {
    return {
      name: originalEx.name,
      equipment: originalEx.equipment,
      muscle_groups_worked: originalEx.muscle_groups_worked,
      isCompound: originalEx.isCompound,
      variantOptions: originalEx.variantOptions,
      aliases: originalEx.aliases,
    };
  }

  return exerciseData;
};

const getExerciseIdentity = (
  exercise: Pick<ProgramExercise, 'exerciseInstanceId' | 'name' | 'variant'>,
  options: { includeInstanceId: boolean }
): string => {
  const canonical = normaliseExerciseForIdentity(exercise);

  return JSON.stringify({
    exerciseInstanceId: options.includeInstanceId ? (exercise.exerciseInstanceId ?? null) : null,
    name: canonical.name,
    variant: canonical.variant,
  });
};

const getDisplayName = (exercise: Pick<ProgramExercise, 'name' | 'variant'>): string => {
  const variantLabel = serialiseVariantForPrompt(exercise.variant);
  return variantLabel ? `${exercise.name} (${variantLabel})` : exercise.name;
};

const buildTargetedExerciseRef = (
  item: WorkoutQueueItem,
  exercise: ProgramExercise,
  exerciseIndex: number
): TargetedExerciseRef => ({
  queueItemId: item.id,
  dayNumber: item.dayNumber,
  exerciseIndex,
  exerciseInstanceId: exercise.exerciseInstanceId,
  name: exercise.name,
  displayName: getDisplayName(exercise),
});

const isTargetedExerciseRef = (
  value: TargetedExerciseMatcher
): value is TargetedExerciseRef => typeof value !== 'string';

const getComparableExerciseLabels = (
  exercise: Pick<ProgramExercise, 'name' | 'variant'>
): string[] => {
  return [exercise.name, getDisplayName(exercise)]
    .map(normaliseText)
    .filter(Boolean);
};

const doesExerciseTextMatch = (
  exercise: Pick<ProgramExercise, 'name' | 'variant'>,
  text: string
): boolean => {
  const normalisedTarget = normaliseText(text);
  if (!normalisedTarget) {
    return false;
  }

  return getComparableExerciseLabels(exercise).some((label) => {
    return (
      label === normalisedTarget ||
      label.includes(normalisedTarget) ||
      normalisedTarget.includes(label) ||
      getSimilarity(label, normalisedTarget) > 0.8
    );
  });
};

const findBestOriginalExerciseMatch = (
  originalExercises: ProgramExercise[],
  parsedExercise: Pick<ProgramExercise, 'name' | 'variant'>,
  parsedIndex: number,
  usedIndices: Set<number>
): { exercise: ProgramExercise; index: number } | null => {
  const parsedCanonical = normaliseExerciseForIdentity(parsedExercise);
  const parsedDisplayName = normaliseText(getDisplayName(parsedCanonical));
  const parsedName = normaliseText(parsedCanonical.name);
  const parsedVariantLabel = normaliseText(getExerciseVariantLabel(parsedCanonical.variant));

  const candidates = originalExercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ index }) => !usedIndices.has(index))
    .filter(({ exercise }) => {
      const canonicalExercise = normaliseExerciseForIdentity(exercise);
      const exerciseDisplayName = normaliseText(getDisplayName(canonicalExercise));
      const exerciseName = normaliseText(canonicalExercise.name);

      return (
        exerciseDisplayName === parsedDisplayName ||
        exerciseName === parsedName ||
        exerciseDisplayName.includes(parsedDisplayName) ||
        parsedDisplayName.includes(exerciseDisplayName) ||
        exerciseName.includes(parsedName) ||
        parsedName.includes(exerciseName) ||
        getSimilarity(exerciseDisplayName, parsedDisplayName) > 0.8 ||
        getSimilarity(exerciseName, parsedName) > 0.8
      );
    })
    .sort((left, right) => {
      const scoreCandidate = (candidate: { exercise: ProgramExercise; index: number }): number => {
        const canonicalCandidate = normaliseExerciseForIdentity(candidate.exercise);
        const candidateDisplayName = normaliseText(getDisplayName(canonicalCandidate));
        const candidateName = normaliseText(canonicalCandidate.name);
        const candidateVariantLabel = normaliseText(getExerciseVariantLabel(canonicalCandidate.variant));
        let score = 0;

        if (candidateDisplayName === parsedDisplayName) score += 100;
        if (candidateName === parsedName) score += 60;
        if (candidateVariantLabel && candidateVariantLabel === parsedVariantLabel) score += 25;
        score -= Math.abs(candidate.index - parsedIndex);

        return score;
      };

      return scoreCandidate(right) - scoreCandidate(left);
    });

  return candidates[0] ?? null;
};

const buildExerciseIdentityMap = (
  exercises: ProgramExercise[],
  options: { includeInstanceId: boolean }
) => {
  const seenCounts = new Map<string, number>();

  return new Map(
    exercises.map((exercise, index) => {
      const baseIdentity = getExerciseIdentity(exercise, options);
      const occurrence = seenCounts.get(baseIdentity) ?? 0;
      seenCounts.set(baseIdentity, occurrence + 1);

      return [`${baseIdentity}::${occurrence}`, { exercise, index }] as const;
    })
  );
};

const buildQueueItemIdentityMap = (queue: WorkoutQueueItem[]) => {
  const seenCounts = new Map<string, number>();

  return new Map(
    queue.map((item) => {
      const occurrence = seenCounts.get(item.id) ?? 0;
      seenCounts.set(item.id, occurrence + 1);

      return [`${item.id}::${occurrence}`, item] as const;
    })
  );
};

const splitNameAndInlineVariant = (
  value: string
): { name: string; variantLabel: string | null } => {
  const match = value.trim().match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) {
    return { name: value.trim(), variantLabel: null };
  }

  return {
    name: match[1].trim(),
    variantLabel: match[2].trim(),
  };
};

const normalizeExerciseNameAndVariant = (
  nameToken: string,
  variantToken?: string | null
): { name: string; variantLabel: string } => {
  const trimmedName = nameToken.trim();
  const trimmedVariant = (variantToken ?? '').trim();
  const lowerName = normaliseText(trimmedName);

  if (['decline crunches', 'crunches', 'crunch'].includes(lowerName)) {
    if (lowerName === 'decline crunches') {
      return {
        name: 'Crunches',
        variantLabel: trimmedVariant || 'Decline',
      };
    }

    return {
      name: 'Crunches',
      variantLabel: trimmedVariant,
    };
  }

  return {
    name: trimmedName,
    variantLabel: trimmedVariant,
  };
};

const normaliseExerciseForIdentity = (
  exercise: Pick<ProgramExercise, 'name' | 'variant'>
): { name: string; variant: ExerciseVariant | null } => {
  const { name, variantLabel } = normalizeExerciseNameAndVariant(
    exercise.name,
    getExerciseVariantLabel(exercise.variant)
  );

  return {
    name,
    variant: parseVariantFromToken(variantLabel),
  };
};

/**
 * Find exercise by name with fuzzy matching
 */
export const findExerciseByName = (
  name: string
): ExerciseData | null => {
  if (!name || !name.trim()) return null;
  
  const lowerName = name.toLowerCase().trim();
  
  // Try exact match first
  for (const ex of EXERCISES) {
    if (ex.name.toLowerCase() === lowerName) {
      return ex;
    }
  }
  
  // Try fuzzy match (contains)
  for (const ex of EXERCISES) {
    if (ex.name.toLowerCase().includes(lowerName) ||
        lowerName.includes(ex.name.toLowerCase())) {
      return ex;
    }
  }
  
  return null;
};

// =============================================================================
// EXERCISE ALIASES - Maps common gym slang to actual exercise names
// =============================================================================

/**
 * Maps user-friendly names/slang to actual exercise names in the database.
 * Each key is a lowercase alias, value is array of possible matching exercises.
 * The first match found in the queue will be used.
 */
export const EXERCISE_ALIASES: Record<string, string[]> = {
  // Crunches variations
  'crunches': ['Decline Crunches'],
  'crunch': ['Decline Crunches'],
  'decline crunches': ['Decline Crunches'],
  'ab crunches': ['Decline Crunches'],
  
  // Curls variations
  'curls': ['Seated Dumbbell Bicep Curl', 'Preacher Curl', 'Hammer Curls', 'Fingertip Curls', 'Reverse Grip Forearm Curls'],
  'curl': ['Seated Dumbbell Bicep Curl', 'Preacher Curl', 'Hammer Curls', 'Fingertip Curls', 'Reverse Grip Forearm Curls'],
  'bicep curls': ['Seated Dumbbell Bicep Curl', 'Preacher Curl'],
  'bicep curl': ['Seated Dumbbell Bicep Curl', 'Preacher Curl'],
  'barbell curls': ['Preacher Curl'],
  'barbell curl': ['Preacher Curl'],
  'hammer curls': ['Hammer Curls'],
  'hammer curl': ['Hammer Curls'],
  'preacher curls': ['Preacher Curl'],
  'preacher curl': ['Preacher Curl'],
  'fingertip curls': ['Fingertip Curls'],
  'fingertip curl': ['Fingertip Curls'],
  'forearm curls': ['Fingertip Curls', 'Reverse Grip Forearm Curls'],
  'forearm curl': ['Fingertip Curls', 'Reverse Grip Forearm Curls'],
  'reverse curls': ['Reverse Grip Forearm Curls'],
  'reverse curl': ['Reverse Grip Forearm Curls'],
  'reverse forearm curls': ['Reverse Grip Forearm Curls'],
  
  // Bench variations
  'bench': ['Barbell Bench Press', 'Dumbbell Press', 'Chest Press'],
  'bench press': ['Barbell Bench Press', 'Dumbbell Press'],
  'barbell bench': ['Barbell Bench Press'],
  'flat bench': ['Barbell Bench Press', 'Dumbbell Press'],
  'incline bench': ['Dumbbell Press'],
  'incline press': ['Dumbbell Press'],
  
  // Squat variations
  'squat': ['Barbell Back Squat', 'Dumbbell Goblet Squat', 'Bulgarian Split Squat'],
  'squats': ['Barbell Back Squat', 'Dumbbell Goblet Squat', 'Bulgarian Split Squat'],
  'back squat': ['Barbell Back Squat'],
  'barbell squat': ['Barbell Back Squat'],
  'goblet squat': ['Dumbbell Goblet Squat'],
  'split squat': ['Bulgarian Split Squat'],
  'bulgarian': ['Bulgarian Split Squat'],
  
  // Deadlift variations
  'deadlift': ['Barbell Deadlift', 'Romanian Deadlift'],
  'deadlifts': ['Barbell Deadlift', 'Romanian Deadlift'],
  'conventional deadlift': ['Barbell Deadlift'],
  'rdl': ['Romanian Deadlift'],
  'romanian': ['Romanian Deadlift'],
  'stiff leg': ['Romanian Deadlift'],
  
  // Row variations
  'rows': ['Bent Over Barbell Row', 'One-Arm Dumbbell Row', 'Triangle Rows'],
  'row': ['Bent Over Barbell Row', 'One-Arm Dumbbell Row', 'Triangle Rows'],
  'barbell row': ['Bent Over Barbell Row'],
  'barbell rows': ['Bent Over Barbell Row'],
  'bent over row': ['Bent Over Barbell Row'],
  'dumbbell row': ['One-Arm Dumbbell Row'],
  'dumbbell rows': ['One-Arm Dumbbell Row'],
  'triangle rows': ['Triangle Rows'],
  'triangle row': ['Triangle Rows'],
  'cable rows': ['Triangle Rows'],
  'cable row': ['Triangle Rows'],
  
  // Pulldown variations
  'pulldowns': ['Lat Pulldowns'],
  'pulldown': ['Lat Pulldowns'],
  'lat pulldowns': ['Lat Pulldowns'],
  'lat pulldown': ['Lat Pulldowns'],
  'lats': ['Lat Pulldowns'],
  
  // Press variations
  'shoulder press': ['Dumbbell Shoulder Press', 'Overhead Barbell Press'],
  'overhead press': ['Overhead Barbell Press'],
  'military press': ['Overhead Barbell Press'],
  'ohp': ['Overhead Barbell Press'],
  'arnold press': ['Dumbbell Arnold Press'],
  'arnold': ['Dumbbell Arnold Press'],
  
  // Leg exercises
  'leg press': ['Leg Press'],
  'leg extensions': ['Leg Extensions'],
  'leg extension': ['Leg Extensions'],
  'extensions': ['Leg Extensions'],
  'hamstring curls': ['Hamstring Curls'],
  'ham curls': ['Hamstring Curls'],
  'leg curls': ['Hamstring Curls'],
  'calf press': ['Calf Press'],
  'calf raises': ['Dumbbell Calf Raises', 'Calf Press'],
  'calves': ['Calf Press', 'Dumbbell Calf Raises'],
  'hip thrust': ['Barbell Hip Thrust'],
  'hip thrusts': ['Barbell Hip Thrust'],
  'lunges': ['Barbell Lunge'],
  'lunge': ['Barbell Lunge'],
  
  // Other exercises
  'flyes': ['Dumbbell Flyes'],
  'flies': ['Dumbbell Flyes'],
  'chest fly': ['Dumbbell Flyes'],
  'lateral raise': ['Dumbbell Lateral Raise'],
  'lateral raises': ['Dumbbell Lateral Raise'],
  'side raises': ['Dumbbell Lateral Raise'],
  'shrugs': ['Barbell Shrugs'],
  'shrug': ['Barbell Shrugs'],
  'skullcrushers': ['Dumbbell Skullcrushers'],
  'skull crushers': ['Dumbbell Skullcrushers'],
  'tricep pushdown': ['Triceps Pushdown'],
  'triceps pushdown': ['Triceps Pushdown'],
  'pushdowns': ['Triceps Pushdown'],
  'pushdown': ['Triceps Pushdown'],
  'pull ups': ['Pull-Ups'],
  'pullups': ['Pull-Ups'],
  'chin ups': ['Pull-Ups'],
  'chinups': ['Pull-Ups'],
  'rear delt': ['Rear Delt Fly'],
  'rear delts': ['Rear Delt Fly'],
  'hug machine': ['The Hug Machine'],
  'pec deck': ['The Hug Machine'],
  'chest press': ['Chest Press'],
};

/**
 * Resolve user input to actual exercise names using aliases
 */
export const resolveExerciseAlias = (userInput: string, queueExercises: string[]): string[] => {
  const lowerInput = userInput.toLowerCase().trim();

  if (!lowerInput) {
    return [];
  }

  // Check if input matches an alias
  const aliasMatches = EXERCISE_ALIASES[lowerInput];
  if (aliasMatches) {
    // Return only exercises that exist in the queue
    const matchedInQueue = aliasMatches.filter(name =>
      queueExercises.some(qe => qe.toLowerCase() === name.toLowerCase())
    );

    if (matchedInQueue.length > 0) {
      return matchedInQueue;
    }
  }

  // Fallback to direct queue matching for canonical exercise names that are already in queue.
  const directMatches = queueExercises.filter((exerciseName) => {
    const lowerExerciseName = exerciseName.toLowerCase();
    return lowerExerciseName === lowerInput || lowerExerciseName.includes(lowerInput) || lowerInput.includes(lowerExerciseName);
  });

  return directMatches;
};

// =============================================================================
// MUSCLE GROUP DETECTION
// =============================================================================

const MUSCLE_GROUP_KEYWORDS: Record<string, string[]> = {
  chest: ['chest'],
  back: ['lats', 'traps'],
  shoulders: ['shoulders'],
  shoulder: ['shoulders'],
  legs: ['quads', 'glutes', 'hamstrings', 'calves'],
  leg: ['quads', 'glutes', 'hamstrings', 'calves'],
  biceps: ['biceps'],
  bicep: ['biceps'],
  triceps: ['triceps'],
  tricep: ['triceps'],
  forearms: ['forearms'],
  forearm: ['forearms'],
  abs: ['abs'],
  core: ['abs'],
  arms: ['biceps', 'triceps'],
  arm: ['biceps', 'triceps'],
  'upper body': ['chest', 'lats', 'traps', 'shoulders', 'biceps', 'triceps'],
  'lower body': ['quads', 'glutes', 'hamstrings', 'calves'],
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['lats', 'traps', 'biceps'],
  // Slang aliases
  guns: ['biceps', 'triceps'],
  // 'wheels': ['quads', 'glutes', 'hamstrings', 'calves'],
  upper: ['chest', 'lats', 'traps', 'shoulders', 'biceps', 'triceps'],
  lower: ['quads', 'glutes', 'hamstrings', 'calves'],
};

const REMOVE_REQUEST_KEYWORDS = [
  'remove',
  'delete',
  'drop',
  'get rid of',
  'take out',
  'cut',
  'skip',
  'eliminate',
  'ditch',
] as const;


const ADD_REQUEST_KEYWORDS = ['add', 'insert', 'put', 'include'] as const;
const INJURY_CONTEXT_KEYWORDS = [
  'injury',
  'hurt',
  'pain',
  'painful',
  'sore',
  'soreness',
  'strain',
  'irritation',
  'irritated',
] as const;
const GENERIC_EXERCISE_WORDS = new Set([
  'press',
  'row',
  'rows',
  'curl',
  'curls',
  'fly',
  'flyes',
  'raise',
  'raises',
  'extension',
  'extensions',
]);

function includesAnyKeyword(requestLower: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => requestLower.includes(keyword));
}

const inferInjuryIntent = (requestLower: string): { hasInjuryContext: boolean; severity: 'mild' | 'moderate' | 'severe' | null } => {
  const hasInjuryContext = includesAnyKeyword(requestLower, INJURY_CONTEXT_KEYWORDS);

  const inferSeverityFromLanguage = (): 'mild' | 'moderate' | 'severe' | null => {
    if (requestLower.includes('severe')) return 'severe';
    if (requestLower.includes('moderate')) return 'moderate';
    if (requestLower.includes('mild')) return 'mild';

    if (!hasInjuryContext) {
      return null;
    }

    const severeCues = [
      'cannot',
      "can't",
      'unable',
      'badly',
      'too painful',
      'do not allow',
      'cant do',
      'can not',
    ];
    if (severeCues.some((cue) => requestLower.includes(cue))) {
      return 'severe';
    }

    const moderateCues = [
      'sore',
      'flare up',
      'doesnt flare up',
      "doesn't flare up",
      'painful',
      'make it safer',
      'safer options',
      'adjust',
    ];
    if (moderateCues.some((cue) => requestLower.includes(cue))) {
      return 'moderate';
    }

    const mildCues = [
      'little',
      'slight',
      'a bit',
      'go easier',
      'irritated',
      'lighten',
      'easy today',
      'easier today',
    ];
    if (mildCues.some((cue) => requestLower.includes(cue))) {
      return 'mild';
    }

    return 'moderate';
  };

  const severity = inferSeverityFromLanguage();

  return {
    hasInjuryContext: hasInjuryContext || severity !== null,
    severity,
  };
};

const INJURY_MOVEMENT_FAMILY_KEYWORDS: Record<string, string[]> = {
  press: ['bench', 'press', 'chest press', 'overhead press', 'shoulder press'],
  pressing: ['bench', 'press', 'chest press', 'overhead press', 'shoulder press'],
  squat: ['squat', 'leg press', 'split squat', 'lunge', 'hack squat'],
  squatting: ['squat', 'leg press', 'split squat', 'lunge', 'hack squat'],
  deadlift: ['deadlift', 'rdl', 'romanian deadlift', 'hinge', 'good morning'],
  deadlifting: ['deadlift', 'rdl', 'romanian deadlift', 'hinge', 'good morning'],
};

const INJURY_BODY_PART_MUSCLE_KEYWORDS: Record<string, readonly string[]> = JOINT_INJURY_MAP;

const inferRequestedVariantsForRepair = (requestLower: string): ExerciseVariant[] => {
  const candidateTokens = [
    'neutral grip',
    'close grip',
    'wide grip',
    'incline',
    'decline',
    'high bar',
    'low bar',
    'seated',
    'standing',
    'supinated',
    'pronated',
    'reverse',
    'one-arm',
    'single-arm',
    'single arm',
  ];

  const toVariant = (token: string): ExerciseVariant | null => {
    if (token === 'one-arm' || token === 'single-arm' || token === 'single arm') {
      return { laterality: token };
    }
    return parseVariantFromToken(token);
  };

  const variants: ExerciseVariant[] = [];

  for (const token of candidateTokens) {
    if (!requestLower.includes(token)) {
      continue;
    }

    const parsed = toVariant(token);
    if (parsed) {
      variants.push(parsed);
    }
  }

  return variants;
};

const inferRequestedVariantForRepair = (requestLower: string): ExerciseVariant | null => {
  const variants = inferRequestedVariantsForRepair(requestLower);
  return variants[0] ?? null;
};

const canonicaliseExerciseNameForSemantics = (nameRaw: string): string => {
  const lower = normaliseText(nameRaw);
  if (!lower) return '';

  const directMatches = resolveExerciseAlias(lower, EXERCISES.map((exercise) => exercise.name));
  if (directMatches.length > 0) {
    return normaliseText(directMatches[0]);
  }

  const knownExercise = findExerciseByName(nameRaw);
  if (knownExercise?.name) {
    return normaliseText(knownExercise.name);
  }

  return lower;
};

const findExercisesInQueueByMuscleGroup = (
  queue: WorkoutQueueItem[],
  targetMuscles: string[]
): Array<TargetedExerciseRef & { weight: number }> => {
  const matchingExercises: Array<TargetedExerciseRef & { weight: number }> = [];
  
  for (const queueItem of queue) {
    for (const [exerciseIndex, exercise] of queueItem.exercises.entries()) {
      const exerciseMuscles = exercise.muscle_groups_worked || [];
      const isMatch = exerciseMuscles.some((muscle) =>
        targetMuscles.includes(muscle.toLowerCase())
      );
      
      if (isMatch) {
        matchingExercises.push({ 
          ...buildTargetedExerciseRef(queueItem, exercise, exerciseIndex),
          weight:
            typeof exercise.weight === 'number'
              ? exercise.weight
              : parseFloat(String(exercise.weight)) || 0,
        });
      }
    }
  }
  
  return matchingExercises;
};

const detectPercentageChange = (
  request: string
): { percentage: number; isIncrease: boolean } | null => {
  const lowerRequest = request.toLowerCase();
  const isIncrease =
    lowerRequest.includes('increase') ||
    lowerRequest.includes('raise') ||
    lowerRequest.includes('add');
  const isDecrease =
    lowerRequest.includes('reduce') ||
    lowerRequest.includes('decrease') ||
    lowerRequest.includes('lower');

  if (!isIncrease && !isDecrease) return null;

  const percentMatch = lowerRequest.match(/by\s+(\d+(?:\.\d+)?)\s*(%|percent)/);
  if (percentMatch) {
    return {
      percentage: parseFloat(percentMatch[1]),
      isIncrease,
    };
  }
  
  return null;
};

const detectMuscleGroupInRequest = (
  request: string
): { keyword: string; muscles: string[] } | null => {
  const lowerRequest = request.toLowerCase();
  const sortedKeywords = Object.keys(MUSCLE_GROUP_KEYWORDS).sort(
    (a, b) => b.length - a.length
  );
  const hasNumericModifier = /\b\d+(?:\.\d+)?\s*(?:reps?|sets?|kg|kgs|lb|lbs|%|percent)\b/.test(lowerRequest);
  const hasGlobalScopeTerms = /\b(?:all|everything|every|today)\b/.test(lowerRequest);

  for (const keyword of sortedKeywords) {
    const patterns = [
      `all ${keyword}`,
      `${keyword} exercises`,
      `${keyword} exercise`,
      `every ${keyword}`,
      // Natural language patterns
      `${keyword} stuff`,
      `${keyword} work`,
      `all the ${keyword}`,
      `my ${keyword}`,
    ];

    for (const pattern of patterns) {
      if (lowerRequest.includes(pattern)) {
        return { keyword, muscles: MUSCLE_GROUP_KEYWORDS[keyword] };
      }
    }

    const keywordRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
    if (keywordRegex.test(lowerRequest) && hasNumericModifier && hasGlobalScopeTerms) {
      return { keyword, muscles: MUSCLE_GROUP_KEYWORDS[keyword] };
    }
  }

  return null;
};

/**
 * Preprocess user request to replace muscle group references with explicit weight changes
 */
export const preprocessMuscleGroupRequest = (
  request: string,
  queue: WorkoutQueueItem[]
): { 
  processedRequest: string; 
  wasProcessed: boolean; 
  matchedExercises: string[];
  matchedExerciseRefs: TargetedExerciseRef[];
  muscleGroupDetected: string | null;
  noMatchesFound: boolean;
} => {
  const detected = detectMuscleGroupInRequest(request);
  
  if (!detected) {
    return { 
      processedRequest: request, 
      wasProcessed: false, 
      matchedExercises: [],
      matchedExerciseRefs: [],
      muscleGroupDetected: null,
      noMatchesFound: false,
    };
  }

  const matchingExercises = findExercisesInQueueByMuscleGroup(queue, detected.muscles);
  
  if (matchingExercises.length === 0) {
    console.log(`[PREPROCESS] No ${detected.keyword} exercises found in queue`);
    return { 
      processedRequest: request, 
      wasProcessed: false, 
      matchedExercises: [],
      matchedExerciseRefs: [],
      muscleGroupDetected: detected.keyword,
      noMatchesFound: true,
    };
  }

  const matchedExerciseRefs = matchingExercises.map(({ weight: _weight, ...exercise }) => exercise);
  const exerciseNames = matchedExerciseRefs.map((exercise) => exercise.displayName);
  const percentChange = detectPercentageChange(request);
  
  if (percentChange) {
    const multiplier = percentChange.isIncrease 
      ? 1 + percentChange.percentage / 100
      : 1 - percentChange.percentage / 100;

    const weightChanges = matchingExercises.map((exercise) => {
      const newWeight = Math.round(exercise.weight * multiplier * 10) / 10;
      return `${exercise.displayName} weight to ${newWeight}`;
    });

    const processedRequest = `change ${weightChanges.join(', ')}`;
    return { 
      processedRequest, 
      wasProcessed: true, 
      matchedExercises: exerciseNames,
      matchedExerciseRefs,
      muscleGroupDetected: detected.keyword,
      noMatchesFound: false,
    };
  }

  const nameList = matchingExercises.map((e) => e.name).join(', ');
  const lowerRequest = request.toLowerCase();
  let processedRequest = request;
  
  const replacements = [
    { find: `all ${detected.keyword} exercises`, replace: nameList },
    { find: `all ${detected.keyword} exercise`, replace: nameList },
    { find: `${detected.keyword} exercises`, replace: nameList },
    { find: `${detected.keyword} exercise`, replace: nameList },
    { find: `every ${detected.keyword} exercise`, replace: nameList },
    { find: `every ${detected.keyword}`, replace: nameList },
    { find: `all ${detected.keyword}`, replace: nameList },
  ];
  
  for (const { find, replace } of replacements) {
    const index = lowerRequest.indexOf(find);
    if (index !== -1) {
      processedRequest =
        request.substring(0, index) + replace + request.substring(index + find.length);
      return { 
        processedRequest, 
        wasProcessed: true, 
        matchedExercises: exerciseNames,
        matchedExerciseRefs,
        muscleGroupDetected: detected.keyword,
        noMatchesFound: false,
      };
    }
  }

  return {
    processedRequest: request,
    wasProcessed: false,
    matchedExercises: exerciseNames,
    matchedExerciseRefs,
    muscleGroupDetected: detected.keyword,
    noMatchesFound: false,
  };
};

// =============================================================================
// COMPRESSED ENCODING SYSTEM
// =============================================================================

/**
 * IronLogic System Prompt - TOON (Token Optimized Object Notation) Format
 * 
 * This prompt instructs the LLM to act as IronLogic, a gym coaching engine
 * that modifies workout queues using a highly compressed pipe-delimited format.
 */
export const COMPRESSED_SYSTEM_PROMPT = `<role>
IronLogic: Gym Queue Modifier. Output TOON only. No text.
</role>

<format>
QUEUE: Q0:D<day>:exercises;Q1:D<day>:exercises;Q2:D<day>:exercises
EXERCISE: name|kg|reps|sets|variant
Columns: 1=name 2=kg 3=reps 4=sets 5=variant(optional)
</format>

<critical>
- COPY ALL exercises from input (except removals)
- COPY ALL Q items (Q0;Q1;Q2)
- Change ONLY the column requested:
  * "weight" = column 2 (kg)
  * "reps" = column 3
  * "sets" = column 4
  * "variant" = column 5
- For variants: keep column 1 as base exercise name only.
- Do NOT embed variant in column 1 when column 5 is present.
- If variant appears in both column 1 and column 5, both must be identical.
- Preserve exact values in unchanged columns.
- Sets are deterministic. If canonical reps[] and weight[] arrays are provided upstream, set column 4 to array length.
- Canonical conversion rule: kg=weight[0], reps=reps[0], sets=array length (reps[] and weight[] lengths must match).
</critical>

<structural_rules>
- Explicit structural requests (add/remove) are mandatory intent constraints.
- "add" requests must increase target count for each targeted exercise by at least +1.
- "remove" requests must decrease target count for each targeted exercise by at least -1.
- Structural operations must be target-scoped. Do not remove unrelated exercises.
- Structural operations must preserve non-targeted exercises and queue items exactly.
- When add/remove appears with variant terms (e.g., "add neutral grip"), treat this as variant intent unless the prompt explicitly asks for a new exercise instance.
</structural_rules>

<injury_policy>
- mild: lighten all affected exercises across the entire current queue using a weight-first rule (reduce kg first, then reps/sets if needed)
- moderate: swap all affected exercises across the entire current queue to safer similar alternatives or remove them
- severe: same swap-or-remove rule across the entire current queue, with removal as fallback when no suitable safer alternative exists
- infer severity from user language when unspecified
- avoid positional assumptions; evaluate and modify the entire current queue
</injury_policy>

<examples>
IN: Q0:D1:Barbell Bench Press|92.5|5|3|Flat,Chest Press|74|11|3|Incline;Q1:D2:Decline Crunches|25|20|4|Decline,Lat Pulldowns|67|8|4|Wide Grip
REQ: change barbell bench press weight to 95
OUT: Q0:D1:Barbell Bench Press|95|5|3|Flat,Chest Press|74|11|3|Incline;Q1:D2:Decline Crunches|25|20|4|Decline,Lat Pulldowns|67|8|4|Wide Grip

IN: canonical row upstream reps[]=[5,5,5,5] weight[]=[92.5,92.5,92.5,92.5]
REQ: convert to TOON row deterministically
OUT: Q0:D1:Barbell Bench Press|92.5|5|4|Flat

IN: Q0:D1:Barbell Bench Press|92.5|5|5|Flat,Overhead Barbell Press|47.5|6|4|Standing;Q1:D2:Lat Pulldowns|67|8|4|Wide Grip
REQ: mild shoulder irritation, go easier on pressing
OUT: Q0:D1:Barbell Bench Press|85|5|5|Flat,Overhead Barbell Press|40|6|4|Standing;Q1:D2:Lat Pulldowns|67|8|4|Wide Grip

IN: Q0:D1:Barbell Back Squat|117.5|4|5|High Bar,Leg Extensions|55|15|3|Seated,Calf Press|160|12|5|Neutral,Barbell Deadlift|135|3|5|Conventional;Q1:D2:Lat Pulldowns|67|8|4|Wide Grip
REQ: my lower back is sore, adjust today so it does not flare up
OUT: Q0:D1:Lat Pulldowns|67|8|4|Wide Grip

IN: Q0:D2:Lat Pulldowns|55|10|3|Wide Grip,Triangle Rows|50|10|3|Close Grip
REQ: switch lat pulldowns and triangle rows to neutral grip
OUT: Q0:D2:Lat Pulldowns|55|10|3|Neutral Grip,Triangle Rows|50|10|3|Neutral Grip

IN: Q0:D2:Hammer Curls|20|9|4|Neutral Grip,Reverse Grip Forearm Curls|12|16|3|Reverse Grip
REQ: add another hammer curls
OUT: Q0:D2:Hammer Curls|20|9|4|Neutral Grip,Reverse Grip Forearm Curls|12|16|3|Reverse Grip,Hammer Curls|20|9|4|Neutral Grip

IN: Q2:D3:Barbell Back Squat|117.5|4|5|High Bar,Leg Extensions|55|15|3|Seated,Barbell Deadlift|135|3|5|Conventional
REQ: remove barbell deadlift from day 3
OUT: Q2:D3:Barbell Back Squat|117.5|4|5|High Bar,Leg Extensions|55|15|3|Seated
</examples>

<task>
Output modified queue. Include ALL exercises and ALL Q items.
</task>`;

export const encodeQueueForLLM = (queue: WorkoutQueueItem[]): string => {
  return queue
    .map((item, queueIndex) => {
      const exercises = item.exercises
        .map((ex) => {
          // Use full exercise names and optional variant metadata
          const variantLabel = serialiseVariantForPrompt(ex.variant);
          const base = `${ex.name}|${ex.weight || '0'}|${ex.reps || '8'}|${ex.sets || '3'}`;
          return variantLabel ? `${base}|${variantLabel}` : base;
        })
        .join(',');
    return `Q${queueIndex}:D${item.dayNumber}:${exercises}`;
    })
    .join(';');
};

export const buildCompressedPrompt = (
  userRequest: string,
  queue: WorkoutQueueItem[]
): string => {
  const encodedQueue = encodeQueueForLLM(queue);
  return `Queue:${encodedQueue}
Request:${userRequest}`;
};

// =============================================================================
// QUEUE FORMAT PARSER
// =============================================================================

/**
 * Fix common LLM output errors before parsing
 */
const preprocessLLMResponse = (response: string): string => {
  let fixed = response;
  
  // Fix: LLM sometimes uses = instead of , between exercises
  // Pattern: ends with |number followed by = (e.g., "|3=Exercise")
  // This replaces = with , when it appears between exercises
  fixed = fixed.replace(/\|(\d+)=([A-Z])/g, '|$1,$2');
  
  // Also handle cases like "|3=DB" 
  fixed = fixed.replace(/\|(\d+(?:\.\d+)?)=(\w)/g, '|$1,$2');
  
  if (fixed !== response) {
    console.log('[QUEUE FORMAT] Fixed separator issues in LLM response');
  }
  
  return fixed;
};

export const normalizeCoachModifiedWeight = (weight: string): string => {
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericWeight)) {
    return weight;
  }

  return (Math.round(numericWeight * 2) / 2).toFixed(1);
};

// BUG: roundCoachModifiedQueueWeights is defined and tested but never called in the
// live modify-workout path. The parseQueueFormatResponse path in Coach.tsx parses TOON
// directly without calling this function, so the documented rounding behavior
// (nearest 0.5kg for coach-modified weights) is not actually enforced in production.
// Fix: call this function after parseQueueFormatResponse and before compareWorkoutQueues
// in the Coach.tsx modify flow.
export const roundCoachModifiedQueueWeights = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[]
): WorkoutQueueItem[] => {
  return parsedQueue.map((parsedItem, itemIndex) => {
    const originalItem = originalQueue.find((item) => item.id === parsedItem.id) ?? originalQueue[itemIndex];

    return {
      ...parsedItem,
      exercises: parsedItem.exercises.map((exercise, exerciseIndex) => {
        const originalExercise =
          originalItem?.exercises.find(
            (candidate) =>
              candidate.exerciseInstanceId &&
              exercise.exerciseInstanceId &&
              candidate.exerciseInstanceId === exercise.exerciseInstanceId
          ) ?? originalItem?.exercises[exerciseIndex];

        if (!originalExercise) {
          return {
            ...exercise,
            weight: normalizeCoachModifiedWeight(exercise.weight),
          };
        }

        if (exercise.weight === originalExercise.weight) {
          return exercise;
        }

        return {
          ...exercise,
          weight: normalizeCoachModifiedWeight(exercise.weight),
        };
      }),
    };
  });
};

export const parseQueueFormatResponse = (
  response: string,
  originalQueue: WorkoutQueueItem[],
  userRequest: string = '',
  matchedExercises: TargetedExerciseMatcher[] = []
): WorkoutQueueItem[] | null => {
  setLastQueueParseFailureReason('none');

  try {
    // Preprocess to fix common LLM errors
    const preprocessed = preprocessLLMResponse(response);
    const trimmed = preprocessed.trim();
    console.log('[QUEUE FORMAT] Parsing response:', trimmed);
    
    const queueMatch = trimmed.match(/Q\d+:D\d+:[^;]+(;Q\d+:D\d+:[^;]+)*/);
    if (!queueMatch) {
      console.warn('[QUEUE FORMAT] No queue format found in response');
      return null;
    }
    
    const queueString = queueMatch[0];
    const queueItemStrings = queueString.split(';').filter((s) => s.trim().length > 0);
    const newQueue: WorkoutQueueItem[] = [];
    
    for (const itemString of queueItemStrings) {
      const match = itemString.match(/Q(\d+):D(\d+):(.+)/);
      if (!match) continue;
      
      const queueIndex = parseInt(match[1], 10);
      const dayNumber = parseInt(match[2], 10);
      const exercisesString = match[3];
      
      const originalItem = originalQueue[queueIndex];
      if (!originalItem) continue;
      
      const exerciseStrings = exercisesString.split(',').filter((s) => s.trim().length > 0);
      const exercises: ProgramExercise[] = [];
      const usedOriginalExerciseIndices = new Set<number>();

      for (const [exerciseIndex, exString] of exerciseStrings.entries()) {
        // Support both pipe (|) and slash (/) separators for compatibility
        const separator = exString.includes('|') ? '|' : '/';
        const parts = exString.split(separator);
        if (parts.length < 4) continue;

        const rawNameToken = parts[0]?.trim() || '';
        const weight = parts[1]?.trim() || '0';
        const reps = parts[2]?.trim() || '8';
        const sets = parts[3]?.trim() || '3';
        const variantToken = parts[4]?.trim() || '';

        if (!/^\d+$/.test(reps) || !/^\d+$/.test(sets)) {
          console.warn(`[QUEUE FORMAT] Invalid reps/sets token for "${rawNameToken}": reps="${reps}", sets="${sets}"`);
          return null;
        }

        const { name: parsedNameToken, variantLabel: inlineVariantLabel } = splitNameAndInlineVariant(rawNameToken);
        if (inlineVariantLabel) {
          setLastQueueParseFailureReason('variant_source_conflict');
          console.warn(
            `[QUEUE FORMAT] Inline variant notation is not allowed in TOON rows for "${parsedNameToken}". Use column 5 variant token only.`
          );
          return null;
        }

        const normalized = normalizeExerciseNameAndVariant(parsedNameToken, variantToken || '');
        const parsedName = normalized.name;
        const variantLabel = normalized.variantLabel;
        const parsedVariant = parseVariantFromToken(variantLabel);
        const originalMatch = findBestOriginalExerciseMatch(
          originalItem.exercises,
          { name: parsedName, variant: parsedVariant },
          exerciseIndex,
          usedOriginalExerciseIndices
        );
        const originalEx = originalMatch?.exercise;
        if (originalMatch) {
          usedOriginalExerciseIndices.add(originalMatch.index);
        }

        // Try to find the exercise by full name or fuzzy match
        const exerciseData = findExerciseByName(parsedName);
        const variantValidationSource = getVariantValidationSource(exerciseData, originalEx);
        const safeVariant = variantValidationSource?.variantOptions?.length
          ? normaliseVariantAgainstOptions(variantValidationSource, parsedVariant, originalEx?.variant ?? null)
          : (parsedVariant ?? originalEx?.variant ?? null);

        if (exerciseData) {
          exercises.push({
            name: exerciseData.name,
            equipment: exerciseData.equipment,
            muscle_groups_worked: exerciseData.muscle_groups_worked,
            isCompound: exerciseData.isCompound,
            variantOptions: exerciseData.variantOptions,
            aliases: exerciseData.aliases,
            exerciseInstanceId: originalEx?.exerciseInstanceId,
            variant: safeVariant,
            weight,
            reps,
            sets,
            restTime: originalEx?.restTime || '180',
            progression: originalEx?.progression || '',
            hasCustomisedSets: originalEx?.hasCustomisedSets ?? false,
          });
        } else if (originalEx) {
          exercises.push({
            ...originalEx,
            variant: safeVariant ?? originalEx.variant ?? null,
            weight,
            reps,
            sets,
          });
        } else {
          // Warn about unknown exercise name
          console.warn(`[QUEUE FORMAT] Unknown exercise: "${parsedName}" - using as-is. This may indicate an LLM hallucination.`);
          exercises.push({
            name: parsedName,
            equipment: '',
            muscle_groups_worked: [],
            isCompound: false, // Default to isolation for unknown exercises
            variant: parsedVariant,
            weight,
            reps,
            sets,
            restTime: '180',
            progression: '',
            hasCustomisedSets: false,
          });
        }
      }
      
      newQueue.push({
        id: originalItem.id,
        programId: originalItem.programId,
        programName: originalItem.programName,
        dayNumber,
        exercises,
        position: queueIndex,
      });
    }
    
    console.log('[QUEUE FORMAT] Parsed', newQueue.length, 'queue items');
    
    if (newQueue.length === 0) {
      return null;
    }
    
    // Apply repair with intent if we have the request context
    if (userRequest) {
      const repairedQueue = repairQueueWithIntent(originalQueue, newQueue, userRequest, matchedExercises);
      return repairedQueue;
    }
    
    return newQueue;
  } catch (error) {
    console.error('[QUEUE FORMAT] Error parsing response:', error);
    return null;
  }
};

// =============================================================================
// QUEUE REPAIR SYSTEM
// =============================================================================

/**
 * Simple string similarity using Levenshtein-based approach
 * Returns a value between 0 (no match) and 1 (exact match)
 */
export const getSimilarity = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.85;
  }
  
  // Word-based comparison
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const matchingWords = words1.filter(w1 => 
    words2.some(w2 => w1 === w2 || w1.includes(w2) || w2.includes(w1))
  );
  
  return matchingWords.length / Math.max(words1.length, words2.length);
};

/**
 * Unified Queue Repair Function
 * Combines all repair strategies with proper intent handling
 */
export const repairQueueWithIntent = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  userPrompt: string,
  targetedExerciseNames: TargetedExerciseMatcher[] = []
): WorkoutQueueItem[] => {
  console.log('[REPAIR] Starting queue repair...');
  console.log('[REPAIR] targetedExerciseNames:', targetedExerciseNames);
  
  const requestLower = userPrompt.toLowerCase();
  const isRelativeNumericAddPhrase = /\badd\s+\d+(?:\.\d+)?(?:\s*(?:kg|kgs?|kilo(?:s)?|lbs?|lb|pounds?|reps?|sets?))?\b/.test(requestLower);
  const isRelativeNumericDropPhrase =
    /\bdrop\b.*\bto\s+\d+(?:\.\d+)?(?:\s*(?:kg|kgs?|kilo(?:s)?|lbs?|lb|pounds?|reps?|sets?))?\b/.test(requestLower) ||
    /\bdrop\s+\d+(?:\.\d+)?\s*(?:kg|kgs?|kilo(?:s)?|lbs?|lb|pounds?|reps?|sets?)\b/.test(requestLower);
  const requestedVariants = inferRequestedVariantsForRepair(requestLower);
  const requestedVariant = requestedVariants[0] ?? null;
  const isVariantAddPhrase = requestLower.includes('add') && requestedVariants.length > 0;
  const isAddRequest =
    includesAnyKeyword(requestLower, ADD_REQUEST_KEYWORDS) &&
    !isRelativeNumericAddPhrase &&
    !isVariantAddPhrase;
  const isRemoveRequest = includesAnyKeyword(requestLower, REMOVE_REQUEST_KEYWORDS) && !isRelativeNumericDropPhrase;
  const injuryIntent = inferInjuryIntent(requestLower);
  const isMildInjuryRequest = injuryIntent.hasInjuryContext && injuryIntent.severity === 'mild';
  const injuryAllowsRemoval =
    injuryIntent.hasInjuryContext &&
    (injuryIntent.severity === 'moderate' || injuryIntent.severity === 'severe');
  console.log('[REPAIR] isRemoveRequest:', isRemoveRequest);

  const extractDestinationValues = (prompt: string, column: 'reps' | 'sets' | 'weight'): string[] => {
    const values = new Set<string>();

    const addMatches = (patterns: RegExp[]) => {
      for (const pattern of patterns) {
        for (const match of prompt.matchAll(pattern)) {
          const destination = match[1];
          if (destination) {
            values.add(destination);
          }
        }
      }
    };

    if (column === 'reps') {
      addMatches([
        /reps?\s*from\s*\d+\s*to\s*(\d+)/gi,
        /from\s*\d+\s*to\s*(\d+)\s*reps?/gi,
      ]);
      if (values.size === 0) {
        addMatches([
          /reps?\s*(?:to|at)\s*(\d+)/gi,
          /to\s*(\d+)\s*reps?/gi,
        ]);
      }
      if (values.size === 0) {
        addMatches([
          /(\d+)\s*reps?/gi,
          /reps?\s*(\d+)/gi,
        ]);
      }
    }

    if (column === 'sets') {
      addMatches([
        /sets?\s*from\s*\d+\s*to\s*(\d+)/gi,
        /from\s*\d+\s*to\s*(\d+)\s*sets?/gi,
      ]);
      if (values.size === 0) {
        addMatches([
          /sets?\s*(?:to|at)\s*(\d+)/gi,
          /to\s*(\d+)\s*sets?/gi,
        ]);
      }
      if (values.size === 0) {
        addMatches([
          /(\d+)\s*sets?/gi,
          /sets?\s*(\d+)/gi,
        ]);
      }
    }

    if (column === 'weight') {
      addMatches([
        /weight\s*from\s*\d+(?:\.\d+)?\s*(?:kg)?\s*to\s*(\d+(?:\.\d+)?)/gi,
        /from\s*\d+(?:\.\d+)?\s*(?:kg)?\s*to\s*(\d+(?:\.\d+)?)(?:\s*kg)?\s*weight/gi,
      ]);
      if (values.size === 0) {
        addMatches([
          /weight\s*(?:to|at)\s*(\d+(?:\.\d+)?)/gi,
          /to\s*(\d+(?:\.\d+)?)\s*(?:kgs?|kg)\b/gi,
        ]);
      }
      if (values.size === 0) {
        addMatches([
          /(\d+(?:\.\d+)?)\s*(?:kg|weight)/gi,
          /weight\s*(\d+(?:\.\d+)?)/gi,
        ]);
      }
    }

    return Array.from(values);
  };

  // Normalize "expected" values for each column (supports concurrent attribute prompts)
  const mentionsReps = requestLower.includes('rep');
  const mentionsWeight = requestLower.includes('weight') || requestLower.includes('kg');
  const mentionsSets = /\bsets\b/.test(requestLower);
  const requestedVariantLabel = normaliseText(getExerciseVariantLabel(requestedVariant));
  const variantAppearsInTargetName = requestedVariantLabel.length > 0 && targetedExerciseNames.some((target) => {
    const rawName = isTargetedExerciseRef(target)
      ? `${target.name} ${target.displayName}`
      : target;
    return normaliseText(rawName).includes(requestedVariantLabel);
  });
  const mentionsVariantStrongSignal =
    requestLower.includes('variant') ||
    requestLower.includes('grip');
  const mentionsVariantWeakSignal =
    requestLower.includes('incline') ||
    requestLower.includes('decline') ||
    requestLower.includes('seated') ||
    requestLower.includes('standing') ||
    requestLower.includes('one-arm') ||
    requestLower.includes('single-arm');
  const mentionsVariantBase = mentionsVariantStrongSignal || mentionsVariantWeakSignal;
  const mentionsVariant =
    mentionsVariantStrongSignal ||
    (!mentionsReps && !mentionsWeight && !mentionsSets && mentionsVariantBase) ||
    (mentionsVariantWeakSignal && variantAppearsInTargetName && !mentionsReps && !mentionsWeight && !mentionsSets);
  const hasExplicitColumnIntent = mentionsReps || mentionsWeight || mentionsSets || mentionsVariant;

  const repDestinationValues = extractDestinationValues(userPrompt, 'reps');
  const weightDestinationValues = extractDestinationValues(userPrompt, 'weight');
  const setDestinationValues = extractDestinationValues(userPrompt, 'sets');

  const expectedReps = repDestinationValues[0] ?? null;
  const expectedWeight = weightDestinationValues[0] ?? null;
  const expectedSets = setDestinationValues[0] ?? null;

  const targetedExerciseCount = targetedExerciseNames.length;
  const hasMultiTargetRepIntent = targetedExerciseCount > 1 && repDestinationValues.length > 1;
  const hasMultiTargetSetIntent = targetedExerciseCount > 1 && setDestinationValues.length > 1;
  const targetedRefs = targetedExerciseNames.filter(isTargetedExerciseRef);
  const targetedNumericIntents = inferTargetedNumericIntent(
    userPrompt,
    targetedRefs,
    detectRequestedChangeType(userPrompt)
  );

  const injurySeverityKeywordPresent = /\b(mild|moderate|severe)\b/.test(requestLower);
  const injuryFallbackTargets =
    injuryIntent.hasInjuryContext && !injurySeverityKeywordPresent
      ? extractTargetExerciseRefs(userPrompt, originalQueue)
      : [];
  const targetMatchers: TargetedExerciseMatcher[] = [...targetedExerciseNames, ...injuryFallbackTargets];

  const isExerciseTargeted = (
    originalItem: WorkoutQueueItem,
    originalExercise: ProgramExercise,
    originalIndex: number,
    candidateExerciseName: string
  ): boolean => {
    return targetMatchers.some((target) => {
      if (isTargetedExerciseRef(target)) {
        if (
          target.exerciseInstanceId &&
          originalExercise.exerciseInstanceId &&
          target.exerciseInstanceId === originalExercise.exerciseInstanceId
        ) {
          return true;
        }

        return (
          target.queueItemId === originalItem.id &&
          target.exerciseIndex === originalIndex &&
          doesExerciseTextMatch(originalExercise, target.displayName)
        );
      }

      return doesExerciseTextMatch(originalExercise, target);
    }) || (targetMatchers.length === 0 && requestLower.includes(candidateExerciseName.toLowerCase()));
  };

  const healedQueue = parsedQueue.map((qItem, qIndex) => {
    const originalItem =
      originalQueue.find((oq) => oq.id === qItem.id) ||
      originalQueue[qIndex] ||
      originalQueue.find((oq) => oq.dayNumber === qItem.dayNumber);
    if (!originalItem) return qItem;
    const usedOriginalIndices = new Set<number>();

    const healedExercises = qItem.exercises
      .map((ex, exerciseIndex) => {
      const finalEx = { ...ex };
      const originalMatch = findBestOriginalExerciseMatch(
        originalItem.exercises,
        ex,
        exerciseIndex,
        usedOriginalIndices
      );
      const originalEx = originalMatch?.exercise ?? originalItem.exercises[exerciseIndex];

      if (!originalEx) return finalEx;
      usedOriginalIndices.add(originalMatch?.index ?? exerciseIndex);

      finalEx.hasCustomisedSets = originalEx.hasCustomisedSets;
      finalEx.exerciseInstanceId = originalEx.exerciseInstanceId;

      const matchedOriginalIndex = originalMatch?.index ?? exerciseIndex;

      const isTargeted = isExerciseTargeted(
        originalItem,
        originalEx,
        matchedOriginalIndex,
        ex.name
      );

      const expectedVariant = mentionsVariant && requestedVariant ? requestedVariant : null;

      // --- LOGIC GAP FIX (Test 12) ---
      // Force the correct value on targeted exercises if LLM ignored it
      if (isTargeted) {
        if (isMildInjuryRequest && !expectedWeight) {
          const originalWeight = Number(originalEx.weight);
          if (Number.isFinite(originalWeight) && originalWeight > 0) {
            finalEx.weight = Math.max(1, Math.round((originalWeight * 0.85) * 10) / 10).toString();
          } else {
            const originalReps = Number(originalEx.reps);
            if (Number.isFinite(originalReps) && originalReps > 1) {
              finalEx.reps = Math.max(1, originalReps - 1).toString();
            }
          }
        }

        if (injuryAllowsRemoval && !isRemoveRequest) {
          return null;
        }

        const targetIntentKey =
          originalEx.exerciseInstanceId ??
          `${originalItem.id}:${matchedOriginalIndex}:${normaliseText(originalEx.name)}`;
        const targetedIntent = targetedNumericIntents.get(targetIntentKey);

        // Apply intended changes (supports multiple columns at once).
        // If a column is NOT intended to change, restore it to the original value.

        if (targetedIntent?.reps) {
          if (finalEx.reps !== targetedIntent.reps) {
            console.log(`[REPAIR] Applying targeted reps change for ${ex.name}: ${finalEx.reps} -> ${targetedIntent.reps}`);
            finalEx.reps = targetedIntent.reps;
          }

          if (finalEx.weight === targetedIntent.reps && originalEx.weight !== targetedIntent.reps) {
            console.log(`[REPAIR] Fix Column Swap for ${ex.name}: Restore Weight, Apply Reps`);
            finalEx.weight = originalEx.weight;
            finalEx.reps = targetedIntent.reps;
          }
        } else if (expectedReps && !hasMultiTargetRepIntent) {
          if (finalEx.reps !== expectedReps) {
            console.log(`[REPAIR] Applying reps change for ${ex.name}: ${finalEx.reps} -> ${expectedReps}`);
            finalEx.reps = expectedReps;
          }

          // Fix Column Confusion (Weight became Reps value)
          if (finalEx.weight === expectedReps && originalEx.weight !== expectedReps) {
            console.log(`[REPAIR] Fix Column Swap for ${ex.name}: Restore Weight, Apply Reps`);
            finalEx.weight = originalEx.weight;
            finalEx.reps = expectedReps;
          }
        } else if (hasExplicitColumnIntent && !mentionsReps && finalEx.reps !== originalEx.reps) {
          finalEx.reps = originalEx.reps;
        }

        if (targetedIntent?.weight) {
          if (finalEx.weight !== targetedIntent.weight) {
            console.log(`[REPAIR] Applying targeted weight change for ${ex.name}: ${finalEx.weight} -> ${targetedIntent.weight}`);
            finalEx.weight = targetedIntent.weight;
          }

          if (finalEx.reps === targetedIntent.weight && originalEx.reps !== targetedIntent.weight) {
            console.log(`[REPAIR] Fix Column Swap for ${ex.name}: Restore Reps, Apply Weight`);
            finalEx.reps = originalEx.reps;
            finalEx.weight = targetedIntent.weight;
          }
        } else if (expectedWeight) {
          if (finalEx.weight !== expectedWeight) {
            console.log(`[REPAIR] Applying weight change for ${ex.name}: ${finalEx.weight} -> ${expectedWeight}`);
            finalEx.weight = expectedWeight;
          }

          // Fix Column Confusion (Reps became Weight value)
          if (finalEx.reps === expectedWeight && originalEx.reps !== expectedWeight) {
            console.log(`[REPAIR] Fix Column Swap for ${ex.name}: Restore Reps, Apply Weight`);
            finalEx.reps = originalEx.reps;
            finalEx.weight = expectedWeight;
          }
        } else if (hasExplicitColumnIntent && !mentionsWeight && finalEx.weight !== originalEx.weight) {
          finalEx.weight = originalEx.weight;
        }

        if (targetedIntent?.sets) {
          if (finalEx.sets !== targetedIntent.sets) {
            console.log(`[REPAIR] Applying targeted sets change for ${ex.name}: ${finalEx.sets} -> ${targetedIntent.sets}`);
            finalEx.sets = targetedIntent.sets;
          }
        } else if (expectedSets && !hasMultiTargetSetIntent) {
          if (finalEx.sets !== expectedSets) {
            console.log(`[REPAIR] Applying sets change for ${ex.name}: ${finalEx.sets} -> ${expectedSets}`);
            finalEx.sets = expectedSets;
          }
        } else if (hasExplicitColumnIntent && !mentionsSets && finalEx.sets !== originalEx.sets) {
          finalEx.sets = originalEx.sets;
        }

        if (mentionsVariant) {
          const exerciseData = getVariantValidationSource(findExerciseByName(finalEx.name), originalEx);
          if (!exerciseData?.variantOptions?.length) {
            const requestedVariantLabel = normaliseText(getExerciseVariantLabel(requestedVariant));
            const currentVariantLabel = normaliseText(getExerciseVariantLabel(finalEx.variant));
            const originalVariantLabel = normaliseText(getExerciseVariantLabel(originalEx.variant));

            const parsedStillOriginalVariant =
              currentVariantLabel.length > 0 &&
              currentVariantLabel === originalVariantLabel &&
              requestedVariantLabel.length > 0 &&
              currentVariantLabel !== requestedVariantLabel;

            if (!finalEx.variant || parsedStillOriginalVariant) {
              finalEx.variant = requestedVariant ?? finalEx.variant ?? originalEx.variant ?? null;
            } else {
              finalEx.variant = finalEx.variant ?? originalEx.variant ?? null;
            }
          } else {
            const normalisedExistingVariant = normaliseVariantAgainstOptions(
              exerciseData,
              finalEx.variant,
              null
            );

            const requestedVariantForExercise = requestedVariants.find((candidate) =>
              normaliseVariantAgainstOptions(exerciseData, candidate, null) !== null
            ) ?? requestedVariant;

            finalEx.variant = normaliseVariantAgainstOptions(
              exerciseData,
              requestedVariantForExercise ?? normalisedExistingVariant,
              normalisedExistingVariant
            );
          }
        } else {
          finalEx.variant = originalEx.variant ?? null;
        }
      } else {
        // Not targeted - restore any accidental changes
        // Always restore non-targeted exercises (prevents accidental global edits).
        if (finalEx.weight !== originalEx.weight) {
          console.log(`[REPAIR] Restoring weight for ${originalEx.name}: ${finalEx.weight} -> ${originalEx.weight}`);
          finalEx.weight = originalEx.weight;
        }
        if (finalEx.reps !== originalEx.reps) {
          console.log(`[REPAIR] Restoring reps for ${originalEx.name}: ${finalEx.reps} -> ${originalEx.reps}`);
          finalEx.reps = originalEx.reps;
        }
        if (finalEx.sets !== originalEx.sets) {
          console.log(`[REPAIR] Restoring sets for ${originalEx.name}: ${finalEx.sets} -> ${originalEx.sets}`);
          finalEx.sets = originalEx.sets;
        }
        finalEx.variant = originalEx.variant ?? null;
      }

      return finalEx;
    })
      .filter((exercise): exercise is ProgramExercise => exercise !== null);

    // --- OVER-PROTECTIVE FIX (Test 10 & 14) ---
    // Check for dropped exercises
    for (const [originalIndex, origEx] of originalItem.exercises.entries()) {
      if (!usedOriginalIndices.has(originalIndex)) {
        // Was this exercise targeted by the user?
        const isTargeted = isExerciseTargeted(
          originalItem,
          origEx,
          originalIndex,
          origEx.name
        );

        console.log(`[REPAIR] Dropped exercise "${origEx.name}" - isRemoveRequest: ${isRemoveRequest}, isTargeted: ${isTargeted}`);

        // Allow dropping targeted exercises for explicit removals and injury-driven moderate/severe swaps.
        if ((isRemoveRequest && isTargeted) || (injuryAllowsRemoval && isTargeted)) {
          console.log(`[REPAIR] Allowing removal of targeted exercise: ${origEx.name}`);
          continue;
        }
        
        // Otherwise, it was accidental data loss. Restore it.
        console.log(`[REPAIR] Restoring dropped exercise: ${origEx.name}`);
        const restoredExercise = { ...origEx };

        if (isTargeted && isMildInjuryRequest && !expectedWeight) {
          const originalWeight = Number(origEx.weight);
          if (Number.isFinite(originalWeight) && originalWeight > 0) {
            restoredExercise.weight = Math.max(1, Math.round((originalWeight * 0.85) * 10) / 10).toString();
          } else {
            const originalReps = Number(origEx.reps);
            if (Number.isFinite(originalReps) && originalReps > 1) {
              restoredExercise.reps = Math.max(1, originalReps - 1).toString();
            }
          }
        }

        healedExercises.push(restoredExercise);
      }
    }
    
    return { ...qItem, exercises: healedExercises };
  });

  // Anti-addition guard: strip exercises that don't exist in original queue
  // and weren't explicitly added via an add request.
  // Prevents the LLM from sneaking in exercises that weren't requested to be added.
  if (!isAddRequest) {
    for (let qIndex = 0; qIndex < healedQueue.length; qIndex++) {
      const qItem = healedQueue[qIndex];
      const originalItem =
        originalQueue.find((oq) => oq.id === qItem.id) ?? originalQueue[qIndex];
      if (!originalItem) continue;
      healedQueue[qIndex] = {
        ...qItem,
        exercises: qItem.exercises.filter((ex) => {
          return originalItem.exercises.some((origEx) => doesExerciseTextMatch(origEx, ex.name));
        }),
      };
    }
  }

  // Deterministic structural reconciliation pass for explicit add/remove intents
  if (isRemoveRequest) {
    for (const target of targetedExerciseNames) {
      if (!isTargetedExerciseRef(target)) {
        continue;
      }

      const queueItemIndex = healedQueue.findIndex((item) => item.id === target.queueItemId);
      if (queueItemIndex < 0) {
        continue;
      }

      healedQueue[queueItemIndex] = {
        ...healedQueue[queueItemIndex],
        exercises: healedQueue[queueItemIndex].exercises.filter((exercise) => {
          if (
            target.exerciseInstanceId &&
            exercise.exerciseInstanceId &&
            exercise.exerciseInstanceId === target.exerciseInstanceId
          ) {
            return false;
          }

          return !doesExerciseTextMatch(exercise, target.displayName);
        }),
      };
    }
  }

  if (isAddRequest) {
    for (const target of targetedExerciseNames) {
      if (!isTargetedExerciseRef(target)) {
        continue;
      }

      const sourceQueueItem = originalQueue.find((item) => item.id === target.queueItemId);
      const sourceExercise =
        (target.exerciseInstanceId
          ? sourceQueueItem?.exercises.find((exercise) => exercise.exerciseInstanceId === target.exerciseInstanceId)
          : undefined) ?? sourceQueueItem?.exercises[target.exerciseIndex];

      if (!sourceQueueItem || !sourceExercise) {
        continue;
      }

      const healedQueueItemIndex = healedQueue.findIndex((item) => item.id === target.queueItemId);
      if (healedQueueItemIndex < 0) {
        continue;
      }

      const existingCount = healedQueue[healedQueueItemIndex].exercises.filter((exercise) =>
        canonicaliseExerciseNameForSemantics(exercise.name) === canonicaliseExerciseNameForSemantics(sourceExercise.name)
      ).length;
      const originalCount = sourceQueueItem.exercises.filter((exercise) =>
        canonicaliseExerciseNameForSemantics(exercise.name) === canonicaliseExerciseNameForSemantics(sourceExercise.name)
      ).length;

      if (existingCount > originalCount) {
        continue;
      }

      const duplicateExercise: ProgramExercise = {
        ...sourceExercise,
        exerciseInstanceId: `${target.queueItemId}:e${healedQueue[healedQueueItemIndex].exercises.length}`,
      };

      healedQueue[healedQueueItemIndex] = {
        ...healedQueue[healedQueueItemIndex],
        exercises: [...healedQueue[healedQueueItemIndex].exercises, duplicateExercise],
      };
    }
  }

  console.log('[REPAIR] Queue repair complete');
  return healedQueue;
};

/**
 * Detect what type of change was requested from user input
 */
type ChangeType = 'weight' | 'reps' | 'sets' | 'variant' | 'remove' | 'add' | 'unknown';

export const detectRequestedChangeType = (request: string): ChangeType[] => {
  const lowerRequest = request.toLowerCase();
  const types: ChangeType[] = [];

  if (lowerRequest.includes('weight') || lowerRequest.includes('kg')) {
    types.push('weight');
  }
  if (/\breps?\b/.test(lowerRequest)) {
    types.push('reps');
  }
  if (/\bsets\b/.test(lowerRequest)) {
    types.push('sets');
  }
  if (lowerRequest.includes('variant') || lowerRequest.includes('grip') || lowerRequest.includes('incline') || lowerRequest.includes('decline')) {
    types.push('variant');
  }

  const isRelativeNumericAddPhrase = /\badd\s+\d+(?:\.\d+)?(?:\s*(?:kg|kgs?|kilo(?:s)?|lbs?|lb|pounds?|reps?|sets?))?\b/.test(lowerRequest);
  const isRelativeNumericDropPhrase =
    /\bdrop\b.*\bto\s+\d+(?:\.\d+)?(?:\s*(?:kg|kgs?|kilo(?:s)?|lbs?|lb|pounds?|reps?|sets?))?\b/.test(lowerRequest) ||
    /\bdrop\s+\d+(?:\.\d+)?\s*(?:kg|kgs?|kilo(?:s)?|lbs?|lb|pounds?|reps?|sets?)\b/.test(lowerRequest);
  const hasSplitPhrasalRemove = /\btake\b[\s\S]{1,60}\bout\b/.test(lowerRequest);

  if ((includesAnyKeyword(lowerRequest, REMOVE_REQUEST_KEYWORDS) || hasSplitPhrasalRemove) && !isRelativeNumericDropPhrase) {
    types.push('remove');
  }
  if (includesAnyKeyword(lowerRequest, ADD_REQUEST_KEYWORDS) && !isRelativeNumericAddPhrase) {
    types.push('add');
  }

  return types.length > 0 ? types : ['unknown'];
};

/**
 * Extract target exercise names from user request
 * Uses fuzzy matching, alias resolution, and partial word matching
 * Returns normalized exercise names that were mentioned
 */
export const extractTargetExercises = (
  request: string,
  queue: WorkoutQueueItem[]
): string[] => {
  const targetRefs = extractTargetExerciseRefs(request, queue);
  const targetNames = targetRefs.map((target) => target.displayName);
  console.log(`[EXTRACT] Found ${targetNames.length} target exercises:`, targetNames);
  return targetNames;
};

export const extractTargetExerciseRefs = (
  request: string,
  queue: WorkoutQueueItem[]
): TargetedExerciseRef[] => {
  const lowerRequest = request.toLowerCase().trim();
  const injuryIntent = inferInjuryIntent(lowerRequest);
  const targetExercises: TargetedExerciseRef[] = [];
  const addedExerciseKeys = new Set<string>();
  const allExercises = queue.flatMap((item) =>
    item.exercises.map((exercise, exerciseIndex) =>
      buildTargetedExerciseRef(item, exercise, exerciseIndex)
    )
  );

  // Helper to add exercise if not already added
  const addExercise = (exercise: TargetedExerciseRef) => {
    const key = exercise.exerciseInstanceId ?? `${exercise.queueItemId}:${exercise.exerciseIndex}:${normaliseText(exercise.displayName)}`;
    if (!addedExerciseKeys.has(key)) {
      addedExerciseKeys.add(key);
      targetExercises.push(exercise);
    }
  };

  // --- PASS 0: Prefer preprocess muscle-group matches as deterministic seed targets ---
  const hasInjuryMovementFamilyKeyword =
    injuryIntent.hasInjuryContext &&
    Object.keys(INJURY_MOVEMENT_FAMILY_KEYWORDS).some((keyword) => lowerRequest.includes(keyword));

  const preprocessed = preprocessMuscleGroupRequest(request, queue);
  if (!hasInjuryMovementFamilyKeyword && preprocessed.matchedExerciseRefs.length > 0) {
    for (const matched of preprocessed.matchedExerciseRefs) {
      addExercise(matched);
    }
  }

  // --- PASS 1: Check alias dictionary first ---
  // This catches common slang like "crunches" -> "Decline Crunches"
  for (const [alias, possibleMatches] of Object.entries(EXERCISE_ALIASES)) {
    // Check if alias appears in the request (as whole word or phrase)
    const aliasRegex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (aliasRegex.test(lowerRequest)) {
      // Find which of the possible matches exist in the queue
      for (const possibleMatch of possibleMatches) {
        const matchingExercises = allExercises.filter(
          (exercise) => exercise.name.toLowerCase() === possibleMatch.toLowerCase()
        );
        for (const exercise of matchingExercises) {
          addExercise(exercise);
        }
      }
    }
  }

  // --- PASS 2: Direct matching against queue exercises ---
  for (const exercise of allExercises) {
    const comparableLabels = [exercise.name, exercise.displayName];
    const isDirectMatch = comparableLabels.some((label) => {
      const lowerLabel = label.toLowerCase();
      const noSpaceLabel = lowerLabel.replace(/\s+/g, '');
      return lowerRequest.includes(lowerLabel) || lowerRequest.includes(noSpaceLabel);
    });

    if (isDirectMatch) {
      addExercise(exercise);
    }
  }

  // --- PASS 3: Partial word matching (for exercises with multiple words) ---
  for (const exercise of allExercises) {
    const key = exercise.exerciseInstanceId ?? `${exercise.queueItemId}:${exercise.exerciseIndex}:${normaliseText(exercise.displayName)}`;
    if (addedExerciseKeys.has(key)) continue;

    const lowerName = exercise.displayName.toLowerCase();
    const words = lowerName
      .split(/\s+/)
      .filter((word) => word.length > 2 && !GENERIC_EXERCISE_WORDS.has(word));
    
    // Skip if too few distinctive words remain after dropping generic exercise terms.
    if (words.length < 2) continue;

    // Check if the distinctive words appear in the request
    // "Decline Crunches" -> matches if "decline" AND "crunches" appear
    // "Lat Pulldowns" -> matches if "lat" AND "pulldowns" appear
    const matchingWords = words.filter(word => {
      // Skip common filler words
      if (['the', 'and', 'for', 'with'].includes(word)) return false;
      return lowerRequest.includes(word);
    });

    // Require stronger overlap so generic requests like "shoulder press" do not
    // accidentally target unrelated exercises such as "Chest Press".
    const threshold = Math.max(2, Math.ceil(words.length * 0.75));
    if (matchingWords.length >= threshold) {
      addExercise(exercise);
    }
  }

  // --- PASS 4: Fuzzy similarity matching for remaining exercises ---
  for (const exercise of allExercises) {
    const key = exercise.exerciseInstanceId ?? `${exercise.queueItemId}:${exercise.exerciseIndex}:${normaliseText(exercise.displayName)}`;
    if (addedExerciseKeys.has(key)) continue;

    // Extract potential exercise references from request
    // Split by common delimiters and check each chunk
    const chunks = lowerRequest.split(/[,;]|\band\b|\bto\b|\bfor\b/).map(s => s.trim());

    for (const chunk of chunks) {
      if (chunk.length < 3) continue;

      const similarity = getSimilarity(chunk, exercise.displayName.toLowerCase());
      if (similarity > 0.6) {
        addExercise(exercise);
        break;
      }
    }
  }

  // --- PASS 5: Injury movement-family fallback (narrow and additive) ---
  if (injuryIntent.hasInjuryContext) {
    for (const [keyword, familyTerms] of Object.entries(INJURY_MOVEMENT_FAMILY_KEYWORDS)) {
      if (!lowerRequest.includes(keyword)) {
        continue;
      }

      for (const exercise of allExercises) {
        const key = exercise.exerciseInstanceId ?? `${exercise.queueItemId}:${exercise.exerciseIndex}:${normaliseText(exercise.displayName)}`;
        if (addedExerciseKeys.has(key)) continue;

        const exerciseLabel = normaliseText(exercise.displayName);
        const isFamilyMatch = familyTerms.some((term) => {
          const normalisedTerm = normaliseText(term);
          return exerciseLabel.includes(normalisedTerm) || getSimilarity(exerciseLabel, normalisedTerm) > 0.65;
        });

        if (isFamilyMatch) {
          addExercise(exercise);
        }
      }
    }
  }

  // --- PASS 6: General muscle-group fallback (true fallback unless request is explicit global/remove) ---
  const hasExplicitGlobalScope = /\b(?:all|everything|every)\b/.test(lowerRequest);
  const hasExplicitRemoveScope = includesAnyKeyword(lowerRequest, REMOVE_REQUEST_KEYWORDS);
  const allowFallbackExpansion = targetExercises.length === 0 || hasExplicitGlobalScope || hasExplicitRemoveScope;

  if (allowFallbackExpansion) {
    const fallbackMuscles = new Set<string>();

    const detectedGroup = detectMuscleGroupInRequest(request);
    if (detectedGroup) {
      for (const muscle of detectedGroup.muscles) {
        fallbackMuscles.add(muscle.toLowerCase());
      }
    }

    if (injuryIntent.hasInjuryContext) {
      for (const [bodyPartKeyword, muscleTargets] of Object.entries(INJURY_BODY_PART_MUSCLE_KEYWORDS)) {
        if (!lowerRequest.includes(bodyPartKeyword)) {
          continue;
        }

        for (const muscle of muscleTargets) {
          fallbackMuscles.add(muscle.toLowerCase());
        }
      }
    }

    if (fallbackMuscles.size > 0) {
      for (const queueItem of queue) {
        for (const [exerciseIndex, exercise] of queueItem.exercises.entries()) {
          const exerciseMuscles = (exercise.muscle_groups_worked ?? []).map((muscle) => muscle.toLowerCase());
          const isMatch = exerciseMuscles.some((muscle) => fallbackMuscles.has(muscle));

          if (isMatch) {
            addExercise(buildTargetedExerciseRef(queueItem, exercise, exerciseIndex));
          }
        }
      }
    }
  }

  return targetExercises;
};

/**
 * Fuzzy match an exercise name to the known exercise database
 */
export const fuzzyMatchExerciseName = (
  name: string,
  knownExercises: { name: string; equipment: string; muscle_groups_worked: string[] }[]
): { name: string; equipment: string; muscle_groups_worked: string[] } | null => {
  const lowerName = name.toLowerCase().trim();

  // Try exact match first
  for (const ex of knownExercises) {
    if (ex.name.toLowerCase() === lowerName) {
      return ex;
    }
  }

  // Try contains match
  for (const ex of knownExercises) {
    const exLower = ex.name.toLowerCase();
    if (exLower.includes(lowerName) || lowerName.includes(exLower)) {
      return ex;
    }
  }
  
  // Try word-based fuzzy match
  const nameWords = lowerName.split(/\s+/).filter(w => w.length > 2);
  for (const ex of knownExercises) {
    const exWords = ex.name.toLowerCase().split(/\s+/);
    const matchCount = nameWords.filter(w => 
      exWords.some(ew => ew.includes(w) || w.includes(ew))
    ).length;
    if (matchCount >= Math.ceil(nameWords.length * 0.6)) {
      return ex;
    }
  }
  
  return null;
};

/**
 * Safety Net: Restore exercises that were dropped but not explicitly removed
 */
export const restoreDroppedExercises = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  request: string,
  targetedExercises?: string[]
): WorkoutQueueItem[] => {
  const changeTypes = detectRequestedChangeType(request);
  const isRemovalRequest = changeTypes.includes('remove');
  
  // Use provided targetedExercises if available, otherwise extract from request
  const targetExercises = isRemovalRequest 
    ? (targetedExercises && targetedExercises.length > 0 
        ? targetedExercises 
        : extractTargetExercises(request, originalQueue))
    : [];
  
  const repairedQueue: WorkoutQueueItem[] = [];
  
  for (let i = 0; i < originalQueue.length; i++) {
    const originalItem = originalQueue[i];
    const parsedItem = parsedQueue[i];
    
    if (!parsedItem) {
      // Entire queue item was dropped - restore it
      console.log(`[REPAIR] Restoring dropped queue item Q${i}`);
      repairedQueue.push({ ...originalItem });
      continue;
    }
    
    // Build a map of parsed exercises by name
    const parsedExerciseMap = new Map<string, ProgramExercise>();
    for (const ex of parsedItem.exercises) {
      parsedExerciseMap.set(ex.name.toLowerCase(), ex);
    }

    // Check which original exercises are missing
    const restoredExercises: ProgramExercise[] = [...parsedItem.exercises];

    for (const originalEx of originalItem.exercises) {
      const lowerName = originalEx.name.toLowerCase();

      // Check if exercise exists in parsed output
      const existsInParsed =
        parsedExerciseMap.has(lowerName) ||
        parsedItem.exercises.some(pe =>
          pe.name.toLowerCase() === lowerName ||
          getSimilarity(pe.name, originalEx.name) > 0.8
        );

      if (!existsInParsed) {
        // Exercise was dropped - check if it was targeted for removal
        const wasTargeted = targetExercises.some(target =>
          target.toLowerCase() === lowerName ||
          getSimilarity(target, originalEx.name) > 0.8 ||
          lowerName.includes(target.toLowerCase()) ||
          target.toLowerCase().includes(lowerName)
        );
        
        if (!wasTargeted && isRemovalRequest) {
          // Exercise was dropped but not targeted - restore it
          console.log(`[REPAIR] Restoring dropped exercise: ${originalEx.name}`);
          restoredExercises.push({ ...originalEx });
        } else if (!isRemovalRequest) {
          // Not a removal request at all - definitely restore it
          console.log(`[REPAIR] Restoring dropped exercise: ${originalEx.name}`);
          restoredExercises.push({ ...originalEx });
        }
      }
    }
    
    repairedQueue.push({
      ...parsedItem,
      exercises: restoredExercises,
    });
  }
  
  return repairedQueue;
};

/**
 * Strict Column Enforcement: Fix changes applied to wrong columns
 */
export const enforceColumnChanges = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  request: string,
  targetedExercises?: string[]
): WorkoutQueueItem[] => {
  const changeTypes = detectRequestedChangeType(request);
  // Use provided targetedExercises if available, otherwise extract from request
  const targetExercises = targetedExercises && targetedExercises.length > 0
    ? targetedExercises
    : extractTargetExercises(request, originalQueue);
  
  // Extract the new value from the request
  const valueMatch = request.match(/to\s+(\d+(?:\.\d+)?)/i);
  const newValue = valueMatch ? valueMatch[1] : null;
  
  if (!newValue || changeTypes.includes('unknown') || changeTypes.includes('remove') || changeTypes.includes('add')) {
    return parsedQueue; // Can't enforce without knowing the intended value
  }
  
  const repairedQueue: WorkoutQueueItem[] = [];
  
  for (let i = 0; i < parsedQueue.length; i++) {
    const parsedItem = parsedQueue[i];
    const originalItem = originalQueue[i];
    
    if (!parsedItem || !originalItem) {
      repairedQueue.push(parsedItem || originalItem);
      continue;
    }
    
    const repairedExercises: ProgramExercise[] = [];
    
    for (const parsedEx of parsedItem.exercises) {
      const originalEx = originalItem.exercises.find(
        oe => oe.name.toLowerCase() === parsedEx.name.toLowerCase() ||
              getSimilarity(oe.name, parsedEx.name) > 0.8
      );

      if (!originalEx) {
        repairedExercises.push(parsedEx);
        continue;
      }

      // Check if this exercise was targeted
      const isTargeted = targetExercises.some(target =>
        target.toLowerCase() === originalEx.name.toLowerCase() ||
        getSimilarity(target, originalEx.name) > 0.8
      );
      
      if (!isTargeted) {
        // Not targeted - should preserve original values
        // But only fix if LLM made unwanted changes
        const repairedEx = { ...parsedEx };
        
        // If weight changed but we're not changing weight, restore it
        if (!changeTypes.includes('weight') && parsedEx.weight !== originalEx.weight) {
          console.log(`[REPAIR] Restoring weight for ${originalEx.name}: ${parsedEx.weight} -> ${originalEx.weight}`);
          repairedEx.weight = originalEx.weight;
        }
        
        // If reps changed but we're not changing reps, restore it
        if (!changeTypes.includes('reps') && parsedEx.reps !== originalEx.reps) {
          console.log(`[REPAIR] Restoring reps for ${originalEx.name}: ${parsedEx.reps} -> ${originalEx.reps}`);
          repairedEx.reps = originalEx.reps;
        }
        
        // If sets changed but we're not changing sets, restore it
        if (!changeTypes.includes('sets') && parsedEx.sets !== originalEx.sets) {
          console.log(`[REPAIR] Restoring sets for ${originalEx.name}: ${parsedEx.sets} -> ${originalEx.sets}`);
          repairedEx.sets = originalEx.sets;
        }
        
        repairedExercises.push(repairedEx);
      } else {
        // This exercise WAS targeted - ensure the change is in the right column
        const repairedEx = { ...parsedEx };
        
        if (changeTypes.includes('weight') && !changeTypes.includes('reps') && !changeTypes.includes('sets')) {
          // Weight-only change: restore reps and sets if they changed
          if (parsedEx.reps !== originalEx.reps) {
            console.log(`[REPAIR] Restoring reps for targeted ${originalEx.name}: ${parsedEx.reps} -> ${originalEx.reps}`);
            repairedEx.reps = originalEx.reps;
          }
          if (parsedEx.sets !== originalEx.sets) {
            console.log(`[REPAIR] Restoring sets for targeted ${originalEx.name}: ${parsedEx.sets} -> ${originalEx.sets}`);
            repairedEx.sets = originalEx.sets;
          }
          // Ensure weight actually changed
          if (parsedEx.weight === originalEx.weight && newValue) {
            console.log(`[REPAIR] Applying weight change for ${originalEx.name}: ${originalEx.weight} -> ${newValue}`);
            repairedEx.weight = newValue;
          }
        }
        
        if (changeTypes.includes('reps') && !changeTypes.includes('weight') && !changeTypes.includes('sets')) {
          // Reps-only change: restore weight and sets if they changed
          if (parsedEx.weight !== originalEx.weight) {
            console.log(`[REPAIR] Restoring weight for targeted ${originalEx.name}: ${parsedEx.weight} -> ${originalEx.weight}`);
            repairedEx.weight = originalEx.weight;
          }
          if (parsedEx.sets !== originalEx.sets) {
            console.log(`[REPAIR] Restoring sets for targeted ${originalEx.name}: ${parsedEx.sets} -> ${originalEx.sets}`);
            repairedEx.sets = originalEx.sets;
          }
          // Ensure reps actually changed
          if (parsedEx.reps === originalEx.reps && newValue) {
            console.log(`[REPAIR] Applying reps change for ${originalEx.name}: ${originalEx.reps} -> ${newValue}`);
            repairedEx.reps = newValue;
          }
        }
        
        if (changeTypes.includes('sets') && !changeTypes.includes('weight') && !changeTypes.includes('reps')) {
          // Sets-only change: restore weight and reps if they changed
          if (parsedEx.weight !== originalEx.weight) {
            console.log(`[REPAIR] Restoring weight for targeted ${originalEx.name}: ${parsedEx.weight} -> ${originalEx.weight}`);
            repairedEx.weight = originalEx.weight;
          }
          if (parsedEx.reps !== originalEx.reps) {
            console.log(`[REPAIR] Restoring reps for targeted ${originalEx.name}: ${parsedEx.reps} -> ${originalEx.reps}`);
            repairedEx.reps = originalEx.reps;
          }
          // Ensure sets actually changed
          if (parsedEx.sets === originalEx.sets && newValue) {
            console.log(`[REPAIR] Applying sets change for ${originalEx.name}: ${originalEx.sets} -> ${newValue}`);
            repairedEx.sets = newValue;
          }
        }
        
        repairedExercises.push(repairedEx);
      }
    }
    
    repairedQueue.push({
      ...parsedItem,
      exercises: repairedExercises,
    });
  }
  
  return repairedQueue;
};

/**
 * Main Queue Repair Function
 * Combines all repair strategies to fix LLM output issues
 */
export const repairQueue = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  request: string,
  targetedExercises?: string[]
): WorkoutQueueItem[] => {
  console.log('[REPAIR] Starting queue repair...');
  
  // Step 1: Restore dropped exercises (Safety Net)
  let repairedQueue = restoreDroppedExercises(originalQueue, parsedQueue, request, targetedExercises);
  
  // Step 2: Enforce correct column changes
  repairedQueue = enforceColumnChanges(originalQueue, repairedQueue, request, targetedExercises);
  
  console.log('[REPAIR] Queue repair complete');
  return repairedQueue;
};

// =============================================================================
// PROPOSED CHANGES TYPES
// =============================================================================

export interface ProposedChanges {
  variantChanges: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    oldVariant: string;
    newVariant: string;
  }>;
  weightChanges: Array<{
  queueItemId: string;
    queueItemName: string;
    dayNumber: number;
  exerciseName: string;
    oldWeight: string;
  newWeight: string;
  }>;
  repsChanges: Array<{
  queueItemId: string;
    queueItemName: string;
    dayNumber: number;
  exerciseName: string;
    oldReps: string;
    newReps: string;
  }>;
  setsChanges: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    oldSets: string;
    newSets: string;
  }>;
  removals: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    muscleGroup: string;
  }>;
  additions: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    weight: string;
    reps: string;
    sets: string;
    equipment: string;
    muscle_groups_worked: string[];
  }>;
  swaps: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    oldExerciseName: string;
    newExerciseName: string;
  }>;
}

// =============================================================================
// QUEUE COMPARISON
// =============================================================================

export interface QueueDifference {
  type: 'variant_change' | 'weight_change' | 'reps_change' | 'sets_change' | 'removed' | 'added' | 'modified' | 'exercise_swap';
  queueItemId: string;
  queueItemName: string;
  dayNumber: number;
  exerciseName?: string;
  oldExercise?: ProgramExercise;
  newExercise?: ProgramExercise;
  oldWeight?: string;
  newWeight?: string;
  oldReps?: string;
  newReps?: string;
  oldSets?: string;
  newSets?: string;
  newExerciseName?: string;
  details?: string;
}

export const compareWorkoutQueues = (
  oldQueue: WorkoutQueueItem[],
  newQueue: WorkoutQueueItem[]
): QueueDifference[] => {
  const differences: QueueDifference[] = [];
  const oldQueueMap = buildQueueItemIdentityMap(oldQueue);
  const newQueueMap = buildQueueItemIdentityMap(newQueue);

  for (const [queueItemIdentity, oldItem] of oldQueueMap) {
    const newItem = newQueueMap.get(queueItemIdentity);

    if (!newItem) {
      for (const exercise of oldItem.exercises) {
        differences.push({
          type: 'removed',
          queueItemId: oldItem.id,
          queueItemName: oldItem.programName,
          dayNumber: oldItem.dayNumber,
          exerciseName: withVariantDisplayName(exercise),
          oldExercise: exercise,
        });
      }
      continue;
    }

    const newQueueHasMissingInstanceIds = newItem.exercises.some((exercise) => !exercise.exerciseInstanceId);
    const oldExercisesMap = buildExerciseIdentityMap(oldItem.exercises, {
      includeInstanceId: !newQueueHasMissingInstanceIds,
    });
    const newExercisesMap = buildExerciseIdentityMap(newItem.exercises, {
      includeInstanceId: !newQueueHasMissingInstanceIds,
    });

    for (const [exerciseIdentity, { exercise: oldExercise }] of oldExercisesMap) {
      if (!newExercisesMap.has(exerciseIdentity)) {
        differences.push({
          type: 'removed',
          queueItemId: oldItem.id,
          queueItemName: oldItem.programName,
          dayNumber: oldItem.dayNumber,
          exerciseName: withVariantDisplayName(oldExercise),
          oldExercise,
        });
      }
    }

    for (const [exerciseIdentity, { exercise: newExercise }] of newExercisesMap) {
      const oldExerciseData = oldExercisesMap.get(exerciseIdentity);
      const exerciseName = withVariantDisplayName(newExercise);

      if (!oldExerciseData) {
        differences.push({
          type: 'added',
          queueItemId: oldItem.id,
          queueItemName: oldItem.programName,
          dayNumber: oldItem.dayNumber,
          exerciseName,
          newExercise,
        });
      } else {
        const oldExercise = oldExerciseData.exercise;

        if (getExerciseVariantLabel(oldExercise.variant) !== getExerciseVariantLabel(newExercise.variant)) {
          differences.push({
            type: 'variant_change',
            queueItemId: oldItem.id,
            queueItemName: oldItem.programName,
            dayNumber: oldItem.dayNumber,
            exerciseName,
            oldExercise,
            newExercise,
            details: `${getExerciseVariantLabel(oldExercise.variant)} -> ${getExerciseVariantLabel(newExercise.variant)}`,
          });
        }

        if (oldExercise.weight !== newExercise.weight) {
          differences.push({
            type: 'weight_change',
            queueItemId: oldItem.id,
            queueItemName: oldItem.programName,
            dayNumber: oldItem.dayNumber,
            exerciseName,
            oldWeight: oldExercise.weight,
            newWeight: newExercise.weight,
            oldExercise,
            newExercise,
          });
        }

        if (oldExercise.reps !== newExercise.reps) {
          differences.push({
            type: 'reps_change',
            queueItemId: oldItem.id,
            queueItemName: oldItem.programName,
            dayNumber: oldItem.dayNumber,
            exerciseName,
            oldReps: oldExercise.reps,
            newReps: newExercise.reps,
            oldExercise,
            newExercise,
          });
        }

        if (oldExercise.sets !== newExercise.sets) {
          differences.push({
            type: 'sets_change',
            queueItemId: oldItem.id,
            queueItemName: oldItem.programName,
            dayNumber: oldItem.dayNumber,
            exerciseName,
            oldSets: oldExercise.sets,
            newSets: newExercise.sets,
            oldExercise,
            newExercise,
          });
        }
      }
    }
  }

  for (const [queueItemIdentity, newItem] of newQueueMap) {
    if (!oldQueueMap.has(queueItemIdentity)) {
      for (const exercise of newItem.exercises) {
        differences.push({
          type: 'added',
          queueItemId: newItem.id,
          queueItemName: newItem.programName,
          dayNumber: newItem.dayNumber,
          exerciseName: withVariantDisplayName(exercise),
          newExercise: exercise,
        });
      }
    }
  }

  return differences;
};

export const differencesToProposedChanges = (differences: QueueDifference[]): ProposedChanges => {
  const variantChanges: ProposedChanges['variantChanges'] = [];
  const weightChanges: ProposedChanges['weightChanges'] = [];
  const repsChanges: ProposedChanges['repsChanges'] = [];
  const setsChanges: ProposedChanges['setsChanges'] = [];
  const removals: ProposedChanges['removals'] = [];
  const additions: ProposedChanges['additions'] = [];
  const swaps: ProposedChanges['swaps'] = [];
  
  for (const diff of differences) {
    switch (diff.type) {
      case 'variant_change':
        variantChanges.push({
          queueItemId: diff.queueItemId,
          queueItemName: diff.queueItemName,
          dayNumber: diff.dayNumber,
          exerciseName: diff.exerciseName || '',
          oldVariant: getExerciseVariantLabel(diff.oldExercise?.variant),
          newVariant: getExerciseVariantLabel(diff.newExercise?.variant),
        });
        break;

      case 'weight_change':
        weightChanges.push({
          queueItemId: diff.queueItemId,
          queueItemName: diff.queueItemName,
          dayNumber: diff.dayNumber,
          exerciseName: diff.exerciseName || '',
          oldWeight: diff.oldWeight || '',
          newWeight: diff.newWeight || '',
        });
        break;
      
      case 'reps_change':
        repsChanges.push({
          queueItemId: diff.queueItemId,
          queueItemName: diff.queueItemName,
          dayNumber: diff.dayNumber,
          exerciseName: diff.exerciseName || '',
          oldReps: diff.oldReps || '',
          newReps: diff.newReps || '',
        });
        break;

      case 'sets_change':
        setsChanges.push({
          queueItemId: diff.queueItemId,
          queueItemName: diff.queueItemName,
          dayNumber: diff.dayNumber,
          exerciseName: diff.exerciseName || '',
          oldSets: diff.oldSets || '',
          newSets: diff.newSets || '',
        });
        break;

      case 'removed':
        removals.push({
          queueItemId: diff.queueItemId,
          queueItemName: diff.queueItemName,
          dayNumber: diff.dayNumber,
          exerciseName: diff.exerciseName || '',
          muscleGroup: diff.oldExercise?.muscle_groups_worked?.[0] || 'unknown',
        });
        break;
      
      case 'added':
        if (diff.newExercise) {
          additions.push({
            queueItemId: diff.queueItemId,
            queueItemName: diff.queueItemName,
            dayNumber: diff.dayNumber,
            exerciseName: diff.exerciseName || '',
            weight: diff.newExercise.weight,
            reps: diff.newExercise.reps,
            sets: diff.newExercise.sets,
            equipment: diff.newExercise.equipment,
            muscle_groups_worked: diff.newExercise.muscle_groups_worked,
          });
        }
        break;
      
      case 'exercise_swap':
        if (diff.exerciseName && diff.newExerciseName) {
          swaps.push({
            queueItemId: diff.queueItemId,
            queueItemName: diff.queueItemName,
            dayNumber: diff.dayNumber,
            oldExerciseName: diff.exerciseName,
            newExerciseName: diff.newExerciseName,
          });
        }
        break;
    }
  }

  return { variantChanges, weightChanges, repsChanges, setsChanges, removals, additions, swaps };
};

// =============================================================================
// VALIDATION
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

export interface QueueStructureValidationResult {
  valid: boolean;
  errors: string[];
}

export const validateQueueStructure = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[]
): QueueStructureValidationResult => {
  const errors: string[] = [];

  if (originalQueue.length > 0 && parsedQueue.length !== originalQueue.length) {
    errors.push(
      `Expected ${originalQueue.length} queue item(s), but received ${parsedQueue.length}.`
    );
  }

  const originalIds = new Set(originalQueue.map((item) => item.id));
  const originalById = new Map(originalQueue.map((item) => [item.id, item]));
  const seenIds = new Set<string>();
  const seenPositions = new Set<number>();

  for (const item of parsedQueue) {
    if (!item.id) {
      errors.push('Parsed queue contains an item with no id.');
      continue;
    }

    if (seenIds.has(item.id)) {
      errors.push(`Duplicate queue item id detected: ${item.id}.`);
    }
    seenIds.add(item.id);

    if (originalQueue.length > 0 && !originalIds.has(item.id)) {
      errors.push(`Parsed queue contains unknown queue item id: ${item.id}.`);
    }

    if (!Number.isInteger(item.position) || item.position < 0) {
      errors.push(`Queue item ${item.id} has invalid position: ${item.position}.`);
    } else if (seenPositions.has(item.position)) {
      errors.push(`Duplicate queue position detected: ${item.position}.`);
    } else {
      seenPositions.add(item.position);
    }

    if (!Array.isArray(item.exercises) || item.exercises.length === 0) {
      errors.push(`Queue item ${item.id} has no exercises.`);
    }

    const originalItem = originalById.get(item.id);
    if (originalItem && item.programId !== originalItem.programId) {
      errors.push(`Queue item ${item.id} changed program unexpectedly.`);
    }
  }

  if (originalQueue.length > 0) {
    for (const originalItem of originalQueue) {
      if (!seenIds.has(originalItem.id)) {
        errors.push(`Missing queue item: ${originalItem.id}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate that the proposed changes match what was requested
 * Returns warnings for unexpected additions/removals
 */
export const validateChanges = (
  userRequest: string,
  differences: QueueDifference[]
): ValidationResult => {
  const warnings: string[] = [];
  const requestLower = userRequest.toLowerCase();
  const injuryIntent = inferInjuryIntent(requestLower);
  const injuryRemovalAllowed =
    injuryIntent.hasInjuryContext &&
    (injuryIntent.severity === 'moderate' || injuryIntent.severity === 'severe');


  // Check for unexpected variant changes
  const mentionsVariant =
    requestLower.includes('variant') ||
    requestLower.includes('grip') ||
    requestLower.includes('incline') ||
    requestLower.includes('decline') ||
    requestLower.includes('seated') ||
    requestLower.includes('standing');

  const removals = differences.filter((difference) => difference.type === 'removed');
  const additions = differences.filter((difference) => difference.type === 'added');

  const variantOnlyPairKey = (difference: QueueDifference): string | null => {
    const exercise = difference.oldExercise ?? difference.newExercise;
    const baseName = normaliseText(exercise?.name ?? difference.exerciseName ?? '');
    if (!baseName) return null;

    const instanceId = exercise?.exerciseInstanceId ?? null;
    const queueItemId = difference.queueItemId;

    return instanceId
      ? `${queueItemId}:instance:${instanceId}`
      : `${queueItemId}:name:${baseName}`;
  };

  const consumeVariantOnlyPairs = (): {
    remainingRemovals: QueueDifference[];
    remainingAdditions: QueueDifference[];
  } => {
    if (!mentionsVariant) {
      return {
        remainingRemovals: removals,
        remainingAdditions: additions,
      };
    }

    const additionBuckets = new Map<string, QueueDifference[]>();
    for (const addition of additions) {
      const key = variantOnlyPairKey(addition);
      if (!key) continue;
      const bucket = additionBuckets.get(key) ?? [];
      bucket.push(addition);
      additionBuckets.set(key, bucket);
    }

    const remainingRemovals: QueueDifference[] = [];

    for (const removal of removals) {
      const key = variantOnlyPairKey(removal);
      if (!key) {
        remainingRemovals.push(removal);
        continue;
      }

      const matchingBucket = additionBuckets.get(key);
      if (!matchingBucket || matchingBucket.length === 0) {
        remainingRemovals.push(removal);
        continue;
      }

      matchingBucket.shift();
    }

    const remainingAdditions = Array.from(additionBuckets.values()).flat();

    return { remainingRemovals, remainingAdditions };
  };

  const { remainingRemovals, remainingAdditions } = consumeVariantOnlyPairs();

  // Check for unexpected removals (if user did not request remove-like action)
  if (!includesAnyKeyword(requestLower, REMOVE_REQUEST_KEYWORDS) && !injuryRemovalAllowed) {
    if (remainingRemovals.length > 0) {
      const removedNames = remainingRemovals.map((removal) => removal.exerciseName).join(', ');
      warnings.push(`Unexpected removal(s): ${removedNames}. These exercises were removed but you didn't request removal.`);
    }
  }

  if (!mentionsVariant) {
    const variantChanges = differences.filter(difference => difference.type === 'variant_change');
    if (variantChanges.length > 0) {
      const variantNames = variantChanges.map(change => change.exerciseName).join(', ');
      warnings.push(`Unexpected variant change(s): ${variantNames}. Variants were changed but you didn't request variant updates.`);
    }
  }

  // Check for unexpected additions (if user did not request add-like action)
  if (!includesAnyKeyword(requestLower, ADD_REQUEST_KEYWORDS)) {
    if (remainingAdditions.length > 0) {
      const addedNames = remainingAdditions.map((addition) => addition.exerciseName).join(', ');
      warnings.push(`Unexpected addition(s): ${addedNames}. These exercises were added but you didn't request addition.`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
};

export interface SemanticEvaluationResult {
  passed: boolean;
  reason?: string;
}

export interface TestPromptCoverageInput {
  type: string;
  prompt: string;
}

export type TestPromptCoverageStatus =
  | 'covered'
  | 'missing_targets'
  | 'missing_variant_capability';

export interface TestPromptCoverageResult {
  type: string;
  prompt: string;
  status: TestPromptCoverageStatus;
  targetedExercises: string[];
  missingTargets?: string[];
  missingVariantTargets?: string[];
}

export interface TestPromptCoverageReport {
  allCovered: boolean;
  results: TestPromptCoverageResult[];
}

const inferRequestedVariantFromPrompt = (prompt: string): string | null => {
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

export const analyzeTestPromptQueueCoverage = (
  prompts: TestPromptCoverageInput[],
  queue: WorkoutQueueItem[]
): TestPromptCoverageReport => {
  const results: TestPromptCoverageResult[] = [];

  for (const promptCase of prompts) {
    const targetedRefs = extractTargetExerciseRefs(promptCase.prompt, queue);
    const targetedExercises = targetedRefs.map((ref) => ref.displayName);

    if (targetedRefs.length === 0) {
      results.push({
        type: promptCase.type,
        prompt: promptCase.prompt,
        status: 'missing_targets',
        targetedExercises,
        missingTargets: [promptCase.prompt],
      });
      continue;
    }

    const lowerType = promptCase.type.toLowerCase();
    const lowerPrompt = promptCase.prompt.toLowerCase();
    const isVariantPrompt =
      lowerType.includes('variant') ||
      lowerPrompt.includes('variant') ||
      lowerPrompt.includes('grip') ||
      lowerPrompt.includes('incline') ||
      lowerPrompt.includes('decline') ||
      lowerPrompt.includes('wrist-friendly');

    if (isVariantPrompt) {
      const requestedVariant = inferRequestedVariantFromPrompt(promptCase.prompt);
      const parsedRequestedVariant = requestedVariant ? parseVariantLabel(requestedVariant) : null;

      if (parsedRequestedVariant) {
        const missingVariantTargets: string[] = [];

        for (const targetRef of targetedRefs) {
          const queueItem = queue.find((item) => item.id === targetRef.queueItemId);
          const queueExercise =
            (targetRef.exerciseInstanceId
              ? queue
                  .flatMap((item) => item.exercises)
                  .find((exercise) => exercise.exerciseInstanceId === targetRef.exerciseInstanceId)
              : undefined) ??
            (queueItem ? queueItem.exercises[targetRef.exerciseIndex] : undefined);
          const exerciseData = findExerciseByName(targetRef.name);
          const variantValidationSource = getVariantValidationSource(exerciseData, queueExercise);

          if (!isVariantValidForExercise(variantValidationSource, parsedRequestedVariant)) {
            missingVariantTargets.push(targetRef.displayName);
          }
        }

        if (missingVariantTargets.length > 0) {
          results.push({
            type: promptCase.type,
            prompt: promptCase.prompt,
            status: 'missing_variant_capability',
            targetedExercises,
            missingVariantTargets,
          });
          continue;
        }
      }
    }

    results.push({
      type: promptCase.type,
      prompt: promptCase.prompt,
      status: 'covered',
      targetedExercises,
    });
  }

  return {
    allCovered: results.every((result) => result.status === 'covered'),
    results,
  };
};

const NUMERIC_CHANGE_DIFF_TYPES: QueueDifference['type'][] = [
  'weight_change',
  'reps_change',
  'sets_change',
];

const getExerciseFromTargetRef = (
  queue: WorkoutQueueItem[],
  targetRef: TargetedExerciseRef
): ProgramExercise | undefined => {
  const queueItem = queue.find((item) => item.id === targetRef.queueItemId);
  return (
    (targetRef.exerciseInstanceId
      ? queue
          .flatMap((item) => item.exercises)
          .find((exercise) => exercise.exerciseInstanceId === targetRef.exerciseInstanceId)
      : undefined) ?? (queueItem ? queueItem.exercises[targetRef.exerciseIndex] : undefined)
  );
};

type NumericAttribute = 'weight' | 'reps' | 'sets';

type TargetNumericIntent = Partial<Record<NumericAttribute, string>>;

const inferTargetedNumericIntent = (
  request: string,
  targetedExerciseRefs: TargetedExerciseRef[],
  changeTypes: ChangeType[]
): Map<string, TargetNumericIntent> => {
  const intentMap = new Map<string, TargetNumericIntent>();
  const loweredRequest = normaliseText(request);
  const requestHasSingleAttribute =
    (changeTypes.includes('weight') ? 1 : 0) +
      (changeTypes.includes('reps') ? 1 : 0) +
      (changeTypes.includes('sets') ? 1 : 0) ===
    1;

  const getTargetKey = (targetRef: TargetedExerciseRef): string =>
    targetRef.exerciseInstanceId ?? `${targetRef.queueItemId}:${targetRef.exerciseIndex}:${normaliseText(targetRef.name)}`;

  const genericWords = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'exercise', 'exercises']);
  const clauses = loweredRequest.split(/(?:,|\band\b|\bbut\b|\balso\b)/i).map((part) => part.trim());
  let lastMatchedTargets: TargetedExerciseRef[] = [];

  for (const clause of clauses) {
    const hasWeightSignal = /\b(?:kg|weight|kilos?)\b/.test(clause);
    const hasRepsSignal = /\breps?\b/.test(clause);
    const hasSetsSignal = /\bsets?\b/.test(clause);

    const inferredAttribute: NumericAttribute | null = hasWeightSignal
      ? 'weight'
      : hasRepsSignal
        ? 'reps'
        : hasSetsSignal
          ? 'sets'
          : requestHasSingleAttribute
            ? (changeTypes.includes('weight')
                ? 'weight'
                : changeTypes.includes('reps')
                  ? 'reps'
                  : changeTypes.includes('sets')
                    ? 'sets'
                    : null)
            : null;

    if (!inferredAttribute) continue;

    const destinationMatchByAttribute: Record<NumericAttribute, RegExp[]> = {
      reps: [
        /reps?\s*from\s*\d+\s*to\s*(\d+)/i,
        /from\s*\d+\s*to\s*(\d+)\s*reps?/i,
      ],
      sets: [
        /sets?\s*from\s*\d+\s*to\s*(\d+)/i,
        /from\s*\d+\s*to\s*(\d+)\s*sets?/i,
      ],
      // BUG FIX: Original patterns used (?:kg)? before "to" which could fail to bind
      // the "kg" token in some string positions, causing the regex to miss "from X to Y"
      // and fall back to the first number in the clause (the source value).
      // E.g. "change weight from 80kg to 100" would match "80" instead of "100".
      // Fix: explicit "kg to" variants checked first.
      weight: [
        /weight\s*from\s*\d+(?:\.\d+)?\s*kg\s*to\s*(\d+(?:\.\d+)?)/i,
        /weight\s*from\s*\d+(?:\.\d+)?\s*to\s*(\d+(?:\.\d+)?)/i,
        /from\s*\d+(?:\.\d+)?\s*kg\s*to\s*(\d+(?:\.\d+)?)(?:\s*kg)?\s*weight/i,
        /from\s*\d+(?:\.\d+)?\s*to\s*(\d+(?:\.\d+)?)(?:\s*kg)?\s*weight/i,
      ],
    };

    const destinationMatch = destinationMatchByAttribute[inferredAttribute]
      .map((pattern) => clause.match(pattern))
      .find(Boolean);
    const valueToApply = destinationMatch?.[1] ?? clause.match(/(\d+(?:\.\d+)?)/)?.[1];

    if (!valueToApply) continue;

    let clauseMatchedTarget = false;
    const matchedInThisClause: TargetedExerciseRef[] = [];

    for (const targetRef of targetedExerciseRefs) {
      const fullName = normaliseText(targetRef.name);
      const displayName = normaliseText(targetRef.displayName);
      const significantWords = displayName
        .split(/\s+/)
        .filter((word) => word.length > 2 && !genericWords.has(word));

      const matchesClause =
        clause.includes(fullName) ||
        clause.includes(displayName) ||
        significantWords.some((word) => clause.includes(word));

      if (!matchesClause) continue;

      clauseMatchedTarget = true;
      matchedInThisClause.push(targetRef);
      const targetKey = getTargetKey(targetRef);
      const existingIntent = intentMap.get(targetKey) ?? {};
      intentMap.set(targetKey, {
        ...existingIntent,
        [inferredAttribute]: valueToApply,
      });
    }

    if (clauseMatchedTarget) {
      lastMatchedTargets = matchedInThisClause;
    } else if (lastMatchedTargets.length > 0 && requestHasSingleAttribute) {
      // Continuation clause: carry matched targets forward from earlier clause.
      // Handles "exercise X value1, value2, and value3" patterns.
      for (const targetRef of lastMatchedTargets) {
        const targetKey = getTargetKey(targetRef);
        const existingIntent = intentMap.get(targetKey) ?? {};
        intentMap.set(targetKey, {
          ...existingIntent,
          [inferredAttribute]: valueToApply,
        });
      }
    } else if (!clauseMatchedTarget && requestHasSingleAttribute) {
      // Muscle-group broadcast: no exercise name in clause, broadcast to all targets.
      for (const targetRef of targetedExerciseRefs) {
        const targetKey = getTargetKey(targetRef);
        const existingIntent = intentMap.get(targetKey) ?? {};
        intentMap.set(targetKey, {
          ...existingIntent,
          [inferredAttribute]: valueToApply,
        });
      }
    }
  }

  return intentMap;
};

export const evaluatePromptIntentOutcome = (
  request: string,
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  targetedExerciseRefs: TargetedExerciseRef[]
): SemanticEvaluationResult => {
  const changeTypes = detectRequestedChangeType(request);
  const differences = compareWorkoutQueues(originalQueue, parsedQueue);
  const requestLower = normaliseText(request);
  const shouldRequireDuplicateAdd =
    changeTypes.includes('add') && /\b(?:again|another|duplicate|extra)\b/i.test(request);

  if (differences.length === 0) {
    return {
      passed: false,
      reason: shouldRequireDuplicateAdd
        ? 'Intent semantic failed: add request did not create a duplicate targeted exercise.'
        : 'Intent semantic failed: no queue differences detected for requested change.',
    };
  }

  if (targetedExerciseRefs.length === 0) {
    return {
      passed: false,
      reason: 'Intent semantic failed: no targeted exercises found for request.',
    };
  }

  const numericChangeRequested =
    changeTypes.includes('weight') || changeTypes.includes('reps') || changeTypes.includes('sets');

  const targetKeys = new Set(
    targetedExerciseRefs.map((targetRef) =>
      targetRef.exerciseInstanceId ?? `${targetRef.queueItemId}:${targetRef.exerciseIndex}:${normaliseText(targetRef.name)}`
    )
  );

  const toExerciseKey = (
    queueItemId: string,
    exercise: ProgramExercise | undefined,
    fallbackName: string | undefined
  ): string | null => {
    if (exercise?.exerciseInstanceId) return exercise.exerciseInstanceId;
    const baseName = exercise?.name ?? fallbackName;
    if (!baseName) return null;
    return `${queueItemId}:-1:${normaliseText(baseName)}`;
  };

  if (numericChangeRequested) {
    const numericIntents = inferTargetedNumericIntent(request, targetedExerciseRefs, changeTypes);

    for (const targetRef of targetedExerciseRefs) {
      const targetKey =
        targetRef.exerciseInstanceId ?? `${targetRef.queueItemId}:${targetRef.exerciseIndex}:${normaliseText(targetRef.name)}`;
      const originalExercise = getExerciseFromTargetRef(originalQueue, targetRef);
      const parsedExercise = getExerciseFromTargetRef(parsedQueue, targetRef);

      if (!originalExercise || !parsedExercise) {
        return {
          passed: false,
          reason: `Intent semantic failed: missing targeted exercise ${targetRef.displayName} after parse.`,
        };
      }

      const requestedIntent = numericIntents.get(targetKey);

      const ensureAttribute = (attribute: NumericAttribute, label: string): SemanticEvaluationResult | null => {
        const expected = requestedIntent?.[attribute];
        if (expected) {
          if (parsedExercise[attribute] !== expected) {
            return {
              passed: false,
              reason: `Intent semantic failed: ${targetRef.displayName} ${label} expected ${expected} but got ${parsedExercise[attribute]}.`,
            };
          }
          return null;
        }

        if (changeTypes.includes(attribute) && parsedExercise[attribute] === originalExercise[attribute]) {
          return {
            passed: false,
            reason: `Intent semantic failed: ${targetRef.displayName} ${label} did not change for requested update.`,
          };
        }

        return null;
      };

      const weightCheck = ensureAttribute('weight', 'weight');
      if (weightCheck) return weightCheck;
      const repsCheck = ensureAttribute('reps', 'reps');
      if (repsCheck) return repsCheck;
      const setsCheck = ensureAttribute('sets', 'sets');
      if (setsCheck) return setsCheck;
    }

    const unrelatedNumericDiff = differences.find((difference) => {
      if (!NUMERIC_CHANGE_DIFF_TYPES.includes(difference.type)) return false;
      const diffKey =
        toExerciseKey(difference.queueItemId, difference.oldExercise, difference.exerciseName) ??
        toExerciseKey(difference.queueItemId, difference.newExercise, difference.exerciseName);
      if (!diffKey) return false;
      if (targetKeys.has(diffKey)) return false;

      if (difference.oldExercise || difference.newExercise) {
        const normalisedName = normaliseText(
          difference.oldExercise?.name ?? difference.newExercise?.name ?? difference.exerciseName ?? ''
        );
        return !targetedExerciseRefs.some(
          (targetRef) =>
            targetRef.queueItemId === difference.queueItemId &&
            normaliseText(targetRef.name) === normalisedName
        );
      }

      return true;
    });

    if (unrelatedNumericDiff) {
      return {
        passed: false,
        reason: `Intent semantic failed: unrelated numeric overwrite detected on ${unrelatedNumericDiff.exerciseName ?? 'unknown exercise'}.`,
      };
    }
  }

  const allOriginalExercises = originalQueue.flatMap((item) => item.exercises);
  const allParsedExercises = parsedQueue.flatMap((item) => item.exercises);
  const uniqueTargetNames = Array.from(new Set(targetedExerciseRefs.map((targetRef) => normaliseText(targetRef.name))));
  const canonicalTargetNames = new Set(
    uniqueTargetNames.map((targetName) => canonicaliseExerciseNameForSemantics(targetName))
  );

  const requestIncludesReplacementCue = /\b(?:replace|swap|switch)\b/.test(requestLower);
  const replacementPairs = differences.filter(
    (difference) => difference.type === 'removed' || difference.type === 'added'
  );
  const isLikelyReplacement =
    requestIncludesReplacementCue &&
    replacementPairs.length >= 2 &&
    replacementPairs.filter((difference) => difference.type === 'removed').length > 0 &&
    replacementPairs.filter((difference) => difference.type === 'added').length > 0;

  if (changeTypes.includes('add') && !isLikelyReplacement) {
    const originalKeysByName = new Map<string, Set<string>>();
    const parsedKeysByName = new Map<string, Set<string>>();

    for (const [queueIndex, queueItem] of originalQueue.entries()) {
      for (const [exerciseIndex, exercise] of queueItem.exercises.entries()) {
        const canonicalName = canonicaliseExerciseNameForSemantics(exercise.name);
        const key =
          exercise.exerciseInstanceId ??
          `${queueItem.id}:${queueIndex}:${exerciseIndex}:${canonicalName}`;
        const bucket = originalKeysByName.get(canonicalName) ?? new Set<string>();
        bucket.add(key);
        originalKeysByName.set(canonicalName, bucket);
      }
    }

    for (const [queueIndex, queueItem] of parsedQueue.entries()) {
      for (const [exerciseIndex, exercise] of queueItem.exercises.entries()) {
        const canonicalName = canonicaliseExerciseNameForSemantics(exercise.name);
        const key =
          exercise.exerciseInstanceId ??
          `${queueItem.id}:${queueIndex}:${exerciseIndex}:${canonicalName}`;
        const bucket = parsedKeysByName.get(canonicalName) ?? new Set<string>();
        bucket.add(key);
        parsedKeysByName.set(canonicalName, bucket);
      }
    }

    for (const targetName of canonicalTargetNames) {
      const originalCount = allOriginalExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;
      const parsedCount = allParsedExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;

      if (parsedCount <= originalCount) {
        const failedTarget = targetedExerciseRefs.find(
          (targetRef) => canonicaliseExerciseNameForSemantics(targetRef.name) === targetName
        );
        return {
          passed: false,
          reason: `Intent semantic failed: add request did not increase count for ${failedTarget?.displayName ?? targetName}.`,
        };
      }

      const originalKeys = originalKeysByName.get(targetName) ?? new Set<string>();
      const parsedKeys = parsedKeysByName.get(targetName) ?? new Set<string>();
      const introducedNewTarget = Array.from(parsedKeys).some((key) => !originalKeys.has(key));

      if (!introducedNewTarget) {
        const failedTarget = targetedExerciseRefs.find(
          (targetRef) => canonicaliseExerciseNameForSemantics(targetRef.name) === targetName
        );
        return {
          passed: false,
          reason: `Intent semantic failed: add request did not create a new instance for ${failedTarget?.displayName ?? targetName}.`,
        };
      }
    }
  }

  if (changeTypes.includes('remove') && !isLikelyReplacement) {
    for (const targetRef of targetedExerciseRefs) {
      if (!targetRef.exerciseInstanceId) {
        continue;
      }

      const instanceStillPresent = parsedQueue.some((queueItem) =>
        queueItem.exercises.some((exercise) => exercise.exerciseInstanceId === targetRef.exerciseInstanceId)
      );

      if (instanceStillPresent) {
        return {
          passed: false,
          reason: `Intent semantic failed: remove request did not remove targeted instance ${targetRef.displayName}.`,
        };
      }
    }

    for (const targetName of canonicalTargetNames) {
      const originalCount = allOriginalExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;
      const parsedCount = allParsedExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;

      if (parsedCount >= originalCount) {
        const failedTarget = targetedExerciseRefs.find(
          (targetRef) => canonicaliseExerciseNameForSemantics(targetRef.name) === targetName
        );
        return {
          passed: false,
          reason: `Intent semantic failed: remove request did not decrease count for ${failedTarget?.displayName ?? targetName}.`,
        };
      }
    }
  }

  if (shouldRequireDuplicateAdd) {
    for (const targetRef of targetedExerciseRefs) {
      const normalisedName = normaliseText(targetRef.name);
      const originalCount = originalQueue
        .flatMap((item) => item.exercises)
        .filter((exercise) => normaliseText(exercise.name) === normalisedName).length;
      const parsedCount = parsedQueue
        .flatMap((item) => item.exercises)
        .filter((exercise) => normaliseText(exercise.name) === normalisedName).length;

      if (parsedCount <= originalCount) {
        return {
          passed: false,
          reason: `Intent semantic failed: add request did not increase count for ${targetRef.displayName}.`,
        };
      }
    }
  }

  return { passed: true };
};

export const evaluateVariantSemanticOutcome = (
  _request: string,
  _originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  targetedExerciseRefs: TargetedExerciseRef[],
  requestedVariant: string
): SemanticEvaluationResult => {
  const expectedVariant = normaliseText(requestedVariant);

  if (!expectedVariant) {
    return {
      passed: false,
      reason: 'Variant semantic failed: missing requested target variant.',
    };
  }

  if (targetedExerciseRefs.length === 0) {
    return {
      passed: false,
      reason: `Variant semantic failed: no targeted exercises provided for variant "${requestedVariant}".`,
    };
  }

  for (const targetRef of targetedExerciseRefs) {
    const queueItem = parsedQueue.find((item) => item.id === targetRef.queueItemId);
    const parsedExercise =
      (targetRef.exerciseInstanceId
        ? parsedQueue
            .flatMap((item) => item.exercises)
            .find((exercise) => exercise.exerciseInstanceId === targetRef.exerciseInstanceId)
        : undefined) ??
      (queueItem ? queueItem.exercises[targetRef.exerciseIndex] : undefined);

    if (!parsedExercise) {
      return {
        passed: false,
        reason: `Variant semantic failed: missing targeted exercise at index ${targetRef.exerciseIndex} in ${targetRef.queueItemId}.`,
      };
    }

    const appliedVariant = normaliseText(getExerciseVariantLabel(parsedExercise.variant));
    if (!appliedVariant.includes(expectedVariant)) {
      return {
        passed: false,
        reason: `Variant semantic failed: requested variant "${requestedVariant}" not applied to ${targetRef.displayName}.`,
      };
    }
  }

  return { passed: true };
};

export const evaluateInjurySemanticOutcome = (
  request: string,
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  affectedExerciseNames: string[]
): SemanticEvaluationResult => {
  const requestLower = normaliseText(request);

  const inferSeverity = (): 'mild' | 'moderate' | 'severe' | null => {
    if (requestLower.includes('severe')) return 'severe';
    if (requestLower.includes('moderate')) return 'moderate';
    if (requestLower.includes('mild')) return 'mild';
    return null;
  };

  const severity = inferSeverity();
  if (!severity) {
    return { passed: true };
  }

  const normaliseAffectedName = (name: string): string => {
    const withoutVariantSuffix = name.replace(/\s*\([^)]*\)\s*$/, '');
    return normaliseText(withoutVariantSuffix);
  };

  const affectedNameSet = new Set(
    affectedExerciseNames
      .map((name) => normaliseAffectedName(name))
      .filter(Boolean)
  );

  if (affectedNameSet.size === 0) {
    return {
      passed: false,
      reason: `Injury semantic failed: ${severity} request missing affected exercise targets.`,
    };
  }

  const parseNumber = (value: string | undefined): number | null => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const originalAffected = originalQueue
    .flatMap((item) => item.exercises)
    .filter((exercise) => affectedNameSet.has(normaliseText(exercise.name)));

  const parsedAffected = parsedQueue
    .flatMap((item) => item.exercises)
    .filter((exercise) => affectedNameSet.has(normaliseText(exercise.name)));

  const allParsedExercises = parsedQueue.flatMap((item) => item.exercises);

  const remainingAffected = allParsedExercises.filter((exercise) =>
    affectedNameSet.has(normaliseText(exercise.name))
  );

  if (severity === 'severe' || severity === 'moderate') {
    if (remainingAffected.length > 0) {
      const remainingList = remainingAffected.map((exercise) => exercise.name).join(', ');
      return {
        passed: false,
        reason: `Injury semantic failed: ${severity} injuries require swap-or-remove coverage for all affected exercises across the entire current queue (remaining: ${remainingList}).`,
      };
    }

    return { passed: true };
  }

  const getParsedMatch = (() => {
    const consumed = new Set<number>();
    return (originalExercise: ProgramExercise): ProgramExercise | undefined => {
      if (originalExercise.exerciseInstanceId) {
        const byInstance = allParsedExercises.find(
          (exercise) => exercise.exerciseInstanceId === originalExercise.exerciseInstanceId
        );
        if (byInstance) {
          return byInstance;
        }
      }

      const originalName = normaliseText(originalExercise.name);
      const index = allParsedExercises.findIndex(
        (exercise, i) => !consumed.has(i) && normaliseText(exercise.name) === originalName
      );

      if (index === -1) {
        return undefined;
      }

      consumed.add(index);
      return allParsedExercises[index];
    };
  })();

  const isLightenedWeightFirst = (originalExercise: ProgramExercise, parsedExercise: ProgramExercise): boolean => {
    const originalWeight = parseNumber(originalExercise.weight);
    const parsedWeight = parseNumber(parsedExercise.weight);

    if (originalWeight !== null && parsedWeight !== null) {
      if (parsedWeight < originalWeight) {
        return true;
      }

      if (parsedWeight > originalWeight) {
        return false;
      }
    }

    const originalReps = parseNumber(originalExercise.reps);
    const parsedReps = parseNumber(parsedExercise.reps);
    if (originalReps !== null && parsedReps !== null && parsedReps < originalReps) {
      return true;
    }

    const originalSets = parseNumber(originalExercise.sets);
    const parsedSets = parseNumber(parsedExercise.sets);
    if (originalSets !== null && parsedSets !== null && parsedSets < originalSets) {
      return true;
    }

    return false;
  };

  if (severity === 'mild') {
    if (originalAffected.length === 0 || parsedAffected.length === 0) {
      return {
        passed: false,
        reason: 'Injury semantic failed: mild injuries require all affected exercises in the entire current queue to be lightened.',
      };
    }

    for (const originalExercise of originalAffected) {
      const parsedMatch = getParsedMatch(originalExercise);
      if (!parsedMatch || !isLightenedWeightFirst(originalExercise, parsedMatch)) {
        return {
          passed: false,
          reason: 'Injury semantic failed: mild injuries require all affected exercises in the entire current queue to be lightened using a weight-first rule.',
        };
      }
    }

    return { passed: true };
  }

  return { passed: true };
};


// =============================================================================
// DATABASE OPERATIONS (using SQLite)
// =============================================================================

/**
 * Load current workout queue from database
 */
/**
 * Merges horizon-scoped queue modifications back into the full queue.
 * The scopedModified queue contains only the first `horizon` items (possibly modified by the LLM).
 * This function replaces the first `horizon` items in fullQueue with scopedModified,
 * preserving any items beyond the horizon unchanged.
 */
export const mergeScopedQueueChanges = (
  fullQueue: WorkoutQueueItem[],
  scopedModified: WorkoutQueueItem[],
  horizon: number
): WorkoutQueueItem[] => {
  if (scopedModified.length === 0) {
    return fullQueue;
  }
  return [...scopedModified, ...fullQueue.slice(horizon)];
};

export const loadWorkoutQueue = async (): Promise<WorkoutQueueItem[]> => {
  try {
    return await db.getWorkoutQueue();
  } catch (error) {
    console.error('Error loading workout queue:', error);
    return [];
  }
};

/**
 * Apply new workout queue to database
 */
export const applyNewWorkoutQueue = async (newQueue: WorkoutQueueItem[]): Promise<boolean> => {
  try {
    const filteredQueue = newQueue.filter((item) => item.exercises.length > 0);
    await db.saveWorkoutQueue(filteredQueue);
    return true;
  } catch (error) {
    console.error('Error applying new workout queue:', error);
    return false;
  }
};
