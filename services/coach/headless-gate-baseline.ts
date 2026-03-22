import type { ExerciseVariant } from '@/types';
import type { CanonicalFixtureDay } from '@/services/coach/prompt-test-runner';

/**
 * Official headless gate baseline fixture approved for Task 11 Step 0.
 * Canonical format: reps[] and weight[] only (set count = array length).
 */
export const OFFICIAL_HEADLESS_GATE_BASELINE: CanonicalFixtureDay[] = [
  {
    id: 'q0',
    dayNumber: 1,
    exercises: [
      { name: 'Barbell Bench Press', variant: { angle: 'Flat' } as ExerciseVariant, reps: [5, 5, 5, 5, 5], weight: [92.5, 92.5, 92.5, 92.5, 92.5] },
      { name: 'Chest Press', variant: { angle: 'Incline' } as ExerciseVariant, reps: [11, 11, 11], weight: [74, 74, 74] },
      { name: 'Dumbbell Press', variant: { angle: 'Incline' } as ExerciseVariant, reps: [8, 8, 8, 8], weight: [34, 34, 34, 34] },
      { name: 'Overhead Barbell Press', variant: { posture: 'Standing' } as ExerciseVariant, reps: [6, 6, 6, 6], weight: [47.5, 47.5, 47.5, 47.5] },
      { name: 'Dumbbell Press', variant: { angle: 'Flat' } as ExerciseVariant, reps: [14, 14], weight: [28, 28] },
    ],
  },
  {
    id: 'q1',
    dayNumber: 2,
    exercises: [
      { name: 'Decline Crunches', variant: { angle: 'Decline' } as ExerciseVariant, reps: [20, 20, 20, 20], weight: [0, 0, 0, 0] },
      { name: 'Fingertip Curls', variant: { grip: 'Neutral Grip' } as ExerciseVariant, reps: [18, 18, 18], weight: [10, 10, 10] },
      { name: 'Hammer Curls', variant: { grip: 'Neutral Grip' } as ExerciseVariant, reps: [9, 9, 9, 9], weight: [20, 20, 20, 20] },
      { name: 'Reverse Grip Forearm Curls', variant: { grip: 'Reverse Grip' } as ExerciseVariant, reps: [16, 16, 16], weight: [12, 12, 12] },
      { name: 'One-Arm Dumbbell Row', variant: { laterality: 'One-Arm' } as ExerciseVariant, reps: [10, 10, 10, 10], weight: [36, 36, 36, 36] },
      { name: 'Triangle Rows', variant: { grip: 'Neutral Grip' } as ExerciseVariant, reps: [7, 7, 7, 7, 7], weight: [52, 52, 52, 52, 52] },
      { name: 'Lat Pulldowns', variant: { grip: 'Wide Grip' } as ExerciseVariant, reps: [8, 8, 8, 8], weight: [67, 67, 67, 67] },
      { name: 'Lat Pulldowns', variant: { grip: 'Close Grip' } as ExerciseVariant, reps: [12, 12, 12], weight: [59, 59, 59] },
    ],
  },
  {
    id: 'q2',
    dayNumber: 3,
    exercises: [
      { name: 'Barbell Back Squat', variant: { extras: ['High Bar'] } as ExerciseVariant, reps: [4, 4, 4, 4, 4], weight: [117.5, 117.5, 117.5, 117.5, 117.5] },
      { name: 'Leg Extensions', variant: { posture: 'Seated' } as ExerciseVariant, reps: [15, 15, 15], weight: [55, 55, 55] },
      { name: 'Calf Press', variant: { grip: 'Neutral' } as ExerciseVariant, reps: [12, 12, 12, 12, 12], weight: [160, 160, 160, 160, 160] },
      { name: 'Barbell Deadlift', variant: { extras: ['Conventional'] } as ExerciseVariant, reps: [3, 3, 3, 3, 3], weight: [135, 135, 135, 135, 135] },
      { name: 'Bent Over Barbell Row', variant: { grip: 'Overhand' } as ExerciseVariant, reps: [6, 6, 6, 6], weight: [82.5, 82.5, 82.5, 82.5] },
      { name: 'Chest-Supported Dumbbell Row', variant: { posture: 'Supported' } as ExerciseVariant, reps: [13, 13, 13], weight: [30, 30, 30] },
      { name: 'Overhead Barbell Press', variant: { posture: 'Seated' } as ExerciseVariant, reps: [12, 12], weight: [42.5, 42.5] },
    ],
  },
];
