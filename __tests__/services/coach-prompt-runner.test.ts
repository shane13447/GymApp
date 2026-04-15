// Mock database module to avoid expo-sqlite ESM issues in transitive imports
jest.mock('@/services/database', () => ({
  getWorkoutQueue: jest.fn(),
  saveWorkoutQueue: jest.fn(),
  clearWorkoutQueue: jest.fn(),
}));

import type { ExerciseVariant } from '@/types';
import {
  applyCanonicalSetCount,
  executePromptThroughCoachPipeline,
  materializeCanonicalFixtureQueue,
  runCoachPromptSuite,
  type CanonicalFixtureDay,
  type CoachPromptCase,
} from '@/services/coach/prompt-test-runner';

const createFixture = (): CanonicalFixtureDay[] => [
  {
    id: 'q0',
    dayNumber: 1,
    exercises: [
      {
        name: 'Barbell Bench Press',
        variant: { angle: 'Flat' } as ExerciseVariant,
        reps: [5, 5, 5],
        weight: [92.5, 92.5, 92.5],
      },
    ],
  },
];

describe('prompt-test-runner', () => {
  it('expands canonical set arrays by repeating last values when increasing set count', () => {
    const updated = applyCanonicalSetCount(
      {
        name: 'Barbell Bench Press',
        reps: [5, 5, 5],
        weight: [92.5, 92.5, 92.5],
      },
      5
    );

    expect(updated.reps).toEqual([5, 5, 5, 5, 5]);
    expect(updated.weight).toEqual([92.5, 92.5, 92.5, 92.5, 92.5]);
  });

  it('materializes canonical fixture rows into customized-set queue exercises', () => {
    const queue = materializeCanonicalFixtureQueue(createFixture());
    const bench = queue[0].exercises[0];

    expect(bench.hasCustomisedSets).toBe(true);
    expect(bench.reps).toBe('[5,5,5]');
    expect(bench.weight).toBe('[92.5,92.5,92.5]');
    expect(bench.sets).toBe('3');
  });

  it('returns NO_CHANGES_MODEL_NOOP when model output is unchanged', async () => {
    const queue = materializeCanonicalFixtureQueue(createFixture());

    const result = await executePromptThroughCoachPipeline(
      {
        callCoachProxy: async () => JSON.stringify({
          version: 1,
          operations: [
            {
              id: 'op_1',
              type: 'modify_weight',
              target: { dayNumber: 1, exerciseName: 'Barbell Bench Press' },
              value: { weight: 92.5 },
            },
          ],
        }),
      },
      { type: 'Single - Weight', prompt: 'change barbell bench press weight to 92.5' },
      queue
    );

    expect(result.status).toBe('NO_CHANGES_MODEL_NOOP');
    expect(result.reasons).toEqual(['No changes detected: model operations produced an unchanged queue']);
  });

  it('returns FAILED_PARSE when the proxy returns legacy TOON output', async () => {
    const queue = materializeCanonicalFixtureQueue(createFixture());

    const result = await executePromptThroughCoachPipeline(
      {
        callCoachProxy: async () => 'Q0:D1:Barbell Bench Press|92.5|5|3|Incline',
      },
      { type: 'Single - Weight', prompt: 'change barbell bench press weight to 92.5' },
      queue
    );

    expect(result.status).toBe('FAILED_PARSE');
    expect(result.reasons?.[0]).toContain('TOON format rejected');
  });

  it('returns proposed changes when the pipeline detects a valid modification', async () => {
    const queue = materializeCanonicalFixtureQueue(createFixture());

    const result = await executePromptThroughCoachPipeline(
      {
        callCoachProxy: async () => JSON.stringify({
          version: 1,
          operations: [
            {
              id: 'op_1',
              type: 'modify_weight',
              target: { dayNumber: 1, exerciseName: 'Barbell Bench Press' },
              value: { weight: 95 },
            },
          ],
        }),
      },
      { type: 'Single - Weight', prompt: 'change barbell bench press weight to 95' },
      queue
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.proposedChanges).not.toBeUndefined();
    expect(result.proposedChanges?.weightChanges).toEqual([
      expect.objectContaining({
        exerciseName: 'Barbell Bench Press (Flat)',
        oldWeight: '92.5',
        newWeight: '95',
      }),
    ]);
  });

  it('continues through all prompts after failures', async () => {
    const prompts: CoachPromptCase[] = [
      { type: 'T1', prompt: 'first' },
      { type: 'T2', prompt: 'second' },
      { type: 'T3', prompt: 'third' },
    ];

    const runPrompt = jest
      .fn()
      .mockResolvedValueOnce({ status: 'SUCCESS' as const })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'FAILED_PARSE' as const, reasons: ['parse'] });

    const result = await runCoachPromptSuite({ prompts, baseQueue: [], runPrompt });

    expect(runPrompt).toHaveBeenCalledTimes(3);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].status).toBe('SUCCESS');
    expect(result.results[1].status).toBe('ERROR');
    expect(result.results[2].status).toBe('FAILED_PARSE');
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(2);
    expect(result.summary.gatePassed).toBe(false);
  });
});
