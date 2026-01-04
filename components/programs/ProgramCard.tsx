/**
 * Program Card Component
 * Displays a program summary in a list
 */

import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import type { Program } from '@/types';

interface ProgramCardProps {
  program: Program;
  isCurrentProgram: boolean;
  onPress: () => void;
}

export const ProgramCard = memo(function ProgramCard({
  program,
  isCurrentProgram,
  onPress,
}: ProgramCardProps) {
  const totalExercises = program.workoutDays.reduce(
    (sum, day) => sum + day.exercises.length,
    0
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${program.name} program`}
    >
      {({ pressed }) => (
        <View
          className={`mb-3 p-4 rounded-lg border-2 ${
            pressed
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
          }`}
          style={pressed ? { opacity: 0.9 } : {}}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <ThemedText className="font-bold text-xl mb-1">
                  {program.name}
                </ThemedText>
                {isCurrentProgram && (
                  <View className="bg-green-500 px-2 py-1 rounded">
                    <ThemedText className="text-white text-xs font-semibold">
                      CURRENT
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                {program.workoutDays.length} day
                {program.workoutDays.length !== 1 ? 's' : ''} • {totalExercises}{' '}
                exercise
                {totalExercises !== 1 ? 's' : ''}
              </ThemedText>
            </View>
            <View className="ml-3 bg-blue-500 rounded-full w-8 h-8 items-center justify-center">
              <ThemedText className="text-white text-lg font-bold">›</ThemedText>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
});

export default ProgramCard;
