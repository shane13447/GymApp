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

/**
 * Returns progression defaults based on experience level.
 */
const getProgressionDefaults = (level: ExperienceLevel) => {
  switch (level) {
    case 'beginner':
      return {
        compoundBarbell: 2.5,
        compoundDumbbell: 4,
        isolationBarbell: 1.25,
        isolationDumbbell: 2.5,
        threshold: 0, // Linear progression — increase every session
      };
    case 'intermediate':
      return {
        compoundBarbell: 2.5,
        compoundDumbbell: 4,
        isolationBarbell: 1.25,
        isolationDumbbell: 2.5,
        threshold: 1, // Hit max reps once to progress
      };
    case 'advanced':
      return {
        compoundBarbell: 2.5,
        compoundDumbbell: 4,
        isolationBarbell: 1.25,
        isolationDumbbell: 2.5,
        threshold: 3, // Hit max reps 3 sessions to progress
      };
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

