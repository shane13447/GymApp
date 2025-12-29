import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutQueueItem } from '@/app/(tabs)/ActiveWorkout';
import type { ProgramExercise } from '@/app/(tabs)/Programs';

const WORKOUT_QUEUE_STORAGE_KEY = 'gymApp_workoutQueue';

// System prompt for Llama 3.2 1B
export const WORKOUT_MODIFICATION_SYSTEM_PROMPT = `You are a workout modification assistant. Your task is to modify workout queue data based on user requests.

WORKOUT QUEUE STRUCTURE:
Each workout queue item contains:
- id: string (unique identifier)
- programId: string
- programName: string  
- dayNumber: number
- exercises: array of exercise objects

Each exercise object contains:
- name: string (exercise name)
- equipment: string
- muscle_groups_worked: array of strings (e.g., ["chest", "triceps"])
- weight: string (e.g., "135 lbs" or "RPE 8")
- reps: string (e.g., "8-12")
- sets: string (e.g., "3")
- restTime: string (e.g., "180")
- progression: string (e.g., "+5lbs/week")

YOUR TASKS:
1. CHANGE WEIGHT: Update the "weight" field for specific exercises
2. REMOVE EXERCISES: Remove exercises that match specified muscle groups
3. ADD EXERCISES: Add new exercises to a workout queue item
4. SWAP EXERCISES: Replace one exercise with another exercise

OUTPUT FORMAT:
Always respond with ONLY valid JSON in this exact format:
{
  "action": "modify_queue",
  "changes": [
    {
      "queueItemId": "string",
      "exerciseName": "string",
      "operation": "update_weight" | "remove" | "swap",
      "newWeight": "string" (only if operation is "update_weight"),
      "swapWith": "string" (only if operation is "swap" - name of exercise to swap with)
    }
  ],
  "removedByMuscleGroup": [
    {
      "queueItemId": "string",
      "exerciseName": "string",
      "muscleGroup": "string"
    }
  ],
  "additions": [
    {
      "queueItemId": "string",
      "exerciseName": "string",
      "weight": "string",
      "reps": "string",
      "sets": "string",
      "restTime": "string",
      "progression": "string",
      "equipment": "string",
      "muscle_groups_worked": ["string"]
    }
  ]
}

RULES:
- For weight changes: Include exercise name and new weight value
- For removals by muscle group: List all exercises removed with their muscle groups
- For additions: Include complete exercise object with all required fields
- For swaps: Use "swap" operation with "swapWith" field containing the new exercise name
- Keep all other exercise fields unchanged when modifying
- Be precise with exercise names (match exactly)
- If user says "remove chest exercises", remove ALL exercises where "chest" is in muscle_groups_worked array
- When adding exercises, use default values: weight="RPE 8", reps="8-12", sets="3", restTime="180", progression=""
- When swapping, the new exercise should have similar default values

EXAMPLES:

User: "Change bench press weight to 185 lbs"
Response: {"action":"modify_queue","changes":[{"queueItemId":"queue-123","exerciseName":"Bench Press","operation":"update_weight","newWeight":"185 lbs"}],"removedByMuscleGroup":[],"additions":[]}

User: "Remove all chest exercises"
Response: {"action":"modify_queue","changes":[],"removedByMuscleGroup":[{"queueItemId":"queue-123","exerciseName":"Bench Press","muscleGroup":"chest"}],"additions":[]}

User: "Add barbell curl to day 1"
Response: {"action":"modify_queue","changes":[],"removedByMuscleGroup":[],"additions":[{"queueItemId":"queue-123","exerciseName":"Barbell Curl","weight":"RPE 8","reps":"8-12","sets":"3","restTime":"180","progression":"","equipment":"barbell","muscle_groups_worked":["biceps"]}]}

User: "Swap bench press with dumbbell press"
Response: {"action":"modify_queue","changes":[{"queueItemId":"queue-123","exerciseName":"Bench Press","operation":"swap","swapWith":"Dumbbell Press"}],"removedByMuscleGroup":[],"additions":[]}

User: "Change squat to 225 lbs and add deadlift"
Response: {"action":"modify_queue","changes":[{"queueItemId":"queue-123","exerciseName":"Barbell Squat","operation":"update_weight","newWeight":"225 lbs"}],"removedByMuscleGroup":[],"additions":[{"queueItemId":"queue-123","exerciseName":"Deadlift","weight":"RPE 8","reps":"8-12","sets":"3","restTime":"180","progression":"","equipment":"barbell","muscle_groups_worked":["back","hamstrings"]}]}

IMPORTANT: 
- Respond with ONLY the JSON object, no other text
- Match exercise names exactly as provided in available exercises list
- Include queueItemId for each change
- If no changes needed, return empty arrays
- When adding/swapping, use exercise names from the available exercises list provided`;

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
    // Try to extract JSON from response (in case LLM adds extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.action === 'modify_queue') {
        return parsed as WorkoutModification;
      }
    }
    return null;
  } catch (error) {
    console.error('Error parsing modification response:', error);
    return null;
  }
};

// Build user prompt with current queue data
export const buildModificationPrompt = (
  userRequest: string,
  queue: WorkoutQueueItem[],
  availableExercises?: Array<{ name: string; equipment: string; muscle_groups_worked: string[] }>
): string => {
  // Create a simplified version of the queue for the prompt (to avoid token limits)
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

  let prompt = `Current workout queue:
${JSON.stringify(simplifiedQueue, null, 2)}

User request: ${userRequest}`;

  // Include available exercises if provided (for add/swap operations)
  if (availableExercises && availableExercises.length > 0) {
    // Limit to first 50 exercises to avoid token limits
    const limitedExercises = availableExercises.slice(0, 50).map(ex => ({
      name: ex.name,
      equipment: ex.equipment,
      muscle_groups_worked: ex.muscle_groups_worked,
    }));
    
    prompt += `\n\nAvailable exercises (use exact names when adding/swapping):
${JSON.stringify(limitedExercises, null, 2)}`;
  }

  prompt += `\n\nProvide the modification JSON.`;

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
      if (queueItem) {
        const exercise = queueItem.exercises.find(ex => ex.name === change.exerciseName);
        if (exercise) {
          weightChanges.push({
            queueItemId: change.queueItemId,
            queueItemName: queueItem.programName,
            dayNumber: queueItem.dayNumber,
            exerciseName: change.exerciseName,
            oldWeight: exercise.weight,
            newWeight: change.newWeight,
          });
        }
      }
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

// Apply modifications to workout queue
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
                weight: oldExercise.weight || 'RPE 8',
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

