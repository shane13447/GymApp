import { PROGRAM_GENERATION_DEFAULTS } from '@/constants/program-generation-defaults';
import exerciseSelectionCatalog from '@/data/exerciseSelection.json';
import { buildProgramDraftContext } from '@/services/coach/program-draft-context';
import { buildProgramDraftSystemPrompt } from '@/services/coach/program-draft-prompt';
import { validateAndRepairProgramDraft } from '@/services/coach/program-draft-validator';
import type { ExperienceLevel, Program, ProgramExercise, TrainingGoal, WorkoutDay } from '@/types';

type DraftInput = {
  experienceLevel: ExperienceLevel | null;
  trainingDaysPerWeek: number | null;
  sessionDurationMinutes: number | null;
  trainingGoal?: TrainingGoal | null;
};

type ResolvedDraftInput = {
  experienceLevel: ExperienceLevel;
  trainingDaysPerWeek: number;
  sessionDurationMinutes: number;
  trainingGoal: TrainingGoal | null;
};

export type ProgramDraftLLMInput = {
  profile: ResolvedDraftInput;
  allowed_exercises: {
    name: string;
    equipment: string;
    muscle_groups_worked: string[];
    isCompound: boolean;
  }[];
  output_schema_version: 1;
};

const resolveDraftInputs = (input: DraftInput): ResolvedDraftInput => ({
  experienceLevel: input.experienceLevel ?? PROGRAM_GENERATION_DEFAULTS.experienceLevel,
  trainingDaysPerWeek: input.trainingDaysPerWeek ?? PROGRAM_GENERATION_DEFAULTS.trainingDaysPerWeek,
  sessionDurationMinutes: input.sessionDurationMinutes ?? PROGRAM_GENERATION_DEFAULTS.sessionDurationMinutes,
  trainingGoal: input.trainingGoal ?? null,
});

const buildExercise = (overrides: Partial<ProgramExercise>): ProgramExercise => ({
  name: 'Barbell Bench Press',
  equipment: 'Barbell',
  muscle_groups_worked: ['chest', 'triceps', 'shoulders'],
  isCompound: true,
  weight: '60',
  reps: '10',
  sets: '3',
  restTime: '120',
  progression: '2.5',
  hasCustomisedSets: false,
  ...overrides,
});

export const buildProgramDraftRequest = (input: DraftInput): { prompt: string; llmInput: ProgramDraftLLMInput } => {
  const resolved = resolveDraftInputs(input);
  const context = buildProgramDraftContext(resolved, exerciseSelectionCatalog);

  return {
    prompt: buildProgramDraftSystemPrompt(context.profile.trainingGoal),
    llmInput: {
      profile: context.profile,
      allowed_exercises: context.allowedExercises,
      output_schema_version: 1,
    },
  };
};

export const prepareProgramDraftFromModelResponse = (responseText: string): Omit<Program, 'createdAt' | 'updatedAt'> => {
  const validatedDraft = validateAndRepairProgramDraft(responseText);

  if (!validatedDraft.ok) {
    throw new Error(`Program draft was not ingestible: ${validatedDraft.error}`);
  }

  return validatedDraft.value;
};

export const generateProgramDraft = (input: DraftInput): Omit<Program, 'createdAt' | 'updatedAt'> => {
  const resolved = resolveDraftInputs(input);

  const exerciseCountByDuration = resolved.sessionDurationMinutes <= 45 ? 4 : resolved.sessionDurationMinutes <= 75 ? 5 : 6;
  const progressionByExperience: Record<ExperienceLevel, string> = {
    beginner: '2.5',
    intermediate: '2.5',
    advanced: '1.25',
  };

  const goalReps = resolved.trainingGoal === 'strength' ? '5' : '10';
  const goalRestTime = resolved.trainingGoal === 'hypertrophy' ? '180' : '120';

  const baseExercises: ProgramExercise[] = [
    buildExercise({ name: 'Barbell Bench Press', progression: progressionByExperience[resolved.experienceLevel], reps: goalReps, restTime: goalRestTime }),
    buildExercise({ name: 'Lat Pulldowns', equipment: 'Cable', muscle_groups_worked: ['lats'], isCompound: true, reps: goalReps, restTime: goalRestTime }),
    buildExercise({ name: 'Barbell Back Squat', muscle_groups_worked: ['quads', 'glutes', 'hamstrings'], isCompound: true, reps: goalReps, restTime: goalRestTime }),
    buildExercise({ name: 'Romanian Deadlift', muscle_groups_worked: ['hamstrings', 'glutes'], isCompound: true, reps: goalReps, restTime: goalRestTime }),
    buildExercise({ name: 'Dumbbell Shoulder Press', equipment: 'Dumbbell', muscle_groups_worked: ['shoulders'], isCompound: true, reps: goalReps, restTime: goalRestTime }),
    buildExercise({ name: 'Dumbbell Flyes', equipment: 'Dumbbell', muscle_groups_worked: ['chest'], isCompound: false, reps: goalReps, restTime: goalRestTime }),
  ];

  const workoutDays: WorkoutDay[] = Array.from({ length: resolved.trainingDaysPerWeek }, (_, index) => ({
    dayNumber: index + 1,
    exercises: baseExercises.slice(0, exerciseCountByDuration).map((exercise) => ({ ...exercise })),
  }));

  return {
    id: `draft-program-${Date.now()}`,
    name: 'Draft Program',
    workoutDays,
  };
};
