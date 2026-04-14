/**
 * Programs Screen
 * Manage workout programs - create, view, edit, delete
 */

import React from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ExerciseConfigCard } from '@/components/programs/ExerciseConfigCard';
import { ExerciseSelector } from '@/components/programs/ExerciseSelector';
import { ProgramCard } from '@/components/programs/ProgramCard';
import { SelectedExercisesList } from '@/components/programs/SelectedExercisesList';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProgramsScreen } from '@/hooks/use-programs-screen';
import { formatExerciseDisplayName } from '@/lib/utils';
import {
  buildExerciseIdentity,
  commitCurrentDay,
} from '@/services/programs/clone';
import { CreateProgramStep, ProgramViewMode } from '@/types';

/**
 * Renders the Programs screen while delegating form state and persistence flows to useProgramsScreen.
 * The UI branches remain local here, but creation/editing behavior now lives in the extracted hook.
 */
export default function ProgramsScreen() {
  const colorScheme = useColorScheme();
  const textColor = colorScheme === 'dark' ? '#ffffff' : '#000000';
  const {
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
  } = useProgramsScreen();

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
                  <ThemedText className="text-lg font-semibold">&lt; Back</ThemedText>
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
                  Continue to Exercise Selection &gt;
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
                  <ThemedText className="text-lg font-semibold">&lt; Back</ThemedText>
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
                    <ThemedText className="text-center font-semibold">&lt; Previous Day</ThemedText>
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
                    <ThemedText className="text-center font-semibold">Next Day &gt;</ThemedText>
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
                const updatedDays = commitCurrentDay(workoutDays, currentDayIndex, selectedExercises);
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
                const updatedDays = commitCurrentDay(workoutDays, currentDayIndex, selectedExercises);
                const allDaysComplete = updatedDays.every((day) => day.exercises.length > 0);
                const isLastDay = currentDayIndex === workoutDays.length - 1;

                return (
                  <View
                    className="bg-green-500 rounded-full p-4"
                    style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                  >
                    <ThemedText className="text-white text-center font-semibold text-lg">
                      {allDaysComplete || isLastDay
                        ? 'Continue to Configuration >'
                        : `Continue to Day ${currentDayIndex + 2} >`}
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
                  <ThemedText className="text-lg font-semibold">&lt; Back</ThemedText>
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
              {workoutDays.length} day{workoutDays.length !== 1 ? 's' : ''} |{' '}
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
                    {isEditing ? 'Update Program' : 'Create Program'}
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
                  <ThemedText className="text-lg font-semibold">&lt; Back</ThemedText>
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
              {selectedProgram.workoutDays.length !== 1 ? 's' : ''} |{' '}
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
                    Current Program
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
              <Pressable onPress={() => handleDuplicateProgram(selectedProgram.id, selectedProgram.name)}>
                {({ pressed }) => (
                  <View
                    className="bg-blue-500 px-4 py-3 rounded-full"
                    style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
                  >
                    <ThemedText className="text-white text-center font-semibold">
                      Duplicate Program
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

        <Modal
          visible={duplicateModal.visible}
          transparent
          animationType="fade"
          onRequestClose={closeDuplicateModal}
        >
          <View className="flex-1 justify-center items-center bg-black/50 px-6">
            <View className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm">
              <ThemedText type="subtitle" className="mb-2">Duplicate Program</ThemedText>
              <ThemedText className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Enter the new program name:
              </ThemedText>
              <TextInput
                className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base mb-4"
                style={{ color: textColor }}
                value={duplicateModal.newName}
                onChangeText={updateDuplicateName}
                autoFocus
                selectTextOnFocus
              />
              <View className="flex-row gap-3">
                <Pressable
                  onPress={closeDuplicateModal}
                  className="flex-1 py-3 rounded-full items-center bg-gray-200 dark:bg-gray-600"
                  accessibilityRole="button"
                >
                  <ThemedText className="font-semibold">Cancel</ThemedText>
                </Pressable>
                <Pressable
                  onPress={confirmDuplicateProgram}
                  className="flex-1 py-3 rounded-full items-center bg-blue-500"
                  accessibilityRole="button"
                >
                  <ThemedText className="font-semibold text-white">Duplicate</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ParallaxScrollView>
    );
  }

  // Fallback: reset to list view if state machine reaches an unhandled combination
  return (
    <ThemedView className="flex-1 items-center justify-center p-6">
      <ThemedText className="text-lg font-semibold mb-2">Something went wrong</ThemedText>
      <ThemedText className="text-center text-gray-500 mb-4">
        The screen reached an unexpected state. Tap below to go back to the program list.
      </ThemedText>
      <Pressable
        onPress={() => {
          clearForm();
          setViewMode(ProgramViewMode.List);
        }}
        accessibilityRole="button"
        accessibilityLabel="Return to programs list"
        className="bg-blue-500 rounded-full py-3 px-6"
      >
        <ThemedText className="text-white font-semibold">Back to Programs</ThemedText>
      </Pressable>
    </ThemedView>
  );
}
