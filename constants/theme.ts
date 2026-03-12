/**
 * Theme constants
 * Colors and fonts used throughout the app
 */

import { Platform } from 'react-native';

// =============================================================================
// COLORS
// =============================================================================

const tintColorLight = '#007AFF';
const tintColorDark = '#007AFF';

export const Palette = {
  blue: {
    50: '#EAF3FF',
    100: '#D6E9FF',
    200: '#B7D7FF',
    300: '#8FC2FF',
    400: '#5EA6FF',
    500: '#007AFF',
    600: '#0068D9',
    700: '#0055B2',
    800: '#00418A',
    900: '#002D61',
  },
  amber: {
    50: '#FFF8EA',
    100: '#FFEDCC',
    200: '#FFDCA0',
    300: '#FFC971',
    400: '#FFBA47',
    500: '#FFB020',
    600: '#E69900',
    700: '#BF7F00',
    800: '#966400',
    900: '#664400',
  },
  neutral: {
    950: '#0A0D12',
    900: '#10151D',
    800: '#1B2430',
    700: '#2A3543',
    600: '#3A4656',
    500: '#596679',
    400: '#7A8798',
    300: '#A0AAB7',
    200: '#C3CAD3',
    100: '#E3E7EC',
    50: '#F5F7FA',
  },
} as const;

export const ColorTokens = {
  primary: {
    base: '#007AFF',
    hover: '#1A89FF',
    pressed: '#0068D9',
    bgDark: '#007AFF1F',
    bgLight: '#EAF3FF',
    subtleBorderDark: '#007AFF66',
    subtleBorderLight: '#B7D7FF',
    focusRing: '#4DA2FF',
    onSolid: '#FFFFFF',
  },
  secondary: {
    base: '#FFB020',
    hover: '#FFC04A',
    pressed: '#E69900',
    bgDark: '#FFB02024',
    bgLight: '#FFF8EA',
    subtleBorderDark: '#FFB02066',
    subtleBorderLight: '#FFDCA0',
    focusRing: '#FFCA70',
    onSolid: '#1F1400',
  },
} as const;

export const Colors = {
  light: {
    text: '#11181C',
    background: '#F5F7FA',
    tint: tintColorLight,
    icon: '#596679',
    tabIconDefault: '#7A8798',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    border: '#D6DEE8',
    primary: '#007AFF',
    secondary: '#FFB020',
    success: '#34C759',
    warning: '#F59E0B',
    error: '#FF3B30',
    muted: '#8E8E93',
  },
  dark: {
    text: '#E3E7EC',
    background: '#0A0D12',
    tint: tintColorDark,
    icon: '#A0AAB7',
    tabIconDefault: '#7A8798',
    tabIconSelected: tintColorDark,
    card: '#10151D',
    border: '#2A3543',
    primary: '#007AFF',
    secondary: '#FFB020',
    success: '#30D158',
    warning: '#F59E0B',
    error: '#FF453A',
    muted: '#8E8E93',
  },
};

// =============================================================================
// FONTS
// =============================================================================

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// =============================================================================
// SPACING
// =============================================================================

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};
