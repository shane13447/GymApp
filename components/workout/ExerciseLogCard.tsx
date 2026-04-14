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
import {
  calculateRemainingTime,
  calculateTimerProgress,
  formatTime,
  isValidRemainingTime,
  sanitizeRestTime,
  shouldNotifyTimerComplete
} from '@/lib/timer-utils';
import { formatExerciseDisplayName } from '@/lib/utils';
import * as db from '@/services/database';
import type { WorkoutExercise } from '@/types';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Pressable, TextInput, Vibration, View } from 'react-native';

interface ExerciseLogCardProps {
  exercise: WorkoutExercise;
  index: number;
  // HARDENED KEY FIX: Unique per-exercise instance identity from ActiveWorkout.
  // This disambiguates duplicate exercise names on the same program/day.
  exerciseInstanceId: string;
  programId: string;
  dayNumber: number;
  onUpdateLoggedWeight: (value: string) => void;
  onUpdateLoggedReps: (value: string) => void;
  onUpdateLoggedSetWeight: (setIndex: number, value: string) => void;
  onUpdateLoggedSetReps: (setIndex: number, value: string) => void;
}

export const ExerciseLogCard = memo(function ExerciseLogCard({
  exercise,
  index,
  exerciseInstanceId,
  programId,
  dayNumber,
  onUpdateLoggedWeight,
  onUpdateLoggedReps,
  onUpdateLoggedSetWeight,
  onUpdateLoggedSetReps,
}: ExerciseLogCardProps) {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';
  const displayExerciseName = formatExerciseDisplayName(exercise.name, exercise.variant);
  
  // =============================================================================
  // HARDENED KEY FIX: Timer context for DB operations
  // =============================================================================
  // exerciseInstanceId makes timer identity unique even for duplicate exercise names
  // within the same program/day.
  const timerContext = React.useMemo(() => ({
    exerciseInstanceId,
    exerciseName: exercise.name,
    programId,
    dayNumber,
  }), [exerciseInstanceId, exercise.name, programId, dayNumber]);
  
  // =============================================================================
  // VALIDATION: Check if we have valid context for timer operations
  // =============================================================================
  // WHY THIS MATTERS:
  // Timer persistence requires a valid key (exercise instance, exercise, program, day).
  // If programId is empty, we'd create DB entries with program_id = '' which:
  // 1. Makes debugging harder (what program is '' ?)
  // 2. Could cause unintended collisions between different contexts
  // 3. Is a sign something went wrong upstream
  // 
  // We'll still render the component, but disable timer persistence.
  // The timer UI will work (countdown, vibration) but won't survive app restart.
  const hasValidContext = Boolean(exerciseInstanceId && programId && exercise.name && dayNumber > 0);
  
  // Rest timer state - using end timestamp for persistence
  const [endTimestamp, setEndTimestamp] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [setsCompleted, setSetsCompleted] = useState(0);
  const [timerCompleted, setTimerCompleted] = useState(false);
  // LOADING STATE FIX: Track when async timer operations are in progress
  const [isOperationPending, setIsOperationPending] = useState(false);
  const isOperationPendingRef = useRef(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasVibratedRef = useRef(false);
  
  // =============================================================================
  // FIX: Use a ref to track sets completed count
  // =============================================================================
  // WHY A REF INSTEAD OF EXTRACTING FROM setState?
  // 
  // Old approach:
  //   let newSetsCompleted = 0;
  //   setSetsCompleted(prev => {
  //     newSetsCompleted = prev + 1;  // ← Side effect inside setState!
  //     return newSetsCompleted;
  //   });
  // 
  // Problems with old approach:
  // 1. React StrictMode calls state updaters TWICE to detect side effects
  // 2. The closure variable gets mutated, giving wrong values
  // 3. It's an anti-pattern that React specifically warns against
  // 
  // New approach: Use a ref as the "source of truth" for the count
  // - Refs persist across renders without re-render overhead
  // - We can read/write the ref synchronously
  // - setState is only used to trigger re-renders for the UI
  const setsCompletedRef = useRef(0);
  
  // =============================================================================
  // RACE CONDITION FIX: Mounted state tracking
  // =============================================================================
  // Problem: When component unmounts (e.g., user switches days), async DB operations
  // may still be in-flight and try to update state on an unmounted component.
  // Solution: Track mounted state and check before any state updates or DB calls.
  const isMountedRef = useRef(true);
  
  // =============================================================================
  // RACE CONDITION FIX: Pending operation tracking
  // =============================================================================
  // Problem: Multiple rapid interactions (e.g., start/stop spam) can cause
  // overlapping async DB operations that race against each other.
  // Solution: Track if a clear operation is pending to prevent duplicate calls.
  const pendingClearRef = useRef(false);
  const queuedClearRequestRef = useRef<{ expectedEndTimestamp?: number } | null>(null);
  
  // =============================================================================
  // RACE CONDITION FIX: Stable ref for endTimestamp
  // =============================================================================
  // Problem: AppState listener re-registers every time endTimestamp changes,
  // creating brief windows with no listener and unnecessary overhead.
  // Solution: Use a ref to hold the current endTimestamp for the listener.
  const endTimestampRef = useRef<number | null>(null);
  
  // Keep the ref in sync with state
  useEffect(() => {
    endTimestampRef.current = endTimestamp;
  }, [endTimestamp]);

  // Get rest time in seconds from exercise (defaults to 180)
  // Uses sanitizeRestTime from timer-utils for consistent validation
  const restTimeSeconds = sanitizeRestTime(Number(exercise.restTime));
  
  // Get target sets for display
  const targetSets = Number(exercise.sets) || 0;
  const totalCustomisedSetInputs = targetSets > 0 ? targetSets : 1;
  
  // =============================================================================
  // RACE CONDITION FIX: Safe DB clear operation
  // =============================================================================
  // Problem: Calling db.clearActiveTimer() without await in setInterval/AppState
  // is "fire-and-forget" - if it fails, we never know, and state diverges from DB.
  // Solution: Centralized async function that:
  // 1. Checks if component is still mounted
  // 2. Prevents duplicate concurrent clear operations
  // 3. Properly awaits the DB call with error handling
  // HARDENED KEY FIX: Now uses timerContext with exerciseInstanceId
  const safeClearTimer = useCallback(async (expectedEndTimestamp?: number) => {
    // Don't proceed if component has unmounted
    if (!isMountedRef.current) return;

    // VALIDATION: Skip DB operation if context is invalid
    // Timer will still work locally, just won't persist
    if (!hasValidContext) return;

    // If another clear is already in progress, queue this request instead of dropping it.
    if (pendingClearRef.current) {
      queuedClearRequestRef.current = { expectedEndTimestamp };
      return;
    }

    pendingClearRef.current = true;
    try {
      let clearRequest: { expectedEndTimestamp?: number } | null = { expectedEndTimestamp };

      while (clearRequest) {
        await db.clearActiveTimer(timerContext, clearRequest.expectedEndTimestamp);

        // Consume any queued clear request that arrived while this one was in-flight.
        clearRequest = queuedClearRequestRef.current;
        queuedClearRequestRef.current = null;
      }
    } catch (error) {
      // Only log if still mounted (otherwise we don't care about the error)
      if (isMountedRef.current) {
        console.error('Error clearing timer from DB:', error);
      }
    } finally {
      // Only reset the flag if still mounted
      if (isMountedRef.current) {
        pendingClearRef.current = false;
      }
    }
  }, [timerContext, hasValidContext]);
  
  // =============================================================================
  // DRY FIX: Centralized vibration notification
  // =============================================================================
  // Problem: Vibration logic was duplicated in 3 places with identical patterns.
  // Solution: Single function that handles vibration with the hasVibratedRef guard.
  // BUG (ChatGPT audit): Rest timer uses Vibration only; no audio/sound feedback on completion.
  // Audio feedback is critical for gym environments where the phone may be in a pocket and
  // vibration is easily missed. Fix: Add expo-av audio playback when the planned UI update
  // introduces sound/notification integration.
  const notifyTimerComplete = useCallback(() => {
    if (!hasVibratedRef.current && isMountedRef.current) {
      hasVibratedRef.current = true;
      Vibration.vibrate([0, 500, 200, 500]);
    }
  }, []);

  // =============================================================================
  // Load persisted timer state on mount
  // =============================================================================
  // RACE CONDITION FIX: Check isMountedRef before any state updates.
  // If component unmounts while this async operation is in flight, we skip updates.
  // HARDENED KEY FIX: Uses timerContext with exerciseInstanceId
  useEffect(() => {
    // VALIDATION: Skip loading if context is invalid
    if (!hasValidContext) return;
    
    const loadTimerState = async () => {
      try {
        const savedTimer = await db.getActiveTimer(timerContext);
        
        // RACE CONDITION FIX: Component may have unmounted during the await
        if (!isMountedRef.current) return;
        
        if (savedTimer) {
          const now = Date.now();
          const remaining = calculateRemainingTime(savedTimer.endTimestamp, now);
          
          // Sync both the ref (source of truth) and state (for UI)
          setsCompletedRef.current = savedTimer.setsCompleted;
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
            
            // RACE CONDITION FIX: Use safe clear instead of fire-and-forget
            await safeClearTimer(savedTimer.endTimestamp);
            
            // Vibrate to notify if timer completed recently
            // Uses shouldNotifyTimerComplete from timer-utils
            if (shouldNotifyTimerComplete(savedTimer.endTimestamp, now)) {
              notifyTimerComplete();
            }
          }
        }
      } catch (error) {
        // Only log if still mounted
        if (isMountedRef.current) {
          console.error('Error loading timer state:', error);
        }
      }
    };

    loadTimerState();
  }, [timerContext, safeClearTimer, notifyTimerComplete, hasValidContext]);

  // =============================================================================
  // Handle app state changes (background/foreground)
  // =============================================================================
  // RACE CONDITION FIX: Use endTimestampRef instead of endTimestamp in deps.
  // This prevents the listener from being removed/re-added every time the
  // timestamp changes, which could cause brief windows with no listener.
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // RACE CONDITION FIX: Check mounted state first
      if (!isMountedRef.current) return;
      
      // Use ref to get current timestamp (stable reference)
      const currentEndTimestamp = endTimestampRef.current;
      
      if (nextAppState === 'active' && currentEndTimestamp) {
        // Recalculate remaining time when app becomes active
        const now = Date.now();
        const remaining = calculateRemainingTime(currentEndTimestamp, now);
        
        if (remaining > 0) {
          setTimerSeconds(remaining);
          setIsTimerRunning(true);
        } else if (!hasVibratedRef.current) {
          // Timer completed while in background
          setTimerSeconds(0);
          setIsTimerRunning(false);
          setTimerCompleted(true);
          setEndTimestamp(null);
          
          // DRY FIX: Use centralized notification function
          notifyTimerComplete();
          
          // RACE CONDITION FIX: Use safe clear instead of fire-and-forget
          // Note: We don't await here because we're in an event handler,
          // but safeClearTimer handles errors internally and checks mounted state
          safeClearTimer(currentEndTimestamp);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  // RACE CONDITION FIX: Removed endTimestamp from deps - we use ref instead
  // This makes the listener stable across re-renders
  }, [safeClearTimer, notifyTimerComplete]);

  // =============================================================================
  // Start the rest timer and increment sets completed
  // =============================================================================
  // WHY WE USE A REF FOR SETS COUNT:
  // 
  // We need to:
  // 1. Increment the count
  // 2. Update the UI (state)
  // 3. Save to database (need the new count value)
  // 
  // Using the ref as source of truth:
  // - Increment ref.current (synchronous, immediate)
  // - Update state for UI re-render
  // - Use ref.current for the DB save (guaranteed correct value)
  // 
  // This avoids the anti-pattern of extracting values from inside setState.
  const startTimer = useCallback(async () => {
    // RACE CONDITION FIX: Check mounted state
    if (!isMountedRef.current) return;
    
    if (isOperationPendingRef.current) return;
    isOperationPendingRef.current = true;
    setIsOperationPending(true);
    
    try {
      const newEndTimestamp = Date.now() + restTimeSeconds * 1000;
      
      setsCompletedRef.current += 1;
      const newSetsCompleted = setsCompletedRef.current;
      
      setSetsCompleted(newSetsCompleted);
      
      setEndTimestamp(newEndTimestamp);
      setTimerSeconds(restTimeSeconds);
      setIsTimerRunning(true);
      setTimerCompleted(false);
      hasVibratedRef.current = false;

      if (hasValidContext) {
        await db.saveActiveTimer({
          ...timerContext,
          endTimestamp: newEndTimestamp,
          setsCompleted: newSetsCompleted,
          restDuration: restTimeSeconds,
        });
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('Error saving timer state:', error);
      }
    } finally {
      isOperationPendingRef.current = false;
      if (isMountedRef.current) {
        setIsOperationPending(false);
      }
    }
  }, [restTimeSeconds, timerContext, hasValidContext]);

  // =============================================================================
  // Stop/reset the timer
  // =============================================================================
  // RAPID CLICK FIX: Uses isOperationPending to prevent concurrent operations
  const stopTimer = useCallback(async () => {
    // RACE CONDITION FIX: Check mounted state
    if (!isMountedRef.current) return;
    
    if (isOperationPendingRef.current) return;
    isOperationPendingRef.current = true;
    setIsOperationPending(true);
    
    try {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      setIsTimerRunning(false);
      setTimerSeconds(0);
      setEndTimestamp(null);
      setTimerCompleted(false);

      await safeClearTimer(endTimestampRef.current ?? undefined);
    } finally {
      isOperationPendingRef.current = false;
      if (isMountedRef.current) {
        setIsOperationPending(false);
      }
    }
  }, [safeClearTimer]);

  // =============================================================================
  // Timer countdown effect - recalculates from timestamp each tick
  // =============================================================================
  // RACE CONDITION FIX: Multiple issues addressed here:
  // 1. Fire-and-forget db.clearActiveTimer - now uses safeClearTimer
  // 2. State updates after unmount - now checks isMountedRef
  // 3. Battery drain from 100ms interval - changed to 1000ms
  // CLOCK CHANGE FIX: Added sanity check for unreasonable remaining times
  useEffect(() => {
    if (isTimerRunning && endTimestamp) {
      timerIntervalRef.current = setInterval(() => {
        // RACE CONDITION FIX: Check if still mounted before any state updates
        if (!isMountedRef.current) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          return;
        }
        
        const now = Date.now();
        const remaining = calculateRemainingTime(endTimestamp, now);
        
        // =============================================================================
        // CLOCK CHANGE FIX: Sanity check for device clock manipulation
        // =============================================================================
        // Uses isValidRemainingTime from timer-utils to detect invalid states
        if (!isValidRemainingTime(remaining)) {
          // Timer is in an invalid state - treat as completed
          console.warn(`Timer in invalid state: remaining=${remaining}s, treating as completed`);
          
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          
          setTimerSeconds(0);
          setIsTimerRunning(false);
          setTimerCompleted(true);
          setEndTimestamp(null);
          notifyTimerComplete();
          safeClearTimer(endTimestamp);
          return;
        }
        
        // Cap remaining time at restTimeSeconds (handles minor clock drift backward)
        const clampedRemaining = Math.min(remaining, restTimeSeconds);
        setTimerSeconds(clampedRemaining);
        
        if (clampedRemaining <= 0) {
          // Clear interval immediately to prevent further ticks
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          
          setIsTimerRunning(false);
          setTimerCompleted(true);
          setEndTimestamp(null);
          
          // DRY FIX: Use centralized notification function
          notifyTimerComplete();
          
          // RACE CONDITION FIX: Use safe clear instead of fire-and-forget
          // safeClearTimer handles mounted check and error handling internally
          safeClearTimer(endTimestamp);
        }
      // BATTERY FIX: Changed from 100ms to 1000ms
      // Rationale: For a rest timer, 1-second resolution is perfectly adequate.
      // 100ms was updating UI 10x/sec which drains battery unnecessarily.
      // With timestamp-based calculation, we don't lose accuracy.
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimerRunning, endTimestamp, safeClearTimer, notifyTimerComplete, restTimeSeconds]);

  // =============================================================================
  // Cleanup on unmount
  // =============================================================================
  // RACE CONDITION FIX: This is the CRITICAL cleanup effect.
  // We MUST set isMountedRef to false BEFORE clearing the interval.
  // This ensures that any in-flight interval callbacks will see the unmounted
  // state and bail out before trying to update state.
  useEffect(() => {
    // Mark as mounted when effect runs (component mounts)
    isMountedRef.current = true;
    
    return () => {
      // CRITICAL: Mark unmounted FIRST, before any other cleanup
      // This ensures any async operations in flight will check this and bail
      isMountedRef.current = false;
      
      // Now safe to clear the interval
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, []);

  // Calculate timer progress percentage using utility function
  // Note: formatTime is imported from timer-utils
  const timerProgress = calculateTimerProgress(timerSeconds, restTimeSeconds);

  return (
    <View className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="bg-blue-500 w-8 h-8 rounded-full items-center justify-center">
          <ThemedText className="text-white font-bold text-sm">{index + 1}</ThemedText>
        </View>
        <ThemedText className="font-bold text-lg flex-1">{displayExerciseName}</ThemedText>
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
          {Number(exercise.weight) > 0 && (
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
        {exercise.hasCustomisedSets ? (
          <View className="gap-3">
            <ThemedText className="text-sm font-semibold">Customised Sets Logged</ThemedText>
            {Array.from({ length: totalCustomisedSetInputs }).map((_, setIndex) => {
              const setNumber = setIndex + 1;
              const currentSetWeight = exercise.loggedSetWeights[setIndex] ?? 0;
              const currentSetReps = exercise.loggedSetReps[setIndex] ?? 0;

              return (
                <ThemedView
                  key={`${exercise.name}-set-${setNumber}`}
                  className="gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <ThemedText className="text-sm font-semibold">Set {setNumber}</ThemedText>
                  <View className="flex-row gap-2">
                    <View className="flex-1 gap-1">
                      <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Weight</ThemedText>
                      <TextInput
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                        placeholder="Weight"
                        placeholderTextColor="#999"
                        value={currentSetWeight === 0 ? '' : currentSetWeight.toString()}
                        onChangeText={(value) => onUpdateLoggedSetWeight(setIndex, value)}
                        keyboardType="decimal-pad"
                        style={{ color: textColor }}
                        accessibilityLabel={`Log weight for ${displayExerciseName} set ${setNumber}`}
                      />
                    </View>
                    <View className="flex-1 gap-1">
                      <ThemedText className="text-xs text-gray-500 dark:text-gray-400">Reps</ThemedText>
                      <TextInput
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                        placeholder="Reps"
                        placeholderTextColor="#999"
                        value={currentSetReps === 0 ? '' : currentSetReps.toString()}
                        onChangeText={(value) => onUpdateLoggedSetReps(setIndex, value)}
                        keyboardType="numeric"
                        style={{ color: textColor }}
                        accessibilityLabel={`Log reps for ${displayExerciseName} set ${setNumber}`}
                      />
                    </View>
                  </View>
                </ThemedView>
              );
            })}
          </View>
        ) : (
          <>
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
                accessibilityLabel={`Log weight for ${displayExerciseName}`}
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
                accessibilityLabel={`Log reps for ${displayExerciseName}`}
              />
            </ThemedView>
          </>
        )}
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
            {/* RAPID CLICK FIX: Disable button while operation is pending */}
            <Pressable
              onPress={stopTimer}
              disabled={isOperationPending}
              accessibilityRole="button"
              accessibilityLabel="Stop rest timer"
            >
              {({ pressed }) => (
                <View
                  className={`rounded-full py-3 px-6 ${isOperationPending ? 'bg-red-300' : 'bg-red-500'}`}
                  style={pressed && !isOperationPending && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                >
                  <ThemedText className="text-white text-center font-semibold">
                    {isOperationPending ? '...' : '✕ Stop Timer'}
                  </ThemedText>
                </View>
              )}
            </Pressable>
          </View>
        ) : (
          <View className="gap-2">
            {!timerCompleted ? (
              /* RAPID CLICK FIX: Disable button while operation is pending */
              <Pressable
                onPress={startTimer}
                disabled={isOperationPending}
                accessibilityRole="button"
                accessibilityLabel={`Start ${restTimeSeconds} second rest timer`}
              >
                {({ pressed }) => (
                  <View
                    className={`rounded-full py-3 px-6 ${isOperationPending ? 'bg-orange-300' : 'bg-orange-500'}`}
                    style={pressed && !isOperationPending && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                  >
                    <ThemedText className="text-white text-center font-semibold">
                      {isOperationPending ? '...' : `⏱ Start Rest Timer (${formatTime(restTimeSeconds)})`}
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
                {/* RAPID CLICK FIX: Disable button while operation is pending */}
                <Pressable
                  onPress={startTimer}
                  disabled={isOperationPending}
                  accessibilityRole="button"
                  accessibilityLabel="Restart rest timer"
                >
                  {({ pressed }) => (
                    <View
                      className={`rounded-full py-2 px-4 ${isOperationPending ? 'bg-orange-300' : 'bg-orange-500'}`}
                      style={pressed && !isOperationPending && { opacity: 0.8 }}
                    >
                      <ThemedText className="text-white text-center font-semibold text-sm">
                        {isOperationPending ? '...' : '↻ Restart Timer'}
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
