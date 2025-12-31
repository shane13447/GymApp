import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { cn } from '@/lib/utils';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  className?: string;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  className,
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      className={cn(
        type === 'default' && 'text-base leading-6',
        type === 'defaultSemiBold' && 'text-base leading-6 font-semibold',
        type === 'title' && 'text-3xl font-bold leading-8',
        type === 'subtitle' && 'text-xl font-bold',
        type === 'link' && 'text-base leading-8 text-blue-600',
        className
      )}
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
});
