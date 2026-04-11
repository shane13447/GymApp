/**
 * Phase 00 characterization tests: strict-zone queue parity contracts.
 *
 * These tests freeze observed behavior of the TOON encode/parse/repair/diff
 * pipeline as baseline contracts. Any change during refactoring signals a
 * potential parity drift. No source code behavior is changed.
 */

jest.mock('@/services/database', () => ({
  getWorkoutQueue: jest.fn(),
  saveWorkoutQueue: jest.fn(),
  clearWorkoutQueue: jest.fn(),
}));

import {
  encodeQueueForLLM,
  parseQueueFormatResponse,
  repairQueueWithIntent,
  compareWorkoutQueues,
  normalizeCustomisedSetPayload,
  getLastQueueParseFailureReason,
} from '@/services/workout-queue-modifier';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';

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
  createQueueItem({
    id: 'q2', dayNumber: 3, position: 2,
    exercises: [createExercise({ name: 'Barbell Deadlift', weight: '135', reps: '3', sets: '5' })],
  }),
];

// =============================================================================
// ENCODE CHARACTERIZATION
// =============================================================================

describe('Characterization: encode stability', () => {
  it('produces deterministic TOON output for the same input', () => {
    const first = encodeQueueForLLM(canonicalQueue);
    const second = encodeQueueForLLM(canonicalQueue);
    expect(first).toBe(second);
  });

  it('snapshot-encodes canonical queue as parity baseline', () => {
    expect(encodeQueueForLLM(canonicalQueue)).toMatchSnapshot('canonical-queue-encoded');
  });

  it('omits trailing pipe when variant is null', () => {
    const noVariant: WorkoutQueueItem[] = [
      createQueueItem({ id: 'q0', dayNumber: 1, exercises: [createExercise({ name: 'Leg Press', weight: '120', reps: '10', sets: '3', variant: null })] }),
    ];
    expect(encodeQueueForLLM(noVariant)).toBe('Q0:D1:Leg Press|120|10|3');
  });

  it('includes variant after pipe when present', () => {
    const withVariant: WorkoutQueueItem[] = [
      createQueueItem({ id: 'q0', dayNumber: 1, exercises: [createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3', variant: { angle: 'Incline' } })] }),
    ];
    expect(encodeQueueForLLM(withVariant)).toMatchSnapshot('variant-encoded');
  });

  it('encodes empty queue as empty string', () => {
    expect(encodeQueueForLLM([])).toBe('');
  });
});

// =============================================================================
// PARSE ROUND-TRIP CHARACTERIZATION
// =============================================================================

describe('Characterization: encode→parse round-trip', () => {
  it('round-trips a canonical queue preserving structure and fields', () => {
    const encoded = encodeQueueForLLM(canonicalQueue);
    const parsed = parseQueueFormatResponse(encoded, canonicalQueue, '', []);
    expect(parsed).not.toBeNull();
    expect(parsed!.length).toBe(canonicalQueue.length);
    for (let i = 0; i < canonicalQueue.length; i++) {
      expect(parsed![i].id).toBe(canonicalQueue[i].id);
      expect(parsed![i].dayNumber).toBe(canonicalQueue[i].dayNumber);
      expect(parsed![i].exercises.length).toBe(canonicalQueue[i].exercises.length);
      for (let j = 0; j < canonicalQueue[i].exercises.length; j++) {
        expect(parsed![i].exercises[j].name).toBe(canonicalQueue[i].exercises[j].name);
        expect(parsed![i].exercises[j].weight).toBe(canonicalQueue[i].exercises[j].weight);
        expect(parsed![i].exercises[j].reps).toBe(canonicalQueue[i].exercises[j].reps);
        expect(parsed![i].exercises[j].sets).toBe(canonicalQueue[i].exercises[j].sets);
      }
    }
  });

  it('preserves exercise instance IDs through round-trip', () => {
    const queue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0', dayNumber: 1,
        exercises: [
          createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Dumbbell Flyes', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];
    const encoded = encodeQueueForLLM(queue);
    const parsed = parseQueueFormatResponse(encoded, queue, '', []);
    expect(parsed).not.toBeNull();
    expect(parsed![0].exercises[0].exerciseInstanceId).toBe('q0:e0');
    expect(parsed![0].exercises[1].exerciseInstanceId).toBe('q0:e1');
  });
});

// =============================================================================
// REPAIR IDEMPOTENCY CHARACTERIZATION
// =============================================================================

describe('Characterization: repairQueueWithIntent idempotency', () => {
  it('is idempotent for weight-change requests', () => {
    const request = 'change barbell bench press weight to 95';
    const targeted = [{ queueItemId: 'q0', dayNumber: 1, exerciseIndex: 0, name: 'Barbell Bench Press', displayName: 'Barbell Bench Press' }];
    const encoded = encodeQueueForLLM(canonicalQueue);
    const parsed = parseQueueFormatResponse(encoded, canonicalQueue, request, targeted);
    expect(parsed).not.toBeNull();
    const once = repairQueueWithIntent(canonicalQueue, parsed!, request, targeted);
    const twice = repairQueueWithIntent(canonicalQueue, once, request, targeted);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('is idempotent for reps-change requests', () => {
    const queue: WorkoutQueueItem[] = [
      createQueueItem({ id: 'q0', dayNumber: 1, exercises: [createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3', exerciseInstanceId: 'q0:e0' })] }),
    ];
    const request = 'set bench press reps to 12';
    const targeted = [{ queueItemId: 'q0', dayNumber: 1, exerciseIndex: 0, name: 'Barbell Bench Press', displayName: 'Barbell Bench Press' }];
    const response = 'Q0:D1:Barbell Bench Press|80|12|3';
    const parsed = parseQueueFormatResponse(response, queue, request, targeted);
    const once = repairQueueWithIntent(queue, parsed!, request, targeted);
    const twice = repairQueueWithIntent(queue, once, request, targeted);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

// =============================================================================
// DIFF CONTRACT CHARACTERIZATION
// =============================================================================

describe('Characterization: compareWorkoutQueues diff contracts', () => {
  it('detects weight, reps, and sets changes as separate diffs', () => {
    const old = [createQueueItem({ id: 'q0', exercises: [createExercise({ name: 'Squat', weight: '100', reps: '5', sets: '3' })] })];
    const modified = [createQueueItem({ id: 'q0', exercises: [createExercise({ name: 'Squat', weight: '110', reps: '8', sets: '5' })] })];
    const diffs = compareWorkoutQueues(old, modified);
    expect(diffs).toHaveLength(3);
    const types = diffs.map((d) => d.type);
    expect(types).toContain('weight_change');
    expect(types).toContain('reps_change');
    expect(types).toContain('sets_change');
  });

  it('detects exercise additions and removals', () => {
    const old = [createQueueItem({ id: 'q0', exercises: [createExercise({ name: 'Squat' }), createExercise({ name: 'Calf Press' })] })];
    const fewer = [createQueueItem({ id: 'q0', exercises: [createExercise({ name: 'Squat' })] })];
    const more = [createQueueItem({ id: 'q0', exercises: [createExercise({ name: 'Squat' }), createExercise({ name: 'Calf Press' }), createExercise({ name: 'Leg Press' })] })];
    expect(compareWorkoutQueues(old, fewer).some((d) => d.type === 'removed')).toBe(true);
    expect(compareWorkoutQueues(old, more).some((d) => d.type === 'added')).toBe(true);
  });

  it('returns empty array for identical queues', () => {
    expect(compareWorkoutQueues(canonicalQueue, [...canonicalQueue])).toHaveLength(0);
  });
});

// =============================================================================
// PARSE REJECTION CONTRACTS
// =============================================================================

describe('Characterization: parse rejection boundaries', () => {
  it('rejects inline variant notation (variant_source_conflict)', () => {
    const queue = [createQueueItem({ id: 'q0', exercises: [createExercise({ name: 'Lat Pulldowns', variant: { grip: 'Wide Grip' }, exerciseInstanceId: 'q0:e0' })] })];
    const result = parseQueueFormatResponse('Q0:D1:Lat Pulldowns (Close Grip)|55|10|3', queue, 'switch to close grip', ['Lat Pulldowns']);
    expect(result).toBeNull();
    expect(getLastQueueParseFailureReason()).toBe('variant_source_conflict');
  });

  it('rejects reps range tokens', () => {
    expect(parseQueueFormatResponse('Q0:D1:Bench Press|80|8-10|3', canonicalQueue)).toBeNull();
  });

  it('rejects non-integer sets tokens', () => {
    expect(parseQueueFormatResponse('Q0:D1:Bench Press|80|8|three', canonicalQueue)).toBeNull();
  });
});

// =============================================================================
// CUSTOMISED SET PAYLOAD CONTRACT
// =============================================================================

describe('Characterization: normalizeCustomisedSetPayload contracts', () => {
  it('fills missing arrays when hasCustomisedSets is false', () => {
    expect(normalizeCustomisedSetPayload({ hasCustomisedSets: false }).repsBySet).toEqual([]);
    expect(normalizeCustomisedSetPayload({ hasCustomisedSets: false }).weightBySet).toEqual([]);
  });

  it('throws on mismatched array lengths when hasCustomisedSets is true', () => {
    expect(() => normalizeCustomisedSetPayload({ hasCustomisedSets: true, repsBySet: ['8', '10'], weightBySet: ['80'] })).toThrow('Invalid customised set payload');
  });

  it('throws on empty arrays when hasCustomisedSets is true', () => {
    expect(() => normalizeCustomisedSetPayload({ hasCustomisedSets: true, repsBySet: [], weightBySet: [] })).toThrow('Invalid customised set payload');
  });
});