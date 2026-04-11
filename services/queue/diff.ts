/**
 * Queue diff and validation module — re-exports comparison/validation
 * functions from the legacy module.
 *
 * During Phase 01, the diff implementation remains in
 * `services/workout-queue-modifier.ts` while this module establishes the
 * canonical import path. The implementation will migrate here in a
 * subsequent change.
 */

export {
  compareWorkoutQueues,
  differencesToProposedChanges,
  validateChanges,
  validateQueueStructure,
  evaluatePromptIntentOutcome,
  evaluateVariantSemanticOutcome,
  evaluateInjurySemanticOutcome,
  analyzeTestPromptQueueCoverage,
  fuzzyMatchExerciseName,
} from '@/services/workout-queue-modifier';