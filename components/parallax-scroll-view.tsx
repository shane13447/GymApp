/**
 * Parallax Scroll View Component
 * Main scrollable container for screens
 */

import type { PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = PropsWithChildren<{
  refreshControl?: ReactElement;
  style?: ViewStyle;
}>;

export default function ParallaxScrollView({ children, refreshControl, style }: Props) {
  const backgroundColor = useThemeColor({}, 'background');
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={[{ backgroundColor, flex: 1 }, style]}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    >
      <ThemedView style={styles.content}>{children}</ThemedView>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: 32,
    paddingTop: 48,
    gap: 16,
    overflow: 'hidden',
  },
});
