import RNSlider from '@react-native-community/slider';
import { Platform } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

function Slider({
  thumbTintColor,
  minimumTrackTintColor,
  maximumTrackTintColor,
  ...props
}: React.ComponentProps<typeof RNSlider>) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  return (
    <RNSlider
      thumbTintColor={(thumbTintColor ?? Platform.OS === 'ios') ? '#FFFFFF' : colors.primary}
      minimumTrackTintColor={minimumTrackTintColor ?? colors.primary}
      maximumTrackTintColor={
        (maximumTrackTintColor ?? Platform.OS === 'android') ? colors.primary : undefined
      }
      minimumValue={0}
      maximumValue={1}
      {...props}
    />
  );
}

export { Slider };
