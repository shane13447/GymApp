import exerciseSelectionCatalog from '@/data/exerciseSelection.json';
import { buildProgramDraftContext } from '@/services/coach/program-draft-context';
import {
  buildProgramDraftRequest,
  prepareProgramDraftFromModelResponse,
  getGenerationConfiguration,
} from '@/services/coach/program-draft';

describe('program-draft', () => {
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

  // =========================================================================
  // Null/Empty inputs
  // =========================================================================
  it('applies defaults when all profile fields are null', () => {
    const request = buildProgramDraftRequest({
      experienceLevel: null,
      trainingDaysPerWeek: null,
      sessionDurationMinutes: null,
      trainingGoal: null,
    });

    expect(request.llmInput.profile.experienceLevel).toBe('intermediate');
    expect(request.llmInput.profile.trainingDaysPerWeek).toBe(3);
    expect(request.llmInput.profile.sessionDurationMinutes).toBe(75);
  });

  it('throws on empty string response', () => {
    expect(() => prepareProgramDraftFromModelResponse('')).toThrow();
  });

  it('throws on null-like JSON response', () => {
    expect(() => prepareProgramDraftFromModelResponse('null')).toThrow();
  });

  // =========================================================================
  // Invalid inputs
  // =========================================================================
  it('throws on array JSON response', () => {
    expect(() => prepareProgramDraftFromModelResponse('[]')).toThrow();
  });

  it('throws on response with empty workoutDays', () => {
    expect(() =>
      prepareProgramDraftFromModelResponse(
        JSON.stringify({ id: 'test', name: 'Test', workoutDays: [] })
      )
    ).toThrow();
  });

  it('throws on response with no valid workout days', () => {
    expect(() =>
      prepareProgramDraftFromModelResponse(
        JSON.stringify({
          id: 'test',
          name: 'Test',
          workoutDays: [{ dayNumber: 1, exercises: [] }],
        })
      )
    ).toThrow();
  });

  // =========================================================================
  // Boundary inputs
  // =========================================================================
  it('handles max training days per week', () => {
    const request = buildProgramDraftRequest({
      experienceLevel: 'intermediate',
      trainingDaysPerWeek: 7,
      sessionDurationMinutes: 60,
    });

    expect(request.llmInput.profile.trainingDaysPerWeek).toBe(7);
  });

  it('handles max session duration', () => {
    const request = buildProgramDraftRequest({
      experienceLevel: 'advanced',
      trainingDaysPerWeek: 5,
      sessionDurationMinutes: 180,
    });

    expect(request.llmInput.profile.sessionDurationMinutes).toBe(180);
  });

  // =========================================================================
  // getGenerationConfiguration
  // =========================================================================
  describe('getGenerationConfiguration', () => {
    it('returns config for valid inputs', () => {
      const config = getGenerationConfiguration({
        experienceLevel: 'intermediate',
        trainingDaysPerWeek: 4,
        sessionDurationMinutes: 90,
      });

      expect(config).toBeDefined();
      expect(config.experienceLevel).toBe('intermediate');
    });

    it('applies defaults for null inputs', () => {
      const config = getGenerationConfiguration({
        experienceLevel: null,
        trainingDaysPerWeek: null,
        sessionDurationMinutes: null,
      });

      expect(config.experienceLevel).toBe('intermediate');
    });
  });
});

