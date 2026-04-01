import exerciseSelectionCatalog from '@/data/exerciseSelection.json';
import { buildProgramDraftContext } from '@/services/coach/program-draft-context';

describe('buildProgramDraftContext', () => {
  it('builds context from profile defaults and explicit values', () => {
    const context = buildProgramDraftContext(
      {
        experienceLevel: 'intermediate',
        trainingDaysPerWeek: 3,
        sessionDurationMinutes: 75,
        trainingGoal: null,
      },
      exerciseSelectionCatalog,
    );

    expect(context.profile.trainingDaysPerWeek).toBe(3);
    expect(context.profile.sessionDurationMinutes).toBe(75);
    expect(context.profile.experienceLevel).toBe('intermediate');
  });

  it('whitelists allowed exercises from exerciseSelection only', () => {
    const context = buildProgramDraftContext(
      {
        experienceLevel: 'beginner',
        trainingDaysPerWeek: null,
        sessionDurationMinutes: null,
        trainingGoal: null,
      },
      exerciseSelectionCatalog,
    );

    expect(context.allowedExerciseNames).toContain('Barbell Bench Press');
    expect(context.allowedExerciseNames).not.toContain('Made Up Exercise');
    expect(context.allowedExercises.length).toBe(exerciseSelectionCatalog.length);
  });

  // =========================================================================
  // Null/Empty inputs
  // =========================================================================
  it('applies defaults when all profile fields are null', () => {
    const context = buildProgramDraftContext(
      {
        experienceLevel: null,
        trainingDaysPerWeek: null,
        sessionDurationMinutes: null,
        trainingGoal: null,
      },
      exerciseSelectionCatalog,
    );

    expect(context.profile.experienceLevel).toBe('intermediate');
    expect(context.profile.trainingDaysPerWeek).toBe(3);
    expect(context.profile.sessionDurationMinutes).toBe(75);
  });

  it('handles empty exercise catalog', () => {
    const context = buildProgramDraftContext(
      {
        experienceLevel: 'beginner',
        trainingDaysPerWeek: 3,
        sessionDurationMinutes: 60,
        trainingGoal: null,
      },
      [],
    );

    expect(context.allowedExerciseNames).toHaveLength(0);
    expect(context.allowedExercises).toHaveLength(0);
  });

  // =========================================================================
  // Experience levels
  // =========================================================================
  it('returns correct progression defaults for beginner', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'beginner', trainingDaysPerWeek: 3, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.progressionDefaults.threshold).toBe(0);
  });

  it('returns correct progression defaults for intermediate', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'intermediate', trainingDaysPerWeek: 3, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.progressionDefaults.threshold).toBe(1);
  });

  it('returns correct progression defaults for advanced', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'advanced', trainingDaysPerWeek: 3, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.progressionDefaults.threshold).toBe(3);
  });

  // =========================================================================
  // Boundary inputs
  // =========================================================================
  it('produces a valid context structure at min training days (1)', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'beginner', trainingDaysPerWeek: 1, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.profile.trainingDaysPerWeek).toBe(1);
    expect(context.allowedExercises.length).toBeGreaterThan(0);
    expect(context.progressionDefaults).toBeDefined();
  });

  it('produces a valid context structure at max training days (7)', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'advanced', trainingDaysPerWeek: 7, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.profile.trainingDaysPerWeek).toBe(7);
    expect(context.allowedExercises.length).toBeGreaterThan(0);
    expect(context.progressionDefaults).toBeDefined();
  });

  it('produces a valid context structure at max session duration (180)', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'intermediate', trainingDaysPerWeek: 5, sessionDurationMinutes: 180, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.profile.sessionDurationMinutes).toBe(180);
    expect(context.allowedExercises.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // Exception inputs
  // =========================================================================
  it('preserves exercise metadata structure from catalog', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'beginner', trainingDaysPerWeek: 3, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    for (const exercise of context.allowedExercises) {
      expect(typeof exercise.name).toBe('string');
      expect(exercise.name.length).toBeGreaterThan(0);
      expect(typeof exercise.equipment).toBe('string');
      expect(Array.isArray(exercise.muscle_groups_worked)).toBe(true);
      expect(exercise.muscle_groups_worked.length).toBeGreaterThan(0);
      expect(typeof exercise.isCompound).toBe('boolean');
    }
  });

  it('includes variant options from catalog for at least some exercises', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'beginner', trainingDaysPerWeek: 3, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    const exercisesWithVariants = context.allowedExercises.filter((e) => e.variantOptions && e.variantOptions.length > 0);
    expect(exercisesWithVariants.length).toBeGreaterThan(0);
  });
});
