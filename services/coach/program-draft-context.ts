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
  }));

  return {
    profile: resolvedProfile,
    allowedExerciseNames: allowedExercises.map((exercise) => exercise.name),
    allowedExercises,
  };
};

