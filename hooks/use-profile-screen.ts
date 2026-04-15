import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { showConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MAX_WORKOUT_DAYS, MIN_WORKOUT_DAYS } from '@/constants';
import { validatePositiveDecimal, validatePositiveInteger } from '@/lib/validation';
import * as db from '@/services/database';
import { TrainingGoal, type ExperienceLevel, type MuscleGroupTarget, type UserProfile } from '@/types';

type NumericValidationResult = {
  value: number | null;
  isValid: boolean;
  error: string | null;
};

type NumericValidateFn = (input: string) => NumericValidationResult;
type NumericSaveFn = (value: number | null) => Promise<void>;

type ProfileStats = {
  totalWorkouts: number;
  totalPrograms: number;
};

export interface NumericInputController {
  localValue: string;
  error: string | null;
  handleFocus: () => void;
  handleChange: (text: string) => void;
  handleBlur: () => Promise<void>;
}

export interface ProfileScreenResult {
  isLoading: boolean;
  profile: UserProfile | null;
  muscleGroupTargets: MuscleGroupTarget[];
  showMuscleTargetsModal: boolean;
  showAdvancedSettings: boolean;
  stats: ProfileStats;
  name: string;
  currentWeightInput: NumericInputController;
  goalWeightInput: NumericInputController;
  trainingDaysInput: NumericInputController;
  targetSetsInput: NumericInputController;
  handleNameChange: (text: string) => void;
  handleSessionDurationSelect: (durationMinutes: number) => Promise<void>;
  handleExperienceLevelSelect: (experienceLevel: ExperienceLevel) => Promise<void>;
  handleTrainingGoalSelect: (goal: TrainingGoal) => Promise<void>;
  handleOpenMuscleTargets: () => void;
  handleCloseMuscleTargets: () => void;
  toggleAdvancedSettings: () => void;
  handleSaveMuscleTargets: (targets: MuscleGroupTarget[]) => Promise<void>;
  handleClearWorkoutHistory: () => void;
}

/**
 * Manages a numeric text input with validation, normalization, and deferred persistence.
 * The controller keeps typing responsive while writing only validated values on blur.
 */
const useNumericInput = (
  initialValue: number | null,
  validate: NumericValidateFn,
  onSave: NumericSaveFn
): NumericInputController => {
  const [localValue, setLocalValue] = useState(initialValue?.toString() || '');
  const [error, setError] = useState<string | null>(null);
  const isFocusedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (isFocusedRef.current) {
      return;
    }

    setLocalValue(initialValue?.toString() || '');
  }, [initialValue]);

  /**
   * Marks the field as focused so upstream sync does not overwrite in-progress user edits.
   */
  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  /**
   * Stores the raw text while clearing stale validation errors from a previous blur event.
   */
  const handleChange = useCallback((text: string) => {
    setLocalValue(text);
    setError(null);
  }, []);

  /**
   * Validates, normalizes, and persists the field value after editing finishes.
   * Invalid input stays local and surfaces an inline error instead of touching persistence.
   */
  const handleBlur = useCallback(async () => {
    isFocusedRef.current = false;
    const result = validate(localValue);

    if (!result.isValid) {
      setError(result.error);
      return;
    }

    setError(null);
    setLocalValue(result.value?.toString() || '');
    try {
      await onSaveRef.current(result.value);
    } catch (err) {
      console.error('Error saving value:', err);
      setError('Failed to save');
    }
  }, [localValue, validate]);

  return { localValue, error, handleFocus, handleChange, handleBlur };
};

/**
 * Encapsulates Profile screen data loading, autosave, and persistence actions.
 * The screen can stay render-focused while profile behavior lives in one controller hook.
 */
export const useProfileScreen = (): ProfileScreenResult => {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [muscleGroupTargets, setMuscleGroupTargets] = useState<MuscleGroupTarget[]>([]);
  const [showMuscleTargetsModal, setShowMuscleTargetsModal] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [stats, setStats] = useState<ProfileStats>({
    totalWorkouts: 0,
    totalPrograms: 0,
  });
  const [name, setName] = useState('');
  const nameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNameRef = useRef<string | null>(null);

  /**
   * Loads profile details, target overrides, and summary counts for the screen.
   * Errors are logged locally and the loading state always settles in finally.
   */
  const loadData = useCallback(async () => {
    try {
      const [workouts, programs, userProfile, targets] = await Promise.all([
        db.getAllWorkouts(),
        db.getAllPrograms(),
        db.getUserProfile(),
        db.getMuscleGroupTargets(),
      ]);

      setStats({
        totalWorkouts: workouts.length,
        totalPrograms: programs.length,
      });
      setProfile(userProfile);
      setName(userProfile.name || '');
      setMuscleGroupTargets(targets);
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  /**
   * Debounces profile-name persistence so rapid typing does not spam database writes.
   * Empty text is normalized to null to preserve the stored profile contract.
   */
  const handleNameChange = useCallback((text: string) => {
    setName(text);
    pendingNameRef.current = text;

    if (nameTimeoutRef.current) {
      clearTimeout(nameTimeoutRef.current);
    }

    nameTimeoutRef.current = setTimeout(async () => {
      pendingNameRef.current = null;
      try {
        await db.updateUserProfile({ name: text || null });
      } catch (error) {
        console.error('Error saving name:', error);
      }
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (nameTimeoutRef.current) {
        clearTimeout(nameTimeoutRef.current);
      }
      if (pendingNameRef.current !== null) {
        const nameToSave = pendingNameRef.current;
        pendingNameRef.current = null;
        db.updateUserProfile({ name: nameToSave || null }).catch((err) =>
          console.error('Error flushing pending name save:', err)
        );
      }
    };
  }, []);

  const currentWeightInput = useNumericInput(
    profile?.currentWeight ?? null,
    validatePositiveDecimal,
    async (value) => {
      await db.updateUserProfile({ currentWeight: value });
      setProfile((prev) => (prev ? { ...prev, currentWeight: value } : null));
    }
  );

  const goalWeightInput = useNumericInput(
    profile?.goalWeight ?? null,
    validatePositiveDecimal,
    async (value) => {
      await db.updateUserProfile({ goalWeight: value });
      setProfile((prev) => (prev ? { ...prev, goalWeight: value } : null));
    }
  );

  const trainingDaysInput = useNumericInput(
    profile?.trainingDaysPerWeek ?? null,
    (input: string) => {
      const num = parseInt(input, 10);
      if (isNaN(num) || num < MIN_WORKOUT_DAYS || num > MAX_WORKOUT_DAYS) {
        return {
          value: null,
          isValid: false,
          error: `Training days must be between ${MIN_WORKOUT_DAYS} and ${MAX_WORKOUT_DAYS}`,
        };
      }

      return { value: num, isValid: true, error: null };
    },
    async (value) => {
      await db.updateUserProfile({ trainingDaysPerWeek: value });
      setProfile((prev) => (prev ? { ...prev, trainingDaysPerWeek: value } : null));
    }
  );

  /**
   * Persists the chosen session duration and mirrors the result into local profile state.
   * Failed writes surface immediately because the selection is a discrete save action.
   */
  const handleSessionDurationSelect = useCallback(async (durationMinutes: number) => {
    try {
      await db.updateUserProfile({ sessionDurationMinutes: durationMinutes });
      setProfile((prev) => (prev ? { ...prev, sessionDurationMinutes: durationMinutes } : null));
    } catch (error) {
      console.error('Error saving session duration:', error);
      Alert.alert('Error', 'Failed to save session duration');
    }
  }, []);

  /**
   * Persists the selected experience level and keeps the local profile mirror in sync.
   * Alerts are used so failed explicit selections are not silently ignored.
   */
  const handleExperienceLevelSelect = useCallback(async (experienceLevel: ExperienceLevel) => {
    try {
      await db.updateUserProfile({ experienceLevel });
      setProfile((prev) => (prev ? { ...prev, experienceLevel } : null));
    } catch (error) {
      console.error('Error saving experience level:', error);
      Alert.alert('Error', 'Failed to save experience level');
    }
  }, []);

  const targetSetsInput = useNumericInput(
    profile?.targetSetsPerWeek ?? null,
    validatePositiveInteger,
    async (value) => {
      await db.updateUserProfile({ targetSetsPerWeek: value });
      setProfile((prev) => (prev ? { ...prev, targetSetsPerWeek: value } : null));
    }
  );

  /**
   * Persists the selected training goal and updates the local profile snapshot on success.
   * Errors are surfaced to avoid silent divergence between the UI and stored profile data.
   */
  const handleTrainingGoalSelect = useCallback(async (goal: TrainingGoal) => {
    try {
      await db.updateUserProfile({ trainingGoal: goal });
      setProfile((prev) => (prev ? { ...prev, trainingGoal: goal } : null));
    } catch (error) {
      console.error('Error saving training goal:', error);
      Alert.alert('Error', 'Failed to save training goal');
    }
  }, []);

  /**
   * Opens the muscle-group override modal from the weekly-volume section.
   * Modal state stays in the hook so the screen remains declarative.
   */
  const handleOpenMuscleTargets = useCallback(() => {
    setShowMuscleTargetsModal(true);
  }, []);

  /**
   * Closes the muscle-group override modal without saving any pending edits.
   */
  const handleCloseMuscleTargets = useCallback(() => {
    setShowMuscleTargetsModal(false);
  }, []);

  /**
   * Toggles visibility of the advanced weekly-volume settings panel.
   * This is purely view state and does not affect persisted profile data.
   */
  const toggleAdvancedSettings = useCallback(() => {
    setShowAdvancedSettings((prev) => !prev);
  }, []);

  /**
   * Persists per-muscle-group set targets and closes the modal after a successful save.
   * The modal stays open on failure so the user can retry without losing context.
   */
  const handleSaveMuscleTargets = useCallback(async (targets: MuscleGroupTarget[]) => {
    try {
      await db.saveMuscleGroupTargets(targets);
      setMuscleGroupTargets(targets);
      setShowMuscleTargetsModal(false);
    } catch (error) {
      console.error('Error saving muscle group targets:', error);
      Alert.alert('Error', 'Failed to save muscle group targets');
    }
  }, []);

  /**
   * Clears all stored workout history after explicit destructive confirmation.
   * Statistics are updated locally only after the deletes have completed successfully.
   */
  const handleClearWorkoutHistory = useCallback(() => {
    showConfirmDialog({
      title: 'Clear Workout History',
      message:
        'Are you sure you want to delete all workout history? This action cannot be undone.',
      confirmText: 'Clear All',
      destructive: true,
      onConfirm: async () => {
        try {
          await db.clearAllWorkouts();
          setStats((prev) => ({ ...prev, totalWorkouts: 0 }));
        } catch (error) {
          console.error('Error clearing history:', error);
          Alert.alert('Error', 'Failed to clear workout history');
          return;
        }

        Alert.alert('Success', 'Workout history has been cleared');
      },
    });
  }, []);

  return {
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
  };
};
