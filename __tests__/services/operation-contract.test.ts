import {
  parseAndValidateOperations,
  validateOperationResponse,
} from '@/services/coach/operation-contract';

describe('operation contract', () => {
  it('rejects non-json and toon-formatted payloads', () => {
    expect(validateOperationResponse('Q0:D1:Bench Press|80|8|3').isValid).toBe(false);
    expect(validateOperationResponse('not-json').isValid).toBe(false);
  });

  it('accepts valid payload and enforces schema', () => {
    const result = validateOperationResponse(
      JSON.stringify({
        version: 1,
        operations: [
          {
            id: 'op_1',
            type: 'modify_weight',
            target: { dayNumber: 1, exerciseName: 'Bench Press' },
            value: { weight: 80 },
          },
        ],
      }),
    );

    expect(result.isValid).toBe(true);
    expect(result.validatedOperations).toHaveLength(1);
  });

  it('rejects payload with invalid operations', () => {
    const result = validateOperationResponse(
      JSON.stringify({
        version: 1,
        operations: [
          {
            id: 'op_1',
            type: 'invalid_type',
            target: { dayNumber: 1 },
          },
        ],
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects payload with wrong version', () => {
    const result = validateOperationResponse(
      JSON.stringify({
        version: 2,
        operations: [],
      }),
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('rejects TOON format via parseAndValidateOperations', () => {
    const result = parseAndValidateOperations('Q0:D1:Bench Press|80|8|3');

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('TOON'))).toBe(true);
  });
});
