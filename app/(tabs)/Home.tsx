/**
 * Home Screen
 * Dashboard with quick actions and workout summary
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHomeData } from '@/hooks/use-home-data';
import { formatRelativeDate, getMuscleGroupSummary } from '@/lib/home-stats';

type RingVariant = 'primary' | 'secondary' | 'indigo';

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  theme: 'light' | 'dark';
  shimmer: Animated.Value;
};

const getPressedRingStyle = (pressed: boolean, variant: RingVariant) => {
  const ringColor =
    variant === 'secondary' ? '#FFCA70' : variant === 'indigo' ? '#9480E6' : '#4DA2FF';

  return {
    borderWidth: 2,
    borderColor: pressed ? ringColor : 'transparent',
    shadowColor: ringColor,
    shadowOpacity: pressed ? 0.35 : 0,
    shadowRadius: pressed ? 10 : 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: pressed ? 2 : 0,
  };
};

function SkeletonBlock({ width = '100%', height, radius = 14, theme, shimmer }: SkeletonBlockProps) {
  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 140],
  });

  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: theme === 'dark' ? '#1B2430' : '#E7EDF5',
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            width: 120,
            backgroundColor: theme === 'dark' ? '#2A3543' : '#F5F9FF',
            opacity: 0.45,
            transform: [{ translateX: shimmerTranslate }],
          },
        ]}
      />
    </View>
  );
}

function HomeLoadingSkeleton({ theme }: { theme: 'light' | 'dark' }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1050,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
      shimmer.stopAnimation();
      shimmer.setValue(0);
    };
  }, [shimmer]);

  return (
    <ParallaxScrollView>
      <ThemedView
        lightColor="#FFFFFF"
        darkColor="#10151D"
        className="rounded-3xl border px-5 py-5 mb-5"
        style={{ borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8' }}
      >
        <View className="gap-3 mb-4">
          <SkeletonBlock width="52%" height={26} radius={10} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="78%" height={14} radius={8} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="64%" height={14} radius={8} theme={theme} shimmer={shimmer} />
        </View>
        <View className="gap-2 mb-4">
          <SkeletonBlock width="92%" height={12} radius={7} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="74%" height={12} radius={7} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="80%" height={12} radius={7} theme={theme} shimmer={shimmer} />
        </View>
        <SkeletonBlock width="100%" height={52} radius={999} theme={theme} shimmer={shimmer} />
      </ThemedView>

      <ThemedView
        lightColor="#FFFFFF"
        darkColor="#10151D"
        className="rounded-3xl border px-5 py-5 mb-5"
        style={{ borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8' }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <SkeletonBlock width="42%" height={12} radius={999} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width={56} height={24} radius={999} theme={theme} shimmer={shimmer} />
        </View>
        <View className="flex-row items-center justify-between">
          <SkeletonBlock width="28%" height={58} radius={12} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="28%" height={58} radius={12} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="28%" height={58} radius={12} theme={theme} shimmer={shimmer} />
        </View>
      </ThemedView>

      <ThemedView
        lightColor="#FFFFFF"
        darkColor="#10151D"
        className="rounded-3xl border px-5 py-5 mb-5"
        style={{ borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8' }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <SkeletonBlock width="34%" height={22} radius={9} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width={72} height={24} radius={999} theme={theme} shimmer={shimmer} />
        </View>
        <View className="gap-2.5">
          <SkeletonBlock width="100%" height={44} radius={12} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="100%" height={44} radius={12} theme={theme} shimmer={shimmer} />
          <SkeletonBlock width="100%" height={44} radius={12} theme={theme} shimmer={shimmer} />
        </View>
      </ThemedView>

      <ThemedView
        lightColor="#FFFFFF"
        darkColor="#10151D"
        className="rounded-3xl border px-5 py-5 mb-2"
        style={{ borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8' }}
      >
        <SkeletonBlock width="26%" height={22} radius={9} theme={theme} shimmer={shimmer} />
        <View className="mt-4">
          <SkeletonBlock width="100%" height={58} radius={14} theme={theme} shimmer={shimmer} />
        </View>
      </ThemedView>
    </ParallaxScrollView>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';

  const {
    loadState,
    isRefreshing,
    loadError,
    currentProgram,
    nextWorkout,
    recentWorkouts,
    stats,
    handleRefresh,
    retry,
  } = useHomeData();

  if (loadState === 'initial_loading') {
    return <HomeLoadingSkeleton theme={theme} />;
  }

  if (loadState === 'failed') {
    return (
      <ParallaxScrollView
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        <ThemedView
          lightColor="#FFFFFF"
          darkColor="#10151D"
          className="rounded-3xl border px-5 py-5 mb-5"
          style={{ borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8' }}
        >
          <ThemedText className="text-2xl font-bold">Dashboard unavailable</ThemedText>
          <ThemedText className="text-sm mt-2 text-gray-600 dark:text-gray-400">
            {loadError ?? 'Unable to load dashboard data right now.'}
          </ThemedText>

          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Retry dashboard load"
            className="mt-4"
          >
            {({ pressed }) => (
              <View
                className="rounded-full py-4 px-5"
                style={{
                  backgroundColor: '#007AFF',
                  opacity: pressed ? 0.92 : 1,
                  ...(pressed ? { transform: [{ scale: 0.99 }] } : {}),
                }}
              >
                <ThemedText className="text-center text-white font-semibold text-base">
                  Retry
                </ThemedText>
              </View>
            )}
          </Pressable>
        </ThemedView>
      </ParallaxScrollView>
    );
  }

  return (
    <ParallaxScrollView
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <ThemedView
        lightColor="#FFFFFF"
        darkColor="#10151D"
        className="rounded-3xl border px-5 py-5 mb-5"
        style={{
          borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8',
        }}
      >
        {nextWorkout ? (
          <>
            <ThemedText className="text-2xl font-bold">Day {nextWorkout.dayNumber} - {nextWorkout.programName}</ThemedText>
            <ThemedText className="text-sm mt-1 text-gray-600 dark:text-gray-400 capitalize">
              {nextWorkout.exercises.length} exercises - {getMuscleGroupSummary(nextWorkout)}
            </ThemedText>

            <View className="mt-4 gap-1.5">
              {nextWorkout.exercises.slice(0, 4).map((exercise, index) => (
                <ThemedText
                  key={`${exercise.name}-${index}`}
                  className="text-sm"
                  style={{ color: theme === 'dark' ? '#C3CAD3' : '#3A4656' }}
                >
                  - {exercise.name}
                </ThemedText>
              ))}
              {nextWorkout.exercises.length > 4 && (
                <ThemedText className="text-sm" style={{ color: '#7A8798' }}>
                  +{nextWorkout.exercises.length - 4} more exercises
                </ThemedText>
              )}
            </View>

            <Pressable
              onPress={() => router.push('/(tabs)/ActiveWorkout')}
              accessibilityRole="button"
              accessibilityLabel="Start active workout"
              className="mt-4"
            >
              {({ pressed }) => (
                <View
                  className="rounded-full py-4 px-5"
                  style={{
                    backgroundColor: '#007AFF',
                    opacity: pressed ? 0.92 : 1,
                    ...(pressed ? { transform: [{ scale: 0.99 }] } : {}),
                    ...getPressedRingStyle(pressed, 'primary'),
                  }}
                >
                  <ThemedText className="text-center text-white font-semibold text-base">
                    Start Workout
                  </ThemedText>
                </View>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <ThemedText className="text-2xl font-bold">No workout queued</ThemedText>
            <ThemedText className="text-sm mt-1 text-gray-600 dark:text-gray-400">
              Build your first program to generate a workout queue and start training.
            </ThemedText>

            <Pressable
              onPress={() => router.push('/(tabs)/Programs')}
              accessibilityRole="button"
              accessibilityLabel="Create your first program"
              className="mt-4"
            >
              {({ pressed }) => (
                <View
                  className="rounded-full py-4 px-5"
                  style={{
                    backgroundColor: '#007AFF',
                    opacity: pressed ? 0.92 : 1,
                    ...(pressed ? { transform: [{ scale: 0.99 }] } : {}),
                    ...getPressedRingStyle(pressed, 'primary'),
                  }}
                >
                  <ThemedText className="text-center text-white font-semibold text-base">
                    Create Your First Program
                  </ThemedText>
                </View>
              )}
            </Pressable>
          </>
        )}
      </ThemedView>

      <ThemedView
        lightColor="#FFFFFF"
        darkColor="#10151D"
        className="rounded-3xl border px-5 py-5 mb-5"
        style={{
          borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8',
        }}
      >
        <View className="flex-row items-center justify-between">
          <ThemedText className="text-xs uppercase tracking-[1.1px] text-gray-500 dark:text-gray-400">
            Performance Snapshot
          </ThemedText>
          <View
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: theme === 'dark' ? '#007AFF1F' : '#EAF3FF' }}
          >
            <ThemedText className="text-xs font-semibold" style={{ color: '#007AFF' }}>
              LIVE
            </ThemedText>
          </View>
        </View>

        <View className="flex-row items-center justify-between mt-4">
          <View className="flex-1 items-center">
            <ThemedText className="text-3xl font-bold text-center">{stats.totalWorkouts}</ThemedText>
            <ThemedText className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              Total
            </ThemedText>
          </View>
          <View className="h-12 w-px bg-gray-200 dark:bg-gray-700" />
          <View className="flex-1 items-center">
            <ThemedText className="text-3xl font-bold text-center">{stats.thisWeek}</ThemedText>
            <ThemedText
              numberOfLines={1}
              className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center"
            >
              {'This\u00A0Week'}
            </ThemedText>
          </View>
          <View className="h-12 w-px bg-gray-200 dark:bg-gray-700" />
          <View className="flex-1 items-center">
            <ThemedText className="text-3xl font-bold text-center">{stats.streak}</ThemedText>
            <ThemedText className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              Streak
            </ThemedText>
          </View>
        </View>
      </ThemedView>

      {recentWorkouts.length > 0 && (
        <ThemedView
          lightColor="#FFFFFF"
          darkColor="#10151D"
          className="rounded-3xl border px-5 py-5 gap-4 mb-5"
          style={{
            borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8',
          }}
        >
          <View className="flex-row items-center justify-between">
            <ThemedText type="subtitle">Recent Activity</ThemedText>
            <Pressable
              onPress={() => router.push('/(tabs)/History')}
              accessibilityRole="button"
              accessibilityLabel="View all workout history"
            >
              {({ pressed }) => (
                <View
                  className="rounded-full px-3 py-1"
                  style={{
                    backgroundColor: theme === 'dark' ? '#2F2745' : '#F2EEFF',
                    opacity: pressed ? 0.8 : 1,
                    ...getPressedRingStyle(pressed, 'indigo'),
                  }}
                >
                  <ThemedText className="text-sm font-semibold" style={{ color: '#6F59C9' }}>
                    View all
                  </ThemedText>
                </View>
              )}
            </Pressable>
          </View>

          <View className="gap-2">
            {recentWorkouts.map((workout) => (
              <View
                key={workout.id}
                className="flex-row items-center justify-between py-2.5 border-b"
                style={{ borderColor: theme === 'dark' ? '#1B2430' : '#EDF1F5' }}
              >
                <View className="flex-1 pr-3">
                  <ThemedText className="font-medium" numberOfLines={1}>
                    {workout.programName} - Day {workout.dayNumber}
                  </ThemedText>
                  <ThemedText className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {workout.exercises.length} exercises
                  </ThemedText>
                </View>
                <ThemedText className="text-xs" style={{ color: '#7A8798' }}>
                  {formatRelativeDate(workout.date)}
                </ThemedText>
              </View>
            ))}
          </View>
        </ThemedView>
      )}

      <ThemedView
        lightColor="#FFFFFF"
        darkColor="#10151D"
        className="rounded-3xl border px-5 py-5 gap-4 mb-2"
        style={{
          borderColor: theme === 'dark' ? '#2A3543' : '#D6DEE8',
        }}
      >
        <ThemedText type="subtitle">Program</ThemedText>
        {currentProgram ? (
          <Pressable
            onPress={() => router.push('/(tabs)/Programs')}
            accessibilityRole="button"
            accessibilityLabel="Open programs"
          >
            {({ pressed }) => (
              <View
                className="flex-row items-center justify-between rounded-2xl p-4"
                style={{
                  borderColor: pressed ? '#4DA2FF' : theme === 'dark' ? '#2A3543' : '#D6DEE8',
                  borderWidth: pressed ? 2 : 1,
                  opacity: pressed ? 0.8 : 1,
                  shadowColor: '#4DA2FF',
                  shadowOpacity: pressed ? 0.35 : 0,
                  shadowRadius: pressed ? 10 : 0,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: pressed ? 2 : 0,
                }}
              >
                <View className="flex-1 pr-3">
                  <ThemedText className="font-semibold text-base">{currentProgram.name}</ThemedText>
                  <ThemedText className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {currentProgram.workoutDays.length} day
                    {currentProgram.workoutDays.length !== 1 ? 's' : ''} â€¢{' '}
                    {currentProgram.workoutDays.reduce((sum, day) => sum + day.exercises.length, 0)} exercises
                  </ThemedText>
                </View>
                <ThemedText className="text-lg" style={{ color: '#007AFF' }}>
                  {'>'}
                </ThemedText>
              </View>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/(tabs)/Programs')}
            accessibilityRole="button"
            accessibilityLabel="Create your first program"
          >
            {({ pressed }) => (
              <View
                className="rounded-full py-3 px-4 self-start"
                style={{
                  backgroundColor: theme === 'dark' ? '#007AFF1F' : '#EAF3FF',
                  opacity: pressed ? 0.8 : 1,
                  ...getPressedRingStyle(pressed, 'primary'),
                }}
              >
                <ThemedText className="text-sm font-semibold" style={{ color: '#007AFF' }}>
                  Create your first program
                </ThemedText>
              </View>
            )}
          </Pressable>
        )}
      </ThemedView>
    </ParallaxScrollView>
  );
}

