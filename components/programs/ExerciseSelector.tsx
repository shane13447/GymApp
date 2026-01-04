/**
 * Exercise Selector Component
 * Displays exercises grouped by muscle group for selection
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import type { Exercise, ProgramExercise } from '@/types';
import { EXERCISE_DEFAULTS } from '@/constants';

interface ExerciseSelectorProps {
  exercises: Exercise[];
  selectedExercises: ProgramExercise[];
  onToggleExercise: (exercise: Exercise) => void;
}

interface MuscleGroupData {
  muscleGroup: string;
  exercises: Exercise[];
}

export const ExerciseSelector = memo(function ExerciseSelector({
  exercises,
  selectedExercises,
  onToggleExercise,
}: ExerciseSelectorProps) {
  // Group exercises by muscle group
  const exercisesByMuscleGroup = useMemo(() => {
    const grouped: Record<string, Exercise[]> = {};
    
    exercises.forEach((exercise) => {
      exercise.muscle_groups_worked.forEach((muscleGroup) => {
        if (!grouped[muscleGroup]) {
          grouped[muscleGroup] = [];
        }
        // Avoid duplicates
        if (!grouped[muscleGroup].some((ex) => ex.name === exercise.name)) {
          grouped[muscleGroup].push(exercise);
        }
      });
    });

    // Convert to array and sort
    return Object.entries(grouped)
      .map(([muscleGroup, exs]) => ({
        muscleGroup,
        exercises: exs,
      }))
      .sort((a, b) => a.muscleGroup.localeCompare(b.muscleGroup));
  }, [exercises]);

  const isSelected = useCallback(
    (exerciseName: string) => {
      return selectedExercises.some((e) => e.name === exerciseName);
    },
    [selectedExercises]
  );

  return (
    <ThemedView className="gap-3">
      <ThemedText className="text-base font-semibold">
        Select Exercises by Muscle Group
      </ThemedText>
      <View className="gap-3">
        {exercisesByMuscleGroup.map((item) => (
          <ThemedView key={item.muscleGroup} className="mb-1">
            <Collapsible
              title={`${item.muscleGroup.charAt(0).toUpperCase() + item.muscleGroup.slice(1)} (${item.exercises.length})`}
            >
              <View className="gap-2 mt-2">
                {item.exercises.map((exercise) => {
                  const selected = isSelected(exercise.name);
                  return (
                    <Pressable
                      key={exercise.name}
                      onPress={() => onToggleExercise(exercise)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={exercise.name}
                    >
                      {({ pressed }) => (
                        <View
                          className={`p-3 rounded-lg border-2 ${
                            selected
                              ? 'bg-blue-100 dark:bg-blue-900 border-blue-500'
                              : pressed
                              ? 'bg-gray-100 dark:bg-gray-700 border-gray-400'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                          }`}
                          style={pressed && !selected ? { opacity: 0.8 } : {}}
                        >
                          <View className="flex-row items-center justify-between">
                            <ThemedText
                              className="font-bold text-base flex-1"
                              numberOfLines={1}
                            >
                              {exercise.name}
                            </ThemedText>
                            <View
                              className={`ml-3 w-6 h-6 rounded-full border-2 items-center justify-center flex-shrink-0 ${
                                selected
                                  ? 'bg-blue-500 border-blue-600'
                                  : 'border-gray-400 bg-gray-50 dark:bg-gray-700'
                              }`}
                            >
                              {selected && (
                                <ThemedText className="text-white text-xs font-bold">
                                  ✓
                                </ThemedText>
                              )}
                            </View>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </Collapsible>
          </ThemedView>
        ))}
      </View>
    </ThemedView>
  );
});

/**
 * Create a ProgramExercise from a base Exercise with defaults
 */
export const createProgramExercise = (exercise: Exercise): ProgramExercise => ({
  ...exercise,
  weight: EXERCISE_DEFAULTS.weight,
  reps: EXERCISE_DEFAULTS.reps,
  sets: EXERCISE_DEFAULTS.sets,
  restTime: EXERCISE_DEFAULTS.restTime,
  progression: EXERCISE_DEFAULTS.progression,
});

export default ExerciseSelector;
