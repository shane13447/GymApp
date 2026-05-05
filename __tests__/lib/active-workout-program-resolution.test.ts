import { resolveWorkoutProgram } from '@/lib/active-workout-program-resolution';
import type { Program, WorkoutQueueItem } from '@/types';

const makeProgram = (id: string, name = id): Program => ({
  id,
  name,
  createdAt: '2026-05-05T00:00:00.000Z',
  workoutDays: [],
});

const makeQueueItem = (programId: string): WorkoutQueueItem => ({
  id: 'queue-1',
  programId,
  programName: programId,
  dayNumber: 1,
  exercises: [],
  position: 0,
});

describe('resolveWorkoutProgram', () => {
  it('uses the cached program when it is present', async () => {
    const cached = makeProgram('current');
    const lookup = jest.fn(async () => makeProgram('from-db'));

    await expect(resolveWorkoutProgram([cached], makeQueueItem('current'), lookup)).resolves.toBe(cached);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('falls back to persistence when the active workout program cache is stale', async () => {
    const persisted = makeProgram('new-current');
    const lookup = jest.fn(async () => persisted);

    await expect(resolveWorkoutProgram([makeProgram('old-current')], makeQueueItem('new-current'), lookup)).resolves.toBe(persisted);
    expect(lookup).toHaveBeenCalledWith('new-current');
  });
});
