jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

describe('profile field persistence', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('persists experience, training days per week, and session duration', async () => {
    let profileState: {
      id: string;
      name: string | null;
      current_weight: number | null;
      goal_weight: number | null;
      training_goal: string | null;
      target_sets_per_week: number | null;
      experience_level: string | null;
      training_days_per_week: number | null;
      session_duration_minutes: number | null;
    } = {
      id: 'default',
      name: null,
      current_weight: null,
      goal_weight: null,
      training_goal: null,
      target_sets_per_week: null,
      experience_level: null,
      training_days_per_week: null,
      session_duration_minutes: null,
    };

    const db = {
      execAsync: jest.fn(async () => {}),
      getAllSync: jest.fn(),
      getFirstSync: jest.fn(),
      getAllAsync: jest.fn(async () => []),
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT * FROM user_profile')) {
          return profileState;
        }
        if (sql.includes("SELECT name FROM sqlite_master WHERE type = 'table'")) {
          return { name: 'user_profile' };
        }
        return null;
      }),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('UPDATE user_profile SET')) {
          const values = params ?? [];
          let valueIndex = 0;

          if (sql.includes('experience_level = ?')) {
            profileState.experience_level = (values[valueIndex] as string | null) ?? null;
            valueIndex += 1;
          }
          if (sql.includes('training_days_per_week = ?')) {
            profileState.training_days_per_week = (values[valueIndex] as number | null) ?? null;
            valueIndex += 1;
          }
          if (sql.includes('session_duration_minutes = ?')) {
            profileState.session_duration_minutes = (values[valueIndex] as number | null) ?? null;
            valueIndex += 1;
          }

          return { lastInsertRowId: 1, changes: 1 };
        }

        return { lastInsertRowId: 1, changes: 1 };
      }),
    };

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => db),
    }));

    const { updateUserProfile, getUserProfile } = await import('@/services/database');

    await updateUserProfile({
      experienceLevel: 'beginner',
      trainingDaysPerWeek: 3,
      sessionDurationMinutes: 60,
    });

    const profile = await getUserProfile();

    expect(profile.experienceLevel).toBe('beginner');
    expect(profile.trainingDaysPerWeek).toBe(3);
    expect(profile.sessionDurationMinutes).toBe(60);
  });
});
