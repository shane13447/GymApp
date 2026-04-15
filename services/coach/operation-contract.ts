/**
 * Operation Contract - JSON Schema Validation
 * 
 * Replaces TOON format with strict JSON operation contracts.
 * Operations are validated before being applied to the queue.
 */

import type { ProgramExercise, WorkoutQueueItem } from '@/types';

// =============================================================================
// OPERATION TYPES
// =============================================================================

/**
 * Target specification for an operation — identifies which exercise to modify.
 */
export interface OperationTarget {
  queueItemId?: string;
  dayNumber?: number;
  exerciseName?: string;
  exerciseIndex?: number;
  exerciseInstanceId?: string;
}

/**
 * Value specification for an operation — the new values to apply.
 */
export interface OperationValue {
  weight?: number;
  reps?: number;
  sets?: number;
  restTime?: number;
  variant?: string;
  exerciseName?: string;
}

/**
 * Single operation to modify a workout queue item or exercise
 */
export interface QueueOperation {
  /** Unique operation identifier */
  id: string;
  /** Operation type */
  type: 'modify_weight' | 'modify_reps' | 'modify_sets' | 'add_exercise' | 'remove_exercise' | 'swap_variant';
  /** Target: queue item ID or day number */
  target: OperationTarget;
  /** Operation value */
  value?: OperationValue;
  /** Reason for the operation (optional) */
  reason?: string;
}

/**
 * Complete operation response from LLM
 */
export interface OperationResponse {
  /** Schema version */
  version: 1;
  /** Operations to apply */
  operations: QueueOperation[];
  /** Summary of changes */
  summary?: string;
  /** Any warnings or notes */
  warnings?: string[];
}

/**
 * Validation result
 */
export interface OperationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validatedOperations: QueueOperation[];
}

/**
 * Result of checking whether operations can be applied to a queue.
 */
export interface OperationApplicabilityResult {
  canApply: boolean;
  missingTargets: string[];
}

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

const VALID_OPERATION_TYPES = [
  'modify_weight',
  'modify_reps', 
  'modify_sets',
  'add_exercise',
  'remove_exercise',
  'swap_variant',
] as const;

/**
 * Validates a single operation
 */
const validateOperation = (op: unknown, index: number): string[] => {
  const errors: string[] = [];
  const operation = op as Record<string, unknown>;
  
  if (!operation || typeof operation !== 'object') {
    errors.push(`Operation ${index}: must be an object`);
    return errors;
  }
  
  // Validate ID
  if (!operation.id || typeof operation.id !== 'string') {
    errors.push(`Operation ${index}: missing or invalid id`);
  }
  
  // Validate type
  if (!operation.type || !VALID_OPERATION_TYPES.includes(operation.type as typeof VALID_OPERATION_TYPES[number])) {
    errors.push(`Operation ${index}: invalid type "${operation.type}"`);
  }
  
  // Validate target
  if (!operation.target || typeof operation.target !== 'object') {
    errors.push(`Operation ${index}: missing target`);
  } else {
    const target = operation.target as Record<string, unknown>;
    // BUG FIX: Previously rejected targets with only exerciseInstanceId, even though
    // operation-applier.ts explicitly supports exerciseInstanceId lookup first
    // (findExerciseInQueue checks it before dayNumber/exerciseName). Added it here.
    const hasValidTarget = target.queueItemId || target.dayNumber || target.exerciseName || target.exerciseInstanceId;
    if (!hasValidTarget) {
      errors.push(`Operation ${index}: target must specify queueItemId, dayNumber, exerciseName, or exerciseInstanceId`);
    }
  }
  
  // Validate value based on type
  const opType = operation.type as string;
  const value = operation.value as Record<string, unknown> | undefined;
  
  if (['modify_weight', 'modify_reps', 'modify_sets'].includes(opType)) {
    if (!value || typeof value !== 'object') {
      errors.push(`Operation ${index}: ${opType} requires a value object`);
    }
  }
  
  return errors;
};

/**
 * Validates an operation response against the expected schema
 */
export const validateOperationResponse = (responseText: string): OperationValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return {
      isValid: false,
      errors: ['Response is not valid JSON'],
      warnings: [],
      validatedOperations: [],
    };
  }
  
  // Validate root structure
  if (!parsed || typeof parsed !== 'object') {
    return {
      isValid: false,
      errors: ['Response must be a JSON object'],
      warnings: [],
      validatedOperations: [],
    };
  }
  
  const response = parsed as Record<string, unknown>;
  
  // BUG FIX: Previously only warned on version mismatch, making future contract
  // drift easy to accept partially and misapply. Now fails hard so incompatible
  // versions are caught immediately rather than silently producing wrong results.
  if (response.version !== 1) {
    return {
      isValid: false,
      errors: [`Expected schema version 1, got ${response.version}`],
      warnings,
      validatedOperations: [],
    };
  }
  
  // Validate operations array
  if (!Array.isArray(response.operations)) {
    return {
      isValid: false,
      errors: ['Missing or invalid operations array'],
      warnings,
      validatedOperations: [],
    };
  }
  
  if (response.operations.length === 0) {
    errors.push('Operations array is empty');
  }
  
  // Validate each operation
  const validatedOps: QueueOperation[] = [];
  for (let i = 0; i < response.operations.length; i++) {
    const opErrors = validateOperation(response.operations[i], i);
    errors.push(...opErrors);
    
    if (opErrors.length === 0) {
      validatedOps.push(response.operations[i] as QueueOperation);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    validatedOperations: validatedOps,
  };
};

/**
 * Checks if a response is in the old TOON format (to reject it)
 */
export const isToonFormat = (responseText: string): boolean => {
  const trimmed = responseText.trim();
  // TOON format starts with Q followed by queue items
  return /Q\d+:D\d+:[^;]/.test(trimmed);
};

/**
 * Validates and rejects TOON format responses (spec compliance)
 */
export const parseAndValidateOperations = (responseText: string): OperationValidationResult => {
  // Reject TOON format - spec requires JSON operations only
  if (isToonFormat(responseText)) {
    return {
      isValid: false,
      errors: ['TOON format rejected - must use JSON operation contract'],
      warnings: [],
      validatedOperations: [],
    };
  }
  
  return validateOperationResponse(responseText);
};

/**
 * Generates a unique operation ID
 */
export const generateOperationId = (): string => {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};
