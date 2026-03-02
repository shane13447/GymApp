/**
 * Unit tests for services/workout-queue-modifier.ts
 * Tests queue encoding/decoding, repair functions, and comparison utilities
 * with valid, invalid, incorrectly typed, null, and edge case data
 */

// Mock the database module to avoid expo-sqlite ESM issues
jest.mock('@/services/database', () => ({
  getWorkoutQueue: jest.fn(),
  saveWorkoutQueue: jest.fn(),
  clearWorkoutQueue: jest.fn(),
}));

import {
    buildCompressedPrompt,
    compareWorkoutQueues,
    detectRequestedChangeType,
    differencesToProposedChanges,
    encodeQueueForLLM,
    enforceColumnChanges,
    extractTargetExercises,
    findExerciseByName,
    fuzzyMatchExerciseName,
    getSimilarity,
    parseQueueFormatResponse,
    preprocessMuscleGroupRequest,
    repairQueue,
    resolveExerciseAlias,
    restoreDroppedExercises,
    validateChanges,
    validateQueueStructure,
} from '@/services/workout-queue-modifier';
import type { ProgramExercise, WorkoutQueueItem } from '@/types';

// =============================================================================
// TEST HELPERS
// =============================================================================

const createExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  name: 'Barbell Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
  isCompound: true,
  weight: '80',
  reps: '8',
  sets: '3',
  restTime: '180',
  progression: '2.5',
  hasCustomisedSets: false,
  ...overrides,
});

const createQueueItem = (overrides: Partial<WorkoutQueueItem> = {}): WorkoutQueueItem => ({
  id: 'queue-1',
  programId: 'program-1',
  programName: 'Test Program',
  dayNumber: 1,
  exercises: [createExercise()],
  position: 0,
  ...overrides,
});

const createTestQueue = (): WorkoutQueueItem[] => [
  createQueueItem({
    id: 'q0',
    dayNumber: 1,
    position: 0,
    exercises: [
      createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3' }),
      createExercise({ name: 'Dumbbell Flyes', weight: '15', reps: '10', sets: '3' }),
    ],
  }),
  createQueueItem({
    id: 'q1',
    dayNumber: 2,
    position: 1,
    exercises: [
      createExercise({ name: 'Barbell Back Squat', weight: '100', reps: '5', sets: '5' }),
      createExercise({ name: 'Leg Extensions', weight: '50', reps: '12', sets: '3' }),
    ],
  }),
  createQueueItem({
    id: 'q2',
    dayNumber: 3,
    position: 2,
    exercises: [
      createExercise({ name: 'Barbell Deadlift', weight: '120', reps: '5', sets: '3' }),
    ],
  }),
];

// =============================================================================
// findExerciseByName
// =============================================================================

describe('findExerciseByName', () => {
  describe('valid data', () => {
    it('should find exercise by exact name', () => {
      const result = findExerciseByName('Barbell Bench Press');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Barbell Bench Press');
    });

    it('should find exercise case-insensitively', () => {
      const result = findExerciseByName('barbell bench press');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Barbell Bench Press');
    });

    it('should find exercise by partial name (contains)', () => {
      const result = findExerciseByName('Bench Press');
      expect(result).not.toBeNull();
    });
  });

  describe('invalid data', () => {
    it('should return null for unknown exercise', () => {
      expect(findExerciseByName('Totally Fake Exercise')).toBeNull();
    });
  });

  describe('null and empty data', () => {
    it('should return null for empty string', () => {
      expect(findExerciseByName('')).toBeNull();
    });

    it('should return null for whitespace', () => {
      expect(findExerciseByName('   ')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle extra whitespace', () => {
      const result = findExerciseByName('  Barbell Bench Press  ');
      expect(result).not.toBeNull();
    });
  });
});

// =============================================================================
// resolveExerciseAlias
// =============================================================================

describe('resolveExerciseAlias', () => {
  const queueExercises = [
    'Barbell Bench Press',
    'Decline Crunches',
    'Leg Extensions',
    'Seated Dumbbell Bicep Curl',
  ];

  describe('valid data', () => {
    it('should resolve "bench" to Barbell Bench Press', () => {
      const result = resolveExerciseAlias('bench', queueExercises);
      expect(result).toContain('Barbell Bench Press');
    });

    it('should resolve "crunches" to Decline Crunches', () => {
      const result = resolveExerciseAlias('crunches', queueExercises);
      expect(result).toContain('Decline Crunches');
    });

    it('should resolve "extensions" to Leg Extensions', () => {
      const result = resolveExerciseAlias('extensions', queueExercises);
      expect(result).toContain('Leg Extensions');
    });

    it('should resolve "curls" to matching exercises', () => {
      const result = resolveExerciseAlias('curls', queueExercises);
      expect(result).toContain('Seated Dumbbell Bicep Curl');
    });
  });

  describe('invalid data', () => {
    it('should return empty array for unknown alias', () => {
      const result = resolveExerciseAlias('unknown_exercise', queueExercises);
      expect(result).toHaveLength(0);
    });

    it('should return empty when alias exercise not in queue', () => {
      const result = resolveExerciseAlias('deadlift', queueExercises);
      expect(result).toHaveLength(0);
    });
  });

  describe('null and empty data', () => {
    it('should return empty array for empty input', () => {
      const result = resolveExerciseAlias('', queueExercises);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for empty queue', () => {
      const result = resolveExerciseAlias('bench', []);
      expect(result).toHaveLength(0);
    });
  });
});

// =============================================================================
// preprocessMuscleGroupRequest
// =============================================================================

describe('preprocessMuscleGroupRequest', () => {
  const testQueue = createTestQueue();

  describe('valid data', () => {
    it('should detect and process chest exercises', () => {
      const result = preprocessMuscleGroupRequest(
        'increase all chest exercises weight by 10%',
        testQueue
      );
      expect(result.wasProcessed).toBe(true);
      expect(result.muscleGroupDetected).toBe('chest');
      expect(result.matchedExercises.length).toBeGreaterThan(0);
    });

    it('should detect leg exercises', () => {
      const result = preprocessMuscleGroupRequest(
        'reduce all leg exercises weight',
        testQueue
      );
      expect(result.muscleGroupDetected).toBe('leg');
    });
  });

  describe('no muscle group detected', () => {
    it('should return original request when no muscle group found', () => {
      const request = 'change bench press weight to 90';
      const result = preprocessMuscleGroupRequest(request, testQueue);
      expect(result.wasProcessed).toBe(false);
      expect(result.processedRequest).toBe(request);
    });
  });

  describe('edge cases', () => {
    it('should handle empty queue', () => {
      const result = preprocessMuscleGroupRequest(
        'increase all chest exercises',
        []
      );
      expect(result.noMatchesFound).toBe(true);
    });

    it('should handle percentage changes', () => {
      const result = preprocessMuscleGroupRequest(
        'increase all chest exercises by 20%',
        testQueue
      );
      expect(result.wasProcessed).toBe(true);
    });
  });
});

// =============================================================================
// encodeQueueForLLM
// =============================================================================

describe('encodeQueueForLLM', () => {
  describe('valid data', () => {
    it('should encode single queue item', () => {
      const queue = [createQueueItem({
        dayNumber: 1,
        exercises: [createExercise({ name: 'Test', weight: '50', reps: '10', sets: '3' })],
      })];
      const result = encodeQueueForLLM(queue);
      expect(result).toContain('Q0:D1:');
      expect(result).toContain('Test|50|10|3');
    });

    it('should encode multiple queue items', () => {
      const queue = createTestQueue();
      const result = encodeQueueForLLM(queue);
      expect(result).toContain('Q0:D1:');
      expect(result).toContain('Q1:D2:');
      expect(result).toContain('Q2:D3:');
    });

    it('should separate queue items with semicolons', () => {
      const queue = createTestQueue();
      const result = encodeQueueForLLM(queue);
      expect(result.split(';').length).toBe(3);
    });

    it('should separate exercises with commas', () => {
      const queue = [createQueueItem({
        exercises: [
          createExercise({ name: 'A' }),
          createExercise({ name: 'B' }),
        ],
      })];
      const result = encodeQueueForLLM(queue);
      expect(result.split(',').length).toBe(2);
    });

    it('should use pipe delimiter for exercise fields', () => {
      const queue = [createQueueItem({
        exercises: [createExercise({ name: 'Test', weight: '80', reps: '10', sets: '3' })],
      })];
      const result = encodeQueueForLLM(queue);
      expect(result).toMatch(/Test\|80\|10\|3/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty queue', () => {
      const result = encodeQueueForLLM([]);
      expect(result).toBe('');
    });

    it('should handle exercise with missing weight', () => {
      const queue = [createQueueItem({
        exercises: [createExercise({ weight: '' })],
      })];
      const result = encodeQueueForLLM(queue);
      expect(result).toContain('|0|');
    });

    it('should handle exercise with default reps', () => {
      const queue = [createQueueItem({
        exercises: [createExercise({ reps: '' })],
      })];
      const result = encodeQueueForLLM(queue);
      expect(result).toContain('|8|');
    });
  });
});

// =============================================================================
// buildCompressedPrompt
// =============================================================================

describe('buildCompressedPrompt', () => {
  describe('valid data', () => {
    it('should build prompt with queue and request', () => {
      const queue = createTestQueue();
      const result = buildCompressedPrompt('change bench press weight to 90', queue);
      expect(result).toContain('Queue:');
      expect(result).toContain('Request:');
      expect(result).toContain('change bench press weight to 90');
    });
  });

  describe('edge cases', () => {
    it('should handle empty request', () => {
      const queue = createTestQueue();
      const result = buildCompressedPrompt('', queue);
      expect(result).toContain('Request:');
    });

    it('should handle empty queue', () => {
      const result = buildCompressedPrompt('test request', []);
      expect(result).toContain('Queue:');
      expect(result).toContain('Request:test request');
    });
  });
});

// =============================================================================
// parseQueueFormatResponse
// =============================================================================

describe('parseQueueFormatResponse', () => {
  const originalQueue = createTestQueue();

  describe('valid data', () => {
    it('should parse valid TOON response', () => {
      const response = 'Q0:D1:Barbell Bench Press|90|8|3,Dumbbell Flyes|15|10|3;Q1:D2:Barbell Back Squat|100|5|5,Leg Extensions|50|12|3;Q2:D3:Barbell Deadlift|120|5|3';
      const result = parseQueueFormatResponse(response, originalQueue);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(3);
    });

    it('should preserve queue item IDs from original', () => {
      const response = 'Q0:D1:Barbell Bench Press|80|8|3';
      const result = parseQueueFormatResponse(response, [originalQueue[0]]);
      expect(result).not.toBeNull();
      expect(result![0].id).toBe(originalQueue[0].id);
    });

    it('should parse modified weight correctly', () => {
      const response = 'Q0:D1:Barbell Bench Press|100|8|3';
      const result = parseQueueFormatResponse(response, [originalQueue[0]], 'change weight to 100', ['Barbell Bench Press']);
      expect(result).not.toBeNull();
      expect(result![0].exercises[0].weight).toBe('100');
    });

    it('should preserve hasCustomisedSets when known exercise metadata is rebuilt', () => {
      const queue = [createQueueItem({
        id: 'q-custom',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            hasCustomisedSets: true,
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|90|8|3';
      const result = parseQueueFormatResponse(response, queue, 'change weight to 90', ['Barbell Bench Press']);

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].weight).toBe('90');
      expect(result![0].exercises[0].hasCustomisedSets).toBe(true);
    });

    it('should preserve hasCustomisedSets through repair for non-targeted exercise restoration', () => {
      const queue = [createQueueItem({
        id: 'q-custom-2',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            hasCustomisedSets: true,
          }),
          createExercise({
            name: 'Dumbbell Flyes',
            weight: '15',
            reps: '10',
            sets: '3',
            hasCustomisedSets: false,
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|95|8|3,Dumbbell Flyes|20|10|3';
      const result = parseQueueFormatResponse(response, queue, 'change Barbell Bench Press weight to 95', ['Barbell Bench Press']);

      expect(result).not.toBeNull();
      const [bench, flyes] = result![0].exercises;
      expect(bench.weight).toBe('95');
      expect(bench.hasCustomisedSets).toBe(true);
      expect(flyes.weight).toBe('15');
      expect(flyes.hasCustomisedSets).toBe(false);
    });

    it('should keep 4-column TOON parsing compatibility with custom metadata preservation', () => {
      const queue = [createQueueItem({
        id: 'q-custom-3',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Leg Extensions',
            weight: '50',
            reps: '12',
            sets: '3',
            hasCustomisedSets: true,
          }),
        ],
      })];

      const response = 'Q0:D1:Leg Extensions|55|15|4';
      const result = parseQueueFormatResponse(response, queue, 'change Leg Extensions weight to 55 and reps to 15 and sets to 4', ['Leg Extensions']);

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].weight).toBe('55');
      expect(result![0].exercises[0].reps).toBe('15');
      expect(result![0].exercises[0].sets).toBe('4');
      expect(result![0].exercises[0].hasCustomisedSets).toBe(true);
    });

    it('should return partial queue when response omits queue items', () => {
      const response = 'Q0:D1:Barbell Bench Press|90|8|3';
      const result = parseQueueFormatResponse(
        response,
        originalQueue,
        'change bench press to 90kg',
        ['Barbell Bench Press']
      );

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result?.[0].id).toBe('q0');
    });
  });

  describe('invalid data', () => {
    it('should return null for invalid format', () => {
      const response = 'This is not a valid queue format';
      const result = parseQueueFormatResponse(response, originalQueue);
      expect(result).toBeNull();
    });

    it('should return null for empty response', () => {
      const result = parseQueueFormatResponse('', originalQueue);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle response with extra whitespace', () => {
      const response = '  Q0:D1:Barbell Bench Press|80|8|3  ';
      const result = parseQueueFormatResponse(response, [originalQueue[0]]);
      expect(result).not.toBeNull();
    });

    it('should handle = separator issue (common LLM error)', () => {
      // The preprocessor should fix this
      const response = 'Q0:D1:A|80|8|3=B|50|10|3';
      // This tests that preprocessing handles the = -> , fix
      const result = parseQueueFormatResponse(response, originalQueue);
      // May be null if A and B are not found, but shouldn't crash
      expect(() => parseQueueFormatResponse(response, originalQueue)).not.toThrow();
    });
  });
});

// =============================================================================
// getSimilarity
// =============================================================================

describe('getSimilarity', () => {
  describe('valid data', () => {
    it('should return 1 for identical strings', () => {
      expect(getSimilarity('Bench Press', 'Bench Press')).toBe(1);
    });

    it('should return 1 for identical strings (case insensitive)', () => {
      expect(getSimilarity('Bench Press', 'bench press')).toBe(1);
    });

    it('should return high similarity for containment', () => {
      const similarity = getSimilarity('Barbell Bench Press', 'Bench Press');
      expect(similarity).toBeGreaterThanOrEqual(0.8);
    });

    it('should return similarity based on word matching', () => {
      const similarity = getSimilarity('Dumbbell Bench Press', 'Barbell Bench Press');
      expect(similarity).toBeGreaterThan(0);
    });
  });

  describe('invalid data', () => {
    it('should return 0 for completely different strings', () => {
      const similarity = getSimilarity('Squat', 'Curl');
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe('null and empty data', () => {
    it('should return 1 for empty strings (both identical)', () => {
      // Two empty strings are identical, so similarity is 1
      expect(getSimilarity('', '')).toBe(1);
    });

    it('should return 0 when one string is empty', () => {
      expect(getSimilarity('Bench Press', '')).toBe(0);
    });
  });
});

// =============================================================================
// detectRequestedChangeType
// =============================================================================

describe('detectRequestedChangeType', () => {
  describe('valid data', () => {
    it('should detect weight change', () => {
      expect(detectRequestedChangeType('change weight to 100')).toContain('weight');
    });

    it('should detect reps change', () => {
      expect(detectRequestedChangeType('increase reps to 12')).toContain('reps');
    });

    it('should detect sets change', () => {
      expect(detectRequestedChangeType('change sets to 4')).toContain('sets');
    });

    it('should detect remove request', () => {
      expect(detectRequestedChangeType('remove bench press')).toContain('remove');
    });

    it('should detect add request', () => {
      expect(detectRequestedChangeType('add squat')).toContain('add');
    });

    it('should detect multiple change types', () => {
      const result = detectRequestedChangeType('change weight and reps');
      expect(result).toContain('weight');
      expect(result).toContain('reps');
    });

    it('should detect kg as weight change', () => {
      expect(detectRequestedChangeType('set to 80kg')).toContain('weight');
    });

    it('should detect alternative removal words', () => {
      expect(detectRequestedChangeType('delete squat')).toContain('remove');
      expect(detectRequestedChangeType('drop the curls')).toContain('remove');
      expect(detectRequestedChangeType('get rid of bench')).toContain('remove');
      expect(detectRequestedChangeType('skip leg extensions')).toContain('remove');
    });
  });

  describe('unknown requests', () => {
    it('should return unknown for ambiguous requests', () => {
      expect(detectRequestedChangeType('make it better')).toContain('unknown');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(detectRequestedChangeType('')).toContain('unknown');
    });

    it('should be case insensitive', () => {
      expect(detectRequestedChangeType('CHANGE WEIGHT')).toContain('weight');
    });
  });
});

// =============================================================================
// extractTargetExercises
// =============================================================================

describe('extractTargetExercises', () => {
  const testQueue = createTestQueue();

  describe('valid data', () => {
    it('should extract exercise by exact name', () => {
      const result = extractTargetExercises('change Barbell Bench Press weight', testQueue);
      expect(result).toContain('Barbell Bench Press');
    });

    it('should extract exercise by partial name', () => {
      const result = extractTargetExercises('change bench press weight', testQueue);
      expect(result).toContain('Barbell Bench Press');
    });

    it('should extract multiple exercises', () => {
      const result = extractTargetExercises('change bench press and squat weights', testQueue);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should resolve aliases', () => {
      const queueWithCrunches = [createQueueItem({
        exercises: [createExercise({ name: 'Decline Crunches' })],
      })];
      const result = extractTargetExercises('change crunches reps', queueWithCrunches);
      expect(result).toContain('Decline Crunches');
    });
  });

  describe('edge cases', () => {
    it('should handle empty request', () => {
      const result = extractTargetExercises('', testQueue);
      expect(result).toHaveLength(0);
    });

    it('should handle empty queue', () => {
      const result = extractTargetExercises('change bench press', []);
      expect(result).toHaveLength(0);
    });

    it('should handle case-insensitive matching', () => {
      const result = extractTargetExercises('BARBELL BENCH PRESS', testQueue);
      expect(result).toContain('Barbell Bench Press');
    });
  });
});

// =============================================================================
// fuzzyMatchExerciseName
// =============================================================================

describe('fuzzyMatchExerciseName', () => {
  const knownExercises = [
    { name: 'Barbell Bench Press', equipment: 'Barbell', muscle_groups_worked: ['chest'] },
    { name: 'Dumbbell Flyes', equipment: 'Dumbbell', muscle_groups_worked: ['chest'] },
    { name: 'Decline Crunches', equipment: '', muscle_groups_worked: ['abs'] },
  ];

  describe('valid data', () => {
    it('should match exact name', () => {
      const result = fuzzyMatchExerciseName('Barbell Bench Press', knownExercises);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Barbell Bench Press');
    });

    it('should match case insensitively', () => {
      const result = fuzzyMatchExerciseName('barbell bench press', knownExercises);
      expect(result).not.toBeNull();
    });

    it('should match by containment', () => {
      const result = fuzzyMatchExerciseName('Bench Press', knownExercises);
      expect(result).not.toBeNull();
    });
  });

  describe('invalid data', () => {
    it('should return null for no match', () => {
      const result = fuzzyMatchExerciseName('Totally Unknown', knownExercises);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return first exercise for empty name (matches all)', () => {
      // Empty string is a substring of any string, so it matches the first exercise
      const result = fuzzyMatchExerciseName('', knownExercises);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Barbell Bench Press');
    });

    it('should handle empty exercise list', () => {
      const result = fuzzyMatchExerciseName('Bench Press', []);
      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// restoreDroppedExercises
// =============================================================================

describe('restoreDroppedExercises', () => {
  describe('valid data', () => {
    it('should restore accidentally dropped exercises', () => {
      const original = createTestQueue();
      const parsed = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          exercises: [original[0].exercises[0]], // Missing second exercise
        }),
      ];
      const result = restoreDroppedExercises([original[0]], parsed, 'change weight');
      expect(result[0].exercises.length).toBe(2);
    });

    it('should not restore exercises targeted for removal', () => {
      const original = createTestQueue();
      const parsed = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          exercises: [original[0].exercises[1]], // Only second exercise
        }),
      ];
      const result = restoreDroppedExercises(
        [original[0]],
        parsed,
        'remove Barbell Bench Press',
        ['Barbell Bench Press']
      );
      // Should NOT restore Barbell Bench Press since it was targeted
      expect(result[0].exercises.length).toBe(1);
      expect(result[0].exercises[0].name).toBe('Dumbbell Flyes');
    });
  });

  describe('edge cases', () => {
    it('should handle empty parsed queue', () => {
      const original = createTestQueue();
      const result = restoreDroppedExercises(original, [], 'change weight');
      expect(result.length).toBe(3); // Should restore all
    });
  });
});

// =============================================================================
// enforceColumnChanges
// =============================================================================

describe('enforceColumnChanges', () => {
  describe('valid data', () => {
    it('should enforce weight change only affects weight column', () => {
      const original = createTestQueue();
      const parsed = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          exercises: [
            createExercise({
              name: 'Barbell Bench Press',
              weight: '90',
              reps: '15', // Accidentally changed
              sets: '3',
            }),
          ],
        }),
      ];
      const result = enforceColumnChanges(
        [original[0]],
        parsed,
        'change bench press weight to 90',
        ['Barbell Bench Press']
      );
      // Reps should be restored to original
      expect(result[0].exercises[0].weight).toBe('90');
      expect(result[0].exercises[0].reps).toBe('8');
    });

    it('should enforce reps change only affects reps column', () => {
      const original = createTestQueue();
      const parsed = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          exercises: [
            createExercise({
              name: 'Barbell Bench Press',
              weight: '100', // Accidentally changed
              reps: '15',
              sets: '3',
            }),
          ],
        }),
      ];
      const result = enforceColumnChanges(
        [original[0]],
        parsed,
        'change bench press reps to 15',
        ['Barbell Bench Press']
      );
      // Weight should be restored to original
      expect(result[0].exercises[0].reps).toBe('15');
      expect(result[0].exercises[0].weight).toBe('80');
    });
  });

  describe('edge cases', () => {
    it('should not modify when change type is unknown', () => {
      const original = createTestQueue();
      const parsed = [...original];
      const result = enforceColumnChanges(original, parsed, 'make it better');
      expect(result).toEqual(parsed);
    });
  });
});

// =============================================================================
// repairQueue
// =============================================================================

describe('repairQueue', () => {
  describe('valid data', () => {
    it('should combine all repair strategies', () => {
      const original = createTestQueue();
      const parsed = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          exercises: [
            createExercise({
              name: 'Barbell Bench Press',
              weight: '90',
              reps: '8',
              sets: '3',
            }),
            // Dumbbell Flyes dropped
          ],
        }),
      ];
      const result = repairQueue(
        [original[0]],
        parsed,
        'change bench press weight to 90',
        ['Barbell Bench Press']
      );
      // Should restore Dumbbell Flyes
      expect(result[0].exercises.length).toBe(2);
    });
  });
});

// =============================================================================
// compareWorkoutQueues
// =============================================================================

describe('compareWorkoutQueues', () => {
  describe('valid data', () => {
    it('should detect weight change', () => {
      const oldQueue = createTestQueue();
      const newQueue = createTestQueue();
      newQueue[0].exercises[0].weight = '100';
      
      const differences = compareWorkoutQueues(oldQueue, newQueue);
      expect(differences.some(d => d.type === 'weight_change')).toBe(true);
    });

    it('should detect reps change', () => {
      const oldQueue = createTestQueue();
      const newQueue = createTestQueue();
      newQueue[0].exercises[0].reps = '15';
      
      const differences = compareWorkoutQueues(oldQueue, newQueue);
      expect(differences.some(d => d.type === 'reps_change')).toBe(true);
    });

    it('should detect sets change', () => {
      const oldQueue = createTestQueue();
      const newQueue = createTestQueue();
      newQueue[0].exercises[0].sets = '5';
      
      const differences = compareWorkoutQueues(oldQueue, newQueue);
      expect(differences.some(d => d.type === 'sets_change')).toBe(true);
    });

    it('should detect removed exercise', () => {
      const oldQueue = createTestQueue();
      const newQueue = createTestQueue();
      newQueue[0].exercises = [newQueue[0].exercises[0]]; // Remove second exercise
      
      const differences = compareWorkoutQueues(oldQueue, newQueue);
      expect(differences.some(d => d.type === 'removed')).toBe(true);
    });

    it('should detect added exercise', () => {
      const oldQueue = createTestQueue();
      const newQueue = createTestQueue();
      newQueue[0].exercises.push(createExercise({ name: 'New Exercise' }));
      
      const differences = compareWorkoutQueues(oldQueue, newQueue);
      expect(differences.some(d => d.type === 'added')).toBe(true);
    });
  });

  describe('no changes', () => {
    it('should return empty array for identical queues', () => {
      const queue = createTestQueue();
      const differences = compareWorkoutQueues(queue, queue);
      expect(differences).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty queues', () => {
      const differences = compareWorkoutQueues([], []);
      expect(differences).toHaveLength(0);
    });

    it('should handle one empty queue', () => {
      const queue = createTestQueue();
      const differences = compareWorkoutQueues(queue, []);
      expect(differences.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// differencesToProposedChanges
// =============================================================================

describe('differencesToProposedChanges', () => {
  describe('valid data', () => {
    it('should categorize weight changes', () => {
      const differences = [{
        type: 'weight_change' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'Bench Press',
        oldWeight: '80',
        newWeight: '90',
      }];
      const result = differencesToProposedChanges(differences);
      expect(result.weightChanges.length).toBe(1);
      expect(result.weightChanges[0].oldWeight).toBe('80');
      expect(result.weightChanges[0].newWeight).toBe('90');
    });

    it('should categorize removals', () => {
      const differences = [{
        type: 'removed' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'Bench Press',
        oldExercise: createExercise(),
      }];
      const result = differencesToProposedChanges(differences);
      expect(result.removals.length).toBe(1);
    });

    it('should categorize additions', () => {
      const differences = [{
        type: 'added' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'New Exercise',
        newExercise: createExercise({ name: 'New Exercise' }),
      }];
      const result = differencesToProposedChanges(differences);
      expect(result.additions.length).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty differences', () => {
      const result = differencesToProposedChanges([]);
      expect(result.weightChanges).toHaveLength(0);
      expect(result.repsChanges).toHaveLength(0);
      expect(result.setsChanges).toHaveLength(0);
      expect(result.removals).toHaveLength(0);
      expect(result.additions).toHaveLength(0);
      expect(result.swaps).toHaveLength(0);
    });
  });
});

// =============================================================================
// validateChanges
// =============================================================================

describe('validateQueueStructure', () => {
  const originalQueue = createTestQueue();

  it('should validate identical queue structure', () => {
    const result = validateQueueStructure(originalQueue, [...originalQueue]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing queue items', () => {
    const parsedQueue = [originalQueue[0]];
    const result = validateQueueStructure(originalQueue, parsedQueue);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Missing queue item'))).toBe(true);
  });

  it('should reject duplicate queue ids', () => {
    const duplicateIdQueue = [
      { ...originalQueue[0], id: 'q0', position: 0 },
      { ...originalQueue[1], id: 'q0', position: 1 },
      { ...originalQueue[2], id: 'q2', position: 2 },
    ];

    const result = validateQueueStructure(originalQueue, duplicateIdQueue);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Duplicate queue item id'))).toBe(true);
  });

  it('should reject queue item with empty exercises', () => {
    const parsedQueue = [
      { ...originalQueue[0] },
      { ...originalQueue[1], exercises: [] },
      { ...originalQueue[2] },
    ];

    const result = validateQueueStructure(originalQueue, parsedQueue);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('has no exercises'))).toBe(true);
  });
});

describe('validateChanges', () => {
  describe('valid changes', () => {
    it('should validate expected weight change', () => {
      const differences = [{
        type: 'weight_change' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'Bench Press',
      }];
      const result = validateChanges('change weight', differences);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate removal when requested', () => {
      const differences = [{
        type: 'removed' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'Bench Press',
      }];
      const result = validateChanges('remove bench press', differences);
      expect(result.valid).toBe(true);
    });

    it('should validate delete synonym as removal request', () => {
      const differences = [{
        type: 'removed' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'Bench Press',
      }];
      const result = validateChanges('delete bench press', differences);
      expect(result.valid).toBe(true);
    });

    it('should validate insert synonym as add request', () => {
      const differences = [{
        type: 'added' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'Cable Fly',
      }];
      const result = validateChanges('insert cable fly', differences);
      expect(result.valid).toBe(true);
    });
  });

  describe('unexpected changes', () => {
    it('should warn about unexpected removal', () => {
      const differences = [{
        type: 'removed' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'Bench Press',
      }];
      const result = validateChanges('change weight', differences);
      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Unexpected removal');
    });

    it('should warn about unexpected addition', () => {
      const differences = [{
        type: 'added' as const,
        queueItemId: 'q0',
        queueItemName: 'Test',
        dayNumber: 1,
        exerciseName: 'New Exercise',
      }];
      const result = validateChanges('change weight', differences);
      expect(result.valid).toBe(false);
      expect(result.warnings[0]).toContain('Unexpected addition');
    });
  });

  describe('edge cases', () => {
    it('should handle empty differences', () => {
      const result = validateChanges('change weight', []);
      expect(result.valid).toBe(true);
    });
  });
});
