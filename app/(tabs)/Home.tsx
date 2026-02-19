/**
 * Home Screen
 * Dashboard with quick actions and workout summary
 */

import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import * as db from '@/services/database';
import type { Program, Workout, WorkoutQueueItem } from '@/types';

const getMuscleGroups = (workout: WorkoutQueueItem): string[] => {
  const muscleGroups = new Set<string>();
  workout.exercises.forEach((exercise) => {
    exercise.muscle_groups_worked.forEach((group) => {
      muscleGroups.add(group);
    });
  });
  return Array.from(muscleGroups).sort();
};

export default function HomeScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null);
  const [nextWorkout, setNextWorkout] = useState<WorkoutQueueItem | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([]);
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    thisWeek: 0,
    streak: 0,
  });

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const currentProgramId = await db.getCurrentProgramId();
      if (currentProgramId) {
        const program = await db.getProgramById(currentProgramId);
        setCurrentProgram(program);
      } else {
        setCurrentProgram(null);
      }

      const queue = await db.getWorkoutQueue();
      setNextWorkout(queue.length > 0 ? queue[0] : null);

      const workouts = await db.getAllWorkouts();
      setRecentWorkouts(workouts.slice(0, 4));

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const thisWeekWorkouts = workouts.filter(
        (workout) => new Date(workout.date) >= weekStart && workout.completed
      );

      let streak = 0;
      const completedWorkouts = workouts.filter((workout) => workout.completed);
      if (completedWorkouts.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let checkDate = new Date(today);
        for (let i = 0; i < 365; i++) {
          const dateStr = checkDate.toISOString().split('T')[0];
          const hasWorkout = completedWorkouts.some(
            (workout) => workout.date.split('T')[0] === dateStr
          );

          if (hasWorkout) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else if (i === 0) {
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      setStats({
        totalWorkouts: completedWorkouts.length,
        thisWeek: thisWeekWorkouts.length,
        streak,
      });
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, []);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const canStartWorkout = !!nextWorkout;

  if (isLoading) {
    return (
      <ParallaxScrollView>
        <LoadingSpinner message="Loading..." fullScreen />
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <View className="flex-row items-center justify-between pt-5 pb-5">
        <View className="flex-1 items-center">
          <ThemedText className="text-3xl font-bold text-center">{stats.totalWorkouts}</ThemedText>
          <ThemedText className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
            Total
          </ThemedText>
        </View>
        <View className="h-12 w-px bg-gray-200 dark:bg-gray-700" />
        <View className="flex-1 items-center">
          <ThemedText className="text-3xl font-bold text-center">{stats.thisWeek}</ThemedText>
          <ThemedText
            numberOfLines={1}
            className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center"
          >
            {'This\u00A0Week'}
          </ThemedText>
        </View>
        <View className="h-12 w-px bg-gray-200 dark:bg-gray-700" />
        <View className="flex-1 items-center">
          <ThemedText className="text-3xl font-bold text-center">{stats.streak}</ThemedText>
          <ThemedText className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
            Streak
          </ThemedText>
        </View>
      </View>

      <View className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <Pressable
          onPress={() =>
            canStartWorkout ? router.push('/(tabs)/ActiveWorkout') : router.push('/(tabs)/Programs')
          }
          accessibilityRole="button"
          accessibilityLabel={canStartWorkout ? 'Start active workout' : 'Create or choose a program'}
        >
          {({ pressed }) => (
            <View
              className={`rounded-full py-4 px-5 ${
                canStartWorkout ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-400 dark:bg-gray-600'
              }`}
              style={pressed ? { opacity: 0.9, transform: [{ scale: 0.99 }] } : undefined}
            >
              <ThemedText className="text-center text-white font-semibold text-base">
                {canStartWorkout ? `Start Day ${nextWorkout.dayNumber}` : 'Create Your First Program'}
              </ThemedText>
            </View>
          )}
        </Pressable>
      </View>

      <ThemedView className="gap-3 border-b border-gray-200 dark:border-gray-700 pb-6">
        <ThemedText type="subtitle">Quick Actions</ThemedText>
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => router.push('/(tabs)/Coach')}
            accessibilityRole="button"
            accessibilityLabel="Open AI Coach"
            className="w-[48%]"
          >
            {({ pressed }) => (
              <View
                className="rounded-full py-3 px-4 bg-blue-600 dark:bg-blue-500"
                style={pressed ? { opacity: 0.75 } : undefined}
              >
                <ThemedText className="text-base font-semibold text-center text-white">AI Coach</ThemedText>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/Programs')}
            accessibilityRole="button"
            accessibilityLabel="Manage programs"
            className="w-[48%]"
          >
            {({ pressed }) => (
              <View
                className="rounded-full py-3 px-4 bg-blue-600 dark:bg-blue-500"
                style={pressed ? { opacity: 0.75 } : undefined}
              >
                <ThemedText className="text-base font-semibold text-center text-white">Programs</ThemedText>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/History')}
            accessibilityRole="button"
            accessibilityLabel="Open workout history"
            className="w-[48%]"
          >
            {({ pressed }) => (
              <View
                className="rounded-full py-3 px-4 bg-blue-600 dark:bg-blue-500"
                style={pressed ? { opacity: 0.75 } : undefined}
              >
                <ThemedText className="text-base font-semibold text-center text-white">History</ThemedText>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/Profile')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            className="w-[48%]"
          >
            {({ pressed }) => (
              <View
                className="rounded-full py-3 px-4 bg-blue-600 dark:bg-blue-500"
                style={pressed ? { opacity: 0.75 } : undefined}
              >
                <ThemedText className="text-base font-semibold text-center text-white">Settings</ThemedText>
              </View>
            )}
          </Pressable>
        </View>
      </ThemedView>

      <ThemedView className="gap-3 border-b border-gray-200 dark:border-gray-700 pb-6">
        <ThemedText type="subtitle">Up Next</ThemedText>
        {nextWorkout ? (
          <View className="gap-3">
            <View className="border-l-2 border-blue-500 pl-3">
              <ThemedText className="font-semibold text-base">{nextWorkout.programName}</ThemedText>
              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                Day {nextWorkout.dayNumber} • {nextWorkout.exercises.length} exercises
              </ThemedText>
            </View>

            <View className="flex-row flex-wrap gap-1.5">
              {getMuscleGroups(nextWorkout).map((group) => (
                <View key={group} className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40">
                  <ThemedText className="text-xs font-medium capitalize text-blue-700 dark:text-blue-300">
                    {group}
                  </ThemedText>
                </View>
              ))}
            </View>

            <View className="gap-1.5">
              {nextWorkout.exercises.slice(0, 5).map((exercise) => (
                <ThemedText key={exercise.name} className="text-sm text-gray-700 dark:text-gray-300">
                  • {exercise.name}
                </ThemedText>
              ))}
              {nextWorkout.exercises.length > 5 && (
                <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                  +{nextWorkout.exercises.length - 5} more exercises
                </ThemedText>
              )}
            </View>
          </View>
        ) : (
          <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
            Queue is empty. Choose a program to generate your next workout.
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView className="gap-3 border-b border-gray-200 dark:border-gray-700 pb-6">
        <ThemedText type="subtitle">Program</ThemedText>
        {currentProgram ? (
          <Pressable
            onPress={() => router.push('/(tabs)/Programs')}
            accessibilityRole="button"
            accessibilityLabel="Open programs"
          >
            {({ pressed }) => (
              <View
                className="flex-row items-center justify-between"
                style={pressed ? { opacity: 0.75 } : undefined}
              >
                <View className="flex-1 pr-3">
                  <ThemedText className="font-semibold text-base">{currentProgram.name}</ThemedText>
                  <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    {currentProgram.workoutDays.length} day
                    {currentProgram.workoutDays.length !== 1 ? 's' : ''} •{' '}
                    {currentProgram.workoutDays.reduce((sum, day) => sum + day.exercises.length, 0)} exercises
                  </ThemedText>
                </View>
                <ThemedText className="text-blue-500 text-lg">›</ThemedText>
              </View>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/(tabs)/Programs')}
            accessibilityRole="button"
            accessibilityLabel="Create your first program"
          >
            {({ pressed }) => (
              <ThemedText
                className="text-sm text-blue-500 font-semibold"
                style={pressed ? { opacity: 0.7 } : undefined}
              >
                Create your first program
              </ThemedText>
            )}
          </Pressable>
        )}
      </ThemedView>

      {recentWorkouts.length > 0 && (
        <ThemedView className="gap-3 border-b border-gray-200 dark:border-gray-700 pb-6">
          <View className="flex-row items-center justify-between">
            <ThemedText type="subtitle">Recent Activity</ThemedText>
            <Pressable
              onPress={() => router.push('/(tabs)/History')}
              accessibilityRole="button"
              accessibilityLabel="View all workout history"
            >
              {({ pressed }) => (
                <ThemedText
                  className="text-sm text-blue-500 font-semibold"
                  style={pressed ? { opacity: 0.7 } : undefined}
                >
                  View all
                </ThemedText>
              )}
            </Pressable>
          </View>

          <View className="gap-2">
            {recentWorkouts.map((workout) => (
              <View
                key={workout.id}
                className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800"
              >
                <View className="flex-1 pr-3">
                  <ThemedText className="font-medium" numberOfLines={1}>
                    {workout.programName} • Day {workout.dayNumber}
                  </ThemedText>
                  <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {workout.exercises.length} exercises
                  </ThemedText>
                </View>
                <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(workout.date)}
                </ThemedText>
              </View>
            ))}
          </View>
        </ThemedView>
      )}

    </ParallaxScrollView>
  );
}
