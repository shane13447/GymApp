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
  it('handles min training days (1)', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'beginner', trainingDaysPerWeek: 1, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.profile.trainingDaysPerWeek).toBe(1);
  });

  it('handles max training days (7)', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'advanced', trainingDaysPerWeek: 7, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.profile.trainingDaysPerWeek).toBe(7);
  });

  it('handles max session duration (180)', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'intermediate', trainingDaysPerWeek: 5, sessionDurationMinutes: 180, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    expect(context.profile.sessionDurationMinutes).toBe(180);
  });

  // =========================================================================
  // Exception inputs
  // =========================================================================
  it('preserves exercise metadata from catalog', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'beginner', trainingDaysPerWeek: 3, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    const benchPress = context.allowedExercises.find((e) => e.name === 'Barbell Bench Press');
    expect(benchPress).toBeDefined();
    expect(benchPress?.equipment).toBe('Barbell');
    expect(benchPress?.muscle_groups_worked).toContain('chest');
    expect(benchPress?.isCompound).toBe(true);
  });

  it('includes variant options from catalog', () => {
    const context = buildProgramDraftContext(
      { experienceLevel: 'beginner', trainingDaysPerWeek: 3, sessionDurationMinutes: 60, trainingGoal: null },
      exerciseSelectionCatalog,
    );

    const exercisesWithVariants = context.allowedExercises.filter((e) => e.variantOptions && e.variantOptions.length > 0);
    expect(exercisesWithVariants.length).toBeGreaterThan(0);
  });
});
