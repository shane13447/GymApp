/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree.
 *
 * Also registers a global handler for unhandled promise rejections
 * so async errors (useEffect, event handlers) are captured.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const MAX_RETRIES = 3;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidMount(): void {
    const originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      console.error('Global error caught by ErrorBoundary:', error, { isFatal });
      this.setState((prev) => ({
        hasError: true,
        error,
        retryCount: prev.retryCount,
      }));
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);
  }

  handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  render(): ReactNode {
    const { hasError, error, retryCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      const canRetry = retryCount < MAX_RETRIES;

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>
              Oops! Something went wrong
            </Text>
            <Text style={styles.message}>
              {canRetry
                ? "We're sorry, but something unexpected happened. Please try again."
                : 'The app encountered a persistent error. You may need to restart the app or clear its data.'}
            </Text>
            {__DEV__ && error && (
              <View style={styles.errorDetails}>
                <Text style={styles.errorTitle}>Error Details:</Text>
                <Text style={styles.errorMessage}>{error.message}</Text>
              </View>
            )}
            {canRetry && (
              <Pressable onPress={this.handleRetry} style={styles.button} accessibilityRole="button">
                {({ pressed }) => (
                  <View
                    style={[
                      styles.buttonInner,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text style={styles.buttonText}>Try Again ({MAX_RETRIES - retryCount} left)</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        </View>
      );
    }

    return children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#000',
  },
  message: {
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 16,
    color: '#555',
  },
  errorDetails: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  errorTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#c62828',
  },
  errorMessage: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#c62828',
  },
  button: {
    minWidth: 150,
  },
  buttonInner: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ErrorBoundary;
