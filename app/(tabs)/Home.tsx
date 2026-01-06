/**
 * Home Screen
 * Dashboard with quick actions and workout summary
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import * as db from '@/services/database';
import type { Program, Workout, WorkoutQueueItem } from '@/types';

// Get unique muscle groups from a workout queue item
const getMuscleGroups = (workout: WorkoutQueueItem): string[] => {
  const muscleGroups = new Set<string>();
  workout.exercises.forEach((ex) => {
    ex.muscle_groups_worked.forEach((group) => {
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

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      // Get current program
      const currentProgramId = await db.getCurrentProgramId();
      if (currentProgramId) {
        const program = await db.getProgramById(currentProgramId);
        setCurrentProgram(program);
      } else {
        setCurrentProgram(null);
      }

      // Get workout queue
      const queue = await db.getWorkoutQueue();
      setNextWorkout(queue.length > 0 ? queue[0] : null);

      // Get recent workouts
      const workouts = await db.getAllWorkouts();
      setRecentWorkouts(workouts.slice(0, 3));

      // Calculate stats
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const thisWeekWorkouts = workouts.filter(
        (w) => new Date(w.date) >= weekStart && w.completed
      );

      // Calculate streak (consecutive days)
      let streak = 0;
      const completedWorkouts = workouts.filter((w) => w.completed);
      if (completedWorkouts.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let checkDate = new Date(today);
        for (let i = 0; i < 365; i++) {
          const dateStr = checkDate.toISOString().split('T')[0];
          const hasWorkout = completedWorkouts.some(
            (w) => w.date.split('T')[0] === dateStr
          );

          if (hasWorkout) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else if (i === 0) {
            // Allow today to not have a workout yet
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      setStats({
        totalWorkouts: workouts.filter((w) => w.completed).length,
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

  if (isLoading) {
    return (
      <ParallaxScrollView>
        <LoadingSpinner message="Loading..." fullScreen />
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <ThemedView className="flex-row items-center gap-2">
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView className="mt-5 gap-6">
        {/* Stats Cards */}
        <View className="flex-row gap-3">
          <ThemedView className="flex-1 p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg items-center">
            <ThemedText className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.totalWorkouts}
            </ThemedText>
            <ThemedText className="text-xs text-gray-600 dark:text-gray-400">
              Total Workouts
            </ThemedText>
          </ThemedView>
          <ThemedView className="flex-1 p-4 bg-green-100 dark:bg-green-900/30 rounded-lg items-center">
            <ThemedText className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.thisWeek}
            </ThemedText>
            <ThemedText className="text-xs text-gray-600 dark:text-gray-400">
              This Week
            </ThemedText>
          </ThemedView>
          <ThemedView className="flex-1 p-4 bg-orange-100 dark:bg-orange-900/30 rounded-lg items-center">
            <ThemedText className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {stats.streak}
            </ThemedText>
            <ThemedText className="text-xs text-gray-600 dark:text-gray-400">
              Day Streak
            </ThemedText>
          </ThemedView>
        </View>

        {/* Start Workout Button */}
        <Pressable
          onPress={() => router.push('/(tabs)/ActiveWorkout')}
          accessibilityRole="button"
          accessibilityLabel="Start active workout"
        >
          {({ pressed }) => (
            <View
              className="bg-green-500 rounded-full p-4"
              style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
            >
              <ThemedText className="text-white text-center font-semibold text-lg">
                🏋️ Start Workout
              </ThemedText>
            </View>
          )}
        </Pressable>

        {/* Next Workout Preview */}
        {nextWorkout && (
          <ThemedView className="gap-2">
            <ThemedText type="subtitle">Up Next</ThemedText>
            <ThemedView className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <ThemedText className="font-bold text-lg">
                {nextWorkout.programName}
              </ThemedText>
              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                Day {nextWorkout.dayNumber} • {nextWorkout.exercises.length} exercises
              </ThemedText>
              
              {/* Muscle Groups */}
              <View className="mt-3">
                <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Muscle Groups
                </ThemedText>
                <View className="flex-row flex-wrap gap-1.5">
                  {getMuscleGroups(nextWorkout).map((group) => (
                    <View
                      key={group}
                      className="bg-blue-100 dark:bg-blue-900/50 px-2.5 py-1 rounded-full"
                    >
                      <ThemedText className="text-xs font-medium capitalize text-blue-700 dark:text-blue-300">
                        {group}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
              
              {/* Exercises */}
              <View className="mt-3">
                <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Exercises
                </ThemedText>
                <View className="flex-row flex-wrap gap-1.5">
                  {nextWorkout.exercises.map((ex, i) => (
                    <View
                      key={i}
                      className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"
                    >
                      <ThemedText className="text-xs">{ex.name}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </ThemedView>
          </ThemedView>
        )}

        {/* Current Program */}
        {currentProgram ? (
          <ThemedView className="gap-2">
            <ThemedText type="subtitle">Current Program</ThemedText>
            <Pressable
              onPress={() => router.push('/(tabs)/Programs')}
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <ThemedView
                  className={`p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${
                    pressed ? 'opacity-80' : ''
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <ThemedText className="font-bold text-lg">
                        {currentProgram.name}
                      </ThemedText>
                      <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                        {currentProgram.workoutDays.length} day
                        {currentProgram.workoutDays.length !== 1 ? 's' : ''} •{' '}
                        {currentProgram.workoutDays.reduce(
                          (sum, day) => sum + day.exercises.length,
                          0
                        )}{' '}
                        exercises
                      </ThemedText>
                    </View>
                    <ThemedText className="text-blue-500 text-lg">›</ThemedText>
                  </View>
                </ThemedView>
              )}
            </Pressable>
          </ThemedView>
        ) : (
          <ThemedView className="gap-2">
            <ThemedText type="subtitle">Get Started</ThemedText>
            <ThemedView className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <ThemedText className="text-center text-gray-600 dark:text-gray-400 mb-3">
                Create your first program to start tracking workouts
              </ThemedText>
              <Pressable
                onPress={() => router.push('/(tabs)/Programs')}
                accessibilityRole="button"
              >
                {({ pressed }) => (
                  <View
                    className={`bg-blue-500 py-2 px-4 rounded-full ${
                      pressed ? 'opacity-80' : ''
                    }`}
                  >
                    <ThemedText className="text-white text-center font-semibold">
                      Create Program
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            </ThemedView>
          </ThemedView>
        )}

        {/* Recent Activity */}
        {recentWorkouts.length > 0 && (
          <ThemedView className="gap-2">
            <ThemedText type="subtitle">Recent Activity</ThemedText>
            {recentWorkouts.map((workout) => (
              <ThemedView
                key={workout.id}
                className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <View className="flex-row items-center justify-between">
                  <View>
                    <ThemedText className="font-semibold">
                      {workout.programName} - Day {workout.dayNumber}
                    </ThemedText>
                    <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                      {workout.exercises.length} exercises
                    </ThemedText>
                  </View>
                  <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(workout.date)}
                  </ThemedText>
                </View>
              </ThemedView>
            ))}
            <Pressable
              onPress={() => router.push('/(tabs)/History')}
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <ThemedText
                  className={`text-blue-500 text-center text-sm font-semibold ${
                    pressed ? 'opacity-70' : ''
                  }`}
                >
                  View All History →
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        )}

        {/* Quick Actions */}
        <ThemedView className="gap-2">
          <ThemedText type="subtitle">Quick Actions</ThemedText>
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => router.push('/(tabs)/Coach')}
              className="flex-1"
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <ThemedView
                  className={`p-4 bg-purple-100 dark:bg-purple-900/30 rounded-lg items-center ${
                    pressed ? 'opacity-80' : ''
                  }`}
                >
                  <ThemedText className="text-2xl mb-1">🤖</ThemedText>
                  <ThemedText className="text-sm font-semibold text-center">
                    AI Coach
                  </ThemedText>
                </ThemedView>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/Programs')}
              className="flex-1"
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <ThemedView
                  className={`p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg items-center ${
                    pressed ? 'opacity-80' : ''
                  }`}
                >
                  <ThemedText className="text-2xl mb-1">📋</ThemedText>
                  <ThemedText className="text-sm font-semibold text-center">
                    Programs
                  </ThemedText>
                </ThemedView>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/Profile')}
              className="flex-1"
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <ThemedView
                  className={`p-4 bg-gray-100 dark:bg-gray-800 rounded-lg items-center ${
                    pressed ? 'opacity-80' : ''
                  }`}
                >
                  <ThemedText className="text-2xl mb-1">⚙️</ThemedText>
                  <ThemedText className="text-sm font-semibold text-center">
                    Settings
                  </ThemedText>
                </ThemedView>
              )}
            </Pressable>
          </View>
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}
