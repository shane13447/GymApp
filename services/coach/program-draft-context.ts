import { PROGRAM_GENERATION_DEFAULTS } from '@/constants/program-generation-defaults';
import type { ExperienceLevel, TrainingGoal } from '@/types';

type DraftProfileInput = {
  experienceLevel: ExperienceLevel | null;
  trainingDaysPerWeek: number | null;
  sessionDurationMinutes: number | null;
  trainingGoal?: TrainingGoal | null;
};

type CatalogExercise = {
  name: string;
  equipment: string;
  muscle_groups_worked: string[];
  isCompound: boolean;
  variantOptions?: { label: string; field?: string; value?: string }[];
  aliases?: string[];
};

export type ProgramDraftContext = {
  profile: {
    experienceLevel: ExperienceLevel;
    trainingDaysPerWeek: number;
    sessionDurationMinutes: number;
    trainingGoal: TrainingGoal | null;
  };
  allowedExerciseNames: string[];
  allowedExercises: CatalogExercise[];
  progressionDefaults: {
    compoundBarbell: number;
    compoundDumbbell: number;
    isolationBarbell: number;
    isolationDumbbell: number;
    threshold: number;
  };
};

/** Progression increments (per equipment class) and rep-hit threshold. */
interface ProgressionDefaults {
  compoundBarbell: number;
  compoundDumbbell: number;
  isolationBarbell: number;
  isolationDumbbell: number;
  threshold: number;
}

/**
 * Returns progression defaults for an experience level. Only the rep-hit
 * `threshold` varies by level; the per-equipment increments are constant.
 * Falls back to the intermediate threshold for any unrecognised level so the
 * function always returns a fully-populated object (it feeds the
 * non-optional `progression_defaults` LLM input).
 * @param {ExperienceLevel} level - The lifter's experience level.
 * @returns {ProgressionDefaults} The progression increments and threshold.
 */
const getProgressionDefaults = (level: ExperienceLevel): ProgressionDefaults => {
  const increments = {
    compoundBarbell: 2.5,
    compoundDumbbell: 4,
    isolationBarbell: 1.25,
    isolationDumbbell: 2.5,
  };

  switch (level) {
    case 'beginner':
      return { ...increments, threshold: 0 }; // Linear progression — increase every session
    case 'advanced':
      return { ...increments, threshold: 3 }; // Hit max reps 3 sessions to progress
    case 'intermediate':
    default:
      return { ...increments, threshold: 1 }; // Hit max reps once to progress
  }
};

export const buildProgramDraftContext = (
  profile: DraftProfileInput,
  exerciseCatalog: CatalogExercise[],
): ProgramDraftContext => {
  const resolvedProfile = {
    experienceLevel: profile.experienceLevel ?? PROGRAM_GENERATION_DEFAULTS.experienceLevel,
    trainingDaysPerWeek: profile.trainingDaysPerWeek ?? PROGRAM_GENERATION_DEFAULTS.trainingDaysPerWeek,
    sessionDurationMinutes: profile.sessionDurationMinutes ?? PROGRAM_GENERATION_DEFAULTS.sessionDurationMinutes,
    trainingGoal: profile.trainingGoal ?? null,
  };

  const allowedExercises = exerciseCatalog.map((exercise) => ({
    name: exercise.name,
    equipment: exercise.equipment,
    muscle_groups_worked: exercise.muscle_groups_worked,
    isCompound: exercise.isCompound,
    variantOptions: exercise.variantOptions,
    aliases: exercise.aliases,
  }));

  return {
    profile: resolvedProfile,
    allowedExerciseNames: allowedExercises.map((exercise) => exercise.name),
    allowedExercises,
    progressionDefaults: getProgressionDefaults(resolvedProfile.experienceLevel),
  };
};

