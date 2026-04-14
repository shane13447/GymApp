/**
 * Database Queue Module
 *
 * Extracted from database.ts to isolate the strict-parity queue lifecycle.
 * All queue CRUD, generation, skip, and validation functions live here.
 *
 * Cross-cutting dependencies (getProgramById, getLastLoggedWeight) are
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

export const getQueueGenerationId = (): number => currentQueueGenerationId;
export const incrementQueueGenerationId = (): number => {
  currentQueueGenerationId += 1;
  return currentQueueGenerationId;
};

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

    if (!Array.isArray(item.exercises) || item.exercises.length === 0) {
      throw new Error(`Invalid queue item "${item.id}": exercises must be a non-empty array.`);
    }

    for (const exercise of item.exercises) {
      if (!exercise) {
        throw new Error(`Invalid queue item "${item.id}": exercise entry is missing.`);
      }

      if (exercise.hasCustomisedSets) {
        const sets = Number.parseInt(exercise.sets, 10);
        if (!Number.isInteger(sets) || sets < 1) {
          throw new Error(`Invalid queue item "${item.id}": customised set semantics are invalid.`);
        }
      }
    }
  }
};

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
        exerciseInstanceId: `${item.id}:e${ex.position}`,
        ...deserializeProgramExerciseRow(ex),
      })),
    });
  }

  return result;
};

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

export const dequeueFirstWorkout = async (): Promise<WorkoutQueueItem | null> => {
  const queue = await getWorkoutQueue();
  if (queue.length === 0) return null;

  const first = queue[0];
  const database = await getDatabase();

  await runInTransaction(database, async () => {
    await database.runAsync('DELETE FROM workout_queue WHERE id = ?', [first.id]);
    await database.runAsync('DELETE FROM queue_exercises WHERE queue_item_id = ?', [first.id]);
    await database.runAsync(
      'UPDATE workout_queue SET position = position - 1 WHERE position > 0'
    );
  });

  return first;
};

export const clearWorkoutQueue = async (): Promise<void> => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM workout_queue');
};

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

function roundWeightToNearestQuarter(weight: number): number {
  return Math.round(weight * 4) / 4;
}

function calculateProgressedWeight(exercise: ProgramExercise, lastWeight: number | null): number {
  const numLastWeight = lastWeight !== null ? Number(lastWeight) : null;
  const numProgression = Number(exercise.progression) || 0;
  const numExerciseWeight = Number(exercise.weight) || 0;

  let newWeight = numExerciseWeight;
  if (numLastWeight !== null && numProgression > 0) {
    newWeight = numLastWeight + numProgression;
  } else if (numLastWeight !== null) {
    newWeight = numLastWeight;
  }

  return roundWeightToNearestQuarter(newWeight);
}

type GetProgramByIdFn = (id: string) => Promise<import('@/types').Program | null>;
type GetLastLoggedWeightFn = (name: string, programId: string, variant?: import('@/types').ExerciseVariant | null) => Promise<number | null>;

async function applyProgressionToExercises(
  exercises: ProgramExercise[],
  programId: string,
  getLastLoggedWeight: GetLastLoggedWeightFn
): Promise<ProgramExercise[]> {
  const exercisesWithProgression: ProgramExercise[] = [];

  for (const exercise of exercises) {
    const lastWeight = await getLastLoggedWeight(exercise.name, programId, exercise.variant);
    const newWeight = calculateProgressedWeight(exercise, lastWeight);

    exercisesWithProgression.push({
      ...exercise,
      weight: newWeight.toString(),
    });
  }

  return exercisesWithProgression;
}

export const generateWorkoutQueue = async (
  programId: string,
  getProgramById: GetProgramByIdFn,
  getLastLoggedWeight: GetLastLoggedWeightFn
): Promise<void> => {
  const thisRequestId = incrementQueueGenerationId();

  const program = await getProgramById(programId);
  if (!program || program.workoutDays.length === 0) {
    console.warn('Cannot generate queue: Program not found or has no workout days');
    return;
  }

  if (thisRequestId !== getQueueGenerationId()) {
    console.log(`Aborting stale queue generation for program: ${program.name}`);
    return;
  }

  const queueItems: WorkoutQueueItem[] = [];
  const numDays = program.workoutDays.length;
  const batchTs = Date.now();
  const batchRand = Math.random().toString(36).slice(2, 8);

  for (let i = 0; i < DEFAULT_QUEUE_SIZE; i++) {
    if (thisRequestId !== getQueueGenerationId()) return;

    const dayIndex = i % numDays;
    const workoutDay = program.workoutDays[dayIndex];

    const exercisesWithProgression = await applyProgressionToExercises(workoutDay.exercises, programId, getLastLoggedWeight);

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
    return;
  }

  await saveWorkoutQueue(queueItems);
  console.log(`Generated workout queue with ${queueItems.length} items for program: ${program.name}`);
};

export const skipQueueToDay = async (
  programId: string,
  targetDayNumber: number,
  originalQueue: WorkoutQueueItem[] | undefined,
  getProgramById: GetProgramByIdFn,
  getLastLoggedWeight: GetLastLoggedWeightFn
): Promise<WorkoutQueueItem[] | null> => {
  const program = await getProgramById(programId);
  if (!program || program.workoutDays.length === 0) {
    console.warn('Cannot skip queue: Program not found or has no workout days');
    return null;
  }

  const referenceQueue = originalQueue ?? await getWorkoutQueue();

  if (referenceQueue.length > 0 && referenceQueue[0].programId !== programId) {
    await generateWorkoutQueue(programId, getProgramById, getLastLoggedWeight);
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

    const exercisesWithProgression = await applyProgressionToExercises(nextDay.exercises, programId, getLastLoggedWeight);

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

export const getQueueItemForDay = async (dayNumber: number): Promise<WorkoutQueueItem | null> => {
  const queue = await getWorkoutQueue();
  return queue.find(q => q.dayNumber === dayNumber) ?? null;
};

