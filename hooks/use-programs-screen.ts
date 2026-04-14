import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, Keyboard } from 'react-native';

import exercisesData from '@/data/exerciseSelection.json';
import { coerceExerciseFieldValue } from '@/lib/exercise-field-coercion';
import { validateExercise, validateNumberOfDays, validateProgramName } from '@/lib/validation';
import * as db from '@/services/database';
import { getDefaultVariantForExercise, parseExerciseCatalog } from '@/services/catalog/parse-catalog';
import {
  areExercisesEquivalent,
  cloneExercise,
  cloneWorkoutDays,
  commitCurrentDay,
} from '@/services/programs/clone';
import { createProgramExercise } from '@/components/programs/ExerciseSelector';
import { showDeleteConfirmation } from '@/components/ui/ConfirmDialog';
import type {
  DraftProgram,
  Exercise,
  ExerciseVariant,
  Program,
  ProgramExercise,
  WorkoutDay,
} from '@/types';
import { CreateProgramStep, ProgramViewMode } from '@/types';

export interface DuplicateProgramModalState {
  visible: boolean;
  programId: string;
  sourceName: string;
  newName: string;
}

export interface ProgramsScreenResult {
  viewMode: ProgramViewMode;
  createStep: CreateProgramStep;
  programs: Program[];
  currentProgramId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  programName: string;
  numberOfDays: string;
  workoutDays: WorkoutDay[];
  currentDayIndex: number;
  selectedExercises: ProgramExercise[];
  showExerciseList: boolean;
  duplicateModal: DuplicateProgramModalState;
  exercises: Exercise[];
  selectedProgram: Program | undefined;
  setViewMode: Dispatch<SetStateAction<ProgramViewMode>>;
  setCreateStep: Dispatch<SetStateAction<CreateProgramStep>>;
  setProgramName: Dispatch<SetStateAction<string>>;
  setNumberOfDays: Dispatch<SetStateAction<string>>;
  setShowExerciseList: Dispatch<SetStateAction<boolean>>;
  clearForm: () => void;
  handleSetCurrentProgram: (programId: string) => Promise<void>;
  toggleExercise: (exercise: Exercise) => void;
  removeExercise: (exerciseToRemove: ProgramExercise) => void;
  updateExerciseField: (
    exerciseIdentity: Pick<ProgramExercise, 'name' | 'variant'>,
    field: keyof ProgramExercise,
    value: string | boolean | number | ExerciseVariant | null,
    dayNumber?: number
  ) => void;
  continueToExerciseSelection: () => void;
  continueToConfiguration: () => void;
  goToNextDay: () => void;
  goToPreviousDay: () => void;
  handleCreateProgram: () => Promise<void>;
  handleUpdateProgram: () => Promise<void>;
  handleDeleteProgram: (programId: string, programNameToDelete: string) => void;
  handleDuplicateProgram: (programId: string, sourceName: string) => void;
  updateDuplicateName: (text: string) => void;
  closeDuplicateModal: () => void;
  confirmDuplicateProgram: () => Promise<void>;
  viewProgram: (programId: string) => void;
  editProgram: (programId: string) => void;
}

/**
 * Encapsulates Programs screen state, validation, and database writes.
 * The screen stays focused on rendering while this hook owns program workflow behavior.
 */
export const useProgramsScreen = (): ProgramsScreenResult => {
  const [viewMode, setViewMode] = useState<ProgramViewMode>(ProgramViewMode.List);
  const [createStep, setCreateStep] = useState<CreateProgramStep>(CreateProgramStep.BasicInfo);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [currentProgramId, setCurrentProgramId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [programName, setProgramName] = useState('');
  const [numberOfDays, setNumberOfDays] = useState('');
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([]);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [selectedExercises, setSelectedExercises] = useState<ProgramExercise[]>([]);
  const [showExerciseList, setShowExerciseList] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<DuplicateProgramModalState>({
    visible: false,
    programId: '',
    sourceName: '',
    newName: '',
  });

  const exercises = useMemo(() => parseExerciseCatalog(exercisesData as unknown[]), []);
  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId),
    [programs, selectedProgramId]
  );

  /**
   * Loads all programs plus the currently selected active-program id from persistence.
   * Failures surface as alerts because the screen cannot function without this state.
   */
  const loadPrograms = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  /**
   * Resets all create/edit form state back to its initial baseline.
   * The list view uses this to avoid stale draft state bleeding across sessions.
   */
  const clearForm = useCallback(() => {
    setProgramName('');
    setNumberOfDays('');
    setWorkoutDays([]);
    setSelectedExercises([]);
    setShowExerciseList(false);
    setCurrentDayIndex(0);
    setCreateStep(CreateProgramStep.BasicInfo);
  }, []);

  /**
   * Persists the chosen current program and refreshes the local active-program mirror.
   * Successful saves also inform the user that the workout queue has been regenerated.
   */
  const handleSetCurrentProgram = useCallback(async (programId: string) => {
    try {
      await db.setCurrentProgramId(programId);
      setCurrentProgramId(programId);
      Alert.alert('Success', 'Program set as current! Your workout queue has been generated.');
    } catch (error) {
      console.error('Error setting current program:', error);
      Alert.alert('Error', 'Failed to set current program');
    }
  }, []);

  /**
   * Adds or removes an exercise from the current day-selection basket.
   * Matching uses canonical exercise identity so variant-aware duplicates behave correctly.
   */
  const toggleExercise = useCallback((exercise: Exercise) => {
    const defaultVariant = getDefaultVariantForExercise(exercise.variantOptions);
    setSelectedExercises((prev) => {
      const isSelected = prev.some((existing) =>
        areExercisesEquivalent(existing, { name: exercise.name, variant: defaultVariant })
      );

      if (isSelected) {
        return prev.filter(
          (existing) =>
            !areExercisesEquivalent(existing, { name: exercise.name, variant: defaultVariant })
        );
      }

      return [...prev, createProgramExercise(exercise, defaultVariant)];
    });
  }, []);

  /**
   * Removes one selected exercise instance from the current selection basket.
   * Identity matching remains variant-aware to avoid deleting the wrong exercise.
   */
  const removeExercise = useCallback((exerciseToRemove: ProgramExercise) => {
    setSelectedExercises((prev) =>
      prev.filter((exercise) => !areExercisesEquivalent(exercise, exerciseToRemove))
    );
  }, []);

  /**
   * Updates one exercise field either in the staged day draft or the selected-exercise basket.
   * Field coercion is centralized so numeric/string/boolean screen edits preserve the domain contract.
   */
  const updateExerciseField = useCallback(
    (
      exerciseIdentity: Pick<ProgramExercise, 'name' | 'variant'>,
      field: keyof ProgramExercise,
      value: string | boolean | number | ExerciseVariant | null,
      dayNumber?: number
    ) => {
      const finalValue = coerceExerciseFieldValue(field, value);

      if (createStep === CreateProgramStep.Configuration && dayNumber !== undefined) {
        setWorkoutDays((prev) =>
          prev.map((day) =>
            day.dayNumber === dayNumber
              ? {
                  ...day,
                  exercises: day.exercises.map((exercise) =>
                    areExercisesEquivalent(exercise, exerciseIdentity)
                      ? { ...exercise, [field]: finalValue }
                      : exercise
                  ),
                }
              : day
          )
        );
        return;
      }

      setSelectedExercises((prev) =>
        prev.map((exercise) =>
          areExercisesEquivalent(exercise, exerciseIdentity)
            ? { ...exercise, [field]: finalValue }
            : exercise
        )
      );
    },
    [createStep]
  );

  /**
   * Validates the basic-info step and expands the requested number of workout days.
   * Invalid name/day-count input is blocked before the workflow advances.
   */
  const continueToExerciseSelection = useCallback(() => {
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

    const daysArray: WorkoutDay[] = Array.from({ length: days }, (_, index) => ({
      dayNumber: index + 1,
      exercises: [],
    }));
    setWorkoutDays(daysArray);
    setCurrentDayIndex(0);
    setSelectedExercises([]);
    setCreateStep(CreateProgramStep.ExerciseSelection);
  }, [numberOfDays, programName]);

  /**
   * Commits the currently selected exercises into the active day and checks completeness.
   * The workflow advances only when every day has at least one exercise.
   */
  const continueToConfiguration = useCallback(() => {
    const updatedDays = commitCurrentDay(workoutDays, currentDayIndex, selectedExercises);
    setWorkoutDays(updatedDays);

    const allDaysHaveExercises = updatedDays.every((day) => day.exercises.length > 0);
    if (!allDaysHaveExercises) {
      const incompleteDays = updatedDays
        .map((day) => (day.exercises.length === 0 ? day.dayNumber : null))
        .filter((day): day is number => day !== null);
      Alert.alert(
        'Incomplete Days',
        `Please select at least one exercise for Day ${incompleteDays.join(', ')}`
      );
      return;
    }

    setCreateStep(CreateProgramStep.Configuration);
  }, [currentDayIndex, selectedExercises, workoutDays]);

  /**
   * Commits the active day and advances to the next one during exercise selection.
   * The next day loads as a cloned draft so edits never mutate prior days by reference.
   */
  const goToNextDay = useCallback(() => {
    const updatedDays = commitCurrentDay(workoutDays, currentDayIndex, selectedExercises);
    setWorkoutDays(updatedDays);

    if (currentDayIndex < workoutDays.length - 1) {
      const nextIndex = currentDayIndex + 1;
      setCurrentDayIndex(nextIndex);
      setSelectedExercises(updatedDays[nextIndex].exercises.map(cloneExercise));
      setShowExerciseList(false);
    }
  }, [currentDayIndex, selectedExercises, workoutDays]);

  /**
   * Commits the active day and restores the previous one during exercise selection.
   * Cloned drafts prevent accidental shared-object mutation across day navigation.
   */
  const goToPreviousDay = useCallback(() => {
    const updatedDays = commitCurrentDay(workoutDays, currentDayIndex, selectedExercises);
    setWorkoutDays(updatedDays);

    if (currentDayIndex > 0) {
      const previousIndex = currentDayIndex - 1;
      setCurrentDayIndex(previousIndex);
      setSelectedExercises(updatedDays[previousIndex].exercises.map(cloneExercise));
      setShowExerciseList(false);
    }
  }, [currentDayIndex, selectedExercises, workoutDays]);

  /**
   * Validates and persists a newly created program, auto-selecting it when no active program exists.
   * The workflow resets back to the list view after a successful create.
   */
  const handleCreateProgram = useCallback(async () => {
    if (isSavingRef.current) return;
    Keyboard.dismiss();

    const nameValidation = validateProgramName(programName);
    if (!nameValidation.isValid) {
      Alert.alert('Validation Error', nameValidation.errors[0]);
      return;
    }

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

    isSavingRef.current = true;
    try {
      setIsSaving(true);
      const newProgram: DraftProgram = {
        id: Date.now().toString(),
        name: programName.trim(),
        workoutDays,
      };

      await db.createProgram(newProgram);

      const existingCurrentId = await db.getCurrentProgramId();
      if (!existingCurrentId) {
        await db.setCurrentProgramId(newProgram.id);
        setCurrentProgramId(newProgram.id);
      }

      await loadPrograms();
      clearForm();
      setViewMode(ProgramViewMode.List);

      Alert.alert(
        'Success',
        existingCurrentId
          ? 'Program created successfully!'
          : 'Program created and set as current! Your workout queue is ready.'
      );
    } catch (error) {
      console.error('Error creating program:', error);
      Alert.alert('Error', 'Failed to create program');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }, [clearForm, loadPrograms, programName, workoutDays]);

  /**
   * Validates and persists edits to the selected program, refreshing the queue when it is active.
   * Successful saves return the workflow to the list view and clear the edit draft state.
   */
  const handleUpdateProgram = useCallback(async () => {
    if (!selectedProgramId || isSavingRef.current) {
      return;
    }

    Keyboard.dismiss();

    const nameValidation = validateProgramName(programName);
    if (!nameValidation.isValid) {
      Alert.alert('Validation Error', nameValidation.errors[0]);
      return;
    }

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

    isSavingRef.current = true;
    try {
      setIsSaving(true);
      const updatedProgram: Program = {
        id: selectedProgramId,
        name: programName.trim(),
        workoutDays,
        createdAt:
          programs.find((program) => program.id === selectedProgramId)?.createdAt ||
          new Date().toISOString(),
      };

      await db.updateProgram(updatedProgram);
      if (currentProgramId === updatedProgram.id) {
        await db.generateWorkoutQueue(updatedProgram.id);
      }

      await loadPrograms();
      clearForm();
      setViewMode(ProgramViewMode.List);
      setSelectedProgramId(null);
      Alert.alert(
        'Success',
        currentProgramId === updatedProgram.id
          ? 'Program updated and workout queue refreshed successfully!'
          : 'Program updated successfully!'
      );
    } catch (error) {
      console.error('Error updating program:', error);
      Alert.alert('Error', 'Failed to update program');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }, [clearForm, currentProgramId, loadPrograms, programName, programs, selectedProgramId, workoutDays]);

  /**
   * Deletes a program after confirmation and returns the screen to the list if that program was open.
   * The active selection is cleared through the existing database helpers when needed.
   */
  const handleDeleteProgram = useCallback(
    (programId: string, programNameToDelete: string) => {
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
    },
    [loadPrograms, selectedProgramId]
  );

  /**
   * Opens the duplicate-name modal with a sensible default copy name.
   * The source id/name are preserved so retry flows can reopen the same draft.
   */
  const handleDuplicateProgram = useCallback((programId: string, sourceName: string) => {
    setDuplicateModal({
      visible: true,
      programId,
      sourceName,
      newName: `${sourceName} Copy`,
    });
  }, []);

  /**
   * Updates the duplicate-program modal draft name as the user types.
   */
  const updateDuplicateName = useCallback((text: string) => {
    setDuplicateModal((prev) => ({ ...prev, newName: text }));
  }, []);

  /**
   * Closes the duplicate-program modal without running the duplicate action.
   */
  const closeDuplicateModal = useCallback(() => {
    setDuplicateModal((prev) => ({ ...prev, visible: false }));
  }, []);

  /**
   * Persists a duplicated program using the current modal draft name.
   * Name collisions reopen the rename flow instead of silently failing.
   */
  const confirmDuplicateProgram = useCallback(async () => {
    const proposedName = duplicateModal.newName.trim() || `${duplicateModal.sourceName} Copy`;
    setDuplicateModal((prev) => ({ ...prev, visible: false }));

    try {
      await db.duplicateProgram(duplicateModal.programId, proposedName);
      await loadPrograms();
      Alert.alert('Success', 'Program duplicated successfully!');
    } catch (error) {
      if (error instanceof Error && error.message === 'Program name already exists') {
        Alert.alert(
          'Name Already Exists',
          'Program name already exists. Please choose a different name.',
          [
            {
              text: 'Rename',
              onPress: () =>
                handleDuplicateProgram(duplicateModal.programId, duplicateModal.sourceName),
            },
          ]
        );
        return;
      }

      console.error('Error duplicating program:', error);
      Alert.alert('Error', 'Failed to duplicate program');
    }
  }, [duplicateModal, handleDuplicateProgram, loadPrograms]);

  /**
   * Opens a program in read-only detail mode from the list view.
   */
  const viewProgram = useCallback((programId: string) => {
    setSelectedProgramId(programId);
    setViewMode(ProgramViewMode.View);
  }, []);

  /**
   * Loads a program into the editable draft state and opens configuration mode.
   * Workout days are cloned so editing cannot mutate the persisted source object graph.
   */
  const editProgram = useCallback(
    (programId: string) => {
      const program = programs.find((entry) => entry.id === programId);
      if (!program) {
        return;
      }

      const draftWorkoutDays = cloneWorkoutDays(program.workoutDays);
      setSelectedProgramId(programId);
      setProgramName(program.name);
      setWorkoutDays(draftWorkoutDays);
      setCurrentDayIndex(0);
      setSelectedExercises(draftWorkoutDays[0]?.exercises.map(cloneExercise) || []);
      setCreateStep(CreateProgramStep.Configuration);
      setViewMode(ProgramViewMode.Edit);
    },
    [programs]
  );

  return {
    viewMode,
    createStep,
    programs,
    currentProgramId,
    isLoading,
    isSaving,
    programName,
    numberOfDays,
    workoutDays,
    currentDayIndex,
    selectedExercises,
    showExerciseList,
    duplicateModal,
    exercises,
    selectedProgram,
    setViewMode,
    setCreateStep,
    setProgramName,
    setNumberOfDays,
    setShowExerciseList,
    clearForm,
    handleSetCurrentProgram,
    toggleExercise,
    removeExercise,
    updateExerciseField,
    continueToExerciseSelection,
    continueToConfiguration,
    goToNextDay,
    goToPreviousDay,
    handleCreateProgram,
    handleUpdateProgram,
    handleDeleteProgram,
    handleDuplicateProgram,
    updateDuplicateName,
    closeDuplicateModal,
    confirmDuplicateProgram,
    viewProgram,
    editProgram,
  };
};
