/**
 * Hook encapsulating Active Workout screen state and logic.
 *
 * Extracts data loading, queue management, day switching, exercise
 * state updates, and workout saving from the ActiveWorkout component
 * into a testable, reusable hook. The component becomes a thin render layer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { DEFAULT_QUEUE_SIZE } from '@/constants';
import { calculateAutoWeight } from '@/lib/workout-progression';
import * as db from '@/services/database';
import type {
  Program,
  ProgramExercise,
  Workout,
  WorkoutExercise,
  WorkoutQueueItem,
} from '@/types';

/**
 * Return type for the useActiveWorkout hook.
 * Provides all state and callbacks needed by the ActiveWorkout screen.
 */
export interface ActiveWorkoutResult {
  // Data state
  currentProgram: Program | null;
  selectedDayIndex: number;
  workoutExercises: WorkoutExercise[];
  isLoading: boolean;
  isSaving: boolean;
  loadingFromQueue: boolean;

  // Computed helpers
  getDayNumberAtIndex: (dayIndex: number) => number;
  buildExerciseInstanceKey: (exerciseName: string, exerciseIndex: number, dayNumber: number) => string;

  // Actions
  handleDayChange: (newIndex: number) => Promise<void>;
  saveWorkout: () => Promise<void>;
  updateLoggedValue: (exerciseInstanceKey: string, field: 'loggedWeight' | 'loggedReps', value: string, dayNumber: number) => void;
  updateLoggedSetWeight: (exerciseInstanceKey: string, setIndex: number, value: string, dayNumber: number) => void;
  updateLoggedSetReps: (exerciseInstanceKey: string, setIndex: number, value: string, dayNumber: number) => void;
}

/**
 * Manages all state and logic for the Active Workout screen.
 *
 * Handles:
 * - Program and queue loading with stale-request protection
 * - Day switching with undo support (original queue preservation)
 * - Exercise initialization from program or queue
 * - Progressive overload weight calculation
 * - Workout saving and queue advancement
 * - Rest timer cleanup on day change and save
 *
 * Uses refs for stale-load and undo-queue protection patterns.
 */
export const useActiveWorkout = (): ActiveWorkoutResult => {
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

  // UNDO SUPPORT: Track the original queue state when screen loads
  const originalQueueRef = useRef<WorkoutQueueItem[] | null>(null);

  // STALE LOAD FIX: Track which day-load request is "current"
  const dayLoadRequestRef = useRef(0);

  // DOUBLE-TAP GUARD: Ref-based because setState is async and can't prevent concurrent calls
  const isSavingRef = useRef(false);

  /** Reload the workout queue from the database, normalizing to max size. */
  const reloadQueue = async () => {
    try {
      const queue = await db.getWorkoutQueue();
      const normalizedQueue = queue.slice(0, DEFAULT_QUEUE_SIZE);

      if (queue.length > DEFAULT_QUEUE_SIZE) {
        await db.saveWorkoutQueue(normalizedQueue);
      }

      setWorkoutQueue(normalizedQueue);

      if (originalQueueRef.current === null && normalizedQueue.length > 0) {
        originalQueueRef.current = [...normalizedQueue];
      }
    } catch (error) {
      console.error('Error loading workout queue:', error);
    }
  };

  /** Load programs from database and auto-select the current program. */
  const loadPrograms = useCallback(async () => {
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
  }, [router]);

  /**
   * Apply progressive overload to a set of exercises based on previously logged weights.
   * Falls back to program-defined weight when no log exists.
   */
  const applyProgressionToExercises = useCallback(async (
    exercises: ProgramExercise[],
    programId: string
  ): Promise<ProgramExercise[]> => {
    try {
      const progressedExercises: ProgramExercise[] = await Promise.all(
        exercises.map(async (ex) => {
          const lastWeight = await db.getLastLoggedWeight(ex.name, programId, ex.variant);
          const progressedWeight = calculateAutoWeight(lastWeight, Number(ex.progression) || 0);
          const numExWeight = Number(ex.weight) || 0;

          return {
            ...ex,
            weight: String(progressedWeight || numExWeight),
          };
        })
      );

      return progressedExercises;
    } catch (error) {
      console.error('Error applying progression to exercises:', error);
      return exercises;
    }
  }, []);

  /**
   * Initialize exercise data from the program template for the currently selected day.
   * Uses stale-load protection via dayLoadRequestRef to discard outdated results.
   */
  const initializeWorkoutExercises = useCallback(async () => {
    if (!currentProgram || currentProgram.workoutDays.length === 0) return;

    const selectedDay = currentProgram.workoutDays[selectedDayIndex];
    if (!selectedDay) return;

    dayLoadRequestRef.current += 1;
    const thisRequestId = dayLoadRequestRef.current;

    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        selectedDay.exercises.map(async (ex) => {
          const lastWeight = await db.getLastLoggedWeight(ex.name, currentProgram.id, ex.variant);
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

      if (dayLoadRequestRef.current !== thisRequestId) return;
      setWorkoutExercises(initialExercises);
    } catch (error) {
      if (dayLoadRequestRef.current !== thisRequestId) return;

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
  }, [currentProgram, selectedDayIndex]);

  /**
   * Initialize exercise data from a queue item, using queue pre-calculated weights.
   * Falls back to DB-logged weight when queue weight is absent.
   */
  const initializeWorkoutExercisesFromQueue = useCallback(async (queueItem: WorkoutQueueItem) => {
    dayLoadRequestRef.current += 1;
    const thisRequestId = dayLoadRequestRef.current;

    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        queueItem.exercises.map(async (ex) => {
          let finalWeight = Number(ex.weight) || 0;

          if (!finalWeight) {
            const lastWeight = await db.getLastLoggedWeight(ex.name, queueItem.programId, ex.variant);
            finalWeight = calculateAutoWeight(lastWeight, Number(ex.progression) || 0) || 0;
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

      if (dayLoadRequestRef.current !== thisRequestId) return;
      setWorkoutExercises(initialExercises);
    } catch (error) {
      if (dayLoadRequestRef.current !== thisRequestId) return;

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
  }, []);

  /** Load workout data from the first item in the queue. */
  const loadWorkoutFromQueue = useCallback(async () => {
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

      await db.updateUserPreferences({ currentProgramId: program.id });

      await initializeWorkoutExercisesFromQueue(firstWorkout);
      setLoadingFromQueue(false);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading workout from queue:', error);
      setLoadingFromQueue(false);
      Alert.alert('Error', 'Failed to load workout from queue');
    }
  }, [workoutQueue, programs, router, initializeWorkoutExercisesFromQueue]);

  /** Get the day number at a given day index in the current program. */
  const getDayNumberAtIndex = useCallback(
    (dayIndex: number) => currentProgram?.workoutDays[dayIndex]?.dayNumber ?? dayIndex + 1,
    [currentProgram]
  );

  /**
   * Build a composite key for an exercise instance.
   * Keys are unique per (program, day, index, name) to support timer identification.
   */
  const buildExerciseInstanceKey = useCallback(
    (exerciseName: string, exerciseIndex: number, dayNumber: number) => {
      const programId = currentProgram?.id ?? 'no-program';
      return `${programId}:d${dayNumber}:i${exerciseIndex}:${exerciseName}`;
    },
    [currentProgram?.id]
  );

  /** Initialize or normalize the workout queue for the given program. */
  const initializeWorkoutQueue = useCallback(async (program: Program) => {
    try {
      const existingQueue = await db.getWorkoutQueue();

      if (existingQueue.length > 0 && existingQueue[0].programId === program.id) {
        const normalizedQueue = existingQueue.slice(0, DEFAULT_QUEUE_SIZE);
        if (existingQueue.length > DEFAULT_QUEUE_SIZE) {
          await db.saveWorkoutQueue(normalizedQueue);
        }

        setWorkoutQueue(normalizedQueue);
        return;
      }

      const queue: WorkoutQueueItem[] = [];
      const totalDays = program.workoutDays.length;

      for (let i = 0; i < DEFAULT_QUEUE_SIZE; i++) {
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
  }, [applyProgressionToExercises]);

  // Load programs on mount
  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  // Reload queue when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      queueLoadedRef.current = false;
      originalQueueRef.current = null;
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
  }, [workoutQueue, programs, loadWorkoutFromQueue]);

  // Initialize workout queue when program changes
  useEffect(() => {
    if (currentProgram && workoutQueue.length === 0 && !queueLoadedRef.current) {
      initializeWorkoutQueue(currentProgram);
    }
  }, [currentProgram, workoutQueue.length, initializeWorkoutQueue]);

  // Initialize workout exercises when program or day changes (non-queue path)
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
  }, [
    currentProgram,
    selectedDayIndex,
    loadingFromQueue,
    isLoadedFromQueue,
    workoutQueue.length,
    initializeWorkoutExercises,
  ]);

  /** Update a single logged value (weight or reps) for an exercise. */
  const updateLoggedValue = useCallback(
    (exerciseInstanceKey: string, field: 'loggedWeight' | 'loggedReps', value: string, dayNumber: number) => {
      const numValue = field === 'loggedWeight' ? parseFloat(value) || 0 : parseInt(value, 10) || 0;
      setWorkoutExercises((prev) =>
        prev.map((ex, index) =>
          buildExerciseInstanceKey(ex.name, index, dayNumber) === exerciseInstanceKey
            ? { ...ex, [field]: numValue }
            : ex
        )
      );
    },
    [buildExerciseInstanceKey]
  );

  /** Update a per-set weight value and derive the overall logged weight from it. */
  const updateLoggedSetWeight = useCallback(
    (exerciseInstanceKey: string, setIndex: number, value: string, dayNumber: number) => {
      const numValue = parseFloat(value) || 0;

      setWorkoutExercises((prev) =>
        prev.map((ex, index) => {
          if (buildExerciseInstanceKey(ex.name, index, dayNumber) !== exerciseInstanceKey) return ex;

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
    [buildExerciseInstanceKey]
  );

  /** Update a per-set reps value and derive the overall logged reps from it. */
  const updateLoggedSetReps = useCallback(
    (exerciseInstanceKey: string, setIndex: number, value: string, dayNumber: number) => {
      const numValue = parseInt(value, 10) || 0;

      setWorkoutExercises((prev) =>
        prev.map((ex, index) => {
          if (buildExerciseInstanceKey(ex.name, index, dayNumber) !== exerciseInstanceKey) return ex;

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
    [buildExerciseInstanceKey]
  );

  /**
   * Handle user switching workout day.
   *
   * Clears timers for the old day, skips the queue to the new day
   * (with undo support), and loads exercises from queue or program fallback.
   * Uses stale-load protection to discard outdated async results.
   */
  const handleDayChange = useCallback(async (newIndex: number) => {
    if (!currentProgram || newIndex === selectedDayIndex) return;

    const oldDayNumber = getDayNumberAtIndex(selectedDayIndex);
    const newDayNumber = getDayNumberAtIndex(newIndex);

    try {
      await db.clearTimersForContext(currentProgram.id, oldDayNumber);
    } catch (error) {
      console.error('Error clearing timers for old day:', error);
    }

    dayLoadRequestRef.current += 1;
    const thisRequestId = dayLoadRequestRef.current;

    setSelectedDayIndex(newIndex);
    setIsLoadedFromQueue(true);

    try {
      const updatedQueue = await db.skipQueueToDay(
        currentProgram.id,
        newDayNumber,
        originalQueueRef.current ?? undefined
      );

      if (dayLoadRequestRef.current !== thisRequestId) {
        return;
      }

      if (updatedQueue && updatedQueue.length > 0) {
        setWorkoutQueue(updatedQueue);

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
    }

    if (dayLoadRequestRef.current !== thisRequestId) return;

    const selectedDay = currentProgram.workoutDays[newIndex];
    if (!selectedDay) return;

    try {
      const initialExercises: WorkoutExercise[] = await Promise.all(
        selectedDay.exercises.map(async (ex) => {
          const lastWeight = await db.getLastLoggedWeight(ex.name, currentProgram.id, ex.variant);
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

      if (dayLoadRequestRef.current !== thisRequestId) return;
      setWorkoutExercises(initialExercises);
    } catch (error) {
      if (dayLoadRequestRef.current !== thisRequestId) return;

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
  }, [currentProgram, getDayNumberAtIndex, selectedDayIndex]);

  /** Advance the workout queue after a completed workout is saved. */
  const updateWorkoutQueue = useCallback(async () => {
    if (!currentProgram) return;

    try {
      let queue = await db.getWorkoutQueue();

      if (queue.length === 0 || queue[0].programId !== currentProgram.id) {
        await initializeWorkoutQueue(currentProgram);
        return;
      }

      if (queue.length > 0) {
        queue = queue.slice(1);
      }

      while (queue.length < DEFAULT_QUEUE_SIZE) {
        const totalDays = currentProgram.workoutDays.length;
        const lastDayNumber =
          queue.length > 0 ? queue[queue.length - 1].dayNumber : getDayNumberAtIndex(selectedDayIndex);

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

      if (queue.length > DEFAULT_QUEUE_SIZE) {
        queue = queue.slice(0, DEFAULT_QUEUE_SIZE);
      }

      await db.saveWorkoutQueue(queue);
    } catch (error) {
      console.error('Error updating workout queue:', error);
    }
  }, [currentProgram, selectedDayIndex, getDayNumberAtIndex]);

  /** Save the completed workout, verify program still exists, and clear timers. */
  const saveWorkout = useCallback(async () => {
    if (!currentProgram || isSavingRef.current) return;
    isSavingRef.current = true;

    const selectedDayNumber = getDayNumberAtIndex(selectedDayIndex);

    try {
      setIsSaving(true);

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
        dayNumber: selectedDayNumber,
        exercises: workoutExercises,
        completed: true,
      };

      await db.saveWorkout(newWorkout);
      await updateWorkoutQueue();

      try {
        await db.clearAllActiveTimers();
      } catch (timerError) {
        console.error('Error clearing timers after workout save:', timerError);
      }

      Alert.alert('Success', 'Workout saved!', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error) {
      console.error('Error saving workout:', error);
      Alert.alert('Error', 'Failed to save workout');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }, [currentProgram, selectedDayIndex, workoutExercises, getDayNumberAtIndex, updateWorkoutQueue, router]);

  return {
    currentProgram,
    selectedDayIndex,
    workoutExercises,
    isLoading,
    isSaving,
    loadingFromQueue,
    getDayNumberAtIndex,
    buildExerciseInstanceKey,
    handleDayChange,
    saveWorkout,
    updateLoggedValue,
    updateLoggedSetWeight,
    updateLoggedSetReps,
  };
};
