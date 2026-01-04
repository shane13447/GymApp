/**
 * Exercise Log Card Component
 * Displays exercise with input fields for logging weight and reps
 */

import React, { memo, useCallback } from 'react';
import { TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import type { WorkoutExercise } from '@/types';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ExerciseLogCardProps {
  exercise: WorkoutExercise;
  index: number;
  onUpdateLoggedWeight: (value: string) => void;
  onUpdateLoggedReps: (value: string) => void;
}

export const ExerciseLogCard = memo(function ExerciseLogCard({
  exercise,
  index,
  onUpdateLoggedWeight,
  onUpdateLoggedReps,
}: ExerciseLogCardProps) {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

  return (
    <View className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="bg-blue-500 w-8 h-8 rounded-full items-center justify-center">
          <ThemedText className="text-white font-bold text-sm">{index + 1}</ThemedText>
        </View>
        <ThemedText className="font-bold text-lg flex-1">{exercise.name}</ThemedText>
      </View>

      {/* Equipment & Muscles */}
      <Collapsible title="Equipment & Muscles Worked">
        <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Equipment: {exercise.equipment || 'None'}
        </ThemedText>
        <View className="flex-row flex-wrap gap-1">
          {exercise.muscle_groups_worked.map((group) => (
            <View key={group} className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
              <ThemedText className="text-xs capitalize">{group}</ThemedText>
            </View>
          ))}
        </View>
      </Collapsible>

      {/* Target Values */}
      <View className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <View className="flex-row flex-wrap gap-3 mb-3">
          {exercise.sets && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Sets</ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.sets}</ThemedText>
            </View>
          )}
          {exercise.reps && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                Target Reps
              </ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.reps}</ThemedText>
            </View>
          )}
          {exercise.weight && exercise.weight !== '0' && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                Target Weight
              </ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.weight}</ThemedText>
            </View>
          )}
          {exercise.restTime && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Rest</ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.restTime}s</ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* Logged Values Input */}
      <View className="mt-3 gap-3">
        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Weight Logged</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="Enter weight used..."
            placeholderTextColor="#999"
            value={exercise.loggedWeight}
            onChangeText={onUpdateLoggedWeight}
            keyboardType="decimal-pad"
            style={{ color: textColor }}
            accessibilityLabel={`Log weight for ${exercise.name}`}
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Reps Logged</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="Enter reps completed..."
            placeholderTextColor="#999"
            value={exercise.loggedReps}
            onChangeText={onUpdateLoggedReps}
            keyboardType="numeric"
            style={{ color: textColor }}
            accessibilityLabel={`Log reps for ${exercise.name}`}
          />
        </ThemedView>
      </View>
    </View>
  );
});

export default ExerciseLogCard;
