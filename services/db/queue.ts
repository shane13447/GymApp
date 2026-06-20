/**
 * Database Queue Module
 *
 * Extracted from database.ts to isolate the strict-parity queue lifecycle.
 * All queue CRUD, generation, skip, and validation functions live here.
 *
 * Cross-cutting dependencies (getProgramById, progression history) are
 * injected at the facade layer to avoid circular imports.
 */

import { DEFAULT_QUEUE_SIZE } from '@/constants';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';

import { getDatabase, runInTransaction } from '@/services/db/connection';
import {
  serializeQueueExerciseToSqlParams,
  deserializeProgramExerciseRow,
} from '@/services/db/serialization';
import type { SqlExerciseRow } from '@/services/db/serialization';

let currentQueueGenerationId = 0;

/**
 * Get the current queue generation id, used to detect and abort stale async
 * queue generations.
 *
 * @returns {number} The current generation id.
 */
export const getQueueGenerationId = (): number => currentQueueGenerationId;
/**
 * Increment and return the queue generation id, invalidating any in-flight
 * generation that started under a prior id.
 *
 * @returns {number} The new generation id.
 */
export const incrementQueueGenerationId = (): number => {
  currentQueueGenerationId += 1;
  return currentQueueGenerationId;
};

/**
 * Validates queue snapshots before SQLite persistence.
 *
 * @param queue - Workout queue items to persist
 * @returns Nothing; throws when the queue violates persistence invariants
 */
export const validateWorkoutQueueForPersistence = (queue: WorkoutQueueItem[]): void => {
  const seenIds = new Set<string>();

  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];

    if (!item?.id) {
      throw new Error(`Invalid queue item at index ${index}: missing id.`);
    }

    if (seenIds.has(item.id)) {
      throw new Error(`Invalid queue: duplicate queue item id "${item.id}".`);
    }
    seenIds.add(item.id);

    if (!item.programId) {
      throw new Error(`Invalid queue item "${item.id}": missing programId.`);
    }

    if (!Number.isInteger(item.dayNumber) || item.dayNumber < 1) {
      throw new Error(`Invalid queue item "${item.id}": dayNumber must be a positive integer.`);
    }

    if (!Array.isArray(item.exercises)) {
      throw new Error(`Invalid queue item "${item.id}": exercises must be an array.`);
    }

    for (const exercise of item.exercises) {
      if (!exercise) {
        throw new Error(`Invalid queue item "${item.id}": exercise entry is missing.`);
      }

      if (exercise.hasCustomisedSets) {
        if (!/^\d+$/.test(exercise.sets)) {
          throw new Error(`Invalid queue item "${item.id}": customised set semantics are invalid.`);
        }
        const sets = Number.parseInt(exercise.sets, 10);
        if (!Number.isInteger(sets) || sets < 1) {
          throw new Error(`Invalid queue item "${item.id}": customised set semantics are invalid.`);
        }
      }
    }
  }
};

/**
 * Load the full workout queue with each item's exercises, ordered by position.
 * Each exercise is assigned a stable `exerciseInstanceId` derived from the
 * queue item id and exercise position.
 *
 * @returns {Promise<WorkoutQueueItem[]>} The ordered queue items with exercises.
 */
export const getWorkoutQueue = async (): Promise<WorkoutQueueItem[]> => {
  const database = await getDatabase();

  const queueItems = await database.getAllAsync<{
    id: string;
    program_id: string;
    program_name: string;
    day_number: number;
    scheduled_date: string | null;
    position: number;
  }>('SELECT * FROM workout_queue ORDER BY position');

  const result: WorkoutQueueItem[] = [];

  for (const item of queueItems) {
    const exercises = await database.getAllAsync<SqlExerciseRow>(
      'SELECT * FROM queue_exercises WHERE queue_item_id = ? ORDER BY position',
      [item.id]
    );

    result.push({
      id: item.id,
      programId: item.program_id,
      programName: item.program_name,
      dayNumber: item.day_number,
      scheduledDate: item.scheduled_date ?? undefined,
      position: item.position,
      exercises: exercises.map((ex) => ({
        ...deserializeProgramExerciseRow(ex),
        exerciseInstanceId: `${item.id}:e${ex.position}`,
      })),
    });
  }

  return result;
};

/**
 * Validate and persist a complete workout queue, replacing any existing queue
 * atomically within a transaction. Positions are re-assigned by array order.
 *
 * @param {WorkoutQueueItem[]} queue - The queue items to persist.
 * @returns {Promise<void>} Resolves when the queue has been saved.
 * @throws {Error} If the queue fails persistence validation.
 */
export const saveWorkoutQueue = async (queue: WorkoutQueueItem[]): Promise<void> => {
  const database = await getDatabase();
  validateWorkoutQueueForPersistence(queue);

  await runInTransaction(database, async () => {
    await database.runAsync('DELETE FROM workout_queue');

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      await database.runAsync(
        `INSERT INTO workout_queue (id, program_id, program_name, day_number, scheduled_date, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.programId,
          item.programName,
          item.dayNumber,
          item.scheduledDate ?? null,
          i,
        ]
      );

      for (let j = 0; j < item.exercises.length; j++) {
        const { sql, params } = serializeQueueExerciseToSqlParams(item.exercises[j], j, item.id);
        await database.runAsync(sql, params);
      }
    }
  });
};

/**
 * Append a single item to the end of the workout queue, computing its position
 * from the current maximum, atomically within a transaction.
 *
 * @param {WorkoutQueueItem} item - The queue item to append.
 * @returns {Promise<void>} Resolves when the item has been added.
 */
export const addToWorkoutQueue = async (item: WorkoutQueueItem): Promise<void> => {
  const database = await getDatabase();

  await runInTransaction(database, async () => {
    const maxPos = await database.getFirstAsync<{ max_pos: number | null }>(
      'SELECT MAX(position) as max_pos FROM workout_queue'
    );
    const position = (maxPos?.max_pos ?? -1) + 1;

    await database.runAsync(
      `INSERT INTO workout_queue (id, program_id, program_name, day_number, scheduled_date, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.programId,
        item.programName,
        item.dayNumber,
        item.scheduledDate ?? null,
        position,
      ]
    );

    for (let j = 0; j < item.exercises.length; j++) {
      const { sql, params } = serializeQueueExerciseToSqlParams(item.exercises[j], j, item.id);
      await database.runAsync(sql, params);
    }
  });
};

/**
 * Remove and return the first item in the queue, shifting remaining items'
 * positions down by one, atomically within a transaction.
 *
 * @returns {Promise<WorkoutQueueItem | null>} The dequeued item, or null if the queue was empty.
 */
export const dequeueFirstWorkout = async (): Promise<WorkoutQueueItem | null> => {
  const database = await getDatabase();

  return runInTransaction(database, async () => {
    const queue = await getWorkoutQueue();
    if (queue.length === 0) return null;

    const first = queue[0];

    await database.runAsync('DELETE FROM queue_exercises WHERE queue_item_id = ?', [first.id]);
    await database.runAsync('DELETE FROM workout_queue WHERE id = ?', [first.id]);
    await database.runAsync(
      'UPDATE workout_queue SET position = position - 1 WHERE position > 0'
    );

    return first;
  });
};

/**
 * Remove all items (and their exercises) from the workout queue.
 *
 * @returns {Promise<void>} Resolves when the queue has been cleared.
 */
export const clearWorkoutQueue = async (): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM queue_exercises');
  await database.runAsync('DELETE FROM workout_queue');
};

/**
 * Update a single queue item's metadata and fully replace its exercises,
 * atomically within a transaction.
 *
 * @param {WorkoutQueueItem} item - The queue item to update (identified by its id).
 * @returns {Promise<void>} Resolves when the item has been updated.
 */
export const updateQueueItem = async (item: WorkoutQueueItem): Promise<void> => {
  const database = await getDatabase();

  await runInTransaction(database, async () => {
    await database.runAsync(
      `UPDATE workout_queue SET program_id = ?, program_name = ?, day_number = ?, scheduled_date = ?
       WHERE id = ?`,
      [item.programId, item.programName, item.dayNumber, item.scheduledDate ?? null, item.id]
    );

    await database.runAsync('DELETE FROM queue_exercises WHERE queue_item_id = ?', [item.id]);

    for (let j = 0; j < item.exercises.length; j++) {
      const { sql, params } = serializeQueueExerciseToSqlParams(item.exercises[j], j, item.id);
      await database.runAsync(sql, params);
    }
  });
};

/**
 * Round a weight to the nearest 0.25 increment.
 *
 * @param {number} weight - The raw weight value.
 * @returns {number} The weight rounded to the nearest quarter unit.
 */
function roundWeightToNearestQuarter(weight: number): number {
  return Math.round(weight * 4) / 4;
}

type GetProgramByIdFn = (id: string) => Promise<import('@/types').Program | null>;
type GetProgressionRecommendationFn = (
  exercise: ProgramExercise,
  programId: string
) => Promise<{ weight: number; timesRepsHitInARow?: number }>;

/**
 * Apply progression recommendations to a list of exercises, producing copies
 * with updated (quarter-rounded) weights and progression streak counts.
 *
 * @param {ProgramExercise[]} exercises - The source exercises.
 * @param {string} programId - The program the exercises belong to.
 * @param {GetProgressionRecommendationFn} getProgressionRecommendation - Injected recommender for next weight/streak.
 * @returns {Promise<ProgramExercise[]>} New exercises with progression applied.
 */
async function applyProgressionToExercises(
  exercises: ProgramExercise[],
  programId: string,
  getProgressionRecommendation: GetProgressionRecommendationFn
): Promise<ProgramExercise[]> {
  const exercisesWithProgression: ProgramExercise[] = [];

  for (const exercise of exercises) {
    const recommendation = await getProgressionRecommendation(exercise, programId);
    const newWeight = roundWeightToNearestQuarter(recommendation.weight);

    exercisesWithProgression.push({
      ...exercise,
      weight: newWeight.toString(),
      timesRepsHitInARow: recommendation.timesRepsHitInARow ?? exercise.timesRepsHitInARow,
    });
  }

  return exercisesWithProgression;
}

/**
 * Generate a fresh workout queue for a program by cycling through its workout
 * days up to the default queue size, applying progression to each exercise.
 * Uses the generation id to abort if a newer generation supersedes this one.
 *
 * @param {string} programId - The program to generate a queue for.
 * @param {GetProgramByIdFn} getProgramById - Injected program loader.
 * @param {GetProgressionRecommendationFn} getProgressionRecommendation - Injected progression recommender.
 * @returns {Promise<number | null>} The generation id on success, or null if aborted/invalid.
 */
export const generateWorkoutQueue = async (
  programId: string,
  getProgramById: GetProgramByIdFn,
  getProgressionRecommendation: GetProgressionRecommendationFn
): Promise<number | null> => {
  const thisRequestId = incrementQueueGenerationId();

  const program = await getProgramById(programId);
  if (!program || program.workoutDays.length === 0) {
    console.warn('Cannot generate queue: Program not found or has no workout days');
    return null;
  }

  if (thisRequestId !== getQueueGenerationId()) {
    console.log(`Aborting stale queue generation for program: ${program.name}`);
    return null;
  }

  const queueItems: WorkoutQueueItem[] = [];
  const numDays = program.workoutDays.length;
  const batchTs = Date.now();
  const batchRand = Math.random().toString(36).slice(2, 8);

  for (let i = 0; i < DEFAULT_QUEUE_SIZE; i++) {
    if (thisRequestId !== getQueueGenerationId()) return null;

    const dayIndex = i % numDays;
    const workoutDay = program.workoutDays[dayIndex];

    const exercisesWithProgression = await applyProgressionToExercises(workoutDay.exercises, programId, getProgressionRecommendation);

    queueItems.push({
      id: `queue-${batchTs}-${batchRand}-${i}`,
      programId: program.id,
      programName: program.name,
      dayNumber: workoutDay.dayNumber,
      exercises: exercisesWithProgression,
      position: i,
    });
  }

  if (thisRequestId !== getQueueGenerationId()) {
    console.log(`Aborting stale queue save for program: ${program.name}`);
    return null;
  }

  await saveWorkoutQueue(queueItems);
  console.log(`Generated workout queue with ${queueItems.length} items for program: ${program.name}`);
  return thisRequestId;
};

/**
 * Rebuild the queue so the next workout is the requested day. Trims the
 * reference queue to start at the target day (regenerating if it belongs to a
 * different program) and refills it back up to the default size, applying
 * progression to newly-added days.
 *
 * @param {string} programId - The program the queue belongs to.
 * @param {number} targetDayNumber - The day number to skip the queue to.
 * @param {WorkoutQueueItem[] | undefined} originalQueue - Optional reference queue; loaded from storage if omitted.
 * @param {GetProgramByIdFn} getProgramById - Injected program loader.
 * @param {GetProgressionRecommendationFn} getProgressionRecommendation - Injected progression recommender.
 * @returns {Promise<WorkoutQueueItem[] | null>} The new queue, or null if the program is missing/empty.
 */
export const skipQueueToDay = async (
  programId: string,
  targetDayNumber: number,
  originalQueue: WorkoutQueueItem[] | undefined,
  getProgramById: GetProgramByIdFn,
  getProgressionRecommendation: GetProgressionRecommendationFn
): Promise<WorkoutQueueItem[] | null> => {
  const program = await getProgramById(programId);
  if (!program || program.workoutDays.length === 0) {
    console.warn('Cannot skip queue: Program not found or has no workout days');
    return null;
  }

  const referenceQueue = originalQueue ?? await getWorkoutQueue();

  if (referenceQueue.length > 0 && referenceQueue[0].programId !== programId) {
    await generateWorkoutQueue(programId, getProgramById, getProgressionRecommendation);
    return getWorkoutQueue();
  }

  if (referenceQueue.length > 0 && referenceQueue[0].dayNumber === targetDayNumber) {
    await saveWorkoutQueue(referenceQueue);
    return referenceQueue;
  }

  const targetIndex = referenceQueue.findIndex(q => q.dayNumber === targetDayNumber);

  let newQueue: WorkoutQueueItem[];

  if (targetIndex >= 0) {
    newQueue = referenceQueue.slice(targetIndex).map((item, idx) => ({
      ...item,
      position: idx,
    }));
  } else {
    newQueue = [];
  }

  const numDays = program.workoutDays.length;
  const targetDayIndex = program.workoutDays.findIndex(d => d.dayNumber === targetDayNumber);

  if (targetDayIndex === -1) {
    console.warn(`Day ${targetDayNumber} not found in program`);
    return referenceQueue;
  }

  const skipTs = Date.now();
  const skipRand = Math.random().toString(36).slice(2, 8);

  while (newQueue.length < DEFAULT_QUEUE_SIZE) {
    const lastDayNumber = newQueue.length > 0
      ? newQueue[newQueue.length - 1].dayNumber
      : targetDayNumber - 1;

    const lastDayIndex = program.workoutDays.findIndex(d => d.dayNumber === lastDayNumber);
    const nextDayIndex = lastDayIndex === -1
      ? targetDayIndex
      : (lastDayIndex + 1) % numDays;

    const nextDay = program.workoutDays[nextDayIndex];

    const exercisesWithProgression = await applyProgressionToExercises(nextDay.exercises, programId, getProgressionRecommendation);

    newQueue.push({
      id: `queue-${skipTs}-${skipRand}-${newQueue.length}`,
      programId: program.id,
      programName: program.name,
      dayNumber: nextDay.dayNumber,
      exercises: exercisesWithProgression,
      position: newQueue.length,
    });
  }

  await saveWorkoutQueue(newQueue);
  console.log(`Skipped queue to day ${targetDayNumber}, new queue: [${newQueue.map(q => q.dayNumber).join(', ')}]`);

  return newQueue;
};

/**
 * Find the first queued item matching a given day number.
 *
 * @param {number} dayNumber - The workout day number to look for.
 * @returns {Promise<WorkoutQueueItem | null>} The matching queue item, or null if none.
 */
export const getQueueItemForDay = async (dayNumber: number): Promise<WorkoutQueueItem | null> => {
  const queue = await getWorkoutQueue();
  return queue.find(q => q.dayNumber === dayNumber) ?? null;
};

