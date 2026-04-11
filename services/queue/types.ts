/**
 * Queue-domain shared type definitions.
 *
 * Canonical location for all types consumed across the queue pipeline
 * (codec, repair, diff, and validation). Re-exported via the barrel
 * at `services/queue/index.ts` and kept backward-compatible with
 * the legacy re-exports in `services/workout-queue-modifier.ts`.
 */

import type { ExerciseVariant, ExerciseVariantOption, ProgramExercise } from '@/types';

// =============================================================================
// PARSE FAILURE TRACKING
// =============================================================================

/**
 * Reason the last TOON parse attempt failed.
 * 'none' indicates no failure; 'variant_source_conflict' means the LLM
 * produced inline variant notation that conflicts with column-5 rules.
 */
export type QueueParseFailureReason = 'none' | 'variant_source_conflict';

// =============================================================================
// EXERCISE IDENTITY AND TARGETING
// =============================================================================

/**
 * Precise reference to a single exercise within a queue item.
 * Used to target specific exercises for modification requests.
 */
export interface TargetedExerciseRef {
  queueItemId: string;
  dayNumber: number;
  exerciseIndex: number;
  exerciseInstanceId?: string;
  name: string;
  displayName: string;
}

/**
 * Union type allowing either a plain exercise name string or
 * a structured TargetedExerciseRef when the caller has resolved
 * the exercise to a specific queue position.
 */
export type TargetedExerciseMatcher = string | TargetedExerciseRef;

// =============================================================================
// QUEUE DIFF AND COMPARISON
// =============================================================================

/**
 * Single detected difference between two queue snapshots.
 */
export interface QueueDifference {
  type: 'variant_change' | 'weight_change' | 'reps_change' | 'sets_change' | 'removed' | 'added' | 'modified' | 'exercise_swap';
  queueItemId: string;
  queueItemName: string;
  dayNumber: number;
  exerciseName?: string;
  oldExercise?: ProgramExercise;
  newExercise?: ProgramExercise;
  oldWeight?: string;
  newWeight?: string;
  oldReps?: string;
  newReps?: string;
  oldSets?: string;
  newSets?: string;
  newExerciseName?: string;
  details?: string;
}

/**
 * Structured summary of all proposed changes between two queues,
 * categorised by change type.
 */
export interface ProposedChanges {
  variantChanges: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    oldVariant: string;
    newVariant: string;
  }>;
  weightChanges: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    oldWeight: string;
    newWeight: string;
  }>;
  repsChanges: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    oldReps: string;
    newReps: string;
  }>;
  setsChanges: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    oldSets: string;
    newSets: string;
  }>;
  removals: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    muscleGroup: string;
  }>;
  additions: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    exerciseName: string;
    weight: string;
    reps: string;
    sets: string;
    equipment: string;
    muscle_groups_worked: string[];
  }>;
  swaps: Array<{
    queueItemId: string;
    queueItemName: string;
    dayNumber: number;
    oldExerciseName: string;
    newExerciseName: string;
  }>;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Result of validating proposed queue changes against a user request.
 */
export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Result of validating that a parsed queue preserves structural integrity
 * relative to the original queue.
 */
export interface QueueStructureValidationResult {
  valid: boolean;
  errors: string[];
}

// =============================================================================
// SEMANTIC OUTCOME EVALUATION
// =============================================================================

/**
 * Result of evaluating whether a queue modification achieved
 * the user's semantic intent.
 */
export interface SemanticEvaluationResult {
  passed: boolean;
  reason?: string;
}

/**
 * Input to prompt-coverage analysis.
 */
export interface TestPromptCoverageInput {
  type: string;
  prompt: string;
}

/**
 * Coverage status for a single prompt case.
 */
export type TestPromptCoverageStatus =
  | 'covered'
  | 'missing_targets'
  | 'missing_variant_capability';

/**
 * Coverage result for a single prompt case.
 */
export interface TestPromptCoverageResult {
  type: string;
  prompt: string;
  status: TestPromptCoverageStatus;
  targetedExercises: string[];
  missingTargets?: string[];
  missingVariantTargets?: string[];
}

/**
 * Aggregate prompt-coverage report.
 */
export interface TestPromptCoverageReport {
  allCovered: boolean;
  results: TestPromptCoverageResult[];
}

// =============================================================================
// CHANGE TYPE DETECTION
// =============================================================================

/**
 * Categories of change a user might request.
 * Used by repair logic to determine which column(s) to target.
 */
export type ChangeType = 'weight' | 'reps' | 'sets' | 'variant' | 'remove' | 'add' | 'unknown';

// =============================================================================
// CUSTOMISED SET PAYLOAD
// =============================================================================

/**
 * Input to customised-set normalisation.
 * Validates that per-set reps and weight arrays are present and matching
 * when customised sets are enabled.
 */
export interface CustomisedSetPayloadInput {
  hasCustomisedSets: boolean;
  repsBySet?: string[];
  weightBySet?: string[];
}