/**
 * Operation Applier - Deterministic Queue Mutation Engine
 * 
 * Applies validated JSON operations to workout queues without relying on TOON.
 * This is the sole mutation authority - operations are applied deterministically.
 */

import type { ExerciseVariant, ProgramExercise, WorkoutQueueItem } from '@/types';
import type { QueueOperation, OperationApplicabilityResult } from './operation-contract';

type ExerciseCatalogEntry = {
  equipment: string;
  muscle_groups_worked: string[];
  isCompound: boolean;
  variantOptions?: import('@/types').ExerciseVariantOption[];
  aliases?: string[];
};

type ExerciseCatalogLookup = (exerciseName: string) => ExerciseCatalogEntry | null;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Note: This duplicates parseVariantLabel from workout-queue-modifier.ts to avoid
// pulling in the full transitive dependency chain (→ database → expo-sqlite)
// which breaks the test environment.
const parseVariantString = (value: string): ExerciseVariant | null => {
  const segments = value
    .split(/[\/,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const variant: ExerciseVariant = {};
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (lower.includes('incline') || lower.includes('decline')) {
      variant.angle = segment;
    } else if (
      lower.includes('grip') || lower.includes('neutral') || lower.includes('supinated') ||
      lower.includes('pronated') || lower.includes('reverse') || lower.includes('close') ||
      lower.includes('wide') || lower.includes('narrow')
    ) {
      variant.grip = segment;
    } else if (
      lower.includes('seated') || lower.includes('standing') ||
      lower.includes('supported') || lower.includes('bent')
    ) {
      variant.posture = segment;
    } else if (
      lower.includes('one-arm') || lower.includes('single arm') ||
      lower.includes('one leg') || lower.includes('single leg')
    ) {
      variant.laterality = segment;
    } else {
      const extras = variant.extras ?? [];
      extras.push(segment);
      variant.extras = extras;
    }
  }

  return Object.keys(variant).length > 0 ? variant : null;
};

const findExerciseInQueue = (
  queue: WorkoutQueueItem[],
  target: QueueOperation['target']
): { queueItem: WorkoutQueueItem; exercise: ProgramExercise; exerciseIndex: number } | null => {
  // Try by exerciseInstanceId first
  if (target.exerciseInstanceId) {
    for (const queueItem of queue) {
      const exerciseIndex = queueItem.exercises.findIndex(
        (e) => e.exerciseInstanceId === target.exerciseInstanceId
      );
      if (exerciseIndex >= 0) {
        return {
          queueItem,
          exercise: queueItem.exercises[exerciseIndex],
          exerciseIndex,
        };
      }
    }
  }
  
  // Try by day number and exercise name/index
  if (target.dayNumber && target.exerciseName) {
    const queueItem = queue.find((qi) => qi.dayNumber === target.dayNumber);
    if (queueItem) {
      if (target.exerciseIndex !== undefined) {
        const exercise = queueItem.exercises[target.exerciseIndex];
        if (exercise) {
          return {
            queueItem,
            exercise,
            exerciseIndex: target.exerciseIndex,
          };
        }
      }
      // Find by name
      const exerciseIndex = queueItem.exercises.findIndex(
        (e) => e.name.toLowerCase() === target.exerciseName?.toLowerCase()
      );
      if (exerciseIndex >= 0) {
        return {
          queueItem,
          exercise: queueItem.exercises[exerciseIndex],
          exerciseIndex,
        };
      }
    }
  }
  
  return null;
};

/**
 * Generate the next unused exercise instance ID for a queue item.
 *
 * @param queueItem - Queue item receiving a new exercise
 * @returns Unique exercise instance ID scoped to the queue item
 */
const getNextExerciseInstanceId = (queueItem: WorkoutQueueItem): string => {
  const idPrefix = `${queueItem.id}:e`;
  const highestExistingIndex = queueItem.exercises.reduce((maxIndex, exercise, exerciseIndex) => {
    const parsedIndex = exercise.exerciseInstanceId?.startsWith(idPrefix)
      ? Number.parseInt(exercise.exerciseInstanceId.slice(idPrefix.length), 10)
      : Number.NaN;

    return Number.isNaN(parsedIndex)
      ? Math.max(maxIndex, exerciseIndex)
      : Math.max(maxIndex, parsedIndex);
  }, -1);

  return `${queueItem.id}:e${highestExistingIndex + 1}`;
};

// =============================================================================
// OPERATION APPLICATION
// =============================================================================

/**
 * Applies a single operation to a queue item
 */
const applyOperationToExercise = (
  exercise: ProgramExercise,
  operation: QueueOperation
): ProgramExercise => {
  const updated = { ...exercise };
  
  switch (operation.type) {
    case 'modify_weight':
      if (operation.value?.weight !== undefined) {
        updated.weight = String(operation.value.weight);
      }
      break;
      
    case 'modify_reps':
      if (operation.value?.reps !== undefined) {
        updated.reps = String(operation.value.reps);
      }
      break;
      
    case 'modify_sets':
      if (operation.value?.sets !== undefined) {
        updated.sets = String(operation.value.sets);
      }
      break;
      
    case 'swap_variant':
      if (operation.value?.variant !== undefined) {
        updated.variant = parseVariantString(operation.value.variant);
      }
      break;
      
    default:
      break;
  }
  
  return updated;
};

/**
 * Applies a remove operation
 */
const applyRemoveOperation = (
  queue: WorkoutQueueItem[],
  operation: QueueOperation
): WorkoutQueueItem[] => {
  const target = operation.target;
  const found = findExerciseInQueue(queue, target);
  
  if (!found) {
    console.warn(`[OPERATION APPLIER] Could not find exercise to remove:`, target);
    return queue;
  }
  
  return queue.map((queueItem) => {
    if (queueItem.id === found.queueItem.id) {
      return {
        ...queueItem,
        exercises: queueItem.exercises.filter((_, i) => i !== found.exerciseIndex),
      };
    }
    return queueItem;
  });
};

/**
 * Applies operations to the queue
 */
export const applyOperations = (
  originalQueue: WorkoutQueueItem[],
  operations: QueueOperation[],
  catalogLookup?: ExerciseCatalogLookup
): WorkoutQueueItem[] => {
  // Start with a deep copy of the original queue
  let currentQueue = originalQueue.map((item) => ({
    ...item,
    exercises: item.exercises.map((ex) => ({ ...ex })),
  }));
  
  // Process operations in order (deterministic)
  for (const operation of operations) {
    console.log(`[OPERATION APPLIER] Applying ${operation.type} to`, operation.target);
    
    switch (operation.type) {
      case 'modify_weight':
      case 'modify_reps':
      case 'modify_sets':
      case 'swap_variant': {
        const found = findExerciseInQueue(currentQueue, operation.target);
        if (found) {
          const updatedExercise = applyOperationToExercise(found.exercise, operation);
          currentQueue = currentQueue.map((queueItem) => {
            if (queueItem.id === found.queueItem.id) {
              const newExercises = [...queueItem.exercises];
              newExercises[found.exerciseIndex] = updatedExercise;
              return { ...queueItem, exercises: newExercises };
            }
            return queueItem;
          });
        }
        break;
      }
      
      case 'remove_exercise': {
        currentQueue = applyRemoveOperation(currentQueue, operation);
        break;
      }
      
      case 'add_exercise': {
        const targetDay = currentQueue.find((qi) => qi.dayNumber === operation.target.dayNumber);
        if (targetDay && operation.value?.exerciseName) {
          const catalogEntry = catalogLookup?.(operation.value.exerciseName) ?? null;
          const newExercise: ProgramExercise = {
            exerciseInstanceId: getNextExerciseInstanceId(targetDay),
            name: operation.value.exerciseName,
            equipment: catalogEntry?.equipment ?? '',
            muscle_groups_worked: catalogEntry?.muscle_groups_worked ?? [],
            isCompound: catalogEntry?.isCompound ?? false,
            weight: String(operation.value.weight ?? 0),
            reps: String(operation.value.reps ?? 8),
            sets: String(operation.value.sets ?? 3),
            restTime: String(operation.value.restTime ?? 180),
            progression: '0',
            hasCustomisedSets: false,
            variant: null,
            ...(catalogEntry?.variantOptions ? { variantOptions: catalogEntry.variantOptions } : {}),
            ...(catalogEntry?.aliases ? { aliases: catalogEntry.aliases } : {}),
          };
          currentQueue = currentQueue.map((qi) => {
            if (qi.id === targetDay.id) {
              return { ...qi, exercises: [...qi.exercises, newExercise] };
            }
            return qi;
          });
        }
        break;
      }
        
      default:
        console.warn(`[OPERATION APPLIER] Unknown operation type:`, operation.type);
    }
  }
  
  return currentQueue;
};

/**
 * Validates that operations can be applied (check targets exist).
 */
export const validateOperationApplicability = (
  queue: WorkoutQueueItem[],
  operations: QueueOperation[]
): OperationApplicabilityResult => {
  const missingTargets: string[] = [];
  
  for (const operation of operations) {
    if (operation.type === 'remove_exercise') {
      const found = findExerciseInQueue(queue, operation.target);
      if (!found) {
        missingTargets.push(`Cannot remove: ${operation.target.exerciseName || 'unknown'}`);
      }
    } else if (['modify_weight', 'modify_reps', 'modify_sets', 'swap_variant'].includes(operation.type)) {
      const found = findExerciseInQueue(queue, operation.target);
      if (!found) {
        missingTargets.push(`Cannot modify: ${operation.target.exerciseName || 'unknown'}`);
      }
    }
  }
  
  return {
    canApply: missingTargets.length === 0,
    missingTargets,
  };
};

/**
 * Compares two queues and generates a summary of differences
 */
export const compareQueues = (
  original: WorkoutQueueItem[],
  modified: WorkoutQueueItem[]
): string[] => {
  const differences: string[] = [];
  
  for (let i = 0; i < Math.max(original.length, modified.length); i++) {
    const origItem = original[i];
    const modItem = modified[i];
    
    if (!origItem || !modItem) {
      differences.push(`Queue item ${i}: count changed`);
      continue;
    }
    
    for (let j = 0; j < Math.max(origItem.exercises.length, modItem.exercises.length); j++) {
      const origEx = origItem.exercises[j];
      const modEx = modItem.exercises[j];
      
      if (!origEx || !modEx) {
        differences.push(`Exercise ${j} in day ${modItem.dayNumber}: count changed`);
        continue;
      }
      
      if (origEx.weight !== modEx.weight) {
        differences.push(`${origEx.name}: weight ${origEx.weight} → ${modEx.weight}`);
      }
      if (origEx.reps !== modEx.reps) {
        differences.push(`${origEx.name}: reps ${origEx.reps} → ${modEx.reps}`);
      }
      if (origEx.sets !== modEx.sets) {
        differences.push(`${origEx.name}: sets ${origEx.sets} → ${modEx.sets}`);
      }
    }
  }
  
  return differences;
};
