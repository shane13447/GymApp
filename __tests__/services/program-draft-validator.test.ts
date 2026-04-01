import { validateAndRepairProgramDraft, validateProgramDraftResponse } from '@/services/coach/program-draft-validator';

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
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
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
    });
    expect(result.ok).toBe(false);
  });

  // =========================================================================
  // Coercion edge cases
  // =========================================================================
  it('coerces numeric string dayNumber to integer', () => {
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [
        {
          dayNumber: '2',
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
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workoutDays[0].dayNumber).toBe(2);
    }
  });

  it('coerces number weight to string', () => {
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
              name: 'Barbell Bench Press',
              equipment: 'Barbell',
              muscle_groups_worked: ['chest'],
              isCompound: true,
              weight: 80,
              reps: 10,
              sets: 3,
              restTime: 180,
              progression: 2.5,
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workoutDays[0].exercises[0].weight).toBe('80');
      expect(typeof result.value.workoutDays[0].exercises[0].weight).toBe('string');
    }
  });

  it('uses fallback for missing weight', () => {
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
              name: 'Barbell Bench Press',
              equipment: 'Barbell',
              muscle_groups_worked: ['chest'],
              isCompound: true,
              reps: '10',
              sets: '3',
              restTime: '180',
              progression: '2.5',
              hasCustomisedSets: false,
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workoutDays[0].exercises[0].weight).toBe('0');
    }
  });

  it('uses fallback for missing id and name', () => {
    const result = validateAndRepairProgramDraft({
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
    });
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
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
              name: 'Barbell Bench Press',
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
    const result = validateAndRepairProgramDraft({
      id: 'test',
      name: 'Test',
      workoutDays: [
        {
          dayNumber: 1,
          exercises: [
            {
              name: 'Made Up Exercise That Does Not Exist',
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
    });
    expect(result.ok).toBe(false);
  });
});
