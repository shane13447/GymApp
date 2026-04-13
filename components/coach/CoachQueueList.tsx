import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatExerciseDisplayName } from '@/lib/utils';
import type { WorkoutQueueItem } from '@/types';

interface CoachQueueListProps {
  workoutQueue: WorkoutQueueItem[];
  onRefresh: () => void | Promise<void>;
}

/**
 * Renders one queue day card inside the Coach queue-preview section.
 * The card mirrors the old inline Coach layout without embedding queue markup in the screen file.
 */
function CoachQueueItemCard({ queueItem }: { queueItem: WorkoutQueueItem }) {
  return (
    <ThemedView
      className="mb-3 p-3 rounded-lg border border-gray-300 dark:border-gray-600"
      lightColor="#fff"
      darkColor="#1e1e1e"
    >
      <ThemedText className="font-bold text-sm mb-2 opacity-90">
        {queueItem.programName} - Day {queueItem.dayNumber}
      </ThemedText>
      {queueItem.exercises.map((exercise, exIndex) => (
        <ThemedView
          key={`${exercise.name}-${exIndex}`}
          className="p-2 rounded mb-1"
          lightColor="#f9f9f9"
          darkColor="#2a2a2a"
        >
          <ThemedText className="font-semibold text-sm" numberOfLines={1}>
            {formatExerciseDisplayName(exercise.name, exercise.variant)}
          </ThemedText>
          <View className="flex-row flex-wrap gap-3 mt-1">
            <ThemedText className="text-xs opacity-70">Sets: {exercise.sets || 'N/A'}</ThemedText>
            <ThemedText className="text-xs opacity-70">Reps: {exercise.reps || 'N/A'}</ThemedText>
            <ThemedText className="text-xs opacity-70">Weight: {exercise.weight || 'N/A'}</ThemedText>
          </View>
        </ThemedView>
      ))}
    </ThemedView>
  );
}

/**
 * Renders the Coach queue preview with refresh affordance and empty-state handling.
 * Extracting this block removes a large chunk of queue-only JSX from the Coach screen.
 */
export function CoachQueueList({ workoutQueue, onRefresh }: CoachQueueListProps) {
  return (
    <>
      <ThemedView className="flex-row items-center justify-between">
        <ThemedText type="subtitle" className="text-base">
          Current Workout Queue
        </ThemedText>
        <Pressable
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh workout queue"
        >
          {({ pressed }) => (
            <View
              className={`bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-lg ${
                pressed ? 'opacity-70' : ''
              }`}
            >
              <ThemedText className="text-sm font-semibold">Refresh</ThemedText>
            </View>
          )}
        </Pressable>
      </ThemedView>

      {workoutQueue.length > 0 ? (
        <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator>
          {workoutQueue.map((queueItem) => (
            <View key={queueItem.id}>
              <CoachQueueItemCard queueItem={queueItem} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <ThemedView className="p-4 items-center">
          <ThemedText className="text-sm opacity-70 text-center">
            No workout queue found. Create a program and start a workout first.
          </ThemedText>
        </ThemedView>
      )}
    </>
  );
}
