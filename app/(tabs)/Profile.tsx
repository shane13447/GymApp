/**
 * Profile Screen
 * User preferences and settings
 */

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { showConfirmDialog } from '@/components/ui/ConfirmDialog';
import * as db from '@/services/database';

export default function ProfileScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalPrograms: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const workouts = await db.getAllWorkouts();
      const programs = await db.getAllPrograms();

      setStats({
        totalWorkouts: workouts.length,
        totalPrograms: programs.length,
      });
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearWorkoutHistory = () => {
    showConfirmDialog({
      title: 'Clear Workout History',
      message:
        'Are you sure you want to delete all workout history? This action cannot be undone.',
      confirmText: 'Clear All',
      destructive: true,
      onConfirm: async () => {
        try {
          const workouts = await db.getAllWorkouts();
          for (const workout of workouts) {
            await db.deleteWorkout(workout.id);
          }
          setStats((prev) => ({ ...prev, totalWorkouts: 0 }));
          Alert.alert('Success', 'Workout history has been cleared');
        } catch (error) {
          console.error('Error clearing history:', error);
          Alert.alert('Error', 'Failed to clear workout history');
        }
      },
    });
  };


  if (isLoading) {
    return (
      <ParallaxScrollView>
        <LoadingSpinner message="Loading profile..." fullScreen />
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView>
      <ThemedView className="flex-row items-center gap-2">
        <ThemedText type="title">Profile</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView className="mt-5 gap-6">
        {/* Stats Section */}
        <ThemedView className="gap-3">
          <ThemedText type="subtitle">Statistics</ThemedText>
          <View className="flex-row gap-4">
            <ThemedView className="flex-1 p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg items-center">
              <ThemedText className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {stats.totalWorkouts}
              </ThemedText>
              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                Total Workouts
              </ThemedText>
            </ThemedView>
            <ThemedView className="flex-1 p-4 bg-green-100 dark:bg-green-900/30 rounded-lg items-center">
              <ThemedText className="text-3xl font-bold text-green-600 dark:text-green-400">
                {stats.totalPrograms}
              </ThemedText>
              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                Programs
              </ThemedText>
            </ThemedView>
          </View>
        </ThemedView>

        {/* Data Management */}
        <ThemedView className="gap-3">
          <ThemedText type="subtitle">Data Management</ThemedText>

          <Pressable onPress={handleClearWorkoutHistory} accessibilityRole="button">
            {({ pressed }) => (
              <View className={`p-4 bg-red-500 rounded-full ${pressed ? 'opacity-80' : ''}`}>
                <ThemedText className="text-white font-semibold text-center">
                  Clear Workout History
                </ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>

        {/* App Info */}
        <ThemedView className="gap-2 mt-4 items-center">
          <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
            Shane's Gym App v1.0.0
          </ThemedText>
          <ThemedText className="text-xs text-gray-400 dark:text-gray-500">
            Powered by on-device AI
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}
