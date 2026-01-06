/**
 * Day Selector Component
 * Horizontal scrollable day picker for workouts
 */

import React, { memo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { WorkoutDay } from '@/types';

interface DaySelectorProps {
  days: WorkoutDay[];
  selectedIndex: number;
  onSelectDay: (index: number) => void;
  disabled?: boolean;
}

export const DaySelector = memo(function DaySelector({
  days,
  selectedIndex,
  onSelectDay,
  disabled = false,
}: DaySelectorProps) {
  if (days.length <= 1) {
    return null;
  }

  return (
    <ThemedView className="gap-2">
      <ThemedText className="text-base font-semibold">Select Workout Day</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {days.map((day, index) => (
            <Pressable
              key={day.dayNumber}
              onPress={() => onSelectDay(index)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedIndex === index }}
              accessibilityLabel={`Day ${day.dayNumber}`}
            >
              {({ pressed }) => (
                <View
                  className={`px-4 py-2 rounded-full border-2 ${
                    selectedIndex === index
                      ? 'bg-blue-500 border-blue-600'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                  } ${disabled ? 'opacity-50' : ''}`}
                  style={pressed && !disabled ? { opacity: 0.8 } : {}}
                >
                  <ThemedText
                    className={`font-semibold ${selectedIndex === index ? 'text-white' : ''}`}
                  >
                    Day {day.dayNumber}
                  </ThemedText>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
});

export default DaySelector;
