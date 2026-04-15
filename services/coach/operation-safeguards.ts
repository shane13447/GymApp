import { inferRequestedVariant } from '@/lib/coach-utils';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';
import type { TargetedExerciseRef } from '@/services/queue/types';

type InjurySeverity = 'mild' | 'moderate' | 'severe';

export type OperationIntentSafeguardInput = {
  request: string;
  parsedQueue: WorkoutQueueItem[];
  targetedExercises: TargetedExerciseRef[];
};

const normaliseText = (value: string): string => value.trim().toLowerCase();

/**
 * Parses a model-requested variant label into the internal variant shape.
 *
 * @param value - Plain variant label from the request
 * @returns Exercise variant object, or null when no variant fields are detected
 */
const parseVariantString = (value: string): ProgramExercise['variant'] | null => {
  const segments = value
    .split(/[\/,]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const variant: NonNullable<ProgramExercise['variant']> = {};
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    if (lower.includes('incline') || lower.includes('decline')) {
      variant.angle = segment;
    } else if (
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
    } else if (
      lower.includes('seated') ||
      lower.includes('standing') ||
      lower.includes('supported') ||
      lower.includes('bent')
    ) {
      variant.posture = segment;
    } else if (
      lower.includes('one-arm') ||
      lower.includes('single arm') ||
      lower.includes('one leg') ||
      lower.includes('single leg')
    ) {
      variant.laterality = segment;
    } else {
      variant.extras = [...(variant.extras ?? []), segment];
    }
  }

  return Object.keys(variant).length > 0 ? variant : null;
};

/**
 * Infers injury severity from user-facing wording.
 *
 * @param request - User request text
 * @returns Inferred injury severity, or null when the request is not injury-related
 */
const inferInjurySeverityFromRequest = (request: string): InjurySeverity | null => {
  const requestLower = normaliseText(request);
  const hasExplicitRemoveIntent = /\b(?:remove|delete|get rid of|take out|skip|ditch|eliminate)\b/.test(requestLower);

  if (hasExplicitRemoveIntent) {
    return null;
  }

  const hasInjuryContext = [
    'injury',
    'hurt',
    'pain',
    'painful',
    'sore',
    'strain',
    'irritated',
    'flare up',
  ].some((cue) => requestLower.includes(cue));

  if (!hasInjuryContext) {
    return null;
  }

  if (
    ['severe', 'cannot', "can't", 'unable', 'badly', 'too painful', 'can not'].some((cue) =>
      requestLower.includes(cue)
    )
  ) {
    return 'severe';
  }

  if (['little', 'slight', 'a bit', 'go easier', 'irritated', 'easy today'].some((cue) =>
    requestLower.includes(cue)
  )) {
    return 'mild';
  }

  return 'moderate';
};

/**
 * Detects a concrete numeric instruction inside a request clause.
 *
 * @param clause - Normalized request clause
 * @returns Numeric fields requested in the clause
 */
const detectNumericInstruction = (
  clause: string,
  request: string
): Partial<Pick<ProgramExercise, 'weight' | 'reps' | 'sets'>> => {
  const instruction: Partial<Pick<ProgramExercise, 'weight' | 'reps' | 'sets'>> = {};

  const weightMatch =
    clause.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilo|kilos|kilograms)\b/) ??
    clause.match(/\bweight\s*(?:to|at)?\s*(\d+(?:\.\d+)?)\b/);
  if (weightMatch) {
    instruction.weight = weightMatch[1];
  }

  const repsMatch =
    clause.match(/\b(\d+)\s*reps?\b/) ??
    clause.match(/\breps?\s*(?:to|at)?\s*(\d+)\b/);
  if (repsMatch) {
    instruction.reps = repsMatch[1];
  }

  const setsMatch =
    clause.match(/\b(\d+)\s*sets?\b/) ??
    clause.match(/\bsets?\s*(?:to|at|of)?\s*(\d+)\b/);
  if (setsMatch) {
    instruction.sets = setsMatch[1];
  }

  const destinationOnlyMatch = clause.match(/\b(?:to|at)\s*(\d+(?:\.\d+)?)\b/);
  if (Object.keys(instruction).length === 0 && destinationOnlyMatch) {
    if (request.includes('reps')) {
      instruction.reps = destinationOnlyMatch[1];
    } else if (request.includes('sets')) {
      instruction.sets = destinationOnlyMatch[1];
    } else if (request.includes('weight') || request.includes('kg')) {
      instruction.weight = destinationOnlyMatch[1];
    }
  }

  return instruction;
};

/**
 * Checks whether a normalized clause names a target exercise.
 *
 * @param clause - Normalized request clause
 * @param target - Target hint to match against the clause
 * @returns True when the clause appears to refer to the target
 */
const clauseMentionsTarget = (clause: string, target: TargetedExerciseRef): boolean => {
  const names = [target.name, target.displayName]
    .map((name) => normaliseText(name).replace(/\s*\([^)]*\)\s*$/, ''))
    .filter(Boolean);

  if (names.some((name) => clause.includes(name))) {
    return true;
  }

  const significantWords = normaliseText(target.name)
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 2 &&
        !['the', 'and', 'for', 'with', 'all', 'row', 'rows', 'curl', 'curls', 'press'].includes(word)
    );
  const matchingWords = significantWords.filter((word) => clause.includes(word));

  return matchingWords.length >= Math.min(2, significantWords.length) || matchingWords.length === 1;
};

/**
 * Finds whether an exercise is one of the deterministically resolved targets.
 *
 * @param queueItem - Queue item containing the exercise
 * @param exercise - Exercise to check
 * @param exerciseIndex - Exercise index inside the queue item
 * @param targetedExercises - Deterministically resolved targets
 * @returns True when the exercise matches a target hint
 */
const isTargetedExercise = (
  queueItem: WorkoutQueueItem,
  exercise: ProgramExercise,
  exerciseIndex: number,
  targetedExercises: TargetedExerciseRef[]
): boolean => {
  return targetedExercises.some((target) => {
    if (target.queueItemId !== queueItem.id) {
      return false;
    }
    if (target.exerciseInstanceId && exercise.exerciseInstanceId) {
      return target.exerciseInstanceId === exercise.exerciseInstanceId;
    }
    return target.exerciseIndex === exerciseIndex && normaliseText(target.name) === normaliseText(exercise.name);
  });
};

/**
 * Reduces an exercise by weight first, then reps, then sets.
 *
 * @param exercise - Exercise to lighten
 * @returns Lightened exercise copy
 */
const lightenExercise = (exercise: ProgramExercise): ProgramExercise => {
  const weight = Number(exercise.weight);
  if (Number.isFinite(weight) && weight > 0) {
    return {
      ...exercise,
      weight: String(Math.round(weight * 0.8 * 10) / 10),
    };
  }

  const reps = Number(exercise.reps);
  if (Number.isFinite(reps) && reps > 1) {
    return {
      ...exercise,
      reps: String(Math.max(1, Math.floor(reps * 0.8))),
    };
  }

  const sets = Number(exercise.sets);
  if (Number.isFinite(sets) && sets > 1) {
    return {
      ...exercise,
      sets: String(Math.max(1, sets - 1)),
    };
  }

  return exercise;
};

/**
 * Applies deterministic safeguards when the model misses already-resolved targets.
 *
 * @param input - Request text, model-applied queue, and deterministic target hints
 * @returns Queue with variant/injury target coverage repaired where safe
 */
export const applyOperationIntentSafeguards = (
  input: OperationIntentSafeguardInput
): WorkoutQueueItem[] => {
  const { request, parsedQueue, targetedExercises } = input;
  if (targetedExercises.length === 0) {
    return parsedQueue;
  }

  const requestedVariant = inferRequestedVariant(request);
  const severity = inferInjurySeverityFromRequest(request);
  const variant = requestedVariant ? parseVariantString(requestedVariant) : null;
  const numericInstructionsByInstance = new Map<string, Partial<Pick<ProgramExercise, 'weight' | 'reps' | 'sets'>>>();
  const normalizedRequest = normaliseText(request);
  const requestClauses = normalizedRequest
    .split(/[,;]|\band\b|\bbut\b/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  for (const target of targetedExercises) {
    const targetKey = target.exerciseInstanceId ?? `${target.queueItemId}:${target.exerciseIndex}`;
    for (const clause of requestClauses) {
      if (!clauseMentionsTarget(clause, target)) {
        continue;
      }

      const instruction = detectNumericInstruction(clause, normalizedRequest);
      if (Object.keys(instruction).length > 0) {
        numericInstructionsByInstance.set(targetKey, {
          ...(numericInstructionsByInstance.get(targetKey) ?? {}),
          ...instruction,
        });
      }
    }
  }

  if (!variant && !severity && numericInstructionsByInstance.size === 0) {
    return parsedQueue;
  }

  return parsedQueue.map((queueItem) => {
    if (severity === 'moderate' || severity === 'severe') {
      return {
        ...queueItem,
        exercises: queueItem.exercises.filter(
          (exercise, exerciseIndex) =>
            !isTargetedExercise(queueItem, exercise, exerciseIndex, targetedExercises)
        ),
      };
    }

    return {
      ...queueItem,
      exercises: queueItem.exercises.map((exercise, exerciseIndex) => {
        if (!isTargetedExercise(queueItem, exercise, exerciseIndex, targetedExercises)) {
          return exercise;
        }

        const target = targetedExercises.find((candidate) =>
          isTargetedExercise(queueItem, exercise, exerciseIndex, [candidate])
        );
        const targetKey = target?.exerciseInstanceId ?? (target ? `${target.queueItemId}:${target.exerciseIndex}` : '');
        const numericInstruction = numericInstructionsByInstance.get(targetKey);
        const withNumericInstruction = numericInstruction
          ? {
              ...exercise,
              ...numericInstruction,
            }
          : exercise;

        if (severity === 'mild') {
          return lightenExercise(withNumericInstruction);
        }

        return variant ? { ...withNumericInstruction, variant } : withNumericInstruction;
      }),
    };
  });
};
