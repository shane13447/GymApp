describe('database initialization', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('initializes successfully when migration target tables are missing', async () => {
    const execAsync = jest.fn(async (sql: string) => {
      if (sql.includes('ALTER TABLE')) {
        throw new Error('no such table');
      }
    });

    const getAllAsync = jest.fn(async () => []);
    const getFirstAsync = jest.fn(async () => null);

    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync,
        getAllAsync,
        getFirstAsync,
        runAsync: jest.fn(),
        getAllSync: jest.fn(),
        getFirstSync: jest.fn(),
      })),
    }));

    const { getDatabase } = await import('@/services/database');

    await expect(getDatabase()).resolves.toBeDefined();
    expect(execAsync).not.toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE'));
  });
});
