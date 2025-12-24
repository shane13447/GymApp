import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import exercisesData from '@/data/exerciseSelection.json';

// Base exercise interface from JSON file
export interface Exercise {
  name: string;
  equipment: string;
  muscle_groups_worked: string[];
}

// Exercise with program-specific data
export interface ProgramExercise extends Exercise {
  weight: string;
  reps: string;
  sets: string;
  restTime: string;
  progression: string;
}

// Program interface
export interface Program {
  id: string;
  name: string;
  exercises: ProgramExercise[];
  createdAt: string;
}

type ViewMode = 'list' | 'create' | 'view';

export default function ProgramsScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [programName, setProgramName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<ProgramExercise[]>([]);
  const [showExerciseList, setShowExerciseList] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);

  // Load exercises from JSON file
  useEffect(() => {
    try {
      const loadedExercises: Exercise[] = exercisesData.map((ex: any) => ({
        name: ex.name,
        equipment: ex.equipment,
        muscle_groups_worked: ex.muscle_groups_worked,
      }));
      setExercises(loadedExercises);
    } catch (error) {
      console.error('Error loading exercises:', error);
    }
  }, []);

  const toggleExercise = (exercise: Exercise) => {
    setSelectedExercises((prev) => {
      const isSelected = prev.some((e) => e.name === exercise.name);
      if (isSelected) {
        return prev.filter((e) => e.name !== exercise.name);
      } else {
        // Add exercise with empty program fields
        const programExercise: ProgramExercise = {
          ...exercise,
          weight: '',
          reps: '',
          sets: '',
          restTime: '',
          progression: '',
        };
        return [...prev, programExercise];
      }
    });
  };

  const isExerciseSelected = (exerciseName: string) => {
    return selectedExercises.some((e) => e.name === exerciseName);
  };

  const updateExerciseField = (
    exerciseName: string,
    field: keyof ProgramExercise,
    value: string
  ) => {
    setSelectedExercises((prev) =>
      prev.map((ex) =>
        ex.name === exerciseName ? { ...ex, [field]: value } : ex
      )
    );
  };

  const removeExerciseFromProgram = (exerciseName: string) => {
    setSelectedExercises((prev) => prev.filter((e) => e.name !== exerciseName));
  };

  const clearProgram = () => {
    setProgramName('');
    setSelectedExercises([]);
    setShowExerciseList(false);
    setCreateStep(1);
  };

  const continueToConfiguration = () => {
    if (!programName.trim()) {
      alert('Please enter a program name');
      return;
    }

    if (selectedExercises.length === 0) {
      alert('Please select at least one exercise');
      return;
    }

    setCreateStep(2);
  };

  const createProgram = () => {
    if (!programName.trim()) {
      alert('Please enter a program name');
      return;
    }

    if (selectedExercises.length === 0) {
      alert('Please select at least one exercise');
      return;
    }

    const newProgram: Program = {
      id: Date.now().toString(),
      name: programName.trim(),
      exercises: selectedExercises,
      createdAt: new Date().toISOString(),
    };

    setPrograms((prev) => [newProgram, ...prev]);
    clearProgram();
    setViewMode('list');
    // Here you would typically save to AsyncStorage or database
    console.log('Program created:', JSON.stringify(newProgram, null, 2));
  };

  const deleteProgram = (programId: string) => {
    setPrograms((prev) => prev.filter((p) => p.id !== programId));
    if (selectedProgramId === programId) {
      setViewMode('list');
      setSelectedProgramId(null);
    }
  };

  const viewProgram = (programId: string) => {
    setSelectedProgramId(programId);
    setViewMode('view');
  };

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);

  // Main List View
  if (viewMode === 'list') {
  return (
    <ParallaxScrollView>
      <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Programs</ThemedText>
        <HelloWave />
      </ThemedView>
      
        <ThemedView className="mt-5 gap-4">
          {/* Create New Program Button */}
          <Pressable
            onPress={() => {
              clearProgram();
              setViewMode('create');
            }}
          >
            {({ pressed }) => (
              <View
                className="bg-blue-500 rounded-lg p-4 border-2 border-white"
                style={pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }}
              >
                <ThemedText className="text-white text-center font-semibold text-lg">
                  + Create New Program
                </ThemedText>
              </View>
            )}
          </Pressable>

          {/* Programs List */}
          {programs.length > 0 ? (
            <ThemedView className="gap-3">
              <ThemedText type="subtitle" className="text-lg font-semibold">
                Your Programs ({programs.length})
              </ThemedText>
              <ScrollView showsVerticalScrollIndicator={true}>
                {programs.map((program) => (
                  <Pressable 
                    key={program.id}
                    onPress={() => viewProgram(program.id)}
                  >
                    {({ pressed }) => (
                      <View
                        className={`mb-3 p-4 rounded-lg border-2 ${
                          pressed
                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400'
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                        }`}
                        style={pressed ? { opacity: 0.9 } : {}}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1">
                            <ThemedText className="font-bold text-xl mb-1">
                              {program.name}
                            </ThemedText>
                            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                              {program.exercises.length} exercise{program.exercises.length !== 1 ? 's' : ''}
                            </ThemedText>
                          </View>
                          <View className="ml-3 bg-blue-500 rounded-full w-8 h-8 items-center justify-center">
                            <ThemedText className="text-white text-lg font-bold">›</ThemedText>
                          </View>
                        </View>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </ThemedView>
          ) : (
            <ThemedView className="items-center py-8">
              <ThemedText className="text-gray-500 text-center">
                No programs created yet. Tap "Create New Program" to get started!
              </ThemedText>
            </ThemedView>
          )}
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  // Create Program View
  if (viewMode === 'create') {
    // Step 1: Exercise Selection and Program Name
    if (createStep === 1) {
      return (
        <ParallaxScrollView>
        <ThemedView style={styles.titleContainer}>
          <View className="flex-row items-center gap-4">
            <Pressable onPress={() => {
              clearProgram();
              setViewMode('list');
            }}>
              {({ pressed }) => (
                <View
                  className="px-3 py-1 rounded-lg"
                  style={pressed && { backgroundColor: 'rgba(0,0,0,0.1)', opacity: 0.7 }}
                >
                  <ThemedText className="text-lg font-semibold">‹ Back</ThemedText>
                </View>
              )}
            </Pressable>
            <ThemedText type="title">Create Program</ThemedText>
          </View>
        </ThemedView>

          <ThemedView className="mt-5 gap-4">
            {/* Program Name Input */}
            <ThemedView className="gap-2">
              <ThemedText className="text-base font-semibold">
                Program Name
              </ThemedText>
              <TextInput
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base"
                placeholder="Enter program name..."
                placeholderTextColor="#999"
                value={programName}
                onChangeText={setProgramName}
              />
            </ThemedView>

            {/* Add Exercises Button */}
            <Pressable
              onPress={() => setShowExerciseList(!showExerciseList)}
            >
              {({ pressed }) => (
                <View
                  className={`rounded-lg p-4 border-2 border-white ${
                    showExerciseList ? 'bg-blue-600' : 'bg-blue-500'
                  }`}
                  style={[
                    pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <ThemedText className="text-white text-center font-semibold text-lg">
                    {showExerciseList ? 'Hide Exercise List' : 'Select Exercises'}
                  </ThemedText>
                </View>
              )}
            </Pressable>

            {/* Exercise Selection List */}
            {showExerciseList && (
              <ThemedView className="gap-3">
                <ThemedText className="text-base font-semibold">
                  Select Exercises
                </ThemedText>
                <ScrollView className="max-h-96" showsVerticalScrollIndicator={true}>
                  {exercises.map((exercise) => {
                    const isSelected = isExerciseSelected(exercise.name);
                    return (
                      <Pressable
                        key={exercise.name}
                        onPress={() => toggleExercise(exercise)}
                      >
                        {({ pressed }) => (
                          <View
                            className={`mb-2 p-4 rounded-lg border-2 ${
                              isSelected
                                ? 'bg-blue-100 dark:bg-blue-900 border-blue-500'
                                : pressed
                                ? 'bg-gray-100 dark:bg-gray-700 border-gray-400'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                            }`}
                            style={pressed && !isSelected ? { opacity: 0.8 } : {}}
                          >
                            <View className="flex-row items-center justify-between">
                              <ThemedText 
                                className="font-bold text-lg flex-1"
                                numberOfLines={1}
                              >
                                {exercise.name}
                              </ThemedText>
                              <View
                                className={`ml-3 w-7 h-7 rounded-full border-2 items-center justify-center flex-shrink-0 ${
                                  isSelected
                                    ? 'bg-blue-500 border-blue-600'
                                    : 'border-gray-400 bg-gray-50 dark:bg-gray-700'
                                }`}
                              >
                                {isSelected && (
                                  <ThemedText className="text-white text-sm font-bold">
                                    ✓
                                  </ThemedText>
                                )}
                              </View>
                            </View>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </ThemedView>
            )}

            {/* Selected Exercises Summary */}
            {selectedExercises.length > 0 && (
              <ThemedView className="gap-3">
                <ThemedText className="text-base font-semibold">
                  Selected Exercises ({selectedExercises.length})
                </ThemedText>
                <ScrollView className="max-h-48" showsVerticalScrollIndicator={true}>
                  {selectedExercises.map((exercise, index) => (
                    <View
                      key={exercise.name}
                      className="mb-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600"
                    >
                      <View className="flex-row items-center gap-2">
                        <View className="bg-blue-500 w-6 h-6 rounded-full items-center justify-center">
                          <ThemedText className="text-white font-bold text-xs">
                            {index + 1}
                          </ThemedText>
                        </View>
                        <ThemedText className="font-semibold text-base flex-1">
                          {exercise.name}
                        </ThemedText>
                        <Pressable
                          onPress={() => removeExerciseFromProgram(exercise.name)}
                          className="bg-red-500 w-6 h-6 rounded-full items-center justify-center border-2 border-white"
                        >
                          <ThemedText className="text-white font-bold text-xs">×</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </ThemedView>
            )}

            {/* Continue Button */}
            {selectedExercises.length > 0 && (
              <Pressable
                onPress={continueToConfiguration}
              >
                {({ pressed }) => (
                  <View
                    className="bg-green-500 rounded-lg p-4 border-2 border-white"
                    style={[
                      { marginTop: 16 },
                      pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <ThemedText className="text-white text-center font-semibold text-lg">
                      Continue to Configuration →
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            )}
          </ThemedView>
        </ParallaxScrollView>
      );
    }

    // Step 2: Exercise Configuration
    return (
      <ParallaxScrollView>
        <ThemedView style={styles.titleContainer}>
          <View className="flex-row items-center gap-4">
            <Pressable onPress={() => setCreateStep(1)}>
              {({ pressed }) => (
                <View
                  className="px-3 py-1 rounded-lg"
                  style={pressed && { backgroundColor: 'rgba(0,0,0,0.1)', opacity: 0.7 }}
                >
                  <ThemedText className="text-lg font-semibold">‹ Back</ThemedText>
                </View>
              )}
            </Pressable>
            <ThemedText type="title">Configure Exercises</ThemedText>
          </View>
        </ThemedView>

        <ThemedView className="mt-5 gap-4">
          <ThemedView className="gap-2 mb-4">
            <ThemedText className="text-lg font-semibold">
              {programName}
            </ThemedText>
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
              {selectedExercises.length} exercise{selectedExercises.length !== 1 ? 's' : ''}
            </ThemedText>
          </ThemedView>

          <ScrollView showsVerticalScrollIndicator={true}>
            {selectedExercises.map((exercise, index) => (
              <View
                key={`${exercise.name}-${index}`}
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

                {/* Equipment and Muscles Dropdown */}
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
                        <ThemedText className="text-xs capitalize">
                          {group}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </Collapsible>

                {/* Input Fields */}
                <View className="mt-3 gap-3">
                  <ThemedView className="gap-1">
                    <ThemedText className="text-sm font-semibold">Sets</ThemedText>
                    <TextInput
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                      placeholder="e.g., 3"
                      placeholderTextColor="#999"
                      value={exercise.sets}
                      onChangeText={(value) =>
                        updateExerciseField(exercise.name, 'sets', value)
                      }
                      keyboardType="numeric"
                    />
                  </ThemedView>

                  <ThemedView className="gap-1">
                    <ThemedText className="text-sm font-semibold">Reps</ThemedText>
                    <TextInput
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                      placeholder="e.g., 8-10"
                      placeholderTextColor="#999"
                      value={exercise.reps}
                      onChangeText={(value) =>
                        updateExerciseField(exercise.name, 'reps', value)
                      }
                    />
                  </ThemedView>

                  <ThemedView className="gap-1">
                    <ThemedText className="text-sm font-semibold">Weight</ThemedText>
                    <TextInput
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                      placeholder="e.g., 135 lbs or RPE 8"
                      placeholderTextColor="#999"
                      value={exercise.weight}
                      onChangeText={(value) =>
                        updateExerciseField(exercise.name, 'weight', value)
                      }
                    />
                  </ThemedView>

                  <ThemedView className="gap-1">
                    <ThemedText className="text-sm font-semibold">Rest Time</ThemedText>
                    <TextInput
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                      placeholder="e.g., 90 seconds"
                      placeholderTextColor="#999"
                      value={exercise.restTime}
                      onChangeText={(value) =>
                        updateExerciseField(exercise.name, 'restTime', value)
                      }
                    />
                  </ThemedView>

                  <ThemedView className="gap-1">
                    <ThemedText className="text-sm font-semibold">Progression</ThemedText>
                    <TextInput
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-base"
                      placeholder="e.g., +5lbs/week"
                      placeholderTextColor="#999"
                      value={exercise.progression}
                      onChangeText={(value) =>
                        updateExerciseField(exercise.name, 'progression', value)
                      }
                    />
                  </ThemedView>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Create Program Button - At bottom */}
          <Pressable
            onPress={createProgram}
          >
            {({ pressed }) => (
              <View
                className="bg-green-500 rounded-lg p-4 border-2 border-white"
                style={[
                  { marginTop: 16 },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
              >
                <ThemedText className="text-white text-center font-semibold text-lg">
                  ✓ Create Program
                </ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  // View Program Details
  if (viewMode === 'view' && selectedProgram) {
    return (
      <ParallaxScrollView>
        <ThemedView style={styles.titleContainer}>
          <View className="flex-row items-center gap-4">
            <Pressable onPress={() => setViewMode('list')}>
              {({ pressed }) => (
                <View
                  className="px-3 py-1 rounded-lg"
                  style={pressed && { backgroundColor: 'rgba(0,0,0,0.1)', opacity: 0.7 }}
                >
                  <ThemedText className="text-lg font-semibold">‹ Back</ThemedText>
                </View>
              )}
            </Pressable>
            <ThemedText type="title">{selectedProgram.name}</ThemedText>
          </View>
        </ThemedView>

        <ThemedView className="mt-5 gap-4">
          <View className="flex-row items-center justify-between mb-4">
            <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
              {selectedProgram.exercises.length} exercise{selectedProgram.exercises.length !== 1 ? 's' : ''}
            </ThemedText>
            <Pressable
              onPress={() => deleteProgram(selectedProgram.id)}
            >
              {({ pressed }) => (
                <View
                  className="bg-red-500 px-4 py-2 rounded-lg border-2 border-white"
                  style={pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }}
                >
                  <ThemedText className="text-white text-sm font-semibold">
                    Delete Program
                  </ThemedText>
                </View>
              )}
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={true}>
            {selectedProgram.exercises.map((exercise, index) => (
              <View
                key={exercise.name}
                className="mb-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600"
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

                <Collapsible title="Equipment & Muscles">
                  <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Equipment: {exercise.equipment}
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-1">
                    {exercise.muscle_groups_worked.map((group) => (
                      <View
                        key={group}
                        className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded"
                      >
                        <ThemedText className="text-xs capitalize">
                          {group}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </Collapsible>

                {(exercise.sets || exercise.reps || exercise.weight || exercise.restTime || exercise.progression) && (
                  <View className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <View className="flex-row flex-wrap gap-3">
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
                            Reps
                          </ThemedText>
                          <ThemedText className="text-base font-semibold">
                            {exercise.reps}
                          </ThemedText>
                        </View>
                      )}
                      {exercise.weight && (
                        <View>
                          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                            Weight
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
                      {exercise.progression && (
                        <View>
                          <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                            Progression
                          </ThemedText>
                          <ThemedText className="text-base font-semibold">
                            {exercise.progression}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
      </ThemedView>
    </ParallaxScrollView>
  );
  }

  // Fallback (should not reach here)
  return null;
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
