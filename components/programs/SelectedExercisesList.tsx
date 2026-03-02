/**
 * Selected Exercises List Component
 * Displays selected exercises for a workout day with remove option
 */

import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatExerciseDisplayName } from '@/lib/utils';
import type { ProgramExercise } from '@/types';

interface SelectedExercisesListProps {
  exercises: ProgramExercise[];
  dayNumber: number;
  onRemove: (exercise: ProgramExercise) => void;
}

export const SelectedExercisesList = memo(function SelectedExercisesList({
  exercises,
  dayNumber,
  onRemove,
}: SelectedExercisesListProps) {
  if (exercises.length === 0) {
    return null;
  }

  return (
    <ThemedView className="gap-3">
      <ThemedText className="text-base font-semibold">
        Day {dayNumber} Exercises ({exercises.length})
      </ThemedText>
      <View className="gap-2">
        {exercises.map((exercise, index) => (
          <View
            key={`${exercise.name}-${index}`}
            className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600"
          >
            <View className="flex-row items-center gap-2">
              <View className="bg-blue-500 w-6 h-6 rounded-full items-center justify-center">
                <ThemedText className="text-white font-bold text-xs">
                  {index + 1}
                </ThemedText>
              </View>
              <ThemedText className="font-semibold text-base flex-1">
                {formatExerciseDisplayName(exercise.name, exercise.variant)}
              </ThemedText>
              <Pressable
                onPress={() => onRemove(exercise)}
                className="bg-red-500 w-6 h-6 rounded-full items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={`Remove ${formatExerciseDisplayName(exercise.name, exercise.variant)}`}
              >
                <ThemedText className="text-white font-bold text-xs">×</ThemedText>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ThemedView>
  );
});

export default SelectedExercisesList;
