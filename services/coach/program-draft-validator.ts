import type { Program, ProgramExercise, WorkoutDay } from '@/types';
import exerciseSelectionCatalog from '@/data/exerciseSelection.json';

type DraftProgram = Omit<Program, 'createdAt' | 'updatedAt'>;

type DraftValidationSuccess = {
  ok: true;
  value: DraftProgram;
};

type DraftValidationFailure = {
  ok: false;
  error: string;
};

export type DraftValidationResult = DraftValidationSuccess | DraftValidationFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumericString = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
};

const toPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
};

/**
 * Build a lookup map from the exercise catalog for O(1) lookups by name (case-insensitive).
 */
const catalogByName = new Map<string, typeof exerciseSelectionCatalog[number]>();
for (const entry of exerciseSelectionCatalog) {
  catalogByName.set(entry.name.toLowerCase(), entry);
}

const normalizeExercise = (rawExercise: unknown): ProgramExercise | null => {
  if (!isRecord(rawExercise)) {
    return null;
  }

  const name = typeof rawExercise.name === 'string' ? rawExercise.name.trim() : null;
  if (!name) {
    return null;
  }

  // Look up the exercise from the catalog by name (case-insensitive)
  const catalogEntry = catalogByName.get(name.toLowerCase());

  // Use catalog data for missing fields
  const equipment = typeof rawExercise.equipment === 'string'
    ? rawExercise.equipment
    : catalogEntry?.equipment ?? null;
  const muscleGroupsWorked = Array.isArray(rawExercise.muscle_groups_worked)
    ? rawExercise.muscle_groups_worked.filter((group): group is string => typeof group === 'string')
    : catalogEntry?.muscle_groups_worked ?? null;
  const isCompound = typeof rawExercise.isCompound === 'boolean'
    ? rawExercise.isCompound
    : catalogEntry?.isCompound ?? null;

  if (!equipment || !muscleGroupsWorked || muscleGroupsWorked.length === 0 || isCompound === null) {
    return null;
  }

  // Parse double progression fields (optional)
  const repRangeMin = typeof rawExercise.repRangeMin === 'number' && Number.isInteger(rawExercise.repRangeMin)
    ? rawExercise.repRangeMin
    : typeof rawExercise.repRangeMin === 'string'
      ? parseInt(rawExercise.repRangeMin, 10) || undefined
      : undefined;
  const repRangeMax = typeof rawExercise.repRangeMax === 'number' && Number.isInteger(rawExercise.repRangeMax)
    ? rawExercise.repRangeMax
    : typeof rawExercise.repRangeMax === 'string'
      ? parseInt(rawExercise.repRangeMax, 10) || undefined
      : undefined;
  const progressionThreshold = typeof rawExercise.progressionThreshold === 'number' && Number.isInteger(rawExercise.progressionThreshold)
    ? rawExercise.progressionThreshold
    : typeof rawExercise.progressionThreshold === 'string'
      ? parseInt(rawExercise.progressionThreshold, 10) || undefined
      : undefined;

  return {
    name,
    equipment,
    muscle_groups_worked: muscleGroupsWorked,
    isCompound,
    weight: toNumericString(rawExercise.weight, '0'),
    reps: toNumericString(rawExercise.reps, '10'),
    sets: toNumericString(rawExercise.sets, '3'),
    restTime: toNumericString(rawExercise.restTime ?? rawExercise.rest, '120'),
    progression: toNumericString(rawExercise.progression, '2.5'),
    hasCustomisedSets: toBoolean(rawExercise.hasCustomisedSets, false),
    repRangeMin,
    repRangeMax,
    progressionThreshold,
    timesRepsHitInARow: 0,
  };
};

const normalizeWorkoutDay = (rawDay: unknown, index: number): WorkoutDay | null => {
  if (!isRecord(rawDay) || !Array.isArray(rawDay.exercises)) {
    return null;
  }

  const exercises = rawDay.exercises
    .map((exercise) => normalizeExercise(exercise))
    .filter((exercise): exercise is ProgramExercise => exercise !== null);

  if (exercises.length === 0) {
    return null;
  }

  return {
    dayNumber: toPositiveInteger(rawDay.dayNumber, index + 1),
    exercises,
  };
};

const parseDraftInput = (input: unknown): unknown => {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  return input;
};

/**
 * BUG (ChatGPT audit): isAllowedTopLevelKey rejects any JSON key not in {id, name, workoutDays}.
 * If the LLM returns extra metadata (e.g., "version", "notes"), the draft is rejected entirely
 * rather than ignoring unknown keys. This makes the validator fragile against LLM output
 * variability. Fix: During the refactor, switch to ignoring unknown keys instead of rejecting,
 * or expand the allowlist to include known metadata fields.
 */
const isAllowedTopLevelKey = (key: string): boolean => {
  return key === 'id' || key === 'name' || key === 'workoutDays';
};

export const validateAndRepairProgramDraft = (input: unknown): DraftValidationResult => {
  const parsed = parseDraftInput(input);

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Program draft must be a JSON object' };
  }

  if (!Array.isArray(parsed.workoutDays) || parsed.workoutDays.length === 0) {
    return { ok: false, error: 'Program draft must include non-empty workoutDays' };
  }

  const unknownTopLevelKeys = Object.keys(parsed).filter((key) => !isAllowedTopLevelKey(key));
  if (unknownTopLevelKeys.length > 0) {
    return {
      ok: false,
      error: `Program draft contains unknown top-level keys: ${unknownTopLevelKeys.join(', ')}`,
    };
  }

  const workoutDays = parsed.workoutDays
    .map((rawDay: unknown, index: number) => normalizeWorkoutDay(rawDay, index))
    .filter((day: WorkoutDay | null): day is WorkoutDay => day !== null);

  if (workoutDays.length === 0) {
    return { ok: false, error: 'Program draft must contain at least one valid workout day' };
  }

  const id = typeof parsed.id === 'string' && parsed.id.length > 0 ? parsed.id : `draft-program-${Date.now()}`;
  const name = typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : 'Draft Program';

  return {
    ok: true,
    value: {
      id,
      name,
      workoutDays,
    },
  };
};

export const validateProgramDraftResponse = (responseText: string): DraftValidationResult =>
  validateAndRepairProgramDraft(responseText);
