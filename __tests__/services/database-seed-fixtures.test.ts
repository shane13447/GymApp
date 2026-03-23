jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import { mapSeedFixtureToProgram, validateSeedFixture } from '@/services/database';

type SeedFixture = Array<{
  dayNumber: number;
  exercises: Array<{
    name: string;
    reps: number[];
    weight: number[];
  }>;
}>;

describe('seed fixture helpers', () => {
  describe('validateSeedFixture', () => {
    it('accepts a valid fixture array', () => {
      const fixture: SeedFixture = [
        {
          dayNumber: 1,
          exercises: [{ name: 'Leg Press', reps: [10, 10], weight: [100, 100] }],
        },
      ];

      expect(validateSeedFixture(fixture).isValid).toBe(true);
    });

    it('rejects an empty fixture array', () => {
      const fixture: SeedFixture = [];

      expect(validateSeedFixture(fixture).isValid).toBe(false);
    });
  });

  describe('mapSeedFixtureToProgram', () => {
    it('maps fixture rows to Program with derived sets and default fields', () => {
      const fixture: SeedFixture = [
        {
          dayNumber: 1,
          exercises: [{ name: 'Leg Press', reps: [12, 12, 12], weight: [160, 160, 160] }],
        },
      ];

      const catalog = {
        'leg press': {
          equipment: 'Machine',
          muscle_groups_worked: ['quads'],
          isCompound: true,
        },
      };

      const program = mapSeedFixtureToProgram('seed-test-program', 'Test Program', fixture, catalog);

      expect(program.id).toBe('seed-test-program');
      expect(program.name).toBe('Test Program');
      expect(program.workoutDays[0].exercises[0].sets).toBe('3');
      expect(program.workoutDays[0].exercises[0].hasCustomisedSets).toBe(true);
    });
  });
});
