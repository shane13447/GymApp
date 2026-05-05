import type { Program, WorkoutQueueItem } from '@/types';

export type ProgramLookup = (programId: string) => Promise<Program | null>;

/**
 * Resolves the program for the first queued workout.
 *
 * ActiveWorkout can stay mounted while the Programs screen creates or selects a
 * different current program. In that case the queue is fresh but the in-memory
 * program list may be stale, so fall back to persistence before reporting that
 * the program is missing.
 */
export const resolveWorkoutProgram = async (
  programs: Program[],
  queueItem: WorkoutQueueItem,
  lookupProgramById: ProgramLookup
): Promise<Program | null> => {
  const cachedProgram = programs.find((program) => program.id === queueItem.programId);
  if (cachedProgram) {
    return cachedProgram;
  }

  return lookupProgramById(queueItem.programId);
};
