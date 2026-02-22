/**
 * History Screen
 * View completed workout history organized by date
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import * as db from '@/services/database';
import type { Workout } from '@/types';

interface WorkoutsByDate {
  date: string;
  workouts: Workout[];
}

export default function HistoryScreen() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadWorkouts();
  }, []);

  const loadWorkouts = async () => {
    try {
      const loadedWorkouts = await db.getAllWorkouts();
      setWorkouts(loadedWorkouts);
    } catch (error) {
      console.error('Error loading workouts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadWorkouts();
    setIsRefreshing(false);
  }, []);

  // Group workouts by date
  const workoutsByDate = useMemo(() => {
    const grouped: Record<string, Workout[]> = {};

    workouts.forEach((workout) => {
      const workoutDate = new Date(workout.date);
      const dateKey = workoutDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(workout);
    });

    // Convert to array and sort by date
    const sortedDates = Object.keys(grouped).sort((a, b) => {
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return sortedDates.map((date) => ({
      date,
      workouts: grouped[date].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    }));
  }, [workouts]);

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderWorkoutItem = useCallback(
    ({ item: workout }: { item: Workout }) => (
      <View className="mb-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
        {/* Workout Header */}
        <View className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <View className="flex-row items-center justify-between mb-2">
            <ThemedText className="font-bold text-lg">{workout.programName}</ThemedText>
            {workout.completed && (
              <View className="bg-green-500 px-2 py-1 rounded">
                <ThemedText className="text-white text-xs font-semibold">✓ Completed</ThemedText>
              </View>
            )}
          </View>
          <View className="flex-row gap-4">
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
              Day {workout.dayNumber}
            </ThemedText>
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
              {formatTime(workout.date)}
            </ThemedText>
          </View>
        </View>

        {/* Exercises */}
        <ThemedView className="gap-2">
          <ThemedText className="font-semibold text-base">
            Exercises ({workout.exercises.length})
          </ThemedText>
          {workout.exercises.map((exercise, index) => (
            <View
              key={`${workout.id}-${exercise.name}-${index}`}
              className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
            >
              <View className="flex-row items-center gap-2 mb-2">
                <View className="bg-blue-500 w-6 h-6 rounded-full items-center justify-center">
                  <ThemedText className="text-white font-bold text-xs">{index + 1}</ThemedText>
                </View>
                <ThemedText className="font-semibold text-base flex-1">{exercise.name}</ThemedText>
              </View>

              {/* Logged Values */}
              <View className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                {exercise.hasCustomisedSets ? (
                  <View className="gap-2">
                    <ThemedText className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Customised Sets
                    </ThemedText>
                    {Array.from({ length: Number(exercise.sets) || 0 }).map((_, setIndex) => {
                      const setNumber = setIndex + 1;
                      const setWeight = exercise.loggedSetWeights[setIndex] ?? 0;
                      const setReps = exercise.loggedSetReps[setIndex] ?? 0;

                      return (
                        <View
                          key={`${workout.id}-${exercise.name}-set-${setNumber}`}
                          className="flex-row items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded"
                        >
                          <ThemedText className="text-sm font-medium">Set {setNumber}</ThemedText>
                          <View className="flex-row gap-4">
                            <ThemedText className="text-sm">
                              W: <ThemedText className="font-semibold">{setWeight || '-'}</ThemedText>
                            </ThemedText>
                            <ThemedText className="text-sm">
                              R: <ThemedText className="font-semibold">{setReps || '-'}</ThemedText>
                            </ThemedText>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View className="flex-row flex-wrap gap-4">
                    {exercise.loggedWeight > 0 && (
                      <View>
                        <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                          Weight
                        </ThemedText>
                        <ThemedText className="text-base font-semibold">
                          {exercise.loggedWeight}
                        </ThemedText>
                      </View>
                    )}
                    {exercise.loggedReps > 0 && (
                      <View>
                        <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                          Reps
                        </ThemedText>
                        <ThemedText className="text-base font-semibold">
                          {exercise.loggedReps}
                        </ThemedText>
                      </View>
                    )}
                    {exercise.sets && (
                      <View>
                        <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                          Sets
                        </ThemedText>
                        <ThemedText className="text-base font-semibold">{exercise.sets}</ThemedText>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}
        </ThemedView>
      </View>
    ),
    []
  );

  const renderDateGroup = useCallback(
    ({ item: dateGroup }: { item: WorkoutsByDate }) => (
      <ThemedView className="mb-4">
        <Collapsible
          title={
            <View className="flex-row items-center gap-4 w-full pr-4">
              <ThemedText className="font-semibold text-lg">{dateGroup.date}</ThemedText>
              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                {dateGroup.workouts.length} workout{dateGroup.workouts.length !== 1 ? 's' : ''}
              </ThemedText>
            </View>
          }
        >
          <ThemedView className="mt-3 gap-3">
            {dateGroup.workouts.map((workout) => (
              <View key={workout.id}>
                {renderWorkoutItem({ item: workout })}
              </View>
            ))}
          </ThemedView>
        </Collapsible>
      </ThemedView>
    ),
    [renderWorkoutItem]
  );

  if (isLoading) {
    return (
      <ParallaxScrollView>
        <LoadingSpinner message="Loading workout history..." fullScreen />
      </ParallaxScrollView>
    );
  }

  if (workoutsByDate.length === 0) {
    return (
      <ParallaxScrollView>
        <ThemedView className="flex-1">
          <ThemedText type="title">History</ThemedText>
          <EmptyState
            icon="clock"
            title="No Workouts Yet"
            message="Start a workout to see your history here!"
          />
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <ThemedView className="flex-1">
        <View className="flex-row items-center justify-between">
          <ThemedText type="title">History</ThemedText>
          <Pressable
            onPress={handleRefresh}
            disabled={isRefreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh workout history"
          >
            {({ pressed }) => (
              <View
                className={`bg-blue-500 px-4 py-2 rounded-full ${
                  isRefreshing ? 'opacity-50' : ''
                } ${pressed && !isRefreshing ? 'opacity-70' : ''}`}
              >
                <ThemedText className="text-white font-semibold text-sm">
                  {isRefreshing ? '↻ Refreshing...' : '↻ Refresh'}
                </ThemedText>
              </View>
            )}
          </Pressable>
        </View>

        <ThemedView className="mt-5 gap-4">
          {workoutsByDate.map((dateGroup) => (
            <View key={dateGroup.date}>
              {renderDateGroup({ item: dateGroup })}
            </View>
          ))}
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}
