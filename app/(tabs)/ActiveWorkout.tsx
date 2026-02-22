/**
 * Active Workout Screen
 * Track and log an active workout session
 */

import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DaySelector } from '@/components/workout/DaySelector';
import { ExerciseLogCard } from '@/components/workout/ExerciseLogCard';
import * as db from '@/services/database';
import type {
  Program,
  ProgramExercise,
  Workout,
  WorkoutExercise,
  WorkoutQueueItem,
} from '@/types';

export default function ActiveWorkout() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [workoutQueue, setWorkoutQueue] = useState<WorkoutQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingFromQueue, setLoadingFromQueue] = useState(false);
  const [isLoadedFromQueue, setIsLoadedFromQueue] = useState(false);
  const queueLoadedRef = useRef(false);
  
  // =============================================================================
  // UNDO SUPPORT: Track the original queue state when screen loads
  // =============================================================================
  // This enables "undo" when user goes backward (e.g., Day 1 → Day 2 → Day 1).
  // Without this, each day change would skip relative to the current queue,
  // causing forward-only movement. With originalQueue, going back to Day 1
  // restores the queue to start from Day 1 (as it was originally).
  const originalQueueRef = useRef<WorkoutQueueItem[] | null>(null);
  
  // =============================================================================
  // STALE LOAD FIX: Track which day-load request is "current"
  // =============================================================================
  // Problem: User switches Day 1 → Day 2 → Day 3 rapidly. The async loads for
  // Day 2 and Day 3 race. If Day 2's load finishes last, it overwrites Day 3's
  // exercises, leaving the UI showing Day 3 selected but Day 2's exercises.
  //
  // Solution: Increment a counter on each day change. After the async load,
  // check if the counter still matches. If not, discard the stale result.
  const dayLoadRequestRef = useRef(0);

  // Load programs on mount
  useEffect(() => {
    loadPrograms();
  }, []);

  // Reload queue when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      queueLoadedRef.current = false;
      originalQueueRef.current = null; // Reset original queue on focus
      setIsLoadedFromQueue(false);
      reloadQueue();
    }, [])
  );

  // Load from workout queue if available
  useEffect(() => {
    if (workoutQueue.length > 0 && programs.length > 0 && !queueLoadedRef.current) {
      queueLoadedRef.current = true;
      setIsLoadedFromQueue(true);
      loadWorkoutFromQueue();
    }
  }, [workoutQueue, programs]);

  // Initialize workout queue when program changes
  useEffect(() => {
    if (currentProgram && workoutQueue.length === 0 && !queueLoadedRef.current) {
      initializeWorkoutQueue(currentProgram);
    }
  }, [currentProgram, workoutQueue.length]);

  // Initialize workout exercises when program or day changes
  useEffect(() => {
    if (
      currentProgram &&
      currentProgram.workoutDays.length > 0 &&
      !loadingFromQueue &&
      workoutQueue.length === 0 &&
      !isLoadedFromQueue
    ) {
      initializeWorkoutExercises();
    }
  }, [currentProgram, selectedDayIndex, loadingFromQueue, isLoadedFromQueue, workoutQueue.length]);

  const reloadQueue = async () => {
    try {
      const queue = await db.getWorkoutQueue();
      setWorkoutQueue(queue);
      
      // Store as original queue if not yet set (first load after focus)
      // This enables undo support when user changes days back and forth
      if (originalQueueRef.current === null && queue.length > 0) {
        originalQueueRef.current = queue;
      }
    } catch (error) {
      console.error('Error loading workout queue:', error);
    }
  };

  const loadPrograms = async () => {
    try {
      setIsLoading(true);
      const loadedPrograms = await db.getAllPrograms();
      setPrograms(loadedPrograms);

      const currentProgramId = await db.getCurrentProgramId();
      if (currentProgramId) {
        const program = loadedPrograms.find((p) => p.id === currentProgramId);
        if (program) {
          setCurrentProgram(program);
          setIsLoading(false);
          return;
        }
      }

      if (loadedPrograms.length > 0) {
        setCurrentProgram(loadedPrograms[0]);
        await db.setCurrentProgramId(loadedPrograms[0].id);
      } else {
        Alert.alert('No Programs', 'Please create a program first before starting a workout.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('Error loading programs:', error);
      Alert.alert('Error', 'Failed to load programs');
    } finally {
      setIsLoading(false);
    }
  };

  const initializeWorkoutExercises = async () => {
    if (!currentProgram || currentProgram.workoutDays.length === 0) return;

    const selectedDay = currentProgram.workoutDays[selectedDayIndex];
    if (!selectedDay) return;

    // STALE LOAD FIX: Increment and capture request ID
    // This function can race with handleDayChange if user switches days rapidly
    dayLoadRequestRef.current += 1;
    const thisRequestId = dayLoadRequestRef.current;

    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        selectedDay.exercises.map(async (ex) => {
          const lastWeight = await db.getLastLoggedWeight(ex.name, currentProgram.id);
          const autoWeight = calculateAutoWeight(lastWeight, Number(ex.progression) || 0);

          return {
            ...ex,
            loggedWeight: autoWeight,
            loggedReps: 0,
            loggedSetWeights: [],
            loggedSetReps: [],
          };
        })
      );

      // STALE LOAD FIX: Discard if a newer request has started
      if (dayLoadRequestRef.current !== thisRequestId) {
        return;
      }

      setWorkoutExercises(initialExercises);
    } catch (error) {
      if (dayLoadRequestRef.current !== thisRequestId) {
        return;
      }
      
      console.error('Error initializing workout exercises:', error);
      const initialExercises: WorkoutExercise[] = selectedDay.exercises.map((ex) => ({
        ...ex,
        loggedWeight: 0,
        loggedReps: 0,
        loggedSetWeights: [],
        loggedSetReps: [],
      }));
      setWorkoutExercises(initialExercises);
    }
  };

  const calculateAutoWeight = (lastWeight: number | null, progression: number): number => {
    if (lastWeight === null) return 0;
    
    // RUNTIME TYPE SAFETY: Ensure numeric types even if DB returns strings
    // Without this, "60" + "0" would give "600" instead of 60
    const numLastWeight = Number(lastWeight);
    const numProgression = Number(progression);
    
    if (!numProgression || numProgression === 0) return numLastWeight;

    try {
      const newWeight = numLastWeight + numProgression;
      return isNaN(newWeight) ? numLastWeight : newWeight;
    } catch (error) {
      console.error('Error calculating auto weight:', error);
      return numLastWeight;
    }
  };

  const applyProgressionToExercises = async (
    exercises: ProgramExercise[],
    programId: string
  ): Promise<ProgramExercise[]> => {
    try {
      const progressedExercises: ProgramExercise[] = await Promise.all(
        exercises.map(async (ex) => {
          const lastWeight = await db.getLastLoggedWeight(ex.name, programId);
          const progressedWeight = calculateAutoWeight(lastWeight, Number(ex.progression) || 0);
          // RUNTIME TYPE SAFETY: Ensure numeric fallback
          const numExWeight = Number(ex.weight) || 0;

          return {
            ...ex,
            weight: progressedWeight || numExWeight,
          };
        })
      );

      return progressedExercises;
    } catch (error) {
      console.error('Error applying progression to exercises:', error);
      return exercises;
    }
  };

  const loadWorkoutFromQueue = async () => {
    try {
      if (workoutQueue.length === 0) {
        Alert.alert('No Workout Queue', 'No workouts in queue. Please create a program first.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setLoadingFromQueue(true);
      const firstWorkout = workoutQueue[0];

      const program = programs.find((p) => p.id === firstWorkout.programId);
      if (!program) {
        setLoadingFromQueue(false);
        Alert.alert(
          'Program Not Found',
          `Could not find program "${firstWorkout.programName}". It may have been deleted.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      const dayIndex = program.workoutDays.findIndex(
        (day) => day.dayNumber === firstWorkout.dayNumber
      );

      if (dayIndex === -1) {
        setLoadingFromQueue(false);
        Alert.alert(
          'Day Not Found',
          `Could not find day ${firstWorkout.dayNumber} in program "${program.name}".`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      setCurrentProgram(program);
      setSelectedDayIndex(dayIndex);
      
      // Only update the preference (don't regenerate queue since we're loading FROM it)
      // Use updateUserPreferences directly to avoid triggering generateWorkoutQueue
      await db.updateUserPreferences({ currentProgramId: program.id });

      await initializeWorkoutExercisesFromQueue(firstWorkout);
      setLoadingFromQueue(false);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading workout from queue:', error);
      setLoadingFromQueue(false);
      Alert.alert('Error', 'Failed to load workout from queue');
    }
  };

  const initializeWorkoutExercisesFromQueue = async (queueItem: WorkoutQueueItem) => {
    // STALE LOAD FIX: Increment and capture request ID
    // This can race with handleDayChange if user switches days immediately after queue load
    dayLoadRequestRef.current += 1;
    const thisRequestId = dayLoadRequestRef.current;

    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        queueItem.exercises.map(async (ex) => {
          let finalWeight = ex.weight || 0;

          if (!finalWeight) {
            const lastWeight = await db.getLastLoggedWeight(ex.name, queueItem.programId);
            finalWeight = calculateAutoWeight(lastWeight, ex.progression) || 0;
          }

          return {
            ...ex,
            loggedWeight: finalWeight,
            loggedReps: 0,
            loggedSetWeights: [],
            loggedSetReps: [],
          };
        })
      );

      // STALE LOAD FIX: Discard if a newer request has started
      if (dayLoadRequestRef.current !== thisRequestId) {
        return;
      }

      setWorkoutExercises(initialExercises);
    } catch (error) {
      if (dayLoadRequestRef.current !== thisRequestId) {
        return;
      }
      
      console.error('Error initializing workout exercises from queue:', error);
      const initialExercises: WorkoutExercise[] = queueItem.exercises.map((ex) => ({
        ...ex,
        loggedWeight: Number(ex.weight) || 0,
        loggedReps: 0,
        loggedSetWeights: [],
        loggedSetReps: [],
      }));
      setWorkoutExercises(initialExercises);
    }
  };

  const initializeWorkoutQueue = async (program: Program) => {
    try {
      const existingQueue = await db.getWorkoutQueue();

      if (existingQueue.length > 0 && existingQueue[0].programId === program.id) {
        // Trim queue to max 3 items
        if (existingQueue.length > 3) {
          await db.saveWorkoutQueue(existingQueue.slice(0, 3));
        }
        return;
      }

      const queue: WorkoutQueueItem[] = [];
      const totalDays = program.workoutDays.length;

      for (let i = 0; i < 3; i++) {
        const dayIndex = i % totalDays;
        const day = program.workoutDays[dayIndex];
        const progressedExercises = await applyProgressionToExercises(day.exercises, program.id);

        queue.push({
          id: `queue-${Date.now()}-${i}`,
          programId: program.id,
          programName: program.name,
          dayNumber: day.dayNumber,
          exercises: progressedExercises,
          position: i,
        });
      }

      await db.saveWorkoutQueue(queue);
      setWorkoutQueue(queue);
    } catch (error) {
      console.error('Error initializing workout queue:', error);
    }
  };

  const updateLoggedValue = useCallback(
    (exerciseName: string, field: 'loggedWeight' | 'loggedReps', value: string) => {
      const numValue = field === 'loggedWeight' ? parseFloat(value) || 0 : parseInt(value, 10) || 0;
      setWorkoutExercises((prev) =>
        prev.map((ex) => (ex.name === exerciseName ? { ...ex, [field]: numValue } : ex))
      );
    },
    []
  );

  const updateLoggedSetWeight = useCallback(
    (exerciseName: string, setIndex: number, value: string) => {
      const numValue = parseFloat(value) || 0;

      setWorkoutExercises((prev) =>
        prev.map((ex) => {
          if (ex.name !== exerciseName) return ex;

          const nextSetWeights = [...ex.loggedSetWeights];
          nextSetWeights[setIndex] = numValue;

          const nonZeroSetWeights = nextSetWeights.filter((weight) => weight > 0);
          const derivedLoggedWeight =
            nonZeroSetWeights.length > 0 ? nonZeroSetWeights[nonZeroSetWeights.length - 1] : 0;

          return {
            ...ex,
            loggedSetWeights: nextSetWeights,
            loggedWeight: derivedLoggedWeight,
          };
        })
      );
    },
    []
  );

  const updateLoggedSetReps = useCallback(
    (exerciseName: string, setIndex: number, value: string) => {
      const numValue = parseInt(value, 10) || 0;

      setWorkoutExercises((prev) =>
        prev.map((ex) => {
          if (ex.name !== exerciseName) return ex;

          const nextSetReps = [...ex.loggedSetReps];
          nextSetReps[setIndex] = numValue;

          const nonZeroSetReps = nextSetReps.filter((reps) => reps > 0);
          const derivedLoggedReps =
            nonZeroSetReps.length > 0 ? nonZeroSetReps[nonZeroSetReps.length - 1] : 0;

          return {
            ...ex,
            loggedSetReps: nextSetReps,
            loggedReps: derivedLoggedReps,
          };
        })
      );
    },
    []
  );

  // =============================================================================
  // Handle day change - allows user to switch days even when loaded from queue
  // =============================================================================
  // When user changes to a different day:
  // 1. Clear timers for the old day
  // 2. Skip the queue to the new day (so next workout in queue matches selection)
  // 3. Load exercises from the queue item (which has pre-calculated progression weights)
  // 4. If no queue item exists, fall back to loading from program with progression
  //
  // This ensures:
  // - Pre-populated values come from the queue (with AI modifications if any)
  // - The queue stays in sync with the user's actual progress
  // - After saving, the next workout is correctly queued
  const handleDayChange = useCallback(async (newIndex: number) => {
    if (!currentProgram || newIndex === selectedDayIndex) return;

    const oldDayNumber = selectedDayIndex + 1;
    const newDayNumber = newIndex + 1;

    // Clear timers ONLY for the day we're leaving
    // This is precise and doesn't require waiting for component unmount
    try {
      await db.clearTimersForContext(currentProgram.id, oldDayNumber);
    } catch (error) {
      console.error('Error clearing timers for old day:', error);
      // Non-critical - continue with day change
    }

    // STALE LOAD FIX: Increment request counter and capture it
    // If user switches days again before our load completes, the counter
    // will have changed and we'll discard our stale results.
    dayLoadRequestRef.current += 1;
    const thisRequestId = dayLoadRequestRef.current;

    // Update state for the new day
    setSelectedDayIndex(newIndex);
    setIsLoadedFromQueue(true); // Mark as loaded from queue since we're syncing

    try {
      // Skip the queue to the new day - this ensures the queue is aligned
      // with the user's selection. When they save, the correct next day will be queued.
      // 
      // UNDO SUPPORT: Pass originalQueue so going backward restores previous state
      // instead of skipping further forward. E.g., Day 1 → Day 2 → Day 1 will
      // restore queue to [Day1, Day2, Day3] instead of skipping to a new Day 1.
      const updatedQueue = await db.skipQueueToDay(
        currentProgram.id, 
        newDayNumber,
        originalQueueRef.current ?? undefined
      );
      
      // STALE LOAD FIX: Check if still current request
      if (dayLoadRequestRef.current !== thisRequestId) {
        console.log(`Discarding stale day load (request ${thisRequestId}, current ${dayLoadRequestRef.current})`);
        return;
      }

      if (updatedQueue && updatedQueue.length > 0) {
        // Update local queue state
        setWorkoutQueue(updatedQueue);
        
        // Load exercises from the first queue item (which is now the selected day)
        const queueItem = updatedQueue[0];
        const initialExercises: WorkoutExercise[] = queueItem.exercises.map((ex) => ({
          ...ex,
          loggedWeight: Number(ex.weight) || 0,
          loggedReps: 0,
          loggedSetWeights: [],
          loggedSetReps: [],
        }));
        setWorkoutExercises(initialExercises);
        return;
      }
    } catch (error) {
      console.error('Error skipping queue to day:', error);
      // Fall through to load from program
    }

    // STALE LOAD FIX: Check if still current request
    if (dayLoadRequestRef.current !== thisRequestId) {
      return;
    }

    // Fallback: Load exercises directly from program with progression
    const selectedDay = currentProgram.workoutDays[newIndex];
    if (!selectedDay) return;

    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        selectedDay.exercises.map(async (ex) => {
          const lastWeight = await db.getLastLoggedWeight(ex.name, currentProgram.id);
          const autoWeight = calculateAutoWeight(lastWeight, Number(ex.progression) || 0);

          return {
            ...ex,
            loggedWeight: autoWeight,
            loggedReps: 0,
            loggedSetWeights: [],
            loggedSetReps: [],
          };
        })
      );

      // STALE LOAD FIX: Only update state if this is still the current request
      if (dayLoadRequestRef.current !== thisRequestId) {
        console.log(`Discarding stale day load (request ${thisRequestId}, current ${dayLoadRequestRef.current})`);
        return;
      }

      setWorkoutExercises(initialExercises);
    } catch (error) {
      // STALE LOAD FIX: Also check before setting fallback exercises
      if (dayLoadRequestRef.current !== thisRequestId) {
        return;
      }
      
      console.error('Error loading exercises for new day:', error);
      const initialExercises: WorkoutExercise[] = selectedDay.exercises.map((ex) => ({
        ...ex,
        loggedWeight: 0,
        loggedReps: 0,
        loggedSetWeights: [],
        loggedSetReps: [],
      }));
      setWorkoutExercises(initialExercises);
    }
  }, [currentProgram, selectedDayIndex]);

  const saveWorkout = async () => {
    if (!currentProgram) return;

    try {
      setIsSaving(true);

      // DELETION CHECK (Edge Case 3): Verify program still exists before saving
      const programExists = await db.getProgramById(currentProgram.id);
      if (!programExists) {
        Alert.alert(
          'Program Deleted',
          'This program has been deleted. The workout cannot be saved.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      const newWorkout: Workout = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        programId: currentProgram.id,
        programName: currentProgram.name,
        dayNumber: selectedDayIndex + 1,
        exercises: workoutExercises,
        completed: true,
      };

      await db.saveWorkout(newWorkout);
      await updateWorkoutQueue();

      // Clear all active rest timers when workout is saved
      // CONSISTENT ERROR HANDLING: Wrap in its own try/catch so timer clear failure
      // doesn't cause "Failed to save workout" error when workout was actually saved.
      // Timer cleanup is non-critical - the timers will be orphaned but won't affect UX.
      try {
        await db.clearAllActiveTimers();
      } catch (timerError) {
        console.error('Error clearing timers after workout save:', timerError);
        // Don't rethrow - workout was saved successfully, timer cleanup is non-critical
      }

      Alert.alert('Success', 'Workout saved!', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error) {
      console.error('Error saving workout:', error);
      Alert.alert('Error', 'Failed to save workout');
    } finally {
      setIsSaving(false);
    }
  };

  const updateWorkoutQueue = async () => {
    if (!currentProgram) return;

    try {
      let queue = await db.getWorkoutQueue();

      if (queue.length === 0 || queue[0].programId !== currentProgram.id) {
        await initializeWorkoutQueue(currentProgram);
        return;
      }

      // Remove the first item (completed workout)
      if (queue.length > 0) {
        queue = queue.slice(1);
      }

      // Add next workout to maintain 3 items
      while (queue.length < 3) {
        const totalDays = currentProgram.workoutDays.length;
        const lastDayNumber = queue.length > 0 ? queue[queue.length - 1].dayNumber : selectedDayIndex + 1;

        const lastDayIndex = currentProgram.workoutDays.findIndex(
          (day) => day.dayNumber === lastDayNumber
        );
        const nextDayIndex = (lastDayIndex + 1) % totalDays;
        const nextDay = currentProgram.workoutDays[nextDayIndex];

        const progressedExercises = await applyProgressionToExercises(
          nextDay.exercises,
          currentProgram.id
        );

        queue.push({
          id: `queue-${Date.now()}-${queue.length}`,
          programId: currentProgram.id,
          programName: currentProgram.name,
          dayNumber: nextDay.dayNumber,
          exercises: progressedExercises,
          position: queue.length,
        });
      }

      // Ensure queue doesn't exceed 3 items
      if (queue.length > 3) {
        queue = queue.slice(0, 3);
      }

      await db.saveWorkoutQueue(queue);
    } catch (error) {
      console.error('Error updating workout queue:', error);
    }
  };

  // COMPOSITE KEY FIX: Pass programId and dayNumber to ExerciseLogCard
  // This allows each exercise's timer to be uniquely identified in the database
  // by (exercise_name, program_id, day_number) instead of just exercise_name.
  // 
  // WHY WE DON'T USE ?? '' ANYMORE:
  // Previously: programId={currentProgram?.id ?? ''}
  // Problem: Empty string '' is a valid string, so timers would be created with
  //          program_id = '' in the database. If two different flows both had
  //          no program, their timers would collide on the same key.
  // 
  // Now: We only render exercises when currentProgram exists (see the JSX below).
  //      The ! assertion is safe because renderExercise is only called when
  //      currentProgram is defined and workoutExercises.length > 0.
  const renderExercise = useCallback(
    ({ item, index }: { item: WorkoutExercise; index: number }) => {
      // Safety check - shouldn't happen because we only render when currentProgram exists
      if (!currentProgram) {
        console.warn('renderExercise called without currentProgram');
        return null;
      }
      
      return (
        <ExerciseLogCard
          exercise={item}
          index={index}
          programId={currentProgram.id}
          dayNumber={selectedDayIndex + 1}
          onUpdateLoggedWeight={(value) => updateLoggedValue(item.name, 'loggedWeight', value)}
          onUpdateLoggedReps={(value) => updateLoggedValue(item.name, 'loggedReps', value)}
          onUpdateLoggedSetWeight={(setIndex, value) =>
            updateLoggedSetWeight(item.name, setIndex, value)
          }
          onUpdateLoggedSetReps={(setIndex, value) =>
            updateLoggedSetReps(item.name, setIndex, value)
          }
        />
      );
    },
    [
      updateLoggedValue,
      updateLoggedSetWeight,
      updateLoggedSetReps,
      currentProgram,
      selectedDayIndex,
    ]
  );

  if (isLoading) {
    return (
      <ParallaxScrollView>
        <LoadingSpinner message="Loading workout..." fullScreen />
      </ParallaxScrollView>
    );
  }

  if (!currentProgram) {
    return (
      <ParallaxScrollView>
        <ThemedView className="flex-1">
          <ThemedText type="title">No Program Selected</ThemedText>
          <Pressable onPress={() => router.back()}>
            {({ pressed }) => (
              <View
                className="bg-blue-500 rounded-full p-4 mt-4"
                style={pressed && { opacity: 0.8 }}
              >
                <ThemedText className="text-white text-center font-semibold">Go Back</ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView>
      <ThemedView className="flex-1">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            {({ pressed }) => (
              <View
                className="px-3 py-1 rounded-lg"
                style={pressed && { backgroundColor: 'rgba(0,0,0,0.1)', opacity: 0.7 }}
              >
                <ThemedText className="text-lg font-semibold">‹ Back</ThemedText>
              </View>
            )}
          </Pressable>
          <ThemedText type="title">Active Workout</ThemedText>
        </View>

        <ThemedView className="mt-5 gap-4">
          {/* Program Info */}
          <ThemedView className="gap-2">
            <ThemedText className="text-lg font-semibold">{currentProgram.name}</ThemedText>
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
              Day {selectedDayIndex + 1} of {currentProgram.workoutDays.length}
            </ThemedText>
          </ThemedView>

          {/* Day Selector - Always shown to allow switching days */}
          <DaySelector
            days={currentProgram.workoutDays}
            selectedIndex={selectedDayIndex}
            onSelectDay={handleDayChange}
            disabled={loadingFromQueue}
          />

          {/* Exercises */}
          {workoutExercises.length > 0 && (
            <ThemedView className="gap-4">
              <ThemedText className="text-lg font-semibold">
                Exercises ({workoutExercises.length})
              </ThemedText>
              <View className="gap-0">
                {workoutExercises.map((exercise, index) => (
                  <View key={exercise.name}>
                    {renderExercise({ item: exercise, index })}
                  </View>
                ))}
              </View>
            </ThemedView>
          )}

          {/* Save Workout Button */}
          <Pressable
            onPress={saveWorkout}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save workout"
          >
            {({ pressed }) => (
              <View
                className={`bg-green-500 rounded-full p-4 ${isSaving ? 'opacity-50' : ''}`}
                style={pressed && !isSaving && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
              >
                {isSaving ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <ThemedText className="text-white text-center font-semibold text-lg">
                    ✓ Save Workout
                  </ThemedText>
                )}
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}

// Re-export types for backward compatibility
export type { Workout, WorkoutExercise, WorkoutQueueItem };
