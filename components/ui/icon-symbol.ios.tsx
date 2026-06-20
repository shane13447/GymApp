import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

/**
 * iOS icon component that renders a native SF Symbol at the given size, color,
 * and weight.
 *
 * @param {{ name: SymbolViewProps['name']; size?: number; color: string; style?: StyleProp<ViewStyle>; weight?: SymbolWeight }} props - The symbol name, optional size/weight/style, and tint color.
 * @returns {React.ReactElement} The native SF Symbol view.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
