import { Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { cn } from '@/lib/utils';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  className?: string;
};

/**
 * Themed Text component that resolves its text color from the active color
 * scheme (with optional per-scheme overrides) and applies a typography preset.
 *
 * @param {ThemedTextProps} props - Text props plus optional light/dark color overrides, a `type` preset, and `className`.
 * @returns {React.ReactElement} The themed Text element.
 */
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
        type === 'title' && 'text-4xl font-bold leading-[42px] tracking-tight',
        type === 'subtitle' && 'text-xl font-bold leading-7',
        type === 'link' && 'text-base font-semibold leading-6 text-blue-600 dark:text-blue-400',
        className
      )}
      style={[{ color }, style]}
      {...rest}
    />
  );
}
