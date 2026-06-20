import type { DraftProgram, Exercise, ExerciseVariant, ProgramExercise, WorkoutDay } from '@/types';
import exerciseSelectionCatalog from '@/data/exerciseSelection.json';
import { getDefaultVariantForExercise, parseExerciseCatalog } from '@/services/catalog/parse-catalog';

type DraftValidationSuccess = {
  ok: true;
  value: DraftProgram;
};

type DraftValidationFailure = {
  ok: false;
  error: string;
};

export type DraftValidationResult = DraftValidationSuccess | DraftValidationFailure;

/**
 * Type guard for a plain (non-array) object record.
 *
 * @param {unknown} value - The value to test.
 * @returns {boolean} True if the value is a non-null, non-array object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Coerce a value to a numeric string, accepting non-empty strings and finite
 * numbers and otherwise returning a fallback.
 *
 * @param {unknown} value - The value to coerce.
 * @param {string} fallback - The fallback string when coercion is not possible.
 * @returns {string} The coerced numeric string, or the fallback.
 */
const toNumericString = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
};

/**
 * Coerce a value to a progression string, returning an empty string for
 * non-positive values and the fallback when the input is not numeric.
 *
 * @param {unknown} value - The value to coerce.
 * @param {string} fallback - The fallback string when coercion is not possible.
 * @returns {string} The progression string ('' when not positive).
 */
const toProgressionString = (value: unknown, fallback: string): string => {
  const numericString = toNumericString(value, fallback);
  const parsed = Number(numericString);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed > 0 ? numericString : '';
};

/**
 * Coerce a value to a boolean, returning the fallback for non-boolean inputs.
 *
 * @param {unknown} value - The value to coerce.
 * @param {boolean} fallback - The fallback boolean.
 * @returns {boolean} The boolean value, or the fallback.
 */
const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
};

/**
 * Coerce a value to a positive integer, accepting positive integer numbers and
 * numeric strings and otherwise returning a fallback.
 *
 * @param {unknown} value - The value to coerce.
 * @param {number} fallback - The fallback integer.
 * @returns {number} The positive integer, or the fallback.
 */
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
const parsedCatalog = parseExerciseCatalog(exerciseSelectionCatalog as unknown[]);
const catalogByName = new Map<string, Exercise>();
for (const entry of parsedCatalog) {
  catalogByName.set(entry.name.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) {
    catalogByName.set(alias.toLowerCase(), entry);
  }
}

/**
 * Normalise a raw variant against a catalog entry's variant options, starting
 * from the entry's default variant and overriding fields whose raw value
 * matches a recognised option value/label/alias.
 *
 * @param {unknown} rawVariant - The raw variant value from the draft.
 * @param {Exercise} catalogEntry - The catalog exercise providing valid variant options.
 * @returns {ExerciseVariant | null} The normalised variant, or null when the exercise has no variants.
 */
const normalizeVariant = (rawVariant: unknown, catalogEntry: Exercise): ExerciseVariant | null => {
  const defaultVariant = getDefaultVariantForExercise(catalogEntry.variantOptions);
  if (!catalogEntry.variantOptions || catalogEntry.variantOptions.length === 0 || !defaultVariant) {
    return null;
  }

  const normalizedVariant: ExerciseVariant = { ...defaultVariant };
  if (!isRecord(rawVariant)) {
    return normalizedVariant;
  }

  for (const option of catalogEntry.variantOptions) {
    if (!option.field || !option.value) {
      continue;
    }

    const rawValue = rawVariant[option.field];
    if (typeof rawValue !== 'string') {
      continue;
    }

    const normalizedRawValue = rawValue.trim().toLowerCase();
    const acceptedValues = [
      option.value,
      option.label,
      ...(option.aliases ?? []),
    ].map((value) => value.toLowerCase());

    if (acceptedValues.includes(normalizedRawValue)) {
      normalizedVariant[option.field] = option.value;
    }
  }

  return normalizedVariant;
};

/**
 * Build a stable de-duplication key for an exercise from its name and variant
 * (sorted variant entries), so the same name/variant pair collides.
 *
 * @param {ProgramExercise} exercise - The exercise to key.
 * @returns {string} A stable name+variant key.
 */
const getExerciseVariantKey = (exercise: ProgramExercise): string => {
  const variant = exercise.variant;
  if (!variant) {
    return `${exercise.name.toLowerCase()}:default`;
  }

  return `${exercise.name.toLowerCase()}:${JSON.stringify(Object.entries(variant).sort())}`;
};

/**
 * Validate and normalise a raw draft exercise against the catalog, using
 * catalog data as the authority for identity metadata and coercing the
 * remaining numeric/boolean/variant fields. Returns null when the exercise is
 * unnamed, not in the catalog, or missing required catalog metadata.
 *
 * @param {unknown} rawExercise - The raw exercise object from the draft.
 * @returns {ProgramExercise | null} The normalised exercise, or null if invalid.
 */
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
  if (!catalogEntry) {
    return null;
  }

  // Use catalog data as the authority for identity metadata.
  const equipment = catalogEntry.equipment;
  const muscleGroupsWorked = catalogEntry.muscle_groups_worked;
  const isCompound = catalogEntry.isCompound;

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
    name: catalogEntry.name,
    equipment,
    muscle_groups_worked: muscleGroupsWorked,
    isCompound,
    weight: toNumericString(rawExercise.weight, '0'),
    reps: toNumericString(rawExercise.reps, '10'),
    sets: toNumericString(rawExercise.sets, '3'),
    restTime: toNumericString(rawExercise.restTime ?? rawExercise.rest, '120'),
    progression: toProgressionString(rawExercise.progression, '2.5'),
    hasCustomisedSets: toBoolean(rawExercise.hasCustomisedSets, false),
    variant: normalizeVariant(rawExercise.variant, catalogEntry),
    variantOptions: catalogEntry.variantOptions,
    aliases: catalogEntry.aliases,
    repRangeMin,
    repRangeMax,
    progressionThreshold,
    timesRepsHitInARow: 0,
  };
};

/**
 * Validate and normalise a raw draft workout day, normalising each exercise and
 * dropping invalid or duplicate (by name/variant) exercises. Returns null when
 * the day has no valid exercises.
 *
 * @param {unknown} rawDay - The raw workout day object from the draft.
 * @param {number} index - The zero-based day index, used to default the day number.
 * @returns {WorkoutDay | null} The normalised workout day, or null if invalid/empty.
 */
const normalizeWorkoutDay = (rawDay: unknown, index: number): WorkoutDay | null => {
  if (!isRecord(rawDay) || !Array.isArray(rawDay.exercises)) {
    return null;
  }

  const seenExerciseVariants = new Set<string>();
  const exercises = rawDay.exercises
    .map((exercise) => normalizeExercise(exercise))
    .filter((exercise): exercise is ProgramExercise => {
      if (exercise === null) {
        return false;
      }

      const variantKey = getExerciseVariantKey(exercise);
      if (seenExerciseVariants.has(variantKey)) {
        return false;
      }

      seenExerciseVariants.add(variantKey);
      return true;
    });

  if (exercises.length === 0) {
    return null;
  }

  return {
    dayNumber: toPositiveInteger(rawDay.dayNumber, index + 1),
    exercises,
  };
};

/**
 * Coerce draft input into a parsed object, JSON-parsing strings (returning null
 * on parse failure) and passing through non-string input unchanged.
 *
 * @param {unknown} input - The raw draft input (string JSON or object).
 * @returns {unknown} The parsed object, the original non-string input, or null on parse failure.
 */
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
 * Unknown top-level keys (e.g. "version", "notes") are silently stripped rather
 * than causing draft rejection.  Only {id, name, workoutDays} are carried into
 * the validated result; everything else is ignored so the validator tolerates
 * LLM output variability.
 */
const KNOWN_TOP_LEVEL_KEYS = new Set(['id', 'name', 'workoutDays']);

/**
 * Validate and repair a program draft (object or JSON string): strip unknown
 * top-level keys, normalise/filter workout days, and supply default id and name.
 *
 * @param {unknown} input - The raw program draft.
 * @returns {DraftValidationResult} A success result with the repaired program, or a failure with an error message.
 */
export const validateAndRepairProgramDraft = (input: unknown): DraftValidationResult => {
  const parsed = parseDraftInput(input);

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Program draft must be a JSON object' };
  }

  if (!Array.isArray(parsed.workoutDays) || parsed.workoutDays.length === 0) {
    return { ok: false, error: 'Program draft must include non-empty workoutDays' };
  }

  const unknownTopLevelKeys = Object.keys(parsed).filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key));
  if (unknownTopLevelKeys.length > 0) {
    for (const key of unknownTopLevelKeys) {
      delete parsed[key];
    }
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

/**
 * Validate a raw coach response string as a program draft.
 *
 * @param {string} responseText - The raw response text expected to contain a program draft.
 * @returns {DraftValidationResult} The validation/repair result.
 */
export const validateProgramDraftResponse = (responseText: string): DraftValidationResult =>
  validateAndRepairProgramDraft(responseText);
