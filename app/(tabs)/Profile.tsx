/**
 * Profile Screen
 * User preferences and settings
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { showConfirmDialog } from '@/components/ui/ConfirmDialog';
import * as db from '@/services/database';
import type { UserPreferences } from '@/types';

export default function ProfileScreen() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
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
      const prefs = await db.getUserPreferences();
      setPreferences(prefs);

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

  const handleUpdatePreference = useCallback(
    async (key: keyof UserPreferences, value: any) => {
      if (!preferences) return;

      try {
        await db.updateUserPreferences({ [key]: value });
        setPreferences((prev) => (prev ? { ...prev, [key]: value } : null));
      } catch (error) {
        console.error('Error updating preference:', error);
        Alert.alert('Error', 'Failed to update preference');
      }
    },
    [preferences]
  );

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

  const handleClearQueue = () => {
    showConfirmDialog({
      title: 'Clear Workout Queue',
      message: 'Are you sure you want to clear the workout queue?',
      confirmText: 'Clear',
      destructive: true,
      onConfirm: async () => {
        try {
          await db.clearWorkoutQueue();
          Alert.alert('Success', 'Workout queue has been cleared');
        } catch (error) {
          console.error('Error clearing queue:', error);
          Alert.alert('Error', 'Failed to clear workout queue');
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

        {/* Preferences Section */}
        <ThemedView className="gap-3">
          <ThemedText type="subtitle">Preferences</ThemedText>

          {/* Weight Unit */}
          <ThemedView className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <ThemedText className="font-semibold mb-2">Weight Unit</ThemedText>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => handleUpdatePreference('weightUnit', 'kg')}
                className="flex-1"
                accessibilityRole="button"
                accessibilityState={{ selected: preferences?.weightUnit === 'kg' }}
              >
                {({ pressed }) => (
                  <View
                    className={`py-2 px-4 rounded-lg items-center ${
                      preferences?.weightUnit === 'kg'
                        ? 'bg-blue-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                    } ${pressed ? 'opacity-70' : ''}`}
                  >
                    <ThemedText
                      className={`font-semibold ${
                        preferences?.weightUnit === 'kg' ? 'text-white' : ''
                      }`}
                    >
                      Kilograms (kg)
                    </ThemedText>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => handleUpdatePreference('weightUnit', 'lbs')}
                className="flex-1"
                accessibilityRole="button"
                accessibilityState={{ selected: preferences?.weightUnit === 'lbs' }}
              >
                {({ pressed }) => (
                  <View
                    className={`py-2 px-4 rounded-lg items-center ${
                      preferences?.weightUnit === 'lbs'
                        ? 'bg-blue-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                    } ${pressed ? 'opacity-70' : ''}`}
                  >
                    <ThemedText
                      className={`font-semibold ${
                        preferences?.weightUnit === 'lbs' ? 'text-white' : ''
                      }`}
                    >
                      Pounds (lbs)
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            </View>
          </ThemedView>

          {/* Rest Timer */}
          <ThemedView className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-row items-center justify-between">
            <View className="flex-1">
              <ThemedText className="font-semibold">Rest Timer</ThemedText>
              <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                Show rest timer between sets
              </ThemedText>
            </View>
            <Switch
              value={preferences?.restTimerEnabled ?? true}
              onValueChange={(value) => handleUpdatePreference('restTimerEnabled', value)}
              accessibilityLabel="Toggle rest timer"
            />
          </ThemedView>

          {/* Haptic Feedback */}
          <ThemedView className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-row items-center justify-between">
            <View className="flex-1">
              <ThemedText className="font-semibold">Haptic Feedback</ThemedText>
              <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
                Vibration feedback for actions
              </ThemedText>
            </View>
            <Switch
              value={preferences?.hapticFeedbackEnabled ?? true}
              onValueChange={(value) => handleUpdatePreference('hapticFeedbackEnabled', value)}
              accessibilityLabel="Toggle haptic feedback"
            />
          </ThemedView>
        </ThemedView>

        {/* Data Management */}
        <ThemedView className="gap-3">
          <ThemedText type="subtitle">Data Management</ThemedText>

          <Pressable onPress={handleClearQueue} accessibilityRole="button">
            {({ pressed }) => (
              <View
                className={`p-4 bg-orange-500 rounded-lg ${pressed ? 'opacity-80' : ''}`}
              >
                <ThemedText className="text-white font-semibold text-center">
                  Clear Workout Queue
                </ThemedText>
              </View>
            )}
          </Pressable>

          <Pressable onPress={handleClearWorkoutHistory} accessibilityRole="button">
            {({ pressed }) => (
              <View className={`p-4 bg-red-500 rounded-lg ${pressed ? 'opacity-80' : ''}`}>
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
