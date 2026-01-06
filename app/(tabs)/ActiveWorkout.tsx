/**
 * Active Workout Screen
 * Track and log an active workout session
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ExerciseLogCard } from '@/components/workout/ExerciseLogCard';
import { DaySelector } from '@/components/workout/DaySelector';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
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

  // Load programs on mount
  useEffect(() => {
    loadPrograms();
  }, []);

  // Reload queue when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      queueLoadedRef.current = false;
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

    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        selectedDay.exercises.map(async (ex) => {
          const lastWeight = await db.getLastLoggedWeight(ex.name, currentProgram.id);
          const autoWeight = calculateAutoWeight(lastWeight, ex.progression);

          return {
            ...ex,
            loggedWeight: autoWeight,
            loggedReps: '',
          };
        })
      );

      setWorkoutExercises(initialExercises);
    } catch (error) {
      console.error('Error initializing workout exercises:', error);
      const initialExercises: WorkoutExercise[] = selectedDay.exercises.map((ex) => ({
        ...ex,
        loggedWeight: '',
        loggedReps: '',
      }));
      setWorkoutExercises(initialExercises);
    }
  };

  const calculateAutoWeight = (lastWeight: string | null, progression: string): string => {
    if (!lastWeight) return '';
    if (!progression || !progression.trim()) return lastWeight;

    try {
      const progressionAmount = parseFloat(progression.trim());
      if (isNaN(progressionAmount)) return lastWeight;

      const lastWeightMatch = lastWeight.match(/([\d.]+)\s*(kg)?/i);
      if (!lastWeightMatch) {
        const lastWeightNum = parseFloat(lastWeight);
        if (!isNaN(lastWeightNum)) {
          return (lastWeightNum + progressionAmount).toString();
        }
        return lastWeight;
      }

      const lastWeightAmount = parseFloat(lastWeightMatch[1]);
      const lastWeightUnit = lastWeightMatch[2]?.toLowerCase() || '';
      const newWeight = lastWeightAmount + progressionAmount;

      return lastWeightUnit ? `${newWeight} ${lastWeightUnit}` : newWeight.toString();
    } catch (error) {
      console.error('Error calculating auto weight:', error);
      return lastWeight;
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
          const progressedWeight = calculateAutoWeight(lastWeight, ex.progression);

          return {
            ...ex,
            weight: progressedWeight || ex.weight || '',
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
      await db.setCurrentProgramId(program.id);

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
    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        queueItem.exercises.map(async (ex) => {
          let finalWeight = ex.weight || '';

          if (!finalWeight) {
            const lastWeight = await db.getLastLoggedWeight(ex.name, queueItem.programId);
            finalWeight = calculateAutoWeight(lastWeight, ex.progression) || '';
          }

          return {
            ...ex,
            loggedWeight: finalWeight,
            loggedReps: '',
          };
        })
      );

      setWorkoutExercises(initialExercises);
    } catch (error) {
      console.error('Error initializing workout exercises from queue:', error);
      const initialExercises: WorkoutExercise[] = queueItem.exercises.map((ex) => ({
        ...ex,
        loggedWeight: ex.weight || '',
        loggedReps: '',
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
      setWorkoutExercises((prev) =>
        prev.map((ex) => (ex.name === exerciseName ? { ...ex, [field]: value } : ex))
      );
    },
    []
  );

  const saveWorkout = async () => {
    if (!currentProgram) return;

    try {
      setIsSaving(true);

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

  const renderExercise = useCallback(
    ({ item, index }: { item: WorkoutExercise; index: number }) => (
      <ExerciseLogCard
        exercise={item}
        index={index}
        onUpdateLoggedWeight={(value) => updateLoggedValue(item.name, 'loggedWeight', value)}
        onUpdateLoggedReps={(value) => updateLoggedValue(item.name, 'loggedReps', value)}
      />
    ),
    [updateLoggedValue]
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

          {/* Day Selector */}
          {!isLoadedFromQueue && (
            <DaySelector
              days={currentProgram.workoutDays}
              selectedIndex={selectedDayIndex}
              onSelectDay={setSelectedDayIndex}
              disabled={loadingFromQueue}
            />
          )}

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
