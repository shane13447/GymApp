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
});
