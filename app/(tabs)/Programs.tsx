/**
 * Programs Screen
 * Manage workout programs - create, view, edit, delete
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, TextInput, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ExerciseConfigCard } from '@/components/programs/ExerciseConfigCard';
import { ExerciseSelector, createProgramExercise } from '@/components/programs/ExerciseSelector';
import { ProgramCard } from '@/components/programs/ProgramCard';
import { SelectedExercisesList } from '@/components/programs/SelectedExercisesList';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { showDeleteConfirmation } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import exercisesData from '@/data/exerciseSelection.json';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatExerciseDisplayName } from '@/lib/utils';
import { validateExercise, validateNumberOfDays, validateProgramName } from '@/lib/validation';import * as db from '@/services/database';
import type {
  Exercise,
  ExerciseVariant,
  ExerciseVariantOption,
  Program,
  ProgramExercise,
  WorkoutDay,
} from '@/types';
import { CreateProgramStep, ProgramViewMode } from '@/types';

const cloneExercise = (exercise: ProgramExercise): ProgramExercise => ({
  ...exercise,
  muscle_groups_worked: [...exercise.muscle_groups_worked],
  variant: exercise.variant
    ? {
        ...exercise.variant,
        extras: exercise.variant.extras ? [...exercise.variant.extras] : undefined,
      }
    : null,
  variantOptions: exercise.variantOptions
    ? exercise.variantOptions.map((option) => ({
        ...option,
        aliases: option.aliases ? [...option.aliases] : undefined,
      }))
    : undefined,
  aliases: exercise.aliases ? [...exercise.aliases] : undefined,
});

const parseVariantOption = (rawOption: unknown): ExerciseVariantOption | null => {
  if (!rawOption || typeof rawOption !== 'object') {
    return null;
  }

  const option = rawOption as Record<string, unknown>;
  const label = typeof option.label === 'string' ? option.label.trim() : '';
  if (!label) {
    return null;
  }

  const field = option.field;
  const normalisedField =
    field === 'angle' || field === 'grip' || field === 'posture' || field === 'laterality'
      ? field
      : undefined;

  const value = typeof option.value === 'string' ? option.value.trim() : undefined;
  const aliases = Array.isArray(option.aliases)
    ? option.aliases
        .filter((alias): alias is string => typeof alias === 'string')
        .map((alias) => alias.trim())
        .filter(Boolean)
    : undefined;

  return {
    label,
    field: normalisedField,
    value: value || undefined,
    aliases: aliases && aliases.length > 0 ? aliases : undefined,
  };
};

const parseVariantOptions = (rawOptions: unknown): ExerciseVariantOption[] | undefined => {
  if (!Array.isArray(rawOptions)) {
    return undefined;
  }

  const options = rawOptions.map(parseVariantOption).filter((option): option is ExerciseVariantOption => Boolean(option));
  return options.length > 0 ? options : undefined;
};

const getDefaultVariantForExercise = (
  variantOptions?: ExerciseVariantOption[]
): ExerciseVariant | null => {
  if (!variantOptions || variantOptions.length === 0) {
    return null;
  }

  const defaultVariant: ExerciseVariant = {};

  for (const option of variantOptions) {
    if (!option.field || !option.value) {
      continue;
    }

    if (defaultVariant[option.field]) {
      continue;
    }

    defaultVariant[option.field] = option.value;
  }

  return Object.keys(defaultVariant).length > 0 ? defaultVariant : null;
};

const buildExerciseIdentity = (exercise: Pick<ProgramExercise, 'name' | 'variant'>): string =>
  JSON.stringify({
    name: exercise.name,
    variant: exercise.variant ?? null,
  });

const areExercisesEquivalent = (
  left: Pick<ProgramExercise, 'name' | 'variant'>,
  right: Pick<ProgramExercise, 'name' | 'variant'>
): boolean => buildExerciseIdentity(left) === buildExerciseIdentity(right);

const cloneWorkoutDay = (day: WorkoutDay): WorkoutDay => ({
  ...day,
  exercises: day.exercises.map(cloneExercise),
});

const cloneWorkoutDays = (days: WorkoutDay[]): WorkoutDay[] => days.map(cloneWorkoutDay);

export default function ProgramsScreen() {
  // View state
  const [viewMode, setViewMode] = useState<ProgramViewMode>(ProgramViewMode.List);
  const [createStep, setCreateStep] = useState<CreateProgramStep>(CreateProgramStep.BasicInfo);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  
  // Data state
  const [programs, setPrograms] = useState<Program[]>([]);
  const [currentProgramId, setCurrentProgramId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [programName, setProgramName] = useState('');
  const [numberOfDays, setNumberOfDays] = useState('');
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([]);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [selectedExercises, setSelectedExercises] = useState<ProgramExercise[]>([]);
  const [showExerciseList, setShowExerciseList] = useState(false);

  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

  // Load exercises from JSON
  const exercises: Exercise[] = useMemo(() => {
    return exercisesData.map((rawExercise) => {
      const ex = rawExercise as Record<string, unknown>;
      const variantOptions = parseVariantOptions(ex.variantOptions);
      const aliases = Array.isArray(ex.aliases)
        ? ex.aliases
            .filter((alias): alias is string => typeof alias === 'string')
            .map((alias) => alias.trim())
            .filter(Boolean)
        : undefined;

      return {
        name: typeof ex.name === 'string' ? ex.name : '',
        equipment: typeof ex.equipment === 'string' ? ex.equipment : '',
        muscle_groups_worked: Array.isArray(ex.muscle_groups_worked)
          ? ex.muscle_groups_worked.filter((group): group is string => typeof group === 'string')
          : [],
        isCompound: Boolean(ex.isCompound),
        variantOptions,
        aliases: aliases && aliases.length > 0 ? aliases : undefined,
      };
    });
  }, []);

  // Load programs on mount
  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    try {
      setIsLoading(true);
      const loadedPrograms = await db.getAllPrograms();
      setPrograms(loadedPrograms);
      
      const currentId = await db.getCurrentProgramId();
      setCurrentProgramId(currentId);
    } catch (error) {
      console.error('Error loading programs:', error);
      Alert.alert('Error', 'Failed to load programs');
    } finally {
      setIsLoading(false);
    }
  };

  const clearForm = useCallback(() => {
    setProgramName('');
    setNumberOfDays('');
    setWorkoutDays([]);
    setSelectedExercises([]);
    setShowExerciseList(false);
    setCurrentDayIndex(0);
    setCreateStep(CreateProgramStep.BasicInfo);
  }, []);

  const handleSetCurrentProgram = async (programId: string) => {
    try {
      await db.setCurrentProgramId(programId);
      setCurrentProgramId(programId);
      Alert.alert('Success', 'Program set as current! Your workout queue has been generated.');
    } catch (error) {
      console.error('Error setting current program:', error);
      Alert.alert('Error', 'Failed to set current program');
    }
  };

  const toggleExercise = useCallback((exercise: Exercise) => {
    const defaultVariant = getDefaultVariantForExercise(exercise.variantOptions);
    setSelectedExercises((prev) => {
      const isSelected = prev.some((e) =>
        areExercisesEquivalent(e, { name: exercise.name, variant: defaultVariant })
      );
      if (isSelected) {
        return prev.filter(
          (e) => !areExercisesEquivalent(e, { name: exercise.name, variant: defaultVariant })
        );
      }

      return [...prev, createProgramExercise(exercise, defaultVariant)];
    });
  }, []);

  const removeExercise = useCallback((exerciseToRemove: ProgramExercise) => {
    setSelectedExercises((prev) =>
      prev.filter((exercise) => !areExercisesEquivalent(exercise, exerciseToRemove))
    );
  }, []);

  const updateExerciseField = useCallback(
    (
      exerciseIdentity: Pick<ProgramExercise, 'name' | 'variant'>,
      field: keyof ProgramExercise,
      value: string | boolean | ExerciseVariant | null,
      dayNumber?: number
    ) => {
      const numericFields: (keyof ProgramExercise)[] = [
        'weight',
        'reps',
        'sets',
        'restTime',
        'progression',
      ];

      const finalValue: ProgramExercise[keyof ProgramExercise] =
        field === 'hasCustomisedSets'
          ? Boolean(value)
          : field === 'variant'
          ? (value as ExerciseVariant | null)
          : numericFields.includes(field)
          ? String(value)
          : String(value);

      if (createStep === CreateProgramStep.Configuration && dayNumber !== undefined) {
        setWorkoutDays((prev) =>
          prev.map((day) =>
            day.dayNumber === dayNumber
              ? {
                  ...day,
                  exercises: day.exercises.map((ex) =>
                    areExercisesEquivalent(ex, exerciseIdentity)
                      ? { ...ex, [field]: finalValue }
                      : ex
                  ),
                }
              : day
          )
        );
      } else {
        setSelectedExercises((prev) =>
          prev.map((ex) =>
            areExercisesEquivalent(ex, exerciseIdentity)
              ? { ...ex, [field]: finalValue }
              : ex
          )
        );
      }
    },
    [createStep]
  );

  const continueToExerciseSelection = () => {
    const nameValidation = validateProgramName(programName);
    if (!nameValidation.isValid) {
      Alert.alert('Validation Error', nameValidation.errors[0]);
      return;
    }

    const days = parseInt(numberOfDays, 10);
    const daysValidation = validateNumberOfDays(days);
    if (!daysValidation.isValid) {
      Alert.alert('Validation Error', daysValidation.errors[0]);
      return;
    }

    const daysArray: WorkoutDay[] = Array.from({ length: days }, (_, i) => ({
      dayNumber: i + 1,
      exercises: [],
    }));
    setWorkoutDays(daysArray);
    setCurrentDayIndex(0);
    setSelectedExercises([]);
    setCreateStep(CreateProgramStep.ExerciseSelection);
  };

  const continueToConfiguration = () => {
    const updatedDays = cloneWorkoutDays(workoutDays);
    updatedDays[currentDayIndex].exercises = selectedExercises.map(cloneExercise);
    setWorkoutDays(updatedDays);

    const allDaysHaveExercises = updatedDays.every((day) => day.exercises.length > 0);
    if (!allDaysHaveExercises) {
      const incompleteDays = updatedDays
        .map((day, idx) => (day.exercises.length === 0 ? idx + 1 : null))
        .filter((day) => day !== null);
      Alert.alert(
        'Incomplete Days',
        `Please select at least one exercise for Day ${incompleteDays.join(', ')}`
      );
      return;
    }

    setCreateStep(CreateProgramStep.Configuration);
  };

  const goToNextDay = () => {
    const updatedDays = cloneWorkoutDays(workoutDays);
    updatedDays[currentDayIndex].exercises = selectedExercises.map(cloneExercise);
    setWorkoutDays(updatedDays);

    if (currentDayIndex < workoutDays.length - 1) {
      const nextIndex = currentDayIndex + 1;
      setCurrentDayIndex(nextIndex);
      setSelectedExercises(updatedDays[nextIndex].exercises.map(cloneExercise));
      setShowExerciseList(false);
    }
  };

  const goToPreviousDay = () => {
    const updatedDays = cloneWorkoutDays(workoutDays);
    updatedDays[currentDayIndex].exercises = selectedExercises.map(cloneExercise);
    setWorkoutDays(updatedDays);

    if (currentDayIndex > 0) {
      const prevIndex = currentDayIndex - 1;
      setCurrentDayIndex(prevIndex);
      setSelectedExercises(updatedDays[prevIndex].exercises.map(cloneExercise));
      setShowExerciseList(false);
    }
  };

  const handleCreateProgram = async () => {
    // Dismiss keyboard to trigger blur on any focused inputs, ensuring all values are synced
    Keyboard.dismiss();
    
    const nameValidation = validateProgramName(programName);
    if (!nameValidation.isValid) {
      Alert.alert('Validation Error', nameValidation.errors[0]);
      return;
    }

    // Validate all exercises in all workout days
    for (const day of workoutDays) {
      for (const exercise of day.exercises) {
        const exerciseValidation = validateExercise(exercise);
        if (!exerciseValidation.isValid) {
          Alert.alert(
            'Validation Error',
            `Day ${day.dayNumber} - ${exercise.name}: ${exerciseValidation.errors[0]}`
          );
          return;
        }
      }
    }

    try {
      setIsSaving(true);
      const newProgram: Omit<Program, 'createdAt' | 'updatedAt'> = {
        id: Date.now().toString(),
        name: programName.trim(),
        workoutDays,
      };

      await db.createProgram(newProgram);
      
      // Auto-set as current program if no current program exists
      const existingCurrentId = await db.getCurrentProgramId();
      if (!existingCurrentId) {
        await db.setCurrentProgramId(newProgram.id);
        setCurrentProgramId(newProgram.id);
      }
      
      await loadPrograms();
      clearForm();
      setViewMode(ProgramViewMode.List);
      
      if (!existingCurrentId) {
        Alert.alert('Success', 'Program created and set as current! Your workout queue is ready.');
      } else {
        Alert.alert('Success', 'Program created successfully!');
      }
    } catch (error) {
      console.error('Error creating program:', error);
      Alert.alert('Error', 'Failed to create program');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateProgram = async () => {
    if (!selectedProgramId) return;

    // Dismiss keyboard to trigger blur on any focused inputs, ensuring all values are synced
    Keyboard.dismiss();

    const nameValidation = validateProgramName(programName);
    if (!nameValidation.isValid) {
      Alert.alert('Validation Error', nameValidation.errors[0]);
      return;
    }

    // Validate all exercises in all workout days
    for (const day of workoutDays) {
      for (const exercise of day.exercises) {
        const exerciseValidation = validateExercise(exercise);
        if (!exerciseValidation.isValid) {
          Alert.alert(
            'Validation Error',
            `Day ${day.dayNumber} - ${exercise.name}: ${exerciseValidation.errors[0]}`
          );
          return;
        }
      }
    }

    try {
      setIsSaving(true);
      const updatedProgram: Program = {
        id: selectedProgramId,
        name: programName.trim(),
        workoutDays,
        createdAt: programs.find((p) => p.id === selectedProgramId)?.createdAt || new Date().toISOString(),
      };

      await db.updateProgram(updatedProgram);
      await loadPrograms();
      clearForm();
      setViewMode(ProgramViewMode.List);
      setSelectedProgramId(null);
      Alert.alert('Success', 'Program updated successfully!');
    } catch (error) {
      console.error('Error updating program:', error);
      Alert.alert('Error', 'Failed to update program');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProgram = (programId: string, programNameToDelete: string) => {
    showDeleteConfirmation(programNameToDelete, async () => {
      try {
        await db.deleteProgram(programId);
        await loadPrograms();
        if (selectedProgramId === programId) {
          setViewMode(ProgramViewMode.List);
          setSelectedProgramId(null);
        }
        Alert.alert('Success', 'Program deleted successfully!');
      } catch (error) {
        console.error('Error deleting program:', error);
        Alert.alert('Error', 'Failed to delete program');
      }
    });
  };

  const viewProgram = (programId: string) => {
    setSelectedProgramId(programId);
    setViewMode(ProgramViewMode.View);
  };

  const editProgram = (programId: string) => {
    const program = programs.find((p) => p.id === programId);
    if (program) {
      const draftWorkoutDays = cloneWorkoutDays(program.workoutDays);

      setSelectedProgramId(programId);
      setProgramName(program.name);
      setWorkoutDays(draftWorkoutDays);
      setCurrentDayIndex(0);
      setSelectedExercises(draftWorkoutDays[0]?.exercises.map(cloneExercise) || []);
      setCreateStep(CreateProgramStep.Configuration);
      setViewMode(ProgramViewMode.Edit);
    }
  };

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);

  // Render loading state
  if (isLoading) {
    return (
      <ParallaxScrollView>
        <LoadingSpinner message="Loading programs..." fullScreen />
      </ParallaxScrollView>
    );
  }

  // List View
  if (viewMode === ProgramViewMode.List) {
    return (
      <ParallaxScrollView>
        <ThemedView className="border-b border-gray-200 dark:border-gray-700 pb-6">
          <ThemedText type="subtitle">Programs</ThemedText>
        </ThemedView>

        <ThemedView className="gap-3 border-b border-gray-200 dark:border-gray-700 pb-6">
          <Pressable
            onPress={() => {
              clearForm();
              setViewMode(ProgramViewMode.Create);
            }}
            accessibilityRole="button"
            accessibilityLabel="Create new program"
          >
            {({ pressed }) => (
              <View
                className="bg-blue-500 rounded-full p-4"
                style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
              >
                <ThemedText className="text-white text-center font-semibold text-lg">
                  + Create New Program
                </ThemedText>
              </View>
            )}
          </Pressable>

          {programs.length > 0 ? (
            <ThemedView className="gap-3 border-t border-gray-200 dark:border-gray-700 pt-5">
              <View className="flex-row items-start justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
                <View className="flex-1">
                  <ThemedText type="subtitle">Your Programs</ThemedText>
                  <ThemedText className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">
                    {programs.length} total
                  </ThemedText>
                </View>
                {currentProgramId ? (
                  <View className="items-end max-w-[60%]">
                    <ThemedText className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Current
                    </ThemedText>
                    <ThemedText className="text-sm font-semibold" numberOfLines={1}>
                      {programs.find((program) => program.id === currentProgramId)?.name ?? 'None'}
                    </ThemedText>
                  </View>
                ) : (
                  <View className="items-end">
                    <ThemedText className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Current
                    </ThemedText>
                    <ThemedText className="text-sm font-semibold">None</ThemedText>
                  </View>
                )}
              </View>
              <View className="gap-3">
                {programs.map((item) => (
                  <ProgramCard
                    key={item.id}
                    program={item}
                    isCurrentProgram={currentProgramId === item.id}
                    onPress={() => viewProgram(item.id)}
                  />
                ))}
              </View>
            </ThemedView>
          ) : (
            <EmptyState
              icon="doc.text"
              title="No Programs Yet"
              message='Tap "Create New Program" to get started!'
            />
          )}
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  // Create Program - Step 0: Basic Info
  if (viewMode === ProgramViewMode.Create && createStep === CreateProgramStep.BasicInfo) {
    return (
      <ParallaxScrollView>
        <ThemedView className="border-b border-gray-200 dark:border-gray-700 pb-6">
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => {
                clearForm();
                setViewMode(ProgramViewMode.List);
              }}
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
            <ThemedText type="subtitle">Create Program</ThemedText>
          </View>
        </ThemedView>

        <ThemedView className="gap-3">
          <ThemedView className="gap-2 border-b border-gray-200 dark:border-gray-700 pb-5">
            <ThemedText className="text-base font-semibold">Program Name</ThemedText>
            <TextInput
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3"
              placeholder="Enter program name..."
              placeholderTextColor="#999"
              value={programName}
              onChangeText={setProgramName}
              style={{ color: textColor, fontSize: 16 }}
              accessibilityLabel="Program name"
            />
          </ThemedView>

          <ThemedView className="gap-2 border-b border-gray-200 dark:border-gray-700 pb-5">
            <ThemedText className="text-base font-semibold">Number of Workout Days</ThemedText>
            <TextInput
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3"
              placeholder="e.g., 3 (for a 3-day split)"
              placeholderTextColor="#999"
              value={numberOfDays}
              onChangeText={setNumberOfDays}
              keyboardType="numeric"
              style={{ color: textColor, fontSize: 16 }}
              accessibilityLabel="Number of workout days"
            />
            <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
              How many unique workout days will this program contain?
            </ThemedText>
          </ThemedView>

          <Pressable
            onPress={continueToExerciseSelection}
            accessibilityRole="button"
            accessibilityLabel="Continue to exercise selection"
          >
            {({ pressed }) => (
              <View
                className="bg-green-500 rounded-full p-4"
                style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
              >
                <ThemedText className="text-white text-center font-semibold text-lg">
                  Continue to Exercise Selection →
                </ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  // Create Program - Step 1: Exercise Selection
  if (viewMode === ProgramViewMode.Create && createStep === CreateProgramStep.ExerciseSelection) {
    return (
      <ParallaxScrollView>
        <ThemedView className="border-b border-gray-200 dark:border-gray-700 pb-6">
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => setCreateStep(CreateProgramStep.BasicInfo)}
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
            <ThemedText type="subtitle">Day {currentDayIndex + 1}</ThemedText>
          </View>
        </ThemedView>

        <ThemedView className="gap-3">
          <ThemedView className="flex-row items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-5">
            <ThemedText className="text-base font-semibold">
              {programName} - Day {currentDayIndex + 1} of {workoutDays.length}
            </ThemedText>
          </ThemedView>

          {/* Day Navigation */}
          {workoutDays.length > 1 && (
            <View className="flex-row gap-2">
              <Pressable
                onPress={goToPreviousDay}
                disabled={currentDayIndex === 0}
                className={`flex-1 ${currentDayIndex === 0 ? 'opacity-50' : ''}`}
              >
                {({ pressed }) => (
                  <View
                    className="bg-gray-200 dark:bg-gray-700 py-2 rounded-full"
                    style={pressed && { opacity: 0.8 }}
                  >
                    <ThemedText className="text-center font-semibold">← Previous Day</ThemedText>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={goToNextDay}
                disabled={currentDayIndex === workoutDays.length - 1}
                className={`flex-1 ${currentDayIndex === workoutDays.length - 1 ? 'opacity-50' : ''}`}
              >
                {({ pressed }) => (
                  <View
                    className="bg-gray-200 dark:bg-gray-700 py-2 rounded-full"
                    style={pressed && { opacity: 0.8 }}
                  >
                    <ThemedText className="text-center font-semibold">Next Day →</ThemedText>
                  </View>
                )}
              </Pressable>
            </View>
          )}

          <Pressable onPress={() => setShowExerciseList(!showExerciseList)}>
            {({ pressed }) => (
              <View
                className={`rounded-full p-4 ${showExerciseList ? 'bg-blue-600' : 'bg-blue-500'}`}
                style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
              >
                <ThemedText className="text-white text-center font-semibold text-lg">
                  {showExerciseList ? 'Hide Exercise List' : 'Select Exercises'}
                </ThemedText>
              </View>
            )}
          </Pressable>

          {showExerciseList && (
            <ExerciseSelector
              exercises={exercises}
              selectedExercises={selectedExercises}
              onToggleExercise={toggleExercise}
            />
          )}

          <SelectedExercisesList
            exercises={selectedExercises}
            dayNumber={currentDayIndex + 1}
            onRemove={removeExercise}
          />

          {selectedExercises.length > 0 && (
            <Pressable
              onPress={() => {
                const updatedDays = cloneWorkoutDays(workoutDays);
                updatedDays[currentDayIndex].exercises = selectedExercises.map(cloneExercise);
                setWorkoutDays(updatedDays);

                const allDaysComplete = updatedDays.every((day) => day.exercises.length > 0);
                const isLastDay = currentDayIndex === workoutDays.length - 1;

                if (allDaysComplete || isLastDay) {
                  continueToConfiguration();
                } else {
                  goToNextDay();
                }
              }}
            >
              {({ pressed }) => {
                const updatedDays = cloneWorkoutDays(workoutDays);
                updatedDays[currentDayIndex].exercises = selectedExercises.map(cloneExercise);
                const allDaysComplete = updatedDays.every((day) => day.exercises.length > 0);
                const isLastDay = currentDayIndex === workoutDays.length - 1;

                return (
                  <View
                    className="bg-green-500 rounded-full p-4"
                    style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                  >
                    <ThemedText className="text-white text-center font-semibold text-lg">
                      {allDaysComplete || isLastDay
                        ? 'Continue to Configuration →'
                        : `Continue to Day ${currentDayIndex + 2} →`}
                    </ThemedText>
                  </View>
                );
              }}
            </Pressable>
          )}
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  // Create/Edit Program - Step 2: Configuration
  if (
    (viewMode === ProgramViewMode.Create || viewMode === ProgramViewMode.Edit) &&
    createStep === CreateProgramStep.Configuration
  ) {
    const isEditing = viewMode === ProgramViewMode.Edit;

    return (
      <ParallaxScrollView>
        <ThemedView className="border-b border-gray-200 dark:border-gray-700 pb-6">
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => {
                if (isEditing) {
                  clearForm();
                  setViewMode(ProgramViewMode.List);
                  setSelectedProgramId(null);
                } else {
                  setCreateStep(CreateProgramStep.ExerciseSelection);
                }
              }}
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
            <ThemedText type="subtitle">
              {isEditing ? 'Edit Program' : 'Configure Exercises'}
            </ThemedText>
          </View>
        </ThemedView>

        <ThemedView className="gap-3">
          {isEditing && (
            <ThemedView className="gap-2 mb-4">
              <ThemedText className="text-base font-semibold">Program Name</ThemedText>
              <TextInput
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3"
                placeholder="Enter program name..."
                placeholderTextColor="#999"
                value={programName}
                onChangeText={setProgramName}
                style={{ color: textColor, fontSize: 16 }}
              />
            </ThemedView>
          )}

          <ThemedView className="gap-2 mb-4">
            <ThemedText className="text-lg font-semibold">{programName}</ThemedText>
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
              {workoutDays.length} day{workoutDays.length !== 1 ? 's' : ''} •{' '}
              {workoutDays.reduce((sum, day) => sum + day.exercises.length, 0)} exercises total
            </ThemedText>
          </ThemedView>

          {workoutDays.map((day) => (
            <Collapsible
              key={day.dayNumber}
              title={`Day ${day.dayNumber} (${day.exercises.length} exercises)`}
            >
              <View className="mt-2">
                {day.exercises.map((exercise, index) => (
                  <ExerciseConfigCard
                    key={`${day.dayNumber}-${buildExerciseIdentity(exercise)}`}
                    exercise={exercise}
                    index={index}
                    onUpdate={(field, value) =>
                      updateExerciseField(
                        { name: exercise.name, variant: exercise.variant ?? null },
                        field,
                        value,
                        day.dayNumber
                      )
                    }
                  />
                ))}
              </View>
            </Collapsible>
          ))}

          <Pressable
            onPress={isEditing ? handleUpdateProgram : handleCreateProgram}
            disabled={isSaving}
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
                    ✓ {isEditing ? 'Update Program' : 'Create Program'}
                  </ThemedText>
                )}
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  // View Program Details
  if (viewMode === ProgramViewMode.View && selectedProgram) {
    return (
      <ParallaxScrollView>
        <ThemedView className="border-b border-gray-200 dark:border-gray-700 pb-6">
          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => setViewMode(ProgramViewMode.List)}
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
            <ThemedText type="subtitle" numberOfLines={1} className="flex-1">
              {selectedProgram.name}
            </ThemedText>
          </View>
        </ThemedView>

        <ThemedView className="gap-3">
          <View className="mb-4 border-b border-gray-200 dark:border-gray-700 pb-5">
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {selectedProgram.workoutDays.length} day
              {selectedProgram.workoutDays.length !== 1 ? 's' : ''} •{' '}
              {selectedProgram.workoutDays.reduce((sum, day) => sum + day.exercises.length, 0)}{' '}
              exercises
            </ThemedText>

            <View className="gap-2">
              {currentProgramId !== selectedProgram.id && (
                <Pressable onPress={() => handleSetCurrentProgram(selectedProgram.id)}>
                  {({ pressed }) => (
                    <View
                      className="bg-blue-500 px-4 py-3 rounded-full"
                      style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                    >
                      <ThemedText className="text-white text-center font-semibold">
                        Set as Current Program
                      </ThemedText>
                    </View>
                  )}
                </Pressable>
              )}
              {currentProgramId === selectedProgram.id && (
                <View className="bg-green-500 px-4 py-3 rounded-full">
                  <ThemedText className="text-white text-center font-semibold">
                    ✓ Current Program
                  </ThemedText>
                </View>
              )}
              <Pressable onPress={() => editProgram(selectedProgram.id)}>
                {({ pressed }) => (
                  <View
                    className="bg-blue-500 px-4 py-3 rounded-full"
                    style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                  >
                    <ThemedText className="text-white text-center font-semibold">
                      Edit Program
                    </ThemedText>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => handleDeleteProgram(selectedProgram.id, selectedProgram.name)}
              >
                {({ pressed }) => (
                  <View
                    className="bg-red-500 px-4 py-3 rounded-full"
                    style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                  >
                    <ThemedText className="text-white text-center font-semibold">
                      Delete Program
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          {selectedProgram.workoutDays.map((day) => (
            <Collapsible
              key={day.dayNumber}
              title={`Day ${day.dayNumber} (${day.exercises.length} exercises)`}
            >
              <View className="mt-2 gap-3">
                {day.exercises.map((exercise, index) => (
                  <View
                    key={`${exercise.name}-${index}`}
                    className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600"
                  >
                    <View className="flex-row items-center gap-2 mb-2">
                      <View className="bg-blue-500 w-6 h-6 rounded-full items-center justify-center">
                        <ThemedText className="text-white font-bold text-xs">
                          {index + 1}
                        </ThemedText>
                      </View>
                      <ThemedText className="font-bold text-base flex-1">
                        {formatExerciseDisplayName(exercise.name, exercise.variant)}
                      </ThemedText>
                    </View>

                    <View className="flex-row flex-wrap gap-4 mt-2">
                      {exercise.sets && (
                        <View>
                          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                            Sets
                          </ThemedText>
                          <ThemedText className="font-semibold">{exercise.sets}</ThemedText>
                        </View>
                      )}
                      {exercise.reps && (
                        <View>
                          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                            Reps
                          </ThemedText>
                          <ThemedText className="font-semibold">{exercise.reps}</ThemedText>
                        </View>
                      )}
                      {exercise.weight !== undefined && exercise.weight !== '0' && (
                        <View>
                          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                            Weight
                          </ThemedText>
                          <ThemedText className="font-semibold">{exercise.weight}</ThemedText>
                        </View>
                      )}
                      {exercise.restTime && (
                        <View>
                          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                            Rest
                          </ThemedText>
                          <ThemedText className="font-semibold">{exercise.restTime}s</ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </Collapsible>
          ))}
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  // Fallback
  return null;
}

// Re-export types for backward compatibility
export type { Exercise, Program, ProgramExercise, WorkoutDay };
