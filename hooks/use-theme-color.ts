/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Resolve a theme color, preferring an explicit per-scheme prop override and
 * falling back to the named color from the active (light/dark) theme palette.
 *
 * @param {{ light?: string; dark?: string }} props - Optional per-scheme color overrides.
 * @param {keyof typeof Colors.light & keyof typeof Colors.dark} colorName - The palette color key to resolve.
 * @returns {string} The resolved color string for the current color scheme.
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
): string {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  return colorFromProps ?? Colors[theme][colorName];
}
