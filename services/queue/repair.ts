/**
 * Queue repair module — re-exports repair functions from the implementation
 * module until the repair logic is migrated into this file.
 */

export {
  repairQueueWithIntent,
  repairQueue,
  restoreDroppedExercises,
  enforceColumnChanges,
  detectRequestedChangeType,
  extractTargetExercises,
  extractTargetExerciseRefs,
  getSimilarity,
  findExerciseByName,
  resolveExerciseAlias,
  EXERCISE_ALIASES,
  preprocessMuscleGroupRequest,
  parseQueueFormatResponse,
  getLastQueueParseFailureReason,
} from '@/services/workout-queue-modifier';