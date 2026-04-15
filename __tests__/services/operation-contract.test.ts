import {
  parseAndValidateOperations,
  validateOperationResponse,
  isToonFormat,
  generateOperationId,
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

  it('unwraps proxy response objects when parsing operation responses', () => {
    const result = parseAndValidateOperations(
      JSON.stringify({
        response: {
          version: 1,
          operations: [
            {
              id: 'op_1',
              type: 'modify_weight',
              target: { exerciseInstanceId: 'ex-1' },
              value: { weight: 90 },
            },
          ],
        },
      })
    );

    expect(result.isValid).toBe(true);
    expect(result.validatedOperations).toHaveLength(1);
  });

  it('extracts embedded operation JSON from noisy model output', () => {
    const result = parseAndValidateOperations(
      [
        'Here is the operation payload:',
        JSON.stringify({
          version: 1,
          operations: [
            {
              id: 'op_1',
              type: 'modify_reps',
              target: { exerciseInstanceId: 'ex-1' },
              value: { reps: 12 },
            },
          ],
        }),
      ].join('\n')
    );

    expect(result.isValid).toBe(true);
    expect(result.validatedOperations).toHaveLength(1);
  });

  // =========================================================================
  // Null/Empty inputs
  // =========================================================================
  describe('Null/Empty inputs', () => {
    it('rejects empty string', () => {
      const result = validateOperationResponse('');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('not valid JSON');
    });

    it('rejects null-like string', () => {
      const result = validateOperationResponse('null');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('must be a JSON object');
    });

    it('rejects empty operations array', () => {
      const result = validateOperationResponse(
        JSON.stringify({ version: 1, operations: [] })
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('empty'))).toBe(true);
    });

    it('rejects payload with missing operations array', () => {
      const result = validateOperationResponse(
        JSON.stringify({ version: 1 })
      );
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('operations array');
    });
  });

  // =========================================================================
  // Invalid operations (individual field validation)
  // =========================================================================
  describe('Invalid operations (field validation)', () => {
    it('rejects operation with missing id', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { type: 'modify_weight', target: { dayNumber: 1 }, value: { weight: 80 } },
          ],
        })
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('id'))).toBe(true);
    });

    it('rejects operation with missing target', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { id: 'op_1', type: 'modify_weight', value: { weight: 80 } },
          ],
        })
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('target'))).toBe(true);
    });

    it('rejects operation with empty target object', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { id: 'op_1', type: 'modify_weight', target: {}, value: { weight: 80 } },
          ],
        })
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('target'))).toBe(true);
    });

    it('rejects modify_weight without value', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { id: 'op_1', type: 'modify_weight', target: { dayNumber: 1 } },
          ],
        })
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('value'))).toBe(true);
    });

    it('rejects modify_reps without value', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { id: 'op_1', type: 'modify_reps', target: { dayNumber: 1 } },
          ],
        })
      );
      expect(result.isValid).toBe(false);
    });

    it('rejects partially valid operations array (filters invalid)', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { id: 'op_1', type: 'modify_weight', target: { dayNumber: 1 }, value: { weight: 80 } },
            { id: 'op_2', type: 'invalid_type', target: { dayNumber: 1 } },
          ],
        })
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('invalid_type'))).toBe(true);
    });

    it('rejects modify_rest because rest edits are not in the workout queue contract', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            {
              id: 'op_1',
              type: 'modify_rest',
              target: { dayNumber: 1, exerciseName: 'Bench Press' },
              value: { restTime: 120 },
            },
          ],
        })
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('modify_rest'))).toBe(true);
    });
  });

  // =========================================================================
  // Valid payloads
  // =========================================================================
  describe('Valid payloads', () => {
    const VALUE_SHAPES: Record<string, Record<string, unknown>> = {
      modify_weight: { weight: 80 },
      modify_reps: { reps: 10 },
      modify_sets: { sets: 4 },
      swap_variant: { variant: 'Incline' },
      add_exercise: { exerciseName: 'Cable Curl' },
      remove_exercise: {},
    };

    it('accepts each valid operation type with correct value shape', () => {
      for (const [type, value] of Object.entries(VALUE_SHAPES)) {
        const op: Record<string, unknown> = {
          id: `op_${type}`,
          type,
          target: { dayNumber: 1, exerciseName: 'Test' },
        };
        if (Object.keys(value).length > 0) {
          op.value = value;
        }
        const result = validateOperationResponse(
          JSON.stringify({ version: 1, operations: [op] })
        );
        expect(result.isValid).toBe(true);
      }
    });

    it('accepts operation with exerciseInstanceId target', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { id: 'op_1', type: 'modify_weight', target: { exerciseInstanceId: 'ex-42' }, value: { weight: 80 } },
          ],
        })
      );
      expect(result.isValid).toBe(true);
    });

    it('accepts operation with queueItemId target', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            {
              id: 'op_1',
              type: 'modify_weight',
              target: { queueItemId: 'q-1', exerciseName: 'Bench Press' },
              value: { weight: 80 },
            },
          ],
        })
      );
      expect(result.isValid).toBe(true);
    });

    it('accepts multiple valid operations', () => {
      const result = validateOperationResponse(
        JSON.stringify({
          version: 1,
          operations: [
            { id: 'op_1', type: 'modify_weight', target: { dayNumber: 1, exerciseName: 'Bench' }, value: { weight: 85 } },
            { id: 'op_2', type: 'modify_reps', target: { dayNumber: 1, exerciseName: 'Bench' }, value: { reps: 10 } },
          ],
        })
      );
      expect(result.isValid).toBe(true);
      expect(result.validatedOperations).toHaveLength(2);
    });
  });

  // =========================================================================
  // isToonFormat
  // =========================================================================
  describe('isToonFormat', () => {
    it('detects TOON format', () => {
      expect(isToonFormat('Q0:D1:Bench Press|80|8|3')).toBe(true);
    });

    it('does not flag JSON as TOON', () => {
      expect(isToonFormat('{"version":1,"operations":[]}')).toBe(false);
    });

    it('does not flag empty string as TOON', () => {
      expect(isToonFormat('')).toBe(false);
    });
  });

  // =========================================================================
  // generateOperationId
  // =========================================================================
  describe('generateOperationId', () => {
    it('generates unique IDs', () => {
      const id1 = generateOperationId();
      const id2 = generateOperationId();
      expect(id1).not.toBe(id2);
    });

    it('starts with op_ prefix', () => {
      const id = generateOperationId();
      expect(id.startsWith('op_')).toBe(true);
    });
  });
});
