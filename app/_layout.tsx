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
  // ORPHANED TIMER CLEANUP: Run on app startup
  // =============================================================================
  // BUG FIX DOCUMENTATION (2026-03-27):
  //
  // Problem: The original implementation fired an async cleanup function without
  // awaiting database initialization. On fresh installs where seeding occurs during
  // getDatabase(), this caused a race condition where cleanupOrphanedTimers() ran
  // against an uninitialized database, resulting in the app failing to load properly.
  //
  // Root cause: The useEffect invoked cleanupTimers() as fire-and-forget:
  //   cleanupTimers();  // ← No await, runs during initial render before DB ready
  //
  // Fix: Database initialization happens at module load via getDatabase() in
  // initializeDatabase(). The cleanup now runs only after DB is confirmed ready.
  // The actual fix is in the parent - this useEffect is DEPRECATED and should not
  // be used for critical initialization. Database operations should use the
  // getDatabase() promise chain instead.
  //
  // Related anti-pattern: seeder (seedTestProgramsIfMissing) runs DURING
  // initializeDatabase(), which can fail on schema migrations. If seeding fails,
  // the app could stall. Future improvement: Move seeding to lazy-load or
  // separate initialization phase.
  //
  // Problem: If the app is force-killed mid-workout, timer records remain in the
  // database. When the user reopens the app, these stale timers could cause issues.
  // Solution: Clean up expired/orphaned timers on every app launch.
  useEffect(() => {
    const cleanupTimers = async () => {
      try {
        // BUGFIX: Ensure database is ready before attempting cleanup.
        // This await guarantees DB initialization + seeding complete first.
        await db.getDatabase();
        
        const deletedCount = await db.cleanupOrphanedTimers();
        if (deletedCount > 0) {
          console.log(`Cleaned up ${deletedCount} orphaned timer record(s)`);
        }
      } catch (error) {
        // Non-critical - just log and continue
        console.error('Error cleaning up orphaned timers:', error);
      }
    };
    
    cleanupTimers();
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
