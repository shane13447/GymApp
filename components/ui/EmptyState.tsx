/**
 * Empty State Component
 * Shows a message when there's no data to display
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const colorScheme = useColorScheme() ?? 'light';

  return (
    <ThemedView className="items-center py-8 px-4">
      {icon && (
        <IconSymbol
          name={icon as any}
          size={48}
          color={Colors[colorScheme].icon}
          style={{ marginBottom: 16, opacity: 0.5 }}
        />
      )}
      <ThemedText className="text-xl font-semibold text-center mb-2">
        {title}
      </ThemedText>
      <ThemedText className="text-gray-500 dark:text-gray-400 text-center mb-6">
        {message}
      </ThemedText>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          {({ pressed }) => (
            <View
              className={`bg-blue-500 px-6 py-3 rounded-lg ${
                pressed ? 'opacity-80' : ''
              }`}
            >
              <ThemedText className="text-white font-semibold">
                {actionLabel}
              </ThemedText>
            </View>
          )}
        </Pressable>
      )}
    </ThemedView>
  );
}

export default EmptyState;
