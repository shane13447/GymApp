import {
  applyOperations,
  validateOperationApplicability,
  type ExerciseCatalogLookup,
} from '@/services/coach/operation-applier';
import { parseAndValidateOperations, type QueueOperation } from '@/services/coach/operation-contract';
import type { WorkoutQueueItem } from '@/types';

export type ApplyOperationContractResult =
  | {
      kind: 'applied';
      operations: QueueOperation[];
      updatedQueue: WorkoutQueueItem[];
    }
  | {
      kind: 'invalid_contract';
      errors: string[];
    }
  | {
      kind: 'not_applicable';
      errors: string[];
    };

/**
 * Validates a proxy response and applies the declared operations deterministically.
 *
 * @param responseText - Raw proxy/model response text
 * @param queue - Queue snapshot to mutate
 * @param catalogLookup - Optional exercise catalog lookup for add_exercise enrichment
 * @returns Applied queue result, or contract/applicability errors
 */
export const applyOperationContractResponse = (
  responseText: string,
  queue: WorkoutQueueItem[],
  catalogLookup?: ExerciseCatalogLookup
): ApplyOperationContractResult => {
  const validation = parseAndValidateOperations(responseText);

  if (!validation.isValid) {
    return {
      kind: 'invalid_contract',
      errors: validation.errors,
    };
  }

  const applicability = validateOperationApplicability(queue, validation.validatedOperations);
  if (!applicability.canApply) {
    return {
      kind: 'not_applicable',
      errors: applicability.missingTargets,
    };
  }

  return {
    kind: 'applied',
    operations: validation.validatedOperations,
    updatedQueue: applyOperations(queue, validation.validatedOperations, catalogLookup),
  };
};
