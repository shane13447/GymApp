/**
 * Queue diff and validation module.
 *
 * Re-exports comparison/validation functions from the implementation
 * module until the diff logic is migrated into this file.
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