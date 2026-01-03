import type { WorkoutQueueItem } from '@/app/(tabs)/ActiveWorkout';
import type { ProgramExercise } from '@/app/(tabs)/Programs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WORKOUT_QUEUE_STORAGE_KEY = 'gymApp_workoutQueue';

// =============================================================================
// COMPRESSED ENCODING SYSTEM - Exercise Abbreviations
// =============================================================================

// Exercise abbreviation mapping: abbreviation -> full exercise data
export const EXERCISE_ABBREVIATIONS: Record<string, { name: string; equipment: string; muscle_groups_worked: string[] }> = {
  'BBS': { name: 'Barbell Back Squat', equipment: 'Barbell', muscle_groups_worked: ['quads', 'glutes', 'hamstrings', 'abs'] },
  'BBP': { name: 'Barbell Bench Press', equipment: 'Barbell', muscle_groups_worked: ['chest', 'triceps', 'shoulders'] },
  'BDL': { name: 'Barbell Deadlift', equipment: 'Barbell', muscle_groups_worked: ['hamstrings', 'glutes', 'lats', 'traps', 'forearms'] },
  'BHT': { name: 'Barbell Hip Thrust', equipment: 'Barbell', muscle_groups_worked: ['glutes', 'hamstrings'] },
  'BLU': { name: 'Barbell Lunge', equipment: 'Barbell', muscle_groups_worked: ['quads', 'glutes', 'hamstrings'] },
  'BSH': { name: 'Barbell Shrugs', equipment: 'Barbell', muscle_groups_worked: ['traps', 'forearms'] },
  'BOR': { name: 'Bent Over Barbell Row', equipment: 'Barbell', muscle_groups_worked: ['lats', 'traps', 'biceps', 'forearms'] },
  'BSS': { name: 'Bulgarian Split Squat', equipment: 'Dumbbell', muscle_groups_worked: ['quads', 'glutes', 'hamstrings'] },
  'CP': { name: 'Calf Press', equipment: '', muscle_groups_worked: ['calves'] },
  'CRD': { name: 'Calf Raises (Holding Dumbbells)', equipment: 'Dumbbell', muscle_groups_worked: ['calves'] },
  'CHP': { name: 'Chest Press', equipment: '', muscle_groups_worked: ['chest', 'shoulders', 'triceps'] },
  'DC': { name: 'Decline Crunches', equipment: '', muscle_groups_worked: ['abs'] },
  'DAP': { name: 'Dumbbell Arnold Press', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders', 'triceps'] },
  'DF': { name: 'Dumbbell Flyes', equipment: 'Dumbbell', muscle_groups_worked: ['chest', 'shoulders'] },
  'DGS': { name: 'Dumbbell Goblet Squat', equipment: 'Dumbbell', muscle_groups_worked: ['quads', 'glutes', 'abs'] },
  'DLR': { name: 'Dumbbell Lateral Raise', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders'] },
  'DSP': { name: 'Dumbbell Shoulder Press', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders'] },
  'DSK': { name: 'Dumbbell Skullcrushers', equipment: 'Dumbbell', muscle_groups_worked: ['triceps'] },
  'FC': { name: 'Fingertip Curls', equipment: '', muscle_groups_worked: ['forearms'] },
  'HC': { name: 'Hammer Curls', equipment: 'Dumbbell', muscle_groups_worked: ['biceps', 'forearms'] },
  'HSC': { name: 'Hamstring Curls', equipment: '', muscle_groups_worked: ['hamstrings'] },
  'IDP': { name: 'Incline Dumbbell Press', equipment: 'Dumbbell', muscle_groups_worked: ['chest', 'shoulders', 'triceps'] },
  'LP': { name: 'Lat Pulldowns', equipment: '', muscle_groups_worked: ['lats'] },
  'LE': { name: 'Leg Extensions', equipment: '', muscle_groups_worked: ['quads'] },
  'LPR': { name: 'Leg Press', equipment: '', muscle_groups_worked: ['quads', 'glutes', 'hamstrings'] },
  'ODR': { name: 'One-Arm Dumbbell Row', equipment: 'Dumbbell', muscle_groups_worked: ['lats', 'biceps', 'shoulders'] },
  'OHP': { name: 'Overhead Barbell Press (Military Press)', equipment: 'Barbell', muscle_groups_worked: ['shoulders', 'triceps', 'chest'] },
  'PC': { name: 'Preacher Curl', equipment: 'Barbell', muscle_groups_worked: ['biceps'] },
  'PU': { name: 'Pull-Ups', equipment: '', muscle_groups_worked: ['lats'] },
  'RDF': { name: 'Rear Delt Fly', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders'] },
  'RFC': { name: 'Reverse Grip Forearm Curls', equipment: '', muscle_groups_worked: ['forearms'] },
  'RDL': { name: 'Romanian Deadlift', equipment: 'Barbell', muscle_groups_worked: ['hamstrings', 'glutes', 'forearms'] },
  'SBC': { name: 'Seated Dumbbell Bicep Curl', equipment: 'Dumbbell', muscle_groups_worked: ['biceps', 'forearms'] },
  'THM': { name: 'The Hug Machine', equipment: '', muscle_groups_worked: ['chest'] },
  'TR': { name: 'Triangle Rows', equipment: '', muscle_groups_worked: ['lats', 'traps'] },
  'TPD': { name: 'Triceps Pushdown', equipment: 'Cable', muscle_groups_worked: ['triceps'] },
};

// Reverse mapping: full exercise name -> abbreviation
export const EXERCISE_NAME_TO_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(EXERCISE_ABBREVIATIONS).map(([abbrev, data]) => [data.name, abbrev])
);

// Get abbreviation for an exercise name (returns name if no abbreviation found)
export const getExerciseAbbreviation = (exerciseName: string): string => {
  return EXERCISE_NAME_TO_ABBREV[exerciseName] || exerciseName;
};

// Get full exercise data from abbreviation
export const getExerciseFromAbbreviation = (abbrev: string): { name: string; equipment: string; muscle_groups_worked: string[] } | null => {
  return EXERCISE_ABBREVIATIONS[abbrev] || null;
};

// =============================================================================
// MUSCLE GROUP DETECTION & REQUEST PREPROCESSING
// =============================================================================

// Muscle group keyword mappings (keyword -> actual muscle names in exercise data)
const MUSCLE_GROUP_KEYWORDS: Record<string, string[]> = {
  // Primary muscle groups
  'chest': ['chest'],
  'back': ['lats', 'traps'],
  'shoulders': ['shoulders'],
  'shoulder': ['shoulders'],
  'legs': ['quads', 'glutes', 'hamstrings', 'calves'],
  'leg': ['quads', 'glutes', 'hamstrings', 'calves'],
  'biceps': ['biceps'],
  'bicep': ['biceps'],
  'triceps': ['triceps'],
  'tricep': ['triceps'],
  'forearms': ['forearms'],
  'forearm': ['forearms'],
  'abs': ['abs'],
  'core': ['abs'],
  
  // Compound groups
  'arms': ['biceps', 'triceps'],
  'arm': ['biceps', 'triceps'],
  'upper body': ['chest', 'lats', 'traps', 'shoulders', 'biceps', 'triceps'],
  'lower body': ['quads', 'glutes', 'hamstrings', 'calves'],
  'push': ['chest', 'shoulders', 'triceps'],
  'pull': ['lats', 'traps', 'biceps'],
};

// Find exercises in queue that match a muscle group (returns name and weight)
const findExercisesInQueueByMuscleGroup = (
  queue: WorkoutQueueItem[],
  targetMuscles: string[]
): { name: string; weight: number }[] => {
  const matchingExercises: { name: string; weight: number }[] = [];
  const seenNames = new Set<string>();
  
  for (const queueItem of queue) {
    for (const exercise of queueItem.exercises) {
      const exerciseMuscles = exercise.muscle_groups_worked || [];
      
      // Match if exercise works ANY of the target muscles
      const isMatch = exerciseMuscles.some(muscle => 
        targetMuscles.includes(muscle.toLowerCase())
      );
      
      if (isMatch && !seenNames.has(exercise.name)) {
        seenNames.add(exercise.name);
        matchingExercises.push({ 
          name: exercise.name, 
          weight: typeof exercise.weight === 'number' ? exercise.weight : parseFloat(String(exercise.weight)) || 0 
        });
      }
    }
  }
  
  return matchingExercises;
};

// Detect percentage change in request (e.g., "by 20%", "by 10 percent")
const detectPercentageChange = (request: string): { percentage: number; isIncrease: boolean } | null => {
  const lowerRequest = request.toLowerCase();
  
  // Check for increase/reduce keywords
  const isIncrease = lowerRequest.includes('increase') || lowerRequest.includes('raise') || lowerRequest.includes('add');
  const isDecrease = lowerRequest.includes('reduce') || lowerRequest.includes('decrease') || lowerRequest.includes('lower');
  
  if (!isIncrease && !isDecrease) {
    return null;
  }
  
  // Match patterns like "by 20%", "by 20 percent", "by 20 %"
  const percentMatch = lowerRequest.match(/by\s+(\d+(?:\.\d+)?)\s*(%|percent)/);
  if (percentMatch) {
    return {
      percentage: parseFloat(percentMatch[1]),
      isIncrease: isIncrease
    };
  }
  
  return null;
};

// Detect muscle group keywords in user request
const detectMuscleGroupInRequest = (request: string): { keyword: string; muscles: string[] } | null => {
  const lowerRequest = request.toLowerCase();
  
  // Check for muscle group keywords (longer phrases first)
  const sortedKeywords = Object.keys(MUSCLE_GROUP_KEYWORDS).sort((a, b) => b.length - a.length);
  
  for (const keyword of sortedKeywords) {
    // Look for patterns like "all chest", "chest exercises", "all bicep exercises"
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
 * Preprocess user request to replace muscle group references with explicit weight changes.
 * Pre-calculates percentage changes to remove math from LLM responsibility.
 * 
 * Example:
 *   Input: "reduce all chest exercises by 20%"
 *   Output: "change BBP weight to 44, CHP weight to 44, THM weight to 32"
 */
export const preprocessMuscleGroupRequest = (
  request: string,
  queue: WorkoutQueueItem[]
): { processedRequest: string; wasProcessed: boolean; matchedExercises: string[] } => {
  const detected = detectMuscleGroupInRequest(request);
  
  if (!detected) {
    return { processedRequest: request, wasProcessed: false, matchedExercises: [] };
  }
  
  // Find exercises in the queue that match this muscle group (with weights)
  const matchingExercises = findExercisesInQueueByMuscleGroup(queue, detected.muscles);
  
  if (matchingExercises.length === 0) {
    console.log(`[PREPROCESS] No ${detected.keyword} exercises found in queue`);
    return { processedRequest: request, wasProcessed: false, matchedExercises: [] };
  }
  
  const exerciseNames = matchingExercises.map(e => e.name);
  console.log(`[PREPROCESS] Found ${detected.keyword} exercises:`, exerciseNames);
  
  // Check for percentage change
  const percentChange = detectPercentageChange(request);
  
  if (percentChange) {
    // Pre-calculate weights - remove math from LLM
    const multiplier = percentChange.isIncrease 
      ? 1 + (percentChange.percentage / 100)
      : 1 - (percentChange.percentage / 100);
    
    const weightChanges = matchingExercises.map(exercise => {
      const abbrev = getExerciseAbbreviation(exercise.name);
      const newWeight = Math.round(exercise.weight * multiplier * 10) / 10; // Round to 1 decimal
      return `${abbrev} weight to ${newWeight}`;
    });
    
    console.log(`[PREPROCESS] Pre-calculated weights (${percentChange.isIncrease ? '+' : '-'}${percentChange.percentage}%):`, weightChanges);
    
    // Build the explicit weight change request
    const processedRequest = `change ${weightChanges.join(', ')}`;
    console.log(`[PREPROCESS] Rewrote request: "${request}" -> "${processedRequest}"`);
    
    return { processedRequest, wasProcessed: true, matchedExercises: exerciseNames };
  }
  
  // No percentage - just use abbreviations for non-percentage requests (like removals)
  const abbreviations = matchingExercises.map(e => getExerciseAbbreviation(e.name));
  console.log(`[PREPROCESS] Converted to abbreviations:`, abbreviations);
  
  const abbrevList = abbreviations.join(', ');
  const lowerRequest = request.toLowerCase();
  let processedRequest = request;
  
  // Try different replacement patterns
  const replacements = [
    { find: `all ${detected.keyword} exercises`, replace: abbrevList },
    { find: `all ${detected.keyword} exercise`, replace: abbrevList },
    { find: `${detected.keyword} exercises`, replace: abbrevList },
    { find: `${detected.keyword} exercise`, replace: abbrevList },
    { find: `every ${detected.keyword} exercise`, replace: abbrevList },
    { find: `every ${detected.keyword}`, replace: abbrevList },
    { find: `all ${detected.keyword}`, replace: abbrevList },
  ];
  
  for (const { find, replace } of replacements) {
    const index = lowerRequest.indexOf(find);
    if (index !== -1) {
      processedRequest = request.substring(0, index) + replace + request.substring(index + find.length);
      console.log(`[PREPROCESS] Rewrote request: "${request}" -> "${processedRequest}"`);
      return { processedRequest, wasProcessed: true, matchedExercises: exerciseNames };
    }
  }
  
  return { processedRequest: request, wasProcessed: false, matchedExercises: [] };
};

// =============================================================================
// COMPRESSED ENCODING SYSTEM - System Prompt & Encoding Format
// =============================================================================

// Generate the abbreviation list for the system prompt
const generateAbbreviationList = (): string => {
  return Object.entries(EXERCISE_ABBREVIATIONS)
    .map(([abbrev, data]) => `${abbrev}=${data.name}`)
    .join(',');
};

// Compressed system prompt - output in same format as input
export const COMPRESSED_SYSTEM_PROMPT = `Modify workout queue. Output COMPLETE modified queue in SAME format.

FORMAT: Q<idx>:D<day>:ABBREV/weight/reps/sets,ABBREV/weight/reps/sets;Q<idx>:D<day>:...

ABBREVIATIONS: ${generateAbbreviationList()}

MUSCLES: chest=BBP,CHP,THM,IDP,DF|back=BDL,BOR,LP,TR,ODR,PU,RDL|shoulders=OHP,DSP,DAP,DLR,RDF|legs=BBS,LPR,LE,HSC,BLU,BSS,DGS,BHT|biceps=HC,SBC,PC|triceps=TPD,DSK|forearms=FC,RFC

RULES:
- Apply ALL requested changes
- NEVER remove exercises unless user says "remove"
- Keep ALL unchanged exercises exactly the same
- Output must have same number of exercises unless adding/removing

EXAMPLES:
In: Q0:D1:BBP/80/5/5,CHP/60/8/4,THM/40/8/3,DLR/15/10/3;Q1:D2:BDL/120/3/3
Req: "change BBP weight to 70, CHP weight to 50, THM weight to 35"
Out: Q0:D1:BBP/70/5/5,CHP/50/8/4,THM/35/8/3,DLR/15/10/3;Q1:D2:BDL/120/3/3

In: Q0:D1:BBP/80/5/5,BBS/100/5/5
Req: "remove squat"
Out: Q0:D1:BBP/80/5/5

Output ONLY the queue.`;

// =============================================================================
// COMPRESSED ENCODING - Encoder (Queue -> Compressed Input)
// =============================================================================

// Encode workout queue to compressed format for LLM input
export const encodeQueueForLLM = (queue: WorkoutQueueItem[]): string => {
  // Format: Q<index>:D<dayNum>:<exercise1Abbrev>/<weight>/<reps>/<sets>,<exercise2>...;Q<index>...
  const encoded = queue.map((item, queueIndex) => {
    const exercises = item.exercises.map(ex => {
      const abbrev = getExerciseAbbreviation(ex.name);
      // Use compact format: ABBREV/weight/reps/sets
      return `${abbrev}/${ex.weight || '0'}/${ex.reps || '8-12'}/${ex.sets || '3'}`;
    }).join(',');
    
    return `Q${queueIndex}:D${item.dayNumber}:${exercises}`;
  }).join(';');
  
  return encoded;
};

// Build compressed prompt for LLM
export const buildCompressedPrompt = (
  userRequest: string,
  queue: WorkoutQueueItem[]
): string => {
  const encodedQueue = encodeQueueForLLM(queue);
  return `Queue:${encodedQueue}
Request:${userRequest}`;
};

// =============================================================================
// COMPRESSED ENCODING - Decoder (Compressed Output -> Queue Changes)
// =============================================================================

export interface CompressedChange {
  type: 'weight' | 'reps' | 'sets' | 'remove' | 'add' | 'swap';
  queueIndex: number;
  exerciseIndex?: number;
  value?: string;
  newExerciseAbbrev?: string;
  newWeight?: string;
  newReps?: string;
  newSets?: string;
}

// Parse a single compressed change token
const parseCompressedToken = (token: string): CompressedChange | null => {
  const trimmed = token.trim();
  if (!trimmed || trimmed === 'NOCHANGE') return null;
  
  try {
    // Add operation: <queueIndex>.+<ABBREV>.w<weight>.r<reps>.s<sets>
    const addMatch = trimmed.match(/^(\d+)\.\+([A-Z]+)(?:\.w([^.]+))?(?:\.r([^.]+))?(?:\.s([^.]+))?$/);
    if (addMatch) {
      return {
        type: 'add',
        queueIndex: parseInt(addMatch[1], 10),
        newExerciseAbbrev: addMatch[2],
        newWeight: addMatch[3] || '0',
        newReps: addMatch[4] || '8-12',
        newSets: addMatch[5] || '3',
      };
    }
    
    // Swap operation: <queueIndex>.<exerciseIndex>.sw<ABBREV>
    const swapMatch = trimmed.match(/^(\d+)\.(\d+)\.sw([A-Z]+)$/);
    if (swapMatch) {
      return {
        type: 'swap',
        queueIndex: parseInt(swapMatch[1], 10),
        exerciseIndex: parseInt(swapMatch[2], 10),
        newExerciseAbbrev: swapMatch[3],
      };
    }
    
    // Remove operation: <queueIndex>.<exerciseIndex>.x
    const removeMatch = trimmed.match(/^(\d+)\.(\d+)\.x$/);
    if (removeMatch) {
      return {
        type: 'remove',
        queueIndex: parseInt(removeMatch[1], 10),
        exerciseIndex: parseInt(removeMatch[2], 10),
      };
    }
    
    // Weight change: <queueIndex>.<exerciseIndex>.w<value>
    const weightMatch = trimmed.match(/^(\d+)\.(\d+)\.w(.+)$/);
    if (weightMatch) {
      return {
        type: 'weight',
        queueIndex: parseInt(weightMatch[1], 10),
        exerciseIndex: parseInt(weightMatch[2], 10),
        value: weightMatch[3],
      };
    }
    
    // Reps change: <queueIndex>.<exerciseIndex>.r<value>
    const repsMatch = trimmed.match(/^(\d+)\.(\d+)\.r(.+)$/);
    if (repsMatch) {
      return {
        type: 'reps',
        queueIndex: parseInt(repsMatch[1], 10),
        exerciseIndex: parseInt(repsMatch[2], 10),
        value: repsMatch[3],
      };
    }
    
    // Sets change: <queueIndex>.<exerciseIndex>.s<value>
    const setsMatch = trimmed.match(/^(\d+)\.(\d+)\.s(.+)$/);
    if (setsMatch) {
      return {
        type: 'sets',
        queueIndex: parseInt(setsMatch[1], 10),
        exerciseIndex: parseInt(setsMatch[2], 10),
        value: setsMatch[3],
      };
    }
    
    console.warn('Unknown compressed token format:', trimmed);
    return null;
  } catch (error) {
    console.error('Error parsing compressed token:', trimmed, error);
    return null;
  }
};

// Parse full compressed response from LLM
export const parseCompressedResponse = (response: string): CompressedChange[] => {
  const trimmed = response.trim();
  
  // Handle NOCHANGE as the entire response
  if (trimmed === 'NOCHANGE' || trimmed === '') {
    return [];
  }
  
  // First, split by newlines and only keep lines that look like valid change tokens
  // Valid tokens start with a digit (queue index) like "0.0.w84" or "1.+HC.w20"
  const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Find lines that contain valid change tokens (start with digit and contain a dot)
  const validLines: string[] = [];
  for (const line of lines) {
    // A valid change line starts with a digit followed by a dot
    if (/^\d+\./.test(line)) {
      // Only take the part before any whitespace or invalid characters
      // This handles cases where LLM adds extra text after the token
      const match = line.match(/^[\d.+\-\w|]+/);
      if (match) {
        validLines.push(match[0]);
      }
    }
    // Ignore NOCHANGE if it appears alongside valid changes
    // (LLM sometimes outputs both the change AND "NOCHANGE" confusingly)
  }
  
  // If no valid lines found, check if first line is NOCHANGE
  if (validLines.length === 0) {
    if (lines[0] === 'NOCHANGE') {
      return [];
    }
    // Try the first line anyway (might be a single token)
    validLines.push(lines[0]);
  }
  
  // Now split by | and parse each token
  const changes: CompressedChange[] = [];
  for (const line of validLines) {
    const tokens = line.split('|').map(t => t.trim()).filter(t => t.length > 0);
    
    for (const token of tokens) {
      const parsed = parseCompressedToken(token);
      if (parsed) {
        changes.push(parsed);
        console.log('[COMPRESSED] Successfully parsed token:', token, '->', parsed);
      }
    }
  }
  
  return changes;
};

// =============================================================================
// QUEUE FORMAT PARSER - Parse LLM output in same format as input
// =============================================================================

// Parse queue format output: Q0:D1:BBP/80/5/5,BBS/100/5/5;Q1:D2:BDL/120/3/3
export const parseQueueFormatResponse = (
  response: string,
  originalQueue: WorkoutQueueItem[]
): WorkoutQueueItem[] | null => {
  try {
    const trimmed = response.trim();
    console.log('[QUEUE FORMAT] Parsing response:', trimmed);
    
    // Find the queue format string (starts with Q and contains :D)
    // Handle cases where LLM adds extra text before/after
    const queueMatch = trimmed.match(/Q\d+:D\d+:[^;]+(;Q\d+:D\d+:[^;]+)*/);
    if (!queueMatch) {
      console.warn('[QUEUE FORMAT] No queue format found in response');
      return null;
    }
    
    const queueString = queueMatch[0];
    console.log('[QUEUE FORMAT] Extracted queue string:', queueString);
    
    // Split into queue items by ;
    const queueItemStrings = queueString.split(';').filter(s => s.trim().length > 0);
    
    const newQueue: WorkoutQueueItem[] = [];
    
    for (const itemString of queueItemStrings) {
      // Parse: Q<index>:D<dayNum>:<exercises>
      const match = itemString.match(/Q(\d+):D(\d+):(.+)/);
      if (!match) {
        console.warn('[QUEUE FORMAT] Could not parse queue item:', itemString);
        continue;
      }
      
      const queueIndex = parseInt(match[1], 10);
      const dayNumber = parseInt(match[2], 10);
      const exercisesString = match[3];
      
      // Get original queue item to preserve id, programId, programName
      const originalItem = originalQueue[queueIndex];
      if (!originalItem) {
        console.warn('[QUEUE FORMAT] No original queue item at index:', queueIndex);
        continue;
      }
      
      // Parse exercises: ABBREV/weight/reps/sets,ABBREV/weight/reps/sets
      const exerciseStrings = exercisesString.split(',').filter(s => s.trim().length > 0);
      const exercises: ProgramExercise[] = [];
      
      for (const exString of exerciseStrings) {
        const parts = exString.split('/');
        if (parts.length < 4) {
          console.warn('[QUEUE FORMAT] Invalid exercise format:', exString);
          continue;
        }
        
        const abbrev = parts[0].trim();
        const weight = parts[1]?.trim() || '0';
        const reps = parts[2]?.trim() || '8-12';
        const sets = parts[3]?.trim() || '3';
        
        // Look up exercise data from abbreviation
        const exerciseData = getExerciseFromAbbreviation(abbrev);
        
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
          // If abbreviation not found, try to find matching exercise in original
          const originalEx = originalItem.exercises.find(
            ex => getExerciseAbbreviation(ex.name) === abbrev || ex.name.includes(abbrev)
          );
          if (originalEx) {
            exercises.push({
              ...originalEx,
              weight,
              reps,
              sets,
            });
          } else {
            console.warn('[QUEUE FORMAT] Unknown exercise abbreviation:', abbrev);
            // Add with abbreviation as name as fallback
            exercises.push({
              name: abbrev,
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
        dayNumber: dayNumber,
        exercises,
      });
    }
    
    console.log('[QUEUE FORMAT] Parsed', newQueue.length, 'queue items');
    return newQueue.length > 0 ? newQueue : null;
  } catch (error) {
    console.error('[QUEUE FORMAT] Error parsing response:', error);
    return null;
  }
};

// Apply compressed changes to workout queue
export const applyCompressedChanges = (
  queue: WorkoutQueueItem[],
  changes: CompressedChange[]
): WorkoutQueueItem[] => {
  // Deep clone the queue to avoid mutations
  const newQueue: WorkoutQueueItem[] = JSON.parse(JSON.stringify(queue));
  
  // Track removals to process after other changes
  const removals: { queueIndex: number; exerciseIndex: number }[] = [];
  
  for (const change of changes) {
    const queueItem = newQueue[change.queueIndex];
    if (!queueItem) {
      console.warn(`Queue index ${change.queueIndex} out of bounds`);
      continue;
    }
    
    switch (change.type) {
      case 'weight':
        if (change.exerciseIndex !== undefined && queueItem.exercises[change.exerciseIndex]) {
          queueItem.exercises[change.exerciseIndex].weight = change.value || '0';
        }
        break;
        
      case 'reps':
        if (change.exerciseIndex !== undefined && queueItem.exercises[change.exerciseIndex]) {
          queueItem.exercises[change.exerciseIndex].reps = change.value || '8-12';
        }
        break;
        
      case 'sets':
        if (change.exerciseIndex !== undefined && queueItem.exercises[change.exerciseIndex]) {
          queueItem.exercises[change.exerciseIndex].sets = change.value || '3';
        }
        break;
        
      case 'remove':
        if (change.exerciseIndex !== undefined) {
          removals.push({ queueIndex: change.queueIndex, exerciseIndex: change.exerciseIndex });
        }
        break;
        
      case 'add':
        if (change.newExerciseAbbrev) {
          const exerciseData = getExerciseFromAbbreviation(change.newExerciseAbbrev);
          if (exerciseData) {
            const newExercise: ProgramExercise = {
              name: exerciseData.name,
              equipment: exerciseData.equipment,
              muscle_groups_worked: exerciseData.muscle_groups_worked,
              weight: change.newWeight || '0',
              reps: change.newReps || '8-12',
              sets: change.newSets || '3',
              restTime: '180',
              progression: '',
            };
            queueItem.exercises.push(newExercise);
          } else {
            console.warn(`Unknown exercise abbreviation: ${change.newExerciseAbbrev}`);
          }
        }
        break;
        
      case 'swap':
        if (change.exerciseIndex !== undefined && change.newExerciseAbbrev) {
          const exerciseData = getExerciseFromAbbreviation(change.newExerciseAbbrev);
          if (exerciseData && queueItem.exercises[change.exerciseIndex]) {
            const oldExercise = queueItem.exercises[change.exerciseIndex];
            queueItem.exercises[change.exerciseIndex] = {
              name: exerciseData.name,
              equipment: exerciseData.equipment,
              muscle_groups_worked: exerciseData.muscle_groups_worked,
              weight: oldExercise.weight || '0',
              reps: oldExercise.reps || '8-12',
              sets: oldExercise.sets || '3',
              restTime: oldExercise.restTime || '180',
              progression: oldExercise.progression || '',
            };
          } else {
            console.warn(`Unknown exercise abbreviation for swap: ${change.newExerciseAbbrev}`);
          }
        }
        break;
    }
  }
  
  // Process removals in reverse order to maintain correct indices
  removals.sort((a, b) => {
    if (a.queueIndex !== b.queueIndex) return b.queueIndex - a.queueIndex;
    return b.exerciseIndex - a.exerciseIndex;
  });
  
  for (const removal of removals) {
    const queueItem = newQueue[removal.queueIndex];
    if (queueItem && queueItem.exercises[removal.exerciseIndex]) {
      queueItem.exercises.splice(removal.exerciseIndex, 1);
    }
  }
  
  return newQueue;
};

// Convert compressed changes to ProposedChanges for UI display
export const compressedChangesToProposed = (
  changes: CompressedChange[],
  originalQueue: WorkoutQueueItem[]
): ProposedChanges => {
  const weightChanges: ProposedChanges['weightChanges'] = [];
  const removals: ProposedChanges['removals'] = [];
  const additions: ProposedChanges['additions'] = [];
  const swaps: ProposedChanges['swaps'] = [];
  
  for (const change of changes) {
    const queueItem = originalQueue[change.queueIndex];
    if (!queueItem) continue;
    
    switch (change.type) {
      case 'weight':
        if (change.exerciseIndex !== undefined) {
          const exercise = queueItem.exercises[change.exerciseIndex];
          if (exercise) {
            weightChanges.push({
              queueItemId: queueItem.id,
              queueItemName: queueItem.programName,
              dayNumber: queueItem.dayNumber,
              exerciseName: exercise.name,
              oldWeight: exercise.weight || '0',
              newWeight: change.value || '0',
            });
          }
        }
        break;
        
      case 'remove':
        if (change.exerciseIndex !== undefined) {
          const exercise = queueItem.exercises[change.exerciseIndex];
          if (exercise) {
            removals.push({
              queueItemId: queueItem.id,
              queueItemName: queueItem.programName,
              dayNumber: queueItem.dayNumber,
              exerciseName: exercise.name,
              muscleGroup: exercise.muscle_groups_worked?.[0] || 'unknown',
            });
          }
        }
        break;
        
      case 'add':
        if (change.newExerciseAbbrev) {
          const exerciseData = getExerciseFromAbbreviation(change.newExerciseAbbrev);
          if (exerciseData) {
            additions.push({
              queueItemId: queueItem.id,
              queueItemName: queueItem.programName,
              dayNumber: queueItem.dayNumber,
              exerciseName: exerciseData.name,
              weight: change.newWeight || '0',
              reps: change.newReps || '8-12',
              sets: change.newSets || '3',
              equipment: exerciseData.equipment,
              muscle_groups_worked: exerciseData.muscle_groups_worked,
            });
          }
        }
        break;
        
      case 'swap':
        if (change.exerciseIndex !== undefined && change.newExerciseAbbrev) {
          const oldExercise = queueItem.exercises[change.exerciseIndex];
          const newExerciseData = getExerciseFromAbbreviation(change.newExerciseAbbrev);
          if (oldExercise && newExerciseData) {
            swaps.push({
              queueItemId: queueItem.id,
              queueItemName: queueItem.programName,
              dayNumber: queueItem.dayNumber,
              oldExerciseName: oldExercise.name,
              newExerciseName: newExerciseData.name,
            });
          }
        }
        break;
    }
  }
  
  return { weightChanges, removals, additions, swaps };
};

// DEPRECATED: Old system prompt - kept for backwards compatibility
export const WORKOUT_MODIFICATION_SYSTEM_PROMPT = `Modify workout queue. Items: id,programName,dayNumber,exercises[]. Exercises: name,equipment,muscle_groups_worked[],weight,reps,sets,restTime,progression. Use EXACT queueItemId from queue data. Do NOT use "q1".

JSON: 3 separate top-level arrays: "changes", "removedByMuscleGroup", "additions" (NOT nested).
{"action":"modify_queue","changes":[...],"removedByMuscleGroup":[...],"additions":[...]}

Weight: changes=[{"queueItemId":"EXACT_ID","exerciseName":"EXACT_NAME","operation":"update_weight","newWeight":"str"}], others=[].
Remove: removedByMuscleGroup=[{"queueItemId":"EXACT_ID","exerciseName":"EXACT_NAME","muscleGroup":"str"}], others=[].
Add: additions=[{"queueItemId":"EXACT_ID","exerciseName":"EXACT_NAME","weight":"str","reps":"str","sets":"str","restTime":"str","progression":"str","equipment":"str","muscle_groups_worked":["str"]}], others=[].
Swap: changes=[{"queueItemId":"EXACT_ID","exerciseName":"EXACT_NAME","operation":"swap","swapWith":"str"}], others=[].

Rules: One array type only. Use EXACT queueItemId from queue. Use EXACT exercise names. Match exactly. Remove ALL where muscle group matches. Defaults: weight="0",reps="8-12",sets="3",restTime="180",progression="". Output ONLY JSON, no text before/after, no markdown, no code blocks.

Examples:
"Change bench press to 84 kg"->{"action":"modify_queue","changes":[{"queueItemId":"queue-123","exerciseName":"Bench Press","operation":"update_weight","newWeight":"84 kg"}],"removedByMuscleGroup":[],"additions":[]}
"Remove chest exercises"->{"action":"modify_queue","changes":[],"removedByMuscleGroup":[{"queueItemId":"queue-123","exerciseName":"Bench Press","muscleGroup":"chest"}],"additions":[]}
"Add barbell curl"->{"action":"modify_queue","changes":[],"removedByMuscleGroup":[],"additions":[{"queueItemId":"queue-123","exerciseName":"Barbell Curl","weight":"0","reps":"8-12","sets":"3","restTime":"180","progression":"","equipment":"barbell","muscle_groups_worked":["biceps"]}]}`;

// NEW: Simplified system prompt that asks for complete workout queue
export const WORKOUT_QUEUE_GENERATION_SYSTEM_PROMPT = `Return ONLY a compact JSON ARRAY (no whitespace, no pretty printing) starting with [ and ending with ]. No markdown or text.

Format: [{"id":"...","programId":"...","programName":"...","dayNumber":N,"exercises":[{"name":"...","equipment":"...","muscle_groups_worked":["..."],"weight":"...","reps":"...","sets":"...","restTime":"...","progression":"..."}]},...]

Example: [{"id":"q1","programId":"p1","programName":"Program","dayNumber":1,"exercises":[{"name":"Bench","equipment":"Barbell","muscle_groups_worked":["chest"],"weight":"60kg","reps":"5","sets":"5","restTime":"180","progression":""}]}]

RULES:
- Return ALL queue items and ALL exercises from input, even if unchanged
- Only modify what the user requests to change
- Preserve IDs, programId, programName, dayNumber exactly
- Defaults for new exercises: weight="0", reps="8-12", sets="3", restTime="180", progression=""
- Keep same order unless user requests reordering
- Output must be COMPACT (no line breaks, no indentation, no extra spaces)`;

// Types for modifications
export interface WeightChange {
  queueItemId: string;
  exerciseName: string;
  operation: 'update_weight';
  newWeight: string;
}

export interface SwapChange {
  queueItemId: string;
  exerciseName: string;
  operation: 'swap';
  swapWith: string;
}

export interface RemovalByMuscleGroup {
  queueItemId: string;
  exerciseName: string;
  muscleGroup: string;
}

export interface ExerciseAddition {
  queueItemId: string;
  exerciseName: string;
  weight: string;
  reps: string;
  sets: string;
  restTime: string;
  progression: string;
  equipment: string;
  muscle_groups_worked: string[];
}

export interface WorkoutModification {
  action: 'modify_queue';
  changes: Array<WeightChange | SwapChange>;
  removedByMuscleGroup: RemovalByMuscleGroup[];
  additions: ExerciseAddition[];
}

export interface ProposedChanges {
  weightChanges: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    oldWeight: string;
    newWeight: string;
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

// Load current workout queue
export const loadWorkoutQueue = async (): Promise<WorkoutQueueItem[]> => {
  try {
    const stored = await AsyncStorage.getItem(WORKOUT_QUEUE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  } catch (error) {
    console.error('Error loading workout queue:', error);
    return [];
  }
};

// Parse LLM response and extract modifications
export const parseModificationResponse = (response: string): WorkoutModification | null => {
  try {
    // Log the raw response for debugging
    console.log('Raw LLM response:', response);
    console.log('Response length:', response.length);
    
    // Try to extract the first complete JSON object from response
    // Look for the first complete JSON object by finding the first { and matching braces
    let braceCount = 0;
    let startIndex = response.indexOf('{');
    if (startIndex === -1) {
      console.warn('No JSON object found in response');
      return null;
    }
    
    let endIndex = startIndex;
    for (let i = startIndex; i < response.length; i++) {
      if (response[i] === '{') braceCount++;
      if (response[i] === '}') braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }
    
    if (braceCount !== 0) {
      console.warn('Incomplete JSON object in response');
      return null;
    }
    
    const jsonString = response.substring(startIndex, endIndex + 1);
    console.log('Extracted JSON string:', jsonString);
    const parsed = JSON.parse(jsonString);
    if (parsed.action === 'modify_queue') {
      return parsed as WorkoutModification;
    }
    console.warn('Parsed JSON does not have action="modify_queue"');
    return null;
  } catch (error) {
    console.error('Error parsing modification response:', error);
    console.error('Response that failed to parse:', response);
    return null;
  }
};

// Build user prompt with current queue data
export const buildModificationPrompt = (
  userRequest: string,
  queue: WorkoutQueueItem[],
  availableExercises?: Array<{ name: string; equipment: string; muscle_groups_worked: string[] }>
): string => {
  // Create a minimal version of the queue (compact format)
  const simplifiedQueue = queue.map(item => ({
    id: item.id,
    programName: item.programName,
    dayNumber: item.dayNumber,
    exercises: item.exercises.map(ex => ({
      name: ex.name,
      weight: ex.weight,
      muscle_groups_worked: ex.muscle_groups_worked,
    })),
  }));

  // Use compact JSON (no pretty printing) to save characters
  let prompt = `Queue:${JSON.stringify(simplifiedQueue)} Request:${userRequest}`;

  // Include available exercises if provided (for add/swap operations)
  if (availableExercises && availableExercises.length > 0) {
    // Reduce to 25 exercises to save space
    const limitedExercises = availableExercises.slice(0, 25).map(ex => ({
      name: ex.name,
      equipment: ex.equipment,
      muscle_groups_worked: ex.muscle_groups_worked,
    }));
    
    // Use compact JSON format
    prompt += ` Exercises:${JSON.stringify(limitedExercises)}`;
  }

  return prompt;
};

// Convert modifications to user-friendly format for display
export const formatProposedChanges = (
  modifications: WorkoutModification,
  queue: WorkoutQueueItem[]
): ProposedChanges => {
  const weightChanges: ProposedChanges['weightChanges'] = [];
  const removals: ProposedChanges['removals'] = [];
  const additions: ProposedChanges['additions'] = [];
  const swaps: ProposedChanges['swaps'] = [];

  modifications.changes.forEach(change => {
    if (change.operation === 'update_weight') {
      const queueItem = queue.find(item => item.id === change.queueItemId);
      if (!queueItem) {
        console.warn(`Queue item not found for ID: ${change.queueItemId}`);
        console.log('Available queue item IDs:', queue.map(item => item.id));
        return;
      }
      const exercise = queueItem.exercises.find(ex => ex.name === change.exerciseName);
      if (!exercise) {
        console.warn(`Exercise "${change.exerciseName}" not found in queue item ${change.queueItemId}`);
        console.log('Available exercises:', queueItem.exercises.map(ex => ex.name));
        return;
      }
      weightChanges.push({
        queueItemId: change.queueItemId,
        queueItemName: queueItem.programName,
        dayNumber: queueItem.dayNumber,
        exerciseName: change.exerciseName,
        oldWeight: exercise.weight,
        newWeight: change.newWeight,
      });
    } else if (change.operation === 'swap') {
      const queueItem = queue.find(item => item.id === change.queueItemId);
      if (queueItem) {
        swaps.push({
          queueItemId: change.queueItemId,
          queueItemName: queueItem.programName,
          dayNumber: queueItem.dayNumber,
          oldExerciseName: change.exerciseName,
          newExerciseName: change.swapWith,
        });
      }
    }
  });

  modifications.removedByMuscleGroup.forEach(removal => {
    const queueItem = queue.find(item => item.id === removal.queueItemId);
    if (queueItem) {
      removals.push({
        queueItemId: removal.queueItemId,
        queueItemName: queueItem.programName,
        dayNumber: queueItem.dayNumber,
        exerciseName: removal.exerciseName,
        muscleGroup: removal.muscleGroup,
      });
    }
  });

  modifications.additions.forEach(addition => {
    const queueItem = queue.find(item => item.id === addition.queueItemId);
    if (queueItem) {
      additions.push({
        queueItemId: addition.queueItemId,
        queueItemName: queueItem.programName,
        dayNumber: queueItem.dayNumber,
        exerciseName: addition.exerciseName,
        weight: addition.weight,
        reps: addition.reps,
        sets: addition.sets,
        equipment: addition.equipment,
        muscle_groups_worked: addition.muscle_groups_worked,
      });
    }
  });

  return { weightChanges, removals, additions, swaps };
};

// Apply modifications to workout queue (DEPRECATED - kept for backwards compatibility)
export const applyModifications = async (
  modifications: WorkoutModification,
  availableExercises?: Array<{ name: string; equipment: string; muscle_groups_worked: string[] }>
): Promise<boolean> => {
  try {
    const queue = await loadWorkoutQueue();
    let modified = false;

    // Apply weight changes
    modifications.changes.forEach(change => {
      if (change.operation === 'update_weight') {
        const queueItem = queue.find(item => item.id === change.queueItemId);
        if (queueItem) {
          const exercise = queueItem.exercises.find(ex => ex.name === change.exerciseName);
          if (exercise) {
            exercise.weight = change.newWeight;
            modified = true;
          }
        }
      } else if (change.operation === 'swap') {
        // Swap exercise: replace old exercise with new one
        const queueItem = queue.find(item => item.id === change.queueItemId);
        if (queueItem) {
          const exerciseIndex = queueItem.exercises.findIndex(
            ex => ex.name === change.exerciseName
          );
          if (exerciseIndex !== -1) {
            // Find the new exercise in available exercises
            const newExerciseData = availableExercises?.find(
              ex => ex.name === change.swapWith
            );
            
            if (newExerciseData) {
              // Get the old exercise to preserve some settings
              const oldExercise = queueItem.exercises[exerciseIndex];
              
              // Create new exercise with preserved settings or defaults
              const newExercise: ProgramExercise = {
                name: newExerciseData.name,
                equipment: newExerciseData.equipment,
                muscle_groups_worked: newExerciseData.muscle_groups_worked,
                weight: oldExercise.weight || '0',
                reps: oldExercise.reps || '8-12',
                sets: oldExercise.sets || '3',
                restTime: oldExercise.restTime || '180',
                progression: oldExercise.progression || '',
              };
              
              // Replace the exercise
              queueItem.exercises[exerciseIndex] = newExercise;
              modified = true;
            }
          }
        }
      }
    });

    // Apply removals by muscle group
    modifications.removedByMuscleGroup.forEach(removal => {
      const queueItem = queue.find(item => item.id === removal.queueItemId);
      if (queueItem) {
        const exerciseIndex = queueItem.exercises.findIndex(
          ex => ex.name === removal.exerciseName
        );
        if (exerciseIndex !== -1) {
          queueItem.exercises.splice(exerciseIndex, 1);
          modified = true;
        }
      }
    });

    // Apply additions
    modifications.additions.forEach(addition => {
      const queueItem = queue.find(item => item.id === addition.queueItemId);
      if (queueItem) {
        const newExercise: ProgramExercise = {
          name: addition.exerciseName,
          equipment: addition.equipment,
          muscle_groups_worked: addition.muscle_groups_worked,
          weight: addition.weight,
          reps: addition.reps,
          sets: addition.sets,
          restTime: addition.restTime,
          progression: addition.progression,
        };
        queueItem.exercises.push(newExercise);
        modified = true;
      }
    });

    // Remove queue items that have no exercises left
    const filteredQueue = queue.filter(item => item.exercises.length > 0);

    if (modified) {
      await AsyncStorage.setItem(
        WORKOUT_QUEUE_STORAGE_KEY,
        JSON.stringify(filteredQueue, null, 2)
      );
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error applying modifications:', error);
    return false;
  }
};

// NEW: Build prompt that includes ONLY workout queue context (no other user data)
export const buildQueueGenerationPrompt = (
  userRequest: string,
  queue: WorkoutQueueItem[]
): string => {
  // Filter to include ONLY workout queue relevant fields
  // Exclude any non-queue data like user profile, workout history, etc.
  // Include only essential fields needed for modifications
  const queueData = queue.map(item => ({
    id: item.id,
    programId: item.programId,
    programName: item.programName,
    dayNumber: item.dayNumber,
    exercises: item.exercises.map(ex => ({
      name: ex.name,
      equipment: ex.equipment,
      muscle_groups_worked: ex.muscle_groups_worked,
      weight: ex.weight || '',
      reps: ex.reps || '',
      sets: ex.sets || '',
      restTime: ex.restTime || '',
      progression: ex.progression || '',
    })),
  }));
  
  // Use compact JSON (no pretty printing, no spaces) to minimize context size
  const queueJSON = JSON.stringify(queueData);
  
  // Minimal user prompt - system prompt already contains all detailed instructions
  // Just provide the data and the request
  return `Queue:${queueJSON}
Request:${userRequest}`;
};

// Helper function to attempt fixing malformed JSON where IDs are used as object keys
const attemptFixMalformedQueueResponse = (response: string): string | null => {
  try {
    // Check if response starts with { and has queue IDs as keys (malformed format)
    const trimmed = response.trim();
    if (!trimmed.startsWith('{')) {
      return null; // Not the malformed format we're trying to fix
    }
    
    // Try to find patterns like "queue-xxx", to detect if IDs are being used as keys
    const queueIdPattern = /"queue-\d+-\d+"/g;
    const matches = trimmed.match(queueIdPattern);
    
    if (!matches || matches.length === 0) {
      return null; // Doesn't match our expected malformed pattern
    }
    
    console.warn('Attempting to fix malformed JSON response where queue IDs are used as object keys...');
    
    // This is a complex fix - for now, just log and return null
    // A proper fix would need to parse the malformed structure and convert it
    console.error('Malformed JSON detected: Queue items appear to be object keys instead of array elements');
    console.error('The model output format is incorrect. Expected array format like: [{"id":"queue-xxx",...},...]');
    console.error('But got object format like: {"queue-xxx":...,"programId":...}');
    
    return null;
  } catch (e) {
    return null;
  }
};

// NEW: Parse the generated workout queue from LLM response
export const parseGeneratedQueue = (
  response: string,
  originalQueue?: WorkoutQueueItem[]
): WorkoutQueueItem[] | null => {
  try {
    // Clean the response - remove markdown code blocks if present
    let cleanedResponse = response.trim();
    
    // Remove markdown code blocks
    if (cleanedResponse.startsWith('```')) {
      const lines = cleanedResponse.split('\n');
      // Remove first line (```json or ```)
      lines.shift();
      // Remove last line (```)
      if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
        lines.pop();
      }
      cleanedResponse = lines.join('\n').trim();
    }
    
    // Try to extract JSON array - use bracket matching to find the correct closing bracket
    let startIndex = cleanedResponse.indexOf('[');
    if (startIndex === -1) {
      // Model might have output an object instead of array - try to find first {
      const objectStart = cleanedResponse.indexOf('{');
      if (objectStart !== -1) {
        console.warn('Response starts with object { instead of array [');
        // Try to fix malformed response
        const fixed = attemptFixMalformedQueueResponse(cleanedResponse);
        if (fixed) {
          cleanedResponse = fixed;
          startIndex = cleanedResponse.indexOf('[');
        } else {
          console.error('Invalid JSON format: Expected array starting with [, got object starting with {');
          console.error('Response preview:', cleanedResponse.substring(0, 500));
          console.error('The model needs to output an array format: [{"id":"...",...},...]');
          return null;
        }
      } else {
        console.warn('No JSON array or object start found in response');
        return null;
      }
    }
    
    // IMPROVED: Count both square brackets AND curly braces to ensure complete JSON
    let bracketCount = 0;
    let braceCount = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startIndex; i < cleanedResponse.length; i++) {
      const char = cleanedResponse[i];
      
      // Handle string literals (don't count brackets/braces inside strings)
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      // Count brackets and braces
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      
      // Only consider the array complete when both brackets and braces are balanced
      if (bracketCount === 0 && braceCount === 0 && i > startIndex) {
        endIndex = i;
        break;
      }
    }
    
    if (endIndex === -1 || bracketCount !== 0 || braceCount !== 0) {
      console.warn('JSON array appears to be truncated or incomplete');
      console.warn('Bracket count:', bracketCount, 'Brace count:', braceCount);
      console.warn('Response length:', cleanedResponse.length);
      console.warn('Response preview:', cleanedResponse.substring(startIndex, Math.min(startIndex + 1000, cleanedResponse.length)));
      
      // Try to parse what we have anyway (might be recoverable)
      const jsonString = cleanedResponse.substring(startIndex);
      try {
        const parsed = JSON.parse(jsonString);
        if (Array.isArray(parsed)) {
          console.warn('Successfully parsed incomplete JSON - some data may be missing');
          // Validate items before returning
          const validItems = parsed.filter((item: any) => {
            return item && 
                   item.id && 
                   item.programName && 
                   typeof item.dayNumber === 'number' &&
                   Array.isArray(item.exercises);
          });
          if (validItems.length > 0) {
            return validItems as WorkoutQueueItem[];
          }
        }
      } catch (e) {
        // If we can't parse it, return null
        return null;
      }
      
      return null;
    }
    
    const jsonString = cleanedResponse.substring(startIndex, endIndex + 1);
    
    // Validate JSON completeness by checking if it parses
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('JSON parse error - response may be malformed or truncated:', parseError);
      console.error('JSON string length:', jsonString.length);
      console.error('JSON string preview (first 1000 chars):', jsonString.substring(0, 1000));
      
      // Try to fix common issues: if response starts with { instead of [
      if (jsonString.trim().startsWith('{') && !jsonString.trim().startsWith('[{')) {
        console.error('ERROR: Response is an object {} instead of an array []');
        console.error('The model failed to follow the format instructions. Response should start with [');
        console.error('First 200 chars of response:', jsonString.substring(0, 200));
      }
      
      return null;
    }
    
    // Validate it's an array
    if (!Array.isArray(parsed)) {
      console.warn('Parsed JSON is not an array');
      return null;
    }
    
    // Try to fix missing programId by matching with original queue
    if (originalQueue && originalQueue.length > 0) {
      const originalQueueMap = new Map(originalQueue.map(item => [item.id, item]));
      parsed.forEach((item: any) => {
        if (item && item.id && !item.programId) {
          const originalItem = originalQueueMap.get(item.id);
          if (originalItem) {
            item.programId = originalItem.programId;
            console.log('Inferred programId for item', item.id, ':', item.programId);
          }
        }
      });
    }
    
    // NEW: Validate that all items have required fields
    const validItems = parsed.filter((item: any) => {
      const isValid = item && 
             item.id && 
             item.programId &&
             item.programName && 
             typeof item.dayNumber === 'number' &&
             Array.isArray(item.exercises);
      
      if (!isValid) {
        console.warn('Invalid queue item:', {
          hasId: !!item?.id,
          hasProgramId: !!item?.programId,
          hasProgramName: !!item?.programName,
          hasDayNumber: typeof item?.dayNumber === 'number',
          hasExercises: Array.isArray(item?.exercises),
          item: JSON.stringify(item).substring(0, 200)
        });
      }
      
      return isValid;
    });
    
    if (validItems.length !== parsed.length) {
      console.warn(`Filtered out ${parsed.length - validItems.length} invalid queue items`);
      console.warn('Parsed items:', parsed.length, 'Valid items:', validItems.length);
      if (parsed.length > 0) {
        console.warn('Sample invalid item:', JSON.stringify(parsed.find((item: any) => {
          return !(item && item.id && item.programId && item.programName && 
                   typeof item.dayNumber === 'number' && Array.isArray(item.exercises));
        })).substring(0, 500));
      }
    }
    
    if (validItems.length === 0) {
      console.warn('No valid queue items found in parsed JSON');
      console.warn('Full parsed array:', JSON.stringify(parsed, null, 2).substring(0, 1000));
      return null;
    }
    
    return validItems as WorkoutQueueItem[];
  } catch (error) {
    console.error('Error parsing generated queue:', error);
    console.error('Response that failed to parse:', response.substring(0, 500));
    return null;
  }
};

// NEW: Compare two workout queues and extract differences
export interface QueueDifference {
  type: 'weight_change' | 'removed' | 'added' | 'modified' | 'exercise_swap';
  queueItemId: string;
  queueItemName: string;
  dayNumber: number;
  exerciseName?: string;
  oldExercise?: ProgramExercise;
  newExercise?: ProgramExercise;
  oldWeight?: string;
  newWeight?: string;
  newExerciseName?: string;
  details?: string;
}

export const compareWorkoutQueues = (
  oldQueue: WorkoutQueueItem[],
  newQueue: WorkoutQueueItem[]
): QueueDifference[] => {
  const differences: QueueDifference[] = [];
  
  // Create maps for easy lookup
  const oldQueueMap = new Map(oldQueue.map(item => [item.id, item]));
  const newQueueMap = new Map(newQueue.map(item => [item.id, item]));
  
  // Check each item in the old queue
  for (const oldItem of oldQueue) {
    const newItem = newQueueMap.get(oldItem.id);
    
    if (!newItem) {
      // Entire queue item was removed - add all exercises as removals
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
    
    // Compare exercises within the same queue item
    const oldExercisesMap = new Map(oldItem.exercises.map((ex, idx) => [ex.name, { exercise: ex, index: idx }]));
    const newExercisesMap = new Map(newItem.exercises.map((ex, idx) => [ex.name, { exercise: ex, index: idx }]));
    
    // Check for removed exercises
    for (const [exerciseName, { exercise: oldExercise }] of oldExercisesMap) {
      if (!newExercisesMap.has(exerciseName)) {
        differences.push({
          type: 'removed',
          queueItemId: oldItem.id,
          queueItemName: oldItem.programName,
          dayNumber: oldItem.dayNumber,
          exerciseName: exerciseName,
          oldExercise: oldExercise,
        });
      }
    }
    
    // Check for added or modified exercises
    for (const [exerciseName, { exercise: newExercise }] of newExercisesMap) {
      const oldExerciseData = oldExercisesMap.get(exerciseName);
      
      if (!oldExerciseData) {
        // New exercise added
        differences.push({
          type: 'added',
          queueItemId: oldItem.id,
          queueItemName: oldItem.programName,
          dayNumber: oldItem.dayNumber,
          exerciseName: exerciseName,
          newExercise: newExercise,
        });
      } else {
        // Exercise exists in both - check for changes
        const oldExercise = oldExerciseData.exercise;
        
        // Check for weight change
        if (oldExercise.weight !== newExercise.weight) {
          differences.push({
            type: 'weight_change',
            queueItemId: oldItem.id,
            queueItemName: oldItem.programName,
            dayNumber: oldItem.dayNumber,
            exerciseName: exerciseName,
            oldWeight: oldExercise.weight,
            newWeight: newExercise.weight,
            oldExercise: oldExercise,
            newExercise: newExercise,
          });
        }
        
        // Check for other property changes (reps, sets, restTime, etc.)
        const hasOtherChanges = 
          oldExercise.reps !== newExercise.reps ||
          oldExercise.sets !== newExercise.sets ||
          oldExercise.restTime !== newExercise.restTime ||
          oldExercise.progression !== newExercise.progression ||
          JSON.stringify(oldExercise.muscle_groups_worked) !== JSON.stringify(newExercise.muscle_groups_worked) ||
          oldExercise.equipment !== newExercise.equipment;
        
        if (hasOtherChanges && oldExercise.weight === newExercise.weight) {
          // Only add as modified if weight didn't change (to avoid duplicate entries)
          differences.push({
            type: 'modified',
            queueItemId: oldItem.id,
            queueItemName: oldItem.programName,
            dayNumber: oldItem.dayNumber,
            exerciseName: exerciseName,
            oldExercise: oldExercise,
            newExercise: newExercise,
            details: [
              oldExercise.reps !== newExercise.reps ? `reps (${oldExercise.reps} → ${newExercise.reps})` : null,
              oldExercise.sets !== newExercise.sets ? `sets (${oldExercise.sets} → ${newExercise.sets})` : null,
              oldExercise.restTime !== newExercise.restTime ? `restTime (${oldExercise.restTime} → ${newExercise.restTime})` : null,
            ].filter(Boolean).join(', '),
          });
        }
      }
    }
  }
  
  // Check for new queue items that weren't in the old queue
  for (const newItem of newQueue) {
    if (!oldQueueMap.has(newItem.id)) {
      // Entirely new queue item - add all exercises as additions
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

// NEW: Convert differences to ProposedChanges format for display compatibility
export const differencesToProposedChanges = (
  differences: QueueDifference[]
): ProposedChanges => {
  const weightChanges: ProposedChanges['weightChanges'] = [];
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
      
      case 'modified':
        // For modifications that aren't weight changes, we can treat them as weight changes
        // if weight changed, otherwise skip (they're already captured in weight_change type)
        break;
    }
  }
  
  return { weightChanges, removals, additions, swaps };
};

// NEW: Merge exercises within a queue item, preserving exercises that weren't in the generated item
const mergeExercisesInQueueItem = (
  generatedItem: WorkoutQueueItem,
  originalItem: WorkoutQueueItem
): WorkoutQueueItem => {
  // If generated item has same or more exercises, check if we need to merge
  if (generatedItem.exercises.length >= originalItem.exercises.length) {
    // Check if all original exercises are present in generated
    const generatedExerciseNames = new Set(generatedItem.exercises.map(ex => ex.name));
    const allOriginalPresent = originalItem.exercises.every(ex => generatedExerciseNames.has(ex.name));
    
    if (allOriginalPresent) {
      // All exercises are present, use generated item
      return generatedItem;
    }
  }
  
  // Some exercises are missing, merge them
  console.log(`Merging exercises for item ${generatedItem.id}: generated has ${generatedItem.exercises.length}, original has ${originalItem.exercises.length}`);
  
  // Create a map of generated exercises by name
  const generatedExerciseMap = new Map(generatedItem.exercises.map(ex => [ex.name, ex]));
  
  // Build merged exercises: use generated exercises where available, otherwise use original
  const mergedExercises = originalItem.exercises.map(originalEx => {
    const generatedEx = generatedExerciseMap.get(originalEx.name);
    if (generatedEx) {
      // Use the generated (modified) exercise
      return generatedEx;
    } else {
      // Preserve the original exercise if it wasn't in the generated item
      console.log(`Preserving original exercise "${originalEx.name}" in item ${generatedItem.id}`);
      return originalEx;
    }
  });
  
  // Add any new exercises from generated item that weren't in original
  generatedItem.exercises.forEach(generatedEx => {
    if (!originalItem.exercises.find(ex => ex.name === generatedEx.name)) {
      mergedExercises.push(generatedEx);
    }
  });
  
  return {
    ...generatedItem,
    exercises: mergedExercises
  };
};

// NEW: Merge generated queue with original queue to preserve missing items and exercises
export const mergeQueueWithOriginal = (
  generatedQueue: WorkoutQueueItem[],
  originalQueue: WorkoutQueueItem[]
): WorkoutQueueItem[] => {
  // Create a map of generated items by ID
  const generatedMap = new Map(generatedQueue.map(item => [item.id, item]));
  
  // Build merged queue: merge items and their exercises
  const mergedQueue: WorkoutQueueItem[] = originalQueue.map(originalItem => {
    const generatedItem = generatedMap.get(originalItem.id);
    if (generatedItem) {
      // Merge exercises within this item
      return mergeExercisesInQueueItem(generatedItem, originalItem);
    } else {
      // Preserve the original item if it wasn't in the generated queue
      console.log(`Preserving original item ${originalItem.id} (not in generated queue)`);
      return originalItem;
    }
  });
  
  // Add any new items from generated queue that weren't in original (shouldn't happen, but just in case)
  generatedQueue.forEach(generatedItem => {
    if (!originalQueue.find(item => item.id === generatedItem.id)) {
      mergedQueue.push(generatedItem);
    }
  });
  
  if (generatedQueue.length < originalQueue.length) {
    console.log(`Generated queue has ${generatedQueue.length} items, original has ${originalQueue.length}. Merged to ${mergedQueue.length} items.`);
  }
  
  return mergedQueue;
};

// NEW: Apply the new workout queue directly
export const applyNewWorkoutQueue = async (
  newQueue: WorkoutQueueItem[]
): Promise<boolean> => {
  try {
    // Filter out queue items with no exercises
    const filteredQueue = newQueue.filter(item => item.exercises.length > 0);
    
    await AsyncStorage.setItem(
      WORKOUT_QUEUE_STORAGE_KEY,
      JSON.stringify(filteredQueue, null, 2)
    );
    return true;
  } catch (error) {
    console.error('Error applying new workout queue:', error);
    return false;
  }
};

