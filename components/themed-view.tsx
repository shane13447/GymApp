import type { ReactElement } from 'react';
import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { cn } from '@/lib/utils';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  className?: string;
};

/**
 * Themed View component that resolves its background color from the active
 * color scheme, with optional per-scheme overrides.
 *
 * @param {ThemedViewProps} props - View props plus optional light/dark color overrides and `className`.
 * @returns {ReactElement} The themed View element.
 */
export function ThemedView({
  style,
  lightColor,
  darkColor,
  className,
  ...otherProps
}: ThemedViewProps): ReactElement {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <View className={cn(className)} style={[{ backgroundColor }, style]} {...otherProps} />;
}
