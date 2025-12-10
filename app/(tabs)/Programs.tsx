import { Pressable, StyleSheet, View } from 'react-native';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {
  return (
    <ParallaxScrollView>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>
      
      <ThemedView className="mt-5 items-center">
        <Pressable 
          onPress={() => {
            // Add your button action here
            console.log('Button pressed!');
          }}
        >
          {({ pressed }) => (
            <View 
              className="bg-blue-500 px-6 py-16 rounded-lg min-w-[150px] min-h-[70px]"
              style={{
                borderWidth: 2,
                borderColor: '#FFFFFF',
                borderRadius: 8,
                opacity: pressed ? 0.7 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 70,
                paddingVertical: 16,
              }}
            >
              <ThemedText 
                type="defaultSemiBold" 
                className="text-white"
                style={{ fontSize: 28, textAlign: 'center', lineHeight: 34 }}
              >
                Add a Program
              </ThemedText>
            </View>
          )}
        </Pressable>
      </ThemedView>
      
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
});
