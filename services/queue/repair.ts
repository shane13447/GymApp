/**
 * Queue repair module — re-exports repair functions from the legacy module.
 *
 * During Phase 01, the repair implementation remains in
 * `services/workout-queue-modifier.ts` while this module establishes the
 * canonical import path. The implementation will migrate here in a
 * subsequent change once internal helper dependencies are decoupled.
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