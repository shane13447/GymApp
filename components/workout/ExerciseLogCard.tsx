/**
 * Exercise Log Card Component
 * Displays exercise with input fields for logging weight and reps
 * Includes a rest timer that counts down based on the exercise's restTime
 * Timer persists across navigation and device lock using timestamp-based approach
 */

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as db from '@/services/database';
import type { WorkoutExercise } from '@/types';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Pressable, TextInput, Vibration, View } from 'react-native';

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
  
  // Rest timer state - using end timestamp for persistence
  const [endTimestamp, setEndTimestamp] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [setsCompleted, setSetsCompleted] = useState(0);
  const [timerCompleted, setTimerCompleted] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasVibratedRef = useRef(false);
  const isInitializedRef = useRef(false);

  // Get rest time in seconds from exercise (defaults to 180)
  const restTimeSeconds = exercise.restTime || 180;
  
  // Get target sets for display
  const targetSets = exercise.sets || 0;

  // Load persisted timer state on mount
  useEffect(() => {
    const loadTimerState = async () => {
      try {
        const savedTimer = await db.getActiveTimer(exercise.name);
        if (savedTimer) {
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((savedTimer.endTimestamp - now) / 1000));
          
          setSetsCompleted(savedTimer.setsCompleted);
          
          if (remaining > 0) {
            // Timer is still running
            setEndTimestamp(savedTimer.endTimestamp);
            setTimerSeconds(remaining);
            setIsTimerRunning(true);
            setTimerCompleted(false);
            hasVibratedRef.current = false;
          } else {
            // Timer has finished while away
            setTimerSeconds(0);
            setIsTimerRunning(false);
            setTimerCompleted(true);
            // Clear from database
            await db.clearActiveTimer(exercise.name);
            // Vibrate to notify if timer just completed
            if (savedTimer.endTimestamp > now - 60000) { // Within last minute
              Vibration.vibrate([0, 500, 200, 500]);
            }
          }
        }
        isInitializedRef.current = true;
      } catch (error) {
        console.error('Error loading timer state:', error);
        isInitializedRef.current = true;
      }
    };

    loadTimerState();
  }, [exercise.name]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && endTimestamp) {
        // Recalculate remaining time when app becomes active
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTimestamp - now) / 1000));
        
        if (remaining > 0) {
          setTimerSeconds(remaining);
          setIsTimerRunning(true);
        } else if (!hasVibratedRef.current) {
          // Timer completed while in background
          setTimerSeconds(0);
          setIsTimerRunning(false);
          setTimerCompleted(true);
          setEndTimestamp(null);
          hasVibratedRef.current = true;
          Vibration.vibrate([0, 500, 200, 500]);
          db.clearActiveTimer(exercise.name);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [endTimestamp, exercise.name]);

  // Start the rest timer and increment sets completed
  const startTimer = useCallback(async () => {
    const newSetsCompleted = setsCompleted + 1;
    const newEndTimestamp = Date.now() + restTimeSeconds * 1000;
    
    setSetsCompleted(newSetsCompleted);
    setEndTimestamp(newEndTimestamp);
    setTimerSeconds(restTimeSeconds);
    setIsTimerRunning(true);
    setTimerCompleted(false);
    hasVibratedRef.current = false;

    // Persist to database
    try {
      await db.saveActiveTimer({
        exerciseName: exercise.name,
        endTimestamp: newEndTimestamp,
        setsCompleted: newSetsCompleted,
        restDuration: restTimeSeconds,
      });
    } catch (error) {
      console.error('Error saving timer state:', error);
    }
  }, [restTimeSeconds, setsCompleted, exercise.name]);

  // Stop/reset the timer
  const stopTimer = useCallback(async () => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
    setEndTimestamp(null);
    setTimerCompleted(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Clear from database
    try {
      await db.clearActiveTimer(exercise.name);
    } catch (error) {
      console.error('Error clearing timer state:', error);
    }
  }, [exercise.name]);

  // Timer countdown effect - recalculates from timestamp each tick
  useEffect(() => {
    if (isTimerRunning && endTimestamp) {
      timerIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTimestamp - now) / 1000));
        
        setTimerSeconds(remaining);
        
        if (remaining <= 0) {
          setIsTimerRunning(false);
          setTimerCompleted(true);
          setEndTimestamp(null);
          
          if (!hasVibratedRef.current) {
            hasVibratedRef.current = true;
            Vibration.vibrate([0, 500, 200, 500]);
          }
          
          // Clear from database
          db.clearActiveTimer(exercise.name);
          
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
        }
      }, 100); // Update more frequently for accuracy
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimerRunning, endTimestamp, exercise.name]);

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
            {!timerCompleted ? (
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
