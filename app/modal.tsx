/**
 * Modal Screen
 * Example modal screen
 */

import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Modal</ThemedText>
      <ThemedText style={styles.description}>
        This is an example modal screen. You can use modals for forms, 
        confirmations, or displaying detailed information.
      </ThemedText>
      <Link href="/" dismissTo asChild>
        <Pressable style={styles.link} accessibilityRole="button">
          {({ pressed }) => (
            <View style={[styles.button, pressed && styles.buttonPressed]}>
              <ThemedText style={styles.buttonText}>Go to Home</ThemedText>
            </View>
          )}
        </Pressable>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  description: {
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    opacity: 0.7,
    maxWidth: 300,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
