import { PROGRAM_GENERATION_DEFAULTS } from '@/constants/program-generation-defaults';
import exerciseSelectionCatalog from '@/data/exerciseSelection.json';
import { buildProgramDraftContext } from '@/services/coach/program-draft-context';
import {
  buildProgramDraftRequest,
  generateProgramDraft,
  prepareProgramDraftFromModelResponse,
} from '@/services/coach/program-draft';
import type { WorkoutDay } from '@/types';

describe('generateProgramDraft', () => {
  it('generates draft with partial profile inputs using defaults', () => {
    const draft = generateProgramDraft({
      trainingDaysPerWeek: null,
      sessionDurationMinutes: null,
      experienceLevel: null,
    });

    expect(draft.workoutDays.length).toBe(PROGRAM_GENERATION_DEFAULTS.trainingDaysPerWeek);
    expect(draft.workoutDays.every((day: WorkoutDay) => day.exercises.length > 0)).toBe(true);
  });

  it('uses provided profile inputs when present', () => {
    const draft = generateProgramDraft({
      trainingDaysPerWeek: 3,
      sessionDurationMinutes: 40,
      experienceLevel: 'beginner',
    });

    expect(draft.workoutDays).toHaveLength(3);
    expect(draft.workoutDays.every((day: WorkoutDay) => day.exercises.length > 0)).toBe(true);
    expect(draft.workoutDays.every((day: WorkoutDay) => day.exercises.length <= 4)).toBe(true);
  });

  it('builds generation context using user profile fields and exerciseSelection catalog entries only', () => {
    const context = buildProgramDraftContext(
      {
        experienceLevel: 'intermediate',
        trainingDaysPerWeek: 3,
        sessionDurationMinutes: 75,
      },
      exerciseSelectionCatalog,
    );

    expect(context.profile.trainingDaysPerWeek).toBe(3);
    expect(context.allowedExerciseNames).toContain('Barbell Bench Press');
    expect(context.allowedExerciseNames).not.toContain('Made Up Exercise');
  });

  it('builds llm request with prompt, profile, and allowed exercises', () => {
    const request = buildProgramDraftRequest({
      experienceLevel: null,
      trainingDaysPerWeek: null,
      sessionDurationMinutes: null,
      trainingGoal: null,
    });

    expect(request.prompt).toContain('JSON only');
    expect(request.llmInput.output_schema_version).toBe(1);
    expect(request.llmInput.allowed_exercises.length).toBeGreaterThan(0);
  });

  it('throws validation details when model response is not ingestible', () => {
    expect(() => prepareProgramDraftFromModelResponse('not-json')).toThrow(
      'Program draft was not ingestible: Program draft must be a JSON object',
    );
  });
});

