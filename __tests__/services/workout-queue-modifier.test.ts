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
    analyzeTestPromptQueueCoverage,
    buildCompressedPrompt,
    COMPRESSED_SYSTEM_PROMPT,
    compareWorkoutQueues,
    detectRequestedChangeType,
    differencesToProposedChanges,
    encodeQueueForLLM,
    enforceColumnChanges,
    evaluateInjurySemanticOutcome,
    evaluatePromptIntentOutcome,
    evaluateVariantSemanticOutcome,
    extractTargetExerciseRefs,
    extractTargetExercises,
    findExerciseByName,
    fuzzyMatchExerciseName,
    getLastQueueParseFailureReason,
    getSimilarity,
    parseQueueFormatResponse,
    preprocessMuscleGroupRequest,
    repairQueue,
    repairQueueWithIntent,
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

    it('should find newly supported barbell curls exercise', () => {
      const result = findExerciseByName('Barbell Curls');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Barbell Curls');
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

    it('Task 3 regression - should detect bare muscle keyword with global numeric reps phrasing', () => {
      const queue = [
        createQueueItem({
          id: 'q-legs',
          exercises: [
            createExercise({
              name: 'Barbell Back Squat',
              muscle_groups_worked: ['quads', 'glutes', 'hamstrings'],
              exerciseInstanceId: 'q-legs:e0',
            }),
            createExercise({
              name: 'Leg Extensions',
              muscle_groups_worked: ['quads'],
              exerciseInstanceId: 'q-legs:e1',
            }),
            createExercise({
              name: 'Barbell Bench Press',
              muscle_groups_worked: ['chest', 'triceps'],
              exerciseInstanceId: 'q-legs:e2',
            }),
          ],
        }),
      ];

      const result = preprocessMuscleGroupRequest('high volume legs today so set everything to 20 reps', queue);

      expect(result.muscleGroupDetected).toBe('legs');
      expect(result.matchedExerciseRefs.map((item) => item.name)).toEqual(
        expect.arrayContaining(['Barbell Back Squat', 'Leg Extensions'])
      );
      expect(result.matchedExerciseRefs.map((item) => item.name)).not.toContain('Barbell Bench Press');
    });

    it('should treat back as alias for lats and traps', () => {
      const backQueue = [
        createQueueItem({
          id: 'q-back',
          dayNumber: 4,
          position: 3,
          exercises: [
            createExercise({
              name: 'Lat Pulldowns',
              muscle_groups_worked: ['lats', 'biceps'],
              weight: '60',
            }),
            createExercise({
              name: 'Barbell Shrugs',
              muscle_groups_worked: ['traps', 'forearms'],
              weight: '80',
            }),
            createExercise({
              name: 'Barbell Bench Press',
              muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
              weight: '80',
            }),
          ],
        }),
      ];

      const result = preprocessMuscleGroupRequest('reduce all back exercises by 10%', backQueue);

      expect(result.wasProcessed).toBe(true);
      expect(result.muscleGroupDetected).toBe('back');
      expect(result.matchedExercises).toEqual(expect.arrayContaining(['Lat Pulldowns', 'Barbell Shrugs']));
      expect(result.matchedExercises).not.toContain('Barbell Bench Press');
      expect(result.processedRequest).toContain('Lat Pulldowns weight to 54');
      expect(result.processedRequest).toContain('Barbell Shrugs weight to 72');
    });

    it('should preserve repeated muscle group matches with variant labels', () => {
      const duplicateChestQueue = [
        createQueueItem({
          id: 'q-chest',
          exercises: [
            createExercise({
              name: 'Barbell Bench Press',
              muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
              weight: '80',
              variant: { angle: 'Incline' },
            }),
            createExercise({
              name: 'Barbell Bench Press',
              muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
              weight: '70',
              variant: { angle: 'Decline' },
            }),
          ],
        }),
      ];

      const result = preprocessMuscleGroupRequest(
        'increase all chest exercises by 10%',
        duplicateChestQueue
      );

      expect(result.wasProcessed).toBe(true);
      expect(result.matchedExercises).toEqual([
        'Barbell Bench Press (Incline)',
        'Barbell Bench Press (Decline)',
      ]);
      expect(result.processedRequest).toContain('Barbell Bench Press (Incline) weight to 88');
      expect(result.processedRequest).toContain('Barbell Bench Press (Decline) weight to 77');
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

    it('should omit trailing variant delimiter when variant is empty', () => {
      const queue = [createQueueItem({
        exercises: [createExercise({ name: 'Test', weight: '80', reps: '10', sets: '3', variant: null })],
      })];
      const result = encodeQueueForLLM(queue);
      expect(result).toContain('Test|80|10|3');
      expect(result).not.toContain('Test|80|10|3|');
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

describe('COMPRESSED_SYSTEM_PROMPT injury policy', () => {
  it('includes mild/moderate/severe guidance with entire-queue, weight-first, and swap-or-remove defaults', () => {
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/mild/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/moderate/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/severe/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/entire current queue/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/weight-first/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/swap/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/remove/i);
  });
});

describe('COMPRESSED_SYSTEM_PROMPT TOON deterministic sets guidance', () => {
  it('documents deterministic sets derived from canonical reps and weight arrays', () => {
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/sets.*deterministic/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/array length/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/reps\[\]/i);
    expect(COMPRESSED_SYSTEM_PROMPT).toMatch(/weight\[\]/i);
  });

  it('includes varied TOON examples for deterministic sets, injury, and variant updates', () => {
    expect(COMPRESSED_SYSTEM_PROMPT).toContain('REQ: mild shoulder irritation, go easier on pressing');
    expect(COMPRESSED_SYSTEM_PROMPT).toContain('REQ: my lower back is sore, adjust today so it does not flare up');
    expect(COMPRESSED_SYSTEM_PROMPT).toContain('REQ: switch lat pulldowns and triangle rows to neutral grip');
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

    it('should parse 5-column TOON with variant token', () => {
      const queue = [createQueueItem({
        id: 'q-variant',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            variant: { angle: 'Incline' },
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|82.5|8|3|Incline';
      const result = parseQueueFormatResponse(response, queue, 'change incline bench press weight to 82.5', ['Barbell Bench Press']);

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].weight).toBe('82.5');
      expect(result![0].exercises[0].variant).toEqual({ angle: 'Incline' });
    });

    it('should enforce destination reps for single-target from-to phrasing', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            exerciseInstanceId: 'q0:e0',
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|80|8|3';
      const result = parseQueueFormatResponse(
        response,
        queue,
        'set barbell bench press reps from 8 to 12',
        [{
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Barbell Bench Press',
          displayName: 'Barbell Bench Press',
        }]
      );

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].reps).toBe('12');
    });

    it('should enforce destination weight for single-target from-to phrasing', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            exerciseInstanceId: 'q0:e0',
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|80|8|3';
      const result = parseQueueFormatResponse(
        response,
        queue,
        'set barbell bench press weight from 80 to 90',
        [{
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Barbell Bench Press',
          displayName: 'Barbell Bench Press',
        }]
      );

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].weight).toBe('90');
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

    it('should preserve queue-item-specific exercises when multiple queue items share the same day number', () => {
      const queue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          position: 0,
          dayNumber: 1,
          exercises: [createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: 'q0:e0' })],
        }),
        createQueueItem({
          id: 'q1',
          position: 1,
          dayNumber: 1,
          exercises: [createExercise({ name: 'Barbell Back Squat', exerciseInstanceId: 'q1:e0' })],
        }),
        createQueueItem({
          id: 'q2',
          position: 2,
          dayNumber: 1,
          exercises: [createExercise({ name: 'Barbell Deadlift', exerciseInstanceId: 'q2:e0' })],
        }),
      ];

      const response =
        'Q0:D1:Barbell Bench Press|80|8|3;Q1:D1:Barbell Back Squat|100|8|3;Q2:D1:Barbell Deadlift|120|8|3';
      const parsed = parseQueueFormatResponse(response, queue, 'set barbell bench press to 80kg', [
        'Barbell Bench Press',
      ]);

      expect(parsed).not.toBeNull();
      expect(parsed).toHaveLength(3);
      expect(parsed?.[0].id).toBe('q0');
      expect(parsed?.[1].id).toBe('q1');
      expect(parsed?.[2].id).toBe('q2');
      expect(parsed?.[0].exercises[0].name).toBe('Barbell Bench Press');
      expect(parsed?.[1].exercises[0].name).toBe('Barbell Back Squat');
      expect(parsed?.[2].exercises[0].name).toBe('Barbell Deadlift');

      const differences = compareWorkoutQueues(queue, parsed ?? []);
      expect(differences).toHaveLength(0);
    });

    it('should preserve duplicate instance ids when repairing targeted duplicates', () => {
      const queue = [createQueueItem({
        id: 'q0',
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            exerciseInstanceId: 'q0:e0',
          }),
          createExercise({
            name: 'Barbell Bench Press',
            weight: '70',
            exerciseInstanceId: 'q0:e1',
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|80|8|3,Barbell Bench Press|75|8|3';
      const targeted = [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 1,
          exerciseInstanceId: 'q0:e1',
          name: 'Barbell Bench Press',
          displayName: 'Barbell Bench Press',
        },
      ];

      const result = parseQueueFormatResponse(
        response,
        queue,
        'change the second barbell bench press weight to 75',
        targeted
      );

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].weight).toBe('80');
      expect(result![0].exercises[1].weight).toBe('75');
      expect(result![0].exercises[0].exerciseInstanceId).toBe('q0:e0');
      expect(result![0].exercises[1].exerciseInstanceId).toBe('q0:e1');
    });

    it('should keep moderate injury-driven pressing swaps without explicit remove keywords', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3' }),
          createExercise({ name: 'Dumbbell Flyes', weight: '15', reps: '10', sets: '3' }),
        ],
      })];

      const request = 'moderate shoulder injury pressing is painful today, swap to safer options';
      const targeted = extractTargetExerciseRefs(request, queue);

      expect(targeted.map((item) => item.name)).toContain('Barbell Bench Press');

      const response = 'Q0:D1:Dumbbell Flyes|15|10|3';
      const result = parseQueueFormatResponse(response, queue, request, targeted);

      expect(result).not.toBeNull();
      expect(result![0].exercises.map((exercise) => exercise.name)).not.toContain('Barbell Bench Press');
    });

    it('should keep severe injury-driven deadlifting swaps without explicit remove keywords', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Barbell Deadlift', weight: '120', reps: '5', sets: '3' }),
          createExercise({ name: 'Leg Extensions', weight: '50', reps: '12', sets: '3' }),
        ],
      })];

      const request = 'severe lower back injury deadlifting is painful, make it safer';
      const targeted = extractTargetExerciseRefs(request, queue);

      expect(targeted.map((item) => item.name)).toContain('Barbell Deadlift');

      const response = 'Q0:D1:Leg Extensions|50|12|3';
      const result = parseQueueFormatResponse(response, queue, request, targeted);

      expect(result).not.toBeNull();
      expect(result![0].exercises.map((exercise) => exercise.name)).not.toContain('Barbell Deadlift');
    });

    it('should preserve valid targeted variant updates during repair when prompt contains extra natural language', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            variant: { angle: 'Flat' },
          }),
        ],
      })];

      const request = 'for my shoulder comfort, make the bench an incline variant and keep everything else the same';
      const response = 'Q0:D1:Barbell Bench Press|80|8|3|Incline';
      const targeted = [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          name: 'Barbell Bench Press',
          displayName: 'Barbell Bench Press',
        },
      ];

      const result = parseQueueFormatResponse(response, queue, request, targeted);

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].variant).toEqual({ angle: 'Incline' });
    });

    it('should normalize case and trim for supported variants using queue metadata options', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            variant: { angle: 'Flat' },
            variantOptions: [
              { label: 'Incline', field: 'angle', value: 'incline', aliases: ['inclined'] },
              { label: 'Decline', field: 'angle', value: 'decline', aliases: ['declined'] },
            ],
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|80|8|3|   InClInE   ';
      const result = parseQueueFormatResponse(response, queue, 'make bench incline', ['Barbell Bench Press']);

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].variant).toEqual({ angle: 'Incline' });
    });

    it('should map supported variant aliases to canonical option labels', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            weight: '80',
            reps: '8',
            sets: '3',
            variant: { angle: 'Flat' },
            variantOptions: [
              { label: 'Incline', field: 'angle', value: 'incline', aliases: ['inclined'] },
              { label: 'Decline', field: 'angle', value: 'decline', aliases: ['declined'] },
            ],
          }),
        ],
      })];

      const response = 'Q0:D1:Barbell Bench Press|80|8|3|inclined';
      const result = parseQueueFormatResponse(response, queue, 'make bench incline', ['Barbell Bench Press']);

      expect(result).not.toBeNull();
      expect(result![0].exercises[0].variant).toEqual({ angle: 'Incline' });
    });

    it('Task 1 regression - Decline Crunches name+variant leakage should avoid remove/add churn', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Decline Crunches',
            weight: '0',
            reps: '12',
            sets: '3',
            exerciseInstanceId: 'q0:e0',
          }),
        ],
      })];

      const response = 'Q0:D1:Crunches|0|15|3|Decline';
      const parsed = parseQueueFormatResponse(response, queue, 'change decline crunches reps to 15', [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Decline Crunches',
          displayName: 'Decline Crunches',
        },
      ]);

      expect(parsed).not.toBeNull();
      const differences = compareWorkoutQueues(queue, parsed ?? []);
      expect(differences.some((difference) => difference.type === 'removed')).toBe(false);
      expect(differences.some((difference) => difference.type === 'added')).toBe(false);
      expect(differences.some((difference) => difference.type === 'reps_change')).toBe(true);
      expect(parsed?.[0].exercises[0].exerciseInstanceId).toBe('q0:e0');
    });

    it('Task 2 follow-up - non-variant crunch edits should preserve original variant', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Decline Crunches',
            weight: '0',
            reps: '12',
            sets: '3',
            exerciseInstanceId: 'q0:e0',
          }),
        ],
      })];

      const response = 'Q0:D1:Decline Crunches|0|15|3';
      const parsed = parseQueueFormatResponse(response, queue, 'set decline crunches reps to 15', [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Decline Crunches',
          displayName: 'Decline Crunches',
        },
      ]);

      expect(parsed).not.toBeNull();
      expect(parsed?.[0].exercises[0].variant).toBeNull();
      const differences = compareWorkoutQueues(queue, parsed ?? []);
      expect(differences.some((difference) => difference.type === 'variant_change')).toBe(false);
      expect(differences.some((difference) => difference.type === 'reps_change')).toBe(true);
    });

    it('Task 1 regression - multi-reps intent should preserve calf 20 and leg extensions 6 through repair', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Calf Press', reps: '12', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Leg Extensions', reps: '12', sets: '3', exerciseInstanceId: 'q0:e1' }),
          createExercise({ name: 'Leg Press', reps: '10', sets: '3', exerciseInstanceId: 'q0:e2' }),
        ],
      })];

      const response = 'Q0:D1:Calf Press|80|20|3,Leg Extensions|50|6|3,Leg Press|140|10|3';
      const parsed = parseQueueFormatResponse(
        response,
        queue,
        'set calf press to 20 reps and leg extensions to 6 reps',
        [
          {
            queueItemId: 'q0',
            dayNumber: 1,
            exerciseIndex: 0,
            exerciseInstanceId: 'q0:e0',
            name: 'Calf Press',
            displayName: 'Calf Press',
          },
          {
            queueItemId: 'q0',
            dayNumber: 1,
            exerciseIndex: 1,
            exerciseInstanceId: 'q0:e1',
            name: 'Leg Extensions',
            displayName: 'Leg Extensions',
          },
        ]
      );

      expect(parsed).not.toBeNull();
      const calf = parsed?.[0].exercises.find((exercise) => exercise.name === 'Calf Press');
      const extensions = parsed?.[0].exercises.find((exercise) => exercise.name === 'Leg Extensions');
      expect(calf?.reps).toBe('20');
      expect(extensions?.reps).toBe('6');
    });

    it('Task 1 regression - multi-sets intent should preserve pulldowns 4 and triangle rows 5 through repair', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Lat Pulldowns', sets: '3', reps: '10', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Triangle Rows', sets: '3', reps: '10', exerciseInstanceId: 'q0:e1' }),
          createExercise({ name: 'Face Pulls', sets: '3', reps: '12', exerciseInstanceId: 'q0:e2' }),
        ],
      })];

      const response = 'Q0:D1:Lat Pulldowns|55|10|4,Triangle Rows|50|10|5,Face Pulls|25|12|3';
      const parsed = parseQueueFormatResponse(
        response,
        queue,
        'set lat pulldowns to 4 sets and triangle rows to 5 sets',
        [
          {
            queueItemId: 'q0',
            dayNumber: 1,
            exerciseIndex: 0,
            exerciseInstanceId: 'q0:e0',
            name: 'Lat Pulldowns',
            displayName: 'Lat Pulldowns',
          },
          {
            queueItemId: 'q0',
            dayNumber: 1,
            exerciseIndex: 1,
            exerciseInstanceId: 'q0:e1',
            name: 'Triangle Rows',
            displayName: 'Triangle Rows',
          },
        ]
      );

      expect(parsed).not.toBeNull();
      const pulldowns = parsed?.[0].exercises.find((exercise) => exercise.name === 'Lat Pulldowns');
      const rows = parsed?.[0].exercises.find((exercise) => exercise.name === 'Triangle Rows');
      expect(pulldowns?.sets).toBe('4');
      expect(rows?.sets).toBe('5');
    });

    it('Task 1 regression - variant-heavy Name (variant) leakage should be rejected in strict TOON rows', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Lat Pulldowns',
            reps: '10',
            sets: '3',
            variant: { grip: 'Wide' },
            exerciseInstanceId: 'q0:e0',
          }),
        ],
      })];

      const response = 'Q0:D1:Lat Pulldowns (Close Grip)|55|10|3';
      const parsed = parseQueueFormatResponse(response, queue, 'switch lat pulldowns to close grip', [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Lat Pulldowns',
          displayName: 'Lat Pulldowns',
        },
      ]);

      expect(parsed).toBeNull();
      expect(getLastQueueParseFailureReason()).toBe('variant_source_conflict');
    });

    it('Variant - Single should fail deterministically when Name (variant) conflicts with column 5', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Lat Pulldowns',
            reps: '10',
            sets: '3',
            variant: { grip: 'Wide' },
            exerciseInstanceId: 'q0:e0',
          }),
        ],
      })];

      const response = 'Q0:D1:Lat Pulldowns (Close Grip)|55|10|3|Wide';
      const parsed = parseQueueFormatResponse(response, queue, 'switch lat pulldowns to close grip', [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Lat Pulldowns',
          displayName: 'Lat Pulldowns',
        },
      ]);

      expect(parsed).toBeNull();
      expect(getLastQueueParseFailureReason()).toBe('variant_source_conflict');
    });

    it('Variant - Multi should reject Name (variant) leakage when column 5 is omitted', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Lat Pulldowns',
            reps: '10',
            sets: '3',
            variant: { grip: 'Wide' },
            exerciseInstanceId: 'q0:e0',
          }),
          createExercise({
            name: 'Barbell Bench Press',
            reps: '8',
            sets: '3',
            variant: { angle: 'Flat' },
            exerciseInstanceId: 'q0:e1',
          }),
        ],
      })];

      const response = 'Q0:D1:Lat Pulldowns (Close Grip)|55|10|3,Barbell Bench Press (Incline)|80|8|3';
      const parsed = parseQueueFormatResponse(
        response,
        queue,
        'switch lat pulldowns to close grip and change barbell bench press to incline',
        ['Lat Pulldowns', 'Barbell Bench Press']
      );

      expect(parsed).toBeNull();
      expect(getLastQueueParseFailureReason()).toBe('variant_source_conflict');
    });

    it('Variant - Muscle should reject Name (variant) leakage for muscle-targeted variant prompts when column 5 is omitted', () => {
      const queue = [createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Lat Pulldowns',
            reps: '10',
            sets: '3',
            variant: { grip: 'Wide' },
            exerciseInstanceId: 'q0:e0',
          }),
          createExercise({
            name: 'Triangle Rows',
            reps: '10',
            sets: '3',
            variant: { grip: 'Neutral' },
            exerciseInstanceId: 'q0:e1',
          }),
        ],
      })];

      const response = 'Q0:D1:Lat Pulldowns (Close Grip)|55|10|3,Triangle Rows (Close Grip)|50|10|3';
      const parsed = parseQueueFormatResponse(
        response,
        queue,
        'make all back movements close grip',
        ['Lat Pulldowns', 'Triangle Rows']
      );

      expect(parsed).toBeNull();
      expect(getLastQueueParseFailureReason()).toBe('variant_source_conflict');
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

    it('should reject reps range tokens', () => {
      const response = 'Q0:D1:Barbell Bench Press|80|8-10|3';
      const result = parseQueueFormatResponse(response, [originalQueue[0]]);
      expect(result).toBeNull();
    });

    it('should reject sets range tokens', () => {
      const response = 'Q0:D1:Barbell Bench Press|80|8|3-5';
      const result = parseQueueFormatResponse(response, [originalQueue[0]]);
      expect(result).toBeNull();
    });

    it('should reject decimal reps tokens', () => {
      const response = 'Q0:D1:Barbell Bench Press|80|8.5|3';
      const result = parseQueueFormatResponse(response, [originalQueue[0]]);
      expect(result).toBeNull();
    });

    it('should reject non-numeric sets tokens', () => {
      const response = 'Q0:D1:Barbell Bench Press|80|8|three';
      const result = parseQueueFormatResponse(response, [originalQueue[0]]);
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

    it('detects split phrasal remove intent', () => {
      expect(detectRequestedChangeType('take fingertip curls out of day 2')).toContain('remove');
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

    it('does not classify relative numeric add phrasing as structural add intent', () => {
      const result = detectRequestedChangeType('add 5kg to barbell bench press');
      expect(result).toContain('weight');
      expect(result).not.toContain('add');
    });

    it('does not classify relative numeric drop phrasing as structural remove intent', () => {
      const result = detectRequestedChangeType('drop leg extensions to 6 reps');
      expect(result).toContain('reps');
      expect(result).not.toContain('remove');
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

    it('should keep duplicate matches distinct when queue exercises have unique instance ids', () => {
      const duplicateQueue = [createQueueItem({
        exercises: [
          createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: 'q0:e1', weight: '70' }),
        ],
      })];

      const result = extractTargetExerciseRefs('change barbell bench press weight', duplicateQueue);

      expect(result).toHaveLength(2);
      expect(result.map((exercise) => exercise.exerciseInstanceId)).toEqual(['q0:e0', 'q0:e1']);
    });

    it('Task 1 regression - forearm targeting should not be empty for remove-all forearm prompt', () => {
      const queue = [createQueueItem({
        id: 'q0',
        exercises: [
          createExercise({
            name: 'Wrist Curls',
            muscle_groups_worked: ['forearms', 'biceps'],
            exerciseInstanceId: 'q0:e0',
          }),
          createExercise({
            name: 'Barbell Bench Press',
            muscle_groups_worked: ['chest', 'triceps'],
            exerciseInstanceId: 'q0:e1',
          }),
        ],
      })];

      const targeted = extractTargetExerciseRefs('take out all the forearm stuff', queue);

      expect(targeted.length).toBeGreaterThan(0);
      expect(targeted.map((item) => item.name)).toContain('Wrist Curls');
    });

    it('Task 1 regression - injury targeting fallback should produce non-empty refs for wrist injury prompt', () => {
      const queue = [createQueueItem({
        id: 'q0',
        exercises: [
          createExercise({
            name: 'Wrist Curls',
            muscle_groups_worked: ['forearms', 'biceps'],
            exerciseInstanceId: 'q0:e0',
          }),
          createExercise({
            name: 'Reverse Wrist Curls',
            muscle_groups_worked: ['forearms'],
            exerciseInstanceId: 'q0:e1',
          }),
        ],
      })];

      const targeted = extractTargetExerciseRefs('moderate wrist injury make this safer today', queue);

      expect(targeted.length).toBeGreaterThan(0);
      expect(targeted.map((item) => item.name)).toEqual(expect.arrayContaining(['Wrist Curls', 'Reverse Wrist Curls']));
    });

    it('Task 3 regression - injury movement-family phrasing should target pressing exercises deterministically', () => {
      const queue = [createQueueItem({
        id: 'q0',
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
            exerciseInstanceId: 'q0:e0',
          }),
          createExercise({
            name: 'Dumbbell Press',
            variant: { angle: 'Incline' },
            muscle_groups_worked: ['chest', 'shoulders', 'triceps'],
            exerciseInstanceId: 'q0:e1',
          }),
          createExercise({
            name: 'Cable Chest Flyes',
            muscle_groups_worked: ['chest', 'shoulders'],
            exerciseInstanceId: 'q0:e2',
          }),
          createExercise({
            name: 'Tricep Pushdowns',
            muscle_groups_worked: ['triceps'],
            exerciseInstanceId: 'q0:e3',
          }),
          createExercise({
            name: 'Barbell Back Squat',
            muscle_groups_worked: ['quads', 'glutes'],
            exerciseInstanceId: 'q0:e4',
          }),
        ],
      })];

      const request = 'my shoulder is sore, go easier on pressing today';
      const firstPass = extractTargetExerciseRefs(request, queue);
      const secondPass = extractTargetExerciseRefs(request, queue);
      const names = firstPass.map((item) => item.name);

      expect(firstPass.length).toBeGreaterThan(0);
      expect(names).toEqual(
        expect.arrayContaining(['Barbell Bench Press', 'Dumbbell Press'])
      );
      expect(names).not.toContain('Cable Chest Flyes');
      expect(names).not.toContain('Tricep Pushdowns');
      expect(names).not.toContain('Barbell Back Squat');
      expect(firstPass.map((item) => item.exerciseInstanceId)).toEqual(secondPass.map((item) => item.exerciseInstanceId));
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

    it('should deterministically add a targeted duplicate when add intent is requested but model returns no structural change', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Hammer Curls', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: 'q0:e1' }),
          ],
        }),
      ];

      const parsedQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Hammer Curls', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: 'q0:e1' }),
          ],
        }),
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'add another hammer curls',
        [
          {
            queueItemId: 'q0',
            dayNumber: 1,
            exerciseIndex: 0,
            exerciseInstanceId: 'q0:e0',
            name: 'Hammer Curls',
            displayName: 'Hammer Curls',
          },
        ]
      );

      const hammerCount = repaired[0].exercises.filter((exercise) => exercise.name === 'Hammer Curls').length;
      expect(hammerCount).toBe(2);
    });

    it('should deterministically remove targeted exercises when remove intent is requested but model returns no structural change', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Barbell Deadlift', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Barbell Back Squat', exerciseInstanceId: 'q0:e1' }),
          ],
        }),
      ];

      const parsedQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Barbell Deadlift', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Barbell Back Squat', exerciseInstanceId: 'q0:e1' }),
          ],
        }),
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'remove barbell deadlift from my workout',
        [
          {
            queueItemId: 'q0',
            dayNumber: 1,
            exerciseIndex: 0,
            exerciseInstanceId: 'q0:e0',
            name: 'Barbell Deadlift',
            displayName: 'Barbell Deadlift',
          },
        ]
      );

      const deadliftCount = repaired[0].exercises.filter((exercise) => exercise.name === 'Barbell Deadlift').length;
      expect(deadliftCount).toBe(0);
    });

    it('applies requested variant to every targeted exercise even when variant options metadata is missing', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q1',
          dayNumber: 2,
          position: 1,
          exercises: [
            createExercise({
              name: 'Bent Over Barbell Row',
              variant: { grip: 'Overhand' },
              exerciseInstanceId: 'q1:e0',
            }),
            createExercise({
              name: 'Overhead Barbell Press',
              variant: { posture: 'Seated' },
              exerciseInstanceId: 'q1:e1',
            }),
          ],
        }),
      ];

      const parsedQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q1',
          dayNumber: 2,
          position: 1,
          exercises: [
            createExercise({
              name: 'Bent Over Barbell Row',
              variant: { grip: 'Overhand' },
              exerciseInstanceId: 'q1:e0',
            }),
            createExercise({
              name: 'Overhead Barbell Press',
              variant: { posture: 'Seated' },
              exerciseInstanceId: 'q1:e1',
            }),
          ],
        }),
      ];

      const targetedRefs = [
        {
          queueItemId: 'q1',
          dayNumber: 2,
          exerciseIndex: 0,
          exerciseInstanceId: 'q1:e0',
          name: 'Bent Over Barbell Row',
          displayName: 'Bent Over Barbell Row (Overhand)',
        },
        {
          queueItemId: 'q1',
          dayNumber: 2,
          exerciseIndex: 1,
          exerciseInstanceId: 'q1:e1',
          name: 'Overhead Barbell Press',
          displayName: 'Overhead Barbell Press (Seated)',
        },
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'make bent over barbell row and overhead barbell press incline',
        targetedRefs
      );

      const result = evaluateVariantSemanticOutcome(
        'make bent over barbell row and overhead barbell press incline',
        originalQueue,
        repaired,
        targetedRefs,
        'incline'
      );

      expect(result.passed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('does not treat add-variant phrasing as structural add intent', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q1',
          dayNumber: 2,
          position: 1,
          exercises: [
            createExercise({
              name: 'Hammer Curls',
              variant: { grip: 'Neutral Grip' },
              exerciseInstanceId: 'q1:e0',
            }),
            createExercise({
              name: 'Reverse Grip Forearm Curls',
              variant: { grip: 'Reverse Grip' },
              exerciseInstanceId: 'q1:e1',
            }),
          ],
        }),
      ];

      const parsedQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q1',
          dayNumber: 2,
          position: 1,
          exercises: [
            createExercise({
              name: 'Hammer Curls',
              variant: { grip: 'Neutral Grip' },
              exerciseInstanceId: 'q1:e0',
            }),
            createExercise({
              name: 'Reverse Grip Forearm Curls',
              variant: { grip: 'Reverse Grip' },
              exerciseInstanceId: 'q1:e1',
            }),
          ],
        }),
      ];

      const targetedRefs = [
        {
          queueItemId: 'q1',
          dayNumber: 2,
          exerciseIndex: 0,
          exerciseInstanceId: 'q1:e0',
          name: 'Hammer Curls',
          displayName: 'Hammer Curls (Neutral Grip)',
        },
        {
          queueItemId: 'q1',
          dayNumber: 2,
          exerciseIndex: 1,
          exerciseInstanceId: 'q1:e1',
          name: 'Reverse Grip Forearm Curls',
          displayName: 'Reverse Grip Forearm Curls (Reverse Grip)',
        },
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'add neutral grip to hammer curls and reverse grip forearm curls',
        targetedRefs
      );

      expect(repaired[0].exercises).toHaveLength(2);
    });


    it('repair regression - preserves intended neutral-grip variant for all targeted exercises in multi-target requests', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q1',
          dayNumber: 2,
          position: 1,
          exercises: [
            createExercise({
              name: 'Lat Pulldowns',
              variant: { grip: 'Wide Grip' },
              variantOptions: [
                { label: 'Wide Grip', value: 'wide grip', field: 'grip' },
                { label: 'Neutral Grip', value: 'neutral grip', field: 'grip' },
              ],
              exerciseInstanceId: 'q1:e6',
            }),
            createExercise({
              name: 'Bent Over Barbell Row',
              variant: { grip: 'Overhand' },
              variantOptions: [
                { label: 'Overhand', value: 'overhand', field: 'grip' },
                { label: 'Neutral Grip', value: 'neutral grip', field: 'grip' },
              ],
              exerciseInstanceId: 'q1:e7',
            }),
          ],
        }),
      ];

      const parsedQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q1',
          dayNumber: 2,
          position: 1,
          exercises: [
            createExercise({
              name: 'Lat Pulldowns',
              variant: { grip: 'Neutral Grip' },
              exerciseInstanceId: 'q1:e6',
            }),
            createExercise({
              name: 'Bent Over Barbell Row',
              variant: { grip: 'Overhand' },
              exerciseInstanceId: 'q1:e7',
            }),
          ],
        }),
      ];

      const targetedRefs = [
        {
          queueItemId: 'q1',
          dayNumber: 2,
          exerciseIndex: 0,
          exerciseInstanceId: 'q1:e6',
          name: 'Lat Pulldowns',
          displayName: 'Lat Pulldowns (Wide Grip)',
        },
        {
          queueItemId: 'q1',
          dayNumber: 2,
          exerciseIndex: 1,
          exerciseInstanceId: 'q1:e7',
          name: 'Bent Over Barbell Row',
          displayName: 'Bent Over Barbell Row (Overhand)',
        },
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'make lat pulldowns and cable rows neutral grip for this workout',
        targetedRefs
      );

      const result = evaluateVariantSemanticOutcome(
        'make lat pulldowns and cable rows neutral grip for this workout',
        originalQueue,
        repaired,
        targetedRefs,
        'neutral grip'
      );

      expect(result.passed).toBe(true);
      expect(result.reason).toBeUndefined();

    });


    it('injury fallback - mild injury lightens targeted exercises when model leaves them unchanged', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Overhead Barbell Press', weight: '50', reps: '8', sets: '3', exerciseInstanceId: 'q0:e1' }),
            createExercise({ name: 'Barbell Back Squat', weight: '100', reps: '5', sets: '5', exerciseInstanceId: 'q0:e2' }),
          ],
        }),
      ];

      const parsedQueue = JSON.parse(JSON.stringify(originalQueue)) as WorkoutQueueItem[];

      const targetedRefs = [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Barbell Bench Press',
          displayName: 'Barbell Bench Press',
        },
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 1,
          exerciseInstanceId: 'q0:e1',
          name: 'Overhead Barbell Press',
          displayName: 'Overhead Barbell Press',
        },
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'mild shoulder injury pressing is painful today, make it easier',
        targetedRefs
      );

      expect(repaired[0].exercises[0].weight).not.toBe('80');
      expect(repaired[0].exercises[1].weight).not.toBe('50');
      expect(repaired[0].exercises[2].weight).toBe('100');
    });

    it('injury fallback - mild phrasing without severity keyword still lightens targeted exercises', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Overhead Barbell Press', weight: '50', reps: '8', sets: '3', exerciseInstanceId: 'q0:e1' }),
          ],
        }),
      ];

      const parsedQueue = JSON.parse(JSON.stringify(originalQueue)) as WorkoutQueueItem[];
      const targetedRefs = [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Barbell Bench Press',
          displayName: 'Barbell Bench Press',
        },
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 1,
          exerciseInstanceId: 'q0:e1',
          name: 'Overhead Barbell Press',
          displayName: 'Overhead Barbell Press',
        },
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'my shoulder feels a little irritated today, go easier on pressing',
        targetedRefs
      );

      expect(repaired[0].exercises[0].weight).not.toBe('80');
      expect(repaired[0].exercises[1].weight).not.toBe('50');
    });

    it('injury fallback - moderate phrasing without severity keyword still removes targeted painful exercises', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Barbell Back Squat', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Leg Extensions', exerciseInstanceId: 'q0:e1' }),
            createExercise({ name: 'Calf Press', exerciseInstanceId: 'q0:e2' }),
            createExercise({ name: 'Barbell Deadlift', exerciseInstanceId: 'q0:e3' }),
            createExercise({ name: 'Lat Pulldowns', exerciseInstanceId: 'q0:e4' }),
          ],
        }),
      ];

      const parsedQueue = JSON.parse(JSON.stringify(originalQueue)) as WorkoutQueueItem[];
      const prompt = "my lower back is sore, adjust today's plan so it doesn't flare up";
      const targetedRefs = [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 3,
          exerciseInstanceId: 'q0:e3',
          name: 'Barbell Deadlift',
          displayName: 'Barbell Deadlift',
        },
      ];

      const repaired = repairQueueWithIntent(originalQueue, parsedQueue, prompt, targetedRefs);

      const remainingNames = repaired[0].exercises.map((exercise) => exercise.name);
      expect(remainingNames).not.toContain('Barbell Deadlift');
      expect(remainingNames).toContain('Lat Pulldowns');
    });


    it('injury fallback - mild injury lightens affected exercises across queue even when incoming targets are partial', () => {
      const originalQueue: WorkoutQueueItem[] = [
        createQueueItem({
          id: 'q0',
          dayNumber: 1,
          position: 0,
          exercises: [
            createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3', exerciseInstanceId: 'q0:e0' }),
            createExercise({ name: 'Overhead Barbell Press', weight: '50', reps: '8', sets: '3', exerciseInstanceId: 'q0:e1' }),
            createExercise({ name: 'Barbell Back Squat', weight: '100', reps: '5', sets: '5', exerciseInstanceId: 'q0:e2' }),
          ],
        }),
      ];

      const parsedQueue = JSON.parse(JSON.stringify(originalQueue)) as WorkoutQueueItem[];

      const partialTargets = [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Barbell Bench Press',
          displayName: 'Barbell Bench Press',
        },
      ];

      const repaired = repairQueueWithIntent(
        originalQueue,
        parsedQueue,
        'my shoulder feels a little irritated today, go easier on pressing',
        partialTargets
      );

      const bench = repaired[0].exercises.find((exercise) => exercise.name === 'Barbell Bench Press');
      const ohp = repaired[0].exercises.find((exercise) => exercise.name === 'Overhead Barbell Press');
      const squat = repaired[0].exercises.find((exercise) => exercise.name === 'Barbell Back Squat');

      expect(bench?.weight).not.toBe('80');
      expect(ohp?.weight).not.toBe('50');
      expect(squat?.weight).toBe('100');
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

    it('should compare duplicate exercises by instance id instead of collapsing them', () => {
      const oldQueue = [createQueueItem({
        exercises: [
          createExercise({ name: 'Barbell Bench Press', weight: '80', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Barbell Bench Press', weight: '70', exerciseInstanceId: 'q0:e1' }),
        ],
      })];
      const newQueue = [createQueueItem({
        exercises: [
          createExercise({ name: 'Barbell Bench Press', weight: '80', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Barbell Bench Press', weight: '75', exerciseInstanceId: 'q0:e1' }),
        ],
      })];

      const differences = compareWorkoutQueues(oldQueue, newQueue);

      expect(differences).toHaveLength(1);
      expect(differences[0].type).toBe('weight_change');
      expect(differences[0].oldWeight).toBe('70');
      expect(differences[0].newWeight).toBe('75');
    });

    it('should not report remove/add pairs when parsed queue omits exerciseInstanceId but exercise content is unchanged', () => {
      const oldQueue = [createQueueItem({
        exercises: [
          createExercise({ name: 'Barbell Bench Press', weight: '0', reps: '8', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Chest Press', weight: '0', reps: '8', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      })];

      const newQueue = [createQueueItem({
        id: oldQueue[0].id,
        position: oldQueue[0].position,
        dayNumber: oldQueue[0].dayNumber,
        programName: oldQueue[0].programName,
        programId: oldQueue[0].programId,
        exercises: [
          createExercise({ name: 'Barbell Bench Press', weight: '0', reps: '8', sets: '3', exerciseInstanceId: undefined }),
          createExercise({ name: 'Chest Press', weight: '0', reps: '8', sets: '3', exerciseInstanceId: undefined }),
        ],
      })];

      const differences = compareWorkoutQueues(oldQueue, newQueue);

      expect(differences).toHaveLength(0);
      expect(differences.some((d) => d.type === 'removed')).toBe(false);
      expect(differences.some((d) => d.type === 'added')).toBe(false);
    });

    it('should not collapse queue items when queue ids are duplicated', () => {
      const duplicateId = 'queue-dup';
      const oldQueue = [
        createQueueItem({
          id: duplicateId,
          position: 0,
          exercises: [createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: 'q0:e0' })],
        }),
        createQueueItem({
          id: duplicateId,
          position: 1,
          exercises: [createExercise({ name: 'Chest Press', exerciseInstanceId: 'q1:e0' })],
        }),
      ];

      const newQueue = [
        createQueueItem({
          id: duplicateId,
          position: 0,
          exercises: [createExercise({ name: 'Barbell Bench Press', exerciseInstanceId: undefined })],
        }),
        createQueueItem({
          id: duplicateId,
          position: 1,
          exercises: [createExercise({ name: 'Chest Press', exerciseInstanceId: undefined })],
        }),
      ];

      const differences = compareWorkoutQueues(oldQueue, newQueue);

      expect(differences).toHaveLength(0);
      expect(differences.some((d) => d.type === 'removed')).toBe(false);
      expect(differences.some((d) => d.type === 'added')).toBe(false);
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

  it('allows variant-only add/remove diff pairs when request explicitly asks for variant change', () => {
    const differences = [
      {
        type: 'removed' as const,
        queueItemId: 'q1',
        queueItemName: 'Test',
        dayNumber: 2,
        exerciseName: 'Lat Pulldowns (Wide Grip)',
        oldExercise: createExercise({
          name: 'Lat Pulldowns',
          exerciseInstanceId: 'q1:e6',
          variant: { grip: 'wide' },
        }),
      },
      {
        type: 'added' as const,
        queueItemId: 'q1',
        queueItemName: 'Test',
        dayNumber: 2,
        exerciseName: 'Lat Pulldowns (Close Grip)',
        newExercise: createExercise({
          name: 'Lat Pulldowns',
          exerciseInstanceId: 'q1:e6',
          variant: { grip: 'close' },
        }),
      },
    ];

    const result = validateChanges('make lat pulldowns close grip', differences);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('allows variant-only add/remove pairs for multiple targeted exercises in variant requests', () => {
    const differences = [
      {
        type: 'removed' as const,
        queueItemId: 'q1',
        queueItemName: 'Test',
        dayNumber: 2,
        exerciseName: 'Lat Pulldowns (Wide Grip)',
        oldExercise: createExercise({
          name: 'Lat Pulldowns',
          exerciseInstanceId: 'q1:e6',
          variant: { grip: 'wide' },
        }),
      },
      {
        type: 'added' as const,
        queueItemId: 'q1',
        queueItemName: 'Test',
        dayNumber: 2,
        exerciseName: 'Lat Pulldowns (Neutral Grip)',
        newExercise: createExercise({
          name: 'Lat Pulldowns',
          exerciseInstanceId: 'q1:e6',
          variant: { grip: 'neutral' },
        }),
      },
      {
        type: 'removed' as const,
        queueItemId: 'q2',
        queueItemName: 'Test',
        dayNumber: 3,
        exerciseName: 'Bent Over Barbell Row (Overhand)',
        oldExercise: createExercise({
          name: 'Bent Over Barbell Row',
          exerciseInstanceId: 'q2:e4',
          variant: { grip: 'overhand' },
        }),
      },
      {
        type: 'added' as const,
        queueItemId: 'q2',
        queueItemName: 'Test',
        dayNumber: 3,
        exerciseName: 'Bent Over Barbell Row (Neutral Grip)',
        newExercise: createExercise({
          name: 'Bent Over Barbell Row',
          exerciseInstanceId: 'q2:e4',
          variant: { grip: 'neutral' },
        }),
      },
    ];

    const result = validateChanges('switch lats and rows to neutral grip', differences);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('still warns for real structural add/remove when variant was not requested', () => {
    const differences = [
      {
        type: 'removed' as const,
        queueItemId: 'q1',
        queueItemName: 'Test',
        dayNumber: 2,
        exerciseName: 'Lat Pulldowns (Wide Grip)',
        oldExercise: createExercise({
          name: 'Lat Pulldowns',
          exerciseInstanceId: 'q1:e6',
          variant: { grip: 'wide' },
        }),
      },
      {
        type: 'added' as const,
        queueItemId: 'q1',
        queueItemName: 'Test',
        dayNumber: 2,
        exerciseName: 'Hammer Curls (Neutral Grip)',
        newExercise: createExercise({
          name: 'Hammer Curls',
          exerciseInstanceId: 'q1:e2-new',
          variant: { grip: 'neutral' },
        }),
      },
    ];

    const result = validateChanges('increase pulldown weight by 5kg', differences);

    expect(result.valid).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('Unexpected removal'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('Unexpected addition'))).toBe(true);
  });

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

describe('semantic outcome evaluators', () => {
  it('fails severe injury semantic when affected exercise remains anywhere in the current queue', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Back Squat' })],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Barbell Back Squat' })],
      }),
      createQueueItem({
        id: 'q2',
        position: 2,
        exercises: [createExercise({ name: 'Barbell Back Squat' })],
      }),
      createQueueItem({
        id: 'q3',
        position: 3,
        exercises: [createExercise({ name: 'Barbell Back Squat' })],
      }),
    ];

    const failedSevereQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Leg Extensions' })],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Barbell Back Squat' })],
      }),
      createQueueItem({
        id: 'q2',
        position: 2,
        exercises: [createExercise({ name: 'Leg Press' })],
      }),
      createQueueItem({
        id: 'q3',
        position: 3,
        exercises: [createExercise({ name: 'Barbell Back Squat' })],
      }),
    ];

    const passedSevereQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Leg Extensions' })],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Leg Press' })],
      }),
      createQueueItem({
        id: 'q2',
        position: 2,
        exercises: [createExercise({ name: 'Leg Curls' })],
      }),
      createQueueItem({
        id: 'q3',
        position: 3,
        exercises: [createExercise({ name: 'Barbell Back Squat' })],
      }),
    ];

    const failedResult = evaluateInjurySemanticOutcome(
      'severe knee injury remove squats',
      originalQueue,
      failedSevereQueue,
      ['Barbell Back Squat']
    );

    expect(failedResult.passed).toBe(false);
    expect(failedResult.reason?.toLowerCase()).toContain('entire current queue');

    const stillPresentOutsideFirstThree = evaluateInjurySemanticOutcome(
      'severe knee injury remove squats',
      originalQueue,
      passedSevereQueue,
      ['Barbell Back Squat']
    );

    expect(stillPresentOutsideFirstThree.passed).toBe(false);
    expect(stillPresentOutsideFirstThree.reason?.toLowerCase()).toContain('entire current queue');
  });

  it('should fail variant semantic when requested target variant is not applied', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            variant: { angle: 'flat' },
          }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            variant: { angle: 'decline' },
          }),
        ],
      }),
    ];

    const result = evaluateVariantSemanticOutcome(
      'make bench incline variant',
      originalQueue,
      parsedQueue,
      [{
        queueItemId: 'q0',
        dayNumber: 1,
        exerciseIndex: 0,
        name: 'Barbell Bench Press',
        displayName: 'Barbell Bench Press',
      }],
      'incline'
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('incline');
  });

  it('should pass variant semantic when requested target variant is applied', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            variant: { angle: 'flat' },
          }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            variant: { angle: 'incline' },
          }),
        ],
      }),
    ];

    const result = evaluateVariantSemanticOutcome(
      'make bench incline variant',
      originalQueue,
      parsedQueue,
      [{
        queueItemId: 'q0',
        dayNumber: 1,
        exerciseIndex: 0,
        name: 'Barbell Bench Press',
        displayName: 'Barbell Bench Press',
      }],
      'incline'
    );

    expect(result.passed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should pass variant semantic when targeted exercise moves but instance id matches', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [
          createExercise({
            exerciseInstanceId: 'bench-1',
            name: 'Barbell Bench Press',
            variant: { angle: 'flat' },
          }),
          createExercise({
            exerciseInstanceId: 'fly-1',
            name: 'Dumbbell Flyes',
          }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [
          createExercise({
            exerciseInstanceId: 'fly-1',
            name: 'Dumbbell Flyes',
          }),
        ],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [
          createExercise({
            exerciseInstanceId: 'bench-1',
            name: 'Barbell Bench Press',
            variant: { angle: 'incline' },
          }),
        ],
      }),
    ];

    const result = evaluateVariantSemanticOutcome(
      'make bench incline variant',
      originalQueue,
      parsedQueue,
      [{
        queueItemId: 'q0',
        dayNumber: 1,
        exerciseIndex: 0,
        exerciseInstanceId: 'bench-1',
        name: 'Barbell Bench Press',
        displayName: 'Barbell Bench Press',
      }],
      'incline'
    );

    expect(result.passed).toBe(true);
  });

  it('should fail severe injury semantic when affected name includes variant label', () => {
    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [
          createExercise({
            name: 'Barbell Back Squat',
            variant: { angle: 'High Bar' },
          }),
        ],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Leg Press' })],
      }),
      createQueueItem({
        id: 'q2',
        position: 2,
        exercises: [createExercise({ name: 'Leg Curls' })],
      }),
    ];

    const result = evaluateInjurySemanticOutcome(
      'severe knee injury remove squats',
      [],
      parsedQueue,
      ['Barbell Back Squat (High Bar)']
    );

    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('entire current queue');
  });

  it('should fail mild injury semantic when affected exercises are unchanged', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3' })],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3' })],
      }),
    ];

    const result = evaluateInjurySemanticOutcome(
      'mild shoulder irritation',
      originalQueue,
      parsedQueue,
      ['Barbell Bench Press']
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('mild');
  });

  it('should pass mild injury semantic when affected exercises are lightened', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3' })],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Bench Press', weight: '60', reps: '8', sets: '3' })],
      }),
    ];

    const result = evaluateInjurySemanticOutcome(
      'mild shoulder irritation',
      originalQueue,
      parsedQueue,
      ['Barbell Bench Press']
    );

    expect(result.passed).toBe(true);
  });

  it('should fail moderate injury semantic when affected exercises are unchanged', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Deadlift', weight: '120', reps: '5', sets: '3' })],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Deadlift', weight: '120', reps: '5', sets: '3' })],
      }),
    ];

    const result = evaluateInjurySemanticOutcome(
      'moderate lower back soreness',
      originalQueue,
      parsedQueue,
      ['Barbell Deadlift']
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('moderate');
  });

  it('should pass moderate injury semantic when affected exercises are removed', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Deadlift', weight: '120', reps: '5', sets: '3' })],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Leg Press', weight: '80', reps: '10', sets: '3' })],
      }),
    ];

    const result = evaluateInjurySemanticOutcome(
      'moderate lower back soreness',
      originalQueue,
      parsedQueue,
      ['Barbell Deadlift']
    );

    expect(result.passed).toBe(true);
  });

  it('should fail mild injury semantic when one affected exercise in current queue is not lightened', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Bench Press', weight: '80', reps: '8', sets: '3' })],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Dumbbell Bench Press', weight: '30', reps: '10', sets: '3' })],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Bench Press', weight: '70', reps: '8', sets: '3' })],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Dumbbell Bench Press', weight: '30', reps: '10', sets: '3' })],
      }),
    ];

    const result = evaluateInjurySemanticOutcome(
      'mild chest strain',
      originalQueue,
      parsedQueue,
      ['Barbell Bench Press', 'Dumbbell Bench Press']
    );

    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('all affected');
  });

  it('should fail moderate injury semantic when one affected exercise remains unchanged in the current queue', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Barbell Deadlift', weight: '120', reps: '5', sets: '3' })],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Romanian Deadlift', weight: '100', reps: '8', sets: '3' })],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        position: 0,
        exercises: [createExercise({ name: 'Leg Press', weight: '80', reps: '10', sets: '3' })],
      }),
      createQueueItem({
        id: 'q1',
        position: 1,
        exercises: [createExercise({ name: 'Romanian Deadlift', weight: '100', reps: '8', sets: '3' })],
      }),
    ];

    const result = evaluateInjurySemanticOutcome(
      'moderate lower back soreness',
      originalQueue,
      parsedQueue,
      ['Barbell Deadlift', 'Romanian Deadlift']
    );

    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('all affected');
  });
});

describe('evaluatePromptIntentOutcome', () => {
  it('fails intent outcome when one requested multi-reps target is not satisfied', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Calf Press', reps: '12', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Leg Extensions', reps: '12', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Calf Press', reps: '20', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Leg Extensions', reps: '12', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'make calf press 20 reps but drop leg extensions to 6',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Calf Press',
          displayName: 'Calf Press',
        },
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 1,
          exerciseInstanceId: 'q0:e1',
          name: 'Leg Extensions',
          displayName: 'Leg Extensions',
        },
      ]
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Leg Extensions');
    expect(result.reason).toContain('6');
  });

  it('fails intent outcome when duplicate-add prompt does not increase targeted exercise count', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'hey add decline crunches to day 2 again',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Decline Crunches',
          displayName: 'Decline Crunches',
        },
      ]
    );

    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('add');
  });

  it('fails add intent when only unrelated numeric changes occur', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', reps: '12', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', reps: '10', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', reps: '12', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', reps: '15', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'add decline crunches to day 2',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Decline Crunches',
          displayName: 'Decline Crunches',
        },
      ]
    );

    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('add');
  });

  it('fails remove intent when targeted exercise is not removed', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', reps: '12', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', reps: '10', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', reps: '12', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', reps: '15', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'remove decline crunches from day 2',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Decline Crunches',
          displayName: 'Decline Crunches',
        },
      ]
    );

    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('remove');
  });

  it('passes add intent when targeted exercise count increases', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Decline Crunches', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', exerciseInstanceId: 'q0:e1' }),
          createExercise({ name: 'Decline Crunches', exerciseInstanceId: 'q0:e2' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'add decline crunches to day 2',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Decline Crunches',
          displayName: 'Decline Crunches',
        },
      ]
    );

    expect(result.passed).toBe(true);
  });

  it('fails remove intent when a non-target duplicate is removed instead of the targeted instance', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Lat Pulldowns', variant: { grip: 'Close Grip' }, exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', variant: { grip: 'Wide Grip' }, exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Lat Pulldowns', variant: { grip: 'Close Grip' }, exerciseInstanceId: 'q0:e0' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'remove close grip lat pulldowns',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Lat Pulldowns',
          displayName: 'Lat Pulldowns (Close Grip)',
        },
      ]
    );

    expect(result.passed).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('remove');
  });
  it('passes add intent when parsed exercise uses canonical alias of requested target', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Preacher Curl', reps: '10', sets: '3', exerciseInstanceId: 'q0:e0' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Preacher Curl', reps: '10', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Preacher Curl', reps: '8', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'add barbell curls to day 2',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Barbell Curls',
          displayName: 'Barbell Curls',
        },
      ]
    );

    expect(result.passed).toBe(true);
  });

  it('passes remove intent when parsed queue removes canonical alias target of requested name', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Preacher Curl', reps: '10', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', reps: '10', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Lat Pulldowns', reps: '10', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'remove barbell curls from day 2',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Barbell Curls',
          displayName: 'Barbell Curls',
        },
      ]
    );

    expect(result.passed).toBe(true);
  });

  it('keeps clause-specific reps destinations isolated per targeted exercise', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        position: 0,
        exercises: [
          createExercise({ name: 'Calf Press', reps: '12', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Leg Extensions', reps: '10', sets: '3', exerciseInstanceId: 'q0:e1' }),
          createExercise({ name: 'Leg Press', reps: '10', sets: '3', exerciseInstanceId: 'q0:e2' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        position: 0,
        exercises: [
          createExercise({ name: 'Calf Press', reps: '20', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Leg Extensions', reps: '20', sets: '3', exerciseInstanceId: 'q0:e1' }),
          createExercise({ name: 'Leg Press', reps: '20', sets: '3', exerciseInstanceId: 'q0:e2' }),
        ],
      }),
    ];

    const repaired = repairQueueWithIntent(
      originalQueue,
      parsedQueue,
      'make calf press 20 reps but drop leg extensions to 6',
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Calf Press',
          displayName: 'Calf Press',
        },
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 1,
          exerciseInstanceId: 'q0:e1',
          name: 'Leg Extensions',
          displayName: 'Leg Extensions',
        },
      ]
    );

    const calf = repaired[0].exercises.find((exercise) => exercise.exerciseInstanceId === 'q0:e0');
    const legExtensions = repaired[0].exercises.find((exercise) => exercise.exerciseInstanceId === 'q0:e1');

    expect(calf?.reps).toBe('20');
    expect(legExtensions?.reps).toBe('6');
  });

  it('passes intent outcome for relative reps decrease without structural remove requirement', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Leg Extensions', reps: '10', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', reps: '10', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const parsedQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({ name: 'Leg Extensions', reps: '6', sets: '3', exerciseInstanceId: 'q0:e0' }),
          createExercise({ name: 'Lat Pulldowns', reps: '10', sets: '3', exerciseInstanceId: 'q0:e1' }),
        ],
      }),
    ];

    const result = evaluatePromptIntentOutcome(
      'drop leg extensions to 6 reps',
      originalQueue,
      parsedQueue,
      [
        {
          queueItemId: 'q0',
          dayNumber: 1,
          exerciseIndex: 0,
          exerciseInstanceId: 'q0:e0',
          name: 'Leg Extensions',
          displayName: 'Leg Extensions',
        },
      ]
    );

    expect(result.passed).toBe(true);
  });

});

describe('analyzeTestPromptQueueCoverage', () => {
  it('should report missing targets when prompt exercises are absent from the queue', () => {
    const queue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [createExercise({ name: 'Barbell Bench Press' })],
      }),
    ];

    const report = analyzeTestPromptQueueCoverage(
      [{ type: 'Variant - Single', prompt: 'switch my lat pulldowns to close grip today' }],
      queue
    );

    expect(report.allCovered).toBe(false);
    expect(report.results[0].status).toBe('missing_targets');
  });

  it('should treat variant prompt as covered when targeted exercise lacks variant options metadata', () => {
    const queue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Custom Unknown Row',
            muscle_groups_worked: ['back'],
            equipment: 'Machine',
          }),
        ],
      }),
    ];

    const report = analyzeTestPromptQueueCoverage(
      [{ type: 'Variant - Single', prompt: 'switch my custom unknown row to close grip today' }],
      queue
    );

    expect(report.allCovered).toBe(true);
    expect(report.results[0].status).toBe('covered');
  });

  it('should report missing variant capability when queue metadata has variant options that do not support requested variant', () => {
    const queue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            variantOptions: [
              { label: 'Incline', field: 'angle', value: 'incline', aliases: ['inclined'] },
              { label: 'Decline', field: 'angle', value: 'decline', aliases: ['declined'] },
            ],
          }),
        ],
      }),
    ];

    const report = analyzeTestPromptQueueCoverage(
      [{ type: 'Variant - Single', prompt: 'switch my barbell bench press to close grip today' }],
      queue
    );

    expect(report.allCovered).toBe(false);
    expect(report.results[0].status).toBe('missing_variant_capability');
  });

  it('should preserve original variant when requested variant is unsupported by available queue metadata options', () => {
    const originalQueue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        position: 0,
        exercises: [
          createExercise({
            name: 'Barbell Bench Press',
            variant: { angle: 'Incline' },
            variantOptions: [
              { label: 'Incline', field: 'angle', value: 'incline', aliases: ['inclined'] },
              { label: 'Decline', field: 'angle', value: 'decline', aliases: ['declined'] },
            ],
          }),
        ],
      }),
    ];

    const response = 'Q0:D1:Barbell Bench Press|80|8|3|Close Grip';

    const parsed = parseQueueFormatResponse(
      response,
      originalQueue,
      'change barbell bench press variant to close grip',
      ['Barbell Bench Press']
    );

    expect(parsed).not.toBeNull();
    expect(parsed![0].exercises[0].variant).toEqual({ angle: 'Incline' });
  });

  it('should mark prompt as covered when a direct target match exists for non-variant tests', () => {
    const queue: WorkoutQueueItem[] = [
      createQueueItem({
        id: 'q0',
        dayNumber: 1,
        exercises: [createExercise({ name: 'Barbell Bench Press' })],
      }),
    ];

    const report = analyzeTestPromptQueueCoverage(
      [{ type: 'Single - Weight', prompt: 'set barbell bench press to 90kg' }],
      queue
    );

    expect(report.allCovered).toBe(true);
    expect(report.results[0].status).toBe('covered');
    expect(report.results[0].targetedExercises).toContain('Barbell Bench Press');
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
    it('allows injury-driven removals without explicit remove keywords for moderate severity', () => {
      const differences = [{
        type: 'removed' as const,
        queueItemId: 'q2',
        queueItemName: 'Day 3',
        dayNumber: 3,
        exerciseName: 'Barbell Deadlift',
      }];

      const result = validateChanges("my lower back is sore, adjust today's plan so it doesn't flare up", differences);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('allows injury-driven removals without explicit remove keywords for severe severity', () => {
      const differences = [{
        type: 'removed' as const,
        queueItemId: 'q2',
        queueItemName: 'Day 3',
        dayNumber: 3,
        exerciseName: 'Barbell Back Squat',
      }];

      const result = validateChanges('I tweaked my knee badly, I cannot do any painful leg work today', differences);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
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
