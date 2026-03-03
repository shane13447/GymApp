import { ActivityIndicator as RNActivityIndicator } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function ActivityIndicator(props: React.ComponentProps<typeof RNActivityIndicator>) {
  const colorScheme = useColorScheme() ?? 'light';
  return <RNActivityIndicator color={Colors[colorScheme].primary} {...props} />;
}

export { ActivityIndicator };
