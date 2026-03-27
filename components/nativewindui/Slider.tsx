import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RNSlider = require('@miblanchard/react-native-slider');

type SliderProps = {
  value?: number | number[];
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  onValueChange?: (value: number | number[]) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  trackStyle?: object;
  thumbStyle?: object;
  containerStyle?: object;
  [key: string]: unknown;
};

const BaseSlider = RNSlider.default || RNSlider;

export const Slider = BaseSlider as React.ComponentType<SliderProps>;

export function ThemedSlider({
  value,
  minimumValue = 0,
  maximumValue = 1,
  step,
  onValueChange,
  ...props
}: {
  value: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  thumbTintColor?: string;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <BaseSlider
      value={value}
      minimumValue={minimumValue}
      maximumValue={maximumValue}
      step={step}
      onValueChange={(val: number | number[]) => onValueChange?.(Array.isArray(val) ? val[0] : val)}
      minimumTrackTintColor={colors.primary}
      maximumTrackTintColor={colors.border}
      thumbTintColor={colors.primary}
      trackStyle={{
        height: 4,
        borderRadius: 2,
      }}
      thumbStyle={{
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.primary,
      }}
      {...props}
    />
  );
}
