/**
 * Phase 00 characterization tests: deterministic safeguard contracts.
 *
 * These tests freeze observable behavior of coach pipeline safeguards:
 * - Operation applier immutability and deterministic ordering
 * - Operation contract validation boundaries
 * - compareQueues output contracts
 *
 * No source code behavior is changed.
 */

import { applyOperations, compareQueues, validateOperationApplicability } from '@/services/coach/operation-applier';
import { validateOperationResponse, parseAndValidateOperations, isToonFormat, generateOperationId } from '@/services/coach/operation-contract';
import type { QueueOperation } from '@/services/coach/operation-contract';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';

const makeExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  name: 'Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  exerciseInstanceId: 'ex-1',
  variant: null,
  ...overrides,
});

const makeQueue = (exercises: ProgramExercise[] = [makeExercise()]): WorkoutQueueItem[] => [
  { id: 'q-1', programId: 'prog-1', programName: 'Test Program', dayNumber: 1, exercises, position: 0 },
];

// =============================================================================
// 1. DEEP-COPY IMMUTABILITY (all supported operation types)
// =============================================================================

describe('Safeguard contract: applyOperations immutability', () => {
  const opCases: Array<{ type: QueueOperation['type']; value?: QueueOperation['value'] }> = [
    { type: 'modify_weight', value: { weight: 100 } },
    { type: 'modify_reps', value: { reps: 12 } },
    { type: 'modify_sets', value: { sets: 4 } },
    { type: 'swap_variant', value: { variant: 'Incline' } },
    { type: 'remove_exercise' },
    { type: 'add_exercise', value: { exerciseName: 'Calf Press', weight: 60, reps: 15, sets: 3 } },
  ];

  for (const { type, value } of opCases) {
    it(`does not mutate original queue for ${type}`, () => {
      const queue = makeQueue([makeExercise()]);
      const originalJson = JSON.stringify(queue);
      const ops: QueueOperation[] = [{
        id: 'op-1', type,
        target: { dayNumber: 1, exerciseName: 'Bench Press', exerciseInstanceId: 'ex-1' },
        ...(value !== undefined ? { value } : {}),
      }];
      applyOperations(queue, ops);
      expect(JSON.stringify(queue)).toBe(originalJson);
    });
  }
});

// =============================================================================
// 2. DETERMINISTIC ORDERING + IDEMPOTENCY
// =============================================================================

describe('Safeguard contract: deterministic ordering', () => {
  it('applies operations in declared order', () => {
    const queue = makeQueue([makeExercise()]);
    const ops: QueueOperation[] = [
      { id: 'op-1', type: 'modify_weight', target: { dayNumber: 1, exerciseName: 'Bench Press' }, value: { weight: 100 } },
      { id: 'op-2', type: 'modify_reps', target: { dayNumber: 1, exerciseName: 'Bench Press' }, value: { reps: 12 } },
    ];
    const result = applyOperations(queue, ops);
    expect(result[0].exercises[0].weight).toBe('100');
    expect(result[0].exercises[0].reps).toBe('12');
  });

  it('produces identical output when same operations are applied twice', () => {
    const queue = makeQueue([makeExercise()]);
    const ops: QueueOperation[] = [
      { id: 'op-1', type: 'modify_weight', target: { dayNumber: 1, exerciseName: 'Bench Press' }, value: { weight: 95 } },
    ];
    const first = applyOperations(queue, ops);
    const second = applyOperations(queue, ops);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

// =============================================================================
// 3. OPERATION CONTRACT VALIDATION BOUNDARIES
// =============================================================================

describe('Safeguard contract: operation contract validation', () => {
  it('rejects non-JSON and TOON payloads', () => {
    expect(validateOperationResponse('Q0:D1:Bench|80|8|3').isValid).toBe(false);
    expect(validateOperationResponse('not-json').isValid).toBe(false);
  });

  it('rejects JSON payloads with wrong version', () => {
    const result = validateOperationResponse(JSON.stringify({
      version: 2,
      operations: [{ id: 'op_1', type: 'modify_weight', target: { exerciseName: 'Bench' }, value: { weight: 90 } }],
    }));
    expect(result.isValid).toBe(false);
  });

  it('detects TOON format strings', () => {
    expect(isToonFormat('Q0:D1:Bench Press|80|8|3')).toBe(true);
    expect(isToonFormat('{"version":1,"operations":[]}')).toBe(false);
  });

  it('accepts valid version 1 payloads', () => {
    const result = validateOperationResponse(JSON.stringify({
      version: 1,
      operations: [{ id: 'op_1', type: 'modify_weight', target: { dayNumber: 1, exerciseName: 'Bench Press' }, value: { weight: 90 } }],
    }));
    expect(result.isValid).toBe(true);
    expect(result.validatedOperations).toHaveLength(1);
  });

  it('filters invalid operations from validated list', () => {
    const result = parseAndValidateOperations(JSON.stringify({
      version: 1,
      operations: [
        { id: 'op_1', type: 'modify_weight', target: { dayNumber: 1, exerciseName: 'Bench' }, value: { weight: 90 } },
        { id: 'op_2', type: 'invalid_type', target: { exerciseName: 'Squat' } },
      ],
    }));
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.validatedOperations).toHaveLength(1);
  });

  it('requires value for modify operations', () => {
    const result = validateOperationResponse(JSON.stringify({
      version: 1,
      operations: [{ id: 'op_1', type: 'modify_weight', target: { exerciseName: 'Bench Press' } }],
    }));
    expect(result.isValid).toBe(false);
  });

  it('rejects modify_rest operations', () => {
    const result = validateOperationResponse(JSON.stringify({
      version: 1,
      operations: [{ id: 'op_1', type: 'modify_rest', target: { exerciseName: 'Bench Press' }, value: { restTime: 120 } }],
    }));
    expect(result.isValid).toBe(false);
  });

  it('does not require value for remove_exercise', () => {
    const result = validateOperationResponse(JSON.stringify({
      version: 1,
      operations: [{ id: 'op_1', type: 'remove_exercise', target: { dayNumber: 1, exerciseName: 'Bench Press' } }],
    }));
    expect(result.isValid).toBe(true);
  });

  it('generates unique IDs with op_ prefix', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) { ids.add(generateOperationId()); }
    expect(ids.size).toBe(100);
    for (const id of ids) { expect(id.startsWith('op_')).toBe(true); }
  });
});

// =============================================================================
// 4. TARGET RESOLUTION + UNKNOWN TYPE + DEFAULTS
// =============================================================================

describe('Safeguard contract: target resolution and edge cases', () => {
  it('reports missing target for nonexistent exercise', () => {
    const result = validateOperationApplicability(
      makeQueue([makeExercise()]),
      [{ id: 'op-1', type: 'modify_weight', target: { dayNumber: 1, exerciseName: 'Nonexistent' }, value: { weight: 100 } }],
    );
    expect(result.canApply).toBe(false);
  });

  it('add_exercise does not require a pre-existing target', () => {
    const result = validateOperationApplicability(
      makeQueue([makeExercise()]),
      [{ id: 'op-1', type: 'add_exercise', target: { dayNumber: 1 }, value: { exerciseName: 'Squat' } }],
    );
    expect(result.canApply).toBe(true);
  });

  it('unknown operation type does not throw and returns unmodified queue', () => {
    const queue = makeQueue([makeExercise()]);
    const ops = [{ id: 'op-1', type: 'unknown_type' as QueueOperation['type'], target: { exerciseName: 'Bench' } }];
    expect(() => applyOperations(queue, ops)).not.toThrow();
    expect(applyOperations(queue, ops)[0].exercises[0].weight).toBe('80');
  });

  it('add_exercise applies safe defaults for unspecified values', () => {
    const result = applyOperations(makeQueue([makeExercise()]), [{
      id: 'op-1', type: 'add_exercise', target: { dayNumber: 1 }, value: { exerciseName: 'Calf Press' },
    }]);
    const added = result[0].exercises[result[0].exercises.length - 1];
    expect(added.name).toBe('Calf Press');
    expect(added.weight).toBe('0');
    expect(added.reps).toBe('8');
    expect(added.sets).toBe('3');
    expect(added.restTime).toBe('180');
  });
});

// =============================================================================
// 5. COMPARE_QUEUES OUTPUT CONTRACT
// =============================================================================

describe('Safeguard contract: compareQueues output', () => {
  it('reports weight, reps, and sets changes as readable diffs', () => {
    const original = makeQueue([makeExercise({ weight: '80', reps: '8', sets: '3' })]);
    const modified = makeQueue([makeExercise({ weight: '90', reps: '12', sets: '5' })]);
    const diffs = compareQueues(original, modified);
    expect(diffs.length).toBeGreaterThanOrEqual(3);
    expect(diffs.some((d) => d.includes('weight'))).toBe(true);
    expect(diffs.some((d) => d.includes('reps'))).toBe(true);
    expect(diffs.some((d) => d.includes('sets'))).toBe(true);
  });

  it('returns empty array for identical queues', () => {
    const queue = makeQueue([makeExercise()]);
    expect(compareQueues(queue, queue)).toHaveLength(0);
  });
});
