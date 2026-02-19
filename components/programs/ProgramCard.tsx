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
          className={`p-4 rounded-2xl border ${
            pressed
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          }`}
          style={pressed ? { opacity: 0.9 } : undefined}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <ThemedText className="font-semibold text-lg" numberOfLines={1}>
                  {program.name}
                </ThemedText>
                {isCurrentProgram && (
                  <View className="bg-green-500/15 dark:bg-green-500/20 border border-green-500/40 px-2 py-0.5 rounded-full">
                    <ThemedText className="text-green-700 dark:text-green-300 text-[10px] font-semibold">
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
            <ThemedText className="ml-3 text-blue-500 text-2xl leading-none">›</ThemedText>
          </View>
        </View>
      )}
    </Pressable>
  );
});

export default ProgramCard;
