/**
 * Exercise Configuration Card Component
 * Displays and allows editing of exercise details (sets, reps, weight, etc.)
 */

import React, { memo, useCallback } from 'react';
import { TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import type { ProgramExercise } from '@/types';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ExerciseConfigCardProps {
  exercise: ProgramExercise;
  index: number;
  onUpdate: (field: keyof ProgramExercise, value: string) => void;
  showRemove?: boolean;
  onRemove?: () => void;
}

export const ExerciseConfigCard = memo(function ExerciseConfigCard({
  exercise,
  index,
  onUpdate,
  showRemove,
  onRemove,
}: ExerciseConfigCardProps) {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

  const handleFieldChange = useCallback(
    (field: keyof ProgramExercise) => (value: string) => {
      onUpdate(field, value);
    },
    [onUpdate]
  );

  return (
    <View className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="bg-blue-500 w-8 h-8 rounded-full items-center justify-center">
          <ThemedText className="text-white font-bold text-sm">
            {index + 1}
          </ThemedText>
        </View>
        <ThemedText className="font-bold text-lg flex-1">
          {exercise.name}
        </ThemedText>
        {showRemove && onRemove && (
          <View
            className="bg-red-500 w-8 h-8 rounded-full items-center justify-center"
            onTouchEnd={onRemove}
          >
            <ThemedText className="text-white font-bold text-sm">×</ThemedText>
          </View>
        )}
      </View>

      {/* Equipment and Muscles Dropdown */}
      <Collapsible title="Equipment & Muscles Worked">
        <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Equipment: {exercise.equipment || 'None'}
        </ThemedText>
        <View className="flex-row flex-wrap gap-1">
          {exercise.muscle_groups_worked.map((group) => (
            <View
              key={group}
              className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded"
            >
              <ThemedText className="text-xs capitalize">{group}</ThemedText>
            </View>
          ))}
        </View>
      </Collapsible>

      {/* Input Fields */}
      <View className="mt-3 gap-3">
        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Sets</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 3"
            placeholderTextColor="#999"
            value={exercise.sets}
            onChangeText={handleFieldChange('sets')}
            keyboardType="numeric"
            style={{ color: textColor }}
            accessibilityLabel="Number of sets"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Reps</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 8-10"
            placeholderTextColor="#999"
            value={exercise.reps}
            onChangeText={handleFieldChange('reps')}
            style={{ color: textColor }}
            accessibilityLabel="Number of reps"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Weight</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 60 kg"
            placeholderTextColor="#999"
            value={exercise.weight}
            onChangeText={handleFieldChange('weight')}
            keyboardType="decimal-pad"
            style={{ color: textColor }}
            accessibilityLabel="Weight"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Rest Time (seconds)</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 90"
            placeholderTextColor="#999"
            value={exercise.restTime}
            onChangeText={handleFieldChange('restTime')}
            keyboardType="numeric"
            style={{ color: textColor }}
            accessibilityLabel="Rest time in seconds"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Progression (weight increase)</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 2.5"
            placeholderTextColor="#999"
            value={exercise.progression}
            onChangeText={handleFieldChange('progression')}
            keyboardType="decimal-pad"
            style={{ color: textColor }}
            accessibilityLabel="Weight progression"
          />
        </ThemedView>
      </View>
    </View>
  );
});

export default ExerciseConfigCard;
