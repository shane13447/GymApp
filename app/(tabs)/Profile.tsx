/**
 * Profile Screen
 * User profile information and training preferences
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { showConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MuscleGroupTargetsModal } from '@/components/MuscleGroupTargetsModal';
import { TRAINING_GOAL_LABELS, MUSCLE_GROUPS } from '@/constants';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { validatePositiveDecimal, validatePositiveInteger } from '@/lib/validation';
import * as db from '@/services/database';
import { TrainingGoal, type MuscleGroupTarget, type UserProfile } from '@/types';

// Training goal options for button selection
const TRAINING_GOALS = [
  { value: TrainingGoal.Strength, label: TRAINING_GOAL_LABELS.strength },
  { value: TrainingGoal.Hypertrophy, label: TRAINING_GOAL_LABELS.hypertrophy },
  { value: TrainingGoal.ImproveOverallHealth, label: TRAINING_GOAL_LABELS.improve_overall_health },
];

/**
 * Custom hook for numeric input fields with validation and auto-save
 */
const useNumericInput = (
  initialValue: number | null,
  validate: (input: string) => { value: number | null; isValid: boolean; error: string | null },
  onSave: (value: number | null) => Promise<void>
) => {
  const [localValue, setLocalValue] = useState(initialValue?.toString() || '');
  const [error, setError] = useState<string | null>(null);
  const isFocusedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Sync from parent when value changes externally (only if not focused)
  useEffect(() => {
    if (isFocusedRef.current) return;
    setLocalValue(initialValue?.toString() || '');
  }, [initialValue]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleChange = useCallback((text: string) => {
    setLocalValue(text);
    setError(null);
  }, []);

  const handleBlur = useCallback(async () => {
    isFocusedRef.current = false;
    const result = validate(localValue);
    
    if (!result.isValid) {
      setError(result.error);
      return;
    }
    
    setError(null);
    // Normalize display value
    setLocalValue(result.value?.toString() || '');
    // Save to database
    await onSaveRef.current(result.value);
  }, [localValue, validate]);

  return { localValue, error, handleFocus, handleChange, handleBlur };
};

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [muscleGroupTargets, setMuscleGroupTargets] = useState<MuscleGroupTarget[]>([]);
  const [showMuscleTargetsModal, setShowMuscleTargetsModal] = useState(false);
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalPrograms: 0,
  });

  // Name input state
  const [name, setName] = useState('');
  const nameTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [workouts, programs, userProfile, targets] = await Promise.all([
        db.getAllWorkouts(),
        db.getAllPrograms(),
        db.getUserProfile(),
        db.getMuscleGroupTargets(),
      ]);

      setStats({
        totalWorkouts: workouts.length,
        totalPrograms: programs.length,
      });
      setProfile(userProfile);
      setName(userProfile.name || '');
      setMuscleGroupTargets(targets);
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save name with debounce
  const handleNameChange = useCallback((text: string) => {
    setName(text);
    
    // Clear existing timeout
    if (nameTimeoutRef.current) {
      clearTimeout(nameTimeoutRef.current);
    }
    
    // Debounce save
    nameTimeoutRef.current = setTimeout(async () => {
      try {
        await db.updateUserProfile({ name: text || null });
      } catch (error) {
        console.error('Error saving name:', error);
      }
    }, 500);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (nameTimeoutRef.current) {
        clearTimeout(nameTimeoutRef.current);
      }
    };
  }, []);

  // Weight inputs with validation
  const currentWeightInput = useNumericInput(
    profile?.currentWeight ?? null,
    validatePositiveDecimal,
    async (value) => {
      await db.updateUserProfile({ currentWeight: value });
      setProfile((prev) => prev ? { ...prev, currentWeight: value } : null);
    }
  );

  const goalWeightInput = useNumericInput(
    profile?.goalWeight ?? null,
    validatePositiveDecimal,
    async (value) => {
      await db.updateUserProfile({ goalWeight: value });
      setProfile((prev) => prev ? { ...prev, goalWeight: value } : null);
    }
  );

  const targetSetsInput = useNumericInput(
    profile?.targetSetsPerWeek ?? null,
    validatePositiveInteger,
    async (value) => {
      await db.updateUserProfile({ targetSetsPerWeek: value });
      setProfile((prev) => prev ? { ...prev, targetSetsPerWeek: value } : null);
    }
  );

  // Training goal selection
  const handleTrainingGoalSelect = useCallback(async (goal: TrainingGoal) => {
    try {
      await db.updateUserProfile({ trainingGoal: goal });
      setProfile((prev) => prev ? { ...prev, trainingGoal: goal } : null);
    } catch (error) {
      console.error('Error saving training goal:', error);
      Alert.alert('Error', 'Failed to save training goal');
    }
  }, []);

  // Muscle group targets modal
  const handleOpenMuscleTargets = useCallback(() => {
    setShowMuscleTargetsModal(true);
  }, []);

  const handleSaveMuscleTargets = useCallback(async (targets: MuscleGroupTarget[]) => {
    try {
      await db.saveMuscleGroupTargets(targets);
      setMuscleGroupTargets(targets);
      setShowMuscleTargetsModal(false);
    } catch (error) {
      console.error('Error saving muscle group targets:', error);
      Alert.alert('Error', 'Failed to save muscle group targets');
    }
  }, []);

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
        {/* Profile Information Section */}
        <ThemedView className="gap-4">
          <ThemedText type="subtitle">Profile Information</ThemedText>

          {/* Name */}
          <ThemedView className="gap-1">
            <ThemedText className="text-sm font-semibold">Name</ThemedText>
            <TextInput
              className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-3 text-base"
              placeholder="Enter your name"
              placeholderTextColor="#999"
              value={name}
              onChangeText={handleNameChange}
              style={{ color: textColor }}
              accessibilityLabel="Name"
              autoCapitalize="words"
            />
          </ThemedView>

          {/* Current Weight */}
          <ThemedView className="gap-1">
            <ThemedText className="text-sm font-semibold">Current Weight (kg)</ThemedText>
            <TextInput
              className={`bg-white dark:bg-gray-700 border rounded-lg px-3 py-3 text-base ${
                currentWeightInput.error 
                  ? 'border-red-500' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="e.g., 72.5"
              placeholderTextColor="#999"
              value={currentWeightInput.localValue}
              onFocus={currentWeightInput.handleFocus}
              onChangeText={currentWeightInput.handleChange}
              onBlur={currentWeightInput.handleBlur}
              keyboardType="decimal-pad"
              style={{ color: textColor }}
              accessibilityLabel="Current weight"
            />
            {currentWeightInput.error && (
              <ThemedText className="text-xs text-red-500">{currentWeightInput.error}</ThemedText>
            )}
          </ThemedView>

          {/* Goal Weight */}
          <ThemedView className="gap-1">
            <ThemedText className="text-sm font-semibold">Goal Weight (kg)</ThemedText>
            <TextInput
              className={`bg-white dark:bg-gray-700 border rounded-lg px-3 py-3 text-base ${
                goalWeightInput.error 
                  ? 'border-red-500' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="e.g., 75.0"
              placeholderTextColor="#999"
              value={goalWeightInput.localValue}
              onFocus={goalWeightInput.handleFocus}
              onChangeText={goalWeightInput.handleChange}
              onBlur={goalWeightInput.handleBlur}
              keyboardType="decimal-pad"
              style={{ color: textColor }}
              accessibilityLabel="Goal weight"
            />
            {goalWeightInput.error && (
              <ThemedText className="text-xs text-red-500">{goalWeightInput.error}</ThemedText>
            )}
          </ThemedView>
        </ThemedView>

        {/* Training Goals Section */}
        <ThemedView className="gap-4">
          <ThemedText type="subtitle">Training Goal</ThemedText>
          <ThemedView className="gap-2">
            {TRAINING_GOALS.map((goal) => (
              <Pressable
                key={goal.value}
                onPress={() => handleTrainingGoalSelect(goal.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: profile?.trainingGoal === goal.value }}
              >
                {({ pressed }) => (
                  <View
                    className={`p-4 rounded-full border-2 ${
                      profile?.trainingGoal === goal.value
                        ? 'bg-blue-500 border-blue-500'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                    } ${pressed ? 'opacity-80' : ''}`}
                  >
                    <ThemedText
                      className={`font-semibold text-center ${
                        profile?.trainingGoal === goal.value
                          ? 'text-white'
                          : ''
                      }`}
                    >
                      {goal.label}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            ))}
          </ThemedView>
        </ThemedView>

        {/* Weekly Volume Section */}
        <ThemedView className="gap-4">
          <ThemedText type="subtitle">Weekly Volume</ThemedText>

          {/* Target Sets Per Week */}
          <ThemedView className="gap-1">
            <ThemedText className="text-sm font-semibold">Target Sets Per Week (Global)</ThemedText>
            <TextInput
              className={`bg-white dark:bg-gray-700 border rounded-lg px-3 py-3 text-base ${
                targetSetsInput.error 
                  ? 'border-red-500' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="e.g., 10"
              placeholderTextColor="#999"
              value={targetSetsInput.localValue}
              onFocus={targetSetsInput.handleFocus}
              onChangeText={targetSetsInput.handleChange}
              onBlur={targetSetsInput.handleBlur}
              keyboardType="number-pad"
              style={{ color: textColor }}
              accessibilityLabel="Target sets per week"
            />
            {targetSetsInput.error && (
              <ThemedText className="text-xs text-red-500">{targetSetsInput.error}</ThemedText>
            )}
            <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This is the default target for all muscle groups
            </ThemedText>
          </ThemedView>

          {/* Customize Per Muscle Group Button */}
          <Pressable onPress={handleOpenMuscleTargets} accessibilityRole="button">
            {({ pressed }) => (
              <View
                className={`p-4 bg-gray-200 dark:bg-gray-700 rounded-full ${pressed ? 'opacity-80' : ''}`}
              >
                <View className="flex-row items-center justify-between">
                  <ThemedText className="font-semibold">
                    Customize Target Sets Per Muscle Group
                  </ThemedText>
                  <ThemedText className="text-gray-500 dark:text-gray-400">
                    {muscleGroupTargets.length > 0 
                      ? `${muscleGroupTargets.length} custom` 
                      : '→'}
                  </ThemedText>
                </View>
              </View>
            )}
          </Pressable>
        </ThemedView>

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

      {/* Muscle Group Targets Modal */}
      <MuscleGroupTargetsModal
        visible={showMuscleTargetsModal}
        onClose={() => setShowMuscleTargetsModal(false)}
        onSave={handleSaveMuscleTargets}
        initialTargets={muscleGroupTargets}
        globalTarget={profile?.targetSetsPerWeek ?? null}
        muscleGroups={[...MUSCLE_GROUPS]}
      />
    </ParallaxScrollView>
  );
}
