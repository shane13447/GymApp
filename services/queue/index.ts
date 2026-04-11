/**
 * Queue module barrel — re-exports all public queue-domain APIs.
 *
 * Consumers should import from `@/services/queue` for any queue-related
 * functionality. Backward-compatible re-exports are maintained in
 * `services/workout-queue-modifier.ts` so existing call sites continue
 * to work during the migration period.
 */

// Types — canonical definitions
export type {
  QueueParseFailureReason,
  TargetedExerciseMatcher,
  ProposedChanges,
  QueueDifference,
  ValidationResult,
  QueueStructureValidationResult,
  SemanticEvaluationResult,
  TestPromptCoverageInput,
  TestPromptCoverageStatus,
  TestPromptCoverageResult,
  TestPromptCoverageReport,
  ChangeType,
  CustomisedSetPayloadInput,
} from './types';

export { TargetedExerciseRef } from './types';

// Codec — encode/decode, prompt building, weight rounding
export {
  roundWeightToNearestHalfKg,
  isCoachQueueModification,
  normalizeCoachModifiedWeight,
  roundCoachModifiedQueueWeights,
  normalizeCustomisedSetPayload,
  COMPRESSED_SYSTEM_PROMPT,
  encodeQueueForLLM,
  buildCompressedPrompt,
} from './codec';

// Repair — repair pipeline, target extraction, parsing
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
} from './repair';

// Diff — comparison, validation, semantic evaluation
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
} from './diff';