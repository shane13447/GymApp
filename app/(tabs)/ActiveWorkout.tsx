/**
 * Active Workout Screen
 * Track and log an active workout session
 *
 * Business logic extracted to hooks/use-active-workout.ts and
 * lib/workout-progression.ts. This component is a thin render layer.
 */

import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DaySelector } from '@/components/workout/DaySelector';
import { ExerciseLogCard } from '@/components/workout/ExerciseLogCard';
import { useActiveWorkout } from '@/hooks/use-active-workout';
import type { WorkoutExercise } from '@/types';

export default function ActiveWorkout() {
  const router = useRouter();

  const {
    currentProgram,
    selectedDayIndex,
    workoutExercises,
    isLoading,
    isSaving,
    loadingFromQueue,
    getDayNumberAtIndex,
    buildExerciseInstanceKey,
    handleDayChange,
    saveWorkout,
    updateLoggedValue,
    updateLoggedSetWeight,
    updateLoggedSetReps,
  } = useActiveWorkout();

  const renderExercise = useCallback(
    ({ item, index }: { item: WorkoutExercise; index: number }) => {
      if (!currentProgram) {
        console.warn('renderExercise called without currentProgram');
        return null;
      }

      const selectedDayNumber = getDayNumberAtIndex(selectedDayIndex);
      const exerciseInstanceKey = buildExerciseInstanceKey(item.name, index, selectedDayNumber);

      return (
        <ExerciseLogCard
          exercise={item}
          index={index}
          exerciseInstanceId={exerciseInstanceKey}
          programId={currentProgram.id}
          dayNumber={selectedDayNumber}
          onUpdateLoggedWeight={(value) =>
            updateLoggedValue(exerciseInstanceKey, 'loggedWeight', value, selectedDayNumber)
          }
          onUpdateLoggedReps={(value) =>
            updateLoggedValue(exerciseInstanceKey, 'loggedReps', value, selectedDayNumber)
          }
          onUpdateLoggedSetWeight={(setIndex, value) =>
            updateLoggedSetWeight(exerciseInstanceKey, setIndex, value, selectedDayNumber)
          }
          onUpdateLoggedSetReps={(setIndex, value) =>
            updateLoggedSetReps(exerciseInstanceKey, setIndex, value, selectedDayNumber)
          }
        />
      );
    },
    [
      updateLoggedValue,
      updateLoggedSetWeight,
      updateLoggedSetReps,
      buildExerciseInstanceKey,
      currentProgram,
      getDayNumberAtIndex,
      selectedDayIndex,
    ]
  );

  if (isLoading) {
    return (
      <ParallaxScrollView>
        <LoadingSpinner message="Loading workout..." fullScreen />
      </ParallaxScrollView>
    );
  }

  if (!currentProgram) {
    return (
      <ParallaxScrollView>
        <ThemedView className="flex-1">
          <ThemedText type="title">No Program Selected</ThemedText>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            {({ pressed }) => (
              <View
                className="bg-blue-500 rounded-full p-4 mt-4"
                style={pressed && { opacity: 0.8 }}
              >
                <ThemedText className="text-white text-center font-semibold">Go Back</ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView>
      <ThemedView className="flex-1">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            {({ pressed }) => (
              <View
                className="px-3 py-1 rounded-lg"
                style={pressed && { backgroundColor: 'rgba(0,0,0,0.1)', opacity: 0.7 }}
              >
                <ThemedText className="text-lg font-semibold">‹ Back</ThemedText>
              </View>
            )}
          </Pressable>
          <ThemedText type="title">Active Workout</ThemedText>
        </View>

        <ThemedView className="mt-5 gap-4">
          {/* Program Info */}
          <ThemedView className="gap-2">
            <ThemedText className="text-lg font-semibold">{currentProgram.name}</ThemedText>
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
              Day {getDayNumberAtIndex(selectedDayIndex)} of {currentProgram.workoutDays.length}
            </ThemedText>
          </ThemedView>

          {/* Day Selector - Always shown to allow switching days */}
          <DaySelector
            days={currentProgram.workoutDays}
            selectedIndex={selectedDayIndex}
            onSelectDay={handleDayChange}
            disabled={loadingFromQueue}
          />

          {/* Exercises */}
          {workoutExercises.length > 0 && (
            <ThemedView className="gap-4">
              <ThemedText className="text-lg font-semibold">
                Exercises ({workoutExercises.length})
              </ThemedText>
              <View className="gap-0">
                {workoutExercises.map((exercise, index) => {
                  const selectedDayNumber = getDayNumberAtIndex(selectedDayIndex);
                  const exerciseInstanceKey = buildExerciseInstanceKey(
                    exercise.name,
                    index,
                    selectedDayNumber
                  );

                  return (
                    <View key={exerciseInstanceKey}>
                      {renderExercise({ item: exercise, index })}
                    </View>
                  );
                })}
              </View>
            </ThemedView>
          )}

          {/* Save Workout Button */}
          <Pressable
            onPress={saveWorkout}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save workout"
          >
            {({ pressed }) => (
              <View
                className={`bg-green-500 rounded-full p-4 ${isSaving ? 'opacity-50' : ''}`}
                style={pressed && !isSaving && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
              >
                {isSaving ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <ThemedText className="text-white text-center font-semibold text-lg">
                    ✓ Save Workout
                  </ThemedText>
                )}
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}