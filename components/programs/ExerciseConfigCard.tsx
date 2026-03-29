/**
 * Exercise Configuration Card Component
 * Displays and allows editing of exercise details (sets, reps, weight, etc.)
 */

import React, { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatExerciseDisplayName } from '@/lib/utils';
import type { ExerciseVariant, ExerciseVariantOption, ProgramExercise } from '@/types';

interface ExerciseConfigCardProps {
  exercise: ProgramExercise;
  index: number;
  onUpdate: (field: keyof ProgramExercise, value: string | boolean | number | ExerciseVariant | null) => void;
  showRemove?: boolean;
  onRemove?: () => void;
}

const VARIANT_FIELD_LABELS: Record<NonNullable<ExerciseVariantOption['field']>, string> = {
  angle: 'Angle',
  grip: 'Grip',
  posture: 'Posture',
  laterality: 'Laterality',
};

const getVariantOptionKey = (option: ExerciseVariantOption): string => {
  return `${option.field ?? 'extra'}:${option.value ?? option.label}`;
};

const getVariantOptionLabel = (option: ExerciseVariantOption): string => {
  return option.value ?? option.label;
};

const applyVariantOption = (
  currentVariant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): ExerciseVariant | null => {
  const next: ExerciseVariant = { ...(currentVariant ?? {}) };

  if (!option.field || !option.value) {
    const currentExtras = next.extras ?? [];
    if (!currentExtras.includes(option.label)) {
      next.extras = [...currentExtras, option.label];
    }
    return next;
  }

  next[option.field] = option.value;
  return next;
};

const removeVariantOption = (
  currentVariant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): ExerciseVariant | null => {
  if (!currentVariant) {
    return null;
  }

  const next: ExerciseVariant = { ...currentVariant };

  if (!option.field || !option.value) {
    const remainingExtras = (next.extras ?? []).filter((extra) => extra !== option.label);
    if (remainingExtras.length > 0) {
      next.extras = remainingExtras;
    } else {
      delete next.extras;
    }
  } else if (next[option.field] === option.value) {
    delete next[option.field];
  }

  return Object.keys(next).length > 0 ? next : null;
};

const isVariantOptionSelected = (
  variant: ExerciseVariant | null | undefined,
  option: ExerciseVariantOption
): boolean => {
  if (!variant) {
    return false;
  }

  if (!option.field || !option.value) {
    return (variant.extras ?? []).includes(option.label);
  }

  return variant[option.field] === option.value;
};

/**
 * Normalizes a decimal string input for consistent storage.
 * - Removes leading zeros (except for "0.x" patterns)
 * - Removes trailing decimal point ("2." -> "2")
 * - Adds leading zero for decimals (".5" -> "0.5")
 * - Returns empty string for invalid/empty input
 */
const normalizeDecimalString = (input: string): string => {
  if (!input || input.trim() === '') return '';
  
  let normalized = input.trim();
  
  // Handle leading decimal point: ".5" -> "0.5"
  if (normalized.startsWith('.')) {
    normalized = '0' + normalized;
  }
  
  // Handle trailing decimal point: "2." -> "2"
  if (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }
  
  // Remove unnecessary leading zeros: "007" -> "7", but keep "0.5"
  if (normalized.includes('.')) {
    const [intPart, decPart] = normalized.split('.');
    normalized = `${parseInt(intPart, 10) || 0}.${decPart}`;
  } else if (normalized !== '') {
    normalized = String(parseInt(normalized, 10) || 0);
  }
  
  return normalized;
};

/**
 * Custom hook for decimal input fields that allows typing "2.5" without losing the decimal point.
 * 
 * PROBLEM: If we convert to number on every keystroke, "2." becomes "2" immediately,
 * preventing the user from ever typing "2.5".
 * 
 * SOLUTION: Keep a local string state while typing. Only sync to parent on blur.
 * Use focus tracking to prevent the useEffect from overwriting while user is typing.
 */
const useDecimalInput = (
  value: string | undefined,
  onUpdate: (value: string) => void
) => {
  const [localValue, setLocalValue] = useState(value?.toString() || '');
  const isFocusedRef = useRef(false);
  // Store onUpdate in a ref to avoid dependency issues with handleBlur
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  
  // Sync from parent when value changes externally (only if not focused)
  useEffect(() => {
    // Don't overwrite while user is actively typing
    if (isFocusedRef.current) return;
    
    const strValue = value?.toString() || '';
    setLocalValue(strValue);
  }, [value]);
  
  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);
  
  const handleChange = useCallback((text: string) => {
    // Allow empty, digits, and one decimal point
    if (text === '' || /^\d*\.?\d*$/.test(text)) {
      setLocalValue(text);
    }
  }, []);
  
  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    // Normalize and sync to parent on blur
    const normalized = normalizeDecimalString(localValue);
    // Update local display to normalized value
    setLocalValue(normalized);
    // Sync to parent
    onUpdateRef.current(normalized);
  }, [localValue]);
  
  return { localValue, handleFocus, handleChange, handleBlur };
};

/**
 * Custom hook for integer input fields.
 */
const useIntegerInput = (
  value: number | undefined,
  onUpdate: (value: number | null) => void
) => {
  const [localValue, setLocalValue] = useState(value?.toString() || '');
  const isFocusedRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  
  useEffect(() => {
    if (isFocusedRef.current) return;
    setLocalValue(value?.toString() || '');
  }, [value]);
  
  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);
  
  const handleChange = useCallback((text: string) => {
    if (text === '' || /^\d*$/.test(text)) {
      setLocalValue(text);
    }
  }, []);
  
  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    const parsed = localValue ? parseInt(localValue, 10) : null;
    onUpdateRef.current(parsed);
  }, [localValue]);
  
  return { localValue, handleFocus, handleChange, handleBlur };
};

export const ExerciseConfigCard = memo(function ExerciseConfigCard({
  exercise,
  index,
  onUpdate,
  showRemove,
  onRemove,
}: ExerciseConfigCardProps) {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';

  const handleFieldChange = useCallback(
    (field: keyof ProgramExercise) => (value: string) => {
      onUpdate(field, value);
    },
    [onUpdate]
  );

  const handleVariantToggle = useCallback(
    (option: ExerciseVariantOption) => {
      const isSelected = isVariantOptionSelected(exercise.variant, option);
      const nextVariant = isSelected
        ? removeVariantOption(exercise.variant, option)
        : applyVariantOption(exercise.variant, option);
      onUpdate('variant', nextVariant);
    },
    [exercise.variant, onUpdate]
  );

  const variantOptions = exercise.variantOptions ?? [];
  const hasVariantOptions = variantOptions.length > 0;
  
  // Memoize the specific field handlers to provide stable references for the decimal input hooks
  const handleWeightChange = useCallback(
    (value: string) => onUpdate('weight', value),
    [onUpdate]
  );
  const handleProgressionChange = useCallback(
    (value: string) => onUpdate('progression', value),
    [onUpdate]
  );
  const handleRepRangeMinChange = useCallback(
    (value: number | null) => onUpdate('repRangeMin', value),
    [onUpdate]
  );
  const handleRepRangeMaxChange = useCallback(
    (value: number | null) => onUpdate('repRangeMax', value),
    [onUpdate]
  );
  const handleProgressionThresholdChange = useCallback(
    (value: number | null) => onUpdate('progressionThreshold', value),
    [onUpdate]
  );
  
  // Use decimal input hooks for weight and progression fields
  const weightInput = useDecimalInput(exercise.weight, handleWeightChange);
  const progressionInput = useDecimalInput(exercise.progression, handleProgressionChange);
  const repRangeMinInput = useIntegerInput(exercise.repRangeMin, handleRepRangeMinChange);
  const repRangeMaxInput = useIntegerInput(exercise.repRangeMax, handleRepRangeMaxChange);
  const progressionThresholdInput = useIntegerInput(exercise.progressionThreshold, handleProgressionThresholdChange);

  return (
    <View className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
      <View className="flex-row items-center gap-2 mb-3">
        <View className="bg-blue-500 w-8 h-8 rounded-full items-center justify-center">
          <ThemedText className="text-white font-bold text-sm">
            {index + 1}
          </ThemedText>
        </View>
        <ThemedText className="font-bold text-lg flex-1">
          {formatExerciseDisplayName(exercise.name, exercise.variant)}
        </ThemedText>
        {showRemove && onRemove && (
          <View
            className="bg-red-500 w-8 h-8 rounded-full items-center justify-center"
            onTouchEnd={onRemove}
          >
            <ThemedText className="text-white font-bold text-sm">×</ThemedText>
          </View>
        )}
      </View>

      {/* Equipment and Muscles Dropdown */}
      <Collapsible title="Equipment & Muscles Worked">
        <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Equipment: {exercise.equipment || 'None'}
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

      {hasVariantOptions && (
        <Collapsible title="Variants">
          <View className="mt-2 gap-2">
            {variantOptions.map((option) => {
              const selected = isVariantOptionSelected(exercise.variant, option);
              return (
                <Pressable
                  key={getVariantOptionKey(option)}
                  onPress={() => handleVariantToggle(option)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Toggle ${getVariantOptionLabel(option)} variant`}
                >
                  {({ pressed }) => (
                    <View
                      className={`p-3 rounded-xl border flex-row items-center justify-between ${
                        selected
                          ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                      }`}
                      style={pressed && !selected ? { opacity: 0.85 } : undefined}
                    >
                      <View className="flex-1 pr-3">
                        <ThemedText className="font-semibold text-sm">
                          {getVariantOptionLabel(option)}
                        </ThemedText>
                        {option.field && (
                          <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {VARIANT_FIELD_LABELS[option.field]}
                          </ThemedText>
                        )}
                      </View>
                      <View
                        className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                          selected
                            ? 'bg-blue-500 border-blue-600'
                            : 'bg-gray-50 dark:bg-gray-700 border-gray-400'
                        }`}
                      >
                        {selected && <ThemedText className="text-white text-xs font-bold">✓</ThemedText>}
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Collapsible>
      )}

      {/* Input Fields */}
      <View className="mt-3 gap-3">
        <ThemedView className="gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <ThemedText className="text-sm font-semibold">Customised Sets</ThemedText>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                Enable per-set logging for this exercise
              </ThemedText>
            </View>
            <Switch
              value={exercise.hasCustomisedSets}
              onValueChange={(value) => onUpdate('hasCustomisedSets', value)}
              accessibilityLabel="Toggle customised sets"
            />
          </View>
        </ThemedView>
        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Sets</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 3"
            placeholderTextColor="#999"
            value={exercise.sets?.toString() || ''}
            onChangeText={handleFieldChange('sets')}
            keyboardType="numeric"
            style={{ color: textColor }}
            accessibilityLabel="Number of sets"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Reps</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 8"
            placeholderTextColor="#999"
            value={exercise.reps?.toString() || ''}
            onChangeText={handleFieldChange('reps')}
            keyboardType="numeric"
            style={{ color: textColor }}
            accessibilityLabel="Number of reps"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Weight</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 60"
            placeholderTextColor="#999"
            value={weightInput.localValue}
            onFocus={weightInput.handleFocus}
            onChangeText={weightInput.handleChange}
            onBlur={weightInput.handleBlur}
            keyboardType="decimal-pad"
            style={{ color: textColor }}
            accessibilityLabel="Weight"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Rest Time (seconds)</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 90"
            placeholderTextColor="#999"
            value={exercise.restTime?.toString() || ''}
            onChangeText={handleFieldChange('restTime')}
            keyboardType="numeric"
            style={{ color: textColor }}
            accessibilityLabel="Rest time in seconds"
          />
        </ThemedView>

        <ThemedView className="gap-1">
          <ThemedText className="text-sm font-semibold">Progression (weight increase)</ThemedText>
          <TextInput
            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
            placeholder="e.g., 2.5"
            placeholderTextColor="#999"
            value={progressionInput.localValue}
            onFocus={progressionInput.handleFocus}
            onChangeText={progressionInput.handleChange}
            onBlur={progressionInput.handleBlur}
            keyboardType="decimal-pad"
            style={{ color: textColor }}
            accessibilityLabel="Weight progression"
          />
        </ThemedView>

        {/* Double Progression Settings */}
        <Collapsible title="Double Progression">
          <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Double progression automatically increases weight when you consistently hit the top of your rep range.
          </ThemedText>
          <View className="gap-3">
            <ThemedView className="gap-1">
              <ThemedText className="text-sm font-semibold">Rep Range Min</ThemedText>
              <TextInput
                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                placeholder="e.g., 8"
                placeholderTextColor="#999"
                value={repRangeMinInput.localValue}
                onFocus={repRangeMinInput.handleFocus}
                onChangeText={repRangeMinInput.handleChange}
                onBlur={repRangeMinInput.handleBlur}
                keyboardType="number-pad"
                style={{ color: textColor }}
                accessibilityLabel="Minimum reps for double progression"
              />
            </ThemedView>

            <ThemedView className="gap-1">
              <ThemedText className="text-sm font-semibold">Rep Range Max</ThemedText>
              <TextInput
                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                placeholder="e.g., 12"
                placeholderTextColor="#999"
                value={repRangeMaxInput.localValue}
                onFocus={repRangeMaxInput.handleFocus}
                onChangeText={repRangeMaxInput.handleChange}
                onBlur={repRangeMaxInput.handleBlur}
                keyboardType="number-pad"
                style={{ color: textColor }}
                accessibilityLabel="Maximum reps for double progression"
              />
            </ThemedView>

            <ThemedView className="gap-1">
              <ThemedText className="text-sm font-semibold">Progression Threshold</ThemedText>
              <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                Number of consecutive sessions hitting the rep range max before increasing weight
              </ThemedText>
              <TextInput
                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                placeholder="e.g., 2"
                placeholderTextColor="#999"
                value={progressionThresholdInput.localValue}
                onFocus={progressionThresholdInput.handleFocus}
                onChangeText={progressionThresholdInput.handleChange}
                onBlur={progressionThresholdInput.handleBlur}
                keyboardType="number-pad"
                style={{ color: textColor }}
                accessibilityLabel="Sessions required before weight increase"
              />
            </ThemedView>
          </View>
        </Collapsible>
      </View>
    </View>
  );
});

export default ExerciseConfigCard;
