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
export const WORKOUT_QUEUE_GENERATION_SYSTEM_PROMPT = `You are a fitness coach assistant. Given the current workout queue and user instructions, generate the complete modified workout queue as JSON.

IMPORTANT RULES:
1. Return ONLY valid JSON, no markdown, no code blocks, no text before or after
2. Preserve all queue item IDs exactly as they appear in the input
3. Preserve programId, programName and dayNumber for each queue item
4. Modify exercises based on user instructions
5. Keep exercises unchanged unless the user requests changes
6. Use the exact structure: [{"id":"...","programId":"...","programName":"...","dayNumber":N,"exercises":[...]}]
7. Each exercise must have: name, equipment, muscle_groups_worked (array), weight, reps, sets, restTime, progression
8. If adding exercises, use sensible defaults: weight="0", reps="8-12", sets="3", restTime="180", progression=""
9. If modifying weights, use the format provided by the user (e.g., "84 kg" or "185 lbs")
10. Maintain the same order of queue items and exercises unless user requests reordering

Example format:
[{"id":"queue-123","programId":"prog-1","programName":"Push Pull Legs","dayNumber":1,"exercises":[{"name":"Bench Press","equipment":"barbell","muscle_groups_worked":["chest","triceps"],"weight":"80 kg","reps":"8-12","sets":"3","restTime":"180","progression":""}]}]`;

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
  
  // Use compact JSON to minimize context size
  const queueJSON = JSON.stringify(queueData);
  
  return `Current workout queue:
${queueJSON}

User request: ${userRequest}

Generate the complete modified workout queue as JSON based on the user's request. Return ONLY the JSON array, nothing else.`;
};

// NEW: Parse the generated workout queue from LLM response
export const parseGeneratedQueue = (response: string): WorkoutQueueItem[] | null => {
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
    const startIndex = cleanedResponse.indexOf('[');
    if (startIndex === -1) {
      console.warn('No JSON array start found in response');
      return null;
    }
    
    // Find the matching closing bracket by counting brackets
    let bracketCount = 0;
    let endIndex = -1;
    for (let i = startIndex; i < cleanedResponse.length; i++) {
      if (cleanedResponse[i] === '[') {
        bracketCount++;
      } else if (cleanedResponse[i] === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          endIndex = i;
          break;
        }
      }
    }
    
    if (endIndex === -1) {
      console.warn('JSON array appears to be truncated - no matching closing bracket found');
      console.warn('Response length:', cleanedResponse.length);
      console.warn('Response preview:', cleanedResponse.substring(startIndex, startIndex + 500));
      return null;
    }
    
    const jsonString = cleanedResponse.substring(startIndex, endIndex + 1);
    
    // Validate JSON completeness by checking if it parses
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('JSON parse error - response may be truncated:', parseError);
      console.error('JSON string length:', jsonString.length);
      console.error('JSON string preview:', jsonString.substring(0, 500));
      return null;
    }
    
    // Validate it's an array
    if (!Array.isArray(parsed)) {
      console.warn('Parsed JSON is not an array');
      return null;
    }
    
    return parsed as WorkoutQueueItem[];
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

