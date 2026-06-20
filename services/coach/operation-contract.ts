/**
 * Operation Contract - JSON Schema Validation
 *
 * Validates strict JSON operation contracts before applying them to the queue.
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
 * Type guard for a non-null object value.
 *
 * @param {unknown} value - The value to test.
 * @returns {boolean} True if the value is a non-null object record.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

/**
 * Type guard for a non-empty (after trimming) string.
 *
 * @param {unknown} value - The value to test.
 * @returns {boolean} True if the value is a string with non-whitespace content.
 */
const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

/**
 * Type guard for a finite number.
 *
 * @param {unknown} value - The value to test.
 * @returns {boolean} True if the value is a finite number.
 */
const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

/**
 * Type guard for a non-negative integer.
 *
 * @param {unknown} value - The value to test.
 * @returns {boolean} True if the value is an integer >= 0.
 */
const isNonNegativeInteger = (value: unknown): value is number => (
  Number.isInteger(value) && (value as number) >= 0
);

/**
 * Type guard for a positive integer.
 *
 * @param {unknown} value - The value to test.
 * @returns {boolean} True if the value is an integer > 0.
 */
const isPositiveInteger = (value: unknown): value is number => (
  Number.isInteger(value) && (value as number) > 0
);

const INVALID_JSON = Symbol('invalid_json');

/**
 * Parse a JSON string, returning the {@link INVALID_JSON} sentinel instead of
 * throwing on malformed input.
 *
 * @param {string} text - The JSON text to parse.
 * @returns {unknown | typeof INVALID_JSON} The parsed value, or the INVALID_JSON sentinel on failure.
 */
const parseJson = (text: string): unknown | typeof INVALID_JSON => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return INVALID_JSON;
  }
};

/**
 * Parse JSON, falling back to extracting the first `{...}` object substring
 * when the whole string is not valid JSON.
 *
 * @param {string} text - The text that may contain or be JSON.
 * @returns {unknown | typeof INVALID_JSON} The parsed value, or the INVALID_JSON sentinel on failure.
 */
const parseJsonOrEmbeddedObject = (text: string): unknown | typeof INVALID_JSON => {
  const parsed = parseJson(text);
  if (parsed !== INVALID_JSON) {
    return parsed;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return parseJson(text.slice(start, end + 1));
  }

  return INVALID_JSON;
};

/**
 * Recursively unwrap a proxy response payload to reach the underlying operation
 * contract object, descending through JSON strings and common wrapper keys
 * (`response`, `content`, `output`, `text`, `message.content`) until an object
 * carrying `version`/`operations` is found.
 *
 * @param {unknown} value - The raw payload to unwrap.
 * @returns {unknown} The innermost operation payload (or the original value if no wrapper applies).
 */
const unwrapProxyOperationPayload = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const parsed = parseJson(value);
    return parsed === INVALID_JSON ? value : unwrapProxyOperationPayload(parsed);
  }

  if (!isRecord(value)) {
    return value;
  }

  if (value.version !== undefined || value.operations !== undefined) {
    return value;
  }

  for (const key of ['response', 'content', 'output', 'text'] as const) {
    if (value[key] !== undefined) {
      return unwrapProxyOperationPayload(value[key]);
    }
  }

  if (isRecord(value.message) && value.message.content !== undefined) {
    return unwrapProxyOperationPayload(value.message.content);
  }

  if (Array.isArray(value.choices) && isRecord(value.choices[0])) {
    const firstChoice = value.choices[0];
    if (firstChoice.text !== undefined) {
      return unwrapProxyOperationPayload(firstChoice.text);
    }
    if (isRecord(firstChoice.message) && firstChoice.message.content !== undefined) {
      return unwrapProxyOperationPayload(firstChoice.message.content);
    }
  }

  return value;
};

/**
 * Validates a single operation
 */
const validateOperation = (op: unknown, index: number): string[] => {
  const errors: string[] = [];
  
  if (!isRecord(op)) {
    errors.push(`Operation ${index}: must be an object`);
    return errors;
  }

  const operation = op;
  const opType = operation.type as string;
  const value = operation.value;
  
  // Validate ID
  if (!isNonEmptyString(operation.id)) {
    errors.push(`Operation ${index}: missing or invalid id`);
  }
  
  // Validate type
  if (!operation.type || !VALID_OPERATION_TYPES.includes(operation.type as typeof VALID_OPERATION_TYPES[number])) {
    errors.push(`Operation ${index}: invalid type "${operation.type}"`);
  }
  
  // Validate target
  if (!isRecord(operation.target)) {
    errors.push(`Operation ${index}: missing target`);
  } else {
    const target = operation.target;
    const hasQueueItem = isNonEmptyString(target.queueItemId);
    const hasDay = isPositiveInteger(target.dayNumber);
    const hasExerciseName = isNonEmptyString(target.exerciseName);
    const hasExerciseIndex = isNonNegativeInteger(target.exerciseIndex);
    const hasExerciseInstance = isNonEmptyString(target.exerciseInstanceId);

    if (opType === 'add_exercise') {
      if (!hasQueueItem && !hasDay) {
        errors.push(`Operation ${index}: add_exercise target must specify queueItemId or dayNumber`);
      }
    } else if (!hasExerciseInstance && !hasExerciseName && !hasExerciseIndex) {
      errors.push(`Operation ${index}: target must identify an exercise by exerciseInstanceId, exerciseName, or exerciseIndex`);
    } else if (hasExerciseIndex && !hasQueueItem && !hasDay) {
      errors.push(`Operation ${index}: exerciseIndex target also requires queueItemId or dayNumber`);
    }
  }
  
  // Validate value based on type
  if (['modify_weight', 'modify_reps', 'modify_sets', 'swap_variant', 'add_exercise'].includes(opType)) {
    if (!isRecord(value)) {
      errors.push(`Operation ${index}: ${opType} requires a value object`);
    }
  }

  if (isRecord(value)) {
    if (opType === 'modify_weight' && !isFiniteNumber(value.weight)) {
      errors.push(`Operation ${index}: modify_weight requires numeric value.weight`);
    }
    if (opType === 'modify_reps' && !isPositiveInteger(value.reps)) {
      errors.push(`Operation ${index}: modify_reps requires positive integer value.reps`);
    }
    if (opType === 'modify_sets' && !isPositiveInteger(value.sets)) {
      errors.push(`Operation ${index}: modify_sets requires positive integer value.sets`);
    }
    if (opType === 'swap_variant' && !isNonEmptyString(value.variant)) {
      errors.push(`Operation ${index}: swap_variant requires string value.variant`);
    }
    if (opType === 'add_exercise' && !isNonEmptyString(value.exerciseName)) {
      errors.push(`Operation ${index}: add_exercise requires string value.exerciseName`);
    }
  }
  
  return errors;
};

/**
 * Validates an already parsed operation response payload.
 *
 * @param parsed - Unknown parsed payload to validate
 * @returns Validation result with the validated operations that can be applied
 */
const validateParsedOperationResponse = (parsed: unknown): OperationValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate root structure
  if (!isRecord(parsed)) {
    return {
      isValid: false,
      errors: ['Response must be a JSON object'],
      warnings: [],
      validatedOperations: [],
    };
  }
  
  const response = parsed;
  
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
 * Validates an operation response against the expected schema.
 *
 * @param responseText - Raw JSON text expected to contain the operation payload directly
 * @returns Validation result for the strict operation payload
 */
export const validateOperationResponse = (responseText: string): OperationValidationResult => {
  const parsed = parseJson(responseText);

  if (parsed === INVALID_JSON) {
    return {
      isValid: false,
      errors: ['Response is not valid JSON'],
      warnings: [],
      validatedOperations: [],
    };
  }

  return validateParsedOperationResponse(parsed);
};

/**
 * Parse a (possibly wrapped or embedded) coach response and validate it against
 * the operation contract schema, tolerating proxy wrappers and JSON embedded in
 * surrounding text.
 *
 * @param {string} responseText - The raw coach/proxy response text.
 * @returns {OperationValidationResult} The validation result, including any errors and validated operations.
 */
export const parseAndValidateOperations = (responseText: string): OperationValidationResult => {
  const parsed = parseJsonOrEmbeddedObject(responseText);

  if (parsed === INVALID_JSON) {
    return {
      isValid: false,
      errors: ['Response is not valid JSON'],
      warnings: [],
      validatedOperations: [],
    };
  }

  return validateParsedOperationResponse(unwrapProxyOperationPayload(parsed));
};

/**
 * Generates a unique operation ID
 */
export const generateOperationId = (): string => {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};
