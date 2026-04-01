import { validateAndRepairProgramDraft, validateProgramDraftResponse } from '@/services/coach/program-draft-validator';

const makeExercise = (overrides: Record<string, unknown> = {}) => ({
  name: 'Barbell Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest'],
  isCompound: true,
  weight: '60',
  reps: '10',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  ...overrides,
});

const makeDraft = (overrides: Record<string, unknown> = {}, exerciseOverrides: Record<string, unknown> = {}) => ({
  id: 'test',
  name: 'Test',
  workoutDays: [
    {
      dayNumber: 1,
      exercises: [makeExercise(exerciseOverrides)],
    },
  ],
  ...overrides,
});

describe('program-draft-validator', () => {
  it('rejects non-json and schema-invalid drafts from llm response', () => {
    expect(validateProgramDraftResponse('not-json').ok).toBe(false);
    expect(validateProgramDraftResponse('{"workoutDays":[]}').ok).toBe(false);
  });

  it('repairs minor coercible fields and returns app-ingestible draft', () => {
    const rawDraftFromModel = {
      id: 'draft-from-model',
      name: 'LLM Draft',
      workoutDays: [
        {
          dayNumber: '1',
          exercises: [
            {
              name: 'Barbell Bench Press',
              equipment: 'Barbell',
              muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
              isCompound: true,
              weight: 60,
              reps: 10,
              sets: 3,
              restTime: 180,
              progression: 2.5,
            },
          ],
        },
      ],
    };

    const result = validateAndRepairProgramDraft(rawDraftFromModel);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.workoutDays[0].exercises[0].reps).toMatch(/^\d+$/);
      expect(result.value.workoutDays[0].exercises[0].hasCustomisedSets).toBe(false);
      expect(result.value.workoutDays[0].dayNumber).toBe(1);
    }
  });

  it('rejects payloads that include unknown top-level keys', () => {
    const result = validateAndRepairProgramDraft({
      id: 'draft-with-extra',
      name: 'Draft',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
              name: 'Barbell Bench Press',
              equipment: 'Barbell',
              muscle_groups_worked: ['chest'],
              isCompound: true,
              weight: '60',
              reps: '10',
              sets: '3',
              restTime: '180',
              progression: '2.5',
              hasCustomisedSets: false,
            },
          ],
        },
      ],
      notes: 'should not be allowed',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('unknown top-level keys');
    }
  });

  // =========================================================================
  // Null/Empty inputs
  // =========================================================================
  it('rejects null input', () => {
    expect(validateAndRepairProgramDraft(null).ok).toBe(false);
  });

  it('rejects undefined input', () => {
    expect(validateAndRepairProgramDraft(undefined).ok).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateAndRepairProgramDraft('').ok).toBe(false);
  });

  it('rejects empty object', () => {
    expect(validateAndRepairProgramDraft({}).ok).toBe(false);
  });

  it('rejects empty workoutDays array', () => {
    expect(validateAndRepairProgramDraft({ id: 't', name: 'T', workoutDays: [] }).ok).toBe(false);
  });

  // =========================================================================
  // Invalid inputs
  // =========================================================================
  it('rejects array input', () => {
    expect(validateAndRepairProgramDraft([]).ok).toBe(false);
  });

  it('rejects number input', () => {
    expect(validateAndRepairProgramDraft(42).ok).toBe(false);
  });

  it('rejects workout day with empty exercises', () => {
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [{ dayNumber: 1, exercises: [] }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects exercise with missing name', () => {
    const { name: _, ...noName } = makeExercise();
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [{ dayNumber: 1, exercises: [noName] }],
    });
    expect(result.ok).toBe(false);
  });

  // =========================================================================
  // Coercion edge cases
  // =========================================================================
  it('coerces numeric string dayNumber to integer', () => {
    const result = validateAndRepairProgramDraft(
      makeDraft({}, {}),
    );
    // Override dayNumber to string at the workoutDays level
    const draft = makeDraft();
    (draft.workoutDays[0] as any).dayNumber = '2';
    const result2 = validateAndRepairProgramDraft(draft);
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.value.workoutDays[0].dayNumber).toBe(2);
    }
  });

  it('coerces number weight to string', () => {
    const result = validateAndRepairProgramDraft(
      makeDraft({}, { weight: 80, reps: 10, sets: 3, restTime: 180, progression: 2.5 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workoutDays[0].exercises[0].weight).toBe('80');
      expect(typeof result.value.workoutDays[0].exercises[0].weight).toBe('string');
    }
  });

  it('uses fallback for missing weight', () => {
    const { weight: _, ...noWeight } = makeExercise();
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [{ dayNumber: 1, exercises: [noWeight] }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workoutDays[0].exercises[0].weight).toBe('0');
    }
  });

  it('uses fallback for missing id and name', () => {
    const { id: _id, name: _name, ...noIdName } = makeDraft();
    const result = validateAndRepairProgramDraft(noIdName);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toContain('draft-program-');
      expect(result.value.name).toBe('Draft Program');
    }
  });

  // =========================================================================
  // Catalog lookup
  // =========================================================================
  it('fills missing exercise fields from catalog', () => {
    const { equipment: _e, muscle_groups_worked: _m, isCompound: _c, ...minimalExercise } = makeExercise();
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [{ dayNumber: 1, exercises: [minimalExercise] }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const exercise = result.value.workoutDays[0].exercises[0];
      expect(exercise.equipment).toBe('Barbell');
      expect(exercise.muscle_groups_worked).toContain('chest');
      expect(exercise.isCompound).toBe(true);
    }
  });

  it('rejects exercise with unknown name not in catalog', () => {
    const { equipment: _e, muscle_groups_worked: _m, isCompound: _c, ...minimalExercise } = makeExercise({
      name: 'Made Up Exercise That Does Not Exist',
    });
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [{ dayNumber: 1, exercises: [minimalExercise] }],
    });
    expect(result.ok).toBe(false);
  });
});
