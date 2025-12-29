import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import type { Workout, WorkoutExercise } from './ActiveWorkout';

const WORKOUTS_STORAGE_KEY = 'gymApp_workouts';

interface WorkoutsByDate {
  [date: string]: Workout[];
}

export default function HistoryScreen() {
  const [workoutsByDate, setWorkoutsByDate] = useState<WorkoutsByDate>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWorkouts();
  }, []);

  const loadWorkouts = async () => {
    try {
      const stored = await AsyncStorage.getItem(WORKOUTS_STORAGE_KEY);
      if (stored) {
        const workouts: Workout[] = JSON.parse(stored);
        
        // Group workouts by date
        const grouped: WorkoutsByDate = {};
        workouts.forEach((workout) => {
          const workoutDate = new Date(workout.date);
          const dateKey = workoutDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          
          if (!grouped[dateKey]) {
            grouped[dateKey] = [];
          }
          grouped[dateKey].push(workout);
        });

        // Sort dates in descending order (most recent first)
        const sortedDates = Object.keys(grouped).sort((a, b) => {
          return new Date(b).getTime() - new Date(a).getTime();
        });

        const sortedGrouped: WorkoutsByDate = {};
        sortedDates.forEach((date) => {
          sortedGrouped[date] = grouped[date].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
        });

        setWorkoutsByDate(sortedGrouped);
      }
    } catch (error) {
      console.error('Error loading workouts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <ParallaxScrollView>
        <ThemedView style={styles.container}>
          <ThemedText type="title">History</ThemedText>
          <ThemedText className="mt-4">Loading workouts...</ThemedText>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  const dateKeys = Object.keys(workoutsByDate);

  if (dateKeys.length === 0) {
    return (
      <ParallaxScrollView>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.titleContainer}>
            <ThemedText type="title">History</ThemedText>
          </ThemedView>
          <ThemedView className="mt-8 items-center">
            <ThemedText className="text-gray-500 text-center">
              No workouts logged yet. Start a workout to see your history here!
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">History</ThemedText>
        </ThemedView>

        <ThemedView className="mt-5 gap-4">
          <ScrollView showsVerticalScrollIndicator={true}>
            {dateKeys.map((dateKey) => {
              const workouts = workoutsByDate[dateKey];
              const totalWorkouts = workouts.length;

              return (
                <ThemedView key={dateKey} className="mb-4">
                  <Collapsible
                    title={
                      <View className="flex-row items-center justify-between w-full pr-4">
                        <ThemedText className="font-semibold text-lg">{dateKey}</ThemedText>
                        <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                          {totalWorkouts} workout{totalWorkouts !== 1 ? 's' : ''}
                        </ThemedText>
                      </View>
                    }
                  >
                    <ThemedView className="mt-3 gap-3">
                      {workouts.map((workout) => (
                        <View
                          key={workout.id}
                          className="mb-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600"
                        >
                          {/* Workout Header */}
                          <View className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                            <View className="flex-row items-center justify-between mb-2">
                              <ThemedText className="font-bold text-lg">
                                {workout.programName}
                              </ThemedText>
                              {workout.completed && (
                                <View className="bg-green-500 px-2 py-1 rounded">
                                  <ThemedText className="text-white text-xs font-semibold">
                                    ✓ Completed
                                  </ThemedText>
                                </View>
                              )}
                            </View>
                            <View className="flex-row gap-4">
                              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                                Day {workout.dayNumber}
                              </ThemedText>
                              <ThemedText className="text-sm text-gray-600 dark:text-gray-400">
                                {formatTime(workout.date)}
                              </ThemedText>
                            </View>
                          </View>

                          {/* Exercises */}
                          <ThemedView className="gap-3">
                            <ThemedText className="font-semibold text-base">
                              Exercises ({workout.exercises.length})
                            </ThemedText>
                            {workout.exercises.map((exercise, index) => (
                              <View
                                key={exercise.name}
                                className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                              >
                                <View className="flex-row items-center gap-2 mb-2">
                                  <View className="bg-blue-500 w-6 h-6 rounded-full items-center justify-center">
                                    <ThemedText className="text-white font-bold text-xs">
                                      {index + 1}
                                    </ThemedText>
                                  </View>
                                  <ThemedText className="font-semibold text-base flex-1">
                                    {exercise.name}
                                  </ThemedText>
                                </View>

                                {/* Logged Values */}
                                <View className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                  <View className="flex-row flex-wrap gap-4">
                                    {exercise.loggedWeight && (
                                      <View>
                                        <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                                          Weight
                                        </ThemedText>
                                        <ThemedText className="text-base font-semibold">
                                          {exercise.loggedWeight}
                                        </ThemedText>
                                      </View>
                                    )}
                                    {exercise.loggedReps && (
                                      <View>
                                        <ThemedText className="text-xs text-gray-500 dark:text-gray-400">
                                          Reps
                                        </ThemedText>
                                        <ThemedText className="text-base font-semibold">
                                          {exercise.loggedReps}
                                        </ThemedText>
                                      </View>
                                    )}
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
                                  </View>
                                </View>
                              </View>
                            ))}
                          </ThemedView>
                        </View>
                      ))}
                    </ThemedView>
                  </Collapsible>
                </ThemedView>
              );
            })}
          </ScrollView>
        </ThemedView>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});