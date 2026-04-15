/**
 * Root Layout
 * Main application layout with theme provider and error boundary
 */

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import '../global.css';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as db from '@/services/database';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await db.getDatabase();
      } catch (error) {
        console.error('Database initialization failed:', error);
      } finally {
        setDbReady(true);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (!dbReady) return;

    const runStartupMaintenance = async () => {
      try {
        await db.runDeferredDatabaseMaintenance();
      } catch (error) {
        console.error('Error running deferred startup maintenance:', error);
      }
    };

    runStartupMaintenance();
  }, [dbReady]);

  useEffect(() => {
    if (dbReady) {
      SplashScreen.hideAsync();
    }
  }, [dbReady]);

  if (!dbReady) {
    return null;
  }

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
