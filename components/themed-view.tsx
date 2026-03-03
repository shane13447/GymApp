import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { cn } from '@/lib/utils';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  className?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  className,
  ...otherProps
}: ThemedViewProps): JSX.Element {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <View className={cn(className)} style={[{ backgroundColor }, style]} {...otherProps} />;
}
