/**
 * Exercise Log Card Component
 * Displays exercise with input fields for logging weight and reps
 * Includes a rest timer that counts down based on the exercise's restTime
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View, Vibration } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import type { WorkoutExercise } from '@/types';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ExerciseLogCardProps {
  exercise: WorkoutExercise;
  index: number;
  onUpdateLoggedWeight: (value: string) => void;
  onUpdateLoggedReps: (value: string) => void;
}

export const ExerciseLogCard = memo(function ExerciseLogCard({
  exercise,
  index,
  onUpdateLoggedWeight,
  onUpdateLoggedReps,
}: ExerciseLogCardProps) {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';
  
  // Rest timer state
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [setsCompleted, setSetsCompleted] = useState(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get rest time in seconds from exercise (defaults to 180)
  const restTimeSeconds = exercise.restTime || 180;
  
  // Get target sets for display
  const targetSets = exercise.sets || 0;

  // Start the rest timer and increment sets completed
  const startTimer = useCallback(() => {
    setSetsCompleted((prev) => prev + 1);
    setTimerSeconds(restTimeSeconds);
    setIsTimerRunning(true);
  }, [restTimeSeconds]);

  // Stop/reset the timer
  const stopTimer = useCallback(() => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Timer countdown effect
  useEffect(() => {
    if (isTimerRunning && timerSeconds > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            // Vibrate when timer completes
            Vibration.vibrate([0, 500, 200, 500]);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimerRunning, timerSeconds]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate timer progress percentage
  const timerProgress = timerSeconds > 0 ? (timerSeconds / restTimeSeconds) * 100 : 0;

  return (
    <View className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="bg-blue-500 w-8 h-8 rounded-full items-center justify-center">
          <ThemedText className="text-white font-bold text-sm">{index + 1}</ThemedText>
        </View>
        <ThemedText className="font-bold text-lg flex-1">{exercise.name}</ThemedText>
      </View>

      {/* Equipment & Muscles */}
      <Collapsible title="Equipment & Muscles Worked">
        <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Equipment: {exercise.equipment || 'None'}
        </ThemedText>
        <View className="flex-row flex-wrap gap-1">
          {exercise.muscle_groups_worked.map((group) => (
            <View key={group} className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
              <ThemedText className="text-xs capitalize">{group}</ThemedText>
            </View>
          ))}
        </View>
      </Collapsible>

      {/* Target Values */}
      <View className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <View className="flex-row flex-wrap gap-3 mb-3">
          {exercise.sets && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Sets</ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.sets}</ThemedText>
            </View>
          )}
          {exercise.reps && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                Target Reps
              </ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.reps}</ThemedText>
            </View>
          )}
          {exercise.weight !== undefined && exercise.weight !== 0 && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                Target Weight
              </ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.weight}</ThemedText>
            </View>
          )}
          {exercise.restTime && (
            <View>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Rest</ThemedText>
              <ThemedText className="text-base font-semibold">{exercise.restTime}s</ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* Logged Values Input */}
      <View className="mt-3 gap-3">
        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Weight Logged</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="Enter weight used..."
            placeholderTextColor="#999"
            value={exercise.loggedWeight === 0 ? '' : exercise.loggedWeight.toString()}
            onChangeText={onUpdateLoggedWeight}
            keyboardType="decimal-pad"
            style={{ color: textColor }}
            accessibilityLabel={`Log weight for ${exercise.name}`}
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Reps Logged</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="Enter reps completed..."
            placeholderTextColor="#999"
            value={exercise.loggedReps === 0 ? '' : exercise.loggedReps.toString()}
            onChangeText={onUpdateLoggedReps}
            keyboardType="numeric"
            style={{ color: textColor }}
            accessibilityLabel={`Log reps for ${exercise.name}`}
          />
        </ThemedView>
      </View>

      {/* Rest Timer */}
      <View className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <View className="flex-row items-center justify-between mb-3">
          <ThemedText className="text-sm font-semibold">Rest Timer</ThemedText>
          
          {/* Sets Completed Counter */}
          <View className="flex-row items-center gap-2">
            <View className={`px-3 py-1.5 rounded-full ${
              setsCompleted >= targetSets && targetSets > 0
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-blue-100 dark:bg-blue-900/30'
            }`}>
              <ThemedText className={`font-bold text-base ${
                setsCompleted >= targetSets && targetSets > 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`}>
                {setsCompleted}{targetSets > 0 ? `/${targetSets}` : ''}
              </ThemedText>
            </View>
            <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
              Sets Completed
            </ThemedText>
          </View>
        </View>
        
        {isTimerRunning ? (
          <View className="gap-3">
            {/* Timer Display */}
            <View className="items-center">
              <ThemedText className="text-4xl font-bold text-orange-500">
                {formatTime(timerSeconds)}
              </ThemedText>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatTime(restTimeSeconds)} rest period
              </ThemedText>
            </View>

            {/* Progress Bar */}
            <View className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <View 
                className="h-full bg-orange-500 rounded-full"
                style={{ width: `${timerProgress}%` }}
              />
            </View>

            {/* Stop Button */}
            <Pressable
              onPress={stopTimer}
              accessibilityRole="button"
              accessibilityLabel="Stop rest timer"
            >
              {({ pressed }) => (
                <View
                  className="bg-red-500 rounded-full py-3 px-6"
                  style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                >
                  <ThemedText className="text-white text-center font-semibold">
                    ✕ Stop Timer
                  </ThemedText>
                </View>
              )}
            </Pressable>
          </View>
        ) : (
          <View className="gap-2">
            {timerSeconds === 0 && !isTimerRunning && timerIntervalRef.current === null ? (
              <Pressable
                onPress={startTimer}
                accessibilityRole="button"
                accessibilityLabel={`Start ${restTimeSeconds} second rest timer`}
              >
                {({ pressed }) => (
                  <View
                    className="bg-orange-500 rounded-full py-3 px-6"
                    style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                  >
                    <ThemedText className="text-white text-center font-semibold">
                      ⏱ Start Rest Timer ({formatTime(restTimeSeconds)})
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            ) : (
              <View className="items-center gap-3">
                <View className="bg-green-100 dark:bg-green-900/30 rounded-full px-4 py-2">
                  <ThemedText className="text-green-700 dark:text-green-300 font-semibold">
                    ✓ Rest Complete!
                  </ThemedText>
                </View>
                <Pressable
                  onPress={startTimer}
                  accessibilityRole="button"
                  accessibilityLabel="Restart rest timer"
                >
                  {({ pressed }) => (
                    <View
                      className="bg-orange-500 rounded-full py-2 px-4"
                      style={pressed && { opacity: 0.8 }}
                    >
                      <ThemedText className="text-white text-center font-semibold text-sm">
                        ↻ Restart Timer
                      </ThemedText>
                    </View>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

export default ExerciseLogCard;
