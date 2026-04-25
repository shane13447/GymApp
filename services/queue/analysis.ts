/**
 * Queue analysis helpers for the operation-contract coach pipeline.
 *
 * This module owns exercise targeting, queue diffing, semantic checks, and
 * horizon merge behavior after validated operations have been applied.
 */
import { JOINT_INJURY_MAP } from '@/constants/joint-injury-map';
import exercisesData from '@/data/exerciseSelection.json';
import { getExerciseVariantLabel } from '@/lib/utils';
import type { ExerciseVariant, ExerciseVariantOption, ProgramExercise, WorkoutQueueItem } from '@/types';

import type {
  ChangeType,
  TargetedExerciseRef,
  ProposedChanges,
  QueueDifference,
  ValidationResult,
  QueueStructureValidationResult,
  SemanticEvaluationResult,
  TestPromptCoverageInput,
  TestPromptCoverageResult,
  TestPromptCoverageReport,
} from '@/services/queue/types';

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

const EXERCISES: ExerciseData[] = exercisesData as ExerciseData[];

const VARIANT_FIELD_ORDER: Array<keyof Omit<ExerciseVariant, 'extras'>> = [
  'angle',
  'grip',
  'posture',
  'laterality',
];

const normaliseText = (value: string): string => value.trim().toLowerCase();

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
/**
 * Resolves a user-provided exercise name against known aliases in the queue.
 * Returns matching exercise names that the alias maps to.
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
  'ache',
  'aching',
  'tender',
  'tweaked',
  'flare up',
  'flare-up',
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

const BROAD_ALIAS_KEYS = new Set(['row', 'rows', 'curl', 'curls', 'bench']);

const aliasAppearsInRequest = (alias: string, requestLower: string): boolean => {
  const aliasRegex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return aliasRegex.test(requestLower);
};

/**
 * Finds matching exercise aliases while suppressing broad aliases when a more specific alias is present.
 *
 * @param requestLower - Lowercase user request
 * @returns Alias dictionary entries ordered from most specific to broadest
 */
const findMatchingExerciseAliases = (requestLower: string): Array<[string, string[]]> => {
  const matchingAliases = Object.entries(EXERCISE_ALIASES)
    .filter(([alias]) => aliasAppearsInRequest(alias, requestLower))
    .sort(([leftAlias], [rightAlias]) => rightAlias.length - leftAlias.length);

  return matchingAliases.filter(([alias]) => {
    if (!BROAD_ALIAS_KEYS.has(alias)) {
      return true;
    }

    return !matchingAliases.some(
      ([specificAlias]) =>
        specificAlias !== alias &&
        specificAlias.length > alias.length &&
        specificAlias.includes(alias)
    );
  });
};

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

/**
 * Detects whether a user request contains injury or pain context.
 *
 * @param request - Raw user request text from the Coach prompt
 * @returns True when queue shape safeguards should permit injury-driven changes
 */
export const isInjuryRelatedRequest = (request: string): boolean =>
  inferInjuryIntent(normaliseText(request)).hasInjuryContext;

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

/**
 * Detects absolute numeric field changes in muscle-group requests.
 *
 * @param request - User request text
 * @returns Numeric attribute and destination value, or null when no absolute field change is present
 */
const detectAbsoluteNumericChange = (
  request: string
): { attribute: 'weight' | 'reps' | 'sets'; value: number } | null => {
  const lowerRequest = request.toLowerCase();

  const weightMatch = lowerRequest.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos|kilograms)\b/);
  if (weightMatch) {
    return { attribute: 'weight', value: Number(weightMatch[1]) };
  }

  const repsMatch =
    lowerRequest.match(/\b(\d+)\s*reps?\b/) ??
    lowerRequest.match(/\breps?\s*(?:to|at)?\s*(\d+)\b/);
  if (repsMatch) {
    return { attribute: 'reps', value: Number(repsMatch[1]) };
  }

  const setsMatch =
    lowerRequest.match(/\b(\d+)\s*sets?\b/) ??
    lowerRequest.match(/\bsets?\s*(?:to|at|of)?\s*(\d+)\b/);
  if (setsMatch) {
    return { attribute: 'sets', value: Number(setsMatch[1]) };
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

  const absoluteChange = detectAbsoluteNumericChange(request);
  if (absoluteChange) {
    const numericChanges = matchingExercises.map((exercise) => {
      const suffix = absoluteChange.attribute === 'weight' ? 'kg' : '';
      return `${exercise.displayName} ${absoluteChange.attribute} to ${absoluteChange.value}${suffix}`;
    });

    const processedRequest = `change ${numericChanges.join(', ')}`;
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

/**
 * Computes a normalised similarity score between two strings (0-1).
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Similarity score where 1 is an exact match and 0 is no overlap
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
 * Detects which queue attributes the request intends to modify.
 *
 * @param request - User request text
 * @returns Requested change categories inferred from the request
 */
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
  const hasNumericFieldIntent =
    types.includes('weight') || types.includes('reps') || types.includes('sets');

  if (includesAnyKeyword(lowerRequest, ADD_REQUEST_KEYWORDS) && !isRelativeNumericAddPhrase && !hasNumericFieldIntent) {
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
  let addedFromSpecificAlias = false;
  for (const [, possibleMatches] of findMatchingExerciseAliases(lowerRequest)) {
    // Find which of the possible matches exist in the queue
    for (const possibleMatch of possibleMatches) {
      const matchingExercises = allExercises.filter(
        (exercise) => exercise.name.toLowerCase() === possibleMatch.toLowerCase()
      );
      for (const exercise of matchingExercises) {
        addExercise(exercise);
        addedFromSpecificAlias = true;
      }
    }
  }

  if (!addedFromSpecificAlias) {
    const broadAliasEntries = Object.entries(EXERCISE_ALIASES).filter(
      ([alias]) => BROAD_ALIAS_KEYS.has(alias) && aliasAppearsInRequest(alias, lowerRequest)
    );

    for (const [, possibleMatches] of broadAliasEntries) {
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
/**
 * Finds the best fuzzy-matching exercise in the known catalog for a given name.
 * Returns the matching catalog entry or null if no close match is found.
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

// =============================================================================
// QUEUE COMPARISON AND SEMANTIC VALIDATION
// =============================================================================
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
// VALIDATION â€” type definitions live in services/queue/types.ts
// =============================================================================

/**
 * Validates that a parsed queue keeps the same item identity and ordering contract.
 *
 * @param originalQueue - Queue snapshot before Coach mutation
 * @param parsedQueue - Queue snapshot after Coach mutation
 * @param options - Validation switches for contextual queue-shape allowances
 * @returns Validation result with structural errors, if any
 */
export const validateQueueStructure = (
  originalQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  options: { allowEmptyExerciseItems?: boolean } = {}
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

    if (!Array.isArray(item.exercises)) {
      errors.push(`Queue item ${item.id} has invalid exercises.`);
    } else if (item.exercises.length === 0 && !options.allowEmptyExerciseItems) {
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
  const injuryQueueShapeChangesAllowed = injuryIntent.hasInjuryContext;

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
  if (!includesAnyKeyword(requestLower, REMOVE_REQUEST_KEYWORDS) && !injuryQueueShapeChangesAllowed) {
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
  // Injury moderate/severe scenarios may swap exercises to safer alternatives.
  if (!includesAnyKeyword(requestLower, ADD_REQUEST_KEYWORDS) && !injuryQueueShapeChangesAllowed) {
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
    // hasWeightSignal: match "kg" even when attached to a number like "50kg"
    const hasWeightSignal = /(?:\d\s*kg|\bkg\b|\bweight\b|\bkilos?\b)/i.test(clause);
    const hasRepsSignal = /\breps?\b/i.test(clause);
    const hasSetsSignal = /\bsets?\b/i.test(clause);

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

    console.log(`[INTENT INFERENCE] Clause: "${clause}", inferredAttribute: ${inferredAttribute}, valueToApply: ${valueToApply}, lastMatchedTargets: ${lastMatchedTargets.length}, requestHasSingleAttribute: ${requestHasSingleAttribute}, targetedExerciseRefs.length: ${targetedExerciseRefs.length}`);

    if (!valueToApply) continue;

    let clauseMatchedTarget = false;
    const matchedInThisClause: TargetedExerciseRef[] = [];

    // Check if this is a muscle-group broadcast pattern (e.g., "every chest exercise")
    // In this case, we should broadcast to all targets rather than matching individual exercises.
    const isMuscleGroupBroadcast = /\b(?:every|all)\s+\w+\s+exercise/i.test(clause);

    for (const targetRef of targetedExerciseRefs) {
      const fullName = normaliseText(targetRef.name);
      const displayName = normaliseText(targetRef.displayName);
      const significantWords = displayName
        .split(/\s+/)
        .filter((word) => word.length > 2 && !genericWords.has(word));

      const matchesClause =
        !isMuscleGroupBroadcast && (
          clause.includes(fullName) ||
          clause.includes(displayName) ||
          significantWords.some((word) => clause.includes(word))
        );

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
    } else if (lastMatchedTargets.length > 0) {
      // Continuation clause: carry matched targets forward from earlier clause.
      // Handles "exercise X value1, value2, and value3" patterns.
      // The clause itself has its own inferredAttribute from explicit signals,
      // so the global attribute count guard is unnecessary here.
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
    if (changeTypes.includes('add') && differences.some((difference) => difference.type === 'added')) {
      return { passed: true };
    }

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

  const targetRefIsPromptMentioned = (targetRef: TargetedExerciseRef): boolean => {
    const targetWords = normaliseText(targetRef.name)
      .split(/\s+/)
      .filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', 'all'].includes(word));
    const promptMentionsTarget = targetWords.filter((word) => requestLower.includes(word));

    return !(
      promptMentionsTarget.length === 0 ||
      (promptMentionsTarget.length === 1 && !requestLower.includes(normaliseText(targetRef.name)))
    );
  };

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
      const matchingTargetRef = targetedExerciseRefs.find(
        (targetRef) => canonicaliseExerciseNameForSemantics(targetRef.name) === targetName
      );

      if (matchingTargetRef && !targetRefIsPromptMentioned(matchingTargetRef)) {
        continue;
      }

      const originalCount = allOriginalExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;
      const parsedCount = allParsedExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;

      if (parsedCount <= originalCount) {
        return {
          passed: false,
          reason: `Intent semantic failed: add request did not increase count for ${matchingTargetRef?.displayName ?? targetName}.`,
        };
      }

      const originalKeys = originalKeysByName.get(targetName) ?? new Set<string>();
      const parsedKeys = parsedKeysByName.get(targetName) ?? new Set<string>();
      const introducedNewTarget = Array.from(parsedKeys).some((key) => !originalKeys.has(key));

      if (!introducedNewTarget) {
        return {
          passed: false,
          reason: `Intent semantic failed: add request did not create a new instance for ${matchingTargetRef?.displayName ?? targetName}.`,
        };
      }
    }
  }

  if (changeTypes.includes('remove') && !isLikelyReplacement) {
    for (const targetRef of targetedExerciseRefs) {
      if (!targetRefIsPromptMentioned(targetRef)) {
        continue;
      }

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
      // Skip targets whose name doesn't appear in the user's prompt.
      // This handles over-broad fuzzy matching (e.g., "fingertip curls" matching "Hammer Curls").
      // We require at least 2 non-generic words OR 1 specific word to match.
      const matchingTargetRef = targetedExerciseRefs.find(
        (targetRef) => canonicaliseExerciseNameForSemantics(targetRef.name) === targetName
      );
      if (matchingTargetRef) {
        if (!targetRefIsPromptMentioned(matchingTargetRef)) {
          // Full name doesn't appear and only 1 word matches - likely over-broad fuzzy match
          continue;
        }
      }

      const originalCount = allOriginalExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;
      const parsedCount = allParsedExercises.filter(
        (exercise) => canonicaliseExerciseNameForSemantics(exercise.name) === targetName
      ).length;

      if (parsedCount >= originalCount) {
        return {
          passed: false,
          reason: `Intent semantic failed: remove request did not decrease count for ${matchingTargetRef?.displayName ?? targetName}.`,
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

/**
 * Evaluates whether an injury request produced safe changes for affected exercises.
 *
 * @param request - User request text with optional synthetic severity prefix in tests
 * @param originalQueue - Queue snapshot before Coach mutation
 * @param parsedQueue - Queue snapshot after Coach mutation
 * @param affectedExerciseNames - Targeted exercise display names resolved from the request
 * @returns Semantic pass/fail result with an explanatory reason on failure
 */
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
    if (originalAffected.length === 0) {
      return {
        passed: false,
        reason: 'Injury semantic failed: mild injuries require affected exercise targets in the current queue.',
      };
    }

    for (const originalExercise of originalAffected) {
      const parsedMatch = getParsedMatch(originalExercise);
      if (!parsedMatch) {
        continue;
      }

      if (!isLightenedWeightFirst(originalExercise, parsedMatch)) {
        return {
          passed: false,
          reason: 'Injury semantic failed: mild injuries require affected exercises that remain in the current queue to be lightened using a weight-first rule.',
        };
      }
    }

    return { passed: true };
  }

  return { passed: true };
};

/**
 * Merges horizon-scoped queue modifications back into the full queue.
 * The scopedModified queue contains only the first `horizon` items.
 * This function replaces the first `horizon` items in fullQueue with scopedModified,
 * preserving any items beyond the horizon unchanged.
 *
 * @param fullQueue - Complete queue before the scoped update
 * @param scopedModified - Modified queue items inside the active horizon
 * @param horizon - Number of leading queue items represented by scopedModified
 * @returns Full queue with scoped changes merged into the leading horizon
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
