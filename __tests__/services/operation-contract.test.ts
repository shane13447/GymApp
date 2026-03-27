import {
  parseOperationPayload,
  parseOperationResponse,
  validateOperationPayload,
} from '@/services/coach/operation-contract';

describe('operation contract', () => {
  it('rejects non-json and toon-formatted payloads', () => {
    expect(parseOperationResponse('Q0:D1:Bench Press|80|8|3')).toBeNull();
    expect(parseOperationResponse('not-json')).toBeNull();
  });

  it('accepts valid payload and enforces schema', () => {
    const parsed = parseOperationResponse(
      JSON.stringify({
        operations: [
          {
            type: 'set_exercise_fields',
            queueIndex: 0,
            dayNumber: 1,
            exerciseName: 'Bench Press',
            fields: { weight: '80', reps: '8', sets: '3' },
          },
        ],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(validateOperationPayload(parsed).isValid).toBe(true);

    const invalid = parseOperationPayload({
      operations: [
        {
          type: 'set_exercise_fields',
          queueIndex: 'bad',
          exerciseName: 'Bench Press',
        },
      ],
    });
    expect(validateOperationPayload(invalid).isValid).toBe(false);
  });
});
