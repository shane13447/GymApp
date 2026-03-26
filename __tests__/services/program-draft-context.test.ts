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
});
