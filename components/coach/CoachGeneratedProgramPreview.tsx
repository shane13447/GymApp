import React from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatExerciseDisplayName } from '@/lib/utils';
import type { DraftProgram } from '@/types';

interface CoachGeneratedProgramPreviewProps {
  generatedProgramDraft: DraftProgram;
  loading: boolean;
  isGenerating: boolean;
  onSave: () => Promise<void>;
}

/**
 * Renders the generated-program preview card shown before the user saves a Coach-created draft.
 * The component keeps the Coach screen lean while preserving the existing preview structure.
 */
export function CoachGeneratedProgramPreview({
  generatedProgramDraft,
  loading,
  isGenerating,
  onSave,
}: CoachGeneratedProgramPreviewProps) {
  return (
    <ThemedView className="gap-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3">
      <ThemedText className="text-base font-bold text-blue-900 dark:text-blue-100">
        {generatedProgramDraft.name}
      </ThemedText>
      <ThemedText className="text-xs text-blue-800 dark:text-blue-200">
        {generatedProgramDraft.workoutDays.length} training days | Review below then save
      </ThemedText>

      {generatedProgramDraft.workoutDays.map((day) => (
        <ThemedView
          key={day.dayNumber}
          className="rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden"
        >
          <View className="bg-blue-100 dark:bg-blue-900/40 px-3 py-2">
            <ThemedText className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Day {day.dayNumber}
            </ThemedText>
          </View>
          {day.exercises.map((exercise, exIndex) => (
            <View
              key={`${exercise.name}-${exIndex}`}
              className={`px-3 py-2 ${exIndex > 0 ? 'border-t border-blue-100 dark:border-blue-800/60' : ''}`}
            >
              <ThemedText className="text-sm font-semibold" numberOfLines={1}>
                {formatExerciseDisplayName(exercise.name, exercise.variant)}
              </ThemedText>
              <View className="flex-row flex-wrap gap-3 mt-1">
                <ThemedText className="text-xs opacity-70">Sets: {exercise.sets || 'N/A'}</ThemedText>
                <ThemedText className="text-xs opacity-70">Reps: {exercise.reps || 'N/A'}</ThemedText>
                <ThemedText className="text-xs opacity-70">Weight: {exercise.weight || 'N/A'}</ThemedText>
                {exercise.restTime ? (
                  <ThemedText className="text-xs opacity-70">Rest: {exercise.restTime}</ThemedText>
                ) : null}
              </View>
            </View>
          ))}
        </ThemedView>
      ))}

      <Pressable
        onPress={onSave}
        disabled={loading || isGenerating}
        accessibilityRole="button"
        accessibilityLabel="Save draft program"
      >
        {({ pressed }) => (
          <View
            className={`bg-blue-500 px-4 py-2 rounded-full items-center justify-center ${
              loading || isGenerating ? 'opacity-50' : ''
            } ${pressed ? 'opacity-70' : ''}`}
          >
            <ThemedText className="text-white text-sm font-semibold">Save Draft Program</ThemedText>
          </View>
        )}
      </Pressable>
    </ThemedView>
  );
}
