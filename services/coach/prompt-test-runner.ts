import {
  compareWorkoutQueues,
  differencesToProposedChanges,
  evaluateInjurySemanticOutcome,
  evaluatePromptIntentOutcome,
  evaluateVariantSemanticOutcome,
  validateChanges,
  validateQueueStructure,
} from '@/services/queue/diff';
import {
  extractTargetExerciseRefs,
  findExerciseByName,
  preprocessMuscleGroupRequest,
} from '@/services/queue/repair';
import { applyOperationContractResponse } from '@/services/coach/operation-response';
import { applyOperationIntentSafeguards } from '@/services/coach/operation-safeguards';
import {
  buildOperationContractPrompt,
  OPERATION_SYSTEM_PROMPT,
} from '@/services/coach/operation-prompt';
import { classifyCoachTestSuccess } from '@/lib/coach-test-classification';
import { inferInjurySeverity, inferRequestedVariant, type CoachProxyMessage } from '@/lib/coach-utils';
import type { ProposedChanges } from '@/services/queue/types';
import type { ExerciseVariant, ProgramExercise, WorkoutQueueItem } from '@/types';

export type CoachPromptCase = {
  type: string;
  prompt: string;
};

export type PromptResultStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'FAILED_PARSE'
  | 'NO_CHANGES'
  | 'NO_CHANGES_MODEL_NOOP'
  | 'NO_CHANGES_REPAIR_REVERTED'
  | 'STRUCTURE_VALIDATION_FAILED'
  | 'ERROR';

export type PromptRunResult = {
  type: string;
  prompt: string;
  status: PromptResultStatus;
  reasons: string[];
  latencyMs: number;
};

export type PromptSuiteSummary = {
  total: number;
  passed: number;
  failed: number;
  gatePassed: boolean;
};

export type PromptSuiteRun = {
  results: PromptRunResult[];
  summary: PromptSuiteSummary;
};

export type CanonicalFixtureExercise = {
  name: string;
  variant?: ExerciseVariant | null;
  reps: number[];
  weight: number[];
};

export type CanonicalFixtureDay = {
  id: string;
  dayNumber: number;
  exercises: CanonicalFixtureExercise[];
};

export const applyCanonicalSetCount = (
  exercise: CanonicalFixtureExercise,
  requestedSetCount: number
): CanonicalFixtureExercise => {
  const target = Math.max(1, Math.floor(requestedSetCount));
  const reps = [...exercise.reps];
  const weight = [...exercise.weight];

  if (reps.length !== weight.length) {
    throw new Error('Canonical fixture invariant failed: reps and weight lengths must match');
  }

  if (reps.length > target) {
    return {
      ...exercise,
      reps: reps.slice(0, target),
      weight: weight.slice(0, target),
    };
  }

  if (reps.length < target) {
    const lastReps = reps[reps.length - 1] ?? 0;
    const lastWeight = weight[weight.length - 1] ?? 0;
    while (reps.length < target) {
      reps.push(lastReps);
      weight.push(lastWeight);
    }
    return {
      ...exercise,
      reps,
      weight,
    };
  }

  return exercise;
};

const toProgramExercise = (
  exercise: CanonicalFixtureExercise,
  exerciseInstanceId: string
): ProgramExercise => {
  const exerciseData = findExerciseByName(exercise.name);

  return {
    exerciseInstanceId,
    name: exerciseData?.name ?? exercise.name,
    equipment: exerciseData?.equipment ?? '',
    muscle_groups_worked: exerciseData?.muscle_groups_worked ?? [],
    isCompound: exerciseData?.isCompound ?? false,
    variantOptions: exerciseData?.variantOptions,
    aliases: exerciseData?.aliases,
    variant: exercise.variant ?? null,
    weight: JSON.stringify(exercise.weight),
    reps: JSON.stringify(exercise.reps),
    sets: String(exercise.reps.length),
    restTime: '180',
    progression: '',
    hasCustomisedSets: true,
  };
};

export const materializeCanonicalFixtureQueue = (
  fixture: CanonicalFixtureDay[]
): WorkoutQueueItem[] => {
  return fixture.map((day, index) => ({
    id: day.id,
    programId: 'headless-fixture-program',
    programName: 'Headless Fixture Program',
    dayNumber: day.dayNumber,
    position: index,
    exercises: day.exercises.map((exercise, exerciseIndex) =>
      toProgramExercise(exercise, `${day.id}:e${exerciseIndex}`)
    ),
  }));
};

export type ExecutePromptInput = {
  promptCase: CoachPromptCase;
  queue: WorkoutQueueItem[];
};

export type ExecutePromptOutput = {
  status: Exclude<PromptResultStatus, 'ERROR'>;
  reasons?: string[];
  proposedChanges?: ProposedChanges;
};

export type RunCoachPromptSuiteArgs = {
  prompts: CoachPromptCase[];
  baseQueue: WorkoutQueueItem[];
  runPrompt: (input: ExecutePromptInput) => Promise<ExecutePromptOutput>;
  onResult?: (result: PromptRunResult, index: number, total: number) => void;
};

export const runCoachPromptSuite = async ({
  prompts,
  baseQueue,
  runPrompt,
  onResult,
}: RunCoachPromptSuiteArgs): Promise<PromptSuiteRun> => {
  const results: PromptRunResult[] = [];

  for (const [index, promptCase] of prompts.entries()) {
    const startedAt = Date.now();
    try {
      const output = await runPrompt({ promptCase, queue: baseQueue });
      const result: PromptRunResult = {
        type: promptCase.type,
        prompt: promptCase.prompt,
        status: output.status,
        reasons: output.reasons ?? [],
        latencyMs: Date.now() - startedAt,
      };
      results.push(result);
      onResult?.(result, index, prompts.length);
    } catch (error) {
      const result: PromptRunResult = {
        type: promptCase.type,
        prompt: promptCase.prompt,
        status: 'ERROR',
        reasons: [error instanceof Error ? error.message : String(error)],
        latencyMs: Date.now() - startedAt,
      };
      results.push(result);
      onResult?.(result, index, prompts.length);
    }
  }

  const passed = results.filter((result) => result.status === 'SUCCESS').length;
  return {
    results,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      gatePassed: passed === results.length,
    },
  };
};

const parseNumericArray = (value: string): number[] | null => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return null;
    const numbers = parsed.map((entry) => Number(entry));
    if (numbers.some((entry) => !Number.isFinite(entry))) return null;
    return numbers;
  } catch {
    return null;
  }
};

const scalarizeQueueForTransport = (queue: WorkoutQueueItem[]): WorkoutQueueItem[] => {
  return queue.map((item) => ({
    ...item,
    exercises: item.exercises.map((exercise) => {
      if (!exercise.hasCustomisedSets) return exercise;

      const repsArray = parseNumericArray(exercise.reps);
      const weightArray = parseNumericArray(exercise.weight);
      if (!repsArray || !weightArray || repsArray.length === 0 || repsArray.length !== weightArray.length) {
        return exercise;
      }

      return {
        ...exercise,
        reps: String(repsArray[0]),
        weight: String(weightArray[0]),
        sets: String(repsArray.length),
        hasCustomisedSets: false,
      };
    }),
  }));
};

export type PromptExecutionDeps = {
  callCoachProxy: (messages: CoachProxyMessage[]) => Promise<string>;
};

export const executePromptThroughCoachPipeline = async (
  deps: PromptExecutionDeps,
  promptCase: CoachPromptCase,
  queue: WorkoutQueueItem[]
): Promise<ExecutePromptOutput> => {
  const transportQueue = scalarizeQueueForTransport(queue);

  const {
    processedRequest,
    wasProcessed,
    matchedExerciseRefs,
    muscleGroupDetected,
    noMatchesFound,
  } = preprocessMuscleGroupRequest(promptCase.prompt, transportQueue);

  if (noMatchesFound && muscleGroupDetected) {
    return { status: 'FAILED', reasons: [`No ${muscleGroupDetected} exercises`] };
  }

  const targetedExercises =
    wasProcessed && matchedExerciseRefs.length > 0
      ? matchedExerciseRefs
      : extractTargetExerciseRefs(promptCase.prompt, transportQueue);

  const messages: CoachProxyMessage[] = [
    { role: 'system', content: OPERATION_SYSTEM_PROMPT },
    { role: 'user', content: buildOperationContractPrompt(processedRequest, transportQueue, targetedExercises) },
  ];

  const generatedText = await deps.callCoachProxy(messages);
  const operationResult = applyOperationContractResponse(
    generatedText,
    transportQueue,
    findExerciseByName
  );

  if (operationResult.kind === 'invalid_contract') {
    return {
      status: 'FAILED_PARSE',
      reasons: [`Operation contract validation failed: ${operationResult.errors.join(' ')}`],
    };
  }

  if (operationResult.kind === 'not_applicable') {
    return {
      status: 'STRUCTURE_VALIDATION_FAILED',
      reasons: [`Unable to apply operation target(s): ${operationResult.errors.join(' ')}`],
    };
  }

  const evaluationRequest = wasProcessed ? processedRequest : promptCase.prompt;
  const parsedQueue = applyOperationIntentSafeguards({
    request: evaluationRequest,
    parsedQueue: operationResult.updatedQueue,
    targetedExercises,
  });

  const structureValidation = validateQueueStructure(transportQueue, parsedQueue);
  if (!structureValidation.valid) {
    return { status: 'STRUCTURE_VALIDATION_FAILED', reasons: structureValidation.errors };
  }

  const differences = compareWorkoutQueues(transportQueue, parsedQueue);
  if (differences.length === 0) {
    return {
      status: 'NO_CHANGES_MODEL_NOOP',
      reasons: ['No changes detected: model operations produced an unchanged queue'],
    };
  }

  const proposedChanges = differencesToProposedChanges(differences);
  const validation = validateChanges(evaluationRequest, differences);
  const isVariantTest = promptCase.type.startsWith('Variant -');
  const isInjuryTest = promptCase.type.startsWith('Injury -');

  let semanticResult: { passed: boolean; reason?: string } = { passed: true };
  if (isVariantTest) {
    semanticResult = evaluateVariantSemanticOutcome(
      evaluationRequest,
      transportQueue,
      parsedQueue,
      targetedExercises,
      inferRequestedVariant(promptCase.prompt) ?? ''
    );
  } else if (isInjuryTest) {
    const severity = inferInjurySeverity(promptCase.type);
    semanticResult = evaluateInjurySemanticOutcome(
      severity ? `${severity} injury: ${evaluationRequest}` : evaluationRequest,
      transportQueue,
      parsedQueue,
      targetedExercises.map((exercise) => exercise.displayName)
    );
  }

  const deterministicIntentResult =
    !isVariantTest && !isInjuryTest
      ? evaluatePromptIntentOutcome(evaluationRequest, transportQueue, parsedQueue, targetedExercises)
      : { passed: true };

  const success = classifyCoachTestSuccess({
    hasWarnings: !validation.valid,
    semanticPassed: semanticResult.passed,
    deterministicIntentPassed: deterministicIntentResult.passed,
  });

  return {
    status: success ? 'SUCCESS' : 'FAILED',
    reasons: [
      ...(!validation.valid ? [validation.warnings.join('; ')] : []),
      ...(semanticResult.passed ? [] : [semanticResult.reason ?? 'Semantic validation failed']),
      ...(deterministicIntentResult.passed
        ? []
        : [deterministicIntentResult.reason ?? 'Intent mismatch']),
    ],
    proposedChanges,
  };
};
