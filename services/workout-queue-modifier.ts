/**
 * Workout Queue Modifier Service
 * Handles AI-powered workout queue modifications using compressed encoding
 */

import * as db from '@/services/database';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';

// =============================================================================
// COMPRESSED ENCODING SYSTEM - Exercise Abbreviations
// =============================================================================

export const EXERCISE_ABBREVIATIONS: Record<
  string,
  { name: string; equipment: string; muscle_groups_worked: string[] }
> = {
  BBS: { name: 'Barbell Back Squat', equipment: 'Barbell', muscle_groups_worked: ['quads', 'glutes', 'hamstrings', 'abs'] },
  BBP: { name: 'Barbell Bench Press', equipment: 'Barbell', muscle_groups_worked: ['chest', 'triceps', 'shoulders'] },
  BDL: { name: 'Barbell Deadlift', equipment: 'Barbell', muscle_groups_worked: ['hamstrings', 'glutes', 'lats', 'traps', 'forearms'] },
  BHT: { name: 'Barbell Hip Thrust', equipment: 'Barbell', muscle_groups_worked: ['glutes', 'hamstrings'] },
  BLU: { name: 'Barbell Lunge', equipment: 'Barbell', muscle_groups_worked: ['quads', 'glutes', 'hamstrings'] },
  BSH: { name: 'Barbell Shrugs', equipment: 'Barbell', muscle_groups_worked: ['traps', 'forearms'] },
  BOR: { name: 'Bent Over Barbell Row', equipment: 'Barbell', muscle_groups_worked: ['lats', 'traps', 'biceps', 'forearms'] },
  BSS: { name: 'Bulgarian Split Squat', equipment: 'Dumbbell', muscle_groups_worked: ['quads', 'glutes', 'hamstrings'] },
  CP: { name: 'Calf Press', equipment: '', muscle_groups_worked: ['calves'] },
  CRD: { name: 'Dumbbell Calf Raises', equipment: 'Dumbbell', muscle_groups_worked: ['calves'] },
  CHP: { name: 'Chest Press', equipment: '', muscle_groups_worked: ['chest', 'shoulders', 'triceps'] },
  DC: { name: 'Decline Crunches', equipment: '', muscle_groups_worked: ['abs'] },
  DAP: { name: 'Dumbbell Arnold Press', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders', 'triceps'] },
  DF: { name: 'Dumbbell Flyes', equipment: 'Dumbbell', muscle_groups_worked: ['chest', 'shoulders'] },
  DGS: { name: 'Dumbbell Goblet Squat', equipment: 'Dumbbell', muscle_groups_worked: ['quads', 'glutes', 'abs'] },
  DLR: { name: 'Dumbbell Lateral Raise', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders'] },
  DSP: { name: 'Dumbbell Shoulder Press', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders'] },
  DSK: { name: 'Dumbbell Skullcrushers', equipment: 'Dumbbell', muscle_groups_worked: ['triceps'] },
  FC: { name: 'Fingertip Curls', equipment: 'Cable', muscle_groups_worked: ['forearms'] },
  HC: { name: 'Hammer Curls', equipment: 'Dumbbell', muscle_groups_worked: ['biceps', 'forearms'] },
  HSC: { name: 'Hamstring Curls', equipment: '', muscle_groups_worked: ['hamstrings'] },
  IDP: { name: 'Incline Dumbbell Press', equipment: 'Dumbbell', muscle_groups_worked: ['chest', 'shoulders', 'triceps'] },
  LPD: { name: 'Lat Pulldowns', equipment: '', muscle_groups_worked: ['lats'] },
  LE: { name: 'Leg Extensions', equipment: '', muscle_groups_worked: ['quads'] },
  LGP: { name: 'Leg Press', equipment: '', muscle_groups_worked: ['quads', 'glutes', 'hamstrings'] },
  ODR: { name: 'One-Arm Dumbbell Row', equipment: 'Dumbbell', muscle_groups_worked: ['lats', 'biceps', 'shoulders'] },
  OHP: { name: 'Overhead Barbell Press (Military Press)', equipment: 'Barbell', muscle_groups_worked: ['shoulders', 'triceps', 'chest'] },
  PC: { name: 'Preacher Curl', equipment: 'Barbell', muscle_groups_worked: ['biceps'] },
  PU: { name: 'Pull-Ups', equipment: '', muscle_groups_worked: ['lats'] },
  RDF: { name: 'Rear Delt Fly', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders'] },
  RFC: { name: 'Reverse Grip Forearm Curls', equipment: 'Cable', muscle_groups_worked: ['forearms'] },
  RDL: { name: 'Romanian Deadlift', equipment: 'Barbell', muscle_groups_worked: ['hamstrings', 'glutes', 'forearms'] },
  SBC: { name: 'Seated Dumbbell Bicep Curl', equipment: 'Dumbbell', muscle_groups_worked: ['biceps', 'forearms'] },
  THM: { name: 'The Hug Machine', equipment: '', muscle_groups_worked: ['chest'] },
  TR: { name: 'Triangle Rows', equipment: 'Cable', muscle_groups_worked: ['lats', 'traps'] },
  TPD: { name: 'Triceps Pushdown', equipment: 'Cable', muscle_groups_worked: ['triceps'] },
};

// Reverse mapping: full exercise name -> abbreviation
export const EXERCISE_NAME_TO_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(EXERCISE_ABBREVIATIONS).map(([abbrev, data]) => [data.name, abbrev])
);

export const getExerciseAbbreviation = (exerciseName: string): string => {
  return EXERCISE_NAME_TO_ABBREV[exerciseName] || exerciseName;
};

export const getExerciseFromAbbreviation = (
  abbrev: string
): { name: string; equipment: string; muscle_groups_worked: string[] } | null => {
  return EXERCISE_ABBREVIATIONS[abbrev] || null;
};

// =============================================================================
// SEMI-ABBREVIATED EXERCISE NAMES (for LLM prompts)
// =============================================================================

// Abbreviate common words in exercise names for shorter prompts
// Dumbbell → DB, Barbell → BB, Curls → C, Row/Rows → R, Press → P
const WORD_ABBREVIATIONS: [RegExp, string][] = [
  [/\bDumbbell\b/gi, 'DB'],
  [/\bBarbell\b/gi, 'BB'],
  [/\bCurls?\b/gi, 'C'],
  [/\bRows?\b/gi, 'R'],
  [/\bPress\b/gi, 'P'],
];

const WORD_EXPANSIONS: [RegExp, string][] = [
  [/\bDB\b/g, 'Dumbbell'],
  [/\bBB\b/g, 'Barbell'],
  [/\bC\b/g, 'Curls'],
  [/\bR\b/g, 'Rows'],
  [/\bP\b/g, 'Press'],
];

/**
 * Convert full exercise name to semi-abbreviated format
 * e.g., "Seated Dumbbell Bicep Curl" → "Seated DB Bicep C"
 */
export const toSemiAbbreviated = (exerciseName: string): string => {
  let result = exerciseName;
  for (const [pattern, replacement] of WORD_ABBREVIATIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
};

/**
 * Convert semi-abbreviated name back to full name
 * e.g., "Seated DB Bicep C" → "Seated Dumbbell Bicep Curls"
 */
export const fromSemiAbbreviated = (semiAbbrev: string): string => {
  let result = semiAbbrev;
  for (const [pattern, replacement] of WORD_EXPANSIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
};

/**
 * Find exercise by semi-abbreviated name
 */
export const findExerciseBySemiAbbrev = (
  semiAbbrev: string
): { name: string; equipment: string; muscle_groups_worked: string[] } | null => {
  const expanded = fromSemiAbbreviated(semiAbbrev);
  
  // Try exact match first
  for (const [, data] of Object.entries(EXERCISE_ABBREVIATIONS)) {
    if (data.name.toLowerCase() === expanded.toLowerCase()) {
      return data;
    }
  }
  
  // Try fuzzy match (contains)
  for (const [, data] of Object.entries(EXERCISE_ABBREVIATIONS)) {
    if (data.name.toLowerCase().includes(expanded.toLowerCase()) ||
        expanded.toLowerCase().includes(data.name.toLowerCase())) {
      return data;
    }
  }
  
  // Try matching semi-abbreviated versions
  for (const [, data] of Object.entries(EXERCISE_ABBREVIATIONS)) {
    const semiAbbrevName = toSemiAbbreviated(data.name);
    if (semiAbbrevName.toLowerCase() === semiAbbrev.toLowerCase()) {
      return data;
    }
  }
  
  return null;
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
};

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
      const semiAbbrev = toSemiAbbreviated(exercise.name);
      const newWeight = Math.round(exercise.weight * multiplier * 10) / 10;
      return `${semiAbbrev} weight to ${newWeight}`;
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

  const semiAbbrevNames = matchingExercises.map((e) => toSemiAbbreviated(e.name));
  const nameList = semiAbbrevNames.join(', ');
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

const generateAbbreviationList = (): string => {
  return Object.entries(EXERCISE_ABBREVIATIONS)
    .map(([abbrev, data]) => `${abbrev}=${data.name}`)
    .join(',');
};

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
EXERCISE: name|kg|reps|sets
Columns: 1=name 2=kg 3=reps 4=sets
</format>

<critical>
- COPY ALL exercises from input (except removals)
- COPY ALL Q items (Q0;Q1;Q2)
- Change ONLY the column requested:
  * "weight" = column 2 (kg)
  * "reps" = column 3
  * "sets" = column 4
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
          // Use semi-abbreviated exercise names (full names with DB, BB, C, R, P abbreviations)
          const semiAbbrev = toSemiAbbreviated(ex.name);
          return `${semiAbbrev}|${ex.weight || '0'}|${ex.reps || '8-12'}|${ex.sets || '3'}`;
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
  originalQueue: WorkoutQueueItem[]
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

        const exerciseName = parts[0].trim();
        const weight = parts[1]?.trim() || '0';
        const reps = parts[2]?.trim() || '8-12';
        const sets = parts[3]?.trim() || '3';
        
        // Try to find the exercise by:
        // 1. Semi-abbreviated name (e.g., "Seated DB Bicep C")
        // 2. Full name
        // 3. Old abbreviation (for backwards compatibility)
        let exerciseData = findExerciseBySemiAbbrev(exerciseName);
        
        if (!exerciseData) {
          exerciseData = getExerciseFromAbbreviation(exerciseName);
        }
        
        if (exerciseData) {
          exercises.push({
            name: exerciseData.name,
            equipment: exerciseData.equipment,
            muscle_groups_worked: exerciseData.muscle_groups_worked,
            weight,
            reps,
            sets,
            restTime: '180',
            progression: '',
          });
        } else {
          // Try to find in original exercises by comparing semi-abbreviated names
          const originalEx = originalItem.exercises.find((ex) => {
            const semiAbbrev = toSemiAbbreviated(ex.name);
            return semiAbbrev.toLowerCase() === exerciseName.toLowerCase() ||
                   ex.name.toLowerCase() === exerciseName.toLowerCase() ||
                   ex.name.toLowerCase().includes(exerciseName.toLowerCase()) ||
                   exerciseName.toLowerCase().includes(ex.name.toLowerCase());
          });
          
          if (originalEx) {
            exercises.push({ ...originalEx, weight, reps, sets });
          } else {
            // Warn about unknown exercise name
            console.warn(`[QUEUE FORMAT] Unknown exercise: "${exerciseName}" - using as-is. This may indicate an LLM hallucination.`);
            exercises.push({
              name: exerciseName,
              equipment: '',
              muscle_groups_worked: [],
              weight,
              reps,
              sets,
              restTime: '180',
              progression: '',
            });
          }
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
    return newQueue.length > 0 ? newQueue : null;
  } catch (error) {
    console.error('[QUEUE FORMAT] Error parsing response:', error);
    return null;
  }
};

// =============================================================================
// QUEUE REPAIR SYSTEM
// =============================================================================

/**
 * Detect what type of change was requested from user input
 */
type ChangeType = 'weight' | 'reps' | 'sets' | 'remove' | 'add' | 'unknown';

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
  if (lowerRequest.includes('remove') || lowerRequest.includes('delete')) {
    types.push('remove');
  }
  if (lowerRequest.includes('add') || lowerRequest.includes('insert')) {
    types.push('add');
  }
  
  return types.length > 0 ? types : ['unknown'];
};

/**
 * Extract target exercise names from user request
 * Returns normalized exercise names that were mentioned
 */
export const extractTargetExercises = (
  request: string,
  queue: WorkoutQueueItem[]
): string[] => {
  const lowerRequest = request.toLowerCase();
  const targetNames: string[] = [];
  
  // Get all exercise names from the queue
  const allExercises: string[] = [];
  for (const item of queue) {
    for (const ex of item.exercises) {
      if (!allExercises.includes(ex.name)) {
        allExercises.push(ex.name);
      }
    }
  }
  
  // Check which exercises are mentioned in the request
  for (const name of allExercises) {
    const lowerName = name.toLowerCase();
    const semiAbbrev = toSemiAbbreviated(name).toLowerCase();
    
    // Check various forms of the name
    if (
      lowerRequest.includes(lowerName) ||
      lowerRequest.includes(semiAbbrev) ||
      lowerRequest.includes(lowerName.replace(/\s+/g, '')) ||
      // Check key words from the name
      lowerName.split(' ').every(word => 
        word.length < 3 || lowerRequest.includes(word)
      )
    ) {
      targetNames.push(name);
    }
  }
  
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
  
  // Try semi-abbreviated match
  const expanded = fromSemiAbbreviated(name);
  for (const ex of knownExercises) {
    if (ex.name.toLowerCase() === expanded.toLowerCase()) {
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
  request: string
): WorkoutQueueItem[] => {
  const changeTypes = detectRequestedChangeType(request);
  const isRemovalRequest = changeTypes.includes('remove');
  
  // If not a removal request, or if it is but we need to be careful
  const targetExercises = isRemovalRequest 
    ? extractTargetExercises(request, originalQueue)
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
      // Also map semi-abbreviated name
      const semiAbbrev = toSemiAbbreviated(ex.name).toLowerCase();
      if (semiAbbrev !== ex.name.toLowerCase()) {
        parsedExerciseMap.set(semiAbbrev, ex);
      }
    }
    
    // Check which original exercises are missing
    const restoredExercises: ProgramExercise[] = [...parsedItem.exercises];
    
    for (const originalEx of originalItem.exercises) {
      const lowerName = originalEx.name.toLowerCase();
      const semiAbbrev = toSemiAbbreviated(originalEx.name).toLowerCase();
      
      // Check if exercise exists in parsed output
      const existsInParsed = 
        parsedExerciseMap.has(lowerName) ||
        parsedExerciseMap.has(semiAbbrev) ||
        parsedItem.exercises.some(pe => 
          pe.name.toLowerCase() === lowerName ||
          toSemiAbbreviated(pe.name).toLowerCase() === semiAbbrev
        );
      
      if (!existsInParsed) {
        // Exercise was dropped - check if it was targeted for removal
        const wasTargeted = targetExercises.some(target => 
          target.toLowerCase() === lowerName ||
          toSemiAbbreviated(target).toLowerCase() === semiAbbrev ||
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
  request: string
): WorkoutQueueItem[] => {
  const changeTypes = detectRequestedChangeType(request);
  const targetExercises = extractTargetExercises(request, originalQueue);
  
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
              toSemiAbbreviated(oe.name).toLowerCase() === toSemiAbbreviated(parsedEx.name).toLowerCase()
      );
      
      if (!originalEx) {
        repairedExercises.push(parsedEx);
        continue;
      }
      
      // Check if this exercise was targeted
      const isTargeted = targetExercises.some(target => 
        target.toLowerCase() === originalEx.name.toLowerCase() ||
        toSemiAbbreviated(target).toLowerCase() === toSemiAbbreviated(originalEx.name).toLowerCase()
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
  request: string
): WorkoutQueueItem[] => {
  console.log('[REPAIR] Starting queue repair...');
  
  // Step 1: Restore dropped exercises (Safety Net)
  let repairedQueue = restoreDroppedExercises(originalQueue, parsedQueue, request);
  
  // Step 2: Enforce correct column changes
  repairedQueue = enforceColumnChanges(originalQueue, repairedQueue, request);
  
  console.log('[REPAIR] Queue repair complete');
  return repairedQueue;
};

// =============================================================================
// PROPOSED CHANGES TYPES
// =============================================================================

export interface ProposedChanges {
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
  type: 'weight_change' | 'reps_change' | 'sets_change' | 'removed' | 'added' | 'modified' | 'exercise_swap';
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
          exerciseName: exercise.name,
          oldExercise: exercise,
        });
      }
      continue;
    }
    
    const oldExercisesMap = new Map(
      oldItem.exercises.map((ex, idx) => [ex.name, { exercise: ex, index: idx }])
    );
    const newExercisesMap = new Map(
      newItem.exercises.map((ex, idx) => [ex.name, { exercise: ex, index: idx }])
    );

    for (const [exerciseName, { exercise: oldExercise }] of oldExercisesMap) {
      if (!newExercisesMap.has(exerciseName)) {
        differences.push({
          type: 'removed',
          queueItemId: oldItem.id,
          queueItemName: oldItem.programName,
          dayNumber: oldItem.dayNumber,
          exerciseName,
          oldExercise,
        });
      }
    }
    
    for (const [exerciseName, { exercise: newExercise }] of newExercisesMap) {
      const oldExerciseData = oldExercisesMap.get(exerciseName);
      
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
          exerciseName: exercise.name,
          newExercise: exercise,
        });
      }
    }
  }
  
  return differences;
};

export const differencesToProposedChanges = (differences: QueueDifference[]): ProposedChanges => {
  const weightChanges: ProposedChanges['weightChanges'] = [];
  const repsChanges: ProposedChanges['repsChanges'] = [];
  const setsChanges: ProposedChanges['setsChanges'] = [];
  const removals: ProposedChanges['removals'] = [];
  const additions: ProposedChanges['additions'] = [];
  const swaps: ProposedChanges['swaps'] = [];
  
  for (const diff of differences) {
    switch (diff.type) {
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

  return { weightChanges, repsChanges, setsChanges, removals, additions, swaps };
};

// =============================================================================
// VALIDATION
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

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

  // Check for unexpected removals (if user didn't say "remove")
  if (!requestLower.includes('remove')) {
    const removals = differences.filter(d => d.type === 'removed');
    if (removals.length > 0) {
      const removedNames = removals.map(r => r.exerciseName).join(', ');
      warnings.push(`Unexpected removal(s): ${removedNames}. These exercises were removed but you didn't request removal.`);
    }
  }

  // Check for unexpected additions (if user didn't say "add")
  if (!requestLower.includes('add')) {
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
