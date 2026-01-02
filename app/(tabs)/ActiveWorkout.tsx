import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import type { Program, ProgramExercise } from './Programs';

// Workout Exercise interface - includes logged values
export interface WorkoutExercise extends ProgramExercise {
  loggedWeight: string; // Weight actually used
  loggedReps: string; // Reps actually done
}

// Workout interface
export interface Workout {
  id: string;
  date: string;
  programId: string;
  programName: string;
  dayNumber: number;
  exercises: WorkoutExercise[];
  completed: boolean;
}

// Workout Queue Item interface
export interface WorkoutQueueItem {
  id: string;
  programId: string;
  programName: string;
  dayNumber: number;
  exercises: ProgramExercise[];
  scheduledDate?: string;
}

const PROGRAMS_STORAGE_KEY = 'gymApp_programs';
const WORKOUTS_STORAGE_KEY = 'gymApp_workouts';
const CURRENT_PROGRAM_STORAGE_KEY = 'gymApp_currentProgram';
const WORKOUT_QUEUE_STORAGE_KEY = 'gymApp_workoutQueue';

export default function ActiveWorkout() {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [workoutQueue, setWorkoutQueue] = useState<WorkoutQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFromQueue, setLoadingFromQueue] = useState(false);
  const [isLoadedFromQueue, setIsLoadedFromQueue] = useState(false);
  const queueLoadedRef = useRef(false);

  // Load programs and current program on mount
  useEffect(() => {
    loadPrograms();
  }, []);

  // Reload queue and reset flags when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Reset flags when screen comes into focus
      queueLoadedRef.current = false;
      setIsLoadedFromQueue(false);
      
      // Reload queue from storage (it may have been updated after completing a workout)
      const reloadQueue = async () => {
        try {
          const stored = await AsyncStorage.getItem(WORKOUT_QUEUE_STORAGE_KEY);
          if (stored) {
            const queue: WorkoutQueueItem[] = JSON.parse(stored);
            setWorkoutQueue(queue);
          } else {
            setWorkoutQueue([]);
          }
        } catch (error) {
          console.error('Error loading workout queue:', error);
        }
      };
      
      reloadQueue();
    }, [])
  );

  // PRIORITY: Load from workout queue if it has items (highest priority)
  // This runs after both programs and queue are loaded
  useEffect(() => {
    if (workoutQueue.length > 0 && programs.length > 0 && !queueLoadedRef.current) {
      queueLoadedRef.current = true;
      setIsLoadedFromQueue(true);
      loadWorkoutFromQueue();
      return; // Don't proceed with program-based initialization
    }
  }, [workoutQueue, programs]);

  // Initialize or update workout queue when program changes (only if queue is empty)
  useEffect(() => {
    if (currentProgram && workoutQueue.length === 0 && !queueLoadedRef.current) {
      initializeWorkoutQueue(currentProgram);
    }
  }, [currentProgram, workoutQueue.length]);

  // Initialize workout exercises when program or day changes (only if queue is empty and not loading from queue)
  useEffect(() => {
    if (currentProgram && currentProgram.workoutDays.length > 0 && !loadingFromQueue && workoutQueue.length === 0 && !isLoadedFromQueue) {
      initializeWorkoutExercises();
    }
  }, [currentProgram, selectedDayIndex, loadingFromQueue, isLoadedFromQueue, workoutQueue.length]);

  const initializeWorkoutExercises = async () => {
    if (!currentProgram || currentProgram.workoutDays.length === 0) return;

    const selectedDay = currentProgram.workoutDays[selectedDayIndex];
    if (!selectedDay) return;

    try {
      // Load previous workouts to get last logged weights
      const storedWorkouts = await AsyncStorage.getItem(WORKOUTS_STORAGE_KEY);
      const workouts: Workout[] = storedWorkouts ? JSON.parse(storedWorkouts) : [];

      // Filter workouts for current program and completed workouts only
      const programWorkouts = workouts.filter(
        (w) => w.programId === currentProgram.id && w.completed
      );

      // Create workout exercises with auto-populated weights
      const initialExercises: WorkoutExercise[] = await Promise.all(
        selectedDay.exercises.map(async (ex) => {
          // Find the last logged weight for this exercise
          const lastWeight = getLastLoggedWeight(ex.name, programWorkouts);
          
          // Calculate auto-populated weight
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
      // Fallback to empty values if there's an error
      const initialExercises: WorkoutExercise[] = selectedDay.exercises.map((ex) => ({
        ...ex,
        loggedWeight: '',
        loggedReps: '',
      }));
      setWorkoutExercises(initialExercises);
    }
  };

  const getLastLoggedWeight = (exerciseName: string, workouts: Workout[]): string => {
    // Find the most recent workout with this exercise
    for (const workout of workouts) {
      const exercise = workout.exercises.find((ex) => ex.name === exerciseName);
      if (exercise && exercise.loggedWeight && exercise.loggedWeight.trim()) {
        return exercise.loggedWeight.trim();
      }
    }
    return '';
  };

  const calculateAutoWeight = (lastWeight: string, progression: string): string => {
    // If no last weight, return empty
    if (!lastWeight) return '';

    // If no progression, return last weight as-is
    if (!progression || !progression.trim()) return lastWeight;

    try {
      // Parse progression as integer (e.g., "5", "10", "2.5")
      const progressionStr = progression.trim();
      const progressionAmount = parseFloat(progressionStr);
      
      if (isNaN(progressionAmount)) {
        // If progression format is invalid, just return last weight
        return lastWeight;
      }

      // Parse last weight (e.g., "61.2 kg", "60kg", "61.2")
      const lastWeightMatch = lastWeight.match(/([\d.]+)\s*(kg)?/i);
      
      if (!lastWeightMatch) {
        // If last weight format is invalid, try to parse as number
        const lastWeightNum = parseFloat(lastWeight);
        if (!isNaN(lastWeightNum)) {
          const newWeight = lastWeightNum + progressionAmount;
          return newWeight.toString();
        }
        return lastWeight;
      }

      const lastWeightAmount = parseFloat(lastWeightMatch[1]);
      const lastWeightUnit = lastWeightMatch[2]?.toLowerCase() || '';

      // Calculate new weight
      const newWeight = lastWeightAmount + progressionAmount;

      // Format result with original unit if present
      if (lastWeightUnit) {
        return `${newWeight} ${lastWeightUnit}`;
      } else {
        return newWeight.toString();
      }
    } catch (error) {
      console.error('Error calculating auto weight:', error);
      return lastWeight;
    }
  };

  // Apply progression to exercises when creating queue items
  const applyProgressionToExercises = async (
    exercises: ProgramExercise[],
    programId: string
  ): Promise<ProgramExercise[]> => {
    try {
      // Load previous workouts to get last logged weights
      const storedWorkouts = await AsyncStorage.getItem(WORKOUTS_STORAGE_KEY);
      const workouts: Workout[] = storedWorkouts ? JSON.parse(storedWorkouts) : [];

      // Filter workouts for the program and completed workouts only
      const programWorkouts = workouts.filter(
        (w) => w.programId === programId && w.completed
      );

      // Apply progression to each exercise
      const progressedExercises: ProgramExercise[] = await Promise.all(
        exercises.map(async (ex) => {
          // If exercise already has a weight, keep it (user may have set it manually)
          if (ex.weight && ex.weight.trim()) {
            return ex;
          }

          // Find the last logged weight for this exercise
          const lastWeight = getLastLoggedWeight(ex.name, programWorkouts);

          // Calculate progressed weight (last logged + progression)
          const progressedWeight = calculateAutoWeight(lastWeight, ex.progression);

          // Return exercise with progressed weight
          return {
            ...ex,
            weight: progressedWeight || ex.weight || '',
          };
        })
      );

      return progressedExercises;
    } catch (error) {
      console.error('Error applying progression to exercises:', error);
      // Return original exercises if there's an error
      return exercises;
    }
  };

  const loadPrograms = async () => {
    try {
      const stored = await AsyncStorage.getItem(PROGRAMS_STORAGE_KEY);
      if (stored) {
        const loadedPrograms: Program[] = JSON.parse(stored);
        setPrograms(loadedPrograms);

        // Try to load current program
        const currentProgramId = await AsyncStorage.getItem(CURRENT_PROGRAM_STORAGE_KEY);
        if (currentProgramId) {
          const program = loadedPrograms.find((p) => p.id === currentProgramId);
          if (program) {
            setCurrentProgram(program);
            setIsLoading(false);
            return;
          }
        }

        // If no current program set, use the first program
        if (loadedPrograms.length > 0) {
          setCurrentProgram(loadedPrograms[0]);
          await AsyncStorage.setItem(CURRENT_PROGRAM_STORAGE_KEY, loadedPrograms[0].id);
        } else {
          Alert.alert(
            'No Programs',
            'Please create a program first before starting a workout.',
            [
              {
                text: 'OK',
                onPress: () => router.back(),
              },
            ]
          );
        }
      } else {
        Alert.alert(
          'No Programs',
          'Please create a program first before starting a workout.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error loading programs:', error);
      Alert.alert('Error', 'Failed to load programs');
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorkoutQueue = async () => {
    try {
      const stored = await AsyncStorage.getItem(WORKOUT_QUEUE_STORAGE_KEY);
      if (stored) {
        const queue: WorkoutQueueItem[] = JSON.parse(stored);
        setWorkoutQueue(queue);
      }
    } catch (error) {
      console.error('Error loading workout queue:', error);
    }
  };

  const loadWorkoutFromQueue = async () => {
    try {
      if (workoutQueue.length === 0) {
        Alert.alert(
          'No Workout Queue',
          'No workouts in queue. Please create a program and add workouts to the queue first.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
        return;
      }

      setLoadingFromQueue(true);

      // Get the first workout from the queue
      const firstWorkout = workoutQueue[0];

      // Find the program that matches the queue item
      const program = programs.find((p) => p.id === firstWorkout.programId);
      
      if (!program) {
        setLoadingFromQueue(false);
        Alert.alert(
          'Program Not Found',
          `Could not find program "${firstWorkout.programName}". It may have been deleted.`,
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
        return;
      }

      // Find the day index that matches the queue item's day number
      const dayIndex = program.workoutDays.findIndex(
        (day) => day.dayNumber === firstWorkout.dayNumber
      );

      if (dayIndex === -1) {
        setLoadingFromQueue(false);
        Alert.alert(
          'Day Not Found',
          `Could not find day ${firstWorkout.dayNumber} in program "${program.name}".`,
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
        return;
      }

      // Set the current program and day
      setCurrentProgram(program);
      setSelectedDayIndex(dayIndex);
      await AsyncStorage.setItem(CURRENT_PROGRAM_STORAGE_KEY, program.id);

      // Initialize workout exercises with pre-populated weights
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
      // Load previous workouts to get last logged weights
      const storedWorkouts = await AsyncStorage.getItem(WORKOUTS_STORAGE_KEY);
      const workouts: Workout[] = storedWorkouts ? JSON.parse(storedWorkouts) : [];

      // Filter workouts for the program and completed workouts only
      const programWorkouts = workouts.filter(
        (w) => w.programId === queueItem.programId && w.completed
      );

      // Create workout exercises with auto-populated weights from queue exercises
      const initialExercises: WorkoutExercise[] = await Promise.all(
        queueItem.exercises.map(async (ex) => {
          // Priority 1: Use queue item's weight if available
          // Priority 2: Calculate from last logged weight + progression as fallback
          let finalWeight = ex.weight || '';
          
          if (!finalWeight) {
            // Find the last logged weight for this exercise
            const lastWeight = getLastLoggedWeight(ex.name, programWorkouts);
            
            // Calculate auto-populated weight (last logged + progression)
            const autoWeight = calculateAutoWeight(lastWeight, ex.progression);
            finalWeight = autoWeight || '';
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
      // Fallback to empty values if there's an error
      const initialExercises: WorkoutExercise[] = queueItem.exercises.map((ex) => ({
        ...ex,
        loggedWeight: ex.weight || '', // Use queue weight as fallback
        loggedReps: '',
      }));
      setWorkoutExercises(initialExercises);
    }
  };

  const saveWorkoutQueue = async (queue: WorkoutQueueItem[]) => {
    try {
      await AsyncStorage.setItem(WORKOUT_QUEUE_STORAGE_KEY, JSON.stringify(queue, null, 2));
      setWorkoutQueue(queue);
    } catch (error) {
      console.error('Error saving workout queue:', error);
    }
  };

  const initializeWorkoutQueue = async (program: Program) => {
    try {
      // Check if queue exists and is for this program
      const stored = await AsyncStorage.getItem(WORKOUT_QUEUE_STORAGE_KEY);
      if (stored) {
        const existingQueue: WorkoutQueueItem[] = JSON.parse(stored);
        // If queue is for current program and has items, trim to 3 items if needed
        if (existingQueue.length > 0 && existingQueue[0].programId === program.id) {
          // Trim queue to 3 items if it has more than 3
          if (existingQueue.length > 3) {
            const trimmedQueue = existingQueue.slice(0, 3);
            await saveWorkoutQueue(trimmedQueue);
          }
          return;
        }
      }

      // Generate next 3 workouts cycling through program days
      const queue: WorkoutQueueItem[] = [];
      const totalDays = program.workoutDays.length;
      
      for (let i = 0; i < 3; i++) {
        const dayIndex = i % totalDays;
        const day = program.workoutDays[dayIndex];
        
        // Apply progression to exercises
        const progressedExercises = await applyProgressionToExercises(day.exercises, program.id);
        
        queue.push({
          id: `queue-${Date.now()}-${i}`,
          programId: program.id,
          programName: program.name,
          dayNumber: day.dayNumber,
          exercises: progressedExercises,
        });
      }
      
      await saveWorkoutQueue(queue);
    } catch (error) {
      console.error('Error initializing workout queue:', error);
    }
  };

  const updateLoggedValue = (
    exerciseName: string,
    field: 'loggedWeight' | 'loggedReps',
    value: string
  ) => {
    setWorkoutExercises((prev) =>
      prev.map((ex) =>
        ex.name === exerciseName ? { ...ex, [field]: value } : ex
      )
    );
  };

  const saveWorkout = async () => {
    if (!currentProgram) return;

    try {
      // Load existing workouts
      const storedWorkouts = await AsyncStorage.getItem(WORKOUTS_STORAGE_KEY);
      const workouts: Workout[] = storedWorkouts ? JSON.parse(storedWorkouts) : [];

      // Create new workout with completed flag set to true
      const newWorkout: Workout = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        programId: currentProgram.id,
        programName: currentProgram.name,
        dayNumber: selectedDayIndex + 1,
        exercises: workoutExercises,
        completed: true,
      };

      // Add to workouts array
      const updatedWorkouts = [newWorkout, ...workouts];
      await AsyncStorage.setItem(WORKOUTS_STORAGE_KEY, JSON.stringify(updatedWorkouts, null, 2));

      // Update workout queue - remove completed workout and add next one
      await updateWorkoutQueue();

      Alert.alert('Success', 'Workout saved!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Error saving workout:', error);
      Alert.alert('Error', 'Failed to save workout');
    }
  };

  const updateWorkoutQueue = async () => {
    if (!currentProgram) return;

    try {
      const stored = await AsyncStorage.getItem(WORKOUT_QUEUE_STORAGE_KEY);
      let queue: WorkoutQueueItem[] = stored ? JSON.parse(stored) : [];

      // If queue is empty or not for current program, initialize it
      if (queue.length === 0 || queue[0].programId !== currentProgram.id) {
        await initializeWorkoutQueue(currentProgram);
        return;
      }

      // Remove the first item (completed workout) if queue has items
      if (queue.length > 0) {
        queue = queue.slice(1);
      }

      // Add next workout to maintain 3 items in queue
      // Only add if queue has less than 3 items
      while (queue.length < 3) {
        const totalDays = currentProgram.workoutDays.length;
        const lastDayNumber = queue.length > 0 
          ? queue[queue.length - 1].dayNumber 
          : selectedDayIndex + 1;
        
        // Find next day (cycle through)
        const lastDayIndex = currentProgram.workoutDays.findIndex(
          day => day.dayNumber === lastDayNumber
        );
        const nextDayIndex = (lastDayIndex + 1) % totalDays;
        const nextDay = currentProgram.workoutDays[nextDayIndex];

        // Apply progression to exercises
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
        });
      }

      // Ensure queue doesn't exceed 3 items (trim if needed)
      if (queue.length > 3) {
        queue = queue.slice(0, 3);
      }

      await saveWorkoutQueue(queue);
    } catch (error) {
      console.error('Error updating workout queue:', error);
    }
  };

  if (isLoading) {
    return (
      <ParallaxScrollView>
        <ThemedView className="flex-1">
          <ThemedText type="title">Loading...</ThemedText>
        </ThemedView>
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
                className="bg-blue-500 rounded-lg p-4 border-2 border-white mt-4"
                style={pressed && { opacity: 0.8 }}
              >
                <ThemedText className="text-white text-center font-semibold">
                  Go Back
                </ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  const selectedDay = currentProgram.workoutDays[selectedDayIndex];

  return (
    <ParallaxScrollView>
      <ThemedView className="flex-1">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()}>
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

          {/* Day Selector - Only show when NOT loading from queue */}
          {currentProgram.workoutDays.length > 1 && !isLoadedFromQueue && (
            <ThemedView className="gap-2">
              <ThemedText className="text-base font-semibold">Select Workout Day</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {currentProgram.workoutDays.map((day, index) => (
                    <Pressable
                      key={day.dayNumber}
                      onPress={() => setSelectedDayIndex(index)}
                    >
                      {({ pressed }) => (
                        <View
                          className={`px-4 py-2 rounded-lg border-2 ${
                            selectedDayIndex === index
                              ? 'bg-blue-500 border-blue-600'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                          }`}
                          style={pressed && { opacity: 0.8 }}
                        >
                          <ThemedText
                            className={`font-semibold ${
                              selectedDayIndex === index ? 'text-white' : ''
                            }`}
                          >
                            Day {day.dayNumber}
                          </ThemedText>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </ThemedView>
          )}

          {/* Exercises */}
          {(selectedDay || workoutExercises.length > 0) && (
            <ThemedView className="gap-4">
              <ThemedText className="text-lg font-semibold">
                Exercises ({workoutExercises.length})
              </ThemedText>
              <ScrollView showsVerticalScrollIndicator={true}>
                {workoutExercises.map((exercise, index) => (
                  <View
                    key={exercise.name}
                    className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600"
                  >
                    <View className="flex-row items-center gap-2 mb-3">
                      <View className="bg-blue-500 w-8 h-8 rounded-full items-center justify-center">
                        <ThemedText className="text-white font-bold text-sm">
                          {index + 1}
                        </ThemedText>
                      </View>
                      <ThemedText className="font-bold text-lg flex-1">
                        {exercise.name}
                      </ThemedText>
                    </View>

                    {/* Equipment & Muscles */}
                    <Collapsible title="Equipment & Muscles Worked">
                      <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Equipment: {exercise.equipment}
                      </ThemedText>
                      <View className="flex-row flex-wrap gap-1">
                        {exercise.muscle_groups_worked.map((group) => (
                          <View
                            key={group}
                            className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded"
                          >
                            <ThemedText className="text-xs capitalize">{group}</ThemedText>
                          </View>
                        ))}
                      </View>
                    </Collapsible>

                    {/* Program Info (Sets, Target Reps, etc.) */}
                    <View className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <View className="flex-row flex-wrap gap-3 mb-3">
                        {exercise.sets && (
                          <View>
                            <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                              Sets
                            </ThemedText>
                            <ThemedText className="text-base font-semibold">
                              {exercise.sets}
                            </ThemedText>
                          </View>
                        )}
                        {exercise.reps && (
                          <View>
                            <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                              Target Reps
                            </ThemedText>
                            <ThemedText className="text-base font-semibold">
                              {exercise.reps}
                            </ThemedText>
                          </View>
                        )}
                        {exercise.weight && (
                          <View>
                            <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                              Target Weight
                            </ThemedText>
                            <ThemedText className="text-base font-semibold">
                              {exercise.weight}
                            </ThemedText>
                          </View>
                        )}
                        {exercise.restTime && (
                          <View>
                            <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                              Rest Time
                            </ThemedText>
                            <ThemedText className="text-base font-semibold">
                              {exercise.restTime}
                            </ThemedText>
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
                          value={exercise.loggedWeight}
                          onChangeText={(value) =>
                            updateLoggedValue(exercise.name, 'loggedWeight', value)
                          }
                          keyboardType="decimal-pad"
                          style={{ color: '#ffffff' }}
                        />
                      </ThemedView>

                      <ThemedView className="gap-1">
                        <ThemedText className="text-sm font-semibold">Reps Logged</ThemedText>
                        <TextInput
                          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                          placeholder="Enter reps completed..."
                          placeholderTextColor="#999"
                          value={exercise.loggedReps}
                          onChangeText={(value) =>
                            updateLoggedValue(exercise.name, 'loggedReps', value)
                          }
                          keyboardType="numeric"
                          style={{ color: '#ffffff' }}
                        />
                      </ThemedView>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </ThemedView>
          )}

          {/* Save Workout Button */}
          <Pressable onPress={saveWorkout}>
            {({ pressed }) => (
              <View
                className="bg-green-500 rounded-lg p-4 border-2 border-white"
                style={[
                  { marginTop: 16 },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
              >
                <ThemedText className="text-white text-center font-semibold text-lg">
                  ✓ Save Workout
                </ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}
