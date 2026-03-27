import { View } from 'react-native';
import SliderComponent from '@miblanchard/react-native-slider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

// The slider package exports the component as default
// Cast to any to bypass JSX type incompatibility with React 19
const RNCSlider: any = SliderComponent;

export function ThemedSlider({
  value,
  minimumValue = 0,
  maximumValue = 1,
  step,
  onValueChange,
}: {
  value: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  onValueChange?: (value: number) => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View className="flex-1">
      <RNCSlider
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
      />
    </View>
  );
}
