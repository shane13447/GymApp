/**
 * Loading Spinner Component
 */

import React from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'large';
  fullScreen?: boolean;
  style?: ViewStyle;
}

export function LoadingSpinner({
  message,
  size = 'large',
  fullScreen = false,
  style,
}: LoadingSpinnerProps): React.JSX.Element {
  const content = (
    <View className="items-center gap-3" style={style}>
      <ActivityIndicator size={size} />
      {message && (
        <ThemedText className="text-gray-500 dark:text-gray-400">
          {message}
        </ThemedText>
      )}
    </View>
  );

  if (fullScreen) {
    return (
      <ThemedView className="flex-1 items-center justify-center">
        {content}
      </ThemedView>
    );
  }

  return content;
}

export default LoadingSpinner;
