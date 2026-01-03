import type { WorkoutQueueItem } from '@/app/(tabs)/ActiveWorkout';
import type { ProgramExercise } from '@/app/(tabs)/Programs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WORKOUT_QUEUE_STORAGE_KEY = 'gymApp_workoutQueue';

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
- Output must be COMPACT (no line breaks, no indentation, no extra spaces)
- CRITICAL: All open brackets ([) and braces ({) must be closed before returning the response. Ensure the JSON array is complete and valid by closing all brackets and braces.`;

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

// Helper function to fix JSON by adding missing closing brackets and braces
const fixJSONBracketsAndBraces = (jsonString: string): string | null => {
  try {
    // First, fix the pattern where `]\s*,` should be `]},\s*{` (missing object closing between array items)
    // This regex finds: closing bracket, whitespace, comma, whitespace (but not already followed by opening brace)
    // We'll replace it with: closing bracket, closing brace, comma, whitespace, opening brace
    // The negative lookahead (?!\s*{) ensures we don't replace when '{' already follows
    let fixed = jsonString.replace(/\](\s*),(\s*)(?!\s*{)/g, (match, whitespace1, whitespace2) => {
      // Fix: add closing brace before comma, opening brace after
      return `]}${whitespace1},${whitespace2}{`;
    });

    // Now count brackets and braces to find what's missing at the end
    let bracketCount = 0;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      
      // Handle escape sequences
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      // Track string boundaries
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      // Don't count brackets/braces inside strings
      if (inString) continue;
      
      // Count brackets and braces
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    // If brackets/braces are balanced, return the fixed string
    if (bracketCount === 0 && braceCount === 0) {
      if (fixed !== jsonString) {
        console.log('Fixed JSON structural issues (missing }, { between objects)');
      }
      return fixed;
    }
    
    // Close braces first (inner structures), then brackets (outer array)
    // Add closing braces for any unclosed braces
    while (braceCount > 0) {
      fixed += '}';
      braceCount--;
    }
    
    // Add closing brackets for any unclosed brackets
    while (bracketCount > 0) {
      fixed += ']';
      bracketCount--;
    }
    
    console.log('Fixed JSON by adding missing closing brackets/braces');
    console.log(`Added ${fixed.length - jsonString.length} characters to close JSON structure`);
    
    return fixed;
  } catch (e) {
    console.error('Error fixing JSON brackets/braces:', e);
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
        // Try to fix JSON by adding missing brackets/braces
        const fixedJson = fixJSONBracketsAndBraces(jsonString);
        if (fixedJson) {
          try {
            const parsed = JSON.parse(fixedJson);
            if (Array.isArray(parsed)) {
              console.log('Successfully parsed JSON after fixing brackets/braces');
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
          } catch (fixError) {
            console.error('Failed to parse even after fixing brackets/braces:', fixError);
          }
        }
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
      
      // Try to fix JSON by adding missing brackets/braces
      const fixedJson = fixJSONBracketsAndBraces(jsonString);
      if (fixedJson) {
        try {
          parsed = JSON.parse(fixedJson);
          if (Array.isArray(parsed)) {
            console.log('Successfully parsed JSON after fixing brackets/braces');
            // Continue with validation logic below (will fall through)
          } else {
            console.warn('Parsed JSON is not an array after fixing');
            return null;
          }
        } catch (fixError) {
          console.error('Failed to parse even after fixing brackets/braces:', fixError);
          return null;
        }
      } else {
        return null;
      }
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

