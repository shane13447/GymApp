/**
 * Muscle Group Targets Modal
 * Allows users to customize target sets per muscle group
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { validatePositiveInteger } from '@/lib/validation';
import type { MuscleGroupTarget } from '@/types';

interface MuscleGroupTargetsModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (targets: MuscleGroupTarget[]) => void;
  initialTargets: MuscleGroupTarget[];
  globalTarget: number | null;
  muscleGroups: string[];
}

interface MuscleGroupInputState {
  value: string;
  error: string | null;
}

/**
 * Format muscle group name for display (capitalize first letter of each word)
 */
const formatMuscleGroupName = (name: string): string => {
  return name
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const MuscleGroupTargetsModal: React.FC<MuscleGroupTargetsModalProps> = ({
  visible,
  onClose,
  onSave,
  initialTargets,
  globalTarget,
  muscleGroups,
}) => {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';
  const backgroundColor = colorScheme === 'dark' ? '#1f2937' : '#ffffff';

  // State for all muscle group inputs
  const [inputs, setInputs] = useState<Record<string, MuscleGroupInputState>>({});

  // Initialize inputs when modal opens or initialTargets change
  useEffect(() => {
    if (visible) {
      const initialInputs: Record<string, MuscleGroupInputState> = {};
      
      muscleGroups.forEach((group) => {
        const existingTarget = initialTargets.find((t) => t.muscleGroup === group);
        initialInputs[group] = {
          value: existingTarget?.targetSets?.toString() || '',
          error: null,
        };
      });
      
      setInputs(initialInputs);
    }
  }, [visible, initialTargets, muscleGroups]);

  const handleInputChange = useCallback((muscleGroup: string, text: string) => {
    setInputs((prev) => ({
      ...prev,
      [muscleGroup]: {
        value: text,
        error: null,
      },
    }));
  }, []);

  const handleInputBlur = useCallback((muscleGroup: string) => {
    setInputs((prev) => {
      const input = prev[muscleGroup];
      if (!input) return prev;

      if (!input.value.trim()) {
        return { ...prev, [muscleGroup]: { value: '', error: null } };
      }

      const validation = validatePositiveInteger(input.value);

      if (!validation.isValid) {
        return { ...prev, [muscleGroup]: { ...input, error: validation.error } };
      }

      return {
        ...prev,
        [muscleGroup]: { value: validation.value?.toString() || '', error: null },
      };
    });
  }, []);

  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  const handleSave = useCallback(() => {
    const currentInputs = inputsRef.current;
    let hasErrors = false;
    const newInputs = { ...currentInputs };

    muscleGroups.forEach((group) => {
      const input = currentInputs[group];
      if (input?.value.trim()) {
        const validation = validatePositiveInteger(input.value);
        if (!validation.isValid) {
          newInputs[group] = {
            ...input,
            error: validation.error,
          };
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      setInputs(newInputs);
      return;
    }

    const targets: MuscleGroupTarget[] = [];

    muscleGroups.forEach((group) => {
      const input = currentInputs[group];
      if (input?.value.trim()) {
        const num = parseInt(input.value, 10);
        if (!isNaN(num) && num > 0) {
          targets.push({
            muscleGroup: group,
            targetSets: num,
          });
        }
      }
    });

    onSave(targets);
  }, [muscleGroups, onSave]);

  const handleClearAll = useCallback(() => {
    const clearedInputs: Record<string, MuscleGroupInputState> = {};
    muscleGroups.forEach((group) => {
      clearedInputs[group] = { value: '', error: null };
    });
    setInputs(clearedInputs);
  }, [muscleGroups]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaContextView
        className="flex-1"
        style={{ backgroundColor }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <Pressable onPress={onClose} accessibilityRole="button">
            <ThemedText className="text-blue-500 text-base">Cancel</ThemedText>
          </Pressable>
          <ThemedText className="text-lg font-bold">Muscle Group Targets</ThemedText>
          <Pressable onPress={handleSave} accessibilityRole="button">
            <ThemedText className="text-blue-500 text-base font-semibold">Save</ThemedText>
          </Pressable>
        </View>

        {/* Description */}
        <View className="p-4 bg-gray-100 dark:bg-gray-800">
          <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
            Set custom target sets per week for each muscle group. Leave empty to use the global
            default{globalTarget ? ` (${globalTarget} sets)` : ''}.
          </ThemedText>
        </View>

        {/* Clear All Button */}
        <View className="px-4 py-2 flex-row justify-end">
          <Pressable onPress={handleClearAll} accessibilityRole="button">
            <ThemedText className="text-red-500 text-sm">Clear All Overrides</ThemedText>
          </Pressable>
        </View>

        {/* Muscle Group List */}
        <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
          {muscleGroups.map((group) => {
            const input = inputs[group] || { value: '', error: null };
            const hasCustomValue = input.value.trim() !== '';

            return (
              <View
                key={group}
                className="flex-row items-center py-3 border-b border-gray-200 dark:border-gray-700"
              >
                <View className="flex-1">
                  <ThemedText className="font-medium">
                    {formatMuscleGroupName(group)}
                  </ThemedText>
                  {input.error && (
                    <ThemedText className="text-xs text-red-500">{input.error}</ThemedText>
                  )}
                </View>
                <View className="w-24">
                  <TextInput
                    className={`bg-white dark:bg-gray-700 border rounded-lg px-3 py-2 text-center ${
                      input.error
                        ? 'border-red-500'
                        : hasCustomValue
                          ? 'border-blue-500'
                          : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder={globalTarget?.toString() || '–'}
                    placeholderTextColor="#999"
                    value={input.value}
                    onChangeText={(text) => handleInputChange(group, text)}
                    onBlur={() => handleInputBlur(group)}
                    keyboardType="number-pad"
                    style={{ color: textColor }}
                    accessibilityLabel={`Target sets for ${formatMuscleGroupName(group)}`}
                  />
                </View>
              </View>
            );
          })}
          
          {/* Bottom padding */}
          <View className="h-10" />
        </ScrollView>
      </SafeAreaContextView>
    </Modal>
  );
};

export default MuscleGroupTargetsModal;
