/**
 * Root Layout
 * Main application layout with theme provider and error boundary
 */

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import '../global.css';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as db from '@/services/database';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // =============================================================================
  // STARTUP MAINTENANCE: Run deferred after shell mount
  // =============================================================================
// Deferred maintenance handles seed reconciliation + cleanup on launch
  useEffect(() => {
    const runStartupMaintenance = async () => {
      try {
        await db.runDeferredDatabaseMaintenance();
      } catch (error) {
        // Non-critical - keep shell/navigation available even if maintenance fails
        console.error('Error running deferred startup maintenance:', error);
      }
    };

    runStartupMaintenance();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal', title: 'Modal' }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
