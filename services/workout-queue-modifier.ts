/**
 * Workout Queue Modifier Service
 * Handles AI-powered workout queue modifications using compressed encoding
 */

import exercisesData from '@/data/exerciseSelection.json';
import { getExerciseVariantLabel } from '@/lib/utils';
import * as db from '@/services/database';
import type { ExerciseVariant, ExerciseVariantOption, ProgramExercise, WorkoutQueueItem } from '@/types';

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

const parseVariantLabel = (value: string): ExerciseVariant | null => {
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
    if (lower.includes('neutral') || lower.includes('supinated') || lower.includes('pronated') || lower.includes('reverse')) {
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

const isVariantValidForExercise = (
  exerciseData: ExerciseData | null,
  variant?: ExerciseVariant | null
): boolean => {
  if (!variant) {
    return true;
  }

  const allowedValues = variantValuesFromOptions(exerciseData ?? undefined);
  if (allowedValues.size === 0) {
    return false;
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

const normaliseVariantAgainstOptions = (
  exerciseData: ExerciseData | null,
  variant?: ExerciseVariant | null,
  fallback?: ExerciseVariant | null
): ExerciseVariant | null => {
  if (!variant) {
    return null;
  }

  if (isVariantValidForExercise(exerciseData, variant)) {
    return variant;
  }

  return fallback ?? null;
};

const getExerciseIdentity = (exercise: Pick<ProgramExercise, 'name' | 'variant'>): string =>
  JSON.stringify({
    name: exercise.name,
    variant: exercise.variant ?? null,
  });

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
  'bench': ['Barbell Bench Press', 'Incline Dumbbell Press', 'Chest Press'],
  'bench press': ['Barbell Bench Press'],
  'barbell bench': ['Barbell Bench Press'],
  'flat bench': ['Barbell Bench Press'],
  'incline bench': ['Incline Dumbbell Press'],
  'incline press': ['Incline Dumbbell Press'],
  
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
  'shoulder press': ['Dumbbell Shoulder Press', 'Overhead Barbell Press (Military Press)'],
  'overhead press': ['Overhead Barbell Press (Military Press)'],
  'military press': ['Overhead Barbell Press (Military Press)'],
  'ohp': ['Overhead Barbell Press (Military Press)'],
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
  
  // Check if input matches an alias
  const aliasMatches = EXERCISE_ALIASES[lowerInput];
  if (aliasMatches) {
    // Return only exercises that exist in the queue
    return aliasMatches.filter(name => 
      queueExercises.some(qe => qe.toLowerCase() === name.toLowerCase())
    );
  }
  
  return [];
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

function includesAnyKeyword(requestLower: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => requestLower.includes(keyword));
}

const findExercisesInQueueByMuscleGroup = (
  queue: WorkoutQueueItem[],
  targetMuscles: string[]
): { name: string; weight: number }[] => {
  const matchingExercises: { name: string; weight: number }[] = [];
  const seenNames = new Set<string>();
  
  for (const queueItem of queue) {
    for (const exercise of queueItem.exercises) {
      const exerciseMuscles = exercise.muscle_groups_worked || [];
      const isMatch = exerciseMuscles.some((muscle) =>
        targetMuscles.includes(muscle.toLowerCase())
      );
      
      if (isMatch && !seenNames.has(exercise.name)) {
        seenNames.add(exercise.name);
        matchingExercises.push({ 
          name: exercise.name, 
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
  muscleGroupDetected: string | null;
  noMatchesFound: boolean;
} => {
  const detected = detectMuscleGroupInRequest(request);
  
  if (!detected) {
    return { 
      processedRequest: request, 
      wasProcessed: false, 
      matchedExercises: [],
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
      muscleGroupDetected: detected.keyword,
      noMatchesFound: true,
    };
  }

  const exerciseNames = matchingExercises.map((e) => e.name);
  const percentChange = detectPercentageChange(request);
  
  if (percentChange) {
    const multiplier = percentChange.isIncrease 
      ? 1 + percentChange.percentage / 100
      : 1 - percentChange.percentage / 100;

    const weightChanges = matchingExercises.map((exercise) => {
      const newWeight = Math.round(exercise.weight * multiplier * 10) / 10;
      return `${exercise.name} weight to ${newWeight}`;
    });

    const processedRequest = `change ${weightChanges.join(', ')}`;
    return { 
      processedRequest, 
      wasProcessed: true, 
      matchedExercises: exerciseNames,
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
        muscleGroupDetected: detected.keyword,
        noMatchesFound: false,
      };
    }
  }

  return { 
    processedRequest: request, 
    wasProcessed: false, 
    matchedExercises: [],
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
- Preserve exact values in unchanged columns
</critical>

<examples>
IN: Q0:D2:A|10|8-10|3,B|5|12|4;Q1:D3:C|20|6|3
REQ: change A weight to 25
OUT: Q0:D2:A|25|8-10|3,B|5|12|4;Q1:D3:C|20|6|3

IN: Q0:D2:A|0|10-15|3,B|5|15|3
REQ: change A reps to 20
OUT: Q0:D2:A|0|20|3,B|5|15|3

IN: Q0:D2:A|0|6|3,B|40|5|3,C|20|8|3
REQ: change B sets to 5
OUT: Q0:D2:A|0|6|3,B|40|5|5,C|20|8|3

IN: Q0:D2:A|10|8|3,B|5|12|4;Q1:D3:C|20|6|3
REQ: change A weight to 15 and C reps to 10
OUT: Q0:D2:A|15|8|3,B|5|12|4;Q1:D3:C|20|10|3

IN: Q0:D2:A|0|6|3,B|40|5|3
REQ: remove A
OUT: Q0:D2:B|40|5|3
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
          return `${ex.name}|${ex.weight || '0'}|${ex.reps || '8'}|${ex.sets || '3'}|${variantLabel}`;
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

export const parseQueueFormatResponse = (
  response: string,
  originalQueue: WorkoutQueueItem[],
  userRequest: string = '',
  matchedExercises: string[] = []
): WorkoutQueueItem[] | null => {
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

      for (const exString of exerciseStrings) {
        // Support both pipe (|) and slash (/) separators for compatibility
        const separator = exString.includes('|') ? '|' : '/';
        const parts = exString.split(separator);
        if (parts.length < 4) continue;

        const rawNameToken = parts[0]?.trim() || '';
        const weight = parts[1]?.trim() || '0';
        const reps = parts[2]?.trim() || '8';
        const sets = parts[3]?.trim() || '3';
        const variantToken = parts[4]?.trim() || '';

        const { name: parsedName, variantLabel: inlineVariantLabel } = splitNameAndInlineVariant(rawNameToken);
        const variantLabel = variantToken || inlineVariantLabel || '';
        const parsedVariant = parseVariantFromToken(variantLabel);

        const originalEx = originalItem.exercises.find((ex) => {
          return ex.name.toLowerCase() === parsedName.toLowerCase() ||
                 ex.name.toLowerCase().includes(parsedName.toLowerCase()) ||
                 parsedName.toLowerCase().includes(ex.name.toLowerCase());
        });

        // Try to find the exercise by full name or fuzzy match
        const exerciseData = findExerciseByName(parsedName);
        const safeVariant = normaliseVariantAgainstOptions(exerciseData, parsedVariant, originalEx?.variant ?? null);

        if (exerciseData) {
          exercises.push({
            name: exerciseData.name,
            equipment: exerciseData.equipment,
            muscle_groups_worked: exerciseData.muscle_groups_worked,
            isCompound: exerciseData.isCompound,
            variantOptions: exerciseData.variantOptions,
            aliases: exerciseData.aliases,
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
  targetedExerciseNames: string[] = []
): WorkoutQueueItem[] => {
  console.log('[REPAIR] Starting queue repair...');
  console.log('[REPAIR] targetedExerciseNames:', targetedExerciseNames);
  
  const requestLower = userPrompt.toLowerCase();
  const isRemoveRequest = includesAnyKeyword(requestLower, REMOVE_REQUEST_KEYWORDS);
  console.log('[REPAIR] isRemoveRequest:', isRemoveRequest);
  
  // Extract target values from request
  const repsMatch = userPrompt.match(/(\d+)\s*reps?/i) || userPrompt.match(/reps?\s*(?:to\s*)?(\d+)/i);
  const targetReps = repsMatch ? repsMatch[1] : null;
  
  const weightMatch = userPrompt.match(/(\d+(?:\.\d+)?)\s*(?:kg|weight)/i) || userPrompt.match(/weight\s*(?:to\s*)?(\d+(?:\.\d+)?)/i);
  const targetWeight = weightMatch ? weightMatch[1] : null;
  
  const setsMatch = userPrompt.match(/(\d+)\s*sets?/i) || userPrompt.match(/sets?\s*(?:to\s*)?(\d+)/i);
  const targetSets = setsMatch ? setsMatch[1] : null;
  
  // Also check "to X" pattern
  const toValueMatch = userPrompt.match(/to\s+(\d+(?:\.\d+)?)/i);
  const toValue = toValueMatch ? toValueMatch[1] : null;

  // Normalize "expected" values for each column (supports concurrent attribute prompts)
  const mentionsReps = requestLower.includes('rep');
  const mentionsWeight = requestLower.includes('weight') || requestLower.includes('kg');
  const mentionsSets = requestLower.includes('set');
  const mentionsVariant =
    requestLower.includes('variant') ||
    requestLower.includes('grip') ||
    requestLower.includes('incline') ||
    requestLower.includes('decline') ||
    requestLower.includes('seated') ||
    requestLower.includes('standing') ||
    requestLower.includes('one-arm') ||
    requestLower.includes('single-arm');
  const hasExplicitColumnIntent = mentionsReps || mentionsWeight || mentionsSets || mentionsVariant;

  const expectedReps = targetReps || (toValue && mentionsReps ? toValue : null);
  const expectedWeight = targetWeight || (toValue && mentionsWeight ? toValue : null);
  const expectedSets = targetSets || (toValue && mentionsSets ? toValue : null);
  
  const healedQueue = parsedQueue.map((qItem, qIndex) => {
    const originalItem = originalQueue.find(oq => oq.dayNumber === qItem.dayNumber) || originalQueue[qIndex];
    if (!originalItem) return qItem;
    
    const healedExercises = qItem.exercises.map(ex => {
      const finalEx = { ...ex };
      const originalEx = originalItem.exercises.find(oe => 
        oe.name === ex.name ||
        getSimilarity(oe.name, ex.name) > 0.8
      );
      
      if (!originalEx) return finalEx;

      finalEx.hasCustomisedSets = originalEx.hasCustomisedSets;
      finalEx.variant = originalEx.variant ?? null;

      // Check if this exercise was targeted
      const isTargeted = targetedExerciseNames.some(targetName =>
        targetName === originalEx.name ||
        getSimilarity(targetName, originalEx.name) > 0.8
      ) || requestLower.includes(ex.name.toLowerCase());

      const requestedVariant = parseVariantFromToken(userPrompt);
      const expectedVariant = mentionsVariant ? requestedVariant : null;

      // --- LOGIC GAP FIX (Test 12) ---
      // Force the correct value on targeted exercises if LLM ignored it
      if (isTargeted) {
        // Apply intended changes (supports multiple columns at once).
        // If a column is NOT intended to change, restore it to the original value.

        if (expectedReps) {
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

        if (expectedWeight) {
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

        if (expectedSets) {
          if (finalEx.sets !== expectedSets) {
            console.log(`[REPAIR] Applying sets change for ${ex.name}: ${finalEx.sets} -> ${expectedSets}`);
            finalEx.sets = expectedSets;
          }
        } else if (hasExplicitColumnIntent && !mentionsSets && finalEx.sets !== originalEx.sets) {
          finalEx.sets = originalEx.sets;
        }

        if (mentionsVariant) {
          finalEx.variant = normaliseVariantAgainstOptions(
            findExerciseByName(finalEx.name),
            expectedVariant ?? finalEx.variant,
            originalEx.variant ?? null
          );
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
    });
    
    // --- OVER-PROTECTIVE FIX (Test 10 & 14) ---
    // Check for dropped exercises
    for (const origEx of originalItem.exercises) {
      // Check if this exercise exists in the healed queue (fuzzy match)
      const existsInNew = healedExercises.some(he =>
        he.name === origEx.name || getSimilarity(he.name, origEx.name) > 0.8
      );
      
      if (!existsInNew) {
        // Was this exercise targeted by the user?
        const isTargeted = targetedExerciseNames.some(targetName =>
          targetName === origEx.name ||
          getSimilarity(targetName, origEx.name) > 0.8
        );
        
        console.log(`[REPAIR] Dropped exercise "${origEx.name}" - isRemoveRequest: ${isRemoveRequest}, isTargeted: ${isTargeted}`);
        
        // If user said REMOVE and this exercise was TARGETED, let it die.
        if (isRemoveRequest && isTargeted) {
          console.log(`[REPAIR] Allowing removal of targeted exercise: ${origEx.name}`);
          continue;
        }
        
        // Otherwise, it was accidental data loss. Restore it.
        console.log(`[REPAIR] Restoring dropped exercise: ${origEx.name}`);
        healedExercises.push({ ...origEx });
      }
    }
    
    return { ...qItem, exercises: healedExercises };
  });
  
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
  if (lowerRequest.includes('rep')) {
    types.push('reps');
  }
  if (lowerRequest.includes('set')) {
    types.push('sets');
  }
  if (lowerRequest.includes('variant') || lowerRequest.includes('grip') || lowerRequest.includes('incline') || lowerRequest.includes('decline')) {
    types.push('variant');
  }
  if (includesAnyKeyword(lowerRequest, REMOVE_REQUEST_KEYWORDS)) {
    types.push('remove');
  }
  if (includesAnyKeyword(lowerRequest, ADD_REQUEST_KEYWORDS)) {
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
  const lowerRequest = request.toLowerCase().trim();
  const targetNames: string[] = [];
  const addedNames = new Set<string>();

  // Get all exercise names from the queue
  const allExercises: string[] = [];
  for (const item of queue) {
    for (const ex of item.exercises) {
      if (!allExercises.includes(ex.name)) {
        allExercises.push(ex.name);
      }
    }
  }

  // Helper to add exercise if not already added
  const addExercise = (name: string) => {
    if (!addedNames.has(name.toLowerCase())) {
      addedNames.add(name.toLowerCase());
      targetNames.push(name);
    }
  };

  // --- PASS 1: Check alias dictionary first ---
  // This catches common slang like "crunches" -> "Decline Crunches"
  for (const [alias, possibleMatches] of Object.entries(EXERCISE_ALIASES)) {
    // Check if alias appears in the request (as whole word or phrase)
    const aliasRegex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (aliasRegex.test(lowerRequest)) {
      // Find which of the possible matches exist in the queue
      for (const possibleMatch of possibleMatches) {
        const matchInQueue = allExercises.find(
          qe => qe.toLowerCase() === possibleMatch.toLowerCase()
        );
        if (matchInQueue) {
          addExercise(matchInQueue);
        }
      }
    }
  }

  // --- PASS 2: Direct matching against queue exercises ---
  for (const name of allExercises) {
    const lowerName = name.toLowerCase();
    const noSpaceName = lowerName.replace(/\s+/g, '');

    // Exact match
    if (lowerRequest.includes(lowerName)) {
      addExercise(name);
      continue;
    }

    // No-space match (e.g., "legextensions" -> "Leg Extensions")
    if (lowerRequest.includes(noSpaceName)) {
      addExercise(name);
      continue;
    }
  }

  // --- PASS 3: Partial word matching (for exercises with multiple words) ---
  for (const name of allExercises) {
    if (addedNames.has(name.toLowerCase())) continue;

    const lowerName = name.toLowerCase();
    const words = lowerName.split(/\s+/).filter(w => w.length > 2);
    
    // Skip if too few significant words
    if (words.length < 1) continue;

    // Check if the distinctive words appear in the request
    // "Decline Crunches" -> matches if "decline" AND "crunches" appear
    // "Lat Pulldowns" -> matches if "lat" AND "pulldowns" appear
    const matchingWords = words.filter(word => {
      // Skip common filler words
      if (['the', 'and', 'for', 'with'].includes(word)) return false;
      return lowerRequest.includes(word);
    });

    // Require at least 50% of significant words to match (minimum 1)
    const threshold = Math.max(1, Math.ceil(words.length * 0.5));
    if (matchingWords.length >= threshold) {
      addExercise(name);
    }
  }

  // --- PASS 4: Fuzzy similarity matching for remaining exercises ---
  for (const name of allExercises) {
    if (addedNames.has(name.toLowerCase())) continue;

    // Extract potential exercise references from request
    // Split by common delimiters and check each chunk
    const chunks = lowerRequest.split(/[,;]|\band\b|\bto\b|\bfor\b/).map(s => s.trim());
    
    for (const chunk of chunks) {
      if (chunk.length < 3) continue;
      
      const similarity = getSimilarity(chunk, name.toLowerCase());
      if (similarity > 0.6) {
        addExercise(name);
        break;
      }
    }
  }

  console.log(`[EXTRACT] Found ${targetNames.length} target exercises:`, targetNames);
  return targetNames;
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
  const oldQueueMap = new Map(oldQueue.map((item) => [item.id, item]));
  const newQueueMap = new Map(newQueue.map((item) => [item.id, item]));
  
  for (const oldItem of oldQueue) {
    const newItem = newQueueMap.get(oldItem.id);
    
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
    
    const oldExercisesMap = new Map(
      oldItem.exercises.map((ex, idx) => [getExerciseIdentity(ex), { exercise: ex, index: idx }])
    );
    const newExercisesMap = new Map(
      newItem.exercises.map((ex, idx) => [getExerciseIdentity(ex), { exercise: ex, index: idx }])
    );

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
        
        // Check for variant changes
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

        // Check for weight changes
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

        // Check for reps changes
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

        // Check for sets changes
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
  
  for (const newItem of newQueue) {
    if (!oldQueueMap.has(newItem.id)) {
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

  // Check for unexpected removals (if user did not request remove-like action)
  if (!includesAnyKeyword(requestLower, REMOVE_REQUEST_KEYWORDS)) {
    const removals = differences.filter(d => d.type === 'removed');
    if (removals.length > 0) {
      const removedNames = removals.map(r => r.exerciseName).join(', ');
      warnings.push(`Unexpected removal(s): ${removedNames}. These exercises were removed but you didn't request removal.`);
    }
  }

  // Check for unexpected variant changes
  const mentionsVariant =
    requestLower.includes('variant') ||
    requestLower.includes('grip') ||
    requestLower.includes('incline') ||
    requestLower.includes('decline') ||
    requestLower.includes('seated') ||
    requestLower.includes('standing');
  if (!mentionsVariant) {
    const variantChanges = differences.filter(d => d.type === 'variant_change');
    if (variantChanges.length > 0) {
      const variantNames = variantChanges.map(change => change.exerciseName).join(', ');
      warnings.push(`Unexpected variant change(s): ${variantNames}. Variants were changed but you didn't request variant updates.`);
    }
  }

  // Check for unexpected additions (if user did not request add-like action)
  if (!includesAnyKeyword(requestLower, ADD_REQUEST_KEYWORDS)) {
    const additions = differences.filter(d => d.type === 'added');
    if (additions.length > 0) {
      const addedNames = additions.map(a => a.exerciseName).join(', ');
      warnings.push(`Unexpected addition(s): ${addedNames}. These exercises were added but you didn't request addition.`);
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
};


// =============================================================================
// DATABASE OPERATIONS (using SQLite)
// =============================================================================

/**
 * Load current workout queue from database
 */
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
