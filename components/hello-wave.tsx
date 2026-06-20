import Animated from 'react-native-reanimated';

/**
 * Animated waving-hand emoji that rotates back and forth a few times.
 *
 * @returns {React.ReactElement} The animated wave element.
 */
export function HelloWave() {
  return (
    <Animated.Text
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      👋
    </Animated.Text>
  );
}
