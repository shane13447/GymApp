import type { ProgramExercise, WorkoutQueueItem } from '@/types';
import type { TargetedExerciseRef } from '@/services/queue/types';

type PromptExercise = {
  exerciseInstanceId?: string;
  exerciseIndex: number;
  name: string;
  equipment: string;
  muscle_groups_worked: string[];
  isCompound: boolean;
  variant: ProgramExercise['variant'];
  weight: string;
  reps: string;
  sets: string;
};

type PromptQueueItem = {
  queueItemId: string;
  dayNumber: number;
  position: number;
  programName: string;
  exercises: PromptExercise[];
};

type PromptTargetHint = {
  queueItemId: string;
  dayNumber: number;
  exerciseIndex: number;
  exerciseInstanceId?: string;
  name: string;
  displayName: string;
};

export const OPERATION_SYSTEM_PROMPT = [
  'You are the GymApp workout queue operation planner.',
  'Return exactly one JSON object. No prose, markdown, code fences, comments, or legacy queue strings.',
  'Schema: {"version":1,"operations":[{"id":"op_1","type":"modify_weight|modify_reps|modify_sets|add_exercise|remove_exercise|swap_variant","target":{},"value":{},"reason":"short optional reason"}],"summary":"short optional summary","warnings":[]}.',
  'Allowed operation types only: modify_weight, modify_reps, modify_sets, add_exercise, remove_exercise, swap_variant.',
  'Do not output modify_rest. Rest-time edits are outside the mutation contract.',
  'For existing exercises, target by exerciseInstanceId exactly as supplied when present. Use exerciseIndex only if no exerciseInstanceId exists.',
  'If targetHints are supplied, treat them as the authoritative resolved exercise targets for the request.',
  'When a request names an exercise that appears more than once and no day is specified, emit one operation for each matching exercise.',
  'When the request is a numeric or variant change for an existing exercise, do not add a new exercise with a similar name.',
  'For add_exercise, target the destination queueItemId or dayNumber and put the exercise name in value.exerciseName. Include numeric value.weight, value.reps, and value.sets when the user gives them.',
  'For remove_exercise, target only the exercise to remove. Do not remove unrelated exercises.',
  'For swap_variant, value.variant must be a plain string such as "Close Grip", "Neutral Grip", "Incline", or "Dumbbell". Do not use an object for value.variant.',
  'For muscle-group or injury requests, emit one operation per affected exercise in the supplied queue scope.',
  'For mild injury requests, reduce load, remove, or swap affected exercises when that is safer. For moderate or severe injury requests, remove or swap every affected painful exercise.',
  'Use numbers for weight, reps, and sets. Use kilograms as provided by the queue. Do not mutate exercises outside the supplied queue.',
].join('\n');

/**
 * Creates the compact queue payload sent to the operation-contract model prompt.
 *
 * @param queue - Workout queue items currently in modification scope
 * @returns Queue payload containing stable operation targets and editable fields
 */
const buildPromptQueue = (queue: WorkoutQueueItem[]): PromptQueueItem[] => {
  return queue.map((queueItem) => ({
    queueItemId: queueItem.id,
    dayNumber: queueItem.dayNumber,
    position: queueItem.position,
    programName: queueItem.programName,
    exercises: queueItem.exercises.map((exercise, exerciseIndex) => ({
      ...(exercise.exerciseInstanceId ? { exerciseInstanceId: exercise.exerciseInstanceId } : {}),
      exerciseIndex,
      name: exercise.name,
      equipment: exercise.equipment,
      muscle_groups_worked: exercise.muscle_groups_worked,
      isCompound: exercise.isCompound,
      variant: exercise.variant ?? null,
      weight: exercise.weight,
      reps: exercise.reps,
      sets: exercise.sets,
    })),
  }));
};

/**
 * Builds deterministic target hints for the model from locally resolved targets.
 *
 * @param targetHints - Exercise targets resolved by the deterministic matcher
 * @param queue - Queue items currently in modification scope
 * @returns Target hints limited to exercises inside the supplied queue scope
 */
const buildPromptTargetHints = (
  targetHints: TargetedExerciseRef[],
  queue: WorkoutQueueItem[]
): PromptTargetHint[] => {
  const queueItemIds = new Set(queue.map((queueItem) => queueItem.id));

  return targetHints
    .filter((targetHint) => queueItemIds.has(targetHint.queueItemId))
    .map((targetHint) => ({
      queueItemId: targetHint.queueItemId,
      dayNumber: targetHint.dayNumber,
      exerciseIndex: targetHint.exerciseIndex,
      ...(targetHint.exerciseInstanceId ? { exerciseInstanceId: targetHint.exerciseInstanceId } : {}),
      name: targetHint.name,
      displayName: targetHint.displayName,
    }));
};

/**
 * Builds the user message for workout queue modifications.
 *
 * @param request - User request, optionally preprocessed with resolved muscle-group targets
 * @param queue - Queue items that the model is allowed to modify
 * @param targetHints - Optional deterministic target hints for ambiguous aliases or injury requests
 * @returns JSON string containing the request, allowed operation types, and scoped queue
 */
export const buildOperationContractPrompt = (
  request: string,
  queue: WorkoutQueueItem[],
  targetHints: TargetedExerciseRef[] = []
): string => {
  return JSON.stringify({
    contract: 'gymapp.queue.operations.v1',
    responseShape: {
      version: 1,
      operations: [],
      summary: 'optional string',
      warnings: [],
    },
    allowedOperations: [
      'modify_weight',
      'modify_reps',
      'modify_sets',
      'add_exercise',
      'remove_exercise',
      'swap_variant',
    ],
    forbiddenOperations: ['modify_rest'],
    request,
    targetHints: buildPromptTargetHints(targetHints, queue),
    queue: buildPromptQueue(queue),
  });
};
