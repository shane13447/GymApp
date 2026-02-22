/**
 * Exercise Selector Component
 * Hierarchical exercise selection: Compound/Isolation → Muscle Group → (Sub-group) → Exercises
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import type { Exercise, ProgramExercise } from '@/types';
import {
  EXERCISE_DEFAULTS,
  COMPOUND_CATEGORIES,
  ISOLATION_CATEGORIES,
  ISOLATION_SUBCATEGORIES,
  MUSCLE_GROUP_MAPPING,
  SUBCATEGORY_TO_MUSCLE,
  type BroadMuscleCategory,
} from '@/constants';

interface ExerciseSelectorProps {
  exercises: Exercise[];
  selectedExercises: ProgramExercise[];
  onToggleExercise: (exercise: Exercise) => void;
}

/**
 * Individual exercise item with selection state
 */
const ExerciseItem = memo(function ExerciseItem({
  exercise,
  isSelected,
  onToggle,
}: {
  exercise: Exercise;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={exercise.name}
    >
      {({ pressed }) => (
        <View
          className={`p-3 rounded-lg border-2 ${
            isSelected
              ? 'bg-blue-100 dark:bg-blue-900 border-blue-500'
              : pressed
              ? 'bg-gray-100 dark:bg-gray-700 border-gray-400'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
          }`}
          style={pressed && !isSelected ? { opacity: 0.8 } : {}}
        >
          <View className="flex-row items-center justify-between">
            <ThemedText className="font-bold text-base flex-1" numberOfLines={1}>
              {exercise.name}
            </ThemedText>
            <View
              className={`ml-3 w-6 h-6 rounded-full border-2 items-center justify-center flex-shrink-0 ${
                isSelected
                  ? 'bg-blue-500 border-blue-600'
                  : 'border-gray-400 bg-gray-50 dark:bg-gray-700'
              }`}
            >
              {isSelected && (
                <ThemedText className="text-white text-xs font-bold">✓</ThemedText>
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
});

/**
 * Exercise list for a specific muscle group
 */
const ExerciseList = memo(function ExerciseList({
  exercises,
  selectedExercises,
  onToggleExercise,
}: {
  exercises: Exercise[];
  selectedExercises: ProgramExercise[];
  onToggleExercise: (exercise: Exercise) => void;
}) {
  const isSelected = useCallback(
    (exerciseName: string) => selectedExercises.some((e) => e.name === exerciseName),
    [selectedExercises]
  );

  if (exercises.length === 0) {
    return (
      <ThemedText className="text-gray-500 dark:text-gray-400 italic py-2">
        No exercises available
      </ThemedText>
    );
  }

  return (
    <View className="gap-2">
      {exercises.map((exercise) => (
        <ExerciseItem
          key={exercise.name}
          exercise={exercise}
          isSelected={isSelected(exercise.name)}
          onToggle={() => onToggleExercise(exercise)}
        />
      ))}
    </View>
  );
});

/**
 * Sub-category collapsible (e.g., Lats, Traps under Back)
 */
const SubCategorySection = memo(function SubCategorySection({
  subCategory,
  exercises,
  selectedExercises,
  onToggleExercise,
}: {
  subCategory: string;
  exercises: Exercise[];
  selectedExercises: ProgramExercise[];
  onToggleExercise: (exercise: Exercise) => void;
}) {
  const selectedCount = useMemo(
    () => exercises.filter((ex) => selectedExercises.some((sel) => sel.name === ex.name)).length,
    [exercises, selectedExercises]
  );

  return (
    <Collapsible
      title={`${subCategory} (${exercises.length})${selectedCount > 0 ? ` • ${selectedCount} selected` : ''}`}
    >
      <View className="mt-2">
        <ExerciseList
          exercises={exercises}
          selectedExercises={selectedExercises}
          onToggleExercise={onToggleExercise}
        />
      </View>
    </Collapsible>
  );
});

/**
 * Category section (e.g., Chest, Back, Legs)
 * Shows exercises directly if no sub-categories, otherwise shows sub-category collapsibles
 */
const CategorySection = memo(function CategorySection({
  category,
  exercises,
  selectedExercises,
  onToggleExercise,
  isCompound,
}: {
  category: BroadMuscleCategory;
  exercises: Exercise[];
  selectedExercises: ProgramExercise[];
  onToggleExercise: (exercise: Exercise) => void;
  isCompound: boolean;
}) {
  const subCategories = isCompound ? undefined : ISOLATION_SUBCATEGORIES[category];
  const muscleGroups = MUSCLE_GROUP_MAPPING[category];

  // Filter exercises for this category
  const categoryExercises = useMemo(() => {
    return exercises.filter((ex) => {
      // Must match the exercise type (compound/isolation)
      if (ex.isCompound !== isCompound) return false;
      // Must have at least one muscle group from this category
      return ex.muscle_groups_worked.some((mg) => muscleGroups.includes(mg));
    });
  }, [exercises, isCompound, muscleGroups]);

  // Group exercises by sub-category if applicable
  const exercisesBySubCategory = useMemo(() => {
    if (!subCategories) return null;

    const grouped: Record<string, Exercise[]> = {};
    subCategories.forEach((subCat) => {
      const muscleKey = SUBCATEGORY_TO_MUSCLE[subCat];
      grouped[subCat] = categoryExercises.filter((ex) =>
        ex.muscle_groups_worked.includes(muscleKey)
      );
    });
    return grouped;
  }, [categoryExercises, subCategories]);

  const selectedCount = useMemo(
    () => categoryExercises.filter((ex) => selectedExercises.some((sel) => sel.name === ex.name)).length,
    [categoryExercises, selectedExercises]
  );

  const hasSubCategories = subCategories && subCategories.length > 0;

  return (
    <ThemedView className="mb-1">
      <Collapsible
        title={`${category} (${categoryExercises.length})${selectedCount > 0 ? ` • ${selectedCount} selected` : ''}`}
      >
        <View className="mt-2 gap-2">
          {hasSubCategories && exercisesBySubCategory ? (
            // Show sub-categories
            subCategories.map((subCat) => (
              <SubCategorySection
                key={subCat}
                subCategory={subCat}
                exercises={exercisesBySubCategory[subCat]}
                selectedExercises={selectedExercises}
                onToggleExercise={onToggleExercise}
              />
            ))
          ) : (
            // Show exercises directly
            <ExerciseList
              exercises={categoryExercises}
              selectedExercises={selectedExercises}
              onToggleExercise={onToggleExercise}
            />
          )}
        </View>
      </Collapsible>
    </ThemedView>
  );
});

/**
 * Exercise type section (Compound or Isolation)
 */
const ExerciseTypeSection = memo(function ExerciseTypeSection({
  type,
  exercises,
  selectedExercises,
  onToggleExercise,
}: {
  type: 'compound' | 'isolation';
  exercises: Exercise[];
  selectedExercises: ProgramExercise[];
  onToggleExercise: (exercise: Exercise) => void;
}) {
  const isCompound = type === 'compound';
  const categories = isCompound ? COMPOUND_CATEGORIES : ISOLATION_CATEGORIES;
  const title = isCompound ? 'Compound' : 'Isolation';

  // Count total and selected exercises for this type
  const typeExercises = useMemo(
    () => exercises.filter((ex) => ex.isCompound === isCompound),
    [exercises, isCompound]
  );

  const selectedCount = useMemo(
    () => typeExercises.filter((ex) => selectedExercises.some((sel) => sel.name === ex.name)).length,
    [typeExercises, selectedExercises]
  );

  return (
    <ThemedView className="mb-2">
      <Collapsible
        title={`${title} (${typeExercises.length})${selectedCount > 0 ? ` • ${selectedCount} selected` : ''}`}
      >
        <View className="mt-2 gap-2">
          {categories.map((category) => (
            <CategorySection
              key={category}
              category={category}
              exercises={exercises}
              selectedExercises={selectedExercises}
              onToggleExercise={onToggleExercise}
              isCompound={isCompound}
            />
          ))}
        </View>
      </Collapsible>
    </ThemedView>
  );
});

export const ExerciseSelector = memo(function ExerciseSelector({
  exercises,
  selectedExercises,
  onToggleExercise,
}: ExerciseSelectorProps) {
  return (
    <ThemedView className="gap-3">
      <ThemedText className="text-base font-semibold">
        Select Exercises
      </ThemedText>
      <View className="gap-3">
        <ExerciseTypeSection
          type="compound"
          exercises={exercises}
          selectedExercises={selectedExercises}
          onToggleExercise={onToggleExercise}
        />
        <ExerciseTypeSection
          type="isolation"
          exercises={exercises}
          selectedExercises={selectedExercises}
          onToggleExercise={onToggleExercise}
        />
      </View>
    </ThemedView>
  );
});

/**
 * Create a ProgramExercise from a base Exercise with defaults
 */
export const createProgramExercise = (exercise: Exercise): ProgramExercise => ({
  ...exercise,
  weight: EXERCISE_DEFAULTS.weight,
  reps: EXERCISE_DEFAULTS.reps,
  sets: EXERCISE_DEFAULTS.sets,
  restTime: EXERCISE_DEFAULTS.restTime,
  progression: EXERCISE_DEFAULTS.progression,
  hasCustomisedSets: EXERCISE_DEFAULTS.hasCustomisedSets,
});

export default ExerciseSelector;
