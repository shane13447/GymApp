/**
 * Profile Screen
 * User profile information and training preferences
 */

import React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import { MuscleGroupTargetsModal } from '@/components/MuscleGroupTargetsModal';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MUSCLE_GROUPS, TRAINING_GOAL_LABELS } from '@/constants';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProfileScreen } from '@/hooks/use-profile-screen';
import { TrainingGoal, type ExperienceLevel } from '@/types';

const TRAINING_GOALS = [
  { value: TrainingGoal.Strength, label: TRAINING_GOAL_LABELS.strength },
  { value: TrainingGoal.Hypertrophy, label: TRAINING_GOAL_LABELS.hypertrophy },
  { value: TrainingGoal.ImproveOverallHealth, label: TRAINING_GOAL_LABELS.improve_overall_health },
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const SESSION_DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2+ hours', value: 120 },
];

/**
 * Renders the Profile screen while delegating persistence and autosave behavior to useProfileScreen.
 * The component focuses on presentation and wiring screen controls to the extracted controller hook.
 */
export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';
  const {
    isLoading,
    profile,
    muscleGroupTargets,
    showMuscleTargetsModal,
    showAdvancedSettings,
    stats,
    name,
    currentWeightInput,
    goalWeightInput,
    trainingDaysInput,
    targetSetsInput,
    handleNameChange,
    handleSessionDurationSelect,
    handleExperienceLevelSelect,
    handleTrainingGoalSelect,
    handleOpenMuscleTargets,
    handleCloseMuscleTargets,
    toggleAdvancedSettings,
    handleSaveMuscleTargets,
    handleClearWorkoutHistory,
  } = useProfileScreen();

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
        <ThemedView className="gap-4">
          <ThemedText type="subtitle">Profile Information</ThemedText>

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
            {currentWeightInput.error ? (
              <ThemedText className="text-xs text-red-500">{currentWeightInput.error}</ThemedText>
            ) : null}
          </ThemedView>

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
            {goalWeightInput.error ? (
              <ThemedText className="text-xs text-red-500">{goalWeightInput.error}</ThemedText>
            ) : null}
          </ThemedView>
        </ThemedView>

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
                        profile?.trainingGoal === goal.value ? 'text-white' : ''
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

        <ThemedView className="gap-4">
          <ThemedText type="subtitle">Training Context</ThemedText>

          <ThemedView className="gap-2">
            <ThemedText className="text-sm font-semibold">Experience Level</ThemedText>
            {EXPERIENCE_LEVELS.map((level) => (
              <Pressable
                key={level.value}
                onPress={() => handleExperienceLevelSelect(level.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: profile?.experienceLevel === level.value }}
              >
                {({ pressed }) => (
                  <View
                    className={`p-4 rounded-full border-2 ${
                      profile?.experienceLevel === level.value
                        ? 'bg-blue-500 border-blue-500'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                    } ${pressed ? 'opacity-80' : ''}`}
                  >
                    <ThemedText
                      className={`font-semibold text-center ${
                        profile?.experienceLevel === level.value ? 'text-white' : ''
                      }`}
                    >
                      {level.label}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            ))}
          </ThemedView>

          <ThemedView className="gap-1">
            <ThemedText className="text-sm font-semibold">Training Days per Week</ThemedText>
            <TextInput
              className={`bg-white dark:bg-gray-700 border rounded-lg px-3 py-3 text-base ${
                trainingDaysInput.error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="e.g., 4"
              placeholderTextColor="#999"
              value={trainingDaysInput.localValue}
              onFocus={trainingDaysInput.handleFocus}
              onChangeText={trainingDaysInput.handleChange}
              onBlur={trainingDaysInput.handleBlur}
              keyboardType="number-pad"
              style={{ color: textColor }}
              accessibilityLabel="Training days per week"
            />
            {trainingDaysInput.error ? (
              <ThemedText className="text-xs text-red-500">{trainingDaysInput.error}</ThemedText>
            ) : null}
          </ThemedView>

          <ThemedView className="gap-1">
            <ThemedText className="text-sm font-semibold">Session Duration</ThemedText>
            <View className="gap-2">
              {SESSION_DURATION_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleSessionDurationSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: profile?.sessionDurationMinutes === option.value }}
                >
                  {({ pressed }) => (
                    <View
                      className={`p-4 rounded-full border-2 ${
                        profile?.sessionDurationMinutes === option.value
                          ? 'bg-blue-500 border-blue-500'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                      } ${pressed ? 'opacity-80' : ''}`}
                    >
                      <ThemedText
                        className={`font-semibold text-center ${
                          profile?.sessionDurationMinutes === option.value ? 'text-white' : ''
                        }`}
                      >
                        {option.label}
                      </ThemedText>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </ThemedView>
        </ThemedView>

        <ThemedView className="gap-4">
          <ThemedText type="subtitle">Weekly Volume</ThemedText>

          <Pressable
            onPress={toggleAdvancedSettings}
            accessibilityRole="button"
            accessibilityLabel="Toggle advanced settings"
          >
            {({ pressed }) => (
              <View className={`p-4 bg-gray-200 dark:bg-gray-700 rounded-full ${pressed ? 'opacity-80' : ''}`}>
                <View className="flex-row items-center justify-between">
                  <ThemedText className="font-semibold">Advanced Settings</ThemedText>
                  <ThemedText className="text-gray-500 dark:text-gray-400">
                    {showAdvancedSettings ? 'Hide' : 'Show'}
                  </ThemedText>
                </View>
              </View>
            )}
          </Pressable>

          {showAdvancedSettings ? (
            <>
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
                {targetSetsInput.error ? (
                  <ThemedText className="text-xs text-red-500">{targetSetsInput.error}</ThemedText>
                ) : null}
                <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This is the default target for all muscle groups
                </ThemedText>
              </ThemedView>

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
                          : 'Open'}
                      </ThemedText>
                    </View>
                  </View>
                )}
              </Pressable>
            </>
          ) : null}
        </ThemedView>

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

        <ThemedView className="gap-2 mt-4 items-center">
          <ThemedText className="text-sm text-gray-500 dark:text-gray-400">
            Shane&apos;s Gym App v1.0.0
          </ThemedText>
          <ThemedText className="text-xs text-gray-400 dark:text-gray-500">
            Powered by on-device AI
          </ThemedText>
        </ThemedView>
      </ThemedView>

      <MuscleGroupTargetsModal
        visible={showMuscleTargetsModal}
        onClose={handleCloseMuscleTargets}
        onSave={handleSaveMuscleTargets}
        initialTargets={muscleGroupTargets}
        globalTarget={profile?.targetSetsPerWeek ?? null}
        muscleGroups={[...MUSCLE_GROUPS]}
      />
    </ParallaxScrollView>
  );
}
