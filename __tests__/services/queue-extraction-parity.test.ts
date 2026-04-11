/**
 * Phase 01 extraction parity tests — verify that all queue-domain APIs
 * remain available and produce identical outputs via the new module paths
 * and the legacy re-export path.
 *
 * These tests prove no behavior drift was introduced by the extraction.
 */

jest.mock('@/services/database', () => ({
  getWorkoutQueue: jest.fn(),
  saveWorkoutQueue: jest.fn(),
  clearWorkoutQueue: jest.fn(),
}));

// --- Imports from NEW canonical module path ---
import {
  encodeQueueForLLM as encodeQueueForLLM_new,
  buildCompressedPrompt as buildCompressedPrompt_new,
  COMPRESSED_SYSTEM_PROMPT as COMPRESSED_SYSTEM_PROMPT_new,
  roundWeightToNearestHalfKg as roundWeightToNearestHalfKg_new,
  normalizeCoachModifiedWeight as normalizeCoachModifiedWeight_new,
  roundCoachModifiedQueueWeights as roundCoachModifiedQueueWeights_new,
  normalizeCustomisedSetPayload as normalizeCustomisedSetPayload_new,
} from '@/services/queue/codec';

import type {
  TargetedExerciseRef as TargetedExerciseRef_new,
  ChangeType as ChangeType_new,
  QueueDifference as QueueDifference_new,
  ProposedChanges as ProposedChanges_new,
  QueueParseFailureReason as QueueParseFailureReason_new,
  CustomisedSetPayloadInput as CustomisedSetPayloadInput_new,
} from '@/services/queue/types';

// --- Imports from LEGACY path (backward compatibility) ---
import {
  encodeQueueForLLM as encodeQueueForLLM_legacy,
  buildCompressedPrompt as buildCompressedPrompt_legacy,
  COMPRESSED_SYSTEM_PROMPT as COMPRESSED_SYSTEM_PROMPT_legacy,
  roundWeightToNearestHalfKg as roundWeightToNearestHalfKg_legacy,
  normalizeCoachModifiedWeight as normalizeCoachModifiedWeight_legacy,
  roundCoachModifiedQueueWeights as roundCoachModifiedQueueWeights_legacy,
  normalizeCustomisedSetPayload as normalizeCustomisedSetPayload_legacy,
} from '@/services/workout-queue-modifier';

import type {
  TargetedExerciseRef as TargetedExerciseRef_legacy,
  ChangeType as ChangeType_legacy,
  QueueDifference as QueueDifference_legacy,
  ProposedChanges as ProposedChanges_legacy,
} from '@/services/workout-queue-modifier';

import type { ProgramExercise, WorkoutQueueItem } from '@/types';

// =============================================================================
// TEST HELPERS
// =============================================================================

const createExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  name: 'Barbell Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  ...overrides,
});

const createQueueItem = (overrides: Partial<WorkoutQueueItem> = {}): WorkoutQueueItem => ({
  id: 'queue-1',
  programId: 'program-1',
  programName: 'Test Program',
  dayNumber: 1,
  exercises: [createExercise()],
  position: 0,
  ...overrides,
});

const canonicalQueue: WorkoutQueueItem[] = [
  createQueueItem({
    id: 'q0', dayNumber: 1, position: 0,
    exercises: [
      createExercise({ name: 'Barbell Bench Press', weight: '92.5', reps: '5', sets: '3', variant: { angle: 'Flat' } }),
      createExercise({ name: 'Dumbbell Flyes', weight: '15', reps: '10', sets: '3' }),
    ],
  }),
  createQueueItem({
    id: 'q1', dayNumber: 2, position: 1,
    exercises: [
      createExercise({ name: 'Barbell Back Squat', weight: '117.5', reps: '4', sets: '5', variant: { angle: 'High Bar' } }),
      createExercise({ name: 'Leg Extensions', weight: '55', reps: '15', sets: '3' }),
    ],
  }),
];

// =============================================================================
// MODULE AVAILABILITY TESTS
// =============================================================================

describe('Phase 01 extraction: module availability', () => {
  it('exposes encodeQueueForLLM from both paths', () => {
    expect(typeof encodeQueueForLLM_new).toBe('function');
    expect(typeof encodeQueueForLLM_legacy).toBe('function');
  });

  it('exposes buildCompressedPrompt from both paths', () => {
    expect(typeof buildCompressedPrompt_new).toBe('function');
    expect(typeof buildCompressedPrompt_legacy).toBe('function');
  });

  it('exposes COMPRESSED_SYSTEM_PROMPT from both paths', () => {
    expect(typeof COMPRESSED_SYSTEM_PROMPT_new).toBe('string');
    expect(typeof COMPRESSED_SYSTEM_PROMPT_legacy).toBe('string');
  });

  it('exposes roundWeightToNearestHalfKg from both paths', () => {
    expect(typeof roundWeightToNearestHalfKg_new).toBe('function');
    expect(typeof roundWeightToNearestHalfKg_legacy).toBe('function');
  });

  it('exposes normalizeCoachModifiedWeight from both paths', () => {
    expect(typeof normalizeCoachModifiedWeight_new).toBe('function');
    expect(typeof normalizeCoachModifiedWeight_legacy).toBe('function');
  });

  it('exposes roundCoachModifiedQueueWeights from both paths', () => {
    expect(typeof roundCoachModifiedQueueWeights_new).toBe('function');
    expect(typeof roundCoachModifiedQueueWeights_legacy).toBe('function');
  });

  it('exposes normalizeCustomisedSetPayload from both paths', () => {
    expect(typeof normalizeCustomisedSetPayload_new).toBe('function');
    expect(typeof normalizeCustomisedSetPayload_legacy).toBe('function');
  });
});

// =============================================================================
// CODEC PARITY TESTS — verify new and legacy paths produce identical output
// =============================================================================

describe('Phase 01 extraction: codec parity', () => {
  it('encodeQueueForLLM produces identical output from both paths', () => {
    const result_new = encodeQueueForLLM_new(canonicalQueue);
    const result_legacy = encodeQueueForLLM_legacy(canonicalQueue);
    expect(result_new).toBe(result_legacy);
  });

  it('buildCompressedPrompt produces identical output from both paths', () => {
    const result_new = buildCompressedPrompt_new('change bench press weight to 95', canonicalQueue);
    const result_legacy = buildCompressedPrompt_legacy('change bench press weight to 95', canonicalQueue);
    expect(result_new).toBe(result_legacy);
  });

  it('COMPRESSED_SYSTEM_PROMPT is the same string from both paths', () => {
    expect(COMPRESSED_SYSTEM_PROMPT_new).toBe(COMPRESSED_SYSTEM_PROMPT_legacy);
  });

  it('roundWeightToNearestHalfKg produces identical output from both paths', () => {
    const values = ['82.74', '82.76', '0', '100', '50.25', 'abc'];
    for (const v of values) {
      expect(roundWeightToNearestHalfKg_new(v)).toBe(roundWeightToNearestHalfKg_legacy(v));
    }
  });

  it('normalizeCoachModifiedWeight produces identical output from both paths', () => {
    const values = ['82.74', '82.76', '0', '100.5', 'abc'];
    for (const v of values) {
      expect(normalizeCoachModifiedWeight_new(v)).toBe(normalizeCoachModifiedWeight_legacy(v));
    }
  });

  it('roundCoachModifiedQueueWeights produces identical output from both paths', () => {
    const original: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0', dayNumber: 1,
        exercises: [
          createExercise({ name: 'Bench', weight: '80', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Squat', weight: '100', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];
    const parsed: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0', dayNumber: 1,
        exercises: [
          createExercise({ name: 'Bench', weight: '82.74', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Squat', weight: '100', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result_new = roundCoachModifiedQueueWeights_new(original, parsed);
    const result_legacy = roundCoachModifiedQueueWeights_legacy(original, parsed);
    expect(JSON.stringify(result_new)).toBe(JSON.stringify(result_legacy));
  });

  it('normalizeCustomisedSetPayload produces identical output from both paths', () => {
    const payloads: CustomisedSetPayloadInput_new[] = [
      { hasCustomisedSets: false },
      { hasCustomisedSets: true, repsBySet: ['10', '10'], weightBySet: ['80', '80'] },
    ];

    for (const payload of payloads) {
      expect(normalizeCustomisedSetPayload_new(payload)).toEqual(normalizeCustomisedSetPayload_legacy(payload));
    }

    expect(() => normalizeCustomisedSetPayload_new({ hasCustomisedSets: true, repsBySet: ['10'], weightBySet: ['80', '80'] })).toThrow();
    expect(() => normalizeCustomisedSetPayload_legacy({ hasCustomisedSets: true, repsBySet: ['10'], weightBySet: ['80', '80'] })).toThrow();
  });
});

// =============================================================================
// TYPE EQUIVALENCE TESTS — verify new and legacy type paths resolve correctly
// =============================================================================

describe('Phase 01 extraction: type equivalence', () => {
  it('TargetedExerciseRef resolves from both paths', () => {
    const ref: TargetedExerciseRef_new = {
      queueItemId: 'q0',
      dayNumber: 1,
      exerciseIndex: 0,
      name: 'Bench',
      displayName: 'Bench',
    };
    const refLegacy: TargetedExerciseRef_legacy = ref;
    expect(ref.queueItemId).toBe(refLegacy.queueItemId);
  });

  it('ChangeType resolves from both paths', () => {
    const change: ChangeType_new = 'weight';
    const changeLegacy: ChangeType_legacy = change;
    expect(change).toBe(changeLegacy);
  });

  it('QueueDifference resolves from both paths', () => {
    const diff: QueueDifference_new = {
      type: 'weight_change',
      queueItemId: 'q0',
      queueItemName: 'Test',
      dayNumber: 1,
      exerciseName: 'Bench',
      oldWeight: '80',
      newWeight: '90',
    };
    const diffLegacy: QueueDifference_legacy = diff;
    expect(diff.type).toBe(diffLegacy.type);
  });

  it('ProposedChanges resolves from both paths', () => {
    const changes: ProposedChanges_new = {
      variantChanges: [],
      weightChanges: [],
      repsChanges: [],
      setsChanges: [],
      removals: [],
      additions: [],
      swaps: [],
    };
    const changesLegacy: ProposedChanges_legacy = changes;
    expect(changes.weightChanges).toBe(changesLegacy.weightChanges);
  });
});

// =============================================================================
// ENCODE DETERMINISM (snapshot stability)
// =============================================================================

describe('Phase 01 extraction: encode determinism via new module', () => {
  it('produces deterministic output for the canonical queue', () => {
    const first = encodeQueueForLLM_new(canonicalQueue);
    const second = encodeQueueForLLM_new(canonicalQueue);
    expect(first).toBe(second);
  });

  it('snapshot-encodes canonical queue via new module path', () => {
    expect(encodeQueueForLLM_new(canonicalQueue)).toMatchSnapshot('phase01-canonical-queue-encoded');
  });
});