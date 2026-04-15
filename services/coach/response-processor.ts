/**
 * Coach response processor
 *
 * Pure computation layer that parses an LLM response into a structured
 * result, fully separated from React state.  The Coach screen's useEffect
 * dispatches state updates based on the result kind.
 *
 * Extracted from Coach.tsx to decouple the response pipeline from UI concerns.
 */

import { classifyCoachTestSuccess } from '@/lib/coach-test-classification';
import { inferInjurySeverity, inferRequestedVariant } from '@/lib/coach-utils';
import type { WorkoutQueueItem } from '@/types';
import {
  compareWorkoutQueues,
  differencesToProposedChanges,
  evaluateInjurySemanticOutcome,
  evaluatePromptIntentOutcome,
  evaluateVariantSemanticOutcome,
  mergeScopedQueueChanges,
  validateChanges,
  validateQueueStructure,
} from '@/services/queue/diff';
import {
  findExerciseByName,
} from '@/services/queue/repair';
import { applyOperationContractResponse } from '@/services/coach/operation-response';
import { applyOperationIntentSafeguards } from '@/services/coach/operation-safeguards';
import type {
  ProposedChanges,
  TargetedExerciseRef,
  SemanticEvaluationResult,
} from '@/services/queue/types';
import type { CoachPromptCase } from '@/services/coach/prompt-test-runner';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type CoachResponseResult =
  | { kind: 'parse_failed'; error: string }
  | { kind: 'structure_invalid'; error: string }
  | { kind: 'no_changes' }
  | { kind: 'changes_blocked'; error: string }
  | { kind: 'changes_approved'; generatedQueue: WorkoutQueueItem[]; proposedChanges: ProposedChanges }
  | {
      kind: 'test_result';
      success: boolean;
      errors: string[];
      generatedQueue: WorkoutQueueItem[] | null;
      proposedChanges: ProposedChanges | null;
      pendingNextTestIndex: number | null;
    };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ProcessCoachResponseInput {
  proxyResponse: string;
  scopedQueue: WorkoutQueueItem[];
  fullQueue: WorkoutQueueItem[];
  inputText: string;
  targetedExercises: TargetedExerciseRef[];
  isTestMode: boolean;
  testIndex: number;
  totalTests: number;
  currentTest: CoachPromptCase | null;
}

/**
 * Parse the LLM response and run all validation / diff / merge steps.
 * Returns a discriminated union describing the outcome; the caller is
 * responsible for dispatching UI state updates.
 */
export function processCoachResponse(input: ProcessCoachResponseInput): CoachResponseResult {
  const {
    proxyResponse,
    scopedQueue,
    fullQueue,
    inputText,
    targetedExercises,
    isTestMode,
    testIndex,
    totalTests,
    currentTest,
  } = input;

  const operationResult = applyOperationContractResponse(
    proxyResponse,
    scopedQueue,
    findExerciseByName,
  );

  if (operationResult.kind === 'invalid_contract') {
    const error = `Operation contract validation failed: ${operationResult.errors.join(' ')}`;
    if (isTestMode && currentTest) {
      return buildTestFailureResult(currentTest, testIndex, totalTests, error);
    }
    return { kind: 'parse_failed', error };
  }

  if (operationResult.kind === 'not_applicable') {
    const error = `Unable to apply operation target(s): ${operationResult.errors.join(' ')}`;
    if (isTestMode && currentTest) {
      return buildTestFailureResult(currentTest, testIndex, totalTests, error);
    }
    return { kind: 'changes_blocked', error };
  }

  const parsedQueue = applyOperationIntentSafeguards({
    request: inputText,
    parsedQueue: operationResult.updatedQueue,
    targetedExercises,
  });
  const structureValidation = validateQueueStructure(scopedQueue, parsedQueue);
  if (!structureValidation.valid) {
    const error = `Unable to safely apply AI changes: ${structureValidation.errors.join(' ')}`;
    if (isTestMode && currentTest) {
      return buildTestFailureResult(currentTest, testIndex, totalTests, error);
    }
    return { kind: 'structure_invalid', error };
  }

  const differences = compareWorkoutQueues(scopedQueue, parsedQueue);
  const mergedQueue = mergeScopedQueueChanges(fullQueue, parsedQueue, scopedQueue.length);

  if (differences.length === 0) {
    if (isTestMode && currentTest) {
      return buildTestFailureResult(currentTest, testIndex, totalTests, 'No changes detected');
    }
    return { kind: 'no_changes' };
  }

  const proposedChanges = differencesToProposedChanges(differences);
  const validation = validateChanges(inputText, differences);
  const hasWarnings = !validation.valid;

  if (isTestMode && currentTest) {
    return evaluateTestResult(
      currentTest,
      testIndex,
      totalTests,
      mergedQueue,
      proposedChanges,
      hasWarnings,
      validation.warnings,
      scopedQueue,
      parsedQueue,
      targetedExercises,
    );
  }

  if (hasWarnings) {
    return {
      kind: 'changes_blocked',
      error: `Unable to apply AI changes safely: ${validation.warnings.join(' ')}`,
    };
  }

  return { kind: 'changes_approved', generatedQueue: mergedQueue, proposedChanges };
}

// ---------------------------------------------------------------------------
// Test evaluation (internal)
// ---------------------------------------------------------------------------

function buildTestFailureResult(
  currentTest: CoachPromptCase,
  testIndex: number,
  totalTests: number,
  error: string,
): CoachResponseResult {
  return {
    kind: 'test_result',
    success: false,
    errors: [error],
    generatedQueue: null,
    proposedChanges: null,
    pendingNextTestIndex: testIndex < totalTests - 1 ? testIndex + 1 : null,
  };
}

function evaluateTestResult(
  currentTest: CoachPromptCase,
  testIndex: number,
  totalTests: number,
  mergedQueue: WorkoutQueueItem[],
  proposedChanges: ProposedChanges,
  hasWarnings: boolean,
  warnings: string[],
  scopedQueue: WorkoutQueueItem[],
  parsedQueue: WorkoutQueueItem[],
  targetedExercises: TargetedExerciseRef[],
): CoachResponseResult {
  const isVariantTest = currentTest.type.startsWith('Variant -');
  const isInjuryTest = currentTest.type.startsWith('Injury -');

  let semanticResult: SemanticEvaluationResult = { passed: true };

  if (isVariantTest) {
    const requestedVariant = inferRequestedVariant(currentTest.prompt) ?? '';
    semanticResult = evaluateVariantSemanticOutcome(
      currentTest.prompt,
      scopedQueue,
      parsedQueue,
      targetedExercises,
      requestedVariant,
    );
  } else if (isInjuryTest) {
    const injurySeverity = inferInjurySeverity(currentTest.type);
    const semanticRequest = injurySeverity
      ? `${injurySeverity} injury: ${currentTest.prompt}`
      : currentTest.prompt;

    semanticResult = evaluateInjurySemanticOutcome(
      semanticRequest,
      scopedQueue,
      parsedQueue,
      targetedExercises.map((e) => e.displayName),
    );
  }

  const deterministicIntentResult =
    !isVariantTest && !isInjuryTest
      ? evaluatePromptIntentOutcome(currentTest.prompt, scopedQueue, parsedQueue, targetedExercises)
      : { passed: true };

  const success = classifyCoachTestSuccess({
    hasWarnings,
    semanticPassed: semanticResult.passed,
    deterministicIntentPassed: deterministicIntentResult.passed,
  });

  const failureReasons: string[] = [];
  if (hasWarnings) {
    failureReasons.push(warnings.join('; '));
  }
  if (!semanticResult.passed) {
    failureReasons.push(semanticResult.reason ?? `Semantic validation failed for ${currentTest.type}.`);
  }
  if (!deterministicIntentResult.passed) {
    failureReasons.push(deterministicIntentResult.reason ?? `Intent mismatch for ${currentTest.type}.`);
  }

  const pendingNextTestIndex = testIndex < totalTests - 1 ? testIndex + 1 : null;

  return {
    kind: 'test_result',
    success,
    errors: failureReasons,
    generatedQueue: mergedQueue,
    proposedChanges,
    pendingNextTestIndex,
  };
}
