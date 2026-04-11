/**
 * Shared type definitions for the Gym App
 */

// =============================================================================
// EXERCISE TYPES
// =============================================================================

/**
 * Base exercise interface from the exercise database
 */
export type ExerciseVariantField = 'angle' | 'grip' | 'posture' | 'laterality';

export interface ExerciseVariant {
  angle?: string;
  grip?: string;
  posture?: string;
  laterality?: string;
  extras?: string[];
}

export interface ExerciseVariantOption {
  label: string;
  field?: ExerciseVariantField;
  value?: string;
  aliases?: string[];
}

export interface Exercise {
  name: string;
  equipment: string;
  muscle_groups_worked: string[];
  isCompound: boolean;
  variantOptions?: ExerciseVariantOption[];
  aliases?: string[];
}

/**
 * Exercise with program-specific data (sets, reps, weight, etc.)
 */
export interface ProgramExercise extends Exercise {
  exerciseInstanceId?: string;
  variant?: ExerciseVariant | null;
  weight: string;
  reps: string;
  sets: string;
  restTime: string;
  progression: string;
  hasCustomisedSets: boolean;
  // Double progression fields
  repRangeMin?: number;
  repRangeMax?: number;
  progressionThreshold?: number;
  timesRepsHitInARow?: number;
}

/**
 * Exercise with logged values from a completed workout
 */
export interface WorkoutExercise extends ProgramExercise {
  loggedWeight: number;
  loggedReps: number;
  loggedSetWeights: number[];
  loggedSetReps: number[];
}

// =============================================================================
// PROGRAM TYPES
// =============================================================================

/**
 * A single workout day within a program
 */
export interface WorkoutDay {
  dayNumber: number;
  exercises: ProgramExercise[];
}

/**
 * A workout program containing multiple workout days
 */
export interface Program {
  id: string;
  name: string;
  workoutDays: WorkoutDay[];
  createdAt: string;
  updatedAt?: string;
}

/**
 * A program draft without timestamps, used for creating and editing programs.
 * Shared between Coach.tsx, program-draft.ts, and program-draft-validator.ts.
 */
export type DraftProgram = Omit<Program, 'createdAt' | 'updatedAt'>;

// =============================================================================
// WORKOUT TYPES
// =============================================================================

/**
 * A completed workout session
 */
export interface Workout {
  id: string;
  date: string;
  programId: string;
  programName: string;
  dayNumber: number;
  exercises: WorkoutExercise[];
  completed: boolean;
  duration?: number; // Duration in seconds
  notes?: string;
}

// =============================================================================
// WORKOUT QUEUE TYPES
// =============================================================================

/**
 * A workout item in the queue (upcoming workouts)
 */
export interface WorkoutQueueItem {
  id: string;
  programId: string;
  programName: string;
  dayNumber: number;
  exercises: ProgramExercise[];
  scheduledDate?: string;
  position: number; // Position in the queue
}

// =============================================================================
// USER PREFERENCES TYPES
// =============================================================================

/**
 * User preferences and settings
 */
export interface UserPreferences {
  id: string;
  currentProgramId: string | null;
  weightUnit: 'kg' | 'lbs';
  theme: 'light' | 'dark' | 'system';
  queueSize: number;
  restTimerEnabled: boolean;
  hapticFeedbackEnabled: boolean;
}

// =============================================================================
// USER PROFILE TYPES
// =============================================================================

/**
 * Training goals available for selection
 */
export enum TrainingGoal {
  Strength = 'strength',
  Hypertrophy = 'hypertrophy',
  ImproveOverallHealth = 'improve_overall_health',
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * User profile information for training preferences
 */
export interface UserProfile {
  id: string;
  name: string | null;
  currentWeight: number | null;
  goalWeight: number | null;
  trainingGoal: TrainingGoal | null;
  targetSetsPerWeek: number | null;
  experienceLevel: ExperienceLevel | null;
  trainingDaysPerWeek: number | null;
  sessionDurationMinutes: number | null;
}

/**
 * Per-muscle group target sets override
 */
export interface MuscleGroupTarget {
  muscleGroup: string;
  targetSets: number;
}

// =============================================================================
// VIEW/UI TYPES
// =============================================================================

/**
 * View modes for the Programs screen
 */
export enum ProgramViewMode {
  List = 'list',
  Create = 'create',
  View = 'view',
  Edit = 'edit',
}

/**
 * View modes for the Coach screen
 */
export enum CoachMode {
  Chat = 'chat',
  ModifyWorkout = 'modify_workout',
  GenerateProgram = 'generate_program',
}

/**
 * Create step enum for program creation wizard
 */
export enum CreateProgramStep {
  BasicInfo = 0,
  ExerciseSelection = 1,
  Configuration = 2,
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

